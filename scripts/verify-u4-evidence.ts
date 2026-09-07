import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

import { atomicWrite, sha256Hex, stableJson } from "./foundation-io";
import {
  createU4TransportRunPaths,
  runU4TransportEvidence,
} from "./run-u4-transport-evidence";

/**
 * U4/verify (jcpe-milestone-reliable-studio-l3a.12.3): the independent
 * evidence gate for the transport-controls package. It snapshots the
 * reviewed input closure byte-for-byte, re-runs the exact owner suite and
 * the independent contract validator, drives one fresh real-browser matrix
 * run through the U4 evidence runner, re-checks every browser record against
 * expectations this module states itself (the step sequence, the badge
 * labels, the diagnostics, the final transport state), maps every
 * trace-ledger row to executed evidence, and emits a hash-bound report into
 * the run directory. Production output never generates its expectations
 * here; every expectation is frozen in this file or in the reviewed
 * fixtures under tests/fixtures/transport-controls/.
 */

type JsonRecord = Record<string, unknown>;

export const U4_EVIDENCE_REPORT_SCHEMA =
  "changes.validation.u4-transport-evidence.v1";
export const U4_BROWSER_RECORD_SCHEMA =
  "changes.evidence.u4-transport-controls-browser.v1";
export const U4_PLAYWRIGHT_PRODUCER_FILE =
  "tests/integration/u4-transport-controls-evidence.test.ts";
export const U4_PLAYWRIGHT_TESTCASE =
  "records the complete U4 transport-controls browser evidence";
export const U4_EXPECTED_BROWSER_PROJECTS = Object.freeze([
  "chromium",
  "firefox",
  "webkit",
] as const);
export const U4_BUN_VERSION = "1.3.14";

const ROOT = resolve(import.meta.dirname, "..");
const TRACE_LEDGER_PATH = "tests/fixtures/transport-controls/trace-ledger.json";
const EXPECTED_STEP_IDS = Object.freeze([
  "initial-truth",
  "enablement-law",
  "slider-position-next-run",
  "space-pause",
  "resume-via-play",
  "stop-while-paused",
  "restart-while-playing",
  "click-toggles-on",
  "click-toggles-off",
  "interrupted-presentation",
  "resume-from-interruption",
  "instrument-boundary-playing",
  "instrument-boundary-cleared",
  "slider-seek-keys",
] as const);

const U4_PACKAGE_INPUT_PATTERNS = Object.freeze([
  "bun.lock",
  "bunfig.toml",
  "docs/ARCHITECTURE.md",
  "docs/U4_TRANSPORT_CONTROLS_CONTRACT.md",
  "eslint.config.mjs",
  "package.json",
  "playwright.u4.config.ts",
  "scripts/foundation-io.ts",
  "scripts/run-node-tool.ts",
  "scripts/run-u4-transport-evidence.ts",
  "scripts/toolchain-doctor.ts",
  "scripts/validate-u4-contract.ts",
  "scripts/verify.ts",
  "scripts/verify-u4-evidence.ts",
  "src/application/application-state.ts",
  "src/application/studio-audio.ts",
  "src/application/studio-controller.ts",
  "src/application/studio-view-model.ts",
  "src/styles/studio.css",
  "src/test-support/studio-audible-browser-harness.ts",
  "src/ui/App.tsx",
  "src/ui/primitives/Icon.tsx",
  "src/ui/studio/StudioIcon.tsx",
  "src/ui/studio/TransportBar.tsx",
  "src/ui/studio/studio-contract.ts",
  "src/ui/studio/u4-transport-controls-contract.ts",
  "src/ui/ui-contract.ts",
  "tests/fixtures/transport-controls/*.json",
  "tests/integration/u4-transport-controls-evidence.test.ts",
  "tests/static/u4-contract.test.ts",
  "tests/unit/studio-playback-pointer.test.ts",
  "tests/unit/studio-transport-controls-u4.test.ts",
  "tsconfig.base.json",
  "tsconfig.e2e.json",
  "tsconfig.tests.json",
  "tsconfig.tools.json",
]);

export type U4EvidenceFinding = Readonly<{
  code: string;
  path: string;
  message: string;
  disposition: "fail";
}>;

export type U4ArtifactDigest = Readonly<{
  path: string;
  bytes: number;
  sha256: string;
}>;

export type U4PackageInputSnapshot = Readonly<{
  algorithm: "sha256-component-manifest-v1";
  digest: string;
  components: readonly U4ArtifactDigest[];
}>;

