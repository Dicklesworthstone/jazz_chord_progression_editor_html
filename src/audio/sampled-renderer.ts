/**
 * Deterministic sampled-instrument renderer.
 *
 * The upright bass and the vibraphone are recorded instruments: their
 * payloads are checked-in, pitch-verified mono PCM slices (see
 * `scripts/build-instrument-samples.ts`), and rendering a note is nothing
 * but reading the nearest recorded key through a Catmull-Rom interpolator
 * at the ratio that lands it exactly on the requested 12-TET pitch. The
 * whole path is synchronous, pure, and byte-deterministic: no wasm, no
 * browser media API, no state beyond a lazily decoded payload.
 *
 * Never-fail law: any in-contract request (pitch 21..108, velocity 1..127,
 * supported rate) renders. A pitch outside the recorded span transposes
 * from the nearest edge key — a stretched extreme sounds duller or tighter
 * than a recorded one, but it sounds, and the degradation is monotonic in
 * distance from the recorded span.
 *
 * Velocity shapes level only, and not here: the engine's normalization
 * policy applies its velocity curve at the voice gain, exactly as it does
 * for every oscillator recipe. Rendering identical PCM for every velocity
 * in a band is what lets the engine's render cache share buffers across
 * velocities.
 */
import type { RenderedNotePcm } from "./dsp-renderer";
import {
  VIBRAPHONE_SAMPLES_ATTRIBUTION,
  VIBRAPHONE_SAMPLES_BASE64,
  VIBRAPHONE_SAMPLES_BYTE_LENGTH,
  VIBRAPHONE_SAMPLES_LICENSE,
  VIBRAPHONE_SAMPLES_RATE_HZ,
  VIBRAPHONE_SAMPLES_SHA256,
  VIBRAPHONE_SAMPLES_SLICE_INDEX,
} from "./wasm/vibraphone-samples";

/*
 * The sampled upright bass was replaced by the physical
 * changes.dsp.plucked-upright-bass@1 model (bead
 * jcpe-sample-elimination-physical-qzgo); its 1.0 MB CC0 payload left the
 * shipping module graph with it. The recordings remain in the repository as
 * the replacement gate's reference corpus
 * (src/audio/wasm/upright-bass-samples.ts, imported by the gate only).
 */
export const VIBRAPHONE_RENDERER_ALGORITHM_ID =
  "changes.dsp.sampled-vibraphone@1";

export type SampledRendererAlgorithmId =
  typeof VIBRAPHONE_RENDERER_ALGORITHM_ID;

export const SAMPLED_RENDERER_POLICY = Object.freeze({
  id: "changes.dsp.sampled-instrument.v1",
  minimumMidiPitch: 21,
  maximumMidiPitch: 108,
  minimumVelocity: 1,
  maximumVelocity: 127,
  minimumSampleRateHz: 8_000,
  maximumSampleRateHz: 192_000,
  interpolation: "catmull-rom",
  /** Truncated renders end in a raised-cosine guard this many frames long. */
  truncationGuardFrames: 64,
} as const);

type SampledSlice = Readonly<{
  midiPitch: number;
  tuningCents: number;
  byteOffset: number;
  frameCount: number;
}>;

type SampledPayloadSource = Readonly<{
  algorithmId: SampledRendererAlgorithmId;
  attribution: string;
  license: string;
  payloadSha256: string;
  payloadByteLength: number;
  payloadBase64: string;
  payloadRateHz: number;
  slices: readonly SampledSlice[];
}>;

const PAYLOAD_SOURCES: readonly SampledPayloadSource[] = Object.freeze([
  Object.freeze({
    algorithmId: VIBRAPHONE_RENDERER_ALGORITHM_ID,
    attribution: VIBRAPHONE_SAMPLES_ATTRIBUTION,
    license: VIBRAPHONE_SAMPLES_LICENSE,
    payloadSha256: VIBRAPHONE_SAMPLES_SHA256,
    payloadByteLength: VIBRAPHONE_SAMPLES_BYTE_LENGTH,
    payloadBase64: VIBRAPHONE_SAMPLES_BASE64,
    payloadRateHz: VIBRAPHONE_SAMPLES_RATE_HZ,
    slices: VIBRAPHONE_SAMPLES_SLICE_INDEX,
  }),
]);

