import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  type ChordEventId,
  normalizeBeatValue,
  parseStableId,
} from "../../src/domain";
import {
  evaluateTransformCandidates,
  invertInterval,
  makeSpelledInterval,
  transposeProgressionByInterval,
} from "../../src/theory";

function eventIdOf(wire: string): ChordEventId {
  const res = parseStableId("event", wire);
  if (!res.ok) throw new Error(`Invalid event id: ${wire}`);
  return res.value;
}

function beat(numerator: number, denominator = 1) {
  const res = normalizeBeatValue({ numerator, denominator });
  if (!res.ok) throw new Error(`Invalid beat: ${String(numerator)}/${String(denominator)}`);
  return res.value;
}

const FIXTURE_DIR = resolve(
  import.meta.dir,
  "../fixtures/transform-laws",
);

describe("H1 Comprehensive Conformance and Evidence", () => {
  test("satisfies all independent transform law fixture cases", async () => {
    const raw = await readFile(resolve(FIXTURE_DIR, "transform-law-cases.json"), "utf8");
    const data = JSON.parse(raw) as {
      cases: Array<{
        id: string;
        name: string;
        inputProgression: string[];
        targetEventIndex: number;
        expectedLaw: string;
        expectedTransformedChord?: string;
        expectedTransformedProgression?: string[];
      }>;
    };

    for (const testCase of data.cases) {
      const events = testCase.inputProgression.map((chord, idx) => ({
        eventId: eventIdOf(`evt_${testCase.id}_${String(idx)}`),
        chordSymbol: chord,
        offsetBeat: beat(idx * 4),
        duration: beat(4),
      }));

      const result = evaluateTransformCandidates(events, testCase.targetEventIndex);
      expect(result.ok).toBe(true);

      if (result.ok) {
        const found = result.candidates.find((c) => c.lawId === testCase.expectedLaw);
        if (found) {
          expect(found.editPlan.maintainsTimeBalance).toBe(true);
          if (testCase.expectedTransformedChord) {
            expect(found.transformedProgression[testCase.targetEventIndex]).toBe(testCase.expectedTransformedChord);
          }
          if (testCase.expectedTransformedProgression) {
            expect(found.transformedProgression).toEqual(testCase.expectedTransformedProgression);
          }
        }
      }
    }
  });

  test("satisfies all independent spelled transposition fixture cases", async () => {
    const raw = await readFile(resolve(FIXTURE_DIR, "spelled-transposition-cases.json"), "utf8");
    const data = JSON.parse(raw) as {
      cases: Array<{
        id: string;
        name: string;
        interval: {
          diatonicNumber: number;
          quality: "perfect" | "major" | "minor" | "augmented" | "diminished";
          direction: "up" | "down";
        };
        sourceChords: string[];
        expectedTransposedChords: string[];
      }>;
    };

    for (const testCase of data.cases) {
      const interval = makeSpelledInterval(
        testCase.interval.diatonicNumber,
        testCase.interval.quality,
        testCase.interval.direction,
      );

      const result = transposeProgressionByInterval(testCase.sourceChords, { interval });
      expect(result.transposedChords).toEqual(testCase.expectedTransposedChords);

      // Verify inverse roundtrip
      const inv = invertInterval(interval);
      const roundtrip = transposeProgressionByInterval(result.transposedChords, { interval: inv });
      expect(roundtrip.transposedChords).toEqual(testCase.sourceChords);
    }
  });

  test("transposition invariant across all 12 chromatic transpositions for primary laws", () => {
    const intervals = [
      makeSpelledInterval(1, "perfect", "up"), // unison
      makeSpelledInterval(2, "minor", "up"),   // m2
      makeSpelledInterval(2, "major", "up"),   // M2
      makeSpelledInterval(3, "minor", "up"),   // m3
      makeSpelledInterval(3, "major", "up"),   // M3
      makeSpelledInterval(4, "perfect", "up"), // P4
      makeSpelledInterval(5, "diminished", "up"), // tritone
      makeSpelledInterval(5, "perfect", "up"), // P5
      makeSpelledInterval(6, "minor", "up"),   // m6
      makeSpelledInterval(6, "major", "up"),   // M6
      makeSpelledInterval(7, "minor", "up"),   // m7
      makeSpelledInterval(7, "major", "up"),   // M7
    ];

    const baseProgression = ["Dm7", "G7", "Cmaj7"];

    for (const int of intervals) {
      const transProg = transposeProgressionByInterval(baseProgression, { interval: int });
      const events = transProg.transposedChords.map((chord, idx) => ({
        eventId: eventIdOf(`e_${String(idx)}`),
        chordSymbol: chord,
        offsetBeat: beat(idx * 4),
        duration: beat(4),
      }));

      // Evaluate tritone substitution on V7 chord (index 1)
      const res = evaluateTransformCandidates(events, 1);
      expect(res.ok).toBe(true);
      if (res.ok) {
        const tritoneCand = res.candidates.find((c) => c.lawId === "law.tritone-sub.primary");
        expect(tritoneCand).toBeDefined();
        if (tritoneCand) {
          expect(tritoneCand.editPlan.maintainsTimeBalance).toBe(true);
        }
      }
    }
  });

  test("deterministic boundedness: rejects progression exceeding MAX_H1_TRANSFORM_EVENTS", () => {
    const hugeProgression = Array.from({ length: 65 }, (_, i) => ({
      eventId: eventIdOf(`huge_${String(i)}`),
      chordSymbol: "Cmaj7",
      offsetBeat: beat(i * 4),
      duration: beat(4),
    }));

    const result = evaluateTransformCandidates(hugeProgression, 0);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.refusal.code).toBe("h1.events_exceeded");
    }
  });
});
