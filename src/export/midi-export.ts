/**
 * E1 deterministic Standard MIDI File writer.
 *
 * The single operation consumes one finished P0 playback plan (its pitches
 * are the already-realized V0/V2 voicings) plus explicit id-bound marker
 * text and emits format-1 SMF bytes at PPQ 960 with a machine-readable
 * report. It never reparses chord symbols, revoices, re-quantizes, touches
 * the network, or creates object URLs; download wiring belongs to the
 * application/UI layers. Every refusal is typed, path-addressed, and
 * resolved in the frozen validation precedence; silent clamping, silent
 * truncation, and partial results are forbidden. The returned report and
 * result envelope are frozen; the byte payload is a fresh Uint8Array that
 * is never aliased or reused (typed arrays cannot be frozen element-wise).
 */
import type { ChordEventId, DomainPath } from "../domain";
import {
  PLAYBACK_ARTICULATION_POLICY_ID,
  PLAYBACK_ARTICULATION_POLICY_VERSION,
  PLAYBACK_EVENT_SCHEMA,
  PLAYBACK_LOOP_POLICY_ID,
  PLAYBACK_LOOP_POLICY_VERSION,
  PLAYBACK_PLAN_COMPILER_ID,
  PLAYBACK_PLAN_COMPILER_VERSION,
  PLAYBACK_PLAN_SCHEMA,
  PLAYBACK_REALIZATION_BINDING_POLICY_ID,
  PLAYBACK_REALIZATION_BINDING_POLICY_VERSION,
  PLAYBACK_VELOCITY_POLICY_ID,
  PLAYBACK_VELOCITY_POLICY_VERSION,
  type PlaybackEvent,
  type PlaybackPlan,
} from "../playback";
import {
  MAX_MIDI_EXPORT_BYTES,
  MAX_MIDI_EXPORT_EVENTS,
  MAX_MIDI_EXPORT_FILENAME_CHARS,
  MAX_MIDI_EXPORT_MARKERS,
  MAX_MIDI_EXPORT_NOTES,
  MAX_MIDI_EXPORT_TEMPO_BPM,
  MAX_MIDI_EXPORT_TEXT_UTF8_BYTES,
  MAX_MIDI_EXPORT_VLQ_VALUE,
  MIDI_EXPORT_CHANNEL,
  MIDI_EXPORT_DIVISION,
  MIDI_EXPORT_FILENAME_PREFIX,
  MIDI_EXPORT_FILENAME_SUFFIX,
  MIDI_EXPORT_FORMAT,
  MIDI_EXPORT_MARKER_KINDS,
  MIDI_EXPORT_MARKER_SCHEMA,
  MIDI_EXPORT_META_TYPES,
  MIDI_EXPORT_MICROSECONDS_PER_MINUTE,
  MIDI_EXPORT_NOTE_OFF_VELOCITY,
  MIDI_EXPORT_REPORT_SCHEMA,
  MIDI_EXPORT_REQUEST_ID_PATTERN_SOURCE,
  MIDI_EXPORT_REQUEST_SCHEMA,
  MIDI_EXPORT_RESULT_SCHEMA,
  MIDI_EXPORT_TIME_SIGNATURE_32NDS_PER_QUARTER,
  MIDI_EXPORT_TIME_SIGNATURE_CLOCKS_PER_CLICK,
  MIDI_EXPORT_TRACK_COUNT,
  MIDI_EXPORT_VELOCITY,
  MIDI_EXPORT_WRITER_ID,
  MIDI_EXPORT_WRITER_VERSION,
  MIN_MIDI_EXPORT_TEMPO_BPM,
  type MidiExportLoss,
  type MidiExportMarker,
  type MidiExportRefusal,
  type MidiExportRefusalCode,
  type MidiExportReport,
  type MidiExportRequest,
  type MidiExportResult,
  type MidiExportOperations,
} from "./midi-export-contract";

const REQUEST_ID_PATTERN = new RegExp(
  MIDI_EXPORT_REQUEST_ID_PATTERN_SOURCE,
  "u",
);
const FILENAME_UNSAFE_PATTERN = /[^A-Za-z0-9._-]/gu;
const NOTE_ON_STATUS = 0x90 | MIDI_EXPORT_CHANNEL;
const NOTE_OFF_STATUS = 0x80 | MIDI_EXPORT_CHANNEL;
const HEADER_CHUNK_BYTES = 14;
const TRACK_HEADER_BYTES = 8;

