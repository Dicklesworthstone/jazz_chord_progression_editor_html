import { ChartWorkspace } from "./ChartWorkspace";
import { HarmonyLens, HarmonyLensContent } from "./HarmonyLens";
import { LibraryPanel, LibraryPanelContent } from "./LibraryPanel";
import { StudioHeader } from "./StudioHeader";
import { StudioShellNotice } from "./StudioShellNotice";
import { TransportBar } from "./TransportBar";
import { SheetDrawer } from "../overlays";
import type { StudioShellProps } from "./studio-contract";

export function StudioShell({ view, callbacks }: StudioShellProps) {
  const activeSheet = view.layout.activeSheet;
  const sheetId =
    activeSheet === null ? null : `studio-${activeSheet}-sheet`;
  const sheetTitle = activeSheet === "library" ? "Library" : "Harmony Lens";
  const sheetDescription =
    activeSheet === "library"
      ? "Staged entry, palette, and lesson surfaces for this chart."
      : "Literal document facts and the current chord analysis surface.";
  const sheetTriggerId =
    activeSheet === "library"
      ? "studio-open-library-sheet"
      : "studio-open-harmony-sheet";

  return (
    <div
      class="studio-shell"
      data-app-ready="true"
      data-library-collapsed={view.layout.libraryCollapsed ? "true" : "false"}
      data-harmony-collapsed={view.layout.harmonyCollapsed ? "true" : "false"}
    >
      <div id="studio-shell-background" class="studio-shell__background">
        <div class="studio-shell__frame">
          <a class="studio-skip-link" href="#workspace" id="skip-link">
            Skip to studio workspace
          </a>

          <StudioHeader view={view.document} callbacks={callbacks} />

          <main id="workspace" class="studio-workspace" tabIndex={-1}>
            <LibraryPanel
              collapsed={view.layout.libraryCollapsed}
              onCollapsedChange={(collapsed) => {
                callbacks.onRailCollapsedChange("library", collapsed);
              }}
            />
            <ChartWorkspace
              view={view.chart}
              onRequestPanelSheet={callbacks.onRequestPanelSheet}
            />
            <HarmonyLens
              collapsed={view.layout.harmonyCollapsed}
              view={view.harmony}
              onCollapsedChange={(collapsed) => {
                callbacks.onRailCollapsedChange("harmony", collapsed);
              }}
            />
          </main>
        </div>
        <TransportBar view={view.transport} />
      </div>

      <div id="dialog-host">
        {activeSheet === null || sheetId === null ? null : (
          <SheetDrawer
            backgroundRootId="studio-shell-background"
            busy={false}
            closeLabel={`Close ${sheetTitle}`}
            content={
              activeSheet === "library" ? (
                <LibraryPanelContent
                  context="sheet"
                  headingId={`${sheetId}-title`}
                />
              ) : (
                <HarmonyLensContent
                  context="sheet"
                  headingId={`${sheetId}-title`}
                  view={view.harmony}
                />
              )
            }
            contextRevealCssPx={48}
            density="comfortable"
            describedBy={[]}
            description={sheetDescription}
            disabled={false}
            dismissibility={{ kind: "dismissible" }}
            focusTargets={{
              triggerId: sheetTriggerId,
              workflowTargetId: null,
              workspaceId: "workspace",
            }}
            id={sheetId}
            initialFocus="heading"
            initialFocusId={null}
            invalid={false}
            mode="modal"
            onContractRefusal={callbacks.onUiContractRefusal}
            onDismiss={callbacks.onDismissPanelSheet}
            open
            side={activeSheet === "library" ? "inline-start" : "block-end"}
            title={sheetTitle}
          />
        )}
      </div>
      <div id="notice-region">
        {view.layout.uiRefusal === null ? null : (
          <StudioShellNotice
            refusal={view.layout.uiRefusal}
            onDismiss={callbacks.onDismissUiRefusal}
          />
        )}
      </div>
      <div id="help" />
    </div>
  );
}
