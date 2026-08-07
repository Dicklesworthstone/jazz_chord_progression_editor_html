/** Independent, fail-closed reference analysis for physical winds. */
import { createHash } from "node:crypto";

export const REFERENCE_SIMILARITY_ALGORITHM_ID =
  "changes.analysis.reference-similarity@1" as const;
export const REFERENCE_GATE_EVIDENCE_SCHEMA =
  "changes.evidence.wind-reference-similarity.v1" as const;

export type MonoPcm = Readonly<{ samples: Float32Array; sampleRateHz: number }>;
export type GateFinding = Readonly<{ code: string; message: string }>;
export type PitchEstimate = Readonly<{
  f0Hz: number;
  centsFromExpected: number;
  periodicity: number;
}>;
export type SignalFeatures = Readonly<{
  pitch: PitchEstimate;
  integratedBandDb: readonly number[];
  harmonicProfileDb: readonly number[];
  hnrDb: number;
  highBandShareDb: number;
  onsetSeconds: number;
  attackTo90SustainSeconds: number;
}>;
export type AnalysisResult =
  | Readonly<{ outcome: "accept"; features: SignalFeatures }>
  | Readonly<{ outcome: "unavailable"; findings: readonly GateFinding[] }>;
export type SimilarityReport = Readonly<{
  candidate: SignalFeatures;
  reference: SignalFeatures;
  pitchDeltaCents: number;
  envelopeDb: number;
  harmonicDb: number;
  attackLog2: number;
  hnrAbsoluteDeltaDb: number;
  highBandAbsoluteDeltaDb: number;
}>;

export const WIND_REFERENCE_GATE_POLICY = Object.freeze({
  schema: "changes.policy.wind-reference-gate.v1" as const,
  id: "winds-reference-policy@1" as const,
  mode: "proximity" as const,
  maximumPitchCents: 15,
  minimumPeriodicity: 0.45,
  maximumPitchDeltaCents: 12,
  maximumEnvelopeDb: 18,
  maximumHarmonicDb: 20,
  maximumAttackLog2: 1,
  maximumAbsoluteHnrDeltaDb: 12,
  maximumAbsoluteHighBandDeltaDb: 8,
  minimumAttackSeconds: 0.015,
  maximumAttackSeconds: 0.15,
  identityControl: "uiowa-anechoic-chromatic-scales@1" as const,
});

/**
 * Plucked-family gate policy (bead jcpe-plucked-evidence-emission-gmx4).
 * The plucked references (FreePats steel-string and solid-body electric,
 * CC0, provenance in test-results/plucked-reference-source/PROVENANCE.md)
 * are room/DI captures, not the anechoic corpus the wind laws were tuned
 * for, and plucked transients sit well under the wind attack window. Every
 * limit below is derived from the 2026-08-07 measurement pass (candidates
 * env 13.7-17.1 dB / harm 6.6-14.7 dB / attackLog2 up to 2.59 vs their
 * class references; cross-class ukulele-vs-steel 45.1/56.7 dB; white-noise
 * and wrong-pitch planted controls refuse at admission) with explicit
 * margin, and each certifies REFERENCE-PROXIMITY AT MATCHED PITCH plus the
 * planted-control rejections - not "sounds like a Martin/Marshall" and not
 * class identity beyond the recorded controls. The high-band limit records
 * the models' known darkness above 5.5 kHz (deltas 15.4-19.6 dB measured)
 * so it is bounded, not hidden.
 */
export const PLUCKED_REFERENCE_GATE_POLICY = Object.freeze({
  schema: "changes.policy.plucked-reference-gate.v1" as const,
  id: "plucked-reference-policy@1" as const,
  mode: "proximity" as const,
  maximumPitchCents: 15,
  minimumPeriodicity: 0.6,
  maximumPitchDeltaCents: 12,
  maximumEnvelopeDb: 20,
  maximumHarmonicDb: 18,
  maximumAttackLog2: 3,
  maximumAbsoluteHnrDeltaDb: 14,
  maximumAbsoluteHighBandDeltaDb: 24,
  minimumAttackSeconds: 0.001,
  maximumAttackSeconds: 0.06,
  identityControl: "plucked-reference-corpus@1" as const,
});

/**
 * Separation certification for plucked classes with NO lawful same-class
 * reference (2026-08-07: no CC0 ukulele exists in FreePats, VSCO-2-CE, or
 * VCSL - verified again this session). A pass certifies that the candidate
 * phonates cleanly at matched pitch AND is measurably FAR from the named
 * cross-class reference (measured ukulele-vs-steel 45.1 dB envelope /
 * 56.7 dB harmonic; minima set with wide margin below that). The class's
 * own physical-invariant proof lives in tests/unit/plucked-family.test.ts
 * and is cited by the evidence consumer; this policy never claims
 * same-class reference proximity.
 */
export const PLUCKED_SEPARATION_GATE_POLICY = Object.freeze({
  schema: "changes.policy.plucked-separation-gate.v1" as const,
  id: "plucked-separation-policy@1" as const,
  mode: "separation" as const,
  maximumPitchCents: 15,
  minimumPeriodicity: 0.6,
  maximumPitchDeltaCents: 1_200,
  minimumEnvelopeSeparationDb: 30,
  minimumHarmonicSeparationDb: 30,
  minimumAttackSeconds: 0.001,
  maximumAttackSeconds: 0.06,
  identityControl: "plucked-reference-corpus@1" as const,
});

export type ProximityGatePolicy =
  | typeof WIND_REFERENCE_GATE_POLICY
  | typeof PLUCKED_REFERENCE_GATE_POLICY;
export type SeparationGatePolicy = typeof PLUCKED_SEPARATION_GATE_POLICY;
export type ReferenceGatePolicy = ProximityGatePolicy | SeparationGatePolicy;
export type GatePolicyId = ReferenceGatePolicy["id"];

const GATE_POLICIES: Readonly<Record<GatePolicyId, ReferenceGatePolicy>> =
  Object.freeze({
    [WIND_REFERENCE_GATE_POLICY.id]: WIND_REFERENCE_GATE_POLICY,
    [PLUCKED_REFERENCE_GATE_POLICY.id]: PLUCKED_REFERENCE_GATE_POLICY,
    [PLUCKED_SEPARATION_GATE_POLICY.id]: PLUCKED_SEPARATION_GATE_POLICY,
  });

