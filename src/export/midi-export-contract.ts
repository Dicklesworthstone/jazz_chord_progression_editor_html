import type { ChordEventId, DocumentId, PathRefusal } from "../domain";
import {
  MAX_PLAYBACK_PLAN_EVENTS,
  MAX_PLAYBACK_PLAN_OUTPUT_PITCHES,
  PLAYBACK_PLAN_FIXED_VELOCITY,
  PLAYBACK_PLAN_MIDI_PPQ,
  type PlaybackPlan,
} from "../playback";

/**
 * E1 deterministic Standard MIDI File export: stable public identities.
 *
 * The writer consumes one finished P0 playback plan (its pitches are the
 * already-realized V2/V0 voicings) plus explicit, id-bound marker text, and
 * emits format-1 SMF bytes at PPQ 960 with a machine-readable report. It
 * never reparses symbols, revoices, re-quantizes, touches the network, or
 * creates object URLs; byte output is a plain Uint8Array.
 */
export const MIDI_EXPORT_CONTRACT_SCHEMA =
  "changes.export.midi-export-contract.v1";
export const MIDI_EXPORT_REQUEST_SCHEMA =
  "changes.export.midi-export-request.v1";
export const MIDI_EXPORT_RESULT_SCHEMA = "changes.export.midi-export-result.v1";
export const MIDI_EXPORT_REPORT_SCHEMA = "changes.export.midi-export-report.v1";
export const MIDI_EXPORT_MARKER_SCHEMA = "changes.export.midi-export-marker.v1";

export const MIDI_EXPORT_WRITER_ID = "changes.midi-export";
export const MIDI_EXPORT_WRITER_VERSION = 1;
export const MIDI_EXPORT_WRITER_VERSION_TAG = "changes.midi-export.v1";

/** SMF envelope: format 1, two tracks, PPQ division from the plan. */
export const MIDI_EXPORT_FORMAT = 1;
export const MIDI_EXPORT_TRACK_COUNT = 2;
export const MIDI_EXPORT_DIVISION = PLAYBACK_PLAN_MIDI_PPQ;
export const MIDI_EXPORT_CHANNEL = 0;
export const MIDI_EXPORT_VELOCITY = PLAYBACK_PLAN_FIXED_VELOCITY;
export const MIDI_EXPORT_NOTE_OFF_VELOCITY = 0;

/** Frozen meta-event vocabulary (type byte per SMF 1.0). */
export const MIDI_EXPORT_META_TYPES = Object.freeze({
  trackName: 0x03,
  instrumentName: 0x04,
  marker: 0x06,
  endOfTrack: 0x2f,
  setTempo: 0x51,
  timeSignature: 0x58,
} as const);

/**
 * Integer tempo law: microseconds per quarter is the nearest integer to
 * 60,000,000 / bpm (ties cannot occur for integer 20..400 bpm). The report
 * carries the exact rational rounding error as integers.
 */
export const MIDI_EXPORT_MICROSECONDS_PER_MINUTE = 60_000_000;
export const MIN_MIDI_EXPORT_TEMPO_BPM = 20;
export const MAX_MIDI_EXPORT_TEMPO_BPM = 400;

/** Time-signature meta payload: nn, dd = log2(beatUnit), cc = 24, bb = 8. */
export const MIDI_EXPORT_TIME_SIGNATURE_CLOCKS_PER_CLICK = 24;
export const MIDI_EXPORT_TIME_SIGNATURE_32NDS_PER_QUARTER = 8;

/** Variable-length quantities are at most four bytes: deltas cap here. */
export const MAX_MIDI_EXPORT_VLQ_VALUE = 0x0f_ff_ff_ff;

