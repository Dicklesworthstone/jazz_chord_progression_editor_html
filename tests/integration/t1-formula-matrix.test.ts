import { describe, expect, test } from "bun:test";

import allRootFixtureValue from "../fixtures/resolution/all-root-cases.json";
import formulaFixtureValue from "../fixtures/resolution/formula-rules.json";
import type {
  ChordColorPolicy,
  ChordDegree,
  ChordSpec,
  PitchClass,
  SeventhQuality,
  SpelledPitchClass,
  TriadQuality,
} from "../../src/domain";
import { parseChordSymbol, resolveChord } from "../../src/theory";

type FormulaRow = Readonly<{
  id: string;
  matrixSeed: true;
  familyId: string;
  symbolTemplate: string;
  degrees: readonly string[];
  required: readonly string[];
  optional: readonly string[];
  guide: readonly string[];
}>;

type FormulaFixture = Readonly<{
  rules: readonly FormulaRow[];
  publicRuleAssignments: Readonly<Partial<Record<string, string>>>;
  familyStateMatrix: Readonly<{
    axes: Readonly<{
      triad: readonly TriadQuality[];
      sixth: readonly (ChordDegree<6> | null)[];
      seventh: readonly (SeventhQuality | null)[];
      extension: readonly (9 | 11 | 13 | null)[];
      naturalNineAddition: readonly boolean[];
      colorPolicy: readonly ChordColorPolicy[];
    }>;
    sourceDefaults: Readonly<{
      kind: "parsed";
      sourceText: string;
      root: ChordSpec["root"];
      bass: null;
      alterations: readonly [];
      omissions: readonly [];
    }>;
    expected: Readonly<{
      totalStates: number;
      acceptedStates: number;
      outcomeCounts: Readonly<Record<string, number>>;
      reasonAndConflictCounts: Readonly<Record<string, number>>;
      acceptedRuleIdCounts: Readonly<Record<string, number>>;
      refusalRuleIdCounts: Readonly<Record<string, Readonly<Record<string, number>>>>;
    }>;
  }>;
}>;

type RootFixture = Readonly<{
  roots: readonly Readonly<{
    symbol: string;
    spelled: SpelledPitchClass;
    pitchClass: PitchClass;
  }>[];
}>;

const formulaFixture = formulaFixtureValue as unknown as FormulaFixture;
const rootFixture = allRootFixtureValue as unknown as RootFixture;

function token(degree: Readonly<{ number: number; alter: number }>): string {
  const accidental =
    degree.alter === -2
      ? "bb"
      : degree.alter === -1
        ? "b"
        : degree.alter === 1
          ? "#"
          : degree.alter === 2
            ? "##"
            : "";
  return `${accidental}${degree.number.toString()}`;
}

