import { h, render } from "preact";
import { useState } from "preact/hooks";

import { StudioShell } from "../../src/ui/studio/StudioShell";
import type {
  StudioLayoutView,
  StudioPanelSide,
  StudioShellCallbacks,
  StudioShellView,
} from "../../src/ui/studio/studio-contract";

const BASE_VIEW: Omit<StudioShellView, "layout"> = Object.freeze({
  /* This harness proves responsive ownership, not the import surface. */
  midiImport: Object.freeze({
    available: false,
    statusLabel: "MIDI import is not available in this session.",
    refusal: null,
    salvage: null,
    salvageFailed: null,
    auto: null,
    summary: null,
    sonorities: Object.freeze([]),
    blockedReason: null,
    canCommit: false,
    traceJson: null,
    auditioning: false,
    overrides: null,
  }),
  document: Object.freeze({
    committedTitle: "Responsive ownership proof",
    titleDraft: "Responsive ownership proof",
    titleMaxCodePoints: 256,
    revisionLabel: "Revision 0",
    titleFeedback: Object.freeze({
      kind: "idle",
      message: "The committed document title is shown above.",
    }),
    canCommitTitle: false,
    canResetTitleDraft: false,
    canUndo: false,
    canRedo: false,
    canClearChart: false,
    clearArmed: false,
    clearLabel: "Clear",
    shareFeedback: null,
    shareCopied: false,
    undoDescription: "Nothing to undo",
    redoDescription: "Nothing to redo",
  }),
  quickEntry: Object.freeze({
    canClear: false,
    canInsert: false,
    codePointCount: 0,
    draftText: "",
    insertionPlan: Object.freeze({
      committable: false,
      label: "Nothing to insert yet",
      resolutions: Object.freeze([]),
      statement: "no-draft",
    }),
    issueCodes: Object.freeze([]),
    maxCodePoints: 4096,
    recovery: Object.freeze({
      acknowledged: false,
      acknowledgementLabel: "source-bar-and-section-layout-will-be-lost@1",
      available: false,
      durationDraft: "",
      measureLabel: null,
      remainderLabel: null,
      unavailableReason: null,
    }),
    refusalMessage: null,
    statusLabel: "No draft",
    targetLabel: "No insertion target",
    tokens: Object.freeze([]),
    truncationNotice: null,
  }),
  chart: Object.freeze({
    sectionCountLabel: "1 section",
    measureCountLabel: "1 measure",
    chordCountLabel: "0 chords",
    keyLabel: "No key",
    tempoLabel: "105 BPM",
    isSeededDemo: false,
    rovingFocusId: null,
    selectionCount: 0,
    selected: null,
    selectionStatusLabel: "No chord selected",
    canDeleteSelection: false,
    canDuplicateSelection: false,
    canMoveSelection: false,
    appendSectionLabel: "Append section",
    editRefusal: null,
    completionDialog: Object.freeze({ open: false, reasonDraft: "" }),
    openMenuChordId: null,
    viewMode: "compact",
    /* V2R-4 (jcpe-v2r-grid-uyyd): layout is presentation-only like viewMode. */
    layout: "sheet",
    range: Object.freeze({
      active: false,
      endBeatLabel: null,
      endDraft: "",
      hasRange: false,
      startBeatLabel: null,
      startDraft: "",
    }),
    sections: Object.freeze([
      Object.freeze({
        id: "responsive-proof-section",
        label: "A",
        measureCountLabel: "1 measure",
        appendMeasureLabel: "Append measure to section A",
        annotation: "",
        voiceLeadingBoundary: "reset",
        voiceLeadingLabel: "Voice leading resets at this boundary",
        canJoinNextSection: false,
        measures: Object.freeze([
          Object.freeze({
            id: "responsive-proof-measure",
            number: 1,
            meterLabel: "4/4",
            durationLabel: "4 beats",
            capacityLabel: "4 beats",
            startBeatLabel: "0",
            endBeatLabel: "4",
            chordCountLabel: "0 chords",
            keyLabel: "No key",
            tempoLabel: "105 BPM",
            fillLabel: "Empty",
            completionLabel: "Empty measure",
            completionReason: null,
            canSplitSectionHere: false,
            canDelete: false,
            deleteLabel: "Remove empty measure 1",
            isInsertionTarget: true,
            targetLabel: "Aim quick entry at measure 1",
            insertBeforeLabel: "Insert measure before measure 1",
            dropLabel: "Move selection into measure 1",
            chords: Object.freeze([]),
            state: "empty",
          }),
        ]),
      }),
    ]),
  }),
  harmony: Object.freeze({
    selectedChordLabel: null,
    selected: null,
    detail: null,
    selectionStatusLabel: "No chord events in this chart",
    emptyTitle: "Harmony begins with a real chord",
    emptyDescription:
      "Analysis will appear only for validated chord events.",
    documentFacts: Object.freeze([
      Object.freeze({ id: "meter", label: "Meter", value: "4/4" }),
      Object.freeze({ id: "key", label: "Key", value: "C major" }),
    ]),
    continuation: null,
  }),
  transport: Object.freeze({
    audioState: "unavailable",
    audioStatusLabel: "Audio off",
    audioStatusDetail: "Playback is unavailable in this focused proof.",
    tempoBpm: 120,
    instrumentLabel: "Studio piano",
    positionLabel: "Bar 1 · beat 1.0",
    positionExactLabel: "0/1 beats",
    currentChordLabel: null,
    progressPercent: null,
    /* V2R-8 footer fields, inert for these layout proofs. */
    grooveStyleId: "ballad-comp@1",
    grooveOptions: Object.freeze([
      Object.freeze({ id: "ballad-comp@1", label: "Ballad comp" }),
    ]),
    instrumentId: "concert-grand",
    instrumentOptions: Object.freeze([
      Object.freeze({ id: "concert-grand", label: "Concert Grand" }),
    ]),
    masterVolumePercent: 100,
    canStepPrevious: false,
    canStepNext: false,
    canTempoDown: false,
    canTempoUp: false,
  }),
  playback: Object.freeze({
    tempoBpm: 120,
    tempoDraft: "120",
    tempoFeedback: null,
    tempoInvalid: false,
    groove: Object.freeze({
      activeStyleId: "ballad-comp@1",
      options: Object.freeze([
        Object.freeze({ id: "ballad-comp@1", label: "Ballad" }),
        Object.freeze({ id: "medium-swing@1", label: "Medium swing" }),
      ]),
    }),
  }),
});

