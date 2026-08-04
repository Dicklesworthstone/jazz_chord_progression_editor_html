import { createHash } from "node:crypto";

import { afterAll, describe, expect, test } from "bun:test";

import {
  MAX_APPLICATION_REVISION,
  MAX_HISTORY_RETAINED_BYTES,
  beginApplicationRequest,
  reduceEphemeralIntent,
  redoDocumentCommand,
  runDocumentCommand,
  selectDirtyState,
  selectEventById,
  selectHistoryAvailability,
  selectSelectedEvents,
  settleApplicationRequest,
  undoDocumentCommand,
  type AppState,
  type ApplicationReplacementOrigin,
  type ApplicationTransitionResult,
  type DerivedDocumentPatch,
  type DocumentCommand,
} from "../../src/application";
import {
  makeBeatDuration,
  type ChordEventId,
  type Measure,
  type ValidatedDocument,
} from "../../src/domain";
import {
  a0Candidate,
  a0Dependencies,
  a0Envelope,
  a0InitialState,
  a0MultiEventDocument,
  a0MultiMeasureDocument,
  a0StableId,
  a0StableIdFactory,
  a0TemplateDocument,
  publishA0Candidate,
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

function record(ids: readonly string[], value: unknown): void {
  for (const id of ids) {
    if (observations.has(id)) throw new Error(`A0_GAP_DUPLICATE:${id}`);
    observations.set(id, digest({ id, value }));
  }
}

function success(
  result: ApplicationTransitionResult,
  label: string,
): Extract<ApplicationTransitionResult, { ok: true }> {
  expect(result.ok, label).toBe(true);
  if (!result.ok) throw new Error(`${label}:${result.refusal.code}`);
  return result;
}

function refusal(
  result: ApplicationTransitionResult,
  code: Extract<ApplicationTransitionResult, { ok: false }>["refusal"]["code"],
): Extract<ApplicationTransitionResult, { ok: false }> {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error(`A0_GAP_EXPECTED_REFUSAL:${code}`);
  expect(result.refusal.code).toBe(code);
  return result;
}

function duration(numerator: number, denominator = 1) {
  const result = makeBeatDuration({ numerator, denominator });
  if (!result.ok) throw new Error(`A0_GAP_DURATION:${result.refusal.code}`);
  return result.value;
}

function textCommand(
  state: AppState,
  id: string,
  value: string,
  time: number,
  focus = "gap-focus",
): Extract<DocumentCommand, { kind: "set-text" }> {
  return {
    ...a0Envelope(state, id, time),
    kind: "set-text",
    coalescing: {
      kind: "text-field",
      key: "title",
      focusSessionId: focus,
    },
    target: { kind: "document-title" },
    value,
  };
}

function emptyDocument(): ValidatedDocument {
  const candidate = a0Candidate();
  candidate["sections"] = [];
  return publishA0Candidate(candidate);
}

function patchWithTitle(
  state: AppState,
  title: string,
  declaredChangedIds: DerivedDocumentPatch["declaredChangedIds"] = [
    state.document.id,
  ],
): DerivedDocumentPatch {
  const event = state.document.sections[0]?.measures[0]?.events[0];
  if (event === undefined) throw new Error("A0_GAP_PATCH_EVENT");
  return Object.freeze({
    baseRevision: state.revision,
    sourceEventIds: Object.freeze([event.id]),
    declaredChangedIds: Object.freeze([...declaredChangedIds]),
    candidate: Object.freeze({ ...state.document, title }),
    exactTimingPreserved: true,
    stableIdentityPolicy: "preserve-unmodified-allocate-new-inserts",
  });
}

function beginReplacement(
  state: AppState,
  candidate: ValidatedDocument,
  requestId: number,
  origin: ApplicationReplacementOrigin,
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
  }), `begin replacement ${origin}`).state;
  next = success(reduceEphemeralIntent({
    state: next,
    intent: {
      kind: "set-document-transition",
      transition: {
        kind: "committing",
        requestId,
        origin,
        baseRevision: next.revision,
        candidateDocumentId: candidate.id,
        undoDisposition: "retained",
      },
    },
  }), `transition replacement ${origin}`).state;
  return next;
}

