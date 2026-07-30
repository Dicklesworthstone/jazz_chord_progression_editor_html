import type { UiDiagnostic } from "../ui-contract";

export type StudioPanelSide = "library" | "harmony";

export type StudioTitleFeedback = Readonly<{
  kind: "idle" | "dirty" | "committed" | "refused";
  message: string;
}>;

export type StudioDocumentView = Readonly<{
  committedTitle: string;
  titleDraft: string;
  titleMaxCodePoints: number;
  lifecycleLabel: string;
  revisionLabel: string;
  dirty: boolean;
  titleFeedback: StudioTitleFeedback;
  canCommitTitle: boolean;
  canResetTitleDraft: boolean;
  canUndo: boolean;
  canRedo: boolean;
  /** False when the chart is already a single empty measure. */
  canClearChart: boolean;
  /**
   * Clearing arms on the first press and fires on the second, in place of a
   * native confirm dialog. The armed state is presentation-only and disarms
   * itself after a few seconds of inaction.
   */
  clearArmed: boolean;
  clearLabel: string;
  undoDescription: string;
  redoDescription: string;
}>;

/**
 * One semantic operation offered by a chord card's More menu. Every item is a
 * named alternative to a pointer gesture; none of them is drag-only, and the
 * disabled ones state their reason rather than disappearing.
 */
export type StudioCardMenuItemView = Readonly<{
  action: StudioCardMenuAction;
  label: string;
  disabledReason: string | null;
}>;

export type StudioCardMenuAction =
  | "duplicate"
  | "delete"
  | "move-previous"
  | "move-next"
  | "move-following"
  | "split-duration"
  | "join-next"
  | "edit-symbol"
  | "edit-duration"
  | "range-start"
  | "range-end"
  | "declare-completion";

export type StudioChordCardView = Readonly<{
  id: string;
  ordinal: number;
  symbolText: string;
  /** True while the transport is sounding exactly this event. */
  playing: boolean;
  durationLabel: string;
  voicingMode: "auto" | "manual" | "frozen";
  hasAnnotation: boolean;
  selected: boolean;
  inRange: boolean;
  accessibleName: string;
  /** Inline editing is offered only where exact stored pitches are not at risk. */
  inlineEditable: boolean;
  inlineEditBlockedReason: string | null;
  /** Teaching view adds explanatory labels only; it never invents analysis. */
  teachingNotes: readonly string[];
  menuItems: readonly StudioCardMenuItemView[];
}>;

export type StudioMeasureView = Readonly<{
  id: string;
  number: number;
  meterLabel: string;
  durationLabel: string;
  capacityLabel: string;
  startBeatLabel: string;
  endBeatLabel: string;
  chordCountLabel: string;
  state: "empty" | "populated";
  fillLabel: string;
  chords: readonly StudioChordCardView[];
  /** Insertion targets are real controls, never drag-only affordances. */
  insertBeforeLabel: string;
  dropLabel: string;
  /** The literal completion A0 stores, shown as-is in the teaching view. */
  completionLabel: string;
  /**
   * The stored reason a short or pickup measure carries, verbatim, or null.
   * It is shown with the measure in both views: a bar is only allowed to be
   * short because someone said why, and the surface never supplies that why.
   */
  completionReason: string | null;
  /** True when the quick-entry insertion point already names this measure. */
  isInsertionTarget: boolean;
  targetLabel: string;
  /** Splitting a section here is legal only after its first measure. */
  canSplitSectionHere: boolean;
  /**
   * An empty bar the chart can spare offers its own removal. A populated
   * measure never does: chord deletion is the card's own affordance, and a
   * bar that vanishes with its chords would be a silent bulk delete.
   */
  canDelete: boolean;
  deleteLabel: string;
}>;

export type StudioSectionView = Readonly<{
  id: string;
  label: string;
  measureCountLabel: string;
  measures: readonly StudioMeasureView[];
  appendMeasureLabel: string;
  annotation: string;
  voiceLeadingBoundary: "reset" | "continue";
  voiceLeadingLabel: string;
  /** Joining is offered only where a following section actually exists. */
  canJoinNextSection: boolean;
}>;

