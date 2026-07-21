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
}>;

export type StudioSectionView = Readonly<{
  id: string;
  label: string;
  measureCountLabel: string;
  measures: readonly StudioMeasureView[];
}>;

export type StudioChartView = Readonly<{
  sectionCountLabel: string;
  measureCountLabel: string;
  chordCountLabel: string;
  sections: readonly StudioSectionView[];
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
}>;

export type StudioShellProps = Readonly<{
  view: StudioShellView;
  callbacks: StudioShellCallbacks;
}>;
