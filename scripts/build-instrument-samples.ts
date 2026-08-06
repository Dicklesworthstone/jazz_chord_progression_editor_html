/**
 * Development-time generator for the embedded sampled-instrument payloads
 * (upright bass and vibraphone).
 *
 * `bun run build` never reads a wav file: the payloads are checked-in source
 * at `src/audio/wasm/upright-bass-samples.ts` and
 * `src/audio/wasm/vibraphone-samples.ts`, generated here from local copies of
 * two CC0 corpora. Reproducing the payloads requires those corpora, whose
 * root is given by `INSTRUMENT_SAMPLE_SOURCE_DIR` (expected to contain
 * `bass/` and `vibes/`); `--check` re-slices and fails on any drift between
 * the recorded sources and the checked-in payloads.
 *
 * Sources (both CC0-1.0, no attribution required, given anyway):
 *   - VSCO 2 Community Edition, Solo Contrabass Pizzicato
 *     <https://github.com/sgossner/VSCO-2-CE>
 *   - Versilian Community Sample Library, Vibraphone Soft Mallets
 *     <https://github.com/sgossner/VCSL>
 *
 * Both corpora name files one octave below sounding pitch: the recording
 * named E0 sounds E1 (MIDI 28). Every slice is pitch-verified against the
 * expected fundamental before it is embedded, so a mislabeled or
 * octave-shifted recording is a build failure, not a payload defect. The
 * verification is narrowband (a cents scan around the expected fundamental
 * plus a no-subharmonic guard) rather than open pitch detection, because an
 * open detector octave-errs on exactly the low pizzicato recordings this
 * payload exists to carry.
 *
 * The payloads are mono raw little-endian 16-bit PCM with no container:
 * one channel per recording (the higher-transient channel of the stereo
 * pair), sinc-resampled to a per-instrument rate chosen for the artifact
 * size budget, onset-trimmed, peak normalized, and fade-tailed. The runtime
 * needs no decoder and no browser media API.
 *
 * Usage:
 *   bun scripts/build-instrument-samples.ts            # regenerate modules
 *   bun scripts/build-instrument-samples.ts --check    # verify drift
 */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

const DEFAULT_SOURCE_DIR =
  "/data/tmp/claude-1000/-data-projects-jazz-chord-progression-editor-html" +
  "/d641d827-e1bd-4054-b867-5a575baa7d76/scratchpad/instrument-corpus";

/** Every corpus recording is 44.1 kHz 16-bit PCM. */
const SOURCE_RATE_HZ = 44_100;
/** Peak-normalize each slice: the runtime matches level via the recipe. */
const PEAK_TARGET = 0.985;
/** Onset search: first sample at 0.5 % of the search-window peak. */
const ONSET_THRESHOLD_RATIO = 0.005;
const ONSET_SEARCH_FRAMES = 88_200;
const ONSET_BACKOFF_FRAMES = 44;

/** Tuning scan (source rate): +-80 cents around the expected fundamental. */
const TUNING_SCAN_CENTS = 80;
const TUNING_SCAN_STEP_CENTS = 0.5;
const TUNING_PARTIALS = [1, 2, 3, 4] as const;
const TUNING_WINDOW_START_FRAMES = 882;
const TUNING_WINDOW_FRAMES = 26_460;
const TUNING_MINIMUM_WINDOW_FRAMES = 8_820;
/**
 * Pitch-identity guard: a likelihood test of the expected pitch against the
 * octave-up and octave-down mislabel hypotheses, each scored by the same
 * harmonic comb the tuning scan uses. Measured across both corpora a
 * correctly labeled recording scores the shifted hypotheses at no more than
 * 0.57x the expected score, while a mislabel would put its whole harmonic
 * series under the shifted comb and push the ratio past one; the threshold
 * sits between with margin. Below 55 Hz the test is not run: a low
 * pizzicato fundamental is physically weaker than its even harmonics, so
 * the octave-up comb legitimately outscores the expected one there
 * (measured 1.62x on the low E) and the test would reject every honest
 * recording. Those lowest keys are covered by the resolvable-tuning and
 * fundamental-presence checks plus the convention anchored by every
 * higher-pitched file in the same recording session.
 */