export type StudioViewMode = "compact" | "teaching";

/**
 * Presentation-only range state. The exact beat labels come from A0; the mode
 * flag and the draft field text are owned by the surface and never published.
 */
export type StudioRangeView = Readonly<{
  active: boolean;
  hasRange: boolean;
  startBeatLabel: string | null;
  endBeatLabel: string | null;
  startDraft: string;
  endDraft: string;
}>;

export type StudioChartView = Readonly<{
  sectionCountLabel: string;
  measureCountLabel: string;
  chordCountLabel: string;
  sections: readonly StudioSectionView[];
  /** Exactly one chord card is tabbable; the rest are reachable by arrow keys. */
  rovingFocusId: string | null;
  selectionCount: number;
  selectionStatusLabel: string;
  canDeleteSelection: boolean;
  canDuplicateSelection: boolean;
  canMoveSelection: boolean;
  appendSectionLabel: string;
  /** Presentation-only; toggling it changes no document state at all. */
  viewMode: StudioViewMode;
  range: StudioRangeView;
  /** The card whose More menu is open, or null. Presentation-only. */
  openMenuChordId: string | null;
  editRefusal: Readonly<{
    code: string;
    message: string;
    recoveryAction: string;
    /** Explicit resolutions; the surface never resolves a fill silently. */
    resolutions: readonly string[];
    needsIncompleteReason: boolean;
  }> | null;
  /**
   * U1-CMP-019. A short measure is declared in a modal dialog the caller opens
   * deliberately; the reason draft is presentation state and is never coerced.
   */
  completionDialog: Readonly<{
    open: boolean;
    reasonDraft: string;
  }>;
}>;

/**
 * The insertion-plan statement shown before anything is published. It is
 * presentation, not publication: if it disagrees with A0 at dispatch, the A0
 * receipt or refusal wins and is surfaced verbatim.
 */
export type StudioInsertionPlanView = Readonly<{
  statement:
    | "no-draft"
    | "fits-measure"
    | "completes-measures"
    | "incomplete-requires-confirmation"
    | "overfill-requires-split"
    | "not-atomic-refusal";
  label: string;
  committable: boolean;
  resolutions: readonly string[];
}>;

/**
 * One preview row. A parsed draft shows `valid` rows; a refused draft shows one
 * `insertable` row per chord T0 recovered plus one `invalid` row per
 * diagnostic. `sourceText` is always the exact draft slice, never a guess.
 */
export type StudioQuickEntryTokenView = Readonly<{
  ordinal: number;
  sourceText: string;
  state: "valid" | "invalid" | "insertable";
  diagnosticCode: string | null;
  /** The T0 range the diagnostic covers, shown verbatim beside its code. */
  diagnosticRange: Readonly<{ start: number; end: number }> | null;
  globalOrdinal: number | null;
  durationLabel: string | null;
  requiresDuration: boolean;
  requiresCompletionReason: boolean;
  blockedReason: string | null;
}>;

/**
 * The recovered-chord lane. It commits one chord into one measure and always
 * costs the draft's own bar and section layout, so the literal acknowledgement
 * is a real gesture the caller makes before anything can be inserted.
 */
export type StudioRecoveryLaneView = Readonly<{
  available: boolean;
  acknowledgementLabel: string;
  acknowledged: boolean;
  measureLabel: string | null;
  remainderLabel: string | null;
  unavailableReason: string | null;
  durationDraft: string;
}>;

export type StudioQuickEntryView = Readonly<{
  draftText: string;
  insertionPlan: StudioInsertionPlanView;
  maxCodePoints: number;
  codePointCount: number;
  statusLabel: string;
  targetLabel: string;
  canInsert: boolean;
  canClear: boolean;
  issueCodes: readonly string[];
  refusalMessage: string | null;
  tokens: readonly StudioQuickEntryTokenView[];
  recovery: StudioRecoveryLaneView;
  /**
   * What the bounded preview left out, stated verbatim. Null when the token
   * list is the whole parse. A rendering bound never hides the row that says
   * why a draft refused, so this is shown rather than absorbed.
   */
  truncationNotice: string | null;
}>;

