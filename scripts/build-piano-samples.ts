/**
 * Development-time generator for the embedded piano attack-transient payload.
 *
 * `bun run build` never reads a wav file: the sample payload is checked-in
 * source at `src/audio/wasm/piano-attack-samples.ts`, generated here from a
 * local copy of the Salamander Grand Piano V3 corpus. Reproducing the payload
 * requires that corpus, whose location is given by
 * `PIANO_SAMPLE_SOURCE_DIR`; `--check` re-slices it and fails on any drift
 * between the recorded source and the checked-in payload so the two cannot
 * silently diverge.
 *
 * Source corpus: Salamander Grand Piano V3 by Alexander Holm (Yamaha C5,
 * 44.1 kHz 16-bit, 16 velocity layers sampled in minor thirds), licensed
 * CC-BY-3.0 <https://creativecommons.org/licenses/by/3.0/>. Only the first
 * 400 ms of a fixed set of recordings is embedded, one microphone per slice
 * and peak normalized; the payload is raw little-endian 16-bit PCM with no
 * container, so the runtime needs no decoder and no browser media API.
 *
 * One microphone, not a mono sum: the corpus was recorded with an AB pair
 * ~12 cm apart, so summing the two channels combs the attack. Measured on
 * C7v14 the sum keeps 52 % of one microphone's energy and 15 % of its energy
 * above 4 kHz — precisely the transient this layer exists to supply. Each
 * slice therefore carries whichever single channel holds more high-frequency
 * energy in its first 60 ms, and the runtime re-pans it to the synth layer's
 * own stereo balance.
 *
 * Usage:
 *   bun scripts/build-piano-samples.ts            # regenerate the module
 *   bun scripts/build-piano-samples.ts --check    # re-slice and verify drift
 */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { CONCERT_GRAND_WASM_BASE64 } from "../src/audio/wasm/concert-grand-wasm";

const root = resolve(import.meta.dirname, "..");
const modulePath = resolve(root, "src/audio/wasm/piano-attack-samples.ts");

const DEFAULT_SOURCE_DIR =
  "/data/tmp/claude-1000/-data-projects-jazz-chord-progression-editor-html" +
  "/6e9b33ab-2d5d-4a10-8860-1fce81e3bdee/scratchpad" +
  "/SalamanderGrandPianoV3_44.1khz16bit/44.1khz16bit";

const ATTRIBUTION =
  "Salamander Grand Piano V3 by Alexander Holm, CC-BY-3.0";
const LICENSE = "CC-BY-3.0";
const SOURCE_URL = "https://creativecommons.org/licenses/by/3.0/";

/** The corpus is 44.1 kHz; nothing is resampled at build time. */
const SAMPLE_RATE_HZ = 44_100;
/**
 * 400 ms per slice. The runtime crossfade retires the sampled layer at
 * 320 ms of output; the worst-case upward transposition across this pitch
 * set is 2.22 semitones once the stretch correction is folded in (ratio
 * 1.137), which consumes 364 ms of source, so the stored fade-out is never
 * read at an audible gain.
 */
const SLICE_FRAMES = 17_640;
/** ~5 ms raised-cosine fade-in, ~40 ms raised-cosine fade-out. */
const FADE_IN_FRAMES = 221;
const FADE_OUT_FRAMES = 1_764;
/** Peak-normalize each slice: the runtime matches level to the synth layer. */
const PEAK_TARGET = 0.985;
/** Onset search: first sample at 0.5 % of the slice-window peak, minus 1 ms. */
const ONSET_THRESHOLD_RATIO = 0.005;
const ONSET_BACKOFF_FRAMES = 44;
const ONSET_SEARCH_FRAMES = 88_200;
/** Microphone choice is scored over the first 60 ms after the onset. */
const CHANNEL_SCORE_FRAMES = 2_646;


