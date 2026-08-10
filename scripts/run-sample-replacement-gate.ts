/**
 * Fail-closed shipping gate for physical models that replace the CC0 sampled
 * recipes (bead jcpe-sample-elimination-physical-qzgo): the modal vibraphone
 * (changes.dsp.vibes@2) and the plucked upright bass
 * (changes.dsp.plucked-upright-bass@1).
 *
 * The replaced samples themselves are the reference corpus: a physical model
 * earns the swap only when its rendered notes land on pitch, decay like the
 * instrument, grow with velocity, and sit measurably closer to the recorded
 * corpus than a planted same-pitch impostor from a different instrument
 * family. Following the trumpet release-gate pattern: a frozen policy object,
 * measured feature cells, planted controls earned live on every run, and an
 * evidence JSON hash-bound to the exact wasm payload and payload corpus so
 * `bun run predeploy:check` can re-verify every verdict offline from the
 * stored features without re-rendering.
 *
 * Run:    bun scripts/run-sample-replacement-gate.ts --instrument vibes
 *         bun scripts/run-sample-replacement-gate.ts --instrument upright-bass
 * Writes: release-evidence/audio/listening/<instrument>-replacement-evidence.json
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  loadWaveguideRenderers,
  PLUCKED_UPRIGHT_BASS_ALGORITHM_ID,
  VIBES_V2_ALGORITHM_ID,
  type RenderedNotePcm,
} from "../src/audio/dsp-renderer";
import { CONCERT_GRAND_WASM_SHA256 } from "../src/audio/wasm/concert-grand-wasm";
import {
  UPRIGHT_BASS_SAMPLES_BASE64,
  UPRIGHT_BASS_SAMPLES_RATE_HZ,
  UPRIGHT_BASS_SAMPLES_SHA256,
  UPRIGHT_BASS_SAMPLES_SLICE_INDEX,
} from "../src/audio/wasm/upright-bass-samples";
import {
  VIBRAPHONE_SAMPLES_BASE64,
  VIBRAPHONE_SAMPLES_RATE_HZ,
  VIBRAPHONE_SAMPLES_SHA256,
  VIBRAPHONE_SAMPLES_SLICE_INDEX,
} from "../src/audio/wasm/vibraphone-samples";

export const SAMPLE_REPLACEMENT_EVIDENCE_SCHEMA =
  "changes.evidence.sample-replacement-output.v3" as const;

type CorpusSlice = Readonly<{
  midiPitch: number;
  tuningCents: number;
  byteOffset: number;
  frameCount: number;
}>;

export type SampleReplacementPolicy = Readonly<{
  schema: "changes.policy.sample-replacement-shipping-output.v3";
  instrument: "vibes" | "upright-bass";
  algorithmId: string;
  sampleRateHz: number;
  renderSeconds: number;
  midi: readonly number[];
  velocities: readonly [number, number];
  /* Early analysis window where the fundamental dominates. */
  pitchWindowSeconds: readonly [number, number];
  maximumAbsolutePitchCents: number;
  /* Decay law: late-window RMS must fall below earlyRatio x early RMS. */
  earlyWindowSeconds: readonly [number, number];
  lateWindowSeconds: readonly [number, number];
  maximumLateToEarlyRmsRatio: number;
  /*
   * Temporal-character law. The checked-in vibraphone corpus reaches its
   * loudest 20 ms window 40-100 ms after impact; an immediate maximum is the
   * metallic ring the owner rejected. The 30 ms floor leaves one 10 ms hop of
   * tolerance below the earliest reviewed reference, and the upper bound
   * refuses a delayed plateau after the latest reviewed peak. Upright
   * pizzicato has no delayed-bloom floor, but still carries its corpus-earned
   * upper bound.
   */
  temporalPeakWindowSeconds: number;
  temporalPeakHopSeconds: number;
  temporalPeakSearchSeconds: readonly [number, number];
  minimumTemporalPeakSeconds: number;
  maximumTemporalPeakSeconds: number;
  minimumEarlyRms: number;
  maximumPeak: number;
  /*
   * Corpus proximity: band-profile distance between the model and the
   * recorded slice at the same pitch must stay below the planted impostor's
   * measured distance by at least this exclusion margin (dB). The corpus IS
   * the instrument; the impostor (a same-pitch render from a different
   * family) proves the bound discriminates.
   */
  proximityMidi: readonly number[];
  impostorAlgorithmId: string;
  minimumImpostorMarginDb: number;
}>;

export const VIBES_REPLACEMENT_POLICY: SampleReplacementPolicy = Object.freeze({
  schema: "changes.policy.sample-replacement-shipping-output.v3",
  instrument: "vibes",
  algorithmId: VIBES_V2_ALGORITHM_ID,
  sampleRateHz: 48_000,
  renderSeconds: 4,
  midi: Object.freeze([53, 60, 67, 74, 84]),
  velocities: Object.freeze([64, 110] as const),
  pitchWindowSeconds: Object.freeze([0.05, 1.05] as const),
  maximumAbsolutePitchCents: 10,
  earlyWindowSeconds: Object.freeze([0.2, 1.2] as const),
  lateWindowSeconds: Object.freeze([2.5, 3.5] as const),
  /* Pedal-down bars ring: late energy persists but must clearly decay. */
  maximumLateToEarlyRmsRatio: 0.7,
  temporalPeakWindowSeconds: 0.02,
  temporalPeakHopSeconds: 0.01,
  temporalPeakSearchSeconds: Object.freeze([0, 1] as const),
  minimumTemporalPeakSeconds: 0.03,
  /* Corpus maxima are 40--100 ms; keep one 10 ms hop of headroom. */
  maximumTemporalPeakSeconds: 0.11,
  minimumEarlyRms: 1.0e-4,
  maximumPeak: 0.98,
  proximityMidi: Object.freeze([53, 60, 67, 74, 84]),
  impostorAlgorithmId: "changes.dsp.plucked-archtop@2",
  minimumImpostorMarginDb: 1.5,
});

