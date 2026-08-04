import { createHash } from "node:crypto";
import { mkdir, readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

import { atomicWrite, sha256Hex, stableJson } from "./foundation-io";
import { runX0AudioEvidence } from "./run-x0-audio-evidence";
import {
  validateX0ListeningEvidence,
  type X0ListeningReport,
} from "./verify-x0-listening-evidence";

type JsonRecord = Record<string, unknown>;

export const X0_EVIDENCE_REPORT_SCHEMA =
  "changes.validation.x0-audio-evidence.v1";
export const X0_BROWSER_RUN_SCHEMA = "changes.evidence.x0-browser-run.v1";
export const X0_PLAYWRIGHT_PRODUCER_FILE =
  "tests/integration/audio-offline-render.test.ts";
export const X0_PLAYWRIGHT_TESTCASE =
  "records the complete native X0 audio evidence";
export const X0_EXPECTED_BROWSER_PROJECTS = Object.freeze([
  "chromium",
  "firefox",
  "webkit",
] as const);

const ROOT = resolve(import.meta.dirname, "..");
const RUNS_ROOT = resolve(ROOT, "test-results/x0-audio-evidence-runs");
const DEFAULT_LISTENING_PATH = resolve(
  ROOT,
  "release-evidence/audio/listening/x0-listening-v1.json",
);
const RENDER_MATRIX_PATH = resolve(
  ROOT,
  "tests/fixtures/audio-engine/render-matrix.json",
);
const IMPULSE_GOLDEN_PATH = resolve(
  ROOT,
  "tests/fixtures/audio-engine/impulse-golden.json",
);
const TRACE_LEDGER_PATH = resolve(
  ROOT,
  "tests/fixtures/audio-engine/trace-ledger.json",
);
const LISTENING_RUBRIC_PATH = resolve(
  ROOT,
  "tests/fixtures/audio-engine/listening-rubric.json",
);
const HARNESS_ENTRY = resolve(
  ROOT,
  "src/test-support/x0-audio-browser-harness.ts",
);
const X0_INLINE_FAVICON_RESOURCE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E";
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const SAFE_RUN_ID = /^[A-Za-z0-9._-]{8,128}$/u;
const VALID_COMPONENT_ROLES = Object.freeze([
  "bundle-input",
  "evidence-driver",
  "reviewed-authority",
] as const);
const FIXED_DRIVER_INPUTS = Object.freeze([
  "playwright.x0.config.ts",
  "scripts/run-x0-audio-evidence.ts",
  X0_PLAYWRIGHT_PRODUCER_FILE,
]);
const FIXED_AUTHORITY_INPUTS = Object.freeze([
  "tests/fixtures/audio-engine/impulse-golden.json",
  "tests/fixtures/audio-engine/render-matrix.json",
  "tests/fixtures/audio-engine/trace-ledger.json",
]);
const WORK_COUNTER_NAMES = Object.freeze([
  "operationsStarted",
  "graphNodesCreated",
  "graphEdgesConnected",
  "impulseSamplesWritten",
  "voiceBatchesValidated",
  "voiceSpecsValidated",
  "voicesExaminedForRetrigger",
  "voicesExaminedForRetirement",
  "voicesExaminedForStealing",
  "voicesCreated",
  "scheduledSourcesCreated",
  "registryReads",
  "registryWrites",
  "parameterEventsScheduled",
  "cleanupCallbacksHandled",
] as const);

const X0_PACKAGE_INPUT_PATTERNS = Object.freeze([
  "bun.lock",
  "bunfig.toml",
  "docs/ARCHITECTURE.md",
  "docs/REBUILD_PLAN.md",
  "docs/X0_AUDIO_ENGINE_CONTRACT.md",
  "eslint.config.mjs",
  "package.json",
  "playwright.x0.config.ts",
  "scripts/foundation-io.ts",
  "scripts/run-node-tool.ts",
  "scripts/run-x0-audio-evidence.ts",
  "scripts/toolchain-doctor.ts",
  "scripts/validate-x0-contract.ts",
  "scripts/verify.ts",
  "scripts/verify-x0-evidence.ts",
  "scripts/verify-x0-listening-evidence.ts",
  "src/audio/**/*.ts",
  "src/domain/**/*.ts",
  "src/test-support/fake-audio-platform.ts",
  "src/test-support/offline-audio-platform.ts",
  "src/test-support/x0-audio-browser-harness.ts",
  "tests/fixtures/audio-engine/*.json",
  "tests/integration/audio-engine.test.ts",
  "tests/static/x0-contract.test.ts",
  "tests/static/x0-evidence-verifier.test.ts",
  "tests/support/audio-engine-test-kit.ts",
  "tsconfig.base.json",
  "tsconfig.e2e.json",
  "tsconfig.tests.json",
  "tsconfig.tools.json",
]);

export type X0EvidenceFinding = Readonly<{
  code: string;
  path: string;
  message: string;
  disposition: "fail" | "incomplete";
}>;

export type X0ArtifactDigest = Readonly<{
  path: string;
  bytes: number;
  sha256: string;
}>;

export type X0CurrentInputComponent = X0ArtifactDigest;

export type X0BundleReplay = Readonly<{
  inputs: readonly string[];
  bytes: number;
  sha256: string;
}>;

export type X0AutomatedEvidenceInput = Readonly<{
  runnerMetadata: unknown;
  inputManifest: unknown;
  playwrightReport: unknown;
  renderMatrix: unknown;
  impulseGolden: unknown;
  traceLedger: unknown;
  artifacts: Readonly<{
    runnerMetadata: X0ArtifactDigest;
    inputManifest: X0ArtifactDigest;
    harnessBundle: X0ArtifactDigest;
    playwrightReport: X0ArtifactDigest;
  }>;
  currentComponents: readonly X0CurrentInputComponent[];
  bundleReplay: X0BundleReplay;
  rawBrowserFiles: readonly Readonly<{
    project: string;
    value: unknown;
    artifact: X0ArtifactDigest;
  }>[];
}>;

export type X0AutomatedEvidenceReport = Readonly<{
  outcome: "pass" | "fail" | "incomplete";
  runId: string | null;
  expectedBrowserRecords: 3;
  observedBrowserRecords: number;
  expectedRenderCells: 54;
  observedRenderCells: number;
  passingRealContextCells: number;
  unsupportedRealContextCells: number;
  browserVersions: readonly Readonly<{
    project: string;
    version: string;
    userAgent: string;
  }>[];
  producerKeys: readonly string[];
  impulseReplays: readonly Readonly<{
    sampleRate: number;
    frameCount: number;
    scalarSamples: number;
    sha256: string;
  }>[];
  rawAttachments: readonly Readonly<{
    project: string;
    name: string;
    bytes: number;
    sha256: string;
  }>[];
  artifacts: readonly X0ArtifactDigest[];
  findings: readonly X0EvidenceFinding[];
}>;

export type X0PackageInputSnapshot = Readonly<{
  algorithm: "sha256-component-manifest-v1";
  digest: string;
  components: readonly X0ArtifactDigest[];
}>;

export type X0CapturedCommand = Readonly<{
  command: readonly string[];
  environment: Readonly<Record<string, string>>;
  exitCode: number;
  elapsedMilliseconds: number;
  stdout: X0ArtifactDigest;
  stderr: X0ArtifactDigest;
}>;

export type X0OwnerSuiteEvidence = Readonly<{
  command: readonly string[];
  environment: Readonly<Record<string, string>>;
  exitCode: number;
  elapsedMilliseconds: number;
  junit: X0ArtifactDigest;
  stdout: X0ArtifactDigest;
  stderr: X0ArtifactDigest;
  tests: number;
  assertions: number;
  failures: number;
  errors: number;
  skipped: number;
  files: readonly string[];
  cases: readonly Readonly<{ file: string; name: string }>[];
}>;

export type X0TraceOwnerEvidence = Readonly<{
  traceId: string;
  evidenceOwner: string;
  caseIds: readonly string[];
  observedTestcases: number;
  producerKeys: readonly string[];
  outcome: "pass" | "fail";
}>;

export type X0PackageProofReport = Readonly<{
  outcome: "pass" | "fail";
  input: Readonly<{
    pre: X0PackageInputSnapshot;
    post: X0PackageInputSnapshot;
  }>;
  contractValidator: X0CapturedCommand;
  ownerSuite: X0OwnerSuiteEvidence;
  traceOwners: readonly X0TraceOwnerEvidence[];
  findings: readonly X0EvidenceFinding[];
}>;

export type X0EvidenceReport = Readonly<{
  schema: typeof X0_EVIDENCE_REPORT_SCHEMA;
  outcome: "pass" | "fail" | "incomplete";
  packageProof: X0PackageProofReport | null;
  automated: X0AutomatedEvidenceReport;
  humanListening: X0ListeningReport;
}>;

type CollectedPlaywrightCell = Readonly<{
  file: string;
  title: string;
  spec: JsonRecord;
  test: JsonRecord;
  result: JsonRecord | null;
}>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function records(value: unknown): readonly JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function strings(value: unknown): readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : [];
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function safeCounter(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === "number" && value >= 0;
}

function approximatelyEqual(left: unknown, right: number): boolean {
  return finiteNumber(left) && Math.abs(left - right) <= 1e-12;
}

function repoRelative(path: string): string {
  const normalized = relative(ROOT, resolve(path)).replaceAll("\\", "/");
  if (
    normalized.length === 0 ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    isAbsolute(normalized)
  ) {
    throw new Error(`X0_EVIDENCE_PATH_OUTSIDE_ROOT: ${path}`);
  }
  return normalized;
}

export function isCanonicalX0InputPath(value: unknown): value is string {
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

async function digestCurrentRepositoryInput(
  value: unknown,
): Promise<X0CurrentInputComponent> {
  if (!isCanonicalX0InputPath(value)) {
    return Object.freeze({ path: String(value), bytes: 0, sha256: "invalid" });
  }
  try {
    const [realRoot, realTarget] = await Promise.all([
      realpath(ROOT),
      realpath(resolve(ROOT, value)),
    ]);
    const realRelative = relative(realRoot, realTarget).replaceAll("\\", "/");
    if (
      realRelative.length === 0 ||
      realRelative === ".." ||
      realRelative.startsWith("../") ||
      isAbsolute(realRelative)
    ) {
      return Object.freeze({ path: value, bytes: 0, sha256: "invalid" });
    }
    const bytes = new Uint8Array(await readFile(realTarget));
    return Object.freeze({
      path: value,
      bytes: bytes.byteLength,
      sha256: canonicalSha256(bytes),
    });
  } catch {
    return Object.freeze({ path: value, bytes: 0, sha256: "invalid" });
  }
}

function canonicalSha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function sameJson(left: unknown, right: unknown): boolean {
  return stableJson(left) === stableJson(right);
}

function decodeJsonBody(value: unknown): Readonly<{
  bytes: Uint8Array;
  value: JsonRecord;
}> | null {
  if (typeof value !== "string" || value.length === 0) return null;
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)) {
    return null;
  }
  const buffer = Buffer.from(value, "base64");
  if (buffer.toString("base64") !== value) return null;
  try {
    const decoded: unknown = JSON.parse(buffer.toString("utf8"));
    return isRecord(decoded)
      ? { bytes: new Uint8Array(buffer), value: decoded }
      : null;
  } catch {
    return null;
  }
}

function collectPlaywrightCells(report: unknown): readonly CollectedPlaywrightCell[] {
  if (!isRecord(report)) return [];
  const output: CollectedPlaywrightCell[] = [];
  const visitSuites = (value: unknown, inheritedFile: string): void => {
    for (const suite of records(value)) {
      const suiteFile =
        typeof suite["file"] === "string" ? suite["file"] : inheritedFile;
      for (const spec of records(suite["specs"])) {
        const file = typeof spec["file"] === "string" ? spec["file"] : suiteFile;
        const title = typeof spec["title"] === "string" ? spec["title"] : "";
        for (const test of records(spec["tests"])) {
          const rawResults = test["results"];
          const testResults = records(rawResults);
          output.push({
            file,
            title,
            spec,
            test,
            result:
              Array.isArray(rawResults) &&
              rawResults.length === 1 &&
              testResults.length === 1
                ? testResults[0] ?? null
                : null,
          });
        }
      }
      visitSuites(suite["suites"], suiteFile);
    }
  };
  visitSuites(report["suites"], "");
  return Object.freeze(output);
}

function addFinding(
  findings: X0EvidenceFinding[],
  code: string,
  path: string,
  message: string,
  disposition: X0EvidenceFinding["disposition"] = "fail",
): void {
  findings.push(Object.freeze({ code, path, message, disposition }));
}

function requireEqual(
  actual: unknown,
  expected: unknown,
  code: string,
  path: string,
  findings: X0EvidenceFinding[],
): void {
  if (actual !== expected) {
    addFinding(
      findings,
      code,
      path,
      `Expected ${JSON.stringify(expected)} and received ${JSON.stringify(actual)}.`,
    );
  }
}

function validateWorkCounters(
  value: unknown,
  path: string,
  findings: X0EvidenceFinding[],
): JsonRecord | null {
  if (!isRecord(value)) {
    addFinding(findings, "X0_EVIDENCE_WORK", path, "Work counters must be an object.");
    return null;
  }
  const actualNames = Object.keys(value).sort(compare);
  const expectedNames = [...WORK_COUNTER_NAMES].sort(compare);
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
    addFinding(
      findings,
      "X0_EVIDENCE_WORK_SHAPE",
      path,
      "Work counters must contain exactly the reviewed counter names.",
    );
  }
  for (const name of WORK_COUNTER_NAMES) {
    if (!safeCounter(value[name])) {
      addFinding(
        findings,
        "X0_EVIDENCE_WORK_COUNTER",
        `${path}.${name}`,
        "Work counters must be nonnegative safe integers.",
      );
    }
  }
  return value;
}

type X0ImpulseReplay = Readonly<{
  sampleRate: number;
  frameCount: number;
  scalarSamples: number;
  finalStateUint32: number;
  sha256: string;
}>;

/*
 * The replay is a pure function of the sample rate and the pinned authority
 * scalars, so identical calls share the frozen result. The cache key names
 * every input that reaches the integer algorithm (the other authority fields
 * are pinned by the guard above the loop), keeping repeated 4-second replays
 * from dominating verifier wall time.
 */
const replayX0ImpulseCache = new Map<string, X0ImpulseReplay>();

