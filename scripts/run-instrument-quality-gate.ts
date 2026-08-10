/**
 * Mechanical instrument-quality gate (bead jcpe-kgnj).
 *
 * Renders every shipping "rendered" recipe offline through the exact
 * embedded WASM / sampled payloads and measures the owner's four
 * mechanical badness classes (2026-08-09 mandate):
 *
 *   1. PATHOLOGY  — silence, near-silence, clipping, DC offset, non-finite
 *      samples, click/pop discontinuities, noise-dominated sustain.
 *   2. PITCH      — per-note f0 cents error, and chord renders in which a
 *      requested chord tone is missing or an inharmonic peak dominates.
 *   3. PERFORMANCE — measured render-cost ratio (render wall time /
 *      rendered audio seconds). The law when this fails is OPTIMIZE THE
 *      CODE, never simplify the physics.
 *   4. ARTIFICIALITY — cheap-synth signatures reported as scores: static
 *      spectral centroid over the sustain, pure-gain velocity response,
 *      machine-perfect periodicity (no jitter/shimmer).
 *
 * Tiers: pathology and pitch findings FAIL the gate (exit 1). Performance
 * fails only when a render cannot beat realtime at all. Artificiality is a
 * reported score, never a failure, because taste stays with the owner.
 *
 * No-claim: a green run proves the ABSENCE OF MECHANICAL PATHOLOGY ONLY.
 * It does not prove an instrument sounds good; the owner's ear remains the
 * only acceptance authority (model-acceptance ledger).
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  AUDIO_INSTRUMENT_RECIPES,
  AUDIO_PLAYABLE_MIDI_WINDOWS,
} from "../src/audio/instrument-recipes-contract";
import {
  loadConcertGrandRenderer,
  loadWaveguideRenderers,
  type RenderedNotePcm,
} from "../src/audio/dsp-renderer";
import { loadSampledInstrumentRenderer } from "../src/audio/sampled-renderer";
import { CONCERT_GRAND_WASM_SHA256 } from "../src/audio/wasm/concert-grand-wasm";
import { estimatePitch, sha256Hex, type MonoPcm } from "./reference-similarity";

export const INSTRUMENT_QUALITY_SCHEMA =
  "changes.evidence.instrument-quality.v1" as const;

const SAMPLE_RATE_HZ = 44_100;
const TEST_VELOCITIES = [36, 72, 108] as const;
const GATE_SECONDS = 1;

/* Pathology thresholds (linear sample domain unless stated). */
const SILENCE_PEAK_DBFS = -50;
const QUIET_RMS_DBFS = -46;
const CLIP_LEVEL = 0.999;
const CLIP_FRACTION_LIMIT = 0.000_1;
const DC_OFFSET_LIMIT = 0.02;
const CLICK_ATTACK_SKIP_SECONDS = 0.02;
/*
 * A click fires on either an absolute near-half-scale jump or a jump that
 * towers over the local signal level — the relative arm catches audible
 * pops inside quiet renders that the absolute arm alone would miss.
 */
const CLICK_DELTA_LIMIT = 0.5;
const CLICK_RELATIVE_FLOOR = 0.05;
const CLICK_LOCAL_RMS_RATIO = 6;
const CLICK_LOCAL_WINDOW = 256;
const NOISE_PERIODICITY_FAIL = 0.55;
const NOISE_PERIODICITY_WARN = 0.8;

/*
 * Pitch thresholds (cents against 12-TET). Register extremes get a wider
 * allowance: real pianos stretch-tune toward the Railsback curve (the
 * measured concert-grand renders +15..17c at midi 106, which is physically
 * correct), and very low strings carry inharmonicity. "Extreme" = outside
 * midi [33, 96].
 */
const PITCH_FAIL_CENTS = 25;
const PITCH_WARN_CENTS = 10;
const PITCH_FAIL_CENTS_EXTREME = 40;
const PITCH_WARN_CENTS_EXTREME = 20;
const PITCH_EXTREME_LOW_MIDI = 33;
const PITCH_EXTREME_HIGH_MIDI = 96;
const CHORD_TONE_SEARCH_CENTS = 35;
const CHORD_TONE_FLOOR_DB = 30;

/* Performance thresholds: render seconds per audio second. */
const RENDER_RATIO_FAIL = 1;
const RENDER_RATIO_WARN = 0.5;

/*
 * v2 (2026-08-10, same owner mandate):
 *
 * ONSET LATENCY — the "timing/lag" law at the note level: seconds from
 * render start until the envelope first reaches -20 dB of its eventual
 * peak. A struck/plucked instrument that takes 40+ ms to speak feels
 * laggy against the chart grid no matter how accurate the schedule is;
 * winds legitimately speak slower.
 */
const ONSET_DB_BELOW_PEAK = 20;
const ONSET_WARN_SECONDS_STRUCK = 0.04;
const ONSET_FAIL_SECONDS_STRUCK = 0.09;
const ONSET_WARN_SECONDS_WIND = 0.12;
const ONSET_FAIL_SECONDS_WIND = 0.25;
const WIND_INSTRUMENT_IDS: ReadonlySet<string> = new Set(["flute", "clarinet"]);

/*
 * CHORD ROUGHNESS — the "musically pleasing" law: Plomp–Levelt pairwise
 * roughness of the rendered chord's measured partials, normalized by the
 * same chord's roughness when synthesized from ideal 12-TET harmonic
 * tones through the identical analysis. The ratio cancels the chord's
 * intrinsic dissonance (a maj7 is supposed to rub); what remains is
 * render-induced roughness — mistuning, inharmonic clutter, noise beds.
 */
const ROUGHNESS_WARN_RATIO = 2.5;
const ROUGHNESS_FAIL_RATIO = 5;
const ROUGHNESS_PARTIAL_COUNT = 24;

/*
 * PHRASE TRANSITIONS — clicks/pops and dropouts measured over a summed
 * six-note phrase (the engine sums per-note buffers exactly like this).
 * Attack windows around each onset are excluded: attacks legitimately
 * jump. A dropout is a mid-phrase RMS collapse against the phrase median.
 */
