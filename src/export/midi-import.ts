import type { PitchClass, SpelledPitchClass } from "../domain";
import {
  MAX_MIDI_IMPORT_BYTES,
  MAX_MIDI_IMPORT_CHORD_ALTERNATIVES,
  MIDI_IMPORT_CANONICAL_SPELLINGS,
  MIDI_IMPORT_DEFAULT_METER_DENOMINATOR_POWER,
  MIDI_IMPORT_DEFAULT_METER_NUMERATOR,
  MIDI_IMPORT_DEFAULT_TEMPO_MICROSECONDS_PER_QUARTER,
  MIDI_IMPORT_IGNORED_EVENT_KINDS,
  MIDI_IMPORT_MATCH_TEMPLATES,
  MIDI_IMPORT_READER_ID,
  MIDI_IMPORT_READER_VERSION,
  MIDI_IMPORT_REFUSAL_CODES,
  MIDI_IMPORT_REQUEST_ID_PATTERN_SOURCE,
  MIDI_IMPORT_REQUEST_SCHEMA,
  MIDI_IMPORT_RESULT_SCHEMA,
  MIDI_IMPORT_SIMULTANEITY_WINDOW_MICROSECONDS,
  MIDI_IMPORT_DECODE_MODEL_SCHEMA,
  type MidiImportChordAlternative,
  type MidiImportIgnoredEventKind,
  type MidiImportMatchKind,
  type MidiImportRefusalCode,
  type MidiImportRequest,
  type MidiImportResolutionOutcome,
  type MidiImportResult,
  type MidiImportSonority,
  type SmfAlienChunk,
  type SmfDecodeModel,
  type SmfDecodedTrack,
  type SmfIgnoredEvent,
  type SmfMarkerEntry,
  type SmfMeterEntry,
  type SmfPairedNote,
  type SmfTempoEntry,
} from "./midi-import-contract";

/**
 * M0 deterministic Standard MIDI File import: the production pipeline.
 *
 * The byte layer is the Rust `smf_*` decoder compiled into the single embedded
 * wasm module. It is injected here as {@link SmfDecodeFrame} — a pure
 * bytes-in, `i32`-words-out function — so this module never imports the audio
 * layer that hosts the wasm instance, and so tests can drive the identical
 * pipeline over a frame produced by any conforming decoder.
 *
 * What lives here is everything the frozen contract types describe: request
 * validation, decode-model assembly (UTF-8 text with U+FFFD replacement, notes
 * sorted per track), the exact-integer sonority laws, and the reverse-T1
 * template resolver. All arithmetic is exact integer arithmetic on values well
 * inside the double-precision integer range; no measured time, no rounding of
 * musical quantities into floats.
 */

/**
 * The wasm boundary. `bytes` are the raw file bytes; the result is the tagged
 * `i32` record stream documented in `dsp/concert-grand/src/smf.rs`. Total: a
 * hostile file yields a refusal record rather than a throw.
 */
export type SmfDecodeFrame = (bytes: Uint8Array) => Int32Array;

/* Record tags, mirrored from dsp/concert-grand/src/smf.rs. */
const TAG_HEADER = 1;
const TAG_TEMPO = 2;
const TAG_METER = 3;
const TAG_TRACK = 4;
const TAG_MARKER = 5;
const TAG_NOTE = 6;
const TAG_IGNORED = 7;
const TAG_ALIEN = 8;
const TAG_COUNTERS = 9;
const TAG_REFUSAL = 10;

const REQUEST_ID_PATTERN = new RegExp(MIDI_IMPORT_REQUEST_ID_PATTERN_SOURCE, "u");

/** Pitch classes as their own literal type, so no cast is needed to narrow. */
const PITCH_CLASSES = Object.freeze([
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
] as const) satisfies readonly PitchClass[];

function pitchClassOf(value: number): PitchClass {
  /* The modulo is total over every finite input, so index 0 is unreachable
   * as a fallback and exists only to satisfy the checked-index rule. */
  return PITCH_CLASSES[((value % 12) + 12) % 12] ?? PITCH_CLASSES[0];
}

function canonicalSpelling(pitchClass: PitchClass): SpelledPitchClass {
  return MIDI_IMPORT_CANONICAL_SPELLINGS[pitchClass];
}

