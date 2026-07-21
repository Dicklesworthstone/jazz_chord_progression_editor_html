import type { Page, TestInfo } from "@playwright/test";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createServer, type Server } from "node:http";
import {
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { promisify } from "node:util";

import primitiveMatrix from "../fixtures/ui/primitive-state-matrix.json" with {
  type: "json",
};
import shellMatrix from "../fixtures/ui/shell-state-matrix.json" with {
  type: "json",
};
import traceLedger from "../fixtures/ui/trace-ledger.json" with { type: "json" };

const execFileAsync = promisify(execFile);
const root = process.cwd();
const U0_ACTION_TIMEOUT_MS = 30_000;
const U0_NAVIGATION_TIMEOUT_MS = 60_000;
const U0_SCREENSHOT_PROBE_KEY = "__jcpeU0ScreenshotProbe";
const U0_WEBKIT_SCREENSHOT_SYNC_CSP_ERROR =
  "Refused to apply a stylesheet because its hash, its nonce, or 'unsafe-inline' does not appear in the style-src directive of the Content Security Policy.";

export type U0Viewport = Readonly<{
  width: number;
  height: number;
}>;

export type U0TraceBinding = Readonly<{
  caseId: string;
  traceIds: readonly string[];
}>;

export type U0PageDiagnostics = Readonly<{
  consoleErrors: string[];
  pageErrors: string[];
  requests: Array<
    Readonly<{
      method: string;
      resourceType: string;
      url: string;
    }>
  >;
}>;

export type U0ArtifactServer = Readonly<{
  artifactBytes: number;
  artifactSha256: string;
  close: () => Promise<void>;
  origin: string;
  temporaryRoot: string;
  url: string;
}>;

export type U0GalleryServer = Readonly<{
  close: () => Promise<void>;
  origin: string;
  temporaryRoot: string;
  url: string;
}>;

export type U0CompiledBrowserHarness = Readonly<{
  bundleBytes: number;
  bundlePath: string;
  bundleSha256: string;
  close: () => Promise<void>;
  rootId: string;
  stylePaths: readonly string[];
  temporaryRoot: string;
  title: string;
}>;

export type U0BrowserHarnessConfig = Readonly<{
  entry: string;
  rootId: string;
  stylePaths?: readonly string[];
  title: string;
}>;

export type U0BrowserHarnessOpenOptions = Readonly<{
  readySelector: string;
  scenario: string;
  viewport: U0Viewport;
}>;

export type U0ScreenshotEvidence = Readonly<{
  bytes: number;
  filename: string;
  harness: Readonly<{
    browserName: string;
    consoleErrors: readonly string[];
    isolated: boolean;
    pageErrors: readonly string[];
    strictCsp: boolean;
    syncStyleInsertions: number;
    syncStyleRemovals: number;
    unexpectedStyleMutations: number;
  }>;
  sha256: string;
}>;

export type U0EvidenceCellInput = Readonly<{
  artifact: U0ArtifactServer;
  bindings: readonly U0TraceBinding[];
  browserName: string;
  cellId: string;
  diagnostics: U0PageDiagnostics;
  environment: Readonly<Record<string, boolean | number | string | null>>;
  error: string | null;
  observations: Readonly<Record<string, unknown>>;
  outcome: "pass" | "fail";
  page: Page;
  screenshots?: readonly U0ScreenshotEvidence[];
  testInfo: TestInfo;
  viewport: U0Viewport;
}>;

type TraceableCase = Readonly<{
  id: string;
  traceIds: readonly string[];
}>;

const traceableCases: readonly TraceableCase[] = [
  ...primitiveMatrix.cases,
  ...primitiveMatrix.topologyCases,
  ...primitiveMatrix.menuTopologyCases,
  ...primitiveMatrix.contrastCases,
  ...shellMatrix.viewportCases,
  ...shellMatrix.environmentCases,
  ...shellMatrix.overlayCases,
  ...shellMatrix.systemStateCases,
  ...shellMatrix.refusalCases,
];

const caseById = new Map(traceableCases.map((item) => [item.id, item]));
const traceById = new Map(traceLedger.traces.map((trace) => [trace.id, trace]));
const diagnosticsByPage = new WeakMap<Page, U0PageDiagnostics>();

function safeSegment(value: string, label: string): string {
  const normalized = value.replaceAll(/[^A-Za-z0-9._-]+/gu, "-");
  if (normalized.length === 0 || normalized.length > 180) {
    throw new Error(`${label} cannot be represented as a safe evidence filename.`);
  }
  return normalized;
}

let generatedRunId: string | undefined;

function currentRunId(): string {
  const configured = process.env["JCPE_U0_EVIDENCE_RUN_ID"];
  if (configured !== undefined && /^[A-Za-z0-9._-]{8,128}$/u.test(configured)) {
    return configured;
  }
  generatedRunId ??= safeSegment(
      `${new Date().toISOString()}-p${String(process.pid)}`,
      "Generated U0 evidence run ID",
    );
  return generatedRunId;
}

function contentType(pathname: string): string {
  if (pathname.endsWith(".html")) return "text/html; charset=utf-8";
  if (pathname.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (pathname.endsWith(".css")) return "text/css; charset=utf-8";
  return "application/octet-stream";
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => {
      if (error !== undefined) rejectClose(error);
      else resolveClose();
    });
  });
}

