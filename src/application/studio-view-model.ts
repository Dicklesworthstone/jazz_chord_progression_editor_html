import {
  INSTRUMENT_IDS,
  MIDI_PPQ,
  measureCapacity,
  type BeatValue,
  type InstrumentId,
  type KeyContext,
  type MeasureCompletion,
} from "../domain";
import {
  PERFORMANCE_STYLE_IDS,
  type PerformanceStyleId,
} from "../playback";
import { STUDIO_PERFORMANCE_STYLE } from "./studio-playback";
import {
  selectBeatRange,
  selectDirtyState,
  selectHistoryAvailability,
} from "./application-selectors";
import type {
  AppState,
  ApplicationPanelId,
  ApplicationTransportStatus,
  Notice,
  StableBoundary,
} from "./application-state-contract";

export type StudioChordViewModel = Readonly<{
  id: string;
  ordinal: number;
  measureId: string;
  sectionId: string;
  symbolText: string;
  durationBeatLabel: string;
  startBeatLabel: string;
  voicingMode: "auto" | "manual" | "frozen";
  hasAnnotation: boolean;
  selected: boolean;
  isSelectionFocus: boolean;
  inRange: boolean;
}>;

export type StudioMeasureViewModel = Readonly<{
  id: string;
  ordinal: number;
  eventCount: number;
  completion: MeasureCompletion["kind"];
  completionLabel: string;
  /**
   * The stored reason a pickup or incomplete measure carries, verbatim.
   *
   * A short bar is only legal because someone declared why, so the surface has
   * to be able to show that reason with the measure. It is read from the
   * document and never invented: a measure with no stored reason reports null
   * rather than a plausible sentence.
   */
  completionReason: string | null;
  startBeatLabel: string;
  durationBeatLabel: string;
  endBeatLabel: string;
  capacityBeatLabel: string;
  fill: "empty" | "exact-fill" | "underfilled" | "overfilled";
  events: readonly StudioChordViewModel[];
}>;

export type StudioSectionViewModel = Readonly<{
  id: string;
  name: string;
  annotation: string;
  voiceLeadingBoundary: "reset" | "continue";
  measures: readonly StudioMeasureViewModel[];
}>;

/**
 * A stable boundary with its identity brand removed. The surface can hold one
 * and hand it back to the controller, which re-resolves it against the current
 * chart; it can never fabricate a branded domain identity from this value.
 */
export type StudioBoundaryDescriptor =
  | Readonly<{ kind: "document-start" | "document-end" }>
  | Readonly<{
      kind: "before-section" | "after-section" | "section-start" | "section-end";
      sectionId: string;
    }>
  | Readonly<{
      kind: "before-measure" | "after-measure" | "measure-start" | "measure-end";
      measureId: string;
    }>
  | Readonly<{ kind: "before-event" | "after-event"; eventId: string }>;

export type StudioBookmarkViewModel = Readonly<{
  selectedEventIds: readonly string[];
  selectionFocusEventId: string | null;
  selectionAnchorEventId: string | null;
  insertionLabel: string | null;
  insertionTargetId: string | null;
  rangeStartBeatLabel: string | null;
  rangeEndBeatLabel: string | null;
  rangeActive: boolean;
  /** The exact stored edges, so Cancel can restore a range byte-for-byte. */
  rangeAnchor: StudioBoundaryDescriptor | null;
  rangeFocus: StudioBoundaryDescriptor | null;
}>;

export type StudioQuickEntryViewModel = Readonly<{
  text: string;
  status: "idle" | "invalid" | "ready";
  baseRevision: number;
  baseRevisionCurrent: boolean;
  targetLabel: string | null;
  /** The exact stored target, so a surface can re-aim an existing draft. */
  target: StudioBoundaryDescriptor | null;
  targetId: string | null;
  issueCodes: readonly string[];
  codePointCount: number;
}>;

export type StudioTransportViewModel = Readonly<{
  status: ApplicationTransportStatus;
  statusLabel: string;
  isAvailable: boolean;
  playheadBeatLabel: string;
  startBeatLabel: string;
  failureCode: string | null;
  failureDetail: string | null;
}>;

export type StudioPanelViewModel = Readonly<{
  open: readonly ApplicationPanelId[];
  active: ApplicationPanelId;
  leftRailCollapsed: boolean;
  rightRailCollapsed: boolean;
}>;

