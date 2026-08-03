/**
 * M0 MIDI import contract validator.
 *
 * Independent authority check for the fixtures under
 * tests/fixtures/midi-import/. This script never imports src/ and restates
 * every frozen constant locally, exactly like the F2 and E1 validators it
 * is modeled on. It carries its own freshly written reference
 * implementations of the three frozen M0 laws:
 *
 *  1. a TOTAL streaming SMF decoder (header/track chunks, running status,
 *     VLQs, tempo/meter meta, note pairing, tolerated-event ledgers, and
 *     deterministic work/state/memory counters) in which every hostile
 *     input maps to a structured refusal code and detection byte offset;
 *  2. the exact-integer sonority laws (the floor(40000*ppq/us) tempo-tick
 *     simultaneity window, the rational onset-quantization grid, and the
 *     meter-segment measure map);
 *  3. the reverse-T1 template matcher over the frozen 24-entry table,
 *     yielding ranked plural alternatives or the literal Custom pitch set.
 *
 * Every golden is proven two independent ways: its (possibly repeat-
 * expanded) bytes are parsed by the reference decoder and diffed against
 * the expected model and counters, and the decoded notes are then pushed
 * through the reference grouping and matching laws and diffed against the
 * expected sonorities and resolutions. Every refusal case must produce
 * exactly the frozen code, byte offset, and track index. M0-GLD-001 is
 * additionally pinned byte-for-byte against the accepted E1 writer golden
 * E1-GLD-001, seeding the import(export(doc)) round-trip law.
 *
 * Registration in scripts/verify.ts is the orchestrator's landing
 * decision, not this packet's: the intended slot is the contract-validator
 * band beside validate:e1-contract, and until that landing the only
 * callers are the package.json script "validate:m0-contract" and
 * tests/static/m0-contract.test.ts.
 */
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type JsonObject = Record<string, unknown>;

export type M0ContractFinding = Readonly<{
  code: string;
  path: string;
  message: string;
}>;

export type M0ContractValidationReport = Readonly<{
  schema: "changes.validation.m0-contract.v1";
  package: "M0";
  outcome: "pass" | "fail";
  counts: Readonly<{
    files: number;
    goldenCases: number;
    refusalCases: number;
    sonorityCases: number;
    resolutionCases: number;
    mutationControls: number;
    traces: number;
    authorities: number;
  }>;
  findings: readonly M0ContractFinding[];
}>;

export const M0_FINDING_CODES = Object.freeze([
  "M0_FILES",
  "M0_SCHEMA",
  "M0_MANIFEST",
  "M0_CASE",
  "M0_GOLDEN",
  "M0_COUNTER",
  "M0_SONORITY",
  "M0_RESOLUTION",
  "M0_REFUSAL",
  "M0_E1PIN",
  "M0_TRACE",
  "M0_PROVENANCE",
] as const);

export const M0_FIXTURE_FILES = Object.freeze([
  "m0-midi-import-contract.json",
  "golden-cases.json",
  "refusal-cases.json",
  "sonority-cases.json",
  "resolution-cases.json",
  "mutation-controls.json",
  "provenance-ledger.json",
  "trace-ledger.json",
] as const);

const DEFAULT_FIXTURE_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../tests/fixtures/midi-import",
);

/** Locally restated frozen constants; the src module never certifies itself. */
const LOCAL = Object.freeze({
  contractSchema: "changes.import.midi-import-contract.v1",
  requestSchema: "changes.import.midi-import-request.v1",
  resultSchema: "changes.import.midi-import-result.v1",
  decodeModelSchema: "changes.import.smf-decode-model.v1",
  sonorityReportSchema: "changes.import.sonority-report.v1",
  resolutionReportSchema: "changes.import.reverse-resolution-report.v1",
  readerId: "changes.midi-import",
  readerVersion: 1,
  readerVersionTag: "changes.midi-import.v1",
  operationNames: ["decodeSmf", "groupSonorities", "inferChordSymbols"],
  acceptedFormats: [0, 1],
  minPpq: 1,
  maxPpq: 32767,
  defaultTempo: 500_000,
  defaultMeterNumerator: 4,
  defaultMeterDenominatorPower: 2,
  maxVlqBytes: 4,
  maxVlqValue: 0x0f_ff_ff_ff,
  maxBytes: 4_194_304,
  maxTracks: 64,
  maxEvents: 524_288,
  maxNotes: 131_072,
  maxTickHorizon: 1_073_741_823,
  maxTempoChanges: 4_096,
  maxMeterChanges: 1_024,
  maxMetaPayloadBytes: 1_024,
  maxMeterNumerator: 32,
  maxMeterDenominatorPower: 5,
  maxRequestIdAsciiLength: 128,
  requestIdPattern: /^[A-Za-z0-9._-]{1,128}$/u,
  requestIdPatternSource: "^[A-Za-z0-9._-]{1,128}$",
  windowMicroseconds: 40_000,
  gridDivisionsPerBeat: 4,
  maxAlternatives: 8,
});

const CONSUMED_META = Object.freeze({
  trackName: 0x03,
  instrumentName: 0x04,
  marker: 0x06,
  endOfTrack: 0x2f,
  setTempo: 0x51,
  timeSignature: 0x58,
});

const TOLERATED_META: ReadonlyMap<number, string> = new Map([
  [0x00, "sequence-number"],
  [0x01, "text"],
  [0x02, "copyright"],
  [0x05, "lyric"],
  [0x07, "cue-point"],
  [0x20, "channel-prefix"],
  [0x21, "midi-port"],
  [0x54, "smpte-offset"],
  [0x59, "key-signature"],
  [0x7f, "sequencer-specific"],
]);

const FIXED_META_LENGTHS: ReadonlyMap<number, number> = new Map([
  [0x51, 3],
  [0x58, 4],
  [0x2f, 0],
  [0x20, 1],
  [0x21, 1],
  [0x54, 5],
  [0x59, 2],
]);

const SEQUENCE_NUMBER_LENGTHS = Object.freeze([0, 2] as const);

