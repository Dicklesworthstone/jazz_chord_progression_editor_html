import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";

import { describe, expect, test } from "bun:test";

import {
  createStudioController,
  type StudioController,
  type StudioControllerActionResult,
  type StudioViewModel,
} from "../../src/application";

/**
 * Production-versus-packet conformance for the reviewed operation matrix.
 *
 * `tests/fixtures/editing/edit-operation-matrix.json` states, for each of the
 * 33 U1 operations, which application channel the gesture uses: a
 * `document-command` publishes exactly one command and one undo entry, an
 * `ephemeral-intent` publishes none of either but does move application state,
 * and a `presentation-only` row reaches the application in no way at all.
 *
 * That is the packet's `everyOperationBindsExactlyOneChannel` proof
 * requirement, and it is measured here rather than declared: each operation is
 * driven through the real controller and the observed revision, undo entry and
 * state fingerprint decide which channel it actually used.
 */

const REPO_ROOT = resolvePath(import.meta.dir, "../..");
const MATRIX_PATH = resolvePath(
  REPO_ROOT,
  "tests/fixtures/editing/edit-operation-matrix.json",
);

type JsonObject = Record<string, unknown>;

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRows(): readonly JsonObject[] {
  const parsed: unknown = JSON.parse(readFileSync(MATRIX_PATH, "utf8"));
  if (!isRecord(parsed) || !Array.isArray(parsed["rows"])) {
    throw new Error("U1_OPERATION_MATRIX_SHAPE");
  }
  return parsed["rows"].filter(isRecord);
}

const ROWS = readRows();

function fixedClock(): () => number {
  let ticks = 0;
  return () => {
    ticks += 2_000;
    return ticks;
  };
}

function controller(): StudioController {
  const created = createStudioController({ nowMs: fixedClock() });
  if (!created.ok) throw new Error(`U1_OPC_BOOTSTRAP:${created.refusal.code}`);
  return created.controller;
}

function expectOk(
  result: StudioControllerActionResult,
  where: string,
): StudioControllerActionResult {
  if (!result.ok) throw new Error(`${where}:${result.refusal.code}`);
  return result;
}

function chordIds(snapshot: StudioViewModel): readonly string[] {
  return snapshot.sections.flatMap((section) =>
    section.measures.flatMap((measure) => measure.events.map((e) => e.id)),
  );
}

function firstMeasureId(snapshot: StudioViewModel): string {
  const id = snapshot.sections[0]?.measures[0]?.id;
  if (id === undefined) throw new Error("U1_OPC_NO_MEASURE");
  return id;
}

function firstSectionId(snapshot: StudioViewModel): string {
  const id = snapshot.sections[0]?.id;
  if (id === undefined) throw new Error("U1_OPC_NO_SECTION");
  return id;
}

/**
 * Everything an ephemeral intent may move, and a document command must also
 * move. Comparing it before and after separates "changed nothing at all" from
 * "changed application state without publishing a command".
 */
function ephemeralFingerprint(snapshot: StudioViewModel): string {
  return JSON.stringify({
    bookmarks: snapshot.bookmarks,
    panels: snapshot.panels,
    quickEntry: snapshot.quickEntry,
  });
}

type ChannelObservation = Readonly<{
  channel: "document-command" | "ephemeral-intent" | "presentation-only";
  commandCount: number;
  intentCount: number;
  undoable: boolean;
}>;

/**
 * Drive one gesture and decide, from what actually moved, which channel it
 * used. A published document command advances the revision by exactly one and
 * pushes an undo entry; an intent moves ephemeral state and neither.
 */
function observeChannel(
  studio: StudioController,
  gesture: () => StudioControllerActionResult | null,
): ChannelObservation {
  const before = studio.getSnapshot();
  const beforePrint = ephemeralFingerprint(before);
  const result = gesture();
  if (result !== null && !result.ok) {
    throw new Error(`U1_OPC_GESTURE_REFUSED:${result.refusal.code}`);
  }
  const after = studio.getSnapshot();
  const revisionDelta = after.revision - before.revision;
  const undoChanged = after.history.undoLabel !== before.history.undoLabel;
  const ephemeralChanged = ephemeralFingerprint(after) !== beforePrint;
  const channel =
    revisionDelta > 0
      ? ("document-command" as const)
      : ephemeralChanged
        ? ("ephemeral-intent" as const)
        : ("presentation-only" as const);
  return {
    channel,
    commandCount: revisionDelta,
    intentCount: channel === "ephemeral-intent" ? 1 : 0,
    undoable: revisionDelta > 0 && undoChanged,
  };
}

