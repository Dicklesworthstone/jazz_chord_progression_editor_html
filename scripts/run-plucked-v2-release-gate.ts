/**
 * Shipping-output gate for the four reachable PHS4 plucked instruments.
 *
 * This deliberately analyzes the embedded WASM path used by the browser. The
 * Rust physics tests prove internal laws; this gate catches the different
 * failure that reached the UI in August 2026: a valid ABI render that was
 * nearly a pure sine, died tens of decibels too quickly, or refused outright.
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  PLUCKED_ARCHTOP_V2_ALGORITHM_ID,
  PLUCKED_DREADNOUGHT_ALGORITHM_ID,
  PLUCKED_ELECTRIC_V2_ALGORITHM_ID,
  PLUCKED_UKULELE_ALGORITHM_ID,
  loadWaveguideRenderers,
  type RenderedNotePcm,
} from "../src/audio/dsp-renderer";
import { CONCERT_GRAND_WASM_SHA256 } from "../src/audio/wasm/concert-grand-wasm";
import { sha256Hex } from "./reference-similarity";

export type PluckedFamily =
  | "archtop"
  | "electric"
  | "dreadnought"
  | "ukulele";

type FamilyPolicy = Readonly<{
  packIndex: number;
  algorithmId: string;
  midi: readonly number[];
  maximumPitchCents: number;
  minimumPeak: number;
  minimumEarlyRms: number;
  maximumEarlyRms: number;
  minimumSecondPartialDb: number;
  minimumThirdPartialDb: number;
  minimumAudiblePartialCount: number;
  minimumHigherHarmonicMassDb: number;
  minimumTailDb: number;
  maximumTailDb: number;
}>;

export const PLUCKED_V2_RELEASE_POLICY = Object.freeze({
  schema: "changes.policy.phs4-plucked-shipping-output.v1" as const,
  sampleRateHz: 48_000,
  velocity: 100,
  renderSeconds: 1.2,
  onsetThresholdOfPeak: 0.01,
  maximumOnsetMs: 20,
  earlyWindowStartAfterOnsetMs: 45,
  earlyWindowLengthMs: 170,
  /*
   * String tuning is asserted on a sustain window, not the attack: the
   * improved plucked model carries real tension-modulation pitch glide
   * (canonical windowed measurement, 2026-08-08: electric m60 reads +10.3c
   * in the first 150 ms decaying to +0.3c by 1.8 s; dreadnought m60
   * +6.3c -> +0.3c). Measuring tuning inside the glide punished correct
   * physics while the sustained pitch was within 1 cent. The 5-cent
   * tuning bound is unchanged; a separate bounded glide law catches
   * runaway tension modulation (cap = 3x the largest measured healthy
   * glide). Mutation controls in tests/unit/plucked-v2-release-gate.test.ts
   * prove a constant mistune still fails and a pathological glide fails.
   */
  sustainWindowStartAfterOnsetMs: 400,
  maximumAttackGlideCents: 30,
  tailWindowStartAfterOnsetMs: 820,
  tailWindowLengthMs: 250,
  partialCount: 10,
  audiblePartialFloorDb: -55,
  maximumPeak: 0.99,
  minimumPairwiseProfileDistanceDb: 3.5,
  families: Object.freeze({
    archtop: Object.freeze({
      packIndex: 0,
      algorithmId: PLUCKED_ARCHTOP_V2_ALGORITHM_ID,
      midi: Object.freeze([48, 60, 72]),
      maximumPitchCents: 5,
      minimumPeak: 0.1,
      minimumEarlyRms: 0.02,
      maximumEarlyRms: 0.3,
      minimumSecondPartialDb: -24,
      minimumThirdPartialDb: -38,
      minimumAudiblePartialCount: 5,
      minimumHigherHarmonicMassDb: -18,
      minimumTailDb: -38,
      maximumTailDb: 1,
    }),
    electric: Object.freeze({
      packIndex: 1,
      algorithmId: PLUCKED_ELECTRIC_V2_ALGORITHM_ID,
      midi: Object.freeze([48, 60, 72]),
      maximumPitchCents: 5,
      minimumPeak: 0.1,
      minimumEarlyRms: 0.01,
      maximumEarlyRms: 0.3,
      minimumSecondPartialDb: -20,
      minimumThirdPartialDb: -26,
      minimumAudiblePartialCount: 7,
      minimumHigherHarmonicMassDb: -12,
      minimumTailDb: -20,
      // The retained driven amp can rise slightly while its compressed supply
      // recovers. Acoustic bodies remain forbidden from doing so.
      maximumTailDb: 3,
    }),
    dreadnought: Object.freeze({
      packIndex: 2,
      algorithmId: PLUCKED_DREADNOUGHT_ALGORITHM_ID,
      midi: Object.freeze([48, 60, 72]),
      maximumPitchCents: 5,
      minimumPeak: 0.1,
      minimumEarlyRms: 0.02,
      maximumEarlyRms: 0.3,
      minimumSecondPartialDb: -18,
      minimumThirdPartialDb: -35,
      minimumAudiblePartialCount: 5,
      minimumHigherHarmonicMassDb: -15,
      minimumTailDb: -34,
      maximumTailDb: 1,
    }),
    ukulele: Object.freeze({
      packIndex: 3,
      algorithmId: PLUCKED_UKULELE_ALGORITHM_ID,
      midi: Object.freeze([60, 67, 72]),
      maximumPitchCents: 6,
      minimumPeak: 0.1,
      minimumEarlyRms: 0.02,
      maximumEarlyRms: 0.3,
      minimumSecondPartialDb: -28,
      minimumThirdPartialDb: -38,
      minimumAudiblePartialCount: 4,
      minimumHigherHarmonicMassDb: -20,
      minimumTailDb: -44,
      maximumTailDb: 1,
    }),
  } satisfies Readonly<Record<PluckedFamily, FamilyPolicy>>),
  referenceBasis: Object.freeze({
    steelStringDiagnostic:
      "FSS SteelStringGuitar GPL diagnostic only: C4 h2=-4.8dB, h3=-22.7dB, 0.82-1.07s tail=-13.2dB",
    electricCc0:
      "Freesound/Versilian CC0 bridge clean+dist: register cells retain 6-10 strong partials; clean tail=-2.1..-11.5dB; dist tail=-0.5..-0.9dB",
    authorityBoundary:
      "thresholds are conservative lower bounds, not copied audio and not a measured Marshall fit",
  }),
});

