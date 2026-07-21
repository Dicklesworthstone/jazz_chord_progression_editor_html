import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  ChordDegree,
  ChordSpec,
  CustomChordSpec,
  PitchClass,
  SpelledPitchClass,
} from "../../src/domain";
import {
  ALTERED_DOMINANT_REALIZATION_IDS,
  CHORD_FORMULA_PHASES,
  CHORD_FORMULA_RULE_IDS,
  CHORD_FORMULA_TABLE_ID,
  CHORD_FORMULA_TABLE_VERSION,
  CUSTOM_REALIZATION_ID,
  CUSTOM_REALIZATION_LIMITATIONS,
  DEGREE_ROLE_POLICY_ID,
  DEGREE_ROLE_POLICY_VERSION,
  DEGREE_SPELLING_POLICY_ID,
  DEGREE_SPELLING_POLICY_VERSION,
  MAX_CUSTOM_CHORD_PITCHES,
  MAX_DEGREE_SPELLING_ALTERATION,
  MAX_THEORY_ADDITIONS,
  MAX_THEORY_ALTERATIONS,
  MAX_THEORY_CANDIDATE_INSERTIONS,
  MAX_THEORY_DEGREES_PER_REALIZATION,
  MAX_THEORY_EXTENSIONS,
  MAX_THEORY_FORMULA_PHASES,
  MAX_THEORY_FORMULA_PHASE_TRANSITIONS,
  MAX_THEORY_INPUT_DEGREE_RECORDS_VISITED,
  MAX_THEORY_OMISSIONS,
  MAX_THEORY_PEAK_CANDIDATE_DEGREE_RECORDS,
  MAX_THEORY_REALIZATIONS,
  MAX_THEORY_SEMANTIC_OUTPUT_RECORDS,
  MAX_THEORY_SPELLING_ATTEMPTS,
  MAX_THEORY_TRACKED_RECORDS,
  MAX_THEORY_WARNINGS,
  MIN_DEGREE_SPELLING_ALTERATION,
  RESOLUTION_CONTRACT_SCHEMA,
  RESOLUTION_OPERATION_NAMES,
  RESOLVED_CHORD_SCHEMA,
  SEMANTIC_REALIZATION_IDS,
  THEORY_ADDITION_NUMBERS,
  THEORY_ALTERATION_NUMBERS,
  THEORY_EXTENSION_NUMBERS,
  THEORY_MODIFIER_ALTERATIONS,
  THEORY_MODIFIER_CONFLICT_PRECEDENCE,
  THEORY_OMISSION_NUMBERS,
  THEORY_REFUSAL_CODES,
  THEORY_REFUSAL_PRECEDENCE,
  THEORY_REFUSAL_REASON_PRECEDENCE,
  THEORY_WARNING_CODES,
  type AlteredDominantRealizationTuple,
  type AlteredDominantSemanticRealization,
  type ChordFormulaRuleId,
  type ColorPolicyInvalidRefusal,
  type CustomChordSpecWithPitches,
  type CustomRealization,
  type CustomResolveChordResult,
  type CustomResolvedChord,
  type DegreeSpellingResult,
  type FormulaRuleForSemanticRealization,
  type IndexAlignedTuple,
  type LiteralFormulaRuleId,
  type LiteralRealizationTuple,
  type ModifierConflictRefusal,
  type NonEmptySpelledPitchClassTuple,
  type ParsedChordFormulaRuleId,
  type ParsedResolveChordResult,
  type ParsedResolvedChord,
  type ResolutionOperations,
  type ResolveChord,
  type ResolveChordResult,
  type ResolvedChordMetadata,
  type SemanticRealization,
  type SpellChordDegree,
  type TheoryModifierConflict,
  type TheoryRealizationDegreesExceededRefusal,
  type TheoryRefusalCode,
  type TheoryResolutionRefusal,
  type TheoryWarning,
  type TheoryWarnings,
} from "../../src/theory";
import type {
  ResolutionWorkEvidence,
  ResolveChordWithEvidence,
  ResolveChordWithEvidenceResult,
  SpellChordDegreeWithEvidence,
  SpellChordDegreeWithEvidenceResult,
} from "../../src/theory/resolution-evidence-contract";
import {
  T1_REVIEWED_COMPANIONS,
  T1_REVIEWED_FORMULA_RULE_IDS,
  T1_REVIEWED_LAW_PREDICATE_DIGESTS,
  T1_REVIEWED_LIMITS,
  T1_REVIEWED_PUBLIC_CONTRACT,
  T1_REVIEWED_REFUSAL_PRECEDENCE,
  validateT1Contract,
} from "../../scripts/validate-t1-contract";

setDefaultTimeout(60_000);

type Equal<Left, Right> =
  [Left] extends [Right]
    ? [Right] extends [Left]
      ? true
      : false
    : false;
type HasKey<Value, Key extends PropertyKey> = Key extends keyof Value
  ? true
  : false;
type Not<Value extends boolean> = Value extends true ? false : true;

function assertType<Constraint extends true>(proof?: Constraint): Constraint {
  return proof ?? (true as Constraint);
}

type ResolutionSuccess = Extract<ResolveChordResult, { ok: true }>;
type ResolutionFailure = Extract<ResolveChordResult, { ok: false }>;
type SpellingFailure = Extract<DegreeSpellingResult, { ok: false }>;
type TwoPitches = readonly [SpelledPitchClass, SpelledPitchClass];
type TwoPitchCustom = CustomRealization<TwoPitches>;
type ExpectedCustomResolver = <
  Pitches extends NonEmptySpelledPitchClassTuple,
>(
  source: CustomChordSpecWithPitches<Pitches>,
) => CustomResolveChordResult<Pitches>;
type ExpectedParsedResolver = (
  source: ChordSpec,
) => ParsedResolveChordResult;
type ExpectedCustomEvidenceResolver = <
  Pitches extends NonEmptySpelledPitchClassTuple,
>(
  source: CustomChordSpecWithPitches<Pitches>,
) => ResolveChordWithEvidenceResult<CustomResolveChordResult<Pitches>>;
type ExpectedParsedEvidenceResolver = (
  source: ChordSpec,
) => ResolveChordWithEvidenceResult<ParsedResolveChordResult>;