/**
 * The focus A0 asked the surface to render. U1 never infers focus from the
 * DOM: it renders this request and then acknowledges the sequence, so a focus
 * repair is an application fact rather than a guess about where the caret was.
 */
export type StudioFocusRequestViewModel = Readonly<{
  sequence: number;
  kind: "chart" | "section" | "measure" | "event" | "dialog";
  targetId: string | null;
  reason:
    | "command"
    | "delete-repair"
    | "replacement"
    | "undo"
    | "redo"
    | "dialog-close";
}>;

export type StudioNoticeViewModel = Readonly<{
  sequence: number;
  level: Notice["level"];
  code: string;
  message: string;
}>;

/**
 * Session-scoped inputs the selector cannot read from `AppState`. The
 * performance style is controller-owned session state (the document schema
 * has no style field by design), so the controller passes it in whenever it
 * publishes a snapshot.
 */
export type StudioSessionViewInput = Readonly<{
  performanceStyleId?: PerformanceStyleId;
}>;

export type StudioPerformanceViewModel = Readonly<{
  styleId: PerformanceStyleId;
  styleLabel: string;
  options: readonly Readonly<{ id: PerformanceStyleId; label: string }>[];
}>;

export type StudioViewModel = Readonly<{
  documentId: string;
  title: string;
  revision: number;
  dirty: Readonly<{
    sinceExport: boolean;
    sinceRecovery: boolean;
    label: string;
  }>;
  history: Readonly<{
    canUndo: boolean;
    canRedo: boolean;
    locked: boolean;
    undoLabel: string | null;
    redoLabel: string | null;
  }>;
  meterLabel: string;
  tempoBpm: number;
  keyLabel: string;
  instrumentId: InstrumentId;
  instrumentLabel: string;
  masterVolume: number;
  reverbAmount: number;
  countInBars: number;
  sections: readonly StudioSectionViewModel[];
  measureCount: number;
  chordCount: number;
  bookmarks: StudioBookmarkViewModel;
  quickEntry: StudioQuickEntryViewModel;
  transport: StudioTransportViewModel;
  performance: StudioPerformanceViewModel;
  panels: StudioPanelViewModel;
  noticeCount: number;
  latestNotice: StudioNoticeViewModel | null;
  focusRequest: StudioFocusRequestViewModel | null;
}>;

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a;
}

function exactTicksLabel(ticks: bigint): string {
  const denominator = BigInt(MIDI_PPQ);
  const divisor = greatestCommonDivisor(ticks, denominator);
  return `${String(ticks / divisor)}/${String(denominator / divisor)}`;
}

export function formatExactBeatLabel(
  value: Pick<BeatValue, "numerator" | "denominator">,
): string {
  return `${String(value.numerator)}/${String(value.denominator)}`;
}

function durationTicks(value: Pick<BeatValue, "numerator" | "denominator">): bigint {
  return (
    (BigInt(value.numerator) * BigInt(MIDI_PPQ)) /
    BigInt(value.denominator)
  );
}

/** Exact measure fill against the meter capacity; no wall clock is consulted. */
function measureFill(
  eventCount: number,
  measureTicks: bigint,
  capacityTicks: bigint,
): "empty" | "exact-fill" | "underfilled" | "overfilled" {
  if (eventCount === 0) return "empty";
  if (measureTicks === capacityTicks) return "exact-fill";
  return measureTicks < capacityTicks ? "underfilled" : "overfilled";
}

function completionLabel(completion: MeasureCompletion["kind"]): string {
  switch (completion) {
    case "empty":
      return "Empty measure";
    case "complete":
      return "Complete measure";
    case "pickup":
      return "Pickup measure";
    case "incomplete":
      return "Intentionally incomplete measure";
  }
}

function accidentalLabel(alteration: KeyContext["tonic"]["alter"]): string {
  switch (alteration) {
    case -2:
      return "bb";
    case -1:
      return "b";
    case 0:
      return "";
    case 1:
      return "#";
    case 2:
      return "##";
  }
}

function keyLabel(key: KeyContext | null): string {
  if (key === null) return "No key";
  const mode = key.mode.replaceAll("-", " ");
  return `${key.tonic.step}${accidentalLabel(key.tonic.alter)} ${mode}`;
}

