import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "preact/hooks";

import {
  buildSharePayload,
  deleteSelectionAutoDeclaring,
  duplicateSelectionAutoResolving,
  encodeShareFragment,
  joinNextMeasureComposing,
  loadProgressionLibraryEntry,
  moveSelectionToAutoResolving,
  RESIZE_AUTO_COMPLETION_REASON,
  STUDIO_AUDIO_GESTURE_SEQUENCE_STRIDE,
  STARTER_CHART,
  type LoadProgressionLibraryEntryResult,
  auditionMidiImportPreview,
  type M1ImportOverrides,
  type MidiImportAutoCommitResult,
  type MidiImportCommitResult,
  type MidiImportPreview,
  unavailableMidiImportPreview,
  type StudioMidiImportService,
  type StudioAudioGesture,
  type StudioChordDetailView,
  type StudioContinuationView,
  type StudioController,
  type StudioEventAnalysisView,
  type StudioSectionPhrasesView,
  type StudioControllerActionResult,
  type StudioBoundaryInput,
  type StudioDraftPreview,
  type StudioInsertionPlan,
  type StudioRailSide,
  type StudioViewModel,
  type StudioAnalysisFrame,
  type StudioAnalyzerExpectation,
  instrumentOptions,
  studioMidiExportUnwiredDownload,
  studioMidiExportUnwiredGenerate,
  studioMidiExportUnwiredPreview,
  type StudioMidiExportDownloadResult,
  type StudioMidiExportGenerateResult,
  type StudioMidiExportPreparationId,
  type StudioMidiExportPreview,
  type StudioMidiExportPreviewResult,
  type StudioMidiExportService,
} from "../application/runtime";
import { GROOVE_STYLE_IDS, MAX_SHORT_TEXT_CODE_POINTS } from "../domain";

/** The reviewed tempo window the controller enforces (20–300 BPM). */
const MIN_STUDIO_TEMPO_BPM = 20;
const MAX_STUDIO_TEMPO_BPM = 300;
import {
  AnalyzerPanel,
  RecoveryNotice,
  RecoveryStatusLine,
  StudioShell,
  type StudioCardMenuItemView,
  type StudioFactView,
  type StudioMidiImportOverridesView,
  type StudioMidiImportView,
  type StudioMidiExportView,
  type StudioSheetId,
  type StudioShareFeedback,
  type StudioDetailView,
  type StudioShellView,
  type StudioTitleFeedback,
  type StudioChartLayout,
  type StudioViewMode,
} from "./studio";

export type AppActions = Readonly<{
  /**
   * The controller's LIVE snapshot. The render's `snapshot` prop is frozen
   * per render; a handler that mutates the document and then derives a
   * target from the render prop aims at ids that no longer exist. Any
   * multi-step gesture reads THIS after each mutating step.
   */
  getSnapshot: () => ReturnType<StudioController["getSnapshot"]>;
  setTitle: (value: string) => StudioControllerActionResult;
  setTempo: (bpm: number) => StudioControllerActionResult;
  setPerformanceStyle: (styleId: string) => StudioControllerActionResult;
  setInstrument: (instrumentId: string) => StudioControllerActionResult;
  setMasterVolume: (volume: number) => StudioControllerActionResult;
  setKey: (
    key: Readonly<{ step: string; alter: number; mode: string }> | null,
  ) => StudioControllerActionResult;
  clearChart: () => StudioControllerActionResult;
  deleteMeasure: (measureId: string) => StudioControllerActionResult;
  splitAtBar: (
    beforeEventId: string,
    retainedReason?: string | null,
    suffixReason?: string | null,
  ) => StudioControllerActionResult;
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
  /** Seek the active run to a fraction of the chart (jcpe-v2r-loop-seek-ukk6). */
  seekToFraction: (fraction: number) => StudioControllerActionResult;
  /** Toggle whole-chart looping; armed intent applies at the next Play. */
  toggleLoop: () => StudioControllerActionResult;
  /** Arm/disarm a section loop (V2R-18); exclusive with the whole-chart flag. */
  armSectionLoop: (sectionId: string) => StudioControllerActionResult;
  /** Display-only loop state: armed intent vs transport truth. */
  readLoopView: () => Readonly<{
    enabled: boolean;
    engaged: boolean;
    sectionId: string | null;
  }>;
  /** Engaged loop span as run fractions for the scrub region; null when none. */
  readLoopRegionView: () => Readonly<{
    startFraction: number;
    endFraction: number;
  }> | null;
  previewMasterVolume: (volume: number) => StudioControllerActionResult;
  toggleMute: () => StudioControllerActionResult;
  readMixView: () => Readonly<{ muted: boolean }>;
  /**
   * The one library-load gesture (jcpe-my0j), owned by the application layer
   * so a test can drive the real path: replace the chart, retitle, set
   * groove and tempo, and STOP a live run explicitly. The surface only
   * renders the returned step results.
   */
  loadLibraryEntry: (entryId: string) => LoadProgressionLibraryEntryResult;
  /**
   * The MIDI import gesture, composed at the root. False here is honest —
   * a session whose composition wired no decoder hides the surface rather
   * than offering a control that cannot work.
   */
  midiImportAvailable: boolean;
  readMidiFile: (
    fileName: string,
    bytes: Uint8Array,
  ) => Promise<MidiImportPreview>;
  commitMidiImport: (
    preview: MidiImportPreview,
  ) => MidiImportCommitResult | null;
  /**
   * The M1 automatic envelope: chunked insert, settings transfer, groove —
   * with a per-step ledger, the stated undo count, and rollback on refusal.
   */
  commitMidiImportAutomatic: (
    preview: MidiImportPreview,
  ) => MidiImportAutoCommitResult | null;
  /** M1-OVR: re-plan the pending preview on the retained bytes. */
  replanMidiImport: (
    preview: MidiImportPreview,
    overrides: M1ImportOverrides,
  ) => MidiImportPreview | null;
  /**
   * The U7 MIDI export workflow service. A session whose composition wired
   * none hides the surface rather than offering a control that cannot work.
   */
  midiExportAvailable: boolean;
  midiExportOpenPreview: () => Promise<StudioMidiExportPreviewResult>;
  midiExportGenerate: (
    preparationId: StudioMidiExportPreparationId,
  ) => StudioMidiExportGenerateResult;
  midiExportDownload: (
    preparationId: StudioMidiExportPreparationId,
  ) => Promise<StudioMidiExportDownloadResult>;
  midiExportAbandon: (
    preparationId: StudioMidiExportPreparationId | null,
  ) => void;
  /**
   * Display-only live playhead label the animation frame reads while playing.
   * Interpolation for the eye, never a second musical clock: committed
   * transport state still arrives only through notifications.
   */
  readTransportPlayheadLabel: () => string | null;
  /** Sound one chord immediately on selection (jcpe-gnyy). */
  previewChord: (
    eventId: string,
    gesture: StudioAudioGesture,
  ) => StudioControllerActionResult;
  /** Sound one pitch from the detail keyboard (jcpe-v2r-detail-yimm). */
  previewPitch: (
    midiPitch: number,
    gesture: StudioAudioGesture,
  ) => StudioControllerActionResult;
  /** Sound one voiced pitch set through the same lane (M1 audition). */
  previewPitches: (
    midiPitches: readonly number[],
    gesture: StudioAudioGesture,
  ) => StudioControllerActionResult;
  /** Display-only analyzer reads (jcpe-7she); never a command path. */
  readTransportAnalysisFrame: () => StudioAnalysisFrame | null;
  readEventPitchClasses: (eventId: string) => readonly number[] | null;
  readContinuationSuggestions: () => StudioContinuationView;
  /** Display-only chart annotation reads (jcpe-v2-redesign-z323). */
  readEventAnalysis: (eventId: string) => StudioEventAnalysisView | null;
  readSectionPhrases: (sectionId: string) => StudioSectionPhrasesView | null;
  readChordDetail: (eventId: string) => StudioChordDetailView | null;
}>;

const QUICK_ENTRY_MAX_CODE_POINTS = 4_096;

/**
 * A run the user would still call "playback": sounding, warming up, or
 * paused mid-chart. Used by gestures that must be loud about what a
 * document edit does to that run (jcpe-my0j); `stopping` is excluded
 * because that run is already on its way out.
 */
function transportRunIsLive(status: string): boolean {
  return status === "starting" || status === "playing" || status === "paused";
}

/** The operation that a `u1.completion_reason_required` refusal interrupted. */
type PendingEdit =
  | Readonly<{ kind: "duration"; chordId: string; beatText: string }>
  | Readonly<{ kind: "delete" }>
  | Readonly<{ kind: "duplicate" }>
  | Readonly<{ kind: "move"; direction: "previous" | "next" }>
  | Readonly<{ kind: "move-following" }>
  | Readonly<{ kind: "split-at-bar"; beforeEventId: string }>
  | Readonly<{ kind: "move-to"; measureId: string }>
  | Readonly<{ kind: "join-next-measure"; measureId: string }>
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
  /** A boot-time refusal to surface once in the shell notice. */
  startupNotice?: string | null;
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

/**
 * Musical bar·beat readout for the transport Position fact. Presentation
 * only: the domain's exact rational is untouched and rides along verbatim as
 * `positionExactLabel` for a title attribute. Bars count quarter-note beats
 * in fours, matching the studio's 4/4 charts.
 */
function musicalPositionLabel(exactBeatLabel: string): string {
  const parsed = parseExactLabel(exactBeatLabel);
  if (parsed === null) return `${exactBeatLabel} beats`;
  const [numerator, denominator] = parsed;
  const beats = Number(numerator) / Number(denominator);
  if (!Number.isFinite(beats)) return `${exactBeatLabel} beats`;
  const bar = Math.floor(beats / 4) + 1;
  const beat = (beats % 4) + 1;
  return `Bar ${String(bar)} · beat ${beat.toFixed(1)}`;
}

/**
 * The insertion-target sentence with its identity restored. A0's boundary
 * phrase is deliberately identity-free ("After measure"), and the surface is
 * the layer that knows which measure that is — without this composition the
 * status line read "After measure " with nothing after it. The ordinal is
 * the 1-based one the chart already shows; nothing here re-derives identity.
 */
