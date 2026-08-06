/**
 * Independent proof for the sampled-instrument renderer (jcpe-1miv).
 *
 * The laws proven here are stated against the payload modules' own pinned
 * metadata and against spectral measurements of the rendered output — not
 * against the renderer's internals. The pitch assertions use a Goertzel
 * comb the renderer does not contain.
 */
import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";

import {
  SAMPLED_RENDERER_POLICY,
  UPRIGHT_BASS_RENDERER_ALGORITHM_ID,
  VIBRAPHONE_RENDERER_ALGORITHM_ID,
  loadSampledInstrumentRenderer,
} from "../../src/audio/sampled-renderer";
import {
  UPRIGHT_BASS_SAMPLES_BASE64,
  UPRIGHT_BASS_SAMPLES_BYTE_LENGTH,
  UPRIGHT_BASS_SAMPLES_SHA256,
  UPRIGHT_BASS_SAMPLES_SLICE_INDEX,
} from "../../src/audio/wasm/upright-bass-samples";
import {
  VIBRAPHONE_SAMPLES_BASE64,
  VIBRAPHONE_SAMPLES_BYTE_LENGTH,
  VIBRAPHONE_SAMPLES_SHA256,
  VIBRAPHONE_SAMPLES_SLICE_INDEX,
} from "../../src/audio/wasm/vibraphone-samples";

const OUTPUT_RATE_HZ = 48_000;

function midiFrequencyHz(midiPitch: number): number {
  return 440 * 2 ** ((midiPitch - 69) / 12);
}

/** Hann-windowed Goertzel amplitude at one frequency. */
function goertzelAmplitude(
  samples: Float32Array,
  start: number,
  length: number,
  frequencyHz: number,
  sampleRateHz: number,
): number {
  const omega = (2 * Math.PI * frequencyHz) / sampleRateHz;
  const coefficient = 2 * Math.cos(omega);
  let previous = 0;
  let beforePrevious = 0;
  for (let index = 0; index < length; index += 1) {
    const taper = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (length - 1));
    const sample = (samples[start + index] ?? 0) * taper;
    const current = sample + coefficient * previous - beforePrevious;
    beforePrevious = previous;
    previous = current;
  }
  return Math.sqrt(
    Math.max(
      0,
      previous * previous +
        beforePrevious * beforePrevious -
        coefficient * previous * beforePrevious,
    ),
  );
}

/** Harmonic-comb amplitude (partials 1, 2, weighted) at a candidate pitch. */
function combAmplitude(
  samples: Float32Array,
  frequencyHz: number,
): number {
  const length = Math.min(samples.length, 24_000);
  return (
    goertzelAmplitude(samples, 0, length, frequencyHz, OUTPUT_RATE_HZ) +
    goertzelAmplitude(samples, 0, length, frequencyHz * 2, OUTPUT_RATE_HZ) / 2
  );
}

describe("payload integrity", () => {
  test("upright-bass payload matches its pinned SHA-256 and byte length", () => {
    const bytes = Buffer.from(UPRIGHT_BASS_SAMPLES_BASE64, "base64");
    expect(bytes.byteLength).toBe(UPRIGHT_BASS_SAMPLES_BYTE_LENGTH);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      UPRIGHT_BASS_SAMPLES_SHA256,
    );
  });

  test("vibraphone payload matches its pinned SHA-256 and byte length", () => {
    const bytes = Buffer.from(VIBRAPHONE_SAMPLES_BASE64, "base64");
    expect(bytes.byteLength).toBe(VIBRAPHONE_SAMPLES_BYTE_LENGTH);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      VIBRAPHONE_SAMPLES_SHA256,
    );
  });

  test("slice indexes tile their payloads exactly with no gaps", () => {
    for (const [index, byteLength] of [
      [UPRIGHT_BASS_SAMPLES_SLICE_INDEX, UPRIGHT_BASS_SAMPLES_BYTE_LENGTH],
      [VIBRAPHONE_SAMPLES_SLICE_INDEX, VIBRAPHONE_SAMPLES_BYTE_LENGTH],
    ] as const) {
      let cursor = 0;
      for (const slice of index) {
        expect(slice.byteOffset).toBe(cursor);
        expect(slice.frameCount).toBeGreaterThan(0);
        cursor += slice.frameCount * 2;
      }
      expect(cursor).toBe(byteLength);
    }
  });
});