const PHRASE_NOTE_SPACING_SECONDS = 0.4;
const PHRASE_GATE_SECONDS = 0.5;
const PHRASE_ONSET_EXCLUDE_SECONDS = 0.025;
const PHRASE_DROPOUT_DB = 26;
const PHRASE_DROPOUT_MIN_SECONDS = 0.012;

export type QualityFinding = Readonly<{
  tier: "fail" | "warn";
  bucket: "pathology" | "pitch" | "performance";
  code: string;
  instrumentId: string;
  detail: string;
}>;

type NoteMeasurement = Readonly<{
  midiPitch: number;
  velocity: number;
  peakDbfs: number;
  rmsDbfs: number;
  dcOffset: number;
  clipFraction: number;
  maxInterSampleDelta: number;
  centsFromExpected: number | null;
  periodicity: number | null;
  renderRatio: number;
}>;

type ArtificialityScores = Readonly<{
  centroidStasis: number | null;
  velocitySpectrumCorrelation: number | null;
  sustainPeriodicity: number | null;
}>;

type InstrumentReport = Readonly<{
  instrumentId: string;
  algorithmId: string;
  notes: readonly NoteMeasurement[];
  chordMidis: readonly number[];
  chordToneLevelsDb: readonly (number | null)[];
  worstRenderRatio: number;
  artificiality: ArtificialityScores;
  /* v2 */
  worstOnsetSeconds: number | null;
  chordRoughnessRatio: number | null;
  phrase: PhraseScan | null;
}>;

function midiHz(midiPitch: number): number {
  return 440 * 2 ** ((midiPitch - 69) / 12);
}

function dbfs(value: number): number {
  return value <= 0 ? -Infinity : 20 * Math.log10(value);
}

function channelRms(samples: Float32Array): number {
  let sumSquares = 0;
  for (const value of samples) {
    if (Number.isFinite(value)) sumSquares += value * value;
  }
  return Math.sqrt(sumSquares / Math.max(1, samples.length));
}

/**
 * Analysis channel. The L+R average is preferred, but the engine's hybrid
 * layering deliberately inverts a layer when it would cancel — so when the
 * average loses more than half the louder channel's RMS to phase
 * cancellation, analysis falls back to the left channel rather than
 * measuring the cancelled residue.
 */
function mono(pcm: RenderedNotePcm): MonoPcm {
  const samples = new Float32Array(pcm.frameCount);
  for (let index = 0; index < pcm.frameCount; index += 1) {
    samples[index] =
      ((pcm.left[index] ?? 0) + (pcm.right[index] ?? 0)) / 2;
  }
  const averageRms = channelRms(samples);
  const worstChannelRms = Math.max(channelRms(pcm.left), channelRms(pcm.right));
  if (averageRms < 0.5 * worstChannelRms) {
    return {
      samples: new Float32Array(pcm.left.subarray(0, pcm.frameCount)),
      sampleRateHz: pcm.sampleRateHz,
    };
  }
  return { samples, sampleRateHz: pcm.sampleRateHz };
}

function basicStats(samples: Float32Array): Readonly<{
  peak: number;
  rms: number;
  mean: number;
  clipFraction: number;
  finite: boolean;
}> {
  let peak = 0;
  let sumSquares = 0;
  let sum = 0;
  let clipped = 0;
  let finite = true;
  for (const value of samples) {
    if (!Number.isFinite(value)) {
      finite = false;
      continue;
    }
    const magnitude = Math.abs(value);
    if (magnitude > peak) peak = magnitude;
    if (magnitude >= CLIP_LEVEL) clipped += 1;
    sumSquares += value * value;
    sum += value;
  }
  const count = Math.max(1, samples.length);
  return {
    peak,
    rms: Math.sqrt(sumSquares / count),
    mean: sum / count,
    clipFraction: clipped / count,
    finite,
  };
}

/**
 * Click/pop detector after the attack window. Returns the worst absolute
 * inter-sample jump plus whether any jump fired the relative arm (a jump
 * over CLICK_LOCAL_RMS_RATIO times the local RMS with an absolute floor),
 * which catches audible pops inside otherwise-quiet renders.
 */
function detectClicks(
  samples: Float32Array,
  sampleRateHz: number,
): Readonly<{ maxDelta: number; relativeClick: boolean }> {
  const start = Math.max(
    1,
    Math.min(samples.length, Math.floor(CLICK_ATTACK_SKIP_SECONDS * sampleRateHz)),
  );
  let worst = 0;
  let relativeClick = false;
  let windowSumSquares = 0;
  let windowCount = 0;
  for (let index = start; index < samples.length; index += 1) {
    const current = samples[index] ?? 0;
    const delta = Math.abs(current - (samples[index - 1] ?? 0));
    if (delta > worst) worst = delta;
    if (windowCount >= CLICK_LOCAL_WINDOW) {
      const localRms = Math.sqrt(windowSumSquares / windowCount);
      if (
        delta > CLICK_RELATIVE_FLOOR &&
        delta > CLICK_LOCAL_RMS_RATIO * localRms
      ) {
        relativeClick = true;
      }
    }
    windowSumSquares += current * current;
    windowCount += 1;
    if (windowCount > CLICK_LOCAL_WINDOW) {
      const leaving = samples[index - CLICK_LOCAL_WINDOW] ?? 0;
      windowSumSquares = Math.max(0, windowSumSquares - leaving * leaving);
      windowCount -= 1;
    }
  }
  return { maxDelta: worst, relativeClick };
}

/** Goertzel amplitude of one frequency over [start, start+length). */
function goertzel(
  samples: Float32Array,
  sampleRateHz: number,
  start: number,
  length: number,
  frequencyHz: number,
): number {
  const omega = (2 * Math.PI * frequencyHz) / sampleRateHz;
  const coefficient = 2 * Math.cos(omega);
  let sPrev = 0;
  let sPrev2 = 0;
  const end = Math.min(samples.length, start + length);
  for (let index = start; index < end; index += 1) {
    const s = (samples[index] ?? 0) + coefficient * sPrev - sPrev2;
    sPrev2 = sPrev;
    sPrev = s;
  }
  const power =
    sPrev * sPrev + sPrev2 * sPrev2 - coefficient * sPrev * sPrev2;
  return Math.sqrt(Math.max(0, power)) / Math.max(1, end - start);
}

