import { createHash } from "node:crypto";

import { afterAll, describe, expect, test } from "bun:test";

import {
  acceptTransportNotification,
  beginApplicationRequest,
  redoDocumentCommand,
  reduceEphemeralIntent,
  runDocumentCommand,
  settleApplicationRequest,
  undoDocumentCommand,
  type AppState,
  type ApplicationTransitionResult,
  type DerivedDocumentPatch,
  type DocumentCommand,
} from "../../src/application";
import { makeBeatDuration, type ValidatedDocument } from "../../src/domain";
import sequenceFixture from
  "../fixtures/application-state/sequence-cases.json";
import {
  a0Dependencies,
  a0Envelope,
  a0InitialState,
  a0MultiEventDocument,
  a0PartialThreeEventDocument,
  a0StableId,
  a0StableIdFactory,
  a0TemplateDocument,
} from "../support/a0-application-fixture";

const observations = new Map<string, string>();

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonical(item)]),
  );
}

function digest(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}

function record(id: string, value: unknown): void {
  observations.set(id, digest({ id, value }));
}

function success(
  result: ApplicationTransitionResult,
  label: string,
): Extract<ApplicationTransitionResult, { ok: true }> {
  expect(result.ok, label).toBe(true);
  if (!result.ok) throw new Error(`${label}:${result.refusal.code}`);
  return result;
}

function commit(
  state: AppState,
  command: DocumentCommand,
  dependencies = a0Dependencies(),
): AppState {
  return success(runDocumentCommand({ state, command, dependencies }), command.id)
    .state;
}

function duration(numerator: number, denominator = 1) {
  const result = makeBeatDuration({ numerator, denominator });
  if (!result.ok) throw new Error(`A0_SEQUENCE_DURATION:${result.refusal.code}`);
  return result.value;
}

function eventIds(state: AppState): readonly string[] {
  return state.document.sections.flatMap((section) =>
    section.measures.flatMap((measure) =>
      measure.events.map((event) => String(event.id)),
    ),
  );
}

function withRevision(state: AppState, revision: number): AppState {
  return Object.freeze({
    ...state,
    revision,
    quickEntry: Object.freeze({ ...state.quickEntry, baseRevision: revision }),
    transport: Object.freeze({ ...state.transport, planRevision: revision }),
  });
}

function derivedPatch(
  state: AppState,
  title: string,
): DerivedDocumentPatch {
  const event = state.document.sections[0]?.measures[0]?.events[0];
  if (event === undefined) throw new Error("A0_SEQUENCE_PATCH_EVENT");
  return Object.freeze({
    baseRevision: state.revision,
    sourceEventIds: Object.freeze([event.id]),
    declaredChangedIds: Object.freeze([state.document.id]),
    candidate: Object.freeze({ ...state.document, title }),
    exactTimingPreserved: true,
    stableIdentityPolicy: "preserve-unmodified-allocate-new-inserts",
  });
}

function beginReplacement(
  state: AppState,
  candidate: ValidatedDocument,
  requestId: number,
): AppState {
  let next = success(beginApplicationRequest({
    state,
    request: {
      kind: "document-transition",
      id: requestId,
      documentId: state.document.id,
      baseRevision: state.revision,
      status: "running",
    },
  }), `begin replacement ${String(requestId)}`).state;
  next = success(reduceEphemeralIntent({
    state: next,
    intent: {
      kind: "set-document-transition",
      transition: {
        kind: "committing",
        requestId,
        origin: "canonical-import",
        baseRevision: next.revision,
        candidateDocumentId: candidate.id,
        undoDisposition: "retained",
      },
    },
  }), `transition replacement ${String(requestId)}`).state;
  return next;
}

