import { describe, expect, test } from "bun:test";

import { makeBeatDuration, type MeasureCompletion } from "../../src/domain";
import {
  createStudioController,
  type StudioController,
  type StudioControllerActionResult,
  type StudioViewModel,
} from "../../src/application";

/** Deterministic logical clock; wall time never decides a musical outcome. */
function fixedClock(): () => number {
  let ticks = 0;
  return () => {
    ticks += 2_000;
    return ticks;
  };
}

function controller(): StudioController {
  const created = createStudioController({ nowMs: fixedClock() });
  expect(created.ok).toBe(true);
  if (!created.ok) throw new Error(`U1_TEST_BOOTSTRAP:${created.refusal.code}`);
  return created.controller;
}

function expectOk(
  result: StudioControllerActionResult,
): Extract<StudioControllerActionResult, { ok: true }> {
  if (!result.ok) {
    throw new Error(`U1_TEST_UNEXPECTED_REFUSAL:${result.refusal.code}`);
  }
  return result;
}

function refusalCode(result: StudioControllerActionResult): string {
  if (result.ok) throw new Error("U1_TEST_EXPECTED_REFUSAL");
  return result.refusal.code;
}

function firstMeasureId(snapshot: StudioViewModel): string {
  const id = snapshot.sections[0]?.measures[0]?.id;
  if (id === undefined) throw new Error("U1_TEST_NO_MEASURE");
  return id;
}

function firstSectionId(snapshot: StudioViewModel): string {
  const id = snapshot.sections[0]?.id;
  if (id === undefined) throw new Error("U1_TEST_NO_SECTION");
  return id;
}

function pickupCompletion(): MeasureCompletion {
  const duration = makeBeatDuration({ denominator: 1, numerator: 2 });
  if (!duration.ok) throw new Error("U1_TEST_BEAT");
  return { expectedDuration: duration.value, kind: "pickup", reason: "Written pickup bar" };
}

function chordIds(snapshot: StudioViewModel): readonly string[] {
  return snapshot.sections.flatMap((section) =>
    section.measures.flatMap((measure) =>
      measure.events.map((event) => event.id),
    ),
  );
}

/** Type one bar of chart text into the blank studio and publish it atomically. */
function seedOneBar(studio: StudioController, text = "Dm9:2 G13:2"): void {
  const measureId = firstMeasureId(studio.getSnapshot());
  expectOk(
    studio.setQuickEntryDraft(
      text,
      { kind: "measure-start", measureId },
      "ready",
      [],
    ),
  );
  expectOk(studio.applyQuickEntryPreview());
}

