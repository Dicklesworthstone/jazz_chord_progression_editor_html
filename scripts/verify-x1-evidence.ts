import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

import { atomicWrite, sha256Hex, stableJson } from "./foundation-io";
import {
  createX1TransportRunPaths,
  runX1TransportEvidence,
} from "./run-x1-transport-evidence";

/**
 * X1/verify: the independent evidence gate for the serialized transport
 * package. It trusts nothing the X1/build leg claimed: it snapshots the
 * reviewed input closure byte-for-byte, re-runs the exact trace-owner suite
 * and the independent contract validator, drives one fresh real-browser
 * matrix run through the X1 evidence runner, re-checks every browser record
 * against expectations this module states itself, maps every trace-ledger
 * row to executed testcases, and records the human listening row as an
 * explicit non-claim. Production output never generates its expectations
 * here; every expectation is frozen in this file or in the reviewed
 * fixtures under tests/fixtures/transport/.
 */

type JsonRecord = Record<string, unknown>;

export const X1_EVIDENCE_REPORT_SCHEMA =
  "changes.validation.x1-transport-evidence.v1";
export const X1_BROWSER_RECORD_SCHEMA =
  "changes.evidence.x1-transport-browser-run.v1";
export const X1_HARNESS_RECORD_SCHEMA =
  "changes.evidence.x1-transport-browser.v1";
export const X1_PLAYWRIGHT_PRODUCER_FILE =
  "tests/integration/transport-browser-evidence.test.ts";
export const X1_PLAYWRIGHT_TESTCASE =
  "records the complete native X1 transport evidence";
export const X1_EXPECTED_BROWSER_PROJECTS = Object.freeze([
  "chromium",
  "firefox",
  "webkit",
] as const);
export const X1_STATIC_MUTATION_PROOF_FILE =
  "tests/static/x1-contract.test.ts";
export const X1_LISTENING_TRACE_ID = "TR-X1-LISTENING";
export const X1_LISTENING_SHARED_EVIDENCE_PATH =
  "release-evidence/audio/listening/x0-listening-v1.json";
export const X1_LISTENING_DEFERRED_SCENE_IDS = Object.freeze([
  "X0-LISTEN-SCENE-003",
  "X0-LISTEN-SCENE-004",
  "X0-LISTEN-SCENE-005",
] as const);
export const X1_BUN_VERSION = "1.3.14";
export const X1_NATURAL_END_DEADLINE_MS = 15_000;

const ROOT = resolve(import.meta.dirname, "..");
const TRACE_LEDGER_PATH = "tests/fixtures/transport/trace-ledger.json";
const EXPECTED_STEP_STATES = Object.freeze([
  "initialize-transport:ready",
  "play:playing",
  "replay:playing",
  "pause:paused",
  "resume:playing",
  "start-preview:playing",
  "release-preview:playing",
  "stop:ready",
] as const);
const EXPECTED_NOTIFICATION_STATUSES = Object.freeze([
  "ready",
  "playing",
  "ready",
  "playing",
  "paused",
  "playing",
  "ready",
] as const);

const X1_PACKAGE_INPUT_PATTERNS = Object.freeze([
  "bun.lock",
  "bunfig.toml",
  "docs/ARCHITECTURE.md",
  "docs/REBUILD_PLAN.md",
  "docs/X1_TRANSPORT_CONTRACT.md",
  "eslint.config.mjs",
  "package.json",
  "playwright.x1.config.ts",
  "scripts/foundation-io.ts",
  "scripts/run-node-tool.ts",
  "scripts/run-x1-transport-evidence.ts",
  "scripts/toolchain-doctor.ts",
  "scripts/validate-x1-contract.ts",
  "scripts/verify.ts",
  "scripts/verify-x1-evidence.ts",
  "src/audio/**/*.ts",
  "src/domain/**/*.ts",
  "src/playback/**/*.ts",
  "src/test-support/fake-audio-platform.ts",
  "src/test-support/x1-transport-browser-harness.ts",
  "tests/fixtures/transport/*.json",
  "tests/static/x1-contract.test.ts",
  "tests/static/x1-evidence-verifier.test.ts",
  "tests/support/emit-x1-evidence-plan.ts",
  "tests/support/transport-test-kit.ts",
  "tsconfig.base.json",
  "tsconfig.e2e.json",
  "tsconfig.tests.json",
  "tsconfig.tools.json",
]);

export type X1EvidenceFinding = Readonly<{
  code: string;
  path: string;
  message: string;
  disposition: "fail" | "incomplete";
}>;

export type X1ArtifactDigest = Readonly<{
  path: string;
  bytes: number;
  sha256: string;
}>;

export type X1PackageInputSnapshot = Readonly<{
  algorithm: "sha256-component-manifest-v1";
  digest: string;
  components: readonly X1ArtifactDigest[];
}>;

export type X1CapturedCommand = Readonly<{
  command: readonly string[];
  environment: Readonly<Record<string, string>>;
  exitCode: number;
  elapsedMilliseconds: number;
  stdout: X1ArtifactDigest;
  stderr: X1ArtifactDigest;
}>;

export type X1OwnerSuiteEvidence = Readonly<{
  command: readonly string[];
  environment: Readonly<Record<string, string>>;
  exitCode: number;
  elapsedMilliseconds: number;
  junit: X1ArtifactDigest;
  stdout: X1ArtifactDigest;
  stderr: X1ArtifactDigest;
  tests: number;
  assertions: number;
  failures: number;
  errors: number;
  skipped: number;
  files: readonly string[];
  cases: readonly Readonly<{ file: string; name: string }>[];
}>;

export type X1TraceOwnerEvidence = Readonly<{
  traceId: string;
  evidenceOwner: string;
  caseIds: readonly string[];
  observedTestcases: number;
  producerKeys: readonly string[];
  outcome: "pass" | "fail";
}>;

export type X1PackageProofReport = Readonly<{
  outcome: "pass" | "fail";
  input: Readonly<{
    pre: X1PackageInputSnapshot;
    post: X1PackageInputSnapshot;
  }>;
  contractValidator: X1CapturedCommand;
  ownerSuite: X1OwnerSuiteEvidence;
  traceOwners: readonly X1TraceOwnerEvidence[];
  findings: readonly X1EvidenceFinding[];
}>;

export type X1BrowserRunEvidence = Readonly<{
  outcome: "pass" | "fail";
  runId: string | null;
  runDirectory: string;
  browserVersions: readonly Readonly<{
    project: string;
    version: string;
  }>[];
  artifacts: readonly X1ArtifactDigest[];
  findings: readonly X1EvidenceFinding[];
}>;

export type X1ListeningEvidence = Readonly<{
  outcome: "pass" | "fail" | "incomplete";
  traceId: typeof X1_LISTENING_TRACE_ID;
  evidencePath: string;
  deferredSceneIds: readonly string[];
  findings: readonly X1EvidenceFinding[];
}>;

