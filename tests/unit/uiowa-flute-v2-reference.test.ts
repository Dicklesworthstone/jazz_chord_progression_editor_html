import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  FLUTE_V2_REFERENCE_CLI_USAGE,
  FLUTE_V2_REFERENCE_RUNNER_POLICY,
  bindFluteV2ReferenceMatrixCell,
  fluteV2RunnerPolicySha256,
  parseFluteV2ReferenceCliArguments,
  runUiowaFluteV2Reference,
  summarizeFluteV2ReferenceCells,
  verifyFluteV2InputDigests,
  verifyFluteV2ReferenceRunEvidenceAgainstReplay,
  type FluteV2ReferenceMatrixCell,
  type FluteV2ReferenceRunResult,
} from "../../scripts/run-uiowa-flute-v2-reference";
import {
  sha256Hex,
  windReferencePolicySha256,
  type SimilarityReport,
} from "../../scripts/reference-similarity";

const EXPECTED_REFERENCE_UNAVAILABLE = new Set([
  "m82-mf",
  "m72-ff",
  "m79-ff",
  "m82-ff",
]);

function report(): SimilarityReport {
  const features = Object.freeze({
    pitch: Object.freeze({ f0Hz: 523.25, centsFromExpected: 0, periodicity: 0.99 }),
    integratedBandDb: Object.freeze([0, -3, -6]),
    harmonicProfileDb: Object.freeze([0, -4, -8]),
    hnrDb: 24,
    highBandShareDb: -32,
    onsetSeconds: 0,
    attackTo90SustainSeconds: 0.06,
  });
  return Object.freeze({
    candidate: features,
    reference: features,
    pitchDeltaCents: 0,
    envelopeDb: 0,
    harmonicDb: 0,
    attackLog2: 0,
    hnrAbsoluteDeltaDb: 0,
    highBandAbsoluteDeltaDb: 0,
  });
}

function matrix(): readonly FluteV2ReferenceMatrixCell[] {
  return Object.freeze(FLUTE_V2_REFERENCE_RUNNER_POLICY.requiredDynamics.flatMap((dynamic) =>
    FLUTE_V2_REFERENCE_RUNNER_POLICY.selectedMidi.map((midi) => {
      const id = `m${String(midi)}-${dynamic}`;
      const referenceUnavailable = EXPECTED_REFERENCE_UNAVAILABLE.has(id);
      const digest = (digit: string): string => digit.repeat(64);
      return bindFluteV2ReferenceMatrixCell({
        id,
        midi,
        dynamic,
        velocity: FLUTE_V2_REFERENCE_RUNNER_POLICY.velocityByDynamic[dynamic],
        outcome: referenceUnavailable ? "reference-unavailable" as const : "pass" as const,
        findings: referenceUnavailable
          ? Object.freeze([{ code: "REFERENCE_PITCH_MISMATCH", message: "independent fixture" }])
          : Object.freeze([]),
        report: referenceUnavailable ? null : report(),
        identityComparison: referenceUnavailable ? null : Object.freeze({
          targetTimbreDistanceDb: 0,
          alternativeTimbreDistanceDb: 10,
          targetAdvantageDb: 10,
        }),
        bindings: Object.freeze({
          rendererSourceSha256: digest("1"),
          wasmSha256: digest("2"),
          corpusManifestSha256: FLUTE_V2_REFERENCE_RUNNER_POLICY.corpusManifestSha256,
          analyzerImplementationSha256: digest("3"),
          referenceGatePolicySha256: windReferencePolicySha256(),
          runnerPolicySha256: fluteV2RunnerPolicySha256(),
          renderRequestSha256: referenceUnavailable ? null : digest("4"),
          candidatePcmSha256: referenceUnavailable ? null : digest("5"),
          fluteReferenceFileSha256: digest("6"),
          fluteReferenceSegmentSha256: digest("7"),
          clarinetAlternativeFileSha256: digest("8"),
          clarinetAlternativeSegmentSha256: digest("9"),
        }),
      });
    }),
  ));
}

