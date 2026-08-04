/**
 * The MIDI salvage law (jcpe-v2r-midi-salvage-ulus): a file whose structure
 * is sound but whose note stream carries content defects is repaired
 * deterministically and re-read by the SAME strict decoder; structural
 * refusals never attempt salvage; clean files never touch the salvage path.
 * Every fixture below is a hand-built byte stream — the writer helper mirrors
 * the SMF grammar, not the production reader — so the salvage pass cannot
 * certify itself.
 */
import { describe, expect, test } from "bun:test";

import { createStudioMidiImport } from "../../src/application/studio-midi-import";
import {
  MAX_MIDI_SALVAGE_REPAIRS,
  createMidiImportOperations,
  isSalvageableRefusalCode,
  salvageMidiBytes,
} from "../../src/export";
import { importRequest, realDecodeFrame } from "../support/midi-import-test-kit";

/* ---------------------------------------------------------- byte builder */

function vlq(value: number): number[] {
  const out = [value & 0x7f];
  let rest = Math.floor(value / 128);
  while (rest > 0) {
    out.unshift((rest & 0x7f) | 0x80);
    rest = Math.floor(rest / 128);
  }
  return out;
}

function u32(value: number): number[] {
  return [
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ];
}

function smf(trackEvents: readonly (readonly number[])[]): Uint8Array {
  const header = [
    0x4d, 0x54, 0x68, 0x64,
    ...u32(6),
    0, trackEvents.length > 1 ? 1 : 0,
    ...u32(trackEvents.length).slice(2),
    0x01, 0xe0, // 480 ppq
  ];
  const chunks = trackEvents.flatMap((events) => [
    0x4d, 0x54, 0x72, 0x6b,
    ...u32(events.length),
    ...events,
  ]);
  return Uint8Array.from([...header, ...chunks]);
}

const END_OF_TRACK = [...vlq(0), 0xff, 0x2f, 0x00];
const on = (delta: number, key: number, velocity = 96, channel = 0) => [
  ...vlq(delta), 0x90 | channel, key, velocity,
];
const off = (delta: number, key: number, channel = 0) => [
  ...vlq(delta), 0x80 | channel, key, 0,
];

/** C major triad held one beat, then released — a clean one-bar file. */
const CLEAN = smf([[
  ...on(0, 60), ...on(0, 64), ...on(0, 67),
  ...off(480, 60), ...off(0, 64), ...off(0, 67),
  ...END_OF_TRACK,
]]);

/** The bwv786 shape: key 60 struck again while still sounding. */
const OVERLAP = smf([[
  ...on(0, 60), ...on(0, 64), ...on(0, 67),
  ...on(480, 60), // re-strike with no off — strict refuses here
  ...off(480, 60), ...off(0, 64), ...off(0, 67),
  ...END_OF_TRACK,
]]);

/** An off for a key that never sounded. */
const ORPHAN_OFF = smf([[
  ...on(0, 60), ...on(0, 64), ...on(0, 67),
  ...off(480, 62), // nothing sounding on 62
  ...off(0, 60), ...off(0, 64), ...off(0, 67),
  ...END_OF_TRACK,
]]);

/** Key 67 never released before End of Track. */
const UNTERMINATED = smf([[
  ...on(0, 60), ...on(0, 64), ...on(0, 67),
  ...off(480, 60), ...off(0, 64),
  ...END_OF_TRACK,
]]);

/** Overlap expressed through running status (no repeated status byte). */
const RUNNING_STATUS_OVERLAP = smf([[
  ...vlq(0), 0x90, 60, 96,
  ...vlq(0), 64, 96, // running status note on
  ...vlq(480), 60, 96, // running-status re-strike of 60
  ...vlq(480), 60, 0, // running-status off (velocity 0)
  ...vlq(0), 64, 0,
  ...END_OF_TRACK,
]]);

/** A broken header: structural, never salvaged. */
const BAD_HEADER = Uint8Array.from([0x4d, 0x54, 0x68, 0x99, 0, 0, 0, 6]);

async function strictDecode(bytes: Uint8Array, id: string) {
  const frame = await realDecodeFrame();
  return createMidiImportOperations(frame).decodeSmf(importRequest(id, bytes));
}

function serviceWith(frameLoader: () => Promise<Awaited<ReturnType<typeof realDecodeFrame>>>) {
  return createStudioMidiImport(frameLoader);
}

