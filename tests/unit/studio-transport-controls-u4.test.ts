/**
 * U4/build (l3a.12.2) focused coverage: the transport-controls intents over
 * the REAL X1 transport service and the fake audio platform — no mocked
 * outcomes anywhere. Covered laws: paused Play resumes (the state-machine
 * defect this leg fixed), Restart's stop-receipt-then-play chain, click
 * toggle receipt truth, the previous/next context law, exact ready-state
 * positioning, the instrument boundary notice lifecycle, and the
 * interrupted presentation with its trusted-gesture resume.
 */
import { expect, setDefaultTimeout, test } from "bun:test";

import {
  createStudioAudio,
  createStudioController,
  seedStarterChart,
} from "../../src/application/runtime";
import type { StudioController } from "../../src/application/runtime";
import { makeBeatPosition } from "../../src/domain";
import { createFakeAudioPlatform } from "../../src/test-support/fake-audio-platform";

setDefaultTimeout(30_000);

const GESTURE = Object.freeze({
  kind: "trusted-pointer",
  trusted: true,
  sequence: 1,
} as const);

function realController(): Readonly<{
  controller: StudioController;
  fake: ReturnType<typeof createFakeAudioPlatform>;
}> {
  const fake = createFakeAudioPlatform();
  const creation = createStudioController({
    audio: createStudioAudio(fake.platform),
  });
  if (!creation.ok) {
    throw new Error(`controller refused: ${creation.refusal.code}`);
  }
  return Object.freeze({ controller: creation.controller, fake });
}

async function untilTransport(
  controller: StudioController,
  predicate: (
    transport: Readonly<{
      status: string;
      failureCode: string | null;
      statusLabel: string;
      playheadBeatLabel: string;
    }>,
  ) => boolean,
  label: string,
): Promise<void> {
  for (let turn = 0; turn < 600; turn += 1) {
    if (predicate(controller.getSnapshot().transport)) return;
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 5);
    });
  }
  throw new Error(
    `U4_TRANSPORT_TEST_TIMEOUT:${label}:${controller.getSnapshot().transport.status}:${controller.getSnapshot().transport.failureCode ?? "none"}`,
  );
}

test("play from paused resumes the run (the X1 state machine has no paused play)", async () => {
  const { controller } = realController();
  expect(seedStarterChart(controller).seeded).toBe(true);
  expect(controller.playProgression(GESTURE).ok).toBe(true);
  await untilTransport(
    controller,
    (transport) => transport.status === "playing",
    "play",
  );
  expect(controller.pauseProgression().ok).toBe(true);
  await untilTransport(
    controller,
    (transport) => transport.status === "paused",
    "pause",
  );
  /* Before U4 this dispatched X1 `play` from `paused` and refused
   * transport.state_invalid, leaving a run the user could not resume. */
  expect(controller.playProgression(GESTURE).ok).toBe(true);
  await untilTransport(
    controller,
    (transport) => transport.status === "playing",
    "resume-after-pause",
  );
  expect(controller.stopProgression().ok).toBe(true);
  await untilTransport(
    controller,
    (transport) => transport.status === "ready",
    "stop",
  );
});

test("restart while playing settles through stop into a fresh run at the run start", async () => {
  const { controller } = realController();
  expect(seedStarterChart(controller).seeded).toBe(true);
  expect(controller.playProgression(GESTURE).ok).toBe(true);
  await untilTransport(
    controller,
    (transport) => transport.status === "playing",
    "play",
  );
  expect(controller.restartProgression(GESTURE).ok).toBe(true);
  await untilTransport(
    controller,
    (transport) =>
      transport.status === "playing" && transport.playheadBeatLabel === "0/1",
    "restart-returns-to-run-start",
  );
  expect(controller.stopProgression().ok).toBe(true);
  await untilTransport(
    controller,
    (transport) => transport.status === "ready",
    "stop",
  );
});

test("restart from ready is the next play", async () => {
  const { controller } = realController();
  expect(seedStarterChart(controller).seeded).toBe(true);
  expect(controller.restartProgression(GESTURE).ok).toBe(true);
  await untilTransport(
    controller,
    (transport) => transport.status === "playing",
    "restart-from-ready",
  );
  expect(controller.stopProgression().ok).toBe(true);
  await untilTransport(
    controller,
    (transport) => transport.status === "ready",
    "stop",
  );
});

