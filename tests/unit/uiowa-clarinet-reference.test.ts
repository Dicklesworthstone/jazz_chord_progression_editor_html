import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  CLARINET_REFERENCE_CLI_USAGE,
  CLARINET_REFERENCE_RUNNER_POLICY,
  parseClarinetReferenceCliArguments,
  runUiowaClarinetReference,
  summarizeClarinetReferenceCells,
  verifyClarinetReferenceRunEvidence,
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

function evidence(
  midi: number,
  outcome: "pass" | "fail" = "pass",
  bindings: Readonly<{
    rendererSourceSha256?: string;
    wasmSha256?: string;
    parameterPackSha256?: string;
    corpusManifestSha256?: string;
  }> = {},
): GateEvidenceV1 {
  const expectedHz = 440 * 2 ** ((midi - 69) / 12);
  return buildGateEvidence({
    outcome,
    rendererAlgorithmId: "changes.dsp.waveguide-clarinet@2",
    corpusId: "university-of-iowa-musical-instrument-samples-winds@2026-08-07",
    referencePath: `BbClar.mf.C5B5.aiff#midi-${String(midi)}`,
    alternativeReferencePath: `Flute.mf.C5B5.aiff#midi-${String(midi)}`,
    referenceLicenseId: "University-of-Iowa-MIS-unrestricted-project-use",
    expectedMidi: midi,
    expectedHz,
    digests: {
      analyzerImplementationSha256: digest("analyzer"),
      policySha256: windReferencePolicySha256(),
      rendererSourceSha256: bindings.rendererSourceSha256 ?? digest("renderer"),
      wasmSha256: bindings.wasmSha256 ?? digest("wasm"),
      parameterPackSha256: bindings.parameterPackSha256 ?? digest("pack"),
      renderRequestSha256: digest(`request-${String(midi)}`),
      pcmSha256: digest(`pcm-${String(midi)}`),
      corpusManifestSha256: bindings.corpusManifestSha256 ?? digest("manifest"),
      referenceFileSha256: digest(`reference-${String(midi)}`),
      alternativeReferenceFileSha256: digest(`alternative-${String(midi)}`),
    },
    controls: {
      self: true,
      whiteNoiseRejected: true,
      overlyPureRejected: true,
      wrongPitchRejected: true,
      crossInstrumentRejected: true,
    },
    report: report(expectedHz, outcome === "fail"),
    identityComparison: {
      targetTimbreDistanceDb: 0,
      alternativeTimbreDistanceDb: 10,
      targetAdvantageDb: 10,
    },
    findings: outcome === "fail"
      ? [{ code: "ENVELOPE_DISTANCE", message: "99 exceeds 18" }]
      : [],
  });
}

function passingCells(bindings: Parameters<typeof evidence>[2] = {}):
readonly ClarinetReferenceMatrixCell[] {
  return Object.freeze(MATRIX.map((cell) => {
    const receipt = evidence(cell.midi, "pass", bindings);
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
        alternativePath: receipt.reference.alternativeFilePath,
        alternativeFileSha256: receipt.reference.alternativeFileSha256,
        alternativeSegmentSha256: digest(`alternative-segment-${cell.id}`),
      }),
    });
  }));
}

