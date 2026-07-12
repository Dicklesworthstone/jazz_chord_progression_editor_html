import { describe, expect, test } from "bun:test";

import { stableJson } from "../../scripts/foundation-io";
import { runNodeTool } from "../../scripts/run-node-tool";
import { inspectProjectSourcePolicy } from "../../scripts/source-policy";
import {
  F1_APPLICABILITY,
  F1_FOCUSED_TEST_FILES,
  F1_INPUT_GROUPS,
  F1_NEGATIVE_CONTROL_DESCRIPTORS,
  F1_REVIEWED_COUNTERS,
  F1_REVIEWED_SEEDS,
  F1_TRACE_DESCRIPTORS,
  inspectBunTestConfiguration,
  inspectForbiddenTestControls,
  inspectF1JUnit,
  sanitizeF1JUnit,
  validateF1EvidenceCandidate,
} from "../../scripts/verify-f1-evidence";

const digest = "a".repeat(64);

function sha256(value: string): string {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(value);
  return hasher.digest("hex");
}

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
  const components = [
    {
      group: "artifact",
      path: "jazz_chord_progression_editor.html",
      bytes: 2,
      sha256: "b".repeat(64),
    },
    {
      group: "production",
      path: "src/domain/index.ts",
      bytes: 1,
      sha256: digest,
    },
  ];
  const inputDigest = sha256(stableJson(components));
  const runId = sha256(stableJson({
    toolVersion: "jcpe.verify-f1-evidence.v1",
    inputDigest,
    seeds: F1_REVIEWED_SEEDS,
  })).slice(0, 24);
  const paths = {
    junitPath: `test-results/f1-evidence-runs/${runId}/focused-tests.junit.xml`,
    stdoutPath: `test-results/f1-evidence-runs/${runId}/focused-tests.stdout.txt`,
    stderrPath: `test-results/f1-evidence-runs/${runId}/focused-tests.stderr.txt`,
    metadataPath: `test-results/f1-evidence-runs/${runId}/run-metadata.json`,
  };
  const cases = [...F1_FOCUSED_TEST_FILES]
    .sort()
    .map((file) => ({ file, name: `synthetic proof for ${file}` }));
  const observations = [
    {
      id: "F1-CONTROL-COPY-BOUNDS",
      seed: 2_236_067_977,
      counters: { maximumSourceNodes: 73_793 },
      digest,
      mutantsKilled: 9,
    },
    {
      id: "F1-PROPERTY-HARMONY",
      seed: 1_732_050_807,
      counters: { rows: 42 },
      digest,
      mutantsKilled: 6,
    },
    {
      id: "F1-PROPERTY-PITCH",
      seed: 2_718_281_828,
      counters: { generated: 32 },
      digest,
      mutantsKilled: 4,
    },
    {
      id: "F1-PROPERTY-TIME",
      seed: { beat: 3_141_592_653, meter: 1_618_033_988 },
      counters: { pairs: 784 },
      digest,
      mutantsKilled: 4,
    },
    {
      id: "f1-copy-laws",
      seed: 1_414_213_562,
      counters: { generatedGraphs: 24 },
      digest,
      mutantsKilled: 960,
    },
  ];
  const candidate: Record<string, unknown> = {
    schema: "changes.evidence.f1.v1",
    schemaVersion: 1,
    package: "F1",
    traceId: "F1",
    contractVersion: "1.0.1",
    domainSchema: "changes.progression.v2",
    runId,
    toolVersion: "jcpe.verify-f1-evidence.v1",
    mode: "focused-package",
    outcome: "pass",
    findings: [],
    artifact: {
      path: "jazz_chord_progression_editor.html",
      sha256: "b".repeat(64),
      bytes: 2,
    },
    browserVersions: [],
    input: {
      pre: {
        algorithm: "sha256-component-manifest-v1",
        digest: inputDigest,
        components: structuredClone(components),
      },
      post: {
        algorithm: "sha256-component-manifest-v1",
        digest: inputDigest,
        components: structuredClone(components),
      },
    },
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
      { name: "compiler-node", version: "22.0.0" },
      { name: "node-compatibility", version: process.versions.node },
    ],
    seeds: structuredClone(F1_REVIEWED_SEEDS),
    counters: structuredClone(F1_REVIEWED_COUNTERS),
    applicability: structuredClone(F1_APPLICABILITY),
    suite: {
      command: [
        "bun",
        "test",
        ...F1_FOCUSED_TEST_FILES,
        "--max-concurrency=1",
        "--retry=0",
        "--reporter=junit",
        `--reporter-outfile=${paths.junitPath}`,
      ],
      environment: {
        TZ: "UTC",
        LC_ALL: "C",
        LANG: "C",
        BUN_OPTIONS: "",
        NODE_OPTIONS: "",
        F1_EVIDENCE_RUN_ID: runId,
      },
      ...paths,
      junitSha256: digest,
      stdoutSha256: digest,
      stderrSha256: digest,
      metadataSha256: digest,
      exitCode: 0,
      signal: null,
      tests: cases.length,
      assertions: cases.length,
      failures: 0,
      errors: 0,
      skipped: 0,
      todos: 0,
      retries: 0,
      quarantined: 0,
      files: [...F1_FOCUSED_TEST_FILES].sort(),
      cases,
      observationDigest: sha256(stableJson({ cases, observations })),
      elapsedMs: 1,
      resourceUsage: {
        measurement: "Bun.Subprocess.resourceUsage",
        maxRssRaw: null,
        maxRssRawUnit: "runtime-defined",
        maxRssBytes: null,
        cpuUserMicros: null,
        cpuSystemMicros: null,
        gating: false,
      },
    },
    observations,
    negativeControls: F1_NEGATIVE_CONTROL_DESCRIPTORS.map((descriptor) => ({
      ...descriptor,
      traceIds: [...descriptor.traceIds],
      seedIds: [...descriptor.seedIds],
      observedMutantsKilled: descriptor.expectedMutantsKilled,
      matchedTests: 1,
      survived: false,
      outcome: "killed",
    })),
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
  return candidate;
}

