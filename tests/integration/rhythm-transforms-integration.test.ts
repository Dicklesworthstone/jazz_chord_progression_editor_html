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
  applyRhythmTransform,
  computeTensionCurve,
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
  "../fixtures/rhythm-transforms",
);

describe("G7 Comprehensive Conformance and Evidence", () => {
  test("satisfies all independent rhythm transform and tension curve fixture cases", async () => {
    const raw = await readFile(resolve(FIXTURE_DIR, "rhythm-transform-cases.json"), "utf8");
    const data = JSON.parse(raw) as {
      cases: Array<{
        id: string;
        name: string;
        transformKind?: "diminution" | "augmentation" | "split" | "anticipation";
        inputEvents: Array<{
          chordSymbol: string;
          offsetBeat: { numerator: number; denominator: number };
          duration: { numerator: number; denominator: number };
        }>;
        expectedTransformedEvents?: Array<{
          chordSymbol: string;
          offsetBeat: { numerator: number; denominator: number };
          duration: { numerator: number; denominator: number };
        }>;
        expectedTensionProfile?: {
          dominantHasHighestTension: boolean;
          tonicHasLowestTension: boolean;
        };
      }>;
    };

    for (const testCase of data.cases) {
      const events = testCase.inputEvents.map((ev, idx) => ({
        eventId: eventIdOf(`evt_${testCase.id}_${String(idx)}`),
        chordSymbol: ev.chordSymbol,
        offsetBeat: beat(ev.offsetBeat.numerator, ev.offsetBeat.denominator),
        duration: beat(ev.duration.numerator, ev.duration.denominator),
      }));

      if (testCase.transformKind) {
        const result = applyRhythmTransform(events, testCase.transformKind);
        expect(result.ok).toBe(true);

        if (result.ok && testCase.expectedTransformedEvents) {
          expect(result.result.transformedEvents.length).toBe(testCase.expectedTransformedEvents.length);
          for (let i = 0; i < testCase.expectedTransformedEvents.length; i++) {
            const exp = testCase.expectedTransformedEvents[i];
            const actual = result.result.transformedEvents[i];
            expect(actual?.chordSymbol).toBe(exp?.chordSymbol);
            expect(actual?.offsetBeat).toEqual(beat(exp?.offsetBeat.numerator ?? 0, exp?.offsetBeat.denominator ?? 1));
            expect(actual?.duration).toEqual(beat(exp?.duration.numerator ?? 0, exp?.duration.denominator ?? 1));
          }
        }
      }

      if (testCase.expectedTensionProfile) {
        const tensionRes = computeTensionCurve(events);
        expect(tensionRes.ok).toBe(true);

        if (tensionRes.ok) {
          const domIdx = 1; // G7
          const tonIdx = 2; // Cmaj7
          const domPoint = tensionRes.curve.points[domIdx];
          const tonPoint = tensionRes.curve.points[tonIdx];

          if (domPoint && tonPoint) {
            if (testCase.expectedTensionProfile.dominantHasHighestTension) {
              expect(domPoint.aggregateTension).toBe(tensionRes.curve.maxTension);
            }
            if (testCase.expectedTensionProfile.tonicHasLowestTension) {
              expect(tonPoint.aggregateTension).toBe(tensionRes.curve.minTension);
            }
          }
        }
      }
    }
  });

  test("transposition invariance of tension curve profile across keys", () => {
    const baseChords = ["Dm7", "G7", "Cmaj7"];
    const intervals = [
      makeSpelledInterval(2, "major", "up"),
      makeSpelledInterval(4, "perfect", "up"),
      makeSpelledInterval(3, "minor", "down"),
    ];

    const baseEvents = baseChords.map((chord, idx) => ({
      eventId: eventIdOf(`base_${String(idx)}`),
      chordSymbol: chord,
      offsetBeat: beat(idx * 4),
      duration: beat(4),
    }));
    const baseCurve = computeTensionCurve(baseEvents);
    expect(baseCurve.ok).toBe(true);

    for (const int of intervals) {
      const trans = transposeProgressionByInterval(baseChords, { interval: int }).transposedChords;
      const transEvents = trans.map((chord, idx) => ({
        eventId: eventIdOf(`trans_${String(idx)}`),
        chordSymbol: chord,
        offsetBeat: beat(idx * 4),
        duration: beat(4),
      }));

      const transCurve = computeTensionCurve(transEvents);
      expect(transCurve.ok).toBe(true);

      if (baseCurve.ok && transCurve.ok) {
        // Compare tension scores point-by-point
        for (let i = 0; i < baseCurve.curve.points.length; i++) {
          expect(transCurve.curve.points[i]?.aggregateTension).toBe(
            baseCurve.curve.points[i]?.aggregateTension,
          );
        }
      }
    }
  });

  test("deterministic byte-for-byte reproducibility across runs", () => {
    const events = [
      { eventId: eventIdOf("e0"), chordSymbol: "Dm7", offsetBeat: beat(0), duration: beat(4) },
      { eventId: eventIdOf("e1"), chordSymbol: "G7", offsetBeat: beat(4), duration: beat(4) },
      { eventId: eventIdOf("e2"), chordSymbol: "Cmaj7", offsetBeat: beat(8), duration: beat(4) },
    ];

    const run1 = computeTensionCurve(events);
    const run2 = computeTensionCurve(events);
    expect(JSON.stringify(run1)).toBe(JSON.stringify(run2));

    const trans1 = applyRhythmTransform(events, "split");
    const trans2 = applyRhythmTransform(events, "split");
    expect(JSON.stringify(trans1)).toBe(JSON.stringify(trans2));
  });
});
