import { describe, expect, test } from "bun:test";

import {
  MAX_APPLICATION_SEQUENCE,
  applyPreparedImportReplacementToLatestState,
  createExportRevisionMarkedState,
  createStudioBootstrap,
  validateDocumentSemantics,
  type AppState,
  type StudioPreparedImportReplacementMaterial,
} from "../../src/application";
import { decodeDocumentShape } from "../../src/domain";

/**
 * Reference-identity laws for the two pure owner-state constructors. The
 * integration suite proves the observable composition behavior; these tests
 * pin what the projection cannot see: which exact object references the next
 * state keeps, and how the late-bound sequence allocation saturates.
 */

function bootstrapState(): AppState {
  const bootstrap = createStudioBootstrap();
  expect(bootstrap.ok).toBe(true);
  if (!bootstrap.ok) throw new Error("OWNER_STATE_TEST_BOOTSTRAP");
  return bootstrap.value.state;
}

function candidateDocument() {
  const decoded = decodeDocumentShape({
    schema: "changes.progression.v2",
    id: "owner-merge-candidate",
    title: "Merge Candidate",
    description: "",
    meter: { beatsPerBar: 4, beatUnit: 4 },
    tempoBpm: 120,
    key: null,
    sections: [],
    playback: {
      instrumentId: "mellow-keys",
      masterVolume: 0.8,
      reverbAmount: 0.2,
      countInBars: 0,
    },
  });
  if (!decoded.ok) throw new Error("OWNER_STATE_TEST_STRUCTURAL");
  const validated = validateDocumentSemantics(decoded.value);
  if (!validated.ok) throw new Error("OWNER_STATE_TEST_SEMANTIC");
  return validated.value;
}

function materialOver(
  state: AppState,
  warning: boolean,
): StudioPreparedImportReplacementMaterial {
  const document = candidateDocument();
  const bookmarks = Object.freeze({
    selection: Object.freeze({ kind: "none" as const }),
    insertion: Object.freeze({ kind: "document-start" as const }),
    range: null,
  });
  const historyEntry = Object.freeze({
    commandId: "owner-merge-command",
    commandKind: "replace-document" as const,
    label: "Merge",
    before: state.document,
    after: document,
    beforeBookmarks: state.bookmarks,
    afterBookmarks: bookmarks,
    retainedBytesEstimate: 1_000,
    coalescing: null,
    firstLogicalTimeMs: 1_000,
    lastLogicalTimeMs: 1_000,
  });
  return Object.freeze({
    command: Object.freeze({
      id: "owner-merge-command",
      label: "Merge",
      expectedDocumentId: state.document.id,
      expectedRevision: state.revision,
      logicalTimeMs: 1_000,
      coalescing: null,
      kind: "replace-document" as const,
      origin: "canonical-import" as const,
      candidate: document,
      requestId: 7,
      retirement: Object.freeze({
        requestId: 7,
        retiredTransportGeneration: 0,
        progressionRetired: true as const,
        previewRetired: true as const,
        noFutureAttack: true as const,
      }),
      undoDisposition: Object.freeze({ kind: "retain" as const }),
    }),
    document,
    newRevision: state.revision + 1,
    historyEntry,
    history: Object.freeze({
      undo: Object.freeze([historyEntry]),
      redo: Object.freeze([]),
      retainedBytesEstimate: 1_000,
    }),
    bookmarks,
    quickEntry: Object.freeze({
      text: "",
      target: bookmarks.insertion,
      baseRevision: state.revision + 1,
      status: "idle" as const,
      issueCodes: Object.freeze([]),
    }),
    warningNotice: warning
      ? Object.freeze({
          level: "warning" as const,
          code: "history.replacement_not_undoable",
          message: "This replacement cannot be undone.",
          createdAtRevision: state.revision + 1,
          dismissible: true,
        })
      : null,
    effects: Object.freeze([]),
    counters: Object.freeze({
      sectionsVisited: 0,
      measuresVisited: 0,
      eventsVisited: 0,
      stableIdsIndexed: 0,
      historyEntriesVisited: 0,
      historyBytesEstimated: 1_000,
      bookmarksRepaired: 0,
      requestsCompared: 0,
      transportNotificationsCompared: 0,
      validationCalls: 1,
    }),
    pendingRequestsBefore: state.pendingRequests,
    transitionBefore: state.documentTransition,
    bookmarksBefore: state.bookmarks,
    expectedTransportGeneration: state.transport.generation,
  });
}

describe("createExportRevisionMarkedState", () => {
  test("replaces only exportRevision and keeps every other field reference", () => {
    const state = bootstrapState();
    const next = createExportRevisionMarkedState(state, 0);
    expect(next).not.toBe(state);
    expect(Object.isFrozen(next)).toBe(true);
    expect(next.exportRevision).toBe(0);
    for (const field of [
      "document",
      "revision",
      "recovery",
      "history",
      "bookmarks",
      "panels",
      "dialogs",
      "quickEntry",
      "importDraft",
      "transport",
      "pendingRequests",
      "documentTransition",
      "focusRequest",
      "notices",
      "nextSequence",
    ] as const) {
      expect(next[field]).toBe(state[field]);
    }
  });
});

describe("applyPreparedImportReplacementToLatestState", () => {
  test("applies the frozen field partition with latest references preserved", () => {
    const state = bootstrapState();
    const material = materialOver(state, false);
    const next = applyPreparedImportReplacementToLatestState(state, material);
    // Preserve latest value and latest references.
    expect(next.exportRevision).toBe(state.exportRevision);
    expect(next.recovery).toBe(state.recovery);
    expect(next.panels).toBe(state.panels);
    expect(next.dialogs).toBe(state.dialogs);
    expect(next.transport).toBe(state.transport);
    // Replacement-owned material, by reference.
    expect(next.document).toBe(material.document);
    expect(next.revision).toBe(material.newRevision);
    expect(next.history).toBe(material.history);
    expect(next.bookmarks).toBe(material.bookmarks);
    expect(next.quickEntry).toBe(material.quickEntry);
    expect(next.importDraft).toBeNull();
    expect(next.pendingRequests).toEqual([]);
    expect(next.documentTransition).toEqual({ kind: "idle" });
    // Late-bound allocation from the LATEST sequence.
    expect(next.focusRequest).toEqual({
      sequence: state.nextSequence,
      target: { kind: "chart" },
      reason: "replacement",
    });
    expect(next.notices).toEqual([]);
    expect(next.nextSequence).toBe(state.nextSequence + 1);
  });

  test("the warning notice allocates after focus and saturates at the maximum", () => {
    const base = bootstrapState();
    const boundary: AppState = Object.freeze({
      ...base,
      nextSequence: MAX_APPLICATION_SEQUENCE - 1,
    });
    const material = materialOver(boundary, true);
    const next = applyPreparedImportReplacementToLatestState(
      boundary,
      material,
    );
    expect(next.focusRequest).toMatchObject({
      sequence: MAX_APPLICATION_SEQUENCE - 1,
    });
    expect(next.notices).toHaveLength(1);
    expect(next.notices[0]).toMatchObject({
      sequence: MAX_APPLICATION_SEQUENCE,
      code: "history.replacement_not_undoable",
    });
    // nextSequence saturates at the maximum; it never exceeds it.
    expect(next.nextSequence).toBe(MAX_APPLICATION_SEQUENCE);
  });
});
