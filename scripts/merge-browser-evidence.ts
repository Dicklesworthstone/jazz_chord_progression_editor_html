import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { atomicWrite, sha256Hex, stableJson } from "./foundation-io";

type Contract = {
  artifact: {
    canonicalOutput: string;
    browserEvidence: string;
  };
  browserModes: Array<{ id: string }>;
  browserProjects: string[];
  verificationLogFields: string[];
};

type Cell = {
  schemaVersion?: unknown;
  traceId?: unknown;
  seed?: unknown;
  runId?: unknown;
  browser?: unknown;
  browserVersion?: unknown;
  mode?: unknown;
  toolVersion?: unknown;
  artifactHash?: unknown;
  artifactBytes?: unknown;
  outcome?: unknown;
  assertions?: unknown;
  findings?: unknown;
  diagnostics?: unknown;
};

type MergeFinding = {
  code: string;
  message: string;
  cell?: string;
  file?: string;
};

type BrowserEvidenceReport = {
  schemaVersion: 1;
  traceId: "F0-NETWORK-01";
  runId: string;
  seed: "F0-NETWORK-01:v1";
  toolVersion: string;
  browserVersion: "matrix";
  artifactHash: string;
  artifactBytes: number;
  mode: "matrix";
  outcome: "pass" | "fail";
  expectedCells: string[];
  cells: Cell[];
  findings: MergeFinding[];
};

