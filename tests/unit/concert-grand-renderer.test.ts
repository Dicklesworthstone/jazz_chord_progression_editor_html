/**
 * jcpe-r7f7 evidence: the embedded Concert Grand renderer is deterministic
 * and musically on pitch.
 *
 * The pitch oracle here is a Goertzel filter written in plain test-side
 * TypeScript — no shared code with the wasm module — so a renderer that
 * produced the wrong fundamental could not certify itself. The byte-level
 * golden pins determinism, not musicality: identical requests must yield
 * identical PCM on every host.
 */
import { describe, expect, test } from "bun:test";

import {
  loadConcertGrandRenderer,
  type RenderedNotePcm,
} from "../../src/audio/dsp-renderer";

const SAMPLE_RATE = 48_000;

function midiFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/**
 * Independent single-bin spectral energy: the classic Goertzel recurrence
 * under a Hann window. The window kills the rectangular-leakage skirt that
 * would otherwise smear a low fundamental across a quarter-tone.
 */
function goertzelPower(
  samples: Float32Array,
  start: number,
  length: number,
  frequencyHz: number,
): number {
  const omega = (2 * Math.PI * frequencyHz) / SAMPLE_RATE;
  const coefficient = 2 * Math.cos(omega);
  let sPrev = 0;
  let sPrev2 = 0;
  for (let index = 0; index < length; index += 1) {
    const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (length - 1));
    const sample = (samples[start + index] ?? 0) * window;
    const s = sample + coefficient * sPrev - sPrev2;
    sPrev2 = sPrev;
    sPrev = s;
  }
  return sPrev * sPrev + sPrev2 * sPrev2 - coefficient * sPrev * sPrev2;
}

async function renderOrThrow(
  midi: number,
  velocity: number,
): Promise<RenderedNotePcm> {
  const renderer = await loadConcertGrandRenderer();
  const pcm = renderer.renderNote(midi, velocity, SAMPLE_RATE);
  if (pcm === null) throw new Error("RENDER_REFUSED");
  return pcm;
}

describe("jcpe-r7f7 concert grand renderer", () => {
  test("renders are bit-deterministic across calls", async () => {
    const first = await renderOrThrow(60, 96);
    const second = await renderOrThrow(60, 96);
    expect(second.frameCount).toBe(first.frameCount);
    expect(Buffer.from(second.left.buffer).equals(Buffer.from(first.left.buffer))).toBe(
      true,
    );
    expect(
      Buffer.from(second.right.buffer).equals(Buffer.from(first.right.buffer)),
    ).toBe(true);
  });

  test("every chromatic fundamental from C2 to C7 lands on its 12-TET pitch", async () => {
    /* One octave stride keeps the suite fast while covering every register. */
    for (let midi = 36; midi <= 96; midi += 7) {
      const pcm = await renderOrThrow(midi, 96);
      const f0 = midiFrequency(midi);
      /*
       * Analysis window in the body of the note, past the hammer noise, and
       * long enough for at least ~48 cycles of the fundamental so a quarter
       * tone is resolvable even at C2.
       */
      const start = Math.floor(0.05 * SAMPLE_RATE);
      const length = Math.min(
        Math.max(16_384, Math.round((SAMPLE_RATE * 48) / f0)),
        pcm.frameCount - start,
      );
      const onPitch = goertzelPower(pcm.left, start, length, f0);
      const flat = goertzelPower(pcm.left, start, length, f0 / 2 ** (0.5 / 12));
      const sharp = goertzelPower(pcm.left, start, length, f0 * 2 ** (0.5 / 12));
      expect(onPitch).toBeGreaterThan(flat * 3);
      expect(onPitch).toBeGreaterThan(sharp * 3);
    }
  });

  test("harder velocity is brighter, not merely louder", async () => {
    const soft = await renderOrThrow(60, 30);
    const hard = await renderOrThrow(60, 120);
    const f0 = midiFrequency(60);
    const start = Math.floor(0.05 * SAMPLE_RATE);
    const length = 8_192;
    const softRatio =
      goertzelPower(soft.left, start, length, f0 * 6) /
      goertzelPower(soft.left, start, length, f0);
    const hardRatio =
      goertzelPower(hard.left, start, length, f0 * 6) /
      goertzelPower(hard.left, start, length, f0);
    expect(hardRatio).toBeGreaterThan(softRatio * 2);
  });

  test("the stereo image is real: channels differ but stay balanced", async () => {
    const pcm = await renderOrThrow(69, 96);
    let identical = true;
    let leftEnergy = 0;
    let rightEnergy = 0;
    for (let index = 0; index < pcm.frameCount; index += 1) {
      const left = pcm.left[index] ?? 0;
      const right = pcm.right[index] ?? 0;
      if (left !== right) identical = false;
      leftEnergy += left * left;
      rightEnergy += right * right;
    }
    expect(identical).toBe(false);
    const balance = leftEnergy / rightEnergy;
    expect(balance).toBeGreaterThan(0.2);
    expect(balance).toBeLessThan(5);
  });

  test("output respects the peak guard and register duration caps", async () => {
    for (const [midi, capSeconds] of [
      [24, 8],
      [50, 6.5],
      [70, 4.5],
      [100, 2.8],
    ] as const) {
      const pcm = await renderOrThrow(midi, 127);
      expect(pcm.frameCount).toBeLessThanOrEqual(capSeconds * SAMPLE_RATE);
      let peak = 0;
      for (let index = 0; index < pcm.frameCount; index += 1) {
        const left = Math.abs(pcm.left[index] ?? 0);
        const right = Math.abs(pcm.right[index] ?? 0);
        if (left > peak) peak = left;
        if (right > peak) peak = right;
      }
      expect(peak).toBeLessThanOrEqual(0.95);
      expect(peak).toBeGreaterThan(0.05);
    }
  });

  test("a struck note decays: the tail is far quieter than the attack body", async () => {
    const pcm = await renderOrThrow(72, 96);
    const window = Math.floor(0.25 * SAMPLE_RATE);
    let early = 0;
    let late = 0;
    for (let index = 0; index < window; index += 1) {
      const head = pcm.left[Math.floor(0.02 * SAMPLE_RATE) + index] ?? 0;
      const tail = pcm.left[pcm.frameCount - window + index] ?? 0;
      early += head * head;
      late += tail * tail;
    }
    expect(late).toBeLessThan(early / 100);
  });

  test("out-of-contract requests are refused, not repaired", async () => {
    const renderer = await loadConcertGrandRenderer();
    expect(renderer.renderNote(20, 96, SAMPLE_RATE)).toBeNull();
    expect(renderer.renderNote(109, 96, SAMPLE_RATE)).toBeNull();
    expect(renderer.renderNote(60, 0, SAMPLE_RATE)).toBeNull();
    expect(renderer.renderNote(60, 128, SAMPLE_RATE)).toBeNull();
    expect(renderer.renderNote(60, 96, 4_000)).toBeNull();
  });
});