const HYPOTHESIS_TEST_MIN_F0_HZ = 55;
const OCTAVE_HYPOTHESIS_MAX_RATIO = 0.85;
const FUNDAMENTAL_MIN_RATIO = 0.05;

/** Windowed-sinc resampler: 48 zero crossings per side, Blackman window. */
const RESAMPLE_TAPS_PER_SIDE = 48;

type InstrumentSourceFile = Readonly<{
  file: string;
  /** Concert MIDI pitch the recording sounds at (named octave + 12). */
  midiPitch: number;
}>;

type InstrumentConfig = Readonly<{
  key: string;
  subdirectory: string;
  modulePath: string;
  constantPrefix: string;
  sliceTypeName: string;
  attribution: string;
  license: string;
  licenseUrl: string;
  sourceUrl: string;
  sourceDescription: string;
  targetRateHz: number;
  sliceFrames: number;
  fadeInFrames: number;
  fadeOutFrames: number;
  files: readonly InstrumentSourceFile[];
}>;

/**
 * Upright bass: 12 of the 14 available pizzicato keys. F#0 and G#1 are
 * deliberately omitted — their neighbors sit within one or two semitones,
 * so dropping them keeps the worst-case transposition at two semitones
 * while buying every remaining key a longer embedded tail inside the same
 * byte budget. 22.05 kHz keeps everything a pizzicato bass radiates
 * (fundamental 41-247 Hz, body and string noise well under 10 kHz).
 */
const UPRIGHT_BASS: InstrumentConfig = {
  key: "upright-bass",
  subdirectory: "bass",
  modulePath: "src/audio/wasm/upright-bass-samples.ts",
  constantPrefix: "UPRIGHT_BASS_SAMPLES",
  sliceTypeName: "UprightBassSampleSlice",
  attribution:
    "VSCO 2 Community Edition, Solo Contrabass Pizzicato, by Versilian Studios / Sam Gossner, CC0-1.0",
  license: "CC0-1.0",
  licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
  sourceUrl: "https://github.com/sgossner/VSCO-2-CE",
  sourceDescription:
    "Solo contrabass, pizzicato, recorded at 44.1 kHz 16-bit stereo",
  targetRateHz: 22_050,
  /* 1.6 s: a pizzicato note has decayed well into its tail by then. */
  sliceFrames: 35_280,
  /* ~5 ms fade-in, ~320 ms fade-out into the runtime release envelope. */
  fadeInFrames: 110,
  fadeOutFrames: 7_056,
  files: [
    { file: "BKCtbss_Pizz_E0_v1_rr1.wav", midiPitch: 28 },
    { file: "BKCtbss_Pizz_G0_v1_rr1.wav", midiPitch: 31 },
    { file: "BKCtbss_Pizz_A#0_v1_rr1.wav", midiPitch: 34 },
    { file: "BKCtbss_Pizz_C1_v1_rr1.wav", midiPitch: 36 },
    { file: "BKCtbss_Pizz_D1_v1_rr1.wav", midiPitch: 38 },
    { file: "BKCtbss_Pizz_E1_v1_rr1.wav", midiPitch: 40 },
    { file: "BKCtbss_Pizz_F#1_v1_rr1.wav", midiPitch: 42 },
    { file: "BKCtbss_Pizz_A1_v1_rr1.wav", midiPitch: 45 },
    { file: "BKCtbss_Pizz_C#2_v1_rr1.wav", midiPitch: 49 },
    { file: "BKCtbss_Pizz_E2_v1_rr1.wav", midiPitch: 52 },
    { file: "BKCtbss_Pizz_G#2_v1_rr1.wav", midiPitch: 56 },
    { file: "BKCtbss_Pizz_B2_v1_rr1.wav", midiPitch: 59 },
  ],
} as const;