const textEncoder = new TextEncoder();

/**
 * Defensive pin checks read the typed request through a widened record
 * view: the static types already pin these literals, and the runtime
 * re-check exists exactly for inputs that bypassed those types.
 */
type WidenedRecord = Record<string, unknown>;

function widen(value: object): WidenedRecord {
  return value as WidenedRecord;
}

type PathSegment = string | number;

function frozenPath(...segments: readonly PathSegment[]): DomainPath {
  return Object.freeze([...segments]);
}

function refuse(
  code: MidiExportRefusalCode,
  path: DomainPath,
): MidiExportRefusal {
  return Object.freeze({ code, path, partialResult: false as const });
}

/** UTF-8 text law: one to ninety-six bytes, no ASCII control characters. */
function textIsInvalid(value: string): boolean {
  const byteLength = textEncoder.encode(value).length;
  if (byteLength < 1 || byteLength > MAX_MIDI_EXPORT_TEXT_UTF8_BYTES) {
    return true;
  }
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint < 0x20 || codePoint === 0x7f) return true;
  }
  return false;
}

function markerKindRank(kind: MidiExportMarker["kind"]): number {
  return kind === "section" ? 0 : 1;
}

/**
 * The event whose start or gate-off tick lands on the end of an oversized
 * delta names the refusal path; the first event is the fallback owner.
 */
function vlqOwnerIndex(plan: PlaybackPlan, endTick: number): number {
  const owner = plan.events.findIndex(
    (event) =>
      event.startTick === endTick ||
      event.startTick + event.gateDurationTicks === endTick,
  );
  return owner < 0 ? 0 : owner;
}

