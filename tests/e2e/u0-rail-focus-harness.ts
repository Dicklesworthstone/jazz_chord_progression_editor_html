import { h, render } from "preact";
import { useState } from "preact/hooks";

import { HarmonyLens } from "../../src/ui/studio/HarmonyLens";
import { LibraryPanel } from "../../src/ui/studio/LibraryPanel";
import type { StudioHarmonyView } from "../../src/ui/studio/studio-contract";

const HARMONY_VIEW: StudioHarmonyView = Object.freeze({
  documentFacts: Object.freeze([
    Object.freeze({ id: "title", label: "Title", value: "Untitled Changes" }),
  ]),
  emptyDescription: "The test document has no selected chord.",
  emptyTitle: "No chord selected",
  selectedChordLabel: null,
  selectionStatusLabel: "No selection",
});

function RailFocusHarness() {
  const [libraryCollapsed, setLibraryCollapsed] = useState(false);
  const [harmonyCollapsed, setHarmonyCollapsed] = useState(false);

  return h(
    "main",
    { "data-rail-focus-ready": "true" },
    h(LibraryPanel, {
      collapsed: libraryCollapsed,
      onCollapsedChange: setLibraryCollapsed,
    }),
    h(HarmonyLens, {
      collapsed: harmonyCollapsed,
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
