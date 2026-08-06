/**
 * Transport truth after mid-play document replacement (jcpe-my0j).
 *
 * A run's X1 notifications echo the (documentId, planRevision) captured when
 * the plan was bound at Play. Once the document is replaced or edited
 * mid-play, that identity is superseded and A0's acceptance law rightly
 * drops every later genuine notification as stale — so before the receipt
 * settlement, a successful Stop after a mid-play library load left
 * "Stopping playback" on screen forever while the audio was in fact
 * stopped. These tests drive the REAL transport service over the fake audio
 * platform through the real controller; nothing here mocks an outcome, and
 * every expected status, code, and sentence below is written literally,
 * never imported from production.
 */
import { expect, setDefaultTimeout, test } from "bun:test";

import {
  createStudioAudio,
  createStudioController,
  loadProgressionLibraryEntry,
  seedStarterChart,
} from "../../src/application/runtime";
import type { StudioController } from "../../src/application/runtime";
import { createFakeAudioPlatform } from "../../src/test-support/fake-audio-platform";

setDefaultTimeout(30_000);

const GESTURE = Object.freeze({
  kind: "trusted-pointer",
  trusted: true,
  sequence: 1,
} as const);

/** Independent expectations for the settled surface (jcpe-my0j). */
const SUPERSEDED_CODE = "transport.plan_superseded";
const SUPERSEDED_DETAIL =
  "The chart changed during playback. Press Play to hear the current chart.";

function realController(): StudioController {
  const creation = createStudioController({
    audio: createStudioAudio(createFakeAudioPlatform().platform),
  });
  if (!creation.ok) {
    throw new Error(`controller refused: ${creation.refusal.code}`);
  }
  return creation.controller;
}

async function untilTransport(
  controller: StudioController,
  predicate: (transport: Readonly<{ status: string }>) => boolean,
  label: string,
): Promise<void> {
  for (let turn = 0; turn < 600; turn += 1) {
    if (predicate(controller.getSnapshot().transport)) return;
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 5);
    });
  }
  throw new Error(`TRANSPORT_REPLACEMENT_TEST_TIMEOUT:${label}`);
}

async function playSeededChart(controller: StudioController): Promise<void> {
  expect(seedStarterChart(controller).seeded).toBe(true);
  expect(controller.playProgression(GESTURE).ok).toBe(true);
  await untilTransport(
    controller,
    (transport) => transport.status === "playing",
    "first play",
  );
}

test("a stop after a mid-play edit settles instead of sticking at Stopping playback", async () => {
  const controller = realController();
  await playSeededChart(controller);

  // Any playback-relevant edit supersedes the sounding run's bound identity.
  expect(controller.setTempo(180).ok).toBe(true);
  expect(controller.getSnapshot().transport.status).toBe("playing");

  const stopped = controller.stopProgression();
  expect(stopped.ok).toBe(true);
  // Before the jcpe-my0j receipt settlement this stuck at "stopping"
  // forever: the genuine ready notification carried the pre-edit plan
  // revision and was dropped as stale, and refusal settlement never fired.
  await untilTransport(
    controller,
    (transport) => transport.status !== "stopping",
    "stop settlement after mid-play edit",
  );
  const transport = controller.getSnapshot().transport;
  expect(transport.status).toBe("ready");
  expect(transport.statusLabel).toBe("Audio ready");
  expect(transport.failureCode).toBe(SUPERSEDED_CODE);
  expect(transport.failureDetail).toBe(SUPERSEDED_DETAIL);
});

test("a pause after a mid-play edit settles to the transport's echoed paused state", async () => {
  const controller = realController();
  await playSeededChart(controller);
  expect(controller.setTempo(180).ok).toBe(true);

  expect(controller.pauseProgression().ok).toBe(true);
  await untilTransport(
    controller,
    (transport) => transport.status !== "stopping",
    "pause settlement after mid-play edit",
  );
  // The settled status is the receipt's echoed post-command state — the
  // transport really paused — never an invented "ready".
  const transport = controller.getSnapshot().transport;
  expect(transport.status).toBe("paused");
  expect(transport.failureCode).toBe(SUPERSEDED_CODE);
});