/** One human name per declared style; the picker renders these verbatim. */
export function performanceStyleLabel(styleId: PerformanceStyleId): string {
  switch (styleId) {
    case "ballad-comp@1":
      return "Ballad";
    case "medium-swing@1":
      return "Medium swing";
    case "bossa-nova@1":
      return "Bossa nova";
    case "straight-eighths@1":
      return "Straight eighths";
    case "syncopated-sixteenths@1":
      return "Syncopated sixteenths";
    case "uptempo-swing@1":
      return "Uptempo swing";
    case "block-chords@1":
      return "Block chords";
  }
}

/** Every declared instrument with its display label, for pickers. */
export function instrumentOptions(): readonly Readonly<{
  id: InstrumentId;
  label: string;
}>[] {
  return Object.freeze(
    INSTRUMENT_IDS.map((id) => Object.freeze({ id, label: instrumentLabel(id) })),
  );
}

function instrumentLabel(instrumentId: InstrumentId): string {
  switch (instrumentId) {
    case "mellow-keys":
      return "Mellow Keys";
    case "fm-electric-piano":
      return "FM Electric Piano";
    case "vibraphone":
      return "Vibraphone";
    case "warm-pad":
      return "Warm Pad";
    case "analog-poly":
      return "Analog Poly";
    case "concert-grand":
      return "Concert Grand";
    case "flute":
      return "Flute";
    case "organ":
      return "Organ";
    case "guitar":
      return "Guitar";
    case "upright-bass":
      return "Upright Bass";
    case "concert-vibes":
      return "Concert Vibes";
    case "blues-guitar":
      return "Blues Guitar";
    case "clarinet":
      return "Clarinet";
  }
}

function transportStatusLabel(status: ApplicationTransportStatus): string {
  switch (status) {
    /*
     * One status covers "not started yet" (every load before the first Play,
     * because browsers gate the graph on a gesture) and "cannot start". The
     * label must be truthful for both; the detail line carries the action.
     */
    case "unavailable":
      return "Audio off";
    case "ready":
      return "Audio ready";
    case "starting":
      return "Starting playback";
    case "playing":
      return "Playing";
    case "paused":
      return "Paused";
    case "stopping":
      return "Stopping playback";
    case "failed":
      return "Audio failed";
  }
}

/**
 * jcpe-my0j: the stable application-settlement cause the controller publishes
 * when a command's RECEIPT has to settle a still-optimistic expectation
 * because the genuine X1 notification was identity-superseded — the document
 * was replaced or edited after the sounding plan was bound, so the echoed
 * (documentId, planRevision) can never satisfy the A0 acceptance law again.
 * Minted by the studio controller, never by X1; it is not an X1 refusal code.
 */
export const TRANSPORT_PLAN_SUPERSEDED_FAILURE_CODE =
  "transport.plan_superseded";

/**
 * jcpe-uslp: every stable failure code the transport view can carry — the 20
 * X1 refusal codes, the 28 X0 engine codes, the interruption marker, and the
 * jcpe-my0j plan-superseded settlement cause — maps to a sentence that says
 * what happened and the next safe action. The default arm keeps the map total
 * for any future code without hiding it.
 */