function currentCandidateDigest(candidate: unknown): string {
  if (!candidate || typeof candidate !== "object") return digest;
  const input = (candidate as Record<string, unknown>)["input"];
  if (!input || typeof input !== "object") return digest;
  const pre = (input as Record<string, unknown>)["pre"];
  if (!pre || typeof pre !== "object") return digest;
  const value = (pre as Record<string, unknown>)["digest"];
  return typeof value === "string" ? value : digest;
}

function codes(candidate: unknown, currentDigest = currentCandidateDigest(candidate)): string[] {
  return validateF1EvidenceCandidate(candidate, currentDigest).map(({ code }) => code);
}

describe("F1 evidence verifier self-controls", () => {
  test("compiles the actual F1 test project with zero TypeScript diagnostics", async () => {
    expect(await runNodeTool("tsc", [
      "-p",
      "tsconfig.f1-tests.json",
      "--noEmit",
      "--pretty",
      "false",
    ])).toBe(0);
  }, 180_000);

  test("runs source policy against the actual project tree", async () => {
    const report = await inspectProjectSourcePolicy();
    expect(report.outcome).toBe("pass");
    expect(report.findings).toEqual([]);
  }, 60_000);

  test("hashes the complete source tree and binds evidence after the build gate", async () => {
    expect(F1_INPUT_GROUPS.production).toEqual(["src/**/*"]);
    expect(F1_INPUT_GROUPS.configuration).toContain("bunfig.toml");
    const bunfig = await Bun.file(
      new URL("../../bunfig.toml", import.meta.url),
    ).text();
    expect(inspectBunTestConfiguration(bunfig)).toEqual([]);
    expect(inspectBunTestConfiguration("[test]\nretry = 1\n")).toMatchObject([
      { code: "F1_EVIDENCE_RETRY" },
    ]);
    expect(F1_INPUT_GROUPS.tools).toContain("scripts/verify.ts");
    const compilerConfig = await Bun.file(
      new URL("../../tsconfig.f1-tests.json", import.meta.url),
    ).json() as { files?: unknown };
    expect(compilerConfig.files).toEqual([...F1_FOCUSED_TEST_FILES]);
    const aggregate = await Bun.file(
      new URL("../../scripts/verify.ts", import.meta.url),
    ).text();
    const buildGate = aggregate.indexOf('id: "build"');
    const evidenceGate = aggregate.indexOf('id: "f1-evidence"');
    expect(buildGate).toBeGreaterThanOrEqual(0);
    expect(evidenceGate).toBeGreaterThan(buildGate);
  });

  test("removes the machine hostname before storing JUnit evidence", () => {
    const raw = '<?xml version="1.0"?><testsuites tests="0" assertions="0" failures="0" skipped="0"><testsuite name="x" hostname="private-host" tests="0" assertions="0" failures="0" skipped="0"></testsuite></testsuites>';
    const sanitized = sanitizeF1JUnit(raw);
    expect(sanitized).not.toContain("private-host");
    expect(sanitized).not.toContain("hostname=");
    expect(inspectF1JUnit(sanitized).findings).toEqual([]);
    const singleQuoted = sanitizeF1JUnit(
      "<testsuites tests=\"0\" assertions=\"0\" failures=\"0\" skipped=\"0\"><testsuite name=\"x\" hostname='private-host' tests=\"0\" assertions=\"0\" failures=\"0\" skipped=\"0\"></testsuite></testsuites>",
    );
    expect(singleQuoted).not.toContain("private-host");
    expect(singleQuoted).not.toContain("hostname");
  });

  test("rejects every direct, aliased, chained, and indirect strict-test control", () => {
    const findings = inspectForbiddenTestControls(
      "synthetic-controls.test.ts",
      [
        'import { test as t } from "bun:test";',
        'import * as bt from "bun:test";',
        "const retry = 2;",
        "const retryKey = 'retry';",
        "const strictMember = 'skip';",
        "const options = { retry: 2 };",
        "const local = test;",
        "test.failing('direct failing', () => {});",
        "t.failing('import alias failing', () => {});",
        "bt.test.failing('namespace failing', () => {});",
        "bt['test'].failing('namespace bracket failing', () => {});",
        "(test as typeof test).failing('transparent wrapper failing', () => {});",
        "test.each([[1]]).failing('chained failing', () => {});",
        "local.failing('local alias failing', () => {});",
        "test['only']('computed exclusive', () => {});",
        "test[strictMember]('dynamic strict control', () => {});",
        "test('direct retry', () => {}, { retry: 2 });",
        "test('shorthand retry', () => {}, { retry });",
        "test('computed retry', () => {}, { ['retry']: 2 });",
        "test('dynamic computed retry', () => {}, { [retryKey]: 3 });",
        "bt['test']('namespace bracket retry', () => {}, { [retryKey]: 3 });",
        "t('indirect retry', () => {}, options);",
        "test('spread retry', () => {}, { ...options });",
      ].join("\n"),
    );
    expect(findings.map(({ code }) => code).sort()).toEqual([
      "F1_EVIDENCE_QUARANTINE",
      "F1_EVIDENCE_QUARANTINE",
      "F1_EVIDENCE_QUARANTINE",
      "F1_EVIDENCE_QUARANTINE",
      "F1_EVIDENCE_QUARANTINE",
      "F1_EVIDENCE_QUARANTINE",
      "F1_EVIDENCE_QUARANTINE",
      "F1_EVIDENCE_QUARANTINE",
      "F1_EVIDENCE_QUARANTINE",
      "F1_EVIDENCE_RETRY",
      "F1_EVIDENCE_RETRY",
      "F1_EVIDENCE_RETRY",
      "F1_EVIDENCE_RETRY",
      "F1_EVIDENCE_RETRY",
      "F1_EVIDENCE_RETRY",
      "F1_EVIDENCE_RETRY",
    ]);
  });

  test("accepts a complete candidate after independently deriving every gate", () => {
    const candidate = passingCandidate();
    expect(
      validateF1EvidenceCandidate(candidate, currentCandidateDigest(candidate)),
    ).toEqual([]);
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

  test("rejects forged run identity, command, raw binding, and resource gates", () => {
    const runDrift = passingCandidate();
    runDrift["runId"] = "0".repeat(24);
    expect(codes(runDrift)).toContain("F1_EVIDENCE_RUN_ID");

    const commandDrift = passingCandidate();
    (commandDrift["suite"] as Record<string, unknown>)["command"] = ["true"];
    expect(codes(commandDrift)).toContain("F1_EVIDENCE_SUITE_COMMAND");

    const inheritedOptions = passingCandidate();
    const childEnvironment = (inheritedOptions["suite"] as Record<string, unknown>)["environment"];
    if (!childEnvironment || typeof childEnvironment !== "object") {
      throw new Error("missing child environment evidence");
    }
    (childEnvironment as Record<string, unknown>)["BUN_OPTIONS"] = "--retry=3";
    expect(codes(inheritedOptions)).toContain("F1_EVIDENCE_SUITE_ENVIRONMENT");

    const inheritedNodeOptions = passingCandidate();
    const nodeEnvironment = (inheritedNodeOptions["suite"] as Record<string, unknown>)["environment"];
    if (!nodeEnvironment || typeof nodeEnvironment !== "object") {
      throw new Error("missing compiler environment evidence");
    }
    (nodeEnvironment as Record<string, unknown>)["NODE_OPTIONS"] = "--require=shim.js";
    expect(codes(inheritedNodeOptions)).toContain("F1_EVIDENCE_SUITE_ENVIRONMENT");

    const rawDrift = passingCandidate();
    (rawDrift["suite"] as Record<string, unknown>)["junitSha256"] = "invented";
    expect(codes(rawDrift)).toContain("F1_EVIDENCE_SUITE_ARTIFACTS");

    const resourceDrift = passingCandidate();
    const resource = (resourceDrift["suite"] as Record<string, unknown>)["resourceUsage"];
    if (!resource || typeof resource !== "object") throw new Error("missing resource evidence");
    (resource as Record<string, unknown>)["gating"] = true;
    expect(codes(resourceDrift)).toContain("F1_EVIDENCE_RESOURCE_USAGE");
  });

  test("rejects forged cases, semantic digests, versions, and control coupling", () => {
    const caseDrift = passingCandidate();
    ((caseDrift["suite"] as Record<string, unknown>)["cases"] as unknown[]).pop();
    expect(codes(caseDrift)).toContain("F1_EVIDENCE_SUITE_CASES");
    expect(codes(caseDrift)).toContain("F1_EVIDENCE_OBSERVATION_DIGEST");

    const versionDrift = passingCandidate();
    versionDrift["versions"] = [{ name: "bun", version: Bun.version }];
    expect(codes(versionDrift)).toContain("F1_EVIDENCE_VERSIONS");

    const controlDrift = passingCandidate();
    const control = (controlDrift["negativeControls"] as Array<Record<string, unknown>>)[0];
    if (control === undefined) throw new Error("missing control evidence");
    control["observationId"] = "forged-observation";
    expect(codes(controlDrift)).toContain("F1_EVIDENCE_MUTATION_SURVIVED");
  });

  test("rejects a component hash edit without a matching manifest digest", () => {
    const candidate = passingCandidate();
    const input = candidate["input"] as Record<string, Record<string, unknown>>;
    const pre = input["pre"];
    if (pre === undefined) throw new Error("missing pre snapshot");
    const component = (pre["components"] as Array<Record<string, unknown>>)[0];
    if (component === undefined) throw new Error("missing component");
    component["sha256"] = "c".repeat(64);
    expect(codes(candidate)).toContain("F1_EVIDENCE_INPUT_DIGEST");
  });

  test("rejects unknown privacy-bearing fields and inconsistent stored status", () => {
    const topLevel = passingCandidate();
    topLevel["hostname"] = "private-host";
    expect(codes(topLevel)).toContain("F1_EVIDENCE_LEDGER_SHAPE");

    const suite = passingCandidate();
    (suite["suite"] as Record<string, unknown>)["hostname"] = "private-host";
    expect(codes(suite)).toContain("F1_EVIDENCE_SUITE_SHAPE");

    const artifact = passingCandidate();
    (artifact["artifact"] as Record<string, unknown>)["hostname"] = "private-host";
    expect(codes(artifact)).toContain("F1_EVIDENCE_ARTIFACT_IDENTITY");

    const status = passingCandidate();
    status["outcome"] = "fail";
    status["findings"] = [{ hostname: "private-host" }];
    expect(codes(status)).toContain("F1_EVIDENCE_LEDGER_STATUS");
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