/**
 * Velocity buckets. Each bucket names one recorded Salamander layer whose own
 * velocity window (from the corpus .sfz) sits at the centre of the bucket, so
 * the worst-case velocity error is under 20 units.
 */
const VELOCITY_BUCKETS = [
  { bucket: 0, layer: 4, lowVelocity: 1, highVelocity: 53, referenceVelocity: 40 },
  { bucket: 1, layer: 9, lowVelocity: 54, highVelocity: 88, referenceVelocity: 68 },
  { bucket: 2, layer: 14, lowVelocity: 89, highVelocity: 127, referenceVelocity: 108 },
] as const;

/**
 * Sampled pitches, all of which exist as recordings (the corpus is sampled in
 * minor thirds from A0). Minor-third spacing across the register jazz
 * voicings actually occupy (A2..C6) holds the worst-case transposition there
 * to a semitone; the outer register falls back to tritone spacing, where a
 * two-semitone shift over the first third of a second is inaudible against
 * the synthesized sustain that follows it. The set covers all 88 keys: no
 * in-contract note falls back to pure synthesis.
 */
const SAMPLED_PITCHES = [
  24, 30, 36, 42, 45, 48, 51, 54, 57, 60, 63, 66, 69, 72, 75, 78, 81, 84, 90,
  96, 102, 108,
] as const;

const PITCH_CLASS_NAMES = new Map<number, string>([
  [0, "C"],
  [3, "D#"],
  [6, "F#"],
  [9, "A"],
]);

function sampleFileStem(midiPitch: number, layer: number): string {
  const pitchClass = ((midiPitch % 12) + 12) % 12;
  const name = PITCH_CLASS_NAMES.get(pitchClass);
  if (name === undefined) {
    throw new Error(`PIANO_SAMPLES_UNSAMPLED_PITCH: midi ${String(midiPitch)}`);
  }
  const octave = Math.floor(midiPitch / 12) - 1;
  return `${name}${String(octave)}v${String(layer)}`;
}

type WavPcm = Readonly<{
  channels: number;
  sampleRateHz: number;
  bitsPerSample: number;
  frameCount: number;
  dataOffset: number;
}>;