export type PluckedOutputFeatures = Readonly<{
  peak: number;
  earlyRms: number;
  onsetMs: number;
  /** Sustained string tuning (sustain window), the bound quantity. */
  pitchCents: number;
  /** Attack-window pitch minus sustained pitch: tension-modulation glide. */
  attackGlideCents: number;
  partialsDb: readonly number[];
  audiblePartialCount: number;
  higherHarmonicMassDb: number;
  tailDb: number;
}>;

export type PluckedGateFinding = Readonly<{ code: string; message: string }>;

export type PluckedOutputCell = Readonly<{
  id: string;
  family: PluckedFamily;
  algorithmId: string;
  midi: number;
  velocity: number;
  sampleRateHz: number;
  pcmSha256: string;
  features: PluckedOutputFeatures;
  outcome: "pass" | "fail";
  findings: readonly PluckedGateFinding[];
}>;

export type PluckedPairwiseCell = Readonly<{
  id: string;
  leftFamily: PluckedFamily;
  rightFamily: PluckedFamily;
  midi: 60;
  profileDistanceDb: number;
  outcome: "pass" | "fail";
}>;

type SourceBinding = Readonly<{ path: string; sha256: string }>;

export type PluckedV2ReleaseEvidence = Readonly<{
  schema: "changes.evidence.phs4-plucked-shipping-output.v1";
  policy: typeof PLUCKED_V2_RELEASE_POLICY;
  algorithmIds: readonly string[];
  wasmSha256: string;
  sourceBindings: readonly SourceBinding[];
  sourceClosureSha256: string;
  cells: readonly PluckedOutputCell[];
  pairwiseCells: readonly PluckedPairwiseCell[];
  controls: Readonly<{
    pureSineRejected: boolean;
    wrongPitchRejected: boolean;
    collapsedFamiliesRejected: boolean;
  }>;
  summary: Readonly<{
    outcome: "pass" | "fail";
    expectedCellCount: 12;
    passedCellCount: number;
    failedCellCount: number;
    expectedPairwiseCellCount: 6;
    passedPairwiseCellCount: number;
    failedPairwiseCellCount: number;
  }>;
  evidenceSha256: string;
}>;

