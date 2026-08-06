import { describe, expect, setDefaultTimeout, test } from "bun:test";

import {
  makeBeatPosition,
  makeMidiPitch,
  type BeatPosition,
} from "../../src/domain";
import {
  createTransportHarness,
  customPlan,
  initializePayload,
  planBinding,
  requireReceipt,
  requireRefusal,
} from "../support/transport-test-kit";

setDefaultTimeout(240_000);

const zeroBeat: BeatPosition = (() => {
  const made = makeBeatPosition({ numerator: 0, denominator: 1 });
  if (!made.ok) throw new Error("zero beat");
  return made.value;
})();

describe("TR-X1-INSTRUMENT / TR-LEGACY-AUDIO-04 serialized instrument changes", () => {
  test("physical instruments carry one immutable compiled gesture per sounding voice", async () => {
    const harness = createTransportHarness();
    const plan = customPlan({
      documentId: "doc-x1-physical-gesture",
      tempoBpm: 120,
      durations: [{ numerator: 1, denominator: 1 }],
    });
    requireReceipt(await harness.submit(initializePayload(plan)));
    requireReceipt(
      await harness.submit({ kind: "set-instrument", instrumentId: "flute" }),
    );
    const midiPitch = makeMidiPitch(60);
    if (!midiPitch.ok) throw new Error("PHYSICAL_TEST_MIDI");
    const prepared = await harness.engine.prepareRenderedAudioVoices({
      instrumentId: "flute",
      notes: [{ midiPitch: midiPitch.value, velocity: 96 }],
    });
    if (!prepared.ok) throw new Error(`PHYSICAL_PREPARE:${prepared.refusal.code}`);

    requireReceipt(
      await harness.submit({
        kind: "play",
        binding: planBinding(plan, 1),
        startBeat: zeroBeat,
        countIn: false,
      }),
    );
    const attack = harness.attacks.find(
      ({ ownerKind }) => ownerKind === "progression",
    );
    expect(attack?.accepted).toBe(true);
    expect(attack?.physicalGestureCount).toBe(attack?.voiceCount);
    expect(attack?.physicalGestureCount).toBeGreaterThan(0);
  });

  test("a stopped physical run can restart under a different physical family", async () => {
    const harness = createTransportHarness();
    const plan = customPlan({
      documentId: "doc-x1-physical-family-restart",
      tempoBpm: 105,
      durations: [{ numerator: 1, denominator: 1 }],
    });
    requireReceipt(await harness.submit(initializePayload(plan)));
    requireReceipt(
      await harness.submit({ kind: "set-instrument", instrumentId: "flute" }),
    );
    requireReceipt(
      await harness.submit({
        kind: "play",
        binding: planBinding(plan, 1),
        startBeat: zeroBeat,
        countIn: false,
      }),
    );
    requireReceipt(await harness.submit({ kind: "stop" }));
    requireReceipt(
      await harness.submit({ kind: "set-instrument", instrumentId: "clarinet" }),
    );
    const restarted = await harness.submit({
      kind: "play",
      binding: planBinding(plan, 1),
      startBeat: zeroBeat,
      countIn: false,
    });
    if (restarted.termination === "refusal") {
      const debug = harness.engine.inspectAudioEngine().debugEvents.at(-1);
      throw new Error(
        `PHYSICAL_RESTART_REFUSED:${String(restarted.engineRefusalCode)}:${String(debug?.detailCode)}`,
      );
    }
    expect(harness.attacks.at(-1)?.instrumentId).toBe("clarinet");
    expect(harness.attacks.at(-1)?.accepted).toBe(true);
  });

  test("X1-CMD-012 only the five exact domain instrument IDs are accepted", async () => {
    const harness = createTransportHarness();
    const plan = customPlan({
      documentId: "doc-x1-instr-012",
      tempoBpm: 120,
      durations: [{ numerator: 4, denominator: 1 }],
    });
    requireReceipt(await harness.submit(initializePayload(plan)));
    for (const hostile of ["sampled-grand-piano", "Vibraphone", ""]) {
      const outcome = requireRefusal(
        await harness.service.submitTransportCommand({
          commandRequestId: harness.nextRequestId(),
          payload: {
            kind: "set-instrument",
            instrumentId: hostile as never,
          },
        }),
      );
      expect(outcome.code).toBe("transport.instrument_unknown");
    }
    const accepted = requireReceipt(
      await harness.submit({
        kind: "set-instrument",
        instrumentId: "analog-poly",
      }),
    );
    expect(accepted.stateAfter).toBe("ready");
    expect(harness.service.inspectTransport().instrumentId).toBe(
      "analog-poly",
    );
  });

  test("X1-SCHED-006 a playing instrument change reschedules only the unattacked horizon at original exact times", async () => {
    const harness = createTransportHarness();
    const plan = customPlan({
      documentId: "doc-x1-instr-006",
      tempoBpm: 240,
      durations: [
        { numerator: 1, denominator: 8 },
        { numerator: 1, denominator: 8 },
        { numerator: 1, denominator: 8 },
      ],
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
    const initialAttacks = harness.attacks.filter(
      (attack) => attack.ownerKind === "progression" && attack.accepted,
    );
    expect(initialAttacks).toHaveLength(3);
    expect(initialAttacks.every((a) => a.instrumentId === "mellow-keys")).toBe(
      true,
    );

    harness.setClock(0.01);
    const reschedulesBefore =
      harness.service.inspectTransport().work.horizonReschedules;
    requireReceipt(
      await harness.submit({
        kind: "set-instrument",
        instrumentId: "warm-pad",
      }),
    );
    const snapshot = harness.service.inspectTransport();
    expect(snapshot.work.horizonReschedules).toBe(reschedulesBefore + 1);

    const reissued = harness.attacks
      .filter(
        (attack) =>
          attack.ownerKind === "progression" &&
          attack.accepted &&
          attack.instrumentId === "warm-pad",
      )
      .map((attack) => attack.startTimeSeconds);
    expect(reissued).toEqual([0.03125, 0.0625]);

    const eventRetirements = harness.retirements.filter(
      (retirement) => retirement.selectorKind === "event",
    );
    expect(eventRetirements).toHaveLength(2);
    for (const retirement of eventRetirements) {
      expect(retirement.reason).toBe("generation-retire");
    }
    expect(snapshot.state).toBe("playing");
  });

  test("a paused instrument change applies to the next resume without touching the engine", async () => {
    const harness = createTransportHarness();
    const plan = customPlan({
      documentId: "doc-x1-instr-paused",
      tempoBpm: 120,
      durations: [
        { numerator: 4, denominator: 1 },
        { numerator: 4, denominator: 1 },
      ],
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
    requireReceipt(await harness.submit({ kind: "pause" }));
    const attacksBefore = harness.attacks.length;
    const retirementsBefore = harness.retirements.length;
    requireReceipt(
      await harness.submit({
        kind: "set-instrument",
        instrumentId: "fm-electric-piano",
      }),
    );
    expect(harness.attacks.length).toBe(attacksBefore);
    expect(harness.retirements.length).toBe(retirementsBefore);

    harness.setClock(10);
    requireReceipt(await harness.submit({ kind: "resume", gesture: null }));
    const resumed = harness.attacks
      .filter((attack) => attack.ownerKind === "progression")
      .at(-1);
    expect(resumed?.instrumentId).toBe("fm-electric-piano");
  });
});
