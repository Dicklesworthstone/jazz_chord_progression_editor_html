import { mkdir } from "node:fs/promises";
import { cpus, platform, release, totalmem } from "node:os";
import { resolve } from "node:path";

import ts from "typescript";

import { atomicWrite, sha256Hex, stableJson } from "./foundation-io";
import { findRealNode } from "./toolchain-doctor";

type JsonRecord = Record<string, unknown>;
type Outcome = "pass" | "fail";

export type F1EvidenceFinding = Readonly<{
  code: string;
  path: string;
  message: string;
  traceId: string | null;
}>;

export type F1JUnitSummary = Readonly<{
  tests: number;
  assertions: number;
  failures: number;
  errors: number;
  skipped: number;
  files: readonly string[];
  cases: readonly Readonly<{ file: string; name: string }>[];
}>;

export type F1TraceDescriptor = Readonly<{
  id: string;
  proofKinds: readonly string[];
  testFiles: readonly string[];
  deferredOwners: readonly string[];
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

type Seed = Readonly<{ id: string; value: number; purpose: string }>;
type Counter = Readonly<{ id: string; value: number; unit: string }>;

type Applicability = Readonly<{
  id: string;
  applicability: "applicable" | "not-applicable" | "deferred";
  owner: string;
  reason: string;
}>;

type F1Observation = Readonly<{
  id: string;
  seed: number | Readonly<Record<string, number>>;
  counters: Readonly<Record<string, unknown>>;
  digest: string;
  mutantsKilled: number;
}>;

type NegativeControl = Readonly<{
  id: string;
  file: string;
  testName: string;
  traceIds: readonly string[];
  seedIds: readonly string[];
  observationId: string;
  expectedMutantsKilled: number;
  observedMutantsKilled: number | null;
  matchedTests: number;
  survived: boolean;
  outcome: "killed" | "survived";
}>;

type TraceEvidence = Readonly<{
  traceId: string;
  proofKinds: readonly string[];
  requiredCaseIds: readonly string[];
  requiredFixturePrefixes: readonly string[];
  testFiles: readonly string[];
  evidencePaths: readonly string[];
  observedTests: number;
  deferredOwners: readonly string[];
  outcome: Outcome;
}>;

type SuiteEvidence = Readonly<{
  command: readonly string[];
  environment: Readonly<Record<string, string>>;
  junitPath: string;
  stdoutPath: string;
  stderrPath: string;
  metadataPath: string;
  junitSha256: string;
  stdoutSha256: string;
  stderrSha256: string;
  metadataSha256: string;
  exitCode: number;
  signal: string | null;
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
  observationDigest: string;
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

export type F1EvidenceLedger = Readonly<{
  schema: "changes.evidence.f1.v1";
  schemaVersion: 1;
  package: "F1";
  traceId: "F1";
  contractVersion: string;
  domainSchema: string;
  runId: string;
  toolVersion: "jcpe.verify-f1-evidence.v1";
  mode: "focused-package";
  outcome: Outcome;
  findings: readonly F1EvidenceFinding[];
  artifact: Readonly<{
    path: "jazz_chord_progression_editor.html";
    sha256: string;
    bytes: number;
  }>;
  browserVersions: readonly [];
  input: Readonly<{
    pre: InputSnapshot;
    post: InputSnapshot;
  }>;
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
  seeds: readonly Seed[];
  counters: readonly Counter[];
  applicability: readonly Applicability[];
  observations: readonly F1Observation[];
  negativeControls: readonly NegativeControl[];
  suite: SuiteEvidence;
  traces: readonly TraceEvidence[];
}>;

const TOOL_VERSION = "jcpe.verify-f1-evidence.v1" as const;
const OUTPUT_PATH = "test-results/f1-evidence-ledger.json";
const OBSERVATION_PREFIX = "F1_EVIDENCE_OBSERVATION ";

export const F1_FOCUSED_TEST_FILES = [
  "tests/domain/duration.test.ts",
  "tests/integration/f1-domain-package.test.ts",
  "tests/property/f1-copy-laws.test.ts",
  "tests/property/f1-domain-laws.test.ts",
  "tests/static/dependency-boundaries.test.ts",
  "tests/static/f1-chord-runtime-build.test.ts",
  "tests/static/f1-contract.test.ts",
  "tests/static/f1-domain-operations-runtime.test.ts",
  "tests/static/f1-domain-types.test.ts",
  "tests/static/f1-evidence.test.ts",
  "tests/static/f1-pitch-values-runtime.test.ts",
  "tests/static/f1-production-chord-conformance.test.ts",
  "tests/static/f1-production-conformance.test.ts",
  "tests/static/f1-production-values-conformance.test.ts",
  "tests/static/validated-document-cast-policy.test.ts",
  "tests/unit/f1-identity-copy.test.ts",
] as const;

export const F1_REVIEWED_SEEDS: readonly Seed[] = [
  { id: "F1-SEED-PITCH", value: 2_718_281_828, purpose: "spelling and pitch projection mutations" },
  { id: "F1-SEED-BEAT", value: 3_141_592_653, purpose: "rational normalization, closure, and ordering mutations" },
  { id: "F1-SEED-METER", value: 1_618_033_988, purpose: "meter capacity and measure completion mutations" },
  { id: "F1-SEED-IDENTITY", value: 1_414_213_562, purpose: "ID collision and deep-remap schedules" },
  { id: "F1-SEED-VOICING", value: 1_732_050_807, purpose: "voicing compatibility matrix mutations" },
  { id: "F1-SEED-BOUNDARY", value: 2_236_067_977, purpose: "decoder limit and malformed-shape mutations" },
];

export const F1_REVIEWED_COUNTERS: readonly Counter[] = [
  { id: "companion-files", value: 10, unit: "files" },
  { id: "fixture-case-records", value: 317, unit: "records" },
  { id: "trace-records", value: 18, unit: "records" },
  { id: "authority-records", value: 9, unit: "records" },
  { id: "stable-seeds", value: 6, unit: "seeds" },
  { id: "expected-diagnostic-codes", value: 85, unit: "codes" },
  { id: "public-domain-operations", value: 40, unit: "operations" },
  { id: "allowed-beat-divisors", value: 28, unit: "divisors" },
  { id: "pairwise-closure-checks", value: 784, unit: "ordered-pairs" },
  { id: "pairwise-additions", value: 784, unit: "ordered-pairs" },
  { id: "pairwise-comparisons", value: 784, unit: "ordered-pairs" },
  { id: "pairwise-subtraction-values", value: 406, unit: "ordered-pairs" },
  { id: "pairwise-subtraction-refusals", value: 378, unit: "ordered-pairs" },
  { id: "meter-capacity-core-cases", value: 15, unit: "cases" },
  { id: "meter-capacity-near-misses", value: 1, unit: "cases" },
  { id: "auto-voicing-matrix-cells", value: 42, unit: "cells" },
  { id: "custom-auto-refusal-cells", value: 42, unit: "cells" },
  { id: "copy-max-source-nodes", value: 73_793, unit: "nodes" },
  { id: "copy-max-source-visits", value: 147_586, unit: "visits" },
  { id: "copy-max-destination-visits", value: 73_793, unit: "visits" },
  { id: "copy-max-factory-calls", value: 73_793, unit: "calls" },
  { id: "copy-max-plan-passes", value: 3, unit: "passes" },
  { id: "copy-max-collision-index-entries", value: 221_379, unit: "entries" },
  { id: "copy-max-plan-remap-entries", value: 73_793, unit: "entries" },
  { id: "copy-max-auxiliary-entries", value: 295_172, unit: "entries" },
];

export const F1_APPLICABILITY: readonly Applicability[] = [
  { id: "domain-runtime", applicability: "applicable", owner: "F1", reason: "F1 owns synchronous pure domain values and copy operations." },
  { id: "deterministic-replay", applicability: "applicable", owner: "F1", reason: "Seeded property campaigns compare byte-identical semantic observation digests." },
  { id: "performance-observation", applicability: "applicable", owner: "F1/verify", reason: "Elapsed time and child resource usage are recorded as non-gating environment evidence; deterministic work counters are the gate." },
  { id: "cancellation", applicability: "not-applicable", owner: "A0/search packages", reason: "F1 operations are synchronous and accept no cancellation token." },
  { id: "resume", applicability: "not-applicable", owner: "application/search packages", reason: "F1 has no paused operation or resumable search state." },
  { id: "stale-revision", applicability: "not-applicable", owner: "A0", reason: "F1 accepts immutable values and has no document revision." },
  { id: "cleanup", applicability: "not-applicable", owner: "audio/browser/application packages", reason: "Pure synchronous F1 values acquire no timer, listener, node, handle, URL, or external resource." },
  { id: "browser", applicability: "not-applicable", owner: "U0-Q0", reason: "No F1 contract names a browser adapter or visible UI; later UI packages own browser evidence." },
  { id: "audio", applicability: "not-applicable", owner: "X0-X1", reason: "F1 defines data only and imports no audio layer; X0-X1 own audio evidence." },
  { id: "accessibility", applicability: "not-applicable", owner: "U0-Q0", reason: "F1 has no user interface surface; later UI and Q0 packages own accessibility evidence." },
];

const DURATION_TEST = "tests/domain/duration.test.ts";
const COPY_TEST = "tests/unit/f1-identity-copy.test.ts";
const DOMAIN_PROPERTY = "tests/property/f1-domain-laws.test.ts";
const COPY_PROPERTY = "tests/property/f1-copy-laws.test.ts";
const CHORD_TEST = "tests/static/f1-chord-runtime-build.test.ts";
const CHORD_CONFORMANCE = "tests/static/f1-production-chord-conformance.test.ts";
const VALUES_CONFORMANCE = "tests/static/f1-production-values-conformance.test.ts";
const PITCH_TEST = "tests/static/f1-pitch-values-runtime.test.ts";
const TYPE_TEST = "tests/static/f1-domain-types.test.ts";
const OPERATIONS_TEST = "tests/static/f1-domain-operations-runtime.test.ts";
const CONTRACT_TEST = "tests/static/f1-contract.test.ts";
const INTEGRATION_TEST = "tests/integration/f1-domain-package.test.ts";
const EVIDENCE_TEST = "tests/static/f1-evidence.test.ts";

export const F1_TRACE_DESCRIPTORS: readonly F1TraceDescriptor[] = [
  { id: "F1-TRACE-ID-STABILITY", proofKinds: ["positive", "boundary", "malformed"], testFiles: [COPY_TEST, VALUES_CONFORMANCE, COPY_PROPERTY], deferredOwners: ["A0", "P0", "E0"] },
  { id: "F1-TRACE-ID-TRANSACTION", proofKinds: ["positive", "collision", "exhaustion", "duplicate-path", "atomicity", "copy-bound"], testFiles: [COPY_TEST, COPY_PROPERTY, INTEGRATION_TEST], deferredOwners: [] },
  { id: "F1-TRACE-PITCH-IDENTITY", proofKinds: ["positive", "enharmonic-near-miss", "octave-near-miss", "comparator", "transposition"], testFiles: [PITCH_TEST, VALUES_CONFORMANCE, DOMAIN_PROPERTY], deferredOwners: ["H1"] },
  { id: "F1-TRACE-PITCH-MIDI", proofKinds: ["positive", "lower-bound", "upper-bound", "refusal", "malformed", "transposition"], testFiles: [PITCH_TEST, VALUES_CONFORMANCE, DOMAIN_PROPERTY], deferredOwners: ["H1"] },
  { id: "F1-TRACE-PITCH-FREQUENCY", proofKinds: ["golden", "boundary", "refusal"], testFiles: [PITCH_TEST, VALUES_CONFORMANCE, DOMAIN_PROPERTY], deferredOwners: [] },
  { id: "F1-TRACE-DEGREE-IDENTITY", proofKinds: ["positive", "near-miss", "malformed", "transposition", "stage-boundary"], testFiles: [CHORD_TEST, CHORD_CONFORMANCE, DOMAIN_PROPERTY], deferredOwners: ["F3", "H1"] },
  { id: "F1-TRACE-VOICING-EXACT", proofKinds: ["round-trip", "boundary", "refusal", "state-transition", "transposition"], testFiles: [CHORD_TEST, CHORD_CONFORMANCE, COPY_TEST, DOMAIN_PROPERTY], deferredOwners: ["H1"] },
  { id: "F1-TRACE-VOICING-CONDITIONAL", proofKinds: ["exhaustive-matrix", "positive", "near-miss", "malformed", "deferred-boundary"], testFiles: [CHORD_TEST, CHORD_CONFORMANCE, DOMAIN_PROPERTY], deferredOwners: ["F3"] },
  { id: "F1-TRACE-TIME-DENOMINATORS", proofKinds: ["exhaustive-enumeration", "pairwise-closure", "near-miss"], testFiles: [DURATION_TEST, DOMAIN_PROPERTY], deferredOwners: [] },
  { id: "F1-TRACE-TIME-ARITHMETIC", proofKinds: ["normalization", "pairwise-property", "overflow", "range-near-miss", "zero-fold"], testFiles: [DURATION_TEST, DOMAIN_PROPERTY], deferredOwners: [] },
  { id: "F1-TRACE-TIME-LIMITS", proofKinds: ["exact-boundary", "plus-one", "malformed", "preflight"], testFiles: [DURATION_TEST, COPY_TEST, VALUES_CONFORMANCE, COPY_PROPERTY], deferredOwners: ["F2"] },
  { id: "F1-TRACE-METER-CAPACITY", proofKinds: ["exhaustive-matrix", "near-miss", "boundary"], testFiles: [DURATION_TEST, VALUES_CONFORMANCE, DOMAIN_PROPERTY], deferredOwners: [] },
  { id: "F1-TRACE-MEASURE-STATE", proofKinds: ["all-states", "underfill", "overfill", "mismatch", "blank", "position-policy"], testFiles: [CONTRACT_TEST, TYPE_TEST, INTEGRATION_TEST], deferredOwners: ["F3"] },
  { id: "F1-TRACE-DOCUMENT-TYPES", proofKinds: ["positive", "empty", "vocabulary", "malformed"], testFiles: [TYPE_TEST, VALUES_CONFORMANCE, CHORD_CONFORMANCE, INTEGRATION_TEST, EVIDENCE_TEST], deferredOwners: ["F2"] },
  { id: "F1-TRACE-KEY-CONTEXT", proofKinds: ["vocabulary", "absent", "malformed"], testFiles: [PITCH_TEST, VALUES_CONFORMANCE, INTEGRATION_TEST], deferredOwners: [] },
  { id: "F1-TRACE-DECODER-RESULT", proofKinds: ["positive", "malformed", "multi-error-order", "transactional", "stage-boundary"], testFiles: [OPERATIONS_TEST, VALUES_CONFORMANCE, CHORD_CONFORMANCE, CONTRACT_TEST], deferredOwners: ["F2", "F3"] },
  { id: "F1-TRACE-BOUNDED-OPERATIONS", proofKinds: ["work-bound-declaration", "state-bound-declaration"], testFiles: [COPY_TEST, COPY_PROPERTY, CONTRACT_TEST], deferredOwners: [] },
  { id: "F1-TRACE-PURE-BOUNDARY", proofKinds: ["not-applicable-declaration", "downstream-ownership"], testFiles: [CONTRACT_TEST, OPERATIONS_TEST, INTEGRATION_TEST, "tests/static/dependency-boundaries.test.ts", "tests/static/validated-document-cast-policy.test.ts", EVIDENCE_TEST], deferredOwners: ["F2", "F3", "A0"] },
];

export const F1_NEGATIVE_CONTROL_DESCRIPTORS = [
  { id: "F1-NC-PITCH-LAWS", file: DOMAIN_PROPERTY, testName: "kills deliberately wrong pitch identity and projection observations", traceIds: ["F1-TRACE-PITCH-IDENTITY", "F1-TRACE-PITCH-MIDI", "F1-TRACE-PITCH-FREQUENCY"], seedIds: ["F1-SEED-PITCH"], observationId: "F1-PROPERTY-PITCH", expectedMutantsKilled: 4 },
  { id: "F1-NC-TIME-LAWS", file: DOMAIN_PROPERTY, testName: "kills deliberately wrong exact-time observations", traceIds: ["F1-TRACE-TIME-ARITHMETIC", "F1-TRACE-METER-CAPACITY"], seedIds: ["F1-SEED-BEAT", "F1-SEED-METER"], observationId: "F1-PROPERTY-TIME", expectedMutantsKilled: 4 },
  { id: "F1-NC-CHORD-VOICING-LAWS", file: DOMAIN_PROPERTY, testName: "kills deliberately wrong degree, Auto-policy, and stored-voicing observations", traceIds: ["F1-TRACE-DEGREE-IDENTITY", "F1-TRACE-VOICING-EXACT", "F1-TRACE-VOICING-CONDITIONAL"], seedIds: ["F1-SEED-VOICING"], observationId: "F1-PROPERTY-HARMONY", expectedMutantsKilled: 6 },
  { id: "F1-NC-COPY-LAWS", file: COPY_PROPERTY, testName: "kills injected copy-observation mutants with the independent oracle", traceIds: ["F1-TRACE-ID-STABILITY", "F1-TRACE-ID-TRANSACTION"], seedIds: ["F1-SEED-IDENTITY"], observationId: "f1-copy-laws", expectedMutantsKilled: 960 },
  { id: "F1-NC-COPY-BOUNDS", file: COPY_PROPERTY, testName: "kills reviewed copy-bound and planning-state mutants", traceIds: ["F1-TRACE-BOUNDED-OPERATIONS", "F1-TRACE-TIME-LIMITS"], seedIds: ["F1-SEED-BOUNDARY"], observationId: "F1-CONTROL-COPY-BOUNDS", expectedMutantsKilled: 9 },
] as const;

const EXPECTED_OBSERVATION_SEEDS = new Map<string, unknown>([
  ["F1-PROPERTY-PITCH", 2_718_281_828],
  ["F1-PROPERTY-TIME", { beat: 3_141_592_653, meter: 1_618_033_988 }],
  ["F1-PROPERTY-HARMONY", 1_732_050_807],
  ["f1-copy-laws", 1_414_213_562],
  ["F1-CONTROL-COPY-BOUNDS", 2_236_067_977],
]);

export const F1_INPUT_GROUPS = {
  contracts: [
    "AGENTS.md", "README.md", "docs/ARCHITECTURE.md",
    "docs/F1_DOMAIN_CONTRACT.md", "docs/REBUILD_PLAN.md",
  ],
  artifact: ["jazz_chord_progression_editor.html"],
  configuration: [
    "bun.lock", "bunfig.toml", "eslint.config.mjs", "package.json",
    "tsconfig*.json",
  ],
  tools: [
    "scripts/foundation-io.ts", "scripts/source-policy.ts",
    "scripts/run-node-tool.ts", "scripts/toolchain-doctor.ts",
    "scripts/validate-f1-contract.ts", "scripts/verify-f1-evidence.ts",
    "scripts/verify.ts",
  ],
  fixtures: [
    "tests/fixtures/domain/*.json", "tests/fixtures/foundation/*.json",
    "tests/fixtures/typescript/*.d.ts",
  ],
  production: ["src/**/*"],
  tests: [...F1_FOCUSED_TEST_FILES],
} as const;

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
): F1EvidenceFinding {
  return { code, path, message, traceId };
}

function findingKey(value: F1EvidenceFinding): string {
  return [value.traceId ?? "", value.code, value.path, value.message].join("\u0000");
}

function sortFindings(values: F1EvidenceFinding[]): F1EvidenceFinding[] {
  return [...new Map(values.map((value) => [findingKey(value), value])).values()]
    .sort((left, right) => compare(findingKey(left), findingKey(right)));
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function sha256HexSync(value: string): string {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(value);
  return hasher.digest("hex");
}

function candidateInputSnapshot(
  value: unknown,
  path: string,
  findings: F1EvidenceFinding[],
): InputSnapshot | null {
  if (!isRecord(value) || !Array.isArray(value["components"])) {
    findings.push(finding(
      "F1_EVIDENCE_INPUT_SHAPE",
      path,
      "Input snapshot and component inventory are required.",
    ));
    return null;
  }
  if (!exactKeys(value, ["algorithm", "digest", "components"])) {
    findings.push(finding(
      "F1_EVIDENCE_INPUT_SHAPE",
      path,
      "Input snapshots permit only algorithm, digest, and components.",
    ));
  }
  const components: InputComponent[] = [];
  for (const [index, raw] of value["components"].entries()) {
    const componentPath = `${path}.components[${String(index)}]`;
    if (!isRecord(raw)) {
      findings.push(finding(
        "F1_EVIDENCE_INPUT_SHAPE",
        componentPath,
        "Input component must be an object.",
      ));
      continue;
    }
    const keys = Object.keys(raw).sort(compare);
    const group = raw["group"];
    const file = raw["path"];
    const bytes = raw["bytes"];
    const sha256 = raw["sha256"];
    if (
      !arraysEqual(keys, ["bytes", "group", "path", "sha256"]) ||
      typeof group !== "string" || group.length === 0 ||
      typeof file !== "string" || file.length === 0 ||
      typeof bytes !== "number" || !Number.isSafeInteger(bytes) || bytes < 0 ||
      !isSha256(sha256)
    ) {
      findings.push(finding(
        "F1_EVIDENCE_INPUT_COMPONENT",
        componentPath,
        "Input component keys, path, byte count, and SHA-256 must be exact.",
      ));
      continue;
    }
    components.push({ group, path: file, bytes, sha256 });
  }
  const paths = components.map(({ path: file }) => file);
  if (
    components.length !== value["components"].length ||
    new Set(paths).size !== paths.length ||
    !arraysEqual(paths, [...paths].sort(compare))
  ) {
    findings.push(finding(
      "F1_EVIDENCE_INPUT_DUPLICATE",
      `${path}.components`,
      "Input component paths must be complete, unique, and sorted.",
    ));
  }
  if (paths.some(
    (file) => resolve(file) === resolve(OUTPUT_PATH) || file.startsWith("test-results/"),
  )) {
    findings.push(finding(
      "F1_EVIDENCE_INPUT_CIRCULAR",
      `${path}.components`,
      "Generated evidence cannot certify itself as an input.",
    ));
  }
  const digest = value["digest"];
  const recomputed = sha256HexSync(stableJson(components));
  if (
    value["algorithm"] !== "sha256-component-manifest-v1" ||
    !isSha256(digest) || digest !== recomputed
  ) {
    findings.push(finding(
      "F1_EVIDENCE_INPUT_DIGEST",
      path,
      "Input snapshot algorithm or component-manifest digest is invalid.",
    ));
    return null;
  }
  return {
    algorithm: "sha256-component-manifest-v1",
    digest,
    components,
  };
}

function xmlUnescape(value: string): string {
  return value
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function attributes(source: string): Map<string, string> {
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

function countAttribute(value: string | undefined, name: string, fallback = 0): number {
  if (value === undefined) return fallback;
  if (!/^(?:0|[1-9][0-9]*)$/.test(value)) throw new Error(`invalid ${name} count`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`unsafe ${name} count`);
  return parsed;
}

function safeUsageNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value === "bigint" && value >= 0n && value <= BigInt(Number.MAX_SAFE_INTEGER)) {
    return Number(value);
  }
  return null;
}

export function inspectF1JUnit(xml: string): Readonly<{
  summary: F1JUnitSummary | null;
  findings: readonly F1EvidenceFinding[];
}> {
  const findings: F1EvidenceFinding[] = [];
  try {
    const rootMatch = /<testsuites\b([^>]*)>/.exec(xml);
    if (rootMatch?.[1] === undefined || !xml.includes("</testsuites>")) {
      throw new Error("missing testsuites root");
    }
    const root = attributes(rootMatch[1]);
    const tests = countAttribute(root.get("tests"), "tests");
    const assertions = countAttribute(root.get("assertions"), "assertions");
    const failures = countAttribute(root.get("failures"), "failures");
    const skipped = countAttribute(root.get("skipped"), "skipped");
    const errors = countAttribute(root.get("errors"), "errors", 0);
    const cases: Array<{ file: string; name: string }> = [];
    const testcasePattern = /<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g;
    let testcase: RegExpExecArray | null;
    let observedFailures = 0;
    let observedErrors = 0;
    let observedSkipped = 0;
    while ((testcase = testcasePattern.exec(xml)) !== null) {
      const body = testcase[2] ?? "";
      const parsed = attributes(testcase[1] ?? "");
      const file = parsed.get("file");
      const name = parsed.get("name");
      if (file === undefined || file.length === 0 || name === undefined || name.length === 0) {
        throw new Error("testcase requires file and name attributes");
      }
      cases.push({ file: file.replaceAll("\\", "/"), name });
      observedFailures += (body.match(/<failure\b/g) ?? []).length;
      observedErrors += (body.match(/<error\b/g) ?? []).length;
      observedSkipped += (body.match(/<skipped\b/g) ?? []).length;
    }
    const caseKeys = cases.map(({ file, name }) => `${file}\u0000${name}`);
    if (new Set(caseKeys).size !== caseKeys.length) throw new Error("duplicate testcase identity");
    if (tests !== cases.length) throw new Error("tests count does not match testcase inventory");
    if (failures !== observedFailures) throw new Error("failures count does not match testcase bodies");
    if (errors !== observedErrors) throw new Error("errors count does not match testcase bodies");
    if (skipped !== observedSkipped) {
      // Bun may summarize a todo without emitting a testcase body. Preserve the
      // root count, but never let it pass the evidence gate.
      if (skipped === 0 || observedSkipped > skipped) {
        throw new Error("skipped count does not match testcase bodies");
      }
    }
    return {
      summary: {
        tests,
        assertions,
        failures,
        errors,
        skipped,
        files: sortedUnique(cases.map(({ file }) => file)),
        cases: cases.sort((left, right) => compare(`${left.file}\u0000${left.name}`, `${right.file}\u0000${right.name}`)),
      },
      findings,
    };
  } catch (error) {
    findings.push(finding(
      "F1_EVIDENCE_JUNIT_INVALID",
      "suite.junit",
      error instanceof Error ? error.message : "JUnit report is invalid.",
    ));
    return { summary: null, findings };
  }
}

/** Remove Bun's machine hostname before JUnit becomes stored evidence. */
export function sanitizeF1JUnit(xml: string): string {
  const sanitized = xml.replace(
    /(<testsuite\b[^>]*?)\s+hostname\s*=\s*(?:"[^"]*"|'[^']*')/g,
    "$1",
  );
  if (/\bhostname\s*=/.test(sanitized)) {
    throw new Error("F1_EVIDENCE_JUNIT_HOSTNAME: hostname was not sanitized");
  }
  return sanitized;
}

export function inspectForbiddenTestControls(
  path: string,
  source: string,
): F1EvidenceFinding[] {
  const findings: F1EvidenceFinding[] = [];
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
      if (["test", "it", "describe"].includes(imported)) {
        testIdentifiers.add(element.name.text);
      }
    }
  }
  const namespaceBuilder = (expression: ts.Expression): boolean => {
    if (
      ts.isPropertyAccessExpression(expression) &&
      ts.isIdentifier(expression.expression) &&
      testNamespaces.has(expression.expression.text)
    ) return ["test", "it", "describe"].includes(expression.name.text);
    return (
      ts.isElementAccessExpression(expression) &&
      ts.isIdentifier(expression.expression) &&
      testNamespaces.has(expression.expression.text) &&
      ts.isStringLiteral(expression.argumentExpression) &&
      ["test", "it", "describe"].includes(expression.argumentExpression.text)
    );
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
    if (
      ts.isComputedPropertyName(name) &&
      ts.isStringLiteral(name.expression)
    ) return name.expression.text;
    return null;
  };
  const report = (node: ts.Node, code: string, message: string): void => {
    const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    findings.push(finding(code, `${path}:${String(position.line + 1)}:${String(position.character + 1)}`, message));
  };
  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAccessExpression(node)) {
      if (forbiddenMembers.has(node.name.text) && isTestBuilder(node.expression)) {
        report(
          node,
          node.name.text === "todo" || node.name.text === "todoIf"
            ? "F1_EVIDENCE_TODO"
            : "F1_EVIDENCE_QUARANTINE",
          `Forbidden ${node.name.text} test control.`,
        );
      }
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
          ? "F1_EVIDENCE_TODO"
          : "F1_EVIDENCE_QUARANTINE",
        `Forbidden ${member} test control.`,
      );
    } else if (
      ts.isElementAccessExpression(node) &&
      !ts.isStringLiteral(node.argumentExpression) &&
      isTestBuilder(node.expression)
    ) {
      report(
        node,
        "F1_EVIDENCE_QUARANTINE",
        "Dynamic test-builder member access is forbidden because strict controls cannot be audited.",
      );
    }
    if (ts.isCallExpression(node)) {
      if (ts.isIdentifier(node.expression) && /^(?:quarantine|quarantined)$/.test(node.expression.text)) {
        report(node, "F1_EVIDENCE_QUARANTINE", "Quarantined test call is forbidden.");
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
            ) &&
            propertyNameText(property.name) === "retry"
          ) {
            report(property, "F1_EVIDENCE_RETRY", "Per-test retry configuration is forbidden.");
          }
        }
      }
      if (isTestBuilder(node.expression) && node.arguments.length >= 3) {
        const options = node.arguments[2];
        if (
          options !== undefined &&
          !ts.isNumericLiteral(options) &&
          !(
            ts.isPrefixUnaryExpression(options) &&
            ts.isNumericLiteral(options.operand)
          )
        ) {
          if (!ts.isObjectLiteralExpression(options)) {
            report(
              options,
              "F1_EVIDENCE_RETRY",
              "Indirect test options are forbidden because retry policy cannot be audited.",
            );
          } else if (options.properties.some(ts.isSpreadAssignment)) {
            report(
              options,
              "F1_EVIDENCE_RETRY",
              "Spread test options are forbidden because retry policy cannot be audited.",
            );
          } else if (options.properties.some((property) =>
            "name" in property &&
            ts.isComputedPropertyName(property.name) &&
            !ts.isStringLiteral(property.name.expression)
          )) {
            report(
              options,
              "F1_EVIDENCE_RETRY",
              "Non-literal computed test options are forbidden because retry policy cannot be audited.",
            );
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return findings;
}

export function inspectBunTestConfiguration(source: string): F1EvidenceFinding[] {
  const testSection = /^\[test\]\s*$([\s\S]*?)(?=^\[[^\]]+\]\s*$|$(?![\s\S]))/m
    .exec(source)?.[1];
  const retryValues = testSection === undefined
    ? []
    : [...testSection.matchAll(/^\s*retry\s*=\s*([^#\r\n]+?)\s*(?:#.*)?$/gm)]
      .map((match) => match[1]?.trim());
  if (retryValues.length === 1 && retryValues[0] === "0") return [];
  return [finding(
    "F1_EVIDENCE_RETRY",
    "bunfig.toml:[test].retry",
    "Focused F1 evidence requires exactly one explicit [test] retry = 0 setting.",
  )];
}

async function expandPattern(pattern: string): Promise<string[]> {
  if (!pattern.includes("*")) return (await Bun.file(pattern).exists()) ? [pattern] : [];
  const glob = new Bun.Glob(pattern);
  const found: string[] = [];
  for await (const path of glob.scan({
    cwd: process.cwd(),
    onlyFiles: true,
    dot: true,
  })) {
    found.push(path.replaceAll("\\", "/"));
  }
  return found.sort(compare);
}

async function snapshotInputs(): Promise<Readonly<{
  snapshot: InputSnapshot;
  findings: readonly F1EvidenceFinding[];
  testControlFindings: readonly F1EvidenceFinding[];
}>> {
  const findings: F1EvidenceFinding[] = [];
  const testControlFindings: F1EvidenceFinding[] = [];
  const pathGroups = new Map<string, string>();
  for (const [group, patterns] of Object.entries(F1_INPUT_GROUPS)) {
    for (const pattern of patterns) {
      const matches = await expandPattern(pattern);
      if (matches.length === 0) {
        findings.push(finding("F1_EVIDENCE_INPUT_MISSING", pattern, `Required ${group} input is missing.`));
      }
      for (const path of matches) {
        const previous = pathGroups.get(path);
        if (previous !== undefined) {
          findings.push(finding("F1_EVIDENCE_INPUT_DUPLICATE", path, `Input is declared by both ${previous} and ${group}.`));
        } else {
          pathGroups.set(path, group);
        }
      }
    }
  }
  const components: InputComponent[] = [];
  for (const [path, group] of [...pathGroups].sort(([left], [right]) => compare(left, right))) {
    const bytes = new Uint8Array(await Bun.file(path).arrayBuffer());
    components.push({ group, path, bytes: bytes.byteLength, sha256: await sha256Hex(bytes) });
    if (path === "bunfig.toml") {
      testControlFindings.push(
        ...inspectBunTestConfiguration(new TextDecoder().decode(bytes)),
      );
    }
    if (group === "tests") {
      testControlFindings.push(...inspectForbiddenTestControls(path, new TextDecoder().decode(bytes)));
    }
  }
  const digest = await sha256Hex(stableJson(components));
  return {
    snapshot: { algorithm: "sha256-component-manifest-v1", digest, components },
    findings,
    testControlFindings,
  };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function validObservationCounters(value: unknown, depth = 0): value is JsonRecord {
  if (!isRecord(value) || Object.keys(value).length === 0 || depth > 4) return false;
  return Object.entries(value).every(([key, item]) =>
    key.length > 0 && (
      (typeof item === "number" && Number.isSafeInteger(item) && item >= 0) ||
      validObservationCounters(item, depth + 1)
    )
  );
}

function validObservationSeed(
  value: unknown,
): value is F1Observation["seed"] {
  return (
    (typeof value === "number" && Number.isSafeInteger(value)) ||
    (
      isRecord(value) &&
      Object.keys(value).length > 0 &&
      Object.values(value).every(
        (seed) => typeof seed === "number" && Number.isSafeInteger(seed),
      )
    )
  );
}

function traceRecords(value: unknown): Map<string, JsonRecord> {
  if (!isRecord(value) || !Array.isArray(value["traces"])) return new Map();
  const records = new Map<string, JsonRecord>();
  for (const item of value["traces"]) {
    if (isRecord(item) && typeof item["id"] === "string") records.set(item["id"], item);
  }
  return records;
}

function buildTraceEvidence(
  ledger: unknown,
  summary: F1JUnitSummary,
): Readonly<{ rows: TraceEvidence[]; findings: F1EvidenceFinding[] }> {
  const findings: F1EvidenceFinding[] = [];
  const records = traceRecords(ledger);
  const descriptorIds = F1_TRACE_DESCRIPTORS.map(({ id }) => id);
  if (new Set(descriptorIds).size !== descriptorIds.length) {
    findings.push(finding("F1_EVIDENCE_TRACE_DUPLICATE", "traceDescriptors", "Trace descriptors contain duplicate IDs."));
  }
  const recordIds = [...records.keys()];
  if (!arraysEqual([...descriptorIds].sort(compare), [...recordIds].sort(compare))) {
    findings.push(finding("F1_EVIDENCE_TRACE_INVENTORY", "tests/fixtures/domain/trace-ledger.json", "Evidence descriptors must match all 18 reviewed trace IDs exactly."));
  }
  const rows: TraceEvidence[] = [];
  for (const descriptor of F1_TRACE_DESCRIPTORS) {
    const record = records.get(descriptor.id);
    if (record === undefined) continue;
    const reviewedKinds = stringArray(record["proofKinds"]);
    if (!arraysEqual(descriptor.proofKinds, reviewedKinds)) {
      findings.push(finding("F1_EVIDENCE_TRACE_PROOF_KIND", "traceDescriptors", "Descriptor proof kinds differ from the reviewed trace.", descriptor.id));
    }
    const reviewedDownstreamOwners = stringArray(record["downstreamProofOwners"]);
    const missingDownstreamOwners = reviewedDownstreamOwners.filter(
      (owner) => !descriptor.deferredOwners.includes(owner),
    );
    if (missingDownstreamOwners.length > 0) {
      findings.push(finding(
        "F1_EVIDENCE_TRACE_OWNER",
        "traceDescriptors",
        `Descriptor omits reviewed downstream proof owners: ${missingDownstreamOwners.join(", ")}.`,
        descriptor.id,
      ));
    }
    const missingFiles = descriptor.testFiles.filter((file) => !summary.files.includes(file));
    if (missingFiles.length > 0) {
      findings.push(finding("F1_EVIDENCE_TRACE_TEST_MISSING", missingFiles[0] ?? "suite", `Trace is missing executed test files: ${missingFiles.join(", ")}.`, descriptor.id));
    }
    const evidencePaths = sortedUnique([
      ...descriptor.testFiles,
      "docs/F1_DOMAIN_CONTRACT.md",
      "tests/fixtures/domain/f1-domain-contract.json",
      "tests/fixtures/domain/provenance-ledger.json",
      "tests/fixtures/domain/trace-ledger.json",
    ]);
    const observedTests = summary.cases.filter(({ file }) => descriptor.testFiles.includes(file)).length;
    rows.push({
      traceId: descriptor.id,
      proofKinds: [...descriptor.proofKinds],
      requiredCaseIds: stringArray(record["requiredCaseIds"]),
      requiredFixturePrefixes: stringArray(record["requiredFixturePrefixes"]),
      testFiles: [...descriptor.testFiles],
      evidencePaths,
      observedTests,
      deferredOwners: [...descriptor.deferredOwners],
      outcome: missingFiles.length === 0 && observedTests > 0 ? "pass" : "fail",
    });
  }
  return { rows, findings };
}

function buildNegativeControls(
  summary: F1JUnitSummary,
  observations: readonly F1Observation[],
): NegativeControl[] {
  return F1_NEGATIVE_CONTROL_DESCRIPTORS.map((descriptor) => {
    const matchedTests = summary.cases.filter(({ file, name }) =>
      file === descriptor.file && name.endsWith(descriptor.testName)
    ).length;
    const observedMutantsKilled = observations.find(
      ({ id }) => id === descriptor.observationId,
    )?.mutantsKilled ?? null;
    const survived =
      matchedTests !== 1 ||
      observedMutantsKilled !== descriptor.expectedMutantsKilled;
    return {
      ...descriptor,
      traceIds: [...descriptor.traceIds],
      seedIds: [...descriptor.seedIds],
      observedMutantsKilled,
      matchedTests,
      survived,
      outcome: survived ? "survived" : "killed",
    };
  });
}

function parseObservations(output: string): Readonly<{
  observations: F1Observation[];
  findings: F1EvidenceFinding[];
}> {
  const observations: F1Observation[] = [];
  const findings: F1EvidenceFinding[] = [];
  for (const [index, line] of output.split(/\r?\n/).entries()) {
    const marker = line.indexOf(OBSERVATION_PREFIX);
    if (marker < 0) continue;
    try {
      const parsed: unknown = JSON.parse(line.slice(marker + OBSERVATION_PREFIX.length));
      if (!isRecord(parsed)) throw new Error("observation must be an object");
      const keys = Object.keys(parsed).sort(compare);
      if (!arraysEqual(keys, ["counters", "digest", "id", "mutantsKilled", "seed"])) {
        throw new Error("observation keys are not the reviewed five-field shape");
      }
      if (
        typeof parsed["id"] !== "string" || parsed["id"].length === 0 ||
        typeof parsed["digest"] !== "string" || !/^[a-f0-9]{64}$/.test(parsed["digest"]) ||
        typeof parsed["mutantsKilled"] !== "number" || !Number.isSafeInteger(parsed["mutantsKilled"]) || parsed["mutantsKilled"] < 0 ||
        !validObservationCounters(parsed["counters"])
      ) throw new Error("observation fields have invalid types or bounds");
      const seed = parsed["seed"];
      if (!validObservationSeed(seed)) {
        throw new Error(
          "observation seed must be a safe integer or a nonempty safe-integer map",
        );
      }
      observations.push({
        id: parsed["id"],
        seed,
        counters: parsed["counters"],
        digest: parsed["digest"],
        mutantsKilled: parsed["mutantsKilled"],
      });
    } catch (error) {
      findings.push(finding("F1_EVIDENCE_OBSERVATION_INVALID", `suite.output:${String(index + 1)}`, error instanceof Error ? error.message : "Property observation is invalid."));
    }
  }
  observations.sort((left, right) => compare(left.id, right.id));
  if (new Set(observations.map(({ id }) => id)).size !== observations.length) {
    findings.push(finding("F1_EVIDENCE_OBSERVATION_DUPLICATE", "suite.output", "Property observation IDs must be unique."));
  }
  if (observations.length < 2) {
    findings.push(finding("F1_EVIDENCE_OBSERVATION_MISSING", "suite.output", "Both domain and copy property campaigns must emit deterministic observations."));
  }
  return { observations, findings };
}

function expectedTraceEvidence(descriptor: F1TraceDescriptor): Readonly<{
  proofKinds: readonly string[];
  testFiles: readonly string[];
  evidencePaths: readonly string[];
  deferredOwners: readonly string[];
}> {
  return {
    proofKinds: descriptor.proofKinds,
    testFiles: descriptor.testFiles,
    evidencePaths: sortedUnique([
      ...descriptor.testFiles,
      "docs/F1_DOMAIN_CONTRACT.md",
      "tests/fixtures/domain/f1-domain-contract.json",
      "tests/fixtures/domain/provenance-ledger.json",
      "tests/fixtures/domain/trace-ledger.json",
    ]),
    deferredOwners: descriptor.deferredOwners,
  };
}

function exactKeys(value: JsonRecord, expected: readonly string[]): boolean {
  return arraysEqual(Object.keys(value).sort(compare), [...expected].sort(compare));
}

function isNonnegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isNullableNonnegativeSafeInteger(value: unknown): value is number | null {
  return value === null || isNonnegativeSafeInteger(value);
}

function reviewedRunId(inputDigest: string): string {
  return sha256HexSync(stableJson({
    toolVersion: TOOL_VERSION,
    inputDigest,
    seeds: F1_REVIEWED_SEEDS,
  })).slice(0, 24);
}

function reviewedSuitePaths(runId: string): Readonly<{
  junitPath: string;
  stdoutPath: string;
  stderrPath: string;
  metadataPath: string;
}> {
  const directory = `test-results/f1-evidence-runs/${runId}`;
  return {
    junitPath: `${directory}/focused-tests.junit.xml`,
    stdoutPath: `${directory}/focused-tests.stdout.txt`,
    stderrPath: `${directory}/focused-tests.stderr.txt`,
    metadataPath: `${directory}/run-metadata.json`,
  };
}

function reviewedSuiteCommand(runId: string): readonly string[] {
  const { junitPath } = reviewedSuitePaths(runId);
  return [
    "bun",
    "test",
    ...F1_FOCUSED_TEST_FILES,
    "--max-concurrency=1",
    "--retry=0",
    "--reporter=junit",
    `--reporter-outfile=${junitPath}`,
  ];
}

function reviewedSuiteEnvironment(runId: string): Readonly<Record<string, string>> {
  return {
    TZ: "UTC",
    LC_ALL: "C",
    LANG: "C",
    BUN_OPTIONS: "",
    NODE_OPTIONS: "",
    F1_EVIDENCE_RUN_ID: runId,
  };
}

function candidateCases(
  value: unknown,
  findings: F1EvidenceFinding[],
): Array<{ file: string; name: string }> {
  if (!Array.isArray(value)) {
    findings.push(finding(
      "F1_EVIDENCE_SUITE_CASES",
      `${OUTPUT_PATH}#suite.cases`,
      "JUnit testcase inventory is required.",
    ));
    return [];
  }
  const cases: Array<{ file: string; name: string }> = [];
  for (const item of value) {
    if (
      !isRecord(item) ||
      !exactKeys(item, ["file", "name"]) ||
      typeof item["file"] !== "string" || item["file"].length === 0 ||
      typeof item["name"] !== "string" || item["name"].length === 0
    ) {
      findings.push(finding(
        "F1_EVIDENCE_SUITE_CASES",
        `${OUTPUT_PATH}#suite.cases`,
        "Every JUnit testcase needs exact file and name fields.",
      ));
      continue;
    }
    cases.push({ file: item["file"], name: item["name"] });
  }
  return cases;
}

/** Validate a completed ledger without trusting its own outcome or findings. */
export function validateF1EvidenceCandidate(
  candidate: unknown,
  currentInputDigest: string,
): F1EvidenceFinding[] {
  const findings: F1EvidenceFinding[] = [];
  if (!isRecord(candidate)) return [finding("F1_EVIDENCE_LEDGER_SHAPE", OUTPUT_PATH, "Ledger must be a JSON object.")];
  if (!exactKeys(candidate, [
    "schema", "schemaVersion", "package", "traceId", "contractVersion",
    "domainSchema", "runId", "toolVersion", "mode", "outcome", "findings",
    "artifact", "browserVersions", "input", "environment", "versions",
    "seeds", "counters", "applicability", "observations", "negativeControls",
    "suite", "traces",
  ])) {
    findings.push(finding(
      "F1_EVIDENCE_LEDGER_SHAPE",
      OUTPUT_PATH,
      "Ledger top-level fields must match the reviewed schema exactly.",
    ));
  }
  if (
    candidate["schema"] !== "changes.evidence.f1.v1" ||
    candidate["schemaVersion"] !== 1 || candidate["package"] !== "F1" ||
    candidate["traceId"] !== "F1" ||
    candidate["toolVersion"] !== TOOL_VERSION || candidate["mode"] !== "focused-package"
  ) findings.push(finding("F1_EVIDENCE_LEDGER_IDENTITY", OUTPUT_PATH, "Ledger schema, package, tool, or mode is invalid."));
  if (
    candidate["outcome"] !== "pass" ||
    !Array.isArray(candidate["findings"]) ||
    candidate["findings"].length !== 0
  ) {
    findings.push(finding(
      "F1_EVIDENCE_LEDGER_STATUS",
      OUTPUT_PATH,
      "Stored status must agree with an independently clean pass.",
    ));
  }
  if (candidate["contractVersion"] !== "1.0.1" || candidate["domainSchema"] !== "changes.progression.v2") {
    findings.push(finding("F1_EVIDENCE_CONTRACT_IDENTITY", OUTPUT_PATH, "Evidence must target F1 contract 1.0.1 and changes.progression.v2."));
  }

  let preSnapshot: InputSnapshot | null = null;
  const input = candidate["input"];
  if (!isRecord(input)) {
    findings.push(finding("F1_EVIDENCE_INPUT_SHAPE", `${OUTPUT_PATH}#input`, "Pre/post input snapshots are required."));
  } else {
    if (!exactKeys(input, ["pre", "post"])) {
      findings.push(finding(
        "F1_EVIDENCE_INPUT_SHAPE",
        `${OUTPUT_PATH}#input`,
        "Input wrapper permits only pre and post snapshots.",
      ));
    }
    const pre = candidateInputSnapshot(
      input["pre"],
      `${OUTPUT_PATH}#input.pre`,
      findings,
    );
    const post = candidateInputSnapshot(
      input["post"],
      `${OUTPUT_PATH}#input.post`,
      findings,
    );
    preSnapshot = pre;
    if (
      pre === null || post === null ||
      pre.digest !== post.digest ||
      pre.digest !== currentInputDigest ||
      stableJson(pre.components) !== stableJson(post.components)
    ) {
      findings.push(finding("F1_EVIDENCE_INPUT_STALE", `${OUTPUT_PATH}#input`, "Pre-run, post-run, and current input digests must match exactly."));
    }
  }
  const runId = candidate["runId"];
  if (
    typeof runId !== "string" ||
    preSnapshot === null ||
    runId !== reviewedRunId(preSnapshot.digest)
  ) {
    findings.push(finding(
      "F1_EVIDENCE_RUN_ID",
      `${OUTPUT_PATH}#runId`,
      "Run ID must derive from the reviewed tool version, input digest, and seeds.",
    ));
  }

  const artifact = candidate["artifact"];
  const artifactComponent = preSnapshot?.components.find(
    ({ path }) => path === "jazz_chord_progression_editor.html",
  );
  if (
    !isRecord(artifact) ||
    !exactKeys(artifact, ["path", "sha256", "bytes"]) ||
    artifact["path"] !== "jazz_chord_progression_editor.html" ||
    artifact["sha256"] !== artifactComponent?.sha256 ||
    artifact["bytes"] !== artifactComponent?.bytes ||
    !Array.isArray(candidate["browserVersions"]) ||
    candidate["browserVersions"].length !== 0
  ) {
    findings.push(finding(
      "F1_EVIDENCE_ARTIFACT_IDENTITY",
      `${OUTPUT_PATH}#artifact`,
      "Artifact hash/bytes must match the input snapshot and F1 has no browser-version cells.",
    ));
  }

  const seeds = candidate["seeds"];
  if (!Array.isArray(seeds) || stableJson(seeds) !== stableJson(F1_REVIEWED_SEEDS)) {
    findings.push(finding("F1_EVIDENCE_SEED_DRIFT", `${OUTPUT_PATH}#seeds`, "The six reviewed property seeds must match exactly."));
  }
  const counters = candidate["counters"];
  if (!Array.isArray(counters) || stableJson(counters) !== stableJson(F1_REVIEWED_COUNTERS)) {
    findings.push(finding("F1_EVIDENCE_COUNTER_DRIFT", `${OUTPUT_PATH}#counters`, "Reviewed coverage and copy-bound counters must match exactly."));
  }
  const applicability = candidate["applicability"];
  if (!Array.isArray(applicability) || stableJson(applicability) !== stableJson(F1_APPLICABILITY)) {
    findings.push(finding("F1_EVIDENCE_APPLICABILITY_DRIFT", `${OUTPUT_PATH}#applicability`, "F1 applicability and deferred ownership must remain explicit."));
  }

  const environment = candidate["environment"];
  if (
    !isRecord(environment) ||
    !exactKeys(environment, [
      "bun", "nodeCompatibility", "platform", "release", "architecture",
      "cpuCount", "cpuModel", "totalMemoryBytes", "locale", "timeZone",
    ]) ||
    ["bun", "nodeCompatibility", "platform", "release", "architecture", "cpuModel", "locale", "timeZone"]
      .some((field) => typeof environment[field] !== "string" || environment[field].length === 0) ||
    !isNonnegativeSafeInteger(environment["cpuCount"]) || environment["cpuCount"] === 0 ||
    !isNonnegativeSafeInteger(environment["totalMemoryBytes"]) || environment["totalMemoryBytes"] === 0
  ) {
    findings.push(finding(
      "F1_EVIDENCE_ENVIRONMENT",
      `${OUTPUT_PATH}#environment`,
      "Complete host/runtime environment evidence is required.",
    ));
  }
  const versions = candidate["versions"];
  if (
    !Array.isArray(versions) || versions.length === 0 ||
    versions.some((item) =>
      !isRecord(item) || !exactKeys(item, ["name", "version"]) ||
      typeof item["name"] !== "string" || item["name"].length === 0 ||
      typeof item["version"] !== "string" || item["version"].length === 0
    ) ||
    !arraysEqual(
      versions.flatMap((item) => isRecord(item) && typeof item["name"] === "string" ? [item["name"]] : []),
      versions.flatMap((item) => isRecord(item) && typeof item["name"] === "string" ? [item["name"]] : []).sort(compare),
    ) ||
    new Set(versions.flatMap((item) => isRecord(item) && typeof item["name"] === "string" ? [item["name"]] : [])).size !== versions.length ||
    !versions.some((item) => isRecord(item) && item["name"] === "compiler-node")
  ) {
    findings.push(finding(
      "F1_EVIDENCE_VERSIONS",
      `${OUTPUT_PATH}#versions`,
      "Sorted unique dependency, Bun, compatibility, and real compiler Node versions are required.",
    ));
  }

  const suite = candidate["suite"];
  if (!isRecord(suite)) {
    findings.push(finding("F1_EVIDENCE_SUITE_SHAPE", `${OUTPUT_PATH}#suite`, "Focused-suite evidence is required."));
  } else {
    if (!exactKeys(suite, [
      "command", "environment", "junitPath", "stdoutPath", "stderrPath",
      "metadataPath", "junitSha256", "stdoutSha256", "stderrSha256",
      "metadataSha256", "exitCode", "signal",
      "tests", "assertions", "failures", "errors", "skipped", "todos",
      "retries", "quarantined", "files", "cases", "observationDigest",
      "elapsedMs", "resourceUsage",
    ])) {
      findings.push(finding(
        "F1_EVIDENCE_SUITE_SHAPE",
        `${OUTPUT_PATH}#suite`,
        "Suite fields must match the reviewed raw-evidence schema exactly.",
      ));
    }
    const expectedPaths = typeof runId === "string"
      ? reviewedSuitePaths(runId)
      : reviewedSuitePaths("invalid-run-id");
    const expectedCommand = typeof runId === "string"
      ? reviewedSuiteCommand(runId)
      : [];
    const requiredZero = ["failures", "errors", "skipped", "todos", "retries", "quarantined"] as const;
    if (suite["exitCode"] !== 0 || requiredZero.some((field) => suite[field] !== 0)) {
      findings.push(finding("F1_EVIDENCE_SUITE_FAILED", `${OUTPUT_PATH}#suite`, "Suite must exit zero with no failure, error, skip, todo, retry, or quarantine."));
    }
    if (
      !isNonnegativeSafeInteger(suite["tests"]) || suite["tests"] === 0 ||
      !isNonnegativeSafeInteger(suite["assertions"]) || suite["assertions"] === 0
    ) {
      findings.push(finding("F1_EVIDENCE_SUITE_EMPTY", `${OUTPUT_PATH}#suite`, "Suite must execute tests and assertions."));
    }
    const files = stringArray(suite["files"]);
    if (!arraysEqual(files, [...F1_FOCUSED_TEST_FILES].sort(compare))) {
      findings.push(finding("F1_EVIDENCE_SUITE_INVENTORY", `${OUTPUT_PATH}#suite.files`, "JUnit files must match the exact focused F1 suite."));
    }
    const command = stringArray(suite["command"]);
    if (!arraysEqual(command, expectedCommand)) {
      findings.push(finding(
        "F1_EVIDENCE_SUITE_COMMAND",
        `${OUTPUT_PATH}#suite.command`,
        "Suite command must exactly match the reviewed serial F1 command.",
      ));
    }
    if (
      stableJson(suite["environment"]) !== stableJson(
        typeof runId === "string" ? reviewedSuiteEnvironment(runId) : {},
      )
    ) {
      findings.push(finding(
        "F1_EVIDENCE_SUITE_ENVIRONMENT",
        `${OUTPUT_PATH}#suite.environment`,
        "Suite locale, time zone, and run ID environment must match exactly.",
      ));
    }
    if (
      suite["junitPath"] !== expectedPaths.junitPath ||
      suite["stdoutPath"] !== expectedPaths.stdoutPath ||
      suite["stderrPath"] !== expectedPaths.stderrPath ||
      suite["metadataPath"] !== expectedPaths.metadataPath ||
      !isSha256(suite["junitSha256"]) ||
      !isSha256(suite["stdoutSha256"]) ||
      !isSha256(suite["stderrSha256"]) ||
      !isSha256(suite["metadataSha256"])
    ) {
      findings.push(finding(
        "F1_EVIDENCE_SUITE_ARTIFACTS",
        `${OUTPUT_PATH}#suite`,
        "Suite raw paths and SHA-256 fields must bind the reviewed run directory.",
      ));
    }
    const cases = candidateCases(suite["cases"], findings);
    const caseKeys = cases.map(({ file, name }) => `${file}\u0000${name}`);
    if (
      cases.length !== suite["tests"] ||
      new Set(caseKeys).size !== caseKeys.length ||
      !arraysEqual(caseKeys, [...caseKeys].sort(compare)) ||
      !arraysEqual(sortedUnique(cases.map(({ file }) => file)), files)
    ) {
      findings.push(finding(
        "F1_EVIDENCE_SUITE_CASES",
        `${OUTPUT_PATH}#suite.cases`,
        "Test counts, sorted testcase identities, and file inventory must agree.",
      ));
    }
    if (
      suite["signal"] !== null ||
      !isSha256(suite["observationDigest"]) ||
      typeof suite["elapsedMs"] !== "number" ||
      !Number.isFinite(suite["elapsedMs"]) || suite["elapsedMs"] < 0
    ) {
      findings.push(finding(
        "F1_EVIDENCE_SUITE_EXECUTION",
        `${OUTPUT_PATH}#suite`,
        "Suite signal, semantic digest, and non-gating elapsed observation are invalid.",
      ));
    }
    const usage = suite["resourceUsage"];
    if (!isRecord(usage)) {
      findings.push(finding(
        "F1_EVIDENCE_RESOURCE_USAGE",
        `${OUTPUT_PATH}#suite.resourceUsage`,
        "Non-gating child resource observations are required.",
      ));
    } else {
      const raw = usage["maxRssRaw"];
      const unit = usage["maxRssRawUnit"];
      const expectedBytes = raw === null
        ? null
        : unit === "kilobytes" && isNonnegativeSafeInteger(raw)
          ? raw * 1_024
          : unit === "bytes" && isNonnegativeSafeInteger(raw)
            ? raw
            : null;
      if (
        !exactKeys(usage, [
          "measurement", "maxRssRaw", "maxRssRawUnit", "maxRssBytes",
          "cpuUserMicros", "cpuSystemMicros", "gating",
        ]) ||
        usage["measurement"] !== "Bun.Subprocess.resourceUsage" ||
        usage["gating"] !== false ||
        !isNullableNonnegativeSafeInteger(raw) ||
        !["bytes", "kilobytes", "runtime-defined"].includes(String(unit)) ||
        !isNullableNonnegativeSafeInteger(usage["maxRssBytes"]) ||
        usage["maxRssBytes"] !== expectedBytes ||
        !isNullableNonnegativeSafeInteger(usage["cpuUserMicros"]) ||
        !isNullableNonnegativeSafeInteger(usage["cpuSystemMicros"])
      ) {
        findings.push(finding(
          "F1_EVIDENCE_RESOURCE_USAGE",
          `${OUTPUT_PATH}#suite.resourceUsage`,
          "Resource observations must be internally consistent and explicitly non-gating.",
        ));
      }
    }
  }

  const traces = candidate["traces"];
  if (!Array.isArray(traces)) {
    findings.push(finding("F1_EVIDENCE_TRACE_SHAPE", `${OUTPUT_PATH}#traces`, "Trace evidence must be an array."));
  } else {
    const ids = traces.flatMap((row) => isRecord(row) && typeof row["traceId"] === "string" ? [row["traceId"]] : []);
    if (ids.length !== traces.length || new Set(ids).size !== ids.length) {
      findings.push(finding("F1_EVIDENCE_TRACE_DUPLICATE", `${OUTPUT_PATH}#traces`, "Trace rows must have unique IDs."));
    }
    const expectedIds = F1_TRACE_DESCRIPTORS.map(({ id }) => id).sort(compare);
    if (!arraysEqual([...ids].sort(compare), expectedIds)) {
      findings.push(finding("F1_EVIDENCE_TRACE_INVENTORY", `${OUTPUT_PATH}#traces`, "Ledger must contain all 18 trace descriptors exactly once."));
    }
    for (const descriptor of F1_TRACE_DESCRIPTORS) {
      const row: unknown = traces.find(
        (item) => isRecord(item) && item["traceId"] === descriptor.id,
      );
      if (!isRecord(row)) continue;
      const expected = expectedTraceEvidence(descriptor);
      if (
        !arraysEqual(stringArray(row["proofKinds"]), expected.proofKinds) ||
        !arraysEqual(stringArray(row["testFiles"]), expected.testFiles) ||
        !arraysEqual(stringArray(row["evidencePaths"]), expected.evidencePaths) ||
        !arraysEqual(stringArray(row["deferredOwners"]), expected.deferredOwners) ||
        row["outcome"] !== "pass" || typeof row["observedTests"] !== "number" || row["observedTests"] <= 0
      ) findings.push(finding("F1_EVIDENCE_TRACE_INVALID", `${OUTPUT_PATH}#traces`, "Trace mapping, execution, or deferred ownership is incomplete.", descriptor.id));
      if (stringArray(row["evidencePaths"]).some((path) => path.startsWith("test-results/") || resolve(path) === resolve(OUTPUT_PATH))) {
        findings.push(finding("F1_EVIDENCE_TRACE_CIRCULAR", `${OUTPUT_PATH}#traces`, "A trace cannot cite generated evidence as its authority.", descriptor.id));
      }
    }
  }

  const controls = candidate["negativeControls"];
  if (!Array.isArray(controls)) {
    findings.push(finding("F1_EVIDENCE_NEGATIVE_CONTROL_SHAPE", `${OUTPUT_PATH}#negativeControls`, "Negative controls are required."));
  } else {
    const controlRows = controls as unknown[];
    const expectedIds = F1_NEGATIVE_CONTROL_DESCRIPTORS.map(({ id }) => id).sort(compare);
    const ids = controls.flatMap((item) => isRecord(item) && typeof item["id"] === "string" ? [item["id"]] : []);
    if (!arraysEqual([...ids].sort(compare), expectedIds) || new Set(ids).size !== ids.length) {
      findings.push(finding("F1_EVIDENCE_NEGATIVE_CONTROL_INVENTORY", `${OUTPUT_PATH}#negativeControls`, "Every source-level negative control must appear once."));
    }
    for (const descriptor of F1_NEGATIVE_CONTROL_DESCRIPTORS) {
      const row: unknown = controlRows.find(
        (item) => isRecord(item) && item["id"] === descriptor.id,
      );
      const expected = {
        ...descriptor,
        traceIds: [...descriptor.traceIds],
        seedIds: [...descriptor.seedIds],
        observedMutantsKilled: descriptor.expectedMutantsKilled,
        matchedTests: 1,
        survived: false,
        outcome: "killed",
      };
      if (!isRecord(row) || stableJson(row) !== stableJson(expected)) {
        findings.push(finding(
          "F1_EVIDENCE_MUTATION_SURVIVED",
          `${OUTPUT_PATH}#negativeControls`,
          `Mutation control ${descriptor.id} must match its test, traces, seeds, observation, and exact kill count.`,
        ));
      }
    }
  }

  const observations = candidate["observations"];
  if (!Array.isArray(observations) || observations.length !== EXPECTED_OBSERVATION_SEEDS.size) {
    findings.push(finding("F1_EVIDENCE_OBSERVATION_MISSING", `${OUTPUT_PATH}#observations`, "Deterministic property observations are missing."));
  } else {
    const ids = observations.flatMap((item) => isRecord(item) && typeof item["id"] === "string" ? [item["id"]] : []);
    if (ids.length !== observations.length || new Set(ids).size !== ids.length) {
      findings.push(finding("F1_EVIDENCE_OBSERVATION_DUPLICATE", `${OUTPUT_PATH}#observations`, "Observation IDs must be unique."));
    }
    const observationById = new Map(observations.flatMap((item) =>
      isRecord(item) && typeof item["id"] === "string" ? [[item["id"], item] as const] : []
    ));
    const identitiesMatch = [...EXPECTED_OBSERVATION_SEEDS].every(([id, seed]) => {
      const item = observationById.get(id);
      return item !== undefined && stableJson(item["seed"]) === stableJson(seed);
    });
    if (!identitiesMatch || observations.some((item) => !isRecord(item) || !validObservationCounters(item["counters"]) || typeof item["digest"] !== "string" || !/^[a-f0-9]{64}$/.test(item["digest"]) || typeof item["mutantsKilled"] !== "number" || !Number.isSafeInteger(item["mutantsKilled"]) || item["mutantsKilled"] < 1)) {
      findings.push(finding("F1_EVIDENCE_OBSERVATION_INVALID", `${OUTPUT_PATH}#observations`, "Each observation needs a reviewed seed, stable digest, counters, and at least one killed mutant."));
    }
  }
  if (isRecord(suite) && Array.isArray(observations)) {
    const cases = candidateCases(suite["cases"], []);
    const expectedObservationDigest = sha256HexSync(stableJson({
      cases,
      observations,
    }));
    if (suite["observationDigest"] !== expectedObservationDigest) {
      findings.push(finding(
        "F1_EVIDENCE_OBSERVATION_DIGEST",
        `${OUTPUT_PATH}#suite.observationDigest`,
        "Semantic observation digest must bind the exact testcase and property observations.",
      ));
    }
  }
  return sortFindings(findings);
}

async function readJson(path: string): Promise<unknown> {
  return Bun.file(path).json() as Promise<unknown>;
}

async function runFocusedSuite(
  runId: string,
  hostEnvironment: F1EvidenceLedger["environment"],
  versions: F1EvidenceLedger["versions"],
): Promise<Readonly<{
  suite: SuiteEvidence;
  observations: F1Observation[];
  findings: F1EvidenceFinding[];
}>> {
  const directory = `test-results/f1-evidence-runs/${runId}`;
  const { junitPath, stdoutPath, stderrPath, metadataPath } = reviewedSuitePaths(runId);
  const environment = reviewedSuiteEnvironment(runId);
  const command = reviewedSuiteCommand(runId);
  await mkdir(directory, { recursive: true });
  const started = performance.now();
  const child = Bun.spawn({
    cmd: [process.execPath, ...command.slice(1)],
    cwd: process.cwd(),
    env: { ...process.env, ...environment },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdoutPromise = new Response(child.stdout).arrayBuffer();
  const stderrPromise = new Response(child.stderr).arrayBuffer();
  const [exitCode, stdoutBuffer, stderrBuffer] = await Promise.all([
    child.exited, stdoutPromise, stderrPromise,
  ]);
  const elapsedMs = Math.round((performance.now() - started) * 1_000) / 1_000;
  const stdout = new Uint8Array(stdoutBuffer);
  const stderr = new Uint8Array(stderrBuffer);
  await atomicWrite(stdoutPath, stdout);
  await atomicWrite(stderrPath, stderr);
  let junit = "";
  const findings: F1EvidenceFinding[] = [];
  try {
    const rawJunit = await Bun.file(junitPath).text();
    junit = sanitizeF1JUnit(rawJunit);
    await atomicWrite(junitPath, junit);
  } catch (error) {
    findings.push(finding("F1_EVIDENCE_JUNIT_MISSING", junitPath, error instanceof Error ? error.message : "JUnit report is missing."));
  }
  const inspected = inspectF1JUnit(junit);
  findings.push(...inspected.findings);
  const summary = inspected.summary ?? { tests: 0, assertions: 0, failures: 0, errors: 0, skipped: 0, files: [], cases: [] };
  const outputText = `${new TextDecoder().decode(stdout)}\n${new TextDecoder().decode(stderr)}`;
  const parsedObservations = parseObservations(outputText);
  findings.push(...parsedObservations.findings);
  const semanticObservation = {
    cases: summary.cases,
    observations: parsedObservations.observations,
  };
  const usage = child.resourceUsage();
  const maxRssRaw = safeUsageNumber(usage?.maxRSS);
  const maxRssRawUnit = platform() === "linux"
    ? "kilobytes"
    : platform() === "darwin"
      ? "bytes"
      : "runtime-defined";
  const maxRssBytes = maxRssRaw === null
    ? null
    : maxRssRawUnit === "kilobytes"
      ? maxRssRaw * 1_024
      : maxRssRawUnit === "bytes"
        ? maxRssRaw
        : null;
  const resourceUsage: SuiteEvidence["resourceUsage"] = {
    measurement: "Bun.Subprocess.resourceUsage",
    maxRssRaw,
    maxRssRawUnit,
    maxRssBytes,
    cpuUserMicros: safeUsageNumber(usage?.cpuTime.user),
    cpuSystemMicros: safeUsageNumber(usage?.cpuTime.system),
    gating: false,
  };
  const metadata = stableJson({
    schema: "changes.evidence.f1.run-metadata.v1",
    runId,
    environment: hostEnvironment,
    versions,
    elapsedMs,
    resourceUsage,
  });
  await atomicWrite(metadataPath, metadata);
  return {
    suite: {
      command,
      environment,
      junitPath,
      stdoutPath,
      stderrPath,
      metadataPath,
      junitSha256: await sha256Hex(junit),
      stdoutSha256: await sha256Hex(stdout),
      stderrSha256: await sha256Hex(stderr),
      metadataSha256: await sha256Hex(metadata),
      exitCode,
      signal: child.signalCode,
      tests: summary.tests,
      assertions: summary.assertions,
      failures: summary.failures,
      errors: summary.errors,
      skipped: summary.skipped,
      todos: 0,
      retries: 0,
      quarantined: 0,
      files: summary.files,
      cases: summary.cases,
      observationDigest: await sha256Hex(stableJson(semanticObservation)),
      elapsedMs,
      resourceUsage,
    },
    observations: parsedObservations.observations,
    findings,
  };
}

async function packageVersions(): Promise<Array<{ name: string; version: string }>> {
  const value = await readJson("package.json");
  if (!isRecord(value)) return [];
  const versions = new Map<string, string>();
  for (const field of ["dependencies", "devDependencies"]) {
    const record = value[field];
    if (!isRecord(record)) continue;
    for (const [name, version] of Object.entries(record)) {
      if (typeof version === "string") versions.set(name, version);
    }
  }
  versions.set("bun", Bun.version);
  versions.set("compiler-node", (await findRealNode()).version);
  versions.set("node-compatibility", process.versions.node);
  return [...versions].sort(([left], [right]) => compare(left, right)).map(([name, version]) => ({ name, version }));
}

function environmentEvidence(): F1EvidenceLedger["environment"] {
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

async function validateStoredRunEvidence(
  candidate: unknown,
): Promise<F1EvidenceFinding[]> {
  const findings: F1EvidenceFinding[] = [];
  if (!isRecord(candidate) || !isRecord(candidate["suite"])) return findings;
  const suite = candidate["suite"];
  const runId = candidate["runId"];
  if (typeof runId !== "string" || !/^[a-f0-9]{24}$/.test(runId)) return findings;
  const expectedPaths = reviewedSuitePaths(runId);
  if (
    suite["junitPath"] !== expectedPaths.junitPath ||
    suite["stdoutPath"] !== expectedPaths.stdoutPath ||
    suite["stderrPath"] !== expectedPaths.stderrPath ||
    suite["metadataPath"] !== expectedPaths.metadataPath
  ) {
    findings.push(finding(
      "F1_EVIDENCE_SUITE_ARTIFACTS",
      `${OUTPUT_PATH}#suite`,
      "Refusing to read raw evidence outside the deterministic run directory.",
    ));
    return findings;
  }
  const { junitPath, stdoutPath, stderrPath, metadataPath } = expectedPaths;

  let junitBytes: Uint8Array;
  let stdoutBytes: Uint8Array;
  let stderrBytes: Uint8Array;
  let metadataBytes: Uint8Array;
  try {
    [junitBytes, stdoutBytes, stderrBytes, metadataBytes] = await Promise.all(
      [junitPath, stdoutPath, stderrPath, metadataPath].map(async (path) =>
        new Uint8Array(await Bun.file(path).arrayBuffer())
      ),
    ) as [Uint8Array, Uint8Array, Uint8Array, Uint8Array];
  } catch (error) {
    findings.push(finding(
      "F1_EVIDENCE_RAW_MISSING",
      `${OUTPUT_PATH}#suite`,
      error instanceof Error ? error.message : "Stored focused-run evidence is unreadable.",
    ));
    return findings;
  }

  const junit = new TextDecoder().decode(junitBytes);
  if (sanitizeF1JUnit(junit) !== junit) {
    findings.push(finding(
      "F1_EVIDENCE_JUNIT_HOSTNAME",
      junitPath,
      "Stored JUnit must already have all machine hostnames removed.",
    ));
  }
  const [junitSha256, stdoutSha256, stderrSha256, metadataSha256] = await Promise.all([
    sha256Hex(junitBytes),
    sha256Hex(stdoutBytes),
    sha256Hex(stderrBytes),
    sha256Hex(metadataBytes),
  ]);
  if (
    suite["junitSha256"] !== junitSha256 ||
    suite["stdoutSha256"] !== stdoutSha256 ||
    suite["stderrSha256"] !== stderrSha256 ||
    suite["metadataSha256"] !== metadataSha256
  ) {
    findings.push(finding(
      "F1_EVIDENCE_RAW_HASH",
      `${OUTPUT_PATH}#suite`,
      "Stored JUnit/stdout/stderr/metadata hashes must match their exact bytes.",
    ));
  }

  try {
    const metadata: unknown = JSON.parse(new TextDecoder().decode(metadataBytes));
    const expectedMetadata = {
      schema: "changes.evidence.f1.run-metadata.v1",
      runId,
      environment: candidate["environment"],
      versions: candidate["versions"],
      elapsedMs: suite["elapsedMs"],
      resourceUsage: suite["resourceUsage"],
    };
    if (stableJson(metadata) !== stableJson(expectedMetadata)) {
      findings.push(finding(
        "F1_EVIDENCE_METADATA_DRIFT",
        metadataPath,
        "Raw run metadata must bind environment, versions, elapsed observation, and resource usage exactly.",
      ));
    }
  } catch (error) {
    findings.push(finding(
      "F1_EVIDENCE_METADATA_INVALID",
      metadataPath,
      error instanceof Error ? error.message : "Raw run metadata is invalid.",
    ));
  }

  const inspected = inspectF1JUnit(junit);
  findings.push(...inspected.findings);
  const summary = inspected.summary;
  if (summary === null) return findings;
  const summaryFields = [
    "tests", "assertions", "failures", "errors", "skipped",
  ] as const;
  if (
    summaryFields.some((field) => suite[field] !== summary[field]) ||
    stableJson(suite["files"]) !== stableJson(summary.files) ||
    stableJson(suite["cases"]) !== stableJson(summary.cases)
  ) {
    findings.push(finding(
      "F1_EVIDENCE_JUNIT_DRIFT",
      `${OUTPUT_PATH}#suite`,
      "Ledger counts, files, and testcase inventory must match stored JUnit.",
    ));
  }

  const outputText = `${new TextDecoder().decode(stdoutBytes)}\n${new TextDecoder().decode(stderrBytes)}`;
  const parsed = parseObservations(outputText);
  findings.push(...parsed.findings);
  if (stableJson(candidate["observations"]) !== stableJson(parsed.observations)) {
    findings.push(finding(
      "F1_EVIDENCE_OBSERVATION_DRIFT",
      `${OUTPUT_PATH}#observations`,
      "Ledger observations must be reparsed exactly from stored child output.",
    ));
  }
  const observationDigest = await sha256Hex(stableJson({
    cases: summary.cases,
    observations: parsed.observations,
  }));
  if (suite["observationDigest"] !== observationDigest) {
    findings.push(finding(
      "F1_EVIDENCE_OBSERVATION_DIGEST",
      `${OUTPUT_PATH}#suite.observationDigest`,
      "Stored JUnit cases and child observations do not match the semantic digest.",
    ));
  }

  const traceLedger = await readJson("tests/fixtures/domain/trace-ledger.json");
  const traceEvidence = buildTraceEvidence(traceLedger, summary);
  findings.push(...traceEvidence.findings);
  if (stableJson(candidate["traces"]) !== stableJson(traceEvidence.rows)) {
    findings.push(finding(
      "F1_EVIDENCE_TRACE_DRIFT",
      `${OUTPUT_PATH}#traces`,
      "Trace requirements and executed test mappings must match the reviewed ledger.",
    ));
  }
  const controls = buildNegativeControls(summary, parsed.observations);
  if (stableJson(candidate["negativeControls"]) !== stableJson(controls)) {
    findings.push(finding(
      "F1_EVIDENCE_NEGATIVE_CONTROL_DRIFT",
      `${OUTPUT_PATH}#negativeControls`,
      "Negative controls must be rebuilt from exact test identities and observed kill counts.",
    ));
  }

  if (stableJson(candidate["versions"]) !== stableJson(await packageVersions())) {
    findings.push(finding(
      "F1_EVIDENCE_VERSION_DRIFT",
      `${OUTPUT_PATH}#versions`,
      "Stored dependency and runtime versions differ from current inputs/tools.",
    ));
  }
  return findings;
}

export async function verifyF1Evidence(): Promise<F1EvidenceLedger> {
  const pre = await snapshotInputs();
  const manifest = await readJson("tests/fixtures/domain/f1-domain-contract.json");
  const contractVersion = isRecord(manifest) && typeof manifest["contractVersion"] === "string" ? manifest["contractVersion"] : "unavailable";
  const domainSchema = isRecord(manifest) && typeof manifest["domainSchema"] === "string" ? manifest["domainSchema"] : "unavailable";
  const runId = (await sha256Hex(stableJson({ toolVersion: TOOL_VERSION, inputDigest: pre.snapshot.digest, seeds: F1_REVIEWED_SEEDS }))).slice(0, 24);
  const environment = environmentEvidence();
  const versions = await packageVersions();
  const run = await runFocusedSuite(runId, environment, versions);
  const post = await snapshotInputs();
  const artifactComponent = pre.snapshot.components.find(
    ({ path }) => path === "jazz_chord_progression_editor.html",
  );
  const traceLedger = await readJson("tests/fixtures/domain/trace-ledger.json");
  const traceEvidence = buildTraceEvidence(traceLedger, {
    tests: run.suite.tests,
    assertions: run.suite.assertions,
    failures: run.suite.failures,
    errors: run.suite.errors,
    skipped: run.suite.skipped,
    files: run.suite.files,
    cases: run.suite.cases,
  });
  const negativeControls = buildNegativeControls({
    tests: run.suite.tests,
    assertions: run.suite.assertions,
    failures: run.suite.failures,
    errors: run.suite.errors,
    skipped: run.suite.skipped,
    files: run.suite.files,
    cases: run.suite.cases,
  }, run.observations);
  const preliminary: F1EvidenceLedger = {
    schema: "changes.evidence.f1.v1",
    schemaVersion: 1,
    package: "F1",
    traceId: "F1",
    contractVersion,
    domainSchema,
    runId,
    toolVersion: TOOL_VERSION,
    mode: "focused-package",
    outcome: "pass",
    findings: [],
    artifact: {
      path: "jazz_chord_progression_editor.html",
      sha256: artifactComponent?.sha256 ?? "unavailable",
      bytes: artifactComponent?.bytes ?? 0,
    },
    browserVersions: [],
    input: { pre: pre.snapshot, post: post.snapshot },
    environment,
    versions,
    seeds: F1_REVIEWED_SEEDS,
    counters: F1_REVIEWED_COUNTERS,
    applicability: F1_APPLICABILITY,
    observations: run.observations,
    negativeControls,
    suite: {
      ...run.suite,
      todos: [...pre.testControlFindings, ...post.testControlFindings].filter(({ code }) => code === "F1_EVIDENCE_TODO").length,
      retries: [...pre.testControlFindings, ...post.testControlFindings].filter(({ code }) => code === "F1_EVIDENCE_RETRY").length,
      quarantined: [...pre.testControlFindings, ...post.testControlFindings].filter(({ code }) => code === "F1_EVIDENCE_QUARANTINE").length,
    },
    traces: traceEvidence.rows,
  };
  const storedRunFindings = await validateStoredRunEvidence(preliminary);
  // Re-snapshot after every authoritative raw/trace/version reread so a
  // concurrent shared-tree edit cannot be certified under earlier bytes.
  const settled = await snapshotInputs();
  const settledTestControls = [
    ...pre.testControlFindings,
    ...post.testControlFindings,
    ...settled.testControlFindings,
  ];
  const settledPreliminary: F1EvidenceLedger = {
    ...preliminary,
    input: { pre: pre.snapshot, post: settled.snapshot },
    suite: {
      ...preliminary.suite,
      todos: settledTestControls.filter(
        ({ code }) => code === "F1_EVIDENCE_TODO",
      ).length,
      retries: settledTestControls.filter(
        ({ code }) => code === "F1_EVIDENCE_RETRY",
      ).length,
      quarantined: settledTestControls.filter(
        ({ code }) => code === "F1_EVIDENCE_QUARANTINE",
      ).length,
    },
  };
  const findings = sortFindings([
    ...pre.findings,
    ...pre.testControlFindings,
    ...run.findings,
    ...post.findings,
    ...post.testControlFindings,
    ...settled.findings,
    ...settled.testControlFindings,
    ...traceEvidence.findings,
    ...storedRunFindings,
    ...validateF1EvidenceCandidate(
      settledPreliminary,
      settled.snapshot.digest,
    ),
  ]);
  const ledger: F1EvidenceLedger = {
    ...settledPreliminary,
    outcome: findings.length === 0 ? "pass" : "fail",
    findings,
  };
  await atomicWrite(OUTPUT_PATH, stableJson(ledger));
  return ledger;
}

async function checkExisting(): Promise<Readonly<{ outcome: Outcome; findings: readonly F1EvidenceFinding[] }>> {
  let candidate: unknown;
  try {
    candidate = await readJson(OUTPUT_PATH);
  } catch (error) {
    return { outcome: "fail", findings: [finding("F1_EVIDENCE_LEDGER_MISSING", OUTPUT_PATH, error instanceof Error ? error.message : "Evidence ledger is unreadable.")] };
  }
  const current = await snapshotInputs();
  const storedRunFindings = await validateStoredRunEvidence(candidate);
  const settled = await snapshotInputs();
  const concurrentDrift = current.snapshot.digest === settled.snapshot.digest
    ? []
    : [finding(
        "F1_EVIDENCE_INPUT_STALE",
        `${OUTPUT_PATH}#input`,
        "Inputs changed while stored raw evidence was being revalidated.",
      )];
  const findings = sortFindings([
    ...current.findings,
    ...current.testControlFindings,
    ...settled.findings,
    ...settled.testControlFindings,
    ...concurrentDrift,
    ...validateF1EvidenceCandidate(candidate, current.snapshot.digest),
    ...storedRunFindings,
    ...validateF1EvidenceCandidate(candidate, settled.snapshot.digest),
  ]);
  return { outcome: findings.length === 0 ? "pass" : "fail", findings };
}

if (import.meta.main) {
  try {
    const args = process.argv.slice(2);
    if (args.length > 1 || (args.length === 1 && args[0] !== "--check")) {
      throw new Error("Usage: bun scripts/verify-f1-evidence.ts [--check]");
    }
    const checkOnly = args[0] === "--check";
    let summary: Readonly<Record<string, unknown>>;
    let outcome: Outcome;
    if (checkOnly) {
      const result = await checkExisting();
      outcome = result.outcome;
      summary = {
        schema: "changes.evidence.f1.summary.v1",
        mode: "check",
        ledgerPath: OUTPUT_PATH,
        outcome: result.outcome,
        findings: result.findings,
      };
    } else {
      const evidence = await verifyF1Evidence();
      outcome = evidence.outcome;
      summary = {
        schema: "changes.evidence.f1.summary.v1",
        mode: "focused-package",
        ledgerPath: OUTPUT_PATH,
        outcome: evidence.outcome,
        runId: evidence.runId,
        inputDigest: evidence.input.post.digest,
        tests: evidence.suite.tests,
        assertions: evidence.suite.assertions,
        traces: evidence.traces.length,
        observations: evidence.observations.length,
        mutantsKilled: evidence.observations.reduce(
          (sum, observation) => sum + observation.mutantsKilled,
          0,
        ),
        findings: evidence.findings,
      };
    }
    console.log(stableJson(summary).trimEnd());
    process.exitCode = outcome === "pass" ? 0 : 1;
  } catch (error) {
    console.error(stableJson({
      schema: TOOL_VERSION,
      outcome: "tool-failure",
      message: error instanceof Error ? error.message : "F1 evidence verification failed.",
    }).trimEnd());
    process.exitCode = 2;
  }
}
