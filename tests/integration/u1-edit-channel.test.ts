import { describe, expect, test } from "bun:test";

import {
  createStudioController,
  type StudioController,
  type StudioControllerActionResult,
  type StudioViewModel,
} from "../../src/application";

/**
 * Declared evidence owner for `U1-TRACE-CHANNEL` in
 * `tests/fixtures/editing/trace-ledger.json`.
 *
 * The trace requires that every U1 edit is exactly one existing A0 command or
 * ephemeral intent carrying the expected document identity and revision, and
 * that refusals are surfaced verbatim and never retried. The measurement here
 * is behavioural rather than declarative: a document command advances the
 * revision by exactly one and adds exactly one undo entry, while an ephemeral
 * intent leaves both untouched. Nothing is mocked; every assertion runs the
 * real controller against real A0 application state.
 */

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

function chordIds(snapshot: StudioViewModel): readonly string[] {
  return snapshot.sections.flatMap((section) =>
    section.measures.flatMap((measure) => measure.events.map((e) => e.id)),
  );
}

type ChannelObservation = Readonly<{
  revisionDelta: number;
  undoLabel: string | null;
  undoLabelChanged: boolean;
  canUndo: boolean;
}>;

/**
 * Observe the channel one action actually used, without disturbing state.
 *
 * An earlier version of this probe counted undo entries by exhausting and
 * replaying history. That was wrong: `undoDocumentCommand` and
 * `redoDocumentCommand` each advance the revision counter, so the probe
 * changed the very quantity it measured and wiped the selection the action
 * under test depended on. The probe now only reads the snapshot.
 *
 * A `document-command` row must advance the revision by exactly one and push a
 * new undo label; an `ephemeral-intent` or `presentation-only` row must move
 * neither.
 */
function observe(
  studio: StudioController,
  action: () => StudioControllerActionResult,
): Readonly<{ result: StudioControllerActionResult; channel: ChannelObservation }> {
  const before = studio.getSnapshot();
  const result = action();
  const after = studio.getSnapshot();
  return {
    channel: {
      canUndo: after.history.canUndo,
      revisionDelta: after.revision - before.revision,
      undoLabel: after.history.undoLabel,
      undoLabelChanged: after.history.undoLabel !== before.history.undoLabel,
    },
    result,
  };
}

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

