/**
 * Plucked-family reference analysis (jcpe-mnsc.6.2).
 *
 * Self-contained: the winds reference module is under active revision in a
 * concurrent workstream (reverted at f5a7ba3, re-authored in-flight), so
 * the plucked machine gate owns its own compact analysis to stay neutral:
 * WAV decode, Welch band spectrum, 24-band envelope, harmonic profile, and
 * HNR. Same measurement definitions, independent code path.
 */

export type MonoPcm = Readonly<{ samples: Float32Array; sampleRateHz: number }>;

export type PluckedFeatures = Readonly<{
  integratedBandDb: readonly number[];
  harmonicProfileDb: readonly number[];
  hnrDb: number;
}>;

/** Minimal RIFF/WAVE reader: PCM16 and float32, first channel. */
export function readWavMono(bytes: Uint8Array): MonoPcm {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, false) !== 0x52494646 || view.getUint32(8, false) !== 0x57415645) {
    throw new Error("PLUCKED_WAV_NOT_RIFF");
  }
  let offset = 12;
  let format = 0;
  let channels = 1;
  let sampleRateHz = 0;
  let bitsPerSample = 0;
  let dataOffset = -1;
  let dataBytes = 0;
  while (offset + 8 <= view.byteLength) {
    const chunkId = view.getUint32(offset, false);
    const chunkSize = view.getUint32(offset + 4, true);
    if (chunkId === 0x666d7420) {
      format = view.getUint16(offset + 8, true);
      channels = view.getUint16(offset + 10, true);
      sampleRateHz = view.getUint32(offset + 12, true);
      bitsPerSample = view.getUint16(offset + 22, true);
      /* WAVE_FORMAT_EXTENSIBLE: the real format is the first sub-format
       * GUID word at fmt+24 (PCM=1, float=3). */
      if (format === 0xfffe && chunkSize >= 40) {
        format = view.getUint16(offset + 8 + 24, true);
      }
    } else if (chunkId === 0x64617461) {
      dataOffset = offset + 8;
      dataBytes = chunkSize;
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }
  if (dataOffset < 0 || sampleRateHz <= 0 || channels < 1) {
    throw new Error("PLUCKED_WAV_SHAPE");
  }
  const bytesPerSample = bitsPerSample / 8;
  const frameBytes = bytesPerSample * channels;
  const frames = Math.floor(dataBytes / frameBytes);
  const samples = new Float32Array(frames);
  for (let frame = 0; frame < frames; frame += 1) {
    const at = dataOffset + frame * frameBytes;
    if (format === 3 && bitsPerSample === 32) {
      samples[frame] = view.getFloat32(at, true);
    } else if (format === 1 && bitsPerSample === 16) {
      samples[frame] = view.getInt16(at, true) / 32_768;
    } else if (format === 1 && bitsPerSample === 24) {
      const low = view.getUint8(at);
      const mid = view.getUint8(at + 1);
      const high = view.getInt8(at + 2);
      samples[frame] = ((high << 16) | (mid << 8) | low) / 8_388_608;
    } else {
      throw new Error(`PLUCKED_WAV_FORMAT:${String(format)}/${String(bitsPerSample)}`);
    }
  }
  return { samples, sampleRateHz };
}

const BAND_COUNT = 24;
const BAND_TOP_HZ = 10_000;
const FFT_SIZE = 8_192;

function hannWindowPower(samples: Float32Array, start: number): Float64Array {
  /* Real DFT magnitude^2 via Goertzel per bin is too slow for 4096 bins;
   * use a radix-2 FFT (compact, self-contained). */
  const real = new Float64Array(FFT_SIZE);
  const imag = new Float64Array(FFT_SIZE);
  for (let index = 0; index < FFT_SIZE; index += 1) {
    const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (FFT_SIZE - 1));
    real[index] = (samples[start + index] ?? 0) * hann;
  }
  /* Iterative Cooley-Tukey. */
  for (let i = 1, j = 0; i < FFT_SIZE; i += 1) {
    let bit = FFT_SIZE >> 1;
    for (; (j & bit) !== 0; bit >>= 1) j &= ~bit;
    j |= bit;
    if (i < j) {
      const tr = real[i] ?? 0;
      real[i] = real[j] ?? 0;
      real[j] = tr;
      const ti = imag[i] ?? 0;
      imag[i] = imag[j] ?? 0;
      imag[j] = ti;
    }
  }
  for (let length = 2; length <= FFT_SIZE; length <<= 1) {
    const angle = (-2 * Math.PI) / length;
    const wReal = Math.cos(angle);
    const wImag = Math.sin(angle);
    for (let block = 0; block < FFT_SIZE; block += length) {
      let curReal = 1;
      let curImag = 0;
      for (let pair = 0; pair < length / 2; pair += 1) {
        const evenIndex = block + pair;
        const oddIndex = block + pair + length / 2;
        const oddReal = (real[oddIndex] ?? 0) * curReal - (imag[oddIndex] ?? 0) * curImag;
        const oddImag = (real[oddIndex] ?? 0) * curImag + (imag[oddIndex] ?? 0) * curReal;
        real[oddIndex] = (real[evenIndex] ?? 0) - oddReal;
        imag[oddIndex] = (imag[evenIndex] ?? 0) - oddImag;
        real[evenIndex] = (real[evenIndex] ?? 0) + oddReal;
        imag[evenIndex] = (imag[evenIndex] ?? 0) + oddImag;
        const nextReal = curReal * wReal - curImag * wImag;
        curImag = curReal * wImag + curImag * wReal;
        curReal = nextReal;
      }
    }
  }
  const power = new Float64Array(FFT_SIZE / 2);
  for (let bin = 0; bin < FFT_SIZE / 2; bin += 1) {
    power[bin] = (real[bin] ?? 0) ** 2 + (imag[bin] ?? 0) ** 2;
  }
  return power;
}

