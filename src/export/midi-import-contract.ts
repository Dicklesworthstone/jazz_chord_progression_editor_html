import type { PathRefusal, PitchClass, SpelledPitchClass } from "../domain";
import type {
  AlteredDominantRealizationId,
  ChordFormulaRuleId,
} from "../theory";

/**
 * M0 deterministic Standard MIDI File import: stable public identities.
 *
 * This is the frozen jcpe-v3c2.1 specification surface for the reverse of
 * the E1 writer: a TOTAL SMF decode (header/track chunks, running status,
 * variable-length quantities, tempo/meter meta, note on/off pairing) in
 * which every hostile input maps to a structured refusal code — never a
 * panic, throw, or silent skip; an exact-integer sonority-grouping law
 * whose simultaneity window is a tick bound derived from the file's own
 * tempo (never wall-clock milliseconds); and a reverse-T1 inference law
 * that matches pitch-class set plus bass against the existing T1 formula
 * vocabulary, yielding PLURAL ranked alternatives with evidence and a
 * literal-pitch-set Custom outcome when no template matches.
 *
 * No production module consumes this contract yet, and it is deliberately
 * NOT re-exported from src/export/index.ts: the export barrel is imported
 * by the live application graph, and this specification must not enter
 * the release artifact before its build phase (jcpe-v3c2.2) lands. Tests
 * and validators import it by direct path, exactly like the U1 and A0/U1
 * edit-plan contract packets did before their cutovers.
 */
export const MIDI_IMPORT_CONTRACT_SCHEMA =
  "changes.import.midi-import-contract.v1";
export const MIDI_IMPORT_REQUEST_SCHEMA =
  "changes.import.midi-import-request.v1";
export const MIDI_IMPORT_RESULT_SCHEMA = "changes.import.midi-import-result.v1";
export const MIDI_IMPORT_DECODE_MODEL_SCHEMA =
  "changes.import.smf-decode-model.v1";
export const MIDI_IMPORT_SONORITY_REPORT_SCHEMA =
  "changes.import.sonority-report.v1";
export const MIDI_IMPORT_RESOLUTION_REPORT_SCHEMA =
  "changes.import.reverse-resolution-report.v1";

export const MIDI_IMPORT_READER_ID = "changes.midi-import";
export const MIDI_IMPORT_READER_VERSION = 1;
export const MIDI_IMPORT_READER_VERSION_TAG = "changes.midi-import.v1";

export const MIDI_IMPORT_OPERATION_NAMES = Object.freeze([
  "decodeSmf",
  "groupSonorities",
  "inferChordSymbols",
] as const);
export type MidiImportOperationName =
  (typeof MIDI_IMPORT_OPERATION_NAMES)[number];

/** SMF envelope the reader accepts. Format 2 and SMPTE division refuse. */
export const MIDI_IMPORT_ACCEPTED_FORMATS = Object.freeze([0, 1] as const);
export const MIN_MIDI_IMPORT_PPQ = 1;
export const MAX_MIDI_IMPORT_PPQ = 32767;

/**
 * SMF defaults when a file carries no tempo or time-signature meta before
 * a tick: 120 bpm and 4/4, per the SMF 1.0 specification. Applying them is
 * a recorded law, never a silent repair.
 */
export const MIDI_IMPORT_DEFAULT_TEMPO_MICROSECONDS_PER_QUARTER = 500000;
export const MIDI_IMPORT_DEFAULT_METER_NUMERATOR = 4;
export const MIDI_IMPORT_DEFAULT_METER_DENOMINATOR_POWER = 2;

/**
 * Consumed meta vocabulary: exactly the six types the E1 writer emits.
 * Reusing the E1 ids keeps the export/import vocabularies reciprocal.
 */
export const MIDI_IMPORT_CONSUMED_META_TYPES = Object.freeze({
  trackName: 0x03,
  instrumentName: 0x04,
  marker: 0x06,
  endOfTrack: 0x2f,
  setTempo: 0x51,
  timeSignature: 0x58,
} as const);

/**
 * Tolerated meta vocabulary: well-formed SMF metas the reader accepts,
 * records in the ignored ledger with tick and byte offset, and never
 * consumes. Anything outside consumed-plus-tolerated refuses with
 * smf.meta_unknown. Nothing is ever skipped silently.
 */