export function replayX0ImpulseQ15(
  sampleRate: number,
  impulseGolden: unknown,
): X0ImpulseReplay {
  if (!Number.isInteger(sampleRate) || sampleRate < 8_000 || sampleRate > 192_000) {
    throw new Error("X0_IMPULSE_REPLAY_SAMPLE_RATE_INVALID");
  }
  if (!isRecord(impulseGolden)) {
    throw new Error("X0_IMPULSE_REPLAY_AUTHORITY_INVALID");
  }
  const seed = impulseGolden["seedUint32"];
  const channels = impulseGolden["channels"];
  const duration = impulseGolden["durationSeconds"];
  const predelayDivisor = impulseGolden["predelayDivisor"];
  const lowpassAlphaQ15 = impulseGolden["lowpassAlphaQ15"];
  if (
    !safeCounter(seed) ||
    channels !== 2 ||
    duration !== 4 ||
    predelayDivisor !== 50 ||
    lowpassAlphaQ15 !== 6_000
  ) {
    throw new Error("X0_IMPULSE_REPLAY_AUTHORITY_INVALID");
  }
  const cacheKey = `${String(sampleRate)}|${String(seed)}`;
  const cached = replayX0ImpulseCache.get(cacheKey);
  if (cached !== undefined) return cached;
  const frameCount = sampleRate * duration;
  const predelayFrames = Math.floor(sampleRate / predelayDivisor);
  /* remaining^4 exceeds 2^53, so the quartic envelope must be BigInt-exact. */
  const frameCountFourth = BigInt(frameCount) ** 4n;
  const bytes = new Uint8Array(frameCount * channels * Int16Array.BYTES_PER_ELEMENT);
  const view = new DataView(bytes.buffer);
  let state = seed >>> 0;
  let offset = 0;
  const lowpassFirst: [number, number] = [0, 0];
  const lowpassSecond: [number, number] = [0, 0];
  for (let frame = 0; frame < frameCount; frame += 1) {
    const envelopeQ15 =
      frame < predelayFrames
        ? 0
        : Number((BigInt(frameCount - frame) ** 4n * 32_767n) / frameCountFourth);
    for (let channel = 0; channel < channels; channel += 1) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      state >>>= 0;
      const noise = (state >>> 16) - 32_768;
      const lp1 =
        (lowpassFirst[channel] ?? 0) +
        Math.trunc((lowpassAlphaQ15 * (noise - (lowpassFirst[channel] ?? 0))) / 32_768);
      const lp2 =
        (lowpassSecond[channel] ?? 0) +
        Math.trunc((lowpassAlphaQ15 * (lp1 - (lowpassSecond[channel] ?? 0))) / 32_768);
      lowpassFirst[channel] = lp1;
      lowpassSecond[channel] = lp2;
      const sampleQ15 = Math.trunc((lp2 * envelopeQ15) / 32_768);
      view.setInt16(offset, sampleQ15, true);
      offset += Int16Array.BYTES_PER_ELEMENT;
    }
  }
  const replay = Object.freeze({
    sampleRate,
    frameCount,
    scalarSamples: frameCount * channels,
    finalStateUint32: state,
    sha256: canonicalSha256(bytes),
  });
  replayX0ImpulseCache.set(cacheKey, replay);
  return replay;
}

function validateArtifactDigest(
  digest: X0ArtifactDigest,
  expectedPath: string,
  path: string,
  findings: X0EvidenceFinding[],
): void {
  requireEqual(digest.path, expectedPath, "X0_EVIDENCE_ARTIFACT_PATH", `${path}.path`, findings);
  if (!Number.isSafeInteger(digest.bytes) || digest.bytes < 1) {
    addFinding(findings, "X0_EVIDENCE_ARTIFACT_BYTES", `${path}.bytes`, "Artifact byte length must be a positive safe integer.");
  }
  if (!SHA256_PATTERN.test(digest.sha256)) {
    addFinding(findings, "X0_EVIDENCE_ARTIFACT_HASH", `${path}.sha256`, "Artifact SHA-256 must be lowercase hexadecimal.");
  }
}

async function validateInputBindings(
  input: X0AutomatedEvidenceInput,
  metadata: JsonRecord,
  manifest: JsonRecord,
  runId: string,
  findings: X0EvidenceFinding[],
): Promise<void> {
  const expectedRunPrefix = `test-results/x0-audio-evidence-runs/${runId}`;
  validateArtifactDigest(input.artifacts.runnerMetadata, `${expectedRunPrefix}/runner-metadata.json`, "artifacts.runnerMetadata", findings);
  validateArtifactDigest(input.artifacts.inputManifest, `${expectedRunPrefix}/input-manifest.json`, "artifacts.inputManifest", findings);
  validateArtifactDigest(input.artifacts.harnessBundle, `${expectedRunPrefix}/harness/x0-audio-browser-harness.js`, "artifacts.harnessBundle", findings);
  validateArtifactDigest(input.artifacts.playwrightReport, `${expectedRunPrefix}/playwright-results.json`, "artifacts.playwrightReport", findings);

  requireEqual(manifest["schema"], "changes.evidence.x0-audio-input-manifest.v1", "X0_EVIDENCE_INPUT_SCHEMA", "inputManifest.schema", findings);
  requireEqual(manifest["algorithm"], "sha256-component-manifest-v1", "X0_EVIDENCE_INPUT_ALGORITHM", "inputManifest.algorithm", findings);
  const components = records(manifest["components"]);
  if (!Array.isArray(manifest["components"]) || components.length === 0) {
    addFinding(findings, "X0_EVIDENCE_INPUT_COMPONENTS", "inputManifest.components", "The input manifest must contain at least one component.");
  }
  const currentByPath = new Map(input.currentComponents.map((component) => [component.path, component]));
  const manifestPaths: string[] = [];
  const bundleInputs: string[] = [];
  for (const [index, component] of components.entries()) {
    const path = `inputManifest.components[${String(index)}]`;
    const componentPath = component["path"];
    if (!isCanonicalX0InputPath(componentPath)) {
      addFinding(findings, "X0_EVIDENCE_INPUT_PATH", `${path}.path`, "Component paths must be normalized repository-relative paths.");
      continue;
    }
    manifestPaths.push(componentPath);
    const roles = strings(component["roles"]);
    if (
      !Array.isArray(component["roles"]) ||
      roles.length === 0 ||
      new Set(roles).size !== roles.length ||
      roles.some((role) => !(VALID_COMPONENT_ROLES as readonly string[]).includes(role))
    ) {
      addFinding(findings, "X0_EVIDENCE_INPUT_ROLES", `${path}.roles`, "Component roles must be a nonempty unique reviewed-role array.");
    }
    if (roles.includes("bundle-input")) bundleInputs.push(componentPath);
    const current = currentByPath.get(componentPath);
    if (current === undefined) {
      addFinding(findings, "X0_EVIDENCE_INPUT_MISSING", componentPath, "The current repository input is missing from the verifier snapshot.");
    } else {
      requireEqual(component["bytes"], current.bytes, "X0_EVIDENCE_INPUT_BYTES", `${path}.bytes`, findings);
      requireEqual(component["sha256"], current.sha256, "X0_EVIDENCE_INPUT_HASH", `${path}.sha256`, findings);
    }
  }
  if (new Set(manifestPaths).size !== manifestPaths.length) {
    addFinding(findings, "X0_EVIDENCE_INPUT_DUPLICATE", "inputManifest.components", "Component paths must be unique.");
  }
  if (JSON.stringify(manifestPaths) !== JSON.stringify([...manifestPaths].sort(compare))) {
    addFinding(findings, "X0_EVIDENCE_INPUT_ORDER", "inputManifest.components", "Component paths must use deterministic lexical order.");
  }
  for (const fixedPath of FIXED_DRIVER_INPUTS) {
    const component = components.find((item) => item["path"] === fixedPath);
    if (component === undefined || !strings(component["roles"]).includes("evidence-driver")) {
      addFinding(findings, "X0_EVIDENCE_DRIVER_UNBOUND", fixedPath, "The evidence driver must be hash-bound with the evidence-driver role.");
    }
  }
  for (const fixedPath of FIXED_AUTHORITY_INPUTS) {
    const component = components.find((item) => item["path"] === fixedPath);
    if (component === undefined || !strings(component["roles"]).includes("reviewed-authority")) {
      addFinding(findings, "X0_EVIDENCE_AUTHORITY_UNBOUND", fixedPath, "The reviewed authority must be hash-bound with the reviewed-authority role.");
    }
  }
  const manifestDigest = await sha256Hex(stableJson(components));
  requireEqual(manifest["digest"], manifestDigest, "X0_EVIDENCE_INPUT_DIGEST", "inputManifest.digest", findings);

  const metadataInput = isRecord(metadata["inputManifest"]) ? metadata["inputManifest"] : {};
  requireEqual(metadataInput["path"], input.artifacts.inputManifest.path, "X0_EVIDENCE_METADATA_INPUT_PATH", "runnerMetadata.inputManifest.path", findings);
  requireEqual(metadataInput["algorithm"], manifest["algorithm"], "X0_EVIDENCE_METADATA_INPUT_ALGORITHM", "runnerMetadata.inputManifest.algorithm", findings);
  requireEqual(metadataInput["digest"], manifestDigest, "X0_EVIDENCE_METADATA_INPUT_DIGEST", "runnerMetadata.inputManifest.digest", findings);
  requireEqual(metadataInput["componentCount"], components.length, "X0_EVIDENCE_METADATA_INPUT_COUNT", "runnerMetadata.inputManifest.componentCount", findings);

  const replayInputs = [...input.bundleReplay.inputs].sort(compare);
  const recordedBundleInputs = [...bundleInputs].sort(compare);
  if (JSON.stringify(replayInputs) !== JSON.stringify(recordedBundleInputs)) {
    addFinding(findings, "X0_EVIDENCE_BUNDLE_CLOSURE", "inputManifest.components", "Independent bundling must discover exactly the recorded bundle-input closure.");
  }
  requireEqual(input.bundleReplay.bytes, input.artifacts.harnessBundle.bytes, "X0_EVIDENCE_BUNDLE_REPLAY_BYTES", "bundleReplay.bytes", findings);
  requireEqual(input.bundleReplay.sha256, input.artifacts.harnessBundle.sha256, "X0_EVIDENCE_BUNDLE_REPLAY_HASH", "bundleReplay.sha256", findings);

  const metadataBundle = isRecord(metadata["bundle"]) ? metadata["bundle"] : {};
  requireEqual(metadataBundle["path"], input.artifacts.harnessBundle.path, "X0_EVIDENCE_METADATA_BUNDLE_PATH", "runnerMetadata.bundle.path", findings);
  requireEqual(metadataBundle["bytes"], input.artifacts.harnessBundle.bytes, "X0_EVIDENCE_METADATA_BUNDLE_BYTES", "runnerMetadata.bundle.bytes", findings);
  requireEqual(metadataBundle["sha256"], input.artifacts.harnessBundle.sha256, "X0_EVIDENCE_METADATA_BUNDLE_HASH", "runnerMetadata.bundle.sha256", findings);
  requireEqual(metadataBundle["format"], "iife", "X0_EVIDENCE_METADATA_BUNDLE_FORMAT", "runnerMetadata.bundle.format", findings);
  requireEqual(metadataBundle["target"], "browser", "X0_EVIDENCE_METADATA_BUNDLE_TARGET", "runnerMetadata.bundle.target", findings);
  requireEqual(metadataBundle["sourceMap"], "none", "X0_EVIDENCE_METADATA_BUNDLE_SOURCEMAP", "runnerMetadata.bundle.sourceMap", findings);
  requireEqual(metadataBundle["splitting"], false, "X0_EVIDENCE_METADATA_BUNDLE_SPLITTING", "runnerMetadata.bundle.splitting", findings);
}

function validateRunnerMetadata(
  metadata: JsonRecord,
  artifacts: X0AutomatedEvidenceInput["artifacts"],
  findings: X0EvidenceFinding[],
): string {
  requireEqual(metadata["schema"], "changes.evidence.x0-audio-runner.v1", "X0_EVIDENCE_RUNNER_SCHEMA", "runnerMetadata.schema", findings);
  requireEqual(metadata["bunVersion"], "1.3.14", "X0_EVIDENCE_BUN_VERSION", "runnerMetadata.bunVersion", findings);
  const runId = typeof metadata["runId"] === "string" ? metadata["runId"] : "invalid";
  if (!SAFE_RUN_ID.test(runId)) {
    addFinding(findings, "X0_EVIDENCE_RUN_ID", "runnerMetadata.runId", "Run ID must use the runner's safe filename grammar.");
  }
  const node = isRecord(metadata["node"]) ? metadata["node"] : {};
  if (typeof node["path"] !== "string" || node["path"].length === 0) {
    addFinding(findings, "X0_EVIDENCE_NODE_PATH", "runnerMetadata.node.path", "The real Node executable path must be recorded.");
  }
  if (
    typeof node["version"] !== "string" ||
    !Number.isInteger(node["major"]) ||
    ![22, 24, 26].includes(node["major"] as number) ||
    !node["version"].startsWith(`${String(node["major"])}.`)
  ) {
    addFinding(findings, "X0_EVIDENCE_NODE_VERSION", "runnerMetadata.node", "Playwright must run under recorded real Node 22, 24, or 26.");
  }
  if (typeof metadata["playwrightVersion"] !== "string" || metadata["playwrightVersion"] !== "1.61.1") {
    addFinding(findings, "X0_EVIDENCE_PLAYWRIGHT_VERSION", "runnerMetadata.playwrightVersion", "The exact reviewed Playwright version must be recorded.");
  }
  const playwright = isRecord(metadata["playwright"]) ? metadata["playwright"] : {};
  requireEqual(playwright["configPath"], "playwright.x0.config.ts", "X0_EVIDENCE_PLAYWRIGHT_CONFIG", "runnerMetadata.playwright.configPath", findings);
  requireEqual(playwright["resultsPath"], artifacts.playwrightReport.path, "X0_EVIDENCE_PLAYWRIGHT_RESULTS_PATH", "runnerMetadata.playwright.resultsPath", findings);
  requireEqual(playwright["retries"], 0, "X0_EVIDENCE_PLAYWRIGHT_RETRIES", "runnerMetadata.playwright.retries", findings);
  requireEqual(playwright["workers"], 1, "X0_EVIDENCE_PLAYWRIGHT_WORKERS", "runnerMetadata.playwright.workers", findings);
  if (JSON.stringify(playwright["projects"]) !== JSON.stringify(X0_EXPECTED_BROWSER_PROJECTS)) {
    addFinding(findings, "X0_EVIDENCE_PLAYWRIGHT_PROJECTS", "runnerMetadata.playwright.projects", "Runner projects must be exactly Chromium, Firefox, and WebKit in reviewed order.");
  }
  const listening = isRecord(metadata["manualListening"]) ? metadata["manualListening"] : {};
  requireEqual(listening["performed"], false, "X0_EVIDENCE_AUTOMATED_LISTENING", "runnerMetadata.manualListening.performed", findings);
  requireEqual(listening["outcome"], "not-assessed", "X0_EVIDENCE_AUTOMATED_LISTENING", "runnerMetadata.manualListening.outcome", findings);
  if (typeof listening["reason"] !== "string" || listening["reason"].trim().length === 0) {
    addFinding(findings, "X0_EVIDENCE_LISTENING_REASON", "runnerMetadata.manualListening.reason", "Automated evidence must record why it cannot satisfy listening.");
  }
  return runId;
}

