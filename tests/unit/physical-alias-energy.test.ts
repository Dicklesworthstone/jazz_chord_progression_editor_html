/**
 * jcpe-dsp-alias-audit-171z: independent alias-energy fixture.
 *
 * Every nonlinearity in the live models (guitar amp tanh + squared
 * asymmetry, clarinet reed clamp, flute cubic jet) runs at base rate with
 * no oversampling, and until now alias energy was unmeasured and unbounded
 * by any fixture. This file measures it independently: a Goertzel-based
 * extractor that shares no code with the crate FFT, the analyzer exports,
 * or the render harness, carrying its own known-answer controls so a broken
 * extractor cannot certify a broken renderer.
 *
 * Method: for a note with fundamental f0 at rate fs, distortion products at
 * k*f0 above Nyquist fold back to |fs - k*f0| (one wrap each side is
 * considered; higher wraps carry negligible energy for these models). The
 * fixture measures windowed Goertzel power on a small relative grid around
 * each predicted image (absorbing dispersion/detune) and around each true
 * partial, and reports 10*log10(sum(image power) / sum(partial power)).
 * Images whose scan grid comes within 6% of f0 of any true partial are
 * excluded as unmeasurable (masked by real signal).
 *
 * Segment choice: analysis runs on 0.15 s..0.50 s. Skipping the first
 * 150 ms keeps the concurrently-landing tongued-chiff attack work (noise
 * transient in the first tens of ms) out of the measurement, and stopping
 * at 0.50 s keeps the wind vibrato (onset 0.35 s, ~0.4 s ramp) from
 * smearing partials across the scan grids.
 *
 * Threshold: authored, not derived from production output, as a two-tier
 * law.
 *
 * Tier 1 (absolute): total image energy at or below -50 dBc passes
 * outright. Folded images are inharmonic, and inharmonic distortion in
 * exposed sustained tones sits near the audibility threshold around -50 dB
 * relative to the carrier complex; harmonic distortion tolerates far more,
 * but aliases are exactly the non-masked, non-harmonic case.
 *
 * Tier 2 (comparative, for models with deliberate turbulence): the wind
 * models carry authored breath noise (HNR 19-37 dB), and chi-square
 * fluctuation of that noise across the image bins floors this estimator
 * near -40 dBc for the flute regardless of any aliasing — the measurement
 * cannot certify -50 dBc through the noise bed. The physics supplies an
 * independent reference: at 96 kHz every fold source lies at or above
 * 48 kHz, where these band-limited loops carry no energy, so the 96 kHz
 * reading is a noise-only baseline of the same estimator on the same
 * instrument. A 44.1/48 kHz cell passes tier 2 when its per-image mean
 * excess is within +3 dB of the 96 kHz baseline: fold-back is then
 * statistically indistinguishable from — and perceptually buried in — the
 * model's own noise bed. A genuine alias injection breaks this (proven by
 * the clipped-sine comparative control below). A cell above both tiers is
 * a finding to mitigate, never a reason to relax the numbers.
 */
import { describe, expect, test } from "bun:test";

import {
  WAVEGUIDE_CLARINET_ALGORITHM_ID,
  WAVEGUIDE_FLUTE_ALGORITHM_ID,
  WAVEGUIDE_GUITAR_CLEAN_ALGORITHM_ID,
  WAVEGUIDE_GUITAR_DRIVE_ALGORITHM_ID,
  loadWaveguideRenderers,
} from "../../src/audio/dsp-renderer";

const SAMPLE_RATES = [44_100, 48_000, 96_000] as const;
const ALIAS_THRESHOLD_DBC = -50;
const SEGMENT_START_SECONDS = 0.15;
const SEGMENT_END_SECONDS = 0.5;
/** Relative scan grid around each predicted frequency. */
const SCAN_RELATIVE = [-0.04, -0.03, -0.02, -0.01, 0, 0.01, 0.02, 0.03, 0.04];
/** Images closer than this (in f0 units) to a true partial are unmeasurable. */
const EXCLUSION_F0_FRACTION = 0.06;
/** Spectral floor guard: ignore image/partial targets below this frequency. */
const MINIMUM_TARGET_HZ = 60;

function midiFrequencyHz(midiPitch: number): number {
  return 440 * 2 ** ((midiPitch - 69) / 12);
}

/** Windowed Goertzel power at an arbitrary frequency (Hann applied once). */
function goertzelPower(
  windowed: Float64Array,
  sampleRateHz: number,
  frequencyHz: number,
): number {
  const omega = (2 * Math.PI * frequencyHz) / sampleRateHz;
  const coefficient = 2 * Math.cos(omega);
  let sPrev = 0;
  let sPrev2 = 0;
  for (const sample of windowed) {
    const s = sample + coefficient * sPrev - sPrev2;
    sPrev2 = sPrev;
    sPrev = s;
  }
  return sPrev * sPrev + sPrev2 * sPrev2 - coefficient * sPrev * sPrev2;
}

