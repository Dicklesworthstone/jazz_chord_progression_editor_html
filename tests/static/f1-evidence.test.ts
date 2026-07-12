import { describe, expect, test } from "bun:test";

import {
  F1_APPLICABILITY,
  F1_FOCUSED_TEST_FILES,
  F1_REVIEWED_COUNTERS,
  F1_REVIEWED_SEEDS,
  F1_TRACE_DESCRIPTORS,
  inspectF1JUnit,
  validateF1EvidenceCandidate,
} from "../../scripts/verify-f1-evidence";

const digest = "a".repeat(64);

function evidencePaths(testFiles: readonly string[]): string[] {
  return [...new Set([
    ...testFiles,
    "docs/F1_DOMAIN_CONTRACT.md",
    "tests/fixtures/domain/f1-domain-contract.json",
    "tests/fixtures/domain/provenance-ledger.json",
    "tests/fixtures/domain/trace-ledger.json",
  ])].sort();
}

function passingCandidate(): Record<string, unknown> {
  return {
    schema: "changes.evidence.f1.v1",
    schemaVersion: 1,
    package: "F1",
    contractVersion: "1.0.1",
    domainSchema: "changes.progression.v2",
    runId: "synthetic-self-test-run",
    toolVersion: "jcpe.verify-f1-evidence.v1",
    mode: "focused-package",
    outcome: "pass",
    findings: [],
    input: {
      pre: {
        algorithm: "sha256-component-manifest-v1",
        digest,
        components: [{
          group: "production",
          path: "src/domain/index.ts",
          bytes: 1,
          sha256: digest,
        }],
      },
      post: {
        algorithm: "sha256-component-manifest-v1",
        digest,
        components: [],
      },
    },
    seeds: structuredClone(F1_REVIEWED_SEEDS),
    counters: structuredClone(F1_REVIEWED_COUNTERS),
    applicability: structuredClone(F1_APPLICABILITY),
    suite: {
      command: ["bun", "test"],
      exitCode: 0,
      tests: 100,
      assertions: 1_000,
      failures: 0,
      errors: 0,
      skipped: 0,
      todos: 0,
      retries: 0,
      quarantined: 0,
      files: [...F1_FOCUSED_TEST_FILES].sort(),
    },
    observations: [
      {
        id: "F1-PROPERTY-PITCH",
        seed: 2_718_281_828,
        counters: { generated: 32 },
        digest,
        mutantsKilled: 2,
      },
      {
        id: "F1-PROPERTY-TIME",
        seed: { beat: 3_141_592_653, meter: 1_618_033_988 },
        counters: { pairs: 784 },
        digest,
        mutantsKilled: 2,
      },
      {
        id: "F1-PROPERTY-HARMONY",
        seed: 1_732_050_807,
        counters: { rows: 42 },
        digest,
        mutantsKilled: 6,
      },
      {
        id: "f1-copy-laws",
        seed: 1_414_213_562,
        counters: { generatedGraphs: 24 },
        digest,
        mutantsKilled: 672,
      },
    ],
    negativeControls: [
      { id: "F1-NC-PITCH-LAWS", survived: false, outcome: "killed", matchedTests: 1 },
      { id: "F1-NC-TIME-LAWS", survived: false, outcome: "killed", matchedTests: 1 },
      { id: "F1-NC-CHORD-VOICING-LAWS", survived: false, outcome: "killed", matchedTests: 1 },
      { id: "F1-NC-COPY-LAWS", survived: false, outcome: "killed", matchedTests: 1 },
    ],
    traces: F1_TRACE_DESCRIPTORS.map((descriptor) => ({
      traceId: descriptor.id,
      proofKinds: [...descriptor.proofKinds],
      requiredCaseIds: ["synthetic-case"],
      requiredFixturePrefixes: [],
      testFiles: [...descriptor.testFiles],
      evidencePaths: evidencePaths(descriptor.testFiles),
      observedTests: 1,
      deferredOwners: [...descriptor.deferredOwners],
      outcome: "pass",
    })),
  };
}

function codes(candidate: unknown, currentDigest = digest): string[] {
  return validateF1EvidenceCandidate(candidate, currentDigest).map(({ code }) => code);
}

