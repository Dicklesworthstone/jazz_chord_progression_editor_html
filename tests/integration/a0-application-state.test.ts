import { describe, expect, test } from "bun:test";

import {
  APPLICATION_REQUEST_KINDS,
  MAX_HISTORY_RETAINED_BYTES,
  acceptTransportNotification,
  beginApplicationRequest,
  redoDocumentCommand,
  reduceEphemeralIntent,
  runDocumentCommand,
  selectBeatRange,
  selectDirtyState,
  selectHistoryAvailability,
  selectInsertionLocation,
  selectSelectedEvents,
  settleApplicationRequest,
  undoDocumentCommand,
  type AppState,
  type ApplicationTransitionResult,
  type DerivedDocumentPatch,
  type DocumentCommand,
} from "../../src/application";
import {
  makeBeatDuration,
  type ChordEvent,
  type Measure,
  type Section,
} from "../../src/domain";
import {
  a0Dependencies,
  a0Envelope,
  a0InitialState,
  a0MultiEventDocument,
  a0StableId,
  a0TemplateDocument,
} from "../support/a0-application-fixture";

type SuccessfulTransition = Extract<
  ApplicationTransitionResult,
  { ok: true }
>;

function successful(
  result: ApplicationTransitionResult,
  label: string,
): SuccessfulTransition {
  expect(result.ok, label).toBe(true);
  if (!result.ok) throw new Error(`${label}:${result.refusal.code}`);
  return result;
}

function commit(
  state: AppState,
  command: DocumentCommand,
  dependencies = a0Dependencies(),
): SuccessfulTransition {
  return successful(
    runDocumentCommand({ state, command, dependencies }),
    command.id,
  );
}

function duration(numerator: number, denominator = 1) {
  const result = makeBeatDuration({ numerator, denominator });
  if (!result.ok) throw new Error(`A0_TEST_DURATION:${result.refusal.code}`);
  return result.value;
}

function textCommand(
  state: AppState,
  value: string,
  id: string,
  logicalTimeMs: number,
  focusSessionId = "focus-title",
): Extract<DocumentCommand, { kind: "set-text" }> {
  return {
    ...a0Envelope(state, id, logicalTimeMs),
    kind: "set-text",
    coalescing: {
      kind: "text-field",
      key: "title",
      focusSessionId,
    },
    target: { kind: "document-title" },
    value,
  };
}

function eventIds(state: AppState): readonly string[] {
  return state.document.sections.flatMap((section) =>
    section.measures.flatMap((measure) =>
      measure.events.map((event) => event.id),
    ),
  );
}

function patchDocument(
  state: AppState,
  fields: Readonly<{ title?: string; description?: string }>,
): DerivedDocumentPatch {
  const source = state.document.sections[0]?.measures[0]?.events[0];
  if (source === undefined) throw new Error("A0_TEST_PATCH_SOURCE");
  return Object.freeze({
    baseRevision: state.revision,
    sourceEventIds: Object.freeze([source.id]),
    declaredChangedIds: Object.freeze([state.document.id]),
    candidate: Object.freeze({ ...state.document, ...fields }),
    exactTimingPreserved: true,
    stableIdentityPolicy: "preserve-unmodified-allocate-new-inserts",
  });
}

function beginReplacement(
  state: AppState,
  candidate: AppState["document"],
  requestId: number,
  undoDisposition: "retained" | "explicitly-unavailable",
): AppState {
  const begun = successful(
    beginApplicationRequest({
      state,
      request: {
        kind: "document-transition",
        id: requestId,
        documentId: state.document.id,
        baseRevision: state.revision,
        status: "running",
      },
    }),
    "begin replacement",
  ).state;
  return successful(
    reduceEphemeralIntent({
      state: begun,
      intent: {
        kind: "set-document-transition",
        transition: {
          kind: "committing",
          requestId,
          origin: "canonical-import",
          baseRevision: begun.revision,
          candidateDocumentId: candidate.id,
          undoDisposition,
        },
      },
    }),
    "commit replacement transition",
  ).state;
}