const FAMILY_ORDER = Object.freeze([
  "archtop",
  "electric",
  "dreadnought",
  "ukulele",
] as const satisfies readonly PluckedFamily[]);

export const PLUCKED_V2_SOURCE_PATHS = Object.freeze([
  "dsp/concert-grand/src/plucked_v2.rs",
  "dsp/concert-grand/src/lib.rs",
  "src/audio/dsp-renderer.ts",
  "src/audio/instrument-recipes-contract.ts",
  "tests/fixtures/plucked-string-v2/instrument-packs.json",
  "tests/fixtures/plucked-string-v2/metric-cases.json",
  "scripts/run-plucked-v2-release-gate.ts",
]);

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record).sort().map((key) => [key, canonicalize(record[key])]),
    );
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function evidenceDigest(value: Omit<PluckedV2ReleaseEvidence, "evidenceSha256">): string {
  return sha256Hex(canonicalJson(value));
}

function midiHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

function mono(pcm: RenderedNotePcm): Float32Array {
  const samples = new Float32Array(pcm.frameCount);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = ((pcm.left[index] ?? 0) + (pcm.right[index] ?? 0)) * 0.5;
  }
  return samples;
}

function floatPcmSha256(samples: Float32Array): string {
  const bytes = new Uint8Array(samples.length * 4);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < samples.length; index += 1) {
    view.setFloat32(index * 4, samples[index] ?? 0, true);
  }
  return sha256Hex(bytes);
}

function rms(samples: Float32Array, start: number, length: number): number {
  const end = Math.min(samples.length, start + length);
  let energy = 0;
  for (let index = Math.max(0, start); index < end; index += 1) {
    energy += (samples[index] ?? 0) ** 2;
  }
  return Math.sqrt(energy / Math.max(1, end - Math.max(0, start)));
}

function goertzel(
  samples: Float32Array,
  sampleRateHz: number,
  start: number,
  length: number,
  frequencyHz: number,
): number {
  const end = Math.min(samples.length, start + length);
  const count = end - start;
  if (count < 2 || frequencyHz <= 0 || frequencyHz >= sampleRateHz * 0.5) return 0;
  const coefficient = 2 * Math.cos((2 * Math.PI * frequencyHz) / sampleRateHz);
  let previous = 0;
  let beforePrevious = 0;
  for (let index = 0; index < count; index += 1) {
    const taper = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (count - 1));
    const current = (samples[start + index] ?? 0) * taper +
      coefficient * previous - beforePrevious;
    beforePrevious = previous;
    previous = current;
  }
  return Math.sqrt(Math.max(0, previous ** 2 + beforePrevious ** 2 -
    coefficient * previous * beforePrevious));
}

function estimateCents(
  samples: Float32Array,
  sampleRateHz: number,
  start: number,
  length: number,
  expectedHz: number,
  /*
   * Sweep half-range. The sustain measurement keeps the precise +-12 cent
   * grid; the attack measurement sweeps +-60 so tension-modulation glide
   * beyond the tuning bound is MEASURABLE — with a +-12 grid both windows
   * clamped at the edge and the glide law could never fire (a gate that
   * cannot fail is not a gate; found via the pathological-glide mutation
   * control, canonical 2026-08-08).
   */
  sweepCents = 12,
): number {
  let bestCents = 0;
  let bestScore = -1;
  const quarterRange = Math.round(sweepCents * 4);
  for (let quarterCents = -quarterRange; quarterCents <= quarterRange; quarterCents += 1) {
    const cents = quarterCents * 0.25;
    const fundamental = expectedHz * 2 ** (cents / 1_200);
    let score = 0;
    for (let harmonic = 1; harmonic <= 4; harmonic += 1) {
      score += goertzel(samples, sampleRateHz, start, length,
        fundamental * harmonic) / harmonic;
    }
    if (score > bestScore) {
      bestScore = score;
      bestCents = cents;
    }
  }
  return bestCents;
}

