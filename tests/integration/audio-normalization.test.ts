import { describe, expect, test } from "bun:test";

import type { InstrumentId } from "../../src/domain";
import {
  attackRequest,
  readyEngine,
  requireSuccess,
  voice,
  voices,
} from "../support/audio-engine-test-kit";

const NORMALIZATION_CASE_IDS = [
  "X0-LIFE-018",
  "X0-LIFE-019",
  "X0-RENDER-002",
  "X0-RENDER-005",
  "X0-RENDER-008",
  "X0-RENDER-011",
  "X0-RENDER-014",
  "X0-RENDER-017",
] as const;

const DENSE_CASES: readonly Readonly<{
  caseId: string;
  instrumentId: InstrumentId;
  outputLevel: number;
  sourcesPerVoice: number;
}>[] = [
  { caseId: "X0-RENDER-002", instrumentId: "mellow-keys", outputLevel: 0.62, sourcesPerVoice: 3 },
  { caseId: "X0-RENDER-005", instrumentId: "fm-electric-piano", outputLevel: 0.48, sourcesPerVoice: 2 },
  { caseId: "X0-RENDER-008", instrumentId: "vibraphone", outputLevel: 0.5, sourcesPerVoice: 4 },
  { caseId: "X0-RENDER-011", instrumentId: "warm-pad", outputLevel: 0.3, sourcesPerVoice: 3 },
  { caseId: "X0-RENDER-014", instrumentId: "analog-poly", outputLevel: 0.34, sourcesPerVoice: 3 },
  /* The rendered piano schedules one PCM buffer source per voice. */
  { caseId: "X0-RENDER-017", instrumentId: "concert-grand", outputLevel: 0.3, sourcesPerVoice: 1 },
];

describe("TR-X0-NORMALIZATION audio normalization", () => {
  test("X0-LIFE-018/X0-LIFE-019 retains original batch normalization and exact velocity response", async () => {
    const singleHarness = await readyEngine();
    singleHarness.context.setCurrentTime(10);
    const single = requireSuccess(
      singleHarness.engine.attackAudioVoices(
        attackRequest([voice("single", 69, 100)], {
          eventId: "single-event",
          startTimeSeconds: 10,
          releaseTimeSeconds: 11,
        }),
      ),
    );
    expect(single.normalizationGain).toBe(0.62);
    expect(single.velocityGains[0]).toBeCloseTo(Math.pow(100 / 127, 1.5), 14);

    const denseHarness = await readyEngine();
    const dense = requireSuccess(
      denseHarness.engine.attackAudioVoices(
        attackRequest(voices(16, "analog", { midiStart: 48, velocity: 127 }), {
          eventId: "analog-sixteen",
          instrumentId: "analog-poly",
        }),
      ),
    );
    expect(dense.normalizationGain).toBeCloseTo(0.34 / Math.sqrt(16), 14);
    expect(dense.velocityGains).toEqual(Array.from({ length: 16 }, () => 1));
    expect(dense.snapshot.activeVoices).toHaveLength(16);
    expect(dense.snapshot.work.scheduledSourcesCreated).toBe(48);
    expect(
      dense.snapshot.activeVoices.every(
        (entry) =>
          entry.originalBatchVoiceCount === 16 &&
          entry.normalizationGain === dense.normalizationGain,
      ),
    ).toBe(true);
  });

  test("X0-RENDER-002/X0-RENDER-005/X0-RENDER-008/X0-RENDER-011/X0-RENDER-014/X0-RENDER-017 applies conservative seven-note gain to every recipe", async () => {
    for (const expected of DENSE_CASES) {
      const { engine, context } = await readyEngine();
      const sourceCountBefore = context.sourceIds().length;
      const denseVoices = [48, 52, 55, 59, 62, 65, 69].map((pitch, index) =>
        voice(`${expected.instrumentId}-${String(index)}`, pitch, 110),
      );
      const receipt = requireSuccess(
        engine.attackAudioVoices(
          attackRequest(denseVoices, {
            eventId: `dense-${expected.instrumentId}`,
            instrumentId: expected.instrumentId,
          }),
        ),
      );
      expect(receipt.normalizationGain).toBeCloseTo(
        expected.outputLevel / Math.sqrt(7),
        14,
      );
      expect(receipt.velocityGains).toEqual(
        Array.from({ length: 7 }, () => Math.pow(110 / 127, 1.5)),
      );
      expect(context.sourceIds().length - sourceCountBefore).toBe(
        expected.sourcesPerVoice * 7,
      );
      expect(
        receipt.snapshot.activeVoices.every(
          (entry) => entry.originalBatchVoiceCount === 7,
        ),
      ).toBe(true);
    }
    expect(NORMALIZATION_CASE_IDS).toHaveLength(8);
  });
});
