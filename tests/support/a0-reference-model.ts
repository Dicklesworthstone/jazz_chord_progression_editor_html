/**
 * Deliberately production-import-free reference transition model for the A0
 * randomized edit/history protocol. It models only the reviewed generated
 * document family: one section, one measure, exact 1/32-beat duration units,
 * stable event identity, and non-coalescing commands.
 */

export const A0_REFERENCE_BEAT_DENOMINATOR = 32;
export const A0_REFERENCE_MEASURE_UNITS = 128;
export const A0_REFERENCE_MAX_EVENTS = 64;

export type A0ReferenceEvent = Readonly<{
  id: string;
  durationUnits: 1 | 2;
  voicingFamily: "balanced" | "open";
}>;

export type A0ReferenceDocument = Readonly<{
  title: string;
  sectionName: string;
  events: readonly A0ReferenceEvent[];
}>;

export type A0ReferenceInsertion = Readonly<{
  kind: "before-event" | "after-event";
  eventId: string;
}>;

export type A0ReferenceBookmarks = Readonly<{
  selection: Readonly<{ kind: "none" }>;
  insertion: A0ReferenceInsertion;
  range: null;
}>;

export type A0ReferenceAction =
  | Readonly<{
      kind: "insert-event";
      id: string;
      durationUnits: 1 | 2;
      beforeEventId: string | null;
      label: string;
    }>
  | Readonly<{
      kind: "delete-event";
      eventId: string;
      label: string;
    }>
  | Readonly<{
      kind: "move-event";
      eventId: string;
      beforeEventId: string | null;
      label: string;
    }>
  | Readonly<{
      kind: "duplicate-event";
      sourceEventId: string;
      copiedEventId: string;
      beforeEventId: string | null;
      label: string;
    }>
  | Readonly<{
      kind: "set-duration-valid";
      eventId: string;
      durationUnits: 1 | 2;
      label: string;
    }>
  | Readonly<{ kind: "set-text"; value: string; label: string }>
  | Readonly<{ kind: "set-section"; value: string; label: string }>
  | Readonly<{
      kind: "set-voicing-valid";
      eventId: string;
      family: "balanced" | "open";
      label: string;
    }>
  | Readonly<{ kind: "undo" }>
  | Readonly<{ kind: "redo" }>;

type A0ReferenceHistoryEntry = Readonly<{
  label: string;
  before: A0ReferenceDocument;
  after: A0ReferenceDocument;
  beforeBookmarks: A0ReferenceBookmarks;
  afterBookmarks: A0ReferenceBookmarks;
}>;

export type A0ReferenceState = Readonly<{
  document: A0ReferenceDocument;
  revision: number;
  bookmarks: A0ReferenceBookmarks;
  undo: readonly A0ReferenceHistoryEntry[];
  redo: readonly A0ReferenceHistoryEntry[];
}>;

export type A0ReferenceOutcome =
  | "committed"
  | "undone"
  | "redone"
  | "refused";

export type A0ReferenceTransition = Readonly<{
  state: A0ReferenceState;
  outcome: A0ReferenceOutcome;
}>;

function frozenEvent(event: A0ReferenceEvent): A0ReferenceEvent {
  return Object.freeze({ ...event });
}

function frozenDocument(
  document: A0ReferenceDocument,
): A0ReferenceDocument {
  return Object.freeze({
    ...document,
    events: Object.freeze(document.events.map(frozenEvent)),
  });
}

function frozenBookmarks(
  bookmarks: A0ReferenceBookmarks,
): A0ReferenceBookmarks {
  return Object.freeze({
    selection: Object.freeze({ kind: "none" as const }),
    insertion: Object.freeze({ ...bookmarks.insertion }),
    range: null,
  });
}

export function createA0ReferenceState(
  document: A0ReferenceDocument,
): A0ReferenceState {
  const first = document.events[0];
  if (first === undefined) {
    throw new Error("A0_REFERENCE_REQUIRES_NONEMPTY_GENERATED_DOCUMENT");
  }
  return Object.freeze({
    document: frozenDocument(document),
    revision: 0,
    bookmarks: frozenBookmarks({
      selection: { kind: "none" },
      insertion: { kind: "before-event", eventId: first.id },
      range: null,
    }),
    undo: Object.freeze([]),
    redo: Object.freeze([]),
  });
}

function refused(state: A0ReferenceState): A0ReferenceTransition {
  return Object.freeze({ state, outcome: "refused" });
}

function committed(
  state: A0ReferenceState,
  label: string,
  document: A0ReferenceDocument,
  bookmarks = state.bookmarks,
): A0ReferenceTransition {
  const after = frozenDocument(document);
  const afterBookmarks = frozenBookmarks(bookmarks);
  const entry = Object.freeze({
    label,
    before: state.document,
    after,
    beforeBookmarks: state.bookmarks,
    afterBookmarks,
  });
  return Object.freeze({
    outcome: "committed" as const,
    state: Object.freeze({
      document: after,
      revision: state.revision + 1,
      bookmarks: afterBookmarks,
      undo: Object.freeze([...state.undo, entry]),
      redo: Object.freeze([]),
    }),
  });
}

function eventIndex(
  events: readonly A0ReferenceEvent[],
  id: string,
): number {
  return events.findIndex((event) => event.id === id);
}

function insertionIndex(
  events: readonly A0ReferenceEvent[],
  beforeEventId: string | null,
): number | null {
  if (beforeEventId === null) return events.length;
  const index = eventIndex(events, beforeEventId);
  return index < 0 ? null : index;
}

function totalUnits(events: readonly A0ReferenceEvent[]): number {
  return events.reduce((sum, event) => sum + event.durationUnits, 0);
}

