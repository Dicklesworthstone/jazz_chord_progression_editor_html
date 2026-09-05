import { useEffect, useRef, useState } from "preact/hooks";

import { CommandLaneContent } from "./CommandLane";
import { TourDialogContent } from "./TourDialog";

import { ChartWorkspace } from "./ChartWorkspace";
import { HarmonyLens, HarmonyLensContent } from "./HarmonyLens";
import { MidiExportPanel } from "./MidiExportPanel";
import {
  LibraryPanel,
  LibraryPanelContent,
  StandardProgressionList,
} from "./LibraryPanel";
import { StudioHeader } from "./StudioHeader";
import { StudioShellNotice } from "./StudioShellNotice";
import { TransportBar, TransportSettings } from "./TransportBar";
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

/*
 * A stable dismissibility identity (jcpe-v2r-entry-5zz7): the overlay
 * preflight re-runs whenever this prop's identity changes, and a re-run
 * while the modal lease holds the background inert reads its own trigger
 * as unavailable. An inline literal re-created every render turned each
 * keystroke inside a dialog into a false stale-owner refusal.
 */
const DISMISSIBLE = Object.freeze({ kind: "dismissible" } as const);

export function StudioShell({
  documentActions,
  view,
  callbacks,
  transport,
  annotations,
  midiExportAvailable,
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
    // A multi-chord selection marks every member `selected`; the separate
    // range feature marks `inRange`. Either plurality reads as "N chords".
    const places = [...chordPlaces.values()];
    const chosen = places.filter((place) => place.selected);
    const ranged = places.filter((place) => place.inRange);
    const plural = Math.max(chosen.length, ranged.length);
    if (plural > 1) return `${String(plural)} chords`;
    const single = chosen[0];
    return single === undefined
      ? null
      : `${single.symbol} from bar ${String(single.bar)}`;
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
    onMoveSelectionToMeasure: (measureId: string) => {
      const bar = measureBars.get(measureId);
      const phrase = selectionPhrase();
      stage(
        phrase === null || bar === undefined
          ? null
          : `Moved ${phrase} to bar ${String(bar)}`,
      );
      callbacks.onMoveSelectionToMeasure(measureId);
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
    onResizeDuration: (chordId: string, beatText: string) => {
      stage(
        chordSentence(
          chordId,
          (place) =>
            `Changed the length of ${place.symbol} in bar ${String(place.bar)}`,
        ),
      );
      callbacks.onResizeDuration(chordId, beatText);
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

  /*
   * The command lane (jcpe-v2r-entry-5zz7): the ⌘K "type the changes" route.
   * Open/closed is pure presentation state; every musical fact inside it is
   * the real quick-entry draft surface (A0 draft, T0 parse tokens, the
   * insertion plan) rendered with the prototype's dialog treatment. The
   * global keys live here because the shell owns both the trigger and the
   * undo/redo callbacks; bare letters stay unbound until their surfaces
   * exist (V=grid V2R-4, I=detail V2R-7, ?=tour V2R-11).
   */
  const [commandLaneOpen, setCommandLaneOpen] = useState(false);
  /*
   * The Standards modal (jcpe-v2r-library-ulwb): the prototype's
   * "Load a set of changes" surface for widths where the library rail is
   * hidden. Open/closed is pure presentation; every row rides the same
   * application-owned load as the rail list.
   */
  const [standardsOpen, setStandardsOpen] = useState(false);
  /*
   * The tour (jcpe-v2r-tour-i504): auto-opens once per browser via the
   * jz.tour marker (storage failures stay silent — file:// private modes),
   * and reopens from the ? header button or the bare ? key.
   */
  const [tourOpen, setTourOpen] = useState<boolean>(() => {
    try {
      /*
       * Automation contexts (navigator.webdriver) skip the auto-open: a
       * modal over a pristine studio would front-run every pinned entry
       * flow in the e2e matrix. The ? button and ? key stay the covered
       * paths; first-visit auto-open is verified manually.
       */
      if (window.navigator.webdriver) return false;
      return window.localStorage.getItem("jz.tour") === null;
    } catch {
      return false;
    }
  });
  const [tourStep, setTourStep] = useState(0);
  const closeTour = (): void => {
    try {
      window.localStorage.setItem("jz.tour", "1");
    } catch {
      /* Presentation marker only. */
    }
    setTourOpen(false);
    setTourStep(0);
  };
  const completionDialogOpen =
    view.chart.completionDialog.open && view.chart.editRefusal !== null;
  const onUndoRef = useRef(shellCallbacks.onUndo);
  const onRedoRef = useRef(shellCallbacks.onRedo);
  onUndoRef.current = shellCallbacks.onUndo;
  onRedoRef.current = shellCallbacks.onRedo;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      const target = event.target;
      const editingTarget =
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);
      if (key === "k" && !event.shiftKey) {
        event.preventDefault();
        setCommandLaneOpen((open) => !open);
        return;
      }
      /* Text fields keep the browser's own undo stack. */
      if (editingTarget) return;
      if (key === "z") {
        event.preventDefault();
        if (event.shiftKey) onRedoRef.current();
        else onUndoRef.current();
      }
    };
    /*
     * Bare-letter shortcuts never fire inside editing controls (U0 law) and
     * never carry a modifier: L opens the Standards modal, matching the
     * prototype's key map.
     */
    const onBareKey = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      const editingTarget =
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);
      if (editingTarget) return;
      if (event.key.toLowerCase() === "l") {
        /*
         * Polish round (owner report 2026-08-04): from 80rem the library
         * rail already shows the standards and the Standards button is
         * CSS-hidden — opening the modal there tripped the overlay's
         * trigger-visibility preflight into a "Panel could not open"
         * banner. The key mirrors its trigger: hidden trigger, inert key.
         */
        const trigger = document.getElementById("studio-open-standards");
        if (trigger === null || trigger.offsetParent === null) return;
        event.preventDefault();
        setStandardsOpen(true);
        return;
      }
      if (event.key === "?") {
        event.preventDefault();
        setTourStep(0);
        setTourOpen(true);
      }
    };
    window.addEventListener("keydown", onBareKey);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keydown", onBareKey);
    };
  }, []);

  /*
   * In the short-viewport window the sticky panel dock retires and the
   * transport bar carries the Library/Harmony triggers instead
   * (jcpe-ui-nits-320-triggers-undo-audit-s9r2). Sheet close restores
   * focus to its declared trigger and REFUSES a hidden one
   * (ui.stale_owner), so the declared trigger must track which mechanism
   * is actually visible.
   */
  const [shortViewportDock, setShortViewportDock] = useState(() =>
    typeof window === "undefined"
      ? false
      : window.matchMedia(
          "(max-width: 39.999rem) and (max-height: 37.49rem)",
        ).matches,
  );
  useEffect(() => {
    const query = window.matchMedia(
      "(max-width: 39.999rem) and (max-height: 37.49rem)",
    );
    const onChange = () => {
      setShortViewportDock(query.matches);
    };
    query.addEventListener("change", onChange);
    return () => {
      query.removeEventListener("change", onChange);
    };
  }, []);

  const activeSheet = view.layout.activeSheet;
  /* The export workflow presents as a sheet below the compact breakpoint; the
   * modal dialog owns it everywhere else (the frozen U7 accessibility matrix). */
  const exportOpen = view.midiExport.state !== null && activeSheet !== "export";
  const sheetId =
    activeSheet === null ? null : `studio-${activeSheet}-sheet`;
  const sheetTitle =
    activeSheet === "library"
      ? "Library"
      : activeSheet === "sound"
        ? "Sound"
        : activeSheet === "export"
          ? "MIDI export"
          : "Harmony Lens";
  const sheetDescription =
    activeSheet === "library"
      ? "Staged entry, palette, and lesson surfaces for this chart."
      : activeSheet === "sound"
        ? "Instrument, groove, tempo, and volume for this session."
        : activeSheet === "export"
          ? "Preview, generate, and download this chart as a MIDI file."
          : "Literal document facts and the current chord analysis surface.";
  const sheetTriggerId =
    activeSheet === "library"
      ? shortViewportDock
        ? "studio-transport-open-library"
        : "studio-open-library-sheet"
      : activeSheet === "sound"
        ? "studio-open-sound-sheet"
        : activeSheet === "export"
          ? "studio-export-midi"
          : shortViewportDock
            ? "studio-transport-open-harmony"
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
          <a class="studio-skip-link" href="#workspace" id="skip-link" tabIndex={0}>
            Skip to studio workspace
          </a>

          <StudioHeader
            documentActions={documentActions}
            view={view.document}
            callbacks={shellCallbacks}
            chartLayout={view.chart.layout}
            midiExportAvailable={midiExportAvailable}
            onOpenCommandLane={() => {
              setCommandLaneOpen(true);
            }}
            onOpenTour={() => {
              setTourStep(0);
              setTourOpen(true);
            }}
            onOpenStandards={() => {
              setStandardsOpen(true);
            }}
          />

          <main id="workspace" class="studio-workspace" tabIndex={-1}>
            <LibraryPanel
              collapsed={view.layout.libraryCollapsed}
              sheetOpen={activeSheet === "library"}
              midiImport={view.midiImport}
              onMidiImportChooseFile={callbacks.onMidiImportChooseFile}
              onMidiImportCommit={shellCallbacks.onMidiImportCommit}
              onMidiImportDiscard={callbacks.onMidiImportDiscard}
              onMidiImportAudition={callbacks.onMidiImportAudition}
              onMidiImportOverridesChange={callbacks.onMidiImportOverridesChange}
              onInsertRecoveredChord={callbacks.onInsertRecoveredChord}
              onRecoveryAcknowledgeChange={callbacks.onRecoveryAcknowledgeChange}
              onRecoveryDurationDraftChange={
                callbacks.onRecoveryDurationDraftChange
              }
              onOpenCommandLane={() => {
                setCommandLaneOpen(true);
              }}
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
              onStartFoundation={() => {
                callbacks.onLoadLibraryEntry("two-five-one");
              }}
              onOpenCommandLane={() => {
                setCommandLaneOpen(true);
              }}
              onOpenStandards={() => {
                setStandardsOpen(true);
              }}
              actionNotice={actionNotice}
              annotations={annotations}
              document={view.document}
              onTitleDraftChange={callbacks.onTitleDraftChange}
              onCommitTitle={callbacks.onCommitTitle}
              onResetTitleDraft={callbacks.onResetTitleDraft}
              canUndo={view.document.canUndo}
              onNoticeDismiss={forgetNotice}
              onNoticeUndo={shellCallbacks.onUndo}
              onApplyDuration={shellCallbacks.onApplyDuration}
              onResizeDuration={shellCallbacks.onResizeDuration}
              onApplyInlineSymbol={shellCallbacks.onApplyInlineSymbol}
              onCancelPendingEdit={callbacks.onCancelPendingEdit}
              onAnnotateSection={callbacks.onAnnotateSection}
              onDeclareMeasureCompletion={callbacks.onDeclareMeasureCompletion}
              onRenameSection={callbacks.onRenameSection}
              onSectionLoopToggle={callbacks.onSectionLoopToggle}
              sectionLoopId={callbacks.readSectionLoopId()}
              onSetSectionBoundary={callbacks.onSetSectionBoundary}
              onDeleteSelection={shellCallbacks.onDeleteSelection}
              onDropChordOnMeasure={shellCallbacks.onDropChordOnMeasure}
              onMoveSelectionToMeasure={shellCallbacks.onMoveSelectionToMeasure}
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
              onJoinNextMeasure={callbacks.onJoinNextMeasure}
              onSetInsertionPoint={callbacks.onSetInsertionPoint}
              onRangeModeChange={callbacks.onRangeModeChange}
              onRangeEdgeFromFocus={callbacks.onRangeEdgeFromFocus}
              onRangeEdgeToChord={callbacks.onRangeEdgeToChord}
              onRangeDraftChange={callbacks.onRangeDraftChange}
              onRangeDraftCommit={callbacks.onRangeDraftCommit}
              onRangeCancel={callbacks.onRangeCancel}
              onRangeClear={callbacks.onRangeClear}
              onViewModeChange={callbacks.onViewModeChange}
              onCycleKey={callbacks.onCycleKey}
              view={view.chart}
            />
            <HarmonyLens
              collapsed={view.layout.harmonyCollapsed}
              sheetOpen={activeSheet === "harmony"}
              view={view.harmony}
              onAddSuggestedChord={callbacks.onAddSuggestedChord}
              onPreviewPitch={callbacks.onPreviewPitch}
              onCollapsedChange={(collapsed) => {
                callbacks.onRailCollapsedChange("harmony", collapsed);
              }}
            />
          </main>
        </div>
        <TransportBar
          canPlay={transport.canPlay}
          onOpenSoundSheet={() => {
            callbacks.onRequestPanelSheet("sound");
          }}
          onOpenLibrarySheet={() => {
            callbacks.onRequestPanelSheet("library");
          }}
          onOpenHarmonySheet={() => {
            callbacks.onRequestPanelSheet("harmony");
          }}
          onPause={transport.onPause}
          onPlay={transport.onPlay}
          onStop={transport.onStop}
          callbacks={transport}
          view={view.transport}
        />
      </div>

      <div id="dialog-host">
        {exportOpen && !completionDialogOpen && !commandLaneOpen && !standardsOpen && !tourOpen ? (
          <Dialog
            backgroundRootId="studio-shell-background"
            busy={view.midiExport.state === "delivering"}
            closeLabel="Close the MIDI export preview"
            content={
              <MidiExportPanel
                context="dialog"
                onBlockedEventActivate={callbacks.onMidiExportBlockedEventActivate}
                onClose={callbacks.onMidiExportClose}
                onDownload={callbacks.onMidiExportDownload}
                onGenerate={callbacks.onMidiExportGenerate}
                onRepreview={callbacks.onMidiExportRepreview}
                view={view.midiExport}
              />
            }
            density="comfortable"
            describedBy={[]}
            description="Inspect what the MIDI file will carry, then generate and download it."
            disabled={false}
            dismissibility={DISMISSIBLE}
            focusTargets={{
              triggerId: "studio-export-midi",
              workflowTargetId: null,
              workspaceId: "workspace",
            }}
            id="studio-midi-export-dialog"
            initialFocus="heading"
            initialFocusId={null}
            invalid={false}
            onContractRefusal={callbacks.onUiContractRefusal}
            onDismiss={callbacks.onMidiExportClose}
            open
            title="Export this chart as MIDI"
          />
        ) : null}
        {tourOpen && !completionDialogOpen && !commandLaneOpen && !standardsOpen ? (
          <Dialog
            backgroundRootId="studio-shell-background"
            busy={false}
            closeLabel="Close the tour"
            content={
              <TourDialogContent
                finishLabel={transport.canPlay ? "Start playing" : "Done"}
                onClose={closeTour}
                onFinish={() => {
                  /* Play first, close second: the dispatch must own the
                   * click's user-activation before the dialog teardown
                   * cascade runs (close-first initialized the engine but
                   * never engaged playback, 2026-09-03 audit). */
                  if (transport.canPlay) transport.onPlay("pointer");
                  closeTour();
                }}
                onStepChange={setTourStep}
                step={tourStep}
              />
            }
            density="comfortable"
            describedBy={[]}
            description="Four steps: enter chords, move measures, read the analysis, play it back."
            disabled={false}
            dismissibility={DISMISSIBLE}
            focusTargets={{
              triggerId: "studio-open-tour",
              workflowTargetId: null,
              workspaceId: "workspace",
            }}
            id="studio-tour-dialog"
            initialFocus="heading"
            initialFocusId={null}
            invalid={false}
            onContractRefusal={callbacks.onUiContractRefusal}
            onDismiss={closeTour}
            open
            title="How this works"
          />
        ) : null}
        {standardsOpen && !completionDialogOpen && !commandLaneOpen ? (
          <Dialog
            backgroundRootId="studio-shell-background"
            busy={false}
            closeLabel="Close the standards list"
            content={
              <div class="studio-standards-modal">
                <StandardProgressionList
                  grooveOptions={view.playback.groove.options}
                  onLoadLibraryEntry={(entryId) => {
                    callbacks.onLoadLibraryEntry(entryId);
                    setStandardsOpen(false);
                  }}
                  variant="modal"
                />
              </div>
            }
            density="comfortable"
            describedBy={[]}
            description="Every entry loads as one undoable step with its reviewed groove and tempo."
            disabled={false}
            dismissibility={DISMISSIBLE}
            focusTargets={{
              triggerId: "studio-open-standards",
              workflowTargetId: null,
              workspaceId: "workspace",
            }}
            id="studio-standards-dialog"
            initialFocus="heading"
            initialFocusId={null}
            invalid={false}
            onContractRefusal={callbacks.onUiContractRefusal}
            onDismiss={() => {
              setStandardsOpen(false);
            }}
            open
            title="Load a set of changes"
          />
        ) : null}
        {commandLaneOpen && !completionDialogOpen ? (
          <Dialog
            backgroundRootId="studio-shell-background"
            busy={false}
            closeLabel="Close the command lane"
            content={
              <CommandLaneContent
                quickEntry={view.quickEntry}
                onDraftChange={callbacks.onQuickEntryDraftChange}
                onInsert={() => {
                  shellCallbacks.onQuickEntryInsert();
                  setCommandLaneOpen(false);
                }}
                onClear={callbacks.onQuickEntryClear}
              />
            }
            density="comfortable"
            describedBy={[]}
            description="Type a chart fragment. The insert lands at the insertion point as one undoable step."
            disabled={false}
            dismissibility={DISMISSIBLE}
            focusTargets={{
              triggerId: "studio-open-command-lane",
              workflowTargetId: null,
              workspaceId: "workspace",
            }}
            id="studio-command-lane"
            initialFocus="explicit"
            initialFocusId="studio-command-lane-input"
            invalid={false}
            onContractRefusal={callbacks.onUiContractRefusal}
            onDismiss={() => {
              setCommandLaneOpen(false);
            }}
            open
            title="Type the changes"
          />
        ) : null}
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
            dismissibility={DISMISSIBLE}
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
              activeSheet === "export" ? (
                <section
                  aria-labelledby={`${sheetId}-title`}
                  class="studio-panel-content studio-export-content"
                  data-panel-context="sheet"
                >
                  <p class="studio-kicker">MIDI export</p>
                  <MidiExportPanel
                    context="sheet"
                    onBlockedEventActivate={callbacks.onMidiExportBlockedEventActivate}
                    onClose={callbacks.onMidiExportClose}
                    onDownload={callbacks.onMidiExportDownload}
                    onGenerate={callbacks.onMidiExportGenerate}
                    onRepreview={callbacks.onMidiExportRepreview}
                    view={view.midiExport}
                  />
                </section>
              ) : activeSheet === "sound" ? (
                <section
                  aria-labelledby={`${sheetId}-title`}
                  class="studio-panel-content studio-sound-content"
                  data-panel-context="sheet"
                >
                  <p class="studio-kicker">Session playback</p>
                  <TransportSettings
                    callbacks={transport}
                    idSuffix="-sheet"
                    view={view.transport}
                  />
                </section>
              ) : activeSheet === "library" ? (
                <LibraryPanelContent
                  context="sheet"
                  headingId={`${sheetId}-title`}
                  midiImport={view.midiImport}
                  onMidiImportChooseFile={callbacks.onMidiImportChooseFile}
                  onMidiImportCommit={shellCallbacks.onMidiImportCommit}
                  onMidiImportDiscard={callbacks.onMidiImportDiscard}
                  onMidiImportAudition={callbacks.onMidiImportAudition}
                  onMidiImportOverridesChange={callbacks.onMidiImportOverridesChange}
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
                  onPreviewPitch={callbacks.onPreviewPitch}
                />
              )
            }
            contextRevealCssPx={48}
            density="comfortable"
            describedBy={[]}
            description={sheetDescription}
            disabled={false}
            dismissibility={DISMISSIBLE}
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