function validatePlaywrightConfiguration(
  report: JsonRecord,
  findings: X0EvidenceFinding[],
): void {
  const config = isRecord(report["config"]) ? report["config"] : {};
  requireEqual(config["forbidOnly"], true, "X0_EVIDENCE_FORBID_ONLY", "playwright.config.forbidOnly", findings);
  requireEqual(config["fullyParallel"], false, "X0_EVIDENCE_PARALLEL", "playwright.config.fullyParallel", findings);
  requireEqual(config["failOnFlakyTests"], true, "X0_EVIDENCE_FLAKY_POLICY", "playwright.config.failOnFlakyTests", findings);
  requireEqual(config["workers"], 1, "X0_EVIDENCE_WORKERS", "playwright.config.workers", findings);
  requireEqual(config["version"], "1.61.1", "X0_EVIDENCE_REPORT_VERSION", "playwright.config.version", findings);
  const projects = records(config["projects"]);
  const projectNames = projects.map((project) => project["name"]);
  if (JSON.stringify(projectNames) !== JSON.stringify(X0_EXPECTED_BROWSER_PROJECTS)) {
    addFinding(findings, "X0_EVIDENCE_REPORT_PROJECTS", "playwright.config.projects", "The report must describe exactly the three reviewed projects.");
  }
  for (const [index, project] of projects.entries()) {
    requireEqual(project["retries"], 0, "X0_EVIDENCE_REPORT_RETRIES", `playwright.config.projects[${String(index)}].retries`, findings);
    requireEqual(project["repeatEach"], 1, "X0_EVIDENCE_REPORT_REPEAT", `playwright.config.projects[${String(index)}].repeatEach`, findings);
  }
  if (!Array.isArray(report["errors"]) || report["errors"].length > 0) {
    addFinding(findings, "X0_EVIDENCE_REPORT_ERRORS", "playwright.errors", "The Playwright report contains top-level errors.");
  }
}

function validateRenderRecord(
  raw: unknown,
  fixture: JsonRecord,
  numericPolicy: JsonRecord,
  impulseReplay: Readonly<{ sha256: string; frameCount: number; scalarSamples: number }>,
  path: string,
  findings: X0EvidenceFinding[],
): void {
  if (!isRecord(raw)) {
    addFinding(findings, "X0_EVIDENCE_RENDER_RECORD", path, "Render evidence must be an object.");
    return;
  }
  const sampleRate = fixture["sampleRate"] as number;
  const renderDuration = fixture["renderDuration"] as number;
  const start = fixture["start"] as number;
  const release = fixture["release"] as number;
  const pitches = Array.isArray(fixture["midiPitches"]) ? fixture["midiPitches"] : [];
  const expectedFrames = Math.ceil(sampleRate * renderDuration);
  requireEqual(raw["schema"], "changes.evidence.x0-offline-render.v1", "X0_EVIDENCE_RENDER_SCHEMA", `${path}.schema`, findings);
  requireEqual(raw["caseId"], fixture["id"], "X0_EVIDENCE_RENDER_CASE", `${path}.caseId`, findings);
  requireEqual(raw["instrumentId"], fixture["instrumentId"], "X0_EVIDENCE_RENDER_INSTRUMENT", `${path}.instrumentId`, findings);
  requireEqual(raw["scenario"], fixture["scenario"], "X0_EVIDENCE_RENDER_SCENARIO", `${path}.scenario`, findings);
  requireEqual(raw["sampleRate"], sampleRate, "X0_EVIDENCE_RENDER_RATE", `${path}.sampleRate`, findings);
  requireEqual(raw["masterVolume"], numericPolicy["masterVolume"], "X0_EVIDENCE_RENDER_MASTER", `${path}.masterVolume`, findings);
  requireEqual(raw["renderFrameCount"], expectedFrames, "X0_EVIDENCE_RENDER_FRAMES", `${path}.renderFrameCount`, findings);
  requireEqual(raw["channelCount"], numericPolicy["channelCount"], "X0_EVIDENCE_RENDER_CHANNELS", `${path}.channelCount`, findings);
  if (!approximatelyEqual(raw["renderDurationSeconds"], expectedFrames / sampleRate)) {
    addFinding(findings, "X0_EVIDENCE_RENDER_DURATION", `${path}.renderDurationSeconds`, "Rendered duration must equal reviewed ceil-frame duration.");
  }
  requireEqual(raw["initializationState"], "ready", "X0_EVIDENCE_RENDER_INITIALIZATION", `${path}.initializationState`, findings);

  const graph = isRecord(raw["graph"]) ? raw["graph"] : {};
  if (!Number.isSafeInteger(graph["instanceId"]) || (graph["instanceId"] as number) < 1) {
    addFinding(findings, "X0_EVIDENCE_RENDER_GRAPH_ID", `${path}.graph.instanceId`, "Graph instance ID must be a positive safe integer.");
  }
  requireEqual(graph["persistentCreatedNodeCount"], 12, "X0_EVIDENCE_RENDER_GRAPH_NODES", `${path}.graph.persistentCreatedNodeCount`, findings);
  requireEqual(graph["persistentEdgeCount"], 13, "X0_EVIDENCE_RENDER_GRAPH_EDGES", `${path}.graph.persistentEdgeCount`, findings);
  requireEqual(graph["contextCreationCount"], 1, "X0_EVIDENCE_RENDER_CONTEXT_COUNT", `${path}.graph.contextCreationCount`, findings);

  const schedule = isRecord(raw["schedule"]) ? raw["schedule"] : {};
  requireEqual(schedule["voiceCount"], pitches.length, "X0_EVIDENCE_RENDER_VOICE_COUNT", `${path}.schedule.voiceCount`, findings);
  requireEqual(schedule["scheduledSourceCount"], fixture["expectedSourceCount"], "X0_EVIDENCE_RENDER_SOURCE_COUNT", `${path}.schedule.scheduledSourceCount`, findings);

  const registry = isRecord(raw["registryAfterRender"]) ? raw["registryAfterRender"] : {};
  for (const name of ["retainedVoiceCount", "nonreleasingVoiceCount", "releasingVoiceCount", "totalIndexReferences"] as const) {
    requireEqual(registry[name], 0, "X0_EVIDENCE_RENDER_REGISTRY_NOT_EMPTY", `${path}.registryAfterRender.${name}`, findings);
  }

  const impulse = isRecord(raw["impulse"]) ? raw["impulse"] : {};
  /*
   * Synth pads create exactly the shared impulse buffer; the Concert
   * Grand additionally renders one attack-sample buffer per sounding
   * note. Same per-instrument law the evidence spec asserts.
   */
  const expectedCreatedBuffers =
    fixture["instrumentId"] === "concert-grand" ? 1 + pitches.length : 1;
  requireEqual(impulse["createdBufferCount"], expectedCreatedBuffers, "X0_EVIDENCE_RENDER_IMPULSE_COUNT", `${path}.impulse.createdBufferCount`, findings);
  requireEqual(impulse["convolverAssignmentCount"], 1, "X0_EVIDENCE_RENDER_IMPULSE_ASSIGNMENT", `${path}.impulse.convolverAssignmentCount`, findings);
  requireEqual(impulse["assignedGeneratedBufferByIdentity"], true, "X0_EVIDENCE_RENDER_IMPULSE_IDENTITY", `${path}.impulse.assignedGeneratedBufferByIdentity`, findings);
  requireEqual(impulse["numberOfChannels"], 2, "X0_EVIDENCE_RENDER_IMPULSE_CHANNELS", `${path}.impulse.numberOfChannels`, findings);
  requireEqual(impulse["length"], impulseReplay.frameCount, "X0_EVIDENCE_RENDER_IMPULSE_FRAMES", `${path}.impulse.length`, findings);
  requireEqual(impulse["sampleRate"], sampleRate, "X0_EVIDENCE_RENDER_IMPULSE_RATE", `${path}.impulse.sampleRate`, findings);

  const hashes = isRecord(raw["hashes"]) ? raw["hashes"] : {};
  requireEqual(hashes["algorithm"], "SHA-256", "X0_EVIDENCE_RENDER_HASH_ALGORITHM", `${path}.hashes.algorithm`, findings);
  requireEqual(hashes["pcmEncoding"], "channel-interleaved-float32-little-endian", "X0_EVIDENCE_RENDER_PCM_ENCODING", `${path}.hashes.pcmEncoding`, findings);
  requireEqual(hashes["impulseEncoding"], "q15-interleaved-int16-little-endian", "X0_EVIDENCE_RENDER_IMPULSE_ENCODING", `${path}.hashes.impulseEncoding`, findings);
  requireEqual(hashes["webCryptoAvailable"], true, "X0_EVIDENCE_RENDER_WEBCRYPTO", `${path}.hashes.webCryptoAvailable`, findings);
  if (typeof hashes["pcmSha256"] !== "string" || !SHA256_PATTERN.test(hashes["pcmSha256"])) {
    addFinding(findings, "X0_EVIDENCE_RENDER_PCM_HASH", `${path}.hashes.pcmSha256`, "PCM diagnostics require a lowercase SHA-256 hash.");
  }
  requireEqual(hashes["impulseQ15Sha256"], impulseReplay.sha256, "X0_EVIDENCE_RENDER_IMPULSE_HASH", `${path}.hashes.impulseQ15Sha256`, findings);

  const metrics = isRecord(raw["metrics"]) ? raw["metrics"] : {};
  const peak = metrics["absolutePeak"];
  const activeRms = metrics["activeRms"];
  const earlyTailRms = metrics["earlyTailRms"];
  const finalTailRms = metrics["finalTailRms"];
  for (const [name, value] of [["absolutePeak", peak], ["activeRms", activeRms], ["earlyTailRms", earlyTailRms], ["finalTailRms", finalTailRms]] as const) {
    if (!finiteNumber(value) || value < 0) {
      addFinding(findings, "X0_EVIDENCE_RENDER_METRIC", `${path}.metrics.${name}`, "Signal metrics must be finite and nonnegative.");
    }
  }
  if (!finiteNumber(peak) || peak < (numericPolicy["nonSilentAbsolutePeakMinimum"] as number) || peak >= (numericPolicy["absolutePeakMaximumExclusive"] as number)) {
    addFinding(findings, "X0_EVIDENCE_RENDER_PEAK", `${path}.metrics.absolutePeak`, "Absolute peak must satisfy reviewed non-silence and exclusive safety bounds.");
  }
  if (!finiteNumber(activeRms) || activeRms < (numericPolicy["activeRmsMinimum"] as number) || activeRms >= (numericPolicy["activeRmsMaximumExclusive"] as number)) {
    addFinding(findings, "X0_EVIDENCE_RENDER_ACTIVE_RMS", `${path}.metrics.activeRms`, "Active RMS must satisfy reviewed inclusive minimum and exclusive maximum.");
  }
  requireEqual(metrics["onsetThreshold"], numericPolicy["onsetThreshold"], "X0_EVIDENCE_RENDER_ONSET_THRESHOLD", `${path}.metrics.onsetThreshold`, findings);
  const onset = metrics["onsetSeconds"];
  if (!finiteNumber(onset) || Math.abs(onset - start) > (numericPolicy["onsetToleranceSeconds"] as number)) {
    addFinding(findings, "X0_EVIDENCE_RENDER_ONSET", `${path}.metrics.onsetSeconds`, "Onset must occur within the reviewed start tolerance.");
  }
  requireEqual(metrics["nanSampleCount"], 0, "X0_EVIDENCE_RENDER_NAN", `${path}.metrics.nanSampleCount`, findings);
  requireEqual(metrics["infiniteSampleCount"], 0, "X0_EVIDENCE_RENDER_INFINITY", `${path}.metrics.infiniteSampleCount`, findings);
  requireEqual(metrics["unityClipSampleCount"], 0, "X0_EVIDENCE_RENDER_CLIPPING", `${path}.metrics.unityClipSampleCount`, findings);
  if (!safeCounter(metrics["nonZeroSampleCount"]) || metrics["nonZeroSampleCount"] === 0) {
    addFinding(findings, "X0_EVIDENCE_RENDER_SILENT", `${path}.metrics.nonZeroSampleCount`, "Every reviewed render must contain nonzero samples.");
  }
  requireEqual(metrics["scalarSampleCount"], expectedFrames * (numericPolicy["channelCount"] as number), "X0_EVIDENCE_RENDER_SCALAR_COUNT", `${path}.metrics.scalarSampleCount`, findings);
  const activeWindow = isRecord(metrics["activeWindow"]) ? metrics["activeWindow"] : {};
  const earlyWindow = isRecord(metrics["earlyTailWindow"]) ? metrics["earlyTailWindow"] : {};
  const finalWindow = isRecord(metrics["finalTailWindow"]) ? metrics["finalTailWindow"] : {};
  const renderedEnd = expectedFrames / sampleRate;
  const tailWindow = numericPolicy["tailRmsWindowSeconds"] as number;
  for (const [actual, expected, windowPath] of [
    [activeWindow["startSeconds"], start, `${path}.metrics.activeWindow.startSeconds`],
    [activeWindow["endSeconds"], Math.min(release, renderedEnd), `${path}.metrics.activeWindow.endSeconds`],
    [earlyWindow["startSeconds"], Math.min(release, renderedEnd), `${path}.metrics.earlyTailWindow.startSeconds`],
    [earlyWindow["endSeconds"], Math.min(release + tailWindow, renderedEnd), `${path}.metrics.earlyTailWindow.endSeconds`],
    [finalWindow["startSeconds"], Math.max(Math.min(release, renderedEnd), renderedEnd - tailWindow), `${path}.metrics.finalTailWindow.startSeconds`],
    [finalWindow["endSeconds"], renderedEnd, `${path}.metrics.finalTailWindow.endSeconds`],
  ] as const) {
    if (!approximatelyEqual(actual, expected)) {
      addFinding(findings, "X0_EVIDENCE_RENDER_WINDOW", windowPath, "Measurement window must equal the reviewed frame-derived interval.");
    }
  }
  const assertions = strings(fixture["assertions"]);
  if (assertions.includes("tail-present") && (!finiteNumber(earlyTailRms) || earlyTailRms < (numericPolicy["tailPresentRmsMinimum"] as number))) {
    addFinding(findings, "X0_EVIDENCE_RENDER_TAIL_PRESENT", `${path}.metrics.earlyTailRms`, "Early tail RMS must satisfy the reviewed tail-presence minimum.");
  }
  if (assertions.includes("tail-decays") && (!finiteNumber(earlyTailRms) || !finiteNumber(finalTailRms) || earlyTailRms < (numericPolicy["tailDecayMinimumRatio"] as number) * finalTailRms)) {
    addFinding(findings, "X0_EVIDENCE_RENDER_TAIL_DECAY", `${path}.metrics`, "Tail decay must satisfy the reviewed multiplication comparison.");
  }
  if (assertions.includes("final-rms-bounded") && (!finiteNumber(finalTailRms) || finalTailRms > (numericPolicy["tailFinalRmsMaximum"] as number))) {
    addFinding(findings, "X0_EVIDENCE_RENDER_FINAL_RMS", `${path}.metrics.finalTailRms`, "Final tail RMS exceeds the reviewed bound.");
  }

  const work = validateWorkCounters(raw["work"], `${path}.work`, findings);
  if (work !== null) {
    requireEqual(work["graphNodesCreated"], 12, "X0_EVIDENCE_RENDER_WORK_NODES", `${path}.work.graphNodesCreated`, findings);
    requireEqual(work["graphEdgesConnected"], 13, "X0_EVIDENCE_RENDER_WORK_EDGES", `${path}.work.graphEdgesConnected`, findings);
    requireEqual(work["impulseSamplesWritten"], impulseReplay.scalarSamples, "X0_EVIDENCE_RENDER_WORK_IMPULSE", `${path}.work.impulseSamplesWritten`, findings);
    requireEqual(work["voiceBatchesValidated"], 1, "X0_EVIDENCE_RENDER_WORK_BATCH", `${path}.work.voiceBatchesValidated`, findings);
    requireEqual(work["voiceSpecsValidated"], pitches.length, "X0_EVIDENCE_RENDER_WORK_VOICES", `${path}.work.voiceSpecsValidated`, findings);
    requireEqual(work["voicesCreated"], pitches.length, "X0_EVIDENCE_RENDER_WORK_CREATED", `${path}.work.voicesCreated`, findings);
    requireEqual(work["scheduledSourcesCreated"], fixture["expectedSourceCount"], "X0_EVIDENCE_RENDER_WORK_SOURCES", `${path}.work.scheduledSourcesCreated`, findings);
    requireEqual(work["cleanupCallbacksHandled"], fixture["expectedSourceCount"], "X0_EVIDENCE_RENDER_WORK_CLEANUP", `${path}.work.cleanupCallbacksHandled`, findings);
  }
  requireEqual(raw["listeningAssessment"], "not-performed-by-automation", "X0_EVIDENCE_RENDER_LISTENING_CLAIM", `${path}.listeningAssessment`, findings);
}

