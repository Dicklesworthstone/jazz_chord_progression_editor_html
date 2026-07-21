import { mkdir } from "node:fs/promises";
import { cpus, platform, release, totalmem } from "node:os";

import ts from "typescript";

import { atomicWrite, sha256Hex, stableJson } from "./foundation-io";
import { findRealNode } from "./toolchain-doctor";

import chartFixture from "../tests/fixtures/theory/chart-cases.json";
import manifestFixture from "../tests/fixtures/theory/t0-syntax-contract.json";
import mutationFixture from "../tests/fixtures/theory/mutation-controls.json";
import roundtripFixture from "../tests/fixtures/theory/roundtrip-cases.json";
import symbolFixture from "../tests/fixtures/theory/symbol-cases.json";
import traceFixture from "../tests/fixtures/theory/trace-ledger.json";

type JsonRecord = Record<string, unknown>;
type Outcome = "pass" | "fail";

export type T0EvidenceFinding = Readonly<{
  code: string;
  path: string;
  message: string;
  traceId: string | null;
}>;

export type T0JUnitSummary = Readonly<{
  tests: number;
  assertions: number;
  failures: number;
  errors: number;
  skipped: number;
  files: readonly string[];
  cases: readonly Readonly<{ file: string; name: string }>[];
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

type ProcessResourceUsage = Readonly<{
  measurement: "Bun.Subprocess.resourceUsage";
  maxRssRaw: number | null;
  maxRssRawUnit: "bytes" | "kilobytes" | "runtime-defined";
  maxRssBytes: number | null;
  cpuUserMicros: number | null;
  cpuSystemMicros: number | null;
  gating: false;
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
  resourceUsage: ProcessResourceUsage;
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
  expectedFailures: number;
  files: readonly string[];
  cases: readonly Readonly<{ file: string; name: string }>[];
}>;

export type T0CaseBinding = Readonly<{
  caseId: string;
  fixturePath: string;
  fixtureRecordSha256: string;
}>;

export type T0TraceEvidence = Readonly<{
  traceId: string;
  requirement: string;
  sourceRefs: readonly string[];
  requiredCaseIds: readonly string[];
  requiredMutationControlIds: readonly string[];
  caseEvidence: readonly Readonly<{
    caseId: string;
    fixturePath: string;
    fixtureRecordSha256: string;
    observationSha256: string;
  }>[];
  mutationObservationSha256: string;
  testFiles: readonly string[];
  evidencePaths: readonly string[];
  observedTests: number;
  outcome: Outcome;
}>;

export type T0MutationEvidenceRow = Readonly<{
  controlId: string;
  operator: string;
  mutatedFault: string;
  expectedDetection: string;
  killedByCaseIds: readonly string[];
  killedCaseEvidence: readonly Readonly<{
    caseId: string;
    fixturePath: string;
    fixtureRecordSha256: string;
    observationSha256: string;
  }>[];
  controlObservationSha256: string;
  outcome: Outcome;
}>;

export type T0EvidenceLedger = Readonly<{
  schema: "changes.evidence.t0.v1";
  schemaVersion: 1;
  package: "T0";
  traceId: "T0";
  contractVersion: string;
  contractSchema: string;
  runId: string;
  toolVersion: "jcpe.verify-t0-evidence.v1";
  mode: "focused-package";
  outcome: Outcome;
  findings: readonly T0EvidenceFinding[];
  artifact: Readonly<{
    path: "jazz_chord_progression_editor.html";
    sha256: string;
    bytes: number;
  }>;
  browserVersions: readonly [];
  input: Readonly<{ pre: InputSnapshot; post: InputSnapshot }>;
  fixtureBindings: readonly InputComponent[];
  caseBindings: readonly T0CaseBinding[];
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
  reviewedSeeds: readonly unknown[];
  reviewedCounts: Readonly<Record<string, number>>;
  applicability: readonly Readonly<{
    id: string;
    applicability: "applicable" | "not-applicable" | "deferred";
    owner: string;
    reason: string;
  }>[];
  runMetadata: Readonly<{
    schema: "changes.evidence.t0.run-metadata.v1";
    path: string;
    sha256: string;
  }>;
  validator: RawExecution & Readonly<{
    schema: string;
    outcome: Outcome;
    counts: Readonly<Record<string, number>>;
    findings: readonly unknown[];
  }>;
  suite: SuiteEvidence;
  observations: readonly JsonRecord[];
  traces: readonly T0TraceEvidence[];
  mutationEvidence: Readonly<{
    classification: "reviewed-exact-case-implication-not-source-mutant-execution";
    reviewedControls: number;
    reviewedControlsDischarged: number;
    reviewedControlsSurvived: number;
    reviewedControlsUnobserved: number;
    sourceMutantsExecuted: 0;
    sourceMutantsKilled: 0;
    rows: readonly T0MutationEvidenceRow[];
    outcome: Outcome;
  }>;
}>;

const TOOL_VERSION = "jcpe.verify-t0-evidence.v1" as const;
const OUTPUT_PATH = "test-results/t0-evidence-ledger.json";
const PRODUCTION_MARKER = "T0_EVIDENCE_OBSERVATION ";
const CONFORMANCE_MARKER = "T0_CONFORMANCE_OBSERVATION ";
const PRODUCTION_SCHEMA = "changes.evidence.t0-production-conformance-observation.v1";
const CONFORMANCE_SCHEMA = "changes.evidence.t0-conformance-observation.v1";

export const T0_FIXTURE_FILES = Object.freeze([
  "tests/fixtures/theory/chart-cases.json",
  "tests/fixtures/theory/mutation-controls.json",
  "tests/fixtures/theory/provenance-ledger.json",
  "tests/fixtures/theory/roundtrip-cases.json",
  "tests/fixtures/theory/symbol-cases.json",
  "tests/fixtures/theory/t0-syntax-contract.json",
  "tests/fixtures/theory/trace-ledger.json",
] as const);

export const T0_FOCUSED_TEST_FILES = Object.freeze([
  "tests/conformance/t0-mutation-controls.test.ts",
  "tests/conformance/t0-production-conformance.test.ts",
  "tests/conformance/t0-roundtrip-laws.test.ts",
  "tests/integration/t0-theory-package.test.ts",
  "tests/static/dependency-boundaries.test.ts",
  "tests/static/t0-contract.test.ts",
  "tests/static/t0-evidence.test.ts",
  "tests/static/validated-document-cast-policy.test.ts",
  "tests/unit/t0-chart-formatter.test.ts",
  "tests/unit/t0-chart-parser.test.ts",
  "tests/unit/t0-chord-symbol.test.ts",
] as const);

export const T0_EXPECTED_COUNTS = Object.freeze({
  companions: 6,
  symbolCases: 111,
  chartCases: 82,
  metamorphicLaws: 17,
  totalCases: 210,
  traces: 25,
  authorities: 7,
  seeds: 4,
  mutationControls: 60,
});

export const T0_EXPECTED_OBSERVATION_COUNTS = Object.freeze({
  productionExecutions: 324,
  lawCaseObservations: 514,
  mutationLinkedCases: 135,
  mutationRuntimeExecutions: 246,
});

export const T0_APPLICABILITY = Object.freeze([
  { id: "syntax-runtime", applicability: "applicable", owner: "T0", reason: "Public parsers/formatters and private deterministic work-evidence seams execute against all reviewed syntax cases." },
  { id: "deterministic-replay", applicability: "applicable", owner: "T0/verify", reason: "Reviewed seeds, exact fixture records, canonical observations, work counters, and replay digests are hash-bound." },
  { id: "performance-observation", applicability: "applicable", owner: "T0/verify", reason: "Elapsed time and child resource use are non-gating observations; deterministic work/state/memory counters are the syntax gate." },
  { id: "browser", applicability: "not-applicable", owner: "U1-Q0", reason: "T0 is a pure syntax package and names no browser adapter." },
  { id: "audio", applicability: "not-applicable", owner: "X0-X1", reason: "T0 produces syntax data and imports no audio layer." },
  { id: "accessibility", applicability: "not-applicable", owner: "U0-Q0", reason: "T0 has no user-interface surface." },
  { id: "cancellation", applicability: "not-applicable", owner: "search/application packages", reason: "T0 operations are synchronous and accept no cancellation token." },
  { id: "resume", applicability: "not-applicable", owner: "search/application packages", reason: "T0 has no resumable operation or continuation state." },
  { id: "stale-revision", applicability: "not-applicable", owner: "A0", reason: "T0 accepts immutable requests and has no document revision." },
  { id: "cleanup", applicability: "not-applicable", owner: "browser/audio/application packages", reason: "Pure synchronous T0 syntax acquires no timer, listener, node, URL, handle, or external resource." },
  { id: "chart-import-byte-binding", applicability: "deferred", owner: "E0", reason: "T0 proves chart-text syntax; E0 binds it transactionally to import payload bytes and application publication." },
] as const);

export const T0_INPUT_GROUPS = Object.freeze({
  contracts: [
    "AGENTS.md",
    "README.md",
    "docs/ARCHITECTURE.md",
    "docs/REBUILD_PLAN.md",
    "docs/T0_SYNTAX_CONTRACT.md",
    "tests/conformance/T0_COVERAGE.md",
    "tests/conformance/T0_DISCREPANCIES.md",
  ],
  artifact: ["jazz_chord_progression_editor.html"],
  configuration: ["bun.lock", "bunfig.toml", "package.json", "tsconfig*.json"],
  tools: [
    "scripts/foundation-io.ts",
    "scripts/source-policy.ts",
    "scripts/toolchain-doctor.ts",
    "scripts/validate-t0-contract.ts",
    "scripts/verify-t0-evidence.ts",
    "scripts/verify.ts",
  ],
  fixtures: [...T0_FIXTURE_FILES],
  production: ["src/domain/**/*", "src/theory/**/*"],
  testSupport: ["src/test-support/**/*"],
  tests: [...T0_FOCUSED_TEST_FILES],
});

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compare);
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function sha256Sync(value: string): string {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(value);
  return hasher.digest("hex");
}

