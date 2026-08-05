/**
 * V2R-16 live mix (jcpe-v2r-live-mix-btb4): the fader's drag is audible
 * through the serialized set-mix command, the release still commits exactly
 * one undoable document step, and mute is session state that never touches
 * the stored volume. Expected values are hand-authored from the declared
 * laws — never read back from the controller.
 */
import { describe, expect, test } from "bun:test";

import {
  createStudioAudio,
  createStudioController,
  seedStarterChart,
} from "../../src/application/runtime";
import type {
  StudioAudioPort,
  StudioController,
} from "../../src/application/runtime";
import { createFakeAudioPlatform } from "../../src/test-support/fake-audio-platform";

function makeStudio(): Readonly<{
  controller: StudioController;
  audio: StudioAudioPort;
}> {
  const audio = createStudioAudio(createFakeAudioPlatform().platform);
  const creation = createStudioController({ audio });
  if (!creation.ok) {
    throw new Error(`controller refused: ${creation.refusal.code}`);
  }
  seedStarterChart(creation.controller);
  return Object.freeze({ controller: creation.controller, audio });
}

const GESTURE = Object.freeze({
  kind: "trusted-pointer" as const,
  trusted: true as const,
  sequence: 1,
});

async function settle(done: () => boolean): Promise<void> {
  /* Generous under full-suite load: the play path's engine-ready poll
   * retries at 200ms and the whole file may share a starved event loop, so
   * the cap is condition-driven headroom, never a musical cutoff. */
  for (let round = 0; round < 400; round += 1) {
    if (done()) return;
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50);
    });
  }
}

describe("V2R-16 fader ride", () => {
  test("a drag preview refuses out-of-range and non-finite values", () => {
    const { controller } = makeStudio();
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -0.01, 1.01]) {
      const result = controller.previewMasterVolume(bad);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.refusal.code).toBe("u1.master_volume_invalid");
      }
    }
  });

  test("preview never writes the document or history", () => {
    const { controller } = makeStudio();
    const before = controller.getSnapshot();
    const result = controller.previewMasterVolume(0.3);
    expect(result.ok).toBe(true);
    const after = controller.getSnapshot();
    expect(after.masterVolume).toBe(before.masterVolume);
    expect(after.revision).toBe(before.revision);
  });

  test("during a run the ride reaches the engine's mix immediately", async () => {
    const { controller, audio } = makeStudio();
    expect(controller.playProgression(GESTURE).ok).toBe(true);
    await settle(
      () => controller.getSnapshot().transport.status === "playing",
    );
    expect(controller.previewMasterVolume(0.25).ok).toBe(true);
    await settle(
      () => audio.inspect().engine.mix.masterVolume === 0.25,
    );
    expect(audio.inspect().engine.mix.masterVolume).toBe(0.25);
  });

  test("a committed volume also reaches the live engine, as one undoable step", async () => {
    const { controller, audio } = makeStudio();
    expect(controller.playProgression(GESTURE).ok).toBe(true);
    await settle(
      () => controller.getSnapshot().transport.status === "playing",
    );
    const revisionBefore = controller.getSnapshot().revision;
    expect(controller.setMasterVolume(0.4).ok).toBe(true);
    expect(controller.getSnapshot().revision).toBe(revisionBefore + 1);
    await settle(() => audio.inspect().engine.mix.masterVolume === 0.4);
    expect(audio.inspect().engine.mix.masterVolume).toBe(0.4);
    expect(controller.undo().ok).toBe(true);
    expect(
      controller.getSnapshot().masterVolume,
    ).not.toBe(0.4);
  });
});

describe("V2R-16 session mute", () => {
  test("mute rides the gain to zero and back without touching the document", async () => {
    const { controller, audio } = makeStudio();
    const stored = controller.getSnapshot().masterVolume;
    expect(controller.playProgression(GESTURE).ok).toBe(true);
    await settle(
      () => controller.getSnapshot().transport.status === "playing",
    );
    expect(controller.readMixView().muted).toBe(false);
    expect(controller.toggleMute().ok).toBe(true);
    expect(controller.readMixView().muted).toBe(true);
    await settle(() => audio.inspect().engine.mix.masterVolume === 0);
    expect(audio.inspect().engine.mix.masterVolume).toBe(0);
    expect(
      controller.getSnapshot().masterVolume,
    ).toBe(stored);

    expect(controller.toggleMute().ok).toBe(true);
    expect(controller.readMixView().muted).toBe(false);
    await settle(
      () => audio.inspect().engine.mix.masterVolume === stored,
    );
    expect(audio.inspect().engine.mix.masterVolume).toBe(stored);
  });

  test("a muted session keeps its silence through preview and commit", async () => {
    const { controller, audio } = makeStudio();
    expect(controller.playProgression(GESTURE).ok).toBe(true);
    await settle(
      () => controller.getSnapshot().transport.status === "playing",
    );
    expect(controller.toggleMute().ok).toBe(true);
    await settle(() => audio.inspect().engine.mix.masterVolume === 0);
    expect(controller.previewMasterVolume(0.9).ok).toBe(true);
    expect(controller.setMasterVolume(0.9).ok).toBe(true);
    /* The document took the commit; the engine stayed silent. */
    expect(
      controller.getSnapshot().masterVolume,
    ).toBe(0.9);
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 150);
    });
    expect(audio.inspect().engine.mix.masterVolume).toBe(0);
  });

  test("mute never enters the undo history", () => {
    const { controller } = makeStudio();
    const revision = controller.getSnapshot().revision;
    expect(controller.toggleMute().ok).toBe(true);
    expect(controller.toggleMute().ok).toBe(true);
    expect(controller.getSnapshot().revision).toBe(revision);
  });
});