/** One measure of chart material, published through the real quick-entry path. */
function seedBar(studio: StudioController, text = "Dm9:2 G13:2"): void {
  const measureId = firstMeasureId(studio.getSnapshot());
  expectOk(
    studio.setQuickEntryDraft(
      text,
      { kind: "measure-start", measureId },
      "ready",
      [],
    ),
    "seed-draft",
  );
  expectOk(studio.applyQuickEntryPreview(), "seed-apply");
}

function selectFirstChord(studio: StudioController): string {
  const [first] = chordIds(studio.getSnapshot());
  if (first === undefined) throw new Error("U1_OPC_NO_CHORD");
  expectOk(studio.selectEvent(first), "select");
  return first;
}

/**
 * One driver per operation. Each performs the ordinary gesture the row names
 * on a chart prepared exactly as its preconditions require. A driver returning
 * null is an operation the application has no entry point for at all, which is
 * what `presentation-only` means.
 */
type OperationDriver = (
  studio: StudioController,
) => () => StudioControllerActionResult | null;

const DRIVERS: Readonly<Record<string, OperationDriver>> = Object.freeze({
  "U1-OP-001": (studio) => () =>
    studio.setQuickEntryDraft(
      "Dm9:2 G13:2",
      { kind: "measure-start", measureId: firstMeasureId(studio.getSnapshot()) },
      "ready",
      [],
    ),
  "U1-OP-002": (studio) => {
    expectOk(studio.insertMeasure(firstSectionId(studio.getSnapshot()), null), "seed");
    const measures = studio.getSnapshot().sections[0]?.measures ?? [];
    const second = measures[1]?.id;
    if (second === undefined) throw new Error("U1_OPC_NO_SECOND_MEASURE");
    expectOk(
      studio.setQuickEntryDraft(
        "Dm9:4",
        { kind: "measure-start", measureId: measures[0]?.id ?? second },
        "ready",
        [],
      ),
      "aim-first",
    );
    return () => studio.setQuickEntryDraft(
      "Dm9:4",
      { kind: "measure-start", measureId: second },
      "ready",
      [],
    );
  },
  "U1-OP-003": (studio) => {
    expectOk(
      studio.setQuickEntryDraft(
        "Dm9:4",
        { kind: "measure-start", measureId: firstMeasureId(studio.getSnapshot()) },
        "ready",
        [],
      ),
      "seed-draft",
    );
    return () => studio.clearQuickEntry();
  },
  "U1-OP-004": (studio) => {
    expectOk(
      studio.setQuickEntryDraft(
        "Dm9:2 G13:2",
        { kind: "measure-start", measureId: firstMeasureId(studio.getSnapshot()) },
        "ready",
        [],
      ),
      "seed-draft",
    );
    return () => studio.applyQuickEntryPreview();
  },
  "U1-OP-005": (studio) => {
    const measureId = firstMeasureId(studio.getSnapshot());
    const text = "Dm9:2 G13:1 X";
    const preview = studio.previewChartText(text);
    expectOk(
      studio.setQuickEntryDraft(
        text,
        { kind: "measure-start", measureId },
        preview.status,
        preview.issueCodes,
      ),
      "seed-draft",
    );
    return () => studio.insertRecoveredChord(
      0,
      "",
      "source-bar-and-section-layout-will-be-lost@1",
      "One recovered chord",
    );
  },
  "U1-OP-006": (studio) => () =>
    studio.insertMeasure(firstSectionId(studio.getSnapshot()), null),
  "U1-OP-007": (studio) => () => studio.insertSection(null, "C"),
  "U1-OP-008": (studio) => {
    seedBar(studio);
    selectFirstChord(studio);
    return () => studio.deleteSelection("Deleted for the channel sweep");
  },
  "U1-OP-009": (studio) => {
    seedBar(studio, "Dm9:4");
    expectOk(studio.insertMeasure(firstSectionId(studio.getSnapshot()), null), "seed");
    selectFirstChord(studio);
    return () => studio.duplicateSelection(
      studio.getSnapshot().sections[0]?.measures[1]?.id ?? null,
    );
  },
  "U1-OP-010": (studio) => {
    seedBar(studio);
    const ids = chordIds(studio.getSnapshot());
    const second = ids[1];
    if (second === undefined) throw new Error("U1_OPC_NO_CHORD");
    expectOk(studio.selectEvent(second), "select");
    return () => studio.moveSelection("previous");
  },
  "U1-OP-011": (studio) => {
    seedBar(studio);
    selectFirstChord(studio);
    return () => studio.moveSelection("next");
  },
  "U1-OP-012": (studio) => {
    seedBar(studio, "Dm9:4");
    expectOk(studio.insertMeasure(firstSectionId(studio.getSnapshot()), null), "seed");
    selectFirstChord(studio);
    const destination = studio.getSnapshot().sections[0]?.measures[1]?.id;
    if (destination === undefined) throw new Error("U1_OPC_NO_DESTINATION");
    return () => studio.moveSelectionTo(destination, null, "Vacated for the sweep");
  },
  "U1-OP-013": (studio) => {
    seedBar(studio);
    expectOk(studio.insertMeasure(firstSectionId(studio.getSnapshot()), null), "seed");
    selectFirstChord(studio);
    return () => studio.moveFollowingEvents("Split across two bars");
  },
  "U1-OP-014": (studio) => {
    seedBar(studio);
    const first = selectFirstChord(studio);
    return () => studio.splitEventDuration(first, "1", "1");
  },
  "U1-OP-015": (studio) => {
    seedBar(studio, "Dm9:2 Dm9:2");
    const first = selectFirstChord(studio);
    return () => studio.joinEventDurations(first);
  },
  "U1-OP-016": (studio) => {
    seedBar(studio);
    expectOk(studio.insertMeasure(firstSectionId(studio.getSnapshot()), null), "seed");
    const measures = studio.getSnapshot().sections[0]?.measures ?? [];
    const second = measures[1]?.id;
    if (second === undefined) throw new Error("U1_OPC_NO_SECOND_MEASURE");
    return () => studio.splitSection(firstSectionId(studio.getSnapshot()), second, "B");
  },
  /*
   * The third overfill resolution. Seed a two-chord bar and split it at the
   * second chord: each half then holds two of four beats, so each needs its own
   * stated reason rather than an inferred completion.
   */
  "U1-OP-034": (studio) => {
    seedBar(studio, "Dm9:2 G13:2");
    const events = studio.getSnapshot().sections[0]?.measures[0]?.events ?? [];
    const second = events[1]?.id;
    if (second === undefined) throw new Error("U1_OPC_NO_SECOND_CHORD");
    return () =>
      studio.splitAtBar(second, "Retained half", "Suffix half");
  },
  "U1-OP-017": (studio) => {
    expectOk(studio.insertSection(null, "B"), "seed");
    return () => studio.joinSections(firstSectionId(studio.getSnapshot()));
  },
  "U1-OP-018": (studio) => {
    seedBar(studio);
    const first = selectFirstChord(studio);
    return () => studio.setEventDurationText(first, "1", "Shorter on purpose");
  },
  "U1-OP-019": (studio) => {
    seedBar(studio, "Dm9:2 G13:2");
    const first = selectFirstChord(studio);
    expectOk(
      studio.setEventDurationText(first, "1", "Shorter on purpose"),
      "seed-short",
    );
    return () => studio.declareMeasureCompletion(
      firstMeasureId(studio.getSnapshot()),
      "Restated for the sweep",
    );
  },
  "U1-OP-020": (studio) => {
    seedBar(studio);
    const first = selectFirstChord(studio);
    return () => studio.applyInlineSymbol(first, "Dm11");
  },
  "U1-OP-021": (studio) => () =>
    studio.renameSection(firstSectionId(studio.getSnapshot()), "Head"),
  "U1-OP-022": (studio) => () =>
    studio.annotateSection(firstSectionId(studio.getSnapshot()), "Swing eighths"),
  "U1-OP-023": (studio) => () =>
    studio.setSectionBoundary(firstSectionId(studio.getSnapshot()), "continue"),
  "U1-OP-024": (studio) => {
    seedBar(studio);
    const [first] = chordIds(studio.getSnapshot());
    if (first === undefined) throw new Error("U1_OPC_NO_CHORD");
    return () => studio.selectEvent(first);
  },
  "U1-OP-025": (studio) => {
    seedBar(studio);
    const ids = chordIds(studio.getSnapshot());
    const [first, second] = ids;
    if (first === undefined || second === undefined) {
      throw new Error("U1_OPC_NO_CHORD");
    }
    expectOk(studio.selectEvent(first), "select");
    return () => studio.extendSelectionTo(second);
  },
  "U1-OP-026": (studio) => () =>
    studio.setInsertionPoint({
      kind: "measure-end",
      measureId: firstMeasureId(studio.getSnapshot()),
    }),
  "U1-OP-027": () => () => null,
  "U1-OP-028": (studio) => {
    seedBar(studio);
    const [first] = chordIds(studio.getSnapshot());
    if (first === undefined) throw new Error("U1_OPC_NO_CHORD");
    return () => studio.setRangeEdge("start", { eventId: first, kind: "before-event" });
  },
  "U1-OP-029": (studio) => {
    seedBar(studio);
    const ids = chordIds(studio.getSnapshot());
    const [first, second] = ids;
    if (first === undefined || second === undefined) {
      throw new Error("U1_OPC_NO_CHORD");
    }
    expectOk(
      studio.setRangeEdge("start", { eventId: first, kind: "before-event" }),
      "seed-range",
    );
    return () => studio.setRangeEdge("end", { eventId: second, kind: "after-event" });
  },
  "U1-OP-030": (studio) => {
    seedBar(studio);
    const [first] = chordIds(studio.getSnapshot());
    if (first === undefined) throw new Error("U1_OPC_NO_CHORD");
    expectOk(
      studio.setRangeEdge("start", { eventId: first, kind: "before-event" }),
      "seed-range",
    );
    return () => studio.clearRange();
  },
  "U1-OP-031": () => () => null,
  "U1-OP-032": () => () => null,
  "U1-OP-033": () => () => null,
});

