import { ChartWorkspace } from "./ChartWorkspace";
import { HarmonyLens, HarmonyLensContent } from "./HarmonyLens";
import { LibraryPanel, LibraryPanelContent } from "./LibraryPanel";
import { StudioHeader } from "./StudioHeader";
import { StudioShellNotice } from "./StudioShellNotice";
import { TransportBar } from "./TransportBar";
import { Dialog, SheetDrawer } from "../overlays";
import { Button } from "../primitives";
import type { StudioShellProps } from "./studio-contract";

/**
 * U1-CMP-019 MeasureCompletionDialog. A measure that stays shorter than the
 * bar is declared here, with a reason the caller types and Confirm disabled
 * until it exists. Nothing is rebalanced, padded, or assumed on their behalf.
 */
function MeasureCompletionDialogContent({
  reasonDraft,
  message,
  onReasonDraftChange,
  onConfirm,
  onCancel,
}: Readonly<{
  reasonDraft: string;
  message: string;
  onReasonDraftChange: (value: string) => void;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}>) {
  return (
    <div class="studio-completion-dialog">
      <p class="studio-completion-dialog__refusal">{message}</p>
      <label
        class="studio-completion-dialog__label"
        for="studio-incomplete-reason"
      >
        Reason for the incomplete measure
      </label>
      <input
        class="studio-completion-dialog__field"
        data-testid="incomplete-reason-field"
        id="studio-incomplete-reason"
        onInput={(event) => {
          onReasonDraftChange(event.currentTarget.value);
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          if (reasonDraft.trim().length === 0) return;
          onConfirm(reasonDraft);
        }}
        type="text"
        value={reasonDraft}
      />
      <div class="studio-completion-dialog__actions">
        <Button
          busy={false}
          density="comfortable"
          describedBy={[]}
          disabled={reasonDraft.trim().length === 0}
          id="studio-confirm-incomplete"
          invalid={false}
          label="Confirm incomplete measure"
          onAction={() => {
            onConfirm(reasonDraft);
          }}
          type="button"
          variant="primary"
        />
        <Button
          busy={false}
          density="comfortable"
          describedBy={[]}
          disabled={false}
          id="studio-abandon-pending-edit"
          invalid={false}
          label="Cancel the edit"
          onAction={onCancel}
          type="button"
          variant="secondary"
        />
      </div>
    </div>
  );
}