export function transportFailureDetail(code: string): string {
  switch (code) {
    case "transport.locked":
      return "Audio has not started yet. Press Play to start it.";
    case TRANSPORT_PLAN_SUPERSEDED_FAILURE_CODE:
      return "The chart changed during playback. Press Play to hear the current chart.";
    case "transport.disposed":
    case "audio.engine_closed":
    case "audio.dispose_reason_invalid":
      return "Audio was shut down. Reload the page to restore playback.";
    case "transport.fault_requires_initialize":
      return "Audio hit a fault. Press Play to restart it.";
    case "transport.state_invalid":
      return "That control is not available right now. The chart is unchanged.";
    case "transport.gesture_invalid":
    case "audio.user_gesture_required":
    case "audio.gesture_sequence_invalid":
      return "The browser needs a fresh click before audio can start. Press Play again.";
    case "transport.command_request_id_invalid":
    case "transport.internal_sequence_exhausted":
    case "audio.internal_sequence_exhausted":
      return "Playback commands got out of order. Press Stop, then try again.";
    case "transport.queue_overflow":
      return "Too many playback commands at once. Wait a moment, then try again.";
    case "transport.timing_policy_invalid":
      return "The playback timing settings were rejected. Reload the page.";
    case "transport.plan_invalid":
    case "transport.plan_mismatch":
      return "The chart changed while playback was starting. Press Play again.";
    case "transport.start_beat_out_of_range":
    case "transport.seek_out_of_range":
      return "That position is outside the chart. Press Stop, then Play.";
    case "transport.tempo_out_of_range":
      return "The tempo is outside the playable 20–400 BPM range.";
    case "transport.loop_invalid":
      return "The loop range is not playable. Clear the loop and try again.";
    case "transport.instrument_unknown":
    case "audio.instrument_id_invalid":
      return "That instrument is not available. Pick another instrument.";
    case "transport.mix_invalid":
      return "That volume was not a playable level. Move the fader and try again.";
    case "transport.preview_invalid":
      return "That preview could not be played. Click a chord and try again.";
    case "transport.count_in_invalid":
      return "The count-in setting was rejected. Change it and try again.";
    case "transport.metronome_invalid":
      return "The metronome setting was rejected. Change it and try again.";
    case "transport.engine_refusal":
      return "The audio engine refused the command. Press Stop, then Play.";
    case "transport.interrupted":
      return "The browser interrupted audio. Press Play to resume.";
    case "audio.engine_not_ready":
      return "Audio is still warming up. Try again in a moment.";
    case "audio.context_create_failed":
    case "audio.context_unusable":
    case "audio.context_sample_rate_unsupported":
    case "audio.graph_create_failed":
      return "This browser could not open an audio output. Check the output device and reload.";
    case "audio.context_resume_failed":
      return "The browser blocked audio from resuming. Click the page, then press Play.";
    case "audio.mix_invalid":
      return "The volume or reverb setting was rejected. Adjust them and try again.";
    case "audio.renderer_unavailable":
      return "The piano renderer is unavailable. Playback falls back to synthesis; press Play again.";
    case "audio.owner_invalid":
    case "audio.event_id_invalid":
    case "audio.voice_batch_empty":
    case "audio.voice_batch_limit":
    case "audio.voice_id_invalid":
    case "audio.voice_id_duplicate":
    case "audio.midi_pitch_invalid":
    case "audio.velocity_invalid":
    case "audio.start_time_invalid":
    case "audio.release_time_invalid":
    case "audio.gate_duration_limit":
    case "audio.retiring_voice_capacity":
    case "audio.retirement_selector_invalid":
    case "audio.retirement_time_invalid":
      return "The audio engine rejected scheduled notes. Press Stop, then Play.";
    default:
      return `Audio failed (${code}). Press Stop, then Play.`;
  }
}

/** Brand-free projection of the A0 focus request the surface must render. */
function focusRequestView(
  request: AppState["focusRequest"],
): StudioFocusRequestViewModel | null {
  if (request === null) return null;
  const target = request.target;
  const targetId =
    target.kind === "section"
      ? target.sectionId
      : target.kind === "measure"
        ? target.measureId
        : target.kind === "event"
          ? target.eventId
          : target.kind === "dialog"
            ? target.dialogId
            : null;
  return Object.freeze({
    kind: target.kind,
    reason: request.reason,
    sequence: request.sequence,
    targetId,
  });
}

function latestNoticeView(notice: Notice | undefined): StudioNoticeViewModel | null {
  if (notice === undefined) return null;
  return Object.freeze({
    sequence: notice.sequence,
    level: notice.level,
    code: notice.code,
    message: notice.message,
  });
}

function exportStatusLabel(state: AppState, sinceExport: boolean): string {
  if (state.exportRevision === null) return "Not exported";
  return sinceExport
    ? "Changed since export"
    : `Exported at revision ${String(state.exportRevision)}`;
}

function voicingMode(
  voicing: Readonly<{ mode: string }>,
): "auto" | "manual" | "frozen" {
  if (voicing.mode === "auto") return "auto";
  return voicing.mode === "frozen" ? "frozen" : "manual";
}

