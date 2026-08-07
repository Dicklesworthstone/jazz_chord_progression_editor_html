/**
 * Automated pre-listening screen for rendered audition candidates.
 *
 * Exists because owner listening (2026-08-06, clarinet v2 pack
 * eb688080f82197dd) was spent discovering "pure noise" cells that a
 * machine could have caught: an unphonated render has no pitch lock and
 * no harmonic structure, and shipping it to human ears wastes the one
 * gate that cannot be automated. Every candidate cell is screened before
 * a pack is emitted; a failing cell still writes its WAV (the evidence
 * must remain auditable) but the manifest marks it SCREEN-FAILED with the
 * measured numbers and the generator exits nonzero so a broken pack is
 * never handed over unknowingly.
 *
 * The metrics are independent re-implementations (autocorrelation pitch,
 * Goertzel harmonic-to-noise, one-pole band split) sharing no code with
 * the production renderer or analyzer, and the module carries its own
 * known-answer controls in tests/unit/listening-screen.test.ts.
 */

export type ScreenVerdict = Readonly<{
  pass: boolean;
  reasons: readonly string[];
  centsOffset: number | null;
  hnrDb: number | null;
  referenceHnrDb: number | null;
  highBandDb: number;
}>;

export const SCREEN_CENTS_GATE = 15;
export const SCREEN_HNR_FLOOR_DB = 18;
/** Candidate may trail its comparator by at most this much harmonicity. */
export const SCREEN_HNR_REFERENCE_MARGIN_DB = 3;
/** Sustained energy above 5.5 kHz relative to total, authored ceiling. */
export const SCREEN_HIGH_BAND_CEILING_DB = -15;
const SEGMENT_START_SECONDS = 0.4;
const SEGMENT_LENGTH_SECONDS = 0.6;

function autocorrelationF0(
  samples: Float32Array,
  sampleRateHz: number,
  expectedHz: number,
): number | null {
  const start = Math.round(SEGMENT_START_SECONDS * sampleRateHz);
  const length = Math.min(
    Math.round(SEGMENT_LENGTH_SECONDS * sampleRateHz),
    samples.length - start,
  );
  if (length < 2_048) return null;
  const segment = new Float64Array(length);
  let mean = 0;
  for (let index = 0; index < length; index += 1) mean += samples[start + index] ?? 0;
  mean /= length;
  for (let index = 0; index < length; index += 1) {
    segment[index] = (samples[start + index] ?? 0) - mean;
  }
  let norm = 0;
  for (const value of segment) norm += value * value;
  if (norm <= 0) return null;
  const minLag = Math.floor(sampleRateHz / (expectedHz * 1.5));
  const maxLag = Math.ceil(sampleRateHz / (expectedHz / 1.5));
  const scores = new Float64Array(maxLag + 2);
  let bestLag = -1;
  let bestScore = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let sum = 0;
    for (let index = 0; index + lag < length; index += 1) {
      sum += (segment[index] ?? 0) * (segment[index + lag] ?? 0);
    }
    const score = sum / norm;
    scores[lag] = score;
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }
  if (bestLag < 0 || bestScore < 0.5) return null;
  const y0 = scores[bestLag - 1] ?? bestScore;
  const y2 = scores[bestLag + 1] ?? bestScore;
  const denominator = y0 - 2 * bestScore + y2;
  const shift = denominator === 0 ? 0 : (0.5 * (y0 - y2)) / denominator;
  return sampleRateHz / (bestLag + Math.max(-1, Math.min(1, shift)));
}

function goertzelPower(segment: Float64Array, sampleRateHz: number, hz: number): number {
  const omega = (2 * Math.PI * hz) / sampleRateHz;
  const coefficient = 2 * Math.cos(omega);
  let s1 = 0;
  let s2 = 0;
  for (const value of segment) {
    const s = value + coefficient * s1 - s2;
    s2 = s1;
    s1 = s;
  }
  return s1 * s1 + s2 * s2 - coefficient * s1 * s2;
}

