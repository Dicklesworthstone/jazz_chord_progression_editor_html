import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

import {
  CLARINET_REFERENCE_RUNNER_POLICY,
  runUiowaClarinetReference,
  summarizeClarinetReferenceCells,
  type ClarinetReferenceMatrixCell,
} from "../../scripts/run-uiowa-clarinet-reference";
import {
  buildGateEvidence,
  sha256Hex,
  windReferencePolicySha256,
  type GateEvidenceV1,
  type SignalFeatures,
  type SimilarityReport,
} from "../../scripts/reference-similarity";

const MATRIX = ([72, 76, 79, 82] as const).flatMap((midi) =>
  (["pp", "mf", "ff"] as const).map((dynamic) => ({
    id: `m${String(midi)}-${dynamic}`,
    midi,
    dynamic,
    velocity: { pp: 36, mf: 72, ff: 108 }[dynamic],
  })),
);

function digest(label: string): string {
  return sha256Hex(label);
}

function features(expectedHz: number): SignalFeatures {
  return Object.freeze({
    pitch: Object.freeze({ f0Hz: expectedHz, centsFromExpected: 0, periodicity: 0.99 }),
    integratedBandDb: Object.freeze([0, -3, -6]),
    harmonicProfileDb: Object.freeze([0, -4, -8]),
    hnrDb: 24,
    highBandShareDb: -32,
    onsetSeconds: 0,
    attackTo90SustainSeconds: 0.06,
  });
}

function report(expectedHz: number, failing = false): SimilarityReport {
  const common = features(expectedHz);
  return Object.freeze({
    candidate: common,
    reference: common,
    pitchDeltaCents: 0,
    envelopeDb: failing ? 99 : 0,
    harmonicDb: 0,
    attackLog2: 0,
    hnrAbsoluteDeltaDb: 0,
    highBandAbsoluteDeltaDb: 0,
  });
}

function evidence(midi: number, outcome: "pass" | "fail" = "pass"): GateEvidenceV1 {
  const expectedHz = 440 * 2 ** ((midi - 69) / 12);
  return buildGateEvidence({
    outcome,
    rendererAlgorithmId: "changes.dsp.waveguide-clarinet@2",
    corpusId: "university-of-iowa-musical-instrument-samples-winds@2026-08-07",
    referencePath: `BbClar.mf.C5B5.aiff#midi-${String(midi)}`,
    referenceLicenseId: "University-of-Iowa-MIS-unrestricted-project-use",
    expectedMidi: midi,
    expectedHz,
    digests: {
      analyzerImplementationSha256: digest("analyzer"),
      policySha256: windReferencePolicySha256(),
      rendererSourceSha256: digest("renderer"),
      wasmSha256: digest("wasm"),
      parameterPackSha256: digest("pack"),
      renderRequestSha256: digest(`request-${String(midi)}`),
      pcmSha256: digest(`pcm-${String(midi)}`),
      corpusManifestSha256: digest("manifest"),
      referenceFileSha256: digest(`reference-${String(midi)}`),
    },
    controls: {
      self: true,
      whiteNoiseRejected: true,
      overlyPureRejected: true,
      wrongPitchRejected: true,
      crossInstrumentRejected: true,
    },
    report: report(expectedHz, outcome === "fail"),
    findings: outcome === "fail"
      ? [{ code: "ENVELOPE_DISTANCE", message: "planted threshold failure" }]
      : [],
  });
}

function passingCells(): readonly ClarinetReferenceMatrixCell[] {
  return Object.freeze(MATRIX.map((cell) => {
    const receipt = evidence(cell.midi);
    return Object.freeze({
      ...cell,
      outcome: "pass" as const,
      exitCode: 0 as const,
      findings: Object.freeze([]),
      evidence: receipt,
      reference: Object.freeze({
        path: receipt.reference.filePath,
        fileSha256: receipt.reference.fileSha256,
        segmentSha256: digest(`segment-${cell.id}`),
      }),
    });
  }));
}

