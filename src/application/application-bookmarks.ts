import type {
  ChordEventId,
  ValidatedDocument,
} from "../domain";
import {
  MAX_SELECTED_EVENT_IDS,
  type DocumentNodeRef,
  type InsertionPoint,
  type StableBoundary,
  type StableEventSelection,
  type StableRangeSelection,
  type StableUiBookmarks,
  type UiFocusTarget,
} from "./application-state-contract";
import {
  boundaryTargetExists,
  buildDocumentIndex,
  type DocumentIndex,
  type MutableApplicationWorkCounters,
} from "./application-state-helpers";

export function immutableBoundary(boundary: StableBoundary): StableBoundary {
  switch (boundary.kind) {
    case "document-start":
    case "document-end":
      return Object.freeze({ kind: boundary.kind });
    case "before-section":
    case "after-section":
    case "section-start":
    case "section-end":
      return Object.freeze({
        kind: boundary.kind,
        sectionId: boundary.sectionId,
      });
    case "before-measure":
    case "after-measure":
    case "measure-start":
    case "measure-end":
      return Object.freeze({
        kind: boundary.kind,
        measureId: boundary.measureId,
      });
    case "before-event":
    case "after-event":
      return Object.freeze({ kind: boundary.kind, eventId: boundary.eventId });
  }
}

export function immutableInsertionPoint(
  insertion: InsertionPoint,
): InsertionPoint {
  return insertion === null ? null : immutableBoundary(insertion);
}

export function initialBookmarks(
  document: ValidatedDocument,
  counters: MutableApplicationWorkCounters,
): StableUiBookmarks {
  const index = buildDocumentIndex(document, counters);
  const firstEvent = index.eventOrder[0];
  const firstMeasure = index.measureOrder[0];
  const firstSection = index.sectionOrder[0];
  const insertion: InsertionPoint =
    firstEvent !== undefined
      ? Object.freeze({ kind: "before-event", eventId: firstEvent })
      : firstMeasure !== undefined
        ? Object.freeze({ kind: "measure-start", measureId: firstMeasure })
        : firstSection !== undefined
          ? Object.freeze({ kind: "section-start", sectionId: firstSection })
          : Object.freeze({ kind: "document-start" });
  return Object.freeze({
    selection: Object.freeze({ kind: "none" }),
    insertion,
    range: null,
  });
}

function canonicalSelection(
  selection: StableEventSelection,
  index: DocumentIndex,
): StableEventSelection | null {
  if (selection.kind === "none") return Object.freeze({ kind: "none" });
  if (
    selection.eventIds.length > MAX_SELECTED_EVENT_IDS ||
    new Set(selection.eventIds).size !== selection.eventIds.length ||
    !selection.eventIds.includes(selection.anchorEventId) ||
    !selection.eventIds.includes(selection.focusEventId)
  ) {
    return null;
  }
  const selected = new Set<string>(selection.eventIds);
  if ([...selected].some((id) => !index.events.has(id))) return null;
  const ordered = index.eventOrder.filter((id) => selected.has(id));
  if (ordered.length === 0) return Object.freeze({ kind: "none" });
  const tuple = ordered as [ChordEventId, ...ChordEventId[]];
  return Object.freeze({
    kind: "events",
    eventIds: Object.freeze(tuple),
    anchorEventId: selection.anchorEventId,
    focusEventId: selection.focusEventId,
  });
}

export function normalizeBookmarks(
  document: ValidatedDocument,
  bookmarks: StableUiBookmarks,
  counters: MutableApplicationWorkCounters,
): StableUiBookmarks | null {
  const index = buildDocumentIndex(document, counters);
  const selection = canonicalSelection(bookmarks.selection, index);
  if (selection === null) return null;
  if (
    bookmarks.insertion !== null &&
    !boundaryTargetExists(bookmarks.insertion, index)
  ) {
    return null;
  }
  if (
    bookmarks.range !== null &&
    (!boundaryTargetExists(bookmarks.range.anchor, index) ||
      !boundaryTargetExists(bookmarks.range.focus, index))
  ) {
    return null;
  }
  return Object.freeze({
    selection,
    insertion: immutableInsertionPoint(bookmarks.insertion),
    range:
      bookmarks.range === null
        ? null
        : Object.freeze({
            anchor: immutableBoundary(bookmarks.range.anchor),
            focus: immutableBoundary(bookmarks.range.focus),
          }),
  });
}

type RepairedBoundary = Readonly<{
  boundary: StableBoundary;
  foundNeighbor: boolean;
}>;

