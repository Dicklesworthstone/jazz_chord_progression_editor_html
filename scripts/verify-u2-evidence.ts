import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

import { atomicWrite, sha256Hex, stableJson } from "./foundation-io";
import {
  createU2InspectorRunPaths,
  runU2InspectorEvidence,
} from "./run-u2-inspector-evidence";

/**
 * U2/verify (jcpe-milestone-reliable-studio-l3a.11.3): the independent
 * evidence gate for the chord-inspector package. It snapshots the
 * reviewed input closure byte-for-byte, re-runs the exact owner suite and
 * the independent contract validator, drives one fresh real-browser matrix
 * run through the U2 evidence runner, re-checks every browser record against
 * expectations this module states itself (the step sequence, the badge
 * labels, the diagnostics, the final transport state), maps every
 * trace-ledger row to executed evidence, and emits a hash-bound report into
 * the run directory. Production output never generates its expectations
 * here; every expectation is frozen in this file or in the reviewed
 * fixtures under tests/fixtures/chord-inspector/.
 */

type JsonRecord = Record<string, unknown>;

export const U2_EVIDENCE_REPORT_SCHEMA =
  "changes.validation.u2-inspector-evidence.v1";
export const U2_BROWSER_RECORD_SCHEMA =
  "changes.evidence.u2-inspector-browser.v1";
export const U2_PLAYWRIGHT_PRODUCER_FILE =
  "tests/integration/u2-inspector-evidence.test.ts";
export const U2_PLAYWRIGHT_TESTCASE =
  "records the complete U2 chord-inspector browser evidence";
export const U2_EXPECTED_BROWSER_PROJECTS = Object.freeze([
  "chromium",
  "firefox",
  "webkit",
] as const);
export const U2_BUN_VERSION = "1.3.14";

const ROOT = resolve(import.meta.dirname, "..");
const TRACE_LEDGER_PATH = "tests/fixtures/chord-inspector/trace-ledger.json";
const EXPECTED_STEP_IDS = Object.freeze([
  "inspector-open",
  "tab-sweep",
  "piano-present",
  "preview-isolation",
  "freeze-transition",
  "symbol-edit-apply",
  "close-restore",
] as const);

const U2_PACKAGE_INPUT_PATTERNS = Object.freeze([
  "bun.lock",
  "bunfig.toml",
  "docs/ARCHITECTURE.md",
  "eslint.config.mjs",
  "package.json",
  "playwright.u2.config.ts",
  "scripts/foundation-io.ts",
  "scripts/run-node-tool.ts",
  "scripts/run-u2-inspector-evidence.ts",
  "scripts/toolchain-doctor.ts",
  "scripts/validate-u2-contract.ts",
  "scripts/verify.ts",
  "scripts/verify-u2-evidence.ts",
  "src/application/application-state.ts",
  "src/application/studio-audio.ts",
  "src/application/studio-controller.ts",
  "src/application/studio-view-model.ts",
  "src/styles/studio.css",
  "src/test-support/studio-audible-browser-harness.ts",
  "src/ui/App.tsx",
  "src/ui/studio/ChordInspector.tsx",
  "src/ui/studio/HarmonyLens.tsx",
  "src/ui/studio/InspectorStructureFields.tsx",
  "src/ui/studio/StudioShell.tsx",
  "src/ui/studio/studio-contract.ts",
  "src/ui/studio/u2-chord-inspector-contract.ts",
  "src/ui/ui-contract.ts",
  "tests/fixtures/chord-inspector/*.json",
  "tests/fixtures/u2/*.json",
  "tests/integration/u2-chord-inspector-workflow.test.ts",
  "tests/integration/u2-inspector-evidence.test.ts",
  "tests/static/u2-contract.test.ts",
  "tests/static/u2-exact-data.test.ts",
  "tests/unit/u2-chord-inspector-projection.test.ts",
  "tests/unit/u2-voicing-lifecycle.test.ts",
  "tsconfig.base.json",
  "tsconfig.e2e.json",
  "tsconfig.tests.json",
  "tsconfig.tools.json",
]);

export type U2EvidenceFinding = Readonly<{
  code: string;
  path: string;
  message: string;
  disposition: "fail";
}>;

export type U2ArtifactDigest = Readonly<{
  path: string;
  bytes: number;
  sha256: string;
}>;

export type U2PackageInputSnapshot = Readonly<{
  algorithm: "sha256-component-manifest-v1";
  digest: string;
  components: readonly U2ArtifactDigest[];
}>;

