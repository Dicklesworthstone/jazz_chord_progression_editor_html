import { describe, expect, test } from "bun:test";

import {
  F2_APPLICABILITY,
  F2_FOCUSED_TEST_FILES,
  F2_SEED_DIGESTS,
  buildF2MutationCaseObservations,
  buildF2SpecialCaseEvidence,
  buildF2TraceEvidence,
  inspectF2JUnit,
  inspectF2EvidenceIdentity,
  inspectF2RuntimeMetadataShape,
  inspectF2TestControls,
  parseF2ConformanceObservation,
  sanitizeF2JUnit,
  validateF2EvidenceCandidate,
  validateF2MutationObservationBindings,
  validateF2TraceEvidenceRows,
} from "../../scripts/verify-f2-evidence";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, item]) => [key, canonical(item)]),
  );
}

function digest(value: unknown): string {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(JSON.stringify(canonical(value)));
  return hasher.digest("hex");
}

function passingIdentityCandidate(): Record<string, unknown> {
  const runId = "a".repeat(24);
  const hash = "b".repeat(64);
  const directory = `test-results/f2-evidence-runs/${runId}`;
  const environment = {
    TZ: "UTC",
    LC_ALL: "C",
    LANG: "C",
    BUN_OPTIONS: "",
    NODE_OPTIONS: "",
    F2_EVIDENCE_RUN_ID: runId,
  };
  const resourceUsage = {
    measurement: "Bun.Subprocess.resourceUsage",
    maxRssRaw: 10,
    maxRssRawUnit: "kilobytes",
    maxRssBytes: 10_240,
    cpuUserMicros: 1,
    cpuSystemMicros: 2,
    gating: false,
  };
  return {
    contractVersion: "1.0.0",
    contractSchema: "changes.domain.document-decoder-contract.v1",
    runId,
    browserVersions: [],
    applicability: structuredClone(F2_APPLICABILITY),
    environment: {
      bun: Bun.version,
      nodeCompatibility: process.versions.node,
      platform: process.platform,
      release: "synthetic",
      architecture: process.arch,
      cpuCount: 1,
      cpuModel: "synthetic",
      totalMemoryBytes: 1,
      locale: "en-US",
      timeZone: "UTC",
    },
    versions: [
      { name: "bun", version: Bun.version },
      { name: "compiler-node", version: "24.0.0" },
    ],
    runMetadata: {
      schema: "changes.evidence.f2.run-metadata.v1",
      path: `${directory}/run-metadata.json`,
      sha256: hash,
    },
    input: {
      pre: {
        components: [{
          group: "artifact",
          path: "jazz_chord_progression_editor.html",
          bytes: 42,
          sha256: hash,
        }],
      },
    },
    artifact: {
      path: "jazz_chord_progression_editor.html",
      bytes: 42,
      sha256: hash,
    },
    validator: {
      schema: "changes.validation.f2-contract.v1",
      command: ["bun", "scripts/validate-f2-contract.ts"],
      environment,
      stdoutPath: `${directory}/contract-validator.stdout.json`,
      stderrPath: `${directory}/contract-validator.stderr.txt`,
      stdoutSha256: hash,
      stderrSha256: hash,
      signal: null,
      elapsedMs: 1,
      resourceUsage,
    },
    suite: {
      command: [
        "bun", "test", ...F2_FOCUSED_TEST_FILES,
        "--max-concurrency=1", "--retry=0", "--reporter=junit",
        `--reporter-outfile=${directory}/focused-tests.junit.xml`,
      ],
      environment,
      stdoutPath: `${directory}/focused-tests.stdout.txt`,
      stderrPath: `${directory}/focused-tests.stderr.txt`,
      junitPath: `${directory}/focused-tests.junit.xml`,
      stdoutSha256: hash,
      stderrSha256: hash,
      junitSha256: hash,
      signal: null,
      elapsedMs: 1,
      resourceUsage,
    },
  };
}

