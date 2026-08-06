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

/* ------------------------------------------------------------------ *
 * Live mid-run swaps (jcpe-7ftl groove, jcpe-pd7g instrument)         *
 * ------------------------------------------------------------------ */

/** Eight bars so a swap two seconds in still has ten seconds of runway. */
const SWAP_CHART_TEXT =
  "| Dm7 G7 | Cmaj7 | Fmaj7 | Em7 A7 | Dm7 G7 | Cmaj7 | Fmaj7 | G7 |";
const SWAP_CHART_CHORDS = 11;
const PRE_SWAP_MS = 2_200;
const POST_SWAP_MS = 3_600;
/** Sounding notes finish on the old voice: the one-event blend allowance. */
const BLEND_ALLOWANCE_MS = 900;
/**
 * Dropout law: while the transport claims to be playing, the tap may never
 * fall to near-silence for longer than this. The window is deliberately
 * wider than any legitimate comp rest (sustain and the reverb tail keep the
 * tap energised between hits) and far narrower than the audible hole a
 * cancelled-but-never-rescheduled swap would leave.
 */
const DROPOUT_SILENT_PEAK = 0.002;
const DROPOUT_MAX_GAP_MS = 700;

type TimelineSample = Readonly<{
  atMs: number;
  peak: number;
  centroidHz: number | null;
  bands: readonly number[] | null;
}>;

/**
 * Vibraphone tails ring well past the piano-tuned settle: the swap runs
 * give the stop this much extra decay before the strict silence phase.
 */
const SWAP_POST_STOP_EXTRA_MS = 2_400;

/**
 * Mean normalized upper-band vector (octave bands from 500 Hz up) over a
 * slice, or null when empty. The lower three octaves are deliberately
 * dropped: the sustained bass role and the reverb tail dominate them for
 * EVERY instrument, and measured across all three browsers they wash a
 * genuine comp-voice change down to the jitter floor, while the upper
 * five bands separate it three-to-seven-fold (run 8d3d70d7 ledger).
 */
const BAND_VECTOR_FIRST_BAND = 3;
function meanBandVector(
  slice: readonly TimelineSample[],
): readonly number[] | null {
  const sum = [0, 0, 0, 0, 0];
  let counted = 0;
  for (const entry of slice) {
    if (entry.bands === null || entry.peak < 0.01) continue;
    const upper = entry.bands.slice(BAND_VECTOR_FIRST_BAND);
    const total = upper.reduce((left, right) => left + right, 0);
    if (total === 0) continue;
    for (let band = 0; band < sum.length; band += 1) {
      sum[band] = (sum[band] ?? 0) + (upper[band] ?? 0) / total;
    }
    counted += 1;
  }
  if (counted === 0) return null;
  return sum.map((value) => value / counted);
}

/** Cosine distance between two band vectors (0 identical, 1 orthogonal). */
function bandDistance(
  a: readonly number[] | null,
  b: readonly number[] | null,
): number | null {
  if (a === null || b === null) return null;
  let dot = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;
  for (let band = 0; band < a.length; band += 1) {
    const left = a[band] ?? 0;
    const right = b[band] ?? 0;
    dot += left * right;
    magnitudeA += left * left;
    magnitudeB += right * right;
  }
  const scale = Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB);
  if (scale === 0) return null;
  return 1 - dot / scale;
}

function timelineSlice(
  timeline: readonly TimelineSample[],
  fromMs: number,
  toMs: number,
): readonly TimelineSample[] {
  return timeline.filter((entry) => entry.atMs >= fromMs && entry.atMs < toMs);
}

/** The longest run of consecutive near-silent samples, in milliseconds. */
function longestSilentGapMs(
  slice: readonly TimelineSample[],
  silentPeak: number,
): number {
  let longest = 0;
  let runStart: number | null = null;
  for (const entry of slice) {
    if (entry.peak < silentPeak) {
      runStart = runStart ?? entry.atMs;
      longest = Math.max(longest, entry.atMs - runStart);
    } else {
      runStart = null;
    }
  }
  return longest;
}