function validateRequestStages(
  request: MidiExportRequest,
): MidiExportRefusal | null {
  const requestRecord = widen(request);
  if (requestRecord["schema"] !== MIDI_EXPORT_REQUEST_SCHEMA) {
    return refuse("midi.schema_invalid", frozenPath("schema"));
  }
  for (let m = 0; m < request.markers.length; m += 1) {
    const marker = request.markers[m];
    const markerRecord = marker === undefined ? {} : widen(marker);
    if (markerRecord["schema"] !== MIDI_EXPORT_MARKER_SCHEMA) {
      return refuse("midi.schema_invalid", frozenPath("markers", m, "schema"));
    }
    const kind = markerRecord["kind"];
    if (
      !(MIDI_EXPORT_MARKER_KINDS as readonly unknown[]).includes(kind)
    ) {
      return refuse("midi.schema_invalid", frozenPath("markers", m, "kind"));
    }
  }
  if (requestRecord["writerId"] !== MIDI_EXPORT_WRITER_ID) {
    return refuse("midi.policy_invalid", frozenPath("writerId"));
  }
  if (requestRecord["writerVersion"] !== MIDI_EXPORT_WRITER_VERSION) {
    return refuse("midi.policy_invalid", frozenPath("writerVersion"));
  }
  if (!REQUEST_ID_PATTERN.test(request.requestId)) {
    return refuse("midi.request_id_invalid", frozenPath("requestId"));
  }
  if (
    !Number.isInteger(request.sourceRevision) ||
    request.sourceRevision < 0
  ) {
    return refuse("midi.revision_invalid", frozenPath("sourceRevision"));
  }
  if (request.documentId !== request.plan.sourceDocumentId) {
    return refuse("midi.document_mismatch", frozenPath("documentId"));
  }
  const plan = request.plan;
  const planRecord = widen(plan);
  if (planRecord["schema"] !== PLAYBACK_PLAN_SCHEMA) {
    return refuse("midi.plan_invalid", frozenPath("plan", "schema"));
  }
  const planPins: readonly (readonly [string, unknown])[] = [
    ["compilerId", PLAYBACK_PLAN_COMPILER_ID],
    ["compilerVersion", PLAYBACK_PLAN_COMPILER_VERSION],
    ["articulationPolicyId", PLAYBACK_ARTICULATION_POLICY_ID],
    ["articulationPolicyVersion", PLAYBACK_ARTICULATION_POLICY_VERSION],
    ["loopPolicyId", PLAYBACK_LOOP_POLICY_ID],
    ["loopPolicyVersion", PLAYBACK_LOOP_POLICY_VERSION],
    ["velocityPolicyId", PLAYBACK_VELOCITY_POLICY_ID],
    ["velocityPolicyVersion", PLAYBACK_VELOCITY_POLICY_VERSION],
    ["realizationBindingPolicyId", PLAYBACK_REALIZATION_BINDING_POLICY_ID],
    [
      "realizationBindingPolicyVersion",
      PLAYBACK_REALIZATION_BINDING_POLICY_VERSION,
    ],
  ];
  for (const [field, expected] of planPins) {
    if (planRecord[field] !== expected) {
      return refuse("midi.plan_invalid", frozenPath("plan", field));
    }
  }
  if (planRecord["midiPpq"] !== MIDI_EXPORT_DIVISION) {
    return refuse("midi.plan_invalid", frozenPath("plan", "midiPpq"));
  }
  if (!Number.isInteger(plan.totalTicks) || plan.totalTicks < 0) {
    return refuse("midi.plan_invalid", frozenPath("plan", "totalTicks"));
  }
  if (plan.events.length > MAX_MIDI_EXPORT_EVENTS) {
    return refuse("midi.plan_invalid", frozenPath("plan", "events"));
  }
  let noteCount = 0;
  for (let i = 0; i < plan.events.length; i += 1) {
    const event = plan.events[i];
    if (event === undefined) continue;
    const eventRecord = widen(event);
    if (eventRecord["schema"] !== PLAYBACK_EVENT_SCHEMA) {
      return refuse("midi.plan_invalid", frozenPath("plan", "events", i, "schema"));
    }
    if (event.ordinal !== i) {
      return refuse(
        "midi.plan_invalid",
        frozenPath("plan", "events", i, "ordinal"),
      );
    }
    if (eventRecord["velocity"] !== MIDI_EXPORT_VELOCITY) {
      return refuse(
        "midi.plan_invalid",
        frozenPath("plan", "events", i, "velocity"),
      );
    }
    if (
      event.midiPitches.length === 0 ||
      event.midiPitches.length !== event.pitches.length
    ) {
      return refuse(
        "midi.plan_invalid",
        frozenPath("plan", "events", i, "midiPitches"),
      );
    }
    const seenNoteNumbers = new Set<number>();
    for (const midi of event.midiPitches) {
      if (seenNoteNumbers.has(midi)) {
        return refuse(
          "midi.plan_invalid",
          frozenPath("plan", "events", i, "midiPitches"),
        );
      }
      seenNoteNumbers.add(midi);
    }
    noteCount += event.midiPitches.length;
  }
  if (noteCount > MAX_MIDI_EXPORT_NOTES) {
    return refuse("midi.plan_invalid", frozenPath("plan", "events"));
  }
  if (request.markers.length > MAX_MIDI_EXPORT_MARKERS) {
    return refuse("midi.plan_invalid", frozenPath("markers"));
  }
  if (
    !Number.isInteger(plan.tempoBpm) ||
    plan.tempoBpm < MIN_MIDI_EXPORT_TEMPO_BPM ||
    plan.tempoBpm > MAX_MIDI_EXPORT_TEMPO_BPM
  ) {
    return refuse("midi.tempo_invalid", frozenPath("plan", "tempoBpm"));
  }
  const { beatsPerBar, beatUnit } = plan.meter;
  if (
    !Number.isInteger(beatsPerBar) ||
    beatsPerBar < 1 ||
    beatsPerBar > 255
  ) {
    return refuse(
      "midi.meter_invalid",
      frozenPath("plan", "meter", "beatsPerBar"),
    );
  }
  const beatUnitPower = Math.log2(beatUnit);
  if (!Number.isInteger(beatUnitPower) || beatUnit < 1 || beatUnit > 32) {
    return refuse("midi.meter_invalid", frozenPath("plan", "meter", "beatUnit"));
  }
  for (let i = 1; i < plan.events.length; i += 1) {
    const previous = plan.events[i - 1];
    const current = plan.events[i];
    if (previous === undefined || current === undefined) continue;
    if (current.startTick < previous.startTick) {
      return refuse(
        "midi.event_order_invalid",
        frozenPath("plan", "events", i, "startTick"),
      );
    }
  }
  for (let i = 0; i < plan.events.length; i += 1) {
    const event = plan.events[i];
    if (event === undefined) continue;
    for (let p = 0; p < event.midiPitches.length; p += 1) {
      const midi = event.midiPitches[p] ?? Number.NaN;
      if (!Number.isInteger(midi) || midi < 0 || midi > 127) {
        return refuse(
          "midi.pitch_out_of_range",
          frozenPath("plan", "events", i, "midiPitches", p),
        );
      }
    }
  }
  for (let i = 0; i < plan.events.length; i += 1) {
    const event = plan.events[i];
    if (event === undefined) continue;
    const ticksValid =
      Number.isInteger(event.startTick) &&
      event.startTick >= 0 &&
      Number.isInteger(event.durationTicks) &&
      event.durationTicks >= 1 &&
      Number.isInteger(event.gateDurationTicks) &&
      event.gateDurationTicks >= 1 &&
      event.gateDurationTicks <= event.durationTicks &&
      event.startTick + event.durationTicks <= plan.totalTicks;
    if (!ticksValid) {
      return refuse(
        "midi.gate_invalid",
        frozenPath("plan", "events", i, "gateDurationTicks"),
      );
    }
  }
  const namedTexts: readonly (readonly [DomainPath, string])[] = [
    [frozenPath("title"), request.title],
    [frozenPath("voicingTrackName"), request.voicingTrackName],
    [frozenPath("instrumentName"), request.instrumentName],
  ];
  for (const [path, value] of namedTexts) {
    if (textIsInvalid(value)) return refuse("midi.text_invalid", path);
  }
  for (let m = 0; m < request.markers.length; m += 1) {
    if (textIsInvalid(request.markers[m]?.text ?? "")) {
      return refuse("midi.text_invalid", frozenPath("markers", m, "text"));
    }
  }
  const boundEventIds = new Set<ChordEventId>(
    plan.events.map((event) => event.eventId),
  );
  for (let m = 0; m < request.markers.length; m += 1) {
    const marker = request.markers[m];
    if (marker === undefined || !boundEventIds.has(marker.eventId)) {
      return refuse("midi.marker_unbound", frozenPath("markers", m, "eventId"));
    }
  }
  const seenMarkerKeys = new Set<string>();
  for (let m = 0; m < request.markers.length; m += 1) {
    const marker = request.markers[m];
    const key = `${marker?.kind ?? ""}|${marker?.eventId ?? ""}`;
    if (seenMarkerKeys.has(key)) {
      return refuse("midi.marker_duplicate", frozenPath("markers", m));
    }
    seenMarkerKeys.add(key);
  }
  return null;
}