/**
 * Vibraphone: all 11 soft-mallet keys, spanning the full three-octave
 * F3..E6 instrument in major thirds (worst-case transposition two
 * semitones). 32 kHz keeps the metallic shimmer to 16 kHz.
 */
const VIBRAPHONE: InstrumentConfig = {
  key: "vibraphone",
  subdirectory: "vibes",
  modulePath: "src/audio/wasm/vibraphone-samples.ts",
  constantPrefix: "VIBRAPHONE_SAMPLES",
  sliceTypeName: "VibraphoneSampleSlice",
  attribution:
    "Versilian Community Sample Library, Vibraphone Soft Mallets, by Versilian Studios / Sam Gossner, CC0-1.0",
  license: "CC0-1.0",
  licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
  sourceUrl: "https://github.com/sgossner/VCSL",
  sourceDescription:
    "Vibraphone, soft mallets, recorded at 44.1 kHz 16-bit stereo",
  targetRateHz: 32_000,
  /* 1.8 s of a 6-18 s ring; the runtime release envelope carries the rest. */
  sliceFrames: 57_600,
  /* ~5 ms fade-in, ~500 ms fade-out. */
  fadeInFrames: 160,
  fadeOutFrames: 16_000,
  files: [
    { file: "Vibes_soft_F2_v2_rr1_Main.wav", midiPitch: 53 },
    { file: "Vibes_soft_A2_v2_rr1_Main.wav", midiPitch: 57 },
    { file: "Vibes_soft_C3_v2_rr1_Main.wav", midiPitch: 60 },
    { file: "Vibes_soft_E3_v2_rr1_Main.wav", midiPitch: 64 },
    { file: "Vibes_soft_G3_v2_rr1_Main.wav", midiPitch: 67 },
    { file: "Vibes_soft_B3_v2_rr1_Main.wav", midiPitch: 71 },
    { file: "Vibes_soft_D4_v2_rr1_Main.wav", midiPitch: 74 },
    { file: "Vibes_soft_F4_v2_rr1_Main.wav", midiPitch: 77 },
    { file: "Vibes_soft_A4_v2_rr1_Main.wav", midiPitch: 81 },
    { file: "Vibes_soft_C5_v2_rr1_Main.wav", midiPitch: 84 },
    { file: "Vibes_soft_E5_v2_rr1_Main.wav", midiPitch: 88 },
  ],
} as const;

const INSTRUMENTS = [UPRIGHT_BASS, VIBRAPHONE] as const;

type WavPcm = Readonly<{
  channels: number;
  sampleRateHz: number;
  bitsPerSample: number;
  frameCount: number;
  dataOffset: number;
}>;

/** Minimal RIFF/WAVE chunk walk: the corpora are uncompressed 16-bit PCM. */
function parseWav(buffer: Buffer): WavPcm {
  if (
    buffer.length < 12 ||
    buffer.toString("latin1", 0, 4) !== "RIFF" ||
    buffer.toString("latin1", 8, 12) !== "WAVE"
  ) {
    throw new Error("INSTRUMENT_SAMPLES_WAV_HEADER");
  }
  let offset = 12;
  let channels = 0;
  let sampleRateHz = 0;
  let bitsPerSample = 0;
  let dataOffset = -1;
  let dataBytes = 0;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("latin1", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === "fmt ") {
      if (buffer.readUInt16LE(body) !== 1) {
        throw new Error("INSTRUMENT_SAMPLES_WAV_NOT_PCM");
      }
      channels = buffer.readUInt16LE(body + 2);
      sampleRateHz = buffer.readUInt32LE(body + 4);
      bitsPerSample = buffer.readUInt16LE(body + 14);
    } else if (id === "data") {
      dataOffset = body;
      dataBytes = Math.min(size, buffer.length - body);
    }
    offset = body + size + (size % 2);
  }
  if (dataOffset < 0 || channels < 1 || bitsPerSample !== 16) {
    throw new Error("INSTRUMENT_SAMPLES_WAV_SHAPE");
  }
  if (sampleRateHz !== SOURCE_RATE_HZ) {
    throw new Error(
      `INSTRUMENT_SAMPLES_WAV_RATE: ${String(sampleRateHz)} != ${String(SOURCE_RATE_HZ)}`,
    );
  }
  return {
    channels,
    sampleRateHz,
    bitsPerSample,
    frameCount: Math.floor(dataBytes / (channels * 2)),
    dataOffset,
  };
}