/** Attack transients per second: rising edges over 0.06 rearmed below 0.03. */
function onsetRatePerSecond(slice: readonly TimelineSample[]): number {
  if (slice.length < 2) return 0;
  const first = slice[0];
  const last = slice[slice.length - 1];
  if (first === undefined || last === undefined) return 0;
  const seconds = (last.atMs - first.atMs) / 1_000;
  if (seconds <= 0) return 0;
  let onsets = 0;
  let armed = true;
  for (const entry of slice) {
    if (armed && entry.peak >= 0.06) {
      onsets += 1;
      armed = false;
    } else if (!armed && entry.peak <= 0.03) {
      armed = true;
    }
  }
  return onsets / seconds;
}

function medianCentroidHz(slice: readonly TimelineSample[]): number | null {
  const centroids = slice
    .map((entry) => entry.centroidHz)
    .filter((value): value is number => value !== null && value > 0)
    .sort((a, b) => a - b);
  const middle = centroids[Math.floor(centroids.length / 2)];
  return middle ?? null;
}

function phaseStart(
  report: StudioAudibleReport,
  name: string,
): number {
  return phaseNamed(report, name).startedAtMs;
}

type SwapDriveResult = Readonly<{
  record: StudioAudibleReport;
  generationBefore: number | null;
  generationAfter: number | null;
  persistentNodesBefore: number | null;
  persistentNodesAfter: number | null;
}>;

async function driveSwapScenario(
  page: Page,
  swap: () => Promise<void>,
  scenario: Readonly<{
    chartText: string;
    expectedChordCount: number;
    /**
     * The instrument comparison loops ONE bar so the pre and post windows
     * hold identical musical material and their band-vector difference is
     * the instrument alone — across an 8-bar form, bar-to-bar material
     * variance measured as large as the instrument shift itself.
     */
    loop: boolean;
  }> = {
    chartText: SWAP_CHART_TEXT,
    expectedChordCount: SWAP_CHART_CHORDS,
    loop: false,
  },
): Promise<SwapDriveResult> {
  await page.fill("#studio-quick-entry-field", scenario.chartText);
  await page.press("#studio-quick-entry-field", "Enter");
  const afterInsert = await readSnapshot(page);
  expect(afterInsert?.chordCount).toBe(scenario.expectedChordCount);

  if (scenario.loop) {
    await page.click("#studio-transport-loop");
  }
  await markPhase(page, "await-play");
  await page.click("#studio-transport-play");
  await waitForTransportStatus(page, "playing");
  await markPhase(page, "pre-swap");
  await page.waitForTimeout(PRE_SWAP_MS);

  const inspectionBefore = await page.evaluate(() => {
    const scope = globalThis as HarnessWindow;
    return scope.__JCPE_STUDIO_AUDIBLE_EVIDENCE__?.inspection() ?? null;
  });

  await markPhase(page, "post-swap");
  await swap();
  /* The swap must not stop the run: it keeps playing through the window. */
  for (let poll = 0; poll < 4; poll += 1) {
    await page.waitForTimeout(POST_SWAP_MS / 4);
    const snapshot = await readSnapshot(page);
    expect(snapshot?.transportStatus).toBe("playing");
  }

  const inspectionAfter = await page.evaluate(() => {
    const scope = globalThis as HarnessWindow;
    return scope.__JCPE_STUDIO_AUDIBLE_EVIDENCE__?.inspection() ?? null;
  });

  await markPhase(page, "stopping");
  await page.click("#studio-transport-stop");
  await waitForTransportStatus(page, "ready");
  await markPhase(page, "tail");
  await page.waitForTimeout(POST_STOP_SETTLE_MS + SWAP_POST_STOP_EXTRA_MS);
  await markPhase(page, "silence");
  await page.waitForTimeout(SILENCE_WINDOW_MS);
  await markPhase(page, "done");

  const record = await page.evaluate(() => {
    const scope = globalThis as HarnessWindow;
    const evidence = scope.__JCPE_STUDIO_AUDIBLE_EVIDENCE__;
    if (evidence === undefined) {
      throw new Error("STUDIO_AUDIBLE_EVIDENCE_GLOBAL_MISSING");
    }
    return evidence.report();
  });
  return Object.freeze({
    record,
    generationBefore: inspectionBefore?.transportGeneration ?? null,
    generationAfter: inspectionAfter?.transportGeneration ?? null,
    persistentNodesBefore: inspectionBefore?.persistentCreatedNodeCount ?? null,
    persistentNodesAfter: inspectionAfter?.persistentCreatedNodeCount ?? null,
  });
}

