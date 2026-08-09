import { describe, expect, test } from "bun:test";

import type { InstrumentId } from "../../src/domain";
import {
  attackRequest,
  midi,
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
  "X0-RENDER-020",
  "X0-RENDER-023",
  "X0-RENDER-026",
  "X0-RENDER-029",
  "X0-RENDER-032",
  "X0-RENDER-035",
  "X0-RENDER-038",
  "X0-RENDER-041",
  "X0-RENDER-044",
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
  { caseId: "X0-RENDER-020", instrumentId: "flute", outputLevel: 2.8, sourcesPerVoice: 1 },
  { caseId: "X0-RENDER-023", instrumentId: "organ", outputLevel: 0.44, sourcesPerVoice: 6 },
  /* Plucked families use one composite source for the whole physical chord. */
  { caseId: "X0-RENDER-026", instrumentId: "guitar", outputLevel: 0.5, sourcesPerVoice: 1 },
  /* Sampled recipes schedule one PCM buffer source per logical voice
   * (owner mandate 2026-08-09, bead jcpe-3q4c: samples ship until the
   * physical models close the heard quality gap). */
  { caseId: "X0-RENDER-029", instrumentId: "upright-bass", outputLevel: 0.17, sourcesPerVoice: 1 },
  { caseId: "X0-RENDER-032", instrumentId: "concert-vibes", outputLevel: 0.1, sourcesPerVoice: 1 },
  { caseId: "X0-RENDER-035", instrumentId: "blues-guitar", outputLevel: 0.46, sourcesPerVoice: 1 },
  { caseId: "X0-RENDER-038", instrumentId: "clarinet", outputLevel: 1.1, sourcesPerVoice: 1 },
  { caseId: "X0-RENDER-041", instrumentId: "dreadnought-guitar", outputLevel: 0.5, sourcesPerVoice: 1 },
  { caseId: "X0-RENDER-044", instrumentId: "ukulele", outputLevel: 0.65, sourcesPerVoice: 1 },
];

const PLUCKED_PHYSICAL_CHORDS: Readonly<
  Partial<Record<InstrumentId, readonly number[]>>
> = Object.freeze({
  /* One playable pitch on each standard six-string course. */
  guitar: Object.freeze([40, 45, 50, 55, 59, 64]),
  "blues-guitar": Object.freeze([40, 45, 50, 55, 59, 64]),
  "dreadnought-guitar": Object.freeze([40, 45, 50, 55, 59, 64]),
  /* The re-entrant ukulele is physically four-course, never six. */
  ukulele: Object.freeze([60, 64, 67, 69]),
  /* upright-bass reverted to the sampled per-voice renderer (owner mandate
   * 2026-08-09, bead jcpe-3q4c) — no physical-chord row while it ships. */
});

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

  test("X0-RENDER-002/X0-RENDER-005/X0-RENDER-008/X0-RENDER-011/X0-RENDER-014/X0-RENDER-017/X0-RENDER-020/X0-RENDER-023/X0-RENDER-026/X0-RENDER-029/X0-RENDER-032/X0-RENDER-035/X0-RENDER-038/X0-RENDER-041/X0-RENDER-044 applies conservative normalization to dense logical and physical chords", async () => {
    for (const expected of DENSE_CASES) {
      const { engine, context } = await readyEngine();
      const physicalPitches = PLUCKED_PHYSICAL_CHORDS[expected.instrumentId];
      const pitches = physicalPitches ?? [48, 52, 55, 59, 62, 65, 69];
      if (physicalPitches !== undefined) {
        requireSuccess(await engine.prepareRenderedAudioVoices({
          instrumentId: expected.instrumentId,
          notes: physicalPitches.map((pitch) => ({
            midiPitch: midi(pitch),
            velocity: 110,
            /* Match the one-second attack below: the physical chord cache
             * deliberately binds its render-duration bucket. */
            gateSeconds: 1,
          })),
        }));
      }
      const sourceCountBefore = context.sourceIds().length;
      const denseVoices = pitches.map((pitch, index) =>
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
        expected.outputLevel / Math.sqrt(pitches.length),
        14,
      );
      expect(receipt.velocityGains).toEqual(
        Array.from(
          { length: pitches.length },
          () => physicalPitches === undefined
            ? Math.pow(110 / 127, 1.5)
            : 1,
        ),
      );
      expect(context.sourceIds().length - sourceCountBefore).toBe(
        physicalPitches === undefined
          ? expected.sourcesPerVoice * pitches.length
          : 1,
      );
      expect(
        receipt.snapshot.activeVoices.every(
          (entry) => entry.originalBatchVoiceCount === pitches.length,
        ),
      ).toBe(true);
      if (physicalPitches !== undefined) {
        expect(receipt.snapshot.activeVoices.filter(
          (entry) => entry.scheduledSourceCount === 1,
        )).toHaveLength(1);
        expect(receipt.snapshot.activeVoices).toHaveLength(
          physicalPitches.length,
        );
        expect(receipt.snapshot.activeVoices.every(
          (entry) => entry.velocityGain === 1,
        )).toBe(true);
      }
    }
    expect(NORMALIZATION_CASE_IDS).toHaveLength(17);
  }, 30_000);
});