/**
 * Every delta a track will emit must fit a four-byte VLQ. The voicing
 * track's deltas are exactly the adjacent gaps of the merged emission
 * ticks; the conductor track's marker/end-of-track gaps can span several
 * of those and are checked separately with the same owner law.
 */
function validateVlqDeltas(
  plan: PlaybackPlan,
  sortedMarkerTicks: readonly number[],
): MidiExportRefusal | null {
  const mergedTicks: number[] = [0];
  for (const event of plan.events) {
    mergedTicks.push(
      event.startTick,
      event.startTick + event.gateDurationTicks,
    );
  }
  mergedTicks.push(plan.totalTicks);
  mergedTicks.sort((a, b) => a - b);
  for (let i = 1; i < mergedTicks.length; i += 1) {
    const previous = mergedTicks[i - 1] ?? 0;
    const current = mergedTicks[i] ?? 0;
    if (current - previous > MAX_MIDI_EXPORT_VLQ_VALUE) {
      return refuse(
        "midi.vlq_overflow",
        frozenPath("plan", "events", vlqOwnerIndex(plan, current), "startTick"),
      );
    }
  }
  const conductorTicks = [0, ...sortedMarkerTicks, plan.totalTicks];
  for (let i = 1; i < conductorTicks.length; i += 1) {
    const previous = conductorTicks[i - 1] ?? 0;
    const current = conductorTicks[i] ?? 0;
    if (current - previous > MAX_MIDI_EXPORT_VLQ_VALUE) {
      return refuse(
        "midi.vlq_overflow",
        frozenPath("plan", "events", vlqOwnerIndex(plan, current), "startTick"),
      );
    }
  }
  return null;
}

