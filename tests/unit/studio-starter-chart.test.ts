/**
 * jcpe-b20t evidence: the first-open starter chart seeds through the real
 * typed command path, lands the reviewed progression exactly, never touches
 * a non-pristine studio, and unwinds with exactly two Undo presses.
 */
import { describe, expect, setDefaultTimeout, test } from "bun:test";

/* The palette sweep renders real piano buffers; wall time is not a gate. */
setDefaultTimeout(120_000);

import {
  STARTER_CHART,
  createStudioAudio,
  createStudioController,
  seedStarterChart,
} from "../../src/application/runtime";
import type { StudioController } from "../../src/application/runtime";
import {
  PALETTE_QUALITIES,
  PALETTE_ROOTS,
} from "../../src/ui/studio/LibraryPanel";
import { createFakeAudioPlatform } from "../../src/test-support/fake-audio-platform";

const PLAY_GESTURE = Object.freeze({
  kind: "trusted-pointer",
  trusted: true,
  sequence: 1,
} as const);

/** A controller whose transport runs over the deterministic fake platform. */
function audibleController(): StudioController {
  const audio = createStudioAudio(createFakeAudioPlatform().platform);
  const creation = createStudioController({ audio });
  if (!creation.ok) {
    throw new Error(`controller refused: ${creation.refusal.code}`);
  }
  return creation.controller;
}

/** Insert one chart through the typed path, aimed at the pristine bar. */
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

function freshController(): StudioController {
  const creation = createStudioController();
  if (!creation.ok) {
    throw new Error(`controller refused: ${creation.refusal.code}`);
  }
  return creation.controller;
}

describe("the reviewed starter chart", () => {
  test("parses ready with zero issue codes under the real T0 grammar", () => {
    const controller = freshController();
    const preview = controller.previewChartText(STARTER_CHART.chartText);
    expect(preview.status).toBe("ready");
    expect(preview.issueCodes).toEqual([]);
  });

  test("seeds a pristine studio with the full progression", () => {
    const controller = freshController();
    const result = seedStarterChart(controller);
    expect(result).toEqual({ seeded: true, reason: "seeded" });
    const snapshot = controller.getSnapshot();
    expect(snapshot.title).toBe(STARTER_CHART.title);
    expect(snapshot.chordCount).toBe(10);
    expect(snapshot.measureCount).toBe(6);
    expect(snapshot.quickEntry.text).toBe("");
    const fills = snapshot.sections[0]?.measures.map(
      (measure) => measure.eventCount,
    );
    expect(fills).toEqual([2, 2, 2, 2, 1, 1]);
  });

  test("STARTER_CHART.undoDepth Undo presses return the exact pristine studio", () => {
    const controller = freshController();
    const before = controller.getSnapshot();
    expect(seedStarterChart(controller).seeded).toBe(true);
    for (let press = 0; press < STARTER_CHART.undoDepth; press += 1) {
      expect(controller.undo().ok).toBe(true);
    }
    const after = controller.getSnapshot();
    expect(after.title).toBe(before.title);
    expect(after.chordCount).toBe(0);
    expect(after.measureCount).toBe(before.measureCount);
    expect(after.sections.length).toBe(1);
    expect(after.history.canUndo).toBe(false);
  });

  test("a studio with any prior content is never touched", () => {
    const controller = freshController();
    const titled = controller.setTitle("My own chart");
    expect(titled.ok).toBe(true);
    const result = seedStarterChart(controller);
    expect(result).toEqual({
      seeded: false,
      reason: "document-not-pristine",
    });
    expect(controller.getSnapshot().title).toBe("My own chart");
    expect(controller.getSnapshot().chordCount).toBe(0);
  });

  test("seeding twice refuses the second time", () => {
    const controller = freshController();
    expect(seedStarterChart(controller).seeded).toBe(true);
    expect(seedStarterChart(controller)).toEqual({
      seeded: false,
      reason: "document-not-pristine",
    });
    expect(controller.getSnapshot().chordCount).toBe(10);
    expect(controller.getSnapshot().measureCount).toBe(6);
  });

  test("the seeded chart PLAYS through the real transport composition", () => {
    /*
     * The regression this exists for: the first shipped starter chart
     * contained chords (E7alt, Ab13#11) that parsed under T0 but had no
     * V0 voicing, so the first thing a visitor's Play press produced was
     * a refusal. Parsing is not playability; this proves the whole join.
     */
    const controller = audibleController();
    expect(seedStarterChart(controller).seeded).toBe(true);
    const played = controller.playProgression(PLAY_GESTURE);
    expect(played.ok ? "plays" : played.refusal.message).toBe("plays");
    expect(controller.stopProgression().ok).toBe(true);
  });

  test("every palette root and quality pairing plays end-to-end", () => {
    const failures: string[] = [];
    for (const quality of PALETTE_QUALITIES) {
      for (const root of PALETTE_ROOTS) {
        const symbol = `${root.text}${quality.suffix}`;
        const controller = audibleController();
        insertChart(controller, `| ${symbol} |`);
        const played = controller.playProgression(PLAY_GESTURE);
        if (!played.ok) failures.push(`${symbol}:${played.refusal.code}`);
        controller.stopProgression();
      }
    }
    expect(failures).toEqual([]);
  });

  test("an unplayable chord's refusal names the chord and its bar", () => {
    const controller = audibleController();
    insertChart(controller, "| C7alt |");
    const played = controller.playProgression(PLAY_GESTURE);
    if (played.ok) throw new Error("expected the alt chord to refuse");
    expect(played.refusal.message).toContain("C7alt");
    expect(played.refusal.message).toContain("bar 1");
  });

  test("every starter chord is an exactly parsed token, none recovered", () => {
    const controller = freshController();
    const preview = controller.previewChartText(STARTER_CHART.chartText);
    expect(preview.status).toBe("ready");
    const drafted = controller.setQuickEntryDraft(
      STARTER_CHART.chartText,
      {
        kind: "section-end",
        sectionId: controller.getSnapshot().sections[0]?.id ?? "",
      },
      preview.status,
      preview.issueCodes,
    );
    expect(drafted.ok).toBe(true);
    const tokens = controller.previewQuickEntryDraft().tokens;
    expect(tokens.length).toBe(10);
    for (const token of tokens) {
      expect(`${token.sourceText}:${token.state}`).toBe(
        `${token.sourceText}:valid`,
      );
    }
  });
});
