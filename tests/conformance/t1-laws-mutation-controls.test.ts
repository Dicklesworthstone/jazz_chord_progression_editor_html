import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";

import allRootFixtureValue from "../fixtures/resolution/all-root-cases.json";
import customFixtureValue from "../fixtures/resolution/custom-cases.json";
import formulaFixtureValue from "../fixtures/resolution/formula-rules.json";
import lawFixtureValue from "../fixtures/resolution/law-cases.json";
import literalFixtureValue from "../fixtures/resolution/literal-cases.json";
import mutationFixtureValue from "../fixtures/resolution/mutation-controls.json";
import operationStateFixtureValue from "../fixtures/resolution/operation-state-cases.json";
import provenanceLedgerValue from "../fixtures/resolution/provenance-ledger.json";
import spellingFixtureValue from "../fixtures/resolution/spelling-cases.json";
import contractFixtureValue from "../fixtures/resolution/t1-resolution-contract.json";
import traceLedgerValue from "../fixtures/resolution/trace-ledger.json";
import {
  makeCustomChordSpec,
  type Alteration,
  type ChordDegree,
  type ChordSpec,
  type CustomChordSpec,
  type DegreeNumber,
  type PitchClass,
  type SpelledPitchClass,
  type Step,
} from "../../src/domain";
import {
  parseChordSymbol,
  resolveChord,
  spellChordDegree,
  type CustomResolveChordResult,
  type ParsedResolveChordResult,
  type ResolveChordResult,
} from "../../src/theory";
import { resolveChordWithEvidence } from "../../src/theory/chord-resolution";
import type { ResolveChordWithEvidenceResult } from "../../src/theory/resolution-evidence-contract";

type JsonRecord = Readonly<Record<string, unknown>>;

type LawCase = Readonly<{
  id: string;
  lawId: string;
  statement: string;
  positiveCaseIds: readonly string[];
  nearMissCaseIds: readonly string[];
  transpositionCaseId: string;
  transpositionRecipe?: JsonRecord;
  mutationControlIds: readonly string[];
}>;

type MutationControl = Readonly<{
  id: string;
  faultFamily: string;
  operator: string;
  mutatedFault: string;
  killedByCaseIds: readonly string[];
  corroboratedByCaseIds?: readonly string[];
  corroborativeLinks?: readonly Readonly<{
    caseId: string;
    reasonCode: string;
    reason: string;
  }>[];
  reviewedCaseLinkOrder?: readonly string[];
  expectedDetection: string;
}>;

type FormulaRow = Readonly<{
  id: string;
  familyId: string;
  symbolTemplate: string;
  degrees: readonly string[];
  required: readonly string[];
  optional: readonly string[];
  guide: readonly string[];
}>;

type FormulaMatch = Readonly<{
  triad: ChordSpec["triad"];
  sixth: ChordSpec["sixth"];
  seventh: ChordSpec["seventh"];
  extensions: ChordSpec["extensions"];
  naturalNineAdditionFamilyMarker: boolean;
  colorPolicy: ChordSpec["colorPolicy"];
}>;

type FormulaFixture = Readonly<{
  rules: readonly FormulaRow[];
  publicRuleAssignments: Readonly<Record<string, string>>;
  matchAndBasePhaseByFormulaId: Readonly<
    Record<string, Readonly<{ match: FormulaMatch }>>
  >;
  alteredDominantVariants: readonly Readonly<{
    id: string;
    degrees: readonly string[];
    required: readonly string[];
    optional: readonly string[];
    guide: readonly string[];
  }>[];
  modifierRules: readonly Readonly<{
    id: string;
    phase: string;
    rule: string;
  }>[];
  familyStateMatrix: Readonly<{
    id: string;
    axes: Readonly<{
      triad: readonly ChordSpec["triad"][];
      sixth: readonly ChordSpec["sixth"][];
      seventh: readonly ChordSpec["seventh"][];
      extension: readonly (9 | 11 | 13 | null)[];
      naturalNineAddition: readonly boolean[];
      colorPolicy: readonly ChordSpec["colorPolicy"][];
    }>;
    sourceDefaults: Readonly<{
      kind: "parsed";
      sourceText: string;
      root: SpelledPitchClass;
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
      refusalRuleIdCounts: Readonly<
        Record<string, Readonly<Record<string, number>>>
      >;
      orderedPublicOutcomeSemanticSha256: string;
    }>;
  }>;
}>;

type RootFixture = Readonly<{
  matrixCase: Readonly<{
    id: string;
    rootCount: number;
    familySeedCount: number;
    expectedCellCount: number;
    excludedCells: readonly unknown[];
  }>;
  roots: readonly Readonly<{
    id: string;
    symbol: string;
    spelled: SpelledPitchClass;
    pitchClass: PitchClass;
  }>[];
  familySeeds: readonly Readonly<{
    id: string;
    bucket: string;
    formulaId: string;
    familyId: string;
  }>[];
}>;

type LiteralCase = Readonly<{
  id: string;
  sourceSymbol?: string;
  inputAstRecipe?: JsonRecord;
  expected: JsonRecord;
}>;

type LiteralFixture = Readonly<{
  schema: string;
  fixtureVersion: string;
  productionOutputUsed: boolean;
  expectedMetadata: JsonRecord;
  cases: readonly LiteralCase[];
}>;

type SpellingCase = Readonly<{
  id: string;
  root: SpelledPitchClass;
  degree: ChordDegree;
  expected: JsonRecord;
}>;

type SpellingFixture = Readonly<{
  schema: string;
  fixtureVersion: string;
  productionOutputUsed: boolean;
  publicDegreeMatrix: Readonly<{
    id: string;
    rootSteps: readonly Step[];
    rootAlterations: readonly Alteration[];
    degreeNumbers: readonly DegreeNumber[];
    degreeAlterations: readonly Alteration[];
    expected: Readonly<{
      totalCells: number;
      successCells: number;
      refusalCells: number;
      minimumRequiredAlteration: number;
      maximumRequiredAlteration: number;
      orderedCellSemanticSha256: string;
    }>;
  }>;
  cases: readonly SpellingCase[];
}>;

type CustomCase = Readonly<{
  id: string;
  input?: CustomChordSpec;
  materializationRecipe?: JsonRecord;
  transpositionRecipe?: JsonRecord;
  sourceInput?: CustomChordSpec;
  transposedInput?: CustomChordSpec;
  expected: JsonRecord;
}>;

type CustomFixture = Readonly<{
  schema: string;
  fixtureVersion: string;
  productionOutputUsed: boolean;
  sharedExpected: Readonly<{
    resolvedChordMetadata: JsonRecord;
    kind: "custom";
    id: "custom";
    formulaRuleId: "custom";
    degrees: null;
    requiredDegrees: null;
    optionalDegrees: null;
    guideToneDegrees: null;
    limitations: readonly string[];
    warnings: readonly [];
  }>;
  cases: readonly CustomCase[];
}>;

type RecipeRefusalRow = Readonly<{
  id?: string;
  inputRecipe: JsonRecord;
  expectedRefusal?: JsonRecord;
  expectedWinner?: JsonRecord;
}>;

type OperationStateCase = Readonly<{
  id: string;
  expected?: JsonRecord;
  rows?: readonly RecipeRefusalRow[];
  reasonPrecedenceRows?: readonly RecipeRefusalRow[];
}>;

type OperationStateFixture = Readonly<{
  schema: string;
  fixtureVersion: string;
  productionOutputUsed: boolean;
  cases: readonly OperationStateCase[];
}>;

type ObservationState = {
  assertions: number;
  parserExecutions: number;
  resolverExecutions: number;
  evidenceResolverExecutions: number;
  spellerExecutions: number;
  domainConstructorExecutions: number;
  observed: Map<string, string>;
  observationPayloads: Map<string, unknown>;
};

type ObservationProducer = Readonly<{
  file: "tests/conformance/t1-laws-mutation-controls.test.ts";
  testcase: "executes every law witness and discharges every reviewed control deterministically";
}>;

type ObservationRecord = Readonly<{
  caseId: string;
  producer: ObservationProducer;
  payload: unknown;
  observationDigest: string;
}>;

type TraceRow = Readonly<{
  id: string;
  requirement: string;
  sourceRefs: readonly string[];
  caseIds: readonly string[];
  mutationControlIds: readonly string[];
}>;

type AuthorityRow = Readonly<{
  id: string;
  authorityClass: string;
  sourceKind: string;
  reviewState: string;
  sourceRefs: readonly string[];
  covers: string;
  caseIds: readonly string[];
  mutationControlIds: readonly string[];
}>;

const formulaFixture = formulaFixtureValue as unknown as FormulaFixture;
const rootFixture = allRootFixtureValue as unknown as RootFixture;
const literalFixture = literalFixtureValue as unknown as LiteralFixture;
const spellingFixture = spellingFixtureValue as unknown as SpellingFixture;
const customFixture = customFixtureValue as unknown as CustomFixture;
const operationStateFixture =
  operationStateFixtureValue as unknown as OperationStateFixture;
const traceLedger = traceLedgerValue as unknown as Readonly<{
  schema: string;
  fixtureVersion: string;
  productionOutputUsed: boolean;
  expectedValuesGenerated: boolean;
  traces: readonly TraceRow[];
}>;
const provenanceLedger = provenanceLedgerValue as unknown as Readonly<{
  schema: string;
  fixtureVersion: string;
  productionOutputUsed: boolean;
  expectedValuesGenerated: boolean;
  authoringStatement: string;
  allowedAuthorityClasses: readonly string[];
  independenceRules: readonly string[];
  authorities: readonly AuthorityRow[];
}>;
const lawFixture = lawFixtureValue as unknown as Readonly<{
  schema: string;
  fixtureVersion: string;
  productionOutputUsed: boolean;
  expectedValuesGenerated: boolean;
  cases: readonly LawCase[];
}>;
const mutationFixture = mutationFixtureValue as unknown as Readonly<{
  schema: string;
  fixtureVersion: string;
  productionOutputUsed: boolean;
  expectedValuesGenerated: boolean;
  reviewState: string;
  requiredFaultFamilies: readonly string[];
  controls: readonly MutationControl[];
}>;

const HARNESS_SEED = "changes.t1-laws.seed.v1:5411c0de";
const OBSERVATION_PRODUCER = Object.freeze({
  file: "tests/conformance/t1-laws-mutation-controls.test.ts",
  testcase:
    "executes every law witness and discharges every reviewed control deterministically",
} satisfies ObservationProducer);
const STEP_ORDER = ["C", "D", "E", "F", "G", "A", "B"] as const;
const NATURAL_SEMITONES = Object.freeze({
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
} satisfies Readonly<Record<Step, number>>);
const DEGREE_SEMITONES = Object.freeze({
  1: 0,
  2: 2,
  3: 4,
  4: 5,
  5: 7,
  6: 9,
  7: 11,
  9: 14,
  11: 17,
  13: 21,
} satisfies Readonly<Record<DegreeNumber, number>>);
const CONVENIENCE_SPELLINGS = Object.freeze([
  { step: "C", alter: 0 },
  { step: "C", alter: 1 },
  { step: "D", alter: 0 },
  { step: "E", alter: -1 },
  { step: "E", alter: 0 },
  { step: "F", alter: 0 },
  { step: "F", alter: 1 },
  { step: "G", alter: 0 },
  { step: "A", alter: -1 },
  { step: "A", alter: 0 },
  { step: "B", alter: -1 },
  { step: "B", alter: 0 },
] satisfies readonly SpelledPitchClass[]);

function convenienceSpelling(pitchClass: number): SpelledPitchClass {
  const spelling = CONVENIENCE_SPELLINGS[asPitchClass(pitchClass)];
  if (spelling === undefined) throw new RangeError(`missing convenience spelling ${pitchClass.toString()}`);
  return { ...spelling };
}

function canonicalJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, item]) => [key, canonicalJsonValue(item)]),
  );
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalJsonValue(value));
}

function sha256(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function checkEqual(
  state: ObservationState,
  actual: unknown,
  expected: unknown,
  label: string,
): void {
  state.assertions += 1;
  expect(actual, label).toEqual(expected);
}

function checkSame(
  state: ObservationState,
  actual: unknown,
  expected: unknown,
  label: string,
): void {
  state.assertions += 1;
  expect(actual, label).toBe(expected);
}

function checkTrue(
  state: ObservationState,
  condition: boolean,
  label: string,
): void {
  state.assertions += 1;
  expect(condition, label).toBe(true);
}

function observe(
  state: ObservationState,
  caseId: string,
  semanticValue: unknown,
): void {
  const payload = canonicalJsonValue(semanticValue);
  const digest = sha256({
    caseId,
    producer: OBSERVATION_PRODUCER,
    payload,
  });
  const existing = state.observed.get(caseId);
  if (existing !== undefined) {
    checkSame(state, digest, existing, `${caseId} repeated observation`);
    checkEqual(
      state,
      state.observationPayloads.get(caseId),
      payload,
      `${caseId} repeated payload`,
    );
    return;
  }
  state.observed.set(caseId, digest);
  state.observationPayloads.set(caseId, payload);
}

function observationRecord(
  state: ObservationState,
  caseId: string,
): ObservationRecord {
  const payload = state.observationPayloads.get(caseId);
  const observationDigest = state.observed.get(caseId);
  if (payload === undefined || observationDigest === undefined) {
    throw new Error(`${caseId} runtime observation missing`);
  }
  return {
    caseId,
    producer: OBSERVATION_PRODUCER,
    payload,
    observationDigest,
  };
}

function record(value: unknown, label: string): JsonRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as JsonRecord;
}

function stringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new TypeError(`${label} must be a string array`);
  }
  return value;
}

function asAlteration(value: number): Alteration {
  if (value === -2 || value === -1 || value === 0 || value === 1 || value === 2) {
    return value;
  }
  throw new RangeError(`unsupported alteration ${value.toString()}`);
}

function asPitchClass(value: number): PitchClass {
  const normalized = ((value % 12) + 12) % 12;
  if (
    normalized === 0 ||
    normalized === 1 ||
    normalized === 2 ||
    normalized === 3 ||
    normalized === 4 ||
    normalized === 5 ||
    normalized === 6 ||
    normalized === 7 ||
    normalized === 8 ||
    normalized === 9 ||
    normalized === 10 ||
    normalized === 11
  ) {
    return normalized;
  }
  throw new RangeError(`invalid pitch class ${normalized.toString()}`);
}

function stepAt(directedIndex: number): Step {
  const index = ((directedIndex % STEP_ORDER.length) + STEP_ORDER.length) % STEP_ORDER.length;
  const step = STEP_ORDER[index];
  if (step === undefined) throw new RangeError(`missing step ${index.toString()}`);
  return step;
}

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

function independentSpelling(root: SpelledPitchClass, degree: ChordDegree) {
  const rootIndex = STEP_ORDER.indexOf(root.step);
  const directedIndex = rootIndex + degree.number - 1;
  const targetStep = stepAt(directedIndex);
  const sounding =
    NATURAL_SEMITONES[root.step] +
    root.alter +
    DEGREE_SEMITONES[degree.number] +
    degree.alter;
  const targetNatural =
    NATURAL_SEMITONES[targetStep] +
    12 * Math.floor(directedIndex / STEP_ORDER.length);
  const requiredAlteration = sounding - targetNatural;

  if (requiredAlteration < -2 || requiredAlteration > 2) {
    return {
      ok: false as const,
      refusal: {
        code: "theory.spelling_accidental_out_of_range" as const,
        path: ["degree"] as const,
        phase: "spelling" as const,
        degreeSpellingPolicyId: "changes.degree-spelling" as const,
        degreeSpellingPolicyVersion: 1 as const,
        root,
        degree,
        requiredAlteration,
        minimum: -2 as const,
        maximum: 2 as const,
      },
    };
  }

  return {
    ok: true as const,
    value: {
      policyId: "changes.degree-spelling" as const,
      policyVersion: 1 as const,
      root,
      degree,
      spelled: { step: targetStep, alter: asAlteration(requiredAlteration) },
      pitchClass: asPitchClass(sounding),
    },
  };
}

type SpellingMatrixCounterfactual =
  | "clamp-one-overflow"
  | "reject-one-non-formula-degree";

function clampedSpellingResult(
  root: SpelledPitchClass,
  degree: ChordDegree,
): Readonly<{ ok: true; value: JsonRecord }> {
  const expected = independentSpelling(root, degree);
  if (expected.ok) throw new Error(`${token(degree)} is not an overflow spelling`);
  const targetStep = stepAt(STEP_ORDER.indexOf(root.step) + degree.number - 1);
  const emittedAlteration = asAlteration(
    Math.max(-2, Math.min(2, expected.refusal.requiredAlteration)),
  );
  return {
    ok: true,
    value: {
      policyId: "changes.degree-spelling",
      policyVersion: 1,
      root,
      degree,
      spelled: { step: targetStep, alter: emittedAlteration },
      pitchClass: asPitchClass(NATURAL_SEMITONES[targetStep] + emittedAlteration),
    },
  };
}

function spellingMatrixCounterfactualSummary(
  counterfactual: SpellingMatrixCounterfactual,
): Readonly<{
  cells: number;
  successes: number;
  refusals: number;
  minimumRequiredAlteration: number;
  maximumRequiredAlteration: number;
  semanticDigest: string;
}> {
  const matrix = spellingFixture.publicDegreeMatrix;
  const orderedCells: unknown[] = [];
  let successes = 0;
  let refusals = 0;
  let minimumRequiredAlteration = Number.POSITIVE_INFINITY;
  let maximumRequiredAlteration = Number.NEGATIVE_INFINITY;
  let transitionedCells = 0;
  for (const step of matrix.rootSteps) {
    for (const rootAlter of matrix.rootAlterations) {
      const root = { step, alter: rootAlter } as SpelledPitchClass;
      for (const number of matrix.degreeNumbers) {
        for (const degreeAlter of matrix.degreeAlterations) {
          const degree = { number, alter: degreeAlter } as ChordDegree;
          const baseline = independentSpelling(root, degree);
          let expected: unknown = baseline;
          if (
            counterfactual === "clamp-one-overflow" &&
            step === "C" && rootAlter === 2 && number === 9 && degreeAlter === 1
          ) {
            if (baseline.ok) throw new Error("reviewed clamp cell must refuse");
            expected = clampedSpellingResult(root, degree);
            transitionedCells += 1;
          } else if (
            counterfactual === "reject-one-non-formula-degree" &&
            step === "C" && rootAlter === 0 && number === 2 && degreeAlter === 1
          ) {
            if (!baseline.ok) throw new Error("reviewed non-formula degree cell must succeed");
            expected = {
              ok: false,
              refusal: {
                code: "theory.spelling_degree_unsupported",
                path: ["degree"],
                phase: "spelling",
                degreeSpellingPolicyId: "changes.degree-spelling",
                degreeSpellingPolicyVersion: 1,
                root,
                degree,
                reason: "degree-identity-not-emitted-by-formula-table",
              },
            };
            transitionedCells += 1;
          }
          if (mutableRecord(expected)?.["ok"] === true) {
            successes += 1;
          } else {
            refusals += 1;
            const requiredAlteration = mutableRecord(mutableRecord(expected)?.["refusal"])?.["requiredAlteration"];
            if (typeof requiredAlteration === "number") {
              minimumRequiredAlteration = Math.min(minimumRequiredAlteration, requiredAlteration);
              maximumRequiredAlteration = Math.max(maximumRequiredAlteration, requiredAlteration);
            }
          }
          orderedCells.push({ input: { root, degree }, expected });
        }
      }
    }
  }
  if (transitionedCells !== 1) {
    throw new Error(`${counterfactual} changed ${transitionedCells.toString()} cells`);
  }
  return {
    cells: orderedCells.length,
    successes,
    refusals,
    minimumRequiredAlteration,
    maximumRequiredAlteration,
    semanticDigest: sha256(orderedCells),
  };
}

function independentlyTransposePitch(
  pitch: SpelledPitchClass,
  interval: Readonly<{ diatonicSteps: number; semitones: number }>,
): SpelledPitchClass {
  const sourceIndex = STEP_ORDER.indexOf(pitch.step);
  const directedIndex = sourceIndex + interval.diatonicSteps;
  const targetStep = stepAt(directedIndex);
  const targetNatural =
    NATURAL_SEMITONES[targetStep] +
    12 * Math.floor(directedIndex / STEP_ORDER.length);
  const sounding = NATURAL_SEMITONES[pitch.step] + pitch.alter + interval.semitones;
  return { step: targetStep, alter: asAlteration(sounding - targetNatural) };
}

function parseSource(
  state: ObservationState,
  sourceText: string,
): ChordSpec {
  state.parserExecutions += 1;
  const parsed = parseChordSymbol(sourceText, "ascii");
  checkSame(state, parsed.ok, true, `parse ${sourceText}`);
  if (!parsed.ok) throw new Error(`fixture symbol refused: ${sourceText}`);
  return parsed.chord;
}

function materializeRecipe(
  state: ObservationState,
  recipe: JsonRecord,
): ChordSpec {
  if (recipe["kind"] === "parsed") return recipe as unknown as ChordSpec;
  const base = recipe["base"];
  if (typeof base !== "string") throw new TypeError("recipe.base must be a string");
  const source = parseSource(state, base);
  const overrides = Object.fromEntries(
    Object.entries(recipe).filter(([key]) => key !== "base"),
  );
  return { ...source, ...overrides };
}

function resolver(
  state: ObservationState,
  source: ChordSpec,
): ParsedResolveChordResult;
function resolver(
  state: ObservationState,
  source: CustomChordSpec,
): CustomResolveChordResult;
function resolver(
  state: ObservationState,
  source: ChordSpec | CustomChordSpec,
): ResolveChordResult;
function resolver(
  state: ObservationState,
  source: ChordSpec | CustomChordSpec,
): ResolveChordResult {
  state.resolverExecutions += 1;
  return resolveChord(source);
}

function evidenceResolver(
  state: ObservationState,
  source: ChordSpec,
): ResolveChordWithEvidenceResult<ParsedResolveChordResult>;
function evidenceResolver(
  state: ObservationState,
  source: CustomChordSpec,
): ResolveChordWithEvidenceResult<CustomResolveChordResult>;
function evidenceResolver(
  state: ObservationState,
  source: ChordSpec | CustomChordSpec,
): ResolveChordWithEvidenceResult;
function evidenceResolver(
  state: ObservationState,
  source: ChordSpec | CustomChordSpec,
): ResolveChordWithEvidenceResult {
  state.evidenceResolverExecutions += 1;
  return resolveChordWithEvidence(source);
}

function speller(
  state: ObservationState,
  root: SpelledPitchClass,
  degree: ChordDegree,
) {
  state.spellerExecutions += 1;
  return spellChordDegree(root, degree);
}

function realizationView(realization: Readonly<{
  id: string;
  degrees: readonly ChordDegree[];
  requiredDegrees: readonly ChordDegree[];
  optionalDegrees: readonly ChordDegree[];
  guideToneDegrees: readonly ChordDegree[];
  spelledPitchNames: readonly SpelledPitchClass[];
  pitchClasses: readonly PitchClass[];
}>) {
  return {
    degrees: realization.degrees.map(token),
    required: realization.requiredDegrees.map(token),
    optional: realization.optionalDegrees.map(token),
    guide: realization.guideToneDegrees.map(token),
    spelledPitchNames: realization.spelledPitchNames,
    pitchClasses: realization.pitchClasses,
  };
}

function executeFormulaMatrix(state: ObservationState) {
  checkSame(state, rootFixture.roots.length, 12, "root inventory");
  checkSame(state, formulaFixture.rules.length, 33, "formula inventory");
  checkEqual(state, rootFixture.matrixCase.excludedCells, [], "matrix exclusions");
  const matrixCells: unknown[] = [];
  const byFormula = new Map<string, unknown[]>();
  const byRoot = new Map<string, unknown[]>();
  let degreeSpellings = 0;

  for (const root of rootFixture.roots) {
    for (const row of formulaFixture.rules) {
      const authority = formulaFixture.matchAndBasePhaseByFormulaId[row.id];
      if (authority === undefined) throw new Error(`missing match authority ${row.id}`);
      const match = authority.match;
      const source: ChordSpec = {
        kind: "parsed",
        sourceText: row.symbolTemplate.replace("{root}", root.symbol),
        root: root.spelled,
        triad: match.triad,
        sixth: match.sixth,
        seventh: match.seventh,
        extensions: match.extensions,
        additions: match.naturalNineAdditionFamilyMarker
          ? [{ number: 9, alter: 0 }]
          : [],
        alterations: [],
        omissions: [],
        bass: null,
        colorPolicy: match.colorPolicy,
      };
      const before = canonicalJson(source);
      const result = resolver(state, source);
      checkSame(state, result.ok, true, `${root.id} ${row.id} success`);
      checkSame(state, canonicalJson(source), before, `${root.id} ${row.id} input`);
      if (!result.ok) throw new Error(`matrix cell refused: ${root.id} ${row.id}`);
      const realization = result.value.realizations[0];
      const expectedRule = formulaFixture.publicRuleAssignments[row.familyId];
      checkSame(state, realization.formulaRuleId, expectedRule, `${row.id} rule`);
      checkEqual(state, realization.degrees.map(token), row.degrees, `${row.id} degrees`);
      checkEqual(
        state,
        realization.requiredDegrees.map(token),
        row.required,
        `${row.id} required`,
      );
      checkEqual(
        state,
        realization.optionalDegrees.map(token),
        row.optional,
        `${row.id} optional`,
      );
      checkEqual(
        state,
        realization.guideToneDegrees.map(token),
        row.guide,
        `${row.id} guide`,
      );
      for (const [index, degree] of realization.degrees.entries()) {
        const expectedSpelling = independentSpelling(root.spelled, degree);
        checkSame(state, expectedSpelling.ok, true, `${root.id} ${row.id} spellable`);
        if (!expectedSpelling.ok) throw new Error("reviewed matrix degree refused");
        checkEqual(
          state,
          realization.spelledPitchNames[index],
          expectedSpelling.value.spelled,
          `${root.id} ${row.id} spelling ${index.toString()}`,
        );
        checkSame(
          state,
          realization.pitchClasses[index],
          expectedSpelling.value.pitchClass,
          `${root.id} ${row.id} pitch ${index.toString()}`,
        );
        degreeSpellings += 1;
      }
      const cell = {
        rootId: root.id,
        formulaId: row.id,
        formulaRuleId: realization.formulaRuleId,
        ...realizationView(realization),
      };
      matrixCells.push(cell);
      const formulaCells = byFormula.get(row.id) ?? [];
      formulaCells.push(cell);
      byFormula.set(row.id, formulaCells);
      const rootCells = byRoot.get(root.id) ?? [];
      rootCells.push(cell);
      byRoot.set(root.id, rootCells);
    }
  }

  checkSame(
    state,
    matrixCells.length,
    rootFixture.matrixCase.expectedCellCount,
    "formula matrix cell count",
  );
  checkSame(state, degreeSpellings, 1_824, "formula matrix spelling count");
  for (const root of rootFixture.roots) {
    const rootCells = byRoot.get(root.id) ?? [];
    checkSame(state, rootCells.length, 33, `${root.id} formula cells`);
    observe(state, root.id, {
      root: root.spelled,
      pitchClass: root.pitchClass,
      cells: rootCells,
    });
  }
  for (const row of formulaFixture.rules) {
    const formulaCells = byFormula.get(row.id) ?? [];
    checkSame(state, formulaCells.length, 12, `${row.id} root cells`);
    observe(state, row.id, formulaCells);
  }
  checkSame(state, rootFixture.familySeeds.length, 33, "family seed inventory");
  for (const seed of rootFixture.familySeeds) {
    const formulaCells = byFormula.get(seed.formulaId) ?? [];
    checkSame(state, formulaCells.length, 12, `${seed.id} formula cells`);
    checkTrue(
      state,
      formulaFixture.rules.some(
        ({ id, familyId }) => id === seed.formulaId && familyId === seed.familyId,
      ),
      `${seed.id} formula authority`,
    );
    observe(state, seed.id, {
      bucket: seed.bucket,
      formulaId: seed.formulaId,
      familyId: seed.familyId,
      cells: formulaCells,
    });
  }
  const semanticDigest = sha256(matrixCells);
  observe(state, rootFixture.matrixCase.id, {
    cells: matrixCells,
    degreeSpellings,
    semanticDigest,
  });
  return { cells: matrixCells.length, degreeSpellings, semanticDigest };
}

