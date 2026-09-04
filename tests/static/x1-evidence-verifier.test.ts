import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { resolve } from "node:path";

import { atomicWrite, stableJson } from "../../scripts/foundation-io";
import {
  buildX1OwnerSuiteCommand,
  buildX1FixtureCaseIndex,
  testcaseCoversCaseId,
  exactX1OwnerTestFiles,
  isCanonicalX1InputPath,
  mergeX1EvidenceReports,
  validateX1ListeningEvidence,
  validateX1TraceOwnerEvidence,
  X1_EVIDENCE_REPORT_SCHEMA,
  X1_LISTENING_DEFERRED_SCENE_IDS,
  X1_LISTENING_SHARED_EVIDENCE_PATH,
  X1_PLAYWRIGHT_PRODUCER_FILE,
  X1_STATIC_MUTATION_PROOF_FILE,
  type X1BrowserRunEvidence,
  type X1OwnerSuiteEvidence,
  type X1PackageProofReport,
} from "../../scripts/verify-x1-evidence";
import traceLedger from "../fixtures/transport/trace-ledger.json";


const ROOT = resolve(import.meta.dirname, "../..");

function ownerSuiteEvidence(
  cases: readonly { file: string; name: string }[],
): X1OwnerSuiteEvidence {
  const digest = Object.freeze({ path: "x", bytes: 0, sha256: "0".repeat(64) });
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

function packageProof(outcome: "pass" | "fail"): X1PackageProofReport {
  const digest = Object.freeze({ path: "x", bytes: 0, sha256: "0".repeat(64) });
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

function browserRun(outcome: "pass" | "fail"): X1BrowserRunEvidence {
  return Object.freeze({
    outcome,
    runId: "run",
    runDirectory: "test-results/x",
    browserVersions: Object.freeze([]),
    artifacts: Object.freeze([]),
    findings: Object.freeze([]),
  });
}

async function tempListeningFile(content: unknown): Promise<string> {
  const directory = await mkdtemp(
    resolve(ROOT, "test-results/x1-verifier-test-"),
  );
  const path = resolve(directory, "listening.json");
  await atomicWrite(path, stableJson(content));
  return path;
}

describe("x1 evidence verifier", () => {
  test("derives the exact owner inventory from the reviewed trace ledger", () => {
    const owners = exactX1OwnerTestFiles(traceLedger);
    expect(owners).toEqual([
      "tests/integration/audio-command-races.test.ts",
      "tests/integration/transport-clicks.test.ts",
      "tests/integration/transport-engine-boundary.test.ts",
      "tests/integration/transport-instrument.test.ts",
      "tests/integration/transport-interruption.test.ts",
      "tests/integration/transport-natural-end.test.ts",
      "tests/integration/transport-notifications.test.ts",
      "tests/integration/transport-pause-seek.test.ts",
      "tests/integration/transport-play.test.ts",
      "tests/integration/transport-preview.test.ts",
      "tests/integration/transport-replacement.test.ts",
      "tests/integration/transport-scheduler.test.ts",
      "tests/integration/transport-state-machine.test.ts",
      "tests/integration/transport-stop-stress.test.ts",
      "tests/integration/transport-tempo-loop.test.ts",
      "tests/integration/transport-time.test.ts",
      X1_STATIC_MUTATION_PROOF_FILE,
      "tests/unit/transport-set-performance.test.ts",
    ]);
    expect(owners).not.toContain(X1_PLAYWRIGHT_PRODUCER_FILE);
    expect(
      owners.every((owner) => owner.startsWith("tests/") && owner.endsWith(".test.ts")),
    ).toBe(true);
  });

  test("builds the deterministic no-retry owner-suite command", () => {
    const command = buildX1OwnerSuiteCommand("out.xml", ["a.test.ts"]);
    expect(command.slice(1, 3)).toEqual(["test", "a.test.ts"]);
    expect(command).toContain("--max-concurrency=1");
    expect(command).toContain("--retry=0");
    expect(command).toContain("--reporter=junit");
    expect(command).toContain("--reporter-outfile=out.xml");
  });

  test("maps every trace-owner case ID to an executed testcase", () => {
    const ledger = {
      traces: [
        {
          id: "TR-X1-DEMO",
          evidenceOwner: "tests/integration/demo.test.ts",
          caseIds: ["X1-DEMO-001", "X1-DEMO-002"],
        },
        {
          id: X1_PLAYWRIGHT_PRODUCER_FILE,
          evidenceOwner: X1_PLAYWRIGHT_PRODUCER_FILE,

          caseIds: ["X1-STOP-001"],
        },
      ],
    };
    const passing = validateX1TraceOwnerEvidence(
      ledger,
      ownerSuiteEvidence([
        { file: "tests/integration/demo.test.ts", name: "X1-DEMO-001 works" },
        { file: "tests/integration/demo.test.ts", name: "X1-DEMO-002 works" },
      ]),
    );
    expect(passing.findings).toEqual([]);
    expect(passing.rows).toHaveLength(1);
    expect(passing.rows[0]?.outcome).toBe("pass");
    expect(passing.rows[0]?.producerKeys).toHaveLength(2);

    const missing = validateX1TraceOwnerEvidence(
      ledger,
      ownerSuiteEvidence([
        { file: "tests/integration/demo.test.ts", name: "X1-DEMO-001 works" },
      ]),
    );
    expect(missing.rows[0]?.outcome).toBe("fail");
    expect(
      missing.findings.some(
        (finding) => finding.code === "X1_EVIDENCE_TRACE_OWNER",
      ),
    ).toBe(true);
  });

  test("range-named testcases cover every enclosed fixture case ID", () => {
    expect(
      testcaseCoversCaseId(
        "X1-TIME-001..X1-TIME-012 production attacks land on the reviewed goldens",
        "X1-TIME-007",
      ),
    ).toBe(true);
    expect(
      testcaseCoversCaseId(
        "X1-TIME-013/X1-TIME-014 the audio-envelope floor lengthens sub-floor gates",
        "X1-TIME-014",
      ),
    ).toBe(true);
    expect(
      testcaseCoversCaseId(
        "X1-TIME-001..X1-TIME-012 production attacks land on the reviewed goldens",
        "X1-TIME-013",
      ),
    ).toBe(false);
    expect(
      testcaseCoversCaseId(
        "X1-TIME-001..X1-TIME-012 production attacks land on the reviewed goldens",
        "X1-SCHED-005",
      ),
    ).toBe(false);
    expect(testcaseCoversCaseId("plain name without identifiers", "L-AUDIO-01")).toBe(false);
  });

  test("fixture-carried case IDs cover fixture-driven owner rows", () => {
    const index = buildX1FixtureCaseIndex({
      "tests/fixtures/transport/state-machine-cases.json":
        "[{\"id\":\"X1-SM-024\"}]",
    });
    expect(index["X1-SM-024"]).toEqual([
      "tests/fixtures/transport/state-machine-cases.json",
    ]);
    const ledger = {
      traces: [
        {
          id: "TR-X1-PAUSE-RESUME-SEEK",
          evidenceOwner: "tests/integration/transport-pause-seek.test.ts",
          caseIds: ["X1-CMD-007", "X1-SM-024"],
        },
      ],
    };
    const suite = ownerSuiteEvidence([
      {
        file: "tests/integration/transport-pause-seek.test.ts",
        name: "X1-CMD-007 a paused seek stays paused",
      },
    ]);
    const covered = validateX1TraceOwnerEvidence(ledger, suite, index);
    expect(covered.findings).toEqual([]);
    expect(covered.rows[0]?.outcome).toBe("pass");
    expect(covered.rows[0]?.producerKeys).toContain(
      "TR-X1-PAUSE-RESUME-SEEK|tests/integration/transport-pause-seek.test.ts|fixture:tests/fixtures/transport/state-machine-cases.json|X1-SM-024",
    );
    const uncovered = validateX1TraceOwnerEvidence(ledger, suite, {});
    expect(uncovered.rows[0]?.outcome).toBe("fail");
    expect(
      uncovered.findings.some(
        (finding) => finding.code === "X1_EVIDENCE_TRACE_OWNER",
      ),
    ).toBe(true);
  });

  test("records the missing shared listening evidence as incomplete, never pass", async () => {
    const report = await validateX1ListeningEvidence(
      resolve(ROOT, "test-results/x1-verifier-test-absent/listening.json"),
    );
    expect(report.outcome).toBe("incomplete");
    expect(report.traceId).toBe("TR-X1-LISTENING");
    expect(report.deferredSceneIds).toEqual([...X1_LISTENING_DEFERRED_SCENE_IDS]);
    expect(
      report.findings.some(
        (finding) =>
          finding.code === "X1_EVIDENCE_LISTENING_MISSING" &&
          finding.disposition === "incomplete",
      ),
    ).toBe(true);
  });

  test("rejects a listening file that lets automation claim to hear", async () => {
    const path = await tempListeningFile({
      schema: "changes.release-evidence.x0-listening.v1",
      attestation: {
        automatedListeningClaim: true,
        reviewerIsHuman: true,
        recordsCreatedAfterAudition: true,
        outputCategoriesPhysicallyVerified: true,
      },
      records: [],
    });
    const report = await validateX1ListeningEvidence(path);
    expect(report.outcome).toBe("fail");
    expect(
      report.findings.some(
        (finding) => finding.code === "X1_EVIDENCE_LISTENING_NONCLAIM",
      ),
    ).toBe(true);
  });

  test("keeps unattested or sceneless listening evidence incomplete", async () => {
    const path = await tempListeningFile({
      schema: "changes.release-evidence.x0-listening.v1",
      attestation: {
        automatedListeningClaim: false,
        reviewerIsHuman: false,
        recordsCreatedAfterAudition: false,
        outputCategoriesPhysicallyVerified: false,
      },
      records: [],
    });
    const report = await validateX1ListeningEvidence(path);
    expect(report.outcome).toBe("incomplete");
    const codes = report.findings.map((finding) => finding.code);
    expect(codes).toContain("X1_EVIDENCE_LISTENING_ATTESTATION");
    expect(codes).toContain("X1_EVIDENCE_LISTENING_SCENE_MISSING");
  });

  test("passes fully attested listening evidence covering the deferred scenes", async () => {
    const path = await tempListeningFile({
      schema: "changes.release-evidence.x0-listening.v1",
      attestation: {
        automatedListeningClaim: false,
        reviewerIsHuman: true,
        recordsCreatedAfterAudition: true,
        outputCategoriesPhysicallyVerified: true,
      },
      records: X1_LISTENING_DEFERRED_SCENE_IDS.map((sceneId) => ({
        date: "2026-09-03",
        browserName: "chromium",
        browserVersion: "149.0.0.0",
        operatingSystem: "linux",
        outputCategory: "headphones",
        reviewer: "owner",
        caseId: sceneId,
        result: "pass",
        notes: "auditioned",
        knownLimitations: "none",
      })),
    });
    const report = await validateX1ListeningEvidence(path);
    expect(report.outcome).toBe("pass");
    expect(report.findings).toEqual([]);
  });

  test("merge precedence: fail beats incomplete beats pass", async () => {
    const listening = await validateX1ListeningEvidence(
      resolve(ROOT, "test-results/x1-verifier-test-absent/listening.json"),
    );
    expect(listening.outcome).toBe("incomplete");
    expect(
      mergeX1EvidenceReports(packageProof("pass"), browserRun("pass"), listening)
        .outcome,
    ).toBe("incomplete");
    expect(
      mergeX1EvidenceReports(packageProof("fail"), browserRun("pass"), listening)
        .outcome,
    ).toBe("fail");
    expect(
      mergeX1EvidenceReports(packageProof("pass"), browserRun("fail"), listening)
        .outcome,
    ).toBe("fail");
    expect(
      mergeX1EvidenceReports(packageProof("pass"), browserRun("pass"), {
        ...listening,
        outcome: "pass",
      }).outcome,
    ).toBe("pass");
    expect(
      mergeX1EvidenceReports(packageProof("pass"), browserRun("pass"), {
        ...listening,
        outcome: "fail",
      }).outcome,
    ).toBe("fail");
  });

  test("canonical input paths reject traversal and nonportable forms", () => {
    expect(isCanonicalX1InputPath("tests/fixtures/transport/trace-ledger.json")).toBe(true);
    expect(isCanonicalX1InputPath("/etc/passwd")).toBe(false);
    expect(isCanonicalX1InputPath("../outside.ts")).toBe(false);
    expect(isCanonicalX1InputPath("src\\audio\\transport.ts")).toBe(false);
    expect(isCanonicalX1InputPath("src//audio.ts")).toBe(false);
    expect(isCanonicalX1InputPath("")).toBe(false);
  });

  test("report schema and shared listening path are frozen", () => {
    expect(X1_EVIDENCE_REPORT_SCHEMA).toBe(
      "changes.validation.x1-transport-evidence.v1",
    );
    expect(X1_LISTENING_SHARED_EVIDENCE_PATH).toBe(
      "release-evidence/audio/listening/x0-listening-v1.json",
    );
  });
});
