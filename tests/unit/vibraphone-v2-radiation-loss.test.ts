import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";

type ModalRecord = Readonly<{
  midi: number;
  lengthM: number;
  widthM: number;
  outerThicknessM: number;
  solvedFrequenciesHz: readonly number[];
  massNormalizedDisplacementShapes: readonly (readonly number[])[];
  loss: Readonly<{ radiationLossFactors: readonly number[] }>;
}>;

type ModalPack = Readonly<{ records: readonly ModalRecord[] }>;

const AIR_DENSITY_KG_M3 = 1.2041;
const SOUND_SPEED_M_PER_S = 343.21;
const DIRECTION_COSINES = [
  -0.9815606342467191,
  -0.9041172563704749,
  -0.7699026741943047,
  -0.5873179542866175,
  -0.3678314989981802,
  -0.1252334085114689,
  0.1252334085114689,
  0.3678314989981802,
  0.5873179542866175,
  0.7699026741943047,
  0.9041172563704749,
  0.9815606342467191,
] as const;
const DIRECTION_WEIGHTS = [
  0.04717533638651183,
  0.1069393259953184,
  0.1600783285433462,
  0.2031674267230659,
  0.2334925365383548,
  0.2491470458134029,
  0.2491470458134029,
  0.2334925365383548,
  0.2031674267230659,
  0.1600783285433462,
  0.1069393259953184,
  0.04717533638651183,
] as const;
const AZIMUTH_COUNT = 24;

const root = resolve(import.meta.dir, "../..");
const pack = JSON.parse(readFileSync(
  resolve(root, "physical/parameter-packs/vibraphone-v2-eigenpack.json"),
  "utf8",
)) as ModalPack;

function independentRadiationLossFactor(record: ModalRecord, modeIndex: number): number {
  const frequencyHz = record.solvedFrequenciesHz[modeIndex];
  const shape = record.massNormalizedDisplacementShapes[modeIndex];
  if (frequencyHz === undefined || shape === undefined || shape.length !== 33) {
    throw new Error("independent radiation fixture is incomplete");
  }
  const omega = 2 * Math.PI * frequencyHz;
  const waveNumber = omega / SOUND_SPEED_M_PER_S;
  const elementLength = record.lengthM / 32;
  const azimuthStep = 2 * Math.PI / AZIMUTH_COUNT;
  let sphereIntegral = 0;
  for (let directionIndex = 0; directionIndex < DIRECTION_COSINES.length; directionIndex += 1) {
    const normal = DIRECTION_COSINES[directionIndex];
    const directionWeight = DIRECTION_WEIGHTS[directionIndex];
    if (normal === undefined || directionWeight === undefined) throw new Error("quadrature");
    const transverse = Math.sqrt(1 - normal * normal);
    const faceDifference = 4 * Math.sin(0.5 * waveNumber * normal * record.outerThicknessM) ** 2;
    for (let azimuthIndex = 0; azimuthIndex < AZIMUTH_COUNT; azimuthIndex += 1) {
      const alongBar = transverse * Math.cos((azimuthIndex + 0.5) * azimuthStep);
      let real = 0;
      let imaginary = 0;
      for (let element = 0; element < 32; element += 1) {
        const left = shape[element];
        const right = shape[element + 1];
        if (left === undefined || right === undefined) throw new Error("mode shape");
        // Independently use a piecewise-linear midpoint rule rather than the
        // generator's cubic-Hermite/four-point element integration.
        const weightedShape = record.widthM * elementLength * 0.5 * (left + right);
        const centeredPosition = ((element + 0.5) / 32 - 0.5) * record.lengthM;
        const phase = waveNumber * alongBar * centeredPosition;
        real += weightedShape * Math.cos(phase);
        imaginary -= weightedShape * Math.sin(phase);
      }
      sphereIntegral += directionWeight * azimuthStep * faceDifference *
        (real * real + imaginary * imaginary);
    }
  }
  return AIR_DENSITY_KG_M3 * omega /
    (16 * Math.PI * Math.PI * SOUND_SPEED_M_PER_S) * sphereIntegral;
}

function plantedCompactWholeBarLossFactor(record: ModalRecord, modeIndex: number): number {
  const frequencyHz = record.solvedFrequenciesHz[modeIndex];
  const shape = record.massNormalizedDisplacementShapes[modeIndex];
  if (frequencyHz === undefined || shape === undefined || shape.length !== 33) {
    throw new Error("compact fixture is incomplete");
  }
  const omega = 2 * Math.PI * frequencyHz;
  const waveNumber = omega / SOUND_SPEED_M_PER_S;
  const elementLength = record.lengthM / 32;
  let wholeBarIntegral = 0;
  for (let element = 0; element < 32; element += 1) {
    const left = shape[element];
    const right = shape[element + 1];
    if (left === undefined || right === undefined) throw new Error("mode shape");
    wholeBarIntegral += record.widthM * elementLength * 0.5 * (left + right);
  }
  return AIR_DENSITY_KG_M3 * omega /
    (4 * Math.PI * SOUND_SPEED_M_PER_S) *
    4 * Math.sin(0.5 * waveNumber * record.outerThicknessM) ** 2 *
    wholeBarIntegral * wholeBarIntegral;
}

describe("vibraphone free-bar radiation loss", () => {
  test("antisymmetric modes retain nonzero multipole radiation power", () => {
    const c4 = pack.records.find((record) => record.midi === 60);
    expect(c4).toBeDefined();
    if (c4 === undefined) throw new Error("C4 record absent");

    for (const modeIndex of [1, 3]) {
      const packed = c4.loss.radiationLossFactors[modeIndex];
      if (packed === undefined) throw new Error("radiation loss absent");
      const independent = independentRadiationLossFactor(c4, modeIndex);
      expect(packed).toBeGreaterThan(1e-8);
      expect(Math.abs(independent / packed - 1)).toBeLessThan(0.06);

      // Planted near miss: collapsing the spatial phase before squaring makes
      // an antisymmetric shape look exactly lossless while an off-axis
      // listener still receives it.
      const compact = plantedCompactWholeBarLossFactor(c4, modeIndex);
      expect(compact).toBeLessThan(packed * 1e-10);
    }
  });
});
