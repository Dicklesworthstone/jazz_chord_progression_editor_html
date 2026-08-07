import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { beforeAll, describe, expect, test } from "bun:test";

import {
  CONCERT_GRAND_WASM_BASE64,
  CONCERT_GRAND_WASM_SHA256,
} from "../../src/audio/wasm/concert-grand-wasm";

type ClarinetExports = Readonly<{
  memory: WebAssembly.Memory;
  __heap_base: WebAssembly.Global;
  clr_state_max_bytes_v2: () => number;
  clr_state_fixed_bytes_v2: () => number;
  clr_render_v2: (
    midi: number,
    velocity: number,
    sampleRateHz: number,
    variationSlot: number,
    articulation: number,
    leftPointer: number,
    rightPointer: number,
    frameCount: number,
  ) => number;
  clr_render_phrase_v2: (
    midi: number,
    velocity: number,
    sampleRateHz: number,
    variationSlot: number,
    articulation: number,
    leftPointer: number,
    rightPointer: number,
    frameCount: number,
    stateInputPointer: number,
    stateInputBytes: number,
    stateOutputPointer: number,
    stateOutputCapacity: number,
  ) => number;
}>;

type Render = Readonly<{
  left: Float32Array;
  right: Float32Array;
  state: Uint8Array;
}>;

type Runtime = Readonly<{
  sha256: string;
  exports: ClarinetExports;
  render: (
    midi: number,
    velocity: number,
    sampleRateHz: number,
    frameCount: number,
    stateInput?: Uint8Array | null,
    articulation?: 0 | 1,
  ) => Render | null;
  renderNote: (
    midi: number,
    velocity: number,
    sampleRateHz: number,
    frameCount: number,
  ) => Render | null;
}>;

const LOCAL_CANDIDATE_ENV = "CLARINET_V2_WASM_PATH";

function align(value: number, alignment: number): number {
  return Math.ceil(value / alignment) * alignment;
}

async function selectedWasmBytes(): Promise<Uint8Array> {
  const candidatePath = process.env[LOCAL_CANDIDATE_ENV];
  return candidatePath === undefined
    ? Uint8Array.from(Buffer.from(CONCERT_GRAND_WASM_BASE64, "base64"))
    : new Uint8Array(await readFile(candidatePath));
}

