import { describe, expect, test } from "bun:test";
import {
  checkKeyAmbiguity,
  referenceKeyEvidence,
  referenceKeySelection,
  type KeyAmbiguityFamily,
} from "../../scripts/m1-key-ambiguity-reference";
import { M1_KEY_AMBIGUITY_POLICY } from "../../src/export/midi-import-automation-contract";
import fixture from "../fixtures/midi-import-automation/key-ambiguity-cases.json";

const family = fixture as KeyAmbiguityFamily;

describe("M1 amendment #3 independent contract", () => {
  test("all authored scores, full ties, twelve rotations/inverses and override cases", () => {
    expect(family.cases).toHaveLength(8);
    expect(checkKeyAmbiguity(family)).toEqual([]);
    expect(M1_KEY_AMBIGUITY_POLICY).toEqual({
      automaticSelection: "unique-optimum-only",
      transpositionLaw: "all-maxima-set",
      unresolvedFallback: "m0-ranking-and-spelling",
      candidateLimit: 24,
      scoreMultiplications: 288,
    });
  });

  test("the old arbitrary presentation winner is a retained counterexample", () => {
    const symmetric = referenceKeyEvidence(Array<number>(12).fill(1));
    expect(symmetric.tiedKeys).toHaveLength(12);
    expect(symmetric.tiedKeys[0]?.tonicPitchClass).toBe(0);
    // Rotation by one leaves the masses and absolute presentation winner unchanged.
    expect(symmetric.tiedKeys[0]?.tonicPitchClass).not.toBe(1);
    expect(referenceKeySelection(symmetric, null)).toEqual({ selected: null, source: "none", invalidOverride: false });
  });

  test("zero mass is absence; one-score-unit lead is a unique optimum", () => {
    expect(referenceKeyEvidence(Array<number>(12).fill(0))).toEqual({ score: null, runnerUpScore: null, tiedKeys: [] });
    const near = referenceKeyEvidence([2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
    expect(near.score).toBe(48);
    expect(near.runnerUpScore).toBe(47);
    expect(referenceKeySelection(near, undefined)).toEqual({ selected: { tonicPitchClass: 0, mode: "minor" }, source: "inferred", invalidOverride: false });
  });

  test("user choice need not be a tied candidate; clear restores uncertainty", () => {
    const evidence = referenceKeyEvidence(Array<number>(12).fill(1));
    const before = JSON.stringify(evidence);
    expect(referenceKeySelection(evidence, { tonicPitchClass: 6, mode: "major" })).toEqual({ selected: { tonicPitchClass: 6, mode: "major" }, source: "override", invalidOverride: false });
    expect(referenceKeySelection(evidence, null).selected).toBeNull();
    expect(JSON.stringify(evidence)).toBe(before);
  });

  for (const mutation of ["lost-tie", "extra-tie", "wrong-mode", "wrong-score", "wrong-runner-up", "wrong-order"] as const) {
    test(`rejects independent fixture corruption: ${mutation}`, () => {
      const target = family.cases.find((kase) => kase.name === "uniform-all-tonics");
      if (target === undefined) throw new Error("Missing symmetry fixture");
      const keys = target.tiedKeys.map((key) => ({ ...key }));
      if (mutation === "lost-tie") keys.pop();
      if (mutation === "extra-tie") keys.push({ tonicPitchClass: 0, mode: "major" });
      if (mutation === "wrong-mode") keys[0] = { tonicPitchClass: 0, mode: "major" };
      if (mutation === "wrong-order") keys.reverse();
      const corrupted = { ...target, tiedKeys: keys,
        score: mutation === "wrong-score" ? 41 : target.score,
        runnerUpScore: mutation === "wrong-runner-up" ? 39 : target.runnerUpScore };
      expect(checkKeyAmbiguity({ cases: [corrupted] })).toContain("uniform-all-tonics: full evidence differs");
    });
  }
});