function refuse(
  code: MidiImportRefusalCode,
  path: readonly (string | number)[],
  byteOffset: number | null,
  trackIndex: number | null,
): MidiImportResult {
  return Object.freeze({
    ok: false as const,
    refusal: Object.freeze({
      code,
      path: Object.freeze([...path]),
      byteOffset,
      trackIndex,
      partialResult: false as const,
    }),
  });
}

/* ------------------------------------------------------------------ *
 * Frame reader                                                        *
 * ------------------------------------------------------------------ */

type FrameRecord = Readonly<{ tag: number; payload: readonly number[] }>;

function readFrame(frame: Int32Array): readonly FrameRecord[] {
  const records: FrameRecord[] = [];
  let index = 0;
  while (index + 1 < frame.length) {
    const tag = frame[index] ?? 0;
    const length = frame[index + 1] ?? 0;
    if (length < 0 || index + 2 + length > frame.length) break;
    const payload: number[] = [];
    for (let offset = 0; offset < length; offset += 1) {
      payload.push(frame[index + 2 + offset] ?? 0);
    }
    records.push({ tag, payload });
    index += 2 + length;
  }
  return records;
}

const utf8Decoder = new TextDecoder("utf-8");

/**
 * Consumed meta text decodes as UTF-8 with U+FFFD replacement. The bytes are
 * never evaluated, parsed as markup, or trusted as a length.
 */
function decodeText(
  bytes: Uint8Array,
  offset: number,
  length: number,
): string {
  if (offset < 0 || length <= 0) return "";
  const end = Math.min(bytes.byteLength, offset + length);
  if (offset >= end) return "";
  return utf8Decoder.decode(bytes.subarray(offset, end));
}

/* ------------------------------------------------------------------ *
 * Decode-model assembly                                               *
 * ------------------------------------------------------------------ */

type MutableTrack = {
  index: number;
  name: string | null;
  instrumentName: string | null;
  markers: SmfMarkerEntry[];
  notes: SmfPairedNote[];
};

function compareNotes(left: SmfPairedNote, right: SmfPairedNote): number {
  if (left.onTick !== right.onTick) return left.onTick - right.onTick;
  if (left.channel !== right.channel) return left.channel - right.channel;
  return left.key - right.key;
}