function pushVlq(out: number[], value: number): void {
  if (value < 0x80) {
    out.push(value);
    return;
  }
  const groups: number[] = [];
  let remaining = value;
  while (remaining > 0) {
    groups.unshift(remaining & 0x7f);
    remaining = Math.floor(remaining / 0x80);
  }
  for (let i = 0; i < groups.length; i += 1) {
    const group = groups[i] ?? 0;
    out.push(i < groups.length - 1 ? group | 0x80 : group);
  }
}

function pushMeta(
  out: number[],
  metaType: number,
  payload: readonly number[],
): void {
  out.push(0xff, metaType);
  pushVlq(out, payload.length);
  for (const byte of payload) out.push(byte);
}

type SortedMarker = Readonly<{ tick: number; text: string }>;

function emitConductorTrack(
  request: MidiExportRequest,
  sortedMarkers: readonly SortedMarker[],
): number[] {
  const plan = request.plan;
  const out: number[] = [];
  pushVlq(out, 0);
  pushMeta(out, MIDI_EXPORT_META_TYPES.trackName, [
    ...textEncoder.encode(request.title),
  ]);
  const microseconds = Math.round(
    MIDI_EXPORT_MICROSECONDS_PER_MINUTE / plan.tempoBpm,
  );
  pushVlq(out, 0);
  pushMeta(out, MIDI_EXPORT_META_TYPES.setTempo, [
    (microseconds >> 16) & 0xff,
    (microseconds >> 8) & 0xff,
    microseconds & 0xff,
  ]);
  pushVlq(out, 0);
  pushMeta(out, MIDI_EXPORT_META_TYPES.timeSignature, [
    plan.meter.beatsPerBar & 0xff,
    Math.log2(plan.meter.beatUnit) & 0xff,
    MIDI_EXPORT_TIME_SIGNATURE_CLOCKS_PER_CLICK,
    MIDI_EXPORT_TIME_SIGNATURE_32NDS_PER_QUARTER,
  ]);
  let lastTick = 0;
  for (const marker of sortedMarkers) {
    pushVlq(out, marker.tick - lastTick);
    lastTick = marker.tick;
    pushMeta(out, MIDI_EXPORT_META_TYPES.marker, [
      ...textEncoder.encode(marker.text),
    ]);
  }
  pushVlq(out, plan.totalTicks - lastTick);
  pushMeta(out, MIDI_EXPORT_META_TYPES.endOfTrack, []);
  return out;
}

type NoteEmission = Readonly<{ tick: number; on: boolean; note: number }>;

function collectNoteEmissions(plan: PlaybackPlan): NoteEmission[] {
  const notes: NoteEmission[] = [];
  for (const event of plan.events) {
    for (const note of event.midiPitches) {
      notes.push({ tick: event.startTick, on: true, note });
      notes.push({
        tick: event.startTick + event.gateDurationTicks,
        on: false,
        note,
      });
    }
  }
  notes.sort(
    (a, b) =>
      a.tick - b.tick ||
      (a.on === b.on ? 0 : a.on ? 1 : -1) ||
      a.note - b.note,
  );
  return notes;
}

function emitVoicingTrack(
  request: MidiExportRequest,
  notes: readonly NoteEmission[],
): number[] {
  const out: number[] = [];
  pushVlq(out, 0);
  pushMeta(out, MIDI_EXPORT_META_TYPES.trackName, [
    ...textEncoder.encode(request.voicingTrackName),
  ]);
  pushVlq(out, 0);
  pushMeta(out, MIDI_EXPORT_META_TYPES.instrumentName, [
    ...textEncoder.encode(request.instrumentName),
  ]);
  let lastTick = 0;
  let runningStatus: number | null = null;
  for (const note of notes) {
    pushVlq(out, note.tick - lastTick);
    lastTick = note.tick;
    const status = note.on ? NOTE_ON_STATUS : NOTE_OFF_STATUS;
    if (runningStatus !== status) out.push(status);
    runningStatus = status;
    out.push(
      note.note,
      note.on ? MIDI_EXPORT_VELOCITY : MIDI_EXPORT_NOTE_OFF_VELOCITY,
    );
  }
  pushVlq(out, request.plan.totalTicks - lastTick);
  pushMeta(out, MIDI_EXPORT_META_TYPES.endOfTrack, []);
  return out;
}

