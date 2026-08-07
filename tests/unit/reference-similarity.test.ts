import { describe, expect, test } from "bun:test";

import {
  WIND_REFERENCE_GATE_POLICY,
  admitReferenceSignal,
  WIND_IDENTITY_CONTROL_POLICY,
  analyzeSignal,
  buildGateEvidence,
  canonicalCorpusOutcome,
  compareToReference,
  evaluateSimilarityReport,
  estimatePitch,
  runWindIdentityControl,
  sha256Hex,
  verifyGateEvidence,
  windReferencePolicySha256,
  type GateEvidenceInput,
  type MonoPcm,
  type SignalFeatures,
  type WindIdentityControlCell,
} from "../../scripts/reference-similarity";
import { runUiowaWindIdentityCorpus } from "../../scripts/run-uiowa-wind-identity-control";

const RATE = 44_100;
const EXPECTED_HZ = 440;

type ToneOptions = Readonly<{
  attackSeconds?: number;
  harmonics?: readonly number[];
  noiseAmplitude?: number;
  highNoiseAmplitude?: number;
}>;

function deterministicNoise(index: number): number {
  let state = (index + 1) * 0x9e3779b1;
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return ((state >>> 0) / 0xffff_ffff) * 2 - 1;
}

function tone(frequencyHz = EXPECTED_HZ, options: ToneOptions = {}): MonoPcm {
  const durationSeconds = 1.2;
  const samples = new Float32Array(Math.round(RATE * durationSeconds));
  const attackSeconds = options.attackSeconds ?? 0.06;
  const harmonics = options.harmonics ?? [1, 0.31, 0.14, 0.07];
  let previousNoise = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const time = index / RATE;
    const envelope = Math.min(1, time / attackSeconds);
    let value = 0;
    for (let harmonic = 0; harmonic < harmonics.length; harmonic += 1) {
      value += (harmonics[harmonic] ?? 0) *
        Math.sin(2 * Math.PI * frequencyHz * (harmonic + 1) * time);
    }
    const noise = deterministicNoise(index);
    const highNoise = noise - previousNoise;
    previousNoise = noise;
    value += (options.noiseAmplitude ?? 0) * noise;
    value += (options.highNoiseAmplitude ?? 0) * highNoise;
    samples[index] = 0.35 * envelope * value;
  }
  return Object.freeze({ samples, sampleRateHz: RATE });
}

function noise(): MonoPcm {
  const samples = new Float32Array(Math.round(RATE * 1.2));
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = 0.2 * deterministicNoise(index);
  }
  return Object.freeze({ samples, sampleRateHz: RATE });
}

function admitted(pcm: MonoPcm, expectedHz = EXPECTED_HZ): SignalFeatures {
  const analysis = analyzeSignal(pcm, expectedHz);
  if (analysis.outcome !== "accept") throw new Error(JSON.stringify(analysis.findings));
  return analysis.features;
}

function acceptedReport(candidate: MonoPcm, reference: MonoPcm = candidate) {
  const comparison = compareToReference(candidate, reference, EXPECTED_HZ);
  if (comparison.outcome !== "accept") throw new Error(JSON.stringify(comparison.findings));
  return comparison.report;
}

function shiftedTimbre(features: SignalFeatures): SignalFeatures {
  return Object.freeze({
    ...features,
    integratedBandDb: Object.freeze(features.integratedBandDb.map((value, index) =>
      value + (index % 2 === 0 ? 15 : -15))),
    harmonicProfileDb: Object.freeze(features.harmonicProfileDb.map((value, index) =>
      value + (index % 2 === 0 ? 15 : -15))),
  });
}

function identityCells(): readonly WindIdentityControlCell[] {
  const flute = admitted(tone());
  const clarinet = shiftedTimbre(flute);
  return Object.freeze([72, 76, 79, 82].flatMap((midi) =>
    (["pp", "mf", "ff"] as const).map((dynamic) => Object.freeze({
      id: `m${String(midi)}-${dynamic}`,
      midi,
      dynamic,
      flutePitchHz: EXPECTED_HZ,
      clarinetPitchHz: EXPECTED_HZ,
      fluteEarly: flute,
      fluteLate: flute,
      clarinetEarly: clarinet,
      clarinetLate: clarinet,
    }))));
}

