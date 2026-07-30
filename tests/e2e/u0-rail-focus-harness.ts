import { h, render } from "preact";
import { useState } from "preact/hooks";

import { HarmonyLens } from "../../src/ui/studio/HarmonyLens";
import { LibraryPanel } from "../../src/ui/studio/LibraryPanel";
import type { StudioHarmonyView } from "../../src/ui/studio/studio-contract";

const HARMONY_VIEW: StudioHarmonyView = Object.freeze({
  documentFacts: Object.freeze([
    Object.freeze({ id: "title", label: "Title", value: "Untitled Chart" }),
  ]),
  emptyDescription: "The test document has no selected chord.",
  emptyTitle: "No chord selected",
  selectedChordLabel: null,
  selected: null,
  selectionStatusLabel: "No selection",
  continuation: null,
});

function RailFocusHarness() {
  const [libraryCollapsed, setLibraryCollapsed] = useState(false);
  const [harmonyCollapsed, setHarmonyCollapsed] = useState(false);

  return h(
    "main",
    { "data-rail-focus-ready": "true" },
    h(LibraryPanel, {
      onInsertRecoveredChord: () => undefined,
      onQuickEntryClear: () => undefined,
      onQuickEntryDraftChange: () => undefined,
      onQuickEntryInsert: () => undefined,
      onTempoDraftChange: () => undefined,
      onTempoCommit: () => undefined,
      onGrooveStyleChange: () => undefined,
      onRecoveryAcknowledgeChange: () => undefined,
      onRecoveryDurationDraftChange: () => undefined,
      playback: Object.freeze({
        tempoBpm: 105,
        tempoDraft: "105",
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
      quickEntry: {
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
        issueCodes: [],
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
      },
      collapsed: libraryCollapsed,
      onCollapsedChange: setLibraryCollapsed,
    }),
    h(HarmonyLens, {
      collapsed: harmonyCollapsed,
      onAddSuggestedChord: () => undefined,
      onCollapsedChange: setHarmonyCollapsed,
      view: HARMONY_VIEW,
    }),
  );
}

const root = document.getElementById("u0-rail-focus-root");
if (!(root instanceof HTMLElement)) {
  throw new Error("U0_RAIL_FOCUS_ROOT_MISSING");
}
render(h(RailFocusHarness, null), root);
