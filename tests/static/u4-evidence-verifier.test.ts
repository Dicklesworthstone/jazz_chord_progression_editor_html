import { describe, expect, test } from "bun:test";

import { stableJson } from "../../scripts/foundation-io";
import {
  buildU4OwnerSuiteCommand,
  exactU4OwnerTestFiles,
  mergeU4EvidenceReports,
  validateU4TraceOwnerEvidence,
  U4_EVIDENCE_REPORT_SCHEMA,
  U4_EXPECTED_BROWSER_PROJECTS,
  U4_PLAYWRIGHT_PRODUCER_FILE,
  U4_PLAYWRIGHT_TESTCASE,
  type U4BrowserRunEvidence,
  type U4OwnerSuiteEvidence,
  type U4PackageProofReport,
} from "../../scripts/verify-u4-evidence";
import traceLedger from "../fixtures/transport-controls/trace-ledger.json";

const digest = Object.freeze({ path: "x", bytes: 0, sha256: "0".repeat(64) });

function ownerSuiteEvidence(
  cases: readonly { file: string; name: string }[],
): U4OwnerSuiteEvidence {
  return Object.freeze({
    command: Object.freeze([]),
    environment: Object.freeze({}),
    exitCode: 0,
    elapsedMilliseconds: 0,
    junit: digest,
    stdout: digest,
    stderr: digest,
    tests: cases.length,
    assertions: cases.length,
    failures: 0,
    errors: 0,
    skipped: 0,
    files: Object.freeze([...new Set(cases.map((entry) => entry.file))].sort()),
    cases: Object.freeze(cases),
  });
}

function packageProof(outcome: "pass" | "fail"): U4PackageProofReport {
  const snapshot = Object.freeze({
    algorithm: "sha256-component-manifest-v1" as const,
    digest: "0".repeat(64),
    components: Object.freeze([]),
  });
  return Object.freeze({
    outcome,
    input: Object.freeze({ pre: snapshot, post: snapshot }),
    contractValidator: Object.freeze({
      command: Object.freeze([]),
      environment: Object.freeze({}),
      exitCode: 0,
      elapsedMilliseconds: 0,
      stdout: digest,
      stderr: digest,
    }),
    ownerSuite: ownerSuiteEvidence([]),
    traceOwners: Object.freeze([]),
    findings: Object.freeze([]),
  });
}

function browserRun(outcome: "pass" | "fail"): U4BrowserRunEvidence {
  return Object.freeze({
    outcome,
    runId: "run",
    runDirectory: "test-results/x",
    browserVersions: Object.freeze([]),
    observedSteps: Object.freeze([]),
    artifacts: Object.freeze([]),
    findings: Object.freeze([]),
  });
}

describe("u4 evidence verifier", () => {
  test("derives the exact owner inventory from the reviewed trace ledger", () => {
    const owners = exactU4OwnerTestFiles(traceLedger);
    expect(owners).toEqual([
      "tests/static/u4-contract.test.ts",
      "tests/unit/studio-playback-pointer.test.ts",
      "tests/unit/studio-transport-controls-u4.test.ts",
    ]);
    expect(owners).not.toContain(U4_PLAYWRIGHT_PRODUCER_FILE);
  });

  test("builds the deterministic no-retry owner-suite command", () => {
    const command = buildU4OwnerSuiteCommand("out.xml", ["a.test.ts"]);
    expect(command.slice(1, 3)).toEqual(["test", "a.test.ts"]);
    expect(command).toContain("--max-concurrency=1");
    expect(command).toContain("--retry=0");
    expect(command).toContain("--reporter=junit");
    expect(command).toContain("--reporter-outfile=out.xml");
  });

  test("maps trace owners to executed files", () => {
    const ledger = {
      traces: [
        {
          id: "TR-U4-DEMO",
          evidenceOwner: "tests/unit/demo.test.ts",
          caseIds: ["U4-STATUS-001"],
        },
        {
          id: "TR-U4-BROWSER",
          evidenceOwner: U4_PLAYWRIGHT_PRODUCER_FILE,
          caseIds: ["U4-STATUS-002"],
        },
      ],
    };
    const passing = validateU4TraceOwnerEvidence(
      ledger,
      ownerSuiteEvidence([{ file: "tests/unit/demo.test.ts", name: "x" }]),
    );
    expect(passing.findings).toEqual([]);
    expect(passing.rows).toHaveLength(1);
    expect(passing.rows[0]?.outcome).toBe("pass");

    const missing = validateU4TraceOwnerEvidence(
      ledger,
      ownerSuiteEvidence([]),
    );
    expect(missing.rows[0]?.outcome).toBe("fail");
    expect(
      missing.findings.some(
        (finding) => finding.code === "U4_EVIDENCE_TRACE_OWNER",
      ),
    ).toBe(true);
  });

  test("merge precedence: any fail fails the package", () => {
    expect(
      mergeU4EvidenceReports(packageProof("pass"), browserRun("pass")).outcome,
    ).toBe("pass");
    expect(
      mergeU4EvidenceReports(packageProof("fail"), browserRun("pass")).outcome,
    ).toBe("fail");
    expect(
      mergeU4EvidenceReports(packageProof("pass"), browserRun("fail")).outcome,
    ).toBe("fail");
    const merged = mergeU4EvidenceReports(
      packageProof("pass"),
      browserRun("pass"),
    );
    expect(merged.schema).toBe(U4_EVIDENCE_REPORT_SCHEMA);
    expect(merged.manualListening.performed).toBe(false);
    expect(merged.manualListening.outcome).toBe("not-assessed");
  });

  test("browser projects and testcase name are frozen", () => {
    expect([...U4_EXPECTED_BROWSER_PROJECTS]).toEqual([
      "chromium",
      "firefox",
      "webkit",
    ]);
    expect(U4_PLAYWRIGHT_TESTCASE).toBe(
      "records the complete U4 transport-controls browser evidence",
    );
    expect(U4_EVIDENCE_REPORT_SCHEMA).toBe(
      "changes.validation.u4-transport-evidence.v1",
    );
  });

  test("reports serialize deterministically", () => {
    const merged = mergeU4EvidenceReports(
      packageProof("pass"),
      browserRun("pass"),
    );
    expect(stableJson(merged)).toBe(stableJson(merged));
  });
});