describe("F2 evidence verifier self-controls", () => {
  test("parses a sanitized exact JUnit inventory", () => {
    const xml = `<?xml version="1.0"?><testsuites tests="1" assertions="2" failures="0" errors="0" skipped="0"><testsuite name="file" hostname="machine"><testcase name="proof" file="tests/proof.test.ts" /></testsuite></testsuites>`;
    const sanitized = sanitizeF2JUnit(xml);
    expect(sanitized).not.toContain("hostname");
    expect(inspectF2JUnit(sanitized)).toEqual({
      summary: {
        tests: 1,
        assertions: 2,
        failures: 0,
        errors: 0,
        skipped: 0,
        files: ["tests/proof.test.ts"],
        cases: [{ file: "tests/proof.test.ts", name: "proof" }],
      },
      findings: [],
    });
  });

  test("rejects hidden testcase failures, duplicate identities, and unclosed roots", () => {
    const hiddenFailure = `<testsuites tests="1" assertions="1" failures="0" errors="0" skipped="0"><testcase name="proof" file="tests/proof.test.ts"><failure /></testcase></testsuites>`;
    expect(inspectF2JUnit(hiddenFailure).summary).toBeNull();
    expect(inspectF2JUnit(hiddenFailure).findings[0]?.code)
      .toBe("F2_EVIDENCE_JUNIT_INVALID");
    const duplicate = `<testsuites tests="2" assertions="2" failures="0" errors="0" skipped="0"><testcase name="proof" file="tests/proof.test.ts" /><testcase name="proof" file="tests/proof.test.ts" /></testsuites>`;
    expect(inspectF2JUnit(duplicate).summary).toBeNull();
    expect(inspectF2JUnit(hiddenFailure.replace("</testsuites>", "")).summary)
      .toBeNull();
  });

  test("rejects skipped, todo, only, failing, and x-prefixed controls by AST", () => {
    const findings = inspectF2TestControls("synthetic.test.ts", `
      test.skip("skip", () => {});
      test.todo("todo");
      describe.only("only", () => {});
      test.failing("failing", () => {});
      xit("xit", () => {});
    `);
    expect(findings).toHaveLength(5);
    expect(new Set(findings.map(({ code }) => code))).toEqual(
      new Set(["F2_EVIDENCE_QUARANTINE", "F2_EVIDENCE_TODO"]),
    );
  });

  test("rejects conditional, computed, imported, aliased, quarantined, and retry controls", () => {
    const findings = inspectF2TestControls("synthetic.test.ts", `
      import { test as spec } from "bun:test";
      import * as bt from "bun:test";
      const alias = spec;
      alias.skipIf(true)("skip", () => {});
      spec.todoIf(true)("todo", () => {});
      bt.test["failing"]("failing", () => {});
      const dynamic = "skip";
      alias[dynamic]("dynamic", () => {});
      quarantine("known flaky");
      spec("retry", () => {}, { retry: 2 });
    `);
    expect(findings.map(({ code }) => code)).toContain("F2_EVIDENCE_TODO");
    expect(findings.map(({ code }) => code)).toContain("F2_EVIDENCE_QUARANTINE");
    expect(findings.map(({ code }) => code)).toContain("F2_EVIDENCE_RETRY");
    expect(findings).toHaveLength(6);
  });

  test("rejects malformed ledgers and keeps reviewed inventories explicit", () => {
    expect(validateF2EvidenceCandidate({}, "a".repeat(64)).map(({ code }) => code))
      .toContain("F2_EVIDENCE_LEDGER_IDENTITY");
    expect(F2_FOCUSED_TEST_FILES).toHaveLength(8);
    expect(Object.keys(F2_SEED_DIGESTS)).toHaveLength(8);
    expect(Object.values(F2_SEED_DIGESTS).every((value) => /^[a-f0-9]{64}$/.test(value)))
      .toBe(true);
  });

  test("rejects case-hash and semantic-digest tampering in stored observations", () => {
    const runtimeCaseIds = Array.from(
      { length: 59 },
      (_, index) => `F2-SYNTHETIC-${String(index).padStart(2, "0")}`,
    );
    const caseHashes = Object.fromEntries(
      runtimeCaseIds.map((caseId) => [caseId, "a".repeat(64)]),
    );
    const semantic = {
      schema: "changes.evidence.f2-conformance-observation.v1",
      runtimeCaseIds,
      caseHashes,
      cells: 1_368,
      seedDigests: F2_SEED_DIGESTS,
    };
    const observation = { ...semantic, semanticDigest: digest(semantic) };
    const line = (value: unknown): string =>
      `F2_EVIDENCE_OBSERVATION ${JSON.stringify(value)}`;
    expect(parseF2ConformanceObservation(line(observation)).findings).toEqual([]);

    const hashTamper = structuredClone(observation);
    hashTamper.caseHashes[runtimeCaseIds[0] ?? ""] = "b".repeat(64);
    expect(parseF2ConformanceObservation(line(hashTamper)).findings)
      .toHaveLength(1);
    expect(parseF2ConformanceObservation(line({
      ...observation,
      semanticDigest: "b".repeat(64),
    })).findings).toHaveLength(1);
  });

  test("binds manifest, artifact, applicability, commands, paths, and run environment", () => {
    const candidate = passingIdentityCandidate();
    expect(inspectF2EvidenceIdentity(candidate)).toEqual([]);

    const contract = structuredClone(candidate);
    contract["contractVersion"] = "9.9.9";
    expect(inspectF2EvidenceIdentity(contract).map(({ code }) => code))
      .toContain("F2_EVIDENCE_CONTRACT_IDENTITY");

    const artifact = structuredClone(candidate);
    (artifact["artifact"] as Record<string, unknown>)["sha256"] = "c".repeat(64);
    expect(inspectF2EvidenceIdentity(artifact).map(({ code }) => code))
      .toContain("F2_EVIDENCE_ARTIFACT_IDENTITY");

    const command = structuredClone(candidate);
    (command["suite"] as Record<string, unknown>)["command"] = ["bun", "test"];
    expect(inspectF2EvidenceIdentity(command).map(({ code }) => code))
      .toContain("F2_EVIDENCE_SUITE_IDENTITY");

    const validator = structuredClone(candidate);
    (validator["validator"] as Record<string, unknown>)["stdoutPath"] = "elsewhere.json";
    expect(inspectF2EvidenceIdentity(validator).map(({ code }) => code))
      .toContain("F2_EVIDENCE_VALIDATOR_IDENTITY");

    const metadata = structuredClone(candidate);
    (metadata["runMetadata"] as Record<string, unknown>)["path"] = "elsewhere.json";
    expect(inspectF2EvidenceIdentity(metadata).map(({ code }) => code))
      .toContain("F2_EVIDENCE_RUN_METADATA_IDENTITY");
  });

  test("rejects fabricated environment, versions, elapsed time, and resource metadata", () => {
    const candidate = passingIdentityCandidate();
    expect(inspectF2RuntimeMetadataShape(candidate)).toEqual([]);

    const environment = structuredClone(candidate);
    (environment["environment"] as Record<string, unknown>)["cpuCount"] = 0;
    expect(inspectF2RuntimeMetadataShape(environment).map(({ code }) => code))
      .toContain("F2_EVIDENCE_ENVIRONMENT");

    const versions = structuredClone(candidate);
    versions["versions"] = [{ name: "bun", version: "" }];
    expect(inspectF2RuntimeMetadataShape(versions).map(({ code }) => code))
      .toContain("F2_EVIDENCE_VERSIONS");

    const elapsed = structuredClone(candidate);
    (elapsed["suite"] as Record<string, unknown>)["elapsedMs"] = -1;
    expect(inspectF2RuntimeMetadataShape(elapsed).map(({ code }) => code))
      .toContain("F2_EVIDENCE_EXECUTION_METADATA");

    const resource = structuredClone(candidate);
    (resource["validator"] as Record<string, unknown>)["resourceUsage"] = {
      measurement: "invented",
      gating: true,
    };
    expect(inspectF2RuntimeMetadataShape(resource).map(({ code }) => code))
      .toContain("F2_EVIDENCE_EXECUTION_METADATA");
  });

  test("requires both exact depth-boundary testcase identities for LIMIT-003", () => {
    const depthCases = [
      {
        file: "tests/conformance/f2-depth-boundary-evidence.test.ts",
        name: "accepts depth 32 preflight with arrays counted and string brackets scalar",
      },
      {
        file: "tests/conformance/f2-depth-boundary-evidence.test.ts",
        name: "refuses depth 33 before candidate allocation",
      },
    ];
    const summary = {
      tests: 2,
      assertions: 2,
      failures: 0,
      errors: 0,
      skipped: 0,
      files: ["tests/conformance/f2-depth-boundary-evidence.test.ts"],
      cases: depthCases,
    };
    const complete = buildF2SpecialCaseEvidence(summary, "pass").rows
      .find(({ caseId }) => caseId === "F2-LIMIT-003");
    expect(complete?.outcome).toBe("pass");
    const incomplete = buildF2SpecialCaseEvidence(
      { ...summary, tests: 1, cases: depthCases.slice(0, 1) },
      "pass",
    ).rows.find(({ caseId }) => caseId === "F2-LIMIT-003");
    expect(incomplete?.outcome).toBe("fail");
  });

  test("rejects stored trace-field tampering against recomputed exact case evidence", () => {
    const hash = "a".repeat(64);
    const observation = {
      schema: "changes.evidence.f2-conformance-observation.v1" as const,
      runtimeCaseIds: ["F2-RUNTIME-001"],
      caseHashes: { "F2-RUNTIME-001": hash },
      cells: 1_368 as const,
      seedDigests: F2_SEED_DIGESTS,
      semanticDigest: hash,
    };
    const summary = {
      tests: 1,
      assertions: 1,
      failures: 0,
      errors: 0,
      skipped: 0,
      files: ["tests/conformance/f2-production-conformance.test.ts"],
      cases: [{
        file: "tests/conformance/f2-production-conformance.test.ts",
        name: "runs every materialized cell through two public and two private fresh inputs",
      }],
    };
    const reviewed = { traces: [{
      id: "F2-TRACE-SYNTHETIC",
      parentClause: "synthetic clause",
      sourceRefs: ["synthetic#clause"],
      proofKinds: ["runtime"],
      requiredCaseIds: ["F2-RUNTIME-001"],
    }] };
    const rows = buildF2TraceEvidence(reviewed, summary, observation, []);
    expect(validateF2TraceEvidenceRows(rows, reviewed, summary, observation, []))
      .toEqual([]);
    const tampered = rows.map((row, index) =>
      index === 0 ? { ...row, parentClause: "tampered clause" } : row
    );
    expect(validateF2TraceEvidenceRows(tampered, reviewed, summary, observation, []))
      .toHaveLength(1);
  });

  test("rejects arbitrary runtime and special mutation observation IDs or digests", () => {
    const hash = "a".repeat(64);
    const observation = {
      schema: "changes.evidence.f2-conformance-observation.v1" as const,
      runtimeCaseIds: ["F2-RUNTIME-001"],
      caseHashes: { "F2-RUNTIME-001": hash },
      cells: 1_368 as const,
      seedDigests: F2_SEED_DIGESTS,
      semanticDigest: hash,
    };
    const special = [{
      caseId: "F2-LIMIT-003",
      channel: "depth-boundary-evidence" as const,
      evidenceId: "special:F2-LIMIT-003:v1",
      evidenceSha256: "b".repeat(64),
      testCases: [],
      outcome: "pass" as const,
    }];
    const rows = buildF2MutationCaseObservations(observation, special);
    expect(validateF2MutationObservationBindings(rows, observation, special))
      .toEqual([]);
    const runtimeTamper = rows.map((row, index) =>
      index === 0 ? { ...row, evidenceId: "arbitrary-runtime" } : row
    );
    expect(validateF2MutationObservationBindings(runtimeTamper, observation, special))
      .toHaveLength(1);
    const specialTamper = rows.map((row, index) =>
      index === 1 ? { ...row, evidenceSha256: "c".repeat(64) } : row
    );
    expect(validateF2MutationObservationBindings(specialTamper, observation, special))
      .toHaveLength(1);
  });
});