export type U4CapturedCommand = Readonly<{
  command: readonly string[];
  environment: Readonly<Record<string, string>>;
  exitCode: number;
  elapsedMilliseconds: number;
  stdout: U4ArtifactDigest;
  stderr: U4ArtifactDigest;
}>;

export type U4OwnerSuiteEvidence = Readonly<{
  command: readonly string[];
  environment: Readonly<Record<string, string>>;
  exitCode: number;
  elapsedMilliseconds: number;
  junit: U4ArtifactDigest;
  stdout: U4ArtifactDigest;
  stderr: U4ArtifactDigest;
  tests: number;
  assertions: number;
  failures: number;
  errors: number;
  skipped: number;
  files: readonly string[];
  cases: readonly Readonly<{ file: string; name: string }>[];
}>;

export type U4TraceOwnerEvidence = Readonly<{
  traceId: string;
  evidenceOwner: string;
  caseIds: readonly string[];
  outcome: "pass" | "fail";
}>;

export type U4PackageProofReport = Readonly<{
  outcome: "pass" | "fail";
  input: Readonly<{
    pre: U4PackageInputSnapshot;
    post: U4PackageInputSnapshot;
  }>;
  contractValidator: U4CapturedCommand;
  ownerSuite: U4OwnerSuiteEvidence;
  traceOwners: readonly U4TraceOwnerEvidence[];
  findings: readonly U4EvidenceFinding[];
}>;

export type U4BrowserRunEvidence = Readonly<{
  outcome: "pass" | "fail";
  runId: string | null;
  runDirectory: string;
  browserVersions: readonly Readonly<{
    project: string;
    version: string;
  }>[];
  observedSteps: readonly string[];
  artifacts: readonly U4ArtifactDigest[];
  findings: readonly U4EvidenceFinding[];
}>;

export type U4EvidenceReport = Readonly<{
  schema: typeof U4_EVIDENCE_REPORT_SCHEMA;
  outcome: "pass" | "fail";
  packageProof: U4PackageProofReport;
  browserMatrix: U4BrowserRunEvidence;
  manualListening: Readonly<{
    performed: false;
    outcome: "not-assessed";
    reason: string;
  }>;
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
    throw new Error(`U4_EVIDENCE_PATH_OUTSIDE_ROOT: ${path}`);
  }
  return normalized;
}

function canonicalSha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function addFinding(
  findings: U4EvidenceFinding[],
  code: string,
  path: string,
  message: string,
): void {
  findings.push(Object.freeze({ code, path, message, disposition: "fail" }));
}