export type X1EvidenceReport = Readonly<{
  schema: typeof X1_EVIDENCE_REPORT_SCHEMA;
  outcome: "pass" | "fail" | "incomplete";
  packageProof: X1PackageProofReport;
  browserMatrix: X1BrowserRunEvidence;
  humanListening: X1ListeningEvidence;
}>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function records(value: unknown): readonly JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function strings(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function repoRelative(path: string): string {
  const normalized = relative(ROOT, path).replaceAll("\\", "/");
  if (
    normalized.length === 0 ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    isAbsolute(normalized)
  ) {
    throw new Error(`X1_EVIDENCE_PATH_OUTSIDE_ROOT: ${path}`);
  }
  return normalized;
}

export function isCanonicalX1InputPath(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.includes("\\") ||
    value.includes("\0") ||
    isAbsolute(value)
  ) {
    return false;
  }
  const segments = value.split("/");
  if (
    segments.some(
      (segment) => segment.length === 0 || segment === "." || segment === "..",
    )
  ) {
    return false;
  }
  return relative(ROOT, resolve(ROOT, value)).replaceAll("\\", "/") === value;
}

function canonicalSha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function addFinding(
  findings: X1EvidenceFinding[],
  code: string,
  path: string,
  message: string,
  disposition: X1EvidenceFinding["disposition"] = "fail",
): void {
  findings.push(Object.freeze({ code, path, message, disposition }));
}

function requireEqual(
  actual: unknown,
  expected: unknown,
  code: string,
  path: string,
  findings: X1EvidenceFinding[],
): void {
  if (stableJson(actual) !== stableJson(expected)) {
    addFinding(
      findings,
      code,
      path,
      `Expected ${stableJson(expected)}, observed ${stableJson(actual)}.`,
    );
  }
}

async function digestArtifact(path: string): Promise<X1ArtifactDigest> {
  const bytes = new Uint8Array(await readFile(path));
  return Object.freeze({
    path: repoRelative(path),
    bytes: bytes.byteLength,
    sha256: canonicalSha256(bytes),
  });
}

async function readJsonArtifact(path: string): Promise<Readonly<{
  bytes: Uint8Array;
  value: JsonRecord;
  digest: X1ArtifactDigest;
}>> {
  const bytes = new Uint8Array(await readFile(path));
  const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!isRecord(value)) {
    throw new Error(`${path} must contain one JSON object.`);
  }
  return Object.freeze({
    bytes,
    value,
    digest: Object.freeze({
      path: repoRelative(path),
      bytes: bytes.byteLength,
      sha256: canonicalSha256(bytes),
    }),
  });
}

async function expandPackageInputPattern(
  pattern: string,
): Promise<readonly string[]> {
  if (!pattern.includes("*")) {
    return (await Bun.file(resolve(ROOT, pattern)).exists()) ? [pattern] : [];
  }
  const found: string[] = [];
  for await (const path of new Bun.Glob(pattern).scan({
    cwd: ROOT,
    dot: true,
    onlyFiles: true,
  })) {
    found.push(path.replaceAll("\\", "/"));
  }
  return Object.freeze(found.sort(compare));
}

async function snapshotPackageInputs(
  extraPaths: readonly string[],
): Promise<Readonly<{
  snapshot: X1PackageInputSnapshot;
  findings: readonly X1EvidenceFinding[];
}>> {
  const findings: X1EvidenceFinding[] = [];
  const paths = new Set<string>();
  for (const pattern of [...X1_PACKAGE_INPUT_PATTERNS, ...extraPaths]) {
    const matches = await expandPackageInputPattern(pattern);
    if (matches.length === 0) {
      addFinding(
        findings,
        "X1_EVIDENCE_PACKAGE_INPUT_MISSING",
        pattern,
        "A declared package-proof input is missing.",
      );
    }
    for (const path of matches) paths.add(path);
  }
  const components: X1ArtifactDigest[] = [];
  for (const path of [...paths].sort(compare)) {
    components.push(await digestArtifact(resolve(ROOT, path)));
  }
  return Object.freeze({
    snapshot: Object.freeze({
      algorithm: "sha256-component-manifest-v1",
      digest: await sha256Hex(stableJson(components)),
      components: Object.freeze(components),
    }),
    findings: Object.freeze(findings),
  });
}

async function captureCommand(
  command: readonly string[],
  environment: Readonly<Record<string, string>>,
  stdoutPath: string,
  stderrPath: string,
): Promise<X1CapturedCommand> {
  const started = performance.now();
  const child = Bun.spawn({
    cmd: [...command],
    cwd: ROOT,
    env: { ...process.env, ...environment },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdoutPromise = new Response(child.stdout).arrayBuffer();
  const stderrPromise = new Response(child.stderr).arrayBuffer();
  const [exitCode, stdoutBuffer, stderrBuffer] = await Promise.all([
    child.exited,
    stdoutPromise,
    stderrPromise,
  ]);
  const stdout = new Uint8Array(stdoutBuffer);
  const stderr = new Uint8Array(stderrBuffer);
  await Promise.all([
    atomicWrite(stdoutPath, stdout),
    atomicWrite(stderrPath, stderr),
  ]);
  return Object.freeze({
    command: Object.freeze([...command]),
    environment: Object.freeze({ ...environment }),
    exitCode,
    elapsedMilliseconds:
      Math.round((performance.now() - started) * 1_000) / 1_000,
    stdout: Object.freeze({
      path: repoRelative(stdoutPath),
      bytes: stdout.byteLength,
      sha256: canonicalSha256(stdout),
    }),
    stderr: Object.freeze({
      path: repoRelative(stderrPath),
      bytes: stderr.byteLength,
      sha256: canonicalSha256(stderr),
    }),
  });
}

function xmlUnescape(value: string): string {
  return value
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function xmlAttributes(source: string): Map<string, string> {
  const result = new Map<string, string>();
  const pattern = /([A-Za-z_:][A-Za-z0-9_.:-]*)="([^"]*)"/gu;
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

function junitCount(
  value: string | undefined,
  name: string,
  fallback = 0,
): number {
  if (value === undefined) return fallback;
  if (!/^(?:0|[1-9][0-9]*)$/u.test(value)) {
    throw new Error(`invalid ${name} count`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`unsafe ${name} count`);
  return parsed;
}

function sanitizeJUnit(xml: string): string {
  const sanitized = xml.replace(
    /(<testsuite\b[^>]*?)\s+hostname\s*=\s*(?:"[^"]*"|'[^']*')/gu,
    "$1",
  );
  if (/\bhostname\s*=/u.test(sanitized)) {
    throw new Error("X1_EVIDENCE_JUNIT_HOSTNAME");
  }
  return sanitized;
}

function inspectJUnit(xml: string): Readonly<{
  tests: number;
  assertions: number;
  failures: number;
  errors: number;
  skipped: number;
  files: readonly string[];
  cases: readonly Readonly<{ file: string; name: string }>[];
}> {
  const rootMatch = /<testsuites\b([^>]*)>/u.exec(xml);
  if (rootMatch?.[1] === undefined || !xml.includes("</testsuites>")) {
    throw new Error("X1_EVIDENCE_JUNIT_ROOT");
  }
  const root = xmlAttributes(rootMatch[1]);
  const tests = junitCount(root.get("tests"), "tests");
  const assertions = junitCount(root.get("assertions"), "assertions");
  const failures = junitCount(root.get("failures"), "failures");
  const errors = junitCount(root.get("errors"), "errors", 0);
  const skipped = junitCount(root.get("skipped"), "skipped");
  const cases: Array<{ file: string; name: string }> = [];
  let observedFailures = 0;
  let observedErrors = 0;
  let observedSkipped = 0;
  const pattern = /<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/gu;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml)) !== null) {
    const attributes = xmlAttributes(match[1] ?? "");
    const file = attributes.get("file")?.replaceAll("\\", "/");
    const name = attributes.get("name");
    if (
      file === undefined ||
      file.length === 0 ||
      name === undefined ||
      name.length === 0
    ) {
      throw new Error("X1_EVIDENCE_JUNIT_TESTCASE_IDENTITY");
    }
    const body = match[2] ?? "";
    observedFailures += (body.match(/<failure\b/gu) ?? []).length;
    observedErrors += (body.match(/<error\b/gu) ?? []).length;
    observedSkipped += (body.match(/<skipped\b/gu) ?? []).length;
    cases.push(Object.freeze({ file, name }));
  }
  if (tests !== cases.length) throw new Error("X1_EVIDENCE_JUNIT_TEST_COUNT");
  if (failures !== observedFailures) {
    throw new Error("X1_EVIDENCE_JUNIT_FAILURE_COUNT");
  }
  if (errors !== observedErrors) {
    throw new Error("X1_EVIDENCE_JUNIT_ERROR_COUNT");
  }
  if (skipped !== observedSkipped) {
    throw new Error("X1_EVIDENCE_JUNIT_SKIPPED_COUNT");
  }
  const keys = cases.map(({ file, name }) => `${file} ${name}`);
  if (new Set(keys).size !== keys.length) {
    throw new Error("X1_EVIDENCE_JUNIT_DUPLICATE_TESTCASE");
  }
  cases.sort((left, right) =>
    compare(`${left.file} ${left.name}`, `${right.file} ${right.name}`),
  );
  return Object.freeze({
    tests,
    assertions,
    failures,
    errors,
    skipped,
    files: Object.freeze(
      [...new Set(cases.map(({ file }) => file))].sort(compare),
    ),
    cases: Object.freeze(cases),
  });
}

