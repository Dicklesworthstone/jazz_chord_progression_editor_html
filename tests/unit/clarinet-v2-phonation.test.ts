/**
 * Clarinet v2 phonation sweep (jcpe-clarinet-v2-soft-high-phonation-wskr).
 *
 * Owner listening (2026-08-06, pack eb688080f82197dd) caught the v2
 * dynamic-reed candidate rendering pure breath noise on every soft cell:
 * the shared legacy pressure plateau sat below the segmented lattice's
 * register-dependent oscillation threshold. This suite freezes the repaired
 * law — every supported (register x velocity x articulation) cell must
 * PHONATE: an independent autocorrelation estimator (no production FFT)
 * must lock within the cents gate, with harmonicity above an authored
 * floor. Silence and unpitched turbulence can never ship as "clarinet"
 * again without this file going red.
 *
 * The detector itself carries known-answer controls (a synthetic harmonic
 * tone must lock; seeded noise must not), so a broken detector cannot
 * certify a broken renderer — and the noise control doubles as the
 * near-miss: it is exactly what the owner heard, and the sweep provably
 * detects it.
 */
import { describe, expect, test } from "bun:test";

import {
  loadWaveguideRenderers,
  WAVEGUIDE_CLARINET_V2_ALGORITHM_ID,
} from "../../src/audio/dsp-renderer";

const RATE = 48_000;
const NOTE_SECONDS = 1.2;
const CENTS_GATE = 15;
/** Authored floor: phonating cells measured 29..58 dB; turbulence-only
 * cells measure below 5 dB with this estimator. 18 dB splits the classes
 * with wide margin on both sides. */
const HNR_FLOOR_DB = 18;
const SWEEP_MIDIS = [50, 55, 60, 62, 66, 70, 74, 78, 82, 86, 89] as const;
const SWEEP_VELOCITIES = [1, 20, 36, 64, 90, 108, 127] as const;

function midiFrequencyHz(midiPitch: number): number {
  return 440 * 2 ** ((midiPitch - 69) / 12);
}

function estimateF0(x: Float32Array, rate: number, expectHz: number): number | null {
  const start = Math.round(0.4 * rate);
  const length = Math.min(Math.round(0.6 * rate), x.length - start);
  if (length < 2_048) return null;
  const segment = new Float64Array(length);
  let mean = 0;
  for (let index = 0; index < length; index += 1) mean += x[start + index] ?? 0;
  mean /= length;
  for (let index = 0; index < length; index += 1) {
    segment[index] = (x[start + index] ?? 0) - mean;
  }
  let norm = 0;
  for (const value of segment) norm += value * value;
  if (norm <= 0) return null;
  const minLag = Math.floor(rate / (expectHz * 1.5));
  const maxLag = Math.ceil(rate / (expectHz / 1.5));
  const scores = new Float64Array(maxLag + 2);
  let bestLag = -1;
  let bestScore = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let sum = 0;
    for (let index = 0; index + lag < length; index += 1) {
      sum += segment[index]! * segment[index + lag]!;
    }
    const score = sum / norm;
    scores[lag] = score;
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }
  if (bestLag < 0 || bestScore < 0.5) return null;
  const y0 = scores[bestLag - 1] ?? bestScore;
  const y2 = scores[bestLag + 1] ?? bestScore;
  const denominator = y0 - 2 * bestScore + y2;
  const shift = denominator === 0 ? 0 : (0.5 * (y0 - y2)) / denominator;
  return rate / (bestLag + Math.max(-1, Math.min(1, shift)));
}

function goertzelPower(segment: Float64Array, rate: number, hz: number): number {
  const omega = (2 * Math.PI * hz) / rate;
  const coefficient = 2 * Math.cos(omega);
  let s1 = 0;
  let s2 = 0;
  for (const value of segment) {
    const s = value + coefficient * s1 - s2;
    s2 = s1;
    s1 = s;
  }
  return s1 * s1 + s2 * s2 - coefficient * s1 * s2;
}