describe("A0 application state and command runner", () => {
  test("initializes explicit state, coalesces only inside 1,000 ms, and preserves atomic failure", () => {
    const initial = a0InitialState();
    const initialEvent = initial.document.sections[0]?.measures[0]?.events[0];
    if (initialEvent === undefined) throw new Error("A0_TEST_INITIAL_EVENT");
    expect(initial.revision).toBe(0);
    expect(initial.history.undo).toEqual([]);
    expect(initial.bookmarks.insertion).toEqual({
      kind: "before-event",
      eventId: initialEvent.id,
    });
    expect(initial.transport.status).toBe("unavailable");

    let decodeCalls = 0;
    let semanticCalls = 0;
    const baseDependencies = a0Dependencies();
    const dependencies = a0Dependencies({
      decodeDocumentShape: (candidate) => {
        decodeCalls += 1;
        return baseDependencies.decodeDocumentShape(candidate);
      },
      validateDocumentSemantics: (candidate) => {
        semanticCalls += 1;
        return baseDependencies.validateDocumentSemantics(candidate);
      },
    });

    const first = commit(
      initial,
      textCommand(initial, "A", "text-1", 0),
      dependencies,
    );
    expect(first.outcome).toBe("committed");
    expect(first.counters.validationCalls).toBe(1);
    expect(first.state.revision).toBe(1);
    expect(first.state.history.undo).toHaveLength(1);

    const second = commit(
      first.state,
      textCommand(first.state, "AB", "text-2", 999),
      dependencies,
    );
    expect(second.outcome).toBe("coalesced");
    expect(second.state.revision).toBe(2);
    expect(second.state.history.undo).toHaveLength(1);
    expect(second.state.history.undo[0]?.commandId).toBe("text-1");
    expect(second.state.history.undo[0]?.before).toBe(initial.document);

    const boundary = commit(
      second.state,
      textCommand(second.state, "ABC", "text-3", 1_999),
      dependencies,
    );
    expect(boundary.outcome).toBe("committed");
    expect(boundary.state.history.undo).toHaveLength(2);
    expect(decodeCalls).toBe(3);
    expect(semanticCalls).toBe(3);

    const stale = runDocumentCommand({
      state: boundary.state,
      command: textCommand(second.state, "stale", "text-stale", 2_000),
      dependencies,
    });
    expect(stale.ok).toBe(false);
    if (stale.ok) throw new Error("A0_TEST_EXPECTED_STALE");
    expect(stale.refusal.code).toBe("command.stale_revision");
    expect(stale.state.document).toBe(boundary.state.document);
    expect(stale.state.history).toBe(boundary.state.history);
    expect(stale.state.bookmarks).toBe(boundary.state.bookmarks);
    expect(stale.state.notices).toHaveLength(1);
    expect(decodeCalls).toBe(3);
    expect(semanticCalls).toBe(3);

    const malformed = runDocumentCommand({
      state: boundary.state,
      command: textCommand(
        boundary.state,
        "x".repeat(257),
        "text-too-long",
        2_000,
      ),
      dependencies,
    });
    expect(malformed.ok).toBe(false);
    if (malformed.ok) throw new Error("A0_TEST_EXPECTED_F2_REFUSAL");
    expect(malformed.refusal.code).toBe("command.structural_validation_failed");
    expect(malformed.counters.validationCalls).toBe(0);
    expect(malformed.refusal.structuralIssues?.length).toBeGreaterThan(0);
    expect(malformed.state.document).toBe(boundary.state.document);
    expect(decodeCalls).toBe(4);
    expect(semanticCalls).toBe(3);
  });

  test("inserts and deletes explicit section, measure, and event nodes without fabricating data", () => {
    let state = a0InitialState();
    const dependencies = a0Dependencies();
    const sectionId = a0StableId("section", "section-a0-inserted");
    const measureId = a0StableId("measure", "measure-a0-inserted");
    const eventId = a0StableId("event", "event-a0-inserted");
    const section: Section = Object.freeze({
      id: sectionId,
      name: "Inserted",
      annotation: "",
      keyOverride: null,
      voiceLeadingBoundary: "continue",
      measures: Object.freeze([]),
    });
    const measure: Measure = Object.freeze({
      id: measureId,
      events: [] as const,
      completion: Object.freeze({ kind: "empty" }),
    });
    const sourceEvent = state.document.sections[0]?.measures[0]?.events[0];
    if (sourceEvent === undefined) throw new Error("A0_TEST_INSERT_SOURCE");
    const event: ChordEvent = Object.freeze({ ...sourceEvent, id: eventId });

    state = commit(
      state,
      {
        ...a0Envelope(state, "insert-section", 0),
        kind: "insert",
        insertion: {
          nodeKind: "section",
          value: section,
          destination: { kind: "section", beforeSectionId: null },
          completionUpdates: Object.freeze([]),
        },
      },
      dependencies,
    ).state;
    expect(state.document.sections.at(-1)?.id).toBe(sectionId);
    expect(state.document.sections.at(-1)?.measures).toEqual([]);

    state = commit(
      state,
      {
        ...a0Envelope(state, "insert-measure", 1),
        kind: "insert",
        insertion: {
          nodeKind: "measure",
          value: measure,
          destination: {
            kind: "measure",
            sectionId,
            beforeMeasureId: null,
          },
          completionUpdates: Object.freeze([]),
        },
      },
      dependencies,
    ).state;
    expect(state.document.sections.at(-1)?.measures[0]?.id).toBe(measureId);

    state = commit(
      state,
      {
        ...a0Envelope(state, "insert-event", 2),
        kind: "insert",
        insertion: {
          nodeKind: "event",
          value: event,
          destination: { kind: "event", measureId, beforeEventId: null },
          completionUpdates: Object.freeze([
            { measureId, completion: { kind: "complete" } },
          ]),
        },
      },
      dependencies,
    ).state;
    expect(state.document.sections.at(-1)?.measures[0]?.events[0]?.id).toBe(
      eventId,
    );

    state = commit(
      state,
      {
        ...a0Envelope(state, "delete-event", 3),
        kind: "delete",
        targets: Object.freeze([{ kind: "event", id: eventId }]),
        completionUpdates: Object.freeze([
          { measureId, completion: { kind: "empty" } },
        ]),
      },
      dependencies,
    ).state;
    expect(state.document.sections.at(-1)?.measures[0]?.events).toEqual([]);
    expect(state.document.sections.at(-1)?.measures[0]?.completion).toEqual({
      kind: "empty",
    });
    expect(state.history.undo).toHaveLength(4);
  });

  test("refuses counterfeited structural coalescing, derived identity policy, and retirement receipts", () => {
    const state = a0InitialState(a0MultiEventDocument());
    const measure = state.document.sections[0]?.measures[0];
    const firstEvent = measure?.events[0];
    if (measure === undefined || firstEvent === undefined) {
      throw new Error("A0_TEST_RUNTIME_GUARDS");
    }
    const structuralWithCoalescing = {
      ...a0Envelope(state, "bad-coalescing", 0),
      kind: "move",
      coalescing: {
        kind: "text-field",
        key: "title",
        focusSessionId: "forged",
      },
      targets: [{ kind: "event", id: firstEvent.id }],
      destination: {
        kind: "event",
        measureId: measure.id,
        beforeEventId: null,
      },
      completionUpdates: [
        { measureId: measure.id, completion: { kind: "complete" } },
      ],
    } as unknown as DocumentCommand;
    const coalescingRefusal = runDocumentCommand({
      state,
      command: structuralWithCoalescing,
      dependencies: a0Dependencies(),
    });
    expect(coalescingRefusal.ok).toBe(false);
    if (coalescingRefusal.ok) throw new Error("A0_TEST_COALESCING_GUARD");
    expect(coalescingRefusal.refusal.code).toBe("command.coalescing_invalid");
    expect(coalescingRefusal.counters.validationCalls).toBe(0);

    const counterfeitPolicy = {
      ...a0Envelope(state, "bad-derived-policy", 1),
      kind: "transpose",
      lawId: "law.test",
      patch: {
        ...patchDocument(state, { title: "Must not publish" }),
        stableIdentityPolicy: "reuse-everything",
      },
    } as unknown as DocumentCommand;
    const policyRefusal = runDocumentCommand({
      state,
      command: counterfeitPolicy,
      dependencies: a0Dependencies(),
    });
    expect(policyRefusal.ok).toBe(false);
    if (policyRefusal.ok) throw new Error("A0_TEST_DERIVED_POLICY_GUARD");
    expect(policyRefusal.refusal.code).toBe(
      "command.derived_patch_scope_mismatch",
    );
    expect(policyRefusal.counters.validationCalls).toBe(0);

    const replacement = a0TemplateDocument("representativeCustomManual");
    const ready = beginReplacement(state, replacement, 90, "retained");
    const counterfeitReceipt = {
      ...a0Envelope(ready, "bad-retirement", 2),
      kind: "replace-document",
      origin: "canonical-import",
      candidate: replacement,
      requestId: 90,
      retirement: {
        requestId: 90,
        retiredTransportGeneration: ready.transport.generation,
        progressionRetired: true,
        previewRetired: true,
        noFutureAttack: false,
      },
      undoDisposition: { kind: "retain" },
    } as unknown as DocumentCommand;
    const receiptRefusal = runDocumentCommand({
      state: ready,
      command: counterfeitReceipt,
      dependencies: a0Dependencies(),
    });
    expect(receiptRefusal.ok).toBe(false);
    if (receiptRefusal.ok) throw new Error("A0_TEST_RECEIPT_GUARD");
    expect(receiptRefusal.refusal.code).toBe("command.payload_invalid");
    expect(receiptRefusal.counters.validationCalls).toBe(0);
    expect(receiptRefusal.state.document).toBe(ready.document);
  });

  test("repairs stable bookmarks after delete and derives insertion/range selectors exactly", () => {
    let state = a0InitialState(a0MultiEventDocument());
    const [event1, event2, event3] = state.document.sections[0]?.measures[0]?.events ?? [];
    const measure = state.document.sections[0]?.measures[0];
    if (event1 === undefined || event2 === undefined || event3 === undefined || measure === undefined) {
      throw new Error("A0_TEST_MULTI_EVENT");
    }
    state = successful(
      reduceEphemeralIntent({
        state,
        intent: {
          kind: "set-bookmarks",
          bookmarks: {
            selection: {
              kind: "events",
              eventIds: Object.freeze([event3.id, event1.id]),
              anchorEventId: event3.id,
              focusEventId: event1.id,
            },
            insertion: { kind: "after-event", eventId: event1.id },
            range: {
              anchor: { kind: "after-event", eventId: event3.id },
              focus: { kind: "before-event", eventId: event1.id },
            },
          },
        },
      }),
      "set bookmarks",
    ).state;
    expect(state.bookmarks.selection).toEqual({
      kind: "events",
      eventIds: [event1.id, event3.id],
      anchorEventId: event3.id,
      focusEventId: event1.id,
    });
    expect(selectSelectedEvents(state).events.map((event) => event.id)).toEqual([
      event1.id,
      event3.id,
    ]);
    expect(selectInsertionLocation(state)).toEqual({
      kind: "event-boundary",
      measureId: measure.id,
      beforeEventId: event2.id,
    });
    const selectedRange = selectBeatRange(state);
    expect(selectedRange?.start.numerator).toBe(0);
    expect(selectedRange?.start.denominator).toBe(1);
    expect(selectedRange?.end.numerator).toBe(4);
    expect(selectedRange?.end.denominator).toBe(1);

    state = successful(
      reduceEphemeralIntent({
        state,
        intent: {
          kind: "set-bookmarks",
          bookmarks: {
            selection: {
              kind: "events",
              eventIds: Object.freeze([event2.id]),
              anchorEventId: event2.id,
              focusEventId: event2.id,
            },
            insertion: { kind: "before-event", eventId: event2.id },
            range: null,
          },
        },
      }),
      "focus deleted event",
    ).state;
    const expectedDuration = duration(3);
    const deleted = commit(state, {
      ...a0Envelope(state, "delete-focused", 0),
      kind: "delete",
      targets: Object.freeze([{ kind: "event", id: event2.id }]),
      completionUpdates: Object.freeze([
        {
          measureId: measure.id,
          completion: {
            kind: "incomplete",
            expectedDuration,
            reason: "Deleted one beat",
          },
        },
      ]),
    });
    expect(eventIds(deleted.state)).toEqual([event1.id, event3.id]);
    expect(deleted.state.bookmarks.selection).toEqual({ kind: "none" });
    expect(deleted.state.bookmarks.insertion).toEqual({
      kind: "before-event",
      eventId: event3.id,
    });
    expect(deleted.state.focusRequest?.target).toEqual({
      kind: "event",
      eventId: event3.id,
    });
  });

  test("publishes duration, completion, section, voicing, and settings commands through F2 and F3", () => {
    let state = a0InitialState(a0TemplateDocument("representativePartial"));
    const dependencies = a0Dependencies();
    const section = state.document.sections[0];
    const measure = section?.measures[0];
    const event = measure?.events[0];
    if (section === undefined || measure === undefined || event === undefined) {
      throw new Error("A0_TEST_PARTIAL");
    }
    const twoBeats = duration(2);

    state = commit(
      state,
      {
        ...a0Envelope(state, "duration", 0),
        kind: "set-duration",
        eventId: event.id,
        duration: twoBeats,
        completionUpdate: {
          measureId: measure.id,
          completion: {
            kind: "pickup",
            expectedDuration: twoBeats,
            reason: "Two-beat pickup",
          },
        },
      },
      dependencies,
    ).state;
    expect(state.document.sections[0]?.measures[0]?.events[0]?.duration).toEqual(
      twoBeats,
    );

    state = commit(
      state,
      {
        ...a0Envelope(state, "completion", 1),
        kind: "set-measure-completion",
        measureId: measure.id,
        completion: {
          kind: "incomplete",
          expectedDuration: twoBeats,
          reason: "Intentionally short",
        },
      },
      dependencies,
    ).state;
    expect(state.document.sections[0]?.measures[0]?.completion.kind).toBe(
      "incomplete",
    );

    state = commit(
      state,
      {
        ...a0Envelope(state, "section", 2),
        kind: "set-section",
        sectionId: section.id,
        patch: { name: "Pickup revised", voiceLeadingBoundary: "reset" },
      },
      dependencies,
    ).state;
    expect(state.document.sections[0]?.name).toBe("Pickup revised");

    const currentEvent = state.document.sections[0]?.measures[0]?.events[0];
    if (currentEvent?.voicing.mode !== "auto") {
      throw new Error("A0_TEST_AUTO_VOICING");
    }
    state = commit(
      state,
      {
        ...a0Envelope(state, "voicing", 3),
        kind: "set-voicing",
        eventId: currentEvent.id,
        voicing: Object.freeze({ ...currentEvent.voicing, family: "shell" }),
      },
      dependencies,
    ).state;
    expect(state.document.sections[0]?.measures[0]?.events[0]?.voicing).toEqual({
      ...currentEvent.voicing,
      family: "shell",
    });

    state = commit(
      state,
      {
        ...a0Envelope(state, "settings", 4),
        kind: "set-document-settings",
        patch: { tempoBpm: 144, description: "One command" },
        completionUpdates: Object.freeze([]),
      },
      dependencies,
    ).state;
    expect(state.document.tempoBpm).toBe(144);
    expect(state.document.description).toBe("One command");
    expect(state.history.undo).toHaveLength(5);
  });

  test("repairs a removed sole event to its surviving empty measure", () => {
    let state = a0InitialState(a0TemplateDocument("representativePartial"));
    const measure = state.document.sections[0]?.measures[0];
    const event = measure?.events[0];
    if (measure === undefined || event === undefined) {
      throw new Error("A0_TEST_SOLE_EVENT");
    }
    state = successful(
      reduceEphemeralIntent({
        state,
        intent: {
          kind: "set-bookmarks",
          bookmarks: {
            selection: {
              kind: "events",
              eventIds: Object.freeze([event.id]),
              anchorEventId: event.id,
              focusEventId: event.id,
            },
            insertion: { kind: "before-event", eventId: event.id },
            range: null,
          },
        },
      }),
      "select sole event",
    ).state;
    const deleted = commit(state, {
      ...a0Envelope(state, "delete-sole-event", 0),
      kind: "delete",
      targets: Object.freeze([{ kind: "event", id: event.id }]),
      completionUpdates: Object.freeze([
        { measureId: measure.id, completion: { kind: "empty" } },
      ]),
    });
    expect(deleted.state.bookmarks.selection).toEqual({ kind: "none" });
    expect(deleted.state.bookmarks.insertion).toEqual({
      kind: "measure-start",
      measureId: measure.id,
    });
    expect(deleted.state.focusRequest?.target).toEqual({
      kind: "measure",
      measureId: measure.id,
    });
  });

  test("applies current transpose, suggestion, and reharmonization patches as single history entries", () => {
    let state = a0InitialState();
    const dependencies = a0Dependencies();
    state = commit(
      state,
      {
        ...a0Envelope(state, "transpose", 0),
        kind: "transpose",
        lawId: "law.test",
        patch: patchDocument(state, { title: "Transposed" }),
      },
      dependencies,
    ).state;
    expect(state.document.title).toBe("Transposed");

    state = successful(
      beginApplicationRequest({
        state,
        request: {
          kind: "suggestion-search",
          id: 10,
          documentId: state.document.id,
          baseRevision: state.revision,
          status: "running",
        },
      }),
      "begin suggestion",
    ).state;
    state = commit(
      state,
      {
        ...a0Envelope(state, "suggestion", 1),
        kind: "apply-suggestion",
        suggestionId: "suggestion-1",
        providerId: "provider-1",
        requestId: 10,
        patch: patchDocument(state, { title: "Suggested" }),
      },
      dependencies,
    ).state;
    expect(state.document.title).toBe("Suggested");
    expect(state.pendingRequests).toEqual([]);

    state = successful(
      beginApplicationRequest({
        state,
        request: {
          kind: "reharmonization-search",
          id: 11,
          documentId: state.document.id,
          baseRevision: state.revision,
          status: "running",
        },
      }),
      "begin reharmonization",
    ).state;
    state = commit(
      state,
      {
        ...a0Envelope(state, "reharmonization", 2),
        kind: "apply-reharmonization",
        branchId: "branch-1",
        transformationIds: Object.freeze(["transform-1"]),
        requestId: 11,
        patch: patchDocument(state, { description: "Reharmonized" }),
      },
      dependencies,
    ).state;
    expect(state.document.description).toBe("Reharmonized");
    expect(state.history.undo).toHaveLength(3);

    const stale = runDocumentCommand({
      state,
      command: {
        ...a0Envelope(state, "stale-suggestion", 3),
        kind: "apply-suggestion",
        suggestionId: "old",
        providerId: "provider-1",
        requestId: 10,
        patch: patchDocument(state, { title: "Must not publish" }),
      },
      dependencies,
    });
    expect(stale.ok).toBe(false);
    if (stale.ok) throw new Error("A0_TEST_EXPECTED_DERIVED_STALE");
    expect(stale.refusal.code).toBe("command.derived_patch_stale");
    expect(stale.state.document).toBe(state.document);
  });

  test("replaces only after matching transition retirement and restores exact committed snapshots on undo/redo", () => {
    const initial = a0InitialState();
    const replacement = a0TemplateDocument("representativeCustomManual");
    const ready = beginReplacement(initial, replacement, 20, "retained");
    const transport = ready.transport;
    const committed = commit(ready, {
      ...a0Envelope(ready, "replace", 0),
      kind: "replace-document",
      origin: "canonical-import",
      candidate: replacement,
      requestId: 20,
      retirement: {
        requestId: 20,
        retiredTransportGeneration: ready.transport.generation,
        progressionRetired: true,
        previewRetired: true,
        noFutureAttack: true,
      },
      undoDisposition: { kind: "retain" },
    });
    const committedFirstEvent =
      committed.state.document.sections[0]?.measures[0]?.events[0];
    if (committedFirstEvent === undefined) {
      throw new Error("A0_TEST_REPLACEMENT_EVENT");
    }
    expect(committed.state.document.id).toBe(replacement.id);
    expect(committed.state.bookmarks.insertion).toEqual({
      kind: "before-event",
      eventId: committedFirstEvent.id,
    });
    expect(committed.state.history.undo[0]?.before).toBe(initial.document);
    const exactCommittedDocument = committed.state.document;

    const undone = successful(
      undoDocumentCommand({ state: committed.state }),
      "undo replacement",
    );
    expect(undone.state.document).toBe(initial.document);
    expect(undone.state.transport).toBe(transport);
    const redone = successful(
      redoDocumentCommand({ state: undone.state }),
      "redo replacement",
    );
    expect(redone.state.document).toBe(exactCommittedDocument);
    expect(redone.state.transport).toBe(transport);
    expect(redone.state.revision).toBe(3);
  });

  test("enforces entry-count and retained-byte history limits without partial entries", () => {
    let state = a0InitialState();
    const tiny = a0Dependencies({ estimateHistoryRetainedBytes: () => 1 });
    for (let index = 1; index <= 201; index += 1) {
      state = commit(
        state,
        textCommand(
          state,
          `Title ${String(index)}`,
          `history-${String(index)}`,
          index * 1_000,
          `focus-${String(index)}`,
        ),
        tiny,
      ).state;
    }
    expect(state.history.undo).toHaveLength(200);
    expect(state.history.undo[0]?.commandId).toBe("history-2");
    expect(state.history.undo.at(-1)?.commandId).toBe("history-201");
    expect(state.history.retainedBytesEstimate).toBe(200);

    let byteState = a0InitialState();
    const nineMiB = a0Dependencies({
      estimateHistoryRetainedBytes: () => 9 * 1024 * 1024,
    });
    byteState = commit(
      byteState,
      textCommand(byteState, "First", "byte-1", 0),
      nineMiB,
    ).state;
    byteState = commit(
      byteState,
      textCommand(byteState, "Second", "byte-2", 1_000),
      nineMiB,
    ).state;
    expect(byteState.history.undo.map((entry) => entry.commandId)).toEqual([
      "byte-2",
    ]);

    const oversized = runDocumentCommand({
      state: a0InitialState(),
      command: textCommand(a0InitialState(), "Too large", "oversized", 0),
      dependencies: a0Dependencies({
        estimateHistoryRetainedBytes: () => MAX_HISTORY_RETAINED_BYTES + 1,
      }),
    });
    expect(oversized.ok).toBe(false);
    if (oversized.ok) throw new Error("A0_TEST_EXPECTED_OVERSIZED");
    expect(oversized.refusal.code).toBe("history.entry_too_large");
    expect(oversized.state.revision).toBe(0);
    expect(oversized.state.history.undo).toEqual([]);
  });

  test("allows an oversized replacement only after matching explicit disclosure", () => {
    const initial = a0InitialState();
    const replacement = a0TemplateDocument("representativeCustomManual");
    const ready = beginReplacement(
      initial,
      replacement,
      30,
      "explicitly-unavailable",
    );
    const result = commit(
      ready,
      {
        ...a0Envelope(ready, "replace-oversized", 0),
        kind: "replace-document",
        origin: "canonical-import",
        candidate: replacement,
        requestId: 30,
        retirement: {
          requestId: 30,
          retiredTransportGeneration: ready.transport.generation,
          progressionRetired: true,
          previewRetired: true,
          noFutureAttack: true,
        },
        undoDisposition: {
          kind: "explicitly-unavailable",
          confirmationId: "confirm-30",
          exportRecommended: true,
        },
      },
      a0Dependencies({
        estimateHistoryRetainedBytes: () => MAX_HISTORY_RETAINED_BYTES + 1,
      }),
    );
    expect(result.state.history.undo).toEqual([]);
    expect(result.state.notices.at(-1)?.code).toBe(
      "history.replacement_not_undoable",
    );
    expect(result.effects.map((item) => item.kind)).toContain(
      "recommend-export",
    );
    expect(selectHistoryAvailability(result.state).canUndo).toBe(false);
  });

  test("bounds async slots and rejects stale transport projections by exact token", () => {
    let state = a0InitialState();
    for (const [index, kind] of APPLICATION_REQUEST_KINDS.slice(0, 8).entries()) {
      state = successful(
        beginApplicationRequest({
          state,
          request: {
            kind,
            id: index + 1,
            documentId: state.document.id,
            baseRevision: state.revision,
            status: "running",
          },
        }),
        `begin ${kind}`,
      ).state;
    }
    const ninth = beginApplicationRequest({
      state,
      request: {
        kind: APPLICATION_REQUEST_KINDS[8],
        id: 9,
        documentId: state.document.id,
        baseRevision: state.revision,
        status: "running",
      },
    });
    expect(ninth.ok).toBe(false);
    if (ninth.ok) throw new Error("A0_TEST_EXPECTED_REQUEST_LIMIT");
    expect(ninth.refusal.code).toBe("request.limit");

    const staleSettlement = settleApplicationRequest({
      state,
      kind: APPLICATION_REQUEST_KINDS[0],
      id: 999,
      documentId: state.document.id,
      baseRevision: state.revision,
      disposition: "complete",
    });
    expect(staleSettlement.ok).toBe(true);
    if (!staleSettlement.ok) throw new Error("A0_TEST_STALE_SETTLE");
    expect(staleSettlement.outcome).toBe("ignored-stale");
    expect(staleSettlement.state).toBe(state);

    let transportState = a0InitialState();
    const zero = transportState.transport.startBeat;
    transportState = successful(
      reduceEphemeralIntent({
        state: transportState,
        intent: {
          kind: "expect-transport",
          commandRequestId: 1,
          documentId: transportState.document.id,
          planRevision: transportState.revision,
          status: "starting",
          startBeat: zero,
          playhead: zero,
        },
      }),
      "expect transport 1",
    ).state;
    transportState = successful(
      acceptTransportNotification({
        state: transportState,
        notification: {
          status: "ready",
          generation: 1,
          commandRequestId: 1,
          notificationSequence: 1,
          documentId: transportState.document.id,
          planRevision: transportState.revision,
          startBeat: zero,
          playhead: zero,
          failureCode: null,
        },
      }),
      "accept transport 1",
    ).state;
    transportState = successful(
      reduceEphemeralIntent({
        state: transportState,
        intent: {
          kind: "expect-transport",
          commandRequestId: 2,
          documentId: transportState.document.id,
          planRevision: transportState.revision,
          status: "stopping",
          startBeat: zero,
          playhead: zero,
        },
      }),
      "expect transport 2",
    ).state;
    const delayed = acceptTransportNotification({
      state: transportState,
      notification: {
        status: "playing",
        generation: 2,
        commandRequestId: 1,
        notificationSequence: 99,
        documentId: transportState.document.id,
        planRevision: transportState.revision,
        startBeat: zero,
        playhead: zero,
        failureCode: null,
      },
    });
    expect(delayed.ok).toBe(true);
    if (!delayed.ok) throw new Error("A0_TEST_DELAYED_TRANSPORT");
    expect(delayed.outcome).toBe("ignored-stale");
    expect(delayed.state).toBe(transportState);
    expect(selectDirtyState(transportState)).toEqual({
      sinceExport: true,
      sinceRecovery: true,
    });
  });

  test("copies ephemeral payloads instead of freezing or retaining caller-owned containers", () => {
    let state = a0InitialState();
    const event = state.document.sections[0]?.measures[0]?.events[0];
    if (event === undefined) throw new Error("A0_TEST_EPHEMERAL_EVENT");
    const insertion = { kind: "before-event" as const, eventId: event.id };
    const bookmarks = {
      selection: { kind: "none" as const },
      insertion,
      range: null,
    };
    state = successful(
      reduceEphemeralIntent({
        state,
        intent: { kind: "set-bookmarks", bookmarks },
      }),
      "copy bookmarks",
    ).state;
    expect(state.bookmarks).not.toBe(bookmarks);
    expect(state.bookmarks.insertion).not.toBe(insertion);
    expect(Object.isFrozen(insertion)).toBe(false);
    expect(Object.isFrozen(state.bookmarks.insertion)).toBe(true);

    const dialog = {
      id: "dialog-copy",
      kind: "error-details" as const,
      phase: "open" as const,
      blocksHistory: false,
      requestId: null,
    };
    state = successful(
      reduceEphemeralIntent({
        state,
        intent: { kind: "push-dialog", dialog },
      }),
      "copy dialog",
    ).state;
    expect(state.dialogs[0]).not.toBe(dialog);
    expect(Object.isFrozen(dialog)).toBe(false);
    expect(Object.isFrozen(state.dialogs[0])).toBe(true);

    const request = {
      kind: "analysis" as const,
      id: 40,
      documentId: state.document.id,
      baseRevision: state.revision,
      status: "running" as const,
    };
    state = successful(
      beginApplicationRequest({ state, request }),
      "copy request",
    ).state;
    expect(state.pendingRequests[0]).not.toBe(request);
    expect(Object.isFrozen(request)).toBe(false);
    expect(Object.isFrozen(state.pendingRequests[0])).toBe(true);

    const zero = state.transport.startBeat;
    state = successful(
      reduceEphemeralIntent({
        state,
        intent: {
          kind: "expect-transport",
          commandRequestId: 1,
          documentId: state.document.id,
          planRevision: state.revision,
          status: "starting",
          startBeat: zero,
          playhead: zero,
        },
      }),
      "expect copied notification",
    ).state;
    const notification = {
      status: "ready" as const,
      generation: 1,
      commandRequestId: 1,
      notificationSequence: 1,
      documentId: state.document.id,
      planRevision: state.revision,
      startBeat: zero,
      playhead: zero,
      failureCode: null,
    };
    const accepted = successful(
      acceptTransportNotification({ state, notification }),
      "copy notification",
    ).state;
    expect(accepted.transport).not.toBe(notification);
    expect(Object.isFrozen(notification)).toBe(false);
    expect(Object.isFrozen(accepted.transport)).toBe(true);
  });
});