export function u0Binding(
  caseId: string,
  ...traceIds: readonly string[]
): U0TraceBinding {
  const fixtureCase = caseById.get(caseId);
  if (fixtureCase === undefined) {
    throw new Error(`U0_BROWSER_EVIDENCE_UNKNOWN_CASE: ${caseId}`);
  }
  if (traceIds.length === 0) {
    throw new Error(`U0_BROWSER_EVIDENCE_TRACE_REQUIRED: ${caseId}`);
  }
  for (const traceId of traceIds) {
    const trace = traceById.get(traceId);
    if (trace === undefined) {
      throw new Error(`U0_BROWSER_EVIDENCE_UNKNOWN_TRACE: ${traceId}`);
    }
    if (!fixtureCase.traceIds.includes(traceId)) {
      throw new Error(`U0_BROWSER_EVIDENCE_CASE_TRACE_MISMATCH: ${caseId}/${traceId}`);
    }
    if (!trace.caseIds.includes(caseId)) {
      throw new Error(`U0_BROWSER_EVIDENCE_TRACE_CASE_MISMATCH: ${traceId}/${caseId}`);
    }
  }
  return Object.freeze({ caseId, traceIds: Object.freeze([...traceIds]) });
}

export async function createU0ArtifactServer(): Promise<U0ArtifactServer> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "jcpe-u0-browser-evidence-"));
  const releaseRoot = join(temporaryRoot, "release");
  try {
    await execFileAsync(
      process.env["BUN_BINARY"] ?? "bun",
      ["scripts/build.ts", "--no-publish", "--out-dir", releaseRoot],
      { cwd: root },
    );
    const artifact = await readFile(join(releaseRoot, "index.html"));
    const artifactSha256 = createHash("sha256").update(artifact).digest("hex");
    const server = createServer((request, response) => {
      const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
      if (request.method === "GET" && requestUrl.pathname === "/changes.html") {
        response.writeHead(200, {
          "cache-control": "no-store",
          "content-length": artifact.byteLength,
          "content-type": contentType(requestUrl.pathname),
        });
        response.end(artifact);
        return;
      }
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
    });
    await new Promise<void>((resolveListen, rejectListen) => {
      server.once("error", rejectListen);
      server.listen(0, "127.0.0.1", resolveListen);
    });
    const address = server.address();
    if (address === null || typeof address === "string") {
      await closeServer(server);
      throw new Error("U0_BROWSER_EVIDENCE_SERVER_ADDRESS");
    }
    const origin = `http://127.0.0.1:${String(address.port)}`;
    return Object.freeze({
      artifactBytes: artifact.byteLength,
      artifactSha256,
      close: async () => {
        await closeServer(server);
        await rm(temporaryRoot, { recursive: true, force: true });
      },
      origin,
      temporaryRoot,
      url: `${origin}/changes.html`,
    });
  } catch (error) {
    await rm(temporaryRoot, { recursive: true, force: true });
    throw error;
  }
}