export function exactX1OwnerTestFiles(
  traceLedger: JsonRecord,
): readonly string[] {
  const owners = records(traceLedger["traces"])
    .map((trace) => trace["evidenceOwner"])
    .filter(
      (owner): owner is string =>
        typeof owner === "string" &&
        isCanonicalX1InputPath(owner) &&
        owner.startsWith("tests/") &&
        owner.endsWith(".test.ts") &&
        owner !== X1_PLAYWRIGHT_PRODUCER_FILE,
    );
  owners.push(X1_STATIC_MUTATION_PROOF_FILE);
  return Object.freeze([...new Set(owners)].sort(compare));
}

export function buildX1OwnerSuiteCommand(
  junitPath: string,
  ownerFiles: readonly string[],
): readonly string[] {
  return Object.freeze([
    process.execPath,
    "test",
    ...ownerFiles,
    "--max-concurrency=1",
    "--retry=0",
    "--reporter=junit",
    `--reporter-outfile=${junitPath}`,
  ]);
}

async function runOwnerSuite(
  runDirectory: string,
  ownerFiles: readonly string[],
): Promise<Readonly<{
  evidence: X1OwnerSuiteEvidence;
  findings: readonly X1EvidenceFinding[];
}>> {
  const directory = resolve(runDirectory, "package-proof");
  await mkdir(directory, { recursive: true });
  const junitPath = resolve(directory, "owner-suite.junit.xml");
  const stdoutPath = resolve(directory, "owner-suite.stdout.log");
  const stderrPath = resolve(directory, "owner-suite.stderr.log");
  const environment = Object.freeze({
    LANG: "C",
    LC_ALL: "C",
    TZ: "UTC",
  });
  const command = buildX1OwnerSuiteCommand(junitPath, ownerFiles);
  const captured = await captureCommand(
    command,
    environment,
    stdoutPath,
    stderrPath,
  );
  const findings: X1EvidenceFinding[] = [];
  let junit = "";
  let summary: ReturnType<typeof inspectJUnit> = Object.freeze({
    tests: 0,
    assertions: 0,
    failures: 1,
    errors: 1,
    skipped: 0,
    files: Object.freeze([]),
    cases: Object.freeze([]),
  });
  try {
    junit = sanitizeJUnit(await Bun.file(junitPath).text());
    await atomicWrite(junitPath, junit);
    summary = inspectJUnit(junit);
  } catch (error) {
    addFinding(
      findings,
      "X1_EVIDENCE_OWNER_JUNIT",
      repoRelative(junitPath),
      error instanceof Error ? error.message : "Owner-suite JUnit is invalid.",
    );
    if (!(await Bun.file(junitPath).exists())) {
      await atomicWrite(junitPath, junit);
    }
  }
  if (captured.exitCode !== 0) {
    addFinding(
      findings,
      "X1_EVIDENCE_OWNER_EXIT",
      "ownerSuite.exitCode",
      "The exact owner suite exited nonzero.",
    );
  }
  if (
    summary.failures !== 0 ||
    summary.errors !== 0 ||
    summary.skipped !== 0
  ) {
    addFinding(
      findings,
      "X1_EVIDENCE_OWNER_COUNTS",
      "ownerSuite.junit",
      "The exact owner suite must contain zero failure, error, or skipped tests.",
    );
  }
  if (JSON.stringify(summary.files) !== JSON.stringify(ownerFiles)) {
    addFinding(
      findings,
      "X1_EVIDENCE_OWNER_INVENTORY",
      "ownerSuite.junit",
      "Executed JUnit files must equal the exact reviewed trace-owner inventory plus the static mutation-proof file.",
    );
  }
  for (const file of ownerFiles) {
    const source = await Bun.file(resolve(ROOT, file)).text();
    if (
      /\b(?:describe|it|test)\s*\.\s*(?:only|skip|todo|failing|skipIf|todoIf|quarantine)\b/u.test(
        source,
      )
    ) {
      addFinding(
        findings,
        "X1_EVIDENCE_OWNER_CONTROL",
        file,
        "Skip, todo, only, failing, conditional-skip, and quarantine controls are forbidden in owner tests.",
      );
    }
  }
  return Object.freeze({
    evidence: Object.freeze({
      command,
      environment,
      exitCode: captured.exitCode,
      elapsedMilliseconds: captured.elapsedMilliseconds,
      junit: await digestArtifact(junitPath),
      stdout: captured.stdout,
      stderr: captured.stderr,
      ...summary,
    }),
    findings: Object.freeze(findings),
  });
}

/**
 * Owner testcases name their fixture case IDs either individually
 * ("X1-TIME-013") or as closed ranges ("X1-TIME-001..X1-TIME-012" /
 * "X1-TIME-013/X1-TIME-014") over the reviewed fixture rows. Coverage
 * therefore expands every range token in the executed testcase name before
 * membership tests; the rows themselves are hash-bound by the contract
 * validator, so a range name cannot silently skip a row.
 */