function validateRealContextRecord(
  raw: unknown,
  path: string,
  findings: X0EvidenceFinding[],
): "pass" | "fail" | "incomplete" {
  if (!isRecord(raw)) {
    addFinding(findings, "X0_EVIDENCE_REAL_RECORD", path, "Real AudioContext evidence must be an object.");
    return "fail";
  }
  requireEqual(raw["schema"], "changes.evidence.x0-real-audio-context.v1", "X0_EVIDENCE_REAL_SCHEMA", `${path}.schema`, findings);
  if (raw["outcome"] === "unsupported") {
    requireEqual(raw["reasonCode"], "X0_REAL_AUDIO_CONTEXT_UNAVAILABLE", "X0_EVIDENCE_REAL_UNSUPPORTED_REASON", `${path}.reasonCode`, findings);
    if (typeof raw["userAgent"] !== "string" || raw["userAgent"].trim().length === 0) {
      addFinding(findings, "X0_EVIDENCE_REAL_USER_AGENT", `${path}.userAgent`, "Unsupported capability evidence must retain exact browser identity.");
    }
    requireEqual(raw["gestureEventType"], "click", "X0_EVIDENCE_REAL_UNSUPPORTED_GESTURE", `${path}.gestureEventType`, findings);
    requireEqual(raw["gestureKind"], "trusted-pointer", "X0_EVIDENCE_REAL_UNSUPPORTED_GESTURE", `${path}.gestureKind`, findings);
    requireEqual(raw["gestureTrusted"], true, "X0_EVIDENCE_REAL_UNSUPPORTED_GESTURE", `${path}.gestureTrusted`, findings);
    requireEqual(raw["nativeAudioContextAvailable"], false, "X0_EVIDENCE_REAL_UNSUPPORTED_CAPABILITY", `${path}.nativeAudioContextAvailable`, findings);
    for (const [name, expected] of [
      ["platformCreateContextCount", 0],
      ["initialGraphInstanceId", null],
      ["reusedGraphInstanceId", null],
      ["reusedExistingGraph", false],
      ["contextStateAfterInitialization", null],
      ["contextSampleRate", null],
      ["contextTimeBeforeCycles", null],
      ["contextTimeAfterCleanup", null],
      ["persistentCreatedNodeCount", 0],
      ["persistentEdgeCount", 0],
      ["mixAutomationPath", null],
      ["mixAutomationEventDelta", 0],
      ["cyclesRequested", 100],
      ["attackSuccessCount", 0],
      ["retirementSuccessCount", 0],
      ["retirementNoFutureAttackPostconditionCount", 0],
      ["cleanupPollCount", 0],
      ["cleanupComplete", false],
      ["retainedVoiceCountAfterCleanup", 0],
      ["registryIndexReferencesAfterCleanup", 0],
      ["scheduledSourceCount", 0],
      ["cleanupCallbackCount", 0],
      ["disposedContextClosed", false],
      ["engineStateAfterDispose", null],
      ["work", null],
      ["listeningAssessment", "not-performed-by-automation"],
    ] as const) {
      requireEqual(raw[name], expected, "X0_EVIDENCE_REAL_UNSUPPORTED_SHAPE", `${path}.${name}`, findings);
    }
    addFinding(
      findings,
      "X0_EVIDENCE_REAL_UNSUPPORTED",
      path,
      "The browser/version lacks native AudioContext; the automated capability cell is non-passing and matching manual evidence remains required.",
      "incomplete",
    );
    return "incomplete";
  }
  requireEqual(raw["outcome"], "completed", "X0_EVIDENCE_REAL_OUTCOME", `${path}.outcome`, findings);
  requireEqual(raw["reasonCode"], null, "X0_EVIDENCE_REAL_REASON", `${path}.reasonCode`, findings);
  if (typeof raw["userAgent"] !== "string" || raw["userAgent"].trim().length === 0) {
    addFinding(findings, "X0_EVIDENCE_REAL_USER_AGENT", `${path}.userAgent`, "The native probe must record a user agent.");
  }
  requireEqual(raw["gestureTrusted"], true, "X0_EVIDENCE_REAL_GESTURE", `${path}.gestureTrusted`, findings);
  if (raw["gestureKind"] !== "trusted-pointer" && raw["gestureKind"] !== "trusted-keyboard") {
    addFinding(findings, "X0_EVIDENCE_REAL_GESTURE_KIND", `${path}.gestureKind`, "The real context must begin in a trusted pointer or keyboard event.");
  }
  requireEqual(raw["nativeAudioContextAvailable"], true, "X0_EVIDENCE_REAL_CAPABILITY", `${path}.nativeAudioContextAvailable`, findings);
  requireEqual(raw["platformCreateContextCount"], 1, "X0_EVIDENCE_REAL_CONTEXT_COUNT", `${path}.platformCreateContextCount`, findings);
  if (!Number.isSafeInteger(raw["initialGraphInstanceId"]) || (raw["initialGraphInstanceId"] as number) < 1) {
    addFinding(findings, "X0_EVIDENCE_REAL_GRAPH_ID", `${path}.initialGraphInstanceId`, "Initial graph ID must be a positive safe integer.");
  }
  requireEqual(raw["reusedGraphInstanceId"], raw["initialGraphInstanceId"], "X0_EVIDENCE_REAL_GRAPH_REUSE", `${path}.reusedGraphInstanceId`, findings);
  requireEqual(raw["reusedExistingGraph"], true, "X0_EVIDENCE_REAL_GRAPH_REUSE", `${path}.reusedExistingGraph`, findings);
  requireEqual(raw["contextStateAfterInitialization"], "running", "X0_EVIDENCE_REAL_CONTEXT_STATE", `${path}.contextStateAfterInitialization`, findings);
  if (!Number.isInteger(raw["contextSampleRate"]) || (raw["contextSampleRate"] as number) < 8_000 || (raw["contextSampleRate"] as number) > 192_000) {
    addFinding(findings, "X0_EVIDENCE_REAL_SAMPLE_RATE", `${path}.contextSampleRate`, "Real context sample rate must be a supported integer.");
  }
  const timeBefore = raw["contextTimeBeforeCycles"];
  const timeAfter = raw["contextTimeAfterCleanup"];
  if (!finiteNumber(timeBefore) || timeBefore < 0 || !finiteNumber(timeAfter) || timeAfter < timeBefore) {
    addFinding(findings, "X0_EVIDENCE_REAL_CONTEXT_TIME", `${path}.contextTimeAfterCleanup`, "Context time must be finite, nonnegative, and monotonic.");
  }
  requireEqual(raw["persistentCreatedNodeCount"], 12, "X0_EVIDENCE_REAL_GRAPH_NODES", `${path}.persistentCreatedNodeCount`, findings);
  requireEqual(raw["persistentEdgeCount"], 13, "X0_EVIDENCE_REAL_GRAPH_EDGES", `${path}.persistentEdgeCount`, findings);
  const nativeHold = raw["nativeCancelAndHoldAtTimeAvailable"];
  if (nativeHold === true) {
    requireEqual(raw["mixAutomationPath"], "native-cancel-and-hold", "X0_EVIDENCE_REAL_AUTOMATION", `${path}.mixAutomationPath`, findings);
    requireEqual(raw["mixAutomationEventDelta"], 4, "X0_EVIDENCE_REAL_AUTOMATION", `${path}.mixAutomationEventDelta`, findings);
  } else if (nativeHold === false) {
    requireEqual(raw["mixAutomationPath"], "analytic-cancel-set", "X0_EVIDENCE_REAL_AUTOMATION", `${path}.mixAutomationPath`, findings);
    requireEqual(raw["mixAutomationEventDelta"], 6, "X0_EVIDENCE_REAL_AUTOMATION", `${path}.mixAutomationEventDelta`, findings);
  } else {
    addFinding(findings, "X0_EVIDENCE_REAL_AUTOMATION_CAPABILITY", `${path}.nativeCancelAndHoldAtTimeAvailable`, "Automation capability must be recorded as a boolean.");
  }
  for (const [name, expected] of [["cyclesRequested", 100], ["attackSuccessCount", 100], ["retirementSuccessCount", 100], ["retirementNoFutureAttackPostconditionCount", 100], ["scheduledSourceCount", 200], ["cleanupCallbackCount", 200]] as const) {
    requireEqual(raw[name], expected, "X0_EVIDENCE_REAL_CYCLE_COUNT", `${path}.${name}`, findings);
  }
  if (!safeCounter(raw["cleanupPollCount"]) || raw["cleanupPollCount"] > 200) {
    addFinding(findings, "X0_EVIDENCE_REAL_CLEANUP_POLL", `${path}.cleanupPollCount`, "Cleanup polling must terminate within the declared deterministic poll bound.");
  }
  requireEqual(raw["cleanupComplete"], true, "X0_EVIDENCE_REAL_CLEANUP", `${path}.cleanupComplete`, findings);
  requireEqual(raw["retainedVoiceCountAfterCleanup"], 0, "X0_EVIDENCE_REAL_REGISTRY", `${path}.retainedVoiceCountAfterCleanup`, findings);
  requireEqual(raw["registryIndexReferencesAfterCleanup"], 0, "X0_EVIDENCE_REAL_REGISTRY", `${path}.registryIndexReferencesAfterCleanup`, findings);
  requireEqual(raw["disposedContextClosed"], true, "X0_EVIDENCE_REAL_DISPOSE", `${path}.disposedContextClosed`, findings);
  requireEqual(raw["engineStateAfterDispose"], "closed", "X0_EVIDENCE_REAL_DISPOSE", `${path}.engineStateAfterDispose`, findings);
  const work = validateWorkCounters(raw["work"], `${path}.work`, findings);
  if (work !== null) {
    requireEqual(work["graphNodesCreated"], 12, "X0_EVIDENCE_REAL_WORK_NODES", `${path}.work.graphNodesCreated`, findings);
    requireEqual(work["graphEdgesConnected"], 13, "X0_EVIDENCE_REAL_WORK_EDGES", `${path}.work.graphEdgesConnected`, findings);
    requireEqual(work["voiceBatchesValidated"], 100, "X0_EVIDENCE_REAL_WORK_BATCHES", `${path}.work.voiceBatchesValidated`, findings);
    requireEqual(work["voiceSpecsValidated"], 100, "X0_EVIDENCE_REAL_WORK_VOICES", `${path}.work.voiceSpecsValidated`, findings);
    requireEqual(work["voicesCreated"], 100, "X0_EVIDENCE_REAL_WORK_CREATED", `${path}.work.voicesCreated`, findings);
    requireEqual(work["scheduledSourcesCreated"], 200, "X0_EVIDENCE_REAL_WORK_SOURCES", `${path}.work.scheduledSourcesCreated`, findings);
    requireEqual(work["cleanupCallbacksHandled"], 200, "X0_EVIDENCE_REAL_WORK_CLEANUP", `${path}.work.cleanupCallbacksHandled`, findings);
  }
  requireEqual(raw["listeningAssessment"], "not-performed-by-automation", "X0_EVIDENCE_REAL_LISTENING_CLAIM", `${path}.listeningAssessment`, findings);
  return "pass";
}