export async function createU0GalleryServer(): Promise<U0GalleryServer> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "jcpe-u0-gallery-evidence-"));
  try {
    await execFileAsync(
      process.env["BUN_BINARY"] ?? "bun",
      [
        "build",
        "--target=browser",
        "--outdir",
        temporaryRoot,
        "tests/visual/u0-component-gallery.html",
      ],
      { cwd: root },
    );
    const assets = new Map<string, Buffer>();
    for (const entry of await readdir(temporaryRoot, { withFileTypes: true })) {
      if (entry.isFile()) {
        assets.set(entry.name, await readFile(join(temporaryRoot, entry.name)));
      }
    }
    if (!assets.has("u0-component-gallery.html")) {
      throw new Error("U0_BROWSER_EVIDENCE_GALLERY_HTML_MISSING");
    }
    const server = createServer((request, response) => {
      const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
      const name = requestUrl.pathname === "/__tests__/u0-component-gallery"
        ? "u0-component-gallery.html"
        : requestUrl.pathname.startsWith("/__tests__/")
          ? basename(requestUrl.pathname)
          : "";
      const asset = assets.get(name);
      if (request.method !== "GET" || asset === undefined) {
        response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        response.end("Not found");
        return;
      }
      response.writeHead(200, {
        "cache-control": "no-store",
        "content-length": asset.byteLength,
        "content-type": contentType(name),
      });
      response.end(asset);
    });
    await new Promise<void>((resolveListen, rejectListen) => {
      server.once("error", rejectListen);
      server.listen(0, "127.0.0.1", resolveListen);
    });
    const address = server.address();
    if (address === null || typeof address === "string") {
      await closeServer(server);
      throw new Error("U0_BROWSER_EVIDENCE_GALLERY_SERVER_ADDRESS");
    }
    const origin = `http://127.0.0.1:${String(address.port)}`;
    return Object.freeze({
      close: async () => {
        await closeServer(server);
        await rm(temporaryRoot, { recursive: true, force: true });
      },
      origin,
      temporaryRoot,
      url: `${origin}/__tests__/u0-component-gallery`,
    });
  } catch (error) {
    await rm(temporaryRoot, { recursive: true, force: true });
    throw error;
  }
}

export async function createU0BrowserHarness(
  config: U0BrowserHarnessConfig,
): Promise<U0CompiledBrowserHarness> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "jcpe-u0-compiled-harness-"));
  try {
    await execFileAsync(
      process.env["BUN_BINARY"] ?? "bun",
      ["build", "--target=browser", "--outdir", temporaryRoot, config.entry],
      { cwd: root },
    );
    const expectedName = `${basename(config.entry).replace(/\.[^.]+$/u, "")}.js`;
    const bundlePath = join(temporaryRoot, expectedName);
    const bundle = await readFile(bundlePath);
    return Object.freeze({
      bundleBytes: bundle.byteLength,
      bundlePath,
      bundleSha256: createHash("sha256").update(bundle).digest("hex"),
      close: async () => {
        await rm(temporaryRoot, { recursive: true, force: true });
      },
      rootId: config.rootId,
      stylePaths: Object.freeze(
        (config.stylePaths ?? []).map((path) => resolve(root, path)),
      ),
      temporaryRoot,
      title: config.title,
    });
  } catch (error) {
    await rm(temporaryRoot, { recursive: true, force: true });
    throw error;
  }
}

export async function openU0BrowserHarness(
  page: Page,
  harness: U0CompiledBrowserHarness,
  options: U0BrowserHarnessOpenOptions,
): Promise<void> {
  page.setDefaultTimeout(U0_ACTION_TIMEOUT_MS);
  page.setDefaultNavigationTimeout(U0_NAVIGATION_TIMEOUT_MS);
  await page.setViewportSize(options.viewport);
  await page.setContent(`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${harness.title}</title>
      </head>
      <body>
        <div id="${harness.rootId}" data-u0-scenario="${options.scenario}"></div>
      </body>
    </html>`);
  for (const stylePath of harness.stylePaths) {
    await page.addStyleTag({ path: stylePath });
  }
  await page.addScriptTag({ path: harness.bundlePath, type: "module" });
  await page.locator(options.readySelector).waitFor({ state: "attached" });
}

