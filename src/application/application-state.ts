import type { ValidatedDocument } from "../domain";
import {
  APPLICATION_PANEL_IDS,
  APPLICATION_REQUEST_KINDS,
  APPLICATION_TRANSPORT_STATUSES,
  MAX_APPLICATION_REVISION,
  MAX_APPLICATION_SEQUENCE,
  MAX_COMMAND_ID_CODE_POINTS,
  MAX_COMMAND_LABEL_CODE_POINTS,
  MAX_DIALOG_STACK_DEPTH,
  MAX_DRAFT_ISSUES,
  MAX_FOCUS_SESSION_ID_CODE_POINTS,
  MAX_HISTORY_RETAINED_BYTES,
  MAX_PENDING_REQUESTS,
  MAX_QUICK_ENTRY_CODE_POINTS,
  TEXT_COMMAND_COALESCE_WINDOW_MS,
  type AcceptTransportNotification,
  type AppState,
  type ApplicationEffect,
  type ApplicationRequestKind,
  type ApplicationStateOperations,
  type ApplicationTransitionResult,
  type BeginApplicationRequest,
  type CreateInitialAppState,
  type DialogDescriptor,
  type DocumentCommand,
  type DocumentNodeRef,
  type DocumentTransitionState,
  type EphemeralIntent,
  type HistoryEntry,
  type HistoryState,
  type InsertionPoint,
  type PendingApplicationRequest,
  type RedoDocumentCommand,
  type ReduceEphemeralIntent,
  type RunDocumentCommand,
  type SettleApplicationRequest,
  type StableUiBookmarks,
  type TextFieldTarget,
  type TransportNotification,
  type UndoDocumentCommand,
  type UiFocusTarget,
} from "./application-state-contract";
import {
  focusAfterCommand,
  immutableInsertionPoint,
  initialBookmarks,
  normalizeBookmarks,
  repairBookmarks,
} from "./application-bookmarks";
import { validateDerivedCommand } from "./application-derived-patch";
import { applyDocumentCommand } from "./application-document-commands";
import {
  enforceHistoryCaps,
  estimateHistoryRetainedBytes,
  isValidHistoryEstimate,
  withRecomputedHistoryBytes,
} from "./application-history";
import {
  appendApplicationNotice,
  buildDocumentIndex,
  createWorkCounters,
  failureResult,
  isBoundedToken,
  isNonnegativeSafeInteger,
  isPositiveSafeInteger,
  runtimeField,
  successResult,
  type MutableApplicationWorkCounters,
} from "./application-state-helpers";
import {
  isHistoryLocked,
  selectBeatRange,
  selectDirtyState,
  selectEventById,
  selectHistoryAvailability,
  selectInsertionLocation,
  selectSelectedEvents,
} from "./application-selectors";

type EntryWithoutEstimate = Omit<HistoryEntry, "retainedBytesEstimate">;

function requestOrder(kind: ApplicationRequestKind): number {
  return APPLICATION_REQUEST_KINDS.indexOf(kind);
}

function validTransportNotificationStatus(
  value: unknown,
): value is TransportNotification["status"] {
  return (
    value !== "unavailable" &&
    APPLICATION_TRANSPORT_STATUSES.some((status) => status === value)
  );
}

function commandTargetKey(target: TextFieldTarget): string {
  switch (target.kind) {
    case "document-title":
      return "title";
    case "document-description":
      return "description";
    case "section-name":
      return `section:${target.sectionId}:name`;
    case "section-annotation":
      return `section:${target.sectionId}:annotation`;
    case "event-annotation":
      return `event:${target.eventId}:annotation`;
  }
}

