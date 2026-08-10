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
 * evidence JSON hash-bound to the exact wasm payload and corpus. The offline
 * verifier recomputes every verdict from stored features; `predeploy:check`
 * additionally re-renders the immutable embedded WASM and requires the whole
 * report to match, so a valid report for older bytes cannot authorize a
 * different payload.
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
  loadWaveguideRenderersFromWasmBytes,
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
  "changes.evidence.sample-replacement-output.v5" as const;

type CorpusSlice = Readonly<{
  midiPitch: number;
  tuningCents: number;
  byteOffset: number;
  frameCount: number;
}>;

export type SampleReplacementPolicy = Readonly<{
  schema: "changes.policy.sample-replacement-shipping-output.v5";
  instrument: "vibes" | "upright-bass";
  algorithmId: string;
  sampleRateHz: number;
  renderSeconds: number;
  midi: readonly number[];
  velocities: readonly [number, number];
  /* Early analysis window where the fundamental dominates. */
  pitchWindowSeconds: readonly [number, number];
  maximumAbsolutePitchCents: number;
  /* Autocorrelation must show a real periodic source, not shaped noise. */
  minimumPeriodicity: number;
  /* The independently estimated target component must be acoustically real. */
  minimumTargetToneToPeakRatio: number;
  /* Decay law: late-window RMS must fall below earlyRatio x early RMS. */
  earlyWindowSeconds: readonly [number, number];
  lateWindowSeconds: readonly [number, number];
  maximumLateToEarlyRmsRatio: number;
  /*
   * Temporal-character law. The checked-in vibraphone corpus reaches its
   * loudest 20 ms window 40-100 ms after impact; an immediate maximum is the
   * metallic ring the owner rejected. The 30 ms floor leaves one 10 ms hop of
   * tolerance below the earliest reviewed reference, and the upper bound
   * refuses a delayed plateau after the latest reviewed peak. The upright
   * corpus also blooms after the initial string contact (70--530 ms), so its
   * lower bound must reject a string-only, sample-zero maximum.
   */
  temporalPeakWindowSeconds: number;
  temporalPeakHopSeconds: number;
  temporalPeakSearchSeconds: readonly [number, number];
  minimumTemporalPeakSeconds: number;
  maximumTemporalPeakSeconds: number;
  minimumEarlyRms: number;
  maximumPeak: number;
  /* Velocity 64 -> 110 must produce an audible, not epsilon-sized, rise. */
  minimumDynamicsRiseDb: number;
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
  schema: "changes.policy.sample-replacement-shipping-output.v5",
  instrument: "vibes",
  algorithmId: VIBES_V2_ALGORITHM_ID,
  sampleRateHz: 48_000,
  renderSeconds: 4,
  midi: Object.freeze([53, 60, 67, 74, 84]),
  velocities: Object.freeze([64, 110] as const),
  pitchWindowSeconds: Object.freeze([0.05, 1.05] as const),
  maximumAbsolutePitchCents: 10,
  /* Checked-in mallet references measure 0.9979..0.9997. */
  minimumPeriodicity: 0.95,
  minimumTargetToneToPeakRatio: 0.02,
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
  /* Linear velocity scaling would rise 4.70 dB; allow bounded compression. */
  minimumDynamicsRiseDb: 3,
  proximityMidi: Object.freeze([53, 60, 67, 74, 84]),
  impostorAlgorithmId: "changes.dsp.plucked-archtop@2",
  minimumImpostorMarginDb: 1.5,
});