export function testcaseCoversCaseId(
  testName: string,
  caseId: string,
): boolean {
  const identity = /^([A-Z][A-Z0-9-]*?)-(\d+)$/u.exec(caseId);
  if (identity === null) return testName.includes(caseId);
  const [, casePrefix, caseNumberRaw] = identity;
  if (casePrefix === undefined || caseNumberRaw === undefined) {
    return testName.includes(caseId);
  }
  const caseNumber = Number(caseNumberRaw);
  const token = /([A-Z][A-Z0-9-]*?)-(\d+)/gu;
  let match: RegExpExecArray | null;
  while ((match = token.exec(testName)) !== null) {
    if (match[1] === casePrefix && match[2] === caseNumberRaw) return true;
  }
  const range = /([A-Z][A-Z0-9-]*?)-(\d+)\.\.([A-Z][A-Z0-9-]*?)-(\d+)/gu;
  while ((match = range.exec(testName)) !== null) {
    const [, fromPrefix, fromRaw, toPrefix, toRaw] = match;
    if (
      fromPrefix === undefined ||
      fromRaw === undefined ||
      toPrefix === undefined ||
      toRaw === undefined
    ) {
      continue;
    }
    const from = Number(fromRaw);
    const to = Number(toRaw);
    if (
      fromPrefix === casePrefix &&
      toPrefix === casePrefix &&
      Number.isSafeInteger(from) &&
      Number.isSafeInteger(to) &&
      from <= to &&
      to - from <= 1_000 &&
      caseNumber >= from &&
      caseNumber <= to
    ) {
      return true;
    }
  }
  return false;
}

export type X1FixtureCaseIndex = Readonly<Record<string, readonly string[]>>;

/**
 * Indexes every X1 case identifier the reviewed fixture corpus carries.
 * Keys are case IDs; values are the canonical fixture paths containing them.
 */
export function buildX1FixtureCaseIndex(
  fixtureTexts: Readonly<Record<string, string>>,
): X1FixtureCaseIndex {
  const index = new Map<string, string[]>();
  for (const [path, text] of Object.entries(fixtureTexts)) {
    for (const match of text.matchAll(/\bX1-[A-Z]+-\d+\b/gu)) {
      const token = match[0];
      const paths = index.get(token) ?? [];
      if (!paths.includes(path)) paths.push(path);
      index.set(token, paths);
    }
  }
  return Object.freeze(
    Object.fromEntries(
      [...index.entries()]
        .sort(([left], [right]) => compare(left, right))
        .map(([key, paths]) => [key, Object.freeze(paths.sort(compare))]),
    ),
  );
}

/**
 * Maps every non-browser trace row to executed owner evidence. A case ID is
 * covered when an executed passing testcase names it (exactly or inside a
 * closed range), or when the reviewed, hash-bound fixture corpus carries the
 * case ID — fixture iteration is proven by the owner suite's zero-failure
 * execution, corpus exercise by the orphan-fixture check, and fixture/trace
 * linkage by the embedded contract validator.
 */
export function validateX1TraceOwnerEvidence(
  traceLedger: unknown,
  ownerSuite: X1OwnerSuiteEvidence,
  fixtureCaseIndex: X1FixtureCaseIndex = {},
): Readonly<{
  rows: readonly X1TraceOwnerEvidence[];
  findings: readonly X1EvidenceFinding[];
}> {
  const findings: X1EvidenceFinding[] = [];
  const rows: X1TraceOwnerEvidence[] = [];
  for (const trace of records(
    isRecord(traceLedger) ? traceLedger["traces"] : [],
  )) {
    const traceId = typeof trace["id"] === "string" ? trace["id"] : "invalid";
    const owner =
      typeof trace["evidenceOwner"] === "string"
        ? trace["evidenceOwner"]
        : "invalid";
    if (!owner.endsWith(".test.ts") || owner === X1_PLAYWRIGHT_PRODUCER_FILE) {
      continue;
    }
    const caseIds = [...strings(trace["caseIds"])];
    const ownerCases = ownerSuite.cases.filter(({ file }) => file === owner);
    const producerKeys: string[] = [];
    let rowPass = ownerCases.length > 0 && caseIds.length > 0;
    for (const caseId of caseIds) {
      const namedCases = ownerCases.filter(({ name }) =>
        testcaseCoversCaseId(name, caseId),
      );
      for (const testcase of namedCases) {
        producerKeys.push(`${traceId}|${owner}|${testcase.name}|${caseId}`);
      }
      if (namedCases.length > 0) continue;
      const fixturePaths = fixtureCaseIndex[caseId] ?? [];
      if (fixturePaths.length > 0 && ownerCases.length > 0) {
        for (const fixturePath of fixturePaths) {
          producerKeys.push(
            `${traceId}|${owner}|fixture:${fixturePath}|${caseId}`,
          );
        }
      } else {
        rowPass = false;
      }
    }
    if (!rowPass) {
      addFinding(
        findings,
        "X1_EVIDENCE_TRACE_OWNER",
        `${traceId}:${owner}`,
        "Every non-browser trace row must map its case IDs to an executed owner testcase or to a reviewed fixture the owner file reads.",
      );
    }
    rows.push(
      Object.freeze({
        traceId,
        evidenceOwner: owner,
        caseIds: Object.freeze(caseIds),
        observedTestcases: ownerCases.length,
        producerKeys: Object.freeze(producerKeys.sort(compare)),
        outcome: rowPass ? "pass" : "fail",
      }),
    );
  }
  rows.sort((left, right) => compare(left.traceId, right.traceId));
  findings.sort((left, right) =>
    compare(
      `${left.code}:${left.path}:${left.message}`,
      `${right.code}:${right.path}:${right.message}`,
    ),
  );
  return Object.freeze({
    rows: Object.freeze(rows),
    findings: Object.freeze(findings),
  });
}

function collectPlaywrightSpecs(
  value: unknown,
  collected: Array<{
    title: string;
    project: string;
    ok: boolean;
    resultCount: number;
    statuses: readonly string[];
  }>,
): void {
  if (!isRecord(value)) return;
  const specs = Array.isArray(value["specs"]) ? value["specs"] : [];
  for (const spec of records(specs)) {
    const title = typeof spec["title"] === "string" ? spec["title"] : "";
    const tests = records(spec["tests"]);
    for (const testEntry of tests) {
      const project =
        typeof testEntry["projectName"] === "string"
          ? testEntry["projectName"]
          : "";
      const results = records(testEntry["results"]);
      collected.push({
        title,
        project,
        ok: spec["ok"] === true && testEntry["status"] === "expected",
        resultCount: results.length,
        statuses: Object.freeze(
          results
            .map((entry) => entry["status"])
            .filter(
              (status): status is string => typeof status === "string",
            ),
        ),
      });
    }
  }
  const suites = Array.isArray(value["suites"]) ? value["suites"] : [];
  for (const suite of suites) collectPlaywrightSpecs(suite, collected);
}