function nextOrPrevious<T extends string>(
  id: T,
  beforeOrder: readonly T[],
  existsAfter: (candidate: T) => boolean,
  beforeKind: (candidate: T) => StableBoundary,
  afterKind: (candidate: T) => StableBoundary,
): RepairedBoundary {
  const sourceIndex = beforeOrder.indexOf(id);
  if (sourceIndex >= 0) {
    for (let index = sourceIndex + 1; index < beforeOrder.length; index += 1) {
      const candidate = beforeOrder[index];
      if (candidate !== undefined && existsAfter(candidate)) {
        return { boundary: beforeKind(candidate), foundNeighbor: true };
      }
    }
    for (let index = sourceIndex - 1; index >= 0; index -= 1) {
      const candidate = beforeOrder[index];
      if (candidate !== undefined && existsAfter(candidate)) {
        return { boundary: afterKind(candidate), foundNeighbor: true };
      }
    }
  }
  return {
    boundary: Object.freeze({ kind: "document-start" }),
    foundNeighbor: false,
  };
}

function eventContainerFallback(
  boundary: Extract<StableBoundary, { kind: "before-event" | "after-event" }>,
  before: DocumentIndex,
  after: DocumentIndex,
): RepairedBoundary {
  const location = before.events.get(boundary.eventId);
  if (location === undefined) {
    return {
      boundary: Object.freeze({ kind: "document-start" }),
      foundNeighbor: false,
    };
  }
  if (after.measures.has(location.measureId)) {
    return {
      boundary: Object.freeze({
        kind: boundary.kind === "before-event" ? "measure-start" : "measure-end",
        measureId: location.measureId,
      }),
      foundNeighbor: true,
    };
  }
  if (after.sections.has(location.sectionId)) {
    return {
      boundary: Object.freeze({
        kind: boundary.kind === "before-event" ? "section-start" : "section-end",
        sectionId: location.sectionId,
      }),
      foundNeighbor: true,
    };
  }
  return {
    boundary: Object.freeze({ kind: "document-start" }),
    foundNeighbor: false,
  };
}

function measureContainerFallback(
  boundary: Extract<
    StableBoundary,
    {
      kind:
        | "before-measure"
        | "after-measure"
        | "measure-start"
        | "measure-end";
    }
  >,
  before: DocumentIndex,
  after: DocumentIndex,
): RepairedBoundary {
  const location = before.measures.get(boundary.measureId);
  if (location !== undefined && after.sections.has(location.sectionId)) {
    const atStart =
      boundary.kind === "before-measure" || boundary.kind === "measure-start";
    return {
      boundary: Object.freeze({
        kind: atStart ? "section-start" : "section-end",
        sectionId: location.sectionId,
      }),
      foundNeighbor: true,
    };
  }
  return {
    boundary: Object.freeze({ kind: "document-start" }),
    foundNeighbor: false,
  };
}

function repairBoundary(
  boundary: StableBoundary,
  before: DocumentIndex,
  after: DocumentIndex,
): RepairedBoundary {
  if (boundaryTargetExists(boundary, after)) {
    return { boundary: immutableBoundary(boundary), foundNeighbor: true };
  }
  switch (boundary.kind) {
    case "document-start":
    case "document-end":
      return { boundary, foundNeighbor: true };
    case "before-event":
    case "after-event": {
      const repaired = nextOrPrevious(
        boundary.eventId,
        before.eventOrder,
        (id) => after.events.has(id),
        (id) => Object.freeze({ kind: "before-event", eventId: id }),
        (id) => Object.freeze({ kind: "after-event", eventId: id }),
      );
      return repaired.foundNeighbor
        ? repaired
        : eventContainerFallback(boundary, before, after);
    }
    case "before-measure":
    case "after-measure": {
      const repaired = nextOrPrevious(
        boundary.measureId,
        before.measureOrder,
        (id) => after.measures.has(id),
        (id) => Object.freeze({ kind: "before-measure", measureId: id }),
        (id) => Object.freeze({ kind: "after-measure", measureId: id }),
      );
      return repaired.foundNeighbor
        ? repaired
        : measureContainerFallback(boundary, before, after);
    }
    case "measure-start":
    case "measure-end": {
      const repaired = nextOrPrevious(
        boundary.measureId,
        before.measureOrder,
        (id) => after.measures.has(id),
        (id) => Object.freeze({ kind: "measure-start", measureId: id }),
        (id) => Object.freeze({ kind: "measure-end", measureId: id }),
      );
      return repaired.foundNeighbor
        ? repaired
        : measureContainerFallback(boundary, before, after);
    }
    case "before-section":
    case "after-section":
      return nextOrPrevious(
        boundary.sectionId,
        before.sectionOrder,
        (id) => after.sections.has(id),
        (id) => Object.freeze({ kind: "before-section", sectionId: id }),
        (id) => Object.freeze({ kind: "after-section", sectionId: id }),
      );
    case "section-start":
    case "section-end":
      return nextOrPrevious(
        boundary.sectionId,
        before.sectionOrder,
        (id) => after.sections.has(id),
        (id) => Object.freeze({ kind: "section-start", sectionId: id }),
        (id) => Object.freeze({ kind: "section-end", sectionId: id }),
      );
  }
}

