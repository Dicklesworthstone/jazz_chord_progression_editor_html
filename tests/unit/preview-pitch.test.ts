/**
 * The single-pitch preview port (jcpe-v2r-detail-yimm): the chord-detail
 * keyboard and note chips speak one tone through the same preview owner as
 * previewChord. The owner law lives in the UI (non-chord keys carry no
 * handler at all); this suite pins the application half — the port previews
 * exactly the requested pitch, refuses honestly, and never touches state.
 */
import { describe, expect, test } from "bun:test";

import {
  createStudioAudio,
  createStudioController,
} from "../../src/application/runtime";
import type { StudioController } from "../../src/application/runtime";
import { createFakeAudioPlatform } from "../../src/test-support/fake-audio-platform";

const GESTURE = Object.freeze({
  kind: "trusted-pointer",
  trusted: true,
  sequence: 1,
} as const);

function audibleController(): StudioController {
  const audio = createStudioAudio(createFakeAudioPlatform().platform);
  const creation = createStudioController({ audio });
  if (!creation.ok) {
    throw new Error(`controller refused: ${creation.refusal.code}`);
  }
  return creation.controller;
}

describe("previewPitch", () => {
  test("a valid MIDI pitch previews and leaves the document untouched", () => {
    const controller = audibleController();
    const before = controller.getSnapshot();
    const result = controller.previewPitch(60, GESTURE);
    expect(result.ok).toBe(true);
    const after = controller.getSnapshot();
    expect(after.revision).toBe(before.revision);
    expect(after.transport.status).toBe(before.transport.status);
  });

  test("an out-of-range pitch refuses without touching state", () => {
    const controller = audibleController();
    const before = controller.getSnapshot();
    for (const pitch of [-1, 128, 60.5, Number.NaN]) {
      const result = controller.previewPitch(pitch, GESTURE);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.refusal.code).toBe("u1.playback_refused");
      }
    }
    expect(controller.getSnapshot().revision).toBe(before.revision);
  });

  test("without an audio port the preview says playback is unavailable", () => {
    const creation = createStudioController({});
    if (!creation.ok) throw new Error("controller refused");
    const result = creation.controller.previewPitch(60, GESTURE);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.refusal.code).toBe("u1.playback_unavailable");
    }
  });

  test("previews at both MIDI range edges are accepted", () => {
    const controller = audibleController();
    expect(controller.previewPitch(0, GESTURE).ok).toBe(true);
    expect(controller.previewPitch(127, GESTURE).ok).toBe(true);
  });
});