export const UPRIGHT_BASS_REPLACEMENT_POLICY: SampleReplacementPolicy =
  Object.freeze({
    schema: "changes.policy.sample-replacement-shipping-output.v3",
    instrument: "upright-bass",
    algorithmId: PLUCKED_UPRIGHT_BASS_ALGORITHM_ID,
    sampleRateHz: 48_000,
    renderSeconds: 3,
    midi: Object.freeze([28, 33, 38, 43]),
    velocities: Object.freeze([64, 110] as const),
    pitchWindowSeconds: Object.freeze([0.05, 0.85] as const),
    maximumAbsolutePitchCents: 10,
    earlyWindowSeconds: Object.freeze([0.1, 0.6] as const),
    lateWindowSeconds: Object.freeze([1.5, 2.5] as const),
    /* Pizzicato dies fast: the late window must sit well under the pluck. */
    maximumLateToEarlyRmsRatio: 0.45,
    temporalPeakWindowSeconds: 0.02,
    temporalPeakHopSeconds: 0.01,
    temporalPeakSearchSeconds: Object.freeze([0, 1] as const),
    minimumTemporalPeakSeconds: 0,
    /* Corpus maxima are 70--530 ms across these reviewed low-register cells. */
    maximumTemporalPeakSeconds: 0.54,
    minimumEarlyRms: 1.0e-4,
    maximumPeak: 0.98,
    /*
     * Same-pitch impostor cells need an impostor that can render the pitch:
     * every other plucked model's playable window starts at E2 (midi 40),
     * so the same-pitch overlap is the corpus rows at/above E2. Rows 40 and
     * 45 measure >35 cents off their own labels (the recordings are simply
     * detuned; the sampled recipe shipped that detune) and refuse as
     * references (49 reads -179 cents: the source corpus labels are simply
     * unreliable up there); 42 is the one row that measures true. The lower corpus rows are still
     * covered by the pitch/decay/dynamics cells.
     */
    proximityMidi: Object.freeze([42]),
    impostorAlgorithmId: "changes.dsp.plucked-dreadnought@1",
    minimumImpostorMarginDb: 1.5,
  });

export type ReplacementOutputFeatures = Readonly<{
  pitchCents: number;
  periodicity: number;
  earlyRms: number;
  lateToEarlyRmsRatio: number;
  temporalPeakSeconds: number;
  peak: number;
}>;

export type ReplacementGateFinding = Readonly<{ code: string; message: string }>;

export type ReplacementOutputCell = Readonly<{
  id: string;
  algorithmId: string;
  midi: number;
  velocity: number;
  sampleRateHz: number;
  pcmSha256: string;
  features: ReplacementOutputFeatures;
  outcome: "pass" | "fail";
  findings: readonly ReplacementGateFinding[];
}>;

export type ReplacementDynamicsCell = Readonly<{
  id: string;
  midi: number;
  rmsRise: number;
  outcome: "pass" | "fail";
}>;

export type ReplacementProximityCell = Readonly<{
  id: string;
  midi: number;
  corpusPitchCents: number;
  candidateDistanceDb: number;
  impostorDistanceDb: number;
  marginDb: number;
  outcome: "pass" | "fail";
}>;

type SourceBinding = Readonly<{ path: string; sha256: string }>;