function parseRunId(args: readonly string[]): string {
  const index = args.indexOf("--run-id");
  const value = index >= 0 ? args[index + 1] : undefined;
  if (!value || !/^[A-Za-z0-9._-]{8,128}$/u.test(value)) {
    throw new Error("EVIDENCE_RUN_ID: pass --run-id with the active test run ID.");
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cellKey(cell: Cell): string | null {
  return typeof cell.browser === "string" && typeof cell.mode === "string"
    ? `${cell.browser}:${cell.mode}`
    : null;
}

function lexicalCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function requiredFieldsMissing(
  cell: Cell,
  fields: readonly string[],
): string[] {
  const record = cell as Record<string, unknown>;
  return fields.filter((field) => !(field in record));
}

export async function mergeBrowserEvidence(
  runId: string,
  options: { root?: string } = {},
): Promise<{ report: BrowserEvidenceReport; exitCode: 0 | 1 }> {
  const root = resolve(options.root ?? process.cwd());
  const contract = JSON.parse(
    await readFile(
      resolve(root, "tests/fixtures/foundation/foundation-contract.json"),
      "utf8",
    ),
  ) as Contract;
  const artifact = new Uint8Array(
    await readFile(resolve(root, contract.artifact.canonicalOutput)),
  );
  const artifactHash = await sha256Hex(artifact);
  const expectedCells = contract.browserProjects
    .flatMap((browser) =>
      contract.browserModes.map((mode) => `${browser}:${mode.id}`),
    )
    .sort(lexicalCompare);
  const findings: MergeFinding[] = [];
  const directory = resolve(
    root,
    "test-results/standalone-browser-evidence-runs",
    runId,
  );
  let files: string[] = [];
  try {
    files = (await readdir(directory))
      .filter((file) => file.endsWith(".json"))
      .sort(lexicalCompare);
  } catch (error) {
    findings.push({
      code: "EVIDENCE_RUN_MISSING",
      message:
        error instanceof Error
          ? error.message
          : "The active evidence directory could not be read.",
    });
  }

  const cells: Cell[] = [];
  for (const file of files) {
    try {
      const parsed: unknown = JSON.parse(
        await readFile(resolve(directory, file), "utf8"),
      );
      if (!isRecord(parsed)) {
        findings.push({
          code: "EVIDENCE_CELL_SHAPE",
          message: "Cell evidence must be a JSON object.",
          file,
        });
      } else {
        cells.push(parsed);
      }
    } catch (error) {
      findings.push({
        code: "EVIDENCE_CELL_JSON",
        message: error instanceof Error ? error.message : "Invalid cell JSON.",
        file,
      });
    }
  }

  const counts = new Map<string, number>();
  for (const cell of cells) {
    const key = cellKey(cell);
    if (key !== null) counts.set(key, (counts.get(key) ?? 0) + 1);
    const missing = requiredFieldsMissing(cell, contract.verificationLogFields);
    if (missing.length > 0) {
      findings.push({
        code: "EVIDENCE_REQUIRED_FIELD",
        message: `Missing required fields: ${missing.join(", ")}.`,
        ...(key === null ? {} : { cell: key }),
      });
    }
    if (
      cell.schemaVersion !== 1 ||
      cell.traceId !== "F0-NETWORK-01" ||
      cell.seed !== "F0-NETWORK-01:v1" ||
      cell.runId !== runId
    ) {
      findings.push({
        code: "EVIDENCE_CELL_IDENTITY",
        message: "Cell schema, trace, seed, or run ID is not current.",
        ...(key === null ? {} : { cell: key }),
      });
    }
    if (
      typeof cell.browser !== "string" ||
      cell.browser.length === 0 ||
      typeof cell.browserVersion !== "string" ||
      cell.browserVersion.length === 0 ||
      typeof cell.mode !== "string" ||
      cell.mode.length === 0 ||
      typeof cell.toolVersion !== "string" ||
      cell.toolVersion.length === 0
    ) {
      findings.push({
        code: "EVIDENCE_FIELD_SHAPE",
        message: "Browser, browser version, mode, and tool version must be non-empty strings.",
        ...(key === null ? {} : { cell: key }),
      });
    }
    if (
      cell.artifactHash !== artifactHash ||
      cell.artifactBytes !== artifact.byteLength
    ) {
      findings.push({
        code: "EVIDENCE_ARTIFACT_STALE",
        message: "Cell hash or byte count does not match the canonical artifact.",
        ...(key === null ? {} : { cell: key }),
      });
    }
    if (cell.outcome !== "pass") {
      findings.push({
        code: "EVIDENCE_CELL_FAILED",
        message: "Cell outcome is not pass.",
        ...(key === null ? {} : { cell: key }),
      });
    }
    if (
      !isRecord(cell.assertions) ||
      Object.values(cell.assertions).some((value) => value !== "pass")
    ) {
      findings.push({
        code: "EVIDENCE_ASSERTION_FAILED",
        message: "Every named cell assertion must pass.",
        ...(key === null ? {} : { cell: key }),
      });
    }
    if (!Array.isArray(cell.findings) || cell.findings.length !== 0) {
      findings.push({
        code: "EVIDENCE_FINDINGS_PRESENT",
        message: "Passing cell evidence must have zero findings.",
        ...(key === null ? {} : { cell: key }),
      });
    }
    if (!isRecord(cell.diagnostics)) {
      findings.push({
        code: "EVIDENCE_DIAGNOSTICS_MISSING",
        message: "Cell diagnostics must be a structured object.",
        ...(key === null ? {} : { cell: key }),
      });
    }
  }

  for (const expected of expectedCells) {
    const count = counts.get(expected) ?? 0;
    if (count !== 1) {
      findings.push({
        code: count === 0 ? "EVIDENCE_CELL_MISSING" : "EVIDENCE_CELL_DUPLICATE",
        message: `Expected exactly one ${expected} cell; found ${String(count)}.`,
        cell: expected,
      });
    }
  }
  for (const [key] of counts) {
    if (!expectedCells.includes(key)) {
      findings.push({
        code: "EVIDENCE_CELL_UNEXPECTED",
        message: "The run produced a cell outside the declared browser matrix.",
        cell: key,
      });
    }
  }

  cells.sort((left, right) =>
    lexicalCompare(cellKey(left) ?? "", cellKey(right) ?? ""),
  );
  const toolVersions = [
    ...new Set(
      cells
        .map((cell) => cell.toolVersion)
        .filter((value): value is string => typeof value === "string"),
    ),
  ].sort(lexicalCompare);
  if (toolVersions.length !== 1) {
    findings.push({
      code: "EVIDENCE_TOOL_VERSION",
      message: `Expected one Playwright version; found ${String(toolVersions.length)}.`,
    });
  }
  findings.sort((left, right) =>
    lexicalCompare(
      `${left.code}:${left.cell ?? ""}:${left.file ?? ""}:${left.message}`,
      `${right.code}:${right.cell ?? ""}:${right.file ?? ""}:${right.message}`,
    ),
  );
  const report: BrowserEvidenceReport = {
    schemaVersion: 1,
    traceId: "F0-NETWORK-01",
    runId,
    seed: "F0-NETWORK-01:v1",
    toolVersion: toolVersions[0] ?? "unknown",
    browserVersion: "matrix",
    artifactHash,
    artifactBytes: artifact.byteLength,
    mode: "matrix",
    outcome: findings.length === 0 ? "pass" : "fail",
    expectedCells,
    cells,
    findings,
  };
  await atomicWrite(
    resolve(root, contract.artifact.browserEvidence),
    stableJson(report),
  );
  return { report, exitCode: report.outcome === "pass" ? 0 : 1 };
}

if (import.meta.main) {
  try {
    const result = await mergeBrowserEvidence(parseRunId(Bun.argv.slice(2)));
    console.log(stableJson(result.report).trimEnd());
    process.exitCode = result.exitCode;
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          schema: "jcpe.browser-evidence.v1",
          outcome: "tool-failure",
          message: error instanceof Error ? error.message : "Evidence merge failed.",
        },
        null,
        2,
      ),
    );
    process.exitCode = 2;
  }
}
