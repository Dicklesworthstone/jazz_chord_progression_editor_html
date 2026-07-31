import { mkdir } from "node:fs/promises";
import { cpus, platform, release, totalmem } from "node:os";

import ts from "typescript";

import { atomicWrite, sha256Hex, stableJson } from "./foundation-io";
import { findRealNode } from "./toolchain-doctor";
import {
  auditF2MutationControls,
  type F2MutationCaseObservation,
  type F2MutationControlAudit,
} from "./verify-f2-mutation-controls";
import manifestFixture from "../tests/fixtures/decoder/f2-decoder-contract.json";
import traceFixture from "../tests/fixtures/decoder/trace-ledger.json";

type JsonRecord = Record<string, unknown>;
type Outcome = "pass" | "fail";

export type F2EvidenceFinding = Readonly<{
  code: string;
  path: string;
  message: string;
  traceId: string | null;
}>;

type InputComponent = Readonly<{
  group: string;
  path: string;
  bytes: number;
  sha256: string;
}>;

type InputSnapshot = Readonly<{
  algorithm: "sha256-component-manifest-v1";
  digest: string;
  components: readonly InputComponent[];
}>;

export type F2JUnitSummary = Readonly<{
  tests: number;
  assertions: number;
  failures: number;
  errors: number;
  skipped: number;
  files: readonly string[];
  cases: readonly Readonly<{ file: string; name: string }>[];
}>;

type RawExecution = Readonly<{
  command: readonly string[];
  environment: Readonly<Record<string, string>>;
  stdoutPath: string;
  stderrPath: string;
  stdoutSha256: string;
  stderrSha256: string;
  exitCode: number;
  signal: string | null;
  elapsedMs: number;
  resourceUsage: Readonly<{
    measurement: "Bun.Subprocess.resourceUsage";
    maxRssRaw: number | null;
    maxRssRawUnit: "bytes" | "kilobytes" | "runtime-defined";
    maxRssBytes: number | null;
    cpuUserMicros: number | null;
    cpuSystemMicros: number | null;
    gating: false;
  }>;
}>;

type SuiteEvidence = RawExecution & Readonly<{
  junitPath: string;
  junitSha256: string;
  tests: number;
  assertions: number;
  failures: number;
  errors: number;
  skipped: number;
  todos: number;
  retries: number;
  quarantined: number;
  files: readonly string[];
  cases: readonly Readonly<{ file: string; name: string }>[];
}>;

type RunMetadataIdentity = Readonly<{
  schema: "changes.evidence.f2.run-metadata.v1";
  path: string;
  sha256: string;
}>;

type TraceEvidence = Readonly<{
  traceId: string;
  parentClause: string;
  sourceRefs: readonly string[];
  proofKinds: readonly string[];
  requiredCaseIds: readonly string[];
  testFiles: readonly string[];
  evidencePaths: readonly string[];
  caseEvidence: readonly Readonly<{
    caseId: string;
    evidenceId: string;
    evidenceSha256: string;
  }>[];
  observedTests: number;
  outcome: Outcome;
}>;

type TestIdentity = Readonly<{ file: string; name: string }>;

export type F2SpecialCaseEvidence = Readonly<{
  caseId: string;
  channel: F2MutationCaseObservation["channel"];
  evidenceId: string;
  evidenceSha256: string;
  testCases: readonly TestIdentity[];
  outcome: Outcome;
}>;

type MutationMapping = Readonly<{
  id: string;
  owner: "F2" | "E0";
  fault: string;
  caseIds: readonly string[];
}>;

export type F2EvidenceLedger = Readonly<{
  schema: "changes.evidence.f2.v1";
  schemaVersion: 1;
  package: "F2";
  traceId: "F2";
  contractVersion: string;
  contractSchema: string;
  runId: string;
  toolVersion: "jcpe.verify-f2-evidence.v1";
  mode: "focused-package";
  outcome: Outcome;
  findings: readonly F2EvidenceFinding[];
  artifact: Readonly<{
    path: "jazz_chord_progression_editor.html";
    sha256: string;
    bytes: number;
  }>;
  browserVersions: readonly [];
  input: Readonly<{ pre: InputSnapshot; post: InputSnapshot }>;
  environment: Readonly<{
    bun: string;
    nodeCompatibility: string;
    platform: string;
    release: string;
    architecture: string;
    cpuCount: number;
    cpuModel: string;
    totalMemoryBytes: number;
    locale: string;
    timeZone: string;
  }>;
  versions: readonly Readonly<{ name: string; version: string }>[];
  runMetadata: RunMetadataIdentity;
  reviewedSeeds: readonly unknown[];
  seedDigests: Readonly<Record<string, string>>;
  reviewedCounters: Readonly<Record<string, number>>;
  applicability: readonly Readonly<{
    id: string;
    applicability: "applicable" | "not-applicable" | "deferred";
    owner: string;
    reason: string;
  }>[];
  validator: RawExecution & Readonly<{
    schema: string;
    outcome: Outcome;
    counts: Readonly<Record<string, number>>;
    findings: readonly unknown[];
  }>;
  suite: SuiteEvidence;
  traces: readonly TraceEvidence[];
  conformanceObservation: F2ConformanceObservation;
  specialCaseEvidence: readonly F2SpecialCaseEvidence[];
  mutationEvidence: Readonly<{
    classification: "reviewed-exact-case-implication-not-source-mutant-execution";
    caseObservations: readonly F2MutationCaseObservation[];
    audit: F2MutationControlAudit;
  }>;
}>;

type F2ConformanceObservation = Readonly<{
  schema: "changes.evidence.f2-conformance-observation.v1";
  runtimeCaseIds: readonly string[];
  caseHashes: Readonly<Record<string, string>>;
  cells: 1_368;
  seedDigests: Readonly<Record<string, string>>;
  semanticDigest: string;
}>;

const TOOL_VERSION = "jcpe.verify-f2-evidence.v1" as const;
const OUTPUT_PATH = "test-results/f2-evidence-ledger.json";
const REVIEWED_CONTRACT_VERSION = manifestFixture.contractVersion;
const REVIEWED_CONTRACT_SCHEMA = manifestFixture.publicSurface.contractSchema;
const VALIDATOR_SCHEMA = "changes.validation.f2-contract.v1";

export const F2_FOCUSED_TEST_FILES = [
  "tests/static/f2-contract.test.ts",
  "tests/static/f2-production-decoder.test.ts",
  "tests/static/f2-mutation-controls.test.ts",
  "tests/static/f2-evidence.test.ts",
  "tests/conformance/f2-production-conformance.test.ts",
  "tests/conformance/f2-depth-boundary-evidence.test.ts",
  "tests/conformance/f2-reviewed-counter-oracles.test.ts",
  "tests/conformance/f2-freshness-host-evidence.test.ts",
] as const;

/*
 * Re-pinned 2026-07-31: the groove document field (51b1240) grew the shape
 * campaign by eight cells (1,017 -> 1,025; totals 1,360 -> 1,368, decoder
 * calls 5,440 -> 5,472) and changed the TIME seed's decoded playback shape.
 * The focused suite's own reviewed oracles moved with that landing; this
 * gate's mirror pins did not, which left f2-evidence red on a green tree.
 */
export const F2_SEED_DIGESTS = Object.freeze({
  "F2-SEED-BOUNDS": "4d582edc0fd4557c6b5f325e783d7a81a5abe67bbf43f518e09ad91b51970af2",
  "F2-SEED-CHORD": "26a3bd06842c4de0e3310507414651b7c8fe55dd235fc719b293ab660961cc7a",
  "F2-SEED-HOSTILE": "8358103a16311162d9559437f58df0a9466e4434dd69627baa3c5ad3653e6628",
  "F2-SEED-IDS": "76b9ffebf7a7f31242269ea460499d4765e0169fcd7fb6ceeb18241a92667f0a",
  "F2-SEED-ORDER": "8dfa51b0fc1f7c9538a1cb1b8570620cd93cb7bda5930f5e5c6a870d48a2b18c",
  "F2-SEED-SHAPE": "3fd433ba290d8f5a4e626ebaf2a6e94a75cc932b65cf249cd664aba8e1cb4495",
  "F2-SEED-TIME": "a180df41fae8ae0aa99b1380743e45a9d159705f26227c7f03ff98c188b002c8",
  "F2-SEED-UNICODE": "f5a00e190955eed19455eb55aeb031919a1b98cb73c2a744a28a14838dce02e0",
});

export const F2_INPUT_GROUPS = {
  contracts: [
    "AGENTS.md",
    "README.md",
    "docs/ARCHITECTURE.md",
    "docs/F2_DECODER_CONTRACT.md",
    "docs/REBUILD_PLAN.md",
  ],
  artifact: ["jazz_chord_progression_editor.html"],
  configuration: [
    "bun.lock",
    "bunfig.toml",
    "package.json",
    "tsconfig*.json",
  ],
  tools: [
    "scripts/foundation-io.ts",
    "scripts/f2-decoder-source-policy.ts",
    "scripts/validate-f2-contract.ts",
    "scripts/verify.ts",
    "scripts/verify-f2-evidence.ts",
    "scripts/verify-f2-mutation-controls.ts",
  ],
  fixtures: ["tests/fixtures/decoder/*.json"],
  production: ["src/domain/**/*"],
  testSupport: ["src/test-support/f2-*.ts"],
  tests: [...F2_FOCUSED_TEST_FILES],
} as const;

export const F2_APPLICABILITY = Object.freeze([
  { id: "structural-runtime", applicability: "applicable", owner: "F2", reason: "Public/private conformance, hostile inputs, exact limits, counters, and replay digests execute in Bun." },
  { id: "import-byte-binding", applicability: "deferred", owner: "E0", reason: "F2 proves the byte law; the adapter must bind it to the original payload before parse." },
  { id: "browser-audio-accessibility", applicability: "not-applicable", owner: "later packages", reason: "F2 is a synchronous pure Domain decoder with no browser, audio, or UI adapter." },
  { id: "cancellation-resume-stale-cleanup", applicability: "not-applicable", owner: "A0 and adapters", reason: "F2 is synchronous and revision-free; no lifecycle callback exists at this boundary." },
  { id: "external-state-purity", applicability: "applicable", owner: "F2", reason: "AST source policy rejects external application/audio/persistence state writes and runtime campaign observations require zero stateWrites callbacks." },
  { id: "mutation-control-discharge", applicability: "applicable", owner: "F2/verify", reason: "All 242 F2 controls require observed exact-case implications; source-mutant execution remains separately counted and is not claimed." },
] as const);