export type StudioFactView = Readonly<{
  id: string;
  label: string;
  value: string;
}>;

export type StudioSelectedChordView = Readonly<{
  symbolText: string;
  accessibleName: string;
  facts: readonly StudioFactView[];
}>;

/**
 * One plural continuation option. The sentence is the engine's typed
 * explanation verbatim; the surface never rewrites it into a verdict.
 */
export type StudioSuggestionRowView = Readonly<{
  id: string;
  symbolText: string;
  categoryLabel: string;
  sentence: string;
}>;

export type StudioContinuationSectionView = Readonly<{
  /** The exact stored symbol the options follow. */
  afterLabel: string;
  suggestions: readonly StudioSuggestionRowView[];
}>;

export type StudioHarmonyView = Readonly<{
  selectedChordLabel: null;
  selectionStatusLabel: string;
  emptyTitle: string;
  emptyDescription: string;
  /** Literal facts for the most recently selected chord; null when none. */
  selected: StudioSelectedChordView | null;
  documentFacts: readonly StudioFactView[];
  /** Plural next-chord options; null while the chart has no parsed chord. */
  continuation: StudioContinuationSectionView | null;
}>;

export type StudioTransportView = Readonly<{
  /** The live A0 transport status, not a hardcoded literal. */
  audioState:
    | "unavailable"
    | "ready"
    | "starting"
    | "playing"
    | "paused"
    | "stopping"
    | "failed";
  audioStatusLabel: string;
  audioStatusDetail: string;
  tempoBpm: number;
  instrumentLabel: string;
  positionLabel: string;
  currentChordLabel: string | null;
  /** 0..100 while playing, or null; drives the transport progress sweep. */
  progressPercent: number | null;
}>;

export type StudioLayoutView = Readonly<{
  libraryCollapsed: boolean;
  harmonyCollapsed: boolean;
  activeSheet: StudioPanelSide | null;
  uiRefusal: Readonly<{
    message: string;
    recoveryAction: string | null;
  }> | null;
}>;

/**
 * The editable playback settings the Library rail offers. Tempo commits
 * through the document command surface and refuses out-of-range values with
 * the exact stored draft preserved; feedback is the refusal or confirmation
 * sentence, never a silently corrected number.
 */
export type StudioPlaybackSettingsView = Readonly<{
  tempoBpm: number;
  tempoDraft: string;
  tempoInvalid: boolean;
  tempoFeedback: string | null;
  /**
   * The session's performance style and the declared styles a picker may
   * offer. Session state: choosing a groove never edits the document.
   */
  groove: Readonly<{
    activeStyleId: string;
    options: readonly Readonly<{ id: string; label: string }>[];
  }>;
}>;

export type StudioShellView = Readonly<{
  document: StudioDocumentView;
  quickEntry: StudioQuickEntryView;
  chart: StudioChartView;
  harmony: StudioHarmonyView;
  transport: StudioTransportView;
  playback: StudioPlaybackSettingsView;
  layout: StudioLayoutView;
}>;

