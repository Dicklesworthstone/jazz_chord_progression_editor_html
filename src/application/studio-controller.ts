import {
  addBeatValues,
  compareBeatValues,
  makeBeatDuration,
  makeBeatPosition,
  measureCapacity,
  subtractBeatValues,
  type BeatDuration,
  type BeatPosition,
  type BeatValue,
  type ChordEvent,
  type ChordEventId,
  type ChordSpec,
  type MeasureCompletion,
  type MidiPitch,
  type ParsedChordEvent,
  type MeasureId,
  type SectionId,
} from "../domain";
import {
  A0_U1_NEW_EVENT_POLICY_ID,
  A0_U1_RECOVERED_CHORD_LAYOUT_LOSS_ACKNOWLEDGEMENT,
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
  acceptTransportNotification,
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
import type { StudioAudioGesture, StudioAudioPort } from "./studio-audio";
import {
  compileStudioPlaybackPlan,
  studioPlanIsPlayable,
} from "./studio-playback";
import {
  createStudioBootstrap,
  type StudioBootstrapRefusal,
} from "./studio-bootstrap";
import type { StudioAnalysisFrame } from "./studio-analysis";
import {
  formatExactBeatLabel,
  selectStudioViewModel,
  type StudioBoundaryDescriptor,
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
  "u1.range_boundary_invalid",
  "u1.split_partition_invalid",
  "u1.join_requires_adjacent_events",
  "u1.join_right_annotation_not_empty",
  "u1.section_split_boundary_invalid",
  "u1.measure_split_boundary_invalid",
  "u1.playback_unavailable",
  "u1.playback_refused",
  "u1.playback_requires_a_chord",
  "u1.section_join_requires_adjacent_sections",
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
  | "move-to-measure"
  | "set-range-edge"
  | "move-following-events"
  | "split-event-duration"
  | "join-event-durations"
  | "split-section"
  | "join-sections"
  | "split-at-bar"
  | "play-progression"
  | "pause-progression"
  | "stop-progression"
  | "transport-notification"
  | "insert-recovered-chord"
  | "acknowledge-focus";

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
export type StudioBoundaryInput = StudioBoundaryDescriptor;

export type StudioQuickEntryPreview = Readonly<{
  status: "idle" | "invalid" | "ready";
  issueCodes: readonly string[];
}>;

/**
 * The five insertion-plan statements. Exactly one is true of any draft and
 * destination, and the classification is presentation, not publication: A0
 * remains the sole publisher and its receipt or refusal wins at dispatch.
 */
export type StudioInsertionPlanStatement =
  | "no-draft"
  | "fits-measure"
  | "completes-measures"
  | "incomplete-requires-confirmation"
  | "overfill-requires-split"
  | "not-atomic-refusal";

export type StudioInsertionPlan = Readonly<{
  statement: StudioInsertionPlanStatement;
  committable: boolean;
  /** The authorized plan kind a committable statement will publish. */
  planKind: "insert-fragment" | null;
  /**
   * Reported separately from the statement, because `completes-measures`
   * reaches either a section or the document: a preview must never claim a
   * placement it will not perform.
   */
  placement: "into-measure" | "into-section" | "into-document" | null;
  /** The U1 refusal code a blocked statement carries, or null. */
  blockedReason: string | null;
  /**
   * The reviewed resolution tokens, not sentences. A blocked statement is
   * never resolved silently, and the surface owns the wording.
   */
  resolutions: readonly string[];
}>;

/**
 * The reviewed statement tables. They restate the U1 insertion-plan authority
 * rather than importing it: the contract module is specification-only and must
 * stay out of the release graph, so a static test proves these equal it.
 */
const BLOCKED_REASON_BY_STATEMENT: Readonly<
  Record<StudioInsertionPlanStatement, string | null>
> = Object.freeze({
  "completes-measures": null,
  "fits-measure": null,
  "incomplete-requires-confirmation": "u1.insertion_plan_requires_confirmation",
  "no-draft": null,
  "not-atomic-refusal": "u1.insertion_plan_not_atomic",
  "overfill-requires-split": "u1.insertion_plan_overfills_destination",
});

const RESOLUTIONS_BY_STATEMENT: Readonly<
  Record<StudioInsertionPlanStatement, readonly string[]>
> = Object.freeze({
  "completes-measures": Object.freeze(["insert-parsed-preview"]),
  "fits-measure": Object.freeze(["insert-parsed-preview"]),
  "incomplete-requires-confirmation": Object.freeze([
    "complete-the-final-measure",
    "insert-one-recovered-chord-into-a-measure",
    "cancel",
  ]),
  "no-draft": Object.freeze([]),
  "not-atomic-refusal": Object.freeze(["correct-the-draft", "cancel"]),
  "overfill-requires-split": Object.freeze([
    "choose-an-empty-measure-or-structural-boundary",
    "shorten-the-draft",
    "cancel",
  ]),
});

/**
 * One preview row. A successful draft yields one `valid` row per parsed event;
 * a refused draft yields one `insertable` row per chord T0 published in its
 * recoverable lane, plus one `invalid` row per diagnostic, and no `valid` rows.
 * Every `sourceText` is the exact draft slice, never a repaired guess.
 */
export type StudioQuickEntryToken = Readonly<{
  ordinal: number;
  sourceText: string;
  state: "valid" | "invalid" | "insertable";
  diagnosticCode: string | null;
  /**
   * The T0 diagnostic's own draft range, surfaced verbatim beside its code so
   * a reader can find the offending characters in a long draft. Null on rows
   * that carry no diagnostic.
   */
  diagnosticRange: Readonly<{ start: number; end: number }> | null;
  /** The T0 recoverable-chord ordinal an `insertable` row can be inserted by. */
  globalOrdinal: number | null;
  durationLabel: string | null;
  /** T0 could not resolve a duration; the caller must supply one exactly. */
  requiresDuration: boolean;
  /** Inserting it leaves the measure short, so a reason must be declared. */
  requiresCompletionReason: boolean;
  blockedReason: string | null;
}>;

export type StudioRecoveredChordLane = Readonly<{
  available: boolean;
  /** The literal acknowledgement A0 requires; the caller must return it. */
  acknowledgement: string;
  measureLabel: string | null;
  remainderLabel: string | null;
  unavailableReason: string | null;
}>;

/**
 * What the preview bound left out. The bound is a rendering limit, never a
 * musical or correctness cutoff, so the rows it drops are stated rather than
 * silently absent: `u1.preview_token_limit` is the declared U1 code for exactly
 * this state.
 */
export type StudioPreviewTruncation = Readonly<{
  code: "u1.preview_token_limit";
  shownTokens: number;
  totalTokens: number;
  message: string;
}>;

/** One bounded T0 parse answers both the token rows and the recovery lane. */
export type StudioDraftPreview = Readonly<{
  /**
   * Which lane the draft belongs to: a parsed draft is `complete-draft`, a
   * draft T0 refused is `recovered-chord`, and a draft that never reached T0 —
   * idle, or refused by a U1 preflight guard — belongs to neither.
   */
  lane: "complete-draft" | "recovered-chord" | null;
  tokens: readonly StudioQuickEntryToken[];
  recovery: StudioRecoveredChordLane;
  /**
   * Draft section names that already name a document section. Document
   * placement is insert-only, so a collision warns and still creates a new
   * section; v1 defines no section merge.
   */
  sectionNameCollisionWarnings: readonly string[];
  /** Null when every row the parse produced is shown. */
  truncation: StudioPreviewTruncation | null;
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
  /**
   * Confirm that the surface has rendered the focus A0 asked for. A0 clears
   * the request only for the sequence it published, so a late or duplicated
   * acknowledgement is ignored rather than clearing a newer request.
   */
  readonly acknowledgeFocus: (
    sequence: number,
  ) => StudioControllerActionResult;
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
  /**
   * Publish the completion a measure's own exact fill implies. A short measure
   * refuses without a stated reason instead of being silently rebalanced.
   */
  readonly declareMeasureCompletion: (
    measureId: string,
    reason?: string | null,
  ) => StudioControllerActionResult;
  readonly applyQuickEntryPreview: () => StudioControllerActionResult;
  /** Read-only T0 classification for the draft preview; changes no state. */
  readonly previewChartText: (text: string) => StudioQuickEntryPreview;
  /**
   * State exactly one of the five insertion-plan statements for the current
   * draft and its target. Read-only: it dispatches nothing and mutates
   * nothing, and it never resolves a blocked statement on the caller's behalf.
   */
  readonly previewInsertionPlan: () => StudioInsertionPlan;
  /**
   * Read-only preview rows for the current draft plus the recovered-chord
   * lane's state against the current destination. It dispatches nothing.
   */
  readonly previewQuickEntryDraft: () => StudioDraftPreview;
  /**
   * Publish exactly one recovered chord. The acknowledgement is the literal the
   * lane requires, and a `requires-caller` duration must arrive as exact beat
   * text; neither is ever supplied on the caller's behalf.
   */
  readonly insertRecoveredChord: (
    globalOrdinal: number,
    callerBeatText?: string | null,
    acknowledgement?: string,
    incompleteReason?: string | null,
  ) => StudioControllerActionResult;
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
  /**
   * Move every chord after the selection focus, inside its own measure, into
   * the next measure. This is the named resolution for an overfilled bar; it
   * is one `move` command and never a hidden pair of commands.
   */
  readonly moveFollowingEvents: (
    incompleteReason?: string | null,
  ) => StudioControllerActionResult;
  /** The four remaining atomic plan kinds; each is exactly one command. */
  readonly splitEventDuration: (
    eventId: string,
    firstBeatText: string,
    secondBeatText?: string,
  ) => StudioControllerActionResult;
  readonly joinEventDurations: (
    leftEventId: string,
  ) => StudioControllerActionResult;
  readonly splitSection: (
    sectionId: string,
    beforeMeasureId: string,
    name: string,
  ) => StudioControllerActionResult;
  /**
   * Split a bar at an interior chord boundary. Each reason is required only if
   * that side ends short of a full bar; a side that exactly fills the bar is
   * declared complete and ignores its reason.
   */
  readonly splitAtBar: (
    beforeEventId: string,
    retainedReason?: string | null,
    suffixReason?: string | null,
  ) => StudioControllerActionResult;
  /**
   * Play the chart from its start. The gesture receipt must come from a real
   * trusted event: browsers gate the audio graph on one, and fabricating it
   * would make the refusal dishonest rather than making the sound work.
   */
  readonly playProgression: (
    gesture: StudioAudioGesture,
  ) => StudioControllerActionResult;
  readonly pauseProgression: () => StudioControllerActionResult;
  readonly stopProgression: () => StudioControllerActionResult;
  /**
   * Display-only live playhead label in the exact-beat format the transport
   * view already uses. The UI's animation frame reads this while the transport
   * status says `playing`; it is interpolation for display, never state — the
   * published notification remains the only writer of `transport.playhead`.
   * Null when no audio port is wired.
   */
  readonly readTransportPlayheadLabel: () => string | null;
  /** Display-only analyzer frame from the audio tap; null when unavailable. */
  readonly readTransportAnalysisFrame: () => StudioAnalysisFrame | null;
  /**
   * Display-only pitch classes of one plan event from the last compiled run,
   * for the analyzer's expected-vs-heard comparison. Never musical authority.
   */
  readonly readEventPitchClasses: (
    eventId: string,
  ) => readonly number[] | null;
  readonly joinSections: (
    leftSectionId: string,
  ) => StudioControllerActionResult;
  /** Set one range edge from a stable boundary, keeping the other edge exact. */
  readonly setRangeEdge: (
    edge: "start" | "end",
    boundary: StudioBoundaryInput,
  ) => StudioControllerActionResult;
  /**
   * Set one range edge from exact rational beat text. The controller resolves
   * the text against the chart so no surface performs musical arithmetic.
   */
  readonly setRangeEdgeBeat: (
    edge: "start" | "end",
    beatText: string,
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
    "u1.range_boundary_invalid":
      "Enter an exact beat such as 4 or 5/2 that falls on a chord or bar boundary.",
    "u1.split_partition_invalid":
      "Enter two exact durations whose sum equals the original duration.",
    "u1.join_requires_adjacent_events":
      "Select a chord that has a following chord in the same measure.",
    "u1.join_right_annotation_not_empty":
      "Clear the following chord's note before joining the two durations.",
    "u1.section_split_boundary_invalid":
      "Split a section at a measure after its first measure.",
    "u1.measure_split_boundary_invalid":
      "Split a bar at a chord after its first chord.",
    "u1.playback_unavailable":
      "Open this chart in a browser that allows audio.",
    "u1.playback_refused":
      "Fix the chord the message names, then play again.",
    "u1.playback_requires_a_chord":
      "Type a chord such as Dm7 into quick entry, then press Play.",
    "u1.section_join_requires_adjacent_sections":
      "Select a section that has a following section to join.",
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
/** Rendered preview rows are bounded; no wall clock is consulted anywhere. */
const MAX_PREVIEW_TOKENS = 2_048;
const MAX_SELECTED_EVENTS = 8_192;
const MAX_PREVIEW_ISSUE_CODES = 64;
const MAX_SYMBOL_DRAFT_CODE_POINTS = 256;

/**
 * State what the preview bound left out, or null when nothing was left out.
 * The counts are of rows the parse produced, so the reader can tell how much
 * of the draft the preview is not showing.
 */
function previewTruncation(
  recoverableTotal: number,
  recoverableShown: number,
  diagnosticTotal: number,
  diagnosticsShown: number,
): StudioPreviewTruncation | null {
  const totalTokens = recoverableTotal + diagnosticTotal;
  const shownTokens = recoverableShown + diagnosticsShown;
  if (shownTokens >= totalTokens) return null;
  const hidden = totalTokens - shownTokens;
  return Object.freeze({
    code: "u1.preview_token_limit" as const,
    message:
      `The preview shows the first ${String(shownTokens)} of `
      + `${String(totalTokens)} rows; ${String(hidden)} more are not listed. `
      + "Shorten the draft to see them.",
    shownTokens,
    totalTokens,
  });
}

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

/** Only the exact duration is read, so parsed draft events qualify too. */
function totalDuration(
  events: readonly Readonly<{ duration: BeatDuration }>[],
): BeatDuration | null {
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
 * State a measure fill in exact rationals.
 *
 * A duration notice that only says "this changes the fill" leaves the reader
 * to redo the arithmetic; the reviewed interaction state requires the current
 * fill, the resulting fill, and the capacity to be stated exactly.
 */
function exactFillSentence(
  current: BeatDuration | null,
  resulting: BeatDuration | null,
  capacity: BeatDuration,
): string {
  const currentLabel =
    current === null ? "none" : formatExactBeatLabel(current);
  const resultingLabel =
    resulting === null ? "not measurable" : formatExactBeatLabel(resulting);
  return `This measure holds ${currentLabel} of ${formatExactBeatLabel(capacity)} beats; the new duration would make it ${resultingLabel}.`;
}

/**
 * Derive the literal completion a measure must carry after an edit. Returning
 * a refusal code rather than guessing keeps every incomplete measure explicit.
 */
function completionAfterEdit(
  events: readonly Readonly<{ duration: BeatDuration }>[],
  capacity: BeatDuration,
  reason: string | null,
): Readonly<{ ok: true; completion: MeasureCompletion }>
  | Readonly<{
      ok: false;
      code: StudioEditRefusalCode;
      /** The exact fill the edit would produce, when one could be measured. */
      resulting: BeatDuration | null;
      capacity: BeatDuration;
    }> {
  if (events.length === 0) {
    return Object.freeze({ ok: true, completion: Object.freeze({ kind: "empty" as const }) });
  }
  const total = totalDuration(events);
  if (total === null) {
    return Object.freeze({
      capacity,
      code: "u1.duration_invalid" as const,
      ok: false,
      resulting: null,
    });
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
      capacity,
      code: "u1.duration_overfills_measure" as const,
      ok: false,
      resulting: total,
    });
  }
  if (reason === null || reason.trim().length === 0) {
    return Object.freeze({
      capacity,
      code: "u1.completion_reason_required" as const,
      ok: false,
      resulting: total,
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
  /**
   * The composed audio stack. Absent in headless tests and in any build that
   * deliberately ships without sound; the transport then reports `unavailable`
   * and every playback action refuses honestly rather than pretending.
   */
  audio?: StudioAudioPort;
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
  /** Positive, strictly increasing: A0 refuses a non-advancing request ID. */
  let transportRequestOrdinal = 1;
  const audioPort = options.audio ?? null;
  let lastLogicalTimeMs = 0;
  let lastTitleLogicalTimeMs: number | null = null;
  const readClock = options.nowMs;
  const listeners = new Set<StudioControllerListener>();

  /** Non-decreasing integer logical time; a stalled clock still commits. */
  const logicalTimeMs = (): number => {
    const observed = readClock === undefined ? lastLogicalTimeMs : readClock();
    const floored = Number.isFinite(observed) ? Math.floor(observed) : 0;
    lastLogicalTimeMs = Math.max(lastLogicalTimeMs, Math.max(0, floored));
    return lastLogicalTimeMs;
  };

  /**
   * Title edits need two things at once: A0's non-decreasing logical time, and
   * a gap wider than the text-field coalescing window so consecutive renames
   * stay separate undo entries with exact snapshots.
   *
   * An earlier version supplied only the second by numbering title commands on
   * a private clock of its own, `(ordinal - 1) * TITLE_COMMAND_INTERVAL_MS`.
   * That clock started at zero and never saw the shared one, so the first
   * rename after any chord edit travelled backwards in logical time and A0
   * refused it with `command.logical_time_invalid` — renaming a chart the user
   * had actually worked on was impossible. The spacing is now measured from
   * the shared clock instead of replacing it.
   */
  const titleLogicalTimeMs = (): number | null => {
    const shared = logicalTimeMs();
    const spaced =
      lastTitleLogicalTimeMs === null
        ? shared
        : Math.max(shared, lastTitleLogicalTimeMs + TITLE_COMMAND_INTERVAL_MS);
    if (!Number.isSafeInteger(spaced)) return null;
    lastTitleLogicalTimeMs = spaced;
    lastLogicalTimeMs = Math.max(lastLogicalTimeMs, spaced);
    return spaced;
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
    const stamped = titleLogicalTimeMs();
    if (stamped === null) {
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
      logicalTimeMs: stamped,
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

  /**
   * Total document order over stable boundaries. The three components are
   * section, measure, and a doubled event index so that `before-event` and
   * `after-event` occupy distinct integral slots. Structural sentinels place
   * a section or measure edge before or after everything it contains.
   */
  const boundaryOrderKey = (
    boundary: StableBoundary,
  ): readonly [number, number, number] | null => {
    const START = -1;
    const END = Number.MAX_SAFE_INTEGER;
    switch (boundary.kind) {
      case "document-start":
        return [START, START, START];
      case "document-end":
        return [END, END, END];
      case "before-section":
      case "section-start":
      case "after-section":
      case "section-end": {
        const section = documentIndex.sections.get(boundary.sectionId);
        if (section === undefined) return null;
        const trailing =
          boundary.kind === "after-section" || boundary.kind === "section-end";
        return [section.sectionIndex, trailing ? END : START, trailing ? END : START];
      }
      case "before-measure":
      case "measure-start":
      case "after-measure":
      case "measure-end": {
        const measure = documentIndex.measures.get(boundary.measureId);
        if (measure === undefined) return null;
        const trailing =
          boundary.kind === "after-measure" || boundary.kind === "measure-end";
        return [
          measure.sectionIndex,
          measure.measureIndex,
          trailing ? END : START,
        ];
      }
      case "before-event":
      case "after-event": {
        const event = documentIndex.events.get(boundary.eventId);
        if (event === undefined) return null;
        return [
          event.sectionIndex,
          event.measureIndex,
          event.eventIndex * 2 + (boundary.kind === "after-event" ? 1 : 0),
        ];
      }
    }
  };

  /** Negative when `left` precedes `right`; zero when they denote one point. */
  const compareBoundaries = (
    left: StableBoundary,
    right: StableBoundary,
  ): number | null => {
    const a = boundaryOrderKey(left);
    const b = boundaryOrderKey(right);
    if (a === null || b === null) return null;
    for (let index = 0; index < 3; index += 1) {
      const first = a[index] ?? 0;
      const second = b[index] ?? 0;
      if (first !== second) return first < second ? -1 : 1;
    }
    return 0;
  };

  const publishRange = (
    action: StudioControllerAction,
    anchor: StableBoundary,
    focus: StableBoundary,
  ): StudioControllerActionResult => {
    const order = compareBoundaries(anchor, focus);
    if (order === null) {
      return editRefusal(
        action,
        "u1.target_missing",
        "A range boundary is no longer part of this chart.",
        ["range"],
      );
    }
    if (order > 0) {
      return editRefusal(
        action,
        "u1.range_endpoints_unordered",
        "The range end precedes the range start in document order.",
        ["range", "focus"],
      );
    }
    return publishBookmarks(action, { ...state.bookmarks, range: { anchor, focus } });
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
    return publishRange("set-range", resolvedAnchor, resolvedFocus);
  };

  /**
   * Replace one edge of the range and keep the other exactly as stored. With
   * no range yet, the new edge becomes both endpoints, which is the empty
   * range at that point rather than a guessed span.
   */
  const setRangeEdge = (
    edge: "start" | "end",
    boundary: StudioBoundaryInput,
  ): StudioControllerActionResult => {
    const resolved = resolveBoundary(boundary);
    if (resolved === null) {
      return editRefusal(
        "set-range-edge",
        "u1.target_missing",
        "That range boundary is no longer part of this chart.",
        ["range", edge],
      );
    }
    const current = state.bookmarks.range;
    const anchor =
      edge === "start" ? resolved : (current?.anchor ?? resolved);
    const focus = edge === "end" ? resolved : (current?.focus ?? resolved);
    return publishRange("set-range-edge", anchor, focus);
  };

  /**
   * Candidate boundaries in document order with their exact start beat. The
   * first exact match wins, so a beat that several boundaries share resolves
   * deterministically to the earliest one.
   */
  const boundaryAtExactBeat = (beat: BeatValue): StableBoundary | null => {
    const zero = makeBeatPosition({ denominator: 1, numerator: 0 });
    if (!zero.ok) return null;
    let position: BeatValue = zero.value;
    for (const section of state.document.sections) {
      for (const measure of section.measures) {
        if (compareBeatValues(position, beat) === 0) {
          return Object.freeze({ kind: "measure-start", measureId: measure.id });
        }
        for (const event of measure.events) {
          const next = addBeatValues(position, event.duration);
          if (!next.ok) return null;
          position = next.value;
          if (compareBeatValues(position, beat) === 0) {
            return Object.freeze({ eventId: event.id, kind: "after-event" });
          }
        }
      }
    }
    return null;
  };

  const setRangeEdgeBeat = (
    edge: "start" | "end",
    beatText: string,
  ): StudioControllerActionResult => {
    const match = /^(\d{1,10})(?:\/(\d{1,10}))?$/u.exec(beatText.trim());
    const numerator = match?.[1];
    if (match === null || numerator === undefined) {
      return editRefusal(
        "set-range-edge",
        "u1.range_boundary_invalid",
        "The range beat is not an exact non-negative rational value.",
        ["range", edge],
      );
    }
    const beat = makeBeatPosition({
      denominator: Number(match[2] ?? "1"),
      numerator: Number(numerator),
    });
    if (!beat.ok) {
      return editRefusal(
        "set-range-edge",
        "u1.range_boundary_invalid",
        "The range beat is not an exact non-negative rational value.",
        ["range", edge],
      );
    }
    const boundary = boundaryAtExactBeat(beat.value);
    if (boundary === null) {
      return editRefusal(
        "set-range-edge",
        "u1.range_boundary_invalid",
        "No chord or bar boundary starts exactly at that beat.",
        ["range", edge],
      );
    }
    const current = state.bookmarks.range;
    const anchor = edge === "start" ? boundary : (current?.anchor ?? boundary);
    const focus = edge === "end" ? boundary : (current?.focus ?? boundary);
    return publishRange("set-range-edge", anchor, focus);
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

  const acknowledgeFocus = (sequence: number): StudioControllerActionResult =>
    apply("acknowledge-focus", (current) =>
      reduceEphemeralIntent({
        intent: { kind: "acknowledge-focus", sequence },
        state: current,
      }),
    );

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
    const capacity = measureCapacity(state.document.meter);
    const completion = completionAfterEdit(
      projected,
      capacity,
      incompleteReason,
    );
    if (!completion.ok) {
      // The notice states the exact arithmetic rather than a summary: the fill
      // the measure has now, the fill this duration would produce, and the bar
      // capacity, all as exact rationals. A reader can check the decision.
      return editRefusal(
        "set-event-duration",
        completion.code,
        exactFillSentence(
          totalDuration(measure.measure.events),
          completion.resulting,
          capacity,
        ),
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
   * Classify the current draft against its destination. The order is the
   * reviewed one: draft preflight, T0 outcome, staleness, then destination
   * shape and occupancy. Every branch reuses the same placement chooser the
   * real command uses, so the statement cannot drift from the dispatch.
   */
  const previewInsertionPlan = (): StudioInsertionPlan => {
    const blocked = (
      statement: StudioInsertionPlanStatement,
    ): StudioInsertionPlan =>
      Object.freeze({
        blockedReason: BLOCKED_REASON_BY_STATEMENT[statement],
        committable: false,
        placement: null,
        planKind: null,
        resolutions: RESOLUTIONS_BY_STATEMENT[statement],
        statement,
      });

    const draft = state.quickEntry;
    if (draft.text.length === 0) return blocked("no-draft");
    if (draft.baseRevision !== state.revision) {
      return blocked("not-atomic-refusal");
    }
    // The draft's own status is not consulted here: it is a summary, and the
    // two blocked statements are distinguished by the T0 diagnostics below.
    const target = draft.target;
    if (target === null) return blocked("not-atomic-refusal");
    const parsed = dependencies.parseChartText(
      draft.text,
      { meter: state.document.meter, mode: "fragment" },
      "ascii",
    );
    if (!parsed.ok) {
      /**
       * T0 refuses a bar that does not fill exactly rather than publishing a
       * short or long measure, so both fill statements are visible only in its
       * diagnostics. A draft refused for nothing but one bar-fill code states
       * that fill; any other diagnostic is a genuine non-atomic refusal.
       */
      const codes = new Set(
        parsed.diagnostics.map((diagnostic) => diagnostic.code),
      );
      if (codes.size === 1) {
        if (codes.has("chart.bar_underfilled")) {
          return blocked("incomplete-requires-confirmation");
        }
        if (codes.has("chart.bar_overfilled")) {
          return blocked("overfill-requires-split");
        }
      }
      return blocked("not-atomic-refusal");
    }
    const placement = completeDraftPlacement(parsed.draft, target);
    if (!placement.ok) {
      return placement.code === "u1.insertion_plan_overfills_destination"
        ? blocked("overfill-requires-split")
        : blocked("not-atomic-refusal");
    }
    const statement =
      placement.placement.kind === "into-measure"
        ? ("fits-measure" as const)
        : ("completes-measures" as const);
    return Object.freeze({
      blockedReason: null,
      committable: true,
      // The placement is reported separately so a preview never claims a
      // measure-level insertion it will not perform.
      placement: placement.placement.kind,
      planKind: "insert-fragment",
      resolutions: RESOLUTIONS_BY_STATEMENT[statement],
      statement,
    });
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

  /**
   * Exact beats still free in a measure. A full or overfilled measure has no
   * positive remainder at all, which `makeBeatDuration` already refuses, so the
   * absent value is the honest answer rather than a synthesized zero.
   */
  const measureRemainder = (
    events: readonly Readonly<{ duration: BeatDuration }>[],
  ): BeatDuration | null => {
    const capacity = measureCapacity(state.document.meter);
    const filled = totalDuration(events);
    return filled === null ? capacity : remainderAfter(capacity, filled);
  };

  /**
   * One bounded T0 parse states the whole preview: the token rows, and, for a
   * refused draft, the recovered-chord lane. It dispatches nothing and resolves
   * nothing on the caller's behalf — the layout-loss acknowledgement and any
   * duration T0 could not resolve stay with the user.
   */
  const previewQuickEntryDraft = (): StudioDraftPreview => {
    const lane = (
      available: boolean,
      unavailableReason: string | null,
      measureLabel: string | null = null,
      remainderLabel: string | null = null,
    ): StudioRecoveredChordLane =>
      Object.freeze({
        acknowledgement: A0_U1_RECOVERED_CHORD_LAYOUT_LOSS_ACKNOWLEDGEMENT,
        available,
        measureLabel,
        remainderLabel,
        unavailableReason,
      });
    const closed = (
      tokens: readonly StudioQuickEntryToken[],
      reason: string,
      draftLane: StudioDraftPreview["lane"] = null,
      warnings: readonly string[] = Object.freeze([]),
      truncation: StudioDraftPreview["truncation"] = null,
    ): StudioDraftPreview =>
      Object.freeze({
        lane: draftLane,
        recovery: lane(false, reason),
        sectionNameCollisionWarnings: warnings,
        tokens,
        truncation,
      });

    const draft = state.quickEntry;
    const empty = Object.freeze([]) as readonly StudioQuickEntryToken[];
    if (draft.text.length === 0) {
      return closed(empty, "Type a draft before recovering a chord from it.");
    }
    if (draft.baseRevision !== state.revision) {
      return closed(
        empty,
        "The draft was written against an older revision; retype it.",
      );
    }
    const parsed = dependencies.parseChartText(
      draft.text,
      { meter: state.document.meter, mode: "fragment" },
      "ascii",
    );
    const slice = (range: Readonly<{ start: number; end: number }>): string =>
      draft.text.slice(range.start, range.end);

    if (parsed.ok) {
      const rows: StudioQuickEntryToken[] = [];
      let eventCount = 0;
      for (const section of parsed.draft.sections) {
        for (const measure of section.measures) {
          for (const event of measure.events) {
            eventCount += 1;
            if (rows.length >= MAX_PREVIEW_TOKENS) continue;
            rows.push(
              Object.freeze({
                blockedReason: null,
                diagnosticCode: null,
                diagnosticRange: null,
                durationLabel: formatExactBeatLabel(event.duration),
                globalOrdinal: null,
                ordinal: rows.length + 1,
                requiresCompletionReason: false,
                requiresDuration: false,
                sourceText: slice(event.range),
                state: "valid" as const,
              }),
            );
          }
        }
      }
      /**
       * Only a document placement creates sections, so only that placement can
       * collide with an existing section name.
       */
      const target = draft.target;
      const placement =
        target === null ? null : completeDraftPlacement(parsed.draft, target);
      const existing = new Set(
        state.document.sections.map((section) => section.name),
      );
      const warnings =
        placement !== null && placement.ok &&
        placement.placement.kind === "into-document"
          ? parsed.draft.sections
              .filter(
                (section) =>
                  section.kind === "named" &&
                  section.name !== null &&
                  existing.has(section.name),
              )
              .map((section) => section.name ?? "")
          : [];
      return closed(
        Object.freeze(rows),
        "The draft parses; insert the whole preview instead of one chord.",
        "complete-draft",
        Object.freeze(warnings),
        previewTruncation(eventCount, rows.length, 0, 0),
      );
    }

    /**
     * The destination decides only whether a recovered row can be committed.
     * The rows themselves are T0's, so they are still shown when no measure is
     * aimed at yet, together with the reason the lane is closed.
     */
    const target = draft.target;
    const destination = target === null ? null : measureInsertPoint(target);
    const measure =
      destination === null
        ? undefined
        : documentIndex.measures.get(destination.measureId);
    const remainder =
      measure === undefined ? null : measureRemainder(measure.measure.events);
    const closedReason =
      target === null
        ? "Choose the measure this chord should go into."
        : destination === null
          ? "One recovered chord goes into a measure; aim at a measure or a chord."
          : measure === undefined
            ? "The target measure is no longer part of this chart."
            : remainder === null
              ? "The target measure has no beats left."
              : null;

    /**
     * The diagnostic rows say why the draft refused, so they are never the
     * rows the preview bound drops. A draft inside the 4,096 code-point bound
     * can still publish more than `maxPreviewTokens` recoverable chords —
     * 2,048 undurated chords are 4,095 code points — and emitting them first
     * used to push the sole diagnostic row out of the preview, leaving a
     * refused draft rendered as nothing but a list of chords to insert. Room
     * for every diagnostic is reserved up front and the shortfall is stated
     * with `u1.preview_token_limit` instead.
     */
    const diagnosticBudget = Math.min(
      parsed.diagnostics.length,
      MAX_PREVIEW_TOKENS,
    );
    const insertableBudget = MAX_PREVIEW_TOKENS - diagnosticBudget;

    const rows: StudioQuickEntryToken[] = [];
    for (const chord of parsed.insertableChords) {
      if (rows.length >= insertableBudget) break;
      const resolved =
        chord.duration.kind === "resolved" ? chord.duration.value : null;
      const fits =
        resolved === null ||
        (remainder !== null && compareBeatValues(resolved, remainder) <= 0);
      const short =
        resolved !== null &&
        remainder !== null &&
        compareBeatValues(resolved, remainder) < 0;
      rows.push(
        Object.freeze({
          blockedReason: fits
            ? closedReason
            : "Longer than the beats left in the target measure.",
          diagnosticCode: null,
          diagnosticRange: null,
          durationLabel: resolved === null ? null : formatExactBeatLabel(resolved),
          globalOrdinal: chord.ordinal,
          ordinal: rows.length + 1,
          requiresCompletionReason: short,
          requiresDuration: resolved === null,
          sourceText: slice(chord.range),
          state: "insertable" as const,
        }),
      );
    }
    const recoveredCount = rows.length;
    let diagnosticsShown = 0;
    for (const diagnostic of parsed.diagnostics) {
      if (diagnosticsShown >= diagnosticBudget) break;
      diagnosticsShown += 1;
      rows.push(
        Object.freeze({
          blockedReason: null,
          diagnosticCode: diagnostic.code,
          diagnosticRange: Object.freeze({
            end: diagnostic.range.end,
            start: diagnostic.range.start,
          }),
          durationLabel: null,
          globalOrdinal: null,
          ordinal: rows.length + 1,
          requiresCompletionReason: false,
          requiresDuration: false,
          sourceText: slice(diagnostic.range),
          state: "invalid" as const,
        }),
      );
    }
    const truncation = previewTruncation(
      parsed.insertableChords.length,
      recoveredCount,
      parsed.diagnostics.length,
      diagnosticsShown,
    );
    if (recoveredCount === 0) {
      return closed(
        Object.freeze(rows),
        "T0 recovered no chord from this draft.",
        "recovered-chord",
        Object.freeze([]),
        truncation,
      );
    }
    return Object.freeze({
      lane: "recovered-chord" as const,
      sectionNameCollisionWarnings: Object.freeze([]),
      recovery: lane(
        closedReason === null,
        closedReason,
        measure === undefined
          ? null
          : `Measure ${String(measure.measureIndex + 1)}`,
        remainder === null ? null : formatExactBeatLabel(remainder),
      ),
      tokens: Object.freeze(rows),
      truncation,
    });
  };

  /**
   * Publish exactly one T0-recovered chord as one atomic A0/U1 command. The
   * whole draft is never partially applied: this inserts the single chord the
   * caller selected, at the boundary the draft is already aimed at, and only
   * once the caller has acknowledged that the source layout is lost.
   */
  const insertRecoveredChord = (
    globalOrdinal: number,
    callerBeatText: string | null = null,
    acknowledgement = "",
    incompleteReason: string | null = null,
  ): StudioControllerActionResult => {
    const draft = state.quickEntry;
    if (draft.status !== "invalid") {
      return editRefusal(
        "insert-recovered-chord",
        "u1.quick_entry_lane_mismatch",
        "The recovered-chord lane requires a draft T0 refused.",
        ["quickEntry", "status"],
      );
    }
    if (draft.baseRevision !== state.revision) {
      return editRefusal(
        "insert-recovered-chord",
        "u1.quick_entry_stale_revision",
        "The quick-entry draft was written against an older revision.",
        ["quickEntry", "baseRevision"],
      );
    }
    const target = draft.target;
    if (target === null) {
      return editRefusal(
        "insert-recovered-chord",
        "u1.quick_entry_target_missing",
        "The quick-entry draft has no insertion target.",
        ["quickEntry", "target"],
      );
    }
    /**
     * §4.2 states the acknowledgement as a precondition of the lane itself, so
     * a request without it is not a recovered-chord request. Refusing here
     * keeps the A0 code `edit-plan.recovered-chord-layout-loss-unacknowledged`
     * meaning exactly what it says: A0 saw a plan carrying the wrong literal.
     */
    if (acknowledgement !== A0_U1_RECOVERED_CHORD_LAYOUT_LOSS_ACKNOWLEDGEMENT) {
      return editRefusal(
        "insert-recovered-chord",
        "u1.quick_entry_lane_mismatch",
        "Recovering one chord discards the draft's bar and section layout; acknowledge that first.",
        ["quickEntry", "layoutLossAcknowledgement"],
      );
    }
    const destination = measureInsertPoint(target);
    if (destination === null) {
      return editRefusal(
        "insert-recovered-chord",
        "u1.insertion_plan_not_atomic",
        "One recovered chord goes into a measure; aim at a measure or a chord.",
        ["quickEntry", "target"],
      );
    }
    const measure = documentIndex.measures.get(destination.measureId);
    if (measure === undefined) {
      return editRefusal(
        "insert-recovered-chord",
        "u1.quick_entry_target_missing",
        "The target measure is no longer part of this chart.",
        ["quickEntry", "target"],
      );
    }
    const parsed = dependencies.parseChartText(
      draft.text,
      { meter: state.document.meter, mode: "fragment" },
      "ascii",
    );
    if (parsed.ok) {
      return editRefusal(
        "insert-recovered-chord",
        "u1.quick_entry_lane_mismatch",
        "The draft parses; insert the whole preview instead of one chord.",
        ["quickEntry", "text"],
      );
    }
    const selected = parsed.insertableChords.find(
      (chord) => chord.ordinal === globalOrdinal,
    );
    if (selected === undefined) {
      return editRefusal(
        "insert-recovered-chord",
        "u1.target_missing",
        "T0 did not publish a recoverable chord with that ordinal.",
        ["quickEntry", "selectedGlobalOrdinal"],
      );
    }
    const supplied = callerBeatText === null ? "" : callerBeatText.trim();
    let callerDuration: BeatDuration | null = null;
    let insertedDuration: BeatDuration;
    if (selected.duration.kind === "resolved") {
      if (supplied.length !== 0) {
        return editRefusal(
          "insert-recovered-chord",
          "u1.duration_invalid",
          "T0 already resolved this chord's duration; leave the field empty.",
          ["quickEntry", "callerDuration"],
        );
      }
      insertedDuration = selected.duration.value;
    } else {
      const exact = exactBeats(supplied);
      if (exact === null) {
        return editRefusal(
          "insert-recovered-chord",
          "u1.duration_invalid",
          "Enter an exact positive beat value such as 2 or 5/2.",
          ["quickEntry", "callerDuration"],
        );
      }
      callerDuration = exact;
      insertedDuration = exact;
    }
    const completion = completionAfterEdit(
      [...measure.measure.events, { duration: insertedDuration }],
      measureCapacity(state.document.meter),
      incompleteReason,
    );
    if (!completion.ok) {
      return editRefusal(
        "insert-recovered-chord",
        completion.code,
        completion.code === "u1.duration_overfills_measure"
          ? "The recovered chord is longer than the beats left in that measure."
          : "Declare why the measure stays shorter than the bar.",
        ["quickEntry", "callerDuration"],
      );
    }
    const snapshot: AtomicEditPlanQuickEntrySnapshot<
      "invalid",
      "recovered-chord"
    > = Object.freeze({
      baseRevision: draft.baseRevision,
      expectedLane: "recovered-chord",
      expectedStatus: "invalid",
      issueCodes: Object.freeze([...draft.issueCodes]),
      sourceText: draft.text,
      target,
    });
    const command: ApplyEditPlanCommand = Object.freeze({
      ...commandEnvelope("studio-recovered-chord", "Insert one recovered chord"),
      kind: "apply-edit-plan",
      plan: Object.freeze({
        kind: "insert-fragment" as const,
        placement: Object.freeze({
          beforeEventId: destination.beforeEventId,
          completionDeclarations: [
            { completion: completion.completion, measureId: measure.id },
          ] as const,
          kind: "into-measure" as const,
          layoutDisposition: "insert-one-recovered-chord" as const,
          measureId: measure.id,
        }),
        source: Object.freeze({
          callerDuration,
          kind: "recovered-chord" as const,
          layoutLossAcknowledgement: acknowledgement,
          quickEntrySnapshot: snapshot,
          selectedGlobalOrdinal: globalOrdinal,
        }),
        voicingPolicy: A0_U1_NEW_EVENT_POLICY_ID,
      }),
    });
    return apply("insert-recovered-chord", (current) =>
      runDocumentCommand({ command, dependencies, state: current }),
    );
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

  /**
   * Canonicalize a measure-level boundary exactly as A0 does, so a recovered
   * placement and the snapshot target it was aimed at cannot disagree at
   * dispatch. Section- and document-level boundaries have no measure slot.
   */
  const measureInsertPoint = (
    target: StableBoundary,
  ): Readonly<{
    measureId: MeasureId;
    beforeEventId: ChordEventId | null;
  }> | null => {
    if (target.kind === "measure-start" || target.kind === "measure-end") {
      const measure = documentIndex.measures.get(target.measureId);
      if (measure === undefined) return null;
      const first = measure.measure.events[0];
      return Object.freeze({
        beforeEventId:
          target.kind === "measure-start" && first !== undefined
            ? first.id
            : null,
        measureId: measure.id,
      });
    }
    if (target.kind !== "before-event" && target.kind !== "after-event") {
      return null;
    }
    const event = documentIndex.events.get(target.eventId);
    if (event === undefined) return null;
    if (target.kind === "before-event") {
      return Object.freeze({
        beforeEventId: event.id,
        measureId: event.measureId,
      });
    }
    const measure = documentIndex.measures.get(event.measureId);
    if (measure === undefined) return null;
    const next = measure.measure.events[event.eventIndex + 1];
    return Object.freeze({
      beforeEventId: next === undefined ? null : next.id,
      measureId: event.measureId,
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

  /**
   * The named resolution for an overfilled bar: move every chord that follows
   * the selection focus, within its own measure, into the next measure. It is
   * one `move` command, and it refuses rather than overfilling the neighbour.
   */
  const moveFollowingEvents = (
    incompleteReason: string | null = null,
  ): StudioControllerActionResult => {
    const selection = state.bookmarks.selection;
    if (selection.kind !== "events") {
      return editRefusal(
        "move-following-events",
        "u1.selection_empty",
        "Select a chord before moving the chords that follow it.",
        ["selection"],
      );
    }
    const focus = documentIndex.events.get(selection.focusEventId);
    if (focus === undefined) {
      return editRefusal(
        "move-following-events",
        "u1.target_missing",
        "The selected chord is no longer part of this chart.",
        ["selection"],
      );
    }
    const source = documentIndex.measures.get(focus.measureId);
    if (source === undefined) {
      return editRefusal(
        "move-following-events",
        "u1.target_missing",
        "The owning measure is no longer part of this chart.",
        ["selection"],
      );
    }
    const following = source.measure.events.slice(focus.eventIndex + 1);
    const [firstFollowing, ...restFollowing] = following;
    if (firstFollowing === undefined) {
      return editRefusal(
        "move-following-events",
        "u1.move_destination_invalid",
        "No chord follows the selected chord inside this measure.",
        ["selection"],
      );
    }
    const section = documentIndex.sections.get(focus.sectionId);
    const destination = section?.section.measures[source.measureIndex + 1];
    if (destination === undefined) {
      return editRefusal(
        "move-following-events",
        "u1.move_destination_invalid",
        "This measure has no following measure in its section.",
        ["destination"],
      );
    }
    const capacity = measureCapacity(state.document.meter);
    const remaining = source.measure.events.slice(0, focus.eventIndex + 1);
    const sourceCompletion = completionAfterEdit(
      remaining,
      capacity,
      incompleteReason,
    );
    if (!sourceCompletion.ok) {
      return editRefusal(
        "move-following-events",
        sourceCompletion.code,
        "Moving the following chords leaves this measure needing an explicit decision.",
        ["completionUpdates", source.id],
      );
    }
    const destinationCompletion = completionAfterEdit(
      [...following, ...destination.events],
      capacity,
      incompleteReason,
    );
    if (!destinationCompletion.ok) {
      return editRefusal(
        "move-following-events",
        destinationCompletion.code,
        "The next measure cannot accept the following chords.",
        ["completionUpdates", destination.id],
      );
    }
    const followingTargets: readonly [DocumentNodeRef, ...DocumentNodeRef[]] =
      Object.freeze([
        { id: firstFollowing.id, kind: "event" },
        ...restFollowing.map(
          (event): DocumentNodeRef => ({ id: event.id, kind: "event" }),
        ),
      ]);
    const command: MoveDocumentNodesCommand = Object.freeze({
      ...commandEnvelope("studio-move-following", "Move following chords"),
      completionUpdates: Object.freeze([
        { completion: sourceCompletion.completion, measureId: source.id },
        {
          completion: destinationCompletion.completion,
          measureId: destination.id,
        },
      ]),
      destination: Object.freeze({
        beforeEventId: destination.events[0]?.id ?? null,
        kind: "event" as const,
        measureId: destination.id,
      }),
      kind: "move",
      targets: followingTargets,
    });
    return apply("move-following-events", (current) =>
      runDocumentCommand({ command, dependencies, state: current }),
    );
  };

  /** The exact remainder of a duration after a split point, or null. */
  const remainderAfter = (
    total: BeatDuration,
    first: BeatDuration | null,
  ): BeatDuration | null => {
    if (first === null) return null;
    const difference = subtractBeatValues(total, first);
    if (!difference.ok) return null;
    const remainder = makeBeatDuration({
      denominator: difference.value.denominator,
      numerator: difference.value.numerator,
    });
    return remainder.ok ? remainder.value : null;
  };

  /** Parse exact rational beat text; U1 narrows nothing T0 or the domain accepts. */
  const exactBeats = (text: string): BeatDuration | null => {
    const match = /^(\d{1,10})(?:\/(\d{1,10}))?$/u.exec(text.trim());
    const numerator = match?.[1];
    if (match === null || numerator === undefined) return null;
    const value = makeBeatDuration({
      denominator: Number(match[2] ?? "1"),
      numerator: Number(numerator),
    });
    return value.ok ? value.value : null;
  };

  /**
   * Split one chord into two exact spans whose sum equals the original. The
   * measure total is unchanged, so its literal completion is restated rather
   * than recomputed under a rule that could silently rebalance the bar.
   */
  const splitEventDuration = (
    eventId: string,
    firstBeatText: string,
    secondBeatText?: string,
  ): StudioControllerActionResult => {
    const location = documentIndex.events.get(eventId);
    if (location === undefined) {
      return editRefusal(
        "split-event-duration",
        "u1.target_missing",
        "The chord is no longer part of this chart.",
        ["eventId"],
      );
    }
    const first = exactBeats(firstBeatText);
    /**
     * With only the split point named, the remainder is derived exactly here
     * rather than in the surface: no UI layer performs musical arithmetic, and
     * the plan still states both spans literally.
     */
    const second =
      secondBeatText === undefined
        ? remainderAfter(location.event.duration, first)
        : exactBeats(secondBeatText);
    if (first !== null && secondBeatText === undefined && second === null) {
      // The split point parsed but leaves no positive remainder, so it does
      // not partition the chord. That is a partition failure, not bad text.
      return editRefusal(
        "split-event-duration",
        "u1.split_partition_invalid",
        "The split point does not leave a positive remainder inside the chord.",
        ["duration"],
      );
    }
    if (first === null || second === null) {
      return editRefusal(
        "split-event-duration",
        "u1.duration_invalid",
        "Enter two exact positive beat values such as 1 and 1.",
        ["duration"],
      );
    }
    const sum = addBeatValues(first, second);
    if (!sum.ok || compareBeatValues(sum.value, location.event.duration) !== 0) {
      return editRefusal(
        "split-event-duration",
        "u1.split_partition_invalid",
        "The two durations do not sum to the chord's exact duration.",
        ["duration"],
      );
    }
    const measure = documentIndex.measures.get(location.measureId);
    if (measure === undefined) {
      return editRefusal(
        "split-event-duration",
        "u1.target_missing",
        "The owning measure is no longer part of this chart.",
        ["eventId"],
      );
    }
    const command: ApplyEditPlanCommand = Object.freeze({
      ...commandEnvelope("studio-split-duration", "Split chord duration"),
      kind: "apply-edit-plan",
      plan: Object.freeze({
        annotationPolicy: "retain-source-first-clear-second" as const,
        completionDeclarations: [
          { completion: measure.measure.completion, measureId: measure.id },
        ] as const,
        contentPolicy: "copy-exact-chord-and-voicing" as const,
        eventId: location.id,
        firstDuration: first,
        identityPolicy: "retain-source-first-allocate-second" as const,
        kind: "split-event-duration" as const,
        secondDuration: second,
      }),
    });
    return apply("split-event-duration", (current) =>
      runDocumentCommand({ command, dependencies, state: current }),
    );
  };

  /** Join a chord with the next chord in the same measure into one exact span. */
  const joinEventDurations = (
    leftEventId: string,
  ): StudioControllerActionResult => {
    const left = documentIndex.events.get(leftEventId);
    if (left === undefined) {
      return editRefusal(
        "join-event-durations",
        "u1.target_missing",
        "The chord is no longer part of this chart.",
        ["eventId"],
      );
    }
    const measure = documentIndex.measures.get(left.measureId);
    const right = measure?.measure.events[left.eventIndex + 1];
    if (measure === undefined || right === undefined) {
      return editRefusal(
        "join-event-durations",
        "u1.join_requires_adjacent_events",
        "This chord has no following chord inside the same measure.",
        ["eventId"],
      );
    }
    if (right.annotation.length > 0) {
      return editRefusal(
        "join-event-durations",
        "u1.join_right_annotation_not_empty",
        "The following chord carries a note that a join would discard.",
        ["annotation"],
      );
    }
    const sum = addBeatValues(left.event.duration, right.duration);
    const joined =
      sum.ok
        ? makeBeatDuration({
            denominator: sum.value.denominator,
            numerator: sum.value.numerator,
          })
        : null;
    if (joined === null || !joined.ok) {
      return editRefusal(
        "join-event-durations",
        "u1.duration_invalid",
        "The joined duration is not an exact representable beat value.",
        ["duration"],
      );
    }
    const command: ApplyEditPlanCommand = Object.freeze({
      ...commandEnvelope("studio-join-duration", "Join chord durations"),
      kind: "apply-edit-plan",
      plan: Object.freeze({
        annotationPolicy: "require-right-empty-retain-left" as const,
        completionDeclarations: [
          { completion: measure.measure.completion, measureId: measure.id },
        ] as const,
        contentPolicy: "require-exact-chord-and-voicing" as const,
        identityPolicy: "retain-left-remove-right" as const,
        joinedDuration: joined.value,
        kind: "join-event-durations" as const,
        leftEventId: left.id,
        rightEventId: right.id,
      }),
    });
    return apply("join-event-durations", (current) =>
      runDocumentCommand({ command, dependencies, state: current }),
    );
  };

  /* ------------------------------------------------------------------ */
  /* Transport                                                           */
  /* ------------------------------------------------------------------ */

  /**
   * A0 installs its expectation before every transport command and matches the
   * notification that comes back by request ID, so the IDs are minted here and
   * handed to the audio port rather than the other way round.
   */
  const nextTransportRequestId = (): number => {
    const id = transportRequestOrdinal;
    transportRequestOrdinal += 1;
    return id;
  };

  const expectTransport = (
    action: StudioControllerAction,
    commandRequestId: number,
    status: "starting" | "stopping",
    beat: BeatPosition,
  ): StudioControllerActionResult =>
    apply(action, (current) =>
      reduceEphemeralIntent({
        state: current,
        intent: {
          kind: "expect-transport",
          commandRequestId,
          documentId: current.document.id,
          planRevision: current.revision,
          status,
          startBeat: beat,
          playhead: beat,
        },
      }),
    );

  /**
   * Play the chart from its start.
   *
   * The plan is compiled fresh from the current document every time: a plan
   * that outlived the edit which invalidated it is the one thing a transport
   * must never be handed. A browser will not open an audio graph without a
   * trusted gesture, so the first Play carries the receipt proving one happened
   * and performs the initialization; later plays reuse the same graph.
   */
  const playProgression = (
    gesture: StudioAudioGesture,
  ): StudioControllerActionResult => {
    if (audioPort === null) {
      return editRefusal(
        "play-progression",
        "u1.playback_unavailable",
        "This build has no audio output wired.",
      );
    }
    const compiled = compileStudioPlaybackPlan(state.document);
    if (!compiled.ok) {
      return editRefusal(
        "play-progression",
        "u1.playback_refused",
        compiled.refusal.message,
      );
    }
    if (!studioPlanIsPlayable(compiled.plan)) {
      return editRefusal(
        "play-progression",
        "u1.playback_requires_a_chord",
        "Write at least one chord before playing.",
      );
    }
    const commandRequestId = nextTransportRequestId();
    const startBeat = state.transport.startBeat;
    const expectation = expectTransport(
      "play-progression",
      commandRequestId,
      "starting",
      startBeat,
    );
    if (!expectation.ok) return expectation;

    const binding = Object.freeze({
      plan: compiled.plan,
      documentId: state.document.id,
      planRevision: state.revision,
    });
    const port = audioPort;
    /*
     * The document's instrument travels with every run: the transport keeps
     * its own instrument state, and before this handoff existed its default
     * silently overrode the document. Rendered instruments also pre-render
     * their note buffers here so the scheduler's synchronous attacks land on
     * a warm cache instead of a render inside the lookahead deadline.
     */
    const instrumentId = state.document.playback.instrumentId;
    /* Display-only: retained so the analyzer can name expected chord tones. */
    lastPlanPitchClasses = new Map(
      compiled.plan.events.map((event) => [
        event.eventId,
        Object.freeze([
          ...new Set(event.midiPitches.map((midi) => ((midi % 12) + 12) % 12)),
        ]),
      ]),
    );
    const distinctNotes = new Map<
      string,
      Readonly<{ midiPitch: MidiPitch; velocity: number }>
    >();
    for (const event of compiled.plan.events) {
      for (const midiPitch of event.midiPitches) {
        const key = `${String(midiPitch)}:${String(event.velocity)}`;
        if (!distinctNotes.has(key)) {
          distinctNotes.set(
            key,
            Object.freeze({ midiPitch, velocity: event.velocity }),
          );
        }
      }
    }
    const preparedNotes = Object.freeze([...distinctNotes.values()]);
    void (async () => {
      if (!port.isInitialized()) {
        await port.initialize(
          commandRequestId,
          gesture,
          binding.documentId,
          binding.planRevision,
          /* jcpe-vy6w: the document, not a module constant, owns the mix. */
          Object.freeze({
            masterVolume: state.document.playback.masterVolume,
            reverbAmount: state.document.playback.reverbAmount,
          }),
        );
        await port.prepareInstrument(instrumentId, preparedNotes);
        await port.setInstrument(nextTransportRequestId(), instrumentId);
        const playRequestId = nextTransportRequestId();
        expectTransport("play-progression", playRequestId, "starting", startBeat);
        await port.play(playRequestId, binding, startBeat);
        return;
      }
      await port.prepareInstrument(instrumentId, preparedNotes);
      await port.setInstrument(nextTransportRequestId(), instrumentId);
      const playRequestId = nextTransportRequestId();
      expectTransport("play-progression", playRequestId, "starting", startBeat);
      await port.play(playRequestId, binding, startBeat);
    })();
    return expectation;
  };

  const pauseProgression = (): StudioControllerActionResult => {
    if (audioPort === null) {
      return editRefusal(
        "pause-progression",
        "u1.playback_unavailable",
        "This build has no audio output wired.",
      );
    }
    const commandRequestId = nextTransportRequestId();
    const expectation = expectTransport(
      "pause-progression",
      commandRequestId,
      "stopping",
      state.transport.playhead,
    );
    if (!expectation.ok) return expectation;
    void audioPort.pause(commandRequestId);
    return expectation;
  };

  /** Stop retires every sounding voice; a stuck note is never acceptable. */
  const stopProgression = (): StudioControllerActionResult => {
    if (audioPort === null) {
      return editRefusal(
        "stop-progression",
        "u1.playback_unavailable",
        "This build has no audio output wired.",
      );
    }
    const commandRequestId = nextTransportRequestId();
    const expectation = expectTransport(
      "stop-progression",
      commandRequestId,
      "stopping",
      state.transport.startBeat,
    );
    if (!expectation.ok) return expectation;
    void audioPort.stop(commandRequestId);
    return expectation;
  };

  /**
   * Display-only live playhead label. A pure read: it dispatches no intent,
   * installs no expectation, and cannot change state — the UI animation frame
   * may call it every frame without touching the command path.
   */
  const readTransportPlayheadLabel = (): string | null =>
    audioPort === null
      ? null
      : formatExactBeatLabel(audioPort.readPlayheadBeat());

  let lastPlanPitchClasses: Map<string, readonly number[]> | null = null;

  const readTransportAnalysisFrame = (): StudioAnalysisFrame | null =>
    audioPort === null ? null : audioPort.readAnalysisFrame();

  const readEventPitchClasses = (
    eventId: string,
  ): readonly number[] | null => lastPlanPitchClasses?.get(eventId) ?? null;

  /*
   * Every transport notification flows back through A0's own acceptance law:
   * stale generations, superseded request IDs, and foreign document IDs are
   * dropped there, not here. Without this feedback loop the expectation
   * installed before each command waits forever and the visible status sticks
   * at "starting" — which is exactly what the first browser evidence run
   * recorded on all three engines.
   */
  if (audioPort !== null) {
    audioPort.subscribe((notification) => {
      apply("transport-notification", (current) =>
        acceptTransportNotification({
          state: current,
          notification: Object.freeze({
            status: notification.status,
            generation: notification.generation,
            commandRequestId: notification.commandRequestId,
            notificationSequence: notification.notificationSequence,
            documentId: notification.documentId,
            planRevision: notification.planRevision,
            startBeat: notification.startBeat,
            playhead: notification.playhead,
            failureCode: notification.failureCode,
          }),
        }),
      );
    });
  }

  /**
   * Split a bar at an interior chord boundary — the third overfill resolution
   * REBUILD_PLAN 17.4 asks for, and the one that needed A0's sixth atomic plan
   * variant before it could be one command instead of two.
   *
   * Both measure totals are recomputed here from the stored durations and
   * stated literally in the plan; A0 recomputes them again and refuses if they
   * disagree. Neither side's completion is inferred: each is derived from its
   * own exact fill against the bar capacity, and a short side needs a stated
   * reason exactly as a manually declared incomplete measure does. A split
   * moves a bar line, never a beat.
   */
  const splitAtBar = (
    beforeEventId: string,
    retainedReason: string | null = null,
    suffixReason: string | null = null,
  ): StudioControllerActionResult => {
    const location = documentIndex.events.get(beforeEventId);
    if (location === undefined) {
      return editRefusal(
        "split-at-bar",
        "u1.target_missing",
        "The chord is no longer part of this chart.",
        ["eventId"],
      );
    }
    const measure = documentIndex.measures.get(location.measureId);
    if (measure === undefined) {
      return editRefusal(
        "split-at-bar",
        "u1.target_missing",
        "The owning measure is no longer part of this chart.",
        ["eventId"],
      );
    }
    const events = measure.measure.events;
    if (location.eventIndex <= 0 || location.eventIndex >= events.length) {
      return editRefusal(
        "split-at-bar",
        "u1.measure_split_boundary_invalid",
        "Split a bar at a chord after its first chord.",
        ["eventId"],
      );
    }
    const retained = events.slice(0, location.eventIndex);
    const moved = events.slice(location.eventIndex);
    const firstMeasureTotal = totalDuration(retained);
    const secondMeasureTotal = totalDuration(moved);
    if (firstMeasureTotal === null || secondMeasureTotal === null) {
      return editRefusal(
        "split-at-bar",
        "u1.duration_invalid",
        "This bar's chord durations do not sum exactly.",
        ["eventId"],
      );
    }
    const capacity = measureCapacity(state.document.meter);
    const retainedCompletion = completionAfterEdit(
      retained,
      capacity,
      retainedReason,
    );
    if (!retainedCompletion.ok) {
      return editRefusal(
        "split-at-bar",
        retainedCompletion.code,
        "Declare why the retained bar stays shorter than a full bar.",
        ["eventId"],
      );
    }
    const suffixCompletion = completionAfterEdit(moved, capacity, suffixReason);
    if (!suffixCompletion.ok) {
      return editRefusal(
        "split-at-bar",
        suffixCompletion.code,
        "Declare why the new bar stays shorter than a full bar.",
        ["eventId"],
      );
    }
    const command: ApplyEditPlanCommand = Object.freeze({
      ...commandEnvelope("studio-split-at-bar", "Split at bar"),
      kind: "apply-edit-plan",
      plan: Object.freeze({
        beforeEventId: location.id,
        completionDeclarations: [
          {
            completion: retainedCompletion.completion,
            measureId: measure.id,
          },
        ] as const,
        eventPolicy: "move-suffix-preserve-identities" as const,
        firstMeasureTotal,
        identityPolicy: "retain-source-prefix-allocate-suffix" as const,
        kind: "split-measure" as const,
        measureId: measure.id,
        newMeasureCompletion: suffixCompletion.completion,
        secondMeasureTotal,
      }),
    });
    return apply("split-at-bar", (current) =>
      runDocumentCommand({ command, dependencies, state: current }),
    );
  };

  /** Split a section at a measure boundary that is not its first measure. */
  const splitSection = (
    sectionId: string,
    beforeMeasureId: string,
    name: string,
  ): StudioControllerActionResult => {
    const section = documentIndex.sections.get(sectionId);
    if (section === undefined) {
      return editRefusal(
        "split-section",
        "u1.target_missing",
        "The section is no longer part of this chart.",
        ["sectionId"],
      );
    }
    const measure = documentIndex.measures.get(beforeMeasureId);
    if (
      measure === undefined ||
      measure.sectionId !== section.id ||
      measure.measureIndex === 0
    ) {
      return editRefusal(
        "split-section",
        "u1.section_split_boundary_invalid",
        "Split at a measure that follows the section's first measure.",
        ["beforeMeasureId"],
      );
    }
    const command: ApplyEditPlanCommand = Object.freeze({
      ...commandEnvelope("studio-split-section", "Split section"),
      kind: "apply-edit-plan",
      plan: Object.freeze({
        beforeMeasureId: measure.id,
        completionDeclarations: [] as const,
        identityPolicy: "retain-source-prefix-allocate-suffix" as const,
        kind: "split-section" as const,
        measurePolicy: "move-suffix-preserve-identities" as const,
        newSectionMetadata: Object.freeze({
          annotation: "",
          keyOverride: section.section.keyOverride,
          name,
          voiceLeadingBoundary: section.section.voiceLeadingBoundary,
        }),
        sectionId: section.id,
      }),
    });
    return apply("split-section", (current) =>
      runDocumentCommand({ command, dependencies, state: current }),
    );
  };

  /**
   * Join a section with the next section. Both metadata blocks are stated
   * literally so A0 can compare them; the result keeps the left section's
   * metadata rather than merging two descriptions into a guess.
   */
  const joinSections = (
    leftSectionId: string,
  ): StudioControllerActionResult => {
    const left = documentIndex.sections.get(leftSectionId);
    if (left === undefined) {
      return editRefusal(
        "join-sections",
        "u1.target_missing",
        "The section is no longer part of this chart.",
        ["sectionId"],
      );
    }
    const right = state.document.sections[left.sectionIndex + 1];
    if (right === undefined) {
      return editRefusal(
        "join-sections",
        "u1.section_join_requires_adjacent_sections",
        "This section has no following section to join.",
        ["sectionId"],
      );
    }
    const metadata = (
      source: typeof left.section,
    ): Readonly<{
      name: string;
      annotation: string;
      keyOverride: typeof source.keyOverride;
      voiceLeadingBoundary: typeof source.voiceLeadingBoundary;
    }> =>
      Object.freeze({
        annotation: source.annotation,
        keyOverride: source.keyOverride,
        name: source.name,
        voiceLeadingBoundary: source.voiceLeadingBoundary,
      });
    const command: ApplyEditPlanCommand = Object.freeze({
      ...commandEnvelope("studio-join-sections", "Join sections"),
      kind: "apply-edit-plan",
      plan: Object.freeze({
        completionDeclarations: [] as const,
        expectedLeftMetadata: metadata(left.section),
        expectedRightMetadata: metadata(right),
        identityPolicy: "retain-left-remove-right" as const,
        internalBoundaryPolicy: "remove-right-entry-boundary-confirmed" as const,
        kind: "join-sections" as const,
        leftSectionId: left.id,
        measurePolicy: "left-then-right-preserve-identities" as const,
        metadataPolicy: "compare-both-then-apply-explicit-result" as const,
        resultMetadata: metadata(left.section),
        rightSectionId: right.id,
      }),
    });
    return apply("join-sections", (current) =>
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

  /**
   * Declare the literal completion a measure already has. The fill is measured
   * exactly, never assumed: a full bar is complete, an empty bar is empty, a
   * short bar needs a stated reason, and an overfilled bar refuses rather than
   * being rebalanced into something that fits.
   */
  const declareMeasureCompletion = (
    measureId: string,
    reason: string | null = null,
  ): StudioControllerActionResult => {
    const location = documentIndex.measures.get(measureId);
    if (location === undefined) {
      return editRefusal(
        "set-measure-completion",
        "u1.target_missing",
        "The measure is no longer part of this chart.",
        ["measureId"],
      );
    }
    const completion = completionAfterEdit(
      location.measure.events,
      measureCapacity(state.document.meter),
      reason,
    );
    if (!completion.ok) {
      return editRefusal(
        "set-measure-completion",
        completion.code,
        completion.code === "u1.duration_overfills_measure"
          ? "This measure already holds more beats than the bar; shorten it first."
          : "Declare why this measure stays shorter than the bar.",
        ["measureId"],
      );
    }
    return setMeasureCompletion(measureId, completion.completion);
  };

  return Object.freeze({
    acknowledgeFocus,
    declareMeasureCompletion,
    getSnapshot: () => snapshot,
    annotateSection,
    applyInlineSymbol,
    applyQuickEntryPreview,
    clearQuickEntry,
    insertMeasure,
    insertSection,
    moveSelection,
    moveSelectionTo,
    moveFollowingEvents,
    joinEventDurations,
    joinSections,
    pauseProgression,
    playProgression,
    readTransportPlayheadLabel,
    readTransportAnalysisFrame,
    readEventPitchClasses,
    splitAtBar,
    splitEventDuration,
    splitSection,
    stopProgression,
    setRangeEdge,
    setRangeEdgeBeat,
    insertRecoveredChord,
    previewChartText,
    previewInsertionPlan,
    previewQuickEntryDraft,
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

/**
 * Compose the controller over an already-published document.
 *
 * `createStudioController` is the production composition root and publishes
 * the built-in blank chart, which is always 4/4. Conformance evidence must
 * host the other reviewed meters, and the only honest way to do that is the
 * real controller over a document published through the same F2/F3 boundary —
 * a second controller would be a duplicated implementation. This adds no
 * behaviour of its own.
 */
export function createStudioControllerOverState(
  state: AppState,
  dependencies: ApplicationCommandDependencies,
  options: StudioControllerOptions = {},
): StudioController {
  return makeStudioController(state, dependencies, options);
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
