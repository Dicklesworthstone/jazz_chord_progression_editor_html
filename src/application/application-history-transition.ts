import type { ValidatedDocument } from "../domain";
import type {
  RedoAtomicEditPlanHistory,
  UndoAtomicEditPlanHistory,
} from "./application-edit-plan-contract";
import { focusAfterCommand } from "./application-bookmarks";
import { withRecomputedHistoryBytes } from "./application-history";
import {
  MAX_APPLICATION_REVISION,
  MAX_APPLICATION_SEQUENCE,
  type AppState,
  type ApplicationEffect,
  type ApplicationRefusal,
  type ApplicationWorkCounters,
  type Notice,
  type StableUiBookmarks,
} from "./application-state-contract";
import {
  appendApplicationNotice,
  applicationRefusalMessage,
  createWorkCounters,
  freezeWorkCounters,
} from "./application-state-helpers";

type HistoryDirection = "undo" | "redo";
type HistoryOutcome = "undone" | "redone";

type RetainedHistoryEntry = Readonly<{
  before: ValidatedDocument;
  after: ValidatedDocument;
  beforeBookmarks: StableUiBookmarks;
  afterBookmarks: StableUiBookmarks;
  retainedBytesEstimate: number;
}>;

type RetainedHistoryState<Entry extends RetainedHistoryEntry> = Readonly<{
  undo: readonly Entry[];
  redo: readonly Entry[];
  retainedBytesEstimate: number;
}>;

type HistoryReplayState<Entry extends RetainedHistoryEntry> = Readonly<
  Omit<AppState, "history"> & {
    history: RetainedHistoryState<Entry>;
  }
>;

type HistoryRefusalCode =
  | "application.revision_exhausted"
  | "application.sequence_exhausted"
  | "history.locked"
  | "history.undo_empty"
  | "history.redo_empty"
  | "history.byte_estimate_invalid";

type RetainedHistoryTransitionResult<
  Entry extends RetainedHistoryEntry,
  Outcome extends HistoryOutcome,
> =
  | Readonly<{
      ok: true;
      state: HistoryReplayState<Entry>;
      outcome: Outcome;
      effects: readonly ApplicationEffect[];
      counters: ApplicationWorkCounters;
    }>
  | Readonly<{
      ok: false;
      state: HistoryReplayState<Entry>;
      refusal: ApplicationRefusal;
      notice: Notice;
      effects: readonly [];
      counters: ApplicationWorkCounters;
    }>;

const EMPTY_EFFECTS: readonly [] = Object.freeze([]);

function historyIsLocked<Entry extends RetainedHistoryEntry>(
  state: HistoryReplayState<Entry>,
): boolean {
  if (
    state.documentTransition.kind === "retiring-transport" ||
    state.documentTransition.kind === "committing"
  ) {
    return true;
  }
  return state.dialogs.some(
    (dialog) => dialog.blocksHistory && dialog.phase === "committing",
  );
}

function historyFailure<Entry extends RetainedHistoryEntry>(
  state: HistoryReplayState<Entry>,
  counters: ReturnType<typeof createWorkCounters>,
  code: HistoryRefusalCode,
  path: readonly (string | number)[],
): RetainedHistoryTransitionResult<Entry, HistoryOutcome> {
  const message = applicationRefusalMessage(code);
  const appended = appendApplicationNotice(state, "error", code, message);
  const refusal: ApplicationRefusal = Object.freeze({
    code,
    path: Object.freeze([...path]),
    message,
  });
  return Object.freeze({
    ok: false,
    state: appended.state,
    refusal,
    notice: appended.notice,
    effects: EMPTY_EFFECTS,
    counters: freezeWorkCounters(counters),
  });
}

function historyEffect(
  kind: ApplicationEffect["kind"],
  revision: number,
  direction: HistoryDirection,
): ApplicationEffect {
  return Object.freeze({
    kind,
    revision,
    requestId: null,
    reasonCode: direction,
  });
}

export function replayRetainedHistory<Entry extends RetainedHistoryEntry>(
  state: HistoryReplayState<Entry>,
  direction: "undo",
): RetainedHistoryTransitionResult<Entry, "undone">;
export function replayRetainedHistory<Entry extends RetainedHistoryEntry>(
  state: HistoryReplayState<Entry>,
  direction: "redo",
): RetainedHistoryTransitionResult<Entry, "redone">;
export function replayRetainedHistory<Entry extends RetainedHistoryEntry>(
  state: HistoryReplayState<Entry>,
  direction: HistoryDirection,
): RetainedHistoryTransitionResult<Entry, HistoryOutcome> {
  const counters = createWorkCounters();
  if (historyIsLocked(state)) {
    return historyFailure(state, counters, "history.locked", ["history"]);
  }
  if (state.revision >= MAX_APPLICATION_REVISION) {
    return historyFailure(
      state,
      counters,
      "application.revision_exhausted",
      ["revision"],
    );
  }
  if (state.nextSequence >= MAX_APPLICATION_SEQUENCE) {
    return historyFailure(
      state,
      counters,
      "application.sequence_exhausted",
      ["nextSequence"],
    );
  }

  const source = direction === "undo" ? state.history.undo : state.history.redo;
  const entry = source[source.length - 1];
  if (entry === undefined) {
    return historyFailure(
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
    return historyFailure(
      state,
      counters,
      "history.byte_estimate_invalid",
      ["history"],
    );
  }

  const target = focusAfterCommand(document, bookmarks, [], counters);
  const revision = state.revision + 1;
  const base: HistoryReplayState<Entry> = Object.freeze({
    ...state,
    document,
    revision,
    history,
    bookmarks,
    pendingRequests: Object.freeze([]),
    importDraft: null,
    documentTransition: Object.freeze({ kind: "idle" }),
    focusRequest: null,
    quickEntry: Object.freeze({
      text: "",
      target: bookmarks.insertion,
      baseRevision: revision,
      status: "idle",
      issueCodes: Object.freeze([]),
    }),
  });
  const nextState: HistoryReplayState<Entry> = Object.freeze({
    ...base,
    focusRequest: Object.freeze({
      sequence: base.nextSequence,
      target,
      reason: direction,
    }),
    nextSequence: base.nextSequence + 1,
  });
  const effects: readonly ApplicationEffect[] = Object.freeze([
    historyEffect("queue-recovery", revision, direction),
    historyEffect("compile-playback-plan", revision, direction),
    historyEffect("restore-focus", revision, direction),
    historyEffect("announce", revision, direction),
  ]);
  return Object.freeze({
    ok: true,
    state: nextState,
    outcome: direction === "undo" ? "undone" : "redone",
    effects,
    counters: freezeWorkCounters(counters),
  });
}

export const undoAtomicEditPlanHistory: UndoAtomicEditPlanHistory = ({
  state,
}) => replayRetainedHistory(state, "undo");

export const redoAtomicEditPlanHistory: RedoAtomicEditPlanHistory = ({
  state,
}) => replayRetainedHistory(state, "redo");