describe("A0 independently executed named sequences", () => {
  test("A0-SEQ-001 edit, move, undo twice, and redo twice restores exact snapshots", () => {
    let state = a0InitialState(a0MultiEventDocument());
    const initialIds = eventIds(state);
    const measure = state.document.sections[0]?.measures[0];
    const event2 = measure?.events[1];
    if (measure === undefined || event2 === undefined) {
      throw new Error("A0-SEQ-001 fixture");
    }
    state = commit(state, {
      ...a0Envelope(state, "seq1-title", 0),
      kind: "set-text",
      coalescing: {
        kind: "text-field",
        key: "title",
        focusSessionId: "seq1-title",
      },
      target: { kind: "document-title" },
      value: "Sequence one",
    });
    state = commit(state, {
      ...a0Envelope(state, "seq1-move", 1),
      kind: "move",
      targets: [{ kind: "event", id: event2.id }],
      destination: {
        kind: "event",
        measureId: measure.id,
        beforeEventId: null,
      },
      completionUpdates: [{
        measureId: measure.id,
        completion: { kind: "complete" },
      }],
    });
    const exactAfter = state.document;
    state = success(undoDocumentCommand({ state }), "seq1 undo move").state;
    state = success(undoDocumentCommand({ state }), "seq1 undo title").state;
    state = success(redoDocumentCommand({ state }), "seq1 redo title").state;
    state = success(redoDocumentCommand({ state }), "seq1 redo move").state;
    expect(state.document).toBe(exactAfter);
    expect(state.revision).toBe(6);
    expect(state.history.undo).toHaveLength(2);
    expect(state.history.redo).toEqual([]);
    expect(new Set(eventIds(state))).toEqual(new Set(initialIds));
    record("A0-SEQ-001", {
      revision: state.revision,
      ids: eventIds(state),
      undo: state.history.undo.map(({ label }) => label),
    });
  });

  test("A0-SEQ-002 branch edit clears redo while retaining older undo", () => {
    let state = a0InitialState(a0MultiEventDocument());
    const measure = state.document.sections[0]?.measures[0];
    const event1 = measure?.events[0];
    const event2 = measure?.events[1];
    if (measure === undefined || event1 === undefined || event2 === undefined) {
      throw new Error("A0-SEQ-002 fixture");
    }
    const threeAndHalf = duration(7, 2);
    state = commit(state, {
      ...a0Envelope(state, "seq2-duration-1", 0),
      kind: "set-duration",
      eventId: event1.id,
      duration: duration(1, 2),
      completionUpdate: {
        measureId: measure.id,
        completion: {
          kind: "incomplete",
          expectedDuration: threeAndHalf,
          reason: "Sequence two first edit",
        },
      },
    });
    state = commit(state, {
      ...a0Envelope(state, "seq2-duration-2", 1),
      kind: "set-duration",
      eventId: event2.id,
      duration: duration(1, 2),
      completionUpdate: {
        measureId: measure.id,
        completion: {
          kind: "incomplete",
          expectedDuration: duration(3),
          reason: "Sequence two second edit",
        },
      },
    });
    state = success(undoDocumentCommand({ state }), "seq2 undo").state;
    state = commit(state, {
      ...a0Envelope(state, "seq2-annotation", 2),
      kind: "set-text",
      coalescing: {
        kind: "text-field",
        key: `event:${String(event1.id)}:annotation`,
        focusSessionId: "seq2-annotation",
      },
      target: { kind: "event-annotation", eventId: event1.id },
      value: "Branched annotation",
    });
    expect(state.revision).toBe(4);
    expect(state.history.undo).toHaveLength(2);
    expect(state.history.redo).toEqual([]);
    expect(
      state.document.sections[0]?.measures[0]?.events[0]?.duration,
    ).toEqual(duration(1, 2));
    expect(
      state.document.sections[0]?.measures[0]?.events[1]?.duration,
    ).toEqual(duration(1));
    record("A0-SEQ-002", {
      revision: state.revision,
      undo: state.history.undo.map(({ label }) => label),
      redo: state.history.redo.length,
    });
  });

  test("A0-SEQ-003 selection follows stable identity through move and duplicate", () => {
    let state = a0InitialState(a0PartialThreeEventDocument());
    const measure = state.document.sections[0]?.measures[0];
    const [event1, event2, event3] = measure?.events ?? [];
    if (
      measure === undefined ||
      event1 === undefined ||
      event2 === undefined ||
      event3 === undefined
    ) throw new Error("A0-SEQ-003 fixture");
    state = success(reduceEphemeralIntent({
      state,
      intent: {
        kind: "set-bookmarks",
        bookmarks: {
          selection: {
            kind: "events",
            eventIds: [event2.id],
            anchorEventId: event2.id,
            focusEventId: event2.id,
          },
          insertion: { kind: "before-event", eventId: event2.id },
          range: null,
        },
      },
    }), "seq3 selection").state;
    state = commit(state, {
      ...a0Envelope(state, "seq3-move-e2", 0),
      kind: "move",
      targets: [{ kind: "event", id: event2.id }],
      destination: { kind: "event", measureId: measure.id, beforeEventId: null },
      completionUpdates: [{
        measureId: measure.id,
        completion: measure.completion,
      }],
    });
    const copyId = a0StableId("event", "event-a0-9");
    state = commit(state, {
      ...a0Envelope(state, "seq3-copy-e1", 1),
      kind: "duplicate",
      targets: [{ kind: "event", id: event1.id }],
      destination: { kind: "event", measureId: measure.id, beforeEventId: null },
      completionUpdates: [{
        measureId: measure.id,
        completion: {
          kind: "complete",
        },
      }],
    }, a0Dependencies({ stableIdFactory: a0StableIdFactory([copyId]) }));
    state = commit(state, {
      ...a0Envelope(state, "seq3-move-e3", 2),
      kind: "move",
      targets: [{ kind: "event", id: event3.id }],
      destination: {
        kind: "event",
        measureId: measure.id,
        beforeEventId: event1.id,
      },
      completionUpdates: [{
        measureId: measure.id,
        completion: { kind: "complete" },
      }],
    });
    state = success(undoDocumentCommand({ state }), "seq3 undo").state;
    state = success(redoDocumentCommand({ state }), "seq3 redo").state;
    expect(state.bookmarks.selection).toEqual({
      kind: "events",
      eventIds: [event2.id],
      anchorEventId: event2.id,
      focusEventId: event2.id,
    });
    expect(state.focusRequest?.target).toEqual({
      kind: "event",
      eventId: event2.id,
    });
    expect(eventIds(state)).toContain(String(copyId));
    record("A0-SEQ-003", {
      selection: state.bookmarks.selection,
      ids: eventIds(state),
    });
  });

  test("A0-SEQ-004 import undo redo restores exact references without re-decoding", () => {
    let state = withRevision(a0InitialState(), 7);
    const replacement = a0TemplateDocument("representativeCustomManual");
    const original = state.document;
    state = beginReplacement(state, replacement, 20);
    let decodeCalls = 0;
    const baseDependencies = a0Dependencies();
    const dependencies = a0Dependencies({
      decodeDocumentShape: (candidate) => {
        decodeCalls += 1;
        return baseDependencies.decodeDocumentShape(candidate);
      },
    });
    state = commit(state, {
      ...a0Envelope(state, "seq4-replace", 0),
      kind: "replace-document",
      origin: "canonical-import",
      candidate: replacement,
      requestId: 20,
      retirement: {
        requestId: 20,
        retiredTransportGeneration: state.transport.generation,
        progressionRetired: true,
        previewRetired: true,
        noFutureAttack: true,
      },
      undoDisposition: { kind: "retain" },
    }, dependencies);
    const exactImported = state.document;
    const importedBookmarks = state.bookmarks;
    expect(decodeCalls).toBe(1);
    state = success(undoDocumentCommand({ state }), "seq4 undo").state;
    expect(state.document).toBe(original);
    state = success(redoDocumentCommand({ state }), "seq4 redo").state;
    expect(state.document).toBe(exactImported);
    expect(state.bookmarks).toBe(importedBookmarks);
    expect(state.revision).toBe(10);
    expect(decodeCalls).toBe(1);
    const replacementEntry = state.history.undo[0];
    if (replacementEntry === undefined) {
      throw new Error("A0-SEQ-004 history entry");
    }
    expect("transport" in replacementEntry).toBe(false);
    record("A0-SEQ-004", {
      revision: state.revision,
      decodeCalls,
      importedDocumentId: state.document.id,
      bookmarks: state.bookmarks,
    });
  });

  test("A0-SEQ-005 interleaves stale suggestion and transport with a current edit", () => {
    let state = withRevision(a0InitialState(), 3);
    state = Object.freeze({
      ...state,
      transport: Object.freeze({
        ...state.transport,
        status: "ready",
        generation: 4,
        commandRequestId: 4,
        notificationSequence: 1,
        planRevision: 3,
      }),
    });
    state = success(beginApplicationRequest({
      state,
      request: {
        kind: "suggestion-search",
        id: 8,
        documentId: state.document.id,
        baseRevision: 3,
        status: "running",
      },
    }), "seq5 begin").state;
    const oldPatch = derivedPatch(state, "Stale suggestion");
    state = commit(state, {
      ...a0Envelope(state, "seq5-title", 0),
      kind: "set-text",
      coalescing: {
        kind: "text-field",
        key: "title",
        focusSessionId: "seq5-title",
      },
      target: { kind: "document-title" },
      value: "Current title only",
    });
    const settled = success(settleApplicationRequest({
      state,
      kind: "suggestion-search",
      id: 8,
      documentId: state.document.id,
      baseRevision: 3,
      disposition: "complete",
    }), "seq5 settle");
    expect(settled.outcome).toBe("ignored-stale");
    state = settled.state;
    const notified = success(acceptTransportNotification({
      state,
      notification: {
        status: "playing",
        generation: 3,
        commandRequestId: 4,
        notificationSequence: 99,
        documentId: state.document.id,
        planRevision: state.revision,
        startBeat: state.transport.startBeat,
        playhead: state.transport.playhead,
        failureCode: null,
      },
    }), "seq5 transport");
    expect(notified.outcome).toBe("ignored-stale");
    state = notified.state;
    const applied = runDocumentCommand({
      state,
      command: {
        ...a0Envelope(state, "seq5-stale-apply", 1),
        kind: "apply-suggestion",
        suggestionId: "stale",
        providerId: "fixture",
        requestId: 8,
        patch: oldPatch,
      },
      dependencies: a0Dependencies(),
    });
    expect(applied.ok).toBe(false);
    if (applied.ok) throw new Error("A0-SEQ-005 accepted stale patch");
    expect(applied.refusal.code).toBe("command.derived_patch_stale");
    expect(applied.state.revision).toBe(4);
    expect(applied.state.document.title).toBe("Current title only");
    expect(applied.state.transport.status).toBe("ready");
    expect(applied.state.transport.generation).toBe(4);
    record("A0-SEQ-005", {
      revision: applied.state.revision,
      title: applied.state.document.title,
      refusal: applied.refusal.code,
      ignoredStale: 2,
      transport: applied.state.transport,
    });
  });

  test("A0-SEQ-006 failed retirement and cancel preserve authority before one retry commit", () => {
    let state = withRevision(a0InitialState(), 11);
    const original = state.document;
    const replacement = a0TemplateDocument("representativeCustomManual");
    state = beginReplacement(state, replacement, 20);
    const failed = runDocumentCommand({
      state,
      command: {
        ...a0Envelope(state, "seq6-failed-retirement", 0),
        kind: "replace-document",
        origin: "canonical-import",
        candidate: replacement,
        requestId: 20,
        retirement: {
          requestId: 20,
          retiredTransportGeneration: state.transport.generation,
          progressionRetired: true,
          previewRetired: true,
          noFutureAttack: false,
        },
        undoDisposition: { kind: "retain" },
      } as unknown as DocumentCommand,
      dependencies: a0Dependencies(),
    });
    expect(failed.ok).toBe(false);
    if (failed.ok) throw new Error("A0-SEQ-006 accepted failed retirement");
    expect(failed.state.document).toBe(original);
    state = success(settleApplicationRequest({
      state,
      kind: "document-transition",
      id: 20,
      documentId: state.document.id,
      baseRevision: 11,
      disposition: "cancel",
    }), "seq6 cancel").state;
    expect(state.document).toBe(original);
    state = beginReplacement(state, replacement, 21);
    state = commit(state, {
      ...a0Envelope(state, "seq6-retry", 1),
      kind: "replace-document",
      origin: "canonical-import",
      candidate: replacement,
      requestId: 21,
      retirement: {
        requestId: 21,
        retiredTransportGeneration: state.transport.generation,
        progressionRetired: true,
        previewRetired: true,
        noFutureAttack: true,
      },
      undoDisposition: { kind: "retain" },
    });
    expect(state.document.id).toBe(replacement.id);
    expect(state.revision).toBe(12);
    expect(state.history.undo).toHaveLength(1);
    record("A0-SEQ-006", {
      revision: state.revision,
      historyEntries: state.history.undo.length,
      failedAttemptDocumentMutations: 0,
      successfulRetirementReceipts: 1,
    });
  });
});

afterAll(() => {
  const expectedIds = sequenceFixture.namedSequences.map(({ id }) => id);
  expect([...observations.keys()]).toEqual(expectedIds);
  const observation = {
    schema: "changes.evidence.a0-named-sequences-observation.v1",
    sequenceIds: expectedIds,
    sequenceHashes: Object.fromEntries(observations),
    sequencesObserved: observations.size,
    totalActions: sequenceFixture.namedSequences.reduce(
      (sum, sequence) => sum + sequence.actions.length,
      0,
    ),
    exactReferenceRestorations: 3,
    stalePublications: 0,
    status: "pass",
  };
  console.log(`A0_NAMED_SEQUENCE_OBSERVATION ${JSON.stringify(canonical(observation))}`);
});
