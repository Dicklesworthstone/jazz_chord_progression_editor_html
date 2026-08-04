/**
 * E1 MIDI-export test kit.
 *
 * Translates the independently authored fixtures under
 * tests/fixtures/midi-export/ into real production requests, replays the
 * fixture override vocabulary, and parses production bytes with its own
 * minimal SMF reader. Expected values always come from the reviewed
 * fixtures; this kit only translates representations and never derives an
 * expectation from production output.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type {
  ChordEventId,
  DocumentId,
  DomainPath,
} from "../../src/domain";
import type { PlaybackEvent, PlaybackPlan } from "../../src/playback";
import {
  MIDI_EXPORT_MARKER_SCHEMA,
  MIDI_EXPORT_REQUEST_SCHEMA,
  MIDI_EXPORT_WRITER_ID,
  MIDI_EXPORT_WRITER_VERSION,
  type MidiExportRequest,
  type MidiExportResult,
} from "../../src/export";

const FIXTURE_DIR = resolve(
  import.meta.dirname,
  "../fixtures/midi-export",
);

/* ------------------------------------------------------------------ */
/* Fixture shapes                                                     */
/* ------------------------------------------------------------------ */

export type E1FixturePitch = Readonly<{
  step: string;
  alter: number;
  octave: number;
  midi: number;
}>;

export type E1FixturePlanEvent = Readonly<{
  eventId: string;
  ordinal: number;
  startTick: number;
  durationTicks: number;
  gateDurationTicks: number;
  pitches: readonly E1FixturePitch[];
}>;

export type E1FixturePlanSpec = Readonly<{
  documentId: string;
  tempoBpm: number;
  meter: Readonly<{ beatsPerBar: number; beatUnit: number }>;
  totalTicks: number;
  loop: Readonly<{ startTick: number; endTick: number }> | null;
  events: readonly E1FixturePlanEvent[];
}>;

export type E1FixtureMarker = Readonly<{
  kind: string;
  eventId: string;
  text: string;
}>;

export type E1FixtureCaseRequest = Readonly<{
  requestId: string;
  documentId: string;
  title: string;
  sourceRevision?: number;
  voicingTrackName?: string;
  instrumentName?: string;
  markers?: readonly E1FixtureMarker[];
}>;

export type E1GoldenCase = Readonly<{
  id: string;
  title: string;
  request: E1FixtureCaseRequest;
  planSpec: E1FixturePlanSpec;
  bytesHex: string;
  expectedModel: Readonly<{
    track0: readonly Record<string, unknown>[];
    track1: readonly Record<string, unknown>[];
  }>;
  expectedReport: Record<string, unknown>;
}>;

export type E1Override = Readonly<{ path: string; value: unknown }>;

export type E1RefusalCase = Readonly<{
  id: string;
  override: E1Override;
  expected: Readonly<{ code: string; pointer: string }>;
}>;

export type E1LimitCase = Readonly<{
  id: string;
  kind: "validate" | "filename";
  override?: E1Override;
  documentId?: string;
  expected: Readonly<{
    refusal?: Readonly<{ code: string; pointer: string }> | null;
    filename?: string;
  }>;
}>;

type GoldenFixtureFile = Readonly<{
  requestDefaults: Readonly<{
    sourceRevision: number;
    voicingTrackName: string;
    instrumentName: string;
  }>;
  cases: readonly E1GoldenCase[];
}>;

let cachedGoldenFile: GoldenFixtureFile | null = null;
let cachedRefusalCases: readonly E1RefusalCase[] | null = null;
let cachedLimitCases: readonly E1LimitCase[] | null = null;

async function loadJson(name: string): Promise<unknown> {
  const raw = await readFile(resolve(FIXTURE_DIR, name), "utf8");
  return JSON.parse(raw) as unknown;
}

export async function loadGoldenFixture(): Promise<GoldenFixtureFile> {
  cachedGoldenFile ??= (await loadJson(
    "golden-cases.json",
  )) as GoldenFixtureFile;
  return cachedGoldenFile;
}