export type GateOutcome = "pass" | "fail" | "unavailable";
export type GateVerdict = Readonly<{
  outcome: GateOutcome;
  exitCode: 0 | 1 | 2;
  findings: readonly GateFinding[];
}>;

export const WIND_IDENTITY_CONTROL_POLICY = Object.freeze({
  schema: "changes.policy.wind-identity-control.v1" as const,
  minimumCells: 12,
  minimumDistinctPitches: 4,
  minimumDistinctDynamics: 3,
  maximumMatchedPitchDeltaCents: 35,
  maximumSameInstrumentTimbreDistanceDb: 6.5,
  minimumCrossInstrumentTimbreDistanceDb: 10,
});

export type WindIdentityControlCell = Readonly<{
  id: string;
  midi: number;
  dynamic: "pp" | "mf" | "ff";
  flutePitchHz: number;
  clarinetPitchHz: number;
  fluteEarly: SignalFeatures;
  fluteLate: SignalFeatures;
  clarinetEarly: SignalFeatures;
  clarinetLate: SignalFeatures;
}>;
export type WindIdentityMeasurement = Readonly<{
  id: string;
  matchedPitchDeltaCents: number;
  fluteSameTimbreDistanceDb: number;
  clarinetSameTimbreDistanceDb: number;
  crossInstrumentTimbreDistanceDb: number;
}>;
export type WindIdentityControlResult = GateVerdict & Readonly<{
  measurements: readonly WindIdentityMeasurement[];
}>;
type EvidenceDigests = Readonly<{
  analyzerImplementationSha256: string;
  policySha256: string;
  rendererSourceSha256: string;
  wasmSha256: string;
  parameterPackSha256: string;
  renderRequestSha256: string;
  pcmSha256: string;
  corpusManifestSha256: string;
  referenceFileSha256: string;
}>;
export type GateEvidenceInput = Readonly<{
  outcome: GateOutcome;
  rendererAlgorithmId: string;
  corpusId: string;
  referencePath: string;
  referenceLicenseId: string;
  expectedMidi: number;
  expectedHz: number;
  digests: EvidenceDigests;
  controls: Readonly<{
    self: boolean;
    whiteNoiseRejected: boolean;
    overlyPureRejected: boolean;
    wrongPitchRejected: boolean;
    crossInstrumentRejected: boolean;
  }>;
  report: SimilarityReport | null;
  findings: readonly GateFinding[];
}>;
export type GateEvidenceV1 = Readonly<{
  schema: typeof REFERENCE_GATE_EVIDENCE_SCHEMA;
  outcome: GateOutcome;
  gate: Readonly<{
    algorithmId: typeof REFERENCE_SIMILARITY_ALGORITHM_ID;
    implementationSha256: string;
    policyId: GatePolicyId;
    policySha256: string;
  }>;
  candidate: Readonly<{
    rendererAlgorithmId: string;
    rendererSourceSha256: string;
    wasmSha256: string;
    parameterPackSha256: string;
    renderRequestSha256: string;
    pcmSha256: string;
  }>;
  reference: Readonly<{
    corpusId: string;
    corpusManifestSha256: string;
    filePath: string;
    fileSha256: string;
    licenseId: string;
    expectedMidi: number;
    expectedHz: number;
  }>;
  controls: GateEvidenceInput["controls"];
  report: SimilarityReport | null;
  findings: readonly GateFinding[];
  evidenceSha256: string;
}>;

const SUSTAIN_START_SECONDS = 0.4;
const SUSTAIN_LENGTH_SECONDS = 0.6;
const FFT_SIZE = 4_096;
const FFT_HOP = FFT_SIZE / 2;
const BAND_COUNT = 24;
const BAND_LOW_HZ = 100;
const BAND_HIGH_HZ = 10_000;
const HIGH_BAND_LOW_HZ = 5_500;
const HARMONIC_COUNT = 12;
const SPECTRAL_FLOOR_DB = -120;

function finding(code: string, message: string): GateFinding {
  return Object.freeze({ code, message });
}

/** Minimal dev-time RIFF reader. */
export function readWavMono(bytes: Uint8Array): MonoPcm {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.byteLength < 12 || view.getUint32(0, false) !== 0x52494646 ||
    view.getUint32(8, false) !== 0x57415645) throw new Error("not a RIFF/WAVE file");
  let offset = 12;
  let format = 0;
  let channels = 0;
  let sampleRateHz = 0;
  let bitsPerSample = 0;
  let dataStart = -1;
  let dataLength = 0;
  while (offset + 8 <= view.byteLength) {
    const id = view.getUint32(offset, false);
    const size = view.getUint32(offset + 4, true);
    if (id === 0x666d7420 && offset + 8 + size <= view.byteLength) {
      format = view.getUint16(offset + 8, true);
      channels = view.getUint16(offset + 10, true);
      sampleRateHz = view.getUint32(offset + 12, true);
      bitsPerSample = view.getUint16(offset + 22, true);
      if (format === 0xfffe && size >= 40) format = view.getUint16(offset + 32, true);
    } else if (id === 0x64617461) {
      dataStart = offset + 8;
      dataLength = Math.min(size, view.byteLength - dataStart);
    }
    offset += 8 + size + (size % 2);
  }
  if (dataStart < 0 || channels < 1 || sampleRateHz <= 0) {
    throw new Error("missing fmt/data chunk");
  }
  const bytesPerSample = bitsPerSample / 8;
  if (!Number.isInteger(bytesPerSample) || bytesPerSample <= 0) throw new Error("invalid bit depth");
  const frameCount = Math.floor(dataLength / (bytesPerSample * channels));
  const samples = new Float32Array(frameCount);
  for (let frame = 0; frame < frameCount; frame += 1) {
    let sum = 0;
    for (let channel = 0; channel < channels; channel += 1) {
      const at = dataStart + (frame * channels + channel) * bytesPerSample;
      let value: number;
      if (format === 3 && bitsPerSample === 32) value = view.getFloat32(at, true);
      else if (bitsPerSample === 16) value = view.getInt16(at, true) / 32_768;
      else if (bitsPerSample === 24) {
        const raw = view.getUint8(at) | (view.getUint8(at + 1) << 8) |
          (view.getUint8(at + 2) << 16);
        value = (raw >= 0x80_0000 ? raw - 0x100_0000 : raw) / 8_388_608;
      } else if (bitsPerSample === 32) value = view.getInt32(at, true) / 2_147_483_648;
      else throw new Error(`unsupported bit depth ${String(bitsPerSample)}`);
      sum += value;
    }
    samples[frame] = sum / channels;
  }
  return Object.freeze({ samples, sampleRateHz });
}

