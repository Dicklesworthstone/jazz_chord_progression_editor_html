/**
 * M0-TRACE-DECODE-TOTALITY evidence.
 *
 * Every hostile input in the independently authored refusal corpus must map to
 * the frozen refusal code AND the frozen detection byte offset and track index
 * — never a panic, a throw, or a silent skip. The decoder under test is the
 * real embedded wasm module, so this is also the proof that no reachable input
 * traps it.
 */
import { describe, expect, test } from "bun:test";

import { createMidiImportOperations } from "../../src/export/midi-import";
import {
  MIDI_IMPORT_REFUSAL_CODES,
  MIDI_IMPORT_READER_ID,
  MIDI_IMPORT_READER_VERSION,
  MIDI_IMPORT_REQUEST_SCHEMA,
  type MidiImportRequest,
} from "../../src/export/midi-import-contract";
import {
  REFUSAL_CASES,
  hexToBytes,
  importRequest,
  pathToPointer,
  realDecodeFrame,
  refusalCaseBytes,
  requireGoldenCase,
} from "../support/midi-import-test-kit";

const BYTE_PHASE_CASES = REFUSAL_CASES.filter(
  (entry) => entry.kind === "bytes" && !entry.id.startsWith("M0-REF-03"),
);

describe("M0 hostile bytes refuse with the frozen code and offset", () => {
  for (const entry of BYTE_PHASE_CASES) {
    test(`${entry.id} — ${entry.title}`, async () => {
      const decodeFrame = await realDecodeFrame();
      const operations = createMidiImportOperations(decodeFrame);
      const result = operations.decodeSmf(
        importRequest("m0-ref", refusalCaseBytes(entry)),
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.refusal.code).toBe(entry.expected.code);
      expect(result.refusal.byteOffset).toBe(entry.expected.byteOffset);
      expect(result.refusal.trackIndex).toBe(entry.expected.trackIndex);
      expect(result.refusal.partialResult).toBe(false);
      if (entry.expected.pointer === null) {
        expect(result.refusal.path.length).toBe(0);
      } else {
        expect(pathToPointer(result.refusal.path)).toBe(entry.expected.pointer);
      }
    });
  }
});

describe("M0 request-phase refusals resolve before any byte is read", () => {
  test("M0-REF-001 — a wrong request schema refuses at /schema", async () => {
    const operations = createMidiImportOperations(await realDecodeFrame());
    const bytes = hexToBytes(requireGoldenCase("M0-GLD-005").bytesHex);
    const request = {
      schema: "changes.import.midi-import-request.v2",
      requestId: "m0-ref-base",
      readerId: MIDI_IMPORT_READER_ID,
      readerVersion: MIDI_IMPORT_READER_VERSION,
      bytes,
    } as unknown as MidiImportRequest;
    const result = operations.decodeSmf(request);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.code).toBe("import.schema_invalid");
    expect(pathToPointer(result.refusal.path)).toBe("/schema");
    expect(result.refusal.byteOffset).toBeNull();
    expect(result.refusal.trackIndex).toBeNull();
  });

  test("M0-REF-002 — a request id outside the frozen pattern refuses", async () => {
    const operations = createMidiImportOperations(await realDecodeFrame());
    const bytes = hexToBytes(requireGoldenCase("M0-GLD-005").bytesHex);
    const result = operations.decodeSmf({
      schema: MIDI_IMPORT_REQUEST_SCHEMA,
      requestId: "bad id!",
      readerId: MIDI_IMPORT_READER_ID,
      readerVersion: MIDI_IMPORT_READER_VERSION,
      bytes,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.code).toBe("import.request_id_invalid");
    expect(pathToPointer(result.refusal.path)).toBe("/requestId");
  });
});

describe("M0 decoder totality", () => {
  test("every frozen refusal code is a member of the closed vocabulary", async () => {
    const operations = createMidiImportOperations(await realDecodeFrame());
    for (const entry of REFUSAL_CASES) {
      expect(MIDI_IMPORT_REFUSAL_CODES).toContain(entry.expected.code);
    }
    /*
     * A truncated prefix of every golden is still a total decode: it either
     * refuses with a frozen code or decodes, but never throws.
     */
    const golden = hexToBytes(requireGoldenCase("M0-GLD-001").bytesHex);
    for (let length = 0; length <= golden.byteLength; length += 1) {
      const result = operations.decodeSmf(
        importRequest("m0-total", golden.subarray(0, length)),
      );
      if (!result.ok) {
        expect(MIDI_IMPORT_REFUSAL_CODES).toContain(result.refusal.code);
      }
    }
  });

  test("every single-byte mutation of a golden stays total", async () => {
    const operations = createMidiImportOperations(await realDecodeFrame());
    const golden = hexToBytes(requireGoldenCase("M0-GLD-005").bytesHex);
    for (let index = 0; index < golden.byteLength; index += 1) {
      for (const replacement of [0x00, 0x7f, 0x80, 0xff]) {
        const mutated = Uint8Array.from(golden);
        mutated[index] = replacement;
        const result = operations.decodeSmf(
          importRequest("m0-mutation", mutated),
        );
        if (!result.ok) {
          expect(MIDI_IMPORT_REFUSAL_CODES).toContain(result.refusal.code);
        }
      }
    }
  });
});