async function validateBrowserRun(
  runDirectory: string,
): Promise<X1BrowserRunEvidence> {
  const findings: X1EvidenceFinding[] = [];
  const artifacts: X1ArtifactDigest[] = [];
  const browserVersions: Array<{ project: string; version: string }> = [];
  let runId: string | null = null;

  const metadataPath = resolve(runDirectory, "runner-metadata.json");
  const manifestPath = resolve(runDirectory, "input-manifest.json");
  const resultsPath = resolve(runDirectory, "playwright-results.json");
  const planPath = resolve(runDirectory, "plan.json");

  let metadata: JsonRecord = {};
  let manifest: JsonRecord = {};
  for (const [artifactPath, label] of [
    [metadataPath, "runner-metadata.json"],
    [manifestPath, "input-manifest.json"],
    [resultsPath, "playwright-results.json"],
    [planPath, "plan.json"],
  ] as const) {
    try {
      const artifact = await readJsonArtifact(artifactPath);
      artifacts.push(artifact.digest);
      if (label === "runner-metadata.json") metadata = artifact.value;
      if (label === "input-manifest.json") manifest = artifact.value;
    } catch (error) {
      addFinding(
        findings,
        "X1_EVIDENCE_RUN_ARTIFACT",
        label,
        error instanceof Error
          ? error.message
          : "A required run artifact is missing or unreadable.",
      );
    }
  }

  if (Object.keys(metadata).length > 0) {
    requireEqual(
      metadata["schema"],
      "changes.evidence.x1-transport-runner.v1",
      "X1_EVIDENCE_METADATA_SCHEMA",
      "runner-metadata.schema",
      findings,
    );
    requireEqual(
      metadata["outcome"],
      "pass",
      "X1_EVIDENCE_METADATA_OUTCOME",
      "runner-metadata.outcome",
      findings,
    );
    requireEqual(
      metadata["bunVersion"],
      X1_BUN_VERSION,
      "X1_EVIDENCE_METADATA_BUN",
      "runner-metadata.bunVersion",
      findings,
    );
    if (typeof metadata["runId"] === "string") runId = metadata["runId"];
    const playwright = metadata["playwright"];
    if (isRecord(playwright)) {
      requireEqual(
        playwright["exitCode"],
        0,
        "X1_EVIDENCE_PLAYWRIGHT_EXIT",
        "runner-metadata.playwright.exitCode",
        findings,
      );
      requireEqual(
        playwright["retries"],
        0,
        "X1_EVIDENCE_PLAYWRIGHT_RETRIES",
        "runner-metadata.playwright.retries",
        findings,
      );
      requireEqual(
        playwright["workers"],
        1,
        "X1_EVIDENCE_PLAYWRIGHT_WORKERS",
        "runner-metadata.playwright.workers",
        findings,
      );
      requireEqual(
        playwright["projects"],
        [...X1_EXPECTED_BROWSER_PROJECTS],
        "X1_EVIDENCE_PLAYWRIGHT_PROJECTS",
        "runner-metadata.playwright.projects",
        findings,
      );
    } else {
      addFinding(
        findings,
        "X1_EVIDENCE_PLAYWRIGHT_SECTION",
        "runner-metadata.playwright",
        "Runner metadata must carry the Playwright execution record.",
      );
    }
    const manualListening = metadata["manualListening"];
    if (
      !isRecord(manualListening) ||
      manualListening["performed"] !== false ||
      manualListening["outcome"] !== "not-assessed"
    ) {
      addFinding(
        findings,
        "X1_EVIDENCE_LISTENING_NONCLAIM",
        "runner-metadata.manualListening",
        "The automated runner must record an explicit listening non-claim.",
      );
    }
  }

  if (Object.keys(manifest).length > 0) {
    requireEqual(
      manifest["schema"],
      "changes.evidence.x1-transport-input-manifest.v1",
      "X1_EVIDENCE_MANIFEST_SCHEMA",
      "input-manifest.schema",
      findings,
    );
    const components = records(manifest["components"]);
    const recomputed = await sha256Hex(
      stableJson(
        components.map((component) => ({
          path: component["path"],
          roles: component["roles"],
          bytes: component["bytes"],
          sha256: component["sha256"],
        })),
      ),
    );
    if (manifest["digest"] !== recomputed) {
      addFinding(
        findings,
        "X1_EVIDENCE_MANIFEST_DIGEST",
        "input-manifest.digest",
        "The input-manifest digest must recompute from its components.",
      );
    }
    for (const component of components) {
      const componentPath = component["path"];
      const componentSha = component["sha256"];
      if (
        !isCanonicalX1InputPath(componentPath) ||
        typeof componentSha !== "string" ||
        !/^[a-f0-9]{64}$/u.test(componentSha)
      ) {
        addFinding(
          findings,
          "X1_EVIDENCE_MANIFEST_COMPONENT",
          "input-manifest.components",
          "Every manifest component must carry a canonical path and SHA-256.",
        );
        continue;
      }
      try {
        const current = await digestArtifact(resolve(ROOT, componentPath));
        if (current.sha256 !== componentSha) {
          addFinding(
            findings,
            "X1_EVIDENCE_INPUT_DRIFT",
            componentPath,
            "A reviewed X1 input changed between the evidence run and this verification.",
          );
        }
      } catch {
        addFinding(
          findings,
          "X1_EVIDENCE_INPUT_MISSING",
          componentPath,
          "A reviewed X1 input named by the run manifest no longer exists.",
        );
      }
    }
    if (isRecord(metadata["inputManifest"])) {
      requireEqual(
        metadata["inputManifest"]["digest"],
        manifest["digest"],
        "X1_EVIDENCE_METADATA_MANIFEST_BIND",
        "runner-metadata.inputManifest.digest",
        findings,
      );
      requireEqual(
        metadata["inputManifest"]["componentCount"],
        components.length,
        "X1_EVIDENCE_METADATA_MANIFEST_COUNT",
        "runner-metadata.inputManifest.componentCount",
        findings,
      );
    }
  }

  let bundleSha: string | null = null;
  if (isRecord(metadata["bundle"])) {
    const bundle = metadata["bundle"];
    if (typeof bundle["sha256"] === "string") bundleSha = bundle["sha256"];
    if (typeof bundle["path"] === "string" && isCanonicalX1InputPath(bundle["path"])) {
      try {
        const bundleDigest = await digestArtifact(resolve(ROOT, bundle["path"]));
        artifacts.push(bundleDigest);
        if (bundleDigest.sha256 !== bundleSha) {
          addFinding(
            findings,
            "X1_EVIDENCE_BUNDLE_DIGEST",
            bundle["path"],
            "The persisted harness bundle must match the runner metadata digest.",
          );
        }
      } catch {
        addFinding(
          findings,
          "X1_EVIDENCE_BUNDLE_MISSING",
          bundle["path"],
          "The persisted harness bundle is missing.",
        );
      }
    }
  }

  try {
    const results = await readJsonArtifact(resultsPath);
    const config = isRecord(results.value["config"])
      ? results.value["config"]
      : {};
    // The JSON reporter omits or nulls a disabled retries field; the binding
    // no-retry evidence is the hashed pinned config (retries: 0), the runner
    // metadata record, zero flaky specs, and exactly one result per spec.
    if (
      config["retries"] !== 0 &&
      config["retries"] !== null &&
      config["retries"] !== undefined
    ) {
      addFinding(
        findings,
        "X1_EVIDENCE_PLAYWRIGHT_CONFIG_RETRIES",
        "playwright-results.config.retries",
        "Playwright retries must be disabled in the evidence configuration.",
      );
    }
    requireEqual(
      config["workers"],
      1,
      "X1_EVIDENCE_PLAYWRIGHT_CONFIG_WORKERS",
      "playwright-results.config.workers",
      findings,
    );
    requireEqual(
      config["forbidOnly"],
      true,
      "X1_EVIDENCE_PLAYWRIGHT_CONFIG_FORBID_ONLY",
      "playwright-results.config.forbidOnly",
      findings,
    );
    const stats = isRecord(results.value["stats"])
      ? results.value["stats"]
      : {};
    requireEqual(
      stats["expected"],
      X1_EXPECTED_BROWSER_PROJECTS.length,
      "X1_EVIDENCE_PLAYWRIGHT_EXPECTED",
      "playwright-results.stats.expected",
      findings,
    );
    for (const key of ["unexpected", "flaky", "skipped"] as const) {
      requireEqual(
        stats[key],
        0,
        "X1_EVIDENCE_PLAYWRIGHT_STATS",
        `playwright-results.stats.${key}`,
        findings,
      );
    }
    const collected: Array<{
      title: string;
      project: string;
      ok: boolean;
      resultCount: number;
      statuses: readonly string[];
    }> = [];
    collectPlaywrightSpecs(results.value, collected);
    requireEqual(
      collected.length,
      X1_EXPECTED_BROWSER_PROJECTS.length,
      "X1_EVIDENCE_PLAYWRIGHT_SPEC_COUNT",
      "playwright-results.specs",
      findings,
    );
    for (const spec of collected) {
      if (spec.title !== X1_PLAYWRIGHT_TESTCASE || !spec.ok) {
        addFinding(
          findings,
          "X1_EVIDENCE_PLAYWRIGHT_SPEC_OUTCOME",
          `playwright-results.specs.${spec.project}`,
          "Every browser project must pass the exact X1 producer testcase.",
        );
      }
      if (spec.resultCount !== 1) {
        addFinding(
          findings,
          "X1_EVIDENCE_PLAYWRIGHT_SPEC_RETRY",
          `playwright-results.specs.${spec.project}`,
          "The producer testcase must execute exactly once per browser project.",
        );
      }
    }
    requireEqual(
      collected.map((spec) => spec.project).sort(compare),
      [...X1_EXPECTED_BROWSER_PROJECTS].sort(compare),
      "X1_EVIDENCE_PLAYWRIGHT_SPEC_PROJECTS",
      "playwright-results.specs.projects",
      findings,
    );
  } catch {
    // The missing-artifact finding was already recorded above.
  }

  for (const project of X1_EXPECTED_BROWSER_PROJECTS) {
    const evidencePath = resolve(runDirectory, `${project}.json`);
    let evidence: JsonRecord;
    try {
      const artifact = await readJsonArtifact(evidencePath);
      artifacts.push(artifact.digest);
      evidence = artifact.value;
    } catch {
      addFinding(
        findings,
        "X1_EVIDENCE_BROWSER_RECORD_MISSING",
        `${project}.json`,
        "Every browser project must persist its transport evidence record.",
      );
      continue;
    }
    const base = `browser.${project}`;
    requireEqual(
      evidence["schema"],
      X1_BROWSER_RECORD_SCHEMA,
      "X1_EVIDENCE_BROWSER_SCHEMA",
      `${base}.schema`,
      findings,
    );
    requireEqual(
      evidence["traceId"],
      "TR-X1-BROWSER-MATRIX",
      "X1_EVIDENCE_BROWSER_TRACE",
      `${base}.traceId`,
      findings,
    );
    if (runId !== null) {
      requireEqual(
        evidence["runId"],
        runId,
        "X1_EVIDENCE_BROWSER_RUN_BIND",
        `${base}.runId`,
        findings,
      );
    }
    if (bundleSha !== null) {
      requireEqual(
        evidence["harnessSha256"],
        bundleSha,
        "X1_EVIDENCE_BROWSER_BUNDLE_BIND",
        `${base}.harnessSha256`,
        findings,
      );
    }
    requireEqual(
      evidence["naturalEndDeadlineMs"],
      X1_NATURAL_END_DEADLINE_MS,
      "X1_EVIDENCE_BROWSER_DEADLINE",
      `${base}.naturalEndDeadlineMs`,
      findings,
    );
    const browser = isRecord(evidence["browser"]) ? evidence["browser"] : {};
    if (
      typeof browser["version"] !== "string" ||
      browser["version"].length === 0
    ) {
      addFinding(
        findings,
        "X1_EVIDENCE_BROWSER_VERSION",
        `${base}.browser.version`,
        "Every browser record must carry the real browser version.",
      );
    } else {
      browserVersions.push(
        Object.freeze({ project, version: browser["version"] }),
      );
    }
    const diagnostics = isRecord(evidence["diagnostics"])
      ? evidence["diagnostics"]
      : {};
    requireEqual(
      diagnostics["consoleErrorCount"],
      0,
      "X1_EVIDENCE_BROWSER_CONSOLE",
      `${base}.diagnostics.consoleErrorCount`,
      findings,
    );
    requireEqual(
      diagnostics["pageErrorCount"],
      0,
      "X1_EVIDENCE_BROWSER_PAGEERROR",
      `${base}.diagnostics.pageErrorCount`,
      findings,
    );
    requireEqual(
      diagnostics["blockedRequestCount"],
      0,
      "X1_EVIDENCE_BROWSER_REQUESTS",
      `${base}.diagnostics.blockedRequestCount`,
      findings,
    );
    requireEqual(
      diagnostics["allowedDocumentCount"],
      1,
      "X1_EVIDENCE_BROWSER_DOCUMENT",
      `${base}.diagnostics.allowedDocumentCount`,
      findings,
    );

    const record = isRecord(evidence["record"]) ? evidence["record"] : null;
    if (record === null) {
      addFinding(
        findings,
        "X1_EVIDENCE_RECORD_MISSING",
        `${base}.record`,
        "Every browser evidence file must embed the harness record.",
      );
      continue;
    }
    requireEqual(
      record["schema"],
      X1_HARNESS_RECORD_SCHEMA,
      "X1_EVIDENCE_RECORD_SCHEMA",
      `${base}.record.schema`,
      findings,
    );
    requireEqual(
      record["outcome"],
      "completed",
      "X1_EVIDENCE_RECORD_OUTCOME",
      `${base}.record.outcome`,
      findings,
    );
    requireEqual(
      record["failureDetail"],
      null,
      "X1_EVIDENCE_RECORD_FAILURE",
      `${base}.record.failureDetail`,
      findings,
    );
    requireEqual(
      record["gestureTrusted"],
      true,
      "X1_EVIDENCE_RECORD_GESTURE",
      `${base}.record.gestureTrusted`,
      findings,
    );
    requireEqual(
      record["contextObserved"],
      true,
      "X1_EVIDENCE_RECORD_CONTEXT",
      `${base}.record.contextObserved`,
      findings,
    );
    requireEqual(
      record["naturalEndReached"],
      true,
      "X1_EVIDENCE_RECORD_NATURAL_END",
      `${base}.record.naturalEndReached`,
      findings,
    );
    const naturalEndWaitMs = record["naturalEndWaitMs"];
    if (
      typeof naturalEndWaitMs !== "number" ||
      !Number.isFinite(naturalEndWaitMs) ||
      naturalEndWaitMs < 0 ||
      naturalEndWaitMs > X1_NATURAL_END_DEADLINE_MS
    ) {
      addFinding(
        findings,
        "X1_EVIDENCE_RECORD_NATURAL_END_WAIT",
        `${base}.record.naturalEndWaitMs`,
        "Natural end must settle within the recorded deadline.",
      );
    }
    const steps = records(record["steps"]);
    requireEqual(
      steps.map((step) => `${String(step["step"])}:${String(step["stateAfter"])}`),
      [...EXPECTED_STEP_STATES],
      "X1_EVIDENCE_RECORD_STEPS",
      `${base}.record.steps`,
      findings,
    );
    for (const [index, step] of steps.entries()) {
      if (step["termination"] !== "receipt") {
        addFinding(
          findings,
          "X1_EVIDENCE_RECORD_STEP_TERMINATION",
          `${base}.record.steps.${String(index)}`,
          "Every transport command must settle by receipt, never timeout or fault.",
        );
      }
    }
    const stop = steps.at(-1);
    if (stop?.["noFutureAttackPostcondition"] !== true) {
      addFinding(
        findings,
        "X1_EVIDENCE_RECORD_STOP",
        `${base}.record.steps.stop`,
        "Stop must carry the awaited no-future-attack postcondition.",
      );
    }
    requireEqual(
      record["notificationSequencesStrictlyIncreasing"],
      true,
      "X1_EVIDENCE_RECORD_MONOTONIC",
      `${base}.record.notificationSequencesStrictlyIncreasing`,
      findings,
    );
    requireEqual(
      records(record["notifications"]).map(
        (notification) => notification["status"],
      ),
      [...EXPECTED_NOTIFICATION_STATUSES],
      "X1_EVIDENCE_RECORD_NOTIFICATIONS",
      `${base}.record.notifications`,
      findings,
    );
    const finalTransport = isRecord(record["finalTransport"])
      ? record["finalTransport"]
      : {};
    requireEqual(
      finalTransport["state"],
      "ready",
      "X1_EVIDENCE_RECORD_FINAL_STATE",
      `${base}.record.finalTransport.state`,
      findings,
    );
    requireEqual(
      finalTransport["queuedCommandCount"],
      0,
      "X1_EVIDENCE_RECORD_FINAL_QUEUE",
      `${base}.record.finalTransport.queuedCommandCount`,
      findings,
    );
    const engine = isRecord(record["engine"]) ? record["engine"] : {};
    requireEqual(
      engine["persistentCreatedNodeCount"],
      12,
      "X1_EVIDENCE_RECORD_NODES",
      `${base}.record.engine.persistentCreatedNodeCount`,
      findings,
    );
    requireEqual(
      engine["persistentEdgeCount"],
      13,
      "X1_EVIDENCE_RECORD_EDGES",
      `${base}.record.engine.persistentEdgeCount`,
      findings,
    );
    requireEqual(
      engine["nonreleasingVoiceCount"],
      0,
      "X1_EVIDENCE_RECORD_VOICES",
      `${base}.record.engine.nonreleasingVoiceCount`,
      findings,
    );
    requireEqual(
      engine["debugEventsDropped"],
      0,
      "X1_EVIDENCE_RECORD_DEBUG",
      `${base}.record.engine.debugEventsDropped`,
      findings,
    );
    requireEqual(
      engine["contextState"],
      "running",
      "X1_EVIDENCE_RECORD_CONTEXT_STATE",
      `${base}.record.engine.contextState`,
      findings,
    );
  }

  browserVersions.sort((left, right) => compare(left.project, right.project));
  findings.sort((left, right) =>
    compare(
      `${left.code}:${left.path}:${left.message}`,
      `${right.code}:${right.path}:${right.message}`,
    ),
  );
  return Object.freeze({
    outcome: findings.length === 0 ? "pass" : "fail",
    runId,
    runDirectory: repoRelative(runDirectory),
    browserVersions: Object.freeze(browserVersions),
    artifacts: Object.freeze(artifacts),
    findings: Object.freeze(findings),
  });
}