export const MIDI_IMPORT_TOLERATED_META_TYPES = Object.freeze({
  sequenceNumber: 0x00,
  text: 0x01,
  copyright: 0x02,
  lyric: 0x05,
  cuePoint: 0x07,
  channelPrefix: 0x20,
  midiPort: 0x21,
  smpteOffset: 0x54,
  keySignature: 0x59,
  sequencerSpecific: 0x7f,
} as const);

/** Fixed meta payload lengths; a mismatch refuses with smf.meta_length_invalid. */
export const MIDI_IMPORT_FIXED_META_LENGTHS = Object.freeze({
  setTempo: 3,
  timeSignature: 4,
  endOfTrack: 0,
  channelPrefix: 1,
  midiPort: 1,
  smpteOffset: 5,
  keySignature: 2,
} as const);
/** Sequence-number metas may be empty or carry a two-byte number. */
export const MIDI_IMPORT_SEQUENCE_NUMBER_LENGTHS = Object.freeze([
  0, 2,
] as const);

/**
 * Ignored-event kinds recorded in the ledger. Channel voice messages other
 * than note on/off, sysex/escape events, tolerated metas, duplicate
 * track/instrument names, and alien chunks are all recorded, never silent.
 */
export const MIDI_IMPORT_IGNORED_EVENT_KINDS = Object.freeze([
  "sequence-number",
  "text",
  "copyright",
  "lyric",
  "cue-point",
  "channel-prefix",
  "midi-port",
  "smpte-offset",
  "key-signature",
  "sequencer-specific",
  "duplicate-track-name",
  "duplicate-instrument-name",
  "sysex",
  "escape",
  "poly-aftertouch",
  "control-change",
  "program-change",
  "channel-aftertouch",
  "pitch-bend",
] as const);
export type MidiImportIgnoredEventKind =
  (typeof MIDI_IMPORT_IGNORED_EVENT_KINDS)[number];

/** Variable-length quantities are at most four bytes; a fifth byte refuses. */
export const MAX_MIDI_IMPORT_VLQ_BYTES = 4;
export const MAX_MIDI_IMPORT_VLQ_VALUE = 0x0f_ff_ff_ff;

/** Exact-integer resource bounds. Every limit refusal is deterministic. */
export const MAX_MIDI_IMPORT_BYTES = 4_194_304;
export const MAX_MIDI_IMPORT_TRACKS = 64;
export const MAX_MIDI_IMPORT_EVENTS = 524_288;
export const MAX_MIDI_IMPORT_NOTES = 131_072;
export const MAX_MIDI_IMPORT_TICK_HORIZON = 1_073_741_823;
export const MAX_MIDI_IMPORT_TEMPO_CHANGES = 4_096;
export const MAX_MIDI_IMPORT_METER_CHANGES = 1_024;
export const MAX_MIDI_IMPORT_META_PAYLOAD_BYTES = 1_024;
export const MAX_MIDI_IMPORT_METER_NUMERATOR = 32;
export const MAX_MIDI_IMPORT_METER_DENOMINATOR_POWER = 5;
export const MAX_MIDI_IMPORT_REQUEST_ID_ASCII_LENGTH = 128;
export const MIDI_IMPORT_REQUEST_ID_PATTERN_SOURCE = "^[A-Za-z0-9._-]{1,128}$";

/**
 * The simultaneity window is an EXACT tick bound derived from the file's
 * own tempo, never from wall-clock measurement: windowTicks =
 * floor(40000 · ppq / microsecondsPerQuarterAtAnchor). The 40 ms musical
 * constant sits inside the 30-60 ms band the design mandate names, and the
 * tempo in effect at a sonority's anchor tick governs its whole window.
 */
export const MIDI_IMPORT_SIMULTANEITY_WINDOW_MICROSECONDS = 40_000;

/**
 * Onset-quantization law, exact rational integers only. Each meter segment
 * starting at tick T0 with beatUnit 2^dd quantizes onsets to WHOLE BEATS:
 * with N = (t − T0)·beatUnit and D = ppq, the grid index is
 * floor((2N + D) / (2D)) — nearest beat, half-beat ties rounding up — and
 * the quantized tick is the exact rational (T0·beatUnit + index·ppq) /
 * beatUnit with error |t·beatUnit − numerator| over beatUnit ticks.
 *
 * The byte-pinned M0 fixtures are the authority for this beat-resolution
 * behavior (jcpe-rnm6 arbitration, resolved by M1 law §3.4 in
 * docs/M1_MIDI_IMPORT_AUTOMATION_CONTRACT.md): the constant below is a
 * DISPLAY grid for preview surfaces, not the implemented quantization
 * divisor. M1 spans never use this law at all — their boundaries are exact
 * bar/half/quarter-bar ticks.
 */