/** Spectral centroid trajectory over consecutive windows of the sustain. */
function centroidStasis(pcm: MonoPcm): number | null {
  const windowLength = 4_096;
  const start = Math.floor(0.1 * pcm.sampleRateHz);
  const centroids: number[] = [];
  for (
    let cursor = start;
    cursor + windowLength <= pcm.samples.length;
    cursor += windowLength
  ) {
    /* Coarse 32-band Goertzel comb up to 8 kHz stands in for a full FFT:
     * the stasis ratio needs relative motion, not absolute accuracy. */
    let weighted = 0;
    let total = 0;
    for (let band = 1; band <= 32; band += 1) {
      const frequencyHz = (band * 8_000) / 32;
      const amplitude = goertzel(
        pcm.samples,
        pcm.sampleRateHz,
        cursor,
        windowLength,
        frequencyHz,
      );
      weighted += amplitude * frequencyHz;
      total += amplitude;
    }
    if (total > 0) centroids.push(weighted / total);
  }
  if (centroids.length < 4) return null;
  const mean =
    centroids.reduce((accumulator, value) => accumulator + value, 0) /
    centroids.length;
  if (mean <= 0) return null;
  const variance =
    centroids.reduce(
      (accumulator, value) => accumulator + (value - mean) ** 2,
      0,
    ) / centroids.length;
  return Math.sqrt(variance) / mean;
}

/** Correlate low-order harmonic envelopes at two velocities. */
function velocitySpectrumCorrelation(
  soft: MonoPcm,
  loud: MonoPcm,
  f0Hz: number,
): number | null {
  const harmonicCount = 12;
  const start = Math.floor(0.1 * soft.sampleRateHz);
  const length = 16_384;
  if (
    soft.samples.length < start + length ||
    loud.samples.length < start + length
  ) {
    return null;
  }
  const softAmplitudes: number[] = [];
  const loudAmplitudes: number[] = [];
  for (let harmonic = 1; harmonic <= harmonicCount; harmonic += 1) {
    const frequencyHz = f0Hz * harmonic;
    if (frequencyHz >= soft.sampleRateHz / 2) break;
    softAmplitudes.push(
      goertzel(soft.samples, soft.sampleRateHz, start, length, frequencyHz),
    );
    loudAmplitudes.push(
      goertzel(loud.samples, loud.sampleRateHz, start, length, frequencyHz),
    );
  }
  const count = softAmplitudes.length;
  if (count < 4) return null;
  const normalize = (values: number[]): number[] => {
    const total = values.reduce((accumulator, value) => accumulator + value, 0);
    return total > 0 ? values.map((value) => value / total) : values;
  };
  const a = normalize(softAmplitudes);
  const b = normalize(loudAmplitudes);
  const meanA = a.reduce((x, y) => x + y, 0) / count;
  const meanB = b.reduce((x, y) => x + y, 0) / count;
  let cross = 0;
  let varA = 0;
  let varB = 0;
  for (let index = 0; index < count; index += 1) {
    const da = (a[index] ?? 0) - meanA;
    const db = (b[index] ?? 0) - meanB;
    cross += da * db;
    varA += da * da;
    varB += db * db;
  }
  if (varA <= 0 || varB <= 0) return null;
  return cross / Math.sqrt(varA * varB);
}

/** Harmonic-comb energy at one candidate fundamental. */
function combEnergy(pcm: MonoPcm, f0Hz: number): number {
  const start = Math.floor(0.1 * pcm.sampleRateHz);
  const length = Math.min(32_768, pcm.samples.length - start);
  if (length < 8_192) return 0;
  let total = 0;
  for (let harmonic = 1; harmonic <= 6; harmonic += 1) {
    const frequencyHz = f0Hz * harmonic;
    if (frequencyHz >= pcm.sampleRateHz / 2) break;
    total += goertzel(pcm.samples, pcm.sampleRateHz, start, length, frequencyHz);
  }
  return total;
}

/**
 * Autocorrelation octave-ambiguity guard: lag-doubling reads a bass note
 * one octave low (the sampled contrabass at midi 30 measured -1201c while
 * its comb energy sits squarely on the requested f0). When the raw
 * estimate lands near a half/double octave, compare comb energy at the
 * expected pitch against the measured one; when the expected comb holds
 * comparable energy, refine cents by comb-peak search around 12-TET.
 */
function resolvePitchCents(
  pcm: MonoPcm,
  expectedHz: number,
  rawCents: number,
): number {
  const nearOctave =
    Math.abs(Math.abs(rawCents) - 1_200) < 60 ||
    Math.abs(Math.abs(rawCents) - 700) < 60;
  if (!nearOctave) return rawCents;
  const measuredHz = expectedHz * 2 ** (rawCents / 1_200);
  const measuredEnergy = combEnergy(pcm, measuredHz);
  let bestCents = 0;
  let bestEnergy = 0;
  for (let cents = -45; cents <= 45; cents += 3) {
    const energy = combEnergy(pcm, expectedHz * 2 ** (cents / 1_200));
    if (energy > bestEnergy) {
      bestEnergy = energy;
      bestCents = cents;
    }
  }
  /* The comb at the doubled/halved pitch shares every other partial with
   * the true pitch, so "comparable" needs only half the energy. */
  return bestEnergy >= 0.5 * measuredEnergy ? bestCents : rawCents;
}