export async function validateX1ListeningEvidence(
  listeningPath: string = resolve(ROOT, X1_LISTENING_SHARED_EVIDENCE_PATH),
): Promise<X1ListeningEvidence> {
  const findings: X1EvidenceFinding[] = [];
  const deferredSceneIds: string[] = [...X1_LISTENING_DEFERRED_SCENE_IDS];
  let outcome: X1ListeningEvidence["outcome"] = "pass";
  const file = Bun.file(listeningPath);
  if (!(await file.exists())) {
    addFinding(
      findings,
      "X1_EVIDENCE_LISTENING_MISSING",
      repoRelative(listeningPath),
      "TR-X1-LISTENING is human-only: click feel, timbre under transport stress, tempo change, loop boundaries, and stuck-note perception — including the X0-deferred scenes X0-LISTEN-SCENE-003/004/005 — require a recorded human audition. Automation does not claim to hear.",
      "incomplete",
    );
    outcome = "incomplete";
  } else {
    let value: unknown;
    try {
      value = await file.json();
    } catch {
      value = null;
    }
    if (!isRecord(value) || value["schema"] !== "changes.release-evidence.x0-listening.v1") {
      addFinding(
        findings,
        "X1_EVIDENCE_LISTENING_SCHEMA",
        repoRelative(listeningPath),
        "The shared listening evidence file must match the reviewed X0 listening schema.",
      );
      outcome = "fail";
    } else {
      const attestation = isRecord(value["attestation"])
        ? value["attestation"]
        : {};
      if (attestation["automatedListeningClaim"] !== false) {
        addFinding(
          findings,
          "X1_EVIDENCE_LISTENING_NONCLAIM",
          "attestation.automatedListeningClaim",
          "Listening evidence must record that automation made no listening claim.",
        );
        outcome = "fail";
      }
      if (
        attestation["reviewerIsHuman"] !== true ||
        attestation["recordsCreatedAfterAudition"] !== true ||
        attestation["outputCategoriesPhysicallyVerified"] !== true
      ) {
        addFinding(
          findings,
          "X1_EVIDENCE_LISTENING_ATTESTATION",
          "attestation",
          "A human must attest that every listening record follows a physical audition.",
          "incomplete",
        );
        if (outcome !== "fail") outcome = "incomplete";
      }
      const sceneRecords = records(value["records"]).filter((entry) =>
        deferredSceneIds.includes(
          typeof entry["caseId"] === "string" ? entry["caseId"] : "",
        ),
      );
      for (const sceneId of deferredSceneIds) {
        const matching = sceneRecords.filter(
          (entry) => entry["caseId"] === sceneId,
        );
        if (matching.length === 0) {
          addFinding(
            findings,
            "X1_EVIDENCE_LISTENING_SCENE_MISSING",
            sceneId,
            "The X0-deferred transport listening scene has no human record.",
            "incomplete",
          );
          if (outcome !== "fail") outcome = "incomplete";
          continue;
        }
        for (const entry of matching) {
          if (entry["result"] === "fail") {
            addFinding(
              findings,
              "X1_EVIDENCE_LISTENING_SCENE_FAILURE",
              sceneId,
              "A human listening cell reported a release-blocking failure.",
            );
            outcome = "fail";
          } else if (entry["result"] !== "pass") {
            addFinding(
              findings,
              "X1_EVIDENCE_LISTENING_SCENE_PENDING",
              sceneId,
              "The deferred transport listening scene is recorded but not passed.",
              "incomplete",
            );
            if (outcome !== "fail") outcome = "incomplete";
          }
        }
      }
    }
  }
  return Object.freeze({
    outcome,
    traceId: X1_LISTENING_TRACE_ID,
    evidencePath: repoRelative(listeningPath),
    deferredSceneIds: Object.freeze(deferredSceneIds),
    findings: Object.freeze(findings),
  });
}