function repairSelection(
  selection: StableEventSelection,
  after: DocumentIndex,
): StableEventSelection {
  if (selection.kind === "none") return Object.freeze({ kind: "none" });
  const selected = new Set<string>(selection.eventIds);
  const surviving = after.eventOrder.filter(
    (id) => selected.has(id) && after.events.has(id),
  );
  if (surviving.length === 0) return Object.freeze({ kind: "none" });
  const tuple = surviving as [ChordEventId, ...ChordEventId[]];
  const anchorEventId = after.events.has(selection.anchorEventId)
    ? selection.anchorEventId
    : tuple[0];
  const lastSurviving = tuple[tuple.length - 1] ?? tuple[0];
  const focusEventId = after.events.has(selection.focusEventId)
    ? selection.focusEventId
    : lastSurviving;
  return Object.freeze({
    kind: "events",
    eventIds: Object.freeze(tuple),
    anchorEventId,
    focusEventId,
  });
}

export function repairBookmarks(
  beforeDocument: ValidatedDocument,
  afterDocument: ValidatedDocument,
  bookmarks: StableUiBookmarks,
  counters: MutableApplicationWorkCounters,
): StableUiBookmarks {
  const before = buildDocumentIndex(beforeDocument, counters);
  const after = buildDocumentIndex(afterDocument, counters);
  const selection = repairSelection(bookmarks.selection, after);
  const insertion =
    bookmarks.insertion === null
      ? null
      : repairBoundary(bookmarks.insertion, before, after).boundary;
  let range: StableRangeSelection | null = null;
  if (bookmarks.range !== null) {
    const anchor = repairBoundary(bookmarks.range.anchor, before, after);
    const focus = repairBoundary(bookmarks.range.focus, before, after);
    if (anchor.foundNeighbor && focus.foundNeighbor) {
      range = Object.freeze({ anchor: anchor.boundary, focus: focus.boundary });
    }
  }
  counters.bookmarksRepaired += 1;
  return Object.freeze({ selection, insertion, range });
}

function targetFromBoundary(
  boundary: StableBoundary | null,
  index: DocumentIndex,
): UiFocusTarget | null {
  if (boundary === null) return null;
  switch (boundary.kind) {
    case "before-event":
    case "after-event":
      return index.events.has(boundary.eventId)
        ? Object.freeze({ kind: "event", eventId: boundary.eventId })
        : null;
    case "before-measure":
    case "after-measure":
    case "measure-start":
    case "measure-end":
      return index.measures.has(boundary.measureId)
        ? Object.freeze({ kind: "measure", measureId: boundary.measureId })
        : null;
    case "before-section":
    case "after-section":
    case "section-start":
    case "section-end":
      return index.sections.has(boundary.sectionId)
        ? Object.freeze({ kind: "section", sectionId: boundary.sectionId })
        : null;
    case "document-start":
    case "document-end":
      return Object.freeze({ kind: "chart" });
  }
}

export function focusAfterCommand(
  document: ValidatedDocument,
  bookmarks: StableUiBookmarks,
  insertedRefs: readonly DocumentNodeRef[],
  counters: MutableApplicationWorkCounters,
): UiFocusTarget {
  const index = buildDocumentIndex(document, counters);
  if (
    bookmarks.selection.kind === "events" &&
    index.events.has(bookmarks.selection.focusEventId)
  ) {
    return Object.freeze({
      kind: "event",
      eventId: bookmarks.selection.focusEventId,
    });
  }
  const insertionTarget = targetFromBoundary(bookmarks.insertion, index);
  if (insertionTarget !== null && insertionTarget.kind !== "chart") {
    return insertionTarget;
  }
  const firstInserted = insertedRefs[0];
  if (firstInserted?.kind === "event" && index.events.has(firstInserted.id)) {
    return Object.freeze({ kind: "event", eventId: firstInserted.id });
  }
  if (firstInserted?.kind === "measure" && index.measures.has(firstInserted.id)) {
    return Object.freeze({ kind: "measure", measureId: firstInserted.id });
  }
  if (firstInserted?.kind === "section" && index.sections.has(firstInserted.id)) {
    return Object.freeze({ kind: "section", sectionId: firstInserted.id });
  }
  return Object.freeze({ kind: "chart" });
}
