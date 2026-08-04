/**
 * M0-TRACE-PAIRING evidence.
 *
 * Note on/off pairing runs per (track, channel, key) and treats a velocity-zero
 * note-on as a note-off exactly as MIDI 1.0 defines. Overlapping, orphan-off,
 * and unterminated notes each refuse with their dedicated code at the byte the
 * contract names. Off velocity is declared non-retained and must not appear.
 */
import { describe, expect, test } from "bun:test";

import { createMidiImportOperations } from "../../src/export/midi-import";
import {
  importRequest,
  realDecodeFrame,
  refusalCaseBytes,
  requireGoldenCase,
  requireRefusalCase,
  decodeGolden,
  requireDecoded,
} from "../support/midi-import-test-kit";

const PAIRING_REFUSALS = ["M0-REF-030", "M0-REF-031", "M0-REF-032"] as const;

describe("M0 note pairing", () => {
  test("M0-GLD-002 pairs velocity-zero note-offs across channels", async () => {
    const entry = requireGoldenCase("M0-GLD-002");
    const decoded = requireDecoded(await decodeGolden(entry.id));
    expect(decoded.model.tracks[0]?.notes).toEqual(
      entry.expectedModel.tracks[0]?.notes ?? [],
    );
    expect(decoded.model.counters.notesPaired).toBe(
      entry.expectedCounters.notesPaired,
    );
    expect(decoded.model.counters.peakOpenNotes).toBe(
      entry.expectedCounters.peakOpenNotes,
    );
  });

  test("M0-GLD-004 pairs notes that open inside another note's span", async () => {
    const entry = requireGoldenCase("M0-GLD-004");
    const decoded = requireDecoded(await decodeGolden(entry.id));
    expect(decoded.model.tracks[0]?.notes).toEqual(
      entry.expectedModel.tracks[0]?.notes ?? [],
    );
  });

  test("off velocity is never retained on a paired note", async () => {
    const decoded = requireDecoded(await decodeGolden("M0-GLD-001"));
    for (const track of decoded.model.tracks) {
      for (const note of track.notes) {
        expect(Object.keys(note).sort()).toEqual([
          "channel",
          "key",
          "offTick",
          "onTick",
          "onVelocity",
        ]);
      }
    }
  });

  for (const id of PAIRING_REFUSALS) {
    const entry = requireRefusalCase(id);
    test(`${id} — ${entry.title}`, async () => {
      const operations = createMidiImportOperations(await realDecodeFrame());
      const result = operations.decodeSmf(
        importRequest("m0-pair", refusalCaseBytes(entry)),
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.refusal.code).toBe(entry.expected.code);
      expect(result.refusal.byteOffset).toBe(entry.expected.byteOffset);
      expect(result.refusal.trackIndex).toBe(entry.expected.trackIndex);
    });
  }

  test("each track's notes are sorted by (onTick, channel, key)", async () => {
    const decoded = requireDecoded(await decodeGolden("M0-GLD-003"));
    for (const track of decoded.model.tracks) {
      for (let index = 1; index < track.notes.length; index += 1) {
        const previous = track.notes[index - 1];
        const current = track.notes[index];
        if (previous === undefined || current === undefined) continue;
        const ordered =
          previous.onTick < current.onTick ||
          (previous.onTick === current.onTick &&
            (previous.channel < current.channel ||
              (previous.channel === current.channel &&
                previous.key <= current.key)));
        expect(ordered).toBe(true);
      }
    }
  });
});