export async function requireGoldenCase(id: string): Promise<E1GoldenCase> {
  const fixture = await loadGoldenFixture();
  const found = fixture.cases.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`unknown golden case ${id}`);
  return found;
}

export async function loadRefusalCases(): Promise<readonly E1RefusalCase[]> {
  if (cachedRefusalCases === null) {
    const parsed = (await loadJson("refusal-cases.json")) as Readonly<{
      cases: readonly E1RefusalCase[];
    }>;
    cachedRefusalCases = parsed.cases;
  }
  return cachedRefusalCases;
}

export async function loadLimitCases(): Promise<readonly E1LimitCase[]> {
  if (cachedLimitCases === null) {
    const parsed = (await loadJson("limit-cases.json")) as Readonly<{
      cases: readonly E1LimitCase[];
    }>;
    cachedLimitCases = parsed.cases;
  }
  return cachedLimitCases;
}

/* ------------------------------------------------------------------ */
/* Compact request: the validator-aligned intermediate representation */
/* ------------------------------------------------------------------ */

export type E1CompactRequest = {
  schema: string;
  writerId: string;
  writerVersion: number;
  requestId: string;
  documentId: string;
  sourceRevision: number;
  title: string;
  voicingTrackName: string;
  instrumentName: string;
  markers: E1FixtureMarker[];
  plan: {
    documentId: string;
    tempoBpm: number;
    meter: { beatsPerBar: number; beatUnit: number };
    totalTicks: number;
    loop: { startTick: number; endTick: number } | null;
    events: E1FixturePlanEvent[];
  };
};

export async function compactRequestForCase(
  goldenCase: E1GoldenCase,
): Promise<E1CompactRequest> {
  const defaults = (await loadGoldenFixture()).requestDefaults;
  const request = goldenCase.request;
  return {
    schema: MIDI_EXPORT_REQUEST_SCHEMA,
    writerId: MIDI_EXPORT_WRITER_ID,
    writerVersion: MIDI_EXPORT_WRITER_VERSION,
    requestId: request.requestId,
    documentId: request.documentId,
    sourceRevision: request.sourceRevision ?? defaults.sourceRevision,
    title: request.title,
    voicingTrackName:
      request.voicingTrackName ?? defaults.voicingTrackName,
    instrumentName: request.instrumentName ?? defaults.instrumentName,
    markers: [...(request.markers ?? [])],
    plan: {
      documentId: goldenCase.planSpec.documentId,
      tempoBpm: goldenCase.planSpec.tempoBpm,
      meter: { ...goldenCase.planSpec.meter },
      totalTicks: goldenCase.planSpec.totalTicks,
      loop:
        goldenCase.planSpec.loop === null
          ? null
          : { ...goldenCase.planSpec.loop },
      events: goldenCase.planSpec.events.map((event) => ({
        ...event,
        pitches: event.pitches.map((pitch) => ({ ...pitch })),
      })),
    },
  };
}

/* ------------------------------------------------------------------ */
/* Override vocabulary (mirrors the fixture semantics exactly)        */
/* ------------------------------------------------------------------ */

const MAX_VLQ = 0x0f_ff_ff_ff;

function applyPointerReplace(
  document: unknown,
  pointer: string,
  value: unknown,
): void {
  const parts = pointer
    .split("/")
    .slice(1)
    .map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"));
  if (parts.length === 0) throw new Error("empty pointer");
  let parent: unknown = document;
  for (const part of parts.slice(0, -1)) {
    if (Array.isArray(parent)) parent = parent[Number(part)];
    else if (typeof parent === "object" && parent !== null)
      parent = (parent as Record<string, unknown>)[part];
    else throw new Error(`unresolvable pointer ${pointer}`);
  }
  const leaf = parts[parts.length - 1] ?? "";
  if (Array.isArray(parent)) {
    parent[Number(leaf)] = value;
    return;
  }
  if (typeof parent !== "object" || parent === null) {
    throw new Error(`unresolvable pointer ${pointer}`);
  }
  (parent as Record<string, unknown>)[leaf] = value;
}

