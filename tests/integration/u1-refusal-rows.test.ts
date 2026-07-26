import { describe, expect, test } from "bun:test";

import {
  createStudioController,
  type StudioController,
  type StudioControllerActionResult,
  type StudioViewModel,
} from "../../src/application";
import { MAX_SELECTED_EVENT_IDS } from "../../src/application/application-state-contract";
import {
  decodeDocumentShape,
  MAX_DOCUMENT_CHORD_EVENTS,
  MAX_SECTION_MEASURES,
} from "../../src/domain";
import {
  u1ChartCandidate,
  u1ControllerOverChart,
  u1ControllerOverChartOrThrow,
  u1SaturatedChart,
} from "../support/u1-chart-fixture";

/**
 * The reviewed operation matrix rows that the channel sweep cannot reach.
 *
 * `tests/conformance/u1-operation-channel-conformance.test.ts` drives all 36
 * positive rows and `tests/integration/u1-edit-channel.test.ts` drives eleven
 * of the twenty-three non-positive rows. The remainder need something the
 * studio's own quick entry cannot make: a chord with stored pitches, a chart at
 * the exact document capacity, a draft whose refusal is invisible until A0 sees
 * it, or a precondition that turns out to be unreachable from this surface at
 * all.
 *
 * Where a row is unreachable, this file proves *why* rather than skipping it.
 * An unreachable precondition is only honest evidence when the impossibility is
 * itself measured — otherwise "cannot happen" is indistinguishable from "was
 * never tried".
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

function firstMeasureId(snapshot: StudioViewModel): string {
  const id = snapshot.sections[0]?.measures[0]?.id;
  if (id === undefined) throw new Error("U1_TEST_NO_MEASURE");
  return id;
}

function chordIds(snapshot: StudioViewModel): readonly string[] {
  return snapshot.sections.flatMap((section) =>
    section.measures.flatMap((measure) => measure.events.map((e) => e.id)),
  );
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

/** One chord whose voicing carries exact stored pitches. */
function storedVoicingChart(mode: "manual" | "frozen") {
  return {
    sections: [
      {
        id: "fixture-section-a",
        measures: [
          {
            events: [
              {
                duration: { denominator: 1, numerator: 4 },
                id: "fixture-event-1",
                voicingMode: mode,
              },
            ],
            id: "fixture-measure-1",
          },
        ],
        name: "A",
      },
    ],
    title: `U1 ${mode} voicing chart`,
  } as const;
}

describe("U1-TRACE-INLINE stored pitches are never relabelled", () => {
  test("U1-OPC-036 F2 on a manual voicing refuses without reaching A0", () => {
    const studio = u1ControllerOverChartOrThrow(storedVoicingChart("manual"));
    const before = studio.getSnapshot();
    const [first] = chordIds(before);
    if (first === undefined) throw new Error("U1_TEST_NO_CHORD");
    const result = studio.applyInlineSymbol(first, "Dm7");
    const after = studio.getSnapshot();
    expect(refusalCode(result)).toBe("u1.symbol_edit_blocked_manual_voicing");
    expect(after.revision - before.revision).toBe(0);
    expect(after.history.undoLabel).toBe(before.history.undoLabel);
  });

  test("U1-OPC-037 F2 on a frozen voicing receives the same refusal", () => {
    const studio = u1ControllerOverChartOrThrow(storedVoicingChart("frozen"));
    const before = studio.getSnapshot();
    const [first] = chordIds(before);
    if (first === undefined) throw new Error("U1_TEST_NO_CHORD");
    const result = studio.applyInlineSymbol(first, "Dm7");
    const after = studio.getSnapshot();
    expect(refusalCode(result)).toBe("u1.symbol_edit_blocked_manual_voicing");
    expect(after.revision - before.revision).toBe(0);
  });

  test("U1-EDIT-011 the stored chart is byte-identical after both refusals", () => {
    for (const mode of ["manual", "frozen"] as const) {
      const studio = u1ControllerOverChartOrThrow(storedVoicingChart(mode));
      const before = JSON.stringify(studio.getSnapshot().sections);
      const [first] = chordIds(studio.getSnapshot());
      if (first === undefined) throw new Error("U1_TEST_NO_CHORD");
      expect(studio.applyInlineSymbol(first, "Dm7").ok).toBe(false);
      expect(JSON.stringify(studio.getSnapshot().sections)).toBe(before);
    }
  });
});

