import { describe, expect, test } from "bun:test";

import {
  AUTO_VOICE_COUNTS,
  AUTO_VOICING_FAMILIES,
  type AutoVoiceCount,
  type AutoVoicingFamily,
  type ChordDegree,
  type TriadQuality,
} from "../../src/domain";
import { parseChordSymbol } from "../../src/theory/chord-symbol";
import { resolveChord } from "../../src/theory/chord-resolution";
import type {
  ParsedChordFormulaRuleId,
  SemanticRealization,
} from "../../src/theory/resolution-contract";
import {
  assessVoicingApplicability,
  type VoicingApplicabilityPlan,
  type VoicingStaticApplicabilityRefusal,
} from "../../src/theory/voicing-applicability";
import type {
  VoicingQualityClass,
  VoicingTemplateAvailability,
} from "../../src/theory/voicing-candidates-contract";
import availabilityMatrixValue from "../fixtures/voicing/availability-matrix.json";
import formulaRulesValue from "../fixtures/resolution/formula-rules.json";

type DegreeToken = string;

type RealizationSeed = Readonly<{
  id: string;
  selectedRealizationId: string;
  formulaRuleId: ParsedChordFormulaRuleId;
  qualityClass: VoicingQualityClass;
  degrees: readonly DegreeToken[];
  requiredDegrees: readonly DegreeToken[];
  optionalDegrees: readonly DegreeToken[];
  guideToneDegrees: readonly DegreeToken[];
}>;

type MatrixRefusal =
  | Readonly<{
      code: "voicing.family_unavailable";
      termination: "family-unavailable";
      reason: string;
    }>
  | Readonly<{
      code: "voicing.constraints_unsatisfied";
      termination: "constraints-unsatisfied";
      primaryReason: string;
      reasons: readonly string[];
      absentTemplateDegrees?: readonly DegreeToken[];
    }>;

type MatrixCell = Readonly<{
  id: string;
  realizationSeedId: string;
  selectedRealizationId: string;
  formulaRuleId: ParsedChordFormulaRuleId;
  qualityClass: VoicingQualityClass;
  family: AutoVoicingFamily;
  voiceCount: AutoVoiceCount;
  policyId: string;
  expected: Readonly<{
    templateAvailability: VoicingTemplateAvailability;
    refusal: MatrixRefusal | null;
  }>;
}>;

type AvailabilityFixture = Readonly<{
  axes: Readonly<{
    realizationSeedOrder: readonly string[];
    familyOrder: readonly AutoVoicingFamily[];
    voiceCountOrder: readonly AutoVoiceCount[];
    cellOrder: readonly string[];
  }>;
  counts: Readonly<{
    realizationSeeds: number;
    families: number;
    voiceCounts: number;
    expectedCells: number;
    actualCells: number;
  }>;
  realizationSeeds: readonly RealizationSeed[];
  cells: readonly MatrixCell[];
}>;

type FormulaFixture = Readonly<{
  rules: readonly Readonly<{
    id: string;
    matrixSeed: true;
    symbolTemplate: string;
  }>[];
}>;

type BoundRealization = Readonly<{
  realization: SemanticRealization;
  sourceTriad: TriadQuality;
}>;

const availabilityFixture =
  availabilityMatrixValue as unknown as AvailabilityFixture;
const formulaFixture = formulaRulesValue as unknown as FormulaFixture;

