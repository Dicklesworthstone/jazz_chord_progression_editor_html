import { useEffect, useRef, useState } from "preact/hooks";

import type {
  StudioControllerActionResult,
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
}>;

export type AppProps = Readonly<{
  snapshot: StudioViewModel;
  actions: AppActions;
}>;

function countLabel(count: number, singular: string, plural = `${singular}s`): string {
  return `${String(count)} ${count === 1 ? singular : plural}`;
}

function viewFromSnapshot(
  snapshot: StudioViewModel,
  titleDraft: string,
  titleFeedback: StudioTitleFeedback,
  activeSheet: StudioPanelSide | null,
  uiRefusal: StudioShellView["layout"]["uiRefusal"],
): StudioShellView {
  const chordCount = snapshot.sections.reduce(
    (total, section) =>
      total + section.measures.reduce(
        (sectionTotal, measure) => sectionTotal + measure.eventCount,
        0,
      ),
    0,
  );

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
      sections: Object.freeze(
        snapshot.sections.map((section) =>
          Object.freeze({
            id: section.id,
            label: section.name,
            measureCountLabel: countLabel(section.measures.length, "measure"),
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
                }),
              ),
            ),
          }),
        ),
      ),
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
  );

  return (
    <StudioShell
      view={view}
      callbacks={{
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
