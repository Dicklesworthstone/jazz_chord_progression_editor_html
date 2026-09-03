import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  type BeatValue,
  type ChordEventId,
  normalizeBeatValue,
  parseStableId,
} from "../../src/domain";
import {
  buildReharmonizationTree,
  makeSpelledInterval,
  transposeProgressionByInterval,
} from "../../src/theory";

function eventIdOf(wire: string): ChordEventId {
  const res = parseStableId("event", wire);
  if (!res.ok) throw new Error(`Invalid event id: ${wire}`);
  return res.value;
}

function beat(numerator: number, denominator = 1): BeatValue {
  const res = normalizeBeatValue({ numerator, denominator });
  if (!res.ok) throw new Error(`Invalid beat: ${String(numerator)}/${String(denominator)}`);
  return res.value;
}

const FIXTURE_DIR = resolve(
  import.meta.dir,
  "../fixtures/reharmonization-tree",
);

describe("G5 Comprehensive Conformance and Evidence", () => {
  test("satisfies all independent reharmonization tree fixture cases", async () => {
    const raw = await readFile(resolve(FIXTURE_DIR, "reharmonization-tree-cases.json"), "utf8");
    const data = JSON.parse(raw) as {
      cases: Array<{
        id: string;
        name: string;
        inputChords: string[];
        expectedChildrenAtDepth1?: Array<{
          label: string;
          chords: string[];
          lawId: string;
        }>;
        expectedDepth2Lineage?: string[];
      }>;
    };

    for (const testCase of data.cases) {
      const events = testCase.inputChords.map((chord, idx) => ({
        eventId: eventIdOf(`evt_${testCase.id}_${String(idx)}`),
        chordSymbol: chord,
        offsetBeat: beat(idx * 4),
        duration: beat(4),
      }));

      const result = buildReharmonizationTree(events, { maxDepth: 2 });
      expect(result.ok).toBe(true);

      if (result.ok) {
        if (testCase.expectedChildrenAtDepth1) {
          for (const expected of testCase.expectedChildrenAtDepth1) {
            const match = result.tree.rootNode.children.find((c) =>
              c.proof.lawId === expected.lawId &&
              expected.chords.every((ch, i) => c.chords[i] === ch),
            );
            expect(match).toBeDefined();
          }
        }

        if (testCase.expectedDepth2Lineage) {
          // Look for child at depth 2 with this lineage
          let foundDepth2 = false;
          for (const c1 of result.tree.rootNode.children) {
            for (const c2 of c1.children) {
              if (
                c2.lineageLawIds.length === testCase.expectedDepth2Lineage.length &&
                c2.lineageLawIds.every((law, i) => law === testCase.expectedDepth2Lineage?.[i])
              ) {
                foundDepth2 = true;
                break;
              }
            }
          }
          expect(foundDepth2).toBe(true);
        }
      }
    }
  });

  test("transposition invariant across intervals for branch generation", () => {
    const baseChords = ["Dm7", "G7", "Cmaj7"];
    const intervals = [
      makeSpelledInterval(2, "major", "up"),
      makeSpelledInterval(4, "perfect", "up"),
      makeSpelledInterval(3, "minor", "down"),
    ];

    for (const int of intervals) {
      const trans = transposeProgressionByInterval(baseChords, { interval: int }).transposedChords;
      const events = trans.map((chord, idx) => ({
        eventId: eventIdOf(`evt_${String(idx)}`),
        chordSymbol: chord,
        offsetBeat: beat(idx * 4),
        duration: beat(4),
      }));

      const res = buildReharmonizationTree(events, { maxDepth: 2 });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.tree.rootNode.children.length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  test("deterministic byte-for-byte tree reproducibility across runs", () => {
    const events = [
      { eventId: eventIdOf("e0"), chordSymbol: "Dm7", offsetBeat: beat(0), duration: beat(4) },
      { eventId: eventIdOf("e1"), chordSymbol: "G7", offsetBeat: beat(4), duration: beat(4) },
      { eventId: eventIdOf("e2"), chordSymbol: "Cmaj7", offsetBeat: beat(8), duration: beat(4) },
    ];

    const run1 = buildReharmonizationTree(events, { maxDepth: 2 });
    const run2 = buildReharmonizationTree(events, { maxDepth: 2 });

    expect(JSON.stringify(run1)).toBe(JSON.stringify(run2));
  });
});