function degreeToken(degree: ChordDegree): DegreeToken {
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

function resolveSymbol(symbol: string): Readonly<{
  realizations: readonly SemanticRealization[];
  sourceTriad: TriadQuality;
}> {
  const parsed = parseChordSymbol(symbol, "ascii");
  if (!parsed.ok) {
    throw new Error(`V0 availability fixture symbol failed to parse: ${symbol}`);
  }
  const resolved = resolveChord(parsed.chord);
  if (!resolved.ok) {
    throw new Error(
      `V0 availability fixture symbol failed to resolve: ${symbol}: ${resolved.refusal.code}`,
    );
  }
  return Object.freeze({
    realizations: resolved.value.realizations,
    sourceTriad: resolved.value.source.triad,
  });
}

function bindRealT1Seeds(): ReadonlyMap<string, BoundRealization> {
  const result = new Map<string, BoundRealization>();
  for (const row of formulaFixture.rules) {
    const resolved = resolveSymbol(row.symbolTemplate.replace("{root}", "C"));
    const realization = resolved.realizations[0];
    if (realization === undefined || resolved.realizations.length !== 1) {
      throw new Error(`Expected one literal realization for ${row.id}`);
    }
    result.set(
      row.id,
      Object.freeze({ realization, sourceTriad: resolved.sourceTriad }),
    );
  }

  const altered = resolveSymbol("C7alt");
  for (const realization of altered.realizations) {
    result.set(
      realization.id,
      Object.freeze({ realization, sourceTriad: altered.sourceTriad }),
    );
  }
  return result;
}

function requireSeed(
  seeds: ReadonlyMap<string, BoundRealization>,
  id: string,
): BoundRealization {
  const seed = seeds.get(id);
  if (seed === undefined) throw new Error(`Missing real T1 seed: ${id}`);
  return seed;
}

function expectedIdentityDegrees(
  qualityClass: VoicingQualityClass,
  sourceTriad: TriadQuality,
): readonly DegreeToken[] {
  switch (qualityClass) {
    case "major-triad":
    case "major-sixth":
    case "major-seventh":
    case "dominant-seventh":
      return ["1", "3"];
    case "minor-triad":
    case "minor-sixth":
    case "minor-seventh":
    case "minor-major-seventh":
      return ["1", "b3"];
    case "diminished-triad":
    case "half-diminished-seventh":
    case "diminished-seventh":
      return ["1", "b3", "b5"];
    case "augmented-triad":
    case "augmented-major-seventh":
      return ["1", "3", "#5"];
    case "power-triad":
      return ["1", "5"];
    case "suspended-triad":
    case "suspended-dominant":
      if (sourceTriad === "sus2") return ["1", "2"];
      if (sourceTriad === "sus4") return ["1", "4"];
      throw new Error(`Unexpected suspended source triad: ${sourceTriad}`);
  }
}

function projectRefusal(
  refusal: VoicingStaticApplicabilityRefusal | null,
): MatrixRefusal | null {
  if (refusal === null) return null;
  if (refusal.code === "voicing.family_unavailable") {
    return {
      code: refusal.code,
      termination: refusal.termination,
      reason: refusal.reason,
    };
  }
  return {
    code: refusal.code,
    termination: refusal.termination,
    primaryReason: refusal.primaryReason,
    reasons: [...refusal.reasons],
    ...(refusal.absentTemplateDegrees === undefined
      ? {}
      : {
          absentTemplateDegrees:
            refusal.absentTemplateDegrees.map(degreeToken),
        }),
  };
}

function expectFrozenPlan(plan: VoicingApplicabilityPlan): void {
  expect(Object.isFrozen(plan)).toBe(true);
  expect(Object.isFrozen(plan.identityDegrees)).toBe(true);
  expect(Object.isFrozen(plan.template)).toBe(true);
  if (plan.registerPolicy !== null) {
    expect(Object.isFrozen(plan.registerPolicy)).toBe(true);
  }
  if (plan.refusal?.code === "voicing.constraints_unsatisfied") {
    expect(Object.isFrozen(plan.refusal)).toBe(true);
    expect(Object.isFrozen(plan.refusal.reasons)).toBe(true);
    if (plan.refusal.absentTemplateDegrees !== undefined) {
      expect(Object.isFrozen(plan.refusal.absentTemplateDegrees)).toBe(true);
    }
  } else if (plan.refusal !== null) {
    expect(Object.isFrozen(plan.refusal)).toBe(true);
  }
}

describe("V0 independent static availability matrix", () => {
  test("binds all 37 reviewed projections through the real T0/T1 path", () => {
    const realSeeds = bindRealT1Seeds();
    expect(formulaFixture.rules).toHaveLength(33);
    expect(realSeeds.size).toBe(37);
    expect(availabilityFixture.realizationSeeds).toHaveLength(37);

    for (const expected of availabilityFixture.realizationSeeds) {
      const { realization, sourceTriad } = requireSeed(realSeeds, expected.id);
      const actualRealizationId: string = realization.id;
      expect(actualRealizationId).toBe(expected.selectedRealizationId);
      expect(realization.formulaRuleId).toBe(expected.formulaRuleId);
      expect(realization.degrees.map(degreeToken)).toEqual([...expected.degrees]);
      expect(realization.requiredDegrees.map(degreeToken)).toEqual(
        [...expected.requiredDegrees],
      );
      expect(realization.optionalDegrees.map(degreeToken)).toEqual(
        [...expected.optionalDegrees],
      );
      expect(realization.guideToneDegrees.map(degreeToken)).toEqual(
        [...expected.guideToneDegrees],
      );

      const assessment = assessVoicingApplicability(
        realization,
        sourceTriad,
        "balanced",
        3,
      );
      expect(assessment.qualityClass).toBe(expected.qualityClass);
      expect(assessment.identityDegrees.map(degreeToken)).toEqual(
        [...expectedIdentityDegrees(expected.qualityClass, sourceTriad)],
      );
    }
  });

  test("separates declared adaptive minima from realization-fit omissions", () => {
    const altered = resolveSymbol("C7alt");
    const realization = altered.realizations.find(
      ({ id }) => id === "alt-b9-b5",
    );
    if (realization === undefined) {
      throw new Error("missing alt-b9-b5 realization");
    }

    expect(
      projectRefusal(
        assessVoicingApplicability(
          realization,
          altered.sourceTriad,
          "balanced",
          3,
        ).refusal,
      ),
    ).toEqual({
      code: "voicing.constraints_unsatisfied",
      termination: "constraints-unsatisfied",
      primaryReason: "required-degree-omitted",
      reasons: ["required-degree-omitted", "guide-tone-omitted"],
    });
    expect(
      projectRefusal(
        assessVoicingApplicability(
          realization,
          altered.sourceTriad,
          "balanced",
          4,
        ).refusal,
      ),
    ).toEqual({
      code: "voicing.constraints_unsatisfied",
      termination: "constraints-unsatisfied",
      primaryReason: "required-degree-omitted",
      reasons: ["required-degree-omitted"],
    });
    expect(
      assessVoicingApplicability(
        realization,
        altered.sourceTriad,
        "balanced",
        5,
      ).refusal,
    ).toBeNull();
    expect(
      projectRefusal(
        assessVoicingApplicability(
          realization,
          altered.sourceTriad,
          "drop2",
          3,
        ).refusal,
      ),
    ).toEqual({
      code: "voicing.constraints_unsatisfied",
      termination: "constraints-unsatisfied",
      primaryReason: "voice-count-below-template-minimum",
      reasons: ["voice-count-below-template-minimum"],
    });
  });

  test("matches every one of the 1,295 independent fixture decisions", () => {
    const { axes, counts, cells } = availabilityFixture;
    const realSeeds = bindRealT1Seeds();
    expect(axes.realizationSeedOrder).toEqual(
      availabilityFixture.realizationSeeds.map(({ id }) => id),
    );
    expect(axes.familyOrder).toEqual([...AUTO_VOICING_FAMILIES]);
    expect(axes.voiceCountOrder).toEqual([...AUTO_VOICE_COUNTS]);
    expect(axes.cellOrder).toEqual([
      "realization-seed-order",
      "family-order",
      "voice-count-order",
    ]);
    expect(counts).toMatchObject({
      realizationSeeds: 37,
      families: 7,
      voiceCounts: 5,
      expectedCells: 1295,
      actualCells: 1295,
    });
    expect(cells).toHaveLength(37 * 7 * 5);

    let cellIndex = 0;
    for (const seedId of axes.realizationSeedOrder) {
      const { realization, sourceTriad } = requireSeed(realSeeds, seedId);
      for (const family of axes.familyOrder) {
        for (const voiceCount of axes.voiceCountOrder) {
          const cell = cells[cellIndex];
          if (cell === undefined) {
            throw new Error(`Missing V0 availability cell ${cellIndex.toString()}`);
          }
          expect(cell.realizationSeedId).toBe(seedId);
          expect(cell.family).toBe(family);
          expect(cell.voiceCount).toBe(voiceCount);
          expect(cell.selectedRealizationId).toBe(realization.id);
          expect(cell.formulaRuleId).toBe(realization.formulaRuleId);

          const actual = assessVoicingApplicability(
            realization,
            sourceTriad,
            family,
            voiceCount,
          );
          expect(actual.qualityClass).toBe(cell.qualityClass);
          expect(actual.templateId).toBe(cell.policyId);
          expect(actual.templateAvailability).toBe(
            cell.expected.templateAvailability,
          );
          expect(projectRefusal(actual.refusal)).toEqual(cell.expected.refusal);
          expect(actual.registerPolicy === null).toBe(
            actual.templateAvailability === "unavailable",
          );
          expectFrozenPlan(actual);
          cellIndex += 1;
        }
      }
    }
    expect(cellIndex).toBe(1295);
  });
});