describe("U1-TRACE-CHANNEL the selection bound is the document bound", () => {
  test("U1-OPC-050 a selection of exactly 8,192 chords is one ephemeral intent", () => {
    const created = u1ControllerOverChart(
      u1SaturatedChart(MAX_DOCUMENT_CHORD_EVENTS),
    );
    if (!created.ok) throw new Error(`U1_TEST_FIXTURE:${created.reason}`);
    const studio = created.controller;
    const ids = chordIds(studio.getSnapshot());
    expect(ids).toHaveLength(MAX_SELECTED_EVENT_IDS);
    const first = ids[0];
    const last = ids[ids.length - 1];
    if (first === undefined || last === undefined) {
      throw new Error("U1_TEST_NO_CHORD");
    }
    expectOk(studio.selectEvent(first));
    const before = studio.getSnapshot();
    const extended = expectOk(studio.extendSelectionTo(last));
    const after = studio.getSnapshot();
    expect(extended.outcome).toBe("ephemeral-updated");
    expect(after.bookmarks.selectedEventIds).toHaveLength(
      MAX_SELECTED_EVENT_IDS,
    );
    // Exactly the maximum is accepted, and it is still not a document command.
    expect(after.revision - before.revision).toBe(0);
    expect(after.history.undoLabel).toBe(before.history.undoLabel);
  });

  test("U1-OPC-051 8,193 selected chords cannot exist to be refused", () => {
    // The U1 selection bound is not an independent number: it is the document's
    // own chord-event capacity. One event past the maximum therefore has no
    // valid document to live in, so the guard's refusal branch is unreachable
    // by construction rather than merely untested.
    expect(MAX_SELECTED_EVENT_IDS).toBe(MAX_DOCUMENT_CHORD_EVENTS);
    const oversized = decodeDocumentShape(
      u1ChartCandidate(u1SaturatedChart(MAX_DOCUMENT_CHORD_EVENTS + 1)),
    );
    expect(oversized.ok).toBe(false);
    const created = u1ControllerOverChart(
      u1SaturatedChart(MAX_DOCUMENT_CHORD_EVENTS + 1),
    );
    expect(created.ok).toBe(false);
  });

  test("the saturated fixture reaches both domain ceilings together", () => {
    const chart = u1SaturatedChart(MAX_DOCUMENT_CHORD_EVENTS);
    const section = chart.sections[0];
    if (section === undefined) throw new Error("U1_TEST_NO_SECTION");
    expect(section.measures).toHaveLength(MAX_SECTION_MEASURES);
    const events = section.measures.reduce(
      (total, measure) => total + measure.events.length,
      0,
    );
    expect(events).toBe(MAX_DOCUMENT_CHORD_EVENTS);
  });
});

describe("U1-TRACE-CHANNEL one gesture is never two commands", () => {
  test("U1-OPC-054 two Duplicate activations are two separate commands", () => {
    const studio = controller();
    seedOneBar(studio, "Dm9:4");
    const sectionId = studio.getSnapshot().sections[0]?.id;
    if (sectionId === undefined) throw new Error("U1_TEST_NO_SECTION");
    expectOk(studio.insertMeasure(sectionId, null));
    expectOk(studio.insertMeasure(sectionId, null));
    const measures = studio.getSnapshot().sections[0]?.measures ?? [];
    const secondMeasure = measures[1]?.id;
    const thirdMeasure = measures[2]?.id;
    if (secondMeasure === undefined || thirdMeasure === undefined) {
      throw new Error("U1_TEST_NO_MEASURE");
    }
    const [first] = chordIds(studio.getSnapshot());
    if (first === undefined) throw new Error("U1_TEST_NO_CHORD");
    expectOk(studio.selectEvent(first));

    const beforeFirst = studio.getSnapshot();
    expectOk(studio.duplicateSelection(secondMeasure));
    const afterFirst = studio.getSnapshot();
    expect(afterFirst.revision - beforeFirst.revision).toBe(1);
    expect(afterFirst.chordCount).toBe(beforeFirst.chordCount + 1);

    // The second activation happens with no clock tick between it and the
    // first, which is what "within one animation frame" means here. Coalescing
    // a second Duplicate into the first would show up as a zero delta.
    expectOk(studio.selectEvent(first));
    expectOk(studio.duplicateSelection(thirdMeasure));
    const afterSecond = studio.getSnapshot();
    expect(afterSecond.revision - afterFirst.revision).toBe(1);
    expect(afterSecond.chordCount).toBe(afterFirst.chordCount + 1);

    // Two activations, two undo steps: neither batched nor nested.
    expectOk(studio.undo());
    expect(studio.getSnapshot().chordCount).toBe(afterFirst.chordCount);
    expectOk(studio.undo());
    expect(studio.getSnapshot().chordCount).toBe(beforeFirst.chordCount);
  });
});