export function analyzePluckedOutput(
  samples: Float32Array,
  sampleRateHz: number,
  midi: number,
): PluckedOutputFeatures {
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  const onsetThreshold = peak * PLUCKED_V2_RELEASE_POLICY.onsetThresholdOfPeak;
  let onset = 0;
  while (onset < samples.length && Math.abs(samples[onset] ?? 0) < onsetThreshold) onset += 1;
  const earlyStart = onset + Math.round(
    PLUCKED_V2_RELEASE_POLICY.earlyWindowStartAfterOnsetMs * sampleRateHz / 1_000,
  );
  const earlyLength = Math.round(
    PLUCKED_V2_RELEASE_POLICY.earlyWindowLengthMs * sampleRateHz / 1_000,
  );
  const expectedHz = midiHz(midi);
  const attackCents = estimateCents(samples, sampleRateHz, earlyStart, earlyLength, expectedHz, 60);
  const sustainStart = onset + Math.round(
    PLUCKED_V2_RELEASE_POLICY.sustainWindowStartAfterOnsetMs * sampleRateHz / 1_000,
  );
  const pitchCents = estimateCents(samples, sampleRateHz, sustainStart, earlyLength, expectedHz);
  const attackGlideCents = attackCents - pitchCents;
  /* Partials characterize the attack, so they stay locked to the attack pitch. */
  const fittedHz = expectedHz * 2 ** (attackCents / 1_200);
  const amplitudes = Array.from(
    { length: PLUCKED_V2_RELEASE_POLICY.partialCount },
    (_, index) => goertzel(samples, sampleRateHz, earlyStart, earlyLength,
      fittedHz * (index + 1)),
  );
  const fundamental = Math.max(1e-20, amplitudes[0] ?? 0);
  const partialsDb = Object.freeze(amplitudes.map((amplitude) =>
    20 * Math.log10(Math.max(1e-20, amplitude) / fundamental)));
  const higherEnergy = amplitudes.slice(1).reduce(
    (sum, amplitude) => sum + amplitude * amplitude,
    0,
  );
  const earlyRms = rms(samples, earlyStart, earlyLength);
  const tailStart = onset + Math.round(
    PLUCKED_V2_RELEASE_POLICY.tailWindowStartAfterOnsetMs * sampleRateHz / 1_000,
  );
  const tailLength = Math.round(
    PLUCKED_V2_RELEASE_POLICY.tailWindowLengthMs * sampleRateHz / 1_000,
  );
  const tailRms = rms(samples, tailStart, tailLength);
  return Object.freeze({
    peak,
    earlyRms,
    onsetMs: onset * 1_000 / sampleRateHz,
    pitchCents,
    attackGlideCents,
    partialsDb,
    audiblePartialCount: partialsDb.filter((value) =>
      value >= PLUCKED_V2_RELEASE_POLICY.audiblePartialFloorDb).length,
    higherHarmonicMassDb: 10 * Math.log10(Math.max(1e-30, higherEnergy) /
      (fundamental * fundamental)),
    tailDb: 20 * Math.log10(Math.max(1e-20, tailRms) / Math.max(1e-20, earlyRms)),
  });
}

