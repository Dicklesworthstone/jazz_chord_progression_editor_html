/**
 * M0-TRACE-LIMITS evidence.
 *
 * Every exact-integer resource bound refuses deterministically at the boundary
 * the contract names, with the reviewed detection byte offset. The limit cases
 * are expanded from the fixture's repeat segments into REAL hostile bytes and
 * pushed through the real embedded wasm decoder — no summarized stand-in.
 */
import { describe, expect, test } from "bun:test";

import { createMidiImportOperations } from "../../src/export/midi-import";
import {
  MAX_MIDI_IMPORT_BYTES,
  MAX_MIDI_IMPORT_EVENTS,
  MAX_MIDI_IMPORT_METER_CHANGES,
  MAX_MIDI_IMPORT_NOTES,
  MAX_MIDI_IMPORT_TEMPO_CHANGES,
  MAX_MIDI_IMPORT_TRACKS,
} from "../../src/export/midi-import-contract";
import {
  importRequest,
  pathToPointer,
  realDecodeFrame,
  refusalCaseBytes,
  requireRefusalCase,
} from "../support/midi-import-test-kit";

const LIMIT_CASE_IDS = [
  "M0-REF-033",
  "M0-REF-034",
  "M0-REF-035",
  "M0-REF-036",
  "M0-REF-037",
  "M0-REF-038",
] as const;

describe("M0 exact-integer resource bounds", () => {
  for (const id of LIMIT_CASE_IDS) {
    const entry = requireRefusalCase(id);
    test(`${id} — ${entry.title}`, async () => {
      const operations = createMidiImportOperations(await realDecodeFrame());
      const result = operations.decodeSmf(
        importRequest("m0-limit", refusalCaseBytes(entry)),
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.refusal.code).toBe(entry.expected.code);
      expect(result.refusal.byteOffset).toBe(entry.expected.byteOffset);
      expect(result.refusal.trackIndex).toBe(entry.expected.trackIndex);
    });
  }

  test("M0-REF-003 — one byte past the import cap refuses at the boundary", async () => {
    const entry = requireRefusalCase("M0-REF-003");
    const operations = createMidiImportOperations(await realDecodeFrame());
    const oversized = new Uint8Array(MAX_MIDI_IMPORT_BYTES + 1);
    const result = operations.decodeSmf(importRequest("m0-cap", oversized));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.code).toBe(entry.expected.code);
    expect(result.refusal.byteOffset).toBe(entry.expected.byteOffset);
    expect(pathToPointer(result.refusal.path)).toBe(
      entry.expected.pointer ?? "",
    );
  });

  test("the caps the fixtures exercise are exactly the frozen contract values", () => {
    expect(MAX_MIDI_IMPORT_BYTES).toBe(4_194_304);
    expect(MAX_MIDI_IMPORT_TRACKS).toBe(64);
    expect(MAX_MIDI_IMPORT_EVENTS).toBe(524_288);
    expect(MAX_MIDI_IMPORT_NOTES).toBe(131_072);
    expect(MAX_MIDI_IMPORT_TEMPO_CHANGES).toBe(4_096);
    expect(MAX_MIDI_IMPORT_METER_CHANGES).toBe(1_024);
  });
});