export type U2CapturedCommand = Readonly<{
  command: readonly string[];
  environment: Readonly<Record<string, string>>;
  exitCode: number;
  elapsedMilliseconds: number;
  stdout: U2ArtifactDigest;
  stderr: U2ArtifactDigest;
}>;

export type U2OwnerSuiteEvidence = Readonly<{
  command: readonly string[];
  environment: Readonly<Record<string, string>>;
  exitCode: number;
  elapsedMilliseconds: number;
  junit: U2ArtifactDigest;
  stdout: U2ArtifactDigest;
  stderr: U2ArtifactDigest;
  tests: number;
  assertions: number;
  failures: number;
  errors: number;
  skipped: number;
  files: readonly string[];
  cases: readonly Readonly<{ file: string; name: string }>[];
}>;

export type U2TraceOwnerEvidence = Readonly<{
  traceId: string;
  evidenceOwner: string;
  caseIds: readonly string[];
  outcome: "pass" | "fail";
}>;

export type U2PackageProofReport = Readonly<{
  outcome: "pass" | "fail";
  input: Readonly<{
    pre: U2PackageInputSnapshot;
    post: U2PackageInputSnapshot;
  }>;
  contractValidator: U2CapturedCommand;
  ownerSuite: U2OwnerSuiteEvidence;
  traceOwners: readonly U2TraceOwnerEvidence[];
  findings: readonly U2EvidenceFinding[];
}>;

export type U2BrowserRunEvidence = Readonly<{
  outcome: "pass" | "fail";
  runId: string | null;
  runDirectory: string;
  browserVersions: readonly Readonly<{
    project: string;
    version: string;
  }>[];
  observedSteps: readonly string[];
  artifacts: readonly U2ArtifactDigest[];
  findings: readonly U2EvidenceFinding[];
}>;

export type U2EvidenceReport = Readonly<{
  schema: typeof U2_EVIDENCE_REPORT_SCHEMA;
  outcome: "pass" | "fail";
  packageProof: U2PackageProofReport;
  browserMatrix: U2BrowserRunEvidence;
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
    throw new Error(`U2_EVIDENCE_PATH_OUTSIDE_ROOT: ${path}`);
  }
  return normalized;
}