describe("PHS2 Iowa clarinet reference matrix", () => {
  test("freezes the exact four-pitch, three-dynamic request policy", () => {
    expect(CLARINET_REFERENCE_RUNNER_POLICY.selectedMidi).toEqual([72, 76, 79, 82]);
    expect(CLARINET_REFERENCE_RUNNER_POLICY.requiredDynamics).toEqual(["pp", "mf", "ff"]);
    expect(CLARINET_REFERENCE_RUNNER_POLICY.velocityByDynamic).toEqual({ pp: 36, mf: 72, ff: 108 });
    expect(CLARINET_REFERENCE_RUNNER_POLICY.rendererAlgorithmId).toBe(
      "changes.dsp.waveguide-clarinet@2",
    );
    expect(CLARINET_REFERENCE_RUNNER_POLICY.articulation).toBe("tongued");
    expect(Object.isFrozen(CLARINET_REFERENCE_RUNNER_POLICY)).toBe(true);
    expect(Object.isFrozen(CLARINET_REFERENCE_RUNNER_POLICY.velocityByDynamic)).toBe(true);
  });

  test("pins the exact checked-in Iowa corpus manifest bytes", async () => {
    const bytes = new Uint8Array(await readFile(
      "tests/fixtures/uiowa-wind-identity-corpus.v1.json",
    ));
    expect(sha256Hex(bytes)).toBe(CLARINET_REFERENCE_RUNNER_POLICY.corpusManifestSha256);
  });

  test("the exact matrix can pass only with twelve semantic PASS receipts", () => {
    const cells = passingCells();
    const summary = summarizeClarinetReferenceCells(cells);
    expect(summary).toMatchObject({
      outcome: "pass",
      exitCode: 0,
      expectedCellCount: 12,
      completedCellCount: 12,
      passedCellCount: 12,
      failedCellCount: 0,
      unavailableCellCount: 0,
    });
    expect(summary.findings).toEqual([]);
  });

  test("one planted acoustic-distance failure makes the whole matrix fail", () => {
    const cells = passingCells().map((cell, index) => index === 7 ? Object.freeze({
      ...cell,
      outcome: "fail" as const,
      exitCode: 1 as const,
      findings: Object.freeze([{ code: "ENVELOPE_DISTANCE", message: "planted" }]),
      evidence: evidence(cell.midi, "fail"),
    }) : cell);
    const summary = summarizeClarinetReferenceCells(cells);
    expect(summary.outcome).toBe("fail");
    expect(summary.exitCode).toBe(1);
    expect(summary.failedCellCount).toBe(1);
    expect(summary.passedCellCount).toBe(11);
  });

  test("one unavailable cell outranks failures and can never summarize green", () => {
    const cells = passingCells().map((cell, index) => index === 3 ? Object.freeze({
      ...cell,
      outcome: "unavailable" as const,
      exitCode: 2 as const,
      findings: Object.freeze([{ code: "REFERENCE_CORPUS_ABSENT", message: "planted" }]),
      evidence: null,
      reference: null,
    }) : index === 9 ? Object.freeze({
      ...cell,
      outcome: "fail" as const,
      exitCode: 1 as const,
      findings: Object.freeze([{ code: "HNR_DELTA", message: "planted" }]),
      evidence: evidence(cell.midi, "fail"),
    }) : cell);
    const summary = summarizeClarinetReferenceCells(cells);
    expect(summary.outcome).toBe("unavailable");
    expect(summary.exitCode).toBe(2);
    expect(summary.unavailableCellCount).toBe(1);
    expect(summary.failedCellCount).toBe(1);
  });

  test("missing, duplicate, or hash-tampered receipts are unavailable", () => {
    const passing = passingCells();
    expect(summarizeClarinetReferenceCells(passing.slice(0, 11)).outcome).toBe("unavailable");
    expect(summarizeClarinetReferenceCells([...passing.slice(0, 11), passing[0]!]).findings
      .some((item) => item.code === "MATRIX_CELL_DUPLICATE")).toBe(true);
    const first = passing[0]!;
    const tampered = Object.freeze({
      ...first,
      evidence: Object.freeze({
        ...first.evidence!,
        candidate: Object.freeze({
          ...first.evidence!.candidate,
          wasmSha256: digest("tampered-wasm"),
        }),
      }),
    });
    const cells = [tampered, ...passing.slice(1)];
    const summary = summarizeClarinetReferenceCells(cells);
    expect(summary.outcome).toBe("unavailable");
    expect(summary.findings.some((item) => item.code === "MATRIX_CELL_EVIDENCE_INVALID")).toBe(true);
  });

  test("the official runner emits the exact matrix or twelve named unavailable cells", async () => {
    const result = await runUiowaClarinetReference();
    expect(result.cells).toHaveLength(12);
    expect(new Set(result.cells.map((cell) => cell.id))).toEqual(new Set(MATRIX.map((cell) => cell.id)));
    expect(Object.isFrozen(result.cells)).toBe(true);
    expect(result.summary.outcome === "pass").toBe(
      result.cells.every((cell) => cell.outcome === "pass" && cell.evidence !== null),
    );
    if (result.identityControl.outcome !== "pass") {
      expect(result.summary.outcome).toBe("unavailable");
      expect(result.cells.every((cell) => cell.exitCode === 2)).toBe(true);
    } else {
      expect(result.corpusManifestSha256).toBe(
        CLARINET_REFERENCE_RUNNER_POLICY.corpusManifestSha256,
      );
      expect(result.cells.every((cell) => cell.outcome !== "pass" ||
        (cell.evidence !== null && cell.evidence.outcome === "pass"))).toBe(true);
    }
  }, 60_000);
});