/** Minimal RIFF/WAVE chunk walk: the corpus is uncompressed 16-bit PCM. */
function parseWav(buffer: Buffer): WavPcm {
  if (
    buffer.length < 12 ||
    buffer.toString("latin1", 0, 4) !== "RIFF" ||
    buffer.toString("latin1", 8, 12) !== "WAVE"
  ) {
    throw new Error("PIANO_SAMPLES_WAV_HEADER");
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
        throw new Error("PIANO_SAMPLES_WAV_NOT_PCM");
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
    throw new Error("PIANO_SAMPLES_WAV_SHAPE");
  }
  if (sampleRateHz !== SAMPLE_RATE_HZ) {
    throw new Error(
      `PIANO_SAMPLES_WAV_RATE: ${String(sampleRateHz)} != ${String(SAMPLE_RATE_HZ)}`,
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

/**
 * High-frequency energy proxy: the energy of the first difference, which is
 * a +6 dB/octave tilt of the signal. Comparing it across the two microphones
 * ranks them by how much transient content each one holds.
 */
function firstDifferenceEnergy(window: Float64Array): number {
  let total = 0;
  for (let index = 1; index < window.length; index += 1) {
    const delta = (window[index] ?? 0) - (window[index - 1] ?? 0);
    total += delta * delta;
  }
  return total;
}

/**
 * A concert grand is not tuned to 12-TET. The Railsback stretch leaves this
 * instrument's top octave tens of cents sharp and its bottom octave flat,
 * which is unremarkable on its own and audible against a synthesized sustain
 * tuned exactly: the note would glide as the crossfade hands over.
 *
 * The correction is measured, not assumed. Each recording and the wasm note
 * it will be crossfaded into are pitched by the same harmonic-comb estimator
 * over the same window, and the slice records their difference; whatever
 * bias the estimator carries from string inharmonicity is common to both and
 * cancels. The corpus does ship a retuning table
 * (`SalamanderGrandPianoV3Retuned.sfz`), but measured against this synth it
 * doubles the bass error instead of removing it — 8.2 cents of mean layer
 * disagreement against 5.6 cents for no correction at all — so it is not
 * used.
 */
const TUNING_SCAN_CENTS = 80;
const TUNING_SCAN_STEP_CENTS = 0.5;
const TUNING_PARTIALS = [1, 2, 3, 4] as const;
const TUNING_WINDOW_START_FRAMES = 882;
const TUNING_WINDOW_FRAMES = 13_230;
/** Below this the scan resolution is finer than the window can support. */
const TUNING_MINIMUM_WINDOW_FRAMES = 4_410;

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
  const omega = (2 * Math.PI * frequencyHz) / SAMPLE_RATE_HZ;
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
 * The scan must resolve a maximum strictly inside its own range. A window
 * with no measurable energy scores zero at every candidate and a window
 * whose true deviation sits outside the scan pegs at an endpoint; in both
 * cases the "estimate" is an artifact of the loop, and writing it would put
 * a fabricated cents correction into the payload that `--check` would then
 * reproduce and bless. Refusing keeps a bad measurement a build failure.
 */
export function estimateCents(window: Float64Array, midiPitch: number): number {
  const nominal = midiFrequencyHz(midiPitch);
  const length = Math.min(
    TUNING_WINDOW_FRAMES,
    window.length - TUNING_WINDOW_START_FRAMES,
  );
  if (length < TUNING_MINIMUM_WINDOW_FRAMES) {
    throw new Error(
      `PIANO_SAMPLES_TUNING_WINDOW: ${String(length)} frames is too short to pitch midi ${String(midiPitch)}`,
    );
  }
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
      const frequency = nominal * ratio * partial;
      if (frequency > SAMPLE_RATE_HZ / 2.5) break;
      score +=
        Math.sqrt(
          goertzelPower(
            window,
            TUNING_WINDOW_START_FRAMES,
            length,
            frequency,
          ),
        ) / partial;
    }
    if (score > bestScore) {
      bestScore = score;
      bestCents = cents;
    }
  }
  if (bestScore <= 0) {
    throw new Error(
      `PIANO_SAMPLES_TUNING_SILENT: no measurable energy at midi ${String(midiPitch)}`,
    );
  }
  if (Math.abs(bestCents) >= TUNING_SCAN_CENTS) {
    throw new Error(
      `PIANO_SAMPLES_TUNING_UNRESOLVED: midi ${String(midiPitch)} pegged the scan at ${String(bestCents)} cents`,
    );
  }
  return bestCents;
}

type ConcertGrandReference = (
  midiPitch: number,
  velocity: number,
) => Float64Array;

/**
 * Instantiate the checked-in wasm payload just far enough to render the
 * reference note the tuning measurement compares against. The generator owns
 * this host rather than importing the audio runtime, so the two generated
 * modules never import each other.
 */
async function loadConcertGrandReference(): Promise<ConcertGrandReference> {
  const bytes = Uint8Array.from(
    Buffer.from(CONCERT_GRAND_WASM_BASE64, "base64"),
  );
  const { instance } = await WebAssembly.instantiate(bytes, {});
  const exported: Readonly<Record<string, unknown>> = instance.exports;
  const memory = exported["memory"];
  const noteFrames = exported["cg_note_frames"];
  const render = exported["cg_render"];
  const heapBase = exported["__heap_base"];
  if (
    !(memory instanceof WebAssembly.Memory) ||
    typeof noteFrames !== "function" ||
    typeof render !== "function"
  ) {
    throw new Error("PIANO_SAMPLES_WASM_EXPORTS");
  }
  /* Scratch must start past the module's own data and shadow stack, or the
   * first render overwrites the constants the next one reads. */
  const scratchBase =
    Math.ceil(
      ((heapBase instanceof WebAssembly.Global &&
      typeof heapBase.value === "number"
        ? heapBase.value
        : memory.buffer.byteLength) +
        1_024) /
        16,
    ) * 16;
  const frameCountOf = noteFrames as (midi: number, rate: number) => number;
  const renderInto = render as (
    midi: number,
    velocity: number,
    rate: number,
    left: number,
    right: number,
    maxFrames: number,
  ) => number;
  return (midiPitch: number, velocity: number): Float64Array => {
    const capacity = frameCountOf(midiPitch, SAMPLE_RATE_HZ);
    if (capacity <= 0) {
      throw new Error(`PIANO_SAMPLES_REFERENCE_REFUSED: ${String(midiPitch)}`);
    }
    const base = scratchBase;
    const needed = base + capacity * 8 - memory.buffer.byteLength;
    if (needed > 0) memory.grow(Math.ceil(needed / 65_536));
    const written = renderInto(
      midiPitch,
      velocity,
      SAMPLE_RATE_HZ,
      base,
      base + capacity * 4,
      capacity,
    );
    if (written <= 0) {
      throw new Error(`PIANO_SAMPLES_REFERENCE_EMPTY: ${String(midiPitch)}`);
    }
    const view = new Float32Array(memory.buffer, base, written);
    const out = new Float64Array(written);
    for (let index = 0; index < written; index += 1) {
      out[index] = view[index] ?? 0;
    }
    return out;
  };
}

type SliceRecord = Readonly<{
  midiPitch: number;
  velocityBucket: number;
  sourceLayer: number;
  lowVelocity: number;
  highVelocity: number;
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
  reference: ConcertGrandReference,
  midiPitch: number,
  bucket: (typeof VELOCITY_BUCKETS)[number],
  byteOffset: number,
): Promise<{ record: SliceRecord; pcm: Int16Array }> {
  const stem = sampleFileStem(midiPitch, bucket.layer);
  const sourceFile = `${stem}.wav`;
  const path = resolve(sourceDir, sourceFile);
  const buffer = await readFile(path).catch(() => {
    throw new Error(`PIANO_SAMPLES_SOURCE_MISSING: ${path}`);
  });
  const wav = parseWav(buffer);

  /* Onset: the earliest arrival on either microphone. */
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
    throw new Error(`PIANO_SAMPLES_NO_ONSET: ${stem}`);
  }
  const start = Math.max(0, onset - ONSET_BACKOFF_FRAMES);
  if (start + SLICE_FRAMES > wav.frameCount) {
    throw new Error(`PIANO_SAMPLES_SOURCE_TOO_SHORT: ${stem}`);
  }

  /* Microphone choice: the channel holding more transient energy. */
  let sourceChannel = 0;
  let bestScore = -1;
  for (let channel = 0; channel < wav.channels; channel += 1) {
    const score = firstDifferenceEnergy(
      channelWindow(buffer, wav, channel, onset, CHANNEL_SCORE_FRAMES),
    );
    if (score > bestScore) {
      bestScore = score;
      sourceChannel = channel;
    }
  }

  const slice = channelWindow(buffer, wav, sourceChannel, start, SLICE_FRAMES);

  const tuningCents = Math.round(
    estimateCents(slice, midiPitch) -
      estimateCents(reference(midiPitch, bucket.referenceVelocity), midiPitch),
  );

  let slicePeak = 0;
  for (const value of slice) {
    const magnitude = Math.abs(value);
    if (magnitude > slicePeak) slicePeak = magnitude;
  }
  const normalization = slicePeak > 0 ? PEAK_TARGET / slicePeak : 0;

  const fadeOutStart = SLICE_FRAMES - FADE_OUT_FRAMES;
  const pcm = new Int16Array(SLICE_FRAMES);
  for (let frame = 0; frame < SLICE_FRAMES; frame += 1) {
    let value = (slice[frame] ?? 0) * normalization;
    if (frame < FADE_IN_FRAMES) {
      value *= 0.5 - 0.5 * Math.cos((Math.PI * frame) / FADE_IN_FRAMES);
    }
    if (frame >= fadeOutStart) {
      const position = frame - fadeOutStart + 1;
      value *= 0.5 + 0.5 * Math.cos((Math.PI * position) / FADE_OUT_FRAMES);
    }
    const quantized = Math.round(value * 32_767);
    pcm[frame] = quantized > 32_767 ? 32_767 : quantized < -32_768 ? -32_768 : quantized;
  }

  return {
    record: {
      midiPitch,
      velocityBucket: bucket.bucket,
      sourceLayer: bucket.layer,
      lowVelocity: bucket.lowVelocity,
      highVelocity: bucket.highVelocity,
      sourceFile,
      sourceChannel,
      tuningCents,
      onsetFrame: onset,
      peakBeforeNormalization: slicePeak,
      byteOffset,
      frameCount: SLICE_FRAMES,
    },
    pcm,
  };
}

