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
  document: Object.freeze({
    committedTitle: "Responsive ownership proof",
    titleDraft: "Responsive ownership proof",
    titleMaxCodePoints: 256,
    lifecycleLabel: "Not exported",
    revisionLabel: "Revision 0",
    dirty: false,
    titleFeedback: Object.freeze({
      kind: "idle",
      message: "The committed document title is shown above.",
    }),
    canCommitTitle: false,
    canResetTitleDraft: false,
    canUndo: false,
    canRedo: false,
    undoDescription: "Nothing to undo",
    redoDescription: "Nothing to redo",
  }),
  chart: Object.freeze({
    sectionCountLabel: "1 section",
    measureCountLabel: "1 measure",
    chordCountLabel: "0 chords",
    sections: Object.freeze([
      Object.freeze({
        id: "responsive-proof-section",
        label: "A",
        measureCountLabel: "1 measure",
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
            state: "empty",
          }),
        ]),
      }),
    ]),
  }),
  harmony: Object.freeze({
    selectedChordLabel: null,
    selectionStatusLabel: "No chord events in this chart",
    emptyTitle: "Harmony begins with a real chord",
    emptyDescription:
      "Analysis will appear only for validated chord events.",
    documentFacts: Object.freeze([
      Object.freeze({ id: "meter", label: "Meter", value: "4/4" }),
      Object.freeze({ id: "key", label: "Key", value: "C major" }),
    ]),
  }),
  transport: Object.freeze({
    audioState: "unavailable",
    audioStatusLabel: "Audio unavailable",
    audioStatusDetail: "Playback is unavailable in this focused proof.",
    tempoBpm: 120,
    instrumentLabel: "Studio piano",
    positionLabel: "0 beats",
    currentChordLabel: null,
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
    onTitleDraftChange: () => undefined,
    onCommitTitle: () => undefined,
    onResetTitleDraft: () => undefined,
    onUndo: () => undefined,
    onRedo: () => undefined,
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
    h(StudioShell, { callbacks, view }),
  );
}

const root = document.getElementById("u0-responsive-stale-owner-root");
if (!(root instanceof HTMLElement)) {
  throw new Error("U0_RESPONSIVE_STALE_OWNER_ROOT_MISSING");
}
render(h(ResponsiveStaleOwnerHarness, null), root);