async function buildPackageProof(
  runDirectory: string,
  pre: Readonly<{
    snapshot: X1PackageInputSnapshot;
    findings: readonly X1EvidenceFinding[];
  }>,
  traceLedger: JsonRecord,
  ownerFiles: readonly string[],
  extraInputPaths: readonly string[],
): Promise<X1PackageProofReport> {
  const findings: X1EvidenceFinding[] = [...pre.findings];
  const proofDirectory = resolve(runDirectory, "package-proof");
  await mkdir(proofDirectory, { recursive: true });
  const environment = Object.freeze({ LANG: "C", LC_ALL: "C", TZ: "UTC" });
  const validator = await captureCommand(
    Object.freeze([process.execPath, "scripts/validate-x1-contract.ts"]),
    environment,
    resolve(proofDirectory, "contract-validator.stdout.log"),
    resolve(proofDirectory, "contract-validator.stderr.log"),
  );
  if (validator.exitCode !== 0) {
    addFinding(
      findings,
      "X1_EVIDENCE_CONTRACT_EXIT",
      "contractValidator.exitCode",
      "The independent X1 contract validator exited nonzero.",
    );
  }
  const owner = await runOwnerSuite(runDirectory, ownerFiles);
  findings.push(...owner.findings);
  const fixtureTexts: Record<string, string> = {};
  for (const fixturePath of await expandPackageInputPattern(
    "tests/fixtures/transport/*.json",
  )) {
    fixtureTexts[fixturePath] = await Bun.file(
      resolve(ROOT, fixturePath),
    ).text();
  }
  const fixtureCaseIndex = buildX1FixtureCaseIndex(
    Object.freeze(fixtureTexts),
  );
  const ownerSources: Record<string, string> = {};
  for (const ownerFile of ownerFiles) {
    ownerSources[ownerFile] = await Bun.file(resolve(ROOT, ownerFile)).text();
  }
  const allOwnerSources = [
    ...Object.values(ownerSources),
    await Bun.file(resolve(ROOT, "scripts/validate-x1-contract.ts")).text(),
  ].join("\n");
  for (const fixturePath of Object.keys(fixtureTexts)) {
    const basename = fixturePath.split("/").at(-1) ?? fixturePath;
    if (
      !allOwnerSources.includes(fixturePath) &&
      !allOwnerSources.includes(basename)
    ) {
      addFinding(
        findings,
        "X1_EVIDENCE_FIXTURE_ORPHAN",
        fixturePath,
        "Every reviewed transport fixture must be read by at least one executed owner test file or the embedded contract validator.",
      );
    }
  }
  const traceOwnerValidation = validateX1TraceOwnerEvidence(
    traceLedger,
    owner.evidence,
    fixtureCaseIndex,
  );
  findings.push(...traceOwnerValidation.findings);
  const post = await snapshotPackageInputs(extraInputPaths);
  findings.push(...post.findings);
  if (pre.snapshot.digest !== post.snapshot.digest) {
    addFinding(
      findings,
      "X1_EVIDENCE_PACKAGE_INPUT_DRIFT",
      "packageProof.input",
      "Package inputs changed between the pre-run and post-run snapshots.",
    );
  }
  findings.sort((left, right) =>
    compare(
      `${left.code}:${left.path}:${left.message}`,
      `${right.code}:${right.path}:${right.message}`,
    ),
  );
  return Object.freeze({
    outcome: findings.length === 0 ? "pass" : "fail",
    input: Object.freeze({ pre: pre.snapshot, post: post.snapshot }),
    contractValidator: validator,
    ownerSuite: owner.evidence,
    traceOwners: traceOwnerValidation.rows,
    findings: Object.freeze(findings),
  });
}