function validateUntrustedContextRecord(
  raw: unknown,
  path: string,
  findings: X0EvidenceFinding[],
): void {
  if (!isRecord(raw)) {
    addFinding(findings, "X0_EVIDENCE_UNTRUSTED_RECORD", path, "Synthetic untrusted-gesture evidence must be an object.");
    return;
  }
  requireEqual(raw["schema"], "changes.evidence.x0-real-audio-context.v1", "X0_EVIDENCE_UNTRUSTED_SCHEMA", `${path}.schema`, findings);
  requireEqual(raw["outcome"], "refused", "X0_EVIDENCE_UNTRUSTED_OUTCOME", `${path}.outcome`, findings);
  requireEqual(raw["reasonCode"], "X0_REAL_GESTURE_UNTRUSTED", "X0_EVIDENCE_UNTRUSTED_REASON", `${path}.reasonCode`, findings);
  requireEqual(raw["gestureEventType"], "click", "X0_EVIDENCE_UNTRUSTED_GESTURE", `${path}.gestureEventType`, findings);
  requireEqual(raw["gestureKind"], null, "X0_EVIDENCE_UNTRUSTED_GESTURE", `${path}.gestureKind`, findings);
  requireEqual(raw["gestureTrusted"], false, "X0_EVIDENCE_UNTRUSTED_GESTURE", `${path}.gestureTrusted`, findings);
  if (typeof raw["userAgent"] !== "string" || raw["userAgent"].trim().length === 0) {
    addFinding(findings, "X0_EVIDENCE_UNTRUSTED_USER_AGENT", `${path}.userAgent`, "The refusal record must retain browser identity.");
  }
  if (typeof raw["nativeAudioContextAvailable"] !== "boolean" || typeof raw["nativeCancelAndHoldAtTimeAvailable"] !== "boolean") {
    addFinding(findings, "X0_EVIDENCE_UNTRUSTED_CAPABILITY", path, "The refusal record must preserve both native capability booleans.");
  }
  for (const [name, expected] of [
    ["platformCreateContextCount", 0],
    ["initialGraphInstanceId", null],
    ["reusedGraphInstanceId", null],
    ["reusedExistingGraph", false],
    ["contextStateAfterInitialization", null],
    ["contextSampleRate", null],
    ["contextTimeBeforeCycles", null],
    ["contextTimeAfterCleanup", null],
    ["persistentCreatedNodeCount", 0],
    ["persistentEdgeCount", 0],
    ["mixAutomationPath", null],
    ["mixAutomationEventDelta", 0],
    ["cyclesRequested", 100],
    ["attackSuccessCount", 0],
    ["retirementSuccessCount", 0],
    ["retirementNoFutureAttackPostconditionCount", 0],
    ["cleanupPollCount", 0],
    ["cleanupComplete", false],
    ["retainedVoiceCountAfterCleanup", 0],
    ["registryIndexReferencesAfterCleanup", 0],
    ["scheduledSourceCount", 0],
    ["cleanupCallbackCount", 0],
    ["disposedContextClosed", false],
    ["engineStateAfterDispose", null],
    ["work", null],
    ["listeningAssessment", "not-performed-by-automation"],
  ] as const) {
    requireEqual(raw[name], expected, "X0_EVIDENCE_UNTRUSTED_SIDE_EFFECT", `${path}.${name}`, findings);
  }
}

function validateRichBrowserRecord(
  raw: JsonRecord,
  project: string,
  realDisposition: "pass" | "fail" | "incomplete",
  metadata: JsonRecord,
  manifest: JsonRecord,
  artifacts: X0AutomatedEvidenceInput["artifacts"],
  path: string,
  findings: X0EvidenceFinding[],
): void {
  requireEqual(raw["traceId"], "TR-X0-RENDER", "X0_EVIDENCE_BROWSER_TRACE", `${path}.traceId`, findings);
  const run = isRecord(raw["run"]) ? raw["run"] : {};
  requireEqual(run["runId"], raw["runId"], "X0_EVIDENCE_BROWSER_RUN_ALIAS", `${path}.run.runId`, findings);
  requireEqual(run["inputManifestDigestSha256"], raw["inputManifestDigest"], "X0_EVIDENCE_BROWSER_INPUT_ALIAS", `${path}.run.inputManifestDigestSha256`, findings);
  const metadataNode = isRecord(metadata["node"]) ? metadata["node"] : {};
  requireEqual(run["nodeVersion"], metadataNode["version"], "X0_EVIDENCE_BROWSER_NODE_VERSION", `${path}.run.nodeVersion`, findings);

  const bundle = isRecord(raw["harnessBundle"]) ? raw["harnessBundle"] : {};
  requireEqual(bundle["path"], artifacts.harnessBundle.path, "X0_EVIDENCE_BROWSER_BUNDLE_PATH", `${path}.harnessBundle.path`, findings);
  requireEqual(bundle["bytes"], artifacts.harnessBundle.bytes, "X0_EVIDENCE_BROWSER_BUNDLE_BYTES", `${path}.harnessBundle.bytes`, findings);
  requireEqual(bundle["expectedSha256"], raw["harnessSha256"], "X0_EVIDENCE_BROWSER_BUNDLE_EXPECTED", `${path}.harnessBundle.expectedSha256`, findings);
  requireEqual(bundle["observedSha256"], artifacts.harnessBundle.sha256, "X0_EVIDENCE_BROWSER_BUNDLE_OBSERVED", `${path}.harnessBundle.observedSha256`, findings);
  requireEqual(bundle["format"], "self-contained-inline-iife", "X0_EVIDENCE_BROWSER_BUNDLE_FORMAT", `${path}.harnessBundle.format`, findings);

  const browser = isRecord(raw["browser"]) ? raw["browser"] : {};
  for (const name of ["projectName", "project", "name"] as const) {
    requireEqual(browser[name], project, "X0_EVIDENCE_BROWSER_IDENTITY", `${path}.browser.${name}`, findings);
  }
  requireEqual(browser["secureContext"], true, "X0_EVIDENCE_BROWSER_SECURE_CONTEXT", `${path}.browser.secureContext`, findings);
  const trustedRecord = isRecord(raw["realAudioContext"])
    ? raw["realAudioContext"]
    : {};
  const untrustedRecord = isRecord(raw["untrustedAudioContext"])
    ? raw["untrustedAudioContext"]
    : {};
  requireEqual(browser["userAgent"], trustedRecord["userAgent"], "X0_EVIDENCE_BROWSER_USER_AGENT", `${path}.browser.userAgent`, findings);
  requireEqual(browser["userAgent"], untrustedRecord["userAgent"], "X0_EVIDENCE_BROWSER_USER_AGENT", `${path}.untrustedAudioContext.userAgent`, findings);
  const playwright = isRecord(raw["playwright"]) ? raw["playwright"] : {};
  requireEqual(playwright["version"], metadata["playwrightVersion"], "X0_EVIDENCE_BROWSER_PLAYWRIGHT_VERSION", `${path}.playwright.version`, findings);
  requireEqual(playwright["retry"], 0, "X0_EVIDENCE_BROWSER_RETRY", `${path}.playwright.retry`, findings);
  requireEqual(playwright["retriesAllowed"], 0, "X0_EVIDENCE_BROWSER_RETRY", `${path}.playwright.retriesAllowed`, findings);
  if (!safeCounter(playwright["workerIndex"])) {
    addFinding(findings, "X0_EVIDENCE_BROWSER_WORKER", `${path}.playwright.workerIndex`, "Worker index must be a nonnegative safe integer.");
  }

  const components = records(manifest["components"]);
  const fixtures = isRecord(raw["fixtures"]) ? raw["fixtures"] : {};
  for (const [name, expectedPath, expectedSchema] of [
    ["renderMatrix", "tests/fixtures/audio-engine/render-matrix.json", "changes.fixtures.x0-render-matrix.v1"],
    ["impulseGolden", "tests/fixtures/audio-engine/impulse-golden.json", "changes.fixtures.x0-impulse-golden.v1"],
    ["traceLedger", "tests/fixtures/audio-engine/trace-ledger.json", "changes.fixtures.x0-trace-ledger.v1"],
  ] as const) {
    const fixture = isRecord(fixtures[name]) ? fixtures[name] : {};
    const component = components.find((candidate) => candidate["path"] === expectedPath);
    requireEqual(fixture["path"], expectedPath, "X0_EVIDENCE_BROWSER_FIXTURE_PATH", `${path}.fixtures.${name}.path`, findings);
    requireEqual(fixture["schema"], expectedSchema, "X0_EVIDENCE_BROWSER_FIXTURE_SCHEMA", `${path}.fixtures.${name}.schema`, findings);
    requireEqual(fixture["bytes"], component?.["bytes"], "X0_EVIDENCE_BROWSER_FIXTURE_BYTES", `${path}.fixtures.${name}.bytes`, findings);
    requireEqual(fixture["sha256"], component?.["sha256"], "X0_EVIDENCE_BROWSER_FIXTURE_HASH", `${path}.fixtures.${name}.sha256`, findings);
  }

  if (!sameJson(raw["offlineRenders"], raw["rawRenderRecords"])) {
    addFinding(findings, "X0_EVIDENCE_BROWSER_RENDER_ALIAS", `${path}.offlineRenders`, "Validated render aliases must be deeply identical to raw render records.");
  }
  if (!sameJson(raw["realAudioContext"], raw["realAudioContextRecord"])) {
    addFinding(findings, "X0_EVIDENCE_BROWSER_REAL_ALIAS", `${path}.realAudioContext`, "Validated real-context alias must be deeply identical to the raw record.");
  }
  if (!sameJson(raw["untrustedAudioContext"], raw["untrustedAudioContextRecord"])) {
    addFinding(findings, "X0_EVIDENCE_BROWSER_UNTRUSTED_ALIAS", `${path}.untrustedAudioContext`, "Synthetic refusal alias must be deeply identical to the raw untrusted-context record.");
  }
  if (!Array.isArray(raw["renderExecutionErrors"]) || raw["renderExecutionErrors"].length !== 0) {
    addFinding(findings, "X0_EVIDENCE_BROWSER_RENDER_ERRORS", `${path}.renderExecutionErrors`, "Render execution errors must be an explicitly empty array.");
  }
  const rawFindings = records(raw["findings"]);
  const unsupportedFinding = rawFindings.find(
    (finding) => finding["code"] === "X0_REAL_AUDIO_CONTEXT_UNSUPPORTED",
  );
  if (!Array.isArray(raw["findings"])) {
    addFinding(findings, "X0_EVIDENCE_BROWSER_FINDINGS", `${path}.findings`, "The producer's raw finding ledger must be an array.");
  } else if (realDisposition === "pass" && rawFindings.length !== 0) {
    addFinding(findings, "X0_EVIDENCE_BROWSER_FINDINGS", `${path}.findings`, "A completed browser cell must have an explicitly empty raw finding ledger.");
  } else if (
    realDisposition === "incomplete" &&
    unsupportedFinding === undefined
  ) {
    addFinding(findings, "X0_EVIDENCE_BROWSER_UNSUPPORTED_FINDING", `${path}.findings`, "Unsupported AudioContext evidence requires the stable explicit capability finding.");
  }
  if (realDisposition === "incomplete" && unsupportedFinding !== undefined) {
    const message = unsupportedFinding["message"];
    const browser = isRecord(raw["browser"]) ? raw["browser"] : {};
    const real = isRecord(raw["realAudioContext"]) ? raw["realAudioContext"] : {};
    if (
      typeof message !== "string" ||
      !message.includes("AudioContext") ||
      !message.includes(project) ||
      typeof browser["version"] !== "string" ||
      !message.includes(browser["version"]) ||
      !message.includes(String(real["outcome"])) ||
      !message.includes(String(real["reasonCode"]))
    ) {
      addFinding(findings, "X0_EVIDENCE_BROWSER_UNSUPPORTED_DETAIL", `${path}.findings`, "Unsupported finding must retain method, project, exact browser version, raw outcome, and reason code.");
    }
  }
  requireEqual(
    raw["outcome"],
    realDisposition === "pass" ? "pass" : "fail",
    "X0_EVIDENCE_BROWSER_OUTCOME",
    `${path}.outcome`,
    findings,
  );
  const assertions = isRecord(raw["assertions"]) ? raw["assertions"] : {};
  if (Object.keys(assertions).length === 0) {
    addFinding(findings, "X0_EVIDENCE_BROWSER_ASSERTIONS", `${path}.assertions`, "The producer must record its named assertion ledger.");
  }
  let unsupportedAssertionFailures = 0;
  for (const [name, assertion] of Object.entries(assertions)) {
    const outcome = isRecord(assertion) ? assertion["outcome"] : null;
    const detail = isRecord(assertion) ? assertion["detail"] : null;
    const allowedUnsupportedFailure =
      realDisposition === "incomplete" &&
      name.startsWith("real-context/") &&
      outcome === "fail";
    if (allowedUnsupportedFailure) unsupportedAssertionFailures += 1;
    if (
      !isRecord(assertion) ||
      (outcome !== "pass" && !allowedUnsupportedFailure) ||
      typeof detail !== "string" ||
      detail.length === 0
    ) {
      addFinding(findings, "X0_EVIDENCE_BROWSER_ASSERTION_FAILED", `${path}.assertions.${name}`, "Every non-capability producer assertion must pass with a nonempty detail.");
    }
  }
  if (realDisposition === "incomplete" && unsupportedAssertionFailures === 0) {
    addFinding(findings, "X0_EVIDENCE_BROWSER_UNSUPPORTED_ASSERTION", `${path}.assertions`, "Unsupported capability evidence must retain at least one explicit failed real-context assertion.");
  }

  const diagnostics = isRecord(raw["diagnostics"]) ? raw["diagnostics"] : {};
  const requests = records(diagnostics["requests"]);
  if (requests.length !== 1) {
    addFinding(findings, "X0_EVIDENCE_BROWSER_REQUEST_COUNT", `${path}.diagnostics.requests`, "Diagnostics must preserve exactly one allowed loopback document request.");
  }
  const request = requests[0] ?? {};
  requireEqual(request["id"], "request-001", "X0_EVIDENCE_BROWSER_REQUEST", `${path}.diagnostics.requests[0].id`, findings);
  requireEqual(request["sequence"], 1, "X0_EVIDENCE_BROWSER_REQUEST", `${path}.diagnostics.requests[0].sequence`, findings);
  requireEqual(request["method"], "GET", "X0_EVIDENCE_BROWSER_REQUEST", `${path}.diagnostics.requests[0].method`, findings);
  requireEqual(request["resourceType"], "document", "X0_EVIDENCE_BROWSER_REQUEST", `${path}.diagnostics.requests[0].resourceType`, findings);
  requireEqual(request["navigation"], true, "X0_EVIDENCE_BROWSER_REQUEST", `${path}.diagnostics.requests[0].navigation`, findings);
  requireEqual(request["disposition"], "allowed-document", "X0_EVIDENCE_BROWSER_REQUEST", `${path}.diagnostics.requests[0].disposition`, findings);
  requireEqual(request["status"], 200, "X0_EVIDENCE_BROWSER_REQUEST", `${path}.diagnostics.requests[0].status`, findings);
  requireEqual(request["failure"], undefined, "X0_EVIDENCE_BROWSER_REQUEST_FAILURE", `${path}.diagnostics.requests[0].failure`, findings);
  requireEqual(request["normalizedUrl"], "<x0-audio-harness-document>", "X0_EVIDENCE_BROWSER_REQUEST_URL", `${path}.diagnostics.requests[0].normalizedUrl`, findings);
  let requestUrlValid = false;
  if (typeof request["url"] === "string") {
    try {
      const url = new URL(request["url"]);
      requestUrlValid =
        url.protocol === "http:" &&
        url.hostname === "127.0.0.1" &&
        url.port === "41739" &&
        url.pathname === "/x0-audio-harness.html" &&
        url.search === "" &&
        url.hash === "";
    } catch {
      requestUrlValid = false;
    }
  }
  if (!requestUrlValid) {
    addFinding(findings, "X0_EVIDENCE_BROWSER_REQUEST_URL", `${path}.diagnostics.requests[0].url`, "Allowed request must be the exact loopback harness document.");
  }
  const unexpectedRequests = requests.filter((item) =>
    item["disposition"] === "blocked" || item["failure"] !== undefined
  );
  if (!sameJson(raw["requestLog"], unexpectedRequests)) {
    addFinding(findings, "X0_EVIDENCE_BROWSER_REQUEST_ALIAS", `${path}.requestLog`, "requestLog must exactly alias forbidden or failed requests, not conceal the allowed document request.");
  }
  const consoleRecords = records(diagnostics["console"]);
  if (!sameJson(raw["consoleErrors"], consoleRecords)) {
    addFinding(findings, "X0_EVIDENCE_BROWSER_CONSOLE_ALIAS", `${path}.consoleErrors`, "consoleErrors must deeply equal the raw diagnostic console ledger.");
  }
  if (!sameJson(raw["pageErrors"], diagnostics["pageErrors"])) {
    addFinding(findings, "X0_EVIDENCE_BROWSER_PAGE_ERROR_ALIAS", `${path}.pageErrors`, "pageErrors must deeply equal the raw diagnostic page-error ledger.");
  }
  for (const name of ["console", "pageErrors", "webErrors", "workers", "webSockets", "dialogs"] as const) {
    if (!Array.isArray(diagnostics[name]) || diagnostics[name].length !== 0) {
      addFinding(findings, "X0_EVIDENCE_BROWSER_DIAGNOSTIC", `${path}.diagnostics.${name}`, `${name} must be an explicitly recorded empty diagnostic array.`);
    }
  }
  const resourceEntries = diagnostics["resourceEntries"];
  if (
    !Array.isArray(resourceEntries) ||
    resourceEntries.length > 1 ||
    new Set(resourceEntries).size !== resourceEntries.length
  ) {
    addFinding(
      findings,
      "X0_EVIDENCE_BROWSER_RESOURCE_ENTRIES",
      `${path}.diagnostics.resourceEntries`,
      "Resource diagnostics must be an explicit unique array containing at most the one reviewed inline favicon entry.",
    );
  }
  if (
    Array.isArray(resourceEntries) &&
    resourceEntries.some((entry) => entry !== X0_INLINE_FAVICON_RESOURCE)
  ) {
    addFinding(
      findings,
      "X0_EVIDENCE_BROWSER_RESOURCE_ENTRY",
      `${path}.diagnostics.resourceEntries`,
      "Every retained resource entry must exactly equal the reviewed inline SVG favicon data URL.",
    );
  }
  if (
    !Array.isArray(diagnostics["pages"]) ||
    diagnostics["pages"].length !== 1 ||
    diagnostics["pages"][0] !== request["url"]
  ) {
    addFinding(findings, "X0_EVIDENCE_BROWSER_PAGES", `${path}.diagnostics.pages`, "Diagnostics must record only the one harness page.");
  }
  const manual = isRecord(raw["manualListening"]) ? raw["manualListening"] : {};
  requireEqual(manual["performed"], false, "X0_EVIDENCE_BROWSER_MANUAL_CLAIM", `${path}.manualListening.performed`, findings);
  requireEqual(manual["outcome"], "not-assessed", "X0_EVIDENCE_BROWSER_MANUAL_CLAIM", `${path}.manualListening.outcome`, findings);
  if (typeof manual["reason"] !== "string" || manual["reason"].trim().length === 0) {
    addFinding(findings, "X0_EVIDENCE_BROWSER_MANUAL_REASON", `${path}.manualListening.reason`, "The manual-listening nonclaim requires a reason.");
  }
}