export type StudioShellCallbacks = Readonly<{
  onTitleDraftChange: (value: string) => void;
  onCommitTitle: (value: string) => void;
  onResetTitleDraft: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onClearChart: () => void;
  onRailCollapsedChange: (
    side: StudioPanelSide,
    collapsed: boolean,
  ) => void;
  onRequestPanelSheet: (side: StudioPanelSide) => void;
  onDismissPanelSheet: () => void;
  onUiContractRefusal: (diagnostic: UiDiagnostic) => void;
  onDismissUiRefusal: () => void;
  onTempoDraftChange: (value: string) => void;
  onTempoCommit: () => void;
  /** Choose the session's groove; a library row also applies its own. */
  onGrooveStyleChange: (styleId: string) => void;
  /** Append one suggested chord through the shared quick-entry path. */
  onAddSuggestedChord: (symbolText: string) => void;
  onQuickEntryDraftChange: (value: string) => void;
  onQuickEntryInsert: () => void;
  onQuickEntryClear: () => void;
  /** Presentation-only: records that the caller accepted the layout loss. */
  onRecoveryAcknowledgeChange: (acknowledged: boolean) => void;
  /** Presentation-only draft for a duration T0 could not resolve. */
  onRecoveryDurationDraftChange: (value: string) => void;
  /** Publish exactly one recovered chord into the aimed measure. */
  onInsertRecoveredChord: (globalOrdinal: number) => void;
  onSelectChord: (chordId: string, extend: boolean) => void;
  onRovingFocusChange: (chordId: string) => void;
  onDeleteSelection: () => void;
  onDuplicateSelection: () => void;
  onMoveSelection: (direction: "previous" | "next") => void;
  onInsertMeasure: (sectionId: string, beforeMeasureId: string | null) => void;
  onInsertSection: () => void;
  onApplyInlineSymbol: (chordId: string, symbolText: string) => void;
  onApplyDuration: (chordId: string, beatText: string) => void;
  onConfirmIncompleteMeasure: (reason: string) => void;
  onCancelPendingEdit: () => void;
  /** Presentation-only: opens or closes the measure-completion dialog. */
  onCompletionDialogOpenChange: (open: boolean) => void;
  onCompletionReasonDraftChange: (value: string) => void;
  /** Declare the completion a measure's own exact fill already implies. */
  onDeclareMeasureCompletion: (measureId: string) => void;
  onRenameSection: (sectionId: string, name: string) => void;
  onAnnotateSection: (sectionId: string, annotation: string) => void;
  onSetSectionBoundary: (
    sectionId: string,
    boundary: "reset" | "continue",
  ) => void;
  onDropChordOnMeasure: (measureId: string) => void;
  /** Presentation-only: opens or closes one card's More menu. */
  onCardMenuOpenChange: (chordId: string | null) => void;
  onCardMenuAction: (chordId: string, action: StudioCardMenuAction) => void;
  onSplitDuration: (chordId: string, firstBeats: string) => void;
  onSplitSection: (sectionId: string, beforeMeasureId: string) => void;
  onJoinSections: (sectionId: string) => void;
  /** Remove one empty measure; refusals surface like any other edit. */
  onDeleteMeasure: (measureId: string) => void;
  /** Split the owning bar before this chord (the reviewed overfill fix). */
  onSplitAtBar: (beforeEventId: string) => void;
  /** Aim the quick-entry draft at a measure without publishing anything. */
  onSetInsertionPoint: (measureId: string) => void;
  /** Presentation-only: enters or leaves the explicit range mode. */
  onRangeModeChange: (active: boolean) => void;
  onRangeEdgeFromFocus: (edge: "start" | "end") => void;
  /** Set one range edge from a chord a boundary handle was dropped on. */
  onRangeEdgeToChord: (edge: "start" | "end", chordId: string) => void;
  onRangeDraftChange: (edge: "start" | "end", value: string) => void;
  onRangeDraftCommit: (edge: "start" | "end") => void;
  onRangeCancel: () => void;
  /** Clear the range and stay in the mode; Cancel instead restores and exits. */
  onRangeClear: () => void;
  /** Presentation-only: swaps compact and teaching rendering. */
  onViewModeChange: (mode: StudioViewMode) => void;
}>;

/**
 * The transport surface the shell renders. Kept beside the callbacks rather
 * than inside them because playback is the one control group whose enablement
 * is derived from the chart rather than from a bookmark or selection.
 */
export type StudioTransportCallbacks = Readonly<{
  /** False when the chart has no chord to play. */
  canPlay: boolean;
  onPlay: (source: "pointer" | "keyboard") => void;
  onPause: () => void;
  onStop: () => void;
}>;

export type StudioShellProps = Readonly<{
  view: StudioShellView;
  callbacks: StudioShellCallbacks;
  transport: StudioTransportCallbacks;
}>;
