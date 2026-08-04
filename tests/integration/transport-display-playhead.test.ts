import { describe, expect, test } from "bun:test";

import { makeBeatPosition, type BeatPosition } from "../../src/domain";
import {
  createTransportHarness,
  customPlan,
  initializePayload,
  planBinding,
  requireReceipt,
} from "../support/transport-test-kit";

/**
 * jcpe-v31p regression: the chart highlight froze on the first chord because
 * nothing between notifications could tell the UI where the playhead was.
 * `readDisplayPlayheadBeat` is that feed. These tests pin its laws: it tracks
 * the audio clock exactly while playing, is quantized to 960 PPQ, clamps at
 * the plan ceiling, is a pure read, and returns the committed paused/run beat
 * outside `playing`.
 */

const zeroBeat: BeatPosition = (() => {
  const made = makeBeatPosition({ numerator: 0, denominator: 1 });
  if (!made.ok) throw new Error("zero beat");
  return made.value;
})();

function beatNumber(beat: BeatPosition): number {
  return beat.numerator / beat.denominator;
}

const FOUR_QUARTER_DURATIONS = [
  { numerator: 1, denominator: 1 },
  { numerator: 1, denominator: 1 },
  { numerator: 1, denominator: 1 },
  { numerator: 1, denominator: 1 },
] as const;

describe("jcpe-v31p display playhead read", () => {
  test("before initialization the read reports beat zero and mutates nothing", () => {
    const harness = createTransportHarness();
    expect(beatNumber(harness.service.readDisplayPlayheadBeat())).toBe(0);
    expect(harness.notifications).toHaveLength(0);
    expect(harness.service.inspectTransport().state).toBe("locked");
  });

  test("while playing at 120 BPM the read advances with the audio clock, quantized to 960 PPQ", async () => {
    const harness = createTransportHarness();
    const plan = customPlan({
      documentId: "doc-display-playhead",
      tempoBpm: 120,
      durations: FOUR_QUARTER_DURATIONS,
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
    /* 120 BPM = 2 beats per second against the anchor captured at admission. */
    harness.setClock(0.5);
    expect(beatNumber(harness.service.readDisplayPlayheadBeat())).toBe(1);
    harness.setClock(1.25);
    expect(beatNumber(harness.service.readDisplayPlayheadBeat())).toBe(2.5);
    /* An off-grid clock still reads as an exact whole number of PPQ ticks. */
    harness.setClock(1.2503);
    const nudged = harness.service.readDisplayPlayheadBeat();
    expect(Number.isInteger((nudged.numerator * 960) / nudged.denominator)).toBe(
      true,
    );
  });

  test("the read is pure: repeated reads at one clock are identical and publish nothing", async () => {
    const harness = createTransportHarness();
    const plan = customPlan({
      documentId: "doc-display-pure",
      tempoBpm: 120,
      durations: FOUR_QUARTER_DURATIONS,
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
    harness.setClock(0.75);
    const before = harness.service.inspectTransport();
    const notificationsBefore = harness.notifications.length;
    const first = harness.service.readDisplayPlayheadBeat();
    const second = harness.service.readDisplayPlayheadBeat();
    expect(second).toEqual(first);
    const after = harness.service.inspectTransport();
    expect(harness.notifications.length).toBe(notificationsBefore);
    expect(after.work).toEqual(before.work);
    expect(after.state).toBe(before.state);
    expect(after.generation).toBe(before.generation);
  });

  test("the read clamps at the plan's total beats instead of running past the chart", async () => {
    const harness = createTransportHarness();
    const plan = customPlan({
      documentId: "doc-display-clamp",
      tempoBpm: 120,
      durations: FOUR_QUARTER_DURATIONS,
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
    harness.setClock(60);
    expect(beatNumber(harness.service.readDisplayPlayheadBeat())).toBe(
      beatNumber(plan.totalBeats),
    );
  });

  test("after Stop the read returns to the run start beat", async () => {
    const harness = createTransportHarness();
    const plan = customPlan({
      documentId: "doc-display-stop",
      tempoBpm: 120,
      durations: FOUR_QUARTER_DURATIONS,
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
    harness.setClock(1);
    expect(beatNumber(harness.service.readDisplayPlayheadBeat())).toBe(2);
    requireReceipt(await harness.submit({ kind: "stop" }));
    expect(beatNumber(harness.service.readDisplayPlayheadBeat())).toBe(0);
  });

  test("while paused the read holds the exact paused beat", async () => {
    const harness = createTransportHarness();
    const plan = customPlan({
      documentId: "doc-display-pause",
      tempoBpm: 120,
      durations: FOUR_QUARTER_DURATIONS,
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
    harness.setClock(0.5);
    requireReceipt(await harness.submit({ kind: "pause" }));
    harness.setClock(9.5);
    expect(beatNumber(harness.service.readDisplayPlayheadBeat())).toBe(1);
  });
});