function requireEqual(
  actual: unknown,
  expected: unknown,
  code: string,
  path: string,
  findings: U4EvidenceFinding[],
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

async function digestArtifact(path: string): Promise<U4ArtifactDigest> {
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
  digest: U4ArtifactDigest;
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
  snapshot: U4PackageInputSnapshot;
  findings: readonly U4EvidenceFinding[];
}>> {
  const findings: U4EvidenceFinding[] = [];
  const paths = new Set<string>();
  for (const pattern of [...U4_PACKAGE_INPUT_PATTERNS, ...extraPaths]) {
    const matches = await expandPackageInputPattern(pattern);
    if (matches.length === 0) {
      addFinding(
        findings,
        "U4_EVIDENCE_PACKAGE_INPUT_MISSING",
        pattern,
        "A declared package-proof input is missing.",
      );
    }
    for (const path of matches) paths.add(path);
  }
  const components: U4ArtifactDigest[] = [];
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
): Promise<U4CapturedCommand> {
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
    throw new Error("U4_EVIDENCE_JUNIT_HOSTNAME");
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
    throw new Error("U4_EVIDENCE_JUNIT_ROOT");
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
      throw new Error("U4_EVIDENCE_JUNIT_TESTCASE_IDENTITY");
    }
    const body = match[2] ?? "";
    observedFailures += (body.match(/<failure\b/gu) ?? []).length;
    observedErrors += (body.match(/<error\b/gu) ?? []).length;
    observedSkipped += (body.match(/<skipped\b/gu) ?? []).length;
    cases.push(Object.freeze({ file, name }));
  }
  if (tests !== cases.length) throw new Error("U4_EVIDENCE_JUNIT_TEST_COUNT");
  if (failures !== observedFailures) {
    throw new Error("U4_EVIDENCE_JUNIT_FAILURE_COUNT");
  }
  if (errors !== observedErrors) {
    throw new Error("U4_EVIDENCE_JUNIT_ERROR_COUNT");
  }
  if (skipped !== observedSkipped) {
    throw new Error("U4_EVIDENCE_JUNIT_SKIPPED_COUNT");
  }
  const keys = cases.map(({ file, name }) => `${file} ${name}`);
  if (new Set(keys).size !== keys.length) {
    throw new Error("U4_EVIDENCE_JUNIT_DUPLICATE_TESTCASE");
  }
  cases.sort((left, right) =>
    compare(`${left.file} ${left.name}`, `${right.file} ${right.name}`),
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

export function exactU4OwnerTestFiles(
  traceLedger: JsonRecord,
): readonly string[] {
  const owners = records(traceLedger["traces"])
    .map((trace) => trace["evidenceOwner"])
    .filter(
      (owner): owner is string =>
        typeof owner === "string" &&
        owner.startsWith("tests/") &&
        owner.endsWith(".test.ts") &&
        owner !== U4_PLAYWRIGHT_PRODUCER_FILE,
    );
  owners.push("tests/static/u4-contract.test.ts");
  owners.push("tests/unit/studio-playback-pointer.test.ts");
  return Object.freeze([...new Set(owners)].sort(compare));
}

export function buildU4OwnerSuiteCommand(
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
  evidence: U4OwnerSuiteEvidence;
  findings: readonly U4EvidenceFinding[];
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
  const command = buildU4OwnerSuiteCommand(junitPath, ownerFiles);
  const captured = await captureCommand(
    command,
    environment,
    stdoutPath,
    stderrPath,
  );
  const findings: U4EvidenceFinding[] = [];
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
      "U4_EVIDENCE_OWNER_JUNIT",
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
      "U4_EVIDENCE_OWNER_EXIT",
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
      "U4_EVIDENCE_OWNER_COUNTS",
      "ownerSuite.junit",
      "The exact owner suite must contain zero failure, error, or skipped tests.",
    );
  }
  if (JSON.stringify(summary.files) !== JSON.stringify(ownerFiles)) {
    addFinding(
      findings,
      "U4_EVIDENCE_OWNER_INVENTORY",
      "ownerSuite.junit",
      "Executed JUnit files must equal the exact reviewed trace-owner inventory plus the static and pointer files.",
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
        "U4_EVIDENCE_OWNER_CONTROL",
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

export function validateU4TraceOwnerEvidence(
  traceLedger: unknown,
  ownerSuite: U4OwnerSuiteEvidence,
): Readonly<{
  rows: readonly U4TraceOwnerEvidence[];
  findings: readonly U4EvidenceFinding[];
}> {
  const findings: U4EvidenceFinding[] = [];
  const rows: U4TraceOwnerEvidence[] = [];
  for (const trace of records(
    isRecord(traceLedger) ? traceLedger["traces"] : [],
  )) {
    const traceId = typeof trace["id"] === "string" ? trace["id"] : "invalid";
    const owner =
      typeof trace["evidenceOwner"] === "string"
        ? trace["evidenceOwner"]
        : "invalid";
    if (!owner.endsWith(".test.ts") || owner === U4_PLAYWRIGHT_PRODUCER_FILE) {
      continue;
    }
    const caseIds = [...strings(trace["caseIds"])];
    const ownerCases = ownerSuite.cases.filter(({ file }) => file === owner);
    const rowPass = ownerCases.length > 0 && caseIds.length > 0;
    if (!rowPass) {
      addFinding(
        findings,
        "U4_EVIDENCE_TRACE_OWNER",
        `${traceId}:${owner}`,
        "Every non-browser trace row must map its case IDs to an executed owner test file.",
      );
    }
    rows.push(
      Object.freeze({
        traceId,
        evidenceOwner: owner,
        caseIds: Object.freeze(caseIds),
        outcome: rowPass ? "pass" : "fail",
      }),
    );
  }
  rows.sort((left, right) => compare(left.traceId, right.traceId));
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
      });
    }
  }
  const suites = Array.isArray(value["suites"]) ? value["suites"] : [];
  for (const suite of suites) collectPlaywrightSpecs(suite, collected);
}

