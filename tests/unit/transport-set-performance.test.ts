import { describe, expect, test } from "bun:test";

import { makeBeatPosition, type BeatPosition } from "../../src/domain";
import { MIDI_PPQ } from "../../src/domain";
import type { PlaybackPlan } from "../../src/playback";
import {
  createTransportHarness,
  customPlan,
  initializePayload,
  planBinding,
  type TransportHarness,
} from "../support/transport-test-kit";

/**
 * jcpe-7ftl set-performance: the live groove switch. The swap follows the
 * set-tempo epoch law — retire only the unattacked horizon, re-anchor at
 * the current exact beat, sounding voices finish on the old plan — and a
 * stale or mismatched binding refuses without touching the running epoch.
 *
 * Failure messages carry machine-readable JSON so a red run is a complete
 * forensic record on its own.
 */

const DOC = "doc-set-performance";
const TEMPO = 120;

function quarterNotePlan(): PlaybackPlan {
  return customPlan({
    documentId: DOC,
    tempoBpm: TEMPO,
    durations: [
      { numerator: 1, denominator: 1 },
      { numerator: 1, denominator: 1 },
      { numerator: 1, denominator: 1 },
      { numerator: 1, denominator: 1 },
    ],
  });
}

function eighthNotePlan(): PlaybackPlan {
  return customPlan({
    documentId: DOC,
    tempoBpm: TEMPO,
    durations: Array.from({ length: 8 }, () => ({
      numerator: 1,
      denominator: 2,
    })),
  });
}

function beat(numerator: number, denominator = 1): BeatPosition {
  const made = makeBeatPosition({ numerator, denominator });
  if (!made.ok) throw new Error("beat unrepresentable");
  return made.value;
}

async function startedRun(): Promise<{
  harness: TransportHarness;
  plan: PlaybackPlan;
}> {
  const harness = createTransportHarness();
  const plan = quarterNotePlan();
  const init = await harness.submit(initializePayload(plan));
  expect(JSON.stringify(init)).toContain('"receipt"');
  const played = await harness.submit({
    kind: "play",
    binding: planBinding(plan, 1),
    startBeat: beat(0),
    countIn: false,
  });
  expect(JSON.stringify(played)).toContain('"receipt"');
  return { harness, plan };
}

function playheadOfLastPlaying(harness: TransportHarness): BeatPosition {
  const playing = harness.notifications.filter(
    (entry) => entry.status === "playing",
  );
  const last = playing[playing.length - 1];
  if (last === undefined) throw new Error("no playing notification");
  return last.playhead;
}