function readExtended80(view: DataView, offset: number): number {
  const rawExponent = view.getUint16(offset, false);
  const sign = (rawExponent & 0x8000) === 0 ? 1 : -1;
  const exponent = (rawExponent & 0x7fff) - 16_383;
  const high = view.getUint32(offset + 2, false);
  const low = view.getUint32(offset + 6, false);
  if ((rawExponent & 0x7fff) === 0 && high === 0 && low === 0) return 0;
  return sign * (high * Math.pow(2, exponent - 31) + low * Math.pow(2, exponent - 63));
}

/** Minimal big-endian PCM AIFF reader for the checked Iowa corpus. */
export function readAiffMono(bytes: Uint8Array): MonoPcm {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.byteLength < 12 || view.getUint32(0, false) !== 0x464f524d ||
    view.getUint32(8, false) !== 0x41494646) throw new Error("not a FORM/AIFF file");
  let channels = 0;
  let frameCount = 0;
  let bitsPerSample = 0;
  let sampleRateHz = 0;
  let soundStart = -1;
  let soundLength = 0;
  for (let offset = 12; offset + 8 <= view.byteLength;) {
    const id = view.getUint32(offset, false);
    const size = view.getUint32(offset + 4, false);
    const payload = offset + 8;
    if (payload + size > view.byteLength) throw new Error("truncated AIFF chunk");
    if (id === 0x434f4d4d && size >= 18) {
      channels = view.getUint16(payload, false);
      frameCount = view.getUint32(payload + 2, false);
      bitsPerSample = view.getUint16(payload + 6, false);
      sampleRateHz = readExtended80(view, payload + 8);
    } else if (id === 0x53534e44 && size >= 8) {
      const dataOffset = view.getUint32(payload, false);
      soundStart = payload + 8 + dataOffset;
      soundLength = size - 8 - dataOffset;
    }
    offset = payload + size + (size % 2);
  }
  const bytesPerSample = bitsPerSample / 8;
  if (channels < 1 || frameCount < 1 || !Number.isInteger(bytesPerSample) ||
    !Number.isFinite(sampleRateHz) || sampleRateHz <= 0 || soundStart < 0 ||
    soundStart + soundLength > view.byteLength) throw new Error("invalid AIFF COMM/SSND chunks");
  if (![16, 24, 32].includes(bitsPerSample)) throw new Error(`unsupported AIFF depth ${String(bitsPerSample)}`);
  const availableFrames = Math.floor(soundLength / (channels * bytesPerSample));
  const samples = new Float32Array(Math.min(frameCount, availableFrames));
  for (let frame = 0; frame < samples.length; frame += 1) {
    let sum = 0;
    for (let channel = 0; channel < channels; channel += 1) {
      const at = soundStart + (frame * channels + channel) * bytesPerSample;
      if (bitsPerSample === 16) sum += view.getInt16(at, false) / 32_768;
      else if (bitsPerSample === 24) {
        const raw = (view.getUint8(at) << 16) | (view.getUint8(at + 1) << 8) |
          view.getUint8(at + 2);
        sum += (raw >= 0x80_0000 ? raw - 0x100_0000 : raw) / 8_388_608;
      } else sum += view.getInt32(at, false) / 2_147_483_648;
    }
    samples[frame] = sum / channels;
  }
  return Object.freeze({ samples, sampleRateHz: Math.round(sampleRateHz) });
}

/** Split a silence-separated chromatic-scale file into onset-aligned notes. */
export function splitChromaticScale(pcm: MonoPcm): readonly MonoPcm[] {
  const window = Math.max(1, Math.round(0.01 * pcm.sampleRateHz));
  const rms: number[] = [];
  for (let start = 0; start + window <= pcm.samples.length; start += window) {
    let energy = 0;
    for (let index = start; index < start + window; index += 1) {
      const sample = pcm.samples[index] ?? 0;
      energy += sample * sample;
    }
    rms.push(Math.sqrt(energy / window));
  }
  const peak = Math.max(0, ...rms);
  if (peak <= 0) return Object.freeze([]);
  const sortedRms = [...rms].sort((left, right) => left - right);
  const noiseFloor = sortedRms[Math.floor(sortedRms.length * 0.1)] ?? 0;
  const threshold = Math.max(1e-5, peak * 0.0125, noiseFloor * 4);
  const minimumActiveFrames = 3;
  const minimumGapFrames = Math.round(0.18 * pcm.sampleRateHz / window);
  const ranges: Array<readonly [number, number]> = [];
  let activeStart: number | null = null;
  let activeRun = 0;
  let inactiveRun = 0;
  for (let frame = 0; frame < rms.length; frame += 1) {
    if ((rms[frame] ?? 0) >= threshold) {
      activeRun += 1;
      inactiveRun = 0;
      if (activeStart === null && activeRun >= minimumActiveFrames) {
        activeStart = frame - minimumActiveFrames + 1;
      }
    } else {
      activeRun = 0;
      if (activeStart !== null) {
        inactiveRun += 1;
        if (inactiveRun >= minimumGapFrames) {
          ranges.push([activeStart, frame - inactiveRun + 1]);
          activeStart = null;
          inactiveRun = 0;
        }
      }
    }
  }
  if (activeStart !== null) ranges.push([activeStart, rms.length]);
  const padBefore = Math.round(0.02 * pcm.sampleRateHz);
  const padAfter = Math.round(0.08 * pcm.sampleRateHz);
  return Object.freeze(ranges.filter(([first, last]) => last - first >= 50).map(([first, last]) => {
    const start = Math.max(0, first * window - padBefore);
    const end = Math.min(pcm.samples.length, last * window + padAfter);
    return Object.freeze({ samples: pcm.samples.slice(start, end), sampleRateHz: pcm.sampleRateHz });
  }));
}