export const MAX_MIDI_EXPORT_EVENTS = MAX_PLAYBACK_PLAN_EVENTS;
export const MAX_MIDI_EXPORT_NOTES = MAX_PLAYBACK_PLAN_OUTPUT_PITCHES;
export const MAX_MIDI_EXPORT_MARKERS = MAX_PLAYBACK_PLAN_EVENTS + 64;
export const MAX_MIDI_EXPORT_TEXT_UTF8_BYTES = 96;
export const MAX_MIDI_EXPORT_FILENAME_CHARS = 64;
export const MIDI_EXPORT_FILENAME_SUFFIX = ".mid";
export const MIDI_EXPORT_FILENAME_PREFIX = "changes-";
export const MIDI_EXPORT_FILENAME_SAFE_PATTERN_SOURCE = "^[A-Za-z0-9._-]+$";
export const MAX_MIDI_EXPORT_REQUEST_ID_ASCII_LENGTH = 128;
export const MIDI_EXPORT_REQUEST_ID_PATTERN_SOURCE = "^[A-Za-z0-9._-]{1,128}$";

/**
 * Mechanical byte ceiling: fourteen header bytes, two track headers, worst
 * case seven bytes per note-on and note-off, plus bounded conductor metas.
 */
export const MAX_MIDI_EXPORT_BYTES = 4_194_304;

/**
 * Deterministic event ordering inside each track, applied in this exact
 * precedence: ascending tick; at an equal tick every meta event precedes
 * every channel event, note-offs precede note-ons, and equal-kind channel
 * events order by ascending note number; conductor metas at an equal tick
 * order as track-name, tempo, time-signature, then markers (section before
 * chord, then by ascending bound-event ordinal). End-of-track closes both
 * tracks at the plan's total tick.
 */
export const MIDI_EXPORT_EVENT_ORDER = Object.freeze([
  "ascending-tick",
  "meta-before-channel",
  "note-off-before-note-on",
  "ascending-note-number",
  "conductor-meta-order",
] as const);

export const MIDI_EXPORT_CONDUCTOR_META_ORDER = Object.freeze([
  "track-name",
  "set-tempo",
  "time-signature",
  "section-markers",
  "chord-markers",
] as const);

/**
 * Running status: a channel voice message omits its status byte exactly
 * when the previous emitted track event was a channel message with the
 * identical status; any meta event cancels running status.
 */
export const MIDI_EXPORT_RUNNING_STATUS_POLICY =
  "omit-when-previous-channel-status-identical-meta-cancels";

export const MIDI_EXPORT_MARKER_KINDS = Object.freeze([
  "section",
  "chord",
] as const);
export type MidiExportMarkerKind = (typeof MIDI_EXPORT_MARKER_KINDS)[number];

export const MIDI_EXPORT_LOSS_KINDS = Object.freeze([
  "enharmonic-spelling",
  "annotation-text",
  "loop-range",
] as const);
export type MidiExportLossKind = (typeof MIDI_EXPORT_LOSS_KINDS)[number];

export const MIDI_EXPORT_REFUSAL_CODES = Object.freeze([
  "midi.schema_invalid",
  "midi.policy_invalid",
  "midi.request_id_invalid",
  "midi.revision_invalid",
  "midi.document_mismatch",
  "midi.plan_invalid",
  "midi.tempo_invalid",
  "midi.meter_invalid",
  "midi.event_order_invalid",
  "midi.pitch_out_of_range",
  "midi.gate_invalid",
  "midi.text_invalid",
  "midi.marker_unbound",
  "midi.marker_duplicate",
  "midi.vlq_overflow",
  "limit.midi_export_size_exceeded",
] as const);
export type MidiExportRefusalCode =
  (typeof MIDI_EXPORT_REFUSAL_CODES)[number];

/**
 * Validation precedence: the first failing check in this order wins;
 * per-event and per-marker checks resolve in ascending ordinal order.
 */
export const MIDI_EXPORT_VALIDATION_PRECEDENCE = Object.freeze([
  "midi.schema_invalid",
  "midi.policy_invalid",
  "midi.request_id_invalid",
  "midi.revision_invalid",
  "midi.document_mismatch",
  "midi.plan_invalid",
  "midi.tempo_invalid",
  "midi.meter_invalid",
  "midi.event_order_invalid",
  "midi.pitch_out_of_range",
  "midi.gate_invalid",
  "midi.text_invalid",
  "midi.marker_unbound",
  "midi.marker_duplicate",
  "midi.vlq_overflow",
  "limit.midi_export_size_exceeded",
] as const);