export function captureU0PageDiagnostics(page: Page): U0PageDiagnostics {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const requests: U0PageDiagnostics["requests"][number][] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });
  page.on("request", (request) => {
    const parsed = new URL(request.url());
    requests.push({
      method: request.method(),
      resourceType: request.resourceType(),
      url: `${parsed.protocol}//${parsed.hostname}${parsed.pathname}`,
    });
  });
  const diagnostics = { consoleErrors, pageErrors, requests };
  diagnosticsByPage.set(page, diagnostics);
  return diagnostics;
}

export async function openU0Artifact(
  page: Page,
  artifact: U0ArtifactServer,
  viewport: U0Viewport,
): Promise<void> {
  page.setDefaultTimeout(U0_ACTION_TIMEOUT_MS);
  page.setDefaultNavigationTimeout(U0_NAVIGATION_TIMEOUT_MS);
  await page.setViewportSize(viewport);
  const response = await page.goto(artifact.url, {
    timeout: U0_NAVIGATION_TIMEOUT_MS,
    waitUntil: "load",
  });
  if (response?.status() !== 200) {
    throw new Error(`U0_BROWSER_EVIDENCE_NAVIGATION_STATUS: ${String(response?.status())}`);
  }
  await page.locator('[data-app-ready="true"]').waitFor({ state: "visible" });
}

export async function captureU0Screenshot(
  page: Page,
  testInfo: TestInfo,
  name: string,
): Promise<U0ScreenshotEvidence> {
  const diagnostics = diagnosticsByPage.get(page);
  if (diagnostics === undefined) {
    throw new Error(
      "U0_SCREENSHOT_DIAGNOSTICS_MISSING: capture page diagnostics before screenshot capture.",
    );
  }
  const consoleErrorStart = diagnostics.consoleErrors.length;
  const pageErrorStart = diagnostics.pageErrors.length;
  const strictCsp = await page.locator(
    'meta[http-equiv="Content-Security-Policy"]',
  ).count() === 1;
  await page.evaluate((probeKey) => {
    const state = {
      observer: null as MutationObserver | null,
      syncStyleInsertions: 0,
      syncStyleRemovals: 0,
      unexpectedStyleMutations: 0,
    };
    const inspect = (nodes: NodeList, mutation: "insert" | "remove"): void => {
      for (const node of nodes) {
        if (!(node instanceof HTMLStyleElement)) continue;
        if (node.textContent === "body {}") {
          if (mutation === "insert") state.syncStyleInsertions += 1;
          else state.syncStyleRemovals += 1;
        } else {
          state.unexpectedStyleMutations += 1;
        }
      }
    };
    state.observer = new MutationObserver((records) => {
      for (const record of records) {
        inspect(record.addedNodes, "insert");
        inspect(record.removedNodes, "remove");
      }
    });
    state.observer.observe(document.head, { childList: true });
    (globalThis as unknown as Record<string, unknown>)[probeKey] = state;
  }, U0_SCREENSHOT_PROBE_KEY);
  let probe: Readonly<{
    syncStyleInsertions: number;
    syncStyleRemovals: number;
    unexpectedStyleMutations: number;
  }>;
  let buffer: Buffer;
  try {
    buffer = await page.screenshot({
      animations: "allow",
      caret: "initial",
      fullPage: true,
    });
  } finally {
    await new Promise<void>((resolve) => setImmediate(resolve));
    probe = await page.evaluate((probeKey) => {
      const scope = globalThis as unknown as Record<string, unknown>;
      const state = scope[probeKey] as
        | {
          observer: MutationObserver;
          syncStyleInsertions: number;
          syncStyleRemovals: number;
          unexpectedStyleMutations: number;
        }
        | undefined;
      if (state === undefined) throw new Error("U0_SCREENSHOT_PROBE_MISSING");
      state.observer.disconnect();
      Reflect.deleteProperty(scope, probeKey);
      return {
        syncStyleInsertions: state.syncStyleInsertions,
        syncStyleRemovals: state.syncStyleRemovals,
        unexpectedStyleMutations: state.unexpectedStyleMutations,
      };
    }, U0_SCREENSHOT_PROBE_KEY);
  }
  const browserName = page.context().browser()?.browserType().name() ?? "unknown";
  const consoleErrors = diagnostics.consoleErrors.slice(consoleErrorStart);
  const pageErrors = diagnostics.pageErrors.slice(pageErrorStart);
  const expectedConsoleErrors = browserName === "webkit" && strictCsp
    ? [U0_WEBKIT_SCREENSHOT_SYNC_CSP_ERROR]
    : [];
  const expectedStyleSync = browserName === "webkit" ? 1 : 0;
  const isolated =
    JSON.stringify(consoleErrors) === JSON.stringify(expectedConsoleErrors) &&
    pageErrors.length === 0 &&
    probe.syncStyleInsertions === expectedStyleSync &&
    probe.syncStyleRemovals === expectedStyleSync &&
    probe.unexpectedStyleMutations === 0;
  if (isolated) {
    diagnostics.consoleErrors.splice(consoleErrorStart, consoleErrors.length);
  }
  const filename = `${safeSegment(name, "Screenshot name")}.png`;
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  await testInfo.attach(filename, { body: buffer, contentType: "image/png" });
  const directory = resolve(
    "test-results/u0-browser-evidence-runs",
    currentRunId(),
    "screenshots",
  );
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, filename), buffer);
  return Object.freeze({
    bytes: buffer.byteLength,
    filename,
    harness: Object.freeze({
      browserName,
      consoleErrors: Object.freeze(consoleErrors),
      isolated,
      pageErrors: Object.freeze(pageErrors),
      strictCsp,
      syncStyleInsertions: probe.syncStyleInsertions,
      syncStyleRemovals: probe.syncStyleRemovals,
      unexpectedStyleMutations: probe.unexpectedStyleMutations,
    }),
    sha256,
  });
}