function envelopeFailure(
  state: AppState,
  command: DocumentCommand,
): Readonly<{
  code: Extract<
    ApplicationTransitionResult,
    { ok: false }
  >["refusal"]["code"];
  path: readonly (string | number)[];
}> | null {
  if (!isBoundedToken(command.id, MAX_COMMAND_ID_CODE_POINTS)) {
    return { code: "command.id_invalid", path: ["id"] };
  }
  if (!isBoundedToken(command.label, MAX_COMMAND_LABEL_CODE_POINTS)) {
    return { code: "command.label_invalid", path: ["label"] };
  }
  if (!isNonnegativeSafeInteger(command.logicalTimeMs)) {
    return { code: "command.logical_time_invalid", path: ["logicalTimeMs"] };
  }
  const latest = state.history.undo[state.history.undo.length - 1];
  if (
    latest !== undefined &&
    command.logicalTimeMs < latest.lastLogicalTimeMs
  ) {
    return { code: "command.logical_time_invalid", path: ["logicalTimeMs"] };
  }
  if (command.expectedDocumentId !== state.document.id) {
    return { code: "command.wrong_document", path: ["expectedDocumentId"] };
  }
  if (command.expectedRevision !== state.revision) {
    return { code: "command.stale_revision", path: ["expectedRevision"] };
  }
  if (state.revision >= MAX_APPLICATION_REVISION) {
    return { code: "application.revision_exhausted", path: ["revision"] };
  }
  if (state.nextSequence >= MAX_APPLICATION_SEQUENCE) {
    return { code: "application.sequence_exhausted", path: ["nextSequence"] };
  }
  const runtimeCoalescing = runtimeField(command, "coalescing");
  if (command.kind === "set-text") {
    if (typeof runtimeCoalescing !== "object" || runtimeCoalescing === null) {
      return { code: "command.coalescing_invalid", path: ["coalescing"] };
    }
    const coalescingKey = runtimeField(runtimeCoalescing, "key");
    const focusSessionId = runtimeField(runtimeCoalescing, "focusSessionId");
    if (
      runtimeField(runtimeCoalescing, "kind") !== "text-field" ||
      typeof coalescingKey !== "string" ||
      coalescingKey !== commandTargetKey(command.target) ||
      typeof focusSessionId !== "string" ||
      !isBoundedToken(focusSessionId, MAX_FOCUS_SESSION_ID_CODE_POINTS)
    ) {
      return { code: "command.coalescing_invalid", path: ["coalescing"] };
    }
  } else if (runtimeCoalescing !== null) {
    return { code: "command.coalescing_invalid", path: ["coalescing"] };
  }
  if (isHistoryLocked(state) && command.kind !== "replace-document") {
    return { code: "history.locked", path: ["history"] };
  }
  return null;
}

function currentRequest(
  state: AppState,
  kind: ApplicationRequestKind,
  id: number,
): PendingApplicationRequest | null {
  return (
    state.pendingRequests.find(
      (request) =>
        request.kind === kind &&
        request.id === id &&
        request.documentId === state.document.id &&
        request.baseRevision === state.revision,
    ) ?? null
  );
}

function replacementFailure(
  state: AppState,
  command: Extract<DocumentCommand, { kind: "replace-document" }>,
): Readonly<{
  code: Extract<
    ApplicationTransitionResult,
    { ok: false }
  >["refusal"]["code"];
  path: readonly (string | number)[];
}> | null {
  const pending = currentRequest(state, "document-transition", command.requestId);
  const transition = state.documentTransition;
  if (
    pending === null ||
    transition.kind !== "committing" ||
    transition.requestId !== command.requestId ||
    transition.origin !== command.origin ||
    transition.baseRevision !== state.revision ||
    transition.candidateDocumentId !== command.candidate.id ||
    transition.undoDisposition !==
      (command.undoDisposition.kind === "retain"
        ? "retained"
        : "explicitly-unavailable")
  ) {
    return { code: "command.derived_patch_stale", path: ["requestId"] };
  }
  if (
    command.retirement.requestId !== command.requestId ||
    runtimeField(command.retirement, "progressionRetired") !== true ||
    runtimeField(command.retirement, "previewRetired") !== true ||
    runtimeField(command.retirement, "noFutureAttack") !== true ||
    !isNonnegativeSafeInteger(command.retirement.retiredTransportGeneration) ||
    command.retirement.retiredTransportGeneration < state.transport.generation
  ) {
    return { code: "command.payload_invalid", path: ["retirement"] };
  }
  if (
    command.undoDisposition.kind === "explicitly-unavailable" &&
    (!isBoundedToken(
      command.undoDisposition.confirmationId,
      MAX_COMMAND_ID_CODE_POINTS,
    ) ||
      runtimeField(command.undoDisposition, "exportRecommended") !== true)
  ) {
    return { code: "history.nonundoable_confirmation_required", path: ["undoDisposition"] };
  }
  return null;
}