const IGNORED_EVENT_KINDS = Object.freeze([
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

const CHANNEL_EVENT_KINDS: ReadonlyMap<number, string> = new Map([
  [0xa0, "poly-aftertouch"],
  [0xb0, "control-change"],
  [0xc0, "program-change"],
  [0xd0, "channel-aftertouch"],
  [0xe0, "pitch-bend"],
]);

const REFUSAL_CODES = Object.freeze([
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

const RANKING = Object.freeze([
  "exact-before-omitted-fifth",
  "root-position-before-slash",
  "fewer-template-tones",
  "template-table-order",
  "ascending-root-pitch-class",
] as const);

const CANONICAL_SPELLINGS = Object.freeze([
  { step: "C", alter: 0 },
  { step: "D", alter: -1 },
  { step: "D", alter: 0 },
  { step: "E", alter: -1 },
  { step: "E", alter: 0 },
  { step: "F", alter: 0 },
  { step: "G", alter: -1 },
  { step: "G", alter: 0 },
  { step: "A", alter: -1 },
  { step: "A", alter: 0 },
  { step: "B", alter: -1 },
  { step: "B", alter: 0 },
] as const);

type LocalTemplate = Readonly<{
  id: string;
  formulaRuleId: string;
  realizationId: string | null;
  extensionNumber: number | null;
  pitchClassOffsets: readonly number[];
  omissibleFifth: boolean;
}>;

const TEMPLATES: readonly LocalTemplate[] = Object.freeze([
  { id: "M0-TPL-01", formulaRuleId: "base-power", realizationId: null, extensionNumber: null, pitchClassOffsets: [0, 7], omissibleFifth: false },
  { id: "M0-TPL-02", formulaRuleId: "base-major", realizationId: null, extensionNumber: null, pitchClassOffsets: [0, 4, 7], omissibleFifth: false },
  { id: "M0-TPL-03", formulaRuleId: "base-minor", realizationId: null, extensionNumber: null, pitchClassOffsets: [0, 3, 7], omissibleFifth: false },
  { id: "M0-TPL-04", formulaRuleId: "base-diminished", realizationId: null, extensionNumber: null, pitchClassOffsets: [0, 3, 6], omissibleFifth: false },
  { id: "M0-TPL-05", formulaRuleId: "base-augmented", realizationId: null, extensionNumber: null, pitchClassOffsets: [0, 4, 8], omissibleFifth: false },
  { id: "M0-TPL-06", formulaRuleId: "base-sus2", realizationId: null, extensionNumber: null, pitchClassOffsets: [0, 2, 7], omissibleFifth: false },
  { id: "M0-TPL-07", formulaRuleId: "base-sus4", realizationId: null, extensionNumber: null, pitchClassOffsets: [0, 5, 7], omissibleFifth: false },
  { id: "M0-TPL-08", formulaRuleId: "sixth-major", realizationId: null, extensionNumber: null, pitchClassOffsets: [0, 4, 7, 9], omissibleFifth: true },
  { id: "M0-TPL-09", formulaRuleId: "sixth-minor", realizationId: null, extensionNumber: null, pitchClassOffsets: [0, 3, 7, 9], omissibleFifth: true },
  { id: "M0-TPL-10", formulaRuleId: "seventh-major", realizationId: null, extensionNumber: null, pitchClassOffsets: [0, 4, 7, 11], omissibleFifth: true },
  { id: "M0-TPL-11", formulaRuleId: "seventh-dominant", realizationId: null, extensionNumber: null, pitchClassOffsets: [0, 4, 7, 10], omissibleFifth: true },
  { id: "M0-TPL-12", formulaRuleId: "seventh-minor", realizationId: null, extensionNumber: null, pitchClassOffsets: [0, 3, 7, 10], omissibleFifth: true },
  { id: "M0-TPL-13", formulaRuleId: "seventh-minor-major", realizationId: null, extensionNumber: null, pitchClassOffsets: [0, 3, 7, 11], omissibleFifth: true },
  { id: "M0-TPL-14", formulaRuleId: "seventh-half-diminished", realizationId: null, extensionNumber: null, pitchClassOffsets: [0, 3, 6, 10], omissibleFifth: false },
  { id: "M0-TPL-15", formulaRuleId: "seventh-diminished", realizationId: null, extensionNumber: null, pitchClassOffsets: [0, 3, 6, 9], omissibleFifth: false },
  { id: "M0-TPL-16", formulaRuleId: "seventh-augmented-major", realizationId: null, extensionNumber: null, pitchClassOffsets: [0, 4, 8, 11], omissibleFifth: false },
  { id: "M0-TPL-17", formulaRuleId: "extension-suspended-dominant", realizationId: null, extensionNumber: null, pitchClassOffsets: [0, 5, 7, 10], omissibleFifth: true },
  { id: "M0-TPL-18", formulaRuleId: "extension-major", realizationId: null, extensionNumber: 9, pitchClassOffsets: [0, 2, 4, 7, 11], omissibleFifth: true },
  { id: "M0-TPL-19", formulaRuleId: "extension-dominant", realizationId: null, extensionNumber: 9, pitchClassOffsets: [0, 2, 4, 7, 10], omissibleFifth: true },
  { id: "M0-TPL-20", formulaRuleId: "extension-minor", realizationId: null, extensionNumber: 9, pitchClassOffsets: [0, 2, 3, 7, 10], omissibleFifth: true },
  { id: "M0-TPL-21", formulaRuleId: "altered-dominant", realizationId: "alt-b9-b5", extensionNumber: null, pitchClassOffsets: [0, 1, 4, 6, 10], omissibleFifth: false },
  { id: "M0-TPL-22", formulaRuleId: "altered-dominant", realizationId: "alt-b9-sharp5", extensionNumber: null, pitchClassOffsets: [0, 1, 4, 8, 10], omissibleFifth: false },
  { id: "M0-TPL-23", formulaRuleId: "altered-dominant", realizationId: "alt-sharp9-b5", extensionNumber: null, pitchClassOffsets: [0, 3, 4, 6, 10], omissibleFifth: false },
  { id: "M0-TPL-24", formulaRuleId: "altered-dominant", realizationId: "alt-sharp9-sharp5", extensionNumber: null, pitchClassOffsets: [0, 3, 4, 8, 10], omissibleFifth: false },
]);

const EVIDENCE_OWNER_PATTERN =
  /^tests\/(?:unit|integration)\/[a-z0-9-]+\.test\.ts$/u;
const STATIC_EVIDENCE_OWNER = "tests/static/m0-contract.test.ts";
const E1_GOLDEN_FIXTURE_RELATIVE = "../midi-export/golden-cases.json";
const E1_PIN_CASE_ID = "E1-GLD-001";
const M0_PIN_CASE_ID = "M0-GLD-001";

class Findings {
  readonly list: M0ContractFinding[] = [];
  add(code: string, path: string, message: string): void {
    this.list.push({ code, path, message });
  }
  equal(
    code: string,
    path: string,
    actual: unknown,
    expected: unknown,
    label: string,
  ): void {
    const left = canonical(actual);
    const right = canonical(expected);
    if (left !== right) {
      this.add(code, path, `${label}: expected ${right}, recomputed ${left}`);
    }
  }
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const record = value as JsonObject;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
      .join(",")}}`;
  }
  return value === undefined ? "null" : JSON.stringify(value);
}

/** RFC-6901-style pointer application used by the mutation static test. */
export function applyMutation(
  document: unknown,
  mutation: Readonly<{ operation: string; pointer: string; value?: unknown }>,
): unknown {
  const clone: unknown = JSON.parse(JSON.stringify(document));
  const parts = mutation.pointer
    .split("/")
    .slice(1)
    .map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"));
  if (parts.length === 0) throw new Error("empty pointer");
  let parent: unknown = clone;
  for (const part of parts.slice(0, -1)) {
    if (Array.isArray(parent)) parent = parent[Number(part)];
    else if (typeof parent === "object" && parent !== null)
      parent = (parent as JsonObject)[part];
    else throw new Error(`unresolvable pointer ${mutation.pointer}`);
  }
  const leaf = parts[parts.length - 1] ?? "";
  if (Array.isArray(parent)) {
    const index = Number(leaf);
    if (!Number.isInteger(index) || index < 0 || index >= parent.length) {
      throw new Error(`unresolvable pointer ${mutation.pointer}`);
    }
    if (mutation.operation === "remove") parent.splice(index, 1);
    else parent[index] = mutation.value;
    return clone;
  }
  if (typeof parent !== "object" || parent === null) {
    throw new Error(`unresolvable pointer ${mutation.pointer}`);
  }
  const record = parent as JsonObject;
  if (!(leaf in record)) {
    throw new Error(`unresolvable pointer ${mutation.pointer}`);
  }
  if (mutation.operation === "remove") Reflect.deleteProperty(record, leaf);
  else record[leaf] = mutation.value;
  return clone;
}

function resolvePointer(document: unknown, pointer: string): unknown {
  let cursor: unknown = document;
  for (const raw of pointer.split("/").slice(1)) {
    const part = raw.replaceAll("~1", "/").replaceAll("~0", "~");
    if (Array.isArray(cursor)) cursor = cursor[Number(part)];
    else if (typeof cursor === "object" && cursor !== null)
      cursor = (cursor as JsonObject)[part];
    else return undefined;
  }
  return cursor;
}

/* ------------------------------------------------------------------ */
/* Byte material                                                      */
/* ------------------------------------------------------------------ */

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || /[^0-9A-F]/u.test(hex)) {
    throw new Error("invalid hex");
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** Expands bytesHex or a byteSpec of literal and repeated hex segments. */
function expandCaseBytes(record: JsonObject): Uint8Array {
  const direct = record["bytesHex"];
  if (typeof direct === "string") return hexToBytes(direct);
  const spec = record["byteSpec"] as JsonObject;
  const segments = spec["segments"] as JsonObject[];
  const parts: Uint8Array[] = [];
  let total = 0;
  for (const segment of segments) {
    if (typeof segment["hex"] === "string") {
      const bytes = hexToBytes(segment["hex"]);
      parts.push(bytes);
      total += bytes.length;
    } else {
      const unit = hexToBytes(segment["repeatHex"] as string);
      const count = segment["count"] as number;
      const repeated = new Uint8Array(unit.length * count);
      for (let i = 0; i < count; i += 1) repeated.set(unit, i * unit.length);
      parts.push(repeated);
      total += repeated.length;
    }
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Reference SMF decoder (total; the frozen byte laws)                */
/* ------------------------------------------------------------------ */

type ReferenceRefusal = Readonly<{
  code: string;
  pointer: string | null;
  byteOffset: number | null;
  trackIndex: number | null;
}>;

class M0RefusalError extends Error {
  readonly refusal: ReferenceRefusal;
  constructor(code: string, byteOffset: number, trackIndex: number | null) {
    super(`${code}@${String(byteOffset)}`);
    this.refusal = { code, pointer: null, byteOffset, trackIndex };
  }
}

type DecodedTrack = {
  index: number;
  name: string | null;
  instrumentName: string | null;
  markers: { tick: number; text: string }[];
  notes: {
    channel: number;
    key: number;
    onTick: number;
    offTick: number;
    onVelocity: number;
  }[];
};

type DecodeModel = {
  header: { format: number; trackCount: number; division: number };
  tempoMap: { tick: number; microsecondsPerQuarter: number }[];
  meterMap: { tick: number; numerator: number; denominatorPower: number }[];
  tracks: DecodedTrack[];
  ignoredEvents: {
    trackIndex: number;
    tick: number;
    kind: string;
    byteOffset: number;
  }[];
  alienChunks: { byteOffset: number; tag: string; dataLength: number }[];
};

type DecodeCounters = {
  bytesRead: number;
  chunksSeen: number;
  eventsDecoded: number;
  eventsIgnored: number;
  notesPaired: number;
  peakOpenNotes: number;
  tempoChanges: number;
  meterChanges: number;
};

type DecodeSuccess = { model: DecodeModel; counters: DecodeCounters };

function u16(bytes: Uint8Array, at: number): number {
  return ((bytes[at] ?? 0) << 8) | (bytes[at + 1] ?? 0);
}

function u32(bytes: Uint8Array, at: number): number {
  return u16(bytes, at) * 65536 + u16(bytes, at + 2);
}

function referenceDecode(bytes: Uint8Array): DecodeSuccess {
  if (bytes.length > LOCAL.maxBytes) {
    throw new M0RefusalError(
      "limit.midi_import_bytes_exceeded",
      LOCAL.maxBytes,
      null,
    );
  }
  if (bytes.length < 14) {
    throw new M0RefusalError("smf.header_invalid", bytes.length, null);
  }
  if (
    bytes[0] !== 0x4d ||
    bytes[1] !== 0x54 ||
    bytes[2] !== 0x68 ||
    bytes[3] !== 0x64
  ) {
    throw new M0RefusalError("smf.header_invalid", 0, null);
  }
  if (u32(bytes, 4) !== 6) {
    throw new M0RefusalError("smf.header_invalid", 4, null);
  }
  const format = u16(bytes, 8);
  if (format !== 0 && format !== 1) {
    throw new M0RefusalError("smf.format_unsupported", 8, null);
  }
  const declaredTracks = u16(bytes, 10);
  if (declaredTracks === 0 || (format === 0 && declaredTracks !== 1)) {
    throw new M0RefusalError("smf.track_count_invalid", 10, null);
  }
  if (declaredTracks > LOCAL.maxTracks) {
    throw new M0RefusalError("limit.midi_import_tracks_exceeded", 10, null);
  }
  const division = u16(bytes, 12);
  if ((division & 0x8000) !== 0) {
    throw new M0RefusalError("smf.division_smpte_unsupported", 12, null);
  }
  if (division === 0) {
    throw new M0RefusalError("smf.division_zero", 12, null);
  }

  const model: DecodeModel = {
    header: { format, trackCount: declaredTracks, division },
    tempoMap: [],
    meterMap: [],
    tracks: [],
    ignoredEvents: [],
    alienChunks: [],
  };
  const counters: DecodeCounters = {
    bytesRead: bytes.length,
    chunksSeen: 1,
    eventsDecoded: 0,
    eventsIgnored: 0,
    notesPaired: 0,
    peakOpenNotes: 0,
    tempoChanges: 0,
    meterChanges: 0,
  };

  const parseTrack = (trackIndex: number, start: number, end: number): void => {
    let at = start;
    let tick = 0;
    let runningStatus: number | null = null;
    let sawEndOfTrack = false;
    const track: DecodedTrack = {
      index: trackIndex,
      name: null,
      instrumentName: null,
      markers: [],
      notes: [],
    };
    const open = new Map<number, { onTick: number; velocity: number }>();

    const readByte = (): number => {
      if (at >= end) {
        throw new M0RefusalError("smf.chunk_truncated", end, trackIndex);
      }
      const value = bytes[at] ?? 0;
      at += 1;
      return value;
    };
    const readVlq = (deltaKind: boolean): number => {
      const first = at;
      let value = 0;
      for (let i = 0; i < LOCAL.maxVlqBytes; i += 1) {
        const byte = readByte();
        value = value * 128 + (byte & 0x7f);
        if ((byte & 0x80) === 0) return value;
      }
      throw new M0RefusalError(
        deltaKind ? "smf.delta_invalid" : "smf.meta_length_invalid",
        first,
        trackIndex,
      );
    };
    const countEvent = (eventStart: number): void => {
      if (counters.eventsDecoded + counters.eventsIgnored + 1 > LOCAL.maxEvents) {
        throw new M0RefusalError(
          "limit.midi_import_events_exceeded",
          eventStart,
          trackIndex,
        );
      }
    };

    while (at < end) {
      if (sawEndOfTrack) {
        throw new M0RefusalError("smf.end_of_track_invalid", at, trackIndex);
      }
      const eventStart = at;
      const delta = readVlq(true);
      countEvent(eventStart);
      tick += delta;
      if (tick > LOCAL.maxTickHorizon) {
        throw new M0RefusalError(
          "limit.midi_import_tick_horizon_exceeded",
          eventStart,
          trackIndex,
        );
      }
      if (at >= end) {
        throw new M0RefusalError("smf.chunk_truncated", end, trackIndex);
      }
      const status = bytes[at] ?? 0;
      if (status === 0xff) {
        const statusOffset = at;
        at += 1;
        const typeOffset = at;
        const metaType = readByte();
        const lengthOffset = at;
        const length = readVlq(false);
        const fixed = FIXED_META_LENGTHS.get(metaType);
        if (fixed !== undefined && length !== fixed) {
          throw new M0RefusalError(
            "smf.meta_length_invalid",
            lengthOffset,
            trackIndex,
          );
        }
        if (
          metaType === 0x00 &&
          !(SEQUENCE_NUMBER_LENGTHS as readonly number[]).includes(length)
        ) {
          throw new M0RefusalError(
            "smf.meta_length_invalid",
            lengthOffset,
            trackIndex,
          );
        }
        const consumedType = (
          Object.values(CONSUMED_META) as readonly number[]
        ).includes(metaType);
        if (!consumedType && !TOLERATED_META.has(metaType)) {
          throw new M0RefusalError("smf.meta_unknown", typeOffset, trackIndex);
        }
        if (fixed === undefined && metaType !== 0x00 && length > LOCAL.maxMetaPayloadBytes) {
          throw new M0RefusalError(
            "smf.meta_oversized",
            lengthOffset,
            trackIndex,
          );
        }
        const payloadOffset = at;
        if (at + length > end) {
          throw new M0RefusalError("smf.chunk_truncated", end, trackIndex);
        }
        const payload = bytes.slice(at, at + length);
        at += length;
        runningStatus = null;
        if (metaType === CONSUMED_META.setTempo) {
          const microseconds =
            (payload[0] ?? 0) * 65536 + ((payload[1] ?? 0) << 8) + (payload[2] ?? 0);
          if (microseconds === 0) {
            throw new M0RefusalError("smf.tempo_zero", payloadOffset, trackIndex);
          }
          if (format === 1 && trackIndex !== 0) {
            throw new M0RefusalError(
              "smf.conductor_meta_misplaced",
              typeOffset,
              trackIndex,
            );
          }
          if (counters.tempoChanges + 1 > LOCAL.maxTempoChanges) {
            throw new M0RefusalError(
              "limit.midi_import_tempo_changes_exceeded",
              eventStart,
              trackIndex,
            );
          }
          counters.tempoChanges += 1;
          model.tempoMap.push({ tick, microsecondsPerQuarter: microseconds });
          counters.eventsDecoded += 1;
        } else if (metaType === CONSUMED_META.timeSignature) {
          const numerator = payload[0] ?? 0;
          const denominatorPower = payload[1] ?? 0;
          if (numerator < 1 || numerator > LOCAL.maxMeterNumerator) {
            throw new M0RefusalError("smf.meter_invalid", payloadOffset, trackIndex);
          }
          if (denominatorPower > LOCAL.maxMeterDenominatorPower) {
            throw new M0RefusalError(
              "smf.meter_invalid",
              payloadOffset + 1,
              trackIndex,
            );
          }
          if (format === 1 && trackIndex !== 0) {
            throw new M0RefusalError(
              "smf.conductor_meta_misplaced",
              typeOffset,
              trackIndex,
            );
          }
          if (counters.meterChanges + 1 > LOCAL.maxMeterChanges) {
            throw new M0RefusalError(
              "limit.midi_import_meter_changes_exceeded",
              eventStart,
              trackIndex,
            );
          }
          counters.meterChanges += 1;
          model.meterMap.push({ tick, numerator, denominatorPower });
          counters.eventsDecoded += 1;
        } else if (metaType === CONSUMED_META.endOfTrack) {
          if (open.size > 0) {
            throw new M0RefusalError(
              "smf.note_on_unterminated",
              typeOffset,
              trackIndex,
            );
          }
          sawEndOfTrack = true;
          counters.eventsDecoded += 1;
        } else if (metaType === CONSUMED_META.trackName) {
          if (track.name === null) {
            track.name = new TextDecoder().decode(payload);
            counters.eventsDecoded += 1;
          } else {
            model.ignoredEvents.push({
              trackIndex,
              tick,
              kind: "duplicate-track-name",
              byteOffset: statusOffset,
            });
            counters.eventsIgnored += 1;
          }
        } else if (metaType === CONSUMED_META.instrumentName) {
          if (track.instrumentName === null) {
            track.instrumentName = new TextDecoder().decode(payload);
            counters.eventsDecoded += 1;
          } else {
            model.ignoredEvents.push({
              trackIndex,
              tick,
              kind: "duplicate-instrument-name",
              byteOffset: statusOffset,
            });
            counters.eventsIgnored += 1;
          }
        } else if (metaType === CONSUMED_META.marker) {
          track.markers.push({ tick, text: new TextDecoder().decode(payload) });
          counters.eventsDecoded += 1;
        } else {
          model.ignoredEvents.push({
            trackIndex,
            tick,
            kind: TOLERATED_META.get(metaType) ?? "text",
            byteOffset: statusOffset,
          });
          counters.eventsIgnored += 1;
        }
      } else if (status === 0xf0 || status === 0xf7) {
        const statusOffset = at;
        at += 1;
        const lengthOffset = at;
        const length = readVlq(false);
        if (length > LOCAL.maxMetaPayloadBytes) {
          throw new M0RefusalError("smf.meta_oversized", lengthOffset, trackIndex);
        }
        if (at + length > end) {
          throw new M0RefusalError("smf.chunk_truncated", end, trackIndex);
        }
        at += length;
        runningStatus = null;
        model.ignoredEvents.push({
          trackIndex,
          tick,
          kind: status === 0xf0 ? "sysex" : "escape",
          byteOffset: statusOffset,
        });
        counters.eventsIgnored += 1;
      } else if (status >= 0xf1 && status <= 0xfe) {
        throw new M0RefusalError("smf.event_invalid", at, trackIndex);
      } else {
        let effectiveStatus: number;
        let statusOffset: number | null = null;
        if ((status & 0x80) !== 0) {
          effectiveStatus = status;
          statusOffset = at;
          at += 1;
        } else {
          if (runningStatus === null) {
            throw new M0RefusalError("smf.event_invalid", at, trackIndex);
          }
          effectiveStatus = runningStatus;
        }
        const kind = effectiveStatus & 0xf0;
        const channel = effectiveStatus & 0x0f;
        const dataCount = kind === 0xc0 || kind === 0xd0 ? 1 : 2;
        const firstDataOffset = at;
        const data: number[] = [];
        for (let i = 0; i < dataCount; i += 1) {
          const dataOffset = at;
          const value = readByte();
          if ((value & 0x80) !== 0) {
            throw new M0RefusalError("smf.event_invalid", dataOffset, trackIndex);
          }
          data.push(value);
        }
        runningStatus = effectiveStatus;
        const key = data[0] ?? 0;
        const velocity = data[1] ?? 0;
        const openKey = channel * 256 + key;
        if (kind === 0x90 && velocity > 0) {
          if (counters.notesPaired + 1 > LOCAL.maxNotes) {
            throw new M0RefusalError(
              "limit.midi_import_notes_exceeded",
              eventStart,
              trackIndex,
            );
          }
          if (open.has(openKey)) {
            throw new M0RefusalError("smf.note_overlap", firstDataOffset, trackIndex);
          }
          counters.notesPaired += 1;
          open.set(openKey, { onTick: tick, velocity });
          counters.peakOpenNotes = Math.max(counters.peakOpenNotes, open.size);
          counters.eventsDecoded += 1;
        } else if (kind === 0x80 || (kind === 0x90 && velocity === 0)) {
          const started = open.get(openKey);
          if (started === undefined) {
            throw new M0RefusalError(
              "smf.note_off_unmatched",
              firstDataOffset,
              trackIndex,
            );
          }
          open.delete(openKey);
          track.notes.push({
            channel,
            key,
            onTick: started.onTick,
            offTick: tick,
            onVelocity: started.velocity,
          });
          counters.eventsDecoded += 1;
        } else {
          model.ignoredEvents.push({
            trackIndex,
            tick,
            kind: CHANNEL_EVENT_KINDS.get(kind) ?? "control-change",
            byteOffset: statusOffset ?? firstDataOffset,
          });
          counters.eventsIgnored += 1;
        }
      }
    }
    if (!sawEndOfTrack) {
      throw new M0RefusalError("smf.end_of_track_invalid", end, trackIndex);
    }
    track.notes.sort(
      (a, b) => a.onTick - b.onTick || a.channel - b.channel || a.key - b.key,
    );
    model.tracks.push(track);
  };

  let at = 14;
  let tracksParsed = 0;
  while (at < bytes.length) {
    if (bytes.length - at < 8) {
      throw new M0RefusalError("smf.chunk_invalid", at, null);
    }
    let printable = true;
    for (let i = 0; i < 4; i += 1) {
      const value = bytes[at + i] ?? 0;
      if (value < 0x20 || value > 0x7e) printable = false;
    }
    if (!printable) {
      throw new M0RefusalError("smf.chunk_invalid", at, null);
    }
    const tag = String.fromCharCode(
      bytes[at] ?? 0,
      bytes[at + 1] ?? 0,
      bytes[at + 2] ?? 0,
      bytes[at + 3] ?? 0,
    );
    const chunkLength = u32(bytes, at + 4);
    const dataStart = at + 8;
    const dataEnd = dataStart + chunkLength;
    if (dataEnd > bytes.length) {
      throw new M0RefusalError("smf.chunk_truncated", bytes.length, null);
    }
    counters.chunksSeen += 1;
    if (tag === "MTrk") {
      if (tracksParsed === declaredTracks) {
        throw new M0RefusalError("smf.track_count_invalid", at, null);
      }
      parseTrack(tracksParsed, dataStart, dataEnd);
      tracksParsed += 1;
    } else if (tag === "MThd") {
      throw new M0RefusalError("smf.chunk_invalid", at, null);
    } else {
      model.alienChunks.push({ byteOffset: at, tag, dataLength: chunkLength });
    }
    at = dataEnd;
  }
  if (tracksParsed < declaredTracks) {
    throw new M0RefusalError("smf.track_count_invalid", bytes.length, null);
  }
  return { model, counters };
}

/* ------------------------------------------------------------------ */
/* Reference sonority laws (window, grid, measures)                   */
/* ------------------------------------------------------------------ */

type InputNote = Readonly<{
  trackIndex: number;
  channel: number;
  key: number;
  onTick: number;
}>;

type ReferenceSonority = {
  anchorTick: number;
  memberCount: number;
  bassMidi: number;
  bassPitchClass: number;
  pitchClasses: number[];
  windowTicks: number;
  tempoMicrosecondsAtAnchor: number;
  segmentIndex: number;
  gridIndex: number;
  quantizedTickNumerator: number;
  quantizedTickDenominator: number;
  quantizationErrorNumerator: number;
  quantizationErrorDenominator: number;
  measureIndex: number;
};

function floorDiv(a: number, b: number): number {
  return (a - (a % b)) / b;
}

function ceilDiv(a: number, b: number): number {
  return floorDiv(a + b - 1, b);
}

function tempoAt(
  tempoMap: readonly { tick: number; microsecondsPerQuarter: number }[],
  tick: number,
): number {
  let current: number = LOCAL.defaultTempo;
  for (const entry of tempoMap) {
    if (entry.tick <= tick) current = entry.microsecondsPerQuarter;
    else break;
  }
  return current;
}

type MeterSegment = { tick: number; numerator: number; denominatorPower: number };

function meterSegments(
  meterMap: readonly { tick: number; numerator: number; denominatorPower: number }[],
): MeterSegment[] {
  const segments: MeterSegment[] = [];
  const first = meterMap[0];
  if (first === undefined || first.tick > 0) {
    segments.push({
      tick: 0,
      numerator: LOCAL.defaultMeterNumerator,
      denominatorPower: LOCAL.defaultMeterDenominatorPower,
    });
  }
  for (const entry of meterMap) {
    segments.push({
      tick: entry.tick,
      numerator: entry.numerator,
      denominatorPower: entry.denominatorPower,
    });
  }
  return segments;
}

function referenceGroup(
  ppq: number,
  tempoMap: readonly { tick: number; microsecondsPerQuarter: number }[],
  meterMap: readonly { tick: number; numerator: number; denominatorPower: number }[],
  notes: readonly InputNote[],
): ReferenceSonority[] {
  const segments = meterSegments(meterMap);
  const sorted = [...notes].sort(
    (a, b) =>
      a.onTick - b.onTick ||
      a.trackIndex - b.trackIndex ||
      a.channel - b.channel ||
      a.key - b.key,
  );
  type Group = {
    anchor: number;
    window: number;
    microseconds: number;
    members: InputNote[];
  };
  const groups: Group[] = [];
  let current: Group | null = null;
  for (const note of sorted) {
    if (current !== null && note.onTick - current.anchor <= current.window) {
      current.members.push(note);
      continue;
    }
    const microseconds = tempoAt(tempoMap, note.onTick);
    current = {
      anchor: note.onTick,
      window: floorDiv(LOCAL.windowMicroseconds * ppq, microseconds),
      microseconds,
      members: [note],
    };
    groups.push(current);
  }
  return groups.map((group) => {
    const anchor = group.anchor;
    let segmentIndex = 0;
    for (let i = 0; i < segments.length; i += 1) {
      if ((segments[i]?.tick ?? 0) <= anchor) segmentIndex = i;
    }
    const segment = segments[segmentIndex] ?? {
      tick: 0,
      numerator: LOCAL.defaultMeterNumerator,
      denominatorPower: LOCAL.defaultMeterDenominatorPower,
    };
    const beatUnit = 2 ** segment.denominatorPower;
    const numeratorN = (anchor - segment.tick) * beatUnit;
    const gridIndex = floorDiv(2 * numeratorN + ppq, 2 * ppq);
    const quantizedNumerator = segment.tick * beatUnit + gridIndex * ppq;
    const errorNumerator = Math.abs(anchor * beatUnit - quantizedNumerator);
    let priorMeasures = 0;
    for (let i = 0; i < segmentIndex; i += 1) {
      const prior = segments[i];
      const next = segments[i + 1];
      if (prior === undefined || next === undefined) continue;
      const priorBeatUnit = 2 ** prior.denominatorPower;
      priorMeasures += ceilDiv(
        (next.tick - prior.tick) * priorBeatUnit,
        prior.numerator * 4 * ppq,
      );
    }
    const withinMeasures = floorDiv(
      quantizedNumerator - segment.tick * beatUnit,
      segment.numerator * 4 * ppq,
    );
    const keys = group.members.map((member) => member.key).sort((a, b) => a - b);
    const bassMidi = keys[0] ?? 0;
    const pitchClasses = [...new Set(keys.map((key) => key % 12))].sort(
      (a, b) => a - b,
    );
    return {
      anchorTick: anchor,
      memberCount: group.members.length,
      bassMidi,
      bassPitchClass: bassMidi % 12,
      pitchClasses,
      windowTicks: group.window,
      tempoMicrosecondsAtAnchor: group.microseconds,
      segmentIndex,
      gridIndex,
      quantizedTickNumerator: quantizedNumerator,
      quantizedTickDenominator: beatUnit,
      quantizationErrorNumerator: errorNumerator,
      quantizationErrorDenominator: beatUnit,
      measureIndex: priorMeasures + withinMeasures,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Reference reverse-T1 matcher                                       */
/* ------------------------------------------------------------------ */

type ReferenceAlternative = {
  templateId: string;
  formulaRuleId: string;
  realizationId: string | null;
  extensionNumber: number | null;
  rootPitchClass: number;
  rootSpelled: { step: string; alter: number };
  bassPitchClass: number;
  inversion: string;
  matchKind: string;
  missingDegreeNumbers: number[];
};

type ReferenceOutcome =
  | {
      kind: "alternatives";
      totalMatches: number;
      alternatives: ReferenceAlternative[];
    }
  | {
      kind: "custom";
      bassPitchClass: number;
      spelledPitchClasses: { step: string; alter: number }[];
    };

function sameSet(left: ReadonlySet<number>, right: ReadonlySet<number>): boolean {
  if (left.size !== right.size) return false;
  for (const value of left) if (!right.has(value)) return false;
  return true;
}

function referenceResolve(
  pitchClasses: readonly number[],
  bassPitchClass: number,
): ReferenceOutcome {
  type Ranked = { rank: readonly number[]; alternative: ReferenceAlternative };
  const ranked: Ranked[] = [];
  for (const root of pitchClasses) {
    const offsets = new Set(
      pitchClasses.map((pitchClass) => (pitchClass - root + 12) % 12),
    );
    for (let index = 0; index < TEMPLATES.length; index += 1) {
      const template = TEMPLATES[index];
      if (template === undefined) continue;
      const fingerprint = new Set(template.pitchClassOffsets);
      let matchKind: string | null = null;
      let missing: number[] = [];
      if (sameSet(offsets, fingerprint)) {
        matchKind = "exact";
      } else if (template.omissibleFifth && fingerprint.has(7)) {
        const withoutFifth = new Set(fingerprint);
        withoutFifth.delete(7);
        if (sameSet(offsets, withoutFifth)) {
          matchKind = "omitted-fifth";
          missing = [5];
        }
      }
      if (matchKind === null) continue;
      const inversion = bassPitchClass === root ? "root" : "slash";
      const spelling = CANONICAL_SPELLINGS[root] ?? { step: "C", alter: 0 };
      ranked.push({
        rank: [
          matchKind === "exact" ? 0 : 1,
          inversion === "root" ? 0 : 1,
          template.pitchClassOffsets.length,
          index,
          root,
        ],
        alternative: {
          templateId: template.id,
          formulaRuleId: template.formulaRuleId,
          realizationId: template.realizationId,
          extensionNumber: template.extensionNumber,
          rootPitchClass: root,
          rootSpelled: { step: spelling.step, alter: spelling.alter },
          bassPitchClass,
          inversion,
          matchKind,
          missingDegreeNumbers: missing,
        },
      });
    }
  }
  ranked.sort((a, b) => {
    for (let i = 0; i < a.rank.length; i += 1) {
      const delta = (a.rank[i] ?? 0) - (b.rank[i] ?? 0);
      if (delta !== 0) return delta;
    }
    return 0;
  });
  if (ranked.length === 0) {
    const ordered = [...pitchClasses].sort(
      (a, b) => ((a - bassPitchClass + 12) % 12) - ((b - bassPitchClass + 12) % 12),
    );
    return {
      kind: "custom",
      bassPitchClass,
      spelledPitchClasses: ordered.map((pitchClass) => {
        const spelling = CANONICAL_SPELLINGS[pitchClass] ?? { step: "C", alter: 0 };
        return { step: spelling.step, alter: spelling.alter };
      }),
    };
  }
  return {
    kind: "alternatives",
    totalMatches: ranked.length,
    alternatives: ranked
      .slice(0, LOCAL.maxAlternatives)
      .map((entry) => entry.alternative),
  };
}

/* ------------------------------------------------------------------ */
/* Request-phase reference validation                                 */
/* ------------------------------------------------------------------ */

type ReferenceRequest = {
  schema: string;
  readerId: string;
  readerVersion: number;
  requestId: string;
  syntheticByteLength: number | null;
  byteLength: number;
};

function validateRequest(request: ReferenceRequest): ReferenceRefusal | null {
  if (request.schema !== LOCAL.requestSchema) {
    return {
      code: "import.schema_invalid",
      pointer: "/schema",
      byteOffset: null,
      trackIndex: null,
    };
  }
  if (request.readerId !== LOCAL.readerId) {
    return {
      code: "import.schema_invalid",
      pointer: "/readerId",
      byteOffset: null,
      trackIndex: null,
    };
  }
  if (request.readerVersion !== LOCAL.readerVersion) {
    return {
      code: "import.schema_invalid",
      pointer: "/readerVersion",
      byteOffset: null,
      trackIndex: null,
    };
  }
  if (!LOCAL.requestIdPattern.test(request.requestId)) {
    return {
      code: "import.request_id_invalid",
      pointer: "/requestId",
      byteOffset: null,
      trackIndex: null,
    };
  }
  const observed = request.syntheticByteLength ?? request.byteLength;
  if (observed > LOCAL.maxBytes) {
    return {
      code: "limit.midi_import_bytes_exceeded",
      pointer: "/bytes",
      byteOffset: LOCAL.maxBytes,
      trackIndex: null,
    };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Case checks                                                        */
/* ------------------------------------------------------------------ */

function flattenNotes(model: DecodeModel): InputNote[] {
  const notes: InputNote[] = [];
  for (const track of model.tracks) {
    for (const note of track.notes) {
      notes.push({
        trackIndex: track.index,
        channel: note.channel,
        key: note.key,
        onTick: note.onTick,
      });
    }
  }
  return notes;
}

function checkGoldenCase(
  findings: Findings,
  path: string,
  record: JsonObject,
): void {
  let decoded: DecodeSuccess;
  try {
    decoded = referenceDecode(expandCaseBytes(record));
  } catch (error) {
    if (error instanceof M0RefusalError) {
      findings.add(
        "M0_GOLDEN",
        path,
        `golden bytes refused: ${error.refusal.code} at ${String(error.refusal.byteOffset)}`,
      );
    } else {
      findings.add("M0_GOLDEN", path, `golden bytes unreadable: ${String(error)}`);
    }
    return;
  }
  findings.equal(
    "M0_GOLDEN",
    `${path}/model`,
    decoded.model,
    record["expectedModel"],
    "decoded model",
  );
  findings.equal(
    "M0_COUNTER",
    `${path}/counters`,
    decoded.counters,
    record["expectedCounters"],
    "decode counters",
  );
  const sonorities = referenceGroup(
    decoded.model.header.division,
    decoded.model.tempoMap,
    decoded.model.meterMap,
    flattenNotes(decoded.model),
  );
  findings.equal(
    "M0_SONORITY",
    `${path}/sonorities`,
    sonorities,
    record["expectedSonorities"],
    "derived sonorities",
  );
  const resolutions = sonorities.map((sonority, index) => ({
    sonorityIndex: index,
    outcome: referenceResolve(sonority.pitchClasses, sonority.bassPitchClass),
  }));
  findings.equal(
    "M0_RESOLUTION",
    `${path}/resolutions`,
    resolutions,
    record["expectedResolutions"],
    "derived resolutions",
  );
}

function checkE1Pin(
  findings: Findings,
  goldenFixture: JsonObject | undefined,
  e1Fixture: JsonObject | null,
): void {
  const cases = (goldenFixture?.["cases"] as JsonObject[] | undefined) ?? [];
  const m0Case = cases.find((record) => record["id"] === M0_PIN_CASE_ID);
  if (m0Case === undefined) {
    findings.add("M0_E1PIN", "golden-cases.json", `missing ${M0_PIN_CASE_ID}`);
    return;
  }
  if (e1Fixture === null) {
    findings.add(
      "M0_E1PIN",
      E1_GOLDEN_FIXTURE_RELATIVE,
      "E1 golden fixture unreadable; the round-trip pin cannot be proven",
    );
    return;
  }
  const e1Cases = (e1Fixture["cases"] as JsonObject[] | undefined) ?? [];
  const e1Case = e1Cases.find((record) => record["id"] === E1_PIN_CASE_ID);
  if (e1Case === undefined) {
    findings.add(
      "M0_E1PIN",
      E1_GOLDEN_FIXTURE_RELATIVE,
      `missing ${E1_PIN_CASE_ID}`,
    );
    return;
  }
  if (m0Case["bytesHex"] !== e1Case["bytesHex"]) {
    findings.add(
      "M0_E1PIN",
      `golden-cases.json#${M0_PIN_CASE_ID}/bytesHex`,
      "round-trip golden bytes differ from the pinned E1-GLD-001 writer golden",
    );
  }
}

