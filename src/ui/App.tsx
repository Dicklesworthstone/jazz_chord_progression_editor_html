import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "preact/hooks";

import type {
  StudioAudioGesture,
  StudioController,
  StudioControllerActionResult,
  StudioBoundaryInput,
  StudioDraftPreview,
  StudioInsertionPlan,
  StudioRailSide,
  StudioViewModel,
  StudioAnalysisFrame,
  StudioAnalyzerExpectation,
} from "../application/runtime";
import { MAX_SHORT_TEXT_CODE_POINTS } from "../domain";
import {
  AnalyzerPanel,
  StudioShell,
  type StudioCardMenuItemView,
  type StudioPanelSide,
  type StudioShellView,
  type StudioTitleFeedback,
  type StudioViewMode,
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
  moveFollowingEvents: (
    incompleteReason?: string | null,
  ) => StudioControllerActionResult;
  splitEventDuration: (
    eventId: string,
    firstBeatText: string,
    secondBeatText?: string,
  ) => StudioControllerActionResult;
  joinEventDurations: (leftEventId: string) => StudioControllerActionResult;
  splitSection: (
    sectionId: string,
    beforeMeasureId: string,
    name: string,
  ) => StudioControllerActionResult;
  joinSections: (leftSectionId: string) => StudioControllerActionResult;
  setRange: (
    anchor: StudioBoundaryInput,
    focus: StudioBoundaryInput,
  ) => StudioControllerActionResult;
  setRangeEdge: (
    edge: "start" | "end",
    boundary: StudioBoundaryInput,
  ) => StudioControllerActionResult;
  setRangeEdgeBeat: (
    edge: "start" | "end",
    beatText: string,
  ) => StudioControllerActionResult;
  clearRange: () => StudioControllerActionResult;
  setInsertionPoint: (
    boundary: StudioBoundaryInput,
  ) => StudioControllerActionResult;
  previewChartText: (text: string) => Readonly<{
    status: "idle" | "invalid" | "ready";
    issueCodes: readonly string[];
  }>;
  previewInsertionPlan: () => StudioInsertionPlan;
  previewQuickEntryDraft: () => StudioDraftPreview;
  acknowledgeFocus: (sequence: number) => StudioControllerActionResult;
  insertRecoveredChord: (
    globalOrdinal: number,
    callerBeatText?: string | null,
    acknowledgement?: string,
    incompleteReason?: string | null,
  ) => StudioControllerActionResult;
  declareMeasureCompletion: (
    measureId: string,
    reason?: string | null,
  ) => StudioControllerActionResult;
  /**
   * Playback. `playProgression` needs a receipt proving a trusted event caused
   * it, because a browser will not open an audio graph without one.
   */
  playProgression: (
    gesture: StudioAudioGesture,
  ) => StudioControllerActionResult;
  pauseProgression: () => StudioControllerActionResult;
  stopProgression: () => StudioControllerActionResult;
  /**
   * Display-only live playhead label the animation frame reads while playing.
   * Interpolation for the eye, never a second musical clock: committed
   * transport state still arrives only through notifications.
   */
  readTransportPlayheadLabel: () => string | null;
  /** Display-only analyzer reads (jcpe-7she); never a command path. */
  readTransportAnalysisFrame: () => StudioAnalysisFrame | null;
  readEventPitchClasses: (eventId: string) => readonly number[] | null;
}>;

const QUICK_ENTRY_MAX_CODE_POINTS = 4_096;

/** The operation that a `u1.completion_reason_required` refusal interrupted. */
type PendingEdit =
  | Readonly<{ kind: "duration"; chordId: string; beatText: string }>
  | Readonly<{ kind: "delete" }>
  | Readonly<{ kind: "duplicate" }>
  | Readonly<{ kind: "move"; direction: "previous" | "next" }>
  | Readonly<{ kind: "move-following" }>
  | Readonly<{ kind: "move-to"; measureId: string }>
  | Readonly<{ kind: "measure-completion"; measureId: string }>
  | Readonly<{
      kind: "recovered-chord";
      globalOrdinal: number;
      beatText: string;
    }>
  | null;

export type AppProps = Readonly<{
  snapshot: StudioViewModel;
  actions: AppActions;
}>;

/**
 * The sounding chord, computed from the exact fraction labels the view
 * model already publishes. Cross-multiplied bigint comparison keeps the
 * arithmetic exact; this is presentation-only reading of committed state,
 * never a second musical clock.
 */
function parseExactLabel(label: string): readonly [bigint, bigint] | null {
  const match = /^(\d+)\/(\d+)$/u.exec(label);
  if (match?.[1] === undefined || match[2] === undefined) return null;
  const denominator = BigInt(match[2]);
  if (denominator === 0n) return null;
  return [BigInt(match[1]), denominator];
}

export type PlaybackPointer = Readonly<{
  chordId: string | null;
  chordLabel: string | null;
  progressPercent: number | null;
}>;

