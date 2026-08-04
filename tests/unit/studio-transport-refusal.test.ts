/**
 * Transport refusal settlement (jcpe-e183) and cause surfacing (jcpe-uslp).
 *
 * X1 refusals are total — they publish no notification — so before the A0
 * settlement amendment the optimistic "starting"/"stopping" expectation
 * installed ahead of every command dangled forever when the command was
 * refused. These tests drive the REAL transport service over the fake audio
 * platform: every refusal below is produced by production X1 code, never a
 * mocked outcome.
 */
import { expect, setDefaultTimeout, test } from "bun:test";

import {
  createStudioAudio,
  createStudioController,
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
  throw new Error(`TRANSPORT_REFUSAL_TEST_TIMEOUT:${label}`);
}

test("a pause before audio ever starts settles back to Audio off with the locked cause", async () => {
  const controller = realController();
  expect(controller.getSnapshot().transport.status).toBe("unavailable");

  const paused = controller.pauseProgression();
  expect(paused.ok).toBe(true);

  // Before the settlement amendment this stuck at "stopping" forever.
  await untilTransport(
    controller,
    (transport) => transport.status !== "stopping",
    "pause settlement",
  );
  const transport = controller.getSnapshot().transport;
  expect(transport.status).toBe("unavailable");
  expect(transport.statusLabel).toBe("Audio off");
  expect(transport.failureCode).toBe("transport.locked");
  expect(transport.failureDetail).toBe(
    "Audio has not started yet. Press Play to start it.",
  );
});

test("a stop before audio ever starts settles identically instead of dangling", async () => {
  const controller = realController();
  const stopped = controller.stopProgression();
  expect(stopped.ok).toBe(true);
  await untilTransport(
    controller,
    (transport) => transport.status !== "stopping",
    "stop settlement",
  );
  const transport = controller.getSnapshot().transport;
  expect(transport.status).toBe("unavailable");
  expect(transport.failureCode).toBe("transport.locked");
});

test("the next command's expectation clears a settled failure cause", async () => {
  const controller = realController();
  expect(seedStarterChart(controller).seeded).toBe(true);
  expect(controller.pauseProgression().ok).toBe(true);
  await untilTransport(
    controller,
    (transport) => transport.status !== "stopping",
    "pause settlement",
  );
  expect(controller.getSnapshot().transport.failureCode).toBe(
    "transport.locked",
  );

  expect(controller.playProgression(GESTURE).ok).toBe(true);
  // The fresh expectation clears the cause immediately and the run proceeds.
  expect(controller.getSnapshot().transport.failureCode).toBeNull();
  await untilTransport(
    controller,
    (transport) => transport.status === "playing",
    "play after settled refusal",
  );
  expect(controller.getSnapshot().transport.failureCode).toBeNull();
});

test("a refused command during playback keeps the truthful playing status and names the cause", async () => {
  const controller = realController();
  expect(seedStarterChart(controller).seeded).toBe(true);
  expect(controller.playProgression(GESTURE).ok).toBe(true);
  await untilTransport(
    controller,
    (transport) => transport.status === "playing",
    "first play",
  );

  // Play while playing is refused by the X1 state machine; the settlement
  // must restore the echoed truth — still playing — not claim a failure.
  expect(controller.playProgression(GESTURE).ok).toBe(true);
  await untilTransport(
    controller,
    (transport) => transport.status !== "starting",
    "second play settlement",
  );
  const transport = controller.getSnapshot().transport;
  expect(transport.status).toBe("playing");
  expect(transport.failureCode).toBe("transport.state_invalid");
  expect(transport.failureDetail).toBe(
    "That control is not available right now. The chart is unchanged.",
  );
});