async function runCli(arguments_: readonly string[]): Promise<Readonly<{
  exitCode: number;
  stdout: string;
  stderr: string;
}>> {
  const child = Bun.spawn([
    process.execPath,
    join(process.cwd(), "scripts/run-uiowa-clarinet-reference.ts"),
    ...arguments_,
  ], {
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return Object.freeze({ exitCode, stdout, stderr });
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

  test("release evidence verifies the entire bound matrix, not one cherry-picked cell", () => {
    const candidateSourceBindings = Object.freeze([
      Object.freeze({ path: "dsp/concert-grand/src/clarinet.rs", sha256: digest("source") }),
    ]);
    const candidateSourceClosureSha256 = sha256Hex(JSON.stringify(candidateSourceBindings));
    const wasmSha256 = digest("matrix-wasm");
    const parameterPackSha256 = digest("matrix-pack");
    const corpusManifestSha256 = digest("matrix-manifest");
    const cells = passingCells({
      rendererSourceSha256: candidateSourceClosureSha256,
      wasmSha256,
      parameterPackSha256,
      corpusManifestSha256,
    });
    const matrix = {
      schema: "changes.evidence.phs2-uiowa-clarinet-reference.v1",
      policy: CLARINET_REFERENCE_RUNNER_POLICY,
      identityControl: { outcome: "pass", exitCode: 0, findings: [], measurements: [] },
      candidateSourceBindings,
      candidateSourceClosureSha256,
      wasmSha256,
      parameterPackSha256,
      corpusManifestSha256,
      cells,
      summary: summarizeClarinetReferenceCells(cells),
    };
    expect(verifyClarinetReferenceRunEvidence(matrix)).toBe(true);
    expect(verifyClarinetReferenceRunEvidence({ ...matrix, wasmSha256: digest("stale") }))
      .toBe(false);
    expect(verifyClarinetReferenceRunEvidence({ ...matrix, cells: cells.slice(1) })).toBe(false);
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
    const first = passing[0];
    if (first === undefined || first.evidence === null) {
      throw new Error("passing matrix fixture did not contain its first evidence cell");
    }
    expect(summarizeClarinetReferenceCells(passing.slice(0, 11)).outcome).toBe("unavailable");
    expect(summarizeClarinetReferenceCells([...passing.slice(0, 11), first]).findings
      .some((item) => item.code === "MATRIX_CELL_DUPLICATE")).toBe(true);
    const tampered = Object.freeze({
      ...first,
      evidence: Object.freeze({
        ...first.evidence,
        candidate: Object.freeze({
          ...first.evidence.candidate,
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

  test("CLI accepts one optional output path and refuses malformed arguments", () => {
    expect(parseClarinetReferenceCliArguments([])).toEqual({ outputPath: null });
    expect(parseClarinetReferenceCliArguments(["--output", "/tmp/evidence.json"]))
      .toEqual({ outputPath: "/tmp/evidence.json" });
    expect(() => parseClarinetReferenceCliArguments(["--output"]))
      .toThrow("missing value for --output");
    expect(() => parseClarinetReferenceCliArguments(["--output", "--output"]))
      .toThrow("missing value for --output");
    expect(() => parseClarinetReferenceCliArguments([
      "--output", "one.json", "--output", "two.json",
    ])).toThrow("duplicate --output");
    expect(() => parseClarinetReferenceCliArguments(["--unknown", "value"]))
      .toThrow("unknown argument");
    expect(CLARINET_REFERENCE_CLI_USAGE).toContain("[--output <evidence.json>]");
  });

  test("CLI writes complete evidence and malformed arguments cannot overwrite a target", async () => {
    const directory = await mkdtemp(join(tmpdir(), "clarinet-v2-cli-output-"));
    const outputPath = join(directory, "evidence.json");
    const protectedPath = join(directory, "protected.json");
    try {
      const written = await runCli(["--output", outputPath]);
      expect(written.exitCode).toBe(0);
      expect(written.stdout).toBe("");
      expect(written.stderr).toBe("");
      const writtenEvidence: unknown = JSON.parse(await readFile(outputPath, "utf8"));
      expect(verifyClarinetReferenceRunEvidence(writtenEvidence)).toBe(true);
      expect(writtenEvidence).toMatchObject({
        summary: {
          outcome: "pass",
          completedCellCount: 12,
          passedCellCount: 12,
          failedCellCount: 0,
          unavailableCellCount: 0,
        },
      });

      await writeFile(protectedPath, "do-not-overwrite", "utf8");
      const refused = await runCli([
        "--output", protectedPath, "--output", join(directory, "other.json"),
      ]);
      expect(refused.exitCode).toBe(2);
      expect(refused.stdout).toBe("");
      expect(refused.stderr).toContain("duplicate --output");
      expect(refused.stderr).toContain(CLARINET_REFERENCE_CLI_USAGE);
      expect(await readFile(protectedPath, "utf8")).toBe("do-not-overwrite");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 60_000);
});