/** Read one channel of a recording window into normalized floats. */
function channelWindow(
  buffer: Buffer,
  wav: WavPcm,
  channel: number,
  start: number,
  frames: number,
): Float64Array {
  const count = Math.max(0, Math.min(frames, wav.frameCount - start));
  const out = new Float64Array(count);
  for (let frame = 0; frame < count; frame += 1) {
    out[frame] =
      buffer.readInt16LE(
        wav.dataOffset + ((start + frame) * wav.channels + channel) * 2,
      ) / 32_768;
  }
  return out;
}

function midiFrequencyHz(midiPitch: number): number {
  return 440 * 2 ** ((midiPitch - 69) / 12);
}

/** Hann-windowed single-bin power: the classic Goertzel recurrence. */
function goertzelPower(
  window: Float64Array,
  start: number,
  length: number,
  frequencyHz: number,
): number {
  const omega = (2 * Math.PI * frequencyHz) / SOURCE_RATE_HZ;
  const coefficient = 2 * Math.cos(omega);
  let previous = 0;
  let beforePrevious = 0;
  for (let index = 0; index < length; index += 1) {
    const taper = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (length - 1));
    const sample = (window[start + index] ?? 0) * taper;
    const current = sample + coefficient * previous - beforePrevious;
    beforePrevious = previous;
    previous = current;
  }
  return (
    previous * previous +
    beforePrevious * beforePrevious -
    coefficient * previous * beforePrevious
  );
}

/**
 * Best harmonic-comb score over a +-80 cent scan around a candidate
 * fundamental: the shared measurement behind tuning, channel choice, and
 * the octave-mislabel likelihood test.
 */
function combScan(
  window: Float64Array,
  length: number,
  fundamentalHz: number,
): { bestCents: number; bestScore: number } {
  let bestCents = 0;
  let bestScore = 0;
  for (
    let cents = -TUNING_SCAN_CENTS;
    cents <= TUNING_SCAN_CENTS;
    cents += TUNING_SCAN_STEP_CENTS
  ) {
    const ratio = 2 ** (cents / 1_200);
    let score = 0;
    for (const partial of TUNING_PARTIALS) {
      const frequency = fundamentalHz * ratio * partial;
      if (frequency > SOURCE_RATE_HZ / 2.5) break;
      score +=
        Math.sqrt(
          goertzelPower(window, TUNING_WINDOW_START_FRAMES, length, frequency),
        ) / partial;
    }
    if (score > bestScore) {
      bestScore = score;
      bestCents = cents;
    }
  }
  return { bestCents, bestScore };
}

type PitchVerification = Readonly<{
  tuningCents: number;
  fundamentalAmplitude: number;
  strongestPartialAmplitude: number;
  subharmonicAmplitude: number;
}>;

/**
 * Verify the recording sounds at the expected pitch and measure its
 * deviation from 12-TET. Refuses (throws) on: no resolvable maximum inside
 * the scan, a missing fundamental (octave-up mislabel), or subharmonic
 * energy rivaling the fundamental (octave-down mislabel).
 */