function passingIdentityControl() {
  const result = runWindIdentityControl(identityCells());
  if (result.outcome !== "pass") throw new Error(JSON.stringify(result.findings));
  return result;
}

describe("reference gate analysis admits signals before comparing them", () => {
  test("normalized pitch estimate locks a periodic signal in cents", () => {
    const pitch = estimatePitch(tone(), EXPECTED_HZ);
    expect(pitch).not.toBeNull();
    expect(Math.abs(pitch?.centsFromExpected ?? 99)).toBeLessThan(1);
    expect(pitch?.periodicity ?? 0).toBeGreaterThan(0.9);
  });

  test("an octave-wrong expected pitch is rejected instead of scoring timbre", () => {
    const analysis = analyzeSignal(tone(EXPECTED_HZ * 2), EXPECTED_HZ);
    expect(analysis.outcome).toBe("unavailable");
    if (analysis.outcome === "unavailable") {
      expect(analysis.findings.some((item) => item.code === "PITCH_MISMATCH")).toBe(true);
    }
  });

  test("white noise fails normalized-periodicity admission", () => {
    const analysis = analyzeSignal(noise(), EXPECTED_HZ);
    expect(analysis.outcome).toBe("unavailable");
    if (analysis.outcome === "unavailable") {
      expect(analysis.findings.some((item) => item.code === "PERIODICITY_TOO_LOW")).toBe(true);
    }
  });

  test("Welch integration sees an off-grid narrowband tone without probe holes", () => {
    const features = admitted(tone(731), 731);
    expect(features.integratedBandDb).toHaveLength(24);
    expect(Math.max(...features.integratedBandDb)).toBeGreaterThan(-3);
    expect(features.integratedBandDb.every(Number.isFinite)).toBe(true);
  });

  test("sustain-relative onset reports a finite physical attack", () => {
    const fast = admitted(tone(EXPECTED_HZ, { attackSeconds: 0.04 }));
    const slow = admitted(tone(EXPECTED_HZ, { attackSeconds: 0.12 }));
    expect(fast.attackTo90SustainSeconds).toBeGreaterThan(0.015);
    expect(slow.attackTo90SustainSeconds).toBeGreaterThan(fast.attackTo90SustainSeconds * 2);
  });

  test("corpus admission accepts a slow real attack without changing candidate limits", () => {
    const reference = admitReferenceSignal(tone(EXPECTED_HZ, { attackSeconds: 0.3 }), EXPECTED_HZ);
    expect(reference.outcome).toBe("accept");
    if (reference.outcome === "accept") {
      expect(reference.features.attackTo90SustainSeconds).toBeGreaterThan(
        WIND_REFERENCE_GATE_POLICY.maximumAttackSeconds,
      );
    }
    expect(WIND_REFERENCE_GATE_POLICY.maximumAttackSeconds).toBe(0.15);
  });
});

