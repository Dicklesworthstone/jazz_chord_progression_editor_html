import { describe, expect, test } from "bun:test";

import {
  createStudioController,
  DELETE_AUTO_COMPLETION_REASON,
  deleteSelectionAutoDeclaring,
  DUPLICATE_AUTO_COMPLETION_REASON,
  duplicateSelectionAutoResolving,
  type StudioController,
  type StudioControllerActionResult,
  type StudioViewModel,
} from "../../src/application";

/**
 * Regression proofs for the jcpe-yvni edit-flow gestures, run through the
 * REAL controller: a routine delete lands with an auto-declared completion
 * in one undoable command, a duplicate in a full bar lands the copy in a
 * fresh following bar as the minimal two-command sequence, and the
 * deliberate declare-completion path still asks for a custom reason.
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
  expect(created.ok).toBe(true);
  if (!created.ok) {
    throw new Error(`GESTURE_TEST_BOOTSTRAP:${created.refusal.code}`);
  }
  return created.controller;
}

function expectOk(
  result: StudioControllerActionResult,
): Extract<StudioControllerActionResult, { ok: true }> {
  if (!result.ok) {
    throw new Error(`GESTURE_TEST_UNEXPECTED_REFUSAL:${result.refusal.code}`);
  }
  return result;
}

function refusalCode(result: StudioControllerActionResult): string {
  if (result.ok) throw new Error("GESTURE_TEST_EXPECTED_REFUSAL");
  return result.refusal.code;
}

function firstMeasureId(snapshot: StudioViewModel): string {
  const id = snapshot.sections[0]?.measures[0]?.id;
  if (id === undefined) throw new Error("GESTURE_TEST_NO_MEASURE");
  return id;
}

function firstSectionId(snapshot: StudioViewModel): string {
  const id = snapshot.sections[0]?.id;
  if (id === undefined) throw new Error("GESTURE_TEST_NO_SECTION");
  return id;
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

/** Publish whole bars at the section end, so multi-bar charts exist to copy. */
function seedBars(studio: StudioController, text: string): void {
  const sectionId = firstSectionId(studio.getSnapshot());
  expectOk(
    studio.setQuickEntryDraft(
      text,
      { kind: "section-end", sectionId },
      "ready",
      [],
    ),
  );
  expectOk(studio.applyQuickEntryPreview());
}

describe("jcpe-yvni delete auto-declares the shortened bar", () => {
  test("one delete command lands with the reviewed reason and undoes in one step", () => {
    const studio = controller();
    seedOneBar(studio);
    const [first] = chordIds(studio.getSnapshot());
    if (first === undefined) throw new Error("GESTURE_TEST_NO_CHORD");
    expectOk(studio.selectEvent(first));
    const before = studio.getSnapshot();

    const deleted = expectOk(deleteSelectionAutoDeclaring(studio));
    expect(deleted.snapshot.chordCount).toBe(1);
    // Exactly one A0 command: delete carries its completion update atomically.
    expect(deleted.snapshot.revision).toBe(before.revision + 1);
    const measure = deleted.snapshot.sections[0]?.measures[0];
    expect(measure?.completion).toBe("incomplete");
    expect(measure?.fill).toBe("underfilled");
    // The DOMAIN law is intact: the short bar STORES a reason — the reviewed
    // constant — instead of interrogating the user for one.
    expect(measure?.completionReason).toBe(DELETE_AUTO_COMPLETION_REASON);

    const undone = expectOk(studio.undo());
    expect(undone.snapshot.chordCount).toBe(2);
    expect(undone.snapshot.sections[0]?.measures[0]?.completion).toBe(
      "complete",
    );
    expect(undone.snapshot.sections[0]?.measures[0]?.completionReason).toBe(
      null,
    );
  });

  test("deleting every chord still yields the empty completion, not a reason", () => {
    const studio = controller();
    seedOneBar(studio);
    const [first, second] = chordIds(studio.getSnapshot());
    if (first === undefined || second === undefined) {
      throw new Error("GESTURE_TEST_NO_CHORD");
    }
    expectOk(studio.selectEvent(first));
    expectOk(studio.extendSelectionTo(second));

    const deleted = expectOk(deleteSelectionAutoDeclaring(studio));
    expect(deleted.snapshot.chordCount).toBe(0);
    const measure = deleted.snapshot.sections[0]?.measures[0];
    expect(measure?.completion).toBe("empty");
    expect(measure?.completionReason).toBe(null);
  });
});