describe("U1-TRACE-CHANNEL every edit is exactly one A0 command or intent", () => {
  test("U1-OPC-024 select-event reaches the ephemeral channel only", () => {
    const studio = controller();
    seedOneBar(studio);
    const [first] = chordIds(studio.getSnapshot());
    if (first === undefined) throw new Error("U1_TEST_NO_CHORD");

    const observed = observe(studio, () => studio.selectEvent(first));
    expectOk(observed.result);
    expect(observed.channel.revisionDelta).toBe(0);
    expect(observed.channel.undoLabelChanged).toBe(false);
    expect(studio.getSnapshot().bookmarks.selectedEventIds).toEqual([first]);
  });

  test("U1-OPC-004 quick-entry insert is exactly one document command", () => {
    const studio = controller();
    const measureId = firstMeasureId(studio.getSnapshot());
    expectOk(
      studio.setQuickEntryDraft(
        "Dm9:2 G13:2",
        { kind: "measure-start", measureId },
        "ready",
        [],
      ),
    );

    const observed = observe(studio, () => studio.applyQuickEntryPreview());
    expectOk(observed.result);
    expect(observed.channel.revisionDelta).toBe(1);
    expect(observed.channel.undoLabelChanged).toBe(true);
    expect(observed.channel.canUndo).toBe(true);
    expect(chordIds(studio.getSnapshot())).toHaveLength(2);
  });

  test("U1-OPC-014 split-event-duration is one apply-edit-plan command", () => {
    const studio = controller();
    seedOneBar(studio);
    const [first] = chordIds(studio.getSnapshot());
    if (first === undefined) throw new Error("U1_TEST_NO_CHORD");

    const observed = observe(studio, () =>
      studio.splitEventDuration(first, "1", "1"),
    );
    expectOk(observed.result);
    expect(observed.channel.revisionDelta).toBe(1);
    expect(observed.channel.undoLabelChanged).toBe(true);
    expect(observed.channel.canUndo).toBe(true);

    const measure = studio.getSnapshot().sections[0]?.measures[0];
    expect(measure?.events).toHaveLength(3);
    // The split preserves the exact bar total: 1 + 1 + 2 = 4 quarter notes.
    expect(measure?.durationBeatLabel).toBe("4/1");
    expect(measure?.fill).toBe("exact-fill");
    // Identity policy retains the source for the first span.
    expect(measure?.events[0]?.id).toBe(first);
    expect(measure?.events[0]?.symbolText).toBe("Dm9");
    expect(measure?.events[1]?.symbolText).toBe("Dm9");
  });

  test("U1-OPC-045 a split whose parts do not sum refuses before dispatch", () => {
    const studio = controller();
    seedOneBar(studio);
    const [first] = chordIds(studio.getSnapshot());
    if (first === undefined) throw new Error("U1_TEST_NO_CHORD");

    const observed = observe(studio, () =>
      studio.splitEventDuration(first, "1", "2"),
    );
    expect(refusalCode(observed.result)).toBe("u1.split_partition_invalid");
    expect(observed.channel.revisionDelta).toBe(0);
    expect(observed.channel.undoLabelChanged).toBe(false);
  });

  test("U1-OPC-015 join-event-durations is one apply-edit-plan command", () => {
    const studio = controller();
    seedOneBar(studio, "Dm9:2 Dm9:2");
    const [first] = chordIds(studio.getSnapshot());
    if (first === undefined) throw new Error("U1_TEST_NO_CHORD");

    const observed = observe(studio, () => studio.joinEventDurations(first));
    expectOk(observed.result);
    expect(observed.channel.revisionDelta).toBe(1);
    expect(observed.channel.undoLabelChanged).toBe(true);
    expect(observed.channel.canUndo).toBe(true);

    const measure = studio.getSnapshot().sections[0]?.measures[0];
    expect(measure?.events).toHaveLength(1);
    expect(measure?.events[0]?.id).toBe(first);
    expect(measure?.events[0]?.durationBeatLabel).toBe("4/1");
    expect(measure?.fill).toBe("exact-fill");
  });

  test("U1-OPC-043 joining a chord with no following chord refuses", () => {
    const studio = controller();
    seedOneBar(studio, "Dm9:4");
    const [only] = chordIds(studio.getSnapshot());
    if (only === undefined) throw new Error("U1_TEST_NO_CHORD");

    const observed = observe(studio, () => studio.joinEventDurations(only));
    expect(refusalCode(observed.result)).toBe(
      "u1.join_requires_adjacent_events",
    );
    expect(observed.channel.revisionDelta).toBe(0);
  });

  test("U1-OPC-016 split-section is one apply-edit-plan command", () => {
    const studio = controller();
    const sectionId = studio.getSnapshot().sections[0]?.id;
    if (sectionId === undefined) throw new Error("U1_TEST_NO_SECTION");
    expectOk(studio.insertMeasure(sectionId, null));
    const second = studio.getSnapshot().sections[0]?.measures[1]?.id;
    if (second === undefined) throw new Error("U1_TEST_NO_MEASURE");

    const observed = observe(studio, () =>
      studio.splitSection(sectionId, second, "B"),
    );
    expectOk(observed.result);
    expect(observed.channel.revisionDelta).toBe(1);
    expect(observed.channel.undoLabelChanged).toBe(true);
    expect(observed.channel.canUndo).toBe(true);

    const sections = studio.getSnapshot().sections;
    expect(sections).toHaveLength(2);
    expect(sections[0]?.id).toBe(sectionId);
    expect(sections[0]?.measures).toHaveLength(1);
    expect(sections[1]?.name).toBe("B");
    expect(sections[1]?.measures[0]?.id).toBe(second);
  });

  test("U1-OPC-046 splitting at the first measure refuses", () => {
    const studio = controller();
    const snapshot = studio.getSnapshot();
    const sectionId = snapshot.sections[0]?.id;
    const first = firstMeasureId(snapshot);
    if (sectionId === undefined) throw new Error("U1_TEST_NO_SECTION");

    const observed = observe(studio, () =>
      studio.splitSection(sectionId, first, "B"),
    );
    expect(refusalCode(observed.result)).toBe(
      "u1.section_split_boundary_invalid",
    );
    expect(observed.channel.revisionDelta).toBe(0);
  });

  test("U1-OPC-017 join-sections is one apply-edit-plan command", () => {
    const studio = controller();
    const sectionId = studio.getSnapshot().sections[0]?.id;
    if (sectionId === undefined) throw new Error("U1_TEST_NO_SECTION");
    expectOk(studio.insertMeasure(sectionId, null));
    const second = studio.getSnapshot().sections[0]?.measures[1]?.id;
    if (second === undefined) throw new Error("U1_TEST_NO_MEASURE");
    expectOk(studio.splitSection(sectionId, second, "B"));
    expect(studio.getSnapshot().sections).toHaveLength(2);

    const observed = observe(studio, () => studio.joinSections(sectionId));
    expectOk(observed.result);
    expect(observed.channel.revisionDelta).toBe(1);
    expect(observed.channel.undoLabelChanged).toBe(true);
    expect(observed.channel.canUndo).toBe(true);

    const sections = studio.getSnapshot().sections;
    expect(sections).toHaveLength(1);
    expect(sections[0]?.id).toBe(sectionId);
    expect(sections[0]?.measures).toHaveLength(2);
    expect(sections[0]?.measures[1]?.id).toBe(second);
  });

  test("U1-OPC-047 joining a section with no successor refuses", () => {
    const studio = controller();
    const sectionId = studio.getSnapshot().sections[0]?.id;
    if (sectionId === undefined) throw new Error("U1_TEST_NO_SECTION");

    const observed = observe(studio, () => studio.joinSections(sectionId));
    expect(refusalCode(observed.result)).toBe(
      "u1.section_join_requires_adjacent_sections",
    );
    expect(observed.channel.revisionDelta).toBe(0);
  });

  test("U1-OPC-013 move-following-events is exactly one move command", () => {
    const studio = controller();
    seedOneBar(studio);
    const sectionId = studio.getSnapshot().sections[0]?.id;
    if (sectionId === undefined) throw new Error("U1_TEST_NO_SECTION");
    expectOk(studio.insertMeasure(sectionId, null));
    const [first] = chordIds(studio.getSnapshot());
    if (first === undefined) throw new Error("U1_TEST_NO_CHORD");
    expectOk(studio.selectEvent(first));

    const observed = observe(studio, () =>
      studio.moveFollowingEvents("Moved to resolve an overfilled bar"),
    );
    expectOk(observed.result);
    expect(observed.channel.revisionDelta).toBe(1);
    expect(observed.channel.undoLabelChanged).toBe(true);
    expect(observed.channel.canUndo).toBe(true);

    const measures = studio.getSnapshot().sections[0]?.measures ?? [];
    expect(measures[0]?.events.map((event) => event.symbolText)).toEqual([
      "Dm9",
    ]);
    expect(measures[1]?.events.map((event) => event.symbolText)).toEqual([
      "G13",
    ]);
    // No beat was lost: the two bars still hold four quarter notes together.
    expect(measures[0]?.durationBeatLabel).toBe("2/1");
    expect(measures[1]?.durationBeatLabel).toBe("2/1");
  });

  test("move-following-events refuses when no chord follows", () => {
    const studio = controller();
    seedOneBar(studio, "Dm9:4");
    const [only] = chordIds(studio.getSnapshot());
    if (only === undefined) throw new Error("U1_TEST_NO_CHORD");
    expectOk(studio.selectEvent(only));

    const observed = observe(studio, () => studio.moveFollowingEvents());
    expect(refusalCode(observed.result)).toBe("u1.move_destination_invalid");
    expect(observed.channel.revisionDelta).toBe(0);
  });

  test("U1-OPC-028 range edges reach the ephemeral channel only", () => {
    const studio = controller();
    seedOneBar(studio, "C:1 D:1 E:1 F:1");
    const ids = chordIds(studio.getSnapshot());
    const [first] = ids;
    const second = ids[1];
    if (first === undefined || second === undefined) {
      throw new Error("U1_TEST_NO_CHORD");
    }

    const start = observe(studio, () =>
      studio.setRangeEdge("start", { eventId: first, kind: "before-event" }),
    );
    expectOk(start.result);
    expect(start.channel.revisionDelta).toBe(0);
    expect(start.channel.undoLabelChanged).toBe(false);

    const end = observe(studio, () =>
      studio.setRangeEdge("end", { eventId: second, kind: "after-event" }),
    );
    expectOk(end.result);
    expect(end.channel.revisionDelta).toBe(0);

    const bookmarks = studio.getSnapshot().bookmarks;
    expect(bookmarks.rangeActive).toBe(true);
    expect(bookmarks.rangeStartBeatLabel).toBe("0/1");
    expect(bookmarks.rangeEndBeatLabel).toBe("2/1");
    // Selection is untouched by a range edit.
    expect(bookmarks.selectedEventIds).toEqual([]);
  });

  test("U1-INT-032 an end before the start refuses and dispatches nothing", () => {
    const studio = controller();
    seedOneBar(studio, "C:1 D:1 E:1 F:1");
    const ids = chordIds(studio.getSnapshot());
    const second = ids[1];
    const third = ids[2];
    if (second === undefined || third === undefined) {
      throw new Error("U1_TEST_NO_CHORD");
    }
    expectOk(studio.setRangeEdge("start", { eventId: third, kind: "before-event" }));
    const before = studio.getSnapshot().bookmarks;

    const observed = observe(studio, () =>
      studio.setRangeEdge("end", { eventId: second, kind: "before-event" }),
    );
    expect(refusalCode(observed.result)).toBe("u1.range_endpoints_unordered");
    expect(observed.channel.revisionDelta).toBe(0);
    expect(studio.getSnapshot().bookmarks).toEqual(before);
  });

  test("U1-INT-030 a beat field stores the exact rational boundary", () => {
    const studio = controller();
    seedOneBar(studio, "C:1 D:3");
    expectOk(studio.setRangeEdgeBeat("start", "1"));
    expectOk(studio.setRangeEdgeBeat("end", "4/1"));

    const bookmarks = studio.getSnapshot().bookmarks;
    expect(bookmarks.rangeStartBeatLabel).toBe("1/1");
    expect(bookmarks.rangeEndBeatLabel).toBe("4/1");
    expect(bookmarks.rangeAnchor).toEqual({
      eventId: chordIds(studio.getSnapshot())[0] ?? "",
      kind: "after-event",
    });
  });

  test("U1-INT-031 an unparsable beat field refuses and keeps the range", () => {
    const studio = controller();
    seedOneBar(studio, "C:1 D:3");
    expectOk(studio.setRangeEdgeBeat("start", "1"));
    const before = studio.getSnapshot().bookmarks;

    expect(refusalCode(studio.setRangeEdgeBeat("end", "5..2"))).toBe(
      "u1.range_boundary_invalid",
    );
    expect(studio.getSnapshot().bookmarks).toEqual(before);
  });

  test("a beat that lands on no boundary refuses rather than rounding", () => {
    const studio = controller();
    seedOneBar(studio, "C:1 D:3");
    // 5/2 falls strictly inside the second chord's span.
    expect(refusalCode(studio.setRangeEdgeBeat("start", "5/2"))).toBe(
      "u1.range_boundary_invalid",
    );
    expect(studio.getSnapshot().bookmarks.rangeActive).toBe(false);
  });

  test("every document command carries the current document id and revision", () => {
    const studio = controller();
    seedOneBar(studio);
    const snapshot = studio.getSnapshot();
    const [first] = chordIds(snapshot);
    if (first === undefined) throw new Error("U1_TEST_NO_CHORD");

    // A command written against a stale revision cannot exist here: the
    // controller reads document id and revision at dispatch time, so a
    // successful command always advances exactly one revision from the state
    // the caller observed. The duplicate lands in a fresh empty bar, because
    // duplicating into an already-full bar is a genuine overfill refusal.
    const sectionId = snapshot.sections[0]?.id;
    if (sectionId === undefined) throw new Error("U1_TEST_NO_SECTION");
    expectOk(studio.insertMeasure(sectionId, null));
    const destination = studio.getSnapshot().sections[0]?.measures[1]?.id;
    if (destination === undefined) throw new Error("U1_TEST_NO_MEASURE");

    const before = studio.getSnapshot().revision;
    expectOk(studio.selectEvent(first));
    expectOk(studio.duplicateSelection(destination, "Half bar copy"));
    expect(studio.getSnapshot().revision).toBe(before + 1);
    expect(studio.getSnapshot().documentId).toBe(snapshot.documentId);
  });

  test("U1-EDIT-004 the insertion plan states one statement and publishes nothing", () => {
    const studio = controller();
    const measureId = firstMeasureId(studio.getSnapshot());
    const aim = (text: string): void => {
      const preview = studio.previewChartText(text);
      expectOk(
        studio.setQuickEntryDraft(
          text,
          { kind: "measure-start", measureId },
          preview.status,
          preview.issueCodes,
        ),
      );
    };

    const before = studio.getSnapshot().revision;
    expect(studio.previewInsertionPlan().statement).toBe("no-draft");

    aim("Dm9:2 G13:2");
    const fits = studio.previewInsertionPlan();
    expect(fits.statement).toBe("fits-measure");
    expect(fits.committable).toBe(true);
    // The plan reports the reviewed resolution tokens, not sentences, and
    // names the placement it will actually perform.
    expect(fits.resolutions).toEqual(["insert-parsed-preview"]);
    expect(fits.planKind).toBe("insert-fragment");
    expect(fits.placement).toBe("into-measure");
    expect(fits.blockedReason).toBeNull();

    // T0 refuses an underfilled bar outright, so the short-bar case is
    // recognised from its diagnostic rather than from a partial draft.
    aim("Dm9:2");
    const short = studio.previewInsertionPlan();
    expect(short.statement).toBe("incomplete-requires-confirmation");
    expect(short.committable).toBe(false);
    expect(short.resolutions).toContain("complete-the-final-measure");
    expect(short.blockedReason).toBe("u1.insertion_plan_requires_confirmation");
    expect(short.placement).toBeNull();

    aim("H7");
    const bad = studio.previewInsertionPlan();
    expect(bad.statement).toBe("not-atomic-refusal");
    expect(bad.committable).toBe(false);

    // The classification is presentation only: no revision moved.
    expect(studio.getSnapshot().revision).toBe(before);
  });

  test("U1-EDIT-004 a full destination states overfill-requires-split", () => {
    const studio = controller();
    seedOneBar(studio);
    const measureId = firstMeasureId(studio.getSnapshot());
    expectOk(
      studio.setInsertionPoint({ kind: "measure-start", measureId }),
    );
    const preview = studio.previewChartText("Cmaj9:4");
    expectOk(
      studio.setQuickEntryDraft(
        "Cmaj9:4",
        { kind: "measure-start", measureId },
        preview.status,
        preview.issueCodes,
      ),
    );

    const plan = studio.previewInsertionPlan();
    expect(plan.statement).toBe("overfill-requires-split");
    expect(plan.committable).toBe(false);
    expect(plan.resolutions).toContain("shorten-the-draft");
    expect(plan.blockedReason).toBe("u1.insertion_plan_overfills_destination");
    // The blocked statement is never resolved silently.
    expect(refusalCode(studio.applyQuickEntryPreview())).toBe(
      "u1.insertion_plan_overfills_destination",
    );
    expect(chordIds(studio.getSnapshot())).toHaveLength(2);
  });

  /**
   * The reviewed operation matrix's refusal rows. Each names the gesture it
   * declares and the exact code it must produce, and every one of them must
   * publish nothing: a refusal that still moved the chart would be a silent
   * partial edit.
   */
  test("U1-OPC-038 an unparsable inline symbol refuses and changes nothing", () => {
    const studio = controller();
    seedOneBar(studio);
    const [first] = chordIds(studio.getSnapshot());
    if (first === undefined) throw new Error("U1_TEST_NO_CHORD");
    const observed = observe(studio, () => studio.applyInlineSymbol(first, "H7"));
    expect(refusalCode(observed.result)).toBe("u1.symbol_draft_invalid");
    expect(observed.channel.revisionDelta).toBe(0);
  });

  test("U1-OPC-040 a duration beyond the bar capacity refuses", () => {
    const studio = controller();
    seedOneBar(studio);
    const [first] = chordIds(studio.getSnapshot());
    if (first === undefined) throw new Error("U1_TEST_NO_CHORD");
    expectOk(studio.selectEvent(first));
    const observed = observe(studio, () =>
      studio.setEventDurationText(first, "5"),
    );
    expect(refusalCode(observed.result)).toBe("u1.duration_overfills_measure");
    expect(observed.channel.revisionDelta).toBe(0);
  });

  test("U1-OPC-041 a shorter duration refuses without a stated reason", () => {
    const studio = controller();
    seedOneBar(studio);
    const [first] = chordIds(studio.getSnapshot());
    if (first === undefined) throw new Error("U1_TEST_NO_CHORD");
    expectOk(studio.selectEvent(first));
    const observed = observe(studio, () =>
      studio.setEventDurationText(first, "1"),
    );
    expect(refusalCode(observed.result)).toBe("u1.completion_reason_required");
    expect(observed.channel.revisionDelta).toBe(0);
  });

  test("U1-OPC-044 joining refuses when the right chord carries a note", () => {
    const studio = controller();
    // The annotation belongs to the right-hand chord, which join would have to
    // discard; the contract refuses rather than dropping a caller's note.
    seedOneBar(studio, 'Dm9:2 Dm9:2 "turnaround"');
    const [first] = chordIds(studio.getSnapshot());
    if (first === undefined) throw new Error("U1_TEST_NO_CHORD");
    const observed = observe(studio, () => studio.joinEventDurations(first));
    expect(refusalCode(observed.result)).toBe(
      "u1.join_right_annotation_not_empty",
    );
    expect(observed.channel.revisionDelta).toBe(0);
  });

  test("U1-OPC-048 a drop position outside the destination measure refuses", () => {
    const studio = controller();
    seedOneBar(studio);
    expectOk(studio.insertMeasure(firstSectionId(studio.getSnapshot()), null));
    const [first] = chordIds(studio.getSnapshot());
    const second = studio.getSnapshot().sections[0]?.measures[1]?.id;
    if (first === undefined || second === undefined) {
      throw new Error("U1_TEST_NO_TARGET");
    }
    expectOk(studio.selectEvent(first));
    // The destination is the empty second measure while the drop position
    // names a chord in the first: U1 refuses that before dispatch.
    const observed = observe(studio, () =>
      studio.moveSelectionTo(second, first),
    );
    expect(refusalCode(observed.result)).toBe("u1.move_destination_invalid");
    expect(observed.channel.revisionDelta).toBe(0);
  });

  test("a move onto a chord's own position is refused by A0 verbatim", () => {
    const studio = controller();
    seedOneBar(studio);
    const [first] = chordIds(studio.getSnapshot());
    if (first === undefined) throw new Error("U1_TEST_NO_CHORD");
    expectOk(studio.selectEvent(first));
    // U1 guards the destination, not the identity of a no-op move, so this
    // one reaches A0 and its refusal is surfaced with A0's own code.
    const observed = observe(studio, () =>
      studio.moveSelectionTo(firstMeasureId(studio.getSnapshot()), first),
    );
    expect(refusalCode(observed.result)).toBe("command.destination_invalid");
    expect(observed.channel.revisionDelta).toBe(0);
  });

  test("U1-OPC-049 Delete with no selection refuses", () => {
    const studio = controller();
    seedOneBar(studio);
    expectOk(studio.clearSelection());
    const observed = observe(studio, () => studio.deleteSelection());
    expect(refusalCode(observed.result)).toBe("u1.selection_empty");
    expect(observed.channel.revisionDelta).toBe(0);
  });

  test("a refused command is surfaced verbatim and never retried", () => {
    const studio = controller();
    seedOneBar(studio);
    const [first] = chordIds(studio.getSnapshot());
    if (first === undefined) throw new Error("U1_TEST_NO_CHORD");
    expectOk(studio.selectEvent(first));

    const before = studio.getSnapshot();
    const result = studio.setEventDurationText(first, "3");
    if (result.ok) throw new Error("U1_TEST_EXPECTED_REFUSAL");
    expect(result.refusal.code).toBe("u1.duration_overfills_measure");
    expect(result.refusal.action).toBe("set-event-duration");
    // The refusal is a pre-dispatch guard: no state moved at all.
    expect(studio.getSnapshot().revision).toBe(before.revision);
    expect(studio.getSnapshot().sections).toEqual(before.sections);
  });
});