export function evaluatePluckedOutput(
  family: PluckedFamily,
  features: PluckedOutputFeatures,
): readonly PluckedGateFinding[] {
  const policy = PLUCKED_V2_RELEASE_POLICY.families[family];
  const findings: PluckedGateFinding[] = [];
  const add = (code: string, message: string): void => {
    findings.push({ code, message });
  };
  const scalarMeasurements = [
    features.peak,
    features.earlyRms,
    features.onsetMs,
    features.pitchCents,
    features.audiblePartialCount,
    features.higherHarmonicMassDb,
    features.tailDb,
  ];
  if (scalarMeasurements.some((value) => !Number.isFinite(value)) ||
    features.partialsDb.some((item) => !Number.isFinite(item))) {
    add("PLUCKED_NONFINITE", "all output measurements must be finite");
  }
  if (features.peak < policy.minimumPeak ||
    features.peak > PLUCKED_V2_RELEASE_POLICY.maximumPeak) {
    add("PLUCKED_PEAK", `peak ${String(features.peak)} is inaudible or clipped`);
  }
  if (features.earlyRms < policy.minimumEarlyRms ||
    features.earlyRms > policy.maximumEarlyRms) {
    add("PLUCKED_EARLY_RMS", `early RMS ${String(features.earlyRms)} is outside the mix window`);
  }
  if (features.onsetMs > PLUCKED_V2_RELEASE_POLICY.maximumOnsetMs) {
    add("PLUCKED_ONSET", `onset ${String(features.onsetMs)}ms is late`);
  }
  if (Math.abs(features.pitchCents) > policy.maximumPitchCents) {
    add("PLUCKED_PITCH", `pitch error ${String(features.pitchCents)} cents`);
  }
  if (Math.abs(features.attackGlideCents) >
    PLUCKED_V2_RELEASE_POLICY.maximumAttackGlideCents) {
    add("PLUCKED_GLIDE",
      `attack glide ${String(features.attackGlideCents)} cents exceeds the tension-modulation cap`);
  }
  if ((features.partialsDb[1] ?? -Infinity) < policy.minimumSecondPartialDb) {
    add("PLUCKED_SECOND_PARTIAL", `h2 ${String(features.partialsDb[1])}dB is too weak`);
  }
  if ((features.partialsDb[2] ?? -Infinity) < policy.minimumThirdPartialDb) {
    add("PLUCKED_THIRD_PARTIAL", `h3 ${String(features.partialsDb[2])}dB is too weak`);
  }
  if (features.audiblePartialCount < policy.minimumAudiblePartialCount) {
    add("PLUCKED_HARMONIC_COLLAPSE",
      `${String(features.audiblePartialCount)} audible partials; need ${String(policy.minimumAudiblePartialCount)}`);
  }
  if (features.higherHarmonicMassDb < policy.minimumHigherHarmonicMassDb) {
    add("PLUCKED_HARMONIC_MASS",
      `higher-harmonic mass ${String(features.higherHarmonicMassDb)}dB is too low`);
  }
  if (features.tailDb < policy.minimumTailDb ||
    features.tailDb > policy.maximumTailDb) {
    add("PLUCKED_TAIL", `tail ${String(features.tailDb)}dB is outside the physical window`);
  }
  return Object.freeze(findings);
}

function profileDistance(left: PluckedOutputFeatures, right: PluckedOutputFeatures): number {
  const count = Math.min(left.partialsDb.length, right.partialsDb.length);
  let sum = 0;
  for (let index = 1; index < count; index += 1) {
    sum += ((left.partialsDb[index] ?? 0) - (right.partialsDb[index] ?? 0)) ** 2;
  }
  return Math.sqrt(sum / Math.max(1, count - 1));
}

async function sourceBindings(root: string): Promise<readonly SourceBinding[]> {
  return Object.freeze(await Promise.all(PLUCKED_V2_SOURCE_PATHS.map(async (path) => Object.freeze({
    path,
    sha256: sha256Hex(new Uint8Array(await readFile(resolve(root, path)))),
  }))));
}

function summarize(
  cells: readonly PluckedOutputCell[],
  pairwiseCells: readonly PluckedPairwiseCell[],
  controls: PluckedV2ReleaseEvidence["controls"],
): PluckedV2ReleaseEvidence["summary"] {
  const passedCellCount = cells.filter((cell) => cell.outcome === "pass").length;
  const passedPairwiseCellCount = pairwiseCells.filter((cell) => cell.outcome === "pass").length;
  const fail = cells.length !== 12 || pairwiseCells.length !== 6 || passedCellCount !== 12 ||
    passedPairwiseCellCount !== 6 || !Object.values(controls).every(Boolean);
  return Object.freeze({
    outcome: fail ? "fail" : "pass",
    expectedCellCount: 12,
    passedCellCount,
    failedCellCount: cells.length - passedCellCount,
    expectedPairwiseCellCount: 6,
    passedPairwiseCellCount,
    failedPairwiseCellCount: pairwiseCells.length - passedPairwiseCellCount,
  });
}