function effect(
  kind: ApplicationEffect["kind"],
  revision: number,
  reasonCode: string,
  requestId: number | null = null,
): ApplicationEffect {
  return Object.freeze({ kind, revision, requestId, reasonCode });
}

function nextFocusState(
  state: AppState,
  target: UiFocusTarget,
  reason: NonNullable<AppState["focusRequest"]>["reason"],
): AppState {
  const sequence = state.nextSequence;
  return Object.freeze({
    ...state,
    focusRequest: Object.freeze({ sequence, target, reason }),
    nextSequence: sequence + 1,
  });
}

function coalesces(
  state: AppState,
  command: DocumentCommand,
  previous: HistoryEntry | undefined,
): previous is HistoryEntry {
  return (
    command.kind === "set-text" &&
    previous !== undefined &&
    previous.commandKind === "set-text" &&
    previous.coalescing !== null &&
    previous.coalescing.key === command.coalescing.key &&
    previous.coalescing.focusSessionId === command.coalescing.focusSessionId &&
    state.history.redo.length === 0 &&
    command.logicalTimeMs >= previous.lastLogicalTimeMs &&
    command.logicalTimeMs - previous.lastLogicalTimeMs <
      TEXT_COMMAND_COALESCE_WINDOW_MS
  );
}

function estimateEntry(
  entry: EntryWithoutEstimate,
  estimator: (entry: EntryWithoutEstimate) => number,
  counters: MutableApplicationWorkCounters,
): HistoryEntry | null {
  const retainedBytesEstimate = estimator(entry);
  if (!isValidHistoryEstimate(retainedBytesEstimate)) return null;
  counters.historyBytesEstimated += retainedBytesEstimate;
  return Object.freeze({ ...entry, retainedBytesEstimate });
}

function nextHistory(
  state: AppState,
  command: DocumentCommand,
  after: ValidatedDocument,
  afterBookmarks: StableUiBookmarks,
  counters: MutableApplicationWorkCounters,
  estimator: (entry: EntryWithoutEstimate) => number,
): Readonly<
  | { ok: true; history: HistoryState; outcome: "committed" | "coalesced"; oversizedReplacement: boolean }
  | { ok: false; code: "history.byte_estimate_invalid" | "history.entry_too_large" | "history.nonundoable_confirmation_required" }
> {
  const previous = state.history.undo[state.history.undo.length - 1];
  let entryWithoutEstimate: EntryWithoutEstimate;
  let undoPrefix: readonly HistoryEntry[];
  let outcome: "committed" | "coalesced";
  if (coalesces(state, command, previous)) {
    entryWithoutEstimate = {
      commandId: previous.commandId,
      commandKind: previous.commandKind,
      label: previous.label,
      before: previous.before,
      after,
      beforeBookmarks: previous.beforeBookmarks,
      afterBookmarks,
      coalescing: previous.coalescing,
      firstLogicalTimeMs: previous.firstLogicalTimeMs,
      lastLogicalTimeMs: command.logicalTimeMs,
    };
    undoPrefix = state.history.undo.slice(0, -1);
    outcome = "coalesced";
  } else {
    entryWithoutEstimate = {
      commandId: command.id,
      commandKind: command.kind,
      label: command.label,
      before: state.document,
      after,
      beforeBookmarks: state.bookmarks,
      afterBookmarks,
      coalescing:
        command.kind === "set-text"
          ? Object.freeze({ ...command.coalescing })
          : null,
      firstLogicalTimeMs: command.logicalTimeMs,
      lastLogicalTimeMs: command.logicalTimeMs,
    };
    undoPrefix = state.history.undo;
    outcome = "committed";
  }
  const entry = estimateEntry(entryWithoutEstimate, estimator, counters);
  if (entry === null) return { ok: false, code: "history.byte_estimate_invalid" };
  const oversized = entry.retainedBytesEstimate > MAX_HISTORY_RETAINED_BYTES;
  if (oversized) {
    if (
      command.kind !== "replace-document" ||
      command.undoDisposition.kind !== "explicitly-unavailable"
    ) {
      return { ok: false, code: "history.entry_too_large" };
    }
    return {
      ok: true,
      history: Object.freeze({
        undo: Object.freeze([]),
        redo: Object.freeze([]),
        retainedBytesEstimate: 0,
      }),
      outcome: "committed",
      oversizedReplacement: true,
    };
  }
  if (
    command.kind === "replace-document" &&
    command.undoDisposition.kind === "explicitly-unavailable"
  ) {
    return { ok: false, code: "history.nonundoable_confirmation_required" };
  }
  const capped = enforceHistoryCaps([...undoPrefix, entry]);
  if (capped === null) return { ok: false, code: "history.byte_estimate_invalid" };
  return { ok: true, history: capped, outcome, oversizedReplacement: false };
}

