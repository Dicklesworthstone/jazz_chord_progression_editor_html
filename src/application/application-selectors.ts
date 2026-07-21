import {
  addBeatValues,
  makeBeatPosition,
  makeBeatRange,
  type BeatPosition,
  type BeatValue,
  type ChordEvent,
  type ChordEventId,
} from "../domain";
import {
  type AppState,
  type DirtyState,
  type HistoryAvailability,
  type InsertionLocation,
  type SelectBeatRange,
  type SelectDirtyState,
  type SelectEventById,
  type SelectHistoryAvailability,
  type SelectInsertionLocation,
  type SelectSelectedEvents,
  type SelectedEventsResult,
  type StableBoundary,
} from "./application-state-contract";
import {
  buildDocumentIndex,
  createWorkCounters,
} from "./application-state-helpers";

function position(value: BeatValue): BeatPosition | null {
  const result = makeBeatPosition(value);
  return result.ok ? result.value : null;
}

function boundaryPosition(
  state: AppState,
  boundary: StableBoundary,
): BeatPosition | null {
  const zero = makeBeatPosition({ numerator: 0, denominator: 1 });
  if (!zero.ok) return null;
  let current: BeatValue = zero.value;
  if (boundary.kind === "document-start") return zero.value;

  for (const section of state.document.sections) {
    if (
      (boundary.kind === "before-section" || boundary.kind === "section-start") &&
      boundary.sectionId === section.id
    ) {
      return position(current);
    }
    for (const measure of section.measures) {
      if (
        (boundary.kind === "before-measure" ||
          boundary.kind === "measure-start") &&
        boundary.measureId === measure.id
      ) {
        return position(current);
      }
      for (const event of measure.events) {
        if (
          boundary.kind === "before-event" &&
          boundary.eventId === event.id
        ) {
          return position(current);
        }
        const next = addBeatValues(current, event.duration);
        if (!next.ok) return null;
        current = next.value;
        if (
          boundary.kind === "after-event" &&
          boundary.eventId === event.id
        ) {
          return position(current);
        }
      }
      if (
        (boundary.kind === "after-measure" ||
          boundary.kind === "measure-end") &&
        boundary.measureId === measure.id
      ) {
        return position(current);
      }
    }
    if (
      (boundary.kind === "after-section" || boundary.kind === "section-end") &&
      boundary.sectionId === section.id
    ) {
      return position(current);
    }
  }
  return boundary.kind === "document-end" ? position(current) : null;
}

export const selectEventById: SelectEventById = (
  state: AppState,
  eventId: ChordEventId,
): ChordEvent | null => {
  const counters = createWorkCounters();
  return buildDocumentIndex(state.document, counters).events.get(eventId)?.event ?? null;
};

export const selectSelectedEvents: SelectSelectedEvents = (
  state: AppState,
): SelectedEventsResult => {
  if (state.bookmarks.selection.kind === "none") {
    return Object.freeze({ events: Object.freeze([]), missingIds: Object.freeze([]) });
  }
  const counters = createWorkCounters();
  const index = buildDocumentIndex(state.document, counters);
  const selected = new Set<string>(state.bookmarks.selection.eventIds);
  const events: ChordEvent[] = [];
  for (const eventId of index.eventOrder) {
    if (!selected.has(eventId)) continue;
    const event = index.events.get(eventId)?.event;
    if (event !== undefined) events.push(event);
  }
  const missingIds = state.bookmarks.selection.eventIds.filter(
    (eventId) => !index.events.has(eventId),
  );
  return Object.freeze({
    events: Object.freeze(events),
    missingIds: Object.freeze(missingIds),
  });
};

