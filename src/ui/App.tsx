import { useEffect, useRef, useState } from "preact/hooks";

import type {
  StudioControllerActionResult,
  StudioBoundaryInput,
  StudioRailSide,
  StudioViewModel,
} from "../application/runtime";
import { MAX_SHORT_TEXT_CODE_POINTS } from "../domain";
import {
  StudioShell,
  type StudioPanelSide,
  type StudioShellView,
  type StudioTitleFeedback,
} from "./studio";

export type AppActions = Readonly<{
  setTitle: (value: string) => StudioControllerActionResult;
  undo: () => StudioControllerActionResult;
  redo: () => StudioControllerActionResult;
  setRailCollapsed: (
    side: StudioRailSide,
    collapsed: boolean,
  ) => StudioControllerActionResult;
  setQuickEntryDraft: (
    text: string,
    target: StudioBoundaryInput | null,
    status: "idle" | "invalid" | "ready",
    issueCodes: readonly string[],
  ) => StudioControllerActionResult;
  clearQuickEntry: () => StudioControllerActionResult;
  applyQuickEntryPreview: () => StudioControllerActionResult;
  selectEvent: (eventId: string) => StudioControllerActionResult;
  extendSelectionTo: (eventId: string) => StudioControllerActionResult;
  deleteSelection: (
    incompleteReason?: string | null,
  ) => StudioControllerActionResult;
  duplicateSelection: (
    destinationMeasureId?: string | null,
    incompleteReason?: string | null,
  ) => StudioControllerActionResult;
  moveSelection: (
    direction: "previous" | "next",
    incompleteReason?: string | null,
  ) => StudioControllerActionResult;
  insertMeasure: (
    sectionId: string,
    beforeMeasureId: string | null,
  ) => StudioControllerActionResult;
  insertSection: (
    beforeSectionId: string | null,
    name: string,
  ) => StudioControllerActionResult;
  applyInlineSymbol: (
    eventId: string,
    symbolText: string,
  ) => StudioControllerActionResult;
  renameSection: (
    sectionId: string,
    name: string,
  ) => StudioControllerActionResult;
  annotateSection: (
    sectionId: string,
    annotation: string,
  ) => StudioControllerActionResult;
  setSectionBoundary: (
    sectionId: string,
    boundary: "reset" | "continue",
  ) => StudioControllerActionResult;
  moveSelectionTo: (
    measureId: string,
    beforeEventId?: string | null,
    incompleteReason?: string | null,
  ) => StudioControllerActionResult;
  setEventDurationText: (
    eventId: string,
    beatText: string,
    incompleteReason?: string | null,
  ) => StudioControllerActionResult;
  previewChartText: (text: string) => Readonly<{
    status: "idle" | "invalid" | "ready";
    issueCodes: readonly string[];
  }>;
}>;

const QUICK_ENTRY_MAX_CODE_POINTS = 4_096;

export type AppProps = Readonly<{
  snapshot: StudioViewModel;
  actions: AppActions;
}>;

function countLabel(count: number, singular: string, plural = `${singular}s`): string {
  return `${String(count)} ${count === 1 ? singular : plural}`;
}

function fillLabel(
  fill: StudioViewModel["sections"][number]["measures"][number]["fill"],
): string {
  switch (fill) {
    case "empty":
      return "Empty";
    case "exact-fill":
      return "Exactly full";
    case "underfilled":
      return "Shorter than the bar";
    case "overfilled":
      return "Longer than the bar";
  }
}

function quickEntryStatusLabel(
  status: StudioViewModel["quickEntry"]["status"],
): string {
  switch (status) {
    case "idle":
      return "No draft";
    case "invalid":
      return "Draft has parse errors";
    case "ready":
      return "Draft parses";
  }
}

