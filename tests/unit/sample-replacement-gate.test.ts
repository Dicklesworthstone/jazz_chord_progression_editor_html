import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";

import {
  SAMPLE_REPLACEMENT_EVIDENCE_SCHEMA,
  UPRIGHT_BASS_REPLACEMENT_POLICY,
  VIBES_REPLACEMENT_POLICY,
  analyzeReplacementOutput,
  decodeCorpusSlice,
  evaluateReplacementOutput,
  replacementDynamicsPasses,
  replacementProximityPasses,
  replacementSourcePaths,
  stereoPcmSha256,
  temporalPeakSeconds,
  verifySampleReplacementEvidence,
  verifySampleReplacementEvidenceAgainstReplay,
  type ReplacementOutputFeatures,
  type SampleReplacementEvidence,
  type SampleReplacementPolicy,
} from "../../scripts/run-sample-replacement-gate";
import { sha256Hex } from "../../scripts/reference-similarity";
import { loadSampledInstrumentRenderer } from "../../src/audio/sampled-renderer";
import { CONCERT_GRAND_WASM_SHA256 } from "../../src/audio/wasm/concert-grand-wasm";
import {
  UPRIGHT_BASS_SAMPLES_BASE64,
  UPRIGHT_BASS_SAMPLES_RATE_HZ,
  UPRIGHT_BASS_SAMPLES_SHA256,
  UPRIGHT_BASS_SAMPLES_SLICE_INDEX,
} from "../../src/audio/wasm/upright-bass-samples";
import { VIBRAPHONE_SAMPLES_SHA256 } from "../../src/audio/wasm/vibraphone-samples";
import staleVibesEvidence from "../../release-evidence/audio/listening/vibes-replacement-evidence.json";

const SAMPLE_RATE_HZ = 48_000;
const root = resolve(import.meta.dir, "../..");

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]));
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function passingReplacementEvidence(
  policy: SampleReplacementPolicy,
  pcmLabel: string,
  wasmSha256 = CONCERT_GRAND_WASM_SHA256,
): SampleReplacementEvidence {
  const sourceBindings = replacementSourcePaths(policy.instrument).map((path) => ({
    path,
    sha256: sha256Hex(new Uint8Array(readFileSync(resolve(root, path)))),
  }));
  const cells = policy.midi.flatMap((midi) =>
    policy.velocities.map((velocity, velocityIndex) => ({
      id: `m${String(midi)}v${String(velocity)}`,
      algorithmId: policy.algorithmId,
      midi,
      velocity,
      sampleRateHz: policy.sampleRateHz,
      pcmSha256: sha256Hex(`${pcmLabel}:m${String(midi)}v${String(velocity)}`),
      features: {
        pitchCents: 0,
        periodicity: 0.98,
        targetToneToPeakRatio: 0.2,
        earlyRms: velocityIndex === 0 ? 0.05 : 0.08,
        lateToEarlyRmsRatio: 0.2,
        temporalPeakSeconds: policy.minimumTemporalPeakSeconds,
        peak: 0.5,
      },
      outcome: "pass" as const,
      findings: [],
    })),
  );
  const dynamicsCells = policy.midi.map((midi) => ({
    id: `m${String(midi)}-dynamics`,
    midi,
    rmsRise: 0.03,
    outcome: "pass" as const,
  }));
  const proximityCells = policy.proximityMidi.map((midi) => ({
    id: `m${String(midi)}-proximity`,
    midi,
    corpusPitchCents: 0,
    candidateDistanceDb: 4,
    impostorDistanceDb: 6,
    marginDb: 2,
    outcome: "pass" as const,
  }));
  const controls = {
    outOfRangeRefused: true,
    wrongPitchRejected: true,
    aperiodicRejected: true,
    targetToneAbsentRejected: true,
    silentRejected: true,
    clippingRejected: true,
    sustainedRejected: true,
    immediateRingRejected: true,
    lateRingRejected: true,
    flatDynamicsRejected: true,
    impostorRejected: true,
  } as const;
  const unsigned = {
    schema: SAMPLE_REPLACEMENT_EVIDENCE_SCHEMA,
    policy,
    algorithmIds: [policy.algorithmId],
    wasmSha256,
    corpusSha256: policy.instrument === "vibes"
      ? VIBRAPHONE_SAMPLES_SHA256
      : UPRIGHT_BASS_SAMPLES_SHA256,
    sourceBindings,
    sourceClosureSha256: sha256Hex(canonicalJson(sourceBindings)),
    cells,
    dynamicsCells,
    proximityCells,
    controls,
    summary: {
      outcome: "pass" as const,
      passedCellCount: cells.length,
      passedDynamicsCellCount: dynamicsCells.length,
      passedProximityCellCount: proximityCells.length,
    },
  };
  return {
    ...unsigned,
    evidenceSha256: sha256Hex(canonicalJson(unsigned)),
  };
}

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
    targetToneToPeakRatio: 0.2,
    earlyRms: 0.1,
    lateToEarlyRmsRatio: 0.2,
    temporalPeakSeconds: 0.05,
    peak: 0.5,
  };
}