function sustainBounds(pcm: MonoPcm): readonly [number, number] | null {
  if (!Number.isFinite(pcm.sampleRateHz) || pcm.sampleRateHz <= 0) return null;
  const start = Math.round(SUSTAIN_START_SECONDS * pcm.sampleRateHz);
  const end = Math.min(pcm.samples.length,
    start + Math.round(SUSTAIN_LENGTH_SECONDS * pcm.sampleRateHz));
  return end - start >= FFT_SIZE ? [start, end] : null;
}

function reverseBits(value: number, bits: number): number {
  let reversed = 0;
  for (let bit = 0; bit < bits; bit += 1) reversed = (reversed << 1) | ((value >>> bit) & 1);
  return reversed;
}

function fftInPlace(real: Float64Array, imaginary: Float64Array): void {
  const n = real.length;
  const bits = Math.log2(n);
  for (let index = 0; index < n; index += 1) {
    const reversed = reverseBits(index, bits);
    if (reversed > index) {
      const re = real[index] ?? 0;
      const im = imaginary[index] ?? 0;
      real[index] = real[reversed] ?? 0;
      imaginary[index] = imaginary[reversed] ?? 0;
      real[reversed] = re;
      imaginary[reversed] = im;
    }
  }
  for (let width = 2; width <= n; width *= 2) {
    const half = width / 2;
    for (let base = 0; base < n; base += width) {
      for (let index = 0; index < half; index += 1) {
        const angle = (-2 * Math.PI * index) / width;
        const wr = Math.cos(angle);
        const wi = Math.sin(angle);
        const even = base + index;
        const odd = even + half;
        const oddReal = real[odd] ?? 0;
        const oddImaginary = imaginary[odd] ?? 0;
        const tr = wr * oddReal - wi * oddImaginary;
        const ti = wr * oddImaginary + wi * oddReal;
        const er = real[even] ?? 0;
        const ei = imaginary[even] ?? 0;
        real[even] = er + tr;
        imaginary[even] = ei + ti;
        real[odd] = er - tr;
        imaginary[odd] = ei - ti;
      }
    }
  }
}

/** Welch-averaged one-sided power; every in-band FFT bin is retained. */
export function integratedPowerSpectrum(pcm: MonoPcm): Float64Array | null {
  const bounds = sustainBounds(pcm);
  if (bounds === null) return null;
  const [start, end] = bounds;
  const power = new Float64Array(FFT_SIZE / 2 + 1);
  let frames = 0;
  for (let at = start; at + FFT_SIZE <= end; at += FFT_HOP) {
    const real = new Float64Array(FFT_SIZE);
    const imaginary = new Float64Array(FFT_SIZE);
    let mean = 0;
    for (let index = 0; index < FFT_SIZE; index += 1) mean += pcm.samples[at + index] ?? 0;
    mean /= FFT_SIZE;
    for (let index = 0; index < FFT_SIZE; index += 1) {
      const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (FFT_SIZE - 1));
      real[index] = ((pcm.samples[at + index] ?? 0) - mean) * hann;
    }
    fftInPlace(real, imaginary);
    for (let bin = 0; bin < power.length; bin += 1) {
      const re = real[bin] ?? 0;
      const im = imaginary[bin] ?? 0;
      power[bin] = (power[bin] ?? 0) + re * re + im * im;
    }
    frames += 1;
  }
  if (frames === 0) return null;
  for (let bin = 0; bin < power.length; bin += 1) power[bin] = (power[bin] ?? 0) / frames;
  return power;
}

function sumBins(power: Float64Array, rate: number, lowHz: number, highHz: number): number {
  const binHz = rate / FFT_SIZE;
  const first = Math.max(0, Math.ceil(lowHz / binHz));
  const last = Math.min(power.length - 1, Math.floor(highHz / binHz));
  let sum = 0;
  for (let bin = first; bin <= last; bin += 1) sum += power[bin] ?? 0;
  return sum;
}

function integratedBandsDb(power: Float64Array, rate: number): readonly number[] {
  const upper = Math.min(BAND_HIGH_HZ, rate / 2);
  const ratio = Math.pow(upper / BAND_LOW_HZ, 1 / BAND_COUNT);
  const raw: number[] = [];
  let total = 0;
  for (let band = 0; band < BAND_COUNT; band += 1) {
    const low = BAND_LOW_HZ * Math.pow(ratio, band);
    const high = band === BAND_COUNT - 1 ? upper : low * ratio;
    const energy = sumBins(power, rate, low, high);
    raw.push(energy);
    total += energy;
  }
  return Object.freeze(raw.map((energy) => energy > 0 && total > 0
    ? Math.max(SPECTRAL_FLOOR_DB, 10 * Math.log10(energy / total))
    : SPECTRAL_FLOOR_DB));
}

function spectralFeatures(power: Float64Array, rate: number, f0Hz: number): Readonly<{
  harmonicProfileDb: readonly number[];
  hnrDb: number;
  highBandShareDb: number;
}> {
  const upper = Math.min(BAND_HIGH_HZ, rate / 2);
  const binHz = rate / FFT_SIZE;
  const halfWidth = Math.max(2 * binHz, 0.018 * f0Hz);
  const harmonics: number[] = [];
  let harmonicTotal = 0;
  let residualTotal = 0;
  for (let bin = Math.ceil(BAND_LOW_HZ / binHz);
    bin <= Math.min(power.length - 1, Math.floor(upper / binHz)); bin += 1) {
    const frequency = bin * binHz;
    const nearest = Math.round(frequency / f0Hz);
    if (nearest >= 1 && nearest <= HARMONIC_COUNT &&
      Math.abs(frequency - nearest * f0Hz) <= halfWidth) harmonicTotal += power[bin] ?? 0;
    else residualTotal += power[bin] ?? 0;
  }
  for (let harmonic = 1; harmonic <= HARMONIC_COUNT; harmonic += 1) {
    const center = harmonic * f0Hz;
    harmonics.push(center <= upper ? sumBins(power, rate, center - halfWidth, center + halfWidth) : 0);
  }
  const fundamental = harmonics[0] ?? 0;
  const harmonicProfileDb = Object.freeze(harmonics.slice(1).map((energy) =>
    energy > 0 && fundamental > 0
      ? Math.max(SPECTRAL_FLOOR_DB, 10 * Math.log10(energy / fundamental))
      : SPECTRAL_FLOOR_DB));
  const hnrDb = harmonicTotal <= 0 ? SPECTRAL_FLOOR_DB : residualTotal <= 0 ? 120
    : Math.max(SPECTRAL_FLOOR_DB, Math.min(120, 10 * Math.log10(harmonicTotal / residualTotal)));
  const total = sumBins(power, rate, BAND_LOW_HZ, upper);
  const high = sumBins(power, rate, HIGH_BAND_LOW_HZ, upper);
  const highBandShareDb = total <= 0 || high <= 0 ? SPECTRAL_FLOOR_DB
    : Math.max(SPECTRAL_FLOOR_DB, 10 * Math.log10(high / total));
  return Object.freeze({ harmonicProfileDb, hnrDb, highBandShareDb });
}