function publishCommandState(
  state: AppState,
  command: DocumentCommand,
  document: ValidatedDocument,
  bookmarks: StableUiBookmarks,
  history: HistoryState,
  focusTarget: UiFocusTarget,
  replacement: boolean,
): AppState {
  const revision = state.revision + 1;
  const base: AppState = Object.freeze({
    ...state,
    document,
    revision,
    history,
    bookmarks,
    pendingRequests: Object.freeze([]),
    focusRequest: null,
    quickEntry: Object.freeze({
      text: "",
      target: bookmarks.insertion,
      baseRevision: revision,
      status: "idle",
      issueCodes: Object.freeze([]),
    }),
    importDraft: null,
    documentTransition: Object.freeze({ kind: "idle" }),
    notices: replacement ? Object.freeze([]) : state.notices,
  });
  const reason = replacement ? "replacement" : command.kind === "delete" ? "delete-repair" : "command";
  return nextFocusState(base, focusTarget, reason);
}

function insertionAfterNode(node: DocumentNodeRef): InsertionPoint {
  switch (node.kind) {
    case "section":
      return Object.freeze({ kind: "after-section", sectionId: node.id });
    case "measure":
      return Object.freeze({ kind: "after-measure", measureId: node.id });
    case "event":
      return Object.freeze({ kind: "after-event", eventId: node.id });
  }
}

function bookmarksAfterCommand(
  command: DocumentCommand,
  repaired: StableUiBookmarks,
  insertedRefs: readonly DocumentNodeRef[],
): StableUiBookmarks {
  if (command.kind !== "duplicate") return repaired;
  const lastInserted = insertedRefs[insertedRefs.length - 1];
  if (lastInserted === undefined) return repaired;
  return Object.freeze({
    ...repaired,
    insertion: insertionAfterNode(lastInserted),
  });
}

export const createInitialAppState: CreateInitialAppState = (request) => {
  const counters = createWorkCounters();
  const bookmarks = initialBookmarks(request.document, counters);
  const state: AppState = Object.freeze({
    document: request.document,
    revision: 0,
    exportRevision: null,
    recovery: Object.freeze({ kind: "unavailable", reasonCode: null }),
    history: Object.freeze({
      undo: Object.freeze([]),
      redo: Object.freeze([]),
      retainedBytesEstimate: 0,
    }),
    bookmarks,
    panels: Object.freeze({
      ...request.initialPanels,
      open: Object.freeze([...request.initialPanels.open]),
    }),
    dialogs: Object.freeze([]),
    quickEntry: Object.freeze({
      text: "",
      target: bookmarks.insertion,
      baseRevision: 0,
      status: "idle",
      issueCodes: Object.freeze([]),
    }),
    importDraft: null,
    transport: Object.freeze({
      status: "unavailable",
      generation: 0,
      commandRequestId: 0,
      notificationSequence: 0,
      documentId: request.document.id,
      planRevision: 0,
      startBeat: request.zeroBeat,
      playhead: request.zeroBeat,
      failureCode: null,
    }),
    pendingRequests: Object.freeze([]),
    documentTransition: Object.freeze({ kind: "idle" }),
    focusRequest: null,
    notices: Object.freeze([]),
    nextSequence: 1,
  });
  return successResult(state, counters, "initialized");
};

