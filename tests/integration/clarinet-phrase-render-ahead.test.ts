/**
 * jcpe-clarinet-phrase-continuation-refusal-9m39: the shipped clarinet-v2
 * failed mid-chart in real browsers with transport.engine_refusal because
 * phrase render-ahead started only after the play receipt settled, while the
 * scheduler demanded the first post-warm voice within ~1.2 s. The fix is
 * two-sided: render-ahead activates concurrently with transport startup, and
 * an attack-time phrase-cache miss falls through to the stateless v2 note
 * render (a documented one-note re-attack) instead of refusing and faulting
 * the run. This test drives the REAL controller/engine/transport with the
 * fake platform's manual clock advanced like a playhead — the exact scenario
 * every stubbed-prepare suite missed.
 */
import { expect, setDefaultTimeout, test } from "bun:test";

import { createStudioController } from "../../src/application/studio-controller";
import { createStudioAudio } from "../../src/application/studio-audio";
import { seedStarterChart } from "../../src/application/studio-starter-chart";
import { createFakeAudioPlatform } from "../../src/test-support/fake-audio-platform";
import type { TransportServiceNotification } from "../../src/audio";

setDefaultTimeout(300_000);

test("clarinet full chart survives the render-ahead race under an advancing clock", async () => {
  const harness = createFakeAudioPlatform();
  const audio = createStudioAudio(harness.platform);
  const notifications: TransportServiceNotification[] = [];
  audio.subscribe((notification) => notifications.push(notification));
  const creation = createStudioController({ audio });
  if (!creation.ok) throw new Error("controller refused");
  const controller = creation.controller;
  expect(seedStarterChart(controller).seeded).toBe(true);
  expect(controller.setInstrument("clarinet").ok).toBe(true);

  const played = controller.playProgression({
    kind: "trusted-pointer",
    trusted: true,
    sequence: 1,
  });
  expect(played.ok).toBe(true);

  const start = Date.now();
  let clock = 0;
  let advancing = false;
  let outcome: "clean" | "failed" | "timeout" = "timeout";
  for (;;) {
    const snapshot = controller.getSnapshot().transport;
    if (!advancing && snapshot.status === "playing") advancing = true;
    if (advancing) {
      clock += 0.1;
      harness.contexts[harness.contexts.length - 1]?.setCurrentTime(clock);
    }
    const failed = notifications.some((entry) => entry.status === "failed");
    if (snapshot.failureCode !== null || failed) {
      outcome = "failed";
      break;
    }
    if (advancing && snapshot.status === "ready") {
      outcome = "clean";
      break;
    }
    if (Date.now() - start > 240_000 || clock > 400) break;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }

  /* The run must complete without a single refusal or fault. */
  expect(outcome).toBe("clean");
  expect(
    notifications.filter((entry) => entry.status === "failed").length,
  ).toBe(0);
});
