import { describe, expect, test } from "bun:test";

import {
  VIBES_REPLACEMENT_POLICY,
  analyzeReplacementOutput,
  evaluateReplacementOutput,
  replacementDynamicsPasses,
  replacementProximityPasses,
  temporalPeakSeconds,
  verifySampleReplacementEvidence,
  type ReplacementOutputFeatures,
} from "../../scripts/run-sample-replacement-gate";
import { loadSampledInstrumentRenderer } from "../../src/audio/sampled-renderer";
import staleVibesEvidence from "../../release-evidence/audio/listening/vibes-replacement-evidence.json";

const SAMPLE_RATE_HZ = 48_000;

function toneWithEnvelope(
  peakStartSeconds: number,
  frequencyHz = 261.625565,
): Float32Array {
  const samples = new Float32Array(SAMPLE_RATE_HZ);
  const peakStart = Math.round(peakStartSeconds * SAMPLE_RATE_HZ);
  const peakEnd = peakStart + Math.round(0.02 * SAMPLE_RATE_HZ);
  for (let index = 0; index < samples.length; index += 1) {
    const amplitude = index >= peakStart && index < peakEnd ? 0.8 : 0.08;
    samples[index] = amplitude * Math.sin(
      (2 * Math.PI * frequencyHz * index) / SAMPLE_RATE_HZ,
    );
  }
  return samples;
}

function healthyFeatures(): ReplacementOutputFeatures {
  return {
    pitchCents: 0,
    periodicity: 0.98,
    earlyRms: 0.1,
    lateToEarlyRmsRatio: 0.2,
    temporalPeakSeconds: 0.05,
    peak: 0.5,
  };
}

describe("sample-replacement temporal character", () => {
  test("checked-in vibraphone references earn a delayed 20 ms energy maximum", () => {
    const renderer = loadSampledInstrumentRenderer(
      "changes.dsp.sampled-vibraphone@1",
    );
    const expectedPeakSeconds = new Map<number, number>([
      [53, 0.05],
      [60, 0.07],
      [67, 0.04],
      [74, 0.05],
      [84, 0.1],
    ]);
    for (const [midi, expected] of expectedPeakSeconds) {
      const pcm = renderer.renderNote(midi, 110, SAMPLE_RATE_HZ, 4);
      expect(pcm).not.toBeNull();
      if (pcm === null) continue;
      const measured = temporalPeakSeconds(
        VIBES_REPLACEMENT_POLICY,
        pcm.left,
        pcm.sampleRateHz,
      );
      expect(measured).toBeCloseTo(expected, 9);
      expect(measured).toBeGreaterThanOrEqual(
        VIBES_REPLACEMENT_POLICY.minimumTemporalPeakSeconds,
      );
    }
  });

  test("too-early and too-late rings fail while a corpus-timed bloom passes", () => {
    const immediate = temporalPeakSeconds(
      VIBES_REPLACEMENT_POLICY,
      toneWithEnvelope(0),
      SAMPLE_RATE_HZ,
    );
    const delayedSamples = toneWithEnvelope(0.05);
    const delayed = temporalPeakSeconds(
      VIBES_REPLACEMENT_POLICY,
      delayedSamples,
      SAMPLE_RATE_HZ,
    );
    expect(immediate).toBe(0);
    expect(delayed).toBeCloseTo(0.05, 9);
    expect(evaluateReplacementOutput(VIBES_REPLACEMENT_POLICY, {
      ...healthyFeatures(),
      temporalPeakSeconds: immediate,
    }).map((finding) => finding.code)).toContain(
      "REPLACEMENT_TEMPORAL_CHARACTER",
    );
    expect(evaluateReplacementOutput(VIBES_REPLACEMENT_POLICY, {
      ...healthyFeatures(),
      temporalPeakSeconds: delayed,
    })).toEqual([]);
    expect(evaluateReplacementOutput(VIBES_REPLACEMENT_POLICY, {
      ...healthyFeatures(),
      temporalPeakSeconds:
        VIBES_REPLACEMENT_POLICY.maximumTemporalPeakSeconds + 0.01,
    }).map((finding) => finding.code)).toContain(
      "REPLACEMENT_TEMPORAL_CHARACTER",
    );

    const analyzed = analyzeReplacementOutput(
      VIBES_REPLACEMENT_POLICY,
      delayedSamples,
      SAMPLE_RATE_HZ,
      60,
    );
    expect(analyzed.temporalPeakSeconds).toBeCloseTo(0.05, 9);
  });

  test("non-finite features fail closed instead of bypassing comparisons", () => {
    for (const [field, value] of [
      ["pitchCents", Number.NaN],
      ["periodicity", Number.POSITIVE_INFINITY],
      ["earlyRms", Number.NaN],
      ["lateToEarlyRmsRatio", Number.NEGATIVE_INFINITY],
      ["temporalPeakSeconds", Number.NaN],
      ["peak", Number.POSITIVE_INFINITY],
    ] as const) {
      const findings = evaluateReplacementOutput(VIBES_REPLACEMENT_POLICY, {
        ...healthyFeatures(),
        [field]: value,
      });
      expect(findings.map((finding) => finding.code)).toEqual([
        "REPLACEMENT_FEATURE_NONFINITE",
      ]);
    }
  });

  test("flat dynamics and a closer impostor fail the shared verdict laws", () => {
    expect(replacementDynamicsPasses(0.05, 0.08)).toBe(true);
    expect(replacementDynamicsPasses(0.05, 0.05)).toBe(false);
    expect(replacementDynamicsPasses(Number.NaN, 0.08)).toBe(false);

    expect(replacementProximityPasses(
      VIBES_REPLACEMENT_POLICY,
      0,
      4,
      6,
    )).toBe(true);
    expect(replacementProximityPasses(
      VIBES_REPLACEMENT_POLICY,
      0,
      4,
      3,
    )).toBe(false);
    expect(replacementProximityPasses(
      VIBES_REPLACEMENT_POLICY,
      Number.NaN,
      4,
      6,
    )).toBe(false);
  });

  test("legacy evidence cannot be silently reinterpreted under the current law", () => {
    expect(verifySampleReplacementEvidence(staleVibesEvidence)).toBe(false);
  });
});