export const runDocumentCommand: RunDocumentCommand = (request) => {
  const { state, command, dependencies } = request;
  const counters = createWorkCounters();
  const envelope = envelopeFailure(state, command);
  if (envelope !== null) {
    return failureResult(state, counters, envelope.code, envelope.path);
  }
  if (
    command.kind === "transpose" ||
    command.kind === "apply-suggestion" ||
    command.kind === "apply-reharmonization"
  ) {
    const result = validateDerivedCommand(state, command);
    if (!result.ok) return failureResult(state, counters, result.code, result.path);
  }
  if (command.kind === "replace-document") {
    const result = replacementFailure(state, command);
    if (result !== null) return failureResult(state, counters, result.code, result.path);
  }

  const index = buildDocumentIndex(state.document, counters);
  const applied = applyDocumentCommand(
    state,
    command,
    index,
    counters,
    dependencies,
  );
  if (!applied.ok) {
    return failureResult(state, counters, applied.code, applied.path);
  }

  const decoded = dependencies.decodeDocumentShape(applied.value.candidate);
  if (!decoded.ok) {
    return failureResult(
      state,
      counters,
      "command.structural_validation_failed",
      ["candidate"],
      { structuralIssues: decoded.errors },
    );
  }
  counters.validationCalls += 1;
  const validated = dependencies.validateDocumentSemantics(decoded.value);
  if (!validated.ok) {
    return failureResult(
      state,
      counters,
      "command.semantic_validation_failed",
      ["candidate"],
      { semanticIssues: validated.errors },
    );
  }

  const repairedBookmarks = applied.value.replacement
    ? initialBookmarks(validated.value, counters)
    : repairBookmarks(
        state.document,
        validated.value,
        state.bookmarks,
        counters,
      );
  const afterBookmarks = bookmarksAfterCommand(
    command,
    repairedBookmarks,
    applied.value.insertedRefs,
  );
  const focusTarget = applied.value.replacement
    ? Object.freeze({ kind: "chart" as const })
    : focusAfterCommand(
        validated.value,
        afterBookmarks,
        applied.value.insertedRefs,
        counters,
      );
  const history = nextHistory(
    state,
    command,
    validated.value,
    afterBookmarks,
    counters,
    dependencies.estimateHistoryRetainedBytes,
  );
  if (!history.ok) {
    return failureResult(state, counters, history.code, ["history"]);
  }

  let nextState = publishCommandState(
    state,
    command,
    validated.value,
    afterBookmarks,
    history.history,
    focusTarget,
    applied.value.replacement,
  );
  const revision = nextState.revision;
  const effects: ApplicationEffect[] = [
    effect("queue-recovery", revision, `command:${command.kind}`),
  ];
  if (applied.value.playbackRelevant) {
    effects.push(effect("compile-playback-plan", revision, `command:${command.kind}`));
  }
  effects.push(
    effect("restore-focus", revision, `command:${command.kind}`),
    effect("announce", revision, `command:${command.kind}`),
  );
  if (history.oversizedReplacement) {
    const appended = appendApplicationNotice(
      nextState,
      "warning",
      "history.replacement_not_undoable",
      "This replacement cannot be undone; export the chart to keep a portable copy.",
    );
    nextState = appended.state;
    effects.push(
      effect(
        "recommend-export",
        revision,
        "history.replacement_not_undoable",
        command.kind === "replace-document" ? command.requestId : null,
      ),
    );
  }
  return successResult(nextState, counters, history.outcome, effects);
};

