import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";

import {
  analyzePianoReferenceFeatures,
  evaluatePianoReferenceCell,
  pianoV2CanonicalSha256,
  PIANO_V2_REFERENCE_EVIDENCE_SCHEMA,
  PIANO_V2_REFERENCE_POLICY,
  PIANO_V2_REFERENCE_SOURCE_PATHS,
  profileDistanceDb,
  reviewedPianoInharmonicityCoefficient,
  runPianoV2ReferenceGate,
  stiffPianoPartialHz,
  verifyPianoV2ReferenceEvidence,
  verifyPianoV2ReferenceEvidenceAgainstReplay,
  type PianoReferenceFeatures,
  type PianoV2ReferenceEvidence,
} from "../../scripts/run-piano-v2-reference-gate";
import {
  CONCERT_GRAND_WASM_BASE64,
  CONCERT_GRAND_WASM_SHA256,
} from "../../src/audio/wasm/concert-grand-wasm";
import {
  PIANO_ATTACK_SAMPLES_BASE64,
  PIANO_ATTACK_SAMPLES_SHA256,
  PIANO_ATTACK_SLICE_INDEX,
} from "../../src/audio/wasm/piano-attack-samples";

function healthyFeatures(): PianoReferenceFeatures {
  return Object.freeze({
    harmonicCombOffsetCents: 0,
    earlyRms: 0.05,
    peak: 0.4,
    harmonicProfileDb: Object.freeze([0, -6, -10, -15]),
    envelopeProfileDb: Object.freeze([-20, -3, 0, -2, -8]),
  });
}

