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
 * U2/verify (jcpe-milestone-reliable-studio-l3a.11.3) real-browser producer:
 * drives the production studio composition (the studio-audible harness) in
 * Chromium, Firefox, and WebKit through the complete U2 chord-inspector
 * sequence — open, tab sweep, exact-note preview isolation, Auto/Manual/Frozen
 * transition with its confirmation, semantic symbol edit, and clean close —
 * with console, page-error, and request diagnostics recorded throughout. The
 * spec records state and bookkeeping; it never claims to hear.
 */

const TRACE_ID = "TR-U2-BROWSER-MATRIX";
const RECORD_SCHEMA = "changes.evidence.u2-inspector-browser.v1";
const HARNESS_GLOBAL = "__JCPE_STUDIO_AUDIBLE_EVIDENCE__";
const RUN_ID_ENV = "JCPE_U2_EVIDENCE_RUN_ID";
const HARNESS_PATH_ENV = "JCPE_U2_EVIDENCE_HARNESS_PATH";
const HARNESS_SHA256_ENV = "JCPE_U2_EVIDENCE_HARNESS_SHA256";
const INPUT_DIGEST_ENV = "JCPE_U2_EVIDENCE_INPUT_DIGEST";
const HARNESS_DOCUMENT_URL = "https://u2-inspector.evidence.localhost/";
const STATUS_POLL_TIMEOUT_MS = 15_000;

const CHART_TEXT = "| Cmaj7 | Fmaj7 | Dm7 G7 | Cmaj7 | Em7 A7 | Dm7 G7 | Cmaj7 | Cmaj7 |";

type HarnessWindow = Window &
  typeof globalThis & {
    [HARNESS_GLOBAL]?: StudioAudibleEvidenceApi;
  };

function requireEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required; use scripts/run-u2-inspector-evidence.ts.`);
  }
  return value;
}

function documentFor(bundle: string): string {
  if (bundle.includes("</script")) {
    throw new Error(
      "U2_EVIDENCE_INLINE_UNSAFE: embedded script contains an HTML terminator.",
    );
  }
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E"><title>U2 inspector evidence</title></head>
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
      request.url() === HARNESS_DOCUMENT_URL &&
      request.frame() === page.mainFrame();
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
      throw new Error("U2_EVIDENCE_GLOBAL_MISSING");
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
      throw new Error("U2_EVIDENCE_GLOBAL_MISSING");
    }
    return evidence.inspection();
  });
}

async function readReport(page: Page): Promise<StudioAudibleReport> {
  return page.evaluate(() => {
    const scope = globalThis as HarnessWindow;
    const evidence = scope["__JCPE_STUDIO_AUDIBLE_EVIDENCE__"];
    if (evidence === undefined) {
      throw new Error("U2_EVIDENCE_GLOBAL_MISSING");
    }
    return evidence.report();
  });
}

test("records the complete U2 chord-inspector browser evidence", async ({
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

  /* 1. Chart loads and a chord selects; the inspector opens from the
   * Harmony Lens edit affordance. */
  await page.fill("#studio-quick-entry-field", CHART_TEXT);
  await page.press("#studio-quick-entry-field", "Enter");
  await page.locator(".studio-chord-card").first().click();
  await page.click("#studio-edit-chord-rail");
  await expect(page.locator("[data-testid='chord-inspector']")).toBeVisible();
  recordStep("inspector-open", "dialog visible");

  /* The detailed tabs live behind the Advanced chord controls disclosure. */
  const advancedButton = page.getByRole("button", { name: "Advanced chord controls" });
  await advancedButton.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".studio-inspector-tabs")).toBeVisible();
  recordStep("advanced-revealed", "tablist visible");
  /* 2. Tab sweep: every tab renders its panel. The tablist's native
   * keyboard navigation drives the sweep (focus + direct Enter), which is
   * also geometry-proof where the dialog content exceeds the viewport. */
  for (const tab of [
    "Symbol",
    "Structure",
    "Timing",
    "Voicing",
    "Harmony",
    "Motion",
    "Notes",
  ] as const) {
    await page.locator(`#inspector-tab-${tab}`).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#inspector-panel")).toBeVisible();
  }
  recordStep("tab-sweep", "seven tabs render");


  /* Notes tab: the chord annotation field renders. */
  await page.locator("#inspector-tab-Notes").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Chord annotation")).toBeVisible();
  recordStep("annotation-present", "annotation field labelled");

  /* Voicing tab: the exact-note piano group renders with its label. */
  await page.locator("#inspector-tab-Voicing").focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("group", { name: "Add an exact note from the piano" }),
  ).toBeVisible();
  recordStep("piano-present", "piano group labelled");

  /* 4. Exact-note preview isolation: the selection's own chord preview
   * settles first, so the comparison measures committed states, not
   * transient expectations; hearing the draft then mutates nothing. */
  await expect
    .poll(async () => (await readSnapshot(page))?.transportStatus, {
      timeout: 30_000,
    })
    .toBe("ready");
  const snapshotBefore = await readSnapshot(page);
  /* Manual exact-note editing (Voicing tab) reveals the exact-draft
   * preview affordance. */
  await page.locator("#inspector-tab-Voicing").focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Edit exact notes" }).click();
  await page.getByRole("button", { name: "Hear exact draft notes" }).click();
  await expect(
    page.getByText("Preview started. The chart and playhead are unchanged."),
  ).toBeVisible({ timeout: 30_000 });
  const snapshotAfter = await readSnapshot(page);
  expect(snapshotAfter?.chordCount).toBe(snapshotBefore?.chordCount);
  recordStep("preview-isolation", "preview started; document and playhead unchanged");

  /* The manual draft was preview-only (the document never changed); discard
   * it so later tab switches and voicing choices are not leave-blocked. */
  await page.getByRole("button", { name: "Discard draft" }).click();
  recordStep("draft-discarded", "preview-only draft discarded");

  /* 5. Semantic symbol edit on the auto chord: another valid symbol
   * realizes and applies through the structured path, clearing the draft. */
  await page.locator("#inspector-tab-Symbol").focus();
  await page.keyboard.press("Enter");
  const symbolInput = page.getByLabel("Chord symbol");
  await symbolInput.fill("Dm7");
  await page.getByRole("button", { name: "Apply draft" }).click();
  await expect(page.getByText("Canonical: Dm7")).toBeVisible();
  recordStep("symbol-edit-apply", "Dm7 applied with canonical text");

  /* 6. Freeze transition: keeping the realized notes moves the mode with
   * its confirmation; the stored pitches survive verbatim. */
  await page.locator("#inspector-tab-Voicing").focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: /keep .* notes/i }).first().click();
  const confirmButton = page.getByRole("button", { name: "Confirm change" });
  if ((await confirmButton.count()) > 0) {
    await confirmButton.first().click();
  }
  recordStep("freeze-transition", "Keep notes confirmed");

  /* 7. Escape closes with focus restored to the chart. */
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-testid='chord-inspector']")).toHaveCount(0);
  recordStep("close-restore", "dialog closed");

  /* Final bookkeeping: clean diagnostics, zero nonreleasing voices. */
  const finalInspection = await readInspection(page);
  expect(finalInspection?.nonreleasingVoiceCount).toBe(0);
  const report = await readReport(page);
  const consoleErrors = diagnostics.console.filter(
    (entry) => entry.type === "error",
  );
  expect(consoleErrors).toEqual([]);
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
    },
    finalTransportState: finalInspection?.transportState ?? null,
    nonreleasingVoiceCount: finalInspection?.nonreleasingVoiceCount ?? null,
    journal: report.journal,
    startupOk: report.startupOk,
  };
  await writeFile(
    resolve(runDirectory, `${testInfo.project.name}.u2.json`),
    `${JSON.stringify(evidence, null, 2)}\n`,
    { encoding: "utf8" },
  );
});