describe("renderer laws", () => {
  const bass = loadSampledInstrumentRenderer(
    UPRIGHT_BASS_RENDERER_ALGORITHM_ID,
  );
  const vibes = loadSampledInstrumentRenderer(
    VIBRAPHONE_RENDERER_ALGORITHM_ID,
  );

  test("unknown algorithm ids refuse loudly", () => {
    expect(() => loadSampledInstrumentRenderer("changes.dsp.nope@1")).toThrow(
      "SAMPLED_RENDERER_UNKNOWN_ALGORITHM",
    );
  });

  test("out-of-contract requests return null, in-contract never do", () => {
    expect(bass.renderNote(20, 64, OUTPUT_RATE_HZ)).toBeNull();
    expect(bass.renderNote(109, 64, OUTPUT_RATE_HZ)).toBeNull();
    expect(bass.renderNote(40.5, 64, OUTPUT_RATE_HZ)).toBeNull();
    expect(bass.renderNote(40, 0, OUTPUT_RATE_HZ)).toBeNull();
    expect(bass.renderNote(40, 128, OUTPUT_RATE_HZ)).toBeNull();
    expect(bass.renderNote(40, 64, 7_999)).toBeNull();
    expect(bass.renderNote(40, 64, OUTPUT_RATE_HZ, 0)).toBeNull();
    const contractPitches = Array.from(
      {
        length:
          SAMPLED_RENDERER_POLICY.maximumMidiPitch -
          SAMPLED_RENDERER_POLICY.minimumMidiPitch +
          1,
      },
      (_, offset) => SAMPLED_RENDERER_POLICY.minimumMidiPitch + offset,
    );
    for (const midiPitch of contractPitches) {
      expect(bass.renderNote(midiPitch, 64, OUTPUT_RATE_HZ, 0.25)).not.toBeNull();
      expect(vibes.renderNote(midiPitch, 64, OUTPUT_RATE_HZ, 0.25)).not.toBeNull();
    }
  });

  test("nearest recorded key is selected, ties to the higher key", () => {
    for (const renderer of [bass, vibes]) {
      const keys = [...new Set(
        (renderer === bass
          ? UPRIGHT_BASS_SAMPLES_SLICE_INDEX
          : VIBRAPHONE_SAMPLES_SLICE_INDEX
        ).map((slice) => slice.midiPitch),
      )].sort((a, b) => a - b);
      for (let midiPitch = 21; midiPitch <= 108; midiPitch += 1) {
        const chosen = renderer.sliceFor(midiPitch).midiPitch;
        const bestDistance = Math.min(
          ...keys.map((key) => Math.abs(key - midiPitch)),
        );
        expect(Math.abs(chosen - midiPitch)).toBe(bestDistance);
        const tiedKeys = keys.filter(
          (key) => Math.abs(key - midiPitch) === bestDistance,
        );
        if (tiedKeys.length > 1) {
          expect(chosen).toBe(Math.max(...tiedKeys));
        }
      }
    }
  });

  test("rendered pitch lands on 12-TET for transposed and edge-stretched notes", () => {
    /* 43 and 44 are unrecorded bass keys; 26 stretches below the corpus.
     * 62 and 90 exercise vibraphone transposition and above-corpus stretch
     * (both stay in the vibraphone's own register). */
    const cases: ReadonlyArray<readonly [typeof bass, number]> = [
      [bass, 33],
      [bass, 43],
      [bass, 44],
      [bass, 55],
      [vibes, 62],
      [vibes, 79],
      [vibes, 90],
    ];
    for (const [renderer, midiPitch] of cases) {
      const pcm = renderer.renderNote(midiPitch, 96, OUTPUT_RATE_HZ);
      expect(pcm).not.toBeNull();
      if (pcm === null) continue;
      const expected = combAmplitude(pcm.left, midiFrequencyHz(midiPitch));
      const below = combAmplitude(
        pcm.left,
        midiFrequencyHz(midiPitch) / 2 ** (1 / 12),
      );
      const above = combAmplitude(
        pcm.left,
        midiFrequencyHz(midiPitch) * 2 ** (1 / 12),
      );
      expect(expected).toBeGreaterThan(below * 2);
      expect(expected).toBeGreaterThan(above * 2);
    }
  });

  test("rendering is deterministic and channels are identical", () => {
    const first = bass.renderNote(40, 80, OUTPUT_RATE_HZ);
    const second = bass.renderNote(40, 80, OUTPUT_RATE_HZ);
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    if (first === null || second === null) return;
    expect(first.frameCount).toBe(second.frameCount);
    expect(Array.from(first.left)).toEqual(Array.from(second.left));
    expect(Array.from(first.left)).toEqual(Array.from(first.right));
  });

  test("velocity changes neither length nor PCM: dynamics live at the voice gain", () => {
    const soft = vibes.renderNote(67, 20, OUTPUT_RATE_HZ, 0.5);
    const hard = vibes.renderNote(67, 120, OUTPUT_RATE_HZ, 0.5);
    expect(soft).not.toBeNull();
    expect(hard).not.toBeNull();
    if (soft === null || hard === null) return;
    expect(Array.from(soft.left)).toEqual(Array.from(hard.left));
  });

  test("maxSeconds truncates with a click guard, absent it renders the natural length", () => {
    const natural = bass.renderNote(40, 64, OUTPUT_RATE_HZ);
    const truncated = bass.renderNote(40, 64, OUTPUT_RATE_HZ, 0.25);
    expect(natural).not.toBeNull();
    expect(truncated).not.toBeNull();
    if (natural === null || truncated === null) return;
    expect(truncated.frameCount).toBe(Math.floor(0.25 * OUTPUT_RATE_HZ));
    expect(natural.frameCount).toBeGreaterThan(truncated.frameCount);
    expect(Math.abs(truncated.left[truncated.frameCount - 1] ?? 1)).toBeLessThan(
      1e-4,
    );
    /* The natural render carries the payload's own baked fade instead. */
    expect(Math.abs(natural.left[natural.frameCount - 1] ?? 1)).toBeLessThan(
      0.02,
    );
  });

  test("payload rate differences are absorbed: output length scales with the context rate", () => {
    const at48 = vibes.renderNote(67, 64, 48_000);
    const at44 = vibes.renderNote(67, 64, 44_100);
    expect(at48).not.toBeNull();
    expect(at44).not.toBeNull();
    if (at48 === null || at44 === null) return;
    const seconds48 = at48.frameCount / 48_000;
    const seconds44 = at44.frameCount / 44_100;
    expect(Math.abs(seconds48 - seconds44)).toBeLessThan(0.001);
  });
});