const typeAssertions = [
  assertType<
    Equal<
      Parameters<SpellChordDegree>,
      [root: SpelledPitchClass, degree: ChordDegree]
    >
  >(),
  assertType<Equal<ReturnType<SpellChordDegree>, DegreeSpellingResult>>(),
  assertType<
    Equal<Parameters<ResolveChord>, [source: ChordSpec | CustomChordSpec]>
  >(),
  assertType<Equal<ReturnType<ResolveChord>, ResolveChordResult>>(),
  assertType<ResolveChord extends ExpectedCustomResolver ? true : false>(),
  assertType<ResolveChord extends ExpectedParsedResolver ? true : false>(),
  assertType<Equal<keyof ResolutionSuccess, "ok" | "value">>(),
  assertType<Equal<keyof ResolutionFailure, "ok" | "refusal">>(),
  assertType<Not<HasKey<ResolutionFailure, "partial">>>(),
  assertType<Not<HasKey<ResolutionFailure, "warnings">>>(),
  assertType<Equal<ResolutionFailure["refusal"], TheoryResolutionRefusal>>(),
  assertType<Equal<TheoryResolutionRefusal["code"], TheoryRefusalCode>>(),
  assertType<
    Equal<TheoryRealizationDegreesExceededRefusal["path"], readonly []>
  >(),
  assertType<
    Equal<TheoryRealizationDegreesExceededRefusal["phase"], "canonicalization">
  >(),
  assertType<Equal<ColorPolicyInvalidRefusal["received"], "altered-dominant">>(),
  assertType<
    Equal<
      Extract<ModifierConflictRefusal, { conflict: "sixth-with-seventh" }>["phase"],
      "base"
    >
  >(),
  assertType<
    Equal<
      Extract<ModifierConflictRefusal, { conflict: "addition-omission" }>["phase"],
      "additions"
    >
  >(),
  assertType<
    Equal<
      Extract<ModifierConflictRefusal, { conflict: "structural-alteration-pair" }>["phase"],
      "structural-alterations"
    >
  >(),
  assertType<Equal<ParsedChordFormulaRuleId, Exclude<ChordFormulaRuleId, "custom">>>(),
  assertType<Equal<keyof SpellingFailure, "ok" | "refusal">>(),
  assertType<
    Equal<
      keyof ResolvedChordMetadata,
      | "degreeRolePolicyId"
      | "degreeRolePolicyVersion"
      | "degreeSpellingPolicyId"
      | "degreeSpellingPolicyVersion"
      | "formulaTableId"
      | "formulaTableVersion"
      | "schema"
    >
  >(),
  assertType<
    Equal<
      keyof ParsedResolvedChord,
      | keyof ResolvedChordMetadata
      | "bass"
      | "realizations"
      | "source"
      | "warnings"
    >
  >(),
  assertType<Equal<LiteralRealizationTuple["length"], 1>>(),
  assertType<Equal<LiteralRealizationTuple[0]["id"], "literal">>(),
  assertType<Equal<LiteralRealizationTuple[0]["formulaRuleId"], LiteralFormulaRuleId>>(),
  assertType<Equal<AlteredDominantRealizationTuple["length"], 4>>(),
  assertType<Equal<AlteredDominantRealizationTuple[0]["id"], "alt-b9-b5">>(),
  assertType<Equal<AlteredDominantRealizationTuple[1]["id"], "alt-b9-sharp5">>(),
  assertType<Equal<AlteredDominantRealizationTuple[2]["id"], "alt-sharp9-b5">>(),
  assertType<Equal<AlteredDominantRealizationTuple[3]["id"], "alt-sharp9-sharp5">>(),
  assertType<
    Equal<
      AlteredDominantSemanticRealization["formulaRuleId"],
      "altered-dominant"
    >
  >(),
  assertType<Equal<FormulaRuleForSemanticRealization<"literal">, LiteralFormulaRuleId>>(),
  assertType<Equal<FormulaRuleForSemanticRealization<"alt-b9-b5">, "altered-dominant">>(),
  assertType<Equal<TwoPitchCustom["degrees"], null>>(),
  assertType<Equal<TwoPitchCustom["requiredDegrees"], null>>(),
  assertType<Equal<TwoPitchCustom["optionalDegrees"], null>>(),
  assertType<Equal<TwoPitchCustom["guideToneDegrees"], null>>(),
  assertType<Equal<TwoPitchCustom["pitchClasses"], readonly [PitchClass, PitchClass]>>(),
  assertType<Equal<IndexAlignedTuple<TwoPitches, PitchClass>, TwoPitchCustom["pitchClasses"]>>(),
  assertType<Equal<CustomResolvedChord<TwoPitches>["warnings"], readonly []>>(),
  assertType<
    Equal<
      CustomResolveChordResult<TwoPitches>["value"],
      CustomResolvedChord<TwoPitches>
    >
  >(),
  assertType<Equal<TheoryWarnings["length"], 0 | 1>>(),
  assertType<Equal<TheoryWarning["degreeNumber"], 3>>(),
  assertType<
    Equal<
      keyof ResolutionOperations,
      "resolveChord" | "spellChordDegree"
    >
  >(),
  assertType<
    Equal<
      TheoryModifierConflict,
      (typeof THEORY_MODIFIER_CONFLICT_PRECEDENCE)[number]
    >
  >(),
  assertType<
    Equal<
      SemanticRealization<"literal">["formulaRuleId"],
      Exclude<ChordFormulaRuleId, "altered-dominant" | "custom">
    >
  >(),
  assertType<
    Equal<
      keyof ResolutionWorkEvidence,
      | "candidateDegreesObserved"
      | "degreesProduced"
      | "duplicateDegreesCanonicalized"
      | "formulaPhaseTransitions"
      | "inputDegreeRecordsVisited"
      | "peakCandidateDegreeRecords"
      | "realizationsProduced"
      | "spellingAttempts"
      | "termination"
      | "warningsProduced"
    >
  >(),
  assertType<
    Equal<
      ResolutionWorkEvidence["termination"],
      | "complete"
      | "formula-refusal"
      | "spelling-refusal"
      | "output-limit-refusal"
    >
  >(),
  assertType<
    Equal<ReturnType<SpellChordDegreeWithEvidence>, SpellChordDegreeWithEvidenceResult>
  >(),
  assertType<
    Equal<ReturnType<ResolveChordWithEvidence>, ResolveChordWithEvidenceResult>
  >(),
  assertType<ResolveChordWithEvidence extends ExpectedCustomEvidenceResolver ? true : false>(),
  assertType<ResolveChordWithEvidence extends ExpectedParsedEvidenceResolver ? true : false>(),
  assertType<Equal<(typeof T1_REVIEWED_COMPANIONS)[0], "formula-rules.json">>(),
  assertType<Equal<(typeof T1_REVIEWED_FORMULA_RULE_IDS)[0], "base-major">>(),
  assertType<Equal<(typeof T1_REVIEWED_REFUSAL_PRECEDENCE)[0], "theory.sixth_invalid">>(),
  assertType<Equal<typeof T1_REVIEWED_PUBLIC_CONTRACT.formulaTable.version, 1>>(),
  assertType<Equal<typeof T1_REVIEWED_LIMITS.degreesPerRealization, 16>>(),
] as const;

const contractPath = fileURLToPath(
  new URL("../../src/theory/resolution-contract.ts", import.meta.url),
);
const theoryIndexPath = fileURLToPath(
  new URL("../../src/theory/index.ts", import.meta.url),
);
const validatorPath = fileURLToPath(
  new URL("../../scripts/validate-t1-contract.ts", import.meta.url),
);
const fixtureRoot = fileURLToPath(
  new URL("../fixtures/resolution", import.meta.url),
);

type MutableJsonObject = Record<string, unknown>;

function mutableObject(value: unknown): MutableJsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("Expected a mutable JSON object.");
  }
  return value as MutableJsonObject;
}

function mutableObjects(value: unknown): MutableJsonObject[] {
  if (!Array.isArray(value)) throw new TypeError("Expected a mutable JSON array.");
  return value.map(mutableObject);
}

function recordById(
  records: readonly MutableJsonObject[],
  id: string,
): MutableJsonObject {
  const record = records.find((candidate) => candidate["id"] === id);
  if (record === undefined) throw new TypeError(`Missing fixture record ${id}.`);
  return record;
}

async function editFixtureJson(
  root: string,
  filename: string,
  edit: (document: MutableJsonObject) => void,
): Promise<void> {
  const path = join(root, filename);
  const document = mutableObject(JSON.parse(await readFile(path, "utf8")) as unknown);
  edit(document);
  await writeFile(path, `${JSON.stringify(document, null, 2)}\n`, "utf8");
}