async function instantiateRuntime(): Promise<Runtime> {
  const bytes = await selectedWasmBytes();
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (process.env[LOCAL_CANDIDATE_ENV] === undefined) {
    expect(sha256).toBe(CONCERT_GRAND_WASM_SHA256);
  }
  const instantiated = await WebAssembly.instantiate(bytes, {});
  const exports = instantiated.instance.exports as unknown as ClarinetExports;
  const heapBase = Number(exports.__heap_base.value);
  const stateCapacity = exports.clr_state_max_bytes_v2();
  const fixedStateBytes = exports.clr_state_fixed_bytes_v2();
  if (
    !Number.isSafeInteger(heapBase) || heapBase <= 0 ||
    !Number.isSafeInteger(stateCapacity) || stateCapacity <= 0 ||
    !Number.isSafeInteger(fixedStateBytes) || fixedStateBytes <= 0 ||
    fixedStateBytes > stateCapacity
  ) {
    throw new Error("CLARINET_V2_ABI_LAYOUT_INVALID");
  }

  const render = (
    midi: number,
    velocity: number,
    sampleRateHz: number,
    frameCount: number,
    stateInput: Uint8Array | null = null,
    articulation: 0 | 1 = 1,
  ): Render | null => {
    const channelBytes = frameCount * Float32Array.BYTES_PER_ELEMENT;
    const leftPointer = align(heapBase + 1_024, 16);
    const rightPointer = leftPointer + channelBytes;
    const stateInputBytes = stateInput?.byteLength ?? 0;
    const stateInputPointer = stateInputBytes === 0
      ? 0
      : align(rightPointer + channelBytes, 8);
    const stateOutputPointer = align(
      stateInputPointer === 0
        ? rightPointer + channelBytes
        : stateInputPointer + stateInputBytes,
      8,
    );
    const requiredBytes = stateOutputPointer + stateCapacity;
    if (exports.memory.buffer.byteLength < requiredBytes) {
      exports.memory.grow(
        Math.ceil((requiredBytes - exports.memory.buffer.byteLength) / 65_536),
      );
    }
    if (stateInput !== null) {
      new Uint8Array(
        exports.memory.buffer,
        stateInputPointer,
        stateInputBytes,
      ).set(stateInput);
    }
    const written = exports.clr_render_phrase_v2(
      midi,
      velocity,
      sampleRateHz,
      0,
      articulation,
      leftPointer,
      rightPointer,
      frameCount,
      stateInputPointer,
      stateInputBytes,
      stateOutputPointer,
      stateCapacity,
    );
    if (written <= 0 || written > frameCount) return null;
    const stateView = new DataView(
      exports.memory.buffer,
      stateOutputPointer,
      stateCapacity,
    );
    const boreLength = stateView.getUint32(16, true);
    const stateBytes = fixedStateBytes + boreLength * Float64Array.BYTES_PER_ELEMENT;
    if (boreLength < 3 || stateBytes > stateCapacity) return null;
    return Object.freeze({
      left: new Float32Array(exports.memory.buffer.slice(
        leftPointer,
        leftPointer + written * Float32Array.BYTES_PER_ELEMENT,
      )),
      right: new Float32Array(exports.memory.buffer.slice(
        rightPointer,
        rightPointer + written * Float32Array.BYTES_PER_ELEMENT,
      )),
      state: new Uint8Array(exports.memory.buffer.slice(
        stateOutputPointer,
        stateOutputPointer + stateBytes,
      )),
    });
  };

  const renderNote = (
    midi: number,
    velocity: number,
    sampleRateHz: number,
    frameCount: number,
  ): Render | null => {
    const channelBytes = frameCount * Float32Array.BYTES_PER_ELEMENT;
    const leftPointer = align(heapBase + 1_024, 16);
    const rightPointer = leftPointer + channelBytes;
    const requiredBytes = rightPointer + channelBytes;
    if (exports.memory.buffer.byteLength < requiredBytes) {
      exports.memory.grow(
        Math.ceil((requiredBytes - exports.memory.buffer.byteLength) / 65_536),
      );
    }
    const written = exports.clr_render_v2(
      midi,
      velocity,
      sampleRateHz,
      0,
      1,
      leftPointer,
      rightPointer,
      frameCount,
    );
    if (written <= 0 || written > frameCount) return null;
    return Object.freeze({
      left: new Float32Array(exports.memory.buffer.slice(
        leftPointer,
        leftPointer + written * Float32Array.BYTES_PER_ELEMENT,
      )),
      right: new Float32Array(exports.memory.buffer.slice(
        rightPointer,
        rightPointer + written * Float32Array.BYTES_PER_ELEMENT,
      )),
      state: new Uint8Array(),
    });
  };

  return Object.freeze({ sha256, exports, render, renderNote });
}

function outputMetrics(render: Render): Readonly<{ rms: number; peak: number }> {
  let energy = 0;
  let peak = 0;
  for (let index = 0; index < render.left.length; index += 1) {
    const left = render.left[index] ?? 0;
    const right = render.right[index] ?? 0;
    energy += left * left + right * right;
    peak = Math.max(peak, Math.abs(left), Math.abs(right));
  }
  return Object.freeze({
    rms: Math.sqrt(energy / Math.max(1, render.left.length * 2)),
    peak,
  });
}

function isExactPrefix(short: Float32Array, long: Float32Array): boolean {
  return short.length <= long.length && short.every(
    (sample, index) => Object.is(sample, long[index]),
  );
}

