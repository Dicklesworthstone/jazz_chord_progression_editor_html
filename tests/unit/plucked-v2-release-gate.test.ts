import { describe, expect, test } from "bun:test";

import {
  PLUCKED_V2_RELEASE_POLICY,
  PLUCKED_V2_SOURCE_PATHS,
  analyzePluckedOutput,
  evaluatePluckedOutput,
  verifyPluckedV2ReleaseEvidence,
  type PluckedFamily,
  type PluckedOutputFeatures,
} from "../../scripts/run-plucked-v2-release-gate";
import { sha256Hex } from "../../scripts/reference-similarity";

const SAMPLE_RATE = 48_000;
const MIDI = 60;
const FREQUENCY = 261.625565;

function decayingSignal(partialGains: readonly number[], detuneCents = 0): Float32Array {
  const samples = new Float32Array(Math.round(1.2 * SAMPLE_RATE));
  const frequency = FREQUENCY * 2 ** (detuneCents / 1_200);
  for (let index = 0; index < samples.length; index += 1) {
    const time = index / SAMPLE_RATE;
    const envelope = (1 - Math.exp(-time / 0.0015)) * Math.exp(-time / 1.4);
    let value = 0;
    for (let partial = 0; partial < partialGains.length; partial += 1) {
      value += (partialGains[partial] ?? 0) *
        Math.sin(2 * Math.PI * frequency * (partial + 1) * time + partial * 0.17);
    }
    samples[index] = value * envelope * 0.12;
  }
  return samples;
}

const rich = Object.freeze([1, 0.42, 0.28, 0.20, 0.14, 0.11, 0.09, 0.07, 0.05, 0.04]);

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).sort()
      .map((key) => [key, canonicalize(record[key])]));
  }
  return value;
}

function profile(partialsDb: readonly number[]): PluckedOutputFeatures {
  const higherEnergy = partialsDb.slice(1).reduce((sum, decibels) =>
    sum + 10 ** (decibels / 10), 0);
  return Object.freeze({
    peak: 0.4,
    earlyRms: 0.1,
    onsetMs: 1,
    pitchCents: 0,
    partialsDb: Object.freeze(partialsDb),
    audiblePartialCount: partialsDb.filter((value) => value >= -55).length,
    higherHarmonicMassDb: 10 * Math.log10(higherEnergy),
    tailDb: -10,
  });
}

function signedEvidence(): Record<string, unknown> {
  const profiles: Readonly<Record<PluckedFamily, PluckedOutputFeatures>> = Object.freeze({
    archtop: profile([0, -6, -12, -18, -24, -30, -35, -40, -45, -50]),
    electric: profile([0, -2, -7, -11, -15, -19, -23, -27, -31, -35]),
    dreadnought: profile([0, -12, -18, -24, -30, -36, -40, -44, -48, -52]),
    ukulele: profile([0, -20, -25, -30, -34, -38, -42, -46, -50, -54]),
  });
  const familyOrder = ["archtop", "electric", "dreadnought", "ukulele"] as const;
  const cells = familyOrder.flatMap((family) =>
    PLUCKED_V2_RELEASE_POLICY.families[family].midi.map((midi) => ({
      id: `${family}-m${String(midi)}`,
      family,
      algorithmId: PLUCKED_V2_RELEASE_POLICY.families[family].algorithmId,
      midi,
      velocity: PLUCKED_V2_RELEASE_POLICY.velocity,
      sampleRateHz: PLUCKED_V2_RELEASE_POLICY.sampleRateHz,
      pcmSha256: sha256Hex(`${family}:${String(midi)}`),
      features: profiles[family],
      outcome: "pass" as const,
      findings: [],
    })),
  );
  const common = new Map(cells.filter((cell) => cell.midi === 60)
    .map((cell) => [cell.family, cell]));
  const distance = (left: PluckedFamily, right: PluckedFamily): number => {
    const a = common.get(left)?.features.partialsDb ?? [];
    const b = common.get(right)?.features.partialsDb ?? [];
    return Math.sqrt(a.slice(1).reduce((sum, value, index) =>
      sum + (value - (b[index + 1] ?? 0)) ** 2, 0) / Math.max(1, a.length - 1));
  };
  const pairwiseCells = familyOrder.flatMap((left, leftIndex) =>
    familyOrder.slice(leftIndex + 1).map((right) => ({
      id: `${left}-vs-${right}-m60`,
      leftFamily: left,
      rightFamily: right,
      midi: 60 as const,
      profileDistanceDb: distance(left, right),
      outcome: "pass" as const,
    })),
  );
  const sourceBindings = PLUCKED_V2_SOURCE_PATHS.map((path) => ({
    path,
    sha256: sha256Hex(path),
  }));
  const controls = {
    pureSineRejected: true,
    wrongPitchRejected: true,
    collapsedFamiliesRejected: true,
  };
  const unsigned = {
    schema: "changes.evidence.phs4-plucked-shipping-output.v1",
    policy: PLUCKED_V2_RELEASE_POLICY,
    algorithmIds: familyOrder.map((family) =>
      PLUCKED_V2_RELEASE_POLICY.families[family].algorithmId).sort(),
    wasmSha256: "a".repeat(64),
    sourceBindings,
    sourceClosureSha256: sha256Hex(JSON.stringify(canonicalize(sourceBindings))),
    cells,
    pairwiseCells,
    controls,
    summary: {
      outcome: "pass",
      expectedCellCount: 12,
      passedCellCount: 12,
      failedCellCount: 0,
      expectedPairwiseCellCount: 6,
      passedPairwiseCellCount: 6,
      failedPairwiseCellCount: 0,
    },
  };
  return { ...unsigned, evidenceSha256: sha256Hex(JSON.stringify(canonicalize(unsigned))) };
}