export const UPRIGHT_BASS_REPLACEMENT_POLICY: SampleReplacementPolicy =
  Object.freeze({
    schema: "changes.policy.sample-replacement-shipping-output.v5",
    instrument: "upright-bass",
    algorithmId: PLUCKED_UPRIGHT_BASS_ALGORITHM_ID,
    sampleRateHz: 48_000,
    renderSeconds: 3,
    midi: Object.freeze([28, 33, 38, 43]),
    velocities: Object.freeze([64, 110] as const),
    pitchWindowSeconds: Object.freeze([0.05, 0.85] as const),
    maximumAbsolutePitchCents: 10,
    /* The noisy E1 comparator is 0.3299; the other reviewed rows are >=.7628. */
    minimumPeriodicity: 0.30,
    minimumTargetToneToPeakRatio: 0.02,
    earlyWindowSeconds: Object.freeze([0.1, 0.6] as const),
    lateWindowSeconds: Object.freeze([1.5, 2.5] as const),
    /* Pizzicato dies fast: the late window must sit well under the pluck. */
    maximumLateToEarlyRmsRatio: 0.45,
    temporalPeakWindowSeconds: 0.02,
    temporalPeakHopSeconds: 0.01,
    temporalPeakSearchSeconds: Object.freeze([0, 1] as const),
    /* Earliest reviewed upright peak is 70 ms; allow one 10 ms hop below it. */
    minimumTemporalPeakSeconds: 0.06,
    /* Corpus maxima are 70--530 ms across these reviewed low-register cells. */
    maximumTemporalPeakSeconds: 0.54,
    minimumEarlyRms: 1.0e-4,
    maximumPeak: 0.98,
    /* Linear velocity scaling would rise 4.70 dB; allow bounded compression. */
    minimumDynamicsRiseDb: 3,
    /*
     * Same-pitch impostor cells need an impostor that can render the pitch.
     * Dreadnought and the physical bass overlap from E2 (midi 40) through B3;
     * all seven checked-in corpus rows in that span independently measure
     * within 17.3 cents after applying their reviewed `tuningCents`. The lower
     * bass-only rows remain covered by pitch, decay, dynamics, and target-tone
     * laws, but cannot have a same-pitch guitar impostor.
     */
    proximityMidi: Object.freeze([40, 42, 45, 49, 52, 56, 59]),
    impostorAlgorithmId: "changes.dsp.plucked-dreadnought@1",
    minimumImpostorMarginDb: 1.5,
  });

