import { describe, expect, test } from "bun:test";
import { planHarmonicRoutes } from "../../src/theory";

describe("G3 Harmonic Route Planner", () => {
  test("plans secondary ii-V route from Cmaj7 to Fmaj7 (Gm7 -> C7)", () => {
    const result = planHarmonicRoutes("Cmaj7", "Fmaj7", { maxSteps: 2 });
    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.routes.length).toBeGreaterThanOrEqual(1);
      const primary = result.routes.find((r) =>
        r.intermediateChords.includes("Gm7") && r.intermediateChords.includes("C7"),
      );
      expect(primary).toBeDefined();
      if (primary) {
        expect(primary.fullProgression).toEqual(["Cmaj7", "Gm7", "C7", "Fmaj7"]);
        expect(primary.strategyChain).toEqual(["circle-of-fifths", "circle-of-fifths"]);
        expect(primary.proofs.length).toBe(2);
        expect(primary.patchOperations.length).toBe(2);
      }
    }
  });

  test("plans turnaround route from Cmaj7 back to Cmaj7 (A7 -> Dm7 -> G7)", () => {
    const result = planHarmonicRoutes("Cmaj7", "Cmaj7", { maxSteps: 3 });
    expect(result.ok).toBe(true);

    if (result.ok) {
      const turnaround = result.routes.find((r) =>
        r.intermediateChords.includes("A7") &&
        r.intermediateChords.includes("Dm7") &&
        r.intermediateChords.includes("G7"),
      );
      expect(turnaround).toBeDefined();
      if (turnaround) {
        expect(turnaround.stepsCount).toBe(3);
        expect(turnaround.costVector.totalCost).toBeGreaterThan(0);
      }
    }
  });

  test("plans tritone substitution arrival from Dm7 to Cmaj7 (Db7)", () => {
    const result = planHarmonicRoutes("Dm7", "Cmaj7", { maxSteps: 1 });
    expect(result.ok).toBe(true);

    if (result.ok) {
      const tritoneRoute = result.routes.find((r) => r.intermediateChords.includes("Db7"));
      expect(tritoneRoute).toBeDefined();
      if (tritoneRoute) {
        expect(tritoneRoute.strategyChain).toEqual(["tritone-substitute"]);
        expect(tritoneRoute.proofs[0]?.voiceLeadingMotion).toBe("chromatic");
      }
    }
  });

  test("refuses invalid start or end chord syntax", () => {
    const res1 = planHarmonicRoutes("InvalidChordX", "Cmaj7");
    expect(res1.ok).toBe(false);
    if (!res1.ok) {
      expect(res1.refusal.code).toBe("g3.invalid_endpoint");
    }

    const res2 = planHarmonicRoutes("Cmaj7", "BadChordY");
    expect(res2.ok).toBe(false);
    if (!res2.ok) {
      expect(res2.refusal.code).toBe("g3.invalid_endpoint");
    }
  });

  test("refuses maxSteps exceeding limit of 8", () => {
    const res = planHarmonicRoutes("Cmaj7", "Fmaj7", { maxSteps: 9 });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.refusal.code).toBe("g3.steps_exceeded");
    }
  });
});