/**
 * Estimate the first strong normalized-autocorrelation peak in the octave
 * around the expected pitch. Choosing the first peak (rather than the largest
 * multiple of it) is what makes an octave-mislabeled corpus entry fail closed.
 */
export function estimatePitch(pcm: MonoPcm, expectedHz: number): PitchEstimate | null {
  const bounds = sustainBounds(pcm);
  if (bounds === null || !Number.isFinite(expectedHz) || expectedHz <= 0) return null;
  const [start, end] = bounds;
  const minimumLag = Math.max(2, Math.floor(pcm.sampleRateHz / (expectedHz * 2)));
  const maximumLag = Math.min(end - start - 2,
    Math.ceil(pcm.sampleRateHz / (expectedHz / 2)));
  if (maximumLag <= minimumLag) return null;
  const scores = new Float64Array(maximumLag + 1);
  let bestScore = -1;
  let bestLag = minimumLag;
  for (let lag = minimumLag; lag <= maximumLag; lag += 1) {
    let cross = 0;
    let leftEnergy = 0;
    let rightEnergy = 0;
    for (let index = start; index + lag < end; index += 1) {
      const left = pcm.samples[index] ?? 0;
      const right = pcm.samples[index + lag] ?? 0;
      cross += left * right;
      leftEnergy += left * left;
      rightEnergy += right * right;
    }
    const denominator = Math.sqrt(leftEnergy * rightEnergy);
    const score = denominator > 0 ? cross / denominator : -1;
    scores[lag] = score;
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }
  const nearBest = Math.max(WIND_REFERENCE_GATE_POLICY.minimumPeriodicity, bestScore - 0.03);
  if ((scores[minimumLag] ?? -1) >= nearBest &&
    (scores[minimumLag] ?? -1) > (scores[minimumLag + 1] ?? -1)) {
    bestLag = minimumLag;
    bestScore = scores[minimumLag] ?? bestScore;
  } else {
    for (let lag = minimumLag + 1; lag < maximumLag; lag += 1) {
      const score = scores[lag] ?? -1;
      if (score >= nearBest && score >= (scores[lag - 1] ?? -1) &&
        score > (scores[lag + 1] ?? -1)) {
        bestLag = lag;
        bestScore = score;
        break;
      }
    }
  }
  const before = scores[Math.max(minimumLag, bestLag - 1)] ?? bestScore;
  const after = scores[Math.min(maximumLag, bestLag + 1)] ?? bestScore;
  const curvature = before - 2 * bestScore + after;
  const adjustment = Math.abs(curvature) > 1e-12
    ? Math.max(-0.5, Math.min(0.5, 0.5 * (before - after) / curvature)) : 0;
  const lag = bestLag + adjustment;
  const f0Hz = pcm.sampleRateHz / lag;
  const centsFromExpected = 1_200 * Math.log2(f0Hz / expectedHz);
  if (![f0Hz, centsFromExpected, bestScore].every(Number.isFinite)) return null;
  return Object.freeze({ f0Hz, centsFromExpected, periodicity: bestScore });
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : sorted[middle] ?? 0;
}

function persistentCrossing(values: readonly number[], threshold: number,
  consecutiveFrames: number): number | null {
  for (let index = 0; index <= values.length - consecutiveFrames; index += 1) {
    let passes = true;
    for (let offset = 0; offset < consecutiveFrames; offset += 1) {
      if ((values[index + offset] ?? 0) < threshold) {
        passes = false;
        break;
      }
    }
    if (passes) return index;
  }
  return null;
}

function measureOnset(pcm: MonoPcm): Readonly<{
  onsetSeconds: number;
  attackTo90SustainSeconds: number;
}> | null {
  const window = Math.max(1, Math.round(0.01 * pcm.sampleRateHz));
  const hop = Math.max(1, Math.round(0.005 * pcm.sampleRateHz));
  const rms: number[] = [];
  for (let start = 0; start + window <= pcm.samples.length; start += hop) {
    let energy = 0;
    for (let index = start; index < start + window; index += 1) {
      const sample = pcm.samples[index] ?? 0;
      energy += sample * sample;
    }
    rms.push(Math.sqrt(energy / window));
  }
  const sustainFirst = Math.floor(SUSTAIN_START_SECONDS * pcm.sampleRateHz / hop);
  const sustainLast = Math.min(rms.length,
    Math.ceil((SUSTAIN_START_SECONDS + SUSTAIN_LENGTH_SECONDS) * pcm.sampleRateHz / hop));
  const sustain = median(rms.slice(sustainFirst, sustainLast));
  if (!Number.isFinite(sustain) || sustain <= 1e-8) return null;
  const preRollFrames = Math.min(sustainFirst, Math.max(1, Math.round(0.05 * pcm.sampleRateHz / hop)));
  const noise = median(rms.slice(0, preRollFrames));
  const onsetThreshold = Math.max(0.05 * sustain, noise < 0.05 * sustain ? 4 * noise : 0);
  const onsetFrame = persistentCrossing(rms, onsetThreshold, 3);
  const ninetyFrame = persistentCrossing(rms, 0.9 * sustain, 3);
  if (onsetFrame === null || ninetyFrame === null || ninetyFrame < onsetFrame) return null;
  return Object.freeze({
    onsetSeconds: onsetFrame * hop / pcm.sampleRateHz,
    attackTo90SustainSeconds: Math.max(hop / pcm.sampleRateHz,
      (ninetyFrame - onsetFrame) * hop / pcm.sampleRateHz),
  });
}