function sanitizeMessage(value: string): string {
  let result = value.replaceAll(process.cwd(), ".");
  const home = process.env["HOME"];
  if (home !== undefined && home.length > 0) result = result.replaceAll(home, "~");
  return result.replaceAll("\\", "/");
}

function finding(
  code: string,
  path: string,
  message: string,
  traceId: string | null = null,
): T0EvidenceFinding {
  return { code, path, message: sanitizeMessage(message), traceId };
}

function findingKey(value: T0EvidenceFinding): string {
  return [value.traceId ?? "", value.code, value.path, value.message].join("\u0000");
}

function sortFindings(values: readonly T0EvidenceFinding[]): T0EvidenceFinding[] {
  return [...new Map(values.map((value) => [findingKey(value), value])).values()]
    .sort((left, right) => compare(findingKey(left), findingKey(right)));
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : [];
}

function exactKeys(value: JsonRecord, expected: readonly string[]): boolean {
  return stableJson(Object.keys(value).sort(compare)) === stableJson([...expected].sort(compare));
}

function safeUsageNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value === "bigint" && value >= 0n && value <= BigInt(Number.MAX_SAFE_INTEGER)) return Number(value);
  return null;
}

function xmlUnescape(value: string): string {
  return value.replaceAll("&quot;", "\"").replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");
}

function xmlAttributes(source: string): Map<string, string> {
  const result = new Map<string, string>();
  const pattern = /([A-Za-z_:][A-Za-z0-9_.:-]*)="([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    const key = match[1];
    const value = match[2];
    if (key === undefined || value === undefined || result.has(key)) throw new Error("duplicate or malformed XML attribute");
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

/** Remove Bun's host name before a JUnit report becomes stored evidence. */
export function sanitizeT0JUnit(xml: string): string {
  const sanitized = xml.replace(
    /(<testsuite\b[^>]*?)\s+hostname\s*=\s*(?:"[^"]*"|'[^']*')/g,
    "$1",
  );
  if (/\bhostname\s*=/.test(sanitized)) throw new Error("T0_EVIDENCE_JUNIT_HOSTNAME: hostname was not sanitized");
  return sanitized;
}

export function inspectT0JUnit(xml: string): Readonly<{
  summary: T0JUnitSummary | null;
  findings: readonly T0EvidenceFinding[];
}> {
  const findings: T0EvidenceFinding[] = [];
  try {
    const rootMatch = /<testsuites\b([^>]*)>/.exec(xml);
    if (rootMatch?.[1] === undefined || !xml.includes("</testsuites>")) throw new Error("missing testsuites root");
    const root = xmlAttributes(rootMatch[1]);
    const tests = countAttribute(root.get("tests"), "tests");
    const assertions = countAttribute(root.get("assertions"), "assertions");
    const failures = countAttribute(root.get("failures"), "failures");
    const errors = countAttribute(root.get("errors"), "errors", 0);
    const skipped = countAttribute(root.get("skipped"), "skipped");
    const cases: Array<{ file: string; name: string }> = [];
    const pattern = /<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g;
    let item: RegExpExecArray | null;
    let bodyFailures = 0;
    let bodyErrors = 0;
    let bodySkipped = 0;
    while ((item = pattern.exec(xml)) !== null) {
      const attributes = xmlAttributes(item[1] ?? "");
      const file = attributes.get("file");
      const name = attributes.get("name");
      if (file === undefined || file.length === 0 || name === undefined || name.length === 0) throw new Error("testcase requires file and name attributes");
      const body = item[2] ?? "";
      bodyFailures += (body.match(/<failure\b/g) ?? []).length;
      bodyErrors += (body.match(/<error\b/g) ?? []).length;
      bodySkipped += (body.match(/<skipped\b/g) ?? []).length;
      cases.push({ file: file.replaceAll("\\", "/"), name });
    }
    const identities = cases.map(({ file, name }) => `${file}\u0000${name}`);
    if (new Set(identities).size !== identities.length) throw new Error("duplicate testcase identity");
    if (tests !== cases.length || failures !== bodyFailures || errors !== bodyErrors) throw new Error("JUnit summary does not match testcase bodies");
    if (skipped !== bodySkipped && (skipped === 0 || bodySkipped > skipped)) throw new Error("skipped count does not match testcase bodies");
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
    findings.push(finding("T0_EVIDENCE_JUNIT_INVALID", "suite.junit", error instanceof Error ? error.message : "JUnit report is invalid."));
    return { summary: null, findings };
  }
}

export function inspectT0TestControls(path: string, source: string): T0EvidenceFinding[] {
  const findings: T0EvidenceFinding[] = [];
  const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const testNames = new Set(["test", "it", "describe"]);
  const namespaces = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier) || statement.moduleSpecifier.text !== "bun:test") continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings === undefined) continue;
    if (ts.isNamespaceImport(bindings)) namespaces.add(bindings.name.text);
    else for (const element of bindings.elements) {
      const imported = element.propertyName?.text ?? element.name.text;
      if (["test", "it", "describe"].includes(imported)) testNames.add(element.name.text);
    }
  }
  const isBuilder = (expression: ts.Expression): boolean => {
    if (ts.isIdentifier(expression)) return testNames.has(expression.text);
    if (ts.isCallExpression(expression)) return isBuilder(expression.expression);
    if (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression) || ts.isNonNullExpression(expression) || ts.isSatisfiesExpression(expression)) return isBuilder(expression.expression);
    if (ts.isPropertyAccessExpression(expression)) {
      if (ts.isIdentifier(expression.expression) && namespaces.has(expression.expression.text)) return ["test", "it", "describe"].includes(expression.name.text);
      return isBuilder(expression.expression);
    }
    if (ts.isElementAccessExpression(expression)) {
      if (ts.isIdentifier(expression.expression) && namespaces.has(expression.expression.text) && ts.isStringLiteral(expression.argumentExpression)) return ["test", "it", "describe"].includes(expression.argumentExpression.text);
      return isBuilder(expression.expression);
    }
    return false;
  };
  let changed = true;
  while (changed) {
    changed = false;
    const collect = (node: ts.Node): void => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer !== undefined && isBuilder(node.initializer) && !testNames.has(node.name.text)) {
        testNames.add(node.name.text);
        changed = true;
      }
      ts.forEachChild(node, collect);
    };
    collect(sourceFile);
  }
  const report = (node: ts.Node, code: string, message: string): void => {
    const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    findings.push(finding(code, `${path}:${String(position.line + 1)}:${String(position.character + 1)}`, message));
  };
  const forbidden = new Set(["skip", "todo", "only", "failing", "skipIf", "todoIf", "quarantine"]);
  const propertyText = (name: ts.PropertyName): string | null => {
    if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
    if (ts.isComputedPropertyName(name) && ts.isStringLiteral(name.expression)) return name.expression.text;
    return null;
  };
  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAccessExpression(node) && forbidden.has(node.name.text) && isBuilder(node.expression)) {
      report(node, node.name.text.startsWith("todo") ? "T0_EVIDENCE_TODO" : "T0_EVIDENCE_QUARANTINE", `Forbidden ${node.name.text} test control.`);
    }
    if (ts.isElementAccessExpression(node) && isBuilder(node.expression)) {
      if (ts.isStringLiteral(node.argumentExpression) && forbidden.has(node.argumentExpression.text)) {
        report(node, node.argumentExpression.text.startsWith("todo") ? "T0_EVIDENCE_TODO" : "T0_EVIDENCE_QUARANTINE", `Forbidden ${node.argumentExpression.text} test control.`);
      } else if (!ts.isStringLiteral(node.argumentExpression)) {
        report(node, "T0_EVIDENCE_QUARANTINE", "Dynamic test-builder member access is forbidden.");
      }
    }
    if (ts.isCallExpression(node)) {
      if (ts.isIdentifier(node.expression) && /^(?:quarantine|quarantined|xit|xdescribe|xtest|xfail|expectedFailure)$/.test(node.expression.text)) report(node, node.expression.text === "xfail" || node.expression.text === "expectedFailure" ? "T0_EVIDENCE_EXPECTED_FAILURE" : "T0_EVIDENCE_QUARANTINE", `Forbidden ${node.expression.text} test control.`);
      for (const argument of node.arguments) {
        if (!ts.isObjectLiteralExpression(argument)) continue;
        for (const property of argument.properties) {
          if ((ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property) || ts.isMethodDeclaration(property) || ts.isGetAccessorDeclaration(property) || ts.isSetAccessorDeclaration(property)) && propertyText(property.name) === "retry") report(property, "T0_EVIDENCE_RETRY", "Per-test retry configuration is forbidden.");
          if ((ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) && propertyText(property.name) === "expectedFailure") report(property, "T0_EVIDENCE_EXPECTED_FAILURE", "Expected-failure controls are forbidden.");
        }
      }
      if (isBuilder(node.expression) && node.arguments.length >= 3) {
        const options = node.arguments[2];
        if (options !== undefined && !ts.isNumericLiteral(options) && !(ts.isPrefixUnaryExpression(options) && ts.isNumericLiteral(options.operand)) && !ts.isObjectLiteralExpression(options)) report(options, "T0_EVIDENCE_RETRY", "Indirect test options are forbidden.");
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return sortFindings(findings);
}

function canonicalJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value).sort(([left], [right]) => compare(left, right))
      .map(([key, item]) => [key, canonicalJsonValue(item)]),
  );
}

function observationDigest(record: JsonRecord): string {
  const unsigned = Object.fromEntries(Object.entries(record).filter(([key]) => key !== "semanticDigest"));
  return sha256Sync(JSON.stringify(canonicalJsonValue(unsigned)));
}

export function inspectT0ObservationRecords(records: readonly unknown[]): T0EvidenceFinding[] {
  const findings: T0EvidenceFinding[] = [];
  if (records.length !== 3 || records.some((record) => !isRecord(record))) {
    return [finding("T0_EVIDENCE_OBSERVATION_INVENTORY", "suite.observations", "Exactly one production, one round-trip-law, and one mutation-control observation are required.")];
  }
  const typed = records.filter(isRecord);
  const production = typed.filter((record) => record["schema"] === PRODUCTION_SCHEMA);
  const conformance = typed.filter((record) => record["schema"] === CONFORMANCE_SCHEMA);
  if (production.length !== 1 || conformance.length !== 2) findings.push(finding("T0_EVIDENCE_OBSERVATION_SCHEMA", "suite.observations", "Observation schema inventory is not exact."));
  const suites = conformance.map((record) => record["suite"]);
  if (new Set(suites).size !== 2 || !suites.includes("roundtrip-laws") || !suites.includes("mutation-controls")) findings.push(finding("T0_EVIDENCE_OBSERVATION_SUITE", "suite.observations", "Conformance observations must identify roundtrip-laws and mutation-controls exactly."));
  for (const [index, record] of typed.entries()) {
    if (!isSha256(record["semanticDigest"]) || record["semanticDigest"] !== observationDigest(record)) findings.push(finding("T0_EVIDENCE_OBSERVATION_DIGEST", `suite.observations[${String(index)}]`, "Observation semantic digest is missing or does not bind its canonical payload."));
  }
  const productionRecord = production[0];
  if (productionRecord !== undefined) {
    const ids = stringArray(productionRecord["fixtureCaseIds"]);
    const hashes = productionRecord["fixtureCaseHashes"];
    const expectedIds = buildT0CaseBindings().filter(({ caseId }) => !caseId.startsWith("T0-META-"))
      .map(({ caseId }) => caseId);
    if (
      stableJson(ids) !== stableJson(expectedIds) ||
      !isRecord(hashes) ||
      stableJson(Object.keys(hashes).sort(compare)) !== stableJson(expectedIds) ||
      ids.some((id) => !isSha256(hashes[id])) ||
      productionRecord["fixtureCases"] !== 193 ||
      productionRecord["executions"] !== T0_EXPECTED_OBSERVATION_COUNTS.productionExecutions ||
      stableJson(productionRecord["categoryCounts"]) !== stableJson({ symbol: 111, chart: 82 })
    ) findings.push(finding("T0_EVIDENCE_PRODUCTION_CASES", "suite.observations.production", "Production observation must hash-bind the exact 111 symbol and 82 chart cases and execution counts."));
  }
  const law = conformance.find((record) => record["suite"] === "roundtrip-laws");
  const expectedLawIds = roundtripFixture.laws.map(({ id }) => id);
  if (
    law !== undefined && (
      stableJson(stringArray(law["lawIds"])) !== stableJson(expectedLawIds) ||
      stableJson(law["seeds"]) !== stableJson(roundtripFixture.seeds) ||
      law["lawsObserved"] !== 17 ||
      law["caseObservations"] !== T0_EXPECTED_OBSERVATION_COUNTS.lawCaseObservations ||
      law["status"] !== "pass" ||
      !isRecord(law["lawDigests"]) ||
      stableJson(Object.keys(law["lawDigests"]).sort(compare)) !== stableJson([...expectedLawIds].sort(compare)) ||
      Object.values(law["lawDigests"]).some((value) => !isSha256(value))
    )
  ) findings.push(finding("T0_EVIDENCE_LAW_INVENTORY", "suite.observations.roundtrip-laws", "Round-trip observation must account for all 17 reviewed laws, exact seeds, and per-law digests."));
  const mutation = conformance.find((record) => record["suite"] === "mutation-controls");
  const expectedControlIds = mutationFixture.controls.map(({ id }) => id);
  const expectedLinkedCaseIds = [...new Set(
    mutationFixture.controls.flatMap(({ killedByCaseIds }) => killedByCaseIds),
  )].sort(compare);
  const linkedCaseIds = mutation === undefined ? [] : stringArray(mutation["linkedCaseIds"]);
  if (
    mutation !== undefined && (
      stableJson(stringArray(mutation["controlIds"])) !== stableJson(expectedControlIds) ||
      mutation["claim"] !== "reviewed-exact-case-implication" ||
      mutation["controlsDefined"] !== T0_EXPECTED_COUNTS.mutationControls ||
      mutation["reviewedControlsDischarged"] !== T0_EXPECTED_COUNTS.mutationControls ||
      mutation["mappedButUnobserved"] !== 0 ||
      mutation["sourceMutantsExecuted"] !== 0 ||
      mutation["sourceMutantsKilled"] !== 0 ||
      linkedCaseIds.length !== T0_EXPECTED_OBSERVATION_COUNTS.mutationLinkedCases ||
      new Set(linkedCaseIds).size !== T0_EXPECTED_OBSERVATION_COUNTS.mutationLinkedCases ||
      stableJson(linkedCaseIds) !== stableJson(expectedLinkedCaseIds) ||
      mutation["linkedCasesObserved"] !== T0_EXPECTED_OBSERVATION_COUNTS.mutationLinkedCases ||
      stableJson(mutation["linkedCasesUnaccounted"]) !== stableJson([]) ||
      mutation["runtimeExecutions"] !== T0_EXPECTED_OBSERVATION_COUNTS.mutationRuntimeExecutions ||
      mutation["status"] !== "pass" ||
      !isRecord(mutation["observationDigests"]) ||
      stableJson(Object.keys(mutation["observationDigests"]).sort(compare)) !== stableJson([...linkedCaseIds].sort(compare)) ||
      Object.values(mutation["observationDigests"]).some((value) => !isSha256(value)) ||
      !isRecord(mutation["controlObservationDigests"]) ||
      stableJson(Object.keys(mutation["controlObservationDigests"])) !== stableJson(expectedControlIds) ||
      Object.values(mutation["controlObservationDigests"]).some((value) => !isSha256(value)) ||
      new Set(Object.values(mutation["controlObservationDigests"])).size !== T0_EXPECTED_COUNTS.mutationControls
    )
  ) findings.push(finding("T0_EVIDENCE_MUTATION_INVENTORY", "suite.observations.mutation-controls", `Mutation observation must discharge all ${String(T0_EXPECTED_COUNTS.mutationControls)} reviewed controls under the exact implication claim and claim zero source mutants.`));
  return sortFindings(findings);
}

export function parseT0Observations(output: string): Readonly<{
  observations: readonly JsonRecord[];
  findings: readonly T0EvidenceFinding[];
}> {
  const findings: T0EvidenceFinding[] = [];
  const records: JsonRecord[] = [];
  for (const [index, line] of output.split(/\r?\n/).entries()) {
    const marker = line.startsWith(PRODUCTION_MARKER)
      ? PRODUCTION_MARKER
      : line.startsWith(CONFORMANCE_MARKER)
        ? CONFORMANCE_MARKER
        : null;
    if (marker === null) continue;
    try {
      const parsed: unknown = JSON.parse(line.slice(marker.length));
      if (!isRecord(parsed)) throw new Error("observation must be an object");
      records.push(parsed);
    } catch (error) {
      findings.push(finding("T0_EVIDENCE_OBSERVATION_JSON", `suite.output:${String(index + 1)}`, error instanceof Error ? error.message : "Observation JSON is invalid."));
    }
  }
  findings.push(...inspectT0ObservationRecords(records));
  return { observations: records, findings: sortFindings(findings) };
}

function collectRecords(value: unknown, pattern: RegExp, path: string, rows: Map<string, T0CaseBinding>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectRecords(item, pattern, path, rows);
    return;
  }
  if (!isRecord(value)) return;
  const id = value["id"];
  if (typeof id === "string" && pattern.test(id)) {
    if (rows.has(id)) throw new Error(`duplicate fixture case ${id}`);
    rows.set(id, { caseId: id, fixturePath: path, fixtureRecordSha256: sha256Sync(stableJson(value)) });
  }
  for (const item of Object.values(value)) collectRecords(item, pattern, path, rows);
}

