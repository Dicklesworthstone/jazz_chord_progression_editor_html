/**
 * Known-answer controls for the pre-listening screen: independent
 * synthetic signals, never production renders, so a broken screen cannot
 * certify a broken renderer. The noise control is exactly the failure the
 * owner heard on 2026-08-06 (pack eb688080f82197dd) — the screen exists
 * so human listening is never again spent on machine-detectable noise.
 */
import { describe, expect, test } from "bun:test";

import {
  SCREEN_HIGH_BAND_CEILING_DB,
  SCREEN_HNR_FLOOR_DB,
  screenListeningCandidate,
} from "../../scripts/listening-screen";

const RATE = 48_000;
const SECONDS = 1.5;

function harmonicTone(f0: number, partials: number, amplitude: number): Float32Array {
  const samples = new Float32Array(RATE * SECONDS);
  for (let index = 0; index < samples.length; index += 1) {
    let value = 0;
    for (let k = 1; k <= partials; k += 1) {
      value += Math.sin((2 * Math.PI * k * f0 * index) / RATE) / k;
    }
    samples[index] = value * amplitude;
  }
  return samples;
}

function seededNoise(amplitude: number): Float32Array {
  let state = 0xdead_beef;
  const samples = new Float32Array(RATE * SECONDS);
  for (let index = 0; index < samples.length; index += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    samples[index] = (state / 0xffff_ffff - 0.5) * 2 * amplitude;
  }
  return samples;
}

describe("pre-listening screen known-answer controls", () => {
  const f0 = 440 * 2 ** ((74 - 69) / 12);

  test("a synthetic harmonic tone passes with full metrics", () => {
    const verdict = screenListeningCandidate(harmonicTone(f0, 6, 0.2), RATE, f0);
    expect(verdict.pass).toBe(true);
    expect(verdict.reasons).toEqual([]);
    expect(Math.abs(verdict.centsOffset ?? 99)).toBeLessThan(2);
    expect(verdict.hnrDb ?? 0).toBeGreaterThan(SCREEN_HNR_FLOOR_DB);
    expect(verdict.highBandDb).toBeLessThan(SCREEN_HIGH_BAND_CEILING_DB);
  });

  test("synthetic noise — what the owner heard — screen-fails on pitch lock", () => {
    const verdict = screenListeningCandidate(seededNoise(0.3), RATE, f0);
    expect(verdict.pass).toBe(false);
    expect(verdict.reasons.some((reason) => reason.includes("no pitch lock"))).toBe(true);
    expect(verdict.centsOffset).toBeNull();
  });

  test("a mistuned tone screen-fails on the cents gate", () => {
    const verdict = screenListeningCandidate(harmonicTone(f0 * 1.02, 6, 0.2), RATE, f0);
    expect(verdict.pass).toBe(false);
    expect(verdict.reasons.some((reason) => reason.includes("cents outside"))).toBe(true);
  });

  test("a hissy tone screen-fails on the high-band ceiling", () => {
    const tone = harmonicTone(f0, 4, 0.15);
    const noise = seededNoise(0.12);
    const mixed = new Float32Array(tone.length);
    for (let index = 0; index < mixed.length; index += 1) {
      mixed[index] = (tone[index] ?? 0) + (noise[index] ?? 0);
    }
    const verdict = screenListeningCandidate(mixed, RATE, f0);
    expect(verdict.pass).toBe(false);
    expect(verdict.reasons.some((reason) => reason.includes("5.5 kHz"))).toBe(true);
  });

  test("a candidate trailing its comparator's harmonicity screen-fails on the margin", () => {
    const clean = harmonicTone(f0, 6, 0.2);
    const noise = seededNoise(0.02);
    const noisy = new Float32Array(clean.length);
    for (let index = 0; index < noisy.length; index += 1) {
      noisy[index] = (clean[index] ?? 0) + (noise[index] ?? 0);
    }
    const verdict = screenListeningCandidate(noisy, RATE, f0, clean);
    expect(verdict.pass).toBe(false);
    expect(verdict.reasons.some((reason) => reason.includes("trails comparator"))).toBe(true);
  });
});