export type ReplacementOutputFeatures = Readonly<{
  pitchCents: number;
  periodicity: number;
  targetToneToPeakRatio: number;
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
    aperiodicRejected: boolean;
    targetToneAbsentRejected: boolean;
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

function assertPcmContract(
  pcm: RenderedNotePcm,
  sampleRateHz: number,
  cellId: string,
): void {
  if (pcm.sampleRateHz !== sampleRateHz || !Number.isInteger(pcm.frameCount) ||
    pcm.frameCount <= 0 || pcm.left.length !== pcm.frameCount ||
    pcm.right.length !== pcm.frameCount) {
    throw new Error(`REPLACEMENT_PCM_CONTRACT:${cellId}`);
  }
}

export function stereoPcmSha256(pcm: RenderedNotePcm): string {
  const left = new Uint8Array(
    pcm.left.buffer,
    pcm.left.byteOffset,
    pcm.left.byteLength,
  );
  const right = new Uint8Array(
    pcm.right.buffer,
    pcm.right.byteOffset,
    pcm.right.byteLength,
  );
  const bytes = new Uint8Array(left.byteLength + right.byteLength);
  bytes.set(left, 0);
  bytes.set(right, left.byteLength);
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
 * capture a raw autocorrelation; verification low-passes below 1.4x target
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

/**
 * Independently measure the string/bar fundamental near the notated target.
 *
 * A broad autocorrelation is useful as a periodicity diagnostic, but is not a
 * safe tuning oracle for an upright bass: the radiating body can make the
 * octave or a nearby plate mode stronger than the string fundamental. This
 * Hann-windowed search mirrors the independent Rust pitch fixture and searches
 * a fixed +-50 cent admission neighborhood at quarter-cent resolution. The
 * returned target/peak ratio prevents a pure octave (or silence) from passing
 * merely because the search always returns some in-neighborhood frequency.
 */
function estimateTargetTone(
  samples: Float32Array,
  sampleRateHz: number,
  targetHz: number,
): Readonly<{ hz: number; targetToneToPeakRatio: number }> {
  let maximumSample = 0;
  for (const value of samples) maximumSample = Math.max(maximumSample, Math.abs(value));
  let bestCents = 0;
  let bestAmplitude = 0;
  for (let quarterCent = -200; quarterCent <= 200; quarterCent += 1) {
    const cents = quarterCent * 0.25;
    const frequencyHz = targetHz * Math.pow(2, cents / 1_200);
    const rotation = 2 * Math.PI * frequencyHz / sampleRateHz;
    let real = 0;
    let imaginary = 0;
    let windowSum = 0;
    for (let index = 0; index < samples.length; index += 1) {
      const window = samples.length > 1
        ? 0.5 - 0.5 * Math.cos(2 * Math.PI * index / (samples.length - 1))
        : 1;
      const phase = rotation * index;
      const sample = samples[index] ?? 0;
      real += sample * window * Math.cos(phase);
      imaginary -= sample * window * Math.sin(phase);
      windowSum += window;
    }
    const amplitude = 2 * Math.hypot(real, imaginary) /
      Math.max(windowSum, 1e-30);
    if (amplitude > bestAmplitude) {
      bestAmplitude = amplitude;
      bestCents = cents;
    }
  }
  return Object.freeze({
    hz: targetHz * Math.pow(2, bestCents / 1_200),
    targetToneToPeakRatio: bestAmplitude / Math.max(maximumSample, 1e-30),
  });
}

/*
 * Octave-band log-energy profile over the first quarter-second: the proximity
 * metric compares timbral balance, not exact waveforms, so recorded room
 * character cannot dominate the verdict. Seven contiguous octave bands cover
 * 50 Hz through 6.4 kHz; frequencies outside that reviewed comparison range
 * are deliberately excluded from the normalized profile.
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
  /* Equal-TIME analysis on both sides of every comparison: the checked-in
   * corpora are 22.05/32 kHz and the candidate is 48 kHz, so a fixed sample
   * count would compare different musical windows and skew every distance
   * toward the attack. Use 0.25 s at each rate, DFT over the window. */
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
  policy: SampleReplacementPolicy,
  quieterEarlyRms: number,
  louderEarlyRms: number,
): boolean {
  return Number.isFinite(quieterEarlyRms) &&
    Number.isFinite(louderEarlyRms) &&
    quieterEarlyRms > 0 &&
    20 * Math.log10(louderEarlyRms / quieterEarlyRms) >=
      policy.minimumDynamicsRiseDb;
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

export function decodeCorpusSlice(
  bytes: Uint8Array,
  slice: CorpusSlice,
): Float32Array {
  const byteLength = slice.frameCount * 2;
  const byteEnd = slice.byteOffset + byteLength;
  if (!Number.isInteger(slice.byteOffset) || slice.byteOffset < 0 ||
    !Number.isInteger(slice.frameCount) || slice.frameCount <= 0 ||
    !Number.isSafeInteger(byteEnd) || byteEnd > bytes.byteLength) {
    throw new Error(`REPLACEMENT_CORPUS_SLICE_BOUNDS:m${String(slice.midiPitch)}`);
  }
  const view = new DataView(
    bytes.buffer,
    bytes.byteOffset + slice.byteOffset,
    byteLength,
  );
  const floats = new Float32Array(slice.frameCount);
  for (let index = 0; index < slice.frameCount; index += 1) {
    floats[index] = view.getInt16(index * 2, true) / 32_768;
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
  const rawPitchWindow = samples.subarray(pitchStart, pitchEnd);
  const pitchWindow = fundamentalBand(
    rawPitchWindow,
    sampleRateHz,
    target,
  );
  const periodicity = estimatePitch(pitchWindow, sampleRateHz, target);
  const pitch = estimateTargetTone(rawPitchWindow, sampleRateHz, target);
  let peak = 0;
  for (const value of samples) peak = Math.max(peak, Math.abs(value));
  const earlyRms = windowRms(samples, sampleRateHz, policy.earlyWindowSeconds);
  const lateRms = windowRms(samples, sampleRateHz, policy.lateWindowSeconds);
  return Object.freeze({
    pitchCents: 1_200 * Math.log2(pitch.hz / target),
    periodicity: periodicity.periodicity,
    targetToneToPeakRatio: pitch.targetToneToPeakRatio,
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
  if (features.periodicity < policy.minimumPeriodicity) {
    findings.push(Object.freeze({
      code: "REPLACEMENT_APERIODIC",
      message: `periodicity ${features.periodicity.toFixed(3)} below ${String(policy.minimumPeriodicity)}`,
    }));
  }
  if (features.targetToneToPeakRatio < policy.minimumTargetToneToPeakRatio) {
    findings.push(Object.freeze({
      code: "REPLACEMENT_TARGET_TONE_ABSENT",
      message: `target-tone/peak ratio ${features.targetToneToPeakRatio.toExponential(2)} below ${String(policy.minimumTargetToneToPeakRatio)}`,
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

export function replacementSourcePaths(
  instrument: SampleReplacementPolicy["instrument"],
): readonly string[] {
  const common = [
    "scripts/run-sample-replacement-gate.ts",
    "scripts/reference-similarity.ts",
    "src/audio/dsp-renderer.ts",
    "src/audio/wasm/concert-grand-wasm.ts",
    "dsp/concert-grand/Cargo.toml",
    "dsp/concert-grand/Cargo.lock",
    "dsp/concert-grand/rust-toolchain.toml",
    "dsp/concert-grand/src/lib.rs",
  ] as const;
  const instrumentPaths = instrument === "vibes"
    ? [
      "dsp/concert-grand/src/vibes_v2.rs",
      "dsp/concert-grand/src/vibes_v2_eigenpack.rs",
      "scripts/generate-vibraphone-v2-eigenpack.ts",
      "scripts/validate-phs6-contract.ts",
      "physical/parameter-packs/vibraphone-v2-eigenpack.json",
      "physical/parameter-packs/vibraphone-v2-modal-authority.json",
      "tests/fixtures/vibraphone-v2/contract.json",
      "tests/fixtures/vibraphone-v2/bar-cases.json",
      "tests/fixtures/vibraphone-v2/physics-cases.json",
      "tests/fixtures/vibraphone-v2/metric-cases.json",
      "tests/fixtures/vibraphone-v2/provenance-ledger.json",
      "tests/fixtures/vibraphone-v2/trace-ledger.json",
      "tests/fixtures/vibraphone-v2/mutation-controls.json",
      "src/audio/wasm/vibraphone-samples.ts",
    ] as const
    : [
      "dsp/concert-grand/src/plucked_v2.rs",
      "dsp/concert-grand/src/upright_bass_body.rs",
      "scripts/validate-phs4-contract.ts",
      "tests/fixtures/plucked-string-v2/contract.json",
      "tests/fixtures/plucked-string-v2/instrument-packs.json",
      "tests/fixtures/plucked-string-v2/physics-cases.json",
      "tests/fixtures/plucked-string-v2/metric-cases.json",
      "tests/fixtures/plucked-string-v2/provenance-ledger.json",
      "tests/fixtures/plucked-string-v2/trace-ledger.json",
      "tests/fixtures/plucked-string-v2/mutation-controls.json",
      "src/audio/wasm/upright-bass-samples.ts",
    ] as const;
  return Object.freeze([...common, ...instrumentPaths]);
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
    targetToneToPeakRatio: 0.2,
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
  options: Readonly<{
    root?: string;
    wasmBytes?: Uint8Array;
  }> = {},
): Promise<SampleReplacementEvidence> {
  const root = options.root ?? process.cwd();
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
  const immutableWasmBytes = options.wasmBytes === undefined
    ? undefined
    : Uint8Array.from(options.wasmBytes);
  const corpusBytes = Uint8Array.from(
    atob(corpus.base64),
    (character) => character.charCodeAt(0),
  );
  const measuredCorpusSha256 = sha256Hex(corpusBytes);
  if (measuredCorpusSha256 !== corpus.sha256) {
    throw new Error("REPLACEMENT_CORPUS_DIGEST_DRIFT");
  }
  const wasmSha256 = immutableWasmBytes === undefined
    ? CONCERT_GRAND_WASM_SHA256
    : sha256Hex(immutableWasmBytes);
  const bindingsBefore = await sourceBindings(root, instrument);
  const renderers = immutableWasmBytes === undefined
    ? await loadWaveguideRenderers()
    : await loadWaveguideRenderersFromWasmBytes(immutableWasmBytes);
  if ([...renderers.values()].some((entry) => entry.wasmSha256 !== wasmSha256)) {
    throw new Error("REPLACEMENT_WASM_DIGEST_DRIFT");
  }
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
      assertPcmContract(
        pcm,
        policy.sampleRateHz,
        `m${String(midi)}v${String(velocity)}`,
      );
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
        pcmSha256: stereoPcmSha256(pcm),
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
      outcome: replacementDynamicsPasses(
        policy,
        piano.earlyRms,
        forte.earlyRms,
      )
        ? "pass" as const
        : "fail" as const,
    }));
  }

  const proximityCells: ReplacementProximityCell[] = [];
  for (const midi of policy.proximityMidi) {
    const slice = corpus.slices.find((entry) => entry.midiPitch === midi);
    if (slice === undefined) throw new Error(`REPLACEMENT_CORPUS_SLICE_MISSING:m${String(midi)}`);
    const reference = decodeCorpusSlice(corpusBytes, slice);
    const referencePitch = estimateTargetTone(
      reference.subarray(0, Math.min(reference.length, corpus.rateHz)),
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
    assertPcmContract(candidatePcm, policy.sampleRateHz, `m${String(midi)}-candidate`);
    assertPcmContract(impostorPcm, policy.sampleRateHz, `m${String(midi)}-impostor`);
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
    aperiodicRejected: evaluateReplacementOutput(
      policy,
      Object.freeze({ ...healthy, periodicity: 0 }),
    ).some((item) => item.code === "REPLACEMENT_APERIODIC"),
    targetToneAbsentRejected: evaluateReplacementOutput(
      policy,
      Object.freeze({ ...healthy, targetToneToPeakRatio: 0 }),
    ).some((item) => item.code === "REPLACEMENT_TARGET_TONE_ABSENT"),
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
      policy,
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
    wasmSha256,
    corpusSha256: measuredCorpusSha256,
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
 * Offline semantic re-verification: recompute every verdict and the digest
 * from the stored features. A hand-edited outcome, summary, or digest fails
 * closed. Candidate reports may bind non-embedded WASM; shipping authorization
 * is the stricter replay equality plus current-WASM comparison in predeploy.
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
  if (typeof value["wasmSha256"] !== "string" ||
    !/^[0-9a-f]{64}$/.test(value["wasmSha256"]) ||
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
      "targetToneToPeakRatio",
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
      targetToneToPeakRatio: featuresValue["targetToneToPeakRatio"] as number,
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
      policy,
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
    "aperiodicRejected",
    "targetToneAbsentRejected",
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
    aperiodicRejected: true,
    targetToneAbsentRejected: true,
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

/**
 * Shipping acceptance is stronger than offline evidence validity: the stored
 * report must be byte-for-byte the report reproduced from the immutable WASM
 * embedded in the artifact being deployed. This prevents a still-valid report
 * for older renderer bytes from authorizing a newer payload with the same
 * algorithm id.
 */
export function verifySampleReplacementEvidenceAgainstReplay(
  value: unknown,
  replay: SampleReplacementEvidence,
  root = process.cwd(),
): value is SampleReplacementEvidence {
  return verifySampleReplacementEvidence(value, root) &&
    verifySampleReplacementEvidence(replay, root) &&
    canonicalJson(value) === canonicalJson(replay);
}

const isMain = process.argv[1]?.endsWith("run-sample-replacement-gate.ts") === true;
if (isMain) {
  const instrumentFlag = process.argv.indexOf("--instrument");
  const instrument = instrumentFlag >= 0 ? process.argv[instrumentFlag + 1] : undefined;
  if (instrument !== "vibes" && instrument !== "upright-bass") {
    console.error("usage: bun scripts/run-sample-replacement-gate.ts --instrument vibes|upright-bass [--wasm-path <path>] [--output <path>]");
    process.exit(2);
  }
  const outputFlag = process.argv.indexOf("--output");
  const outputPath = outputFlag >= 0
    ? process.argv[outputFlag + 1]
    : `release-evidence/audio/listening/${instrument}-replacement-evidence.json`;
  if (outputPath === undefined || outputPath.startsWith("--")) {
    console.error("--output requires a path");
    process.exit(2);
  }
  const wasmFlag = process.argv.indexOf("--wasm-path");
  const wasmPath = wasmFlag >= 0 ? process.argv[wasmFlag + 1] : undefined;
  if (wasmFlag >= 0 && (wasmPath === undefined || wasmPath.startsWith("--"))) {
    console.error("--wasm-path requires a path");
    process.exit(2);
  }
  for (const flag of ["--instrument", "--output", "--wasm-path"]) {
    if (process.argv.indexOf(flag) !== process.argv.lastIndexOf(flag)) {
      console.error(`duplicate flag ${flag}`);
      process.exit(2);
    }
  }
  for (const argument of process.argv.slice(2)) {
    if (argument.startsWith("--") && argument !== "--instrument" &&
      argument !== "--output" && argument !== "--wasm-path") {
      console.error(`unrecognized flag ${argument} (fail-closed; the inert-flag epidemic is documented)`);
      process.exit(2);
    }
  }
  const recognizedArgumentIndexes = new Set<number>();
  for (const flagIndex of [instrumentFlag, outputFlag, wasmFlag]) {
    if (flagIndex >= 0) {
      recognizedArgumentIndexes.add(flagIndex);
      recognizedArgumentIndexes.add(flagIndex + 1);
    }
  }
  for (let index = 2; index < process.argv.length; index += 1) {
    if (!recognizedArgumentIndexes.has(index)) {
      console.error(`unrecognized argument ${process.argv[index] ?? ""}`);
      process.exit(2);
    }
  }
  const evidence = await runSampleReplacementGate(instrument, {
    ...(wasmPath === undefined
      ? {}
      : { wasmBytes: new Uint8Array(await readFile(resolve(process.cwd(), wasmPath))) }),
  });
  await writeFile(resolve(process.cwd(), outputPath), `${JSON.stringify(evidence, null, 2)}\n`);
  const verdict = evidence.summary.outcome === "pass" ? "PASS" : "FAIL";
  console.log(`${verdict} cells=${String(evidence.summary.passedCellCount)} dynamics=${String(evidence.summary.passedDynamicsCellCount)} proximity=${String(evidence.summary.passedProximityCellCount)} wasm=${evidence.wasmSha256}`);
  process.exit(evidence.summary.outcome === "pass" ? 0 : 1);
}
