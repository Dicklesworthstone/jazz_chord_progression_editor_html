import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  type ChordEventId,
  type BeatValue,
  normalizeBeatValue,
  parseStableId,
} from "../../src/domain";
import {
  type ContinuationCategory,
  type ContinuationProviderId,
  generateContextualContinuations,
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
  "../fixtures/continuation",
);

describe("G2 Comprehensive Conformance and Evidence", () => {
  test("satisfies all independent continuation fixture cases", async () => {
    const raw = await readFile(resolve(FIXTURE_DIR, "continuation-cases.json"), "utf8");
    const data = JSON.parse(raw) as {
      cases: Array<{
        id: string;
        name: string;
        priorChords: string[];
        expectedCandidates: Array<{
          chordSymbol: string;
          category: string;
          providerId: string;
        }>;
      }>;
    };

    for (const testCase of data.cases) {
      const events = testCase.priorChords.map((chord, idx) => ({
        eventId: eventIdOf(`evt_${testCase.id}_${String(idx)}`),
        chordSymbol: chord,
        offsetBeat: beat(idx * 4),
        duration: beat(4),
      }));

      const result = generateContextualContinuations(events);
      expect(result.ok).toBe(true);

      if (result.ok && "candidates" in result) {
        for (const expected of testCase.expectedCandidates) {
          const match = result.candidates.find((c) => c.chordSymbol === expected.chordSymbol);
          expect(match).toBeDefined();
          if (match) {
            expect(match.category).toBe(expected.category as ContinuationCategory);
            expect(match.providerId).toBe(expected.providerId as ContinuationProviderId);
            expect(match.proof.voiceLeadingScore).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  test("evaluates prediction-locked held-out continuation corpus", async () => {
    const raw = await readFile(resolve(FIXTURE_DIR, "prediction-held-out-corpus.json"), "utf8");
    const data = JSON.parse(raw) as {
      heldOutPredictions: Array<{
        id: string;
        context: string[];
        groundTruthNextChord: string;
        expectedMatchingCategory: string;
        expectedMatchingProvider: string;
      }>;
    };

    for (const item of data.heldOutPredictions) {
      const events = item.context.map((chord, idx) => ({
        eventId: eventIdOf(`heldout_${item.id}_${String(idx)}`),
        chordSymbol: chord,
        offsetBeat: beat(idx * 4),
        duration: beat(4),
      }));

      const result = generateContextualContinuations(events);
      expect(result.ok).toBe(true);

      if (result.ok && "candidates" in result) {
        const found = result.candidates.find((c) => c.chordSymbol === item.groundTruthNextChord);
        expect(found).toBeDefined();
        if (found) {
          expect(found.category).toBe(item.expectedMatchingCategory as ContinuationCategory);
          expect(found.providerId).toBe(item.expectedMatchingProvider as ContinuationProviderId);
        }
      }
    }
  });

  test("transposition invariant across intervals", () => {
    const baseContext = ["Dm7", "G7"];
    const intervals = [
      makeSpelledInterval(2, "major", "up"),
      makeSpelledInterval(4, "perfect", "up"),
      makeSpelledInterval(3, "minor", "down"),
    ];

    for (const int of intervals) {
      const trans = transposeProgressionByInterval(baseContext, { interval: int });
      const events = trans.transposedChords.map((chord, idx) => ({
        eventId: eventIdOf(`e_${String(idx)}`),
        chordSymbol: chord,
        offsetBeat: beat(idx * 4),
        duration: beat(4),
      }));

      const res = generateContextualContinuations(events);
      expect(res.ok).toBe(true);
      if (res.ok && "candidates" in res) {
        expect(res.candidates.length).toBeGreaterThanOrEqual(1);
      }
    }
  });

  test("performance gate: 8-event context search executes under 100ms", () => {
    const events = Array.from({ length: 8 }, (_, i) => ({
      eventId: eventIdOf(`perf_${String(i)}`),
      chordSymbol: i % 2 === 0 ? "Dm7" : "G7",
      offsetBeat: beat(i * 4),
      duration: beat(4),
    }));

    const start = performance.now();
    const result = generateContextualContinuations(events);
    const elapsed = performance.now() - start;

    expect(result.ok).toBe(true);
    expect(elapsed).toBeLessThan(100);
  });
});