function historyCommand(
  state: AppState,
  direction: "undo" | "redo",
): ApplicationTransitionResult {
  const counters = createWorkCounters();
  if (isHistoryLocked(state)) {
    return failureResult(state, counters, "history.locked", ["history"]);
  }
  if (state.revision >= MAX_APPLICATION_REVISION) {
    return failureResult(
      state,
      counters,
      "application.revision_exhausted",
      ["revision"],
    );
  }
  if (state.nextSequence >= MAX_APPLICATION_SEQUENCE) {
    return failureResult(
      state,
      counters,
      "application.sequence_exhausted",
      ["nextSequence"],
    );
  }
  const source = direction === "undo" ? state.history.undo : state.history.redo;
  const entry = source[source.length - 1];
  if (entry === undefined) {
    return failureResult(
      state,
      counters,
      direction === "undo" ? "history.undo_empty" : "history.redo_empty",
      ["history", direction],
    );
  }
  counters.historyEntriesVisited += 1;
  const document = direction === "undo" ? entry.before : entry.after;
  const bookmarks =
    direction === "undo" ? entry.beforeBookmarks : entry.afterBookmarks;
  const undo =
    direction === "undo"
      ? state.history.undo.slice(0, -1)
      : [...state.history.undo, entry];
  const redo =
    direction === "undo"
      ? [...state.history.redo, entry]
      : state.history.redo.slice(0, -1);
  const history = withRecomputedHistoryBytes(undo, redo);
  if (history === null) {
    return failureResult(
      state,
      counters,
      "history.byte_estimate_invalid",
      ["history"],
    );
  }
  const target = focusAfterCommand(document, bookmarks, [], counters);
  let nextState: AppState = Object.freeze({
    ...state,
    document,
    revision: state.revision + 1,
    history,
    bookmarks,
    pendingRequests: Object.freeze([]),
    importDraft: null,
    documentTransition: Object.freeze({ kind: "idle" }),
    focusRequest: null,
    quickEntry: Object.freeze({
      text: "",
      target: bookmarks.insertion,
      baseRevision: state.revision + 1,
      status: "idle",
      issueCodes: Object.freeze([]),
    }),
  });
  nextState = nextFocusState(nextState, target, direction);
  const effects = [
    effect("queue-recovery", nextState.revision, direction),
    effect("compile-playback-plan", nextState.revision, direction),
    effect("restore-focus", nextState.revision, direction),
    effect("announce", nextState.revision, direction),
  ];
  return successResult(
    nextState,
    counters,
    direction === "undo" ? "undone" : "redone",
    effects,
  );
}

export const undoDocumentCommand: UndoDocumentCommand = ({ state }) =>
  historyCommand(state, "undo");

export const redoDocumentCommand: RedoDocumentCommand = ({ state }) =>
  historyCommand(state, "redo");

function validPanelState(intent: Extract<EphemeralIntent, { kind: "set-panels" }>): boolean {
  const open = intent.panels.open;
  return (
    open.length > 0 &&
    new Set(open).size === open.length &&
    open.every((panel) => (APPLICATION_PANEL_IDS as readonly string[]).includes(panel)) &&
    open.includes(intent.panels.active)
  );
}

function validDialog(dialog: DialogDescriptor): boolean {
  return (
    isBoundedToken(dialog.id, MAX_COMMAND_ID_CODE_POINTS) &&
    (dialog.requestId === null || isPositiveSafeInteger(dialog.requestId))
  );
}

function validTransition(
  state: AppState,
  transition: DocumentTransitionState,
): boolean {
  if (transition.kind === "idle") return true;
  return (
    transition.baseRevision === state.revision &&
    isPositiveSafeInteger(transition.requestId) &&
    currentRequest(state, "document-transition", transition.requestId) !== null
  );
}