function cloneJson(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

function resignEvidence(value: Record<string, unknown>): Record<string, unknown> {
  value["sourceClosureSha256"] = pianoV2CanonicalSha256(value["sourceBindings"]);
  delete value["evidenceSha256"];
  value["evidenceSha256"] = pianoV2CanonicalSha256(value);
  return value;
}

let validEvidenceFixtureCache: PianoV2ReferenceEvidence | undefined;

function validEvidenceFixture(): PianoV2ReferenceEvidence {
  if (validEvidenceFixtureCache !== undefined) return validEvidenceFixtureCache;
  const digest = "1".repeat(64);
  const sourceBindings = Object.freeze(PIANO_V2_REFERENCE_SOURCE_PATHS.map((path) =>
    Object.freeze({ path, sha256: digest })));
  const corpus = Uint8Array.from(Buffer.from(PIANO_ATTACK_SAMPLES_BASE64, "base64"));
  const references = new Map<string, Readonly<{
    slice: (typeof PIANO_ATTACK_SLICE_INDEX)[number];
    features: PianoReferenceFeatures;
    pcmSha256: string;
  }>>();
  for (const midi of PIANO_V2_REFERENCE_POLICY.midi) {
    for (const velocity of PIANO_V2_REFERENCE_POLICY.velocities) {
      const slice = PIANO_ATTACK_SLICE_INDEX.find((entry) =>
        entry.midiPitch === midi && velocity >= entry.lowVelocity && velocity <= entry.highVelocity
      );
      if (slice === undefined) throw new Error("test reference slice missing");
      const pcm = new Float32Array(slice.frameCount);
      const view = new DataView(corpus.buffer, corpus.byteOffset, corpus.byteLength);
      for (let index = 0; index < slice.frameCount; index += 1) {
        pcm[index] = view.getInt16(slice.byteOffset + 2 * index, true) / 32_768;
      }
      const expectedHz = 440 * 2 ** ((midi - 69) / 12);
      const inharmonicity = reviewedPianoInharmonicityCoefficient(midi);
      references.set(`m${String(midi)}v${String(velocity)}`, Object.freeze({
        slice,
        features: analyzePianoReferenceFeatures(
          pcm,
          PIANO_V2_REFERENCE_POLICY.sampleRateHz,
          expectedHz,
          inharmonicity,
        ),
        pcmSha256: createHash("sha256").update(new Uint8Array(pcm.buffer)).digest("hex"),
      }));
    }
  }
  const maximumDistance = (profiles: readonly (readonly number[])[]): number => {
    let maximum = 0;
    for (let left = 0; left < profiles.length; left += 1) {
      for (let right = left + 1; right < profiles.length; right += 1) {
        maximum = Math.max(
          maximum,
          profileDistanceDb(profiles[left] ?? [], profiles[right] ?? []),
        );
      }
    }
    return maximum;
  };
  const cells = Object.freeze(PIANO_V2_REFERENCE_POLICY.midi.flatMap((midi) => {
    const sameKey = PIANO_V2_REFERENCE_POLICY.velocities.map((velocity) => {
      const reference = references.get(`m${String(midi)}v${String(velocity)}`);
      if (reference === undefined) throw new Error("test reference missing");
      return reference.features;
    });
    const harmonicSpread = maximumDistance(sameKey.map((entry) => entry.harmonicProfileDb));
    const envelopeSpread = maximumDistance(sameKey.map((entry) => entry.envelopeProfileDb));
    const allowedHarmonic = Math.max(
      PIANO_V2_REFERENCE_POLICY.minimumAllowedHarmonicDistanceDb,
      PIANO_V2_REFERENCE_POLICY.withinCorpusDistanceMultiplier * harmonicSpread,
    );
    const allowedEnvelope = Math.max(
      PIANO_V2_REFERENCE_POLICY.minimumAllowedEnvelopeDistanceDb,
      PIANO_V2_REFERENCE_POLICY.withinCorpusDistanceMultiplier * envelopeSpread,
    );
    return PIANO_V2_REFERENCE_POLICY.velocities.map((velocity) => {
      const reference = references.get(`m${String(midi)}v${String(velocity)}`);
      if (reference === undefined) throw new Error("test reference missing");
      const velocityIndex = PIANO_V2_REFERENCE_POLICY.velocities.indexOf(velocity);
      const candidateFeatures = Object.freeze({
        ...reference.features,
        harmonicCombOffsetCents: 0,
        earlyRms: 0.01 * (velocityIndex + 1),
        peak: 0.4,
      });
      return Object.freeze({
        id: `m${String(midi)}v${String(velocity)}`,
        midi,
        velocity,
        requestSha256: pianoV2CanonicalSha256({
          midi,
          velocity,
          sampleRateHz: PIANO_V2_REFERENCE_POLICY.sampleRateHz,
          frames: Math.floor(
            PIANO_V2_REFERENCE_POLICY.renderSeconds * PIANO_V2_REFERENCE_POLICY.sampleRateHz,
          ),
        }),
        pcmSha256: digest,
        referenceSlice: Object.freeze({
          byteOffset: reference.slice.byteOffset,
          frameCount: reference.slice.frameCount,
          sourceLayer: reference.slice.sourceLayer,
          sourceChannel: reference.slice.sourceChannel,
          tuningCents: reference.slice.tuningCents,
        }),
        referencePcmSha256: reference.pcmSha256,
        features: candidateFeatures,
        harmonicDistanceDb: 0,
        envelopeDistanceDb: 0,
        referenceHarmonicSpreadDb: harmonicSpread,
        referenceEnvelopeSpreadDb: envelopeSpread,
        allowedHarmonicDistanceDb: allowedHarmonic,
        allowedEnvelopeDistanceDb: allowedEnvelope,
        outcome: "pass" as const,
        findings: Object.freeze([]),
      });
    });
  }));
  const dynamicsCells = Object.freeze(PIANO_V2_REFERENCE_POLICY.midi.map((midi) =>
    {
      const levels = PIANO_V2_REFERENCE_POLICY.velocities.map((velocity) => {
        const cell = cells.find((candidate) =>
          candidate.midi === midi && candidate.velocity === velocity);
        return cell?.features.earlyRms ?? Number.NaN;
      }) as [number, number, number];
      const pass = levels[0] < levels[1] && levels[1] < levels[2];
      return Object.freeze({
        id: `m${String(midi)}-dynamics`,
        midi,
        earlyRms: Object.freeze(levels),
        outcome: pass ? "pass" as const : "fail" as const,
      });
    }));
  const controls = Object.freeze({
    referenceSelfPasses: true,
    wrongPitchRejected: true,
    silentRejected: true,
    clippingRejected: true,
    pureSineRejected: true,
    integerHarmonicBankRejected: true,
    flatEnvelopeRejected: true,
    flatDynamicsRejected: true,
  });
  const passedDynamicsCellCount = dynamicsCells.filter((cell) => cell.outcome === "pass").length;
  const acousticPass = passedDynamicsCellCount === dynamicsCells.length;
  const unsigned = {
    schema: PIANO_V2_REFERENCE_EVIDENCE_SCHEMA,
    policy: PIANO_V2_REFERENCE_POLICY,
    wasmSha256: CONCERT_GRAND_WASM_SHA256,
    embeddedWasmSha256: CONCERT_GRAND_WASM_SHA256,
    shippingPayloadMatch: true,
    corpusSha256: PIANO_ATTACK_SAMPLES_SHA256,
    sourceBindings,
    sourceClosureSha256: pianoV2CanonicalSha256(sourceBindings),
    cells,
    dynamicsCells,
    controls,
    summary: Object.freeze({
      acousticOutcome: acousticPass ? "pass" as const : "fail" as const,
      shippingOutcome: acousticPass ? "pass" as const : "fail" as const,
      passedCellCount: cells.length,
      passedDynamicsCellCount,
    }),
  };
  validEvidenceFixtureCache = Object.freeze({
    ...unsigned,
    evidenceSha256: pianoV2CanonicalSha256(unsigned),
  });
  return validEvidenceFixtureCache;
}

describe("piano-v2 exact-WASM Salamander reference gate", () => {
  test("analysis is deterministic and keeps onset and harmonic profiles independent", () => {
    const sampleRate = PIANO_V2_REFERENCE_POLICY.sampleRateHz;
    const samples = new Float32Array(Math.floor(0.32 * sampleRate));
    const f0 = 261.625565;
    const inharmonicity = reviewedPianoInharmonicityCoefficient(60);
    for (let index = 0; index < samples.length; index += 1) {
      const seconds = index / sampleRate;
      const attack = Math.min(1, seconds / 0.018);
      samples[index] = attack * Math.exp(-3 * seconds) * (
        0.18 * Math.sin(2 * Math.PI * stiffPianoPartialHz(f0, inharmonicity, 1) * seconds) +
        0.09 * Math.sin(2 * Math.PI * stiffPianoPartialHz(f0, inharmonicity, 2) * seconds) +
        0.04 * Math.sin(2 * Math.PI * stiffPianoPartialHz(f0, inharmonicity, 3) * seconds)
      );
    }
    const first = analyzePianoReferenceFeatures(samples, sampleRate, f0, inharmonicity);
    const second = analyzePianoReferenceFeatures(samples, sampleRate, f0, inharmonicity);
    expect(second).toEqual(first);
    expect(first.harmonicProfileDb.length).toBeGreaterThanOrEqual(8);
    expect(first.envelopeProfileDb).toHaveLength(4);
    // The finite analysis window puts this known-answer peak two grid cells
    // from zero; bind that measured resolution instead of an unrelated
    // partial-window search constant.
    expect(Math.abs(first.harmonicCombOffsetCents)).toBeLessThanOrEqual(
      2 * PIANO_V2_REFERENCE_POLICY.harmonicCombSearchStepCents,
    );
    expect(profileDistanceDb(first.harmonicProfileDb, first.harmonicProfileDb)).toBe(0);
  });

  test("reviewed stiff-string partials reject the old integer-harmonic analyzer", () => {
    const sampleRate = PIANO_V2_REFERENCE_POLICY.sampleRateHz;
    const midi = 84;
    const f0 = 440 * 2 ** ((midi - 69) / 12);
    const inharmonicity = reviewedPianoInharmonicityCoefficient(midi);
    expect(inharmonicity).toBeCloseTo(0.002731203381, 10);
    expect(1200 * Math.log2(stiffPianoPartialHz(f0, inharmonicity, 8) / (8 * f0)))
      .toBeGreaterThan(130);
    const samples = new Float32Array(Math.floor(0.32 * sampleRate));
    for (let index = 0; index < samples.length; index += 1) {
      const seconds = index / sampleRate;
      const attack = Math.min(1, seconds / 0.012);
      let value = 0;
      for (let partial = 1; partial <= 8; partial += 1) {
        value += 0.12 / partial * Math.sin(
          2 * Math.PI * stiffPianoPartialHz(f0, inharmonicity, partial) * seconds,
        );
      }
      samples[index] = attack * Math.exp(-2.5 * seconds) * value;
    }
    const reviewed = analyzePianoReferenceFeatures(samples, sampleRate, f0, inharmonicity);
    const integer = analyzePianoReferenceFeatures(samples, sampleRate, f0, 0);
    expect(reviewed.harmonicProfileDb.slice(0, 8).every((level) => level > -35)).toBe(true);
    expect(profileDistanceDb(reviewed.harmonicProfileDb, integer.harmonicProfileDb))
      .toBeGreaterThan(20);
  });

  test("measured audio outside the pitch window is not clamped onto the threshold", () => {
    const sampleRate = PIANO_V2_REFERENCE_POLICY.sampleRateHz;
    const midi = 60;
    const expectedFundamentalHz = 440 * 2 ** ((midi - 69) / 12);
    const renderedFundamentalHz = expectedFundamentalHz * 2 ** (100 / 1200);
    const inharmonicity = reviewedPianoInharmonicityCoefficient(midi);
    const samples = new Float32Array(Math.floor(0.32 * sampleRate));
    for (let index = 0; index < samples.length; index += 1) {
      const seconds = index / sampleRate;
      const attack = Math.min(1, seconds / 0.012);
      let value = 0;
      for (let partial = 1; partial <= 8; partial += 1) {
        value += 0.12 / partial * Math.sin(
          2 * Math.PI * stiffPianoPartialHz(
            renderedFundamentalHz,
            inharmonicity,
            partial,
          ) * seconds,
        );
      }
      samples[index] = attack * Math.exp(-2.5 * seconds) * value;
    }
    const features = analyzePianoReferenceFeatures(
      samples,
      sampleRate,
      expectedFundamentalHz,
      inharmonicity,
    );
    expect(features.harmonicCombOffsetCents).toBeGreaterThan(90);
    expect(evaluatePianoReferenceCell(features, 0, 0, 6, 4)
      .map((finding) => finding.code)).toContain("PIANO_REFERENCE_HARMONIC_COMB_OFFSET");
  });

  test("each planted acoustic near-miss fails its named law", () => {
    const healthy = healthyFeatures();
    const evaluate = (
      features: PianoReferenceFeatures,
      harmonicDistance = 0,
      envelopeDistance = 0,
    ) => evaluatePianoReferenceCell(features, harmonicDistance, envelopeDistance, 6, 4);
    expect(evaluate(healthy)).toEqual([]);
    expect(evaluate(Object.freeze({ ...healthy, harmonicCombOffsetCents: 50.1 }))
      .map((finding) => finding.code)).toContain("PIANO_REFERENCE_HARMONIC_COMB_OFFSET");
    expect(evaluate(Object.freeze({ ...healthy, earlyRms: 0 }))
      .map((finding) => finding.code)).toContain("PIANO_REFERENCE_SILENT");
    expect(evaluate(Object.freeze({ ...healthy, peak: 0.981 }))
      .map((finding) => finding.code)).toContain("PIANO_REFERENCE_CLIPPING");
    expect(evaluate(healthy, 6.01, 0)
      .map((finding) => finding.code)).toContain("PIANO_REFERENCE_HARMONIC_PROFILE");
    expect(evaluate(healthy, 0, 4.01)
      .map((finding) => finding.code)).toContain("PIANO_REFERENCE_ATTACK_ENVELOPE");
  });

  test("stored evidence is semantic and the stale embedded payload refuses replay", async () => {
    const wasmBytes = Uint8Array.from(Buffer.from(CONCERT_GRAND_WASM_BASE64, "base64"));
    const evidence = validEvidenceFixture();
    expect(verifyPianoV2ReferenceEvidence(evidence)).toBe(true);
    let refusal = "";
    try {
      await runPianoV2ReferenceGate(wasmBytes);
    } catch (error) {
      refusal = String(error);
    }
    expect(refusal).toContain("PIANO_REFERENCE_WASM_ABI_MISSING:pno2_chord_runtime_init");
    expect(await verifyPianoV2ReferenceEvidenceAgainstReplay(evidence, wasmBytes)).toBe(false);
  }, 30_000);

  test("duplicate, outcome, threshold, source, and digest tampering fail closed", () => {
    const evidence = validEvidenceFixture();

    const duplicate = cloneJson(evidence) as Record<string, unknown>;
    const duplicateCells = duplicate["cells"] as Array<Record<string, unknown>>;
    duplicateCells[1] = { ...(duplicateCells[0] ?? {}) };
    expect(verifyPianoV2ReferenceEvidence(duplicate)).toBe(false);

    const outcome = cloneJson(evidence) as Record<string, unknown>;
    const outcomeCells = outcome["cells"] as Array<Record<string, unknown>>;
    outcomeCells[0] = {
      ...(outcomeCells[0] ?? {}),
      outcome: outcomeCells[0]?.["outcome"] === "pass" ? "fail" : "pass",
    };
    expect(verifyPianoV2ReferenceEvidence(outcome)).toBe(false);

    const threshold = cloneJson(evidence) as Record<string, unknown>;
    const thresholdCells = threshold["cells"] as Array<Record<string, unknown>>;
    thresholdCells[0] = {
      ...(thresholdCells[0] ?? {}),
      allowedHarmonicDistanceDb: 1_000,
    };
    expect(verifyPianoV2ReferenceEvidence(threshold)).toBe(false);

    const truncated = cloneJson(evidence) as Record<string, unknown>;
    const truncatedCells = truncated["cells"] as Array<Record<string, unknown>>;
    const truncatedFeatures = truncatedCells[0]?.["features"] as Record<string, unknown>;
    const truncatedProfile = truncatedFeatures["harmonicProfileDb"] as number[];
    truncatedFeatures["harmonicProfileDb"] = truncatedProfile.slice(0, -1);
    truncatedCells[0] = {
      ...(truncatedCells[0] ?? {}),
      harmonicDistanceDb: 0,
    };
    expect(verifyPianoV2ReferenceEvidence(resignEvidence(truncated))).toBe(false);

    const authority = cloneJson(evidence) as Record<string, unknown>;
    const policy = authority["policy"] as Record<string, unknown>;
    const stringAuthority = policy["stringAuthority"] as Record<string, unknown>;
    stringAuthority["youngModulusPa"] = 1;
    expect(verifyPianoV2ReferenceEvidence(resignEvidence(authority))).toBe(false);

    const source = cloneJson(evidence) as Record<string, unknown>;
    const bindings = source["sourceBindings"] as Array<Record<string, unknown>>;
    bindings[0] = { ...(bindings[0] ?? {}), sha256: "0".repeat(64) };
    expect(verifyPianoV2ReferenceEvidence(source)).toBe(false);

    const digest = cloneJson(evidence) as Record<string, unknown>;
    digest["evidenceSha256"] = "f".repeat(64);
    expect(verifyPianoV2ReferenceEvidence(digest)).toBe(false);
  });

  test("re-signed request, corpus slice, metric, control, and source-path forgery fails", () => {
    const evidence = validEvidenceFixture();

    const request = cloneJson(evidence) as Record<string, unknown>;
    const requestCells = request["cells"] as Array<Record<string, unknown>>;
    requestCells[0] = { ...(requestCells[0] ?? {}), requestSha256: "a".repeat(64) };
    expect(verifyPianoV2ReferenceEvidence(resignEvidence(request))).toBe(false);

    const slice = cloneJson(evidence) as Record<string, unknown>;
    const sliceCells = slice["cells"] as Array<Record<string, unknown>>;
    const firstSlice = sliceCells[0]?.["referenceSlice"] as Record<string, unknown>;
    firstSlice["byteOffset"] = Number(firstSlice["byteOffset"] ?? 0) + 2;
    expect(verifyPianoV2ReferenceEvidence(resignEvidence(slice))).toBe(false);

    const metric = cloneJson(evidence) as Record<string, unknown>;
    const metricCells = metric["cells"] as Array<Record<string, unknown>>;
    metricCells[0] = { ...(metricCells[0] ?? {}), harmonicDistanceDb: 0.25 };
    expect(verifyPianoV2ReferenceEvidence(resignEvidence(metric))).toBe(false);

    const control = cloneJson(evidence) as Record<string, unknown>;
    const controls = control["controls"] as Record<string, unknown>;
    controls["pureSineRejected"] = false;
    expect(verifyPianoV2ReferenceEvidence(resignEvidence(control))).toBe(false);

    const sourcePath = cloneJson(evidence) as Record<string, unknown>;
    const bindings = sourcePath["sourceBindings"] as Array<Record<string, unknown>>;
    bindings[0] = { ...(bindings[0] ?? {}), path: "substituted/source" };
    expect(verifyPianoV2ReferenceEvidence(resignEvidence(sourcePath))).toBe(false);
  });
});