export type SampleReplacementEvidence = Readonly<{
  schema: typeof SAMPLE_REPLACEMENT_EVIDENCE_SCHEMA;
  policy: SampleReplacementPolicy;
  algorithmIds: readonly string[];
  wasmSha256: string;
  corpusSha256: string;
  sourceBindings: readonly SourceBinding[];
  sourceClosureSha256: string;
  cells: readonly ReplacementOutputCell[];
  dynamicsCells: readonly ReplacementDynamicsCell[];
  proximityCells: readonly ReplacementProximityCell[];
  controls: Readonly<{
    outOfRangeRefused: boolean;
    wrongPitchRejected: boolean;
    silentRejected: boolean;
    clippingRejected: boolean;
    sustainedRejected: boolean;
    immediateRingRejected: boolean;
    lateRingRejected: boolean;
    flatDynamicsRejected: boolean;
    impostorRejected: boolean;
  }>;
  summary: Readonly<{
    outcome: "pass" | "fail";
    passedCellCount: number;
    passedDynamicsCellCount: number;
    passedProximityCellCount: number;
  }>;
  evidenceSha256: string;
}>;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, entry]) => [key, canonicalize(entry)]));
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sha256Hex(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function midiHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function mono(pcm: RenderedNotePcm): Float32Array {
  const merged = new Float32Array(pcm.frameCount);
  for (let index = 0; index < pcm.frameCount; index += 1) {
    merged[index] = ((pcm.left[index] ?? 0) + (pcm.right[index] ?? 0)) / 2;
  }
  return merged;
}

function floatPcmSha256(samples: Float32Array): string {
  const bytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
  return sha256Hex(bytes);
}

function windowRms(
  samples: Float32Array,
  sampleRateHz: number,
  window: readonly [number, number],
): number {
  const start = Math.min(Math.floor(window[0] * sampleRateHz), samples.length);
  const end = Math.min(Math.floor(window[1] * sampleRateHz), samples.length);
  if (end <= start) return 0;
  let squares = 0;
  for (let index = start; index < end; index += 1) {
    const value = samples[index] ?? 0;
    squares += value * value;
  }
  return Math.sqrt(squares / (end - start));
}

export function temporalPeakSeconds(
  policy: SampleReplacementPolicy,
  samples: Float32Array,
  sampleRateHz: number,
): number {
  const searchStart = Math.max(
    0,
    Math.floor(policy.temporalPeakSearchSeconds[0] * sampleRateHz),
  );
  const searchEnd = Math.min(
    samples.length,
    Math.floor(policy.temporalPeakSearchSeconds[1] * sampleRateHz),
  );
  const windowFrames = Math.max(
    1,
    Math.round(policy.temporalPeakWindowSeconds * sampleRateHz),
  );
  const hopFrames = Math.max(
    1,
    Math.round(policy.temporalPeakHopSeconds * sampleRateHz),
  );
  if (searchEnd - searchStart < windowFrames) return Number.NaN;

  let maximumSquares = -1;
  let maximumFrame = searchStart;
  for (
    let frame = searchStart;
    frame + windowFrames <= searchEnd;
    frame += hopFrames
  ) {
    let squares = 0;
    for (let index = frame; index < frame + windowFrames; index += 1) {
      const value = samples[index] ?? 0;
      squares += value * value;
    }
    if (squares > maximumSquares) {
      maximumSquares = squares;
      maximumFrame = frame;
    }
  }
  return maximumFrame / sampleRateHz;
}

/** 4th-order one-pole lowpass isolating the fundamental for pitch reads:
 * vibraphone spectra are near-sinusoidal with a strong 4x partial that can
 * capture a raw autocorrelation; verification bandpasses below 1.4x target
 * on BOTH the model and the corpus, per the tuning-fixture precedent. */
function fundamentalBand(
  samples: Float32Array,
  sampleRateHz: number,
  targetHz: number,
): Float32Array {
  const cutoffHz = targetHz * 1.4;
  const alpha = 1 - Math.exp(-2 * Math.PI * cutoffHz / sampleRateHz);
  const out = new Float32Array(samples.length);
  let s1 = 0;
  let s2 = 0;
  let s3 = 0;
  let s4 = 0;
  for (let index = 0; index < samples.length; index += 1) {
    s1 += alpha * ((samples[index] ?? 0) - s1);
    s2 += alpha * (s1 - s2);
    s3 += alpha * (s2 - s3);
    s4 += alpha * (s3 - s4);
    out[index] = s4;
  }
  return out;
}

/** Autocorrelation pitch, first-peak-over-threshold (trumpet-gate law). */
function estimatePitch(
  samples: Float32Array,
  sampleRateHz: number,
  targetHz: number,
): Readonly<{ hz: number; periodicity: number }> {
  let mean = 0;
  for (const value of samples) mean += value;
  mean /= Math.max(1, samples.length);
  const lagMin = Math.max(2, Math.floor(sampleRateHz / (targetHz * 1.9)));
  const lagMax = Math.ceil(sampleRateHz / (targetHz * 0.55));
  const scores: number[] = [];
  for (let lag = lagMin; lag <= lagMax; lag += 1) {
    let cross = 0;
    let left = 0;
    let right = 0;
    for (let index = 0; index + lag < samples.length; index += 1) {
      const a = (samples[index] ?? 0) - mean;
      const b = (samples[index + lag] ?? 0) - mean;
      cross += a * b;
      left += a * a;
      right += b * b;
    }
    scores.push(cross / Math.max(Math.sqrt(left * right), 1e-30));
  }
  const global = Math.max(...scores);
  const threshold = Math.max(global * 0.97, 0.5);
  let peak = -1;
  for (let index = 1; index + 1 < scores.length; index += 1) {
    const center = scores[index] ?? 0;
    if (center >= threshold && center > (scores[index - 1] ?? 0) &&
      center >= (scores[index + 1] ?? 0)) {
      peak = index;
      break;
    }
  }
  if (peak < 0) peak = scores.indexOf(global);
  const left = scores[peak - 1] ?? scores[peak] ?? 0;
  const center = scores[peak] ?? 0;
  const right = scores[peak + 1] ?? scores[peak] ?? 0;
  const curvature = left - 2 * center + right;
  const offset = Math.abs(curvature) > 1e-12
    ? Math.max(-0.5, Math.min(0.5, 0.5 * (left - right) / curvature))
    : 0;
  return Object.freeze({
    hz: sampleRateHz / (lagMin + peak + offset),
    periodicity: center,
  });
}

/*
 * Octave-band log-energy profile over the first quarter-second: the proximity metric
 * compares timbral balance, not exact waveforms, so recorded room character
 * cannot dominate the verdict. Bands: 0-250, 250-500, 500-1k, 1k-2k, 2k-4k Hz.
 */
const PROXIMITY_BANDS_HZ: readonly (readonly [number, number])[] = Object.freeze([
  Object.freeze([50, 100] as const),
  Object.freeze([100, 200] as const),
  Object.freeze([200, 400] as const),
  Object.freeze([400, 800] as const),
  Object.freeze([800, 1_600] as const),
  Object.freeze([1_600, 3_200] as const),
  Object.freeze([3_200, 6_400] as const),
]);

function bandProfileDb(samples: Float32Array, sampleRateHz: number): number[] {
  /* Equal-TIME analysis on both sides of every comparison: the corpus is
   * 32 kHz and the candidate 48 kHz, so a fixed sample count would compare
   * a 0.26 s recording window against a 0.17 s render window and skew every
   * distance toward the attack. 0.25 s at each rate, DFT over the window. */
  const size = 16_384;
  const count = Math.min(Math.round(0.25 * sampleRateHz), size, samples.length);
  const windowed = new Float64Array(size);
  for (let index = 0; index < count; index += 1) {
    const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (count - 1));
    windowed[index] = (samples[index] ?? 0) * hann;
  }
  const energies = PROXIMITY_BANDS_HZ.map(() => 0);
  for (let bin = 1; bin < size / 2; bin += 1) {
    const hz = (bin * sampleRateHz) / size;
    const band = PROXIMITY_BANDS_HZ.findIndex(
      (range) => hz >= range[0] && hz < range[1],
    );
    if (band < 0) continue;
    let sumReal = 0;
    let sumImag = 0;
    const step = (2 * Math.PI * bin) / size;
    for (let index = 0; index < count; index += 1) {
      const angle = step * index;
      const value = windowed[index] ?? 0;
      sumReal += value * Math.cos(angle);
      sumImag -= value * Math.sin(angle);
    }
    energies[band] = (energies[band] ?? 0) + sumReal * sumReal + sumImag * sumImag;
  }
  const total = energies.reduce((sum, value) => sum + value, 0);
  /* Perceptual floor: a band more than 40 dB under the total is inaudible,
   * so silence there must not dominate the distance the way a raw log
   * would (a physical model has true zeros where a recording has room
   * floor). */
  return energies.map((value) => Math.max(
    10 * Math.log10(Math.max(value, 1e-30) / Math.max(total, 1e-30)),
    -40,
  ));
}