export const MIDI_IMPORT_GRID_DIVISIONS_PER_BEAT = 4;

/**
 * Canonical import spelling for pitch classes with no confident symbol:
 * the flat-preferring jazz convention, frozen as data. Key-aware
 * respelling belongs to later phases and never mutates this law.
 */
export const MIDI_IMPORT_CANONICAL_SPELLINGS = Object.freeze([
  Object.freeze({ step: "C", alter: 0 }),
  Object.freeze({ step: "D", alter: -1 }),
  Object.freeze({ step: "D", alter: 0 }),
  Object.freeze({ step: "E", alter: -1 }),
  Object.freeze({ step: "E", alter: 0 }),
  Object.freeze({ step: "F", alter: 0 }),
  Object.freeze({ step: "G", alter: -1 }),
  Object.freeze({ step: "G", alter: 0 }),
  Object.freeze({ step: "A", alter: -1 }),
  Object.freeze({ step: "A", alter: 0 }),
  Object.freeze({ step: "B", alter: -1 }),
  Object.freeze({ step: "B", alter: 0 }),
] as const) satisfies readonly SpelledPitchClass[];

export type MidiImportMatchKind = "exact" | "omitted-fifth";
export type MidiImportInversion = "root" | "slash";

/**
 * Reverse-T1 match template: a pitch-class-offset fingerprint bound to an
 * existing T1 formula rule id (plus realization id for the four altered
 * dominants and extension number for the ninth families). The table is the
 * closed v1 vocabulary; symbol TEXT rendering is deferred to the T0
 * formatter in the build phase so this packet cannot fork the grammar.
 */
export type MidiImportMatchTemplate = Readonly<{
  id: string;
  formulaRuleId: ChordFormulaRuleId;
  realizationId: AlteredDominantRealizationId | null;
  extensionNumber: 9 | null;
  pitchClassOffsets: readonly number[];
  omissibleFifth: boolean;
}>;

const template = (
  id: string,
  formulaRuleId: ChordFormulaRuleId,
  realizationId: AlteredDominantRealizationId | null,
  extensionNumber: 9 | null,
  pitchClassOffsets: readonly number[],
  omissibleFifth: boolean,
): MidiImportMatchTemplate =>
  Object.freeze({
    id,
    formulaRuleId,
    realizationId,
    extensionNumber,
    pitchClassOffsets: Object.freeze([...pitchClassOffsets]),
    omissibleFifth,
  });

/**
 * The frozen 24-entry template table, in ranking-tiebreak order. Every
 * formula rule id is drawn from the T1 CHORD_FORMULA_RULE_IDS vocabulary;
 * offsets are the pitch-class intervals of each family's frozen degree
 * set. "omissibleFifth" marks families whose perfect fifth (offset 7) may
 * be absent; structural fifths (b5/#5/dim) are never omissible.
 */
export const MIDI_IMPORT_MATCH_TEMPLATES = Object.freeze([
  template("M0-TPL-01", "base-power", null, null, [0, 7], false),
  template("M0-TPL-02", "base-major", null, null, [0, 4, 7], false),
  template("M0-TPL-03", "base-minor", null, null, [0, 3, 7], false),
  template("M0-TPL-04", "base-diminished", null, null, [0, 3, 6], false),
  template("M0-TPL-05", "base-augmented", null, null, [0, 4, 8], false),
  template("M0-TPL-06", "base-sus2", null, null, [0, 2, 7], false),
  template("M0-TPL-07", "base-sus4", null, null, [0, 5, 7], false),
  template("M0-TPL-08", "sixth-major", null, null, [0, 4, 7, 9], true),
  template("M0-TPL-09", "sixth-minor", null, null, [0, 3, 7, 9], true),
  template("M0-TPL-10", "seventh-major", null, null, [0, 4, 7, 11], true),
  template("M0-TPL-11", "seventh-dominant", null, null, [0, 4, 7, 10], true),
  template("M0-TPL-12", "seventh-minor", null, null, [0, 3, 7, 10], true),
  template("M0-TPL-13", "seventh-minor-major", null, null, [0, 3, 7, 11], true),
  template(
    "M0-TPL-14",
    "seventh-half-diminished",
    null,
    null,
    [0, 3, 6, 10],
    false,
  ),
  template("M0-TPL-15", "seventh-diminished", null, null, [0, 3, 6, 9], false),
  template(
    "M0-TPL-16",
    "seventh-augmented-major",
    null,
    null,
    [0, 4, 8, 11],
    false,
  ),
  template(
    "M0-TPL-17",
    "extension-suspended-dominant",
    null,
    null,
    [0, 5, 7, 10],
    true,
  ),
  template("M0-TPL-18", "extension-major", null, 9, [0, 2, 4, 7, 11], true),
  template("M0-TPL-19", "extension-dominant", null, 9, [0, 2, 4, 7, 10], true),
  template("M0-TPL-20", "extension-minor", null, 9, [0, 2, 3, 7, 10], true),
  template(
    "M0-TPL-21",
    "altered-dominant",
    "alt-b9-b5",
    null,
    [0, 1, 4, 6, 10],
    false,
  ),
  template(
    "M0-TPL-22",
    "altered-dominant",
    "alt-b9-sharp5",
    null,
    [0, 1, 4, 8, 10],
    false,
  ),
  template(
    "M0-TPL-23",
    "altered-dominant",
    "alt-sharp9-b5",
    null,
    [0, 3, 4, 6, 10],
    false,
  ),
  template(
    "M0-TPL-24",
    "altered-dominant",
    "alt-sharp9-sharp5",
    null,
    [0, 3, 4, 8, 10],
    false,
  ),
] as const);

