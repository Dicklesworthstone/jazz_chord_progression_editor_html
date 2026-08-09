import { describe, expect, test } from "bun:test";

import {
  loadConcertGrandRenderer,
  loadWaveguideRenderers,
  WAVEGUIDE_CLARINET_ALGORITHM_ID,
  WAVEGUIDE_FLUTE_ALGORITHM_ID,
} from "../../src/audio/dsp-renderer";
import contract from "../fixtures/physical-renderer/wind-chiff-attack.json";

function rms(samples: Float32Array, start: number, end: number): number {
  let energy = 0;
  for (let index = start; index < end; index += 1) {
    energy += (samples[index] ?? 0) ** 2;
  }
  return Math.sqrt(energy / (end - start));
}

function correlation(left: Float32Array, right: Float32Array, frames: number): number {
  let dot = 0;
  let leftEnergy = 0;
  let rightEnergy = 0;
  for (let index = 0; index < frames; index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    dot += a * b;
    leftEnergy += a * a;
    rightEnergy += b * b;
  }
  return dot / Math.sqrt(leftEnergy * rightEnergy);
}

describe("expressive wind chiff attack", () => {
  test("the independent packet fixes the bounded physical envelope", () => {
    expect(contract).toMatchObject({
      schema: "changes.fixtures.wind-chiff-attack.v1",
      articulations: ["legato", "tongued"],
      velocityCases: [30, 110],
      modelBounds: {
        chiffDurationSeconds: [0.01, 0.03],
        directInjectionMaximum: 0.01,
        flutePressureMaximum: 0.925,
        clarinetPressureMaximum: 0.915,
      },
      independence: {
        productionOutputUsedToAuthorThresholds: false,
        wallTimeAffectsOutput: false,
      },
    });
  });

  /* flute@1 deliberately falls back to the plain export: the expressive
   * (chiff) flute path was measured numerically broken (2026-08-08 -- see
   * the rationale block at the flute@1 registration in
   * src/audio/dsp-renderer.ts), so tongued and legato replay the identical
   * certified plain render until the Rust exports pass their gate. */
  test(`${WAVEGUIDE_FLUTE_ALGORITHM_ID} articulation replays the certified plain render (deliberate fallback)`, async () => {
    const renderer = (await loadWaveguideRenderers()).get(WAVEGUIDE_FLUTE_ALGORITHM_ID);
    expect(renderer).toBeDefined();
    const plain = renderer?.renderNote(72, 110, 48_000, 1);
    const tongued = renderer?.renderNote(72, 110, 48_000, 1, 0, "tongued");
    const legato = renderer?.renderNote(72, 110, 48_000, 1, 0, "legato");
    expect(plain).not.toBeNull();
    expect(tongued?.left).toEqual(plain?.left);
    expect(legato?.left).toEqual(plain?.left);
    /* The articulation vocabulary stays validated even in fallback. */
    expect(
      renderer?.renderNote(72, 110, 48_000, 1, 0, "invalid" as "tongued"),
    ).toBeNull();
  });

  for (const [algorithmId, instrument] of [
    [WAVEGUIDE_CLARINET_ALGORITHM_ID, contract.clarinet],
  ] as const) {
    test(`${algorithmId} makes tongue turbulence audible without changing sustain`, async () => {
      const renderer = (await loadWaveguideRenderers()).get(algorithmId);
      const analyzer = await loadConcertGrandRenderer();
      const tongued = renderer?.renderNote(72, 110, 48_000, 1, 0, "tongued");
      const replay = renderer?.renderNote(72, 110, 48_000, 1, 0, "tongued");
      const legato = renderer?.renderNote(72, 110, 48_000, 1, 0, "legato");
      expect(tongued).not.toBeNull();
      expect(replay?.left).toEqual(tongued?.left);
      expect(legato).not.toBeNull();
      expect(
        renderer?.renderNote(
          72,
          110,
          48_000,
          1,
          0,
          "invalid" as "tongued",
        ),
      ).toBeNull();
      if (tongued === null || tongued === undefined || legato === null || legato === undefined) return;
      expect(correlation(tongued.left, legato.left, contract.analysisFrames)).toBeLessThan(0.999);

      const bandEnergy = (samples: Float32Array): number => {
        const frame = analyzer.analyzeWindow(samples.slice(0, contract.analysisFrames), 48_000);
        if (frame === null) throw new Error("CHIFF_ANALYSIS_REFUSED");
        const lowHz = instrument.bandHz[0];
        const highHz = instrument.bandHz[1];
        if (lowHz === undefined || highHz === undefined) throw new Error("CHIFF_BAND_INVALID");
        let band = 0;
        let total = 0;
        for (let bin = 1; bin < frame.magnitudes.length; bin += 1) {
          const energy = (frame.magnitudes[bin] ?? 0) ** 2;
          const hz = bin * 48_000 / contract.analysisFrames;
          total += energy;
          if (hz >= lowHz && hz <= highHz) band += energy;
        }
        return band / total;
      };
      expect(bandEnergy(tongued.left) / bandEnergy(legato.left)).toBeGreaterThan(
        instrument.tonguedToLegatoBandRatioMinimumAtVelocity110,
      );
      const sustainStart = 14_400;
      const sustainEnd = sustainStart + 1_440;
      const sustainRatio = rms(tongued.left, sustainStart, sustainEnd) /
        rms(legato.left, sustainStart, sustainEnd);
      const sustainMinimum = instrument.sustainRmsRatio[0];
      const sustainMaximum = instrument.sustainRmsRatio[1];
      if (sustainMinimum === undefined || sustainMaximum === undefined) throw new Error("CHIFF_SUSTAIN_BOUNDS_INVALID");
      expect(sustainRatio).toBeGreaterThan(sustainMinimum);
      expect(sustainRatio).toBeLessThan(sustainMaximum);
    });

    test(`${algorithmId} has greater high-velocity tongue excess than its soft endpoint`, async () => {
      const renderer = (await loadWaveguideRenderers()).get(algorithmId);
      const analyzer = await loadConcertGrandRenderer();
      const lowHz = instrument.bandHz[0];
      const highHz = instrument.bandHz[1];
      if (lowHz === undefined || highHz === undefined) throw new Error("CHIFF_BAND_INVALID");
      const excess = (velocity: number): number => {
        const tongued = renderer?.renderNote(72, velocity, 48_000, 1, 0, "tongued");
        const legato = renderer?.renderNote(72, velocity, 48_000, 1, 0, "legato");
        if (tongued === null || tongued === undefined || legato === null || legato === undefined) {
          throw new Error("CHIFF_RENDER_REFUSED");
        }
        const energy = (samples: Float32Array): number => {
          const frame = analyzer.analyzeWindow(samples.slice(0, contract.analysisFrames), 48_000);
          if (frame === null) throw new Error("CHIFF_ANALYSIS_REFUSED");
          let result = 0;
          for (let bin = 1; bin < frame.magnitudes.length; bin += 1) {
            const hz = bin * 48_000 / contract.analysisFrames;
            if (hz >= lowHz && hz <= highHz) result += (frame.magnitudes[bin] ?? 0) ** 2;
          }
          return result;
        };
        return energy(tongued.left) - energy(legato.left);
      };
      expect(excess(110)).toBeGreaterThan(excess(30));
    });
  }
});