describe("PHS4 plucked shipping-output analyzer", () => {
  test("an independently synthesized rich pluck has pitch, partial, and tail evidence", () => {
    const features = analyzePluckedOutput(decayingSignal(rich), SAMPLE_RATE, MIDI);
    expect(Math.abs(features.pitchCents)).toBeLessThanOrEqual(0.5);
    expect(features.audiblePartialCount).toBe(10);
    expect(features.partialsDb[1]).toBeGreaterThan(-10);
    expect(features.tailDb).toBeGreaterThan(-10);
    for (const family of ["archtop", "electric", "dreadnought", "ukulele"] as const) {
      expect(evaluatePluckedOutput(family, features)).toEqual([]);
    }
  });

  test("a tuned decaying sine is rejected as the exact production failure mode", () => {
    const features = analyzePluckedOutput(decayingSignal([1]), SAMPLE_RATE, MIDI);
    for (const family of ["archtop", "electric", "dreadnought", "ukulele"] as const) {
      const codes = evaluatePluckedOutput(family, features).map((item) => item.code);
      expect(codes).toContain("PLUCKED_HARMONIC_COLLAPSE");
      expect(codes).toContain("PLUCKED_HARMONIC_MASS");
    }
  });

  test("wrong pitch fails every family without hiding behind a rich spectrum", () => {
    const features = analyzePluckedOutput(decayingSignal(rich, 10), SAMPLE_RATE, MIDI);
    for (const family of ["archtop", "electric", "dreadnought", "ukulele"] as const) {
      expect(evaluatePluckedOutput(family, features).map((item) => item.code))
        .toContain("PLUCKED_PITCH");
    }
  });

  test("a realistic spectrum with a catastrophically short tail still fails", () => {
    const features = analyzePluckedOutput(decayingSignal(rich), SAMPLE_RATE, MIDI);
    const collapsed = Object.freeze({ ...features, tailDb: -80 });
    for (const family of ["archtop", "electric", "dreadnought", "ukulele"] as const) {
      expect(evaluatePluckedOutput(family, collapsed).map((item) => item.code))
        .toContain("PLUCKED_TAIL");
    }
  });

  test("the matrix policy covers exactly four named algorithms and twelve cells", () => {
    const families = Object.keys(PLUCKED_V2_RELEASE_POLICY.families) as PluckedFamily[];
    expect(families).toEqual(["archtop", "electric", "dreadnought", "ukulele"]);
    expect(new Set(families.map((family) =>
      PLUCKED_V2_RELEASE_POLICY.families[family].algorithmId)).size).toBe(4);
    expect(families.reduce((count, family) =>
      count + PLUCKED_V2_RELEASE_POLICY.families[family].midi.length, 0)).toBe(12);
    expect(PLUCKED_V2_RELEASE_POLICY.minimumPairwiseProfileDistanceDb).toBe(3.5);
  });

  test("full evidence is hash-bound and rejects stale, cherry-picked, or synthetic claims", () => {
    const evidence = signedEvidence();
    expect(verifyPluckedV2ReleaseEvidence(evidence)).toBe(true);
    expect(verifyPluckedV2ReleaseEvidence({ ...evidence, wasmSha256: "b".repeat(64) }))
      .toBe(false);
    expect(verifyPluckedV2ReleaseEvidence({
      ...evidence,
      cells: (evidence["cells"] as unknown[]).slice(1),
    })).toBe(false);
    const pairwiseCells = evidence["pairwiseCells"] as Array<Record<string, unknown>>;
    expect(verifyPluckedV2ReleaseEvidence({
      ...evidence,
      pairwiseCells: pairwiseCells.map((cell, index) => index === 0
        ? { ...cell, profileDistanceDb: 100 }
        : cell),
    })).toBe(false);
  });
});