function bandDistanceDb(left: readonly number[], right: readonly number[]): number {
  let squares = 0;
  for (let index = 0; index < left.length; index += 1) {
    const delta = (left[index] ?? 0) - (right[index] ?? 0);
    squares += delta * delta;
  }
  return Math.sqrt(squares / Math.max(1, left.length));
}

export function replacementDynamicsPasses(
  quieterEarlyRms: number,
  louderEarlyRms: number,
): boolean {
  return Number.isFinite(quieterEarlyRms) &&
    Number.isFinite(louderEarlyRms) &&
    louderEarlyRms > quieterEarlyRms;
}

export function replacementProximityPasses(
  policy: SampleReplacementPolicy,
  corpusPitchCents: number,
  candidateDistanceDb: number,
  impostorDistanceDb: number,
): boolean {
  if (![corpusPitchCents, candidateDistanceDb, impostorDistanceDb]
    .every(Number.isFinite)) return false;
  return Math.abs(corpusPitchCents) <= 35 &&
    impostorDistanceDb - candidateDistanceDb >= policy.minimumImpostorMarginDb;
}

function decodeCorpusSlice(
  base64: string,
  slice: CorpusSlice,
): Float32Array {
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  const ints = new Int16Array(
    bytes.buffer,
    slice.byteOffset,
    slice.frameCount,
  );
  const floats = new Float32Array(slice.frameCount);
  for (let index = 0; index < slice.frameCount; index += 1) {
    floats[index] = (ints[index] ?? 0) / 32_768;
  }
  return floats;
}

export function analyzeReplacementOutput(
  policy: SampleReplacementPolicy,
  samples: Float32Array,
  sampleRateHz: number,
  midi: number,
): ReplacementOutputFeatures {
  const pitchStart = Math.floor(policy.pitchWindowSeconds[0] * sampleRateHz);
  const pitchEnd = Math.min(
    Math.floor(policy.pitchWindowSeconds[1] * sampleRateHz),
    samples.length,
  );
  const target = midiHz(midi);
  const pitchWindow = fundamentalBand(
    samples.subarray(pitchStart, pitchEnd),
    sampleRateHz,
    target,
  );
  const pitch = estimatePitch(pitchWindow, sampleRateHz, target);
  let peak = 0;
  for (const value of samples) peak = Math.max(peak, Math.abs(value));
  const earlyRms = windowRms(samples, sampleRateHz, policy.earlyWindowSeconds);
  const lateRms = windowRms(samples, sampleRateHz, policy.lateWindowSeconds);
  return Object.freeze({
    pitchCents: 1_200 * Math.log2(pitch.hz / target),
    periodicity: pitch.periodicity,
    earlyRms,
    lateToEarlyRmsRatio: earlyRms > 0 ? lateRms / earlyRms : 1,
    temporalPeakSeconds: temporalPeakSeconds(policy, samples, sampleRateHz),
    peak,
  });
}

export function evaluateReplacementOutput(
  policy: SampleReplacementPolicy,
  features: ReplacementOutputFeatures,
): readonly ReplacementGateFinding[] {
  const findings: ReplacementGateFinding[] = [];
  if (!Object.values(features).every(Number.isFinite)) {
    findings.push(Object.freeze({
      code: "REPLACEMENT_FEATURE_NONFINITE",
      message: "one or more measured output features are non-finite",
    }));
    return Object.freeze(findings);
  }
  if (Math.abs(features.pitchCents) > policy.maximumAbsolutePitchCents) {
    findings.push(Object.freeze({
      code: "REPLACEMENT_PITCH",
      message: `pitch ${features.pitchCents.toFixed(1)} cents exceeds +-${String(policy.maximumAbsolutePitchCents)}`,
    }));
  }
  if (features.earlyRms < policy.minimumEarlyRms) {
    findings.push(Object.freeze({
      code: "REPLACEMENT_SILENT",
      message: `early RMS ${features.earlyRms.toExponential(2)} below floor`,
    }));
  }
  if (features.lateToEarlyRmsRatio > policy.maximumLateToEarlyRmsRatio) {
    findings.push(Object.freeze({
      code: "REPLACEMENT_SUSTAIN",
      message: `late/early RMS ${features.lateToEarlyRmsRatio.toFixed(3)} exceeds ${String(policy.maximumLateToEarlyRmsRatio)} — does not decay like the instrument`,
    }));
  }
  if (features.temporalPeakSeconds < policy.minimumTemporalPeakSeconds) {
    findings.push(Object.freeze({
      code: "REPLACEMENT_TEMPORAL_CHARACTER",
      message: `loudest ${String(policy.temporalPeakWindowSeconds)} s window begins at ${features.temporalPeakSeconds.toFixed(3)} s, before the ${policy.minimumTemporalPeakSeconds.toFixed(3)} s corpus-earned floor`,
    }));
  }
  if (features.temporalPeakSeconds > policy.maximumTemporalPeakSeconds) {
    findings.push(Object.freeze({
      code: "REPLACEMENT_TEMPORAL_CHARACTER",
      message: `loudest ${String(policy.temporalPeakWindowSeconds)} s window begins at ${features.temporalPeakSeconds.toFixed(3)} s, after the ${policy.maximumTemporalPeakSeconds.toFixed(3)} s corpus-earned ceiling`,
    }));
  }
  if (features.peak > policy.maximumPeak) {
    findings.push(Object.freeze({
      code: "REPLACEMENT_CLIPPING",
      message: `peak ${features.peak.toFixed(3)} exceeds ${String(policy.maximumPeak)}`,
    }));
  }
  return Object.freeze(findings);
}

