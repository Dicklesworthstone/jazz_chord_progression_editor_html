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
import type {
  StudioAudioPort,
  StudioController,
} from "../../src/application/runtime";
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

async function until(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (predicate()) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("PREVIEW_PITCH_TIMEOUT");
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

  test("a newer preview supersedes slow preparation without changing the progression instrument", async () => {
    const inner = createStudioAudio(createFakeAudioPlatform().platform);
    const previewPitches: number[][] = [];
    const preparedGateSeconds: Array<readonly (number | undefined)[]> = [];
    let prepareCalls = 0;
    let holdNextPreparation = false;
    let releaseHeldPreparation = (): void => {
      throw new Error("PREVIEW_PREPARATION_GATE_UNINITIALIZED");
    };
    let heldPreparation = Promise.resolve();
    const resetGate = (): void => {
      heldPreparation = new Promise<void>((resolve) => {
        releaseHeldPreparation = resolve;
      });
    };
    resetGate();
    let instrumentCalls = 0;
    const port: StudioAudioPort = Object.freeze({
      ...inner,
      prepareInstrument: async (_instrumentId, notes) => {
        prepareCalls += 1;
        preparedGateSeconds.push(notes.map((note) => note.gateSeconds));
        if (holdNextPreparation) {
          holdNextPreparation = false;
          await heldPreparation;
        }
        return true;
      },
      setInstrument: (requestId, instrumentId) => {
        instrumentCalls += 1;
        return inner.setInstrument(requestId, instrumentId);
      },
      startPreview: (requestId, previewId, instrumentId, midiPitches, gateSeconds) => {
        previewPitches.push([...midiPitches]);
        return inner.startPreview(
          requestId,
          previewId,
          instrumentId,
          midiPitches,
          gateSeconds,
        );
      },
    });
    const creation = createStudioController({ audio: port });
    if (!creation.ok) throw new Error("controller refused");
    const controller = creation.controller;

    expect(controller.previewPitch(48, GESTURE).ok).toBe(true);
    await until(() => previewPitches.length === 1);
    previewPitches.length = 0;
    prepareCalls = 0;
    resetGate();
    holdNextPreparation = true;

    expect(controller.previewPitch(60, GESTURE).ok).toBe(true);
    await until(() => prepareCalls === 1);
    expect(controller.previewPitch(61, GESTURE).ok).toBe(true);
    await until(() => previewPitches.length === 1);
    releaseHeldPreparation();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(previewPitches).toEqual([[61]]);
    expect(preparedGateSeconds).toEqual([[1.2], [1.2], [1.2]]);
    expect(instrumentCalls).toBe(0);
  });

  test("Stop invalidates a preview that is still waiting on preparation", async () => {
    const inner = createStudioAudio(createFakeAudioPlatform().platform);
    let releasePreparation = (): void => {
      throw new Error("STOP_PREVIEW_GATE_UNINITIALIZED");
    };
    const preparationGate = new Promise<void>((resolve) => {
      releasePreparation = resolve;
    });
    let prepareStarted = false;
    const previewPitches: number[][] = [];
    const port: StudioAudioPort = Object.freeze({
      ...inner,
      prepareInstrument: async () => {
        prepareStarted = true;
        await preparationGate;
        return true;
      },
      startPreview: (requestId, previewId, instrumentId, midiPitches, gateSeconds) => {
        previewPitches.push([...midiPitches]);
        return inner.startPreview(
          requestId,
          previewId,
          instrumentId,
          midiPitches,
          gateSeconds,
        );
      },
    });
    const creation = createStudioController({ audio: port });
    if (!creation.ok) throw new Error("controller refused");
    const controller = creation.controller;

    expect(controller.previewPitch(60, GESTURE).ok).toBe(true);
    await until(() => prepareStarted);
    expect(controller.stopProgression().ok).toBe(true);
    releasePreparation();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(previewPitches).toEqual([]);
  });
});