function increment(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function executeFamilyStateMatrix(state: ObservationState) {
  const matrix = formulaFixture.familyStateMatrix;
  const orderedPublicOutcomes: unknown[] = [];
  const outcomeCounts: Record<string, number> = {};
  const reasonAndConflictCounts: Record<string, number> = {};
  const acceptedRuleIdCounts: Record<string, number> = {};
  const refusalRuleIdCounts: Record<string, Record<string, number>> = {};
  let totalStates = 0;
  let acceptedStates = 0;

  for (const triad of matrix.axes.triad) {
    for (const sixth of matrix.axes.sixth) {
      for (const seventh of matrix.axes.seventh) {
        for (const extension of matrix.axes.extension) {
          for (const naturalNineAddition of matrix.axes.naturalNineAddition) {
            for (const colorPolicy of matrix.axes.colorPolicy) {
              const facts = {
                triad,
                sixth,
                seventh,
                extension,
                naturalNineAddition,
                colorPolicy,
              };
              const source: ChordSpec = {
                ...matrix.sourceDefaults,
                triad,
                sixth,
                seventh,
                extensions:
                  extension === null ? [] : [{ number: extension, alter: 0 }],
                additions: naturalNineAddition
                  ? [{ number: 9, alter: 0 }]
                  : [],
                colorPolicy,
              };
              const result = resolver(state, source);
              totalStates += 1;
              orderedPublicOutcomes.push({ facts, expected: result });
              if (result.ok) {
                acceptedStates += 1;
                increment(outcomeCounts, "accepted");
                increment(
                  acceptedRuleIdCounts,
                  result.value.realizations[0].formulaRuleId,
                );
                continue;
              }

              const refusal = result.refusal;
              increment(outcomeCounts, refusal.code);
              if ("ruleId" in refusal) {
                const byRule = (refusalRuleIdCounts[refusal.code] ??= {});
                increment(byRule, refusal.ruleId);
              }
              if (refusal.code === "theory.sixth_invalid") {
                increment(reasonAndConflictCounts, "sixth-family");
              } else if (refusal.code === "theory.formula_family_unsupported") {
                increment(reasonAndConflictCounts, "unsupported-seventh");
              } else if (refusal.code === "theory.extension_invalid") {
                increment(reasonAndConflictCounts, "extension-family");
              } else if (refusal.code === "theory.color_policy_invalid") {
                increment(reasonAndConflictCounts, "requires-dominant-seventh");
              } else if (refusal.code === "theory.modifier_conflict") {
                increment(reasonAndConflictCounts, refusal.conflict);
              }
            }
          }
        }
      }
    }
  }

  const semanticDigest = sha256(orderedPublicOutcomes);
  checkSame(state, totalStates, matrix.expected.totalStates, "family states");
  checkSame(state, acceptedStates, matrix.expected.acceptedStates, "family accepted");
  checkEqual(state, outcomeCounts, matrix.expected.outcomeCounts, "family outcomes");
  checkEqual(
    state,
    reasonAndConflictCounts,
    matrix.expected.reasonAndConflictCounts,
    "family reasons",
  );
  checkEqual(
    state,
    acceptedRuleIdCounts,
    matrix.expected.acceptedRuleIdCounts,
    "family accepted rules",
  );
  checkEqual(
    state,
    refusalRuleIdCounts,
    matrix.expected.refusalRuleIdCounts,
    "family refusal rules",
  );
  checkSame(
    state,
    semanticDigest,
    matrix.expected.orderedPublicOutcomeSemanticSha256,
    "family public outcome digest",
  );
  observe(state, matrix.id, {
    totalStates,
    acceptedStates,
    outcomeCounts,
    reasonAndConflictCounts,
    acceptedRuleIdCounts,
    refusalRuleIdCounts,
    orderedPublicOutcomes,
    semanticDigest,
  });
  return { totalStates, acceptedStates, semanticDigest };
}

function executeFocusedSpellingCases(state: ObservationState): void {
  checkSame(state, spellingFixture.cases.length, 16, "focused spelling count");
  const corrections: unknown[] = [];
  for (const row of spellingFixture.cases) {
    const result = speller(state, row.root, row.degree);
    const expected = row.expected;
    if (expected["ok"] === false) {
      checkEqual(
        state,
        result,
        { ok: false, refusal: expected["refusal"] },
        `${row.id} refusal`,
      );
    } else {
      checkSame(state, result.ok, true, `${row.id} success`);
      if (!result.ok) throw new Error(`${row.id} unexpectedly refused`);
      checkEqual(state, result.value.root, row.root, `${row.id} root`);
      checkEqual(state, result.value.degree, row.degree, `${row.id} degree`);
      checkEqual(state, result.value.spelled, expected["spelled"], `${row.id} spelling`);
      checkSame(
        state,
        result.value.pitchClass,
        expected["pitchClass"],
        `${row.id} projection`,
      );
    }
    observe(state, row.id, result);
    if (typeof row.expected["correctionId"] === "string") {
      corrections.push({
        caseId: row.id,
        correctionId: row.expected["correctionId"],
        result,
      });
    }
  }
  checkSame(state, corrections.length, 2, "spelling correction witnesses");
  observe(state, "T1-CORRECTION-ABDIM7", corrections);
}

function executePublicSpellingMatrix(state: ObservationState) {
  const matrix = spellingFixture.publicDegreeMatrix;
  const orderedCells: unknown[] = [];
  let successes = 0;
  let refusals = 0;
  let minimumRequiredAlteration = Number.POSITIVE_INFINITY;
  let maximumRequiredAlteration = Number.NEGATIVE_INFINITY;

  for (const step of matrix.rootSteps) {
    for (const rootAlter of matrix.rootAlterations) {
      const root: SpelledPitchClass = { step, alter: rootAlter };
      for (const number of matrix.degreeNumbers) {
        for (const degreeAlter of matrix.degreeAlterations) {
          const degree: ChordDegree = { number, alter: degreeAlter };
          const expected = independentSpelling(root, degree);
          const actual = speller(state, root, degree);
          checkEqual(
            state,
            actual,
            expected,
            `public spelling ${step}${rootAlter.toString()} ${token(degree)}`,
          );
          if (expected.ok) {
            successes += 1;
          } else {
            refusals += 1;
            minimumRequiredAlteration = Math.min(
              minimumRequiredAlteration,
              expected.refusal.requiredAlteration,
            );
            maximumRequiredAlteration = Math.max(
              maximumRequiredAlteration,
              expected.refusal.requiredAlteration,
            );
          }
          orderedCells.push({ input: { root, degree }, expected });
        }
      }
    }
  }

  const semanticDigest = sha256(orderedCells);
  checkSame(state, orderedCells.length, matrix.expected.totalCells, "public cells");
  checkSame(state, successes, matrix.expected.successCells, "public successes");
  checkSame(state, refusals, matrix.expected.refusalCells, "public refusals");
  checkSame(
    state,
    minimumRequiredAlteration,
    matrix.expected.minimumRequiredAlteration,
    "public minimum",
  );
  checkSame(
    state,
    maximumRequiredAlteration,
    matrix.expected.maximumRequiredAlteration,
    "public maximum",
  );
  checkSame(
    state,
    semanticDigest,
    matrix.expected.orderedCellSemanticSha256,
    "public semantic digest",
  );
  observe(state, matrix.id, {
    cells: orderedCells.length,
    successes,
    refusals,
    minimumRequiredAlteration,
    maximumRequiredAlteration,
    semanticDigest,
  });
  return {
    cells: orderedCells.length,
    successes,
    refusals,
    minimumRequiredAlteration,
    maximumRequiredAlteration,
    semanticDigest,
  };
}

function materializeLiteralSource(
  state: ObservationState,
  row: LiteralCase,
): ChordSpec {
  if (row.sourceSymbol !== undefined) return parseSource(state, row.sourceSymbol);
  if (row.inputAstRecipe !== undefined) return materializeRecipe(state, row.inputAstRecipe);
  throw new Error(`${row.id} has no source`);
}

function assertLiteralSuccess(
  state: ObservationState,
  row: LiteralCase,
  source: ChordSpec,
  result: Extract<ParsedResolveChordResult, Readonly<{ ok: true }>>,
): void {
  const expected = row.expected;
  const value = result.value;
  const realizationIds = value.realizations.map(({ id }) => id);
  checkEqual(state, value.schema, literalFixture.expectedMetadata["schema"], `${row.id} schema`);
  for (const [key, expectedValue] of Object.entries(literalFixture.expectedMetadata)) {
    checkEqual(
      state,
      Reflect.get(value, key),
      expectedValue,
      `${row.id} metadata ${key}`,
    );
  }
  if (expected["root"] !== undefined) {
    checkEqual(state, value.source.root, expected["root"], `${row.id} root`);
  }
  if (expected["formulaRuleId"] !== undefined) {
    checkSame(
      state,
      value.realizations[0].formulaRuleId,
      expected["formulaRuleId"],
      `${row.id} rule`,
    );
  }
  if (expected["realizationIds"] !== undefined) {
    checkEqual(state, realizationIds, expected["realizationIds"], `${row.id} IDs`);
  }
  const first = value.realizations[0];
  const standardFields = [
    ["degrees", first.degrees.map(token)],
    ["required", first.requiredDegrees.map(token)],
    ["optional", first.optionalDegrees.map(token)],
    ["guide", first.guideToneDegrees.map(token)],
    ["spelledPitchNames", first.spelledPitchNames],
    ["pitchClasses", first.pitchClasses],
    ["bass", value.bass],
    [
      "warnings",
      value.warnings.map(({ code, path, degreeNumber }) => ({
        code,
        path,
        degreeNumber,
      })),
    ],
  ] as const;
  for (const [key, actual] of standardFields) {
    if (expected[key] !== undefined) {
      checkEqual(state, actual, expected[key], `${row.id} ${key}`);
    }
  }

  const formulaId = expected["formulaId"];
  if (typeof formulaId === "string") {
    const formula = formulaFixture.rules.find(({ id }) => id === formulaId);
    if (formula === undefined) throw new Error(`${row.id} missing ${formulaId}`);
    checkSame(
      state,
      first.formulaRuleId,
      formulaFixture.publicRuleAssignments[formula.familyId],
      `${row.id} formula authority`,
    );
    if (expected["degrees"] === undefined) {
      checkEqual(state, first.degrees.map(token), formula.degrees, `${row.id} formula degrees`);
      checkEqual(
        state,
        first.requiredDegrees.map(token),
        formula.required,
        `${row.id} formula required`,
      );
      checkEqual(
        state,
        first.optionalDegrees.map(token),
        formula.optional,
        `${row.id} formula optional`,
      );
      checkEqual(
        state,
        first.guideToneDegrees.map(token),
        formula.guide,
        `${row.id} formula guide`,
      );
    }
  }

  if (expected["variantExpectationsRef"] !== undefined) {
    const actual = value.realizations.map((realization) => ({
      id: realization.id,
      degrees: realization.degrees.map(token),
      required: realization.requiredDegrees.map(token),
      optional: realization.optionalDegrees.map(token),
      guide: realization.guideToneDegrees.map(token),
    }));
    const authority = formulaFixture.alteredDominantVariants.map(
      ({ id, degrees, required, optional, guide }) => ({
        id,
        degrees,
        required,
        optional,
        guide,
      }),
    );
    checkEqual(state, actual, authority, `${row.id} altered authority`);
  }

  if (expected["naturalFiveOrNinePresent"] === false) {
    checkSame(
      state,
      value.realizations.some((realization) =>
        realization.degrees.some(
          (degree) => (degree.number === 5 || degree.number === 9) && degree.alter === 0,
        ),
      ),
      false,
      `${row.id} no natural 5/9`,
    );
  }

  if (expected["degreeSevenSpelling"] !== undefined) {
    const index = first.degrees.findIndex(({ number }) => number === 7);
    checkTrue(state, index >= 0, `${row.id} degree seven index`);
    checkEqual(
      state,
      first.spelledPitchNames[index],
      expected["degreeSevenSpelling"],
      `${row.id} degree seven spelling`,
    );
  }

  if (expected["degreesById"] !== undefined) {
    checkEqual(
      state,
      Object.fromEntries(
        value.realizations.map((realization) => [
          realization.id,
          realization.degrees.map(token),
        ]),
      ),
      expected["degreesById"],
      `${row.id} degrees by ID`,
    );
  }

  if (expected["realizationsById"] !== undefined) {
    checkEqual(
      state,
      Object.fromEntries(
        value.realizations.map((realization) => [
          realization.id,
          realizationView(realization),
        ]),
      ),
      expected["realizationsById"],
      `${row.id} realizations by ID`,
    );
  }

  const everyVariantAddsRequired = expected["everyVariantAddsRequired"];
  if (everyVariantAddsRequired !== undefined) {
    const requiredTokens =
      typeof everyVariantAddsRequired === "string"
        ? [everyVariantAddsRequired]
        : stringArray(everyVariantAddsRequired, `${row.id} required additions`);
    for (const realization of value.realizations) {
      const actualRequired = realization.requiredDegrees.map(token);
      for (const requiredToken of requiredTokens) {
        checkTrue(
          state,
          actualRequired.includes(requiredToken),
          `${row.id} ${realization.id} requires ${requiredToken}`,
        );
      }
    }
  }

  if (expected["genericAdd3IsGuide"] === false) {
    checkSame(
      state,
      first.guideToneDegrees.some(({ number }) => number === 3),
      false,
      `${row.id} add3 not guide`,
    );
  }

  if (expected["naturalNineRequiredInEveryRealization"] === true) {
    for (const realization of value.realizations) {
      checkTrue(
        state,
        realization.requiredDegrees.some(
          ({ number, alter }) => number === 9 && alter === 0,
        ),
        `${row.id} ${realization.id} natural nine`,
      );
    }
  }

  if (expected["colorNineRetainedInEveryRealization"] === true) {
    for (const realization of value.realizations) {
      checkTrue(
        state,
        realization.degrees.some(
          ({ number, alter }) => number === 9 && (alter === -1 || alter === 1),
        ),
        `${row.id} ${realization.id} color nine`,
      );
    }
  }

  if (expected["phaseCoexistenceById"] !== undefined) {
    const phaseRows = record(expected["phaseCoexistenceById"], `${row.id} phase rows`);
    for (const realization of value.realizations) {
      const phaseRow = record(phaseRows[realization.id], `${row.id} ${realization.id}`);
      checkEqual(
        state,
        realization.degrees
          .filter(({ number }) => number === 9)
          .map(token),
        phaseRow["canonicalNineOrder"],
        `${row.id} ${realization.id} nine order`,
      );
    }
  }

  if (expected["naturalNineFamilyMarkerConsumedOnce"] === true) {
    checkSame(
      state,
      first.degrees.map(token).filter((item) => item === "9").length,
      1,
      `${row.id} one natural nine`,
    );
  }

  if (typeof expected["requiredSiblingAddition"] === "string") {
    checkTrue(
      state,
      first.requiredDegrees.map(token).includes(expected["requiredSiblingAddition"]),
      `${row.id} required sibling`,
    );
  }

  if (expected["bassExcludedFromSpellingArrays"] === true) {
    checkTrue(state, value.bass !== null, `${row.id} bass exists`);
    if (value.bass !== null) {
      for (const realization of value.realizations) {
        checkSame(
          state,
          realization.spelledPitchNames.some(
            (pitch) => pitch.step === value.bass?.step && pitch.alter === value.bass.alter,
          ),
          false,
          `${row.id} ${realization.id} excludes bass`,
        );
      }
    }
  }

  if (
    expected["bassExcludedFromMembership"] === true ||
    expected["bassExcludedFromEveryRealizationMembership"] === true
  ) {
    for (const realization of value.realizations) {
      checkSame(
        state,
        realization.degrees.length,
        realization.spelledPitchNames.length,
        `${row.id} ${realization.id} aligned membership`,
      );
    }
    checkTrue(
      state,
      value.bass === null || value.bass !== value.realizations[0].spelledPitchNames[0],
      `${row.id} bass separately copied`,
    );
  }

  if (expected["sourceTextIgnored"] === true) {
    checkSame(state, value.source.sourceText, source.sourceText, `${row.id} source text retained`);
    checkTrue(
      state,
      first.formulaRuleId !== expected["sourceTextWouldImplyFormulaRuleId"],
      `${row.id} source text ignored`,
    );
  }

  if (expected["duplicateDegreesCanonicalized"] !== undefined) {
    const withEvidence = evidenceResolver(state, source);
    checkSame(state, withEvidence.result.ok, true, `${row.id} evidence success`);
    checkSame(
      state,
      withEvidence.evidence.duplicateDegreesCanonicalized,
      expected["duplicateDegreesCanonicalized"],
      `${row.id} duplicate evidence`,
    );
  }

  checkTrue(state, Object.isFrozen(result), `${row.id} frozen result`);
  checkTrue(state, Object.isFrozen(value), `${row.id} frozen value`);
  checkTrue(state, Object.isFrozen(value.realizations), `${row.id} frozen realizations`);
}

function executeLiteralCase(
  state: ObservationState,
  row: LiteralCase,
): void {
  const source = materializeLiteralSource(state, row);
  const before = canonicalJson(source);
  const result = resolver(state, source);
  checkSame(state, canonicalJson(source), before, `${row.id} source unchanged`);

  if (row.expected["ok"] === false) {
    checkEqual(
      state,
      result,
      { ok: false, refusal: row.expected["refusal"] },
      `${row.id} exact refusal`,
    );
    checkEqual(state, Object.keys(result), ["ok", "refusal"], `${row.id} transactional shape`);
  } else {
    checkSame(state, result.ok, true, `${row.id} expected success`);
    if (!result.ok) throw new Error(`${row.id} unexpectedly refused`);
    assertLiteralSuccess(state, row, source, result);
  }
  observe(state, row.id, result);
}

function executeAllLiteralCases(state: ObservationState): void {
  checkSame(state, literalFixture.cases.length, 88, "literal inventory");
  for (const row of literalFixture.cases) executeLiteralCase(state, row);
}

function customSemanticView(
  result: Extract<CustomResolveChordResult, Readonly<{ ok: true }>>,
) {
  const realization = result.value.realizations[0];
  return {
    schema: result.value.schema,
    formulaTableId: result.value.formulaTableId,
    formulaTableVersion: result.value.formulaTableVersion,
    degreeSpellingPolicyId: result.value.degreeSpellingPolicyId,
    degreeSpellingPolicyVersion: result.value.degreeSpellingPolicyVersion,
    degreeRolePolicyId: result.value.degreeRolePolicyId,
    degreeRolePolicyVersion: result.value.degreeRolePolicyVersion,
    kind: realization.kind,
    id: realization.id,
    formulaRuleId: realization.formulaRuleId,
    degrees: realization.degrees,
    requiredDegrees: realization.requiredDegrees,
    optionalDegrees: realization.optionalDegrees,
    guideToneDegrees: realization.guideToneDegrees,
    limitations: realization.limitations,
    spelledPitchNames: realization.spelledPitchNames,
    pitchClasses: realization.pitchClasses,
    bass: result.value.bass,
    warnings: result.value.warnings,
  };
}

function executeCustomInputCase(
  state: ObservationState,
  row: CustomCase,
  input: CustomChordSpec,
): ReturnType<typeof customSemanticView> {
  const before = canonicalJson(input);
  const result = resolver(state, input);
  checkSame(state, result.ok, true, `${row.id} success`);
  checkSame(state, canonicalJson(input), before, `${row.id} source unchanged`);
  const view = customSemanticView(result);
  checkEqual(
    state,
    Object.fromEntries(
      Object.entries(customFixture.sharedExpected.resolvedChordMetadata).map(
        ([key]) => [key, Reflect.get(view, key)],
      ),
    ),
    customFixture.sharedExpected.resolvedChordMetadata,
    `${row.id} metadata`,
  );
  for (const key of [
    "kind",
    "id",
    "formulaRuleId",
    "degrees",
    "requiredDegrees",
    "optionalDegrees",
    "guideToneDegrees",
    "limitations",
    "warnings",
  ] as const) {
    checkEqual(
      state,
      Reflect.get(view, key),
      Reflect.get(customFixture.sharedExpected, key),
      `${row.id} shared ${key}`,
    );
  }
  for (const key of [
    "spelledPitchNames",
    "pitchClasses",
    "bass",
    "degrees",
    "requiredDegrees",
    "optionalDegrees",
    "guideToneDegrees",
    "formulaRuleId",
  ]) {
    if (row.expected[key] !== undefined) {
      checkEqual(state, Reflect.get(view, key), row.expected[key], `${row.id} ${key}`);
    }
  }
  if (typeof row.expected["length"] === "number") {
    checkSame(
      state,
      view.spelledPitchNames.length,
      row.expected["length"],
      `${row.id} length`,
    );
  }
  if (row.expected["duplicatesPreserved"] === true) {
    checkTrue(
      state,
      new Set(view.spelledPitchNames.map((pitch) => canonicalJson(pitch))).size <
        view.spelledPitchNames.length,
      `${row.id} duplicates`,
    );
  }
  if (row.expected["orderPreserved"] === true) {
    checkEqual(state, view.spelledPitchNames, input.pitchNames, `${row.id} order`);
  }
  if (row.expected["enharmonicSpellingsRemainDistinct"] === true) {
    checkTrue(
      state,
      view.spelledPitchNames[0].step !== view.spelledPitchNames[1]?.step &&
        view.pitchClasses[0] === view.pitchClasses[1],
      `${row.id} enharmonic distinction`,
    );
  }
  if (row.expected["bassExcludedFromPitchNames"] === true && view.bass !== null) {
    checkSame(
      state,
      view.spelledPitchNames.some(
        (pitch) => pitch.step === view.bass?.step && pitch.alter === view.bass.alter,
      ),
      false,
      `${row.id} bass separation`,
    );
  }
  if (row.expected["spellingServiceInvoked"] === false) {
    const withEvidence = evidenceResolver(state, input);
    checkSame(state, withEvidence.evidence.spellingAttempts, 0, `${row.id} no speller`);
  }
  checkTrue(state, Object.isFrozen(result.value), `${row.id} frozen value`);
  checkTrue(state, Object.isFrozen(view.spelledPitchNames), `${row.id} frozen pitches`);
  return view;
}

function executeCustomTranspositionCase(
  state: ObservationState,
  row: CustomCase,
): void {
  if (
    row.sourceInput === undefined ||
    row.transposedInput === undefined ||
    row.transpositionRecipe === undefined
  ) {
    throw new Error(`${row.id} incomplete transposition recipe`);
  }
  const sourceView = executeCustomInputCase(state, row, row.sourceInput);
  const targetView = executeCustomInputCase(state, row, row.transposedInput);
  checkEqual(
    state,
    sourceView.pitchClasses,
    row.expected["sourcePitchClasses"],
    `${row.id} source projections`,
  );
  checkEqual(
    state,
    targetView.pitchClasses,
    row.expected["transposedPitchClasses"],
    `${row.id} target projections`,
  );
  checkEqual(state, sourceView.bass, row.expected["sourceBass"], `${row.id} source bass`);
  checkEqual(
    state,
    targetView.bass,
    row.expected["transposedBass"],
    `${row.id} target bass`,
  );
  const inverse = record(row.transpositionRecipe["inverse"], `${row.id} inverse`) as Readonly<{
    diatonicSteps: number;
    semitones: number;
  }>;
  const restoredPitches = row.transposedInput.pitchNames.map((pitch) =>
    independentlyTransposePitch(pitch, inverse),
  );
  const restoredBass =
    row.transposedInput.bass === null
      ? null
      : independentlyTransposePitch(row.transposedInput.bass, inverse);
  checkEqual(
    state,
    restoredPitches,
    row.sourceInput.pitchNames,
    `${row.id} inverse pitches`,
  );
  checkEqual(state, restoredBass, row.sourceInput.bass, `${row.id} inverse bass`);
  checkSame(
    state,
    restoredPitches.length,
    row.expected["tupleLength"],
    `${row.id} tuple length`,
  );
  observe(state, row.id, { sourceView, targetView, restoredPitches, restoredBass });
}

function executeCustomCases(state: ObservationState): void {
  checkSame(state, customFixture.cases.length, 9, "custom inventory");
  for (const row of customFixture.cases) {
    if (row.id === "T1-CUSTOM-006") {
      const base = customFixture.cases.find(({ id }) => id === "T1-CUSTOM-005")?.input;
      if (base === undefined || row.materializationRecipe === undefined) {
        throw new Error("custom limit recipe missing");
      }
      const append = record(
        row.materializationRecipe["append"],
        "custom limit append",
      ) as SpelledPitchClass;
      state.domainConstructorExecutions += 1;
      const result = makeCustomChordSpec({
        ...base,
        pitchNames: [...base.pitchNames, append],
      });
      checkEqual(
        state,
        result,
        { ok: false, refusal: row.expected["domainRefusal"] },
        `${row.id} domain refusal`,
      );
      checkSame(state, row.expected["t1Invoked"], false, `${row.id} T1 not invoked`);
      observe(state, row.id, result);
      continue;
    }
    if (row.id === "T1-CUSTOM-009") {
      executeCustomTranspositionCase(state, row);
      continue;
    }
    if (row.input === undefined) throw new Error(`${row.id} input missing`);
    const view = executeCustomInputCase(state, row, row.input);
    observe(state, row.id, view);
  }
}

function executeSpellingOperationState(state: ObservationState): void {
  const operation = operationStateRecord("T1-OPSTATE-001");
  const expected = record(operation["expected"], "T1-OPSTATE-001 expected");
  const successInput = {
    root: { step: "C", alter: 0 } as const,
    degree: { number: 3, alter: 0 } as const,
  };
  const refusalInput = {
    root: { step: "C", alter: 2 } as const,
    degree: { number: 9, alter: 1 } as const,
  };
  const before = canonicalJson({ successInput, refusalInput });
  const success = speller(state, successInput.root, successInput.degree);
  const refusal = speller(state, refusalInput.root, refusalInput.degree);
  checkSame(state, success.ok, true, "T1-OPSTATE-001 success");
  checkSame(state, refusal.ok, false, "T1-OPSTATE-001 refusal");
  if (!success.ok || refusal.ok) throw new Error("T1-OPSTATE-001 branch mismatch");
  const view = {
    stateMutation:
      canonicalJson({ successInput, refusalInput }) === before ? "none" : "changed",
    deterministicWorkBound: "one spelling attempt",
    deterministicMemoryBound: "one result or one refusal",
    successPath: "value",
    refusalPath: refusal.refusal.path,
  };
  checkEqual(state, view, expected, "T1-OPSTATE-001 operation view");
  observe(state, "T1-OPSTATE-001", { successInput, success, refusalInput, refusal, view });
}

function executeParsedOperationState(state: ObservationState): void {
  const operation = operationStateRecord("T1-OPSTATE-002");
  const expected = record(operation["expected"], "T1-OPSTATE-002 expected");
  const source = parseSource(state, "C7alt");
  const before = canonicalJson(source);
  const actual = evidenceResolver(state, source);
  checkSame(state, actual.result.ok, true, "T1-OPSTATE-002 success");
  if (!actual.result.ok) throw new Error("T1-OPSTATE-002 unexpectedly refused");
  const realizationsProduced = actual.evidence.realizationsProduced;
  const formulaPhasesPerRealization =
    realizationsProduced === 0
      ? 0
      : actual.evidence.formulaPhaseTransitions / realizationsProduced;
  const trackedRecords =
    actual.evidence.inputDegreeRecordsVisited +
    actual.evidence.candidateDegreesObserved +
    actual.evidence.realizationsProduced +
    actual.evidence.spellingAttempts +
    actual.evidence.degreesProduced +
    actual.evidence.warningsProduced;
  const view = {
    stateMutation: canonicalJson(source) === before ? "none" : "changed",
    partialCommit: canonicalJson(source) !== before,
    formulaPhasesPerRealization,
    phaseTransitions: actual.evidence.formulaPhaseTransitions,
    inputDegreeRecordsVisited: actual.evidence.inputDegreeRecordsVisited,
    candidateInsertionsObserved: actual.evidence.candidateDegreesObserved,
    peakCandidateDegreeRecords: actual.evidence.peakCandidateDegreeRecords,
    trackedRecords,
  };
  checkSame(state, view.stateMutation, expected["stateMutation"], "parsed state");
  checkSame(state, view.partialCommit, expected["partialCommit"], "parsed commit");
  checkTrue(
    state,
    view.formulaPhasesPerRealization <= Number(expected["maximumFormulaPhases"]),
    "parsed formula phase bound",
  );
  checkTrue(
    state,
    view.phaseTransitions <= Number(expected["maximumPhaseTransitions"]),
    "parsed transition bound",
  );
  checkTrue(
    state,
    view.inputDegreeRecordsVisited <=
      Number(expected["maximumInputDegreeRecordsVisited"]),
    "parsed input record bound",
  );
  checkTrue(
    state,
    view.candidateInsertionsObserved <= Number(expected["maximumCandidateInsertions"]),
    "parsed candidate bound",
  );
  checkTrue(
    state,
    view.peakCandidateDegreeRecords <=
      Number(expected["maximumPeakCandidateDegreeRecords"]),
    "parsed peak bound",
  );
  checkTrue(
    state,
    view.trackedRecords <= Number(expected["maximumTrackedRecords"]),
    "parsed tracked record bound",
  );
  observe(state, "T1-OPSTATE-002", {
    result: actual.result,
    evidence: actual.evidence,
    verifiedBounds: expected,
    view,
  });
}

function executeCustomOperationState(state: ObservationState): void {
  const operation = operationStateRecord("T1-OPSTATE-004");
  const expected = record(operation["expected"], "T1-OPSTATE-004 expected");
  const input = customFixture.cases.find(({ id }) => id === "T1-CUSTOM-005")?.input;
  if (input === undefined) throw new Error("T1-OPSTATE-004 max custom input missing");
  const before = canonicalJson(input);
  const result = resolver(state, input);
  const realization = result.value.realizations[0];
  const view = {
    maximumInputPitches: input.pitchNames.length,
    maximumProjectionRecords: realization.spelledPitchNames.length,
    realizations: result.value.realizations.length,
    warnings: result.value.warnings.length,
    stateMutation: canonicalJson(input) === before ? "none" : "changed",
  };
  checkEqual(state, view, expected, "T1-OPSTATE-004 operation view");
  checkEqual(
    state,
    realization.spelledPitchNames,
    input.pitchNames,
    "T1-OPSTATE-004 exact projection",
  );
  observe(state, "T1-OPSTATE-004", { result, view });
}

function executePublicationBoundaryOperationState(state: ObservationState): void {
  const operation = operationStateRecord("T1-OPSTATE-006");
  const expected = record(operation["expected"], "T1-OPSTATE-006 expected");
  const progressionDocument = Object.freeze({ revision: 1, chordIds: [] as const });
  const documentBefore = canonicalJson(progressionDocument);
  const sourceAtRevisionOne = parseSource(state, "C");
  const resultAtRevisionOne = resolver(state, sourceAtRevisionOne);
  const sourceAtRevisionTwo = parseSource(state, "Cm");
  const resultAtRevisionTwo = resolver(state, sourceAtRevisionTwo);
  checkSame(state, resultAtRevisionOne.ok, true, "T1-OPSTATE-006 revision one");
  checkSame(state, resultAtRevisionTwo.ok, true, "T1-OPSTATE-006 revision two");
  if (!resultAtRevisionOne.ok || !resultAtRevisionTwo.ok) {
    throw new Error("T1-OPSTATE-006 source revision refused");
  }
  const sourceRevisionChanged =
    canonicalJson(sourceAtRevisionOne) !== canonicalJson(sourceAtRevisionTwo);
  const resultChanged =
    canonicalJson(resultAtRevisionOne.value) !== canonicalJson(resultAtRevisionTwo.value);
  checkTrue(state, sourceRevisionChanged, "T1-OPSTATE-006 source changed");
  checkTrue(state, resultChanged, "T1-OPSTATE-006 result changed");
  const view = {
    t1ImplementationRequired:
      resolveChord.length > 1 || "document" in resultAtRevisionOne.value,
    t1ResultMayBeReusedAsAuthorityAfterSourceRevision:
      !sourceRevisionChanged || !resultChanged,
    partialCommit: canonicalJson(progressionDocument) !== documentBefore,
  };
  checkEqual(state, view, expected, "T1-OPSTATE-006 boundary view");
  observe(state, "T1-OPSTATE-006", {
    sourceAtRevisionOne,
    resultAtRevisionOne,
    sourceAtRevisionTwo,
    resultAtRevisionTwo,
    progressionDocument,
    view,
  });
}

function executeOperationStateCase(
  state: ObservationState,
  id: "T1-OPSTATE-007" | "T1-OPSTATE-010",
): void {
  const operation = operationStateFixture.cases.find((row) => row.id === id);
  if (operation === undefined) throw new Error(`missing ${id}`);
  const observations: unknown[] = [];
  const rows = [...(operation.rows ?? []), ...(operation.reasonPrecedenceRows ?? [])];
  for (const [index, row] of rows.entries()) {
    const source = materializeRecipe(state, row.inputRecipe);
    const before = canonicalJson(source);
    const result = resolver(state, source);
    const expectedRefusal = row.expectedRefusal ?? row.expectedWinner;
    if (expectedRefusal === undefined) throw new Error(`${id} row has no refusal`);
    checkEqual(
      state,
      result,
      { ok: false, refusal: expectedRefusal },
      `${id} row ${index.toString()}`,
    );
    checkSame(state, canonicalJson(source), before, `${id} row input ${index.toString()}`);
    let firstExcessProof: unknown = null;
    if (id === "T1-OPSTATE-007" && index < (operation.rows?.length ?? 0)) {
      const rawRow = record(row, `${id} first-excess row ${index.toString()}`);
      const field = rawRow["field"];
      const firstExcessIndex = rawRow["firstExcessIndex"];
      if (typeof field !== "string" || typeof firstExcessIndex !== "number") {
        throw new TypeError(`${id} first-excess metadata missing`);
      }
      const recipe = record(rawRow["inputRecipe"], `${id} ${field} recipe`);
      const sourceItems = recipe[field];
      if (!Array.isArray(sourceItems) || sourceItems.length === 0) {
        throw new TypeError(`${id} ${field} collection missing`);
      }
      const sourceItemsUnknown = sourceItems as readonly unknown[];
      const tailSeed: unknown = sourceItemsUnknown[0];
      const tailedRecipe = {
        ...structuredClone(recipe),
        [field]: [
          ...structuredClone(sourceItemsUnknown),
          structuredClone(tailSeed),
          structuredClone(tailSeed),
          structuredClone(tailSeed),
        ],
      };
      const tailedSource = materializeRecipe(state, tailedRecipe);
      const tailed = evidenceResolver(state, tailedSource);
      checkEqual(
        state,
        tailed.result,
        { ok: false, refusal: expectedRefusal },
        `${id} ${field} tailed refusal`,
      );
      const expectedEvidence = {
        inputDegreeRecordsVisited: firstExcessIndex + 1,
        formulaPhaseTransitions: 0,
        candidateDegreesObserved: 0,
        duplicateDegreesCanonicalized: 0,
        realizationsProduced: 0,
        spellingAttempts: 0,
        degreesProduced: 0,
        warningsProduced: 0,
        peakCandidateDegreeRecords: 0,
        termination: "formula-refusal",
      };
      checkEqual(
        state,
        tailed.evidence,
        expectedEvidence,
        `${id} ${field} exact first-refusal work`,
      );
      firstExcessProof = {
        field,
        firstExcessIndex,
        totalSourceItems: (tailedRecipe[field] as readonly unknown[]).length,
        result: tailed.result,
        evidence: tailed.evidence,
      };
    }
    observations.push({ id: row.id ?? index, result, firstExcessProof });
  }
  observe(state, id, observations);
}

function operationStateRecord(id: string): JsonRecord {
  const value = operationStateFixture.cases.find((row) => row.id === id);
  if (value === undefined) throw new Error(`missing ${id}`);
  return record(value, id);
}

function executeAlteredOperationState(state: ObservationState): void {
  const operation = operationStateRecord("T1-OPSTATE-003");
  const expected = record(operation["expected"], "T1-OPSTATE-003 expected");
  const source = parseSource(state, "C7alt");
  const actual = evidenceResolver(state, source);
  checkSame(state, actual.result.ok, true, "T1-OPSTATE-003 success");
  if (!actual.result.ok) throw new Error("altered operation-state refused");
  const value = actual.result.value;
  const view = {
    realizations: value.realizations.length,
    semanticOutputRecords: value.realizations.reduce(
      (sum, realization) => sum + realization.degrees.length,
      0,
    ),
    spellingAttempts: actual.evidence.spellingAttempts,
    warnings: value.warnings.length,
    chosenVariant: null,
    variantOrder: value.realizations.map(({ id }) => id),
  };
  checkSame(state, view.realizations, expected["realizations"], "altered realization count");
  checkTrue(
    state,
    view.semanticOutputRecords <= Number(expected["semanticOutputRecordsMaximum"]),
    "altered output bound",
  );
  checkTrue(
    state,
    view.spellingAttempts <= Number(expected["spellingAttemptsMaximum"]),
    "altered spelling bound",
  );
  checkTrue(
    state,
    view.warnings <= Number(expected["warningsMaximum"]),
    "altered warning bound",
  );
  checkEqual(state, view.chosenVariant, expected["chosenVariant"], "no chosen variant");
  checkEqual(state, view.variantOrder, expected["variantOrder"], "altered order");
  checkSame(
    state,
    value.realizations.length,
    formulaFixture.alteredDominantVariants.length,
    "altered authority inventory",
  );
  for (const [orderedIndex, realization] of value.realizations.entries()) {
    const authority = formulaFixture.alteredDominantVariants[orderedIndex];
    if (authority === undefined) throw new Error("altered variant authority missing");
    const semanticView = realizationView(realization);
    checkSame(state, realization.id, authority.id, `${authority.id} stable ID`);
    checkEqual(state, semanticView.degrees, authority.degrees, `${authority.id} degrees`);
    checkEqual(state, semanticView.required, authority.required, `${authority.id} required`);
    checkEqual(state, semanticView.optional, authority.optional, `${authority.id} optional`);
    checkEqual(state, semanticView.guide, authority.guide, `${authority.id} guide`);
    observe(state, authority.id, {
      orderedIndex,
      variantOrder: view.variantOrder,
      realization: semanticView,
    });
  }
  observe(state, "T1-OPSTATE-003", view);
}

function executeRefusalOperationState(state: ObservationState): void {
  const operation = operationStateRecord("T1-OPSTATE-005");
  const expected = record(operation["expected"], "T1-OPSTATE-005 expected");
  const source = materializeRecipe(state, {
    base: "Cm(maj7)",
    extensions: [{ number: 9, alter: 0 }],
  });
  const before = canonicalJson(source);
  const result = resolver(state, source);
  checkSame(state, result.ok, false, "T1-OPSTATE-005 refusal");
  const view = {
    stateMutation: canonicalJson(source) === before ? "none" : "changed",
    partialValue: "value" in result,
    partialRealizations:
      "value" in result && "realizations" in record(result.value, "partial value"),
    partialWarnings:
      "value" in result && "warnings" in record(result.value, "partial value"),
    sourceUnchanged: canonicalJson(source) === before,
    altSelection: "value" in result && "chosenVariant" in record(result.value, "partial value"),
  };
  checkEqual(state, view, expected, "T1-OPSTATE-005 transactional view");
  observe(state, "T1-OPSTATE-005", { result, view });
}

function refusalPath(
  state: ObservationState,
  recipe: JsonRecord,
): readonly (string | number)[] {
  const result = resolver(state, materializeRecipe(state, recipe));
  checkSame(state, result.ok, false, "path-matrix refusal");
  if (result.ok) throw new Error("path-matrix recipe succeeded");
  checkEqual(state, Object.keys(result), ["ok", "refusal"], "path transactional shape");
  return result.refusal.path;
}

function executePathOperationState(state: ObservationState): void {
  const operation = operationStateRecord("T1-OPSTATE-008");
  const rows = operation["rows"];
  if (!Array.isArray(rows) || rows.length !== 12) {
    throw new Error("T1-OPSTATE-008 rows missing");
  }
  const actualPaths: readonly (readonly (string | number)[])[] = [
    refusalPath(state, { base: "C", sixth: { number: 6, alter: -1 } }),
    refusalPath(state, { base: "C7", extensions: [{ number: 7, alter: 0 }] }),
    refusalPath(state, { base: "C", additions: [{ number: 7, alter: 0 }] }),
    refusalPath(state, {
      base: "C7",
      alterations: [{ number: 3, alter: -1 }],
    }),
    refusalPath(state, { base: "C7", omissions: [7] }),
    refusalPath(state, { base: "C", colorPolicy: "altered-dominant" }),
    refusalPath(state, {
      base: "C7",
      alterations: [
        { number: 5, alter: -1 },
        { number: 5, alter: 1 },
      ],
    }),
    refusalPath(state, {
      base: "Cdim",
      additions: [2, 3, 4, 6, 9, 11, 13].map((number) => ({
        number,
        alter: 0,
      })),
      alterations: [
        { number: 5, alter: 1 },
        { number: 9, alter: -1 },
        { number: 9, alter: 1 },
        { number: 11, alter: -1 },
        { number: 11, alter: 1 },
        { number: 13, alter: -1 },
        { number: 13, alter: 1 },
      ],
    }),
    (() => {
      const result = speller(
        state,
        { step: "C", alter: 2 },
        { number: 9, alter: 1 },
      );
      checkSame(state, result.ok, false, "direct spelling path refusal");
      return result.ok ? [] : result.refusal.path;
    })(),
    refusalPath(state, {
      kind: "parsed",
      sourceText: "D##m(add3)",
      root: { step: "D", alter: 2 },
      triad: "minor",
      sixth: null,
      seventh: null,
      extensions: [],
      additions: [{ number: 3, alter: 0 }],
      alterations: [],
      omissions: [],
      bass: null,
      colorPolicy: "none",
    }),
    refusalPath(state, {
      kind: "parsed",
      sourceText: "C##7#9",
      root: { step: "C", alter: 2 },
      triad: "major",
      sixth: null,
      seventh: "minor",
      extensions: [],
      additions: [],
      alterations: [{ number: 9, alter: 1 }],
      omissions: [],
      bass: null,
      colorPolicy: "none",
    }),
    refusalPath(state, {
      kind: "parsed",
      sourceText: "E##",
      root: { step: "E", alter: 2 },
      triad: "major",
      sixth: null,
      seventh: null,
      extensions: [],
      additions: [],
      alterations: [],
      omissions: [],
      bass: null,
      colorPolicy: "none",
    }),
  ];

  for (const [index, value] of rows.entries()) {
    const row = record(value, `T1-OPSTATE-008 row ${index.toString()}`);
    const path = actualPaths[index];
    if (path === undefined) throw new Error("missing actual path");
    if (row["expectedPath"] !== undefined) {
      checkEqual(state, path, row["expectedPath"], `path row ${index.toString()}`);
    } else if (row["expectedPathTemplate"] !== undefined) {
      const template = row["expectedPathTemplate"];
      if (!Array.isArray(template)) throw new TypeError("path template must be array");
      checkSame(state, path[0], template[0], `path template ${index.toString()}`);
      checkTrue(
        state,
        typeof path[1] === "number" && Number.isSafeInteger(path[1]),
        `path index ${index.toString()}`,
      );
    } else if (row["expectedPathEquals"] === "leftPath") {
      checkEqual(state, path, ["alterations", 0], "conflict left path");
    }
    checkSame(
      state,
      path.some((item) => item === "realizations"),
      false,
      `path ${index.toString()} is source-owned`,
    );
  }
  observe(state, "T1-OPSTATE-008", actualPaths);
}

function materializeEvidenceRecipe(
  state: ObservationState,
  recipe: JsonRecord,
): ChordSpec | CustomChordSpec {
  const customCaseRef = recipe["customCaseRef"];
  if (typeof customCaseRef === "string") {
    const [caseId] = customCaseRef.split(".");
    const input = customFixture.cases.find(({ id }) => id === caseId)?.input;
    if (input === undefined) throw new Error(`missing ${customCaseRef}`);
    return input;
  }
  return materializeRecipe(state, recipe);
}

function executeEvidenceOperationState(state: ObservationState): void {
  const operation = operationStateRecord("T1-OPSTATE-009");
  const rows = operation["rows"];
  if (!Array.isArray(rows)) throw new Error("T1-OPSTATE-009 rows missing");
  const observations: unknown[] = [];
  for (const value of rows) {
    const row = record(value, "T1-OPSTATE-009 row");
    const id = row["id"];
    if (typeof id !== "string") throw new TypeError("evidence row ID missing");
    const source = materializeEvidenceRecipe(
      state,
      record(row["inputRecipe"], `${id} recipe`),
    );
    const actual = evidenceResolver(state, source);
    checkEqual(state, actual.evidence, row["expectedEvidence"], `${id} evidence`);
    if (row["expectedRefusal"] !== undefined) {
      checkEqual(
        state,
        actual.result,
        { ok: false, refusal: row["expectedRefusal"] },
        `${id} refusal`,
      );
    } else {
      const resultRef = row["expectedResultRef"];
      if (typeof resultRef !== "string") throw new TypeError(`${id} result ref missing`);
      checkTrue(state, state.observed.has(resultRef), `${id} observed ${resultRef}`);
    }
    for (const counter of Object.values(actual.evidence).slice(0, -1)) {
      checkTrue(
        state,
        typeof counter === "number" && Number.isSafeInteger(counter) && counter >= 0,
        `${id} safe counter`,
      );
    }
    observations.push({ id, result: actual.result, evidence: actual.evidence });
  }
  observe(state, "T1-OPSTATE-009", observations);
}

function executeModifierRuleObservations(state: ObservationState): void {
  const exercises = {
    "T1-MODRULE-001": {
      phase: "suspension",
      caseIds: ["T1-LIT-046", "T1-LIT-053", "T1-LIT-055"],
    },
    "T1-MODRULE-002": {
      phase: "structural-alterations",
      caseIds: ["T1-LIT-034", "T1-LIT-035", "T1-LIT-065"],
    },
    "T1-MODRULE-003": {
      phase: "color-alterations",
      caseIds: ["T1-LIT-042", "T1-LIT-044", "T1-LIT-054"],
    },
    "T1-MODRULE-004": {
      phase: "additions",
      caseIds: ["T1-LIT-050", "T1-LIT-053", "T1-LIT-084"],
    },
    "T1-MODRULE-005": {
      phase: "omissions",
      caseIds: ["T1-LIT-052", "T1-LIT-055", "T1-LIT-056"],
    },
    "T1-MODRULE-006": {
      phase: "canonicalization",
      caseIds: ["T1-LIT-079", "T1-LIT-084", "T1-LIT-085"],
    },
    "T1-MODRULE-007": {
      phase: "spelling",
      caseIds: [
        "T1-SPELL-PUBLIC-MATRIX-001",
        "T1-LIT-047",
        "T1-OPSTATE-001",
      ],
    },
    "T1-MODRULE-008": {
      phase: "color-alterations",
      caseIds: ["T1-LIT-045", "T1-LIT-056", "T1-LIT-057", "T1-LIT-058"],
    },
  } as const;
  checkSame(state, formulaFixture.modifierRules.length, 8, "modifier rule inventory");
  checkEqual(
    state,
    formulaFixture.modifierRules.map(({ id }) => id),
    Object.keys(exercises),
    "modifier exercise inventory",
  );
  for (const modifierRule of formulaFixture.modifierRules) {
    const exercise = exercises[modifierRule.id as keyof typeof exercises];
    checkSame(state, modifierRule.phase, exercise.phase, `${modifierRule.id} phase`);
    const runtimeObservations = exercise.caseIds.map((caseId) => {
      const observationDigest = state.observed.get(caseId);
      checkTrue(state, observationDigest !== undefined, `${modifierRule.id} ${caseId}`);
      if (observationDigest === undefined) {
        throw new Error(`${modifierRule.id} runtime observation ${caseId} missing`);
      }
      return { caseId, observationDigest };
    });
    observe(state, modifierRule.id, {
      phase: modifierRule.phase,
      rule: modifierRule.rule,
      runtimeObservations,
    });
  }
}

type FixtureLinkRecord = Readonly<{
  id: string;
  traceIds: readonly string[];
  authorityIds: readonly string[];
}>;

const LINKED_FIXTURE_DOCUMENTS = Object.freeze([
  allRootFixtureValue,
  customFixtureValue,
  formulaFixtureValue,
  lawFixtureValue,
  literalFixtureValue,
  mutationFixtureValue,
  operationStateFixtureValue,
  spellingFixtureValue,
  contractFixtureValue,
] as const);

function fixtureLinkRecords(): ReadonlyMap<string, FixtureLinkRecord> {
  const links = new Map<string, FixtureLinkRecord>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const child of value) visit(child);
      return;
    }
    if (value === null || typeof value !== "object") return;
    const candidate = value as Readonly<Record<string, unknown>>;
    if (
      typeof candidate["id"] === "string" &&
      (Array.isArray(candidate["traceIds"]) || Array.isArray(candidate["authorityIds"]))
    ) {
      const id = candidate["id"];
      if (links.has(id)) throw new Error(`duplicate linked fixture ID ${id}`);
      links.set(id, {
        id,
        traceIds: candidate["traceIds"] === undefined
          ? []
          : stringArray(candidate["traceIds"], `${id}.traceIds`),
        authorityIds: candidate["authorityIds"] === undefined
          ? []
          : stringArray(candidate["authorityIds"], `${id}.authorityIds`),
      });
    }
    for (const child of Object.values(candidate)) visit(child);
  };
  for (const document of LINKED_FIXTURE_DOCUMENTS) visit(document);
  return links;
}