function summarize(
  policy: SampleReplacementPolicy,
  cells: readonly ReplacementOutputCell[],
  dynamicsCells: readonly ReplacementDynamicsCell[],
  proximityCells: readonly ReplacementProximityCell[],
  controls: SampleReplacementEvidence["controls"],
): SampleReplacementEvidence["summary"] {
  const passedCellCount = cells.filter((cell) => cell.outcome === "pass").length;
  const passedDynamicsCellCount =
    dynamicsCells.filter((cell) => cell.outcome === "pass").length;
  const passedProximityCellCount =
    proximityCells.filter((cell) => cell.outcome === "pass").length;
  const expectedCells = policy.midi.length * policy.velocities.length;
  const failed = passedCellCount !== expectedCells ||
    passedDynamicsCellCount !== policy.midi.length ||
    passedProximityCellCount !== policy.proximityMidi.length ||
    !Object.values(controls).every(Boolean);
  return Object.freeze({
    outcome: failed ? "fail" as const : "pass" as const,
    passedCellCount,
    passedDynamicsCellCount,
    passedProximityCellCount,
  });
}

function replacementSourcePaths(
  instrument: SampleReplacementPolicy["instrument"],
): readonly string[] {
  return Object.freeze([
    "scripts/run-sample-replacement-gate.ts",
    instrument === "vibes"
      ? "dsp/concert-grand/src/vibes_v2.rs"
      : "dsp/concert-grand/src/plucked_v2.rs",
    "src/audio/wasm/concert-grand-wasm.ts",
  ]);
}

async function sourceBindings(
  root: string,
  instrument: SampleReplacementPolicy["instrument"],
): Promise<readonly SourceBinding[]> {
  return Object.freeze(await Promise.all(replacementSourcePaths(instrument).map(async (path) =>
    Object.freeze({
      path,
      sha256: sha256Hex(new Uint8Array(await readFile(resolve(root, path)))),
    }))));
}

function healthyFeatures(policy: SampleReplacementPolicy): ReplacementOutputFeatures {
  return Object.freeze({
    pitchCents: 2,
    periodicity: 0.95,
    earlyRms: 0.05,
    lateToEarlyRmsRatio: policy.maximumLateToEarlyRmsRatio * 0.5,
    temporalPeakSeconds: Math.max(
      policy.minimumTemporalPeakSeconds,
      policy.temporalPeakHopSeconds,
    ),
    peak: 0.4,
  });
}