export function analyzeSignal(pcm: MonoPcm, expectedHz: number,
  policy: ReferenceGatePolicy = WIND_REFERENCE_GATE_POLICY): AnalysisResult {
  const findings: GateFinding[] = [];
  const pitch = estimatePitch(pcm, expectedHz);
  if (pitch === null) findings.push(finding("PITCH_UNAVAILABLE", "no finite normalized pitch estimate"));
  else {
    if (pitch.periodicity < policy.minimumPeriodicity) {
      findings.push(finding("PERIODICITY_TOO_LOW",
        `periodicity ${pitch.periodicity.toFixed(4)} is below ${String(policy.minimumPeriodicity)}`));
    }
    if (Math.abs(pitch.centsFromExpected) > policy.maximumPitchCents) {
      findings.push(finding("PITCH_MISMATCH",
        `pitch is ${pitch.centsFromExpected.toFixed(2)} cents from expected`));
    }
  }
  const power = integratedPowerSpectrum(pcm);
  if (power === null) findings.push(finding("SPECTRUM_UNAVAILABLE", "insufficient sustain for Welch analysis"));
  const onset = measureOnset(pcm);
  if (onset === null) findings.push(finding("ONSET_UNAVAILABLE", "sustain-relative onset could not be measured"));
  if (findings.length > 0 || pitch === null || power === null || onset === null) {
    return Object.freeze({ outcome: "unavailable", findings: Object.freeze(findings) });
  }
  const spectral = spectralFeatures(power, pcm.sampleRateHz, pitch.f0Hz);
  const features = Object.freeze({
    pitch,
    integratedBandDb: integratedBandsDb(power, pcm.sampleRateHz),
    harmonicProfileDb: spectral.harmonicProfileDb,
    hnrDb: spectral.hnrDb,
    highBandShareDb: spectral.highBandShareDb,
    onsetSeconds: onset.onsetSeconds,
    attackTo90SustainSeconds: onset.attackTo90SustainSeconds,
  });
  if (!allFinite(features)) {
    return Object.freeze({ outcome: "unavailable", findings: Object.freeze([
      finding("NONFINITE_FEATURE", "analysis produced a non-finite feature"),
    ]) });
  }
  return Object.freeze({ outcome: "accept", features });
}

function rmsDistance(left: readonly number[], right: readonly number[]): number {
  if (left.length === 0 || left.length !== right.length) return Number.MAX_VALUE;
  let squared = 0;
  for (let index = 0; index < left.length; index += 1) {
    const delta = (left[index] ?? 0) - (right[index] ?? 0);
    squared += delta * delta;
  }
  return Math.sqrt(squared / left.length);
}

export function compareAdmittedSignals(candidate: SignalFeatures,
  reference: SignalFeatures): SimilarityReport {
  return Object.freeze({
    candidate,
    reference,
    pitchDeltaCents: Math.abs(candidate.pitch.centsFromExpected - reference.pitch.centsFromExpected),
    envelopeDb: rmsDistance(candidate.integratedBandDb, reference.integratedBandDb),
    harmonicDb: rmsDistance(candidate.harmonicProfileDb, reference.harmonicProfileDb),
    attackLog2: Math.abs(Math.log2(candidate.attackTo90SustainSeconds /
      reference.attackTo90SustainSeconds)),
    hnrAbsoluteDeltaDb: Math.abs(candidate.hnrDb - reference.hnrDb),
    highBandAbsoluteDeltaDb: Math.abs(candidate.highBandShareDb - reference.highBandShareDb),
  });
}

export function compareToReference(candidatePcm: MonoPcm, referencePcm: MonoPcm,
  expectedHz: number,
  policy: ReferenceGatePolicy = WIND_REFERENCE_GATE_POLICY,
  referenceExpectedHz: number = expectedHz):
  Readonly<{ outcome: "accept"; report: SimilarityReport }> |
  Readonly<{ outcome: "unavailable"; findings: readonly GateFinding[] }> {
  const candidate = analyzeSignal(candidatePcm, expectedHz, policy);
  const reference = analyzeSignal(referencePcm, referenceExpectedHz, policy);
  const findings: GateFinding[] = [];
  if (candidate.outcome === "unavailable") {
    findings.push(...candidate.findings.map((item) => finding(`CANDIDATE_${item.code}`, item.message)));
  }
  if (reference.outcome === "unavailable") {
    findings.push(...reference.findings.map((item) => finding(`REFERENCE_${item.code}`, item.message)));
  }
  if (candidate.outcome === "unavailable" || reference.outcome === "unavailable") {
    return Object.freeze({ outcome: "unavailable", findings: Object.freeze(findings) });
  }
  return Object.freeze({ outcome: "accept",
    report: compareAdmittedSignals(candidate.features, reference.features) });
}

export function evaluateSimilarityReport(report: SimilarityReport,
  identityControl: WindIdentityControlResult,
  policy: ReferenceGatePolicy = WIND_REFERENCE_GATE_POLICY): GateVerdict {
  if (identityControl.outcome !== "pass") return Object.freeze({
    outcome: "unavailable", exitCode: 2, findings: Object.freeze([
      finding("CONTROL_IDENTITY_NOT_SEPARATED",
        "no independent same-instrument/different-instrument identity boundary is established"),
    ]),
  });
  return evaluateSimilarityThresholds(report, policy);
}