/**
 * The literal A0 requires for the recovered-chord lane. It is written out here
 * rather than imported so a silent change to the upstream constant fails this
 * suite instead of travelling through it unnoticed.
 */
const LAYOUT_LOSS_ACKNOWLEDGEMENT =
  "source-bar-and-section-layout-will-be-lost@1";

/** Aim a refused draft at a measure exactly as the surface does. */
function aimRefusedDraft(
  studio: StudioController,
  text: string,
  measureId = firstMeasureId(studio.getSnapshot()),
): void {
  const preview = studio.previewChartText(text);
  expect(preview.status).toBe("invalid");
  expectOk(
    studio.setQuickEntryDraft(
      text,
      { kind: "measure-start", measureId },
      preview.status,
      preview.issueCodes,
    ),
  );
}

describe("U1-EDIT-006 the recovered-chord lane", () => {
  test("U1-OPC-005 one recovered chord is exactly one document command", () => {
    const studio = controller();
    aimRefusedDraft(studio, "Dm9:2 G13:1 X");

    const observed = observe(studio, () =>
      studio.insertRecoveredChord(
        0,
        "",
        LAYOUT_LOSS_ACKNOWLEDGEMENT,
        "Recovered one chord from a refused draft",
      ),
    );
    expectOk(observed.result);
    expect(observed.channel.revisionDelta).toBe(1);
    expect(observed.channel.undoLabelChanged).toBe(true);

    // Exactly one chord arrived: applying "the valid parts" is not an operation.
    const chart = studio.getSnapshot();
    expect(chordIds(chart)).toHaveLength(1);
    const measure = chart.sections[0]?.measures[0];
    expect(measure?.events[0]?.durationBeatLabel).toBe("2/1");
    expect(measure?.fill).toBe("underfilled");
    // The short bar is declared, never silently rebalanced or padded with rests.
    expect(measure?.completionLabel).toBe("Intentionally incomplete measure");
  });

  test("the lane refuses without the literal acknowledgement", () => {
    const studio = controller();
    aimRefusedDraft(studio, "Dm9:2 G13:1 X");
    const before = studio.getSnapshot();

    for (const attempt of ["", "yes", "source-bar-and-section-layout-will-be-lost"]) {
      const observed = observe(studio, () =>
        studio.insertRecoveredChord(0, "", attempt, "A reason"),
      );
      expect(refusalCode(observed.result)).toBe("u1.quick_entry_lane_mismatch");
      expect(observed.channel.revisionDelta).toBe(0);
    }
    expect(studio.getSnapshot().sections).toEqual(before.sections);
  });

  test("a short bar must be declared before the chord is published", () => {
    const studio = controller();
    aimRefusedDraft(studio, "Dm9:2 G13:1 X");

    const blocked = studio.insertRecoveredChord(
      0,
      "",
      LAYOUT_LOSS_ACKNOWLEDGEMENT,
    );
    expect(refusalCode(blocked)).toBe("u1.completion_reason_required");
    expect(chordIds(studio.getSnapshot())).toHaveLength(0);
  });

  test("a chord longer than the destination refuses before dispatch", () => {
    const studio = controller();
    aimRefusedDraft(studio, "Dm9:5");

    const observed = observe(studio, () =>
      studio.insertRecoveredChord(0, "", LAYOUT_LOSS_ACKNOWLEDGEMENT, "A reason"),
    );
    expect(refusalCode(observed.result)).toBe("u1.duration_overfills_measure");
    expect(observed.channel.revisionDelta).toBe(0);
  });

  test("a resolved duration refuses a caller duration outright", () => {
    const studio = controller();
    aimRefusedDraft(studio, "Dm9:2 G13:1 X");

    expect(
      refusalCode(
        studio.insertRecoveredChord(0, "3", LAYOUT_LOSS_ACKNOWLEDGEMENT, "A reason"),
      ),
    ).toBe("u1.duration_invalid");
  });

  test("a requires-caller duration needs exact beat text", () => {
    const studio = controller();
    // T0 publishes the trailing chord with `chart.layout_invalid`, so its
    // duration is the caller's to supply exactly.
    aimRefusedDraft(studio, "Dm9:2 G13:2 | Cmaj7");
    const preview = studio.previewQuickEntryDraft();
    const requiring = preview.tokens.find((token) => token.requiresDuration);
    expect(requiring?.globalOrdinal).toBe(2);
    expect(requiring?.durationLabel).toBeNull();

    expect(
      refusalCode(
        studio.insertRecoveredChord(2, "", LAYOUT_LOSS_ACKNOWLEDGEMENT),
      ),
    ).toBe("u1.duration_invalid");
    expect(
      refusalCode(
        studio.insertRecoveredChord(2, "two", LAYOUT_LOSS_ACKNOWLEDGEMENT),
      ),
    ).toBe("u1.duration_invalid");

    // An exact bar-filling value completes the measure with no reason needed.
    expectOk(studio.insertRecoveredChord(2, "4", LAYOUT_LOSS_ACKNOWLEDGEMENT));
    const measure = studio.getSnapshot().sections[0]?.measures[0];
    expect(measure?.fill).toBe("exact-fill");
    expect(measure?.events).toHaveLength(1);
    expect(measure?.events[0]?.durationBeatLabel).toBe("4/1");
  });

  test("a parsed draft has no recovered lane at all", () => {
    const studio = controller();
    const measureId = firstMeasureId(studio.getSnapshot());
    expectOk(
      studio.setQuickEntryDraft(
        "Dm9:2 G13:2",
        { kind: "measure-start", measureId },
        "ready",
        [],
      ),
    );
    const preview = studio.previewQuickEntryDraft();
    expect(preview.recovery.available).toBe(false);
    expect(preview.tokens.every((token) => token.state === "valid")).toBe(true);
    expect(preview.tokens).toHaveLength(2);
    expect(
      refusalCode(studio.insertRecoveredChord(0, "", LAYOUT_LOSS_ACKNOWLEDGEMENT)),
    ).toBe("u1.quick_entry_lane_mismatch");
  });

  test("an ordinal T0 never published refuses", () => {
    const studio = controller();
    aimRefusedDraft(studio, "Dm9:2 G13:1 X");
    expect(
      refusalCode(
        studio.insertRecoveredChord(9, "", LAYOUT_LOSS_ACKNOWLEDGEMENT, "A reason"),
      ),
    ).toBe("u1.target_missing");
  });

  test("a section boundary is not a recovered-chord destination", () => {
    const studio = controller();
    const sectionId = studio.getSnapshot().sections[0]?.id;
    if (sectionId === undefined) throw new Error("U1_TEST_NO_SECTION");
    const preview = studio.previewChartText("Dm9:2 G13:1 X");
    expectOk(
      studio.setQuickEntryDraft(
        "Dm9:2 G13:1 X",
        { kind: "section-end", sectionId },
        preview.status,
        preview.issueCodes,
      ),
    );

    expect(studio.previewQuickEntryDraft().recovery.available).toBe(false);
    expect(
      refusalCode(
        studio.insertRecoveredChord(0, "", LAYOUT_LOSS_ACKNOWLEDGEMENT, "A reason"),
      ),
    ).toBe("u1.insertion_plan_not_atomic");
  });

  test("the preview states the lane without publishing anything", () => {
    const studio = controller();
    const before = studio.getSnapshot().revision;
    aimRefusedDraft(studio, "Dm9:2 G13:1 X");

    const preview = studio.previewQuickEntryDraft();
    expect(preview.recovery.available).toBe(true);
    expect(preview.recovery.acknowledgement).toBe(LAYOUT_LOSS_ACKNOWLEDGEMENT);
    expect(preview.recovery.remainderLabel).toBe("4/1");

    // Exactly one insertable row per published chord, and no valid rows.
    const insertable = preview.tokens.filter(
      (token) => token.state === "insertable",
    );
    expect(insertable.map((token) => token.globalOrdinal)).toEqual([0, 1]);
    expect(insertable.map((token) => token.sourceText)).toEqual([
      "Dm9:2",
      "G13:1",
    ]);
    expect(insertable.every((token) => token.requiresCompletionReason)).toBe(
      true,
    );
    expect(preview.tokens.some((token) => token.state === "valid")).toBe(false);
    // The diagnostic keeps its own code and its own exact source slice.
    const invalid = preview.tokens.filter((token) => token.state === "invalid");
    expect(invalid).toHaveLength(1);
    expect(invalid[0]?.diagnosticCode).toBe("symbol.root_invalid");
    expect(invalid[0]?.sourceText).toBe("X");

    expect(studio.getSnapshot().revision).toBe(before);
  });

  test("publishing a command closes the lane instead of leaving stale rows", () => {
    const studio = controller();
    aimRefusedDraft(studio, "Dm9:2 G13:1 X");
    const sectionId = studio.getSnapshot().sections[0]?.id;
    if (sectionId === undefined) throw new Error("U1_TEST_NO_SECTION");

    // A0 clears the draft with every publication, so no recovered row can
    // outlive the chart it was measured against.
    expectOk(studio.insertMeasure(sectionId, null));
    expect(studio.getSnapshot().quickEntry.text).toBe("");
    expect(studio.getSnapshot().quickEntry.status).toBe("idle");

    const preview = studio.previewQuickEntryDraft();
    expect(preview.tokens).toEqual([]);
    expect(preview.recovery.available).toBe(false);
    expect(
      refusalCode(
        studio.insertRecoveredChord(0, "", LAYOUT_LOSS_ACKNOWLEDGEMENT, "A reason"),
      ),
    ).toBe("u1.quick_entry_lane_mismatch");
  });

  test("undo restores the chart the recovered chord changed", () => {
    const studio = controller();
    aimRefusedDraft(studio, "Dm9:2 G13:1 X");
    const before = studio.getSnapshot();

    expectOk(
      studio.insertRecoveredChord(0, "", LAYOUT_LOSS_ACKNOWLEDGEMENT, "A reason"),
    );
    expect(chordIds(studio.getSnapshot())).toHaveLength(1);

    expectOk(studio.undo());
    expect(chordIds(studio.getSnapshot())).toHaveLength(0);
    expect(studio.getSnapshot().sections[0]?.measures[0]?.fill).toBe(
      before.sections[0]?.measures[0]?.fill,
    );
  });
});
