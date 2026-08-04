import { describe, expect, test } from "bun:test";

import {
  createStudioController,
  type StudioController,
  type StudioControllerActionResult,
  type StudioViewModel,
} from "../../src/application";

/**
 * Reviewed interaction states from `tests/fixtures/editing/interaction-state-matrix.json`
 * whose subject is application state rather than rendering.
 *
 * The bookmark, focus-repair, cancellation, and stale rows state facts about
 * what A0 holds after a gesture, so they are provable against the real
 * controller without a browser. The pointer, listener, empty-state, and error
 * rows state facts about the rendered surface and are driven in `tests/e2e`.
 */

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

function chordIds(snapshot: StudioViewModel): readonly string[] {
  return snapshot.sections.flatMap((section) =>
    section.measures.flatMap((measure) => measure.events.map((e) => e.id)),
  );
}

function firstMeasureId(snapshot: StudioViewModel): string {
  const id = snapshot.sections[0]?.measures[0]?.id;
  if (id === undefined) throw new Error("U1_TEST_NO_MEASURE");
  return id;
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

describe("U1-TRACE-BOOKMARKS the four concepts stay independent", () => {
  test("U1-INT-005 selecting a chord never moves the insertion point", () => {
    const studio = controller();
    seedOneBar(studio, "Dm9:1 G13:1 C6:1 A7:1");
    const ids = chordIds(studio.getSnapshot());
    const [first, , third] = ids;
    if (first === undefined || third === undefined) {
      throw new Error("U1_TEST_NO_CHORD");
    }
    expectOk(studio.setInsertionPoint({ eventId: third, kind: "before-event" }));
    const aimed = studio.getSnapshot().bookmarks;
    expect(aimed.insertionTargetId).toBe(third);

    expectOk(studio.selectEvent(first));
    const after = studio.getSnapshot().bookmarks;
    expect(after.selectedEventIds).toEqual([first]);
    // Byte-for-byte: the insertion bookmark is the same value, not merely a
    // value that happens to point at the same chord.
    expect(JSON.stringify(after.insertionLabel)).toBe(
      JSON.stringify(aimed.insertionLabel),
    );
    expect(after.insertionTargetId).toBe(aimed.insertionTargetId);
  });

  test("U1-INT-005 selection, insertion, and range hold three different values at once", () => {
    const studio = controller();
    seedOneBar(studio, "Dm9:1 G13:1 C6:1 A7:1");
    const ids = chordIds(studio.getSnapshot());
    const [first, second, third, fourth] = ids;
    if (
      first === undefined ||
      second === undefined ||
      third === undefined ||
      fourth === undefined
    ) {
      throw new Error("U1_TEST_NO_CHORD");
    }
    const playheadBefore = studio.getSnapshot().transport.playheadBeatLabel;

    expectOk(studio.selectEvent(first));
    expectOk(studio.setInsertionPoint({ eventId: third, kind: "before-event" }));
    expectOk(
      studio.setRange(
        { eventId: second, kind: "before-event" },
        { eventId: fourth, kind: "after-event" },
      ),
    );

    const bookmarks = studio.getSnapshot().bookmarks;
    expect(bookmarks.selectedEventIds).toEqual([first]);
    expect(bookmarks.insertionTargetId).toBe(third);
    expect(bookmarks.rangeActive).toBe(true);
    // None of the three is derived from another, and none of them moved the
    // playhead, which is owned by the transport rather than by a bookmark.
    expect(bookmarks.rangeStartBeatLabel).not.toBe(null);
    expect(studio.getSnapshot().transport.playheadBeatLabel).toBe(
      playheadBefore,
    );
  });
});

describe("U1-TRACE-FOCUS the declared delete repair order", () => {
  test("U1-INT-014 deleting the last chord of a measure falls back to the previous chord", () => {
    const studio = controller();
    seedOneBar(studio, "Dm9:1 G13:1 C6:1 A7:1");
    const ids = chordIds(studio.getSnapshot());
    const last = ids[ids.length - 1];
    const previous = ids[ids.length - 2];
    if (last === undefined || previous === undefined) {
      throw new Error("U1_TEST_NO_CHORD");
    }
    expectOk(studio.selectEvent(last));
    expectOk(studio.deleteSelection("The last chord of the bar was removed"));

    const request = studio.getSnapshot().focusRequest;
    expect(request).not.toBe(null);
    // There is no next event to move to, so the repair order's second branch
    // applies: the preceding chord, never the document body.
    expect(request?.reason).toBe("delete-repair");
    expect(request?.kind).toBe("event");
    expect(request?.targetId).toBe(previous);
  });

  test("U1-INT-015 deleting the only chord of the only measure falls back to the section insertion target", () => {
    const studio = controller();
    seedOneBar(studio, "Dm9:4");
    const ids = chordIds(studio.getSnapshot());
    const [only] = ids;
    if (only === undefined) throw new Error("U1_TEST_NO_CHORD");
    const measureId = firstMeasureId(studio.getSnapshot());

    expectOk(studio.selectEvent(only));
    expectOk(studio.deleteSelection());

    const snapshot = studio.getSnapshot();
    expect(chordIds(snapshot)).toEqual([]);
    const request = snapshot.focusRequest;
    expect(request).not.toBe(null);
    expect(request?.reason).toBe("delete-repair");
    // A structural target, not the chart fallback and not the document body.
    expect(request?.kind).toBe("measure");
    expect(request?.targetId).toBe(measureId);
    expect(snapshot.bookmarks.insertionTargetId).toBe(measureId);
  });
});

describe("U1-TRACE-QUICKENTRY cancellation and staleness", () => {
  test("U1-INT-050 clearing the draft is one ephemeral intent and no command", () => {
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
    expect(studio.getSnapshot().quickEntry.text).toBe("Dm9:2 G13:2");

    const before = studio.getSnapshot();
    const cleared = expectOk(studio.clearQuickEntry());
    const after = studio.getSnapshot();

    expect(cleared.outcome).toBe("ephemeral-updated");
    expect(after.quickEntry.text).toBe("");
    expect(after.quickEntry.status).toBe("idle");
    expect(after.revision - before.revision).toBe(0);
    expect(after.history.undoLabel).toBe(before.history.undoLabel);
    expect(after.chordCount).toBe(before.chordCount);
  });

  test("U1-INT-051 a stale gesture never reaches A0", () => {
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
    const sectionId = studio.getSnapshot().sections[0]?.id;
    if (sectionId === undefined) throw new Error("U1_TEST_NO_SECTION");
    const captured = studio.getSnapshot().quickEntry.baseRevision;

    // Something else publishes while the draft is pending.
    expectOk(studio.insertMeasure(sectionId, null));
    const stale = studio.getSnapshot();
    expect(stale.revision).toBeGreaterThan(captured);

    // The row's guarantee holds one step earlier than it assumes. A0 clears the
    // quick-entry draft with every publication, so a draft carrying a stale
    // captured revision cannot exist to be dispatched: the draft is already
    // back to idle against the new revision.
    expect(stale.quickEntry.text).toBe("");
    expect(stale.quickEntry.status).toBe("idle");
    expect(stale.quickEntry.baseRevision).toBe(stale.revision);
    expect(stale.quickEntry.baseRevisionCurrent).toBe(true);

    // Activating Insert anyway is a U1 pre-dispatch refusal, not a command.
    const refused = studio.applyQuickEntryPreview();
    const after = studio.getSnapshot();
    expect(refusalCode(refused).startsWith("u1.")).toBe(true);
    expect(after.revision).toBe(stale.revision);
    expect(after.chordCount).toBe(stale.chordCount);
    expect(after.history.undoLabel).toBe(stale.history.undoLabel);
  });

  test("U1-INT-052 an out-of-band change repairs bookmarks and asks for focus", () => {
    const studio = controller();
    seedOneBar(studio, "Dm9:2 G13:2");
    const ids = chordIds(studio.getSnapshot());
    const [, second] = ids;
    if (second === undefined) throw new Error("U1_TEST_NO_CHORD");
    expectOk(studio.selectEvent(second));
    expect(studio.getSnapshot().bookmarks.selectedEventIds).toEqual([second]);

    // Undo removes the selected chord without the selection gesture knowing.
    expectOk(studio.undo());
    const after = studio.getSnapshot();

    expect(chordIds(after)).not.toContain(second);
    // A0 repaired the bookmark rather than leaving it pointing at a chord that
    // no longer exists, and published the focus the surface must render.
    expect(after.bookmarks.selectedEventIds).toEqual([]);
    expect(after.bookmarks.selectionFocusEventId).toBe(null);
    expect(after.focusRequest).not.toBe(null);
    expect(after.focusRequest?.reason).toBe("undo");
    expect(after.focusRequest?.targetId).not.toBe(null);
  });
});

describe("U1-TRACE-INLINE a duration notice states exact beats", () => {
  test("U1-INT-046 an overfilling duration reports current fill, resulting fill, and capacity", () => {
    const studio = controller();
    seedOneBar(studio, "Dm9:2 G13:2");
    const [first] = chordIds(studio.getSnapshot());
    if (first === undefined) throw new Error("U1_TEST_NO_CHORD");
    const before = studio.getSnapshot();
    const refused = studio.setEventDurationText(first, "5");
    const after = studio.getSnapshot();
    if (refused.ok) throw new Error("U1_TEST_EXPECTED_REFUSAL");

    expect(refused.refusal.code).toBe("u1.duration_overfills_measure");
    // Exact rationals, not a summary: 4/1 held now, 4/1 capacity, 7/1 after.
    expect(refused.refusal.message).toContain("4/1");
    expect(refused.refusal.message).toContain("7/1");
    // The recovery action still names the resolutions the fill state allows.
    expect(refused.refusal.recoveryAction).toContain("Shorten the duration");
    // Stating the arithmetic is not publishing it.
    expect(after.revision - before.revision).toBe(0);
    expect(after.sections[0]?.measures[0]?.durationBeatLabel).toBe(
      before.sections[0]?.measures[0]?.durationBeatLabel,
    );
  });

  test("U1-INT-047 a declared short measure keeps its stored reason verbatim", () => {
    const studio = controller();
    seedOneBar(studio, "Dm9:2 G13:2");
    const ids = chordIds(studio.getSnapshot());
    const [, second] = ids;
    if (second === undefined) throw new Error("U1_TEST_NO_CHORD");
    const reason = "Pickup bar into the head — deliberately two beats";
    expectOk(studio.selectEvent(second));
    expectOk(studio.deleteSelection(reason));

    const measure = studio.getSnapshot().sections[0]?.measures[0];
    expect(measure?.completion).toBe("incomplete");
    // Verbatim, and never invented: a measure with no stored reason is null.
    expect(measure?.completionReason).toBe(reason);
  });

  test("U1-INT-047 a complete measure invents no reason", () => {
    const studio = controller();
    seedOneBar(studio, "Dm9:2 G13:2");
    const measure = studio.getSnapshot().sections[0]?.measures[0];
    expect(measure?.completion).toBe("complete");
    expect(measure?.completionReason).toBe(null);
  });
});
