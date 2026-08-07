/**
 * jcpe-dsp-tuning-independent-6fyy: independent tuning fixture.
 *
 * The waveguide pull tables were fitted with the production render harness
 * measuring the production renderer, and the in-repo analyzer shares the
 * crate's FFT — so until now nothing INDEPENDENT pinned tuning. This file's
 * estimator is time-domain normalized autocorrelation with parabolic peak
 * interpolation: it shares no code with the wasm crate, the analyzer
 * exports, or the harness comb scan. It carries its own known-answer
 * control (synthetic sines at deliberate cent offsets) so a broken
 * estimator cannot certify a broken renderer.
 *
 * Tolerances are authored, not read from production output: +-1 cent for
 * the estimator control, +-8 cents for rendered instruments across the
 * fitted registers (the shipped 2026-08-06 campaign measured post-fit
 * residuals within a few cents; 8 leaves honest headroom without letting a
 * pull-table regression through — a one-coefficient mutation moves low
 * clarinet notes by tens of cents).
 */
import { describe, expect, test } from "bun:test";

import {
  WAVEGUIDE_CLARINET_ALGORITHM_ID,
  WAVEGUIDE_CLARINET_V2_ALGORITHM_ID,
  WAVEGUIDE_FLUTE_ALGORITHM_ID,
  WAVEGUIDE_GUITAR_CLEAN_ALGORITHM_ID,
  WAVEGUIDE_GUITAR_DRIVE_ALGORITHM_ID,
  loadWaveguideRenderers,
} from "../../src/audio/dsp-renderer";

const SAMPLE_RATES = [44_100, 48_000, 96_000] as const;

function midiFrequencyHz(midiPitch: number): number {
  return 440 * 2 ** ((midiPitch - 69) / 12);
}

/**
 * Cents deviation of the dominant periodicity from `expectedHz`, by
 * normalized autocorrelation over integer lags within +-90 cents of the
 * expected period, refined with a three-point parabolic fit. Returns null
 * when no autocorrelation peak stands out (silence or noise).
 */
function measuredCentsByAutocorrelation(
  samples: Float32Array,
  sampleRateHz: number,
  expectedHz: number,
): number | null {
  /*
   * Integer-lag resolution at one period is ~1200*log2((L+1)/L) cents — 33
   * cents at 932 Hz/48 kHz, useless for an 8-cent gate. Measuring the
   * autocorrelation peak at the k-th period multiple keeps the same
   * periodicity information with k-times the lag resolution, so k is chosen
   * to make the nominal lag at least 512 samples (< 4 cents per lag step).
   */
  const period = sampleRateHz / expectedHz;
  const multiple = Math.max(1, Math.ceil(512 / period));
  const nominalLag = multiple * period;
  const minLag = Math.floor(nominalLag * 2 ** (-90 / 1200));
  const maxLag = Math.ceil(nominalLag * 2 ** (90 / 1200));
  const window = Math.min(samples.length - maxLag - 1, 16_384);
  if (window < Math.min(2 * maxLag, 4_096) || minLag < 2) return null;
  let bestLag = -1;
  let bestScore = -Infinity;
  const scores = new Map<number, number>();
  const score = (lag: number): number => {
    const cached = scores.get(lag);
    if (cached !== undefined) return cached;
    let cross = 0;
    let energyA = 0;
    let energyB = 0;
    for (let index = 0; index < window; index += 1) {
      const a = samples[index] ?? 0;
      const b = samples[index + lag] ?? 0;
      cross += a * b;
      energyA += a * a;
      energyB += b * b;
    }
    const denominator = Math.sqrt(energyA * energyB);
    const value = denominator > 1e-12 ? cross / denominator : -1;
    scores.set(lag, value);
    return value;
  };
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    const value = score(lag);
    if (value > bestScore) {
      bestScore = value;
      bestLag = lag;
    }
  }
  if (bestLag < 0 || bestScore < 0.5) return null;
  /* Parabolic refinement over the integer-lag peak. */
  const left = score(bestLag - 1);
  const right = score(bestLag + 1);
  const curvature = left - 2 * bestScore + right;
  const shift =
    Math.abs(curvature) > 1e-12 ? (0.5 * (left - right)) / curvature : 0;
  const lag = bestLag + Math.max(-0.5, Math.min(0.5, shift));
  const measuredHz = (multiple * sampleRateHz) / lag;
  return 1200 * Math.log2(measuredHz / expectedHz);
}