test("a stop with no mid-play edit still settles clean through the genuine notification", async () => {
  const controller = realController();
  await playSeededChart(controller);

  expect(controller.stopProgression().ok).toBe(true);
  await untilTransport(
    controller,
    (transport) => transport.status !== "stopping",
    "clean stop settlement",
  );
  // The genuine notification wins; the receipt settlement must land as
  // ignored-stale and may not smear a failure cause over a clean stop.
  const transport = controller.getSnapshot().transport;
  expect(transport.status).toBe("ready");
  expect(transport.failureCode).toBeNull();
});

test("loading a library entry mid-play stops playback as part of the load gesture", async () => {
  const controller = realController();
  await playSeededChart(controller);

  const result = loadProgressionLibraryEntry(controller, "pachelbel");
  expect(result.entry?.id).toBe("pachelbel");
  expect(result.cleared?.ok).toBe(true);
  expect(result.staged?.ok).toBe(true);
  expect(result.inserted?.ok).toBe(true);
  expect(result.titled?.ok).toBe(true);
  expect(result.groove?.ok).toBe(true);
  // The gesture must dispatch the explicit stop itself: the replaced chart
  // is the source of truth and the old plan may not keep sounding under it.
  expect(result.stopped).not.toBeNull();
  expect(result.stopped?.ok).toBe(true);

  await untilTransport(
    controller,
    (transport) => transport.status === "ready",
    "library-load stop settlement",
  );
  const snapshot = controller.getSnapshot();
  expect(snapshot.transport.statusLabel).toBe("Audio ready");
  /*
   * jcpe-dtvm: since the jcpe-7ftl live-groove ride, a load whose entry
   * carries a DIFFERENT groove re-performs the running transport under the
   * new style and re-stamps the bound (documentId, planRevision) mid-load.
   * The stop's genuine notification then echoes a live identity, A0
   * accepts it, and the settle is CLEAN — no superseded cause, because
   * nothing the transport reported was stale. The receipt-settlement lane
   * this suite exists for is pinned by the mid-play-edit cases above and
   * by the same-groove load below, where no ride fires.
   */
  expect(snapshot.transport.failureCode).toBeNull();
  expect(snapshot.title).toBe("Pachelbel cycle");
  expect(snapshot.chordCount).toBe(8);

  // Recovery: the next Play binds the new chart and clears the cause.
  expect(controller.playProgression(GESTURE).ok).toBe(true);
  expect(controller.getSnapshot().transport.failureCode).toBeNull();
  await untilTransport(
    controller,
    (transport) => transport.status === "playing",
    "play after library load",
  );
});

test("loading a same-groove entry mid-play still settles by receipt with the superseded cause", async () => {
  const controller = realController();
  await playSeededChart(controller);

  /*
   * jcpe-dtvm: "tristan" carries the ballad default the seeded chart is
   * already riding, so setPerformanceStyle lands ephemeral-updated, the
   * jcpe-7ftl ride never fires, and the transport stays bound to the
   * pre-load identity. The stop's genuine notification is rightly dropped
   * as stale and the jcpe-my0j receipt settlement is the only lane left —
   * this is the case that used to stick at "Stopping playback" forever.
   */
  const result = loadProgressionLibraryEntry(controller, "tristan");
  expect(result.entry?.id).toBe("tristan");
  expect(result.stopped?.ok).toBe(true);

  await untilTransport(
    controller,
    (transport) => transport.status === "ready",
    "same-groove library-load stop settlement",
  );
  const transport = controller.getSnapshot().transport;
  expect(transport.statusLabel).toBe("Audio ready");
  expect(transport.failureCode).toBe(SUPERSEDED_CODE);
  expect(transport.failureDetail).toBe(SUPERSEDED_DETAIL);

  expect(controller.playProgression(GESTURE).ok).toBe(true);
  expect(controller.getSnapshot().transport.failureCode).toBeNull();
});

test("loading a library entry while stopped dispatches no stop at all", () => {
  const controller = realController();
  expect(seedStarterChart(controller).seeded).toBe(true);

  const result = loadProgressionLibraryEntry(controller, "pachelbel");
  expect(result.entry?.id).toBe("pachelbel");
  expect(result.inserted?.ok).toBe(true);
  // No run is live, so the gesture must not disturb the transport: a stop
  // here would refuse transport.locked and smear a failure over a silent
  // studio.
  expect(result.stopped).toBeNull();
  const transport = controller.getSnapshot().transport;
  expect(transport.status).toBe("unavailable");
  expect(transport.failureCode).toBeNull();
});