export function applyE1Override(
  request: E1CompactRequest,
  override: E1Override,
): E1CompactRequest {
  const cloned = JSON.parse(JSON.stringify(request)) as E1CompactRequest;
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
  if (
    path === "/plan/events/0/startTick" &&
    value === "shift-event-to-max-vlq"
  ) {
    const first = cloned.plan.events[0];
    if (first) {
      cloned.plan.events = [
        { ...first, startTick: MAX_VLQ - first.durationTicks },
      ];
      cloned.plan.totalTicks = MAX_VLQ;
    }
    return cloned;
  }
  const midiPitchMatch = /^\/plan\/events\/(\d+)\/midiPitches\/(\d+)$/u.exec(
    path,
  );
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
    return applyE1Override(request, {
      path,
      value: spec.repeatChar.repeat(spec.count),
    });
  }
  if (
    typeof value === "object" &&
    value !== null &&
    "generateMarkers" in value
  ) {
    const spec = value as { generateMarkers: number };
    const eventId = cloned.plan.events[0]?.eventId ?? "event-0000";
    cloned.markers = Array.from(
      { length: spec.generateMarkers },
      (_, index) => ({ kind: "chord", eventId, text: `m${String(index)}` }),
    );
    return cloned;
  }
  applyPointerReplace(cloned, path, value);
  return cloned;
}

/* ------------------------------------------------------------------ */
/* Materialization into the real production request                   */
/* ------------------------------------------------------------------ */

function greatestCommonDivisor(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const next = x % y;
    x = y;
    y = next;
  }
  return x === 0 ? 1 : x;
}

/** Exact quarter-note fraction for a PPQ-960 tick count. */
function beatFractionFromTicks(ticks: number): {
  numerator: number;
  denominator: number;
} {
  if (!Number.isInteger(ticks) || ticks < 0) {
    return { numerator: ticks, denominator: 960 };
  }
  const divisor = greatestCommonDivisor(ticks, 960);
  return { numerator: ticks / divisor, denominator: 960 / divisor };
}

/**
 * Overrides may retarget pin fields the compact shape does not normally
 * carry (for example /plan/schema); an overridden value must reach the
 * materialized request instead of being silently replaced by the pin.
 */
function pick(
  source: object,
  key: string,
  fallback: unknown,
): unknown {
  const record = source as Record<string, unknown>;
  return key in record ? record[key] : fallback;
}

function materializeEvent(
  compact: E1FixturePlanEvent,
  index: number,
): PlaybackEvent {
  const startBeat = beatFractionFromTicks(compact.startTick);
  const durationBeats = beatFractionFromTicks(compact.durationTicks);
  const gateBeats = beatFractionFromTicks(compact.gateDurationTicks);
  return {
    schema: pick(compact, "schema", "changes.playback.event.v1"),
    ordinal: compact.ordinal,
    sourceOrdinal: index,
    eventId: compact.eventId,
    sectionId: "section-0000",
    measureId: "measure-0000",
    sourceStartBeat: startBeat,
    sourceDurationBeats: durationBeats,
    sourceStartTick: compact.startTick,
    sourceDurationTicks: compact.durationTicks,
    sourceOffsetBeats: null,
    sourceOffsetTicks: null,
    startBeat,
    durationBeats,
    gateDurationBeats: gateBeats,
    startTick: compact.startTick,
    durationTicks: compact.durationTicks,
    gateDurationTicks: compact.gateDurationTicks,
    pitches: compact.pitches.map((pitch) => ({
      step: pitch.step,
      alter: pitch.alter,
      octave: pitch.octave,
    })),
    midiPitches: compact.pitches.map((pitch) => pitch.midi),
    velocity: pick(compact, "velocity", 96),
    articulation: "ordinary",
  } as unknown as PlaybackEvent;
}