/**
 * Reverse-resolution law. Candidate roots are exactly the pitch classes
 * present in the sonority (an absent root is never invented; a rootless
 * voicing resolves to what it literally contains). A template matches a
 * root exactly when the offset set equals its fingerprint, or as
 * "omitted-fifth" when the template is omissible and the offsets equal the
 * fingerprint minus offset 7. Alternatives sort by the frozen total order
 * (exact before omitted-fifth; root-position before slash; fewer template
 * tones first; table order; ascending root pitch class), and at most
 * MAX_MIDI_IMPORT_CHORD_ALTERNATIVES are reported with the true
 * totalMatches count. Zero matches yield the Custom outcome carrying the
 * literal canonical-spelled pitch classes, bass first — never an invented
 * name.
 */
export const MIDI_IMPORT_ALTERNATIVE_RANKING = Object.freeze([
  "exact-before-omitted-fifth",
  "root-position-before-slash",
  "fewer-template-tones",
  "template-table-order",
  "ascending-root-pitch-class",
] as const);
export const MAX_MIDI_IMPORT_CHORD_ALTERNATIVES = 8;

export const MIDI_IMPORT_REFUSAL_CODES = Object.freeze([
  "import.schema_invalid",
  "import.request_id_invalid",
  "limit.midi_import_bytes_exceeded",
  "smf.header_invalid",
  "smf.format_unsupported",
  "smf.track_count_invalid",
  "smf.division_smpte_unsupported",
  "smf.division_zero",
  "smf.chunk_invalid",
  "smf.chunk_truncated",
  "smf.delta_invalid",
  "smf.event_invalid",
  "smf.meta_unknown",
  "smf.meta_length_invalid",
  "smf.meta_oversized",
  "smf.tempo_zero",
  "smf.meter_invalid",
  "smf.end_of_track_invalid",
  "smf.conductor_meta_misplaced",
  "smf.note_overlap",
  "smf.note_off_unmatched",
  "smf.note_on_unterminated",
  "limit.midi_import_tracks_exceeded",
  "limit.midi_import_events_exceeded",
  "limit.midi_import_notes_exceeded",
  "limit.midi_import_tick_horizon_exceeded",
  "limit.midi_import_tempo_changes_exceeded",
  "limit.midi_import_meter_changes_exceeded",
] as const);
export type MidiImportRefusalCode =
  (typeof MIDI_IMPORT_REFUSAL_CODES)[number];

/**
 * Validation precedence. The three request-phase codes resolve first, in
 * list order. Byte-phase codes resolve by the streaming law: one
 * left-to-right pass, and the refusal whose detection byte offset is
 * smallest wins; the list order above is documentary for the impossible
 * equal-offset case. Header fields check in field order (tag/length,
 * format, track count then track limit, division SMPTE then zero).
 */
export const MIDI_IMPORT_VALIDATION_PRECEDENCE = Object.freeze([
  "request-phase-in-list-order",
  "byte-phase-earliest-detection-offset",
  "header-field-order",
] as const);

export type MidiImportRequest = Readonly<{
  schema: typeof MIDI_IMPORT_REQUEST_SCHEMA;
  requestId: string;
  readerId: typeof MIDI_IMPORT_READER_ID;
  readerVersion: typeof MIDI_IMPORT_READER_VERSION;
  /** Raw file bytes from the local File API; never a URL and never fetched. */
  bytes: Uint8Array;
}>;

