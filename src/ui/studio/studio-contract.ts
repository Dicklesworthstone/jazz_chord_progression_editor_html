import type { ComponentChildren } from "preact";
import type { UiDiagnostic } from "../ui-contract";

export type StudioPanelSide = "library" | "harmony";

/**
 * Every drawer the studio can open at narrow widths. The rails stay a
 * two-side concept; "sound" exists only as a sheet because the transport
 * footer retires its settings cluster below 71.875rem and phones would
 * otherwise lose instrument/groove/tempo/volume entirely (owner report,
 * 2026-08-07).
 */
export type StudioSheetId = StudioPanelSide | "sound" | "export";

export type StudioTitleFeedback = Readonly<{
  kind: "idle" | "dirty" | "committed" | "refused";
  message: string;
}>;

/**
 * Outcome of the last Copy-link press, stated concretely. `copied` reached
 * the clipboard, `manual` reached only the address bar, and `refused` names
 * the exact reason the share grammar could not carry the chart.
 */
export type StudioShareFeedback = Readonly<{
  kind: "copied" | "manual" | "refused";
  message: string;
}>;

export type StudioDocumentView = Readonly<{
  committedTitle: string;
  titleDraft: string;
  titleMaxCodePoints: number;
  revisionLabel: string;
  titleFeedback: StudioTitleFeedback;
  canCommitTitle: boolean;
  canResetTitleDraft: boolean;
  canUndo: boolean;
  canRedo: boolean;
  /** False when the chart is already a single empty measure. */
  canClearChart: boolean;
  /** Outcome of the last Copy-link press; null before one. */
  shareFeedback: StudioShareFeedback | null;
  /** True for ~2 seconds after a clipboard success; flips the button label. */
  shareCopied: boolean;
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
 * V2R-4 (jcpe-v2r-grid-uyyd): the chart's presentation layout — the engraved
 * "sheet" of systems, or the "grid" of per-chord study cards. A layout is
 * orthogonal to StudioViewMode on purpose: the reviewed U1 mode vocabulary
 * (compact/teaching, fixture + validator pins) stays untouched, and both
 * dimensions are presentation-only — toggling either mutates nothing.
 */
export type StudioChartLayout = "sheet" | "grid";

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
  /**
   * V2R-2 engraved chart header: the document key and tempo, stated on the
   * paper beside the title. The key block is read-only presentation — no
   * set-key command surface exists yet, so offering an editor here would
   * promise an edit the application cannot land.
   */
  keyLabel: string;
  tempoLabel: string;
  /**
   * True while the seeded starter chart is untouched (title still the seed's
   * and revision at the seed level). Drives a dismissible one-line demo
   * banner above the chart; dismissal is component state, never persisted.
   */
  isSeededDemo: boolean;
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
  /** Presentation-only chart layout; same law as viewMode (V2R-4). */
  layout: StudioChartLayout;
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

/**
 * The chord-detail teaching panel (jcpe-v2r-detail-yimm): everything the
 * ink-on-paper Chord Detail surface renders for the selected event. All
 * values arrive verbatim from the chart-annotation read ports; the panel
 * invents nothing — a null roman stays blank, an honest outcome sentence
 * replaces analysis when no claim can be made.
 */
export type StudioDetailToneView = Readonly<{
  /** Display name with engraved accidentals ("B♭"). */
  name: string;
  /** Interval role ("root", "♭3"); null for custom pitches. */
  role: string | null;
  guide: boolean;
  /** 0..11; lights the keyboard and gates the preview per the owner law. */
  pitchClass: number;
}>;

export type StudioDetailMoveView = Readonly<{
  fromName: string;
  toName: string;
  /** True renders "=" (common tone); false renders an arrow. */
  held: boolean;
}>;

export type StudioDetailResolutionView = Readonly<{
  targetSymbol: string;
  moves: readonly StudioDetailMoveView[];
  note: string;
}>;

export type StudioDetailNextView = Readonly<{
  id: string;
  symbolText: string;
  roman: string | null;
  why: string;
}>;

export type StudioDetailView = Readonly<{
  /** "Bar 2 · 4 beats · C major" — composed from real view-model fields. */
  place: string;
  symbolText: string;
  roman: string | null;
  functionSentence: string;
  scaleSentence: string | null;
  tones: readonly StudioDetailToneView[];
  guideToneNames: readonly string[];
  resolution: StudioDetailResolutionView | null;
  next: readonly StudioDetailNextView[];
}>;

export type StudioHarmonyView = Readonly<{
  selectedChordLabel: null;
  selectionStatusLabel: string;
  emptyTitle: string;
  emptyDescription: string;
  /** Literal facts for the most recently selected chord; null when none. */
  selected: StudioSelectedChordView | null;
  /** The teaching panel for the selected chord; null when none selected. */
  detail: StudioDetailView | null;
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
  /**
   * The machine-readable transport failure code (e.g.
   * "audio.engine_not_ready"), or null while none is carried. Rendered as a
   * DOM attribute so failure-time diagnostics can name the refused path —
   * the playback gate's mellow-keys flake (jcpe-0bjj) could previously
   * capture only the human status string.
   */
  failureCode: string | null;
  tempoBpm: number;
  instrumentLabel: string;
  /** Musical bar·beat readout ("Bar 2 · beat 3.0"), derived at render time. */
  positionLabel: string;
  /** The exact rational playhead, kept for a title attribute; never rounded. */
  positionExactLabel: string;
  currentChordLabel: string | null;
  /** 0..100 while playing, or null; drives the transport progress sweep. */
  progressPercent: number | null;
  /**
   * V2R-8 footer settings (jcpe-v2r-transport-k88n). All four are document
   * or session values read from the snapshot; every change lands through a
   * real command path and refusals surface in the status line.
   */
  grooveStyleId: string;
  grooveOptions: readonly Readonly<{ id: string; label: string }>[];
  instrumentId: string;
  instrumentOptions: readonly Readonly<{ id: string; label: string }>[];
  /** Document master volume, 0..100 for the slider. Applies at next engine start. */
  masterVolumePercent: number;
  canStepPrevious: boolean;
  canStepNext: boolean;
  /** Tempo stepper enablement at the reviewed 20–300 window's edges. */
  canTempoDown: boolean;
  canTempoUp: boolean;
  /**
   * U4 (l3a.12.2) slider scrubber numerics. `playheadBeats` is the committed
   * accepted playhead as a decimal for the slider's aria-valuenow — the
   * exact rational label remains positionExactLabel; the sweep's display
   * interpolation never feeds this value. `totalBeats` is the chart's exact
   * total as a decimal for aria-valuemax; `beatsPerBar` is the document
   * meter for the slider's bar-step key law.
   */
  playheadBeats: number | null;
  totalBeats: number | null;
  beatsPerBar: number;
}>;

/**
 * The one field the footer meter reads per animation frame. Structurally a
 * subset of the application's analysis frame so the UI depends on no audio
 * type; a null frame renders the meter quiet.
 */
export type TransportMeterFrame = Readonly<{
  magnitudes: Float32Array;
}>;

export type StudioLayoutView = Readonly<{
  libraryCollapsed: boolean;
  harmonyCollapsed: boolean;
  activeSheet: StudioSheetId | null;
  uiRefusal: Readonly<{
    message: string;
    recoveryAction: string | null;
    /** Overrides the notice's default heading when the refusal is not a panel failure. */
    heading?: string;
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

/**
 * The MIDI import surface's view. Everything here is a statement about a file
 * the caller chose: what decoded, what refused, what each sonority could be
 * read as, and what an insert would write. Nothing in it is a document edit.
 */
export type StudioMidiImportRefusalView = Readonly<{
  /** The frozen M0 refusal code, verbatim. */
  code: string;
  /** One plain sentence for the person reading it. */
  sentence: string;
  /** The detection byte offset and track, stated rather than hidden. */
  where: string;
}>;

export type StudioMidiImportSonorityView = Readonly<{
  id: string;
  /** Bar, raw tick, and the exact quantized onset this sonority landed on. */
  where: string;
  /** The chord the import would write, or null when nothing could name it. */
  symbolText: string | null;
  /** Template, match kind, inversion, member count, and window evidence. */
  evidence: string;
  /** Every other ranked reading the reverse-T1 law found. */
  alternatives: readonly string[];
  /** The literal pitch classes when no template matched; null otherwise. */
  customNote: string | null;
  written: boolean;
}>;

export type StudioMidiImportSummaryView = Readonly<{
  facts: readonly StudioFactView[];
  durationLawNote: string;
  chartText: string;
}>;

/**
 * The salvage account when a preview came from repaired bytes (V2R-13):
 * the honest one-sentence note plus one line per repair kind that fired.
 * Null for a clean read — the panel must not imply repairs that never ran.
 */
export type StudioMidiImportSalvageView = Readonly<{
  note: string;
  repairLines: readonly string[];
}>;

/**
 * The M1 automatic-import result card: what one press of Add will do, in
 * user language — bars and chords, sections, the matched groove WITH its
 * evidence sentence, which settings will change (or were kept, and why),
 * and the exact undo cost. The forensic detail stays in Advanced.
 */
export type StudioMidiImportAutoView = Readonly<{
  headline: string;
  cardLines: readonly StudioFactView[];
  /** The groove sentence, e.g. "Medium swing: swung eighths in 2/3 of beats at 132 BPM." */
  grooveEvidence: string;
  /** Withheld-settings and mid-file-change statements; empty when none. */
  notes: readonly string[];
  canCommit: boolean;
}>;

export type StudioMidiImportView = Readonly<{
  /** False when the composition root wired no decoder into this session. */
  available: boolean;
  statusLabel: string;
  refusal: StudioMidiImportRefusalView | null;
  salvage: StudioMidiImportSalvageView | null;
  /**
   * The salvage account when repair was attempted but the repaired bytes
   * still refused: proof the studio tried, shown with the refusal.
   */
  salvageFailed: StudioMidiImportSalvageView | null;
  /** The automatic result card; null when the file refused or nothing wrote. */
  auto: StudioMidiImportAutoView | null;
  summary: StudioMidiImportSummaryView | null;
  sonorities: readonly StudioMidiImportSonorityView[];
  blockedReason: string | null;
  canCommit: boolean;
  /**
   * The M1-TRACE ledger, serialized, for the Advanced disclosure — one
   * record per frozen stage with input digests and decisions. Null when no
   * file is pending.
   */
  traceJson: string | null;
  /** True while the pre-Add audition is sounding; the button shows Stop. */
  auditioning: boolean;
  /**
   * M1-OVR (amendment #2): the Advanced override controls' data — every
   * track with its classification and exclusion state, every written span
   * offering more than one reading, and the groove override. Null when no
   * automatic plan is pending.
   */
  overrides: StudioMidiImportOverridesView | null;
}>;

export type StudioMidiImportOverridesView = Readonly<{
  tracks: readonly Readonly<{
    index: number;
    label: string;
    role: string;
    excluded: boolean;
  }>[];
  spans: readonly Readonly<{
    measureIndex: number;
    startTick: number;
    label: string;
    options: readonly string[];
    chosenOrdinal: number;
  }>[];
  grooveOptions: readonly Readonly<{ id: string; label: string }>[];
  grooveOverrideId: string | null;
}>;

/**
 * The U7 MIDI export workflow's view. Everything here is a statement the
 * application service made: the dialog renders it and nothing else — no field
 * is read live at render time (U7-LAW-PREVIEW-BINDING).
 */
export type StudioMidiExportBlockerView = Readonly<{
  kind: "realization" | "plan" | "export" | "empty-chart";
  code: string | null;
  eventId: string | null;
  message: string;
}>;

export type StudioMidiExportView = Readonly<{
  /** Dialog session state; null while the dialog is closed. */
  state:
    | "preview"
    | "generating"
    | "ready"
    | "delivering"
    | "delivered"
    | null;
  readiness: "ready" | "blocked";
  blockers: readonly StudioMidiExportBlockerView[];
  realization: Readonly<{
    storedManualCount: number;
    storedFrozenCount: number;
    generatedCount: number;
    externalBassEventIds: readonly string[];
  }>;
  ppq: number;
  trackCount: number;
  tempoBpm: number;
  meter: Readonly<{ beatsPerBar: number; beatUnit: number }>;
  losses: readonly Readonly<{
    kind:
      | "enharmonic-spelling"
      | "annotation-text"
      | "loop-range"
      | "unison-doubling";
    eventIds: readonly string[];
  }>[];
  markerOmissions: readonly Readonly<{
    eventId: string;
    markerKind: "section" | "chord";
    reason: string;
    utf8ByteLength: number;
  }>[];
  titleNotice: Readonly<{
    kind: "title-control-chars-substituted" | "title-truncated";
    originalUtf8ByteLength: number | null;
  }> | null;
  derivedTitle: string;
  artifact: Readonly<{
    filename: string;
    byteLength: number;
    sha256: string;
    tempo: Readonly<{
      requestedBpm: number;
      encodedMicrosecondsPerQuarter: number;
      roundingErrorNumerator: number;
      roundingErrorDenominator: number;
    }>;
    noteCount: number;
    markerCount: number;
  }> | null;
  /** True after a stale outcome until the preview is refreshed. */
  stale: boolean;
  refusal: Readonly<{ code: string; message: string }> | null;
  /** The live-region sentence for the current state. */
  announcement: string | null;
}>;

export type StudioShellView = Readonly<{
  document: StudioDocumentView;
  quickEntry: StudioQuickEntryView;
  midiImport: StudioMidiImportView;
  midiExport: StudioMidiExportView;
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
  onRequestPanelSheet: (side: StudioSheetId) => void;
  onDismissPanelSheet: () => void;
  onUiContractRefusal: (diagnostic: UiDiagnostic) => void;
  onDismissUiRefusal: () => void;
  onTempoDraftChange: (value: string) => void;
  onTempoCommit: () => void;
  /** Copy a #zdoc= share link for the current chart; explicit gesture only. */
  onCopyShareLink: () => void;
  /** Choose the session's groove; a library row also applies its own. */
  onGrooveStyleChange: (styleId: string) => void;
  /** Append one suggested chord through the shared quick-entry path. */
  onAddSuggestedChord: (symbolText: string) => void;
  /**
   * Preview one pitch from the chord-detail keyboard or a note chip. The
   * owner law (jcpe-v2r-detail-yimm): only in-chord keys ever reach this.
   */
  onPreviewPitch: (midiPitch: number) => void;
  onQuickEntryDraftChange: (value: string) => void;
  onQuickEntryInsert: () => void;
  /**
   * Load a library entry as one document gesture: replace the chart,
   * retitle, set the entry's groove and (when declared) its tempo — all
   * through controller actions, never through chained field callbacks.
   */
  onLoadLibraryEntry: (entryId: string) => void;
  onQuickEntryClear: () => void;
  /** Read a local file the caller picked. No network, ever. */
  onMidiImportChooseFile: (file: File) => void;
  /** Land the previewed import as one ordinary undoable edit. */
  onMidiImportCommit: () => void;
  /** Drop the preview without touching the document. */
  onMidiImportDiscard: () => void;
  /**
   * Toggle the pre-Add audition (jcpe-qyyn): a bounded, cancelable series
   * of click-previews sounding the file's own first bars at its tempo.
   */
  onMidiImportAudition: () => void;
  /**
   * Replace the pending import's M1-OVR override set (absolute, never a
   * delta): the application re-plans on the retained bytes and swaps the
   * preview atomically. The panel computes the next set from its view.
   */
  onMidiImportOverridesChange: (next: Readonly<{
    excludedTrackIndices: readonly number[];
    alternativeChoices: readonly Readonly<{
      span: Readonly<{ measureIndex: number; startTick: number }>;
      alternativeOrdinal: number;
    }>[];
    grooveStyleId: string | null;
  }>) => void;
  /** Open the MIDI export preview for the current validated chart. */
  onOpenMidiExport: () => void;
  /** Adopt the prepared artifact (blocked preview: this control is absent). */
  onMidiExportGenerate: () => void;
  /** Download the prepared file once, under this gesture. */
  onMidiExportDownload: () => void;
  /** Cancel or close the export workflow and clean up the preparation. */
  onMidiExportClose: () => void;
  /** Recompute the preview against the current revision after a stale outcome. */
  onMidiExportRepreview: () => void;
  /** Focus a blocked event in the chart from a blocker link. */
  onMidiExportBlockedEventActivate: (eventId: string) => void;
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
  /** The dragged duration grip; auto-declares a short bar (V2R-14). */
  onResizeDuration: (chordId: string, beatText: string) => void;
  onConfirmIncompleteMeasure: (reason: string) => void;
  onCancelPendingEdit: () => void;
  /** Presentation-only: opens or closes the measure-completion dialog. */
  onCompletionDialogOpenChange: (open: boolean) => void;
  onCompletionReasonDraftChange: (value: string) => void;
  /** Declare the completion a measure's own exact fill already implies. */
  onDeclareMeasureCompletion: (measureId: string) => void;
  onRenameSection: (sectionId: string, name: string) => void;
  /**
   * V2R-18 (jcpe-v2r-section-loop-jjsw): arm/disarm one section's loop from
   * its header button; exclusive with the whole-chart transport toggle.
   */
  onSectionLoopToggle: (sectionId: string) => void;
  /** The armed section-loop id for header pressed-state honesty. */
  readSectionLoopId: () => string | null;
  onAnnotateSection: (sectionId: string, annotation: string) => void;
  onSetSectionBoundary: (
    sectionId: string,
    boundary: "reset" | "continue",
  ) => void;
  onDropChordOnMeasure: (measureId: string) => void;
  /**
   * The keyboard move (U1-OP-012 Alt+M): unlike the drop lane, it never
   * auto-declares a shortened source bar — the completion-reason dialog
   * asks, because a keyboard move is a deliberate edit, not a landing.
   */
  onMoveSelectionToMeasure: (measureId: string) => void;
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
  /* jcpe-v2r-measure-join-v3s6: the tie mark merges the next bar in. */
  onJoinNextMeasure: (measureId: string) => void;
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
  /** Cycles the document key ring as one undoable Set-key step (V2R-11). */
  onCycleKey: () => void;
  /** Presentation-only: swaps the sheet and grid layouts (V2R-4). */
  onChartLayoutChange: (layout: StudioChartLayout) => void;
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
  /** Select the previous/next chord in chart order; selection previews it. */
  onStepChord: (direction: "previous" | "next") => void;
  /** Step the document tempo by a signed BPM delta through setTempo. */
  onTempoStep: (deltaBpm: number) => void;
  onGrooveChange: (styleId: string) => void;
  onInstrumentChange: (instrumentId: string) => void;
  /** Commit the document master volume, 0..1. */
  onVolumeCommit: (volume: number) => void;
  /** Display-only spectral frame for the footer meter; null renders quiet. */
  readMeterFrame: () => TransportMeterFrame | null;
  /**
   * Seek the active run to a fraction of the chart (jcpe-v2r-loop-seek-ukk6).
   * Only meaningful while playing/paused; the scrub line disables itself
   * honestly outside that window.
   */
  onSeekFraction: (fraction: number) => void;
  /** Toggle whole-chart looping; armed intent applies at the next Play. */
  onLoopToggle: () => void;
  /**
   * Arm/disarm one section's loop (V2R-18, jcpe-v2r-section-loop-jjsw);
   * exclusive with the whole-chart toggle, live re-bind included.
   */
  onSectionLoopToggle: (sectionId: string) => void;
  /** Display-only loop state: armed intent vs the transport's own truth. */
  readLoopState: () => Readonly<{
    enabled: boolean;
    engaged: boolean;
    sectionId: string | null;
  }>;
  /** Engaged loop span as run fractions for the scrub region; null if none. */
  readLoopRegion: () => Readonly<{
    startFraction: number;
    endFraction: number;
  }> | null;
  /**
   * U4 Restart (l3a.12.2): one intent — serialized Stop with the awaited
   * no-future-attack receipt, then Play from the run start. The source
   * flows into the gesture receipt exactly like Play.
   */
  onRestart: (source: "pointer" | "keyboard") => void;
  /**
   * U4 exact seek from the slider's keyboard law: an exact rational beat
   * (integers and half steps only — never a float approximation). Playing/
   * paused seeks the run; ready positions the next run's start.
   */
  onSeekBeat: (numerator: number, denominator: number) => void;
  /** U4 click toggles: ephemeral transport-session state, receipt-truth. */
  onCountInToggle: (enabled: boolean) => void;
  onMetronomeToggle: (enabled: boolean) => void;
  /** Display-only settled click toggles; the receipt is the only writer. */
  readClickToggles: () => Readonly<{
    countInEnabled: boolean;
    metronomeEnabled: boolean;
  }>;
  /**
   * Display-only instrument/groove boundary notice: `next-unstarted-note`
   * while playing, `next-play` while stopped. Cleared by the next accepted
   * notification or replacement.
   */
  readInstrumentBoundaryNotice: () => "next-unstarted-note" | "next-play" | null;
  /** Display-only ready-state scrub position in exact beats; null when unset. */
  readPendingRunStartBeats: () => number | null;
  /**
   * Live fader ride (jcpe-v2r-live-mix-btb4): audible during the drag, no
   * document write — the one undoable commit still lands on release.
   */
  onVolumePreview: (volume: number) => void;
  /** Session mute: gain to zero and back; the stored volume is untouched. */
  onMuteToggle: () => void;
  /** Display-only session mute state. */
  readMixState: () => Readonly<{ muted: boolean }>;
}>;

/**
 * V2R-2/V2R-6 display-only annotation ports. The chart never computes theory:
 * it reads a roman numeral per event and pencilled phrase spans per section
 * from the application's cached read ports, and renders nothing when a port
 * returns null — an absent analysis is shown as absent, never invented.
 */
export type StudioPhraseSpanView = Readonly<{
  label: string;
  fromEventId: string;
  toEventId: string;
}>;

export type StudioChartAnnotationPorts = Readonly<{
  romanForEvent: (eventId: string) => string | null;
  phrasesForSection: (sectionId: string) => readonly StudioPhraseSpanView[];
  /**
   * V2R-4 grid-card lines: the harmonic-function clause and the spelled
   * chord tones for one event. Null when the analysis honestly has nothing
   * to say (no key, custom chord, refused resolution) — the card renders
   * absence, never a guess.
   */
  functionForEvent: (eventId: string) => string | null;
  notesForEvent: (eventId: string) => string | null;
}>;

export type StudioShellProps = Readonly<{
  documentActions?: ComponentChildren;
  view: StudioShellView;
  callbacks: StudioShellCallbacks;
  transport: StudioTransportCallbacks;
  annotations: StudioChartAnnotationPorts;
  /** The U7 export workflow is only offered when the composition wired it. */
  midiExportAvailable: boolean;
}>;
