/**
 * Reference-recording similarity metrics for physical instrument candidates.
 *
 * Exists because the owner delegated the ship/no-ship listening judgment to
 * machine evidence (2026-08-07, bead jcpe-winds-reference-quality-qb68): a
 * candidate render is compared against real CC0 recordings of the same
 * instrument at the same pitch, and must land inside the measured
 * same-instrument similarity cluster. Internal metrics (pitch, HNR) prove a
 * model is *well-behaved*; only reference comparison says it *resembles the
 * instrument*.
 *
 * All analysis is self-contained (RIFF reader, autocorrelation pitch,
 * Goertzel band/harmonic energies) and shares no code with the production
 * renderer or analyzer. Known-answer controls live in
 * tests/unit/reference-similarity.test.ts: a reference scores ~0 against
 * itself, catastrophically against white noise, and clearly worse against a
 * different instrument than against the same instrument at another pitch.
 * Acceptance thresholds are derived from that measured separation, not
 * invented.
 */

export type MonoPcm = Readonly<{
  samples: Float32Array;
  sampleRateHz: number;
}>;

export type SimilarityReport = Readonly<{
  /** RMS distance across normalized log band energies, dB. */
  envelopeDb: number;
  /** RMS distance across harmonic profile (h2..h12 rel h1), dB. */
  harmonicDb: number;
  /** |log2(candidateAttack / referenceAttack)|, octaves of attack-time ratio. */
  attackLog2: number;
  /** Candidate HNR minus reference HNR, dB (negative = noisier candidate). */
  hnrDeltaDb: number;
  candidateF0Hz: number | null;
  referenceF0Hz: number | null;
}>;

export type VibratoReport = Readonly<{
  rateHz: number | null;
  depthCents: number | null;
}>;

/** Sustain analysis window, seconds into each sound. */
const SUSTAIN_START_SECONDS = 0.4;
const SUSTAIN_LENGTH_SECONDS = 0.6;
const BAND_COUNT = 24;
const BAND_LOW_HZ = 100;
const BAND_HIGH_HZ = 10_000;
const HARMONIC_COUNT = 12;
/** Band floor so silence in one band cannot dominate the distance. */
const BAND_FLOOR_DB = -70;

/** Minimal RIFF/WAVE reader: PCM 16/24/32-bit int and 32-bit float, any
 * channel count (downmixed to mono by averaging). Throws on malformed input —
 * this is a dev-time evidence tool, not a runtime decoder. */
export function readWavMono(bytes: Uint8Array): MonoPcm {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, false) !== 0x52494646 || view.getUint32(8, false) !== 0x57415645) {
    throw new Error("not a RIFF/WAVE file");
  }
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
    if (id === 0x666d7420) {
      format = view.getUint16(offset + 8, true);
      channels = view.getUint16(offset + 10, true);
      sampleRateHz = view.getUint32(offset + 12, true);
      bitsPerSample = view.getUint16(offset + 22, true);
      if (format === 0xfffe && size >= 40) {
        format = view.getUint16(offset + 32, true);
      }
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
  const frameCount = Math.floor(dataLength / (bytesPerSample * channels));
  const samples = new Float32Array(frameCount);
  for (let frame = 0; frame < frameCount; frame += 1) {
    let sum = 0;
    for (let channel = 0; channel < channels; channel += 1) {
      const at = dataStart + (frame * channels + channel) * bytesPerSample;
      let value: number;
      if (format === 3 && bitsPerSample === 32) value = view.getFloat32(at, true);
      else if (bitsPerSample === 16) value = view.getInt16(at, true) / 32768;
      else if (bitsPerSample === 24) {
        const raw = view.getUint8(at) | (view.getUint8(at + 1) << 8) | (view.getUint8(at + 2) << 16);
        value = (raw >= 0x800000 ? raw - 0x1000000 : raw) / 8388608;
      } else if (bitsPerSample === 32) value = view.getInt32(at, true) / 2147483648;
      else throw new Error(`unsupported bit depth ${String(bitsPerSample)}`);
      sum += value;
    }
    samples[frame] = sum / channels;
  }
  return { samples, sampleRateHz };
}

