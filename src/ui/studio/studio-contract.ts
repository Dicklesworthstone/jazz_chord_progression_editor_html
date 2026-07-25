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
  undoDescription: string;
  redoDescription: string;
}>;

export type StudioChordCardView = Readonly<{
  id: string;
  ordinal: number;
  symbolText: string;
  durationLabel: string;
  voicingMode: "auto" | "manual" | "frozen";
  hasAnnotation: boolean;
  selected: boolean;
  inRange: boolean;
  accessibleName: string;
  /** Inline editing is offered only where exact stored pitches are not at risk. */
  inlineEditable: boolean;
  inlineEditBlockedReason: string | null;
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
  editRefusal: Readonly<{
    code: string;
    message: string;
    recoveryAction: string;
    /** Explicit resolutions; the surface never resolves a fill silently. */
    resolutions: readonly string[];
    needsIncompleteReason: boolean;
  }> | null;
}>;

export type StudioQuickEntryView = Readonly<{
  draftText: string;
  maxCodePoints: number;
  codePointCount: number;
  statusLabel: string;
  targetLabel: string;
  canInsert: boolean;
  canClear: boolean;
  issueCodes: readonly string[];
  refusalMessage: string | null;
}>;

export type StudioFactView = Readonly<{
  id: string;
  label: string;
  value: string;
}>;

export type StudioHarmonyView = Readonly<{
  selectedChordLabel: null;
  selectionStatusLabel: string;
  emptyTitle: string;
  emptyDescription: string;
  documentFacts: readonly StudioFactView[];
}>;

export type StudioTransportView = Readonly<{
  audioState: "unavailable";
  audioStatusLabel: string;
  audioStatusDetail: string;
  tempoBpm: number;
  instrumentLabel: string;
  positionLabel: string;
  currentChordLabel: string | null;
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

export type StudioShellView = Readonly<{
  document: StudioDocumentView;
  quickEntry: StudioQuickEntryView;
  chart: StudioChartView;
  harmony: StudioHarmonyView;
  transport: StudioTransportView;
  layout: StudioLayoutView;
}>;

export type StudioShellCallbacks = Readonly<{
  onTitleDraftChange: (value: string) => void;
  onCommitTitle: (value: string) => void;
  onResetTitleDraft: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onRailCollapsedChange: (
    side: StudioPanelSide,
    collapsed: boolean,
  ) => void;
  onRequestPanelSheet: (side: StudioPanelSide) => void;
  onDismissPanelSheet: () => void;
  onUiContractRefusal: (diagnostic: UiDiagnostic) => void;
  onDismissUiRefusal: () => void;
  onQuickEntryDraftChange: (value: string) => void;
  onQuickEntryInsert: () => void;
  onQuickEntryClear: () => void;
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
  onRenameSection: (sectionId: string, name: string) => void;
  onAnnotateSection: (sectionId: string, annotation: string) => void;
  onSetSectionBoundary: (
    sectionId: string,
    boundary: "reset" | "continue",
  ) => void;
  onDropChordOnMeasure: (measureId: string) => void;
}>;

export type StudioShellProps = Readonly<{
  view: StudioShellView;
  callbacks: StudioShellCallbacks;
}>;
