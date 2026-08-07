import { describe, expect, mock, setDefaultTimeout, test } from "bun:test";

import * as realDspRenderer from "../../src/audio/dsp-renderer";

/*
 * jcpe-engine-refusal-fault-cascade-vg8h fault injection: the incident's
 * genuine trigger was a rendered attack the engine refused mid-run. The one
 * public condition that reproduces that refusal deterministically is a failed
 * renderer module load (`audio.renderer_unavailable`, the X0-LIFE-046 lane).
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

describe("jcpe-engine-refusal-fault-cascade-vg8h refusal-fault recovery", () => {
  test("a mid-run render refusal faults the run once, and the next Play recovers", async () => {
    failConcertGrandRendererLoads = true;
    try {
      const { controller, audio, notifications } = studio();
      expect(seedStarterChart(controller).seeded).toBe(true);

      /* Starter chart plays the rendered concert-grand: the first scheduled
       * attack refuses (renderer unavailable) and the transport faults. */
      const played = controller.playProgression(gesture());
      expect(played.ok).toBe(true);
      expect(await untilStatus(notifications, "failed")).toBe(true);

      /*
       * THE FIX UNDER TEST: the fault notification must clear the port's
       * initialized flag so the contracted fault->initialize->ready edge is
       * reachable from the next user press. Before the fix this stayed true
       * and every later Play refused transport.fault_requires_initialize
       * until reload (the 2026-08-07 live incident).
       */
      expect(audio.isInitialized()).toBe(false);

      /* The renderer loads fine on the retry press. */
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

  test("no-claim companion: the transport fault latch itself is intact", async () => {
    /*
     * The fix must not relax X1: after a fault, a bare play command that
     * skips re-initialization still refuses with
     * transport.fault_requires_initialize. Recovery exists only through the
     * contracted initialize edge.
     */
    failConcertGrandRendererLoads = true;
    try {
      const { controller, audio, notifications } = studio();
      expect(seedStarterChart(controller).seeded).toBe(true);
      expect(controller.playProgression(gesture()).ok).toBe(true);
      expect(await untilStatus(notifications, "failed")).toBe(true);

      const snapshot = audio.inspect();
      expect(snapshot.transport.state).toBe("fault");

      /* Submit play directly on the port, without the initialize edge. */
      const bare = await audio.play(
        999_001,
        /* A structurally-plausible binding is irrelevant: the fault gate is
         * checked before binding validation, per the X1 admission order. */
        {
          documentId: "doc-fault-latch",
          planRevision: 1,
          plan: null,
        } as never,
        null as never,
      );
      expect(bare.termination).toBe("refusal");
      if (bare.termination === "refusal") {
        expect(bare.code).toBe("transport.fault_requires_initialize");
      }
    } finally {
      failConcertGrandRendererLoads = false;
    }
  });
});
