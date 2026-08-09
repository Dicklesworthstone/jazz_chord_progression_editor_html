import { describe, expect, test } from "bun:test";

import {
  loadConcertGrandRenderer,
  loadWaveguideRenderers,
  WAVEGUIDE_CLARINET_ALGORITHM_ID,
  WAVEGUIDE_FLUTE_ALGORITHM_ID,
} from "../../src/audio/dsp-renderer";
import variationContract from "../fixtures/physical-renderer/wind-vibrato-variation.json";

function correlation(left: Float32Array, right: Float32Array): number {
  let dot = 0;
  let leftEnergy = 0;
  let rightEnergy = 0;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    dot += a * b;
    leftEnergy += a * a;
    rightEnergy += b * b;
  }
  return dot / Math.sqrt(leftEnergy * rightEnergy);
}

function spectralMeasures(magnitudes: Float32Array, sampleRateHz: number, fftSize: number, f0: number) {
  let weighted = 0;
  let total = 0;
  let harmonic = 0;
  const binHz = sampleRateHz / fftSize;
  for (let bin = 1; bin < magnitudes.length; bin += 1) {
    const energy = (magnitudes[bin] ?? 0) ** 2;
    total += energy;
    weighted += energy * bin * binHz;
  }
  for (let partial = 1; partial * f0 < sampleRateHz / 2; partial += 1) {
    const center = Math.round((partial * f0) / binHz);
    for (let offset = -1; offset <= 1; offset += 1) harmonic += (magnitudes[center + offset] ?? 0) ** 2;
  }
  return { centroidHz: weighted / total, harmonicRatio: harmonic / total };
}

describe("seeded wind vibrato variation", () => {
  test("the authored variation envelope is bounded to eight cache slots", () => {
    expect(variationContract).toMatchObject({
      schema: "changes.fixtures.wind-vibrato-variation.v1",
      slotCount: 8,
      rateMultiplier: { minimum: 0.96, maximum: 1.04 },
      depthMultiplier: { minimum: 0.9, maximum: 1.1 },
      onsetMultiplier: { minimum: 0.85, maximum: 1.15 },
      independence: { productionOutputUsed: false, wallTimeAffectsOutput: false },
    });
  });

  /* flute@1 deliberately falls back to the plain export for every slot:
   * the seeded/expressive flute paths were measured numerically broken
   * (2026-08-08: slots 1-7 detune -171..+1062 cents and go NaN after ~1 s
   * -- see the rationale block at the flute@1 registration in
   * src/audio/dsp-renderer.ts). Until the Rust exports pass a per-slot
   * tuning + finite-output gate, every slot must replay the identical
   * certified plain render. */
  test(`${WAVEGUIDE_FLUTE_ALGORITHM_ID} slots all replay the certified plain render (deliberate fallback)`, async () => {
    const renderer = (await loadWaveguideRenderers()).get(WAVEGUIDE_FLUTE_ALGORITHM_ID);
    expect(renderer).toBeDefined();
    const plain = renderer?.renderNote(72, 96, 48_000, 1);
    expect(plain).not.toBeNull();
    for (const slot of [0, 1, 7, variationContract.slotCount]) {
      const seeded = renderer?.renderNote(72, 96, 48_000, 1, slot);
      expect(seeded?.left, `slot ${String(slot)}`).toEqual(plain?.left);
    }
  });

  for (const algorithmId of [
    WAVEGUIDE_CLARINET_ALGORITHM_ID,
  ]) {
    test(`${algorithmId} is deterministic per slot and distinct across slots`, async () => {
      const renderer = (await loadWaveguideRenderers()).get(algorithmId);
      expect(renderer).toBeDefined();
      const first = renderer?.renderNote(72, 96, 48_000, 1, 0);
      const replay = renderer?.renderNote(72, 96, 48_000, 1, 0);
      const varied = renderer?.renderNote(72, 96, 48_000, 1, 1);
      expect(first).not.toBeNull();
      expect(replay?.left).toEqual(first?.left);
      expect(varied).not.toBeNull();
      expect(varied?.left).not.toEqual(first?.left);
      expect(correlation(first?.left ?? new Float32Array(), varied?.left ?? new Float32Array())).toBeLessThan(0.999_999_9);
      expect(renderer?.renderNote(72, 96, 48_000, 1, variationContract.slotCount)).toBeNull();
    });

    test(`${algorithmId} slots preserve tuning, tonal concentration, and brightness`, async () => {
      const renderer = (await loadWaveguideRenderers()).get(algorithmId);
      const analyzer = await loadConcertGrandRenderer();
      const legacy = renderer?.renderNote(72, 96, 48_000, 1);
      expect(legacy).not.toBeNull();
      if (legacy === null || legacy === undefined) return;
      const legacyFrame = analyzer.analyzeWindow(legacy.left.slice(24_000, 32_192), 48_000);
      expect(legacyFrame).not.toBeNull();
      if (legacyFrame === null) return;
      const legacyMeasures = spectralMeasures(legacyFrame.magnitudes, 48_000, 8_192, 523.251);
      for (let slot = 0; slot < variationContract.slotCount; slot += 1) {
        const pcm = renderer?.renderNote(72, 96, 48_000, 1, slot);
        const frame = pcm === null || pcm === undefined ? null : analyzer.analyzeWindow(pcm.left.slice(24_000, 32_192), 48_000);
        expect(frame, `slot ${String(slot)}`).not.toBeNull();
        if (frame === null) continue;
        expect(Math.abs(frame.notes[0]?.centsDeviation ?? 999), `slot ${String(slot)}`).toBeLessThan(8);
        const measures = spectralMeasures(frame.magnitudes, 48_000, 8_192, 523.251);
        expect(measures.harmonicRatio, `slot ${String(slot)}`).toBeGreaterThan(legacyMeasures.harmonicRatio * 0.75);
        const centroidRatio = measures.centroidHz / legacyMeasures.centroidHz;
        expect(centroidRatio, `slot ${String(slot)}`).toBeGreaterThan(0.75);
        expect(centroidRatio, `slot ${String(slot)}`).toBeLessThan(1.25);
      }
    });
  }
});