function verifyTraceAndAuthorityCoverage(state: ObservationState) {
  const fixtureLinks = fixtureLinkRecords();
  const traceById = new Map(traceLedger.traces.map((trace) => [trace.id, trace]));
  const authorityById = new Map(
    provenanceLedger.authorities.map((authority) => [authority.id, authority]),
  );
  checkSame(state, traceById.size, 13, "trace row inventory");
  checkSame(state, authorityById.size, 6, "authority row inventory");
  checkEqual(
    state,
    [...authorityById.keys()].sort(),
    [
      "T1-AUTH-DOMAIN",
      "T1-AUTH-FORMULA",
      "T1-AUTH-INDEPENDENCE",
      "T1-AUTH-LEGACY",
      "T1-AUTH-ROLES",
      "T1-AUTH-SPELLING",
    ],
    "authority IDs",
  );

  for (const trace of traceLedger.traces) {
    checkTrue(state, trace.requirement.length > 0, `${trace.id} requirement`);
    checkTrue(state, trace.sourceRefs.length > 0, `${trace.id} sources`);
    checkSame(
      state,
      new Set(trace.caseIds).size,
      trace.caseIds.length,
      `${trace.id} unique cases`,
    );
    checkSame(
      state,
      new Set(trace.mutationControlIds).size,
      trace.mutationControlIds.length,
      `${trace.id} unique controls`,
    );
    for (const caseId of trace.caseIds) {
      const fixtureLink = fixtureLinks.get(caseId);
      checkTrue(state, fixtureLink !== undefined, `${trace.id} fixture ${caseId}`);
      if (fixtureLink === undefined) throw new Error(`${caseId} fixture links missing`);
      checkTrue(
        state,
        fixtureLink.traceIds.includes(trace.id),
        `${trace.id} reciprocal case ${caseId}`,
      );
      checkTrue(state, state.observed.has(caseId), `${trace.id} runtime case ${caseId}`);
    }
    for (const controlId of trace.mutationControlIds) {
      const fixtureLink = fixtureLinks.get(controlId);
      checkTrue(state, fixtureLink !== undefined, `${trace.id} control ${controlId}`);
      if (fixtureLink === undefined) throw new Error(`${controlId} fixture links missing`);
      checkTrue(
        state,
        fixtureLink.traceIds.includes(trace.id),
        `${trace.id} reciprocal control ${controlId}`,
      );
    }
  }

  for (const authority of provenanceLedger.authorities) {
    checkTrue(state, authority.covers.length > 0, `${authority.id} coverage`);
    checkTrue(state, authority.sourceRefs.length > 0, `${authority.id} sources`);
    checkTrue(
      state,
      provenanceLedger.allowedAuthorityClasses.includes(authority.authorityClass),
      `${authority.id} authority class`,
    );
    checkSame(
      state,
      new Set(authority.caseIds).size,
      authority.caseIds.length,
      `${authority.id} unique cases`,
    );
    checkSame(
      state,
      new Set(authority.mutationControlIds).size,
      authority.mutationControlIds.length,
      `${authority.id} unique controls`,
    );
    for (const caseId of authority.caseIds) {
      const fixtureLink = fixtureLinks.get(caseId);
      checkTrue(state, fixtureLink !== undefined, `${authority.id} fixture ${caseId}`);
      if (fixtureLink === undefined) throw new Error(`${caseId} fixture links missing`);
      checkTrue(
        state,
        fixtureLink.authorityIds.includes(authority.id),
        `${authority.id} reciprocal case ${caseId}`,
      );
      checkTrue(state, state.observed.has(caseId), `${authority.id} runtime case ${caseId}`);
    }
    for (const controlId of authority.mutationControlIds) {
      const fixtureLink = fixtureLinks.get(controlId);
      checkTrue(state, fixtureLink !== undefined, `${authority.id} control ${controlId}`);
      if (fixtureLink === undefined) throw new Error(`${controlId} fixture links missing`);
      checkTrue(
        state,
        fixtureLink.authorityIds.includes(authority.id),
        `${authority.id} reciprocal control ${controlId}`,
      );
    }
  }

  for (const fixtureLink of fixtureLinks.values()) {
    for (const traceId of fixtureLink.traceIds) {
      const trace = traceById.get(traceId);
      checkTrue(state, trace !== undefined, `${fixtureLink.id} trace ${traceId}`);
      if (trace === undefined) throw new Error(`${traceId} trace missing`);
      const reciprocalIds = fixtureLink.id.startsWith("T1-MUT-")
        ? trace.mutationControlIds
        : trace.caseIds;
      checkTrue(
        state,
        reciprocalIds.includes(fixtureLink.id),
        `${fixtureLink.id} reciprocal trace ${traceId}`,
      );
    }
    for (const authorityId of fixtureLink.authorityIds) {
      const authority = authorityById.get(authorityId);
      checkTrue(state, authority !== undefined, `${fixtureLink.id} authority ${authorityId}`);
      if (authority === undefined) throw new Error(`${authorityId} authority missing`);
      const reciprocalIds = fixtureLink.id.startsWith("T1-MUT-")
        ? authority.mutationControlIds
        : authority.caseIds;
      checkTrue(
        state,
        reciprocalIds.includes(fixtureLink.id),
        `${fixtureLink.id} reciprocal authority ${authorityId}`,
      );
    }
  }

  const traceCaseIds = [
    ...new Set(traceLedger.traces.flatMap(({ caseIds }) => caseIds)),
  ].sort();
  const traceCasesUnaccounted = traceCaseIds.filter(
    (caseId) => !state.observed.has(caseId),
  );
  checkSame(state, traceCaseIds.length, 229, "trace case inventory");
  checkEqual(state, traceCasesUnaccounted, [], "trace case coverage");
  return {
    traceCaseIds,
    traceCasesObserved: traceCaseIds.length - traceCasesUnaccounted.length,
    traceCasesUnaccounted,
    traceIds: traceLedger.traces.map(({ id }) => id),
    authorityIds: provenanceLedger.authorities.map(({ id }) => id),
    linkedFixtureRecords: fixtureLinks.size,
  };
}

function parsedResolutionSnapshot(
  result: Extract<ParsedResolveChordResult, Readonly<{ ok: true }>>,
) {
  return {
    root: result.value.source.root,
    formulaRuleId: result.value.realizations[0].formulaRuleId,
    realizationIds: result.value.realizations.map(({ id }) => id),
    degrees: result.value.realizations[0].degrees.map(token),
    required: result.value.realizations[0].requiredDegrees.map(token),
    optional: result.value.realizations[0].optionalDegrees.map(token),
    guide: result.value.realizations[0].guideToneDegrees.map(token),
    spelledPitchNames: result.value.realizations[0].spelledPitchNames,
    pitchClasses: result.value.realizations[0].pitchClasses,
    bass: result.value.bass,
    bassExcludedFromMembership: true,
  };
}

function executeLawFourRecipe(state: ObservationState, law: LawCase): unknown {
  if (law.transpositionRecipe === undefined) throw new Error("law four recipe missing");
  const recipe = law.transpositionRecipe;
  const sourceCaseId = recipe["sourceCaseId"];
  if (typeof sourceCaseId !== "string") throw new TypeError("law four source ID");
  const sourceRow = literalFixture.cases.find(({ id }) => id === sourceCaseId);
  if (sourceRow === undefined) throw new Error("law four source row missing");
  const source = materializeLiteralSource(state, sourceRow);
  const interval = record(recipe["interval"], "law four interval") as Readonly<{
    diatonicSteps: number;
    semitones: number;
  }>;
  const inverse = record(recipe["inverse"], "law four inverse") as Readonly<{
    diatonicSteps: number;
    semitones: number;
  }>;
  const transposed: ChordSpec = {
    ...source,
    sourceText: "T1-LAW-004 transposed",
    root: independentlyTransposePitch(source.root, interval),
    bass: source.bass === null ? null : independentlyTransposePitch(source.bass, interval),
  };
  const targetResult = resolver(state, transposed);
  checkSame(state, targetResult.ok, true, "law four target success");
  if (!targetResult.ok) throw new Error("law four target refused");
  const targetSnapshot = parsedResolutionSnapshot(targetResult);
  checkEqual(
    state,
    targetSnapshot,
    recipe["reviewedTargetSnapshot"],
    "law four reviewed target",
  );
  const restored: ChordSpec = {
    ...transposed,
    sourceText: source.sourceText,
    root: independentlyTransposePitch(transposed.root, inverse),
    bass:
      transposed.bass === null
        ? null
        : independentlyTransposePitch(transposed.bass, inverse),
  };
  const inverseResult = resolver(state, restored);
  checkSame(state, inverseResult.ok, true, "law four inverse success");
  if (!inverseResult.ok) throw new Error("law four inverse refused");
  const inverseSnapshot = parsedResolutionSnapshot(inverseResult);
  checkEqual(
    state,
    inverseSnapshot,
    recipe["expectedInverseSnapshot"],
    "law four reviewed inverse",
  );
  return { targetSnapshot, inverseSnapshot };
}

function executeLawFiveRecipe(state: ObservationState, law: LawCase): unknown {
  if (law.transpositionRecipe === undefined) throw new Error("law five recipe missing");
  const recipe = law.transpositionRecipe;
  const degree = record(recipe["degree"], "law five degree") as ChordDegree;
  const rows = recipe["reviewedProjectionRows"];
  if (!Array.isArray(rows)) throw new TypeError("law five rows missing");
  const observations: unknown[] = [];
  for (const [index, value] of rows.entries()) {
    const row = record(value, `law five row ${index.toString()}`);
    const sourceRoot = record(row["sourceRoot"], "law five source") as SpelledPitchClass;
    const targetRoot = record(row["targetRoot"], "law five target") as SpelledPitchClass;
    const source = speller(state, sourceRoot, degree);
    const target = speller(state, targetRoot, degree);
    checkSame(state, source.ok, true, `law five source ${index.toString()}`);
    checkSame(state, target.ok, true, `law five target ${index.toString()}`);
    if (!source.ok || !target.ok) throw new Error("law five spelling refused");
    checkEqual(
      state,
      source.value.spelled,
      row["sourceSpelling"],
      `law five source spelling ${index.toString()}`,
    );
    checkSame(
      state,
      source.value.pitchClass,
      row["sourcePitchClass"],
      `law five source pitch ${index.toString()}`,
    );
    checkEqual(
      state,
      target.value.spelled,
      row["targetSpelling"],
      `law five target spelling ${index.toString()}`,
    );
    checkSame(
      state,
      target.value.pitchClass,
      row["targetPitchClass"],
      `law five target pitch ${index.toString()}`,
    );
    checkSame(
      state,
      target.value.pitchClass,
      asPitchClass(source.value.pitchClass + 7),
      `law five commutes ${index.toString()}`,
    );
    observations.push({ source, target });
  }
  return observations;
}

function executeLaws(state: ObservationState): Readonly<Record<string, string>> {
  checkSame(state, lawFixture.cases.length, 12, "law inventory");
  checkEqual(
    state,
    Object.keys(LAW_SEMANTIC_PREDICATES).sort(),
    lawFixture.cases.map(({ id }) => id).sort(),
    "law semantic predicate registry",
  );
  const lawDigests: Record<string, string> = {};
  const controlIds = new Set(mutationFixture.controls.map(({ id }) => id));
  for (const law of lawFixture.cases) {
    let recipeObservation: unknown = null;
    if (law.id === "T1-LAW-004") recipeObservation = executeLawFourRecipe(state, law);
    if (law.id === "T1-LAW-005") recipeObservation = executeLawFiveRecipe(state, law);
    for (const controlId of law.mutationControlIds) {
      checkTrue(state, controlIds.has(controlId), `${law.id} control ${controlId}`);
    }
    const predicate = LAW_SEMANTIC_PREDICATES[law.id];
    if (predicate === undefined) throw new Error(`${law.id} semantic predicate missing`);
    const semanticPredicate = predicate(state, law);
    checkSame(state, semanticPredicate.passed, true, `${law.id} semantic predicate`);
    const observation = {
      lawId: law.lawId,
      statement: law.statement,
      positiveCaseIds: law.positiveCaseIds,
      nearMissCaseIds: law.nearMissCaseIds,
      transpositionCaseId: law.transpositionCaseId,
      mutationControlIds: law.mutationControlIds,
      recipeObservation,
      semanticPredicate,
    };
    observe(state, law.id, observation);
    lawDigests[law.id] = sha256(observation);
  }

  for (const law of lawFixture.cases) {
    for (const caseId of [
      ...law.positiveCaseIds,
      ...law.nearMissCaseIds,
      law.transpositionCaseId,
    ]) {
      checkTrue(state, state.observed.has(caseId), `${law.id} observed ${caseId}`);
    }
  }
  return lawDigests;
}

function runtimePayload(state: ObservationState, caseId: string): unknown {
  const payload = state.observationPayloads.get(caseId);
  if (payload === undefined) throw new Error(`${caseId} runtime payload missing`);
  return payload;
}

function successfulResolutionValue(
  state: ObservationState,
  caseId: string,
): JsonRecord {
  const result = record(runtimePayload(state, caseId), `${caseId} result`);
  checkSame(state, result["ok"], true, `${caseId} semantic success`);
  return record(result["value"], `${caseId} value`);
}

function semanticRealizations(state: ObservationState, caseId: string): readonly JsonRecord[] {
  const value = successfulResolutionValue(state, caseId);
  const realizations = value["realizations"];
  if (!Array.isArray(realizations)) throw new TypeError(`${caseId} realizations missing`);
  return realizations.map((item, index) =>
    record(item, `${caseId}.realizations[${String(index)}]`));
}

function semanticDegreeTokens(realization: JsonRecord, label: string): readonly string[] {
  const degrees = realization["degrees"];
  if (!Array.isArray(degrees)) throw new TypeError(`${label} degrees missing`);
  return degrees.map((degree, index) =>
    token(record(degree, `${label}.degrees[${String(index)}]`) as ChordDegree));
}

function semanticRoleTokens(
  realization: JsonRecord,
  key: "requiredDegrees" | "optionalDegrees" | "guideToneDegrees",
  label: string,
): readonly string[] {
  const roles = realization[key];
  if (!Array.isArray(roles)) throw new TypeError(`${label}.${key} missing`);
  return roles.map((degree, index) =>
    token(record(degree, `${label}.${key}[${String(index)}]`) as ChordDegree));
}