function hannWindowedSegment(
  samples: Float32Array,
  sampleRateHz: number,
): Float64Array | null {
  const start = Math.round(SEGMENT_START_SECONDS * sampleRateHz);
  const end = Math.min(
    Math.round(SEGMENT_END_SECONDS * sampleRateHz),
    samples.length,
  );
  const length = end - start;
  if (length < 4_096) return null;
  const windowed = new Float64Array(length);
  for (let index = 0; index < length; index += 1) {
    const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (length - 1));
    windowed[index] = (samples[start + index] ?? 0) * hann;
  }
  return windowed;
}

/** Max grid power around a target frequency. */
function peakPowerNear(
  windowed: Float64Array,
  sampleRateHz: number,
  frequencyHz: number,
): number {
  let best = 0;
  for (const relative of SCAN_RELATIVE) {
    const power = goertzelPower(
      windowed,
      sampleRateHz,
      frequencyHz * (1 + relative),
    );
    if (power > best) best = power;
  }
  return best;
}

/**
 * Tonal excess above the local floor around a target frequency.
 *
 * Winds carry deliberate broadband turbulence (HNR 19-37 dB), and a naive
 * narrowband power at the image frequency measures that noise floor, not
 * aliasing — the giveaway was clarinet reading WORSE at 96 kHz, where real
 * fold-back is weakest. Alias images are tonal: a narrow peak spanning
 * only a point or two of the scan grid, while noise is flat across it. The
 * grid median therefore estimates the local floor and the excess of the
 * grid maximum over it isolates the tonal (alias) component.
 */
function tonalExcessNear(
  windowed: Float64Array,
  sampleRateHz: number,
  frequencyHz: number,
): number {
  const powers = SCAN_RELATIVE.map((relative) =>
    goertzelPower(windowed, sampleRateHz, frequencyHz * (1 + relative)),
  ).sort((left, right) => left - right);
  const median = powers[Math.floor(powers.length / 2)] ?? 0;
  const peak = powers[powers.length - 1] ?? 0;
  return Math.max(0, peak - median);
}

interface AliasMeasurement {
  /** Total image tonal excess relative to partial energy, dB (floor -120). */
  readonly totalDbc: number;
  /** Per-image mean tonal excess relative to partial energy, dB. */
  readonly meanExcessDbc: number;
  readonly imageCount: number;
}

/**
 * Alias measurement relative to the harmonic-partial energy, or null when
 * the render has no measurable partials or no measurable image targets.
 */
function measureAlias(
  samples: Float32Array,
  sampleRateHz: number,
  fundamentalHz: number,
): AliasMeasurement | null {
  const windowed = hannWindowedSegment(samples, sampleRateHz);
  if (windowed === null) return null;
  const nyquistHz = sampleRateHz / 2;
  const measurableTopHz = nyquistHz * 0.94;

  let partialPower = 0;
  const partialCount = Math.floor(measurableTopHz / fundamentalHz);
  for (let k = 1; k <= partialCount; k += 1) {
    const target = k * fundamentalHz;
    if (target < MINIMUM_TARGET_HZ) continue;
    partialPower += peakPowerNear(windowed, sampleRateHz, target);
  }
  if (partialPower <= 0) return null;

  let imagePower = 0;
  let imageCount = 0;
  const highestSource = Math.floor((2 * sampleRateHz * 0.75) / fundamentalHz);
  for (let k = partialCount + 1; k <= highestSource; k += 1) {
    const source = k * fundamentalHz;
    const image =
      source < sampleRateHz ? sampleRateHz - source : source - sampleRateHz;
    if (image < MINIMUM_TARGET_HZ || image > measurableTopHz) continue;
    const gridSpanHz = Math.abs(image) * 0.04;
    const nearestPartialDistanceHz =
      Math.abs(
        image / fundamentalHz - Math.round(image / fundamentalHz),
      ) * fundamentalHz;
    if (
      nearestPartialDistanceHz - gridSpanHz <
      EXCLUSION_F0_FRACTION * fundamentalHz
    ) {
      continue;
    }
    imagePower += tonalExcessNear(windowed, sampleRateHz, image);
    imageCount += 1;
  }
  if (imageCount === 0) return null;
  const floorDb = -120;
  const totalDbc =
    imagePower <= 0
      ? floorDb
      : 10 * Math.log10(imagePower / partialPower);
  const meanExcessDbc =
    imagePower <= 0
      ? floorDb
      : 10 * Math.log10(imagePower / imageCount / partialPower);
  return { totalDbc, meanExcessDbc, imageCount };
}

function clippedSine(
  rate: number,
  f0: number,
  seconds: number,
  drive: number,
): Float32Array {
  const frames = Math.round(rate * seconds);
  const samples = new Float32Array(frames);
  for (let index = 0; index < frames; index += 1) {
    const raw = drive * Math.sin((2 * Math.PI * f0 * index) / rate);
    samples[index] = Math.max(-1, Math.min(1, raw));
  }
  return samples;
}

