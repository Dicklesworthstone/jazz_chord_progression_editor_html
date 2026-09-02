/**
 * E1 MIDI export contract validator.
 *
 * Independent authority check for the fixtures under
 * tests/fixtures/midi-export/. This script never imports src/ and restates
 * every frozen constant locally. Each golden is proven two independent
 * ways: its hex bytes are parsed with this script's own minimal SMF reader
 * and diffed against the expected event model, and that model plus the
 * report (including byte length via an independent size calculator) is
 * re-derived from the case's plan spec and request and diffed again.
 */
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type JsonObject = Record<string, unknown>;

export type E1ContractFinding = Readonly<{
  code: string;
  path: string;
  message: string;
}>;

export type E1ContractValidationReport = Readonly<{
  schema: "changes.validation.e1-contract.v1";
  package: "E1";
  outcome: "pass" | "fail";
  counts: Readonly<{
    files: number;
    goldenCases: number;
    refusalCases: number;
    limitCases: number;
    mutationControls: number;
    traces: number;
    authorities: number;
  }>;
  findings: readonly E1ContractFinding[];
}>;

export const E1_FINDING_CODES = Object.freeze([
  "E1_FILES",
  "E1_SCHEMA",
  "E1_MANIFEST",
  "E1_CASE",
  "E1_GOLDEN",
  "E1_REPORT",
  "E1_REFUSAL",
  "E1_LIMIT",
  "E1_FILENAME",
  "E1_TRACE",
  "E1_PROVENANCE",
] as const);

export const E1_FIXTURE_FILES = Object.freeze([
  "e1-midi-export-contract.json",
  "golden-cases.json",
  "limit-cases.json",
  "mutation-controls.json",
  "provenance-ledger.json",
  "refusal-cases.json",
  "trace-ledger.json",
] as const);

const DEFAULT_FIXTURE_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../tests/fixtures/midi-export",
);

/** Locally restated frozen constants; the src module never certifies itself. */
const LOCAL = Object.freeze({
  format: 1,
  trackCount: 2,
  division: 960,
  channel: 0,
  onVelocity: 96,
  offVelocity: 0,
  microsecondsPerMinute: 60_000_000,
  minBpm: 20,
  maxBpm: 400,
  maxVlq: 0x0f_ff_ff_ff,
  maxEvents: 8192,
  maxNotes: 131_072,
  maxMarkers: 8256,
  maxTextBytes: 96,
  maxFilenameChars: 64,
  requestIdPattern: /^[A-Za-z0-9._-]{1,128}$/u,
  requestSchema: "changes.export.midi-export-request.v1",
  planSchema: "changes.playback.plan.v1",
  writerId: "changes.midi-export",
  writerVersion: 1,
  filenamePrefix: "changes-",
  filenameSuffix: ".mid",
});

const META = Object.freeze({
  trackName: 0x03,
  instrumentName: 0x04,
  marker: 0x06,
  endOfTrack: 0x2f,
  setTempo: 0x51,
  timeSignature: 0x58,
});

