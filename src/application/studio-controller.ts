import {
  addBeatValues,
  compareBeatValues,
  makeBeatDuration,
  measureCapacity,
  type BeatDuration,
  type ChordEvent,
  type ChordSpec,
  type MeasureCompletion,
  type ParsedChordEvent,
  type MeasureId,
  type SectionId,
} from "../domain";
import {
  A0_U1_NEW_EVENT_POLICY_ID,
  type ApplyEditPlanCommand,
  type AtomicEditPlanQuickEntrySnapshot,
  type CompleteDraftInsertFragmentPlacement,
} from "./application-edit-plan-contract";
import {
  buildDocumentIndex,
  createWorkCounters,
  type DocumentIndex,
  type EventLocation,
} from "./application-state-helpers";
import {
  redoDocumentCommand,
  reduceEphemeralIntent,
  runDocumentCommand,
  undoDocumentCommand,
} from "./application-state";
import type {
  AppState,
  ApplicationCommandDependencies,
  ApplicationEffect,
  ApplicationTransitionOutcome,
  ApplicationTransitionResult,
  DeleteDocumentNodesCommand,
  DocumentNodeRef,
  DuplicateDocumentNodesCommand,
  InsertDocumentNodeCommand,
  MeasureCompletionUpdate,
  MoveDocumentNodesCommand,
  SetChordCommand,
  SetDurationCommand,
  SetMeasureCompletionCommand,
  SetSectionCommand,
  SetTextCommand,
  StableBoundary,
  StableUiBookmarks,
} from "./application-state-contract";
import { parseChordSymbol, type ChartTextDraft } from "../theory";
import {
  createStudioBootstrap,
  type StudioBootstrapRefusal,
} from "./studio-bootstrap";
import {
  selectStudioViewModel,
  type StudioViewModel,
} from "./studio-view-model";

const TITLE_COMMAND_INTERVAL_MS = 1_001;
const MAX_TITLE_COMMAND_ORDINAL = Math.floor(
  Number.MAX_SAFE_INTEGER / TITLE_COMMAND_INTERVAL_MS,
);

export const STUDIO_CONTROLLER_REFUSAL_CODES = Object.freeze([
  "studio.controller.command_sequence_exhausted",
  "studio.controller.unexpected_failure",
] as const);

/**
 * Pre-dispatch guards owned by U1. They never rename an application refusal:
 * a code that reaches A0 is surfaced with its own A0 code instead.
 */
export const STUDIO_EDIT_REFUSAL_CODES = Object.freeze([
  "u1.selection_empty",
  "u1.selection_limit",
  "u1.target_missing",
  "u1.duration_invalid",
  "u1.duration_overfills_measure",
  "u1.completion_reason_required",
  "u1.draft_code_points_exceeded",
  "u1.draft_unicode_invalid",
  "u1.range_endpoints_unordered",
  "u1.quick_entry_stale_revision",
  "u1.quick_entry_target_missing",
  "u1.insertion_plan_not_atomic",
  "u1.insertion_plan_overfills_destination",
  "u1.insertion_plan_requires_confirmation",
  "u1.quick_entry_lane_mismatch",
  "u1.move_destination_invalid",
  "u1.symbol_draft_invalid",
  "u1.symbol_edit_blocked_manual_voicing",
] as const);

export type StudioEditRefusalCode =
  (typeof STUDIO_EDIT_REFUSAL_CODES)[number];

export type StudioControllerAction =
  | "set-title"
  | "undo"
  | "redo"
  | "set-left-rail"
  | "set-right-rail"
  | "select-event"
  | "extend-selection"
  | "clear-selection"
  | "set-insertion-point"
  | "set-range"
  | "clear-range"
  | "set-quick-entry-draft"
  | "clear-quick-entry"
  | "delete-selection"
  | "duplicate-selection"
  | "set-event-duration"
  | "set-measure-completion"
  | "apply-quick-entry"
  | "insert-measure"
  | "insert-section"
  | "move-previous"
  | "move-next"
  | "apply-inline-symbol"
  | "rename-section"
  | "annotate-section"
  | "set-section-boundary"
  | "move-to-measure";

export type StudioControllerRefusal = Readonly<{
  action: StudioControllerAction;
  code: string;
  message: string;
  path: readonly (string | number)[];
  recoveryAction: string;
  issueCodes: readonly string[];
}>;

export type StudioControllerActionResult =
  | Readonly<{
      ok: true;
      outcome: ApplicationTransitionOutcome;
      snapshot: StudioViewModel;
      effects: readonly ApplicationEffect[];
    }>
  | Readonly<{
      ok: false;
      refusal: StudioControllerRefusal;
      snapshot: StudioViewModel;
    }>;

/** Identity-brand-free boundary the UI layer can construct from its view model. */
export type StudioBoundaryInput =
  | Readonly<{ kind: "document-start" | "document-end" }>
  | Readonly<{
      kind: "before-section" | "after-section" | "section-start" | "section-end";
      sectionId: string;
    }>
  | Readonly<{
      kind: "before-measure" | "after-measure" | "measure-start" | "measure-end";
      measureId: string;
    }>
  | Readonly<{ kind: "before-event" | "after-event"; eventId: string }>;

export type StudioQuickEntryPreview = Readonly<{
  status: "idle" | "invalid" | "ready";
  issueCodes: readonly string[];
}>;

export type StudioRailSide = "left" | "right";
export type StudioControllerListener = () => void;

export interface StudioController {
  readonly getSnapshot: () => StudioViewModel;
  readonly subscribe: (listener: StudioControllerListener) => () => void;
  readonly setTitle: (value: string) => StudioControllerActionResult;
  readonly undo: () => StudioControllerActionResult;
  readonly redo: () => StudioControllerActionResult;
  readonly setRailCollapsed: (
    side: StudioRailSide,
    collapsed: boolean,
  ) => StudioControllerActionResult;
  readonly toggleRail: (side: StudioRailSide) => StudioControllerActionResult;
  /** Bookmarks travel as ephemeral intents and never enter history. */
  readonly selectEvent: (eventId: string) => StudioControllerActionResult;
  readonly extendSelectionTo: (eventId: string) => StudioControllerActionResult;
  readonly clearSelection: () => StudioControllerActionResult;
  readonly setInsertionPoint: (
    boundary: StudioBoundaryInput,
  ) => StudioControllerActionResult;
  readonly setRange: (
    anchor: StudioBoundaryInput,
    focus: StudioBoundaryInput,
  ) => StudioControllerActionResult;
  readonly clearRange: () => StudioControllerActionResult;
  readonly setQuickEntryDraft: (
    text: string,
    target: StudioBoundaryInput | null,
    status: "idle" | "invalid" | "ready",
    issueCodes: readonly string[],
  ) => StudioControllerActionResult;
  readonly clearQuickEntry: () => StudioControllerActionResult;
  /** Each editing action publishes exactly one A0 document command. */
  readonly deleteSelection: (
    incompleteReason?: string | null,
  ) => StudioControllerActionResult;
  readonly duplicateSelection: (
    destinationMeasureId?: string | null,
    incompleteReason?: string | null,
  ) => StudioControllerActionResult;
  readonly setEventDuration: (
    eventId: string,
    numerator: number,
    denominator: number,
    incompleteReason?: string | null,
  ) => StudioControllerActionResult;
  readonly setMeasureCompletion: (
    measureId: string,
    completion: MeasureCompletion,
  ) => StudioControllerActionResult;
  readonly applyQuickEntryPreview: () => StudioControllerActionResult;
  /** Read-only T0 classification for the draft preview; changes no state. */
  readonly previewChartText: (text: string) => StudioQuickEntryPreview;
  readonly insertMeasure: (
    sectionId: string,
    beforeMeasureId: string | null,
  ) => StudioControllerActionResult;
  readonly insertSection: (
    beforeSectionId: string | null,
    name: string,
  ) => StudioControllerActionResult;
  readonly moveSelection: (
    direction: "previous" | "next",
    incompleteReason?: string | null,
  ) => StudioControllerActionResult;
  readonly applyInlineSymbol: (
    eventId: string,
    symbolText: string,
  ) => StudioControllerActionResult;
  readonly setEventDurationText: (
    eventId: string,
    beatText: string,
    incompleteReason?: string | null,
  ) => StudioControllerActionResult;
  readonly renameSection: (
    sectionId: string,
    name: string,
  ) => StudioControllerActionResult;
  readonly annotateSection: (
    sectionId: string,
    annotation: string,
  ) => StudioControllerActionResult;
  readonly setSectionBoundary: (
    sectionId: string,
    voiceLeadingBoundary: "reset" | "continue",
  ) => StudioControllerActionResult;
  readonly moveSelectionTo: (
    measureId: string,
    beforeEventId?: string | null,
    incompleteReason?: string | null,
  ) => StudioControllerActionResult;
}