function goertzelPower(segment: Float64Array, sampleRateHz: number, frequencyHz: number): number {
  const omega = (2 * Math.PI * frequencyHz) / sampleRateHz;
  const coefficient = 2 * Math.cos(omega);
  let sPrev = 0;
  let sPrev2 = 0;
  for (let index = 0; index < segment.length; index += 1) {
    const s = (segment[index] ?? 0) + coefficient * sPrev - sPrev2;
    sPrev2 = sPrev;
    sPrev = s;
  }
  return Math.max(0, sPrev * sPrev + sPrev2 * sPrev2 - coefficient * sPrev * sPrev2);
}

function sustainSegment(pcm: MonoPcm, startSeconds = SUSTAIN_START_SECONDS): Float64Array | null {
  const start = Math.round(startSeconds * pcm.sampleRateHz);
  const length = Math.min(
    Math.round(SUSTAIN_LENGTH_SECONDS * pcm.sampleRateHz),
    pcm.samples.length - start,
  );
  if (length < 4_096) return null;
  const segment = new Float64Array(length);
  let mean = 0;
  for (let index = 0; index < length; index += 1) mean += pcm.samples[start + index] ?? 0;
  mean /= length;
  for (let index = 0; index < length; index += 1) {
    const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (length - 1));
    segment[index] = ((pcm.samples[start + index] ?? 0) - mean) * hann;
  }
  return segment;
}

export function estimateF0Hz(pcm: MonoPcm, expectedHz: number): number | null {
  const start = Math.round(SUSTAIN_START_SECONDS * pcm.sampleRateHz);
  const length = Math.min(
    Math.round(SUSTAIN_LENGTH_SECONDS * pcm.sampleRateHz),
    pcm.samples.length - start,
  );
  if (length < 2_048) return null;
  const segment = new Float64Array(length);
  let mean = 0;
  for (let index = 0; index < length; index += 1) mean += pcm.samples[start + index] ?? 0;
  mean /= length;
  for (let index = 0; index < length; index += 1) {
    segment[index] = (pcm.samples[start + index] ?? 0) - mean;
  }
  let norm = 0;
  for (const value of segment) norm += value * value;
  if (norm <= 0) return null;
  const minLag = Math.max(2, Math.floor(pcm.sampleRateHz / (expectedHz * 1.5)));
  const maxLag = Math.min(segment.length - 2, Math.ceil(pcm.sampleRateHz / (expectedHz / 1.5)));
  let bestLag = 0;
  let bestScore = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let score = 0;
    for (let index = 0; index + lag < segment.length; index += 1) {
      score += (segment[index] ?? 0) * (segment[index + lag] ?? 0);
    }
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }
  if (bestLag < minLag + 1 || bestScore <= 0) return null;
  const at = (lag: number): number => {
    let score = 0;
    for (let index = 0; index + lag < segment.length; index += 1) {
      score += (segment[index] ?? 0) * (segment[index + lag] ?? 0);
    }
    return score;
  };
  const left = at(bestLag - 1);
  const right = at(bestLag + 1);
  const denominator = left - 2 * bestScore + right;
  const shift = denominator === 0 ? 0 : (0.5 * (left - right)) / denominator;
  return pcm.sampleRateHz / (bestLag + Math.max(-1, Math.min(1, shift)));
}

function bandEnergiesDb(segment: Float64Array, sampleRateHz: number): number[] {
  const ratio = Math.pow(BAND_HIGH_HZ / BAND_LOW_HZ, 1 / BAND_COUNT);
  const energies: number[] = [];
  let total = 0;
  const perBand: number[] = [];
  for (let band = 0; band < BAND_COUNT; band += 1) {
    const low = BAND_LOW_HZ * Math.pow(ratio, band);
    const high = low * ratio;
    if (high > sampleRateHz / 2) {
      perBand.push(0);
      continue;
    }
    let energy = 0;
    for (let probe = 0; probe < 4; probe += 1) {
      const frequency = low * Math.pow(high / low, (probe + 0.5) / 4);
      energy += goertzelPower(segment, sampleRateHz, frequency);
    }
    perBand.push(energy);
    total += energy;
  }
  for (const energy of perBand) {
    const db = total > 0 && energy > 0 ? 10 * Math.log10(energy / total) : BAND_FLOOR_DB;
    energies.push(Math.max(BAND_FLOOR_DB, db));
  }
  return energies;
}