function verifyPitch(
  window: Float64Array,
  midiPitch: number,
  label: string,
): PitchVerification {
  const nominal = midiFrequencyHz(midiPitch);
  const length = Math.min(
    TUNING_WINDOW_FRAMES,
    window.length - TUNING_WINDOW_START_FRAMES,
  );
  if (length < TUNING_MINIMUM_WINDOW_FRAMES) {
    throw new Error(
      `INSTRUMENT_SAMPLES_TUNING_WINDOW: ${label} has ${String(length)} frames`,
    );
  }
  const { bestCents, bestScore } = combScan(window, length, nominal);
  if (bestScore <= 0) {
    throw new Error(`INSTRUMENT_SAMPLES_TUNING_SILENT: ${label}`);
  }
  if (Math.abs(bestCents) >= TUNING_SCAN_CENTS) {
    throw new Error(
      `INSTRUMENT_SAMPLES_TUNING_UNRESOLVED: ${label} pegged at ${String(bestCents)} cents`,
    );
  }
  const tuned = nominal * 2 ** (bestCents / 1_200);
  const amplitudeAt = (frequencyHz: number): number =>
    Math.sqrt(
      goertzelPower(window, TUNING_WINDOW_START_FRAMES, length, frequencyHz),
    );
  const fundamental = amplitudeAt(tuned);
  let strongest = 0;
  for (const partial of TUNING_PARTIALS) {
    const frequency = tuned * partial;
    if (frequency > SOURCE_RATE_HZ / 2.5) break;
    const amplitude = amplitudeAt(frequency);
    if (amplitude > strongest) strongest = amplitude;
  }
  if (fundamental < FUNDAMENTAL_MIN_RATIO * strongest) {
    throw new Error(
      `INSTRUMENT_SAMPLES_PITCH_FUNDAMENTAL_MISSING: ${label} fundamental ${fundamental.toExponential(3)} vs strongest partial ${strongest.toExponential(3)}`,
    );
  }
  let octaveRatio = 0;
  if (nominal >= HYPOTHESIS_TEST_MIN_F0_HZ) {
    const down = combScan(window, length, nominal / 2).bestScore;
    const up = combScan(window, length, nominal * 2).bestScore;
    octaveRatio = Math.max(down, up) / bestScore;
    if (down >= OCTAVE_HYPOTHESIS_MAX_RATIO * bestScore) {
      throw new Error(
        `INSTRUMENT_SAMPLES_PITCH_OCTAVE_DOWN: ${label} down-comb ${down.toExponential(3)} vs expected ${bestScore.toExponential(3)}`,
      );
    }
    if (up >= OCTAVE_HYPOTHESIS_MAX_RATIO * bestScore) {
      throw new Error(
        `INSTRUMENT_SAMPLES_PITCH_OCTAVE_UP: ${label} up-comb ${up.toExponential(3)} vs expected ${bestScore.toExponential(3)}`,
      );
    }
  }
  return {
    tuningCents: Math.round(bestCents),
    fundamentalAmplitude: fundamental,
    strongestPartialAmplitude: strongest,
    subharmonicAmplitude: octaveRatio,
  };
}

/**
 * Windowed-sinc resampler: for each output frame, evaluate a Blackman-
 * windowed lowpassed sinc at the exact fractional source position. The
 * cutoff sits at 45 % of the lower of the two rates, the kernel is
 * normalized per output sample so DC gain is exactly one, and the whole
 * computation is pure double-precision arithmetic — bit-identical on every
 * run of every machine, which is what `--check` relies on.
 */
function resample(
  input: Float64Array,
  inRateHz: number,
  outRateHz: number,
  outFrames: number,
): Float64Array {
  const step = inRateHz / outRateHz;
  const cutoff = (0.45 * Math.min(inRateHz, outRateHz)) / inRateHz;
  /* When downsampling the kernel widens by `step` to keep the cutoff. */
  const width = Math.max(1, step);
  const halfTaps = Math.ceil(RESAMPLE_TAPS_PER_SIDE * width);
  const out = new Float64Array(outFrames);
  for (let n = 0; n < outFrames; n += 1) {
    const center = n * step;
    const first = Math.max(0, Math.ceil(center - halfTaps));
    const last = Math.min(input.length - 1, Math.floor(center + halfTaps));
    let sum = 0;
    let weightSum = 0;
    for (let j = first; j <= last; j += 1) {
      const x = (j - center) / width;
      const positionInWindow = x / RESAMPLE_TAPS_PER_SIDE;
      if (positionInWindow <= -1 || positionInWindow >= 1) continue;
      const sincArgument = 2 * cutoff * width * x;
      const sinc =
        sincArgument === 0
          ? 1
          : Math.sin(Math.PI * sincArgument) / (Math.PI * sincArgument);
      const theta = Math.PI * (positionInWindow + 1);
      const blackman =
        0.42 - 0.5 * Math.cos(theta) + 0.08 * Math.cos(2 * theta);
      const weight = sinc * blackman;
      sum += (input[j] ?? 0) * weight;
      weightSum += weight;
    }
    out[n] = weightSum !== 0 ? sum / weightSum : 0;
  }
  return out;
}