/** Welch-averaged power spectrum over the sustained region. */
function welchPower(pcm: MonoPcm): Float64Array | null {
  const start = Math.round(0.05 * pcm.sampleRateHz);
  const usable = pcm.samples.length - start - FFT_SIZE;
  if (usable < 0) return null;
  const hops = Math.max(1, Math.min(8, Math.floor(usable / (FFT_SIZE / 2)) + 1));
  const accumulated = new Float64Array(FFT_SIZE / 2);
  for (let hop = 0; hop < hops; hop += 1) {
    const segment = hannWindowPower(pcm.samples, start + hop * (FFT_SIZE >> 1));
    for (let bin = 0; bin < accumulated.length; bin += 1) {
      accumulated[bin] = (accumulated[bin] ?? 0) + (segment[bin] ?? 0);
    }
  }
  return accumulated;
}

export function analyzePlucked(pcm: MonoPcm, f0Hz: number): PluckedFeatures | null {
  const power = welchPower(pcm);
  if (power === null) return null;
  const binHz = pcm.sampleRateHz / FFT_SIZE;
  /* 24 log-spaced bands from 40 Hz to 10 kHz. */
  const bands: number[] = [];
  const low = Math.log(40);
  const high = Math.log(BAND_TOP_HZ);
  let total = 0;
  for (const value of power) total += value;
  for (let band = 0; band < BAND_COUNT; band += 1) {
    const fromHz = Math.exp(low + ((high - low) * band) / BAND_COUNT);
    const toHz = Math.exp(low + ((high - low) * (band + 1)) / BAND_COUNT);
    let acc = 0;
    for (
      let bin = Math.max(1, Math.floor(fromHz / binHz));
      bin < Math.min(power.length, Math.ceil(toHz / binHz));
      bin += 1
    ) {
      acc += power[bin] ?? 0;
    }
    bands.push(10 * Math.log10(acc / (total + 1e-30) + 1e-12));
  }
  /* Harmonic profile: peak power in a +-3% window around k*f0, relative to
   * the fundamental; HNR: harmonic energy vs inter-harmonic energy. */
  const harmonicDb: number[] = [];
  let harmonicEnergy = 0;
  let fundamental = 0;
  for (let k = 1; k <= 12; k += 1) {
    const target = k * f0Hz;
    if (target > pcm.sampleRateHz * 0.45) break;
    let best = 0;
    for (
      let bin = Math.max(1, Math.floor((target * 0.97) / binHz));
      bin < Math.min(power.length, Math.ceil((target * 1.03) / binHz));
      bin += 1
    ) {
      if ((power[bin] ?? 0) > best) best = power[bin] ?? 0;
    }
    harmonicEnergy += best;
    if (k === 1) fundamental = best;
    harmonicDb.push(10 * Math.log10(best / (fundamental + 1e-30) + 1e-12));
  }
  let interEnergy = 0;
  let interCount = 0;
  for (let k = 1; k < 12; k += 1) {
    const target = (k + 0.5) * f0Hz;
    if (target > pcm.sampleRateHz * 0.45) break;
    let best = 0;
    for (
      let bin = Math.max(1, Math.floor((target * 0.97) / binHz));
      bin < Math.min(power.length, Math.ceil((target * 1.03) / binHz));
      bin += 1
    ) {
      if ((power[bin] ?? 0) > best) best = power[bin] ?? 0;
    }
    interEnergy += best;
    interCount += 1;
  }
  const hnrDb =
    10 * Math.log10(harmonicEnergy / ((interEnergy * 12) / Math.max(1, interCount) + 1e-30) + 1e-12);
  return Object.freeze({
    integratedBandDb: Object.freeze(bands),
    harmonicProfileDb: Object.freeze(harmonicDb),
    hnrDb,
  });
}

export function harmonicDistanceDb(
  candidate: readonly number[],
  reference: readonly number[],
): number {
  const length = Math.min(candidate.length, reference.length);
  if (length === 0) return Number.MAX_VALUE;
  let squared = 0;
  for (let index = 0; index < length; index += 1) {
    const delta = (candidate[index] ?? 0) - (reference[index] ?? 0);
    squared += delta * delta;
  }
  return Math.sqrt(squared / length);
}
