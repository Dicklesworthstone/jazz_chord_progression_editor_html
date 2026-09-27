/**
 * The controller's display-only continuation accessor: windowing, and the
 * memoization law — keyed on the frozen document object itself, never on
 * id+revision, so an unchanged document returns the identical view and any
 * published edit derives a fresh one.
 */
import { describe, expect, test } from "bun:test";

import { createStudioController } from "../../src/application/runtime";
import type { StudioController } from "../../src/application/runtime";

function freshController(): StudioController {
  const creation = createStudioController();
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
  const snapshot = controller.getSnapshot();
  const sectionId = snapshot.sections[snapshot.sections.length - 1]?.id ?? "";
  const drafted = controller.setQuickEntryDraft(
    chartText,
    { kind: "section-end", sectionId },
    preview.status,
    preview.issueCodes,
  );
  if (!drafted.ok) throw new Error(`draft refused: ${drafted.refusal.code}`);
  const applied = controller.applyQuickEntryPreview();
  if (!applied.ok) throw new Error(`insert refused: ${applied.refusal.code}`);
}

describe("readContinuationSuggestions", () => {
  test("an empty chart offers nothing rather than inventing an opening", () => {
    const controller = freshController();
    const view = controller.readContinuationSuggestions();
    expect(view.afterLabel).toBeNull();
    expect(view.suggestions).toEqual([]);
  });

  test("after | Dm7 G7 | the options follow G7 and resolve to Cmaj7 first", () => {
    const controller = freshController();
    insertChart(controller, "| Dm7 G7 |");
    const view = controller.readContinuationSuggestions();
    expect(view.afterLabel).toBe("G7");
    expect(view.suggestions[0]?.symbolText).toBe("Cmaj7");
  });

  test("the unchanged document returns the identical memoized view", () => {
    const controller = freshController();
    insertChart(controller, "| Dm7 G7 |");
    const first = controller.readContinuationSuggestions();
    const second = controller.readContinuationSuggestions();
    expect(second).toBe(first);
  });

  test("a published edit derives a fresh view for the new document", () => {
    const controller = freshController();
    insertChart(controller, "| Dm7 G7 |");
    const before = controller.readContinuationSuggestions();
    insertChart(controller, "| Cmaj7 |");
    const after = controller.readContinuationSuggestions();
    expect(after).not.toBe(before);
    expect(after.afterLabel).toBe("Cmaj7");
  });

  test("the window follows the last chords of a longer chart", () => {
    const controller = freshController();
    insertChart(controller, "| Cmaj7 Fmaj7 | Am7 Dm7 | G7 Em7 |");
    const view = controller.readContinuationSuggestions();
    expect(view.afterLabel).toBe("Em7");
  });

  test("the chart's declared key is the reading; clearing it returns to the overlap guess", () => {
    /* Hand-authored: Cm7 Fm7 guesses E♭ major; declared C minor offers the
     * minor key's own G7 and Dm7♭5, and says the key is declared. */
    const controller = freshController();
    insertChart(controller, "| Cm7 Fm7 |");
    expect(controller.readContinuationSuggestions().contextReading?.keyDeclared).toBe(false);
    expect(controller.setKey({ step: "C", alter: 0, mode: "natural-minor" }).ok).toBe(true);
    const declared = controller.readContinuationSuggestions();
    expect(declared.contextReading).toMatchObject({ keyDeclared: true, keyName: "C", keyMode: "natural-minor" });
    expect(declared.suggestions.map((entry) => entry.symbolText)).toContain("Dm7b5");
    expect(controller.setKey(null).ok).toBe(true);
    expect(controller.readContinuationSuggestions().contextReading?.keyDeclared).toBe(false);
  });
});

describe("readKeySuggestion", () => {
  test("a keyless chart is offered the key it fits best; a set key withdraws the offer", () => {
    /* Hand-authored: | Dm7 G7 | Cmaj7 | fits C major, all tones in scale. */
    const controller = freshController();
    expect(controller.readKeySuggestion()).toBeNull();
    insertChart(controller, "| Dm7 G7 | Cmaj7 |");
    const suggestion = controller.readKeySuggestion();
    expect(suggestion?.key).toEqual({ step: "C", alter: 0, mode: "major" });
    expect(suggestion?.label).toBe("C major");
    expect(suggestion?.sentence).toBe("These chords fit C major best: 12 of 12 chord tones are in its scale.");
    expect(controller.readKeySuggestion()).toBe(suggestion);
    expect(controller.setKey({ step: "C", alter: 0, mode: "major" }).ok).toBe(true);
    expect(controller.readKeySuggestion()).toBeNull();
  });

  test("a blues says why it is offered", () => {
    const controller = freshController();
    insertChart(controller, "| F7 | Bb7 | F7 | C7 | F7 |");
    expect(controller.readKeySuggestion()?.sentence)
      .toBe("The chart opens and closes on the same dominant seventh, like a blues in F.");
  });
});
