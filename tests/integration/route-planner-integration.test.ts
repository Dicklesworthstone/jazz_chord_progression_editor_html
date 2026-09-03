import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  type RouteStrategy,
  makeSpelledInterval,
  planHarmonicRoutes,
  transposeProgressionByInterval,
} from "../../src/theory";

const FIXTURE_DIR = resolve(
  import.meta.dir,
  "../fixtures/route-planner",
);

describe("G3 Comprehensive Conformance and Evidence", () => {
  test("satisfies all independent route planner fixture cases", async () => {
    const raw = await readFile(resolve(FIXTURE_DIR, "route-planner-cases.json"), "utf8");
    const data = JSON.parse(raw) as {
      cases: Array<{
        id: string;
        name: string;
        startChord: string;
        endChord: string;
        maxSteps: number;
        expectedPrimaryRoute: {
          intermediateChords: string[];
          strategies: string[];
        };
      }>;
    };

    for (const testCase of data.cases) {
      const result = planHarmonicRoutes(testCase.startChord, testCase.endChord, {
        maxSteps: testCase.maxSteps,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const primary = result.routes.find((r) =>
          testCase.expectedPrimaryRoute.intermediateChords.every((ic) =>
            r.intermediateChords.includes(ic),
          ),
        );
        expect(primary).toBeDefined();
        if (primary) {
          expect(primary.strategyChain).toEqual(testCase.expectedPrimaryRoute.strategies as RouteStrategy[]);
          expect(primary.costVector.totalCost).toBeGreaterThan(0);
          expect(primary.patchOperations.length).toBe(testCase.expectedPrimaryRoute.intermediateChords.length);
        }
      }
    }
  });

  test("transposition invariant across intervals for secondary ii-V routes", () => {
    const intervals = [
      makeSpelledInterval(2, "major", "up"), // Dmaj7 -> Gmaj7
      makeSpelledInterval(4, "perfect", "up"), // Fmaj7 -> Bbmaj7
      makeSpelledInterval(3, "minor", "down"), // Amaj7 -> Dmaj7
    ];

    for (const int of intervals) {
      const startTrans = transposeProgressionByInterval(["Cmaj7"], { interval: int }).transposedChords[0];
      const endTrans = transposeProgressionByInterval(["Fmaj7"], { interval: int }).transposedChords[0];

      if (startTrans && endTrans) {
        const res = planHarmonicRoutes(startTrans, endTrans, { maxSteps: 2 });
        expect(res.ok).toBe(true);
        if (res.ok) {
          expect(res.routes.length).toBeGreaterThanOrEqual(1);
          const expectedIntermediates = transposeProgressionByInterval(["Gm7", "C7"], { interval: int }).transposedChords;
          const found = res.routes.find((r) =>
            expectedIntermediates.every((ic) => r.intermediateChords.includes(ic)),
          );
          expect(found).toBeDefined();
        }
      }
    }
  });

  test("deterministic byte-for-byte reproducibility across runs", () => {
    const run1 = planHarmonicRoutes("Cmaj7", "Fmaj7", { maxSteps: 2 });
    const run2 = planHarmonicRoutes("Cmaj7", "Fmaj7", { maxSteps: 2 });

    expect(JSON.stringify(run1)).toBe(JSON.stringify(run2));
  });
});