function harmonicToNoiseDb(
  samples: Float32Array,
  sampleRateHz: number,
  f0Hz: number,
): number {
  const start = Math.round(SEGMENT_START_SECONDS * sampleRateHz);
  const length = Math.min(
    Math.round(SEGMENT_LENGTH_SECONDS * sampleRateHz),
    samples.length - start,
  );
  const segment = new Float64Array(length);
  for (let index = 0; index < length; index += 1) {
    const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (length - 1));
    segment[index] = (samples[start + index] ?? 0) * hann;
  }
  let harmonic = 0;
  let interharmonic = 0;
  const partialCount = Math.floor((sampleRateHz * 0.45) / f0Hz);
  for (let k = 1; k <= partialCount; k += 1) {
    harmonic += goertzelPower(segment, sampleRateHz, k * f0Hz);
    interharmonic += goertzelPower(segment, sampleRateHz, (k + 0.5) * f0Hz);
  }
  if (interharmonic <= 0) return 120;
  return 10 * Math.log10(harmonic / interharmonic);
}

function highBandShareDb(
  samples: Float32Array,
  sampleRateHz: number,
  cutoffHz: number,
): number {
  const start = Math.round(SEGMENT_START_SECONDS * sampleRateHz);
  const length = Math.min(
    Math.round(0.8 * sampleRateHz),
    samples.length - start,
  );
  const alpha = Math.exp((-2 * Math.PI * cutoffHz) / sampleRateHz);
  let lowpass = 0;
  let total = 0;
  let high = 0;
  for (let index = 0; index < length; index += 1) {
    const value = samples[start + index] ?? 0;
    lowpass = (1 - alpha) * value + alpha * lowpass;
    const highpass = value - lowpass;
    total += value * value;
    high += highpass * highpass;
  }
  if (total <= 0) return -120;
  return 10 * Math.log10(high / total);
}

/**
 * Screen one candidate cell against its expected pitch and (optionally)
 * a comparator render of the same cell. Pure, deterministic, refusal-free:
 * the verdict reports, the caller decides.
 */
export function screenListeningCandidate(
  candidate: Float32Array,
  sampleRateHz: number,
  expectedHz: number,
  reference?: Float32Array,
): ScreenVerdict {
  const reasons: string[] = [];
  const f0 = autocorrelationF0(candidate, sampleRateHz, expectedHz);
  const centsOffset = f0 === null ? null : 1200 * Math.log2(f0 / expectedHz);
  let hnr: number | null = null;
  if (f0 === null) {
    reasons.push("no pitch lock (unphonated / pure noise)");
  } else if (Math.abs(centsOffset ?? 0) > SCREEN_CENTS_GATE) {
    reasons.push(`pitch ${String(centsOffset?.toFixed(1))} cents outside +-${String(SCREEN_CENTS_GATE)}`);
  } else {
    hnr = harmonicToNoiseDb(candidate, sampleRateHz, f0);
    if (hnr < SCREEN_HNR_FLOOR_DB) {
      reasons.push(`HNR ${hnr.toFixed(1)} dB below the ${String(SCREEN_HNR_FLOOR_DB)} dB floor`);
    }
  }
  let referenceHnr: number | null = null;
  if (reference !== undefined && f0 !== null && hnr !== null) {
    const referenceF0 = autocorrelationF0(reference, sampleRateHz, expectedHz);
    if (referenceF0 !== null) {
      referenceHnr = harmonicToNoiseDb(reference, sampleRateHz, referenceF0);
      if (hnr < referenceHnr - SCREEN_HNR_REFERENCE_MARGIN_DB) {
        reasons.push(
          `HNR ${hnr.toFixed(1)} dB trails comparator ${referenceHnr.toFixed(1)} dB by more than ${String(SCREEN_HNR_REFERENCE_MARGIN_DB)} dB`,
        );
      }
    }
  }
  const highBand = highBandShareDb(candidate, sampleRateHz, 5_500);
  if (highBand > SCREEN_HIGH_BAND_CEILING_DB) {
    reasons.push(
      `>5.5 kHz share ${highBand.toFixed(1)} dB above the ${String(SCREEN_HIGH_BAND_CEILING_DB)} dB ceiling`,
    );
  }
  return Object.freeze({
    pass: reasons.length === 0,
    reasons: Object.freeze(reasons),
    centsOffset: centsOffset === null ? null : Number(centsOffset.toFixed(2)),
    hnrDb: hnr === null ? null : Number(hnr.toFixed(2)),
    referenceHnrDb: referenceHnr === null ? null : Number(referenceHnr.toFixed(2)),
    highBandDb: Number(highBand.toFixed(2)),
  });
}