async function buildPayload(
  sourceDir: string,
  reference: ConcertGrandReference,
): Promise<{
  bytes: Uint8Array;
  records: SliceRecord[];
}> {
  const records: SliceRecord[] = [];
  const chunks: Int16Array[] = [];
  let byteOffset = 0;
  for (const midiPitch of SAMPLED_PITCHES) {
    for (const bucket of VELOCITY_BUCKETS) {
      const { record, pcm } = await sliceOne(
        sourceDir,
        reference,
        midiPitch,
        bucket,
        byteOffset,
      );
      records.push(record);
      chunks.push(pcm);
      byteOffset += pcm.length * 2;
    }
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
  bytes: Uint8Array,
  records: readonly SliceRecord[],
  sha256: string,
  base64: string,
): string {
  const indexRows = records
    .map(
      (record) =>
        `  { midiPitch: ${String(record.midiPitch)}, velocityBucket: ${String(record.velocityBucket)}, ` +
        `lowVelocity: ${String(record.lowVelocity)}, highVelocity: ${String(record.highVelocity)}, ` +
        `sourceLayer: ${String(record.sourceLayer)}, sourceChannel: ${String(record.sourceChannel)}, ` +
        `tuningCents: ${String(record.tuningCents)}, byteOffset: ${String(record.byteOffset)}, ` +
        `frameCount: ${String(record.frameCount)} },`,
    )
    .join("\n");

  const sourceFiles = records.map((record) => record.sourceFile).join(", ");

  return `/**
 * @generated by scripts/build-piano-samples.ts — do not hand-edit.
 *
 * Recorded piano attack transients: the first ${String(
    Math.round((SLICE_FRAMES / SAMPLE_RATE_HZ) * 1_000),
  )} ms of ${String(records.length)} recordings,
 * one microphone each (summing the AB pair combs the attack), peak
 * normalized, ${String(
   Math.round((FADE_IN_FRAMES / SAMPLE_RATE_HZ) * 1_000),
 )} ms fade-in / ${String(
   Math.round((FADE_OUT_FRAMES / SAMPLE_RATE_HZ) * 1_000),
 )} ms fade-out, and stored as raw
 * little-endian 16-bit PCM at ${String(SAMPLE_RATE_HZ)} Hz. There is no container and no
 * codec: \`PIANO_ATTACK_SLICE_INDEX\` describes the layout, so the runtime
 * decodes base64 into an Int16Array and needs no browser media API.
 *
 * Source: ${ATTRIBUTION}
 * License: ${LICENSE} <${SOURCE_URL}>
 * Recorded on a Yamaha C5 at 44.1 kHz 16-bit, 16 velocity layers sampled in
 * minor thirds; two AKG C414 microphones in AB position above the strings.
 * Embedded recordings: ${sourceFiles}
 *
 * Regenerate with \`bun scripts/build-piano-samples.ts\` (the corpus location
 * comes from PIANO_SAMPLE_SOURCE_DIR); verify drift with \`--check\`.
 */

export const PIANO_ATTACK_SAMPLES_ATTRIBUTION =
  "${ATTRIBUTION}";

export const PIANO_ATTACK_SAMPLES_LICENSE = "${LICENSE}";

export const PIANO_ATTACK_SAMPLES_SHA256 =
  "${sha256}";

export const PIANO_ATTACK_SAMPLES_BYTE_LENGTH = ${String(bytes.byteLength)};

export const PIANO_ATTACK_SAMPLE_RATE_HZ = ${String(SAMPLE_RATE_HZ)};

export const PIANO_ATTACK_SLICE_FRAMES = ${String(SLICE_FRAMES)};

export type PianoAttackSlice = Readonly<{
  /** MIDI pitch of the recorded key; the runtime transposes from here. */
  midiPitch: number;
  /** 0 soft, 1 medium, 2 hard. */
  velocityBucket: number;
  /** Inclusive MIDI velocity window this slice serves. */
  lowVelocity: number;
  highVelocity: number;
  /** Salamander velocity layer index (1..16) the slice was cut from. */
  sourceLayer: number;
  /** Which microphone of the AB pair the slice carries: 0 left, 1 right. */
  sourceChannel: number;
  /**
   * Measured deviation of the recording from 12-TET, in cents. A concert
   * grand is stretch-tuned; the runtime subtracts this so the sampled layer
   * and the synthesized sustain agree on the pitch.
   */
  tuningCents: number;
  /** Byte offset of the slice inside the decoded payload. */
  byteOffset: number;
  frameCount: number;
}>;

export const PIANO_ATTACK_SLICE_INDEX: readonly PianoAttackSlice[] =
  Object.freeze([
${indexRows}
  ] as const);

export const PIANO_ATTACK_SAMPLES_BASE64 =
  "${base64}";
`;
}

async function run(): Promise<void> {
  const checkOnly = process.argv.includes("--check");
  const sourceDir = process.env["PIANO_SAMPLE_SOURCE_DIR"] ?? DEFAULT_SOURCE_DIR;
  const reference = await loadConcertGrandReference();
  const { bytes, records } = await buildPayload(sourceDir, reference);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const base64 = Buffer.from(bytes).toString("base64");
  const generated = renderModule(bytes, records, sha256, base64);

  if (checkOnly) {
    const existing = await readFile(modulePath, "utf8").catch(() => null);
    if (existing === null) {
      throw new Error(`PIANO_SAMPLES_MODULE_MISSING: ${modulePath}`);
    }
    const existingHash = /PIANO_ATTACK_SAMPLES_SHA256 =\n {2}"([0-9a-f]{64})"/u.exec(
      existing,
    )?.[1];
    if (existingHash !== sha256) {
      throw new Error(
        `PIANO_SAMPLES_MODULE_DRIFT: checked-in ${existingHash ?? "<none>"} != rebuilt ${sha256}`,
      );
    }
    if (existing !== generated) {
      throw new Error(
        "PIANO_SAMPLES_MODULE_DRIFT: payload hash matches but the module text differs.",
      );
    }
    process.stdout.write(
      `piano-samples-check ok slices=${String(records.length)} bytes=${String(bytes.byteLength)} sha256=${sha256}\n`,
    );
    return;
  }

  await writeFile(modulePath, generated);
  process.stdout.write(
    `wrote ${modulePath} (${String(records.length)} slices, ` +
      `${String(bytes.byteLength)} raw bytes, ${String(base64.length)} base64 chars, ` +
      `sha256=${sha256})\n`,
  );
}

if (import.meta.main) {
  await run();
}