async function validateFixtureCopy(
  edit: (root: string) => Promise<void>,
): Promise<Awaited<ReturnType<typeof validateT1Contract>>> {
  const root = await mkdtemp(join(tmpdir(), "changes-t1-contract-"));
  try {
    await cp(fixtureRoot, root, { recursive: true });
    await edit(root);
    return await validateT1Contract(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function findingCodes(
  report: Awaited<ReturnType<typeof validateT1Contract>>,
): string[] {
  return report.findings.map((finding) => finding.code);
}

function isDeeplyFrozen(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return true;
  return Object.isFrozen(value) && Object.values(value).every(isDeeplyFrozen);
}

describe("T1 public resolution contract", () => {
  test("preserves exact public result, tuple, role, and evidence types", () => {
    expect(typeAssertions.every(Boolean)).toBe(true);
  });

  test("exports the reviewed identities and closed ordered vocabularies", () => {
    expect(RESOLUTION_CONTRACT_SCHEMA).toBe(
      "changes.theory.resolution-contract.v1",
    );
    expect(RESOLVED_CHORD_SCHEMA).toBe("changes.theory.resolved-chord.v1");
    expect(CHORD_FORMULA_TABLE_ID).toBe("changes.chord-formulas");
    expect(CHORD_FORMULA_TABLE_VERSION).toBe(1);
    expect(DEGREE_SPELLING_POLICY_ID).toBe("changes.degree-spelling");
    expect(DEGREE_SPELLING_POLICY_VERSION).toBe(1);
    expect(DEGREE_ROLE_POLICY_ID).toBe("changes.balanced-degree-roles");
    expect(DEGREE_ROLE_POLICY_VERSION).toBe(1);
    expect(RESOLUTION_OPERATION_NAMES).toEqual([
      "spellChordDegree",
      "resolveChord",
    ]);
    expect(CHORD_FORMULA_PHASES).toEqual([
      "base",
      "suspension",
      "structural-alterations",
      "color-alterations",
      "additions",
      "omissions",
      "canonicalization",
      "spelling",
    ]);
    expect(SEMANTIC_REALIZATION_IDS).toEqual([
      "literal",
      "alt-b9-b5",
      "alt-b9-sharp5",
      "alt-sharp9-b5",
      "alt-sharp9-sharp5",
    ]);
    expect(ALTERED_DOMINANT_REALIZATION_IDS).toEqual([
      "alt-b9-b5",
      "alt-b9-sharp5",
      "alt-sharp9-b5",
      "alt-sharp9-sharp5",
    ]);
    expect(CUSTOM_REALIZATION_ID).toBe("custom");
    expect(CUSTOM_REALIZATION_LIMITATIONS).toEqual([
      "custom.no_degree_analysis",
      "custom.no_auto_voicing",
    ]);
    expect(THEORY_WARNING_CODES).toEqual(["theory.omission_absent"]);
    expect(THEORY_REFUSAL_CODES).toHaveLength(10);
    expect(THEORY_REFUSAL_PRECEDENCE).toEqual([
      "theory.sixth_invalid",
      "theory.extension_invalid",
      "theory.addition_invalid",
      "theory.alteration_invalid",
      "theory.omission_invalid",
      "theory.formula_family_unsupported",
      "theory.color_policy_invalid",
      "theory.modifier_conflict",
      "limit.theory_realization_degrees_exceeded",
      "theory.spelling_accidental_out_of_range",
    ]);
    expect(new Set(THEORY_REFUSAL_PRECEDENCE)).toEqual(
      new Set(THEORY_REFUSAL_CODES),
    );
    expect(THEORY_REFUSAL_REASON_PRECEDENCE).toEqual({
      "theory.sixth_invalid": ["alteration", "family"],
      "theory.extension_invalid": ["count", "number", "alteration", "family"],
      "theory.addition_invalid": ["count", "number", "alteration"],
      "theory.alteration_invalid": ["count", "number", "alteration"],
      "theory.omission_invalid": ["count", "number"],
      "theory.color_policy_invalid": [
        "requires-dominant-seventh",
        "explicit-five-or-nine-alteration",
      ],
    });
    expect(CHORD_FORMULA_RULE_IDS).toHaveLength(22);
  });

  test("pins every collection, work, output, and spelling bound", () => {
    expect({
      extensions: MAX_THEORY_EXTENSIONS,
      additions: MAX_THEORY_ADDITIONS,
      alterations: MAX_THEORY_ALTERATIONS,
      omissions: MAX_THEORY_OMISSIONS,
    }).toEqual({ extensions: 1, additions: 7, alterations: 8, omissions: 2 });
    expect(THEORY_EXTENSION_NUMBERS).toEqual([9, 11, 13]);
    expect(THEORY_ADDITION_NUMBERS).toEqual([2, 3, 4, 6, 9, 11, 13]);
    expect(THEORY_ALTERATION_NUMBERS).toEqual([5, 9, 11, 13]);
    expect(THEORY_OMISSION_NUMBERS).toEqual([3, 5]);
    expect(THEORY_MODIFIER_ALTERATIONS).toEqual([-1, 1]);
    expect(THEORY_MODIFIER_CONFLICT_PRECEDENCE).toEqual([
      "sixth-with-seventh",
      "sixth-with-extension",
      "addition-omission",
      "alteration-omission",
      "structural-alteration-pair",
    ]);
    expect(MAX_THEORY_REALIZATIONS).toBe(4);
    expect(MAX_THEORY_DEGREES_PER_REALIZATION).toBe(16);
    expect(MAX_THEORY_SEMANTIC_OUTPUT_RECORDS).toBe(
      MAX_THEORY_REALIZATIONS * MAX_THEORY_DEGREES_PER_REALIZATION,
    );
    expect(MAX_THEORY_SPELLING_ATTEMPTS).toBe(64);
    expect(MAX_THEORY_WARNINGS).toBe(1);
    expect(MAX_THEORY_FORMULA_PHASES).toBe(CHORD_FORMULA_PHASES.length);
    expect(MAX_THEORY_FORMULA_PHASE_TRANSITIONS).toBe(
      MAX_THEORY_REALIZATIONS * MAX_THEORY_FORMULA_PHASES,
    );
    expect(MAX_THEORY_PEAK_CANDIDATE_DEGREE_RECORDS).toBe(21);
    expect(MAX_THEORY_CANDIDATE_INSERTIONS).toBe(
      MAX_THEORY_REALIZATIONS * MAX_THEORY_PEAK_CANDIDATE_DEGREE_RECORDS,
    );
    expect(MAX_THEORY_INPUT_DEGREE_RECORDS_VISITED).toBe(
      1 +
        (MAX_THEORY_EXTENSIONS + 1) +
        (MAX_THEORY_ADDITIONS + 1) +
        (MAX_THEORY_ALTERATIONS + 1) +
        (MAX_THEORY_OMISSIONS + 1),
    );
    expect(MAX_THEORY_TRACKED_RECORDS).toBe(
      MAX_THEORY_CANDIDATE_INSERTIONS +
        MAX_THEORY_SEMANTIC_OUTPUT_RECORDS +
        MAX_THEORY_WARNINGS,
    );
    expect(MAX_CUSTOM_CHORD_PITCHES).toBe(16);
    expect(MIN_DEGREE_SPELLING_ALTERATION).toBe(-2);
    expect(MAX_DEGREE_SPELLING_ALTERATION).toBe(2);
  });

  test("freezes every exported contract collection", () => {
    const collections: readonly (readonly unknown[])[] = [
      RESOLUTION_OPERATION_NAMES,
      CHORD_FORMULA_PHASES,
      CHORD_FORMULA_RULE_IDS,
      SEMANTIC_REALIZATION_IDS,
      ALTERED_DOMINANT_REALIZATION_IDS,
      CUSTOM_REALIZATION_LIMITATIONS,
      THEORY_EXTENSION_NUMBERS,
      THEORY_ADDITION_NUMBERS,
      THEORY_ALTERATION_NUMBERS,
      THEORY_OMISSION_NUMBERS,
      THEORY_MODIFIER_ALTERATIONS,
      THEORY_MODIFIER_CONFLICT_PRECEDENCE,
      THEORY_REFUSAL_CODES,
      THEORY_REFUSAL_PRECEDENCE,
      ...Object.values(THEORY_REFUSAL_REASON_PRECEDENCE),
      THEORY_WARNING_CODES,
    ];
    expect(collections.every(Object.isFrozen)).toBe(true);

    expect(() => {
      const mutable = THEORY_REFUSAL_PRECEDENCE as unknown as string[];
      mutable[0] = "changed";
    }).toThrow(TypeError);
    expect(THEORY_REFUSAL_PRECEDENCE[0]).toBe("theory.sixth_invalid");
    expect(isDeeplyFrozen(THEORY_REFUSAL_REASON_PRECEDENCE)).toBe(true);
  });

  test("deeply freezes every exported reviewed validator oracle", () => {
    const reviewedOracles = [
      T1_REVIEWED_COMPANIONS,
      T1_REVIEWED_FORMULA_RULE_IDS,
      T1_REVIEWED_REFUSAL_PRECEDENCE,
      T1_REVIEWED_PUBLIC_CONTRACT,
      T1_REVIEWED_LIMITS,
    ] as const;
    expect(reviewedOracles.every(isDeeplyFrozen)).toBe(true);

    expect(() => {
      const mutable = T1_REVIEWED_PUBLIC_CONTRACT.formulaTable as {
        version: number;
      };
      mutable.version = 2;
    }).toThrow(TypeError);
    expect(() => {
      const mutable = T1_REVIEWED_PUBLIC_CONTRACT.formulaPhases as unknown as string[];
      mutable.push("changed");
    }).toThrow(TypeError);
    expect(T1_REVIEWED_PUBLIC_CONTRACT.formulaTable.version).toBe(1);
    expect(T1_REVIEWED_PUBLIC_CONTRACT.formulaPhases).toEqual(CHORD_FORMULA_PHASES);
  });

  test("imports only domain and keeps evidence out of the public index", async () => {
    const [contractSource, indexSource, validatorSource] = await Promise.all([
      readFile(contractPath, "utf8"),
      readFile(theoryIndexPath, "utf8"),
      readFile(validatorPath, "utf8"),
    ]);
    const importSpecifiers = [...contractSource.matchAll(/from\s+["']([^"']+)["']/gu)]
      .map((match) => match[1])
      .filter((specifier): specifier is string => specifier !== undefined);
    expect(importSpecifiers).toEqual(["../domain"]);
    expect(indexSource).not.toContain("resolution-evidence-contract");
    expect(validatorSource).not.toMatch(/from\s+["'][^"']*src\/theory/gu);
    expect(validatorSource).not.toMatch(/from\s+["'][^"']*formula-rules/gu);
    expect(validatorSource).not.toContain("resolveChord(");
  });
});

describe("T1 independently reviewed fixture contract", () => {
  test("passes deterministically with the exact reviewed inventory", async () => {
    const [first, second] = await Promise.all([
      validateT1Contract(),
      validateT1Contract(),
    ]);
    expect(first).toEqual(second);
    expect(first).toEqual({
      schema: "changes.validation.t1-contract.v1",
      package: "T1",
      outcome: "pass",
      counts: {
        companions: 10,
        formulaRules: 33,
        modifierRules: 8,
        alteredDominantVariants: 4,
        roots: 12,
        familySeeds: 33,
        allRootCells: 396,
        allRootDegreeSpellings: 1824,
        publicDegreeSpellingCells: 1750,
        literalPlanCases: 88,
        spellingCases: 16,
        customCases: 9,
        lawCases: 12,
        operationStateCases: 10,
        totalLinkedCases: 229,
        traces: 13,
        authorities: 6,
        mutationControls: 53,
        mutationDirectKillerLinks: 124,
        mutationCorroborativeLinks: 16,
        mutationReviewedCaseLinks: 140,
      },
      findings: [],
    });
    expect(T1_REVIEWED_COMPANIONS).toHaveLength(10);
    expect(T1_REVIEWED_FORMULA_RULE_IDS).toEqual(CHORD_FORMULA_RULE_IDS);
    expect(T1_REVIEWED_LAW_PREDICATE_DIGESTS).toHaveLength(12);
    const reviewedLawCaseIds: string[] = T1_REVIEWED_LAW_PREDICATE_DIGESTS
      .map(({ lawCaseId }) => lawCaseId);
    expect(reviewedLawCaseIds).toEqual(Array.from({ length: 12 }, (_, index) =>
        `T1-LAW-${String(index + 1).padStart(3, "0")}`
    ));
    expect(T1_REVIEWED_REFUSAL_PRECEDENCE).toEqual(THEORY_REFUSAL_PRECEDENCE);
    expect(T1_REVIEWED_PUBLIC_CONTRACT.refusalReasonPrecedence).toEqual(
      THEORY_REFUSAL_REASON_PRECEDENCE,
    );
    expect(T1_REVIEWED_PUBLIC_CONTRACT.formulaPhases).toEqual(CHORD_FORMULA_PHASES);
    expect(T1_REVIEWED_LIMITS.trackedRecords).toBe(MAX_THEORY_TRACKED_RECORDS);
  });

  test("rejects a missing companion and an unreviewed extra JSON file", async () => {
    const report = await validateFixtureCopy(async (root) => {
      await Promise.all([
        rm(join(root, "law-cases.json")),
        writeFile(join(root, "unreviewed.json"), "{}\n", "utf8"),
      ]);
    });
    expect(report.outcome).toBe("fail");
    expect(findingCodes(report)).toContain("T1_CONTRACT_FILE_SET");
  });

  test("rejects reviewed law-predicate digest, identity, order, and canonicalization drift", async () => {
    const report = await validateFixtureCopy(async (root) => {
      await editFixtureJson(root, "t1-resolution-contract.json", (document) => {
        const review = mutableObject(document["lawPredicateReview"]);
        review["canonicalization"] = "hash whatever the producer emits";
        const inventory = mutableObjects(review["inventory"]);
        const first = mutableObject(inventory[0]);
        first["lawId"] = "T1-LAW-SUBSTITUTED";
        first["semanticPredicateDigest"] = "f".repeat(64);
        inventory.reverse();
      });
    });
    expect(findingCodes(report)).toContain("T1_CONTRACT_LAW_PREDICATE_REVIEW");
  });

  test("rejects an extra non-JSON directory entry", async () => {
    const report = await validateFixtureCopy(async (root) => {
      await writeFile(join(root, "README.txt"), "not part of the reviewed corpus\n", "utf8");
    });
    expect(report.outcome).toBe("fail");
    expect(findingCodes(report)).toContain("T1_CONTRACT_FILE_SET");
  });

  test("detects decoded duplicate keys without confusing bytes and semantics", async () => {
    const report = await validateFixtureCopy(async (root) => {
      const path = join(root, "t1-resolution-contract.json");
      const source = await readFile(path, "utf8");
      await writeFile(
        path,
        source.replace("{\n", "{\n  \"schema\": \"shadowed-by-reviewed-value\",\n"),
        "utf8",
      );
    });
    const codes = findingCodes(report);
    expect(codes).toContain("T1_CONTRACT_DUPLICATE_KEY");
    expect(codes).toContain("T1_CONTRACT_BYTE_DIGEST");
    expect(codes).not.toContain("T1_CONTRACT_SEMANTIC_DIGEST");
  });

  test("treats formatting drift as a byte change but not a semantic change", async () => {
    const report = await validateFixtureCopy(async (root) => {
      const path = join(root, "provenance-ledger.json");
      const document = JSON.parse(await readFile(path, "utf8")) as unknown;
      await writeFile(path, `${JSON.stringify(document, null, 4)}\n`, "utf8");
    });
    const codes = findingCodes(report);
    expect(codes).toContain("T1_CONTRACT_BYTE_DIGEST");
    expect(codes).not.toContain("T1_CONTRACT_SEMANTIC_DIGEST");
    expect(codes).toEqual(["T1_CONTRACT_BYTE_DIGEST"]);
  });

  test("rejects schema, top-level, limit, independence, and directed-degree drift", async () => {
    const report = await validateFixtureCopy(async (root) => {
      await editFixtureJson(root, "t1-resolution-contract.json", (document) => {
        document["schema"] = "changes.fixtures.unreviewed";
        document["unreviewedField"] = true;
        document["productionOutputUsed"] = true;
        mutableObject(document["limits"])["warnings"] = 2;
        const degrees = mutableObjects(document["degreeTokenVocabulary"]);
        const flatNine = degrees.find((degree) => degree["token"] === "b9");
        mutableObject(flatNine)["directedSemitones"] = 1;
      });
    });
    const codes = findingCodes(report);
    expect(codes).toContain("T1_CONTRACT_SCHEMA");
    expect(codes).toContain("T1_CONTRACT_LIMITS");
    expect(codes).toContain("T1_CONTRACT_INDEPENDENCE");
    expect(codes).toContain("T1_CONTRACT_DEGREE_VOCABULARY");
    expect(codes).toContain("T1_CONTRACT_BYTE_DIGEST");
    expect(codes).toContain("T1_CONTRACT_SEMANTIC_DIGEST");
  });

  test("rejects formula, role, altered-match, root, and spelling-golden drift", async () => {
    const report = await validateFixtureCopy(async (root) => {
      await Promise.all([
        editFixtureJson(root, "formula-rules.json", (document) => {
          const firstFormula = mutableObject(mutableObjects(document["rules"])[0]);
          firstFormula["required"] = ["1"];
          const altered = mutableObject(document["alteredDominantMatchAndBasePhase"]);
          mutableObject(altered["match"])["colorPolicy"] = "none";
        }),
        editFixtureJson(root, "all-root-cases.json", (document) => {
          const db = mutableObject(mutableObjects(document["roots"])[1]);
          mutableObject(db["spelled"])["alter"] = 0;
        }),
        editFixtureJson(root, "spelling-cases.json", (document) => {
          const first = mutableObject(mutableObjects(document["cases"])[0]);
          const expected = mutableObject(first["expected"]);
          mutableObject(expected["spelled"])["step"] = "B";
          const matrix = mutableObject(document["publicDegreeMatrix"]);
          mutableObject(matrix["expected"])["successCells"] = 1_307;
        }),
      ]);
    });
    const codes = findingCodes(report);
    expect(codes).toContain("T1_CONTRACT_FORMULA_TABLE");
    expect(codes).toContain("T1_CONTRACT_ROLE_PARTITION");
    expect(codes).toContain("T1_CONTRACT_ALT_MATCH");
    expect(codes).toContain("T1_CONTRACT_ROOTS");
    expect(codes).toContain("T1_CONTRACT_SPELLING_GOLDEN");
    expect(codes).toContain("T1_CONTRACT_PUBLIC_DEGREE_MATRIX");
  });

  test("rejects independently invalid parsed transposition and literal spelling tables", async () => {
    const report = await validateFixtureCopy(async (root) => {
      await Promise.all([
        editFixtureJson(root, "literal-cases.json", (document) => {
          const altered = recordById(
            mutableObjects(document["cases"]),
            "T1-LIT-081",
          );
          const expected = mutableObject(altered["expected"]);
          const realizations = mutableObject(expected["realizationsById"]);
          const flatFive = mutableObject(realizations["alt-b9-b5"]);
          mutableObject(mutableObjects(flatFive["spelledPitchNames"])[2])["alter"] = -1;
        }),
        editFixtureJson(root, "law-cases.json", (document) => {
          const cases = mutableObjects(document["cases"]);
          const inverseLaw = recordById(cases, "T1-LAW-004");
          const inverseRecipe = mutableObject(inverseLaw["transpositionRecipe"]);
          const target = mutableObject(inverseRecipe["reviewedTargetSnapshot"]);
          mutableObject(mutableObjects(target["spelledPitchNames"])[4])["alter"] = 1;

          const projectionLaw = recordById(cases, "T1-LAW-005");
          const projectionRecipe = mutableObject(projectionLaw["transpositionRecipe"]);
          const projectionRows = mutableObjects(projectionRecipe["reviewedProjectionRows"]);
          mutableObject(projectionRows[2])["targetPitchClass"] = 8;
        }),
      ]);
    });
    const codes = findingCodes(report);
    expect(codes).toContain("T1_CONTRACT_LITERAL_SPELLING_TABLE");
    expect(codes).toContain("T1_CONTRACT_PARSED_TRANSPOSE_INVERSE");
    expect(codes).toContain("T1_CONTRACT_PROJECTION_COMMUTES");
  });

  test("rejects non-executable operation recipes, evidence, and precedence contests", async () => {
    const report = await validateFixtureCopy(async (root) => {
      await editFixtureJson(root, "operation-state-cases.json", (document) => {
        const cases = mutableObjects(document["cases"]);

        const preflight = recordById(cases, "T1-OPSTATE-007");
        const preflightRows = mutableObjects(preflight["rows"]);
        const extensionRecipe = mutableObject(preflightRows[0]?.["inputRecipe"]);
        const extensions = extensionRecipe["extensions"];
        if (!Array.isArray(extensions)) throw new TypeError("Expected extensions recipe.");
        extensions.pop();
        const reasonRow = recordById(
          mutableObjects(preflight["reasonPrecedenceRows"]),
          "T1-REASON-PRECEDENCE-002",
        );
        const reasonRecipe = mutableObject(reasonRow["inputRecipe"]);
        mutableObject(mutableObjects(reasonRecipe["extensions"])[0])["alter"] = 0;

        const directSpelling = recordById(cases, "T1-OPSTATE-001");
        const directSuccess = recordById(
          mutableObjects(directSpelling["evidenceRows"]),
          "T1-SPELL-EVIDENCE-SUCCESS",
        );
        mutableObject(directSuccess["expectedEvidence"])["degreesProduced"] = 0;

        const evidence = recordById(cases, "T1-OPSTATE-009");
        mutableObject(evidence["crossRealizationSchedule"])["construction"] =
          "realization-major traversal";
        const alteredComplete = recordById(
          mutableObjects(evidence["rows"]),
          "T1-EVIDENCE-ALTERED-COMPLETE",
        );
        mutableObject(alteredComplete["expectedEvidence"])["formulaPhaseTransitions"] = 31;

        const tournament = recordById(cases, "T1-OPSTATE-010");
        const firstPair = recordById(
          mutableObjects(tournament["rows"]),
          "T1-PRECEDENCE-001",
        );
        delete mutableObject(firstPair["inputRecipe"])["extensions"];
      });
    });
    const codes = findingCodes(report);
    expect(codes).toContain("T1_CONTRACT_INPUT_LIMIT_BOUNDARY");
    expect(codes).toContain("T1_CONTRACT_REFUSAL_REASON_PRECEDENCE");
    expect(codes).toContain("T1_CONTRACT_DIRECT_SPELLING_EVIDENCE");
    expect(codes).toContain("T1_CONTRACT_EVIDENCE_SCHEDULE");
    expect(codes).toContain("T1_CONTRACT_EVIDENCE_TERMINATION");
    expect(codes).toContain("T1_CONTRACT_REFUSAL_PRECEDENCE_RECIPE");
  });

  test("rejects lost count pairs, nonzero evidence branches, modifier paths, and duplicate recipes", async () => {
    const report = await validateFixtureCopy(async (root) => {
      await editFixtureJson(root, "operation-state-cases.json", (document) => {
        const cases = mutableObjects(document["cases"]);
        const preflight = recordById(cases, "T1-OPSTATE-007");
        const preflightRows = mutableObjects(preflight["rows"]);
        const replacementNumbers = [11, 13, 13] as const;
        replacementNumbers.forEach((replacementNumber, rowIndex) => {
          const row = mutableObject(preflightRows[rowIndex]);
          const field = row["field"];
          const firstExcessIndex = row["firstExcessIndex"];
          if (typeof field !== "string" || typeof firstExcessIndex !== "number") {
            throw new TypeError("Expected a collection boundary row.");
          }
          const recipe = mutableObject(row["inputRecipe"]);
          const decisive = mutableObject(mutableObjects(recipe[field])[firstExcessIndex]);
          decisive["number"] = replacementNumber;
          const refusal = mutableObject(row["expectedRefusal"]);
          refusal["received"] = {
            number: replacementNumber,
            alter: decisive["alter"],
          };
          refusal["reason"] = "number";
        });

        const evidence = recordById(cases, "T1-OPSTATE-009");
        const evidenceRows = mutableObjects(evidence["rows"]);
        const duplicate = recordById(
          evidenceRows,
          "T1-EVIDENCE-DUPLICATE-COMPLETE",
        );
        mutableObject(duplicate["expectedEvidence"])["duplicateDegreesCanonicalized"] = 0;
        const warning = recordById(
          evidenceRows,
          "T1-EVIDENCE-WARNING-COMPLETE",
        );
        mutableObject(warning["expectedEvidence"])["warningsProduced"] = 0;
        const modifierSpelling = recordById(
          evidenceRows,
          "T1-EVIDENCE-MODIFIER-SPELLING-REFUSAL",
        );
        mutableObject(modifierSpelling["expectedRefusal"])["path"] = ["root"];
        mutableObject(document["pathPolicy"])["resolverSpelling"] =
          "always attribute spelling refusal to the root";

        const tournament = recordById(cases, "T1-OPSTATE-010");
        const outputThenSpelling = recordById(
          mutableObjects(tournament["rows"]),
          "T1-PRECEDENCE-009",
        );
        const outputRecipe = mutableObject(outputThenSpelling["inputRecipe"]);
        const additions = mutableObjects(outputRecipe["additions"]);
        mutableObject(additions[6])["number"] = 11;
      });
    });
    const codes = findingCodes(report);
    expect(codes).toContain("T1_CONTRACT_INPUT_LIMIT_BOUNDARY");
    expect(codes).toContain("T1_CONTRACT_REFUSAL_REASON_PRECEDENCE_PAIRS");
    expect(codes).toContain("T1_CONTRACT_EVIDENCE_TERMINATION");
    expect(codes).toContain("T1_CONTRACT_PATH_POLICY");
    expect(codes).toContain("T1_CONTRACT_REFUSAL_PRECEDENCE_RECIPE");
  });

  test("rejects custom metadata and independently enumerated family-state drift", async () => {
    const report = await validateFixtureCopy(async (root) => {
      await Promise.all([
        editFixtureJson(root, "custom-cases.json", (document) => {
          const shared = mutableObject(document["sharedExpected"]);
          const metadata = mutableObject(shared["resolvedChordMetadata"]);
          metadata["formulaTableVersion"] = 2;
        }),
        editFixtureJson(root, "formula-rules.json", (document) => {
          const matrix = mutableObject(document["familyStateMatrix"]);
          mutableObject(matrix["expected"])["acceptedStates"] = 63;
          const sentinel = recordById(
            mutableObjects(matrix["sentinels"]),
            "T1-FAMILY-STATE-SENTINEL-004",
          );
          sentinel["expected"] = {};
          mutableObject(matrix["expected"])["orderedCellSemanticSha256"] =
            "0".repeat(64);
          mutableObject(matrix["expected"])["orderedPublicOutcomeSemanticSha256"] =
            "1".repeat(64);
        }),
      ]);
    });
    const codes = findingCodes(report);
    expect(codes).toContain("T1_CONTRACT_CUSTOM_SHAPE");
    expect(codes).toContain("T1_CONTRACT_FAMILY_STATE_MATRIX");
    expect(codes).toContain("T1_CONTRACT_FAMILY_STATE_CELL_DIGEST");
    expect(codes).toContain("T1_CONTRACT_FAMILY_STATE_PUBLIC_OUTCOME");
    expect(codes).toContain("T1_CONTRACT_FAMILY_STATE_SENTINEL");
  });

  test("rejects custom materialization and invalid written pitch spellings", async () => {
    const report = await validateFixtureCopy(async (root) => {
      await editFixtureJson(root, "custom-cases.json", (document) => {
        const cases = mutableObjects(document["cases"]);
        const materializedBoundary = recordById(cases, "T1-CUSTOM-006");
        mutableObject(materializedBoundary["materializationRecipe"])["targetLength"] = 16;

        const outOfRange = recordById(cases, "T1-CUSTOM-001");
        const outOfRangeInput = mutableObject(outOfRange["input"]);
        mutableObject(mutableObjects(outOfRangeInput["pitchNames"])[0])["alter"] = 3;

        const fractional = recordById(cases, "T1-CUSTOM-002");
        const fractionalInput = mutableObject(fractional["input"]);
        mutableObject(mutableObjects(fractionalInput["pitchNames"])[0])["alter"] = 0.5;
      });
    });
    const codes = findingCodes(report);
    expect(codes).toContain("T1_CONTRACT_CUSTOM_ANNOTATIONS");
    expect(codes).toContain("T1_CONTRACT_CUSTOM_SPELLING");
  });

  test("rejects public-degree matrix axis and independently computed count drift", async () => {
    const report = await validateFixtureCopy(async (root) => {
      await editFixtureJson(root, "spelling-cases.json", (document) => {
        const matrix = mutableObject(document["publicDegreeMatrix"]);
        matrix["degreeNumbers"] = [1, 2, 3, 4, 5, 6, 7, 9, 11];
        const expected = mutableObject(matrix["expected"]);
        const byDegree = mutableObjects(expected["byDegreeNumber"]);
        mutableObject(byDegree[9])["refusalCells"] = 44;
        expected["orderedCellSemanticSha256"] = "f".repeat(64);
      });
    });
    const codes = findingCodes(report);
    expect(codes).toContain("T1_CONTRACT_PUBLIC_DEGREE_MATRIX");
    expect(codes).toContain("T1_CONTRACT_PUBLIC_DEGREE_CELL_DIGEST");
  });

  test("rejects manifest ordering, role-policy, and reviewed-correction drift", async () => {
    const report = await validateFixtureCopy(async (root) => {
      await editFixtureJson(root, "t1-resolution-contract.json", (document) => {
        mutableObject(document["ordering"])["degreeOrder"] =
          "pitch-class order";
        mutableObject(document["rolePolicy"])["ordinaryFifth"] = "required";
        const correction = mutableObject(
          mutableObjects(document["knownPlanCorrections"])[0],
        );
        correction["correctExpectation"] = "Abdim7 diminished seventh -> Fb";
      });
    });
    const codes = findingCodes(report);
    expect(codes).toContain("T1_CONTRACT_ORDERING");
    expect(codes).toContain("T1_CONTRACT_ROLE_POLICY");
    expect(codes).toContain("T1_CONTRACT_PLAN_CORRECTION");
  });

  test("rejects trace identity policy and authority class or coverage drift", async () => {
    const report = await validateFixtureCopy(async (root) => {
      await Promise.all([
        editFixtureJson(root, "trace-ledger.json", (document) => {
          document["stableTraceIdsOnly"] = false;
          document["caseLinkPolicy"] = "prefix and glob links are accepted";
          const first = mutableObject(mutableObjects(document["traces"])[0]);
          first["requirement"] = "";
        }),
        editFixtureJson(root, "provenance-ledger.json", (document) => {
          const first = mutableObject(mutableObjects(document["authorities"])[0]);
          first["authorityClass"] = "anonymous-opinion";
          first["covers"] = "";
        }),
      ]);
    });
    const codes = findingCodes(report);
    expect(codes).toContain("T1_CONTRACT_TRACE_POLICY");
    expect(codes).toContain("T1_CONTRACT_AUTHORITY_CLASS");
    expect(codes).toContain("T1_CONTRACT_AUTHORITY_METADATA");
    expect(codes).toContain("T1_CONTRACT_AUTHORITY_POLICY");
  });

  test("rejects one-way trace, authority, and mutation-control links", async () => {
    const report = await validateFixtureCopy(async (root) => {
      await Promise.all([
        editFixtureJson(root, "trace-ledger.json", (document) => {
          const first = mutableObject(mutableObjects(document["traces"])[0]);
          const caseIds = first["caseIds"];
          if (!Array.isArray(caseIds)) throw new TypeError("Expected trace case IDs.");
          caseIds.pop();
        }),
        editFixtureJson(root, "provenance-ledger.json", (document) => {
          const first = mutableObject(mutableObjects(document["authorities"])[0]);
          const caseIds = first["caseIds"];
          if (!Array.isArray(caseIds)) throw new TypeError("Expected authority case IDs.");
          caseIds.pop();
        }),
        editFixtureJson(root, "mutation-controls.json", (document) => {
          const first = mutableObject(mutableObjects(document["controls"])[0]);
          first["traceIds"] = ["T1-TRACE-DOES-NOT-EXIST"];
          first["authorityIds"] = ["T1-AUTH-DOES-NOT-EXIST"];
        }),
      ]);
    });
    const codes = findingCodes(report);
    expect(codes).toContain("T1_CONTRACT_TRACE_RECIPROCAL");
    expect(codes).toContain("T1_CONTRACT_AUTHORITY_RECIPROCAL");
    expect(codes).toContain("T1_CONTRACT_TRACE_REFERENCE");
    expect(codes).toContain("T1_CONTRACT_AUTHORITY_REFERENCE");
  });

  test("rejects overlap, missing reasons, bad reason codes, and corroborative record-order drift", async () => {
    const [overlap, missingReason, badReasonCode, badReasonOrder] = await Promise.all([
      validateFixtureCopy(async (root) => {
        await editFixtureJson(root, "mutation-controls.json", (document) => {
          const control = recordById(
            mutableObjects(document["controls"]),
            "T1-MUT-004",
          );
          const killedBy = control["killedByCaseIds"];
          if (!Array.isArray(killedBy)) throw new TypeError("Expected killer IDs.");
          killedBy.push("T1-SPELL-002");
        });
      }),
      validateFixtureCopy(async (root) => {
        await editFixtureJson(root, "mutation-controls.json", (document) => {
          const control = recordById(
            mutableObjects(document["controls"]),
            "T1-MUT-004",
          );
          const link = mutableObjects(control["corroborativeLinks"])[0];
          if (link === undefined) throw new TypeError("Expected corroborative link.");
          delete link["reason"];
        });
      }),
      validateFixtureCopy(async (root) => {
        await editFixtureJson(root, "mutation-controls.json", (document) => {
          const control = recordById(
            mutableObjects(document["controls"]),
            "T1-MUT-004",
          );
          const link = mutableObjects(control["corroborativeLinks"])[0];
          if (link === undefined) throw new TypeError("Expected corroborative link.");
          link["reasonCode"] = "unreviewed-reason";
        });
      }),
      validateFixtureCopy(async (root) => {
        await editFixtureJson(root, "mutation-controls.json", (document) => {
          const control = recordById(
            mutableObjects(document["controls"]),
            "T1-MUT-013",
          );
          control["corroborativeLinks"] = [
            ...mutableObjects(control["corroborativeLinks"]),
          ].reverse();
        });
      }),
    ]);

    expect(findingCodes(overlap)).toContain("T1_CONTRACT_MUTATION_CLASSIFICATION");
    expect(findingCodes(missingReason)).toContain("T1_CONTRACT_MUTATION_REASON");
    expect(findingCodes(badReasonCode)).toContain("T1_CONTRACT_MUTATION_REASON");
    expect(findingCodes(badReasonOrder)).toContain(
      "T1_CONTRACT_MUTATION_CORROBORATIVE",
    );
    expect(findingCodes(badReasonOrder)).toContain("T1_CONTRACT_MUTATION_REASON");
  }, 30_000);

  test("rejects lost, duplicated, reclassified, and reordered reviewed case links", async () => {
    const [lost, duplicated, reclassified, declaredHashDrift, orderDrift] =
      await Promise.all([
        validateFixtureCopy(async (root) => {
          await editFixtureJson(root, "mutation-controls.json", (document) => {
            const control = recordById(
              mutableObjects(document["controls"]),
              "T1-MUT-001",
            );
            const killedBy = control["killedByCaseIds"];
            if (!Array.isArray(killedBy)) throw new TypeError("Expected killer IDs.");
            killedBy.pop();
          });
        }),
        validateFixtureCopy(async (root) => {
          await editFixtureJson(root, "mutation-controls.json", (document) => {
            const control = recordById(
              mutableObjects(document["controls"]),
              "T1-MUT-001",
            );
            const killedBy = control["killedByCaseIds"];
            if (!Array.isArray(killedBy)) throw new TypeError("Expected killer IDs.");
            killedBy.push("T1-FORMULA-001");
          });
        }),
        validateFixtureCopy(async (root) => {
          await editFixtureJson(root, "mutation-controls.json", (document) => {
            const control = recordById(
              mutableObjects(document["controls"]),
              "T1-MUT-004",
            );
            control["killedByCaseIds"] = ["T1-LIT-012"];
            control["corroboratedByCaseIds"] = [
              "T1-FORMULA-012",
              "T1-SPELL-002",
            ];
            control["corroborativeLinks"] = [
              {
                caseId: "T1-FORMULA-012",
                reasonCode: "operator-scope-mismatch",
                reason: "Reclassified direct witness.",
              },
              ...mutableObjects(control["corroborativeLinks"]),
            ];
          });
        }),
        validateFixtureCopy(async (root) => {
          await editFixtureJson(root, "mutation-controls.json", (document) => {
            document["reviewedCaseLinkOrderSha256"] = "0".repeat(64);
          });
        }),
        validateFixtureCopy(async (root) => {
          await editFixtureJson(root, "mutation-controls.json", (document) => {
            const control = recordById(
              mutableObjects(document["controls"]),
              "T1-MUT-001",
            );
            const killedBy = control["killedByCaseIds"];
            if (!Array.isArray(killedBy)) throw new TypeError("Expected killer IDs.");
            killedBy.reverse();
          });
        }),
      ]);

    for (const report of [lost, duplicated, declaredHashDrift, orderDrift]) {
      expect(findingCodes(report)).toContain(
        "T1_CONTRACT_MUTATION_CASE_LINK_CONSERVATION",
      );
    }
    expect(findingCodes(duplicated)).toContain("T1_CONTRACT_REFERENCE_DUPLICATE");
    const reclassifiedCodes = findingCodes(reclassified);
    expect(reclassifiedCodes).toContain("T1_CONTRACT_MUTATION_CLASSIFICATION");
    expect(reclassifiedCodes).toContain("T1_CONTRACT_MUTATION_DIRECT_KILLER");
    expect(reclassifiedCodes).toContain("T1_CONTRACT_MUTATION_CORROBORATIVE");
    expect(reclassifiedCodes).not.toContain(
      "T1_CONTRACT_MUTATION_CASE_LINK_CONSERVATION",
    );
  }, 30_000);

  test("rejects semantic-counterfactual and production-source mutation classification drift", async () => {
    const report = await validateFixtureCopy(async (root) => {
      await editFixtureJson(root, "t1-resolution-contract.json", (document) => {
        const review = mutableObject(document["mutationControlReview"]);
        review["sourceMutationClassification"] =
          "semantic counterfactuals are production-source mutants";
      });
    });
    expect(findingCodes(report)).toContain("T1_CONTRACT_MUTATION_REVIEW_POLICY");
  });

  test("rejects weakened evidence, law witnesses, duplicate merging, and mutation killers", async () => {
    const report = await validateFixtureCopy(async (root) => {
      await Promise.all([
        editFixtureJson(root, "operation-state-cases.json", (document) => {
          const cases = mutableObjects(document["cases"]);
          const matrix = recordById(cases, "T1-OPSTATE-009");
          const outputLimit = recordById(mutableObjects(matrix["rows"]), "T1-EVIDENCE-OUTPUT-LIMIT-REFUSAL");
          mutableObject(outputLimit["expectedEvidence"])["spellingAttempts"] = 1;
          const tournament = recordById(cases, "T1-OPSTATE-010");
          const firstPair = recordById(mutableObjects(tournament["rows"]), "T1-PRECEDENCE-001");
          mutableObject(firstPair["expectedWinner"])["code"] = "theory.extension_invalid";
        }),
        editFixtureJson(root, "law-cases.json", (document) => {
          recordById(mutableObjects(document["cases"]), "T1-LAW-006")["transpositionCaseId"] = "T1-ROOT-MATRIX-001";
        }),
        editFixtureJson(root, "literal-cases.json", (document) => {
          const duplicate = recordById(mutableObjects(document["cases"]), "T1-LIT-079");
          mutableObject(duplicate["expected"])["duplicateDegreesCanonicalized"] = 0;
        }),
        editFixtureJson(root, "mutation-controls.json", (document) => {
          const control = recordById(mutableObjects(document["controls"]), "T1-MUT-049");
          control["faultFamily"] = "undeclared-family";
          control["killedByCaseIds"] = ["T1-NOT-A-CASE"];
        }),
      ]);
    });
    const codes = findingCodes(report);
    expect(codes).toContain("T1_CONTRACT_EVIDENCE_TERMINATION");
    expect(codes).toContain("T1_CONTRACT_REFUSAL_PRECEDENCE_TOURNAMENT");
    expect(codes).toContain("T1_CONTRACT_LAW_INVENTORY");
    expect(codes).toContain("T1_CONTRACT_DUPLICATE_MERGE");
    expect(codes).toContain("T1_CONTRACT_MUTATION_FAMILY");
    expect(codes).toContain("T1_CONTRACT_MUTATION_KILLER");
    expect(codes).toContain("T1_CONTRACT_MUTATION_TARGET");
  });

  test("rejects invalid literal recipes, impossible refusal paths, and lost root-variation semantics", async () => {
    const report = await validateFixtureCopy(async (root) => {
      await editFixtureJson(root, "literal-cases.json", (document) => {
        const cases = mutableObjects(document["cases"]);

        const conflict = recordById(cases, "T1-LIT-065");
        const conflictRecipe = mutableObject(conflict["inputAstRecipe"]);
        mutableObject(mutableObjects(conflictRecipe["alterations"])[1])["number"] = 9;
        const conflictRefusal = mutableObject(mutableObject(conflict["expected"])["refusal"]);
        conflictRefusal["rightPath"] = ["omissions", 0];

        const unsupportedFamily = recordById(cases, "T1-LIT-071");
        unsupportedFamily["inputAstRecipe"] = { base: "C" };

        const rootVariation = recordById(cases, "T1-LIT-082");
        const rootVariationExpected = mutableObject(rootVariation["expected"]);
        rootVariationExpected["degrees"] = ["1", "3", "5", "b7"];
        rootVariationExpected["optional"] = ["5"];
      });
    });
    const codes = findingCodes(report);
    expect(codes).toContain("T1_CONTRACT_LITERAL_RECIPE");
    expect(codes).toContain("T1_CONTRACT_LITERAL_REFUSAL_PAYLOAD");
    expect(codes).toContain("T1_CONTRACT_LITERAL_LINK_SEMANTICS");
  });

  test("rejects lost altered-natural-nine coexistence and sourceText authority regressions", async () => {
    const [alteredReport, sourceTextReport] = await Promise.all([
      validateFixtureCopy(async (root) => {
        await editFixtureJson(root, "literal-cases.json", (document) => {
          const witness = recordById(
            mutableObjects(document["cases"]),
            "T1-LIT-087",
          );
          const expected = mutableObject(witness["expected"]);
          const realizations = mutableObject(expected["realizationsById"]);
          const flatNine = mutableObject(realizations["alt-b9-b5"]);
          flatNine["degrees"] = ["1", "3", "b5", "b7", "b9"];
          flatNine["required"] = ["1", "3", "b5", "b7", "b9"];
        });
      }),
      validateFixtureCopy(async (root) => {
        await editFixtureJson(root, "literal-cases.json", (document) => {
          const witness = recordById(
            mutableObjects(document["cases"]),
            "T1-LIT-088",
          );
          const expected = mutableObject(witness["expected"]);
          expected["formulaRuleId"] = "seventh-major";
          expected["sourceTextIgnored"] = false;
        });
      }),
    ]);
    expect(findingCodes(alteredReport)).toContain(
      "T1_CONTRACT_LITERAL_EXPANSION_WITNESSES",
    );
    expect(findingCodes(sourceTextReport)).toContain(
      "T1_CONTRACT_LITERAL_EXPANSION_WITNESSES",
    );
  });

  test("rejects unrelated law witnesses and mutation-control semantics", async () => {
    const report = await validateFixtureCopy(async (root) => {
      await Promise.all([
        editFixtureJson(root, "law-cases.json", (document) => {
          const law = recordById(mutableObjects(document["cases"]), "T1-LAW-006");
          const positiveCaseIds = law["positiveCaseIds"];
          if (!Array.isArray(positiveCaseIds)) {
            throw new TypeError("Expected positive case IDs.");
          }
          const reviewedIds = positiveCaseIds.filter(
            (value: unknown): value is string => typeof value === "string",
          );
          if (reviewedIds.length !== positiveCaseIds.length) {
            throw new TypeError("Expected string positive case IDs.");
          }
          law["positiveCaseIds"] = ["T1-CUSTOM-001", ...reviewedIds];
        }),
        editFixtureJson(root, "mutation-controls.json", (document) => {
          const control = recordById(
            mutableObjects(document["controls"]),
            "T1-MUT-029",
          );
          control["operator"] = "drop-slash-bass";
          control["killedByCaseIds"] = ["T1-CUSTOM-001"];
        }),
      ]);
    });
    const codes = findingCodes(report);
    expect(codes).toContain("T1_CONTRACT_LAW_PROOF_SET");
    expect(codes).toContain("T1_CONTRACT_MUTATION_SEMANTICS");
  });

  test("rejects weakened all-or-nothing operation flags", async () => {
    const report = await validateFixtureCopy(async (root) => {
      await editFixtureJson(root, "operation-state-cases.json", (document) => {
        const operation = recordById(
          mutableObjects(document["cases"]),
          "T1-OPSTATE-005",
        );
        const expected = mutableObject(operation["expected"]);
        expected["partialWarnings"] = true;
        expected["sourceUnchanged"] = false;
      });
    });
    expect(findingCodes(report)).toContain("T1_CONTRACT_OPERATION_TRANSACTION");
  });

  test("rejects spelling refusal-path drift and forbidden enharmonic shortcuts", async () => {
    const report = await validateFixtureCopy(async (root) => {
      await editFixtureJson(root, "spelling-cases.json", (document) => {
        const cases = mutableObjects(document["cases"]);
        const refusal = recordById(cases, "T1-SPELL-011");
        const refusalPayload = mutableObject(
          mutableObject(refusal["expected"])["refusal"],
        );
        refusalPayload["path"] = ["root"];

        const directed = recordById(cases, "T1-SPELL-001");
        const directedExpected = mutableObject(directed["expected"]);
        directedExpected["rejectedEnharmonic"] = { step: "C", alter: -1 };
      });
    });
    const codes = findingCodes(report);
    expect(codes).toContain("T1_CONTRACT_SPELLING_REFUSAL");
    expect(codes).toContain("T1_CONTRACT_SPELLING_SHORTCUT");
  });

  test("rejects contradictory interaction fields and normative law text", async () => {
    const report = await validateFixtureCopy(async (root) => {
      await Promise.all([
        editFixtureJson(root, "literal-cases.json", (document) => {
          const cases = mutableObjects(document["cases"]);
          const sixNine = recordById(cases, "T1-LIT-084");
          const sixNineExpected = mutableObject(sixNine["expected"]);
          sixNineExpected["formulaId"] = "T1-FORMULA-011";
          sixNineExpected["root"] = { step: "D", alter: 0 };
          sixNineExpected["spelledPitchNames"] = [
            { step: "D", alter: 0 },
            { step: "E", alter: 0 },
            { step: "F", alter: 1 },
            { step: "A", alter: 0 },
            { step: "B", alter: 0 },
            { step: "E", alter: 0 },
          ];
          sixNineExpected["pitchClasses"] = [2, 4, 6, 9, 11, 4];
          const alteredSlash = recordById(cases, "T1-LIT-086");
          const alteredSlashExpected = mutableObject(alteredSlash["expected"]);
          alteredSlashExpected["noVariantChosen"] = false;
          const alteredRealizations = mutableObject(
            alteredSlashExpected["realizationsById"],
          );
          const flatFive = mutableObject(alteredRealizations["alt-b9-b5"]);
          flatFive["degrees"] = ["1", "3", "5", "b7", "b9"];
          flatFive["required"] = ["1", "3", "5", "b7", "b9"];
          flatFive["spelledPitchNames"] = [
            { step: "C", alter: 0 },
            { step: "E", alter: 0 },
            { step: "G", alter: 0 },
            { step: "B", alter: -1 },
            { step: "D", alter: -1 },
          ];
          flatFive["pitchClasses"] = [0, 4, 7, 10, 1];
        }),
        editFixtureJson(root, "law-cases.json", (document) => {
          const refusalLaw = recordById(
            mutableObjects(document["cases"]),
            "T1-LAW-012",
          );
          refusalLaw["statement"] =
            "a refusal may return a partial realization and mutate its source";
        }),
      ]);
    });
    const codes = findingCodes(report);
    expect(codes).toContain("T1_CONTRACT_INTERACTION_WITNESSES");
    expect(codes).toContain("T1_CONTRACT_LAW_STATEMENT");
  });

  test("rejects unproved operation paths and mutation non-killers", async () => {
    const report = await validateFixtureCopy(async (root) => {
      await Promise.all([
        editFixtureJson(root, "operation-state-cases.json", (document) => {
          const cases = mutableObjects(document["cases"]);
          const pathMatrix = recordById(cases, "T1-OPSTATE-008");
          pathMatrix["operation"] = "publish a partially resolved chord";
          pathMatrix["operationClass"] = "mutable asynchronous side effect";
          mutableObject(pathMatrix["cancellation"])["reason"] =
            "cancellation may commit a partial realization";
          const pathRows = mutableObjects(pathMatrix["rows"]);
          const additionPath = pathRows.find(
            (row) => row["cause"] === "explicit addition creates unspellable degree",
          );
          if (additionPath === undefined) {
            throw new TypeError("Expected addition-owned spelling path row.");
          }
          additionPath["expectedPathTemplate"] = ["realizations", 0, "degrees", 0];

          const evidence = recordById(cases, "T1-OPSTATE-009");
          const additionEvidence = recordById(
            mutableObjects(evidence["rows"]),
            "T1-EVIDENCE-ADDITION-SPELLING-REFUSAL",
          );
          mutableObject(additionEvidence["expectedRefusal"])["path"] = ["root"];
        }),
        editFixtureJson(root, "mutation-controls.json", (document) => {
          const controls = mutableObjects(document["controls"]);
          recordById(controls, "T1-MUT-012")["killedByCaseIds"] = [
            "T1-LIT-053",
          ];
          recordById(controls, "T1-MUT-019")["killedByCaseIds"] = [
            "T1-SPELL-009",
            "T1-SPELL-010",
          ];
          recordById(controls, "T1-MUT-050")["killedByCaseIds"] = [
            "T1-SPELL-007",
          ];
        }),
      ]);
    });
    const codes = findingCodes(report);
    expect(codes).toContain("T1_CONTRACT_OPERATION_METADATA");
    expect(codes).toContain("T1_CONTRACT_PATH_PROVENANCE");
    expect(codes).toContain("T1_CONTRACT_EVIDENCE_TERMINATION");
    expect(codes).toContain("T1_CONTRACT_MUTATION_SEMANTICS");
  });

  test("rejects normative policy drift and swapped modifier laws", async () => {
    const report = await validateFixtureCopy(async (root) => {
      await Promise.all([
        editFixtureJson(root, "formula-rules.json", (document) => {
          document["degreeEncoding"] =
            "degrees are pitch classes and enharmonic names may be merged";
          const modifiers = mutableObjects(document["modifierRules"]);
          const suspension = recordById(modifiers, "T1-MODRULE-001");
          const altered = recordById(modifiers, "T1-MODRULE-008");
          const suspensionRule = suspension["rule"];
          suspension["rule"] = altered["rule"];
          altered["rule"] = suspensionRule;
        }),
        editFixtureJson(root, "literal-cases.json", (document) => {
          document["inputPolicy"] =
            "production resolution may generate expected fixture values";
        }),
        editFixtureJson(root, "law-cases.json", (document) => {
          document["lawProofPolicy"] =
            "one convenient positive example is sufficient proof";
        }),
      ]);
    });
    const codes = findingCodes(report);
    expect(codes).toContain("T1_CONTRACT_DEGREE_ENCODING");
    expect(codes).toContain("T1_CONTRACT_MODIFIER_PHASE");
    expect(codes).toContain("T1_CONTRACT_LITERAL_INPUT_POLICY");
    expect(codes).toContain("T1_CONTRACT_LAW_PROOF_POLICY");
  });

  test("rejects drift in stable fixture identities and mutually exclusive branches", async () => {
    const report = await validateFixtureCopy(async (root) => {
      await Promise.all([
        editFixtureJson(root, "t1-resolution-contract.json", (document) => {
          document["fixtureVersion"] = "2.0.0";
          document["status"] = "production-derived";
        }),
        editFixtureJson(root, "formula-rules.json", (document) => {
          const matrix = mutableObject(document["familyStateMatrix"]);
          recordById(
            mutableObjects(matrix["sentinels"]),
            "T1-FAMILY-STATE-SENTINEL-001",
          )["id"] = "T1-FAMILY-STATE-SENTINEL-999";
        }),
        editFixtureJson(root, "all-root-cases.json", (document) => {
          mutableObject(document["matrixCase"])["expectedResult"] =
            "some cells may borrow production roles";
          mutableObject(document["independentOracle"])["pitchClassRule"] =
            "choose the nearest enharmonic spelling before projection";
        }),
        editFixtureJson(root, "spelling-cases.json", (document) => {
          const cases = mutableObjects(document["cases"]);
          const success = recordById(cases, "T1-SPELL-001");
          success["root"] = { step: "D", alter: 0 };
          const successExpected = mutableObject(success["expected"]);
          successExpected["spelled"] = { step: "C", alter: 0 };
          successExpected["pitchClass"] = 0;
          successExpected["refusal"] = { code: "theory.spelling_accidental_out_of_range" };
          mutableObject(successExpected["spelled"])["repairApplied"] = true;
          const refusalExpected = mutableObject(
            recordById(cases, "T1-SPELL-011")["expected"],
          );
          refusalExpected["spelled"] = { step: "D", alter: 2 };
          refusalExpected["pitchClass"] = 4;
          mutableObject(refusalExpected["refusal"])["partialSpelling"] = {
            step: "D",
            alter: 2,
          };
        }),
        editFixtureJson(root, "literal-cases.json", (document) => {
          const cases = mutableObjects(document["cases"]);
          const duplicateExpected = mutableObject(
            recordById(cases, "T1-LIT-079")["expected"],
          );
          duplicateExpected["formulaRuleId"] = "base-major";
          duplicateExpected["realizationIds"] = ["alt-b9-b5"];
          duplicateExpected["guide"] = [];
          mutableObject(recordById(cases, "T1-LIT-084")["expected"])[
            "realizationIds"
          ] = ["alt-b9-b5"];
        }),
        editFixtureJson(root, "custom-cases.json", (document) => {
          const cases = mutableObjects(document["cases"]);
          const familiarInput = mutableObject(
            recordById(cases, "T1-CUSTOM-007")["input"],
          );
          familiarInput["kind"] = "parsed";
          familiarInput["sourceText"] = "anonymous cluster";
          familiarInput["label"] = "anonymous cluster";
          mutableObject(recordById(cases, "T1-CUSTOM-001")["input"])[
            "kind"
          ] = "parsed";
          mutableObject(recordById(cases, "T1-CUSTOM-002")["input"])[
            "bass"
          ] = { step: "F", alter: 1 };
        }),
      ]);
    });
    const codes = findingCodes(report);
    expect(codes).toContain("T1_CONTRACT_FIXTURE_VERSION");
    expect(codes).toContain("T1_CONTRACT_STATUS");
    expect(codes).toContain("T1_CONTRACT_FAMILY_STATE_SENTINEL");
    expect(codes).toContain("T1_CONTRACT_MATRIX");
    expect(codes).toContain("T1_CONTRACT_SPELLING_ORACLE");
    expect(codes).toContain("T1_CONTRACT_SPELLING_CASE_IDENTITY");
    expect(codes).toContain("T1_CONTRACT_SPELLING_BRANCH_SHAPE");
    expect(codes).toContain("T1_CONTRACT_DUPLICATE_MERGE");
    expect(codes).toContain("T1_CONTRACT_INTERACTION_WITNESSES");
    expect(codes).toContain("T1_CONTRACT_CUSTOM_DISCRIMINANT");
    expect(codes).toContain("T1_CONTRACT_CUSTOM_FAMILIAR_LABEL");
    expect(codes).toContain("T1_CONTRACT_CUSTOM_BASS");
  });
});