export function buildT0CaseBindings(): T0CaseBinding[] {
  const rows = new Map<string, T0CaseBinding>();
  collectRecords(symbolFixture, /^T0-(?:SYM|ALIAS)-/, T0_FIXTURE_FILES[4], rows);
  collectRecords(chartFixture, /^T0-CHART-/, T0_FIXTURE_FILES[0], rows);
  collectRecords(roundtripFixture, /^T0-META-/, T0_FIXTURE_FILES[3], rows);
  return [...rows.values()].sort((left, right) => compare(left.caseId, right.caseId));
}

function observationMaps(observations: readonly JsonRecord[]): Readonly<{
  cases: Map<string, string>;
  mutationCases: Map<string, string>;
  controls: Map<string, string>;
}> {
  const cases = new Map<string, string>();
  const mutationCases = new Map<string, string>();
  const controls = new Map<string, string>();
  for (const observation of observations) {
    const schema = observation["schema"];
    const suite = observation["suite"];
    const caseHashes = schema === PRODUCTION_SCHEMA
      ? observation["fixtureCaseHashes"]
      : suite === "roundtrip-laws"
        ? observation["lawDigests"]
        : null;
    if (isRecord(caseHashes)) {
      for (const [id, digest] of Object.entries(caseHashes)) if (isSha256(digest)) cases.set(id, digest);
    }
    if (suite === "mutation-controls") {
      const observationDigests = observation["observationDigests"];
      if (isRecord(observationDigests)) {
        for (const [id, digest] of Object.entries(observationDigests)) if (isSha256(digest)) mutationCases.set(id, digest);
      }
      const controlDigests = observation["controlObservationDigests"];
      if (isRecord(controlDigests)) {
        for (const [id, digest] of Object.entries(controlDigests)) if (isSha256(digest)) controls.set(id, digest);
      }
    }
  }
  return { cases, mutationCases, controls };
}

function testFileForCase(caseId: string): string {
  return caseId.startsWith("T0-META-")
    ? "tests/conformance/t0-roundtrip-laws.test.ts"
    : "tests/conformance/t0-production-conformance.test.ts";
}

export function buildT0TraceEvidence(
  observations: readonly JsonRecord[],
  caseBindings: readonly T0CaseBinding[],
  summary: T0JUnitSummary,
  suiteOutcome: Outcome,
): T0TraceEvidence[] {
  const maps = observationMaps(observations);
  const bindings = new Map(caseBindings.map((row) => [row.caseId, row]));
  const traces = isRecord(traceFixture) && Array.isArray(traceFixture["traces"])
    ? traceFixture["traces"].filter(isRecord)
    : [];
  return traces.map((trace): T0TraceEvidence => {
    const traceId = typeof trace["id"] === "string" ? trace["id"] : "unavailable";
    const requiredCaseIds = stringArray(trace["caseIds"]);
    const requiredMutationControlIds = stringArray(trace["mutationControlIds"]);
    const caseEvidence = requiredCaseIds.flatMap((caseId) => {
      const binding = bindings.get(caseId);
      const digest = maps.cases.get(caseId);
      return binding === undefined || digest === undefined ? [] : [{ ...binding, observationSha256: digest }];
    });
    const mutationDigests = requiredMutationControlIds.flatMap((id) => maps.controls.get(id) ?? []);
    const testFiles = sortedUnique([
      ...requiredCaseIds.map(testFileForCase),
      ...(requiredMutationControlIds.length > 0 ? ["tests/conformance/t0-mutation-controls.test.ts"] : []),
    ]);
    const observedTests = summary.cases.filter(({ file }) => testFiles.includes(file)).length;
    const evidencePaths = sortedUnique([
      "docs/T0_SYNTAX_CONTRACT.md",
      "tests/conformance/T0_COVERAGE.md",
      "tests/conformance/T0_DISCREPANCIES.md",
      "tests/fixtures/theory/trace-ledger.json",
      ...caseEvidence.map(({ fixturePath }) => fixturePath),
      ...testFiles,
    ]);
    const pass = suiteOutcome === "pass" && observedTests > 0 && caseEvidence.length === requiredCaseIds.length && mutationDigests.length === requiredMutationControlIds.length;
    return {
      traceId,
      requirement: typeof trace["requirement"] === "string" ? trace["requirement"] : "unavailable",
      sourceRefs: stringArray(trace["sourceRefs"]),
      requiredCaseIds,
      requiredMutationControlIds,
      caseEvidence,
      mutationObservationSha256: mutationDigests.length === 0 ? sha256Sync(stableJson([])) : sha256Sync(stableJson(mutationDigests)),
      testFiles,
      evidencePaths,
      observedTests,
      outcome: pass ? "pass" : "fail",
    };
  }).sort((left, right) => compare(left.traceId, right.traceId));
}

export function buildT0MutationEvidence(
  observations: readonly JsonRecord[],
  caseBindings: readonly T0CaseBinding[],
): T0EvidenceLedger["mutationEvidence"] {
  const maps = observationMaps(observations);
  const bindings = new Map(caseBindings.map((row) => [row.caseId, row]));
  const controls = isRecord(mutationFixture) && Array.isArray(mutationFixture["controls"])
    ? mutationFixture["controls"].filter(isRecord)
    : [];
  const rows = controls.map((control): T0MutationEvidenceRow => {
    const controlId = typeof control["id"] === "string" ? control["id"] : "unavailable";
    const killedByCaseIds = stringArray(control["killedByCaseIds"]);
    const killedCaseEvidence = killedByCaseIds.flatMap((caseId) => {
      const binding = bindings.get(caseId);
      const digest = maps.mutationCases.get(caseId);
      return binding === undefined || digest === undefined ? [] : [{ ...binding, observationSha256: digest }];
    });
    const controlObservationSha256 = maps.controls.get(controlId) ?? "unavailable";
    const killedCaseObservationDigests = killedByCaseIds.map((caseId) => ({
      caseId,
      observationSha256: maps.mutationCases.get(caseId) ?? null,
    }));
    const recomputedControlDigest = sha256Sync(JSON.stringify(canonicalJsonValue({
      controlId,
      operator: control["operator"],
      mutatedFault: control["mutatedFault"],
      expectedDetection: control["expectedDetection"],
      killedByCaseIds,
      observationEvidenceIds: killedCaseObservationDigests.map(({ observationSha256 }) => observationSha256),
      killedCaseObservationDigests,
      dischargeStatus: killedCaseEvidence.length === killedByCaseIds.length
        ? "discharged-by-reviewed-exact-case-implication"
        : "mapped-not-observed",
    })));
    return {
      controlId,
      operator: typeof control["operator"] === "string" ? control["operator"] : "unavailable",
      mutatedFault: typeof control["mutatedFault"] === "string" ? control["mutatedFault"] : "unavailable",
      expectedDetection: typeof control["expectedDetection"] === "string" ? control["expectedDetection"] : "unavailable",
      killedByCaseIds,
      killedCaseEvidence,
      controlObservationSha256,
      outcome: killedCaseEvidence.length === killedByCaseIds.length && controlObservationSha256 === recomputedControlDigest ? "pass" : "fail",
    };
  }).sort((left, right) => compare(left.controlId, right.controlId));
  const discharged = rows.filter(({ outcome }) => outcome === "pass").length;
  const unobserved = rows.filter(({ controlObservationSha256 }) => !isSha256(controlObservationSha256)).length;
  const survived = rows.length - discharged - unobserved;
  return {
    classification: "reviewed-exact-case-implication-not-source-mutant-execution",
    reviewedControls: rows.length,
    reviewedControlsDischarged: discharged,
    reviewedControlsSurvived: survived,
    reviewedControlsUnobserved: unobserved,
    sourceMutantsExecuted: 0,
    sourceMutantsKilled: 0,
    rows,
    outcome: rows.length === T0_EXPECTED_COUNTS.mutationControls && discharged === T0_EXPECTED_COUNTS.mutationControls && survived === 0 && unobserved === 0 ? "pass" : "fail",
  };
}

export function validateT0TraceEvidenceRows(
  candidate: unknown,
  expected: readonly T0TraceEvidence[],
): T0EvidenceFinding[] {
  if (!Array.isArray(candidate)) return [finding("T0_EVIDENCE_TRACE_COVERAGE", "traces", "Trace evidence must be an array.")];
  const candidateEntries = candidate.flatMap((row): Array<[string, unknown]> =>
    isRecord(row) && typeof row["traceId"] === "string" ? [[row["traceId"], row]] : []
  );
  const candidateTraceIds = candidateEntries.map(([traceId]) => traceId);
  const hasDuplicateTraceIds = new Set(candidateTraceIds).size !== candidateTraceIds.length;
  const candidateRows = new Map(candidateEntries);
  const findings: T0EvidenceFinding[] = [];
  for (const row of expected) {
    if (stableJson(candidateRows.get(row.traceId)) !== stableJson(row)) findings.push(finding("T0_EVIDENCE_TRACE_ROW", `traces#${row.traceId}`, "Stored trace row differs from independently recomputed case/control evidence.", row.traceId));
  }
  if (candidate.length !== expected.length || hasDuplicateTraceIds || candidateRows.size !== expected.length) findings.push(finding("T0_EVIDENCE_TRACE_INVENTORY", "traces", "Trace evidence contains an unknown, duplicate, or missing row."));
  return sortFindings(findings);
}

