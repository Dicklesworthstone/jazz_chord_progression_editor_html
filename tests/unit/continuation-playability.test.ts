/**
 * The playability law (jcpe-tkos): anything the surface can offer must reach
 * sound, because a suggestion that Play refuses teaches a user the studio is
 * broken. The engine's emission set is closed — every root name either
 * spelling table can produce, crossed with every emission quality, is played
 * end-to-end through the real transport composition here.
 */
import { describe, expect, test } from "bun:test";

import {
  createStudioAudio,
  createStudioController,
} from "../../src/application/runtime";
import type { StudioController } from "../../src/application/runtime";
import { CONTINUATION_EMISSION_QUALITIES } from "../../src/theory";
import { createFakeAudioPlatform } from "../../src/test-support/fake-audio-platform";

const PLAY_GESTURE = Object.freeze({
  kind: "trusted-pointer",
  trusted: true,
  sequence: 1,
} as const);

/** Every root name the engine's two spelling tables can emit. */
const EMITTABLE_ROOTS = [
  "C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B",
  "C#", "D#", "F#", "G#", "A#",
] as const;

function audibleController(): StudioController {
  const audio = createStudioAudio(createFakeAudioPlatform().platform);
  const creation = createStudioController({ audio });
  if (!creation.ok) {
    throw new Error(`controller refused: ${creation.refusal.code}`);
  }
  return creation.controller;
}

function insertChart(controller: StudioController, chartText: string): void {
  const preview = controller.previewChartText(chartText);
  if (preview.status !== "ready") {
    throw new Error(`chart does not parse: ${preview.issueCodes.join(",")}`);
  }
  const measureId =
    controller.getSnapshot().sections[0]?.measures[0]?.id ?? "";
  const drafted = controller.setQuickEntryDraft(
    chartText,
    { kind: "measure-start", measureId },
    preview.status,
    preview.issueCodes,
  );
  if (!drafted.ok) throw new Error(`draft refused: ${drafted.refusal.code}`);
  const applied = controller.applyQuickEntryPreview();
  if (!applied.ok) throw new Error(`insert refused: ${applied.refusal.code}`);
}

describe("continuation emission playability", () => {
  test("every emittable root and quality parses ready and reaches sound", () => {
    const failures: string[] = [];
    for (const quality of CONTINUATION_EMISSION_QUALITIES) {
      for (const root of EMITTABLE_ROOTS) {
        const symbol = `${root}${quality}`;
        const controller = audibleController();
        try {
          insertChart(controller, `| ${symbol} |`);
        } catch (error) {
          failures.push(`${symbol}:${String(error)}`);
          continue;
        }
        const played = controller.playProgression(PLAY_GESTURE);
        if (!played.ok) failures.push(`${symbol}:${played.refusal.code}`);
        controller.stopProgression();
      }
    }
    expect(failures).toEqual([]);
  }, 60_000);
});