async function validateBrowserRun(
  runDirectory: string,
): Promise<U4BrowserRunEvidence> {
  const findings: U4EvidenceFinding[] = [];
  const artifacts: U4ArtifactDigest[] = [];
  const browserVersions: Array<{ project: string; version: string }> = [];
  const observedSteps = new Set<string>();
  let runId: string | null = null;

  let metadata: JsonRecord = {};
  let results: JsonRecord = {};
  for (const [name] of [
    ["runner-metadata.json"],
    ["input-manifest.json"],
    ["playwright-results.json"],
  ] as const) {
    try {
      const artifact = await readJsonArtifact(resolve(runDirectory, name));
      artifacts.push(artifact.digest);
      if (name === "runner-metadata.json") metadata = artifact.value;
      if (name === "playwright-results.json") results = artifact.value;
    } catch {
      addFinding(
        findings,
        "U4_EVIDENCE_RUN_ARTIFACT",
        name,
        "A required run artifact is missing or unreadable.",
      );
    }
  }

  if (Object.keys(metadata).length > 0) {
    requireEqual(
      metadata["schema"],
      "changes.evidence.u4-transport-runner.v1",
      "U4_EVIDENCE_METADATA_SCHEMA",
      "runner-metadata.schema",
      findings,
    );
    requireEqual(
      metadata["outcome"],
      "pass",
      "U4_EVIDENCE_METADATA_OUTCOME",
      "runner-metadata.outcome",
      findings,
    );
    requireEqual(
      metadata["bunVersion"],
      U4_BUN_VERSION,
      "U4_EVIDENCE_METADATA_BUN",
      "runner-metadata.bunVersion",
      findings,
    );
    if (typeof metadata["runId"] === "string") runId = metadata["runId"];
    const playwright = metadata["playwright"];
    if (isRecord(playwright)) {
      requireEqual(
        playwright["exitCode"],
        0,
        "U4_EVIDENCE_PLAYWRIGHT_EXIT",
        "runner-metadata.playwright.exitCode",
        findings,
      );
      requireEqual(
        playwright["retries"],
        0,
        "U4_EVIDENCE_PLAYWRIGHT_RETRIES",
        "runner-metadata.playwright.retries",
        findings,
      );
      requireEqual(
        playwright["workers"],
        1,
        "U4_EVIDENCE_PLAYWRIGHT_WORKERS",
        "runner-metadata.playwright.workers",
        findings,
      );
    }
  }

  if (Object.keys(results).length > 0) {
    const stats = isRecord(results["stats"]) ? results["stats"] : {};
    requireEqual(
      stats["expected"],
      U4_EXPECTED_BROWSER_PROJECTS.length,
      "U4_EVIDENCE_PLAYWRIGHT_EXPECTED",
      "playwright-results.stats.expected",
      findings,
    );
    for (const key of ["unexpected", "flaky", "skipped"] as const) {
      requireEqual(
        stats[key],
        0,
        "U4_EVIDENCE_PLAYWRIGHT_STATS",
        `playwright-results.stats.${key}`,
        findings,
      );
    }
    const collected: Array<{
      title: string;
      project: string;
      ok: boolean;
      resultCount: number;
    }> = [];
    collectPlaywrightSpecs(results, collected);
    requireEqual(
      collected.length,
      U4_EXPECTED_BROWSER_PROJECTS.length,
      "U4_EVIDENCE_PLAYWRIGHT_SPEC_COUNT",
      "playwright-results.specs",
      findings,
    );
    for (const spec of collected) {
      if (spec.title !== U4_PLAYWRIGHT_TESTCASE || !spec.ok) {
        addFinding(
          findings,
          "U4_EVIDENCE_PLAYWRIGHT_SPEC_OUTCOME",
          `playwright-results.specs.${spec.project}`,
          "Every browser project must pass the exact U4 producer testcase.",
        );
      }
      if (spec.resultCount !== 1) {
        addFinding(
          findings,
          "U4_EVIDENCE_PLAYWRIGHT_SPEC_RETRY",
          `playwright-results.specs.${spec.project}`,
          "The producer testcase must execute exactly once per browser project.",
        );
      }
    }
    requireEqual(
      collected.map((spec) => spec.project).sort(compare),
      [...U4_EXPECTED_BROWSER_PROJECTS].sort(compare),
      "U4_EVIDENCE_PLAYWRIGHT_SPEC_PROJECTS",
      "playwright-results.specs.projects",
      findings,
    );
  }

  for (const project of U4_EXPECTED_BROWSER_PROJECTS) {
    const evidencePath = resolve(runDirectory, `${project}.u4.json`);
    let evidence: JsonRecord;
    try {
      const artifact = await readJsonArtifact(evidencePath);
      artifacts.push(artifact.digest);
      evidence = artifact.value;
    } catch {
      addFinding(
        findings,
        "U4_EVIDENCE_BROWSER_RECORD_MISSING",
        `${project}.u4.json`,
        "Every browser project must persist its U4 evidence record.",
      );
      continue;
    }
    const base = `browser.${project}`;
    requireEqual(
      evidence["schema"],
      U4_BROWSER_RECORD_SCHEMA,
      "U4_EVIDENCE_BROWSER_SCHEMA",
      `${base}.schema`,
      findings,
    );
    requireEqual(
      evidence["traceId"],
      "TR-U4-BROWSER-MATRIX",
      "U4_EVIDENCE_BROWSER_TRACE",
      `${base}.traceId`,
      findings,
    );
    if (runId !== null) {
      requireEqual(
        evidence["runId"],
        runId,
        "U4_EVIDENCE_BROWSER_RUN_BIND",
        `${base}.runId`,
        findings,
      );
    }
    const browser = isRecord(evidence["browser"]) ? evidence["browser"] : {};
    if (
      typeof browser["version"] !== "string" ||
      browser["version"].length === 0
    ) {
      addFinding(
        findings,
        "U4_EVIDENCE_BROWSER_VERSION",
        `${base}.browser.version`,
        "Every browser record must carry the real browser version.",
      );
    } else {
      browserVersions.push(
        Object.freeze({ project, version: browser["version"] }),
      );
    }
    for (const step of records(evidence["steps"])) {
      if (typeof step["step"] === "string") observedSteps.add(step["step"]);
    }
    const diagnostics = isRecord(evidence["diagnostics"])
      ? evidence["diagnostics"]
      : {};
    requireEqual(
      diagnostics["consoleErrorCount"],
      0,
      "U4_EVIDENCE_BROWSER_CONSOLE",
      `${base}.diagnostics.consoleErrorCount`,
      findings,
    );
    requireEqual(
      diagnostics["pageErrorCount"],
      0,
      "U4_EVIDENCE_BROWSER_PAGEERROR",
      `${base}.diagnostics.pageErrorCount`,
      findings,
    );
    requireEqual(
      diagnostics["blockedRequestCount"],
      0,
      "U4_EVIDENCE_BROWSER_REQUESTS",
      `${base}.diagnostics.blockedRequestCount`,
      findings,
    );
    requireEqual(
      diagnostics["allowedDocumentCount"],
      1,
      "U4_EVIDENCE_BROWSER_DOCUMENT",
      `${base}.diagnostics.allowedDocumentCount`,
      findings,
    );
    requireEqual(
      evidence["finalTransportState"],
      "ready",
      "U4_EVIDENCE_BROWSER_FINAL_STATE",
      `${base}.finalTransportState`,
      findings,
    );
    requireEqual(
      evidence["nonreleasingVoiceCount"],
      0,
      "U4_EVIDENCE_BROWSER_VOICES",
      `${base}.nonreleasingVoiceCount`,
      findings,
    );
    requireEqual(
      evidence["startupOk"],
      true,
      "U4_EVIDENCE_BROWSER_STARTUP",
      `${base}.startupOk`,
      findings,
    );
  }

  for (const stepId of EXPECTED_STEP_IDS) {
    if (!observedSteps.has(stepId)) {
      addFinding(
        findings,
        "U4_EVIDENCE_STEP_MISSING",
        stepId,
        "Every browser project must execute the complete U4 step sequence.",
      );
    }
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
    observedSteps: Object.freeze([...observedSteps].sort(compare)),
    artifacts: Object.freeze(artifacts),
    findings: Object.freeze(findings),
  });
}

