import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { makeBeatPosition, type BeatPosition } from "../../src/domain";
import {
  createTransportHarness,
  customPlan,
  initializePayload,
  planBinding,
  requireReceipt,
  type TransportHarness,
} from "../support/transport-test-kit";

setDefaultTimeout(240_000);

const root = resolve(import.meta.dirname, "../..");

type GoldenCase = Readonly<{
  caseId: string;
  tempoBpm: number;
  startBeat: Readonly<{ numerator: number; denominator: number }>;
  durationBeats: Readonly<{ numerator: number; denominator: number }>;
  durationTicks: number;
  gateTicks: number;
  startSeconds: number;
  durationSeconds: number;
  gateSeconds: number;
  effectiveAudioGateSeconds?: number;
}>;

async function loadGoldens(): Promise<readonly GoldenCase[]> {
  const raw = await readFile(
    resolve(root, "tests/fixtures/transport/golden-timing.json"),
    "utf8",
  );
  const fixture = JSON.parse(raw) as { cases: readonly GoldenCase[] };
  return fixture.cases;
}

const zeroBeat: BeatPosition = (() => {
  const made = makeBeatPosition({ numerator: 0, denominator: 1 });
  if (!made.ok) throw new Error("zero beat");
  return made.value;
})();

/** Fire ticks while advancing the clock until the horizon is exhausted. */
function driveUntil(
  harness: TransportHarness,
  endSeconds: number,
  stepSeconds = 0.025,
): void {
  let clock = harness.clock();
  let guard = 0;
  while (clock < endSeconds) {
    clock = Math.min(clock + stepSeconds, endSeconds);
    harness.setClock(clock);
    harness.timer.fire();
    guard += 1;
    if (guard > 100_000) throw new Error("driveUntil guard tripped");
  }
}

describe("TR-X1-EXACT-TIME / TR-LEGACY-AUDIO-03 exact transport timing", () => {
  test("X1-TIME-001..X1-TIME-012 production attacks land on the reviewed second and gate goldens at 60/120/240 BPM", async () => {
    const goldens = await loadGoldens();
    for (const tempo of [60, 120, 240]) {
      const rows = goldens.filter(
        (row) =>
          row.tempoBpm === tempo && row.effectiveAudioGateSeconds === undefined,
      );
      expect(rows).toHaveLength(4);
      const harness = createTransportHarness();
      const plan = customPlan({
        documentId: `doc-x1-time-${String(tempo)}`,
        tempoBpm: tempo,
        durations: rows.map((row) => row.durationBeats),
      });
      requireReceipt(await harness.submit(initializePayload(plan)));
      requireReceipt(
        await harness.submit({
          kind: "play",
          binding: planBinding(plan, 1),
          startBeat: zeroBeat,
          countIn: false,
        }),
      );
      driveUntil(harness, (8 * 60) / tempo);
      const progressionAttacks = harness.attacks.filter(
        (attack) => attack.ownerKind === "progression",
      );
      expect(progressionAttacks).toHaveLength(4);
      for (const [index, row] of rows.entries()) {
        const attack = progressionAttacks[index];
        expect(attack).toBeDefined();
        if (attack === undefined) continue;
        expect(attack.accepted).toBe(true);
        expect(attack.startTimeSeconds).toBe(row.startSeconds);
        expect(attack.releaseTimeSeconds - attack.startTimeSeconds).toBe(
          row.gateSeconds,
        );
      }
    }
  });

  test("X1-TIME-013/X1-TIME-014 the audio-envelope floor lengthens sub-floor gates without touching exact ticks", async () => {
    const goldens = await loadGoldens();
    const floorRows = goldens.filter(
      (row) => row.effectiveAudioGateSeconds !== undefined,
    );
    expect(floorRows).toHaveLength(2);
    for (const row of floorRows) {
      const harness = createTransportHarness();
      const plan = customPlan({
        documentId: `doc-x1-floor-${String(row.tempoBpm)}`,
        tempoBpm: row.tempoBpm,
        durations: [row.durationBeats],
      });
      const event = plan.events[0];
      expect(event).toBeDefined();
      if (event === undefined) continue;
      expect(event.durationTicks).toBe(row.durationTicks);
      expect(event.gateDurationTicks).toBe(row.gateTicks);
      requireReceipt(await harness.submit(initializePayload(plan)));
      requireReceipt(
        await harness.submit({
          kind: "play",
          binding: planBinding(plan, 1),
          startBeat: zeroBeat,
          countIn: false,
        }),
      );
      harness.timer.fire();
      const attack = harness.attacks.find(
        (candidate) => candidate.ownerKind === "progression",
      );
      expect(attack).toBeDefined();
      if (attack === undefined) continue;
      expect(attack.releaseTimeSeconds - attack.startTimeSeconds).toBe(
        row.effectiveAudioGateSeconds,
      );
    }
  });

  test("X1-SCHED-012 a tempo change carries the exact beat across epochs and retires no sounding voice", async () => {
    const harness = createTransportHarness();
    const durations = [
      { numerator: 1, denominator: 2 },
      { numerator: 1, denominator: 1 },
      { numerator: 2, denominator: 1 },
      { numerator: 4, denominator: 1 },
    ];
    const fast = customPlan({
      documentId: "doc-x1-epoch",
      tempoBpm: 120,
      durations,
    });
    const slow = customPlan({
      documentId: "doc-x1-epoch",
      tempoBpm: 60,
      durations,
    });
    requireReceipt(await harness.submit(initializePayload(fast)));
    requireReceipt(
      await harness.submit({
        kind: "play",
        binding: planBinding(fast, 1),
        startBeat: zeroBeat,
        countIn: false,
      }),
    );
    driveUntil(harness, 0.75);
    const attacksBefore = harness.attacks.filter(
      (attack) => attack.ownerKind === "progression" && attack.accepted,
    ).length;
    const retirementsBefore = harness.retirements.length;
    requireReceipt(
      await harness.submit({
        kind: "set-tempo",
        binding: planBinding(slow, 2),
      }),
    );
    const snapshot = harness.service.inspectTransport();
    expect(snapshot.state).toBe("playing");
    expect(snapshot.planRevision).toBe(2);

    const playing = harness.notifications.at(-1);
    expect(playing?.status).toBe("playing");
    expect(playing?.playhead).toEqual(
      (() => {
        const made = makeBeatPosition({ numerator: 3, denominator: 2 });
        if (!made.ok) throw new Error("beat 3/2");
        return made.value;
      })(),
    );

    const horizonRetirements = harness.retirements.slice(retirementsBefore);
    for (const retirement of horizonRetirements) {
      expect(retirement.selectorKind).toBe("event");
      expect(retirement.reason).toBe("generation-retire");
    }

    driveUntil(harness, 0.75 + 6.5);
    const finalAttacks = harness.attacks.filter(
      (attack) => attack.ownerKind === "progression" && attack.accepted,
    );
    const lastAttack = finalAttacks.at(-1);
    expect(lastAttack).toBeDefined();
    expect(lastAttack?.startTimeSeconds).toBe(0.75 + (3.5 - 1.5) * 1);
    expect(finalAttacks.length).toBeGreaterThanOrEqual(attacksBefore + 1);
  });
});