export const selectInsertionLocation: SelectInsertionLocation = (
  state: AppState,
): InsertionLocation => {
  const boundary = state.bookmarks.insertion;
  if (boundary === null) return Object.freeze({ kind: "none" });
  const counters = createWorkCounters();
  const index = buildDocumentIndex(state.document, counters);
  switch (boundary.kind) {
    case "document-start":
      return Object.freeze({
        kind: "section-boundary",
        beforeSectionId: index.sectionOrder[0] ?? null,
      });
    case "document-end":
      return Object.freeze({ kind: "section-boundary", beforeSectionId: null });
    case "before-section": {
      const location = index.sections.get(boundary.sectionId);
      return location === undefined
        ? Object.freeze({ kind: "none" })
        : Object.freeze({
            kind: "section-boundary",
            beforeSectionId: location.id,
          });
    }
    case "after-section": {
      const location = index.sections.get(boundary.sectionId);
      return location === undefined
        ? Object.freeze({ kind: "none" })
        : Object.freeze({
            kind: "section-boundary",
            beforeSectionId: index.sectionOrder[location.sectionIndex + 1] ?? null,
          });
    }
    case "section-start":
    case "section-end": {
      const location = index.sections.get(boundary.sectionId);
      if (location === undefined) return Object.freeze({ kind: "none" });
      const beforeMeasureId =
        boundary.kind === "section-start"
          ? location.section.measures[0]?.id ?? null
          : null;
      return Object.freeze({
        kind: "measure-boundary",
        sectionId: location.id,
        beforeMeasureId,
      });
    }
    case "before-measure": {
      const location = index.measures.get(boundary.measureId);
      return location === undefined
        ? Object.freeze({ kind: "none" })
        : Object.freeze({
            kind: "measure-boundary",
            sectionId: location.sectionId,
            beforeMeasureId: location.id,
          });
    }
    case "after-measure": {
      const location = index.measures.get(boundary.measureId);
      if (location === undefined) return Object.freeze({ kind: "none" });
      const section = index.sections.get(location.sectionId)?.section;
      return Object.freeze({
        kind: "measure-boundary",
        sectionId: location.sectionId,
        beforeMeasureId:
          section?.measures[location.measureIndex + 1]?.id ?? null,
      });
    }
    case "measure-start": {
      const location = index.measures.get(boundary.measureId);
      if (location === undefined) return Object.freeze({ kind: "none" });
      return Object.freeze({
        kind: "event-boundary",
        measureId: location.id,
        beforeEventId: location.measure.events[0]?.id ?? null,
      });
    }
    case "measure-end": {
      const location = index.measures.get(boundary.measureId);
      return location === undefined
        ? Object.freeze({ kind: "none" })
        : Object.freeze({
            kind: "event-boundary",
            measureId: location.id,
            beforeEventId: null,
          });
    }
    case "before-event": {
      const location = index.events.get(boundary.eventId);
      return location === undefined
        ? Object.freeze({ kind: "none" })
        : Object.freeze({
            kind: "event-boundary",
            measureId: location.measureId,
            beforeEventId: location.id,
          });
    }
    case "after-event": {
      const location = index.events.get(boundary.eventId);
      if (location === undefined) return Object.freeze({ kind: "none" });
      const measure = index.measures.get(location.measureId)?.measure;
      return Object.freeze({
        kind: "event-boundary",
        measureId: location.measureId,
        beforeEventId: measure?.events[location.eventIndex + 1]?.id ?? null,
      });
    }
  }
};

export const selectBeatRange: SelectBeatRange = (state: AppState) => {
  const range = state.bookmarks.range;
  if (range === null) return null;
  const anchor = boundaryPosition(state, range.anchor);
  const focus = boundaryPosition(state, range.focus);
  if (anchor === null || focus === null) return null;
  const forward = makeBeatRange(anchor, focus);
  if (forward.ok) return forward.value;
  const reverse = makeBeatRange(focus, anchor);
  return reverse.ok ? reverse.value : null;
};

export const selectDirtyState: SelectDirtyState = (
  state: AppState,
): DirtyState => {
  const persistedRevision =
    state.recovery.kind === "clean" ? state.recovery.persistedRevision : null;
  return Object.freeze({
    sinceExport: state.exportRevision !== state.revision,
    sinceRecovery: persistedRevision !== state.revision,
  });
};

export function isHistoryLocked(state: AppState): boolean {
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

export const selectHistoryAvailability: SelectHistoryAvailability = (
  state: AppState,
): HistoryAvailability => {
  const locked = isHistoryLocked(state);
  const undo = state.history.undo[state.history.undo.length - 1];
  const redo = state.history.redo[state.history.redo.length - 1];
  return Object.freeze({
    canUndo: !locked && undo !== undefined,
    canRedo: !locked && redo !== undefined,
    locked,
    undoLabel: undo?.label ?? null,
    redoLabel: redo?.label ?? null,
  });
};
