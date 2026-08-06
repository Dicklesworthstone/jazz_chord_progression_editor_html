import { describe, expect, test } from "bun:test";

import { compilePhysicalRealization } from "../../src/audio";
import { makeBeatPosition } from "../../src/domain";
import {
  createTransportHarness,
  customPlan,
  initializePayload,
  planBinding,
  requireReceipt,
} from "../support/transport-test-kit";

const PACK_SHA256 = "a".repeat(64);

const zeroBeat = (() => {
  const made = makeBeatPosition({ numerator: 0, denominator: 1 });
  if (!made.ok) throw new Error("RATE_TEST_ZERO_BEAT");
  return made.value;
})();

describe("transport physical realization uses the real context sample rate", () => {
  test("compilePhysicalRealization carries the requested rate into every segment", () => {
    for (const sampleRateHz of [44_100, 96_000] as const) {
      const compiled = compilePhysicalRealization({
        plan: customPlan({
          documentId: `doc-rate-direct-${String(sampleRateHz)}`,
          tempoBpm: 120,
          durations: [{ numerator: 1, denominator: 1 }],
        }),
        sourcePlanRevision: 1,
        instrumentFamily: "flute",
        instrumentVersionId: "changes.physical.flute.v2",
        parameterPackSha256: PACK_SHA256,
        sampleRateHz,
      });
      if (!compiled.ok) throw new Error("RATE_TEST_COMPILE_REFUSED");
      expect(compiled.value.renderPlan.segments.length).toBeGreaterThan(0);
      for (const segment of compiled.value.renderPlan.segments) {
        expect(segment.sampleRateHz).toBe(sampleRateHz);
      }
    }
  });

  test("a 44.1 kHz context still attaches compiled gestures to every physical voice", async () => {
    const harness = createTransportHarness({ sampleRate: 44_100 });
    const plan = customPlan({
      documentId: "doc-rate-44100",
      tempoBpm: 120,
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
    expect(harness.engine.inspectAudioEngine().contextSampleRate).toBe(44_100);
    const attack = harness.attacks.find(
      ({ ownerKind }) => ownerKind === "progression",
    );
    expect(attack?.accepted).toBe(true);
    expect(attack?.physicalGestureCount).toBe(attack?.voiceCount);
    expect(attack?.physicalGestureCount ?? 0).toBeGreaterThan(0);
  });

  test("a 96 kHz context still attaches compiled gestures to every physical voice", async () => {
    const harness = createTransportHarness({ sampleRate: 96_000 });
    const plan = customPlan({
      documentId: "doc-rate-96000",
      tempoBpm: 120,
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
    expect(harness.engine.inspectAudioEngine().contextSampleRate).toBe(96_000);
    const attack = harness.attacks.find(
      ({ ownerKind }) => ownerKind === "progression",
    );
    expect(attack?.accepted).toBe(true);
    expect(attack?.physicalGestureCount).toBe(attack?.voiceCount);
    expect(attack?.physicalGestureCount ?? 0).toBeGreaterThan(0);
  });
});
