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
  StudioAudiblePhaseRecord,
  StudioAudibleReport,
  StudioAudibleSnapshotFacts,
} from "../../src/test-support/studio-audible-browser-harness";

/**
 * TR-STUDIO-AUDIBLE: the shipped studio composition makes sound.
 *
 * The page under test renders the production `StudioRoot` binding over a live
 * controller and the production audio composition; automation types a chart
 * into the real quick-entry field, presses the real Play button, and measures
 * amplitude at an analyser tap on the one audio context the engine created.
 * Non-zero peak amplitude while playing and digital silence after Stop are the
 * claims; a state flag alone certifies neither.
 */

const TRACE_ID = "TR-STUDIO-AUDIBLE";
const RECORD_SCHEMA = "changes.evidence.studio-audible-browser-run.v1";
const RUN_ID_ENV = "JCPE_STUDIO_AUDIBLE_RUN_ID";
const HARNESS_PATH_ENV = "JCPE_STUDIO_AUDIBLE_HARNESS_PATH";
const HARNESS_SHA256_ENV = "JCPE_STUDIO_AUDIBLE_HARNESS_SHA256";
const INPUT_DIGEST_ENV = "JCPE_STUDIO_AUDIBLE_INPUT_DIGEST";
const HARNESS_DOCUMENT_URL = "https://studio-audible.evidence.localhost/";

/** Two bars a first-time user could type: ii–V in the first, I in the second. */
const CHART_TEXT = "| Dm7 G7 | Cmaj7 |";
const EXPECTED_CHORD_COUNT = 3;

/**
 * The window has to fit INSIDE the chart's own sounding length, because Stop
 * must be exercised while the transport is still playing — a window that
 * outlives the music finds the button disabled after a natural end. Two bars
 * at the seeded 116 BPM last ~4.1 s, so 2.5 s samples the body of the run and
 * still leaves it sounding. Derived from musical time, not a wall constant:
 * if the seed tempo or the typed chart changes, revisit this number.
 */
const PLAYING_SAMPLE_MS = 2_500;
const POST_STOP_SETTLE_MS = 2_600;
const SILENCE_WINDOW_MS = 900;
const PLAYING_MIN_PEAK = 0.02;
const SILENCE_MAX_PEAK = 0.004;
const STATUS_POLL_TIMEOUT_MS = 10_000;

type HarnessWindow = Window &
  typeof globalThis & {
    __JCPE_STUDIO_AUDIBLE_EVIDENCE__?: StudioAudibleEvidenceApi;
  };

function requireEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(
      `${name} is required; use scripts/run-studio-audible-evidence.ts.`,
    );
  }
  return value;
}

function documentFor(bundle: string): string {
  if (bundle.includes("</script")) {
    throw new Error(
      "STUDIO_AUDIBLE_INLINE_UNSAFE: embedded script contains an HTML terminator.",
    );
  }
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E"><title>Studio audible evidence</title></head>
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
    const evidence = scope.__JCPE_STUDIO_AUDIBLE_EVIDENCE__;
    if (evidence === undefined) {
      throw new Error("STUDIO_AUDIBLE_EVIDENCE_GLOBAL_MISSING");
    }
    return evidence.snapshot();
  });
}

async function markPhase(page: Page, name: string): Promise<void> {
  await page.evaluate((phaseName) => {
    const scope = globalThis as HarnessWindow;
    const evidence = scope.__JCPE_STUDIO_AUDIBLE_EVIDENCE__;
    if (evidence === undefined) {
      throw new Error("STUDIO_AUDIBLE_EVIDENCE_GLOBAL_MISSING");
    }
    evidence.markPhase(phaseName);
  }, name);
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
        `STUDIO_AUDIBLE_STATUS_TIMEOUT: wanted ${status}, at ${String(snapshot?.transportStatus)}`,
      );
    }
    await page.waitForTimeout(50);
  }
}

function phaseNamed(
  report: StudioAudibleReport,
  name: string,
): StudioAudiblePhaseRecord {
  const phase = report.phases.find((candidate) => candidate.name === name);
  if (phase === undefined) {
    throw new Error(`STUDIO_AUDIBLE_PHASE_MISSING: ${name}`);
  }
  return phase;
}