function generatedDocumentIsValid(document: A0ReferenceDocument): boolean {
  return (
    document.events.length >= 1 &&
    document.events.length <= A0_REFERENCE_MAX_EVENTS &&
    new Set(document.events.map(({ id }) => id)).size ===
      document.events.length &&
    totalUnits(document.events) <= A0_REFERENCE_MEASURE_UNITS
  );
}

function applyCommand(
  state: A0ReferenceState,
  action: Exclude<A0ReferenceAction, { kind: "undo" | "redo" }>,
): A0ReferenceTransition {
  const current = state.document;
  let next: A0ReferenceDocument | null = null;
  let bookmarks = state.bookmarks;
  switch (action.kind) {
    case "insert-event": {
      if (
        current.events.length >= A0_REFERENCE_MAX_EVENTS ||
        current.events.some(({ id }) => id === action.id)
      ) return refused(state);
      const index = insertionIndex(current.events, action.beforeEventId);
      if (index === null) return refused(state);
      const events = [...current.events];
      events.splice(index, 0, {
        id: action.id,
        durationUnits: action.durationUnits,
        voicingFamily: "balanced",
      });
      next = { ...current, events };
      break;
    }
    case "delete-event": {
      if (current.events.length <= 1) return refused(state);
      const index = eventIndex(current.events, action.eventId);
      if (index < 0 || state.bookmarks.insertion.eventId === action.eventId) {
        return refused(state);
      }
      next = {
        ...current,
        events: current.events.filter(({ id }) => id !== action.eventId),
      };
      break;
    }
    case "move-event": {
      const source = eventIndex(current.events, action.eventId);
      if (source < 0 || current.events.length < 2) return refused(state);
      const events = [...current.events];
      const removed = events.splice(source, 1)[0];
      if (removed === undefined) return refused(state);
      const destination = insertionIndex(events, action.beforeEventId);
      if (destination === null) return refused(state);
      events.splice(destination, 0, removed);
      if (events.every((event, index) => event.id === current.events[index]?.id)) {
        return refused(state);
      }
      next = { ...current, events };
      break;
    }
    case "duplicate-event": {
      if (
        current.events.length >= A0_REFERENCE_MAX_EVENTS ||
        current.events.some(({ id }) => id === action.copiedEventId)
      ) return refused(state);
      const source = current.events.find(
        ({ id }) => id === action.sourceEventId,
      );
      const destination = insertionIndex(
        current.events,
        action.beforeEventId,
      );
      if (source === undefined || destination === null) return refused(state);
      const events = [...current.events];
      events.splice(destination, 0, {
        ...source,
        id: action.copiedEventId,
      });
      next = { ...current, events };
      bookmarks = {
        selection: { kind: "none" },
        insertion: {
          kind: "after-event",
          eventId: action.copiedEventId,
        },
        range: null,
      };
      break;
    }
    case "set-duration-valid": {
      const index = eventIndex(current.events, action.eventId);
      if (
        index < 0 ||
        current.events[index]?.durationUnits === action.durationUnits
      ) return refused(state);
      next = {
        ...current,
        events: current.events.map((event, eventIndexValue) =>
          eventIndexValue === index
            ? { ...event, durationUnits: action.durationUnits }
            : event
        ),
      };
      break;
    }
    case "set-text":
      if (current.title === action.value) return refused(state);
      next = { ...current, title: action.value };
      break;
    case "set-section":
      if (current.sectionName === action.value) return refused(state);
      next = { ...current, sectionName: action.value };
      break;
    case "set-voicing-valid": {
      const index = eventIndex(current.events, action.eventId);
      if (
        index < 0 ||
        current.events[index]?.voicingFamily === action.family
      ) return refused(state);
      next = {
        ...current,
        events: current.events.map((event, eventIndexValue) =>
          eventIndexValue === index
            ? { ...event, voicingFamily: action.family }
            : event
        ),
      };
      break;
    }
  }
  if (!generatedDocumentIsValid(next)) return refused(state);
  return committed(state, action.label, next, bookmarks);
}

function applyHistory(
  state: A0ReferenceState,
  direction: "undo" | "redo",
): A0ReferenceTransition {
  const source = direction === "undo" ? state.undo : state.redo;
  const entry = source[source.length - 1];
  if (entry === undefined) return refused(state);
  if (direction === "undo") {
    return Object.freeze({
      outcome: "undone" as const,
      state: Object.freeze({
        document: entry.before,
        revision: state.revision + 1,
        bookmarks: entry.beforeBookmarks,
        undo: Object.freeze(state.undo.slice(0, -1)),
        redo: Object.freeze([...state.redo, entry]),
      }),
    });
  }
  return Object.freeze({
    outcome: "redone" as const,
    state: Object.freeze({
      document: entry.after,
      revision: state.revision + 1,
      bookmarks: entry.afterBookmarks,
      undo: Object.freeze([...state.undo, entry]),
      redo: Object.freeze(state.redo.slice(0, -1)),
    }),
  });
}

export function applyA0ReferenceAction(
  state: A0ReferenceState,
  action: A0ReferenceAction,
): A0ReferenceTransition {
  if (action.kind === "undo" || action.kind === "redo") {
    return applyHistory(state, action.kind);
  }
  return applyCommand(state, action);
}

export function a0ReferenceHistoryProjection(state: A0ReferenceState) {
  return Object.freeze({
    undo: Object.freeze(state.undo.map(({ label }) => label)),
    redo: Object.freeze(state.redo.map(({ label }) => label)),
    retainedBytesEstimate: state.undo.length + state.redo.length,
  });
}