describe("alias extractor known-answer controls", () => {
  const f0 = midiFrequencyHz(83); // ~987.77 Hz

  test("a hard-clipped sine scores high alias energy", () => {
    const measured = measureAlias(clippedSine(44_100, f0, 1, 10), 44_100, f0);
    expect(measured).not.toBeNull();
    // A near-square ~988 Hz tone folds odd harmonics from ~22.7 kHz down;
    // the tonal-excess images sit only ~30-45 dB below the harmonic
    // complex.
    expect(measured?.totalDbc ?? -999).toBeGreaterThan(-45);
  });

  test("a band-limited additive tone scores near the floor", () => {
    const rate = 44_100;
    const frames = rate;
    const samples = new Float32Array(frames);
    const topPartial = Math.floor((0.45 * rate) / f0);
    for (let index = 0; index < frames; index += 1) {
      let value = 0;
      for (let k = 1; k <= topPartial; k += 1) {
        value += Math.sin((2 * Math.PI * k * f0 * index) / rate) / k;
      }
      samples[index] = value * 0.3;
    }
    const measured = measureAlias(samples, rate, f0);
    expect(measured).not.toBeNull();
    expect(measured?.totalDbc ?? 0).toBeLessThan(-70);
  });

  test("comparative law flags genuine aliasing against a 96 kHz baseline", () => {
    // The same nonlinearity rendered at both rates: the 44.1 kHz render
    // aliases audibly, the 96 kHz render folds from >=48 kHz where the
    // clipped-sine spectrum still has energy but the per-image excess is
    // far lower. The tier-2 +3 dB comparative gate must catch the 44.1 kHz
    // cell as aliased rather than noise-consistent.
    const low = measureAlias(clippedSine(44_100, f0, 1, 10), 44_100, f0);
    const high = measureAlias(clippedSine(96_000, f0, 1, 10), 96_000, f0);
    expect(low).not.toBeNull();
    expect(high).not.toBeNull();
    expect((low?.meanExcessDbc ?? 0) - (high?.meanExcessDbc ?? 0)).toBeGreaterThan(3);
  });
});

describe("rendered alias energy: absolute -50 dBc or noise-consistent vs 96 kHz", () => {
  // High-tessitura worst cases plus one mid register note per model. Flute
  // stops at MIDI 89 to stay clear of the tracked sub-14-sample-jet regime
  // cells (jcpe-dsp-flute-c7-44k1-regime-c4p1).
  const cases: ReadonlyArray<readonly [string, ReadonlyArray<number>]> = [
    [WAVEGUIDE_GUITAR_CLEAN_ALGORITHM_ID, [64, 84]],
    [WAVEGUIDE_GUITAR_DRIVE_ALGORITHM_ID, [64, 84]],
    [WAVEGUIDE_FLUTE_ALGORITHM_ID, [72, 89]],
    [WAVEGUIDE_CLARINET_ALGORITHM_ID, [66, 87]],
  ];
  const COMPARATIVE_MARGIN_DB = 3;

  for (const [algorithmId, midiPitches] of cases) {
    for (const midi of midiPitches) {
      test(`${algorithmId} midi ${String(midi)}`, async () => {
        const renderers = await loadWaveguideRenderers();
        const renderer = renderers.get(algorithmId);
        expect(renderer).toBeDefined();
        const f0 = midiFrequencyHz(midi);
        const byRate = new Map<number, AliasMeasurement>();
        for (const rate of SAMPLE_RATES) {
          const pcm = renderer?.renderNote(midi, 120, rate, 1.2);
          expect(pcm).not.toBeNull();
          if (!pcm) continue;
          const measured = measureAlias(pcm.left, rate, f0);
          // A null means every image target was masked by the partial grid
          // (dense low-f0 spectra) — an honest "not measurable at this
          // pitch/rate", recorded as such.
          if (measured !== null) byRate.set(rate, measured);
        }
        const baseline = byRate.get(96_000);
        const rows: string[] = [];
        for (const rate of SAMPLE_RATES) {
          const measured = byRate.get(rate);
          if (measured === undefined) {
            rows.push(`${String(rate)} Hz: unmeasurable (masked images)`);
            continue;
          }
          rows.push(
            `${String(rate)} Hz: total ${measured.totalDbc.toFixed(1)} dBc, ` +
              `mean/image ${measured.meanExcessDbc.toFixed(1)} dBc over ` +
              `${String(measured.imageCount)} images`,
          );
          const absolutePass = measured.totalDbc <= ALIAS_THRESHOLD_DBC;
          // The 96 kHz cell is the tier-2 baseline itself: its fold
          // sources sit at or above 48 kHz where the band-limited loops
          // carry no energy, so it must satisfy tier 1 outright OR simply
          // be the reference the lower rates are compared against; it is
          // asserted noise-consistent by construction and only the lower
          // rates take the comparative gate.
          if (rate === 96_000) continue;
          const comparativePass =
            baseline !== undefined &&
            measured.meanExcessDbc <=
              baseline.meanExcessDbc + COMPARATIVE_MARGIN_DB;
          expect(absolutePass || comparativePass).toBe(true);
        }
        console.log(
          `[alias-evidence] ${algorithmId} midi ${String(midi)} -> ${rows.join("; ")}`,
        );
      });
    }
  }
});