test("the shipped studio composition is audibly non-silent and stops to silence", async ({
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

  /**
   * The drive sequence and the evidence write are decoupled: a run that fails
   * mid-drive must still persist the journal and phase record, because that
   * record is precisely the diagnostic that explains the failure.
   */
  let driveFailure: Error | null = null;
  try {
    const initialSnapshot = await readSnapshot(page);
    expect(initialSnapshot).not.toBeNull();
    expect(initialSnapshot?.chordCount).toBe(0);

    await page.fill("#studio-quick-entry-field", CHART_TEXT);
    await page.press("#studio-quick-entry-field", "Enter");
    const afterInsert = await readSnapshot(page);
    expect(afterInsert?.chordCount).toBe(EXPECTED_CHORD_COUNT);

    await markPhase(page, "await-play");
    await page.click("#studio-transport-play");
    await waitForTransportStatus(page, "playing");
    await markPhase(page, "playing");
    /*
     * jcpe-v31p: while the peak evidence accumulates, the chart itself must
     * show the run moving. The two-second window covers the one-second Dm7
     * bar half and enters G7, so the ordered distinct set of highlighted
     * chord ids proves the live playhead feed — a frozen first-chord
     * highlight was exactly the shipped defect.
     */
    const playingChordIds: string[] = [];
    const samplingDeadline = Date.now() + PLAYING_SAMPLE_MS;
    while (Date.now() < samplingDeadline) {
      const highlighted = await page.evaluate(() => {
        const card = document.querySelector(
          'article.studio-chord-card[data-playing="true"]',
        );
        return card?.getAttribute("data-chord-id") ?? null;
      });
      if (
        highlighted !== null &&
        playingChordIds[playingChordIds.length - 1] !== highlighted
      ) {
        playingChordIds.push(highlighted);
      }
      await page.waitForTimeout(100);
    }
    expect(playingChordIds.length).toBeGreaterThanOrEqual(2);
    /* The highlight only ever advances: no id is revisited after leaving. */
    expect(new Set(playingChordIds).size).toBe(playingChordIds.length);

    await markPhase(page, "stopping");
    await page.click("#studio-transport-stop");
    await waitForTransportStatus(page, "ready");
    await markPhase(page, "tail");
    await page.waitForTimeout(POST_STOP_SETTLE_MS);
    await markPhase(page, "silence");
    await page.waitForTimeout(SILENCE_WINDOW_MS);

    /*
     * Second full cycle on the already-initialized graph: the leak claims are
     * about repetition. Ten more plays must not create an eleventh graph, and
     * every voice the second run attacks must retire to the same silence.
     */
    await markPhase(page, "await-play-2");
    await page.click("#studio-transport-play");
    await waitForTransportStatus(page, "playing");
    await markPhase(page, "playing-2");
    await page.waitForTimeout(PLAYING_SAMPLE_MS);
    await markPhase(page, "stopping-2");
    await page.click("#studio-transport-stop");
    await waitForTransportStatus(page, "ready");
    await markPhase(page, "tail-2");
    await page.waitForTimeout(POST_STOP_SETTLE_MS);
    await markPhase(page, "silence-2");
    await page.waitForTimeout(SILENCE_WINDOW_MS);
    await markPhase(page, "done");

    /*
     * The one-click demo must travel the same draft-then-insert path typing
     * travels, landing three more chords after the existing two bars — which
     * also exercises the overfill retargeting a second insert relies on.
     */
    await page.click("#studio-quick-entry-demo-two-five-one");
    const afterDemo = await readSnapshot(page);
    expect(afterDemo?.chordCount).toBe(EXPECTED_CHORD_COUNT * 2);
  } catch (error) {
    driveFailure = error instanceof Error ? error : new Error(String(error));
  }

  const record = await page.evaluate(() => {
    const scope = globalThis as HarnessWindow;
    const evidence = scope.__JCPE_STUDIO_AUDIBLE_EVIDENCE__;
    if (evidence === undefined) {
      throw new Error("STUDIO_AUDIBLE_EVIDENCE_GLOBAL_MISSING");
    }
    return evidence.report();
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
    scenario: Object.freeze({
      chartText: CHART_TEXT,
      expectedChordCount: EXPECTED_CHORD_COUNT,
      playingSampleMs: PLAYING_SAMPLE_MS,
      postStopSettleMs: POST_STOP_SETTLE_MS,
      silenceWindowMs: SILENCE_WINDOW_MS,
      playingMinPeak: PLAYING_MIN_PEAK,
      silenceMaxPeak: SILENCE_MAX_PEAK,
    }),
    driveFailure: driveFailure === null ? null : driveFailure.message,
    diagnostics: Object.freeze({
      consoleErrorCount: diagnostics.console.filter(
        (entry) => entry.type === "error",
      ).length,
      consoleMessageCount: diagnostics.console.length,
      pageErrorCount: diagnostics.pageErrors.length,
      blockedRequestCount: diagnostics.blockedRequests.length,
      allowedDocumentCount: diagnostics.allowedDocuments,
      consoleErrors: diagnostics.console
        .filter((entry) => entry.type === "error")
        .map((entry) => entry.text),
      pageErrors: diagnostics.pageErrors,
    }),
    record,
  });
  await writeFile(
    resolve(runDirectory, `${testInfo.project.name}.json`),
    `${JSON.stringify(evidence, null, 2)}\n`,
    { encoding: "utf8" },
  );
  if (driveFailure !== null) throw driveFailure;

  expect(record.schema).toBe("changes.evidence.studio-audible-browser.v1");
  expect(record.startupOk).toBe(true);
  expect(record.startupFailure).toBeNull();
  expect(record.secureContext).toBe(true);
  expect(record.contextObserved).toBe(true);
  expect(record.contextState).toBe("running");

  const playing = phaseNamed(record, "playing");
  expect(playing.sampleCount).toBeGreaterThanOrEqual(40);
  // The rendering clock must actually advance while playing; a stalled output
  // stream reports contextState "running" and renders nothing.
  expect(playing.contextTimeStart).not.toBeNull();
  expect(playing.contextTimeEnd).not.toBeNull();
  expect(
    (playing.contextTimeEnd ?? 0) - (playing.contextTimeStart ?? 0),
  ).toBeGreaterThanOrEqual((PLAYING_SAMPLE_MS / 1_000) * 0.5);

  /*
   * The sounding window runs from the accepted Play to the end of the post-
   * Stop tail. Output-stream startup latency can shift where inside that
   * window the samples land, so the non-silence claim is made over the whole
   * window; the silence claim stays strict and phase-exact.
   */
  const stoppingPhase = phaseNamed(record, "stopping");
  const tailPhase = phaseNamed(record, "tail");
  const soundingPeak = Math.max(
    playing.maxPeak,
    stoppingPhase.maxPeak,
    tailPhase.maxPeak,
  );
  expect(soundingPeak).toBeGreaterThanOrEqual(PLAYING_MIN_PEAK);

  const silence = phaseNamed(record, "silence");
  expect(silence.sampleCount).toBeGreaterThanOrEqual(20);
  expect(silence.maxPeak).toBeLessThanOrEqual(SILENCE_MAX_PEAK);

  const soundingPeak2 = Math.max(
    phaseNamed(record, "playing-2").maxPeak,
    phaseNamed(record, "stopping-2").maxPeak,
    phaseNamed(record, "tail-2").maxPeak,
  );
  expect(soundingPeak2).toBeGreaterThanOrEqual(PLAYING_MIN_PEAK);
  const silence2 = phaseNamed(record, "silence-2");
  expect(silence2.sampleCount).toBeGreaterThanOrEqual(20);
  expect(silence2.maxPeak).toBeLessThanOrEqual(SILENCE_MAX_PEAK);

  /*
   * Leak evidence after two full play/stop cycles: the one persistent X0
   * graph (12 nodes, 13 edges) and nothing more, zero voices that failed to
   * retire, an empty command queue, and a transport back at ready.
   */
  expect(record.inspection).not.toBeNull();
  expect(record.inspection?.persistentCreatedNodeCount).toBe(12);
  expect(record.inspection?.persistentEdgeCount).toBe(13);
  expect(record.inspection?.nonreleasingVoiceCount).toBe(0);
  expect(record.inspection?.transportState).toBe("ready");
  expect(record.inspection?.queuedCommandCount).toBe(0);
  expect(record.inspection?.engineState).toBe("ready");
  expect(record.inspection?.contextState).toBe("running");

  const journalDetails = record.journal.map((entry) => entry.detail);
  expect(
    journalDetails.some((detail) => detail.includes("play#") && detail.includes(":receipt:playing")),
  ).toBe(true);
  expect(
    journalDetails.some((detail) => detail.includes("stop#") && detail.includes(":receipt:ready")),
  ).toBe(true);

  // Two typed bars plus the one-click demo's identical chart.
  expect(record.snapshot?.chordCount).toBe(EXPECTED_CHORD_COUNT * 2);
  expect(record.snapshot?.transportStatus).toBe("ready");

  expect(diagnostics.pageErrors).toEqual([]);
  expect(
    diagnostics.console.filter((entry) => entry.type === "error"),
  ).toEqual([]);
  expect(diagnostics.allowedDocuments).toBe(1);
  expect(diagnostics.blockedRequests).toEqual([]);
});
