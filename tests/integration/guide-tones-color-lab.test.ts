import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { type ChordEventId, parseStableId } from "../../src/domain";
import {
  type TensionDegree,
  deriveContextualColor,
  extractEventGuideTones,
  optimizeGuideTonePaths,
  spelledPitchClassToString,
} from "../../src/theory";

function eventIdOf(wire: string): ChordEventId {
  const res = parseStableId("event", wire);
  if (!res.ok) throw new Error(`Invalid event id: ${wire}`);
  return res.value;
}

const FIXTURE_DIR = resolve(
  import.meta.dir,
  "../fixtures/guide-tones",
);

describe("G6 Comprehensive Conformance and Evidence", () => {
  test("satisfies all independent guide-tone fixture cases", async () => {
    const raw = await readFile(resolve(FIXTURE_DIR, "guide-tone-cases.json"), "utf8");
    const data = JSON.parse(raw) as {
      cases: Array<{
        id: string;
        name: string;
        chords: string[];
        expectedExtractions: Array<{
          chord: string;
          guideTones: Array<{ degree: string; role: string; spelledPitchClass: string }>;
        }>;
      }>;
    };

    for (const testCase of data.cases) {
      const events = testCase.chords.map((chord, index) => ({
        eventId: eventIdOf(`evt_${testCase.id}_${String(index)}`),
        chordSymbol: chord,
      }));

      for (let i = 0; i < events.length; i++) {
        const ev = events[i];
        if (!ev) continue;
        const expected = testCase.expectedExtractions[i];
        if (!expected) continue;

        const ext = extractEventGuideTones(ev.chordSymbol, ev.eventId);
        expect(ext.guideTones.length).toBeGreaterThanOrEqual(expected.guideTones.length);

        for (const expGt of expected.guideTones) {
          const found = ext.guideTones.find((g) => {
            const degStr =
              (g.degree.alter < 0
                ? "b".repeat(-g.degree.alter)
                : g.degree.alter > 0
                  ? "#".repeat(g.degree.alter)
                  : "") + String(g.degree.number);
            return degStr === expGt.degree && g.role === expGt.role;
          });
          expect(found).toBeDefined();
          if (found) {
            expect(spelledPitchClassToString(found.spelledPitchClass)).toBe(expGt.spelledPitchClass);
          }
        }
      }

      // Verify path optimization produces a smooth valid path
      const pathResult = optimizeGuideTonePaths(events);
      expect(pathResult.ok).toBe(true);
      if (pathResult.ok) {
        expect(pathResult.paths.length).toBeGreaterThanOrEqual(1);
        const best = pathResult.paths[0];
        expect(best).toBeDefined();
        if (best) {
          expect(best.lines.length).toBe(2);
          expect(best.totalMotionCost).toBeGreaterThanOrEqual(0);
          expect(best.hasCrossings).toBe(false);
        }
      }
    }
  });

  test("satisfies all independent color laboratory fixture cases", async () => {
    const raw = await readFile(resolve(FIXTURE_DIR, "color-lab-cases.json"), "utf8");
    const data = JSON.parse(raw) as {
      cases: Array<{
        id: string;
        chord: string;
        expectedColorOptions: Array<{
          optionId: string;
          family: string;
          compatibleScaleId: string;
          tensions: string[];
        }>;
        expectedUpperStructures?: Array<{
          numeralRelation: string;
          triadRoot: string;
        }>;
      }>;
    };

    for (const testCase of data.cases) {
      const eventId = eventIdOf(`evt_color_${testCase.id}`);
      const result = deriveContextualColor(testCase.chord, eventId);
      expect(result.ok).toBe(true);

      if (result.ok) {
        for (const expColor of testCase.expectedColorOptions) {
          const found = result.colorOptions.find(
            (o) => o.optionId === expColor.optionId || o.compatibleScaleId === expColor.compatibleScaleId,
          );
          expect(found).toBeDefined();
          if (found) {
            for (const t of expColor.tensions) {
              expect(found.tensions).toContain(t as TensionDegree);
            }
          }
        }

        if (testCase.expectedUpperStructures) {
          for (const expUst of testCase.expectedUpperStructures) {
            const foundUst = result.upperStructureOptions.find(
              (u) => u.numeralRelation === expUst.numeralRelation,
            );
            expect(foundUst).toBeDefined();
            if (foundUst) {
              expect(spelledPitchClassToString(foundUst.triadRoot)).toBe(expUst.triadRoot);
            }
          }
        }
      }
    }
  });

  test("transposition invariant: transposing progression maintains smooth motion and roles", () => {
    const cProgression = [
      { eventId: eventIdOf("c_1"), chordSymbol: "Dm7" },
      { eventId: eventIdOf("c_2"), chordSymbol: "G7" },
      { eventId: eventIdOf("c_3"), chordSymbol: "Cmaj7" },
    ];
    const fProgression = [
      { eventId: eventIdOf("f_1"), chordSymbol: "Gm7" },
      { eventId: eventIdOf("f_2"), chordSymbol: "C7" },
      { eventId: eventIdOf("f_3"), chordSymbol: "Fmaj7" },
    ];

    const cResult = optimizeGuideTonePaths(cProgression);
    const fResult = optimizeGuideTonePaths(fProgression);

    expect(cResult.ok).toBe(true);
    expect(fResult.ok).toBe(true);

    if (cResult.ok && fResult.ok) {
      const cPath = cResult.paths[0];
      const fPath = fResult.paths[0];
      expect(cPath).toBeDefined();
      expect(fPath).toBeDefined();
      if (cPath && fPath) {
        expect(cPath.totalMotionCost).toBe(fPath.totalMotionCost);
        expect(cPath.stepResolutionPercentage).toBe(fPath.stepResolutionPercentage);
        expect(cPath.contraryMotionCount).toBe(fPath.contraryMotionCount);
        expect(cPath.parallelMotionCount).toBe(fPath.parallelMotionCount);
        expect(cPath.obliqueMotionCount).toBe(fPath.obliqueMotionCount);
      }
    }
  });

  test("deterministic boundedness: rejects progression exceeding MAX_G6_PROGRESSION_EVENTS", () => {
    const hugeProgression = Array.from({ length: 65 }, (_, i) => ({
      eventId: eventIdOf(`huge_${String(i)}`),
      chordSymbol: "Cmaj7",
    }));

    const result = optimizeGuideTonePaths(hugeProgression);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.refusal.code).toBe("g6.events_exceeded");
    }
  });
});
