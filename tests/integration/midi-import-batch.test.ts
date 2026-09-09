import { describe, expect, test } from "bun:test";
import { compareMidiFiles, scoreMidiCandidate, type MidiImportLocalFile } from "../../src/application/midi-import-batch";
import { createStudioMidiImport } from "../../src/application/studio-midi-import";
import { realDecodeFrame } from "../support/midi-import-test-kit";
import { batchChordFile, batchMultiTrack } from "../support/midi-batch-fixtures";

const service = createStudioMidiImport(realDecodeFrame);
const current = () => true;
const progress = () => undefined;
function file(name: string, bytes = batchChordFile()): MidiImportLocalFile {
  return { name, size: bytes.length, arrayBuffer: () => Promise.resolve(Uint8Array.from(bytes).buffer) };
}
async function scored(options: Parameters<typeof batchChordFile>[0]) {
  const preview = await service.readFile("independent.mid", batchChordFile(options));
  if (preview.decoded === null) throw new Error("Authored SMF did not decode");
  return scoreMidiCandidate(preview.decoded);
}

describe("local MIDI comparison over the real embedded M0 decoder and M1 planner", () => {
  test("independent score oracle: short chord=37; 60 seconds=62; 150 seconds=67", async () => {
    for (const [bars, score] of [[1, 37], [29, 37], [30, 62], [74, 62], [75, 67]] as const) {
      const result = await scored({ bars });
      expect(result.score).toBe(score);
      expect(result.notesVisited).toBe(bars * 4);
    }
  });
  test("transposition within the same register leaves ranking invariant", async () => {
    for (const transpose of [-7, -1, 0, 1, 7, 12]) expect((await scored({ transpose })).score).toBe(37);
  });
  test("richness, percussion and bass bonuses have independently calculated near misses", async () => {
    for (const [channels, transpose, expected] of [
      [[0, 1, 2, 3, 9], -24, 70],
      [[0, 1, 2, 9], -24, 60],
      [[0, 0, 0, 0, 9], -24, 65],
      [[0, 1, 2, 3, 4], -24, 62],
      [[0, 1, 2, 3, 9], 0, 60],
    ] as const) {
      const preview = await service.readFile("arrangement.mid", batchMultiTrack(channels, transpose));
      if (preview.decoded === null) throw new Error("Independent multitrack SMF refused");
      expect(scoreMidiCandidate(preview.decoded).score).toBe(expected);
    }
  });
  test("leading silence is not rewarded; all sounding tempo segments count", async () => {
    expect((await scored({ leadingTicks: 144_000 })).score).toBe(37);
    const slow = await scored({ bars: 2, laterTempo: 2_000_000 });
    expect(slow.score).toBe(-3);
    expect(slow.reasons[1]).toStartWith("10 seconds");
    expect((await scored({ tempo: 187_500 })).score).toBe(37);
    expect((await scored({ tempo: 187_499 })).score).toBe(-3);
    expect((await scored({ tempo: 1_500_000 })).score).toBe(37);
    expect((await scored({ tempo: 1_500_001 })).score).toBe(-3);
  });
  test("recommend the stronger usable candidate; preserve order and duplicate filenames", async () => {
    const files = [file("same.mid"), file("same.mid", batchChordFile({ bars: 30 })), file("bad.mid", new Uint8Array([1, 2]))];
    const result = await compareMidiFiles(files, service.readFile, current, progress);
    expect(result?.recommendedOrdinal).toBe(1);
    expect(result?.candidates.map((candidate) => candidate.ordinal)).toEqual([0, 1, 2]);
    expect(result?.candidates.map((candidate) => candidate.ranking?.score ?? null)).toEqual([37, 62, null]);
    expect(result?.candidates[2]?.problem).not.toBeNull();
    expect(result?.bytesRead).toBe(files.reduce((sum, entry) => sum + entry.size, 0));
    const tie = await compareMidiFiles([file("z.mid"), file("a.mid")], service.readFile, current, progress);
    expect(tie?.recommendedOrdinal).toBe(0);
  });
  test("five files run sequentially; six, excess bytes and invalid sizes perform no reads", async () => {
    let pending = 0;
    let reads = 0;
    const local = file("one.mid");
    const counted = { ...local, arrayBuffer: async () => {
      reads++;
      pending++;
      expect(pending).toBe(1);
      const bytes = await local.arrayBuffer();
      pending--;
      return bytes;
    } };
    const stages: number[] = [];
    const result = await compareMidiFiles(Array.from({ length: 5 }, () => counted), service.readFile, current, (done) => stages.push(done));
    expect(result?.candidates.length).toBe(5);
    expect(stages).toEqual([0, 1, 2, 3, 4, 5]);
    expect(reads).toBe(5);
    for (const selection of [Array.from({ length: 6 }, () => counted), [{ ...counted, size: 4_194_305 }], Array.from({ length: 3 }, () => ({ ...counted, size: 3_000_000 })), [{ ...counted, size: NaN }], []]) {
      const refused = await compareMidiFiles(selection, service.readFile, current, progress);
      expect(refused?.problem).not.toBeNull();
      expect(refused?.bytesRead).toBe(0);
      expect(reads).toBe(5);
    }
  });
  test("read failure, changed byte length and all-invalid input cannot become recommendations", async () => {
    const result = await compareMidiFiles([
      { name: "unreadable.mid", size: 0, arrayBuffer: () => Promise.reject(new Error("device read")) },
      { ...file("changed.mid"), size: 0 },
      file("bad.mid", new Uint8Array([0])),
    ], service.readFile, current, progress);
    expect(result?.recommendedOrdinal).toBeNull();
    expect(result?.candidates.every((candidate) => candidate.problem !== null)).toBe(true);
  });
  test("cancel before read, during read and after decode suppresses publication and subsequent work", async () => {
    for (const phase of ["before", "read", "decode"] as const) {
      let live = phase !== "before";
      let reads = 0;
      let decodes = 0;
      const stages: number[] = [];
      const original = file("one.mid");
      const local = { ...original, arrayBuffer: async () => {
        reads++;
        if (phase === "read") live = false;
        return original.arrayBuffer();
      } };
      const result = await compareMidiFiles([local, local], async (name, bytes) => {
        decodes++;
        const preview = await service.readFile(name, bytes);
        if (phase === "decode") live = false;
        return preview;
      }, () => live, (done) => stages.push(done));
      expect(result).toBeNull();
      expect(reads).toBe(phase === "before" ? 0 : 1);
      expect(decodes).toBe(phase === "decode" ? 1 : 0);
      expect(stages).toEqual(phase === "before" ? [] : [0]);
    }
  });
});