function checkRefusalCase(
  findings: Findings,
  path: string,
  record: JsonObject,
  baseBytesLength: number,
): void {
  const expected = record["expected"] as JsonObject;
  let refusal: ReferenceRefusal | null = null;
  if (record["kind"] === "request") {
    const override = record["override"] as { path: string; value: unknown };
    const request: ReferenceRequest = {
      schema: LOCAL.requestSchema,
      readerId: LOCAL.readerId,
      readerVersion: LOCAL.readerVersion,
      requestId: "m0-ref-base",
      syntheticByteLength: null,
      byteLength: baseBytesLength,
    };
    if (override.path === "/schema") request.schema = override.value as string;
    else if (override.path === "/requestId")
      request.requestId = override.value as string;
    else if (override.path === "/syntheticByteLength")
      request.syntheticByteLength = override.value as number;
    else {
      findings.add("M0_REFUSAL", path, `unknown override path ${override.path}`);
      return;
    }
    refusal = validateRequest(request);
  } else {
    try {
      referenceDecode(expandCaseBytes(record));
    } catch (error) {
      if (error instanceof M0RefusalError) refusal = error.refusal;
      else {
        findings.add("M0_REFUSAL", path, `unexpected failure: ${String(error)}`);
        return;
      }
    }
  }
  if (refusal === null) {
    findings.add("M0_REFUSAL", path, "expected a refusal, input decoded");
    return;
  }
  findings.equal("M0_REFUSAL", `${path}/expected`, refusal, expected, "refusal");
}