export const reduceEphemeralIntent: ReduceEphemeralIntent = ({ state, intent }) => {
  const counters = createWorkCounters();
  let next: AppState;
  switch (intent.kind) {
    case "set-bookmarks": {
      if (
        intent.bookmarks.selection.kind === "events" &&
        intent.bookmarks.selection.eventIds.length > 8_192
      ) {
        return failureResult(
          state,
          counters,
          "bookmark.selection_limit",
          ["bookmarks", "selection"],
        );
      }
      const bookmarks = normalizeBookmarks(state.document, intent.bookmarks, counters);
      if (bookmarks === null) {
        return failureResult(state, counters, "bookmark.invalid", ["bookmarks"]);
      }
      next = Object.freeze({ ...state, bookmarks });
      break;
    }
    case "set-panels":
      if (!validPanelState(intent)) {
        return failureResult(state, counters, "ephemeral.intent_invalid", ["panels"]);
      }
      next = Object.freeze({
        ...state,
        panels: Object.freeze({
          ...intent.panels,
          open: Object.freeze([...intent.panels.open]),
        }),
      });
      break;
    case "push-dialog":
      if (!validDialog(intent.dialog)) {
        return failureResult(state, counters, "ephemeral.intent_invalid", ["dialog"]);
      }
      if (state.dialogs.length >= MAX_DIALOG_STACK_DEPTH) {
        return failureResult(state, counters, "dialog.stack_limit", ["dialogs"]);
      }
      if (state.dialogs.some((dialog) => dialog.id === intent.dialog.id)) {
        return failureResult(state, counters, "ephemeral.intent_invalid", ["dialog", "id"]);
      }
      next = Object.freeze({
        ...state,
        dialogs: Object.freeze([
          ...state.dialogs,
          Object.freeze({ ...intent.dialog }),
        ]),
      });
      break;
    case "pop-dialog": {
      const top = state.dialogs[state.dialogs.length - 1];
      if (top === undefined || top.id !== intent.dialogId) {
        return failureResult(state, counters, "ephemeral.intent_invalid", ["dialogId"]);
      }
      next = Object.freeze({ ...state, dialogs: Object.freeze(state.dialogs.slice(0, -1)) });
      break;
    }
    case "set-quick-entry":
      if (
        intent.draft.baseRevision !== state.revision ||
        !isBoundedToken(intent.draft.text || " ", MAX_QUICK_ENTRY_CODE_POINTS) ||
        intent.draft.issueCodes.length > MAX_DRAFT_ISSUES
      ) {
        return failureResult(state, counters, "ephemeral.intent_invalid", ["quickEntry"]);
      }
      next = Object.freeze({
        ...state,
        quickEntry: Object.freeze({
          ...intent.draft,
          target: immutableInsertionPoint(intent.draft.target),
          issueCodes: Object.freeze([...intent.draft.issueCodes]),
        }),
      });
      break;
    case "set-import-draft":
      if (
        intent.draft !== null &&
        (intent.draft.baseRevision !== state.revision ||
          !isPositiveSafeInteger(intent.draft.readRequestId) ||
          intent.draft.issueCodes.length > MAX_DRAFT_ISSUES)
      ) {
        return failureResult(state, counters, "ephemeral.intent_invalid", ["importDraft"]);
      }
      next = Object.freeze({
        ...state,
        importDraft:
          intent.draft === null
            ? null
            : Object.freeze({
                ...intent.draft,
                issueCodes: Object.freeze([...intent.draft.issueCodes]),
              }),
      });
      break;
    case "dismiss-notice":
      if (!state.notices.some((notice) => notice.sequence === intent.sequence)) {
        return failureResult(state, counters, "ephemeral.intent_invalid", ["sequence"]);
      }
      next = Object.freeze({
        ...state,
        notices: Object.freeze(
          state.notices.filter((notice) => notice.sequence !== intent.sequence),
        ),
      });
      break;
    case "mark-exported":
      if (
        !isNonnegativeSafeInteger(intent.revision) ||
        intent.revision > state.revision
      ) {
        return failureResult(state, counters, "ephemeral.intent_invalid", ["revision"]);
      }
      next = Object.freeze({ ...state, exportRevision: intent.revision });
      break;
    case "set-recovery":
      next = Object.freeze({
        ...state,
        recovery: Object.freeze({ ...intent.recovery }),
      });
      break;
    case "set-document-transition":
      if (!validTransition(state, intent.transition)) {
        return failureResult(
          state,
          counters,
          "ephemeral.intent_invalid",
          ["transition"],
        );
      }
      next = Object.freeze({
        ...state,
        documentTransition: Object.freeze({ ...intent.transition }),
      });
      break;
    case "expect-transport":
      if (
        !isPositiveSafeInteger(intent.commandRequestId) ||
        intent.commandRequestId <= state.transport.commandRequestId ||
        intent.documentId !== state.document.id ||
        intent.planRevision !== state.revision
      ) {
        return failureResult(
          state,
          counters,
          "transport.expectation_invalid",
          ["transport"],
        );
      }
      next = Object.freeze({
        ...state,
        transport: Object.freeze({
          ...state.transport,
          status: intent.status,
          commandRequestId: intent.commandRequestId,
          documentId: intent.documentId,
          planRevision: intent.planRevision,
          startBeat: intent.startBeat,
          playhead: intent.playhead,
          failureCode: null,
        }),
      });
      break;
    case "acknowledge-focus":
      if (state.focusRequest?.sequence !== intent.sequence) {
        return successResult(state, counters, "ignored-stale");
      }
      next = Object.freeze({ ...state, focusRequest: null });
      break;
  }
  return successResult(next, counters, "ephemeral-updated");
};

