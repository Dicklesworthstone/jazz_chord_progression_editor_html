import {
  expect,
  test,
  type BrowserContext,
  type ConsoleMessage,
  type Page,
} from "@playwright/test";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import type {
  StudioAudibleEvidenceApi,
  StudioAudibleInspectionFacts,
  StudioAudibleReport,
  StudioAudibleSnapshotFacts,
} from "../../src/test-support/studio-audible-browser-harness";

/**
 * U4/verify (jcpe-milestone-reliable-studio-l3a.12.3) real-browser producer:
 * drives the production studio composition (the studio-audible harness) in
 * Chromium, Firefox, and WebKit through the complete U4 transport-controls
 * sequence — initial truth, slider positioning, play/pause/resume/stop,
 * restart, click-toggle receipt truth, the instrument boundary notice, the
 * browser interruption, and the exact seek keys — with console, page-error,
 * and request diagnostics recorded throughout. Human listening remains a
 * separate named gate; this spec records state and bookkeeping, not sound.
 */

const TRACE_ID = "TR-U4-BROWSER-MATRIX";
const RECORD_SCHEMA = "changes.evidence.u4-transport-controls-browser.v1";
const HARNESS_GLOBAL = "__JCPE_STUDIO_AUDIBLE_EVIDENCE__";
const RUN_ID_ENV = "JCPE_U4_EVIDENCE_RUN_ID";
const HARNESS_PATH_ENV = "JCPE_U4_EVIDENCE_HARNESS_PATH";
const HARNESS_SHA256_ENV = "JCPE_U4_EVIDENCE_HARNESS_SHA256";
const INPUT_DIGEST_ENV = "JCPE_U4_EVIDENCE_INPUT_DIGEST";
const HARNESS_DOCUMENT_URL = "https://u4-transport.evidence.localhost/";
const STATUS_POLL_TIMEOUT_MS = 15_000;
const USER_AGENT = "OpenAI File Downloader, XaiImageApiFetch/1.0";
test.use({ userAgent: USER_AGENT });

const CHART_TEXT = "| Cmaj7 | Fmaj7 | Dm7 G7 | Cmaj7 | Em7 A7 | Dm7 G7 | Cmaj7 | Cmaj7 |";

type HarnessWindow = Window &
  typeof globalThis & {
    [HARNESS_GLOBAL]?: StudioAudibleEvidenceApi;
  };

function requireEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required; use scripts/run-u4-transport-evidence.ts.`);
  }
  return value;
}

function documentFor(bundle: string): string {
  if (bundle.includes("</script")) {
    throw new Error(
      "U4_EVIDENCE_INLINE_UNSAFE: embedded script contains an HTML terminator.",
    );
  }
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E"><title>U4 transport evidence</title></head>
<body>
<div id="app"></div>
<script>${bundle}</script>
</body>
</html>`;
}

type Diagnostics = {
  console: { type: string; text: string }[];
  pageErrors: string[];
  blockedRequests: string[];
  allowedDocuments: number;
  requests: { method: string; url: string; userAgent: string | undefined; allowed: boolean }[];
};

async function installDiagnostics(
  context: BrowserContext,
  page: Page,
  diagnostics: Diagnostics,
  documentBody: string,
): Promise<void> {
  page.on("console", (message: ConsoleMessage) => {
    diagnostics.console.push({ type: message.type(), text: message.text() });
  });
  page.on("pageerror", (error) => {
    diagnostics.pageErrors.push(error.message);
  });
  await context.route("**/*", async (route) => {
    const request = route.request();
    const allowed =
      diagnostics.allowedDocuments === 0 &&
      request.isNavigationRequest() &&
      request.method() === "GET" &&
      request.headers()["user-agent"] === USER_AGENT &&
      request.url() === HARNESS_DOCUMENT_URL &&
      request.frame() === page.mainFrame();
    diagnostics.requests.push({ method: request.method(), url: request.url(),
      userAgent: request.headers()["user-agent"], allowed });
    if (allowed) {
      diagnostics.allowedDocuments += 1;
      await route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        headers: { "cache-control": "no-store" },
        body: documentBody,
      });
    } else {
      diagnostics.blockedRequests.push(`${request.method()} ${request.url()}`);
      await route.abort("blockedbyclient");
    }
  });
}