function deriveLosses(request: MidiExportRequest): readonly MidiExportLoss[] {
  const plan = request.plan;
  const losses: MidiExportLoss[] = [];
  const spelledLossEventIds = plan.events
    .filter((event) => event.pitches.some((pitch) => pitch.alter !== 0))
    .map((event) => event.eventId);
  if (spelledLossEventIds.length > 0) {
    losses.push(
      Object.freeze({
        kind: "enharmonic-spelling" as const,
        eventIds: Object.freeze(spelledLossEventIds),
        detail:
          "MIDI note numbers cannot encode these spellings; canonical symbols remain in markers and JSON",
      }),
    );
  }
  const chordMarkedEventIds = new Set<ChordEventId>(
    request.markers
      .filter((marker) => marker.kind === "chord")
      .map((marker) => marker.eventId),
  );
  const unannotatedEventIds = plan.events
    .filter((event) => !chordMarkedEventIds.has(event.eventId))
    .map((event) => event.eventId);
  if (unannotatedEventIds.length > 0) {
    losses.push(
      Object.freeze({
        kind: "annotation-text" as const,
        eventIds: Object.freeze(unannotatedEventIds),
        detail: "no chord marker was supplied for these events",
      }),
    );
  }
  if (plan.loop !== null) {
    losses.push(
      Object.freeze({
        kind: "loop-range" as const,
        eventIds: Object.freeze([] as ChordEventId[]),
        detail:
          "SMF format 1 has no loop chunk; the plan loop is reported, not encoded",
      }),
    );
  }
  return Object.freeze(losses);
}

function deriveFilename(documentId: string): string {
  const sanitized = documentId.replaceAll(FILENAME_UNSAFE_PATTERN, "-");
  const budget =
    MAX_MIDI_EXPORT_FILENAME_CHARS -
    MIDI_EXPORT_FILENAME_PREFIX.length -
    MIDI_EXPORT_FILENAME_SUFFIX.length;
  return (
    MIDI_EXPORT_FILENAME_PREFIX +
    sanitized.slice(0, budget) +
    MIDI_EXPORT_FILENAME_SUFFIX
  );
}

function writeUint32(target: Uint8Array, at: number, value: number): void {
  target[at] = (value >>> 24) & 0xff;
  target[at + 1] = (value >>> 16) & 0xff;
  target[at + 2] = (value >>> 8) & 0xff;
  target[at + 3] = value & 0xff;
}

function writeUint16(target: Uint8Array, at: number, value: number): void {
  target[at] = (value >>> 8) & 0xff;
  target[at + 1] = value & 0xff;
}

function writeAscii(target: Uint8Array, at: number, text: string): void {
  for (let i = 0; i < text.length; i += 1) {
    target[at + i] = text.charCodeAt(i);
  }
}

function assembleFile(
  conductorTrack: readonly number[],
  voicingTrack: readonly number[],
): Uint8Array {
  const totalBytes =
    HEADER_CHUNK_BYTES +
    TRACK_HEADER_BYTES +
    conductorTrack.length +
    TRACK_HEADER_BYTES +
    voicingTrack.length;
  const bytes = new Uint8Array(totalBytes);
  writeAscii(bytes, 0, "MThd");
  writeUint32(bytes, 4, 6);
  writeUint16(bytes, 8, MIDI_EXPORT_FORMAT);
  writeUint16(bytes, 10, MIDI_EXPORT_TRACK_COUNT);
  writeUint16(bytes, 12, MIDI_EXPORT_DIVISION);
  let at = HEADER_CHUNK_BYTES;
  for (const track of [conductorTrack, voicingTrack]) {
    writeAscii(bytes, at, "MTrk");
    writeUint32(bytes, at + 4, track.length);
    at += TRACK_HEADER_BYTES;
    for (const byte of track) {
      bytes[at] = byte;
      at += 1;
    }
  }
  return bytes;
}