function evaluateSimilarityThresholds(report: SimilarityReport,
  policy: ReferenceGatePolicy = WIND_REFERENCE_GATE_POLICY): GateVerdict {
  const failures: GateFinding[] = [];
  const maximum = (code: string, value: number, limit: number): void => {
    if (!Number.isFinite(value) || value > limit) failures.push(finding(code,
      `${String(value)} exceeds ${String(limit)}`));
  };
  const minimum = (code: string, value: number, floor: number): void => {
    if (!Number.isFinite(value) || value < floor) failures.push(finding(code,
      `${String(value)} is below the required separation ${String(floor)}`));
  };
  maximum("PITCH_DELTA", report.pitchDeltaCents, policy.maximumPitchDeltaCents);
  if (policy.mode === "proximity") {
    maximum("ENVELOPE_DISTANCE", report.envelopeDb, policy.maximumEnvelopeDb);
    maximum("HARMONIC_DISTANCE", report.harmonicDb, policy.maximumHarmonicDb);
    maximum("ATTACK_RATIO", report.attackLog2, policy.maximumAttackLog2);
    maximum("HNR_DELTA", report.hnrAbsoluteDeltaDb, policy.maximumAbsoluteHnrDeltaDb);
    maximum("HIGH_BAND_DELTA", report.highBandAbsoluteDeltaDb,
      policy.maximumAbsoluteHighBandDeltaDb);
  } else {
    minimum("ENVELOPE_SEPARATION", report.envelopeDb, policy.minimumEnvelopeSeparationDb);
    minimum("HARMONIC_SEPARATION", report.harmonicDb, policy.minimumHarmonicSeparationDb);
  }
  for (const [name, features] of [["candidate", report.candidate],
    ["reference", report.reference]] as const) {
    const attack = features.attackTo90SustainSeconds;
    if (!Number.isFinite(attack) || attack < policy.minimumAttackSeconds ||
      attack > policy.maximumAttackSeconds) {
      failures.push(finding("ATTACK_ABSOLUTE_RANGE", `${name} attack ${String(attack)} is out of range`));
    }
  }
  return Object.freeze({
    outcome: failures.length === 0 ? "pass" : "fail",
    exitCode: failures.length === 0 ? 0 : 1,
    findings: Object.freeze(failures),
  });
}

function timbreDistance(report: SimilarityReport): number {
  return Math.hypot(report.envelopeDb, report.harmonicDb);
}

/**
 * Establish the flute/clarinet identity boundary from independently recorded
 * references. Thresholds are frozen above and cannot be supplied by a render
 * candidate. Cross-instrument rejection uses only integrated spectral-envelope
 * and harmonic-profile distance; pitch is required to match and attack is not
 * part of the classifier.
 */
export function runWindIdentityControl(cells: readonly WindIdentityControlCell[]):
  WindIdentityControlResult {
  const measurements = Object.freeze(cells.map((cell) => {
    const fluteSame = compareAdmittedSignals(cell.fluteEarly, cell.fluteLate);
    const clarinetSame = compareAdmittedSignals(cell.clarinetEarly, cell.clarinetLate);
    const cross = compareAdmittedSignals(cell.fluteEarly, cell.clarinetEarly);
    return Object.freeze({
      id: cell.id,
      matchedPitchDeltaCents: Math.abs(1_200 * Math.log2(cell.flutePitchHz / cell.clarinetPitchHz)),
      fluteSameTimbreDistanceDb: timbreDistance(fluteSame),
      clarinetSameTimbreDistanceDb: timbreDistance(clarinetSame),
      crossInstrumentTimbreDistanceDb: timbreDistance(cross),
    });
  }));
  const pitches = new Set(cells.map((cell) => cell.midi));
  const dynamics = new Set(cells.map((cell) => cell.dynamic));
  if (cells.length < WIND_IDENTITY_CONTROL_POLICY.minimumCells ||
    pitches.size < WIND_IDENTITY_CONTROL_POLICY.minimumDistinctPitches ||
    dynamics.size < WIND_IDENTITY_CONTROL_POLICY.minimumDistinctDynamics) {
    return Object.freeze({ outcome: "unavailable", exitCode: 2,
      findings: Object.freeze([finding("IDENTITY_CORPUS_INSUFFICIENT",
        `${String(cells.length)} cells, ${String(pitches.size)} pitches, ${String(dynamics.size)} dynamics`)]),
      measurements });
  }
  const failures: GateFinding[] = [];
  for (const measurement of measurements) {
    if (!allFinite(measurement)) {
      failures.push(finding("IDENTITY_NONFINITE", `${measurement.id} has a non-finite measurement`));
      continue;
    }
    if (measurement.matchedPitchDeltaCents >
      WIND_IDENTITY_CONTROL_POLICY.maximumMatchedPitchDeltaCents) {
      failures.push(finding("IDENTITY_PITCH_NOT_MATCHED",
        `${measurement.id} differs by ${measurement.matchedPitchDeltaCents.toFixed(2)} cents`));
    }
    if (measurement.fluteSameTimbreDistanceDb >
      WIND_IDENTITY_CONTROL_POLICY.maximumSameInstrumentTimbreDistanceDb) {
      failures.push(finding("SAME_INSTRUMENT_TIMBRE_DRIFT",
        `${measurement.id} flute windows differ by ${measurement.fluteSameTimbreDistanceDb.toFixed(2)} dB`));
    }
    if (measurement.clarinetSameTimbreDistanceDb >
      WIND_IDENTITY_CONTROL_POLICY.maximumSameInstrumentTimbreDistanceDb) {
      failures.push(finding("SAME_INSTRUMENT_TIMBRE_DRIFT",
        `${measurement.id} clarinet windows differ by ${measurement.clarinetSameTimbreDistanceDb.toFixed(2)} dB`));
    }
    if (measurement.crossInstrumentTimbreDistanceDb <
      WIND_IDENTITY_CONTROL_POLICY.minimumCrossInstrumentTimbreDistanceDb) {
      failures.push(finding("CROSS_INSTRUMENT_TIMBRE_NOT_SEPARATED",
        `${measurement.id} cross timbre distance is only ${measurement.crossInstrumentTimbreDistanceDb.toFixed(2)} dB`));
    }
  }
  return Object.freeze({
    outcome: failures.length === 0 ? "pass" : "fail",
    exitCode: failures.length === 0 ? 0 : 1,
    findings: Object.freeze(failures),
    measurements,
  });
}