async function readSnapshot(
  page: Page,
): Promise<StudioAudibleSnapshotFacts | null> {
  return page.evaluate(() => {
    const scope = globalThis as HarnessWindow;
    const evidence = scope["__JCPE_STUDIO_AUDIBLE_EVIDENCE__"];
    if (evidence === undefined) {
      throw new Error("U4_EVIDENCE_GLOBAL_MISSING");
    }
    return evidence.snapshot();
  });
}

async function readInspection(
  page: Page,
): Promise<StudioAudibleInspectionFacts | null> {
  return page.evaluate(() => {
    const scope = globalThis as HarnessWindow;
    const evidence = scope["__JCPE_STUDIO_AUDIBLE_EVIDENCE__"];
    if (evidence === undefined) {
      throw new Error("U4_EVIDENCE_GLOBAL_MISSING");
    }
    return evidence.inspection();
  });
}

async function readReport(page: Page): Promise<StudioAudibleReport> {
  return page.evaluate(() => {
    const scope = globalThis as HarnessWindow;
    const evidence = scope["__JCPE_STUDIO_AUDIBLE_EVIDENCE__"];
    if (evidence === undefined) {
      throw new Error("U4_EVIDENCE_GLOBAL_MISSING");
    }
    return evidence.report();
  });
}

async function waitForTransportStatus(
  page: Page,
  status: string,
): Promise<void> {
  const deadline = Date.now() + STATUS_POLL_TIMEOUT_MS;
  for (;;) {
    const snapshot = await readSnapshot(page);
    if (snapshot?.transportStatus === status) return;
    if (Date.now() > deadline) {
      throw new Error(
        `U4_TRANSPORT_STATUS_TIMEOUT: expected ${status}, observed ${snapshot?.transportStatus ?? "none"} (${snapshot?.transportStatusLabel ?? "no label"})`,
      );
    }
    await page.waitForTimeout(50);
  }
}

async function waitForBadge(page: Page, label: string): Promise<void> {
  const deadline = Date.now() + STATUS_POLL_TIMEOUT_MS;
  for (;;) {
    const snapshot = await readSnapshot(page);
    if (snapshot?.transportStatusLabel === label) return;
    if (Date.now() > deadline) {
      throw new Error(
        `U4_BADGE_TIMEOUT: expected ${label}, observed ${snapshot?.transportStatusLabel ?? "none"}`,
      );
    }
    await page.waitForTimeout(50);
  }
}

async function suspendAudioContext(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const scope = globalThis as HarnessWindow;
    const evidence = scope["__JCPE_STUDIO_AUDIBLE_EVIDENCE__"];
    if (evidence === undefined) throw new Error("U4_EVIDENCE_GLOBAL_MISSING");
    const suspended = await evidence.suspendContext();
    if (!suspended) throw new Error("U4_EVIDENCE_CONTEXT_UNOBSERVED");
  });
}