export function materializeE1Request(
  compact: E1CompactRequest,
): MidiExportRequest {
  const compactPlan = compact.plan;
  const plan: PlaybackPlan = {
    schema: pick(compactPlan, "schema", "changes.playback.plan.v1"),
    compilerId: pick(
      compactPlan,
      "compilerId",
      "changes.playback-plan-compiler",
    ),
    compilerVersion: pick(compactPlan, "compilerVersion", 1),
    articulationPolicyId: pick(
      compactPlan,
      "articulationPolicyId",
      "changes.playback-articulation",
    ),
    articulationPolicyVersion: pick(
      compactPlan,
      "articulationPolicyVersion",
      1,
    ),
    loopPolicyId: pick(compactPlan, "loopPolicyId", "changes.playback-loop"),
    loopPolicyVersion: pick(compactPlan, "loopPolicyVersion", 1),
    velocityPolicyId: pick(
      compactPlan,
      "velocityPolicyId",
      "changes.playback-velocity",
    ),
    velocityPolicyVersion: pick(compactPlan, "velocityPolicyVersion", 1),
    realizationBindingPolicyId: pick(
      compactPlan,
      "realizationBindingPolicyId",
      "changes.playback-realization-binding",
    ),
    realizationBindingPolicyVersion: pick(
      compactPlan,
      "realizationBindingPolicyVersion",
      1,
    ),
    sourceDocumentId: compact.plan.documentId,
    midiPpq: pick(compactPlan, "midiPpq", 960),
    tempoBpm: compact.plan.tempoBpm,
    meter: { ...compact.plan.meter },
    events: compact.plan.events.map((event, index) =>
      materializeEvent(event, index),
    ),
    totalBeats: beatFractionFromTicks(compact.plan.totalTicks),
    totalTicks: compact.plan.totalTicks,
    loop:
      compact.plan.loop === null
        ? null
        : {
            start: beatFractionFromTicks(compact.plan.loop.startTick),
            end: beatFractionFromTicks(compact.plan.loop.endTick),
          },
    loopTicks:
      compact.plan.loop === null
        ? null
        : {
            start: compact.plan.loop.startTick,
            end: compact.plan.loop.endTick,
          },
  } as unknown as PlaybackPlan;
  return {
    schema: compact.schema,
    requestId: compact.requestId,
    writerId: compact.writerId,
    writerVersion: compact.writerVersion,
    documentId: compact.documentId,
    sourceRevision: compact.sourceRevision,
    title: compact.title,
    voicingTrackName: compact.voicingTrackName,
    instrumentName: compact.instrumentName,
    markers: compact.markers.map((marker) => ({
      schema: MIDI_EXPORT_MARKER_SCHEMA,
      kind: marker.kind,
      eventId: marker.eventId,
      text: marker.text,
    })),
    plan,
  } as unknown as MidiExportRequest;
}

export async function goldenRequest(id: string): Promise<MidiExportRequest> {
  return materializeE1Request(
    await compactRequestForCase(await requireGoldenCase(id)),
  );
}

/** The E1-GLD-001 base with one fixture override applied. */
export async function overriddenBaseRequest(
  override: E1Override,
): Promise<MidiExportRequest> {
  const base = await compactRequestForCase(
    await requireGoldenCase("E1-GLD-001"),
  );
  return materializeE1Request(applyE1Override(base, override));
}

/* ------------------------------------------------------------------ */
/* Result helpers                                                     */
/* ------------------------------------------------------------------ */

export function pathToPointer(path: DomainPath): string {
  return `/${path.map(String).join("/")}`;
}

export function requireExported(
  result: MidiExportResult,
): Extract<MidiExportResult, { ok: true }>["value"] {
  if (!result.ok) {
    throw new Error(
      `expected an export, refused ${result.refusal.code} at ${pathToPointer(
        result.refusal.path,
      )}`,
    );
  }
  return result.value;
}

export function requireRefusal(
  result: MidiExportResult,
): Extract<MidiExportResult, { ok: false }>["refusal"] {
  if (result.ok) {
    throw new Error("expected a refusal, the request exported");
  }
  return result.refusal;
}

export function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0").toUpperCase();
  }
  return hex;
}

export function deepFreezeRequest(request: MidiExportRequest): MidiExportRequest {
  const freeze = (value: unknown): void => {
    if (typeof value !== "object" || value === null) return;
    if (value instanceof Uint8Array) return;
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  };
  freeze(request);
  return request;
}