describe("T1 independent all-root formula matrix", () => {
  test("resolves all 12 roots x 33 reviewed formula rows exactly", () => {
    let observedCells = 0;
    const observedFamilies = new Set<string>();

    expect(rootFixture.roots).toHaveLength(12);
    expect(formulaFixture.rules).toHaveLength(33);

    for (const root of rootFixture.roots) {
      for (const row of formulaFixture.rules) {
        const sourceText = row.symbolTemplate.replace("{root}", root.symbol);
        const parsed = parseChordSymbol(sourceText, "ascii");
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) continue;

        const resolved = resolveChord(parsed.chord);
        expect(resolved.ok).toBe(true);
        if (!resolved.ok) continue;
        expect(resolved.value.source.root).toEqual(root.spelled);
        expect(resolved.value.realizations).toHaveLength(1);

        const realization = resolved.value.realizations[0];
        const expectedRuleId =
          formulaFixture.publicRuleAssignments[row.familyId];
        if (expectedRuleId === undefined) {
          throw new Error(`missing public rule assignment: ${row.familyId}`);
        }
        expect(realization.id).toBe("literal");
        expect(realization.formulaRuleId as string).toBe(expectedRuleId);
        expect(realization.degrees.map(token)).toEqual([...row.degrees]);
        expect(realization.requiredDegrees.map(token)).toEqual([
          ...row.required,
        ]);
        expect(realization.optionalDegrees.map(token)).toEqual([
          ...row.optional,
        ]);
        expect(realization.guideToneDegrees.map(token)).toEqual([...row.guide]);
        expect(realization.spelledPitchNames).toHaveLength(row.degrees.length);
        expect(realization.pitchClasses).toHaveLength(row.degrees.length);
        expect(realization.pitchClasses[0]).toBe(root.pitchClass);
        expect(Object.isFrozen(realization)).toBe(true);
        expect(Object.isFrozen(realization.degrees)).toBe(true);

        observedCells += 1;
        observedFamilies.add(row.familyId);
      }
    }

    expect(observedCells).toBe(396);
    expect(observedFamilies.size).toBe(33);
  });

  test("classifies all 896 typed family states without fallback", () => {
    const { axes, sourceDefaults, expected } = formulaFixture.familyStateMatrix;
    const outcomeCounts: Record<string, number> = {};
    const reasonAndConflictCounts: Record<string, number> = {};
    const acceptedRuleIdCounts: Record<string, number> = {};
    const refusalRuleIdCounts: Record<string, Record<string, number>> = {};
    let totalStates = 0;
    let acceptedStates = 0;

    function increment(counts: Record<string, number>, key: string): void {
      counts[key] = (counts[key] ?? 0) + 1;
    }

    for (const triad of axes.triad)
      for (const sixth of axes.sixth)
        for (const seventh of axes.seventh)
          for (const extension of axes.extension)
            for (const naturalNineAddition of axes.naturalNineAddition)
              for (const colorPolicy of axes.colorPolicy) {
                totalStates += 1;
                const source: ChordSpec = {
                  ...sourceDefaults,
                  triad,
                  sixth,
                  seventh,
                  extensions:
                    extension === null
                      ? []
                      : [{ number: extension, alter: 0 }],
                  additions: naturalNineAddition
                    ? [{ number: 9, alter: 0 }]
                    : [],
                  colorPolicy,
                };
                const result = resolveChord(source);
                if (result.ok) {
                  acceptedStates += 1;
                  increment(outcomeCounts, "accepted");
                  const ruleId = result.value.realizations[0].formulaRuleId;
                  increment(acceptedRuleIdCounts, ruleId);
                  continue;
                }

                const { refusal } = result;
                increment(outcomeCounts, refusal.code);
                if ("ruleId" in refusal) {
                  const byRule = (refusalRuleIdCounts[refusal.code] ??= {});
                  increment(byRule, refusal.ruleId);
                }
                if (
                  refusal.code === "theory.sixth_invalid" &&
                  refusal.reason === "family"
                ) {
                  increment(reasonAndConflictCounts, "sixth-family");
                } else if (
                  refusal.code === "theory.formula_family_unsupported"
                ) {
                  increment(reasonAndConflictCounts, "unsupported-seventh");
                } else if (
                  refusal.code === "theory.extension_invalid" &&
                  refusal.reason === "family"
                ) {
                  increment(reasonAndConflictCounts, "extension-family");
                } else if (
                  refusal.code === "theory.color_policy_invalid" &&
                  refusal.reason === "requires-dominant-seventh"
                ) {
                  increment(
                    reasonAndConflictCounts,
                    "requires-dominant-seventh",
                  );
                } else if (refusal.code === "theory.modifier_conflict") {
                  increment(reasonAndConflictCounts, refusal.conflict);
                }
              }

    expect(totalStates).toBe(expected.totalStates);
    expect(acceptedStates).toBe(expected.acceptedStates);
    expect(outcomeCounts).toEqual(expected.outcomeCounts);
    expect(reasonAndConflictCounts).toEqual(expected.reasonAndConflictCounts);
    expect(acceptedRuleIdCounts).toEqual(expected.acceptedRuleIdCounts);
    expect(refusalRuleIdCounts).toEqual(expected.refusalRuleIdCounts);
  });
});