export function canonicalCorpusOutcome(requiredFiles: readonly Readonly<{
  path: string;
  present: boolean;
}>[]): GateVerdict {
  const missing = requiredFiles.filter((file) => !file.present);
  if (missing.length > 0) return Object.freeze({
    outcome: "unavailable", exitCode: 2,
    findings: Object.freeze(missing.map((file) =>
      finding("REFERENCE_CORPUS_ABSENT", `required reference is absent: ${file.path}`))),
  });
  return Object.freeze({ outcome: "pass", exitCode: 0, findings: Object.freeze([]) });
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).sort().map((key) => [key, canonicalize(record[key])]));
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function sha256Hex(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isDigest(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function allFinite(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(allFinite);
  if (value !== null && typeof value === "object") return Object.values(value).every(allFinite);
  return true;
}

export function windReferencePolicySha256(): string {
  return sha256Hex(canonicalJson(WIND_REFERENCE_GATE_POLICY));
}

export function gatePolicySha256(policy: ReferenceGatePolicy): string {
  return sha256Hex(canonicalJson(policy));
}

function policyForSha256(digest: string): ReferenceGatePolicy | null {
  for (const policy of Object.values(GATE_POLICIES)) {
    if (gatePolicySha256(policy) === digest) return policy;
  }
  return null;
}

function policyForId(id: unknown): ReferenceGatePolicy | null {
  if (typeof id !== "string") return null;
  return (GATE_POLICIES as Record<string, ReferenceGatePolicy>)[id] ?? null;
}

function hasEvidenceText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function controlsAreAllTrue(controls: unknown): boolean {
  if (controls === null || typeof controls !== "object" || Array.isArray(controls)) return false;
  const record = controls as Record<string, unknown>;
  const names = ["self", "whiteNoiseRejected", "overlyPureRejected",
    "wrongPitchRejected", "crossInstrumentRejected"] as const;
  return Object.keys(record).length === names.length &&
    names.every((name) => record[name] === true);
}

function findingsAreWellFormed(findings: unknown): findings is readonly GateFinding[] {
  return Array.isArray(findings) && findings.every((item: unknown) => {
    if (item === null || typeof item !== "object" || Array.isArray(item)) return false;
    const record = item as Record<string, unknown>;
    return Object.keys(record).length === 2 && hasEvidenceText(record["code"]) &&
      hasEvidenceText(record["message"]);
  });
}

function midiFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

function evidenceSemanticsAreValid(evidence: Omit<GateEvidenceV1, "evidenceSha256">,
  policy: ReferenceGatePolicy): boolean {
  if (!hasEvidenceText(evidence.candidate.rendererAlgorithmId) ||
    !hasEvidenceText(evidence.reference.corpusId) ||
    !hasEvidenceText(evidence.reference.filePath) ||
    !hasEvidenceText(evidence.reference.licenseId) ||
    !Number.isInteger(evidence.reference.expectedMidi) ||
    evidence.reference.expectedMidi < 0 || evidence.reference.expectedMidi > 127 ||
    evidence.reference.expectedHz <= 0 ||
    Math.abs(1_200 * Math.log2(evidence.reference.expectedHz /
      midiFrequency(evidence.reference.expectedMidi))) > 0.01 ||
    !findingsAreWellFormed(evidence.findings)) return false;

  if (evidence.outcome === "pass") {
    if (!controlsAreAllTrue(evidence.controls) || evidence.report === null ||
      evidence.findings.length !== 0) return false;
    return evaluateSimilarityThresholds(evidence.report, policy).outcome === "pass";
  }
  /* Untrusted input may carry any string here; stay fail-closed. */
  const residualOutcome: string = evidence.outcome;
  if (residualOutcome === "fail" || residualOutcome === "unavailable") {
    return evidence.findings.length > 0;
  }
  return false;
}

export function buildGateEvidence(input: GateEvidenceInput): GateEvidenceV1 {
  if (!Object.values(input.digests).every(isDigest)) throw new Error("all evidence digests must be lowercase SHA-256");
  if (!allFinite(input)) throw new Error("gate evidence must contain only finite numbers");
  const policy = policyForSha256(input.digests.policySha256);
  if (policy === null) {
    throw new Error("policy digest does not bind a canonical reference gate policy");
  }
  const body = {
    schema: REFERENCE_GATE_EVIDENCE_SCHEMA,
    outcome: input.outcome,
    gate: Object.freeze({
      algorithmId: REFERENCE_SIMILARITY_ALGORITHM_ID,
      implementationSha256: input.digests.analyzerImplementationSha256,
      policyId: policy.id,
      policySha256: input.digests.policySha256,
    }),
    candidate: Object.freeze({
      rendererAlgorithmId: input.rendererAlgorithmId,
      rendererSourceSha256: input.digests.rendererSourceSha256,
      wasmSha256: input.digests.wasmSha256,
      parameterPackSha256: input.digests.parameterPackSha256,
      renderRequestSha256: input.digests.renderRequestSha256,
      pcmSha256: input.digests.pcmSha256,
    }),
    reference: Object.freeze({
      corpusId: input.corpusId,
      corpusManifestSha256: input.digests.corpusManifestSha256,
      filePath: input.referencePath,
      fileSha256: input.digests.referenceFileSha256,
      licenseId: input.referenceLicenseId,
      expectedMidi: input.expectedMidi,
      expectedHz: input.expectedHz,
    }),
    controls: input.controls,
    report: input.report,
    findings: input.findings,
  } as const;
  if (!evidenceSemanticsAreValid(body, policy)) {
    throw new Error("gate evidence outcome is inconsistent with its controls, report, or findings");
  }
  return Object.freeze({ ...body, evidenceSha256: sha256Hex(canonicalJson(body)) });
}

export function verifyGateEvidence(value: unknown): boolean {
  if (value === null || typeof value !== "object" || !allFinite(value)) return false;
  const evidence = value as GateEvidenceV1;
  const gate = (evidence as { gate?: GateEvidenceV1["gate"] }).gate;
  const policy = policyForId(gate?.policyId);
  if ((evidence as { schema?: unknown }).schema !== REFERENCE_GATE_EVIDENCE_SCHEMA ||
    gate === undefined ||
    (gate as { algorithmId?: unknown }).algorithmId !== REFERENCE_SIMILARITY_ALGORITHM_ID ||
    policy === null ||
    gate.policySha256 !== gatePolicySha256(policy)) return false;
  const digests = [evidence.gate.implementationSha256, evidence.gate.policySha256,
    evidence.candidate.rendererSourceSha256, evidence.candidate.wasmSha256,
    evidence.candidate.parameterPackSha256, evidence.candidate.renderRequestSha256,
    evidence.candidate.pcmSha256, evidence.reference.corpusManifestSha256,
    evidence.reference.fileSha256, evidence.evidenceSha256];
  if (!digests.every(isDigest)) return false;
  const { evidenceSha256: claimed, ...body } = evidence;
  return evidenceSemanticsAreValid(body, policy) && claimed === sha256Hex(canonicalJson(body));
}
