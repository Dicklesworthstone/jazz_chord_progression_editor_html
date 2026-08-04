import {
  createMidiImportOperations,
  type SmfDecodeFrame,
} from "../../src/export/midi-import";
import {
  MIDI_IMPORT_READER_ID,
  MIDI_IMPORT_READER_VERSION,
  MIDI_IMPORT_REQUEST_SCHEMA,
  type MidiImportRefusalCode,
  type MidiImportRequest,
  type MidiImportResolutionOutcome,
  type MidiImportResult,
  type MidiImportSonority,
  type SmfAlienChunk,
  type SmfDecodeCounters,
  type SmfDecodeModel,
  type SmfDecodedTrack,
  type SmfHeaderModel,
  type SmfIgnoredEvent,
  type SmfMeterEntry,
  type SmfTempoEntry,
} from "../../src/export/midi-import-contract";
import { loadSmfWasmDecoder } from "../../src/audio/smf-wasm";
import goldenFixture from "../fixtures/midi-import/golden-cases.json";
import refusalFixture from "../fixtures/midi-import/refusal-cases.json";
import resolutionFixture from "../fixtures/midi-import/resolution-cases.json";
import sonorityFixture from "../fixtures/midi-import/sonority-cases.json";

/**
 * Shared harness for the M0 import corpus.
 *
 * The decoder under test is the REAL embedded wasm module — the same bytes the
 * release artifact carries — reached through the audio-layer host and injected
 * into the export-layer pipeline exactly as the application composition does.
 * Nothing here restates an expectation: every number compared in the suites
 * comes from the independently authored fixtures under
 * `tests/fixtures/midi-import/`.
 */

export type GoldenCase = Readonly<{
  id: string;
  title: string;
  request: Readonly<{ requestId: string }>;
  bytesHex: string;
  expectedModel: Readonly<{
    header: SmfHeaderModel;
    tempoMap: readonly SmfTempoEntry[];
    meterMap: readonly SmfMeterEntry[];
    tracks: readonly SmfDecodedTrack[];
    ignoredEvents: readonly SmfIgnoredEvent[];
    alienChunks: readonly SmfAlienChunk[];
  }>;
  expectedCounters: SmfDecodeCounters;
  expectedSonorities: readonly MidiImportSonority[];
  expectedResolutions: readonly Readonly<{
    sonorityIndex: number;
    outcome: MidiImportResolutionOutcome;
  }>[];
  traceIds: readonly string[];
}>;

export type RefusalCase = Readonly<{
  id: string;
  kind: "request" | "bytes";
  title: string;
  override?: Readonly<{ path: string; value: unknown }>;
  bytesHex?: string;
  byteSpec?: Readonly<{
    segments: readonly Readonly<{
      hex?: string;
      repeatHex?: string;
      count?: number;
    }>[];
  }>;
  expected: Readonly<{
    code: MidiImportRefusalCode;
    pointer: string | null;
    byteOffset: number | null;
    trackIndex: number | null;
  }>;
}>;

export type SonorityCase = Readonly<{
  id: string;
  title: string;
  input: Readonly<{
    ppq: number;
    tempoMap: readonly Readonly<{
      tick: number;
      microsecondsPerQuarter: number;
    }>[];
    meterMap: readonly Readonly<{
      tick: number;
      numerator: number;
      denominatorPower: number;
    }>[];
    notes: readonly Readonly<{
      trackIndex: number;
      channel: number;
      key: number;
      onTick: number;
      offTick: number;
    }>[];
  }>;
  expected: Readonly<{ sonorities: readonly MidiImportSonority[] }>;
}>;

export type ResolutionCase = Readonly<{
  id: string;
  title: string;
  input: Readonly<{ pitchClasses: readonly number[]; bassPitchClass: number }>;
  expected: MidiImportResolutionOutcome;
}>;

/*
 * One documented cast per fixture file, at the load boundary. The JSON is the
 * independently authored authority; typing it as the contract's own shapes is
 * what lets a drifted expectation fail the compiler instead of a comparison.
 */
export const GOLDEN_CASES = goldenFixture.cases as unknown as readonly GoldenCase[];
export const REFUSAL_CASES =
  refusalFixture.cases as unknown as readonly RefusalCase[];
export const SONORITY_CASES =
  sonorityFixture.cases as unknown as readonly SonorityCase[];
export const RESOLUTION_CASES =
  resolutionFixture.cases as unknown as readonly ResolutionCase[];

export function requireGoldenCase(id: string): GoldenCase {
  const found = GOLDEN_CASES.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`M0 golden case missing: ${id}`);
  return found;
}

export function requireRefusalCase(id: string): RefusalCase {
  const found = REFUSAL_CASES.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`M0 refusal case missing: ${id}`);
  return found;
}

