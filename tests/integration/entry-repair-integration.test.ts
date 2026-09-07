import { expect, test } from "bun:test";
import { createStudioController, createStudioComposition, seedStarterChart } from "../../src/application/runtime";
import { entryRepairRangeIsCurrent } from "../../src/ui/studio/EntryRepair";
import { runAtomicEditPlan } from "../../src/application";
import { createA0U1Scenario } from "../support/a0-u1-edit-plan-fixture";

test("real parser source spans repair only draft; Insert and Undo preserve exact chart", () => {
  const created = createStudioController({ nowMs: () => 2000 });
  if (!created.ok) throw new Error(created.refusal.code);
  const studio = created.controller;
  const initial = studio.getSnapshot();
  const id = initial.sections[0]?.measures[0]?.id;
  if (id === undefined) throw new Error("missing initial measure");
  const target = { kind: "measure-start" as const, measureId: id };
  const draft = '; 🎷 é\n| D♭maj7:2 H7:2 |';
  expect(studio.setQuickEntryDraft(draft, target, "invalid", []).ok).toBe(true);
  const token = studio.previewQuickEntryDraft().tokens.find(row => row.diagnosticCode === "symbol.root_invalid");
  if (token?.diagnosticRange === null || token?.diagnosticRange === undefined) throw new Error("missing root diagnostic");
  expect(token.diagnosticRange).toEqual({ start: 19, end: 20 });
  expect(token.sourceText).toBe("H");
  const repair = { ...token.diagnosticRange, draftText: draft, sourceText: token.sourceText };
  expect(entryRepairRangeIsCurrent(repair, draft)).toBe(true);
  const repaired = draft.slice(0, repair.start) + "G" + draft.slice(repair.end);
  expect(studio.setQuickEntryDraft(repaired, target, "ready", []).ok).toBe(true);
  const beforeInsert = studio.getSnapshot();
  expect(beforeInsert.sections).toEqual(initial.sections);
  expect(beforeInsert.history).toEqual(initial.history);
  expect(beforeInsert.revision).toBe(initial.revision);
  expect(beforeInsert.quickEntry.text).toBe('; 🎷 é\n| D♭maj7:2 G7:2 |');
  expect(entryRepairRangeIsCurrent(repair, repaired)).toBe(false);
  expect(studio.applyQuickEntryPreview().ok).toBe(true);
  const after = studio.getSnapshot();
  expect(after.chordCount).toBe(2);
  expect(after.revision).toBe(initial.revision + 1);
  expect(after.sections[0]?.measures[0]?.events.map(row => row.durationBeatLabel)).toEqual(["2/1", "2/1"]);
  expect(studio.undo().ok).toBe(true);
  expect(studio.getSnapshot().sections).toEqual(initial.sections);
});

for (const text of [
  '; 🎷 é\n| D♭maj7:2 G7:2 |',
  '| Cmaj7:4 "hold | softly" | Dm7:2 G7:2 |',
  '| | Cmaj7:1/2 G7:7/2 |',
]) {
  test(`pristine insertion is one transaction over parsed structure: ${text}`, () => {
    const created = createStudioComposition();
    if (!created.ok) throw new Error(created.refusal.code);
    const studio = created.composition.controller;
    seedStarterChart(studio);
    expect(studio.clearChart().ok).toBe(true);
    const before = studio.getSnapshot();
    const beforeDocument = created.composition.readApplicationState().document;
    const measureId = before.sections[0]?.measures[0]?.id;
    if (measureId === undefined) throw new Error("missing kept measure");
    const parsed = studio.previewChartText(text);
    expect(parsed.status).toBe("ready");
    expect(studio.setQuickEntryDraft(text, { kind: "after-measure", measureId }, parsed.status, parsed.issueCodes).ok).toBe(true);
    expect(studio.previewInsertionPlan().committable).toBe(true);
    expect(studio.applyQuickEntryPreview().ok).toBe(true);
    const after = studio.getSnapshot();
    expect(after.revision).toBe(before.revision + 1);
    expect(after.sections[0]?.measures[0]?.id).toBe(measureId);
    const afterDocument = created.composition.readApplicationState().document;
    if (text.includes('"hold')) expect(afterDocument.sections[0]?.measures[0]?.events[0]?.annotation).toBe("hold | softly");
    if (text.startsWith("| |")) {
      expect(after.sections[0]?.measures[0]?.events).toEqual([]);
      expect(after.sections[0]?.measures[1]?.events.map(row => row.durationBeatLabel)).toEqual(["1/2", "7/2"]);
    }
    expect(studio.undo().ok).toBe(true);
    expect(studio.getSnapshot().sections).toEqual(before.sections);
    expect(created.composition.readApplicationState().document).toEqual(beforeDocument);
    expect(studio.redo().ok).toBe(true);
    expect(studio.getSnapshot().sections).toEqual(after.sections);
    expect(created.composition.readApplicationState().document).toEqual(afterDocument);
  });
}

test("invalid suffix after a valid bar cannot publish then undo a partial prefix", () => {
  const created = createStudioComposition();
  if (!created.ok) throw new Error(created.refusal.code);
  const studio = created.composition.controller;
  const measureId = studio.getSnapshot().sections[0]?.measures[0]?.id;
  if (measureId === undefined) throw new Error("missing initial measure");
  // A dishonest caller-supplied ready status must still cross the real parser.
  expect(studio.setQuickEntryDraft("| C7:4 | H7:4 |", { kind: "after-measure", measureId }, "ready", []).ok).toBe(true);
  const before = created.composition.readApplicationState();
  expect(studio.applyQuickEntryPreview().ok).toBe(false);
  expect(created.composition.readApplicationState()).toBe(before);
});

test("explicit pristine disposition refuses a populated destination before allocating", () => {
  const scenario = createA0U1Scenario("complete-draft-into-section");
  const plan = scenario.command.plan;
  if (plan.kind !== "insert-fragment" || plan.source.kind !== "complete-draft" || plan.placement.kind !== "into-section") throw new Error("bad independent fixture");
  const result = runAtomicEditPlan({
    state: scenario.state,
    dependencies: scenario.dependencies,
    command: { ...scenario.command, plan: { ...plan, placement: { ...plan.placement, layoutDisposition: "fill-empty-first-measure" } } },
  });
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("populated destination accepted");
  expect(result.editPlanRefusal?.code).toBe("edit-plan.destination-invalid");
  expect(result.state.document).toBe(scenario.state.document);
  expect(result.state.history).toBe(scenario.state.history);
  expect(result.state.revision).toBe(scenario.state.revision);
  expect(result.state.quickEntry).toBe(scenario.state.quickEntry);
  expect(result.state.bookmarks).toBe(scenario.state.bookmarks);
  expect(result.state.notices.at(-1)?.code).toBe("command.destination_invalid");
  expect(result.effects).toEqual([]);
  expect(scenario.calls.idKinds).toHaveLength(0);
});