function buildModel(
  records: readonly FrameRecord[],
  bytes: Uint8Array,
): SmfDecodeModel | null {
  let header: SmfDecodeModel["header"] | null = null;
  let counters: SmfDecodeModel["counters"] | null = null;
  const tempoMap: SmfTempoEntry[] = [];
  const meterMap: SmfMeterEntry[] = [];
  const ignoredEvents: SmfIgnoredEvent[] = [];
  const alienChunks: SmfAlienChunk[] = [];
  const markersByTrack = new Map<number, SmfMarkerEntry[]>();
  const notesByTrack = new Map<number, SmfPairedNote[]>();
  const trackOrder: MutableTrack[] = [];

  const markersFor = (trackIndex: number): SmfMarkerEntry[] => {
    const existing = markersByTrack.get(trackIndex);
    if (existing !== undefined) return existing;
    const created: SmfMarkerEntry[] = [];
    markersByTrack.set(trackIndex, created);
    return created;
  };
  const notesFor = (trackIndex: number): SmfPairedNote[] => {
    const existing = notesByTrack.get(trackIndex);
    if (existing !== undefined) return existing;
    const created: SmfPairedNote[] = [];
    notesByTrack.set(trackIndex, created);
    return created;
  };

  for (const record of records) {
    const payload = record.payload;
    switch (record.tag) {
      case TAG_HEADER: {
        const format = payload[0] ?? 0;
        header = Object.freeze({
          format: format === 0 ? (0 as const) : (1 as const),
          trackCount: payload[1] ?? 0,
          division: payload[2] ?? 1,
        });
        break;
      }
      case TAG_TEMPO:
        tempoMap.push(
          Object.freeze({
            tick: payload[0] ?? 0,
            microsecondsPerQuarter: payload[1] ?? 1,
          }),
        );
        break;
      case TAG_METER:
        meterMap.push(
          Object.freeze({
            tick: payload[0] ?? 0,
            numerator: payload[1] ?? 1,
            denominatorPower: payload[2] ?? 0,
          }),
        );
        break;
      case TAG_MARKER:
        markersFor(payload[0] ?? 0).push(
          Object.freeze({
            tick: payload[1] ?? 0,
            text: decodeText(bytes, payload[2] ?? -1, payload[3] ?? 0),
          }),
        );
        break;
      case TAG_NOTE:
        notesFor(payload[0] ?? 0).push(
          Object.freeze({
            channel: payload[1] ?? 0,
            key: payload[2] ?? 0,
            onTick: payload[3] ?? 0,
            offTick: payload[4] ?? 0,
            onVelocity: payload[5] ?? 0,
          }),
        );
        break;
      case TAG_IGNORED: {
        const kind: MidiImportIgnoredEventKind =
          MIDI_IMPORT_IGNORED_EVENT_KINDS[payload[2] ?? 0] ?? "text";
        ignoredEvents.push(
          Object.freeze({
            trackIndex: payload[0] ?? 0,
            tick: payload[1] ?? 0,
            kind,
            byteOffset: payload[3] ?? 0,
          }),
        );
        break;
      }
      case TAG_ALIEN:
        alienChunks.push(
          Object.freeze({
            byteOffset: payload[0] ?? 0,
            tag: String.fromCharCode(
              payload[1] ?? 0,
              payload[2] ?? 0,
              payload[3] ?? 0,
              payload[4] ?? 0,
            ),
            dataLength: payload[5] ?? 0,
          }),
        );
        break;
      case TAG_TRACK: {
        const index = payload[0] ?? 0;
        const nameOffset = payload[1] ?? -1;
        const instrumentOffset = payload[3] ?? -1;
        trackOrder.push({
          index,
          name:
            nameOffset < 0
              ? null
              : decodeText(bytes, nameOffset, payload[2] ?? 0),
          instrumentName:
            instrumentOffset < 0
              ? null
              : decodeText(bytes, instrumentOffset, payload[4] ?? 0),
          markers: markersFor(index),
          notes: notesFor(index),
        });
        break;
      }
      case TAG_COUNTERS:
        counters = Object.freeze({
          bytesRead: payload[0] ?? 0,
          chunksSeen: payload[1] ?? 0,
          eventsDecoded: payload[2] ?? 0,
          eventsIgnored: payload[3] ?? 0,
          notesPaired: payload[4] ?? 0,
          peakOpenNotes: payload[5] ?? 0,
          tempoChanges: payload[6] ?? 0,
          meterChanges: payload[7] ?? 0,
        });
        break;
      default:
        break;
    }
  }

  if (header === null || counters === null) return null;

  const tracks: SmfDecodedTrack[] = trackOrder.map((track) =>
    Object.freeze({
      index: track.index,
      name: track.name,
      instrumentName: track.instrumentName,
      markers: Object.freeze([...track.markers]),
      notes: Object.freeze([...track.notes].sort(compareNotes)),
    }),
  );

  return Object.freeze({
    schema: MIDI_IMPORT_DECODE_MODEL_SCHEMA,
    header,
    tempoMap: Object.freeze(tempoMap),
    meterMap: Object.freeze(meterMap),
    tracks: Object.freeze(tracks),
    ignoredEvents: Object.freeze(ignoredEvents),
    alienChunks: Object.freeze(alienChunks),
    counters,
  });
}

/* ------------------------------------------------------------------ *
 * Sonority laws                                                       *
 * ------------------------------------------------------------------ */

type MergedNote = Readonly<{
  trackIndex: number;
  channel: number;
  key: number;
  onTick: number;
}>;

export type MidiImportMeterSegment = Readonly<{
  startTick: number;
  numerator: number;
  beatUnit: number;
  /** Global measure index of this segment's first measure. */
  baseMeasureIndex: number;
}>;

type MeterSegment = MidiImportMeterSegment;

/**
 * Meter segments start at tick 0 — with the SMF default 4/4 when the file
 * declares nothing there — and at every time-signature tick, which always
 * begins a new measure. Segment measure counts are exact ceilings, so a
 * meter change mid-measure still opens a fresh bar.
 */
function buildMeterSegments(
  meterMap: readonly SmfMeterEntry[],
  ppq: number,
): readonly MeterSegment[] {
  const entries =
    meterMap.length > 0 && (meterMap[0]?.tick ?? 0) === 0
      ? meterMap
      : [
          {
            tick: 0,
            numerator: MIDI_IMPORT_DEFAULT_METER_NUMERATOR,
            denominatorPower: MIDI_IMPORT_DEFAULT_METER_DENOMINATOR_POWER,
          },
          ...meterMap,
        ];
  const segments: MeterSegment[] = [];
  let baseMeasureIndex = 0;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry === undefined) continue;
    const beatUnit = 2 ** entry.denominatorPower;
    segments.push({
      startTick: entry.tick,
      numerator: entry.numerator,
      beatUnit,
      baseMeasureIndex,
    });
    const next = entries[index + 1];
    if (next === undefined) continue;
    const span = next.tick - entry.tick;
    const measureNumerator = entry.numerator * ppq * 4;
    baseMeasureIndex += Math.ceil((span * beatUnit) / measureNumerator);
  }
  return Object.freeze(segments);
}