export async function runSampleReplacementGate(
  instrument: "vibes" | "upright-bass",
  root = process.cwd(),
): Promise<SampleReplacementEvidence> {
  const policy = instrument === "vibes"
    ? VIBES_REPLACEMENT_POLICY
    : UPRIGHT_BASS_REPLACEMENT_POLICY;
  const corpus = instrument === "vibes"
    ? Object.freeze({
      base64: VIBRAPHONE_SAMPLES_BASE64,
      rateHz: VIBRAPHONE_SAMPLES_RATE_HZ,
      sha256: VIBRAPHONE_SAMPLES_SHA256,
      slices: VIBRAPHONE_SAMPLES_SLICE_INDEX,
    })
    : Object.freeze({
      base64: UPRIGHT_BASS_SAMPLES_BASE64,
      rateHz: UPRIGHT_BASS_SAMPLES_RATE_HZ,
      sha256: UPRIGHT_BASS_SAMPLES_SHA256,
      slices: UPRIGHT_BASS_SAMPLES_SLICE_INDEX,
    });
  const bindingsBefore = await sourceBindings(root, instrument);
  const renderers = await loadWaveguideRenderers();
  const renderer = renderers.get(policy.algorithmId);
  if (renderer === undefined) throw new Error(`REPLACEMENT_RENDERER_MISSING:${policy.algorithmId}`);
  const impostor = renderers.get(policy.impostorAlgorithmId);
  if (impostor === undefined) throw new Error(`REPLACEMENT_IMPOSTOR_MISSING:${policy.impostorAlgorithmId}`);

  const cells: ReplacementOutputCell[] = [];
  const byId = new Map<string, ReplacementOutputFeatures>();
  for (const midi of policy.midi) {
    for (const velocity of policy.velocities) {
      const pcm = renderer.renderNote(
        midi,
        velocity,
        policy.sampleRateHz,
        policy.renderSeconds,
      );
      if (pcm === null) throw new Error(`REPLACEMENT_RENDER_REFUSED:m${String(midi)}v${String(velocity)}`);
      const samples = mono(pcm);
      const features = analyzeReplacementOutput(policy, samples, pcm.sampleRateHz, midi);
      const findings = evaluateReplacementOutput(policy, features);
      byId.set(`m${String(midi)}v${String(velocity)}`, features);
      cells.push(Object.freeze({
        id: `m${String(midi)}v${String(velocity)}`,
        algorithmId: policy.algorithmId,
        midi,
        velocity,
        sampleRateHz: pcm.sampleRateHz,
        pcmSha256: floatPcmSha256(samples),
        features,
        outcome: findings.length === 0 ? "pass" as const : "fail" as const,
        findings,
      }));
    }
  }

  const dynamicsCells: ReplacementDynamicsCell[] = [];
  for (const midi of policy.midi) {
    const piano = byId.get(`m${String(midi)}v${String(policy.velocities[0])}`);
    const forte = byId.get(`m${String(midi)}v${String(policy.velocities[1])}`);
    if (piano === undefined || forte === undefined) throw new Error("REPLACEMENT_DYNAMICS_CELL_MISSING");
    const rmsRise = forte.earlyRms - piano.earlyRms;
    dynamicsCells.push(Object.freeze({
      id: `m${String(midi)}-dynamics`,
      midi,
      rmsRise,
      outcome: replacementDynamicsPasses(piano.earlyRms, forte.earlyRms)
        ? "pass" as const
        : "fail" as const,
    }));
  }

  const proximityCells: ReplacementProximityCell[] = [];
  for (const midi of policy.proximityMidi) {
    const slice = corpus.slices.find((entry) => entry.midiPitch === midi);
    if (slice === undefined) throw new Error(`REPLACEMENT_CORPUS_SLICE_MISSING:m${String(midi)}`);
    const reference = decodeCorpusSlice(corpus.base64, slice);
    const referencePitch = estimatePitch(
      fundamentalBand(
        reference.subarray(0, Math.min(reference.length, corpus.rateHz)),
        corpus.rateHz,
        midiHz(midi),
      ),
      corpus.rateHz,
      midiHz(midi),
    );
    const corpusPitchCents =
      1_200 * Math.log2(referencePitch.hz / midiHz(midi)) - slice.tuningCents;
    const referenceProfile = bandProfileDb(reference, corpus.rateHz);
    const candidatePcm = renderer.renderNote(
      midi,
      policy.velocities[1],
      policy.sampleRateHz,
      policy.renderSeconds,
    );
    const impostorPcm = impostor.renderNote(
      midi,
      policy.velocities[1],
      policy.sampleRateHz,
      policy.renderSeconds,
    );
    if (candidatePcm === null || impostorPcm === null) {
      throw new Error(`REPLACEMENT_PROXIMITY_RENDER_REFUSED:m${String(midi)}`);
    }
    const candidateDistanceDb = bandDistanceDb(
      bandProfileDb(mono(candidatePcm), policy.sampleRateHz),
      referenceProfile,
    );
    const impostorDistanceDb = bandDistanceDb(
      bandProfileDb(mono(impostorPcm), policy.sampleRateHz),
      referenceProfile,
    );
    const marginDb = impostorDistanceDb - candidateDistanceDb;
    proximityCells.push(Object.freeze({
      id: `m${String(midi)}-proximity`,
      midi,
      corpusPitchCents,
      candidateDistanceDb,
      impostorDistanceDb,
      marginDb,
      outcome: replacementProximityPasses(
        policy,
        corpusPitchCents,
        candidateDistanceDb,
        impostorDistanceDb,
      ) ? "pass" as const : "fail" as const,
    }));
  }

  /* Planted controls: each must be EARNED live on every run. */
  const healthy = healthyFeatures(policy);
  const outsideLow = policy.instrument === "vibes" ? 52 : 27;
  const outsideHigh = policy.instrument === "vibes" ? 90 : 96;
  const controls = Object.freeze({
    outOfRangeRefused:
      renderer.renderNote(outsideLow, 100, policy.sampleRateHz, 0.5) === null &&
      renderer.renderNote(outsideHigh, 100, policy.sampleRateHz, 0.5) === null,
    wrongPitchRejected: evaluateReplacementOutput(
      policy,
      Object.freeze({ ...healthy, pitchCents: 60 }),
    ).some((item) => item.code === "REPLACEMENT_PITCH"),
    silentRejected: evaluateReplacementOutput(
      policy,
      Object.freeze({ ...healthy, earlyRms: 1e-7 }),
    ).some((item) => item.code === "REPLACEMENT_SILENT"),
    clippingRejected: evaluateReplacementOutput(
      policy,
      Object.freeze({ ...healthy, peak: 1.2 }),
    ).some((item) => item.code === "REPLACEMENT_CLIPPING"),
    sustainedRejected: evaluateReplacementOutput(
      policy,
      Object.freeze({ ...healthy, lateToEarlyRmsRatio: 1.4 }),
    ).some((item) => item.code === "REPLACEMENT_SUSTAIN"),
    immediateRingRejected: policy.minimumTemporalPeakSeconds === 0 ||
      evaluateReplacementOutput(
        policy,
        Object.freeze({ ...healthy, temporalPeakSeconds: 0 }),
      ).some((item) => item.code === "REPLACEMENT_TEMPORAL_CHARACTER"),
    lateRingRejected: evaluateReplacementOutput(
      policy,
      Object.freeze({
        ...healthy,
        temporalPeakSeconds: policy.maximumTemporalPeakSeconds +
          policy.temporalPeakHopSeconds,
      }),
    ).some((item) => item.code === "REPLACEMENT_TEMPORAL_CHARACTER"),
    flatDynamicsRejected: !replacementDynamicsPasses(
      healthy.earlyRms,
      healthy.earlyRms,
    ),
    impostorRejected: !replacementProximityPasses(policy, 0, 4, 3),
  });
  const bindingsAfter = await sourceBindings(root, instrument);
  if (canonicalJson(bindingsBefore) !== canonicalJson(bindingsAfter)) {
    throw new Error("REPLACEMENT_INPUT_CLOSURE_DRIFT");
  }
  const summary = summarize(policy, cells, dynamicsCells, proximityCells, controls);
  const unsigned = {
    schema: SAMPLE_REPLACEMENT_EVIDENCE_SCHEMA,
    policy,
    algorithmIds: Object.freeze([policy.algorithmId]),
    wasmSha256: CONCERT_GRAND_WASM_SHA256,
    corpusSha256: corpus.sha256,
    sourceBindings: bindingsBefore,
    sourceClosureSha256: sha256Hex(canonicalJson(bindingsBefore)),
    cells: Object.freeze(cells),
    dynamicsCells: Object.freeze(dynamicsCells),
    proximityCells: Object.freeze(proximityCells),
    controls,
    summary,
  };
  return Object.freeze({
    ...unsigned,
    evidenceSha256: sha256Hex(canonicalJson(unsigned)),
  });
}

/**
 * Offline semantic re-verification for `check-predeploy`: recompute every
 * verdict and the digest from the stored features. A hand-edited outcome,
 * summary, or digest fails closed.
 */