describe("U1-TRACE-CHANNEL regressions found while verifying U1", () => {
  /**
   * Found by driving `U1-OPC-035`: renaming the chart after any chord edit was
   * refused with `command.logical_time_invalid`. The title command carried its
   * own logical clock starting at zero, so its first stamp travelled backwards
   * past the shared clock every other command had already advanced. Every real
   * session hits this — the user types changes, then names the chart.
   */
  test("U1-OP-021 renaming after a chord edit still commits", () => {
    const studio = controller();
    seedOneBar(studio, "Dm9:4");
    const before = studio.getSnapshot();
    const renamed = expectOk(studio.setTitle("Blue Bossa"));
    const after = studio.getSnapshot();
    expect(renamed.outcome).toBe("committed");
    expect(after.title).toBe("Blue Bossa");
    expect(after.revision - before.revision).toBe(1);
  });

  test("U1-OP-021 consecutive renames stay separate undo entries", () => {
    const studio = controller();
    seedOneBar(studio, "Dm9:4");
    expectOk(studio.setTitle("First name"));
    expectOk(studio.setTitle("Second name"));
    expect(studio.getSnapshot().title).toBe("Second name");
    // The rename spacing must still exceed the text coalescing window, or the
    // two renames would collapse into one undo entry and the first exact title
    // could never be restored.
    expectOk(studio.undo());
    expect(studio.getSnapshot().title).toBe("First name");
    expectOk(studio.undo());
    expect(studio.getSnapshot().title).toBe("Untitled Changes");
  });

  test("U1-OP-021 a rename between two edits keeps logical time monotonic", () => {
    const studio = controller();
    seedOneBar(studio, "Dm9:4");
    expectOk(studio.setTitle("Interleaved"));
    const sectionId = studio.getSnapshot().sections[0]?.id;
    if (sectionId === undefined) throw new Error("U1_TEST_NO_SECTION");
    expectOk(studio.insertMeasure(sectionId, null));
    expectOk(studio.setTitle("Interleaved again"));
    expect(studio.getSnapshot().title).toBe("Interleaved again");
  });
});