function viewFromSnapshot(
  snapshot: StudioViewModel,
  titleDraft: string,
  titleFeedback: StudioTitleFeedback,
  activeSheet: StudioPanelSide | null,
  uiRefusal: StudioShellView["layout"]["uiRefusal"],
  rovingFocusId: string | null,
  editRefusal: StudioShellView["chart"]["editRefusal"],
  quickEntryRefusal: string | null,
): StudioShellView {
  const chordCount = snapshot.chordCount;
  const selectionCount = snapshot.bookmarks.selectedEventIds.length;

  return Object.freeze({
    document: Object.freeze({
      committedTitle: snapshot.title,
      titleDraft,
      titleMaxCodePoints: MAX_SHORT_TEXT_CODE_POINTS,
      lifecycleLabel: snapshot.dirty.label,
      revisionLabel: `Revision ${String(snapshot.revision)}`,
      dirty: snapshot.dirty.sinceExport,
      titleFeedback,
      canCommitTitle: titleDraft !== snapshot.title,
      canResetTitleDraft:
        titleDraft !== snapshot.title || titleFeedback.kind === "refused",
      canUndo: snapshot.history.canUndo,
      canRedo: snapshot.history.canRedo,
      undoDescription: snapshot.history.undoLabel === null
        ? "Nothing to undo"
        : `Undo ${snapshot.history.undoLabel}`,
      redoDescription: snapshot.history.redoLabel === null
        ? "Nothing to redo"
        : `Redo ${snapshot.history.redoLabel}`,
    }),
    chart: Object.freeze({
      sectionCountLabel: countLabel(snapshot.sections.length, "section"),
      measureCountLabel: countLabel(snapshot.measureCount, "measure"),
      chordCountLabel: countLabel(chordCount, "chord"),
      rovingFocusId,
      selectionCount,
      selectionStatusLabel:
        selectionCount === 0
          ? "No chord selected"
          : countLabel(selectionCount, "chord") + " selected",
      canDeleteSelection: selectionCount > 0,
      canDuplicateSelection: selectionCount > 0,
      canMoveSelection: selectionCount > 0,
      appendSectionLabel: "Append section",
      editRefusal,
      sections: Object.freeze(
        snapshot.sections.map((section) =>
          Object.freeze({
            id: section.id,
            label: section.name,
            measureCountLabel: countLabel(section.measures.length, "measure"),
            appendMeasureLabel: `Append measure to section ${section.name}`,
            annotation: section.annotation,
            voiceLeadingBoundary: section.voiceLeadingBoundary,
            voiceLeadingLabel:
              section.voiceLeadingBoundary === "reset"
                ? "Voice leading resets at this boundary"
                : "Voice leading continues across this boundary",
            measures: Object.freeze(
              section.measures.map((measure) =>
                Object.freeze({
                  id: measure.id,
                  number: measure.ordinal,
                  meterLabel: snapshot.meterLabel,
                  durationLabel: `${measure.durationBeatLabel} beats`,
                  capacityLabel: `${measure.capacityBeatLabel} beats`,
                  startBeatLabel: measure.startBeatLabel,
                  endBeatLabel: measure.endBeatLabel,
                  chordCountLabel: countLabel(measure.eventCount, "chord"),
                  state: measure.eventCount === 0 ? "empty" : "populated",
                  fillLabel: fillLabel(measure.fill),
                  insertBeforeLabel: `Insert measure before measure ${String(measure.ordinal)}`,
                  dropLabel: `Move selection into measure ${String(measure.ordinal)}`,
                  chords: Object.freeze(
                    measure.events.map((event) =>
                      Object.freeze({
                        id: event.id,
                        ordinal: event.ordinal,
                        symbolText: event.symbolText,
                        durationLabel: `${event.durationBeatLabel} beats`,
                        voicingMode: event.voicingMode,
                        hasAnnotation: event.hasAnnotation,
                        selected: event.selected,
                        inRange: event.inRange,
                        accessibleName:
                          `Chord ${String(event.ordinal)}: ${event.symbolText}, `
                          + `${event.durationBeatLabel} beats`,
                        inlineEditable: event.voicingMode === "auto",
                        inlineEditBlockedReason:
                          event.voicingMode === "auto"
                            ? null
                            : "Open the chord inspector to change a "
                              + `${event.voicingMode} voicing.`,
                      }),
                    ),
                  ),
                }),
              ),
            ),
          }),
        ),
      ),
    }),
    quickEntry: Object.freeze({
      draftText: snapshot.quickEntry.text,
      maxCodePoints: QUICK_ENTRY_MAX_CODE_POINTS,
      codePointCount: snapshot.quickEntry.codePointCount,
      statusLabel: quickEntryStatusLabel(snapshot.quickEntry.status),
      targetLabel:
        snapshot.quickEntry.targetLabel ?? "No insertion target",
      canInsert:
        snapshot.quickEntry.status === "ready"
        && snapshot.quickEntry.targetLabel !== null,
      canClear: snapshot.quickEntry.text.length > 0,
      issueCodes: snapshot.quickEntry.issueCodes,
      refusalMessage: quickEntryRefusal,
    }),
    harmony: Object.freeze({
      selectedChordLabel: null,
      selectionStatusLabel: chordCount === 0
        ? "No chord events in this chart"
        : "No chord selected",
      emptyTitle: chordCount === 0
        ? "Harmony begins with a real chord"
        : "Select a chord to inspect it",
      emptyDescription: chordCount === 0
        ? "This new chart is intentionally empty. Analysis will appear only for validated chord events."
        : "The Harmony Lens will explain the selected event without rewriting its source spelling.",
      documentFacts: Object.freeze([
        Object.freeze({ id: "meter", label: "Meter", value: snapshot.meterLabel }),
        Object.freeze({ id: "key", label: "Key", value: snapshot.keyLabel }),
        Object.freeze({
          id: "tempo",
          label: "Tempo",
          value: `${String(snapshot.tempoBpm)} BPM`,
        }),
        Object.freeze({
          id: "measures",
          label: "Form",
          value: `${countLabel(snapshot.sections.length, "section")} · ${countLabel(snapshot.measureCount, "measure")}`,
        }),
      ]),
    }),
    transport: Object.freeze({
      audioState: "unavailable",
      audioStatusLabel: snapshot.transport.statusLabel,
      audioStatusDetail:
        "Playback is visible but disabled until a playback plan is connected to the verified audio engine.",
      tempoBpm: snapshot.tempoBpm,
      instrumentLabel: snapshot.instrumentLabel,
      positionLabel: `${snapshot.transport.playheadBeatLabel} beats`,
      currentChordLabel: null,
    }),
    layout: Object.freeze({
      libraryCollapsed: snapshot.panels.leftRailCollapsed,
      harmonyCollapsed: snapshot.panels.rightRailCollapsed,
      activeSheet,
      uiRefusal,
    }),
  });
}