/** The model's meter segmentation, for consumers that lay out measures. */
export function meterSegmentsOf(
  model: SmfDecodeModel,
): readonly MidiImportMeterSegment[] {
  return buildMeterSegments(model.meterMap, model.header.division);
}

function segmentIndexAt(
  segments: readonly MeterSegment[],
  tick: number,
): number {
  let found = 0;
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (segment === undefined) continue;
    if (segment.startTick <= tick) found = index;
  }
  return found;
}

function tempoAt(tempoMap: readonly SmfTempoEntry[], tick: number): number {
  let value = MIDI_IMPORT_DEFAULT_TEMPO_MICROSECONDS_PER_QUARTER;
  for (const entry of tempoMap) {
    if (entry.tick <= tick) value = entry.microsecondsPerQuarter;
  }
  return value;
}

/**
 * Groups a decoded model's merged note stream into anchored vertical
 * sonorities and stamps each with its exact grid, window, and measure
 * evidence. Exported so the sonority laws can be proved directly against
 * independently authored note streams, without a byte layer in the way.
 */
export function groupSonorities(
  model: SmfDecodeModel,
): readonly MidiImportSonority[] {
  const ppq = model.header.division;
  const merged: MergedNote[] = [];
  for (const track of model.tracks) {
    for (const note of track.notes) {
      merged.push({
        trackIndex: track.index,
        channel: note.channel,
        key: note.key,
        onTick: note.onTick,
      });
    }
  }
  merged.sort((left, right) => {
    if (left.onTick !== right.onTick) return left.onTick - right.onTick;
    if (left.trackIndex !== right.trackIndex)
      return left.trackIndex - right.trackIndex;
    if (left.channel !== right.channel) return left.channel - right.channel;
    return left.key - right.key;
  });

  const segments = buildMeterSegments(model.meterMap, ppq);
  const sonorities: MidiImportSonority[] = [];
  let cursor = 0;
  while (cursor < merged.length) {
    const anchor = merged[cursor];
    if (anchor === undefined) break;
    const anchorTick = anchor.onTick;
    const microseconds = tempoAt(model.tempoMap, anchorTick);
    /*
     * The simultaneity window is an exact tick bound derived from the file's
     * own tempo at this anchor, never a wall-clock measurement. Windows are
     * anchored, never chained: a note 40 ms past the anchor opens the next
     * sonority even if it is within 40 ms of the previous member.
     */
    const windowTicks = Math.floor(
      (MIDI_IMPORT_SIMULTANEITY_WINDOW_MICROSECONDS * ppq) / microseconds,
    );
    let end = cursor;
    while (end < merged.length) {
      const candidate = merged[end];
      if (candidate === undefined) break;
      if (candidate.onTick - anchorTick > windowTicks) break;
      end += 1;
    }

    let bassMidi = Number.POSITIVE_INFINITY;
    const present = new Set<number>();
    for (let index = cursor; index < end; index += 1) {
      const note = merged[index];
      if (note === undefined) continue;
      if (note.key < bassMidi) bassMidi = note.key;
      present.add(((note.key % 12) + 12) % 12);
    }
    const pitchClasses = Object.freeze(
      [...present].sort((left, right) => left - right).map(pitchClassOf),
    );

    const segmentIndex = segmentIndexAt(segments, anchorTick);
    const segment = segments[segmentIndex] ?? {
      startTick: 0,
      numerator: MIDI_IMPORT_DEFAULT_METER_NUMERATOR,
      beatUnit: 4,
      baseMeasureIndex: 0,
    };
    const beatUnit = segment.beatUnit;
    const scaled = (anchorTick - segment.startTick) * beatUnit;
    const gridIndex = Math.floor((2 * scaled + ppq) / (2 * ppq));
    const quantizedTickNumerator =
      segment.startTick * beatUnit + gridIndex * ppq;
    const quantizationErrorNumerator = Math.abs(
      anchorTick * beatUnit - quantizedTickNumerator,
    );
    const measureNumerator = segment.numerator * ppq * 4;
    const measureIndex =
      segment.baseMeasureIndex +
      Math.floor(((anchorTick - segment.startTick) * beatUnit) / measureNumerator);

    sonorities.push(
      Object.freeze({
        anchorTick,
        memberCount: end - cursor,
        bassMidi: Number.isFinite(bassMidi) ? bassMidi : 0,
        bassPitchClass: pitchClassOf(
          Number.isFinite(bassMidi) ? bassMidi : 0,
        ),
        pitchClasses,
        windowTicks,
        tempoMicrosecondsAtAnchor: microseconds,
        segmentIndex,
        gridIndex,
        quantizedTickNumerator,
        quantizedTickDenominator: beatUnit,
        quantizationErrorNumerator,
        quantizationErrorDenominator: beatUnit,
        measureIndex,
      }),
    );
    cursor = end;
  }
  return Object.freeze(sonorities);
}