describe("reference comparison has planted positive and negative controls", () => {
  test("identity comparison is exactly the zero-distance positive control", () => {
    const report = acceptedReport(tone());
    expect(report.pitchDeltaCents).toBe(0);
    expect(report.envelopeDb).toBe(0);
    expect(report.harmonicDb).toBe(0);
    expect(report.attackLog2).toBe(0);
    expect(report.hnrAbsoluteDeltaDb).toBe(0);
    expect(report.highBandAbsoluteDeltaDb).toBe(0);
  });

  test("a too-slow attack fails both relative and absolute attack laws", () => {
    const report = acceptedReport(tone(EXPECTED_HZ, { attackSeconds: 0.24 }), tone());
    const verdict = evaluateSimilarityReport(report, passingIdentityControl());
    expect(verdict.outcome).toBe("fail");
    expect(verdict.findings.some((item) => item.code === "ATTACK_RATIO")).toBe(true);
    expect(verdict.findings.some((item) =>
      item.code === "CANDIDATE_ATTACK_ABSOLUTE_RANGE")).toBe(true);
  });

  test("a slow real reference remains authoritative while the candidate window stays frozen", () => {
    const base = acceptedReport(tone());
    const report = {
      ...base,
      candidate: { ...base.candidate, attackTo90SustainSeconds: 0.15 },
      reference: { ...base.reference, attackTo90SustainSeconds: 0.3 },
      attackLog2: 1,
    };
    const verdict = evaluateSimilarityReport(report, passingIdentityControl());
    expect(verdict.outcome).toBe("pass");
    expect(WIND_REFERENCE_GATE_POLICY.maximumAttackSeconds).toBe(0.15);
  });

  test("a non-positive reference attack fails closed", () => {
    const base = acceptedReport(tone());
    const verdict = evaluateSimilarityReport({
      ...base,
      reference: { ...base.reference, attackTo90SustainSeconds: 0 },
      attackLog2: Number.POSITIVE_INFINITY,
    }, passingIdentityControl());
    expect(verdict.outcome).toBe("fail");
    expect(verdict.findings.some((item) => item.code === "REFERENCE_ATTACK_INVALID")).toBe(true);
  });

  test("excess 5.5-10 kHz hiss fails integrated high-band and HNR laws", () => {
    const report = acceptedReport(tone(EXPECTED_HZ, { highNoiseAmplitude: 0.42 }), tone());
    const verdict = evaluateSimilarityReport(report, passingIdentityControl());
    expect(verdict.outcome).toBe("fail");
    expect(verdict.findings.some((item) => item.code === "HIGH_BAND_DELTA")).toBe(true);
    expect(verdict.findings.some((item) => item.code === "HNR_DELTA")).toBe(true);
  });

  test("HNR delta is two-sided: both over-noisy and implausibly pure fail", () => {
    const ordinary = tone(EXPECTED_HZ, { noiseAmplitude: 0.15 });
    const noisy = acceptedReport(tone(EXPECTED_HZ, { noiseAmplitude: 0.45 }), tone());
    const pure = acceptedReport(tone(EXPECTED_HZ, { harmonics: [1] }), ordinary);
    expect(evaluateSimilarityReport(noisy, passingIdentityControl()).findings.some((item) => item.code === "HNR_DELTA")).toBe(true);
    expect(evaluateSimilarityReport(pure, passingIdentityControl()).findings.some((item) => item.code === "HNR_DELTA")).toBe(true);
  });

  test("similarity verdict remains fail-closed when identity corpus proof is unavailable", () => {
    const verdict = evaluateSimilarityReport(acceptedReport(tone()),
      runWindIdentityControl(identityCells().slice(0, 1)));
    expect(verdict).toEqual({
      outcome: "unavailable",
      exitCode: 2,
      findings: [{
        code: "CONTROL_IDENTITY_NOT_SEPARATED",
        message: "no independent same-instrument/different-instrument identity boundary is established",
      }],
    });
  });

  test("thresholds are immutable and callers cannot supply candidate overrides", () => {
    expect(Object.isFrozen(WIND_REFERENCE_GATE_POLICY)).toBe(true);
    const verdict = evaluateSimilarityReport({
      ...acceptedReport(tone()),
      envelopeDb: WIND_REFERENCE_GATE_POLICY.maximumEnvelopeDb + 0.001,
    }, passingIdentityControl());
    expect(verdict.findings.some((item) => item.code === "ENVELOPE_DISTANCE")).toBe(true);
  });
});