/** In-place radix-2 complex FFT (sufficient for 8192-point analysis). */
function fftRadix2(real: Float64Array, imaginary: Float64Array): void {
  const n = real.length;
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; (j & bit) !== 0; bit >>= 1) j &= ~bit;
    j |= bit;
    if (i < j) {
      [real[i], real[j]] = [real[j] ?? 0, real[i] ?? 0];
      [imaginary[i], imaginary[j]] = [imaginary[j] ?? 0, imaginary[i] ?? 0];
    }
  }
  for (let length = 2; length <= n; length <<= 1) {
    const angle = (-2 * Math.PI) / length;
    const wReal = Math.cos(angle);
    const wImaginary = Math.sin(angle);
    for (let start = 0; start < n; start += length) {
      let curReal = 1;
      let curImaginary = 0;
      for (let k = 0; k < length / 2; k += 1) {
        const even = start + k;
        const odd = start + k + length / 2;
        const oddReal =
          (real[odd] ?? 0) * curReal - (imaginary[odd] ?? 0) * curImaginary;
        const oddImaginary =
          (real[odd] ?? 0) * curImaginary + (imaginary[odd] ?? 0) * curReal;
        real[odd] = (real[even] ?? 0) - oddReal;
        imaginary[odd] = (imaginary[even] ?? 0) - oddImaginary;
        real[even] = (real[even] ?? 0) + oddReal;
        imaginary[even] = (imaginary[even] ?? 0) + oddImaginary;
        const nextReal = curReal * wReal - curImaginary * wImaginary;
        curImaginary = curReal * wImaginary + curImaginary * wReal;
        curReal = nextReal;
      }
    }
  }
}

type SpectralPartial = Readonly<{ frequencyHz: number; amplitude: number }>;

/** Hann-windowed magnitude spectrum peaks over the sustain window. */
function measuredPartials(
  samples: Float32Array,
  sampleRateHz: number,
  startSample: number,
  maximumPartials: number,
): readonly SpectralPartial[] {
  const size = 8_192;
  if (samples.length < startSample + size) return [];
  const real = new Float64Array(size);
  const imaginary = new Float64Array(size);
  for (let index = 0; index < size; index += 1) {
    const window =
      0.5 * (1 - Math.cos((2 * Math.PI * index) / (size - 1)));
    real[index] = (samples[startSample + index] ?? 0) * window;
  }
  fftRadix2(real, imaginary);
  const magnitudes = new Float64Array(size / 2);
  for (let bin = 0; bin < size / 2; bin += 1) {
    magnitudes[bin] = Math.hypot(real[bin] ?? 0, imaginary[bin] ?? 0);
  }
  const peaks: Array<{ frequencyHz: number; amplitude: number }> = [];
  for (let bin = 2; bin < size / 2 - 2; bin += 1) {
    const magnitude = magnitudes[bin] ?? 0;
    if (
      magnitude > (magnitudes[bin - 1] ?? 0) &&
      magnitude >= (magnitudes[bin + 1] ?? 0)
    ) {
      /* Parabolic interpolation refines the peak frequency. */
      const left = magnitudes[bin - 1] ?? 0;
      const right = magnitudes[bin + 1] ?? 0;
      const denominator = left - 2 * magnitude + right;
      const offset =
        denominator === 0 ? 0 : (0.5 * (left - right)) / denominator;
      peaks.push({
        frequencyHz: ((bin + offset) * sampleRateHz) / size,
        amplitude: magnitude,
      });
    }
  }
  peaks.sort((a, b) => b.amplitude - a.amplitude);
  const strongest = peaks[0]?.amplitude ?? 0;
  return Object.freeze(
    peaks
      .slice(0, maximumPartials)
      .filter((peak) => peak.amplitude > strongest * 0.001)
      .map((peak) => Object.freeze(peak)),
  );
}

/** Plomp–Levelt pairwise roughness over a partial set (Sethares form). */
function plompLeveltRoughness(partials: readonly SpectralPartial[]): number {
  let total = 0;
  for (let i = 0; i < partials.length; i += 1) {
    for (let j = i + 1; j < partials.length; j += 1) {
      const a = partials[i];
      const b = partials[j];
      if (a === undefined || b === undefined) continue;
      const fMin = Math.min(a.frequencyHz, b.frequencyHz);
      const df = Math.abs(a.frequencyHz - b.frequencyHz);
      const s = 0.24 / (0.021 * fMin + 19);
      total +=
        a.amplitude *
        b.amplitude *
        (Math.exp(-3.5 * s * df) - Math.exp(-5.75 * s * df));
    }
  }
  return total;
}

/**
 * The ideal-baseline chord: the same pitches as exact 12-TET harmonic
 * tones (8 partials, 1/n amplitude), through the identical analysis. The
 * measured/ideal roughness ratio isolates render-induced roughness.
 */
function idealChordRoughness(chordMidis: readonly number[]): number {
  const partials: SpectralPartial[] = [];
  for (const midiPitch of chordMidis) {
    const f0 = midiHz(midiPitch);
    for (let harmonic = 1; harmonic <= 8; harmonic += 1) {
      if (f0 * harmonic >= SAMPLE_RATE_HZ / 2) break;
      partials.push(
        Object.freeze({ frequencyHz: f0 * harmonic, amplitude: 1 / harmonic }),
      );
    }
  }
  /* Normalize so amplitude scale matches a unit-strongest measured set. */
  const strongest = Math.max(...partials.map((partial) => partial.amplitude));
  return plompLeveltRoughness(
    partials.map((partial) =>
      Object.freeze({
        frequencyHz: partial.frequencyHz,
        amplitude: partial.amplitude / strongest,
      }),
    ),
  );
}

/** Seconds from render start to the envelope reaching -20 dB of peak. */
function onsetLatencySeconds(
  samples: Float32Array,
  sampleRateHz: number,
): number | null {
  let peak = 0;
  for (const value of samples) {
    const magnitude = Math.abs(value);
    if (Number.isFinite(magnitude) && magnitude > peak) peak = magnitude;
  }
  if (peak <= 0) return null;
  const threshold = peak * 10 ** (-ONSET_DB_BELOW_PEAK / 20);
  for (let index = 0; index < samples.length; index += 1) {
    if (Math.abs(samples[index] ?? 0) >= threshold) {
      return index / sampleRateHz;
    }
  }
  return null;
}

type PhraseScan = Readonly<{
  worstTransitionDelta: number;
  transitionClick: boolean;
  dropoutSeconds: number;
}>;

/**
 * Sum a six-note phrase the way the engine sums per-note buffers, then
 * scan for inter-note clicks (outside excluded onset windows) and
 * mid-phrase dropouts.
 */