function isExactConcatenation(
  whole: Float32Array,
  first: Float32Array,
  second: Float32Array,
): boolean {
  if (whole.length !== first.length + second.length) return false;
  return first.every((sample, index) => Object.is(sample, whole[index])) &&
    second.every((sample, index) =>
      Object.is(sample, whole[first.length + index])
    );
}

function isExactState(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every(
    (byte, index) => byte === right[index],
  );
}

function invalidBlockRelativeGain(
  samples: Float32Array,
  sampleRateHz: number,
): Float32Array {
  const start = Math.min(
    Math.round(0.4 * sampleRateHz),
    samples.length - 1,
  );
  const end = Math.max(start + 1, Math.min(samples.length, sampleRateHz));
  let energy = 0;
  for (let index = start; index < end; index += 1) {
    energy += (samples[index] ?? 0) ** 2;
  }
  const gain = 0.22 / Math.sqrt(energy / (end - start));
  return Float32Array.from(samples, (sample) => sample * gain);
}

let runtime: Runtime;

beforeAll(async () => {
  runtime = await instantiateRuntime();
});

describe("clarinet v2 exact WASM shipping path", () => {
  test("the ABI refuses invalid pitch, velocity, variation, and state output", () => {
    const valid = runtime.render(62, 72, 48_000, 2_400);
    expect(valid).not.toBeNull();

    const exports = runtime.exports;
    const stateCapacity = exports.clr_state_max_bytes_v2();
    const base = align(Number(exports.__heap_base.value) + 1_024, 16);
    const frames = 2_400;
    const right = base + frames * Float32Array.BYTES_PER_ELEMENT;
    const state = align(right + frames * Float32Array.BYTES_PER_ELEMENT, 8);
    expect(exports.clr_render_phrase_v2(
      0, 72, 48_000, 0, 1, base, right, frames, 0, 0, state, stateCapacity,
    )).toBe(0);
    expect(exports.clr_render_phrase_v2(
      62, 0, 48_000, 0, 1, base, right, frames, 0, 0, state, stateCapacity,
    )).toBe(0);
    expect(exports.clr_render_phrase_v2(
      62, 72, 48_000, 8, 1, base, right, frames, 0, 0, state, stateCapacity,
    )).toBe(0);
    expect(exports.clr_render_phrase_v2(
      62, 72, 48_000, 0, 1, base, right, frames, 0, 0, 0, stateCapacity,
    )).toBe(0);
  });

  test("short chart segments are exact bounded prefixes across rate, register, and dynamic", () => {
    const started = performance.now();
    let renderedFrames = 0;
    let minimumRms = Number.POSITIVE_INFINITY;
    let maximumRms = 0;
    let maximumPeak = 0;
    for (const sampleRateHz of [44_100, 48_000, 96_000]) {
      const shortFrames = Math.round(0.25 * sampleRateHz);
      const longFrames = Math.round(0.50 * sampleRateHz);
      for (const midi of [50, 62, 74, 82]) {
        for (const velocity of [36, 72, 108]) {
          const short = runtime.render(midi, velocity, sampleRateHz, shortFrames);
          const long = runtime.render(midi, velocity, sampleRateHz, longFrames);
          expect(short).not.toBeNull();
          expect(long).not.toBeNull();
          if (short === null || long === null) continue;
          expect(isExactPrefix(short.left, long.left)).toBe(true);
          expect(isExactPrefix(short.right, long.right)).toBe(true);
          const metrics = outputMetrics(short);
          // Frozen X0 browser-audio acceptance laws, not candidate-derived.
          expect(metrics.rms).toBeGreaterThanOrEqual(0.000_05);
          expect(metrics.rms).toBeLessThan(0.5);
          expect(metrics.peak).toBeGreaterThanOrEqual(0.000_5);
          expect(metrics.peak).toBeLessThan(0.99);
          minimumRms = Math.min(minimumRms, metrics.rms);
          maximumRms = Math.max(maximumRms, metrics.rms);
          maximumPeak = Math.max(maximumPeak, metrics.peak);
          renderedFrames += short.left.length + long.left.length;
        }
      }
    }
    const elapsedMilliseconds = performance.now() - started;
    console.log(JSON.stringify({
      wasmSha256: runtime.sha256,
      renderedFrames,
      elapsedMilliseconds,
      minimumRms,
      maximumRms,
      maximumPeak,
    }));
    expect(renderedFrames).toBe(1_692_900);
    expect(elapsedMilliseconds).toBeLessThan(20_000);
  }, 30_000);

  test("serialized continuation is sample- and state-exact across scheduler boundaries", () => {
    for (const sampleRateHz of [44_100, 48_000, 96_000]) {
      const segmentFrames = Math.round(0.25 * sampleRateHz);
      for (const articulation of [0, 1] as const) {
        for (const midi of [50, 66, 74, 86]) {
          for (const velocity of [36, 108]) {
            const monolithic = runtime.render(
              midi,
              velocity,
              sampleRateHz,
              2 * segmentFrames,
              null,
              articulation,
            );
            const first = runtime.render(
              midi,
              velocity,
              sampleRateHz,
              segmentFrames,
              null,
              articulation,
            );
            expect(monolithic).not.toBeNull();
            expect(first).not.toBeNull();
            if (monolithic === null || first === null) continue;
            const second = runtime.render(
              midi,
              velocity,
              sampleRateHz,
              segmentFrames,
              first.state,
              articulation,
            );
            expect(second).not.toBeNull();
            if (second === null) continue;

            /* Direct planted negative: the former implementation substituted
             * each block's local `frame` for the retained phrase clock in its
             * pressure, tongue, and articulation laws. That mutation restarts
             * at this boundary and cannot satisfy any equality below. */
            expect(isExactConcatenation(
              monolithic.left,
              first.left,
              second.left,
            )).toBe(true);
            expect(isExactConcatenation(
              monolithic.right,
              first.right,
              second.right,
            )).toBe(true);
            expect(isExactState(monolithic.state, second.state)).toBe(true);
          }
        }
      }
    }
  }, 30_000);

  test("the phrase ABI matches the reference-qualified note ABI over its analysis window", () => {
    const sampleRateHz = 48_000;
    const frameCount = Math.round(1.4 * sampleRateHz);
    const referenceFrames = sampleRateHz;
    for (const midi of [72, 76, 79, 82]) {
      for (const velocity of [36, 72, 108]) {
        const phrase = runtime.render(midi, velocity, sampleRateHz, frameCount);
        const note = runtime.renderNote(midi, velocity, sampleRateHz, frameCount);
        expect(phrase).not.toBeNull();
        expect(note).not.toBeNull();
        if (phrase === null || note === null) continue;
        expect(isExactPrefix(
          phrase.left.subarray(0, referenceFrames),
          note.left.subarray(0, referenceFrames),
        )).toBe(true);
        expect(isExactPrefix(
          note.left.subarray(0, referenceFrames),
          phrase.left.subarray(0, referenceFrames),
        )).toBe(true);
        expect(isExactPrefix(
          phrase.right.subarray(0, referenceFrames),
          note.right.subarray(0, referenceFrames),
        )).toBe(true);
        expect(isExactPrefix(
          note.right.subarray(0, referenceFrames),
          phrase.right.subarray(0, referenceFrames),
        )).toBe(true);
      }
    }
  });

  test("the former block-relative normalizer is a planted failing near-miss", () => {
    const sampleRateHz = 48_000;
    const shortFrames = Math.round(0.25 * sampleRateHz);
    const short = runtime.render(62, 108, sampleRateHz, shortFrames);
    const long = runtime.render(62, 108, sampleRateHz, 2 * shortFrames);
    expect(short).not.toBeNull();
    expect(long).not.toBeNull();
    if (short === null || long === null) return;
    const normalizedShort = invalidBlockRelativeGain(short.left, sampleRateHz);
    const normalizedLong = invalidBlockRelativeGain(long.left, sampleRateHz);
    expect(isExactPrefix(normalizedShort, normalizedLong)).toBe(false);
  });
});