export type SampledInstrumentRenderer = Readonly<{
  algorithmId: SampledRendererAlgorithmId;
  attribution: string;
  license: string;
  payloadSha256: string;
  /**
   * Render one note. Synchronous and pure; returns null only for an
   * out-of-contract request (pitch, velocity, or sample rate outside
   * `SAMPLED_RENDERER_POLICY`). Every in-contract pitch renders.
   */
  renderNote: (
    midiPitch: number,
    velocity: number,
    sampleRateHz: number,
    /** Optional ceiling on the rendered length, seconds. */
    maxSeconds?: number,
  ) => RenderedNotePcm | null;
  /**
   * The recorded slice `renderNote` transposes for a pitch. Evidence
   * surface only: tests prove nearest-key selection and edge-stretch with
   * it; the engine never calls it.
   */
  sliceFor: (midiPitch: number) => SampledSlice;
}>;

/** Decode base64 without relying on Node Buffer or browser fetch. */
function decodeBase64(base64: string, expectedBytes: number): Int16Array {
  const table = new Int16Array(128).fill(-1);
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  for (let index = 0; index < alphabet.length; index += 1) {
    table[alphabet.charCodeAt(index)] = index;
  }
  const bytes = new Uint8Array(expectedBytes);
  let cursor = 0;
  let accumulator = 0;
  let bits = 0;
  for (let index = 0; index < base64.length; index += 1) {
    const code = base64.charCodeAt(index);
    if (code === 61) break; /* '=' padding */
    const value = code < 128 ? (table[code] ?? -1) : -1;
    if (value < 0) {
      throw new Error("SAMPLED_RENDERER_BASE64_INVALID");
    }
    accumulator = (accumulator << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      if (cursor >= expectedBytes) {
        throw new Error("SAMPLED_RENDERER_PAYLOAD_OVERFLOW");
      }
      bytes[cursor] = (accumulator >> bits) & 0xff;
      cursor += 1;
    }
  }
  if (cursor !== expectedBytes) {
    throw new Error(
      `SAMPLED_RENDERER_PAYLOAD_LENGTH: ${String(cursor)} != ${String(expectedBytes)}`,
    );
  }
  /* Little-endian 16-bit PCM; payload length is even by construction. */
  const samples = new Int16Array(expectedBytes / 2);
  for (let index = 0; index < samples.length; index += 1) {
    const low = bytes[index * 2] ?? 0;
    const high = bytes[index * 2 + 1] ?? 0;
    samples[index] = (high << 8) | low | (high & 0x80 ? -0x1_00_00 : 0);
  }
  return samples;
}

function isValidRequest(
  midiPitch: number,
  velocity: number,
  sampleRateHz: number,
): boolean {
  return (
    Number.isInteger(midiPitch) &&
    midiPitch >= SAMPLED_RENDERER_POLICY.minimumMidiPitch &&
    midiPitch <= SAMPLED_RENDERER_POLICY.maximumMidiPitch &&
    Number.isInteger(velocity) &&
    velocity >= SAMPLED_RENDERER_POLICY.minimumVelocity &&
    velocity <= SAMPLED_RENDERER_POLICY.maximumVelocity &&
    Number.isFinite(sampleRateHz) &&
    sampleRateHz >= SAMPLED_RENDERER_POLICY.minimumSampleRateHz &&
    sampleRateHz <= SAMPLED_RENDERER_POLICY.maximumSampleRateHz
  );
}

const rendererCache = new Map<
  SampledRendererAlgorithmId,
  SampledInstrumentRenderer
>();

/**
 * Load the renderer for one sampled algorithm id. Synchronous: the payload
 * decodes on first use and the instance is cached for the module lifetime.
 * Throws on an unknown algorithm id or a corrupt payload.
 */