export type StudioControllerConstructionRefusal =
  | StudioBootstrapRefusal
  | Readonly<{
      code: "studio.controller.unexpected_failure";
      message: string;
      recoveryAction: string;
      issues: readonly [];
    }>;

export type StudioControllerCreationResult =
  | Readonly<{ ok: true; controller: StudioController }>
  | Readonly<{ ok: false; refusal: StudioControllerConstructionRefusal }>;

const EDIT_RECOVERY_ACTIONS: Readonly<Record<StudioEditRefusalCode, string>> =
  Object.freeze({
    "u1.selection_empty": "Select at least one chord before this action.",
    "u1.selection_limit": "Select at most 8,192 chords.",
    "u1.target_missing": "Choose a chord, measure, or boundary that still exists.",
    "u1.duration_invalid": "Enter an exact positive beat duration.",
    "u1.duration_overfills_measure":
      "Shorten the duration or move the following chords into the next measure.",
    "u1.completion_reason_required":
      "Confirm the intentionally incomplete measure and give a reason.",
    "u1.draft_code_points_exceeded":
      "Shorten the quick-entry draft to at most 4,096 code points.",
    "u1.draft_unicode_invalid":
      "Remove the unpaired surrogate from the quick-entry draft.",
    "u1.range_endpoints_unordered":
      "Set the range end at or after the range start in document order.",
    "u1.quick_entry_stale_revision":
      "Retype or re-target the quick-entry draft against the current chart.",
    "u1.quick_entry_target_missing":
      "Choose an insertion boundary that still exists in this chart.",
    "u1.insertion_plan_not_atomic":
      "Correct the draft or choose a boundary that accepts this material.",
    "u1.insertion_plan_overfills_destination":
      "Choose an empty measure or a structural boundary, or shorten the draft.",
    "u1.insertion_plan_requires_confirmation":
      "Complete the final measure, or insert one recovered chord instead.",
    "u1.quick_entry_lane_mismatch":
      "Type a complete draft before inserting the whole preview.",
    "u1.move_destination_invalid":
      "Choose one contiguous run of chords inside a single measure.",
    "u1.symbol_draft_invalid":
      "Correct the chord symbol; the text you typed is preserved.",
    "u1.symbol_edit_blocked_manual_voicing":
      "Open the chord inspector to change a manual or frozen voicing.",
  });

function recoveryAction(action: StudioControllerAction, code: string): string {
  const editRecovery = Object.hasOwn(EDIT_RECOVERY_ACTIONS, code)
    ? EDIT_RECOVERY_ACTIONS[code as StudioEditRefusalCode]
    : undefined;
  if (editRecovery !== undefined) return editRecovery;
  if (code === "history.undo_empty") return "Make a document edit before using Undo.";
  if (code === "history.redo_empty") return "Undo a document edit before using Redo.";
  if (code === "command.structural_validation_failed") {
    return action === "set-title"
      ? "Enter a nonblank title of at most 256 Unicode code points."
      : "Correct the invalid document fields and try again.";
  }
  if (code === "command.semantic_validation_failed") {
    return "Correct the musical validation issues and try again.";
  }
  if (code === "studio.controller.command_sequence_exhausted") {
    return "Reload the local studio before issuing another title command.";
  }
  if (code === "studio.controller.unexpected_failure") {
    return "Keep the current chart open and reload this local build before retrying.";
  }
  if (action === "set-left-rail" || action === "set-right-rail") {
    return "Retry the rail action against the current workspace state.";
  }
  return "Review the current chart state and retry the action.";
}

function controllerRefusal(
  action: StudioControllerAction,
  code: string,
  message: string,
  path: readonly (string | number)[] = [],
  issueCodes: readonly string[] = [],
): StudioControllerRefusal {
  return Object.freeze({
    action,
    code,
    message,
    path: Object.freeze([...path]),
    recoveryAction: recoveryAction(action, code),
    issueCodes: Object.freeze([...issueCodes]),
  });
}

function transitionIssueCodes(
  result: Extract<ApplicationTransitionResult, { ok: false }>,
): readonly string[] {
  const codes = [
    ...(result.refusal.structuralIssues?.map((issue) => issue.code) ?? []),
    ...(result.refusal.semanticIssues?.map((issue) => issue.code) ?? []),
  ];
  return Object.freeze(codes);
}

const MAX_DRAFT_CODE_POINTS = 4_096;
const MAX_SELECTED_EVENTS = 8_192;
const MAX_PREVIEW_ISSUE_CODES = 64;
const MAX_SYMBOL_DRAFT_CODE_POINTS = 256;

function countCodePoints(value: string): number {
  let count = 0;
  const scalars = value[Symbol.iterator]();
  while (!scalars.next().done) count += 1;
  return count;
}

function hasLoneSurrogate(value: string): boolean {
  for (const scalar of value) {
    const code = scalar.codePointAt(0) ?? 0;
    if (code >= 0xd800 && code <= 0xdfff) return true;
  }
  return false;
}

function totalDuration(events: readonly ChordEvent[]): BeatDuration | null {
  let total = makeBeatDuration({ numerator: 0, denominator: 1 });
  if (events.length === 0) return null;
  for (const [index, event] of events.entries()) {
    if (index === 0) {
      total = makeBeatDuration({
        numerator: event.duration.numerator,
        denominator: event.duration.denominator,
      });
      continue;
    }
    if (!total.ok) return null;
    const sum = addBeatValues(total.value, event.duration);
    if (!sum.ok) return null;
    total = makeBeatDuration({
      numerator: sum.value.numerator,
      denominator: sum.value.denominator,
    });
  }
  return total.ok ? total.value : null;
}

/**
 * Derive the literal completion a measure must carry after an edit. Returning
 * a refusal code rather than guessing keeps every incomplete measure explicit.
 */
function completionAfterEdit(
  events: readonly ChordEvent[],
  capacity: BeatDuration,
  reason: string | null,
): Readonly<{ ok: true; completion: MeasureCompletion }>
  | Readonly<{ ok: false; code: StudioEditRefusalCode }> {
  if (events.length === 0) {
    return Object.freeze({ ok: true, completion: Object.freeze({ kind: "empty" as const }) });
  }
  const total = totalDuration(events);
  if (total === null) {
    return Object.freeze({ code: "u1.duration_invalid" as const, ok: false });
  }
  const comparison = compareBeatValues(total, capacity);
  if (comparison === 0) {
    return Object.freeze({
      completion: Object.freeze({ kind: "complete" as const }),
      ok: true,
    });
  }
  if (comparison > 0) {
    return Object.freeze({
      code: "u1.duration_overfills_measure" as const,
      ok: false,
    });
  }
  if (reason === null || reason.trim().length === 0) {
    return Object.freeze({
      code: "u1.completion_reason_required" as const,
      ok: false,
    });
  }
  return Object.freeze({
    completion: Object.freeze({
      expectedDuration: total,
      kind: "incomplete" as const,
      reason,
    }),
    ok: true,
  });
}

export type StudioControllerOptions = Readonly<{
  /**
   * Monotonic milliseconds used only for A0 command coalescing. It is never a
   * musical or correctness cutoff.
   */
  nowMs?: () => number;
}>;