function scanPhrase(
  renders: readonly (MonoPcm | null)[],
  onsetsSeconds: readonly number[],
): PhraseScan | null {
  const present = renders.filter((pcm): pcm is MonoPcm => pcm !== null);
  if (present.length !== renders.length || present.length === 0) return null;
  const endSeconds =
    Math.max(
      ...present.map(
        (pcm, index) =>
          (onsetsSeconds[index] ?? 0) + pcm.samples.length / pcm.sampleRateHz,
      ),
    ) + 0.1;
  const frameCount = Math.ceil(endSeconds * SAMPLE_RATE_HZ);
  const mixed = new Float32Array(frameCount);
  for (const [index, pcm] of present.entries()) {
    const startFrame = Math.round((onsetsSeconds[index] ?? 0) * SAMPLE_RATE_HZ);
    for (let at = 0; at < pcm.samples.length; at += 1) {
      const slot = startFrame + at;
      if (slot >= frameCount) break;
      mixed[slot] = (mixed[slot] ?? 0) + (pcm.samples[at] ?? 0);
    }
  }
  const excluded = (frame: number): boolean =>
    onsetsSeconds.some((onset) =>
      Math.abs(frame / SAMPLE_RATE_HZ - onset) < PHRASE_ONSET_EXCLUDE_SECONDS,
    );
  let worstTransitionDelta = 0;
  let transitionClick = false;
  let windowSumSquares = 0;
  let windowCount = 0;
  for (let frame = 1; frame < frameCount; frame += 1) {
    const current = mixed[frame] ?? 0;
    const delta = Math.abs(current - (mixed[frame - 1] ?? 0));
    if (!excluded(frame)) {
      if (delta > worstTransitionDelta) worstTransitionDelta = delta;
      if (windowCount >= CLICK_LOCAL_WINDOW) {
        const localRms = Math.sqrt(windowSumSquares / windowCount);
        if (
          delta > CLICK_RELATIVE_FLOOR &&
          delta > CLICK_LOCAL_RMS_RATIO * localRms
        ) {
          transitionClick = true;
        }
      }
    }
    windowSumSquares += current * current;
    windowCount += 1;
    if (windowCount > CLICK_LOCAL_WINDOW) {
      const leaving = mixed[frame - CLICK_LOCAL_WINDOW] ?? 0;
      windowSumSquares = Math.max(0, windowSumSquares - leaving * leaving);
      windowCount -= 1;
    }
  }
  /* Dropout scan over 5 ms blocks between first onset and last release. */
  const block = Math.round(0.005 * SAMPLE_RATE_HZ);
  const activeStart = Math.round((onsetsSeconds[0] ?? 0) * SAMPLE_RATE_HZ);
  const activeEnd = Math.round(
    ((onsetsSeconds.at(-1) ?? 0) + PHRASE_GATE_SECONDS) * SAMPLE_RATE_HZ,
  );
  const blockRms: number[] = [];
  for (let start = activeStart; start + block <= activeEnd; start += block) {
    let energy = 0;
    for (let at = start; at < start + block; at += 1) {
      energy += (mixed[at] ?? 0) ** 2;
    }
    blockRms.push(Math.sqrt(energy / block));
  }
  const sorted = [...blockRms].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const floor = median * 10 ** (-PHRASE_DROPOUT_DB / 20);
  let dropoutBlocks = 0;
  let runLength = 0;
  const minimumRun = Math.ceil(
    PHRASE_DROPOUT_MIN_SECONDS / 0.005,
  );
  for (const value of blockRms) {
    if (value < floor) {
      runLength += 1;
    } else {
      if (runLength >= minimumRun) dropoutBlocks += runLength;
      runLength = 0;
    }
  }
  if (runLength >= minimumRun) dropoutBlocks += runLength;
  return Object.freeze({
    worstTransitionDelta,
    transitionClick,
    dropoutSeconds: dropoutBlocks * 0.005,
  });
}

function pitchThresholds(midiPitch: number): Readonly<{ warn: number; fail: number }> {
  const extreme =
    midiPitch < PITCH_EXTREME_LOW_MIDI || midiPitch > PITCH_EXTREME_HIGH_MIDI;
  return extreme
    ? { warn: PITCH_WARN_CENTS_EXTREME, fail: PITCH_FAIL_CENTS_EXTREME }
    : { warn: PITCH_WARN_CENTS, fail: PITCH_FAIL_CENTS };
}

function pickTestPitches(instrumentId: string): readonly number[] {
  const window =
    AUDIO_PLAYABLE_MIDI_WINDOWS[
      instrumentId as keyof typeof AUDIO_PLAYABLE_MIDI_WINDOWS
    ];
  const middle = Math.round((window.low + window.high) / 2);
  return [window.low + 2, middle, window.high - 2];
}

/** A close-voiced maj7 rooted low in the window, folded to fit. */
function pickChord(instrumentId: string): readonly number[] {
  const window =
    AUDIO_PLAYABLE_MIDI_WINDOWS[
      instrumentId as keyof typeof AUDIO_PLAYABLE_MIDI_WINDOWS
    ];
  const root = Math.max(window.low, Math.min(window.high - 11, window.low + 5));
  return [root, root + 4, root + 7, root + 11].filter(
    (pitch) => pitch >= window.low && pitch <= window.high,
  );
}

