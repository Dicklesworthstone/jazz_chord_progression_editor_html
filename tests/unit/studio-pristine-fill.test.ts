/**
 * Owner-reported regression (2026-07-30): load the page, Clear, click a
 * library progression — the chart kept a permanently blank bar 1 and every
 * inserted bar landed after it.
 *
 * Mechanism: a consumed quick-entry draft keeps its target, Clear's bookmark
 * maintenance repoints that target at the surviving empty measure as an
 * `after-measure` boundary, and the pristine-section fill (jcpe-73h1) only
 * fired for `section-end` aims. These tests pin the generalized law: every
 * into-section aim at a section whose only measure is empty fills that bar
 * first and appends the remainder, while measure-start aims keep their
 * pinned overfill refusal (U1-EDIT-004).
 */
import { describe, expect, test } from "bun:test";

import {
  createStudioController,
  PROGRESSION_LIBRARY,
  seedStarterChart,
} from "../../src/application/runtime";
import type { StudioController } from "../../src/application/runtime";

const TURNAROUND = PROGRESSION_LIBRARY.find(
  (entry) => entry.id === "rhythm-turnaround",
);
if (TURNAROUND === undefined) throw new Error("library entry missing");

function freshController(): StudioController {
  const creation = createStudioController();
  if (!creation.ok) {
    throw new Error(`controller refused: ${creation.refusal.code}`);
  }
  return creation.controller;
}

function measureShapes(
  controller: StudioController,
): readonly (readonly number[])[] {
  return controller
    .getSnapshot()
    .sections.map((section) =>
      section.measures.map((measure) => measure.events.length),
    );
}

function insertText(
  controller: StudioController,
  text: string,
  target: Parameters<StudioController["setQuickEntryDraft"]>[1],
): void {
  const preview = controller.previewChartText(text);
  if (preview.status !== "ready") {
    throw new Error(`chart does not parse: ${preview.issueCodes.join(",")}`);
  }
  const drafted = controller.setQuickEntryDraft(
    text,
    target,
    preview.status,
    preview.issueCodes,
  );
  if (!drafted.ok) throw new Error(`draft refused: ${drafted.refusal.code}`);
  const applied = controller.applyQuickEntryPreview();
  if (!applied.ok) throw new Error(`insert refused: ${applied.refusal.code}`);
}

describe("pristine-section fill after Clear", () => {
  test("seed, Clear, library insert leaves no blank leading bar", () => {
    const controller = freshController();
    const seeded = seedStarterChart(controller);
    expect(seeded.seeded).toBe(true);

    const cleared = controller.clearChart();
    expect(cleared.ok).toBe(true);

    /*
     * The exact stored draft target after seed + Clear is the after-measure
     * boundary of the kept empty bar; the surface replays it verbatim. This
     * mirrors what App.tsx's quickEntryTarget() derives, so the controller
     * is exercised through the same aim a real library click produces.
     */
    const keptMeasureId =
      controller.getSnapshot().sections[0]?.measures[0]?.id ?? "";
    insertText(controller, TURNAROUND.chartText, {
      kind: "after-measure",
      measureId: keptMeasureId,
    });

    const shapes = measureShapes(controller);
    expect(shapes).toHaveLength(1);
    const firstSection = shapes[0] ?? [];
    // Eight bars of two chords each; bar 1 is filled, not skipped.
    expect(firstSection).toEqual([2, 2, 2, 2, 2, 2, 2, 2]);
  });

  test("before-measure aim at the sole empty bar also fills it", () => {
    const controller = freshController();
    const measureId =
      controller.getSnapshot().sections[0]?.measures[0]?.id ?? "";
    insertText(controller, "| Dm7 G7 | Cmaj7 |", {
      kind: "before-measure",
      measureId,
    });
    expect(measureShapes(controller)).toEqual([[2, 1]]);
  });

  test("section-end aim keeps the original jcpe-73h1 behavior", () => {
    const controller = freshController();
    const sectionId = controller.getSnapshot().sections[0]?.id ?? "";
    insertText(controller, "| Am7 D7 | Gmaj7 |", {
      kind: "section-end",
      sectionId,
    });
    expect(measureShapes(controller)).toEqual([[2, 1]]);
  });

  test("a populated section never triggers the fill rewrite", () => {
    const controller = freshController();
    const sectionId = controller.getSnapshot().sections[0]?.id ?? "";
    const measureId =
      controller.getSnapshot().sections[0]?.measures[0]?.id ?? "";
    insertText(controller, "| C |", { kind: "measure-start", measureId });
    insertText(controller, "| F | G |", { kind: "section-end", sectionId });
    expect(measureShapes(controller)).toEqual([[1, 1, 1]]);
  });

  test("undo unwinds the two-step fill back to the cleared chart", () => {
    const controller = freshController();
    const seeded = seedStarterChart(controller);
    expect(seeded.seeded).toBe(true);
    expect(controller.clearChart().ok).toBe(true);
    const keptMeasureId =
      controller.getSnapshot().sections[0]?.measures[0]?.id ?? "";
    insertText(controller, TURNAROUND.chartText, {
      kind: "after-measure",
      measureId: keptMeasureId,
    });
    // Two steps, two undos: first the append, then the fill.
    expect(controller.undo().ok).toBe(true);
    expect(controller.undo().ok).toBe(true);
    expect(measureShapes(controller)).toEqual([[0]]);
  });
});