type SliceRecord = Readonly<{
  midiPitch: number;
  sourceFile: string;
  sourceChannel: number;
  tuningCents: number;
  onsetFrame: number;
  peakBeforeNormalization: number;
  byteOffset: number;
  frameCount: number;
}>;

async function sliceOne(
  sourceDir: string,
  config: InstrumentConfig,
  source: InstrumentSourceFile,
  byteOffset: number,
): Promise<{ record: SliceRecord; pcm: Int16Array }> {
  const path = resolve(sourceDir, config.subdirectory, source.file);
  const buffer = await readFile(path).catch(() => {
    throw new Error(`INSTRUMENT_SAMPLES_SOURCE_MISSING: ${path}`);
  });
  const wav = parseWav(buffer);

  /* Onset: the earliest arrival on either channel. */
  const searchChannels: Float64Array[] = [];
  for (let channel = 0; channel < wav.channels; channel += 1) {
    searchChannels.push(
      channelWindow(buffer, wav, channel, 0, ONSET_SEARCH_FRAMES),
    );
  }
  const searchFrames = Math.min(
    ...searchChannels.map((channel) => channel.length),
  );
  let searchPeak = 0;
  for (let frame = 0; frame < searchFrames; frame += 1) {
    for (const channel of searchChannels) {
      const magnitude = Math.abs(channel[frame] ?? 0);
      if (magnitude > searchPeak) searchPeak = magnitude;
    }
  }
  const threshold = searchPeak * ONSET_THRESHOLD_RATIO;
  let onset = 0;
  while (onset < searchFrames) {
    let loudest = 0;
    for (const channel of searchChannels) {
      const magnitude = Math.abs(channel[onset] ?? 0);
      if (magnitude > loudest) loudest = magnitude;
    }
    if (loudest >= threshold) break;
    onset += 1;
  }
  if (onset >= searchFrames) {
    throw new Error(`INSTRUMENT_SAMPLES_NO_ONSET: ${source.file}`);
  }
  const start = Math.max(0, onset - ONSET_BACKOFF_FRAMES);

  /*
   * Channel choice: the one whose harmonic comb at the expected pitch is
   * stronger. The obvious alternatives are both wrong here: summing a
   * spaced pair combs the spectrum, and picking by transient energy (the
   * piano generator's law, correct for an attack-only layer) selected a
   * VCSL vibraphone channel whose microphone sat near a node of the bar's
   * fundamental — 140x less fundamental than its partner while carrying
   * more mallet click. These slices are the whole note, so the note's own
   * harmonic series is the thing to maximize.
   */
  const sourceFramesNeeded =
    Math.ceil((config.sliceFrames * SOURCE_RATE_HZ) / config.targetRateHz) +
    RESAMPLE_TAPS_PER_SIDE * 4;
  let sourceChannel = 0;
  let sourceWindow: Float64Array | null = null;
  let bestChannelScore = -1;
  for (let channel = 0; channel < wav.channels; channel += 1) {
    const candidate = channelWindow(
      buffer,
      wav,
      channel,
      start,
      sourceFramesNeeded,
    );
    const scanLength = Math.min(
      TUNING_WINDOW_FRAMES,
      candidate.length - TUNING_WINDOW_START_FRAMES,
    );
    const score = combScan(
      candidate,
      scanLength,
      midiFrequencyHz(source.midiPitch),
    ).bestScore;
    if (score > bestChannelScore) {
      bestChannelScore = score;
      sourceChannel = channel;
      sourceWindow = candidate;
    }
  }
  if (sourceWindow === null) {
    throw new Error(`INSTRUMENT_SAMPLES_NO_CHANNEL: ${source.file}`);
  }

  const verification = verifyPitch(sourceWindow, source.midiPitch, source.file);

  /* Resample; a short recording yields a short slice, never padding. */
  const availableTargetFrames = Math.floor(
    (sourceWindow.length * config.targetRateHz) / SOURCE_RATE_HZ,
  );
  const frameCount = Math.min(config.sliceFrames, availableTargetFrames);
  const slice = resample(
    sourceWindow,
    SOURCE_RATE_HZ,
    config.targetRateHz,
    frameCount,
  );

  let slicePeak = 0;
  for (const value of slice) {
    const magnitude = Math.abs(value);
    if (magnitude > slicePeak) slicePeak = magnitude;
  }
  const normalization = slicePeak > 0 ? PEAK_TARGET / slicePeak : 0;

  const fadeOutFrames = Math.min(config.fadeOutFrames, frameCount);
  const fadeOutStart = frameCount - fadeOutFrames;
  const pcm = new Int16Array(frameCount);
  for (let frame = 0; frame < frameCount; frame += 1) {
    let value = (slice[frame] ?? 0) * normalization;
    if (frame < config.fadeInFrames) {
      value *= 0.5 - 0.5 * Math.cos((Math.PI * frame) / config.fadeInFrames);
    }
    if (frame >= fadeOutStart) {
      const position = frame - fadeOutStart + 1;
      value *= 0.5 + 0.5 * Math.cos((Math.PI * position) / fadeOutFrames);
    }
    const quantized = Math.round(value * 32_767);
    pcm[frame] =
      quantized > 32_767 ? 32_767 : quantized < -32_768 ? -32_768 : quantized;
  }

  process.stdout.write(
    `  ${source.file}: midi=${String(source.midiPitch)} channel=${String(sourceChannel)} ` +
      `cents=${String(verification.tuningCents)} frames=${String(frameCount)} ` +
      `fundamental=${verification.fundamentalAmplitude.toExponential(2)} ` +
      `sub=${verification.subharmonicAmplitude.toExponential(2)}\n`,
  );

  return {
    record: {
      midiPitch: source.midiPitch,
      sourceFile: source.file,
      sourceChannel,
      tuningCents: verification.tuningCents,
      onsetFrame: onset,
      peakBeforeNormalization: slicePeak,
      byteOffset,
      frameCount,
    },
    pcm,
  };
}