const EXPECTED_VALIDATOR_COUNTS = Object.freeze({
  companions: 4,
  shapeCases: 33,
  adversarialCases: 32,
  totalCases: 65,
  traces: 12,
  authorities: 5,
  seeds: 8,
  mutationControls: 244,
  objectSchemas: 21,
});

const EXPECTED_COUNTERS = Object.freeze({
  shapeCaseRecords: 33,
  adversarialCaseRecords: 32,
  runtimeShapeCells: 1_025,
  runtimeAdversarialCells: 343,
  counterGoldenCells: 3,
  materializedRuntimeCells: 1_368,
  publicCallsPerMaterializedCell: 2,
  privateCallsPerMaterializedCell: 2,
  mainCampaignDecoderCalls: 5_472,
  decoderEvidenceCounters: 28,
  harnessObservationCounters: 7,
  traceRecords: 12,
  stableSeeds: 8,
  mutationMappings: 244,
});

const FULL_CAMPAIGN_TEST: TestIdentity = Object.freeze({
  file: "tests/conformance/f2-production-conformance.test.ts",
  name: "runs every materialized cell through two public and two private fresh inputs",
});

const STATIC_SOURCE_POLICY_TEST_NAMES = Object.freeze([
  "accepts the independently authored mechanics witness",
  "rejects forbidden imports and extra implementation exports",
  "keeps private evidence seams and types out of the Domain index",
  "requires exact frozen operation keys and function identity",
  "rejects module let/var and unfrozen nested reference constants",
  "rejects frozen wrappers around mutable built-ins and functions",
  "rejects writes to module bindings and named function properties",
  "rejects global, browser, process, and storage state writes",
  "tracks external aliases and imported application state through helpers",
  "allows mutation of invocation-local state and shadowed global names",
  "requires exactly one own-key and descriptor snapshot routine",
  "rejects direct reads, destructuring, Reflect.get, and input helpers",
  "rejects every syntactic family of tainted writes",
  "rejects Object.assign, JSON.stringify, and tainted spread",
  "requires an explicit local depth worklist loop",
  "rejects direct and indirect recursion reachable from depth preflight",
  "requires both named counter-incrementing candidate factories",
  "rejects candidate literals outside factories and F1 result attachment",
  "forbids makeChordEvent even when its result is discarded",
  "rejects clocks, timers, any, double casts, and candidate assertions",
  "requires public/private wrappers to share one branch-free core",
  "finding order and source ranges are deterministic",
  "the real F2 decoder satisfies every settled production-source law",
] as const);

type SpecialCaseSpec = Readonly<{
  caseId: string;
  channel: F2MutationCaseObservation["channel"];
  evidenceId: string;
  requiredTests: readonly TestIdentity[];
}>;

const testIdentity = (file: string, name: string): TestIdentity => ({ file, name });

const SPECIAL_CASE_SPECS: readonly SpecialCaseSpec[] = Object.freeze([
  {
    caseId: "F2-IMPORT-001",
    channel: "deferred-e0-import",
    evidenceId: "special:F2-IMPORT-001:v1",
    requiredTests: [
      testIdentity("tests/static/f2-contract.test.ts", "accepts the complete authority set deterministically"),
      testIdentity("tests/static/f2-contract.test.ts", "locks the handoff document to the important executable decisions"),
    ],
  },
  {
    caseId: "F2-LIMIT-003",
    channel: "depth-boundary-evidence",
    evidenceId: "special:F2-LIMIT-003:v1",
    requiredTests: [
      testIdentity("tests/conformance/f2-depth-boundary-evidence.test.ts", "accepts depth 32 preflight with arrays counted and string brackets scalar"),
      testIdentity("tests/conformance/f2-depth-boundary-evidence.test.ts", "refuses depth 33 before candidate allocation"),
    ],
  },
  {
    caseId: "F2-MUTATION-001",
    channel: "deterministic-work-counters",
    evidenceId: "special:F2-MUTATION-001:v1",
    requiredTests: [
      testIdentity("tests/static/f2-mutation-controls.test.ts", "discharges reviewed controls from exact observed-case implication without claiming source mutants"),
      testIdentity("tests/static/f2-mutation-controls.test.ts", "revokes mapped discharge when one required observed case is absent"),
      testIdentity("tests/static/f2-mutation-controls.test.ts", "rejects an observation that is not bound to evidence by SHA-256"),
    ],
  },
  {
    caseId: "F2-STATE-001",
    channel: "state-side-effect-observations",
    evidenceId: "special:F2-STATE-001:v1",
    requiredTests: [
      testIdentity("tests/static/f2-production-decoder.test.ts", "rejects global, browser, process, and storage state writes"),
      testIdentity("tests/static/f2-production-decoder.test.ts", "tracks external aliases and imported application state through helpers"),
      testIdentity("tests/static/f2-production-decoder.test.ts", "allows mutation of invocation-local state and shadowed global names"),
      testIdentity("tests/static/f2-production-decoder.test.ts", "the real F2 decoder satisfies every settled production-source law"),
      FULL_CAMPAIGN_TEST,
    ],
  },
  {
    caseId: "F2-STATIC-001",
    channel: "static-source-policy",
    evidenceId: "special:F2-STATIC-001:v1",
    requiredTests: STATIC_SOURCE_POLICY_TEST_NAMES.map((name) =>
      testIdentity("tests/static/f2-production-decoder.test.ts", name)
    ),
  },
  {
    caseId: "F2-WORK-001",
    channel: "deterministic-work-counters",
    evidenceId: "special:F2-WORK-001:v1",
    requiredTests: [
      testIdentity("tests/conformance/f2-production-conformance.test.ts", "matches all counter goldens exactly"),
      FULL_CAMPAIGN_TEST,
      testIdentity("tests/conformance/f2-reviewed-counter-oracles.test.ts", "enforces both duplicate-cluster evidence records and invalid-sibling reachability"),
      testIdentity("tests/conformance/f2-reviewed-counter-oracles.test.ts", "enforces every reviewed timeline addition and exact PPQ tick witness"),
      testIdentity("tests/conformance/f2-reviewed-counter-oracles.test.ts", "enforces every reviewed two-symbol raw-diagnostic count before collapse"),
    ],
  },
]);

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compare);
}

function finding(
  code: string,
  path: string,
  message: string,
  traceId: string | null = null,
): F2EvidenceFinding {
  return { code, path, message, traceId };
}


function sortFindings(values: readonly F2EvidenceFinding[]): F2EvidenceFinding[] {
  const key = (value: F2EvidenceFinding): string =>
    [value.traceId ?? "", value.code, value.path, value.message].join("\u0000");
  return [...new Map(values.map((value) => [key(value), value])).values()]
    .sort((left, right) => compare(key(left), key(right)));
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function safeUsageNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

function xmlUnescape(value: string): string {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function xmlAttributes(source: string): Map<string, string> {
  const result = new Map<string, string>();
  const pattern = /([A-Za-z_:][A-Za-z0-9_.:-]*)="([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    const key = match[1];
    const value = match[2];
    if (key === undefined || value === undefined || result.has(key)) {
      throw new Error("duplicate or malformed XML attribute");
    }
    result.set(key, xmlUnescape(value));
  }
  return result;
}

export function sanitizeF2JUnit(xml: string): string {
  const sanitized = xml.replace(
    /(<testsuite\b[^>]*?)\s+hostname\s*=\s*(?:"[^"]*"|'[^']*')/g,
    "$1",
  );
  if (/\bhostname\s*=/.test(sanitized)) {
    throw new Error("F2_EVIDENCE_JUNIT_HOSTNAME: hostname was not sanitized");
  }
  return sanitized;
}

export function inspectF2JUnit(xml: string): Readonly<{
  summary: F2JUnitSummary | null;
  findings: readonly F2EvidenceFinding[];
}> {
  const findings: F2EvidenceFinding[] = [];
  try {
    const rootMatch = /<testsuites\b([^>]*)>/.exec(xml);
    if (rootMatch?.[1] === undefined || !xml.includes("</testsuites>")) {
      throw new Error("missing testsuites root or closing tag");
    }
    const root = xmlAttributes(rootMatch[1]);
    const count = (name: string, fallback = 0): number => {
      const value = root.get(name);
      if (value === undefined) return fallback;
      if (!/^(?:0|[1-9][0-9]*)$/.test(value)) throw new Error(`invalid ${name} count`);
      const parsed = Number(value);
      if (!Number.isSafeInteger(parsed)) throw new Error(`unsafe ${name} count`);
      return parsed;
    };
    const tests = count("tests");
    const assertions = count("assertions");
    const failures = count("failures");
    const errors = count("errors");
    const skipped = count("skipped");
    const cases: TestIdentity[] = [];
    let observedFailures = 0;
    let observedErrors = 0;
    let observedSkipped = 0;
    const testcasePattern = /<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g;
    let testcase: RegExpExecArray | null;
    while ((testcase = testcasePattern.exec(xml)) !== null) {
      const attributes = xmlAttributes(testcase[1] ?? "");
      const file = attributes.get("file");
      const name = attributes.get("name");
      if (file === undefined || file.length === 0 || name === undefined || name.length === 0) {
        throw new Error("testcase requires file and name attributes");
      }
      cases.push({ file: file.replaceAll("\\", "/"), name });
      const body = testcase[2] ?? "";
      observedFailures += (body.match(/<failure\b/g) ?? []).length;
      observedErrors += (body.match(/<error\b/g) ?? []).length;
      observedSkipped += (body.match(/<skipped\b/g) ?? []).length;
    }
    const caseKeys = cases.map(testIdentityKey);
    if (new Set(caseKeys).size !== caseKeys.length) throw new Error("duplicate testcase identity");
    if (tests !== cases.length) throw new Error("tests count does not match testcase inventory");
    if (failures !== observedFailures) throw new Error("failures count does not match testcase bodies");
    if (errors !== observedErrors) throw new Error("errors count does not match testcase bodies");
    if (skipped !== observedSkipped) {
      if (skipped === 0 || observedSkipped > skipped) {
        throw new Error("skipped count does not match testcase bodies");
      }
    }
    cases.sort((left, right) => compare(testIdentityKey(left), testIdentityKey(right)));
    return {
      summary: {
        tests,
        assertions,
        failures,
        errors,
        skipped,
        files: sortedUnique(cases.map(({ file }) => file)),
        cases,
      },
      findings,
    };
  } catch (error) {
    findings.push(finding(
      "F2_EVIDENCE_JUNIT_INVALID",
      "suite.junit",
      error instanceof Error ? error.message : "JUnit report is invalid.",
    ));
    return { summary: null, findings };
  }
}

function canonicalJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value).sort(compare).map((key) => [key, canonicalJsonValue(value[key])]),
  );
}

function sha256Sync(value: string): string {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(value);
  return hasher.digest("hex");
}

