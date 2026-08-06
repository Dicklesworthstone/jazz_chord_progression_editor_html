/**
 * M1-TRACE production emission laws (jcpe-qyyn slice 1).
 *
 * Every preview carries the frozen nine-stage trace: decode and salvage at
 * the service seam, classify…envelope from the pipeline, unreached stages
 * stated explicitly. These tests drive the REAL service over the embedded
 * wasm decoder; expectations are written literally from the contract
 * (docs/M1_MIDI_IMPORT_AUTOMATION_CONTRACT.md §8), never from production
 * output.
 */
import { describe, expect, test } from "bun:test";

import { createStudioMidiImport } from "../../src/application/studio-midi-import";
import {
  hexToBytes,
  realDecodeFrame,
  requireGoldenCase,
  requireRefusalCase,
} from "../support/midi-import-test-kit";

const STAGES = [
  "decode",
  "salvage",
  "classify",
  "segment",
  "infer-key",
  "resolve",
  "groove",
  "plan",
  "envelope",
] as const;
const DIGEST = /^[0-9a-f]{16}$/u;

function service() {
  return createStudioMidiImport(realDecodeFrame);
}

/* The bwv786 shape: a salvageable note overlap (mirrors midi-salvage.test). */
function vlq(value: number): number[] {
  const bytes = [value & 0x7f];
  let rest = value >>> 7;
  while (rest > 0) {
    bytes.unshift((rest & 0x7f) | 0x80);
    rest >>>= 7;
  }
  return bytes;
}
const OVERLAP = (() => {
  const events = [
    ...vlq(0), 0x90, 60, 96,
    ...vlq(0), 0x90, 64, 96,
    ...vlq(0), 0x90, 67, 96,
    ...vlq(480), 0x90, 60, 96, // re-strike with no off — strict refuses here
    ...vlq(480), 0x80, 60, 0,
    ...vlq(0), 0x80, 64, 0,
    ...vlq(0), 0x80, 67, 0,
    ...vlq(0), 0xff, 0x2f, 0x00,
  ];
  return Uint8Array.from([
    0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0x01, 0xe0,
    0x4d, 0x54, 0x72, 0x6b,
    (events.length >>> 24) & 0xff,
    (events.length >>> 16) & 0xff,
    (events.length >>> 8) & 0xff,
    events.length & 0xff,
    ...events,
  ]);
})();

describe("M1-TRACE emission", () => {
  test("a clean decode carries all nine stages in the frozen order with hex digests", async () => {
    const preview = await service().readFile(
      "two-chords.mid",
      hexToBytes(requireGoldenCase("M0-GLD-002").bytesHex),
    );
    expect(preview.trace.schema).toBe("changes.import.automation-trace.v1");
    expect(preview.trace.records.map((record) => record.stage)).toEqual([
      ...STAGES,
    ]);
    for (const record of preview.trace.records) {
      expect(record.inputDigest).toMatch(DIGEST);
      expect(record.decisions.length).toBeGreaterThan(0);
    }
    const decode = preview.trace.records[0];
    expect(decode?.refusalCode).toBeNull();
    expect(decode?.workCounters["notesPaired"]).toBeGreaterThan(0);
    const salvage = preview.trace.records[1];
    expect(salvage?.decisions[0]?.outcome).toBe("not-attempted");
    const groove = preview.trace.records.find(
      (record) => record.stage === "groove",
    );
    expect(groove?.decisions[0]?.outcome).toBe(
      preview.automation?.groove.grooveStyleId ?? "",
    );
  });

  test("identical bytes yield an identical trace (M1-DET)", async () => {
    const bytes = hexToBytes(requireGoldenCase("M0-GLD-002").bytesHex);
    const first = await service().readFile("same.mid", bytes);
    const second = await service().readFile("same.mid", bytes);
    expect(JSON.stringify(first.trace)).toBe(JSON.stringify(second.trace));
  });

  test("a refused decode still carries nine stages, the refusal, and explicit not-reached records", async () => {
    const hostile = requireRefusalCase("M0-REF-007");
    const preview = await service().readFile(
      "format-two.mid",
      hexToBytes(hostile.bytesHex ?? ""),
    );
    expect(preview.trace.records.map((record) => record.stage)).toEqual([
      ...STAGES,
    ]);
    expect(preview.trace.records[0]?.refusalCode).toBe(hostile.expected.code);
    const classify = preview.trace.records.find(
      (record) => record.stage === "classify",
    );
    expect(classify?.decisions[0]?.outcome).toBe("not-reached");
  });

  test("salvage that ran is recorded — the jcpe-a5uq law at the trace level", async () => {
    const preview = await service().readFile("bwv786.mid", OVERLAP);
    expect(preview.refusal).toBeNull();
    expect(preview.salvage).not.toBeNull();
    const salvage = preview.trace.records[1];
    expect(salvage?.decisions[0]?.outcome).toBe("repaired-clean");
    expect(salvage?.workCounters["repairs"]).toBeGreaterThan(0);
  });

  test("a cluster file that plans nothing records the plan-stage refusal", async () => {
    const preview = await service().readFile(
      "cluster.mid",
      hexToBytes(requireGoldenCase("M0-GLD-005").bytesHex),
    );
    expect(preview.automationRefusal).toBe(
      "import.automation_nothing_to_write",
    );
    const plan = preview.trace.records.find(
      (record) => record.stage === "plan",
    );
    expect(plan?.refusalCode).toBe("import.automation_nothing_to_write");
    const envelope = preview.trace.records.find(
      (record) => record.stage === "envelope",
    );
    expect(envelope?.decisions[0]?.outcome).toBe("not-reached");
  });
});