function declaredString(record: JsonObject, key: string, id: string): string {
  const value = record[key];
  if (typeof value !== "string") throw new Error(`U1_OPC_FIELD:${id}.${key}`);
  return value;
}

function declaredNumber(record: JsonObject, key: string, id: string): number {
  const value = record[key];
  if (typeof value !== "number") throw new Error(`U1_OPC_FIELD:${id}.${key}`);
  return value;
}

function declaredBoolean(record: JsonObject, key: string, id: string): boolean {
  const value = record[key];
  if (typeof value !== "boolean") throw new Error(`U1_OPC_FIELD:${id}.${key}`);
  return value;
}

const POSITIVE_ROWS = ROWS.filter((row) => row["kind"] === "positive");

describe("U1 operation matrix: every operation binds exactly one channel", () => {
  test("U1-INT-056 no inventory row may be reachable only by a pointer", () => {
    // A row declaring `pointerAlternative: "none"` would be an operation with
    // no keyboard and no menu path — the counterfactual the case names. Every
    // row in the reviewed matrix is checked, so such a row cannot appear.
    for (const row of ROWS) {
      const expectation = isRecord(row["expected"]) ? row["expected"] : {};
      expect(
        expectation["pointerAlternative"],
        `${String(row["id"])} pointer alternative`,
      ).not.toBe("none");
    }
  });

  test("the reviewed matrix is present and covers all 34 operations", () => {
    expect(ROWS).toHaveLength(60);
    const operations = new Set(POSITIVE_ROWS.map((row) => row["operationId"]));
    expect(operations.size).toBe(34);
    for (const operationId of operations) {
      expect(
        typeof operationId === "string" && operationId in DRIVERS,
        `${String(operationId)} has a driver`,
      ).toBe(true);
    }
  });

  const seen = new Set<string>();
  for (const row of POSITIVE_ROWS) {
    const id = String(row["id"]);
    const operationId = String(row["operationId"]);
    if (seen.has(operationId)) continue;
    seen.add(operationId);
    const expectation = isRecord(row["expected"]) ? row["expected"] : {};

    test(`${id} ${operationId} ${String(row["operation"])}`, () => {
      const driver = DRIVERS[operationId];
      if (driver === undefined) throw new Error(`U1_OPC_NO_DRIVER:${operationId}`);
      const studio = controller();
      // The driver prepares the chart its row requires, then hands back the
      // one gesture that is measured. Setup never counts as the gesture.
      const gesture = driver(studio);
      const observed = observeChannel(studio, gesture);

      const declaredChannel = declaredString(expectation, "channel", id);
      expect<string>(observed.channel, `${id} channel`).toBe(declaredChannel);
      expect(observed.commandCount, `${id} commands`).toBe(
        declaredNumber(expectation, "commandCount", id),
      );
      expect(observed.intentCount, `${id} intents`).toBe(
        declaredNumber(expectation, "intentCount", id),
      );
      expect(observed.undoable, `${id} undoable`).toBe(
        declaredBoolean(expectation, "undoable", id),
      );
    });
  }
});