function feedbackFromRefusal(
  result: Extract<StudioControllerActionResult, { ok: false }>,
): StudioTitleFeedback {
  return Object.freeze({
    kind: "refused",
    message: `${result.refusal.message} ${result.refusal.recoveryAction}`,
  });
}

export function App({ snapshot, actions }: AppProps) {
  const [titleDraft, setTitleDraft] = useState(snapshot.title);
  const previousCommittedTitle = useRef(snapshot.title);
  const [activeSheet, setActiveSheet] = useState<StudioPanelSide | null>(null);
  const [uiRefusal, setUiRefusal] = useState<
    StudioShellView["layout"]["uiRefusal"]
  >(null);
  const [rovingFocusId, setRovingFocusId] = useState<string | null>(null);
  const [editRefusal, setEditRefusal] = useState<
    StudioShellView["chart"]["editRefusal"]
  >(null);
  const [quickEntryRefusal, setQuickEntryRefusal] = useState<string | null>(
    null,
  );
  /** The exact beat text awaiting an explicit incomplete-measure reason. */
  const [pendingDuration, setPendingDuration] = useState<Readonly<{
    chordId: string;
    beatText: string;
  }> | null>(null);
  const [titleFeedback, setTitleFeedback] = useState<StudioTitleFeedback>(() =>
    Object.freeze({
      kind: "idle",
      message: "The committed document title is shown above.",
    }),
  );

  useEffect(() => {
    const previousTitle = previousCommittedTitle.current;
    if (previousTitle === snapshot.title) return;
    previousCommittedTitle.current = snapshot.title;

    if (titleDraft === previousTitle) {
      setTitleDraft(snapshot.title);
      setTitleFeedback(
        Object.freeze({
          kind: "idle",
          message: "The committed document title changed outside this field.",
        }),
      );
      return;
    }
    if (titleDraft !== snapshot.title) {
      setTitleFeedback(
        Object.freeze({
          kind: "refused",
          message:
            "The document title changed while this raw draft was open. Reset the draft or review it before applying.",
        }),
      );
    }
  }, [snapshot.title, titleDraft]);

  const resetDraft = (): void => {
    setTitleDraft(snapshot.title);
    setTitleFeedback(
      Object.freeze({
        kind: "idle",
        message: "Draft reset to the committed document title.",
      }),
    );
  };

  /** The draft insertion target follows the current insertion bookmark. */
  const quickEntryTarget = (): StudioBoundaryInput | null => {
    const targetId = snapshot.bookmarks.insertionTargetId;
    if (targetId === null) return null;
    for (const section of snapshot.sections) {
      if (section.id === targetId) {
        return { kind: "section-end", sectionId: targetId };
      }
      for (const measure of section.measures) {
        if (measure.id === targetId) {
          return { kind: "measure-start", measureId: targetId };
        }
      }
    }
    return null;
  };

  /** Deterministic default name: the next unused letter, then an ordinal. */
  const nextSectionName = (): string => {
    const used = new Set(snapshot.sections.map((section) => section.name));
    for (let index = 0; index < 26; index += 1) {
      const letter = String.fromCharCode(65 + index);
      if (!used.has(letter)) return letter;
    }
    return `Section ${String(snapshot.sections.length + 1)}`;
  };

  const RESOLUTIONS: Readonly<Record<string, readonly string[]>> =
    Object.freeze({
      "u1.completion_reason_required": Object.freeze([
        "Declare an intentionally incomplete measure with a reason",
        "Cancel",
      ]),
      "u1.duration_overfills_measure": Object.freeze([
        "Move following chords into the next measure",
        "Shorten the duration",
        "Cancel",
      ]),
      "u1.insertion_plan_overfills_destination": Object.freeze([
        "Choose an empty measure or a structural boundary",
        "Shorten the draft",
        "Cancel",
      ]),
    });

  const recordEditResult = (result: StudioControllerActionResult): void => {
    if (result.ok) {
      setEditRefusal(null);
      setPendingDuration(null);
      return;
    }
    const code = result.refusal.code;
    setEditRefusal(
      Object.freeze({
        code,
        message: result.refusal.message,
        needsIncompleteReason: code === "u1.completion_reason_required",
        recoveryAction: result.refusal.recoveryAction,
        resolutions: RESOLUTIONS[code] ?? Object.freeze([]),
      }),
    );
  };

  const applyHistoryResult = (
    result: StudioControllerActionResult,
    successMessage: string,
  ): void => {
    if (!result.ok) {
      setTitleFeedback(feedbackFromRefusal(result));
      return;
    }
    setTitleDraft(result.snapshot.title);
    setTitleFeedback(
      Object.freeze({ kind: "committed", message: successMessage }),
    );
  };

  const view = viewFromSnapshot(
    snapshot,
    titleDraft,
    titleFeedback,
    activeSheet,
    uiRefusal,
    rovingFocusId,
    editRefusal,
    quickEntryRefusal,
  );

  return (
    <StudioShell
      view={view}
      callbacks={{
        onQuickEntryDraftChange: (value) => {
          const preview = actions.previewChartText(value);
          const result = actions.setQuickEntryDraft(
            value,
            quickEntryTarget(),
            preview.status,
            preview.issueCodes,
          );
          setQuickEntryRefusal(
            result.ok
              ? null
              : `${result.refusal.message} ${result.refusal.recoveryAction}`,
          );
        },
        onQuickEntryInsert: () => {
          const result = actions.applyQuickEntryPreview();
          setQuickEntryRefusal(
            result.ok
              ? null
              : `${result.refusal.message} ${result.refusal.recoveryAction}`,
          );
        },
        onQuickEntryClear: () => {
          actions.clearQuickEntry();
          setQuickEntryRefusal(null);
        },
        onSelectChord: (chordId, extend) => {
          setRovingFocusId(chordId);
          recordEditResult(
            extend
              ? actions.extendSelectionTo(chordId)
              : actions.selectEvent(chordId),
          );
        },
        onRovingFocusChange: (chordId) => {
          setRovingFocusId(chordId);
        },
        onDeleteSelection: () => {
          recordEditResult(actions.deleteSelection());
        },
        onDuplicateSelection: () => {
          recordEditResult(actions.duplicateSelection());
        },
        onMoveSelection: (direction) => {
          recordEditResult(actions.moveSelection(direction));
        },
        onInsertMeasure: (sectionId, beforeMeasureId) => {
          recordEditResult(actions.insertMeasure(sectionId, beforeMeasureId));
        },
        onInsertSection: () => {
          recordEditResult(actions.insertSection(null, nextSectionName()));
        },
        onApplyInlineSymbol: (chordId, symbolText) => {
          recordEditResult(actions.applyInlineSymbol(chordId, symbolText));
        },
        onApplyDuration: (chordId, beatText) => {
          const result = actions.setEventDurationText(chordId, beatText);
          setPendingDuration(
            result.ok ||
              result.refusal.code !== "u1.completion_reason_required"
              ? null
              : Object.freeze({ beatText, chordId }),
          );
          recordEditResult(result);
        },
        onConfirmIncompleteMeasure: (reason) => {
          if (pendingDuration === null) {
            recordEditResult(actions.deleteSelection(reason));
            return;
          }
          const result = actions.setEventDurationText(
            pendingDuration.chordId,
            pendingDuration.beatText,
            reason,
          );
          recordEditResult(result);
        },
        onRenameSection: (sectionId, name) => {
          recordEditResult(actions.renameSection(sectionId, name));
        },
        onAnnotateSection: (sectionId, annotation) => {
          recordEditResult(actions.annotateSection(sectionId, annotation));
        },
        onDropChordOnMeasure: (measureId) => {
          recordEditResult(actions.moveSelectionTo(measureId));
        },
        onSetSectionBoundary: (sectionId, boundary) => {
          recordEditResult(actions.setSectionBoundary(sectionId, boundary));
        },
        onCancelPendingEdit: () => {
          setPendingDuration(null);
          setEditRefusal(null);
        },
        onTitleDraftChange: (value) => {
          setTitleDraft(value);
          setTitleFeedback(
            Object.freeze({
              kind: value === snapshot.title ? "idle" : "dirty",
              message: value === snapshot.title
                ? "The draft matches the committed title."
                : "Draft only — apply it to create an undoable document change.",
            }),
          );
        },
        onCommitTitle: (value) => {
          const result = actions.setTitle(value);
          if (!result.ok) {
            setTitleFeedback(feedbackFromRefusal(result));
            return;
          }
          setTitleDraft(result.snapshot.title);
          setTitleFeedback(
            Object.freeze({
              kind: "committed",
              message: "Title committed as an undoable document change.",
            }),
          );
        },
        onResetTitleDraft: resetDraft,
        onUndo: () => {
          applyHistoryResult(actions.undo(), "The last document change was undone.");
        },
        onRedo: () => {
          applyHistoryResult(actions.redo(), "The document change was restored.");
        },
        onRailCollapsedChange: (side, collapsed) => {
          actions.setRailCollapsed(
            side === "library" ? "left" : "right",
            collapsed,
          );
        },
        onRequestPanelSheet: (side) => {
          setUiRefusal(null);
          setActiveSheet(side);
        },
        onDismissPanelSheet: () => {
          setActiveSheet(null);
        },
        onUiContractRefusal: (diagnostic) => {
          setActiveSheet(null);
          setUiRefusal(
            Object.freeze({
              message: diagnostic.message,
              recoveryAction: diagnostic.recoveryAction,
            }),
          );
        },
        onDismissUiRefusal: () => {
          setUiRefusal(null);
        },
      }}
    />
  );
}

export type StudioStartupFailureProps = Readonly<{
  message: string;
  recoveryAction: string;
}>;

export function StudioStartupFailure({
  message,
  recoveryAction,
}: StudioStartupFailureProps) {
  return (
    <main class="studio-startup-failure" data-app-ready="false">
      <p class="studio-kicker">Local startup stopped safely</p>
      <h1>Changes</h1>
      <h2>The blank studio could not be validated.</h2>
      <p>{message}</p>
      <p>{recoveryAction}</p>
    </main>
  );
}
