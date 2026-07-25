import {
  MIDI_PPQ,
  measureCapacity,
  type BeatValue,
  type InstrumentId,
  type KeyContext,
  type MeasureCompletion,
} from "../domain";
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

export type StudioBookmarkViewModel = Readonly<{
  selectedEventIds: readonly string[];
  selectionFocusEventId: string | null;
  selectionAnchorEventId: string | null;
  insertionLabel: string | null;
  insertionTargetId: string | null;
  rangeStartBeatLabel: string | null;
  rangeEndBeatLabel: string | null;
  rangeActive: boolean;
}>;

export type StudioQuickEntryViewModel = Readonly<{
  text: string;
  status: "idle" | "invalid" | "ready";
  baseRevision: number;
  baseRevisionCurrent: boolean;
  targetLabel: string | null;
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
}>;

export type StudioPanelViewModel = Readonly<{
  open: readonly ApplicationPanelId[];
  active: ApplicationPanelId;
  leftRailCollapsed: boolean;
  rightRailCollapsed: boolean;
}>;

export type StudioNoticeViewModel = Readonly<{
  sequence: number;
  level: Notice["level"];
  code: string;
  message: string;
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
  panels: StudioPanelViewModel;
  noticeCount: number;
  latestNotice: StudioNoticeViewModel | null;
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
  }
}

function transportStatusLabel(status: ApplicationTransportStatus): string {
  switch (status) {
    case "unavailable":
      return "Audio unavailable";
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
    issueCodes: Object.freeze([...draft.issueCodes]),
    codePointCount: countCodePoints(draft.text),
  });
}

/** Derive a frozen, presentation-only projection from the authoritative A0 tree. */
export function selectStudioViewModel(state: AppState): StudioViewModel {
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
    }),
    panels: Object.freeze({
      open: Object.freeze([...state.panels.open]),
      active: state.panels.active,
      leftRailCollapsed: state.panels.leftRailCollapsed,
      rightRailCollapsed: state.panels.rightRailCollapsed,
    }),
    noticeCount: state.notices.length,
    latestNotice: latestNoticeView(state.notices[state.notices.length - 1]),
  });
}