export async function writeU0EvidenceCell(
  input: U0EvidenceCellInput,
): Promise<string> {
  for (const binding of input.bindings) {
    u0Binding(binding.caseId, ...binding.traceIds);
  }
  const browserVersion = input.page.context().browser()?.version() ?? "unknown";
  const record = {
    schema: "changes.ui.u0-browser-evidence-cell.v1",
    runId: currentRunId(),
    cellId: input.cellId,
    package: "U0",
    outcome: input.outcome,
    error: input.error,
    browser: { name: input.browserName, version: browserVersion },
    playwrightVersion: process.env["npm_package_devDependencies__playwright_test"] ??
      "1.61.1",
    artifact: {
      sha256: input.artifact.artifactSha256,
      bytes: input.artifact.artifactBytes,
    },
    viewport: input.viewport,
    environment: input.environment,
    bindings: input.bindings,
    observations: input.observations,
    diagnostics: input.diagnostics,
    screenshots: input.screenshots ?? [],
    producer: {
      file: relative(root, input.testInfo.file).replaceAll("\\", "/"),
      title: input.testInfo.title,
    },
    retry: input.testInfo.retry,
    repeatEachIndex: input.testInfo.repeatEachIndex,
    workerIndex: input.testInfo.workerIndex,
  };
  const directory = resolve("test-results/u0-browser-evidence-runs", currentRunId());
  await mkdir(directory, { recursive: true });
  const filename = `${safeSegment(input.cellId, "Cell ID")}-${safeSegment(input.browserName, "Browser")}.json`;
  const path = join(directory, filename);
  const handle = await open(path, "wx");
  try {
    await handle.writeFile(`${JSON.stringify(record, null, 2)}\n`, "utf8");
  } finally {
    await handle.close();
  }
  await input.testInfo.attach(filename, {
    body: Buffer.from(`${JSON.stringify(record, null, 2)}\n`),
    contentType: "application/json",
  });
  return path;
}

export function evidenceError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function basenameForEvidence(path: string): string {
  return basename(path);
}