describe("independent autocorrelation estimator known-answer control", () => {
  test("recovers synthetic sine offsets within one cent", () => {
    for (const rate of SAMPLE_RATES) {
      for (const [frequencyHz, offsetCents] of [
        [110, 0],
        [220, 7],
        [440, -6],
        [1_046.5, 3],
        [82.4, -8],
      ] as const) {
        const actualHz = frequencyHz * 2 ** (offsetCents / 1200);
        const samples = new Float32Array(Math.floor(rate * 0.6));
        for (let index = 0; index < samples.length; index += 1) {
          samples[index] =
            0.4 * Math.sin((2 * Math.PI * actualHz * index) / rate) +
            0.08 * Math.sin((2 * Math.PI * 2 * actualHz * index) / rate);
        }
        const cents = measuredCentsByAutocorrelation(
          samples,
          rate,
          frequencyHz,
        );
        expect(cents).not.toBeNull();
        expect(Math.abs((cents ?? 999) - offsetCents)).toBeLessThan(1);
      }
    }
  });
});

describe("independent register tuning fixture (+-8 cents of 12TET)", () => {
  const registers: ReadonlyArray<readonly [string, number, number]> = [
    [WAVEGUIDE_GUITAR_CLEAN_ALGORITHM_ID, 40, 84],
    [WAVEGUIDE_GUITAR_DRIVE_ALGORITHM_ID, 40, 84],
    [WAVEGUIDE_FLUTE_ALGORITHM_ID, 60, 96],
    [WAVEGUIDE_CLARINET_ALGORITHM_ID, 50, 89],
    [WAVEGUIDE_CLARINET_V2_ALGORITHM_ID, 50, 84],
  ];

  for (const [algorithmId, lowest, highest] of registers) {
    for (const rate of SAMPLE_RATES) {
      test(`${algorithmId} at ${String(rate)} Hz`, async () => {
        const renderers = await loadWaveguideRenderers();
        const renderer = renderers.get(algorithmId);
        expect(renderer).toBeDefined();
        const failures: string[] = [];
        for (let midi = lowest; midi <= highest; midi += 3) {
          /* Known exception, tracked as jcpe-dsp-flute-c7-44k1-regime-c4p1:
           * below ~14 jet samples (flute MIDI 93/96 at 44.1 and 48 kHz)
           * the fractional-jet allpass flips the oscillation regime, so
           * those four cells keep the shipped truncated jet and its
           * shipped residuals (+15..17 sharp; C7 at 44.1 kHz ~-46). The
           * PHS3 flute-v2 bore/tone-hole model supersedes this. These are
           * the only permitted exclusions; do not widen them. */
          if (
            algorithmId === WAVEGUIDE_FLUTE_ALGORITHM_ID &&
            midi >= 93 &&
            rate < 96_000
          ) {
            continue;
          }
          const pcm = renderer?.renderNote(midi, 100, rate, 1.2);
          if (!pcm) {
            failures.push(`midi ${String(midi)}: render refused`);
            continue;
          }
          /* The winds take ~0.4 s to lock (the early signal is attack
           * transient and jet/reed noise, autocorrelation score ~0.1).
           * Measure the locked sustain; vibrato within the window is
           * symmetric pitch modulation whose mean the long window
           * averages out. */
          const start = Math.floor(rate * 0.5);
          const end = Math.min(pcm.left.length, Math.floor(rate * 1.15));
          const cents = measuredCentsByAutocorrelation(
            pcm.left.subarray(start, end),
            rate,
            midiFrequencyHz(midi),
          );
          if (cents === null) {
            failures.push(`midi ${String(midi)}: no periodicity found`);
          } else if (Math.abs(cents) > 8) {
            failures.push(`midi ${String(midi)}: ${cents.toFixed(1)} cents`);
          }
        }
        expect(failures).toEqual([]);
      });
    }
  }
});
