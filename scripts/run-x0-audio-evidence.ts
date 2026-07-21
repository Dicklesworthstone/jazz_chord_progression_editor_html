import { randomUUID } from "node:crypto";
import { isAbsolute, relative, resolve } from "node:path";

import { atomicWrite, sha256Hex, stableJson } from "./foundation-io";
import { runNodeTool } from "./run-node-tool";
import { findRealNode, type RealNodeRuntime } from "./toolchain-doctor";

export const X0_AUDIO_BUN_VERSION = "1.3.14";
export const X0_AUDIO_RUNNER_SCHEMA = "changes.evidence.x0-audio-runner.v1";
export const X0_AUDIO_INPUT_MANIFEST_SCHEMA =
  "changes.evidence.x0-audio-input-manifest.v1";
export const X0_AUDIO_ENVIRONMENT = Object.freeze({
  runId: "JCPE_X0_AUDIO_RUN_ID",
  harnessPath: "JCPE_X0_AUDIO_HARNESS_PATH",
  harnessSha256: "JCPE_X0_AUDIO_HARNESS_SHA256",
  inputDigest: "JCPE_X0_AUDIO_INPUT_DIGEST",
});

const ROOT = resolve(import.meta.dirname, "..");
const HARNESS_ENTRY = resolve(
  ROOT,
  "src/test-support/x0-audio-browser-harness.ts",
);
const PLAYWRIGHT_CONFIG = resolve(ROOT, "playwright.x0.config.ts");
const OFFLINE_RENDER_SPEC = resolve(
  ROOT,
  "tests/integration/audio-offline-render.test.ts",
);
const EVIDENCE_DRIVER_INPUTS = Object.freeze([
  resolve(ROOT, "scripts/run-x0-audio-evidence.ts"),
  PLAYWRIGHT_CONFIG,
  OFFLINE_RENDER_SPEC,
]);
const REVIEWED_AUTHORITY_INPUTS = Object.freeze([
  resolve(ROOT, "tests/fixtures/audio-engine/render-matrix.json"),
  resolve(ROOT, "tests/fixtures/audio-engine/impulse-golden.json"),
  resolve(ROOT, "tests/fixtures/audio-engine/trace-ledger.json"),
]);
const SAFE_RUN_ID = /^[A-Za-z0-9._-]{8,128}$/u;
const PLAYWRIGHT_ARGS = Object.freeze([
  "test",
  "--config",
  PLAYWRIGHT_CONFIG,
]);

export type X0AudioRunPaths = Readonly<{
  runDirectory: string;
  harnessDirectory: string;
  harnessPath: string;
  inputManifestPath: string;
  metadataPath: string;
  playwrightResultsPath: string;
}>;

type InputRole = "bundle-input" | "evidence-driver" | "reviewed-authority";

type InputComponent = Readonly<{
  path: string;
  roles: readonly InputRole[];
  bytes: number;
  sha256: string;
}>;

type InputManifest = Readonly<{
  schema: typeof X0_AUDIO_INPUT_MANIFEST_SCHEMA;
  algorithm: "sha256-component-manifest-v1";
  digest: string;
  components: readonly InputComponent[];
}>;

type BundleEvidence = Readonly<{
  path: string;
  bytes: number;
  sha256: string;
  format: "iife";
  target: "browser";
  sourceMap: "none";
  splitting: false;
}>;

type RunnerMetadata = Readonly<{
  schema: typeof X0_AUDIO_RUNNER_SCHEMA;
  runId: string;
  outcome: "prepared" | "pass" | "fail";
  bunVersion: string;
  node: RealNodeRuntime;
  playwrightVersion: string;
  inputManifest: Readonly<{
    path: string;
    algorithm: InputManifest["algorithm"];
    digest: string;
    componentCount: number;
  }>;
  bundle: BundleEvidence;
  playwright: Readonly<{
    command: readonly string[];
    configPath: string;
    resultsPath: string;
    exitCode: number | null;
    retries: 0;
    workers: 1;
    projects: readonly ["chromium", "firefox", "webkit"];
  }>;
  manualListening: Readonly<{
    performed: false;
    outcome: "not-assessed";
    reason: string;
  }>;
}>;

type PreparedRun = Readonly<{
  paths: X0AudioRunPaths;
  inputManifest: InputManifest;
  bundle: BundleEvidence;
  node: RealNodeRuntime;
  playwrightVersion: string;
}>;

function assertRunId(runId: string): void {
  if (!SAFE_RUN_ID.test(runId)) {
    throw new Error(
      "X0_AUDIO_RUN_ID_INVALID: run ID must be 8-128 safe filename characters.",
    );
  }
}