function checkSonorityCase(
  findings: Findings,
  path: string,
  record: JsonObject,
): void {
  const input = record["input"] as JsonObject;
  const derived = referenceGroup(
    input["ppq"] as number,
    input["tempoMap"] as { tick: number; microsecondsPerQuarter: number }[],
    input["meterMap"] as {
      tick: number;
      numerator: number;
      denominatorPower: number;
    }[],
    input["notes"] as InputNote[],
  );
  const expected = (record["expected"] as JsonObject)["sonorities"];
  findings.equal("M0_SONORITY", `${path}/sonorities`, derived, expected, "sonorities");
}

function checkResolutionCase(
  findings: Findings,
  path: string,
  record: JsonObject,
): void {
  const input = record["input"] as JsonObject;
  const derived = referenceResolve(
    input["pitchClasses"] as number[],
    input["bassPitchClass"] as number,
  );
  findings.equal(
    "M0_RESOLUTION",
    `${path}/outcome`,
    derived,
    record["expected"],
    "resolution outcome",
  );
}

/* ------------------------------------------------------------------ */
/* Manifest, traces, provenance, mutation checks                      */
/* ------------------------------------------------------------------ */

function checkManifest(fixtures: Map<string, JsonObject>, findings: Findings): void {
  const manifest = fixtures.get("m0-midi-import-contract.json");
  if (!manifest) return;
  const path = "m0-midi-import-contract.json";
  const identity = manifest["identity"] as JsonObject | undefined;
  findings.equal("M0_MANIFEST", `${path}#/identity/contractSchema`, identity?.["contractSchema"], LOCAL.contractSchema, "contract schema");
  findings.equal("M0_MANIFEST", `${path}#/identity/requestSchema`, identity?.["requestSchema"], LOCAL.requestSchema, "request schema");
  findings.equal("M0_MANIFEST", `${path}#/identity/resultSchema`, identity?.["resultSchema"], LOCAL.resultSchema, "result schema");
  findings.equal("M0_MANIFEST", `${path}#/identity/decodeModelSchema`, identity?.["decodeModelSchema"], LOCAL.decodeModelSchema, "decode model schema");
  findings.equal("M0_MANIFEST", `${path}#/identity/sonorityReportSchema`, identity?.["sonorityReportSchema"], LOCAL.sonorityReportSchema, "sonority report schema");
  findings.equal("M0_MANIFEST", `${path}#/identity/resolutionReportSchema`, identity?.["resolutionReportSchema"], LOCAL.resolutionReportSchema, "resolution report schema");
  findings.equal("M0_MANIFEST", `${path}#/identity/readerId`, identity?.["readerId"], LOCAL.readerId, "reader id");
  findings.equal("M0_MANIFEST", `${path}#/identity/readerVersion`, identity?.["readerVersion"], LOCAL.readerVersion, "reader version");
  findings.equal("M0_MANIFEST", `${path}#/identity/readerVersionTag`, identity?.["readerVersionTag"], LOCAL.readerVersionTag, "reader version tag");
  findings.equal("M0_MANIFEST", `${path}#/identity/operationNames`, identity?.["operationNames"], LOCAL.operationNames, "operation names");
  findings.equal("M0_MANIFEST", `${path}#/declaredFiles`, manifest["declaredFiles"], M0_FIXTURE_FILES, "declared files");
  const smf = manifest["smf"] as JsonObject | undefined;
  findings.equal("M0_MANIFEST", `${path}#/smf/acceptedFormats`, smf?.["acceptedFormats"], LOCAL.acceptedFormats, "accepted formats");
  findings.equal("M0_MANIFEST", `${path}#/smf/minPpq`, smf?.["minPpq"], LOCAL.minPpq, "min ppq");
  findings.equal("M0_MANIFEST", `${path}#/smf/maxPpq`, smf?.["maxPpq"], LOCAL.maxPpq, "max ppq");
  findings.equal("M0_MANIFEST", `${path}#/smf/defaultTempoMicrosecondsPerQuarter`, smf?.["defaultTempoMicrosecondsPerQuarter"], LOCAL.defaultTempo, "default tempo");
  findings.equal("M0_MANIFEST", `${path}#/smf/defaultMeter`, smf?.["defaultMeter"], { numerator: LOCAL.defaultMeterNumerator, denominatorPower: LOCAL.defaultMeterDenominatorPower }, "default meter");
  findings.equal("M0_MANIFEST", `${path}#/smf/consumedMetaTypes`, smf?.["consumedMetaTypes"], CONSUMED_META, "consumed meta types");
  findings.equal(
    "M0_MANIFEST",
    `${path}#/smf/toleratedMetaTypes`,
    smf?.["toleratedMetaTypes"],
    {
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
    },
    "tolerated meta types",
  );
  findings.equal(
    "M0_MANIFEST",
    `${path}#/smf/fixedMetaLengths`,
    smf?.["fixedMetaLengths"],
    {
      setTempo: 3,
      timeSignature: 4,
      endOfTrack: 0,
      channelPrefix: 1,
      midiPort: 1,
      smpteOffset: 5,
      keySignature: 2,
    },
    "fixed meta lengths",
  );
  findings.equal("M0_MANIFEST", `${path}#/smf/sequenceNumberLengths`, smf?.["sequenceNumberLengths"], SEQUENCE_NUMBER_LENGTHS, "sequence-number lengths");
  findings.equal("M0_MANIFEST", `${path}#/smf/ignoredEventKinds`, smf?.["ignoredEventKinds"], IGNORED_EVENT_KINDS, "ignored event kinds");
  findings.equal("M0_MANIFEST", `${path}#/smf/maxVlqBytes`, smf?.["maxVlqBytes"], LOCAL.maxVlqBytes, "max VLQ bytes");
  findings.equal("M0_MANIFEST", `${path}#/smf/maxVlqValue`, smf?.["maxVlqValue"], LOCAL.maxVlqValue, "max VLQ value");
  const limits = manifest["limits"] as JsonObject | undefined;
  findings.equal("M0_MANIFEST", `${path}#/limits/maxBytes`, limits?.["maxBytes"], LOCAL.maxBytes, "max bytes");
  findings.equal("M0_MANIFEST", `${path}#/limits/maxTracks`, limits?.["maxTracks"], LOCAL.maxTracks, "max tracks");
  findings.equal("M0_MANIFEST", `${path}#/limits/maxEvents`, limits?.["maxEvents"], LOCAL.maxEvents, "max events");
  findings.equal("M0_MANIFEST", `${path}#/limits/maxNotes`, limits?.["maxNotes"], LOCAL.maxNotes, "max notes");
  findings.equal("M0_MANIFEST", `${path}#/limits/maxTickHorizon`, limits?.["maxTickHorizon"], LOCAL.maxTickHorizon, "max tick horizon");
  findings.equal("M0_MANIFEST", `${path}#/limits/maxTempoChanges`, limits?.["maxTempoChanges"], LOCAL.maxTempoChanges, "max tempo changes");
  findings.equal("M0_MANIFEST", `${path}#/limits/maxMeterChanges`, limits?.["maxMeterChanges"], LOCAL.maxMeterChanges, "max meter changes");
  findings.equal("M0_MANIFEST", `${path}#/limits/maxMetaPayloadBytes`, limits?.["maxMetaPayloadBytes"], LOCAL.maxMetaPayloadBytes, "max meta payload bytes");
  findings.equal("M0_MANIFEST", `${path}#/limits/maxMeterNumerator`, limits?.["maxMeterNumerator"], LOCAL.maxMeterNumerator, "max meter numerator");
  findings.equal("M0_MANIFEST", `${path}#/limits/maxMeterDenominatorPower`, limits?.["maxMeterDenominatorPower"], LOCAL.maxMeterDenominatorPower, "max meter denominator power");
  findings.equal("M0_MANIFEST", `${path}#/limits/maxRequestIdAsciiLength`, limits?.["maxRequestIdAsciiLength"], LOCAL.maxRequestIdAsciiLength, "max request id length");
  findings.equal("M0_MANIFEST", `${path}#/limits/requestIdPatternSource`, limits?.["requestIdPatternSource"], LOCAL.requestIdPatternSource, "request id pattern");
  const sonorityLaws = manifest["sonorityLaws"] as JsonObject | undefined;
  findings.equal("M0_MANIFEST", `${path}#/sonorityLaws/simultaneityWindowMicroseconds`, sonorityLaws?.["simultaneityWindowMicroseconds"], LOCAL.windowMicroseconds, "window microseconds");
  findings.equal("M0_MANIFEST", `${path}#/sonorityLaws/gridDivisionsPerBeat`, sonorityLaws?.["gridDivisionsPerBeat"], LOCAL.gridDivisionsPerBeat, "grid divisions per beat");
  const resolutionLaws = manifest["resolutionLaws"] as JsonObject | undefined;
  findings.equal("M0_MANIFEST", `${path}#/resolutionLaws/ranking`, resolutionLaws?.["ranking"], RANKING, "ranking");
  findings.equal("M0_MANIFEST", `${path}#/resolutionLaws/maxAlternatives`, resolutionLaws?.["maxAlternatives"], LOCAL.maxAlternatives, "max alternatives");
  findings.equal("M0_MANIFEST", `${path}#/resolutionLaws/matchKinds`, resolutionLaws?.["matchKinds"], ["exact", "omitted-fifth"], "match kinds");
  findings.equal("M0_MANIFEST", `${path}#/resolutionLaws/canonicalSpellings`, resolutionLaws?.["canonicalSpellings"], CANONICAL_SPELLINGS, "canonical spellings");
  findings.equal("M0_MANIFEST", `${path}#/templates`, manifest["templates"], TEMPLATES, "templates");
  findings.equal("M0_MANIFEST", `${path}#/refusalCodes`, manifest["refusalCodes"], REFUSAL_CODES, "refusal codes");
  const e1Pins = manifest["e1Pins"] as JsonObject | undefined;
  findings.equal("M0_MANIFEST", `${path}#/e1Pins/fixtureFile`, e1Pins?.["fixtureFile"], "tests/fixtures/midi-export/golden-cases.json", "E1 pin fixture file");
  findings.equal(
    "M0_MANIFEST",
    `${path}#/e1Pins/roundTripCase`,
    e1Pins?.["roundTripCase"],
    { e1CaseId: E1_PIN_CASE_ID, m0CaseId: M0_PIN_CASE_ID },
    "E1 round-trip case pin",
  );
}