function canonicalSha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function addFinding(
  findings: U2EvidenceFinding[],
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
  findings: U2EvidenceFinding[],
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

async function digestArtifact(path: string): Promise<U2ArtifactDigest> {
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
  digest: U2ArtifactDigest;
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
  snapshot: U2PackageInputSnapshot;
  findings: readonly U2EvidenceFinding[];
}>> {
  const findings: U2EvidenceFinding[] = [];
  const paths = new Set<string>();
  for (const pattern of [...U2_PACKAGE_INPUT_PATTERNS, ...extraPaths]) {
    const matches = await expandPackageInputPattern(pattern);
    if (matches.length === 0) {
      addFinding(
        findings,
        "U2_EVIDENCE_PACKAGE_INPUT_MISSING",
        pattern,
        "A declared package-proof input is missing.",
      );
    }
    for (const path of matches) paths.add(path);
  }
  const components: U2ArtifactDigest[] = [];
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
): Promise<U2CapturedCommand> {
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
    throw new Error("U2_EVIDENCE_JUNIT_HOSTNAME");
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
    throw new Error("U2_EVIDENCE_JUNIT_ROOT");
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
      throw new Error("U2_EVIDENCE_JUNIT_TESTCASE_IDENTITY");
    }
    const body = match[2] ?? "";
    observedFailures += (body.match(/<failure\b/gu) ?? []).length;
    observedErrors += (body.match(/<error\b/gu) ?? []).length;
    observedSkipped += (body.match(/<skipped\b/gu) ?? []).length;
    cases.push(Object.freeze({ file, name }));
  }
  if (tests !== cases.length) throw new Error("U2_EVIDENCE_JUNIT_TEST_COUNT");
  if (failures !== observedFailures) {
    throw new Error("U2_EVIDENCE_JUNIT_FAILURE_COUNT");
  }
  if (errors !== observedErrors) {
    throw new Error("U2_EVIDENCE_JUNIT_ERROR_COUNT");
  }
  if (skipped !== observedSkipped) {
    throw new Error("U2_EVIDENCE_JUNIT_SKIPPED_COUNT");
  }
  const keys = cases.map(({ file, name }) => `${file} ${name}`);
  if (new Set(keys).size !== keys.length) {
    throw new Error("U2_EVIDENCE_JUNIT_DUPLICATE_TESTCASE");
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

export function exactU2OwnerTestFiles(
  traceLedger: JsonRecord,
): readonly string[] {
  const owners = records(traceLedger["traces"])
    .map((trace) => trace["evidenceOwner"])
    .filter(
      (owner): owner is string =>
        typeof owner === "string" &&
        owner.startsWith("tests/") &&
        owner.endsWith(".test.ts") &&
        owner !== U2_PLAYWRIGHT_PRODUCER_FILE,
    );
  owners.push("tests/static/u2-contract.test.ts");
  owners.push("tests/static/u2-exact-data.test.ts");
  return Object.freeze([...new Set(owners)].sort(compare));
}

export function buildU2OwnerSuiteCommand(
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
  evidence: U2OwnerSuiteEvidence;
  findings: readonly U2EvidenceFinding[];
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
  const command = buildU2OwnerSuiteCommand(junitPath, ownerFiles);
  const captured = await captureCommand(
    command,
    environment,
    stdoutPath,
    stderrPath,
  );
  const findings: U2EvidenceFinding[] = [];
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
      "U2_EVIDENCE_OWNER_JUNIT",
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
      "U2_EVIDENCE_OWNER_EXIT",
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
      "U2_EVIDENCE_OWNER_COUNTS",
      "ownerSuite.junit",
      "The exact owner suite must contain zero failure, error, or skipped tests.",
    );
  }
  if (JSON.stringify(summary.files) !== JSON.stringify(ownerFiles)) {
    addFinding(
      findings,
      "U2_EVIDENCE_OWNER_INVENTORY",
      "ownerSuite.junit",
      "Executed JUnit files must equal the exact reviewed trace-owner inventory plus the static contract and exact-data files.",
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
        "U2_EVIDENCE_OWNER_CONTROL",
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

export function validateU2TraceOwnerEvidence(
  traceLedger: unknown,
  ownerSuite: U2OwnerSuiteEvidence,
): Readonly<{
  rows: readonly U2TraceOwnerEvidence[];
  findings: readonly U2EvidenceFinding[];
}> {
  const findings: U2EvidenceFinding[] = [];
  const rows: U2TraceOwnerEvidence[] = [];
  for (const trace of records(
    isRecord(traceLedger) ? traceLedger["traces"] : [],
  )) {
    const traceId = typeof trace["id"] === "string" ? trace["id"] : "invalid";
    const owner =
      typeof trace["evidenceOwner"] === "string"
        ? trace["evidenceOwner"]
        : "invalid";
    if (!owner.endsWith(".test.ts") || owner === U2_PLAYWRIGHT_PRODUCER_FILE) {
      continue;
    }
    const caseIds = [...strings(trace["caseIds"])];
    const ownerCases = ownerSuite.cases.filter(({ file }) => file === owner);
    const rowPass = ownerCases.length > 0 && caseIds.length > 0;
    if (!rowPass) {
      addFinding(
        findings,
        "U2_EVIDENCE_TRACE_OWNER",
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
): Promise<U2BrowserRunEvidence> {
  const findings: U2EvidenceFinding[] = [];
  const artifacts: U2ArtifactDigest[] = [];
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
        "U2_EVIDENCE_RUN_ARTIFACT",
        name,
        "A required run artifact is missing or unreadable.",
      );
    }
  }

  if (Object.keys(metadata).length > 0) {
    requireEqual(
      metadata["schema"],
      "changes.evidence.u2-inspector-runner.v1",
      "U2_EVIDENCE_METADATA_SCHEMA",
      "runner-metadata.schema",
      findings,
    );
    requireEqual(
      metadata["outcome"],
      "pass",
      "U2_EVIDENCE_METADATA_OUTCOME",
      "runner-metadata.outcome",
      findings,
    );
    requireEqual(
      metadata["bunVersion"],
      U2_BUN_VERSION,
      "U2_EVIDENCE_METADATA_BUN",
      "runner-metadata.bunVersion",
      findings,
    );
    if (typeof metadata["runId"] === "string") runId = metadata["runId"];
    const playwright = metadata["playwright"];
    if (isRecord(playwright)) {
      requireEqual(
        playwright["exitCode"],
        0,
        "U2_EVIDENCE_PLAYWRIGHT_EXIT",
        "runner-metadata.playwright.exitCode",
        findings,
      );
      requireEqual(
        playwright["retries"],
        0,
        "U2_EVIDENCE_PLAYWRIGHT_RETRIES",
        "runner-metadata.playwright.retries",
        findings,
      );
      requireEqual(
        playwright["workers"],
        1,
        "U2_EVIDENCE_PLAYWRIGHT_WORKERS",
        "runner-metadata.playwright.workers",
        findings,
      );
    }
  }

  if (Object.keys(results).length > 0) {
    const stats = isRecord(results["stats"]) ? results["stats"] : {};
    requireEqual(
      stats["expected"],
      U2_EXPECTED_BROWSER_PROJECTS.length,
      "U2_EVIDENCE_PLAYWRIGHT_EXPECTED",
      "playwright-results.stats.expected",
      findings,
    );
    for (const key of ["unexpected", "flaky", "skipped"] as const) {
      requireEqual(
        stats[key],
        0,
        "U2_EVIDENCE_PLAYWRIGHT_STATS",
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
      U2_EXPECTED_BROWSER_PROJECTS.length,
      "U2_EVIDENCE_PLAYWRIGHT_SPEC_COUNT",
      "playwright-results.specs",
      findings,
    );
    for (const spec of collected) {
      if (spec.title !== U2_PLAYWRIGHT_TESTCASE || !spec.ok) {
        addFinding(
          findings,
          "U2_EVIDENCE_PLAYWRIGHT_SPEC_OUTCOME",
          `playwright-results.specs.${spec.project}`,
          "Every browser project must pass the exact U2 producer testcase.",
        );
      }
      if (spec.resultCount !== 1) {
        addFinding(
          findings,
          "U2_EVIDENCE_PLAYWRIGHT_SPEC_RETRY",
          `playwright-results.specs.${spec.project}`,
          "The producer testcase must execute exactly once per browser project.",
        );
      }
    }
    requireEqual(
      collected.map((spec) => spec.project).sort(compare),
      [...U2_EXPECTED_BROWSER_PROJECTS].sort(compare),
      "U2_EVIDENCE_PLAYWRIGHT_SPEC_PROJECTS",
      "playwright-results.specs.projects",
      findings,
    );
  }

  for (const project of U2_EXPECTED_BROWSER_PROJECTS) {
    const evidencePath = resolve(runDirectory, `${project}.u4.json`);
    let evidence: JsonRecord;
    try {
      const artifact = await readJsonArtifact(evidencePath);
      artifacts.push(artifact.digest);
      evidence = artifact.value;
    } catch {
      addFinding(
        findings,
        "U2_EVIDENCE_BROWSER_RECORD_MISSING",
        `${project}.u4.json`,
        "Every browser project must persist its U2 evidence record.",
      );
      continue;
    }
    const base = `browser.${project}`;
    requireEqual(
      evidence["schema"],
      U2_BROWSER_RECORD_SCHEMA,
      "U2_EVIDENCE_BROWSER_SCHEMA",
      `${base}.schema`,
      findings,
    );
    requireEqual(
      evidence["traceId"],
      "TR-U2-BROWSER-MATRIX",
      "U2_EVIDENCE_BROWSER_TRACE",
      `${base}.traceId`,
      findings,
    );
    if (runId !== null) {
      requireEqual(
        evidence["runId"],
        runId,
        "U2_EVIDENCE_BROWSER_RUN_BIND",
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
        "U2_EVIDENCE_BROWSER_VERSION",
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
      "U2_EVIDENCE_BROWSER_CONSOLE",
      `${base}.diagnostics.consoleErrorCount`,
      findings,
    );
    requireEqual(
      diagnostics["pageErrorCount"],
      0,
      "U2_EVIDENCE_BROWSER_PAGEERROR",
      `${base}.diagnostics.pageErrorCount`,
      findings,
    );
    requireEqual(
      diagnostics["blockedRequestCount"],
      0,
      "U2_EVIDENCE_BROWSER_REQUESTS",
      `${base}.diagnostics.blockedRequestCount`,
      findings,
    );
    requireEqual(
      diagnostics["allowedDocumentCount"],
      1,
      "U2_EVIDENCE_BROWSER_DOCUMENT",
      `${base}.diagnostics.allowedDocumentCount`,
      findings,
    );
    requireEqual(
      evidence["finalTransportState"],
      "ready",
      "U2_EVIDENCE_BROWSER_FINAL_STATE",
      `${base}.finalTransportState`,
      findings,
    );
    requireEqual(
      evidence["nonreleasingVoiceCount"],
      0,
      "U2_EVIDENCE_BROWSER_VOICES",
      `${base}.nonreleasingVoiceCount`,
      findings,
    );
    requireEqual(
      evidence["startupOk"],
      true,
      "U2_EVIDENCE_BROWSER_STARTUP",
      `${base}.startupOk`,
      findings,
    );
  }

  for (const stepId of EXPECTED_STEP_IDS) {
    if (!observedSteps.has(stepId)) {
      addFinding(
        findings,
        "U2_EVIDENCE_STEP_MISSING",
        stepId,
        "Every browser project must execute the complete U2 step sequence.",
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
    snapshot: U2PackageInputSnapshot;
    findings: readonly U2EvidenceFinding[];
  }>,
  traceLedger: JsonRecord,
  ownerFiles: readonly string[],
  extraInputPaths: readonly string[],
): Promise<U2PackageProofReport> {
  const findings: U2EvidenceFinding[] = [...pre.findings];
  const proofDirectory = resolve(runDirectory, "package-proof");
  await mkdir(proofDirectory, { recursive: true });
  const environment = Object.freeze({ LANG: "C", LC_ALL: "C", TZ: "UTC" });
  const validator = await captureCommand(
    Object.freeze([process.execPath, "scripts/validate-u2-contract.ts"]),
    environment,
    resolve(proofDirectory, "contract-validator.stdout.log"),
    resolve(proofDirectory, "contract-validator.stderr.log"),
  );
  if (validator.exitCode !== 0) {
    addFinding(
      findings,
      "U2_EVIDENCE_CONTRACT_EXIT",
      "contractValidator.exitCode",
      "The independent U2 contract validator exited nonzero.",
    );
  }
  const owner = await runOwnerSuite(runDirectory, ownerFiles);
  findings.push(...owner.findings);
  const traceOwnerValidation = validateU2TraceOwnerEvidence(
    traceLedger,
    owner.evidence,
  );
  findings.push(...traceOwnerValidation.findings);
  const post = await snapshotPackageInputs(extraInputPaths);
  findings.push(...post.findings);
  if (pre.snapshot.digest !== post.snapshot.digest) {
    addFinding(
      findings,
      "U2_EVIDENCE_PACKAGE_INPUT_DRIFT",
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

export function mergeU2EvidenceReports(
  packageProof: U2PackageProofReport,
  browserMatrix: U2BrowserRunEvidence,
): U2EvidenceReport {
  return Object.freeze({
    schema: U2_EVIDENCE_REPORT_SCHEMA,
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
        "U2 records inspector state and bookkeeping evidence only; preview timbre remains the shared X0/X1 human listening sessions (jcpe-60xy).",
    }),
  });
}

export async function runU2PackageEvidence(): Promise<U2EvidenceReport> {
  const traceLedger = await readJsonArtifact(resolve(ROOT, TRACE_LEDGER_PATH));
  const ownerFiles = exactU2OwnerTestFiles(traceLedger.value);
  const extraInputPaths = [...ownerFiles];
  const pre = await snapshotPackageInputs(extraInputPaths);
  const nativeRun = await runU2InspectorEvidence();
  const runDirectory = createU2InspectorRunPaths(nativeRun.metadata.runId)
    .runDirectory;
  const browserMatrix = await validateBrowserRun(runDirectory);
  const packageProof = await buildPackageProof(
    runDirectory,
    pre,
    traceLedger.value,
    ownerFiles,
    extraInputPaths,
  );
  const report = mergeU2EvidenceReports(packageProof, browserMatrix);
  await atomicWrite(
    resolve(runDirectory, "u2-evidence-report.json"),
    stableJson(report),
  );
  return report;
}

export async function runU2ExistingPackageEvidence(
  runDirectory: string,
): Promise<U2EvidenceReport> {
  const resolvedRun = resolve(runDirectory);
  if (
    !(await Bun.file(resolve(resolvedRun, "runner-metadata.json")).exists())
  ) {
    throw new Error(
      `U2_EVIDENCE_RUN_DIRECTORY_INVALID: ${repoRelative(resolvedRun)}`,
    );
  }
  const traceLedger = await readJsonArtifact(resolve(ROOT, TRACE_LEDGER_PATH));
  const ownerFiles = exactU2OwnerTestFiles(traceLedger.value);
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
  const report = mergeU2EvidenceReports(packageProof, browserMatrix);
  await atomicWrite(
    resolve(resolvedRun, "u2-evidence-report.json"),
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
      ? await runU2PackageEvidence()
      : await runU2ExistingPackageEvidence(args[0] ?? "");
  process.stdout.write(stableJson(report));
  process.exitCode = report.outcome === "pass" ? 0 : 1;
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(
      stableJson({
        schema: U2_EVIDENCE_REPORT_SCHEMA,
        outcome: "tool-failure",
        message:
          error instanceof Error
            ? error.message
            : "Unknown U2 evidence verifier failure.",
      }),
    );
    process.exitCode = 2;
  }
}