/** Identity-free boundary phrase; the surface composes it with an ordinal. */
function boundaryLabel(boundary: StableBoundary | null): string | null {
  if (boundary === null) return null;
  switch (boundary.kind) {
    case "document-start":
      return "Before the first section";
    case "document-end":
      return "After the last section";
    case "before-section":
      return "Before section";
    case "after-section":
      return "After section";
    case "section-start":
      return "At section start";
    case "section-end":
      return "At section end";
    case "before-measure":
      return "Before measure";
    case "after-measure":
      return "After measure";
    case "measure-start":
      return "At measure start";
    case "measure-end":
      return "At measure end";
    case "before-event":
      return "Before chord";
    case "after-event":
      return "After chord";
  }
}

/** Strip the identity brand without changing the boundary's meaning. */
function boundaryDescriptor(
  boundary: StableBoundary | null,
): StudioBoundaryDescriptor | null {
  if (boundary === null) return null;
  if ("eventId" in boundary) {
    return Object.freeze({ eventId: boundary.eventId, kind: boundary.kind });
  }
  if ("measureId" in boundary) {
    return Object.freeze({ kind: boundary.kind, measureId: boundary.measureId });
  }
  if ("sectionId" in boundary) {
    return Object.freeze({ kind: boundary.kind, sectionId: boundary.sectionId });
  }
  return Object.freeze({ kind: boundary.kind });
}

function boundaryTargetId(boundary: StableBoundary | null): string | null {
  if (boundary === null) return null;
  if ("eventId" in boundary) return boundary.eventId;
  if ("measureId" in boundary) return boundary.measureId;
  if ("sectionId" in boundary) return boundary.sectionId;
  return null;
}

function bookmarkView(state: AppState): StudioBookmarkViewModel {
  const selection = state.bookmarks.selection;
  const range = selectBeatRange(state);
  return Object.freeze({
    selectedEventIds:
      selection.kind === "events"
        ? Object.freeze([...selection.eventIds])
        : Object.freeze([]),
    selectionFocusEventId:
      selection.kind === "events" ? selection.focusEventId : null,
    selectionAnchorEventId:
      selection.kind === "events" ? selection.anchorEventId : null,
    insertionLabel: boundaryLabel(state.bookmarks.insertion),
    insertionTargetId: boundaryTargetId(state.bookmarks.insertion),
    rangeStartBeatLabel:
      range === null ? null : formatExactBeatLabel(range.start),
    rangeEndBeatLabel: range === null ? null : formatExactBeatLabel(range.end),
    rangeActive: state.bookmarks.range !== null,
    rangeAnchor: boundaryDescriptor(state.bookmarks.range?.anchor ?? null),
    rangeFocus: boundaryDescriptor(state.bookmarks.range?.focus ?? null),
  });
}

function countCodePoints(text: string): number {
  let count = 0;
  const scalars = text[Symbol.iterator]();
  while (!scalars.next().done) count += 1;
  return count;
}

function quickEntryView(state: AppState): StudioQuickEntryViewModel {
  const draft = state.quickEntry;
  return Object.freeze({
    text: draft.text,
    status: draft.status,
    baseRevision: draft.baseRevision,
    baseRevisionCurrent: draft.baseRevision === state.revision,
    targetLabel: boundaryLabel(draft.target),
    target: boundaryDescriptor(draft.target),
    targetId: boundaryTargetId(draft.target),
    issueCodes: Object.freeze([...draft.issueCodes]),
    codePointCount: countCodePoints(draft.text),
  });
}

