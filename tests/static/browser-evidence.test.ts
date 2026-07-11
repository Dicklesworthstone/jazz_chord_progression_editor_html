import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { mergeBrowserEvidence } from "../../scripts/merge-browser-evidence";

const BROWSERS = ["chromium", "firefox", "webkit"] as const;
const MODES = ["file", "http"] as const;
const ARTIFACT = "<!doctype html><title>Changes Ω evidence fixture</title>";
const CANONICAL_OUTPUT = "release output/Changes étude #1.html";
const MERGED_OUTPUT =
  "test-results with spaces/standalone browser evidence Ω.json";

type BrowserName = (typeof BROWSERS)[number];
type BrowserMode = (typeof MODES)[number];
type AssertionOutcome = "pass" | "fail";

type EvidenceCell = {
  schemaVersion: 1;
  traceId: "F0-NETWORK-01";
  seed: "F0-NETWORK-01:v1";
  runId: string;
  browser: BrowserName;
  browserVersion: string;
  mode: BrowserMode;
  toolVersion: string;
  artifactHash: string;
  artifactBytes: number;
  outcome: AssertionOutcome;
  assertions: Record<string, AssertionOutcome>;
  findings: Array<{
    code: string;
    message: string;
    diagnosticIds: string[];
  }>;
  diagnostics: {
    requests: unknown[];
    console: unknown[];
    pageErrors: string[];
    webErrors: string[];
    workers: string[];
    webSockets: string[];
    dialogs: string[];
    pages: string[];
    resourceEntries: string[];
  };
};

type FixtureRoot = {
  root: string;
  runDirectory: string;
  outputPath: string;
  artifactHash: string;
  artifactBytes: number;
};

const expectedCells = BROWSERS.flatMap((browser) =>
  MODES.map((mode) => `${browser}:${mode}`),
).sort();

function hashFixtureArtifact(): string {
  return createHash("sha256").update(ARTIFACT, "utf8").digest("hex");
}

async function createFixtureRoot(runId: string): Promise<FixtureRoot> {
  const root = await mkdtemp(
    join(tmpdir(), "jcpe browser evidence Ω path with spaces-"),
  );
  const contractPath = join(
    root,
    "tests/fixtures/foundation/foundation-contract.json",
  );
  const artifactPath = join(root, CANONICAL_OUTPUT);
  const runDirectory = join(
    root,
    "test-results/standalone-browser-evidence-runs",
    runId,
  );
  const outputPath = join(root, MERGED_OUTPUT);
  const contract = {
    artifact: {
      canonicalOutput: CANONICAL_OUTPUT,
      browserEvidence: MERGED_OUTPUT,
    },
    browserModes: MODES.map((id) => ({ id })),
    browserProjects: [...BROWSERS],
    verificationLogFields: [
      "artifactHash",
      "browserVersion",
      "findings",
      "mode",
      "outcome",
      "schemaVersion",
      "seed",
      "toolVersion",
      "traceId",
    ],
  };

  await Promise.all([
    mkdir(dirname(contractPath), { recursive: true }),
    mkdir(dirname(artifactPath), { recursive: true }),
    mkdir(runDirectory, { recursive: true }),
  ]);
  await Promise.all([
    writeFile(contractPath, `${JSON.stringify(contract, null, 2)}\n`, "utf8"),
    writeFile(artifactPath, ARTIFACT, "utf8"),
  ]);

  return {
    root,
    runDirectory,
    outputPath,
    artifactHash: hashFixtureArtifact(),
    artifactBytes: new TextEncoder().encode(ARTIFACT).byteLength,
  };
}

function makeCell(
  browser: BrowserName,
  mode: BrowserMode,
  runId: string,
  fixture: FixtureRoot,
): EvidenceCell {
  return {
    schemaVersion: 1,
    traceId: "F0-NETWORK-01",
    seed: "F0-NETWORK-01:v1",
    runId,
    browser,
    browserVersion: `${browser}-fixture-1`,
    mode,
    toolVersion: "1.61.1-fixture",
    artifactHash: fixture.artifactHash,
    artifactBytes: fixture.artifactBytes,
    outcome: "pass",
    assertions: {
      applicationReady: "pass",
      noForbiddenRequests: "pass",
    },
    findings: [],
    diagnostics: {
      requests: [],
      console: [],
      pageErrors: [],
      webErrors: [],
      workers: [],
      webSockets: [],
      dialogs: [],
      pages: ["page-001"],
      resourceEntries: [],
    },
  };
}

