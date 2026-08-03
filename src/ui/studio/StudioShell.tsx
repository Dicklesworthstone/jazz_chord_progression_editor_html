import { useEffect, useRef, useState } from "preact/hooks";

import { ChartWorkspace } from "./ChartWorkspace";
import { HarmonyLens, HarmonyLensContent } from "./HarmonyLens";
import { LibraryPanel, LibraryPanelContent } from "./LibraryPanel";
import { StudioHeader } from "./StudioHeader";
import { StudioShellNotice } from "./StudioShellNotice";
import { TransportBar } from "./TransportBar";
import { Dialog, SheetDrawer } from "../overlays";
import { Button } from "../primitives";
import type {
  StudioCardMenuAction,
  StudioShellProps,
} from "./studio-contract";

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
  /*
   * jcpe-disi.3 labeled undo. Every mutation path already flows through the
   * callbacks this shell hands down, so the sentence is composed centrally
   * at dispatch — but it is only PROMOTED to the visible notice once the
   * document revision actually advances. A refusal leaves the revision
   * unchanged, so a refused intent can never produce a lying notice.
   */
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const pendingNotice = useRef<{
    revisionLabel: string;
    sentence: string;
  } | null>(null);
  const revisionLabel = view.document.revisionLabel;
  useEffect(() => {
    const staged = pendingNotice.current;
    if (staged !== null && staged.revisionLabel !== revisionLabel) {
      pendingNotice.current = null;
      setActionNotice(staged.sentence);
    }
  }, [revisionLabel]);

  const chordPlaces = new Map<
    string,
    Readonly<{ bar: number; inRange: boolean; selected: boolean; symbol: string }>
  >();
  const measureBars = new Map<string, number>();
  for (const section of view.chart.sections) {
    for (const measure of section.measures) {
      measureBars.set(measure.id, measure.number);
      for (const chord of measure.chords) {
        chordPlaces.set(chord.id, {
          bar: measure.number,
          inRange: chord.inRange,
          selected: chord.selected,
          symbol: chord.symbolText,
        });
      }
    }
  }
  const selectionPhrase = (): string | null => {
    const ranged = [...chordPlaces.values()].filter((place) => place.inRange);
    if (ranged.length > 1) return `${String(ranged.length)} chords`;
    const chosen = [...chordPlaces.values()].find((place) => place.selected);
    return chosen === null || chosen === undefined
      ? null
      : `${chosen.symbol} from bar ${String(chosen.bar)}`;
  };
  const stage = (sentence: string | null): void => {
    if (sentence !== null) pendingNotice.current = { revisionLabel, sentence };
  };
  const forgetNotice = (): void => {
    pendingNotice.current = null;
    setActionNotice(null);
  };
  const chordSentence = (
    chordId: string,
    compose: (place: Readonly<{ bar: number; symbol: string }>) => string,
  ): string | null => {
    const place = chordPlaces.get(chordId);
    return place === undefined ? null : compose(place);
  };
  const menuActionSentence = (
    chordId: string,
    action: string,
  ): string | null => {
    switch (action) {
      case "delete":
        return chordSentence(
          chordId,
          (p) => `Deleted ${p.symbol} from bar ${String(p.bar)}`,
        );
      case "duplicate":
        return chordSentence(chordId, (p) => `Duplicated ${p.symbol}`);
      case "move-previous":
        return chordSentence(chordId, (p) => `Moved ${p.symbol} earlier`);
      case "move-next":
        return chordSentence(chordId, (p) => `Moved ${p.symbol} later`);
      case "move-following":
        return chordSentence(
          chordId,
          (p) => `Moved the chords after ${p.symbol}`,
        );
      case "join-next":
        return chordSentence(
          chordId,
          (p) => `Joined ${p.symbol} with the next chord`,
        );
      default:
        return null;
    }
  };
  const shellCallbacks = {
    ...callbacks,
    onApplyDuration: (chordId: string, beatText: string) => {
      stage(
        chordSentence(
          chordId,
          (p) => `Changed the length of ${p.symbol} in bar ${String(p.bar)}`,
        ),
      );
      callbacks.onApplyDuration(chordId, beatText);
    },
    onApplyInlineSymbol: (chordId: string, symbolText: string) => {
      stage(
        chordSentence(
          chordId,
          (p) =>
            `Changed ${p.symbol} to ${symbolText.trim()} in bar ${String(p.bar)}`,
        ),
      );
      callbacks.onApplyInlineSymbol(chordId, symbolText);
    },
    onCardMenuAction: (chordId: string, action: StudioCardMenuAction) => {
      stage(menuActionSentence(chordId, action));
      callbacks.onCardMenuAction(chordId, action);
    },
    onDeleteMeasure: (measureId: string) => {
      const bar = measureBars.get(measureId);
      stage(bar === undefined ? null : `Deleted bar ${String(bar)}`);
      callbacks.onDeleteMeasure(measureId);
    },
    onDeleteSelection: () => {
      const phrase = selectionPhrase();
      stage(phrase === null ? null : `Deleted ${phrase}`);
      callbacks.onDeleteSelection();
    },
    onDropChordOnMeasure: (measureId: string) => {
      const bar = measureBars.get(measureId);
      const phrase = selectionPhrase();
      stage(
        phrase === null || bar === undefined
          ? null
          : `Moved ${phrase} to bar ${String(bar)}`,
      );
      callbacks.onDropChordOnMeasure(measureId);
    },
    onDuplicateSelection: () => {
      const phrase = selectionPhrase();
      stage(phrase === null ? null : `Duplicated ${phrase}`);
      callbacks.onDuplicateSelection();
    },
    onMidiImportCommit: () => {
      stage("Imported the MIDI file into the chart");
      callbacks.onMidiImportCommit();
    },
    onMoveSelection: (direction: "previous" | "next") => {
      const phrase = selectionPhrase();
      stage(
        phrase === null
          ? null
          : `Moved ${phrase} ${direction === "previous" ? "earlier" : "later"}`,
      );
      callbacks.onMoveSelection(direction);
    },
    onQuickEntryInsert: () => {
      stage("Inserted the draft into the chart");
      callbacks.onQuickEntryInsert();
    },
    onRedo: () => {
      forgetNotice();
      callbacks.onRedo();
    },
    onSplitDuration: (chordId: string, firstBeats: string) => {
      stage(
        chordSentence(
          chordId,
          (p) => `Split ${p.symbol} in bar ${String(p.bar)}`,
        ),
      );
      callbacks.onSplitDuration(chordId, firstBeats);
    },
    onUndo: () => {
      forgetNotice();
      callbacks.onUndo();
    },
  };

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

          <StudioHeader view={view.document} callbacks={shellCallbacks} />

          <main id="workspace" class="studio-workspace" tabIndex={-1}>
            <LibraryPanel
              collapsed={view.layout.libraryCollapsed}
              sheetOpen={activeSheet === "library"}
              midiImport={view.midiImport}
              onMidiImportChooseFile={callbacks.onMidiImportChooseFile}
              onMidiImportCommit={shellCallbacks.onMidiImportCommit}
              onMidiImportDiscard={callbacks.onMidiImportDiscard}
              onInsertRecoveredChord={callbacks.onInsertRecoveredChord}
              onRecoveryAcknowledgeChange={callbacks.onRecoveryAcknowledgeChange}
              onRecoveryDurationDraftChange={
                callbacks.onRecoveryDurationDraftChange
              }
              onQuickEntryClear={callbacks.onQuickEntryClear}
              onQuickEntryDraftChange={callbacks.onQuickEntryDraftChange}
              onQuickEntryInsert={shellCallbacks.onQuickEntryInsert}
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
              onApplyDuration={shellCallbacks.onApplyDuration}
              onApplyInlineSymbol={shellCallbacks.onApplyInlineSymbol}
              onCancelPendingEdit={callbacks.onCancelPendingEdit}
              onAnnotateSection={callbacks.onAnnotateSection}
              onDeclareMeasureCompletion={callbacks.onDeclareMeasureCompletion}
              onRenameSection={callbacks.onRenameSection}
              onSetSectionBoundary={callbacks.onSetSectionBoundary}
              onDeleteSelection={shellCallbacks.onDeleteSelection}
              onDropChordOnMeasure={shellCallbacks.onDropChordOnMeasure}
              onDuplicateSelection={shellCallbacks.onDuplicateSelection}
              onInsertMeasure={callbacks.onInsertMeasure}
              onInsertSection={callbacks.onInsertSection}
              onMoveSelection={shellCallbacks.onMoveSelection}
              onRequestPanelSheet={callbacks.onRequestPanelSheet}
              onRovingFocusChange={callbacks.onRovingFocusChange}
              onSelectChord={callbacks.onSelectChord}
              onCardMenuOpenChange={callbacks.onCardMenuOpenChange}
              onCardMenuAction={shellCallbacks.onCardMenuAction}
              onSplitDuration={shellCallbacks.onSplitDuration}
              onSplitSection={callbacks.onSplitSection}
              onJoinSections={callbacks.onJoinSections}
              onDeleteMeasure={shellCallbacks.onDeleteMeasure}
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

          {/*
            jcpe-disi.3: the labeled-undo notice. The region always exists so
            aria-live announcement works; content appears only after a
            command verifiably landed (revision advanced). No timers — the
            sentence persists until the next action, an undo, or dismissal.
          */}
          <div
            aria-live="polite"
            class="studio-action-notice"
            data-testid="action-notice"
            data-empty={actionNotice === null ? "true" : "false"}
            role="status"
          >
            {actionNotice === null ? null : (
              <>
                <p class="studio-action-notice__sentence">{actionNotice}</p>
                <Button
                  busy={false}
                  density="dense"
                  describedBy={[]}
                  disabled={!view.document.canUndo}
                  id="studio-action-undo"
                  invalid={false}
                  label="Undo"
                  onAction={shellCallbacks.onUndo}
                  type="button"
                  variant="secondary"
                />
                <button
                  aria-label="Dismiss this notice"
                  class="studio-icon-button studio-action-notice__dismiss"
                  id="studio-action-dismiss"
                  onClick={forgetNotice}
                  type="button"
                >
                  ×
                </button>
              </>
            )}
          </div>
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
                  midiImport={view.midiImport}
                  onMidiImportChooseFile={callbacks.onMidiImportChooseFile}
                  onMidiImportCommit={shellCallbacks.onMidiImportCommit}
                  onMidiImportDiscard={callbacks.onMidiImportDiscard}
                  onInsertRecoveredChord={callbacks.onInsertRecoveredChord}
                  onRecoveryAcknowledgeChange={
                    callbacks.onRecoveryAcknowledgeChange
                  }
                  onRecoveryDurationDraftChange={
                    callbacks.onRecoveryDurationDraftChange
                  }
                  onQuickEntryClear={callbacks.onQuickEntryClear}
                  onQuickEntryDraftChange={callbacks.onQuickEntryDraftChange}
                  onQuickEntryInsert={shellCallbacks.onQuickEntryInsert}
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
