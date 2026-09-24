/**
 * The chord-detail scale options come from H0's enumerateChordScaleOptions
 * under the chord's own key. Expectations are hand-derived from the reviewed
 * mapping table: a dominant 7 is Mixolydian outright, a tonic major seventh is
 * Ionian only when the key says it is the tonic, a IV major seventh in a major
 * key is Lydian, and without a key those two stay plural and conditional.
 */
import { describe, expect, test } from "bun:test";

import { chartScaleOptions } from "../../src/application/chart-scale-options";
import { createStudioController, type StudioController } from "../../src/application/runtime";
import type { KeyContext, ProgressionDocumentV2 } from "../../src/domain";
import { musicalDocument } from "../support/studio-voice-leading";

const names = (document: ProgressionDocumentV2, index: number) => {
  const event = document.sections[0]?.measures[index]?.events[0];
  if (event === undefined) throw new Error("event");
  const view = chartScaleOptions(document, event.id);
  return view === null ? null : view.options.map((option) => `${option.name}${option.strength === "exact" ? "" : " (possible)"}`);
};
const C_MAJOR: KeyContext = { tonic: { step: "C", alter: 0 }, mode: "major" };

describe("chart scale options", () => {
  const bars = [["Dm7"], ["G7"], ["Cmaj7"], ["Fmaj7"], ["E7alt"], ["Cdim7"]];

  test("without a key: dominants settle, major sevenths stay plural and conditional", () => {
    const document = musicalDocument(bars);
    expect(names(document, 0)).toEqual(["D Dorian (possible)"]);
    expect(names(document, 1)).toEqual(["G Mixolydian"]);
    expect(names(document, 2)).toEqual(["C Ionian (major) (possible)", "C Lydian (possible)"]);
    // 7alt reads its first realization, the one the chord-detail tones show.
    expect(names(document, 4)).toEqual(["E Altered"]);
    expect(names(document, 5)).toEqual(["C Whole–half diminished"]);
    const event = document.sections[0]?.measures[2]?.events[0];
    expect(event === undefined ? null : chartScaleOptions(document, event.id)?.plural).toBe(true);
  });

  test("in C major the key settles I as Ionian and IV as Lydian", () => {
    const document = { ...musicalDocument(bars), key: C_MAJOR };
    expect(names(document, 2)).toEqual(["C Ionian (major)"]);
    expect(names(document, 3)).toEqual(["F Lydian"]);
    // Dorian over ii still depends on an undeclared mode.
    expect(names(document, 0)).toEqual(["D Dorian (possible)"]);
  });

  test("a section key override outranks the chart key", () => {
    const base = { ...musicalDocument(bars), key: C_MAJOR };
    const section = base.sections[0];
    if (section === undefined) throw new Error("section");
    const inF = { ...base, sections: [{ ...section, keyOverride: { tonic: { step: "F", alter: 0 }, mode: "major" } as KeyContext }] };
    // Fmaj7 is now the tonic (Ionian); Cmaj7 is V-major, neither tonic nor #4-in-key.
    expect(names(inF, 3)).toEqual(["F Ionian (major)"]);
    expect(names(inF, 2)).toBeNull();
  });

  test("spellings keep each degree: the altered #9 of E is F𝄪, not G", () => {
    const document = musicalDocument(bars);
    const event = document.sections[0]?.measures[4]?.events[0];
    const altered = event === undefined ? undefined : chartScaleOptions(document, event.id)?.options[0];
    expect(altered?.notes).toBe("E F F𝄪 G♯ B♭ B♯ D");
    expect(altered?.clashes).toEqual(["♭9 (F) sits a minor ninth above the 1 (E)"]);
  });

  test("the controller read port is cached per document and changes nothing", () => {
    const creation = createStudioController();
    if (!creation.ok) throw new Error(creation.refusal.code);
    const controller: StudioController = creation.controller;
    const preview = controller.previewChartText("| G7 |");
    const target = { kind: "measure-start", measureId: controller.getSnapshot().sections[0]?.measures[0]?.id ?? "" } as const;
    if (!controller.setQuickEntryDraft("| G7 |", target, preview.status, preview.issueCodes).ok) throw new Error("draft");
    if (!controller.applyQuickEntryPreview().ok) throw new Error("insert");
    const id = controller.getSnapshot().sections[0]?.measures[0]?.events[0]?.id ?? "";
    const revision = controller.getSnapshot().revision;
    const first = controller.readScaleOptions(id);
    expect(first?.options.map((option) => option.name)).toEqual(["G Mixolydian"]);
    expect(controller.readScaleOptions(id)).toBe(first);
    expect(controller.getSnapshot().revision).toBe(revision);
    expect(controller.readScaleOptions("missing")).toBeNull();
  });
});