describe("U1-TRACE-CHANNEL preconditions this surface cannot produce", () => {
  test("U1-OPC-035 no U1 operation can change the document identity", () => {
    const studio = controller();
    const documentId = studio.getSnapshot().documentId;
    seedOneBar(studio, "Dm9:4");
    const sectionId = studio.getSnapshot().sections[0]?.id;
    if (sectionId === undefined) throw new Error("U1_TEST_NO_SECTION");
    expectOk(studio.insertMeasure(sectionId, null));
    const secondMeasure = studio.getSnapshot().sections[0]?.measures[1]?.id;
    if (secondMeasure === undefined) throw new Error("U1_TEST_NO_MEASURE");
    const [first] = chordIds(studio.getSnapshot());
    if (first === undefined) throw new Error("U1_TEST_NO_CHORD");
    expectOk(studio.selectEvent(first));
    expectOk(studio.duplicateSelection(secondMeasure));
    expectOk(studio.setTitle("Renamed"));
    expectOk(studio.insertSection(null, "B"));
    expectOk(studio.undo());
    expectOk(studio.redo());
    // `replace-document` is frozen outside the U1 command surface, so the
    // expected-document mismatch the row describes has no U1 gesture that can
    // create it: every command this surface publishes carries the identity the
    // live snapshot still reports.
    expect(studio.getSnapshot().documentId).toBe(documentId);
  });

  test("U1-OPC-034 a gesture after an out-of-band change re-reads the snapshot", () => {
    const studio = controller();
    seedOneBar(studio);
    const ids = chordIds(studio.getSnapshot());
    const [first] = ids;
    if (first === undefined) throw new Error("U1_TEST_NO_CHORD");
    expectOk(studio.selectEvent(first));
    const captured = studio.getSnapshot().revision;

    // Advance the revision out of band, exactly as another command would.
    expectOk(studio.insertMeasure(
      studio.getSnapshot().sections[0]?.id ?? "",
      null,
    ));
    expect(studio.getSnapshot().revision).toBeGreaterThan(captured);

    // The Delete gesture holds no captured revision to go stale: it reads the
    // live snapshot at dispatch. The row's guarantee — a stale gesture never
    // reaches A0 — therefore holds one step earlier, and the command that does
    // run is the correct one against current state.
    const before = studio.getSnapshot();
    expectOk(studio.deleteSelection("Stale-gesture proof left this bar short"));
    const after = studio.getSnapshot();
    expect(after.revision - before.revision).toBe(1);
    expect(chordIds(after)).not.toContain(first);
  });

  test("U1-OPC-052 a draft T0 refuses is caught before dispatch, not after", () => {
    const studio = controller();
    const measureId = firstMeasureId(studio.getSnapshot());
    // The status is forced to `ready` by the caller, which is the only way the
    // row's premise — "the surface cannot see the refusal in advance" — could
    // arise. It still does not arise: the plan is recomputed from the draft.
    expectOk(
      studio.setQuickEntryDraft(
        "!!! not a chord !!!",
        { kind: "measure-start", measureId },
        "ready",
        [],
      ),
    );

    const plan = studio.previewInsertionPlan();
    expect(plan.statement).toBe("not-atomic-refusal");
    expect(plan.committable).toBe(false);
    expect(plan.blockedReason).toBe("u1.insertion_plan_not_atomic");

    const before = studio.getSnapshot();
    const refused = studio.applyQuickEntryPreview();
    const after = studio.getSnapshot();

    // The row expects the command to be dispatched once and A0's nested
    // `edit-plan.syntax-refused` to be surfaced. The product refuses one step
    // earlier with its own pre-dispatch guard, so no command is published at
    // all — a strictly stronger guarantee than the row asks for, and the
    // reason its A0 refusal branch is unreachable from this surface.
    expect(refusalCode(refused)).toBe("u1.insertion_plan_not_atomic");
    expect(after.revision - before.revision).toBe(0);
    expect(after.history.undoLabel).toBe(before.history.undoLabel);
    expect(after.chordCount).toBe(before.chordCount);
    // And the draft is untouched: a refused preflight never rewrites the text.
    expect(after.quickEntry.text).toBe("!!! not a chord !!!");
  });

  test("U1-OPC-053 no U1 operation touches an unauthorized command's subject", () => {
    // The six unauthorized kinds are set-voicing, set-document-settings,
    // transpose, apply-suggestion, apply-reharmonization, and replace-document.
    // Each one would move a value this surface must never move, so driving the
    // surface hard and watching those values is a behavioural proof that no
    // U1 gesture reaches them.
    const studio = u1ControllerOverChartOrThrow({
      sections: [
        {
          id: "fixture-section-a",
          measures: [
            {
              events: [
                {
                  duration: { denominator: 1, numerator: 2 },
                  id: "fixture-event-1",
                  voicingMode: "manual",
                },
                {
                  duration: { denominator: 1, numerator: 2 },
                  id: "fixture-event-2",
                  voicingMode: "auto",
                },
              ],
              id: "fixture-measure-1",
            },
            { events: [], id: "fixture-measure-2" },
          ],
          name: "A",
        },
      ],
    });
    const settingsOf = (snapshot: StudioViewModel) =>
      JSON.stringify({
        countInBars: snapshot.countInBars,
        documentId: snapshot.documentId,
        instrumentLabel: snapshot.instrumentLabel,
        keyLabel: snapshot.keyLabel,
        masterVolume: snapshot.masterVolume,
        meterLabel: snapshot.meterLabel,
        reverbAmount: snapshot.reverbAmount,
        tempoBpm: snapshot.tempoBpm,
      });
    const chordById = (snapshot: StudioViewModel, id: string) => {
      const found = snapshot.sections
        .flatMap((section) => section.measures.flatMap((m) => m.events))
        .find((event) => event.id === id);
      if (found === undefined) throw new Error(`U1_TEST_NO_CHORD:${id}`);
      return found;
    };

    const settingsBefore = settingsOf(studio.getSnapshot());
    const ids = chordIds(studio.getSnapshot());
    const [stored, auto] = ids;
    if (stored === undefined || auto === undefined) {
      throw new Error("U1_TEST_NO_CHORD");
    }
    const storedBefore = chordById(studio.getSnapshot(), stored);

    const secondMeasure = studio.getSnapshot().sections[0]?.measures[1]?.id;
    if (secondMeasure === undefined) throw new Error("U1_TEST_NO_MEASURE");
    expectOk(studio.selectEvent(auto));
    expectOk(
      studio.duplicateSelection(secondMeasure, "Duplicate left a short bar"),
    );
    expectOk(studio.selectEvent(auto));
    expectOk(studio.setTitle("A different title"));
    expect(studio.applyInlineSymbol(stored, "Db7").ok).toBe(false);
    expectOk(studio.undo());
    expectOk(studio.redo());

    // Playback settings, meter, key, tempo, and document identity are exactly
    // where they started: no gesture reached set-document-settings, transpose,
    // or replace-document.
    expect(settingsOf(studio.getSnapshot())).toBe(settingsBefore);
    // The stored-pitch chord still carries its original symbol and its Manual
    // voicing mode: no gesture reached set-voicing, and no gesture relabelled
    // exact pitches under a new symbol.
    const storedAfter = chordById(studio.getSnapshot(), stored);
    expect(storedAfter.symbolText).toBe(storedBefore.symbolText);
    expect(storedAfter.voicingMode).toBe("manual");
  });
});

