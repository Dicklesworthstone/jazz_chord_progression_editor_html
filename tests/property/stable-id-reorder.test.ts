import { describe, expect, test } from "bun:test";

import {
  redoDocumentCommand,
  reduceEphemeralIntent,
  runDocumentCommand,
  undoDocumentCommand,
  type ApplicationTransitionResult,
} from "../../src/application";
import {
  a0Dependencies,
  a0Envelope,
  a0InitialState,
  a0MultiEventDocument,
  a0MultiMeasureDocument,
  a0StableId,
  a0StableIdFactory,
} from "../support/a0-application-fixture";

function success(
  result: ApplicationTransitionResult,
  label: string,
): Extract<ApplicationTransitionResult, { ok: true }> {
  expect(result.ok, label).toBe(true);
  if (!result.ok) throw new Error(`${label}:${result.refusal.code}`);
  return result;
}

function eventOrder(
  state: Extract<ApplicationTransitionResult, { ok: true }>["state"],
): readonly string[] {
  return state.document.sections.flatMap((section) =>
    section.measures.flatMap((measure) =>
      measure.events.map((event) => event.id),
    ),
  );
}

describe("A0 stable-ID reorder laws", () => {
  test("selection and focus follow identity through repeated move/undo/redo", () => {
    let state = a0InitialState(a0MultiEventDocument());
    const measure = state.document.sections[0]?.measures[0];
    const selected = measure?.events[1];
    if (measure === undefined || selected === undefined) {
      throw new Error("A0_TEST_REORDER_FIXTURE");
    }
    state = success(
      reduceEphemeralIntent({
        state,
        intent: {
          kind: "set-bookmarks",
          bookmarks: {
            selection: {
              kind: "events",
              eventIds: Object.freeze([selected.id]),
              anchorEventId: selected.id,
              focusEventId: selected.id,
            },
            insertion: { kind: "before-event", eventId: selected.id },
            range: null,
          },
        },
      }),
      "select stable event",
    ).state;
    const originalIds = new Set(eventOrder(state));
    const snapshots = [eventOrder(state)];
    const transport = state.transport;

    for (let index = 0; index < 24; index += 1) {
      const first = state.document.sections[0]?.measures[0]?.events[0];
      if (first === undefined) throw new Error("A0_TEST_REORDER_EVENT");
      const moved = success(
        runDocumentCommand({
          state,
          command: {
            ...a0Envelope(state, `move-${String(index)}`, index),
            kind: "move",
            targets: Object.freeze([{ kind: "event", id: first.id }]),
            destination: {
              kind: "event",
              measureId: measure.id,
              beforeEventId: null,
            },
            completionUpdates: Object.freeze([
              { measureId: measure.id, completion: { kind: "complete" } },
            ]),
          },
          dependencies: a0Dependencies(),
        }),
        `move ${String(index)}`,
      );
      state = moved.state;
      snapshots.push(eventOrder(state));
      expect(new Set(eventOrder(state))).toEqual(originalIds);
      expect(state.bookmarks.selection).toEqual({
        kind: "events",
        eventIds: [selected.id],
        anchorEventId: selected.id,
        focusEventId: selected.id,
      });
      expect(state.focusRequest?.target).toEqual({
        kind: "event",
        eventId: selected.id,
      });
    }

    for (let index = 24; index > 0; index -= 1) {
      state = success(
        undoDocumentCommand({ state }),
        `undo ${String(index)}`,
      ).state;
      const expected = snapshots[index - 1];
      if (expected === undefined) throw new Error("A0_TEST_UNDO_SNAPSHOT");
      expect(eventOrder(state)).toEqual(expected);
      expect(state.transport).toBe(transport);
    }
    for (let index = 1; index <= 24; index += 1) {
      state = success(
        redoDocumentCommand({ state }),
        `redo ${String(index)}`,
      ).state;
      const expected = snapshots[index];
      if (expected === undefined) throw new Error("A0_TEST_REDO_SNAPSHOT");
      expect(eventOrder(state)).toEqual(expected);
      expect(state.transport).toBe(transport);
    }
    expect(state.revision).toBe(72);
  });

  test("multi-measure duplicate canonicalizes source order and bookmarks the last copy", () => {
    let state = a0InitialState(a0MultiMeasureDocument());
    const section = state.document.sections[0];
    const measures = section?.measures;
    const selected = measures?.[2]?.events[0];
    if (
      section === undefined ||
      measures === undefined ||
      measures[1] === undefined ||
      measures[2] === undefined ||
      selected === undefined
    ) {
      throw new Error("A0_TEST_MULTI_MEASURE_FIXTURE");
    }
    state = success(
      reduceEphemeralIntent({
        state,
        intent: {
          kind: "set-bookmarks",
          bookmarks: {
            selection: {
              kind: "events",
              eventIds: Object.freeze([selected.id]),
              anchorEventId: selected.id,
              focusEventId: selected.id,
            },
            insertion: { kind: "before-measure", measureId: measures[1].id },
            range: null,
          },
        },
      }),
      "select before duplicate",
    ).state;

    const copiedMeasure2 = a0StableId("measure", "measure-a0-copy-2");
    const copiedEvent2 = a0StableId("event", "event-a0-copy-2");
    const copiedMeasure3 = a0StableId("measure", "measure-a0-copy-3");
    const copiedEvent3 = a0StableId("event", "event-a0-copy-3");
    const duplicate = success(
      runDocumentCommand({
        state,
        command: {
          ...a0Envelope(state, "duplicate-measures", 0),
          kind: "duplicate",
          targets: Object.freeze([
            { kind: "measure", id: measures[2].id },
            { kind: "measure", id: measures[1].id },
          ]),
          destination: {
            kind: "measure",
            sectionId: section.id,
            beforeMeasureId: null,
          },
          completionUpdates: Object.freeze([]),
        },
        dependencies: a0Dependencies({
          stableIdFactory: a0StableIdFactory([
            copiedMeasure2,
            copiedEvent2,
            copiedMeasure3,
            copiedEvent3,
          ]),
        }),
      }),
      "duplicate measures",
    );
    const nextMeasures = duplicate.state.document.sections[0]?.measures ?? [];
    expect(nextMeasures.map((measure) => measure.id)).toEqual([
      ...measures.map((measure) => measure.id),
      copiedMeasure2,
      copiedMeasure3,
    ]);
    expect(nextMeasures.at(-2)?.events[0]?.id).toBe(copiedEvent2);
    expect(nextMeasures.at(-1)?.events[0]?.id).toBe(copiedEvent3);
    expect(duplicate.state.bookmarks.selection).toEqual(state.bookmarks.selection);
    expect(duplicate.state.bookmarks.insertion).toEqual({
      kind: "after-measure",
      measureId: copiedMeasure3,
    });

    const undone = success(
      undoDocumentCommand({ state: duplicate.state }),
      "undo duplicate",
    );
    expect(undone.state.document).toBe(state.document);
    expect(undone.state.bookmarks).toBe(state.bookmarks);
    const redone = success(
      redoDocumentCommand({ state: undone.state }),
      "redo duplicate",
    );
    expect(redone.state.document).toBe(duplicate.state.document);
    expect(redone.state.bookmarks).toBe(duplicate.state.bookmarks);
  });
});
