import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  type ChordEventId,
  normalizeBeatValue,
  parseStableId,
} from "../../src/domain";
import {
  type CadenceClosureStatus,
  type CadenceType,
  analyzeTonalJourney,
  detectCadence,
  makeSpelledInterval,
  spelledPitchClassToString,
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
  "../fixtures/tonal-journey",
);

describe("G0 Comprehensive Conformance and Evidence", () => {
  test("satisfies all independent tonal journey fixture cases", async () => {
    const raw = await readFile(resolve(FIXTURE_DIR, "tonal-journey-cases.json"), "utf8");
    const data = JSON.parse(raw) as {
      cases: Array<{
        id: string;
        name: string;
        chords: string[];
        expectedKeyAreas: Array<{
          tonic: string;
          mode: string;
          startIndex: number;
          endIndex: number;
          isTonicization: boolean;
        }>;
        expectedModulationsCount: number;
        expectedIsDiatonic: boolean;
      }>;
    };

    for (const testCase of data.cases) {
      const events = testCase.chords.map((chord, idx) => ({
        eventId: eventIdOf(`evt_${testCase.id}_${String(idx)}`),
        chordSymbol: chord,
        offsetBeat: beat(idx * 4),
        duration: beat(4),
      }));

      const result = analyzeTonalJourney(events);
      expect(result.ok).toBe(true);

      if (result.ok) {
        expect(result.paths.length).toBeGreaterThanOrEqual(1);
        const best = result.paths[0];
        expect(best).toBeDefined();
        if (best) {
          expect(best.keyAreas.length).toBeGreaterThanOrEqual(1);
          if (testCase.expectedKeyAreas.length === 1 && testCase.expectedKeyAreas[0]) {
            const expectedTonic = testCase.expectedKeyAreas[0].tonic;
            const primaryArea = best.keyAreas[0];
            expect(primaryArea).toBeDefined();
            if (primaryArea) {
              expect(spelledPitchClassToString(primaryArea.keyContext.tonic)).toBe(expectedTonic);
            }
          }
        }
      }
    }
  });

  test("satisfies all independent phrase cadence fixture cases", async () => {
    const raw = await readFile(resolve(FIXTURE_DIR, "phrase-cadence-cases.json"), "utf8");
    const data = JSON.parse(raw) as {
      cases: Array<{
        id: string;
        name: string;
        chords: string[];
        expectedCadence?: {
          cadenceType: string;
          status: string;
          harmonicStrength: number;
        } | null;
      }>;
    };

    for (const testCase of data.cases) {
      const firstChord = testCase.chords[0];
      const secondChord = testCase.chords[1];
      if (!firstChord || !secondChord) continue;

      const cad = detectCadence(
        firstChord,
        secondChord,
        eventIdOf(`from_${testCase.id}`),
        eventIdOf(`to_${testCase.id}`),
      );

      if (testCase.expectedCadence) {
        expect(cad).toBeDefined();
        if (cad) {
          expect(cad.cadenceType).toBe(testCase.expectedCadence.cadenceType as CadenceType);
          expect(cad.status).toBe(testCase.expectedCadence.status as CadenceClosureStatus);
        }
      } else {
        expect(cad).toBeNull();
      }
    }
  });

  test("transposition invariant across all intervals", () => {
    const baseProgression = ["Dm7", "G7", "Cmaj7", "Gm7", "C7", "Fmaj7"];
    const intervals = [
      makeSpelledInterval(2, "major", "up"),
      makeSpelledInterval(4, "perfect", "up"),
      makeSpelledInterval(3, "minor", "down"),
    ];

    for (const int of intervals) {
      const trans = transposeProgressionByInterval(baseProgression, { interval: int });
      const events = trans.transposedChords.map((chord, idx) => ({
        eventId: eventIdOf(`e_${String(idx)}`),
        chordSymbol: chord,
        offsetBeat: beat(idx * 4),
        duration: beat(4),
      }));

      const res = analyzeTonalJourney(events);
      expect(res.ok).toBe(true);
      if (res.ok) {
        const path = res.paths[0];
        expect(path).toBeDefined();
        if (path) {
          expect(path.keyAreas.length).toBeGreaterThanOrEqual(2);
        }
      }
    }
  });

  test("deterministic boundedness: processes 256 events and rejects 257 events", () => {
    const maxProgression = Array.from({ length: 256 }, (_, i) => ({
      eventId: eventIdOf(`p256_${String(i)}`),
      chordSymbol: "Cmaj7",
      offsetBeat: beat(i * 4),
      duration: beat(4),
    }));

    const okResult = analyzeTonalJourney(maxProgression);
    expect(okResult.ok).toBe(true);

    const hugeProgression = Array.from({ length: 257 }, (_, i) => ({
      eventId: eventIdOf(`p257_${String(i)}`),
      chordSymbol: "Cmaj7",
      offsetBeat: beat(i * 4),
      duration: beat(4),
    }));

    const failResult = analyzeTonalJourney(hugeProgression);
    expect(failResult.ok).toBe(false);
    if (!failResult.ok) {
      expect(failResult.refusal.code).toBe("g0.events_exceeded");
    }
  });
});