export function validateT0MutationEvidenceRows(
  candidate: unknown,
  expected: T0EvidenceLedger["mutationEvidence"],
): T0EvidenceFinding[] {
  if (!isRecord(candidate) || !Array.isArray(candidate["rows"])) return [finding("T0_EVIDENCE_MUTATION_AUDIT", "mutationEvidence", "Mutation evidence and rows are required.")];
  const candidateEntries = candidate["rows"].flatMap((row): Array<[string, unknown]> =>
    isRecord(row) && typeof row["controlId"] === "string" ? [[row["controlId"], row]] : []
  );
  const candidateControlIds = candidateEntries.map(([controlId]) => controlId);
  const hasDuplicateControlIds = new Set(candidateControlIds).size !== candidateControlIds.length;
  const candidateRows = new Map(candidateEntries);
  const findings: T0EvidenceFinding[] = [];
  for (const row of expected.rows) {
    if (stableJson(candidateRows.get(row.controlId)) !== stableJson(row)) findings.push(finding("T0_EVIDENCE_MUTATION_ROW", `mutationEvidence.rows#${row.controlId}`, "Stored reviewed-control evidence differs from its recomputed metadata and linked case observations."));
  }
  const candidateHeader = Object.fromEntries(Object.entries(candidate).filter(([key]) => key !== "rows"));
  const expectedHeader = Object.fromEntries(Object.entries(expected).filter(([key]) => key !== "rows"));
  if (candidate["rows"].length !== expected.rows.length || hasDuplicateControlIds || candidateRows.size !== expected.rows.length || stableJson(candidateHeader) !== stableJson(expectedHeader)) findings.push(finding("T0_EVIDENCE_MUTATION_INVENTORY", "mutationEvidence", "Mutation audit inventory or summary is not exact."));
  return sortFindings(findings);
}

async function expandPattern(pattern: string): Promise<string[]> {
  if (!pattern.includes("*")) return await Bun.file(pattern).exists() ? [pattern] : [];
  const paths: string[] = [];
  for await (const path of new Bun.Glob(pattern).scan({ cwd: process.cwd(), dot: true, onlyFiles: true })) {
    paths.push(path.replaceAll("\\", "/"));
  }
  return paths.sort(compare);
}

async function snapshotInputs(): Promise<Readonly<{
  snapshot: InputSnapshot;
  findings: readonly T0EvidenceFinding[];
  controls: readonly T0EvidenceFinding[];
}>> {
  const findings: T0EvidenceFinding[] = [];
  const controls: T0EvidenceFinding[] = [];
  const paths = new Map<string, string>();
  for (const [group, patterns] of Object.entries(T0_INPUT_GROUPS)) {
    for (const pattern of patterns) {
      const matches = await expandPattern(pattern);
      if (matches.length === 0) findings.push(finding("T0_EVIDENCE_INPUT_MISSING", pattern, `Required ${group} input is missing.`));
      for (const path of matches) {
        const previous = paths.get(path);
        if (previous === undefined) paths.set(path, group);
        else findings.push(finding("T0_EVIDENCE_INPUT_DUPLICATE", path, `Input belongs to both ${previous} and ${group}.`));
      }
    }
  }
  const components: InputComponent[] = [];
  for (const [path, group] of [...paths].sort(([left], [right]) => compare(left, right))) {
    const bytes = new Uint8Array(await Bun.file(path).arrayBuffer());
    components.push({ group, path, bytes: bytes.byteLength, sha256: await sha256Hex(bytes) });
    const text = new TextDecoder().decode(bytes);
    if (group === "tests") controls.push(...inspectT0TestControls(path, text));
    if (path === "bunfig.toml" && !/^retry\s*=\s*0\s*$/m.test(text)) controls.push(finding("T0_EVIDENCE_RETRY", path, "Focused evidence requires [test] retry = 0."));
  }
  return {
    snapshot: {
      algorithm: "sha256-component-manifest-v1",
      digest: await sha256Hex(stableJson(components)),
      components,
    },
    findings: sortFindings(findings),
    controls: sortFindings(controls),
  };
}

function runIdFor(inputDigest: string, seeds: readonly unknown[]): string {
  return sha256Sync(stableJson({ toolVersion: TOOL_VERSION, inputDigest, seeds })).slice(0, 24);
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
  const directory = `test-results/t0-evidence-runs/${runId}`;
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
  return {
    TZ: "UTC",
    LC_ALL: "C",
    LANG: "C",
    BUN_OPTIONS: "",
    NODE_OPTIONS: "",
    NO_COLOR: "1",
    FORCE_COLOR: "0",
    T0_EVIDENCE_RUN_ID: runId,
  };
}

function validatorCommand(): readonly string[] {
  return ["bun", "scripts/validate-t0-contract.ts"];
}