/**
 * The preview bound is a rendering limit, so the rows it drops must never be
 * the rows that say why a draft refused.
 *
 * `u1.preview_token_limit` was declared with no production site, which read
 * like a name nothing produced. It is not: a draft inside the 4,096 code-point
 * bound can publish more recoverable chords than `maxPreviewTokens` — 2,048
 * undurated chords are 4,095 code points — and emitting the recovered chords
 * first pushed the sole diagnostic row out of the preview. A refused draft
 * then rendered as nothing but a list of chords to insert, with no stated
 * reason: a refusal presented as a success, which the contract forbids.
 */
describe("U1 the preview bound never hides why a draft refused", () => {
  const MAX_PREVIEW_TOKENS = 2_048;

  /** Exact code points, counted the way the draft bound counts them. */
  function codePointCount(value: string): number {
    let count = 0;
    const scalars = value[Symbol.iterator]();
    while (!scalars.next().done) count += 1;
    return count;
  }

  function previewOf(studio: StudioController, draft: string) {
    const measureId = firstMeasureId(studio.getSnapshot());
    const preview = studio.previewChartText(draft);
    expectOk(
      studio.setQuickEntryDraft(
        draft,
        { kind: "measure-start", measureId },
        preview.status,
        preview.issueCodes,
      ),
    );
    return studio.previewQuickEntryDraft();
  }

  test("u1.preview_token_limit a draft that overruns the bound keeps every diagnostic row", () => {
    const studio = controller();
    // 2,048 undurated chords: exactly 4,095 code points, one code point inside
    // the draft bound, and one recoverable chord per token.
    const draft = Array.from({ length: MAX_PREVIEW_TOKENS }, () => "C").join(" ");
    expect(codePointCount(draft)).toBe(4_095);

    const view = previewOf(studio, draft);
    expect(view.tokens.length).toBe(MAX_PREVIEW_TOKENS);
    // The row carrying T0's diagnostic survived; it is what tells the reader
    // the draft refused at all.
    const diagnostics = view.tokens.filter((token) => token.diagnosticCode !== null);
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(view.tokens.some((token) => token.state === "invalid")).toBe(true);

    // And the shortfall is stated rather than silently absent.
    expect(view.truncation).not.toBeNull();
    expect(view.truncation?.code).toBe("u1.preview_token_limit");
    expect(view.truncation?.shownTokens).toBe(MAX_PREVIEW_TOKENS);
    expect(view.truncation?.totalTokens).toBeGreaterThan(MAX_PREVIEW_TOKENS);
    expect(view.truncation?.message ?? "").toContain(String(MAX_PREVIEW_TOKENS));
  });

  test("a draft inside the bound states no truncation", () => {
    const studio = controller();
    const draft = Array.from({ length: 1_024 }, () => "C:4").join(" ");
    expect(codePointCount(draft)).toBe(4_095);

    const view = previewOf(studio, draft);
    // 1,024 recovered chords plus one diagnostic row is 1,025 rows, inside the
    // bound, so nothing is dropped and nothing is claimed to be.
    expect(view.tokens.length).toBe(1_025);
    expect(view.truncation).toBeNull();
  });
});