export async function validateX0AutomatedEvidence(
  input: X0AutomatedEvidenceInput,
): Promise<X0AutomatedEvidenceReport> {
  const findings: X0EvidenceFinding[] = [];
  const metadata = isRecord(input.runnerMetadata) ? input.runnerMetadata : {};
  const manifest = isRecord(input.inputManifest) ? input.inputManifest : {};
  const playwright = isRecord(input.playwrightReport) ? input.playwrightReport : {};
  const renderMatrix = isRecord(input.renderMatrix) ? input.renderMatrix : {};
  const impulseGolden = isRecord(input.impulseGolden) ? input.impulseGolden : {};
  const traceLedger = isRecord(input.traceLedger) ? input.traceLedger : {};
  const runId = validateRunnerMetadata(metadata, input.artifacts, findings);
  await validateInputBindings(input, metadata, manifest, runId, findings);
  validatePlaywrightConfiguration(playwright, findings);

  const numericPolicy = isRecord(renderMatrix["numericPolicy"]) ? renderMatrix["numericPolicy"] : {};
  if (
    !sameJson(renderMatrix["supportedBrowserMatrix"], [
      "chromium",
      "firefox",
      "webkit-or-safari",
    ]) ||
    renderMatrix["unsupportedCapabilityPolicy"] !==
      "record the exact browser version and unsupported automation method; exercise the declared fallback and complete the matching manual row; never skip the case silently"
  ) {
    addFinding(findings, "X0_EVIDENCE_BROWSER_AUTHORITY", "renderMatrix", "Browser support and unsupported-capability policy must equal the reviewed authority.");
  }
  const fixtureCases = records(renderMatrix["cases"]);
  if (fixtureCases.length !== 18) {
    addFinding(findings, "X0_EVIDENCE_RENDER_AUTHORITY_COUNT", "renderMatrix.cases", "The reviewed render authority must contain exactly eighteen cases.");
  }
  const fixtureById = new Map<string, JsonRecord>();
  for (const fixture of fixtureCases) {
    if (typeof fixture["id"] === "string") fixtureById.set(fixture["id"], fixture);
  }
  if (fixtureById.size !== fixtureCases.length) {
    addFinding(findings, "X0_EVIDENCE_RENDER_AUTHORITY_IDS", "renderMatrix.cases", "Render case IDs must be unique strings.");
  }
  const renderTrace = records(traceLedger["traces"]).find((trace) => trace["id"] === "TR-X0-RENDER");
  if (
    renderTrace === undefined ||
    renderTrace["evidenceOwner"] !== X0_PLAYWRIGHT_PRODUCER_FILE ||
    JSON.stringify([...strings(renderTrace["caseIds"])].sort(compare)) !== JSON.stringify([...fixtureById.keys()].sort(compare))
  ) {
    addFinding(findings, "X0_EVIDENCE_RENDER_TRACE", "traceLedger.TR-X0-RENDER", "The render trace must map every reviewed render case to the exact Playwright producer file.");
  }

  const sampleRates = [...new Set(fixtureCases.map((fixture) => fixture["sampleRate"]).filter((value): value is number => Number.isInteger(value)))].sort((left, right) => left - right);
  const impulseReplays = sampleRates.map((sampleRate) => replayX0ImpulseQ15(sampleRate, impulseGolden));
  const replayByRate = new Map(impulseReplays.map((replay) => [replay.sampleRate, replay]));
  const referenceRate = impulseGolden["referenceSampleRate"];
  const referenceReplay = typeof referenceRate === "number" ? replayByRate.get(referenceRate) : undefined;
  if (referenceReplay === undefined || referenceReplay.sha256 !== impulseGolden["referenceInterleavedInt16LeSha256"]) {
    addFinding(findings, "X0_EVIDENCE_IMPULSE_REFERENCE", "impulseGolden.referenceInterleavedInt16LeSha256", "Independent replay must reproduce the reviewed reference hash.");
  }

  const cells = collectPlaywrightCells(playwright);
  if (cells.length !== X0_EXPECTED_BROWSER_PROJECTS.length) {
    addFinding(findings, "X0_EVIDENCE_PLAYWRIGHT_TEST_COUNT", "playwright.suites", "The report must contain exactly one producer test per reviewed browser project.");
  }
  const rawByProject = new Map<string, JsonRecord>();
  const reporterByProject = new Map<string, CollectedPlaywrightCell>();
  const rawFilesByProject = new Map(
    input.rawBrowserFiles.map((file) => [file.project, file]),
  );
  if (
    rawFilesByProject.size !== X0_EXPECTED_BROWSER_PROJECTS.length ||
    input.rawBrowserFiles.length !== X0_EXPECTED_BROWSER_PROJECTS.length
  ) {
    addFinding(
      findings,
      "X0_EVIDENCE_RAW_FILE_COUNT",
      "rawBrowserFiles",
      "The run must contain exactly one independently hashed raw file per browser project.",
    );
  }
  for (const project of X0_EXPECTED_BROWSER_PROJECTS) {
    const rawFile = rawFilesByProject.get(project);
    if (rawFile === undefined) {
      addFinding(
        findings,
        "X0_EVIDENCE_RAW_FILE_MISSING",
        project,
        "The browser project's persisted raw file is missing.",
      );
      continue;
    }
    validateArtifactDigest(
      rawFile.artifact,
      `test-results/x0-audio-evidence-runs/${runId}/${project}.json`,
      `rawBrowserFiles.${project}`,
      findings,
    );
  }
  const rawAttachments: Array<{ project: string; name: string; bytes: number; sha256: string }> = [];
  for (const [index, cell] of cells.entries()) {
    const path = `playwright.cells[${String(index)}]`;
    const project = typeof cell.test["projectName"] === "string" ? cell.test["projectName"] : "";
    requireEqual(cell.file, "audio-offline-render.test.ts", "X0_EVIDENCE_PRODUCER_FILE", `${path}.file`, findings);
    requireEqual(cell.title, X0_PLAYWRIGHT_TESTCASE, "X0_EVIDENCE_PRODUCER_TESTCASE", `${path}.title`, findings);
    if (!Array.isArray(cell.spec["tags"]) || cell.spec["tags"].length !== 0) {
      addFinding(findings, "X0_EVIDENCE_TAG_POLICY", `${path}.spec.tags`, "The X0 producer test must have no tags or quarantine markers.");
    }
    requireEqual(cell.test["expectedStatus"], "passed", "X0_EVIDENCE_EXPECTED_FAILURE", `${path}.test.expectedStatus`, findings);
    if (!Array.isArray(cell.test["annotations"]) || cell.test["annotations"].length !== 0) {
      addFinding(findings, "X0_EVIDENCE_TEST_ANNOTATION", `${path}.test.annotations`, "Skip, fixme, fail, slow, and quarantine annotations are forbidden.");
    }
    if (cell.result === null) {
      addFinding(findings, "X0_EVIDENCE_RESULT_COUNT", `${path}.test.results`, "Each browser test must have exactly one result and no retry.");
      continue;
    }
    requireEqual(cell.result["retry"], 0, "X0_EVIDENCE_RESULT_RETRY", `${path}.result.retry`, findings);
    if (!Array.isArray(cell.result["annotations"]) || cell.result["annotations"].length !== 0) {
      addFinding(findings, "X0_EVIDENCE_RESULT_ANNOTATION", `${path}.result.annotations`, "Result annotations are forbidden in release audio evidence.");
    }
    const rawAttachmentsForResult = cell.result["attachments"];
    const attachments = records(rawAttachmentsForResult);
    const expectedName = `x0-audio-evidence-${project}.json`;
    const attachment =
      Array.isArray(rawAttachmentsForResult) &&
      rawAttachmentsForResult.length === 1 &&
      attachments.length === 1
        ? attachments[0]
        : undefined;
    if (attachment === undefined) {
      addFinding(findings, "X0_EVIDENCE_ATTACHMENT_COUNT", `${path}.result.attachments`, "Each browser result must contain exactly one raw evidence attachment.");
      continue;
    }
    requireEqual(attachment["name"], expectedName, "X0_EVIDENCE_ATTACHMENT_NAME", `${path}.attachment.name`, findings);
    requireEqual(attachment["contentType"], "application/json", "X0_EVIDENCE_ATTACHMENT_TYPE", `${path}.attachment.contentType`, findings);
    const decoded = decodeJsonBody(attachment["body"]);
    if (decoded === null) {
      addFinding(findings, "X0_EVIDENCE_ATTACHMENT_BODY", `${path}.attachment.body`, "The attachment must contain canonical decodable JSON object bytes.");
      continue;
    }
    const persisted = rawFilesByProject.get(project);
    if (
      persisted === undefined ||
      !sameJson(persisted.value, decoded.value) ||
      persisted.artifact.bytes !== decoded.bytes.byteLength ||
      persisted.artifact.sha256 !== canonicalSha256(decoded.bytes)
    ) {
      addFinding(
        findings,
        "X0_EVIDENCE_RAW_ATTACHMENT_MISMATCH",
        `${path}.attachment`,
        "The Playwright body attachment must be byte-identical to the independently read persisted browser file.",
      );
    }
    if (rawByProject.has(project)) {
      addFinding(findings, "X0_EVIDENCE_BROWSER_DUPLICATE", project, "Each browser project may contribute exactly one raw evidence record.");
    } else {
      rawByProject.set(project, decoded.value);
      reporterByProject.set(project, cell);
    }
    rawAttachments.push(Object.freeze({ project, name: expectedName, bytes: decoded.bytes.byteLength, sha256: canonicalSha256(decoded.bytes) }));
  }

  const producerKeys: string[] = [];
  const browserVersions: Array<{ project: string; version: string; userAgent: string }> = [];
  let observedRenderCells = 0;
  let passingRealContextCells = 0;
  let unsupportedRealContextCells = 0;
  const manifestDigest = manifest["digest"];
  for (const project of X0_EXPECTED_BROWSER_PROJECTS) {
    const raw = rawByProject.get(project);
    const path = `browserRecords.${project}`;
    if (raw === undefined) {
      addFinding(findings, "X0_EVIDENCE_BROWSER_MISSING", path, "The reviewed browser project has no raw evidence record.");
      continue;
    }
    requireEqual(raw["schema"], X0_BROWSER_RUN_SCHEMA, "X0_EVIDENCE_BROWSER_SCHEMA", `${path}.schema`, findings);
    requireEqual(raw["runId"], runId, "X0_EVIDENCE_BROWSER_RUN_ID", `${path}.runId`, findings);
    requireEqual(raw["inputManifestDigest"], manifestDigest, "X0_EVIDENCE_BROWSER_INPUT_DIGEST", `${path}.inputManifestDigest`, findings);
    requireEqual(raw["harnessSha256"], input.artifacts.harnessBundle.sha256, "X0_EVIDENCE_BROWSER_HARNESS_HASH", `${path}.harnessSha256`, findings);
    requireEqual(raw["producerFile"], X0_PLAYWRIGHT_PRODUCER_FILE, "X0_EVIDENCE_BROWSER_PRODUCER", `${path}.producerFile`, findings);
    requireEqual(raw["testcase"], X0_PLAYWRIGHT_TESTCASE, "X0_EVIDENCE_BROWSER_TESTCASE", `${path}.testcase`, findings);
    const browser = isRecord(raw["browser"]) ? raw["browser"] : {};
    requireEqual(browser["projectName"], project, "X0_EVIDENCE_BROWSER_PROJECT", `${path}.browser.projectName`, findings);
    const version = typeof browser["version"] === "string" ? browser["version"] : "";
    const userAgent = typeof browser["userAgent"] === "string" ? browser["userAgent"] : "";
    if (version.trim().length === 0 || userAgent.trim().length === 0) {
      addFinding(findings, "X0_EVIDENCE_BROWSER_VERSION", `${path}.browser`, "Browser version and user agent must both be nonempty.");
    }
    browserVersions.push(Object.freeze({ project, version, userAgent }));
    for (const logName of ["requestLog", "consoleErrors", "pageErrors"] as const) {
      if (!Array.isArray(raw[logName]) || (raw[logName] as unknown[]).length !== 0) {
        addFinding(findings, "X0_EVIDENCE_BROWSER_DIAGNOSTIC", `${path}.${logName}`, `${logName} must be an explicitly recorded empty array.`);
      }
    }
    requireEqual(raw["listeningAssessment"], "not-performed-by-automation", "X0_EVIDENCE_BROWSER_LISTENING_CLAIM", `${path}.listeningAssessment`, findings);
    const renders = records(raw["offlineRenders"]);
    if (!Array.isArray(raw["offlineRenders"]) || renders.length !== fixtureCases.length) {
      addFinding(findings, "X0_EVIDENCE_BROWSER_RENDER_COUNT", `${path}.offlineRenders`, "Each browser record must contain exactly eighteen render cells.");
    }
    const seenCases = new Set<string>();
    for (const [index, render] of renders.entries()) {
      observedRenderCells += 1;
      const caseId = typeof render["caseId"] === "string" ? render["caseId"] : "";
      const fixture = fixtureById.get(caseId);
      if (fixture === undefined) {
        addFinding(findings, "X0_EVIDENCE_RENDER_UNEXPECTED", `${path}.offlineRenders[${String(index)}].caseId`, "Render cell is outside the reviewed matrix.");
        continue;
      }
      if (seenCases.has(caseId)) {
        addFinding(findings, "X0_EVIDENCE_RENDER_DUPLICATE", `${path}.offlineRenders[${String(index)}].caseId`, "A browser may contain one render cell per case ID.");
      }
      seenCases.add(caseId);
      const replay = replayByRate.get(fixture["sampleRate"] as number);
      if (replay === undefined) {
        addFinding(findings, "X0_EVIDENCE_IMPULSE_RATE", caseId, "No independent impulse replay exists for the render sample rate.");
        continue;
      }
      producerKeys.push(
        `TR-X0-RENDER|${X0_PLAYWRIGHT_PRODUCER_FILE}|${X0_PLAYWRIGHT_TESTCASE}|${project}|${version}|${caseId}`,
      );
      validateRenderRecord(render, fixture, numericPolicy, replay, `${path}.offlineRenders[${String(index)}]`, findings);
    }
    for (const caseId of fixtureById.keys()) {
      if (!seenCases.has(caseId)) {
        addFinding(findings, "X0_EVIDENCE_RENDER_MISSING", `${path}.${caseId}`, "The browser record is missing a reviewed render case.");
      }
    }
    const beforeRealFindings = findings.length;
    const realDisposition = validateRealContextRecord(
      raw["realAudioContext"],
      `${path}.realAudioContext`,
      findings,
    );
    validateUntrustedContextRecord(
      raw["untrustedAudioContext"],
      `${path}.untrustedAudioContext`,
      findings,
    );
    validateRichBrowserRecord(
      raw,
      project,
      realDisposition,
      metadata,
      manifest,
      input.artifacts,
      path,
      findings,
    );
    const reporter = reporterByProject.get(project);
    if (reporter === undefined || reporter.result === null) {
      addFinding(findings, "X0_EVIDENCE_REPORTER_CELL", `${path}.reporter`, "The raw browser record must bind one Playwright reporter cell.");
    } else if (realDisposition === "pass") {
      requireEqual(reporter.test["status"], "expected", "X0_EVIDENCE_TEST_STATUS", `${path}.reporter.test.status`, findings);
      requireEqual(reporter.result["status"], "passed", "X0_EVIDENCE_RESULT_STATUS", `${path}.reporter.result.status`, findings);
      if (!Array.isArray(reporter.result["errors"]) || reporter.result["errors"].length !== 0) {
        addFinding(findings, "X0_EVIDENCE_RESULT_ERRORS", `${path}.reporter.result.errors`, "A completed browser cell cannot contain Playwright result errors.");
      }
    } else if (realDisposition === "incomplete") {
      requireEqual(reporter.test["status"], "unexpected", "X0_EVIDENCE_UNSUPPORTED_TEST_STATUS", `${path}.reporter.test.status`, findings);
      requireEqual(reporter.result["status"], "failed", "X0_EVIDENCE_UNSUPPORTED_RESULT_STATUS", `${path}.reporter.result.status`, findings);
      if (!Array.isArray(reporter.result["errors"]) || reporter.result["errors"].length === 0) {
        addFinding(findings, "X0_EVIDENCE_UNSUPPORTED_RESULT_ERROR", `${path}.reporter.result.errors`, "Unsupported capability must remain an explicit non-passing Playwright cell.");
      }
    }
    if (realDisposition === "pass" && findings.length === beforeRealFindings) {
      passingRealContextCells += 1;
    }
    if (realDisposition === "incomplete") unsupportedRealContextCells += 1;
  }

  const runnerPlaywright = isRecord(metadata["playwright"])
    ? metadata["playwright"]
    : {};
  if (unsupportedRealContextCells === 0) {
    for (const [index, cell] of cells.entries()) {
      requireEqual(cell.spec["ok"], true, "X0_EVIDENCE_SPEC_OUTCOME", `playwright.cells[${String(index)}].spec.ok`, findings);
    }
    requireEqual(metadata["outcome"], "pass", "X0_EVIDENCE_RUNNER_OUTCOME", "runnerMetadata.outcome", findings);
    requireEqual(runnerPlaywright["exitCode"], 0, "X0_EVIDENCE_PLAYWRIGHT_EXIT", "runnerMetadata.playwright.exitCode", findings);
  } else {
    for (const [index, cell] of cells.entries()) {
      requireEqual(cell.spec["ok"], false, "X0_EVIDENCE_UNSUPPORTED_SPEC_OUTCOME", `playwright.cells[${String(index)}].spec.ok`, findings);
    }
    requireEqual(metadata["outcome"], "fail", "X0_EVIDENCE_UNSUPPORTED_RUNNER_OUTCOME", "runnerMetadata.outcome", findings);
    requireEqual(runnerPlaywright["exitCode"], 1, "X0_EVIDENCE_UNSUPPORTED_PLAYWRIGHT_EXIT", "runnerMetadata.playwright.exitCode", findings);
  }

  findings.sort((left, right) => compare(`${left.code}:${left.path}:${left.message}`, `${right.code}:${right.path}:${right.message}`));
  const automatedOutcome = findings.some(({ disposition }) => disposition === "fail")
    ? "fail"
    : findings.some(({ disposition }) => disposition === "incomplete")
      ? "incomplete"
      : "pass";
  return Object.freeze({
    outcome: automatedOutcome,
    runId: SAFE_RUN_ID.test(runId) ? runId : null,
    expectedBrowserRecords: 3,
    observedBrowserRecords: rawByProject.size,
    expectedRenderCells: 54,
    observedRenderCells,
    passingRealContextCells,
    unsupportedRealContextCells,
    browserVersions: Object.freeze(browserVersions.sort((left, right) => compare(left.project, right.project))),
    producerKeys: Object.freeze(producerKeys.sort(compare)),
    impulseReplays: Object.freeze(impulseReplays.map(({ sampleRate, frameCount, scalarSamples, sha256 }) => Object.freeze({ sampleRate, frameCount, scalarSamples, sha256 }))),
    rawAttachments: Object.freeze(rawAttachments.sort((left, right) => compare(left.project, right.project))),
    artifacts: Object.freeze([
      ...Object.values(input.artifacts),
      ...input.rawBrowserFiles.map(({ artifact }) => artifact),
    ].sort((left, right) => compare(left.path, right.path))),
    findings: Object.freeze(findings),
  });
}