function pureSineFeatures(): PluckedOutputFeatures {
  return Object.freeze({
    peak: 0.5,
    earlyRms: 0.3,
    onsetMs: 0,
    pitchCents: 0,
    attackGlideCents: 0,
    partialsDb: Object.freeze([0, ...Array.from({ length: 9 }, () => -120)]),
    audiblePartialCount: 1,
    higherHarmonicMassDb: -120,
    tailDb: -12,
  });
}

export async function runPluckedV2ReleaseGate(
  root = process.cwd(),
): Promise<PluckedV2ReleaseEvidence> {
  const bindingsBefore = await sourceBindings(root);
  const renderers = await loadWaveguideRenderers();
  const cells: PluckedOutputCell[] = [];
  for (const family of FAMILY_ORDER) {
    const policy = PLUCKED_V2_RELEASE_POLICY.families[family];
    const renderer = renderers.get(policy.algorithmId);
    if (renderer === undefined) throw new Error(`PLUCKED_RENDERER_MISSING:${policy.algorithmId}`);
    for (const midi of policy.midi) {
      const pcm = renderer.renderNote(
        midi,
        PLUCKED_V2_RELEASE_POLICY.velocity,
        PLUCKED_V2_RELEASE_POLICY.sampleRateHz,
        PLUCKED_V2_RELEASE_POLICY.renderSeconds,
      );
      if (pcm === null) throw new Error(`PLUCKED_RENDER_REFUSED:${family}:${String(midi)}`);
      const samples = mono(pcm);
      const features = analyzePluckedOutput(samples, pcm.sampleRateHz, midi);
      const findings = evaluatePluckedOutput(family, features);
      cells.push(Object.freeze({
        id: `${family}-m${String(midi)}`,
        family,
        algorithmId: policy.algorithmId,
        midi,
        velocity: PLUCKED_V2_RELEASE_POLICY.velocity,
        sampleRateHz: pcm.sampleRateHz,
        pcmSha256: floatPcmSha256(samples),
        features,
        outcome: findings.length === 0 ? "pass" : "fail",
        findings,
      }));
    }
  }
  const common = new Map(cells.filter((cell) => cell.midi === 60)
    .map((cell) => [cell.family, cell]));
  const pairwiseCells: PluckedPairwiseCell[] = [];
  for (let left = 0; left < FAMILY_ORDER.length; left += 1) {
    for (let right = left + 1; right < FAMILY_ORDER.length; right += 1) {
      const leftFamily = FAMILY_ORDER[left] as PluckedFamily;
      const rightFamily = FAMILY_ORDER[right] as PluckedFamily;
      const leftCell = common.get(leftFamily);
      const rightCell = common.get(rightFamily);
      if (leftCell === undefined || rightCell === undefined) {
        throw new Error("PLUCKED_COMMON_CELL_MISSING");
      }
      const distance = profileDistance(leftCell.features, rightCell.features);
      pairwiseCells.push(Object.freeze({
        id: `${leftFamily}-vs-${rightFamily}-m60`,
        leftFamily,
        rightFamily,
        midi: 60,
        profileDistanceDb: distance,
        outcome: distance >= PLUCKED_V2_RELEASE_POLICY.minimumPairwiseProfileDistanceDb
          ? "pass" : "fail",
      }));
    }
  }
  const collapsed = profileDistance(pureSineFeatures(), pureSineFeatures());
  const controls = Object.freeze({
    pureSineRejected: FAMILY_ORDER.every((family) =>
      evaluatePluckedOutput(family, pureSineFeatures()).some((item) =>
        item.code === "PLUCKED_HARMONIC_COLLAPSE")),
    wrongPitchRejected: FAMILY_ORDER.every((family) => evaluatePluckedOutput(family,
      Object.freeze({ ...pureSineFeatures(), pitchCents: 12 })).some((item) =>
      item.code === "PLUCKED_PITCH")),
    collapsedFamiliesRejected:
      collapsed < PLUCKED_V2_RELEASE_POLICY.minimumPairwiseProfileDistanceDb,
  });
  const bindingsAfter = await sourceBindings(root);
  if (canonicalJson(bindingsBefore) !== canonicalJson(bindingsAfter)) {
    throw new Error("PLUCKED_INPUT_CLOSURE_DRIFT");
  }
  const algorithmIds = Object.freeze(FAMILY_ORDER.map((family) =>
    PLUCKED_V2_RELEASE_POLICY.families[family].algorithmId).sort());
  const sourceClosureSha256 = sha256Hex(canonicalJson(bindingsBefore));
  const summary = summarize(cells, pairwiseCells, controls);
  const unsigned = Object.freeze({
    schema: "changes.evidence.phs4-plucked-shipping-output.v1" as const,
    policy: PLUCKED_V2_RELEASE_POLICY,
    algorithmIds,
    wasmSha256: CONCERT_GRAND_WASM_SHA256,
    sourceBindings: bindingsBefore,
    sourceClosureSha256,
    cells: Object.freeze(cells),
    pairwiseCells: Object.freeze(pairwiseCells),
    controls,
    summary,
  });
  return Object.freeze({ ...unsigned, evidenceSha256: evidenceDigest(unsigned) });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function verifyPluckedV2ReleaseEvidence(
  value: unknown,
): value is PluckedV2ReleaseEvidence {
  if (!isRecord(value) ||
    value["schema"] !== "changes.evidence.phs4-plucked-shipping-output.v1" ||
    canonicalJson(value["policy"]) !== canonicalJson(PLUCKED_V2_RELEASE_POLICY) ||
    !Array.isArray(value["algorithmIds"]) || !Array.isArray(value["sourceBindings"]) ||
    !Array.isArray(value["cells"]) || !Array.isArray(value["pairwiseCells"]) ||
    !isRecord(value["controls"]) || !isRecord(value["summary"]) ||
    typeof value["wasmSha256"] !== "string" ||
    typeof value["sourceClosureSha256"] !== "string" ||
    typeof value["evidenceSha256"] !== "string") return false;
  const evidence = value as unknown as PluckedV2ReleaseEvidence;
  const expectedAlgorithms = FAMILY_ORDER.map((family) =>
    PLUCKED_V2_RELEASE_POLICY.families[family].algorithmId).sort();
  if (canonicalJson(evidence.algorithmIds) !== canonicalJson(expectedAlgorithms) ||
    !/^[0-9a-f]{64}$/u.test(evidence.wasmSha256) ||
    evidence.sourceBindings.length !== PLUCKED_V2_SOURCE_PATHS.length ||
    canonicalJson(evidence.sourceBindings.map((item) => item.path)) !== canonicalJson(PLUCKED_V2_SOURCE_PATHS) ||
    evidence.sourceBindings.some((item) => !/^[0-9a-f]{64}$/u.test(item.sha256)) ||
    sha256Hex(canonicalJson(evidence.sourceBindings)) !== evidence.sourceClosureSha256) return false;
  const expectedCells = FAMILY_ORDER.flatMap((family) =>
    PLUCKED_V2_RELEASE_POLICY.families[family].midi.map((midi) => `${family}-m${String(midi)}`));
  if (evidence.cells.length !== 12 ||
    canonicalJson(evidence.cells.map((cell) => cell.id)) !== canonicalJson(expectedCells)) return false;
  for (const cell of evidence.cells) {
    const familyPolicy = PLUCKED_V2_RELEASE_POLICY.families[cell.family];
    if (cell.algorithmId !== familyPolicy.algorithmId ||
      !familyPolicy.midi.includes(cell.midi) ||
      cell.velocity !== PLUCKED_V2_RELEASE_POLICY.velocity ||
      cell.sampleRateHz !== PLUCKED_V2_RELEASE_POLICY.sampleRateHz ||
      !/^[0-9a-f]{64}$/u.test(cell.pcmSha256) ||
      cell.outcome !== "pass" || cell.findings.length !== 0 ||
      evaluatePluckedOutput(cell.family, cell.features).length !== 0) return false;
  }
  const common = new Map(evidence.cells.filter((cell) => cell.midi === 60)
    .map((cell) => [cell.family, cell]));
  const expectedPairwise: PluckedPairwiseCell[] = [];
  for (let left = 0; left < FAMILY_ORDER.length; left += 1) {
    for (let right = left + 1; right < FAMILY_ORDER.length; right += 1) {
      const leftFamily = FAMILY_ORDER[left] as PluckedFamily;
      const rightFamily = FAMILY_ORDER[right] as PluckedFamily;
      const leftCell = common.get(leftFamily);
      const rightCell = common.get(rightFamily);
      if (leftCell === undefined || rightCell === undefined) return false;
      const distance = profileDistance(leftCell.features, rightCell.features);
      expectedPairwise.push({
        id: `${leftFamily}-vs-${rightFamily}-m60`,
        leftFamily,
        rightFamily,
        midi: 60,
        profileDistanceDb: distance,
        outcome: distance >= PLUCKED_V2_RELEASE_POLICY.minimumPairwiseProfileDistanceDb
          ? "pass" : "fail",
      });
    }
  }
  if (evidence.pairwiseCells.length !== 6 || evidence.pairwiseCells.some((cell, index) => {
    const expected = expectedPairwise[index];
    return expected === undefined || cell.id !== expected.id ||
      cell.leftFamily !== expected.leftFamily || cell.rightFamily !== expected.rightFamily ||
      cell.outcome !== "pass" || expected.outcome !== "pass" ||
      Math.abs(cell.profileDistanceDb - expected.profileDistanceDb) > 1e-12;
  })) return false;
  if (!evidence.controls.pureSineRejected || !evidence.controls.wrongPitchRejected ||
    !evidence.controls.collapsedFamiliesRejected) return false;
  if (canonicalJson(summarize(evidence.cells, evidence.pairwiseCells, evidence.controls)) !==
    canonicalJson(evidence.summary) || evidence.summary.outcome !== "pass") return false;
  const { evidenceSha256, ...unsigned } = evidence;
  return evidenceSha256 === evidenceDigest(unsigned);
}

export function pluckedEvidenceIncludesAlgorithm(
  evidence: PluckedV2ReleaseEvidence,
  algorithmId: string,
): boolean {
  return evidence.algorithmIds.includes(algorithmId);
}

if (import.meta.main) {
  const result = await runPluckedV2ReleaseGate();
  const arguments_ = process.argv.slice(2);
  const outputIndex = arguments_.indexOf("--output");
  const outputPath = outputIndex < 0 ? null : arguments_[outputIndex + 1] ?? null;
  /*
   * Fail closed on unrecognized flags. This gate renders the COMMITTED
   * embed (src/audio/wasm/concert-grand-wasm.ts) via loadWaveguideRenderers;
   * a silently ignored `--wasm <path>` convinced two sessions in August 2026
   * that they had measured scratch builds when they had measured the embed
   * (bead jcpe-plucked-improved-calibration-debt-ocw5). Regenerate the embed
   * first; the recorded wasmSha256 binds the evidence to it.
   */
  const recognized = new Set(outputIndex < 0 ? [] : [outputIndex, outputIndex + 1]);
  const unknown = arguments_.filter((_, index) => !recognized.has(index));
  if (unknown.length > 0) {
    throw new Error(
      `unrecognized argument(s) ${unknown.join(" ")}: this gate always renders the committed ` +
      "embed (regenerate via `bun scripts/build-dsp.ts` first); usage: " +
      "bun scripts/run-plucked-v2-release-gate.ts [--output <path>]",
    );
  }
  const serialized = `${JSON.stringify(result, null, 2)}\n`;
  if (outputIndex >= 0 && outputPath === null) {
    throw new Error("usage: bun scripts/run-plucked-v2-release-gate.ts [--output <path>]");
  }
  if (outputPath === null) process.stdout.write(serialized);
  else await writeFile(resolve(process.cwd(), outputPath), serialized);
  process.exitCode = result.summary.outcome === "pass" ? 0 : 1;
}