export function verifySampleReplacementEvidence(
  value: unknown,
  root = process.cwd(),
): value is SampleReplacementEvidence {
  if (!isRecord(value) || value["schema"] !== SAMPLE_REPLACEMENT_EVIDENCE_SCHEMA) {
    return false;
  }
  const policyValue = value["policy"];
  if (!isRecord(policyValue)) return false;
  const instrument = policyValue["instrument"];
  if (instrument !== "vibes" && instrument !== "upright-bass") return false;
  const policy = instrument === "vibes"
    ? VIBES_REPLACEMENT_POLICY
    : UPRIGHT_BASS_REPLACEMENT_POLICY;
  if (canonicalJson(policyValue) !== canonicalJson(policy)) return false;
  const expectedCorpusSha256 = instrument === "vibes"
    ? VIBRAPHONE_SAMPLES_SHA256
    : UPRIGHT_BASS_SAMPLES_SHA256;
  if (value["wasmSha256"] !== CONCERT_GRAND_WASM_SHA256 ||
    value["corpusSha256"] !== expectedCorpusSha256 ||
    canonicalJson(value["algorithmIds"]) !== canonicalJson([policy.algorithmId])) {
    return false;
  }
  const sourceBindingsValue = value["sourceBindings"];
  const expectedSourcePaths = replacementSourcePaths(instrument);
  if (!Array.isArray(sourceBindingsValue) ||
    sourceBindingsValue.length !== expectedSourcePaths.length) {
    return false;
  }
  const sourceBindingsArray: readonly unknown[] = sourceBindingsValue;
  const sourceBindings: SourceBinding[] = [];
  for (const [index, path] of expectedSourcePaths.entries()) {
    const binding = sourceBindingsArray[index];
    if (!isRecord(binding) || binding["path"] !== path ||
      typeof binding["sha256"] !== "string" ||
      !/^[0-9a-f]{64}$/.test(binding["sha256"])) {
      return false;
    }
    sourceBindings.push({ path, sha256: binding["sha256"] });
    try {
      if (sha256Hex(new Uint8Array(readFileSync(resolve(root, path)))) !==
        binding["sha256"]) return false;
    } catch {
      return false;
    }
  }
  if (value["sourceClosureSha256"] !==
    sha256Hex(canonicalJson(sourceBindings))) {
    return false;
  }
  const cellsValue = value["cells"];
  const dynamicsValue = value["dynamicsCells"];
  const proximityValue = value["proximityCells"];
  if (!Array.isArray(cellsValue) || !Array.isArray(dynamicsValue) ||
    !Array.isArray(proximityValue)) {
    return false;
  }
  const expectedCellIds = policy.midi.flatMap((midi) =>
    policy.velocities.map((velocity) => `m${String(midi)}v${String(velocity)}`));
  if (cellsValue.length !== expectedCellIds.length) return false;
  const cells: ReplacementOutputCell[] = [];
  for (const cellValue of cellsValue) {
    if (!isRecord(cellValue) || !isRecord(cellValue["features"]) ||
      !Array.isArray(cellValue["findings"])) return false;
    const midi = cellValue["midi"];
    const velocity = cellValue["velocity"];
    const id = cellValue["id"];
    const featuresValue = cellValue["features"];
    const featureKeys = [
      "pitchCents",
      "periodicity",
      "earlyRms",
      "lateToEarlyRmsRatio",
      "temporalPeakSeconds",
      "peak",
    ] as const;
    if (typeof midi !== "number" || typeof velocity !== "number" ||
      typeof id !== "string" ||
      !featureKeys.every((key) => typeof featuresValue[key] === "number")) {
      return false;
    }
    const expectedId = `m${String(midi)}v${String(velocity)}`;
    if (!expectedCellIds.includes(id) || id !== expectedId ||
      cellValue["algorithmId"] !== policy.algorithmId ||
      cellValue["sampleRateHz"] !== policy.sampleRateHz ||
      !policy.midi.includes(midi) ||
      !(policy.velocities as readonly number[]).includes(velocity) ||
      typeof cellValue["pcmSha256"] !== "string" ||
      !/^[0-9a-f]{64}$/.test(cellValue["pcmSha256"])) {
      return false;
    }
    const features: ReplacementOutputFeatures = {
      pitchCents: featuresValue["pitchCents"] as number,
      periodicity: featuresValue["periodicity"] as number,
      earlyRms: featuresValue["earlyRms"] as number,
      lateToEarlyRmsRatio: featuresValue["lateToEarlyRmsRatio"] as number,
      temporalPeakSeconds: featuresValue["temporalPeakSeconds"] as number,
      peak: featuresValue["peak"] as number,
    };
    const findings = evaluateReplacementOutput(policy, features);
    const outcome = findings.length === 0 ? "pass" : "fail";
    if (cellValue["outcome"] !== outcome ||
      canonicalJson(cellValue["findings"]) !== canonicalJson(findings)) return false;
    cells.push({
      id,
      algorithmId: policy.algorithmId,
      midi,
      velocity,
      sampleRateHz: policy.sampleRateHz,
      pcmSha256: cellValue["pcmSha256"],
      features,
      outcome,
      findings,
    });
  }
  if (new Set(cells.map((cell) => cell.id)).size !== expectedCellIds.length) {
    return false;
  }
  const expectedDynamicsIds = policy.midi.map((midi) => `m${String(midi)}-dynamics`);
  if (dynamicsValue.length !== expectedDynamicsIds.length) return false;
  const dynamicsCells: ReplacementDynamicsCell[] = [];
  for (const cellValue of dynamicsValue) {
    if (!isRecord(cellValue)) return false;
    const id = cellValue["id"];
    const midi = cellValue["midi"];
    const rmsRise = cellValue["rmsRise"];
    if (typeof id !== "string" || typeof midi !== "number" ||
      typeof rmsRise !== "number" || !Number.isFinite(rmsRise) ||
      !expectedDynamicsIds.includes(id) ||
      id !== `m${String(midi)}-dynamics` || !policy.midi.includes(midi)) {
      return false;
    }
    const quieter = cells.find((cell) =>
      cell.id === `m${String(midi)}v${String(policy.velocities[0])}`);
    const louder = cells.find((cell) =>
      cell.id === `m${String(midi)}v${String(policy.velocities[1])}`);
    if (quieter === undefined || louder === undefined) return false;
    const derivedRmsRise = louder.features.earlyRms - quieter.features.earlyRms;
    if (Math.abs(rmsRise - derivedRmsRise) > 1e-12) return false;
    const outcome = replacementDynamicsPasses(
      quieter.features.earlyRms,
      louder.features.earlyRms,
    ) ? "pass" : "fail";
    if (cellValue["outcome"] !== outcome) return false;
    dynamicsCells.push({ id, midi, rmsRise, outcome });
  }
  if (new Set(dynamicsCells.map((cell) => cell.id)).size !==
    expectedDynamicsIds.length) return false;
  const expectedProximityIds = policy.proximityMidi.map(
    (midi) => `m${String(midi)}-proximity`,
  );
  if (proximityValue.length !== expectedProximityIds.length) return false;
  const proximityCells: ReplacementProximityCell[] = [];
  for (const cellValue of proximityValue) {
    if (!isRecord(cellValue)) return false;
    const id = cellValue["id"];
    const midi = cellValue["midi"];
    const corpusPitchCents = cellValue["corpusPitchCents"];
    const candidateDistanceDb = cellValue["candidateDistanceDb"];
    const impostorDistanceDb = cellValue["impostorDistanceDb"];
    const marginDb = cellValue["marginDb"];
    if (typeof id !== "string" || typeof midi !== "number" ||
      ![corpusPitchCents, candidateDistanceDb, impostorDistanceDb, marginDb]
        .every((entry) => typeof entry === "number" && Number.isFinite(entry)) ||
      !expectedProximityIds.includes(id) ||
      id !== `m${String(midi)}-proximity` ||
      !policy.proximityMidi.includes(midi)) {
      return false;
    }
    const outcome = replacementProximityPasses(
      policy,
      corpusPitchCents as number,
      candidateDistanceDb as number,
      impostorDistanceDb as number,
    ) ? "pass" : "fail";
    if (cellValue["outcome"] !== outcome) return false;
    if (Math.abs((marginDb as number) -
      ((impostorDistanceDb as number) - (candidateDistanceDb as number))) > 1e-9) {
      return false;
    }
    proximityCells.push({
      id,
      midi,
      corpusPitchCents: corpusPitchCents as number,
      candidateDistanceDb: candidateDistanceDb as number,
      impostorDistanceDb: impostorDistanceDb as number,
      marginDb: marginDb as number,
      outcome,
    });
  }
  if (new Set(proximityCells.map((cell) => cell.id)).size !==
    expectedProximityIds.length) return false;
  const controlKeys = [
    "outOfRangeRefused",
    "wrongPitchRejected",
    "silentRejected",
    "clippingRejected",
    "sustainedRejected",
    "immediateRingRejected",
    "lateRingRejected",
    "flatDynamicsRejected",
    "impostorRejected",
  ];
  const controlsValue = value["controls"];
  if (!isRecord(controlsValue) ||
    canonicalJson(Object.keys(controlsValue).sort()) !==
      canonicalJson([...controlKeys].sort()) ||
    !Object.values(controlsValue).every((control) => control === true)) {
    return false;
  }
  const controls: SampleReplacementEvidence["controls"] = {
    outOfRangeRefused: true,
    wrongPitchRejected: true,
    silentRejected: true,
    clippingRejected: true,
    sustainedRejected: true,
    immediateRingRejected: true,
    lateRingRejected: true,
    flatDynamicsRejected: true,
    impostorRejected: true,
  };
  const summary = summarize(
    policy,
    cells,
    dynamicsCells,
    proximityCells,
    controls,
  );
  if (canonicalJson(summary) !== canonicalJson(value["summary"]) ||
    summary.outcome !== "pass") return false;
  const evidenceSha256 = value["evidenceSha256"];
  if (typeof evidenceSha256 !== "string") return false;
  const unsigned = Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== "evidenceSha256"),
  );
  return sha256Hex(canonicalJson(unsigned)) === evidenceSha256;
}