export function mergeX1EvidenceReports(
  packageProof: X1PackageProofReport,
  browserMatrix: X1BrowserRunEvidence,
  humanListening: X1ListeningEvidence,
): X1EvidenceReport {
  const outcome =
    packageProof.outcome === "fail" ||
    browserMatrix.outcome === "fail" ||
    humanListening.outcome === "fail"
      ? "fail"
      : humanListening.outcome === "incomplete"
        ? "incomplete"
        : "pass";
  return Object.freeze({
    schema: X1_EVIDENCE_REPORT_SCHEMA,
    outcome,
    packageProof,
    browserMatrix,
    humanListening,
  });
}

export async function runX1PackageEvidence(
  listeningEvidencePath?: string,
): Promise<X1EvidenceReport> {
  const traceLedger = await readJsonArtifact(resolve(ROOT, TRACE_LEDGER_PATH));
  const ownerFiles = exactX1OwnerTestFiles(traceLedger.value);
  const extraInputPaths = [...ownerFiles];
  const pre = await snapshotPackageInputs(extraInputPaths);
  const nativeRun = await runX1TransportEvidence();
  const runDirectory = resolve(
    ROOT,
    "test-results/x1-transport-evidence-runs",
    nativeRun.metadata.runId,
  );
  const browserMatrix = await validateBrowserRun(runDirectory);
  const packageProof = await buildPackageProof(
    runDirectory,
    pre,
    traceLedger.value,
    ownerFiles,
    extraInputPaths,
  );
  const humanListening = await validateX1ListeningEvidence(
    listeningEvidencePath,
  );
  const report = mergeX1EvidenceReports(
    packageProof,
    browserMatrix,
    humanListening,
  );
  await atomicWrite(
    resolve(runDirectory, "x1-evidence-report.json"),
    stableJson(report),
  );
  return report;
}

export async function runX1ExistingPackageEvidence(
  runDirectory: string,
  listeningEvidencePath?: string,
): Promise<X1EvidenceReport> {
  const resolvedRun = resolve(runDirectory);
  if (!(await Bun.file(resolve(resolvedRun, "runner-metadata.json")).exists())) {
    throw new Error(
      `X1_EVIDENCE_RUN_DIRECTORY_INVALID: ${repoRelative(resolvedRun)}`,
    );
  }
  const traceLedger = await readJsonArtifact(resolve(ROOT, TRACE_LEDGER_PATH));
  const ownerFiles = exactX1OwnerTestFiles(traceLedger.value);
  const extraInputPaths = [...ownerFiles];
  const pre = await snapshotPackageInputs(extraInputPaths);
  const browserMatrix = await validateBrowserRun(resolvedRun);
  const packageProof = await buildPackageProof(
    resolvedRun,
    pre,
    traceLedger.value,
    ownerFiles,
    extraInputPaths,
  );
  const humanListening = await validateX1ListeningEvidence(
    listeningEvidencePath,
  );
  const report = mergeX1EvidenceReports(
    packageProof,
    browserMatrix,
    humanListening,
  );
  await atomicWrite(
    resolve(resolvedRun, "x1-evidence-report.json"),
    stableJson(report),
  );
  return report;
}

export function expectedX1RunDirectory(runId: string): string {
  return createX1TransportRunPaths(runId).runDirectory;
}

async function main(): Promise<void> {
  const args = Bun.argv.slice(2);
  if (args.length > 2) {
    throw new Error(
      "Usage: bun scripts/verify-x1-evidence.ts [run-directory] [listening-evidence.json]",
    );
  }
  const report =
    args.length === 0
      ? await runX1PackageEvidence()
      : await runX1ExistingPackageEvidence(
          args[0] ?? "",
          args[1] === undefined ? undefined : resolve(args[1]),
        );
  process.stdout.write(stableJson(report));
  process.exitCode = report.outcome === "pass" ? 0 : 1;
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(
      stableJson({
        schema: X1_EVIDENCE_REPORT_SCHEMA,
        outcome: "tool-failure",
        message:
          error instanceof Error
            ? error.message
            : "Unknown X1 evidence verifier failure.",
      }),
    );
    process.exitCode = 2;
  }
}