describe("Iowa flute/clarinet identity control", () => {
  test("frozen laws admit stable same-instrument windows and reject matched-pitch cross timbres", () => {
    const result = runWindIdentityControl(identityCells());
    expect(Object.isFrozen(WIND_IDENTITY_CONTROL_POLICY)).toBe(true);
    expect(result.outcome).toBe("pass");
    expect(result.measurements).toHaveLength(12);
    expect(Math.max(...result.measurements.map((item) => item.matchedPitchDeltaCents))).toBe(0);
    expect(Math.min(...result.measurements.map((item) =>
      item.crossInstrumentTimbreDistanceDb))).toBeGreaterThanOrEqual(
        WIND_IDENTITY_CONTROL_POLICY.minimumCrossInstrumentTimbreDistanceDb);
  });

  test("a planted instrument-identity collapse fails on timbre, not pitch or onset", () => {
    const collapsed = identityCells().map((cell) => Object.freeze({
      ...cell,
      clarinetEarly: cell.fluteEarly,
      clarinetLate: cell.fluteLate,
    }));
    const result = runWindIdentityControl(collapsed);
    expect(result.outcome).toBe("fail");
    expect(result.findings.every((item) =>
      item.code === "CROSS_INSTRUMENT_TIMBRE_NOT_SEPARATED")).toBe(true);
    expect(result.measurements.every((item) => item.matchedPitchDeltaCents === 0)).toBe(true);
  });

  test("a planted unstable same-instrument pair fails the within-instrument law", () => {
    const cells = identityCells();
    const corrupted = cells.map((cell, index) => index === 0 ? Object.freeze({
      ...cell, fluteLate: shiftedTimbre(cell.fluteLate),
    }) : cell);
    const result = runWindIdentityControl(corrupted);
    expect(result.outcome).toBe("fail");
    expect(result.findings.some((item) => item.code === "SAME_INSTRUMENT_TIMBRE_DRIFT")).toBe(true);
  });

  test("too few pitches or dynamics is unavailable rather than a passing sample", () => {
    const result = runWindIdentityControl(identityCells().slice(0, 3));
    expect(result.outcome).toBe("unavailable");
    expect(result.exitCode).toBe(2);
    expect(result.findings[0]?.code).toBe("IDENTITY_CORPUS_INSUFFICIENT");
  });

  test("the official corpus runner either proves all 12 cells or names unavailable data", async () => {
    const result = await runUiowaWindIdentityCorpus();
    if (result.outcome === "pass") {
      expect(result.measurements).toHaveLength(12);
      expect(result.findings).toEqual([]);
    } else {
      expect(result.outcome).toBe("unavailable");
      expect(result.exitCode).toBe(2);
      expect(result.findings.length).toBeGreaterThan(0);
    }
  }, 30_000);
});

describe("canonical outcomes and evidence bindings", () => {
  test("an absent required corpus is unavailable with process exit 2, never green", () => {
    expect(canonicalCorpusOutcome([{ path: "reference.wav", present: false }])).toEqual({
      outcome: "unavailable",
      exitCode: 2,
      findings: [{ code: "REFERENCE_CORPUS_ABSENT",
        message: "required reference is absent: reference.wav" }],
    });
    expect(canonicalCorpusOutcome([{ path: "reference.wav", present: true }]).exitCode).toBe(0);
  });

  test("finite typed evidence binds analyzer, policy, renderer, WASM, pack, request, PCM, corpus, and file", () => {
    const digest = (label: string): string => sha256Hex(label);
    const input: GateEvidenceInput = {
      outcome: "pass",
      rendererAlgorithmId: "changes.dsp.waveguide-flute@2",
      corpusId: "cc0-winds@1",
      referencePath: "flute/a4.wav",
      referenceLicenseId: "CC0-1.0",
      expectedMidi: 69,
      expectedHz: 440,
      digests: {
        analyzerImplementationSha256: digest("analyzer"),
        policySha256: windReferencePolicySha256(),
        rendererSourceSha256: digest("renderer"),
        wasmSha256: digest("wasm"),
        parameterPackSha256: digest("pack"),
        renderRequestSha256: digest("request"),
        pcmSha256: digest("pcm"),
        corpusManifestSha256: digest("corpus"),
        referenceFileSha256: digest("reference"),
      },
      controls: {
        self: true,
        whiteNoiseRejected: true,
        overlyPureRejected: true,
        wrongPitchRejected: true,
        crossInstrumentRejected: true,
      },
      report: acceptedReport(tone()),
      findings: [],
    };
    const evidence = buildGateEvidence(input);
    expect(verifyGateEvidence(evidence)).toBe(true);
    expect(verifyGateEvidence({
      ...evidence,
      candidate: { ...evidence.candidate, wasmSha256: digest("different-wasm") },
    })).toBe(false);
    expect(verifyGateEvidence({
      ...evidence,
      controls: { ...evidence.controls, crossInstrumentRejected: false },
    })).toBe(false);
    expect(verifyGateEvidence({ ...evidence, outcome: "unavailable" })).toBe(false);
    expect(() => buildGateEvidence({
      ...input,
      controls: { ...input.controls, wrongPitchRejected: false },
    })).toThrow("inconsistent");
    expect(() => buildGateEvidence({ ...input, expectedHz: 466.16 })).toThrow("inconsistent");
    expect(() => buildGateEvidence({ ...input, expectedHz: Number.NaN })).toThrow("finite");
    expect(JSON.stringify(evidence)).not.toContain("null");
  });
});