export function createX0AudioRunPaths(
  runId: string,
  root = ROOT,
): X0AudioRunPaths {
  assertRunId(runId);
  const runDirectory = resolve(
    root,
    "test-results/x0-audio-evidence-runs",
    runId,
  );
  const harnessDirectory = resolve(runDirectory, "harness");
  return Object.freeze({
    runDirectory,
    harnessDirectory,
    harnessPath: resolve(harnessDirectory, "x0-audio-browser-harness.js"),
    inputManifestPath: resolve(runDirectory, "input-manifest.json"),
    metadataPath: resolve(runDirectory, "runner-metadata.json"),
    playwrightResultsPath: resolve(runDirectory, "playwright-results.json"),
  });
}

function repoRelative(path: string): string {
  const normalized = relative(ROOT, path).replaceAll("\\", "/");
  if (
    normalized.length === 0 ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    isAbsolute(normalized)
  ) {
    throw new Error(`X0_AUDIO_INPUT_OUTSIDE_ROOT: ${path}`);
  }
  return normalized;
}

async function readPlaywrightVersion(): Promise<string> {
  const value: unknown = await Bun.file(
    resolve(ROOT, "node_modules/@playwright/test/package.json"),
  ).json();
  if (
    typeof value !== "object" ||
    value === null ||
    !("version" in value) ||
    typeof value.version !== "string" ||
    value.version.length === 0
  ) {
    throw new Error("X0_AUDIO_PLAYWRIGHT_VERSION_INVALID");
  }
  return value.version;
}

async function buildHarness(
  paths: X0AudioRunPaths,
): Promise<{ inputManifest: InputManifest; bundle: BundleEvidence }> {
  if (!(await Bun.file(HARNESS_ENTRY).exists())) {
    throw new Error(`X0_AUDIO_HARNESS_MISSING: ${repoRelative(HARNESS_ENTRY)}`);
  }

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
  if (!result.success || result.metafile === undefined) {
    const diagnostics = result.logs.map((log) => log.message).join("\n");
    throw new Error(
      `X0_AUDIO_BUNDLE_FAILED${diagnostics.length === 0 ? "" : `: ${diagnostics}`}`,
    );
  }

  const output = result.outputs[0];
  if (
    result.outputs.length !== 1 ||
    output === undefined ||
    output.kind !== "entry-point" ||
    output.sourcemap !== null
  ) {
    throw new Error(
      "X0_AUDIO_BUNDLE_SHAPE: expected one entry-point script and no side artifacts.",
    );
  }
  const outputMetadata = Object.values(result.metafile.outputs);
  if (
    outputMetadata.length !== 1 ||
    outputMetadata[0] === undefined ||
    outputMetadata[0].imports.length !== 0
  ) {
    throw new Error(
      "X0_AUDIO_BUNDLE_EXTERNAL_IMPORT: browser harness must be one self-contained script.",
    );
  }

  const inputRoles = new Map<string, Set<InputRole>>();
  const reportedBundleBytes = new Map<string, number>();
  const addRole = (path: string, role: InputRole): void => {
    const roles = inputRoles.get(path) ?? new Set<InputRole>();
    roles.add(role);
    inputRoles.set(path, roles);
  };
  for (const [inputPath, metadata] of Object.entries(result.metafile.inputs)) {
    const absolutePath = resolve(ROOT, inputPath);
    addRole(absolutePath, "bundle-input");
    reportedBundleBytes.set(absolutePath, metadata.bytes);
  }
  for (const path of EVIDENCE_DRIVER_INPUTS) {
    addRole(path, "evidence-driver");
  }
  for (const path of REVIEWED_AUTHORITY_INPUTS) {
    addRole(path, "reviewed-authority");
  }

  const components: InputComponent[] = [];
  const sortedInputPaths = [...inputRoles.keys()].sort((left, right) => {
    const leftPath = repoRelative(left);
    const rightPath = repoRelative(right);
    return leftPath < rightPath ? -1 : leftPath > rightPath ? 1 : 0;
  });
  for (const absolutePath of sortedInputPaths) {
    if (!(await Bun.file(absolutePath).exists())) {
      throw new Error(`X0_AUDIO_INPUT_MISSING: ${repoRelative(absolutePath)}`);
    }
    const bytes = new Uint8Array(await Bun.file(absolutePath).arrayBuffer());
    const reportedBytes = reportedBundleBytes.get(absolutePath);
    if (reportedBytes !== undefined && bytes.byteLength !== reportedBytes) {
      throw new Error(
        `X0_AUDIO_INPUT_CHANGED_DURING_BUNDLE: ${repoRelative(absolutePath)}`,
      );
    }
    components.push(
      Object.freeze({
        path: repoRelative(absolutePath),
        roles: Object.freeze([...(inputRoles.get(absolutePath) ?? [])]),
        bytes: bytes.byteLength,
        sha256: await sha256Hex(bytes),
      }),
    );
  }
  if (components.length === 0) {
    throw new Error("X0_AUDIO_INPUT_MANIFEST_EMPTY");
  }

  const inputManifest: InputManifest = Object.freeze({
    schema: X0_AUDIO_INPUT_MANIFEST_SCHEMA,
    algorithm: "sha256-component-manifest-v1",
    digest: await sha256Hex(stableJson(components)),
    components: Object.freeze(components),
  });
  const bundleBytes = new Uint8Array(await output.arrayBuffer());
  const bundle: BundleEvidence = Object.freeze({
    path: repoRelative(paths.harnessPath),
    bytes: bundleBytes.byteLength,
    sha256: await sha256Hex(bundleBytes),
    format: "iife",
    target: "browser",
    sourceMap: "none",
    splitting: false,
  });

  await Promise.all([
    atomicWrite(paths.inputManifestPath, stableJson(inputManifest)),
    atomicWrite(paths.harnessPath, bundleBytes),
  ]);
  return { inputManifest, bundle };
}