test("click toggles refuse before initialization and settle truthfully after", async () => {
  const { controller } = realController();
  expect(seedStarterChart(controller).seeded).toBe(true);
  /* Locked transport: X1 refuses set-count-in/set-metronome, and the
   * rendered flags must not move (receipt truth, never optimism). */
  expect(controller.setCountInEnabled(true).ok).toBe(true);
  expect(controller.setMetronomeEnabled(true).ok).toBe(true);
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 50);
  });
  expect(controller.readClickToggles().countInEnabled).toBe(false);
  expect(controller.readClickToggles().metronomeEnabled).toBe(false);
  expect(controller.playProgression(GESTURE).ok).toBe(true);
  await untilTransport(
    controller,
    (transport) => transport.status === "playing",
    "play",
  );
  expect(controller.setCountInEnabled(true).ok).toBe(true);
  expect(controller.setMetronomeEnabled(true).ok).toBe(true);
  for (let turn = 0; turn < 600; turn += 1) {
    const toggles = controller.readClickToggles();
    if (toggles.countInEnabled && toggles.metronomeEnabled) break;
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 5);
    });
  }
  expect(controller.readClickToggles().countInEnabled).toBe(true);
  expect(controller.readClickToggles().metronomeEnabled).toBe(true);
  expect(controller.stopProgression().ok).toBe(true);
  await untilTransport(
    controller,
    (transport) => transport.status === "ready",
    "stop",
  );
});

test("previous/next seek the playhead only while a run exists", async () => {
  const { controller } = realController();
  expect(seedStarterChart(controller).seeded).toBe(true);
  expect(controller.stepChordOrSeek("next")).toBe("selection-step");
  expect(controller.playProgression(GESTURE).ok).toBe(true);
  await untilTransport(
    controller,
    (transport) => transport.status === "playing",
    "play",
  );
  /* The starter chart writes two chords per bar: the next event starts at
   * exact beat 2. A bare seek's own notification echoes the seek's request
   * id, so the A0 acceptance law drops it as not-the-latest-expectation —
   * the committed truth lands with the next matched command; pause right
   * after the seek and the paused beat proves where the playhead went. */
  const stepped = controller.stepChordOrSeek("next");
  expect(stepped).not.toBe("selection-step");
  expect(controller.pauseProgression().ok).toBe(true);
  await untilTransport(
    controller,
    (transport) => transport.status === "paused",
    "pause-after-seek",
  );
  const label = controller.getSnapshot().transport.playheadBeatLabel;
  const [numeratorText, denominatorText] = label.split("/");
  const pausedBeat =
    Number(numeratorText) / Number(denominatorText ?? "1");
  expect(pausedBeat).toBeGreaterThanOrEqual(2);
  expect(pausedBeat).toBeLessThan(3);
  expect(controller.stopProgression().ok).toBe(true);
  await untilTransport(
    controller,
    (transport) => transport.status === "ready",
    "stop",
  );
});

test("ready-state exact seek positions the next run and Play consumes it", async () => {
  const { controller } = realController();
  expect(seedStarterChart(controller).seeded).toBe(true);
  /* A pristine studio is `unavailable` (the graph is gesture-gated); the
   * ready state the slider positions exists only after a real run
   * initialized and stopped. */
  expect(controller.playProgression(GESTURE).ok).toBe(true);
  await untilTransport(
    controller,
    (transport) => transport.status === "playing",
    "play-before-ready-positioning",
  );
  expect(controller.stopProgression().ok).toBe(true);
  await untilTransport(
    controller,
    (transport) => transport.status === "ready",
    "stop-to-ready",
  );
  const beat = makeBeatPosition({ numerator: 2, denominator: 1 });
  expect(beat.ok).toBe(true);
  if (!beat.ok) return;
  expect(controller.seekToBeat(beat.value).ok).toBe(true);
  expect(controller.readPendingRunStartBeats()).toBe(2);
  expect(controller.playProgression(GESTURE).ok).toBe(true);
  await untilTransport(
    controller,
    (transport) =>
      transport.status === "playing" && transport.playheadBeatLabel === "2/1",
    "play-from-positioned-start",
  );
  expect(controller.readPendingRunStartBeats()).toBeNull();
  expect(controller.stopProgression().ok).toBe(true);
  await untilTransport(
    controller,
    (transport) => transport.status === "ready",
    "stop",
  );
});