function focusedSuiteCommand(runId: string): readonly string[] {
  return [
    "bun",
    "test",
    ...T0_FOCUSED_TEST_FILES,
    "--max-concurrency=1",
    "--retry=0",
    "--reporter=junit",
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
  const stdout = new Uint8Array(stdoutBuffer);
  const stderr = new Uint8Array(stderrBuffer);
  await Promise.all([atomicWrite(stdoutPath, stdout), atomicWrite(stderrPath, stderr)]);
  const usage = child.resourceUsage();
  const maxRssRaw = safeUsageNumber(usage?.maxRSS);
  const maxRssRawUnit = platform() === "linux" ? "kilobytes" : platform() === "darwin" ? "bytes" : "runtime-defined";
  const maxRssBytes = maxRssRaw === null
    ? null
    : maxRssRawUnit === "kilobytes"
      ? maxRssRaw * 1_024
      : maxRssRawUnit === "bytes"
        ? maxRssRaw
        : null;
  return {
    command,
    environment,
    stdoutPath,
    stderrPath,
    stdoutSha256: await sha256Hex(stdout),
    stderrSha256: await sha256Hex(stderr),
    exitCode,
    signal: child.signalCode,
    elapsedMs: Math.round((performance.now() - started) * 1_000) / 1_000,
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

function executionRecord(value: RawExecution & Readonly<{ stdout: Uint8Array; stderr: Uint8Array }>): RawExecution {
  return {
    command: value.command,
    environment: value.environment,
    stdoutPath: value.stdoutPath,
    stderrPath: value.stderrPath,
    stdoutSha256: value.stdoutSha256,
    stderrSha256: value.stderrSha256,
    exitCode: value.exitCode,
    signal: value.signal,
    elapsedMs: value.elapsedMs,
    resourceUsage: value.resourceUsage,
  };
}

function environmentEvidence(): T0EvidenceLedger["environment"] {
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
      const record = packageValue[field];
      if (!isRecord(record)) continue;
      for (const [name, version] of Object.entries(record)) if (typeof version === "string") versions.set(name, version);
    }
  }
  versions.set("bun", Bun.version);
  versions.set("compiler-node", (await findRealNode()).version);
  versions.set("node-compatibility", process.versions.node);
  return [...versions].sort(([left], [right]) => compare(left, right)).map(([name, version]) => ({ name, version }));
}

function inputSnapshotCandidate(value: unknown, path: string, findings: T0EvidenceFinding[]): InputSnapshot | null {
  if (!isRecord(value) || !exactKeys(value, ["algorithm", "digest", "components"]) || !Array.isArray(value["components"])) {
    findings.push(finding("T0_EVIDENCE_INPUT_SHAPE", path, "Input snapshot must have exact algorithm, digest, and component fields."));
    return null;
  }
  const components: InputComponent[] = [];
  for (const [index, component] of value["components"].entries()) {
    if (!isRecord(component) || !exactKeys(component, ["group", "path", "bytes", "sha256"]) || typeof component["group"] !== "string" || typeof component["path"] !== "string" || typeof component["bytes"] !== "number" || !Number.isSafeInteger(component["bytes"]) || component["bytes"] < 0 || !isSha256(component["sha256"])) {
      findings.push(finding("T0_EVIDENCE_INPUT_COMPONENT", `${path}.components[${String(index)}]`, "Input component is malformed."));
      continue;
    }
    components.push({ group: component["group"], path: component["path"], bytes: component["bytes"], sha256: component["sha256"] });
  }
  const componentPaths = components.map((component) => component.path);
  if (components.length !== value["components"].length || new Set(componentPaths).size !== componentPaths.length || stableJson(componentPaths) !== stableJson([...componentPaths].sort(compare)) || componentPaths.some((item) => item.startsWith("test-results/"))) findings.push(finding("T0_EVIDENCE_INPUT_INVENTORY", path, "Input components must be complete, unique, sorted, and non-circular."));
  const digest = value["digest"];
  if (value["algorithm"] !== "sha256-component-manifest-v1" || !isSha256(digest) || digest !== sha256Sync(stableJson(components))) {
    findings.push(finding("T0_EVIDENCE_INPUT_DIGEST", path, "Input component-manifest digest is invalid."));
    return null;
  }
  return { algorithm: "sha256-component-manifest-v1", digest, components };
}

function validResourceUsage(value: unknown): boolean {
  if (!isRecord(value) || !exactKeys(value, ["measurement", "maxRssRaw", "maxRssRawUnit", "maxRssBytes", "cpuUserMicros", "cpuSystemMicros", "gating"])) return false;
  const raw = value["maxRssRaw"];
  const unit = value["maxRssRawUnit"];
  const nullableInteger = (item: unknown): boolean => item === null || (typeof item === "number" && Number.isSafeInteger(item) && item >= 0);
  const bytes = raw === null
    ? null
    : unit === "kilobytes" && typeof raw === "number"
      ? raw * 1_024
      : unit === "bytes"
        ? raw
        : null;
  return value["measurement"] === "Bun.Subprocess.resourceUsage" && value["gating"] === false && nullableInteger(raw) && ["bytes", "kilobytes", "runtime-defined"].includes(String(unit)) && nullableInteger(value["maxRssBytes"]) && value["maxRssBytes"] === bytes && nullableInteger(value["cpuUserMicros"]) && nullableInteger(value["cpuSystemMicros"]);
}

function fixtureBindingsFrom(snapshot: InputSnapshot): InputComponent[] {
  return snapshot.components.filter(({ path }) => T0_FIXTURE_FILES.includes(path as (typeof T0_FIXTURE_FILES)[number]));
}

function inspectRuntimeMetadata(candidate: JsonRecord): T0EvidenceFinding[] {
  const findings: T0EvidenceFinding[] = [];
  const environment = candidate["environment"];
  if (
    !isRecord(environment) ||
    !exactKeys(environment, ["bun", "nodeCompatibility", "platform", "release", "architecture", "cpuCount", "cpuModel", "totalMemoryBytes", "locale", "timeZone"]) ||
    ["bun", "nodeCompatibility", "platform", "release", "architecture", "cpuModel", "locale", "timeZone"].some((field) => typeof environment[field] !== "string" || environment[field].length === 0) ||
    typeof environment["cpuCount"] !== "number" || !Number.isSafeInteger(environment["cpuCount"]) || environment["cpuCount"] <= 0 ||
    typeof environment["totalMemoryBytes"] !== "number" || !Number.isSafeInteger(environment["totalMemoryBytes"]) || environment["totalMemoryBytes"] <= 0
  ) findings.push(finding("T0_EVIDENCE_ENVIRONMENT", "environment", "Complete exact host/runtime environment evidence is required."));
  const versions = candidate["versions"];
  const names = Array.isArray(versions)
    ? versions.flatMap((value) => isRecord(value) && typeof value["name"] === "string" ? [value["name"]] : [])
    : [];
  if (
    !Array.isArray(versions) || versions.length === 0 ||
    versions.some((value) => !isRecord(value) || !exactKeys(value, ["name", "version"]) || typeof value["name"] !== "string" || value["name"].length === 0 || typeof value["version"] !== "string" || value["version"].length === 0) ||
    new Set(names).size !== versions.length || stableJson(names) !== stableJson([...names].sort(compare)) ||
    !names.includes("bun") || !names.includes("compiler-node") || !names.includes("node-compatibility")
  ) findings.push(finding("T0_EVIDENCE_VERSIONS", "versions", "Sorted unique package and runtime versions are required."));
  for (const field of ["validator", "suite"] as const) {
    const execution = candidate[field];
    if (
      !isRecord(execution) ||
      typeof execution["elapsedMs"] !== "number" || !Number.isFinite(execution["elapsedMs"]) || execution["elapsedMs"] < 0 ||
      !isSha256(execution["stdoutSha256"]) || !isSha256(execution["stderrSha256"]) ||
      (field === "suite" && !isSha256(execution["junitSha256"])) ||
      !validResourceUsage(execution["resourceUsage"])
    ) findings.push(finding("T0_EVIDENCE_EXECUTION_METADATA", field, `${field} hashes, elapsed time, or resource metadata are invalid.`));
  }
  return findings;
}

async function validateCurrentRuntime(candidate: unknown): Promise<T0EvidenceFinding[]> {
  if (!isRecord(candidate)) return [];
  const findings: T0EvidenceFinding[] = [];
  if (stableJson(candidate["environment"]) !== stableJson(environmentEvidence())) findings.push(finding("T0_EVIDENCE_ENVIRONMENT_DRIFT", "environment", "Stored environment differs from the current host/runtime."));
  if (stableJson(candidate["versions"]) !== stableJson(await packageVersions())) findings.push(finding("T0_EVIDENCE_VERSION_DRIFT", "versions", "Stored versions differ from the current package/tool inventory."));
  return findings;
}

export function validateT0EvidenceCandidate(candidate: unknown, currentInputDigest: string): T0EvidenceFinding[] {
  const findings: T0EvidenceFinding[] = [];
  if (!isRecord(candidate)) return [finding("T0_EVIDENCE_LEDGER_SHAPE", OUTPUT_PATH, "Evidence ledger must be an object.")];
  if (candidate["schema"] !== "changes.evidence.t0.v1" || candidate["schemaVersion"] !== 1 || candidate["package"] !== "T0" || candidate["traceId"] !== "T0" || candidate["toolVersion"] !== TOOL_VERSION || candidate["mode"] !== "focused-package") findings.push(finding("T0_EVIDENCE_LEDGER_IDENTITY", OUTPUT_PATH, "Ledger schema, package, tool, and mode identity are not exact."));
  if (candidate["contractVersion"] !== manifestFixture.contractVersion || candidate["contractSchema"] !== manifestFixture.schema) findings.push(finding("T0_EVIDENCE_CONTRACT_IDENTITY", OUTPUT_PATH, "Contract version/schema do not match the reviewed T0 manifest."));
  if (stableJson(candidate["browserVersions"]) !== stableJson([]) || stableJson(candidate["applicability"]) !== stableJson(T0_APPLICABILITY)) findings.push(finding("T0_EVIDENCE_APPLICABILITY", OUTPUT_PATH, "Browser inventory and applicability/deferred ownership are not exact."));
  const input = candidate["input"];
  const pre = isRecord(input) ? inputSnapshotCandidate(input["pre"], "input.pre", findings) : null;
  const post = isRecord(input) ? inputSnapshotCandidate(input["post"], "input.post", findings) : null;
  if (pre === null || post === null || pre.digest !== post.digest || post.digest !== currentInputDigest) findings.push(finding("T0_EVIDENCE_INPUT_STALE", "input", "Pre/post/current input digests must be byte-identical."));
  if (pre !== null && stableJson(candidate["fixtureBindings"]) !== stableJson(fixtureBindingsFrom(pre))) findings.push(finding("T0_EVIDENCE_FIXTURE_BINDING", "fixtureBindings", "Fixture byte hashes must be the exact reviewed input components."));
  const artifact = candidate["artifact"];
  const artifactComponent = pre?.components.find(({ path }) => path === "jazz_chord_progression_editor.html");
  if (!isRecord(artifact) || artifactComponent === undefined || artifact["path"] !== artifactComponent.path || artifact["sha256"] !== artifactComponent.sha256 || artifact["bytes"] !== artifactComponent.bytes) findings.push(finding("T0_EVIDENCE_ARTIFACT_IDENTITY", "artifact", "Artifact path, bytes, and SHA-256 must match the input snapshot exactly."));
  if (stableJson(candidate["caseBindings"]) !== stableJson(buildT0CaseBindings())) findings.push(finding("T0_EVIDENCE_CASE_BINDING", "caseBindings", "Per-case canonical hashes differ from the reviewed fixtures."));
  if (stableJson(candidate["reviewedSeeds"]) !== stableJson(roundtripFixture.seeds) || stableJson(candidate["reviewedCounts"]) !== stableJson(T0_EXPECTED_COUNTS)) findings.push(finding("T0_EVIDENCE_REVIEWED_INVENTORY", OUTPUT_PATH, "Reviewed seeds/counts are not exact."));
  const runId = candidate["runId"];
  if (typeof runId !== "string" || !/^[a-f0-9]{24}$/.test(runId) || pre === null || runId !== runIdFor(pre.digest, roundtripFixture.seeds)) findings.push(finding("T0_EVIDENCE_RUN_ID", "runId", "Run ID is not the deterministic input/seed identity."));
  if (typeof runId === "string" && /^[a-f0-9]{24}$/.test(runId)) {
    const paths = suitePaths(runId);
    const environment = runEnvironment(runId);
    const validator = candidate["validator"];
    if (!isRecord(validator) || stableJson(validator["command"]) !== stableJson(validatorCommand()) || stableJson(validator["environment"]) !== stableJson(environment) || validator["stdoutPath"] !== paths.validatorStdoutPath || validator["stderrPath"] !== paths.validatorStderrPath || validator["exitCode"] !== 0 || validator["signal"] !== null || validator["schema"] !== "changes.validation.t0-contract.v1" || validator["outcome"] !== "pass" || stableJson(validator["counts"]) !== stableJson(T0_EXPECTED_COUNTS) || !validResourceUsage(validator["resourceUsage"])) findings.push(finding("T0_EVIDENCE_VALIDATOR", "validator", "Validator identity, result, counts, or resources are invalid."));
    const suite = candidate["suite"];
    if (!isRecord(suite) || stableJson(suite["command"]) !== stableJson(focusedSuiteCommand(runId)) || stableJson(suite["environment"]) !== stableJson(environment) || suite["stdoutPath"] !== paths.stdoutPath || suite["stderrPath"] !== paths.stderrPath || suite["junitPath"] !== paths.junitPath || suite["exitCode"] !== 0 || suite["signal"] !== null || suite["failures"] !== 0 || suite["errors"] !== 0 || suite["skipped"] !== 0 || suite["todos"] !== 0 || suite["retries"] !== 0 || suite["quarantined"] !== 0 || suite["expectedFailures"] !== 0 || stableJson(suite["files"]) !== stableJson([...T0_FOCUSED_TEST_FILES]) || !validResourceUsage(suite["resourceUsage"])) findings.push(finding("T0_EVIDENCE_SUITE", "suite", "Focused suite command, inventory, strict controls, result, or resources are invalid."));
    const metadata = candidate["runMetadata"];
    if (!isRecord(metadata) || metadata["schema"] !== "changes.evidence.t0.run-metadata.v1" || metadata["path"] !== paths.metadataPath || !isSha256(metadata["sha256"])) findings.push(finding("T0_EVIDENCE_RUN_METADATA", "runMetadata", "Run metadata identity is invalid."));
  }
  findings.push(...inspectT0ObservationRecords(Array.isArray(candidate["observations"]) ? candidate["observations"] : []));
  const observations = Array.isArray(candidate["observations"]) ? candidate["observations"].filter(isRecord) : [];
  const summary: T0JUnitSummary = isRecord(candidate["suite"])
    ? {
        tests: typeof candidate["suite"]["tests"] === "number" ? candidate["suite"]["tests"] : 0,
        assertions: typeof candidate["suite"]["assertions"] === "number" ? candidate["suite"]["assertions"] : 0,
        failures: typeof candidate["suite"]["failures"] === "number" ? candidate["suite"]["failures"] : 1,
        errors: typeof candidate["suite"]["errors"] === "number" ? candidate["suite"]["errors"] : 1,
        skipped: typeof candidate["suite"]["skipped"] === "number" ? candidate["suite"]["skipped"] : 1,
        files: stringArray(candidate["suite"]["files"]),
        cases: Array.isArray(candidate["suite"]["cases"])
          ? candidate["suite"]["cases"].flatMap((item) => isRecord(item) && typeof item["file"] === "string" && typeof item["name"] === "string" ? [{ file: item["file"], name: item["name"] }] : [])
          : [],
      }
    : { tests: 0, assertions: 0, failures: 1, errors: 1, skipped: 1, files: [], cases: [] };
  const expectedTraces = buildT0TraceEvidence(observations, buildT0CaseBindings(), summary, "pass");
  findings.push(...validateT0TraceEvidenceRows(candidate["traces"], expectedTraces));
  if (expectedTraces.length !== 25 || expectedTraces.some(({ outcome }) => outcome !== "pass")) findings.push(finding("T0_EVIDENCE_TRACE_COVERAGE", "traces", "All 25 traces must recompute as passing from executed case/control observations."));
  const expectedMutation = buildT0MutationEvidence(observations, buildT0CaseBindings());
  findings.push(...validateT0MutationEvidenceRows(candidate["mutationEvidence"], expectedMutation));
  if (expectedMutation.outcome !== "pass") findings.push(finding("T0_EVIDENCE_MUTATION_AUDIT", "mutationEvidence", `All ${String(T0_EXPECTED_COUNTS.mutationControls)} reviewed controls must recompute as discharged with zero source-mutant claims.`));
  findings.push(...inspectRuntimeMetadata(candidate));
  if (candidate["outcome"] !== "pass" || stableJson(candidate["findings"]) !== stableJson([])) findings.push(finding("T0_EVIDENCE_STORED_OUTCOME", OUTPUT_PATH, "A stored passing ledger must contain no findings."));
  return sortFindings(findings);
}

async function validateStoredRawEvidence(candidate: unknown): Promise<T0EvidenceFinding[]> {
  const findings: T0EvidenceFinding[] = [];
  if (!isRecord(candidate) || typeof candidate["runId"] !== "string") return findings;
  const suite = candidate["suite"];
  const validator = candidate["validator"];
  const metadata = candidate["runMetadata"];
  if (!isRecord(suite) || !isRecord(validator) || !isRecord(metadata)) return findings;
  const paths = suitePaths(candidate["runId"]);
  const expected = [
    [suite["stdoutPath"], paths.stdoutPath, suite["stdoutSha256"]],
    [suite["stderrPath"], paths.stderrPath, suite["stderrSha256"]],
    [suite["junitPath"], paths.junitPath, suite["junitSha256"]],
    [validator["stdoutPath"], paths.validatorStdoutPath, validator["stdoutSha256"]],
    [validator["stderrPath"], paths.validatorStderrPath, validator["stderrSha256"]],
    [metadata["path"], paths.metadataPath, metadata["sha256"]],
  ] as const;
  const loaded = new Map<string, Uint8Array>();
  for (const [declaredPath, expectedPath, declaredHash] of expected) {
    if (declaredPath !== expectedPath || !isSha256(declaredHash)) {
      findings.push(finding("T0_EVIDENCE_RAW_PATH", expectedPath, "Raw evidence path/hash escaped its deterministic run directory."));
      continue;
    }
    try {
      const bytes = new Uint8Array(await Bun.file(expectedPath).arrayBuffer());
      loaded.set(expectedPath, bytes);
      if (await sha256Hex(bytes) !== declaredHash) findings.push(finding("T0_EVIDENCE_RAW_HASH", expectedPath, "Raw evidence bytes differ from the ledger hash."));
    } catch (error) {
      findings.push(finding("T0_EVIDENCE_RAW_MISSING", expectedPath, error instanceof Error ? error.message : "Raw evidence is missing."));
    }
  }
  const junitBytes = loaded.get(paths.junitPath);
  if (junitBytes !== undefined) {
    const junit = new TextDecoder().decode(junitBytes);
    if (sanitizeT0JUnit(junit) !== junit) findings.push(finding("T0_EVIDENCE_JUNIT_HOST", paths.junitPath, "Stored JUnit still contains a machine hostname."));
    const inspected = inspectT0JUnit(junit);
    findings.push(...inspected.findings);
    if (inspected.summary !== null) {
      for (const field of ["tests", "assertions", "failures", "errors", "skipped"] as const) {
        if (suite[field] !== inspected.summary[field]) findings.push(finding("T0_EVIDENCE_JUNIT_DRIFT", paths.junitPath, `Ledger ${field} differs from JUnit.`));
      }
      if (stableJson(suite["files"]) !== stableJson(inspected.summary.files) || stableJson(suite["cases"]) !== stableJson(inspected.summary.cases)) findings.push(finding("T0_EVIDENCE_JUNIT_DRIFT", paths.junitPath, "Ledger test inventory differs from JUnit."));
    }
  }
  const stdout = loaded.get(paths.stdoutPath);
  const stderr = loaded.get(paths.stderrPath);
  if (stdout !== undefined && stderr !== undefined) {
    const parsed = parseT0Observations(`${new TextDecoder().decode(stdout)}\n${new TextDecoder().decode(stderr)}`);
    findings.push(...parsed.findings);
    if (stableJson(parsed.observations) !== stableJson(candidate["observations"])) findings.push(finding("T0_EVIDENCE_OBSERVATION_DRIFT", "observations", "Ledger observations differ from raw focused-suite output."));
  }
  const validatorBytes = loaded.get(paths.validatorStdoutPath);
  if (validatorBytes !== undefined) {
    try {
      const parsed: unknown = JSON.parse(new TextDecoder().decode(validatorBytes));
      if (!isRecord(parsed) || parsed["schema"] !== validator["schema"] || parsed["outcome"] !== validator["outcome"] || stableJson(parsed["counts"]) !== stableJson(validator["counts"]) || stableJson(parsed["findings"]) !== stableJson(validator["findings"])) findings.push(finding("T0_EVIDENCE_VALIDATOR_DRIFT", paths.validatorStdoutPath, "Validator ledger summary differs from raw JSON."));
    } catch (error) {
      findings.push(finding("T0_EVIDENCE_VALIDATOR_RAW", paths.validatorStdoutPath, error instanceof Error ? error.message : "Validator output is not JSON."));
    }
  }
  const metadataBytes = loaded.get(paths.metadataPath);
  if (metadataBytes !== undefined) {
    try {
      const parsed: unknown = JSON.parse(new TextDecoder().decode(metadataBytes));
      const expectedMetadata = {
        schema: "changes.evidence.t0.run-metadata.v1",
        runId: candidate["runId"],
        environment: candidate["environment"],
        versions: candidate["versions"],
        validator: { elapsedMs: validator["elapsedMs"], resourceUsage: validator["resourceUsage"] },
        suite: { elapsedMs: suite["elapsedMs"], resourceUsage: suite["resourceUsage"] },
      };
      if (stableJson(parsed) !== stableJson(expectedMetadata)) findings.push(finding("T0_EVIDENCE_RUN_METADATA_DRIFT", paths.metadataPath, "Run metadata differs from stored runtime/resource evidence."));
    } catch (error) {
      findings.push(finding("T0_EVIDENCE_RUN_METADATA_INVALID", paths.metadataPath, error instanceof Error ? error.message : "Run metadata is invalid."));
    }
  }
  return sortFindings(findings);
}

function parseJsonBytes(bytes: Uint8Array): JsonRecord {
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return isRecord(value) ? value : {};
  } catch {
    return {};
  }
}