const REFUSAL_CODES = Object.freeze([
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

const LOSS_KINDS = Object.freeze([
  "enharmonic-spelling",
  "annotation-text",
  "loop-range",
  /* E1 additive amendment (jcpe-u0mc): doubled note numbers inside one
   * event export one on/off pair and report this loss. */
  "unison-doubling",
] as const);

const EVIDENCE_OWNER_PATTERN =
  /^tests\/(?:unit|integration)\/[a-z0-9-]+\.test\.ts$/u;
const STATIC_EVIDENCE_OWNER = "tests/static/e1-contract.test.ts";

class Findings {
  readonly list: E1ContractFinding[] = [];
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
/* Compact request model                                              */
/* ------------------------------------------------------------------ */

type Pitch = Readonly<{ step: string; alter: number; octave: number; midi: number }>;
type PlanEvent = Readonly<{
  eventId: string;
  ordinal: number;
  startTick: number;
  durationTicks: number;
  gateDurationTicks: number;
  pitches: readonly Pitch[];
}>;
type PlanSpec = Readonly<{
  documentId: string;
  tempoBpm: number;
  meter: Readonly<{ beatsPerBar: number; beatUnit: number }>;
  totalTicks: number;
  loop: Readonly<{ startTick: number; endTick: number }> | null;
  events: readonly PlanEvent[];
}>;
type Marker = Readonly<{ kind: string; eventId: string; text: string }>;
type CompactRequest = {
  schema: string;
  writerId: string;
  writerVersion: number;
  requestId: string;
  documentId: string;
  sourceRevision: number;
  title: string;
  voicingTrackName: string;
  instrumentName: string;
  markers: Marker[];
  plan: {
    schema: string;
    midiPpq: number;
    sourceDocumentId: string;
    tempoBpm: number;
    meter: { beatsPerBar: number; beatUnit: number };
    totalTicks: number;
    loop: { startTick: number; endTick: number } | null;
    events: PlanEvent[];
  };
};

function buildCompactRequest(
  caseRequest: JsonObject,
  planSpec: PlanSpec,
  defaults: JsonObject,
): CompactRequest {
  return {
    schema: LOCAL.requestSchema,
    writerId: LOCAL.writerId,
    writerVersion: LOCAL.writerVersion,
    requestId: caseRequest["requestId"] as string,
    documentId: caseRequest["documentId"] as string,
    sourceRevision:
      (caseRequest["sourceRevision"] as number | undefined) ??
      (defaults["sourceRevision"] as number),
    title: caseRequest["title"] as string,
    voicingTrackName:
      (caseRequest["voicingTrackName"] as string | undefined) ??
      (defaults["voicingTrackName"] as string),
    instrumentName:
      (caseRequest["instrumentName"] as string | undefined) ??
      (defaults["instrumentName"] as string),
    markers: [...((caseRequest["markers"] as Marker[] | undefined) ?? [])],
    plan: {
      schema: LOCAL.planSchema,
      midiPpq: LOCAL.division,
      sourceDocumentId: planSpec.documentId,
      tempoBpm: planSpec.tempoBpm,
      meter: { ...planSpec.meter },
      totalTicks: planSpec.totalTicks,
      loop: planSpec.loop === null ? null : { ...planSpec.loop },
      events: planSpec.events.map((event) => ({ ...event })),
    },
  };
}

/* ------------------------------------------------------------------ */
/* Reference request validation (precedence order)                    */
/* ------------------------------------------------------------------ */

type ReferenceRefusal = Readonly<{ code: string; pointer: string }>;

function textInvalid(value: string): boolean {
  const bytes = new TextEncoder().encode(value);
  if (bytes.length < 1 || bytes.length > LOCAL.maxTextBytes) return true;
  for (const codePoint of value) {
    const code = codePoint.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

function emissionTicks(plan: CompactRequest["plan"]): readonly number[] {
  const ticks: number[] = [0];
  for (const event of plan.events) {
    ticks.push(event.startTick, event.startTick + event.gateDurationTicks);
  }
  ticks.push(plan.totalTicks);
  return ticks.sort((a, b) => a - b);
}

function validateRequest(request: CompactRequest): ReferenceRefusal | null {
  if (request.schema !== LOCAL.requestSchema) {
    return { code: "midi.schema_invalid", pointer: "/schema" };
  }
  if (request.writerId !== LOCAL.writerId) {
    return { code: "midi.policy_invalid", pointer: "/writerId" };
  }
  if (request.writerVersion !== LOCAL.writerVersion) {
    return { code: "midi.policy_invalid", pointer: "/writerVersion" };
  }
  if (!LOCAL.requestIdPattern.test(request.requestId)) {
    return { code: "midi.request_id_invalid", pointer: "/requestId" };
  }
  if (
    !Number.isInteger(request.sourceRevision) ||
    request.sourceRevision < 0
  ) {
    return { code: "midi.revision_invalid", pointer: "/sourceRevision" };
  }
  if (request.documentId !== request.plan.sourceDocumentId) {
    return { code: "midi.document_mismatch", pointer: "/documentId" };
  }
  const plan = request.plan;
  if (plan.schema !== LOCAL.planSchema) {
    return { code: "midi.plan_invalid", pointer: "/plan/schema" };
  }
  if (plan.midiPpq !== LOCAL.division) {
    return { code: "midi.plan_invalid", pointer: "/plan/midiPpq" };
  }
  if (plan.events.length > LOCAL.maxEvents) {
    return { code: "midi.plan_invalid", pointer: "/plan/events" };
  }
  let noteCount = 0;
  for (let i = 0; i < plan.events.length; i += 1) {
    const event = plan.events[i];
    if (!event) continue;
    if (event.ordinal !== i) {
      return { code: "midi.plan_invalid", pointer: `/plan/events/${String(i)}/ordinal` };
    }
    /* E1 amendment (jcpe-u0mc): a doubled note number no longer refuses —
     * it emits one on/off pair, so the cap counts distinct numbers. */
    noteCount += new Set(event.pitches.map((pitch) => pitch.midi)).size;
  }
  if (noteCount > LOCAL.maxNotes) {
    return { code: "midi.plan_invalid", pointer: "/plan/events" };
  }
  if (request.markers.length > LOCAL.maxMarkers) {
    return { code: "midi.plan_invalid", pointer: "/markers" };
  }
  if (
    !Number.isInteger(plan.tempoBpm) ||
    plan.tempoBpm < LOCAL.minBpm ||
    plan.tempoBpm > LOCAL.maxBpm
  ) {
    return { code: "midi.tempo_invalid", pointer: "/plan/tempoBpm" };
  }
  const { beatsPerBar, beatUnit } = plan.meter;
  const power = Math.log2(beatUnit);
  if (
    !Number.isInteger(beatsPerBar) ||
    beatsPerBar < 1 ||
    beatsPerBar > 255 ||
    !Number.isInteger(power) ||
    beatUnit < 1 ||
    beatUnit > 32
  ) {
    return { code: "midi.meter_invalid", pointer: "/plan/meter/beatUnit" };
  }
  for (let i = 1; i < plan.events.length; i += 1) {
    if ((plan.events[i]?.startTick ?? 0) < (plan.events[i - 1]?.startTick ?? 0)) {
      return {
        code: "midi.event_order_invalid",
        pointer: `/plan/events/${String(i)}/startTick`,
      };
    }
  }
  for (let i = 0; i < plan.events.length; i += 1) {
    const event = plan.events[i];
    if (!event) continue;
    for (let p = 0; p < event.pitches.length; p += 1) {
      const midi = event.pitches[p]?.midi ?? 0;
      if (!Number.isInteger(midi) || midi < 0 || midi > 127) {
        return {
          code: "midi.pitch_out_of_range",
          pointer: `/plan/events/${String(i)}/midiPitches/${String(p)}`,
        };
      }
    }
  }
  for (let i = 0; i < plan.events.length; i += 1) {
    const event = plan.events[i];
    if (!event) continue;
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
      return {
        code: "midi.gate_invalid",
        pointer: `/plan/events/${String(i)}/gateDurationTicks`,
      };
    }
  }
  for (const [field, value] of [
    ["/title", request.title],
    ["/voicingTrackName", request.voicingTrackName],
    ["/instrumentName", request.instrumentName],
  ] as const) {
    if (textInvalid(value)) return { code: "midi.text_invalid", pointer: field };
  }
  for (let m = 0; m < request.markers.length; m += 1) {
    if (textInvalid(request.markers[m]?.text ?? "")) {
      return { code: "midi.text_invalid", pointer: `/markers/${String(m)}/text` };
    }
  }
  const eventIds = new Set(plan.events.map((event) => event.eventId));
  for (let m = 0; m < request.markers.length; m += 1) {
    if (!eventIds.has(request.markers[m]?.eventId ?? "")) {
      return { code: "midi.marker_unbound", pointer: `/markers/${String(m)}/eventId` };
    }
  }
  const markerKeys = new Set<string>();
  for (let m = 0; m < request.markers.length; m += 1) {
    const marker = request.markers[m];
    const key = `${marker?.kind ?? ""}|${marker?.eventId ?? ""}`;
    if (markerKeys.has(key)) {
      return { code: "midi.marker_duplicate", pointer: `/markers/${String(m)}` };
    }
    markerKeys.add(key);
  }
  const ticks = emissionTicks(plan);
  for (let i = 1; i < ticks.length; i += 1) {
    const delta = (ticks[i] ?? 0) - (ticks[i - 1] ?? 0);
    if (delta > LOCAL.maxVlq) {
      const owner = plan.events.findIndex(
        (event) =>
          event.startTick === ticks[i] ||
          event.startTick + event.gateDurationTicks === ticks[i],
      );
      return {
        code: "midi.vlq_overflow",
        pointer: `/plan/events/${String(owner < 0 ? 0 : owner)}/startTick`,
      };
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Independent SMF parser                                             */
/* ------------------------------------------------------------------ */

type ModelEvent = JsonObject;

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

function parseSmf(bytes: Uint8Array): {
  division: number;
  format: number;
  tracks: ModelEvent[][];
} {
  let at = 0;
  const u8 = (): number => {
    const value = bytes[at];
    if (value === undefined) throw new Error("unexpected end of file");
    at += 1;
    return value;
  };
  const u16 = (): number => (u8() << 8) | u8();
  const u32 = (): number => (u16() << 16) | u16();
  const expectAscii = (text: string): void => {
    for (const char of text) {
      if (u8() !== char.charCodeAt(0)) throw new Error(`missing ${text}`);
    }
  };
  expectAscii("MThd");
  if (u32() !== 6) throw new Error("bad header length");
  const format = u16();
  const ntrks = u16();
  const division = u16();
  const tracks: ModelEvent[][] = [];
  for (let t = 0; t < ntrks; t += 1) {
    expectAscii("MTrk");
    const length = u32();
    const end = at + length;
    const events: ModelEvent[] = [];
    let tick = 0;
    let runningStatus: number | null = null;
    while (at < end) {
      let delta = 0;
      for (;;) {
        const byte = u8();
        delta = (delta << 7) | (byte & 0x7f);
        if ((byte & 0x80) === 0) break;
      }
      tick += delta;
      let status = bytes[at];
      if (status === undefined) throw new Error("truncated event");
      if (status === 0xff) {
        at += 1;
        const type = u8();
        let len = 0;
        for (;;) {
          const byte = u8();
          len = (len << 7) | (byte & 0x7f);
          if ((byte & 0x80) === 0) break;
        }
        const data = bytes.slice(at, at + len);
        at += len;
        runningStatus = null;
        if (type === META.trackName) {
          events.push({ tick, type: "track-name", text: new TextDecoder().decode(data) });
        } else if (type === META.instrumentName) {
          events.push({ tick, type: "instrument-name", text: new TextDecoder().decode(data) });
        } else if (type === META.marker) {
          events.push({ tick, type: "marker", text: new TextDecoder().decode(data) });
        } else if (type === META.setTempo) {
          if (len !== 3) throw new Error("bad tempo length");
          const microseconds =
            ((data[0] ?? 0) << 16) | ((data[1] ?? 0) << 8) | (data[2] ?? 0);
          events.push({ tick, type: "tempo", microseconds });
        } else if (type === META.timeSignature) {
          if (len !== 4) throw new Error("bad time-signature length");
          if (data[2] !== 24 || data[3] !== 8) {
            throw new Error("unexpected clocks/32nds payload");
          }
          events.push({
            tick,
            type: "time-signature",
            numerator: data[0] ?? 0,
            denominatorPower: data[1] ?? 0,
          });
        } else if (type === META.endOfTrack) {
          if (len !== 0) throw new Error("bad end-of-track length");
          events.push({ tick, type: "end-of-track" });
        } else {
          throw new Error(`unexpected meta type ${String(type)}`);
        }
        continue;
      }
      if ((status & 0x80) !== 0) {
        at += 1;
        runningStatus = status;
      } else {
        if (runningStatus === null) throw new Error("dangling running status");
        status = runningStatus;
      }
      const kind = status & 0xf0;
      const channel = status & 0x0f;
      if (channel !== LOCAL.channel) throw new Error("unexpected channel");
      const note = u8();
      const velocity = u8();
      if (kind === 0x90) {
        if (velocity !== LOCAL.onVelocity) throw new Error("unexpected on velocity");
        events.push({ tick, kind: "on", note });
      } else if (kind === 0x80) {
        if (velocity !== LOCAL.offVelocity) throw new Error("unexpected off velocity");
        events.push({ tick, kind: "off", note });
      } else {
        throw new Error(`unexpected status ${String(status)}`);
      }
    }
    if (at !== end) throw new Error("track length mismatch");
    const last = events[events.length - 1];
    if (!last || last["type"] !== "end-of-track") {
      throw new Error("track does not end with end-of-track");
    }
    tracks.push(events);
  }
  if (at !== bytes.length) throw new Error("trailing bytes");
  return { division, format, tracks };
}

/* ------------------------------------------------------------------ */
/* Independent derivation from the plan spec                          */
/* ------------------------------------------------------------------ */

function vlqSize(value: number): number {
  if (value < 0x80) return 1;
  if (value < 0x4000) return 2;
  if (value < 0x20_0000) return 3;
  return 4;
}

function textBytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

function deriveFilename(documentId: string): string {
  const sanitized = documentId.replaceAll(/[^A-Za-z0-9._-]/gu, "-");
  const budget =
    LOCAL.maxFilenameChars -
    LOCAL.filenamePrefix.length -
    LOCAL.filenameSuffix.length;
  return (
    LOCAL.filenamePrefix + sanitized.slice(0, budget) + LOCAL.filenameSuffix
  );
}

type Derived = Readonly<{
  track0: readonly ModelEvent[];
  track1: readonly ModelEvent[];
  report: JsonObject;
}>;

function deriveModel(request: CompactRequest): Derived {
  const plan = request.plan;
  const encoded = Math.round(LOCAL.microsecondsPerMinute / plan.tempoBpm);
  const ordinalByEventId = new Map(
    plan.events.map((event) => [event.eventId, event.ordinal]),
  );
  const markerRank = (marker: Marker): readonly [number, number] => [
    marker.kind === "section" ? 0 : 1,
    ordinalByEventId.get(marker.eventId) ?? 0,
  ];
  const markers = [...request.markers].sort((a, b) => {
    const tickA = plan.events[ordinalByEventId.get(a.eventId) ?? 0]?.startTick ?? 0;
    const tickB = plan.events[ordinalByEventId.get(b.eventId) ?? 0]?.startTick ?? 0;
    if (tickA !== tickB) return tickA - tickB;
    const [kindA, ordA] = markerRank(a);
    const [kindB, ordB] = markerRank(b);
    return kindA - kindB || ordA - ordB;
  });
  const track0: ModelEvent[] = [
    { tick: 0, type: "track-name", text: request.title },
    { tick: 0, type: "tempo", microseconds: encoded },
    {
      tick: 0,
      type: "time-signature",
      numerator: plan.meter.beatsPerBar,
      denominatorPower: Math.log2(plan.meter.beatUnit),
    },
    ...markers.map((marker) => ({
      tick: plan.events[ordinalByEventId.get(marker.eventId) ?? 0]?.startTick ?? 0,
      type: "marker",
      text: marker.text,
    })),
    { tick: plan.totalTicks, type: "end-of-track" },
  ];
  type NoteEvent = { tick: number; kind: "on" | "off"; note: number };
  const notes: NoteEvent[] = [];
  for (const event of plan.events) {
    /* E1 amendment (jcpe-u0mc): one pair per DISTINCT note number; a
     * doubled unison collapses and is reported as a unison-doubling loss. */
    for (const midi of new Set(event.pitches.map((pitch) => pitch.midi))) {
      notes.push({ tick: event.startTick, kind: "on", note: midi });
      notes.push({
        tick: event.startTick + event.gateDurationTicks,
        kind: "off",
        note: midi,
      });
    }
  }
  notes.sort(
    (a, b) =>
      a.tick - b.tick ||
      (a.kind === b.kind ? 0 : a.kind === "off" ? -1 : 1) ||
      a.note - b.note,
  );
  const track1: ModelEvent[] = [
    { tick: 0, type: "track-name", text: request.voicingTrackName },
    { tick: 0, type: "instrument-name", text: request.instrumentName },
    ...notes,
    { tick: plan.totalTicks, type: "end-of-track" },
  ];

  const trackSize = (events: readonly ModelEvent[]): number => {
    let size = 0;
    let lastTick = 0;
    let runningStatus: number | null = null;
    for (const event of events) {
      const tick = event["tick"] as number;
      size += vlqSize(tick - lastTick);
      lastTick = tick;
      const type = event["type"] as string | undefined;
      if (type !== undefined) {
        const payload =
          type === "tempo"
            ? 3
            : type === "time-signature"
              ? 4
              : type === "end-of-track"
                ? 0
                : textBytes(event["text"] as string);
        size += 2 + vlqSize(payload) + payload;
        runningStatus = null;
        continue;
      }
      const status = event["kind"] === "on" ? 0x90 : 0x80;
      size += runningStatus === status ? 2 : 3;
      runningStatus = status;
    }
    return size;
  };
  const byteLength =
    14 + 8 + trackSize(track0) + 8 + trackSize(track1);

  const losses: JsonObject[] = [];
  const spelledLossEvents = plan.events
    .filter((event) => event.pitches.some((pitch) => pitch.alter !== 0))
    .map((event) => event.eventId);
  if (spelledLossEvents.length > 0) {
    losses.push({
      kind: "enharmonic-spelling",
      eventIds: spelledLossEvents,
      detail:
        "MIDI note numbers cannot encode these spellings; canonical symbols remain in markers and JSON",
    });
  }
  const chordMarked = new Set(
    request.markers
      .filter((marker) => marker.kind === "chord")
      .map((marker) => marker.eventId),
  );
  const unannotated = plan.events
    .filter((event) => !chordMarked.has(event.eventId))
    .map((event) => event.eventId);
  if (unannotated.length > 0) {
    losses.push({
      kind: "annotation-text",
      eventIds: unannotated,
      detail: "no chord marker was supplied for these events",
    });
  }
  if (plan.loop !== null) {
    losses.push({
      kind: "loop-range",
      eventIds: [],
      detail:
        "SMF format 1 has no loop chunk; the plan loop is reported, not encoded",
    });
  }
  const doubledEvents = plan.events
    .filter(
      (event) =>
        new Set(event.pitches.map((pitch) => pitch.midi)).size <
        event.pitches.length,
    )
    .map((event) => event.eventId);
  if (doubledEvents.length > 0) {
    losses.push({
      kind: "unison-doubling",
      eventIds: doubledEvents,
      detail:
        "a note number doubled inside one event sounds as one note-on/off pair; the stored voicing keeps the doubling",
    });
  }
  losses.sort(
    (a, b) =>
      LOSS_KINDS.indexOf(a["kind"] as (typeof LOSS_KINDS)[number]) -
      LOSS_KINDS.indexOf(b["kind"] as (typeof LOSS_KINDS)[number]),
  );

  const report: JsonObject = {
    requestedBpm: plan.tempoBpm,
    encodedMicrosecondsPerQuarter: encoded,
    roundingErrorNumerator: Math.abs(
      LOCAL.microsecondsPerMinute - encoded * plan.tempoBpm,
    ),
    roundingErrorDenominator: plan.tempoBpm,
    noteCount: notes.length / 2,
    markerCount: request.markers.length,
    byteLength,
    totalTicks: plan.totalTicks,
    filename: deriveFilename(request.documentId),
    losses,
  };
  return { track0, track1, report };
}

/* ------------------------------------------------------------------ */
/* Case checks                                                        */
/* ------------------------------------------------------------------ */

function planSpecOf(record: JsonObject): PlanSpec {
  return record["planSpec"] as PlanSpec;
}

function checkGoldenCase(
  findings: Findings,
  path: string,
  record: JsonObject,
  defaults: JsonObject,
): void {
  const request = buildCompactRequest(
    record["request"] as JsonObject,
    planSpecOf(record),
    defaults,
  );
  const refusal = validateRequest(request);
  if (refusal) {
    findings.add(
      "E1_CASE",
      path,
      `golden request unexpectedly refused: ${refusal.code} at ${refusal.pointer}`,
    );
    return;
  }
  const expectedModel = record["expectedModel"] as JsonObject;
  const expectedReport = record["expectedReport"] as JsonObject;
  let parsed: ReturnType<typeof parseSmf>;
  try {
    parsed = parseSmf(hexToBytes(record["bytesHex"] as string));
  } catch (error) {
    findings.add("E1_GOLDEN", path, `golden bytes do not parse: ${String(error)}`);
    return;
  }
  if (parsed.format !== LOCAL.format || parsed.division !== LOCAL.division) {
    findings.add("E1_GOLDEN", path, "golden header format/division mismatch");
  }
  if (parsed.tracks.length !== LOCAL.trackCount) {
    findings.add("E1_GOLDEN", path, "golden track count mismatch");
    return;
  }
  findings.equal(
    "E1_GOLDEN",
    `${path}/parsed/track0`,
    parsed.tracks[0],
    expectedModel["track0"],
    "parsed conductor track",
  );
  findings.equal(
    "E1_GOLDEN",
    `${path}/parsed/track1`,
    parsed.tracks[1],
    expectedModel["track1"],
    "parsed voicing track",
  );
  const derived = deriveModel(request);
  findings.equal(
    "E1_GOLDEN",
    `${path}/derived/track0`,
    derived.track0,
    expectedModel["track0"],
    "derived conductor track",
  );
  findings.equal(
    "E1_GOLDEN",
    `${path}/derived/track1`,
    derived.track1,
    expectedModel["track1"],
    "derived voicing track",
  );
  findings.equal(
    "E1_REPORT",
    `${path}/report`,
    derived.report,
    expectedReport,
    "derived report",
  );
  const hexLength = (record["bytesHex"] as string).length / 2;
  if (hexLength !== (expectedReport["byteLength"] as number)) {
    findings.add("E1_REPORT", `${path}/report/byteLength`, "golden byte length mismatch");
  }
}

function applyOverride(
  request: CompactRequest,
  override: Readonly<{ path: string; value: unknown }>,
): CompactRequest {
  const cloned = JSON.parse(JSON.stringify(request)) as CompactRequest;
  const { path, value } = override;
  if (path === "/plan/events" && value === "reorder-descending-start-ticks") {
    const first = cloned.plan.events[0];
    if (first) {
      cloned.plan.totalTicks = 2000;
      cloned.plan.events = [
        { ...first, ordinal: 0, startTick: 480 },
        { ...first, eventId: "event-0001", ordinal: 1, startTick: 0 },
      ];
    }
    return cloned;
  }
  if (path === "/markers" && value === "duplicate-first-marker") {
    const first = cloned.markers[0];
    if (first) cloned.markers = [first, { ...first }];
    return cloned;
  }
  if (path === "/plan" && value === "sparse-event-at-tick-268435456") {
    const first = cloned.plan.events[0];
    if (first) {
      cloned.plan.events = [{ ...first, startTick: 268_435_456 }];
      cloned.plan.totalTicks = 268_435_456 + first.durationTicks;
    }
    return cloned;
  }
  if (path === "/plan/events/0/startTick" && value === "shift-event-to-max-vlq") {
    const first = cloned.plan.events[0];
    if (first) {
      cloned.plan.events = [{ ...first, startTick: LOCAL.maxVlq - first.durationTicks }];
      cloned.plan.totalTicks = LOCAL.maxVlq;
    }
    return cloned;
  }
  const midiPitchMatch = /^\/plan\/events\/(\d+)\/midiPitches\/(\d+)$/u.exec(path);
  if (midiPitchMatch) {
    const event = cloned.plan.events[Number(midiPitchMatch[1])];
    const pitch = event?.pitches[Number(midiPitchMatch[2])];
    if (event && pitch) {
      const pitches = [...event.pitches];
      pitches[Number(midiPitchMatch[2])] = { ...pitch, midi: value as number };
      cloned.plan.events[Number(midiPitchMatch[1])] = { ...event, pitches };
    }
    return cloned;
  }
  if (typeof value === "object" && value !== null && "repeatChar" in value) {
    const spec = value as { repeatChar: string; count: number };
    return applyOverride(request, {
      path,
      value: spec.repeatChar.repeat(spec.count),
    });
  }
  if (typeof value === "object" && value !== null && "generateMarkers" in value) {
    const spec = value as { generateMarkers: number };
    const eventId = cloned.plan.events[0]?.eventId ?? "event-0000";
    cloned.markers = Array.from({ length: spec.generateMarkers }, (_, index) => ({
      kind: "chord",
      eventId,
      text: `m${String(index)}`,
    }));
    return cloned;
  }
  const mutated = applyMutation(cloned, {
    operation: "replace",
    pointer: path,
    value,
  });
  return mutated as CompactRequest;
}

function checkRefusalCase(
  findings: Findings,
  path: string,
  record: JsonObject,
  base: CompactRequest,
): void {
  const override = record["override"] as { path: string; value: unknown };
  const expected = record["expected"] as JsonObject;
  const request = applyOverride(base, override);
  const refusal = validateRequest(request);
  if (!refusal) {
    findings.add("E1_REFUSAL", path, "expected a refusal, request validated");
    return;
  }
  findings.equal("E1_REFUSAL", `${path}/code`, refusal.code, expected["code"], "refusal code");
  findings.equal(
    "E1_REFUSAL",
    `${path}/pointer`,
    refusal.pointer,
    expected["pointer"],
    "refusal pointer",
  );
}

function checkLimitCase(
  findings: Findings,
  path: string,
  record: JsonObject,
  base: CompactRequest,
): void {
  const kind = record["kind"] as string;
  const expected = record["expected"] as JsonObject;
  if (kind === "filename") {
    const derived = deriveFilename(record["documentId"] as string);
    findings.equal("E1_FILENAME", `${path}/filename`, derived, expected["filename"], "filename");
    if (derived.length > LOCAL.maxFilenameChars) {
      findings.add("E1_FILENAME", `${path}/filename`, "derived filename exceeds the cap");
    }
    return;
  }
  const override = record["override"] as { path: string; value: unknown };
  const request = applyOverride(base, override);
  const refusal = validateRequest(request);
  const expectedRefusal = expected["refusal"] as JsonObject | null;
  if (expectedRefusal === null) {
    if (refusal) {
      findings.add(
        "E1_LIMIT",
        path,
        `expected acceptance, refused ${refusal.code} at ${refusal.pointer}`,
      );
    }
    return;
  }
  if (!refusal) {
    findings.add("E1_LIMIT", path, "expected a refusal, request validated");
    return;
  }
  findings.equal("E1_LIMIT", `${path}/code`, refusal.code, expectedRefusal["code"], "refusal code");
  findings.equal(
    "E1_LIMIT",
    `${path}/pointer`,
    refusal.pointer,
    expectedRefusal["pointer"],
    "refusal pointer",
  );
}

/* ------------------------------------------------------------------ */
/* Manifest, traces, provenance, mutation checks                      */
/* ------------------------------------------------------------------ */

function checkManifest(fixtures: Map<string, JsonObject>, findings: Findings): void {
  const manifest = fixtures.get("e1-midi-export-contract.json");
  if (!manifest) return;
  const path = "e1-midi-export-contract.json";
  const smf = manifest["smf"] as JsonObject | undefined;
  findings.equal("E1_MANIFEST", `${path}#/smf/format`, smf?.["format"], LOCAL.format, "format");
  findings.equal("E1_MANIFEST", `${path}#/smf/trackCount`, smf?.["trackCount"], LOCAL.trackCount, "track count");
  findings.equal("E1_MANIFEST", `${path}#/smf/division`, smf?.["division"], LOCAL.division, "division");
  findings.equal("E1_MANIFEST", `${path}#/smf/channel`, smf?.["channel"], LOCAL.channel, "channel");
  findings.equal("E1_MANIFEST", `${path}#/smf/noteOnVelocity`, smf?.["noteOnVelocity"], LOCAL.onVelocity, "on velocity");
  findings.equal("E1_MANIFEST", `${path}#/smf/noteOffVelocity`, smf?.["noteOffVelocity"], LOCAL.offVelocity, "off velocity");
  findings.equal("E1_MANIFEST", `${path}#/smf/maxVlqValue`, smf?.["maxVlqValue"], LOCAL.maxVlq, "max VLQ");
  findings.equal(
    "E1_MANIFEST",
    `${path}#/smf/metaTypes`,
    smf?.["metaTypes"],
    {
      trackName: META.trackName,
      instrumentName: META.instrumentName,
      marker: META.marker,
      endOfTrack: META.endOfTrack,
      setTempo: META.setTempo,
      timeSignature: META.timeSignature,
    },
    "meta types",
  );
  findings.equal(
    "E1_MANIFEST",
    `${path}#/refusalCodes`,
    manifest["refusalCodes"],
    REFUSAL_CODES,
    "refusal codes",
  );
  findings.equal(
    "E1_MANIFEST",
    `${path}#/validationPrecedence`,
    manifest["validationPrecedence"],
    REFUSAL_CODES,
    "validation precedence",
  );
  findings.equal(
    "E1_MANIFEST",
    `${path}#/lossKinds`,
    manifest["lossKinds"],
    LOSS_KINDS,
    "loss kinds",
  );
  const limits = manifest["limits"] as JsonObject | undefined;
  findings.equal("E1_MANIFEST", `${path}#/limits/maxEvents`, limits?.["maxEvents"], LOCAL.maxEvents, "max events");
  findings.equal("E1_MANIFEST", `${path}#/limits/maxNotes`, limits?.["maxNotes"], LOCAL.maxNotes, "max notes");
  findings.equal("E1_MANIFEST", `${path}#/limits/maxMarkers`, limits?.["maxMarkers"], LOCAL.maxMarkers, "max markers");
  findings.equal("E1_MANIFEST", `${path}#/limits/maxTextUtf8Bytes`, limits?.["maxTextUtf8Bytes"], LOCAL.maxTextBytes, "max text bytes");
  findings.equal("E1_MANIFEST", `${path}#/limits/maxFilenameChars`, limits?.["maxFilenameChars"], LOCAL.maxFilenameChars, "max filename chars");
  findings.equal(
    "E1_MANIFEST",
    `${path}#/declaredFiles`,
    manifest["declaredFiles"],
    E1_FIXTURE_FILES,
    "declared files",
  );
  const tempo = manifest["tempo"] as JsonObject | undefined;
  findings.equal("E1_MANIFEST", `${path}#/tempo/minBpm`, tempo?.["minBpm"], LOCAL.minBpm, "min bpm");
  findings.equal("E1_MANIFEST", `${path}#/tempo/maxBpm`, tempo?.["maxBpm"], LOCAL.maxBpm, "max bpm");
}

type CaseIndex = Map<string, { file: string; record: JsonObject }>;

function collectCases(fixtures: Map<string, JsonObject>): CaseIndex {
  const cases: CaseIndex = new Map();
  for (const file of ["golden-cases.json", "refusal-cases.json", "limit-cases.json"]) {
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
      findings.add("E1_TRACE", `trace-ledger.json#${traceId}`, "trace names no case");
    }
    for (const caseId of caseIds) {
      if (!cases.has(caseId)) {
        findings.add("E1_TRACE", `trace-ledger.json#${traceId}`, `unknown case ${caseId}`);
        continue;
      }
      coveredCases.add(caseId);
      if (!caseToTraces.get(caseId)?.has(traceId)) {
        findings.add(
          "E1_TRACE",
          `trace-ledger.json#${traceId}`,
          `case ${caseId} does not list this trace`,
        );
      }
    }
    for (const controlId of (trace["controlIds"] as string[] | undefined) ?? []) {
      if (!controlIds.has(controlId)) {
        findings.add("E1_TRACE", `trace-ledger.json#${traceId}`, `unknown control ${controlId}`);
      } else {
        coveredControls.add(controlId);
      }
    }
    const owner = trace["evidenceOwner"] as string;
    if (owner !== STATIC_EVIDENCE_OWNER && !EVIDENCE_OWNER_PATTERN.test(owner)) {
      findings.add("E1_TRACE", `trace-ledger.json#${traceId}`, `invalid evidence owner ${owner}`);
    }
  }
  const traceIds = new Set(traces.map((trace) => trace["id"] as string));
  for (const [caseId, listed] of caseToTraces) {
    if (!coveredCases.has(caseId)) {
      findings.add("E1_TRACE", "trace-ledger.json", `case ${caseId} belongs to no trace`);
    }
    for (const traceId of listed) {
      if (!traceIds.has(traceId)) {
        findings.add("E1_TRACE", `${caseId}/traceIds`, `unknown trace ${traceId}`);
        continue;
      }
      const trace = traces.find((row) => row["id"] === traceId);
      const listedCases = (trace?.["caseIds"] as string[] | undefined) ?? [];
      if (!listedCases.includes(caseId)) {
        findings.add("E1_TRACE", `${caseId}/traceIds`, `trace ${traceId} does not list this case`);
      }
    }
  }
  for (const controlId of controlIds) {
    if (!coveredControls.has(controlId)) {
      findings.add("E1_TRACE", "trace-ledger.json", `control ${controlId} belongs to no trace`);
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
    findings.add("E1_PROVENANCE", "provenance-ledger.json#/expectedValuesGenerated", "must be false");
  }
  if (ledger["productionOutputUsed"] !== false) {
    findings.add("E1_PROVENANCE", "provenance-ledger.json#/productionOutputUsed", "must be false");
  }
  if (ledger["reviewState"] !== "reviewed-for-e1-spec") {
    findings.add("E1_PROVENANCE", "provenance-ledger.json#/reviewState", "unexpected review state");
  }
  const authorities = new Set(
    ((ledger["authorities"] as JsonObject[] | undefined) ?? []).map(
      (authority) => authority["id"] as string,
    ),
  );
  for (const required of [
    "E1-AUTH-SMF",
    "E1-AUTH-PLAN",
    "E1-AUTH-DERIVED",
    "E1-AUTH-INDEPENDENCE",
  ]) {
    if (!authorities.has(required)) {
      findings.add("E1_PROVENANCE", "provenance-ledger.json#/authorities", `missing ${required}`);
    }
  }
  for (const [caseId, entry] of cases) {
    for (const authorityId of (entry.record["authorityIds"] as string[] | undefined) ?? []) {
      if (!authorities.has(authorityId)) {
        findings.add("E1_PROVENANCE", `${caseId}/authorityIds`, `unknown authority ${authorityId}`);
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
    if (seen.has(id)) findings.add("E1_CASE", path, "duplicate control id");
    seen.add(id);
    const file = control["file"] as string;
    if (!(E1_FIXTURE_FILES as readonly string[]).includes(file)) {
      findings.add("E1_CASE", path, `unknown file ${file}`);
      continue;
    }
    if (
      !(E1_FINDING_CODES as readonly string[]).includes(
        control["expectedFindingCode"] as string,
      )
    ) {
      findings.add("E1_CASE", path, "unknown expected finding code");
    }
    const target = fixtures.get(file);
    if (target && resolvePointer(target, control["pointer"] as string) === undefined) {
      findings.add("E1_CASE", path, `pointer ${String(control["pointer"])} does not resolve`);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Entry                                                              */
/* ------------------------------------------------------------------ */

export type E1Overlay = Readonly<{ file: string; document: unknown }>;

export async function validateE1Contract(
  overlay?: E1Overlay,
  fixtureRoot: string = DEFAULT_FIXTURE_ROOT,
): Promise<E1ContractValidationReport> {
  const findings = new Findings();
  const fixtures = new Map<string, JsonObject>();
  for (const file of E1_FIXTURE_FILES) {
    try {
      const raw = await readFile(resolve(fixtureRoot, file), "utf8");
      fixtures.set(file, JSON.parse(raw) as JsonObject);
    } catch (error) {
      findings.add("E1_FILES", file, `unreadable fixture: ${String(error)}`);
    }
  }
  if (overlay) fixtures.set(overlay.file, overlay.document as JsonObject);
  const expectedSchemas: Readonly<Record<string, string>> = {
    "e1-midi-export-contract.json": "changes.fixtures.e1-midi-export-contract.v1",
    "golden-cases.json": "changes.fixtures.e1-golden-cases.v1",
    "limit-cases.json": "changes.fixtures.e1-limit-cases.v1",
    "mutation-controls.json": "changes.fixtures.e1-mutation-controls.v1",
    "provenance-ledger.json": "changes.fixtures.e1-provenance-ledger.v1",
    "refusal-cases.json": "changes.fixtures.e1-refusal-cases.v1",
    "trace-ledger.json": "changes.fixtures.e1-trace-ledger.v1",
  };
  for (const [file, schema] of Object.entries(expectedSchemas)) {
    const fixture = fixtures.get(file);
    if (fixture && fixture["schema"] !== schema) {
      findings.add("E1_SCHEMA", file, `expected schema ${schema}`);
    }
  }
  checkManifest(fixtures, findings);

  const golden = fixtures.get("golden-cases.json");
  const goldenDefaults = (golden?.["requestDefaults"] as JsonObject | undefined) ?? {};
  const goldenCases = (golden?.["cases"] as JsonObject[] | undefined) ?? [];
  for (const record of goldenCases) {
    checkGoldenCase(
      findings,
      `golden-cases.json#${String(record["id"])}`,
      record,
      goldenDefaults,
    );
  }

  const baseRecord = goldenCases.find((record) => record["id"] === "E1-GLD-001");
  let base: CompactRequest | null = null;
  if (baseRecord) {
    base = buildCompactRequest(
      baseRecord["request"] as JsonObject,
      planSpecOf(baseRecord),
      goldenDefaults,
    );
  }
  const refusalCases =
    (fixtures.get("refusal-cases.json")?.["cases"] as JsonObject[] | undefined) ?? [];
  const limitCases =
    (fixtures.get("limit-cases.json")?.["cases"] as JsonObject[] | undefined) ?? [];
  if (base) {
    for (const record of refusalCases) {
      checkRefusalCase(
        findings,
        `refusal-cases.json#${String(record["id"])}`,
        record,
        base,
      );
    }
    for (const record of limitCases) {
      checkLimitCase(
        findings,
        `limit-cases.json#${String(record["id"])}`,
        record,
        base,
      );
    }
  } else {
    findings.add("E1_CASE", "golden-cases.json", "missing base case E1-GLD-001");
  }

  const cases = collectCases(fixtures);
  checkTraces(findings, fixtures, cases);
  checkProvenance(findings, fixtures, cases);
  checkMutationControls(findings, fixtures);

  const controls = fixtures.get("mutation-controls.json");
  const traces = fixtures.get("trace-ledger.json");
  const provenance = fixtures.get("provenance-ledger.json");
  return {
    schema: "changes.validation.e1-contract.v1",
    package: "E1",
    outcome: findings.list.length === 0 ? "pass" : "fail",
    counts: {
      files: fixtures.size,
      goldenCases: goldenCases.length,
      refusalCases: refusalCases.length,
      limitCases: limitCases.length,
      mutationControls: ((controls?.["controls"] as JsonObject[] | undefined) ?? []).length,
      traces: ((traces?.["traces"] as JsonObject[] | undefined) ?? []).length,
      authorities: ((provenance?.["authorities"] as JsonObject[] | undefined) ?? []).length,
    },
    findings: findings.list,
  };
}

async function main(): Promise<void> {
  const report = await validateE1Contract();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.outcome === "pass" ? 0 : 1;
}

if (import.meta.main) {
  await main();
}
