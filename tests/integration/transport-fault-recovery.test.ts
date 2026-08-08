import { describe, expect, mock, setDefaultTimeout, test } from "bun:test";

import * as realDspRenderer from "../../src/audio/dsp-renderer";

/*
 * jcpe-engine-refusal-fault-cascade-vg8h fault injection: the incident's
 * genuine trigger was a rendered attack the engine refused mid-run. Physical
 * rendered attacks are now cache-only, so the public condition below — a
 * failed renderer module load (`audio.renderer_unavailable`) — must be caught
 * by preparation before Play rather than recreating that historical fault.
 * The wrap passes every call through to the real loader unless a test flips
 * the flag, so the refusal itself is the engine's own — nothing about the
 * refusal or the transport's reaction is mocked.
 */
let failConcertGrandRendererLoads = false;
const realLoad = realDspRenderer.loadConcertGrandRenderer;
void mock.module("../../src/audio/dsp-renderer", () => ({
  ...realDspRenderer,
  loadConcertGrandRenderer: (): ReturnType<typeof realLoad> => {
    if (failConcertGrandRendererLoads) {
      return Promise.reject(
        new Error("fault-recovery induced renderer load failure"),
      );
    }
    return realLoad();
  },
}));

import { createStudioController } from "../../src/application/studio-controller";
import type { StudioController } from "../../src/application/studio-controller";
import { createStudioAudio } from "../../src/application/studio-audio";
import type { StudioAudioPort } from "../../src/application/studio-audio";
import { seedStarterChart } from "../../src/application/studio-starter-chart";
import { createFakeAudioPlatform } from "../../src/test-support/fake-audio-platform";
import type { TransportServiceNotification } from "../../src/audio";

setDefaultTimeout(240_000);

function studio(): {
  controller: StudioController;
  audio: StudioAudioPort;
  notifications: TransportServiceNotification[];
} {
  const audio = createStudioAudio(createFakeAudioPlatform().platform);
  const notifications: TransportServiceNotification[] = [];
  audio.subscribe((notification) => notifications.push(notification));
  const creation = createStudioController({ audio });
  if (!creation.ok) throw new Error("controller refused");
  return { controller: creation.controller, audio, notifications };
}

let gestureSequence = 0;
function gesture(): { kind: "trusted-pointer"; trusted: true; sequence: number } {
  gestureSequence += 1;
  return { kind: "trusted-pointer", trusted: true, sequence: gestureSequence };
}

async function untilStatus(
  notifications: readonly TransportServiceNotification[],
  status: string,
  deadlineMs = 20_000,
): Promise<boolean> {
  const start = Date.now();
  for (;;) {
    if (notifications.some((entry) => entry.status === status)) return true;
    if (Date.now() - start > deadlineMs) return false;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

async function untilFailureCode(
  controller: StudioController,
  failureCode: string,
  deadlineMs = 5_000,
): Promise<boolean> {
  const start = Date.now();
  for (;;) {
    if (controller.getSnapshot().transport.failureCode === failureCode) {
      return true;
    }
    if (Date.now() - start > deadlineMs) return false;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

describe("jcpe-engine-refusal-fault-cascade-vg8h renderer preflight recovery", () => {
  test("a renderer-load refusal stops before Play and the next press recovers", async () => {
    failConcertGrandRendererLoads = true;
    try {
      const { controller, audio, notifications } = studio();
      expect(seedStarterChart(controller).seeded).toBe(true);

      /* Preparation owns the slow renderer load. A failure must settle the
       * optimistic Play slot without submitting a cold attack. */
      const played = controller.playProgression(gesture());
      expect(played.ok).toBe(true);
      expect(
        await untilFailureCode(controller, "audio.renderer_unavailable"),
      ).toBe(true);
      expect(notifications.some((entry) => entry.status === "failed")).toBe(
        false,
      );
      expect(audio.isInitialized()).toBe(true);
      expect(audio.inspect().transport.state).toBe("ready");

      /* The renderer loads fine on the retry press; no fault recovery or
       * reload is needed because the failed run never entered transport. */
      failConcertGrandRendererLoads = false;
      notifications.length = 0;
      const retried = controller.playProgression(gesture());
      expect(retried.ok).toBe(true);
      expect(await untilStatus(notifications, "playing")).toBe(true);
      expect(notifications.some((entry) => entry.status === "failed")).toBe(
        false,
      );
      const inspection = audio.inspect();
      expect(inspection.transport.state).toBe("playing");
      expect(inspection.engine.state).toBe("ready");
    } finally {
      failConcertGrandRendererLoads = false;
    }
  });
});