export async function verifyT0Evidence(): Promise<T0EvidenceLedger> {
  const pre = await snapshotInputs();
  const seeds: readonly unknown[] = roundtripFixture.seeds;
  const runId = runIdFor(pre.snapshot.digest, seeds);
  const paths = suitePaths(runId);
  await mkdir(paths.directory, { recursive: true });
  const environment = runEnvironment(runId);
  const validatorRun = await runRaw(validatorCommand(), environment, paths.validatorStdoutPath, paths.validatorStderrPath);
  const validatorJson = parseJsonBytes(validatorRun.stdout);
  const suiteRun = await runRaw(focusedSuiteCommand(runId), environment, paths.stdoutPath, paths.stderrPath);
  let junit: string;
  try {
    junit = sanitizeT0JUnit(await Bun.file(paths.junitPath).text());
    await atomicWrite(paths.junitPath, junit);
  } catch {
    junit = "";
  }
  const inspected = inspectT0JUnit(junit);
  const summary: T0JUnitSummary = inspected.summary ?? { tests: 0, assertions: 0, failures: 0, errors: 0, skipped: 0, files: [], cases: [] };
  const parsedObservations = parseT0Observations(`${new TextDecoder().decode(suiteRun.stdout)}\n${new TextDecoder().decode(suiteRun.stderr)}`);
  const caseBindings = buildT0CaseBindings();
  const suiteOutcome: Outcome = suiteRun.exitCode === 0 && summary.failures === 0 && summary.errors === 0 && summary.skipped === 0 ? "pass" : "fail";
  const traces = buildT0TraceEvidence(parsedObservations.observations, caseBindings, summary, suiteOutcome);
  const mutationEvidence = buildT0MutationEvidence(parsedObservations.observations, caseBindings);
  const versions = await packageVersions();
  const hostEnvironment = environmentEvidence();
  const runMetadataValue = {
    schema: "changes.evidence.t0.run-metadata.v1",
    runId,
    environment: hostEnvironment,
    versions,
    validator: { elapsedMs: validatorRun.elapsedMs, resourceUsage: validatorRun.resourceUsage },
    suite: { elapsedMs: suiteRun.elapsedMs, resourceUsage: suiteRun.resourceUsage },
  };
  const runMetadataJson = stableJson(runMetadataValue);
  await atomicWrite(paths.metadataPath, runMetadataJson);
  const post = await snapshotInputs();
  const controlFindings = [...pre.controls, ...post.controls];
  const artifact = pre.snapshot.components.find(({ path }) => path === "jazz_chord_progression_editor.html");
  const validatorCounts = isRecord(validatorJson["counts"])
    ? Object.fromEntries(Object.entries(validatorJson["counts"]).filter((entry): entry is [string, number] => typeof entry[1] === "number"))
    : {};
  const preliminary: T0EvidenceLedger = {
    schema: "changes.evidence.t0.v1",
    schemaVersion: 1,
    package: "T0",
    traceId: "T0",
    contractVersion: manifestFixture.contractVersion,
    contractSchema: manifestFixture.schema,
    runId,
    toolVersion: TOOL_VERSION,
    mode: "focused-package",
    outcome: "pass",
    findings: [],
    artifact: { path: "jazz_chord_progression_editor.html", sha256: artifact?.sha256 ?? "unavailable", bytes: artifact?.bytes ?? 0 },
    browserVersions: [],
    input: { pre: pre.snapshot, post: post.snapshot },
    fixtureBindings: fixtureBindingsFrom(pre.snapshot),
    caseBindings,
    environment: hostEnvironment,
    versions,
    reviewedSeeds: seeds,
    reviewedCounts: T0_EXPECTED_COUNTS,
    applicability: T0_APPLICABILITY,
    runMetadata: { schema: "changes.evidence.t0.run-metadata.v1", path: paths.metadataPath, sha256: await sha256Hex(runMetadataJson) },
    validator: {
      ...executionRecord(validatorRun),
      schema: typeof validatorJson["schema"] === "string" ? validatorJson["schema"] : "unavailable",
      outcome: validatorJson["outcome"] === "pass" ? "pass" : "fail",
      counts: validatorCounts,
      findings: Array.isArray(validatorJson["findings"]) ? validatorJson["findings"] : [],
    },
    suite: {
      ...executionRecord(suiteRun),
      junitPath: paths.junitPath,
      junitSha256: await sha256Hex(junit),
      tests: summary.tests,
      assertions: summary.assertions,
      failures: summary.failures,
      errors: summary.errors,
      skipped: summary.skipped,
      todos: controlFindings.filter(({ code }) => code === "T0_EVIDENCE_TODO").length,
      retries: controlFindings.filter(({ code }) => code === "T0_EVIDENCE_RETRY").length,
      quarantined: controlFindings.filter(({ code }) => code === "T0_EVIDENCE_QUARANTINE").length,
      expectedFailures: controlFindings.filter(({ code }) => code === "T0_EVIDENCE_EXPECTED_FAILURE").length,
      files: summary.files,
      cases: summary.cases,
    },
    observations: parsedObservations.observations,
    traces,
    mutationEvidence,
  };
  const rawFindings = await validateStoredRawEvidence(preliminary);
  const settled = await snapshotInputs();
  const settledControls = [...controlFindings, ...settled.controls];
  const settledCandidate: T0EvidenceLedger = {
    ...preliminary,
    input: { pre: pre.snapshot, post: settled.snapshot },
    suite: {
      ...preliminary.suite,
      todos: settledControls.filter(({ code }) => code === "T0_EVIDENCE_TODO").length,
      retries: settledControls.filter(({ code }) => code === "T0_EVIDENCE_RETRY").length,
      quarantined: settledControls.filter(({ code }) => code === "T0_EVIDENCE_QUARANTINE").length,
      expectedFailures: settledControls.filter(({ code }) => code === "T0_EVIDENCE_EXPECTED_FAILURE").length,
    },
  };
  const findings = sortFindings([
    ...pre.findings,
    ...pre.controls,
    ...post.findings,
    ...post.controls,
    ...settled.findings,
    ...settled.controls,
    ...inspected.findings,
    ...parsedObservations.findings,
    ...rawFindings,
    ...await validateCurrentRuntime(settledCandidate),
    ...(stableJson(hostEnvironment) === stableJson(environmentEvidence()) ? [] : [finding("T0_EVIDENCE_ENVIRONMENT_DRIFT", "environment", "Runtime environment changed during evidence generation.")]),
    ...validateT0EvidenceCandidate(settledCandidate, settled.snapshot.digest),
  ]);
  const ledger: T0EvidenceLedger = {
    ...settledCandidate,
    outcome: findings.length === 0 && validatorRun.exitCode === 0 && suiteRun.exitCode === 0 && traces.length === 25 && traces.every(({ outcome }) => outcome === "pass") && mutationEvidence.outcome === "pass" ? "pass" : "fail",
    findings,
  };
  await atomicWrite(OUTPUT_PATH, stableJson(ledger));
  return ledger;
}