export const beginApplicationRequest: BeginApplicationRequest = ({
  state,
  request,
}) => {
  const counters = createWorkCounters();
  if (!isPositiveSafeInteger(request.id)) {
    return failureResult(state, counters, "request.id_invalid", ["request", "id"]);
  }
  if (
    request.documentId !== state.document.id ||
    request.baseRevision !== state.revision
  ) {
    return failureResult(
      state,
      counters,
      "request.base_revision_invalid",
      ["request"],
    );
  }
  counters.requestsCompared += state.pendingRequests.length;
  if (state.pendingRequests.some((current) => current.kind === request.kind)) {
    return failureResult(state, counters, "request.slot_busy", ["request", "kind"]);
  }
  if (state.pendingRequests.length >= MAX_PENDING_REQUESTS) {
    return failureResult(state, counters, "request.limit", ["pendingRequests"]);
  }
  const pendingRequests = [
    ...state.pendingRequests,
    Object.freeze({ ...request }),
  ].sort(
    (left, right) => requestOrder(left.kind) - requestOrder(right.kind),
  );
  return successResult(
    Object.freeze({ ...state, pendingRequests: Object.freeze(pendingRequests) }),
    counters,
    "request-started",
  );
};

export const settleApplicationRequest: SettleApplicationRequest = ({
  state,
  kind,
  id,
  documentId,
  baseRevision,
  disposition,
}) => {
  const counters = createWorkCounters();
  const index = state.pendingRequests.findIndex((request) => {
    counters.requestsCompared += 1;
    return (
      request.kind === kind &&
      request.id === id &&
      request.documentId === documentId &&
      request.baseRevision === baseRevision &&
      request.documentId === state.document.id &&
      request.baseRevision === state.revision
    );
  });
  if (index < 0) return successResult(state, counters, "ignored-stale");
  const pendingRequests = state.pendingRequests.filter(
    (_request, requestIndex) => requestIndex !== index,
  );
  const documentTransition =
    kind === "document-transition" && disposition === "cancel"
      ? Object.freeze({ kind: "idle" as const })
      : state.documentTransition;
  return successResult(
    Object.freeze({
      ...state,
      pendingRequests: Object.freeze(pendingRequests),
      documentTransition,
    }),
    counters,
    disposition === "cancel" ? "request-cancelled" : "request-settled",
  );
};

export const acceptTransportNotification: AcceptTransportNotification = ({
  state,
  notification,
}) => {
  const counters = createWorkCounters();
  counters.transportNotificationsCompared += 1;
  const runtimeStatus = runtimeField(notification, "status");
  const runtimeFailureCode = runtimeField(notification, "failureCode");
  if (
    !validTransportNotificationStatus(runtimeStatus) ||
    !isNonnegativeSafeInteger(notification.generation) ||
    !isPositiveSafeInteger(notification.commandRequestId) ||
    !isNonnegativeSafeInteger(notification.notificationSequence) ||
    !isNonnegativeSafeInteger(notification.planRevision) ||
    (runtimeStatus === "failed"
      ? typeof runtimeFailureCode !== "string" ||
        !isBoundedToken(runtimeFailureCode, MAX_COMMAND_ID_CODE_POINTS)
      : runtimeFailureCode !== null)
  ) {
    return failureResult(
      state,
      counters,
      "transport.notification_invalid",
      ["notification"],
    );
  }
  const stale =
    notification.documentId !== state.document.id ||
    notification.planRevision !== state.revision ||
    notification.commandRequestId !== state.transport.commandRequestId ||
    notification.generation < state.transport.generation ||
    (notification.generation === state.transport.generation &&
      notification.notificationSequence <=
        state.transport.notificationSequence);
  if (stale) return successResult(state, counters, "ignored-stale");
  return successResult(
    Object.freeze({
      ...state,
      transport: Object.freeze({ ...notification }),
    }),
    counters,
    "transport-accepted",
  );
};

export const applicationStateOperations: ApplicationStateOperations =
  Object.freeze({
    createInitialAppState,
    runDocumentCommand,
    undoDocumentCommand,
    redoDocumentCommand,
    reduceEphemeralIntent,
    beginApplicationRequest,
    settleApplicationRequest,
    acceptTransportNotification,
    selectEventById,
    selectSelectedEvents,
    selectInsertionLocation,
    selectBeatRange,
    selectDirtyState,
    selectHistoryAvailability,
  });

export const applicationHistoryRetainedByteEstimator =
  estimateHistoryRetainedBytes;