function testIdentityKey(value: TestIdentity): string {
  return `${value.file}\u0000${value.name}`;
}

function specialEvidenceDigest(
  caseId: string,
  channel: F2MutationCaseObservation["channel"],
  evidenceId: string,
  testCases: readonly TestIdentity[],
): string {
  return sha256Sync(JSON.stringify(canonicalJsonValue({
    caseId,
    channel,
    evidenceId,
    testCases,
  })));
}

export function buildF2SpecialCaseEvidence(
  summary: F2JUnitSummary,
  suiteOutcome: Outcome,
): Readonly<{
  rows: readonly F2SpecialCaseEvidence[];
  findings: readonly F2EvidenceFinding[];
}> {
  const findings: F2EvidenceFinding[] = [];
  const rows = SPECIAL_CASE_SPECS.map((spec) => {
    const matched: TestIdentity[] = [];
    for (const required of spec.requiredTests) {
      const occurrences = summary.cases.filter(
        (candidate) => testIdentityKey(candidate) === testIdentityKey(required),
      );
      if (occurrences.length !== 1) {
        findings.push(finding(
          "F2_EVIDENCE_SPECIAL_TESTCASE",
          `${spec.caseId}:${required.file}`,
          `Expected exactly one testcase named ${required.name}; found ${String(occurrences.length)}.`,
        ));
      } else {
        const observed = occurrences[0];
        if (observed !== undefined) matched.push(observed);
      }
    }
    matched.sort((left, right) => compare(testIdentityKey(left), testIdentityKey(right)));
    let complete = matched.length === spec.requiredTests.length;
    if (spec.caseId === "F2-STATIC-001") {
      const sourceFile = "tests/static/f2-production-decoder.test.ts";
      const observedInventory = summary.cases.filter(({ file }) => file === sourceFile)
        .map(testIdentityKey).sort(compare);
      const reviewedInventory = spec.requiredTests.map(testIdentityKey).sort(compare);
      if (stableJson(observedInventory) !== stableJson(reviewedInventory)) {
        complete = false;
        findings.push(finding(
          "F2_EVIDENCE_STATIC_TEST_INVENTORY",
          sourceFile,
          "F2-STATIC-001 requires the exact complete 23-test source-policy inventory.",
        ));
      }
    }
    return {
      caseId: spec.caseId,
      channel: spec.channel,
      evidenceId: spec.evidenceId,
      evidenceSha256: specialEvidenceDigest(
        spec.caseId,
        spec.channel,
        spec.evidenceId,
        matched,
      ),
      testCases: matched,
      outcome: complete && suiteOutcome === "pass" ? "pass" as const : "fail" as const,
    };
  });
  return { rows, findings: sortFindings(findings) };
}

export function buildF2MutationCaseObservations(
  observation: F2ConformanceObservation,
  specialEvidence: readonly F2SpecialCaseEvidence[],
): readonly F2MutationCaseObservation[] {
  return [
    ...observation.runtimeCaseIds.map((caseId) => ({
      caseId,
      channel: "runtime-conformance" as const,
      outcome: "pass" as const,
      evidenceId: `conformance:${caseId}`,
      evidenceSha256: observation.caseHashes[caseId] ?? "unavailable",
    })),
    ...specialEvidence
      .filter(({ caseId }) => caseId !== "F2-MUTATION-001")
      .map(({ caseId, channel, evidenceId, evidenceSha256, outcome }) => ({
        caseId,
        channel,
        outcome,
        evidenceId,
        evidenceSha256,
      })),
  ];
}

export function parseF2ConformanceObservation(output: string): Readonly<{
  observation: F2ConformanceObservation | null;
  findings: readonly F2EvidenceFinding[];
}> {
  const prefix = "F2_EVIDENCE_OBSERVATION ";
  const lines = output.split(/\r?\n/).filter((line) => line.includes(prefix));
  if (lines.length !== 1) {
    return {
      observation: null,
      findings: [finding(
        "F2_EVIDENCE_OBSERVATION_COUNT",
        "suite.output",
        `Expected exactly one post-conformance observation, found ${String(lines.length)}.`,
      )],
    };
  }
  try {
    const line = lines[0];
    if (line === undefined) throw new Error("observation line missing");
    const parsed: unknown = JSON.parse(line.slice(line.indexOf(prefix) + prefix.length));
    if (!isRecord(parsed) || !isRecord(parsed["caseHashes"]) || !isRecord(parsed["seedDigests"])) {
      throw new Error("observation must contain record caseHashes and seedDigests");
    }
    const runtimeCaseIds = Array.isArray(parsed["runtimeCaseIds"])
      ? parsed["runtimeCaseIds"].filter((value): value is string => typeof value === "string")
      : [];
    const caseHashes = Object.fromEntries(
      Object.entries(parsed["caseHashes"]).filter((entry): entry is [string, string] =>
        typeof entry[1] === "string"
      ),
    );
    const seedDigests = Object.fromEntries(
      Object.entries(parsed["seedDigests"]).filter((entry): entry is [string, string] =>
        typeof entry[1] === "string"
      ),
    );
    const semanticInput = {
      schema: parsed["schema"],
      runtimeCaseIds,
      caseHashes,
      cells: parsed["cells"],
      seedDigests,
    };
    const semanticDigest = sha256Sync(JSON.stringify(canonicalJsonValue(semanticInput)));
    if (
      parsed["schema"] !== "changes.evidence.f2-conformance-observation.v1" ||
      parsed["cells"] !== 1_368 ||
      runtimeCaseIds.length !== 59 ||
      new Set(runtimeCaseIds).size !== 59 ||
      stableJson(runtimeCaseIds) !== stableJson([...runtimeCaseIds].sort(compare)) ||
      stableJson(Object.keys(caseHashes)) !== stableJson(runtimeCaseIds) ||
      Object.values(caseHashes).some((digest) => !isSha256(digest)) ||
      stableJson(seedDigests) !== stableJson(F2_SEED_DIGESTS) ||
      parsed["semanticDigest"] !== semanticDigest
    ) throw new Error("observation counts, identities, digests, or semantic binding drifted");
    return {
      observation: {
        schema: "changes.evidence.f2-conformance-observation.v1",
        runtimeCaseIds,
        caseHashes,
        cells: 1_368,
        seedDigests,
        semanticDigest,
      },
      findings: [],
    };
  } catch (error) {
    return {
      observation: null,
      findings: [finding(
        "F2_EVIDENCE_OBSERVATION_INVALID",
        "suite.output",
        error instanceof Error ? error.message : "Conformance observation is invalid.",
      )],
    };
  }
}

