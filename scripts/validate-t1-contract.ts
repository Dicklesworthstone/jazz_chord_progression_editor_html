import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type JsonObject = Record<string, unknown>;

export type T1ContractFinding = Readonly<{
  code: string;
  path: string;
  message: string;
}>;

export type T1ContractValidationReport = Readonly<{
  schema: "changes.validation.t1-contract.v1";
  package: "T1";
  outcome: "pass" | "fail";
  counts: Readonly<{
    companions: number;
    formulaRules: number;
    modifierRules: number;
    alteredDominantVariants: number;
    roots: number;
    familySeeds: number;
    allRootCells: number;
    allRootDegreeSpellings: number;
    publicDegreeSpellingCells: number;
    literalPlanCases: number;
    spellingCases: number;
    customCases: number;
    lawCases: number;
    operationStateCases: number;
    totalLinkedCases: number;
    traces: number;
    authorities: number;
    mutationControls: number;
    mutationDirectKillerLinks: number;
    mutationCorroborativeLinks: number;
    mutationReviewedCaseLinks: number;
  }>;
  findings: readonly T1ContractFinding[];
}>;

type ParsedFixture = Readonly<{
  filename: T1FixtureFilename;
  root: JsonObject;
  byteDigest: string;
  semanticDigest: string;
}>;

type LinkedCase = Readonly<{
  id: string;
  path: string;
  traceIds: readonly string[];
  authorityIds: readonly string[];
  record: JsonObject;
}>;

const CONTRACT_FILENAME = "t1-resolution-contract.json" as const;
const DEFAULT_FIXTURE_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../tests/fixtures/resolution",
);

/** Recursively freezes a reviewed oracle while retaining its exact literal type. */
function deepFreeze<const Value>(value: Value): Value {
  if (typeof value !== "object" || value === null) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  Object.freeze(value);
  return value;
}

export const T1_REVIEWED_COMPANIONS = deepFreeze([
  "formula-rules.json",
  "all-root-cases.json",
  "literal-cases.json",
  "spelling-cases.json",
  "custom-cases.json",
  "law-cases.json",
  "operation-state-cases.json",
  "trace-ledger.json",
  "provenance-ledger.json",
  "mutation-controls.json",
] as const);

const EXPECTED_FILES = [CONTRACT_FILENAME, ...T1_REVIEWED_COMPANIONS] as const;
type T1FixtureFilename = (typeof EXPECTED_FILES)[number];
const REVIEWED_FIXTURE_VERSIONS: Readonly<Record<T1FixtureFilename, string>> = {
  "t1-resolution-contract.json": "1.0.0",
  "formula-rules.json": "1.0.0",
  "all-root-cases.json": "1.0.0",
  "literal-cases.json": "1.0.0",
  "spelling-cases.json": "1.0.0",
  "custom-cases.json": "1.0.0",
  "law-cases.json": "1.0.0",
  "operation-state-cases.json": "1.0.0",
  "trace-ledger.json": "1.0.0",
  "provenance-ledger.json": "1.0.0",
  "mutation-controls.json": "1.1.0",
};

const EXPECTED_SCHEMAS: Readonly<Record<T1FixtureFilename, string>> = {
  "t1-resolution-contract.json": "changes.fixtures.t1-resolution-contract.v1",
  "formula-rules.json": "changes.fixtures.t1-formula-rules.v1",
  "all-root-cases.json": "changes.fixtures.t1-all-root-cases.v1",
  "literal-cases.json": "changes.fixtures.t1-literal-cases.v1",
  "spelling-cases.json": "changes.fixtures.t1-spelling-cases.v1",
  "custom-cases.json": "changes.fixtures.t1-custom-cases.v1",
  "law-cases.json": "changes.fixtures.t1-law-cases.v1",
  "operation-state-cases.json": "changes.fixtures.t1-operation-state-cases.v1",
  "trace-ledger.json": "changes.fixtures.t1-trace-ledger.v1",
  "provenance-ledger.json": "changes.fixtures.t1-provenance-ledger.v1",
  "mutation-controls.json": "changes.fixtures.t1-mutation-controls.v1",
};

const EXPECTED_TOP_LEVEL_KEYS: Readonly<Record<T1FixtureFilename, readonly string[]>> = {
  "t1-resolution-contract.json": [
    "customLimitations", "degreeTokenVocabulary", "expectedInventoryMinimums",
    "expectedValuesGenerated", "fixtureVersion", "formulaPhases", "identity",
    "independence", "inputPolicy", "knownPlanCorrections", "lawPredicateReview", "limits", "matrix",
    "mutationControlReview", "operationIds", "ordering", "productionOutputUsed", "publicContract",
    "refusalCodes", "rolePolicy", "schema", "status", "warningCodes",
  ],
  "formula-rules.json": [
    "alteredDominantMatchAndBasePhase", "alteredDominantVariants", "degreeEncoding", "degreeRolePolicyId",
    "degreeRolePolicyVersion", "expectedValuesGenerated", "familyStateMatrix", "fixtureVersion",
    "formulaTableId", "formulaTableVersion", "matchAndBasePhaseByFormulaId",
    "matchSelectionPolicy", "modifierRules",
    "productionOutputUsed", "publicRuleAssignments", "rules", "schema",
  ],
  "all-root-cases.json": [
    "expectedValuesGenerated", "familySeeds", "fixtureVersion",
    "independentOracle", "matrixCase", "productionOutputUsed", "roots", "schema",
  ],
  "literal-cases.json": [
    "cases", "expectedMetadata", "expectedValuesGenerated", "fixtureVersion",
    "inputPolicy", "productionOutputUsed", "schema",
  ],
  "spelling-cases.json": [
    "cases", "expectedValuesGenerated", "fixtureVersion", "policyId",
    "policyVersion", "productionOutputUsed", "publicDegreeMatrix", "schema",
  ],
  "custom-cases.json": [
    "cases", "expectedValuesGenerated", "fixtureVersion", "productionOutputUsed",
    "schema", "sharedExpected",
  ],
  "law-cases.json": [
    "cases", "expectedValuesGenerated", "fixtureVersion", "lawProofPolicy",
    "productionOutputUsed", "schema",
  ],
  "operation-state-cases.json": [
    "applicabilityVocabulary", "cases", "expectedValuesGenerated", "fixtureVersion",
    "pathPolicy", "productionOutputUsed", "schema",
  ],
  "trace-ledger.json": [
    "caseLinkPolicy", "expectedValuesGenerated", "fixtureVersion",
    "productionOutputUsed", "schema", "stableTraceIdsOnly", "traces",
  ],
  "provenance-ledger.json": [
    "allowedAuthorityClasses", "authoringStatement", "authorities",
    "expectedValuesGenerated", "fixtureVersion", "independenceRules",
    "productionOutputUsed", "schema",
  ],
  "mutation-controls.json": [
    "controls", "expectedValuesGenerated", "fixtureVersion", "productionOutputUsed",
    "requiredFaultFamilies", "reviewedCaseLinkCount", "reviewedCaseLinkOrderSha256",
    "reviewState", "schema",
  ],
};

// These values were measured only after the independently authored corpus was
// semantically clean. The nullable type preserves an explicit hard-failure
// handoff state for future fixture revisions; the validator never auto-accepts
// a new byte or semantic digest.
const EXPECTED_BYTE_DIGESTS: Readonly<Record<T1FixtureFilename, string | null>> = {
  "t1-resolution-contract.json": "fc72f3a18c961b909796d020d3ba2a5b09a464742acb6b3f319f4cc29cb5dd4b",
  "formula-rules.json": "72b06922bc49f115e52cff80c663e52bfb2db14d0fcdc595d76524dfdd74627e",
  "all-root-cases.json": "f042ac7a090fb797f18bdbac346f5d2c8b66b6841fb24d754a8b7567df66c305",
  "literal-cases.json": "3659309953d04db2b84b2ad8aadd2bbea4240ddebf4488cfc370b6ecc05a0b4f",
  "spelling-cases.json": "2f5dd3ddd364a6bee1b1920da32d4d84cf9c1f8a80dfe1a4af61ebe2f587f253",
  "custom-cases.json": "68d961cb0b41095c71d43971bd498497d8c009b0ae9f0ff60013880749cc798a",
  "law-cases.json": "25520de47c7199c0a54e53476bd48515ab1832e996ce189fa1b2ed19e8ef8bd7",
  "operation-state-cases.json": "0c04424529b47d72694f8091bd5422abd89986dee3e35f1bc4dfb271eb8f986f",
  "trace-ledger.json": "b1cf8389c48157883fa278ed7ba24d4f7253011f5b6dfffa2a0bf0c6b639ff16",
  "provenance-ledger.json": "5fa839c837c640534f09bd6385eef4bec4331aa581217cffebc917018e97efb7",
  "mutation-controls.json": "da992c1aa3b3396706a5c1f253fbef0c51b24317925fa6347b4e0994c74ce6a2",
};

/** Sorted-object JSON digests distinguish semantic review from formatting bytes. */
const EXPECTED_SEMANTIC_DIGESTS: Readonly<Record<T1FixtureFilename, string | null>> = {
  "t1-resolution-contract.json": "30e4dc4def92dea137c6c13645a8a2fdb4b493caafb7a330cdb0cd0bf51a564e",
  "formula-rules.json": "035dc3a5b1ebfd6b7d2bcb61bd8d62b9ece2f5f36c5e5bc05dfa4e73eb5988de",
  "all-root-cases.json": "cca9dd85794fb5f8b5eb8b2dfc0345ebb5ef179ca98496bb4409190dc76a18d0",
  "literal-cases.json": "76cffbfe388238e879136029a36b3efe7600d412a54bb4db88c8782b7dbf54e2",
  "spelling-cases.json": "7d0893f33be9873f3ef0ce5a7b7b1da0fccaf7734b1a702a1f056b91051919ee",
  "custom-cases.json": "0be846d402320be979d65ec386563071283e2afe19c5d165114166457fc73ef1",
  "law-cases.json": "ef60f8b9181e7cc36fc4c387bd2c330a31b18b9ad054c3e766ca655f5e1f3fb8",
  "operation-state-cases.json": "36300f3ad9e45ac6d862219365398152e1dce500516db8c4429d57915148f826",
  "trace-ledger.json": "440f56226f2d350963ccd0d4fbad39ef28e8be07f84852cadde953a4b94207b0",
  "provenance-ledger.json": "6e1a40b06aeca8471fd8fe1de34fe7d7224e509f3ddf96994567008af35044bc",
  "mutation-controls.json": "fccbbb4b5119f1b4fbccce2f0fdb24c170a71e7999ed2040dfa1ab0163fb6b5e",
};

export const T1_REVIEWED_FORMULA_RULE_IDS = deepFreeze([
  "base-major",
  "base-minor",
  "base-diminished",
  "base-augmented",
  "base-sus2",
  "base-sus4",
  "base-power",
  "sixth-major",
  "sixth-minor",
  "seventh-major",
  "seventh-dominant",
  "seventh-minor",
  "seventh-minor-major",
  "seventh-half-diminished",
  "seventh-diminished",
  "seventh-augmented-major",
  "extension-major",
  "extension-dominant",
  "extension-minor",
  "extension-suspended-dominant",
  "altered-dominant",
  "custom",
] as const);

const REVIEWED_OPERATION_IDS = ["spellChordDegree", "resolveChord"] as const;
const REVIEWED_FORMULA_PHASES = [
  "base",
  "suspension",
  "structural-alterations",
  "color-alterations",
  "additions",
  "omissions",
  "canonicalization",
  "spelling",
] as const;
const REVIEWED_SEMANTIC_REALIZATION_IDS = [
  "literal",
  "alt-b9-b5",
  "alt-b9-sharp5",
  "alt-sharp9-b5",
  "alt-sharp9-sharp5",
] as const;
const REVIEWED_ALTERED_DOMINANT_IDS = [
  "alt-b9-b5",
  "alt-b9-sharp5",
  "alt-sharp9-b5",
  "alt-sharp9-sharp5",
] as const;
const REVIEWED_REFUSAL_CODES = [
  "theory.formula_family_unsupported",
  "theory.sixth_invalid",
  "theory.extension_invalid",
  "theory.addition_invalid",
  "theory.alteration_invalid",
  "theory.omission_invalid",
  "theory.modifier_conflict",
  "theory.color_policy_invalid",
  "theory.spelling_accidental_out_of_range",
  "limit.theory_realization_degrees_exceeded",
] as const;
const REVIEWED_WARNING_CODES = ["theory.omission_absent"] as const;

export const T1_REVIEWED_REFUSAL_PRECEDENCE = deepFreeze([
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
] as const);

export const T1_REVIEWED_PUBLIC_CONTRACT = deepFreeze({
  module: "src/theory/resolution-contract.ts",
  contractSchema: "changes.theory.resolution-contract.v1",
  resolvedChordSchema: "changes.theory.resolved-chord.v1",
  formulaTable: { id: "changes.chord-formulas", version: 1 },
  degreeSpellingPolicy: { id: "changes.degree-spelling", version: 1 },
  degreeRolePolicy: { id: "changes.balanced-degree-roles", version: 1 },
  operationIds: [...REVIEWED_OPERATION_IDS],
  formulaPhases: [...REVIEWED_FORMULA_PHASES],
  formulaRuleIds: [...T1_REVIEWED_FORMULA_RULE_IDS],
  semanticRealizationIds: [...REVIEWED_SEMANTIC_REALIZATION_IDS],
  alteredDominantRealizationIds: [...REVIEWED_ALTERED_DOMINANT_IDS],
  customRealizationId: "custom",
  customLimitations: [
    "custom.no_degree_analysis",
    "custom.no_auto_voicing",
  ],
  extensionNumbers: [9, 11, 13],
  additionNumbers: [2, 3, 4, 6, 9, 11, 13],
  alterationNumbers: [5, 9, 11, 13],
  omissionNumbers: [3, 5],
  modifierAlterations: [-1, 1],
  modifierConflictPrecedence: [
    "sixth-with-seventh",
    "sixth-with-extension",
    "addition-omission",
    "alteration-omission",
    "structural-alteration-pair",
  ],
  refusalReasonPrecedence: {
    "theory.sixth_invalid": ["alteration", "family"],
    "theory.extension_invalid": ["count", "number", "alteration", "family"],
    "theory.addition_invalid": ["count", "number", "alteration"],
    "theory.alteration_invalid": ["count", "number", "alteration"],
    "theory.omission_invalid": ["count", "number"],
    "theory.color_policy_invalid": ["requires-dominant-seventh", "explicit-five-or-nine-alteration"],
  },
  refusalCodes: [...REVIEWED_REFUSAL_CODES],
  warningCodes: [...REVIEWED_WARNING_CODES],
} as const);

export const T1_REVIEWED_LIMITS = deepFreeze({
  realizationsPerChord: 4,
  degreesPerRealization: 16,
  extensions: 1,
  additions: 7,
  alterations: 8,
  omissions: 2,
  semanticOutputRecords: 64,
  spellingAttempts: 64,
  warnings: 1,
  formulaPhases: 8,
  phaseTransitions: 32,
  candidateInsertions: 84,
  peakCandidateDegrees: 21,
  inputDegreeRecordsVisited: 23,
  trackedRecords: 149,
  customPitchNames: 16,
  minimumSupportedAlteration: -2,
  maximumSupportedAlteration: 2,
} as const);

const REVIEWED_ROOTS = [
  { id: "T1-ROOT-001", symbol: "C", step: "C", alter: 0, pitchClass: 0 },
  { id: "T1-ROOT-002", symbol: "Db", step: "D", alter: -1, pitchClass: 1 },
  { id: "T1-ROOT-003", symbol: "D", step: "D", alter: 0, pitchClass: 2 },
  { id: "T1-ROOT-004", symbol: "Eb", step: "E", alter: -1, pitchClass: 3 },
  { id: "T1-ROOT-005", symbol: "E", step: "E", alter: 0, pitchClass: 4 },
  { id: "T1-ROOT-006", symbol: "F", step: "F", alter: 0, pitchClass: 5 },
  { id: "T1-ROOT-007", symbol: "F#", step: "F", alter: 1, pitchClass: 6 },
  { id: "T1-ROOT-008", symbol: "G", step: "G", alter: 0, pitchClass: 7 },
  { id: "T1-ROOT-009", symbol: "Ab", step: "A", alter: -1, pitchClass: 8 },
  { id: "T1-ROOT-010", symbol: "A", step: "A", alter: 0, pitchClass: 9 },
  { id: "T1-ROOT-011", symbol: "Bb", step: "B", alter: -1, pitchClass: 10 },
  { id: "T1-ROOT-012", symbol: "B", step: "B", alter: 0, pitchClass: 11 },
] as const;

const REVIEWED_DEGREE_TOKENS = [
  { token: "1", number: 1, alter: 0, directedSemitones: 0, pitchClassOffset: 0, diatonicSteps: 0 },
  { token: "b2", number: 2, alter: -1, directedSemitones: 1, pitchClassOffset: 1, diatonicSteps: 1 },
  { token: "2", number: 2, alter: 0, directedSemitones: 2, pitchClassOffset: 2, diatonicSteps: 1 },
  { token: "b3", number: 3, alter: -1, directedSemitones: 3, pitchClassOffset: 3, diatonicSteps: 2 },
  { token: "3", number: 3, alter: 0, directedSemitones: 4, pitchClassOffset: 4, diatonicSteps: 2 },
  { token: "4", number: 4, alter: 0, directedSemitones: 5, pitchClassOffset: 5, diatonicSteps: 3 },
  { token: "b5", number: 5, alter: -1, directedSemitones: 6, pitchClassOffset: 6, diatonicSteps: 4 },
  { token: "5", number: 5, alter: 0, directedSemitones: 7, pitchClassOffset: 7, diatonicSteps: 4 },
  { token: "#5", number: 5, alter: 1, directedSemitones: 8, pitchClassOffset: 8, diatonicSteps: 4 },
  { token: "6", number: 6, alter: 0, directedSemitones: 9, pitchClassOffset: 9, diatonicSteps: 5 },
  { token: "bb7", number: 7, alter: -2, directedSemitones: 9, pitchClassOffset: 9, diatonicSteps: 6 },
  { token: "b7", number: 7, alter: -1, directedSemitones: 10, pitchClassOffset: 10, diatonicSteps: 6 },
  { token: "7", number: 7, alter: 0, directedSemitones: 11, pitchClassOffset: 11, diatonicSteps: 6 },
  { token: "b9", number: 9, alter: -1, directedSemitones: 13, pitchClassOffset: 1, diatonicSteps: 8 },
  { token: "9", number: 9, alter: 0, directedSemitones: 14, pitchClassOffset: 2, diatonicSteps: 8 },
  { token: "#9", number: 9, alter: 1, directedSemitones: 15, pitchClassOffset: 3, diatonicSteps: 8 },
  { token: "b11", number: 11, alter: -1, directedSemitones: 16, pitchClassOffset: 4, diatonicSteps: 10 },
  { token: "11", number: 11, alter: 0, directedSemitones: 17, pitchClassOffset: 5, diatonicSteps: 10 },
  { token: "#11", number: 11, alter: 1, directedSemitones: 18, pitchClassOffset: 6, diatonicSteps: 10 },
  { token: "b13", number: 13, alter: -1, directedSemitones: 20, pitchClassOffset: 8, diatonicSteps: 12 },
  { token: "13", number: 13, alter: 0, directedSemitones: 21, pitchClassOffset: 9, diatonicSteps: 12 },
  { token: "#13", number: 13, alter: 1, directedSemitones: 22, pitchClassOffset: 10, diatonicSteps: 12 },
] as const;

type FormulaLiteral = Readonly<{
  id: string;
  bucket: "triad" | "sixth" | "seventh" | "extension" | "dominant-suspension";
  familyId: string;
  symbolTemplate: string;
  degrees: readonly string[];
  required: readonly string[];
  optional: readonly string[];
  guide: readonly string[];
}>;

const formula = (
  id: string,
  bucket: FormulaLiteral["bucket"],
  familyId: string,
  symbolTemplate: string,
  degrees: readonly string[],
  required: readonly string[],
  optional: readonly string[],
  guide: readonly string[],
): FormulaLiteral => ({ id, bucket, familyId, symbolTemplate, degrees, required, optional, guide });

const REVIEWED_FORMULAS = [
  formula("T1-FORMULA-001", "triad", "major-triad", "{root}", ["1", "3", "5"], ["1", "3"], ["5"], ["3"]),
  formula("T1-FORMULA-002", "triad", "minor-triad", "{root}m", ["1", "b3", "5"], ["1", "b3"], ["5"], ["b3"]),
  formula("T1-FORMULA-003", "triad", "diminished-triad", "{root}dim", ["1", "b3", "b5"], ["1", "b3", "b5"], [], ["b3"]),
  formula("T1-FORMULA-004", "triad", "augmented-triad", "{root}aug", ["1", "3", "#5"], ["1", "3", "#5"], [], ["3"]),
  formula("T1-FORMULA-005", "triad", "sus2-triad", "{root}sus2", ["1", "2", "5"], ["1", "2"], ["5"], ["2"]),
  formula("T1-FORMULA-006", "triad", "sus4-triad", "{root}sus4", ["1", "4", "5"], ["1", "4"], ["5"], ["4"]),
  formula("T1-FORMULA-007", "triad", "power-triad", "{root}5", ["1", "5"], ["1", "5"], [], []),
  formula("T1-FORMULA-008", "sixth", "major-sixth", "{root}6", ["1", "3", "5", "6"], ["1", "3", "6"], ["5"], ["3"]),
  formula("T1-FORMULA-009", "sixth", "minor-sixth", "{root}m6", ["1", "b3", "5", "6"], ["1", "b3", "6"], ["5"], ["b3"]),
  formula("T1-FORMULA-010", "sixth", "major-six-nine", "{root}6/9", ["1", "3", "5", "6", "9"], ["1", "3", "6"], ["5", "9"], ["3"]),
  formula("T1-FORMULA-011", "sixth", "minor-six-nine", "{root}m6/9", ["1", "b3", "5", "6", "9"], ["1", "b3", "6"], ["5", "9"], ["b3"]),
  formula("T1-FORMULA-012", "seventh", "major-seventh", "{root}maj7", ["1", "3", "5", "7"], ["1", "3", "7"], ["5"], ["3", "7"]),
  formula("T1-FORMULA-013", "seventh", "dominant-seventh", "{root}7", ["1", "3", "5", "b7"], ["1", "3", "b7"], ["5"], ["3", "b7"]),
  formula("T1-FORMULA-014", "seventh", "minor-seventh", "{root}m7", ["1", "b3", "5", "b7"], ["1", "b3", "b7"], ["5"], ["b3", "b7"]),
  formula("T1-FORMULA-015", "seventh", "minor-major-seventh", "{root}m(maj7)", ["1", "b3", "5", "7"], ["1", "b3", "7"], ["5"], ["b3", "7"]),
  formula("T1-FORMULA-016", "seventh", "half-diminished-seventh", "{root}m7b5", ["1", "b3", "b5", "b7"], ["1", "b3", "b5", "b7"], [], ["b3", "b7"]),
  formula("T1-FORMULA-017", "seventh", "diminished-seventh", "{root}dim7", ["1", "b3", "b5", "bb7"], ["1", "b3", "b5", "bb7"], [], ["b3", "bb7"]),
  formula("T1-FORMULA-018", "seventh", "augmented-major-seventh", "{root}aug(maj7)", ["1", "3", "#5", "7"], ["1", "3", "#5", "7"], [], ["3", "7"]),
  formula("T1-FORMULA-019", "extension", "major-ninth", "{root}maj9", ["1", "3", "5", "7", "9"], ["1", "3", "7", "9"], ["5"], ["3", "7"]),
  formula("T1-FORMULA-020", "extension", "dominant-ninth", "{root}9", ["1", "3", "5", "b7", "9"], ["1", "3", "b7", "9"], ["5"], ["3", "b7"]),
  formula("T1-FORMULA-021", "extension", "minor-ninth", "{root}m9", ["1", "b3", "5", "b7", "9"], ["1", "b3", "b7", "9"], ["5"], ["b3", "b7"]),
  formula("T1-FORMULA-022", "extension", "dominant-eleventh", "{root}11", ["1", "3", "5", "b7", "9", "11"], ["1", "3", "b7", "11"], ["5", "9"], ["3", "b7"]),
  formula("T1-FORMULA-023", "extension", "minor-eleventh", "{root}m11", ["1", "b3", "5", "b7", "9", "11"], ["1", "b3", "b7", "11"], ["5", "9"], ["b3", "b7"]),
  formula("T1-FORMULA-024", "extension", "dominant-thirteenth", "{root}13", ["1", "3", "5", "b7", "9", "11", "13"], ["1", "3", "b7", "13"], ["5", "9", "11"], ["3", "b7"]),
  formula("T1-FORMULA-025", "extension", "major-thirteenth", "{root}maj13", ["1", "3", "5", "7", "9", "11", "13"], ["1", "3", "7", "13"], ["5", "9", "11"], ["3", "7"]),
  formula("T1-FORMULA-026", "extension", "minor-thirteenth", "{root}m13", ["1", "b3", "5", "b7", "9", "11", "13"], ["1", "b3", "b7", "13"], ["5", "9", "11"], ["b3", "b7"]),
  formula("T1-FORMULA-027", "dominant-suspension", "dominant-seven-sus2", "{root}7sus2", ["1", "2", "5", "b7"], ["1", "2", "b7"], ["5"], ["2", "b7"]),
  formula("T1-FORMULA-028", "dominant-suspension", "dominant-nine-sus2", "{root}9sus2", ["1", "2", "5", "b7", "9"], ["1", "2", "b7", "9"], ["5"], ["2", "b7"]),
  formula("T1-FORMULA-029", "dominant-suspension", "dominant-thirteen-sus2", "{root}13sus2", ["1", "2", "5", "b7", "9", "11", "13"], ["1", "2", "b7", "13"], ["5", "9", "11"], ["2", "b7"]),
  formula("T1-FORMULA-030", "dominant-suspension", "dominant-seven-sus4", "{root}7sus4", ["1", "4", "5", "b7"], ["1", "4", "b7"], ["5"], ["4", "b7"]),
  formula("T1-FORMULA-031", "dominant-suspension", "dominant-nine-sus4", "{root}9sus4", ["1", "4", "5", "b7", "9"], ["1", "4", "b7", "9"], ["5"], ["4", "b7"]),
  formula("T1-FORMULA-032", "dominant-suspension", "dominant-thirteen-sus4", "{root}13sus4", ["1", "4", "5", "b7", "9", "11", "13"], ["1", "4", "b7", "13"], ["5", "9", "11"], ["4", "b7"]),
  formula("T1-FORMULA-033", "extension", "major-eleventh", "{root}maj11", ["1", "3", "5", "7", "9", "11"], ["1", "3", "7", "11"], ["5", "9"], ["3", "7"]),
] as const;

const REVIEWED_PUBLIC_RULE_ASSIGNMENTS = {
  "major-triad": "base-major",
  "minor-triad": "base-minor",
  "diminished-triad": "base-diminished",
  "augmented-triad": "base-augmented",
  "sus2-triad": "base-sus2",
  "sus4-triad": "base-sus4",
  "power-triad": "base-power",
  "major-sixth": "sixth-major",
  "minor-sixth": "sixth-minor",
  "major-six-nine": "sixth-major",
  "minor-six-nine": "sixth-minor",
  "major-seventh": "seventh-major",
  "dominant-seventh": "seventh-dominant",
  "minor-seventh": "seventh-minor",
  "minor-major-seventh": "seventh-minor-major",
  "half-diminished-seventh": "seventh-half-diminished",
  "diminished-seventh": "seventh-diminished",
  "augmented-major-seventh": "seventh-augmented-major",
  "major-ninth": "extension-major",
  "dominant-ninth": "extension-dominant",
  "minor-ninth": "extension-minor",
  "dominant-eleventh": "extension-dominant",
  "minor-eleventh": "extension-minor",
  "dominant-thirteenth": "extension-dominant",
  "major-thirteenth": "extension-major",
  "minor-thirteenth": "extension-minor",
  "dominant-seven-sus2": "extension-suspended-dominant",
  "dominant-nine-sus2": "extension-suspended-dominant",
  "dominant-thirteen-sus2": "extension-suspended-dominant",
  "dominant-seven-sus4": "extension-suspended-dominant",
  "dominant-nine-sus4": "extension-suspended-dominant",
  "dominant-thirteen-sus4": "extension-suspended-dominant",
  "major-eleventh": "extension-major",
} as const;

const REVIEWED_ALTERED_DOMINANT_VARIANTS = [
  { id: "alt-b9-b5", degrees: ["1", "3", "b5", "b7", "b9"], required: ["1", "3", "b5", "b7", "b9"], optional: [], guide: ["3", "b7"] },
  { id: "alt-b9-sharp5", degrees: ["1", "3", "#5", "b7", "b9"], required: ["1", "3", "#5", "b7", "b9"], optional: [], guide: ["3", "b7"] },
  { id: "alt-sharp9-b5", degrees: ["1", "3", "b5", "b7", "#9"], required: ["1", "3", "b5", "b7", "#9"], optional: [], guide: ["3", "b7"] },
  { id: "alt-sharp9-sharp5", degrees: ["1", "3", "#5", "b7", "#9"], required: ["1", "3", "#5", "b7", "#9"], optional: [], guide: ["3", "b7"] },
] as const;

const REVIEWED_MUTATION_FAULT_FAMILIES = [
  "accidental-identity",
  "altered-dominant",
  "base-quality",
  "canonicalization",
  "custom-exactness",
  "degree-spelling",
  "extension-closure",
  "input-limits",
  "modifier-order",
  "modifier-vocabulary",
  "omission",
  "output-limit",
  "role-assignment",
  "seventh-quality",
  "sixth-family",
  "slash-bass-separation",
  "strict-family-refusal",
  "suspension",
  "transactional-refusal",
  "transposition",
] as const;

const REVIEWED_MUTATION_CONTROL_COUNT = 53;
const REVIEWED_MUTATION_DIRECT_KILLER_LINK_COUNT = 124;
const REVIEWED_MUTATION_CORROBORATIVE_LINK_COUNT = 16;
const REVIEWED_MUTATION_CASE_LINK_COUNT = 140;
const REVIEWED_MUTATION_CASE_LINK_ORDER_SHA256 =
  "fbf7124754ba69ec01ef246d4f42ba637b0f75effc95745d39a2cff55430b261";
const REVIEWED_MUTATION_REVIEW_STATE =
  "reviewed-executable-counterfactuals-with-corroborative-links";
const REVIEWED_MUTATION_CORROBORATIVE_REASON_CODES = [
  "predicate-does-not-constrain-ordinary-fifth-role",
  "operator-scope-mismatch",
  "single-identity-no-collection-collapse",
  "near-miss-no-target",
  "no-transposition-executed",
  "no-extension-supplied-natural-closure",
  "single-same-number-member",
  "stable-sort-tie-no-reordering",
] as const;

const REVIEWED_MUTATION_CONTROL_REVIEW = deepFreeze({
  ledgerFixtureVersion: "1.1.0",
  reviewState: REVIEWED_MUTATION_REVIEW_STATE,
  controls: REVIEWED_MUTATION_CONTROL_COUNT,
  directKillerLinks: REVIEWED_MUTATION_DIRECT_KILLER_LINK_COUNT,
  corroborativeLinks: REVIEWED_MUTATION_CORROBORATIVE_LINK_COUNT,
  reviewedCaseLinks: REVIEWED_MUTATION_CASE_LINK_COUNT,
  reviewedCaseLinkOrderSha256: REVIEWED_MUTATION_CASE_LINK_ORDER_SHA256,
  directKillerDefinition: "the named semantic counterfactual applies to the case and changes a value checked by its independently reviewed oracle",
  corroborativeDefinition: "the case proves an adjacent invariant but the named counterfactual is inapplicable or leaves that case unchanged; it is observed but never counted as a kill",
  sourceMutationClassification: "semantic counterfactual execution is distinct from production-source mutation; production-source mutant counts remain zero unless altered production code is actually executed",
  corroborativeReasonCodes: REVIEWED_MUTATION_CORROBORATIVE_REASON_CODES,
});

export const T1_REVIEWED_LAW_PREDICATE_DIGESTS = deepFreeze([
  { lawCaseId: "T1-LAW-001", lawId: "L-THEORY-01", semanticPredicateDigest: "75e6ab7310c9b73c5c3c581dde9c4dd028db46c72ad2922bae96545fce6dfd8a" },
  { lawCaseId: "T1-LAW-002", lawId: "T1-LAW-DEGREE-IDENTITY", semanticPredicateDigest: "523e550141688d9a878d457bb487294deb854f23cbe58303fba395b5622936ce" },
  { lawCaseId: "T1-LAW-003", lawId: "T1-LAW-DIRECTED-SPELLING", semanticPredicateDigest: "03461509f2d458836a6e1979b92c8095fb8d48c6362da75f295203e88e49675b" },
  { lawCaseId: "T1-LAW-004", lawId: "T1-LAW-TRANSPOSE-INVERSE", semanticPredicateDigest: "065d11ef77007541a23ef12fec97bafffb3d842959bb6b7544924ec18ebbb513" },
  { lawCaseId: "T1-LAW-005", lawId: "T1-LAW-PROJECTION-COMMUTES", semanticPredicateDigest: "e4964f6554e8c0c46bd49c6e9becafb33024e74471679c3dc8f2eed6406d2f77" },
  { lawCaseId: "T1-LAW-006", lawId: "T1-LAW-ALT-AMBIGUITY", semanticPredicateDigest: "b7c802fe6d71ff708df193e7bf2c48d46faa7ae74db650f5515b9086f0626b31" },
  { lawCaseId: "T1-LAW-007", lawId: "T1-LAW-MODIFIER-PHASES", semanticPredicateDigest: "f386a17c5521d74561cdd6629514464ee2985be5eb1255bb187197a825af95e1" },
  { lawCaseId: "T1-LAW-008", lawId: "T1-LAW-ROLE-PARTITION", semanticPredicateDigest: "d40ff8d7a749cebc0d9d2cb3d94f853e6702e9fa45654cf41af6967058337630" },
  { lawCaseId: "T1-LAW-009", lawId: "T1-LAW-OMISSION", semanticPredicateDigest: "ece90333f7b4a5c411adfb2ca0117c064215b1a200433fbd16a6e65dd7a481a2" },
  { lawCaseId: "T1-LAW-010", lawId: "T1-LAW-SLASH-SEPARATION", semanticPredicateDigest: "aa7af72c80a3a907bd67bec77829f262581ac18d5299b649ace625eefe05585d" },
  { lawCaseId: "T1-LAW-011", lawId: "T1-LAW-CUSTOM-EXACTNESS", semanticPredicateDigest: "b582e1f73b48a5742933529d10a960fb6a53fa96729b2690cf2da195380710a5" },
  { lawCaseId: "T1-LAW-012", lawId: "T1-LAW-TRANSACTIONAL-REFUSAL", semanticPredicateDigest: "8ce0fc5c40aebd301b4f28492f8c8e82ae5b230c2eb6372bb8052d4470ca1540" },
] as const);

const T1_REVIEWED_LAW_PREDICATE_REVIEW = deepFreeze({
  canonicalization: "SHA-256 of UTF-8 compact JSON after recursively sorting object keys by code-unit order; array order is preserved",
  predicateCount: T1_REVIEWED_LAW_PREDICATE_DIGESTS.length,
  inventory: T1_REVIEWED_LAW_PREDICATE_DIGESTS,
});

type ReviewedCorroborativeLink = Readonly<{
  caseId: string;
  reasonCode: (typeof REVIEWED_MUTATION_CORROBORATIVE_REASON_CODES)[number];
  reason: string;
}>;

const REVIEWED_MUTATION_CORROBORATIVE_LINKS: Readonly<
  Record<string, readonly ReviewedCorroborativeLink[]>
> = deepFreeze({
  "T1-MUT-003": [{
    caseId: "T1-LAW-008",
    reasonCode: "predicate-does-not-constrain-ordinary-fifth-role",
    reason: "The reviewed ordered-role predicate proves coverage, disjointness, guide inclusion, order, and generic add3 policy but does not require an ordinary perfect fifth to remain optional.",
  }],
  "T1-MUT-004": [{
    caseId: "T1-SPELL-002",
    reasonCode: "operator-scope-mismatch",
    reason: "The standalone natural-seventh speller witness corroborates directed E-sharp spelling but does not execute the major-seventh formula-family choice mutated by this control.",
  }],
  "T1-MUT-013": [
    {
      caseId: "T1-SPELL-003",
      reasonCode: "single-identity-no-collection-collapse",
      reason: "A standalone sharp-nine spelling contains no co-occurring enharmonic identity for collection canonicalization to collapse.",
    },
    {
      caseId: "T1-SPELL-004",
      reasonCode: "single-identity-no-collection-collapse",
      reason: "A standalone flat-third spelling contains no co-occurring enharmonic identity for collection canonicalization to collapse.",
    },
    {
      caseId: "T1-SPELL-008",
      reasonCode: "single-identity-no-collection-collapse",
      reason: "A standalone double-flat-seventh spelling contains no co-occurring enharmonic identity for collection canonicalization to collapse.",
    },
  ],
  "T1-MUT-014": [{
    caseId: "T1-SPELL-004",
    reasonCode: "near-miss-no-target",
    reason: "The genuine flat-third spelling is the near-miss that distinguishes b3 from #9, but it contains no sharp-nine identity for this control to rewrite.",
  }],
  "T1-MUT-020": [{
    caseId: "T1-ROOT-MATRIX-001",
    reasonCode: "no-transposition-executed",
    reason: "The exhaustive root matrix resolves each reviewed root independently and performs no transposition operation whose diatonic direction can be dropped.",
  }],
  "T1-MUT-021": [
    {
      caseId: "T1-LIT-047",
      reasonCode: "no-transposition-executed",
      reason: "The static slash-chord resolution proves bass separation but performs no transposition whose bass branch this control can suppress.",
    },
    {
      caseId: "T1-LIT-048",
      reasonCode: "no-transposition-executed",
      reason: "The static enharmonic slash-bass resolution proves exact source spelling but performs no transposition whose bass branch this control can suppress.",
    },
  ],
  "T1-MUT-028": [
    {
      caseId: "T1-LIT-042",
      reasonCode: "no-extension-supplied-natural-closure",
      reason: "C7(b9,#9) has no natural ninth supplied by extension closure, so retaining such a closure cannot change this case.",
    },
    {
      caseId: "T1-LIT-054",
      reasonCode: "no-extension-supplied-natural-closure",
      reason: "C7add9b9 obtains natural 9 from the later explicit addition rather than extension closure, so the reviewed coexistence is unchanged by this control.",
    },
  ],
  "T1-MUT-029": [
    {
      caseId: "T1-LIT-052",
      reasonCode: "single-same-number-member",
      reason: "C7(no5) contains only one fifth identity, so an implementation that removes only one same-number member produces the same result.",
    },
    {
      caseId: "T1-LIT-059",
      reasonCode: "single-same-number-member",
      reason: "C6/9(no3) contains only one third identity, so an implementation that removes only one same-number member produces the same result.",
    },
  ],
  "T1-MUT-039": [{
    caseId: "T1-CUSTOM-003",
    reasonCode: "stable-sort-tie-no-reordering",
    reason: "C-sharp and D-flat project to the same pitch class, so a stable pitch-class sort leaves their two-element input order unchanged.",
  }],
  "T1-MUT-047": [
    {
      caseId: "T1-SPELL-015",
      reasonCode: "operator-scope-mismatch",
      reason: "The standalone sharp-thirteen speller accepts an already typed degree and does not exercise the parsed modifier-vocabulary gate mutated by this control.",
    },
    {
      caseId: "T1-SPELL-016",
      reasonCode: "operator-scope-mismatch",
      reason: "The standalone flat-eleven speller accepts an already typed degree and does not exercise the parsed modifier-vocabulary gate mutated by this control.",
    },
  ],
});

const mutationSemantic = (
  id: string,
  faultFamily: string,
  operator: string,
  mutatedFault: string,
  expectedDetection: string,
  reviewedCaseLinkOrder: readonly string[],
): JsonObject => {
  const corroborativeLinks = REVIEWED_MUTATION_CORROBORATIVE_LINKS[id] ?? [];
  const corroboratedByCaseIds = corroborativeLinks.map(({ caseId }) => caseId);
  const corroborativeSet = new Set(corroboratedByCaseIds);
  const killedByCaseIds = reviewedCaseLinkOrder.filter(
    (caseId) => !corroborativeSet.has(caseId),
  );
  return {
    id,
    faultFamily,
    operator,
    mutatedFault,
    killedByCaseIds,
    ...(corroborativeLinks.length === 0
      ? {}
      : {
          corroboratedByCaseIds,
          corroborativeLinks,
          reviewedCaseLinkOrder,
        }),
    expectedDetection,
  };
};

const REVIEWED_MUTATION_SEMANTICS = deepFreeze([
  mutationSemantic("T1-MUT-001", "base-quality", "major-triad-third-flat", "major families emit b3", "degree, spelling, pitch-class, and role mismatch", ["T1-FORMULA-001","T1-LIT-001","T1-ROOT-MATRIX-001"]),
  mutationSemantic("T1-MUT-002", "base-quality", "minor-triad-third-natural", "minor families emit natural 3", "degree and guide-role mismatch", ["T1-FORMULA-002","T1-LIT-002","T1-ROOT-MATRIX-001"]),
  mutationSemantic("T1-MUT-003", "role-assignment", "ordinary-fifth-required", "every ordinary perfect fifth becomes required", "required/optional partition mismatch", ["T1-FORMULA-001","T1-FORMULA-013","T1-LAW-008"]),
  mutationSemantic("T1-MUT-004", "seventh-quality", "major-seventh-flat", "major seventh family uses b7", "degree, pitch class, and E-sharp spelling mismatch", ["T1-FORMULA-012","T1-LIT-012","T1-SPELL-002"]),
  mutationSemantic("T1-MUT-005", "extension-closure", "dominant-nine-omits-seventh", "C9 resolves as triad plus 9", "missing required guide b7", ["T1-FORMULA-020","T1-LIT-020","T1-ROOT-MATRIX-001"]),
  mutationSemantic("T1-MUT-006", "extension-closure", "dominant-thirteen-omits-closure", "13 omits 9 or 11 from semantic membership", "degree and optional closure mismatch", ["T1-FORMULA-024","T1-LIT-024","T1-ROOT-MATRIX-001"]),
  mutationSemantic("T1-MUT-007", "sixth-family", "minor-sixth-flat-six", "minor 6 uses b6 instead of natural 6", "degree and spelling mismatch", ["T1-FORMULA-009","T1-LIT-009","T1-ROOT-MATRIX-001"]),
  mutationSemantic("T1-MUT-008", "sixth-family", "six-nine-adds-seventh", "6/9 is treated as a seventh family", "extra seventh and guide role", ["T1-FORMULA-010","T1-FORMULA-011","T1-LIT-010","T1-LIT-011"]),
  mutationSemantic("T1-MUT-009", "accidental-identity", "diminished-seventh-normalize-to-six", "bb7 becomes degree 6", "degree identity and spelling mismatch", ["T1-FORMULA-017","T1-SPELL-006","T1-SPELL-007","T1-SPELL-008"]),
  mutationSemantic("T1-MUT-010", "role-assignment", "half-diminished-fifth-optional", "b5 loses identity-required role", "required/optional role mismatch", ["T1-FORMULA-016","T1-LIT-016"]),
  mutationSemantic("T1-MUT-011", "role-assignment", "augmented-major-drop-sharp-five", "augmented-major seventh uses ordinary 5 or omits #5", "identity degree and role mismatch", ["T1-FORMULA-018","T1-LIT-018"]),
  mutationSemantic("T1-MUT-012", "suspension", "suspension-retains-base-third", "ordinary sus2/sus4 retains the base third without explicit add3", "extra retained third or lost absent-third omission warning", ["T1-FORMULA-005","T1-FORMULA-006","T1-LIT-046","T1-LIT-055"]),
  mutationSemantic("T1-MUT-013", "accidental-identity", "canonicalize-by-pitch-class", "enharmonic degree identities collapse", "spelled identity or tuple length mismatch", ["T1-CUSTOM-003","T1-SPELL-003","T1-SPELL-004","T1-SPELL-008"]),
  mutationSemantic("T1-MUT-014", "accidental-identity", "sharp-nine-as-flat-three", "#9 is stored or explained as b3", "degree number, target letter, and spelling mismatch", ["T1-LIT-037","T1-SPELL-003","T1-SPELL-004"]),
  mutationSemantic("T1-MUT-015", "accidental-identity", "double-flat-seven-as-natural-six", "bb7 and 6 share one semantic record", "degree number or spelling mismatch", ["T1-FORMULA-017","T1-SPELL-008"]),
  mutationSemantic("T1-MUT-016", "accidental-identity", "reuse-root-letter-for-degree", "spelling ignores diatonic target letter", "target step mismatch", ["T1-SPELL-001","T1-SPELL-002","T1-SPELL-005"]),
  mutationSemantic("T1-MUT-017", "accidental-identity", "pitch-class-first-enharmonic-choice", "spelling chooses a convenient enharmonic after modulo projection", "rejected shortcut appears or corrected Gbb is lost", ["T1-SPELL-001","T1-SPELL-002","T1-SPELL-003","T1-SPELL-006"]),
  mutationSemantic("T1-MUT-018", "degree-spelling", "allow-triple-accidental", "required alteration +/-3 is emitted", "missing typed refusal or partial spelling", ["T1-SPELL-011","T1-SPELL-012"]),
  mutationSemantic("T1-MUT-019", "degree-spelling", "clamp-accidental", "required triple accidental is clamped to double", "required +/-3 refusal replaced by a clamped spelling, or exhaustive cell outcome mismatch", ["T1-SPELL-011","T1-SPELL-012","T1-SPELL-PUBLIC-MATRIX-001"]),
  mutationSemantic("T1-MUT-020", "transposition", "transpose-by-semitones-only", "transposition drops diatonic direction", "inverse spelling or projection-commutation mismatch", ["T1-LAW-004","T1-LAW-005","T1-ROOT-MATRIX-001"]),
  mutationSemantic("T1-MUT-021", "transposition", "transpose-membership-not-bass", "slash bass is not transposed with chord source", "inverse slash spelling mismatch", ["T1-LAW-004","T1-LIT-047","T1-LIT-048"]),
  mutationSemantic("T1-MUT-022", "altered-dominant", "alt-single-variant", "7alt returns only one realization", "variant count and IDs mismatch", ["T1-LIT-045","T1-OPSTATE-003"]),
  mutationSemantic("T1-MUT-023", "altered-dominant", "alt-reorder-variants", "four alt variants are sorted by pitch class or cost", "stable ID order mismatch", ["T1-LIT-045","T1-OPSTATE-003"]),
  mutationSemantic("T1-MUT-024", "altered-dominant", "alt-include-natural-five-or-nine", "bare alt retains natural 5 or 9", "variant degree membership mismatch", ["T1-LIT-045"]),
  mutationSemantic("T1-MUT-025", "altered-dominant", "merge-alt-ids-after-omission", "no5 merges variants whose remaining degree sets coincide", "missing or renamed realization IDs", ["T1-LIT-056"]),
  mutationSemantic("T1-MUT-026", "modifier-order", "apply-addition-before-suspension", "add3 is removed by a later suspension", "missing explicit required 3", ["T1-LIT-053"]),
  mutationSemantic("T1-MUT-027", "modifier-order", "structural-alteration-coexists-with-natural-five", "b5/#5 fails to replace natural 5", "extra natural 5 and wrong role partition", ["T1-LIT-034","T1-LIT-035"]),
  mutationSemantic("T1-MUT-028", "modifier-order", "color-alteration-retains-natural-closure", "altered 9/11/13 fails to remove closure supplied by extension", "replacement/coexistence degree mismatch", ["T1-LIT-042","T1-LIT-044","T1-LIT-054"]),
  mutationSemantic("T1-MUT-029", "modifier-order", "omission-removes-one-alter-only", "omission leaves another same-number degree or alt variant member", "remaining same-number degree or role mismatch", ["T1-LIT-052","T1-LIT-056","T1-LIT-059"]),
  mutationSemantic("T1-MUT-030", "modifier-order", "addition-implies-extension-closure", "add9/add11/add13 inserts intermediate seventh or colors", "extra closure degrees", ["T1-LIT-050","T1-LIT-051","T1-LIT-057"]),
  mutationSemantic("T1-MUT-031", "role-assignment", "highest-extension-optional", "highest named 9/11/13 is optional", "required/optional partition mismatch", ["T1-FORMULA-019","T1-FORMULA-022","T1-FORMULA-024","T1-FORMULA-033"]),
  mutationSemantic("T1-MUT-032", "role-assignment", "identity-fifth-optional", "power/dim/aug identity fifth becomes optional", "family role mismatch", ["T1-FORMULA-003","T1-FORMULA-004","T1-FORMULA-007","T1-FORMULA-016","T1-FORMULA-018"]),
  mutationSemantic("T1-MUT-033", "role-assignment", "add-three-guide", "generic explicit add3 is promoted to guide tone", "guide array mismatch", ["T1-LIT-053"]),
  mutationSemantic("T1-MUT-034", "omission", "suppress-absent-omission-warning", "absent no3/no5 is silent", "missing source-path warning", ["T1-LIT-055"]),
  mutationSemantic("T1-MUT-035", "omission", "warn-on-present-omission", "successful removal emits omission_absent", "unexpected warning or warning count", ["T1-LIT-052","T1-LIT-059"]),
  mutationSemantic("T1-MUT-036", "slash-bass-separation", "slash-bass-in-degree-membership", "bass is inserted into degrees/spellings/roles", "tuple length or membership mismatch", ["T1-CUSTOM-004","T1-LIT-047","T1-LIT-048","T1-LIT-049"]),
  mutationSemantic("T1-MUT-037", "slash-bass-separation", "discard-slash-bass", "resolved bass becomes null", "bass identity mismatch", ["T1-CUSTOM-004","T1-LIT-047","T1-LIT-048","T1-LIT-049"]),
  mutationSemantic("T1-MUT-038", "custom-exactness", "deduplicate-custom-pitches", "custom duplicate spellings or projections collapse", "tuple length/order mismatch", ["T1-CUSTOM-002","T1-CUSTOM-005"]),
  mutationSemantic("T1-MUT-039", "custom-exactness", "sort-custom-pitches", "custom pitchNames sort by pitch class", "spelled tuple and pitch-class tuple order mismatch", ["T1-CUSTOM-002","T1-CUSTOM-003","T1-CUSTOM-005"]),
  mutationSemantic("T1-MUT-040", "custom-exactness", "infer-custom-formula", "familiar custom label or notes receive semantic degrees", "non-null degree roles or missing limitations", ["T1-CUSTOM-001","T1-CUSTOM-007"]),
  mutationSemantic("T1-MUT-041", "transactional-refusal", "return-partial-realization-on-refusal", "a failure exposes accumulated candidates or warnings", "partial output present", ["T1-LIT-060","T1-LIT-065","T1-OPSTATE-005","T1-SPELL-011"]),
  mutationSemantic("T1-MUT-042", "transactional-refusal", "generated-output-refusal-path", "a refusal points into realizations instead of source provenance", "exact source path mismatch", ["T1-LIT-060","T1-LIT-065","T1-OPSTATE-007","T1-OPSTATE-008","T1-SPELL-011"]),
  mutationSemantic("T1-MUT-043", "input-limits", "extension-count-off-by-one", "two extension records are visited as valid", "missing first-excess index one refusal", ["T1-OPSTATE-007"]),
  mutationSemantic("T1-MUT-044", "input-limits", "addition-count-off-by-one", "eight additions are visited as valid", "missing first-excess index seven refusal", ["T1-OPSTATE-007"]),
  mutationSemantic("T1-MUT-045", "input-limits", "alteration-count-off-by-one", "nine alterations are visited as valid", "missing first-excess index eight refusal", ["T1-OPSTATE-007"]),
  mutationSemantic("T1-MUT-046", "input-limits", "omission-count-off-by-one", "three omissions are visited as valid", "missing first-excess index two refusal", ["T1-OPSTATE-007"]),
  mutationSemantic("T1-MUT-047", "modifier-vocabulary", "reject-opposite-eleven-thirteen-signs", "b11 or #13 is omitted from the accepted alteration vocabulary", "unexpected refusal or missing degree", ["T1-LIT-038","T1-LIT-041","T1-SPELL-015","T1-SPELL-016"]),
  mutationSemantic("T1-MUT-048", "canonicalization", "retain-cross-category-exact-duplicate", "an exact degree supplied by extension closure and addition survives twice or keeps the optional role", "duplicate output record, tuple length, required role, or provenance mismatch", ["T1-LAW-007","T1-LIT-079"]),
  mutationSemantic("T1-MUT-049", "output-limit", "permit-seventeen-degree-realization", "the resolver spells or returns a seventeenth distinct semantic degree", "missing exact output-limit refusal, nonzero spelling work, or partial output", ["T1-LIT-080","T1-OPSTATE-009"]),
  mutationSemantic("T1-MUT-050", "degree-spelling", "preserve-abdim7-plan-typo", "Abdim7 bb7 is emitted as Fb instead of directed Gbb", "target letter and pitch class mismatch", ["T1-CORRECTION-ABDIM7","T1-SPELL-006"]),
  mutationSemantic("T1-MUT-051", "strict-family-refusal", "fallback-unsupported-family-to-nearest-rule", "a power seventh or another unsupported family resolves as a nearby dominant or base chord", "exhaustive family-state outcome, refusal path, or attempted rule ID mismatch", ["T1-FAMILY-STATE-MATRIX-001","T1-LAW-012","T1-LIT-060","T1-LIT-061","T1-LIT-071"]),
  mutationSemantic("T1-MUT-052", "modifier-order", "reverse-global-refusal-precedence", "a later refusal code, later source index, or lower-priority conflict masks the frozen winner", "wrong code, path, phase, attempted rule, reason, or conflict winner in the pairwise tournament", ["T1-OPSTATE-010"]),
  mutationSemantic("T1-MUT-053", "degree-spelling", "handle-only-formula-emitted-degree-identities", "standalone spelling omits or misroutes a domain-valid degree such as sharp two, flat four, or sharp six", "one or more cells in the exhaustive 35 by 50 public spelling matrix diverge", ["T1-SPELL-PUBLIC-MATRIX-001"]),
]);

const ALLOWED_AUTHORITY_CLASSES = new Set([
  "definition",
  "published-reference",
  "expert-reviewed",
  "compatibility",
]);

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function objectArray(value: unknown): JsonObject[] | null {
  return Array.isArray(value) && value.every(isObject) ? value : null;
}

function stringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : null;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const object = value as JsonObject;
  return `{${Object.keys(object)
    .sort(codeUnitCompare)
    .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
    .join(",")}}`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function sameJson(left: unknown, right: unknown): boolean {
  return stableJson(left) === stableJson(right);
}

function codeUnitCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function pathString(path: readonly (string | number)[]): string {
  return path.length === 0
    ? "$"
    : `$${path.map((item) => `[${JSON.stringify(item)}]`).join("")}`;
}

/** Detect decoded duplicate keys before JSON.parse can apply last-key-wins. */
function duplicateJsonKeys(source: string): readonly string[] {
  let cursor = 0;
  const duplicates: string[] = [];
  const whitespace = (): void => {
    while (/\s/u.test(source[cursor] ?? "")) cursor += 1;
  };
  const stringToken = (): Readonly<{ decoded: string; start: number }> | null => {
    whitespace();
    if (source[cursor] !== '"') return null;
    const start = cursor;
    cursor += 1;
    while (cursor < source.length) {
      const unit = source[cursor];
      if (unit === "\\") {
        cursor += 2;
        continue;
      }
      cursor += 1;
      if (unit === '"') {
        try {
          return { decoded: JSON.parse(source.slice(start, cursor)) as string, start };
        } catch {
          return null;
        }
      }
    }
    return null;
  };
  const value = (path: readonly (string | number)[]): void => {
    whitespace();
    const unit = source[cursor];
    if (unit === "{") {
      cursor += 1;
      const seen = new Set<string>();
      whitespace();
      if (source[cursor] === "}") {
        cursor += 1;
        return;
      }
      while (cursor < source.length) {
        const key = stringToken();
        if (key === null) return;
        if (seen.has(key.decoded)) {
          duplicates.push(`${pathString(path)}.${JSON.stringify(key.decoded)}@${String(key.start)}`);
        }
        seen.add(key.decoded);
        whitespace();
        if (source[cursor] !== ":") return;
        cursor += 1;
        value([...path, key.decoded]);
        whitespace();
        if (source[cursor] === "}") {
          cursor += 1;
          return;
        }
        if (source[cursor] !== ",") return;
        cursor += 1;
      }
      return;
    }
    if (unit === "[") {
      cursor += 1;
      let index = 0;
      whitespace();
      if (source[cursor] === "]") {
        cursor += 1;
        return;
      }
      while (cursor < source.length) {
        value([...path, index]);
        index += 1;
        whitespace();
        if (source[cursor] === "]") {
          cursor += 1;
          return;
        }
        if (source[cursor] !== ",") return;
        cursor += 1;
      }
      return;
    }
    if (unit === '"') {
      stringToken();
      return;
    }
    while (cursor < source.length && !/[\s,\]}]/u.test(source[cursor] ?? "")) cursor += 1;
  };
  value([]);
  return duplicates.sort(codeUnitCompare);
}

function requireExact(
  actual: unknown,
  expected: unknown,
  code: string,
  path: string,
  message: string,
  findings: T1ContractFinding[],
): void {
  if (!sameJson(actual, expected)) findings.push({ code, path, message });
}

function findingOrder(left: T1ContractFinding, right: T1ContractFinding): number {
  return codeUnitCompare(left.path, right.path) ||
    codeUnitCompare(left.code, right.code) ||
    codeUnitCompare(left.message, right.message);
}

function idOf(record: JsonObject): string | null {
  return typeof record["id"] === "string" && record["id"].length > 0
    ? record["id"]
    : null;
}

function requireSortedUniqueIds(
  records: readonly JsonObject[],
  path: string,
  findings: T1ContractFinding[],
): string[] {
  const ids: string[] = [];
  records.forEach((record, index) => {
    const id = idOf(record);
    if (id === null) {
      findings.push({
        code: "T1_CONTRACT_ID_SHAPE",
        path: `${path}[${String(index)}].id`,
        message: "Every reviewed record requires a nonempty string ID.",
      });
    } else {
      ids.push(id);
    }
  });
  const unique = new Set(ids);
  if (unique.size !== ids.length) {
    findings.push({
      code: "T1_CONTRACT_ID_DUPLICATE",
      path,
      message: "Record IDs must be unique within their collection.",
    });
  }
  if (!sameJson(ids, [...ids].sort(codeUnitCompare))) {
    findings.push({
      code: "T1_CONTRACT_ID_ORDER",
      path,
      message: "Record IDs must use ascending ECMAScript code-unit order.",
    });
  }
  return ids;
}

function requireUniqueStringRefs(
  value: unknown,
  path: string,
  findings: T1ContractFinding[],
  nonempty = true,
): readonly string[] {
  const refs = stringArray(value);
  if (refs === null || (nonempty && refs.length === 0)) {
    findings.push({
      code: "T1_CONTRACT_REFERENCE_SHAPE",
      path,
      message: nonempty
        ? "Reference list must be a nonempty string array."
        : "Reference list must be a string array.",
    });
    return [];
  }
  if (new Set(refs).size !== refs.length) {
    findings.push({
      code: "T1_CONTRACT_REFERENCE_DUPLICATE",
      path,
      message: "Reference IDs must be unique.",
    });
  }
  return refs;
}

function collectLinkedCases(
  root: JsonObject | undefined,
  filename: string,
  collections: readonly string[],
  findings: T1ContractFinding[],
): LinkedCase[] {
  if (root === undefined) return [];
  const result: LinkedCase[] = [];
  for (const collection of collections) {
    const records = objectArray(root[collection]);
    if (records === null) {
      findings.push({
        code: "T1_CONTRACT_CASE_SHAPE",
        path: `${filename}.${collection}`,
        message: "Linked case collection must be an array of objects.",
      });
      continue;
    }
    requireSortedUniqueIds(records, `${filename}.${collection}`, findings);
    records.forEach((record, index) => {
      const id = idOf(record);
      const path = `${filename}.${collection}[${String(index)}]`;
      const traceIds = requireUniqueStringRefs(record["traceIds"], `${path}.traceIds`, findings);
      const authorityIds = requireUniqueStringRefs(record["authorityIds"], `${path}.authorityIds`, findings);
      if (id !== null) result.push({ id, path, traceIds, authorityIds, record });
    });
  }
  return result;
}

function validateIndependenceFlags(
  value: unknown,
  path: readonly (string | number)[],
  findings: T1ContractFinding[],
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      validateIndependenceFlags(item, [...path, index], findings);
    });
    return;
  }
  if (!isObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if ((key === "productionOutputUsed" || key === "expectedValuesGenerated") && child !== false) {
      findings.push({
        code: "T1_CONTRACT_INDEPENDENCE",
        path: `${pathString(path)}[${JSON.stringify(key)}]`,
        message: `${key} must be the literal false wherever declared.`,
      });
    }
    validateIndependenceFlags(child, [...path, key], findings);
  }
}

function validateManifest(root: JsonObject, findings: T1ContractFinding[]): void {
  requireExact(
    root["status"],
    "independently-authored-pre-production",
    "T1_CONTRACT_STATUS",
    `${CONTRACT_FILENAME}.status`,
    "The T1 specification corpus must remain explicitly pre-production and independently authored.",
    findings,
  );
  requireExact(
    root["publicContract"],
    T1_REVIEWED_PUBLIC_CONTRACT.module,
    "T1_CONTRACT_PUBLIC",
    `${CONTRACT_FILENAME}.publicContract`,
    "Public resolution contract owner changed.",
    findings,
  );
  requireExact(
    root["identity"],
    {
      contractSchema: T1_REVIEWED_PUBLIC_CONTRACT.contractSchema,
      resolvedChordSchema: T1_REVIEWED_PUBLIC_CONTRACT.resolvedChordSchema,
      formulaTableId: T1_REVIEWED_PUBLIC_CONTRACT.formulaTable.id,
      formulaTableVersion: T1_REVIEWED_PUBLIC_CONTRACT.formulaTable.version,
      spellingPolicyId: T1_REVIEWED_PUBLIC_CONTRACT.degreeSpellingPolicy.id,
      spellingPolicyVersion: T1_REVIEWED_PUBLIC_CONTRACT.degreeSpellingPolicy.version,
      degreeRolePolicyId: T1_REVIEWED_PUBLIC_CONTRACT.degreeRolePolicy.id,
      degreeRolePolicyVersion: T1_REVIEWED_PUBLIC_CONTRACT.degreeRolePolicy.version,
      semanticRealizationIds: [...REVIEWED_SEMANTIC_REALIZATION_IDS],
      customRealizationId: "custom",
    },
    "T1_CONTRACT_PUBLIC",
    `${CONTRACT_FILENAME}.identity`,
    "Versioned T1 public identities changed.",
    findings,
  );
  requireExact(root["operationIds"], REVIEWED_OPERATION_IDS, "T1_CONTRACT_PUBLIC", `${CONTRACT_FILENAME}.operationIds`, "Operation inventory changed.", findings);
  requireExact(root["formulaPhases"], REVIEWED_FORMULA_PHASES, "T1_CONTRACT_FORMULA", `${CONTRACT_FILENAME}.formulaPhases`, "Formula phase order changed.", findings);
  requireExact(root["refusalCodes"], REVIEWED_REFUSAL_CODES, "T1_CONTRACT_CODE_INVENTORY", `${CONTRACT_FILENAME}.refusalCodes`, "Refusal code inventory changed.", findings);
  requireExact(root["warningCodes"], REVIEWED_WARNING_CODES, "T1_CONTRACT_CODE_INVENTORY", `${CONTRACT_FILENAME}.warningCodes`, "Warning code inventory changed.", findings);
  requireExact(root["customLimitations"], T1_REVIEWED_PUBLIC_CONTRACT.customLimitations, "T1_CONTRACT_PUBLIC", `${CONTRACT_FILENAME}.customLimitations`, "Custom limitation inventory changed.", findings);
  requireExact(root["limits"], T1_REVIEWED_LIMITS, "T1_CONTRACT_LIMITS", `${CONTRACT_FILENAME}.limits`, "Reviewed input, work, memory, or output limits changed.", findings);
  requireExact(root["degreeTokenVocabulary"], REVIEWED_DEGREE_TOKENS, "T1_CONTRACT_DEGREE_VOCABULARY", `${CONTRACT_FILENAME}.degreeTokenVocabulary`, "Directed degree-token definitions changed.", findings);
  requireExact(
    root["rolePolicy"],
    {
      root: "required",
      majorOrMinorThird: ["required", "guide"],
      ordinaryFifth: "optional",
      identityFifths: "required for power, diminished, augmented, half-diminished, diminished-seventh, and augmented-major-seventh families",
      seventh: ["required", "guide"],
      sixth: "required; the added 9 in 6/9 is optional",
      highestExtension: "required",
      intermediateExtensionClosure: "optional",
      explicitAdditionOrAlteration: "required",
      suspension: ["required", "guide"],
      genericAdd3: "required but not guide",
      omission: "remove every degree with the omitted number from every realization; warn when none was present",
      slashBass: "preserve separately; never add it to degree membership or roles",
    },
    "T1_CONTRACT_ROLE_POLICY",
    `${CONTRACT_FILENAME}.rolePolicy`,
    "The normative role policy changed.",
    findings,
  );
  requireExact(
    root["expectedInventoryMinimums"],
    {
      formulaRules: 33,
      allRootCells: 396,
      literalPlanSymbols: 46,
      spellingCases: 12,
      customCases: 6,
      lawCases: 10,
      operationStateCases: 6,
      traceRows: 13,
      authorities: 6,
      reviewedMutationControls: 30,
    },
    "T1_CONTRACT_INVENTORY_MINIMUMS",
    `${CONTRACT_FILENAME}.expectedInventoryMinimums`,
    "Independent corpus minimums changed.",
    findings,
  );
  requireExact(
    root["mutationControlReview"],
    REVIEWED_MUTATION_CONTROL_REVIEW,
    "T1_CONTRACT_MUTATION_REVIEW_POLICY",
    `${CONTRACT_FILENAME}.mutationControlReview`,
    "Direct-killer, corroborative, conservation, or source-mutation review policy changed.",
    findings,
  );
  requireExact(
    root["lawPredicateReview"],
    T1_REVIEWED_LAW_PREDICATE_REVIEW,
    "T1_CONTRACT_LAW_PREDICATE_REVIEW",
    `${CONTRACT_FILENAME}.lawPredicateReview`,
    "The reviewed law-predicate digest inventory or its canonicalization contract changed.",
    findings,
  );
  requireExact(
    root["knownPlanCorrections"],
    [{
      id: "T1-CORRECTION-ABDIM7",
      source: "docs/REBUILD_PLAN.md section 10.4 example row",
      incorrectExample: "Abdim7 diminished seventh -> Fb",
      correctExpectation: "Abdim7 bb7 -> Gbb",
      controlExpectation: "Gdim7 bb7 -> Fb",
      reason: "A seventh above an A-root must use letter G; Fb is a seventh above G, not Ab.",
      traceIds: ["T1-TRACE-LEGACY-L-THEORY-01", "T1-TRACE-SPELLING"],
      authorityIds: ["T1-AUTH-LEGACY", "T1-AUTH-SPELLING"],
    }],
    "T1_CONTRACT_PLAN_CORRECTION",
    `${CONTRACT_FILENAME}.knownPlanCorrections`,
    "The reviewed Abdim7/Gbb plan correction changed.",
    findings,
  );
  requireExact(
    root["independence"],
    {
      fixtureOracle: "degree tokens, roots, spelling examples, and pitch classes are checked from fixture-owned definition data",
      forbiddenShortcuts: [
        "importing production formula tables into a fixture validator",
        "generating expected values with resolveChord or spellChordDegree",
        "choosing one 7alt variant before an explicit downstream audition policy",
        "normalizing enharmonic degrees by pitch class",
        "repairing unsupported formulas into a nearby supported family",
        "silently dropping a slash bass, duplicate custom pitch, or warning",
      ],
    },
    "T1_CONTRACT_INDEPENDENCE_POLICY",
    `${CONTRACT_FILENAME}.independence`,
    "The fixture-oracle independence policy changed.",
    findings,
  );

  const ordering = isObject(root["ordering"]) ? root["ordering"] : {};
  requireExact(
    ordering,
    {
      degreeOrder: "ascending number, then ascending alter; stable realization-local exact duplicates are collapsed only in canonicalization",
      realizationOrder: REVIEWED_SEMANTIC_REALIZATION_IDS,
      warningOrder: "at most one theory.omission_absent warning for absent degree 3; no5 is always present in v1",
      refusalPrecedence: T1_REVIEWED_REFUSAL_PRECEDENCE,
      allOrNothing: "Any refusal returns no partial realization, pitch, warning, or chosen altered-dominant audition variant.",
    },
    "T1_CONTRACT_ORDERING",
    `${CONTRACT_FILENAME}.ordering`,
    "Degree, realization, warning, or refusal ordering changed.",
    findings,
  );
  requireExact(ordering["realizationOrder"], REVIEWED_SEMANTIC_REALIZATION_IDS, "T1_CONTRACT_REALIZATION_ORDER", `${CONTRACT_FILENAME}.ordering.realizationOrder`, "Realization ordering changed.", findings);
  requireExact(ordering["refusalPrecedence"], T1_REVIEWED_REFUSAL_PRECEDENCE, "T1_CONTRACT_REFUSAL_PRECEDENCE", `${CONTRACT_FILENAME}.ordering.refusalPrecedence`, "Refusal precedence changed.", findings);
  if (typeof ordering["allOrNothing"] !== "string" || !ordering["allOrNothing"].includes("no partial realization")) {
    findings.push({
      code: "T1_CONTRACT_ALL_OR_NOTHING",
      path: `${CONTRACT_FILENAME}.ordering.allOrNothing`,
      message: "Refusal ordering must preserve the no-partial-output guarantee.",
    });
  }

  const modifierVocabularies = isObject(root["inputPolicy"])
    ? root["inputPolicy"]
    : {};
  requireExact(modifierVocabularies["extensionNumbers"], T1_REVIEWED_PUBLIC_CONTRACT.extensionNumbers, "T1_CONTRACT_MODIFIER_VOCABULARY", `${CONTRACT_FILENAME}.inputPolicy.extensionNumbers`, "Extension number vocabulary changed.", findings);
  requireExact(modifierVocabularies["additionNumbers"], T1_REVIEWED_PUBLIC_CONTRACT.additionNumbers, "T1_CONTRACT_MODIFIER_VOCABULARY", `${CONTRACT_FILENAME}.inputPolicy.additionNumbers`, "Addition number vocabulary changed.", findings);
  requireExact(modifierVocabularies["alterationNumbers"], T1_REVIEWED_PUBLIC_CONTRACT.alterationNumbers, "T1_CONTRACT_MODIFIER_VOCABULARY", `${CONTRACT_FILENAME}.inputPolicy.alterationNumbers`, "Alteration number vocabulary changed.", findings);
  requireExact(modifierVocabularies["omissionNumbers"], T1_REVIEWED_PUBLIC_CONTRACT.omissionNumbers, "T1_CONTRACT_MODIFIER_VOCABULARY", `${CONTRACT_FILENAME}.inputPolicy.omissionNumbers`, "Omission number vocabulary changed.", findings);
  requireExact(modifierVocabularies["modifierAlterations"], T1_REVIEWED_PUBLIC_CONTRACT.modifierAlterations, "T1_CONTRACT_MODIFIER_VOCABULARY", `${CONTRACT_FILENAME}.inputPolicy.modifierAlterations`, "Modifier alteration vocabulary changed.", findings);
  requireExact(modifierVocabularies["modifierConflictPrecedence"], T1_REVIEWED_PUBLIC_CONTRACT.modifierConflictPrecedence, "T1_CONTRACT_CONFLICT_PRECEDENCE", `${CONTRACT_FILENAME}.inputPolicy.modifierConflictPrecedence`, "Modifier-conflict precedence changed.", findings);
  requireExact(modifierVocabularies["refusalReasonPrecedence"], T1_REVIEWED_PUBLIC_CONTRACT.refusalReasonPrecedence, "T1_CONTRACT_REFUSAL_REASON_PRECEDENCE", `${CONTRACT_FILENAME}.inputPolicy.refusalReasonPrecedence`, "Same-code refusal reason precedence changed.", findings);

  const matrix = isObject(root["matrix"]) ? root["matrix"] : {};
  requireExact(
    {
      rootCount: matrix["rootCount"],
      familySeedCount: matrix["familySeedCount"],
      expectedCellCount: matrix["expectedCellCount"],
      construction: matrix["construction"],
      roots: matrix["roots"],
      familyBuckets: matrix["familyBuckets"],
    },
    {
      rootCount: 12,
      familySeedCount: 33,
      expectedCellCount: 396,
      construction: "complete Cartesian product; exclusions are forbidden",
      roots: REVIEWED_ROOTS.map((root) => root.symbol),
      familyBuckets: { triad: 7, sixth: 4, seventh: 7, extension: 9, "dominant-suspension": 6 },
    },
    "T1_CONTRACT_MATRIX",
    `${CONTRACT_FILENAME}.matrix`,
    "The exact 12 by 33 all-root matrix changed.",
    findings,
  );
}

function coreFormula(record: JsonObject): JsonObject {
  return {
    id: record["id"],
    bucket: record["bucket"],
    familyId: record["familyId"],
    symbolTemplate: record["symbolTemplate"],
    degrees: record["degrees"],
    required: record["required"],
    optional: record["optional"],
    guide: record["guide"],
  };
}

function validateDegreePartition(
  record: JsonObject,
  path: string,
  findings: T1ContractFinding[],
): void {
  const degrees = stringArray(record["degrees"]);
  const required = stringArray(record["required"]);
  const optional = stringArray(record["optional"]);
  const guide = stringArray(record["guide"]);
  if (degrees === null || required === null || optional === null || guide === null) return;
  const vocabularyOrder = new Map<string, number>(
    REVIEWED_DEGREE_TOKENS.map((item, index) => [item.token, index]),
  );
  if (new Set(degrees).size !== degrees.length || degrees.some((token) => !vocabularyOrder.has(token))) {
    findings.push({ code: "T1_CONTRACT_DEGREE_SET", path: `${path}.degrees`, message: "Degree list must use unique reviewed degree tokens." });
  }
  const expectedOrder = [...degrees].sort((left, right) => (vocabularyOrder.get(left) ?? 999) - (vocabularyOrder.get(right) ?? 999));
  if (!sameJson(degrees, expectedOrder)) {
    findings.push({ code: "T1_CONTRACT_DEGREE_ORDER", path: `${path}.degrees`, message: "Degree tokens must use ascending number then alteration order." });
  }
  const requiredSet = new Set(required);
  const optionalSet = new Set(optional);
  if (
    new Set(required).size !== required.length ||
    new Set(optional).size !== optional.length ||
    required.some((token) => optionalSet.has(token)) ||
    !sameJson([...new Set([...required, ...optional])].sort(codeUnitCompare), [...new Set(degrees)].sort(codeUnitCompare))
  ) {
    findings.push({ code: "T1_CONTRACT_ROLE_PARTITION", path, message: "Required and optional roles must be disjoint and exhaust degrees." });
  }
  if (guide.some((token) => !requiredSet.has(token)) || new Set(guide).size !== guide.length) {
    findings.push({ code: "T1_CONTRACT_GUIDE_ROLE", path: `${path}.guide`, message: "Guide tones must be a unique subset of required degrees." });
  }
}

const REVIEWED_MATCH_TRIADS = [
  "major", "minor", "diminished", "augmented", "sus2", "sus4", "power",
  "major", "minor", "major", "minor", "major", "major", "minor", "minor",
  "diminished", "diminished", "augmented", "major", "major", "minor", "major",
  "minor", "major", "major", "minor", "sus2", "sus2", "sus2", "sus4",
  "sus4", "sus4", "major",
] as const;

const REVIEWED_MATCH_SEVENTHS = [
  null, null, null, null, null, null, null, null, null, null, null,
  "major", "minor", "minor", "major", "minor", "diminished", "major",
  "major", "minor", "minor", "minor", "minor", "minor", "major", "minor",
  "minor", "minor", "minor", "minor", "minor", "minor", "major",
] as const;

function extensionForFormulaIndex(index: number): readonly JsonObject[] {
  if ([18, 19, 20, 27, 30].includes(index)) return [{ number: 9, alter: 0 }];
  if ([21, 22, 32].includes(index)) return [{ number: 11, alter: 0 }];
  if ([23, 24, 25, 28, 31].includes(index)) return [{ number: 13, alter: 0 }];
  return [];
}

function reviewedBasePhase(formulaRow: FormulaLiteral): JsonObject {
  const suspension = formulaRow.familyId.includes("sus2")
    ? "2"
    : formulaRow.familyId.includes("sus4")
      ? "4"
      : null;
  if (suspension === null) {
    return {
      degrees: formulaRow.degrees,
      required: formulaRow.required,
      optional: formulaRow.optional,
      guide: formulaRow.guide,
    };
  }
  const order = new Map<string, number>(
    REVIEWED_DEGREE_TOKENS.map((item, index) => [item.token, index]),
  );
  const replace = (values: readonly string[]): string[] => values
    .map((token) => token === suspension ? "3" : token)
    .sort((left, right) => (order.get(left) ?? 999) - (order.get(right) ?? 999));
  return {
    degrees: replace(formulaRow.degrees),
    required: replace(formulaRow.required),
    optional: [...formulaRow.optional],
    guide: replace(formulaRow.guide),
  };
}

function validateMatchAndBasePhases(root: JsonObject, findings: T1ContractFinding[]): void {
  const sidecar = isObject(root["matchAndBasePhaseByFormulaId"])
    ? root["matchAndBasePhaseByFormulaId"]
    : {};
  requireExact(
    Object.keys(sidecar).sort(codeUnitCompare),
    REVIEWED_FORMULAS.map((row) => row.id),
    "T1_CONTRACT_FORMULA_MATCH",
    "formula-rules.json.matchAndBasePhaseByFormulaId",
    "Every formula ID must have exactly one match and base-phase record.",
    findings,
  );
  const matches: string[] = [];
  REVIEWED_FORMULAS.forEach((formulaRow, index) => {
    const path = `formula-rules.json.matchAndBasePhaseByFormulaId.${formulaRow.id}`;
    const candidate = sidecar[formulaRow.id];
    const item: JsonObject = isObject(candidate) ? candidate : {};
    const expectedMatch = {
      triad: REVIEWED_MATCH_TRIADS[index],
      sixth: index >= 7 && index <= 10 ? { number: 6, alter: 0 } : null,
      seventh: REVIEWED_MATCH_SEVENTHS[index],
      extensions: extensionForFormulaIndex(index),
      naturalNineAdditionFamilyMarker: index === 9 || index === 10,
      colorPolicy: "none",
    };
    requireExact(item["match"], expectedMatch, "T1_CONTRACT_FORMULA_MATCH", `${path}.match`, "Exact ChordSpec family match changed.", findings);
    requireExact(item["basePhase"], reviewedBasePhase(formulaRow), "T1_CONTRACT_BASE_PHASE", `${path}.basePhase`, "Exact pre-suspension base-phase degrees or roles changed.", findings);
    const suspension = formulaRow.familyId.includes("sus2")
      ? "2"
      : formulaRow.familyId.includes("sus4")
        ? "4"
        : null;
    const basePhase = item["basePhase"];
    if (suspension !== null && isObject(basePhase)) {
      const base = basePhase;
      const degreeOrder = new Map<string, number>(
        REVIEWED_DEGREE_TOKENS.map((degree, degreeIndex) => [degree.token, degreeIndex]),
      );
      const suspend = (value: unknown): string[] | null => {
        const tokens = stringArray(value);
        if (tokens === null) return null;
        return [...tokens.filter((token) => token !== "3"), suspension]
          .sort((left, right) => (degreeOrder.get(left) ?? 999) - (degreeOrder.get(right) ?? 999));
      };
      requireExact(
        {
          degrees: suspend(base["degrees"]),
          required: suspend(base["required"]),
          optional: base["optional"],
          guide: suspend(base["guide"]),
        },
        {
          degrees: formulaRow.degrees,
          required: formulaRow.required,
          optional: formulaRow.optional,
          guide: formulaRow.guide,
        },
        "T1_CONTRACT_SUSPENSION_LAW",
        path,
        "Suspension phase must remove degree 3 then add the declared 2 or 4 as required and guide.",
        findings,
      );
    }
    if (item["match"] !== undefined) matches.push(stableJson(item["match"]));
  });
  if (new Set(matches).size !== REVIEWED_FORMULAS.length) {
    findings.push({
      code: "T1_CONTRACT_FORMULA_MATCH_DUPLICATE",
      path: "formula-rules.json.matchAndBasePhaseByFormulaId",
      message: "All 33 sourceText-free family match patterns must be structurally unique.",
    });
  }
  requireExact(
    root["matchSelectionPolicy"],
    {
      sourceTextUsed: false,
      rootUsedForFamilySelection: false,
      bassUsedForFamilySelection: false,
      order: [
        "validate collection counts and exact number/alteration vocabularies",
        "select the attempted base rule from triad",
        "apply compatible natural-sixth specificity while deferring sixth-with-seventh and sixth-with-extension to modifier conflict",
        "apply seventh specificity",
        "apply highest-extension specificity",
        "apply altered-dominant color-policy specificity",
      ],
      familyFailurePath: "first incompatible concrete field among triad, sixth, seventh, and extensions under the order above",
      sixNineMarker: {
        derivedFrom: "the unique addition exactly equal to {number:9,alter:0} when sixth is the natural 6; valid ChordSpec degree arrays are internally duplicate-free",
        otherAdditions: "ignored for family selection and processed later in source order",
        consumedByFamilySelection: true,
        candidateInsertion: "inserted exactly once as optional by the selected 6/9 basePhase and skipped by the additions phase",
        inputVisit: "the source addition record is visited exactly once during bounded preflight",
      },
    },
    "T1_CONTRACT_FORMULA_SELECTION",
    "formula-rules.json.matchSelectionPolicy",
    "Attempted-rule selection policy changed.",
    findings,
  );
}

type FamilyStateOutcome = JsonObject & Readonly<{
  outcome: string;
  ruleId: string;
  formulaFamily?: string;
}>;

type PublicRealizationSeed = Readonly<{
  id: string;
  degrees: readonly string[];
  required: readonly string[];
  optional: readonly string[];
  guide: readonly string[];
}>;

const FAMILY_MATRIX_SOURCE_TEXT =
  "T1 family-state matrix sourceText is deliberately non-authoritative";

function reviewedDegree(token: string): JsonObject {
  const definition = REVIEWED_DEGREE_TOKENS.find((item) => item.token === token);
  if (definition === undefined) {
    throw new Error(`Unknown reviewed degree token ${JSON.stringify(token)}.`);
  }
  return { number: definition.number, alter: definition.alter };
}

function canonicalReviewedTokens(tokens: readonly string[]): readonly string[] {
  return [...new Set(tokens)].sort(
    (left, right) =>
      REVIEWED_DEGREE_TOKENS.findIndex((item) => item.token === left) -
      REVIEWED_DEGREE_TOKENS.findIndex((item) => item.token === right),
  );
}

function acceptedFormulaForFacts(facts: JsonObject): FormulaLiteral | null {
  const triad = String(facts["triad"]);
  const seventh = typeof facts["seventh"] === "string"
    ? facts["seventh"]
    : null;
  const extension = typeof facts["extension"] === "number"
    ? facts["extension"]
    : null;
  const naturalNineAddition = facts["naturalNineAddition"] === true;
  let familyId: string | undefined;
  if (facts["sixth"] !== null) {
    familyId = `${triad}-${naturalNineAddition ? "six-nine" : "sixth"}`;
  } else if (extension !== null) {
    familyId = ({
      "major:major:9": "major-ninth",
      "major:major:11": "major-eleventh",
      "major:major:13": "major-thirteenth",
      "major:minor:9": "dominant-ninth",
      "major:minor:11": "dominant-eleventh",
      "major:minor:13": "dominant-thirteenth",
      "minor:minor:9": "minor-ninth",
      "minor:minor:11": "minor-eleventh",
      "minor:minor:13": "minor-thirteenth",
      "sus2:minor:9": "dominant-nine-sus2",
      "sus2:minor:13": "dominant-thirteen-sus2",
      "sus4:minor:9": "dominant-nine-sus4",
      "sus4:minor:13": "dominant-thirteen-sus4",
    } as Readonly<Record<string, string>>)[`${triad}:${seventh ?? "none"}:${String(extension)}`];
  } else if (seventh !== null) {
    familyId = ({
      "major:major": "major-seventh",
      "major:minor": "dominant-seventh",
      "minor:major": "minor-major-seventh",
      "minor:minor": "minor-seventh",
      "diminished:minor": "half-diminished-seventh",
      "diminished:diminished": "diminished-seventh",
      "augmented:major": "augmented-major-seventh",
      "sus2:minor": "dominant-seven-sus2",
      "sus4:minor": "dominant-seven-sus4",
    } as Readonly<Record<string, string>>)[`${triad}:${seventh}`];
  } else {
    familyId = `${triad}-triad`;
  }
  return familyId === undefined
    ? null
    : REVIEWED_FORMULAS.find((formulaRow) => formulaRow.familyId === familyId) ?? null;
}

function publicRealization(
  root: JsonObject,
  formulaRuleId: string,
  seed: PublicRealizationSeed,
  ordinaryNaturalNine: boolean,
): JsonObject {
  const degrees = canonicalReviewedTokens(
    ordinaryNaturalNine ? [...seed.degrees, "9"] : seed.degrees,
  );
  const required = canonicalReviewedTokens(
    ordinaryNaturalNine ? [...seed.required, "9"] : seed.required,
  );
  const optional = canonicalReviewedTokens(
    ordinaryNaturalNine
      ? seed.optional.filter((token) => token !== "9")
      : seed.optional,
  );
  const degreeRecords = degrees.map(reviewedDegree);
  const spellings = degreeRecords.map((degree) => independentSpelling(root, degree));
  if (spellings.some((spelling) => spelling === null)) {
    throw new Error("The reviewed safe-C family matrix produced an unspellable success.");
  }
  return {
    kind: "semantic",
    id: seed.id,
    formulaRuleId,
    degrees: degreeRecords,
    requiredDegrees: required.map(reviewedDegree),
    optionalDegrees: optional.map(reviewedDegree),
    guideToneDegrees: seed.guide.map(reviewedDegree),
    spelledPitchNames: spellings.map((spelling) => ({
      step: spelling?.step,
      alter: spelling?.alter,
    })),
    pitchClasses: spellings.map((spelling) => spelling?.pitchClass),
  };
}

/**
 * Expands the family selector's compact bookkeeping result into the exact
 * public success/refusal envelope.  Keeping this projection separate from the
 * aggregate classifier prevents the 896-cell digest from certifying only
 * codes while silently losing source paths or code-specific payload fields.
 */
function publicFamilyStateOutcome(
  facts: JsonObject,
  outcome: FamilyStateOutcome,
): JsonObject {
  if (outcome.outcome === "accepted") {
    const root = { step: "C", alter: 0 };
    const naturalNineAddition = facts["naturalNineAddition"] === true;
    const ordinaryNaturalNine = naturalNineAddition && facts["sixth"] === null;
    const source = {
      kind: "parsed",
      sourceText: FAMILY_MATRIX_SOURCE_TEXT,
      root,
      triad: facts["triad"],
      sixth: facts["sixth"],
      seventh: facts["seventh"],
      extensions: typeof facts["extension"] === "number"
        ? [{ number: facts["extension"], alter: 0 }]
        : [],
      additions: naturalNineAddition ? [{ number: 9, alter: 0 }] : [],
      alterations: [],
      omissions: [],
      bass: null,
      colorPolicy: facts["colorPolicy"],
    };
    const realizations = facts["colorPolicy"] === "altered-dominant"
      ? REVIEWED_ALTERED_DOMINANT_VARIANTS.map((variant) =>
          publicRealization(root, outcome.ruleId, variant, ordinaryNaturalNine))
      : (() => {
          const formulaRow = acceptedFormulaForFacts(facts);
          if (formulaRow === null) {
            throw new Error(
              `No reviewed formula row materializes accepted family facts ${stableJson(facts)}.`,
            );
          }
          return [
            publicRealization(
              root,
              outcome.ruleId,
              { ...formulaRow, id: "literal" },
              ordinaryNaturalNine,
            ),
          ];
        })();
    return {
      ok: true,
      value: {
        schema: T1_REVIEWED_PUBLIC_CONTRACT.resolvedChordSchema,
        formulaTableId: T1_REVIEWED_PUBLIC_CONTRACT.formulaTable.id,
        formulaTableVersion: T1_REVIEWED_PUBLIC_CONTRACT.formulaTable.version,
        degreeSpellingPolicyId: T1_REVIEWED_PUBLIC_CONTRACT.degreeSpellingPolicy.id,
        degreeSpellingPolicyVersion: T1_REVIEWED_PUBLIC_CONTRACT.degreeSpellingPolicy.version,
        degreeRolePolicyId: T1_REVIEWED_PUBLIC_CONTRACT.degreeRolePolicy.id,
        degreeRolePolicyVersion: T1_REVIEWED_PUBLIC_CONTRACT.degreeRolePolicy.version,
        source,
        realizations,
        bass: null,
        warnings: [],
      },
    };
  }
  const refusal: JsonObject = {
    code: outcome.outcome,
    path: outcome["path"],
    phase: outcome["phase"],
    ruleId: outcome.ruleId,
  };
  if (outcome.outcome === "theory.sixth_invalid") {
    refusal["received"] = facts["sixth"];
    refusal["reason"] = outcome["reason"];
  } else if (outcome.outcome === "theory.formula_family_unsupported") {
    refusal["triad"] = facts["triad"];
    refusal["seventh"] = facts["seventh"];
    refusal["colorPolicy"] = facts["colorPolicy"];
  } else if (outcome.outcome === "theory.extension_invalid") {
    refusal["received"] = { number: facts["extension"], alter: 0 };
    refusal["reason"] = outcome["reason"];
  } else if (outcome.outcome === "theory.color_policy_invalid") {
    refusal["received"] = facts["colorPolicy"];
    refusal["reason"] = outcome["reason"];
  } else if (outcome.outcome === "theory.modifier_conflict") {
    refusal["conflict"] = outcome["conflict"];
    if (outcome["conflict"] === "sixth-with-seventh") {
      refusal["leftPath"] = ["sixth"];
      refusal["rightPath"] = ["seventh"];
    } else if (outcome["conflict"] === "sixth-with-extension") {
      refusal["leftPath"] = ["sixth"];
      refusal["rightPath"] = ["extensions", 0];
    }
  }
  return { ok: false, refusal };
}

function classifyFamilyState(facts: JsonObject): FamilyStateOutcome {
  const triad = typeof facts["triad"] === "string" ? facts["triad"] : "";
  const sixth = facts["sixth"];
  const seventh = typeof facts["seventh"] === "string" ? facts["seventh"] : null;
  const extension = typeof facts["extension"] === "number" ? facts["extension"] : null;
  const naturalNineAddition = facts["naturalNineAddition"] === true;
  const colorPolicy = typeof facts["colorPolicy"] === "string" ? facts["colorPolicy"] : "";
  const baseRules: Readonly<Record<string, string>> = {
    major: "base-major",
    minor: "base-minor",
    diminished: "base-diminished",
    augmented: "base-augmented",
    sus2: "base-sus2",
    sus4: "base-sus4",
    power: "base-power",
  };
  let attemptedRule = baseRules[triad] ?? "unknown";
  if (sixth !== null) {
    if (triad !== "major" && triad !== "minor") {
      return {
        outcome: "theory.sixth_invalid",
        path: ["sixth"],
        phase: "base",
        ruleId: attemptedRule,
        reason: "family",
      };
    }
    attemptedRule = triad === "major" ? "sixth-major" : "sixth-minor";
    if (colorPolicy === "altered-dominant") {
      return {
        outcome: "theory.color_policy_invalid",
        path: ["colorPolicy"],
        phase: "color-alterations",
        ruleId: "altered-dominant",
        reason: "requires-dominant-seventh",
      };
    }
    if (seventh !== null) {
      return {
        outcome: "theory.modifier_conflict",
        path: ["sixth"],
        phase: "base",
        ruleId: attemptedRule,
        conflict: "sixth-with-seventh",
      };
    }
    if (extension !== null) {
      return {
        outcome: "theory.modifier_conflict",
        path: ["sixth"],
        phase: "base",
        ruleId: attemptedRule,
        conflict: "sixth-with-extension",
      };
    }
    return {
      outcome: "accepted",
      ruleId: attemptedRule,
      formulaFamily: `${triad}-${naturalNineAddition ? "six-nine" : "sixth"}`,
    };
  }

  const seventhRules: Readonly<Record<string, string>> = {
    "major:major": "seventh-major",
    "major:minor": "seventh-dominant",
    "minor:major": "seventh-minor-major",
    "minor:minor": "seventh-minor",
    "diminished:minor": "seventh-half-diminished",
    "diminished:diminished": "seventh-diminished",
    "augmented:major": "seventh-augmented-major",
    "sus2:minor": "extension-suspended-dominant",
    "sus4:minor": "extension-suspended-dominant",
  };
  if (seventh !== null) {
    const selected = seventhRules[`${triad}:${seventh}`];
    if (selected === undefined) {
      return {
        outcome: "theory.formula_family_unsupported",
        path: ["seventh"],
        phase: "base",
        ruleId: attemptedRule,
      };
    }
    attemptedRule = selected;
  }
  if (extension !== null) {
    let selected: string | undefined;
    if (triad === "major" && seventh === "major") selected = "extension-major";
    if (triad === "major" && seventh === "minor") selected = "extension-dominant";
    if (triad === "minor" && seventh === "minor") selected = "extension-minor";
    if (
      (triad === "sus2" || triad === "sus4") &&
      seventh === "minor" &&
      (extension === 9 || extension === 13)
    ) {
      selected = "extension-suspended-dominant";
    }
    if (selected === undefined) {
      return {
        outcome: "theory.extension_invalid",
        path: ["extensions", 0],
        phase: "base",
        ruleId: attemptedRule,
        reason: "family",
      };
    }
    attemptedRule = selected;
  }
  if (colorPolicy === "altered-dominant") {
    if (triad === "major" && seventh === "minor" && extension === null) {
      return {
        outcome: "accepted",
        ruleId: "altered-dominant",
        formulaFamily: "altered-dominant",
      };
    }
    return {
      outcome: "theory.color_policy_invalid",
      path: ["colorPolicy"],
      phase: "color-alterations",
      ruleId: "altered-dominant",
      reason: "requires-dominant-seventh",
    };
  }
  return {
    outcome: "accepted",
    ruleId: attemptedRule,
    formulaFamily: `${triad}:${seventh ?? "none"}:${extension === null ? "none" : String(extension)}`,
  };
}

function incrementRecord(record: Record<string, number>, key: string): void {
  record[key] = (record[key] ?? 0) + 1;
}

function validateFamilyStateMatrix(root: JsonObject, findings: T1ContractFinding[]): void {
  const matrix = isObject(root["familyStateMatrix"])
    ? root["familyStateMatrix"]
    : {};
  const axes = {
    triad: ["major", "minor", "diminished", "augmented", "sus2", "sus4", "power"],
    sixth: [null, { number: 6, alter: 0 }],
    seventh: [null, "major", "minor", "diminished"],
    extension: [null, 9, 11, 13],
    naturalNineAddition: [false, true],
    colorPolicy: ["none", "altered-dominant"],
  } as const;
  requireExact(
    {
      axes: matrix["axes"],
      expansionOrder: matrix["expansionOrder"],
      sourceDefaults: matrix["sourceDefaults"],
    },
    {
      axes,
      expansionOrder: ["triad", "sixth", "seventh", "extension", "naturalNineAddition", "colorPolicy"],
      sourceDefaults: {
        kind: "parsed",
        sourceText: FAMILY_MATRIX_SOURCE_TEXT,
        root: { step: "C", alter: 0 },
        bass: null,
        alterations: [],
        omissions: [],
      },
    },
    "T1_CONTRACT_FAMILY_STATE_MATRIX",
    "formula-rules.json.familyStateMatrix",
    "The strict-family matrix axes, expansion order, or isolated safe defaults changed.",
    findings,
  );
  const outcomeCounts: Record<string, number> = {
    accepted: 0,
    "theory.sixth_invalid": 0,
    "theory.formula_family_unsupported": 0,
    "theory.extension_invalid": 0,
    "theory.color_policy_invalid": 0,
    "theory.modifier_conflict": 0,
  };
  const reasonAndConflictCounts: Record<string, number> = {
    "sixth-family": 0,
    "unsupported-seventh": 0,
    "extension-family": 0,
    "requires-dominant-seventh": 0,
    "sixth-with-seventh": 0,
    "sixth-with-extension": 0,
  };
  const acceptedRuleIdCounts: Record<string, number> = {};
  const refusalRuleIdCounts: Record<string, Record<string, number>> = {};
  const acceptedFamilies = new Set<string>();
  const orderedCellOutcomes: JsonObject[] = [];
  const orderedPublicOutcomes: JsonObject[] = [];
  let totalStates = 0;
  for (const triad of axes.triad) {
    for (const sixth of axes.sixth) {
      for (const seventh of axes.seventh) {
        for (const extension of axes.extension) {
          for (const naturalNineAddition of axes.naturalNineAddition) {
            for (const colorPolicy of axes.colorPolicy) {
              totalStates += 1;
              const facts = {
                triad,
                sixth,
                seventh,
                extension,
                naturalNineAddition,
                colorPolicy,
              };
              const outcome = classifyFamilyState(facts);
              orderedCellOutcomes.push({ facts, expected: outcome });
              orderedPublicOutcomes.push({
                facts,
                expected: publicFamilyStateOutcome(facts, outcome),
              });
              incrementRecord(outcomeCounts, outcome.outcome);
              if (outcome.outcome === "accepted") {
                incrementRecord(acceptedRuleIdCounts, outcome.ruleId);
                if (typeof outcome.formulaFamily === "string") acceptedFamilies.add(outcome.formulaFamily);
              } else {
                const byRule = refusalRuleIdCounts[outcome.outcome] ?? {};
                refusalRuleIdCounts[outcome.outcome] = byRule;
                incrementRecord(byRule, outcome.ruleId);
                if (outcome.outcome === "theory.sixth_invalid") incrementRecord(reasonAndConflictCounts, "sixth-family");
                if (outcome.outcome === "theory.formula_family_unsupported") incrementRecord(reasonAndConflictCounts, "unsupported-seventh");
                if (outcome.outcome === "theory.extension_invalid") incrementRecord(reasonAndConflictCounts, "extension-family");
                if (outcome.outcome === "theory.color_policy_invalid") incrementRecord(reasonAndConflictCounts, "requires-dominant-seventh");
                if (outcome["conflict"] === "sixth-with-seventh") incrementRecord(reasonAndConflictCounts, "sixth-with-seventh");
                if (outcome["conflict"] === "sixth-with-extension") incrementRecord(reasonAndConflictCounts, "sixth-with-extension");
              }
            }
          }
        }
      }
    }
  }
  const orderedCellSemanticSha256 = sha256(stableJson(orderedCellOutcomes));
  const orderedPublicOutcomeSemanticSha256 = sha256(stableJson(orderedPublicOutcomes));
  requireExact(
    matrix["expected"],
    {
      totalStates,
      acceptedStates: outcomeCounts["accepted"],
      distinctAcceptedFormulaFamilies: acceptedFamilies.size,
      distinctAcceptedParsedRuleIds: Object.keys(acceptedRuleIdCounts).length,
      outcomeCounts,
      reasonAndConflictCounts,
      acceptedRuleIdCounts,
      refusalRuleIdCounts,
      orderedCellSemanticSha256,
      orderedPublicOutcomeSemanticSha256,
    },
    "T1_CONTRACT_FAMILY_STATE_MATRIX",
    "formula-rules.json.familyStateMatrix.expected",
    "The exhaustive 896-state accepted/refused partition or attempted-rule distribution changed.",
    findings,
  );
  if (
    !isObject(matrix["expected"]) ||
    matrix["expected"]["orderedCellSemanticSha256"] !== orderedCellSemanticSha256
  ) {
    findings.push({
      code: "T1_CONTRACT_FAMILY_STATE_CELL_DIGEST",
      path: "formula-rules.json.familyStateMatrix.expected.orderedCellSemanticSha256",
      message: `The exact ordered 896-cell outcome digest is ${orderedCellSemanticSha256}.`,
    });
  }
  if (
    !isObject(matrix["expected"]) ||
    matrix["expected"]["orderedPublicOutcomeSemanticSha256"] !== orderedPublicOutcomeSemanticSha256
  ) {
    findings.push({
      code: "T1_CONTRACT_FAMILY_STATE_PUBLIC_OUTCOME",
      path: "formula-rules.json.familyStateMatrix.expected.orderedPublicOutcomeSemanticSha256",
      message: `The exact ordered 896-cell public result/refusal digest is ${orderedPublicOutcomeSemanticSha256}.`,
    });
  }
  const sentinels = objectArray(matrix["sentinels"]) ?? [];
  requireSortedUniqueIds(sentinels, "formula-rules.json.familyStateMatrix.sentinels", findings);
  const sentinelIdentitiesAndFacts = [
    { id: "T1-FAMILY-STATE-SENTINEL-001", facts: { triad: "power", sixth: null, seventh: "minor", extension: 9, naturalNineAddition: false, colorPolicy: "none" } },
    { id: "T1-FAMILY-STATE-SENTINEL-002", facts: { triad: "major", sixth: { number: 6, alter: 0 }, seventh: "diminished", extension: 11, naturalNineAddition: false, colorPolicy: "none" } },
    { id: "T1-FAMILY-STATE-SENTINEL-003", facts: { triad: "major", sixth: { number: 6, alter: 0 }, seventh: "minor", extension: null, naturalNineAddition: false, colorPolicy: "altered-dominant" } },
    { id: "T1-FAMILY-STATE-SENTINEL-004", facts: { triad: "sus2", sixth: null, seventh: "minor", extension: 11, naturalNineAddition: false, colorPolicy: "none" } },
    { id: "T1-FAMILY-STATE-SENTINEL-005", facts: { triad: "major", sixth: null, seventh: "minor", extension: null, naturalNineAddition: true, colorPolicy: "altered-dominant" } },
  ];
  requireExact(
    sentinels.map((record) => ({ id: record["id"], facts: record["facts"] })),
    sentinelIdentitiesAndFacts,
    "T1_CONTRACT_FAMILY_STATE_SENTINEL",
    "formula-rules.json.familyStateMatrix.sentinels",
    "Strict-family sentinels changed.",
    findings,
  );
  sentinels.forEach((record, index) => {
    const facts = isObject(record["facts"]) ? record["facts"] : {};
    const expected = isObject(record["expected"]) ? record["expected"] : {};
    const actual = classifyFamilyState(facts);
    requireExact(
      expected,
      actual,
      "T1_CONTRACT_FAMILY_STATE_SENTINEL",
      `formula-rules.json.familyStateMatrix.sentinels[${String(index)}].expected`,
      "A strict-family overlap sentinel no longer follows the frozen field, color, or conflict precedence.",
      findings,
    );
  });
}

function validateFormulaRules(root: JsonObject, findings: T1ContractFinding[]): void {
  requireExact(
    root["degreeEncoding"],
    "tokens are defined exactly in t1-resolution-contract.json and retain number plus alteration identity",
    "T1_CONTRACT_DEGREE_ENCODING",
    "formula-rules.json.degreeEncoding",
    "Degree encoding must remain spelling-first number-plus-alteration identity, never pitch-class aliases.",
    findings,
  );
  requireExact(root["formulaTableId"], T1_REVIEWED_PUBLIC_CONTRACT.formulaTable.id, "T1_CONTRACT_FORMULA_ID", "formula-rules.json.formulaTableId", "Formula table ID changed.", findings);
  requireExact(root["formulaTableVersion"], T1_REVIEWED_PUBLIC_CONTRACT.formulaTable.version, "T1_CONTRACT_FORMULA_ID", "formula-rules.json.formulaTableVersion", "Formula table version changed.", findings);
  requireExact(root["degreeRolePolicyId"], T1_REVIEWED_PUBLIC_CONTRACT.degreeRolePolicy.id, "T1_CONTRACT_ROLE_POLICY", "formula-rules.json.degreeRolePolicyId", "Degree-role policy ID changed.", findings);
  requireExact(root["degreeRolePolicyVersion"], T1_REVIEWED_PUBLIC_CONTRACT.degreeRolePolicy.version, "T1_CONTRACT_ROLE_POLICY", "formula-rules.json.degreeRolePolicyVersion", "Degree-role policy version changed.", findings);
  requireExact(root["publicRuleAssignments"], REVIEWED_PUBLIC_RULE_ASSIGNMENTS, "T1_CONTRACT_FORMULA_ASSIGNMENT", "formula-rules.json.publicRuleAssignments", "Public formula-rule assignment changed.", findings);
  validateMatchAndBasePhases(root, findings);
  validateFamilyStateMatrix(root, findings);
  const reviewedAlteredDominantMatch = {
    triad: "major",
    sixth: null,
    seventh: "minor",
    extensions: [],
    naturalNineAdditionFamilyMarker: false,
    colorPolicy: "altered-dominant",
  } as const;
  requireExact(
    root["alteredDominantMatchAndBasePhase"],
    {
      match: reviewedAlteredDominantMatch,
      formulaRuleId: "altered-dominant",
      selection: "the exact color-policy family match creates all four base-phase seeds before later explicit modifier phases; sourceText, root, bass, and audition preference are ignored",
      basePhaseByRealizationId: Object.fromEntries(
        REVIEWED_ALTERED_DOMINANT_VARIANTS.map((variant) => [variant.id, {
          degrees: variant.degrees,
          required: variant.required,
          optional: variant.optional,
          guide: variant.guide,
        }]),
      ),
    },
    "T1_CONTRACT_ALT_MATCH",
    "formula-rules.json.alteredDominantMatchAndBasePhase",
    "The exact altered-dominant family match or one of its four base-phase seeds changed.",
    findings,
  );
  const formulaMatches = isObject(root["matchAndBasePhaseByFormulaId"])
    ? Object.values(root["matchAndBasePhaseByFormulaId"])
      .filter(isObject)
      .map((item) => stableJson(item["match"]))
    : [];
  if (formulaMatches.includes(stableJson(reviewedAlteredDominantMatch))) {
    findings.push({
      code: "T1_CONTRACT_ALT_MATCH_DUPLICATE",
      path: "formula-rules.json.alteredDominantMatchAndBasePhase.match",
      message: "Altered-dominant match must remain distinct from all 33 literal family matches.",
    });
  }
  const rules = objectArray(root["rules"]) ?? [];
  requireSortedUniqueIds(rules, "formula-rules.json.rules", findings);
  requireExact(rules.map(coreFormula), REVIEWED_FORMULAS, "T1_CONTRACT_FORMULA_TABLE", "formula-rules.json.rules", "Exact formula degrees or Balanced roles changed.", findings);
  rules.forEach((record, index) => {
    if (record["matrixSeed"] !== true) {
      findings.push({ code: "T1_CONTRACT_MATRIX_SEED", path: `formula-rules.json.rules[${String(index)}].matrixSeed`, message: "Every one of the 33 reviewed formula rows is an all-root matrix seed." });
    }
    validateDegreePartition(record, `formula-rules.json.rules[${String(index)}]`, findings);
  });
  const variants = objectArray(root["alteredDominantVariants"]) ?? [];
  requireSortedUniqueIds(variants, "formula-rules.json.alteredDominantVariants", findings);
  requireExact(
    variants.map((record) => ({
      id: record["id"],
      degrees: record["degrees"],
      required: record["required"],
      optional: record["optional"],
      guide: record["guide"],
    })),
    REVIEWED_ALTERED_DOMINANT_VARIANTS,
    "T1_CONTRACT_ALT_VARIANTS",
    "formula-rules.json.alteredDominantVariants",
    "The four ordered altered-dominant realization sets changed.",
    findings,
  );
  variants.forEach((record, index) => {
    validateDegreePartition(record, `formula-rules.json.alteredDominantVariants[${String(index)}]`, findings);
  });
  const modifiers = objectArray(root["modifierRules"]) ?? [];
  requireSortedUniqueIds(modifiers, "formula-rules.json.modifierRules", findings);
  requireExact(
    modifiers.map((record) => ({
      id: record["id"],
      phase: record["phase"],
      rule: record["rule"],
    })),
    [
      { id: "T1-MODRULE-001", phase: "suspension", rule: "remove every degree numbered 3, then add the declared 2 or 4 as required and guide" },
      { id: "T1-MODRULE-002", phase: "structural-alterations", rule: "b5 or #5 removes natural 5 and adds the explicit alteration as required; refuse only when source alterations explicitly request both b5 and #5. An altered fifth inherited from the base formula is not one half of that source-record conflict and may coexist with the opposite explicit alteration." },
      { id: "T1-MODRULE-003", phase: "color-alterations", rule: "b9, #9, b11, #11, b13, or #13 removes natural same-number closure and adds each requested altered color as required; b9 plus #9 coexists" },
      { id: "T1-MODRULE-004", phase: "additions", rule: "addN adds only N, implies no closure, is required, and does not replace a differently altered degree; add3 may coexist with suspension but is not a guide. The exact natural-9 addition consumed as a 6/9 family marker is skipped here because basePhase already inserted it once as optional; all other additions, including siblings beside that marker, remain required." },
      { id: "T1-MODRULE-005", phase: "omissions", rule: "no3 or no5 removes every same-number degree from every realization and emits theory.omission_absent only when no such degree existed" },
      { id: "T1-MODRULE-006", phase: "canonicalization", rule: "merge exact degree duplicates even when they came from different categories, preserve differently altered same-number degrees, and reject only conflicts declared by the earlier phase rules" },
      { id: "T1-MODRULE-007", phase: "spelling", rule: "spell each retained degree diatonically, refuse an alteration outside -2 through 2, and keep slash bass separate" },
      { id: "T1-MODRULE-008", phase: "color-alterations", rule: "bare altered dominant expands to four ordered stable IDs; accepted later addition, 11/13 color, and omission phases transform each variant without changing or merging IDs" },
    ],
    "T1_CONTRACT_MODIFIER_PHASE",
    "formula-rules.json.modifierRules",
    "Every modifier law must remain bound to its own stable ID and phase.",
    findings,
  );
  const ruleText = modifiers
    .map((record) => typeof record["rule"] === "string" ? record["rule"] : "")
    .join("\n");
  const requiredLawFragments = [
    "remove every degree numbered 3",
    "source alterations explicitly request both b5 and #5",
    "b9 plus #9 coexists",
    "add3 may coexist with suspension",
    "emits theory.omission_absent",
    "merge exact degree duplicates",
    "keep slash bass separate",
    "four ordered stable IDs",
  ];
  for (const fragment of requiredLawFragments) {
    if (!ruleText.includes(fragment)) {
      findings.push({ code: "T1_CONTRACT_MODIFIER_LAW", path: "formula-rules.json.modifierRules", message: `Missing reviewed modifier law fragment ${JSON.stringify(fragment)}.` });
    }
  }
}

const STEP_ORDER = ["C", "D", "E", "F", "G", "A", "B"] as const;
const NATURAL_PITCH_CLASSES: Readonly<Record<string, number>> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

const PUBLIC_DEGREE_BASES = [
  { number: 1, diatonicSteps: 0, naturalSemitones: 0 },
  { number: 2, diatonicSteps: 1, naturalSemitones: 2 },
  { number: 3, diatonicSteps: 2, naturalSemitones: 4 },
  { number: 4, diatonicSteps: 3, naturalSemitones: 5 },
  { number: 5, diatonicSteps: 4, naturalSemitones: 7 },
  { number: 6, diatonicSteps: 5, naturalSemitones: 9 },
  { number: 7, diatonicSteps: 6, naturalSemitones: 11 },
  { number: 9, diatonicSteps: 8, naturalSemitones: 14 },
  { number: 11, diatonicSteps: 10, naturalSemitones: 17 },
  { number: 13, diatonicSteps: 12, naturalSemitones: 21 },
] as const;
const PUBLIC_DEGREE_ALTERATIONS = [-2, -1, 0, 1, 2] as const;

type PublicDegreeDefinition = Readonly<{
  number: number;
  alter: number;
  directedSemitones: number;
  diatonicSteps: number;
}>;

type IndependentSpelling = Readonly<{
  step: string;
  alter: number;
  pitchClass: number;
}>;

function degreeDefinition(degree: JsonObject): PublicDegreeDefinition | null {
  const number = degree["number"];
  const alter = degree["alter"];
  const base = PUBLIC_DEGREE_BASES.find((item) => item.number === number);
  return base === undefined || !PUBLIC_DEGREE_ALTERATIONS.includes(alter as (typeof PUBLIC_DEGREE_ALTERATIONS)[number])
    ? null
    : {
        number: base.number,
        alter: alter as number,
        directedSemitones: base.naturalSemitones + (alter as number),
        diatonicSteps: base.diatonicSteps,
      };
}

function independentSpelling(root: JsonObject, degree: JsonObject): IndependentSpelling | null {
  const step = root["step"];
  const rootAlter = root["alter"];
  const definition = degreeDefinition(degree);
  if (typeof step !== "string" || typeof rootAlter !== "number" || definition === null) return null;
  const rootStepIndex = STEP_ORDER.indexOf(step as (typeof STEP_ORDER)[number]);
  const rootNatural = NATURAL_PITCH_CLASSES[step];
  if (rootStepIndex < 0 || rootNatural === undefined) return null;
  const directedTargetIndex = rootStepIndex + definition.diatonicSteps;
  const targetStep = STEP_ORDER[directedTargetIndex % STEP_ORDER.length];
  if (targetStep === undefined) return null;
  const targetNaturalPitchClass = NATURAL_PITCH_CLASSES[targetStep];
  if (targetNaturalPitchClass === undefined) return null;
  const targetNaturalAbsolute = targetNaturalPitchClass + 12 * Math.floor(directedTargetIndex / STEP_ORDER.length);
  const targetAbsolute = rootNatural + rootAlter + definition.directedSemitones;
  const requiredAlteration = targetAbsolute - targetNaturalAbsolute;
  return {
    step: targetStep,
    alter: requiredAlteration,
    pitchClass: ((targetAbsolute % 12) + 12) % 12,
  };
}

function rootProjection(record: JsonObject): JsonObject {
  const spelled = isObject(record["spelled"]) ? record["spelled"] : {};
  return {
    id: record["id"],
    symbol: record["symbol"],
    step: spelled["step"],
    alter: spelled["alter"],
    pitchClass: record["pitchClass"],
  };
}

function validateAllRootCases(
  root: JsonObject,
  findings: T1ContractFinding[],
): Readonly<{ cells: number; degreeSpellings: number }> {
  const roots = objectArray(root["roots"]) ?? [];
  const seeds = objectArray(root["familySeeds"]) ?? [];
  requireSortedUniqueIds(roots, "all-root-cases.json.roots", findings);
  requireSortedUniqueIds(seeds, "all-root-cases.json.familySeeds", findings);
  requireExact(roots.map(rootProjection), REVIEWED_ROOTS, "T1_CONTRACT_ROOTS", "all-root-cases.json.roots", "The exact reviewed all-root spelling inventory changed.", findings);
  requireExact(
    seeds.map((seed) => ({
      id: seed["id"],
      bucket: seed["bucket"],
      formulaId: seed["formulaId"],
      familyId: seed["familyId"],
    })),
    REVIEWED_FORMULAS.map((item, index) => ({
      id: `T1-SEED-${String(index + 1).padStart(3, "0")}`,
      bucket: item.bucket,
      formulaId: item.id,
      familyId: item.familyId,
    })),
    "T1_CONTRACT_FAMILY_SEEDS",
    "all-root-cases.json.familySeeds",
    "The exact 33-family seed inventory changed.",
    findings,
  );
  const matrix = isObject(root["matrixCase"]) ? root["matrixCase"] : {};
  requireExact(
    {
      id: matrix["id"],
      construction: matrix["construction"],
      rootCount: matrix["rootCount"],
      familySeedCount: matrix["familySeedCount"],
      expectedCellCount: matrix["expectedCellCount"],
      excludedCells: matrix["excludedCells"],
      cellIdTemplate: matrix["cellIdTemplate"],
      expectedResult: matrix["expectedResult"],
    },
    {
      id: "T1-ROOT-MATRIX-001",
      construction: "roots x familySeeds",
      rootCount: 12,
      familySeedCount: 33,
      expectedCellCount: 396,
      excludedCells: [],
      cellIdTemplate: "{rootCaseId}::{formulaId}",
      expectedResult: "every cell resolves successfully to one literal realization whose degrees and roles equal the referenced independently authored formula row",
    },
    "T1_CONTRACT_MATRIX",
    "all-root-cases.json.matrixCase",
    "All-root corpus must be the complete 12 by 33 Cartesian product with no exclusions.",
    findings,
  );
  const oracle = isObject(root["independentOracle"]) ? root["independentOracle"] : {};
  requireExact(
    {
      stepOrder: oracle["stepOrder"],
      naturalPitchClasses: oracle["naturalPitchClasses"],
      degreeDefinitionsSource: oracle["degreeDefinitionsSource"],
      directedSpellingRule: oracle["directedSpellingRule"],
      accidentalRule: oracle["accidentalRule"],
      pitchClassRule: oracle["pitchClassRule"],
      roleRule: oracle["roleRule"],
    },
    {
      stepOrder: STEP_ORDER,
      naturalPitchClasses: NATURAL_PITCH_CLASSES,
      degreeDefinitionsSource: "t1-resolution-contract.json degreeTokenVocabulary",
      directedSpellingRule: "assign the root natural letter an absolute semitone, add root alteration and the degree directedSemitones, advance the target letter by diatonicSteps in the corresponding directed octave, and subtract that target natural absolute semitone to obtain requiredAlteration exactly",
      accidentalRule: "accept the directed requiredAlteration only when it is in -2..2; never choose an enharmonic accidental from a pitch class modulo 12, and otherwise expect theory.spelling_accidental_out_of_range",
      pitchClassRule: "only after directed spelling succeeds, project the directed target absolute semitone by Euclidean modulo 12",
      roleRule: "copy the exact referenced formula row required/optional/guide sets without importing production",
    },
    "T1_CONTRACT_SPELLING_ORACLE",
    "all-root-cases.json.independentOracle",
    "The independent all-root spelling and role oracle changed.",
    findings,
  );

  let cells = 0;
  let degreeSpellings = 0;
  for (const reviewedRoot of roots) {
    const spelled = isObject(reviewedRoot["spelled"]) ? reviewedRoot["spelled"] : {};
    for (const formulaRow of REVIEWED_FORMULAS) {
      cells += 1;
      for (const token of formulaRow.degrees) {
        degreeSpellings += 1;
        const definition = REVIEWED_DEGREE_TOKENS.find((item) => item.token === token);
        const result = definition === undefined
          ? null
          : independentSpelling(spelled, { number: definition.number, alter: definition.alter });
        if (result === null || result.alter < T1_REVIEWED_LIMITS.minimumSupportedAlteration || result.alter > T1_REVIEWED_LIMITS.maximumSupportedAlteration) {
          findings.push({
            code: "T1_CONTRACT_MATRIX_SPELLING",
            path: `all-root-cases.json:${String(reviewedRoot["id"])}::${formulaRow.id}:${token}`,
            message: "A declared all-root matrix cell cannot be spelled inside the reviewed accidental range.",
          });
        }
      }
    }
  }
  if (cells !== 396) {
    findings.push({ code: "T1_CONTRACT_MATRIX", path: "all-root-cases.json", message: `Computed ${String(cells)} cells instead of 396.` });
  }
  if (degreeSpellings !== 1_824) {
    findings.push({ code: "T1_CONTRACT_MATRIX_SPELLING", path: "all-root-cases.json", message: `Computed ${String(degreeSpellings)} directed degree spellings instead of 1824.` });
  }
  return { cells, degreeSpellings };
}

function validateSpellingCases(root: JsonObject, findings: T1ContractFinding[]): number {
  requireExact(root["policyId"], T1_REVIEWED_PUBLIC_CONTRACT.degreeSpellingPolicy.id, "T1_CONTRACT_SPELLING_POLICY", "spelling-cases.json.policyId", "Spelling policy ID changed.", findings);
  requireExact(root["policyVersion"], T1_REVIEWED_PUBLIC_CONTRACT.degreeSpellingPolicy.version, "T1_CONTRACT_SPELLING_POLICY", "spelling-cases.json.policyVersion", "Spelling policy version changed.", findings);
  const publicMatrix = isObject(root["publicDegreeMatrix"])
    ? root["publicDegreeMatrix"]
    : {};
  requireExact(
    {
      rootSteps: publicMatrix["rootSteps"],
      rootAlterations: publicMatrix["rootAlterations"],
      degreeNumbers: publicMatrix["degreeNumbers"],
      degreeAlterations: publicMatrix["degreeAlterations"],
      construction: publicMatrix["construction"],
    },
    {
      rootSteps: STEP_ORDER,
      rootAlterations: PUBLIC_DEGREE_ALTERATIONS,
      degreeNumbers: PUBLIC_DEGREE_BASES.map((item) => item.number),
      degreeAlterations: PUBLIC_DEGREE_ALTERATIONS,
      construction: "complete 35-root by 50-degree Cartesian product; no exclusions",
    },
    "T1_CONTRACT_PUBLIC_DEGREE_MATRIX",
    "spelling-cases.json.publicDegreeMatrix",
    "The standalone spelling matrix must exhaust every domain-valid written root and ChordDegree pair.",
    findings,
  );
  let totalCells = 0;
  let successCells = 0;
  let refusalCells = 0;
  let minimumRequiredAlteration = Number.POSITIVE_INFINITY;
  let maximumRequiredAlteration = Number.NEGATIVE_INFINITY;
  const orderedCellOutcomes: JsonObject[] = [];
  const byDegreeNumber = PUBLIC_DEGREE_BASES.map((base) => ({
    number: base.number,
    successCells: 0,
    refusalCells: 0,
  }));
  for (const step of STEP_ORDER) {
    for (const rootAlter of PUBLIC_DEGREE_ALTERATIONS) {
      const writtenRoot = { step, alter: rootAlter };
      for (const base of PUBLIC_DEGREE_BASES) {
        const bucket = byDegreeNumber.find((item) => item.number === base.number);
        for (const degreeAlter of PUBLIC_DEGREE_ALTERATIONS) {
          totalCells += 1;
          const spelling = independentSpelling(writtenRoot, {
            number: base.number,
            alter: degreeAlter,
          });
          if (spelling === null || bucket === undefined) {
            findings.push({
              code: "T1_CONTRACT_PUBLIC_DEGREE_MATRIX",
              path: `spelling-cases.json.publicDegreeMatrix:${step}${String(rootAlter)}:${String(base.number)}:${String(degreeAlter)}`,
              message: "A domain-valid standalone spelling cell was not defined by the independent oracle.",
            });
            continue;
          }
          minimumRequiredAlteration = Math.min(minimumRequiredAlteration, spelling.alter);
          maximumRequiredAlteration = Math.max(maximumRequiredAlteration, spelling.alter);
          const degree = { number: base.number, alter: degreeAlter };
          if (
            spelling.alter >= T1_REVIEWED_LIMITS.minimumSupportedAlteration &&
            spelling.alter <= T1_REVIEWED_LIMITS.maximumSupportedAlteration
          ) {
            successCells += 1;
            bucket.successCells += 1;
            orderedCellOutcomes.push({
              input: { root: writtenRoot, degree },
              expected: {
                ok: true,
                value: {
                  policyId: T1_REVIEWED_PUBLIC_CONTRACT.degreeSpellingPolicy.id,
                  policyVersion: T1_REVIEWED_PUBLIC_CONTRACT.degreeSpellingPolicy.version,
                  root: writtenRoot,
                  degree,
                  spelled: { step: spelling.step, alter: spelling.alter },
                  pitchClass: spelling.pitchClass,
                },
              },
            });
          } else {
            refusalCells += 1;
            bucket.refusalCells += 1;
            orderedCellOutcomes.push({
              input: { root: writtenRoot, degree },
              expected: {
                ok: false,
                refusal: {
                  code: "theory.spelling_accidental_out_of_range",
                  path: ["degree"],
                  phase: "spelling",
                  degreeSpellingPolicyId: T1_REVIEWED_PUBLIC_CONTRACT.degreeSpellingPolicy.id,
                  degreeSpellingPolicyVersion: T1_REVIEWED_PUBLIC_CONTRACT.degreeSpellingPolicy.version,
                  root: writtenRoot,
                  degree,
                  requiredAlteration: spelling.alter,
                  minimum: T1_REVIEWED_LIMITS.minimumSupportedAlteration,
                  maximum: T1_REVIEWED_LIMITS.maximumSupportedAlteration,
                },
              },
            });
          }
        }
      }
    }
  }
  const orderedCellSemanticSha256 = sha256(stableJson(orderedCellOutcomes));
  requireExact(
    publicMatrix["expected"],
    {
      totalCells,
      successCells,
      refusalCells,
      minimumRequiredAlteration,
      maximumRequiredAlteration,
      byDegreeNumber,
      successRule: "return the exact directed letter, required alteration, and pitch-class projection when required alteration is within -2 through 2",
      refusalRule: "otherwise return theory.spelling_accidental_out_of_range at path degree with the exact required alteration and reviewed policy bounds",
      orderedCellSemanticSha256,
    },
    "T1_CONTRACT_PUBLIC_DEGREE_MATRIX",
    "spelling-cases.json.publicDegreeMatrix.expected",
    "The exhaustive standalone spelling success/refusal partition changed.",
    findings,
  );
  if (
    !isObject(publicMatrix["expected"]) ||
    publicMatrix["expected"]["orderedCellSemanticSha256"] !== orderedCellSemanticSha256
  ) {
    findings.push({
      code: "T1_CONTRACT_PUBLIC_DEGREE_CELL_DIGEST",
      path: "spelling-cases.json.publicDegreeMatrix.expected.orderedCellSemanticSha256",
      message: `The exact ordered 1,750-cell result digest is ${orderedCellSemanticSha256}.`,
    });
  }
  const cases = objectArray(root["cases"]) ?? [];
  requireSortedUniqueIds(cases, "spelling-cases.json.cases", findings);
  requireExact(
    cases.map((record) => ({
      id: record["id"],
      description: record["description"],
      root: record["root"],
      degree: record["degree"],
    })),
    [
      { id: "T1-SPELL-001", description: "Db dominant seventh keeps degree-seven spelling", root: { step: "D", alter: -1 }, degree: { number: 7, alter: -1 } },
      { id: "T1-SPELL-002", description: "F-sharp major seventh is E-sharp", root: { step: "F", alter: 1 }, degree: { number: 7, alter: 0 } },
      { id: "T1-SPELL-003", description: "C sharp ninth is D-sharp rather than E-flat", root: { step: "C", alter: 0 }, degree: { number: 9, alter: 1 } },
      { id: "T1-SPELL-004", description: "C flat third is E-flat rather than D-sharp", root: { step: "C", alter: 0 }, degree: { number: 3, alter: -1 } },
      { id: "T1-SPELL-005", description: "Gb major third is Bb", root: { step: "G", alter: -1 }, degree: { number: 3, alter: 0 } },
      { id: "T1-SPELL-006", description: "corrected Ab diminished seventh uses letter G", root: { step: "A", alter: -1 }, degree: { number: 7, alter: -2 } },
      { id: "T1-SPELL-007", description: "control proving Fb is the diminished seventh of G", root: { step: "G", alter: 0 }, degree: { number: 7, alter: -2 } },
      { id: "T1-SPELL-008", description: "C diminished seventh retains bb7 rather than degree six", root: { step: "C", alter: 0 }, degree: { number: 7, alter: -2 } },
      { id: "T1-SPELL-009", description: "B-sharp major third reaches the supported double-sharp boundary", root: { step: "B", alter: 1 }, degree: { number: 3, alter: 0 } },
      { id: "T1-SPELL-010", description: "C-flat diminished fifth reaches the supported double-flat boundary", root: { step: "C", alter: -1 }, degree: { number: 5, alter: -1 } },
      { id: "T1-SPELL-011", description: "C-double-sharp sharp ninth would require D triple-sharp", root: { step: "C", alter: 2 }, degree: { number: 9, alter: 1 } },
      { id: "T1-SPELL-012", description: "C-double-flat flat ninth would require D triple-flat", root: { step: "C", alter: -2 }, degree: { number: 9, alter: -1 } },
      { id: "T1-SPELL-013", description: "Ab sharp eleventh may spell as natural D", root: { step: "A", alter: -1 }, degree: { number: 11, alter: 1 } },
      { id: "T1-SPELL-014", description: "Db flat thirteenth reaches B-double-flat", root: { step: "D", alter: -1 }, degree: { number: 13, alter: -1 } },
      { id: "T1-SPELL-015", description: "E sharp-thirteenth degree reaches C-double-sharp", root: { step: "E", alter: 0 }, degree: { number: 13, alter: 1 } },
      { id: "T1-SPELL-016", description: "F-sharp flat eleventh uses Bb and retains degree eleven identity", root: { step: "F", alter: 1 }, degree: { number: 11, alter: -1 } },
    ],
    "T1_CONTRACT_SPELLING_CASE_IDENTITY",
    "spelling-cases.json.cases",
    "Stable spelling-golden IDs must retain their reviewed inputs and claims.",
    findings,
  );
  cases.forEach((record, index) => {
    const path = `spelling-cases.json.cases[${String(index)}]`;
    const sourceRoot = isObject(record["root"]) ? record["root"] : null;
    const degree = isObject(record["degree"]) ? record["degree"] : null;
    const expected = isObject(record["expected"]) ? record["expected"] : null;
    const oracle = sourceRoot && degree ? independentSpelling(sourceRoot, degree) : null;
    if (oracle === null || expected === null) {
      findings.push({ code: "T1_CONTRACT_SPELLING_CASE", path, message: "Spelling case requires a reviewed root, degree, and expected object." });
      return;
    }
    const inRange = oracle.alter >= T1_REVIEWED_LIMITS.minimumSupportedAlteration && oracle.alter <= T1_REVIEWED_LIMITS.maximumSupportedAlteration;
    if (inRange) {
      requireExact(
        Object.keys(expected).sort(codeUnitCompare),
        [
          "ok",
          "spelled",
          "pitchClass",
          ...(["rejectedEnharmonic", "rejectedPlanTypo", "rejectedDegreeAlias", "correctionId"] as const)
            .filter((key) => Object.hasOwn(expected, key)),
        ].sort(codeUnitCompare),
        "T1_CONTRACT_SPELLING_BRANCH_SHAPE",
        `${path}.expected`,
        "A successful spelling case may contain only success fields and reviewed annotations.",
        findings,
      );
      const spelled = isObject(expected["spelled"]) ? expected["spelled"] : {};
      requireExact(
        Object.keys(spelled).sort(codeUnitCompare),
        ["alter", "step"],
        "T1_CONTRACT_SPELLING_BRANCH_SHAPE",
        `${path}.expected.spelled`,
        "A successful spelling may contain only its exact written step and alteration.",
        findings,
      );
      requireExact(
        { ok: expected["ok"], step: spelled["step"], alter: spelled["alter"], pitchClass: expected["pitchClass"] },
        { ok: true, step: oracle.step, alter: oracle.alter, pitchClass: oracle.pitchClass },
        "T1_CONTRACT_SPELLING_GOLDEN",
        `${path}.expected`,
        "Spelling golden disagrees with the independent directed diatonic oracle.",
        findings,
      );
    } else {
      requireExact(
        Object.keys(expected).sort(codeUnitCompare),
        ["ok", "refusal"],
        "T1_CONTRACT_SPELLING_BRANCH_SHAPE",
        `${path}.expected`,
        "A refused spelling case may contain only the refusal branch.",
        findings,
      );
      const refusal = isObject(expected["refusal"]) ? expected["refusal"] : {};
      requireExact(
        Object.keys(refusal).sort(codeUnitCompare),
        [
          "code",
          "path",
          "phase",
          "degreeSpellingPolicyId",
          "degreeSpellingPolicyVersion",
          "root",
          "degree",
          "requiredAlteration",
          "minimum",
          "maximum",
        ].sort(codeUnitCompare),
        "T1_CONTRACT_SPELLING_BRANCH_SHAPE",
        `${path}.expected.refusal`,
        "A spelling refusal may contain only its complete reviewed payload.",
        findings,
      );
      requireExact(
        {
          ok: expected["ok"],
          code: refusal["code"],
          path: refusal["path"],
          phase: refusal["phase"],
          degreeSpellingPolicyId: refusal["degreeSpellingPolicyId"],
          degreeSpellingPolicyVersion: refusal["degreeSpellingPolicyVersion"],
          root: refusal["root"],
          degree: refusal["degree"],
          requiredAlteration: refusal["requiredAlteration"],
          minimum: refusal["minimum"],
          maximum: refusal["maximum"],
        },
        {
          ok: false,
          code: "theory.spelling_accidental_out_of_range",
          path: ["degree"],
          phase: "spelling",
          degreeSpellingPolicyId: T1_REVIEWED_PUBLIC_CONTRACT.degreeSpellingPolicy.id,
          degreeSpellingPolicyVersion: T1_REVIEWED_PUBLIC_CONTRACT.degreeSpellingPolicy.version,
          root: sourceRoot,
          degree,
          requiredAlteration: oracle.alter,
          minimum: T1_REVIEWED_LIMITS.minimumSupportedAlteration,
          maximum: T1_REVIEWED_LIMITS.maximumSupportedAlteration,
        },
        "T1_CONTRACT_SPELLING_REFUSAL",
        `${path}.expected`,
        "Out-of-range spelling golden must refuse with the exact directed alteration and reviewed policy identity.",
        findings,
      );
    }
  });
  requireExact(
    cases.map((record) => {
      const expected = isObject(record["expected"]) ? record["expected"] : {};
      return {
        id: record["id"],
        rejectedEnharmonic: expected["rejectedEnharmonic"] ?? null,
        rejectedPlanTypo: expected["rejectedPlanTypo"] ?? null,
        rejectedDegreeAlias: expected["rejectedDegreeAlias"] ?? null,
        correctionId: expected["correctionId"] ?? null,
      };
    }),
    [
      { id: "T1-SPELL-001", rejectedEnharmonic: { step: "B", alter: 0 }, rejectedPlanTypo: null, rejectedDegreeAlias: null, correctionId: null },
      { id: "T1-SPELL-002", rejectedEnharmonic: { step: "F", alter: 0 }, rejectedPlanTypo: null, rejectedDegreeAlias: null, correctionId: null },
      { id: "T1-SPELL-003", rejectedEnharmonic: { step: "E", alter: -1 }, rejectedPlanTypo: null, rejectedDegreeAlias: null, correctionId: null },
      { id: "T1-SPELL-004", rejectedEnharmonic: { step: "D", alter: 1 }, rejectedPlanTypo: null, rejectedDegreeAlias: null, correctionId: null },
      { id: "T1-SPELL-005", rejectedEnharmonic: { step: "A", alter: 1 }, rejectedPlanTypo: null, rejectedDegreeAlias: null, correctionId: null },
      { id: "T1-SPELL-006", rejectedEnharmonic: null, rejectedPlanTypo: { step: "F", alter: -1 }, rejectedDegreeAlias: null, correctionId: "T1-CORRECTION-ABDIM7" },
      { id: "T1-SPELL-007", rejectedEnharmonic: null, rejectedPlanTypo: null, rejectedDegreeAlias: null, correctionId: "T1-CORRECTION-ABDIM7" },
      { id: "T1-SPELL-008", rejectedEnharmonic: null, rejectedPlanTypo: null, rejectedDegreeAlias: { number: 6, alter: 0 }, correctionId: null },
      ...Array.from({ length: 8 }, (_, index) => ({
        id: `T1-SPELL-${String(index + 9).padStart(3, "0")}`,
        rejectedEnharmonic: null,
        rejectedPlanTypo: null,
        rejectedDegreeAlias: null,
        correctionId: null,
      })),
    ],
    "T1_CONTRACT_SPELLING_SHORTCUT",
    "spelling-cases.json.cases",
    "Rejected enharmonic, degree-alias, and corrected-plan annotations must preserve the reviewed forbidden shortcuts exactly.",
    findings,
  );
  return totalCells;
}

function linkedObject(
  record: unknown,
  path: string,
  findings: T1ContractFinding[],
): LinkedCase[] {
  if (!isObject(record)) {
    findings.push({ code: "T1_CONTRACT_CASE_SHAPE", path, message: "Linked singleton case must be an object." });
    return [];
  }
  const id = idOf(record);
  const traceIds = requireUniqueStringRefs(record["traceIds"], `${path}.traceIds`, findings);
  const authorityIds = requireUniqueStringRefs(record["authorityIds"], `${path}.authorityIds`, findings);
  if (id === null) {
    findings.push({ code: "T1_CONTRACT_ID_SHAPE", path: `${path}.id`, message: "Linked singleton requires a nonempty string ID." });
    return [];
  }
  return [{ id, path, traceIds, authorityIds, record }];
}

function validateAuthorityPolicy(
  authorities: readonly JsonObject[],
  findings: T1ContractFinding[],
): void {
  authorities.forEach((record, index) => {
    const path = `provenance-ledger.json.authorities[${String(index)}]`;
    const authorityClass = record["authorityClass"];
    const sourceRefs = stringArray(record["sourceRefs"]);
    if (typeof authorityClass !== "string" || !ALLOWED_AUTHORITY_CLASSES.has(authorityClass)) {
      findings.push({
        code: "T1_CONTRACT_AUTHORITY_CLASS",
        path: `${path}.authorityClass`,
        message: "Authority class must be definition, published-reference, expert-reviewed, or compatibility.",
      });
    }
    if (
      typeof record["sourceKind"] !== "string" ||
      typeof record["reviewState"] !== "string" ||
      sourceRefs === null || sourceRefs.length === 0 ||
      typeof record["covers"] !== "string" || record["covers"].trim().length === 0
    ) {
      findings.push({
        code: "T1_CONTRACT_AUTHORITY_METADATA",
        path,
        message: "Every authority requires source kind, review state, source references, and a nonempty coverage statement.",
      });
    }
    if (authorityClass === "published-reference") {
      const citation = isObject(record["publishedReference"]) ? record["publishedReference"] : null;
      if (
        citation === null ||
        typeof citation["title"] !== "string" || citation["title"].trim().length === 0 ||
        typeof citation["edition"] !== "string" || citation["edition"].trim().length === 0 ||
        typeof citation["page"] !== "string" || citation["page"].trim().length === 0
      ) {
        findings.push({
          code: "T1_CONTRACT_PUBLISHED_AUTHORITY",
          path: `${path}.publishedReference`,
          message: "Published-reference authority requires a named title, edition, and page.",
        });
      }
    }
    if (authorityClass === "expert-reviewed") {
      const review = isObject(record["expertReview"]) ? record["expertReview"] : null;
      if (
        review === null ||
        typeof review["reviewDate"] !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(review["reviewDate"]) ||
        typeof review["reviewerQualification"] !== "string" || review["reviewerQualification"].trim().length === 0
      ) {
        findings.push({
          code: "T1_CONTRACT_EXPERT_AUTHORITY",
          path: `${path}.expertReview`,
          message: "Expert-reviewed authority requires an ISO date and nonempty reviewer qualification.",
        });
      }
    }
  });
}

function validateLedgerPolicies(
  traceRoot: JsonObject | undefined,
  provenanceRoot: JsonObject | undefined,
  traces: readonly JsonObject[],
  authorities: readonly JsonObject[],
  findings: T1ContractFinding[],
): void {
  requireExact(
    {
      stableTraceIdsOnly: traceRoot?.["stableTraceIdsOnly"],
      caseLinkPolicy: traceRoot?.["caseLinkPolicy"],
      traces: traces.map((record) => ({
        id: record["id"],
        requirement: record["requirement"],
        sourceRefs: record["sourceRefs"],
      })),
    },
    {
      stableTraceIdsOnly: true,
      caseLinkPolicy: "caseIds and mutationControlIds are sorted unique literal IDs. Every id-bearing case/control cites this trace reciprocally; no glob, prefix, or production-derived link is accepted.",
      traces: [
        { id: "T1-TRACE-ALT-VARIANTS", requirement: "bare 7alt exposes four ordered stable variants and later accepted modifiers preserve every ID", sourceRefs: ["docs/REBUILD_PLAN.md section 10.3", "active T1 specification"] },
        { id: "T1-TRACE-CUSTOM", requirement: "custom resolution preserves ordered duplicate spellings and projections with null degree roles, exact limitations, and the inherited 16-pitch boundary", sourceRefs: ["docs/REBUILD_PLAN.md sections 9.4, 9.6, and 10.3"] },
        { id: "T1-TRACE-FORMULA-MATRIX", requirement: "every declared literal formula family resolves over the complete 33 by 12 Cartesian matrix with exact degrees and roles", sourceRefs: ["docs/REBUILD_PLAN.md sections 10.3 and 10.6"] },
        { id: "T1-TRACE-INDEPENDENCE", requirement: "fixtures and expected values are independent of production resolution and spelling output", sourceRefs: ["AGENTS.md Verification discipline", "docs/REBUILD_PLAN.md section 10.7"] },
        { id: "T1-TRACE-LAWS", requirement: "positive, near-miss, transposition/root-variation, and reviewed mutation witnesses prove every named T1 law", sourceRefs: ["docs/REBUILD_PLAN.md sections 10.5, 10.7, and 19.1"] },
        { id: "T1-TRACE-LEGACY-L-THEORY-01", requirement: "major seventh, extension closure, and diminished seventh regressions are frozen under L-THEORY-01", sourceRefs: ["docs/REBUILD_PLAN.md section 19.3 row L-THEORY-01", "docs/LEGACY_AUDIT.md"] },
        { id: "T1-TRACE-LIMITS", requirement: "all input, output, spelling, custom, work, and memory limits have exact inclusive boundaries and first-excess behavior", sourceRefs: ["active bead jcpe-milestone-foundation-vc2.5.1", "src/theory/resolution-contract.ts"] },
        { id: "T1-TRACE-MODIFIER-ORDER", requirement: "the eight frozen phases implement replacement, coexistence, additions, omissions, and cross-category exact duplicate merging deterministically", sourceRefs: ["docs/REBUILD_PLAN.md section 10.3"] },
        { id: "T1-TRACE-OPERATION-STATE", requirement: "T1 operations are pure synchronous bounded all-or-nothing values; cancellation and stale revision applicability is explicit", sourceRefs: ["active bead jcpe-milestone-foundation-vc2.5.1"] },
        { id: "T1-TRACE-ROLE-POLICY", requirement: "Balanced required, optional, and guide roles follow the reviewed root, identity, seventh, closure, explicit modifier, suspension, and add3 policy", sourceRefs: ["docs/REBUILD_PLAN.md section 10.3", "active T1 role clarification"] },
        { id: "T1-TRACE-SLASH-SEPARATION", requirement: "parsed and custom slash bass remains exact and separate from formula membership, roles, and pitch tuples", sourceRefs: ["docs/REBUILD_PLAN.md sections 9.4 and 10.3"] },
        { id: "T1-TRACE-SPELLING", requirement: "directed diatonic spelling precedes pitch-class projection, retains degree identity, and refuses required accidentals outside -2..2", sourceRefs: ["docs/REBUILD_PLAN.md sections 9.2-9.3 and 10.4"] },
        { id: "T1-TRACE-STRICT-REFUSAL", requirement: "unsupported families, invalid fields, conflicts, color policy, output limits, and spelling faults return exact source-owned typed refusals without repair or partial output", sourceRefs: ["docs/REBUILD_PLAN.md sections 10.3-10.4", "active T1 specification"] },
      ],
    },
    "T1_CONTRACT_TRACE_POLICY",
    "trace-ledger.json",
    "Stable trace identities, obligations, sources, or reciprocal-link policy changed.",
    findings,
  );
  requireExact(
    {
      authoringStatement: provenanceRoot?.["authoringStatement"],
      independenceRules: provenanceRoot?.["independenceRules"],
      allowedAuthorityClasses: provenanceRoot?.["allowedAuthorityClasses"],
      authorities: authorities.map((record) => ({
        id: record["id"],
        authorityClass: record["authorityClass"],
        sourceKind: record["sourceKind"],
        reviewState: record["reviewState"],
        sourceRefs: record["sourceRefs"],
        covers: record["covers"],
      })),
    },
    {
      authoringStatement: "Every formula, role, spelling, pitch-class projection, refusal, warning, limit, and mutation expectation in the T1 corpus was independently transcribed or derived from the reviewed project definitions before the T1 production resolver existed. No production resolver, spelling service, or generated production table was used as an oracle.",
      independenceRules: [
        "Fixture validators may decode JSON and implement an independent oracle, but may not import production resolution tables, resolver operations, or spelling helpers.",
        "Expected degree tokens retain number and alteration identity; enharmonic pitch-class equality never rewrites #9 as b3 or bb7 as 6.",
        "The corrected 396-cell family matrix is the complete Cartesian product declared in all-root-cases.json; neither production output nor a production-derived exclusion list may select cells. The earlier 384-cell planning count omitted declared major-eleventh and is retained only as a documented superseded count.",
        "Judgment-bearing authority may be claimed only when an actual published reference or dated expert review is recorded. This initial ledger makes no such claim.",
      ],
      allowedAuthorityClasses: ["definition", "published-reference", "expert-reviewed", "compatibility"],
      authorities: [
        { id: "T1-AUTH-DOMAIN", authorityClass: "definition", sourceKind: "reviewed-project-policy", reviewState: "reviewed-project-contract", sourceRefs: ["docs/F1_DOMAIN_CONTRACT.md", "src/domain/chord.ts", "src/domain/pitch.ts"], covers: "spelling-first chord values, degree identity, custom pitch order and duplicates, slash bass, and the 16-pitch custom limit" },
        { id: "T1-AUTH-FORMULA", authorityClass: "definition", sourceKind: "reviewed-project-policy", reviewState: "reviewed-project-contract", sourceRefs: ["docs/REBUILD_PLAN.md section 10.3", "active bead jcpe-milestone-foundation-vc2.5.1"], covers: "formula families, extension closure, modifier phases, altered-dominant variants, strict refusal, and slash-bass separation" },
        { id: "T1-AUTH-INDEPENDENCE", authorityClass: "definition", sourceKind: "verification-policy", reviewState: "reviewed-project-contract", sourceRefs: ["AGENTS.md Verification discipline", "docs/REBUILD_PLAN.md sections 10.6-10.7 and 19.1"], covers: "independent goldens, reciprocal traceability, positive and near-miss laws, reviewed mutation controls, and production-oracle prohibition" },
        { id: "T1-AUTH-LEGACY", authorityClass: "compatibility", sourceKind: "compatibility-regression", reviewState: "reviewed-compatibility-decision", sourceRefs: ["docs/LEGACY_AUDIT.md Music-theory failures", "docs/REBUILD_PLAN.md sections 19.2 and 19.3 row L-THEORY-01"], covers: "major-seventh, 9, 13, diminished-seventh, alteration, unknown-formula, and stale-note regression expectations" },
        { id: "T1-AUTH-ROLES", authorityClass: "definition", sourceKind: "reviewed-project-policy", reviewState: "reviewed-project-contract", sourceRefs: ["docs/REBUILD_PLAN.md section 10.3", "active T1 specification role-policy clarification"], covers: "Balanced required, optional, and guide-tone roles including identity tones, sixths, closure, additions, alterations, and suspensions" },
        { id: "T1-AUTH-SPELLING", authorityClass: "definition", sourceKind: "reviewed-project-policy", reviewState: "reviewed-project-contract", sourceRefs: ["docs/REBUILD_PLAN.md sections 9.2-9.3 and 10.4"], covers: "diatonic-degree spelling, pitch-class projection, accidental range -2 through 2, and typed triple-accidental refusal" },
      ],
    },
    "T1_CONTRACT_AUTHORITY_POLICY",
    "provenance-ledger.json",
    "Authority identities, classes, sources, coverage, or independence policy changed.",
    findings,
  );
}

function validateTraceAuthorityLinks(
  cases: readonly LinkedCase[],
  traces: readonly JsonObject[],
  authorities: readonly JsonObject[],
  controls: readonly JsonObject[],
  findings: T1ContractFinding[],
): void {
  const caseById = new Map<string, LinkedCase>();
  for (const record of cases) {
    const prior = caseById.get(record.id);
    if (prior !== undefined) {
      findings.push({
        code: "T1_CONTRACT_ID_DUPLICATE",
        path: record.path,
        message: `Linked case ID ${JSON.stringify(record.id)} duplicates ${prior.path}.`,
      });
    } else {
      caseById.set(record.id, record);
    }
  }
  const traceById = new Map<string, JsonObject>();
  traces.forEach((record) => {
    const id = idOf(record);
    if (id !== null) traceById.set(id, record);
  });
  const authorityById = new Map<string, JsonObject>();
  authorities.forEach((record) => {
    const id = idOf(record);
    if (id !== null) authorityById.set(id, record);
  });
  const controlById = new Map<string, JsonObject>();
  controls.forEach((record) => {
    const id = idOf(record);
    if (id !== null) controlById.set(id, record);
  });

  for (const fixtureCase of cases) {
    for (const traceId of fixtureCase.traceIds) {
      const trace = traceById.get(traceId);
      const reciprocal = trace ? stringArray(trace["caseIds"]) : null;
      if (trace === undefined) {
        findings.push({ code: "T1_CONTRACT_TRACE_REFERENCE", path: `${fixtureCase.path}.traceIds`, message: `Unknown trace ID ${JSON.stringify(traceId)}.` });
      } else if (reciprocal === null || !reciprocal.includes(fixtureCase.id)) {
        findings.push({ code: "T1_CONTRACT_TRACE_RECIPROCAL", path: `${fixtureCase.path}.traceIds`, message: `Trace ${JSON.stringify(traceId)} does not link back to ${JSON.stringify(fixtureCase.id)}.` });
      }
    }
    for (const authorityId of fixtureCase.authorityIds) {
      const authority = authorityById.get(authorityId);
      const reciprocal = authority ? stringArray(authority["caseIds"]) : null;
      if (authority === undefined) {
        findings.push({ code: "T1_CONTRACT_AUTHORITY_REFERENCE", path: `${fixtureCase.path}.authorityIds`, message: `Unknown authority ID ${JSON.stringify(authorityId)}.` });
      } else if (reciprocal === null || !reciprocal.includes(fixtureCase.id)) {
        findings.push({ code: "T1_CONTRACT_AUTHORITY_RECIPROCAL", path: `${fixtureCase.path}.authorityIds`, message: `Authority ${JSON.stringify(authorityId)} does not link back to ${JSON.stringify(fixtureCase.id)}.` });
      }
    }
  }

  controls.forEach((control, index) => {
    const path = `mutation-controls.json.controls[${String(index)}]`;
    const controlId = idOf(control);
    const traceIds = requireUniqueStringRefs(control["traceIds"], `${path}.traceIds`, findings);
    const authorityIds = requireUniqueStringRefs(control["authorityIds"], `${path}.authorityIds`, findings);
    for (const traceId of traceIds) {
      const trace = traceById.get(traceId);
      const reciprocal = trace ? stringArray(trace["mutationControlIds"]) : null;
      if (trace === undefined) {
        findings.push({ code: "T1_CONTRACT_TRACE_REFERENCE", path: `${path}.traceIds`, message: `Unknown trace ID ${JSON.stringify(traceId)}.` });
      } else if (controlId === null || reciprocal === null || !reciprocal.includes(controlId)) {
        findings.push({ code: "T1_CONTRACT_TRACE_RECIPROCAL", path: `${path}.traceIds`, message: `Trace ${JSON.stringify(traceId)} does not link back to mutation control ${JSON.stringify(controlId)}.` });
      }
    }
    for (const authorityId of authorityIds) {
      const authority = authorityById.get(authorityId);
      const reciprocal = authority ? stringArray(authority["mutationControlIds"]) : null;
      if (authority === undefined) {
        findings.push({ code: "T1_CONTRACT_AUTHORITY_REFERENCE", path: `${path}.authorityIds`, message: `Unknown authority ID ${JSON.stringify(authorityId)}.` });
      } else if (controlId === null || reciprocal === null || !reciprocal.includes(controlId)) {
        findings.push({ code: "T1_CONTRACT_AUTHORITY_RECIPROCAL", path: `${path}.authorityIds`, message: `Authority ${JSON.stringify(authorityId)} does not link back to mutation control ${JSON.stringify(controlId)}.` });
      }
    }
  });

  traces.forEach((trace, index) => {
    const path = `trace-ledger.json.traces[${String(index)}]`;
    const traceId = idOf(trace);
    const caseIds = requireUniqueStringRefs(trace["caseIds"], `${path}.caseIds`, findings);
    const mutationControlIds = requireUniqueStringRefs(trace["mutationControlIds"], `${path}.mutationControlIds`, findings, false);
    if (!sameJson(caseIds, [...caseIds].sort(codeUnitCompare)) || !sameJson(mutationControlIds, [...mutationControlIds].sort(codeUnitCompare))) {
      findings.push({ code: "T1_CONTRACT_REFERENCE_ORDER", path, message: "Trace case and mutation-control references must be sorted." });
    }
    for (const caseId of caseIds) {
      const fixtureCase = caseById.get(caseId);
      if (fixtureCase === undefined || traceId === null || !fixtureCase.traceIds.includes(traceId)) {
        findings.push({ code: "T1_CONTRACT_TRACE_RECIPROCAL", path: `${path}.caseIds`, message: `Case ${JSON.stringify(caseId)} is missing or does not link back to this trace.` });
      }
    }
    for (const controlId of mutationControlIds) {
      const control = controlById.get(controlId);
      const reciprocal = control ? stringArray(control["traceIds"]) : null;
      if (control === undefined) {
        findings.push({ code: "T1_CONTRACT_MUTATION_REFERENCE", path: `${path}.mutationControlIds`, message: `Unknown mutation control ${JSON.stringify(controlId)}.` });
      } else if (traceId === null || reciprocal === null || !reciprocal.includes(traceId)) {
        findings.push({ code: "T1_CONTRACT_TRACE_RECIPROCAL", path: `${path}.mutationControlIds`, message: `Mutation control ${JSON.stringify(controlId)} does not link back to trace ${JSON.stringify(traceId)}.` });
      }
    }
  });

  authorities.forEach((authority, index) => {
    const path = `provenance-ledger.json.authorities[${String(index)}]`;
    const authorityId = idOf(authority);
    const caseIds = requireUniqueStringRefs(authority["caseIds"], `${path}.caseIds`, findings);
    const mutationControlIds = requireUniqueStringRefs(authority["mutationControlIds"], `${path}.mutationControlIds`, findings, false);
    if (!sameJson(caseIds, [...caseIds].sort(codeUnitCompare)) || !sameJson(mutationControlIds, [...mutationControlIds].sort(codeUnitCompare))) {
      findings.push({ code: "T1_CONTRACT_REFERENCE_ORDER", path, message: "Authority case and mutation-control references must be sorted." });
    }
    for (const caseId of caseIds) {
      const fixtureCase = caseById.get(caseId);
      if (fixtureCase === undefined || authorityId === null || !fixtureCase.authorityIds.includes(authorityId)) {
        findings.push({ code: "T1_CONTRACT_AUTHORITY_RECIPROCAL", path: `${path}.caseIds`, message: `Case ${JSON.stringify(caseId)} is missing or does not link back to this authority.` });
      }
    }
    for (const controlId of mutationControlIds) {
      const control = controlById.get(controlId);
      const reciprocal = control ? stringArray(control["authorityIds"]) : null;
      if (control === undefined) {
        findings.push({ code: "T1_CONTRACT_MUTATION_REFERENCE", path: `${path}.mutationControlIds`, message: `Unknown mutation control ${JSON.stringify(controlId)}.` });
      } else if (authorityId === null || reciprocal === null || !reciprocal.includes(authorityId)) {
        findings.push({ code: "T1_CONTRACT_AUTHORITY_RECIPROCAL", path: `${path}.mutationControlIds`, message: `Mutation control ${JSON.stringify(controlId)} does not link back to authority ${JSON.stringify(authorityId)}.` });
      }
    }
  });
}

function validateReviewedLiteralSpelling(
  spellingRoot: JsonObject,
  expected: JsonObject,
  path: string,
  findings: T1ContractFinding[],
): void {
  const tokens = stringArray(expected["degrees"]);
  const spelledPitchNames = objectArray(expected["spelledPitchNames"]);
  const pitchClasses = Array.isArray(expected["pitchClasses"])
    ? expected["pitchClasses"]
    : null;
  if (tokens === null || spelledPitchNames === null || pitchClasses === null) {
    findings.push({
      code: "T1_CONTRACT_LITERAL_SPELLING_TABLE",
      path,
      message: "A reviewed literal realization requires aligned degree, spelling, and projection arrays.",
    });
    return;
  }
  const independentlySpelled = tokens.map((token) => {
    const definition = REVIEWED_DEGREE_TOKENS.find((item) => item.token === token);
    return definition === undefined
      ? null
      : independentSpelling(spellingRoot, {
          number: definition.number,
          alter: definition.alter,
        });
  });
  requireExact(
    spelledPitchNames,
    independentlySpelled.map((item) => item === null
      ? null
      : { step: item.step, alter: item.alter }),
    "T1_CONTRACT_LITERAL_SPELLING_TABLE",
    `${path}.spelledPitchNames`,
    "Reviewed literal spellings must follow the independent directed oracle in degree order.",
    findings,
  );
  requireExact(
    pitchClasses,
    independentlySpelled.map((item) => item?.pitchClass ?? null),
    "T1_CONTRACT_LITERAL_SPELLING_TABLE",
    `${path}.pitchClasses`,
    "Reviewed literal projections must align positionally with directed spellings.",
    findings,
  );
}

function independentlySpellReviewedTokens(
  spellingRoot: JsonObject,
  tokens: readonly string[],
): JsonObject {
  const spellings = tokens.map((token) => {
    const definition = REVIEWED_DEGREE_TOKENS.find((item) => item.token === token);
    return definition === undefined
      ? null
      : independentSpelling(spellingRoot, { number: definition.number, alter: definition.alter });
  });
  return {
    spelledPitchNames: spellings.map((spelling) => spelling === null ? null : { step: spelling.step, alter: spelling.alter }),
    pitchClasses: spellings.map((spelling) => spelling?.pitchClass ?? null),
  };
}

const degreeRecord = (number: number, alter: number): JsonObject => ({ number, alter });

const literalRecipeRefusal = (
  id: string,
  inputAstRecipe: JsonObject,
  refusal: JsonObject,
  expectedTail: JsonObject = {},
): JsonObject => ({
  id,
  inputAstRecipe,
  expected: { ok: false, refusal, ...expectedTail },
});

/**
 * Independently reviewed AST recipes and their complete public refusals.  This
 * is intentionally executable validator data rather than a projection of the
 * fixture rows: changing a recipe must therefore also change the derived code,
 * path, attempted rule, source payload, and conflict provenance or it fails.
 */
const REVIEWED_LITERAL_RECIPE_REFUSALS = deepFreeze([
  literalRecipeRefusal(
    "T1-LIT-060",
    { base: "Cm(maj7)", extensions: [degreeRecord(9, 0)] },
    { code: "theory.extension_invalid", path: ["extensions", 0], phase: "base", ruleId: "seventh-minor-major", received: degreeRecord(9, 0), reason: "family" },
  ),
  literalRecipeRefusal(
    "T1-LIT-061",
    { base: "Cdim", seventh: "diminished", extensions: [degreeRecord(9, 0)] },
    { code: "theory.extension_invalid", path: ["extensions", 0], phase: "base", ruleId: "seventh-diminished", received: degreeRecord(9, 0), reason: "family" },
  ),
  literalRecipeRefusal(
    "T1-LIT-062",
    { base: "C", additions: [degreeRecord(7, 0)] },
    { code: "theory.addition_invalid", path: ["additions", 0], phase: "additions", ruleId: "base-major", received: degreeRecord(7, 0), reason: "number" },
  ),
  literalRecipeRefusal(
    "T1-LIT-063",
    { base: "C7", alterations: [degreeRecord(3, -1)] },
    { code: "theory.alteration_invalid", path: ["alterations", 0], phase: "structural-alterations", ruleId: "seventh-dominant", received: degreeRecord(3, -1), reason: "number" },
  ),
  literalRecipeRefusal(
    "T1-LIT-064",
    { base: "C7", omissions: [7] },
    { code: "theory.omission_invalid", path: ["omissions", 0], phase: "omissions", ruleId: "seventh-dominant", received: 7, reason: "number" },
  ),
  literalRecipeRefusal(
    "T1-LIT-065",
    { base: "C7", alterations: [degreeRecord(5, -1), degreeRecord(5, 1)] },
    { code: "theory.modifier_conflict", path: ["alterations", 0], phase: "structural-alterations", ruleId: "seventh-dominant", conflict: "structural-alteration-pair", leftPath: ["alterations", 0], rightPath: ["alterations", 1] },
  ),
  literalRecipeRefusal(
    "T1-LIT-066",
    { base: "C", colorPolicy: "altered-dominant" },
    { code: "theory.color_policy_invalid", path: ["colorPolicy"], phase: "color-alterations", ruleId: "altered-dominant", received: "altered-dominant", reason: "requires-dominant-seventh" },
  ),
  literalRecipeRefusal(
    "T1-LIT-067",
    { base: "C7alt", alterations: [degreeRecord(9, -1)] },
    { code: "theory.color_policy_invalid", path: ["colorPolicy"], phase: "color-alterations", ruleId: "altered-dominant", received: "altered-dominant", reason: "explicit-five-or-nine-alteration" },
  ),
  literalRecipeRefusal(
    "T1-LIT-068",
    { base: "C6", seventh: "minor" },
    { code: "theory.modifier_conflict", path: ["sixth"], phase: "base", ruleId: "sixth-major", conflict: "sixth-with-seventh", leftPath: ["sixth"], rightPath: ["seventh"] },
  ),
  literalRecipeRefusal(
    "T1-LIT-069",
    { base: "C6", extensions: [degreeRecord(9, 0)] },
    { code: "theory.modifier_conflict", path: ["sixth"], phase: "base", ruleId: "sixth-major", conflict: "sixth-with-extension", leftPath: ["sixth"], rightPath: ["extensions", 0] },
  ),
  literalRecipeRefusal(
    "T1-LIT-070",
    { base: "Cdim", sixth: degreeRecord(6, 0) },
    { code: "theory.sixth_invalid", path: ["sixth"], phase: "base", ruleId: "base-diminished", received: degreeRecord(6, 0), reason: "family" },
  ),
  literalRecipeRefusal(
    "T1-LIT-071",
    { base: "C5", seventh: "minor" },
    { code: "theory.formula_family_unsupported", path: ["seventh"], phase: "base", ruleId: "base-power", triad: "power", seventh: "minor", colorPolicy: "none" },
  ),
  literalRecipeRefusal(
    "T1-LIT-072",
    { base: "C", sixth: degreeRecord(6, -1) },
    { code: "theory.sixth_invalid", path: ["sixth"], phase: "base", ruleId: "base-major", received: degreeRecord(6, -1), reason: "alteration" },
  ),
  literalRecipeRefusal(
    "T1-LIT-073",
    { base: "C7", extensions: [degreeRecord(7, 0)] },
    { code: "theory.extension_invalid", path: ["extensions", 0], phase: "base", ruleId: "seventh-dominant", received: degreeRecord(7, 0), reason: "number" },
  ),
  literalRecipeRefusal(
    "T1-LIT-074",
    { base: "C7", extensions: [degreeRecord(9, 1)] },
    { code: "theory.extension_invalid", path: ["extensions", 0], phase: "base", ruleId: "seventh-dominant", received: degreeRecord(9, 1), reason: "alteration" },
  ),
  literalRecipeRefusal(
    "T1-LIT-075",
    { base: "C", additions: [degreeRecord(9, 1)] },
    { code: "theory.addition_invalid", path: ["additions", 0], phase: "additions", ruleId: "base-major", received: degreeRecord(9, 1), reason: "alteration" },
  ),
  literalRecipeRefusal(
    "T1-LIT-076",
    { base: "C7", alterations: [degreeRecord(9, -2)] },
    { code: "theory.alteration_invalid", path: ["alterations", 0], phase: "color-alterations", ruleId: "seventh-dominant", received: degreeRecord(9, -2), reason: "alteration" },
  ),
  literalRecipeRefusal(
    "T1-LIT-077",
    { base: "C", additions: [degreeRecord(3, 0)], omissions: [3] },
    { code: "theory.modifier_conflict", path: ["additions", 0], phase: "additions", ruleId: "base-major", conflict: "addition-omission", leftPath: ["additions", 0], rightPath: ["omissions", 0] },
  ),
  literalRecipeRefusal(
    "T1-LIT-078",
    { base: "C7", alterations: [degreeRecord(5, -1)], omissions: [5] },
    { code: "theory.modifier_conflict", path: ["alterations", 0], phase: "structural-alterations", ruleId: "seventh-dominant", conflict: "alteration-omission", leftPath: ["alterations", 0], rightPath: ["omissions", 0] },
  ),
  literalRecipeRefusal(
    "T1-LIT-080",
    {
      base: "Cdim",
      additions: [2, 3, 4, 6, 9, 11, 13].map((number) => degreeRecord(number, 0)),
      alterations: [degreeRecord(5, 1), degreeRecord(9, -1), degreeRecord(9, 1), degreeRecord(11, -1), degreeRecord(11, 1), degreeRecord(13, -1), degreeRecord(13, 1)],
    },
    { code: "limit.theory_realization_degrees_exceeded", path: [], phase: "canonicalization", ruleId: "base-diminished", received: 17, maximum: 16 },
    { partialOutput: false },
  ),
]);

function validateLiteralCases(root: JsonObject, findings: T1ContractFinding[]): void {
  requireExact(
    root["inputPolicy"],
    "sourceSymbol is parsed by the already-proven T0 grammar only to construct input; expected values come exclusively from these fixtures and never from production resolution",
    "T1_CONTRACT_LITERAL_INPUT_POLICY",
    "literal-cases.json.inputPolicy",
    "Literal source parsing may construct inputs only; it cannot author or repair expected theory outcomes.",
    findings,
  );
  requireExact(
    root["expectedMetadata"],
    {
      schema: T1_REVIEWED_PUBLIC_CONTRACT.resolvedChordSchema,
      formulaTableId: T1_REVIEWED_PUBLIC_CONTRACT.formulaTable.id,
      formulaTableVersion: T1_REVIEWED_PUBLIC_CONTRACT.formulaTable.version,
      degreeSpellingPolicyId: T1_REVIEWED_PUBLIC_CONTRACT.degreeSpellingPolicy.id,
      degreeSpellingPolicyVersion: T1_REVIEWED_PUBLIC_CONTRACT.degreeSpellingPolicy.version,
      degreeRolePolicyId: T1_REVIEWED_PUBLIC_CONTRACT.degreeRolePolicy.id,
      degreeRolePolicyVersion: T1_REVIEWED_PUBLIC_CONTRACT.degreeRolePolicy.version,
    },
    "T1_CONTRACT_EXPECTED_METADATA",
    "literal-cases.json.expectedMetadata",
    "Literal expected-result metadata changed.",
    findings,
  );
  const cases = objectArray(root["cases"]) ?? [];
  requireSortedUniqueIds(cases, "literal-cases.json.cases", findings);
  const reviewedRecipeIds = new Set(REVIEWED_LITERAL_RECIPE_REFUSALS.map((record) => String(record["id"])));
  requireExact(
    cases
      .filter((record) => reviewedRecipeIds.has(String(record["id"])))
      .map((record) => ({ id: record["id"], inputAstRecipe: record["inputAstRecipe"] })),
    REVIEWED_LITERAL_RECIPE_REFUSALS.map((record) => ({
      id: record["id"],
      inputAstRecipe: record["inputAstRecipe"],
    })),
    "T1_CONTRACT_LITERAL_RECIPE",
    "literal-cases.json.cases:T1-LIT-060..080",
    "Reviewed AST recipes must preserve every source field consumed by the independent refusal oracle.",
    findings,
  );
  requireExact(
    cases
      .filter((record) => reviewedRecipeIds.has(String(record["id"])))
      .map((record) => ({ id: record["id"], expected: record["expected"] })),
    REVIEWED_LITERAL_RECIPE_REFUSALS.map((record) => ({
      id: record["id"],
      expected: record["expected"],
    })),
    "T1_CONTRACT_LITERAL_REFUSAL_PAYLOAD",
    "literal-cases.json.cases:T1-LIT-060..080",
    "Every reviewed recipe must return its complete code-specific, source-owned, all-or-nothing refusal payload.",
    findings,
  );
  const matrixSeeds = cases.slice(0, REVIEWED_FORMULAS.length).map((record) => {
    const expected = isObject(record["expected"]) ? record["expected"] : {};
    return {
      id: record["id"],
      sourceSymbol: record["sourceSymbol"],
      formulaId: expected["formulaId"],
      formulaRuleId: expected["formulaRuleId"],
      realizationIds: expected["realizationIds"],
    };
  });
  requireExact(
    matrixSeeds,
    REVIEWED_FORMULAS.map((item, index) => ({
      id: `T1-LIT-${String(index + 1).padStart(3, "0")}`,
      sourceSymbol: item.symbolTemplate.replace("{root}", "C"),
      formulaId: item.id,
      formulaRuleId: REVIEWED_PUBLIC_RULE_ASSIGNMENTS[item.familyId as keyof typeof REVIEWED_PUBLIC_RULE_ASSIGNMENTS],
      realizationIds: ["literal"],
    })),
    "T1_CONTRACT_LITERAL_FORMULA_SEEDS",
    "literal-cases.json.cases[0..32]",
    "Literal corpus must directly witness every one of the 33 formula families.",
    findings,
  );
  const literalRealizationIds = ["literal"] as const;
  const alteredRealizationIds = [...REVIEWED_ALTERED_DOMINANT_IDS];
  requireExact(
    cases.slice(33, 59).map((record) => ({
      id: record["id"],
      sourceSymbol: record["sourceSymbol"],
      expected: record["expected"],
    })),
    [
      {
        id: "T1-LIT-034",
        sourceSymbol: "C7b5",
        expected: { formulaRuleId: "seventh-dominant", realizationIds: literalRealizationIds, degrees: ["1", "3", "b5", "b7"], required: ["1", "3", "b5", "b7"], optional: [], guide: ["3", "b7"] },
      },
      {
        id: "T1-LIT-035",
        sourceSymbol: "C7#5",
        expected: { formulaRuleId: "seventh-dominant", realizationIds: literalRealizationIds, degrees: ["1", "3", "#5", "b7"], required: ["1", "3", "#5", "b7"], optional: [], guide: ["3", "b7"] },
      },
      {
        id: "T1-LIT-036",
        sourceSymbol: "C7b9",
        expected: { formulaRuleId: "seventh-dominant", realizationIds: literalRealizationIds, degrees: ["1", "3", "5", "b7", "b9"], required: ["1", "3", "b7", "b9"], optional: ["5"], guide: ["3", "b7"] },
      },
      {
        id: "T1-LIT-037",
        sourceSymbol: "C7#9",
        expected: { formulaRuleId: "seventh-dominant", realizationIds: literalRealizationIds, degrees: ["1", "3", "5", "b7", "#9"], required: ["1", "3", "b7", "#9"], optional: ["5"], guide: ["3", "b7"] },
      },
      {
        id: "T1-LIT-038",
        sourceSymbol: "C7b11",
        expected: { formulaRuleId: "seventh-dominant", realizationIds: literalRealizationIds, degrees: ["1", "3", "5", "b7", "b11"], required: ["1", "3", "b7", "b11"], optional: ["5"], guide: ["3", "b7"] },
      },
      {
        id: "T1-LIT-039",
        sourceSymbol: "C7#11",
        expected: { formulaRuleId: "seventh-dominant", realizationIds: literalRealizationIds, degrees: ["1", "3", "5", "b7", "#11"], required: ["1", "3", "b7", "#11"], optional: ["5"], guide: ["3", "b7"] },
      },
      {
        id: "T1-LIT-040",
        sourceSymbol: "C7b13",
        expected: { formulaRuleId: "seventh-dominant", realizationIds: literalRealizationIds, degrees: ["1", "3", "5", "b7", "b13"], required: ["1", "3", "b7", "b13"], optional: ["5"], guide: ["3", "b7"] },
      },
      {
        id: "T1-LIT-041",
        sourceSymbol: "C7#13",
        expected: { formulaRuleId: "seventh-dominant", realizationIds: literalRealizationIds, degrees: ["1", "3", "5", "b7", "#13"], required: ["1", "3", "b7", "#13"], optional: ["5"], guide: ["3", "b7"] },
      },
      {
        id: "T1-LIT-042",
        sourceSymbol: "C7(b9,#9)",
        expected: { formulaRuleId: "seventh-dominant", realizationIds: literalRealizationIds, degrees: ["1", "3", "5", "b7", "b9", "#9"], required: ["1", "3", "b7", "b9", "#9"], optional: ["5"], guide: ["3", "b7"] },
      },
      {
        id: "T1-LIT-043",
        sourceSymbol: "C7(#9,#11)",
        expected: { formulaRuleId: "seventh-dominant", realizationIds: literalRealizationIds, degrees: ["1", "3", "5", "b7", "#9", "#11"], required: ["1", "3", "b7", "#9", "#11"], optional: ["5"], guide: ["3", "b7"] },
      },
      {
        id: "T1-LIT-044",
        sourceSymbol: "C13(b9,#11)",
        expected: { formulaRuleId: "extension-dominant", realizationIds: literalRealizationIds, degrees: ["1", "3", "5", "b7", "b9", "#11", "13"], required: ["1", "3", "b7", "b9", "#11", "13"], optional: ["5"], guide: ["3", "b7"] },
      },
      {
        id: "T1-LIT-045",
        sourceSymbol: "C7alt",
        expected: { formulaRuleId: "altered-dominant", realizationIds: alteredRealizationIds, variantExpectationsRef: "formula-rules.json alteredDominantVariants", naturalFiveOrNinePresent: false },
      },
      {
        id: "T1-LIT-046",
        sourceSymbol: "C7b9sus4",
        expected: { formulaRuleId: "extension-suspended-dominant", realizationIds: literalRealizationIds, degrees: ["1", "4", "5", "b7", "b9"], required: ["1", "4", "b7", "b9"], optional: ["5"], guide: ["4", "b7"] },
      },
      {
        id: "T1-LIT-047",
        sourceSymbol: "Cmaj7(#11)/G",
        expected: {
          root: { step: "C", alter: 0 },
          formulaRuleId: "seventh-major",
          realizationIds: literalRealizationIds,
          degrees: ["1", "3", "5", "7", "#11"],
          required: ["1", "3", "7", "#11"],
          optional: ["5"],
          guide: ["3", "7"],
          spelledPitchNames: [{ step: "C", alter: 0 }, { step: "E", alter: 0 }, { step: "G", alter: 0 }, { step: "B", alter: 0 }, { step: "F", alter: 1 }],
          pitchClasses: [0, 4, 7, 11, 6],
          bass: { step: "G", alter: 0 },
          bassExcludedFromMembership: true,
        },
      },
      {
        id: "T1-LIT-048",
        sourceSymbol: "Db7/Cb",
        expected: { formulaId: "T1-FORMULA-013", formulaRuleId: "seventh-dominant", realizationIds: literalRealizationIds, bass: { step: "C", alter: -1 }, bassExcludedFromMembership: true, degreeSevenSpelling: { step: "C", alter: -1 } },
      },
      {
        id: "T1-LIT-049",
        sourceSymbol: "F#m7b5/C",
        expected: { formulaId: "T1-FORMULA-016", formulaRuleId: "seventh-half-diminished", realizationIds: literalRealizationIds, bass: { step: "C", alter: 0 }, bassExcludedFromMembership: true },
      },
      {
        id: "T1-LIT-050",
        sourceSymbol: "Cadd9",
        expected: { formulaRuleId: "base-major", realizationIds: literalRealizationIds, degrees: ["1", "3", "5", "9"], required: ["1", "3", "9"], optional: ["5"], guide: ["3"] },
      },
      {
        id: "T1-LIT-051",
        sourceSymbol: "Cm(add9)",
        expected: { formulaRuleId: "base-minor", realizationIds: literalRealizationIds, degrees: ["1", "b3", "5", "9"], required: ["1", "b3", "9"], optional: ["5"], guide: ["b3"] },
      },
      {
        id: "T1-LIT-052",
        sourceSymbol: "C7(no5)",
        expected: { formulaRuleId: "seventh-dominant", realizationIds: literalRealizationIds, degrees: ["1", "3", "b7"], required: ["1", "3", "b7"], optional: [], guide: ["3", "b7"], warnings: [] },
      },
      {
        id: "T1-LIT-053",
        sourceSymbol: "Csus4(add3)",
        expected: { formulaRuleId: "base-sus4", realizationIds: literalRealizationIds, degrees: ["1", "3", "4", "5"], required: ["1", "3", "4"], optional: ["5"], guide: ["4"], genericAdd3IsGuide: false },
      },
      {
        id: "T1-LIT-054",
        sourceSymbol: "C7add9b9",
        expected: { formulaRuleId: "seventh-dominant", realizationIds: literalRealizationIds, degrees: ["1", "3", "5", "b7", "b9", "9"], required: ["1", "3", "b7", "b9", "9"], optional: ["5"], guide: ["3", "b7"], coexistence: "color b9 is applied before later natural add9" },
      },
      {
        id: "T1-LIT-055",
        sourceSymbol: "Csus4(no3)",
        expected: { formulaRuleId: "base-sus4", realizationIds: literalRealizationIds, degrees: ["1", "4", "5"], required: ["1", "4"], optional: ["5"], guide: ["4"], warnings: [{ code: "theory.omission_absent", path: ["omissions", 0], degreeNumber: 3 }] },
      },
      {
        id: "T1-LIT-056",
        sourceSymbol: "C7alt(no5)",
        expected: {
          formulaRuleId: "altered-dominant",
          realizationIds: alteredRealizationIds,
          degreesById: {
            "alt-b9-b5": ["1", "3", "b7", "b9"],
            "alt-b9-sharp5": ["1", "3", "b7", "b9"],
            "alt-sharp9-b5": ["1", "3", "b7", "#9"],
            "alt-sharp9-sharp5": ["1", "3", "b7", "#9"],
          },
          stableIdsEvenWhenDegreeSetsCoincide: true,
        },
      },
      {
        id: "T1-LIT-057",
        sourceSymbol: "C7alt(add11)",
        expected: { formulaRuleId: "altered-dominant", realizationIds: alteredRealizationIds, everyVariantAddsRequired: "11", variantIdsUnchanged: true },
      },
      {
        id: "T1-LIT-058",
        sourceSymbol: "C7alt(#11,b13)",
        expected: { formulaRuleId: "altered-dominant", realizationIds: alteredRealizationIds, everyVariantAddsRequired: ["#11", "b13"], variantIdsUnchanged: true },
      },
      {
        id: "T1-LIT-059",
        sourceSymbol: "C6/9(no3)",
        expected: { formulaRuleId: "sixth-major", realizationIds: literalRealizationIds, degrees: ["1", "5", "6", "9"], required: ["1", "6"], optional: ["5", "9"], guide: [], warnings: [] },
      },
    ],
    "T1_CONTRACT_LITERAL_MODIFIER_CASES",
    "literal-cases.json.cases[33..58]",
    "Modifier, altered-dominant, role, spelling, warning, and slash-bass literal expectations changed or were assigned to the wrong source symbol.",
    findings,
  );
  const requiredSymbols = [
    "C7b5", "C7#5", "C7b9", "C7#9", "C7b11", "C7#11", "C7b13", "C7#13",
    "C7(b9,#9)", "C7(#9,#11)", "C13(b9,#11)", "C7alt", "C7b9sus4",
    "Cmaj7(#11)/G", "Db7/Cb", "F#m7b5/C", "Cadd9", "Cm(add9)", "C7(no5)",
    "Csus4(add3)", "C7add9b9", "Csus4(no3)", "C7alt(no5)", "C7alt(add11)",
    "C7alt(#11,b13)", "C6/9(no3)",
  ];
  const symbols = cases
    .map((record) => record["sourceSymbol"])
    .filter((value): value is string => typeof value === "string");
  for (const symbol of requiredSymbols) {
    if (!symbols.includes(symbol)) {
      findings.push({ code: "T1_CONTRACT_LITERAL_REQUIRED", path: "literal-cases.json.cases", message: `Missing required literal symbol ${JSON.stringify(symbol)}.` });
    }
  }
  const refusalById = (id: string): JsonObject => {
    const record = cases.find((candidate) => idOf(candidate) === id);
    const expected = record && isObject(record["expected"]) ? record["expected"] : {};
    return isObject(expected["refusal"]) ? expected["refusal"] : {};
  };
  const sixthSeventh = refusalById("T1-LIT-068");
  const sixthExtension = refusalById("T1-LIT-069");
  const sixthFamily = refusalById("T1-LIT-070");
  requireExact(
    { code: sixthSeventh["code"], ruleId: sixthSeventh["ruleId"], conflict: sixthSeventh["conflict"] },
    { code: "theory.modifier_conflict", ruleId: "sixth-major", conflict: "sixth-with-seventh" },
    "T1_CONTRACT_SIXTH_CASE_SPLIT",
    "literal-cases.json:T1-LIT-068",
    "Sixth plus seventh must reach the declared modifier conflict.",
    findings,
  );
  requireExact(
    { code: sixthExtension["code"], ruleId: sixthExtension["ruleId"], conflict: sixthExtension["conflict"] },
    { code: "theory.modifier_conflict", ruleId: "sixth-major", conflict: "sixth-with-extension" },
    "T1_CONTRACT_SIXTH_CASE_SPLIT",
    "literal-cases.json:T1-LIT-069",
    "Sixth plus extension must reach the declared modifier conflict.",
    findings,
  );
  requireExact(
    { code: sixthFamily["code"], ruleId: sixthFamily["ruleId"], reason: sixthFamily["reason"] },
    { code: "theory.sixth_invalid", ruleId: "base-diminished", reason: "family" },
    "T1_CONTRACT_SIXTH_CASE_SPLIT",
    "literal-cases.json:T1-LIT-070",
    "sixth_invalid family is reserved for a base-triad-incompatible sixth.",
    findings,
  );
  const refusalCoverage = cases.flatMap((record) => {
    const expected = isObject(record["expected"]) ? record["expected"] : {};
    const refusal = isObject(expected["refusal"]) ? expected["refusal"] : null;
    return refusal === null ? [] : [{
      id: record["id"],
      code: refusal["code"],
      path: refusal["path"],
      phase: refusal["phase"],
      ruleId: refusal["ruleId"] ?? null,
      reason: refusal["reason"] ?? null,
      conflict: refusal["conflict"] ?? null,
    }];
  });
  requireExact(
    refusalCoverage,
    [
      { id: "T1-LIT-060", code: "theory.extension_invalid", path: ["extensions", 0], phase: "base", ruleId: "seventh-minor-major", reason: "family", conflict: null },
      { id: "T1-LIT-061", code: "theory.extension_invalid", path: ["extensions", 0], phase: "base", ruleId: "seventh-diminished", reason: "family", conflict: null },
      { id: "T1-LIT-062", code: "theory.addition_invalid", path: ["additions", 0], phase: "additions", ruleId: "base-major", reason: "number", conflict: null },
      { id: "T1-LIT-063", code: "theory.alteration_invalid", path: ["alterations", 0], phase: "structural-alterations", ruleId: "seventh-dominant", reason: "number", conflict: null },
      { id: "T1-LIT-064", code: "theory.omission_invalid", path: ["omissions", 0], phase: "omissions", ruleId: "seventh-dominant", reason: "number", conflict: null },
      { id: "T1-LIT-065", code: "theory.modifier_conflict", path: ["alterations", 0], phase: "structural-alterations", ruleId: "seventh-dominant", reason: null, conflict: "structural-alteration-pair" },
      { id: "T1-LIT-066", code: "theory.color_policy_invalid", path: ["colorPolicy"], phase: "color-alterations", ruleId: "altered-dominant", reason: "requires-dominant-seventh", conflict: null },
      { id: "T1-LIT-067", code: "theory.color_policy_invalid", path: ["colorPolicy"], phase: "color-alterations", ruleId: "altered-dominant", reason: "explicit-five-or-nine-alteration", conflict: null },
      { id: "T1-LIT-068", code: "theory.modifier_conflict", path: ["sixth"], phase: "base", ruleId: "sixth-major", reason: null, conflict: "sixth-with-seventh" },
      { id: "T1-LIT-069", code: "theory.modifier_conflict", path: ["sixth"], phase: "base", ruleId: "sixth-major", reason: null, conflict: "sixth-with-extension" },
      { id: "T1-LIT-070", code: "theory.sixth_invalid", path: ["sixth"], phase: "base", ruleId: "base-diminished", reason: "family", conflict: null },
      { id: "T1-LIT-071", code: "theory.formula_family_unsupported", path: ["seventh"], phase: "base", ruleId: "base-power", reason: null, conflict: null },
      { id: "T1-LIT-072", code: "theory.sixth_invalid", path: ["sixth"], phase: "base", ruleId: "base-major", reason: "alteration", conflict: null },
      { id: "T1-LIT-073", code: "theory.extension_invalid", path: ["extensions", 0], phase: "base", ruleId: "seventh-dominant", reason: "number", conflict: null },
      { id: "T1-LIT-074", code: "theory.extension_invalid", path: ["extensions", 0], phase: "base", ruleId: "seventh-dominant", reason: "alteration", conflict: null },
      { id: "T1-LIT-075", code: "theory.addition_invalid", path: ["additions", 0], phase: "additions", ruleId: "base-major", reason: "alteration", conflict: null },
      { id: "T1-LIT-076", code: "theory.alteration_invalid", path: ["alterations", 0], phase: "color-alterations", ruleId: "seventh-dominant", reason: "alteration", conflict: null },
      { id: "T1-LIT-077", code: "theory.modifier_conflict", path: ["additions", 0], phase: "additions", ruleId: "base-major", reason: null, conflict: "addition-omission" },
      { id: "T1-LIT-078", code: "theory.modifier_conflict", path: ["alterations", 0], phase: "structural-alterations", ruleId: "seventh-dominant", reason: null, conflict: "alteration-omission" },
      { id: "T1-LIT-080", code: "limit.theory_realization_degrees_exceeded", path: [], phase: "canonicalization", ruleId: "base-diminished", reason: null, conflict: null },
    ],
    "T1_CONTRACT_REFUSAL_CORPUS",
    "literal-cases.json.cases[59..79]",
    "The strict refusal corpus must preserve every reachable code, reason, conflict, path, phase, and attempted rule.",
    findings,
  );
  const warningCases = cases.flatMap((record) => {
    const expected = isObject(record["expected"]) ? record["expected"] : {};
    const warnings = Array.isArray(expected["warnings"]) ? expected["warnings"] : [];
    return warnings.length === 0 ? [] : [{ id: record["id"], warnings }];
  });
  requireExact(
    warningCases,
    [{ id: "T1-LIT-055", warnings: [{ code: "theory.omission_absent", path: ["omissions", 0], degreeNumber: 3 }] }],
    "T1_CONTRACT_WARNING_REACHABILITY",
    "literal-cases.json.cases",
    "Only an absent degree 3 omission may produce the single reachable T1 warning.",
    findings,
  );
  const duplicateMerge = cases.find((record) => idOf(record) === "T1-LIT-079");
  const duplicateExpected = duplicateMerge && isObject(duplicateMerge["expected"]) ? duplicateMerge["expected"] : {};
  requireExact(
    {
      inputAstRecipe: duplicateMerge?.["inputAstRecipe"],
      formulaRuleId: duplicateExpected["formulaRuleId"],
      realizationIds: duplicateExpected["realizationIds"],
      degrees: duplicateExpected["degrees"],
      required: duplicateExpected["required"],
      optional: duplicateExpected["optional"],
      guide: duplicateExpected["guide"],
      duplicateDegreesCanonicalized: duplicateExpected["duplicateDegreesCanonicalized"],
      winningPath: duplicateExpected["winningPath"],
      requiredRoleSourcePath: duplicateExpected["requiredRoleSourcePath"],
    },
    {
      inputAstRecipe: { base: "C11", additions: [{ number: 9, alter: 0 }] },
      formulaRuleId: "extension-dominant",
      realizationIds: ["literal"],
      degrees: ["1", "3", "5", "b7", "9", "11"],
      required: ["1", "3", "b7", "9", "11"],
      optional: ["5"],
      guide: ["3", "b7"],
      duplicateDegreesCanonicalized: 1,
      winningPath: ["extensions", 0],
      requiredRoleSourcePath: ["additions", 0],
    },
    "T1_CONTRACT_DUPLICATE_MERGE",
    "literal-cases.json:T1-LIT-079",
    "Cross-category exact duplicates must merge once and the required role must dominate.",
    findings,
  );
  const outputLimit = cases.find((record) => idOf(record) === "T1-LIT-080");
  const outputExpected = outputLimit && isObject(outputLimit["expected"]) ? outputLimit["expected"] : {};
  const outputRefusal = isObject(outputExpected["refusal"]) ? outputExpected["refusal"] : {};
  requireExact(
    { received: outputRefusal["received"], maximum: outputRefusal["maximum"], path: outputRefusal["path"], partialOutput: outputExpected["partialOutput"] },
    { received: 17, maximum: 16, path: [], partialOutput: false },
    "T1_CONTRACT_OUTPUT_LIMIT",
    "literal-cases.json:T1-LIT-080",
    "The first reachable seventeen-degree result must refuse transactionally before spelling.",
    findings,
  );
  requireExact(
    ["T1-LIT-081", "T1-LIT-082", "T1-LIT-083"].map((id) => {
      const record = cases.find((candidate) => idOf(candidate) === id);
      const expected = record && isObject(record["expected"]) ? record["expected"] : {};
      return { id, sourceSymbol: record?.["sourceSymbol"], formulaRuleId: expected["formulaRuleId"], rootVariationOf: expected["rootVariationOf"] ?? expected["degreeSetsEqualCase"] };
    }),
    [
      { id: "T1-LIT-081", sourceSymbol: "Db7alt", formulaRuleId: "altered-dominant", rootVariationOf: "T1-LIT-045" },
      { id: "T1-LIT-082", sourceSymbol: "F#7(no5)", formulaRuleId: "seventh-dominant", rootVariationOf: "T1-LIT-052" },
      { id: "T1-LIT-083", sourceSymbol: "Db7add9b9", formulaRuleId: "seventh-dominant", rootVariationOf: "T1-LIT-054" },
    ],
    "T1_CONTRACT_TRANSPOSITION_WITNESS",
    "literal-cases.json.cases[80..82]",
    "Targeted altered, omission, and modifier laws require real non-C root witnesses.",
    findings,
  );
  const literalExpectedById = new Map(
    cases.map((record) => [
      idOf(record),
      isObject(record["expected"]) ? record["expected"] : {},
    ]),
  );
  const roleProjection = (expected: JsonObject): JsonObject => ({
    formulaRuleId: expected["formulaRuleId"],
    realizationIds: expected["realizationIds"],
    degrees: expected["degrees"],
    required: expected["required"],
    optional: expected["optional"],
    guide: expected["guide"],
    warnings: expected["warnings"] ?? null,
  });
  const omissionSource = literalExpectedById.get("T1-LIT-052") ?? {};
  const omissionVariation = literalExpectedById.get("T1-LIT-082") ?? {};
  requireExact(
    { ...roleProjection(omissionVariation), rootVariationOf: omissionVariation["rootVariationOf"] },
    { ...roleProjection(omissionSource), rootVariationOf: "T1-LIT-052" },
    "T1_CONTRACT_LITERAL_LINK_SEMANTICS",
    "literal-cases.json:T1-LIT-082.expected",
    "The non-C omission witness must preserve the exact formula, ordered degrees, role partition, and warning output of its reviewed source case.",
    findings,
  );
  const modifierSource = literalExpectedById.get("T1-LIT-054") ?? {};
  const modifierVariation = literalExpectedById.get("T1-LIT-083") ?? {};
  requireExact(
    { ...roleProjection(modifierVariation), rootVariationOf: modifierVariation["rootVariationOf"] },
    { ...roleProjection(modifierSource), rootVariationOf: "T1-LIT-054" },
    "T1_CONTRACT_LITERAL_LINK_SEMANTICS",
    "literal-cases.json:T1-LIT-083.expected",
    "The non-C modifier witness must preserve the exact formula, ordered coexistence degrees, and role partition of its reviewed source case.",
    findings,
  );
  const alteredVariation = literalExpectedById.get("T1-LIT-081") ?? {};
  const alteredRealizations = isObject(alteredVariation["realizationsById"])
    ? alteredVariation["realizationsById"]
    : {};
  requireExact(
    {
      formulaRuleId: alteredVariation["formulaRuleId"],
      realizationIds: alteredVariation["realizationIds"],
      degreeSetsEqualCase: alteredVariation["degreeSetsEqualCase"],
      spellingRoot: alteredVariation["spellingRoot"],
      realizationsById: REVIEWED_ALTERED_DOMINANT_IDS.map((id) => {
        const realization = isObject(alteredRealizations[id]) ? alteredRealizations[id] : {};
        return {
          id,
          ...roleProjection(realization),
          spelledPitchNames: realization["spelledPitchNames"],
          pitchClasses: realization["pitchClasses"],
        };
      }),
      noVariantChosen: alteredVariation["noVariantChosen"],
    },
    {
      formulaRuleId: "altered-dominant",
      realizationIds: REVIEWED_ALTERED_DOMINANT_IDS,
      degreeSetsEqualCase: "T1-LIT-045",
      spellingRoot: { step: "D", alter: -1 },
      realizationsById: REVIEWED_ALTERED_DOMINANT_VARIANTS.map((variant) => ({
        id: variant.id,
        formulaRuleId: undefined,
        realizationIds: undefined,
        degrees: variant.degrees,
        required: variant.required,
        optional: variant.optional,
        guide: variant.guide,
        warnings: null,
        ...independentlySpellReviewedTokens({ step: "D", alter: -1 }, variant.degrees),
      })),
      noVariantChosen: true,
    },
    "T1_CONTRACT_LITERAL_LINK_SEMANTICS",
    "literal-cases.json:T1-LIT-081.expected",
    "The non-C altered witness must preserve all four stable variants and their exact semantic degree and role sets.",
    findings,
  );
  const interactionProjection = ["T1-LIT-084", "T1-LIT-085", "T1-LIT-086"].map((id) => {
    const record = cases.find((candidate) => idOf(candidate) === id);
    const expected = record && isObject(record["expected"]) ? record["expected"] : {};
    return {
      id,
      sourceSymbol: record?.["sourceSymbol"],
      root: expected["root"] ?? null,
      formulaId: expected["formulaId"] ?? null,
      formulaRuleId: expected["formulaRuleId"],
      realizationIds: expected["realizationIds"],
      degrees: expected["degrees"] ?? null,
      required: expected["required"] ?? null,
      optional: expected["optional"] ?? null,
      guide: expected["guide"] ?? null,
      spelledPitchNames: expected["spelledPitchNames"] ?? null,
      pitchClasses: expected["pitchClasses"] ?? null,
      markerConsumedOnce: expected["naturalNineFamilyMarkerConsumedOnce"] ?? null,
      requiredSiblingAddition: expected["requiredSiblingAddition"] ?? null,
      duplicateDegreesCanonicalized: expected["duplicateDegreesCanonicalized"] ?? null,
      guideUnionSources: expected["guideUnionSources"] ?? null,
      bass: expected["bass"] ?? null,
      bassExcludedFromEveryRealizationMembership: expected["bassExcludedFromEveryRealizationMembership"] ?? null,
      bassExcludedFromSpellingArrays: expected["bassExcludedFromSpellingArrays"] ?? null,
      noVariantChosen: expected["noVariantChosen"] ?? null,
    };
  });
  requireExact(
    interactionProjection,
    [
      {
        id: "T1-LIT-084",
        sourceSymbol: "C6/9(add2)",
        root: { step: "C", alter: 0 },
        formulaId: "T1-FORMULA-010",
        formulaRuleId: "sixth-major",
        realizationIds: ["literal"],
        degrees: ["1", "2", "3", "5", "6", "9"],
        required: ["1", "2", "3", "6"],
        optional: ["5", "9"],
        guide: ["3"],
        spelledPitchNames: [
          { step: "C", alter: 0 },
          { step: "D", alter: 0 },
          { step: "E", alter: 0 },
          { step: "G", alter: 0 },
          { step: "A", alter: 0 },
          { step: "D", alter: 0 },
        ],
        pitchClasses: [0, 2, 4, 7, 9, 2],
        markerConsumedOnce: true,
        requiredSiblingAddition: "2",
        duplicateDegreesCanonicalized: 0,
        guideUnionSources: null,
        bass: null,
        bassExcludedFromEveryRealizationMembership: null,
        bassExcludedFromSpellingArrays: null,
        noVariantChosen: null,
      },
      {
        id: "T1-LIT-085",
        sourceSymbol: "Cadd3",
        root: { step: "C", alter: 0 },
        formulaId: null,
        formulaRuleId: "base-major",
        realizationIds: ["literal"],
        degrees: ["1", "3", "5"],
        required: ["1", "3"],
        optional: ["5"],
        guide: ["3"],
        spelledPitchNames: [
          { step: "C", alter: 0 },
          { step: "E", alter: 0 },
          { step: "G", alter: 0 },
        ],
        pitchClasses: [0, 4, 7],
        markerConsumedOnce: null,
        requiredSiblingAddition: null,
        duplicateDegreesCanonicalized: 1,
        guideUnionSources: { baseFormula: true, explicitAdd3: false, result: true },
        bass: null,
        bassExcludedFromEveryRealizationMembership: null,
        bassExcludedFromSpellingArrays: null,
        noVariantChosen: null,
      },
      {
        id: "T1-LIT-086",
        sourceSymbol: "C7alt/G",
        root: { step: "C", alter: 0 },
        formulaId: null,
        formulaRuleId: "altered-dominant",
        realizationIds: REVIEWED_ALTERED_DOMINANT_IDS,
        degrees: null,
        required: null,
        optional: null,
        guide: null,
        spelledPitchNames: null,
        pitchClasses: null,
        markerConsumedOnce: null,
        requiredSiblingAddition: null,
        duplicateDegreesCanonicalized: null,
        guideUnionSources: null,
        bass: { step: "G", alter: 0 },
        bassExcludedFromEveryRealizationMembership: true,
        bassExcludedFromSpellingArrays: true,
        noVariantChosen: true,
      },
    ],
    "T1_CONTRACT_INTERACTION_WITNESSES",
    "literal-cases.json.cases[83..85]",
    "6/9 sibling additions, duplicate guide union, and altered slash-bass separation require exact combined witnesses.",
    findings,
  );
  const alteredSlashExpected = literalExpectedById.get("T1-LIT-086") ?? {};
  const alteredSlashRealizations = isObject(alteredSlashExpected["realizationsById"])
    ? alteredSlashExpected["realizationsById"]
    : {};
  requireExact(
    {
      root: alteredSlashExpected["root"],
      formulaRuleId: alteredSlashExpected["formulaRuleId"],
      realizationIds: alteredSlashExpected["realizationIds"],
      realizationsById: REVIEWED_ALTERED_DOMINANT_IDS.map((id) => {
        const realization = isObject(alteredSlashRealizations[id])
          ? alteredSlashRealizations[id]
          : {};
        return {
          id,
          degrees: realization["degrees"],
          required: realization["required"],
          optional: realization["optional"],
          guide: realization["guide"],
          spelledPitchNames: realization["spelledPitchNames"],
          pitchClasses: realization["pitchClasses"],
        };
      }),
    },
    {
      root: { step: "C", alter: 0 },
      formulaRuleId: "altered-dominant",
      realizationIds: REVIEWED_ALTERED_DOMINANT_IDS,
      realizationsById: REVIEWED_ALTERED_DOMINANT_VARIANTS.map((variant) => ({
        id: variant.id,
        degrees: variant.degrees,
        required: variant.required,
        optional: variant.optional,
        guide: variant.guide,
        ...independentlySpellReviewedTokens(
          { step: "C", alter: 0 },
          variant.degrees,
        ),
      })),
    },
    "T1_CONTRACT_INTERACTION_WITNESSES",
    "literal-cases.json:T1-LIT-086.expected.realizationsById",
    "Altered slash-bass separation must retain the exact four reviewed altered realizations, roles, spellings, and pitch classes.",
    findings,
  );
  const alteredNaturalNineRecord = cases.find((record) => idOf(record) === "T1-LIT-087");
  const alteredNaturalNineExpected = alteredNaturalNineRecord && isObject(alteredNaturalNineRecord["expected"])
    ? alteredNaturalNineRecord["expected"]
    : {};
  const alteredNaturalNineRealizations = isObject(alteredNaturalNineExpected["realizationsById"])
    ? alteredNaturalNineExpected["realizationsById"]
    : {};
  const degreeTokenIndex = (token: string): number => REVIEWED_DEGREE_TOKENS.findIndex((item) => item.token === token);
  const withRequiredNaturalNine = (tokens: readonly string[]): readonly string[] =>
    [...tokens, "9"].sort((left, right) => degreeTokenIndex(left) - degreeTokenIndex(right));
  requireExact(
    {
      sourceSymbol: alteredNaturalNineRecord?.["sourceSymbol"],
      root: alteredNaturalNineExpected["root"],
      formulaRuleId: alteredNaturalNineExpected["formulaRuleId"],
      realizationIds: alteredNaturalNineExpected["realizationIds"],
      realizationsById: REVIEWED_ALTERED_DOMINANT_IDS.map((id) => {
        const realization = isObject(alteredNaturalNineRealizations[id])
          ? alteredNaturalNineRealizations[id]
          : {};
        return {
          id,
          degrees: realization["degrees"],
          required: realization["required"],
          optional: realization["optional"],
          guide: realization["guide"],
          spelledPitchNames: realization["spelledPitchNames"],
          pitchClasses: realization["pitchClasses"],
        };
      }),
      phaseCoexistenceById: alteredNaturalNineExpected["phaseCoexistenceById"],
      naturalNineRequiredInEveryRealization: alteredNaturalNineExpected["naturalNineRequiredInEveryRealization"],
      colorNineRetainedInEveryRealization: alteredNaturalNineExpected["colorNineRetainedInEveryRealization"],
      noVariantChosen: alteredNaturalNineExpected["noVariantChosen"],
    },
    {
      sourceSymbol: "C7alt(add9)",
      root: { step: "C", alter: 0 },
      formulaRuleId: "altered-dominant",
      realizationIds: REVIEWED_ALTERED_DOMINANT_IDS,
      realizationsById: REVIEWED_ALTERED_DOMINANT_VARIANTS.map((variant) => ({
        id: variant.id,
        degrees: withRequiredNaturalNine(variant.degrees),
        required: withRequiredNaturalNine(variant.required),
        optional: [],
        guide: variant.guide,
        ...independentlySpellReviewedTokens({ step: "C", alter: 0 }, withRequiredNaturalNine(variant.degrees)),
      })),
      phaseCoexistenceById: Object.fromEntries(REVIEWED_ALTERED_DOMINANT_VARIANTS.map((variant) => {
        const colorNine = (variant.degrees as readonly string[]).includes("b9") ? "b9" : "#9";
        return [variant.id, {
          colorPhaseDegree: colorNine,
          additionPhaseDegree: "9",
          canonicalNineOrder: colorNine === "b9" ? ["b9", "9"] : ["9", "#9"],
        }];
      })),
      naturalNineRequiredInEveryRealization: true,
      colorNineRetainedInEveryRealization: true,
      noVariantChosen: true,
    },
    "T1_CONTRACT_LITERAL_EXPANSION_WITNESSES",
    "literal-cases.json:T1-LIT-087",
    "A natural add9 after altered-color expansion must coexist with each variant's color nine, remain required, preserve canonical order, and retain all four stable IDs.",
    findings,
  );
  const sourceTextRecord = cases.find((record) => idOf(record) === "T1-LIT-088");
  const sourceTextExpected = sourceTextRecord && isObject(sourceTextRecord["expected"])
    ? sourceTextRecord["expected"]
    : {};
  requireExact(
    sourceTextRecord?.["inputAstRecipe"],
    {
      kind: "parsed",
      sourceText: "Cmaj7",
      root: { step: "F", alter: 1 },
      triad: "minor",
      sixth: null,
      seventh: "minor",
      extensions: [],
      additions: [],
      alterations: [],
      omissions: [],
      bass: null,
      colorPolicy: "none",
    },
    "T1_CONTRACT_LITERAL_RECIPE",
    "literal-cases.json:T1-LIT-088.inputAstRecipe",
    "The sourceText-independence witness must retain contradictory parsed fields and source text.",
    findings,
  );
  requireExact(
    {
      root: sourceTextExpected["root"],
      formulaRuleId: sourceTextExpected["formulaRuleId"],
      realizationIds: sourceTextExpected["realizationIds"],
      degrees: sourceTextExpected["degrees"],
      required: sourceTextExpected["required"],
      optional: sourceTextExpected["optional"],
      guide: sourceTextExpected["guide"],
      spelledPitchNames: sourceTextExpected["spelledPitchNames"],
      pitchClasses: sourceTextExpected["pitchClasses"],
      sourceTextWouldImplyFormulaRuleId: sourceTextExpected["sourceTextWouldImplyFormulaRuleId"],
      sourceTextIgnored: sourceTextExpected["sourceTextIgnored"],
      parsedFieldsAuthoritative: sourceTextExpected["parsedFieldsAuthoritative"],
    },
    {
      root: { step: "F", alter: 1 },
      formulaRuleId: "seventh-minor",
      realizationIds: ["literal"],
      degrees: ["1", "b3", "5", "b7"],
      required: ["1", "b3", "b7"],
      optional: ["5"],
      guide: ["b3", "b7"],
      ...independentlySpellReviewedTokens({ step: "F", alter: 1 }, ["1", "b3", "5", "b7"]),
      sourceTextWouldImplyFormulaRuleId: "seventh-major",
      sourceTextIgnored: true,
      parsedFieldsAuthoritative: true,
    },
    "T1_CONTRACT_LITERAL_EXPANSION_WITNESSES",
    "literal-cases.json:T1-LIT-088.expected",
    "Parsed harmonic fields, never contradictory sourceText, must determine the selected formula and semantic realization.",
    findings,
  );
  cases.forEach((record, index) => {
    const expected = isObject(record["expected"]) ? record["expected"] : null;
    const path = `literal-cases.json.cases[${String(index)}]`;
    if (expected === null) {
      findings.push({ code: "T1_CONTRACT_LITERAL_SHAPE", path: `${path}.expected`, message: "Literal case requires an explicit expected result." });
      return;
    }
    if (Object.hasOwn(expected, "degrees")) validateDegreePartition(expected, `${path}.expected`, findings);
    const spellingRoot = isObject(expected["root"])
      ? expected["root"]
      : isObject(expected["spellingRoot"])
        ? expected["spellingRoot"]
        : null;
    if (
      spellingRoot !== null &&
      Object.hasOwn(expected, "degrees") &&
      Object.hasOwn(expected, "spelledPitchNames")
    ) {
      validateReviewedLiteralSpelling(spellingRoot, expected, `${path}.expected`, findings);
    }
    const realizationsById = isObject(expected["realizationsById"])
      ? expected["realizationsById"]
      : null;
    if (realizationsById !== null) {
      requireExact(
        Object.keys(realizationsById),
        expected["realizationIds"],
        "T1_CONTRACT_ALT_ROOT_WITNESS",
        `${path}.expected.realizationsById`,
        "Reviewed altered realization tables must use every stable ID in public order.",
        findings,
      );
      for (const [realizationId, realization] of Object.entries(realizationsById)) {
        if (!isObject(realization) || spellingRoot === null) {
          findings.push({
            code: "T1_CONTRACT_ALT_ROOT_WITNESS",
            path: `${path}.expected.realizationsById.${realizationId}`,
            message: "An altered root witness requires an object realization and exact written root.",
          });
          continue;
        }
        validateDegreePartition(realization, `${path}.expected.realizationsById.${realizationId}`, findings);
        validateReviewedLiteralSpelling(spellingRoot, realization, `${path}.expected.realizationsById.${realizationId}`, findings);
      }
    }
    if (typeof expected["formulaRuleId"] === "string" && !T1_REVIEWED_FORMULA_RULE_IDS.includes(expected["formulaRuleId"] as (typeof T1_REVIEWED_FORMULA_RULE_IDS)[number])) {
      findings.push({ code: "T1_CONTRACT_FORMULA_RULE_ID", path: `${path}.expected.formulaRuleId`, message: "Literal case cites an unknown public formula rule ID." });
    }
    const realizationIds = stringArray(expected["realizationIds"]);
    if (realizationIds !== null && !sameJson(realizationIds, ["literal"]) && !sameJson(realizationIds, REVIEWED_ALTERED_DOMINANT_IDS)) {
      findings.push({ code: "T1_CONTRACT_REALIZATION_IDS", path: `${path}.expected.realizationIds`, message: "Result must expose one literal realization or all four ordered altered-dominant realizations." });
    }
    const refusal = isObject(expected["refusal"]) ? expected["refusal"] : null;
    if (refusal !== null && (typeof refusal["code"] !== "string" || !REVIEWED_REFUSAL_CODES.includes(refusal["code"] as (typeof REVIEWED_REFUSAL_CODES)[number]))) {
      findings.push({ code: "T1_CONTRACT_CODE_INVENTORY", path: `${path}.expected.refusal.code`, message: "Literal refusal uses an unknown code." });
    }
  });
}

function pitchClassForSpelling(value: JsonObject): number | null {
  const step = value["step"];
  const alter = value["alter"];
  const natural = typeof step === "string" ? NATURAL_PITCH_CLASSES[step] : undefined;
  return natural === undefined || typeof alter !== "number"
    ? null
    : ((natural + alter) % 12 + 12) % 12;
}

function transposeSpellingIndependent(
  value: JsonObject,
  diatonicSteps: number,
  semitones: number,
): JsonObject | null {
  const step = value["step"];
  const alter = value["alter"];
  if (typeof step !== "string" || typeof alter !== "number") return null;
  const sourceIndex = STEP_ORDER.indexOf(step as (typeof STEP_ORDER)[number]);
  const sourceNatural = NATURAL_PITCH_CLASSES[step];
  if (sourceIndex < 0 || sourceNatural === undefined) return null;
  const directedTargetIndex = sourceIndex + diatonicSteps;
  const targetIndex = ((directedTargetIndex % STEP_ORDER.length) + STEP_ORDER.length) % STEP_ORDER.length;
  const targetStep = STEP_ORDER[targetIndex];
  if (targetStep === undefined) return null;
  const targetNatural = NATURAL_PITCH_CLASSES[targetStep];
  if (targetNatural === undefined) return null;
  const targetNaturalAbsolute = targetNatural + 12 * Math.floor(directedTargetIndex / STEP_ORDER.length);
  return {
    step: targetStep,
    alter: sourceNatural + alter + semitones - targetNaturalAbsolute,
  };
}

function validateCustomCases(root: JsonObject, findings: T1ContractFinding[]): void {
  requireExact(
    root["sharedExpected"],
    {
      resolvedChordMetadata: {
        schema: T1_REVIEWED_PUBLIC_CONTRACT.resolvedChordSchema,
        formulaTableId: T1_REVIEWED_PUBLIC_CONTRACT.formulaTable.id,
        formulaTableVersion: T1_REVIEWED_PUBLIC_CONTRACT.formulaTable.version,
        degreeSpellingPolicyId: T1_REVIEWED_PUBLIC_CONTRACT.degreeSpellingPolicy.id,
        degreeSpellingPolicyVersion: T1_REVIEWED_PUBLIC_CONTRACT.degreeSpellingPolicy.version,
        degreeRolePolicyId: T1_REVIEWED_PUBLIC_CONTRACT.degreeRolePolicy.id,
        degreeRolePolicyVersion: T1_REVIEWED_PUBLIC_CONTRACT.degreeRolePolicy.version,
      },
      kind: "custom",
      id: "custom",
      formulaRuleId: "custom",
      degrees: null,
      requiredDegrees: null,
      optionalDegrees: null,
      guideToneDegrees: null,
      limitations: T1_REVIEWED_PUBLIC_CONTRACT.customLimitations,
      warnings: [],
    },
    "T1_CONTRACT_CUSTOM_SHAPE",
    "custom-cases.json.sharedExpected",
    "Custom realization must retain null degree roles and both exact limitations.",
    findings,
  );
  const cases = objectArray(root["cases"]) ?? [];
  requireSortedUniqueIds(cases, "custom-cases.json.cases", findings);
  if (cases.length < 6) {
    findings.push({ code: "T1_CONTRACT_CUSTOM_COVERAGE", path: "custom-cases.json.cases", message: "Custom corpus requires at least six reviewed cases." });
  }
  const caseById = (id: string): JsonObject =>
    cases.find((record) => idOf(record) === id) ?? {};
  const expectedById = (id: string): JsonObject => {
    const expected = caseById(id)["expected"];
    return isObject(expected) ? expected : {};
  };
  const inputById = (id: string): JsonObject => {
    const input = caseById(id)["input"];
    return isObject(input) ? input : {};
  };
  const transpositionCase = caseById("T1-CUSTOM-009");
  const transpositionSource = isObject(transpositionCase["sourceInput"])
    ? transpositionCase["sourceInput"]
    : {};
  const transpositionTarget = isObject(transpositionCase["transposedInput"])
    ? transpositionCase["transposedInput"]
    : {};
  requireExact(
    [
      ...["T1-CUSTOM-001", "T1-CUSTOM-002", "T1-CUSTOM-003", "T1-CUSTOM-004", "T1-CUSTOM-005", "T1-CUSTOM-007", "T1-CUSTOM-008"].map((id) => ({
        id,
        inputKind: inputById(id)["kind"],
      })),
      {
        id: "T1-CUSTOM-009",
        sourceKind: transpositionSource["kind"],
        transposedKind: transpositionTarget["kind"],
      },
    ],
    [
      { id: "T1-CUSTOM-001", inputKind: "custom" },
      { id: "T1-CUSTOM-002", inputKind: "custom" },
      { id: "T1-CUSTOM-003", inputKind: "custom" },
      { id: "T1-CUSTOM-004", inputKind: "custom" },
      { id: "T1-CUSTOM-005", inputKind: "custom" },
      { id: "T1-CUSTOM-007", inputKind: "custom" },
      { id: "T1-CUSTOM-008", inputKind: "custom" },
      { id: "T1-CUSTOM-009", sourceKind: "custom", transposedKind: "custom" },
    ],
    "T1_CONTRACT_CUSTOM_DISCRIMINANT",
    "custom-cases.json.cases",
    "Every accepted custom witness must retain the exact custom discriminant.",
    findings,
  );
  requireExact(
    {
      kind: inputById("T1-CUSTOM-007")["kind"],
      sourceText: inputById("T1-CUSTOM-007")["sourceText"],
      label: inputById("T1-CUSTOM-007")["label"],
    },
    { kind: "custom", sourceText: "Cmaj7", label: "Cmaj7" },
    "T1_CONTRACT_CUSTOM_FAMILIAR_LABEL",
    "custom-cases.json:T1-CUSTOM-007.input",
    "The familiar-label witness must prove that display text never triggers formula inference.",
    findings,
  );
  requireExact(
    ["T1-CUSTOM-001", "T1-CUSTOM-002", "T1-CUSTOM-003", "T1-CUSTOM-004", "T1-CUSTOM-005", "T1-CUSTOM-007", "T1-CUSTOM-008"].map((id) => ({
      id,
      bass: inputById(id)["bass"],
    })),
    [
      { id: "T1-CUSTOM-001", bass: null },
      { id: "T1-CUSTOM-002", bass: null },
      { id: "T1-CUSTOM-003", bass: null },
      { id: "T1-CUSTOM-004", bass: { step: "B", alter: -1 } },
      { id: "T1-CUSTOM-005", bass: null },
      { id: "T1-CUSTOM-007", bass: null },
      { id: "T1-CUSTOM-008", bass: null },
    ],
    "T1_CONTRACT_CUSTOM_BASS",
    "custom-cases.json.cases",
    "Accepted custom witnesses must retain their exact separate bass premise, including reviewed null basses.",
    findings,
  );
  requireExact(
    {
      custom002: {
        length: expectedById("T1-CUSTOM-002")["length"],
        duplicatesPreserved: expectedById("T1-CUSTOM-002")["duplicatesPreserved"],
        orderPreserved: expectedById("T1-CUSTOM-002")["orderPreserved"],
      },
      custom003: { enharmonicSpellingsRemainDistinct: expectedById("T1-CUSTOM-003")["enharmonicSpellingsRemainDistinct"] },
      custom004: { bassExcludedFromPitchNames: expectedById("T1-CUSTOM-004")["bassExcludedFromPitchNames"] },
      custom005: {
        length: expectedById("T1-CUSTOM-005")["length"],
        limit: expectedById("T1-CUSTOM-005")["limit"],
        duplicatesPreserved: expectedById("T1-CUSTOM-005")["duplicatesPreserved"],
        orderPreserved: expectedById("T1-CUSTOM-005")["orderPreserved"],
      },
      custom006: {
        materializationRecipe: caseById("T1-CUSTOM-006")["materializationRecipe"],
        expected: expectedById("T1-CUSTOM-006"),
      },
      custom007: {
        degrees: expectedById("T1-CUSTOM-007")["degrees"],
        requiredDegrees: expectedById("T1-CUSTOM-007")["requiredDegrees"],
        optionalDegrees: expectedById("T1-CUSTOM-007")["optionalDegrees"],
        guideToneDegrees: expectedById("T1-CUSTOM-007")["guideToneDegrees"],
        formulaRuleId: expectedById("T1-CUSTOM-007")["formulaRuleId"],
      },
      custom008: { spellingServiceInvoked: expectedById("T1-CUSTOM-008")["spellingServiceInvoked"] },
    },
    {
      custom002: { length: 5, duplicatesPreserved: true, orderPreserved: true },
      custom003: { enharmonicSpellingsRemainDistinct: true },
      custom004: { bassExcludedFromPitchNames: true },
      custom005: { length: 16, limit: 16, duplicatesPreserved: true, orderPreserved: true },
      custom006: {
        materializationRecipe: {
          basePitchNamesRef: "T1-CUSTOM-005 input.pitchNames",
          append: { step: "D", alter: 0 },
          targetLength: 17,
        },
        expected: {
          t1Invoked: false,
          domainRefusal: { code: "limit.voicing_notes_exceeded", path: ["pitchNames"], count: 17, maximum: 16 },
          partialResolution: false,
        },
      },
      custom007: { degrees: null, requiredDegrees: null, optionalDegrees: null, guideToneDegrees: null, formulaRuleId: "custom" },
      custom008: { spellingServiceInvoked: false },
    },
    "T1_CONTRACT_CUSTOM_ANNOTATIONS",
    "custom-cases.json.cases",
    "Custom length, order, duplicate, bass, null-role, boundary, and direct-projection annotations changed.",
    findings,
  );
  const validCustomSpelling = (value: JsonObject): boolean => {
    const step = value["step"];
    const alter = value["alter"];
    return typeof step === "string" &&
      STEP_ORDER.includes(step as (typeof STEP_ORDER)[number]) &&
      typeof alter === "number" &&
      Number.isInteger(alter) &&
      alter >= -2 &&
      alter <= 2;
  };
  cases.forEach((record, index) => {
    const path = `custom-cases.json.cases[${String(index)}]`;
    if (record["id"] === "T1-CUSTOM-009") {
      const recipe = isObject(record["transpositionRecipe"]) ? record["transpositionRecipe"] : {};
      const interval = isObject(recipe["interval"]) ? recipe["interval"] : {};
      const inverse = isObject(recipe["inverse"]) ? recipe["inverse"] : {};
      requireExact(
        { interval, inverse },
        {
          interval: { diatonicSteps: 1, semitones: 2 },
          inverse: { diatonicSteps: -1, semitones: -2 },
        },
        "T1_CONTRACT_CUSTOM_TRANSPOSITION",
        `${path}.transpositionRecipe`,
        "Custom transposition witness must use an exact written major second and its inverse.",
        findings,
      );
      const source = isObject(record["sourceInput"]) ? record["sourceInput"] : {};
      const transposed = isObject(record["transposedInput"]) ? record["transposedInput"] : {};
      const sourcePitches = objectArray(source["pitchNames"]);
      const transposedPitches = objectArray(transposed["pitchNames"]);
      const sourceBass = isObject(source["bass"]) ? source["bass"] : null;
      const transposedBass = isObject(transposed["bass"]) ? transposed["bass"] : null;
      if (sourcePitches === null || transposedPitches === null || sourceBass === null || transposedBass === null) {
        findings.push({ code: "T1_CONTRACT_CUSTOM_TRANSPOSITION", path, message: "Custom transposition witness requires source and target pitch tuples plus separate bass spellings." });
        return;
      }
      if (
        !sourcePitches.every(validCustomSpelling) ||
        !transposedPitches.every(validCustomSpelling) ||
        !validCustomSpelling(sourceBass) ||
        !validCustomSpelling(transposedBass)
      ) {
        findings.push({ code: "T1_CONTRACT_CUSTOM_SPELLING", path, message: "Custom transposition spellings must use a reviewed step and integer alteration from -2 through 2." });
      }
      const projected = sourcePitches.map((pitch) => transposeSpellingIndependent(pitch, 1, 2));
      requireExact(transposedPitches, projected, "T1_CONTRACT_CUSTOM_TRANSPOSITION", `${path}.transposedInput.pitchNames`, "Every tuple position must use the independently computed written major-second transposition.", findings);
      requireExact(transposedBass, transposeSpellingIndependent(sourceBass, 1, 2), "T1_CONTRACT_CUSTOM_TRANSPOSITION", `${path}.transposedInput.bass`, "Separate slash bass must transpose without entering the pitch tuple.", findings);
      const inversePitches = transposedPitches.map((pitch) => transposeSpellingIndependent(pitch, -1, -2));
      const expected = isObject(record["expected"]) ? record["expected"] : {};
      requireExact(
        expected,
        {
          sourcePitchClasses: sourcePitches.map(pitchClassForSpelling),
          transposedPitchClasses: transposedPitches.map(pitchClassForSpelling),
          sourceBass,
          transposedBass,
          duplicatesPreservedAtIndices: [0, 2],
          inverseRestoresSourcePitchNames: sameJson(inversePitches, sourcePitches),
          inverseRestoresBass: sameJson(transposeSpellingIndependent(transposedBass, -1, -2), sourceBass),
          tupleLength: sourcePitches.length,
        },
        "T1_CONTRACT_CUSTOM_TRANSPOSITION",
        `${path}.expected`,
        "Custom transposition and inverse expectations changed.",
        findings,
      );
      return;
    }
    const input = isObject(record["input"]) ? record["input"] : null;
    const expected = isObject(record["expected"]) ? record["expected"] : null;
    if (expected === null) {
      findings.push({ code: "T1_CONTRACT_CUSTOM_SHAPE", path: `${path}.expected`, message: "Custom case requires explicit expected output or boundary refusal." });
      return;
    }
    if (input === null) {
      const refusal = isObject(expected["domainRefusal"]) ? expected["domainRefusal"] : {};
      requireExact(
        { t1Invoked: expected["t1Invoked"], code: refusal["code"], count: refusal["count"], maximum: refusal["maximum"], partialResolution: expected["partialResolution"] },
        { t1Invoked: false, code: "limit.voicing_notes_exceeded", count: 17, maximum: 16, partialResolution: false },
        "T1_CONTRACT_CUSTOM_LIMIT",
        `${path}.expected`,
        "The 17-pitch domain boundary must refuse before T1 with no partial resolution.",
        findings,
      );
      return;
    }
    const pitchNames = objectArray(input["pitchNames"]);
    if (pitchNames === null || pitchNames.length === 0 || pitchNames.length > T1_REVIEWED_LIMITS.customPitchNames) {
      findings.push({ code: "T1_CONTRACT_CUSTOM_LIMIT", path: `${path}.input.pitchNames`, message: "Accepted custom cases require 1 through 16 exact pitch spellings." });
      return;
    }
    const bass = input["bass"];
    if (
      !pitchNames.every(validCustomSpelling) ||
      (bass !== null && (!isObject(bass) || !validCustomSpelling(bass)))
    ) {
      findings.push({ code: "T1_CONTRACT_CUSTOM_SPELLING", path: `${path}.input`, message: "Custom pitch and bass spellings must use a reviewed step and integer alteration from -2 through 2." });
    }
    const projected = pitchNames.map(pitchClassForSpelling);
    if (projected.some((value) => value === null)) {
      findings.push({ code: "T1_CONTRACT_CUSTOM_SPELLING", path: `${path}.input.pitchNames`, message: "Custom pitch spelling must use a reviewed step and numeric alteration." });
    } else {
      requireExact(expected["pitchClasses"], projected, "T1_CONTRACT_CUSTOM_PROJECTION", `${path}.expected.pitchClasses`, "Custom pitch-class projection must preserve input order and duplicates.", findings);
    }
    if (Object.hasOwn(expected, "spelledPitchNames")) {
      requireExact(expected["spelledPitchNames"], pitchNames, "T1_CONTRACT_CUSTOM_EXACTNESS", `${path}.expected.spelledPitchNames`, "Custom spelling order and duplicates must remain byte-for-byte structural equals of input values.", findings);
    }
    if (Object.hasOwn(expected, "bass")) {
      requireExact(expected["bass"], input["bass"], "T1_CONTRACT_SLASH_BASS", `${path}.expected.bass`, "Custom slash bass must remain separate and exact.", findings);
    }
  });
}

function validateLawCases(
  root: JsonObject,
  literalRoot: JsonObject | undefined,
  linkedCaseIds: ReadonlySet<string>,
  controlIds: ReadonlySet<string>,
  findings: T1ContractFinding[],
): void {
  requireExact(
    root["lawProofPolicy"],
    "Every row names a positive witness, a negative or near-miss witness, a transposition or root-variation witness, and one or more reviewed mutation controls.",
    "T1_CONTRACT_LAW_PROOF_POLICY",
    "law-cases.json.lawProofPolicy",
    "Every normative law requires the complete positive, near-miss, variation, and mutation proof partition.",
    findings,
  );
  const cases = objectArray(root["cases"]) ?? [];
  requireSortedUniqueIds(cases, "law-cases.json.cases", findings);
  if (cases.length < 10) {
    findings.push({ code: "T1_CONTRACT_LAW_COVERAGE", path: "law-cases.json.cases", message: "At least ten reviewed laws are required." });
  }
  requireExact(
    cases.map((record) => ({ id: record["id"], statement: record["statement"] })),
    [
      { id: "T1-LAW-001", statement: "major seventh, major ninth, dominant ninth, dominant thirteenth, and diminished seventh formulas retain their exact thirds, sevenths, closure, and bb7 identity" },
      { id: "T1-LAW-002", statement: "degree number plus alteration is primary identity; pitch-class equality never merges #9 with b3 or bb7 with 6" },
      { id: "T1-LAW-003", statement: "spelling advances the diatonic letter in directed interval space before pitch-class projection and refuses required triple accidentals" },
      { id: "T1-LAW-004", statement: "transposing a parsed chord by a fully specified spelled interval and then its exact inverse restores root, degree identities, bass spelling, formula, roles, and ordered realization IDs" },
      { id: "T1-LAW-005", statement: "pitch-class projection after directed spelling commutes with spelled transposition modulo twelve while spelled identity remains richer" },
      { id: "T1-LAW-006", statement: "bare 7alt returns all four variants in stable order and later modifiers transform each variant without selecting, renaming, or merging IDs" },
      { id: "T1-LAW-007", statement: "suspension, structural alteration, color alteration, addition, omission, and canonicalization run in the frozen phase order" },
      { id: "T1-LAW-008", statement: "required and optional sets are disjoint, cover every retained degree, and every guide is retained and required; add3 is not promoted to guide" },
      { id: "T1-LAW-009", statement: "an omission removes every same-number degree across each realization and emits one source-path warning only when that number was absent" },
      { id: "T1-LAW-010", statement: "slash bass is preserved exactly outside degree membership, spelling arrays, roles, formula selection, and alt variants" },
      { id: "T1-LAW-011", statement: "custom resolution preserves every spelled pitch, order, duplicate, projection, and bass while exposing null degree roles and exact limitations" },
      { id: "T1-LAW-012", statement: "every refusal returns no partial realization, spelling, warning, chosen alt variant, or mutated source" },
    ],
    "T1_CONTRACT_LAW_STATEMENT",
    "law-cases.json.cases",
    "Normative law statements are executable contract text and may not be weakened or contradicted.",
    findings,
  );
  requireExact(
    cases.map((record) => ({ id: record["id"], lawId: record["lawId"], transpositionCaseId: record["transpositionCaseId"] })),
    [
      { id: "T1-LAW-001", lawId: "L-THEORY-01", transpositionCaseId: "T1-ROOT-MATRIX-001" },
      { id: "T1-LAW-002", lawId: "T1-LAW-DEGREE-IDENTITY", transpositionCaseId: "T1-SPELL-005" },
      { id: "T1-LAW-003", lawId: "T1-LAW-DIRECTED-SPELLING", transpositionCaseId: "T1-SPELL-013" },
      { id: "T1-LAW-004", lawId: "T1-LAW-TRANSPOSE-INVERSE", transpositionCaseId: "T1-ROOT-MATRIX-001" },
      { id: "T1-LAW-005", lawId: "T1-LAW-PROJECTION-COMMUTES", transpositionCaseId: "T1-ROOT-MATRIX-001" },
      { id: "T1-LAW-006", lawId: "T1-LAW-ALT-AMBIGUITY", transpositionCaseId: "T1-LIT-081" },
      { id: "T1-LAW-007", lawId: "T1-LAW-MODIFIER-PHASES", transpositionCaseId: "T1-LIT-083" },
      { id: "T1-LAW-008", lawId: "T1-LAW-ROLE-PARTITION", transpositionCaseId: "T1-ROOT-MATRIX-001" },
      { id: "T1-LAW-009", lawId: "T1-LAW-OMISSION", transpositionCaseId: "T1-LIT-082" },
      { id: "T1-LAW-010", lawId: "T1-LAW-SLASH-SEPARATION", transpositionCaseId: "T1-LAW-004" },
      { id: "T1-LAW-011", lawId: "T1-LAW-CUSTOM-EXACTNESS", transpositionCaseId: "T1-CUSTOM-009" },
      { id: "T1-LAW-012", lawId: "T1-LAW-TRANSACTIONAL-REFUSAL", transpositionCaseId: "T1-SPELL-012" },
    ],
    "T1_CONTRACT_LAW_INVENTORY",
    "law-cases.json.cases",
    "Law identities and concrete transposition or root-variation witnesses changed.",
    findings,
  );
  const lawProofProjection = (record: JsonObject): JsonObject => ({
    id: record["id"],
    positiveCaseIds: record["positiveCaseIds"],
    nearMissCaseIds: record["nearMissCaseIds"],
    transpositionCaseId: record["transpositionCaseId"],
    mutationControlIds: record["mutationControlIds"],
  });
  requireExact(
    cases.map(lawProofProjection),
    [
      { id: "T1-LAW-001", positiveCaseIds: ["T1-LIT-012", "T1-LIT-017", "T1-LIT-019", "T1-LIT-020", "T1-LIT-024"], nearMissCaseIds: ["T1-LIT-060", "T1-LIT-061"], transpositionCaseId: "T1-ROOT-MATRIX-001", mutationControlIds: ["T1-MUT-001", "T1-MUT-004", "T1-MUT-005", "T1-MUT-006", "T1-MUT-009"] },
      { id: "T1-LAW-002", positiveCaseIds: ["T1-SPELL-003", "T1-SPELL-004", "T1-SPELL-008"], nearMissCaseIds: ["T1-CUSTOM-003"], transpositionCaseId: "T1-SPELL-005", mutationControlIds: ["T1-MUT-013", "T1-MUT-014", "T1-MUT-015"] },
      { id: "T1-LAW-003", positiveCaseIds: ["T1-SPELL-001", "T1-SPELL-002", "T1-SPELL-009", "T1-SPELL-010"], nearMissCaseIds: ["T1-SPELL-011", "T1-SPELL-012"], transpositionCaseId: "T1-SPELL-013", mutationControlIds: ["T1-MUT-016", "T1-MUT-017", "T1-MUT-018", "T1-MUT-019"] },
      { id: "T1-LAW-004", positiveCaseIds: ["T1-LIT-047", "T1-LIT-048"], nearMissCaseIds: ["T1-SPELL-003", "T1-SPELL-004"], transpositionCaseId: "T1-ROOT-MATRIX-001", mutationControlIds: ["T1-MUT-020", "T1-MUT-021"] },
      { id: "T1-LAW-005", positiveCaseIds: ["T1-ROOT-MATRIX-001", "T1-SPELL-013"], nearMissCaseIds: ["T1-SPELL-011", "T1-SPELL-012"], transpositionCaseId: "T1-ROOT-MATRIX-001", mutationControlIds: ["T1-MUT-017", "T1-MUT-020"] },
      { id: "T1-LAW-006", positiveCaseIds: ["T1-LIT-045", "T1-LIT-056", "T1-LIT-057", "T1-LIT-058", "T1-LIT-087"], nearMissCaseIds: ["T1-LIT-066", "T1-LIT-067"], transpositionCaseId: "T1-LIT-081", mutationControlIds: ["T1-MUT-022", "T1-MUT-023", "T1-MUT-024", "T1-MUT-025"] },
      { id: "T1-LAW-007", positiveCaseIds: ["T1-LIT-044", "T1-LIT-046", "T1-LIT-053", "T1-LIT-054", "T1-LIT-059", "T1-LIT-079", "T1-LIT-087"], nearMissCaseIds: ["T1-LIT-063", "T1-LIT-064", "T1-LIT-065", "T1-LIT-077", "T1-LIT-078"], transpositionCaseId: "T1-LIT-083", mutationControlIds: ["T1-MUT-026", "T1-MUT-027", "T1-MUT-028", "T1-MUT-029", "T1-MUT-030"] },
      { id: "T1-LAW-008", positiveCaseIds: ["T1-LIT-010", "T1-LIT-016", "T1-LIT-018", "T1-LIT-032", "T1-LIT-053"], nearMissCaseIds: ["T1-LIT-055", "T1-LIT-059"], transpositionCaseId: "T1-ROOT-MATRIX-001", mutationControlIds: ["T1-MUT-031", "T1-MUT-032", "T1-MUT-033"] },
      { id: "T1-LAW-009", positiveCaseIds: ["T1-LIT-052", "T1-LIT-056", "T1-LIT-059"], nearMissCaseIds: ["T1-LIT-055", "T1-LIT-064"], transpositionCaseId: "T1-LIT-082", mutationControlIds: ["T1-MUT-029", "T1-MUT-034", "T1-MUT-035"] },
      { id: "T1-LAW-010", positiveCaseIds: ["T1-CUSTOM-004", "T1-LIT-047", "T1-LIT-048", "T1-LIT-049"], nearMissCaseIds: ["T1-CUSTOM-001"], transpositionCaseId: "T1-LAW-004", mutationControlIds: ["T1-MUT-036", "T1-MUT-037"] },
      { id: "T1-LAW-011", positiveCaseIds: ["T1-CUSTOM-002", "T1-CUSTOM-003", "T1-CUSTOM-004", "T1-CUSTOM-005", "T1-CUSTOM-008"], nearMissCaseIds: ["T1-CUSTOM-006", "T1-CUSTOM-007"], transpositionCaseId: "T1-CUSTOM-009", mutationControlIds: ["T1-MUT-038", "T1-MUT-039", "T1-MUT-040"] },
      { id: "T1-LAW-012", positiveCaseIds: ["T1-LIT-060", "T1-LIT-061", "T1-LIT-062", "T1-LIT-063", "T1-LIT-064", "T1-LIT-065", "T1-LIT-066", "T1-LIT-067", "T1-LIT-068", "T1-LIT-069", "T1-LIT-070", "T1-LIT-071", "T1-LIT-072", "T1-LIT-073", "T1-LIT-074", "T1-LIT-075", "T1-LIT-076", "T1-LIT-077", "T1-LIT-078", "T1-LIT-080", "T1-SPELL-011", "T1-SPELL-012"], nearMissCaseIds: ["T1-LIT-015", "T1-LIT-045", "T1-SPELL-009", "T1-SPELL-010"], transpositionCaseId: "T1-SPELL-012", mutationControlIds: ["T1-MUT-018", "T1-MUT-025", "T1-MUT-041", "T1-MUT-042"] },
    ],
    "T1_CONTRACT_LAW_PROOF_SET",
    "law-cases.json.cases",
    "Every law must retain its exact positive, near-miss, root/transposition, and mutation-control proof partition.",
    findings,
  );
  const refusalLaw = cases.find((record) => idOf(record) === "T1-LAW-012");
  requireExact(
    refusalLaw?.["positiveCaseIds"],
    [
      "T1-LIT-060", "T1-LIT-061", "T1-LIT-062", "T1-LIT-063", "T1-LIT-064",
      "T1-LIT-065", "T1-LIT-066", "T1-LIT-067", "T1-LIT-068", "T1-LIT-069",
      "T1-LIT-070", "T1-LIT-071", "T1-LIT-072", "T1-LIT-073", "T1-LIT-074",
      "T1-LIT-075", "T1-LIT-076", "T1-LIT-077", "T1-LIT-078", "T1-LIT-080",
      "T1-SPELL-011", "T1-SPELL-012",
    ],
    "T1_CONTRACT_TRANSACTIONAL_REFUSAL_LAW",
    "law-cases.json:T1-LAW-012.positiveCaseIds",
    "The transactional-refusal law must witness every literal refusal family plus both spelling refusal routes.",
    findings,
  );
  const transposeLaw = cases.find((record) => idOf(record) === "T1-LAW-004");
  const transposeRecipe = transposeLaw && isObject(transposeLaw["transpositionRecipe"])
    ? transposeLaw["transpositionRecipe"]
    : {};
  requireExact(
    {
      sourceCaseId: transposeRecipe["sourceCaseId"],
      interval: transposeRecipe["interval"],
      inverse: transposeRecipe["inverse"],
    },
    {
      sourceCaseId: "T1-LIT-047",
      interval: { diatonicSteps: 1, semitones: 1 },
      inverse: { diatonicSteps: -1, semitones: -1 },
    },
    "T1_CONTRACT_PARSED_TRANSPOSE_INVERSE",
    "law-cases.json:T1-LAW-004.transpositionRecipe",
    "Parsed transposition must use the reviewed written minor second and exact inverse.",
    findings,
  );
  const literalCases = objectArray(literalRoot?.["cases"]) ?? [];
  const sourceCase = literalCases.find((record) => idOf(record) === "T1-LIT-047");
  const sourceExpected = sourceCase && isObject(sourceCase["expected"])
    ? sourceCase["expected"]
    : {};
  const sourceSpellings = objectArray(sourceExpected["spelledPitchNames"]);
  const sourceRoot = isObject(sourceExpected["root"]) ? sourceExpected["root"] : null;
  const sourceBass = isObject(sourceExpected["bass"]) ? sourceExpected["bass"] : null;
  const targetSnapshot = isObject(transposeRecipe["reviewedTargetSnapshot"])
    ? transposeRecipe["reviewedTargetSnapshot"]
    : {};
  const targetSpellings = objectArray(targetSnapshot["spelledPitchNames"]);
  if (sourceSpellings === null || sourceRoot === null || sourceBass === null || targetSpellings === null) {
    findings.push({
      code: "T1_CONTRACT_PARSED_TRANSPOSE_INVERSE",
      path: "law-cases.json:T1-LAW-004.transpositionRecipe",
      message: "Parsed transposition requires source and target roots, slash basses, and aligned spelling arrays.",
    });
  } else {
    const invariantProjection = (snapshot: JsonObject): JsonObject => ({
      formulaRuleId: snapshot["formulaRuleId"],
      realizationIds: snapshot["realizationIds"],
      degrees: snapshot["degrees"],
      required: snapshot["required"],
      optional: snapshot["optional"],
      guide: snapshot["guide"],
      bassExcludedFromMembership: snapshot["bassExcludedFromMembership"],
    });
    const expectedTarget = {
      root: transposeSpellingIndependent(sourceRoot, 1, 1),
      ...invariantProjection(sourceExpected),
      spelledPitchNames: sourceSpellings.map((pitch) => transposeSpellingIndependent(pitch, 1, 1)),
      pitchClasses: sourceSpellings.map((pitch) => transposeSpellingIndependent(pitch, 1, 1)).map((pitch) => pitch && pitchClassForSpelling(pitch)),
      bass: transposeSpellingIndependent(sourceBass, 1, 1),
    };
    requireExact(
      targetSnapshot,
      expectedTarget,
      "T1_CONTRACT_PARSED_TRANSPOSE_INVERSE",
      "law-cases.json:T1-LAW-004.transpositionRecipe.reviewedTargetSnapshot",
      "Every parsed root, degree spelling, and slash bass must use the independently computed interval while formula identities and roles remain invariant.",
      findings,
    );
    const targetRoot = isObject(targetSnapshot["root"]) ? targetSnapshot["root"] : {};
    const targetBass = isObject(targetSnapshot["bass"]) ? targetSnapshot["bass"] : {};
    const inverseSnapshot = {
      root: transposeSpellingIndependent(targetRoot, -1, -1),
      ...invariantProjection(targetSnapshot),
      spelledPitchNames: targetSpellings.map((pitch) => transposeSpellingIndependent(pitch, -1, -1)),
      pitchClasses: targetSpellings.map((pitch) => transposeSpellingIndependent(pitch, -1, -1)).map((pitch) => pitch && pitchClassForSpelling(pitch)),
      bass: transposeSpellingIndependent(targetBass, -1, -1),
    };
    requireExact(
      transposeRecipe["expectedInverseSnapshot"],
      inverseSnapshot,
      "T1_CONTRACT_PARSED_TRANSPOSE_INVERSE",
      "law-cases.json:T1-LAW-004.transpositionRecipe.expectedInverseSnapshot",
      "The reviewed inverse snapshot must be independently reconstructed from the target.",
      findings,
    );
    const sourceSnapshot = {
      root: sourceExpected["root"],
      ...invariantProjection(sourceExpected),
      spelledPitchNames: sourceExpected["spelledPitchNames"],
      pitchClasses: sourceExpected["pitchClasses"],
      bass: sourceExpected["bass"],
    };
    const restoredExactly = sameJson(inverseSnapshot, sourceSnapshot);
    requireExact(
      {
        inverseInvariants: transposeRecipe["inverseInvariants"],
        expectedRestoredExactly: transposeRecipe["expectedRestoredExactly"],
        restoredExactly,
      },
      {
        inverseInvariants: {
          root: true,
          degreeIdentities: true,
          bassSpelling: true,
          formulaRuleId: true,
          roles: true,
          orderedRealizationIds: true,
          spelledPitchNames: true,
          pitchClasses: true,
        },
        expectedRestoredExactly: true,
        restoredExactly: true,
      },
      "T1_CONTRACT_PARSED_TRANSPOSE_INVERSE",
      "law-cases.json:T1-LAW-004.transpositionRecipe.inverseInvariants",
      "Parsed transposition followed by its exact inverse must restore every frozen semantic field.",
      findings,
    );
  }

  const projectionLaw = cases.find((record) => idOf(record) === "T1-LAW-005");
  const projectionRecipe = projectionLaw && isObject(projectionLaw["transpositionRecipe"])
    ? projectionLaw["transpositionRecipe"]
    : {};
  const projectionDegree = isObject(projectionRecipe["degree"])
    ? projectionRecipe["degree"]
    : {};
  requireExact(
    {
      roots: projectionRecipe["roots"],
      degree: projectionDegree,
      interval: projectionRecipe["interval"],
      projectionModulo: projectionRecipe["projectionModulo"],
    },
    {
      roots: ["C", "Db", "F#", "B"],
      degree: { number: 11, alter: 1 },
      interval: { diatonicSteps: 4, semitones: 7 },
      projectionModulo: 12,
    },
    "T1_CONTRACT_PROJECTION_COMMUTES",
    "law-cases.json:T1-LAW-005.transpositionRecipe",
    "Projection commutation requires the four reviewed roots, sharp eleventh, and written perfect fifth.",
    findings,
  );
  const projectionRows = objectArray(projectionRecipe["reviewedProjectionRows"]);
  const reviewedSourceRoots = [
    { step: "C", alter: 0 },
    { step: "D", alter: -1 },
    { step: "F", alter: 1 },
    { step: "B", alter: 0 },
  ];
  if (projectionRows === null || projectionRows.length !== reviewedSourceRoots.length) {
    findings.push({
      code: "T1_CONTRACT_PROJECTION_COMMUTES",
      path: "law-cases.json:T1-LAW-005.transpositionRecipe.reviewedProjectionRows",
      message: "Projection commutation requires exactly four reviewed rows.",
    });
  } else {
    projectionRows.forEach((row, index) => {
      const reviewedSourceRoot = reviewedSourceRoots[index] ?? {};
      const targetRoot = transposeSpellingIndependent(reviewedSourceRoot, 4, 7);
      const sourceSpelling = independentSpelling(reviewedSourceRoot, projectionDegree);
      const targetSpelling = targetRoot === null
        ? null
        : independentSpelling(targetRoot, projectionDegree);
      const transposedSourceSpelling = sourceSpelling === null
        ? null
        : transposeSpellingIndependent(sourceSpelling, 4, 7);
      const sourcePitchClass = sourceSpelling?.pitchClass ?? null;
      const targetPitchClass = targetSpelling?.pitchClass ?? null;
      requireExact(
        row,
        {
          sourceRoot: reviewedSourceRoot,
          targetRoot,
          sourceSpelling: sourceSpelling === null ? null : { step: sourceSpelling.step, alter: sourceSpelling.alter },
          sourcePitchClass,
          targetSpelling: targetSpelling === null ? null : { step: targetSpelling.step, alter: targetSpelling.alter },
          targetPitchClass,
        },
        "T1_CONTRACT_PROJECTION_COMMUTES",
        `law-cases.json:T1-LAW-005.transpositionRecipe.reviewedProjectionRows[${String(index)}]`,
        "The reviewed root, sharp-eleventh spelling, and projection row must match independent directed arithmetic.",
        findings,
      );
      if (
        !sameJson(
          transposedSourceSpelling,
          targetSpelling === null
            ? null
            : { step: targetSpelling.step, alter: targetSpelling.alter },
        ) ||
        sourcePitchClass === null ||
        targetPitchClass === null ||
        (sourcePitchClass + 7) % 12 !== targetPitchClass
      ) {
        findings.push({
          code: "T1_CONTRACT_PROJECTION_COMMUTES",
          path: `law-cases.json:T1-LAW-005.transpositionRecipe.reviewedProjectionRows[${String(index)}]`,
          message: "Spelled transposition and pitch-class projection must commute modulo twelve.",
        });
      }
    });
  }
  cases.forEach((record, index) => {
    const path = `law-cases.json.cases[${String(index)}]`;
    const positive = requireUniqueStringRefs(record["positiveCaseIds"], `${path}.positiveCaseIds`, findings);
    const nearMiss = requireUniqueStringRefs(record["nearMissCaseIds"], `${path}.nearMissCaseIds`, findings);
    const controls = requireUniqueStringRefs(record["mutationControlIds"], `${path}.mutationControlIds`, findings);
    const transposition = record["transpositionCaseId"];
    if (typeof record["lawId"] !== "string" || typeof record["statement"] !== "string" || record["statement"].trim().length === 0) {
      findings.push({ code: "T1_CONTRACT_LAW_SHAPE", path, message: "Law row requires stable lawId and nonempty statement." });
    }
    if (typeof transposition !== "string" || transposition.length === 0) {
      findings.push({ code: "T1_CONTRACT_LAW_TRANSPOSITION", path: `${path}.transpositionCaseId`, message: "Every law requires an explicit transposition or root-variation witness." });
    }
    for (const caseId of [...positive, ...nearMiss, ...(typeof transposition === "string" ? [transposition] : [])]) {
      if (!linkedCaseIds.has(caseId)) {
        findings.push({ code: "T1_CONTRACT_LAW_REFERENCE", path, message: `Unknown law witness ${JSON.stringify(caseId)}.` });
      }
    }
    for (const controlId of controls) {
      if (!controlIds.has(controlId)) {
        findings.push({ code: "T1_CONTRACT_MUTATION_REFERENCE", path: `${path}.mutationControlIds`, message: `Unknown law mutation control ${JSON.stringify(controlId)}.` });
      }
    }
  });
}

function validateOperationStates(root: JsonObject, findings: T1ContractFinding[]): void {
  requireExact(root["applicabilityVocabulary"], ["not-applicable", "required"], "T1_CONTRACT_OPERATION_STATE", "operation-state-cases.json.applicabilityVocabulary", "Operation applicability vocabulary changed.", findings);
  requireExact(
    root["pathPolicy"],
    {
      sixth: ["sixth"],
      arrayInvalid: "[field, index], including the first excess item",
      colorPolicy: ["colorPolicy"],
      modifierConflict: "path equals leftPath; leftPath and rightPath are ordered by formula phase and then source index",
      wholeOutputBound: [],
      directSpelling: ["degree"],
      resolverSpelling: "the explicit modifier source path when that modifier makes the retained degree unspellable; otherwise root for every v1 base-family accidental overflow",
      noGeneratedOutputPaths: true,
    },
    "T1_CONTRACT_PATH_POLICY",
    "operation-state-cases.json.pathPolicy",
    "Public refusal path provenance changed.",
    findings,
  );
  const cases = objectArray(root["cases"]) ?? [];
  requireSortedUniqueIds(cases, "operation-state-cases.json.cases", findings);
  if (cases.length < 6) {
    findings.push({ code: "T1_CONTRACT_OPERATION_COVERAGE", path: "operation-state-cases.json.cases", message: "At least six explicit operation-state rows are required." });
  }
  cases.forEach((record, index) => {
    const path = `operation-state-cases.json.cases[${String(index)}]`;
    const cancellation = isObject(record["cancellation"]) ? record["cancellation"] : null;
    const stale = isObject(record["staleRevision"]) ? record["staleRevision"] : null;
    const expected = isObject(record["expected"]) ? record["expected"] : null;
    if (
      cancellation?.["applicability"] !== "not-applicable" ||
      stale === null ||
      !["not-applicable", "required"].includes(String(stale["applicability"])) ||
      expected === null
    ) {
      findings.push({ code: "T1_CONTRACT_OPERATION_STATE", path, message: "Every operation row requires explicit cancellation, staleness, and expected-state semantics." });
    }
    if (stale?.["applicability"] === "required" && (typeof stale["ownedBy"] !== "string" || stale["ownedBy"] === "T1")) {
      findings.push({ code: "T1_CONTRACT_OPERATION_STATE", path: `${path}.staleRevision`, message: "A required stale check must name a downstream non-T1 owner." });
    }
  });
  requireExact(
    cases.slice(0, 6).map((record) => ({
      id: record["id"],
      operation: record["operation"],
      operationClass: record["operationClass"],
      cancellation: record["cancellation"],
      staleRevision: record["staleRevision"],
      expected: record["expected"],
    })),
    [
      {
        id: "T1-OPSTATE-001",
        operation: "spellChordDegree",
        operationClass: "pure synchronous directed interval arithmetic",
        cancellation: { applicability: "not-applicable", reason: "one bounded directed letter and semitone calculation has no cancellation observation point" },
        staleRevision: { applicability: "not-applicable", reason: "root and degree are immutable values and carry no document revision" },
        expected: { stateMutation: "none", deterministicWorkBound: "one spelling attempt", deterministicMemoryBound: "one result or one refusal", successPath: "value", refusalPath: ["degree"] },
      },
      {
        id: "T1-OPSTATE-002",
        operation: "resolveChord parsed literal",
        operationClass: "pure synchronous bounded formula pipeline",
        cancellation: { applicability: "not-applicable", reason: "a domain-valid ChordSpec has frozen finite input maxima and the eight phases complete synchronously" },
        staleRevision: { applicability: "not-applicable", reason: "T1 returns a value and never publishes to application state" },
        expected: { stateMutation: "none", partialCommit: false, maximumFormulaPhases: 8, maximumPhaseTransitions: 32, maximumInputDegreeRecordsVisited: 23, maximumCandidateInsertions: 84, maximumPeakCandidateDegreeRecords: 21, maximumTrackedRecords: 149 },
      },
      {
        id: "T1-OPSTATE-003",
        operation: "resolveChord altered dominant",
        operationClass: "pure synchronous bounded four-branch formula pipeline",
        cancellation: { applicability: "not-applicable", reason: "all four variants are required output and bounded before invocation" },
        staleRevision: { applicability: "not-applicable", reason: "the operation neither chooses an audition variant nor changes a document" },
        expected: { realizations: 4, semanticOutputRecordsMaximum: 64, spellingAttemptsMaximum: 64, warningsMaximum: 1, chosenVariant: null, variantOrder: REVIEWED_ALTERED_DOMINANT_IDS },
      },
      {
        id: "T1-OPSTATE-004",
        operation: "resolveChord custom",
        operationClass: "pure synchronous exact projection over a domain-bounded tuple",
        cancellation: { applicability: "not-applicable", reason: "custom pitchNames is nonempty and capped at sixteen before T1 is called" },
        staleRevision: { applicability: "not-applicable", reason: "the operation does not publish or mutate the CustomChordSpec" },
        expected: { maximumInputPitches: 16, maximumProjectionRecords: 16, realizations: 1, warnings: 0, stateMutation: "none" },
      },
      {
        id: "T1-OPSTATE-005",
        operation: "resolveChord refusal",
        operationClass: "transactional pure validation and construction",
        cancellation: { applicability: "not-applicable", reason: "the first frozen-precedence refusal ends synchronous work" },
        staleRevision: { applicability: "not-applicable", reason: "no application state is read or written" },
        expected: { stateMutation: "none", partialValue: false, partialRealizations: false, partialWarnings: false, sourceUnchanged: true, altSelection: false },
      },
      {
        id: "T1-OPSTATE-006",
        operation: "publish a resolved chord into a progression document",
        operationClass: "later application command outside T1",
        cancellation: { applicability: "not-applicable", reason: "the eventual A0 publication command is synchronous and atomic" },
        staleRevision: { applicability: "required", ownedBy: "A0", reason: "a later mutating command must compare base revision before committing; T1 itself accepts no revision parameter" },
        expected: { t1ImplementationRequired: false, t1ResultMayBeReusedAsAuthorityAfterSourceRevision: false, partialCommit: false },
      },
    ],
    "T1_CONTRACT_OPERATION_TRANSACTION",
    "operation-state-cases.json.cases[0..5]",
    "Pure operation bounds, transactional refusal, source immutability, and downstream stale-publication ownership changed.",
    findings,
  );
  requireExact(
    cases.slice(6).map((record) => ({
      id: record["id"],
      operation: record["operation"],
      operationClass: record["operationClass"],
      cancellation: record["cancellation"],
      staleRevision: record["staleRevision"],
    })),
    [
      {
        id: "T1-OPSTATE-007",
        operation: "resolveChord collection preflight and exact source paths",
        operationClass: "first-excess bounded validation matrix",
        cancellation: { applicability: "not-applicable", reason: "each finite collection stops at its first excess item" },
        staleRevision: { applicability: "not-applicable", reason: "validation is over an immutable source value" },
      },
      {
        id: "T1-OPSTATE-008",
        operation: "resolution refusal path provenance",
        operationClass: "source-owned path matrix",
        cancellation: { applicability: "not-applicable", reason: "path selection is part of the synchronous refusal" },
        staleRevision: { applicability: "not-applicable", reason: "no generated output is published" },
      },
      {
        id: "T1-OPSTATE-009",
        operation: "resolveChord exact evidence termination matrix",
        operationClass: "independently counted bounded work for every terminal branch",
        cancellation: { applicability: "not-applicable", reason: "pure bounded synchronous theory operation" },
        staleRevision: { applicability: "not-applicable", reason: "T1 receives an immutable ChordSpec value and owns no document revision" },
      },
      {
        id: "T1-OPSTATE-010",
        operation: "resolveChord global refusal precedence tournament",
        operationClass: "pairwise multi-fault winner matrix with source-index and conflict-order ties",
        cancellation: { applicability: "not-applicable", reason: "pure bounded synchronous theory operation" },
        staleRevision: { applicability: "not-applicable", reason: "T1 receives an immutable ChordSpec value and owns no document revision" },
      },
    ],
    "T1_CONTRACT_OPERATION_METADATA",
    "operation-state-cases.json.cases[6..9]",
    "Every advanced operation matrix must retain its exact ownership, boundedness, cancellation, and staleness semantics.",
    findings,
  );
  const preflight = cases.find((record) => idOf(record) === "T1-OPSTATE-007");
  const preflightRows = preflight ? objectArray(preflight["rows"]) : null;
  requireExact(
    preflightRows,
    [
      {
        field: "extensions",
        inclusiveMaximum: 1,
        firstExcessIndex: 1,
        inputRecipe: { base: "Cmaj7", extensions: [{ number: 9, alter: 0 }, { number: 1, alter: 0 }] },
        expectedRefusal: { code: "theory.extension_invalid", path: ["extensions", 1], phase: "base", ruleId: "extension-major", received: { number: 1, alter: 0 }, reason: "count" },
      },
      {
        field: "additions",
        inclusiveMaximum: 7,
        firstExcessIndex: 7,
        inputRecipe: { base: "C", additions: [{ number: 2, alter: 0 }, { number: 3, alter: 0 }, { number: 4, alter: 0 }, { number: 6, alter: 0 }, { number: 9, alter: 0 }, { number: 11, alter: 0 }, { number: 13, alter: 0 }, { number: 1, alter: 0 }] },
        expectedRefusal: { code: "theory.addition_invalid", path: ["additions", 7], phase: "additions", ruleId: "base-major", received: { number: 1, alter: 0 }, reason: "count" },
      },
      {
        field: "alterations",
        inclusiveMaximum: 8,
        firstExcessIndex: 8,
        inputRecipe: { base: "C7", alterations: [{ number: 5, alter: -1 }, { number: 5, alter: 1 }, { number: 9, alter: -1 }, { number: 9, alter: 1 }, { number: 11, alter: -1 }, { number: 11, alter: 1 }, { number: 13, alter: -1 }, { number: 13, alter: 1 }, { number: 3, alter: -1 }] },
        expectedRefusal: { code: "theory.alteration_invalid", path: ["alterations", 8], phase: "structural-alterations", ruleId: "seventh-dominant", received: { number: 3, alter: -1 }, reason: "count" },
      },
      {
        field: "omissions",
        inclusiveMaximum: 2,
        firstExcessIndex: 2,
        inputRecipe: { base: "C7", omissions: [3, 5, 7] },
        expectedRefusal: { code: "theory.omission_invalid", path: ["omissions", 2], phase: "omissions", ruleId: "seventh-dominant", received: 7, reason: "count" },
      },
    ],
    "T1_CONTRACT_INPUT_LIMIT_BOUNDARY",
    "operation-state-cases.json:T1-OPSTATE-007.rows",
    "First-excess input arrays and complete public refusal payloads changed.",
    findings,
  );
  preflightRows?.forEach((row, index) => {
    const field = typeof row["field"] === "string" ? row["field"] : "";
    const maximum = row["inclusiveMaximum"];
    const firstExcessIndex = row["firstExcessIndex"];
    const input = isObject(row["inputRecipe"]) ? row["inputRecipe"] : {};
    const sourceItems = Array.isArray(input[field]) ? input[field] : [];
    const refusal = isObject(row["expectedRefusal"]) ? row["expectedRefusal"] : {};
    if (
      typeof maximum !== "number" ||
      firstExcessIndex !== maximum ||
      sourceItems.length !== maximum + 1 ||
      !sameJson(refusal["path"], [field, firstExcessIndex]) ||
      !sameJson(refusal["received"], sourceItems[firstExcessIndex]) ||
      refusal["reason"] !== "count"
    ) {
      findings.push({
        code: "T1_CONTRACT_INPUT_LIMIT_BOUNDARY",
        path: `operation-state-cases.json:T1-OPSTATE-007.rows[${String(index)}]`,
        message: "A first-excess row must visit exactly through index maximum and return that exact source item with reason count.",
      });
    }
  });
  const reasonRows = preflight ? objectArray(preflight["reasonPrecedenceRows"]) : null;
  requireExact(
    reasonRows,
    [
      { id: "T1-REASON-PRECEDENCE-001", contenders: ["alteration", "family"], inputRecipe: { base: "Cdim", sixth: { number: 6, alter: -1 } }, expectedRefusal: { code: "theory.sixth_invalid", path: ["sixth"], phase: "base", ruleId: "base-diminished", received: { number: 6, alter: -1 }, reason: "alteration" } },
      { id: "T1-REASON-PRECEDENCE-002", contenders: ["number", "alteration"], inputRecipe: { base: "C", extensions: [{ number: 1, alter: -1 }] }, expectedRefusal: { code: "theory.extension_invalid", path: ["extensions", 0], phase: "base", ruleId: "base-major", received: { number: 1, alter: -1 }, reason: "number" } },
      { id: "T1-REASON-PRECEDENCE-003", contenders: ["alteration", "family"], inputRecipe: { base: "Cm(maj7)", extensions: [{ number: 9, alter: 1 }] }, expectedRefusal: { code: "theory.extension_invalid", path: ["extensions", 0], phase: "base", ruleId: "seventh-minor-major", received: { number: 9, alter: 1 }, reason: "alteration" } },
      { id: "T1-REASON-PRECEDENCE-004", contenders: ["number", "alteration"], inputRecipe: { base: "C", additions: [{ number: 1, alter: -1 }] }, expectedRefusal: { code: "theory.addition_invalid", path: ["additions", 0], phase: "additions", ruleId: "base-major", received: { number: 1, alter: -1 }, reason: "number" } },
      { id: "T1-REASON-PRECEDENCE-005", contenders: ["number", "alteration"], inputRecipe: { base: "C7", alterations: [{ number: 3, alter: -2 }] }, expectedRefusal: { code: "theory.alteration_invalid", path: ["alterations", 0], phase: "structural-alterations", ruleId: "seventh-dominant", received: { number: 3, alter: -2 }, reason: "number" } },
      { id: "T1-REASON-PRECEDENCE-006", contenders: ["requires-dominant-seventh", "explicit-five-or-nine-alteration"], inputRecipe: { base: "C", colorPolicy: "altered-dominant", alterations: [{ number: 5, alter: -1 }] }, expectedRefusal: { code: "theory.color_policy_invalid", path: ["colorPolicy"], phase: "color-alterations", ruleId: "altered-dominant", received: "altered-dominant", reason: "requires-dominant-seventh" } },
    ],
    "T1_CONTRACT_REFUSAL_REASON_PRECEDENCE",
    "operation-state-cases.json:T1-OPSTATE-007.reasonPrecedenceRows",
    "Every reachable same-code multi-reason contest must preserve the frozen winner and full payload.",
    findings,
  );
  const reasonPairWitnesses = [
    { row: reasonRows?.[0], contenders: reasonRows?.[0]?.["contenders"] },
    { row: preflightRows?.[0], contenders: ["count", "number"] },
    { row: reasonRows?.[1], contenders: reasonRows?.[1]?.["contenders"] },
    { row: reasonRows?.[2], contenders: reasonRows?.[2]?.["contenders"] },
    { row: preflightRows?.[1], contenders: ["count", "number"] },
    { row: reasonRows?.[3], contenders: reasonRows?.[3]?.["contenders"] },
    { row: preflightRows?.[2], contenders: ["count", "number"] },
    { row: reasonRows?.[4], contenders: reasonRows?.[4]?.["contenders"] },
    { row: preflightRows?.[3], contenders: ["count", "number"] },
    { row: reasonRows?.[5], contenders: reasonRows?.[5]?.["contenders"] },
  ].map(({ row, contenders }) => {
    const refusal = row && isObject(row["expectedRefusal"])
      ? row["expectedRefusal"]
      : {};
    return { code: refusal["code"], contenders, winner: refusal["reason"] };
  });
  requireExact(
    reasonPairWitnesses,
    [
      { code: "theory.sixth_invalid", contenders: ["alteration", "family"], winner: "alteration" },
      { code: "theory.extension_invalid", contenders: ["count", "number"], winner: "count" },
      { code: "theory.extension_invalid", contenders: ["number", "alteration"], winner: "number" },
      { code: "theory.extension_invalid", contenders: ["alteration", "family"], winner: "alteration" },
      { code: "theory.addition_invalid", contenders: ["count", "number"], winner: "count" },
      { code: "theory.addition_invalid", contenders: ["number", "alteration"], winner: "number" },
      { code: "theory.alteration_invalid", contenders: ["count", "number"], winner: "count" },
      { code: "theory.alteration_invalid", contenders: ["number", "alteration"], winner: "number" },
      { code: "theory.omission_invalid", contenders: ["count", "number"], winner: "count" },
      { code: "theory.color_policy_invalid", contenders: ["requires-dominant-seventh", "explicit-five-or-nine-alteration"], winner: "requires-dominant-seventh" },
    ],
    "T1_CONTRACT_REFUSAL_REASON_PRECEDENCE_PAIRS",
    "operation-state-cases.json:T1-OPSTATE-007",
    "Every adjacent same-code reason pair requires an executable witness and the earlier reason must win.",
    findings,
  );
  requireExact(
    preflight?.["expected"],
    {
      reasonPrecedence: {
        sixth: ["alteration", "family"],
        extension: ["count", "number", "alteration", "family"],
        addition: ["count", "number", "alteration"],
        alteration: ["count", "number", "alteration"],
        omission: ["count", "number"],
        colorPolicy: ["requires-dominant-seventh", "explicit-five-or-nine-alteration"],
      },
      adjacentReasonPrecedencePairs: 10,
      sourceItemsAfterFirstExcessVisited: 0,
      partialValue: false,
    },
    "T1_CONTRACT_REFUSAL_REASON_PRECEDENCE",
    "operation-state-cases.json:T1-OPSTATE-007.expected",
    "Same-code reason order and no-work-after-first-excess semantics changed.",
    findings,
  );
  const pathProvenance = cases.find(
    (record) => idOf(record) === "T1-OPSTATE-008",
  );
  requireExact(
    {
      rows: pathProvenance?.["rows"],
      expected: pathProvenance?.["expected"],
    },
    {
      rows: [
        { cause: "invalid sixth", expectedPath: ["sixth"] },
        { cause: "invalid extension index i", expectedPathTemplate: ["extensions", "i"] },
        { cause: "invalid addition index i", expectedPathTemplate: ["additions", "i"] },
        { cause: "invalid alteration index i", expectedPathTemplate: ["alterations", "i"] },
        { cause: "invalid omission index i", expectedPathTemplate: ["omissions", "i"] },
        { cause: "color-policy incompatibility", expectedPath: ["colorPolicy"] },
        { cause: "modifier conflict", expectedPathEquals: "leftPath", pathOrder: "phase then source index" },
        { cause: "whole output degree bound", expectedPath: [] },
        { cause: "direct spellChordDegree", expectedPath: ["degree"] },
        {
          cause: "explicit addition creates unspellable degree",
          expectedPathTemplate: ["additions", "i"],
          evidenceRowId: "T1-EVIDENCE-ADDITION-SPELLING-REFUSAL",
        },
        {
          cause: "explicit alteration creates unspellable degree",
          expectedPathTemplate: ["alterations", "i"],
          evidenceRowId: "T1-EVIDENCE-MODIFIER-SPELLING-REFUSAL",
        },
        {
          cause: "E-double-sharp major family third requires G-triple-sharp only because of root spelling",
          expectedPath: ["root"],
        },
      ],
      expected: {
        generatedRealizationPathAllowed: false,
        partialOutput: false,
      },
    },
    "T1_CONTRACT_PATH_PROVENANCE",
    "operation-state-cases.json:T1-OPSTATE-008",
    "Every refusal route must retain its exact source-owned path, including distinct addition and alteration spelling witnesses.",
    findings,
  );
  const altered = cases.find((record) => idOf(record) === "T1-OPSTATE-003");
  const alteredExpected = altered && isObject(altered["expected"]) ? altered["expected"] : {};
  requireExact(
    {
      realizations: alteredExpected["realizations"],
      semanticOutputRecordsMaximum: alteredExpected["semanticOutputRecordsMaximum"],
      spellingAttemptsMaximum: alteredExpected["spellingAttemptsMaximum"],
      warningsMaximum: alteredExpected["warningsMaximum"],
      chosenVariant: alteredExpected["chosenVariant"],
      variantOrder: alteredExpected["variantOrder"],
    },
    {
      realizations: 4,
      semanticOutputRecordsMaximum: 64,
      spellingAttemptsMaximum: 64,
      warningsMaximum: 1,
      chosenVariant: null,
      variantOrder: REVIEWED_ALTERED_DOMINANT_IDS,
    },
    "T1_CONTRACT_ALT_OPERATION",
    "operation-state-cases.json:T1-OPSTATE-003.expected",
    "Altered-dominant operation must expose all four variants without choosing one.",
    findings,
  );
  const directSpelling = cases.find((record) => idOf(record) === "T1-OPSTATE-001");
  requireExact(
    directSpelling && objectArray(directSpelling["evidenceRows"]),
    [
      {
        id: "T1-SPELL-EVIDENCE-SUCCESS",
        input: { root: { step: "D", alter: -1 }, degree: { number: 7, alter: -1 } },
        expectedResultRef: "T1-SPELL-001",
        expectedEvidence: {
          inputDegreeRecordsVisited: 0,
          formulaPhaseTransitions: 0,
          candidateDegreesObserved: 0,
          duplicateDegreesCanonicalized: 0,
          realizationsProduced: 0,
          spellingAttempts: 1,
          degreesProduced: 1,
          warningsProduced: 0,
          peakCandidateDegreeRecords: 0,
          termination: "complete",
        },
      },
      {
        id: "T1-SPELL-EVIDENCE-REFUSAL",
        input: { root: { step: "C", alter: 2 }, degree: { number: 9, alter: 1 } },
        expectedResultRef: "T1-SPELL-011",
        expectedEvidence: {
          inputDegreeRecordsVisited: 0,
          formulaPhaseTransitions: 0,
          candidateDegreesObserved: 0,
          duplicateDegreesCanonicalized: 0,
          realizationsProduced: 0,
          spellingAttempts: 1,
          degreesProduced: 0,
          warningsProduced: 0,
          peakCandidateDegreeRecords: 0,
          termination: "spelling-refusal",
        },
      },
    ],
    "T1_CONTRACT_DIRECT_SPELLING_EVIDENCE",
    "operation-state-cases.json:T1-OPSTATE-001.evidenceRows",
    "Standalone spelling success and refusal must freeze every evidence counter.",
    findings,
  );
  const evidenceMatrix = cases.find((record) => idOf(record) === "T1-OPSTATE-009");
  const evidenceRows = evidenceMatrix ? objectArray(evidenceMatrix["rows"]) : null;
  requireExact(
    evidenceMatrix?.["crossRealizationSchedule"],
    {
      construction: "phase-major then stable-realization-order through canonicalization",
      spelling: "after every realization completes canonicalization, stable-realization-order then canonical-degree-order",
      refusal: "stop at the first decisive refusal and count its entered phase or spelling attempt",
    },
    "T1_CONTRACT_EVIDENCE_SCHEDULE",
    "operation-state-cases.json:T1-OPSTATE-009.crossRealizationSchedule",
    "Altered-dominant cross-realization phase and spelling traversal changed.",
    findings,
  );
  requireExact(
    evidenceMatrix?.["counterSemantics"],
    {
      inputDegreeRecordsVisited: "non-null sixth plus each reached extensions, additions, alterations, and omissions source record during precedence preflight",
      formulaPhaseTransitions: "one when a realization enters a declared formula phase; preflight and family-selection refusal enters none",
      candidateDegreesObserved: "every candidate insertion, including an exact duplicate later canonicalized",
      duplicateDegreesCanonicalized: "candidate records removed as exact number-plus-alteration duplicates in phase 7",
      realizationsProduced: "immutable realization records present on the returned success branch; zero for every refusal",
      spellingAttempts: "degrees reached in realization then canonical-degree order, including the refusing attempt",
      degreesProduced: "semantic degree records present on the returned success branch; zero for every refusal",
      warningsProduced: "warnings present on the returned success branch; zero for every refusal",
      peakCandidateDegreeRecords: "largest simultaneous candidate-record count in one realization",
      termination: "the exact terminal branch after the counted work; no counter includes later work",
    },
    "T1_CONTRACT_EVIDENCE_SEMANTICS",
    "operation-state-cases.json:T1-OPSTATE-009.counterSemantics",
    "Resolution evidence counter semantics changed.",
    findings,
  );
  requireExact(
    evidenceRows?.map((row) => ({
      id: row["id"],
      inputRecipe: row["inputRecipe"],
      expectedResultRef: row["expectedResultRef"] ?? null,
      expectedRefusal: row["expectedRefusal"] ?? null,
      expectedEvidence: row["expectedEvidence"],
    })),
    [
      {
        id: "T1-EVIDENCE-COMPLETE",
        inputRecipe: { base: "C" },
        expectedResultRef: "T1-LIT-001",
        expectedRefusal: null,
        expectedEvidence: {
          inputDegreeRecordsVisited: 0,
          formulaPhaseTransitions: 8,
          candidateDegreesObserved: 3,
          duplicateDegreesCanonicalized: 0,
          realizationsProduced: 1,
          spellingAttempts: 3,
          degreesProduced: 3,
          warningsProduced: 0,
          peakCandidateDegreeRecords: 3,
          termination: "complete",
        },
      },
      {
        id: "T1-EVIDENCE-DUPLICATE-COMPLETE",
        inputRecipe: { base: "C11", additions: [{ number: 9, alter: 0 }] },
        expectedResultRef: "T1-LIT-079",
        expectedRefusal: null,
        expectedEvidence: {
          inputDegreeRecordsVisited: 2,
          formulaPhaseTransitions: 8,
          candidateDegreesObserved: 7,
          duplicateDegreesCanonicalized: 1,
          realizationsProduced: 1,
          spellingAttempts: 6,
          degreesProduced: 6,
          warningsProduced: 0,
          peakCandidateDegreeRecords: 7,
          termination: "complete",
        },
      },
      {
        id: "T1-EVIDENCE-WARNING-COMPLETE",
        inputRecipe: { base: "Csus4", omissions: [3] },
        expectedResultRef: "T1-LIT-055",
        expectedRefusal: null,
        expectedEvidence: {
          inputDegreeRecordsVisited: 1,
          formulaPhaseTransitions: 8,
          candidateDegreesObserved: 4,
          duplicateDegreesCanonicalized: 0,
          realizationsProduced: 1,
          spellingAttempts: 3,
          degreesProduced: 3,
          warningsProduced: 1,
          peakCandidateDegreeRecords: 3,
          termination: "complete",
        },
      },
      {
        id: "T1-EVIDENCE-CUSTOM-COMPLETE",
        inputRecipe: { customCaseRef: "T1-CUSTOM-002.input" },
        expectedResultRef: "T1-CUSTOM-002",
        expectedRefusal: null,
        expectedEvidence: {
          inputDegreeRecordsVisited: 0,
          formulaPhaseTransitions: 0,
          candidateDegreesObserved: 0,
          duplicateDegreesCanonicalized: 0,
          realizationsProduced: 1,
          spellingAttempts: 0,
          degreesProduced: 0,
          warningsProduced: 0,
          peakCandidateDegreeRecords: 0,
          termination: "complete",
        },
      },
      {
        id: "T1-EVIDENCE-ALTERED-COMPLETE",
        inputRecipe: { base: "C7alt" },
        expectedResultRef: "T1-LIT-045",
        expectedRefusal: null,
        expectedEvidence: {
          inputDegreeRecordsVisited: 0,
          formulaPhaseTransitions: 32,
          candidateDegreesObserved: 20,
          duplicateDegreesCanonicalized: 0,
          realizationsProduced: 4,
          spellingAttempts: 20,
          degreesProduced: 20,
          warningsProduced: 0,
          peakCandidateDegreeRecords: 5,
          termination: "complete",
        },
      },
      {
        id: "T1-EVIDENCE-ALTERED-NATURAL-NINE-COMPLETE",
        inputRecipe: { base: "C7alt", additions: [{ number: 9, alter: 0 }] },
        expectedResultRef: "T1-LIT-087",
        expectedRefusal: null,
        expectedEvidence: {
          inputDegreeRecordsVisited: 1,
          formulaPhaseTransitions: 32,
          candidateDegreesObserved: 24,
          duplicateDegreesCanonicalized: 0,
          realizationsProduced: 4,
          spellingAttempts: 24,
          degreesProduced: 24,
          warningsProduced: 0,
          peakCandidateDegreeRecords: 6,
          termination: "complete",
        },
      },
      {
        id: "T1-EVIDENCE-FORMULA-REFUSAL",
        inputRecipe: { base: "Cdim", sixth: { number: 6, alter: 0 } },
        expectedResultRef: "T1-LIT-070",
        expectedRefusal: null,
        expectedEvidence: {
          inputDegreeRecordsVisited: 1,
          formulaPhaseTransitions: 0,
          candidateDegreesObserved: 0,
          duplicateDegreesCanonicalized: 0,
          realizationsProduced: 0,
          spellingAttempts: 0,
          degreesProduced: 0,
          warningsProduced: 0,
          peakCandidateDegreeRecords: 0,
          termination: "formula-refusal",
        },
      },
      {
        id: "T1-EVIDENCE-SPELLING-REFUSAL",
        inputRecipe: {
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
        },
        expectedResultRef: null,
        expectedRefusal: {
          code: "theory.spelling_accidental_out_of_range",
          path: ["root"],
          phase: "spelling",
          degreeSpellingPolicyId: "changes.degree-spelling",
          degreeSpellingPolicyVersion: 1,
          root: { step: "E", alter: 2 },
          degree: { number: 3, alter: 0 },
          requiredAlteration: 3,
          minimum: -2,
          maximum: 2,
        },
        expectedEvidence: {
          inputDegreeRecordsVisited: 0,
          formulaPhaseTransitions: 8,
          candidateDegreesObserved: 3,
          duplicateDegreesCanonicalized: 0,
          realizationsProduced: 0,
          spellingAttempts: 2,
          degreesProduced: 0,
          warningsProduced: 0,
          peakCandidateDegreeRecords: 3,
          termination: "spelling-refusal",
        },
      },
      {
        id: "T1-EVIDENCE-ADDITION-SPELLING-REFUSAL",
        inputRecipe: {
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
        },
        expectedResultRef: null,
        expectedRefusal: {
          code: "theory.spelling_accidental_out_of_range",
          path: ["additions", 0],
          phase: "spelling",
          degreeSpellingPolicyId: "changes.degree-spelling",
          degreeSpellingPolicyVersion: 1,
          root: { step: "D", alter: 2 },
          degree: { number: 3, alter: 0 },
          requiredAlteration: 3,
          minimum: -2,
          maximum: 2,
        },
        expectedEvidence: {
          inputDegreeRecordsVisited: 1,
          formulaPhaseTransitions: 8,
          candidateDegreesObserved: 4,
          duplicateDegreesCanonicalized: 0,
          realizationsProduced: 0,
          spellingAttempts: 3,
          degreesProduced: 0,
          warningsProduced: 0,
          peakCandidateDegreeRecords: 4,
          termination: "spelling-refusal",
        },
      },
      {
        id: "T1-EVIDENCE-MODIFIER-SPELLING-REFUSAL",
        inputRecipe: {
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
        },
        expectedResultRef: null,
        expectedRefusal: {
          code: "theory.spelling_accidental_out_of_range",
          path: ["alterations", 0],
          phase: "spelling",
          degreeSpellingPolicyId: "changes.degree-spelling",
          degreeSpellingPolicyVersion: 1,
          root: { step: "C", alter: 2 },
          degree: { number: 9, alter: 1 },
          requiredAlteration: 3,
          minimum: -2,
          maximum: 2,
        },
        expectedEvidence: {
          inputDegreeRecordsVisited: 1,
          formulaPhaseTransitions: 8,
          candidateDegreesObserved: 5,
          duplicateDegreesCanonicalized: 0,
          realizationsProduced: 0,
          spellingAttempts: 5,
          degreesProduced: 0,
          warningsProduced: 0,
          peakCandidateDegreeRecords: 5,
          termination: "spelling-refusal",
        },
      },
      {
        id: "T1-EVIDENCE-ALTERED-SPELLING-REFUSAL",
        inputRecipe: {
          kind: "parsed",
          sourceText: "E##7alt",
          root: { step: "E", alter: 2 },
          triad: "major",
          sixth: null,
          seventh: "minor",
          extensions: [],
          additions: [],
          alterations: [],
          omissions: [],
          bass: null,
          colorPolicy: "altered-dominant",
        },
        expectedResultRef: null,
        expectedRefusal: {
          code: "theory.spelling_accidental_out_of_range",
          path: ["root"],
          phase: "spelling",
          degreeSpellingPolicyId: "changes.degree-spelling",
          degreeSpellingPolicyVersion: 1,
          root: { step: "E", alter: 2 },
          degree: { number: 3, alter: 0 },
          requiredAlteration: 3,
          minimum: -2,
          maximum: 2,
        },
        expectedEvidence: {
          inputDegreeRecordsVisited: 0,
          formulaPhaseTransitions: 29,
          candidateDegreesObserved: 20,
          duplicateDegreesCanonicalized: 0,
          realizationsProduced: 0,
          spellingAttempts: 2,
          degreesProduced: 0,
          warningsProduced: 0,
          peakCandidateDegreeRecords: 5,
          termination: "spelling-refusal",
        },
      },
      {
        id: "T1-EVIDENCE-OUTPUT-LIMIT-REFUSAL",
        inputRecipe: {
          base: "Cdim",
          additions: [
            { number: 2, alter: 0 },
            { number: 3, alter: 0 },
            { number: 4, alter: 0 },
            { number: 6, alter: 0 },
            { number: 9, alter: 0 },
            { number: 11, alter: 0 },
            { number: 13, alter: 0 },
          ],
          alterations: [
            { number: 5, alter: 1 },
            { number: 9, alter: -1 },
            { number: 9, alter: 1 },
            { number: 11, alter: -1 },
            { number: 11, alter: 1 },
            { number: 13, alter: -1 },
            { number: 13, alter: 1 },
          ],
        },
        expectedResultRef: null,
        expectedRefusal: {
          code: "limit.theory_realization_degrees_exceeded",
          path: [],
          phase: "canonicalization",
          ruleId: "base-diminished",
          received: 17,
          maximum: 16,
        },
        expectedEvidence: {
          inputDegreeRecordsVisited: 14,
          formulaPhaseTransitions: 7,
          candidateDegreesObserved: 17,
          duplicateDegreesCanonicalized: 0,
          realizationsProduced: 0,
          spellingAttempts: 0,
          degreesProduced: 0,
          warningsProduced: 0,
          peakCandidateDegreeRecords: 17,
          termination: "output-limit-refusal",
        },
      },
    ],
    "T1_CONTRACT_EVIDENCE_TERMINATION",
    "operation-state-cases.json:T1-OPSTATE-009.rows",
    "Complete, formula-refusal, spelling-refusal, and output-limit evidence rows changed.",
    findings,
  );
  requireExact(
    evidenceMatrix?.["expected"],
    {
      terminationInventory: ["complete", "formula-refusal", "spelling-refusal", "output-limit-refusal"],
      callableBranchInventory: [
        "spell-success",
        "spell-refusal",
        "parsed-literal-success",
        "parsed-duplicate-success",
        "parsed-warning-success",
        "parsed-altered-success",
        "parsed-altered-natural-nine-success",
        "custom-success",
        "formula-refusal",
        "parsed-literal-spelling-refusal",
        "parsed-explicit-addition-spelling-refusal",
        "parsed-explicit-alteration-spelling-refusal",
        "parsed-altered-spelling-refusal",
        "output-limit-refusal",
      ],
      allCountersAreNonnegativeSafeIntegers: true,
      workAfterTermination: 0,
      partialOutput: false,
    },
    "T1_CONTRACT_EVIDENCE_TERMINATION",
    "operation-state-cases.json:T1-OPSTATE-009.expected",
    "Evidence terminal inventory or no-work-after-termination guarantee changed.",
    findings,
  );
  const precedenceMatrix = cases.find((record) => idOf(record) === "T1-OPSTATE-010");
  const precedenceRows = precedenceMatrix ? objectArray(precedenceMatrix["rows"]) : null;
  if (precedenceRows !== null) {
    requireSortedUniqueIds(precedenceRows, "operation-state-cases.json:T1-OPSTATE-010.rows", findings);
  }
  requireExact(
    precedenceRows?.slice(0, 9).map((row) => ({
      id: row["id"],
      earlierCode: row["earlierCode"],
      laterCode: row["laterCode"],
      winnerCode: isObject(row["expectedWinner"]) ? row["expectedWinner"]["code"] : null,
    })),
    T1_REVIEWED_REFUSAL_PRECEDENCE.slice(0, -1).map((earlierCode, index) => ({
      id: `T1-PRECEDENCE-${String(index + 1).padStart(3, "0")}`,
      earlierCode,
      laterCode: T1_REVIEWED_REFUSAL_PRECEDENCE[index + 1],
      winnerCode: earlierCode,
    })),
    "T1_CONTRACT_REFUSAL_PRECEDENCE_TOURNAMENT",
    "operation-state-cases.json:T1-OPSTATE-010.rows[0..8]",
    "Every adjacent global refusal tier must be paired and the earlier tier must win.",
    findings,
  );
  requireExact(
    precedenceRows?.map((row) => ({ id: row["id"], inputRecipe: row["inputRecipe"] })),
    [
      { id: "T1-PRECEDENCE-001", inputRecipe: { base: "C", sixth: { number: 6, alter: -1 }, extensions: [{ number: 7, alter: 0 }] } },
      { id: "T1-PRECEDENCE-002", inputRecipe: { base: "Cm(maj7)", extensions: [{ number: 9, alter: 0 }], additions: [{ number: 1, alter: 0 }] } },
      { id: "T1-PRECEDENCE-003", inputRecipe: { base: "C", additions: [{ number: 1, alter: 0 }], alterations: [{ number: 3, alter: -1 }] } },
      { id: "T1-PRECEDENCE-004", inputRecipe: { base: "C7", alterations: [{ number: 3, alter: -1 }], omissions: [7] } },
      { id: "T1-PRECEDENCE-005", inputRecipe: { base: "C5", seventh: "minor", omissions: [7] } },
      { id: "T1-PRECEDENCE-006", inputRecipe: { base: "C5", seventh: "minor", colorPolicy: "altered-dominant" } },
      { id: "T1-PRECEDENCE-007", inputRecipe: { base: "C", colorPolicy: "altered-dominant", additions: [{ number: 3, alter: 0 }], omissions: [3] } },
      {
        id: "T1-PRECEDENCE-008",
        inputRecipe: {
          base: "Cdim",
          additions: [{ number: 2, alter: 0 }, { number: 3, alter: 0 }, { number: 4, alter: 0 }, { number: 6, alter: 0 }, { number: 9, alter: 0 }, { number: 11, alter: 0 }, { number: 13, alter: 0 }],
          alterations: [{ number: 5, alter: -1 }, { number: 5, alter: 1 }, { number: 9, alter: -1 }, { number: 9, alter: 1 }, { number: 11, alter: -1 }, { number: 11, alter: 1 }, { number: 13, alter: -1 }, { number: 13, alter: 1 }],
        },
      },
      {
        id: "T1-PRECEDENCE-009",
        inputRecipe: {
          base: "E##dim",
          additions: [{ number: 2, alter: 0 }, { number: 3, alter: 0 }, { number: 4, alter: 0 }, { number: 6, alter: 0 }, { number: 9, alter: 0 }, { number: 11, alter: 0 }, { number: 13, alter: 0 }],
          alterations: [{ number: 5, alter: 1 }, { number: 9, alter: -1 }, { number: 9, alter: 1 }, { number: 11, alter: -1 }, { number: 11, alter: 1 }, { number: 13, alter: -1 }, { number: 13, alter: 1 }],
        },
      },
      { id: "T1-PRECEDENCE-010", inputRecipe: { base: "C", additions: [{ number: 1, alter: 0 }, { number: 5, alter: 0 }] } },
      { id: "T1-PRECEDENCE-011", inputRecipe: { base: "C", sixth: { number: 6, alter: 0 }, seventh: "minor", extensions: [{ number: 9, alter: 0 }] } },
      { id: "T1-PRECEDENCE-012", inputRecipe: { base: "C", sixth: { number: 6, alter: 0 }, extensions: [{ number: 9, alter: 0 }], additions: [{ number: 3, alter: 0 }], omissions: [3] } },
      { id: "T1-PRECEDENCE-013", inputRecipe: { base: "C7", additions: [{ number: 3, alter: 0 }], alterations: [{ number: 5, alter: -1 }], omissions: [3, 5] } },
      { id: "T1-PRECEDENCE-014", inputRecipe: { base: "C7", alterations: [{ number: 5, alter: -1 }, { number: 5, alter: 1 }], omissions: [5] } },
    ],
    "T1_CONTRACT_REFUSAL_PRECEDENCE_RECIPE",
    "operation-state-cases.json:T1-OPSTATE-010.rows",
    "Every precedence contest requires its exact independently reviewed, duplicate-free source recipe.",
    findings,
  );
  const detectPrecedenceRecipe = (recipe: JsonObject): Readonly<{
    codes: ReadonlySet<string>;
    conflicts: ReadonlySet<string>;
  }> => {
    const codes = new Set<string>();
    const conflicts = new Set<string>();
    const base = typeof recipe["base"] === "string" ? recipe["base"] : "";
    const sixth = isObject(recipe["sixth"]) ? recipe["sixth"] : null;
    const extensions = objectArray(recipe["extensions"]) ?? [];
    const additions = objectArray(recipe["additions"]) ?? [];
    const alterations = objectArray(recipe["alterations"]) ?? [];
    const omissions = Array.isArray(recipe["omissions"]) ? recipe["omissions"] : [];
    if (sixth !== null && sixth["alter"] !== 0) codes.add("theory.sixth_invalid");
    if (
      extensions.length > T1_REVIEWED_LIMITS.extensions ||
      extensions.some((degree) => ![9, 11, 13].includes(Number(degree["number"])) || degree["alter"] !== 0) ||
      (base === "Cm(maj7)" && extensions.length > 0)
    ) {
      codes.add("theory.extension_invalid");
    }
    if (additions.some((degree) => ![2, 3, 4, 6, 9, 11, 13].includes(Number(degree["number"])) || degree["alter"] !== 0)) {
      codes.add("theory.addition_invalid");
    }
    if (alterations.some((degree) => ![5, 9, 11, 13].includes(Number(degree["number"])) || ![-1, 1].includes(Number(degree["alter"])))) {
      codes.add("theory.alteration_invalid");
    }
    if (omissions.some((number) => number !== 3 && number !== 5)) codes.add("theory.omission_invalid");
    if (base === "C5" && recipe["seventh"] !== undefined) codes.add("theory.formula_family_unsupported");
    if (recipe["colorPolicy"] === "altered-dominant" && base !== "C7") codes.add("theory.color_policy_invalid");
    if (sixth !== null && recipe["seventh"] !== undefined) conflicts.add("sixth-with-seventh");
    if (sixth !== null && extensions.length > 0) conflicts.add("sixth-with-extension");
    const additionNumbers = new Set(additions.map((degree) => degree["number"]));
    const alterationNumbers = new Set(alterations.map((degree) => degree["number"]));
    if (omissions.some((number) => additionNumbers.has(number))) conflicts.add("addition-omission");
    if (omissions.some((number) => alterationNumbers.has(number))) conflicts.add("alteration-omission");
    if (
      alterations.some((degree) => degree["number"] === 5 && degree["alter"] === -1) &&
      alterations.some((degree) => degree["number"] === 5 && degree["alter"] === 1)
    ) {
      conflicts.add("structural-alteration-pair");
    }
    if (conflicts.size > 0) codes.add("theory.modifier_conflict");
    const baseDegrees = base.includes("dim")
      ? ["1", "b3", "b5"]
      : base === "C5"
        ? ["1", "5"]
        : base.includes("m(maj7)")
          ? ["1", "b3", "5", "7"]
          : base.includes("7")
            ? ["1", "3", "5", "b7"]
            : ["1", "3", "5"];
    const candidateDegrees = new Set(baseDegrees);
    const tokenForDegree = (degree: JsonObject): string | null => {
      const number = degree["number"];
      const alter = degree["alter"];
      if (typeof number !== "number" || typeof alter !== "number") return null;
      return `${alter === -1 ? "b" : alter === 1 ? "#" : alter === 0 ? "" : String(alter)}${String(number)}`;
    };
    alterations.forEach((degree) => {
      const token = tokenForDegree(degree);
      if (token === null) return;
      candidateDegrees.delete(String(degree["number"]));
      candidateDegrees.add(token);
    });
    additions.forEach((degree) => {
      const token = tokenForDegree(degree);
      if (token !== null) candidateDegrees.add(token);
    });
    omissions.forEach((number) => {
      if (typeof number !== "number") return;
      for (const token of candidateDegrees) {
        if (Number(token.replace(/^[#b-]+/u, "")) === number) candidateDegrees.delete(token);
      }
    });
    if (candidateDegrees.size > T1_REVIEWED_LIMITS.degreesPerRealization) {
      codes.add("limit.theory_realization_degrees_exceeded");
    }
    if (base.includes("##")) codes.add("theory.spelling_accidental_out_of_range");
    return { codes, conflicts };
  };
  precedenceRows?.slice(0, 9).forEach((row, index) => {
    const recipe = isObject(row["inputRecipe"]) ? row["inputRecipe"] : {};
    const detected = detectPrecedenceRecipe(recipe).codes;
    if (!detected.has(String(row["earlierCode"])) || !detected.has(String(row["laterCode"]))) {
      findings.push({
        code: "T1_CONTRACT_REFUSAL_PRECEDENCE_RECIPE",
        path: `operation-state-cases.json:T1-OPSTATE-010.rows[${String(index)}].inputRecipe`,
        message: "An adjacent precedence recipe must independently trigger both named refusal tiers.",
      });
    }
  });
  const expectedConflictContests = [
    ["sixth-with-seventh", "sixth-with-extension"],
    ["sixth-with-extension", "addition-omission"],
    ["addition-omission", "alteration-omission"],
    ["alteration-omission", "structural-alteration-pair"],
  ];
  precedenceRows?.slice(10).forEach((row, index) => {
    const recipe = isObject(row["inputRecipe"]) ? row["inputRecipe"] : {};
    const detected = detectPrecedenceRecipe(recipe).conflicts;
    const contenders = expectedConflictContests[index] ?? [];
    if (!contenders.every((conflict) => detected.has(conflict))) {
      findings.push({
        code: "T1_CONTRACT_REFUSAL_PRECEDENCE_RECIPE",
        path: `operation-state-cases.json:T1-OPSTATE-010.rows[${String(index + 10)}].inputRecipe`,
        message: "A conflict-precedence recipe must independently trigger both adjacent conflict kinds.",
      });
    }
  });
  const sourceIndexRow = precedenceRows?.[9];
  const sourceIndexRecipe = sourceIndexRow && isObject(sourceIndexRow["inputRecipe"])
    ? sourceIndexRow["inputRecipe"]
    : {};
  const sourceIndexAdditions = objectArray(sourceIndexRecipe["additions"]) ?? [];
  const sourceIndexWinner = sourceIndexRow && isObject(sourceIndexRow["expectedWinner"])
    ? sourceIndexRow["expectedWinner"]
    : {};
  if (
    sourceIndexAdditions.length < 2 ||
    sourceIndexAdditions.some((degree) => [2, 3, 4, 6, 9, 11, 13].includes(Number(degree["number"]))) ||
    !sameJson(sourceIndexWinner["path"], ["additions", 0]) ||
    !sameJson(sourceIndexWinner["received"], sourceIndexAdditions[0])
  ) {
    findings.push({
      code: "T1_CONTRACT_REFUSAL_PRECEDENCE_RECIPE",
      path: "operation-state-cases.json:T1-OPSTATE-010.rows[9].inputRecipe",
      message: "The source-index tie must contain at least two invalid records and return the exact first record.",
    });
  }
  const winnerCore = (row: JsonObject): JsonObject => {
    const winner = isObject(row["expectedWinner"]) ? row["expectedWinner"] : {};
    return {
      id: row["id"],
      tie: row["tie"] ?? null,
      code: winner["code"],
      path: winner["path"],
      phase: winner["phase"],
      ruleId: winner["ruleId"],
      reason: winner["reason"] ?? null,
      conflict: winner["conflict"] ?? null,
      leftPath: winner["leftPath"] ?? null,
      rightPath: winner["rightPath"] ?? null,
      received: winner["received"] ?? null,
      maximum: winner["maximum"] ?? null,
      triad: winner["triad"] ?? null,
      seventh: winner["seventh"] ?? null,
      colorPolicy: winner["colorPolicy"] ?? null,
    };
  };
  requireExact(
    precedenceRows?.map(winnerCore),
    [
      { id: "T1-PRECEDENCE-001", tie: null, code: "theory.sixth_invalid", path: ["sixth"], phase: "base", ruleId: "base-major", reason: "alteration", conflict: null, leftPath: null, rightPath: null, received: { number: 6, alter: -1 }, maximum: null, triad: null, seventh: null, colorPolicy: null },
      { id: "T1-PRECEDENCE-002", tie: null, code: "theory.extension_invalid", path: ["extensions", 0], phase: "base", ruleId: "seventh-minor-major", reason: "family", conflict: null, leftPath: null, rightPath: null, received: { number: 9, alter: 0 }, maximum: null, triad: null, seventh: null, colorPolicy: null },
      { id: "T1-PRECEDENCE-003", tie: null, code: "theory.addition_invalid", path: ["additions", 0], phase: "additions", ruleId: "base-major", reason: "number", conflict: null, leftPath: null, rightPath: null, received: { number: 1, alter: 0 }, maximum: null, triad: null, seventh: null, colorPolicy: null },
      { id: "T1-PRECEDENCE-004", tie: null, code: "theory.alteration_invalid", path: ["alterations", 0], phase: "structural-alterations", ruleId: "seventh-dominant", reason: "number", conflict: null, leftPath: null, rightPath: null, received: { number: 3, alter: -1 }, maximum: null, triad: null, seventh: null, colorPolicy: null },
      { id: "T1-PRECEDENCE-005", tie: null, code: "theory.omission_invalid", path: ["omissions", 0], phase: "omissions", ruleId: "base-power", reason: "number", conflict: null, leftPath: null, rightPath: null, received: 7, maximum: null, triad: null, seventh: null, colorPolicy: null },
      { id: "T1-PRECEDENCE-006", tie: null, code: "theory.formula_family_unsupported", path: ["seventh"], phase: "base", ruleId: "base-power", reason: null, conflict: null, leftPath: null, rightPath: null, received: null, maximum: null, triad: "power", seventh: "minor", colorPolicy: "altered-dominant" },
      { id: "T1-PRECEDENCE-007", tie: null, code: "theory.color_policy_invalid", path: ["colorPolicy"], phase: "color-alterations", ruleId: "altered-dominant", reason: "requires-dominant-seventh", conflict: null, leftPath: null, rightPath: null, received: "altered-dominant", maximum: null, triad: null, seventh: null, colorPolicy: null },
      { id: "T1-PRECEDENCE-008", tie: null, code: "theory.modifier_conflict", path: ["alterations", 0], phase: "structural-alterations", ruleId: "base-diminished", reason: null, conflict: "structural-alteration-pair", leftPath: ["alterations", 0], rightPath: ["alterations", 1], received: null, maximum: null, triad: null, seventh: null, colorPolicy: null },
      { id: "T1-PRECEDENCE-009", tie: null, code: "limit.theory_realization_degrees_exceeded", path: [], phase: "canonicalization", ruleId: "base-diminished", reason: null, conflict: null, leftPath: null, rightPath: null, received: 17, maximum: 16, triad: null, seventh: null, colorPolicy: null },
      { id: "T1-PRECEDENCE-010", tie: "source-array-index", code: "theory.addition_invalid", path: ["additions", 0], phase: "additions", ruleId: "base-major", reason: "number", conflict: null, leftPath: null, rightPath: null, received: { number: 1, alter: 0 }, maximum: null, triad: null, seventh: null, colorPolicy: null },
      { id: "T1-PRECEDENCE-011", tie: "conflict-vocabulary", code: "theory.modifier_conflict", path: ["sixth"], phase: "base", ruleId: "sixth-major", reason: null, conflict: "sixth-with-seventh", leftPath: ["sixth"], rightPath: ["seventh"], received: null, maximum: null, triad: null, seventh: null, colorPolicy: null },
      { id: "T1-PRECEDENCE-012", tie: "conflict-vocabulary", code: "theory.modifier_conflict", path: ["sixth"], phase: "base", ruleId: "sixth-major", reason: null, conflict: "sixth-with-extension", leftPath: ["sixth"], rightPath: ["extensions", 0], received: null, maximum: null, triad: null, seventh: null, colorPolicy: null },
      { id: "T1-PRECEDENCE-013", tie: "conflict-vocabulary", code: "theory.modifier_conflict", path: ["additions", 0], phase: "additions", ruleId: "seventh-dominant", reason: null, conflict: "addition-omission", leftPath: ["additions", 0], rightPath: ["omissions", 0], received: null, maximum: null, triad: null, seventh: null, colorPolicy: null },
      { id: "T1-PRECEDENCE-014", tie: "conflict-vocabulary", code: "theory.modifier_conflict", path: ["alterations", 0], phase: "structural-alterations", ruleId: "seventh-dominant", reason: null, conflict: "alteration-omission", leftPath: ["alterations", 0], rightPath: ["omissions", 0], received: null, maximum: null, triad: null, seventh: null, colorPolicy: null },
    ],
    "T1_CONTRACT_REFUSAL_PRECEDENCE_TOURNAMENT",
    "operation-state-cases.json:T1-OPSTATE-010.rows",
    "Global, source-index, and conflict-vocabulary winners changed.",
    findings,
  );
  requireExact(
    precedenceMatrix?.["expected"],
    {
      adjacentGlobalPrecedencePairs: 9,
      adjacentConflictPrecedencePairs: 4,
      sourceIndexTieBreak: "lowest source array index",
      conflictTieBreakOrder: T1_REVIEWED_PUBLIC_CONTRACT.modifierConflictPrecedence,
      partialOutput: false,
    },
    "T1_CONTRACT_REFUSAL_PRECEDENCE_TOURNAMENT",
    "operation-state-cases.json:T1-OPSTATE-010.expected",
    "Precedence tournament completeness or no-partial-output guarantee changed.",
    findings,
  );
}

type MutationControlValidation = Readonly<{
  controls: readonly JsonObject[];
  directKillerLinks: number;
  corroborativeLinks: number;
  reviewedCaseLinks: number;
}>;

function validateMutationControls(
  root: JsonObject,
  linkedCaseIds: ReadonlySet<string>,
  findings: T1ContractFinding[],
): MutationControlValidation {
  const controls = objectArray(root["controls"]) ?? [];
  requireSortedUniqueIds(controls, "mutation-controls.json.controls", findings);
  if (controls.length !== REVIEWED_MUTATION_CONTROL_COUNT) {
    findings.push({ code: "T1_CONTRACT_MUTATION_COVERAGE", path: "mutation-controls.json.controls", message: `The reviewed T1 corpus requires exactly ${String(REVIEWED_MUTATION_CONTROL_COUNT)} semantic counterfactual controls.` });
  }
  requireExact(root["reviewState"], REVIEWED_MUTATION_REVIEW_STATE, "T1_CONTRACT_MUTATION_REVIEW_STATE", "mutation-controls.json.reviewState", "Mutation review-state declaration changed.", findings);
  requireExact(root["reviewedCaseLinkCount"], REVIEWED_MUTATION_CASE_LINK_COUNT, "T1_CONTRACT_MUTATION_CASE_LINK_CONSERVATION", "mutation-controls.json.reviewedCaseLinkCount", "Reviewed mutation case-link count changed.", findings);
  requireExact(root["reviewedCaseLinkOrderSha256"], REVIEWED_MUTATION_CASE_LINK_ORDER_SHA256, "T1_CONTRACT_MUTATION_CASE_LINK_CONSERVATION", "mutation-controls.json.reviewedCaseLinkOrderSha256", "Reviewed mutation case-link conservation digest changed.", findings);
  const requiredFaultFamilies = stringArray(root["requiredFaultFamilies"]);
  requireExact(requiredFaultFamilies, REVIEWED_MUTATION_FAULT_FAMILIES, "T1_CONTRACT_MUTATION_FAMILY", "mutation-controls.json.requiredFaultFamilies", "Reviewed mutation fault-family inventory changed.", findings);
  const observedFamilies = new Set<string>();
  const reviewedPairs: JsonObject[] = [];
  let directKillerLinks = 0;
  let corroborativeLinks = 0;
  const baseControlKeys = [
    "authorityIds",
    "expectedDetection",
    "faultFamily",
    "id",
    "killedByCaseIds",
    "mutatedFault",
    "operator",
    "traceIds",
  ];
  const classifiedControlKeys = [
    ...baseControlKeys,
    "corroboratedByCaseIds",
    "corroborativeLinks",
    "reviewedCaseLinkOrder",
  ].sort(codeUnitCompare);

  controls.forEach((record, index) => {
    const path = `mutation-controls.json.controls[${String(index)}]`;
    const controlId = idOf(record) ?? `invalid-control-${String(index)}`;
    const hasCorroborativeFields = [
      "corroboratedByCaseIds",
      "corroborativeLinks",
      "reviewedCaseLinkOrder",
    ].some((key) => Object.hasOwn(record, key));
    requireExact(
      Object.keys(record).sort(codeUnitCompare),
      hasCorroborativeFields ? classifiedControlKeys : baseControlKeys,
      "T1_CONTRACT_MUTATION_SHAPE",
      path,
      "Mutation controls must use the exact direct-only or split-classification field inventory.",
      findings,
    );

    const killedBy = requireUniqueStringRefs(record["killedByCaseIds"], `${path}.killedByCaseIds`, findings);
    if (killedBy.length === 0) {
      findings.push({
        code: "T1_CONTRACT_MUTATION_DIRECT_KILLER",
        path: `${path}.killedByCaseIds`,
        message: "Every semantic counterfactual requires at least one direct killer.",
      });
    }
    const corroboratedBy = hasCorroborativeFields
      ? requireUniqueStringRefs(record["corroboratedByCaseIds"], `${path}.corroboratedByCaseIds`, findings)
      : [];
    const corroborationRecords = hasCorroborativeFields
      ? objectArray(record["corroborativeLinks"])
      : [];
    if (hasCorroborativeFields && corroborationRecords === null) {
      findings.push({
        code: "T1_CONTRACT_MUTATION_CORROBORATIVE",
        path: `${path}.corroborativeLinks`,
        message: "Corroborative links must be an object array.",
      });
    }
    const reviewedOrder = hasCorroborativeFields
      ? requireUniqueStringRefs(record["reviewedCaseLinkOrder"], `${path}.reviewedCaseLinkOrder`, findings)
      : killedBy;
    const directSet = new Set(killedBy);
    const corroborativeSet = new Set(corroboratedBy);
    const overlap = killedBy.filter((caseId) => corroborativeSet.has(caseId));
    if (overlap.length > 0) {
      findings.push({
        code: "T1_CONTRACT_MUTATION_CLASSIFICATION",
        path,
        message: `Direct and corroborative case links must be disjoint; overlap ${JSON.stringify(overlap)}.`,
      });
    }
    const classifiedSet = new Set([...killedBy, ...corroboratedBy]);
    if (
      reviewedOrder.length !== killedBy.length + corroboratedBy.length ||
      reviewedOrder.some((caseId) => !classifiedSet.has(caseId)) ||
      classifiedSet.size !== reviewedOrder.length ||
      !sameJson(reviewedOrder.filter((caseId) => directSet.has(caseId)), killedBy) ||
      !sameJson(reviewedOrder.filter((caseId) => corroborativeSet.has(caseId)), corroboratedBy)
    ) {
      findings.push({
        code: "T1_CONTRACT_MUTATION_CASE_LINK_CONSERVATION",
        path: `${path}.reviewedCaseLinkOrder`,
        message: "Reviewed case-link order must be the exact interleaving of disjoint direct and corroborative links.",
      });
    }

    const linkRecords = corroborationRecords ?? [];
    linkRecords.forEach((link, linkIndex) => {
      const linkPath = `${path}.corroborativeLinks[${String(linkIndex)}]`;
      requireExact(
        Object.keys(link).sort(codeUnitCompare),
        ["caseId", "reason", "reasonCode"],
        "T1_CONTRACT_MUTATION_CORROBORATIVE",
        linkPath,
        "Every corroborative link requires exactly caseId, reasonCode, and reason.",
        findings,
      );
      if (
        typeof link["reasonCode"] !== "string" ||
        !REVIEWED_MUTATION_CORROBORATIVE_REASON_CODES.includes(
          link["reasonCode"] as (typeof REVIEWED_MUTATION_CORROBORATIVE_REASON_CODES)[number],
        )
      ) {
        findings.push({
          code: "T1_CONTRACT_MUTATION_REASON",
          path: `${linkPath}.reasonCode`,
          message: "Corroborative link uses an unreviewed reason code.",
        });
      }
      if (typeof link["reason"] !== "string" || link["reason"].trim().length === 0) {
        findings.push({
          code: "T1_CONTRACT_MUTATION_REASON",
          path: `${linkPath}.reason`,
          message: "Corroborative link requires a nonblank reviewed reason.",
        });
      }
    });
    requireExact(
      linkRecords.map((link) => link["caseId"]),
      corroboratedBy,
      "T1_CONTRACT_MUTATION_CORROBORATIVE",
      `${path}.corroborativeLinks`,
      "Corroborative reason records must match corroboratedByCaseIds exactly and in order.",
      findings,
    );
    requireExact(
      linkRecords,
      REVIEWED_MUTATION_CORROBORATIVE_LINKS[controlId] ?? [],
      "T1_CONTRACT_MUTATION_REASON",
      `${path}.corroborativeLinks`,
      "Every corroborative case must retain its exact reviewed reason code and rationale.",
      findings,
    );

    const family = record["faultFamily"];
    if (typeof family !== "string" || family.length === 0) {
      findings.push({ code: "T1_CONTRACT_MUTATION_FAMILY", path: `${path}.faultFamily`, message: "Every mutation control requires a stable fault family." });
    } else {
      observedFamilies.add(family);
      if (requiredFaultFamilies !== null && !requiredFaultFamilies.includes(family)) {
        findings.push({ code: "T1_CONTRACT_MUTATION_FAMILY", path: `${path}.faultFamily`, message: "Mutation control cites an undeclared fault family." });
      }
    }
    if (
      typeof record["operator"] !== "string" || record["operator"].trim().length === 0 ||
      typeof record["mutatedFault"] !== "string" || record["mutatedFault"].trim().length === 0 ||
      typeof record["expectedDetection"] !== "string" || record["expectedDetection"].trim().length === 0
    ) {
      findings.push({ code: "T1_CONTRACT_MUTATION_SHAPE", path, message: "Mutation control requires operator, fault, and expected-detection descriptions." });
    }
    for (const caseId of killedBy) {
      if (!linkedCaseIds.has(caseId)) {
        findings.push({ code: "T1_CONTRACT_MUTATION_KILLER", path: `${path}.killedByCaseIds`, message: `Unknown direct mutation-killing case ${JSON.stringify(caseId)}.` });
      }
    }
    for (const caseId of corroboratedBy) {
      if (!linkedCaseIds.has(caseId)) {
        findings.push({ code: "T1_CONTRACT_MUTATION_CORROBORATIVE", path: `${path}.corroboratedByCaseIds`, message: `Unknown corroborative case ${JSON.stringify(caseId)}.` });
      }
    }
    reviewedPairs.push(...reviewedOrder.map((caseId) => ({ controlId, caseId })));
    directKillerLinks += killedBy.length;
    corroborativeLinks += corroboratedBy.length;
  });
  for (const family of requiredFaultFamilies ?? []) {
    if (!observedFamilies.has(family)) {
      findings.push({ code: "T1_CONTRACT_MUTATION_FAMILY", path: "mutation-controls.json.controls", message: `Required fault family ${JSON.stringify(family)} has no reviewed control.` });
    }
  }

  const uniquePairCount = new Set(
    reviewedPairs.map((pair) => `${String(pair["controlId"])}\u0000${String(pair["caseId"])}`),
  ).size;
  const reviewedCaseLinkOrderSha256 = sha256(stableJson(reviewedPairs));
  if (
    reviewedPairs.length !== REVIEWED_MUTATION_CASE_LINK_COUNT ||
    uniquePairCount !== REVIEWED_MUTATION_CASE_LINK_COUNT ||
    reviewedCaseLinkOrderSha256 !== REVIEWED_MUTATION_CASE_LINK_ORDER_SHA256
  ) {
    findings.push({
      code: "T1_CONTRACT_MUTATION_CASE_LINK_CONSERVATION",
      path: "mutation-controls.json.controls",
      message: `Reviewed case links must remain ${String(REVIEWED_MUTATION_CASE_LINK_COUNT)} unique ordered pairs with semantic SHA-256 ${REVIEWED_MUTATION_CASE_LINK_ORDER_SHA256}; observed ${String(reviewedPairs.length)} pairs, ${String(uniquePairCount)} unique, ${reviewedCaseLinkOrderSha256}.`,
    });
  }
  if (directKillerLinks !== REVIEWED_MUTATION_DIRECT_KILLER_LINK_COUNT) {
    findings.push({
      code: "T1_CONTRACT_MUTATION_DIRECT_KILLER",
      path: "mutation-controls.json.controls",
      message: `Expected exactly ${String(REVIEWED_MUTATION_DIRECT_KILLER_LINK_COUNT)} direct killer links; observed ${String(directKillerLinks)}.`,
    });
  }
  if (corroborativeLinks !== REVIEWED_MUTATION_CORROBORATIVE_LINK_COUNT) {
    findings.push({
      code: "T1_CONTRACT_MUTATION_CORROBORATIVE",
      path: "mutation-controls.json.controls",
      message: `Expected exactly ${String(REVIEWED_MUTATION_CORROBORATIVE_LINK_COUNT)} corroborative links; observed ${String(corroborativeLinks)}.`,
    });
  }

  requireExact(
    controls.map((record) => ({
      id: record["id"],
      killedByCaseIds: record["killedByCaseIds"],
      corroboratedByCaseIds: Object.hasOwn(record, "corroboratedByCaseIds")
        ? record["corroboratedByCaseIds"]
        : [],
    })),
    REVIEWED_MUTATION_SEMANTICS.map((record) => ({
      id: record["id"],
      killedByCaseIds: record["killedByCaseIds"],
      corroboratedByCaseIds: Object.hasOwn(record, "corroboratedByCaseIds")
        ? record["corroboratedByCaseIds"]
        : [],
    })),
    "T1_CONTRACT_MUTATION_CLASSIFICATION",
    "mutation-controls.json.controls",
    "Every reviewed case link must retain its exact direct-killer or corroborative classification.",
    findings,
  );

  requireExact(
    controls.map((record) => {
      const hasClassificationFields = [
        "corroboratedByCaseIds",
        "corroborativeLinks",
        "reviewedCaseLinkOrder",
      ].some((key) => Object.hasOwn(record, key));
      return {
        id: record["id"],
        faultFamily: record["faultFamily"],
        operator: record["operator"],
        mutatedFault: record["mutatedFault"],
        killedByCaseIds: record["killedByCaseIds"],
        ...(hasClassificationFields
          ? {
              corroboratedByCaseIds: record["corroboratedByCaseIds"],
              corroborativeLinks: record["corroborativeLinks"],
              reviewedCaseLinkOrder: record["reviewedCaseLinkOrder"],
            }
          : {}),
        expectedDetection: record["expectedDetection"],
      };
    }),
    REVIEWED_MUTATION_SEMANTICS,
    "T1_CONTRACT_MUTATION_SEMANTICS",
    "mutation-controls.json.controls",
    "Every reviewed mutation must retain its exact operator semantics, direct killers, corroborative evidence, reasons, and conserved link order.",
    findings,
  );
  requireExact(
    ["T1-MUT-048", "T1-MUT-049", "T1-MUT-051", "T1-MUT-052", "T1-MUT-053"].map((id) => {
      const record = controls.find((candidate) => idOf(candidate) === id) ?? {};
      return {
        id,
        faultFamily: record["faultFamily"],
        operator: record["operator"],
        killedByCaseIds: record["killedByCaseIds"],
      };
    }),
    [
      { id: "T1-MUT-048", faultFamily: "canonicalization", operator: "retain-cross-category-exact-duplicate", killedByCaseIds: ["T1-LAW-007", "T1-LIT-079"] },
      { id: "T1-MUT-049", faultFamily: "output-limit", operator: "permit-seventeen-degree-realization", killedByCaseIds: ["T1-LIT-080", "T1-OPSTATE-009"] },
      { id: "T1-MUT-051", faultFamily: "strict-family-refusal", operator: "fallback-unsupported-family-to-nearest-rule", killedByCaseIds: ["T1-FAMILY-STATE-MATRIX-001", "T1-LAW-012", "T1-LIT-060", "T1-LIT-061", "T1-LIT-071"] },
      { id: "T1-MUT-052", faultFamily: "modifier-order", operator: "reverse-global-refusal-precedence", killedByCaseIds: ["T1-OPSTATE-010"] },
      { id: "T1-MUT-053", faultFamily: "degree-spelling", operator: "handle-only-formula-emitted-degree-identities", killedByCaseIds: ["T1-SPELL-PUBLIC-MATRIX-001"] },
    ],
    "T1_CONTRACT_MUTATION_TARGET",
    "mutation-controls.json.controls",
    "Duplicate-merge, output-limit, strict-family, refusal-precedence, and public-degree-spelling mutations require their exact independent killers.",
    findings,
  );
  return {
    controls,
    directKillerLinks,
    corroborativeLinks,
    reviewedCaseLinks: reviewedPairs.length,
  };
}

function emptyCounts(): T1ContractValidationReport["counts"] {
  return {
    companions: 0,
    formulaRules: 0,
    modifierRules: 0,
    alteredDominantVariants: 0,
    roots: 0,
    familySeeds: 0,
    allRootCells: 0,
    allRootDegreeSpellings: 0,
    publicDegreeSpellingCells: 0,
    literalPlanCases: 0,
    spellingCases: 0,
    customCases: 0,
    lawCases: 0,
    operationStateCases: 0,
    totalLinkedCases: 0,
    traces: 0,
    authorities: 0,
    mutationControls: 0,
    mutationDirectKillerLinks: 0,
    mutationCorroborativeLinks: 0,
    mutationReviewedCaseLinks: 0,
  };
}

export async function validateT1Contract(
  fixtureRoot = DEFAULT_FIXTURE_ROOT,
): Promise<T1ContractValidationReport> {
  const findings: T1ContractFinding[] = [];
  const fixtures = new Map<T1FixtureFilename, ParsedFixture>();
  let entries: string[] = [];
  try {
    entries = (await readdir(fixtureRoot)).sort(codeUnitCompare);
  } catch (error) {
    findings.push({
      code: "T1_CONTRACT_FILE_SET",
      path: fixtureRoot,
      message: `Unable to read fixture directory: ${String(error)}`,
    });
  }
  requireExact(
    entries,
    [...EXPECTED_FILES].sort(codeUnitCompare),
    "T1_CONTRACT_FILE_SET",
    fixtureRoot,
    "Resolution fixture directory must contain exactly the eleven reviewed files and no other entries.",
    findings,
  );
  for (const filename of EXPECTED_FILES) {
    let source: string;
    try {
      source = await readFile(join(fixtureRoot, filename), "utf8");
    } catch (error) {
      findings.push({
        code: "T1_CONTRACT_FILE_SET",
        path: filename,
        message: `Unable to read required fixture: ${String(error)}`,
      });
      continue;
    }
    for (const duplicate of duplicateJsonKeys(source)) {
      findings.push({
        code: "T1_CONTRACT_DUPLICATE_KEY",
        path: `${filename}:${duplicate}`,
        message: "Duplicate decoded JSON object key is forbidden.",
      });
    }
    let decoded: unknown;
    try {
      decoded = JSON.parse(source) as unknown;
    } catch (error) {
      findings.push({
        code: "T1_CONTRACT_JSON_PARSE",
        path: filename,
        message: `Invalid JSON: ${String(error)}`,
      });
      continue;
    }
    if (!isObject(decoded)) {
      findings.push({
        code: "T1_CONTRACT_JSON_PARSE",
        path: filename,
        message: "Fixture root must be a JSON object.",
      });
      continue;
    }
    const fixture: ParsedFixture = {
      filename,
      root: decoded,
      byteDigest: sha256(source),
      semanticDigest: sha256(stableJson(decoded)),
    };
    fixtures.set(filename, fixture);
    requireExact(
      decoded["schema"],
      EXPECTED_SCHEMAS[filename],
      "T1_CONTRACT_SCHEMA",
      `${filename}.schema`,
      `Expected schema ${JSON.stringify(EXPECTED_SCHEMAS[filename])}.`,
      findings,
    );
    requireExact(
      decoded["fixtureVersion"],
      REVIEWED_FIXTURE_VERSIONS[filename],
      "T1_CONTRACT_FIXTURE_VERSION",
      `${filename}.fixtureVersion`,
      "Every T1 fixture must use its reviewed corpus version.",
      findings,
    );
    const topLevelKeys = EXPECTED_TOP_LEVEL_KEYS[filename];
    requireExact(
      Object.keys(decoded).sort(codeUnitCompare),
      [...topLevelKeys].sort(codeUnitCompare),
      "T1_CONTRACT_SCHEMA",
      filename,
      "Top-level field inventory changed.",
      findings,
    );
    if (decoded["productionOutputUsed"] !== false || decoded["expectedValuesGenerated"] !== false) {
      findings.push({
        code: "T1_CONTRACT_INDEPENDENCE",
        path: filename,
        message: "Every T1 fixture must reject production output and generated expectations as authority.",
      });
    }
    validateIndependenceFlags(decoded, [filename], findings);
    const expectedByteDigest = EXPECTED_BYTE_DIGESTS[filename];
    const expectedSemanticDigest = EXPECTED_SEMANTIC_DIGESTS[filename];
    if (expectedByteDigest === null || expectedSemanticDigest === null) {
      findings.push({
        code: "T1_CONTRACT_DIGEST_NOT_FROZEN",
        path: filename,
        message: "Reviewed byte and semantic digests are pending final fixture-corpus handoff.",
      });
    } else {
      if (fixture.byteDigest !== expectedByteDigest) {
        findings.push({ code: "T1_CONTRACT_BYTE_DIGEST", path: filename, message: `Reviewed byte digest mismatch: ${fixture.byteDigest}.` });
      }
      if (fixture.semanticDigest !== expectedSemanticDigest) {
        findings.push({ code: "T1_CONTRACT_SEMANTIC_DIGEST", path: filename, message: `Reviewed semantic digest mismatch: ${fixture.semanticDigest}.` });
      }
    }
  }

  const contract = fixtures.get(CONTRACT_FILENAME)?.root;
  const formulaRoot = fixtures.get("formula-rules.json")?.root;
  const allRoot = fixtures.get("all-root-cases.json")?.root;
  const literal = fixtures.get("literal-cases.json")?.root;
  const spelling = fixtures.get("spelling-cases.json")?.root;
  const custom = fixtures.get("custom-cases.json")?.root;
  const laws = fixtures.get("law-cases.json")?.root;
  const operationStates = fixtures.get("operation-state-cases.json")?.root;
  const traceLedger = fixtures.get("trace-ledger.json")?.root;
  const provenance = fixtures.get("provenance-ledger.json")?.root;
  const mutationLedger = fixtures.get("mutation-controls.json")?.root;

  if (contract !== undefined) validateManifest(contract, findings);
  if (formulaRoot !== undefined) validateFormulaRules(formulaRoot, findings);
  const matrixMetrics = allRoot === undefined
    ? { cells: 0, degreeSpellings: 0 }
    : validateAllRootCases(allRoot, findings);
  if (literal !== undefined) validateLiteralCases(literal, findings);
  const publicDegreeSpellingCells = spelling === undefined
    ? 0
    : validateSpellingCases(spelling, findings);
  if (custom !== undefined) validateCustomCases(custom, findings);
  if (operationStates !== undefined) validateOperationStates(operationStates, findings);

  const linkedCases = [
    ...collectLinkedCases(contract, "t1-resolution-contract.json", ["knownPlanCorrections"], findings),
    ...collectLinkedCases(formulaRoot, "formula-rules.json", ["rules", "alteredDominantVariants", "modifierRules"], findings),
    ...linkedObject(formulaRoot?.["familyStateMatrix"], "formula-rules.json.familyStateMatrix", findings),
    ...collectLinkedCases(allRoot, "all-root-cases.json", ["roots", "familySeeds"], findings),
    ...linkedObject(allRoot?.["matrixCase"], "all-root-cases.json.matrixCase", findings),
    ...collectLinkedCases(literal, "literal-cases.json", ["cases"], findings),
    ...collectLinkedCases(spelling, "spelling-cases.json", ["cases"], findings),
    ...linkedObject(spelling?.["publicDegreeMatrix"], "spelling-cases.json.publicDegreeMatrix", findings),
    ...collectLinkedCases(custom, "custom-cases.json", ["cases"], findings),
    ...collectLinkedCases(laws, "law-cases.json", ["cases"], findings),
    ...collectLinkedCases(operationStates, "operation-state-cases.json", ["cases"], findings),
  ];
  const linkedCaseIds = new Set(linkedCases.map((record) => record.id));
  const mutationValidation = mutationLedger === undefined
    ? {
        controls: [],
        directKillerLinks: 0,
        corroborativeLinks: 0,
        reviewedCaseLinks: 0,
      }
    : validateMutationControls(mutationLedger, linkedCaseIds, findings);
  const controls = mutationValidation.controls;
  const controlIds = new Set(controls.map(idOf).filter((id): id is string => id !== null));
  if (laws !== undefined) validateLawCases(laws, literal, linkedCaseIds, controlIds, findings);

  const traces = objectArray(traceLedger?.["traces"]) ?? [];
  const authorities = objectArray(provenance?.["authorities"]) ?? [];
  requireSortedUniqueIds(traces, "trace-ledger.json.traces", findings);
  requireSortedUniqueIds(authorities, "provenance-ledger.json.authorities", findings);
  validateLedgerPolicies(traceLedger, provenance, traces, authorities, findings);
  validateAuthorityPolicy(authorities, findings);
  validateTraceAuthorityLinks(linkedCases, traces, authorities, controls, findings);

  const formulaRules = objectArray(formulaRoot?.["rules"]) ?? [];
  const modifierRules = objectArray(formulaRoot?.["modifierRules"]) ?? [];
  const variants = objectArray(formulaRoot?.["alteredDominantVariants"]) ?? [];
  const roots = objectArray(allRoot?.["roots"]) ?? [];
  const seeds = objectArray(allRoot?.["familySeeds"]) ?? [];
  const literalCases = objectArray(literal?.["cases"]) ?? [];
  const spellingCases = objectArray(spelling?.["cases"]) ?? [];
  const customCases = objectArray(custom?.["cases"]) ?? [];
  const lawCases = objectArray(laws?.["cases"]) ?? [];
  const operationStateCases = objectArray(operationStates?.["cases"]) ?? [];
  findings.sort(findingOrder);
  return {
    schema: "changes.validation.t1-contract.v1",
    package: "T1",
    outcome: findings.length === 0 ? "pass" : "fail",
    counts: {
      companions: Math.max(0, fixtures.size - 1),
      formulaRules: formulaRules.length,
      modifierRules: modifierRules.length,
      alteredDominantVariants: variants.length,
      roots: roots.length,
      familySeeds: seeds.length,
      allRootCells: matrixMetrics.cells,
      allRootDegreeSpellings: matrixMetrics.degreeSpellings,
      publicDegreeSpellingCells,
      literalPlanCases: literalCases.length,
      spellingCases: spellingCases.length,
      customCases: customCases.length,
      lawCases: lawCases.length,
      operationStateCases: operationStateCases.length,
      totalLinkedCases: linkedCases.length,
      traces: traces.length,
      authorities: authorities.length,
      mutationControls: controls.length,
      mutationDirectKillerLinks: mutationValidation.directKillerLinks,
      mutationCorroborativeLinks: mutationValidation.corroborativeLinks,
      mutationReviewedCaseLinks: mutationValidation.reviewedCaseLinks,
    },
    findings,
  };
}

function cliFixtureRoot(args: readonly string[]): string | null {
  if (args.length === 0) return DEFAULT_FIXTURE_ROOT;
  if (args.length === 1 && args[0] !== undefined) return args[0];
  if (args.length === 2 && args[0] === "--fixture-root" && args[1] !== undefined) return args[1];
  return null;
}

if (import.meta.main) {
  const fixtureRoot = cliFixtureRoot(process.argv.slice(2));
  if (fixtureRoot === null) {
    const report: T1ContractValidationReport = {
      schema: "changes.validation.t1-contract.v1",
      package: "T1",
      outcome: "fail",
      counts: emptyCounts(),
      findings: [{
        code: "T1_CLI_ARGUMENTS",
        path: "$argv",
        message: "Usage: bun scripts/validate-t1-contract.ts [<fixture-root> | --fixture-root <directory>]",
      }],
    };
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = 2;
  } else {
    try {
      const report = await validateT1Contract(fixtureRoot);
      console.log(JSON.stringify(report, null, 2));
      process.exitCode = report.outcome === "pass" ? 0 : 1;
    } catch (error) {
      const report: T1ContractValidationReport = {
        schema: "changes.validation.t1-contract.v1",
        package: "T1",
        outcome: "fail",
        counts: emptyCounts(),
        findings: [{
          code: "T1_VALIDATOR_TOOL_FAILURE",
          path: "$tool",
          message: error instanceof Error ? error.message : "Unknown validator failure.",
        }],
      };
      console.log(JSON.stringify(report, null, 2));
      process.exitCode = 2;
    }
  }
}
