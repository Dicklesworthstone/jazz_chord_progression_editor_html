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
  X1TransportBrowserHarness,
  X1TransportBrowserRecord,
} from "../../src/test-support/x1-transport-browser-harness";

const TRACE_ID = "TR-X1-BROWSER-MATRIX";
const RECORD_SCHEMA = "changes.evidence.x1-transport-browser-run.v1";
const HARNESS_GLOBAL = "__JCPE_X1_TRANSPORT_EVIDENCE__";
const RECORD_PROMISE_GLOBAL = "__JCPE_X1_TRANSPORT_RECORD_PROMISE__";
const RUN_ID_ENV = "JCPE_X1_TRANSPORT_RUN_ID";
const HARNESS_PATH_ENV = "JCPE_X1_TRANSPORT_HARNESS_PATH";
const HARNESS_SHA256_ENV = "JCPE_X1_TRANSPORT_HARNESS_SHA256";
const INPUT_DIGEST_ENV = "JCPE_X1_TRANSPORT_INPUT_DIGEST";
const HARNESS_DOCUMENT_URL = "https://x1-transport.evidence.localhost/";
const NATURAL_END_DEADLINE_MS = 15_000;

type HarnessWindow = Window &
  typeof globalThis & {
    __JCPE_X1_TRANSPORT_EVIDENCE__?: X1TransportBrowserHarness;
    __JCPE_X1_TRANSPORT_RECORD_PROMISE__?: Promise<X1TransportBrowserRecord>;
  };

function requireEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required; use scripts/run-x1-transport-evidence.ts.`);
  }
  return value;
}

function documentFor(bundle: string, planJson: string): string {
  if (bundle.includes("</script") || planJson.includes("</script")) {
    throw new Error(
      "X1_TRANSPORT_INLINE_UNSAFE: embedded script contains an HTML terminator.",
    );
  }
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E"><title>X1 transport evidence</title></head>
<body>
<button id="transport-evidence" type="button">Run trusted transport evidence</button>
<script>${bundle}</script>
<script>
(() => {
  "use strict";
  const payload = ${JSON.stringify(planJson)};
  const button = document.getElementById("transport-evidence");
  if (!(button instanceof HTMLButtonElement)) throw new Error("X1_EVIDENCE_BUTTON_MISSING");
  button.addEventListener("click", (event) => {
    const harness = globalThis.${HARNESS_GLOBAL};
    if (harness === undefined) throw new Error("X1_TRANSPORT_HARNESS_GLOBAL_MISSING");
    const parsed = JSON.parse(payload);
    globalThis.${RECORD_PROMISE_GLOBAL} = harness.beginTransportEvidence(event, {
      plan: parsed.plan,
      documentId: parsed.documentId,
      naturalEndDeadlineMs: ${String(NATURAL_END_DEADLINE_MS)},
    });
  }, { once: true });
  document.documentElement.dataset.x1TransportHarnessReady = "true";
})();
</script>
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

test("records the complete native X1 transport evidence", async ({
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
  const planJson = await readFile(resolve(runDirectory, "plan.json"), "utf8");

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
    documentFor(bundleBytes.toString("utf8"), planJson),
  );

  const response = await page.goto(HARNESS_DOCUMENT_URL, {
    waitUntil: "load",
  });
  expect(response?.status()).toBe(200);
  await page.waitForSelector(
    "html[data-x1-transport-harness-ready='true']",
    { state: "attached" },
  );

  await page.click("#transport-evidence");
  const record = await page.evaluate(async () => {
    const scope = globalThis as HarnessWindow;
    const promise = scope.__JCPE_X1_TRANSPORT_RECORD_PROMISE__;
    if (promise === undefined) {
      throw new Error("X1_TRANSPORT_RECORD_PROMISE_MISSING");
    }
    return await promise;
  });

  const evidence = Object.freeze({
    schema: RECORD_SCHEMA,
    traceId: TRACE_ID,
    runId,
    project: testInfo.project.name,
    browser: Object.freeze({
      name: browser.browserType().name(),
      version: browser.version(),
    }),
    harnessSha256: bundleSha,
    inputDigest,
    naturalEndDeadlineMs: NATURAL_END_DEADLINE_MS,
    diagnostics: Object.freeze({
      consoleErrorCount: diagnostics.console.filter(
        (entry) => entry.type === "error",
      ).length,
      consoleMessageCount: diagnostics.console.length,
      pageErrorCount: diagnostics.pageErrors.length,
      blockedRequestCount: diagnostics.blockedRequests.length,
      allowedDocumentCount: diagnostics.allowedDocuments,
    }),
    record,
  });
  await writeFile(
    resolve(runDirectory, `${testInfo.project.name}.json`),
    `${JSON.stringify(evidence, null, 2)}\n`,
    { encoding: "utf8" },
  );

  expect(record.schema).toBe("changes.evidence.x1-transport-browser.v1");
  expect(record.outcome).toBe("completed");
  expect(record.failureDetail).toBeNull();
  expect(record.gestureTrusted).toBe(true);
  expect(record.gestureEventType).toBe("click");
  expect(record.contextObserved).toBe(true);
  expect(record.naturalEndReached).toBe(true);

  const stepStates = record.steps.map(
    (step) => `${step.step}:${step.stateAfter}`,
  );
  expect(stepStates).toEqual([
    "initialize-transport:ready",
    "play:playing",
    "replay:playing",
    "pause:paused",
    "resume:playing",
    "start-preview:playing",
    "release-preview:playing",
    "stop:ready",
  ]);
  for (const step of record.steps) {
    expect(step.termination).toBe("receipt");
  }
  const stop = record.steps.at(-1);
  expect(stop?.noFutureAttackPostcondition).toBe(true);

  expect(record.notificationSequencesStrictlyIncreasing).toBe(true);
  expect(
    record.notifications.map((notification) => notification.status),
  ).toEqual([
    "ready",
    "playing",
    "ready",
    "playing",
    "paused",
    "playing",
    "ready",
  ]);

  expect(record.finalTransport?.state).toBe("ready");
  expect(record.finalTransport?.queuedCommandCount).toBe(0);
  expect(record.engine?.persistentCreatedNodeCount).toBe(12);
  expect(record.engine?.persistentEdgeCount).toBe(13);
  expect(record.engine?.nonreleasingVoiceCount).toBe(0);
  expect(record.engine?.debugEventsDropped).toBe(0);
  expect(record.engine?.contextState).toBe("running");

  expect(diagnostics.pageErrors).toEqual([]);
  expect(
    diagnostics.console.filter((entry) => entry.type === "error"),
  ).toEqual([]);
  expect(diagnostics.allowedDocuments).toBe(1);
  expect(diagnostics.blockedRequests).toEqual([]);

});