describe("F1 evidence verifier self-controls", () => {
  test("accepts a complete current candidate without trusting its outcome field", () => {
    expect(validateF1EvidenceCandidate(passingCandidate(), digest)).toEqual([]);
  });

  test("rejects a missing trace and a duplicated replacement trace", () => {
    const missing = passingCandidate();
    const missingTraces = missing["traces"] as Array<Record<string, unknown>>;
    missingTraces.pop();
    expect(codes(missing)).toContain("F1_EVIDENCE_TRACE_INVENTORY");

    const duplicate = passingCandidate();
    const duplicateTraces = duplicate["traces"] as Array<Record<string, unknown>>;
    const firstTrace = duplicateTraces[0];
    if (firstTrace === undefined) throw new Error("missing trace authority");
    duplicateTraces[1] = structuredClone(firstTrace);
    expect(codes(duplicate)).toContain("F1_EVIDENCE_TRACE_DUPLICATE");
    expect(codes(duplicate)).toContain("F1_EVIDENCE_TRACE_INVENTORY");
  });

  test("rejects a stale evidence digest against current inputs", () => {
    expect(codes(passingCandidate(), "b".repeat(64))).toContain(
      "F1_EVIDENCE_INPUT_STALE",
    );
  });

  test("rejects malformed and skipped JUnit instead of parsing console prose", () => {
    const malformed = inspectF1JUnit(
      '<?xml version="1.0"?><testsuites tests="2" assertions="1" failures="0" skipped="0"><testcase file="a.test.ts" name="one" /></testsuites>',
    );
    expect(malformed.summary).toBeNull();
    expect(malformed.findings.map(({ code }) => code)).toContain(
      "F1_EVIDENCE_JUNIT_INVALID",
    );

    const skipped = inspectF1JUnit(
      '<?xml version="1.0"?><testsuites tests="1" assertions="0" failures="0" skipped="1"><testcase file="a.test.ts" name="one"><skipped /></testcase></testsuites>',
    );
    expect(skipped.summary?.skipped).toBe(1);
    const candidate = passingCandidate();
    (candidate["suite"] as Record<string, unknown>)["skipped"] = 1;
    expect(codes(candidate)).toContain("F1_EVIDENCE_SUITE_FAILED");
  });

  test("rejects reviewed seed and deterministic-counter drift", () => {
    const seedDrift = passingCandidate();
    ((seedDrift["seeds"] as Array<Record<string, unknown>>)[0] as Record<string, unknown>)["value"] = 1;
    expect(codes(seedDrift)).toContain("F1_EVIDENCE_SEED_DRIFT");

    const counterDrift = passingCandidate();
    ((counterDrift["counters"] as Array<Record<string, unknown>>)[0] as Record<string, unknown>)["value"] = 9;
    expect(codes(counterDrift)).toContain("F1_EVIDENCE_COUNTER_DRIFT");
  });

  test("rejects any surviving source-level mutation control", () => {
    const candidate = passingCandidate();
    const control = (candidate["negativeControls"] as Array<Record<string, unknown>>)[0];
    if (control === undefined) throw new Error("missing synthetic negative control");
    control["survived"] = true;
    control["outcome"] = "survived";
    expect(codes(candidate)).toContain("F1_EVIDENCE_MUTATION_SURVIVED");
  });

  test("rejects input drift and circular generated-output authority", () => {
    const drift = passingCandidate();
    const input = drift["input"] as Record<string, Record<string, unknown>>;
    if (input["post"] === undefined) throw new Error("missing synthetic post snapshot");
    input["post"]["digest"] = "c".repeat(64);
    expect(codes(drift)).toContain("F1_EVIDENCE_INPUT_STALE");

    const circular = passingCandidate();
    const circularInput = circular["input"] as Record<string, Record<string, unknown>>;
    const pre = circularInput["pre"];
    if (pre === undefined) throw new Error("missing synthetic pre snapshot");
    pre["components"] = [{
      group: "generated",
      path: "test-results/f1-evidence-ledger.json",
      bytes: 1,
      sha256: digest,
    }];
    expect(codes(circular)).toContain("F1_EVIDENCE_INPUT_CIRCULAR");
  });
});