type CaseIndex = Map<string, { file: string; record: JsonObject }>;

function collectCases(fixtures: Map<string, JsonObject>): CaseIndex {
  const cases: CaseIndex = new Map();
  for (const file of [
    "golden-cases.json",
    "refusal-cases.json",
    "sonority-cases.json",
    "resolution-cases.json",
  ]) {
    const fixture = fixtures.get(file);
    if (!fixture) continue;
    for (const record of (fixture["cases"] as JsonObject[] | undefined) ?? []) {
      cases.set(record["id"] as string, { file, record });
    }
  }
  return cases;
}

function checkTraces(
  findings: Findings,
  fixtures: Map<string, JsonObject>,
  cases: CaseIndex,
): void {
  const ledger = fixtures.get("trace-ledger.json");
  const controls = fixtures.get("mutation-controls.json");
  if (!ledger || !controls) return;
  const traces = (ledger["traces"] as JsonObject[] | undefined) ?? [];
  const controlIds = new Set(
    ((controls["controls"] as JsonObject[] | undefined) ?? []).map(
      (control) => control["id"] as string,
    ),
  );
  const caseToTraces = new Map<string, Set<string>>();
  for (const [caseId, entry] of cases) {
    caseToTraces.set(
      caseId,
      new Set((entry.record["traceIds"] as string[] | undefined) ?? []),
    );
  }
  const coveredCases = new Set<string>();
  const coveredControls = new Set<string>();
  for (const trace of traces) {
    const traceId = trace["id"] as string;
    const caseIds = (trace["caseIds"] as string[] | undefined) ?? [];
    if (caseIds.length === 0) {
      findings.add("M0_TRACE", `trace-ledger.json#${traceId}`, "trace names no case");
    }
    for (const caseId of caseIds) {
      if (!cases.has(caseId)) {
        findings.add("M0_TRACE", `trace-ledger.json#${traceId}`, `unknown case ${caseId}`);
        continue;
      }
      coveredCases.add(caseId);
      if (!caseToTraces.get(caseId)?.has(traceId)) {
        findings.add(
          "M0_TRACE",
          `trace-ledger.json#${traceId}`,
          `case ${caseId} does not list this trace`,
        );
      }
    }
    for (const controlId of (trace["controlIds"] as string[] | undefined) ?? []) {
      if (!controlIds.has(controlId)) {
        findings.add("M0_TRACE", `trace-ledger.json#${traceId}`, `unknown control ${controlId}`);
      } else {
        coveredControls.add(controlId);
      }
    }
    const owner = trace["evidenceOwner"] as string;
    if (owner !== STATIC_EVIDENCE_OWNER && !EVIDENCE_OWNER_PATTERN.test(owner)) {
      findings.add("M0_TRACE", `trace-ledger.json#${traceId}`, `invalid evidence owner ${owner}`);
    }
  }
  const traceIds = new Set(traces.map((trace) => trace["id"] as string));
  for (const [caseId, listed] of caseToTraces) {
    if (!coveredCases.has(caseId)) {
      findings.add("M0_TRACE", "trace-ledger.json", `case ${caseId} belongs to no trace`);
    }
    for (const traceId of listed) {
      if (!traceIds.has(traceId)) {
        findings.add("M0_TRACE", `${caseId}/traceIds`, `unknown trace ${traceId}`);
        continue;
      }
      const trace = traces.find((row) => row["id"] === traceId);
      const listedCases = (trace?.["caseIds"] as string[] | undefined) ?? [];
      if (!listedCases.includes(caseId)) {
        findings.add("M0_TRACE", `${caseId}/traceIds`, `trace ${traceId} does not list this case`);
      }
    }
  }
  for (const controlId of controlIds) {
    if (!coveredControls.has(controlId)) {
      findings.add("M0_TRACE", "trace-ledger.json", `control ${controlId} belongs to no trace`);
    }
  }
}