async function expandPackageInputPattern(pattern: string): Promise<readonly string[]> {
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
  snapshot: X0PackageInputSnapshot;
  findings: readonly X0EvidenceFinding[];
}>> {
  const findings: X0EvidenceFinding[] = [];
  const paths = new Set<string>();
  for (const pattern of [...X0_PACKAGE_INPUT_PATTERNS, ...extraPaths]) {
    const matches = await expandPackageInputPattern(pattern);
    if (matches.length === 0) {
      addFinding(
        findings,
        "X0_EVIDENCE_PACKAGE_INPUT_MISSING",
        pattern,
        "A declared package-proof input is missing.",
      );
    }
    for (const path of matches) paths.add(path);
  }
  const components: X0ArtifactDigest[] = [];
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
): Promise<X0CapturedCommand> {
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
    throw new Error("X0_EVIDENCE_JUNIT_HOSTNAME");
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
    throw new Error("X0_EVIDENCE_JUNIT_ROOT");
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
    if (file === undefined || file.length === 0 || name === undefined || name.length === 0) {
      throw new Error("X0_EVIDENCE_JUNIT_TESTCASE_IDENTITY");
    }
    const body = match[2] ?? "";
    observedFailures += (body.match(/<failure\b/gu) ?? []).length;
    observedErrors += (body.match(/<error\b/gu) ?? []).length;
    observedSkipped += (body.match(/<skipped\b/gu) ?? []).length;
    cases.push(Object.freeze({ file, name }));
  }
  if (tests !== cases.length) throw new Error("X0_EVIDENCE_JUNIT_TEST_COUNT");
  if (failures !== observedFailures) throw new Error("X0_EVIDENCE_JUNIT_FAILURE_COUNT");
  if (errors !== observedErrors) throw new Error("X0_EVIDENCE_JUNIT_ERROR_COUNT");
  if (skipped !== observedSkipped) throw new Error("X0_EVIDENCE_JUNIT_SKIPPED_COUNT");
  const keys = cases.map(({ file, name }) => `${file}\u0000${name}`);
  if (new Set(keys).size !== keys.length) {
    throw new Error("X0_EVIDENCE_JUNIT_DUPLICATE_TESTCASE");
  }
  cases.sort((left, right) => compare(`${left.file}\u0000${left.name}`, `${right.file}\u0000${right.name}`));
  return Object.freeze({
    tests,
    assertions,
    failures,
    errors,
    skipped,
    files: Object.freeze([...new Set(cases.map(({ file }) => file))].sort(compare)),
    cases: Object.freeze(cases),
  });
}

function exactOwnerTestFiles(traceLedger: JsonRecord): readonly string[] {
  const owners = records(traceLedger["traces"])
    .map((trace) => trace["evidenceOwner"])
    .filter((owner): owner is string =>
      typeof owner === "string" &&
      isCanonicalX0InputPath(owner) &&
      owner.startsWith("tests/") &&
      owner.endsWith(".test.ts") &&
      owner !== X0_PLAYWRIGHT_PRODUCER_FILE
    );
  owners.push("tests/integration/audio-engine.test.ts");
  return Object.freeze([...new Set(owners)].sort(compare));
}