const isMain = process.argv[1]?.endsWith("run-sample-replacement-gate.ts") === true;
if (isMain) {
  const instrumentFlag = process.argv.indexOf("--instrument");
  const instrument = instrumentFlag >= 0 ? process.argv[instrumentFlag + 1] : undefined;
  if (instrument !== "vibes" && instrument !== "upright-bass") {
    console.error("usage: bun scripts/run-sample-replacement-gate.ts --instrument vibes|upright-bass [--output <path>]");
    process.exit(2);
  }
  const outputFlag = process.argv.indexOf("--output");
  const outputPath = outputFlag >= 0
    ? process.argv[outputFlag + 1]
    : `release-evidence/audio/listening/${instrument}-replacement-evidence.json`;
  if (outputPath === undefined) {
    console.error("--output requires a path");
    process.exit(2);
  }
  for (const argument of process.argv.slice(2)) {
    if (argument.startsWith("--") && argument !== "--instrument" && argument !== "--output") {
      console.error(`unrecognized flag ${argument} (fail-closed; the inert-flag epidemic is documented)`);
      process.exit(2);
    }
  }
  const evidence = await runSampleReplacementGate(instrument);
  await writeFile(resolve(process.cwd(), outputPath), `${JSON.stringify(evidence, null, 2)}\n`);
  const verdict = evidence.summary.outcome === "pass" ? "PASS" : "FAIL";
  console.log(`${verdict} cells=${String(evidence.summary.passedCellCount)} dynamics=${String(evidence.summary.passedDynamicsCellCount)} proximity=${String(evidence.summary.passedProximityCellCount)} wasm=${evidence.wasmSha256}`);
  process.exit(evidence.summary.outcome === "pass" ? 0 : 1);
}