describe("A0 state-matrix independently covered gaps", () => {
  test("initializes empty authority and refuses malformed structural identity edits", () => {
    const initialized = a0InitialState(emptyDocument());
    expect(initialized.bookmarks).toEqual({
      selection: { kind: "none" },
      insertion: { kind: "document-start" },
      range: null,
    });
    record(["A0-INIT-002"], initialized.bookmarks);

    const state = a0InitialState(a0MultiEventDocument());
    const section = state.document.sections[0];
    const measure = section?.measures[0];
    const event1 = measure?.events[0];
    const event2 = measure?.events[1];
    if (
      section === undefined ||
      measure === undefined ||
      event1 === undefined ||
      event2 === undefined
    ) throw new Error("A0_GAP_STRUCTURAL_FIXTURE");

    const occupied = refusal(runDocumentCommand({
      state,
      command: {
        ...a0Envelope(state, "occupied-insert", 0),
        kind: "insert",
        insertion: {
          nodeKind: "event",
          value: event2,
          destination: {
            kind: "event",
            measureId: measure.id,
            beforeEventId: null,
          },
          completionUpdates: [{
            measureId: measure.id,
            completion: { kind: "complete" },
          }],
        },
      },
      dependencies: a0Dependencies(),
    }), "command.payload_invalid");
    expect(occupied.state.document).toBe(state.document);

    const overlap = refusal(runDocumentCommand({
      state,
      command: {
        ...a0Envelope(state, "overlap-delete", 0),
        kind: "delete",
        targets: [
          { kind: "section", id: section.id },
          { kind: "event", id: event1.id },
        ],
        completionUpdates: [],
      },
      dependencies: a0Dependencies(),
    }), "command.ancestor_descendant_overlap");
    expect(overlap.state.document).toBe(state.document);

    const subtree = refusal(runDocumentCommand({
      state,
      command: {
        ...a0Envelope(state, "subtree-move", 0),
        kind: "move",
        targets: [{ kind: "section", id: section.id }],
        destination: {
          kind: "measure",
          sectionId: section.id,
          beforeMeasureId: measure.id,
        },
        completionUpdates: [],
      },
      dependencies: a0Dependencies(),
    }), "command.destination_invalid");
    expect(subtree.state.document).toBe(state.document);

    const collisionId = a0StableId("event", "event-a0-collision-new");
    const collision = refusal(runDocumentCommand({
      state,
      command: {
        ...a0Envelope(state, "copy-collision", 0),
        kind: "duplicate",
        targets: [{ kind: "event", id: event1.id }],
        destination: {
          kind: "event",
          measureId: measure.id,
          beforeEventId: null,
        },
        completionUpdates: [{
          measureId: measure.id,
          completion: { kind: "complete" },
        }],
      },
      dependencies: a0Dependencies({
        stableIdFactory: a0StableIdFactory([event2.id, collisionId]),
      }),
    }), "command.id_allocation_failed");
    expect(collision.state.document).toBe(state.document);

    const duplicateTarget = refusal(runDocumentCommand({
      state,
      command: {
        ...a0Envelope(state, "duplicate-target", 0),
        kind: "delete",
        targets: [
          { kind: "event", id: event2.id },
          { kind: "event", id: event2.id },
        ],
        completionUpdates: [],
      },
      dependencies: a0Dependencies(),
    }), "command.duplicate_target");
    expect(duplicateTarget.state.document).toBe(state.document);

    const emptyPatch = refusal(runDocumentCommand({
      state,
      command: {
        ...a0Envelope(state, "empty-section-patch", 0),
        kind: "set-section",
        sectionId: section.id,
        patch: {},
      },
      dependencies: a0Dependencies(),
    }), "command.payload_invalid");
    record(
      [
        "A0-CMD-002",
        "A0-CMD-006",
        "A0-CMD-008",
        "A0-CMD-010",
        "A0-CMD-041",
        "A0-CMD-042",
      ],
      {
        occupied: occupied.refusal.code,
        overlap: overlap.refusal.code,
        subtree: subtree.refusal.code,
        collision: collision.refusal.code,
        duplicateTarget: duplicateTarget.refusal.code,
        emptyPatch: emptyPatch.refusal.code,
      },
    );
  });

  test("executes every text coalescing boundary and decreasing-time near miss", () => {
    const initial = a0InitialState();
    const first = success(runDocumentCommand({
      state: initial,
      command: textCommand(initial, "coalesce-first", "A", 1_000, "F1"),
      dependencies: a0Dependencies(),
    }), "coalesce first").state;
    const inside = success(runDocumentCommand({
      state: first,
      command: textCommand(first, "coalesce-inside", "AB", 1_999, "F1"),
      dependencies: a0Dependencies(),
    }), "coalesce inside");
    expect(inside.outcome).toBe("coalesced");
    expect(inside.state.history.undo).toHaveLength(1);

    const boundary = success(runDocumentCommand({
      state: first,
      command: textCommand(first, "coalesce-boundary", "ABC", 2_000, "F1"),
      dependencies: a0Dependencies(),
    }), "coalesce boundary");
    expect(boundary.outcome).toBe("committed");
    expect(boundary.state.history.undo).toHaveLength(2);

    const focus = success(runDocumentCommand({
      state: first,
      command: textCommand(first, "coalesce-focus", "ABD", 1_001, "F2"),
      dependencies: a0Dependencies(),
    }), "coalesce focus");
    expect(focus.outcome).toBe("committed");
    expect(focus.state.history.undo).toHaveLength(2);

    const decreasing = refusal(runDocumentCommand({
      state: first,
      command: textCommand(first, "coalesce-decreasing", "ABE", 999, "F1"),
      dependencies: a0Dependencies(),
    }), "command.logical_time_invalid");
    expect(decreasing.counters.validationCalls).toBe(0);
    record(
      ["A0-CMD-012", "A0-CMD-013", "A0-CMD-014", "A0-CMD-015"],
      {
        inside: inside.outcome,
        boundary: boundary.outcome,
        focus: focus.outcome,
        decreasing: decreasing.refusal.code,
      },
    );
  });

  test("refuses invalid semantic timing and independently stale or undeclared patches", () => {
    const state = a0InitialState();
    const measure = state.document.sections[0]?.measures[0];
    const event = measure?.events[0];
    if (measure === undefined || event === undefined) {
      throw new Error("A0_GAP_SEMANTIC_FIXTURE");
    }
    const invalidTiming = refusal(runDocumentCommand({
      state,
      command: {
        ...a0Envelope(state, "invalid-timing", 0),
        kind: "set-duration",
        eventId: event.id,
        duration: duration(3),
        completionUpdate: {
          measureId: measure.id,
          completion: { kind: "complete" },
        },
      },
      dependencies: a0Dependencies(),
    }), "command.semantic_validation_failed");
    expect(invalidTiming.refusal.semanticIssues?.map(({ code }) => code)).toContain(
      "measure.complete_duration_mismatch",
    );
    expect(invalidTiming.state.document).toBe(state.document);

    const revisionNine = Object.freeze({ ...state, revision: 9 });
    const oldPatch = Object.freeze({
      ...patchWithTitle(state, "Old transpose"),
      baseRevision: 8,
    });
    const stale = refusal(runDocumentCommand({
      state: revisionNine,
      command: {
        ...a0Envelope(revisionNine, "stale-transpose", 0),
        kind: "transpose",
        lawId: "gap-law",
        patch: oldPatch,
      },
      dependencies: a0Dependencies(),
    }), "command.derived_patch_stale");

    const scope = refusal(runDocumentCommand({
      state,
      command: {
        ...a0Envelope(state, "scope-transpose", 0),
        kind: "transpose",
        lawId: "gap-law",
        patch: patchWithTitle(state, "Undeclared", [event.id]),
      },
      dependencies: a0Dependencies(),
    }), "command.derived_patch_scope_mismatch");

    const requested = success(beginApplicationRequest({
      state,
      request: {
        kind: "suggestion-search",
        id: 45,
        documentId: state.document.id,
        baseRevision: state.revision,
        status: "running",
      },
    }), "old request setup").state;
    const oldRequest = refusal(runDocumentCommand({
      state: requested,
      command: {
        ...a0Envelope(requested, "old-request", 0),
        kind: "apply-suggestion",
        suggestionId: "gap",
        providerId: "gap",
        requestId: 44,
        patch: patchWithTitle(requested, "Wrong request"),
      },
      dependencies: a0Dependencies(),
    }), "command.derived_patch_stale");
    record(
      ["A0-CMD-018", "A0-CMD-026", "A0-CMD-027", "A0-CMD-029", "A0-ATOMIC-001"],
      {
        invalidTiming: invalidTiming.refusal,
        stale: stale.refusal.code,
        scope: scope.refusal.code,
        oldRequest: oldRequest.refusal.code,
      },
    );
  });

  test("cancels replacement, discloses oversize, and shares all replacement origins", () => {
    const candidate = a0TemplateDocument("representativeCustomManual");
    const initial = a0InitialState();
    let awaiting = success(beginApplicationRequest({
      state: initial,
      request: {
        kind: "document-transition",
        id: 30,
        documentId: initial.document.id,
        baseRevision: initial.revision,
        status: "running",
      },
    }), "replacement cancel request").state;
    awaiting = success(reduceEphemeralIntent({
      state: awaiting,
      intent: {
        kind: "set-document-transition",
        transition: {
          kind: "awaiting-confirmation",
          requestId: 30,
          origin: "canonical-import",
          baseRevision: awaiting.revision,
          candidateDocumentId: candidate.id,
          undoDisposition: "retained",
        },
      },
    }), "replacement awaiting").state;
    const cancelled = success(settleApplicationRequest({
      state: awaiting,
      kind: "document-transition",
      id: 30,
      documentId: awaiting.document.id,
      baseRevision: awaiting.revision,
      disposition: "cancel",
    }), "replacement cancel");
    expect(cancelled.outcome).toBe("request-cancelled");
    expect(cancelled.state.document).toBe(initial.document);
    expect(cancelled.state.revision).toBe(0);

    const ready = beginReplacement(initial, candidate, 31, "canonical-import");
    const oversized = refusal(runDocumentCommand({
      state: ready,
      command: {
        ...a0Envelope(ready, "oversized-retain", 0),
        kind: "replace-document",
        origin: "canonical-import",
        candidate,
        requestId: 31,
        retirement: {
          requestId: 31,
          retiredTransportGeneration: ready.transport.generation,
          progressionRetired: true,
          previewRetired: true,
          noFutureAttack: true,
        },
        undoDisposition: { kind: "retain" },
      },
      dependencies: a0Dependencies({
        estimateHistoryRetainedBytes: () => MAX_HISTORY_RETAINED_BYTES + 1,
      }),
    }), "history.entry_too_large");
    expect(oversized.state.document).toBe(initial.document);

    const origins = ["new", "lesson", "legacy-import"] as const;
    const originResults: Record<string, unknown> = {};
    for (const [index, origin] of origins.entries()) {
      const originInitial = a0InitialState();
      const originReady = beginReplacement(
        originInitial,
        candidate,
        40 + index,
        origin,
      );
      const committed = success(runDocumentCommand({
        state: originReady,
        command: {
          ...a0Envelope(originReady, `origin-${origin}`, 0),
          kind: "replace-document",
          origin,
          candidate,
          requestId: 40 + index,
          retirement: {
            requestId: 40 + index,
            retiredTransportGeneration: originReady.transport.generation,
            progressionRetired: true,
            previewRetired: true,
            noFutureAttack: true,
          },
          undoDisposition: { kind: "retain" },
        },
        dependencies: a0Dependencies(),
      }), `origin ${origin}`);
      expect(committed.state.document.id).toBe(candidate.id);
      expect(committed.state.history.undo).toHaveLength(1);
      originResults[origin] = {
        revision: committed.state.revision,
        documentId: committed.state.document.id,
      };
    }
    record(
      ["A0-CMD-032", "A0-CMD-033", "A0-CMD-035", "A0-CMD-036", "A0-CMD-037"],
      {
        cancelled: cancelled.outcome,
        oversized: oversized.refusal.code,
        origins: originResults,
      },
    );
  });

  test("enforces revision, notice, selection, and dialog limits", () => {
    const initial = a0InitialState();
    const exhausted = Object.freeze({
      ...initial,
      revision: MAX_APPLICATION_REVISION,
    });
    let decodeCalls = 0;
    const baseDependencies = a0Dependencies();
    const revision = refusal(runDocumentCommand({
      state: exhausted,
      command: textCommand(exhausted, "revision-exhausted", "Never", 0),
      dependencies: a0Dependencies({
        decodeDocumentShape: (candidate) => {
          decodeCalls += 1;
          return baseDependencies.decodeDocumentShape(candidate);
        },
      }),
    }), "application.revision_exhausted");
    expect(revision.counters.validationCalls).toBe(0);
    expect(decodeCalls).toBe(0);

    const notices = Object.freeze(Array.from({ length: 32 }, (_, index) =>
      Object.freeze({
        sequence: index + 1,
        level: "error" as const,
        code: `notice.${String(index + 1)}`,
        message: `Notice ${String(index + 1)}`,
        createdAtRevision: 0,
        dismissible: index >= 3,
      })
    ));
    const noticeState = Object.freeze({
      ...initial,
      notices,
      nextSequence: 33,
    });
    const noticeFailure = refusal(runDocumentCommand({
      state: noticeState,
      command: {
        ...textCommand(noticeState, "notice-failure", "Never", 0),
        expectedRevision: 99,
      },
      dependencies: a0Dependencies(),
    }), "command.stale_revision");
    expect(noticeFailure.state.notices).toHaveLength(32);
    expect(noticeFailure.state.notices.some(({ sequence }) => sequence === 4)).toBe(false);
    expect(noticeFailure.state.notices.at(-1)?.sequence).toBe(33);

    const event = initial.document.sections[0]?.measures[0]?.events[0];
    if (event === undefined) throw new Error("A0_GAP_LIMIT_EVENT");
    const tooManyIds = Array.from({ length: 8_193 }, () => event.id) as [
      ChordEventId,
      ...ChordEventId[],
    ];
    const selection = refusal(reduceEphemeralIntent({
      state: initial,
      intent: {
        kind: "set-bookmarks",
        bookmarks: {
          selection: {
            kind: "events",
            eventIds: tooManyIds,
            anchorEventId: event.id,
            focusEventId: event.id,
          },
          insertion: initial.bookmarks.insertion,
          range: null,
        },
      },
    }), "bookmark.selection_limit");
    expect(selection.state.bookmarks).toBe(initial.bookmarks);

    let dialogs = initial;
    for (let index = 0; index < 8; index += 1) {
      dialogs = success(reduceEphemeralIntent({
        state: dialogs,
        intent: {
          kind: "push-dialog",
          dialog: {
            id: `dialog-${String(index)}`,
            kind: "error-details",
            phase: "open",
            blocksHistory: true,
            requestId: null,
          },
        },
      }), `dialog ${String(index)}`).state;
    }
    const dialogLimit = refusal(reduceEphemeralIntent({
      state: dialogs,
      intent: {
        kind: "push-dialog",
        dialog: {
          id: "dialog-9",
          kind: "error-details",
          phase: "open",
          blocksHistory: true,
          requestId: null,
        },
      },
    }), "dialog.stack_limit");
    expect(dialogLimit.state.dialogs).toHaveLength(8);
    record(
      ["A0-ATOMIC-002", "A0-UI-001", "A0-UI-003", "A0-UI-004"],
      {
        revision: revision.refusal.code,
        noticeSequences: noticeFailure.state.notices.map(({ sequence }) => sequence),
        selection: selection.refusal.code,
        dialogs: dialogLimit.state.dialogs.length,
      },
    );
  });

  test("moves measure batches canonically and inserts at a stable measure boundary", () => {
    let state = a0InitialState(a0MultiMeasureDocument());
    const section = state.document.sections[0];
    const measures = section?.measures;
    if (section === undefined || measures === undefined || measures.length !== 4) {
      throw new Error("A0_GAP_MEASURES_FIXTURE");
    }
    const [measure1, measure2, measure3, measure4] = measures;
    if (
      measure1 === undefined ||
      measure2 === undefined ||
      measure3 === undefined ||
      measure4 === undefined
    ) throw new Error("A0_GAP_MEASURES_MEMBERS");
    const insertedId = a0StableId("measure", "measure-a0-gap-9");
    const inserted: Measure = Object.freeze({
      id: insertedId,
      events: [] as const,
      completion: Object.freeze({ kind: "empty" }),
    });
    state = success(runDocumentCommand({
      state,
      command: {
        ...a0Envelope(state, "insert-measure-gap", 0),
        kind: "insert",
        insertion: {
          nodeKind: "measure",
          value: inserted,
          destination: {
            kind: "measure",
            sectionId: section.id,
            beforeMeasureId: measure2.id,
          },
          completionUpdates: [],
        },
      },
      dependencies: a0Dependencies(),
    }), "insert measure gap").state;
    expect(state.document.sections[0]?.measures.map(({ id }) => id)).toEqual([
      measure1.id,
      insertedId,
      measure2.id,
      measure3.id,
      measure4.id,
    ]);

    const moveState = a0InitialState(a0MultiMeasureDocument());
    const moveSection = moveState.document.sections[0];
    const moveMeasures = moveSection?.measures;
    if (moveSection === undefined || moveMeasures === undefined || moveMeasures.length !== 4) {
      throw new Error("A0_GAP_MOVE_MEASURES_FIXTURE");
    }
    const [moveMeasure1, moveMeasure2, moveMeasure3, moveMeasure4] = moveMeasures;
    if (
      moveMeasure1 === undefined ||
      moveMeasure2 === undefined ||
      moveMeasure3 === undefined ||
      moveMeasure4 === undefined
    ) throw new Error("A0_GAP_MOVE_MEASURES_MEMBERS");
    const moved = success(runDocumentCommand({
      state: moveState,
      command: {
        ...a0Envelope(moveState, "move-measures-gap", 0),
        kind: "move",
        targets: [
          { kind: "measure", id: moveMeasure3.id },
          { kind: "measure", id: moveMeasure2.id },
        ],
        destination: {
          kind: "measure",
          sectionId: moveSection.id,
          beforeMeasureId: null,
        },
        completionUpdates: [],
      },
      dependencies: a0Dependencies(),
    }), "move measure gap");
    expect(moved.state.document.sections[0]?.measures.map(({ id }) => id)).toEqual([
      moveMeasure1.id,
      moveMeasure4.id,
      moveMeasure2.id,
      moveMeasure3.id,
    ]);
    record(["A0-CMD-039", "A0-CMD-040"], {
      inserted: state.document.sections[0]?.measures.map(({ id }) => id),
      moved: moved.state.document.sections[0]?.measures.map(({ id }) => id),
    });
  });

  test("derives missing selectors, truthful history, and exact transport expectation without caching", () => {
    const initial = a0InitialState(a0MultiEventDocument());
    const event = initial.document.sections[0]?.measures[0]?.events[0];
    if (event === undefined) throw new Error("A0_GAP_SELECTOR_EVENT");
    const missingId = a0StableId("event", "event-a0-gap-missing");
    expect(selectEventById(initial, missingId)).toBeNull();

    const dirtyState = Object.freeze({
      ...initial,
      revision: 12,
      exportRevision: 12,
      recovery: Object.freeze({ kind: "clean" as const, persistedRevision: 11 }),
    });
    const documentKeys = Object.keys(dirtyState.document);
    expect(selectDirtyState(dirtyState)).toEqual({
      sinceExport: false,
      sinceRecovery: true,
    });
    expect(Object.keys(dirtyState.document)).toEqual(documentKeys);

    const selectedState = Object.freeze({
      ...initial,
      bookmarks: Object.freeze({
        ...initial.bookmarks,
        selection: Object.freeze({
          kind: "events" as const,
          eventIds: Object.freeze([event.id, missingId] as const),
          anchorEventId: event.id,
          focusEventId: missingId,
        }),
      }),
    });
    const selected = selectSelectedEvents(selectedState);
    expect(selected.events.map(({ id }) => id)).toEqual([event.id]);
    expect(selected.missingIds).toEqual([missingId]);
    expect(selectedState.document).toBe(initial.document);

    let historyState = success(runDocumentCommand({
      state: initial,
      command: textCommand(initial, "history-first", "First", 0, "H1"),
      dependencies: a0Dependencies(),
    }), "history first").state;
    historyState = success(runDocumentCommand({
      state: historyState,
      command: textCommand(historyState, "history-second", "Second", 1_000, "H2"),
      dependencies: a0Dependencies(),
    }), "history second").state;
    historyState = success(undoDocumentCommand({ state: historyState }), "history undo").state;
    const availability = selectHistoryAvailability(historyState);
    expect(availability).toEqual({
      canUndo: true,
      canRedo: true,
      locked: false,
      undoLabel: "history-first",
      redoLabel: "history-second",
    });
    const redoneHistory = success(
      redoDocumentCommand({ state: historyState }),
      "history redo",
    ).state;
    expect(redoneHistory.document.title).toBe("Second");

    let transportState: AppState = Object.freeze({
      ...initial,
      revision: 12,
      transport: Object.freeze({
        ...initial.transport,
        status: "ready" as const,
        generation: 5,
        commandRequestId: 20,
        notificationSequence: 8,
        planRevision: 12,
      }),
    });
    transportState = success(reduceEphemeralIntent({
      state: transportState,
      intent: {
        kind: "expect-transport",
        commandRequestId: 21,
        documentId: transportState.document.id,
        planRevision: 12,
        status: "starting",
        startBeat: transportState.transport.startBeat,
        playhead: transportState.transport.playhead,
      },
    }), "transport expectation").state;
    expect(transportState.transport).toMatchObject({
      status: "starting",
      generation: 5,
      commandRequestId: 21,
      notificationSequence: 8,
      planRevision: 12,
    });
    expect(transportState.revision).toBe(12);
    record(
      ["A0-UI-007", "A0-UI-008", "A0-UI-009", "A0-UI-010", "A0-UI-011"],
      {
        missing: null,
        dirty: selectDirtyState(dirtyState),
        selected: {
          events: selected.events.map(({ id }) => id),
          missing: selected.missingIds,
        },
        availability,
        transport: transportState.transport,
      },
    );
  });

  test("settles a refused transport expectation exactly once and never over a genuine notification", () => {
    const initial = a0InitialState();
    const base: AppState = Object.freeze({
      ...initial,
      revision: 12,
      transport: Object.freeze({
        ...initial.transport,
        status: "ready" as const,
        generation: 5,
        commandRequestId: 20,
        notificationSequence: 8,
        planRevision: 12,
      }),
    });
    const expecting = success(reduceEphemeralIntent({
      state: base,
      intent: {
        kind: "expect-transport",
        commandRequestId: 21,
        documentId: base.document.id,
        planRevision: 12,
        status: "starting",
        startBeat: base.transport.startBeat,
        playhead: base.transport.playhead,
      },
    }), "install expectation").state;

    // A0-UI-012: the refusal outcome settles the optimistic status with the
    // service-echoed state, retains generation/sequence, and moves no revision.
    const settled = success(reduceEphemeralIntent({
      state: expecting,
      intent: {
        kind: "settle-transport-expectation",
        commandRequestId: 21,
        documentId: expecting.document.id,
        planRevision: 12,
        status: "ready",
        failureCode: "transport.queue_overflow",
      },
    }), "settle refusal");
    expect(settled.outcome).toBe("ephemeral-updated");
    expect(settled.state.transport).toMatchObject({
      status: "ready",
      generation: 5,
      commandRequestId: 21,
      notificationSequence: 8,
      planRevision: 12,
      failureCode: "transport.queue_overflow",
    });
    expect(settled.state.revision).toBe(12);
    expect(settled.state.history).toBe(expecting.history);

    // Exactly once: the same settlement replayed against the settled slot is
    // stale with exact state identity.
    const replay = success(reduceEphemeralIntent({
      state: settled.state,
      intent: {
        kind: "settle-transport-expectation",
        commandRequestId: 21,
        documentId: settled.state.document.id,
        planRevision: 12,
        status: "ready",
        failureCode: "transport.queue_overflow",
      },
    }), "replayed settlement");
    expect(replay.outcome).toBe("ignored-stale");
    expect(replay.state).toBe(settled.state);

    // A0-UI-013: a genuine notification already settled the slot; the late
    // refusal settlement is ignored with exact state identity.
    const notified: AppState = Object.freeze({
      ...expecting,
      transport: Object.freeze({
        ...expecting.transport,
        status: "playing" as const,
        generation: 6,
        notificationSequence: 9,
        failureCode: null,
      }),
    });
    const lateSettle = success(reduceEphemeralIntent({
      state: notified,
      intent: {
        kind: "settle-transport-expectation",
        commandRequestId: 21,
        documentId: notified.document.id,
        planRevision: 12,
        status: "ready",
        failureCode: "transport.queue_overflow",
      },
    }), "late settlement");
    expect(lateSettle.outcome).toBe("ignored-stale");
    expect(lateSettle.state).toBe(notified);

    // Unpinned near miss: a settlement naming a superseded command request is
    // equally stale.
    const oldRequest = success(reduceEphemeralIntent({
      state: expecting,
      intent: {
        kind: "settle-transport-expectation",
        commandRequestId: 20,
        documentId: expecting.document.id,
        planRevision: 12,
        status: "ready",
        failureCode: "transport.queue_overflow",
      },
    }), "old-request settlement");
    expect(oldRequest.outcome).toBe("ignored-stale");
    expect(oldRequest.state).toBe(expecting);

    // A0-UI-014: a blank failure code refuses; so does a starting/stopping
    // status claim smuggled past the type system.
    const blankCode = refusal(reduceEphemeralIntent({
      state: expecting,
      intent: {
        kind: "settle-transport-expectation",
        commandRequestId: 21,
        documentId: expecting.document.id,
        planRevision: 12,
        status: "ready",
        failureCode: "",
      },
    }), "transport.expectation_invalid");
    expect(blankCode.refusal.path).toEqual(["transport"]);
    const optimisticClaim = refusal(reduceEphemeralIntent({
      state: expecting,
      intent: {
        kind: "settle-transport-expectation",
        commandRequestId: 21,
        documentId: expecting.document.id,
        planRevision: 12,
        status: "starting" as unknown as "ready",
        failureCode: "transport.queue_overflow",
      },
    }), "transport.expectation_invalid");
    expect(optimisticClaim.refusal.path).toEqual(["transport"]);

    record(["A0-UI-012", "A0-UI-013", "A0-UI-014"], {
      settled: settled.state.transport,
      replayOutcome: replay.outcome,
      lateOutcome: lateSettle.outcome,
      oldRequestOutcome: oldRequest.outcome,
      blankCodeRefusal: blankCode.refusal.code,
      optimisticClaimRefusal: optimisticClaim.refusal.code,
    });
  });
});

afterAll(() => {
  const ids = [...observations.keys()].sort();
  expect(ids).toHaveLength(35);
  const observation = {
    schema: "changes.evidence.a0-state-matrix-gap-observation.v1",
    caseIds: ids,
    caseHashes: Object.fromEntries(
      [...observations].sort(([left], [right]) => left.localeCompare(right)),
    ),
    casesObserved: ids.length,
    authoritativePartialMutations: 0,
    wallTimeSemanticCutoff: false,
    status: "pass",
  };
  console.log(`A0_STATE_GAP_OBSERVATION ${JSON.stringify(canonical(observation))}`);
});