describe("salvageMidiBytes — deterministic byte repair", () => {
  test("the overlap file strict-refuses, salvages, and re-reads clean", async () => {
    const strict = await strictDecode(OVERLAP, "overlap-strict");
    expect(strict.ok).toBe(false);
    if (!strict.ok) {
      expect(strict.refusal.code).toBe("smf.note_overlap");
      expect(isSalvageableRefusalCode(strict.refusal.code)).toBe(true);
    }

    const attempt = salvageMidiBytes(OVERLAP);
    expect(attempt.salvaged).toBe(true);
    if (!attempt.salvaged) return;
    expect(attempt.report.repairs).toEqual([
      {
        kind: "restruck-note-ended",
        count: 1,
        firstByteOffset: expect.any(Number) as number,
      },
    ]);
    expect(attempt.report.totalRepairs).toBe(1);
    expect(attempt.report.note).toBe(
      "Read after 1 repair: 1 restruck note ended early — chord names are a best guess.",
    );

    const reread = await strictDecode(attempt.bytes, "overlap-salvaged");
    expect(reread.ok).toBe(true);
    if (!reread.ok) return;
    const notes = reread.value.model.tracks[0]?.notes ?? [];
    /* Four sounded notes: the shortened first 60, 64, 67, and the re-struck 60. */
    expect(notes).toHaveLength(4);
    const first60 = notes.find((note) => note.key === 60 && note.onTick === 0);
    expect(first60?.offTick).toBe(480);
    const second60 = notes.find((note) => note.key === 60 && note.onTick === 480);
    expect(second60?.offTick).toBe(960);
  });

  test("an orphan off is dropped and everything else survives", async () => {
    const strict = await strictDecode(ORPHAN_OFF, "orphan-strict");
    expect(strict.ok).toBe(false);
    if (!strict.ok) expect(strict.refusal.code).toBe("smf.note_off_unmatched");

    const attempt = salvageMidiBytes(ORPHAN_OFF);
    expect(attempt.salvaged).toBe(true);
    if (!attempt.salvaged) return;
    expect(attempt.report.repairs).toEqual([
      {
        kind: "orphan-off-dropped",
        count: 1,
        firstByteOffset: expect.any(Number) as number,
      },
    ]);

    const reread = await strictDecode(attempt.bytes, "orphan-salvaged");
    expect(reread.ok).toBe(true);
    if (!reread.ok) return;
    expect(reread.value.model.tracks[0]?.notes).toHaveLength(3);
  });

  test("a note left sounding closes at End of Track", async () => {
    const strict = await strictDecode(UNTERMINATED, "open-strict");
    expect(strict.ok).toBe(false);
    if (!strict.ok) expect(strict.refusal.code).toBe("smf.note_on_unterminated");

    const attempt = salvageMidiBytes(UNTERMINATED);
    expect(attempt.salvaged).toBe(true);
    if (!attempt.salvaged) return;
    expect(attempt.report.repairs).toEqual([
      {
        kind: "unterminated-note-closed",
        count: 1,
        firstByteOffset: expect.any(Number) as number,
      },
    ]);

    const reread = await strictDecode(attempt.bytes, "open-salvaged");
    expect(reread.ok).toBe(true);
    if (!reread.ok) return;
    const held = reread.value.model.tracks[0]?.notes.find(
      (note) => note.key === 67,
    );
    expect(held?.offTick).toBe(480);
  });

  test("running-status overlap repairs identically", async () => {
    const attempt = salvageMidiBytes(RUNNING_STATUS_OVERLAP);
    expect(attempt.salvaged).toBe(true);
    if (!attempt.salvaged) return;
    expect(attempt.report.repairs[0]?.kind).toBe("restruck-note-ended");
    const reread = await strictDecode(attempt.bytes, "running-salvaged");
    expect(reread.ok).toBe(true);
  });

  test("a structural refusal is not salvageable and the walker refuses too", () => {
    expect(isSalvageableRefusalCode("smf.header_invalid")).toBe(false);
    expect(isSalvageableRefusalCode("smf.chunk_truncated")).toBe(false);
    expect(isSalvageableRefusalCode("limit.midi_import_notes_exceeded")).toBe(
      false,
    );
    const attempt = salvageMidiBytes(BAD_HEADER);
    expect(attempt).toEqual({ salvaged: false, reason: "unreadable" });
  });

  test("a clean file reports nothing to repair", () => {
    expect(salvageMidiBytes(CLEAN)).toEqual({
      salvaged: false,
      reason: "nothing-to-repair",
    });
  });

  test("double-run determinism: identical bytes and ledger", () => {
    const first = salvageMidiBytes(OVERLAP);
    const second = salvageMidiBytes(OVERLAP);
    expect(first.salvaged && second.salvaged).toBe(true);
    if (!first.salvaged || !second.salvaged) return;
    expect([...first.bytes]).toEqual([...second.bytes]);
    expect(first.report).toEqual(second.report);
  });

  test("the repair bound is a named limit, not folklore", () => {
    expect(MAX_MIDI_SALVAGE_REPAIRS).toBe(4096);
  });
});

describe("the studio import service over defective files", () => {
  test("a clean file decodes exactly once with no salvage note", async () => {
    let decodeCalls = 0;
    const frame = await realDecodeFrame();
    const counting = serviceWith(() =>
      Promise.resolve((bytes: Uint8Array) => {
        decodeCalls += 1;
        return frame(bytes);
      }),
    );
    const preview = await counting.readFile("clean.mid", CLEAN);
    expect(preview.refusal).toBeNull();
    expect(preview.salvage).toBeNull();
    expect(decodeCalls).toBe(1);
  });

  test("the overlap file previews the salvaged read with the honest sentence", async () => {
    const service = serviceWith(realDecodeFrame);
    const preview = await service.readFile("bwv786-jazz-quintet.mid", OVERLAP);
    expect(preview.refusal).toBeNull();
    expect(preview.decoded).not.toBeNull();
    expect(preview.salvage?.note).toContain("restruck note ended early");
    expect(preview.plan).not.toBeNull();
  });

  test("a structural refusal still surfaces unchanged", async () => {
    const service = serviceWith(realDecodeFrame);
    const preview = await service.readFile("broken.mid", BAD_HEADER);
    expect(preview.refusal?.code).toBe("smf.header_invalid");
    expect(preview.salvage).toBeNull();
    expect(preview.decoded).toBeNull();
  });
});
