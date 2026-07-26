import type {
  ChordEventId,
  MeasureId,
  SectionId,
} from "../domain";
import type {
  AtomicEditPlan,
  AtomicEditPlanAllocatedIdentity,
  AtomicEditPlanBookmarkReceipt,
  AtomicEditPlanBoundary,
} from "./application-edit-plan-contract";
import type {
  StableBoundary,
  StableEventSelection,
  StableRangeSelection,
  StableUiBookmarks,
  UiFocusTarget,
} from "./application-state-contract";
import type { DocumentIndex } from "./application-state-helpers";

export type AtomicEditPlanBookmarkResult = Readonly<{
  bookmarks: StableUiBookmarks;
  receipt: AtomicEditPlanBookmarkReceipt;
  focusTarget: UiFocusTarget;
  recordsExamined: number;
  recordsRewritten: number;
}>;

type BoundaryMapping = Readonly<{
  boundary: StableBoundary | null;
  changed: boolean;
  unrepresentable: boolean;
}>;

function freezeBoundary(boundary: StableBoundary): StableBoundary {
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

function freezeRange(range: StableRangeSelection): StableRangeSelection {
  return Object.freeze({
    anchor: freezeBoundary(range.anchor),
    focus: freezeBoundary(range.focus),
  });
}

function freezeSelectedEventIds(
  eventIds: readonly [ChordEventId, ...ChordEventId[]],
): readonly [ChordEventId, ...ChordEventId[]] {
  const [first, ...remaining] = eventIds;
  return Object.freeze([first, ...remaining]);
}

function boundaryEquals(
  left: StableBoundary,
  right: StableBoundary,
): boolean {
  if (left.kind !== right.kind) return false;
  switch (left.kind) {
    case "document-start":
    case "document-end":
      return true;
    case "before-section":
    case "after-section":
    case "section-start":
    case "section-end":
      return (
        "sectionId" in right && left.sectionId === right.sectionId
      );
    case "before-measure":
    case "after-measure":
    case "measure-start":
    case "measure-end":
      return (
        "measureId" in right && left.measureId === right.measureId
      );
    case "before-event":
    case "after-event":
      return "eventId" in right && left.eventId === right.eventId;
  }
}

function unchangedBoundary(boundary: StableBoundary): BoundaryMapping {
  return Object.freeze({
    boundary: freezeBoundary(boundary),
    changed: false,
    unrepresentable: false,
  });
}

function rewrittenBoundary(
  before: StableBoundary,
  after: StableBoundary,
): BoundaryMapping {
  return Object.freeze({
    boundary: freezeBoundary(after),
    changed: !boundaryEquals(before, after),
    unrepresentable: false,
  });
}

function unrepresentableBoundary(): BoundaryMapping {
  return Object.freeze({
    boundary: null,
    changed: true,
    unrepresentable: true,
  });
}

function replaceSelectionEvent(
  selection: StableEventSelection,
  removed: ChordEventId,
  survivor: ChordEventId,
  after: DocumentIndex,
): Readonly<{
  selection: StableEventSelection;
  replaced: boolean;
}> {
  if (selection.kind === "none") {
    return Object.freeze({
      selection: Object.freeze({ kind: "none" }),
      replaced: false,
    });
  }
  const replaced = selection.eventIds.includes(removed);
  if (!replaced) {
    return Object.freeze({
      selection: Object.freeze({
        kind: "events",
        eventIds: freezeSelectedEventIds(selection.eventIds),
        anchorEventId: selection.anchorEventId,
        focusEventId: selection.focusEventId,
      }),
      replaced: false,
    });
  }
  const requested = new Set<string>(
    selection.eventIds.map((id) => (id === removed ? survivor : id)),
  );
  const ordered = after.eventOrder.filter((id) => requested.has(id));
  const eventIds = Object.freeze(ordered) as readonly [
    ChordEventId,
    ...ChordEventId[],
  ];
  return Object.freeze({
    selection: Object.freeze({
      kind: "events",
      eventIds,
      anchorEventId:
        selection.anchorEventId === removed
          ? survivor
          : selection.anchorEventId,
      focusEventId:
        selection.focusEventId === removed
          ? survivor
          : selection.focusEventId,
    }),
    replaced: true,
  });
}

function preservedSelection(
  selection: StableEventSelection,
): StableEventSelection {
  return selection.kind === "none"
    ? Object.freeze({ kind: "none" })
    : Object.freeze({
        kind: "events",
        eventIds: freezeSelectedEventIds(selection.eventIds),
        anchorEventId: selection.anchorEventId,
        focusEventId: selection.focusEventId,
      });
}

function focusFromBoundary(
  boundary: StableBoundary | null,
  after: DocumentIndex,
): UiFocusTarget | null {
  if (boundary === null) return null;
  switch (boundary.kind) {
    case "before-event":
    case "after-event":
      return after.events.has(boundary.eventId)
        ? Object.freeze({ kind: "event", eventId: boundary.eventId })
        : null;
    case "before-measure":
    case "after-measure":
    case "measure-start":
    case "measure-end":
      return after.measures.has(boundary.measureId)
        ? Object.freeze({ kind: "measure", measureId: boundary.measureId })
        : null;
    case "before-section":
    case "after-section":
    case "section-start":
    case "section-end":
      return after.sections.has(boundary.sectionId)
        ? Object.freeze({ kind: "section", sectionId: boundary.sectionId })
        : null;
    case "document-start":
    case "document-end":
      return Object.freeze({ kind: "chart" });
  }
}

function focusFromFirstAllocation(
  allocations: readonly AtomicEditPlanAllocatedIdentity[],
  after: DocumentIndex,
): UiFocusTarget | null {
  const first = allocations[0];
  if (first === undefined) return null;
  switch (first.kind) {
    case "event":
      return after.events.has(first.id)
        ? Object.freeze({ kind: "event", eventId: first.id })
        : null;
    case "measure":
      return after.measures.has(first.id)
        ? Object.freeze({ kind: "measure", measureId: first.id })
        : null;
    case "section":
      return after.sections.has(first.id)
        ? Object.freeze({ kind: "section", sectionId: first.id })
        : null;
  }
}

function deriveFocus(
  bookmarks: StableUiBookmarks,
  allocations: readonly AtomicEditPlanAllocatedIdentity[],
  after: DocumentIndex,
): Readonly<{
  policy:
    | "selection-focus-event"
    | "non-chart-insertion-target"
    | "first-inserted-structural-ref"
    | "chart";
  target: UiFocusTarget;
}> {
  if (
    bookmarks.selection.kind === "events" &&
    after.events.has(bookmarks.selection.focusEventId)
  ) {
    return Object.freeze({
      policy: "selection-focus-event",
      target: Object.freeze({
        kind: "event",
        eventId: bookmarks.selection.focusEventId,
      }),
    });
  }
  const insertionTarget = focusFromBoundary(bookmarks.insertion, after);
  if (insertionTarget !== null && insertionTarget.kind !== "chart") {
    return Object.freeze({
      policy: "non-chart-insertion-target",
      target: insertionTarget,
    });
  }
  const firstInserted = focusFromFirstAllocation(allocations, after);
  if (firstInserted !== null) {
    return Object.freeze({
      policy: "first-inserted-structural-ref",
      target: firstInserted,
    });
  }
  return Object.freeze({
    policy: "chart",
    target: Object.freeze({ kind: "chart" }),
  });
}

function boundaryRewrite(
  from: StableBoundary,
  to: StableBoundary,
): Readonly<{ from: AtomicEditPlanBoundary; to: AtomicEditPlanBoundary }> {
  return Object.freeze({
    from: freezeBoundary(from),
    to: freezeBoundary(to),
  });
}

function insertedBoundary(
  plan: AtomicEditPlan,
  allocations: readonly AtomicEditPlanAllocatedIdentity[],
): StableBoundary | null {
  if (plan.kind !== "insert-fragment") return null;
  if (plan.placement.kind === "into-measure") {
    const event = [...allocations]
      .reverse()
      .find((identity) => identity.kind === "event");
    return event?.kind === "event"
      ? Object.freeze({ kind: "after-event", eventId: event.id })
      : null;
  }
  if (plan.placement.kind === "into-section") {
    const measure = [...allocations]
      .reverse()
      .find((identity) => identity.kind === "measure");
    return measure?.kind === "measure"
      ? Object.freeze({ kind: "after-measure", measureId: measure.id })
      : null;
  }
  const section = [...allocations]
    .reverse()
    .find((identity) => identity.kind === "section");
  return section?.kind === "section"
    ? Object.freeze({ kind: "after-section", sectionId: section.id })
    : null;
}

function mapSplitEventBoundary(
  boundary: StableBoundary,
  source: ChordEventId,
  second: ChordEventId,
): BoundaryMapping {
  return boundary.kind === "after-event" && boundary.eventId === source
    ? rewrittenBoundary(
        boundary,
        Object.freeze({ kind: "after-event", eventId: second }),
      )
    : unchangedBoundary(boundary);
}

function mapJoinEventBoundary(
  boundary: StableBoundary,
  left: ChordEventId,
  right: ChordEventId,
): BoundaryMapping {
  if (
    (boundary.kind === "after-event" && boundary.eventId === left) ||
    (boundary.kind === "before-event" && boundary.eventId === right)
  ) {
    return unrepresentableBoundary();
  }
  if (boundary.kind === "after-event" && boundary.eventId === right) {
    return rewrittenBoundary(
      boundary,
      Object.freeze({ kind: "after-event", eventId: left }),
    );
  }
  return unchangedBoundary(boundary);
}

function mapSplitSectionBoundary(
  boundary: StableBoundary,
  source: SectionId,
  suffix: SectionId,
): BoundaryMapping {
  if (
    (boundary.kind === "after-section" ||
      boundary.kind === "section-end") &&
    boundary.sectionId === source
  ) {
    return rewrittenBoundary(
      boundary,
      Object.freeze({ kind: boundary.kind, sectionId: suffix }),
    );
  }
  return unchangedBoundary(boundary);
}

/**
 * Section 21.5, one level down from `mapSplitSectionBoundary`. Every event
 * identity survives, so `before-event` and `after-event` on any surviving event
 * are unchanged, and so are `before-measure` and `measure-start` on the
 * retained measure — those still denote the same point. Only the two boundaries
 * that denoted the end of the *complete* source measure move to the suffix,
 * because that is where that musical point now is. No internal beat is
 * approximated and no boundary is guessed.
 */
function mapSplitMeasureBoundary(
  boundary: StableBoundary,
  source: MeasureId,
  suffix: MeasureId,
): BoundaryMapping {
  if (
    (boundary.kind === "after-measure" ||
      boundary.kind === "measure-end") &&
    boundary.measureId === source
  ) {
    return rewrittenBoundary(
      boundary,
      Object.freeze({ kind: boundary.kind, measureId: suffix }),
    );
  }
  return unchangedBoundary(boundary);
}

function mapJoinSectionBoundary(
  boundary: StableBoundary,
  left: SectionId,
  right: SectionId,
  firstRightMeasure: MeasureId | null,
): BoundaryMapping {
  const rightIsEmpty = firstRightMeasure === null;
  if (
    (boundary.kind === "after-section" ||
      boundary.kind === "section-end") &&
    boundary.sectionId === left
  ) {
    return rightIsEmpty
      ? unchangedBoundary(boundary)
      : rewrittenBoundary(
          boundary,
          Object.freeze({
            kind: "before-measure",
            measureId: firstRightMeasure,
          }),
        );
  }
  if (
    (boundary.kind === "before-section" ||
      boundary.kind === "section-start") &&
    boundary.sectionId === right
  ) {
    return rewrittenBoundary(
      boundary,
      rightIsEmpty
        ? Object.freeze({ kind: "section-end", sectionId: left })
        : Object.freeze({
            kind: "before-measure",
            measureId: firstRightMeasure,
          }),
    );
  }
  if (
    (boundary.kind === "after-section" ||
      boundary.kind === "section-end") &&
    boundary.sectionId === right
  ) {
    return rewrittenBoundary(
      boundary,
      Object.freeze({ kind: boundary.kind, sectionId: left }),
    );
  }
  return unchangedBoundary(boundary);
}

export function mapAtomicEditPlanBookmarks(
  plan: AtomicEditPlan,
  beforeBookmarks: StableUiBookmarks,
  allocations: readonly AtomicEditPlanAllocatedIdentity[],
  before: DocumentIndex,
  after: DocumentIndex,
): AtomicEditPlanBookmarkResult {
  const recordsExamined =
    1 +
    (beforeBookmarks.selection.kind === "events"
      ? beforeBookmarks.selection.eventIds.length
      : 0) +
    (beforeBookmarks.insertion === null ? 0 : 1) +
    (beforeBookmarks.range === null ? 0 : 2);
  let recordsRewritten = 0;
  let selection = preservedSelection(beforeBookmarks.selection);
  let selectionPolicy:
    | "preserve-existing"
    | "replace-removed-right-with-left-and-deduplicate" =
    "preserve-existing";
  let selectionReplacements: readonly Readonly<{
    fromEventId: ChordEventId;
    toEventId: ChordEventId;
  }>[] = Object.freeze([]);
  let insertion = beforeBookmarks.insertion;
  let insertionPolicy:
    | "preserve-existing"
    | "move-after-last-inserted"
    | "create-after-last-inserted"
    | "rewrite-exact-span-end"
    | "rewrite-representable-boundaries"
    | "clear-unrepresentable-internal-event-boundary" =
    "preserve-existing";
  let insertionRewrite: Readonly<{
    from: AtomicEditPlanBoundary;
    to: AtomicEditPlanBoundary;
  }> | null = null;
  let insertionCreated: AtomicEditPlanBoundary | null = null;
  let insertionCleared = false;
  let range =
    beforeBookmarks.range === null
      ? null
      : freezeRange(beforeBookmarks.range);
  let rangePolicy:
    | "preserve-existing"
    | "rewrite-representable-boundaries"
    | "clear-unrepresentable-internal-event-boundary" =
    "preserve-existing";
  let rangeBoundaryRewrites: readonly Readonly<{
    from: AtomicEditPlanBoundary;
    to: AtomicEditPlanBoundary;
  }>[] = Object.freeze([]);
  let rangeCleared = false;
  let operationPolicy: string;
  let joinSectionsExtension: Readonly<Record<string, unknown>> | null = null;
  let mapper: (boundary: StableBoundary) => BoundaryMapping =
    unchangedBoundary;

  switch (plan.kind) {
    case "insert-fragment": {
      operationPolicy =
        "preserve-selection-and-range-set-insertion-after-last-inserted";
      const target = insertedBoundary(plan, allocations);
      if (target === null) {
        throw new Error("A0_U1_INTERNAL_INSERT_BOOKMARK");
      }
      insertion = target;
      if (beforeBookmarks.insertion === null) {
        // No before insertion record exists, so the receipt reports an
        // honest creation instead of fabricating a rewrite source from the
        // QuickEntry target.
        insertionPolicy = "create-after-last-inserted";
        insertionCreated = freezeBoundary(target);
      } else {
        insertionPolicy = "move-after-last-inserted";
        insertionRewrite = boundaryRewrite(
          beforeBookmarks.insertion,
          target,
        );
      }
      recordsRewritten += 1;
      break;
    }
    case "split-event-duration": {
      operationPolicy =
        "preserve-original-selection-rewrite-original-span-end-to-second";
      const second = allocations[0];
      if (second?.kind !== "event") {
        throw new Error("A0_U1_INTERNAL_SPLIT_EVENT_BOOKMARK");
      }
      mapper = (boundary) =>
        mapSplitEventBoundary(boundary, plan.eventId, second.id);
      break;
    }
    case "join-event-durations": {
      operationPolicy =
        "replace-removed-right-selection-with-left-clear-unrepresentable-range";
      const mapped = replaceSelectionEvent(
        beforeBookmarks.selection,
        plan.rightEventId,
        plan.leftEventId,
        after,
      );
      selection = mapped.selection;
      if (mapped.replaced) {
        selectionPolicy =
          "replace-removed-right-with-left-and-deduplicate";
        selectionReplacements = Object.freeze([
          Object.freeze({
            fromEventId: plan.rightEventId,
            toEventId: plan.leftEventId,
          }),
        ]);
        recordsRewritten += 1;
      }
      mapper = (boundary) =>
        mapJoinEventBoundary(
          boundary,
          plan.leftEventId,
          plan.rightEventId,
        );
      break;
    }
    case "split-section": {
      operationPolicy =
        "preserve-node-identities-rewrite-source-section-end-to-suffix";
      const suffix = allocations[0];
      if (suffix?.kind !== "section") {
        throw new Error("A0_U1_INTERNAL_SPLIT_SECTION_BOOKMARK");
      }
      mapper = (boundary) =>
        mapSplitSectionBoundary(boundary, plan.sectionId, suffix.id);
      break;
    }
    case "split-measure": {
      operationPolicy =
        "preserve-node-identities-rewrite-source-measure-end-to-suffix";
      const suffix = allocations[0];
      if (suffix?.kind !== "measure") {
        throw new Error("A0_U1_INTERNAL_SPLIT_MEASURE_BOOKMARK");
      }
      mapper = (boundary) =>
        mapSplitMeasureBoundary(boundary, plan.measureId, suffix.id);
      break;
    }
    case "join-sections": {
      operationPolicy =
        "preserve-measure-event-identities-map-internal-edge-to-first-measure-or-surviving-end";
      const rightLocation = before.sections.get(plan.rightSectionId);
      if (rightLocation === undefined) {
        throw new Error("A0_U1_INTERNAL_JOIN_SECTION_BOOKMARK");
      }
      const firstRightMeasure =
        rightLocation.section.measures[0]?.id ?? null;
      mapper = (boundary) =>
        mapJoinSectionBoundary(
          boundary,
          plan.leftSectionId,
          plan.rightSectionId,
          firstRightMeasure,
        );
      const from = Object.freeze({
        kind: "section-start" as const,
        sectionId: plan.rightSectionId,
      });
      const to =
        firstRightMeasure === null
          ? Object.freeze({
              kind: "section-end" as const,
              sectionId: plan.leftSectionId,
            })
          : Object.freeze({
              kind: "before-measure" as const,
              measureId: firstRightMeasure,
            });
      joinSectionsExtension = Object.freeze({
        rightSectionWasEmpty: firstRightMeasure === null,
        rightSectionFirstMeasureId: firstRightMeasure,
        rightSectionStartRewrite: boundaryRewrite(from, to),
      });
      break;
    }
  }

  if (plan.kind !== "insert-fragment" && insertion !== null) {
    const mapped = mapper(insertion);
    if (mapped.unrepresentable) {
      insertion = null;
      insertionPolicy =
        "clear-unrepresentable-internal-event-boundary";
      insertionCleared = true;
      recordsRewritten += 1;
    } else if (mapped.boundary !== null && mapped.changed) {
      insertionPolicy =
        plan.kind === "split-event-duration" ||
        plan.kind === "join-event-durations"
          ? "rewrite-exact-span-end"
          : "rewrite-representable-boundaries";
      insertionRewrite = boundaryRewrite(insertion, mapped.boundary);
      insertion = mapped.boundary;
      recordsRewritten += 1;
    } else if (mapped.boundary !== null) {
      insertion = mapped.boundary;
    }
  }

  if (plan.kind !== "insert-fragment" && range !== null) {
    const anchor = mapper(range.anchor);
    const focus = mapper(range.focus);
    if (anchor.unrepresentable || focus.unrepresentable) {
      range = null;
      rangePolicy =
        "clear-unrepresentable-internal-event-boundary";
      rangeCleared = true;
      recordsRewritten += 1;
    } else if (anchor.boundary !== null && focus.boundary !== null) {
      const rewrites: Readonly<{
        from: AtomicEditPlanBoundary;
        to: AtomicEditPlanBoundary;
      }>[] = [];
      if (anchor.changed) {
        rewrites.push(boundaryRewrite(range.anchor, anchor.boundary));
        recordsRewritten += 1;
      }
      if (focus.changed) {
        rewrites.push(boundaryRewrite(range.focus, focus.boundary));
        recordsRewritten += 1;
      }
      range = Object.freeze({
        anchor: anchor.boundary,
        focus: focus.boundary,
      });
      if (rewrites.length > 0) {
        rangePolicy = "rewrite-representable-boundaries";
        rangeBoundaryRewrites = Object.freeze(rewrites);
      }
    }
  }

  const bookmarks: StableUiBookmarks = Object.freeze({
    selection,
    insertion:
      insertion === null ? null : freezeBoundary(insertion),
    range,
  });
  const focus = deriveFocus(bookmarks, allocations, after);
  const receipt = Object.freeze({
    operationPolicy,
    selectionPolicy,
    selectionReplacements,
    insertionPolicy,
    insertionRewrite,
    ...(insertionCreated === null ? {} : { insertionCreated }),
    insertionCleared,
    rangePolicy,
    rangeBoundaryRewrites,
    rangeCleared,
    focusPolicy: focus.policy,
    focusTarget: focus.target,
    ...(joinSectionsExtension ?? {}),
  }) as AtomicEditPlanBookmarkReceipt;

  return Object.freeze({
    bookmarks,
    receipt,
    focusTarget: focus.target,
    recordsExamined,
    recordsRewritten,
  });
}