export function loadSampledInstrumentRenderer(
  algorithmId: string,
): SampledInstrumentRenderer {
  const cached = rendererCache.get(algorithmId as SampledRendererAlgorithmId);
  if (cached !== undefined) return cached;
  const source = PAYLOAD_SOURCES.find(
    (candidate) => candidate.algorithmId === algorithmId,
  );
  if (source === undefined) {
    throw new Error(`SAMPLED_RENDERER_UNKNOWN_ALGORITHM: ${algorithmId}`);
  }
  const samples = decodeBase64(source.payloadBase64, source.payloadByteLength);

  /* Slices sorted by pitch; the index is generated sorted, but the law
   * here must not depend on generator ordering. */
  const slices = [...source.slices].sort((a, b) => a.midiPitch - b.midiPitch);
  if (slices.length === 0) {
    throw new Error(`SAMPLED_RENDERER_EMPTY_INDEX: ${algorithmId}`);
  }

  const sliceFor = (midiPitch: number): SampledSlice => {
    let best = slices[0] as SampledSlice;
    let bestDistance = Infinity;
    for (const slice of slices) {
      const distance = Math.abs(slice.midiPitch - midiPitch);
      /* Tie goes to the higher key: transposing down keeps more of the
       * recording inside the output and darkens rather than chipmunks. */
      if (
        distance < bestDistance ||
        (distance === bestDistance && slice.midiPitch > best.midiPitch)
      ) {
        bestDistance = distance;
        best = slice;
      }
    }
    return best;
  };

  const renderNote = (
    midiPitch: number,
    velocity: number,
    sampleRateHz: number,
    maxSeconds?: number,
  ): RenderedNotePcm | null => {
    if (!isValidRequest(midiPitch, velocity, sampleRateHz)) return null;
    if (
      maxSeconds !== undefined &&
      (!Number.isFinite(maxSeconds) || maxSeconds <= 0)
    ) {
      return null;
    }
    const slice = sliceFor(midiPitch);
    /* Semitone shift includes the recording's measured tuning error, so
     * the output lands exactly on 12-TET regardless of source tuning. */
    const semitoneShift =
      midiPitch - slice.midiPitch - slice.tuningCents / 100;
    const step =
      (2 ** (semitoneShift / 12) * source.payloadRateHz) / sampleRateHz;
    /* The interpolator reads p(i-1)..p(i+2); stay one frame inside. */
    const readableFrames = slice.frameCount - 2;
    if (readableFrames < 2) return null;
    const naturalFrames = Math.floor(readableFrames / step);
    const ceilingFrames =
      maxSeconds === undefined
        ? naturalFrames
        : Math.min(naturalFrames, Math.floor(maxSeconds * sampleRateHz));
    const frameCount = Math.max(1, ceilingFrames);
    const base = slice.byteOffset / 2;
    const mono = new Float32Array(frameCount);
    for (let frame = 0; frame < frameCount; frame += 1) {
      const position = frame * step;
      const index = Math.floor(position);
      const fraction = position - index;
      const p0 = (samples[base + Math.max(0, index - 1)] ?? 0) / 32_768;
      const p1 = (samples[base + index] ?? 0) / 32_768;
      const p2 = (samples[base + Math.min(readableFrames + 1, index + 1)] ?? 0) / 32_768;
      const p3 = (samples[base + Math.min(readableFrames + 1, index + 2)] ?? 0) / 32_768;
      /* Catmull-Rom: smooth C1 interpolation through the four neighbors. */
      const a = -0.5 * p0 + 1.5 * p1 - 1.5 * p2 + 0.5 * p3;
      const b = p0 - 2.5 * p1 + 2 * p2 - 0.5 * p3;
      const c = -0.5 * p0 + 0.5 * p2;
      mono[frame] = ((a * fraction + b) * fraction + c) * fraction + p1;
    }
    /* A truncated render must not click: guard the final frames. */
    if (frameCount < naturalFrames) {
      const guard = Math.min(
        SAMPLED_RENDERER_POLICY.truncationGuardFrames,
        frameCount,
      );
      for (let index = 0; index < guard; index += 1) {
        const frame = frameCount - guard + index;
        const weight =
          0.5 + 0.5 * Math.cos((Math.PI * (index + 1)) / guard);
        mono[frame] = (mono[frame] ?? 0) * weight;
      }
    }
    return Object.freeze({
      sampleRateHz,
      frameCount,
      left: mono,
      right: mono,
    });
  };

  const renderer: SampledInstrumentRenderer = Object.freeze({
    algorithmId: source.algorithmId,
    attribution: source.attribution,
    license: source.license,
    payloadSha256: source.payloadSha256,
    renderNote,
    sliceFor,
  });
  rendererCache.set(source.algorithmId, renderer);
  return renderer;
}
