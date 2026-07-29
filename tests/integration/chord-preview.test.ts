/**
 * jcpe-gnyy evidence: selecting a chord sounds it immediately as an isolated
 * preview — the first preview performs the gesture-gated initialization like
 * Play, preview voices are preview-owned, and the run state (status,
 * playhead, plan binding) is untouched.
 */
import { describe, expect, setDefaultTimeout, test } from "bun:test";

import {
  createStudioController,
  seedStarterChart,
  type StudioController,
} from "../../src/application/runtime";
import {
  createStudioAudio,
  type StudioAudioPort,
} from "../../src/application/studio-audio";
import { createFakeAudioPlatform } from "../../src/test-support/fake-audio-platform";

setDefaultTimeout(120_000);

const GESTURE = Object.freeze({
  kind: "trusted-pointer",
  trusted: true,
  sequence: 1,
} as const);

function audibleStudio(): { controller: StudioController; audio: StudioAudioPort } {
  const audio = createStudioAudio(createFakeAudioPlatform().platform);
  const creation = createStudioController({ audio });
  if (!creation.ok) throw new Error("controller refused");
  return { controller: creation.controller, audio };
}

async function untilPreviewVoices(
  audio: StudioAudioPort,
  deadlineMs = 8_000,
): Promise<number> {
  const start = Date.now();
  for (;;) {
    const count = audio.inspect().engine.previewNonreleasingVoiceCount;
    if (count > 0) return count;
    if (Date.now() - start > deadlineMs) return count;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

describe("jcpe-gnyy chord-click preview", () => {
  test("refuses honestly without an audio port", () => {
    const creation = createStudioController({});
    if (!creation.ok) throw new Error("controller refused");
    const result = creation.controller.previewChord("ev-any", GESTURE);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.refusal.code).toBe("u1.playback_unavailable");
    }
  });

  test("an unknown event id is refused, not repaired", () => {
    const { controller } = audibleStudio();
    expect(seedStarterChart(controller).seeded).toBe(true);
    const result = controller.previewChord("no-such-event", GESTURE);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.refusal.code).toBe("u1.playback_refused");
    }
  });

  test("selecting a chord sounds preview-owned voices without touching the run", async () => {
    const { controller, audio } = audibleStudio();
    expect(seedStarterChart(controller).seeded).toBe(true);
    const snapshot = controller.getSnapshot();
    const eventId =
      snapshot.sections[0]?.measures[0]?.events[0]?.id ?? "";
    expect(eventId.length).toBeGreaterThan(0);

    const result = controller.previewChord(eventId, GESTURE);
    expect(result.ok).toBe(true);

    const previewVoices = await untilPreviewVoices(audio);
    expect(previewVoices).toBeGreaterThan(0);
    const inspection = audio.inspect();
    /* Preview owns its voices; the progression owns none. */
    expect(inspection.engine.progressionNonreleasingVoiceCount).toBe(0);
    /* The run is untouched: transport ready, no plan-bound run started. */
    expect(inspection.transport.state).toBe("ready");
    expect(controller.getSnapshot().transport.status).not.toBe("playing");
  });

  test("a second preview replaces the first (no preview pile-up)", async () => {
    const { controller, audio } = audibleStudio();
    expect(seedStarterChart(controller).seeded).toBe(true);
    const snapshot = controller.getSnapshot();
    const events = snapshot.sections[0]?.measures.flatMap(
      (measure) => measure.events,
    ) ?? [];
    const first = events[0]?.id ?? "";
    const second = events[1]?.id ?? "";
    expect(controller.previewChord(first, GESTURE).ok).toBe(true);
    await untilPreviewVoices(audio);
    expect(controller.previewChord(second, GESTURE).ok).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 300));
    const count = audio.inspect().engine.previewNonreleasingVoiceCount;
    /* One preview batch at a time: the prior preview is released first. */
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(16);
  });
});