function harmonicProfileDb(
  segment: Float64Array,
  sampleRateHz: number,
  f0Hz: number,
): number[] {
  const fundamental = goertzelPower(segment, sampleRateHz, f0Hz);
  const profile: number[] = [];
  for (let harmonic = 2; harmonic <= HARMONIC_COUNT; harmonic += 1) {
    const frequency = f0Hz * harmonic;
    if (frequency > sampleRateHz * 0.45) break;
    const power = goertzelPower(segment, sampleRateHz, frequency);
    const db = fundamental > 0 && power > 0 ? 10 * Math.log10(power / fundamental) : BAND_FLOOR_DB;
    profile.push(Math.max(BAND_FLOOR_DB, db));
  }
  return profile;
}

export function hnrDb(pcm: MonoPcm, f0Hz: number): number | null {
  const segment = sustainSegment(pcm);
  if (segment === null) return null;
  let harmonic = 0;
  let inter = 0;
  let count = 0;
  for (let k = 1; k <= HARMONIC_COUNT; k += 1) {
    const hf = f0Hz * k;
    const nf = f0Hz * (k + 0.5);
    if (nf > pcm.sampleRateHz * 0.45) break;
    harmonic += goertzelPower(segment, pcm.sampleRateHz, hf);
    inter += goertzelPower(segment, pcm.sampleRateHz, nf);
    count += 1;
  }
  if (count === 0 || inter <= 0) return null;
  return 10 * Math.log10(harmonic / inter);
}

function attackSeconds(pcm: MonoPcm): number | null {
  const hop = Math.max(1, Math.round(pcm.sampleRateHz * 0.005));
  const window = hop * 2;
  const envelope: number[] = [];
  for (let start = 0; start + window <= pcm.samples.length; start += hop) {
    let energy = 0;
    for (let index = 0; index < window; index += 1) {
      const value = pcm.samples[start + index] ?? 0;
      energy += value * value;
    }
    envelope.push(Math.sqrt(energy / window));
  }
  if (envelope.length < 4) return null;
  const peak = Math.max(...envelope);
  if (peak <= 0) return null;
  let tLow: number | null = null;
  for (let index = 0; index < envelope.length; index += 1) {
    const value = envelope[index] ?? 0;
    if (tLow === null && value >= 0.05 * peak) tLow = index;
    if (tLow !== null && value >= 0.9 * peak) {
      return ((index - tLow) * hop) / pcm.sampleRateHz;
    }
  }
  return null;
}

/** Compare a candidate against a reference at (approximately) the same pitch.
 * Both are analyzed at their own sample rates; every metric is level- and
 * duration-independent. */