export function playbackPointer(
  snapshot: StudioViewModel,
  livePlayheadLabel: string | null = null,
): PlaybackPointer {
  const none: PlaybackPointer = Object.freeze({
    chordId: null,
    chordLabel: null,
    progressPercent: null,
  });
  const status = snapshot.transport.status;
  /*
   * `starting` is the gap between the Play press and the transport's first
   * `playing` notification; the run start beat is already committed, so the
   * first sounding chord highlights immediately instead of blinking off.
   */
  if (status !== "playing" && status !== "starting") return none;
  const label =
    status === "playing" && livePlayheadLabel !== null
      ? livePlayheadLabel
      : snapshot.transport.playheadBeatLabel;
  const playhead = parseExactLabel(label);
  if (playhead === null) return none;
  const [pn, pd] = playhead;
  let chordId: string | null = null;
  let chordLabel: string | null = null;
  let endN = 0n;
  let endD = 1n;
  for (const section of snapshot.sections) {
    for (const measure of section.measures) {
      for (const event of measure.events) {
        const start = parseExactLabel(event.startBeatLabel);
        const duration = parseExactLabel(event.durationBeatLabel);
        if (start === null || duration === null) continue;
        const [sn, sd] = start;
        const [dn, dd] = duration;
        /* end = start + duration */
        const eN = sn * dd + dn * sd;
        const eD = sd * dd;
        if (eN * endD > endN * eD) {
          endN = eN;
          endD = eD;
        }
        /* start <= playhead < end, cross-multiplied. */
        if (sn * pd <= pn * sd && pn * eD < eN * pd) {
          chordId = event.id;
          chordLabel = event.symbolText;
        }
      }
    }
  }
  const progressPercent =
    endN === 0n
      ? null
      : Math.min(100, (Number(pn) / Number(pd)) / (Number(endN) / Number(endD)) * 100);
  return Object.freeze({ chordId, chordLabel, progressPercent });
}

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

/** One sentence per statement; a blocked one always names its resolutions. */
function insertionPlanLabel(
  statement: StudioInsertionPlan["statement"],
): string {
  switch (statement) {
    case "no-draft":
      return "Nothing to insert yet";
    case "fits-measure":
      return "Fills the target measure exactly";
    case "completes-measures":
      return "Creates one or more complete measures";
    case "incomplete-requires-confirmation":
      return "Leaves a measure shorter than the bar";
    case "overfill-requires-split":
      return "Does not fit the chosen destination";
    case "not-atomic-refusal":
      return "Cannot be inserted atomically";
  }
}

/**
 * The application reports the reviewed resolution tokens; the surface owns
 * their wording. An unknown token is shown verbatim rather than dropped, so a
 * resolution can never disappear from the statement that requires it.
 */
const RESOLUTION_LABELS: Readonly<Record<string, string>> = Object.freeze({
  cancel: "Cancel",
  "choose-an-empty-measure-or-structural-boundary":
    "Choose an empty measure or a structural boundary",
  "complete-the-final-measure": "Complete the final measure",
  "correct-the-draft": "Correct the draft",
  "insert-one-recovered-chord-into-a-measure":
    "Insert one recovered chord into a measure",
  "insert-parsed-preview": "Insert the parsed preview",
  "shorten-the-draft": "Shorten the draft",
});