function exportMidiOwned(request: MidiExportRequest): MidiExportResult {
  const stageRefusal = validateRequestStages(request);
  if (stageRefusal !== null) {
    return Object.freeze({ ok: false as const, refusal: stageRefusal });
  }
  const plan = request.plan;
  const eventById = new Map<ChordEventId, PlaybackEvent>(
    plan.events.map((event) => [event.eventId, event]),
  );
  const sortedMarkers: readonly SortedMarker[] = [...request.markers]
    .sort((a, b) => {
      const eventA = eventById.get(a.eventId);
      const eventB = eventById.get(b.eventId);
      const tickA = eventA?.startTick ?? 0;
      const tickB = eventB?.startTick ?? 0;
      return (
        tickA - tickB ||
        markerKindRank(a.kind) - markerKindRank(b.kind) ||
        (eventA?.ordinal ?? 0) - (eventB?.ordinal ?? 0)
      );
    })
    .map((marker) => ({
      tick: eventById.get(marker.eventId)?.startTick ?? 0,
      text: marker.text,
    }));
  const vlqRefusal = validateVlqDeltas(
    plan,
    sortedMarkers.map((marker) => marker.tick),
  );
  if (vlqRefusal !== null) {
    return Object.freeze({ ok: false as const, refusal: vlqRefusal });
  }
  const conductorTrack = emitConductorTrack(request, sortedMarkers);
  const notes = collectNoteEmissions(plan);
  const voicingTrack = emitVoicingTrack(request, notes);
  const byteLength =
    HEADER_CHUNK_BYTES +
    TRACK_HEADER_BYTES +
    conductorTrack.length +
    TRACK_HEADER_BYTES +
    voicingTrack.length;
  if (byteLength > MAX_MIDI_EXPORT_BYTES) {
    return Object.freeze({
      ok: false as const,
      refusal: refuse("limit.midi_export_size_exceeded", frozenPath()),
    });
  }
  const bytes = assembleFile(conductorTrack, voicingTrack);
  const encodedMicrosecondsPerQuarter = Math.round(
    MIDI_EXPORT_MICROSECONDS_PER_MINUTE / plan.tempoBpm,
  );
  const report: MidiExportReport = Object.freeze({
    schema: MIDI_EXPORT_REPORT_SCHEMA,
    requestId: request.requestId,
    documentId: request.documentId,
    sourceRevision: request.sourceRevision,
    writerId: MIDI_EXPORT_WRITER_ID,
    writerVersion: MIDI_EXPORT_WRITER_VERSION,
    format: MIDI_EXPORT_FORMAT,
    division: MIDI_EXPORT_DIVISION,
    trackCount: MIDI_EXPORT_TRACK_COUNT,
    requestedBpm: plan.tempoBpm,
    encodedMicrosecondsPerQuarter,
    roundingErrorNumerator: Math.abs(
      MIDI_EXPORT_MICROSECONDS_PER_MINUTE -
        encodedMicrosecondsPerQuarter * plan.tempoBpm,
    ),
    roundingErrorDenominator: plan.tempoBpm,
    noteCount: notes.length / 2,
    markerCount: request.markers.length,
    byteLength,
    totalTicks: plan.totalTicks,
    filename: deriveFilename(request.documentId),
    losses: deriveLosses(request),
  });
  return Object.freeze({
    ok: true as const,
    value: Object.freeze({
      schema: MIDI_EXPORT_RESULT_SCHEMA,
      kind: "exported" as const,
      bytes,
      report,
    }),
  });
}

/** Export one finished playback plan as deterministic format-1 SMF bytes. */
export function exportMidi(request: MidiExportRequest): MidiExportResult {
  try {
    return exportMidiOwned(request);
  } catch {
    return Object.freeze({
      ok: false as const,
      refusal: refuse("midi.schema_invalid", frozenPath()),
    });
  }
}

export const midiExportOperations = Object.freeze({
  exportMidi,
} satisfies MidiExportOperations);