function makeSixCells(runId: string, fixture: FixtureRoot): EvidenceCell[] {
  return BROWSERS.flatMap((browser) =>
    MODES.map((mode) => makeCell(browser, mode, runId, fixture)),
  );
}

async function writeCells(
  fixture: FixtureRoot,
  cells: readonly EvidenceCell[],
): Promise<void> {
  await Promise.all(
    [...cells].reverse().map(async (cell, index) => {
      const filename = `${String(index).padStart(2, "0")} ${cell.browser} ${cell.mode} Ω.json`;
      await writeFile(
        join(fixture.runDirectory, filename),
        `${JSON.stringify(cell, null, 2)}\n`,
        "utf8",
      );
    }),
  );
}

function findingKeys(
  findings: ReadonlyArray<{
    code: string;
    cell?: string;
    file?: string;
  }>,
): Array<[string, string | null, string | null]> {
  return findings.map((finding) => [
    finding.code,
    finding.cell ?? null,
    finding.file ?? null,
  ]);
}

async function expectPersistedReport(
  fixture: FixtureRoot,
  report: unknown,
): Promise<string> {
  const serialized = await readFile(fixture.outputPath, "utf8");
  const parsed: unknown = JSON.parse(serialized);
  expect(serialized.endsWith("\n")).toBe(true);
  expect(parsed).toEqual(report);
  return serialized;
}