/* ------------------------------------------------------------------ *
 * Reverse-T1 resolution                                               *
 * ------------------------------------------------------------------ */

type RankedAlternative = Readonly<{
  alternative: MidiImportChordAlternative;
  templateOrder: number;
  templateTones: number;
}>;

function sameOffsets(
  offsets: readonly number[],
  fingerprint: readonly number[],
): boolean {
  if (offsets.length !== fingerprint.length) return false;
  for (let index = 0; index < offsets.length; index += 1) {
    if (offsets[index] !== fingerprint[index]) return false;
  }
  return true;
}

/**
 * Candidate roots are exactly the pitch classes the sonority contains: an
 * absent root is never invented, so a rootless voicing resolves to what it
 * literally holds. Zero matches yield the Custom outcome carrying the literal
 * canonical-spelled pitch classes, bass first — never an invented name.
 */
export function resolveSonority(
  pitchClasses: readonly PitchClass[],
  bassPitchClass: PitchClass,
): MidiImportResolutionOutcome {
  const ranked: RankedAlternative[] = [];
  for (const root of pitchClasses) {
    const offsets = [...pitchClasses]
      .map((pitchClass) => (pitchClass - root + 12) % 12)
      .sort((left, right) => left - right);
    for (
      let templateIndex = 0;
      templateIndex < MIDI_IMPORT_MATCH_TEMPLATES.length;
      templateIndex += 1
    ) {
      const template = MIDI_IMPORT_MATCH_TEMPLATES[templateIndex];
      if (template === undefined) continue;
      let matchKind: MidiImportMatchKind | null = null;
      if (sameOffsets(offsets, template.pitchClassOffsets)) {
        matchKind = "exact";
      } else if (template.omissibleFifth) {
        const withoutFifth = template.pitchClassOffsets.filter(
          (offset) => offset !== 7,
        );
        if (sameOffsets(offsets, withoutFifth)) matchKind = "omitted-fifth";
      }
      if (matchKind === null) continue;
      ranked.push({
        templateOrder: templateIndex,
        templateTones: template.pitchClassOffsets.length,
        alternative: Object.freeze({
          templateId: template.id,
          formulaRuleId: template.formulaRuleId,
          realizationId: template.realizationId,
          extensionNumber: template.extensionNumber,
          rootPitchClass: root,
          rootSpelled: canonicalSpelling(root),
          bassPitchClass,
          inversion: root === bassPitchClass ? "root" : "slash",
          matchKind,
          missingDegreeNumbers: Object.freeze(
            matchKind === "omitted-fifth" ? [5] : [],
          ),
        }),
      });
    }
  }

  if (ranked.length === 0) {
    const ascending = [...pitchClasses].sort((left, right) => left - right);
    const bassPosition = ascending.indexOf(bassPitchClass);
    const rotated =
      bassPosition <= 0
        ? ascending
        : [...ascending.slice(bassPosition), ...ascending.slice(0, bassPosition)];
    return Object.freeze({
      kind: "custom" as const,
      bassPitchClass,
      spelledPitchClasses: Object.freeze(rotated.map(canonicalSpelling)),
    });
  }

  ranked.sort((left, right) => {
    const leftExact = left.alternative.matchKind === "exact" ? 0 : 1;
    const rightExact = right.alternative.matchKind === "exact" ? 0 : 1;
    if (leftExact !== rightExact) return leftExact - rightExact;
    const leftRoot = left.alternative.inversion === "root" ? 0 : 1;
    const rightRoot = right.alternative.inversion === "root" ? 0 : 1;
    if (leftRoot !== rightRoot) return leftRoot - rightRoot;
    if (left.templateTones !== right.templateTones)
      return left.templateTones - right.templateTones;
    if (left.templateOrder !== right.templateOrder)
      return left.templateOrder - right.templateOrder;
    return left.alternative.rootPitchClass - right.alternative.rootPitchClass;
  });

  return Object.freeze({
    kind: "alternatives" as const,
    totalMatches: ranked.length,
    alternatives: Object.freeze(
      ranked
        .slice(0, MAX_MIDI_IMPORT_CHORD_ALTERNATIVES)
        .map((entry) => entry.alternative),
    ),
  });
}