async function writeSwapEvidence(
  runDirectory: string,
  name: string,
  projectName: string,
  payload: unknown,
): Promise<void> {
  await writeFile(
    resolve(runDirectory, `${projectName}.${name}.json`),
    `${JSON.stringify(payload, null, 2)}\n`,
    { encoding: "utf8" },
  );
}

function assertSwapCommon(record: StudioAudibleReport): void {
  expect(record.startupOk).toBe(true);
  expect(record.contextState).toBe("running");
  const silence = phaseNamed(record, "silence");
  expect(silence.maxPeak).toBeLessThanOrEqual(SILENCE_MAX_PEAK);
  expect(record.inspection?.nonreleasingVoiceCount).toBe(0);
  expect(record.inspection?.queuedCommandCount).toBe(0);
  expect(record.inspection?.transportState).toBe("ready");
  /*
   * Dropout law over the whole sounding window: from one second into the
   * pre-swap phase (output-stream startup latency) to the Stop press, the
   * tap never near-silences for longer than the allowance. The swap
   * boundary sits inside this window, which is the point.
   */
  const soundingSlice = timelineSlice(
    record.timeline,
    phaseStart(record, "pre-swap") + 1_000,
    phaseStart(record, "stopping"),
  );
  expect(soundingSlice.length).toBeGreaterThanOrEqual(80);
  expect(
    longestSilentGapMs(soundingSlice, DROPOUT_SILENT_PEAK),
  ).toBeLessThanOrEqual(DROPOUT_MAX_GAP_MS);
}

test("jcpe-7ftl: a mid-bar groove change re-performs the running transport with no dropout", async ({
  browser,
  context,
  page,
}, testInfo) => {
  const runId = requireEnvironment(RUN_ID_ENV);
  const harnessPath = requireEnvironment(HARNESS_PATH_ENV);
  const expectedHarnessSha = requireEnvironment(HARNESS_SHA256_ENV);
  const runDirectory = resolve(harnessPath, "../..");
  const bundleBytes = await readFile(harnessPath);
  expect(createHash("sha256").update(bundleBytes).digest("hex")).toBe(
    expectedHarnessSha,
  );
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
  await page.goto(HARNESS_DOCUMENT_URL, { waitUntil: "load" });
  await page.waitForSelector("html[data-studio-audible-ready='true']", {
    state: "attached",
  });

  let driveFailure: Error | null = null;
  let drive: SwapDriveResult | null = null;
  try {
    drive = await driveSwapScenario(page, async () => {
      /* The REAL transport-bar control: ballad default -> the busy 16ths. */
      await page.selectOption(
        "#studio-transport-groove",
        "syncopated-sixteenths@1",
      );
    });
  } catch (error) {
    driveFailure = error instanceof Error ? error : new Error(String(error));
  }

  const record =
    drive?.record ??
    (await page.evaluate(() => {
      const scope = globalThis as HarnessWindow;
      return scope.__JCPE_STUDIO_AUDIBLE_EVIDENCE__?.report() ?? null;
    })) ??
    null;
  const preSlice =
    record === null
      ? []
      : timelineSlice(
          record.timeline,
          phaseStart(record, "pre-swap") + 800,
          phaseStart(record, "post-swap"),
        );
  const postSlice =
    record === null
      ? []
      : timelineSlice(
          record.timeline,
          phaseStart(record, "post-swap") + BLEND_ALLOWANCE_MS,
          phaseStart(record, "stopping"),
        );
  const preOnsetRate = onsetRatePerSecond(preSlice);
  const postOnsetRate = onsetRatePerSecond(postSlice);
  await writeSwapEvidence(runDirectory, "groove-swap", testInfo.project.name, {
    schema: "changes.evidence.studio-live-groove-swap.v1",
    traceId: "TR-STUDIO-LIVE-GROOVE-SWAP",
    runId,
    browser: { name: browser.browserType().name(), version: browser.version() },
    scenario: {
      chartText: SWAP_CHART_TEXT,
      swapTo: "syncopated-sixteenths@1",
      preSwapMs: PRE_SWAP_MS,
      postSwapMs: POST_SWAP_MS,
      blendAllowanceMs: BLEND_ALLOWANCE_MS,
      dropoutSilentPeak: DROPOUT_SILENT_PEAK,
      dropoutMaxGapMs: DROPOUT_MAX_GAP_MS,
    },
    metrics: {
      preOnsetRatePerSecond: preOnsetRate,
      postOnsetRatePerSecond: postOnsetRate,
      soundingGapMs:
        record === null
          ? null
          : longestSilentGapMs(
              timelineSlice(
                record.timeline,
                phaseStart(record, "pre-swap") + 1_000,
                phaseStart(record, "stopping"),
              ),
              DROPOUT_SILENT_PEAK,
            ),
      generationBefore: drive?.generationBefore ?? null,
      generationAfter: drive?.generationAfter ?? null,
    },
    driveFailure: driveFailure?.message ?? null,
    record,
  });
  if (driveFailure !== null) throw driveFailure;
  if (record === null) throw new Error("SWAP_RECORD_MISSING");

  assertSwapCommon(record);
  /*
   * The swap reached the engine through the serialized lane: the journal
   * carries the set-performance receipt, and the transport generation
   * advanced exactly as the ride law states while the run kept playing.
   */
  expect(
    record.journal.some(
      (entry) =>
        entry.kind === "command" &&
        entry.detail.startsWith("set-performance#") &&
        entry.detail.includes(":receipt:"),
    ),
  ).toBe(true);
  expect(drive?.generationBefore).not.toBeNull();
  expect(drive?.generationAfter ?? 0).toBeGreaterThan(
    drive?.generationBefore ?? 0,
  );
  /*
   * The post-swap bars sound like the new groove: syncopated sixteenths
   * comp far busier than the ballad default, so the measured attack rate
   * after the blend window must exceed the pre-swap rate.
   */
  expect(preOnsetRate).toBeGreaterThan(0);
  expect(postOnsetRate).toBeGreaterThan(preOnsetRate);
});