describe("jcpe-yvni duplicate lands by default", () => {
  test("an overfilled focus bar resolves into a fresh following bar", () => {
    const studio = controller();
    seedOneBar(studio);
    const [first] = chordIds(studio.getSnapshot());
    if (first === undefined) throw new Error("GESTURE_TEST_NO_CHORD");
    expectOk(studio.selectEvent(first));
    const before = studio.getSnapshot();
    expect(before.sections[0]?.measures).toHaveLength(1);

    const duplicated = expectOk(duplicateSelectionAutoResolving(studio));
    expect(duplicated.snapshot.chordCount).toBe(3);
    const measures = duplicated.snapshot.sections[0]?.measures ?? [];
    expect(measures).toHaveLength(2);
    // The source bar is byte-for-byte what it was.
    expect(measures[0]?.completion).toBe("complete");
    expect(measures[0]?.events.map((event) => event.symbolText)).toEqual([
      "Dm9",
      "G13",
    ]);
    // The copy landed in the fresh following bar — the split-here end state —
    // with its short fill auto-declared under the reviewed constant.
    expect(measures[1]?.events.map((event) => event.symbolText)).toEqual([
      "Dm9",
    ]);
    expect(measures[1]?.events[0]?.durationBeatLabel).toBe("2/1");
    expect(measures[1]?.completion).toBe("incomplete");
    expect(measures[1]?.completionReason).toBe(
      DUPLICATE_AUTO_COMPLETION_REASON,
    );
    // The pinned vocabulary has no composite command, so the gesture is the
    // minimal sequence: insert-measure then duplicate, two undoable steps.
    expect(duplicated.snapshot.revision).toBe(before.revision + 2);
    const undoneCopy = expectOk(studio.undo());
    expect(undoneCopy.snapshot.chordCount).toBe(2);
    expect(undoneCopy.snapshot.sections[0]?.measures).toHaveLength(2);
    const undoneBar = expectOk(studio.undo());
    expect(undoneBar.snapshot.sections[0]?.measures).toHaveLength(1);
    expect(undoneBar.snapshot.chordCount).toBe(2);
  });

  test("copies that exactly fill the fresh bar declare it complete", () => {
    const studio = controller();
    seedOneBar(studio);
    const [first, second] = chordIds(studio.getSnapshot());
    if (first === undefined || second === undefined) {
      throw new Error("GESTURE_TEST_NO_CHORD");
    }
    expectOk(studio.selectEvent(first));
    expectOk(studio.extendSelectionTo(second));

    const duplicated = expectOk(duplicateSelectionAutoResolving(studio));
    const measures = duplicated.snapshot.sections[0]?.measures ?? [];
    expect(measures).toHaveLength(2);
    expect(measures[1]?.events.map((event) => event.symbolText)).toEqual([
      "Dm9",
      "G13",
    ]);
    expect(measures[1]?.completion).toBe("complete");
    expect(measures[1]?.completionReason).toBe(null);
  });

  test("a bar with room takes the copy in one command and states its own fill", () => {
    const studio = controller();
    seedOneBar(studio);
    const [first, second] = chordIds(studio.getSnapshot());
    if (first === undefined || second === undefined) {
      throw new Error("GESTURE_TEST_NO_CHORD");
    }
    // Shorten the bar first through the delete gesture, then duplicate the
    // survivor: the copy fits, so the plain duplicate lands as ONE command
    // and the now-exact fill is declared complete.
    expectOk(studio.selectEvent(second));
    expectOk(deleteSelectionAutoDeclaring(studio));
    expectOk(studio.selectEvent(first));
    const before = studio.getSnapshot();

    const duplicated = expectOk(duplicateSelectionAutoResolving(studio));
    expect(duplicated.snapshot.revision).toBe(before.revision + 1);
    const measure = duplicated.snapshot.sections[0]?.measures[0];
    expect(measure?.events.map((event) => event.symbolText)).toEqual([
      "Dm9",
      "Dm9",
    ]);
    expect(measure?.completion).toBe("complete");
    expect(measure?.completionReason).toBe(null);
    expect(duplicated.snapshot.sections[0]?.measures).toHaveLength(1);
  });

  test("a short copy into a roomy bar auto-declares with the duplicate reason", () => {
    const studio = controller();
    seedOneBar(studio, "C:1 D:1 E:1 F:1");
    const ids = chordIds(studio.getSnapshot());
    const [c, , e, f] = ids;
    if (c === undefined || e === undefined || f === undefined) {
      throw new Error("GESTURE_TEST_NO_CHORD");
    }
    // Leave the bar at 2/4 via the delete gesture, then copy one 1-beat chord.
    expectOk(studio.selectEvent(e));
    expectOk(studio.extendSelectionTo(f));
    expectOk(deleteSelectionAutoDeclaring(studio));
    expectOk(studio.selectEvent(c));
    const before = studio.getSnapshot();

    const duplicated = expectOk(duplicateSelectionAutoResolving(studio));
    expect(duplicated.snapshot.revision).toBe(before.revision + 1);
    const measure = duplicated.snapshot.sections[0]?.measures[0];
    expect(measure?.events).toHaveLength(3);
    expect(measure?.completion).toBe("incomplete");
    expect(measure?.completionReason).toBe(
      DUPLICATE_AUTO_COMPLETION_REASON,
    );
  });

  test("a selection wider than one bar keeps the honest refusal and inserts nothing", () => {
    const studio = controller();
    seedBars(studio, "| C:4 | D:4 |");
    const [first, second] = chordIds(studio.getSnapshot());
    if (first === undefined || second === undefined) {
      throw new Error("GESTURE_TEST_NO_CHORD");
    }
    expectOk(studio.selectEvent(first));
    expectOk(studio.extendSelectionTo(second));
    const before = studio.getSnapshot();

    const result = duplicateSelectionAutoResolving(studio);
    expect(refusalCode(result)).toBe("u1.duration_overfills_measure");
    const after = studio.getSnapshot();
    expect(after.revision).toBe(before.revision);
    expect(after.sections[0]?.measures).toHaveLength(2);
    expect(after.chordCount).toBe(2);
  });
});

describe("jcpe-yvni the deliberate custom-reason path is intact", () => {
  test("declare-completion still refuses without a reason and stores a typed one", () => {
    const studio = controller();
    seedOneBar(studio);
    const [first] = chordIds(studio.getSnapshot());
    if (first === undefined) throw new Error("GESTURE_TEST_NO_CHORD");
    expectOk(studio.selectEvent(first));
    expectOk(deleteSelectionAutoDeclaring(studio));
    const measureId = firstMeasureId(studio.getSnapshot());

    // The card-menu path with no reason is exactly what opens U1-CMP-019:
    // the reason-required refusal is unchanged for the deliberate flow.
    expect(refusalCode(studio.declareMeasureCompletion(measureId))).toBe(
      "u1.completion_reason_required",
    );

    // A typed custom reason replaces the reviewed constant verbatim.
    const declared = expectOk(
      studio.declareMeasureCompletion(measureId, "Pickup into the head"),
    );
    const measure = declared.snapshot.sections[0]?.measures[0];
    expect(measure?.completion).toBe("incomplete");
    expect(measure?.completionReason).toBe("Pickup into the head");
  });
});