function resolutionLabels(tokens: readonly string[]): readonly string[] {
  return Object.freeze(tokens.map((token) => RESOLUTION_LABELS[token] ?? token));
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

/**
 * Every field here is presentation-only state the surface owns. None of it is
 * ever published: toggling a view mode, opening a menu, or typing into a range
 * draft leaves the document, its revision, and its bookmarks untouched.
 */
type PresentationState = Readonly<{
  titleDraft: string;
  titleFeedback: StudioTitleFeedback;
  activeSheet: StudioPanelSide | null;
  uiRefusal: StudioShellView["layout"]["uiRefusal"];
  rovingFocusId: string | null;
  editRefusal: StudioShellView["chart"]["editRefusal"];
  quickEntryRefusal: string | null;
  completionDialogOpen: boolean;
  completionReasonDraft: string;
  /** The caller accepted that recovering one chord discards the draft layout. */
  recoveryAcknowledged: boolean;
  /** Raw beat text for a duration T0 could not resolve; never coerced. */
  recoveryDurationDraft: string;
  viewMode: StudioViewMode;
  rangeModeActive: boolean;
  rangeStartDraft: string;
  rangeEndDraft: string;
  openMenuChordId: string | null;
}>;

/** Teaching labels restate stored facts; an absent fact is shown as absent. */
function teachingNotes(
  event: StudioViewModel["sections"][number]["measures"][number]["events"][number],
): readonly string[] {
  return Object.freeze([
    `Starts at beat ${event.startBeatLabel}`,
    `Lasts ${event.durationBeatLabel} beats`,
    `Voicing mode: ${event.voicingMode}`,
    event.hasAnnotation ? "Carries a note" : "No note",
    "Roman numeral: not analysed yet",
  ]);
}

function cardMenuItems(
  event: StudioViewModel["sections"][number]["measures"][number]["events"][number],
  measure: StudioViewModel["sections"][number]["measures"][number],
  eventIndex: number,
): readonly StudioCardMenuItemView[] {
  const following = measure.events.length - eventIndex - 1;
  const manualReason =
    event.voicingMode === "auto"
      ? null
      : `Open the chord inspector to change a ${event.voicingMode} voicing.`;
  return Object.freeze([
    { action: "edit-symbol", disabledReason: manualReason, label: "Edit symbol" },
    { action: "edit-duration", disabledReason: null, label: "Edit duration" },
    { action: "duplicate", disabledReason: null, label: "Duplicate" },
    { action: "delete", disabledReason: null, label: "Delete" },
    {
      action: "move-previous",
      disabledReason: eventIndex === 0 ? "This is the first chord in its measure." : null,
      label: "Move previous",
    },
    {
      action: "move-next",
      disabledReason:
        following === 0 ? "This is the last chord in its measure." : null,
      label: "Move next",
    },
    {
      action: "move-following",
      disabledReason:
        following === 0 ? "No chord follows this one in the measure." : null,
      label: "Move following chords to the next measure",
    },
    { action: "split-duration", disabledReason: null, label: "Split duration" },
    {
      action: "join-next",
      disabledReason:
        following === 0 ? "This chord has no following chord to join." : null,
      label: "Join with next",
    },
    { action: "range-start", disabledReason: null, label: "Set range start here" },
    { action: "range-end", disabledReason: null, label: "Set range end here" },
    {
      action: "declare-completion",
      disabledReason: null,
      label: "Declare this measure's completion",
    },
  ] as const satisfies readonly StudioCardMenuItemView[]);
}

/**
 * Poll the display-only playhead once per animation frame while playing.
 *
 * This is the interpolation layer the transport contract names: committed
 * state still arrives only through notifications, and this hook may only
 * repaint. Repaints are quantized to eighth-beat steps so a long chart does
 * not re-render at the full frame rate for imperceptible sweep movement.
 */
function useLivePlayheadLabel(
  status: StudioViewModel["transport"]["status"],
  read: () => string | null,
): string | null {
  const [label, setLabel] = useState<string | null>(null);
  const readRef = useRef(read);
  readRef.current = read;
  useEffect(() => {
    if (status !== "playing") {
      setLabel(null);
      return undefined;
    }
    let frame = 0;
    let lastEighths = -1;
    const tick = (): void => {
      const next = readRef.current();
      const parsed = next === null ? null : parseExactLabel(next);
      if (next !== null && parsed !== null) {
        const [n, d] = parsed;
        const eighths = Math.floor((Number(n) / Number(d)) * 8);
        if (eighths !== lastEighths) {
          lastEighths = eighths;
          setLabel(next);
        }
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [status]);
  return status === "playing" ? label : null;
}

/**
 * Literal facts for the most recently selected chord (jcpe-ja9f): the Lens
 * previously claimed "No chord selected" while a card sat ringed in the
 * chart. Everything here is a verbatim selector value — no harmonic reading.
 */
function selectedChordView(
  snapshot: StudioViewModel,
): StudioShellView["harmony"]["selected"] {
  const selectedIds = snapshot.bookmarks.selectedEventIds;
  const targetId = selectedIds[selectedIds.length - 1];
  if (targetId === undefined) return null;
  for (const section of snapshot.sections) {
    for (const measure of section.measures) {
      for (const event of measure.events) {
        if (event.id !== targetId) continue;
        return Object.freeze({
          symbolText: event.symbolText,
          accessibleName: `Selected chord ${event.symbolText}`,
          facts: Object.freeze([
            Object.freeze({
              id: "bar",
              label: "Bar",
              value: `Measure ${String(measure.ordinal)} · Section ${section.name}`,
            }),
            Object.freeze({
              id: "start",
              label: "Starts at beat",
              value: event.startBeatLabel,
            }),
            Object.freeze({
              id: "duration",
              label: "Duration",
              value: `${event.durationBeatLabel} beats`,
            }),
            Object.freeze({
              id: "spelling",
              label: "Stored spelling",
              value: event.symbolText,
            }),
          ]),
        });
      }
    }
  }
  return null;
}

function viewFromSnapshot(
  snapshot: StudioViewModel,
  presentation: PresentationState,
  insertionPlan: StudioInsertionPlan,
  draftPreview: StudioDraftPreview,
  livePlayheadLabel: string | null,
): StudioShellView {
  const {
    titleDraft,
    titleFeedback,
    activeSheet,
    uiRefusal,
    rovingFocusId,
    editRefusal,
    quickEntryRefusal,
    completionDialogOpen,
    completionReasonDraft,
    recoveryAcknowledged,
    recoveryDurationDraft,
  } = presentation;
  const chordCount = snapshot.chordCount;
  const selectionCount = snapshot.bookmarks.selectedEventIds.length;
  const pointer = playbackPointer(snapshot, livePlayheadLabel);
  const playheadLabel =
    snapshot.transport.status === "playing" && livePlayheadLabel !== null
      ? livePlayheadLabel
      : snapshot.transport.playheadBeatLabel;

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
      viewMode: presentation.viewMode,
      openMenuChordId: presentation.openMenuChordId,
      range: Object.freeze({
        active: presentation.rangeModeActive,
        endBeatLabel: snapshot.bookmarks.rangeEndBeatLabel,
        endDraft: presentation.rangeEndDraft,
        hasRange: snapshot.bookmarks.rangeActive,
        startBeatLabel: snapshot.bookmarks.rangeStartBeatLabel,
        startDraft: presentation.rangeStartDraft,
      }),
      editRefusal,
      completionDialog: Object.freeze({
        open: completionDialogOpen && editRefusal?.needsIncompleteReason === true,
        reasonDraft: completionReasonDraft,
      }),
      sections: Object.freeze(
        snapshot.sections.map((section, sectionIndex) =>
          Object.freeze({
            id: section.id,
            label: section.name,
            measureCountLabel: countLabel(section.measures.length, "measure"),
            appendMeasureLabel: `Append measure to section ${section.name}`,
            annotation: section.annotation,
            voiceLeadingBoundary: section.voiceLeadingBoundary,
            canJoinNextSection: sectionIndex < snapshot.sections.length - 1,
            voiceLeadingLabel:
              section.voiceLeadingBoundary === "reset"
                ? "Voice leading resets at this boundary"
                : "Voice leading continues across this boundary",
            measures: Object.freeze(
              section.measures.map((measure, measureIndex) =>
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
                  completionLabel: measure.completionLabel,
                  completionReason: measure.completionReason,
                  canSplitSectionHere: measureIndex > 0,
                  isInsertionTarget: snapshot.quickEntry.targetId === measure.id,
                  targetLabel: `Aim quick entry at measure ${String(measure.ordinal)}`,
                  insertBeforeLabel: `Insert measure before measure ${String(measure.ordinal)}`,
                  dropLabel: `Move selection into measure ${String(measure.ordinal)}`,
                  chords: Object.freeze(
                    measure.events.map((event, eventIndex) =>
                      Object.freeze({
                        id: event.id,
                        ordinal: event.ordinal,
                        symbolText: event.symbolText,
                        playing: event.id === pointer.chordId,
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
                        teachingNotes: teachingNotes(event),
                        menuItems: cardMenuItems(event, measure, eventIndex),
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
      insertionPlan: Object.freeze({
        committable: insertionPlan.committable,
        label: insertionPlanLabel(insertionPlan.statement),
        resolutions: resolutionLabels(insertionPlan.resolutions),
        statement: insertionPlan.statement,
      }),
      maxCodePoints: QUICK_ENTRY_MAX_CODE_POINTS,
      codePointCount: snapshot.quickEntry.codePointCount,
      statusLabel: quickEntryStatusLabel(snapshot.quickEntry.status),
      targetLabel:
        snapshot.quickEntry.targetLabel ?? "No insertion target",
      // Insert is offered only when the stated plan is committable, so the
      // statement and the affordance can never disagree.
      canInsert: insertionPlan.committable,
      canClear: snapshot.quickEntry.text.length > 0,
      issueCodes: snapshot.quickEntry.issueCodes,
      refusalMessage: quickEntryRefusal,
      tokens: draftPreview.tokens,
      recovery: Object.freeze({
        acknowledged: recoveryAcknowledged,
        // The literal A0 requires, shown verbatim next to what accepting it
        // costs. Nothing is inserted until the caller returns exactly this.
        acknowledgementLabel: draftPreview.recovery.acknowledgement,
        available: draftPreview.recovery.available,
        durationDraft: recoveryDurationDraft,
        measureLabel: draftPreview.recovery.measureLabel,
        remainderLabel: draftPreview.recovery.remainderLabel,
        unavailableReason: draftPreview.recovery.unavailableReason,
      }),
      truncationNotice: draftPreview.truncation?.message ?? null,
    }),
    harmony: Object.freeze({
      selectedChordLabel: null,
      selected: selectedChordView(snapshot),
      selectionStatusLabel: chordCount === 0
        ? "No chord events in this chart"
        : selectedChordView(snapshot) === null
          ? "No chord selected"
          : "Chord selected",
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
      // The live A0 transport status, not a hardcoded literal.
      audioState: snapshot.transport.status,
      audioStatusLabel: snapshot.transport.statusLabel,
      audioStatusDetail:
        snapshot.chordCount === 0
          ? "Write a chord, then press Play to hear it."
          : "Press Play to hear this chart.",
      tempoBpm: snapshot.tempoBpm,
      instrumentLabel: snapshot.instrumentLabel,
      positionLabel: `${playheadLabel} beats`,
      currentChordLabel: pointer.chordLabel,
      progressPercent: pointer.progressPercent,
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
  /**
   * True after the user explicitly aims quick entry at a measure. The reviewed
   * insertion-plan contract requires an overfill against a *chosen* target to
   * surface as a blocked statement with its resolutions — never to be resolved
   * silently — while a draft against the derived default target may retarget
   * to the nearest structural boundary, because that default was never the
   * user's decision.
   */
  const quickEntryTargetIsExplicit = useRef(false);
  const [quickEntryRefusal, setQuickEntryRefusal] = useState<string | null>(
    null,
  );
  /**
   * The layout-loss acknowledgement is a real gesture, not a formality: until
   * the caller makes it, the recovered-chord lane has no committable action.
   */
  /** The last focus sequence this surface rendered, so it renders each once. */
  const acknowledgedFocus = useRef<number | null>(null);
  const [recoveryAcknowledged, setRecoveryAcknowledged] = useState(false);
  const [recoveryDurationDraft, setRecoveryDurationDraft] = useState("");
  /**
   * The operation awaiting an explicit incomplete-measure reason. Every edit
   * that can leave a short bar records itself here so Confirm re-runs exactly
   * that operation with the reason, instead of guessing one.
   */
  const [pendingEdit, setPendingEdit] = useState<PendingEdit>(null);
  /**
   * U1-CMP-019 presentation state. The dialog opens only when the caller asks
   * for it, and its raw reason text is never written back into the document
   * except through an explicit Confirm.
   */
  const [completionDialogOpen, setCompletionDialogOpen] = useState(false);
  const [completionReasonDraft, setCompletionReasonDraft] = useState("");
  const [viewMode, setViewMode] = useState<StudioViewMode>("compact");
  const [rangeModeActive, setRangeModeActive] = useState(false);
  const [rangeStartDraft, setRangeStartDraft] = useState("");
  const [rangeEndDraft, setRangeEndDraft] = useState("");
  const [openMenuChordId, setOpenMenuChordId] = useState<string | null>(null);
  /**
   * The range as it stood when the mode opened, so Cancel restores it exactly
   * rather than clearing whatever the user had before.
   */
  const rangeOnEntry = useRef<Readonly<{
    anchor: StudioBoundaryInput;
    focus: StudioBoundaryInput;
  }> | null>(null);
  const [titleFeedback, setTitleFeedback] = useState<StudioTitleFeedback>(() =>
    Object.freeze({
      kind: "idle",
      message: "The committed document title is shown above.",
    }),
  );

  /**
   * Render the focus A0 asked for (contract 5.1). U1 never reads or infers
   * the current DOM focus to decide this: it moves focus to the requested
   * target, records it as the chart's tab stop when the target is a chord,
   * and then acknowledges the exact sequence so A0 can clear the request.
   * A target that is no longer rendered falls back to the chart region, which
   * is the last step of the declared priority, rather than to the document.
   *
   * This is a layout effect, not a passive one, because a deferred effect runs
   * after the browser is already free to deliver the next keystroke. On WebKit
   * that gap was observable: focus sat on the document body between a command
   * and its repair, so the key a user pressed immediately after (say Delete
   * right after a move) reached nothing at all. A layout effect closes the gap
   * before the next event can be dispatched.
   */
  useLayoutEffect(() => {
    const request = snapshot.focusRequest;
    if (request === null) return;
    if (acknowledgedFocus.current === request.sequence) return;
    acknowledgedFocus.current = request.sequence;
    if (request.kind === "event" && request.targetId !== null) {
      setRovingFocusId(request.targetId);
    }
    const selector =
      request.targetId === null
        ? "#chart-workspace"
        : request.kind === "event"
          ? `[data-chord-id="${request.targetId}"]`
          : request.kind === "measure"
            ? `[data-measure-id="${request.targetId}"]`
            : request.kind === "section"
              ? `[data-section-id="${request.targetId}"]`
              : `#${request.targetId}`;
    const target =
      document.querySelector<HTMLElement>(selector) ??
      document.querySelector<HTMLElement>("#chart-workspace");
    target?.focus();
    actions.acknowledgeFocus(request.sequence);
  }, [actions, snapshot.focusRequest]);

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

  /**
   * A draft keeps the target it was aimed at. Only when it has none does the
   * target follow the insertion bookmark, so re-aiming an existing draft is
   * not silently undone by the next keystroke.
   */
  const quickEntryTarget = (): StudioBoundaryInput | null => {
    const existing = snapshot.quickEntry.target;
    if (existing !== null) return existing;
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

  const recordEditResult = (
    result: StudioControllerActionResult,
    pending: PendingEdit = null,
  ): void => {
    if (result.ok) {
      setEditRefusal(null);
      setPendingEdit(null);
      return;
    }
    const code = result.refusal.code;
    // Only a reason-required refusal is resumable; anything else clears the
    // pending operation so Confirm can never re-run the wrong edit.
    const resumable = code === "u1.completion_reason_required";
    setPendingEdit(resumable ? pending : null);
    // The interrupted operation can continue only through an explicit
    // declaration, so U1-CMP-019 opens with it. Nothing is declared until the
    // caller types a reason and confirms.
    if (resumable) setCompletionDialogOpen(true);
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

  /** The boundary a card denotes for each range edge. */
  const cardBoundary = (
    chordId: string,
    edge: "start" | "end",
  ): StudioBoundaryInput =>
    edge === "start"
      ? { eventId: chordId, kind: "before-event" }
      : { eventId: chordId, kind: "after-event" };

  const rangeEdgeFromFocus = (edge: "start" | "end"): void => {
    /**
     * The focused card is the one the chart renders as the single tab stop:
     * the roving focus id, or the first chord when nothing has moved it yet.
     * U1 never reads `document.activeElement` to decide this.
     */
    const firstChordId =
      snapshot.sections
        .flatMap((section) => section.measures)
        .flatMap((measure) => measure.events)[0]?.id ?? null;
    const chordId =
      rovingFocusId ?? snapshot.bookmarks.selectionFocusEventId ?? firstChordId;
    if (chordId === null) {
      setEditRefusal(
        Object.freeze({
          code: "u1.range_boundary_invalid",
          message: "No chord is focused.",
          needsIncompleteReason: false,
          recoveryAction: "Focus a chord card, then set the range boundary.",
          resolutions: Object.freeze([]),
        }),
      );
      return;
    }
    recordEditResult(actions.setRangeEdge(edge, cardBoundary(chordId, edge)));
  };

  /**
   * The insertion plan re-parses the draft, so it is recomputed only when the
   * draft, its target, or the revision actually changes. Computing it on every
   * render would exceed the declared at-most-once-per-draft-change work bound.
   */
  const insertionPlan = useMemo(
    () => actions.previewInsertionPlan(),
    [
      actions,
      snapshot.quickEntry.text,
      snapshot.quickEntry.targetId,
      snapshot.revision,
    ],
  );

  /** Same bound, same reason: one T0 parse per draft change, not per render. */
  const draftPreview = useMemo(
    () => actions.previewQuickEntryDraft(),
    [
      actions,
      snapshot.quickEntry.text,
      snapshot.quickEntry.targetId,
      snapshot.revision,
    ],
  );

  const livePlayheadLabel = useLivePlayheadLabel(
    snapshot.transport.status,
    actions.readTransportPlayheadLabel,
  );

  const view = viewFromSnapshot(snapshot, {
    activeSheet,
    completionDialogOpen,
    completionReasonDraft,
    editRefusal,
    openMenuChordId,
    quickEntryRefusal,
    rangeEndDraft,
    rangeModeActive,
    rangeStartDraft,
    recoveryAcknowledged,
    recoveryDurationDraft,
    rovingFocusId,
    titleDraft,
    titleFeedback,
    uiRefusal,
    viewMode,
  }, insertionPlan, draftPreview, livePlayheadLabel);

  /*
   * jcpe-7she: the independent ear compares what the tap heard with the
   * chord the chart says is sounding right now. Both inputs are the same
   * display-only reads the highlight uses.
   */
  const analyzerPointer = playbackPointer(snapshot, livePlayheadLabel);
  const analyzerExpectation: StudioAnalyzerExpectation | null =
    analyzerPointer.chordId === null || analyzerPointer.chordLabel === null
      ? null
      : (() => {
          const pitchClasses = actions.readEventPitchClasses(
            analyzerPointer.chordId,
          );
          return pitchClasses === null
            ? null
            : Object.freeze({
                chordLabel: analyzerPointer.chordLabel,
                pitchClasses,
              });
        })();

  return (
    <>
    <StudioShell
      view={view}
      transport={{
        canPlay: snapshot.chordCount > 0,
        onPause: () => {
          recordEditResult(actions.pauseProgression(), { kind: "delete" });
        },
        onPlay: (source) => {
          /*
           * The receipt records how the activation arrived. The browser is the
           * real gate on opening an audio graph; this is X0's own bookkeeping,
           * and a scripted activation fails at the browser regardless.
           */
          recordEditResult(
            actions.playProgression({
              kind:
                source === "pointer" ? "trusted-pointer" : "trusted-keyboard",
              trusted: true,
              sequence: 1,
            }),
            { kind: "delete" },
          );
        },
        onStop: () => {
          recordEditResult(actions.stopProgression(), { kind: "delete" });
        },
      }}
      callbacks={{
        onQuickEntryDraftChange: (value) => {
          if (value.length === 0) quickEntryTargetIsExplicit.current = false;
          const preview = actions.previewChartText(value);
          const target = quickEntryTarget();
          let result = actions.setQuickEntryDraft(
            value,
            target,
            preview.status,
            preview.issueCodes,
          );
          if (
            result.ok &&
            target !== null &&
            target.kind === "measure-start" &&
            !quickEntryTargetIsExplicit.current
          ) {
            /*
             * The reviewed overfill resolution is "choose an empty measure or a
             * structural boundary". A lead-sheet writer typing more bars than
             * the default bookmark measure holds means "keep going", so this
             * surface chooses the nearest structural boundary for them — the
             * end of the section that owns that measure — instead of
             * dead-ending the draft on a refusal the user cannot see coming.
             * An explicitly aimed target is never overridden: that overfill
             * must surface as the reviewed blocked statement.
             */
            const plan = actions.previewInsertionPlan();
            if (plan.statement === "overfill-requires-split") {
              const owner = snapshot.sections.find((section) =>
                section.measures.some(
                  (measure) => measure.id === target.measureId,
                ),
              );
              if (owner !== undefined) {
                const retargeted = actions.setQuickEntryDraft(
                  value,
                  { kind: "section-end", sectionId: owner.id },
                  preview.status,
                  preview.issueCodes,
                );
                if (retargeted.ok) result = retargeted;
              }
            }
          }
          setQuickEntryRefusal(
            result.ok
              ? null
              : `${result.refusal.message} ${result.refusal.recoveryAction}`,
          );
        },
        onQuickEntryInsert: () => {
          const result = actions.applyQuickEntryPreview();
          if (result.ok) quickEntryTargetIsExplicit.current = false;
          setQuickEntryRefusal(
            result.ok
              ? null
              : `${result.refusal.message} ${result.refusal.recoveryAction}`,
          );
        },
        onQuickEntryClear: () => {
          // A refusal here is surfaced, never presented as a success. The
          // earlier form discarded the result, which hid a real defect where
          // clearing the draft could not succeed at all.
          quickEntryTargetIsExplicit.current = false;
          const result = actions.clearQuickEntry();
          setQuickEntryRefusal(
            result.ok
              ? null
              : `${result.refusal.message} ${result.refusal.recoveryAction}`,
          );
        },
        onRecoveryAcknowledgeChange: (acknowledged) => {
          setRecoveryAcknowledged(acknowledged);
        },
        onRecoveryDurationDraftChange: (value) => {
          setRecoveryDurationDraft(value);
        },
        onInsertRecoveredChord: (globalOrdinal) => {
          /**
           * The acknowledgement travels from the checkbox the caller ticked to
           * the plan A0 receives. An unticked box sends nothing, so the lane's
           * own precondition refuses before any command is published.
           */
          // The duration field belongs to a chord T0 could not measure; a
          // chord whose duration T0 already resolved is inserted with none,
          // so a stale draft in the field cannot refuse an unrelated row.
          const row = view.quickEntry.tokens.find(
            (token) => token.globalOrdinal === globalOrdinal,
          );
          const result = actions.insertRecoveredChord(
            globalOrdinal,
            row?.requiresDuration === true ? recoveryDurationDraft : "",
            recoveryAcknowledged
              ? view.quickEntry.recovery.acknowledgementLabel
              : "",
          );
          // Resume with exactly the duration this attempt used, so Confirm
          // re-runs the same command with only the reason added.
          recordEditResult(result, {
            beatText: row?.requiresDuration === true ? recoveryDurationDraft : "",
            globalOrdinal,
            kind: "recovered-chord",
          });
          if (result.ok) {
            setRecoveryDurationDraft("");
            setRecoveryAcknowledged(false);
          }
          setQuickEntryRefusal(
            result.ok
              ? null
              : `${result.refusal.message} ${result.refusal.recoveryAction}`,
          );
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
          recordEditResult(actions.deleteSelection(), { kind: "delete" });
        },
        onDuplicateSelection: () => {
          recordEditResult(actions.duplicateSelection(), { kind: "duplicate" });
        },
        onMoveSelection: (direction) => {
          recordEditResult(actions.moveSelection(direction), {
            direction,
            kind: "move",
          });
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
          recordEditResult(actions.setEventDurationText(chordId, beatText), {
            beatText,
            chordId,
            kind: "duration",
          });
        },
        onConfirmIncompleteMeasure: (reason) => {
          // Re-run exactly the operation the refusal interrupted. Guessing an
          // operation here would publish a command the user never asked for.
          if (pendingEdit === null) return;
          setCompletionDialogOpen(false);
          setCompletionReasonDraft("");
          switch (pendingEdit.kind) {
            case "duration":
              recordEditResult(
                actions.setEventDurationText(
                  pendingEdit.chordId,
                  pendingEdit.beatText,
                  reason,
                ),
              );
              return;
            case "delete":
              recordEditResult(actions.deleteSelection(reason));
              return;
            case "duplicate":
              recordEditResult(actions.duplicateSelection(null, reason));
              return;
            case "move":
              recordEditResult(
                actions.moveSelection(pendingEdit.direction, reason),
              );
              return;
            case "move-following":
              recordEditResult(actions.moveFollowingEvents(reason));
              return;
            case "move-to":
              recordEditResult(
                actions.moveSelectionTo(pendingEdit.measureId, null, reason),
              );
              return;
            case "measure-completion":
              recordEditResult(
                actions.declareMeasureCompletion(pendingEdit.measureId, reason),
              );
              return;
            case "recovered-chord": {
              const result = actions.insertRecoveredChord(
                pendingEdit.globalOrdinal,
                pendingEdit.beatText,
                recoveryAcknowledged
                  ? view.quickEntry.recovery.acknowledgementLabel
                  : "",
                reason,
              );
              recordEditResult(result);
              if (result.ok) {
                setRecoveryDurationDraft("");
                setRecoveryAcknowledged(false);
              }
              return;
            }
          }
        },
        onRenameSection: (sectionId, name) => {
          recordEditResult(actions.renameSection(sectionId, name));
        },
        onAnnotateSection: (sectionId, annotation) => {
          recordEditResult(actions.annotateSection(sectionId, annotation));
        },
        onDropChordOnMeasure: (measureId) => {
          recordEditResult(actions.moveSelectionTo(measureId), {
            kind: "move-to",
            measureId,
          });
        },
        onCardMenuOpenChange: (chordId) => {
          // Opening a menu selects its card, so every item afterwards acts on
          // a known selection and is itself exactly one command. The selection
          // change is an ephemeral intent and creates no history entry.
          if (chordId !== null) {
            setRovingFocusId(chordId);
            recordEditResult(actions.selectEvent(chordId));
          }
          setOpenMenuChordId(chordId);
        },
        onCardMenuAction: (chordId, action) => {
          setOpenMenuChordId(null);
          switch (action) {
            case "duplicate":
              recordEditResult(actions.duplicateSelection(), {
                kind: "duplicate",
              });
              return;
            case "delete":
              recordEditResult(actions.deleteSelection(), { kind: "delete" });
              return;
            case "move-previous":
              recordEditResult(actions.moveSelection("previous"), {
                direction: "previous",
                kind: "move",
              });
              return;
            case "move-next":
              recordEditResult(actions.moveSelection("next"), {
                direction: "next",
                kind: "move",
              });
              return;
            case "move-following":
              recordEditResult(actions.moveFollowingEvents(), {
                kind: "move-following",
              });
              return;
            case "join-next":
              recordEditResult(actions.joinEventDurations(chordId));
              return;
            case "range-start":
              recordEditResult(
                actions.setRangeEdge("start", cardBoundary(chordId, "start")),
              );
              return;
            case "range-end":
              recordEditResult(
                actions.setRangeEdge("end", cardBoundary(chordId, "end")),
              );
              return;
            case "declare-completion": {
              // U1-OP-019's pointer alternative. The measure is the one this
              // card belongs to; a short bar still needs a stated reason.
              const owner = snapshot.sections
                .flatMap((section) => section.measures)
                .find((measure) =>
                  measure.events.some((event) => event.id === chordId),
                );
              if (owner === undefined) return;
              recordEditResult(actions.declareMeasureCompletion(owner.id), {
                kind: "measure-completion",
                measureId: owner.id,
              });
              return;
            }
            case "edit-symbol":
            case "edit-duration":
            case "split-duration":
              // These open a component-local editor; the chart owns that
              // presentation step and never reaches the application here.
              return;
          }
        },
        onSplitDuration: (chordId, firstBeats) => {
          // Only the split point travels; the application derives the exact
          // remainder, so no surface performs musical arithmetic.
          recordEditResult(actions.splitEventDuration(chordId, firstBeats));
        },
        onSplitSection: (sectionId, beforeMeasureId) => {
          recordEditResult(
            actions.splitSection(sectionId, beforeMeasureId, nextSectionName()),
          );
        },
        onJoinSections: (sectionId) => {
          recordEditResult(actions.joinSections(sectionId));
        },
        onSetInsertionPoint: (measureId) => {
          // Aiming re-targets the existing draft in place: exactly one
          // `set-quick-entry` intent, so a typed draft follows the new target
          // instead of staying pointed at the previous measure.
          quickEntryTargetIsExplicit.current = true;
          const preview = actions.previewChartText(snapshot.quickEntry.text);
          recordEditResult(
            actions.setQuickEntryDraft(
              snapshot.quickEntry.text,
              { kind: "measure-start", measureId },
              preview.status,
              preview.issueCodes,
            ),
          );
        },
        onRangeModeChange: (active) => {
          if (active) {
            const anchor = snapshot.bookmarks.rangeAnchor;
            const focus = snapshot.bookmarks.rangeFocus;
            rangeOnEntry.current =
              anchor === null || focus === null ? null : { anchor, focus };
            setRangeStartDraft(snapshot.bookmarks.rangeStartBeatLabel ?? "");
            setRangeEndDraft(snapshot.bookmarks.rangeEndBeatLabel ?? "");
          }
          setRangeModeActive(active);
        },
        onRangeEdgeFromFocus: rangeEdgeFromFocus,
        onRangeEdgeToChord: (edge, chordId) => {
          // The handle drop names the chord explicitly; the same edge is also
          // reachable from Set start/Set end and from the exact beat fields.
          recordEditResult(
            actions.setRangeEdge(edge, cardBoundary(chordId, edge)),
          );
        },
        onRangeDraftChange: (edge, value) => {
          if (edge === "start") setRangeStartDraft(value);
          else setRangeEndDraft(value);
        },
        onRangeDraftCommit: (edge) => {
          recordEditResult(
            actions.setRangeEdgeBeat(
              edge,
              edge === "start" ? rangeStartDraft : rangeEndDraft,
            ),
          );
        },
        onRangeClear: () => {
          recordEditResult(actions.clearRange());
          setRangeStartDraft("");
          setRangeEndDraft("");
        },
        onRangeCancel: () => {
          const prior = rangeOnEntry.current;
          recordEditResult(
            prior === null
              ? actions.clearRange()
              : actions.setRange(prior.anchor, prior.focus),
          );
          setRangeModeActive(false);
          setRangeStartDraft("");
          setRangeEndDraft("");
        },
        onViewModeChange: (mode) => {
          setViewMode(mode);
        },
        onSetSectionBoundary: (sectionId, boundary) => {
          recordEditResult(actions.setSectionBoundary(sectionId, boundary));
        },
        onCancelPendingEdit: () => {
          setPendingEdit(null);
          setEditRefusal(null);
          setCompletionDialogOpen(false);
          setCompletionReasonDraft("");
        },
        onCompletionDialogOpenChange: (open) => {
          setCompletionDialogOpen(open);
          // Closing without confirming keeps the interrupted operation and its
          // refusal intact; only Cancel abandons them.
          if (!open) setCompletionReasonDraft("");
        },
        onCompletionReasonDraftChange: (value) => {
          setCompletionReasonDraft(value);
        },
        onDeclareMeasureCompletion: (measureId) => {
          recordEditResult(actions.declareMeasureCompletion(measureId), {
            kind: "measure-completion",
            measureId,
          });
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
      <AnalyzerPanel
        active={snapshot.transport.status === "playing"}
        readFrame={actions.readTransportAnalysisFrame}
        expectation={analyzerExpectation}
      />
    </>
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

/**
 * The one binding between a live controller and the rendered App.
 *
 * This lives beside `App` rather than in the composition root so that the
 * browser evidence harness renders exactly the binding the shipped page
 * renders: if a controller action were wired to the wrong App callback, a
 * harness that re-declared the map by hand would hide it. It must stay in this
 * module — `ui/runtime` is pinned to re-export from `./App` alone so the test
 * gallery inventory can never enter the release graph through a new entry.
 */
export type StudioRootProps = Readonly<{
  controller: StudioController;
}>;

export function StudioRoot({ controller }: StudioRootProps) {
  const [snapshot, setSnapshot] = useState(controller.getSnapshot());

  useEffect(() => {
    const publishSnapshot = (): void => {
      setSnapshot(controller.getSnapshot());
    };
    const unsubscribe = controller.subscribe(publishSnapshot);
    publishSnapshot();
    return unsubscribe;
  }, [controller]);

  return (
    <App
      snapshot={snapshot}
      actions={{
        acknowledgeFocus: controller.acknowledgeFocus,
        annotateSection: controller.annotateSection,
        applyInlineSymbol: controller.applyInlineSymbol,
        applyQuickEntryPreview: controller.applyQuickEntryPreview,
        clearQuickEntry: controller.clearQuickEntry,
        declareMeasureCompletion: controller.declareMeasureCompletion,
        deleteSelection: controller.deleteSelection,
        duplicateSelection: controller.duplicateSelection,
        insertMeasure: controller.insertMeasure,
        insertRecoveredChord: controller.insertRecoveredChord,
        insertSection: controller.insertSection,
        joinEventDurations: controller.joinEventDurations,
        joinSections: controller.joinSections,
        moveFollowingEvents: controller.moveFollowingEvents,
        moveSelection: controller.moveSelection,
        moveSelectionTo: controller.moveSelectionTo,
        extendSelectionTo: controller.extendSelectionTo,
        previewChartText: controller.previewChartText,
        previewInsertionPlan: controller.previewInsertionPlan,
        previewQuickEntryDraft: controller.previewQuickEntryDraft,
        redo: controller.redo,
        renameSection: controller.renameSection,
        selectEvent: controller.selectEvent,
        setInsertionPoint: controller.setInsertionPoint,
        setRange: controller.setRange,
        setRangeEdge: controller.setRangeEdge,
        setRangeEdgeBeat: controller.setRangeEdgeBeat,
        clearRange: controller.clearRange,
        pauseProgression: controller.pauseProgression,
        playProgression: controller.playProgression,
        readTransportPlayheadLabel: controller.readTransportPlayheadLabel,
        readTransportAnalysisFrame: controller.readTransportAnalysisFrame,
        readEventPitchClasses: controller.readEventPitchClasses,
        splitEventDuration: controller.splitEventDuration,
        splitSection: controller.splitSection,
        stopProgression: controller.stopProgression,
        setSectionBoundary: controller.setSectionBoundary,
        setEventDurationText: controller.setEventDurationText,
        setQuickEntryDraft: controller.setQuickEntryDraft,
        setRailCollapsed: controller.setRailCollapsed,
        setTitle: controller.setTitle,
        undo: controller.undo,
      }}
    />
  );
}