function checkProvenance(
  findings: Findings,
  fixtures: Map<string, JsonObject>,
  cases: CaseIndex,
): void {
  const ledger = fixtures.get("provenance-ledger.json");
  if (!ledger) return;
  if (ledger["expectedValuesGenerated"] !== false) {
    findings.add("M0_PROVENANCE", "provenance-ledger.json#/expectedValuesGenerated", "must be false");
  }
  if (ledger["productionOutputUsed"] !== false) {
    findings.add("M0_PROVENANCE", "provenance-ledger.json#/productionOutputUsed", "must be false");
  }
  if (ledger["reviewState"] !== "reviewed-for-m0-spec") {
    findings.add("M0_PROVENANCE", "provenance-ledger.json#/reviewState", "unexpected review state");
  }
  const authorities = new Set(
    ((ledger["authorities"] as JsonObject[] | undefined) ?? []).map(
      (authority) => authority["id"] as string,
    ),
  );
  for (const required of [
    "M0-AUTH-SMF",
    "M0-AUTH-T1",
    "M0-AUTH-E1",
    "M0-AUTH-DERIVED",
    "M0-AUTH-INDEPENDENCE",
  ]) {
    if (!authorities.has(required)) {
      findings.add("M0_PROVENANCE", "provenance-ledger.json#/authorities", `missing ${required}`);
    }
  }
  for (const [caseId, entry] of cases) {
    for (const authorityId of (entry.record["authorityIds"] as string[] | undefined) ?? []) {
      if (!authorities.has(authorityId)) {
        findings.add("M0_PROVENANCE", `${caseId}/authorityIds`, `unknown authority ${authorityId}`);
      }
    }
  }
}

