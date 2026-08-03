/**
 * M0 independent-corpus conformance (bead jcpe-v3c2.3).
 *
 * The spec packet's own corpus proves the build against the values its authors
 * froze. This suite proves the SHIPPED decoder against a second, independently
 * authored corpus — `tests/fixtures/m0-verify/authored-corpus.json` — whose
 * files were produced outside this repository's writer and whose expected
 * refusal offsets are known by construction rather than observed from
 * production. The decoder under test is the real embedded wasm module.
 *
 * The heavy independent work (a freshly written reference reader, the law
 * oracles, the seeded fuzz, the three-engine browser run) lives in
 * `scripts/verify-m0-evidence.ts`. What is locked here is the part that must
 * fail an ordinary `bun test` the moment the shipped behaviour drifts.
 */
import { describe, expect, test } from "bun:test";

import { createMidiImportOperations } from "../../src/export/midi-import";
import {
  MIDI_IMPORT_REFUSAL_CODES,
  type MidiImportRefusalCode,
  type MidiImportRequest,
  type MidiImportResult,
} from "../../src/export/midi-import-contract";
import corpusFixture from "../fixtures/m0-verify/authored-corpus.json";
import {
  hexToBytes,
  importRequest,
  realDecodeFrame,
} from "../support/midi-import-test-kit";

type CorpusSegment = Readonly<{
  hex?: string;
  repeatHex?: string;
  count?: number;
}>;

type AcceptedFile = Readonly<{
  id: string;
  title: string;
  traits: readonly string[];
  bytesHex: string;
  expectedModel: unknown;
  expectedSonorities: unknown;
  expectedResolutions: unknown;
}>;

type HostileFile = Readonly<{
  id: string;
  title: string;
  bytesHex?: string;
  byteSpec?: Readonly<{ segments: readonly CorpusSegment[] }>;
  expected: Readonly<{
    code: MidiImportRefusalCode;
    byteOffset: number | null;
    trackIndex: number | null;
  }>;
}>;

/* One documented cast at the load boundary; the JSON is the authority. */
const CORPUS = corpusFixture as unknown as Readonly<{
  schema: string;
  productionOutputUsed: boolean;
  expectedValuesGenerated: boolean;
  acceptedFiles: readonly AcceptedFile[];
  hostileFiles: readonly HostileFile[];
}>;