export function requireSonorityCase(id: string): SonorityCase {
  const found = SONORITY_CASES.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`M0 sonority case missing: ${id}`);
  return found;
}

export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

/** Expands a refusal case's bytes, including repeat segments, into real bytes. */
export function refusalCaseBytes(entry: RefusalCase): Uint8Array {
  if (entry.bytesHex !== undefined) return hexToBytes(entry.bytesHex);
  const spec = entry.byteSpec;
  if (spec === undefined) {
    return hexToBytes(requireGoldenCase("M0-GLD-005").bytesHex);
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (const segment of spec.segments) {
    if (segment.hex !== undefined) {
      const bytes = hexToBytes(segment.hex);
      chunks.push(bytes);
      total += bytes.byteLength;
      continue;
    }
    if (segment.repeatHex === undefined || segment.count === undefined) continue;
    const unit = hexToBytes(segment.repeatHex);
    const repeated = new Uint8Array(unit.byteLength * segment.count);
    for (let index = 0; index < segment.count; index += 1) {
      repeated.set(unit, index * unit.byteLength);
    }
    chunks.push(repeated);
    total += repeated.byteLength;
  }
  const assembled = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    assembled.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return assembled;
}

export function importRequest(
  requestId: string,
  bytes: Uint8Array,
): MidiImportRequest {
  return Object.freeze({
    schema: MIDI_IMPORT_REQUEST_SCHEMA,
    requestId,
    readerId: MIDI_IMPORT_READER_ID,
    readerVersion: MIDI_IMPORT_READER_VERSION,
    bytes,
  });
}

let cachedDecode: SmfDecodeFrame | null = null;

/** The real embedded wasm decoder, instantiated once per test process. */
export async function realDecodeFrame(): Promise<SmfDecodeFrame> {
  cachedDecode ??= await loadSmfWasmDecoder();
  return cachedDecode;
}

export async function decodeGolden(id: string): Promise<MidiImportResult> {
  const entry = requireGoldenCase(id);
  const decodeFrame = await realDecodeFrame();
  return createMidiImportOperations(decodeFrame).decodeSmf(
    importRequest(entry.request.requestId, hexToBytes(entry.bytesHex)),
  );
}

export function requireDecoded(result: MidiImportResult): Readonly<{
  model: SmfDecodeModel;
  sonorities: readonly MidiImportSonority[];
  resolutions: readonly MidiImportResolutionOutcome[];
}> {
  if (!result.ok) {
    throw new Error(`expected a decoded import, got ${result.refusal.code}`);
  }
  return {
    model: result.value.model,
    sonorities: result.value.sonorities,
    resolutions: result.value.resolutions,
  };
}

/** Path array to the RFC-6901 pointer the fixtures state. */
export function pathToPointer(path: readonly (string | number)[]): string {
  return `/${path.map((segment) => String(segment)).join("/")}`;
}

/**
 * Materializes a decode model around an independently authored note stream so
 * the sonority laws can be proved without a byte layer in the way.
 */
export function modelFromSonorityCase(entry: SonorityCase): SmfDecodeModel {
  const byTrack = new Map<
    number,
    { channel: number; key: number; onTick: number; offTick: number }[]
  >();
  for (const note of entry.input.notes) {
    const list = byTrack.get(note.trackIndex) ?? [];
    list.push({
      channel: note.channel,
      key: note.key,
      onTick: note.onTick,
      offTick: note.offTick,
    });
    byTrack.set(note.trackIndex, list);
  }
  const tracks = [...byTrack.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([index, notes]) =>
      Object.freeze({
        index,
        name: null,
        instrumentName: null,
        markers: Object.freeze([]),
        notes: Object.freeze(
          notes.map((note) =>
            Object.freeze({ ...note, onVelocity: 64 }),
          ),
        ),
      }),
    );
  return Object.freeze({
    schema: "changes.import.smf-decode-model.v1",
    header: Object.freeze({
      format: 1 as const,
      trackCount: tracks.length,
      division: entry.input.ppq,
    }),
    tempoMap: Object.freeze(entry.input.tempoMap.map((e) => Object.freeze(e))),
    meterMap: Object.freeze(entry.input.meterMap.map((e) => Object.freeze(e))),
    tracks: Object.freeze(tracks),
    ignoredEvents: Object.freeze([]),
    alienChunks: Object.freeze([]),
    counters: Object.freeze({
      bytesRead: 0,
      chunksSeen: 0,
      eventsDecoded: 0,
      eventsIgnored: 0,
      notesPaired: entry.input.notes.length,
      peakOpenNotes: 0,
      tempoChanges: entry.input.tempoMap.length,
      meterChanges: entry.input.meterMap.length,
    }),
  });
}