/**
 * Marker text is UTF-8, one to ninety-six bytes, and refuses ASCII control
 * characters; it is emitted verbatim as meta payload bytes and never parsed,
 * evaluated, or turned into markup or URLs.
 */
export type MidiExportText = string;

export type MidiExportMarker = Readonly<{
  schema: typeof MIDI_EXPORT_MARKER_SCHEMA;
  kind: MidiExportMarkerKind;
  eventId: ChordEventId;
  text: MidiExportText;
}>;

export type MidiExportRequest = Readonly<{
  schema: typeof MIDI_EXPORT_REQUEST_SCHEMA;
  requestId: string;
  writerId: typeof MIDI_EXPORT_WRITER_ID;
  writerVersion: typeof MIDI_EXPORT_WRITER_VERSION;
  documentId: DocumentId;
  sourceRevision: number;
  title: MidiExportText;
  voicingTrackName: MidiExportText;
  instrumentName: MidiExportText;
  markers: readonly MidiExportMarker[];
  plan: PlaybackPlan;
}>;

export type MidiExportLoss = Readonly<{
  kind: MidiExportLossKind;
  eventIds: readonly ChordEventId[];
  detail: string;
}>;

/**
 * The report states requested and encoded tempo exactly: the encoding error
 * in microseconds per quarter equals roundingErrorNumerator divided by
 * requestedBpm and is at most one half.
 */
export type MidiExportReport = Readonly<{
  schema: typeof MIDI_EXPORT_REPORT_SCHEMA;
  requestId: string;
  documentId: DocumentId;
  sourceRevision: number;
  writerId: typeof MIDI_EXPORT_WRITER_ID;
  writerVersion: typeof MIDI_EXPORT_WRITER_VERSION;
  format: typeof MIDI_EXPORT_FORMAT;
  division: typeof MIDI_EXPORT_DIVISION;
  trackCount: typeof MIDI_EXPORT_TRACK_COUNT;
  requestedBpm: number;
  encodedMicrosecondsPerQuarter: number;
  roundingErrorNumerator: number;
  roundingErrorDenominator: number;
  noteCount: number;
  markerCount: number;
  byteLength: number;
  totalTicks: number;
  filename: string;
  losses: readonly MidiExportLoss[];
}>;

export type MidiExportValue = Readonly<{
  schema: typeof MIDI_EXPORT_RESULT_SCHEMA;
  kind: "exported";
  bytes: Uint8Array;
  report: MidiExportReport;
}>;

export type MidiExportRefusal = PathRefusal<{
  code: MidiExportRefusalCode;
  partialResult: false;
}>;

export type MidiExportResult =
  | Readonly<{ ok: true; value: MidiExportValue }>
  | Readonly<{ ok: false; refusal: MidiExportRefusal }>;

export interface ExportMidi {
  (request: MidiExportRequest): MidiExportResult;
}

export const MIDI_EXPORT_OPERATION_NAMES = Object.freeze([
  "exportMidi",
] as const);
export type MidiExportOperationName =
  (typeof MIDI_EXPORT_OPERATION_NAMES)[number];

export interface MidiExportOperations {
  readonly exportMidi: ExportMidi;
}

/**
 * Filename law: the prefix, then the document id with every character
 * outside the safe class replaced by "-", truncated so the whole name is at
 * most sixty-four characters, then ".mid".
 */
export const MIDI_EXPORT_FILENAME_POLICY = Object.freeze({
  prefix: MIDI_EXPORT_FILENAME_PREFIX,
  suffix: MIDI_EXPORT_FILENAME_SUFFIX,
  safeClass: MIDI_EXPORT_FILENAME_SAFE_PATTERN_SOURCE,
  replacement: "-",
  maximumCharacters: MAX_MIDI_EXPORT_FILENAME_CHARS,
  objectUrlOwnership:
    "the export layer never creates object URLs; download wiring and revocation belong to the application/UI layers",
} as const);