export function buildX0OwnerSuiteCommand(
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
  evidence: X0OwnerSuiteEvidence;
  findings: readonly X0EvidenceFinding[];
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
  const command = buildX0OwnerSuiteCommand(junitPath, ownerFiles);
  const captured = await captureCommand(
    command,
    environment,
    stdoutPath,
    stderrPath,
  );
  const findings: X0EvidenceFinding[] = [];
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
      "X0_EVIDENCE_OWNER_JUNIT",
      repoRelative(junitPath),
      error instanceof Error ? error.message : "Owner-suite JUnit is invalid.",
    );
    if (!(await Bun.file(junitPath).exists())) await atomicWrite(junitPath, junit);
  }
  if (captured.exitCode !== 0) {
    addFinding(findings, "X0_EVIDENCE_OWNER_EXIT", "ownerSuite.exitCode", "The exact owner suite exited nonzero.");
  }
  if (summary.failures !== 0 || summary.errors !== 0 || summary.skipped !== 0) {
    addFinding(findings, "X0_EVIDENCE_OWNER_COUNTS", "ownerSuite.junit", "The exact owner suite must contain zero failure, error, or skipped tests.");
  }
  if (JSON.stringify(summary.files) !== JSON.stringify(ownerFiles)) {
    addFinding(findings, "X0_EVIDENCE_OWNER_INVENTORY", "ownerSuite.junit", "Executed JUnit files must equal the exact reviewed trace-owner inventory plus audio-engine.test.ts.");
  }
  for (const file of ownerFiles) {
    const source = await Bun.file(resolve(ROOT, file)).text();
    if (/\b(?:describe|it|test)\s*\.\s*(?:only|skip|todo|failing|skipIf|todoIf|quarantine)\b/u.test(source)) {
      addFinding(findings, "X0_EVIDENCE_OWNER_CONTROL", file, "Skip, todo, only, failing, conditional-skip, and quarantine controls are forbidden in owner tests.");
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

function buildTraceOwnerEvidence(
  traceLedger: JsonRecord,
  ownerSuite: X0OwnerSuiteEvidence,
  findings: X0EvidenceFinding[],
): readonly X0TraceOwnerEvidence[] {
  const rows: X0TraceOwnerEvidence[] = [];
  for (const trace of records(traceLedger["traces"])) {
    const traceId = typeof trace["id"] === "string" ? trace["id"] : "invalid";
    const owner = typeof trace["evidenceOwner"] === "string" ? trace["evidenceOwner"] : "invalid";
    if (!owner.endsWith(".test.ts") || owner === X0_PLAYWRIGHT_PRODUCER_FILE) continue;
    const caseIds = [...strings(trace["caseIds"])];
    const ownerCases = ownerSuite.cases.filter(({ file }) => file === owner);
    const producerKeys: string[] = [];
    let rowPass = ownerCases.length > 0 && caseIds.length > 0;
    for (const caseId of caseIds) {
      const namedCases = ownerCases.filter(({ name }) => name.includes(caseId));
      if (namedCases.length === 0) rowPass = false;
      for (const testcase of namedCases) {
        producerKeys.push(`${traceId}|${owner}|${testcase.name}|${caseId}`);
      }
    }
    if (!rowPass) {
      addFinding(findings, "X0_EVIDENCE_TRACE_OWNER", `${traceId}:${owner}`, "Every non-browser trace row must map its case IDs to an executed exact owner testcase.");
    }
    rows.push(Object.freeze({
      traceId,
      evidenceOwner: owner,
      caseIds: Object.freeze(caseIds),
      observedTestcases: ownerCases.length,
      producerKeys: Object.freeze(producerKeys.sort(compare)),
      outcome: rowPass ? "pass" : "fail",
    }));
  }
  return Object.freeze(rows.sort((left, right) => compare(left.traceId, right.traceId)));
}

export function validateX0TraceOwnerEvidence(
  traceLedger: unknown,
  ownerSuite: X0OwnerSuiteEvidence,
): Readonly<{
  rows: readonly X0TraceOwnerEvidence[];
  findings: readonly X0EvidenceFinding[];
}> {
  const findings: X0EvidenceFinding[] = [];
  const rows = buildTraceOwnerEvidence(
    isRecord(traceLedger) ? traceLedger : {},
    ownerSuite,
    findings,
  );
  findings.sort((left, right) =>
    compare(
      `${left.code}:${left.path}:${left.message}`,
      `${right.code}:${right.path}:${right.message}`,
    ),
  );
  return Object.freeze({ rows, findings: Object.freeze(findings) });
}

async function buildPackageProof(
  runDirectory: string,
  pre: Readonly<{
    snapshot: X0PackageInputSnapshot;
    findings: readonly X0EvidenceFinding[];
  }>,
  traceLedger: JsonRecord,
  ownerFiles: readonly string[],
  extraInputPaths: readonly string[],
): Promise<X0PackageProofReport> {
  const findings: X0EvidenceFinding[] = [...pre.findings];
  const proofDirectory = resolve(runDirectory, "package-proof");
  await mkdir(proofDirectory, { recursive: true });
  const environment = Object.freeze({ LANG: "C", LC_ALL: "C", TZ: "UTC" });
  const validator = await captureCommand(
    Object.freeze([process.execPath, "scripts/validate-x0-contract.ts"]),
    environment,
    resolve(proofDirectory, "contract-validator.stdout.log"),
    resolve(proofDirectory, "contract-validator.stderr.log"),
  );
  if (validator.exitCode !== 0) {
    addFinding(findings, "X0_EVIDENCE_CONTRACT_EXIT", "contractValidator.exitCode", "The independent X0 contract validator exited nonzero.");
  }
  const owner = await runOwnerSuite(runDirectory, ownerFiles);
  findings.push(...owner.findings);
  const traceOwnerValidation = validateX0TraceOwnerEvidence(
    traceLedger,
    owner.evidence,
  );
  findings.push(...traceOwnerValidation.findings);
  const traceOwners = traceOwnerValidation.rows;
  const post = await snapshotPackageInputs(extraInputPaths);
  findings.push(...post.findings);
  if (pre.snapshot.digest !== post.snapshot.digest) {
    addFinding(findings, "X0_EVIDENCE_PACKAGE_INPUT_DRIFT", "packageProof.input", "Package inputs changed between the pre-run and post-run snapshots.");
  }
  findings.sort((left, right) => compare(`${left.code}:${left.path}:${left.message}`, `${right.code}:${right.path}:${right.message}`));
  return Object.freeze({
    outcome: findings.length === 0 ? "pass" : "fail",
    input: Object.freeze({ pre: pre.snapshot, post: post.snapshot }),
    contractValidator: validator,
    ownerSuite: owner.evidence,
    traceOwners,
    findings: Object.freeze(findings),
  });
}

async function refreshPackageProofPostSnapshot(
  packageProof: X0PackageProofReport,
  extraInputPaths: readonly string[],
): Promise<X0PackageProofReport> {
  const post = await snapshotPackageInputs(extraInputPaths);
  const findings = [
    ...packageProof.findings.filter(
      ({ code }) => code !== "X0_EVIDENCE_PACKAGE_INPUT_DRIFT",
    ),
    ...post.findings,
  ];
  if (packageProof.input.pre.digest !== post.snapshot.digest) {
    addFinding(
      findings,
      "X0_EVIDENCE_PACKAGE_INPUT_DRIFT",
      "packageProof.input",
      "Package inputs changed between the pre-run and final post-validation snapshots.",
    );
  }
  const uniqueFindings = [
    ...new Map(
      findings.map((finding) => [
        `${finding.code}\u0000${finding.path}\u0000${finding.message}\u0000${finding.disposition}`,
        finding,
      ]),
    ).values(),
  ];
  uniqueFindings.sort((left, right) =>
    compare(
      `${left.code}:${left.path}:${left.message}`,
      `${right.code}:${right.path}:${right.message}`,
    ),
  );
  return Object.freeze({
    ...packageProof,
    outcome: uniqueFindings.length === 0 ? "pass" : "fail",
    input: Object.freeze({
      pre: packageProof.input.pre,
      post: post.snapshot,
    }),
    findings: Object.freeze(uniqueFindings),
  });
}

export function mergeX0EvidenceReports(
  automated: X0AutomatedEvidenceReport,
  humanListening: X0ListeningReport,
  packageProof: X0PackageProofReport | null = null,
): X0EvidenceReport {
  const outcome = packageProof === null || packageProof.outcome === "fail" || automated.outcome === "fail" || humanListening.outcome === "fail"
    ? "fail"
    : automated.outcome === "incomplete" || humanListening.outcome === "incomplete"
      ? "incomplete"
      : "pass";
  return Object.freeze({
    schema: X0_EVIDENCE_REPORT_SCHEMA,
    outcome,
    packageProof,
    automated,
    humanListening,
  });
}

async function readJsonArtifact(path: string): Promise<Readonly<{
  bytes: Uint8Array;
  value: JsonRecord;
  digest: X0ArtifactDigest;
}>> {
  const bytes = new Uint8Array(await readFile(path));
  const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!isRecord(value)) throw new Error(`${path} must contain one JSON object.`);
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

async function digestArtifact(path: string): Promise<X0ArtifactDigest> {
  const bytes = new Uint8Array(await readFile(path));
  return Object.freeze({ path: repoRelative(path), bytes: bytes.byteLength, sha256: canonicalSha256(bytes) });
}

async function independentlyReplayBundle(): Promise<X0BundleReplay> {
  const result = await Bun.build({
    entrypoints: [HARNESS_ENTRY],
    target: "browser",
    format: "iife",
    packages: "bundle",
    splitting: false,
    minify: false,
    sourcemap: "none",
    metafile: true,
  });
  if (!result.success || result.metafile === undefined || result.outputs.length !== 1 || result.outputs[0] === undefined) {
    throw new Error("X0_EVIDENCE_INDEPENDENT_BUNDLE_FAILED");
  }
  const bytes = new Uint8Array(await result.outputs[0].arrayBuffer());
  return Object.freeze({
    inputs: Object.freeze(Object.keys(result.metafile.inputs).map((path) => repoRelative(resolve(ROOT, path))).sort(compare)),
    bytes: bytes.byteLength,
    sha256: canonicalSha256(bytes),
  });
}

async function listeningReport(path: string): Promise<X0ListeningReport> {
  const [rubric, trace] = await Promise.all([
    readJsonArtifact(LISTENING_RUBRIC_PATH),
    readJsonArtifact(TRACE_LEDGER_PATH),
  ]);
  let evidence: unknown = null;
  try {
    evidence = (await readJsonArtifact(path)).value;
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  return validateX0ListeningEvidence(
    evidence,
    rubric.value,
    trace.value,
    canonicalSha256(rubric.bytes),
  );
}

async function assertRunDirectory(
  path: string,
): Promise<Readonly<{ path: string; runId: string }>> {
  const absolute = resolve(path);
  const parent = resolve(absolute, "..");
  const runId = relative(RUNS_ROOT, absolute).replaceAll("\\", "/");
  if (parent !== RUNS_ROOT || !SAFE_RUN_ID.test(runId)) {
    throw new Error("X0_EVIDENCE_RUN_DIRECTORY_INVALID");
  }
  const [realRunsRoot, realRunDirectory] = await Promise.all([
    realpath(RUNS_ROOT),
    realpath(absolute),
  ]);
  if (
    relative(realRunsRoot, realRunDirectory).replaceAll("\\", "/") !== runId
  ) {
    throw new Error("X0_EVIDENCE_RUN_DIRECTORY_INVALID");
  }
  return Object.freeze({ path: realRunDirectory, runId });
}

export async function verifyX0EvidenceRun(
  runDirectory: string,
  listeningEvidencePath = DEFAULT_LISTENING_PATH,
  packageProof: X0PackageProofReport | null = null,
): Promise<X0EvidenceReport> {
  const run = await assertRunDirectory(runDirectory);
  const paths = Object.freeze({
    metadata: resolve(run.path, "runner-metadata.json"),
    manifest: resolve(run.path, "input-manifest.json"),
    bundle: resolve(run.path, "harness/x0-audio-browser-harness.js"),
    playwright: resolve(run.path, "playwright-results.json"),
    output: resolve(run.path, "x0-evidence-report.json"),
  });
  const [metadata, manifest, playwright, renderMatrix, impulseGolden, traceLedger, bundleDigest, bundleReplay, humanListening] = await Promise.all([
    readJsonArtifact(paths.metadata),
    readJsonArtifact(paths.manifest),
    readJsonArtifact(paths.playwright),
    readJsonArtifact(RENDER_MATRIX_PATH),
    readJsonArtifact(IMPULSE_GOLDEN_PATH),
    readJsonArtifact(TRACE_LEDGER_PATH),
    digestArtifact(paths.bundle),
    independentlyReplayBundle(),
    listeningReport(listeningEvidencePath),
  ]);
  const currentComponents = await Promise.all(
    records(manifest.value["components"]).map((component) =>
      digestCurrentRepositoryInput(component["path"]),
    ),
  );
  const rawBrowserFiles = await Promise.all(
    X0_EXPECTED_BROWSER_PROJECTS.map(async (project) => {
      const raw = await readJsonArtifact(resolve(run.path, `${project}.json`));
      return Object.freeze({
        project,
        value: raw.value,
        artifact: raw.digest,
      });
    }),
  );
  const automated = await validateX0AutomatedEvidence({
    runnerMetadata: metadata.value,
    inputManifest: manifest.value,
    playwrightReport: playwright.value,
    renderMatrix: renderMatrix.value,
    impulseGolden: impulseGolden.value,
    traceLedger: traceLedger.value,
    artifacts: Object.freeze({
      runnerMetadata: metadata.digest,
      inputManifest: manifest.digest,
      harnessBundle: bundleDigest,
      playwrightReport: playwright.digest,
    }),
    currentComponents: Object.freeze(currentComponents),
    bundleReplay,
    rawBrowserFiles: Object.freeze(rawBrowserFiles),
  });
  const report = mergeX0EvidenceReports(automated, humanListening, packageProof);
  await atomicWrite(paths.output, stableJson(report));
  return report;
}

export async function runX0PackageEvidence(
  listeningEvidencePath = DEFAULT_LISTENING_PATH,
): Promise<X0EvidenceReport> {
  const traceLedger = await readJsonArtifact(TRACE_LEDGER_PATH);
  const ownerFiles = exactOwnerTestFiles(traceLedger.value);
  const extraInputPaths = [...ownerFiles];
  if (
    resolve(listeningEvidencePath).startsWith(`${ROOT}/`) &&
    await Bun.file(resolve(listeningEvidencePath)).exists()
  ) {
    extraInputPaths.push(repoRelative(resolve(listeningEvidencePath)));
  }
  const pre = await snapshotPackageInputs(extraInputPaths);
  const nativeRun = await runX0AudioEvidence();
  const runDirectory = resolve(
    RUNS_ROOT,
    nativeRun.metadata.runId,
  );
  const packageProof = await buildPackageProof(
    runDirectory,
    pre,
    traceLedger.value,
    ownerFiles,
    extraInputPaths,
  );
  const candidate = await verifyX0EvidenceRun(
    runDirectory,
    listeningEvidencePath,
    packageProof,
  );
  const finalPackageProof = await refreshPackageProofPostSnapshot(
    packageProof,
    extraInputPaths,
  );
  const report = mergeX0EvidenceReports(
    candidate.automated,
    candidate.humanListening,
    finalPackageProof,
  );
  await atomicWrite(
    resolve(runDirectory, "x0-evidence-report.json"),
    stableJson(report),
  );
  return report;
}

export async function runX0ExistingPackageEvidence(
  runDirectory: string,
  listeningEvidencePath = DEFAULT_LISTENING_PATH,
): Promise<X0EvidenceReport> {
  const run = await assertRunDirectory(runDirectory);
  const traceLedger = await readJsonArtifact(TRACE_LEDGER_PATH);
  const ownerFiles = exactOwnerTestFiles(traceLedger.value);
  const extraInputPaths = [...ownerFiles];
  if (
    resolve(listeningEvidencePath).startsWith(`${ROOT}/`) &&
    await Bun.file(resolve(listeningEvidencePath)).exists()
  ) {
    extraInputPaths.push(repoRelative(resolve(listeningEvidencePath)));
  }
  const pre = await snapshotPackageInputs(extraInputPaths);
  const candidate = await verifyX0EvidenceRun(
    run.path,
    listeningEvidencePath,
  );
  const packageProof = await buildPackageProof(
    run.path,
    pre,
    traceLedger.value,
    ownerFiles,
    extraInputPaths,
  );
  const report = mergeX0EvidenceReports(
    candidate.automated,
    candidate.humanListening,
    packageProof,
  );
  await atomicWrite(
    resolve(run.path, "x0-evidence-report.json"),
    stableJson(report),
  );
  return report;
}

async function main(): Promise<void> {
  const args = Bun.argv.slice(2);
  if (args.length > 2) {
    throw new Error("Usage: bun scripts/verify-x0-evidence.ts [run-directory] [listening-evidence.json]");
  }
  const report = args.length === 0
    ? await runX0PackageEvidence()
    : await runX0ExistingPackageEvidence(
      args[0] ?? "",
      args[1] === undefined ? DEFAULT_LISTENING_PATH : resolve(args[1]),
    );
  process.stdout.write(stableJson(report));
  process.exitCode = report.outcome === "pass" ? 0 : 1;
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(stableJson({
      schema: X0_EVIDENCE_REPORT_SCHEMA,
      outcome: "tool-failure",
      message: error instanceof Error ? error.message : "Unknown X0 evidence verifier failure.",
    }));
    process.exitCode = 2;
  }
}