function composedTargetLabel(snapshot: StudioViewModel): string {
  const base = snapshot.quickEntry.targetLabel;
  if (base === null) return "No insertion target";
  const target = snapshot.quickEntry.target;
  if (target === null) return base;
  if ("measureId" in target) {
    for (const section of snapshot.sections) {
      for (const measure of section.measures) {
        if (measure.id !== target.measureId) continue;
        const ordinal = String(measure.ordinal);
        switch (target.kind) {
          case "before-measure":
            return `Before measure ${ordinal}`;
          case "after-measure":
            return `After measure ${ordinal}`;
          case "measure-start":
            return `At the start of measure ${ordinal}`;
          case "measure-end":
            return `At the end of measure ${ordinal}`;
        }
      }
    }
    return base;
  }
  if ("sectionId" in target) {
    const section = snapshot.sections.find(
      (candidate) => candidate.id === target.sectionId,
    );
    if (section === undefined) return base;
    switch (target.kind) {
      case "before-section":
        return `Before section ${section.name}`;
      case "after-section":
        return `After section ${section.name}`;
      case "section-start":
        return `At the start of section ${section.name}`;
      case "section-end":
        return `At the end of section ${section.name}`;
    }
  }
  if ("eventId" in target) {
    for (const section of snapshot.sections) {
      for (const measure of section.measures) {
        for (const event of measure.events) {
          if (event.id === target.eventId) {
            return `${base} ${String(event.ordinal)}`;
          }
        }
      }
    }
  }
  return base;
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
  activeSheet: StudioSheetId | null;
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
  /** Presentation-only sheet/grid layout (V2R-4). */
  chartLayout: StudioChartLayout;
  rangeModeActive: boolean;
  rangeStartDraft: string;
  rangeEndDraft: string;
  openMenuChordId: string | null;
  /** Two-step Clear confirmation; presentation-only. */
  clearArmed: boolean;
  tempoDraft: string;
  tempoInvalid: boolean;
  tempoFeedback: string | null;
  shareFeedback: StudioShareFeedback | null;
  /** True for ~2s after a clipboard success; flips the Copy-link label. */
  shareCopied: boolean;
}>;