function checkMutationControls(
  findings: Findings,
  fixtures: Map<string, JsonObject>,
): void {
  const controls = fixtures.get("mutation-controls.json");
  if (!controls) return;
  const seen = new Set<string>();
  for (const control of (controls["controls"] as JsonObject[] | undefined) ?? []) {
    const id = control["id"] as string;
    const path = `mutation-controls.json#${id}`;
    if (seen.has(id)) findings.add("M0_CASE", path, "duplicate control id");
    seen.add(id);
    const file = control["file"] as string;
    if (!(M0_FIXTURE_FILES as readonly string[]).includes(file)) {
      findings.add("M0_CASE", path, `unknown file ${file}`);
      continue;
    }
    if (
      !(M0_FINDING_CODES as readonly string[]).includes(
        control["expectedFindingCode"] as string,
      )
    ) {
      findings.add("M0_CASE", path, "unknown expected finding code");
    }
    const target = fixtures.get(file);
    if (target && resolvePointer(target, control["pointer"] as string) === undefined) {
      findings.add("M0_CASE", path, `pointer ${String(control["pointer"])} does not resolve`);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Entry                                                              */
/* ------------------------------------------------------------------ */

export type M0Overlay = Readonly<{ file: string; document: unknown }>;

export async function validateM0Contract(
  overlay?: M0Overlay,
  fixtureRoot: string = DEFAULT_FIXTURE_ROOT,
): Promise<M0ContractValidationReport> {
  const findings = new Findings();
  const fixtures = new Map<string, JsonObject>();
  for (const file of M0_FIXTURE_FILES) {
    try {
      const raw = await readFile(resolve(fixtureRoot, file), "utf8");
      fixtures.set(file, JSON.parse(raw) as JsonObject);
    } catch (error) {
      findings.add("M0_FILES", file, `unreadable fixture: ${String(error)}`);
    }
  }
  if (overlay) fixtures.set(overlay.file, overlay.document as JsonObject);
  let e1Fixture: JsonObject | null = null;
  try {
    const raw = await readFile(
      resolve(fixtureRoot, E1_GOLDEN_FIXTURE_RELATIVE),
      "utf8",
    );
    e1Fixture = JSON.parse(raw) as JsonObject;
  } catch {
    // checkE1Pin reports the unreadable pin fixture as an M0_E1PIN finding.
  }
  const expectedSchemas: Readonly<Record<string, string>> = {
    "m0-midi-import-contract.json": "changes.fixtures.m0-midi-import-contract.v1",
    "golden-cases.json": "changes.fixtures.m0-golden-cases.v1",
    "refusal-cases.json": "changes.fixtures.m0-refusal-cases.v1",
    "sonority-cases.json": "changes.fixtures.m0-sonority-cases.v1",
    "resolution-cases.json": "changes.fixtures.m0-resolution-cases.v1",
    "mutation-controls.json": "changes.fixtures.m0-mutation-controls.v1",
    "provenance-ledger.json": "changes.fixtures.m0-provenance-ledger.v1",
    "trace-ledger.json": "changes.fixtures.m0-trace-ledger.v1",
  };
  for (const [file, schema] of Object.entries(expectedSchemas)) {
    const fixture = fixtures.get(file);
    if (fixture && fixture["schema"] !== schema) {
      findings.add("M0_SCHEMA", file, `expected schema ${schema}`);
    }
  }
  checkManifest(fixtures, findings);

  const golden = fixtures.get("golden-cases.json");
  const goldenCases = (golden?.["cases"] as JsonObject[] | undefined) ?? [];
  for (const record of goldenCases) {
    checkGoldenCase(findings, `golden-cases.json#${String(record["id"])}`, record);
  }
  checkE1Pin(findings, golden, e1Fixture);

  const refusalFixture = fixtures.get("refusal-cases.json");
  const refusalCases = (refusalFixture?.["cases"] as JsonObject[] | undefined) ?? [];
  const baseCaseId =
    ((refusalFixture?.["requestDefaults"] as JsonObject | undefined)?.[
      "bytesCaseId"
    ] as string | undefined) ?? M0_PIN_CASE_ID;
  const baseGolden = goldenCases.find((record) => record["id"] === baseCaseId);
  let baseBytesLength = 0;
  if (baseGolden !== undefined) {
    baseBytesLength = expandCaseBytes(baseGolden).length;
  } else {
    findings.add("M0_REFUSAL", "refusal-cases.json", `missing base case ${baseCaseId}`);
  }
  for (const record of refusalCases) {
    checkRefusalCase(
      findings,
      `refusal-cases.json#${String(record["id"])}`,
      record,
      baseBytesLength,
    );
  }

  const sonorityFixture = fixtures.get("sonority-cases.json");
  const sonorityCases = (sonorityFixture?.["cases"] as JsonObject[] | undefined) ?? [];
  for (const record of sonorityCases) {
    checkSonorityCase(findings, `sonority-cases.json#${String(record["id"])}`, record);
  }

  const resolutionFixture = fixtures.get("resolution-cases.json");
  const resolutionCases =
    (resolutionFixture?.["cases"] as JsonObject[] | undefined) ?? [];
  for (const record of resolutionCases) {
    checkResolutionCase(
      findings,
      `resolution-cases.json#${String(record["id"])}`,
      record,
    );
  }

  const cases = collectCases(fixtures);
  checkTraces(findings, fixtures, cases);
  checkProvenance(findings, fixtures, cases);
  checkMutationControls(findings, fixtures);

  const controls = fixtures.get("mutation-controls.json");
  const traces = fixtures.get("trace-ledger.json");
  const provenance = fixtures.get("provenance-ledger.json");
  return {
    schema: "changes.validation.m0-contract.v1",
    package: "M0",
    outcome: findings.list.length === 0 ? "pass" : "fail",
    counts: {
      files: fixtures.size,
      goldenCases: goldenCases.length,
      refusalCases: refusalCases.length,
      sonorityCases: sonorityCases.length,
      resolutionCases: resolutionCases.length,
      mutationControls: ((controls?.["controls"] as JsonObject[] | undefined) ?? []).length,
      traces: ((traces?.["traces"] as JsonObject[] | undefined) ?? []).length,
      authorities: ((provenance?.["authorities"] as JsonObject[] | undefined) ?? []).length,
    },
    findings: findings.list,
  };
}

async function main(): Promise<void> {
  const report = await validateM0Contract();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.outcome === "pass" ? 0 : 1;
}

if (import.meta.main) {
  await main();
}
