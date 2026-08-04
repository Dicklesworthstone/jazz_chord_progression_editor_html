/**
 * V2R-8 footer settings (jcpe-v2r-transport-k88n): the instrument and master
 * volume are document fields committed through the settings command, so they
 * are undoable, they travel with the chart, and refusals state their codes.
 * Expected values are hand-authored from the declared vocabularies — never
 * read back from the controller.
 */
import { describe, expect, test } from "bun:test";

import {
  createStudioAudio,
  createStudioController,
  seedStarterChart,
} from "../../src/application/runtime";
import type { StudioController } from "../../src/application/runtime";
import { INSTRUMENT_IDS } from "../../src/domain";
import { createFakeAudioPlatform } from "../../src/test-support/fake-audio-platform";

function makeController(): StudioController {
  const audio = createStudioAudio(createFakeAudioPlatform().platform);
  const creation = createStudioController({ audio });
  if (!creation.ok) {
    throw new Error(`controller refused: ${creation.refusal.code}`);
  }
  seedStarterChart(creation.controller);
  return creation.controller;
}

describe("V2R-8 instrument setting", () => {
  test("every declared instrument commits, shows in the snapshot, and undoes", () => {
    const controller = makeController();
    const before = controller.getSnapshot().instrumentId;
    for (const id of INSTRUMENT_IDS) {
      const result = controller.setInstrument(id);
      expect(result.ok).toBe(true);
      expect(controller.getSnapshot().instrumentId).toBe(id);
    }
    /* One undo per committed change walks straight back to the seed. */
    let guard = 0;
    while (controller.getSnapshot().instrumentId !== before && guard < 12) {
      expect(controller.undo().ok).toBe(true);
      guard += 1;
    }
    expect(controller.getSnapshot().instrumentId).toBe(before);
  });

  test("an unknown instrument refuses with its code and changes nothing", () => {
    const controller = makeController();
    const before = controller.getSnapshot().instrumentId;
    const result = controller.setInstrument("theremin");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal.code).toBe("u1.instrument_unknown");
    expect(controller.getSnapshot().instrumentId).toBe(before);
  });

  test("re-picking the current instrument is a friendly no-op, not an edit", () => {
    const controller = makeController();
    const current = controller.getSnapshot().instrumentId;
    const revision = controller.getSnapshot().revision;
    const result = controller.setInstrument(current);
    expect(result.ok).toBe(true);
    expect(controller.getSnapshot().revision).toBe(revision);
  });
});

describe("V2R-8 master volume setting", () => {
  test("a volume in range commits to the document and undoes", () => {
    const controller = makeController();
    const before = controller.getSnapshot().masterVolume;
    const result = controller.setMasterVolume(0.35);
    expect(result.ok).toBe(true);
    expect(controller.getSnapshot().masterVolume).toBe(0.35);
    expect(controller.undo().ok).toBe(true);
    expect(controller.getSnapshot().masterVolume).toBe(before);
  });

  test.each([[-0.01], [1.01], [Number.NaN], [Number.POSITIVE_INFINITY]])(
    "volume %p refuses with u1.master_volume_invalid",
    (volume) => {
      const controller = makeController();
      const before = controller.getSnapshot().masterVolume;
      const result = controller.setMasterVolume(volume);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.refusal.code).toBe("u1.master_volume_invalid");
      }
      expect(controller.getSnapshot().masterVolume).toBe(before);
    },
  );

  test("re-committing the current volume is a friendly no-op", () => {
    const controller = makeController();
    const current = controller.getSnapshot().masterVolume;
    const revision = controller.getSnapshot().revision;
    expect(controller.setMasterVolume(current).ok).toBe(true);
    expect(controller.getSnapshot().revision).toBe(revision);
  });
});