async function withFixture(
  runId: string,
  run: (fixture: FixtureRoot) => Promise<void>,
): Promise<void> {
  const fixture = await createFixtureRoot(runId);
  try {
    expect(fixture.root).toContain("browser evidence Ω path with spaces");
    expect(fixture.outputPath).toContain("browser evidence Ω.json");
    await run(fixture);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
}

describe("browser evidence merger", () => {
  test("accepts exactly one passing cell for every browser and mode", async () => {
    await withFixture("exact-six-cell-run", async (fixture) => {
      await writeCells(fixture, makeSixCells("exact-six-cell-run", fixture));

      const first = await mergeBrowserEvidence("exact-six-cell-run", {
        root: fixture.root,
      });
      expect(first.exitCode).toBe(0);
      expect(first.report).toMatchObject({
        schemaVersion: 1,
        traceId: "F0-NETWORK-01",
        runId: "exact-six-cell-run",
        seed: "F0-NETWORK-01:v1",
        toolVersion: "1.61.1-fixture",
        browserVersion: "matrix",
        artifactHash: fixture.artifactHash,
        artifactBytes: fixture.artifactBytes,
        mode: "matrix",
        outcome: "pass",
        expectedCells,
        findings: [],
      });
      expect(
        first.report.cells.map(
          (cell) => `${String(cell.browser)}:${String(cell.mode)}`,
        ),
      ).toEqual(expectedCells);
      const firstSerialized = await expectPersistedReport(
        fixture,
        first.report,
      );

      const second = await mergeBrowserEvidence("exact-six-cell-run", {
        root: fixture.root,
      });
      expect(second).toEqual(first);
      expect(await expectPersistedReport(fixture, second.report)).toBe(
        firstSerialized,
      );
    });
  });

  test("rejects a missing matrix cell", async () => {
    await withFixture("missing-cell-run", async (fixture) => {
      const cells = makeSixCells("missing-cell-run", fixture).filter(
        (cell) => !(cell.browser === "firefox" && cell.mode === "http"),
      );
      await writeCells(fixture, cells);

      const result = await mergeBrowserEvidence("missing-cell-run", {
        root: fixture.root,
      });
      expect(result.exitCode).toBe(1);
      expect(result.report.outcome).toBe("fail");
      expect(findingKeys(result.report.findings)).toEqual([
        ["EVIDENCE_CELL_MISSING", "firefox:http", null],
      ]);
      expect(result.report.findings[0]?.message).toBe(
        "Expected exactly one firefox:http cell; found 0.",
      );
      await expectPersistedReport(fixture, result.report);
    });
  });

  test("rejects duplicate evidence for one matrix cell", async () => {
    await withFixture("duplicate-cell-run", async (fixture) => {
      const cells = makeSixCells("duplicate-cell-run", fixture);
      cells.push(makeCell("webkit", "http", "duplicate-cell-run", fixture));
      await writeCells(fixture, cells);

      const result = await mergeBrowserEvidence("duplicate-cell-run", {
        root: fixture.root,
      });
      expect(result.exitCode).toBe(1);
      expect(findingKeys(result.report.findings)).toEqual([
        ["EVIDENCE_CELL_DUPLICATE", "webkit:http", null],
      ]);
      expect(result.report.findings[0]?.message).toBe(
        "Expected exactly one webkit:http cell; found 2.",
      );
      await expectPersistedReport(fixture, result.report);
    });
  });

  test("rejects a stale artifact hash and run identity", async () => {
    await withFixture("current-identity-run", async (fixture) => {
      const cells = makeSixCells("current-identity-run", fixture).map((cell) =>
        cell.browser === "chromium" && cell.mode === "file"
          ? {
              ...cell,
              runId: "superseded-run-id",
              artifactHash: "0".repeat(64),
            }
          : cell,
      );
      await writeCells(fixture, cells);

      const result = await mergeBrowserEvidence("current-identity-run", {
        root: fixture.root,
      });
      expect(result.exitCode).toBe(1);
      expect(findingKeys(result.report.findings)).toEqual([
        ["EVIDENCE_ARTIFACT_STALE", "chromium:file", null],
        ["EVIDENCE_CELL_IDENTITY", "chromium:file", null],
      ]);
      await expectPersistedReport(fixture, result.report);
    });
  });

  test("rejects failed assertions and nonempty cell findings", async () => {
    await withFixture("failed-assertion-run", async (fixture) => {
      const cells = makeSixCells("failed-assertion-run", fixture).map((cell) =>
        cell.browser === "firefox" && cell.mode === "file"
          ? {
              ...cell,
              outcome: "fail" as const,
              assertions: {
                applicationReady: "pass" as const,
                noForbiddenRequests: "fail" as const,
              },
              findings: [
                {
                  code: "FORBIDDEN_REQUEST",
                  message: "Fixture request was intercepted.",
                  diagnosticIds: ["request-001"],
                },
              ],
            }
          : cell,
      );
      await writeCells(fixture, cells);

      const result = await mergeBrowserEvidence("failed-assertion-run", {
        root: fixture.root,
      });
      expect(result.exitCode).toBe(1);
      expect(findingKeys(result.report.findings)).toEqual([
        ["EVIDENCE_ASSERTION_FAILED", "firefox:file", null],
        ["EVIDENCE_CELL_FAILED", "firefox:file", null],
        ["EVIDENCE_FINDINGS_PRESENT", "firefox:file", null],
      ]);
      await expectPersistedReport(fixture, result.report);
    });
  });

  test("records malformed JSON without accepting or hiding it", async () => {
    await withFixture("malformed-json-run", async (fixture) => {
      await writeCells(
        fixture,
        makeSixCells("malformed-json-run", fixture),
      );
      await writeFile(
        join(fixture.runDirectory, "malformed evidence Ω.json"),
        '{"schemaVersion": 1, "broken":',
        "utf8",
      );

      const result = await mergeBrowserEvidence("malformed-json-run", {
        root: fixture.root,
      });
      expect(result.exitCode).toBe(1);
      expect(findingKeys(result.report.findings)).toEqual([
        ["EVIDENCE_CELL_JSON", null, "malformed evidence Ω.json"],
      ]);
      expect(result.report.cells).toHaveLength(6);
      await expectPersistedReport(fixture, result.report);
    });
  });
});