describe("sample-replacement temporal character", () => {
  test("corpus decoding composes a nonzero view offset with a nonzero slice offset", () => {
    const storage = new Uint8Array(16);
    const payload = storage.subarray(3, 11);
    const view = new DataView(storage.buffer);
    view.setInt16(3 + 2, 16_384, true);
    view.setInt16(3 + 4, -8_192, true);
    expect(decodeCorpusSlice(payload, {
      midiPitch: 60,
      tuningCents: 0,
      byteOffset: 2,
      frameCount: 2,
    })).toEqual(new Float32Array([0.5, -0.25]));
  });

  test("PCM evidence binds both stereo channels rather than only their mono sum", () => {
    const common = {
      sampleRateHz: SAMPLE_RATE_HZ,
      frameCount: 2,
    } as const;
    const leftHeavy = {
      ...common,
      left: new Float32Array([0.75, -0.25]),
      right: new Float32Array([0.25, 0.25]),
    };
    const rightHeavyWithSameMono = {
      ...common,
      left: new Float32Array([0.25, 0.25]),
      right: new Float32Array([0.75, -0.25]),
    };
    expect(stereoPcmSha256(leftHeavy)).not.toBe(
      stereoPcmSha256(rightHeavyWithSameMono),
    );
  });

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
      expect(analyzeReplacementOutput(
        VIBES_REPLACEMENT_POLICY,
        pcm.left,
        pcm.sampleRateHz,
        midi,
      ).targetToneToPeakRatio).toBeGreaterThanOrEqual(
        VIBES_REPLACEMENT_POLICY.minimumTargetToneToPeakRatio,
      );
    }
  });

  test("checked-in upright references reject a string-only immediate maximum", () => {
    const renderer = loadSampledInstrumentRenderer(
      "changes.dsp.sampled-upright-bass@1",
    );
    const expectedPeakSeconds = new Map<number, number>([
      [28, 0.53],
      [33, 0.07],
      [38, 0.1],
      [43, 0.13],
    ]);
    for (const [midi, expected] of expectedPeakSeconds) {
      const pcm = renderer.renderNote(midi, 110, SAMPLE_RATE_HZ, 3);
      expect(pcm).not.toBeNull();
      if (pcm === null) continue;
      const measured = temporalPeakSeconds(
        UPRIGHT_BASS_REPLACEMENT_POLICY,
        pcm.left,
        pcm.sampleRateHz,
      );
      expect(measured).toBeCloseTo(expected, 9);
      expect(measured).toBeGreaterThanOrEqual(
        UPRIGHT_BASS_REPLACEMENT_POLICY.minimumTemporalPeakSeconds,
      );
      expect(analyzeReplacementOutput(
        UPRIGHT_BASS_REPLACEMENT_POLICY,
        pcm.left,
        pcm.sampleRateHz,
        midi,
      ).targetToneToPeakRatio).toBeGreaterThanOrEqual(
        UPRIGHT_BASS_REPLACEMENT_POLICY.minimumTargetToneToPeakRatio,
      );
    }

    expect(evaluateReplacementOutput(UPRIGHT_BASS_REPLACEMENT_POLICY, {
      ...healthyFeatures(),
      temporalPeakSeconds: 0,
    }).map((finding) => finding.code)).toContain(
      "REPLACEMENT_TEMPORAL_CHARACTER",
    );
  });

  test("every overlapping upright slice earns the same-pitch impostor matrix", () => {
    expect(UPRIGHT_BASS_REPLACEMENT_POLICY.proximityMidi).toEqual([
      40,
      42,
      45,
      49,
      52,
      56,
      59,
    ]);
    const bytes = Uint8Array.from(
      atob(UPRIGHT_BASS_SAMPLES_BASE64),
      (character) => character.charCodeAt(0),
    );
    for (const midi of UPRIGHT_BASS_REPLACEMENT_POLICY.proximityMidi) {
      const slice = UPRIGHT_BASS_SAMPLES_SLICE_INDEX.find(
        (entry) => entry.midiPitch === midi,
      );
      expect(slice).toBeDefined();
      if (slice === undefined) continue;
      const features = analyzeReplacementOutput(
        UPRIGHT_BASS_REPLACEMENT_POLICY,
        decodeCorpusSlice(bytes, slice),
        UPRIGHT_BASS_SAMPLES_RATE_HZ,
        midi,
      );
      expect(Math.abs(features.pitchCents - slice.tuningCents)).toBeLessThanOrEqual(35);
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

  test("a tuned but nonperiodic source cannot pass the replacement gate", () => {
    const findings = evaluateReplacementOutput(VIBES_REPLACEMENT_POLICY, {
      ...healthyFeatures(),
      periodicity: 0.1,
    });
    expect(findings.map((finding) => finding.code)).toContain(
      "REPLACEMENT_APERIODIC",
    );
  });

  test("non-finite features fail closed instead of bypassing comparisons", () => {
    for (const [field, value] of [
      ["pitchCents", Number.NaN],
      ["periodicity", Number.POSITIVE_INFINITY],
      ["targetToneToPeakRatio", Number.NaN],
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

  test("an octave-only signal cannot masquerade as the requested bass fundamental", () => {
    const octaveOnly = toneWithEnvelope(0.07, 2 * 41.20344461410875);
    const features = analyzeReplacementOutput(
      UPRIGHT_BASS_REPLACEMENT_POLICY,
      octaveOnly,
      SAMPLE_RATE_HZ,
      28,
    );
    expect(features.targetToneToPeakRatio).toBeLessThan(
      UPRIGHT_BASS_REPLACEMENT_POLICY.minimumTargetToneToPeakRatio,
    );
    expect(evaluateReplacementOutput(
      UPRIGHT_BASS_REPLACEMENT_POLICY,
      features,
    ).map((finding) => finding.code)).toContain(
      "REPLACEMENT_TARGET_TONE_ABSENT",
    );
  });

  test("source closure includes every transitive physical model and authority input", () => {
    expect(replacementSourcePaths("upright-bass")).toEqual([
      "scripts/run-sample-replacement-gate.ts",
      "scripts/reference-similarity.ts",
      "src/audio/dsp-renderer.ts",
      "src/audio/wasm/concert-grand-wasm.ts",
      "dsp/concert-grand/Cargo.toml",
      "dsp/concert-grand/Cargo.lock",
      "dsp/concert-grand/rust-toolchain.toml",
      "dsp/concert-grand/src/lib.rs",
      "dsp/concert-grand/src/plucked_v2.rs",
      "dsp/concert-grand/src/upright_bass_body.rs",
      "scripts/validate-phs4-contract.ts",
      "tests/fixtures/plucked-string-v2/contract.json",
      "tests/fixtures/plucked-string-v2/instrument-packs.json",
      "tests/fixtures/plucked-string-v2/physics-cases.json",
      "tests/fixtures/plucked-string-v2/metric-cases.json",
      "tests/fixtures/plucked-string-v2/provenance-ledger.json",
      "tests/fixtures/plucked-string-v2/trace-ledger.json",
      "tests/fixtures/plucked-string-v2/mutation-controls.json",
      "src/audio/wasm/upright-bass-samples.ts",
    ]);
    expect(replacementSourcePaths("vibes")).toEqual([
      "scripts/run-sample-replacement-gate.ts",
      "scripts/reference-similarity.ts",
      "src/audio/dsp-renderer.ts",
      "src/audio/wasm/concert-grand-wasm.ts",
      "dsp/concert-grand/Cargo.toml",
      "dsp/concert-grand/Cargo.lock",
      "dsp/concert-grand/rust-toolchain.toml",
      "dsp/concert-grand/src/lib.rs",
      "dsp/concert-grand/src/vibes_v2.rs",
      "dsp/concert-grand/src/vibes_v2_eigenpack.rs",
      "scripts/generate-vibraphone-v2-eigenpack.ts",
      "scripts/validate-phs6-contract.ts",
      "physical/parameter-packs/vibraphone-v2-eigenpack.json",
      "physical/parameter-packs/vibraphone-v2-modal-authority.json",
      "tests/fixtures/vibraphone-v2/contract.json",
      "tests/fixtures/vibraphone-v2/bar-cases.json",
      "tests/fixtures/vibraphone-v2/physics-cases.json",
      "tests/fixtures/vibraphone-v2/metric-cases.json",
      "tests/fixtures/vibraphone-v2/provenance-ledger.json",
      "tests/fixtures/vibraphone-v2/trace-ledger.json",
      "tests/fixtures/vibraphone-v2/mutation-controls.json",
      "src/audio/wasm/vibraphone-samples.ts",
    ]);
  });

  test("flat dynamics and a closer impostor fail the shared verdict laws", () => {
    expect(replacementDynamicsPasses(
      VIBES_REPLACEMENT_POLICY,
      0.05,
      0.08,
    )).toBe(true);
    expect(replacementDynamicsPasses(
      VIBES_REPLACEMENT_POLICY,
      0.05,
      0.0505,
    )).toBe(false);
    expect(replacementDynamicsPasses(
      VIBES_REPLACEMENT_POLICY,
      0.05,
      0.05,
    )).toBe(false);
    expect(replacementDynamicsPasses(
      VIBES_REPLACEMENT_POLICY,
      Number.NaN,
      0.08,
    )).toBe(false);

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

  test("shipping evidence must exactly equal an immutable-WASM replay", () => {
    const replay = passingReplacementEvidence(VIBES_REPLACEMENT_POLICY, "replay");
    const differentValidRun = passingReplacementEvidence(
      VIBES_REPLACEMENT_POLICY,
      "different-valid-run",
    );
    expect(verifySampleReplacementEvidence(replay, root)).toBe(true);
    expect(verifySampleReplacementEvidence(differentValidRun, root)).toBe(true);
    expect(verifySampleReplacementEvidenceAgainstReplay(replay, replay, root)).toBe(true);
    expect(verifySampleReplacementEvidenceAgainstReplay(
      differentValidRun,
      replay,
      root,
    )).toBe(false);
  });

  test("candidate evidence verifies semantically but cannot authorize different shipping bytes", () => {
    const candidateWasmSha256 = sha256Hex("candidate-wasm-bytes");
    const candidate = passingReplacementEvidence(
      VIBES_REPLACEMENT_POLICY,
      "candidate",
      candidateWasmSha256,
    );
    const shippingReplay = passingReplacementEvidence(
      VIBES_REPLACEMENT_POLICY,
      "candidate",
    );
    expect(verifySampleReplacementEvidence(candidate, root)).toBe(true);
    expect(verifySampleReplacementEvidenceAgainstReplay(
      candidate,
      candidate,
      root,
    )).toBe(true);
    expect(verifySampleReplacementEvidenceAgainstReplay(
      candidate,
      shippingReplay,
      root,
    )).toBe(false);
  });
});