async function buildPackageProof(
  runDirectory: string,
  pre: Readonly<{
    snapshot: U4PackageInputSnapshot;
    findings: readonly U4EvidenceFinding[];
  }>,
  traceLedger: JsonRecord,
  ownerFiles: readonly string[],
  extraInputPaths: readonly string[],
): Promise<U4PackageProofReport> {
  const findings: U4EvidenceFinding[] = [...pre.findings];
  const proofDirectory = resolve(runDirectory, "package-proof");
  await mkdir(proofDirectory, { recursive: true });
  const environment = Object.freeze({ LANG: "C", LC_ALL: "C", TZ: "UTC" });
  const validator = await captureCommand(
    Object.freeze([process.execPath, "scripts/validate-u4-contract.ts"]),
    environment,
    resolve(proofDirectory, "contract-validator.stdout.log"),
    resolve(proofDirectory, "contract-validator.stderr.log"),
  );
  if (validator.exitCode !== 0) {
    addFinding(
      findings,
      "U4_EVIDENCE_CONTRACT_EXIT",
      "contractValidator.exitCode",
      "The independent U4 contract validator exited nonzero.",
    );
  }
  const owner = await runOwnerSuite(runDirectory, ownerFiles);
  findings.push(...owner.findings);
  const traceOwnerValidation = validateU4TraceOwnerEvidence(
    traceLedger,
    owner.evidence,
  );
  findings.push(...traceOwnerValidation.findings);
  const post = await snapshotPackageInputs(extraInputPaths);
  findings.push(...post.findings);
  if (pre.snapshot.digest !== post.snapshot.digest) {
    addFinding(
      findings,
      "U4_EVIDENCE_PACKAGE_INPUT_DRIFT",
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

export function mergeU4EvidenceReports(
  packageProof: U4PackageProofReport,
  browserMatrix: U4BrowserRunEvidence,
): U4EvidenceReport {
  return Object.freeze({
    schema: U4_EVIDENCE_REPORT_SCHEMA,
    outcome:
      packageProof.outcome === "fail" || browserMatrix.outcome === "fail"
        ? "fail"
        : "pass",
    packageProof,
    browserMatrix,
    manualListening: Object.freeze({
      performed: false,
      outcome: "not-assessed",
      reason:
        "U4 records transport state and bookkeeping evidence only; timbre and stuck-note perception remain the shared X0/X1 human listening sessions (jcpe-60xy).",
    }),
  });
}

export async function runU4PackageEvidence(): Promise<U4EvidenceReport> {
  const traceLedger = await readJsonArtifact(resolve(ROOT, TRACE_LEDGER_PATH));
  const ownerFiles = exactU4OwnerTestFiles(traceLedger.value);
  const extraInputPaths = [...ownerFiles];
  const pre = await snapshotPackageInputs(extraInputPaths);
  const nativeRun = await runU4TransportEvidence();
  const runDirectory = createU4TransportRunPaths(nativeRun.metadata.runId)
    .runDirectory;
  const browserMatrix = await validateBrowserRun(runDirectory);
  const packageProof = await buildPackageProof(
    runDirectory,
    pre,
    traceLedger.value,
    ownerFiles,
    extraInputPaths,
  );
  const report = mergeU4EvidenceReports(packageProof, browserMatrix);
  await atomicWrite(
    resolve(runDirectory, "u4-evidence-report.json"),
    stableJson(report),
  );
  return report;
}

export async function runU4ExistingPackageEvidence(
  runDirectory: string,
): Promise<U4EvidenceReport> {
  const resolvedRun = resolve(runDirectory);
  if (
    !(await Bun.file(resolve(resolvedRun, "runner-metadata.json")).exists())
  ) {
    throw new Error(
      `U4_EVIDENCE_RUN_DIRECTORY_INVALID: ${repoRelative(resolvedRun)}`,
    );
  }
  const traceLedger = await readJsonArtifact(resolve(ROOT, TRACE_LEDGER_PATH));
  const ownerFiles = exactU4OwnerTestFiles(traceLedger.value);
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
  const report = mergeU4EvidenceReports(packageProof, browserMatrix);
  await atomicWrite(
    resolve(resolvedRun, "u4-evidence-report.json"),
    stableJson(report),
  );
  return report;
}

async function main(): Promise<void> {
  const args = Bun.argv.slice(2);
  if (args.length > 1) {
    throw new Error(
      "Usage: bun scripts/verify-u4-evidence.ts [run-directory]",
    );
  }
  const report =
    args.length === 0
      ? await runU4PackageEvidence()
      : await runU4ExistingPackageEvidence(args[0] ?? "");
  process.stdout.write(stableJson(report));
  process.exitCode = report.outcome === "pass" ? 0 : 1;
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(
      stableJson({
        schema: U4_EVIDENCE_REPORT_SCHEMA,
        outcome: "tool-failure",
        message:
          error instanceof Error
            ? error.message
            : "Unknown U4 evidence verifier failure.",
      }),
    );
    process.exitCode = 2;
  }
}