export type MidiImportRefusal = PathRefusal<{
  code: MidiImportRefusalCode;
  /** Offset of the detection byte for byte-phase codes; boundary crossed for limits. */
  byteOffset: number | null;
  trackIndex: number | null;
  partialResult: false;
}>;

export type SmfHeaderModel = Readonly<{
  format: 0 | 1;
  trackCount: number;
  division: number;
}>;

export type SmfTempoEntry = Readonly<{
  tick: number;
  microsecondsPerQuarter: number;
}>;

export type SmfMeterEntry = Readonly<{
  tick: number;
  numerator: number;
  denominatorPower: number;
}>;

export type SmfPairedNote = Readonly<{
  channel: number;
  key: number;
  onTick: number;
  offTick: number;
  onVelocity: number;
}>;

export type SmfMarkerEntry = Readonly<{ tick: number; text: string }>;

export type SmfDecodedTrack = Readonly<{
  index: number;
  name: string | null;
  instrumentName: string | null;
  markers: readonly SmfMarkerEntry[];
  /** Sorted by (onTick, channel, key). Off velocity is declared non-retained. */
  notes: readonly SmfPairedNote[];
}>;

export type SmfIgnoredEvent = Readonly<{
  trackIndex: number;
  tick: number;
  kind: MidiImportIgnoredEventKind;
  byteOffset: number;
}>;

export type SmfAlienChunk = Readonly<{
  byteOffset: number;
  tag: string;
  dataLength: number;
}>;

/** Deterministic work/state/memory counters for one decode. */
export type SmfDecodeCounters = Readonly<{
  bytesRead: number;
  chunksSeen: number;
  eventsDecoded: number;
  eventsIgnored: number;
  notesPaired: number;
  peakOpenNotes: number;
  tempoChanges: number;
  meterChanges: number;
}>;

export type SmfDecodeModel = Readonly<{
  schema: typeof MIDI_IMPORT_DECODE_MODEL_SCHEMA;
  header: SmfHeaderModel;
  tempoMap: readonly SmfTempoEntry[];
  meterMap: readonly SmfMeterEntry[];
  tracks: readonly SmfDecodedTrack[];
  ignoredEvents: readonly SmfIgnoredEvent[];
  alienChunks: readonly SmfAlienChunk[];
  counters: SmfDecodeCounters;
}>;

export type MidiImportSonority = Readonly<{
  anchorTick: number;
  memberCount: number;
  bassMidi: number;
  bassPitchClass: PitchClass;
  pitchClasses: readonly PitchClass[];
  windowTicks: number;
  tempoMicrosecondsAtAnchor: number;
  segmentIndex: number;
  gridIndex: number;
  quantizedTickNumerator: number;
  quantizedTickDenominator: number;
  quantizationErrorNumerator: number;
  quantizationErrorDenominator: number;
  measureIndex: number;
}>;

export type MidiImportChordAlternative = Readonly<{
  templateId: string;
  formulaRuleId: ChordFormulaRuleId;
  realizationId: AlteredDominantRealizationId | null;
  extensionNumber: 9 | null;
  rootPitchClass: PitchClass;
  rootSpelled: SpelledPitchClass;
  bassPitchClass: PitchClass;
  inversion: MidiImportInversion;
  matchKind: MidiImportMatchKind;
  missingDegreeNumbers: readonly number[];
}>;

export type MidiImportResolutionOutcome =
  | Readonly<{
      kind: "alternatives";
      totalMatches: number;
      alternatives: readonly MidiImportChordAlternative[];
    }>
  | Readonly<{
      kind: "custom";
      bassPitchClass: PitchClass;
      spelledPitchClasses: readonly SpelledPitchClass[];
    }>;

export type MidiImportValue = Readonly<{
  schema: typeof MIDI_IMPORT_RESULT_SCHEMA;
  kind: "decoded";
  model: SmfDecodeModel;
  sonorities: readonly MidiImportSonority[];
  resolutions: readonly MidiImportResolutionOutcome[];
}>;

export type MidiImportResult =
  | Readonly<{ ok: true; value: MidiImportValue }>
  | Readonly<{ ok: false; refusal: MidiImportRefusal }>;

export interface DecodeSmf {
  (request: MidiImportRequest): MidiImportResult;
}

export interface MidiImportOperations {
  readonly decodeSmf: DecodeSmf;
}