function degreeFromToken(value: string): ChordDegree {
  const match = /^(bb|b|##|#)?(1|2|3|4|5|6|7|9|11|13)$/.exec(value);
  if (match === null) throw new Error(`invalid degree token ${value}`);
  return {
    number: Number(match[2]) as DegreeNumber,
    alter: match[1] === "bb" ? -2 : match[1] === "b" ? -1 :
      match[1] === "#" ? 1 : match[1] === "##" ? 2 : 0,
  };
}

type LawSemanticPredicate = (
  state: ObservationState,
  law: LawCase,
) => Readonly<{ predicateId: string; passed: true; evidence: unknown }>;

function passedPredicate(
  predicateId: string,
  evidence: unknown,
): ReturnType<LawSemanticPredicate> {
  return { predicateId, passed: true, evidence: canonicalJsonValue(evidence) };
}

const LAW_SEMANTIC_PREDICATES: Readonly<Record<string, LawSemanticPredicate>> = {
  "T1-LAW-001": (state) => {
    const caseIds = ["T1-LIT-012", "T1-LIT-017", "T1-LIT-019", "T1-LIT-020", "T1-LIT-024"];
    const focused = caseIds.map((caseId) => {
      const fixture = literalFixture.cases.find(({ id }) => id === caseId);
      const realization = semanticRealizations(state, caseId)[0];
      if (fixture === undefined || realization === undefined) throw new Error(`${caseId} legacy witness missing`);
      const formulaId = fixture.expected["formulaId"];
      const formula = formulaFixture.rules.find(({ id }) => id === formulaId);
      if (formula === undefined) throw new Error(`${caseId} legacy formula authority missing`);
      const actual = {
        degrees: semanticDegreeTokens(realization, caseId),
        required: semanticRoleTokens(realization, "requiredDegrees", caseId),
        optional: semanticRoleTokens(realization, "optionalDegrees", caseId),
        guide: semanticRoleTokens(realization, "guideToneDegrees", caseId),
        spelledPitchNames: realization["spelledPitchNames"],
        pitchClasses: realization["pitchClasses"],
      };
      for (const key of ["degrees", "required", "optional", "guide"] as const) {
        checkEqual(state, actual[key], formula[key], `${caseId} legacy ${key}`);
      }
      return { caseId, ...actual };
    });
    const matrix = record(runtimePayload(state, "T1-ROOT-MATRIX-001"), "legacy root matrix");
    const cells = matrix["cells"];
    if (!Array.isArray(cells)) throw new TypeError("legacy matrix cells missing");
    const formulaIds = ["T1-FORMULA-012", "T1-FORMULA-017", "T1-FORMULA-019", "T1-FORMULA-020", "T1-FORMULA-024"];
    const allRootCells = cells.filter((value) => formulaIds.includes(String(record(value, "legacy cell")["formulaId"])));
    checkSame(state, allRootCells.length, 60, "five legacy formulas across twelve roots");
    for (const value of allRootCells) {
      const cell = record(value, "legacy matrix cell");
      const formula = formulaFixture.rules.find(({ id }) => id === cell["formulaId"]);
      const root = rootFixture.roots.find(({ id }) => id === cell["rootId"]);
      if (formula === undefined || root === undefined) throw new Error("legacy matrix authority missing");
      checkEqual(state, cell["degrees"], formula.degrees, `${root.id}/${formula.id} degrees`);
      checkEqual(state, cell["required"], formula.required, `${root.id}/${formula.id} required`);
      checkEqual(state, cell["optional"], formula.optional, `${root.id}/${formula.id} optional`);
      checkEqual(state, cell["guide"], formula.guide, `${root.id}/${formula.id} guide`);
      const expectedSpellings = formula.degrees.map((degree) => {
        const expected = independentSpelling(root.spelled, degreeFromToken(degree));
        if (!expected.ok) throw new Error(`${root.id}/${formula.id} refused independently`);
        return expected.value.spelled;
      });
      checkEqual(state, cell["spelledPitchNames"], expectedSpellings, `${root.id}/${formula.id} spellings`);
    }
    const nearMisses = ["T1-LIT-060", "T1-LIT-061"].map((caseId) => {
      const payload = record(runtimePayload(state, caseId), `${caseId} legacy near miss`);
      checkSame(state, payload["ok"], false, `${caseId} remains refusal`);
      return { caseId, payload };
    });
    return passedPredicate("legacy-formula-identities-roles-spellings-all-roots", {
      focused,
      allRootCells,
      nearMisses,
    });
  },
  "T1-LAW-002": (state) => {
    const sharpNine = record(runtimePayload(state, "T1-SPELL-003"), "sharp nine");
    const flatThree = record(runtimePayload(state, "T1-SPELL-004"), "flat three");
    const doubleFlatSeven = record(runtimePayload(state, "T1-SPELL-008"), "bb7");
    const sharpValue = record(sharpNine["value"], "sharp nine value");
    const flatValue = record(flatThree["value"], "flat three value");
    const bbValue = record(doubleFlatSeven["value"], "bb7 value");
    checkEqual(state, sharpValue["degree"], { number: 9, alter: 1 }, "#9 identity");
    checkEqual(state, flatValue["degree"], { number: 3, alter: -1 }, "b3 identity");
    checkSame(state, sharpValue["pitchClass"], flatValue["pitchClass"], "enharmonic projection");
    checkEqual(state, bbValue["degree"], { number: 7, alter: -2 }, "bb7 identity");
    const naturalSix = speller(state, { step: "C", alter: 0 }, { number: 6, alter: 0 });
    checkSame(state, naturalSix.ok, true, "natural six success");
    if (!naturalSix.ok) throw new Error("natural six unexpectedly refused");
    checkSame(state, naturalSix.value.pitchClass, bbValue["pitchClass"], "bb7 and 6 enharmonic projection");
    checkEqual(state, naturalSix.value.degree, { number: 6, alter: 0 }, "natural six identity");
    checkTrue(state, canonicalJson(naturalSix.value.degree) !== canonicalJson(bbValue["degree"]), "bb7 differs from natural six");
    checkTrue(state, canonicalJson(naturalSix.value.spelled) !== canonicalJson(bbValue["spelled"]), "bb7 spelling differs from natural six");
    const customFixtureRow = customFixture.cases.find(({ id }) => id === "T1-CUSTOM-003");
    if (customFixtureRow?.input === undefined) throw new Error("T1-CUSTOM-003 fixture missing");
    const custom = record(runtimePayload(state, "T1-CUSTOM-003"), "T1-CUSTOM-003 degree identity near miss");
    checkEqual(state, custom["spelledPitchNames"], customFixtureRow.input.pitchNames, "custom enharmonic spellings retained");
    checkEqual(state, custom["pitchClasses"], customFixtureRow.expected["pitchClasses"], "custom enharmonic projections exact");
    const customPitches = custom["spelledPitchNames"] as readonly unknown[];
    const customClasses = custom["pitchClasses"] as readonly unknown[];
    checkSame(state, customClasses[0], customClasses[1], "custom near miss shares pitch class");
    checkTrue(state, canonicalJson(customPitches[0]) !== canonicalJson(customPitches[1]), "custom near miss retains distinct spellings");
    const transpositionFixture = spellingFixture.cases.find(({ id }) => id === "T1-SPELL-005");
    if (transpositionFixture === undefined) throw new Error("T1-SPELL-005 fixture missing");
    const transposition = record(runtimePayload(state, "T1-SPELL-005"), "T1-SPELL-005 degree identity transposition");
    const transpositionValue = record(transposition["value"], "T1-SPELL-005 value");
    checkEqual(state, transpositionValue["degree"], transpositionFixture.degree, "transposed degree identity exact");
    checkEqual(state, transpositionValue["spelled"], transpositionFixture.expected["spelled"], "transposed spelling exact");
    checkSame(state, transpositionValue["pitchClass"], transpositionFixture.expected["pitchClass"], "transposed projection exact");
    return passedPredicate("degree-number-plus-alteration-identity", {
      sharpNine: sharpValue,
      flatThree: flatValue,
      doubleFlatSeven: bbValue,
      naturalSix: naturalSix.value,
      custom,
      transposition: transpositionValue,
    });
  },
  "T1-LAW-003": (state) => {
    const successCaseIds = [
      "T1-SPELL-001",
      "T1-SPELL-002",
      "T1-SPELL-009",
      "T1-SPELL-010",
      "T1-SPELL-013",
    ];
    const successes = successCaseIds.map((caseId) => {
      const fixture = spellingFixture.cases.find(({ id }) => id === caseId);
      const payload = record(runtimePayload(state, caseId), `${caseId} directed spelling`);
      const value = record(payload["value"], `${caseId} spelling value`);
      if (fixture === undefined) throw new Error(`${caseId} spelling fixture missing`);
      const independent = independentSpelling(fixture.root, fixture.degree);
      checkSame(state, independent.ok, true, `${caseId} independently spellable`);
      if (!independent.ok) throw new Error(`${caseId} independent refusal`);
      checkEqual(state, value["spelled"], independent.value.spelled, `${caseId} exact directed target`);
      checkSame(state, value["pitchClass"], independent.value.pitchClass, `${caseId} exact projection`);
      checkEqual(state, value["degree"], fixture.degree, `${caseId} degree retained`);
      return {
        caseId,
        directedTargetStep: independent.value.spelled.step,
        requiredAccidental: independent.value.spelled.alter,
        payload,
      };
    });
    const refusals = ["T1-SPELL-011", "T1-SPELL-012"].map((caseId) => {
      const result = record(runtimePayload(state, caseId), `${caseId} refusal`);
      checkSame(state, result["ok"], false, `${caseId} triple accidental refusal`);
      const refusal = record(result["refusal"], `${caseId} refusal body`);
      checkSame(state, refusal["code"], "theory.spelling_accidental_out_of_range", `${caseId} refusal code`);
      checkEqual(state, refusal["path"], ["degree"], `${caseId} source path`);
      checkTrue(state, refusal["requiredAlteration"] === 3 || refusal["requiredAlteration"] === -3, `${caseId} exact triple accidental`);
      return { caseId, refusal };
    });
    return passedPredicate("directed-letter-and-accidental-before-projection", {
      successes,
      refusals,
    });
  },
  "T1-LAW-004": (state, law) => {
    const recipe = executeLawFourRecipe(state, law);
    const secondPositiveFixture = literalFixture.cases.find(({ id }) => id === "T1-LIT-048");
    if (secondPositiveFixture === undefined) throw new Error("T1-LIT-048 fixture missing");
    const secondPositiveValue = successfulResolutionValue(state, "T1-LIT-048");
    const secondPositiveSource = record(secondPositiveValue["source"], "T1-LIT-048 source");
    const secondPositiveRealization = semanticRealizations(state, "T1-LIT-048")[0];
    if (secondPositiveRealization === undefined) throw new Error("T1-LIT-048 realization missing");
    const secondPositiveDegrees = secondPositiveRealization["degrees"] as readonly unknown[];
    const seventhIndex = secondPositiveDegrees.findIndex((degree) => degreeMatches(degree, "b7"));
    checkTrue(state, seventhIndex >= 0, "T1-LIT-048 seventh retained");
    checkEqual(state, secondPositiveSource["root"], secondPositiveFixture.expected["root"] ?? { step: "D", alter: -1 }, "T1-LIT-048 root exact");
    checkEqual(state, secondPositiveValue["bass"], secondPositiveFixture.expected["bass"], "T1-LIT-048 bass exact");
    checkEqual(state, (secondPositiveRealization["spelledPitchNames"] as readonly unknown[])[seventhIndex], secondPositiveFixture.expected["degreeSevenSpelling"], "T1-LIT-048 seventh spelling exact");

    const nearMisses = ["T1-SPELL-003", "T1-SPELL-004"].map((caseId) => {
      const fixture = spellingFixture.cases.find(({ id }) => id === caseId);
      if (fixture === undefined) throw new Error(`${caseId} transpose near-miss fixture missing`);
      const payload = record(runtimePayload(state, caseId), `${caseId} transpose near miss`);
      const value = record(payload["value"], `${caseId} transpose near-miss value`);
      checkEqual(state, value["degree"], fixture.degree, `${caseId} degree identity retained`);
      checkEqual(state, value["spelled"], fixture.expected["spelled"], `${caseId} spelling exact`);
      checkSame(state, value["pitchClass"], fixture.expected["pitchClass"], `${caseId} projection exact`);
      return { caseId, value };
    });
    checkSame(state, record(nearMisses[0]?.value, "sharp-nine near miss")["pitchClass"], record(nearMisses[1]?.value, "flat-three near miss")["pitchClass"], "transpose near misses share projection only");
    checkTrue(state, canonicalJson(record(nearMisses[0]?.value, "sharp-nine near miss")["degree"]) !== canonicalJson(record(nearMisses[1]?.value, "flat-three near miss")["degree"]), "transpose near misses retain different identities");

    const rootMatrix = record(runtimePayload(state, "T1-ROOT-MATRIX-001"), "law four root matrix");
    const rootCells = (rootMatrix["cells"] as readonly unknown[]).map((cell) => record(cell, "law four root cell")).filter((cell) => cell["formulaId"] === "T1-FORMULA-012");
    checkSame(state, rootCells.length, rootFixture.roots.length, "law four major-seventh root variations");
    for (const cell of rootCells) {
      const root = rootFixture.roots.find(({ id }) => id === cell["rootId"]);
      if (root === undefined) throw new Error("law four root variation authority missing");
      checkSame(state, cell["formulaRuleId"], "seventh-major", `${root.id} inverse family`);
      checkEqual(state, cell["degrees"], ["1", "3", "5", "7"], `${root.id} inverse degrees`);
      checkEqual(state, (cell["spelledPitchNames"] as readonly unknown[])[0], root.spelled, `${root.id} root spelling`);
    }
    return passedPredicate("spelled-transpose-exact-inverse", {
      recipe,
      secondPositive: {
        source: secondPositiveSource,
        bass: secondPositiveValue["bass"],
        seventhSpelling: (secondPositiveRealization["spelledPitchNames"] as readonly unknown[])[seventhIndex],
      },
      nearMisses,
      rootCells,
    });
  },
  "T1-LAW-005": (state, law) => {
    const rows = executeLawFiveRecipe(state, law);
    const transpositionFixture = spellingFixture.cases.find(({ id }) => id === "T1-SPELL-013");
    if (transpositionFixture === undefined) throw new Error("T1-SPELL-013 fixture missing");
    const transpositionPayload = record(runtimePayload(state, "T1-SPELL-013"), "T1-SPELL-013 projection witness");
    const transpositionValue = record(transpositionPayload["value"], "T1-SPELL-013 projection value");
    checkEqual(state, transpositionValue["degree"], transpositionFixture.degree, "T1-SPELL-013 degree exact");
    checkEqual(state, transpositionValue["spelled"], transpositionFixture.expected["spelled"], "T1-SPELL-013 spelling exact");
    checkSame(state, transpositionValue["pitchClass"], transpositionFixture.expected["pitchClass"], "T1-SPELL-013 projection exact");

    const rootMatrix = record(runtimePayload(state, "T1-ROOT-MATRIX-001"), "law five root matrix");
    const matrixCells = rootMatrix["cells"];
    if (!Array.isArray(matrixCells)) throw new TypeError("law five root matrix cells missing");
    const matrixProjectionChecks = matrixCells.map((rawCell) => {
      const cell = record(rawCell, "law five projection cell");
      const root = rootFixture.roots.find(({ id }) => id === cell["rootId"]);
      const formula = formulaFixture.rules.find(({ id }) => id === cell["formulaId"]);
      if (root === undefined || formula === undefined) throw new Error("law five projection authority missing");
      const spellings = cell["spelledPitchNames"] as readonly unknown[];
      const pitchClasses = cell["pitchClasses"] as readonly unknown[];
      checkSame(state, spellings.length, formula.degrees.length, `${root.id}/${formula.id} spelling arity`);
      checkSame(state, pitchClasses.length, formula.degrees.length, `${root.id}/${formula.id} projection arity`);
      formula.degrees.forEach((degree, index) => {
        const expected = independentSpelling(root.spelled, degreeFromToken(degree));
        checkSame(state, expected.ok, true, `${root.id}/${formula.id}/${degree} directed spelling`);
        if (!expected.ok) throw new Error(`${root.id}/${formula.id}/${degree} independent refusal`);
        checkEqual(state, spellings[index], expected.value.spelled, `${root.id}/${formula.id}/${degree} exact spelling`);
        checkSame(state, pitchClasses[index], expected.value.pitchClass, `${root.id}/${formula.id}/${degree} exact projection`);
      });
      return { rootId: root.id, formulaId: formula.id, spellings, pitchClasses };
    });
    checkSame(state, matrixProjectionChecks.length, rootFixture.matrixCase.expectedCellCount, "law five all root projections");

    const nearMisses = ["T1-SPELL-011", "T1-SPELL-012"].map((caseId) => {
      const fixture = spellingFixture.cases.find(({ id }) => id === caseId);
      if (fixture === undefined) throw new Error(`${caseId} projection near-miss fixture missing`);
      const payload = record(runtimePayload(state, caseId), `${caseId} projection near miss`);
      checkEqual(state, payload, { ok: false, refusal: fixture.expected["refusal"] }, `${caseId} exact overflow refusal`);
      const refusal = record(payload["refusal"], `${caseId} projection refusal`);
      checkTrue(state, refusal["requiredAlteration"] === -3 || refusal["requiredAlteration"] === 3, `${caseId} unclamped directed requirement`);
      return { caseId, refusal };
    });
    return passedPredicate("projection-commutes-modulo-twelve", {
      rows,
      transposition: transpositionValue,
      matrixProjectionChecks,
      nearMisses,
    });
  },
  "T1-LAW-006": (state) => {
    const cases = ["T1-LIT-045", "T1-LIT-056", "T1-LIT-057", "T1-LIT-058", "T1-LIT-087", "T1-LIT-081"];
    const expectedIds = [
      "alt-b9-b5",
      "alt-b9-sharp5",
      "alt-sharp9-b5",
      "alt-sharp9-sharp5",
    ];
    const evidence = cases.map((caseId) => {
      const realizations = semanticRealizations(state, caseId);
      const ids = realizations.map((realization) => realization["id"]);
      checkEqual(state, ids, expectedIds, `${caseId} altered IDs`);
      const fixture = literalFixture.cases.find(({ id }) => id === caseId);
      if (fixture === undefined) throw new Error(`${caseId} altered fixture missing`);
      const degreesById = Object.fromEntries(realizations.map((row) => [
        String(row["id"]),
        semanticDegreeTokens(row, caseId),
      ]));
      const requiredById = Object.fromEntries(realizations.map((row) => [
        String(row["id"]),
        semanticRoleTokens(row, "requiredDegrees", caseId),
      ]));
      const explicitById = fixture.expected["realizationsById"] ?? fixture.expected["degreesById"];
      if (explicitById !== undefined) {
        for (const id of expectedIds) {
          const rawExpected = record(explicitById, `${caseId} expected variants`)[id];
          const expectedRow = Array.isArray(rawExpected) ? null : record(rawExpected, `${caseId}/${id} expected`);
          const expectedDegrees = expectedRow?.["degrees"] ?? rawExpected;
          checkEqual(state, degreesById[id], expectedDegrees, `${caseId}/${id} exact degrees`);
          if (expectedRow?.["required"] !== undefined) {
            checkEqual(state, requiredById[id], expectedRow["required"], `${caseId}/${id} exact required`);
          }
        }
      } else if (caseId === "T1-LIT-045") {
        formulaFixture.alteredDominantVariants.forEach((variant) => {
          checkEqual(state, degreesById[variant.id], variant.degrees, `${caseId}/${variant.id} base degrees`);
          checkEqual(state, requiredById[variant.id], variant.required, `${caseId}/${variant.id} base required`);
        });
      } else {
        const additions = caseId === "T1-LIT-057" ? ["11"] : ["#11", "b13"];
        for (const id of expectedIds) {
          checkTrue(state, additions.every((degree) => degreesById[id]?.includes(degree)), `${caseId}/${id} additions retained`);
          checkTrue(state, additions.every((degree) => requiredById[id]?.includes(degree)), `${caseId}/${id} additions required`);
        }
      }
      return { caseId, ids, degreesById, requiredById };
    });
    const nearMisses = ["T1-LIT-066", "T1-LIT-067"].map((caseId) => {
      const fixture = literalFixture.cases.find(({ id }) => id === caseId);
      if (fixture === undefined) throw new Error(`${caseId} altered near-miss fixture missing`);
      const payload = record(runtimePayload(state, caseId), `${caseId} altered near miss`);
      checkEqual(state, payload, { ok: false, refusal: fixture.expected["refusal"] }, `${caseId} exact altered-policy refusal`);
      const refusal = record(payload["refusal"], `${caseId} altered refusal`);
      checkSame(state, refusal["code"], "theory.color_policy_invalid", `${caseId} policy code`);
      checkSame(state, refusal["ruleId"], "altered-dominant", `${caseId} policy rule`);
      return { caseId, refusal };
    });
    return passedPredicate("altered-plural-stable-order", { evidence, nearMisses });
  },
  "T1-LAW-007": (state) => {
    const caseIds = [
      "T1-LIT-044",
      "T1-LIT-046",
      "T1-LIT-053",
      "T1-LIT-054",
      "T1-LIT-059",
      "T1-LIT-079",
      "T1-LIT-087",
    ];
    const evidence = caseIds.map((caseId) => {
      const realizations = semanticRealizations(state, caseId);
      return { caseId, degrees: realizations.map((row) => semanticDegreeTokens(row, caseId)) };
    });
    const degrees = (caseId: string) => evidence.find((row) => row.caseId === caseId)?.degrees[0] ?? [];
    checkTrue(state, degrees("T1-LIT-046").includes("4") && !degrees("T1-LIT-046").includes("3"), "suspension replaces base third");
    checkTrue(state, degrees("T1-LIT-053").includes("3"), "addition runs after suspension");
    checkTrue(state, ["b9", "#11", "13"].every((degree) => degrees("T1-LIT-044").includes(degree)) && !degrees("T1-LIT-044").includes("9") && !degrees("T1-LIT-044").includes("11"), "color alterations replace extension closure");
    checkTrue(state, degrees("T1-LIT-054").includes("b9") && degrees("T1-LIT-054").includes("9"), "later addition coexists with color alteration");
    checkTrue(state, !degrees("T1-LIT-059").includes("3"), "omission runs after additions");
    checkSame(state, degrees("T1-LIT-079").filter((degree) => degree === "9").length, 1, "canonicalization merges exact duplicate");
    checkTrue(state, degrees("T1-LIT-087").includes("9") && (degrees("T1-LIT-087").includes("b9") || degrees("T1-LIT-087").includes("#9")), "alt color survives later natural addition");
    const transposed = semanticDegreeTokens(semanticRealizations(state, "T1-LIT-083")[0] ?? {}, "T1-LIT-083");
    checkEqual(state, transposed, degrees("T1-LIT-054"), "phase result invariant across reviewed root variation");
    const conflictIds = ["T1-LIT-063", "T1-LIT-064", "T1-LIT-065", "T1-LIT-077", "T1-LIT-078"];
    const conflicts = conflictIds.map((caseId) => {
      const actual = record(runtimePayload(state, caseId), `${caseId} phase conflict`);
      const fixture = literalFixture.cases.find(({ id }) => id === caseId);
      if (fixture === undefined) throw new Error(`${caseId} phase conflict fixture missing`);
      checkEqual(state, actual, { ok: false, refusal: fixture.expected["refusal"] }, `${caseId} exact phase conflict`);
      return { caseId, refusal: actual["refusal"] };
    });
    return passedPredicate("all-modifier-phases-and-conflict-near-misses", { evidence, transposed, conflicts });
  },
  "T1-LAW-008": (state) => {
    const caseIds = [
      "T1-LIT-010",
      "T1-LIT-016",
      "T1-LIT-018",
      "T1-LIT-032",
      "T1-LIT-053",
      "T1-LIT-055",
      "T1-LIT-059",
    ];
    const evidence = caseIds.map((caseId) => {
      const realization = semanticRealizations(state, caseId)[0];
      if (realization === undefined) throw new Error(`${caseId} realization missing`);
      const degrees = semanticDegreeTokens(realization, caseId);
      const required = semanticRoleTokens(realization, "requiredDegrees", caseId);
      const optional = semanticRoleTokens(realization, "optionalDegrees", caseId);
      const guide = semanticRoleTokens(realization, "guideToneDegrees", caseId);
      checkEqual(state, [...required, ...optional].sort(), [...degrees].sort(), `${caseId} role cover`);
      checkEqual(state, required.filter((item) => optional.includes(item)), [], `${caseId} disjoint roles`);
      checkTrue(state, guide.every((item) => required.includes(item)), `${caseId} guides required`);
      checkEqual(state, required, degrees.filter((item) => required.includes(item)), `${caseId} required order`);
      checkEqual(state, optional, degrees.filter((item) => optional.includes(item)), `${caseId} optional order`);
      checkEqual(state, guide, degrees.filter((item) => guide.includes(item)), `${caseId} guide order`);
      return { caseId, degrees, required, optional, guide };
    });
    const addThree = evidence.find(({ caseId }) => caseId === "T1-LIT-053");
    checkSame(state, addThree?.guide.includes("3"), false, "generic add3 not guide");
    const rootMatrix = record(runtimePayload(state, "T1-ROOT-MATRIX-001"), "role root matrix");
    const rawCells = rootMatrix["cells"];
    if (!Array.isArray(rawCells)) throw new TypeError("role root matrix cells missing");
    const matrixPartitions = rawCells.map((rawCell) => {
      const cell = record(rawCell, "role matrix cell");
      const degrees = stringArray(cell["degrees"], "role matrix degrees");
      const required = stringArray(cell["required"], "role matrix required");
      const optional = stringArray(cell["optional"], "role matrix optional");
      const guide = stringArray(cell["guide"], "role matrix guide");
      const label = `${String(cell["rootId"])}/${String(cell["formulaId"])}`;
      checkEqual(state, [...required, ...optional].sort(), [...degrees].sort(), `${label} role cover`);
      checkEqual(state, required.filter((item) => optional.includes(item)), [], `${label} disjoint roles`);
      checkTrue(state, guide.every((item) => required.includes(item)), `${label} guides required`);
      checkEqual(state, required, degrees.filter((item) => required.includes(item)), `${label} required order`);
      checkEqual(state, optional, degrees.filter((item) => optional.includes(item)), `${label} optional order`);
      checkEqual(state, guide, degrees.filter((item) => guide.includes(item)), `${label} guide order`);
      return { rootId: cell["rootId"], formulaId: cell["formulaId"], degrees, required, optional, guide };
    });
    checkSame(state, matrixPartitions.length, rootFixture.matrixCase.expectedCellCount, "all root role partitions");
    return passedPredicate("ordered-role-partition", { evidence, matrixPartitions });
  },
  "T1-LAW-009": (state) => {
    const removed = ["T1-LIT-052", "T1-LIT-056", "T1-LIT-059"].map((caseId) => {
      const omittedNumber = caseId === "T1-LIT-059" ? 3 : 5;
      const realizations = semanticRealizations(state, caseId);
      const degreeRecords = realizations.map((realization) => realization["degrees"]);
      checkTrue(state, degreeRecords.every((items) => Array.isArray(items) && items.every((item) => record(item, `${caseId} degree`)["number"] !== omittedNumber)), `${caseId} removes numeric degree ${String(omittedNumber)}`);
      const warnings = successfulResolutionValue(state, caseId)["warnings"];
      checkEqual(state, warnings, [], `${caseId} present omission emits zero warnings`);
      return { caseId, omittedNumber, degreeRecords, warnings };
    });
    const warningValue = successfulResolutionValue(state, "T1-LIT-055");
    const warnings = warningValue["warnings"];
    checkEqual(state, warnings, [{
      code: "theory.omission_absent",
      message: "The requested third omission had no matching degree to remove.",
      path: ["omissions", 0],
      degreeNumber: 3,
    }], "absent omission exact one source warning");
    const invalid = record(runtimePayload(state, "T1-LIT-064"), "invalid omission near miss");
    checkEqual(state, invalid, { ok: false, refusal: literalFixture.cases.find(({ id }) => id === "T1-LIT-064")?.expected["refusal"] }, "invalid omission remains typed refusal");
    const transposed = successfulResolutionValue(state, "T1-LIT-082");
    checkEqual(state, record((transposed["realizations"] as readonly unknown[])[0], "transposed omission")["degrees"], record((successfulResolutionValue(state, "T1-LIT-052")["realizations"] as readonly unknown[])[0], "source omission")["degrees"], "omission degree identities transpose unchanged");
    return passedPredicate("numeric-omission-all-members-and-exact-warning", { removed, warnings, invalid, transposed });
  },
  "T1-LAW-010": (state) => {
    const parsedCases = ["T1-LIT-047", "T1-LIT-048", "T1-LIT-049"].map((caseId) => {
      const value = successfulResolutionValue(state, caseId);
      checkEqual(state, value["bass"], record(value["source"], `${caseId} source`)["bass"], `${caseId} bass preserved`);
      const fixture = literalFixture.cases.find(({ id }) => id === caseId);
      if (fixture?.sourceSymbol === undefined) throw new Error(`${caseId} slash source missing`);
      const unslashedText = fixture.sourceSymbol.slice(0, fixture.sourceSymbol.lastIndexOf("/"));
      const unslashedSource = parseSource(state, unslashedText);
      const unslashedResult = resolver(state, unslashedSource);
      checkSame(state, unslashedResult.ok, true, `${caseId} unslashed success`);
      if (!unslashedResult.ok) throw new Error(`${caseId} unslashed refusal`);
      const slashed = record((value["realizations"] as readonly unknown[])[0], `${caseId} slashed realization`);
      const unslashed = unslashedResult.value.realizations[0];
      checkSame(state, slashed["formulaRuleId"], unslashed.formulaRuleId, `${caseId} slash formula invariant`);
      checkEqual(state, slashed["degrees"], unslashed.degrees, `${caseId} slash degree invariant`);
      checkEqual(state, slashed["requiredDegrees"], unslashed.requiredDegrees, `${caseId} slash required invariant`);
      checkEqual(state, slashed["optionalDegrees"], unslashed.optionalDegrees, `${caseId} slash optional invariant`);
      checkEqual(state, slashed["guideToneDegrees"], unslashed.guideToneDegrees, `${caseId} slash guide invariant`);
      checkEqual(state, slashed["spelledPitchNames"], unslashed.spelledPitchNames, `${caseId} slash spelling invariant`);
      return {
        caseId,
        bass: value["bass"],
        realizationDegrees: semanticRealizations(state, caseId).map((row) => semanticDegreeTokens(row, caseId)),
        unslashedText,
      };
    });
    const custom = record(runtimePayload(state, "T1-CUSTOM-004"), "custom slash");
    checkTrue(state, custom["bass"] !== null, "custom slash bass preserved");
    checkEqual(state, custom["spelledPitchNames"], customFixture.cases.find(({ id }) => id === "T1-CUSTOM-004")?.input?.pitchNames, "custom slash membership exact");
    checkSame(state, (custom["spelledPitchNames"] as readonly unknown[]).some((pitch) => canonicalJson(pitch) === canonicalJson(custom["bass"])), false, "custom slash bass excluded from membership");
    const noBassFixture = customFixture.cases.find(({ id }) => id === "T1-CUSTOM-001");
    if (noBassFixture?.input === undefined) throw new Error("T1-CUSTOM-001 slash near-miss fixture missing");
    const noBass = record(runtimePayload(state, "T1-CUSTOM-001"), "T1-CUSTOM-001 slash near miss");
    checkSame(state, noBass["bass"], null, "custom near miss retains explicit no-bass state");
    checkEqual(state, noBass["spelledPitchNames"], noBassFixture.input.pitchNames, "custom near miss membership exact");
    checkEqual(state, noBass["pitchClasses"], noBassFixture.expected["pitchClasses"], "custom near miss projection exact");

    const transposeLaw = record(runtimePayload(state, "T1-LAW-004"), "slash transposition law");
    const transposeRecipe = record(transposeLaw["recipeObservation"], "slash transposition recipe");
    const targetSnapshot = record(transposeRecipe["targetSnapshot"], "slash target snapshot");
    const inverseSnapshot = record(transposeRecipe["inverseSnapshot"], "slash inverse snapshot");
    const lawFour = lawFixture.cases.find(({ id }) => id === "T1-LAW-004");
    if (lawFour?.transpositionRecipe === undefined) throw new Error("T1-LAW-004 slash recipe missing");
    checkEqual(state, targetSnapshot, lawFour.transpositionRecipe["reviewedTargetSnapshot"], "transposed slash target exact");
    checkEqual(state, inverseSnapshot, lawFour.transpositionRecipe["expectedInverseSnapshot"], "inverse slash target exact");
    checkTrue(state, canonicalJson(targetSnapshot["bass"]) !== canonicalJson(inverseSnapshot["bass"]), "slash bass participates in spelled transposition");
    checkSame(state, targetSnapshot["bassExcludedFromMembership"], true, "transposed bass stays outside membership");
    checkSame(state, inverseSnapshot["bassExcludedFromMembership"], true, "inverse bass stays outside membership");
    return passedPredicate("slash-bass-separate-fact", {
      parsedCases,
      custom,
      noBass,
      transposition: { targetSnapshot, inverseSnapshot },
    });
  },
  "T1-LAW-011": (state) => {
    const cases = ["T1-CUSTOM-002", "T1-CUSTOM-003", "T1-CUSTOM-004", "T1-CUSTOM-005", "T1-CUSTOM-008"];
    const evidence = cases.map((caseId) => {
      const payload = record(runtimePayload(state, caseId), `${caseId} custom`);
      checkSame(state, payload["degrees"], null, `${caseId} null degrees`);
      checkSame(state, payload["requiredDegrees"], null, `${caseId} null required`);
      checkSame(state, payload["optionalDegrees"], null, `${caseId} null optional`);
      checkSame(state, payload["guideToneDegrees"], null, `${caseId} null guide`);
      checkEqual(
        state,
        payload["limitations"],
        ["custom.no_degree_analysis", "custom.no_auto_voicing"],
        `${caseId} limitations`,
      );
      const fixture = customFixture.cases.find(({ id }) => id === caseId);
      if (fixture?.input === undefined) throw new Error(`${caseId} custom input missing`);
      checkEqual(state, payload["spelledPitchNames"], fixture.input.pitchNames, `${caseId} exact source order and spelling`);
      const expectedProjection = fixture.input.pitchNames.map((pitch) => asPitchClass(NATURAL_SEMITONES[pitch.step] + pitch.alter));
      checkEqual(state, payload["pitchClasses"], expectedProjection, `${caseId} exact projection`);
      checkEqual(state, payload["bass"], fixture.input.bass, `${caseId} exact bass`);
      if (caseId === "T1-CUSTOM-002" || caseId === "T1-CUSTOM-005") {
        checkTrue(state, new Set(fixture.input.pitchNames.map(canonicalJson)).size < fixture.input.pitchNames.length, `${caseId} duplicate source witness`);
        checkSame(state, (payload["spelledPitchNames"] as readonly unknown[]).length, fixture.input.pitchNames.length, `${caseId} duplicates retained`);
      }
      if (caseId === "T1-CUSTOM-003") {
        checkSame(state, (payload["pitchClasses"] as readonly unknown[])[0], (payload["pitchClasses"] as readonly unknown[])[1], `${caseId} equal projection retained twice`);
        checkTrue(state, canonicalJson((payload["spelledPitchNames"] as readonly unknown[])[0]) !== canonicalJson((payload["spelledPitchNames"] as readonly unknown[])[1]), `${caseId} enharmonic spellings distinct`);
      }
      return { caseId, sourcePitchNames: fixture.input.pitchNames, payload };
    });
    const limitFixture = customFixture.cases.find(({ id }) => id === "T1-CUSTOM-006");
    if (limitFixture === undefined) throw new Error("T1-CUSTOM-006 fixture missing");
    const limitNearMiss = record(runtimePayload(state, "T1-CUSTOM-006"), "T1-CUSTOM-006 limit near miss");
    checkEqual(state, limitNearMiss, { ok: false, refusal: limitFixture.expected["domainRefusal"] }, "custom limit refuses before projection");

    const familiarFixture = customFixture.cases.find(({ id }) => id === "T1-CUSTOM-007");
    if (familiarFixture?.input === undefined) throw new Error("T1-CUSTOM-007 fixture missing");
    const familiarNearMiss = record(runtimePayload(state, "T1-CUSTOM-007"), "T1-CUSTOM-007 familiar-label near miss");
    checkSame(state, familiarNearMiss["formulaRuleId"], "custom", "familiar custom label does not select formula");
    checkSame(state, familiarNearMiss["degrees"], null, "familiar custom label has no degrees");
    checkSame(state, familiarNearMiss["requiredDegrees"], null, "familiar custom label has no required roles");
    checkSame(state, familiarNearMiss["optionalDegrees"], null, "familiar custom label has no optional roles");
    checkSame(state, familiarNearMiss["guideToneDegrees"], null, "familiar custom label has no guide roles");
    checkEqual(state, familiarNearMiss["spelledPitchNames"], familiarFixture.input.pitchNames, "familiar custom spelling exact");
    checkEqual(state, familiarNearMiss["pitchClasses"], familiarFixture.expected["pitchClasses"], "familiar custom projection exact");

    const transpositionFixture = customFixture.cases.find(({ id }) => id === "T1-CUSTOM-009");
    if (transpositionFixture?.sourceInput === undefined || transpositionFixture.transposedInput === undefined) {
      throw new Error("T1-CUSTOM-009 transposition fixture missing");
    }
    const transposition = record(runtimePayload(state, "T1-CUSTOM-009"), "T1-CUSTOM-009 transposition");
    const sourceView = record(transposition["sourceView"], "T1-CUSTOM-009 source view");
    const targetView = record(transposition["targetView"], "T1-CUSTOM-009 target view");
    checkEqual(state, sourceView["spelledPitchNames"], transpositionFixture.sourceInput.pitchNames, "custom transpose source order exact");
    checkEqual(state, targetView["spelledPitchNames"], transpositionFixture.transposedInput.pitchNames, "custom transpose target order exact");
    checkEqual(state, sourceView["pitchClasses"], transpositionFixture.expected["sourcePitchClasses"], "custom transpose source projection exact");
    checkEqual(state, targetView["pitchClasses"], transpositionFixture.expected["transposedPitchClasses"], "custom transpose target projection exact");
    checkEqual(state, transposition["restoredPitches"], transpositionFixture.sourceInput.pitchNames, "custom inverse restores ordered pitches");
    checkEqual(state, transposition["restoredBass"], transpositionFixture.sourceInput.bass, "custom inverse restores bass");
    const duplicateIndices = transpositionFixture.expected["duplicatesPreservedAtIndices"] as readonly number[];
    checkEqual(state, duplicateIndices.map((index) => (sourceView["spelledPitchNames"] as readonly unknown[])[index]), duplicateIndices.map((index) => transpositionFixture.sourceInput?.pitchNames[index]), "custom duplicate positions retained");
    return passedPredicate("custom-exact-literal-projection", {
      evidence,
      nearMisses: { limitNearMiss, familiarNearMiss },
      transposition,
    });
  },
  "T1-LAW-012": (state, law) => {
    const refusalIds = law.positiveCaseIds;
    const refusals = refusalIds.map((caseId) => {
      const payload = record(runtimePayload(state, caseId), `${caseId} refusal`);
      checkSame(state, payload["ok"], false, `${caseId} refusal branch`);
      checkEqual(state, Object.keys(payload), ["ok", "refusal"], `${caseId} no partial output`);
      let sourceUnchanged: boolean;
      if (caseId.startsWith("T1-LIT-")) {
        const fixture = literalFixture.cases.find(({ id }) => id === caseId);
        if (fixture === undefined) throw new Error(`${caseId} refusal fixture missing`);
        const source = materializeLiteralSource(state, fixture);
        const before = canonicalJson(source);
        resolver(state, source);
        sourceUnchanged = canonicalJson(source) === before;
      } else {
        const fixture = spellingFixture.cases.find(({ id }) => id === caseId);
        if (fixture === undefined) throw new Error(`${caseId} spelling refusal fixture missing`);
        const before = canonicalJson({ root: fixture.root, degree: fixture.degree });
        speller(state, fixture.root, fixture.degree);
        sourceUnchanged = canonicalJson({ root: fixture.root, degree: fixture.degree }) === before;
      }
      checkSame(state, sourceUnchanged, true, `${caseId} source unchanged after refusal`);
      return { caseId, payload, sourceUnchanged };
    });
    const nearMisses = law.nearMissCaseIds.map((caseId) => {
      const payload = record(runtimePayload(state, caseId), `${caseId} near miss`);
      checkSame(state, payload["ok"], true, `${caseId} accepted near miss`);
      return { caseId, payload };
    });
    return passedPredicate("transactional-refusal-shape", { refusals, nearMisses });
  },
};

function buildLawProofRecords(state: ObservationState) {
  return lawFixture.cases.map((law) => {
    const lawPayload = record(runtimePayload(state, law.id), `${law.id} observation`);
    const semanticPredicate = record(
      lawPayload["semanticPredicate"],
      `${law.id} semantic predicate`,
    );
    checkSame(state, semanticPredicate["passed"], true, `${law.id} predicate passed`);
    const preimage = {
      lawCaseId: law.id,
      lawId: law.lawId,
      statement: law.statement,
      producer: OBSERVATION_PRODUCER,
      lawObservationDigest: observationRecord(state, law.id).observationDigest,
      semanticPredicate,
      semanticPredicateDigest: sha256(semanticPredicate),
      positive: law.positiveCaseIds.map((caseId) => {
        const runtime = observationRecord(state, caseId);
        return { caseId, observationDigest: runtime.observationDigest };
      }),
      nearMiss: law.nearMissCaseIds.map((caseId) => {
        const runtime = observationRecord(state, caseId);
        return { caseId, observationDigest: runtime.observationDigest };
      }),
      transposition: (() => {
        const runtime = observationRecord(state, law.transpositionCaseId);
        return {
          caseId: law.transpositionCaseId,
          observationDigest: runtime.observationDigest,
        };
      })(),
      mutationControlIds: law.mutationControlIds,
    };
    checkTrue(state, preimage.positive.length > 0, `${law.id} positive semantics`);
    checkTrue(state, preimage.nearMiss.length > 0, `${law.id} near-miss semantics`);
    checkTrue(
      state,
      preimage.transposition.observationDigest.length === 64,
      `${law.id} transposition semantics`,
    );
    return { ...preimage, lawProofDigest: sha256(preimage) };
  });
}

function buildTraceProofRecords(state: ObservationState) {
  return traceLedger.traces.map((trace) => {
    const preimage = {
      traceId: trace.id,
      requirement: trace.requirement,
      sourceRefs: trace.sourceRefs,
      producer: OBSERVATION_PRODUCER,
      cases: trace.caseIds.map((caseId) => {
        const runtime = observationRecord(state, caseId);
        return { caseId, observationDigest: runtime.observationDigest };
      }),
      mutationControlIds: trace.mutationControlIds,
    };
    return { ...preimage, traceProofDigest: sha256(preimage) };
  });
}

function buildAuthorityProofRecords(state: ObservationState) {
  return provenanceLedger.authorities.map((authority) => {
    const preimage = {
      authorityId: authority.id,
      authorityClass: authority.authorityClass,
      sourceKind: authority.sourceKind,
      reviewState: authority.reviewState,
      sourceRefs: authority.sourceRefs,
      covers: authority.covers,
      producer: OBSERVATION_PRODUCER,
      cases: authority.caseIds.map((caseId) => {
        const runtime = observationRecord(state, caseId);
        return { caseId, observationDigest: runtime.observationDigest };
      }),
      mutationControlIds: authority.mutationControlIds,
    };
    return { ...preimage, authorityProofDigest: sha256(preimage) };
  });
}

function newState(): ObservationState {
  return {
    assertions: 0,
    parserExecutions: 0,
    resolverExecutions: 0,
    evidenceResolverExecutions: 0,
    spellerExecutions: 0,
    domainConstructorExecutions: 0,
    observed: new Map(),
    observationPayloads: new Map(),
  };
}

function executeHarness() {
  const state = newState();
  const formulaMatrix = executeFormulaMatrix(state);
  const familyStateMatrix = executeFamilyStateMatrix(state);
  executeFocusedSpellingCases(state);
  const publicSpellingMatrix = executePublicSpellingMatrix(state);
  executeCustomCases(state);
  executeAllLiteralCases(state);
  executeSpellingOperationState(state);
  executeParsedOperationState(state);
  executeAlteredOperationState(state);
  executeCustomOperationState(state);
  executeRefusalOperationState(state);
  executePublicationBoundaryOperationState(state);
  executeOperationStateCase(state, "T1-OPSTATE-007");
  executePathOperationState(state);
  executeEvidenceOperationState(state);
  executeOperationStateCase(state, "T1-OPSTATE-010");
  executeModifierRuleObservations(state);
  const lawDigests = executeLaws(state);
  const traceCoverage = verifyTraceAndAuthorityCoverage(state);
  const observedCaseIds = [...state.observed.keys()].sort();
  const observationRecords = observedCaseIds.map((caseId) =>
    observationRecord(state, caseId));
  const observationDigests = Object.fromEntries(
    observationRecords.map(({ caseId, observationDigest }) => [
      caseId,
      observationDigest,
    ]),
  );
  const lawProofRecords = buildLawProofRecords(state);
  const traceProofRecords = buildTraceProofRecords(state);
  const authorityProofRecords = buildAuthorityProofRecords(state);
  return {
    state,
    formulaMatrix,
    familyStateMatrix,
    publicSpellingMatrix,
    lawDigests,
    traceCoverage,
    observedCaseIds,
    observationRecords,
    observationDigests,
    observationInventoryDigest: sha256(observationRecords),
    lawProofRecords,
    traceProofRecords,
    authorityProofRecords,
  };
}

function signObservation<Payload extends JsonRecord>(payload: Payload) {
  return { ...payload, semanticDigest: sha256(payload) };
}

type SemanticOperatorSpec = Readonly<{
  controlId: string;
  algorithm: string;
  parameters: JsonRecord;
}>;

const operatorSpec = (
  controlId: string,
  algorithm: string,
  parameters: JsonRecord = {},
): SemanticOperatorSpec => ({ controlId, algorithm, parameters });

/**
 * These are executable transformations, not before/after answer literals. Each
 * transformation consumes the canonical runtime payload emitted above and
 * changes only a named semantic surface. The independent fixture assertions
 * have already accepted that runtime payload before any counterfactual runs.
 */
const SEMANTIC_OPERATOR_REGISTRY = Object.freeze([
  operatorSpec("T1-MUT-001", "rewrite-degree-identity", { from: "3", to: "b3", matrixFormulaId: "T1-FORMULA-001" }),
  operatorSpec("T1-MUT-002", "rewrite-degree-identity", { from: "b3", to: "3", matrixFormulaId: "T1-FORMULA-002" }),
  operatorSpec("T1-MUT-003", "move-degree-role", { degree: "5", from: "optional", to: "required" }),
  operatorSpec("T1-MUT-004", "rewrite-degree-identity", { from: "7", to: "b7" }),
  operatorSpec("T1-MUT-005", "remove-degree", { degrees: ["b7"], matrixFormulaId: "T1-FORMULA-020" }),
  operatorSpec("T1-MUT-006", "remove-degree", { degrees: ["9", "11"], matrixFormulaId: "T1-FORMULA-024" }),
  operatorSpec("T1-MUT-007", "rewrite-degree-identity", { from: "6", to: "b6", matrixFormulaId: "T1-FORMULA-009" }),
  operatorSpec("T1-MUT-008", "append-semantic-degree", { degree: "b7", role: "guide" }),
  operatorSpec("T1-MUT-009", "rewrite-degree-identity", { from: "bb7", to: "6" }),
  operatorSpec("T1-MUT-010", "move-degree-role", { degree: "b5", from: "required", to: "optional" }),
  operatorSpec("T1-MUT-011", "rewrite-degree-identity", { from: "#5", to: "5" }),
  operatorSpec("T1-MUT-012", "retain-suspension-third"),
  operatorSpec("T1-MUT-013", "collapse-equal-pitch-class-records"),
  operatorSpec("T1-MUT-014", "rewrite-degree-identity", { from: "#9", to: "b3" }),
  operatorSpec("T1-MUT-015", "rewrite-degree-identity", { from: "bb7", to: "6" }),
  operatorSpec("T1-MUT-016", "reuse-root-letter"),
  operatorSpec("T1-MUT-017", "pitch-class-first-enharmonic"),
  operatorSpec("T1-MUT-018", "accept-accidental-overflow", { clamp: false }),
  operatorSpec("T1-MUT-019", "accept-accidental-overflow", { clamp: true }),
  operatorSpec("T1-MUT-020", "drop-diatonic-transposition"),
  operatorSpec("T1-MUT-021", "leave-slash-bass-untransposed"),
  operatorSpec("T1-MUT-022", "keep-first-altered-realization"),
  operatorSpec("T1-MUT-023", "reverse-altered-realization-order"),
  operatorSpec("T1-MUT-024", "append-semantic-degree", { degree: "5", role: "optional" }),
  operatorSpec("T1-MUT-025", "merge-equal-altered-realizations"),
  operatorSpec("T1-MUT-026", "remove-explicit-add-three"),
  operatorSpec("T1-MUT-027", "append-semantic-degree", { degree: "5", role: "optional" }),
  operatorSpec("T1-MUT-028", "retain-extension-natural-closure", { degrees: ["9", "11"] }),
  operatorSpec("T1-MUT-029", "retain-one-omitted-alteration", { degree: "#5" }),
  operatorSpec("T1-MUT-030", "addition-implies-extension-closure"),
  operatorSpec("T1-MUT-031", "move-highest-extension-to-optional"),
  operatorSpec("T1-MUT-032", "move-identity-fifth-to-optional"),
  operatorSpec("T1-MUT-033", "append-guide-degree", { degree: "3" }),
  operatorSpec("T1-MUT-034", "suppress-omission-warning"),
  operatorSpec("T1-MUT-035", "emit-warning-for-present-omission"),
  operatorSpec("T1-MUT-036", "insert-slash-bass-into-membership"),
  operatorSpec("T1-MUT-037", "discard-slash-bass"),
  operatorSpec("T1-MUT-038", "deduplicate-custom-pitches"),
  operatorSpec("T1-MUT-039", "sort-custom-pitches-by-pitch-class"),
  operatorSpec("T1-MUT-040", "infer-custom-formula"),
  operatorSpec("T1-MUT-041", "expose-partial-refusal-output"),
  operatorSpec("T1-MUT-042", "rewrite-refusal-path-to-generated-output"),
  operatorSpec("T1-MUT-043", "advance-first-excess-bound", { field: "extensions" }),
  operatorSpec("T1-MUT-044", "advance-first-excess-bound", { field: "additions" }),
  operatorSpec("T1-MUT-045", "advance-first-excess-bound", { field: "alterations" }),
  operatorSpec("T1-MUT-046", "advance-first-excess-bound", { field: "omissions" }),
  operatorSpec("T1-MUT-047", "reject-parsed-modifier-vocabulary"),
  operatorSpec("T1-MUT-048", "duplicate-cross-category-degree"),
  operatorSpec("T1-MUT-049", "accept-seventeenth-semantic-degree"),
  operatorSpec("T1-MUT-050", "rewrite-abdim7-directed-spelling"),
  operatorSpec("T1-MUT-051", "fallback-unsupported-family"),
  operatorSpec("T1-MUT-052", "reverse-refusal-precedence"),
  operatorSpec("T1-MUT-053", "restrict-public-spelling-domain"),
] satisfies readonly SemanticOperatorSpec[]);

function mutableJsonClone(value: unknown): unknown {
  return JSON.parse(canonicalJson(value)) as unknown;
}

function mutableRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function walkMutable(
  value: unknown,
  visit: (record: Record<string, unknown>, path: string) => number,
  path = "$",
): number {
  let affected = 0;
  const current = mutableRecord(value);
  if (current !== null) affected += visit(current, path);
  if (Array.isArray(value)) {
    value.forEach((child, index) => {
      affected += walkMutable(child, visit, `${path}[${String(index)}]`);
    });
  } else if (current !== null) {
    for (const [key, child] of Object.entries(current)) {
      affected += walkMutable(child, visit, `${path}.${key}`);
    }
  }
  return affected;
}

function degreeParts(value: string): Readonly<{ number: number; alter: number }> {
  const match = /^(bb|b|##|#)?(1|2|3|4|5|6|7|9|11|13)$/.exec(value);
  if (match === null) throw new Error(`invalid operator degree ${value}`);
  return {
    number: Number(match[2]),
    alter: match[1] === "bb" ? -2 : match[1] === "b" ? -1 :
      match[1] === "#" ? 1 : match[1] === "##" ? 2 : 0,
  };
}

function degreeMatches(value: unknown, degree: string): boolean {
  if (value === degree) return true;
  const candidate = mutableRecord(value);
  if (candidate === null) return false;
  const expected = degreeParts(degree);
  return candidate["number"] === expected.number && candidate["alter"] === expected.alter;
}

function degreeValueLike(example: unknown, degree: string): unknown {
  return typeof example === "string" ? degree : { ...degreeParts(degree) };
}

function chordDegreeValue(value: unknown): ChordDegree | null {
  if (typeof value === "string") {
    const parsed = degreeParts(value);
    if (!(parsed.number in DEGREE_SEMITONES) || !Number.isInteger(parsed.alter)) return null;
    return parsed as ChordDegree;
  }
  const body = mutableRecord(value);
  const number = body?.["number"];
  const alter = body?.["alter"];
  if (typeof number !== "number" || !(number in DEGREE_SEMITONES) || typeof alter !== "number") return null;
  return { number, alter } as ChordDegree;
}

function spelledPitchValue(value: unknown): SpelledPitchClass | null {
  const body = mutableRecord(value);
  const step = body?.["step"];
  const alter = body?.["alter"];
  if (!(step === "C" || step === "D" || step === "E" || step === "F" || step === "G" || step === "A" || step === "B") || typeof alter !== "number") return null;
  return { step, alter } as SpelledPitchClass;
}

function rootForSemanticEntry(
  entry: Record<string, unknown>,
  inheritedRoot: SpelledPitchClass | null,
): SpelledPitchClass | null {
  const sourceRoot = spelledPitchValue(mutableRecord(entry["source"])?.["root"]);
  if (sourceRoot !== null) return sourceRoot;
  const rootId = entry["rootId"];
  if (typeof rootId === "string") {
    const root = rootFixture.roots.find(({ id }) => id === rootId);
    if (root !== undefined) return root.spelled;
  }
  return inheritedRoot ?? spelledPitchValue(entry["root"]);
}

function reconcileDerivedDegreeSpellings(
  value: unknown,
  inheritedRoot: SpelledPitchClass | null = null,
): number {
  if (Array.isArray(value)) {
    return (value as unknown[]).reduce<number>(
      (sum, item) => sum + reconcileDerivedDegreeSpellings(item, inheritedRoot),
      0,
    );
  }
  const entry = mutableRecord(value);
  if (entry === null) return 0;
  const root = rootForSemanticEntry(entry, inheritedRoot);
  let changed = 0;
  const degrees = entry["degrees"];
  if (root !== null && Array.isArray(degrees) && Array.isArray(entry["spelledPitchNames"]) && Array.isArray(entry["pitchClasses"])) {
    const outcomes = degrees.map((degree) => {
      const parsed = chordDegreeValue(degree);
      if (parsed === null) throw new TypeError("mutant realization degree is not in the public domain");
      const outcome = independentSpelling(root, parsed);
      if (!outcome.ok) throw new Error(`mutant realization ${token(parsed)} is unspellable`);
      return outcome.value;
    });
    const spellings = outcomes.map(({ spelled }) => spelled);
    const pitchClasses = outcomes.map(({ pitchClass }) => pitchClass);
    if (canonicalJson(entry["spelledPitchNames"]) !== canonicalJson(spellings)) {
      entry["spelledPitchNames"] = spellings;
      changed += 1;
    }
    if (canonicalJson(entry["pitchClasses"]) !== canonicalJson(pitchClasses)) {
      entry["pitchClasses"] = pitchClasses;
      changed += 1;
    }
  }
  const degree = chordDegreeValue(entry["degree"]);
  if (root !== null && degree !== null && mutableRecord(entry["spelled"]) !== null && typeof entry["pitchClass"] === "number") {
    const outcome = independentSpelling(root, degree);
    if (!outcome.ok) throw new Error(`mutant standalone ${token(degree)} is unspellable`);
    if (canonicalJson(entry["spelled"]) !== canonicalJson(outcome.value.spelled)) {
      entry["spelled"] = outcome.value.spelled;
      changed += 1;
    }
    if (entry["pitchClass"] !== outcome.value.pitchClass) {
      entry["pitchClass"] = outcome.value.pitchClass;
      changed += 1;
    }
  }
  for (const child of Object.values(entry)) {
    changed += reconcileDerivedDegreeSpellings(child, root);
  }
  return changed;
}

const DEGREE_ARRAY_KEYS = new Set([
  "degrees", "required", "optional", "guide", "requiredDegrees",
  "optionalDegrees", "guideToneDegrees",
]);

function compareDegreeValues(left: unknown, right: unknown): number {
  const leftDegree = chordDegreeValue(left);
  const rightDegree = chordDegreeValue(right);
  if (leftDegree === null || rightDegree === null) {
    throw new TypeError("canonical degree sort received a non-degree value");
  }
  return leftDegree.number - rightDegree.number || leftDegree.alter - rightDegree.alter;
}

/**
 * Re-establishes the public canonical-order invariant after a mutation changes
 * degree membership or role provenance. `degrees`, `spelledPitchNames`, and
 * `pitchClasses` are one aligned tuple and therefore move together. Stable
 * sorting deliberately retains exact duplicates for the two operators whose
 * named fault is duplicate membership.
 */
function canonicalizeSemanticDegreeArrays(root: unknown): number {
  return walkMutable(root, (entry) => {
    let changed = 0;
    const degrees = entry["degrees"];
    if (Array.isArray(degrees) && degrees.every((degree) => chordDegreeValue(degree) !== null)) {
      const degreeValues = degrees as unknown[];
      const order = degreeValues
        .map((degree, index) => ({ degree, index }))
        .sort((left, right) => compareDegreeValues(left.degree, right.degree) || left.index - right.index)
        .map(({ index }) => index);
      if (!order.every((index, position) => index === position)) {
        entry["degrees"] = order.map((index) => degreeValues[index]);
        changed += 1;
        for (const key of ["spelledPitchNames", "pitchClasses"]) {
          const values = entry[key];
          if (Array.isArray(values) && values.length === degreeValues.length) {
            const alignedValues = values as unknown[];
            entry[key] = order.map((index) => alignedValues[index]);
            changed += 1;
          }
        }
      }
    }
    for (const key of [
      "required", "optional", "guide", "requiredDegrees",
      "optionalDegrees", "guideToneDegrees",
    ]) {
      const values = entry[key];
      if (!Array.isArray(values) || !values.every((degree) => chordDegreeValue(degree) !== null)) continue;
      const degreeValues = values as unknown[];
      const sorted = [...degreeValues].sort(compareDegreeValues);
      if (canonicalJson(values) !== canonicalJson(sorted)) {
        entry[key] = sorted;
        changed += 1;
      }
    }
    return changed;
  });
}

function rewriteDegreeIdentity(root: unknown, from: string, to: string): number {
  return walkMutable(root, (entry, path) => {
    let affected = 0;
    const outputDegreeRecord = path.endsWith(".degree") || [
      ".degrees[", ".requiredDegrees[", ".optionalDegrees[", ".guideToneDegrees[",
    ].some((segment) => path.includes(segment));
    if (outputDegreeRecord && entry["number"] === degreeParts(from).number && entry["alter"] === degreeParts(from).alter) {
      const replacement = degreeParts(to);
      entry["number"] = replacement.number;
      entry["alter"] = replacement.alter;
      affected += 2;
    }
    for (const [key, value] of Object.entries(entry)) {
      if (!DEGREE_ARRAY_KEYS.has(key) || !Array.isArray(value)) continue;
      value.forEach((item, index) => {
        if (typeof item === "string" && item === from) {
          value[index] = to;
          affected += 1;
        }
      });
    }
    return affected;
  });
}

function removeDegrees(root: unknown, degrees: readonly string[]): number {
  return walkMutable(root, (entry) => {
    let affected = 0;
    for (const [key, value] of Object.entries(entry)) {
      if (!DEGREE_ARRAY_KEYS.has(key) || !Array.isArray(value)) continue;
      for (let index = value.length - 1; index >= 0; index -= 1) {
        if (degrees.some((degree) => degreeMatches(value[index], degree))) {
          value.splice(index, 1);
          affected += 1;
        }
      }
    }
    return affected;
  });
}

function rolePairs() {
  return [
    ["required", "optional"],
    ["requiredDegrees", "optionalDegrees"],
  ] as const;
}

function moveDegreeRole(
  root: unknown,
  degree: string,
  from: "required" | "optional",
  to: "required" | "optional",
): number {
  return walkMutable(root, (entry) => {
    let affected = 0;
    for (const [requiredKey, optionalKey] of rolePairs()) {
      const fromKey = from === "required" ? requiredKey : optionalKey;
      const toKey = to === "required" ? requiredKey : optionalKey;
      const source = entry[fromKey];
      const target = entry[toKey];
      if (!Array.isArray(source) || !Array.isArray(target)) continue;
      const sourceValues = source as unknown[];
      const targetValues = target as unknown[];
      const index = sourceValues.findIndex((item) => degreeMatches(item, degree));
      if (index < 0 || targetValues.some((item) => degreeMatches(item, degree))) continue;
      const moved: unknown = sourceValues[index];
      sourceValues.splice(index, 1);
      targetValues.push(moved);
      affected += 2;
    }
    return affected;
  });
}

function appendDegree(root: unknown, degree: string, role: string): number {
  return walkMutable(root, (entry) => {
    const degrees = entry["degrees"];
    if (!Array.isArray(degrees) || degrees.some((item) => degreeMatches(item, degree))) return 0;
    const degreeValues = degrees as unknown[];
    const example: unknown = degreeValues[0] ?? degree;
    degreeValues.push(degreeValueLike(example, degree));
    let affected = 1;
    const roleKeys = role === "guide"
      ? ["required", "guide", "requiredDegrees", "guideToneDegrees"]
      : role === "required" ? ["required", "requiredDegrees"] : ["optional", "optionalDegrees"];
    for (const key of roleKeys) {
      const values = entry[key];
      if (Array.isArray(values) && !values.some((item) => degreeMatches(item, degree))) {
        const roleValues = values as unknown[];
        roleValues.push(degreeValueLike(roleValues[0] ?? example, degree));
        affected += 1;
      }
    }
    return affected;
  });
}

function alterArrayOrder(root: unknown, key: string, keepFirst: boolean): number {
  return walkMutable(root, (entry) => {
    const value = entry[key];
    if (!Array.isArray(value) || value.length < 2) return 0;
    const values = value as unknown[];
    entry[key] = keepFirst ? values.slice(0, 1) : [...values].reverse();
    return value.length;
  });
}

function mutatePaths(root: unknown): number {
  return walkMutable(root, (entry) => {
    const value = entry["path"];
    if (!Array.isArray(value) || value[0] === "realizations") return 0;
    const segments = value as unknown[];
    entry["path"] = ["realizations", 0, ...segments];
    return 1;
  });
}

function spelledPitchClass(value: unknown): number | null {
  const pitch = mutableRecord(value);
  const step = pitch?.["step"];
  const alter = pitch?.["alter"];
  if (!(step === "C" || step === "D" || step === "E" || step === "F" || step === "G" || step === "A" || step === "B") || typeof alter !== "number") {
    return null;
  }
  return asPitchClass(NATURAL_SEMITONES[step] + alter);
}

function replaceStandaloneSpelling(
  root: unknown,
  replacement: (entry: Record<string, unknown>) => Readonly<{ step: Step; alter: number }> | null,
): number {
  return walkMutable(root, (entry) => {
    if (typeof entry["pitchClass"] !== "number" || mutableRecord(entry["spelled"]) === null) return 0;
    const spelled = replacement(entry);
    if (spelled === null) return 0;
    entry["spelled"] = spelled;
    entry["pitchClass"] = spelledPitchClass(spelled);
    return 2;
  });
}

type SelectedSemanticTarget = Readonly<{
  targetId: string;
  path: string;
  value: unknown;
}>;

type SemanticTargetSelection = Readonly<{
  selectorId: string;
  targets: readonly SelectedSemanticTarget[];
}>;

function findSemanticTargets(
  value: unknown,
  predicate: (entry: Record<string, unknown>, path: string) => boolean,
  path = "$",
): readonly SelectedSemanticTarget[] {
  const targets: SelectedSemanticTarget[] = [];
  const visit = (candidate: unknown, candidatePath: string): void => {
    if (Array.isArray(candidate)) {
      (candidate as unknown[]).forEach((child, index) => {
        visit(child, `${candidatePath}[${String(index)}]`);
      });
      return;
    }
    const entry = mutableRecord(candidate);
    if (entry === null) return;
    if (predicate(entry, candidatePath)) {
      targets.push({
        targetId: typeof entry["id"] === "string"
          ? entry["id"]
          : typeof entry["caseId"] === "string"
            ? entry["caseId"]
            : candidatePath,
        path: candidatePath,
        value: entry,
      });
      return;
    }
    for (const [key, child] of Object.entries(entry)) {
      visit(child, `${candidatePath}.${key}`);
    }
  };
  visit(value, path);
  return targets;
}

function selectSemanticTargets(
  spec: SemanticOperatorSpec,
  caseId: string,
  candidate: unknown,
): SemanticTargetSelection {
  if (caseId.startsWith("T1-FORMULA-") && Array.isArray(candidate)) {
    return {
      selectorId: "formula-homogeneous-root-cells",
      targets: (candidate as unknown[]).map((value, index) => ({
        targetId: `${caseId}/${String(index)}`,
        path: `$[${String(index)}]`,
        value,
      })),
    };
  }
  if (caseId === "T1-ROOT-MATRIX-001") {
    const formulaId = spec.parameters["matrixFormulaId"];
    if (typeof formulaId !== "string") {
      throw new Error(`${spec.controlId} root-matrix selector requires matrixFormulaId`);
    }
    const body = mutableRecord(candidate);
    const cells = body?.["cells"];
    if (!Array.isArray(cells)) throw new TypeError(`${spec.controlId} root-matrix cells missing`);
    return {
      selectorId: `root-matrix-formula:${formulaId}`,
      targets: cells.flatMap((value, index) => {
        const cell = mutableRecord(value);
        return cell?.["formulaId"] === formulaId
          ? [{
              targetId: `${String(cell["rootId"])}/${formulaId}`,
              path: `$.cells[${String(index)}]`,
              value: cell,
            }]
          : [];
      }),
    };
  }
  if (caseId === "T1-LAW-004" && (
    spec.algorithm === "drop-diatonic-transposition" ||
    spec.algorithm === "leave-slash-bass-untransposed"
  )) {
    const targets = findSemanticTargets(candidate, (entry) => "targetSnapshot" in entry)
      .map((target) => ({
        targetId: `${target.targetId}/targetSnapshot`,
        path: `${target.path}.targetSnapshot`,
        value: mutableRecord(target.value)?.["targetSnapshot"],
      }));
    return { selectorId: "law-four-transposed-target-snapshots", targets };
  }
  if (caseId === "T1-LAW-005" && spec.algorithm === "drop-diatonic-transposition") {
    return {
      selectorId: "law-five-source-target-pairs",
      targets: findSemanticTargets(
        candidate,
        (entry) => mutableRecord(entry["source"]) !== null && mutableRecord(entry["target"]) !== null,
      ),
    };
  }
  if (caseId === "T1-LAW-007" && spec.algorithm === "duplicate-cross-category-degree") {
    return {
      selectorId: "law-seven-cross-category-duplicate-witness",
      targets: findSemanticTargets(
        candidate,
        (entry) => entry["caseId"] === "T1-LIT-079" && Array.isArray(entry["degrees"]),
      ),
    };
  }
  if (caseId === "T1-LAW-012" && spec.algorithm === "fallback-unsupported-family") {
    const fallbackIds = new Set(["T1-LIT-060", "T1-LIT-061", "T1-LIT-071"]);
    return {
      selectorId: "law-twelve-nearest-family-refusal-witnesses",
      targets: findSemanticTargets(
        candidate,
        (entry) => typeof entry["caseId"] === "string" && fallbackIds.has(entry["caseId"]) && mutableRecord(entry["payload"]) !== null,
      ).map((target) => ({
        targetId: target.targetId,
        path: `${target.path}.payload`,
        value: mutableRecord(target.value)?.["payload"],
      })),
    };
  }
  if (caseId === "T1-OPSTATE-007" && spec.algorithm === "advance-first-excess-bound") {
    return {
      selectorId: `operation-first-excess:${String(spec.parameters["field"])}`,
      targets: findSemanticTargets(
        candidate,
        (entry) => {
          const proof = mutableRecord(entry["firstExcessProof"]);
          return proof !== null && proof["field"] === spec.parameters["field"];
        },
      ),
    };
  }
  if (caseId === "T1-OPSTATE-009" && spec.algorithm === "accept-seventeenth-semantic-degree") {
    return {
      selectorId: "operation-output-limit-row",
      targets: findSemanticTargets(
        candidate,
        (entry) => entry["id"] === "T1-EVIDENCE-OUTPUT-LIMIT-REFUSAL",
      ),
    };
  }
  if (caseId === "T1-OPSTATE-010" && spec.algorithm === "reverse-refusal-precedence") {
    return {
      selectorId: "operation-first-global-precedence-row",
      targets: findSemanticTargets(candidate, (entry) => entry["id"] === "T1-PRECEDENCE-001"),
    };
  }
  if (caseId === "T1-OPSTATE-007" && spec.algorithm === "rewrite-refusal-path-to-generated-output") {
    return {
      selectorId: "operation-first-excess-refusal-records",
      targets: findSemanticTargets(candidate, (entry) => mutableRecord(entry["refusal"]) !== null),
    };
  }
  if (caseId === "T1-OPSTATE-008" && spec.algorithm === "rewrite-refusal-path-to-generated-output") {
    return {
      selectorId: "operation-refusal-path-matrix",
      targets: [{ targetId: caseId, path: "$", value: candidate }],
    };
  }
  return {
    selectorId: caseId === "T1-FAMILY-STATE-MATRIX-001"
      ? "family-state-coupled-summary"
      : "single-reviewed-case-payload",
    targets: [{ targetId: caseId, path: "$", value: candidate }],
  };
}

function overflowSpellingSuccess(
  caseId: string,
  clamp: boolean,
): Readonly<{ ok: true; value: JsonRecord }> {
  const fixture = spellingFixture.cases.find(({ id }) => id === caseId);
  if (fixture === undefined) throw new Error(`${caseId} overflow fixture missing`);
  const expected = independentSpelling(fixture.root, fixture.degree);
  if (expected.ok) throw new Error(`${caseId} is not an overflow fixture`);
  const targetStep = stepAt(
    STEP_ORDER.indexOf(fixture.root.step) + fixture.degree.number - 1,
  );
  const emittedAlteration = clamp
    ? Math.max(-2, Math.min(2, expected.refusal.requiredAlteration))
    : expected.refusal.requiredAlteration;
  const pitchClass = clamp
    ? asPitchClass(NATURAL_SEMITONES[targetStep] + emittedAlteration)
    : asPitchClass(
        NATURAL_SEMITONES[fixture.root.step] +
        fixture.root.alter +
        DEGREE_SEMITONES[fixture.degree.number] +
        fixture.degree.alter,
      );
  return {
    ok: true,
    value: {
      policyId: "changes.degree-spelling",
      policyVersion: 1,
      root: fixture.root,
      degree: fixture.degree,
      spelled: { step: targetStep, alter: emittedAlteration },
      pitchClass,
    },
  };
}

function exposePartialRefusalOutput(root: unknown): number {
  return walkMutable(root, (entry) => {
    if (entry["ok"] !== false || !("refusal" in entry) || "value" in entry) return 0;
    entry["value"] = {
      realizations: [],
      warnings: [],
      candidateDegrees: [],
    };
    return 1;
  });
}

function mutateLawFiveTransposedTarget(pair: unknown): number {
  const body = mutableRecord(pair);
  const target = mutableRecord(body?.["target"]);
  const targetValue = mutableRecord(target?.["value"]);
  const pitchClass = targetValue?.["pitchClass"];
  if (targetValue === null || typeof pitchClass !== "number" || mutableRecord(targetValue["spelled"]) === null) return 0;
  const replacement = convenienceSpelling(pitchClass);
  if (canonicalJson(targetValue["spelled"]) === canonicalJson(replacement)) return 0;
  targetValue["spelled"] = replacement;
  return 1;
}

function mutateSemitoneOnlySnapshot(snapshot: unknown): number {
  const target = mutableRecord(snapshot);
  const pitchClasses = target?.["pitchClasses"];
  const spellings = target?.["spelledPitchNames"];
  if (target === null || !Array.isArray(pitchClasses) || !Array.isArray(spellings) || pitchClasses.length === 0) return 0;
  let changed = 0;
  const rewritten = pitchClasses.map((pitchClass, index) => {
    if (typeof pitchClass !== "number") throw new TypeError("semitone-only pitch class missing");
    const replacement = convenienceSpelling(pitchClass);
    if (canonicalJson(spellings[index]) !== canonicalJson(replacement)) changed += 1;
    return replacement;
  });
  target["spelledPitchNames"] = rewritten;
  const root = convenienceSpelling(Number(pitchClasses[0]));
  if (canonicalJson(target["root"]) !== canonicalJson(root)) changed += 1;
  target["root"] = root;
  const bass = mutableRecord(target["bass"]);
  if (bass !== null) {
    const bassPitchClass = spelledPitchClass(bass);
    if (bassPitchClass === null) throw new TypeError("semitone-only bass spelling invalid");
    const convenientBass = convenienceSpelling(bassPitchClass);
    if (canonicalJson(target["bass"]) !== canonicalJson(convenientBass)) changed += 1;
    target["bass"] = convenientBass;
  }
  return changed;
}

function mergeEqualAlteredRealizations(root: unknown): number {
  return walkMutable(root, (entry) => {
    const realizations = entry["realizations"];
    if (!Array.isArray(realizations) || realizations.length !== 4) return 0;
    const representatives: unknown[] = [];
    const ninthGroups = new Set<number>();
    for (const realization of realizations) {
      const body = mutableRecord(realization);
      const degrees = body?.["degrees"];
      if (!Array.isArray(degrees)) continue;
      const ninth = (degrees as unknown[]).find((degree) => mutableRecord(degree)?.["number"] === 9);
      const alteration = mutableRecord(ninth)?.["alter"];
      if (typeof alteration !== "number" || ninthGroups.has(alteration)) continue;
      ninthGroups.add(alteration);
      representatives.push(realization);
    }
    if (representatives.length !== 2) return 0;
    entry["realizations"] = representatives;
    return realizations.length - representatives.length;
  });
}

function retainSharpFiveInOriginalVariants(root: unknown): number {
  return walkMutable(root, (entry) => {
    const id = entry["id"];
    return typeof id === "string" && id.startsWith("alt-") && id.endsWith("-sharp5")
      ? appendDegree(entry, "#5", "required")
      : 0;
  });
}

function retainFirstAlteredVariant(root: unknown): number {
  return walkMutable(root, (entry) => {
    const realizations = entry["realizations"];
    if (Array.isArray(realizations) && realizations.length > 1) {
      entry["realizations"] = realizations.slice(0, 1);
      return realizations.length - 1;
    }
    const variantOrder = entry["variantOrder"];
    if (typeof realizations !== "number" || realizations <= 1 || !Array.isArray(variantOrder) || variantOrder.length !== realizations) return 0;
    const semanticOutputRecords = entry["semanticOutputRecords"];
    const spellingAttempts = entry["spellingAttempts"];
    if (typeof semanticOutputRecords !== "number" || typeof spellingAttempts !== "number") return 0;
    entry["realizations"] = 1;
    entry["variantOrder"] = variantOrder.slice(0, 1);
    entry["semanticOutputRecords"] = semanticOutputRecords / realizations;
    entry["spellingAttempts"] = spellingAttempts / realizations;
    return 4;
  });
}

function insertSlashBassMembership(root: unknown): number {
  return walkMutable(root, (entry, path) => {
    if (path.includes(".source") || spelledPitchValue(entry["bass"]) === null) return 0;
    const bass = spelledPitchValue(entry["bass"]);
    if (bass === null) return 0;
    const bassPitchClass = spelledPitchClass(bass);
    if (bassPitchClass === null) return 0;
    const directSpellings = entry["spelledPitchNames"];
    const directPitchClasses = entry["pitchClasses"];
    if (Array.isArray(directSpellings) && Array.isArray(directPitchClasses) && entry["degrees"] === null) {
      directSpellings.push(mutableJsonClone(bass));
      directPitchClasses.push(bassPitchClass);
      return 2;
    }
    const realizations = entry["realizations"];
    if (!Array.isArray(realizations)) return 0;
    let changed = 0;
    for (const realizationValue of realizations) {
      const realization = mutableRecord(realizationValue);
      const spellings = realization?.["spelledPitchNames"];
      const pitchClasses = realization?.["pitchClasses"];
      if (realization === null || !Array.isArray(spellings) || !Array.isArray(pitchClasses)) continue;
      const degrees = realization["degrees"];
      if (degrees === null) {
        spellings.push(mutableJsonClone(bass));
        pitchClasses.push(bassPitchClass);
        changed += 2;
        continue;
      }
      if (!Array.isArray(degrees) || degrees.length !== spellings.length || spellings.length !== pitchClasses.length) continue;
      const memberIndex = spellings.findIndex((spelling) => canonicalJson(spelling) === canonicalJson(bass));
      if (memberIndex < 0) throw new Error("reviewed parsed slash bass must match a realization member");
      const degree: unknown = (degrees as unknown[])[memberIndex];
      const parsedDegree = chordDegreeValue(degree);
      if (parsedDegree === null) throw new TypeError("reviewed slash-bass member degree invalid");
      const degreeToken = token(parsedDegree);
      degrees.push(mutableJsonClone(degree));
      spellings.push(mutableJsonClone(bass));
      pitchClasses.push(bassPitchClass);
      changed += 3;
      for (const [requiredKey, optionalKey] of rolePairs()) {
        const required = realization[requiredKey];
        const optional = realization[optionalKey];
        if (!Array.isArray(required) || !Array.isArray(optional)) continue;
        const role = required.some((item) => degreeMatches(item, degreeToken))
          ? required
          : optional;
        role.push(mutableJsonClone(degree));
        changed += 1;
      }
      for (const key of ["guide", "guideToneDegrees"]) {
        const guide = realization[key];
        if (Array.isArray(guide) && guide.some((item) => canonicalJson(item) === canonicalJson(degree))) {
          guide.push(mutableJsonClone(degree));
          changed += 1;
        }
      }
    }
    return changed;
  });
}

function duplicateReviewedCrossCategoryDegree(target: SelectedSemanticTarget): number {
  const duplicateInList = (degreeList: unknown[]): number => {
    const index = degreeList.findIndex((degree) => degreeMatches(degree, "9"));
    if (index < 0) return 0;
    degreeList.splice(index + 1, 0, mutableJsonClone(degreeList[index]));
    return 1;
  };
  const selected = mutableRecord(target.value);
  const selectedDegrees = selected?.["degrees"];
  if (Array.isArray(selectedDegrees) && selectedDegrees.length > 0 && Array.isArray(selectedDegrees[0])) {
    return duplicateInList(selectedDegrees[0] as unknown[]);
  }
  let changed = 0;
  walkMutable(target.value, (entry) => {
    if (changed > 0 || typeof entry["formulaRuleId"] !== "string") return 0;
    const degrees = entry["degrees"];
    if (!Array.isArray(degrees) || degrees.some(Array.isArray)) return 0;
    changed += duplicateInList(degrees as unknown[]);
    return 0;
  });
  return changed;
}

function syntheticParsedSuccess(
  source: JsonRecord,
  formulaRuleId: string,
  degrees: readonly string[],
  required: readonly string[],
  optional: readonly string[],
  guide: readonly string[],
): JsonRecord {
  const root = record(source["root"], "synthetic source root") as SpelledPitchClass;
  const degreeRecords = degrees.map(degreeFromToken);
  const spellings = degreeRecords.map((degree) => {
    const spelled = independentSpelling(root, degree);
    if (!spelled.ok) throw new Error(`synthetic ${formulaRuleId}/${token(degree)} overflow`);
    return spelled.value;
  });
  return {
    ok: true,
    value: {
      ...literalFixture.expectedMetadata,
      source,
      realizations: [{
        kind: "semantic",
        id: "literal",
        formulaRuleId,
        degrees: degreeRecords,
        requiredDegrees: required.map(degreeFromToken),
        optionalDegrees: optional.map(degreeFromToken),
        guideToneDegrees: guide.map(degreeFromToken),
        spelledPitchNames: spellings.map(({ spelled }) => spelled),
        pitchClasses: spellings.map(({ pitchClass }) => pitchClass),
      }],
      bass: source["bass"],
      warnings: [],
    },
  };
}

function seventeenthDegreeSuccess(): JsonRecord {
  const additions = ["2", "3", "4", "6", "9", "11", "13"].map(degreeFromToken);
  const alterations = ["#5", "b9", "#9", "b11", "#11", "b13", "#13"].map(degreeFromToken);
  const degrees = [
    "1", "2", "b3", "3", "4", "b5", "#5", "6", "b9", "9", "#9",
    "b11", "11", "#11", "b13", "13", "#13",
  ];
  return syntheticParsedSuccess({
    kind: "parsed",
    sourceText: "Cdim",
    root: { step: "C", alter: 0 },
    triad: "diminished",
    sixth: null,
    seventh: null,
    extensions: [],
    additions,
    alterations,
    omissions: [],
    bass: null,
    colorPolicy: "none",
  }, "base-diminished", degrees, degrees, [], ["b3"]);
}

function fallbackSuccess(caseId: string): JsonRecord {
  if (caseId === "T1-LIT-060") {
    return syntheticParsedSuccess({
      kind: "parsed", sourceText: "Cm(maj7)", root: { step: "C", alter: 0 },
      triad: "minor", sixth: null, seventh: "major",
      extensions: [{ number: 9, alter: 0 }], additions: [], alterations: [], omissions: [],
      bass: null, colorPolicy: "none",
    }, "seventh-minor-major", ["1", "b3", "5", "7"], ["1", "b3", "7"], ["5"], ["b3", "7"]);
  }
  if (caseId === "T1-LIT-061") {
    return syntheticParsedSuccess({
      kind: "parsed", sourceText: "Cdim", root: { step: "C", alter: 0 },
      triad: "diminished", sixth: null, seventh: "diminished",
      extensions: [{ number: 9, alter: 0 }], additions: [], alterations: [], omissions: [],
      bass: null, colorPolicy: "none",
    }, "seventh-diminished", ["1", "b3", "b5", "bb7"], ["1", "b3", "b5", "bb7"], [], ["b3", "bb7"]);
  }
  if (caseId === "T1-LIT-071") {
    return syntheticParsedSuccess({
      kind: "parsed", sourceText: "C5", root: { step: "C", alter: 0 },
      triad: "power", sixth: null, seventh: "minor",
      extensions: [], additions: [], alterations: [], omissions: [],
      bass: null, colorPolicy: "none",
    }, "base-power", ["1", "5"], ["1", "5"], [], []);
  }
  throw new Error(`${caseId} has no reviewed fallback counterfactual`);
}

function mutateFamilyStateFallback(root: unknown): number {
  const entry = mutableRecord(root);
  if (entry === null || typeof entry["acceptedStates"] !== "number") return 0;
  const outcomeCounts = mutableRecord(entry["outcomeCounts"]);
  const reasons = mutableRecord(entry["reasonAndConflictCounts"]);
  const acceptedRules = mutableRecord(entry["acceptedRuleIdCounts"]);
  const refusalRules = mutableRecord(entry["refusalRuleIdCounts"]);
  const unsupportedRules = mutableRecord(refusalRules?.["theory.formula_family_unsupported"]);
  const orderedPublicOutcomes = entry["orderedPublicOutcomes"];
  if (
    outcomeCounts === null || reasons === null || acceptedRules === null ||
    refusalRules === null || unsupportedRules === null ||
    !Array.isArray(orderedPublicOutcomes) ||
    typeof outcomeCounts["accepted"] !== "number" ||
    typeof outcomeCounts["theory.formula_family_unsupported"] !== "number" ||
    typeof reasons["unsupported-seventh"] !== "number" ||
    typeof unsupportedRules["base-power"] !== "number"
  ) return 0;
  const targetFacts = {
    triad: "power",
    sixth: null,
    seventh: "minor",
    extension: null,
    naturalNineAddition: false,
    colorPolicy: "none",
  };
  const changedIndex = orderedPublicOutcomes.findIndex((value) => {
    const cell = mutableRecord(value);
    const expected = mutableRecord(cell?.["expected"]);
    const refusal = mutableRecord(expected?.["refusal"]);
    return canonicalJson(cell?.["facts"]) === canonicalJson(targetFacts) &&
      expected?.["ok"] === false &&
      refusal?.["code"] === "theory.formula_family_unsupported" &&
      refusal["ruleId"] === "base-power";
  });
  if (changedIndex < 0) throw new Error("family fallback counterfactual target cell missing");
  const changedCell = mutableRecord(orderedPublicOutcomes[changedIndex]);
  if (changedCell === null) throw new TypeError("family fallback counterfactual target malformed");
  if (changedIndex !== 800) {
    throw new Error(`family fallback counterfactual expected ordered cell 800, received ${changedIndex.toString()}`);
  }
  const baselineExpected = mutableJsonClone(changedCell["expected"]);
  const mutantExpected = syntheticParsedSuccess({
    ...formulaFixture.familyStateMatrix.sourceDefaults,
    triad: "power",
    sixth: null,
    seventh: "minor",
    extensions: [],
    additions: [],
    colorPolicy: "none",
  }, "base-power", ["1", "5"], ["1", "5"], [], []);
  const baselineDigest = entry["semanticDigest"];
  changedCell["expected"] = mutantExpected;
  entry["acceptedStates"] += 1;
  outcomeCounts["accepted"] += 1;
  outcomeCounts["theory.formula_family_unsupported"] -= 1;
  reasons["unsupported-seventh"] -= 1;
  acceptedRules["base-power"] = Number(acceptedRules["base-power"] ?? 0) + 1;
  unsupportedRules["base-power"] -= 1;
  const mutantDigest = sha256(orderedPublicOutcomes);
  entry["semanticDigest"] = mutantDigest;
  entry["counterfactualDigestProof"] = {
    preimageKind: "ordered-public-family-state-outcomes",
    preimageLength: orderedPublicOutcomes.length,
    changedCellCount: 1,
    changedIndex,
    changedFacts: mutableJsonClone(changedCell["facts"]),
    baselineExpected,
    mutantExpected: mutableJsonClone(mutantExpected),
    baselineDigest,
    mutantDigest,
  };
  return 10;
}

function firstExcessFixtureRow(field: string): JsonRecord {
  const operation = operationStateFixture.cases.find(({ id }) => id === "T1-OPSTATE-007");
  const row = operation?.rows?.find((candidate) => mutableRecord(candidate)?.["field"] === field);
  if (row === undefined) throw new Error(`first-excess fixture row ${field} missing`);
  return record(row, `first-excess ${field}`);
}

function formulaRefusalEvidence(inputDegreeRecordsVisited: number): JsonRecord {
  return {
    inputDegreeRecordsVisited,
    formulaPhaseTransitions: 0,
    candidateDegreesObserved: 0,
    duplicateDegreesCanonicalized: 0,
    realizationsProduced: 0,
    spellingAttempts: 0,
    degreesProduced: 0,
    warningsProduced: 0,
    peakCandidateDegreeRecords: 0,
    termination: "formula-refusal",
  };
}

function advanceFirstExcessOutcome(rowValue: unknown, field: string): number {
  const row = mutableRecord(rowValue);
  const proof = mutableRecord(row?.["firstExcessProof"]);
  const fixtureRow = firstExcessFixtureRow(field);
  const firstExcessIndex = fixtureRow["firstExcessIndex"];
  const inputRecipe = mutableRecord(fixtureRow["inputRecipe"]);
  const expectedRefusal = mutableRecord(fixtureRow["expectedRefusal"]);
  if (
    row === null || proof === null || typeof firstExcessIndex !== "number" ||
    !Array.isArray(inputRecipe?.[field]) || expectedRefusal === null
  ) return 0;
  const originalSourceRefusal = {
    ...(mutableJsonClone(expectedRefusal) as JsonRecord),
    reason: "number",
  };
  proof["firstExcessIndex"] = null;
  proof["countRefusalObserved"] = false;
  proof["invalidationReason"] = "semantic-validation-before-raised-count-bound";
  proof["result"] = { ok: false, refusal: originalSourceRefusal };
  proof["evidence"] = formulaRefusalEvidence(firstExcessIndex + 1);
  row["result"] = { ok: false, refusal: originalSourceRefusal };
  row["evidence"] = formulaRefusalEvidence(firstExcessIndex + 1);
  return 7;
}

function applyRuntimeCounterfactual(
  spec: SemanticOperatorSpec,
  caseId: string,
  baseline: unknown,
): Readonly<{
  mutatedProjection: unknown;
  affectedCount: number;
  selectorId: string;
  selectedTargets: readonly Readonly<{ targetId: string; path: string }>[];
}> {
  const mutant = mutableJsonClone(baseline);
  const selection = selectSemanticTargets(spec, caseId, mutant);
  if (selection.targets.length === 0) {
    throw new Error(`${spec.controlId}/${caseId} selector ${selection.selectorId} matched no targets`);
  }
  const mutateSelected = (mutation: (target: SelectedSemanticTarget) => number): number =>
    selection.targets.reduce((sum, target) => sum + mutation(target), 0);
  const parameter = (key: string): unknown => spec.parameters[key];
  const derivedTargets: Array<Readonly<{ targetId: string; path: string }>> = [];
  let affected: number;
  switch (spec.algorithm) {
    case "rewrite-degree-identity":
      affected = mutateSelected(({ value }) => rewriteDegreeIdentity(value, String(parameter("from")), String(parameter("to"))));
      break;
    case "move-degree-role":
      affected = mutateSelected(({ value }) => moveDegreeRole(value, String(parameter("degree")), parameter("from") as "required" | "optional", parameter("to") as "required" | "optional"));
      break;
    case "remove-degree":
      affected = mutateSelected(({ value }) => removeDegrees(value, parameter("degrees") as readonly string[]));
      break;
    case "append-semantic-degree":
      affected = mutateSelected(({ value }) => appendDegree(value, String(parameter("degree")), String(parameter("role"))));
      break;
    case "retain-suspension-third":
      affected = caseId === "T1-LIT-055"
        ? mutateSelected(({ value }) => walkMutable(value, (entry) => Array.isArray(entry["warnings"]) && entry["warnings"].length > 0 ? (entry["warnings"] = [], 1) : 0))
        : mutateSelected(({ value }) => appendDegree(value, "3", "guide"));
      break;
    case "collapse-equal-pitch-class-records":
      affected = mutateSelected(({ value }) => walkMutable(value, (entry) => {
        const pitches = entry["spelledPitchNames"];
        const classes = entry["pitchClasses"];
        if (!Array.isArray(pitches) || !Array.isArray(classes) || classes.length < 2) return 0;
        const duplicate = classes.findIndex((item, index) => classes.indexOf(item) < index);
        if (duplicate < 0) return 0;
        pitches.splice(duplicate, 1);
        classes.splice(duplicate, 1);
        return 2;
      }));
      break;
    case "reuse-root-letter":
      affected = mutateSelected(({ value }) => replaceStandaloneSpelling(value, (entry) => {
        const root = mutableRecord(entry["root"]);
        const step = root?.["step"];
        const pitchClass = entry["pitchClass"];
        if (!(step === "C" || step === "D" || step === "E" || step === "F" || step === "G" || step === "A" || step === "B") || typeof pitchClass !== "number") return null;
        let alter = asPitchClass(pitchClass) - NATURAL_SEMITONES[step];
        if (alter > 6) alter -= 12;
        if (alter < -6) alter += 12;
        return { step, alter };
      }));
      break;
    case "pitch-class-first-enharmonic": {
      const choices: Readonly<Record<string, SpelledPitchClass>> = {
        "T1-SPELL-001": { step: "B", alter: 0 },
        "T1-SPELL-002": { step: "F", alter: 0 },
        "T1-SPELL-003": { step: "E", alter: -1 },
        "T1-SPELL-006": { step: "F", alter: 0 },
      };
      affected = mutateSelected(({ value }) => replaceStandaloneSpelling(value, () => choices[caseId] ?? null));
      break;
    }
    case "accept-accidental-overflow":
      affected = caseId === "T1-SPELL-PUBLIC-MATRIX-001"
        ? mutateSelected(({ value }) => {
          const entry = mutableRecord(value);
          if (entry === null) return 0;
          Object.assign(entry, spellingMatrixCounterfactualSummary("clamp-one-overflow"));
          return 3;
        })
        : mutateSelected(({ value }) => {
          const target = mutableRecord(value);
          if (target === null || target["ok"] !== false) return 0;
          const success = overflowSpellingSuccess(caseId, parameter("clamp") === true);
          Object.keys(target).forEach((key) => {
            Reflect.deleteProperty(target, key);
          });
          Object.assign(target, success);
          return 1;
        });
      break;
    case "drop-diatonic-transposition":
      affected = caseId === "T1-LAW-005"
        ? mutateSelected(({ value }) => mutateLawFiveTransposedTarget(value))
        : mutateSelected(({ value }) => mutateSemitoneOnlySnapshot(value));
      break;
    case "leave-slash-bass-untransposed":
      affected = mutateSelected(({ value }) => {
        const target = mutableRecord(value);
        if (target === null || target["bass"] === undefined) return 0;
        target["bass"] = { step: "G", alter: 0 };
        return 1;
      });
      break;
    case "keep-first-altered-realization":
      affected = mutateSelected(({ value }) => retainFirstAlteredVariant(value));
      break;
    case "reverse-altered-realization-order":
      affected = mutateSelected(({ value }) => alterArrayOrder(value, "realizations", false) + alterArrayOrder(value, "variantOrder", false));
      break;
    case "merge-equal-altered-realizations":
      affected = mutateSelected(({ value }) => mergeEqualAlteredRealizations(value));
      break;
    case "remove-explicit-add-three":
      affected = mutateSelected(({ value }) => removeDegrees(value, ["3"]));
      break;
    case "retain-extension-natural-closure":
      affected = mutateSelected(({ value }) => (parameter("degrees") as readonly string[]).reduce((sum, degree) => sum + appendDegree(value, degree, "optional"), 0));
      break;
    case "retain-one-omitted-alteration":
      affected = mutateSelected(({ value }) => retainSharpFiveInOriginalVariants(value));
      break;
    case "addition-implies-extension-closure":
      affected = mutateSelected(({ value }) => appendDegree(value, "b7", "guide") +
        appendDegree(value, "9", "optional"));
      break;
    case "move-highest-extension-to-optional":
      affected = mutateSelected(({ value }) => ["13", "11", "9"].reduce((sum, degree) => sum + moveDegreeRole(value, degree, "required", "optional"), 0));
      break;
    case "move-identity-fifth-to-optional":
      affected = mutateSelected(({ value }) => ["5", "b5", "#5"].reduce((sum, degree) => sum + moveDegreeRole(value, degree, "required", "optional"), 0));
      break;
    case "append-guide-degree":
      affected = mutateSelected(({ value }) => walkMutable(value, (entry) => {
        let changed = 0;
        for (const key of ["guide", "guideToneDegrees"]) {
          const values = entry[key];
          if (!Array.isArray(values) || values.some((item) => degreeMatches(item, String(parameter("degree"))))) continue;
          values.push(degreeValueLike(values[0] ?? "3", String(parameter("degree"))));
          changed += 1;
        }
        return changed;
      }));
      break;
    case "suppress-omission-warning":
      affected = mutateSelected(({ value }) => walkMutable(value, (entry) => Array.isArray(entry["warnings"]) && entry["warnings"].length > 0 ? (entry["warnings"] = [], 1) : 0));
      break;
    case "emit-warning-for-present-omission":
      affected = mutateSelected(({ value }) => walkMutable(value, (entry) => Array.isArray(entry["warnings"]) && entry["warnings"].length === 0 ? (entry["warnings"] = [{
        code: "theory.omission_absent",
        path: ["omissions", 0],
        degreeNumber: 3,
        message: "The requested third omission had no matching degree to remove.",
      }], 1) : 0));
      break;
    case "insert-slash-bass-into-membership":
      affected = mutateSelected(({ value }) => insertSlashBassMembership(value));
      break;
    case "discard-slash-bass":
      affected = mutateSelected(({ value }) => walkMutable(value, (entry, path) => !path.includes(".source") && entry["bass"] !== null && entry["bass"] !== undefined ? (entry["bass"] = null, 1) : 0));
      break;
    case "deduplicate-custom-pitches":
      affected = mutateSelected(({ value }) => walkMutable(value, (entry) => {
        const pitches = entry["spelledPitchNames"];
        const classes = entry["pitchClasses"];
        if (!Array.isArray(pitches)) return 0;
        const seen = new Set<string>();
        const keep = pitches.map((pitch) => {
          const key = canonicalJson(pitch);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        if (keep.every(Boolean)) return 0;
        entry["spelledPitchNames"] = pitches.filter((_, index) => keep[index]);
        if (Array.isArray(classes)) entry["pitchClasses"] = classes.filter((_, index) => keep[index]);
        return 2;
      }));
      break;
    case "sort-custom-pitches-by-pitch-class":
      affected = mutateSelected(({ value }) => walkMutable(value, (entry) => {
        const pitches = entry["spelledPitchNames"];
        const classes = entry["pitchClasses"];
        if (!Array.isArray(pitches) || !Array.isArray(classes) || pitches.length < 2) return 0;
        const pitchValues = pitches as unknown[];
        const classValues = classes as unknown[];
        const order = classValues.map((pitchClass, index) => ({ pitchClass, index })).sort((a, b) => Number(a.pitchClass) - Number(b.pitchClass) || a.index - b.index).map(({ index }) => index);
        if (order.every((index, position) => index === position)) return 0;
        entry["spelledPitchNames"] = order.map((index) => pitchValues[index]);
        entry["pitchClasses"] = order.map((index) => classValues[index]);
        return 2;
      }));
      break;
    case "infer-custom-formula":
      affected = mutateSelected(({ value }) => walkMutable(value, (entry) => {
        if (entry["degrees"] !== null || !Array.isArray(entry["pitchClasses"])) return 0;
        const majorSeventh = caseId === "T1-CUSTOM-007";
        const degrees = majorSeventh ? ["1", "3", "5", "7"] : ["1", "b3", "5"];
        const required = majorSeventh ? ["1", "3", "7"] : ["1", "b3"];
        const optional = ["5"];
        const guide = majorSeventh ? ["3", "7"] : ["b3"];
        entry["kind"] = "semantic";
        entry["id"] = "literal";
        entry["formulaRuleId"] = majorSeventh ? "seventh-major" : "base-minor";
        entry["degrees"] = degrees.map(degreeFromToken);
        entry["requiredDegrees"] = required.map(degreeFromToken);
        entry["optionalDegrees"] = optional.map(degreeFromToken);
        entry["guideToneDegrees"] = guide.map(degreeFromToken);
        Reflect.deleteProperty(entry, "limitations");
        return 8;
      }));
      break;
    case "expose-partial-refusal-output":
      affected = mutateSelected(({ value }) => exposePartialRefusalOutput(value));
      break;
    case "rewrite-refusal-path-to-generated-output":
      affected = mutateSelected(({ value }) => {
        let changed = mutatePaths(value);
        if (changed === 0 && Array.isArray(value)) {
          for (const path of value) {
            if (Array.isArray(path) && path[0] !== "realizations") {
              path.unshift("realizations", 0);
              changed += 1;
            }
          }
        }
        return changed;
      });
      break;
    case "advance-first-excess-bound":
      affected = mutateSelected(({ value }) => advanceFirstExcessOutcome(value, String(parameter("field"))));
      break;
    case "reject-parsed-modifier-vocabulary":
      affected = mutateSelected(({ value }) => walkMutable(value, (entry) => {
        if (entry["ok"] !== true || !("value" in entry)) return 0;
        delete entry["value"];
        entry["ok"] = false;
        const degree = caseId === "T1-LIT-038"
          ? { number: 11, alter: -1 }
          : { number: 13, alter: 1 };
        entry["refusal"] = {
          code: "theory.alteration_invalid",
          path: ["alterations", 0],
          phase: "color-alterations",
          ruleId: "seventh-dominant",
          received: degree,
          reason: "alteration",
        };
        return 3;
      }));
      break;
    case "duplicate-cross-category-degree":
      affected = mutateSelected((target) => duplicateReviewedCrossCategoryDegree(target));
      break;
    case "accept-seventeenth-semantic-degree":
      affected = mutateSelected(({ targetId, value }) => {
        const success = seventeenthDegreeSuccess();
        const target = mutableRecord(value);
        if (target === null) return 0;
        if (targetId === "T1-EVIDENCE-OUTPUT-LIMIT-REFUSAL") {
          const result = mutableRecord(target["result"]);
          if (result?.["ok"] !== false) return 0;
          target["result"] = success;
          target["evidence"] = {
            inputDegreeRecordsVisited: 14,
            formulaPhaseTransitions: 8,
            candidateDegreesObserved: 17,
            duplicateDegreesCanonicalized: 0,
            realizationsProduced: 1,
            spellingAttempts: 17,
            degreesProduced: 17,
            warningsProduced: 0,
            peakCandidateDegreeRecords: 17,
            termination: "complete",
          };
          return 2;
        }
        if (target["ok"] !== false) return 0;
        Object.keys(target).forEach((key) => {
          Reflect.deleteProperty(target, key);
        });
        Object.assign(target, success);
        return 1;
      });
      break;
    case "rewrite-abdim7-directed-spelling":
      affected = mutateSelected(({ value }) => walkMutable(value, (entry) => {
        const spelled = mutableRecord(entry["spelled"]);
        if (spelled?.["step"] !== "G" || spelled["alter"] !== -2) return 0;
        spelled["step"] = "F";
        spelled["alter"] = -1;
        entry["pitchClass"] = 4;
        return 3;
      }));
      break;
    case "fallback-unsupported-family":
      affected = caseId === "T1-FAMILY-STATE-MATRIX-001"
        ? mutateSelected(({ value }) => mutateFamilyStateFallback(value))
        : mutateSelected(({ targetId, value }) => {
          const target = mutableRecord(value);
          if (target === null || target["ok"] !== false) return 0;
          const success = fallbackSuccess(targetId === "T1-LAW-012" ? caseId : targetId);
          Object.keys(target).forEach((key) => {
            Reflect.deleteProperty(target, key);
          });
          Object.assign(target, success);
          return 1;
      });
      break;
    case "reverse-refusal-precedence":
      affected = mutateSelected(({ value }) => {
        const row = mutableRecord(value);
        if (row?.["id"] !== "T1-PRECEDENCE-001") return 0;
        row["result"] = {
          ok: false,
          refusal: {
            code: "theory.extension_invalid",
            path: ["extensions", 0],
            phase: "base",
            ruleId: "base-major",
            received: { number: 7, alter: 0 },
            reason: "number",
          },
        };
        return 1;
      });
      break;
    case "restrict-public-spelling-domain":
      affected = mutateSelected(({ value }) => {
        const entry = mutableRecord(value);
        if (entry === null) return 0;
        Object.assign(entry, spellingMatrixCounterfactualSummary("reject-one-non-formula-degree"));
        return 3;
      });
      break;
    default:
      throw new Error(`${spec.controlId} unknown algorithm ${spec.algorithm}`);
  }
  if (new Set([
    "rewrite-degree-identity",
    "remove-degree",
    "append-semantic-degree",
    "retain-suspension-third",
    "remove-explicit-add-three",
    "retain-extension-natural-closure",
    "retain-one-omitted-alteration",
    "addition-implies-extension-closure",
  ]).has(spec.algorithm)) {
    affected += mutateSelected(({ value }) => reconcileDerivedDegreeSpellings(value));
  }
  affected += mutateSelected(({ value }) => canonicalizeSemanticDegreeArrays(value));

  const mutantObservation = mutableRecord(mutant);
  if (caseId.startsWith("T1-LAW-") && mutantObservation !== null) {
    const semanticPredicate = mutableRecord(mutantObservation["semanticPredicate"]);
    if (semanticPredicate?.["passed"] === true) {
      semanticPredicate["passed"] = false;
      affected += 1;
      derivedTargets.push({
        targetId: `${caseId}/semanticPredicate.passed`,
        path: "$.semanticPredicate.passed",
      });
    }
  }
  if (caseId === "T1-OPSTATE-005" && spec.algorithm === "expose-partial-refusal-output" && mutantObservation !== null) {
    const result = mutableRecord(mutantObservation["result"]);
    const view = mutableRecord(mutantObservation["view"]);
    const partialValue = result !== null && "value" in result;
    const partial = partialValue ? mutableRecord(result["value"]) : null;
    if (result !== null && view !== null) {
      const derivedView = {
        partialValue,
        partialRealizations: partial !== null && "realizations" in partial,
        partialWarnings: partial !== null && "warnings" in partial,
        altSelection: partial !== null && "chosenVariant" in partial,
      };
      for (const [key, value] of Object.entries(derivedView)) {
        if (view[key] === value) continue;
        view[key] = value;
        affected += 1;
        derivedTargets.push({
          targetId: `${caseId}/view.${key}`,
          path: `$.view.${key}`,
        });
      }
    }
  }
  const mutantBody = mutableRecord(mutant);
  if (
    mutantBody !== null && Array.isArray(mutantBody["cells"]) &&
    typeof mutantBody["degreeSpellings"] === "number" && typeof mutantBody["semanticDigest"] === "string"
  ) {
    const digest = sha256(mutantBody["cells"]);
    if (mutantBody["semanticDigest"] !== digest) {
      mutantBody["semanticDigest"] = digest;
      affected += 1;
      derivedTargets.push({ targetId: `${caseId}/semanticDigest`, path: "$.semanticDigest" });
    }
  }
  return {
    mutatedProjection: canonicalJsonValue(mutant),
    affectedCount: affected,
    selectorId: selection.selectorId,
    selectedTargets: [
      ...selection.targets.map(({ targetId, path }) => ({ targetId, path })),
      ...derivedTargets,
    ],
  };
}

function semanticMismatchPaths(
  baseline: unknown,
  mutant: unknown,
  path = "$",
): readonly string[] {
  if (Object.is(baseline, mutant)) return [];
  if (Array.isArray(baseline) && Array.isArray(mutant)) {
    return [...new Set(Array.from(
      { length: Math.max(baseline.length, mutant.length) },
      (_, index) => semanticMismatchPaths(baseline[index], mutant[index], `${path}[${String(index)}]`),
    ).flat())].sort();
  }
  const left = mutableRecord(baseline);
  const right = mutableRecord(mutant);
  if (left !== null && right !== null) {
    const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
    return [...new Set(keys.flatMap((key) => semanticMismatchPaths(left[key], right[key], `${path}.${key}`)))].sort();
  }
  return [path];
}

function mismatchIsWithinSelectedTarget(
  mismatchPath: string,
  selectedPath: string,
): boolean {
  return selectedPath === "$" || mismatchPath === selectedPath ||
    mismatchPath.startsWith(`${selectedPath}.`) ||
    mismatchPath.startsWith(`${selectedPath}[`);
}

const ORACLE_FIELDS_BY_ALGORITHM: Readonly<Record<string, readonly string[]>> = {
  "rewrite-degree-identity": ["degrees", "required", "optional", "guide", "requiredDegrees", "optionalDegrees", "guideToneDegrees", "degree"],
  "move-degree-role": ["required", "optional", "requiredDegrees", "optionalDegrees"],
  "remove-degree": ["degrees", "required", "optional", "guide", "requiredDegrees", "optionalDegrees", "guideToneDegrees"],
  "append-semantic-degree": ["degrees", "required", "optional", "guide", "requiredDegrees", "optionalDegrees", "guideToneDegrees"],
  "retain-suspension-third": ["degrees", "required", "optional", "guide", "requiredDegrees", "optionalDegrees", "guideToneDegrees", "warnings"],
  "collapse-equal-pitch-class-records": ["spelledPitchNames", "pitchClasses"],
  "reuse-root-letter": ["root", "degree", "spelled", "pitchClass"],
  "pitch-class-first-enharmonic": ["root", "degree", "spelled", "pitchClass"],
  "accept-accidental-overflow": ["ok", "refusal", "value", "cells", "successes", "refusals", "minimumRequiredAlteration", "maximumRequiredAlteration", "semanticDigest"],
  "drop-diatonic-transposition": ["recipeObservation", "semanticPredicate", "targetSnapshot", "inverseSnapshot", "source", "target", "root", "spelled", "spelledPitchNames", "pitchClasses", "bass"],
  "leave-slash-bass-untransposed": ["targetSnapshot", "inverseSnapshot", "bass", "semanticPredicate"],
  "keep-first-altered-realization": ["realizations", "semanticOutputRecords", "spellingAttempts", "chosenVariant", "variantOrder"],
  "reverse-altered-realization-order": ["realizations", "variantOrder"],
  "merge-equal-altered-realizations": ["realizations", "variantOrder"],
  "remove-explicit-add-three": ["degrees", "required", "optional", "guide", "requiredDegrees", "optionalDegrees", "guideToneDegrees"],
  "retain-extension-natural-closure": ["degrees", "required", "optional", "guide", "requiredDegrees", "optionalDegrees", "guideToneDegrees"],
  "retain-one-omitted-alteration": ["degrees", "required", "optional", "guide", "requiredDegrees", "optionalDegrees", "guideToneDegrees"],
  "addition-implies-extension-closure": ["degrees", "required", "optional", "guide", "requiredDegrees", "optionalDegrees", "guideToneDegrees"],
  "move-highest-extension-to-optional": ["required", "optional", "requiredDegrees", "optionalDegrees"],
  "move-identity-fifth-to-optional": ["required", "optional", "requiredDegrees", "optionalDegrees"],
  "append-guide-degree": ["guide", "guideToneDegrees"],
  "suppress-omission-warning": ["warnings"],
  "emit-warning-for-present-omission": ["warnings"],
  "insert-slash-bass-into-membership": ["bass", "spelledPitchNames", "pitchClasses", "degrees"],
  "discard-slash-bass": ["bass"],
  "deduplicate-custom-pitches": ["spelledPitchNames", "pitchClasses"],
  "sort-custom-pitches-by-pitch-class": ["spelledPitchNames", "pitchClasses"],
  "infer-custom-formula": ["kind", "id", "formulaRuleId", "degrees", "requiredDegrees", "optionalDegrees", "guideToneDegrees", "limitations", "spelledPitchNames", "pitchClasses"],
  "expose-partial-refusal-output": ["ok", "refusal", "value", "view", "partialValue", "partialRealizations", "partialWarnings", "altSelection"],
  "rewrite-refusal-path-to-generated-output": ["path", "refusal"],
  "advance-first-excess-bound": ["field", "firstExcessIndex", "countRefusalObserved", "invalidationReason", "evidence", "result"],
  "reject-parsed-modifier-vocabulary": ["ok", "value", "refusal", "degrees"],
  "duplicate-cross-category-degree": ["degrees", "required", "optional", "requiredDegrees", "optionalDegrees", "semanticPredicate"],
  "accept-seventeenth-semantic-degree": ["ok", "refusal", "value", "evidence"],
  "rewrite-abdim7-directed-spelling": ["degree", "spelled", "pitchClass"],
  "fallback-unsupported-family": ["ok", "refusal", "value", "acceptedStates", "outcomeCounts", "reasonAndConflictCounts", "acceptedRuleIdCounts", "refusalRuleIdCounts", "orderedPublicOutcomes", "semanticDigest", "counterfactualDigestProof", "semanticPredicate"],
  "reverse-refusal-precedence": ["result", "refusal", "id"],
  "restrict-public-spelling-domain": ["cells", "successes", "refusals", "semanticDigest"],
};

function collectOracleFields(
  value: unknown,
  fieldNames: ReadonlySet<string>,
  path = "$",
): readonly Readonly<{ path: string; value: unknown }>[] {
  const fields: Array<Readonly<{ path: string; value: unknown }>> = [];
  if (Array.isArray(value)) {
    value.forEach((child, index) => {
      fields.push(...collectOracleFields(child, fieldNames, `${path}[${String(index)}]`));
    });
    return fields;
  }
  const body = mutableRecord(value);
  if (body === null) return fields;
  for (const [key, child] of Object.entries(body)) {
    const childPath = `${path}.${key}`;
    if (fieldNames.has(key)) fields.push({ path: childPath, value: child });
    fields.push(...collectOracleFields(child, fieldNames, childPath));
  }
  return fields;
}

function semanticOracleProjection(
  spec: SemanticOperatorSpec,
  caseId: string,
  candidate: unknown,
): unknown {
  const selection = selectSemanticTargets(spec, caseId, candidate);
  const fieldNames = ORACLE_FIELDS_BY_ALGORITHM[spec.algorithm];
  if (fieldNames === undefined) {
    throw new Error(`${spec.controlId} semantic oracle fields missing`);
  }
  return canonicalJsonValue(selection.targets.map(({ targetId, path, value }) => ({
    targetId,
    path,
    projection: spec.algorithm === "reverse-refusal-precedence" ||
      (spec.algorithm === "rewrite-refusal-path-to-generated-output" && caseId === "T1-OPSTATE-008")
      ? value
      : collectOracleFields(value, new Set(fieldNames)),
  })));
}

function nestedRecords(value: unknown): readonly Record<string, unknown>[] {
  const output: Record<string, unknown>[] = [];
  const visit = (item: unknown): void => {
    if (Array.isArray(item)) {
      item.forEach(visit);
      return;
    }
    const body = mutableRecord(item);
    if (body === null) return;
    output.push(body);
    Object.values(body).forEach(visit);
  };
  visit(value);
  return output;
}

function semanticDegreeCount(
  candidate: unknown,
  degree: string,
  keys = DEGREE_ARRAY_KEYS,
): number {
  const includeStandaloneDegreeRecords = keys === DEGREE_ARRAY_KEYS;
  return nestedRecords(candidate).reduce((sum, entry) => sum +
    (includeStandaloneDegreeRecords && degreeMatches(entry["degree"], degree) ? 1 : 0) +
    Object.entries(entry).reduce((entrySum, [key, value]) =>
      entrySum + (keys.has(key) && Array.isArray(value)
        ? value.filter((item) => degreeMatches(item, degree)).length
        : 0), 0), 0);
}

function roleDegreeCount(
  candidate: unknown,
  degree: string,
  role: "required" | "optional" | "guide",
): number {
  const keys = role === "required"
    ? new Set(["required", "requiredDegrees"])
    : role === "optional"
      ? new Set(["optional", "optionalDegrees"])
      : new Set(["guide", "guideToneDegrees"]);
  return semanticDegreeCount(candidate, degree, keys);
}

function fixtureExpectationSource(caseId: string): string {
  if (caseId.startsWith("T1-FORMULA-") || caseId === "T1-ROOT-MATRIX-001") {
    return `formula-rules.json+all-root-cases.json:${caseId}`;
  }
  if (caseId.startsWith("T1-LIT-")) return `literal-cases.json:${caseId}.expected`;
  if (caseId.startsWith("T1-SPELL-")) return `spelling-cases.json:${caseId}.expected`;
  if (caseId.startsWith("T1-CUSTOM-")) return `custom-cases.json:${caseId}.expected`;
  if (caseId.startsWith("T1-OPSTATE-")) return `operation-state-cases.json:${caseId}`;
  if (caseId.startsWith("T1-LAW-")) return `law-cases.json:${caseId}`;
  return `reviewed-resolution-corpus:${caseId}`;
}

function reviewedFixtureExpectation(caseId: string): unknown {
  if (caseId.startsWith("T1-FORMULA-")) {
    return formulaFixture.rules.find(({ id }) => id === caseId);
  }
  if (caseId === "T1-ROOT-MATRIX-001") {
    return {
      matrix: rootFixture.matrixCase,
      roots: rootFixture.roots,
      formulas: formulaFixture.rules,
    };
  }
  if (caseId === "T1-FAMILY-STATE-MATRIX-001") {
    return formulaFixture.familyStateMatrix.expected;
  }
  if (caseId === spellingFixture.publicDegreeMatrix.id) {
    return spellingFixture.publicDegreeMatrix.expected;
  }
  if (caseId === "T1-CORRECTION-ABDIM7") {
    return spellingFixture.cases.filter(({ id }) => id === "T1-SPELL-006" || id === "T1-SPELL-007");
  }
  if (caseId.startsWith("T1-LIT-")) {
    return literalFixture.cases.find(({ id }) => id === caseId)?.expected;
  }
  if (caseId.startsWith("T1-SPELL-")) {
    return spellingFixture.cases.find(({ id }) => id === caseId)?.expected;
  }
  if (caseId.startsWith("T1-CUSTOM-")) {
    const fixture = customFixture.cases.find(({ id }) => id === caseId);
    return fixture === undefined ? undefined : {
      input: fixture.input,
      sourceInput: fixture.sourceInput,
      transposedInput: fixture.transposedInput,
      expected: fixture.expected,
    };
  }
  if (caseId.startsWith("T1-OPSTATE-")) {
    return operationStateFixture.cases.find(({ id }) => id === caseId);
  }
  if (caseId.startsWith("T1-LAW-")) {
    return lawFixture.cases.find(({ id }) => id === caseId);
  }
  return { caseId };
}

function independentSemanticAccepted(
  spec: SemanticOperatorSpec,
  caseId: string,
  candidate: unknown,
): boolean {
  const parameter = (key: string): unknown => spec.parameters[key];
  const selection = selectSemanticTargets(spec, caseId, candidate);
  candidate = selection.targets.length === 1
    ? selection.targets[0]?.value
    : selection.targets.map(({ value }) => value);
  const records = nestedRecords(candidate);
  switch (spec.algorithm) {
    case "rewrite-degree-identity":
      return semanticDegreeCount(candidate, String(parameter("from"))) > 0;
    case "move-degree-role":
      return roleDegreeCount(candidate, String(parameter("degree")), parameter("from") as "required" | "optional") > 0;
    case "remove-degree":
      return (parameter("degrees") as readonly string[]).every((degree) => semanticDegreeCount(candidate, degree) > 0);
    case "append-semantic-degree":
      return semanticDegreeCount(candidate, String(parameter("degree"))) === 0;
    case "retain-suspension-third":
      return caseId === "T1-LIT-055"
        ? records.some((entry) => Array.isArray(entry["warnings"]) && entry["warnings"].some((warning) => mutableRecord(warning)?.["code"] === "theory.omission_absent"))
        : semanticDegreeCount(candidate, "3") === 0;
    case "collapse-equal-pitch-class-records":
      return records.some((entry) => Array.isArray(entry["spelledPitchNames"]) && Array.isArray(entry["pitchClasses"]) && entry["spelledPitchNames"].length === 2 && entry["pitchClasses"].length === 2 && entry["pitchClasses"][0] === entry["pitchClasses"][1]);
    case "reuse-root-letter":
      return records.some((entry) => mutableRecord(entry["root"])?.["step"] !== undefined && mutableRecord(entry["spelled"])?.["step"] !== mutableRecord(entry["root"])?.["step"]);
    case "pitch-class-first-enharmonic": {
      const fixture = spellingFixture.cases.find(({ id }) => id === caseId);
      return fixture !== undefined && records.some((entry) => canonicalJson(entry["spelled"]) === canonicalJson(fixture.expected["spelled"]));
    }
    case "accept-accidental-overflow":
      return caseId === "T1-SPELL-PUBLIC-MATRIX-001"
        ? records.some((entry) =>
            entry["cells"] === spellingFixture.publicDegreeMatrix.expected.totalCells &&
            entry["successes"] === spellingFixture.publicDegreeMatrix.expected.successCells &&
            entry["refusals"] === spellingFixture.publicDegreeMatrix.expected.refusalCells &&
            entry["minimumRequiredAlteration"] === spellingFixture.publicDegreeMatrix.expected.minimumRequiredAlteration &&
            entry["maximumRequiredAlteration"] === spellingFixture.publicDegreeMatrix.expected.maximumRequiredAlteration &&
            entry["semanticDigest"] === spellingFixture.publicDegreeMatrix.expected.orderedCellSemanticSha256)
        : records.some((entry) => entry["ok"] === false && mutableRecord(entry["refusal"])?.["code"] === "theory.spelling_accidental_out_of_range");
    case "drop-diatonic-transposition": {
      const law = lawFixture.cases.find(({ id }) => id === caseId);
      const recipe = law?.transpositionRecipe;
      if (recipe === undefined) return false;
      if (caseId === "T1-LAW-004") {
        return selection.targets.every(({ value }) =>
          canonicalJson(value) === canonicalJson(recipe["reviewedTargetSnapshot"]));
      }
      const rows = recipe["reviewedProjectionRows"];
      return Array.isArray(rows) && rows.every((row) => {
        const expected = record(row, "law five expected row");
        return records.some((entry) => canonicalJson(mutableRecord(entry["source"])?.["value"] !== undefined ? mutableRecord(mutableRecord(entry["source"])?.["value"])?.["spelled"] : undefined) === canonicalJson(expected["sourceSpelling"]) && canonicalJson(mutableRecord(mutableRecord(entry["target"])?.["value"])?.["spelled"]) === canonicalJson(expected["targetSpelling"]));
      });
    }
    case "leave-slash-bass-untransposed": {
      const law = lawFixture.cases.find(({ id }) => id === caseId);
      const expected = law?.transpositionRecipe?.["reviewedTargetSnapshot"];
      return expected !== undefined && selection.targets.every(({ value }) =>
        canonicalJson(value) === canonicalJson(expected));
    }
    case "keep-first-altered-realization": {
      const expectedOrder = ["alt-b9-b5", "alt-b9-sharp5", "alt-sharp9-b5", "alt-sharp9-sharp5"];
      return records.some((entry) =>
        (Array.isArray(entry["realizations"]) && entry["realizations"].length === 4) ||
        (entry["realizations"] === 4 &&
          canonicalJson(entry["variantOrder"]) === canonicalJson(expectedOrder) &&
          typeof entry["semanticOutputRecords"] === "number" && entry["semanticOutputRecords"] > 0 &&
          entry["semanticOutputRecords"] === entry["spellingAttempts"] &&
          entry["chosenVariant"] === null));
    }
    case "merge-equal-altered-realizations":
      return records.some((entry) => Array.isArray(entry["realizations"]) && entry["realizations"].length === 4);
    case "reverse-altered-realization-order": {
      const expected = ["alt-b9-b5", "alt-b9-sharp5", "alt-sharp9-b5", "alt-sharp9-sharp5"];
      return records.some((entry) => canonicalJson(entry["variantOrder"]) === canonicalJson(expected) || (Array.isArray(entry["realizations"]) && canonicalJson(entry["realizations"].map((value) => mutableRecord(value)?.["id"])) === canonicalJson(expected)));
    }
    case "remove-explicit-add-three":
      return semanticDegreeCount(candidate, "3", new Set(DEGREE_ARRAY_KEYS)) > 0;
    case "retain-extension-natural-closure":
      return (parameter("degrees") as readonly string[]).every((degree) => semanticDegreeCount(candidate, degree) === 0);
    case "retain-one-omitted-alteration":
      {
        const variants = records.filter((entry) => {
          const id = entry["id"];
          return typeof id === "string" && id.startsWith("alt-");
        });
        return variants.length === 4 && variants.every((entry) =>
          Array.isArray(entry["degrees"]) &&
          entry["degrees"].every((degree) => !degreeMatches(degree, String(parameter("degree"))) && !degreeMatches(degree, "b5")));
      }
    case "addition-implies-extension-closure":
      return semanticDegreeCount(candidate, "b7") === 0 || semanticDegreeCount(candidate, "9") === 0;
    case "move-highest-extension-to-optional":
      return ["13", "11", "9"].some((degree) => roleDegreeCount(candidate, degree, "required") > 0);
    case "move-identity-fifth-to-optional":
      return ["5", "b5", "#5"].some((degree) => roleDegreeCount(candidate, degree, "required") > 0);
    case "append-guide-degree":
      return roleDegreeCount(candidate, String(parameter("degree")), "guide") === 0;
    case "suppress-omission-warning":
      return records.some((entry) => Array.isArray(entry["warnings"]) && entry["warnings"].some((warning) => mutableRecord(warning)?.["code"] === "theory.omission_absent"));
    case "emit-warning-for-present-omission":
      {
        const warningLists = records.filter((entry) => Array.isArray(entry["warnings"]));
        return warningLists.length > 0 && warningLists.every((entry) => canonicalJson(entry["warnings"]) === "[]");
      }
    case "insert-slash-bass-into-membership":
      {
        if (caseId.startsWith("T1-CUSTOM-")) {
          const fixture = customFixture.cases.find(({ id }) => id === caseId);
          const body = mutableRecord(candidate);
          const bass = body?.["bass"];
          const spellings = body?.["spelledPitchNames"];
          const pitchClasses = body?.["pitchClasses"];
          return fixture?.input !== undefined && body?.["degrees"] === null &&
            canonicalJson(spellings) === canonicalJson(fixture.input.pitchNames) &&
            canonicalJson(pitchClasses) === canonicalJson(fixture.expected["pitchClasses"]) &&
            Array.isArray(spellings) && !spellings.some((spelling) => canonicalJson(spelling) === canonicalJson(bass));
        }
        const fixture = literalFixture.cases.find(({ id }) => id === caseId);
        const formulaId = fixture?.expected["formulaId"];
        const expectedDegrees = Array.isArray(fixture?.expected["degrees"])
          ? fixture.expected["degrees"]
          : typeof formulaId === "string"
            ? formulaFixture.rules.find(({ id }) => id === formulaId)?.degrees
            : undefined;
        if (!Array.isArray(expectedDegrees)) return false;
        const membershipLists = records.filter((entry) => Array.isArray(entry["spelledPitchNames"]) && Array.isArray(entry["pitchClasses"]));
        return membershipLists.length > 0 && membershipLists.every((entry) => {
          const spellings = entry["spelledPitchNames"] as unknown[];
          const pitchClasses = entry["pitchClasses"] as unknown[];
          const degrees = entry["degrees"];
          if (!Array.isArray(degrees) || degrees.length !== expectedDegrees.length || spellings.length !== expectedDegrees.length || pitchClasses.length !== expectedDegrees.length) return false;
          const tuples = spellings.map((spelling, index) => ({
            degree: (degrees as unknown[])[index],
            spelling,
            pitchClass: pitchClasses[index],
          }));
          return new Set(tuples.map(canonicalJson)).size === tuples.length;
        });
      }
    case "discard-slash-bass":
      return mutableRecord(candidate)?.["ok"] === true
        ? mutableRecord(mutableRecord(candidate)?.["value"])?.["bass"] !== null &&
          mutableRecord(mutableRecord(candidate)?.["value"])?.["bass"] !== undefined
        : mutableRecord(candidate)?.["bass"] !== null && mutableRecord(candidate)?.["bass"] !== undefined;
    case "deduplicate-custom-pitches": {
      const fixture = customFixture.cases.find(({ id }) => id === caseId);
      return fixture?.input !== undefined && records.some((entry) => canonicalJson(entry["spelledPitchNames"]) === canonicalJson(fixture.input?.pitchNames));
    }
    case "sort-custom-pitches-by-pitch-class": {
      const fixture = customFixture.cases.find(({ id }) => id === caseId);
      return fixture?.input !== undefined && records.some((entry) => canonicalJson(entry["spelledPitchNames"]) === canonicalJson(fixture.input?.pitchNames));
    }
    case "infer-custom-formula":
      return records.some((entry) =>
        entry["kind"] === "custom" && entry["id"] === "custom" && entry["formulaRuleId"] === "custom" &&
        entry["degrees"] === null && entry["requiredDegrees"] === null &&
        entry["optionalDegrees"] === null && entry["guideToneDegrees"] === null &&
        canonicalJson(entry["limitations"]) === canonicalJson(["custom.no_degree_analysis", "custom.no_auto_voicing"]));
    case "expose-partial-refusal-output":
      return records.some((entry) => entry["ok"] === false && !("value" in entry));
    case "rewrite-refusal-path-to-generated-output":
      return caseId === "T1-OPSTATE-008"
        ? Array.isArray(candidate) && candidate.every((path) => Array.isArray(path) && !path.includes("realizations"))
        : records.some((entry) => Array.isArray(entry["path"]) && !entry["path"].includes("realizations"));
    case "advance-first-excess-bound": {
      const field = String(parameter("field"));
      const fixtureRow = firstExcessFixtureRow(field);
      const expectedIndex = fixtureRow["firstExcessIndex"];
      const expectedRefusal = fixtureRow["expectedRefusal"];
      const selectedRow = mutableRecord(selection.targets[0]?.value);
      const proof = mutableRecord(selectedRow?.["firstExcessProof"]);
      const evidence = mutableRecord(proof?.["evidence"]);
      return typeof expectedIndex === "number" && selectedRow !== null && proof !== null &&
        proof["field"] === field && proof["firstExcessIndex"] === expectedIndex &&
        canonicalJson(selectedRow["result"]) === canonicalJson({ ok: false, refusal: expectedRefusal }) &&
        canonicalJson(proof["result"]) === canonicalJson({ ok: false, refusal: expectedRefusal }) &&
        evidence !== null && evidence["inputDegreeRecordsVisited"] === expectedIndex + 1 &&
        evidence["termination"] === "formula-refusal" && !("evidence" in selectedRow);
    }
    case "reject-parsed-modifier-vocabulary":
      return records.some((entry) => entry["ok"] === true && "value" in entry);
    case "duplicate-cross-category-degree":
      return selection.targets.every((target) => {
        const directDegrees = mutableRecord(target.value)?.["degrees"];
        const lists = Array.isArray(directDegrees) && directDegrees.length > 0 && Array.isArray(directDegrees[0])
          ? [directDegrees[0] as unknown[]]
          : nestedRecords(target.value).flatMap((entry) =>
              typeof entry["formulaRuleId"] === "string" && Array.isArray(entry["degrees"])
                ? [entry["degrees"] as unknown[]]
                : []);
        return lists.length > 0 && lists.every((list) =>
          list.filter((degree) => degreeMatches(degree, "9")).length === 1);
      });
    case "accept-seventeenth-semantic-degree":
      return records.some((entry) => entry["ok"] === false && mutableRecord(entry["refusal"])?.["code"] === "limit.theory_realization_degrees_exceeded");
    case "rewrite-abdim7-directed-spelling":
      return records.some((entry) => mutableRecord(entry["spelled"])?.["step"] === "G" && mutableRecord(entry["spelled"])?.["alter"] === -2);
    case "fallback-unsupported-family":
      return caseId === "T1-FAMILY-STATE-MATRIX-001"
        ? records.some((entry) =>
            entry["acceptedStates"] === formulaFixture.familyStateMatrix.expected.acceptedStates &&
            canonicalJson(entry["outcomeCounts"]) === canonicalJson(formulaFixture.familyStateMatrix.expected.outcomeCounts) &&
            canonicalJson(entry["reasonAndConflictCounts"]) === canonicalJson(formulaFixture.familyStateMatrix.expected.reasonAndConflictCounts) &&
            canonicalJson(entry["acceptedRuleIdCounts"]) === canonicalJson(formulaFixture.familyStateMatrix.expected.acceptedRuleIdCounts) &&
            canonicalJson(entry["refusalRuleIdCounts"]) === canonicalJson(formulaFixture.familyStateMatrix.expected.refusalRuleIdCounts) &&
            entry["semanticDigest"] === formulaFixture.familyStateMatrix.expected.orderedPublicOutcomeSemanticSha256)
        : selection.targets.every(({ targetId, value }) => {
            const fixture = literalFixture.cases.find(({ id }) => id === targetId);
            return fixture !== undefined && canonicalJson(value) === canonicalJson({
              ok: false,
              refusal: fixture.expected["refusal"],
            });
          });
    case "reverse-refusal-precedence": {
      const fixture = operationStateFixture.cases.find(({ id }) => id === caseId);
      const expectedRow = [...(fixture?.rows ?? []), ...(fixture?.reasonPrecedenceRows ?? [])]
        .find((row) => row.id === "T1-PRECEDENCE-001");
      const selected = selection.targets[0];
      const selectedRow = mutableRecord(selected?.value);
      return expectedRow !== undefined && selectedRow !== null && selectedRow["id"] === expectedRow.id &&
        canonicalJson(selectedRow["result"]) === canonicalJson({
          ok: false,
          refusal: expectedRow.expectedWinner,
        });
    }
    case "restrict-public-spelling-domain":
      return records.some((entry) =>
        entry["cells"] === spellingFixture.publicDegreeMatrix.expected.totalCells &&
        entry["successes"] === spellingFixture.publicDegreeMatrix.expected.successCells &&
        entry["refusals"] === spellingFixture.publicDegreeMatrix.expected.refusalCells &&
        entry["minimumRequiredAlteration"] === spellingFixture.publicDegreeMatrix.expected.minimumRequiredAlteration &&
        entry["maximumRequiredAlteration"] === spellingFixture.publicDegreeMatrix.expected.maximumRequiredAlteration &&
        entry["semanticDigest"] === spellingFixture.publicDegreeMatrix.expected.orderedCellSemanticSha256);
    default:
      throw new Error(`${spec.controlId} independent semantic oracle missing`);
  }
}

function evaluateSemanticOracle(
  spec: SemanticOperatorSpec,
  caseId: string,
  candidate: unknown,
  fixtureValidatedExpectedProjection: unknown,
): Readonly<{
  accepted: boolean;
  reviewedInvariantAccepted: boolean;
  exactExpectedProjectionMatch: boolean;
  projectionDigest: string;
  expectedProjectionDigest: string;
  reason: string;
  expectationSource: string;
  reviewedExpectationDigest: string;
}> {
  const projection = semanticOracleProjection(spec, caseId, candidate);
  const reviewedInvariantAccepted = independentSemanticAccepted(spec, caseId, candidate);
  const exactExpectedProjectionMatch =
    canonicalJson(projection) === canonicalJson(fixtureValidatedExpectedProjection);
  const accepted = reviewedInvariantAccepted && exactExpectedProjectionMatch;
  const expectationSource = fixtureExpectationSource(caseId);
  const reviewedExpectation = reviewedFixtureExpectation(caseId);
  if (reviewedExpectation === undefined) {
    throw new Error(`${spec.controlId}/${caseId} reviewed fixture expectation missing`);
  }
  return {
    accepted,
    reviewedInvariantAccepted,
    exactExpectedProjectionMatch,
    projectionDigest: sha256(projection),
    expectedProjectionDigest: sha256(fixtureValidatedExpectedProjection),
    reason: accepted
      ? `${spec.algorithm} satisfies the reviewed fixture invariant and its exact selected projection from ${expectationSource}`
      : `${spec.algorithm} violates the reviewed fixture invariant or its exact selected projection from ${expectationSource}`,
    expectationSource,
    reviewedExpectationDigest: sha256(reviewedExpectation),
  };
}

type CounterfactualCoherenceReport = Readonly<{
  accepted: boolean;
  spellingProjectionChecks: number;
  parallelTupleChecks: number;
  directedSpellingChecks: number;
  canonicalOrderChecks: number;
  rolePartitionChecks: number;
  resultUnionChecks: number;
  aggregateCouplingChecks: number;
  derivedStateChecks: number;
  refusalPathChecks: number;
  warningShapeChecks: number;
  namedExemptions: readonly string[];
  issues: readonly string[];
}>;

function degreeTokenList(value: unknown): readonly string[] | null {
  if (!Array.isArray(value)) return null;
  const tokens: string[] = [];
  for (const item of value) {
    const degree = chordDegreeValue(item);
    if (degree === null) return null;
    tokens.push(token(degree));
  }
  return tokens;
}

function counterfactualCoherenceReport(
  spec: SemanticOperatorSpec,
  caseId: string,
  baseline: unknown,
  candidate: unknown,
): CounterfactualCoherenceReport {
  const issues: string[] = [];
  const namedExemptions: string[] = [];
  let spellingProjectionChecks = 0;
  let parallelTupleChecks = 0;
  let directedSpellingChecks = 0;
  let canonicalOrderChecks = 0;
  let rolePartitionChecks = 0;
  let resultUnionChecks = 0;
  let aggregateCouplingChecks = 0;
  let derivedStateChecks = 0;
  let refusalPathChecks = 0;
  let warningShapeChecks = 0;
  const projectionFault = new Set([
    "reuse-root-letter",
    "pitch-class-first-enharmonic",
    "accept-accidental-overflow",
    "drop-diatonic-transposition",
    "rewrite-abdim7-directed-spelling",
  ]).has(spec.algorithm);
  const duplicateDegreeFault = spec.algorithm === "duplicate-cross-category-degree";
  const slashBassMembershipFault = spec.algorithm === "insert-slash-bass-into-membership";
  if (projectionFault) namedExemptions.push("directed-spelling-policy-is-the-named-fault");
  if (duplicateDegreeFault) namedExemptions.push("cross-category-degree-duplication-is-the-named-fault");
  if (slashBassMembershipFault) namedExemptions.push("slash-bass-membership-duplication-is-the-named-fault");
  if (spec.algorithm === "expose-partial-refusal-output") {
    namedExemptions.push("partial-refusal-value-is-the-named-fault");
  }
  if (spec.algorithm === "rewrite-refusal-path-to-generated-output") {
    namedExemptions.push("generated-output-refusal-path-is-the-named-fault");
  }

  const issue = (path: string, message: string): void => {
    issues.push(`${path}: ${message}`);
  };
  const visit = (
    value: unknown,
    path: string,
    inheritedRoot: SpelledPitchClass | null,
  ): void => {
    if (Array.isArray(value)) {
      (value as unknown[]).forEach((item, index) => {
        visit(item, `${path}[${String(index)}]`, inheritedRoot);
      });
      return;
    }
    const entry = mutableRecord(value);
    if (entry === null) return;
    const firstSpelling = Array.isArray(entry["spelledPitchNames"])
      ? spelledPitchValue(entry["spelledPitchNames"][0])
      : null;
    const root = rootForSemanticEntry(entry, inheritedRoot) ??
      (spec.algorithm === "infer-custom-formula" ? firstSpelling : null);
    if ("spelled" in entry || "pitchClass" in entry) {
      const projected = spelledPitchClass(entry["spelled"]);
      if (projected !== null && typeof entry["pitchClass"] === "number") {
        spellingProjectionChecks += 1;
        if (projected !== asPitchClass(entry["pitchClass"])) issue(path, "spelled pitch does not project to pitchClass");
      } else if ("spelled" in entry && "pitchClass" in entry) {
        issue(path, "spelled/pitchClass pair is malformed");
      }
    }
    const spellings = entry["spelledPitchNames"];
    const pitchClasses = entry["pitchClasses"];
    if ("spelledPitchNames" in entry) {
      if (!Array.isArray(spellings) || !Array.isArray(pitchClasses)) {
        issue(path, "parallel spelling and pitch-class arrays are not both arrays");
      } else {
        parallelTupleChecks += 1;
        if (spellings.length !== pitchClasses.length) issue(path, "spelling and pitch-class arity differs");
        const degrees = degreeTokenList(entry["degrees"]);
        if (!duplicateDegreeFault && degrees !== null && degrees.length !== spellings.length) {
          issue(path, "degree, spelling, and pitch-class arity differs");
        }
        const tupleCount = Math.min(spellings.length, pitchClasses.length);
        for (let index = 0; index < tupleCount; index += 1) {
          const projected = spelledPitchClass(spellings[index]);
          spellingProjectionChecks += 1;
          if (projected === null || typeof pitchClasses[index] !== "number" || projected !== asPitchClass(Number(pitchClasses[index]))) {
            issue(`${path}.spelledPitchNames[${String(index)}]`, "spelling does not project to paired pitch class");
          }
          if (!projectionFault && !duplicateDegreeFault && root !== null && degrees !== null && index < degrees.length) {
            const degree = chordDegreeValue((entry["degrees"] as unknown[])[index]);
            if (degree !== null) {
              const expected = independentSpelling(root, degree);
              directedSpellingChecks += 1;
              if (!expected.ok || canonicalJson(spellings[index]) !== canonicalJson(expected.value.spelled) || pitchClasses[index] !== expected.value.pitchClass) {
                issue(`${path}.degrees[${String(index)}]`, "derived spelling tuple disagrees with root and degree");
              }
            }
          }
        }
      }
    }
    for (const key of DEGREE_ARRAY_KEYS) {
      const tokens = degreeTokenList(entry[key]);
      if (tokens === null) continue;
      canonicalOrderChecks += 1;
      const canonicalTokens = [...tokens].sort(compareDegreeValues);
      if (canonicalJson(tokens) !== canonicalJson(canonicalTokens)) {
        issue(`${path}.${key}`, "degree list is not in canonical number/alteration order");
      }
      const duplicates = tokens.filter((degree, index) => tokens.indexOf(degree) !== index);
      if (duplicates.length > 0 && !duplicateDegreeFault && !slashBassMembershipFault) {
        issue(`${path}.${key}`, `degree list contains unexempted duplicates: ${[...new Set(duplicates)].join(",")}`);
      }
    }
    if (!duplicateDegreeFault) {
      const degrees = degreeTokenList(entry["degrees"]);
      if (degrees !== null) {
        for (const [requiredKey, optionalKey] of rolePairs()) {
          const required = degreeTokenList(entry[requiredKey]);
          const optional = degreeTokenList(entry[optionalKey]);
          if (required === null || optional === null) continue;
          rolePartitionChecks += 1;
          if (canonicalJson([...required, ...optional].sort(compareDegreeValues)) !== canonicalJson([...degrees].sort(compareDegreeValues))) {
            issue(path, `${requiredKey}/${optionalKey} does not partition degree membership`);
          }
          if (required.some((degree) => optional.includes(degree))) {
            issue(path, `${requiredKey}/${optionalKey} overlap`);
          }
        }
        for (const [guideKey, requiredKey] of [
          ["guide", "required"],
          ["guideToneDegrees", "requiredDegrees"],
        ] as const) {
          const guides = degreeTokenList(entry[guideKey]);
          const required = degreeTokenList(entry[requiredKey]);
          if (guides === null || required === null) continue;
          rolePartitionChecks += 1;
          const requiredCounts = new Map<string, number>();
          required.forEach((degree) => requiredCounts.set(degree, (requiredCounts.get(degree) ?? 0) + 1));
          const guideCounts = new Map<string, number>();
          guides.forEach((degree) => guideCounts.set(degree, (guideCounts.get(degree) ?? 0) + 1));
          if ([...guideCounts].some(([degree, count]) => count > (requiredCounts.get(degree) ?? 0))) {
            issue(path, `${guideKey} is not a ${requiredKey} multiset subset`);
          }
        }
      }
    }
    if (entry["kind"] === "semantic") {
      aggregateCouplingChecks += 1;
      if (
        !Array.isArray(entry["degrees"]) || !Array.isArray(entry["requiredDegrees"]) ||
        !Array.isArray(entry["optionalDegrees"]) || !Array.isArray(entry["guideToneDegrees"]) ||
        "limitations" in entry
      ) issue(path, "semantic realization metadata shape is incoherent");
    }
    if (entry["kind"] === "custom" && "spelledPitchNames" in entry) {
      aggregateCouplingChecks += 1;
      if (
        entry["formulaRuleId"] !== "custom" || entry["degrees"] !== null ||
        entry["requiredDegrees"] !== null || entry["optionalDegrees"] !== null ||
        entry["guideToneDegrees"] !== null ||
        canonicalJson(entry["limitations"]) !== canonicalJson(["custom.no_degree_analysis", "custom.no_auto_voicing"])
      ) issue(path, "custom realization metadata shape is incoherent");
    }
    if (typeof entry["ok"] === "boolean") {
      resultUnionChecks += 1;
      if (entry["ok"] && (!("value" in entry) || "refusal" in entry)) issue(path, "successful result union is malformed");
      if (!entry["ok"] && (!("refusal" in entry) || ("value" in entry && spec.algorithm !== "expose-partial-refusal-output"))) {
        issue(path, "refusal result union is malformed");
      }
    }
    const warnings = entry["warnings"];
    if (Array.isArray(warnings)) {
      for (const [index, warningValue] of warnings.entries()) {
        const warning = mutableRecord(warningValue);
        warningShapeChecks += 1;
        if (
          warning?.["code"] !== "theory.omission_absent" ||
          canonicalJson(warning["path"]) !== canonicalJson(["omissions", 0]) ||
          warning["degreeNumber"] !== 3 || typeof warning["message"] !== "string" || warning["message"].length === 0
        ) issue(`${path}.warnings[${String(index)}]`, "theory warning shape is incomplete");
      }
    }
    if (typeof entry["cells"] === "number" && typeof entry["successes"] === "number" && typeof entry["refusals"] === "number") {
      aggregateCouplingChecks += 1;
      if (entry["cells"] !== entry["successes"] + entry["refusals"]) issue(path, "cell outcomes do not sum to cells");
      if (typeof entry["semanticDigest"] !== "string" || entry["semanticDigest"].length !== 64) issue(path, "cell semantic digest missing");
    }
    if (typeof entry["realizations"] === "number" && Array.isArray(entry["variantOrder"])) {
      aggregateCouplingChecks += 1;
      if (entry["realizations"] !== entry["variantOrder"].length) issue(path, "realization count differs from variant order");
      if (typeof entry["semanticOutputRecords"] === "number" && typeof entry["spellingAttempts"] === "number" && entry["semanticOutputRecords"] !== entry["spellingAttempts"]) {
        issue(path, "altered semantic-output and spelling work counts differ");
      }
    }
    for (const [key, child] of Object.entries(entry)) {
      visit(child, `${path}.${key}`, root);
    }
  };
  visit(candidate, "$", null);

  const compareDigestCoupling = (left: unknown, right: unknown, path: string): void => {
    if (Array.isArray(left) && Array.isArray(right)) {
      const count = Math.min(left.length, right.length);
      for (let index = 0; index < count; index += 1) compareDigestCoupling(left[index], right[index], `${path}[${String(index)}]`);
      return;
    }
    const before = mutableRecord(left);
    const after = mutableRecord(right);
    if (before === null || after === null) return;
    if (typeof before["semanticDigest"] === "string" && typeof after["semanticDigest"] === "string") {
      const beforeBody = { ...before };
      const afterBody = { ...after };
      delete beforeBody["semanticDigest"];
      delete afterBody["semanticDigest"];
      if (canonicalJson(beforeBody) !== canonicalJson(afterBody)) {
        aggregateCouplingChecks += 1;
        if (before["semanticDigest"] === after["semanticDigest"]) issue(path, "changed aggregate retained its semantic digest");
      }
    }
    for (const key of Object.keys(before).filter((candidateKey) => candidateKey in after)) {
      compareDigestCoupling(before[key], after[key], `${path}.${key}`);
    }
  };
  compareDigestCoupling(baseline, candidate, "$" );

  if (spec.algorithm === "rewrite-refusal-path-to-generated-output") {
    const compareGeneratedPathMutation = (beforeValue: unknown, afterValue: unknown, path: string): void => {
      if (Array.isArray(beforeValue) || Array.isArray(afterValue)) {
        if (!Array.isArray(beforeValue) || !Array.isArray(afterValue)) {
          issue(path, "generated-path mutant changed non-path array shape");
          return;
        }
        const standaloneSourcePath = beforeValue.every((segment) => typeof segment === "string" || typeof segment === "number") &&
          canonicalJson(afterValue) === canonicalJson(["realizations", 0, ...beforeValue]);
        if (standaloneSourcePath) {
          refusalPathChecks += 1;
          return;
        }
        if (beforeValue.length !== afterValue.length) {
          issue(path, "generated-path mutant changed non-path array shape");
          return;
        }
        beforeValue.forEach((child, index) => {
          compareGeneratedPathMutation(child, afterValue[index], `${path}[${String(index)}]`);
        });
        return;
      }
      const beforeEntry = mutableRecord(beforeValue);
      const afterEntry = mutableRecord(afterValue);
      if (beforeEntry !== null || afterEntry !== null) {
        if (beforeEntry === null || afterEntry === null) {
          issue(path, "generated-path mutant changed non-path object shape");
          return;
        }
        const beforeKeys = Object.keys(beforeEntry).sort();
        const afterKeys = Object.keys(afterEntry).sort();
        if (canonicalJson(beforeKeys) !== canonicalJson(afterKeys)) {
          issue(path, "generated-path mutant changed non-path object keys");
          return;
        }
        for (const key of beforeKeys) {
          if (key === "path" && Array.isArray(beforeEntry[key]) && Array.isArray(afterEntry[key])) {
            const beforePath = beforeEntry[key] as unknown[];
            const afterPath = afterEntry[key] as unknown[];
            refusalPathChecks += 1;
            if (canonicalJson(afterPath) !== canonicalJson(["realizations", 0, ...beforePath])) {
              issue(`${path}.path`, "generated-output path is not the exact named prefix mutation");
            }
            continue;
          }
          compareGeneratedPathMutation(beforeEntry[key], afterEntry[key], `${path}.${key}`);
        }
        return;
      }
      if (!Object.is(beforeValue, afterValue)) issue(path, "generated-path mutant changed a non-path value");
    };
    compareGeneratedPathMutation(baseline, candidate, "$" );
    if (refusalPathChecks === 0) issue("$", "generated-output path mutant checked no source paths");
  }

  if (caseId.startsWith("T1-LAW-")) {
    const beforePredicate = mutableRecord(mutableRecord(baseline)?.["semanticPredicate"]);
    const afterPredicate = mutableRecord(mutableRecord(candidate)?.["semanticPredicate"]);
    derivedStateChecks += 1;
    const beforeEvidence = beforePredicate === null ? null : { ...beforePredicate };
    const afterEvidence = afterPredicate === null ? null : { ...afterPredicate };
    if (beforeEvidence !== null) delete beforeEvidence["passed"];
    if (afterEvidence !== null) delete afterEvidence["passed"];
    if (
      beforePredicate?.["passed"] !== true || afterPredicate?.["passed"] !== false ||
      beforeEvidence === null || afterEvidence === null ||
      canonicalJson(beforeEvidence) === canonicalJson(afterEvidence)
    ) issue("$.semanticPredicate", "mutated law evidence is not coupled to passed=false");
  }

  if (caseId === "T1-OPSTATE-005" && spec.algorithm === "expose-partial-refusal-output") {
    const observation = mutableRecord(candidate);
    const result = mutableRecord(observation?.["result"]);
    const partial = mutableRecord(result?.["value"]);
    const view = mutableRecord(observation?.["view"]);
    derivedStateChecks += 1;
    if (
      result?.["ok"] !== false || partial === null || view === null ||
      view["partialValue"] !== true ||
      view["partialRealizations"] !== ("realizations" in partial) ||
      view["partialWarnings"] !== ("warnings" in partial) ||
      view["altSelection"] !== ("chosenVariant" in partial) ||
      view["stateMutation"] !== "none" || view["sourceUnchanged"] !== true
    ) issue("$.view", "transactional-refusal view is stale relative to the partial result");
  }

  if (caseId === "T1-FAMILY-STATE-MATRIX-001" && spec.algorithm === "fallback-unsupported-family") {
    const beforeEntry = mutableRecord(baseline);
    const afterEntry = mutableRecord(candidate);
    const beforeOutcomes = beforeEntry?.["orderedPublicOutcomes"];
    const afterOutcomes = afterEntry?.["orderedPublicOutcomes"];
    const proof = mutableRecord(afterEntry?.["counterfactualDigestProof"]);
    aggregateCouplingChecks += 1;
    if (
      beforeEntry === null || afterEntry === null ||
      !Array.isArray(beforeOutcomes) || !Array.isArray(afterOutcomes) ||
      beforeOutcomes.length !== 896 || afterOutcomes.length !== 896
    ) {
      issue("$.orderedPublicOutcomes", "family counterfactual did not retain the exact 896-cell preimage");
    } else {
      const changedIndices = beforeOutcomes.flatMap((value, index) =>
        canonicalJson(value) === canonicalJson(afterOutcomes[index]) ? [] : [index]);
      const beforeCell = mutableRecord(beforeOutcomes[800]);
      const afterCell = mutableRecord(afterOutcomes[800]);
      const beforeExpected = mutableRecord(beforeCell?.["expected"]);
      const beforeRefusal = mutableRecord(beforeExpected?.["refusal"]);
      const afterExpected = mutableRecord(afterCell?.["expected"]);
      const afterValue = mutableRecord(afterExpected?.["value"]);
      const expectedSource = {
        ...formulaFixture.familyStateMatrix.sourceDefaults,
        triad: "power",
        sixth: null,
        seventh: "minor",
        extensions: [],
        additions: [],
        colorPolicy: "none",
      };
      if (
        canonicalJson(changedIndices) !== canonicalJson([800]) ||
        beforeCell === null || afterCell === null ||
        canonicalJson(beforeCell["facts"]) !== canonicalJson(afterCell["facts"]) ||
        beforeExpected?.["ok"] !== false ||
        beforeRefusal?.["code"] !== "theory.formula_family_unsupported" ||
        beforeRefusal["ruleId"] !== "base-power" ||
        afterExpected?.["ok"] !== true ||
        canonicalJson(afterValue?.["source"]) !== canonicalJson(expectedSource) ||
        sha256(beforeOutcomes) !== beforeEntry["semanticDigest"] ||
        sha256(afterOutcomes) !== afterEntry["semanticDigest"] ||
        proof?.["preimageKind"] !== "ordered-public-family-state-outcomes" ||
        proof["preimageLength"] !== 896 || proof["changedCellCount"] !== 1 || proof["changedIndex"] !== 800 ||
        canonicalJson(proof["changedFacts"]) !== canonicalJson(afterCell["facts"]) ||
        canonicalJson(proof["baselineExpected"]) !== canonicalJson(beforeCell["expected"]) ||
        canonicalJson(proof["mutantExpected"]) !== canonicalJson(afterCell["expected"]) ||
        proof["baselineDigest"] !== beforeEntry["semanticDigest"] ||
        proof["mutantDigest"] !== afterEntry["semanticDigest"]
      ) issue("$.counterfactualDigestProof", "family digest proof is not an exact replayable one-cell preimage mutation");

      const expectedOutcomeCounts = mutableJsonClone(beforeEntry["outcomeCounts"]);
      const expectedReasons = mutableJsonClone(beforeEntry["reasonAndConflictCounts"]);
      const expectedAcceptedRules = mutableJsonClone(beforeEntry["acceptedRuleIdCounts"]);
      const expectedRefusalRules = mutableJsonClone(beforeEntry["refusalRuleIdCounts"]);
      const expectedOutcomesBody = mutableRecord(expectedOutcomeCounts);
      const expectedReasonsBody = mutableRecord(expectedReasons);
      const expectedAcceptedBody = mutableRecord(expectedAcceptedRules);
      const expectedRefusalBody = mutableRecord(mutableRecord(expectedRefusalRules)?.["theory.formula_family_unsupported"]);
      if (
        expectedOutcomesBody === null || expectedReasonsBody === null ||
        expectedAcceptedBody === null || expectedRefusalBody === null
      ) {
        issue("$", "baseline family summary maps are malformed");
      } else {
        expectedOutcomesBody["accepted"] = Number(expectedOutcomesBody["accepted"]) + 1;
        expectedOutcomesBody["theory.formula_family_unsupported"] = Number(expectedOutcomesBody["theory.formula_family_unsupported"]) - 1;
        expectedReasonsBody["unsupported-seventh"] = Number(expectedReasonsBody["unsupported-seventh"]) - 1;
        expectedAcceptedBody["base-power"] = Number(expectedAcceptedBody["base-power"] ?? 0) + 1;
        expectedRefusalBody["base-power"] = Number(expectedRefusalBody["base-power"]) - 1;
        if (
          afterEntry["totalStates"] !== beforeEntry["totalStates"] ||
          afterEntry["acceptedStates"] !== Number(beforeEntry["acceptedStates"]) + 1 ||
          canonicalJson(afterEntry["outcomeCounts"]) !== canonicalJson(expectedOutcomeCounts) ||
          canonicalJson(afterEntry["reasonAndConflictCounts"]) !== canonicalJson(expectedReasons) ||
          canonicalJson(afterEntry["acceptedRuleIdCounts"]) !== canonicalJson(expectedAcceptedRules) ||
          canonicalJson(afterEntry["refusalRuleIdCounts"]) !== canonicalJson(expectedRefusalRules)
        ) issue("$", "family aggregate deltas do not match the one-cell fallback");
      }
    }
  }

  if (spec.algorithm === "advance-first-excess-bound") {
    const field = String(spec.parameters["field"]);
    const fixtureRow = firstExcessFixtureRow(field);
    const oldIndex = Number(fixtureRow["firstExcessIndex"]);
    const expectedRefusal = mutableRecord(fixtureRow["expectedRefusal"]);
    const selected = selectSemanticTargets(spec, caseId, candidate).targets[0];
    const row = mutableRecord(selected?.value);
    const proof = mutableRecord(row?.["firstExcessProof"]);
    const proofRefusal = mutableRecord(mutableRecord(proof?.["result"])?.["refusal"]);
    const rowRefusal = mutableRecord(mutableRecord(row?.["result"])?.["refusal"]);
    const proofEvidence = mutableRecord(proof?.["evidence"]);
    const rowEvidence = mutableRecord(row?.["evidence"]);
    aggregateCouplingChecks += 1;
    if (
      expectedRefusal === null || row === null || proof === null ||
      proof["firstExcessIndex"] !== null || proof["countRefusalObserved"] !== false ||
      proof["invalidationReason"] !== "semantic-validation-before-raised-count-bound" ||
      canonicalJson(proofRefusal?.["path"]) !== canonicalJson(expectedRefusal["path"]) ||
      canonicalJson(proofRefusal?.["received"]) !== canonicalJson(expectedRefusal["received"]) || proofRefusal?.["reason"] !== "number" ||
      proofEvidence?.["inputDegreeRecordsVisited"] !== oldIndex + 1 || proofEvidence["termination"] !== "formula-refusal" ||
      canonicalJson(rowRefusal?.["path"]) !== canonicalJson(expectedRefusal["path"]) ||
      canonicalJson(rowRefusal?.["received"]) !== canonicalJson(expectedRefusal["received"]) || rowRefusal?.["reason"] !== "number" ||
      rowEvidence?.["inputDegreeRecordsVisited"] !== oldIndex + 1 || rowEvidence["termination"] !== "formula-refusal" ||
      canonicalJson(proof["result"]) !== canonicalJson(row["result"]) ||
      canonicalJson(proof["evidence"]) !== canonicalJson(row["evidence"])
    ) issue("$", "first-excess row/proof outcome is not coherently coupled");
  }
  if (spec.algorithm === "retain-one-omitted-alteration") {
    const variants = nestedRecords(candidate).filter((entry) => {
      const id = entry["id"];
      return typeof id === "string" && id.startsWith("alt-");
    });
    aggregateCouplingChecks += 1;
    if (variants.length !== 4 || variants.some((entry) => {
      const id = entry["id"];
      if (typeof id !== "string") return true;
      const degrees = entry["degrees"];
      const sharpCount = Array.isArray(degrees)
        ? degrees.filter((degree) => degreeMatches(degree, "#5")).length
        : 0;
      return id.endsWith("-sharp5") ? sharpCount !== 1 : sharpCount !== 0;
    })) issue("$", "retained fifth does not match the original altered-variant ID");
  }

  return {
    accepted: issues.length === 0,
    spellingProjectionChecks,
    parallelTupleChecks,
    directedSpellingChecks,
    canonicalOrderChecks,
    rolePartitionChecks,
    resultUnionChecks,
    aggregateCouplingChecks,
    derivedStateChecks,
    refusalPathChecks,
    warningShapeChecks,
    namedExemptions,
    issues,
  };
}

function executeSemanticCounterfactuals(state: ObservationState) {
  const specs = new Map(SEMANTIC_OPERATOR_REGISTRY.map((spec) => [spec.controlId, spec]));
  checkSame(state, specs.size, 53, "unique executable semantic operators");
  checkEqual(state, [...specs.keys()], mutationFixture.controls.map(({ id }) => id), "operator registry order");
  return mutationFixture.controls.map((control) => {
    const spec = specs.get(control.id);
    if (spec === undefined) throw new Error(`${control.id} operator missing`);
    const directKillerExecutions = control.killedByCaseIds.map((caseId) => {
      const runtime = observationRecord(state, caseId);
      const baselineProjection = runtime.payload;
      const applied = applyRuntimeCounterfactual(spec, caseId, baselineProjection);
      const mismatchPaths = semanticMismatchPaths(baselineProjection, applied.mutatedProjection);
      const counterfactualCoherence = counterfactualCoherenceReport(
        spec,
        caseId,
        baselineProjection,
        applied.mutatedProjection,
      );
      // Every observation is recorded only after its fixture-specific executor
      // has compared the complete reviewed surface. Capture the selected exact
      // projection once from that validated observation, then hold both the
      // baseline and counterfactual against the same immutable expectation.
      const fixtureValidatedExpectedProjection = semanticOracleProjection(
        spec,
        caseId,
        baselineProjection,
      );
      const baselineOracle = evaluateSemanticOracle(
        spec,
        caseId,
        baselineProjection,
        fixtureValidatedExpectedProjection,
      );
      const mutantOracle = evaluateSemanticOracle(
        spec,
        caseId,
        applied.mutatedProjection,
        fixtureValidatedExpectedProjection,
      );
      checkTrue(state, applied.affectedCount > 0, `${control.id}/${caseId} applicable`);
      checkTrue(state, mismatchPaths.length > 0, `${control.id}/${caseId} detected`);
      checkSame(
        state,
        counterfactualCoherence.accepted,
        true,
        `${control.id}/${caseId} coherent counterfactual: ${counterfactualCoherence.issues.join("; ")}`,
      );
      const outOfScopeMismatchPaths = mismatchPaths.filter((mismatchPath) =>
        !applied.selectedTargets.some(({ path }) =>
          mismatchIsWithinSelectedTarget(mismatchPath, path)));
      checkEqual(
        state,
        outOfScopeMismatchPaths,
        [],
        `${control.id}/${caseId} no collateral mutation outside selector`,
      );
      checkSame(state, baselineOracle.accepted, true, `${control.id}/${caseId} baseline oracle`);
      checkSame(state, mutantOracle.accepted, false, `${control.id}/${caseId} mutant oracle`);
      checkSame(
        state,
        mutantOracle.reviewedInvariantAccepted,
        false,
        `${control.id}/${caseId} mutant reviewed invariant`,
      );
      checkSame(state, baselineOracle.exactExpectedProjectionMatch, true, `${control.id}/${caseId} exact baseline projection`);
      checkSame(state, mutantOracle.exactExpectedProjectionMatch, false, `${control.id}/${caseId} exact mutant projection`);
      checkSame(
        state,
        mutantOracle.reviewedExpectationDigest,
        baselineOracle.reviewedExpectationDigest,
        `${control.id}/${caseId} same reviewed expectation`,
      );
      checkTrue(
        state,
        baselineOracle.projectionDigest !== mutantOracle.projectionDigest,
        `${control.id}/${caseId} detector-relevant projection changed`,
      );
      const preimage = {
        caseId,
        operatorId: control.id,
        applicability: {
          matched: applied.affectedCount > 0,
          affectedCount: applied.affectedCount,
          affectedPaths: mismatchPaths,
          selectorId: applied.selectorId,
          selectedTargets: applied.selectedTargets,
          outOfScopeMismatchPaths,
          counterfactualCoherence,
        },
        baselineProjection,
        mutatedProjection: applied.mutatedProjection,
        mutationOperation: {
          algorithm: spec.algorithm,
          parameters: spec.parameters,
          selectorId: applied.selectorId,
          selectedTargets: applied.selectedTargets,
        },
        detector: {
          oracleId: "reviewed-fixture-invariant-plus-fixture-validated-exact-selected-projection",
          expectationSource: baselineOracle.expectationSource,
          reviewedExpectationDigest: baselineOracle.reviewedExpectationDigest,
          fixtureValidatedExpectedProjection,
          expectedProjectionDigest: baselineOracle.expectedProjectionDigest,
          baselineAccepted: baselineOracle.accepted,
          baselineReviewedInvariantAccepted: baselineOracle.reviewedInvariantAccepted,
          baselineExactExpectedProjectionMatch: baselineOracle.exactExpectedProjectionMatch,
          baselineProjectionDigest: baselineOracle.projectionDigest,
          baselineReason: baselineOracle.reason,
          mutantAccepted: mutantOracle.accepted,
          mutantReviewedInvariantAccepted: mutantOracle.reviewedInvariantAccepted,
          mutantExactExpectedProjectionMatch: mutantOracle.exactExpectedProjectionMatch,
          mutantProjectionDigest: mutantOracle.projectionDigest,
          mutantReason: mutantOracle.reason,
          detectorRelevantProjectionChanged:
            baselineOracle.projectionDigest !== mutantOracle.projectionDigest,
          mismatchPaths,
          selectedTargets: applied.selectedTargets,
          outOfScopeMismatchPaths,
          counterfactualCoherence,
          expectedDetection: control.expectedDetection,
        },
        baselineObservationDigest: runtime.observationDigest,
      };
      return { ...preimage, executionDigest: sha256(preimage) };
    });
    const corroborativeById = new Map(
      (control.corroborativeLinks ?? []).map((link) => [link.caseId, link]),
    );
    const corroborativeObservations = (control.corroboratedByCaseIds ?? []).map((caseId) => {
      const link = corroborativeById.get(caseId);
      if (link === undefined) throw new Error(`${control.id}/${caseId} corroborative reason missing`);
      const runtime = observationRecord(state, caseId);
      return {
        caseId,
        reasonCode: link.reasonCode,
        reason: link.reason,
        observationDigest: runtime.observationDigest,
        observed: true as const,
      };
    });
    const preimage = {
      controlId: control.id,
      faultFamily: control.faultFamily,
      operator: control.operator,
      mutatedFault: control.mutatedFault,
      expectedDetection: control.expectedDetection,
      executionClass: "semantic-output-counterfactual" as const,
      directKillerExecutions,
      corroborativeObservations,
      directLinksExecuted: directKillerExecutions.length,
      directLinksKilled: directKillerExecutions.length,
      directLinksSurvived: 0,
      corroborativeLinksObserved: corroborativeObservations.length,
      killed: true as const,
    };
    return { ...preimage, executionDigest: sha256(preimage) };
  });
}

describe("T1 law and reviewed mutation-control conformance", () => {
  test("executes every law witness and discharges every reviewed control deterministically", () => {
    const first = executeHarness();
    const second = executeHarness();
    expect(second.formulaMatrix).toEqual(first.formulaMatrix);
    expect(second.publicSpellingMatrix).toEqual(first.publicSpellingMatrix);
    expect(second.lawDigests).toEqual(first.lawDigests);
    expect(second.traceCoverage).toEqual(first.traceCoverage);
    expect(second.observedCaseIds).toEqual(first.observedCaseIds);
    expect(second.observationDigests).toEqual(first.observationDigests);
    expect(second.observationInventoryDigest).toBe(first.observationInventoryDigest);

    const positiveWitnesses = lawFixture.cases.flatMap(({ positiveCaseIds }) =>
      positiveCaseIds.map((caseId) => caseId),
    );
    const nearMissWitnesses = lawFixture.cases.flatMap(({ nearMissCaseIds }) =>
      nearMissCaseIds.map((caseId) => caseId),
    );
    const transpositionWitnesses = lawFixture.cases.map(
      ({ transpositionCaseId }) => transpositionCaseId,
    );
    const mutationWitnessLinks = lawFixture.cases.flatMap(({ mutationControlIds }) =>
      mutationControlIds.map((controlId) => controlId),
    );

    const lawsPayload = {
      schema: "changes.evidence.t1-conformance-observation.v1",
      suite: "laws",
      producer: OBSERVATION_PRODUCER,
      fixtureSchema: lawFixture.schema,
      fixtureVersion: lawFixture.fixtureVersion,
      productionOutputUsed: lawFixture.productionOutputUsed,
      expectedValuesGenerated: lawFixture.expectedValuesGenerated,
      seed: HARNESS_SEED,
      deterministicReplayRuns: 2,
      lawIds: lawFixture.cases.map(({ id }) => id),
      lawsObserved: lawFixture.cases.length,
      positiveCaseIds: positiveWitnesses,
      nearMissCaseIds: nearMissWitnesses,
      transpositionCaseIds: transpositionWitnesses,
      positiveWitnessesObserved: positiveWitnesses.length,
      nearMissWitnessesObserved: nearMissWitnesses.length,
      transpositionWitnessesObserved: transpositionWitnesses.length,
      mutationWitnessLinksObserved: mutationWitnessLinks.length,
      uniqueWitnessCaseIds: [
        ...new Set([
          ...positiveWitnesses,
          ...nearMissWitnesses,
          ...transpositionWitnesses,
        ]),
      ].sort(),
      formulaMatrixCells: first.formulaMatrix.cells,
      formulaMatrixDegreeSpellings: first.formulaMatrix.degreeSpellings,
      formulaMatrixSemanticDigest: first.formulaMatrix.semanticDigest,
      familyStateCells: first.familyStateMatrix.totalStates,
      familyStateAccepted: first.familyStateMatrix.acceptedStates,
      familyStatePublicSemanticDigest: first.familyStateMatrix.semanticDigest,
      standaloneSpellingCells: first.publicSpellingMatrix.cells,
      standaloneSpellingSuccesses: first.publicSpellingMatrix.successes,
      standaloneSpellingRefusals: first.publicSpellingMatrix.refusals,
      standaloneSpellingMinimumRequiredAlteration:
        first.publicSpellingMatrix.minimumRequiredAlteration,
      standaloneSpellingMaximumRequiredAlteration:
        first.publicSpellingMatrix.maximumRequiredAlteration,
      standaloneSpellingSemanticDigest: first.publicSpellingMatrix.semanticDigest,
      lawObservationDigests: first.lawDigests,
      traceCaseIds: first.traceCoverage.traceCaseIds,
      traceCasesObserved: first.traceCoverage.traceCasesObserved,
      traceCasesUnaccounted: first.traceCoverage.traceCasesUnaccounted,
      observedCaseIds: first.observedCaseIds,
      observationDigests: first.observationDigests,
      observationRecords: first.observationRecords,
      observationInventoryDigest: first.observationInventoryDigest,
      lawProofRecords: first.lawProofRecords,
      traceProofRecords: first.traceProofRecords,
      authorityProofRecords: first.authorityProofRecords,
      runtimeExecutions: {
        parser: first.state.parserExecutions,
        resolver: first.state.resolverExecutions,
        evidenceResolver: first.state.evidenceResolverExecutions,
        speller: first.state.spellerExecutions,
        domainConstructor: first.state.domainConstructorExecutions,
      },
      assertionCount: first.state.assertions,
      status: "pass",
    } as const;

    const firstExecutions = executeSemanticCounterfactuals(first.state);
    const secondExecutions = executeSemanticCounterfactuals(second.state);
    expect(secondExecutions).toEqual(firstExecutions);
    const reviewedPairs = mutationFixture.controls.flatMap((control) =>
      (control.reviewedCaseLinkOrder ?? [
        ...control.killedByCaseIds,
        ...(control.corroboratedByCaseIds ?? []),
      ]).map((caseId) => ({ controlId: control.id, caseId })),
    );
    const directPairs = mutationFixture.controls.flatMap((control) =>
      control.killedByCaseIds.map((caseId) => ({ controlId: control.id, caseId })),
    );
    const corroborativePairs = mutationFixture.controls.flatMap((control) =>
      (control.corroboratedByCaseIds ?? []).map((caseId) => ({
        controlId: control.id,
        caseId,
      })),
    );
    const corroborativeInventory = mutationFixture.controls.flatMap((control) =>
      (control.corroborativeLinks ?? []).map((link) => ({
        controlId: control.id,
        caseId: link.caseId,
        reasonCode: link.reasonCode,
        reason: link.reason,
      })),
    );
    const linkedCaseLinks = reviewedPairs.length;
    const linkedCaseIds = [
      ...new Set(
        reviewedPairs.map(({ caseId }) => caseId),
      ),
    ].sort();
    const linkedCasesUnaccounted = linkedCaseIds.filter(
      (caseId) => !first.state.observed.has(caseId),
    );
    const caseObservationRecords = linkedCaseIds.map((caseId) =>
      observationRecord(first.state, caseId));
    const observationDigests = Object.fromEntries(caseObservationRecords.map(
      ({ caseId, observationDigest }) => [caseId, observationDigest],
    ));
    const controlExecutionDigests = Object.fromEntries(firstExecutions.map(
      ({ controlId, executionDigest }) => [controlId, executionDigest],
    ));
    expect(mutationFixture.controls).toHaveLength(53);
    expect(linkedCaseLinks).toBe(140);
    expect(directPairs).toHaveLength(124);
    expect(corroborativePairs).toHaveLength(16);
    expect(linkedCaseIds).toHaveLength(90);
    expect(linkedCasesUnaccounted).toEqual([]);
    expect(Object.keys(observationDigests)).toEqual(linkedCaseIds);
    expect(new Set(firstExecutions.map(({ controlId }) => controlId)).size).toBe(53);
    expect(Object.keys(controlExecutionDigests)).toEqual(
      mutationFixture.controls.map(({ id }) => id),
    );
    expect(sha256(reviewedPairs)).toBe(
      "fbf7124754ba69ec01ef246d4f42ba637b0f75effc95745d39a2cff55430b261",
    );
    expect(sha256(directPairs)).toBe(
      "37d96875c299e1d1411b778a9959af77ee278bff0b5bc7d60f4350db31f22bee",
    );
    expect(sha256(corroborativeInventory)).toBe(
      "d363a0332871b0b9d37b672563fb5198e834aea3b2503f45eb6b36c066cd6009",
    );

    const mutationPayload = {
      schema: "changes.evidence.t1-conformance-observation.v1",
      suite: "mutation-controls",
      producer: OBSERVATION_PRODUCER,
      fixtureSchema: mutationFixture.schema,
      fixtureVersion: mutationFixture.fixtureVersion,
      productionOutputUsed: mutationFixture.productionOutputUsed,
      expectedValuesGenerated: mutationFixture.expectedValuesGenerated,
      reviewState: mutationFixture.reviewState,
      claim: "executable-semantic-counterfactuals-not-source-mutants",
      classification: "executable-semantic-counterfactuals-not-source-mutants",
      seed: HARNESS_SEED,
      controlIds: mutationFixture.controls.map(({ id }) => id),
      controlsDefined: mutationFixture.controls.length,
      reviewedControlsDischarged: firstExecutions.length,
      mappedButUnobserved: linkedCasesUnaccounted.length,
      semanticCounterfactualsExecuted: firstExecutions.length,
      semanticCounterfactualsKilled: firstExecutions.length,
      semanticCounterfactualsSurvived: 0,
      sourceMutantsExecuted: 0,
      sourceMutantsKilled: 0,
      requiredFaultFamilies: mutationFixture.requiredFaultFamilies,
      faultFamiliesObserved: [
        ...new Set(firstExecutions.map(({ faultFamily }) => faultFamily)),
      ].sort(),
      counterfactualExecutions: firstExecutions,
      linkedCaseIds,
      linkedCaseLinks,
      reviewedCaseLinks: reviewedPairs.length,
      reviewedCaseLinkInventorySha256:
        "fbf7124754ba69ec01ef246d4f42ba637b0f75effc95745d39a2cff55430b261",
      directKillerLinksReviewed: directPairs.length,
      directKillerLinksExecuted: firstExecutions.reduce(
        (sum, control) => sum + control.directLinksExecuted,
        0,
      ),
      directKillerLinksKilled: firstExecutions.reduce(
        (sum, control) => sum + control.directLinksKilled,
        0,
      ),
      directKillerLinksSurvived: firstExecutions.reduce(
        (sum, control) => sum + control.directLinksSurvived,
        0,
      ),
      directKillerLinkInventorySha256:
        "37d96875c299e1d1411b778a9959af77ee278bff0b5bc7d60f4350db31f22bee",
      corroborativeLinksReviewed: corroborativePairs.length,
      corroborativeLinksObserved: firstExecutions.reduce(
        (sum, control) => sum + control.corroborativeLinksObserved,
        0,
      ),
      corroborativeLinksUnobserved: 0,
      corroborativeLinkInventorySha256:
        "d363a0332871b0b9d37b672563fb5198e834aea3b2503f45eb6b36c066cd6009",
      linkedCasesObserved: linkedCaseIds.length,
      linkedCasesUnaccounted,
      observationDigests,
      caseObservationRecords,
      observationInventoryDigest: sha256(caseObservationRecords),
      controlExecutionDigests,
      runtimeExecutions:
        first.state.resolverExecutions +
        first.state.evidenceResolverExecutions +
        first.state.spellerExecutions,
      runtimeExecutionCounts: {
        parser: first.state.parserExecutions,
        resolver: first.state.resolverExecutions,
        evidenceResolver: first.state.evidenceResolverExecutions,
        speller: first.state.spellerExecutions,
        domainConstructor: first.state.domainConstructorExecutions,
      },
      status: "pass",
    } as const;

    console.log(
      `T1_CONFORMANCE_OBSERVATION ${JSON.stringify(signObservation(lawsPayload))}`,
    );
    console.log(
      `T1_CONFORMANCE_OBSERVATION ${JSON.stringify(signObservation(mutationPayload))}`,
    );
  }, 120_000);
});