/** Derive a frozen, presentation-only projection from the authoritative A0 tree. */
export function selectStudioViewModel(
  state: AppState,
  session?: StudioSessionViewInput,
): StudioViewModel {
  const performanceStyleId =
    session?.performanceStyleId ?? STUDIO_PERFORMANCE_STYLE;
  const dirty = selectDirtyState(state);
  const history = selectHistoryAvailability(state);
  const capacity = measureCapacity(state.document.meter);
  const capacityTicks = durationTicks(capacity);
  const bookmarks = bookmarkView(state);
  const selected = new Set(bookmarks.selectedEventIds);
  const range = selectBeatRange(state);
  const rangeStartTicks = range === null ? null : durationTicks(range.start);
  const rangeEndTicks = range === null ? null : durationTicks(range.end);
  let runningTicks = 0n;
  let measureCount = 0;
  let chordCount = 0;

  const sections = state.document.sections.map((section) => {
    const measures = section.measures.map((measure) => {
      measureCount += 1;
      const startTicks = runningTicks;
      let measureTicks = 0n;
      const events = measure.events.map((event) => {
        chordCount += 1;
        const eventStart = runningTicks + measureTicks;
        measureTicks += durationTicks(event.duration);
        return Object.freeze({
          id: event.id,
          ordinal: chordCount,
          measureId: measure.id,
          sectionId: section.id,
          symbolText: event.chord.sourceText,
          durationBeatLabel: formatExactBeatLabel(event.duration),
          startBeatLabel: exactTicksLabel(eventStart),
          voicingMode: voicingMode(event.voicing),
          hasAnnotation: event.annotation.length > 0,
          selected: selected.has(event.id),
          isSelectionFocus: bookmarks.selectionFocusEventId === event.id,
          inRange:
            rangeStartTicks !== null &&
            rangeEndTicks !== null &&
            eventStart >= rangeStartTicks &&
            eventStart < rangeEndTicks,
        });
      });
      runningTicks += measureTicks;
      return Object.freeze({
        id: measure.id,
        ordinal: measureCount,
        eventCount: measure.events.length,
        completion: measure.completion.kind,
        completionLabel: completionLabel(measure.completion.kind),
        completionReason:
          measure.completion.kind === "incomplete" ||
          measure.completion.kind === "pickup"
            ? measure.completion.reason
            : null,
        startBeatLabel: exactTicksLabel(startTicks),
        durationBeatLabel: exactTicksLabel(measureTicks),
        endBeatLabel: exactTicksLabel(runningTicks),
        capacityBeatLabel: formatExactBeatLabel(capacity),
        fill: measureFill(measure.events.length, measureTicks, capacityTicks),
        events: Object.freeze(events),
      });
    });
    return Object.freeze({
      id: section.id,
      name: section.name,
      annotation: section.annotation,
      voiceLeadingBoundary: section.voiceLeadingBoundary,
      measures: Object.freeze(measures),
    });
  });

  return Object.freeze({
    documentId: state.document.id,
    title: state.document.title,
    revision: state.revision,
    dirty: Object.freeze({
      sinceExport: dirty.sinceExport,
      sinceRecovery: dirty.sinceRecovery,
      label: exportStatusLabel(state, dirty.sinceExport),
    }),
    history: Object.freeze({ ...history }),
    meterLabel: `${String(state.document.meter.beatsPerBar)}/${String(state.document.meter.beatUnit)}`,
    tempoBpm: state.document.tempoBpm,
    keyLabel: keyLabel(state.document.key),
    instrumentId: state.document.playback.instrumentId,
    instrumentLabel: instrumentLabel(state.document.playback.instrumentId),
    masterVolume: state.document.playback.masterVolume,
    reverbAmount: state.document.playback.reverbAmount,
    countInBars: state.document.playback.countInBars,
    sections: Object.freeze(sections),
    measureCount,
    chordCount,
    bookmarks,
    quickEntry: quickEntryView(state),
    transport: Object.freeze({
      status: state.transport.status,
      statusLabel: transportStatusLabel(state.transport.status),
      isAvailable: state.transport.status !== "unavailable",
      playheadBeatLabel: formatExactBeatLabel(state.transport.playhead),
      startBeatLabel: formatExactBeatLabel(state.transport.startBeat),
      failureCode: state.transport.failureCode,
      failureDetail:
        state.transport.failureCode === null
          ? null
          : transportFailureDetail(state.transport.failureCode),
    }),
    performance: Object.freeze({
      styleId: performanceStyleId,
      styleLabel: performanceStyleLabel(performanceStyleId),
      options: Object.freeze(
        PERFORMANCE_STYLE_IDS.map((id) =>
          Object.freeze({ id, label: performanceStyleLabel(id) }),
        ),
      ),
    }),
    panels: Object.freeze({
      open: Object.freeze([...state.panels.open]),
      active: state.panels.active,
      leftRailCollapsed: state.panels.leftRailCollapsed,
      rightRailCollapsed: state.panels.rightRailCollapsed,
    }),
    noticeCount: state.notices.length,
    latestNotice: latestNoticeView(state.notices[state.notices.length - 1]),
    focusRequest: focusRequestView(state.focusRequest),
  });
}
