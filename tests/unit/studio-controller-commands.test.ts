/**
 * jcpe-cmd1 evidence: the three commands the surface was missing.
 *
 * Each is proven positively, on its refusal path, and through undo, because a
 * command that silently no-ops is worse than one that declines: the surface
 * cannot tell "did nothing" from "worked" without a receipt.
 */
import { describe, expect, test } from "bun:test";

import { createStudioController } from "../../src/application/runtime";
import type { StudioController } from "../../src/application/runtime";

function freshController(): StudioController {
  const creation = createStudioController();
  if (!creation.ok) throw new Error(`controller refused: ${creation.refusal.code}`);
  return creation.controller;
}

/*
 * A multi-bar chart cannot enter a pristine document in one command: the
 * insertion-plan vocabulary has no fill-and-append statement, so the opening
 * bar fills the empty measure and the remainder appends at the section end.
 */
function seed(controller: StudioController, chartText: string): void {
  const bars = chartText
    .split("|")
    .map((bar) => bar.trim())
    .filter((bar) => bar.length > 0);
  const snapshot = controller.getSnapshot();
  const sectionId = snapshot.sections[0]?.id ?? "";
  const measureId = snapshot.sections[0]?.measures[0]?.id ?? "";
  const steps: readonly (readonly [
    string,
    Parameters<StudioController["setQuickEntryDraft"]>[1],
  ])[] = [
    [`| ${bars[0] ?? ""} |`, { kind: "measure-start", measureId }],
    ...(bars.length > 1
      ? ([
          [
            `| ${bars.slice(1).join(" | ")} |`,
            { kind: "section-end", sectionId },
          ],
        ] as const)
      : []),
  ];
  for (const [text, target] of steps) {
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
}

function measureCount(controller: StudioController): number {
  return controller
    .getSnapshot()
    .sections.reduce((total, section) => total + section.measures.length, 0);
}

describe("setTempo", () => {
  test("commits a tempo inside the reviewed window", () => {
    const controller = freshController();
    const result = controller.setTempo(88);
    expect(result.ok).toBe(true);
    expect(controller.getSnapshot().tempoBpm).toBe(88);
  });

  test("refuses out-of-range and non-integer tempi rather than clamping", () => {
    const controller = freshController();
    const before = controller.getSnapshot().tempoBpm;
    for (const bad of [19, 301, 0, -40]) {
      const result = controller.setTempo(bad);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.refusal.code).toBe("u1.tempo_out_of_range");
    }
    for (const bad of [Number.NaN, 120.5, Number.POSITIVE_INFINITY]) {
      const result = controller.setTempo(bad);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.refusal.code).toBe("u1.tempo_invalid");
    }
    /* A refusal changed nothing. */
    expect(controller.getSnapshot().tempoBpm).toBe(before);
  });

  test("accepts both edges of the window", () => {
    const controller = freshController();
    expect(controller.setTempo(20).ok).toBe(true);
    expect(controller.getSnapshot().tempoBpm).toBe(20);
    expect(controller.setTempo(300).ok).toBe(true);
    expect(controller.getSnapshot().tempoBpm).toBe(300);
  });

  test("is undoable", () => {
    const controller = freshController();
    const before = controller.getSnapshot().tempoBpm;
    expect(controller.setTempo(140).ok).toBe(true);
    expect(controller.undo().ok).toBe(true);
    expect(controller.getSnapshot().tempoBpm).toBe(before);
  });
});

describe("clearChart", () => {
  test("empties a loaded chart to exactly one empty measure", () => {
    const controller = freshController();
    seed(controller, "| Dm7 G7 | Cmaj7 |");
    expect(controller.getSnapshot().chordCount).toBeGreaterThan(0);

    const result = controller.clearChart();
    expect(result.ok).toBe(true);
    const snapshot = controller.getSnapshot();
    expect(snapshot.chordCount).toBe(0);
    /* The complaint that motivated this: clearing must not leave hollow bars. */
    expect(measureCount(controller)).toBe(1);
    expect(snapshot.sections.length).toBe(1);
  });

  test("refuses when the chart is already a single empty measure", () => {
    const controller = freshController();
    const result = controller.clearChart();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal.code).toBe("u1.chart_already_empty");
  });

  test("is one undoable command that restores every chord", () => {
    const controller = freshController();
    seed(controller, "| Dm7 G7 | Cmaj7 | Fmaj7 |");
    const before = controller.getSnapshot().chordCount;
    const beforeMeasures = measureCount(controller);

    expect(controller.clearChart().ok).toBe(true);
    expect(controller.getSnapshot().chordCount).toBe(0);

    expect(controller.undo().ok).toBe(true);
    expect(controller.getSnapshot().chordCount).toBe(before);
    expect(measureCount(controller)).toBe(beforeMeasures);
  });
});

describe("deleteMeasure", () => {
  test("removes one measure and keeps the rest", () => {
    const controller = freshController();
    seed(controller, "| Dm7 G7 | Cmaj7 | Fmaj7 |");
    const before = measureCount(controller);
    const target = controller.getSnapshot().sections[0]?.measures[1]?.id ?? "";

    const result = controller.deleteMeasure(target);
    expect(result.ok).toBe(true);
    expect(measureCount(controller)).toBe(before - 1);
  });

  test("refuses the last measure and an unknown id", () => {
    const controller = freshController();
    const only = controller.getSnapshot().sections[0]?.measures[0]?.id ?? "";
    const last = controller.deleteMeasure(only);
    expect(last.ok).toBe(false);
    if (!last.ok) expect(last.refusal.code).toBe("u1.measure_last_cannot_delete");

    const missing = controller.deleteMeasure("no-such-measure");
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.refusal.code).toBe("u1.target_missing");
  });

  test("is undoable", () => {
    const controller = freshController();
    seed(controller, "| Dm7 G7 | Cmaj7 |");
    const before = measureCount(controller);
    const target = controller.getSnapshot().sections[0]?.measures[1]?.id ?? "";
    expect(controller.deleteMeasure(target).ok).toBe(true);
    expect(controller.undo().ok).toBe(true);
    expect(measureCount(controller)).toBe(before);
  });
});