function makeStudioController(
  initialState: AppState,
  dependencies: ApplicationCommandDependencies,
  options: StudioControllerOptions,
): StudioController {
  let state = initialState;
  let snapshot = selectStudioViewModel(state);
  let documentIndex: DocumentIndex = buildDocumentIndex(
    state.document,
    createWorkCounters(),
  );
  let nextTitleCommandOrdinal = 1;
  let nextCommandOrdinal = 1;
  let lastLogicalTimeMs = 0;
  const readClock = options.nowMs;
  const listeners = new Set<StudioControllerListener>();

  /** Non-decreasing integer logical time; a stalled clock still commits. */
  const logicalTimeMs = (): number => {
    const observed = readClock === undefined ? lastLogicalTimeMs : readClock();
    const floored = Number.isFinite(observed) ? Math.floor(observed) : 0;
    lastLogicalTimeMs = Math.max(lastLogicalTimeMs, Math.max(0, floored));
    return lastLogicalTimeMs;
  };

  const commandEnvelope = (
    prefix: string,
    label: string,
  ): Readonly<{
    id: string;
    label: string;
    expectedDocumentId: AppState["document"]["id"];
    expectedRevision: number;
    logicalTimeMs: number;
    coalescing: null;
  }> => {
    const ordinal = nextCommandOrdinal;
    nextCommandOrdinal += 1;
    return Object.freeze({
      coalescing: null,
      expectedDocumentId: state.document.id,
      expectedRevision: state.revision,
      id: `${prefix}-${String(ordinal)}`,
      label,
      logicalTimeMs: logicalTimeMs(),
    });
  };

  const notify = (): void => {
    for (const listener of listeners) {
      try {
        listener();
      } catch {
        // A subscriber cannot make an already-published application action throw.
      }
    }
  };

  const apply = (
    action: StudioControllerAction,
    operation: (current: AppState) => ApplicationTransitionResult,
  ): StudioControllerActionResult => {
    let result: ApplicationTransitionResult;
    let nextSnapshot = snapshot;
    try {
      result = operation(state);
      if (result.state !== state) {
        nextSnapshot = selectStudioViewModel(result.state);
      }
    } catch {
      return Object.freeze({
        ok: false,
        refusal: controllerRefusal(
          action,
          "studio.controller.unexpected_failure",
          "The action stopped before application state could be published.",
        ),
        snapshot,
      });
    }

    const previousState = state;
    state = result.state;
    if (state !== previousState) {
      snapshot = nextSnapshot;
      if (state.document !== previousState.document) {
        documentIndex = buildDocumentIndex(state.document, createWorkCounters());
      }
      notify();
    }
    if (!result.ok) {
      return Object.freeze({
        ok: false,
        refusal: controllerRefusal(
          action,
          result.refusal.code,
          result.refusal.message,
          result.refusal.path,
          transitionIssueCodes(result),
        ),
        snapshot,
      });
    }
    return Object.freeze({
      ok: true,
      outcome: result.outcome,
      snapshot,
      effects: result.effects,
    });
  };

  const setTitle = (value: string): StudioControllerActionResult => {
    if (nextTitleCommandOrdinal > MAX_TITLE_COMMAND_ORDINAL) {
      return Object.freeze({
        ok: false,
        refusal: controllerRefusal(
          "set-title",
          "studio.controller.command_sequence_exhausted",
          "The deterministic title-command sequence is exhausted.",
        ),
        snapshot,
      });
    }
    const ordinal = nextTitleCommandOrdinal;
    nextTitleCommandOrdinal += 1;
    const command: SetTextCommand = Object.freeze({
      kind: "set-text",
      id: `studio-title-${String(ordinal)}`,
      label: "Rename document",
      expectedDocumentId: state.document.id,
      expectedRevision: state.revision,
      logicalTimeMs: (ordinal - 1) * TITLE_COMMAND_INTERVAL_MS,
      coalescing: Object.freeze({
        kind: "text-field",
        key: "title",
        focusSessionId: "studio-document-title",
      }),
      target: Object.freeze({ kind: "document-title" }),
      value,
    });
    return apply("set-title", (current) =>
      runDocumentCommand({ state: current, command, dependencies }),
    );
  };

  const setRailCollapsed = (
    side: StudioRailSide,
    collapsed: boolean,
  ): StudioControllerActionResult => {
    const action = side === "left" ? "set-left-rail" : "set-right-rail";
    return apply(action, (current) =>
      reduceEphemeralIntent({
        state: current,
        intent: {
          kind: "set-panels",
          panels: {
            ...current.panels,
            open: current.panels.open,
            leftRailCollapsed:
              side === "left" ? collapsed : current.panels.leftRailCollapsed,
            rightRailCollapsed:
              side === "right" ? collapsed : current.panels.rightRailCollapsed,
          },
        },
      }),
    );
  };

  const editRefusal = (
    action: StudioControllerAction,
    code: StudioEditRefusalCode,
    message: string,
    path: readonly (string | number)[] = [],
  ): StudioControllerActionResult =>
    Object.freeze({
      ok: false,
      refusal: controllerRefusal(action, code, message, path),
      snapshot,
    });

  const publishBookmarks = (
    action: StudioControllerAction,
    bookmarks: StableUiBookmarks,
  ): StudioControllerActionResult =>
    apply(action, (current) =>
      reduceEphemeralIntent({
        intent: { bookmarks, kind: "set-bookmarks" },
        state: current,
      }),
    );

  const selectEvent = (eventId: string): StudioControllerActionResult => {
    const index = documentIndex;
    const location = index.events.get(eventId);
    if (location === undefined) {
      return editRefusal(
        "select-event",
        "u1.target_missing",
        "The chord is no longer part of this chart.",
        ["eventId"],
      );
    }
    return publishBookmarks("select-event", {
      ...state.bookmarks,
      selection: {
        anchorEventId: location.id,
        eventIds: [location.id],
        focusEventId: location.id,
        kind: "events",
      },
    });
  };

  const extendSelectionTo = (eventId: string): StudioControllerActionResult => {
    const index = documentIndex;
    const target = index.events.get(eventId);
    if (target === undefined) {
      return editRefusal(
        "extend-selection",
        "u1.target_missing",
        "The chord is no longer part of this chart.",
        ["eventId"],
      );
    }
    const selection = state.bookmarks.selection;
    if (selection.kind !== "events") return selectEvent(eventId);
    const order = index.eventOrder;
    const anchorIndex = order.indexOf(selection.anchorEventId);
    const focusIndex = order.indexOf(target.id);
    if (anchorIndex < 0 || focusIndex < 0) {
      return editRefusal(
        "extend-selection",
        "u1.target_missing",
        "The selection anchor is no longer part of this chart.",
        ["anchorEventId"],
      );
    }
    const from = Math.min(anchorIndex, focusIndex);
    const to = Math.max(anchorIndex, focusIndex);
    const span = order.slice(from, to + 1);
    if (span.length > MAX_SELECTED_EVENTS) {
      return editRefusal(
        "extend-selection",
        "u1.selection_limit",
        "The selection exceeds the reviewed maximum of 8,192 chords.",
        ["eventIds"],
      );
    }
    const [first, ...rest] = span;
    if (first === undefined) return selectEvent(eventId);
    return publishBookmarks("extend-selection", {
      ...state.bookmarks,
      selection: {
        anchorEventId: selection.anchorEventId,
        eventIds: [first, ...rest],
        focusEventId: target.id,
        kind: "events",
      },
    });
  };

  const clearSelection = (): StudioControllerActionResult =>
    publishBookmarks("clear-selection", {
      ...state.bookmarks,
      selection: { kind: "none" },
    });

  /** Resolve a brand-free boundary against the current chart, or refuse. */
  const resolveBoundary = (
    boundary: StudioBoundaryInput,
  ): StableBoundary | null => {
    switch (boundary.kind) {
      case "document-start":
      case "document-end":
        return { kind: boundary.kind };
      case "before-section":
      case "after-section":
      case "section-start":
      case "section-end": {
        const section = documentIndex.sections.get(boundary.sectionId);
        return section === undefined
          ? null
          : { kind: boundary.kind, sectionId: section.id };
      }
      case "before-measure":
      case "after-measure":
      case "measure-start":
      case "measure-end": {
        const measure = documentIndex.measures.get(boundary.measureId);
        return measure === undefined
          ? null
          : { kind: boundary.kind, measureId: measure.id };
      }
      case "before-event":
      case "after-event": {
        const event = documentIndex.events.get(boundary.eventId);
        return event === undefined
          ? null
          : { eventId: event.id, kind: boundary.kind };
      }
    }
  };

  const setInsertionPoint = (
    boundary: StudioBoundaryInput,
  ): StudioControllerActionResult => {
    const resolved = resolveBoundary(boundary);
    if (resolved === null) {
      return editRefusal(
        "set-insertion-point",
        "u1.target_missing",
        "The insertion boundary is no longer part of this chart.",
        ["boundary"],
      );
    }
    return publishBookmarks("set-insertion-point", {
      ...state.bookmarks,
      insertion: resolved,
    });
  };

  const setRange = (
    anchor: StudioBoundaryInput,
    focus: StudioBoundaryInput,
  ): StudioControllerActionResult => {
    const resolvedAnchor = resolveBoundary(anchor);
    const resolvedFocus = resolveBoundary(focus);
    if (resolvedAnchor === null || resolvedFocus === null) {
      return editRefusal(
        "set-range",
        "u1.target_missing",
        "A range boundary is no longer part of this chart.",
        ["range"],
      );
    }
    return publishBookmarks("set-range", {
      ...state.bookmarks,
      range: { anchor: resolvedAnchor, focus: resolvedFocus },
    });
  };

  const clearRange = (): StudioControllerActionResult =>
    publishBookmarks("clear-range", { ...state.bookmarks, range: null });

  const setQuickEntryDraft = (
    text: string,
    target: StudioBoundaryInput | null,
    status: "idle" | "invalid" | "ready",
    issueCodes: readonly string[],
  ): StudioControllerActionResult => {
    if (countCodePoints(text) > MAX_DRAFT_CODE_POINTS) {
      return editRefusal(
        "set-quick-entry-draft",
        "u1.draft_code_points_exceeded",
        "The quick-entry draft exceeds 4,096 Unicode code points.",
        ["text"],
      );
    }
    if (hasLoneSurrogate(text)) {
      return editRefusal(
        "set-quick-entry-draft",
        "u1.draft_unicode_invalid",
        "The quick-entry draft contains an unpaired surrogate.",
        ["text"],
      );
    }
    const resolved = target === null ? null : resolveBoundary(target);
    if (target !== null && resolved === null) {
      return editRefusal(
        "set-quick-entry-draft",
        "u1.quick_entry_target_missing",
        "The quick-entry target is no longer part of this chart.",
        ["target"],
      );
    }
    return apply("set-quick-entry-draft", (current) =>
      reduceEphemeralIntent({
        intent: {
          draft: {
            baseRevision: current.revision,
            issueCodes: Object.freeze([...issueCodes]),
            status,
            target: resolved,
            text,
          },
          kind: "set-quick-entry",
        },
        state: current,
      }),
    );
  };

  const clearQuickEntry = (): StudioControllerActionResult =>
    apply("clear-quick-entry", (current) =>
      reduceEphemeralIntent({
        intent: {
          draft: {
            baseRevision: current.revision,
            issueCodes: Object.freeze([]),
            status: "idle",
            target: current.quickEntry.target,
            text: "",
          },
          kind: "set-quick-entry",
        },
        state: current,
      }),
    );

  const deleteSelection = (
    incompleteReason: string | null = null,
  ): StudioControllerActionResult => {
    const selection = state.bookmarks.selection;
    if (selection.kind !== "events") {
      return editRefusal(
        "delete-selection",
        "u1.selection_empty",
        "Select at least one chord before deleting.",
        ["selection"],
      );
    }
    const index = documentIndex;
    const capacity = measureCapacity(state.document.meter);
    const removed = new Set<string>(selection.eventIds);
    const targets: DocumentNodeRef[] = [];
    const affected = new Map<string, readonly ChordEvent[]>();
    for (const eventId of selection.eventIds) {
      const location = index.events.get(eventId);
      if (location === undefined) {
        return editRefusal(
          "delete-selection",
          "u1.target_missing",
          "A selected chord is no longer part of this chart.",
          ["selection"],
        );
      }
      targets.push({ id: location.id, kind: "event" });
      const measure = index.measures.get(location.measureId);
      if (measure === undefined) {
        return editRefusal(
          "delete-selection",
          "u1.target_missing",
          "The owning measure is no longer part of this chart.",
          ["selection"],
        );
      }
      affected.set(
        location.measureId,
        measure.measure.events.filter((event) => !removed.has(event.id)),
      );
    }
    const [firstTarget, ...restTargets] = targets;
    if (firstTarget === undefined) {
      return editRefusal(
        "delete-selection",
        "u1.selection_empty",
        "Select at least one chord before deleting.",
        ["selection"],
      );
    }
    const deleteTargets: readonly [DocumentNodeRef, ...DocumentNodeRef[]] =
      Object.freeze([firstTarget, ...restTargets]);
    const completionUpdates: MeasureCompletionUpdate[] = [];
    for (const [measureId, events] of affected) {
      const completion = completionAfterEdit(events, capacity, incompleteReason);
      if (!completion.ok) {
        return editRefusal(
          "delete-selection",
          completion.code,
          "Deleting these chords leaves a measure that needs an explicit decision.",
          ["completionUpdates", measureId],
        );
      }
      const location = index.measures.get(measureId);
      if (location === undefined) continue;
      completionUpdates.push({
        completion: completion.completion,
        measureId: location.id,
      });
    }
    const command: DeleteDocumentNodesCommand = Object.freeze({
      ...commandEnvelope("studio-delete", "Delete chords"),
      completionUpdates: Object.freeze(completionUpdates),
      kind: "delete",
      targets: deleteTargets,
    });
    return apply("delete-selection", (current) =>
      runDocumentCommand({ command, dependencies, state: current }),
    );
  };

  const duplicateSelection = (
    destinationMeasureId: string | null = null,
    incompleteReason: string | null = null,
  ): StudioControllerActionResult => {
    const selection = state.bookmarks.selection;
    if (selection.kind !== "events") {
      return editRefusal(
        "duplicate-selection",
        "u1.selection_empty",
        "Select at least one chord before duplicating.",
        ["selection"],
      );
    }
    const index = documentIndex;
    const capacity = measureCapacity(state.document.meter);
    const targets: DocumentNodeRef[] = [];
    const copied: ChordEvent[] = [];
    for (const eventId of selection.eventIds) {
      const location = index.events.get(eventId);
      if (location === undefined) {
        return editRefusal(
          "duplicate-selection",
          "u1.target_missing",
          "A selected chord is no longer part of this chart.",
          ["selection"],
        );
      }
      targets.push({ id: location.id, kind: "event" });
      copied.push(location.event);
    }
    const [firstTarget, ...restTargets] = targets;
    const focusLocation = index.events.get(selection.focusEventId);
    if (firstTarget === undefined || focusLocation === undefined) {
      return editRefusal(
        "duplicate-selection",
        "u1.selection_empty",
        "Select at least one chord before duplicating.",
        ["selection"],
      );
    }
    const duplicateTargets: readonly [DocumentNodeRef, ...DocumentNodeRef[]] =
      Object.freeze([firstTarget, ...restTargets]);
    const measureId = destinationMeasureId ?? focusLocation.measureId;
    const destination = index.measures.get(measureId);
    if (destination === undefined) {
      return editRefusal(
        "duplicate-selection",
        "u1.target_missing",
        "The destination measure is no longer part of this chart.",
        ["destination"],
      );
    }
    const completion = completionAfterEdit(
      [...destination.measure.events, ...copied],
      capacity,
      incompleteReason,
    );
    if (!completion.ok) {
      return editRefusal(
        "duplicate-selection",
        completion.code,
        "The duplicated chords do not fit the destination measure.",
        ["destination", measureId],
      );
    }
    const command: DuplicateDocumentNodesCommand = Object.freeze({
      ...commandEnvelope("studio-duplicate", "Duplicate chords"),
      completionUpdates: Object.freeze([
        { completion: completion.completion, measureId: destination.id },
      ]),
      destination: Object.freeze({
        beforeEventId: null,
        kind: "event" as const,
        measureId: destination.id,
      }),
      kind: "duplicate",
      targets: duplicateTargets,
    });
    return apply("duplicate-selection", (current) =>
      runDocumentCommand({ command, dependencies, state: current }),
    );
  };

  const setEventDuration = (
    eventId: string,
    numerator: number,
    denominator: number,
    incompleteReason: string | null = null,
  ): StudioControllerActionResult => {
    const duration = makeBeatDuration({ denominator, numerator });
    if (!duration.ok) {
      return editRefusal(
        "set-event-duration",
        "u1.duration_invalid",
        "Enter an exact positive beat duration.",
        ["duration"],
      );
    }
    const index = documentIndex;
    const location = index.events.get(eventId);
    if (location === undefined) {
      return editRefusal(
        "set-event-duration",
        "u1.target_missing",
        "The chord is no longer part of this chart.",
        ["eventId"],
      );
    }
    const measure = index.measures.get(location.measureId);
    if (measure === undefined) {
      return editRefusal(
        "set-event-duration",
        "u1.target_missing",
        "The owning measure is no longer part of this chart.",
        ["measureId"],
      );
    }
    const projected = measure.measure.events.map((event) =>
      event.id === location.id
        ? { ...event, duration: duration.value }
        : event,
    );
    const completion = completionAfterEdit(
      projected,
      measureCapacity(state.document.meter),
      incompleteReason,
    );
    if (!completion.ok) {
      return editRefusal(
        "set-event-duration",
        completion.code,
        "The new duration changes the measure fill and needs an explicit decision.",
        ["completionUpdate"],
      );
    }
    const command: SetDurationCommand = Object.freeze({
      ...commandEnvelope("studio-duration", "Set chord duration"),
      completionUpdate: Object.freeze({
        completion: completion.completion,
        measureId: measure.id,
      }),
      duration: duration.value,
      eventId: location.id,
      kind: "set-duration",
    });
    return apply("set-event-duration", (current) =>
      runDocumentCommand({ command, dependencies, state: current }),
    );
  };

  /**
   * Publish the whole parsed preview as one atomic A0/U1 command. T0 is the
   * only syntax classifier; this surface only chooses the placement its stable
   * QuickEntry target already denotes, and never repairs the draft.
   */
  const applyQuickEntryPreview = (): StudioControllerActionResult => {
    const draft = state.quickEntry;
    if (draft.status !== "ready") {
      return editRefusal(
        "apply-quick-entry",
        "u1.quick_entry_lane_mismatch",
        "The whole-preview lane requires a complete parsed draft.",
        ["quickEntry", "status"],
      );
    }
    if (draft.baseRevision !== state.revision) {
      return editRefusal(
        "apply-quick-entry",
        "u1.quick_entry_stale_revision",
        "The quick-entry draft was written against an older revision.",
        ["quickEntry", "baseRevision"],
      );
    }
    const target = draft.target;
    if (target === null) {
      return editRefusal(
        "apply-quick-entry",
        "u1.quick_entry_target_missing",
        "The quick-entry draft has no insertion target.",
        ["quickEntry", "target"],
      );
    }
    const parsed = dependencies.parseChartText(
      draft.text,
      { meter: state.document.meter, mode: "fragment" },
      "ascii",
    );
    if (!parsed.ok) {
      return editRefusal(
        "apply-quick-entry",
        "u1.insertion_plan_not_atomic",
        "The draft cannot be inserted atomically; correct it or insert one recovered chord.",
        ["quickEntry", "text"],
      );
    }
    const snapshot: AtomicEditPlanQuickEntrySnapshot<
      "ready",
      "complete-draft"
    > = Object.freeze({
      baseRevision: draft.baseRevision,
      expectedLane: "complete-draft",
      expectedStatus: "ready",
      issueCodes: Object.freeze([...draft.issueCodes]),
      sourceText: draft.text,
      target,
    });
    const placement = completeDraftPlacement(parsed.draft, target);
    if (!placement.ok) {
      return editRefusal(
        "apply-quick-entry",
        placement.code,
        placement.message,
        ["quickEntry", "target"],
      );
    }
    const command: ApplyEditPlanCommand = Object.freeze({
      ...commandEnvelope("studio-quick-entry", "Insert chart text"),
      kind: "apply-edit-plan",
      plan: Object.freeze({
        kind: "insert-fragment" as const,
        placement: placement.placement,
        source: Object.freeze({
          kind: "complete-draft" as const,
          quickEntrySnapshot: snapshot,
          warningAcknowledgements: Object.freeze(
            parsed.warnings.map((warning) =>
              Object.freeze({ code: warning.code, range: warning.range }),
            ),
          ),
        }),
        voicingPolicy: A0_U1_NEW_EVENT_POLICY_ID,
      }),
    });
    return apply("apply-quick-entry", (current) =>
      runDocumentCommand({ command, dependencies, state: current }),
    );
  };

  /** Choose the exact placement the stable target already denotes. */
  const completeDraftPlacement = (
    draft: ChartTextDraft,
    target: StableBoundary,
  ):
    | Readonly<{ ok: true; placement: CompleteDraftInsertFragmentPlacement }>
    | Readonly<{ ok: false; code: StudioEditRefusalCode; message: string }> => {
    const index = documentIndex;
    const named = draft.sections.filter((section) => section.kind === "named");
    const measures = draft.sections.flatMap((section) => section.measures);
    const nonEmpty = measures.filter((measure) => measure.events.length > 0);
    const overfill = Object.freeze({
      code: "u1.insertion_plan_overfills_destination" as const,
      message: "The parsed material does not fit the chosen destination.",
      ok: false as const,
    });
    const notAtomic = Object.freeze({
      code: "u1.insertion_plan_not_atomic" as const,
      message: "The chosen boundary cannot accept this material atomically.",
      ok: false as const,
    });

    if (target.kind === "before-event" || target.kind === "after-event") {
      return overfill;
    }
    if (target.kind === "measure-start" || target.kind === "measure-end") {
      const measure = index.measures.get(target.measureId);
      if (measure === undefined) {
        return Object.freeze({
          code: "u1.quick_entry_target_missing" as const,
          message: "The target measure is no longer part of this chart.",
          ok: false as const,
        });
      }
      const singleMeasureDraft =
        named.length === 0 && measures.length === 1 && nonEmpty.length === 1;
      if (!singleMeasureDraft) {
        return nonEmpty.length === 0 ? notAtomic : overfill;
      }
      if (
        measure.measure.events.length !== 0 ||
        measure.measure.completion.kind !== "empty"
      ) {
        return overfill;
      }
      return Object.freeze({
        ok: true as const,
        placement: Object.freeze({
          beforeEventId: null,
          completionDeclarations: [
            { completion: { kind: "complete" }, measureId: measure.id },
          ] as const,
          kind: "into-measure" as const,
          layoutDisposition: "flatten-one-implicit-measure" as const,
          measureId: measure.id,
        }),
      });
    }

    if (
      target.kind === "section-start" ||
      target.kind === "section-end" ||
      target.kind === "before-measure" ||
      target.kind === "after-measure"
    ) {
      if (named.length !== 0 || draft.sections.length !== 1) return notAtomic;
      if (measures.length === 0) return notAtomic;
      const resolved = sectionInsertPoint(target);
      if (resolved === null) {
        return Object.freeze({
          code: "u1.quick_entry_target_missing" as const,
          message: "The target section is no longer part of this chart.",
          ok: false as const,
        });
      }
      return Object.freeze({
        ok: true as const,
        placement: Object.freeze({
          beforeMeasureId: resolved.beforeMeasureId,
          completionDeclarations: [] as const,
          kind: "into-section" as const,
          layoutDisposition: "preserve-implicit-measures" as const,
          sectionId: resolved.sectionId,
        }),
      });
    }

    if (named.length !== draft.sections.length || named.length === 0) {
      return notAtomic;
    }
    const beforeSectionId = documentInsertPoint(target);
    if (beforeSectionId === undefined) {
      return Object.freeze({
        code: "u1.quick_entry_target_missing" as const,
        message: "The target section is no longer part of this chart.",
        ok: false as const,
      });
    }
    const [firstDeclaration, ...restDeclarations] = named.map((section) =>
      Object.freeze({
        sourceSectionOrdinal: section.ordinal,
        voiceLeadingBoundary: "reset" as const,
      }),
    );
    if (firstDeclaration === undefined) return notAtomic;
    return Object.freeze({
      ok: true as const,
      placement: Object.freeze({
        beforeSectionId,
        completionDeclarations: [] as const,
        kind: "into-document" as const,
        layoutDisposition: "preserve-named-sections" as const,
        sectionDeclarations: [firstDeclaration, ...restDeclarations] as const,
      }),
    });
  };

  const sectionInsertPoint = (
    target: StableBoundary,
  ): Readonly<{ sectionId: SectionId; beforeMeasureId: MeasureId | null }> | null => {
    if (target.kind === "section-start" || target.kind === "section-end") {
      const section = documentIndex.sections.get(target.sectionId);
      if (section === undefined) return null;
      const first = section.section.measures[0];
      return Object.freeze({
        beforeMeasureId:
          target.kind === "section-start" && first !== undefined
            ? first.id
            : null,
        sectionId: section.id,
      });
    }
    if (target.kind !== "before-measure" && target.kind !== "after-measure") {
      return null;
    }
    const measure = documentIndex.measures.get(target.measureId);
    if (measure === undefined) return null;
    const section = documentIndex.sections.get(measure.sectionId);
    if (section === undefined) return null;
    if (target.kind === "before-measure") {
      return Object.freeze({
        beforeMeasureId: measure.id,
        sectionId: section.id,
      });
    }
    const next = section.section.measures[measure.measureIndex + 1];
    return Object.freeze({
      beforeMeasureId: next === undefined ? null : next.id,
      sectionId: section.id,
    });
  };

  const documentInsertPoint = (
    target: StableBoundary,
  ): SectionId | null | undefined => {
    if (target.kind === "document-end") return null;
    if (target.kind === "document-start") {
      const first = state.document.sections[0];
      return first === undefined ? null : first.id;
    }
    if (target.kind === "before-section") {
      const section = documentIndex.sections.get(target.sectionId);
      return section === undefined ? undefined : section.id;
    }
    if (target.kind === "after-section") {
      const section = documentIndex.sections.get(target.sectionId);
      if (section === undefined) return undefined;
      const next = state.document.sections[section.sectionIndex + 1];
      return next === undefined ? null : next.id;
    }
    return undefined;
  };

  /**
   * Rebuild one event around a newly parsed chord. Identity, exact duration,
   * and annotation are preserved byte-for-byte; only the chord changes. The
   * existing Auto voicing is kept rather than regenerated, and a bass that the
   * current voicing cannot carry refuses instead of being quietly rewritten.
   */
  const replacementEvent = (
    current: ChordEvent,
    chord: ChordSpec,
  ):
    | Readonly<{ ok: true; event: ChordEvent }>
    | Readonly<{ ok: false; code: StudioEditRefusalCode; message: string }> => {
    const voicing = current.voicing;
    const blocked = (message: string) =>
      Object.freeze({
        code: "u1.symbol_edit_blocked_manual_voicing" as const,
        message,
        ok: false as const,
      });
    if (voicing.mode !== "auto") {
      return blocked(
        "Stored pitches are exact; edit this chord in the inspector instead.",
      );
    }
    const fields = {
      annotation: current.annotation,
      duration: current.duration,
      id: current.id,
    };
    const bass = chord.bass;
    if (bass === null) {
      const event: ParsedChordEvent = {
        ...fields,
        chord: { ...chord, bass: null },
        voicing,
      };
      return Object.freeze({ event, ok: true as const });
    }
    // Rootless voicings always carry an external bass, so they can always
    // express a slash chord; a non-rootless voicing that generates no bass
    // at all cannot, and refuses rather than being quietly rewritten.
    if (voicing.family === "rootless-a" || voicing.family === "rootless-b") {
      const event: ParsedChordEvent = {
        ...fields,
        chord: { ...chord, bass },
        voicing: {
          bassPolicy: "external",
          family: voicing.family,
          mode: "auto",
          range: voicing.range,
          voiceCount: voicing.voiceCount,
        },
      };
      return Object.freeze({ event, ok: true as const });
    }
    const bassPolicy = voicing.bassPolicy;
    if (bassPolicy === "none") {
      return blocked(
        "This voicing generates no bass, so it cannot carry a slash chord.",
      );
    }
    const event: ParsedChordEvent = {
      ...fields,
      chord: { ...chord, bass },
      voicing: {
        bassPolicy,
        family: voicing.family,
        mode: "auto",
        range: voicing.range,
        voiceCount: voicing.voiceCount,
      },
    };
    return Object.freeze({ event, ok: true as const });
  };

  /**
   * Commit an inline symbol edit as one whole-event `set-chord` replacement, so
   * a root edit can never relabel stale pitches under a new symbol.
   */
  const applyInlineSymbol = (
    eventId: string,
    symbolText: string,
  ): StudioControllerActionResult => {
    const location = documentIndex.events.get(eventId);
    if (location === undefined) {
      return editRefusal(
        "apply-inline-symbol",
        "u1.target_missing",
        "The chord is no longer part of this chart.",
        ["eventId"],
      );
    }
    if (location.event.voicing.mode !== "auto") {
      return editRefusal(
        "apply-inline-symbol",
        "u1.symbol_edit_blocked_manual_voicing",
        "Stored pitches are exact; edit this chord in the inspector instead.",
        ["voicing"],
      );
    }
    if (countCodePoints(symbolText) > MAX_SYMBOL_DRAFT_CODE_POINTS) {
      return editRefusal(
        "apply-inline-symbol",
        "u1.symbol_draft_invalid",
        "The chord symbol exceeds its reviewed bound.",
        ["symbolText"],
      );
    }
    const parsed = parseChordSymbol(symbolText, "ascii");
    if (!parsed.ok) {
      return editRefusal(
        "apply-inline-symbol",
        "u1.symbol_draft_invalid",
        "The chord symbol did not parse; the typed text is unchanged.",
        ["symbolText"],
      );
    }
    const replacement = replacementEvent(location.event, parsed.chord);
    if (!replacement.ok) {
      return editRefusal(
        "apply-inline-symbol",
        replacement.code,
        replacement.message,
        ["voicing"],
      );
    }
    const command: SetChordCommand = Object.freeze({
      ...commandEnvelope("studio-set-chord", "Edit chord symbol"),
      eventId: location.id,
      kind: "set-chord",
      replacement: replacement.event,
    });
    return apply("apply-inline-symbol", (current) =>
      runDocumentCommand({ command, dependencies, state: current }),
    );
  };

  const insertMeasure = (
    sectionId: string,
    beforeMeasureId: string | null,
  ): StudioControllerActionResult => {
    const section = documentIndex.sections.get(sectionId);
    if (section === undefined) {
      return editRefusal(
        "insert-measure",
        "u1.target_missing",
        "The section is no longer part of this chart.",
        ["sectionId"],
      );
    }
    const before =
      beforeMeasureId === null
        ? null
        : documentIndex.measures.get(beforeMeasureId);
    if (beforeMeasureId !== null && before === undefined) {
      return editRefusal(
        "insert-measure",
        "u1.target_missing",
        "The reference measure is no longer part of this chart.",
        ["beforeMeasureId"],
      );
    }
    if (before !== undefined && before !== null && before.sectionId !== section.id) {
      return editRefusal(
        "insert-measure",
        "u1.move_destination_invalid",
        "The reference measure belongs to a different section.",
        ["beforeMeasureId"],
      );
    }
    const allocated = dependencies.stableIdFactory.next("measure");
    if (!allocated.ok) {
      return editRefusal(
        "insert-measure",
        "u1.target_missing",
        "A stable measure identity could not be allocated.",
        ["measureId"],
      );
    }
    const command: InsertDocumentNodeCommand = Object.freeze({
      ...commandEnvelope("studio-insert-measure", "Insert measure"),
      insertion: Object.freeze({
        completionUpdates: [] as const,
        destination: Object.freeze({
          beforeMeasureId: before === null || before === undefined
            ? null
            : before.id,
          kind: "measure" as const,
          sectionId: section.id,
        }),
        nodeKind: "measure" as const,
        value: {
          completion: { kind: "empty" },
          events: [],
          id: allocated.value,
        } as const,
      }),
      kind: "insert",
    });
    return apply("insert-measure", (current) =>
      runDocumentCommand({ command, dependencies, state: current }),
    );
  };

  const insertSection = (
    beforeSectionId: string | null,
    name: string,
  ): StudioControllerActionResult => {
    if (name.trim().length === 0) {
      return editRefusal(
        "insert-section",
        "u1.target_missing",
        "A new section needs a nonblank name.",
        ["name"],
      );
    }
    const before =
      beforeSectionId === null
        ? null
        : documentIndex.sections.get(beforeSectionId);
    if (beforeSectionId !== null && before === undefined) {
      return editRefusal(
        "insert-section",
        "u1.target_missing",
        "The reference section is no longer part of this chart.",
        ["beforeSectionId"],
      );
    }
    const sectionId = dependencies.stableIdFactory.next("section");
    const measureId = dependencies.stableIdFactory.next("measure");
    if (!sectionId.ok || !measureId.ok) {
      return editRefusal(
        "insert-section",
        "u1.target_missing",
        "A stable section identity could not be allocated.",
        ["sectionId"],
      );
    }
    const command: InsertDocumentNodeCommand = Object.freeze({
      ...commandEnvelope("studio-insert-section", "Insert section"),
      insertion: Object.freeze({
        completionUpdates: [] as const,
        destination: Object.freeze({
          beforeSectionId: before === null || before === undefined
            ? null
            : before.id,
          kind: "section" as const,
        }),
        nodeKind: "section" as const,
        value: Object.freeze({
          annotation: "",
          id: sectionId.value,
          keyOverride: null,
          measures: [
            { completion: { kind: "empty" }, events: [], id: measureId.value },
          ] as const,
          name,
          voiceLeadingBoundary: "reset" as const,
        }),
      }),
      kind: "insert",
    });
    return apply("insert-section", (current) =>
      runDocumentCommand({ command, dependencies, state: current }),
    );
  };

  /**
   * Move the contiguous single-measure selection one slot. Reordering inside a
   * measure preserves its exact total, so its completion is restated unchanged;
   * a cross-measure move recomputes both measures and refuses rather than
   * overfilling.
   */
  const moveSelection = (
    direction: "previous" | "next",
    incompleteReason: string | null = null,
  ): StudioControllerActionResult => {
    const action = direction === "previous" ? "move-previous" : "move-next";
    const selection = state.bookmarks.selection;
    if (selection.kind !== "events") {
      return editRefusal(
        action,
        "u1.selection_empty",
        "Select at least one chord before moving.",
        ["selection"],
      );
    }
    const locations = selection.eventIds.map((eventId) =>
      documentIndex.events.get(eventId),
    );
    if (locations.some((location) => location === undefined)) {
      return editRefusal(
        action,
        "u1.target_missing",
        "A selected chord is no longer part of this chart.",
        ["selection"],
      );
    }
    const resolved = locations.filter(
      (location): location is NonNullable<typeof location> =>
        location !== undefined,
    );
    const first = resolved[0];
    const last = resolved.at(-1);
    if (first === undefined || last === undefined) {
      return editRefusal(
        action,
        "u1.selection_empty",
        "Select at least one chord before moving.",
        ["selection"],
      );
    }
    if (resolved.some((location) => location.measureId !== first.measureId)) {
      return editRefusal(
        action,
        "u1.move_destination_invalid",
        "Move acts on chords inside one measure at a time.",
        ["selection"],
      );
    }
    const sourceMeasure = documentIndex.measures.get(first.measureId);
    const section = documentIndex.sections.get(first.sectionId);
    if (sourceMeasure === undefined || section === undefined) {
      return editRefusal(
        action,
        "u1.target_missing",
        "The owning measure is no longer part of this chart.",
        ["selection"],
      );
    }
    const events = sourceMeasure.measure.events;
    const indices = resolved.map((location) => location.eventIndex);
    const lowest = Math.min(...indices);
    const highest = Math.max(...indices);
    if (highest - lowest + 1 !== resolved.length) {
      return editRefusal(
        action,
        "u1.move_destination_invalid",
        "Move acts on one contiguous run of chords.",
        ["selection"],
      );
    }
    const moved = new Set(resolved.map((location) => location.id));
    const targets = resolved.map((location) => ({
      id: location.id,
      kind: "event" as const,
    }));
    const [firstTarget, ...restTargets] = targets;
    if (firstTarget === undefined) {
      return editRefusal(
        action,
        "u1.selection_empty",
        "Select at least one chord before moving.",
        ["selection"],
      );
    }
    const moveTargets: readonly [DocumentNodeRef, ...DocumentNodeRef[]] =
      Object.freeze([firstTarget, ...restTargets]);

    const withinMeasure =
      direction === "previous" ? lowest > 0 : highest < events.length - 1;
    if (withinMeasure) {
      const anchorIndex = direction === "previous" ? lowest - 1 : highest + 2;
      const anchor = events[anchorIndex];
      const command: MoveDocumentNodesCommand = Object.freeze({
        ...commandEnvelope("studio-move", "Move chords"),
        completionUpdates: Object.freeze([
          {
            completion: sourceMeasure.measure.completion,
            measureId: sourceMeasure.id,
          },
        ]),
        destination: Object.freeze({
          beforeEventId: anchor === undefined ? null : anchor.id,
          kind: "event" as const,
          measureId: sourceMeasure.id,
        }),
        kind: "move",
        targets: moveTargets,
      });
      return apply(action, (current) =>
        runDocumentCommand({ command, dependencies, state: current }),
      );
    }

    const neighbourIndex =
      direction === "previous"
        ? sourceMeasure.measureIndex - 1
        : sourceMeasure.measureIndex + 1;
    const neighbour = section.section.measures[neighbourIndex];
    if (neighbour === undefined) {
      return editRefusal(
        action,
        "u1.move_destination_invalid",
        "There is no adjacent measure in this section to move into.",
        ["destination"],
      );
    }
    const capacity = measureCapacity(state.document.meter);
    const sourceAfter = events.filter((event) => !moved.has(event.id));
    const movedEvents = resolved.map((location) => location.event);
    const destinationAfter =
      direction === "previous"
        ? [...neighbour.events, ...movedEvents]
        : [...movedEvents, ...neighbour.events];
    const sourceCompletion = completionAfterEdit(
      sourceAfter,
      capacity,
      incompleteReason,
    );
    if (!sourceCompletion.ok) {
      return editRefusal(
        action,
        sourceCompletion.code,
        "Moving these chords leaves the source measure needing an explicit decision.",
        ["completionUpdates", sourceMeasure.id],
      );
    }
    const destinationCompletion = completionAfterEdit(
      destinationAfter,
      capacity,
      incompleteReason,
    );
    if (!destinationCompletion.ok) {
      return editRefusal(
        action,
        destinationCompletion.code,
        "The adjacent measure cannot accept these chords.",
        ["completionUpdates", neighbour.id],
      );
    }
    const command: MoveDocumentNodesCommand = Object.freeze({
      ...commandEnvelope("studio-move", "Move chords"),
      completionUpdates: Object.freeze([
        {
          completion: sourceCompletion.completion,
          measureId: sourceMeasure.id,
        },
        {
          completion: destinationCompletion.completion,
          measureId: neighbour.id,
        },
      ]),
      destination: Object.freeze({
        beforeEventId:
          direction === "previous" ? null : (neighbour.events[0]?.id ?? null),
        kind: "event" as const,
        measureId: neighbour.id,
      }),
      kind: "move",
      targets: moveTargets,
    });
    return apply(action, (current) =>
      runDocumentCommand({ command, dependencies, state: current }),
    );
  };

  /** T0 is the only syntax classifier; U1 reports its codes without rewriting. */
  const previewChartText = (text: string): StudioQuickEntryPreview => {
    if (text.length === 0) {
      return Object.freeze({ issueCodes: Object.freeze([]), status: "idle" });
    }
    const parsed = dependencies.parseChartText(
      text,
      { meter: state.document.meter, mode: "fragment" },
      "ascii",
    );
    if (parsed.ok) {
      return Object.freeze({ issueCodes: Object.freeze([]), status: "ready" });
    }
    return Object.freeze({
      issueCodes: Object.freeze(
        parsed.diagnostics
          .slice(0, MAX_PREVIEW_ISSUE_CODES)
          .map((diagnostic) => diagnostic.code),
      ),
      status: "invalid",
    });
  };

  /**
   * Accept the exact beat text a field carries ("3" or "5/2") and delegate to
   * the exact-rational duration command. Parsing lives here so the UI performs
   * no musical arithmetic of its own.
   */
  const setEventDurationText = (
    eventId: string,
    beatText: string,
    incompleteReason: string | null = null,
  ): StudioControllerActionResult => {
    const trimmed = beatText.trim();
    const match = /^(\d{1,10})(?:\/(\d{1,10}))?$/u.exec(trimmed);
    const numerator = match?.[1];
    if (match === null || numerator === undefined) {
      return editRefusal(
        "set-event-duration",
        "u1.duration_invalid",
        "Enter an exact positive beat value such as 2 or 5/2.",
        ["duration"],
      );
    }
    const denominator = match[2] ?? "1";
    return setEventDuration(
      eventId,
      Number(numerator),
      Number(denominator),
      incompleteReason,
    );
  };

  /**
   * Move the contiguous single-measure selection to an explicit destination.
   * Both affected measures are recomputed exactly; nothing is rebalanced.
   */
  const moveSelectionTo = (
    measureId: string,
    beforeEventId: string | null = null,
    incompleteReason: string | null = null,
  ): StudioControllerActionResult => {
    const selection = state.bookmarks.selection;
    if (selection.kind !== "events") {
      return editRefusal(
        "move-to-measure",
        "u1.selection_empty",
        "Select at least one chord before moving.",
        ["selection"],
      );
    }
    const destination = documentIndex.measures.get(measureId);
    if (destination === undefined) {
      return editRefusal(
        "move-to-measure",
        "u1.target_missing",
        "The destination measure is no longer part of this chart.",
        ["measureId"],
      );
    }
    const anchor =
      beforeEventId === null ? null : documentIndex.events.get(beforeEventId);
    if (beforeEventId !== null && anchor === undefined) {
      return editRefusal(
        "move-to-measure",
        "u1.target_missing",
        "The drop position is no longer part of this chart.",
        ["beforeEventId"],
      );
    }
    if (anchor !== null && anchor !== undefined && anchor.measureId !== destination.id) {
      return editRefusal(
        "move-to-measure",
        "u1.move_destination_invalid",
        "The drop position belongs to a different measure.",
        ["beforeEventId"],
      );
    }
    const resolved: EventLocation[] = [];
    for (const eventId of selection.eventIds) {
      const location = documentIndex.events.get(eventId);
      if (location === undefined) {
        return editRefusal(
          "move-to-measure",
          "u1.target_missing",
          "A selected chord is no longer part of this chart.",
          ["selection"],
        );
      }
      resolved.push(location);
    }
    const first = resolved[0];
    if (first === undefined) {
      return editRefusal(
        "move-to-measure",
        "u1.selection_empty",
        "Select at least one chord before moving.",
        ["selection"],
      );
    }
    if (resolved.some((location) => location.measureId !== first.measureId)) {
      return editRefusal(
        "move-to-measure",
        "u1.move_destination_invalid",
        "Move acts on chords inside one measure at a time.",
        ["selection"],
      );
    }
    const source = documentIndex.measures.get(first.measureId);
    if (source === undefined) {
      return editRefusal(
        "move-to-measure",
        "u1.target_missing",
        "The owning measure is no longer part of this chart.",
        ["selection"],
      );
    }
    const indices = resolved.map((location) => location.eventIndex);
    if (Math.max(...indices) - Math.min(...indices) + 1 !== resolved.length) {
      return editRefusal(
        "move-to-measure",
        "u1.move_destination_invalid",
        "Move acts on one contiguous run of chords.",
        ["selection"],
      );
    }
    const targets = resolved.map((location) => ({
      id: location.id,
      kind: "event" as const,
    }));
    const [firstTarget, ...restTargets] = targets;
    if (firstTarget === undefined) {
      return editRefusal(
        "move-to-measure",
        "u1.selection_empty",
        "Select at least one chord before moving.",
        ["selection"],
      );
    }
    const moveToTargets: readonly [DocumentNodeRef, ...DocumentNodeRef[]] =
      Object.freeze([firstTarget, ...restTargets]);
    const capacity = measureCapacity(state.document.meter);
    const moved = new Set(resolved.map((location) => location.id));
    const movedEvents = resolved.map((location) => location.event);
    const sameMeasure = source.id === destination.id;
    const remaining = source.measure.events.filter(
      (event) => !moved.has(event.id),
    );
    const destinationBase = sameMeasure
      ? remaining
      : destination.measure.events;
    const anchorIndex =
      anchor === null || anchor === undefined
        ? destinationBase.length
        : Math.max(
            0,
            destinationBase.findIndex((event) => event.id === anchor.id),
          );
    const destinationAfter = [
      ...destinationBase.slice(0, anchorIndex),
      ...movedEvents,
      ...destinationBase.slice(anchorIndex),
    ];
    const updates: MeasureCompletionUpdate[] = [];
    if (sameMeasure) {
      updates.push({
        completion: source.measure.completion,
        measureId: source.id,
      });
    } else {
      const sourceCompletion = completionAfterEdit(
        remaining,
        capacity,
        incompleteReason,
      );
      if (!sourceCompletion.ok) {
        return editRefusal(
          "move-to-measure",
          sourceCompletion.code,
          "Moving these chords leaves the source measure needing an explicit decision.",
          ["completionUpdates", source.id],
        );
      }
      const destinationCompletion = completionAfterEdit(
        destinationAfter,
        capacity,
        incompleteReason,
      );
      if (!destinationCompletion.ok) {
        return editRefusal(
          "move-to-measure",
          destinationCompletion.code,
          "The destination measure cannot accept these chords.",
          ["completionUpdates", destination.id],
        );
      }
      updates.push(
        { completion: sourceCompletion.completion, measureId: source.id },
        {
          completion: destinationCompletion.completion,
          measureId: destination.id,
        },
      );
    }
    const command: MoveDocumentNodesCommand = Object.freeze({
      ...commandEnvelope("studio-move-to", "Move chords"),
      completionUpdates: Object.freeze(updates),
      destination: Object.freeze({
        beforeEventId:
          anchor === null || anchor === undefined ? null : anchor.id,
        kind: "event" as const,
        measureId: destination.id,
      }),
      kind: "move",
      targets: moveToTargets,
    });
    return apply("move-to-measure", (current) =>
      runDocumentCommand({ command, dependencies, state: current }),
    );
  };

  /** Section text coalesces exactly like the accepted A0 text policy. */
  const setSectionText = (
    action: StudioControllerAction,
    sectionId: string,
    field: "section-name" | "section-annotation",
    value: string,
  ): StudioControllerActionResult => {
    const section = documentIndex.sections.get(sectionId);
    if (section === undefined) {
      return editRefusal(
        action,
        "u1.target_missing",
        "The section is no longer part of this chart.",
        ["sectionId"],
      );
    }
    const target =
      field === "section-name"
        ? ({ kind: "section-name", sectionId: section.id } as const)
        : ({ kind: "section-annotation", sectionId: section.id } as const);
    const key =
      field === "section-name"
        ? `section:${String(section.id)}:name`
        : `section:${String(section.id)}:annotation`;
    const command: SetTextCommand = Object.freeze({
      ...commandEnvelope(
        field === "section-name" ? "studio-section-name" : "studio-section-note",
        field === "section-name" ? "Rename section" : "Annotate section",
      ),
      coalescing: Object.freeze({
        focusSessionId: `studio-${field}-${String(section.id)}`,
        key,
        kind: "text-field" as const,
      }),
      kind: "set-text",
      target,
      value,
    });
    return apply(action, (current) =>
      runDocumentCommand({ command, dependencies, state: current }),
    );
  };

  const renameSection = (
    sectionId: string,
    name: string,
  ): StudioControllerActionResult =>
    setSectionText("rename-section", sectionId, "section-name", name);

  const annotateSection = (
    sectionId: string,
    annotation: string,
  ): StudioControllerActionResult =>
    setSectionText(
      "annotate-section",
      sectionId,
      "section-annotation",
      annotation,
    );

  /**
   * Voice leading across a section boundary is an explicit musical choice, so
   * it travels as its own one-field `set-section` command.
   */
  const setSectionBoundary = (
    sectionId: string,
    voiceLeadingBoundary: "reset" | "continue",
  ): StudioControllerActionResult => {
    const section = documentIndex.sections.get(sectionId);
    if (section === undefined) {
      return editRefusal(
        "set-section-boundary",
        "u1.target_missing",
        "The section is no longer part of this chart.",
        ["sectionId"],
      );
    }
    const command: SetSectionCommand = Object.freeze({
      ...commandEnvelope("studio-section-boundary", "Set voice leading boundary"),
      kind: "set-section",
      patch: Object.freeze({ voiceLeadingBoundary }),
      sectionId: section.id,
    });
    return apply("set-section-boundary", (current) =>
      runDocumentCommand({ command, dependencies, state: current }),
    );
  };

  const setMeasureCompletion = (
    measureId: string,
    completion: MeasureCompletion,
  ): StudioControllerActionResult => {
    const index = documentIndex;
    const location = index.measures.get(measureId);
    if (location === undefined) {
      return editRefusal(
        "set-measure-completion",
        "u1.target_missing",
        "The measure is no longer part of this chart.",
        ["measureId"],
      );
    }
    const command: SetMeasureCompletionCommand = Object.freeze({
      ...commandEnvelope("studio-completion", "Set measure completion"),
      completion,
      kind: "set-measure-completion",
      measureId: location.id,
    });
    return apply("set-measure-completion", (current) =>
      runDocumentCommand({ command, dependencies, state: current }),
    );
  };

  return Object.freeze({
    getSnapshot: () => snapshot,
    annotateSection,
    applyInlineSymbol,
    applyQuickEntryPreview,
    clearQuickEntry,
    insertMeasure,
    insertSection,
    moveSelection,
    moveSelectionTo,
    previewChartText,
    renameSection,
    setSectionBoundary,
    clearRange,
    clearSelection,
    deleteSelection,
    duplicateSelection,
    extendSelectionTo,
    selectEvent,
    setEventDuration,
    setEventDurationText,
    setInsertionPoint,
    setMeasureCompletion,
    setQuickEntryDraft,
    setRange,
    subscribe: (listener: StudioControllerListener) => {
      listeners.add(listener);
      let subscribed = true;
      return () => {
        if (!subscribed) return;
        subscribed = false;
        listeners.delete(listener);
      };
    },
    setTitle,
    undo: () => apply("undo", (current) => undoDocumentCommand({ state: current })),
    redo: () => apply("redo", (current) => redoDocumentCommand({ state: current })),
    setRailCollapsed,
    toggleRail: (side: StudioRailSide) =>
      setRailCollapsed(
        side,
        side === "left"
          ? !state.panels.leftRailCollapsed
          : !state.panels.rightRailCollapsed,
      ),
  });
}

export function createStudioController(
  options: StudioControllerOptions = {},
): StudioControllerCreationResult {
  const bootstrap = createStudioBootstrap();
  if (!bootstrap.ok) return bootstrap;
  try {
    return Object.freeze({
      ok: true,
      controller: makeStudioController(
        bootstrap.value.state,
        bootstrap.value.dependencies,
        options,
      ),
    });
  } catch {
    return Object.freeze({
      ok: false,
      refusal: Object.freeze({
        code: "studio.controller.unexpected_failure",
        message: "The application controller could not derive its initial view.",
        recoveryAction:
          "Run the A0 and studio-controller gates before publishing this build.",
        issues: Object.freeze([] as const),
      }),
    });
  }
}