function metadataFor(
  runId: string,
  prepared: PreparedRun,
  exitCode: number | null,
): RunnerMetadata {
  const outcome =
    exitCode === null ? "prepared" : exitCode === 0 ? "pass" : "fail";
  return Object.freeze({
    schema: X0_AUDIO_RUNNER_SCHEMA,
    runId,
    outcome,
    bunVersion: Bun.version,
    node: prepared.node,
    playwrightVersion: prepared.playwrightVersion,
    inputManifest: Object.freeze({
      path: repoRelative(prepared.paths.inputManifestPath),
      algorithm: prepared.inputManifest.algorithm,
      digest: prepared.inputManifest.digest,
      componentCount: prepared.inputManifest.components.length,
    }),
    bundle: prepared.bundle,
    playwright: Object.freeze({
      command: Object.freeze(["node", "@playwright/test", ...PLAYWRIGHT_ARGS]),
      configPath: repoRelative(PLAYWRIGHT_CONFIG),
      resultsPath: repoRelative(prepared.paths.playwrightResultsPath),
      exitCode,
      retries: 0,
      workers: 1,
      projects: Object.freeze(["chromium", "firefox", "webkit"] as const),
    }),
    manualListening: Object.freeze({
      performed: false,
      outcome: "not-assessed",
      reason:
        "This automated runner records signal evidence only; the human listening rubric remains a separate required release gate.",
    }),
  });
}

function bindPlaywrightEnvironment(
  runId: string,
  prepared: PreparedRun,
): void {
  process.env[X0_AUDIO_ENVIRONMENT.runId] = runId;
  process.env[X0_AUDIO_ENVIRONMENT.harnessPath] = prepared.paths.harnessPath;
  process.env[X0_AUDIO_ENVIRONMENT.harnessSha256] = prepared.bundle.sha256;
  process.env[X0_AUDIO_ENVIRONMENT.inputDigest] =
    prepared.inputManifest.digest;
  process.env["TZ"] = "UTC";
  process.env["LC_ALL"] = "C";
  process.env["LANG"] = "C";
}

export async function runX0AudioEvidence(): Promise<{
  metadata: RunnerMetadata;
  exitCode: number;
}> {
  if (Bun.version !== X0_AUDIO_BUN_VERSION) {
    throw new Error(
      `X0_AUDIO_BUN_VERSION: expected ${X0_AUDIO_BUN_VERSION}, received ${Bun.version}.`,
    );
  }
  process.chdir(ROOT);
  const runId = randomUUID();
  const paths = createX0AudioRunPaths(runId);
  const [{ inputManifest, bundle }, node, playwrightVersion] =
    await Promise.all([
      buildHarness(paths),
      findRealNode(),
      readPlaywrightVersion(),
    ]);
  const prepared = Object.freeze({
    paths,
    inputManifest,
    bundle,
    node,
    playwrightVersion,
  });
  await atomicWrite(
    paths.metadataPath,
    stableJson(metadataFor(runId, prepared, null)),
  );
  bindPlaywrightEnvironment(runId, prepared);

  const exitCode = await runNodeTool("playwright", PLAYWRIGHT_ARGS);
  const metadata = metadataFor(runId, prepared, exitCode);
  await atomicWrite(paths.metadataPath, stableJson(metadata));
  return { metadata, exitCode };
}

if (import.meta.main) {
  try {
    const result = await runX0AudioEvidence();
    console.log(stableJson(result.metadata).trimEnd());
    process.exitCode = result.exitCode;
  } catch (error) {
    console.error(
      stableJson({
        schema: X0_AUDIO_RUNNER_SCHEMA,
        outcome: "tool-failure",
        message: error instanceof Error ? error.message : "Unknown X0 runner failure.",
      }).trimEnd(),
    );
    process.exitCode = 2;
  }
}