async function buildPayload(
  sourceDir: string,
  config: InstrumentConfig,
): Promise<{ bytes: Uint8Array; records: SliceRecord[] }> {
  const records: SliceRecord[] = [];
  const chunks: Int16Array[] = [];
  let byteOffset = 0;
  for (const source of config.files) {
    const { record, pcm } = await sliceOne(
      sourceDir,
      config,
      source,
      byteOffset,
    );
    records.push(record);
    chunks.push(pcm);
    byteOffset += pcm.length * 2;
  }
  const bytes = new Uint8Array(byteOffset);
  const view = new DataView(bytes.buffer);
  let cursor = 0;
  for (const chunk of chunks) {
    for (const value of chunk) {
      view.setInt16(cursor, value, true);
      cursor += 2;
    }
  }
  return { bytes, records };
}

function renderModule(
  config: InstrumentConfig,
  bytes: Uint8Array,
  records: readonly SliceRecord[],
  sha256: string,
  base64: string,
): string {
  const prefix = config.constantPrefix;
  const indexRows = records
    .map(
      (record) =>
        `  { midiPitch: ${String(record.midiPitch)}, tuningCents: ${String(record.tuningCents)}, ` +
        `byteOffset: ${String(record.byteOffset)}, frameCount: ${String(record.frameCount)} },`,
    )
    .join("\n");
  const sourceFiles = records.map((record) => record.sourceFile).join(", ");

  return `/**
 * @generated by scripts/build-instrument-samples.ts — do not hand-edit.
 *
 * Recorded ${config.key} notes: ${String(records.length)} pitch-verified recordings, one
 * channel each, sinc-resampled to ${String(config.targetRateHz)} Hz mono, onset-trimmed,
 * peak normalized, fade-tailed, and stored as raw little-endian 16-bit PCM.
 * There is no container and no codec: \`${prefix}_SLICE_INDEX\`
 * describes the layout, so the runtime decodes base64 into an Int16Array
 * and needs no browser media API.
 *
 * Source: ${config.attribution}
 * License: ${config.license} <${config.licenseUrl}>
 * Corpus: ${config.sourceUrl}
 * ${config.sourceDescription}.
 * Embedded recordings: ${sourceFiles}
 *
 * Regenerate with \`bun scripts/build-instrument-samples.ts\` (the corpus
 * root comes from INSTRUMENT_SAMPLE_SOURCE_DIR); verify drift with
 * \`--check\`.
 */

export const ${prefix}_ATTRIBUTION =
  "${config.attribution}";

export const ${prefix}_LICENSE = "${config.license}";

export const ${prefix}_SHA256 =
  "${sha256}";

export const ${prefix}_BYTE_LENGTH = ${String(bytes.byteLength)};

export const ${prefix}_RATE_HZ = ${String(config.targetRateHz)};

export type ${config.sliceTypeName} = Readonly<{
  /** Concert MIDI pitch of the recording; the runtime transposes from here. */
  midiPitch: number;
  /**
   * Measured deviation of the recording from 12-TET, in cents. The runtime
   * folds this into its playback ratio so every slice lands exactly on
   * pitch regardless of how the source instrument was tuned that day.
   */
  tuningCents: number;
  /** Byte offset of the slice inside the decoded payload. */
  byteOffset: number;
  frameCount: number;
}>;

export const ${prefix}_SLICE_INDEX: readonly ${config.sliceTypeName}[] =
  Object.freeze([
${indexRows}
  ] as const);

export const ${prefix}_BASE64 =
  "${base64}";
`;
}