/** Teaching labels restate stored facts; an absent fact is shown as absent. */
function teachingNotes(
  event: StudioViewModel["sections"][number]["measures"][number]["events"][number],
  roman: string | null,
): readonly string[] {
  return Object.freeze([
    `Starts at beat ${event.startBeatLabel}`,
    `Lasts ${event.durationBeatLabel} beats`,
    `Voicing mode: ${event.voicingMode}`,
    event.hasAnnotation ? "Carries a note" : "No note",
    /* Analysed only when the document key gives the reading authority
       (jcpe-v2r-tour-i504); absence stays stated, never filled in. */
    roman === null
      ? "Roman numeral: not analysed yet"
      : `Roman numeral: ${roman}`,
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

/**
 * The chord-detail panel's view (jcpe-v2r-detail-yimm): the chart-annotation
 * read port's frozen values mapped onto the presentational shape, with the
 * place line composed from the same view-model fields the facts list shows.
 * Analysis honesty carries through: a non-analyzed outcome keeps its stated
 * sentence and a null roman renders as nothing.
 */
function detailViewFrom(
  read: (eventId: string) => StudioChordDetailView | null,
  snapshot: StudioViewModel,
): StudioDetailView | null {
  const selectedIds = snapshot.bookmarks.selectedEventIds;
  const targetId = selectedIds[selectedIds.length - 1];
  if (targetId === undefined) return null;
  const raw = read(targetId);
  if (raw === null) return null;
  let place = "";
  let symbolText = "";
  for (const section of snapshot.sections) {
    for (const measure of section.measures) {
      for (const event of measure.events) {
        if (event.id !== targetId) continue;
        place = `Bar ${String(measure.ordinal)} · ${event.durationBeatLabel} beats · ${snapshot.keyLabel}`;
        symbolText = event.symbolText;
      }
    }
  }
  if (symbolText.length === 0) return null;
  return Object.freeze({
    place,
    symbolText,
    roman: raw.analysis.roman,
    functionSentence: raw.analysis.functionSentence,
    scaleSentence: raw.analysis.scaleSentence,
    tones: Object.freeze(
      raw.tones.map((tone) =>
        Object.freeze({
          name: tone.name,
          role: tone.role,
          guide: tone.guide,
          pitchClass: tone.pitchClass,
        }),
      ),
    ),
    guideToneNames: raw.guideToneNames,
    resolution:
      raw.resolution === null
        ? null
        : Object.freeze({
            targetSymbol: raw.resolution.targetSymbol,
            moves: Object.freeze(
              raw.resolution.moves.map((move) =>
                Object.freeze({
                  fromName: move.fromName,
                  toName: move.toName,
                  held: move.motion === "held",
                }),
              ),
            ),
            note: raw.resolution.note,
          }),
    next: Object.freeze(
      raw.next.map((option) =>
        Object.freeze({
          id: option.id,
          symbolText: option.symbolText,
          roman: option.roman,
          why: option.why,
        }),
      ),
    ),
  });
}

const SUGGESTION_CATEGORY_LABELS: Readonly<Record<string, string>> =
  Object.freeze({
    "resolve": "Resolve",
    "continue-pattern": "Continue the pattern",
    "approach-target": "Approach a target",
    "increase-color": "Add color",
    "explore": "Explore",
  });

const MIDI_IMPORT_REFUSAL_PROSE: Readonly<Record<string, string>> =
  Object.freeze({
    "import.schema_invalid": "That import request is not one this reader accepts.",
    "import.request_id_invalid": "That import request carries an unusable id.",
    "limit.midi_import_bytes_exceeded": "That file is larger than the 4 MiB this reader accepts.",
    "smf.header_invalid": "That file does not start with a Standard MIDI File header.",
    "smf.format_unsupported": "Only MIDI format 0 and format 1 files can be read.",
    "smf.track_count_invalid": "The file's track count does not match the tracks it contains.",
    "smf.division_smpte_unsupported": "This reader needs ticks per quarter note, not SMPTE timecode.",
    "smf.division_zero": "The file declares zero ticks per quarter note.",
    "smf.chunk_invalid": "A chunk in this file has an unreadable tag.",
    "smf.chunk_truncated": "The file ends inside a chunk that declared more data.",
    "smf.delta_invalid": "A timing value in this file is longer than MIDI allows.",
    "smf.event_invalid": "An event in this file is not a MIDI event this reader knows.",
    "smf.meta_unknown": "A meta event type in this file is outside the accepted set.",
    "smf.meta_length_invalid": "A meta event declares the wrong number of bytes.",
    "smf.meta_oversized": "A meta event declares more than 1 KiB of text.",
    "smf.tempo_zero": "The file sets a tempo of zero microseconds per beat.",
    "smf.meter_invalid": "The file declares a time signature this reader cannot use.",
    "smf.end_of_track_invalid": "A track does not end where it says it ends.",
    "smf.conductor_meta_misplaced": "Tempo and meter belong to track 0 in a format 1 file.",
    "smf.note_overlap": "The same note starts twice without ending.",
    "smf.note_off_unmatched": "A note ends without ever having started.",
    "smf.note_on_unterminated": "A note is still sounding when its track ends.",
    "limit.midi_import_tracks_exceeded": "That file has more than 64 tracks.",
    "limit.midi_import_events_exceeded": "That file has more events than this reader accepts.",
    "limit.midi_import_notes_exceeded": "That file has more notes than this reader accepts.",
    "limit.midi_import_tick_horizon_exceeded": "That file's timeline runs past the reader's horizon.",
    "limit.midi_import_tempo_changes_exceeded": "That file has more tempo changes than this reader accepts.",
    "limit.midi_import_meter_changes_exceeded": "That file has more meter changes than this reader accepts.",
  });

/**
 * The human account of a salvaged read (V2R-13): the engine's honest note
 * plus one line per repair kind, so the person sees exactly what byte-level
 * surgery stands between the file and this preview.
 */
const SALVAGE_REPAIR_PROSE: Readonly<Record<string, readonly [string, string]>> =
  Object.freeze({
    "restruck-note-ended": [
      "restruck note ended early",
      "restruck notes ended early",
    ],
    "orphan-off-dropped": [
      "orphan note-off dropped",
      "orphan note-offs dropped",
    ],
    "unterminated-note-closed": [
      "unterminated note closed at track end",
      "unterminated notes closed at track end",
    ],
  });

function salvageReportView(
  report: MidiImportPreview["salvage"],
): StudioMidiImportView["salvage"] {
  if (report === null) return null;
  return Object.freeze({
    note: report.note,
    repairLines: Object.freeze(
      report.repairs.map((repair) => {
        const prose = SALVAGE_REPAIR_PROSE[repair.kind];
        const noun =
          prose === undefined
            ? repair.kind
            : repair.count === 1
              ? prose[0]
              : prose[1];
        return `${String(repair.count)} ${noun}`;
      }),
    ),
  });
}

function salvageView(
  preview: MidiImportPreview,
): StudioMidiImportView["salvage"] {
  return salvageReportView(preview.salvage);
}

/**
 * The automatic result card: everything one press of Add will do, stated in
 * user language before it happens. Withheld settings say why they were kept.
 */
function midiImportAutoView(
  preview: MidiImportPreview,
): StudioMidiImportView["auto"] {
  const automation = preview.automation;
  if (automation === null) return null;
  const sectionCount = automation.sections.length;
  const headline = `${countLabel(automation.measureCount, "bar")} · ${countLabel(automation.writtenChordCount, "chord")}${
    sectionCount > 1 ? ` · ${countLabel(sectionCount, "section")}` : ""
  }`;
  const tempoBpm = Math.round(60_000_000 / automation.initialTempoMicroseconds);
  const cardLines: StudioFactView[] = [
    Object.freeze({
      id: "auto-tempo",
      label: "Tempo",
      value: `${String(tempoBpm)} BPM from the file`,
    }),
    Object.freeze({
      id: "auto-meter",
      label: "Meter",
      value: `${String(automation.initialMeter.numerator)}/${String(automation.initialMeter.beatUnit)} from the file`,
    }),
  ];
  const key = automation.key;
  const keySpelled = automation.keySpelled;
  if (key !== null && keySpelled !== null) {
    const accidental =
      keySpelled.alter === 0 ? "" : keySpelled.alter < 0 ? "b" : "#";
    cardLines.push(
      Object.freeze({
        id: "auto-key",
        label: "Key",
        value: `${keySpelled.step}${accidental} ${key.mode}, heard across the whole file`,
      }),
    );
  }
  const notes: string[] = [];
  if (automation.unwrittenSpanCount > 0) {
    notes.push(
      `${countLabel(automation.unwrittenSpanCount, "passage")} had no nameable chord and stays unwritten — the chord before each one keeps sounding. Advanced lists every one.`,
    );
  }
  if (automation.tempoChangeCount > 0) {
    notes.push(
      `The file changes tempo ${countLabel(automation.tempoChangeCount, "time")} after the start; only the first tempo is applied.`,
    );
  }
  if (automation.meterChangeCount > 0) {
    notes.push(
      `The file changes meter ${countLabel(automation.meterChangeCount, "time")} after the start; bars keep the file's own counts.`,
    );
  }
  if (automation.chunkTexts.length > 1) {
    notes.push(
      `This is a long chart, so it lands as ${countLabel(automation.chunkTexts.length, "edit")} plus its settings.`,
    );
  }
  return Object.freeze({
    headline,
    cardLines: Object.freeze(cardLines),
    grooveEvidence: automation.groove.evidence,
    notes: Object.freeze(notes),
    canCommit: true,
  });
}

/**
 * The MIDI import view. Nothing here decides anything: every sentence restates
 * what the decoder and the reverse-T1 resolver already found, including the
 * readings that were NOT chosen and the sonorities nothing could name.
 */
/** M1-OVR: the Advanced override controls' data, from plan + state. */
function midiImportOverridesView(
  preview: MidiImportPreview,
  overridesState: M1ImportOverrides,
  grooveOptions: readonly Readonly<{ id: string; label: string }>[],
): StudioMidiImportOverridesView | null {
  const automation = preview.automation;
  const decoded = preview.decoded;
  if (decoded === null) return null;
  /*
   * The controls must survive an automation refusal (for example when the
   * user excluded every contributing track): otherwise the exclusion that
   * caused the refusal could never be undone. Roles come from the plan
   * when one exists and read as unknown when it does not.
   */
  if (
    automation === null &&
    overridesState.excludedTrackIndices.length === 0 &&
    overridesState.grooveStyleId === null
  ) {
    return null;
  }
  const excluded = new Set(overridesState.excludedTrackIndices);
  return Object.freeze({
    tracks: Object.freeze(
      (automation === null
        ? decoded.model.tracks.map((_, index) => ({
            trackIndex: index,
            role: "—",
          }))
        : automation.classifications
      ).map((entry) =>
        Object.freeze({
          index: entry.trackIndex,
          label:
            decoded.model.tracks[entry.trackIndex]?.name ??
            `Track ${String(entry.trackIndex + 1)}`,
          role: entry.role,
          excluded: excluded.has(entry.trackIndex),
        }),
      ),
    ),
    spans: Object.freeze(
      (automation?.readings ?? [])
        .filter(
          (reading) => reading.written && reading.alternativeTexts.length > 1,
        )
        .slice(0, 64)
        .map((reading) => {
          const chosen = overridesState.alternativeChoices.find(
            (choice) =>
              choice.span.measureIndex === reading.span.measureIndex &&
              choice.span.startTick === reading.span.startTick,
          );
          return Object.freeze({
            measureIndex: reading.span.measureIndex,
            startTick: reading.span.startTick,
            label: `Bar ${String(reading.span.measureIndex + 1)}`,
            options: reading.alternativeTexts,
            chosenOrdinal: chosen?.alternativeOrdinal ?? 0,
          });
        }),
    ),
    grooveOptions: Object.freeze(grooveOptions.map((o) => Object.freeze({ ...o }))),
    grooveOverrideId: overridesState.grooveStyleId,
  });
}

function midiImportView(
  available: boolean,
  preview: MidiImportPreview | null,
  notice: string | null,
  auditioning: boolean,
  overridesState: M1ImportOverrides,
  grooveOptions: readonly Readonly<{ id: string; label: string }>[],
): StudioMidiImportView {
  if (!available) {
    return Object.freeze({
      available: false,
      statusLabel: "MIDI import is not available in this session.",
      refusal: null,
      salvage: null,
      salvageFailed: null,
      auto: null,
      summary: null,
      sonorities: Object.freeze([]),
      blockedReason: null,
      canCommit: false,
      traceJson: null,
      auditioning: false,
      overrides: null,
    });
  }
  if (preview === null) {
    return Object.freeze({
      available: true,
      statusLabel: notice ?? "No file chosen.",
      refusal: null,
      salvage: null,
      salvageFailed: null,
      auto: null,
      summary: null,
      sonorities: Object.freeze([]),
      blockedReason: null,
      canCommit: false,
      traceJson: null,
      auditioning: false,
      overrides: null,
    });
  }
  const statusLabel =
    notice ??
    `${preview.fileName} · ${countLabel(preview.byteLength, "byte")}`;
  if (preview.refusal !== null) {
    const refusal = preview.refusal;
    const where =
      refusal.byteOffset === null
        ? "Detected before any byte was read."
        : `Detected at byte ${String(refusal.byteOffset)}${
            refusal.trackIndex === null
              ? ""
              : `, while reading track ${String(refusal.trackIndex)}`
          }. Nothing was imported.`;
    return Object.freeze({
      available: true,
      statusLabel,
      refusal: Object.freeze({
        code: refusal.code,
        sentence:
          MIDI_IMPORT_REFUSAL_PROSE[refusal.code] ??
          "That file could not be read as a Standard MIDI File.",
        where,
      }),
      salvage: null,
      salvageFailed: salvageReportView(preview.salvageFailed),
      auto: null,
      summary: null,
      sonorities: Object.freeze([]),
      blockedReason: null,
      canCommit: false,
      traceJson: JSON.stringify(preview.trace, null, 1),
      auditioning,
      overrides: null,
    });
  }
  const decoded = preview.decoded;
  const plan = preview.plan;
  if (decoded === null) {
    return Object.freeze({
      available: true,
      statusLabel,
      refusal: null,
      salvage: salvageView(preview),
      salvageFailed: null,
      auto: null,
      summary: null,
      sonorities: Object.freeze([]),
      blockedReason: preview.blockedReason,
      canCommit: false,
      traceJson: JSON.stringify(preview.trace, null, 1),
      auditioning,
      overrides: null,
    });
  }
  const counters = decoded.model.counters;
  const facts: StudioFactView[] = [
    Object.freeze({
      id: "file",
      label: "File",
      value: `${preview.fileName} · ${countLabel(preview.byteLength, "byte")}`,
    }),
    Object.freeze({
      id: "envelope",
      label: "Envelope",
      value: `format ${String(decoded.model.header.format)} · ${String(decoded.model.header.division)} ticks per quarter · ${countLabel(decoded.model.tracks.length, "track")}`,
    }),
    Object.freeze({
      id: "notes",
      label: "Notes read",
      value: `${countLabel(counters.notesPaired, "note")} · ${countLabel(counters.eventsIgnored, "ignored event")} recorded`,
    }),
    Object.freeze({
      id: "sonorities",
      label: "Sonorities",
      value: countLabel(
        decoded.sonorities.length,
        "vertical sonority",
        "vertical sonorities",
      ),
    }),
  ];
  if (plan !== null) {
    facts.push(
      Object.freeze({
        id: "chart",
        label: "Would write",
        value: `${countLabel(plan.measureCount, "bar")} · ${countLabel(plan.writtenChordCount, "chord")}${
          plan.unnamedSonorityCount === 0
            ? ""
            : ` · ${countLabel(plan.unnamedSonorityCount, "sonority", "sonorities")} left unwritten`
        }`,
      }),
    );
  }
  const sonorities = preview.sonorities.map((entry, index) => {
    const sonority = entry.sonority;
    const quantized = `${String(sonority.quantizedTickNumerator)}/${String(sonority.quantizedTickDenominator)}`;
    const evidence =
      entry.outcome.kind === "alternatives"
        ? (() => {
            const best = entry.outcome.alternatives[0];
            return best === undefined
              ? `${countLabel(sonority.memberCount, "note")}, window ${String(sonority.windowTicks)} ticks`
              : `${best.templateId} · ${best.matchKind} · ${best.inversion} · ${countLabel(entry.outcome.totalMatches, "reading")} · ${countLabel(sonority.memberCount, "note")}, window ${String(sonority.windowTicks)} ticks`;
          })()
        : `no template matches · ${countLabel(sonority.memberCount, "note")}, window ${String(sonority.windowTicks)} ticks`;
    return Object.freeze({
      id: `midi-sonority-${String(index)}`,
      where: `Bar ${String(sonority.measureIndex + 1)} · tick ${String(sonority.anchorTick)} → ${quantized}`,
      symbolText: entry.symbolText,
      evidence,
      alternatives: Object.freeze(entry.alternativeTexts.slice(1)),
      customNote:
        entry.customPitchNames.length === 0
          ? null
          : `No chord in the grammar spells these pitches: ${entry.customPitchNames.join(" ")}. Nothing was invented and no chord was written here.`,
      written: entry.written,
    });
  });
  return Object.freeze({
    available: true,
    statusLabel,
    refusal: null,
    salvage: salvageView(preview),
    salvageFailed: null,
    auto: midiImportAutoView(preview),
    summary:
      plan === null
        ? null
        : Object.freeze({
            facts: Object.freeze(facts),
            durationLawNote: plan.usesExplicitDurations
              ? "Each bar's chords run from one quantized onset to the next. At least one bar carries exact beats measured in this file's own meter, so it refuses rather than rebalances if the chart's meter differs."
              : "Each bar's chords run from one quantized onset to the next, and every bar divides evenly, so no explicit beats are written and the bars fit this chart's meter.",
            /*
             * The PENDING text: what one press of Add actually writes. With
             * an automatic plan that is the automation's sectioned, possibly
             * overridden chart (M1-OVR live-updates it); only a preview with
             * no automatic plan falls back to the manual M0 text.
             */
            chartText: preview.automation?.chartText ?? plan.chartText,
          }),
    sonorities: Object.freeze(sonorities),
    blockedReason: preview.blockedReason,
    canCommit:
      preview.automation !== null ||
      (plan !== null && preview.blockedReason === null),
    traceJson: JSON.stringify(preview.trace, null, 1),
    auditioning,
    overrides: midiImportOverridesView(preview, overridesState, grooveOptions),
  });
}

function midiExportView(
  session: Readonly<{
    phase: "loading" | "preview" | "generating" | "ready" | "delivering" | "delivered";
    preview: StudioMidiExportPreview | null;
    preparationId: StudioMidiExportPreparationId | null;
    stale: boolean;
    refusal: Readonly<{ code: string; message: string }> | null;
    announcement: string | null;
  }> | null,
): StudioMidiExportView {
  if (session === null) {
    return Object.freeze({
      state: null,
      readiness: "ready",
      blockers: Object.freeze([]),
      realization: Object.freeze({
        storedManualCount: 0,
        storedFrozenCount: 0,
        generatedCount: 0,
        externalBassEventIds: Object.freeze([]),
      }),
      ppq: 960,
      trackCount: 2,
      tempoBpm: 0,
      meter: Object.freeze({ beatsPerBar: 4, beatUnit: 4 }),
      losses: Object.freeze([]),
      markerOmissions: Object.freeze([]),
      titleNotice: null,
      derivedTitle: "",
      artifact: null,
      stale: false,
      refusal: null,
      announcement: null,
    });
  }
  const preview = session.preview;
  return Object.freeze({
    state:
      session.phase === "loading"
        ? "preview"
        : (session.phase as StudioMidiExportView["state"]),
    readiness: preview?.readiness ?? "ready",
    blockers: preview?.blockers ?? Object.freeze([]),
    realization:
      preview?.realization ??
      Object.freeze({
        storedManualCount: 0,
        storedFrozenCount: 0,
        generatedCount: 0,
        externalBassEventIds: Object.freeze([]),
      }),
    ppq: preview?.ppq ?? 960,
    trackCount: preview?.trackCount ?? 2,
    tempoBpm: preview?.tempoBpm ?? 0,
    meter: preview?.meter ?? Object.freeze({ beatsPerBar: 4, beatUnit: 4 }),
    losses: preview?.losses ?? Object.freeze([]),
    markerOmissions: preview?.markerOmissions ?? Object.freeze([]),
    titleNotice: preview?.titleNotice ?? null,
    derivedTitle: preview?.derivedTitle ?? "",
    artifact: preview?.artifact ?? null,
    stale: session.stale,
    refusal: session.refusal,
    announcement: session.announcement,
  });
}

function viewFromSnapshot(
  snapshot: StudioViewModel,
  presentation: PresentationState,
  insertionPlan: StudioInsertionPlan,
  draftPreview: StudioDraftPreview,
  livePlayheadLabel: string | null,
  continuation: StudioContinuationView,
  detail: StudioDetailView | null,
  midiImport: StudioMidiImportView,
  midiExport: StudioMidiExportView,
  romanForEvent: (eventId: string) => string | null,
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
    clearArmed,
    tempoDraft,
    tempoInvalid,
    tempoFeedback,
    shareFeedback,
    shareCopied,
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
      revisionLabel: `Revision ${String(snapshot.revision)}`,
      titleFeedback,
      canCommitTitle: titleDraft !== snapshot.title,
      canResetTitleDraft:
        titleDraft !== snapshot.title || titleFeedback.kind === "refused",
      canUndo: snapshot.history.canUndo,
      canRedo: snapshot.history.canRedo,
      /* Offered only when there is something to clear. */
      canClearChart:
        snapshot.chordCount > 0 ||
        snapshot.sections.length > 1 ||
        (snapshot.sections[0]?.measures.length ?? 0) > 1,
      clearArmed,
      clearLabel: clearArmed ? "Really clear?" : "Clear",
      shareFeedback,
      shareCopied,
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
      keyLabel: snapshot.keyLabel,
      tempoLabel: `${String(snapshot.tempoBpm)} BPM`,
      /*
       * Untouched seed: the title is still the starter chart's and the
       * revision sits exactly at the seed's own command count, so nothing
       * the visitor did has entered the document yet.
       */
      isSeededDemo:
        snapshot.title === STARTER_CHART.title &&
        snapshot.revision === STARTER_CHART.undoDepth,
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
      layout: presentation.chartLayout,
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
                  /*
                   * jcpe-v2r-measure-ux-wk3w: any bar but the last may go —
                   * the controller command handles populated bars as one
                   * undoable step, and the corner trash's two-step arm is
                   * the accidental-press guard. The old empty-only gate was
                   * presentation conservatism, not a command law.
                   */
                  canDelete: snapshot.measureCount > 1,
                  deleteLabel: `Delete measure ${String(measure.ordinal)}`,
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
                        teachingNotes: teachingNotes(
                          event,
                          romanForEvent(event.id),
                        ),
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
      targetLabel: composedTargetLabel(snapshot),
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
    midiImport,
    midiExport,
    harmony: Object.freeze({
      selectedChordLabel: null,
      selected: selectedChordView(snapshot),
      detail,
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
      continuation:
        continuation.afterLabel === null
          ? null
          : Object.freeze({
              afterLabel: continuation.afterLabel,
              suggestions: Object.freeze(
                continuation.suggestions.map((suggestion) =>
                  Object.freeze({
                    id: suggestion.id,
                    symbolText: suggestion.symbolText,
                    categoryLabel:
                      SUGGESTION_CATEGORY_LABELS[suggestion.category] ??
                      suggestion.category,
                    sentence: suggestion.explanation.sentence,
                  }),
                ),
              ),
            }),
    }),
    transport: Object.freeze({
      // The live A0 transport status, not a hardcoded literal.
      audioState: snapshot.transport.status,
      audioStatusLabel: snapshot.transport.statusLabel,
      // jcpe-uslp: a carried failure code outranks the standing hint — the
      // detail line then says what failed and the next safe action. While
      // sound is running, "press Play" would be a lie, so the line states
      // the truth and the way out instead.
      audioStatusDetail:
        snapshot.transport.failureDetail ??
        (snapshot.transport.status === "playing"
          ? "Playing — press Stop to end."
          : snapshot.chordCount === 0
            ? "Write a chord, then press Play to hear it."
            : "Press Play to hear this chart."),
      failureCode: snapshot.transport.failureCode,
      tempoBpm: snapshot.tempoBpm,
      instrumentLabel: snapshot.instrumentLabel,
      positionLabel: musicalPositionLabel(playheadLabel),
      positionExactLabel: `${playheadLabel} beats`,
      currentChordLabel: pointer.chordLabel,
      progressPercent: pointer.progressPercent,
      /* V2R-8 footer settings: document/session truth from the snapshot. */
      grooveStyleId: snapshot.performance.styleId,
      grooveOptions: snapshot.performance.options,
      instrumentId: snapshot.instrumentId,
      instrumentOptions: instrumentOptions(),
      masterVolumePercent: Math.round(snapshot.masterVolume * 100),
      canStepPrevious: chordCount > 0,
      canStepNext: chordCount > 0,
      canTempoDown: snapshot.tempoBpm > MIN_STUDIO_TEMPO_BPM,
      canTempoUp: snapshot.tempoBpm < MAX_STUDIO_TEMPO_BPM,
    }),
    playback: Object.freeze({
      tempoBpm: snapshot.tempoBpm,
      tempoDraft,
      tempoInvalid,
      tempoFeedback,
      groove: Object.freeze({
        activeStyleId: snapshot.performance.styleId,
        options: snapshot.performance.options,
      }),
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

export function App({ snapshot, actions, startupNotice }: AppProps) {
  const [titleDraft, setTitleDraft] = useState(snapshot.title);
  const previousCommittedTitle = useRef(snapshot.title);
  const audioGestureSequence = useRef(0);
  const nextAudioGesture = useCallback(
    (kind: StudioAudioGesture["kind"]): StudioAudioGesture => {
      audioGestureSequence.current += STUDIO_AUDIO_GESTURE_SEQUENCE_STRIDE;
      return Object.freeze({
        kind,
        trusted: true,
        sequence: audioGestureSequence.current,
      });
    },
    [],
  );
  const [activeSheet, setActiveSheet] = useState<StudioSheetId | null>(null);
  const [uiRefusal, setUiRefusal] = useState<
    StudioShellView["layout"]["uiRefusal"]
  >(
    startupNotice === null || startupNotice === undefined
      ? null
      : Object.freeze({
          heading: "Share link not opened",
          message: startupNotice,
          recoveryAction:
            "The studio opened with the starter chart instead; ask for a fresh link if the chart matters.",
        }),
  );
  /*
   * The MIDI import preview is ephemeral session state, exactly like the
   * palette's selected root: reading a file changes no document, and the
   * decode result exists only until it is committed or discarded. The
   * decoder itself never enters this layer — `actions.readMidiFile` is the
   * application service the composition root wired.
   */
  const [midiPreview, setMidiPreview] = useState<MidiImportPreview | null>(
    null,
  );
  /*
   * The U7 MIDI export workflow session. The pinned preview model is the
   * only thing the dialog renders; every phase transition re-checks the
   * binding through the service — never a live field at render time.
   */
  const [midiExportSession, setMidiExportSession] = useState<Readonly<{
    phase: "loading" | "preview" | "generating" | "ready" | "delivering" | "delivered";
    preview: StudioMidiExportPreview | null;
    preparationId: StudioMidiExportPreparationId | null;
    stale: boolean;
    refusal: Readonly<{ code: string; message: string }> | null;
    announcement: string | null;
  }> | null>(null);
  const [midiImportNotice, setMidiImportNotice] = useState<string | null>(null);
  /*
   * jcpe-qyyn audition: presentation-only. The timers fire the same
   * click-preview action a pointer press fires; cancelling clears them
   * before the next step sounds. Any commit, discard, or new file cancels.
   */
  const [midiAuditioning, setMidiAuditioning] = useState(false);
  /* M1-OVR: the absolute override set for the pending preview. */
  const [midiOverrides, setMidiOverrides] = useState<M1ImportOverrides>({
    excludedTrackIndices: Object.freeze([]),
    alternativeChoices: Object.freeze([]),
    grooveStyleId: null,
  });
  const clearMidiOverrides = (): void => {
    setMidiOverrides({
      excludedTrackIndices: Object.freeze([]),
      alternativeChoices: Object.freeze([]),
      grooveStyleId: null,
    });
  };
  const midiAuditionTimers = useRef<number[]>([]);
  const cancelMidiAudition = (): void => {
    for (const timer of midiAuditionTimers.current) {
      window.clearTimeout(timer);
    }
    midiAuditionTimers.current = [];
    setMidiAuditioning(false);
  };
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

  /*
   * U7 workflow handlers. Every phase change is a service call whose result
   * replaces the session atomically; the dialog never re-reads mid-flight.
   */
  const openMidiExport = (): void => {
    if (!actions.midiExportAvailable) return;
    /* The frozen U7 accessibility matrix: sheet below the U0 compact
     * breakpoint (640px), modal dialog at and above it. */
    const compact =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(max-width: 639px)").matches;
    if (compact) setActiveSheet("export");
    setMidiExportSession({
      phase: "loading",
      preview: null,
      preparationId: null,
      stale: false,
      refusal: null,
      announcement: "Preparing the export preview…",
    });
    void actions.midiExportOpenPreview().then((result) => {
      if (!result.ok) {
        setMidiExportSession(null);
        setUiRefusal(
          Object.freeze({
            heading: "Export preview failed",
            message: result.refusal.message,
            recoveryAction: "Nothing was downloaded and the chart is unchanged.",
          }),
        );
        return;
      }
      setMidiExportSession({
        phase: "preview",
        preview: result.preview,
        preparationId: result.preparationId,
        stale: false,
        refusal: null,
        announcement:
          result.preview.readiness === "ready"
            ? `Preview ready: ${result.preview.artifact?.filename ?? ""}, ${String(
                result.preview.artifact?.byteLength ?? 0,
              )} bytes.`
            : "This chart cannot be exported yet; every blocker is listed.",
      });
    });
  };
  const generateMidiExport = (): void => {
    setMidiExportSession((session) => {
      if (session === null || session.preparationId === null) return session;
      const outcome = actions.midiExportGenerate(session.preparationId);
      if (outcome.outcome === "generated") {
        return Object.freeze({
          ...session,
          phase: "ready" as const,
          announcement: "Ready to download.",
        });
      }
      if (outcome.outcome === "stale") {
        return Object.freeze({
          ...session,
          phase: "preview" as const,
          stale: true,
          announcement:
            "The chart changed since this preview was made. Preview again to export the current chart.",
        });
      }
      return Object.freeze({
        ...session,
        refusal: outcome.refusal,
        announcement: outcome.refusal.message,
      });
    });
  };
  const downloadMidiExport = (): void => {
    const session = midiExportSession;
    if (session === null || session.preparationId === null) return;
    const preparationId = session.preparationId;
    setMidiExportSession(
      Object.freeze({ ...session, phase: "delivering" as const }),
    );
    void actions.midiExportDownload(preparationId).then((result) => {
      setMidiExportSession((current) => {
        if (current === null) return null;
        if (result.outcome === "handed-off") {
          return Object.freeze({
            ...current,
            phase: "delivered" as const,
            preparationId: null,
            announcement: `${current.preview?.artifact?.filename ?? "The file"} was handed to the browser's downloads.`,
          });
        }
        if (result.outcome === "failed") {
          return Object.freeze({
            ...current,
            phase: "ready" as const,
            announcement:
              "The browser did not take the file. The prepared file is still here — try the download again.",
          });
        }
        if (result.outcome === "stale") {
          return Object.freeze({
            ...current,
            phase: "preview" as const,
            stale: true,
            announcement:
              "The chart changed since this preview was made. Preview again to export the current chart.",
          });
        }
        return Object.freeze({
          ...current,
          refusal: result.refusal,
          announcement: result.refusal.message,
        });
      });
    });
  };
  const closeMidiExport = (): void => {
    const session = midiExportSession;
    if (session !== null) {
      actions.midiExportAbandon(session.preparationId);
    }
    setMidiExportSession(null);
    setActiveSheet((current) => (current === "export" ? null : current));
  };
  const repreviewMidiExport = (): void => {
    const session = midiExportSession;
    if (session !== null) {
      actions.midiExportAbandon(session.preparationId);
    }
    openMidiExport();
  };
  const focusMidiExportBlocker = (eventId: string): void => {
    setMidiExportSession(null);
    setActiveSheet((current) => (current === "export" ? null : current));
    actions.selectEvent(eventId);
  };

  /*
   * The Clear confirmation is an owned two-step control, not a native
   * `confirm()` dialog: the first press arms the button, the second performs
   * the undoable clear, and a few seconds of inaction disarm it again. The
   * armed state is presentation-only and never reaches the controller.
   */
  const [clearArmed, setClearArmed] = useState(false);
  const clearArmTimer = useRef<number | null>(null);

  /*
   * The tempo field mirrors the title editor: a local draft, an explicit
   * Apply, and refusal text that names the accepted range instead of
   * silently replacing the number a musician chose.
   */
  const [tempoDraft, setTempoDraft] = useState(String(snapshot.tempoBpm));
  const [tempoInvalid, setTempoInvalid] = useState(false);
  const [tempoFeedback, setTempoFeedback] = useState<string | null>(null);
  const [shareFeedback, setShareFeedback] = useState<StudioShareFeedback | null>(
    null,
  );
  /*
   * "Copied ✓" on the button itself for two seconds after a clipboard
   * success — a deterministic timeout, presentation-only, disarmed by any
   * later outcome that did not reach the clipboard.
   */
  const [shareCopied, setShareCopied] = useState(false);
  const shareCopiedTimer = useRef<number | null>(null);
  const recordShareOutcome = (
    kind: StudioShareFeedback["kind"],
    message: string,
  ): void => {
    setShareFeedback(Object.freeze({ kind, message }));
    if (shareCopiedTimer.current !== null) {
      window.clearTimeout(shareCopiedTimer.current);
      shareCopiedTimer.current = null;
    }
    if (kind !== "copied") {
      setShareCopied(false);
      return;
    }
    setShareCopied(true);
    shareCopiedTimer.current = window.setTimeout(() => {
      shareCopiedTimer.current = null;
      setShareCopied(false);
    }, 2000);
  };
  const previousCommittedTempo = useRef(snapshot.tempoBpm);
  useEffect(() => {
    if (previousCommittedTempo.current === snapshot.tempoBpm) return;
    previousCommittedTempo.current = snapshot.tempoBpm;
    setTempoDraft(String(snapshot.tempoBpm));
    setTempoInvalid(false);
  }, [snapshot.tempoBpm]);
  const disarmClear = (): void => {
    if (clearArmTimer.current !== null) {
      window.clearTimeout(clearArmTimer.current);
      clearArmTimer.current = null;
    }
    setClearArmed(false);
  };
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
  /* jcpe-v2r-live-mix-btb4: repaint driver for the session mute button. */
  const [, setMuteTick] = useState(0);
  /* V2R-4: sheet/grid layout, presentation-only like viewMode. */
  const [chartLayout, setChartLayout] = useState<StudioChartLayout>("sheet");
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
    return endOfChartTarget();
  };

  /**
   * Where chords go when nobody said otherwise: the end of the chart.
   *
   * Adding to a progression you already have loaded is the common case, and
   * it used to be the awkward one -- with no target the draft had nowhere to
   * land, and with a stale one it aimed at a bar too full to hold it, so
   * Insert sat disabled for a reason the surface never explained. Appending
   * at the section end is the statement the plan vocabulary calls
   * `completes-measures`, which is committable whenever the draft is whole
   * bars.
   */
  function endOfChartTarget(): StudioBoundaryInput | null {
    const sections = snapshot.sections;
    const last = sections[sections.length - 1];
    if (last === undefined) return null;
    return { kind: "section-end", sectionId: last.id };
  }

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
        "Split this bar at the next chord",
        "Shorten the duration",
        "Cancel",
      ]),
      "u1.insertion_plan_overfills_destination": Object.freeze([
        "Choose an empty measure or a structural boundary",
        "Shorten the draft",
        "Cancel",
      ]),
    });

  /*
   * Ephemeral loop intents (whole-chart toggle, V2R-18 section arm) change
   * controller-side session state without touching the document, and a
   * successful recordEditResult sets already-null state — which Preact
   * skips, leaving aria-pressed stale until an unrelated render. Bumping
   * this counter after every loop-intent dispatch keeps the pressed truth
   * current without inventing document state.
   */
  const [, setLoopIntentVersion] = useState(0);
  const bumpLoopIntent = (): void => {
    setLoopIntentVersion((version) => version + 1);
  };

  /*
   * Stable identity matters: this function sits in the dependency list of
   * the global keydown effect, so a per-render identity re-subscribed the
   * window listener on every render — including every live playhead tick
   * while playing (2026-09-03 audit). Its body touches only stable state
   * setters and module constants.
   */
  const recordEditResult = useCallback((
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
  }, []);

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

  /*
   * Display-only continuation options. The controller memoizes on the frozen
   * document object, so calling per render is a WeakMap hit until an edit
   * publishes a new document.
   */
  const continuation = actions.readContinuationSuggestions();
  const detailView = detailViewFrom(actions.readChordDetail, snapshot);

  /**
   * The one insertion path, shared by typing, the demo chips, the library
   * rows, and the Lens's Add buttons: stage the draft (with the derived-target
   * retarget law), then apply the whole preview atomically. A second path
   * would eventually disagree with this one about targets or refusals.
   */
  const stageQuickEntryDraft = (value: string): void => {
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
      (target.kind === "measure-start" ||
        target.kind === "measure-end" ||
        target.kind === "before-event" ||
        target.kind === "after-event") &&
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
        /*
         * A consumed draft's leftover aim can be a measure OR an event
         * boundary — apply re-aims "after what you just inserted", which
         * is an after-event target that can never accept a whole-bar
         * draft. Either way, the owning section is the reviewed
         * structural boundary to fall back to.
         */
        const targetEventId = "eventId" in target ? target.eventId : null;
        const targetMeasureId =
          "measureId" in target ? target.measureId : null;
        const owner = snapshot.sections.find((section) =>
          section.measures.some((measure) =>
            targetEventId !== null
              ? measure.events.some((event) => event.id === targetEventId)
              : measure.id === targetMeasureId,
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
  };

  const applyQuickEntryInsert = (): void => {
    const result = actions.applyQuickEntryPreview();
    if (result.ok) quickEntryTargetIsExplicit.current = false;
    setQuickEntryRefusal(
      result.ok
        ? null
        : `${result.refusal.message} ${result.refusal.recoveryAction}`,
    );
  };

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
    chartLayout,
    clearArmed,
    tempoDraft,
    tempoInvalid,
    tempoFeedback,
    shareFeedback,
    shareCopied,
  }, insertionPlan, draftPreview, livePlayheadLabel, continuation, detailView, midiImportView(
    actions.midiImportAvailable,
    midiPreview,
    midiImportNotice,
    midiAuditioning,
    midiOverrides,
    snapshot.performance.options,
  ), midiExportView(midiExportSession), (eventId) => actions.readEventAnalysis(eventId)?.roman ?? null);

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

  /*
   * Space is the transport key every DAW and score reader shares. It must
   * never take the key away from a text field, nor from an already-focused
   * button or link, where the browser's own activation is the right answer
   * and stealing it would fire two things at once. A real keydown is a user
   * gesture, so the browser will open the audio graph for it.
   */
  const transportStatus = snapshot.transport.status;
  const chordCountForKeys = snapshot.chordCount;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== " " && event.code !== "Space") return;
      if (event.defaultPrevented) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        if (target.isContentEditable) return;
        if (target.closest('button, a[href], [role="button"]')) return;
      }
      event.preventDefault();
      if (event.shiftKey) {
        /*
         * Shift+Space plays the selected section (REBUILD_PLAN 6.8) through
         * the V2R-18 section loop: arm the section that owns the selection
         * (or the first section), then start playback if it is not already
         * running. An armed section presses through to a live run via the
         * same serialized re-bind the Loop buttons use.
         */
        if (chordCountForKeys === 0) return;
        const snapshotNow = actions.getSnapshot();
        const selectedEventId =
          snapshotNow.bookmarks.selectedEventIds[0] ?? null;
        let selectedSectionId: string | null = null;
        if (selectedEventId !== null) {
          outer: for (const section of snapshotNow.sections) {
            for (const measure of section.measures) {
              for (const chordEvent of measure.events) {
                if (chordEvent.id === selectedEventId) {
                  selectedSectionId = chordEvent.sectionId;
                  break outer;
                }
              }
            }
          }
        }
        const sectionId =
          selectedSectionId ?? snapshotNow.sections[0]?.id ?? null;
        if (sectionId === null) return;
        const loopNow = actions.readLoopView();
        if (loopNow.sectionId !== sectionId) {
          recordEditResult(actions.armSectionLoop(sectionId), {
            kind: "delete",
          });
          bumpLoopIntent();
        }
        if (transportStatus !== "playing") {
          recordEditResult(
            actions.playProgression(nextAudioGesture("trusted-keyboard")),
            { kind: "delete" },
          );
        }
        return;
      }
      if (transportStatus === "playing") {
        recordEditResult(actions.pauseProgression(), { kind: "delete" });
        return;
      }
      if (chordCountForKeys === 0) return;
      recordEditResult(
        actions.playProgression(nextAudioGesture("trusted-keyboard")),
        { kind: "delete" },
      );
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [
    transportStatus,
    chordCountForKeys,
    actions,
    nextAudioGesture,
    recordEditResult,
  ]);

  /*
   * A highlight nobody can see is not a highlight. On a phone the chart is
   * taller than the viewport, so the sounding card marched off screen while
   * the transport still said "Playing" (measured: every sample off screen,
   * the card walking from y=820 to y=1552 in an 844px viewport). Follow it
   * with the smallest scroll that works -- "nearest" is a no-op while the
   * card is already visible, so a chart that fits never moves at all.
   */
  const followedChordId = useRef<string | null>(null);
  useEffect(() => {
    const chordId = analyzerPointer.chordId;
    if (chordId === null) {
      followedChordId.current = null;
      return;
    }
    if (followedChordId.current === chordId) return;
    followedChordId.current = chordId;
    const card = document.querySelector(
      `.studio-chord-card[data-chord-id="${CSS.escape(chordId)}"]`,
    );
    if (!(card instanceof HTMLElement)) return;
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    card.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }, [analyzerPointer.chordId]);

  return (
    <>
    <StudioShell
      midiExportAvailable={actions.midiExportAvailable}
      view={view}
      annotations={{
        /* Display-only ports; a null result renders as absence. */
        phrasesForSection: (sectionId) =>
          actions.readSectionPhrases(sectionId)?.phrases ?? [],
        romanForEvent: (eventId) =>
          actions.readEventAnalysis(eventId)?.roman ?? null,
        /* V2R-4 grid-card lines. The function line keeps the first clause
           ("Dominant", "Predominant") — the full sentence lives in the
           detail panel; the notes line is the spelled tones verbatim. */
        functionForEvent: (eventId) => {
          const analysis = actions.readEventAnalysis(eventId);
          if (analysis === null || analysis.outcome !== "analyzed") return null;
          return analysis.functionSentence.split("—")[0]?.trim() ?? null;
        },
        notesForEvent: (eventId) => {
          const tones = actions.readChordDetail(eventId)?.tones ?? [];
          if (tones.length === 0) return null;
          return tones.map((tone) => tone.name).join("  ");
        },
      }}
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
            actions.playProgression(
              nextAudioGesture(
                source === "pointer"
                  ? "trusted-pointer"
                  : "trusted-keyboard",
              ),
            ),
            { kind: "delete" },
          );
        },
        onStop: () => {
          recordEditResult(actions.stopProgression(), { kind: "delete" });
        },
        onStepChord: (direction) => {
          /* Chart order from the live snapshot; selection previews (jcpe-gnyy). */
          const live = actions.getSnapshot();
          const ordered = live.sections.flatMap((section) =>
            section.measures.flatMap((measure) =>
              measure.events.map((event) => event.id),
            ),
          );
          if (ordered.length === 0) return;
          const current =
            live.bookmarks.selectionFocusEventId ??
            live.bookmarks.selectedEventIds[0] ??
            null;
          const at = current === null ? -1 : ordered.indexOf(current);
          const nextIndex =
            direction === "next"
              ? Math.min(ordered.length - 1, at + 1)
              : Math.max(0, at < 0 ? 0 : at - 1);
          const target = ordered[nextIndex];
          if (target === undefined || target === current) return;
          setRovingFocusId(target);
          recordEditResult(actions.selectEvent(target));
        },
        onTempoStep: (deltaBpm) => {
          const live = actions.getSnapshot();
          const next = Math.min(
            MAX_STUDIO_TEMPO_BPM,
            Math.max(MIN_STUDIO_TEMPO_BPM, live.tempoBpm + deltaBpm),
          );
          if (next === live.tempoBpm) return;
          const result = actions.setTempo(next);
          recordEditResult(result);
          if (result.ok) {
            setTempoDraft(String(next));
            setTempoInvalid(false);
            setTempoFeedback(null);
          }
        },
        onGrooveChange: (styleId) => {
          recordEditResult(actions.setPerformanceStyle(styleId));
        },
        onInstrumentChange: (instrumentId) => {
          recordEditResult(actions.setInstrument(instrumentId));
        },
        onVolumeCommit: (volume) => {
          recordEditResult(actions.setMasterVolume(volume));
        },
        readMeterFrame: actions.readTransportAnalysisFrame,
        onSeekFraction: (fraction) => {
          /*
           * jcpe-v2r-loop-seek-ukk6: outside playing/paused the scrub surface
           * never dispatches, so a refusal here is a race (playback ended
           * mid-click) and the honest response is the refusal notice.
           */
          recordEditResult(actions.seekToFraction(fraction));
        },
        onLoopToggle: () => {
          recordEditResult(actions.toggleLoop());
          bumpLoopIntent();
        },
        onSectionLoopToggle: (sectionId) => {
          /* V2R-18: a refusal (empty or vanished section) surfaces as the
           * standard notice; the armed state only ever reflects success. */
          recordEditResult(actions.armSectionLoop(sectionId));
          bumpLoopIntent();
        },
        readLoopState: actions.readLoopView,
        readLoopRegion: actions.readLoopRegionView,
        onVolumePreview: (volume) => {
          /* Display-only ride; a refusal (out-of-range) is impossible from
           * the clamped range input, so the result is deliberately unread. */
          void actions.previewMasterVolume(volume);
        },
        onMuteToggle: () => {
          /* Session-ephemeral: the controller result reuses the unchanged
           * snapshot, so the subscription alone never repaints — the tick
           * forces the re-render that re-reads readMixView's truth. */
          void actions.toggleMute();
          setMuteTick((tick) => tick + 1);
        },
        readMixState: actions.readMixView,
      }}
      callbacks={{
        onCopyShareLink: () => {
          /*
           * The share link is built from the committed chart and written to
           * the clipboard and the address bar. Nothing is requested from
           * anywhere; a chart the share grammar cannot carry refuses with
           * the exact reason instead of copying a lossy link.
           */
          const payload = buildSharePayload(snapshot);
          if (!payload.ok) {
            recordShareOutcome("refused", payload.message);
            return;
          }
          const fragment = encodeShareFragment(payload.value);
          if (!fragment.ok) {
            recordShareOutcome("refused", fragment.message);
            return;
          }
          const base = window.location.href.split("#")[0] ?? "";
          const url = `${base}${fragment.value}`;
          window.history.replaceState(null, "", fragment.value);
          const clipboard = navigator.clipboard as
            | Clipboard
            | undefined;
          if (clipboard === undefined) {
            recordShareOutcome(
              "manual",
              "Share link placed in the address bar; copy it from there.",
            );
            return;
          }
          clipboard.writeText(url).then(
            () => {
              recordShareOutcome(
                "copied",
                "Share link copied to the clipboard.",
              );
            },
            () => {
              recordShareOutcome(
                "manual",
                "Share link placed in the address bar; copy it from there.",
              );
            },
          );
        },
        onTempoDraftChange: (value) => {
          setTempoDraft(value);
          setTempoInvalid(false);
          setTempoFeedback(null);
        },
        onGrooveStyleChange: (styleId) => {
          /*
           * A groove change never reaches the sounding run — the transport
           * plays the immutable plan it was bound to — so during a live run
           * the line must say the deferral out loud instead of letting the
           * click appear to do nothing (jcpe-my0j).
           */
          const runWasLive = transportRunIsLive(
            actions.getSnapshot().transport.status,
          );
          const result = actions.setPerformanceStyle(styleId);
          /*
           * The picker only offers declared styles, so a refusal here means
           * the surface and the controller disagree — worth a visible
           * sentence in the Playback group's status line, never silence.
           */
          setTempoFeedback(
            result.ok
              ? runWasLive
                ? "The groove changes right away, from the next chord."
                : null
              : `${result.refusal.message} ${result.refusal.recoveryAction}`,
          );
        },
        onTempoCommit: () => {
          const trimmed = tempoDraft.trim();
          const bpm = /^[0-9]+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
          /*
           * Read the LIVE transport before committing: the sounding run keeps
           * the plan it was bound to, so the committed tempo cannot reach it.
           * A live run is therefore stopped explicitly — the chart is the
           * source of truth, and a run sounding a superseded tempo under a
           * chart that states the new one is exactly the lie jcpe-my0j
           * documents — and the line says so at the moment it happens.
           */
          const runWasLive = transportRunIsLive(
            actions.getSnapshot().transport.status,
          );
          const result = actions.setTempo(bpm);
          if (result.ok) {
            setTempoInvalid(false);
            if (runWasLive) {
              recordEditResult(actions.stopProgression(), { kind: "delete" });
              setTempoFeedback("Tempo applied — playback stopped.");
            } else {
              setTempoFeedback("Tempo committed as an undoable change.");
            }
            return;
          }
          setTempoInvalid(true);
          /*
           * The out-of-range message and its recovery sentence both name the
           * accepted range; concatenated they said "between 20 and 300"
           * twice in one line. The message alone already states the range
           * and the fix, so the recovery sentence is dropped here only.
           */
          setTempoFeedback(
            result.refusal.code === "u1.tempo_out_of_range"
              ? result.refusal.message
              : `${result.refusal.message} ${result.refusal.recoveryAction}`,
          );
        },
        onLoadLibraryEntry: (entryId) => {
          /*
           * Loading a library entry is ONE document gesture — replace the
           * chart, retitle it, set its groove and its tempo, and STOP a
           * live run explicitly — owned by the application layer
           * (`loadProgressionLibraryEntry`) so a test can drive the real
           * path. The first wiring chained UI callbacks instead, and every
           * link failed the owner: the chart APPENDED after whatever was
           * already written, the title never changed, and the tempo commit
           * read a stale render's draft. Without the explicit stop the old
           * plan kept sounding under the new chart's playhead while the
           * status said "Playing", and a later Stop stuck at "Stopping
           * playback" forever (jcpe-my0j). This handler only renders the
           * gesture's results; no component state feeds it.
           */
          const result = actions.loadLibraryEntry(entryId);
          if (result.entry === null) return;
          if (result.cleared !== null) {
            recordEditResult(result.cleared, { kind: "delete" });
          }
          if (result.stopped !== null) {
            recordEditResult(result.stopped, { kind: "delete" });
          }
          const chartResult =
            result.staged !== null && !result.staged.ok
              ? result.staged
              : result.inserted;
          if (chartResult !== null) {
            if (chartResult.ok) quickEntryTargetIsExplicit.current = false;
            setQuickEntryRefusal(
              chartResult.ok
                ? null
                : `${chartResult.refusal.message} ${chartResult.refusal.recoveryAction}`,
            );
          }
          if (result.titled?.ok === true) setTitleDraft(result.entry.title);
          let tempoNote: string | null =
            result.groove === null || result.groove.ok
              ? null
              : `${result.groove.refusal.message} ${result.groove.refusal.recoveryAction}`;
          if (result.tempo !== null && !result.tempo.ok) {
            tempoNote = `${result.tempo.refusal.message} ${result.tempo.refusal.recoveryAction}`;
          }
          setTempoFeedback(tempoNote);
        },
        onQuickEntryDraftChange: stageQuickEntryDraft,
        onQuickEntryInsert: applyQuickEntryInsert,
        onAddSuggestedChord: (symbolText) => {
          // A suggestion is one bar of one chord through the same staged
          // path a demo chip travels; the pristine fill and derived-target
          // laws apply unchanged, and a refusal lands in the same line.
          stageQuickEntryDraft(`| ${symbolText} |`);
          applyQuickEntryInsert();
        },
        onPreviewPitch: (midiPitch) => {
          /*
           * The detail keyboard/chips only ever offer in-chord pitches
           * (jcpe-v2r-detail-yimm); the pointer event carrying us here is
           * the trusted gesture the first preview needs. A refusal (no
           * audio port, out-of-range pitch) is silence, deliberately —
           * an exploration hover owes no error prose.
           */
          actions.previewPitch(
            midiPitch,
            nextAudioGesture("trusted-pointer"),
          );
        },
        /*
         * A local file, read on a user gesture with FileReader. The runtime
         * boundary forbids every network capability, so there is no other way
         * a file can arrive and no other way it should: nothing is uploaded,
         * nothing is fetched, and the bytes go straight to the application
         * service that owns the decoder.
         */
        onMidiImportChooseFile: (file) => {
          cancelMidiAudition();
          clearMidiOverrides();
          setMidiPreview(null);
          setMidiImportNotice(`Reading ${file.name}…`);
          const reader = new FileReader();
          reader.onerror = () => {
            setMidiImportNotice(
              `${file.name} could not be read from this device.`,
            );
          };
          reader.onload = () => {
            const buffer = reader.result;
            if (!(buffer instanceof ArrayBuffer)) {
              setMidiImportNotice(
                `${file.name} could not be read from this device.`,
              );
              return;
            }
            void actions
              .readMidiFile(file.name, new Uint8Array(buffer))
              .then((preview) => {
                setMidiImportNotice(null);
                setMidiPreview(preview);
              })
              .catch(() => {
                setMidiImportNotice(
                  `${file.name} could not be decoded on this device.`,
                );
              });
          };
          reader.readAsArrayBuffer(file);
        },
        onMidiImportCommit: () => {
          if (midiPreview === null) return;
          cancelMidiAudition();
          /*
           * The automatic envelope is the default: chords, settings, and the
           * matched groove in one gesture with a stated undo count. The M0
           * single-insert path remains for previews with no automatic plan.
           */
          if (midiPreview.automation !== null) {
            const auto = actions.commitMidiImportAutomatic(midiPreview);
            if (auto === null) return;
            if (auto.committed) {
              quickEntryTargetIsExplicit.current = false;
              setMidiPreview(null);
              setMidiImportNotice(
                auto.undoCount === 1
                  ? `${midiPreview.fileName} was added as one edit. Undo returns the chart.`
                  : `${midiPreview.fileName} was added as ${countLabel(auto.undoCount, "edit")}. Press Undo ${String(auto.undoCount)} times to return the chart.`,
              );
              return;
            }
            const failed = auto.steps[auto.steps.length - 1];
            setMidiImportNotice(
              auto.reason === "rolled-back"
                ? `That import was not added${failed?.reason === null || failed === undefined ? "" : `: ${failed.reason}`} Everything it had changed was undone.`
                : "That import was not added.",
            );
            return;
          }
          const result = actions.commitMidiImport(midiPreview);
          if (result === null) return;
          if (result.committed) {
            quickEntryTargetIsExplicit.current = false;
            setMidiPreview(null);
            setMidiImportNotice(
              `${midiPreview.fileName} was added as one edit. Undo returns the chart.`,
            );
            return;
          }
          const refused =
            result.inserted !== null && !result.inserted.ok
              ? result.inserted
              : result.staged !== null && !result.staged.ok
                ? result.staged
                : null;
          setMidiImportNotice(
            refused === null
              ? "That import was not added."
              : `${refused.refusal.message} ${refused.refusal.recoveryAction}`,
          );
        },
        onMidiImportDiscard: () => {
          cancelMidiAudition();
          clearMidiOverrides();
          setMidiPreview(null);
          setMidiImportNotice(null);
        },
        onMidiImportOverridesChange: (next) => {
          if (midiPreview === null) return;
          cancelMidiAudition();
          const absolute: M1ImportOverrides = Object.freeze({
            excludedTrackIndices: Object.freeze([...next.excludedTrackIndices]),
            alternativeChoices: Object.freeze(
              next.alternativeChoices.map((choice) =>
                Object.freeze({
                  span: Object.freeze({ ...choice.span }),
                  alternativeOrdinal: choice.alternativeOrdinal,
                }),
              ),
            ),
            grooveStyleId:
              next.grooveStyleId !== null &&
              GROOVE_STYLE_IDS.some((id) => id === next.grooveStyleId)
                ? (next.grooveStyleId as (typeof GROOVE_STYLE_IDS)[number])
                : null,
          });
          const replanned = actions.replanMidiImport(midiPreview, absolute);
          if (replanned === null) return;
          setMidiOverrides(absolute);
          setMidiPreview(replanned);
        },
        onOpenMidiExport: openMidiExport,
        onMidiExportGenerate: generateMidiExport,
        onMidiExportDownload: downloadMidiExport,
        onMidiExportClose: closeMidiExport,
        onMidiExportRepreview: repreviewMidiExport,
        onMidiExportBlockedEventActivate: focusMidiExportBlocker,
        onMidiImportAudition: () => {
          if (midiAuditioning) {
            cancelMidiAudition();
            return;
          }
          if (midiPreview === null) return;
          const steps = auditionMidiImportPreview(midiPreview);
          if (steps.length === 0) return;
          const gesture = nextAudioGesture("trusted-pointer");
          for (const step of steps) {
            midiAuditionTimers.current.push(
              window.setTimeout(() => {
                actions.previewPitches(step.midiPitches, gesture);
              }, step.atMs),
            );
          }
          const last = steps[steps.length - 1];
          midiAuditionTimers.current.push(
            window.setTimeout(
              () => {
                midiAuditionTimers.current = [];
                setMidiAuditioning(false);
              },
              (last?.atMs ?? 0) + 1_400,
            ),
          );
          setMidiAuditioning(true);
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
          /*
           * jcpe-gnyy: a plain selection also sounds the chord. The card
           * activation is a real trusted gesture, which is exactly what the
           * first preview needs to open the audio graph.
           */
          if (!extend) {
            actions.previewChord(
              chordId,
              nextAudioGesture("trusted-pointer"),
            );
          }
        },
        onRovingFocusChange: (chordId) => {
          setRovingFocusId(chordId);
        },
        onDeleteSelection: () => {
          /*
           * jcpe-yvni: a routine delete never interrogates the user. The
           * gesture auto-declares any bar it leaves short with the reviewed
           * constant; the card menu's "Declare this measure's completion"
           * remains the deliberate path to a custom reason.
           */
          recordEditResult(deleteSelectionAutoDeclaring(actions), {
            kind: "delete",
          });
        },
        onDuplicateSelection: () => {
          /*
           * jcpe-yvni: duplicate lands by default. When the copies overfill
           * the focused bar, the gesture performs the reviewed split-here
           * resolution — a fresh bar right after it — instead of refusing.
           */
          recordEditResult(duplicateSelectionAutoResolving(actions), {
            kind: "duplicate",
          });
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
        /*
         * jcpe-v2r-measure-ux-wk3w directive 4: the dragged grip is a
         * routine edit, so a bar it leaves short states its reviewed reason
         * rather than interrupting the gesture with the dialog — the
         * delete/duplicate auto-declaring precedent (jcpe-yvni). The typed
         * duration editor above keeps the deliberate dialog path.
         */
        onResizeDuration: (chordId, beatText) => {
          recordEditResult(
            actions.setEventDurationText(
              chordId,
              beatText,
              RESIZE_AUTO_COMPLETION_REASON,
            ),
            { beatText, chordId, kind: "duration" },
          );
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
            case "split-at-bar":
              // One split can leave two short bars; the one typed reason
              // declares the split itself, so both sides carry it.
              recordEditResult(
                actions.splitAtBar(pendingEdit.beforeEventId, reason, reason),
              );
              return;
            case "move-to":
              recordEditResult(
                actions.moveSelectionTo(pendingEdit.measureId, null, reason),
              );
              return;
            case "join-next-measure":
              recordEditResult(
                joinNextMeasureComposing(actions, pendingEdit.measureId),
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
        onSectionLoopToggle: (sectionId) => {
          recordEditResult(actions.armSectionLoop(sectionId));
          bumpLoopIntent();
        },
        readSectionLoopId: () => actions.readLoopView().sectionId,
        onRenameSection: (sectionId, name) => {
          recordEditResult(actions.renameSection(sectionId, name));
        },
        onAnnotateSection: (sectionId, annotation) => {
          recordEditResult(actions.annotateSection(sectionId, annotation));
        },
        onDropChordOnMeasure: (measureId) => {
          /*
           * jcpe-v2r-measure-ux-wk3w directive 5: a dropped chord lands. The
           * gesture auto-declares a bar the departure leaves short and, when
           * the destination is already full, makes room at its end instead
           * of refusing the drop outright.
           */
          recordEditResult(moveSelectionToAutoResolving(actions, measureId), {
            kind: "move-to",
            measureId,
          });
        },
        onMoveSelectionToMeasure: (measureId) => {
          /*
           * U1-OP-012 keyboard move (jcpe-7djg): a deliberate Alt+M never
           * auto-declares the bar it shortens. The plain move refuses with
           * u1.completion_reason_required, the dialog asks, and the resume
           * path re-issues the move with the person's own reason.
           */
          recordEditResult(actions.moveSelectionTo(measureId, null, null), {
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
              // Same jcpe-yvni gesture the toolbar uses: the copy lands.
              recordEditResult(duplicateSelectionAutoResolving(actions), {
                kind: "duplicate",
              });
              return;
            case "delete":
              // Same jcpe-yvni gesture: routine deletes auto-declare.
              recordEditResult(deleteSelectionAutoDeclaring(actions), {
                kind: "delete",
              });
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
        onDeleteMeasure: (measureId) => {
          recordEditResult(actions.deleteMeasure(measureId), { kind: "delete" });
        },
        onSplitAtBar: (beforeEventId) => {
          recordEditResult(actions.splitAtBar(beforeEventId), {
            kind: "split-at-bar",
            beforeEventId,
          });
        },
        onJoinNextMeasure: (measureId) => {
          /*
           * jcpe-v2r-measure-join-v3s6: the tie composes select + move +
           * delete through existing intents (the frozen plan vocabulary has
           * no merge). Two undoable steps, exactly like the duplicate
           * overfill resolution; the notice names the join.
           */
          recordEditResult(joinNextMeasureComposing(actions, measureId), {
            kind: "join-next-measure",
            measureId,
          });
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
        onCycleKey: () => {
          /* The prototype's reviewed ten-key ring; "No key" precedes C so a
             fresh chart reaches a key in one press and can cycle back off
             the ring only by undo. */
          const ring: readonly (readonly [string, number])[] = [
            ["C", 0], ["F", 0], ["B", -1], ["E", -1], ["A", -1],
            ["D", -1], ["G", 0], ["D", 0], ["A", 0], ["E", 0],
          ];
          const label = snapshot.keyLabel;
          const index = ring.findIndex(([step, alter]) => {
            const accidental = alter === -1 ? "b" : "";
            return label === `${step}${accidental} major`;
          });
          const next = ring[(index + 1) % ring.length];
          if (next === undefined) return;
          recordEditResult(
            actions.setKey({ step: next[0], alter: next[1], mode: "major" }),
          );
        },
        onChartLayoutChange: (layout) => {
          setChartLayout(layout);
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
        onClearChart: () => {
          /*
           * Destructive but undoable, so the confirmation stops an accidental
           * click rather than guarding something unrecoverable. The first
           * press arms; the second within the window performs. A refusal is
           * surfaced like any other, never swallowed.
           */
          if (!clearArmed) {
            setClearArmed(true);
            if (clearArmTimer.current !== null) {
              window.clearTimeout(clearArmTimer.current);
            }
            clearArmTimer.current = window.setTimeout(() => {
              clearArmTimer.current = null;
              setClearArmed(false);
            }, 5000);
            return;
          }
          disarmClear();
          recordEditResult(actions.clearChart(), { kind: "delete" });
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
          /* The export surface's dismiss is the workflow's cancel: abandon the
           * preparation, not just the drawer. */
          if (activeSheet === "export") {
            closeMidiExport();
            return;
          }
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
      <h1>JazzChords.org</h1>
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
/**
 * The composition-bound A1 recovery surface (l3a.2 step 4). Every method
 * is orchestrator-backed: `startup` runs the reviewed matrix after share
 * handling, `keep` rides the transactional replacement channel, and
 * `discard` is the service's idempotent discard. The envelope token is
 * opaque to the UI layer.
 */
export type StudioRecoveryUiBinding = Readonly<{
  startup: () => Promise<
    | Readonly<{ kind: "none" }>
    | Readonly<{
        kind: "offer";
        savedAtLabel: string;
        revision: number;
        token: unknown;
      }>
  >;
  keep: (
    token: unknown,
  ) => Promise<
    | Readonly<{ ok: true; recoveredAtLabel: string }>
    | Readonly<{ ok: false; message: string }>
  >;
  discard: () => Promise<void>;
}>;

export type StudioRootProps = Readonly<{
  controller: StudioController;
  /** A boot-time refusal (for example, an unreadable share link). */
  startupNotice?: string | null;
  /**
   * The MIDI import service the composition root built around the embedded
   * wasm decoder. Absent means the surface is not offered at all — the UI
   * never reaches for a decoder itself.
   */
  midiImport?: StudioMidiImportService | null;
  /**
   * The U7 MIDI export workflow service the composition root built over the
   * controller closure, Web Crypto, and the browser download adapter. Absent
   * means the surface is not offered at all.
   */
  midiExport?: StudioMidiExportService | null;
  /** Absent means the recovery surface is not offered at all. */
  recovery?: StudioRecoveryUiBinding | null;
}>;

type RecoveryUiState =
  | Readonly<{ kind: "idle" }>
  | Readonly<{
      kind: "offer";
      savedAtLabel: string;
      revision: number;
      token: unknown;
      busy: boolean;
      failureMessage: string | null;
    }>
  | Readonly<{ kind: "status"; text: string }>;

export function StudioRoot({
  controller,
  startupNotice,
  midiImport,
  midiExport,
  recovery,
}: StudioRootProps) {
  const midiImportService = midiImport ?? null;
  const midiExportService = midiExport ?? null;
  const recoveryBinding = recovery ?? null;
  const [snapshot, setSnapshot] = useState(controller.getSnapshot());
  const [recoveryUi, setRecoveryUi] = useState<RecoveryUiState>(
    Object.freeze({ kind: "idle" as const }),
  );

  useEffect(() => {
    const publishSnapshot = (): void => {
      setSnapshot(controller.getSnapshot());
    };
    const unsubscribe = controller.subscribe(publishSnapshot);
    publishSnapshot();
    return unsubscribe;
  }, [controller]);

  useEffect(() => {
    if (recoveryBinding === null) return;
    let live = true;
    void recoveryBinding.startup().then((view) => {
      if (!live || view.kind !== "offer") return;
      setRecoveryUi(
        Object.freeze({
          kind: "offer" as const,
          savedAtLabel: view.savedAtLabel,
          revision: view.revision,
          token: view.token,
          busy: false,
          failureMessage: null,
        }),
      );
    });
    return () => {
      live = false;
    };
  }, [recoveryBinding]);

  const recoveryRegion =
    recoveryUi.kind === "offer" ? (
      <>
        <RecoveryNotice
          offer={{
            savedAtLabel: recoveryUi.savedAtLabel,
            revision: recoveryUi.revision,
          }}
          busy={recoveryUi.busy}
          onKeep={() => {
            if (recoveryBinding === null || recoveryUi.busy) return;
            setRecoveryUi(Object.freeze({ ...recoveryUi, busy: true }));
            void recoveryBinding.keep(recoveryUi.token).then((kept) => {
              if (kept.ok) {
                setRecoveryUi(
                  Object.freeze({
                    kind: "status" as const,
                    text: kept.recoveredAtLabel,
                  }),
                );
              } else {
                setRecoveryUi(
                  Object.freeze({
                    ...recoveryUi,
                    busy: false,
                    failureMessage: kept.message,
                  }),
                );
              }
            });
          }}
          onDiscard={() => {
            if (recoveryBinding === null || recoveryUi.busy) return;
            void recoveryBinding.discard();
            setRecoveryUi(Object.freeze({ kind: "idle" as const }));
          }}
        />
        {recoveryUi.failureMessage === null ? null : (
          <p class="studio-recovery-status" role="alert">
            {recoveryUi.failureMessage}
          </p>
        )}
      </>
    ) : recoveryUi.kind === "status" ? (
      <RecoveryStatusLine text={recoveryUi.text} />
    ) : null;

  return (
    <>
      {recoveryRegion}
      <App
      snapshot={snapshot}
      startupNotice={startupNotice ?? null}
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
        loadLibraryEntry: (entryId) =>
          loadProgressionLibraryEntry(controller, entryId),
        midiImportAvailable: midiImportService !== null,
        readMidiFile: (fileName, bytes) =>
          midiImportService === null
            ? Promise.resolve(
                unavailableMidiImportPreview(fileName, bytes.byteLength),
              )
            : midiImportService.readFile(fileName, bytes),
        commitMidiImport: (preview) =>
          midiImportService === null
            ? null
            : midiImportService.commit(controller, preview),
        commitMidiImportAutomatic: (preview) =>
          midiImportService === null
            ? null
            : midiImportService.commitAutomatic(controller, preview),
        replanMidiImport: (preview, overrides) =>
          midiImportService === null
            ? null
            : midiImportService.replanWithOverrides(preview, overrides),
        midiExportAvailable: midiExportService !== null,
        midiExportOpenPreview: () => {
          if (midiExportService === null) {
            return Promise.resolve(studioMidiExportUnwiredPreview());
          }
          return midiExportService.openPreview();
        },
        midiExportGenerate: (preparationId) => {
          if (midiExportService === null) {
            return studioMidiExportUnwiredGenerate();
          }
          return midiExportService.generate(preparationId);
        },
        midiExportDownload: (preparationId) => {
          if (midiExportService === null) {
            return Promise.resolve(studioMidiExportUnwiredDownload());
          }
          return midiExportService.download(preparationId);
        },
        midiExportAbandon: (preparationId) => {
          midiExportService?.abandon(preparationId);
        },
        pauseProgression: controller.pauseProgression,
        playProgression: controller.playProgression,
        previewChord: controller.previewChord,
        previewPitch: controller.previewPitch,
        previewPitches: controller.previewPitches,
        readTransportPlayheadLabel: controller.readTransportPlayheadLabel,
        readTransportAnalysisFrame: controller.readTransportAnalysisFrame,
        readEventPitchClasses: controller.readEventPitchClasses,
        readContinuationSuggestions: controller.readContinuationSuggestions,
        readEventAnalysis: controller.readEventAnalysis,
        readSectionPhrases: controller.readSectionPhrases,
        readChordDetail: controller.readChordDetail,
        splitEventDuration: controller.splitEventDuration,
        splitSection: controller.splitSection,
        stopProgression: controller.stopProgression,
        seekToFraction: controller.seekToFraction,
        toggleLoop: controller.toggleLoop,
        armSectionLoop: controller.armSectionLoop,
        readLoopView: controller.readLoopView,
        readLoopRegionView: controller.readLoopRegionView,
        previewMasterVolume: controller.previewMasterVolume,
        toggleMute: controller.toggleMute,
        readMixView: controller.readMixView,
        setSectionBoundary: controller.setSectionBoundary,
        setEventDurationText: controller.setEventDurationText,
        getSnapshot: controller.getSnapshot,
        setQuickEntryDraft: controller.setQuickEntryDraft,
        setRailCollapsed: controller.setRailCollapsed,
        setTitle: controller.setTitle,
        setTempo: controller.setTempo,
        setInstrument: controller.setInstrument,
        setMasterVolume: controller.setMasterVolume,
        setKey: controller.setKey,
        setPerformanceStyle: controller.setPerformanceStyle,
        clearChart: controller.clearChart,
        deleteMeasure: controller.deleteMeasure,
        splitAtBar: controller.splitAtBar,
        undo: controller.undo,
      }}
    />
    </>
  );
}