test("instrument change publishes the boundary notice and the next accepted notification clears it", async () => {
  const { controller } = realController();
  expect(seedStarterChart(controller).seeded).toBe(true);
  expect(controller.playProgression(GESTURE).ok).toBe(true);
  await untilTransport(
    controller,
    (transport) => transport.status === "playing",
    "play",
  );
  const live = controller.getSnapshot();
  const nextInstrument =
    live.instrumentId === "concert-grand" ? "mellow-keys" : "concert-grand";
  expect(controller.setInstrument(nextInstrument).ok).toBe(true);
  await untilTransport(
    controller,
    () =>
      controller.readInstrumentBoundaryNotice() === "next-unstarted-note",
    "boundary-notice-appears",
  );
  expect(controller.pauseProgression().ok).toBe(true);
  await untilTransport(
    controller,
    (transport) =>
      transport.status === "paused" &&
      controller.readInstrumentBoundaryNotice() === null,
    "boundary-notice-clears-on-accepted-notification",
  );
  expect(controller.stopProgression().ok).toBe(true);
  await untilTransport(
    controller,
    (transport) => transport.status === "ready",
    "stop",
  );
});

test("instrument change while stopped shows the next-play hint", () => {
  const { controller } = realController();
  expect(seedStarterChart(controller).seeded).toBe(true);
  const live = controller.getSnapshot();
  const nextInstrument =
    live.instrumentId === "concert-grand" ? "mellow-keys" : "concert-grand";
  expect(controller.setInstrument(nextInstrument).ok).toBe(true);
  expect(controller.readInstrumentBoundaryNotice()).toBe("next-play");
});

test("interruption presents Interrupted and the trusted gesture resumes", async () => {
  const { controller, fake } = realController();
  expect(seedStarterChart(controller).seeded).toBe(true);
  expect(controller.playProgression(GESTURE).ok).toBe(true);
  await untilTransport(
    controller,
    (transport) => transport.status === "playing",
    "play",
  );
  const context = fake.contexts[0];
  expect(context).toBeDefined();
  /* X1 law: gesture sequences are strictly increasing across the session;
   * the production gesture allocator mints them, so the test mints too. */
  const RESUME_GESTURE = Object.freeze({
    kind: "trusted-pointer",
    trusted: true,
    sequence: 2,
  } as const);
  context?.setState("suspended");
  await untilTransport(
    controller,
    (transport) =>
      transport.status === "paused" &&
      transport.failureCode === "transport.interrupted" &&
      transport.statusLabel === "Interrupted",
    "interrupted-presentation",
  );
  /* X1 law: resume from interrupted requires the trusted gesture receipt. */
  expect(controller.playProgression(RESUME_GESTURE).ok).toBe(true);
  await untilTransport(
    controller,
    (transport) => transport.status === "playing",
    "resume-from-interruption",
  );
  context?.setState("running");
  expect(controller.stopProgression().ok).toBe(true);
  await untilTransport(
    controller,
    (transport) => transport.status === "ready",
    "stop",
  );
});

test("stop while paused returns the playhead to the run start", async () => {
  const { controller } = realController();
  expect(seedStarterChart(controller).seeded).toBe(true);
  expect(controller.playProgression(GESTURE).ok).toBe(true);
  await untilTransport(
    controller,
    (transport) => transport.status === "playing",
    "play",
  );
  expect(controller.pauseProgression().ok).toBe(true);
  await untilTransport(
    controller,
    (transport) => transport.status === "paused",
    "pause",
  );
  expect(controller.stopProgression().ok).toBe(true);
  await untilTransport(
    controller,
    (transport) =>
      transport.status === "ready" && transport.playheadBeatLabel === "0/1",
    "stop-while-paused",
  );
});