async function run(): Promise<void> {
  const checkOnly = process.argv.includes("--check");
  const sourceDir =
    process.env["INSTRUMENT_SAMPLE_SOURCE_DIR"] ?? DEFAULT_SOURCE_DIR;
  for (const config of INSTRUMENTS) {
    process.stdout.write(`${config.key}:\n`);
    const modulePath = resolve(root, config.modulePath);
    const { bytes, records } = await buildPayload(sourceDir, config);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const base64 = Buffer.from(bytes).toString("base64");
    const generated = renderModule(config, bytes, records, sha256, base64);

    if (checkOnly) {
      const existing = await readFile(modulePath, "utf8").catch(() => null);
      if (existing === null) {
        throw new Error(`INSTRUMENT_SAMPLES_MODULE_MISSING: ${modulePath}`);
      }
      if (existing !== generated) {
        const pattern = new RegExp(
          `${config.constantPrefix}_SHA256 =\\n {2}"([0-9a-f]{64})"`,
          "u",
        );
        const existingHash = pattern.exec(existing)?.[1] ?? "<none>";
        throw new Error(
          `INSTRUMENT_SAMPLES_MODULE_DRIFT: ${config.key} checked-in ${existingHash} != rebuilt ${sha256}`,
        );
      }
      process.stdout.write(
        `${config.key}-check ok slices=${String(records.length)} bytes=${String(bytes.byteLength)} sha256=${sha256}\n`,
      );
      continue;
    }

    await writeFile(modulePath, generated);
    process.stdout.write(
      `wrote ${modulePath} (${String(records.length)} slices, ` +
        `${String(bytes.byteLength)} raw bytes, ${String(base64.length)} base64 chars, ` +
        `sha256=${sha256})\n`,
    );
  }
}

if (import.meta.main) {
  await run();
}
