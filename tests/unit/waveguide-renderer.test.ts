/**
 * Independent proof for the physically modeled waveguide renderers
 * (X0 §5.4). Pitch assertions use a Goertzel comb the renderers do not
 * contain; stability and profile-voicing laws are asserted on measured
 * output, not on internals.
 */
import { describe, expect, test } from "bun:test";

import {
  WAVEGUIDE_CLARINET_ALGORITHM_ID,
  WAVEGUIDE_FLUTE_ALGORITHM_ID,
  WAVEGUIDE_GUITAR_CLEAN_ALGORITHM_ID,
  WAVEGUIDE_GUITAR_DRIVE_ALGORITHM_ID,
  loadWaveguideRenderers,
  type WaveguideRenderer,
} from "../../src/audio/dsp-renderer";
import { CONCERT_GRAND_WASM_SHA256 } from "../../src/audio/wasm/concert-grand-wasm";

const OUTPUT_RATE_HZ = 48_000;

function midiFrequencyHz(midiPitch: number): number {
  return 440 * 2 ** ((midiPitch - 69) / 12);
}

function goertzelAmplitude(
  samples: Float32Array,
  start: number,
  length: number,
  frequencyHz: number,
): number {
  const omega = (2 * Math.PI * frequencyHz) / OUTPUT_RATE_HZ;
  const coefficient = 2 * Math.cos(omega);
  let previous = 0;
  let beforePrevious = 0;
  const end = Math.min(start + length, samples.length);
  const count = end - start;
  for (let index = 0; index < count; index += 1) {
    const taper = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (count - 1));
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

/** Best harmonic-comb cents deviation in a +-90 cent scan. */
function measuredCents(
  samples: Float32Array,
  start: number,
  midiPitch: number,
): number {
  const f0 = midiFrequencyHz(midiPitch);
  let best = 0;
  let bestCents = 0;
  for (let cents = -90; cents <= 90; cents += 1) {
    const candidate = f0 * 2 ** (cents / 1_200);
    let score = 0;
    for (const partial of [1, 2, 3, 4]) {
      const frequency = candidate * partial;
      if (frequency > OUTPUT_RATE_HZ / 2.5) break;
      score += goertzelAmplitude(samples, start, 16_384, frequency) / partial;
    }
    if (score > best) {
      best = score;
      bestCents = cents;
    }
  }
  return bestCents;
}

function rms(samples: Float32Array, start: number, length: number): number {
  const end = Math.min(start + length, samples.length);
  let energy = 0;
  for (let index = start; index < end; index += 1) {
    energy += (samples[index] ?? 0) ** 2;
  }
  return Math.sqrt(energy / Math.max(1, end - start));
}

function centroidHz(samples: Float32Array, start: number): number {
  let numerator = 0;
  let denominator = 0;
  for (let frequency = 80; frequency < 10_000; frequency *= 1.26) {
    const amplitude = goertzelAmplitude(samples, start, 8_192, frequency);
    numerator += amplitude * frequency;
    denominator += amplitude;
  }
  return denominator > 0 ? numerator / denominator : 0;
}

const renderers = await loadWaveguideRenderers();

function renderer(algorithmId: string): WaveguideRenderer {
  const found = renderers.get(algorithmId);
  if (found === undefined) throw new Error(`TEST_RENDERER_MISSING: ${algorithmId}`);
  return found;
}

const clean = renderer(WAVEGUIDE_GUITAR_CLEAN_ALGORITHM_ID);
const drive = renderer(WAVEGUIDE_GUITAR_DRIVE_ALGORITHM_ID);
const flute = renderer(WAVEGUIDE_FLUTE_ALGORITHM_ID);
const clarinet = renderer(WAVEGUIDE_CLARINET_ALGORITHM_ID);

describe("waveguide renderer laws", () => {
  test("the map carries exactly the reviewed waveguide algorithms, pinned to the wasm payload", () => {
    expect([...renderers.keys()].sort()).toEqual([
      WAVEGUIDE_CLARINET_ALGORITHM_ID,
      WAVEGUIDE_FLUTE_ALGORITHM_ID,
      WAVEGUIDE_GUITAR_CLEAN_ALGORITHM_ID,
      WAVEGUIDE_GUITAR_DRIVE_ALGORITHM_ID,
    ]);
    for (const entry of renderers.values()) {
      expect(entry.wasmSha256).toBe(CONCERT_GRAND_WASM_SHA256);
    }
  });

  test("out-of-contract requests return null, in-contract renders sound", () => {
    for (const subject of [clean, drive, flute, clarinet]) {
      expect(subject.renderNote(20, 64, OUTPUT_RATE_HZ)).toBeNull();
      expect(subject.renderNote(109, 64, OUTPUT_RATE_HZ)).toBeNull();
      expect(subject.renderNote(60, 0, OUTPUT_RATE_HZ)).toBeNull();
      expect(subject.renderNote(60, 128, OUTPUT_RATE_HZ)).toBeNull();
      expect(subject.renderNote(60, 64, 7_999)).toBeNull();
      for (const midiPitch of [21, 40, 64, 88, 108]) {
        const pcm = subject.renderNote(midiPitch, 96, OUTPUT_RATE_HZ, 0.5);
        expect(pcm).not.toBeNull();
        if (pcm !== null) {
          expect(rms(pcm.left, 0, pcm.frameCount)).toBeGreaterThan(1e-4);
        }
      }
    }
  });

  test("guitar lands on 12-TET within two cents through both amps", () => {
    for (const subject of [clean, drive]) {
      for (const midiPitch of [40, 52, 64, 76]) {
        const pcm = subject.renderNote(midiPitch, 96, OUTPUT_RATE_HZ);
        expect(pcm).not.toBeNull();
        if (pcm === null) continue;
        expect(
          Math.abs(measuredCents(pcm.left, Math.floor(0.05 * OUTPUT_RATE_HZ), midiPitch)),
        ).toBeLessThanOrEqual(2);
      }
    }
  });

  test("flute lands within twenty cents across its register", () => {
    for (const midiPitch of [55, 60, 65, 72, 79, 84, 91]) {
      const pcm = flute.renderNote(midiPitch, 96, OUTPUT_RATE_HZ, 2);
      expect(pcm).not.toBeNull();
      if (pcm === null) continue;
      expect(
        Math.abs(measuredCents(pcm.left, Math.floor(0.8 * OUTPUT_RATE_HZ), midiPitch)),
      ).toBeLessThanOrEqual(20);
    }
  });

  test("a plucked string only ever loses energy", () => {
    for (const subject of [clean, drive]) {
      for (const midiPitch of [45, 64, 83]) {
        const pcm = subject.renderNote(midiPitch, 96, OUTPUT_RATE_HZ);
        expect(pcm).not.toBeNull();
        if (pcm === null) continue;
        const early = rms(pcm.left, 0, Math.floor(0.15 * OUTPUT_RATE_HZ));
        const late = rms(
          pcm.left,
          Math.floor(0.9 * OUTPUT_RATE_HZ),
          Math.floor(0.2 * OUTPUT_RATE_HZ),
        );
        expect(late).toBeLessThan(early);
      }
    }
  });

  test("the twang chain passes measurably more top end than the dark archtop chain", () => {
    /* The two amp voicings differ in their cab rolloffs (6.5 kHz vs
     * 4.2 kHz): on the same pluck, the second profile must transmit more
     * 4-6 kHz relative to its low-mid body than the first. */
    let brighter = 0;
    const probes = [45, 57, 69];
    for (const midiPitch of probes) {
      const cleanPcm = clean.renderNote(midiPitch, 96, OUTPUT_RATE_HZ, 1);
      const twangPcm = drive.renderNote(midiPitch, 96, OUTPUT_RATE_HZ, 1);
      expect(cleanPcm).not.toBeNull();
      expect(twangPcm).not.toBeNull();
      if (cleanPcm === null || twangPcm === null) continue;
      const start = Math.floor(0.02 * OUTPUT_RATE_HZ);
      const ratio = (pcm: Float32Array): number => {
        let top = 0;
        let body = 0;
        for (let f = 4_000; f < 6_000; f += 400) {
          top += goertzelAmplitude(pcm, start, 8_192, f);
        }
        for (let f = 200; f < 800; f += 120) {
          body += goertzelAmplitude(pcm, start, 8_192, f);
        }
        return top / Math.max(body, 1e-9);
      };
      if (ratio(twangPcm.left) > ratio(cleanPcm.left)) brighter += 1;
    }
    expect(brighter).toBeGreaterThanOrEqual(2);
  });

  test("clarinet lands within fifteen cents in its written register and is odd-harmonic dominant", () => {
    for (const midiPitch of [52, 58, 64, 70, 76, 84]) {
      const pcm = clarinet.renderNote(midiPitch, 96, OUTPUT_RATE_HZ, 2);
      expect(pcm).not.toBeNull();
      if (pcm === null) continue;
      const start = Math.floor(0.8 * OUTPUT_RATE_HZ);
      const cents = measuredCents(pcm.left, start, midiPitch);
      expect(Math.abs(cents)).toBeLessThanOrEqual(15);
      const f0 = midiFrequencyHz(midiPitch) * 2 ** (cents / 1_200);
      const h2 = goertzelAmplitude(pcm.left, start, 16_384, f0 * 2);
      const h3 = goertzelAmplitude(pcm.left, start, 16_384, f0 * 3);
      /* The closed-open bore's signature: the third harmonic outweighs
       * the second. */
      expect(h3).toBeGreaterThan(h2);
    }
  });

  test("flute brightens as it is blown harder", () => {
    const soft = flute.renderNote(72, 30, OUTPUT_RATE_HZ, 2);
    const hard = flute.renderNote(72, 120, OUTPUT_RATE_HZ, 2);
    expect(soft).not.toBeNull();
    expect(hard).not.toBeNull();
    if (soft === null || hard === null) return;
    const start = Math.floor(0.8 * OUTPUT_RATE_HZ);
    const f0 = midiFrequencyHz(72);
    const softUpper =
      goertzelAmplitude(soft.left, start, 16_384, f0 * 3) /
      Math.max(goertzelAmplitude(soft.left, start, 16_384, f0), 1e-9);
    const hardUpper =
      goertzelAmplitude(hard.left, start, 16_384, f0 * 3) /
      Math.max(goertzelAmplitude(hard.left, start, 16_384, f0), 1e-9);
    expect(hardUpper).toBeGreaterThan(softUpper);
  });

  test("rendering is deterministic and truncation cannot click", () => {
    const first = drive.renderNote(52, 80, OUTPUT_RATE_HZ, 0.5);
    const second = drive.renderNote(52, 80, OUTPUT_RATE_HZ, 0.5);
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    if (first === null || second === null) return;
    expect(Array.from(first.left)).toEqual(Array.from(second.left));
    expect(first.frameCount).toBe(Math.round(0.5 * OUTPUT_RATE_HZ));
    expect(Math.abs(first.left[first.frameCount - 1] ?? 1)).toBeLessThan(1e-3);
  });
});