async function checkExisting(): Promise<Readonly<{ outcome: Outcome; findings: readonly T0EvidenceFinding[] }>> {
  let candidate: unknown;
  try {
    candidate = await Bun.file(OUTPUT_PATH).json() as unknown;
  } catch (error) {
    return { outcome: "fail", findings: [finding("T0_EVIDENCE_LEDGER_MISSING", OUTPUT_PATH, error instanceof Error ? error.message : "Ledger is unreadable.")] };
  }
  const current = await snapshotInputs();
  const raw = await validateStoredRawEvidence(candidate);
  const runtime = await validateCurrentRuntime(candidate);
  const settled = await snapshotInputs();
  const findings = sortFindings([
    ...current.findings,
    ...current.controls,
    ...raw,
    ...runtime,
    ...settled.findings,
    ...settled.controls,
    ...(current.snapshot.digest === settled.snapshot.digest ? [] : [finding("T0_EVIDENCE_INPUT_STALE", "input", "Inputs changed during stored evidence verification.")]),
    ...validateT0EvidenceCandidate(candidate, settled.snapshot.digest),
  ]);
  return { outcome: findings.length === 0 ? "pass" : "fail", findings };
}

if (import.meta.main) {
  try {
    const args = process.argv.slice(2);
    if (args.length > 1 || (args.length === 1 && args[0] !== "--check")) throw new Error("Usage: bun scripts/verify-t0-evidence.ts [--check]");
    if (args[0] === "--check") {
      const result = await checkExisting();
      console.log(stableJson({ schema: "changes.evidence.t0.summary.v1", mode: "check", ledgerPath: OUTPUT_PATH, outcome: result.outcome, findings: result.findings }).trimEnd());
      process.exitCode = result.outcome === "pass" ? 0 : 1;
    } else {
      const evidence = await verifyT0Evidence();
      console.log(stableJson({
        schema: "changes.evidence.t0.summary.v1",
        mode: evidence.mode,
        ledgerPath: OUTPUT_PATH,
        outcome: evidence.outcome,
        runId: evidence.runId,
        tests: evidence.suite.tests,
        assertions: evidence.suite.assertions,
        tracesPassed: evidence.traces.filter(({ outcome }) => outcome === "pass").length,
        tracesRequired: evidence.traces.length,
        reviewedControlsDischarged: evidence.mutationEvidence.reviewedControlsDischarged,
        sourceMutantsExecuted: evidence.mutationEvidence.sourceMutantsExecuted,
        findings: evidence.findings,
      }).trimEnd());
      process.exitCode = evidence.outcome === "pass" ? 0 : 1;
    }
  } catch (error) {
    console.error(stableJson({ schema: "changes.evidence.t0.summary.v1", outcome: "fail", findings: [finding("T0_EVIDENCE_TOOL_FAILURE", OUTPUT_PATH, error instanceof Error ? error.message : "Unknown tool failure.")] }).trimEnd());
    process.exitCode = 2;
  }
}