/* ------------------------------------------------------------------ *
 * Public operation                                                    *
 * ------------------------------------------------------------------ */

/**
 * Runs the frozen M0 decode: request validation, the injected byte decode,
 * decode-model assembly, sonority grouping, and reverse-T1 resolution. Total
 * over every input — a hostile file, a malformed request, or an oversized
 * payload all resolve to a structured refusal.
 */
export function decodeSmfWith(
  decodeFrame: SmfDecodeFrame,
  request: MidiImportRequest,
): MidiImportResult {
  /*
   * The envelope is validated at runtime, not merely by its declared type:
   * callers reach this operation from a file picker and from decoded JSON, so
   * a widened view is what makes the three schema checks real work rather
   * than statements the compiler has already proved.
   */
  const envelope: Readonly<{
    schema: string;
    readerId: string;
    readerVersion: number;
  }> = request;
  if (envelope.schema !== MIDI_IMPORT_REQUEST_SCHEMA) {
    return refuse("import.schema_invalid", ["schema"], null, null);
  }
  if (envelope.readerId !== MIDI_IMPORT_READER_ID) {
    return refuse("import.schema_invalid", ["readerId"], null, null);
  }
  if (envelope.readerVersion !== MIDI_IMPORT_READER_VERSION) {
    return refuse("import.schema_invalid", ["readerVersion"], null, null);
  }
  if (!REQUEST_ID_PATTERN.test(request.requestId)) {
    return refuse("import.request_id_invalid", ["requestId"], null, null);
  }
  if (request.bytes.byteLength > MAX_MIDI_IMPORT_BYTES) {
    return refuse(
      "limit.midi_import_bytes_exceeded",
      ["bytes"],
      MAX_MIDI_IMPORT_BYTES,
      null,
    );
  }

  const frame = decodeFrame(request.bytes);
  const records = readFrame(frame);
  const first = records[0];
  if (first !== undefined && first.tag === TAG_REFUSAL) {
    const code =
      MIDI_IMPORT_REFUSAL_CODES[first.payload[0] ?? 3] ?? "smf.header_invalid";
    const byteOffset = first.payload[1] ?? -1;
    const trackIndex = first.payload[2] ?? -1;
    /*
     * Byte-phase refusals carry no request pointer: the offending value is a
     * byte offset in the file, not a field of the request envelope.
     */
    return refuse(
      code,
      [],
      byteOffset < 0 ? null : byteOffset,
      trackIndex < 0 ? null : trackIndex,
    );
  }

  const model = buildModel(records, request.bytes);
  if (model === null) {
    /*
     * A frame without a header or counters record cannot come from the
     * decoder: it means the injected boundary is not the M0 decoder at all.
     * Refusing keeps the operation total instead of publishing a half model.
     */
    return refuse("smf.header_invalid", [], 0, null);
  }

  const sonorities = groupSonorities(model);
  const resolutions = Object.freeze(
    sonorities.map((sonority) =>
      resolveSonority(sonority.pitchClasses, sonority.bassPitchClass),
    ),
  );

  return Object.freeze({
    ok: true as const,
    value: Object.freeze({
      schema: MIDI_IMPORT_RESULT_SCHEMA,
      kind: "decoded" as const,
      model,
      sonorities,
      resolutions,
    }),
  });
}

/** Binds an injected byte decoder into the frozen `DecodeSmf` operation. */
export function createMidiImportOperations(
  decodeFrame: SmfDecodeFrame,
): Readonly<{ decodeSmf: (request: MidiImportRequest) => MidiImportResult }> {
  return Object.freeze({
    decodeSmf: (request: MidiImportRequest) =>
      decodeSmfWith(decodeFrame, request),
  });
}