describe("U1 editing controller", () => {
  test("publishes a parsed preview as one atomic apply-edit-plan command", () => {
    const studio = controller();
    const before = studio.getSnapshot();
    expect(before.chordCount).toBe(0);

    seedOneBar(studio);

    const after = studio.getSnapshot();
    expect(after.chordCount).toBe(2);
    expect(after.revision).toBe(before.revision + 1);
    expect(after.history.canUndo).toBe(true);
    const measure = after.sections[0]?.measures[0];
    expect(measure?.fill).toBe("exact-fill");
    expect(measure?.completion).toBe("complete");
    expect(measure?.events.map((event) => event.symbolText)).toEqual([
      "Dm9",
      "G13",
    ]);
    expect(measure?.events.map((event) => event.durationBeatLabel)).toEqual([
      "2/1",
      "2/1",
    ]);
    expect(measure?.events.every((event) => event.voicingMode === "auto")).toBe(
      true,
    );
    expect(after.quickEntry.status).toBe("idle");
    expect(after.quickEntry.text).toBe("");
  });

  test("one undo restores the exact pre-insert chart", () => {
    const studio = controller();
    seedOneBar(studio);
    const inserted = studio.getSnapshot();

    const undone = expectOk(studio.undo());
    expect(undone.snapshot.chordCount).toBe(0);
    expect(undone.snapshot.sections[0]?.measures[0]?.completion).toBe("empty");

    const redone = expectOk(studio.redo());
    expect(redone.snapshot.chordCount).toBe(2);
    expect(chordIds(redone.snapshot)).toEqual(chordIds(inserted));
  });

  test("selection travels as an ephemeral intent and never enters history", () => {
    const studio = controller();
    seedOneBar(studio);
    const seeded = studio.getSnapshot();
    const [first, second] = chordIds(seeded);
    if (first === undefined || second === undefined) {
      throw new Error("U1_TEST_NO_CHORDS");
    }

    const selected = expectOk(studio.selectEvent(first));
    expect(selected.outcome).toBe("ephemeral-updated");
    expect(selected.snapshot.revision).toBe(seeded.revision);
    expect(selected.snapshot.history).toEqual(seeded.history);
    expect(selected.snapshot.bookmarks.selectedEventIds).toEqual([first]);
    expect(selected.snapshot.bookmarks.selectionFocusEventId).toBe(first);

    const extended = expectOk(studio.extendSelectionTo(second));
    expect(extended.snapshot.bookmarks.selectedEventIds).toEqual([
      first,
      second,
    ]);
    expect(extended.snapshot.bookmarks.selectionAnchorEventId).toBe(first);
    expect(extended.snapshot.bookmarks.selectionFocusEventId).toBe(second);
    expect(extended.snapshot.revision).toBe(seeded.revision);

    const cleared = expectOk(studio.clearSelection());
    expect(cleared.snapshot.bookmarks.selectedEventIds).toEqual([]);
  });

  test("selection, insertion point, and range stay four independent values", () => {
    const studio = controller();
    seedOneBar(studio);
    const [first, second] = chordIds(studio.getSnapshot());
    if (first === undefined || second === undefined) {
      throw new Error("U1_TEST_NO_CHORDS");
    }
    expectOk(studio.selectEvent(first));
    const measureId = firstMeasureId(studio.getSnapshot());

    const insertion = expectOk(
      studio.setInsertionPoint({ kind: "measure-end", measureId }),
    );
    expect(insertion.snapshot.bookmarks.selectedEventIds).toEqual([first]);
    expect(insertion.snapshot.bookmarks.insertionLabel).toBe("At measure end");

    const ranged = expectOk(
      studio.setRange(
        { eventId: first, kind: "before-event" },
        { eventId: second, kind: "after-event" },
      ),
    );
    expect(ranged.snapshot.bookmarks.rangeActive).toBe(true);
    expect(ranged.snapshot.bookmarks.rangeStartBeatLabel).toBe("0/1");
    expect(ranged.snapshot.bookmarks.rangeEndBeatLabel).toBe("4/1");
    expect(ranged.snapshot.bookmarks.selectedEventIds).toEqual([first]);
    expect(ranged.snapshot.bookmarks.insertionLabel).toBe("At measure end");
    expect(ranged.snapshot.transport.playheadBeatLabel).toBe("0/1");

    const cleared = expectOk(studio.clearRange());
    expect(cleared.snapshot.bookmarks.rangeActive).toBe(false);
    expect(cleared.snapshot.bookmarks.selectedEventIds).toEqual([first]);
  });

  test("deleting one chord requires an explicit incomplete-measure reason", () => {
    const studio = controller();
    seedOneBar(studio);
    const [first] = chordIds(studio.getSnapshot());
    if (first === undefined) throw new Error("U1_TEST_NO_CHORDS");
    expectOk(studio.selectEvent(first));

    expect(refusalCode(studio.deleteSelection())).toBe(
      "u1.completion_reason_required",
    );
    expect(studio.getSnapshot().chordCount).toBe(2);

    const deleted = expectOk(studio.deleteSelection("Pickup into the head"));
    expect(deleted.snapshot.chordCount).toBe(1);
    const measure = deleted.snapshot.sections[0]?.measures[0];
    expect(measure?.completion).toBe("incomplete");
    expect(measure?.fill).toBe("underfilled");
  });

  test("deleting every chord returns the measure to the empty completion", () => {
    const studio = controller();
    seedOneBar(studio);
    const ids = chordIds(studio.getSnapshot());
    const [first, second] = ids;
    if (first === undefined || second === undefined) {
      throw new Error("U1_TEST_NO_CHORDS");
    }
    expectOk(studio.selectEvent(first));
    expectOk(studio.extendSelectionTo(second));

    const deleted = expectOk(studio.deleteSelection());
    expect(deleted.snapshot.chordCount).toBe(0);
    expect(deleted.snapshot.sections[0]?.measures[0]?.completion).toBe("empty");
  });

  test("duplicating into a full measure refuses instead of overfilling", () => {
    const studio = controller();
    seedOneBar(studio);
    const [first] = chordIds(studio.getSnapshot());
    if (first === undefined) throw new Error("U1_TEST_NO_CHORDS");
    expectOk(studio.selectEvent(first));

    expect(refusalCode(studio.duplicateSelection())).toBe(
      "u1.duration_overfills_measure",
    );
    expect(studio.getSnapshot().chordCount).toBe(2);
  });

  test("a duration edit that overfills the bar refuses before dispatch", () => {
    const studio = controller();
    seedOneBar(studio);
    const [first] = chordIds(studio.getSnapshot());
    if (first === undefined) throw new Error("U1_TEST_NO_CHORDS");
    const before = studio.getSnapshot();

    expect(refusalCode(studio.setEventDuration(first, 3, 1))).toBe(
      "u1.duration_overfills_measure",
    );
    expect(refusalCode(studio.setEventDuration(first, 0, 1))).toBe(
      "u1.duration_invalid",
    );
    expect(studio.getSnapshot().revision).toBe(before.revision);

    const shortened = expectOk(
      studio.setEventDuration(first, 1, 1, "Anacrusis"),
    );
    const measure = shortened.snapshot.sections[0]?.measures[0];
    expect(measure?.events[0]?.durationBeatLabel).toBe("1/1");
    expect(measure?.completion).toBe("incomplete");
  });

  test("exact rational durations survive the round trip", () => {
    const studio = controller();
    const measureId = firstMeasureId(studio.getSnapshot());
    expectOk(
      studio.setQuickEntryDraft(
        "C:5/2 D:3/2",
        { kind: "measure-start", measureId },
        "ready",
        [],
      ),
    );
    const applied = expectOk(studio.applyQuickEntryPreview());
    const measure = applied.snapshot.sections[0]?.measures[0];
    expect(measure?.events.map((event) => event.durationBeatLabel)).toEqual([
      "5/2",
      "3/2",
    ]);
    expect(measure?.fill).toBe("exact-fill");
  });

  test("a multi-measure draft cannot enter one measure boundary", () => {
    const studio = controller();
    const measureId = firstMeasureId(studio.getSnapshot());
    expectOk(
      studio.setQuickEntryDraft(
        "| C:4 | D:4 |",
        { kind: "measure-start", measureId },
        "ready",
        [],
      ),
    );
    expect(refusalCode(studio.applyQuickEntryPreview())).toBe(
      "u1.insertion_plan_overfills_destination",
    );
    expect(studio.getSnapshot().chordCount).toBe(0);
  });

  test("a multi-measure draft enters a section boundary", () => {
    const studio = controller();
    const sectionId = firstSectionId(studio.getSnapshot());
    expectOk(
      studio.setQuickEntryDraft(
        "| C:4 | D:4 |",
        { kind: "section-end", sectionId },
        "ready",
        [],
      ),
    );
    const applied = expectOk(studio.applyQuickEntryPreview());
    expect(applied.snapshot.chordCount).toBe(2);
    expect(applied.snapshot.measureCount).toBe(3);
    expect(
      applied.snapshot.sections[0]?.measures.map((measure) => measure.fill),
    ).toEqual(["empty", "exact-fill", "exact-fill"]);
  });

  test("named sections enter the document boundary", () => {
    const studio = controller();
    expectOk(
      studio.setQuickEntryDraft(
        "[B]\n| C:4 |",
        { kind: "document-end" },
        "ready",
        [],
      ),
    );
    const applied = expectOk(studio.applyQuickEntryPreview());
    expect(applied.snapshot.sections).toHaveLength(2);
    expect(applied.snapshot.sections[1]?.name).toBe("B");
    expect(applied.snapshot.chordCount).toBe(1);
  });

  test("an implicit draft cannot enter the document boundary", () => {
    const studio = controller();
    expectOk(
      studio.setQuickEntryDraft("| C:4 |", { kind: "document-end" }, "ready", []),
    );
    expect(refusalCode(studio.applyQuickEntryPreview())).toBe(
      "u1.insertion_plan_not_atomic",
    );
  });

  test("a refused draft is never partially inserted", () => {
    const studio = controller();
    const measureId = firstMeasureId(studio.getSnapshot());
    expectOk(
      studio.setQuickEntryDraft(
        "| C:2 |",
        { kind: "measure-start", measureId },
        "ready",
        [],
      ),
    );
    expect(refusalCode(studio.applyQuickEntryPreview())).toBe(
      "u1.insertion_plan_not_atomic",
    );
    expect(studio.getSnapshot().chordCount).toBe(0);
    expect(studio.getSnapshot().revision).toBe(0);
  });

  test("draft bounds refuse inside U1 before any intent is dispatched", () => {
    const studio = controller();
    const before = studio.getSnapshot();
    expect(
      refusalCode(studio.setQuickEntryDraft("C".repeat(4_097), null, "invalid", [])),
    ).toBe("u1.draft_code_points_exceeded");
    expect(
      refusalCode(studio.setQuickEntryDraft("\ud800", null, "invalid", [])),
    ).toBe("u1.draft_unicode_invalid");
    expect(studio.getSnapshot().quickEntry.text).toBe(before.quickEntry.text);

    const atLimit = expectOk(
      studio.setQuickEntryDraft("C".repeat(4_096), null, "invalid", []),
    );
    expect(atLimit.snapshot.quickEntry.codePointCount).toBe(4_096);
  });

  test("a committed command clears the draft and blocks a second apply", () => {
    const studio = controller();
    const measureId = firstMeasureId(studio.getSnapshot());
    expectOk(
      studio.setQuickEntryDraft(
        "C:4",
        { kind: "measure-start", measureId },
        "ready",
        [],
      ),
    );
    expectOk(studio.setTitle("Solar"));

    const cleared = studio.getSnapshot();
    expect(cleared.quickEntry.status).toBe("idle");
    expect(cleared.quickEntry.text).toBe("");
    expect(cleared.quickEntry.baseRevisionCurrent).toBe(true);
    expect(refusalCode(studio.applyQuickEntryPreview())).toBe(
      "u1.quick_entry_lane_mismatch",
    );
    expect(studio.getSnapshot().chordCount).toBe(0);
  });

  test("only a ready draft reaches the whole-preview lane", () => {
    const studio = controller();
    const measureId = firstMeasureId(studio.getSnapshot());
    expectOk(
      studio.setQuickEntryDraft(
        "H7",
        { kind: "measure-start", measureId },
        "invalid",
        ["symbol.root_invalid"],
      ),
    );
    expect(refusalCode(studio.applyQuickEntryPreview())).toBe(
      "u1.quick_entry_lane_mismatch",
    );
    expect(studio.getSnapshot().quickEntry.issueCodes).toEqual([
      "symbol.root_invalid",
    ]);
  });

  test("editing a chord that no longer exists refuses with a stable target code", () => {
    const studio = controller();
    seedOneBar(studio);
    const [first, second] = chordIds(studio.getSnapshot());
    if (first === undefined || second === undefined) {
      throw new Error("U1_TEST_NO_CHORDS");
    }
    expectOk(studio.selectEvent(first));
    expectOk(studio.extendSelectionTo(second));
    expectOk(studio.deleteSelection());

    expect(refusalCode(studio.selectEvent(first))).toBe("u1.target_missing");
    expect(refusalCode(studio.setEventDuration(first, 1, 1))).toBe(
      "u1.target_missing",
    );
    expect(refusalCode(studio.deleteSelection())).toBe("u1.selection_empty");
  });

  test("stable identities survive an insert that reorders nothing", () => {
    const studio = controller();
    seedOneBar(studio);
    const seeded = chordIds(studio.getSnapshot());
    const sectionId = firstSectionId(studio.getSnapshot());
    expectOk(
      studio.setQuickEntryDraft(
        "| Cmaj9:4 |",
        { kind: "section-end", sectionId },
        "ready",
        [],
      ),
    );
    const applied = expectOk(studio.applyQuickEntryPreview());
    const after = chordIds(applied.snapshot);
    expect(after.slice(0, seeded.length)).toEqual([...seeded]);
    expect(after).toHaveLength(seeded.length + 1);
  });

  test("appends and inserts empty measures through one insert command", () => {
    const studio = controller();
    const sectionId = firstSectionId(studio.getSnapshot());

    const appended = expectOk(studio.insertMeasure(sectionId, null));
    expect(appended.snapshot.measureCount).toBe(2);
    expect(appended.snapshot.sections[0]?.measures[1]?.completion).toBe("empty");
    expect(appended.outcome).toBe("committed");

    const firstMeasure = firstMeasureId(appended.snapshot);
    const inserted = expectOk(studio.insertMeasure(sectionId, firstMeasure));
    expect(inserted.snapshot.measureCount).toBe(3);
    expect(inserted.snapshot.sections[0]?.measures[1]?.id).toBe(firstMeasure);

    expect(refusalCode(studio.insertMeasure("missing-section", null))).toBe(
      "u1.target_missing",
    );
    expect(refusalCode(studio.insertMeasure(sectionId, "missing-measure"))).toBe(
      "u1.target_missing",
    );

    const undone = expectOk(studio.undo());
    expect(undone.snapshot.measureCount).toBe(2);
  });

  test("appends a named section carrying one empty measure", () => {
    const studio = controller();
    const appended = expectOk(studio.insertSection(null, "B"));
    expect(appended.snapshot.sections).toHaveLength(2);
    expect(appended.snapshot.sections[1]?.name).toBe("B");
    expect(appended.snapshot.sections[1]?.measures).toHaveLength(1);
    expect(appended.snapshot.measureCount).toBe(2);

    expect(refusalCode(studio.insertSection(null, "   "))).toBe(
      "u1.target_missing",
    );
    expect(refusalCode(studio.insertSection("missing-section", "C"))).toBe(
      "u1.target_missing",
    );
  });

  test("reorders inside a measure without changing its exact total", () => {
    const studio = controller();
    seedOneBar(studio);
    const [first, second] = chordIds(studio.getSnapshot());
    if (first === undefined || second === undefined) {
      throw new Error("U1_TEST_NO_CHORDS");
    }
    expectOk(studio.selectEvent(second));

    const moved = expectOk(studio.moveSelection("previous"));
    expect(chordIds(moved.snapshot)).toEqual([second, first]);
    const measure = moved.snapshot.sections[0]?.measures[0];
    expect(measure?.fill).toBe("exact-fill");
    expect(measure?.completion).toBe("complete");
    expect(measure?.events.map((event) => event.symbolText)).toEqual([
      "G13",
      "Dm9",
    ]);

    const back = expectOk(studio.moveSelection("next"));
    expect(chordIds(back.snapshot)).toEqual([first, second]);
  });

  test("a move with no adjacent measure refuses instead of inventing one", () => {
    const studio = controller();
    seedOneBar(studio);
    const [first, second] = chordIds(studio.getSnapshot());
    if (first === undefined || second === undefined) {
      throw new Error("U1_TEST_NO_CHORDS");
    }
    expectOk(studio.selectEvent(first));
    expect(refusalCode(studio.moveSelection("previous"))).toBe(
      "u1.move_destination_invalid",
    );

    expectOk(studio.selectEvent(second));
    expect(refusalCode(studio.moveSelection("next"))).toBe(
      "u1.move_destination_invalid",
    );
    expect(studio.getSnapshot().chordCount).toBe(2);
  });

  test("a cross-measure move recomputes both measures and stays exact", () => {
    const studio = controller();
    seedOneBar(studio);
    const sectionId = firstSectionId(studio.getSnapshot());
    expectOk(studio.insertMeasure(sectionId, null));
    const [, last] = chordIds(studio.getSnapshot());
    if (last === undefined) throw new Error("U1_TEST_NO_CHORDS");
    expectOk(studio.selectEvent(last));

    // Only the measure's last chord can leave it; an interior chord swaps.
    expect(refusalCode(studio.moveSelection("next"))).toBe(
      "u1.completion_reason_required",
    );

    const moved = expectOk(studio.moveSelection("next", "Split across the bar"));
    const measures = moved.snapshot.sections[0]?.measures ?? [];
    expect(measures[0]?.events.map((event) => event.symbolText)).toEqual([
      "Dm9",
    ]);
    expect(measures[1]?.events.map((event) => event.symbolText)).toEqual([
      "G13",
    ]);
    expect(measures[0]?.completion).toBe("incomplete");
    expect(measures[1]?.completion).toBe("incomplete");
  });

  test("a move needs a contiguous single-measure selection", () => {
    const studio = controller();
    seedOneBar(studio);
    const sectionId = firstSectionId(studio.getSnapshot());
    expectOk(
      studio.setQuickEntryDraft(
        "| C:4 |",
        { kind: "section-end", sectionId },
        "ready",
        [],
      ),
    );
    expectOk(studio.applyQuickEntryPreview());
    const ids = chordIds(studio.getSnapshot());
    const [first, , third] = ids;
    if (first === undefined || third === undefined) {
      throw new Error("U1_TEST_NO_CHORDS");
    }
    expectOk(studio.selectEvent(first));
    expectOk(studio.extendSelectionTo(third));

    expect(refusalCode(studio.moveSelection("next"))).toBe(
      "u1.move_destination_invalid",
    );
  });

  test("an inline symbol edit replaces the whole event and keeps its timing", () => {
    const studio = controller();
    seedOneBar(studio);
    const [first] = chordIds(studio.getSnapshot());
    if (first === undefined) throw new Error("U1_TEST_NO_CHORDS");
    const before = studio.getSnapshot().sections[0]?.measures[0]?.events[0];

    const edited = expectOk(studio.applyInlineSymbol(first, "Dm11"));
    const after = edited.snapshot.sections[0]?.measures[0]?.events[0];
    expect(after?.id).toBe(first);
    expect(after?.symbolText).toBe("Dm11");
    expect(after?.durationBeatLabel).toBe(before?.durationBeatLabel);
    expect(after?.voicingMode).toBe("auto");
    expect(edited.snapshot.sections[0]?.measures[0]?.fill).toBe("exact-fill");
    expect(edited.snapshot.chordCount).toBe(2);

    const undone = expectOk(studio.undo());
    expect(undone.snapshot.sections[0]?.measures[0]?.events[0]?.symbolText).toBe(
      "Dm9",
    );
  });

  test("an unparsable inline symbol refuses and changes nothing", () => {
    const studio = controller();
    seedOneBar(studio);
    const [first] = chordIds(studio.getSnapshot());
    if (first === undefined) throw new Error("U1_TEST_NO_CHORDS");
    const before = studio.getSnapshot();

    expect(refusalCode(studio.applyInlineSymbol(first, "H7"))).toBe(
      "u1.symbol_draft_invalid",
    );
    expect(refusalCode(studio.applyInlineSymbol(first, "C".repeat(257)))).toBe(
      "u1.symbol_draft_invalid",
    );
    expect(refusalCode(studio.applyInlineSymbol("missing", "C"))).toBe(
      "u1.target_missing",
    );
    expect(studio.getSnapshot().revision).toBe(before.revision);
    expect(
      studio.getSnapshot().sections[0]?.measures[0]?.events[0]?.symbolText,
    ).toBe("Dm9");
  });

  test("a slash chord keeps the bass and the exact duration", () => {
    const studio = controller();
    seedOneBar(studio);
    const [first] = chordIds(studio.getSnapshot());
    if (first === undefined) throw new Error("U1_TEST_NO_CHORDS");

    const edited = expectOk(studio.applyInlineSymbol(first, "Dm9/A"));
    const after = edited.snapshot.sections[0]?.measures[0]?.events[0];
    expect(after?.symbolText).toBe("Dm9/A");
    expect(after?.durationBeatLabel).toBe("2/1");
    expect(edited.snapshot.sections[0]?.measures[0]?.fill).toBe("exact-fill");
  });

  test("exact beat text parses to the same command as the exact rational", () => {
    const studio = controller();
    seedOneBar(studio);
    const [first] = chordIds(studio.getSnapshot());
    if (first === undefined) throw new Error("U1_TEST_NO_CHORDS");

    expect(refusalCode(studio.setEventDurationText(first, "3"))).toBe(
      "u1.duration_overfills_measure",
    );
    expect(refusalCode(studio.setEventDurationText(first, "1"))).toBe(
      "u1.completion_reason_required",
    );
    for (const malformed of ["", "  ", "two", "5/", "/2", "1.5", "-1", "2/0"]) {
      expect(refusalCode(studio.setEventDurationText(first, malformed))).toBe(
        "u1.duration_invalid",
      );
    }

    const shortened = expectOk(
      studio.setEventDurationText(first, "3/2", "Pickup"),
    );
    const measure = shortened.snapshot.sections[0]?.measures[0];
    expect(measure?.events[0]?.durationBeatLabel).toBe("3/2");
    expect(measure?.completion).toBe("incomplete");
    expect(measure?.fill).toBe("underfilled");
  });

  test("section name and annotation travel as coalescing set-text commands", () => {
    const studio = controller();
    const sectionId = firstSectionId(studio.getSnapshot());

    const renamed = expectOk(studio.renameSection(sectionId, "Head"));
    expect(renamed.snapshot.sections[0]?.name).toBe("Head");
    expect(renamed.snapshot.history.canUndo).toBe(true);

    const annotated = expectOk(
      studio.annotateSection(sectionId, "Play the melody an octave up"),
    );
    expect(annotated.snapshot.sections[0]?.annotation).toBe(
      "Play the melody an octave up",
    );

    expect(refusalCode(studio.renameSection("missing", "X"))).toBe(
      "u1.target_missing",
    );
    expect(refusalCode(studio.annotateSection("missing", "X"))).toBe(
      "u1.target_missing",
    );

    const undone = expectOk(studio.undo());
    expect(undone.snapshot.sections[0]?.annotation).toBe("");
    expect(undone.snapshot.sections[0]?.name).toBe("Head");
  });

  test("a blank section name is refused by the application, not by a guess", () => {
    const studio = controller();
    const sectionId = firstSectionId(studio.getSnapshot());
    const before = studio.getSnapshot();

    const refused = studio.renameSection(sectionId, "   ");
    expect(refused.ok).toBe(false);
    if (refused.ok) throw new Error("U1_TEST_EXPECTED_REFUSAL");
    expect(refused.refusal.code).toBe("command.structural_validation_failed");
    expect(refused.snapshot.sections[0]?.name).toBe(before.sections[0]?.name);
  });

  test("the voice-leading boundary is an explicit one-field command", () => {
    const studio = controller();
    const sectionId = firstSectionId(studio.getSnapshot());
    expect(studio.getSnapshot().sections[0]?.name).toBe("A");

    const continued = expectOk(
      studio.setSectionBoundary(sectionId, "continue"),
    );
    expect(continued.outcome).toBe("committed");
    expect(continued.snapshot.revision).toBe(1);

    const reset = expectOk(studio.setSectionBoundary(sectionId, "reset"));
    expect(reset.snapshot.revision).toBe(2);

    expect(refusalCode(studio.setSectionBoundary("missing", "reset"))).toBe(
      "u1.target_missing",
    );
  });

  test("a measure completion command carries the explicit reason", () => {
    const studio = controller();
    seedOneBar(studio);
    const [first] = chordIds(studio.getSnapshot());
    if (first === undefined) throw new Error("U1_TEST_NO_CHORDS");
    expectOk(studio.selectEvent(first));
    expectOk(studio.deleteSelection("Head pickup"));

    const measureId = firstMeasureId(studio.getSnapshot());
    expect(
      refusalCode(
        studio.setMeasureCompletion("missing-measure", { kind: "complete" }),
      ),
    ).toBe("u1.target_missing");

    const restored = expectOk(
      studio.setMeasureCompletion(measureId, pickupCompletion()),
    );
    expect(restored.snapshot.sections[0]?.measures[0]?.completion).toBe(
      "pickup",
    );
  });
});