export function inspectF2TestControls(path: string, source: string): F2EvidenceFinding[] {
  const findings: F2EvidenceFinding[] = [];
  const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const forbiddenMembers = new Set(["skip", "todo", "only", "failing", "skipIf", "todoIf", "quarantine"]);
  const testIdentifiers = new Set(["test", "it", "describe"]);
  const testNamespaces = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== "bun:test"
    ) continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings === undefined) continue;
    if (ts.isNamespaceImport(bindings)) {
      testNamespaces.add(bindings.name.text);
      continue;
    }
    for (const element of bindings.elements) {
      const imported = element.propertyName?.text ?? element.name.text;
      if (["test", "it", "describe"].includes(imported)) testIdentifiers.add(element.name.text);
    }
  }
  const namespaceBuilder = (expression: ts.Expression): boolean => {
    if (
      ts.isPropertyAccessExpression(expression) &&
      ts.isIdentifier(expression.expression) &&
      testNamespaces.has(expression.expression.text)
    ) return ["test", "it", "describe"].includes(expression.name.text);
    return ts.isElementAccessExpression(expression) &&
      ts.isIdentifier(expression.expression) &&
      testNamespaces.has(expression.expression.text) &&
      ts.isStringLiteral(expression.argumentExpression) &&
      ["test", "it", "describe"].includes(expression.argumentExpression.text);
  };
  const isTestBuilder = (expression: ts.Expression): boolean => {
    if (ts.isIdentifier(expression)) return testIdentifiers.has(expression.text);
    if (ts.isCallExpression(expression)) return isTestBuilder(expression.expression);
    if (
      ts.isParenthesizedExpression(expression) ||
      ts.isAsExpression(expression) ||
      ts.isNonNullExpression(expression) ||
      ts.isSatisfiesExpression(expression)
    ) return isTestBuilder(expression.expression);
    if (ts.isElementAccessExpression(expression)) {
      if (namespaceBuilder(expression)) return true;
      return isTestBuilder(expression.expression);
    }
    if (!ts.isPropertyAccessExpression(expression)) return false;
    if (namespaceBuilder(expression)) return true;
    return isTestBuilder(expression.expression);
  };
  let aliasesAdded = true;
  while (aliasesAdded) {
    aliasesAdded = false;
    const collectAliases = (node: ts.Node): void => {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer !== undefined &&
        isTestBuilder(node.initializer) &&
        !testIdentifiers.has(node.name.text)
      ) {
        testIdentifiers.add(node.name.text);
        aliasesAdded = true;
      }
      ts.forEachChild(node, collectAliases);
    };
    collectAliases(sourceFile);
  }
  const propertyNameText = (name: ts.PropertyName): string | null => {
    if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
    if (ts.isComputedPropertyName(name) && ts.isStringLiteral(name.expression)) {
      return name.expression.text;
    }
    return null;
  };
  const report = (node: ts.Node, code: string, message: string): void => {
    const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    findings.push(finding(
      code,
      `${path}:${String(position.line + 1)}:${String(position.character + 1)}`,
      message,
    ));
  };
  const visit = (node: ts.Node): void => {
    if (
      ts.isPropertyAccessExpression(node) &&
      forbiddenMembers.has(node.name.text) &&
      isTestBuilder(node.expression)
    ) {
      report(
        node,
        node.name.text === "todo" || node.name.text === "todoIf"
          ? "F2_EVIDENCE_TODO"
          : "F2_EVIDENCE_QUARANTINE",
        `Forbidden ${node.name.text} test control.`,
      );
    }
    if (
      ts.isElementAccessExpression(node) &&
      ts.isStringLiteral(node.argumentExpression) &&
      forbiddenMembers.has(node.argumentExpression.text) &&
      isTestBuilder(node.expression)
    ) {
      const member = node.argumentExpression.text;
      report(
        node,
        member === "todo" || member === "todoIf"
          ? "F2_EVIDENCE_TODO"
          : "F2_EVIDENCE_QUARANTINE",
        `Forbidden ${member} test control.`,
      );
    } else if (
      ts.isElementAccessExpression(node) &&
      !ts.isStringLiteral(node.argumentExpression) &&
      isTestBuilder(node.expression)
    ) {
      report(
        node,
        "F2_EVIDENCE_QUARANTINE",
        "Dynamic test-builder member access is forbidden because controls cannot be audited.",
      );
    }
    if (ts.isCallExpression(node)) {
      if (
        ts.isIdentifier(node.expression) &&
        /^(?:quarantine|quarantined|xit|xdescribe|xtest)$/.test(node.expression.text)
      ) {
        report(node, "F2_EVIDENCE_QUARANTINE", `Forbidden ${node.expression.text} test control.`);
      }
      for (const argument of node.arguments) {
        if (!ts.isObjectLiteralExpression(argument)) continue;
        for (const property of argument.properties) {
          if (
            (
              ts.isPropertyAssignment(property) ||
              ts.isShorthandPropertyAssignment(property) ||
              ts.isMethodDeclaration(property) ||
              ts.isGetAccessorDeclaration(property) ||
              ts.isSetAccessorDeclaration(property)
            ) && propertyNameText(property.name) === "retry"
          ) report(property, "F2_EVIDENCE_RETRY", "Per-test retry configuration is forbidden.");
        }
      }
      if (isTestBuilder(node.expression) && node.arguments.length >= 3) {
        const options = node.arguments[2];
        if (
          options !== undefined &&
          !ts.isNumericLiteral(options) &&
          !(ts.isPrefixUnaryExpression(options) && ts.isNumericLiteral(options.operand))
        ) {
          if (!ts.isObjectLiteralExpression(options)) {
            report(options, "F2_EVIDENCE_RETRY", "Indirect test options are forbidden.");
          } else if (options.properties.some(ts.isSpreadAssignment)) {
            report(options, "F2_EVIDENCE_RETRY", "Spread test options are forbidden.");
          } else if (options.properties.some((property) =>
            "name" in property &&
            ts.isComputedPropertyName(property.name) &&
            !ts.isStringLiteral(property.name.expression)
          )) {
            report(options, "F2_EVIDENCE_RETRY", "Non-literal computed test options are forbidden.");
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return findings;
}

async function expandPattern(pattern: string): Promise<string[]> {
  if (!pattern.includes("*")) return (await Bun.file(pattern).exists()) ? [pattern] : [];
  const result: string[] = [];
  for await (const path of new Bun.Glob(pattern).scan({ cwd: process.cwd(), dot: true, onlyFiles: true })) {
    result.push(path.replaceAll("\\", "/"));
  }
  return result.sort(compare);
}

async function snapshotInputs(): Promise<Readonly<{
  snapshot: InputSnapshot;
  findings: readonly F2EvidenceFinding[];
  controls: readonly F2EvidenceFinding[];
}>> {
  const findings: F2EvidenceFinding[] = [];
  const controls: F2EvidenceFinding[] = [];
  const paths = new Map<string, string>();
  for (const [group, patterns] of Object.entries(F2_INPUT_GROUPS)) {
    for (const pattern of patterns) {
      const matches = await expandPattern(pattern);
      if (matches.length === 0) findings.push(finding("F2_EVIDENCE_INPUT_MISSING", pattern, `Required ${group} input is missing.`));
      for (const path of matches) {
        const previous = paths.get(path);
        if (previous === undefined) paths.set(path, group);
        else findings.push(finding("F2_EVIDENCE_INPUT_DUPLICATE", path, `Input belongs to both ${previous} and ${group}.`));
      }
    }
  }
  const components: InputComponent[] = [];
  for (const [path, group] of [...paths].sort(([left], [right]) => compare(left, right))) {
    const bytes = new Uint8Array(await Bun.file(path).arrayBuffer());
    components.push({ group, path, bytes: bytes.byteLength, sha256: await sha256Hex(bytes) });
    if (group === "tests") controls.push(...inspectF2TestControls(path, new TextDecoder().decode(bytes)));
    if (path === "bunfig.toml" && !/^retry\s*=\s*0\s*$/m.test(new TextDecoder().decode(bytes))) {
      controls.push(finding("F2_EVIDENCE_RETRY", path, "Focused evidence requires [test] retry = 0."));
    }
  }
  return {
    snapshot: {
      algorithm: "sha256-component-manifest-v1",
      digest: await sha256Hex(stableJson(components)),
      components,
    },
    findings,
    controls,
  };
}

function suitePaths(runId: string): Readonly<{
  directory: string;
  junitPath: string;
  stdoutPath: string;
  stderrPath: string;
  validatorStdoutPath: string;
  validatorStderrPath: string;
  metadataPath: string;
}> {
  const directory = `test-results/f2-evidence-runs/${runId}`;
  return {
    directory,
    junitPath: `${directory}/focused-tests.junit.xml`,
    stdoutPath: `${directory}/focused-tests.stdout.txt`,
    stderrPath: `${directory}/focused-tests.stderr.txt`,
    validatorStdoutPath: `${directory}/contract-validator.stdout.json`,
    validatorStderrPath: `${directory}/contract-validator.stderr.txt`,
    metadataPath: `${directory}/run-metadata.json`,
  };
}

function runEnvironment(runId: string): Readonly<Record<string, string>> {
  return { TZ: "UTC", LC_ALL: "C", LANG: "C", BUN_OPTIONS: "", NODE_OPTIONS: "", F2_EVIDENCE_RUN_ID: runId };
}

function validatorCommand(): readonly string[] {
  return ["bun", "scripts/validate-f2-contract.ts"];
}

function focusedSuiteCommand(runId: string): readonly string[] {
  return [
    "bun", "test", ...F2_FOCUSED_TEST_FILES,
    "--max-concurrency=1", "--retry=0", "--reporter=junit",
    `--reporter-outfile=${suitePaths(runId).junitPath}`,
  ];
}

async function runRaw(
  command: readonly string[],
  environment: Readonly<Record<string, string>>,
  stdoutPath: string,
  stderrPath: string,
): Promise<RawExecution & Readonly<{ stdout: Uint8Array; stderr: Uint8Array }>> {
  const started = performance.now();
  const child = Bun.spawn({
    cmd: [process.execPath, ...command.slice(1)],
    cwd: process.cwd(),
    env: { ...process.env, ...environment },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdoutBuffer, stderrBuffer] = await Promise.all([
    child.exited,
    new Response(child.stdout).arrayBuffer(),
    new Response(child.stderr).arrayBuffer(),
  ]);
  const elapsedMs = Math.round((performance.now() - started) * 1_000) / 1_000;
  const stdout = new Uint8Array(stdoutBuffer);
  const stderr = new Uint8Array(stderrBuffer);
  await Promise.all([atomicWrite(stdoutPath, stdout), atomicWrite(stderrPath, stderr)]);
  const usage = child.resourceUsage();
  const maxRssRaw = safeUsageNumber(usage?.maxRSS);
  const maxRssRawUnit = platform() === "linux" ? "kilobytes" : platform() === "darwin" ? "bytes" : "runtime-defined";
  const maxRssBytes = maxRssRaw === null ? null : maxRssRawUnit === "kilobytes" ? maxRssRaw * 1_024 : maxRssRawUnit === "bytes" ? maxRssRaw : null;
  return {
    command,
    environment,
    stdoutPath,
    stderrPath,
    stdoutSha256: await sha256Hex(stdout),
    stderrSha256: await sha256Hex(stderr),
    exitCode,
    signal: child.signalCode,
    elapsedMs,
    resourceUsage: {
      measurement: "Bun.Subprocess.resourceUsage",
      maxRssRaw,
      maxRssRawUnit,
      maxRssBytes,
      cpuUserMicros: safeUsageNumber(usage?.cpuTime.user),
      cpuSystemMicros: safeUsageNumber(usage?.cpuTime.system),
      gating: false,
    },
    stdout,
    stderr,
  };
}

function executionRecord(
  value: RawExecution & Readonly<{ stdout: Uint8Array; stderr: Uint8Array }>,
): RawExecution {
  const { stdout, stderr, ...execution } = value;
  void stdout;
  void stderr;
  return execution;
}

function traceRecords(value: unknown): JsonRecord[] {
  if (!isRecord(value) || !Array.isArray(value["traces"])) return [];
  return value["traces"].filter(isRecord);
}

export function buildF2TraceEvidence(
  value: unknown,
  summary: F2JUnitSummary,
  observation: F2ConformanceObservation,
  specialEvidence: readonly F2SpecialCaseEvidence[],
): TraceEvidence[] {
  const specialByCase = new Map(specialEvidence.map((row) => [row.caseId, row]));
  const runtimeCases = new Set(observation.runtimeCaseIds);
  return traceRecords(value).map((record) => {
    const traceId = typeof record["id"] === "string" ? record["id"] : "invalid";
    const requiredCaseIds = Array.isArray(record["requiredCaseIds"])
      ? record["requiredCaseIds"].filter((item): item is string => typeof item === "string")
      : [];
    const caseEvidence: Array<{ caseId: string; evidenceId: string; evidenceSha256: string }> = [];
    const contributingTests = new Map<string, TestIdentity>();
    for (const caseId of requiredCaseIds) {
      if (runtimeCases.has(caseId)) {
        caseEvidence.push({
          caseId,
          evidenceId: `conformance:${caseId}`,
          evidenceSha256: observation.caseHashes[caseId] ?? "unavailable",
        });
        contributingTests.set(testIdentityKey(FULL_CAMPAIGN_TEST), FULL_CAMPAIGN_TEST);
        continue;
      }
      const special = specialByCase.get(caseId);
      if (special === undefined || special.outcome !== "pass") continue;
      caseEvidence.push({
        caseId,
        evidenceId: special.evidenceId,
        evidenceSha256: special.evidenceSha256,
      });
      for (const testCase of special.testCases) {
        contributingTests.set(testIdentityKey(testCase), testCase);
      }
    }
    const contributing = [...contributingTests.values()]
      .sort((left, right) => compare(testIdentityKey(left), testIdentityKey(right)));
    const testFiles = sortedUnique(contributing.map(({ file }) => file));
    const evidencePaths = sortedUnique([
      ...testFiles,
      "docs/F2_DECODER_CONTRACT.md",
      "tests/fixtures/decoder/f2-decoder-contract.json",
      "tests/fixtures/decoder/provenance-ledger.json",
      "tests/fixtures/decoder/trace-ledger.json",
    ]);
    return {
      traceId,
      parentClause: typeof record["parentClause"] === "string" ? record["parentClause"] : "",
      sourceRefs: Array.isArray(record["sourceRefs"]) ? record["sourceRefs"].filter((item): item is string => typeof item === "string") : [],
      proofKinds: Array.isArray(record["proofKinds"]) ? record["proofKinds"].filter((item): item is string => typeof item === "string") : [],
      requiredCaseIds,
      testFiles,
      evidencePaths,
      caseEvidence,
      observedTests: contributing.length,
      outcome:
        requiredCaseIds.length > 0 &&
        caseEvidence.length === requiredCaseIds.length &&
        caseEvidence.every(({ evidenceSha256 }) => isSha256(evidenceSha256)) &&
        contributing.every((required) => summary.cases.some(
          (candidate) => testIdentityKey(candidate) === testIdentityKey(required),
        ))
          ? "pass"
          : "fail",
    };
  });
}

export function validateF2TraceEvidenceRows(
  stored: unknown,
  reviewed: unknown,
  summary: F2JUnitSummary,
  observation: F2ConformanceObservation,
  specialEvidence: readonly F2SpecialCaseEvidence[],
): F2EvidenceFinding[] {
  const expected = buildF2TraceEvidence(
    reviewed,
    summary,
    observation,
    specialEvidence,
  );
  if (
    expected.length !== traceRecords(reviewed).length ||
    expected.some(({ outcome }) => outcome !== "pass") ||
    stableJson(stored) !== stableJson(expected)
  ) return [finding(
    "F2_EVIDENCE_TRACE_DRIFT",
    `${OUTPUT_PATH}#traces`,
    "Trace rows must recompute exactly from reviewed traces, testcase identities, runtime hashes, and special evidence.",
  )];
  return [];
}

export function validateF2MutationObservationBindings(
  stored: unknown,
  observation: F2ConformanceObservation,
  specialEvidence: readonly F2SpecialCaseEvidence[],
): F2EvidenceFinding[] {
  const expected = buildF2MutationCaseObservations(observation, specialEvidence);
  if (stableJson(stored) !== stableJson(expected)) return [finding(
    "F2_EVIDENCE_MUTATION_OBSERVATION_BINDING",
    `${OUTPUT_PATH}#mutationEvidence.caseObservations`,
    "Runtime and special mutation observations must use their canonical evidence IDs and exact bound digests.",
  )];
  return [];
}

function mutationMappings(value: unknown): MutationMapping[] {
  if (!isRecord(value) || !Array.isArray(value["mutationControls"])) return [];
  return value["mutationControls"].flatMap((item) => {
    if (!isRecord(item)) return [];
    const id = item["id"];
    const owner = item["owner"];
    const fault = item["fault"];
    const caseIds = item["caseIds"];
    if (
      typeof id !== "string" || (owner !== "F2" && owner !== "E0") ||
      typeof fault !== "string" || !Array.isArray(caseIds) ||
      caseIds.some((caseId) => typeof caseId !== "string")
    ) return [];
    return [{ id, owner, fault, caseIds: caseIds as string[] }];
  });
}

function environmentEvidence(): F2EvidenceLedger["environment"] {
  const processors = cpus();
  const resolved = Intl.DateTimeFormat().resolvedOptions();
  return {
    bun: Bun.version,
    nodeCompatibility: process.versions.node,
    platform: platform(),
    release: release(),
    architecture: process.arch,
    cpuCount: processors.length,
    cpuModel: processors[0]?.model ?? "unavailable",
    totalMemoryBytes: totalmem(),
    locale: resolved.locale,
    timeZone: resolved.timeZone,
  };
}

async function packageVersions(): Promise<ReadonlyArray<{ name: string; version: string }>> {
  const packageValue: unknown = await Bun.file("package.json").json();
  const versions = new Map<string, string>();
  if (isRecord(packageValue)) {
    for (const field of ["dependencies", "devDependencies"] as const) {
      const values = packageValue[field];
      if (!isRecord(values)) continue;
      for (const [name, version] of Object.entries(values)) if (typeof version === "string") versions.set(name, version);
    }
  }
  versions.set("bun", Bun.version);
  versions.set("compiler-node", (await findRealNode()).version);
  versions.set("node-compatibility", process.versions.node);
  return [...versions].sort(([left], [right]) => compare(left, right)).map(([name, version]) => ({ name, version }));
}

function exactKeys(value: JsonRecord, expected: readonly string[]): boolean {
  return stableJson(Object.keys(value).sort(compare)) === stableJson([...expected].sort(compare));
}

function nullableNonnegativeSafeInteger(value: unknown): boolean {
  return value === null || (
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0
  );
}

function validResourceUsage(value: unknown): boolean {
  if (!isRecord(value) || !exactKeys(value, [
    "measurement", "maxRssRaw", "maxRssRawUnit", "maxRssBytes",
    "cpuUserMicros", "cpuSystemMicros", "gating",
  ])) return false;
  const raw = value["maxRssRaw"];
  const unit = value["maxRssRawUnit"];
  const expectedBytes = raw === null
    ? null
    : unit === "kilobytes" && typeof raw === "number" && Number.isSafeInteger(raw) && raw >= 0
      ? raw * 1_024
      : unit === "bytes" && typeof raw === "number" && Number.isSafeInteger(raw) && raw >= 0
        ? raw
        : null;
  return value["measurement"] === "Bun.Subprocess.resourceUsage" &&
    value["gating"] === false &&
    nullableNonnegativeSafeInteger(raw) &&
    ["bytes", "kilobytes", "runtime-defined"].includes(String(unit)) &&
    nullableNonnegativeSafeInteger(value["maxRssBytes"]) &&
    value["maxRssBytes"] === expectedBytes &&
    nullableNonnegativeSafeInteger(value["cpuUserMicros"]) &&
    nullableNonnegativeSafeInteger(value["cpuSystemMicros"]);
}

export function inspectF2RuntimeMetadataShape(candidate: unknown): F2EvidenceFinding[] {
  const findings: F2EvidenceFinding[] = [];
  if (!isRecord(candidate)) return [finding("F2_EVIDENCE_RUNTIME_METADATA", OUTPUT_PATH, "Runtime metadata requires a ledger object.")];
  const environment = candidate["environment"];
  if (
    !isRecord(environment) ||
    !exactKeys(environment, [
      "bun", "nodeCompatibility", "platform", "release", "architecture",
      "cpuCount", "cpuModel", "totalMemoryBytes", "locale", "timeZone",
    ]) ||
    ["bun", "nodeCompatibility", "platform", "release", "architecture", "cpuModel", "locale", "timeZone"]
      .some((field) => typeof environment[field] !== "string" || environment[field].length === 0) ||
    typeof environment["cpuCount"] !== "number" || !Number.isSafeInteger(environment["cpuCount"]) || environment["cpuCount"] <= 0 ||
    typeof environment["totalMemoryBytes"] !== "number" || !Number.isSafeInteger(environment["totalMemoryBytes"]) || environment["totalMemoryBytes"] <= 0
  ) findings.push(finding("F2_EVIDENCE_ENVIRONMENT", `${OUTPUT_PATH}#environment`, "Complete exact host/runtime environment evidence is required."));
  const versions = candidate["versions"];
  const versionNames = Array.isArray(versions)
    ? versions.flatMap((value) => isRecord(value) && typeof value["name"] === "string" ? [value["name"]] : [])
    : [];
  if (
    !Array.isArray(versions) || versions.length === 0 ||
    versions.some((value) =>
      !isRecord(value) || !exactKeys(value, ["name", "version"]) ||
      typeof value["name"] !== "string" || value["name"].length === 0 ||
      typeof value["version"] !== "string" || value["version"].length === 0
    ) ||
    new Set(versionNames).size !== versions.length ||
    stableJson(versionNames) !== stableJson([...versionNames].sort(compare)) ||
    !versionNames.includes("compiler-node")
  ) findings.push(finding("F2_EVIDENCE_VERSIONS", `${OUTPUT_PATH}#versions`, "Sorted unique dependency/runtime versions are required."));
  for (const field of ["suite", "validator"] as const) {
    const execution = candidate[field];
    if (
      !isRecord(execution) ||
      typeof execution["elapsedMs"] !== "number" ||
      !Number.isFinite(execution["elapsedMs"]) || execution["elapsedMs"] < 0 ||
      !validResourceUsage(execution["resourceUsage"])
    ) findings.push(finding("F2_EVIDENCE_EXECUTION_METADATA", `${OUTPUT_PATH}#${field}`, `${field} elapsed/resource metadata is invalid.`));
  }
  return sortFindings(findings);
}

async function validateCurrentEnvironmentAndVersions(
  candidate: unknown,
): Promise<F2EvidenceFinding[]> {
  if (!isRecord(candidate)) return [];
  const findings: F2EvidenceFinding[] = [];
  if (stableJson(candidate["environment"]) !== stableJson(environmentEvidence())) {
    findings.push(finding("F2_EVIDENCE_ENVIRONMENT_DRIFT", `${OUTPUT_PATH}#environment`, "Stored environment differs from the current host/runtime."));
  }
  if (stableJson(candidate["versions"]) !== stableJson(await packageVersions())) {
    findings.push(finding("F2_EVIDENCE_VERSION_DRIFT", `${OUTPUT_PATH}#versions`, "Stored versions differ from the current package/tool inventory."));
  }
  return findings;
}

export function inspectF2EvidenceIdentity(candidate: unknown): F2EvidenceFinding[] {
  const findings: F2EvidenceFinding[] = [];
  if (!isRecord(candidate)) {
    return [finding("F2_EVIDENCE_IDENTITY_SHAPE", OUTPUT_PATH, "Evidence identity requires a ledger object.")];
  }
  if (
    candidate["contractVersion"] !== REVIEWED_CONTRACT_VERSION ||
    candidate["contractSchema"] !== REVIEWED_CONTRACT_SCHEMA
  ) findings.push(finding("F2_EVIDENCE_CONTRACT_IDENTITY", OUTPUT_PATH, "Contract version/schema must match the reviewed F2 manifest."));
  if (stableJson(candidate["browserVersions"]) !== stableJson([])) {
    findings.push(finding("F2_EVIDENCE_BROWSER_APPLICABILITY", `${OUTPUT_PATH}#browserVersions`, "F2 has no browser-version evidence cells."));
  }
  if (stableJson(candidate["applicability"]) !== stableJson(F2_APPLICABILITY)) {
    findings.push(finding("F2_EVIDENCE_APPLICABILITY", `${OUTPUT_PATH}#applicability`, "Applicability and deferred ownership must match exactly."));
  }
  const input = candidate["input"];
  const pre = isRecord(input) ? input["pre"] : undefined;
  const components = isRecord(pre) && Array.isArray(pre["components"])
    ? pre["components"].filter(isRecord)
    : [];
  const artifactComponent = components.find((component) =>
    component["path"] === "jazz_chord_progression_editor.html"
  );
  const artifact = candidate["artifact"];
  if (
    !isRecord(artifact) || !isRecord(artifactComponent) ||
    artifact["path"] !== "jazz_chord_progression_editor.html" ||
    artifact["sha256"] !== artifactComponent["sha256"] ||
    artifact["bytes"] !== artifactComponent["bytes"] ||
    !isSha256(artifact["sha256"]) ||
    typeof artifact["bytes"] !== "number" || !Number.isSafeInteger(artifact["bytes"]) || artifact["bytes"] < 0
  ) findings.push(finding("F2_EVIDENCE_ARTIFACT_IDENTITY", `${OUTPUT_PATH}#artifact`, "Artifact hash/bytes must match the input component exactly."));
  const runId = candidate["runId"];
  if (typeof runId !== "string" || !/^[a-f0-9]{24}$/.test(runId)) {
    findings.push(finding("F2_EVIDENCE_RUN_ID", `${OUTPUT_PATH}#runId`, "Run ID must be 24 lowercase hex characters."));
    return findings;
  }
  const paths = suitePaths(runId);
  const environment = runEnvironment(runId);
  const validator = candidate["validator"];
  if (
    !isRecord(validator) ||
    validator["schema"] !== VALIDATOR_SCHEMA ||
    stableJson(validator["command"]) !== stableJson(validatorCommand()) ||
    stableJson(validator["environment"]) !== stableJson(environment) ||
    validator["stdoutPath"] !== paths.validatorStdoutPath ||
    validator["stderrPath"] !== paths.validatorStderrPath ||
    !isSha256(validator["stdoutSha256"]) ||
    !isSha256(validator["stderrSha256"]) ||
    validator["signal"] !== null
  ) findings.push(finding("F2_EVIDENCE_VALIDATOR_IDENTITY", `${OUTPUT_PATH}#validator`, "Validator command, environment, paths, hashes, schema, and signal must be run-ID exact."));
  const suite = candidate["suite"];
  if (
    !isRecord(suite) ||
    stableJson(suite["command"]) !== stableJson(focusedSuiteCommand(runId)) ||
    stableJson(suite["environment"]) !== stableJson(environment) ||
    suite["stdoutPath"] !== paths.stdoutPath ||
    suite["stderrPath"] !== paths.stderrPath ||
    suite["junitPath"] !== paths.junitPath ||
    !isSha256(suite["stdoutSha256"]) ||
    !isSha256(suite["stderrSha256"]) ||
    !isSha256(suite["junitSha256"]) ||
    suite["signal"] !== null
  ) findings.push(finding("F2_EVIDENCE_SUITE_IDENTITY", `${OUTPUT_PATH}#suite`, "Suite command, environment, paths, hashes, and signal must be run-ID exact."));
  const metadata = candidate["runMetadata"];
  if (
    !isRecord(metadata) ||
    metadata["schema"] !== "changes.evidence.f2.run-metadata.v1" ||
    metadata["path"] !== paths.metadataPath ||
    !isSha256(metadata["sha256"])
  ) findings.push(finding("F2_EVIDENCE_RUN_METADATA_IDENTITY", `${OUTPUT_PATH}#runMetadata`, "Run metadata schema, path, and hash must be run-ID exact."));
  return sortFindings(findings);
}

export function validateF2EvidenceCandidate(
  candidate: unknown,
  currentInputDigest: string,
): F2EvidenceFinding[] {
  const findings: F2EvidenceFinding[] = [];
  if (!isRecord(candidate)) return [finding("F2_EVIDENCE_LEDGER_SHAPE", OUTPUT_PATH, "Ledger must be an object.")];
  if (
    candidate["schema"] !== "changes.evidence.f2.v1" || candidate["schemaVersion"] !== 1 ||
    candidate["package"] !== "F2" || candidate["traceId"] !== "F2" ||
    candidate["toolVersion"] !== TOOL_VERSION || candidate["mode"] !== "focused-package"
  ) findings.push(finding("F2_EVIDENCE_LEDGER_IDENTITY", OUTPUT_PATH, "Ledger identity is invalid."));
  if (candidate["outcome"] !== "pass" || !Array.isArray(candidate["findings"]) || candidate["findings"].length !== 0) {
    findings.push(finding("F2_EVIDENCE_STATUS", OUTPUT_PATH, "Healthy F2 evidence must pass with no findings."));
  }
  findings.push(...inspectF2EvidenceIdentity(candidate));
  findings.push(...inspectF2RuntimeMetadataShape(candidate));
  const input = candidate["input"];
  if (!isRecord(input) || !isRecord(input["pre"]) || !isRecord(input["post"])) {
    findings.push(finding("F2_EVIDENCE_INPUT_SHAPE", `${OUTPUT_PATH}#input`, "Pre/post input snapshots are required."));
  } else {
    const pre = input["pre"];
    const post = input["post"];
    if (
      pre["algorithm"] !== "sha256-component-manifest-v1" ||
      !isSha256(pre["digest"]) || pre["digest"] !== post["digest"] ||
      pre["digest"] !== currentInputDigest || stableJson(pre["components"]) !== stableJson(post["components"])
    ) findings.push(finding("F2_EVIDENCE_INPUT_STALE", `${OUTPUT_PATH}#input`, "Pre, post, and current component manifests must match."));
    if (
      !Array.isArray(pre["components"]) ||
      pre["digest"] !== sha256Sync(stableJson(pre["components"]))
    ) findings.push(finding("F2_EVIDENCE_INPUT_DIGEST", `${OUTPUT_PATH}#input.pre`, "Component bytes and hashes must bind the input digest."));
    const expectedRunId = sha256Sync(stableJson({
      toolVersion: TOOL_VERSION,
      inputDigest: pre["digest"],
      reviewedSeeds: candidate["reviewedSeeds"],
    })).slice(0, 24);
    if (candidate["runId"] !== expectedRunId) {
      findings.push(finding("F2_EVIDENCE_RUN_ID", `${OUTPUT_PATH}#runId`, "Run ID must derive from tool, input digest, and reviewed seeds."));
    }
  }
  const validator = candidate["validator"];
  if (!isRecord(validator) || validator["outcome"] !== "pass" || validator["exitCode"] !== 0 || stableJson(validator["counts"]) !== stableJson(EXPECTED_VALIDATOR_COUNTS)) {
    findings.push(finding("F2_EVIDENCE_VALIDATOR", `${OUTPUT_PATH}#validator`, "The independent contract validator must pass with exact counts."));
  }
  const suite = candidate["suite"];
  if (!isRecord(suite) || suite["exitCode"] !== 0 || suite["failures"] !== 0 || suite["errors"] !== 0 || suite["skipped"] !== 0 || suite["todos"] !== 0 || suite["retries"] !== 0 || suite["quarantined"] !== 0) {
    findings.push(finding("F2_EVIDENCE_SUITE", `${OUTPUT_PATH}#suite`, "Focused suite must pass with no skip, todo, retry, or quarantine."));
  } else if (stableJson(suite["files"]) !== stableJson([...F2_FOCUSED_TEST_FILES].sort(compare))) {
    findings.push(finding("F2_EVIDENCE_SUITE_INVENTORY", `${OUTPUT_PATH}#suite.files`, "Focused suite file inventory drifted."));
  }
  const storedCases: TestIdentity[] = isRecord(suite) && Array.isArray(suite["cases"])
    ? suite["cases"].flatMap((value): TestIdentity[] =>
        isRecord(value) && typeof value["file"] === "string" && typeof value["name"] === "string"
          ? [{ file: value["file"], name: value["name"] }]
          : []
      )
    : [];
  const storedSummary: F2JUnitSummary = {
    tests: isRecord(suite) && typeof suite["tests"] === "number" ? suite["tests"] : 0,
    assertions: isRecord(suite) && typeof suite["assertions"] === "number" ? suite["assertions"] : 0,
    failures: isRecord(suite) && typeof suite["failures"] === "number" ? suite["failures"] : 0,
    errors: isRecord(suite) && typeof suite["errors"] === "number" ? suite["errors"] : 0,
    skipped: isRecord(suite) && typeof suite["skipped"] === "number" ? suite["skipped"] : 0,
    files: isRecord(suite) && Array.isArray(suite["files"])
      ? suite["files"].filter((value): value is string => typeof value === "string")
      : [],
    cases: storedCases,
  };
  if (storedCases.length !== (isRecord(suite) && Array.isArray(suite["cases"]) ? suite["cases"].length : -1)) {
    findings.push(finding("F2_EVIDENCE_SUITE_CASES", `${OUTPUT_PATH}#suite.cases`, "Every stored testcase must have exact file/name identity."));
  }
  if (stableJson(candidate["reviewedCounters"]) !== stableJson(EXPECTED_COUNTERS)) {
    findings.push(finding("F2_EVIDENCE_COUNTERS", `${OUTPUT_PATH}#reviewedCounters`, "Reviewed execution and corpus counters drifted."));
  }
  if (stableJson(candidate["seedDigests"]) !== stableJson(F2_SEED_DIGESTS)) {
    findings.push(finding("F2_EVIDENCE_SEED_DIGESTS", `${OUTPUT_PATH}#seedDigests`, "All eight replay digests must match."));
  }
  const observation = candidate["conformanceObservation"];
  const parsedStoredObservation = parseF2ConformanceObservation(
    `F2_EVIDENCE_OBSERVATION ${JSON.stringify(observation)}`,
  );
  if (parsedStoredObservation.observation === null) {
    findings.push(finding("F2_EVIDENCE_OBSERVATION_INVALID", `${OUTPUT_PATH}#conformanceObservation`, "The 1,368-cell, 59-case, eight-seed observation is required."));
  }
  const expectedSpecial = buildF2SpecialCaseEvidence(storedSummary, "pass");
  findings.push(...expectedSpecial.findings);
  if (stableJson(candidate["specialCaseEvidence"]) !== stableJson(expectedSpecial.rows)) {
    findings.push(finding("F2_EVIDENCE_SPECIAL_DRIFT", `${OUTPUT_PATH}#specialCaseEvidence`, "All six non-runtime cases must bind their exact named testcase inventories and canonical digests."));
  }
  const settledObservation: F2ConformanceObservation = parsedStoredObservation.observation ?? {
      schema: "changes.evidence.f2-conformance-observation.v1",
      runtimeCaseIds: [],
      caseHashes: {},
      cells: 1_368 as const,
      seedDigests: {},
      semanticDigest: "unavailable",
    };
  findings.push(...validateF2TraceEvidenceRows(
    candidate["traces"],
    traceFixture,
    storedSummary,
    settledObservation,
    expectedSpecial.rows,
  ));
  const mutation = candidate["mutationEvidence"];
  const audit = isRecord(mutation) ? mutation["audit"] : undefined;
  if (
    !isRecord(mutation) ||
    mutation["classification"] !== "reviewed-exact-case-implication-not-source-mutant-execution" ||
    !isRecord(audit) || audit["outcome"] !== "pass" ||
    audit["claim"] !== "reviewed-exact-case-implication" ||
    !isRecord(audit["counts"]) ||
    audit["counts"]["reviewedControlsDischarged"] !== 242 ||
    audit["counts"]["e0Deferred"] !== 2 ||
    audit["counts"]["decoderSourceMutantsExecuted"] !== 0 ||
    audit["counts"]["decoderSourceMutantsKilled"] !== 0
  ) {
    findings.push(finding("F2_EVIDENCE_MUTATION_AUDIT", `${OUTPUT_PATH}#mutationEvidence`, "Mutation audit must discharge 242 reviewed controls by exact-case implication, defer 2 E0 controls, and claim zero source-mutant executions/kills."));
  } else {
    const storedObservations = Array.isArray(mutation["caseObservations"])
      ? mutation["caseObservations"].flatMap((value): F2MutationCaseObservation[] => {
          if (!isRecord(value)) return [];
          const caseId = value["caseId"];
          const channel = value["channel"];
          const outcome = value["outcome"];
          const evidenceId = value["evidenceId"];
          const evidenceSha256 = value["evidenceSha256"];
          const channels = [
            "runtime-conformance",
            "static-source-policy",
            "deterministic-work-counters",
            "depth-boundary-evidence",
            "state-side-effect-observations",
            "deferred-e0-import",
          ] as const;
          const selectedChannel = channels.find(
            (candidateChannel) => candidateChannel === channel,
          );
          if (
            typeof caseId !== "string" ||
            selectedChannel === undefined ||
            (outcome !== "pass" && outcome !== "fail") ||
            typeof evidenceId !== "string" ||
            typeof evidenceSha256 !== "string"
          ) return [];
          return [{ caseId, channel: selectedChannel, outcome, evidenceId, evidenceSha256 }];
        })
      : [];
    const expectedObservations = buildF2MutationCaseObservations(
      settledObservation,
      expectedSpecial.rows,
    );
    findings.push(...validateF2MutationObservationBindings(
      storedObservations,
      settledObservation,
      expectedSpecial.rows,
    ));
    const recomputed = auditF2MutationControls({
      controls: Array.isArray(audit["controls"]) ? audit["controls"] : [],
      runtimeCaseIds: new Set(parsedStoredObservation.observation?.runtimeCaseIds ?? []),
      caseObservations: expectedObservations,
      executedDecoderSourceMutantIds: new Set(),
      killedDecoderSourceMutantIds: new Set(),
    });
    if (
      storedObservations.length !== (Array.isArray(mutation["caseObservations"]) ? mutation["caseObservations"].length : -1) ||
      recomputed.reviewedLedgerSha256 !== "a564e4a7f7225b0959b770b41fdd622aa2b3c39698b42673aee089e1e2fdbae7" ||
      stableJson(recomputed) !== stableJson(audit)
    ) findings.push(finding("F2_EVIDENCE_MUTATION_AUDIT_DRIFT", `${OUTPUT_PATH}#mutationEvidence.audit`, "Stored mutation audit must recompute exactly from its controls, bound case observations, and runtime case IDs."));
  }
  return sortFindings(findings);
}

async function validateStoredRawEvidence(candidate: unknown): Promise<F2EvidenceFinding[]> {
  const findings: F2EvidenceFinding[] = [];
  if (!isRecord(candidate) || typeof candidate["runId"] !== "string") return findings;
  const suite = candidate["suite"];
  const validator = candidate["validator"];
  if (!isRecord(suite) || !isRecord(validator)) return findings;
  const paths = suitePaths(candidate["runId"]);
  const expected = [
    [suite["stdoutPath"], paths.stdoutPath, suite["stdoutSha256"]],
    [suite["stderrPath"], paths.stderrPath, suite["stderrSha256"]],
    [suite["junitPath"], paths.junitPath, suite["junitSha256"]],
    [validator["stdoutPath"], paths.validatorStdoutPath, validator["stdoutSha256"]],
    [validator["stderrPath"], paths.validatorStderrPath, validator["stderrSha256"]],
  ] as const;
  const loaded = new Map<string, Uint8Array>();
  for (const [declaredPath, expectedPath, declaredHash] of expected) {
    if (declaredPath !== expectedPath || !isSha256(declaredHash)) {
      findings.push(finding("F2_EVIDENCE_RAW_PATH", expectedPath, "Raw evidence path/hash escaped the deterministic run directory."));
      continue;
    }
    try {
      const bytes = new Uint8Array(await Bun.file(expectedPath).arrayBuffer());
      loaded.set(expectedPath, bytes);
      if (await sha256Hex(bytes) !== declaredHash) {
        findings.push(finding("F2_EVIDENCE_RAW_HASH", expectedPath, "Raw evidence bytes differ from the ledger hash."));
      }
    } catch (error) {
      findings.push(finding("F2_EVIDENCE_RAW_MISSING", expectedPath, error instanceof Error ? error.message : "Raw evidence is missing."));
    }
  }
  const metadata = candidate["runMetadata"];
  if (
    !isRecord(metadata) || metadata["path"] !== paths.metadataPath ||
    !isSha256(metadata["sha256"])
  ) {
    findings.push(finding("F2_EVIDENCE_RUN_METADATA_IDENTITY", paths.metadataPath, "Run metadata path/hash is invalid."));
  } else {
    try {
      const bytes = new Uint8Array(await Bun.file(paths.metadataPath).arrayBuffer());
      loaded.set(paths.metadataPath, bytes);
      if (await sha256Hex(bytes) !== metadata["sha256"]) {
        findings.push(finding("F2_EVIDENCE_RAW_HASH", paths.metadataPath, "Run metadata bytes differ from the ledger hash."));
      }
    } catch (error) {
      findings.push(finding("F2_EVIDENCE_RAW_MISSING", paths.metadataPath, error instanceof Error ? error.message : "Run metadata is missing."));
    }
  }
  const junitBytes = loaded.get(paths.junitPath);
  if (junitBytes !== undefined) {
    const junit = new TextDecoder().decode(junitBytes);
    if (sanitizeF2JUnit(junit) !== junit) findings.push(finding("F2_EVIDENCE_JUNIT_HOST", paths.junitPath, "Stored JUnit still contains a machine hostname."));
    const inspected = inspectF2JUnit(junit);
    findings.push(...inspected.findings);
    if (inspected.summary !== null) {
      for (const field of ["tests", "assertions", "failures", "errors", "skipped"] as const) {
        if (suite[field] !== inspected.summary[field]) findings.push(finding("F2_EVIDENCE_JUNIT_DRIFT", paths.junitPath, `Ledger ${field} differs from JUnit.`));
      }
      if (stableJson(suite["files"]) !== stableJson(inspected.summary.files) || stableJson(suite["cases"]) !== stableJson(inspected.summary.cases)) {
        findings.push(finding("F2_EVIDENCE_JUNIT_DRIFT", paths.junitPath, "Ledger file/testcase inventory differs from JUnit."));
      }
    }
  }
  const stdoutBytes = loaded.get(paths.stdoutPath);
  const stderrBytes = loaded.get(paths.stderrPath);
  if (stdoutBytes !== undefined && stderrBytes !== undefined) {
    const parsed = parseF2ConformanceObservation(
      `${new TextDecoder().decode(stdoutBytes)}\n${new TextDecoder().decode(stderrBytes)}`,
    );
    findings.push(...parsed.findings);
    if (stableJson(parsed.observation) !== stableJson(candidate["conformanceObservation"])) {
      findings.push(finding("F2_EVIDENCE_OBSERVATION_DRIFT", `${OUTPUT_PATH}#conformanceObservation`, "Ledger observation differs from raw focused-suite output."));
    }
  }
  const validatorBytes = loaded.get(paths.validatorStdoutPath);
  if (validatorBytes !== undefined) {
    try {
      const parsed: unknown = JSON.parse(new TextDecoder().decode(validatorBytes));
      if (!isRecord(parsed) || parsed["outcome"] !== validator["outcome"] || stableJson(parsed["counts"]) !== stableJson(validator["counts"]) || stableJson(parsed["findings"]) !== stableJson(validator["findings"])) {
        findings.push(finding("F2_EVIDENCE_VALIDATOR_DRIFT", paths.validatorStdoutPath, "Validator summary differs from its raw JSON."));
      }
    } catch (error) {
      findings.push(finding("F2_EVIDENCE_VALIDATOR_RAW", paths.validatorStdoutPath, error instanceof Error ? error.message : "Validator raw JSON is invalid."));
    }
  }
  const metadataBytes = loaded.get(paths.metadataPath);
  if (metadataBytes !== undefined) {
    try {
      const parsed: unknown = JSON.parse(new TextDecoder().decode(metadataBytes));
      const expectedMetadata = {
        schema: "changes.evidence.f2.run-metadata.v1",
        runId: candidate["runId"],
        environment: candidate["environment"],
        versions: candidate["versions"],
        validator: {
          elapsedMs: validator["elapsedMs"],
          resourceUsage: validator["resourceUsage"],
        },
        suite: {
          elapsedMs: suite["elapsedMs"],
          resourceUsage: suite["resourceUsage"],
        },
      };
      if (stableJson(parsed) !== stableJson(expectedMetadata)) {
        findings.push(finding("F2_EVIDENCE_RUN_METADATA_DRIFT", paths.metadataPath, "Raw run metadata differs from environment, versions, elapsed observations, or resource usage."));
      }
    } catch (error) {
      findings.push(finding("F2_EVIDENCE_RUN_METADATA_INVALID", paths.metadataPath, error instanceof Error ? error.message : "Run metadata JSON is invalid."));
    }
  }
  return sortFindings(findings);
}

async function readJson(path: string): Promise<unknown> {
  return Bun.file(path).json() as Promise<unknown>;
}

export async function verifyF2Evidence(): Promise<F2EvidenceLedger> {
  const pre = await snapshotInputs();
  const [manifestValue, adversarialValue, traceValue] = await Promise.all([
    readJson("tests/fixtures/decoder/f2-decoder-contract.json"),
    readJson("tests/fixtures/decoder/adversarial-cases.json"),
    readJson("tests/fixtures/decoder/trace-ledger.json"),
  ]);
  const manifest = isRecord(manifestValue) ? manifestValue : {};
  const reviewedSeeds = isRecord(adversarialValue) && Array.isArray(adversarialValue["stableSeeds"]) ? adversarialValue["stableSeeds"] : [];
  const runId = (await sha256Hex(stableJson({ toolVersion: TOOL_VERSION, inputDigest: pre.snapshot.digest, reviewedSeeds }))).slice(0, 24);
  const paths = suitePaths(runId);
  await mkdir(paths.directory, { recursive: true });
  const environment = runEnvironment(runId);
  const validatorRun = await runRaw(validatorCommand(), environment, paths.validatorStdoutPath, paths.validatorStderrPath);
  const validatorJson: unknown = (() => {
    try {
      const parsed: unknown = JSON.parse(
        new TextDecoder().decode(validatorRun.stdout),
      );
      return parsed;
    } catch {
      return null;
    }
  })();
  const suiteRun = await runRaw(focusedSuiteCommand(runId), environment, paths.stdoutPath, paths.stderrPath);
  const junit = await (async (): Promise<string> => {
    try {
      const sanitized = sanitizeF2JUnit(await Bun.file(paths.junitPath).text());
      await atomicWrite(paths.junitPath, sanitized);
      return sanitized;
    } catch {
      return "";
    }
  })();
  const inspected = inspectF2JUnit(junit);
  const summary = inspected.summary ?? { tests: 0, assertions: 0, failures: 0, errors: 0, skipped: 0, files: [], cases: [] };
  const parsedObservation = parseF2ConformanceObservation(
    `${new TextDecoder().decode(suiteRun.stdout)}\n${new TextDecoder().decode(suiteRun.stderr)}`,
  );
  const conformanceObservation = parsedObservation.observation ?? {
    schema: "changes.evidence.f2-conformance-observation.v1" as const,
    runtimeCaseIds: [],
    caseHashes: {},
    cells: 1_368 as const,
    seedDigests: {},
    semanticDigest: "unavailable",
  };
  const junitSha256 = await sha256Hex(junit);
  const post = await snapshotInputs();
  const controls = [...pre.controls, ...post.controls];
  const specialCaseEvidence = buildF2SpecialCaseEvidence(
    summary,
    suiteRun.exitCode === 0 ? "pass" : "fail",
  );
  const traces = buildF2TraceEvidence(
    traceValue,
    summary,
    conformanceObservation,
    specialCaseEvidence.rows,
  );
  const mappings = mutationMappings(adversarialValue);
  const caseObservations = buildF2MutationCaseObservations(
    conformanceObservation,
    specialCaseEvidence.rows,
  );
  const mutationAudit = auditF2MutationControls({
    controls: mappings,
    runtimeCaseIds: new Set(conformanceObservation.runtimeCaseIds),
    caseObservations,
    executedDecoderSourceMutantIds: new Set(),
    killedDecoderSourceMutantIds: new Set(),
  });
  const artifactComponent = pre.snapshot.components.find(({ path }) => path === "jazz_chord_progression_editor.html");
  const validatorRecord = isRecord(validatorJson) ? validatorJson : {};
  const hostEnvironment = environmentEvidence();
  const versions = await packageVersions();
  const runMetadataValue = {
    schema: "changes.evidence.f2.run-metadata.v1",
    runId,
    environment: hostEnvironment,
    versions,
    validator: {
      elapsedMs: validatorRun.elapsedMs,
      resourceUsage: validatorRun.resourceUsage,
    },
    suite: {
      elapsedMs: suiteRun.elapsedMs,
      resourceUsage: suiteRun.resourceUsage,
    },
  };
  const runMetadataJson = stableJson(runMetadataValue);
  await atomicWrite(paths.metadataPath, runMetadataJson);
  const preliminary: F2EvidenceLedger = {
    schema: "changes.evidence.f2.v1",
    schemaVersion: 1,
    package: "F2",
    traceId: "F2",
    contractVersion: typeof manifest["contractVersion"] === "string" ? manifest["contractVersion"] : "unavailable",
    contractSchema: isRecord(manifest["publicSurface"]) && typeof manifest["publicSurface"]["contractSchema"] === "string" ? manifest["publicSurface"]["contractSchema"] : "unavailable",
    runId,
    toolVersion: TOOL_VERSION,
    mode: "focused-package",
    outcome: "pass",
    findings: [],
    artifact: { path: "jazz_chord_progression_editor.html", sha256: artifactComponent?.sha256 ?? "unavailable", bytes: artifactComponent?.bytes ?? 0 },
    browserVersions: [],
    input: { pre: pre.snapshot, post: post.snapshot },
    environment: hostEnvironment,
    versions,
    runMetadata: {
      schema: "changes.evidence.f2.run-metadata.v1",
      path: paths.metadataPath,
      sha256: await sha256Hex(runMetadataJson),
    },
    reviewedSeeds,
    seedDigests: F2_SEED_DIGESTS,
    reviewedCounters: EXPECTED_COUNTERS,
    applicability: F2_APPLICABILITY,
    validator: {
      ...executionRecord(validatorRun),
      schema: typeof validatorRecord["schema"] === "string" ? validatorRecord["schema"] : "unavailable",
      outcome: validatorRecord["outcome"] === "pass" ? "pass" : "fail",
      counts: isRecord(validatorRecord["counts"]) ? Object.fromEntries(Object.entries(validatorRecord["counts"]).filter((entry): entry is [string, number] => typeof entry[1] === "number")) : {},
      findings: Array.isArray(validatorRecord["findings"]) ? validatorRecord["findings"] : [],
    },
    suite: {
      ...executionRecord(suiteRun),
      junitPath: paths.junitPath,
      junitSha256,
      tests: summary.tests,
      assertions: summary.assertions,
      failures: summary.failures,
      errors: summary.errors,
      skipped: summary.skipped,
      todos: controls.filter(({ code }) => code === "F2_EVIDENCE_TODO").length,
      retries: controls.filter(({ code }) => code === "F2_EVIDENCE_RETRY").length,
      quarantined: controls.filter(({ code }) => code === "F2_EVIDENCE_QUARANTINE").length,
      files: summary.files,
      cases: summary.cases,
    },
    traces,
    conformanceObservation,
    specialCaseEvidence: specialCaseEvidence.rows,
    mutationEvidence: {
      classification: "reviewed-exact-case-implication-not-source-mutant-execution",
      caseObservations,
      audit: mutationAudit,
    },
  };
  const rawFindings = await validateStoredRawEvidence(preliminary);
  const settled = await snapshotInputs();
  const settledCandidate: F2EvidenceLedger = {
    ...preliminary,
    input: { pre: pre.snapshot, post: settled.snapshot },
    suite: {
      ...preliminary.suite,
      todos: [...controls, ...settled.controls].filter(({ code }) => code === "F2_EVIDENCE_TODO").length,
      retries: [...controls, ...settled.controls].filter(({ code }) => code === "F2_EVIDENCE_RETRY").length,
      quarantined: [...controls, ...settled.controls].filter(({ code }) => code === "F2_EVIDENCE_QUARANTINE").length,
    },
  };
  const currentRuntimeFindings = await validateCurrentEnvironmentAndVersions(
    settledCandidate,
  );
  const structural = [
    ...pre.findings,
    ...pre.controls,
    ...post.findings,
    ...post.controls,
    ...settled.findings,
    ...settled.controls,
    ...inspected.findings,
    ...parsedObservation.findings,
    ...specialCaseEvidence.findings,
    ...rawFindings,
    ...currentRuntimeFindings,
    ...validateF2EvidenceCandidate(settledCandidate, settled.snapshot.digest),
  ];
  const findings = sortFindings(structural);
  const ledger: F2EvidenceLedger = {
    ...settledCandidate,
    outcome: findings.length === 0 && validatorRun.exitCode === 0 && suiteRun.exitCode === 0 && traces.every(({ outcome }) => outcome === "pass") && mutationAudit.outcome === "pass" ? "pass" : "fail",
    findings,
  };
  await atomicWrite(OUTPUT_PATH, stableJson(ledger));
  return ledger;
}

async function checkExisting(): Promise<Readonly<{ outcome: Outcome; findings: readonly F2EvidenceFinding[] }>> {
  let candidate: unknown;
  try {
    candidate = await readJson(OUTPUT_PATH);
  } catch (error) {
    return { outcome: "fail", findings: [finding("F2_EVIDENCE_LEDGER_MISSING", OUTPUT_PATH, error instanceof Error ? error.message : "Ledger unreadable.")] };
  }
  const current = await snapshotInputs();
  const raw = await validateStoredRawEvidence(candidate);
  const currentRuntime = await validateCurrentEnvironmentAndVersions(candidate);
  const settled = await snapshotInputs();
  const findings = sortFindings([
    ...current.findings,
    ...current.controls,
    ...raw,
    ...currentRuntime,
    ...settled.findings,
    ...settled.controls,
    ...(current.snapshot.digest === settled.snapshot.digest ? [] : [finding("F2_EVIDENCE_INPUT_STALE", `${OUTPUT_PATH}#input`, "Inputs changed during stored evidence verification.")]),
    ...validateF2EvidenceCandidate(candidate, settled.snapshot.digest),
  ]);
  return { outcome: findings.length === 0 ? "pass" : "fail", findings };
}

if (import.meta.main) {
  try {
    const args = process.argv.slice(2);
    if (args.length > 1 || (args.length === 1 && args[0] !== "--check")) throw new Error("Usage: bun scripts/verify-f2-evidence.ts [--check]");
    if (args[0] === "--check") {
      const result = await checkExisting();
      console.log(stableJson({ schema: "changes.evidence.f2.summary.v1", mode: "check", ledgerPath: OUTPUT_PATH, outcome: result.outcome, findings: result.findings }).trimEnd());
      process.exitCode = result.outcome === "pass" ? 0 : 1;
    } else {
      const evidence = await verifyF2Evidence();
      console.log(stableJson({
        schema: "changes.evidence.f2.summary.v1",
        mode: evidence.mode,
        ledgerPath: OUTPUT_PATH,
        outcome: evidence.outcome,
        runId: evidence.runId,
        tests: evidence.suite.tests,
        assertions: evidence.suite.assertions,
        traces: evidence.traces.length,
        reviewedF2ControlsDischarged: evidence.mutationEvidence.audit.counts.reviewedControlsDischarged,
        e0ControlsDeferred: evidence.mutationEvidence.audit.counts.e0Deferred,
        actualDecoderMutantsExecuted: evidence.mutationEvidence.audit.counts.decoderSourceMutantsExecuted,
        findings: evidence.findings,
      }).trimEnd());
      process.exitCode = evidence.outcome === "pass" ? 0 : 1;
    }
  } catch (error) {
    console.error(stableJson({ schema: TOOL_VERSION, outcome: "tool-failure", message: error instanceof Error ? error.message : "F2 evidence verification failed." }).trimEnd());
    process.exitCode = 2;
  }
}