async function main(): Promise<void> {
  const waveguides = await loadWaveguideRenderers();
  const concertGrand = await loadConcertGrandRenderer();
  const findings: QualityFinding[] = [];
  const reports: InstrumentReport[] = [];

  const renderedRecipes = AUDIO_INSTRUMENT_RECIPES.filter(
    (recipe) => recipe.synthesis === "rendered",
  );
  for (const recipe of renderedRecipes) {
    const algorithmId = recipe.renderer?.algorithmId ?? "";
    const renderNote = ((): ((
      midiPitch: number,
      velocity: number,
    ) => RenderedNotePcm | null) => {
      if (algorithmId === "changes.dsp.concert-grand@1") {
        return (midiPitch, velocity) =>
          concertGrand.renderNote(midiPitch, velocity, SAMPLE_RATE_HZ, GATE_SECONDS + 1);
      }
      if (algorithmId.startsWith("changes.dsp.sampled-")) {
        const sampled = loadSampledInstrumentRenderer(algorithmId);
        if (sampled === null) {
          throw new Error(`SAMPLED_RENDERER_MISSING: ${algorithmId}`);
        }
        return (midiPitch, velocity) =>
          sampled.renderNote(midiPitch, velocity, SAMPLE_RATE_HZ, GATE_SECONDS + 1);
      }
      const waveguide = waveguides.get(algorithmId);
      if (waveguide === undefined) {
        throw new Error(`WAVEGUIDE_RENDERER_MISSING: ${algorithmId}`);
      }
      return (midiPitch, velocity) =>
        waveguide.renderNote(midiPitch, velocity, SAMPLE_RATE_HZ, GATE_SECONDS + 1);
    })();

    const pitches = pickTestPitches(recipe.id);
    const notes: NoteMeasurement[] = [];
    const monosByKey = new Map<string, MonoPcm>();
    let worstRenderRatio = 0;
    let worstOnsetSeconds: number | null = null;

    /* One untimed warmup render so lazy per-instrument setup (module
     * caches, payload decode) never inflates the measured ratio. */
    renderNote(pitches[1] ?? 60, 72);

    for (const midiPitch of pitches) {
      for (const velocity of TEST_VELOCITIES) {
        const startedAt = performance.now();
        const pcm = renderNote(midiPitch, velocity);
        const renderSeconds = (performance.now() - startedAt) / 1_000;
        if (pcm === null) {
          findings.push({
            tier: "fail",
            bucket: "pathology",
            code: "RENDER_REFUSED",
            instrumentId: recipe.id,
            detail: `midi ${String(midiPitch)} v${String(velocity)} refused inside the playable window`,
          });
          continue;
        }
        const monoPcm = mono(pcm);
        monosByKey.set(`${String(midiPitch)}:${String(velocity)}`, monoPcm);
        /* Peak/clip/finiteness are PER-CHANNEL laws — the mono average
         * halves uncorrelated peaks and can hide a clipping channel. RMS
         * and DC stay on the analysis channel. */
        const leftStats = basicStats(pcm.left);
        const rightStats = basicStats(pcm.right);
        const monoStats = basicStats(monoPcm.samples);
        const stats = {
          peak: Math.max(leftStats.peak, rightStats.peak),
          rms: monoStats.rms,
          mean: monoStats.mean,
          clipFraction: Math.max(leftStats.clipFraction, rightStats.clipFraction),
          finite: leftStats.finite && rightStats.finite,
        };
        const audioSeconds = pcm.frameCount / pcm.sampleRateHz;
        const renderRatio = renderSeconds / Math.max(0.001, audioSeconds);
        if (renderRatio > worstRenderRatio) worstRenderRatio = renderRatio;
        const expectedHz = midiHz(midiPitch);
        const rawPitch = estimatePitch(monoPcm, expectedHz);
        const pitch =
          rawPitch === null
            ? null
            : {
                ...rawPitch,
                centsFromExpected: resolvePitchCents(
                  monoPcm,
                  expectedHz,
                  rawPitch.centsFromExpected,
                ),
              };
        const clicks = detectClicks(monoPcm.samples, monoPcm.sampleRateHz);
        const onset = onsetLatencySeconds(monoPcm.samples, monoPcm.sampleRateHz);
        if (
          onset !== null &&
          (worstOnsetSeconds === null || onset > worstOnsetSeconds)
        ) {
          worstOnsetSeconds = onset;
        }
        const measurement: NoteMeasurement = {
          midiPitch,
          velocity,
          peakDbfs: dbfs(stats.peak),
          rmsDbfs: dbfs(stats.rms),
          dcOffset: stats.mean,
          clipFraction: stats.clipFraction,
          maxInterSampleDelta: clicks.maxDelta,
          centsFromExpected: pitch?.centsFromExpected ?? null,
          periodicity: pitch?.periodicity ?? null,
          renderRatio,
        };
        notes.push(measurement);

        const where = `midi ${String(midiPitch)} v${String(velocity)}`;
        if (!stats.finite) {
          findings.push({
            tier: "fail",
            bucket: "pathology",
            code: "NONFINITE_SAMPLES",
            instrumentId: recipe.id,
            detail: `${where}: NaN/Inf in render`,
          });
        }
        if (measurement.peakDbfs < SILENCE_PEAK_DBFS) {
          findings.push({
            tier: "fail",
            bucket: "pathology",
            code: "SILENT_RENDER",
            instrumentId: recipe.id,
            detail: `${where}: peak ${measurement.peakDbfs.toFixed(1)} dBFS`,
          });
        } else if (measurement.rmsDbfs < QUIET_RMS_DBFS) {
          findings.push({
            tier: "warn",
            bucket: "pathology",
            code: "NEAR_SILENT_RENDER",
            instrumentId: recipe.id,
            detail: `${where}: RMS ${measurement.rmsDbfs.toFixed(1)} dBFS`,
          });
        }
        if (measurement.clipFraction > CLIP_FRACTION_LIMIT) {
          findings.push({
            tier: "fail",
            bucket: "pathology",
            code: "CLIPPING",
            instrumentId: recipe.id,
            detail: `${where}: ${(measurement.clipFraction * 100).toFixed(3)}% samples at full scale`,
          });
        }
        if (Math.abs(measurement.dcOffset) > DC_OFFSET_LIMIT) {
          findings.push({
            tier: "fail",
            bucket: "pathology",
            code: "DC_OFFSET",
            instrumentId: recipe.id,
            detail: `${where}: mean ${measurement.dcOffset.toFixed(4)}`,
          });
        }
        if (
          measurement.maxInterSampleDelta > CLICK_DELTA_LIMIT ||
          clicks.relativeClick
        ) {
          findings.push({
            tier: "fail",
            bucket: "pathology",
            code: "CLICK_DISCONTINUITY",
            instrumentId: recipe.id,
            detail: `${where}: inter-sample jump ${measurement.maxInterSampleDelta.toFixed(3)} after attack${clicks.relativeClick ? " (towers over local RMS)" : ""}`,
          });
        }
        if (pitch === null) {
          findings.push({
            tier: "fail",
            bucket: "pitch",
            code: "PITCH_UNDETECTABLE",
            instrumentId: recipe.id,
            detail: `${where}: no periodic pitch found near ${expectedHz.toFixed(1)} Hz`,
          });
        } else {
          const { warn: warnCents, fail: failCents } = pitchThresholds(midiPitch);
          const cents = Math.abs(pitch.centsFromExpected);
          if (cents > failCents) {
            findings.push({
              tier: "fail",
              bucket: "pitch",
              code: "PITCH_OFF",
              instrumentId: recipe.id,
              detail: `${where}: ${pitch.centsFromExpected.toFixed(1)}c from 12-TET`,
            });
          } else if (cents > warnCents) {
            findings.push({
              tier: "warn",
              bucket: "pitch",
              code: "PITCH_DRIFT",
              instrumentId: recipe.id,
              detail: `${where}: ${pitch.centsFromExpected.toFixed(1)}c from 12-TET`,
            });
          }
          if (pitch.periodicity < NOISE_PERIODICITY_FAIL) {
            findings.push({
              tier: "fail",
              bucket: "pathology",
              code: "NOISE_DOMINATED",
              instrumentId: recipe.id,
              detail: `${where}: sustain periodicity ${pitch.periodicity.toFixed(3)}`,
            });
          } else if (pitch.periodicity < NOISE_PERIODICITY_WARN) {
            findings.push({
              tier: "warn",
              bucket: "pathology",
              code: "NOISY_SUSTAIN",
              instrumentId: recipe.id,
              detail: `${where}: sustain periodicity ${pitch.periodicity.toFixed(3)}`,
            });
          }
        }
      }
    }

    /* Onset-latency law (v2): a laggy speak makes the chart feel late. */
    if (worstOnsetSeconds !== null) {
      const wind = WIND_INSTRUMENT_IDS.has(recipe.id);
      const warnAt = wind ? ONSET_WARN_SECONDS_WIND : ONSET_WARN_SECONDS_STRUCK;
      const failAt = wind ? ONSET_FAIL_SECONDS_WIND : ONSET_FAIL_SECONDS_STRUCK;
      if (worstOnsetSeconds > failAt) {
        findings.push({
          tier: "fail",
          bucket: "performance",
          code: "ONSET_LAG",
          instrumentId: recipe.id,
          detail: `worst onset ${(worstOnsetSeconds * 1_000).toFixed(0)} ms to -${String(ONSET_DB_BELOW_PEAK)} dB of peak`,
        });
      } else if (worstOnsetSeconds > warnAt) {
        findings.push({
          tier: "warn",
          bucket: "performance",
          code: "ONSET_SLOW",
          instrumentId: recipe.id,
          detail: `worst onset ${(worstOnsetSeconds * 1_000).toFixed(0)} ms to -${String(ONSET_DB_BELOW_PEAK)} dB of peak`,
        });
      }
    }

    if (worstRenderRatio > RENDER_RATIO_FAIL) {
      findings.push({
        tier: "fail",
        bucket: "performance",
        code: "SLOWER_THAN_REALTIME",
        instrumentId: recipe.id,
        detail: `worst render ratio ${worstRenderRatio.toFixed(2)}x — OPTIMIZE, never simplify the physics`,
      });
    } else if (worstRenderRatio > RENDER_RATIO_WARN) {
      findings.push({
        tier: "warn",
        bucket: "performance",
        code: "THIN_REALTIME_HEADROOM",
        instrumentId: recipe.id,
        detail: `worst render ratio ${worstRenderRatio.toFixed(2)}x`,
      });
    }

    /* Chord accuracy: mix the per-note renders exactly as the engine's
     * per-voice scheduling sums them, then require every chord tone. */
    const chordMidis = pickChord(recipe.id);
    const chordToneLevelsDb: (number | null)[] = [];
    let chordRoughnessRatio: number | null = null;
    const chordRenders = chordMidis
      .map((midiPitch) => renderNote(midiPitch, 96))
      .filter((pcm): pcm is RenderedNotePcm => pcm !== null);
    if (chordRenders.length === chordMidis.length && chordRenders.length > 0) {
      const frameCount = Math.min(
        ...chordRenders.map((pcm) => pcm.frameCount),
      );
      const mixed = new Float32Array(frameCount);
      for (const pcm of chordRenders) {
        const monoPcm = mono(pcm);
        for (let index = 0; index < frameCount; index += 1) {
          mixed[index] =
            (mixed[index] ?? 0) +
            (monoPcm.samples[index] ?? 0) / chordRenders.length;
        }
      }
      const start = Math.floor(0.1 * SAMPLE_RATE_HZ);
      const length = Math.min(16_384, frameCount - start);
      if (length > 4_096) {
        const amplitudes = chordMidis.map((midiPitch) => {
          /* Search ±CHORD_TONE_SEARCH_CENTS for the strongest partial. */
          let best = 0;
          for (let cents = -CHORD_TONE_SEARCH_CENTS; cents <= CHORD_TONE_SEARCH_CENTS; cents += 5) {
            const frequencyHz = midiHz(midiPitch) * 2 ** (cents / 1_200);
            const amplitude = goertzel(
              mixed,
              SAMPLE_RATE_HZ,
              start,
              length,
              frequencyHz,
            );
            if (amplitude > best) best = amplitude;
          }
          return best;
        });
        /*
         * Chord roughness ratio (v2): measured Plomp–Levelt roughness of
         * the rendered chord's partials over the ideal 12-TET harmonic
         * baseline of the same pitches. Both sets are normalized to a
         * unit strongest partial so only spectral SHAPE is compared.
         */
        const partials = measuredPartials(
          mixed,
          SAMPLE_RATE_HZ,
          start,
          ROUGHNESS_PARTIAL_COUNT,
        );
        if (partials.length >= 4) {
          const strongestPartial = Math.max(
            ...partials.map((partial) => partial.amplitude),
          );
          const normalized = partials.map((partial) =>
            Object.freeze({
              frequencyHz: partial.frequencyHz,
              amplitude: partial.amplitude / strongestPartial,
            }),
          );
          const ideal = idealChordRoughness(chordMidis);
          if (ideal > 0) {
            chordRoughnessRatio = plompLeveltRoughness(normalized) / ideal;
            if (chordRoughnessRatio > ROUGHNESS_FAIL_RATIO) {
              findings.push({
                tier: "fail",
                bucket: "pitch",
                code: "CHORD_ROUGHNESS",
                instrumentId: recipe.id,
                detail: `rendered chord roughness ${chordRoughnessRatio.toFixed(2)}x the ideal 12-TET baseline`,
              });
            } else if (chordRoughnessRatio > ROUGHNESS_WARN_RATIO) {
              findings.push({
                tier: "warn",
                bucket: "pitch",
                code: "CHORD_ROUGH",
                instrumentId: recipe.id,
                detail: `rendered chord roughness ${chordRoughnessRatio.toFixed(2)}x the ideal 12-TET baseline`,
              });
            }
          }
        }

        const strongest = Math.max(...amplitudes);
        for (const [index, amplitude] of amplitudes.entries()) {
          const level =
            strongest > 0 && amplitude > 0
              ? 20 * Math.log10(amplitude / strongest)
              : null;
          chordToneLevelsDb.push(level);
          if (level === null || level < -CHORD_TONE_FLOOR_DB) {
            findings.push({
              tier: "fail",
              bucket: "pitch",
              code: "CHORD_TONE_MISSING",
              instrumentId: recipe.id,
              detail: `chord tone midi ${String(chordMidis[index])} is ${level === null ? "absent" : `${level.toFixed(1)} dB under the strongest tone`}`,
            });
          }
        }
      }
    }

    /*
     * Phrase-transition scan (v2): a six-note ascending line at the
     * engine's own summation, clicks measured outside onset windows,
     * dropouts against the phrase median.
     */
    const phraseBase = pitches[1] ?? pitches[0] ?? 60;
    const phraseMidis = [0, 2, 4, 5, 7, 9].map((offset) => phraseBase + offset)
      .map((pitch) => Math.min(pitch, (pitches[2] ?? phraseBase) + 2));
    const phraseOnsets = phraseMidis.map(
      (_, index) => 0.1 + index * PHRASE_NOTE_SPACING_SECONDS,
    );
    const phraseRenders = phraseMidis.map((pitch) => {
      const pcm = renderNote(pitch, 88);
      return pcm === null ? null : mono(pcm);
    });
    const phrase = scanPhrase(phraseRenders, phraseOnsets);
    if (phrase !== null) {
      if (phrase.transitionClick || phrase.worstTransitionDelta > CLICK_DELTA_LIMIT) {
        findings.push({
          tier: "fail",
          bucket: "pathology",
          code: "PHRASE_TRANSITION_CLICK",
          instrumentId: recipe.id,
          detail: `inter-note jump ${phrase.worstTransitionDelta.toFixed(3)} in the summed phrase${phrase.transitionClick ? " (towers over local RMS)" : ""}`,
        });
      }
      if (phrase.dropoutSeconds > 0) {
        findings.push({
          tier: "fail",
          bucket: "pathology",
          code: "PHRASE_DROPOUT",
          instrumentId: recipe.id,
          detail: `${(phrase.dropoutSeconds * 1_000).toFixed(0)} ms of mid-phrase dropout below -${String(PHRASE_DROPOUT_DB)} dB of the phrase median`,
        });
      }
    }

    /* Artificiality scores over the middle pitch. */
    const middlePitch = pitches[1] ?? pitches[0] ?? 60;
    const softKey = `${String(middlePitch)}:36`;
    const loudKey = `${String(middlePitch)}:108`;
    const soft = monosByKey.get(softKey) ?? null;
    const loud = monosByKey.get(loudKey) ?? null;
    const middleLoud = loud ?? soft;
    const artificiality: ArtificialityScores = {
      centroidStasis: middleLoud === null ? null : centroidStasis(middleLoud),
      velocitySpectrumCorrelation:
        soft !== null && loud !== null
          ? velocitySpectrumCorrelation(soft, loud, midiHz(middlePitch))
          : null,
      sustainPeriodicity:
        notes.find(
          (note) => note.midiPitch === middlePitch && note.velocity === 108,
        )?.periodicity ?? null,
    };

    reports.push({
      instrumentId: recipe.id,
      algorithmId,
      notes,
      chordMidis,
      chordToneLevelsDb,
      worstRenderRatio,
      artificiality,
    });
  }

  const failCount = findings.filter((finding) => finding.tier === "fail").length;
  const evidence = {
    schema: INSTRUMENT_QUALITY_SCHEMA,
    generatedBy: "scripts/run-instrument-quality-gate.ts",
    wasmSha256: CONCERT_GRAND_WASM_SHA256,
    sampleRateHz: SAMPLE_RATE_HZ,
    outcome: failCount === 0 ? ("pass" as const) : ("fail" as const),
    findings,
    instruments: reports,
    noClaim:
      "Green proves absence of the measured mechanical pathology classes only. It never proves an instrument sounds good; owner listening remains the acceptance authority.",
  };
  const serialized = JSON.stringify(evidence, null, 2);
  const outputPath = resolve(
    "test-results/instrument-quality/instrument-quality-v1.json",
  );
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, serialized, "utf8");

  for (const report of reports) {
    const worstCents = report.notes.reduce(
      (worst, note) =>
        note.centsFromExpected !== null &&
        Math.abs(note.centsFromExpected) > Math.abs(worst)
          ? note.centsFromExpected
          : worst,
      0,
    );
    process.stdout.write(
      `${report.instrumentId.padEnd(20)} render<=${report.worstRenderRatio.toFixed(2)}x worst-pitch ${worstCents.toFixed(1)}c stasis ${report.artificiality.centroidStasis?.toFixed(3) ?? "n/a"} velCorr ${report.artificiality.velocitySpectrumCorrelation?.toFixed(3) ?? "n/a"}\n`,
    );
  }
  for (const finding of findings) {
    process.stdout.write(
      `${finding.tier.toUpperCase()} [${finding.bucket}] ${finding.instrumentId} ${finding.code}: ${finding.detail}\n`,
    );
  }
  process.stdout.write(
    `${evidence.outcome === "pass" ? "PASS" : "FAIL"} instrument-quality gate: ${String(reports.length)} instruments, ${String(failCount)} fail finding(s), evidence sha256 ${sha256Hex(serialized).slice(0, 16)}\n`,
  );
  if (failCount > 0) process.exitCode = 1;
}

await main();