function hnrDb(x: Float32Array, rate: number, f0: number): number {
  const start = Math.round(0.4 * rate);
  const length = Math.min(Math.round(0.6 * rate), x.length - start);
  const segment = new Float64Array(length);
  for (let index = 0; index < length; index += 1) {
    const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (length - 1));
    segment[index] = (x[start + index] ?? 0) * hann;
  }
  let harmonic = 0;
  let interharmonic = 0;
  const partialCount = Math.floor((rate * 0.45) / f0);
  for (let k = 1; k <= partialCount; k += 1) {
    harmonic += goertzelPower(segment, rate, k * f0);
    interharmonic += goertzelPower(segment, rate, (k + 0.5) * f0);
  }
  if (interharmonic <= 0) return 120;
  return 10 * Math.log10(harmonic / interharmonic);
}

describe("phonation detector known-answer controls", () => {
  test("a synthetic harmonic tone locks with high harmonicity", () => {
    const f0 = midiFrequencyHz(74);
    const samples = new Float32Array(RATE * NOTE_SECONDS);
    for (let index = 0; index < samples.length; index += 1) {
      let value = 0;
      for (let k = 1; k <= 6; k += 1) {
        value += Math.sin((2 * Math.PI * k * f0 * index) / RATE) / k;
      }
      samples[index] = value * 0.2;
    }
    const measured = estimateF0(samples, RATE, f0);
    expect(measured).not.toBeNull();
    expect(Math.abs(1200 * Math.log2((measured ?? 1) / f0))).toBeLessThan(2);
    expect(hnrDb(samples, RATE, measured ?? f0)).toBeGreaterThan(40);
  });

  test("seeded noise — what the owner heard — is provably detected as non-phonation", () => {
    let state = 0x1234_5678;
    const samples = new Float32Array(RATE * NOTE_SECONDS);
    for (let index = 0; index < samples.length; index += 1) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      state >>>= 0;
      samples[index] = (state / 0xffff_ffff - 0.5) * 0.4;
    }
    expect(estimateF0(samples, RATE, midiFrequencyHz(74))).toBeNull();
  });
});

describe("clarinet v2 phonation sweep", () => {
  for (const articulation of ["tongued", "legato"] as const) {
    test(`every register x velocity phonates (${articulation})`, async () => {
      const renderers = await loadWaveguideRenderers();
      const renderer = renderers.get(WAVEGUIDE_CLARINET_V2_ALGORITHM_ID);
      expect(renderer).toBeDefined();
      const failures: string[] = [];
      for (const midiPitch of SWEEP_MIDIS) {
        const expectHz = midiFrequencyHz(midiPitch);
        for (const velocity of SWEEP_VELOCITIES) {
          const pcm = renderer?.renderNote(midiPitch, velocity, RATE, NOTE_SECONDS, 0, articulation);
          if (!pcm) {
            failures.push(`midi ${String(midiPitch)} vel ${String(velocity)}: render refused`);
            continue;
          }
          const f0 = estimateF0(pcm.left, RATE, expectHz);
          if (f0 === null) {
            failures.push(`midi ${String(midiPitch)} vel ${String(velocity)}: no pitch lock (pure noise)`);
            continue;
          }
          const cents = 1200 * Math.log2(f0 / expectHz);
          if (Math.abs(cents) > CENTS_GATE) {
            failures.push(
              `midi ${String(midiPitch)} vel ${String(velocity)}: ${cents.toFixed(1)} cents off`,
            );
            continue;
          }
          const harmonicity = hnrDb(pcm.left, RATE, f0);
          if (harmonicity < HNR_FLOOR_DB) {
            failures.push(
              `midi ${String(midiPitch)} vel ${String(velocity)}: HNR ${harmonicity.toFixed(1)} dB below floor`,
            );
          }
        }
      }
      console.log(
        `[phonation-evidence] ${articulation}: ${String(SWEEP_MIDIS.length * SWEEP_VELOCITIES.length)} cells, failures: ${String(failures.length)}`,
      );
      expect(failures).toEqual([]);
    }, 120_000);
  }
});