/* ------------------------------------------------------------------ */
/* Independent minimal SMF reader (kit-owned, validator-independent)  */
/* ------------------------------------------------------------------ */

export type ParsedSmf = Readonly<{
  format: number;
  trackCount: number;
  division: number;
  tracks: readonly (readonly Record<string, unknown>[])[];
}>;

export function parseSmfBytes(bytes: Uint8Array): ParsedSmf {
  let at = 0;
  const u8 = (): number => {
    const value = bytes[at];
    if (value === undefined) throw new Error("unexpected end of file");
    at += 1;
    return value;
  };
  const u16 = (): number => (u8() << 8) | u8();
  const u32 = (): number => (u16() << 16) | u16();
  const ascii = (expected: string): void => {
    for (const character of expected) {
      if (u8() !== character.charCodeAt(0)) {
        throw new Error(`missing ${expected}`);
      }
    }
  };
  const vlq = (): number => {
    let value = 0;
    for (;;) {
      const byte = u8();
      value = value * 0x80 + (byte & 0x7f);
      if ((byte & 0x80) === 0) return value;
    }
  };
  ascii("MThd");
  if (u32() !== 6) throw new Error("bad header length");
  const format = u16();
  const trackCount = u16();
  const division = u16();
  const decoder = new TextDecoder();
  const tracks: Record<string, unknown>[][] = [];
  for (let t = 0; t < trackCount; t += 1) {
    ascii("MTrk");
    const length = u32();
    const end = at + length;
    const events: Record<string, unknown>[] = [];
    let tick = 0;
    let runningStatus: number | null = null;
    while (at < end) {
      tick += vlq();
      let status = bytes[at];
      if (status === undefined) throw new Error("truncated event");
      if (status === 0xff) {
        at += 1;
        const metaType = u8();
        const payloadLength = vlq();
        const payload = bytes.slice(at, at + payloadLength);
        at += payloadLength;
        runningStatus = null;
        if (metaType === 0x03) {
          events.push({ tick, type: "track-name", text: decoder.decode(payload) });
        } else if (metaType === 0x04) {
          events.push({
            tick,
            type: "instrument-name",
            text: decoder.decode(payload),
          });
        } else if (metaType === 0x06) {
          events.push({ tick, type: "marker", text: decoder.decode(payload) });
        } else if (metaType === 0x51) {
          if (payloadLength !== 3) throw new Error("bad tempo length");
          events.push({
            tick,
            type: "tempo",
            microseconds:
              ((payload[0] ?? 0) << 16) |
              ((payload[1] ?? 0) << 8) |
              (payload[2] ?? 0),
          });
        } else if (metaType === 0x58) {
          if (payloadLength !== 4) throw new Error("bad time-signature length");
          if (payload[2] !== 24 || payload[3] !== 8) {
            throw new Error("unexpected clocks/32nds payload");
          }
          events.push({
            tick,
            type: "time-signature",
            numerator: payload[0] ?? 0,
            denominatorPower: payload[1] ?? 0,
          });
        } else if (metaType === 0x2f) {
          if (payloadLength !== 0) throw new Error("bad end-of-track length");
          events.push({ tick, type: "end-of-track" });
        } else {
          throw new Error(`unexpected meta type ${String(metaType)}`);
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
      if ((status & 0x0f) !== 0) throw new Error("unexpected channel");
      const note = u8();
      const velocity = u8();
      if (kind === 0x90) {
        if (velocity !== 96) throw new Error("unexpected on velocity");
        events.push({ tick, kind: "on", note });
      } else if (kind === 0x80) {
        if (velocity !== 0) throw new Error("unexpected off velocity");
        events.push({ tick, kind: "off", note });
      } else {
        throw new Error(`unexpected status ${String(status)}`);
      }
    }
    if (at !== end) throw new Error("track length mismatch");
    tracks.push(events);
  }
  if (at !== bytes.length) throw new Error("trailing bytes");
  return { format, trackCount, division, tracks };
}

export type { ChordEventId, DocumentId };