export function compareToReference(
  candidate: MonoPcm,
  reference: MonoPcm,
  expectedHz: number,
  referenceExpectedHz = expectedHz,
): SimilarityReport | null {
  const candidateSegment = sustainSegment(candidate);
  const referenceSegment = sustainSegment(reference);
  if (candidateSegment === null || referenceSegment === null) return null;
  const candidateF0 = estimateF0Hz(candidate, expectedHz);
  const referenceF0 = estimateF0Hz(reference, referenceExpectedHz);

  const candidateBands = bandEnergiesDb(candidateSegment, candidate.sampleRateHz);
  const referenceBands = bandEnergiesDb(referenceSegment, reference.sampleRateHz);
  let envelopeSum = 0;
  for (let band = 0; band < BAND_COUNT; band += 1) {
    const difference = (candidateBands[band] ?? BAND_FLOOR_DB) - (referenceBands[band] ?? BAND_FLOOR_DB);
    envelopeSum += difference * difference;
  }
  const envelopeDb = Math.sqrt(envelopeSum / BAND_COUNT);

  let harmonicDb = Number.POSITIVE_INFINITY;
  if (candidateF0 !== null && referenceF0 !== null) {
    const candidateProfile = harmonicProfileDb(candidateSegment, candidate.sampleRateHz, candidateF0);
    const referenceProfile = harmonicProfileDb(referenceSegment, reference.sampleRateHz, referenceF0);
    const shared = Math.min(candidateProfile.length, referenceProfile.length);
    if (shared >= 4) {
      let sum = 0;
      for (let index = 0; index < shared; index += 1) {
        const difference = (candidateProfile[index] ?? 0) - (referenceProfile[index] ?? 0);
        sum += difference * difference;
      }
      harmonicDb = Math.sqrt(sum / shared);
    }
  }

  const candidateAttack = attackSeconds(candidate);
  const referenceAttack = attackSeconds(reference);
  const attackLog2 =
    candidateAttack !== null && referenceAttack !== null && candidateAttack > 0 && referenceAttack > 0
      ? Math.abs(Math.log2(candidateAttack / referenceAttack))
      : Number.POSITIVE_INFINITY;

  const candidateHnr = candidateF0 !== null ? hnrDb(candidate, candidateF0) : null;
  const referenceHnr = referenceF0 !== null ? hnrDb(reference, referenceF0) : null;
  const hnrDeltaDb =
    candidateHnr !== null && referenceHnr !== null ? candidateHnr - referenceHnr : Number.NEGATIVE_INFINITY;

  return {
    envelopeDb,
    harmonicDb,
    attackLog2,
    hnrDeltaDb,
    candidateF0Hz: candidateF0,
    referenceF0Hz: referenceF0,
  };
}

/** Vibrato rate/depth from an f0 track over the sustain (250 ms .. end-250 ms). */
export function measureVibrato(pcm: MonoPcm, expectedHz: number): VibratoReport {
  const hopSeconds = 0.03;
  const windowSeconds = 0.08;
  const hop = Math.round(pcm.sampleRateHz * hopSeconds);
  const window = Math.round(pcm.sampleRateHz * windowSeconds);
  const start = Math.round(pcm.sampleRateHz * 0.25);
  const end = pcm.samples.length - Math.round(pcm.sampleRateHz * 0.25);
  const track: number[] = [];
  for (let at = start; at + window < end; at += hop) {
    const slice: MonoPcm = {
      samples: pcm.samples.subarray(at, at + window),
      sampleRateHz: pcm.sampleRateHz,
    };
    const f0 = estimateF0HzShort(slice, expectedHz);
    if (f0 !== null) track.push(f0);
  }
  if (track.length < 12) return { rateHz: null, depthCents: null };
  const mean = track.reduce((sum, value) => sum + value, 0) / track.length;
  const cents = track.map((value) => 1200 * Math.log2(value / mean));
  let crossings = 0;
  for (let index = 1; index < cents.length; index += 1) {
    if ((cents[index - 1] ?? 0) < 0 !== (cents[index] ?? 0) < 0) crossings += 1;
  }
  const durationSeconds = (track.length - 1) * hopSeconds;
  const rateHz = durationSeconds > 0 ? crossings / 2 / durationSeconds : null;
  const sorted = [...cents].sort((left, right) => left - right);
  const p05 = sorted[Math.floor(sorted.length * 0.05)] ?? 0;
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  return { rateHz, depthCents: (p95 - p05) / 2 };
}

function estimateF0HzShort(pcm: MonoPcm, expectedHz: number): number | null {
  const segment = new Float64Array(pcm.samples.length);
  let mean = 0;
  for (const value of pcm.samples) mean += value;
  mean /= pcm.samples.length;
  for (let index = 0; index < pcm.samples.length; index += 1) {
    segment[index] = (pcm.samples[index] ?? 0) - mean;
  }
  const minLag = Math.max(2, Math.floor(pcm.sampleRateHz / (expectedHz * 1.3)));
  const maxLag = Math.min(segment.length - 2, Math.ceil(pcm.sampleRateHz / (expectedHz / 1.3)));
  if (maxLag <= minLag) return null;
  let bestLag = 0;
  let bestScore = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let score = 0;
    for (let index = 0; index + lag < segment.length; index += 1) {
      score += (segment[index] ?? 0) * (segment[index + lag] ?? 0);
    }
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }
  if (bestScore <= 0 || bestLag === 0) return null;
  return pcm.sampleRateHz / bestLag;
}