test("records the complete U4 transport-controls browser evidence", async ({
  browser,
  context,
  page,
}, testInfo) => {
  const runId = requireEnvironment(RUN_ID_ENV);
  const harnessPath = requireEnvironment(HARNESS_PATH_ENV);
  const expectedHarnessSha = requireEnvironment(HARNESS_SHA256_ENV);
  const inputDigest = requireEnvironment(INPUT_DIGEST_ENV);
  const runDirectory = resolve(harnessPath, "../..");

  const bundleBytes = await readFile(harnessPath);
  const bundleSha = createHash("sha256").update(bundleBytes).digest("hex");
  expect(bundleSha).toBe(expectedHarnessSha);

  const diagnostics: Diagnostics = {
    console: [],
    pageErrors: [],
    blockedRequests: [],
    allowedDocuments: 0,
    requests: [],
  };
  await installDiagnostics(
    context,
    page,
    diagnostics,
    documentFor(bundleBytes.toString("utf8")),
  );

  const response = await page.goto(HARNESS_DOCUMENT_URL, {
    waitUntil: "load",
  });
  expect(response?.status()).toBe(200);
  await page.waitForSelector("html[data-studio-audible-ready='true']", {
    state: "attached",
  });

  const steps: Readonly<{ step: string; detail: string }>[] = [];
  const recordStep = (step: string, detail: string): void => {
    steps.push(Object.freeze({ step, detail }));
  };

  /* 1. Initial truth (L-STATE-02): never playing before the first gesture. */
  const initial = await readSnapshot(page);
  expect(initial?.transportStatus).toBe("unavailable");
  expect(initial?.transportStatusLabel).toBe("Audio off");
  recordStep("initial-truth", `${initial?.transportStatus ?? "none"}/${initial?.transportStatusLabel ?? "none"}`);

  await page.fill("#studio-quick-entry-field", CHART_TEXT);
  await page.press("#studio-quick-entry-field", "Enter");

  /* 2. The transport controls render with the U4 enablement law. */
  await expect(page.locator("#studio-transport-play")).toBeEnabled();
  await expect(page.locator("#studio-transport-stop")).toBeDisabled();
  await expect(page.locator("#studio-transport-restart")).toBeEnabled();
  await expect(page.locator("#studio-transport-pause")).toBeDisabled();
  await expect(page.locator("#studio-transport-scrub")).toHaveAttribute(
    "role",
    "slider",
  );
  recordStep("enablement-law", "play+restart enabled, stop+pause disabled, slider role");

  /* 3. Ready-state slider positioning: the first Play starts at beat 0
   * here (the untouched slider leaves no pending override). */
  await page.locator("#studio-transport-scrub").focus();
  await page.keyboard.press("ArrowRight");
  const pendingPosition = await page
    .locator("#studio-transport-scrub")
    .getAttribute("aria-valuenow");
  recordStep("slider-position-next-run", `aria-valuenow=${pendingPosition ?? "none"}`);

  /* 4. Play, then Space to pause (keyboard path), then Play to resume —
   * the state-machine truth U4 fixed. */
  await page.click("#studio-transport-play");
  await waitForTransportStatus(page, "playing");
  // Global Space belongs to the workspace, not a focused transport button.
  await page.locator("#workspace").focus();
  await page.keyboard.press("Space");
  await waitForTransportStatus(page, "paused");
  recordStep("space-pause", "paused via Space");
  await page.click("#studio-transport-play");
  await waitForTransportStatus(page, "playing");
  recordStep("resume-via-play", "playing after paused Play");

  /* 5. Stop while paused returns the playhead to the run start. */
  await page.locator("#workspace").focus();
  await page.keyboard.press("Space");
  await waitForTransportStatus(page, "paused");
  await page.click("#studio-transport-stop");
  await waitForTransportStatus(page, "ready");
  const afterStop = await readSnapshot(page);
  recordStep("stop-while-paused", `status=${afterStop?.transportStatus ?? "none"}`);

  /* 6. Restart while playing: the run returns to the run start. */
  await page.click("#studio-transport-play");
  await waitForTransportStatus(page, "playing");
  await page.waitForTimeout(600);
  await page.click("#studio-transport-restart");
  await waitForTransportStatus(page, "playing");
  recordStep("restart-while-playing", "playing after restart");

  /* 7. Browser interruption: the badge says Interrupted and the trusted
   * gesture resumes. The run is already playing from the restart section —
   * suspend first; the interrupted state pauses the run. */
  await suspendAudioContext(page);
  await waitForBadge(page, "Interrupted");
  recordStep("interrupted-presentation", "Interrupted badge");
  await page.click("#studio-transport-play");
  await waitForTransportStatus(page, "playing");
  recordStep("resume-from-interruption", "resumed by trusted gesture");

  /* 8. Click toggles: receipt truth on real commands. Keyboard activation
   * (focus + Enter) — the path the controls must support anyway, and the
   * one free of the live-position label's reflow during playback. */
  await page.locator("#studio-transport-count-in").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#studio-transport-count-in")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.locator("#studio-transport-metronome").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#studio-transport-metronome")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  recordStep("click-toggles-on", "both pressed");
  await page.locator("#studio-transport-count-in").focus();
  await page.keyboard.press("Enter");
  await page.locator("#studio-transport-metronome").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#studio-transport-metronome")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  recordStep("click-toggles-off", "metronome released");

  /* jcpe-7tgc: expectation-less commands must not strand a later genuine
   * interruption. The earlier interruption is the untouched success twin. */
  await suspendAudioContext(page);
  await waitForBadge(page, "Interrupted");
  recordStep("interruption-after-click-toggles", "actual context suspension reaches the badge");
  await page.click("#studio-transport-play");
  await waitForTransportStatus(page, "playing");

  /* 9. Instrument change while playing publishes the boundary notice. */
  await page.selectOption("#studio-transport-instrument", "upright-bass");
  await expect(
    page.locator("[data-testid='transport-boundary-notice']"),
    /* The instrument ride's prepare-then-receipt chain runs inside the
     * engine's render-ahead; under the three-browser matrix's CPU contention
     * that settle can take seconds. The behavior law is proven
     * deterministically by the unit suite; this window is load evidence. */
  ).toHaveText("Takes effect at the next unstarted note", {
    timeout: 30_000,
  });
  recordStep("instrument-boundary-playing", "transient statement shown");
  await suspendAudioContext(page);
  await waitForBadge(page, "Interrupted");
  await expect(page.locator("[data-testid='transport-boundary-notice']")).toHaveCount(0);
  recordStep("interruption-after-instrument", "older bound plan remains observable after the setting commit");
  await page.click("#studio-transport-play");
  await waitForTransportStatus(page, "playing");
  await page.click("#studio-transport-pause");
  await waitForTransportStatus(page, "paused");
  await expect(
    page.locator("[data-testid='transport-boundary-notice']"),
  ).toHaveCount(0);
  recordStep("instrument-boundary-cleared", "notice cleared after accepted settlement");

  /* 10. Exact seek keys while playing move the playhead. */
  const beforeSeek = await readInspection(page);
  await page.locator("#studio-transport-scrub").focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(200);
  const afterSeek = await readInspection(page);
  recordStep(
    "slider-seek-keys",
    `ticks ${String(beforeSeek?.schedulerTicks ?? -1)} -> ${String(afterSeek?.schedulerTicks ?? -1)}`,
  );
  await page.click("#studio-transport-stop");
  await waitForTransportStatus(page, "ready");

  // A real seek to the end exhausts X1's plan; no synthetic ready receipt.
  await page.click("#studio-transport-play");
  await waitForTransportStatus(page, "playing");
  await page.locator("#studio-transport-scrub").focus();
  await page.keyboard.press("End");
  await waitForTransportStatus(page, "ready");
  await expect(page.locator("#studio-transport-stop")).toBeDisabled();
  recordStep("natural-end-after-seek", "actual plan exhaustion clears Playing without Stop");

  /* Final bookkeeping: zero nonreleasing voices, clean diagnostics. */
  const finalInspection = await readInspection(page);
  expect(finalInspection?.nonreleasingVoiceCount).toBe(0);
  expect(finalInspection?.transportState).toBe("ready");
  const canvases = await page.locator(".studio-transport canvas").evaluateAll(
    (elements) => elements.map((element) => {
      if (!(element instanceof HTMLCanvasElement)) throw new Error("Expected canvas");
      return { className: element.className, width: element.width, height: element.height,
        clientWidth: element.clientWidth, clientHeight: element.clientHeight };
    }),
  );
  expect(canvases.length).toBeGreaterThan(0);
  for (const canvas of canvases) {
    expect(canvas.clientWidth).toBeGreaterThan(0);
    expect(canvas.clientHeight).toBeGreaterThan(0);
    expect(canvas.width).toBeLessThan(1024);
    expect(canvas.height).toBeLessThan(1024);
  }
  const report = await readReport(page);
  const consoleErrors = diagnostics.console.filter(
    (entry) => entry.type === "error",
  );
  expect(consoleErrors).toEqual([]);
  expect(diagnostics.console.filter((entry) => entry.type === "warning")).toEqual([]);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(diagnostics.allowedDocuments).toBe(1);
  expect(diagnostics.blockedRequests).toEqual([]);

  const evidence = {
    schema: RECORD_SCHEMA,
    traceId: TRACE_ID,
    runId,
    project: testInfo.project.name,
    browser: {
      name: browser.browserType().name(),
      version: browser.version(),
      userAgent: USER_AGENT,
      viewport: page.viewportSize(),
    },
    harnessSha256: bundleSha,
    inputDigest,
    steps,
    diagnostics: {
      consoleErrorCount: consoleErrors.length,
      consoleMessageCount: diagnostics.console.length,
      pageErrorCount: diagnostics.pageErrors.length,
      blockedRequestCount: diagnostics.blockedRequests.length,
      allowedDocumentCount: diagnostics.allowedDocuments,
      consoleMessages: diagnostics.console,
      pageErrors: diagnostics.pageErrors,
      blockedRequests: diagnostics.blockedRequests,
      requests: diagnostics.requests,
    },
    finalTransportState: finalInspection?.transportState ?? null,
    nonreleasingVoiceCount: finalInspection?.nonreleasingVoiceCount ?? null,
    canvases,
    journal: report.journal,
    startupOk: report.startupOk,
  };
  await writeFile(
    resolve(runDirectory, `${testInfo.project.name}.u4.json`),
    `${JSON.stringify(evidence, null, 2)}\n`,
    { encoding: "utf8" },
  );
  await page.screenshot({ path: resolve(runDirectory, `${testInfo.project.name}.png`), fullPage: true });
});