function ResponsiveStaleOwnerHarness() {
  const [activeSheet, setActiveSheet] = useState<StudioPanelSide | null>(null);
  const [dismissalCount, setDismissalCount] = useState(0);
  const [refusalCount, setRefusalCount] = useState(0);
  const [uiRefusal, setUiRefusal] = useState<
    StudioLayoutView["uiRefusal"]
  >(null);

  const view: StudioShellView = {
    ...BASE_VIEW,
    layout: {
      activeSheet,
      harmonyCollapsed: false,
      libraryCollapsed: false,
      uiRefusal,
    },
  };
  const callbacks: StudioShellCallbacks = {
    onMidiImportChooseFile: () => undefined,
    onMidiImportCommit: () => undefined,
    onMidiImportDiscard: () => undefined,
  onMidiImportAudition: () => undefined,
  onMidiImportOverridesChange: () => undefined,
    onTitleDraftChange: () => undefined,
    onCommitTitle: () => undefined,
    onResetTitleDraft: () => undefined,
    onUndo: () => undefined,
    onRedo: () => undefined,
    onClearChart: () => undefined,
    onRailCollapsedChange: () => undefined,
    onRequestPanelSheet: (side) => {
      setUiRefusal(null);
      setActiveSheet(side);
    },
    onDismissPanelSheet: () => {
      setDismissalCount((current) => current + 1);
      setActiveSheet(null);
    },
    onUiContractRefusal: (diagnostic) => {
      setRefusalCount((current) => current + 1);
      setActiveSheet(null);
      setUiRefusal({
        message: diagnostic.message,
        recoveryAction: diagnostic.recoveryAction,
      });
    },
    onQuickEntryClear: () => undefined,
    onQuickEntryDraftChange: () => undefined,
    onQuickEntryInsert: () => undefined,
    onTempoDraftChange: () => undefined,
    onTempoCommit: () => undefined,
    onCopyShareLink: () => undefined,
    onGrooveStyleChange: () => undefined,
    onLoadLibraryEntry: () => undefined,
    onAddSuggestedChord: () => undefined,
    onPreviewPitch: () => undefined,
    onCompletionDialogOpenChange: () => undefined,
    onDeclareMeasureCompletion: () => undefined,
    onRangeEdgeToChord: () => undefined,
    onRangeClear: () => undefined,
    onCompletionReasonDraftChange: () => undefined,
    onRecoveryAcknowledgeChange: () => undefined,
    onRecoveryDurationDraftChange: () => undefined,
    onInsertRecoveredChord: () => undefined,
    onSelectChord: () => undefined,
    onRovingFocusChange: () => undefined,
    onDeleteSelection: () => undefined,
    onDuplicateSelection: () => undefined,
    onMoveSelection: () => undefined,
    onInsertMeasure: () => undefined,
    onInsertSection: () => undefined,
    onApplyInlineSymbol: () => undefined,
    onApplyDuration: () => undefined,
    onResizeDuration: () => undefined,
    onConfirmIncompleteMeasure: () => undefined,
    onCancelPendingEdit: () => undefined,
    onRenameSection: () => undefined,
    onAnnotateSection: () => undefined,
    onSetSectionBoundary: () => undefined,
    onDropChordOnMeasure: () => undefined,
    onMoveSelectionToMeasure: () => undefined,
    onCardMenuOpenChange: () => undefined,
    onCardMenuAction: () => undefined,
    onSplitDuration: () => undefined,
    onSplitSection: () => undefined,
    onJoinSections: () => undefined,
    onDeleteMeasure: () => undefined,
    onSplitAtBar: () => undefined,
    onJoinNextMeasure: () => undefined,
    onSetInsertionPoint: () => undefined,
    onRangeModeChange: () => undefined,
    onRangeEdgeFromFocus: () => undefined,
    onRangeDraftChange: () => undefined,
    onRangeDraftCommit: () => undefined,
    onRangeCancel: () => undefined,
    onViewModeChange: () => undefined,
    onCycleKey: () => undefined,
    onChartLayoutChange: () => undefined,
    onDismissUiRefusal: () => {
      setUiRefusal(null);
    },
  };

  return h(
    "div",
    {
      "data-dismissal-count": String(dismissalCount),
      "data-harness-ready": "true",
      "data-refusal-count": String(refusalCount),
      id: "u0-responsive-stale-owner-harness",
    },
    h(StudioShell, {
      annotations: {
        functionForEvent: () => null,
        notesForEvent: () => null,
        phrasesForSection: () => [],
        romanForEvent: () => null,
      },
      callbacks,
      // U0 harness: the transport is out of scope for these layout proofs.
      transport: {
        canPlay: false,
        onPause: () => undefined,
        onPlay: () => undefined,
        onStop: () => undefined,
        onStepChord: () => undefined,
        onTempoStep: () => undefined,
        onGrooveChange: () => undefined,
        onInstrumentChange: () => undefined,
        onVolumeCommit: () => undefined,
        onVolumePreview: () => undefined,
        onMuteToggle: () => undefined,
        readMixState: () => ({ muted: false }),
        readMeterFrame: () => null,
        onSeekFraction: () => undefined,
        onLoopToggle: () => undefined,
        readLoopState: () => ({ enabled: false, engaged: false }),
      },
      view,
    }),
  );
}

const root = document.getElementById("u0-responsive-stale-owner-root");
if (!(root instanceof HTMLElement)) {
  throw new Error("U0_RESPONSIVE_STALE_OWNER_ROOT_MISSING");
}
render(h(ResponsiveStaleOwnerHarness, null), root);