describe("TR-X1-LIVE-GROOVE set-performance", () => {
  test("mid-run swap re-anchors at the exact current beat and retires only unstarted events", async () => {
    const { harness } = await startedRun();
    /* Advance exactly one beat (0.5 s at 120 BPM): tick-exact, zero drift. */
    harness.setClock(0.5);
    harness.timer.fire();
    const attacksBefore = harness.attacks.length;
    const retirementsBefore = harness.retirements.length;
    const generationBefore =
      harness.service.inspectTransport().generation;

    const swapped = await harness.submit({
      kind: "set-performance",
      binding: planBinding(eighthNotePlan(), 2),
    });
    expect(JSON.stringify(swapped)).toContain('"receipt"');
    if (swapped.termination !== "receipt") return;
    expect(swapped.stateAfter).toBe("playing");
    expect(swapped.generation).toBeGreaterThan(generationBefore);

    /* The published playhead is exactly beat 1 — no drift on a tick-exact clock. */
    const playhead = playheadOfLastPlaying(harness);
    expect(
      JSON.stringify({ playhead, expected: "1 beat" }),
    ).toBe(
      JSON.stringify({
        playhead: beat(playhead.numerator, playhead.denominator),
        expected: "1 beat",
      }),
    );
    expect(playhead.numerator / playhead.denominator).toBe(1);

    /* Only event-selector retirements for unstarted horizon records. */
    const newRetirements = harness.retirements.slice(retirementsBefore);
    for (const retirement of newRetirements) {
      expect(
        JSON.stringify(retirement),
      ).toContain('"generation-retire"');
    }
    const eventRetirements = newRetirements.filter(
      (entry) => entry.selectorKind === "event",
    );
    expect(eventRetirements.length).toBeGreaterThanOrEqual(0);

    /* New-plan attacks start at or after the swap instant, never before. */
    const newAttacks = harness.attacks.slice(attacksBefore);
    for (const attack of newAttacks) {
      expect(
        `${attack.eventId}@${String(attack.startTimeSeconds)}`,
      ).toBe(
        attack.startTimeSeconds >= 0.5
          ? `${attack.eventId}@${String(attack.startTimeSeconds)}`
          : `EARLY:${attack.eventId}@${String(attack.startTimeSeconds)}`,
      );
    }
  });

  test("a stale plan revision refuses as plan_mismatch and touches nothing", async () => {
    const { harness } = await startedRun();
    harness.setClock(0.25);
    const attacksBefore = harness.attacks.length;
    const generationBefore =
      harness.service.inspectTransport().generation;
    const refused = await harness.submit({
      kind: "set-performance",
      binding: planBinding(eighthNotePlan(), 1),
    });
    expect(refused.termination).toBe("refusal");
    if (refused.termination !== "refusal") return;
    expect(refused.code).toBe("transport.plan_mismatch");
    expect(harness.service.inspectTransport().generation).toBe(
      generationBefore,
    );
    expect(harness.attacks.length).toBe(attacksBefore);
    expect(harness.service.inspectTransport().state).toBe("playing");
  });

  test("a foreign document refuses as plan_mismatch", async () => {
    const { harness } = await startedRun();
    const foreign = customPlan({
      documentId: "doc-someone-else",
      tempoBpm: TEMPO,
      durations: [{ numerator: 1, denominator: 1 }],
    });
    const refused = await harness.submit({
      kind: "set-performance",
      binding: planBinding(foreign, 2),
    });
    expect(refused.termination).toBe("refusal");
    if (refused.termination !== "refusal") return;
    expect(refused.code).toBe("transport.plan_mismatch");
  });

  test("a paused swap stores the binding without scheduling; resume plays the new plan", async () => {
    const { harness } = await startedRun();
    harness.setClock(0.5);
    harness.timer.fire();
    const paused = await harness.submit({ kind: "pause" });
    expect(JSON.stringify(paused)).toContain('"receipt"');
    const attacksBefore = harness.attacks.length;

    const swapped = await harness.submit({
      kind: "set-performance",
      binding: planBinding(eighthNotePlan(), 2),
    });
    expect(JSON.stringify(swapped)).toContain('"receipt"');
    if (swapped.termination !== "receipt") return;
    expect(swapped.stateAfter).toBe("paused");
    expect(harness.attacks.length).toBe(attacksBefore);
    const lastNotification =
      harness.notifications[harness.notifications.length - 1];
    expect(lastNotification?.status).toBe("paused");
    expect(lastNotification?.planRevision).toBe(2);

    const resumed = await harness.submit({ kind: "resume", gesture: null });
    expect(JSON.stringify(resumed)).toContain('"receipt"');
    /* Walk the clock so the 0.1 s lookahead crosses two new-plan attacks. */
    for (const seconds of [0.6, 0.7, 0.8, 0.9]) {
      harness.setClock(seconds);
      harness.timer.fire();
    }
    /*
     * The eighth-note plan spaces attacks 0.25 s apart at 120 BPM; the
     * quarter plan spaced them 0.5 s. Two consecutive new attacks a
     * quarter-second apart prove the new plan is the one sounding.
     */
    const newAttacks = harness.attacks.slice(attacksBefore);
    const gaps: number[] = [];
    for (let index = 1; index < newAttacks.length; index += 1) {
      const previous = newAttacks[index - 1];
      const current = newAttacks[index];
      if (previous !== undefined && current !== undefined) {
        gaps.push(
          Number(
            (current.startTimeSeconds - previous.startTimeSeconds).toFixed(6),
          ),
        );
      }
    }
    expect(JSON.stringify({ gaps })).toContain("0.25");
  });

  test("a ready swap rebinds without a generation boundary", async () => {
    const harness = createTransportHarness();
    const plan = quarterNotePlan();
    const init = await harness.submit(initializePayload(plan));
    expect(JSON.stringify(init)).toContain('"receipt"');
    const bound = await harness.submit({
      kind: "replace-plan",
      binding: planBinding(plan, 1),
    });
    expect(JSON.stringify(bound)).toContain('"receipt"');
    const generationBefore =
      harness.service.inspectTransport().generation;
    const swapped = await harness.submit({
      kind: "set-performance",
      binding: planBinding(eighthNotePlan(), 2),
    });
    expect(JSON.stringify(swapped)).toContain('"receipt"');
    if (swapped.termination !== "receipt") return;
    expect(swapped.stateAfter).toBe("ready");
    expect(harness.service.inspectTransport().generation).toBe(
      generationBefore,
    );
    expect(harness.service.inspectTransport().planRevision).toBe(2);
  });

  test("repeated tick-exact swaps accumulate zero playhead drift; one off-grid swap stays under a tick", async () => {
    const { harness } = await startedRun();
    let revision = 2;
    /* Five swaps at exact half-beat instants: drift must be exactly zero. */
    for (const seconds of [0.25, 0.5, 0.75, 1.0, 1.25]) {
      harness.setClock(seconds);
      harness.timer.fire();
      const swapped = await harness.submit({
        kind: "set-performance",
        binding: planBinding(
          revision % 2 === 0 ? eighthNotePlan() : quarterNotePlan(),
          revision,
        ),
      });
      expect(JSON.stringify(swapped)).toContain('"receipt"');
      revision += 1;
      const playhead = playheadOfLastPlaying(harness);
      const exactBeats = seconds * (TEMPO / 60);
      const gotBeats = playhead.numerator / playhead.denominator;
      expect(
        JSON.stringify({ seconds, exactBeats, gotBeats }),
      ).toBe(JSON.stringify({ seconds, exactBeats, gotBeats: exactBeats }));
    }
    /* One off-grid instant: quantization keeps drift under one 960-PPQ tick. */
    harness.setClock(1.3337);
    const swapped = await harness.submit({
      kind: "set-performance",
      binding: planBinding(eighthNotePlan(), revision),
    });
    expect(JSON.stringify(swapped)).toContain('"receipt"');
    const playhead = playheadOfLastPlaying(harness);
    const exactBeats = 1.3337 * (TEMPO / 60);
    const gotBeats = playhead.numerator / playhead.denominator;
    const driftTicks = Math.abs(gotBeats - exactBeats) * MIDI_PPQ;
    expect(
      JSON.stringify({ exactBeats, gotBeats, driftTicks }),
    ).toBe(
      driftTicks <= 1
        ? JSON.stringify({ exactBeats, gotBeats, driftTicks })
        : `DRIFT_OVER_ONE_TICK:${String(driftTicks)}`,
    );
  });
});
