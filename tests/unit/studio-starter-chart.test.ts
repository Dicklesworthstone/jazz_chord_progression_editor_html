/**
 * jcpe-b20t evidence: the first-open starter chart seeds through the real
 * typed command path, lands the reviewed progression exactly, never touches
 * a non-pristine studio, and unwinds with exactly two Undo presses.
 */
import { describe, expect, test } from "bun:test";

import {
  STARTER_CHART,
  createStudioController,
  seedStarterChart,
} from "../../src/application/runtime";
import type { StudioController } from "../../src/application/runtime";

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
    expect(snapshot.chordCount).toBe(24);
    expect(snapshot.measureCount).toBe(16);
    expect(snapshot.quickEntry.text).toBe("");
    const fills = snapshot.sections[0]?.measures.map(
      (measure) => measure.eventCount,
    );
    expect(fills).toEqual([1, 1, 2, 2, 1, 1, 2, 2, 1, 2, 1, 2, 1, 1, 2, 2]);
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
    expect(controller.getSnapshot().chordCount).toBe(24);
    expect(controller.getSnapshot().measureCount).toBe(16);
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
    expect(tokens.length).toBe(24);
    for (const token of tokens) {
      expect(`${token.sourceText}:${token.state}`).toBe(
        `${token.sourceText}:valid`,
      );
    }
  });
});