function expand(entry: HostileFile): Uint8Array {
  if (entry.bytesHex !== undefined) return hexToBytes(entry.bytesHex);
  const spec = entry.byteSpec;
  if (spec === undefined) return new Uint8Array(0);
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

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
      .join(",")}}`;
  }
  return value === undefined ? "null" : JSON.stringify(value);
}

function modelShape(result: MidiImportResult): unknown {
  if (!result.ok) return null;
  const model = result.value.model;
  return {
    header: { ...model.header },
    tempoMap: model.tempoMap.map((entry) => ({ ...entry })),
    meterMap: model.meterMap.map((entry) => ({ ...entry })),
    tracks: model.tracks.map((track) => ({
      index: track.index,
      name: track.name,
      instrumentName: track.instrumentName,
      markers: track.markers.map((marker) => ({ ...marker })),
      notes: track.notes.map((note) => ({ ...note })),
    })),
    ignoredEvents: model.ignoredEvents.map((entry) => ({ ...entry })),
    alienChunks: model.alienChunks.map((entry) => ({ ...entry })),
    counters: { ...model.counters },
  };
}

async function decoder(): Promise<
  (request: MidiImportRequest) => MidiImportResult
> {
  const operations = createMidiImportOperations(await realDecodeFrame());
  return operations.decodeSmf;
}

describe("M0 independent corpus: files produced outside this repository's writer", () => {
  test("the corpus declares that no production output supplied a value", () => {
    expect(CORPUS.schema).toBe("changes.evidence.m0-authored-corpus.v1");
    expect(CORPUS.productionOutputUsed).toBe(false);
    expect(CORPUS.expectedValuesGenerated).toBe(false);
    expect(CORPUS.acceptedFiles.length).toBeGreaterThan(0);
    /* The mandated traits must all be present somewhere in the corpus. */
    const traits = new Set(
      CORPUS.acceptedFiles.flatMap((entry) => [...entry.traits]),
    );
    for (const trait of [
      "format-0",
      "running-status",
      "velocity-zero-note-off",
      "multi-channel",
      "mid-track-tempo",
      "mid-track-meter",
      "alien-chunk",
      "smf-defaults",
    ]) {
      expect([...traits]).toContain(trait);
    }
  });

  for (const entry of CORPUS.acceptedFiles) {
    test(`${entry.id} — ${entry.title}`, async () => {
      const decodeSmf = await decoder();
      const result = decodeSmf(
        importRequest("m0-authored", hexToBytes(entry.bytesHex)),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(canonical(modelShape(result))).toBe(canonical(entry.expectedModel));
      expect(
        canonical(
          result.value.sonorities.map((row) => ({
            ...row,
            pitchClasses: [...row.pitchClasses],
          })),
        ),
      ).toBe(canonical(entry.expectedSonorities));
      expect(canonical(result.value.resolutions)).toBe(
        canonical(entry.expectedResolutions),
      );
    });
  }
});

describe("M0 independent hostile corpus: every frozen code at a constructed offset", () => {
  for (const entry of CORPUS.hostileFiles) {
    if (
      entry.expected.code === "import.schema_invalid" ||
      entry.expected.code === "import.request_id_invalid"
    ) {
      continue;
    }
    test(`${entry.id} — ${entry.title}`, async () => {
      const decodeSmf = await decoder();
      const result = decodeSmf(importRequest("m0-authored", expand(entry)));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.refusal.code).toBe(entry.expected.code);
      expect(result.refusal.byteOffset).toBe(entry.expected.byteOffset);
      expect(result.refusal.trackIndex).toBe(entry.expected.trackIndex);
      expect(result.refusal.partialResult).toBe(false);
    });
  }

  test("the corpus reaches every one of the frozen refusal codes", async () => {
    const decodeSmf = await decoder();
    const observed = new Set<string>();
    for (const entry of CORPUS.hostileFiles) {
      let request = importRequest("m0-authored", expand(entry));
      if (entry.expected.code === "import.schema_invalid") {
        request = {
          ...request,
          schema: "changes.import.midi-import-request.v2",
        } as unknown as MidiImportRequest;
      }
      if (entry.expected.code === "import.request_id_invalid") {
        request = { ...request, requestId: "not a valid id!" };
      }
      const result = decodeSmf(request);
      expect(result.ok).toBe(false);
      if (!result.ok) observed.add(result.refusal.code);
    }
    expect([...observed].sort()).toEqual([...MIDI_IMPORT_REFUSAL_CODES].sort());
  });
});

describe("M0 totality over the independent corpus", () => {
  test("every single-byte mutation and every truncated prefix stays total", async () => {
    const decodeSmf = await decoder();
    let decodes = 0;
    for (const entry of CORPUS.acceptedFiles) {
      const bytes = hexToBytes(entry.bytesHex);
      for (let index = 0; index < bytes.byteLength; index += 1) {
        for (const replacement of [0x00, 0x7f, 0x80, 0xff]) {
          const mutated = Uint8Array.from(bytes);
          mutated[index] = replacement;
          const result = decodeSmf(importRequest("m0-mutation", mutated));
          decodes += 1;
          if (!result.ok) {
            expect(MIDI_IMPORT_REFUSAL_CODES).toContain(result.refusal.code);
            expect(result.refusal.partialResult).toBe(false);
          }
        }
      }
      for (let length = 0; length <= bytes.byteLength; length += 1) {
        const result = decodeSmf(
          importRequest("m0-truncation", bytes.subarray(0, length)),
        );
        decodes += 1;
        if (!result.ok) {
          expect(MIDI_IMPORT_REFUSAL_CODES).toContain(result.refusal.code);
        }
      }
    }
    /* A deterministic work counter, not a timing bound. */
    expect(decodes).toBe(2_885);
  });
});