function passEvidence(cells = matrix()): FluteV2ReferenceRunResult {
  return Object.freeze({
    schema: "changes.evidence.phs3-uiowa-flute-v2-reference.v1",
    policy: FLUTE_V2_REFERENCE_RUNNER_POLICY,
    identityControl: Object.freeze({
      outcome: "pass" as const,
      exitCode: 0 as const,
      findings: Object.freeze([]),
      measurements: Object.freeze([]),
    }),
    rendererSourceSha256: "1".repeat(64),
    wasmSha256: "2".repeat(64),
    corpusManifestSha256: FLUTE_V2_REFERENCE_RUNNER_POLICY.corpusManifestSha256,
    analyzerImplementationSha256: "3".repeat(64),
    referenceGatePolicySha256: windReferencePolicySha256(),
    runnerPolicySha256: fluteV2RunnerPolicySha256(),
    cells,
    summary: summarizeFluteV2ReferenceCells(cells),
  });
}

function unbindCell(
  cell: FluteV2ReferenceMatrixCell,
): Omit<FluteV2ReferenceMatrixCell, "evidenceSha256"> {
  const { evidenceSha256, ...body } = cell;
  void evidenceSha256;
  return body;
}

async function runCli(arguments_: readonly string[]): Promise<Readonly<{
  exitCode: number;
  stdout: string;
  stderr: string;
}>> {
  const child = Bun.spawn([
    process.execPath,
    join(process.cwd(), "scripts/run-uiowa-flute-v2-reference.ts"),
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

describe("PHS3 Iowa flute-v2 target/alternative matrix", () => {
  test("freezes eight admitted cells and the four independently invalid references", () => {
    expect(FLUTE_V2_REFERENCE_RUNNER_POLICY.selectedMidi).toEqual([72, 76, 79, 82]);
    expect(FLUTE_V2_REFERENCE_RUNNER_POLICY.requiredDynamics).toEqual(["pp", "mf", "ff"]);
    expect(FLUTE_V2_REFERENCE_RUNNER_POLICY.requiredAdmittedCells).toBe(8);
    expect(FLUTE_V2_REFERENCE_RUNNER_POLICY.requiredReferenceUnavailableCells).toBe(4);
    expect(FLUTE_V2_REFERENCE_RUNNER_POLICY.expectedReferenceUnavailableIds).toEqual([
      "m82-mf", "m72-ff", "m79-ff", "m82-ff",
    ]);
  });

  test("pins the exact checked-in corpus manifest bytes", async () => {
    const bytes = new Uint8Array(await readFile(
      FLUTE_V2_REFERENCE_RUNNER_POLICY.corpusManifestPath,
    ));
    expect(sha256Hex(bytes)).toBe(FLUTE_V2_REFERENCE_RUNNER_POLICY.corpusManifestSha256);
  });

  test("eight semantic passes plus four named reference-unavailable cells summarize green", () => {
    expect(summarizeFluteV2ReferenceCells(matrix())).toMatchObject({
      outcome: "pass",
      exitCode: 0,
      completedCellCount: 12,
      admittedCellCount: 8,
      passedCellCount: 8,
      failedCellCount: 0,
      referenceUnavailableCellCount: 4,
      unexpectedUnavailableCellCount: 0,
    });
  });

  test("a planted admitted acoustic failure makes the matrix fail", () => {
    const cells = matrix().map((cell) => {
      if (cell.id !== "m76-pp") return cell;
      return bindFluteV2ReferenceMatrixCell({
        ...unbindCell(cell),
        outcome: "fail" as const,
        findings: Object.freeze([{ code: "PITCH_DELTA", message: "planted" }]),
      });
    });
    const summary = summarizeFluteV2ReferenceCells(cells);
    expect(summary.outcome).toBe("fail");
    expect(summary.exitCode).toBe(1);
    expect(summary.passedCellCount).toBe(7);
    expect(summary.failedCellCount).toBe(1);
  });

  test("an absent or newly invalid cell fails unavailable instead of shrinking the denominator", () => {
    const removed = summarizeFluteV2ReferenceCells(matrix().slice(1));
    expect(removed.outcome).toBe("unavailable");
    expect(removed.exitCode).toBe(2);
    expect(removed.findings.map((item) => item.code)).toContain("FLUTE_V2_MATRIX_INCOMPLETE");

    const wrongReason = matrix().map((cell) => {
      if (cell.id !== "m82-mf") return cell;
      return bindFluteV2ReferenceMatrixCell({
        ...unbindCell(cell),
        findings: Object.freeze([{ code: "REFERENCE_DECODE_FAILED", message: "planted" }]),
      });
    });
    expect(summarizeFluteV2ReferenceCells(wrongReason).outcome).toBe("unavailable");
  });

  test("bound PASS evidence rejects digest tampering and cherry-picked cells", () => {
    const cells = matrix();
    const replay = passEvidence(cells);
    expect(verifyFluteV2ReferenceRunEvidenceAgainstReplay(replay, replay)).toBe(true);
    expect(verifyFluteV2ReferenceRunEvidenceAgainstReplay(
      { ...replay, wasmSha256: "a".repeat(64) }, replay,
    )).toBe(false);
    expect(verifyFluteV2ReferenceRunEvidenceAgainstReplay(
      { ...replay, cells: cells.slice(1) }, replay,
    )).toBe(false);
  });

  test("an exact-looking hand-authored report cannot replace an independently replayed cell", () => {
    const replay = passEvidence();
    const cells = replay.cells.map((cell) => {
      if (cell.id !== "m72-pp" || cell.report === null) return cell;
      return bindFluteV2ReferenceMatrixCell({
        ...unbindCell(cell),
        report: Object.freeze({ ...cell.report, envelopeDb: 0.125 }),
      });
    });
    const authored = passEvidence(cells);
    expect(authored.summary.outcome).toBe("pass");
    expect(verifyFluteV2ReferenceRunEvidenceAgainstReplay(authored, replay)).toBe(false);
  });

  test("recomputed cell bindings still reject synthetic PCM and wrong cell coordinates", () => {
    const replay = passEvidence();
    const synthetic = replay.cells.map((cell) => {
      if (cell.id !== "m76-mf" || cell.bindings === null) return cell;
      return bindFluteV2ReferenceMatrixCell({
        ...unbindCell(cell),
        bindings: Object.freeze({ ...cell.bindings, candidatePcmSha256: "a".repeat(64) }),
      });
    });
    expect(verifyFluteV2ReferenceRunEvidenceAgainstReplay(passEvidence(synthetic), replay)).toBe(false);

    const wrongCoordinates = replay.cells.map((cell) => {
      if (cell.id !== "m76-mf") return cell;
      return bindFluteV2ReferenceMatrixCell({ ...unbindCell(cell), velocity: 71 });
    });
    expect(summarizeFluteV2ReferenceCells(wrongCoordinates).findings
      .map((item) => item.code)).toContain("FLUTE_V2_CELL_COORDINATES");
    expect(verifyFluteV2ReferenceRunEvidenceAgainstReplay(
      passEvidence(wrongCoordinates), replay,
    )).toBe(false);
  });

  test("the same input digest must exist before and after a run", async () => {
    const directory = await mkdtemp(join(tmpdir(), "flute-v2-input-drift-"));
    const path = join(directory, "input.bin");
    try {
      await writeFile(path, "before");
      const before = sha256Hex(new TextEncoder().encode("before"));
      expect(await verifyFluteV2InputDigests([{ path, sha256: before }])).toBe(true);
      await writeFile(path, "after");
      expect(await verifyFluteV2InputDigests([{ path, sha256: before }])).toBe(false);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("the real runner fails closed when the requested WASM does not exist", async () => {
    const result = await runUiowaFluteV2Reference({
      wasmPath: "/data/tmp/definitely-absent-flute-v2.wasm",
    });
    expect(result.summary.outcome).toBe("unavailable");
    expect(result.cells[0]?.findings[0]?.code).toBe("FLUTE_V2_WASM_ABSENT");
  });

  test("embedded WASM bytes are accepted as an immutable replay input", async () => {
    const result = await runUiowaFluteV2Reference({
      wasmBytes: new Uint8Array([0x00, 0x61, 0x73, 0x6d]),
    });
    expect(result.summary.outcome).toBe("unavailable");
    expect(result.cells[0]?.findings[0]?.code).toBe("FLUTE_V2_RUNNER_INPUT_INVALID");
    expect(result.cells[0]?.findings[0]?.code).not.toBe("FLUTE_V2_WASM_ABSENT");
  });

  test("path and embedded-byte modes are mutually exclusive at runtime", async () => {
    const result = await runUiowaFluteV2Reference({
      wasmPath: "/data/tmp/not-used.wasm",
      wasmBytes: new Uint8Array([0]),
    } as never);
    expect(result.cells[0]?.findings[0]?.code).toBe("FLUTE_V2_WASM_INPUT_AMBIGUOUS");
  });

  test("CLI arguments accept one output path and refuse duplicate or missing values", () => {
    expect(parseFluteV2ReferenceCliArguments([
      "--wasm", "/tmp/input.wasm", "--output", "/tmp/evidence.json",
    ])).toEqual({
      wasmPath: "/tmp/input.wasm",
      outputPath: "/tmp/evidence.json",
    });
    expect(parseFluteV2ReferenceCliArguments(["--wasm", "/tmp/input.wasm"]))
      .toEqual({ wasmPath: "/tmp/input.wasm", outputPath: null });
    expect(() => parseFluteV2ReferenceCliArguments([
      "--wasm", "one.wasm", "--wasm", "two.wasm",
    ])).toThrow("duplicate --wasm");
    expect(() => parseFluteV2ReferenceCliArguments([
      "--wasm", "one.wasm", "--output", "one.json", "--output", "two.json",
    ])).toThrow("duplicate --output");
    expect(() => parseFluteV2ReferenceCliArguments(["--wasm"]))
      .toThrow("missing value for --wasm");
    expect(() => parseFluteV2ReferenceCliArguments(["--wasm", "one.wasm", "--output"]))
      .toThrow("missing value for --output");
    expect(FLUTE_V2_REFERENCE_CLI_USAGE).toContain("[--output <evidence.json>]");
  });

  test("CLI writes evidence with --output and otherwise keeps JSON on stdout", async () => {
    const directory = await mkdtemp(join(tmpdir(), "flute-v2-cli-output-"));
    const absentWasm = join(directory, "absent.wasm");
    const outputPath = join(directory, "evidence.json");
    try {
      const written = await runCli(["--wasm", absentWasm, "--output", outputPath]);
      expect(written.exitCode).toBe(2);
      expect(written.stdout).toBe("");
      expect(written.stderr).toBe("");
      const writtenEvidence: unknown = JSON.parse(await readFile(outputPath, "utf8"));
      expect(writtenEvidence).toMatchObject({
        cells: [{ findings: [{ code: "FLUTE_V2_WASM_ABSENT" }] }],
      });

      const streamed = await runCli(["--wasm", absentWasm]);
      expect(streamed.exitCode).toBe(2);
      expect(streamed.stderr).toBe("");
      const streamedEvidence: unknown = JSON.parse(streamed.stdout);
      expect(streamedEvidence).toEqual(writtenEvidence);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("CLI refusal prints the usage without starting a run", async () => {
    const duplicate = await runCli(["--wasm", "one.wasm", "--wasm", "two.wasm"]);
    expect(duplicate.exitCode).toBe(2);
    expect(duplicate.stdout).toBe("");
    expect(duplicate.stderr).toContain("duplicate --wasm");
    expect(duplicate.stderr).toContain(FLUTE_V2_REFERENCE_CLI_USAGE);

    const missing = await runCli(["--wasm"]);
    expect(missing.exitCode).toBe(2);
    expect(missing.stdout).toBe("");
    expect(missing.stderr).toContain("missing value for --wasm");
    expect(missing.stderr).toContain(FLUTE_V2_REFERENCE_CLI_USAGE);
  });
});