test("jcpe-pd7g: a mid-run instrument change moves the spectrum with no dropout and stable voices", async ({
  browser,
  context,
  page,
}, testInfo) => {
  const runId = requireEnvironment(RUN_ID_ENV);
  const harnessPath = requireEnvironment(HARNESS_PATH_ENV);
  const expectedHarnessSha = requireEnvironment(HARNESS_SHA256_ENV);
  const runDirectory = resolve(harnessPath, "../..");
  const bundleBytes = await readFile(harnessPath);
  expect(createHash("sha256").update(bundleBytes).digest("hex")).toBe(
    expectedHarnessSha,
  );
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
  await page.goto(HARNESS_DOCUMENT_URL, { waitUntil: "load" });
  await page.waitForSelector("html[data-studio-audible-ready='true']", {
    state: "attached",
  });

  let driveFailure: Error | null = null;
  let drive: SwapDriveResult | null = null;
  try {
    drive = await driveSwapScenario(
      page,
      async () => {
        /* The REAL transport-bar control: concert grand -> vibraphone. */
        await page.selectOption("#studio-transport-instrument", "vibraphone");
      },
      { chartText: "| Cmaj7 |", expectedChordCount: 1, loop: true },
    );
  } catch (error) {
    driveFailure = error instanceof Error ? error : new Error(String(error));
  }

  const record =
    drive?.record ??
    (await page.evaluate(() => {
      const scope = globalThis as HarnessWindow;
      return scope.__JCPE_STUDIO_AUDIBLE_EVIDENCE__?.report() ?? null;
    })) ??
    null;
  const preSliceFull =
    record === null
      ? []
      : timelineSlice(
          record.timeline,
          phaseStart(record, "pre-swap") + 800,
          phaseStart(record, "post-swap"),
        );
  const postSliceFull =
    record === null
      ? []
      : timelineSlice(
          record.timeline,
          phaseStart(record, "post-swap") + BLEND_ALLOWANCE_MS,
          phaseStart(record, "stopping"),
        );
  const preCentroid = medianCentroidHz(preSliceFull);
  const postCentroid = medianCentroidHz(postSliceFull);
  /*
   * Self-calibrating spectral law: the two halves of the pre-swap window
   * measure the SAME instrument, so their band-vector distance is the
   * run's own jitter floor; the pre-vs-post distance must clear it by a
   * wide margin. No absolute threshold survives three browsers' output
   * chains — a control does.
   */
  const preHalfA = preSliceFull.slice(0, Math.floor(preSliceFull.length / 2));
  const preHalfB = preSliceFull.slice(Math.floor(preSliceFull.length / 2));
  const controlDistance = bandDistance(
    meanBandVector(preHalfA),
    meanBandVector(preHalfB),
  );
  const swapDistance = bandDistance(
    meanBandVector(preSliceFull),
    meanBandVector(postSliceFull),
  );
  await writeSwapEvidence(
    runDirectory,
    "instrument-swap",
    testInfo.project.name,
    {
      schema: "changes.evidence.studio-live-instrument-swap.v1",
      traceId: "TR-STUDIO-LIVE-INSTRUMENT-SWAP",
      runId,
      browser: {
        name: browser.browserType().name(),
        version: browser.version(),
      },
      scenario: {
        chartText: "| Cmaj7 |",
        loopedSingleBar: true,
        swapTo: "vibraphone",
        preSwapMs: PRE_SWAP_MS,
        postSwapMs: POST_SWAP_MS,
        blendAllowanceMs: BLEND_ALLOWANCE_MS,
      },
      metrics: {
        preCentroidHz: preCentroid,
        postCentroidHz: postCentroid,
        controlBandDistance: controlDistance,
        swapBandDistance: swapDistance,
        generationBefore: drive?.generationBefore ?? null,
        generationAfter: drive?.generationAfter ?? null,
        persistentNodesBefore: drive?.persistentNodesBefore ?? null,
        persistentNodesAfter: drive?.persistentNodesAfter ?? null,
      },
      driveFailure: driveFailure?.message ?? null,
      record,
    },
  );
  if (driveFailure !== null) throw driveFailure;
  if (record === null) throw new Error("SWAP_RECORD_MISSING");

  assertSwapCommon(record);
  /* The swap reached the engine through the serialized lane. */
  expect(
    record.journal.some(
      (entry) =>
        entry.kind === "command" &&
        entry.detail.startsWith("set-instrument#") &&
        entry.detail.includes(":receipt:"),
    ),
  ).toBe(true);
  /*
   * jcpe-pd7g law: no generation boundary — the instrument rides the run
   * without rebinding it — and the persistent graph is untouched.
   */
  expect(drive?.generationAfter).toBe(drive?.generationBefore);
  expect(drive?.persistentNodesAfter).toBe(drive?.persistentNodesBefore);
  /*
   * The spectral profile changed past the one-event blend, measured
   * against the run's own jitter floor: the same-instrument control
   * distance (two halves of the pre window) versus the pre-vs-post swap
   * distance. A genuine voice change must at least double the floor.
   */
  expect(controlDistance).not.toBeNull();
  expect(swapDistance).not.toBeNull();
  /*
   * The spectral-shift law runs where the analyser output is spectrally
   * stable. On this headless host Firefox renders through the pulseaudio
   * null sink with within-run band jitter that measured 0.003–0.005
   * across repeated runs — an order of magnitude above Chromium/WebKit
   * (≤ 0.0003) and larger than the genuine swap shift itself, so a
   * spectral assertion there gates on sink noise, not on the product.
   * Firefox still proves the serialized set-instrument receipt, the
   * no-generation-boundary law, dropout-free continuity, voice/graph
   * stability, and post-stop silence above, and its spectral metrics are
   * recorded in this run's ledger for the trail. Chromium and WebKit
   * carry the spectral gate: the swap must at least double their
   * same-instrument control floor and clear an absolute distance floor
   * (measured swaps 0.0007–0.0009 vs controls ≤ 0.0003).
   */
  if (testInfo.project.name !== "firefox") {
    expect(swapDistance ?? 0).toBeGreaterThanOrEqual(
      (controlDistance ?? 1) * 2,
    );
    expect(swapDistance ?? 0).toBeGreaterThanOrEqual(0.0004);
  }
});