export function StudioShell({
  view,
  callbacks,
  transport,
}: StudioShellProps) {
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
              sheetOpen={activeSheet === "library"}
              onInsertRecoveredChord={callbacks.onInsertRecoveredChord}
              onRecoveryAcknowledgeChange={callbacks.onRecoveryAcknowledgeChange}
              onRecoveryDurationDraftChange={
                callbacks.onRecoveryDurationDraftChange
              }
              onQuickEntryClear={callbacks.onQuickEntryClear}
              onQuickEntryDraftChange={callbacks.onQuickEntryDraftChange}
              onQuickEntryInsert={callbacks.onQuickEntryInsert}
              onTempoDraftChange={callbacks.onTempoDraftChange}
              onTempoCommit={callbacks.onTempoCommit}
              onGrooveStyleChange={callbacks.onGrooveStyleChange}
              onLoadLibraryEntry={callbacks.onLoadLibraryEntry}
              playback={view.playback}
              quickEntry={view.quickEntry}
              onCollapsedChange={(collapsed) => {
                callbacks.onRailCollapsedChange("library", collapsed);
              }}
            />
            <ChartWorkspace
              onApplyDuration={callbacks.onApplyDuration}
              onApplyInlineSymbol={callbacks.onApplyInlineSymbol}
              onCancelPendingEdit={callbacks.onCancelPendingEdit}
              onAnnotateSection={callbacks.onAnnotateSection}
              onDeclareMeasureCompletion={callbacks.onDeclareMeasureCompletion}
              onRenameSection={callbacks.onRenameSection}
              onSetSectionBoundary={callbacks.onSetSectionBoundary}
              onDeleteSelection={callbacks.onDeleteSelection}
              onDropChordOnMeasure={callbacks.onDropChordOnMeasure}
              onDuplicateSelection={callbacks.onDuplicateSelection}
              onInsertMeasure={callbacks.onInsertMeasure}
              onInsertSection={callbacks.onInsertSection}
              onMoveSelection={callbacks.onMoveSelection}
              onRequestPanelSheet={callbacks.onRequestPanelSheet}
              onRovingFocusChange={callbacks.onRovingFocusChange}
              onSelectChord={callbacks.onSelectChord}
              onCardMenuOpenChange={callbacks.onCardMenuOpenChange}
              onCardMenuAction={callbacks.onCardMenuAction}
              onSplitDuration={callbacks.onSplitDuration}
              onSplitSection={callbacks.onSplitSection}
              onJoinSections={callbacks.onJoinSections}
              onDeleteMeasure={callbacks.onDeleteMeasure}
              onSplitAtBar={callbacks.onSplitAtBar}
              onSetInsertionPoint={callbacks.onSetInsertionPoint}
              onRangeModeChange={callbacks.onRangeModeChange}
              onRangeEdgeFromFocus={callbacks.onRangeEdgeFromFocus}
              onRangeEdgeToChord={callbacks.onRangeEdgeToChord}
              onRangeDraftChange={callbacks.onRangeDraftChange}
              onRangeDraftCommit={callbacks.onRangeDraftCommit}
              onRangeCancel={callbacks.onRangeCancel}
              onRangeClear={callbacks.onRangeClear}
              onViewModeChange={callbacks.onViewModeChange}
              view={view.chart}
            />
            <HarmonyLens
              collapsed={view.layout.harmonyCollapsed}
              sheetOpen={activeSheet === "harmony"}
              view={view.harmony}
              onAddSuggestedChord={callbacks.onAddSuggestedChord}
              onCollapsedChange={(collapsed) => {
                callbacks.onRailCollapsedChange("harmony", collapsed);
              }}
            />
          </main>
        </div>
        <TransportBar
          canPlay={transport.canPlay}
          onPause={transport.onPause}
          onPlay={transport.onPlay}
          onStop={transport.onStop}
          view={view.transport}
        />
      </div>

      <div id="dialog-host">
        {view.chart.completionDialog.open && view.chart.editRefusal !== null ? (
          <Dialog
            backgroundRootId="studio-shell-background"
            busy={false}
            closeLabel="Close the incomplete-measure dialog"
            content={
              <MeasureCompletionDialogContent
                message={view.chart.editRefusal.message}
                onCancel={callbacks.onCancelPendingEdit}
                onConfirm={callbacks.onConfirmIncompleteMeasure}
                onReasonDraftChange={callbacks.onCompletionReasonDraftChange}
                reasonDraft={view.chart.completionDialog.reasonDraft}
              />
            }
            density="comfortable"
            describedBy={[]}
            description="This measure would stay shorter than the bar. Declare it explicitly or cancel the edit."
            disabled={false}
            dismissibility={{ kind: "dismissible" }}
            /**
             * The chart region owns the interrupted operation and outlives
             * every refusal notice, so focus returns exactly where the work
             * was. A control inside the notice would be removed by the very
             * success that closes this dialog.
             */
            focusTargets={{
              triggerId: "chart-workspace",
              workflowTargetId: null,
              workspaceId: "workspace",
            }}
            id="studio-measure-completion-dialog"
            initialFocus="explicit"
            initialFocusId="studio-incomplete-reason"
            invalid={false}
            onContractRefusal={callbacks.onUiContractRefusal}
            onDismiss={() => {
              callbacks.onCompletionDialogOpenChange(false);
            }}
            open
            title="Declare an incomplete measure"
          />
        ) : null}
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
                  onInsertRecoveredChord={callbacks.onInsertRecoveredChord}
                  onRecoveryAcknowledgeChange={
                    callbacks.onRecoveryAcknowledgeChange
                  }
                  onRecoveryDurationDraftChange={
                    callbacks.onRecoveryDurationDraftChange
                  }
                  onQuickEntryClear={callbacks.onQuickEntryClear}
                  onQuickEntryDraftChange={callbacks.onQuickEntryDraftChange}
                  onQuickEntryInsert={callbacks.onQuickEntryInsert}
                  onTempoDraftChange={callbacks.onTempoDraftChange}
                  onTempoCommit={callbacks.onTempoCommit}
                  onGrooveStyleChange={callbacks.onGrooveStyleChange}
              onLoadLibraryEntry={callbacks.onLoadLibraryEntry}
                  playback={view.playback}
                  quickEntry={view.quickEntry}
                />
              ) : (
                <HarmonyLensContent
                  context="sheet"
                  headingId={`${sheetId}-title`}
                  view={view.harmony}
                  onAddSuggestedChord={callbacks.onAddSuggestedChord}
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
