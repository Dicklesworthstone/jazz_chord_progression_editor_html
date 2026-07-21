import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type JsonObject = Record<string, unknown>;

export type H0ContractFinding = Readonly<{
  code: string;
  path: string;
  message: string;
}>;

export type H0ContractValidationReport = Readonly<{
  schema: "changes.validation.h0-contract.v1";
  package: "H0";
  outcome: "pass" | "fail";
  counts: Readonly<{
    companions: number;
    sourceRoots: number;
    sourceChords: number;
    sourceContexts: number;
    analysisRules: number;
    literalFactCases: number;
    contextReadingCases: number;
    romanRootModeSeeds: number;
    romanRootModeCells: number;
    scaleMappings: number;
    scaleCases: number;
    scaleRootPolarityCells: number;
    transpositionCases: number;
    lawCases: number;
    limitRows: number;
    operationStateCases: number;
    mutationControls: number;
    authorities: number;
    traces: number;
  }>;
  findings: readonly H0ContractFinding[];
}>;

export type H0ContractValidationOptions = Readonly<{
  enforceDigests?: boolean;
}>;

const CONTRACT_FILENAME = "h0-harmony-analysis-contract.json" as const;

export const H0_REVIEWED_COMPANIONS = Object.freeze([
  "source-catalog.json",
  "analysis-rules.json",
  "literal-fact-cases.json",
  "context-reading-cases.json",
  "roman-root-mode-matrix.json",
  "chord-scale-mappings.json",
  "chord-scale-cases.json",
  "transposition-cases.json",
  "law-cases.json",
  "limit-cases.json",
  "operation-state-cases.json",
  "mutation-controls.json",
  "provenance-ledger.json",
  "trace-ledger.json",
] as const);

const EXPECTED_FILES = [CONTRACT_FILENAME, ...H0_REVIEWED_COMPANIONS] as const;
type H0FixtureFilename = (typeof EXPECTED_FILES)[number];

const DEFAULT_FIXTURE_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../tests/fixtures/harmony-analysis",
);

const EXPECTED_SCHEMAS: Readonly<Record<H0FixtureFilename, string>> = {
  "h0-harmony-analysis-contract.json":
    "changes.fixtures.h0-harmony-analysis-contract.v1",
  "source-catalog.json": "changes.fixtures.h0-source-catalog.v1",
  "analysis-rules.json": "changes.fixtures.h0-analysis-rules.v1",
  "literal-fact-cases.json": "changes.fixtures.h0-literal-fact-cases.v1",
  "context-reading-cases.json":
    "changes.fixtures.h0-context-reading-cases.v1",
  "roman-root-mode-matrix.json":
    "changes.fixtures.h0-roman-root-mode-matrix.v1",
  "chord-scale-mappings.json":
    "changes.fixtures.h0-chord-scale-mappings.v1",
  "chord-scale-cases.json": "changes.fixtures.h0-chord-scale-cases.v1",
  "transposition-cases.json":
    "changes.fixtures.h0-transposition-cases.v1",
  "law-cases.json": "changes.fixtures.h0-law-cases.v1",
  "limit-cases.json": "changes.fixtures.h0-limit-cases.v1",
  "operation-state-cases.json":
    "changes.fixtures.h0-operation-state-cases.v1",
  "mutation-controls.json": "changes.fixtures.h0-mutation-controls.v1",
  "provenance-ledger.json": "changes.fixtures.h0-provenance-ledger.v1",
  "trace-ledger.json": "changes.fixtures.h0-trace-ledger.v1",
};

const EXPECTED_TOP_LEVEL_KEYS: Readonly<
  Record<H0FixtureFilename, readonly string[]>
> = {
  "h0-harmony-analysis-contract.json": [
    "analysisRuleIds",
    "classifications",
    "contextPolicy",
    "degreeContainment",
    "dispositions",
    "evidenceTiers",
    "expectedInventoryMinimums",
    "expectedValuesGenerated",
    "fixtureVersion",
    "identity",
    "independence",
    "limits",
    "literalMatchWeights",
    "nonRefusalSuccesses",
    "operationIds",
    "productionOutputUsed",
    "readingOrder",
    "refusalCodes",
    "scaleFamilies",
    "scaleMappingRuleIds",
    "scaleOptionOrder",
    "schema",
    "status",
  ],
  "source-catalog.json": [
    "chords",
    "contexts",
    "expectedValuesGenerated",
    "fixtureVersion",
    "independenceStatement",
    "productionOutputUsed",
    "rootInventory",
    "schema",
    "t1AuthoritySnapshot",
    "t1DegreeTokenVocabulary",
    "t1ReferenceOwners",
  ],
  "analysis-rules.json": [
    "authorityIds",
    "expectedValuesGenerated",
    "fixtureVersion",
    "proofOwnership",
    "productionOutputUsed",
    "rules",
    "schema",
    "tableId",
    "tableVersion",
  ],
  "literal-fact-cases.json": [
    "cases",
    "expectedValuesGenerated",
    "fixtureVersion",
    "productionOutputUsed",
    "schema",
    "traceIds",
  ],
  "context-reading-cases.json": [
    "cases",
    "expectedValuesGenerated",
    "fixturePolicy",
    "fixtureVersion",
    "productionOutputUsed",
    "schema",
    "traceIds",
  ],
  "roman-root-mode-matrix.json": [
    "enharmonicStressRows",
    "expectedValuesGenerated",
    "fixtureVersion",
    "independentOracle",
    "matrix",
    "modeSeeds",
    "productionOutputUsed",
    "rootInventoryRefs",
    "schema",
    "traceIds",
  ],
  "chord-scale-mappings.json": [
    "containmentPolicy",
    "expectedValuesGenerated",
    "fixtureVersion",
    "mappings",
    "proofOwnership",
    "productionOutputUsed",
    "schema",
    "tableId",
    "tableVersion",
    "traceIds",
  ],
  "chord-scale-cases.json": [
    "cases",
    "expectedValuesGenerated",
    "fixtureVersion",
    "productionOutputUsed",
    "rootExpansion",
    "schema",
    "traceIds",
  ],
  "transposition-cases.json": [
    "cases",
    "expectedValuesGenerated",
    "fixtureVersion",
    "independenceStatement",
    "productionOutputUsed",
    "reviewedRootTranspositionsFromC",
    "schema",
    "traceIds",
  ],
  "law-cases.json": [
    "expectedValuesGenerated",
    "fixtureVersion",
    "laws",
    "productionOutputUsed",
    "proofPolicy",
    "schema",
    "traceIds",
  ],
  "limit-cases.json": [
    "boundaryMatrixId",
    "boundaryRows",
    "combinedPrecedenceCases",
    "expectedValuesGenerated",
    "fixtureVersion",
    "productionOutputUsed",
    "schema",
    "terminationEvidence",
    "traceIds",
  ],
  "operation-state-cases.json": [
    "cases",
    "expectedValuesGenerated",
    "fixtureVersion",
    "productionOutputUsed",
    "refusalPrecedence",
    "schema",
    "states",
    "traceIds",
  ],
  "mutation-controls.json": [
    "controls",
    "expectedValuesGenerated",
    "fixtureVersion",
    "productionOutputUsed",
    "requiredFaultFamilies",
    "reviewPolicy",
    "reviewState",
    "schema",
    "traceIds",
  ],
  "provenance-ledger.json": [
    "allowedAuthorityClasses",
    "authoringStatement",
    "authorities",
    "decisionLedger",
    "expectedValuesGenerated",
    "expertReviewClaimed",
    "fixtureVersion",
    "independenceRules",
    "productionOutputUsed",
    "schema",
  ],
  "trace-ledger.json": [
    "expectedValuesGenerated",
    "fixtureVersion",
    "productionOutputUsed",
    "reciprocityPolicy",
    "schema",
    "stableTraceIdsOnly",
    "traces",
  ],
};

const EXPECTED_FIXTURE_VERSION = "1.0.0";

export const H0_REVIEWED_OPERATION_IDS = Object.freeze([
  "deriveLiteralFacts",
  "analyzeChordInContext",
  "enumerateChordScaleOptions",
] as const);

export const H0_REVIEWED_EVIDENCE_TIERS = Object.freeze([
  "exact",
  "strong",
  "plausible",
  "speculative",
] as const);

export const H0_REVIEWED_DISPOSITIONS = Object.freeze([
  "classified",
  "ambiguous",
  "unclassified",
  "not-applicable",
] as const);

export const H0_REVIEWED_CLASSIFICATIONS = Object.freeze([
  "diatonic",
  "chromatic-roman",
  "ordinary-dominant",
  "secondary-dominant",
  "secondary-leading-tone",
  "tritone-substitute",
  "backdoor-dominant",
  "modal-mixture",
  "passing-diminished",
  "modal",
  "nonfunctional",
  "unresolved",
] as const);

export const H0_REVIEWED_ANALYSIS_RULE_IDS = Object.freeze([
  "h0.literal-facts",
  "h0.roman.diatonic-major",
  "h0.roman.diatonic-natural-minor",
  "h0.roman.diatonic-harmonic-minor",
  "h0.roman.diatonic-melodic-minor",
  "h0.roman.chromatic",
  "h0.function.ordinary-dominant",
  "h0.function.secondary-dominant",
  "h0.function.secondary-leading-tone",
  "h0.function.tritone-substitute",
  "h0.function.backdoor-dominant",
  "h0.function.parallel-mixture",
  "h0.function.passing-diminished",
  "h0.outcome.modal",
  "h0.outcome.nonfunctional",
  "h0.outcome.unresolved",
] as const);

export const H0_REVIEWED_SCALE_FAMILIES = Object.freeze([
  "ionian",
  "lydian",
  "mixolydian",
  "lydian-dominant",
  "altered",
  "whole-tone",
  "half-whole-diminished",
  "whole-half-diminished",
  "dorian",
  "melodic-minor",
  "locrian",
  "locrian-natural-2",
] as const);

export const H0_REVIEWED_SCALE_MAPPING_RULE_IDS = Object.freeze([
  "h0.scale.ionian",
  "h0.scale.lydian",
  "h0.scale.mixolydian",
  "h0.scale.lydian-dominant",
  "h0.scale.altered",
  "h0.scale.whole-tone",
  "h0.scale.half-whole-diminished",
  "h0.scale.whole-half-diminished",
  "h0.scale.dorian",
  "h0.scale.melodic-minor",
  "h0.scale.locrian",
  "h0.scale.locrian-natural-2",
  "h0.scale.suspended-dominant",
] as const);

export const H0_REVIEWED_REFUSAL_CODES = Object.freeze([
  "harmony.request_id_invalid",
  "harmony.base_revision_invalid",
  "harmony.selected_realization_required",
  "harmony.selected_realization_unknown",
  "harmony.upstream_contract_version_unsupported",
  "harmony.rule_version_unsupported",
  "harmony.duplicate_event_id",
  "limit.harmony_context_events_exceeded",
  "limit.harmony_readings_exceeded",
  "limit.harmony_scale_options_exceeded",
  "limit.harmony_evidence_records_exceeded",
  "limit.harmony_work_exceeded",
] as const);

export const H0_REVIEWED_REFUSAL_PRECEDENCE = Object.freeze([
  "harmony.request_id_invalid",
  "harmony.base_revision_invalid",
  "harmony.upstream_contract_version_unsupported",
  "harmony.rule_version_unsupported",
  "harmony.selected_realization_required",
  "harmony.selected_realization_unknown",
  "harmony.duplicate_event_id",
  "limit.harmony_context_events_exceeded",
  "limit.harmony_readings_exceeded",
  "limit.harmony_scale_options_exceeded",
  "limit.harmony_evidence_records_exceeded",
  "limit.harmony_work_exceeded",
] as const);

export const H0_REVIEWED_LIMITS = Object.freeze({
  contextEvents: 3,
  previousEvents: 1,
  nextEvents: 1,
  t1Resolutions: 3,
  contextEdges: 2,
  selectedRealizationDegrees: 16,
  scaleDegrees: 8,
  readings: 12,
  scaleOptions: 12,
  evidencePerReading: 16,
  counterevidencePerReading: 8,
  missingEvidencePerReading: 8,
  limitations: 8,
  ruleIdsPerReading: 8,
  matchComponents: 16,
  tensionsPerOption: 8,
  clashesPerOption: 8,
  exceptionsPerOption: 8,
  requestIdAsciiCharacters: 64,
  analysisRuleEvaluations: 16,
  scaleMappingEvaluations: 13,
  degreeComparisons: 4096,
  emittedRecords: 512,
  trackedRecords: 1024,
  baseRevision: "nonnegative-safe-integer",
} as const);

export const H0_REVIEWED_AUTHORITY_CLASSES = Object.freeze([
  "reviewed-project-contract",
  "upstream-reviewed-contract",
  "project-policy",
  "published-reference",
] as const);

const H0_REVIEWED_AUTHORITY_IDS = Object.freeze([
  "H0-AUTH-PLAN",
  "H0-AUTH-IDEA-WIZARD",
  "H0-AUTH-T1",
  "H0-AUTH-PROJECT-POLICY",
  "H0-AUTH-OMT-APPLIED",
  "H0-AUTH-OMT-MIXTURE",
  "H0-AUTH-OMT-FUNCTION-CAVEAT",
] as const);

const H0_REVIEWED_TRACE_IDS = Object.freeze([
  "H0-TRACE-LITERAL",
  "H0-TRACE-SPELLING",
  "H0-TRACE-ROMAN",
  "H0-TRACE-MODES",
  "H0-TRACE-DOMINANT",
  "H0-TRACE-LEADING",
  "H0-TRACE-TRITONE",
  "H0-TRACE-BACKDOOR",
  "H0-TRACE-MIXTURE",
  "H0-TRACE-PASSING",
  "H0-TRACE-NOKEY",
  "H0-TRACE-OUTCOMES",
  "H0-TRACE-EVIDENCE",
  "H0-TRACE-ORDERING",
  "H0-TRACE-SCALES",
  "H0-TRACE-CONTAINMENT",
  "H0-TRACE-CLASHES",
  "H0-TRACE-SUSPENSION",
  "H0-TRACE-ALTERED",
  "H0-TRACE-PLURAL",
  "H0-TRACE-TRANSPOSITION",
  "H0-TRACE-CUSTOM",
  "H0-TRACE-LIMITS",
  "H0-TRACE-REFUSALS",
  "H0-TRACE-VERSIONS",
  "H0-TRACE-OPERATIONS",
  "H0-TRACE-DETERMINISM",
  "H0-TRACE-LAWS",
  "H0-TRACE-MUTATIONS",
  "H0-TRACE-INDEPENDENCE",
] as const);

const H0_REVIEWED_OPERATION_STATES = Object.freeze([
  "applicable",
  "not-applicable",
  "refused",
] as const);

const H0_REVIEWED_ANALYSIS_TABLE_IDENTITY = Object.freeze({
  tableId: "changes.harmony-analysis-rules",
  tableVersion: 1,
  authorityIds: [
    "H0-AUTH-PLAN",
    "H0-AUTH-OMT-APPLIED",
    "H0-AUTH-OMT-MIXTURE",
    "H0-AUTH-PROJECT-POLICY",
  ],
} as const);

const H0_REVIEWED_SCALE_TABLE_IDENTITY = Object.freeze({
  tableId: "changes.chord-scale-mappings",
  tableVersion: 1,
  containmentPolicy: {
    id: "changes.degree-class-containment",
    version: 1,
    compoundEquivalenceClasses: [[2, 9], [4, 11], [6, 13]],
    sameAlterationRequired: true,
    pitchClassOnlyMatchForbidden: true,
    clashesRemainVisibleWhenAnExceptionMakesTheTensionAvailable: true,
  },
} as const);

const H0_REVIEWED_TRACE_RECIPROCITY_POLICY = Object.freeze({
  everyTraceIdAppearsInAtLeastOneOwningFixtureRoot: true,
  everyTraceReferencesExistingCasesOrStableMatrixIds: true,
  everyJudgmentTraceReferencesAuthority: true,
  everyMutationTraceLinksLawAndKiller: true,
  productionOutputMayNotCertifyTrace: true,
} as const);

const H0_REVIEWED_MUTATION_IDS = Object.freeze(
  Array.from(
    { length: 25 },
    (_, index) => `H0-MUT-${String(index + 1).padStart(3, "0")}`,
  ),
);

/**
 * Independently reviewed semantic fingerprints for the normative row payloads.
 * These remain active when whole-packet digest enforcement is disabled so a
 * hostile test cannot mutate musical law and then "repair" its references.
 */
const H0_REVIEWED_ANALYSIS_RULES_DIGEST =
  "b11408fb067783a1ec61ebfe5ce993288797bb2668d3c7f4b7fc0e8040305a31";
const H0_REVIEWED_SCALE_MAPPINGS_DIGEST =
  "4b69936f3cf7eba5321dba168cbd76d2fd91e9e44630b0f4861461a1d87c1f5e";
const H0_REVIEWED_LAWS_DIGEST =
  "0f3d1df6998e1717c51573c637e2fb0848683cb7c19c9e9e7bd24ff8583c7241";
const H0_REVIEWED_MUTATION_CONTROLS_DIGEST =
  "714f26a49202f1bcde165588108af5c4809dc1a5d1dbbce9aecfd8d79ffa4907";
const H0_REVIEWED_ANALYSIS_PROOF_OWNERSHIP_DIGEST =
  "13f1511a4b94185d65d6ca34e3433d4640d3b2c12d90c08652d1d402c1ad56b6";
const H0_REVIEWED_SCALE_PROOF_OWNERSHIP_DIGEST =
  "240314a5a7db4f2c33394dabfcc40de4ad7cb8c882acb653d3392070ad4419b2";

const H0_REVIEWED_FAULT_FAMILIES = Object.freeze([
  "dominant-precedence",
  "target-motion",
  "target-quality",
  "enharmonic-spelling",
  "roman-spelling",
  "diatonic-quality",
  "no-key",
  "legitimate-outcomes",
  "evidence-tier",
  "match-weights",
  "containment",
  "plurality",
  "scale-predicate",
  "clash",
  "suspension",
  "degree-identity",
  "altered-selection",
  "scale-family-distinction",
  "limits",
  "ordering",
  "versions",
  "mode-collection",
  "adjacency",
] as const);

const H0_TRACE_BEARING_FILES = Object.freeze([
  "literal-fact-cases.json",
  "context-reading-cases.json",
  "roman-root-mode-matrix.json",
  "chord-scale-mappings.json",
  "chord-scale-cases.json",
  "transposition-cases.json",
  "law-cases.json",
  "limit-cases.json",
  "operation-state-cases.json",
  "mutation-controls.json",
] as const satisfies readonly H0FixtureFilename[]);

const H0_REVIEWED_PLANNED_PRODUCTION_OWNERS = Object.freeze([
  "src/theory/harmony-analysis.ts",
  "src/theory/chord-scales.ts",
] as const);

const H0_REVIEWED_PLANNED_EVIDENCE_TEST_OWNERS = Object.freeze([
  "tests/conformance/h0-harmony-analysis.test.ts",
  "tests/property/h0-harmony-laws.test.ts",
] as const);

const H0_REVIEWED_FILE_TRACE_IDS = Object.freeze({
  "literal-fact-cases.json": [
    "H0-TRACE-LITERAL",
    "H0-TRACE-SPELLING",
    "H0-TRACE-EVIDENCE",
    "H0-TRACE-ALTERED",
    "H0-TRACE-CUSTOM",
  ],
  "context-reading-cases.json": [
    "H0-TRACE-SPELLING",
    "H0-TRACE-ROMAN",
    "H0-TRACE-DOMINANT",
    "H0-TRACE-LEADING",
    "H0-TRACE-TRITONE",
    "H0-TRACE-BACKDOOR",
    "H0-TRACE-MIXTURE",
    "H0-TRACE-PASSING",
    "H0-TRACE-NOKEY",
    "H0-TRACE-OUTCOMES",
    "H0-TRACE-EVIDENCE",
    "H0-TRACE-ORDERING",
    "H0-TRACE-DETERMINISM",
  ],
  "roman-root-mode-matrix.json": [
    "H0-TRACE-ROMAN",
    "H0-TRACE-MODES",
    "H0-TRACE-TRANSPOSITION",
    "H0-TRACE-SPELLING",
  ],
  "chord-scale-mappings.json": [
    "H0-TRACE-SCALES",
    "H0-TRACE-CONTAINMENT",
    "H0-TRACE-CLASHES",
    "H0-TRACE-SUSPENSION",
    "H0-TRACE-ALTERED",
  ],
  "chord-scale-cases.json": [
    "H0-TRACE-SCALES",
    "H0-TRACE-CONTAINMENT",
    "H0-TRACE-CLASHES",
    "H0-TRACE-SUSPENSION",
    "H0-TRACE-ALTERED",
    "H0-TRACE-PLURAL",
    "H0-TRACE-TRANSPOSITION",
  ],
  "transposition-cases.json": [
    "H0-TRACE-SPELLING",
    "H0-TRACE-ROMAN",
    "H0-TRACE-SCALES",
    "H0-TRACE-CONTAINMENT",
    "H0-TRACE-ALTERED",
    "H0-TRACE-TRANSPOSITION",
  ],
  "law-cases.json": [
    "H0-TRACE-LAWS",
    "H0-TRACE-MUTATIONS",
    "H0-TRACE-TRANSPOSITION",
  ],
  "limit-cases.json": [
    "H0-TRACE-LIMITS",
    "H0-TRACE-REFUSALS",
    "H0-TRACE-DETERMINISM",
  ],
  "operation-state-cases.json": [
    "H0-TRACE-NOKEY",
    "H0-TRACE-CUSTOM",
    "H0-TRACE-LIMITS",
    "H0-TRACE-REFUSALS",
    "H0-TRACE-VERSIONS",
    "H0-TRACE-OPERATIONS",
    "H0-TRACE-DETERMINISM",
  ],
  "mutation-controls.json": [
    "H0-TRACE-MUTATIONS",
    "H0-TRACE-LAWS",
    "H0-TRACE-INDEPENDENCE",
  ],
} as const satisfies Readonly<
  Record<(typeof H0_TRACE_BEARING_FILES)[number], readonly string[]>
>);

const H0_REVIEWED_ALL_ROOT_TRANSPOSITION_IDS = Object.freeze(
  Array.from(
    { length: 16 },
    (_, index) => `H0-TRANS-${String(index + 1).padStart(3, "0")}`,
  ),
);

const H0_REVIEWED_MODE_RULES = Object.freeze({
  major: "h0.roman.diatonic-major",
  "natural-minor": "h0.roman.diatonic-natural-minor",
  "harmonic-minor": "h0.roman.diatonic-harmonic-minor",
  "melodic-minor": "h0.roman.diatonic-melodic-minor",
} as const);

const H0_REVIEWED_MODE_ROOT_DEGREES = Object.freeze({
  major: ["1", "2", "3", "4", "5", "6", "7"],
  "natural-minor": ["1", "2", "b3", "4", "5", "b6", "b7"],
  "harmonic-minor": ["1", "2", "b3", "4", "5", "b6", "7"],
  "melodic-minor": ["1", "2", "b3", "4", "5", "6", "7"],
} as const);

const H0_REVIEWED_T1_AUTHORITY_SNAPSHOT = Object.freeze({
  contractSchema: "changes.theory.resolution-contract.v1",
  resolvedChordSchema: "changes.theory.resolved-chord.v1",
  formulaTableId: "changes.chord-formulas",
  formulaTableVersion: 1,
  degreeSpellingPolicyId: "changes.degree-spelling",
  degreeSpellingPolicyVersion: 1,
  degreeRolePolicyId: "changes.balanced-degree-roles",
  degreeRolePolicyVersion: 1,
  semanticRealizationIds: [
    "literal",
    "alt-b9-b5",
    "alt-b9-sharp5",
    "alt-sharp9-b5",
    "alt-sharp9-sharp5",
  ],
  customRealizationId: "custom",
} as const);

const H0_REVIEWED_T1_DEGREE_TOKEN_VOCABULARY = Object.freeze([
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
] as const);

const H0_REVIEWED_T1_FORMULA_RULE_IDS = Object.freeze([
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

const H0_REVIEWED_SOURCE_ROW_DIGESTS = Object.freeze({
  roots: "e7073313f37a0c0fb38b4ef018a3c41ef78d90dd436fc62c8b24828422795a9d",
  chords: "f224b1f8697c771b2931c04a54bb26661de80f9fedfbe6c0a3163eaeaac8cf9d",
  contexts: "2e1cf8baca248ef7d5101dd4872cf6beb09b02d5a10b180cad9bbe678742897a",
} as const);

const H0_REVIEWED_MODE_SEED_DIGEST =
  "b318096353786b18fc12e3d1e82210cfd7f251f78205f8eef2ff9185888d54a5";
const H0_REVIEWED_ENHARMONIC_STRESS_DIGEST =
  "71b4271319dd97ee9ae50efe9c64d2bbe8834b408de0163e19a098ffe7cb2668";
const H0_REVIEWED_LITERAL_CASES_DIGEST =
  "646ed2438575bc85fc3b8da52fe38bea56a97b07d613c575bbca3c16cc1a9ce0";
const H0_REVIEWED_CONTEXT_CASES_DIGEST =
  "6b35fb2e82908b2edbf0443a62f19393484e3097ccdf967945d78ef99aad7996";
const H0_REVIEWED_SCALE_CASES_DIGEST =
  "c990aa7d638aeb05d4b1711a2b3709fee3163ea69177be4dd0e6c80d5e579c24";
const H0_REVIEWED_TRACE_ROWS_DIGEST =
  "3944049d92f87df8bf622c2165cdf508d4438101203742babc9e0f1c5f0a48fb";

const H0_REVIEWED_CONTEXT_FIXTURE_POLICY = Object.freeze({
  adjacency: "immediate-only",
  expectedOrdering: "contract-strength-then-classification-then-stable-ties",
  proseIsNotComparisonKey: true,
} as const);

const H0_REVIEWED_ROMAN_INDEPENDENT_ORACLE = Object.freeze({
  stepOrder: ["C", "D", "E", "F", "G", "A", "B"],
  rootDegreeRowsAuthoredAbove: true,
  pitchClassProjectionOccursOnlyAfterSpelledDegreeDerivation: true,
  productionAnalyzerImported: false,
} as const);

const H0_REVIEWED_TRANSPOSITION_INDEPENDENCE_STATEMENT =
  "The interval inventory is reviewed declarative input. Expected classifications and degree identities are not produced by a transposition or analysis implementation.";

const H0_REVIEWED_SOURCE_INDEPENDENCE_STATEMENT =
  "Roots, degree spellings, contexts, and expected relationships were authored as reviewed data from the project contract and cited references. t1AuthoritySnapshot records frozen schema and policy identity metadata only; it is not imported resolver output and did not generate an expected value. No production resolver or H0 analyzer was executed to create this catalog.";

const H0_REVIEWED_ROOT_TRANSPOSITIONS = Object.freeze([
  { rootId: "H0-ROOT-001", interval: { diatonicSteps: 0, semitones: 0 } },
  { rootId: "H0-ROOT-002", interval: { diatonicSteps: 1, semitones: 1 } },
  { rootId: "H0-ROOT-003", interval: { diatonicSteps: 1, semitones: 2 } },
  { rootId: "H0-ROOT-004", interval: { diatonicSteps: 2, semitones: 3 } },
  { rootId: "H0-ROOT-005", interval: { diatonicSteps: 2, semitones: 4 } },
  { rootId: "H0-ROOT-006", interval: { diatonicSteps: 3, semitones: 5 } },
  { rootId: "H0-ROOT-007", interval: { diatonicSteps: 3, semitones: 6 } },
  { rootId: "H0-ROOT-008", interval: { diatonicSteps: 4, semitones: 7 } },
  { rootId: "H0-ROOT-009", interval: { diatonicSteps: 5, semitones: 8 } },
  { rootId: "H0-ROOT-010", interval: { diatonicSteps: 5, semitones: 9 } },
  { rootId: "H0-ROOT-011", interval: { diatonicSteps: 6, semitones: 10 } },
  { rootId: "H0-ROOT-012", interval: { diatonicSteps: 6, semitones: 11 } },
] as const);

const H0_REVIEWED_TRANSPOSITION_CASE_DIGEST =
  "92c37d2373ada6180fadaab1c8d65335cac2d14fdaba6a38d7635039d8e1f2d9";

const H0_REVIEWED_SCALE_POLARITY_SEEDS = Object.freeze([
  { mappingRuleId: "h0.scale.ionian", family: "ionian", positiveCaseId: "H0-SCALE-ION-001", nearMissCaseId: "H0-SCALE-ION-NEAR-001" },
  { mappingRuleId: "h0.scale.lydian", family: "lydian", positiveCaseId: "H0-SCALE-LYD-001", nearMissCaseId: "H0-SCALE-LYD-NEAR-001" },
  { mappingRuleId: "h0.scale.mixolydian", family: "mixolydian", positiveCaseId: "H0-SCALE-MIX-001", nearMissCaseId: "H0-SCALE-MIX-NEAR-001" },
  { mappingRuleId: "h0.scale.lydian-dominant", family: "lydian-dominant", positiveCaseId: "H0-SCALE-LYDDOM-001", nearMissCaseId: "H0-SCALE-LYDDOM-NEAR-001" },
  { mappingRuleId: "h0.scale.altered", family: "altered", positiveCaseId: "H0-SCALE-ALT-001", nearMissCaseId: "H0-SCALE-ALT-NEAR-002" },
  { mappingRuleId: "h0.scale.whole-tone", family: "whole-tone", positiveCaseId: "H0-SCALE-WT-001", nearMissCaseId: "H0-SCALE-WT-NEAR-001" },
  { mappingRuleId: "h0.scale.half-whole-diminished", family: "half-whole-diminished", positiveCaseId: "H0-SCALE-HW-001", nearMissCaseId: "H0-SCALE-HW-NEAR-001" },
  { mappingRuleId: "h0.scale.whole-half-diminished", family: "whole-half-diminished", positiveCaseId: "H0-SCALE-WH-001", nearMissCaseId: "H0-SCALE-WH-NEAR-001" },
  { mappingRuleId: "h0.scale.dorian", family: "dorian", positiveCaseId: "H0-SCALE-DOR-001", nearMissCaseId: "H0-SCALE-DOR-NEAR-001" },
  { mappingRuleId: "h0.scale.melodic-minor", family: "melodic-minor", positiveCaseId: "H0-SCALE-MM-001", nearMissCaseId: "H0-SCALE-MM-NEAR-001" },
  { mappingRuleId: "h0.scale.locrian", family: "locrian", positiveCaseId: "H0-SCALE-LOC-001", nearMissCaseId: "H0-SCALE-LOC-NEAR-001" },
  { mappingRuleId: "h0.scale.locrian-natural-2", family: "locrian-natural-2", positiveCaseId: "H0-SCALE-LOCN2-001", nearMissCaseId: "H0-SCALE-LOCN2-NEAR-001" },
  { mappingRuleId: "h0.scale.suspended-dominant", family: "mixolydian", positiveCaseId: "H0-SCALE-SUS-001", nearMissCaseId: "H0-SCALE-SUS-NEAR-001" },
] as const);

const H0_REVIEWED_IDENTITY = Object.freeze({
  contractSchema: "changes.theory.harmony-analysis-contract.v1",
  chordScaleContractSchema: "changes.theory.chord-scales-contract.v1",
  literalFactsResultSchema: "changes.theory.harmony-literal-facts-result.v1",
  analysisResultSchema: "changes.theory.harmony-analysis-result.v1",
  chordScaleResultSchema: "changes.theory.chord-scales-result.v1",
  analysisTableId: "changes.harmony-analysis-rules",
  analysisTableVersion: 1,
  scaleTableId: "changes.chord-scale-mappings",
  scaleTableVersion: 1,
  evidencePolicyId: "changes.harmony-evidence-tiers",
  evidencePolicyVersion: 1,
  orderPolicyId: "changes.harmony-analysis-order",
  orderPolicyVersion: 1,
  exactWeightPolicyId: "changes.harmony-exact-weight",
  exactWeightPolicyVersion: 1,
  containmentPolicyId: "changes.degree-class-containment",
  containmentPolicyVersion: 1,
} as const);

const H0_REVIEWED_CONTEXT_POLICY = Object.freeze({
  adjacency: "immediate-previous-and-immediate-next-only",
  secondaryTarget: "immediate-next-root-must-be-a-nontonic-diatonic-degree",
  ordinaryDominant:
    "tonic-target-is-ordinary-even-when-secondary-pattern-also-matches",
  passingDiminished:
    "fully-diminished-seventh-between-immediate-stepwise-outer-roots-with-target-relative-spelling",
  absentKey:
    "successful-unclassified-or-contextual-reading-never-inferred-or-persisted",
  customChord: "successful-not-applicable-with-custom.no_degree_analysis",
  melodicMinorCollection: ["1", "2", "b3", "4", "5", "6", "7"],
  melodicMinorInterpretation: "fixed-harmonic-use-of-the-ascending-collection",
} as const);

const H0_REVIEWED_READING_ORDER = Object.freeze({
  strength: H0_REVIEWED_EVIDENCE_TIERS,
  classification: [
    "diatonic",
    "ordinary-dominant",
    "secondary-dominant",
    "secondary-leading-tone",
    "tritone-substitute",
    "backdoor-dominant",
    "modal-mixture",
    "passing-diminished",
    "chromatic-roman",
    "modal",
    "nonfunctional",
    "unresolved",
  ],
  remainingTieBreaks: [
    "romanLabel",
    "ruleId",
    "governingTargetEventId",
    "readingId",
  ],
  pluralReadingsPreserved: true,
} as const);

const H0_REVIEWED_SCALE_OPTION_ORDER = Object.freeze({
  strength: H0_REVIEWED_EVIDENCE_TIERS,
  family: H0_REVIEWED_SCALE_FAMILIES,
  remainingTieBreaks: ["mappingRuleId", "optionId"],
  uniqueScaleClaimForbiddenWhenMultipleCompatible: true,
} as const);

const H0_REVIEWED_NON_REFUSAL_SUCCESSES = Object.freeze([
  "absent-key",
  "ambiguous-reading",
  "unclassified-reading",
  "modal-context",
  "declared-nonfunctional-context",
  "custom-no-degree-analysis",
] as const);

const H0_REVIEWED_OPERATION_STATE_CASES = Object.freeze([
  {
    id: "H0-OP-STATE-001",
    operation: "deriveLiteralFacts",
    setup: {
      requestId: "literal-001",
      baseRevision: 0,
      sourceId: "H0-SRC-CMAJ7",
    },
    expected: {
      state: "applicable",
      disposition: "classified",
      refusal: null,
    },
  },
  {
    id: "H0-OP-STATE-002",
    operation: "analyzeChordInContext",
    setup: {
      requestId: "no-key-001",
      baseRevision: 0,
      sourceId: "H0-SRC-D7",
      contextId: "H0-CONTEXT-NO-KEY",
    },
    expected: {
      state: "applicable",
      disposition: "unclassified",
      refusal: null,
      keyPersisted: false,
    },
  },
  {
    id: "H0-OP-STATE-003",
    operation: "enumerateChordScaleOptions",
    setup: {
      requestId: "custom-001",
      baseRevision: 0,
      sourceId: "H0-SRC-CUSTOM",
    },
    expected: {
      state: "not-applicable",
      disposition: "not-applicable",
      limitations: ["custom.no_degree_analysis", "custom.no_auto_voicing"],
      refusal: null,
    },
  },
  {
    id: "H0-OP-STATE-004",
    operation: "enumerateChordScaleOptions",
    setup: {
      requestId: "alt-001",
      baseRevision: 0,
      sourceId: "H0-SRC-CALT-B9-B5",
      selectedRealizationId: "alt-b9-b5",
    },
    expected: {
      state: "applicable",
      selectedRealizationId: "alt-b9-b5",
      otherRealizationsMerged: false,
    },
  },
  {
    id: "H0-OP-STATE-005",
    operation: "enumerateChordScaleOptions",
    setup: {
      requestId: "alt-missing",
      baseRevision: 0,
      sourceId: "H0-SRC-CALT-B9-B5",
      selectedRealizationId: null,
    },
    expected: {
      state: "refused",
      refusal: {
        code: "harmony.selected_realization_required",
        path: ["selectedRealizationId"],
      },
    },
  },
  {
    id: "H0-OP-STATE-006",
    operation: "enumerateChordScaleOptions",
    setup: {
      requestId: "alt-unknown",
      baseRevision: 0,
      sourceId: "H0-SRC-CALT-B9-B5",
      selectedRealizationId: "alt-not-present",
    },
    expected: {
      state: "refused",
      refusal: {
        code: "harmony.selected_realization_unknown",
        path: ["selectedRealizationId"],
      },
    },
  },
  {
    id: "H0-OP-STATE-007",
    operation: "analyzeChordInContext",
    setup: {
      requestId: "upstream-v2",
      baseRevision: 0,
      sourceId: "H0-SRC-C7",
      t1ContractVersion: 2,
    },
    expected: {
      state: "refused",
      refusal: {
        code: "harmony.upstream_contract_version_unsupported",
        path: ["source", "schema"],
      },
    },
  },
  {
    id: "H0-OP-STATE-008",
    operation: "analyzeChordInContext",
    setup: {
      requestId: "rules-v2",
      baseRevision: 0,
      sourceId: "H0-SRC-C7",
      analysisTableVersion: 2,
    },
    expected: {
      state: "refused",
      refusal: {
        code: "harmony.rule_version_unsupported",
        path: ["analysisTableVersion"],
      },
    },
  },
  {
    id: "H0-OP-STATE-009",
    operation: "deriveLiteralFacts",
    setup: {
      requestIdLength: 64,
      requestIdAlphabet: "ASCII",
      baseRevision: 0,
      sourceId: "H0-SRC-CMAJ7",
    },
    expected: { state: "applicable", boundary: "N" },
  },
  {
    id: "H0-OP-STATE-010",
    operation: "deriveLiteralFacts",
    setup: {
      requestIdLength: 65,
      requestIdAlphabet: "ASCII",
      baseRevision: 0,
      sourceId: "H0-SRC-CMAJ7",
    },
    expected: {
      state: "refused",
      boundary: "N+1",
      refusal: { code: "harmony.request_id_invalid", path: ["requestId"] },
    },
  },
  {
    id: "H0-OP-STATE-011",
    operation: "deriveLiteralFacts",
    setup: {
      requestId: "revision-max",
      baseRevision: Number.MAX_SAFE_INTEGER,
      sourceId: "H0-SRC-CMAJ7",
    },
    expected: {
      state: "applicable",
      boundary: "N",
      baseRevisionPreserved: Number.MAX_SAFE_INTEGER,
    },
  },
  {
    id: "H0-OP-STATE-012",
    operation: "deriveLiteralFacts",
    setup: {
      requestId: "revision-over",
      baseRevision: Number.MAX_SAFE_INTEGER + 1,
      sourceId: "H0-SRC-CMAJ7",
    },
    expected: {
      state: "refused",
      boundary: "N+1",
      refusal: {
        code: "harmony.base_revision_invalid",
        path: ["baseRevision"],
      },
    },
  },
  {
    id: "H0-OP-STATE-013",
    operation: "deriveLiteralFacts",
    setup: {
      requestId: "revision-negative",
      baseRevision: -1,
      sourceId: "H0-SRC-CMAJ7",
    },
    expected: {
      state: "refused",
      refusal: {
        code: "harmony.base_revision_invalid",
        path: ["baseRevision"],
      },
    },
  },
  {
    id: "H0-OP-STATE-014",
    operation: "analyzeChordInContext",
    setup: {
      requestId: "duplicate-events",
      baseRevision: 0,
      events: [
        { id: "evt-duplicate", sourceId: "H0-SRC-CMAJ7" },
        { id: "evt-duplicate", sourceId: "H0-SRC-G7" },
      ],
    },
    expected: {
      state: "refused",
      refusal: {
        code: "harmony.duplicate_event_id",
        path: ["events", 1, "id"],
      },
    },
  },
  {
    id: "H0-OP-STATE-015",
    operation: "analyzeChordInContext",
    setup: {
      requestId: "context-over",
      baseRevision: 0,
      contextEventCount: 4,
    },
    expected: {
      state: "refused",
      boundary: "N+1",
      refusal: {
        code: "limit.harmony_context_events_exceeded",
        path: ["events"],
      },
    },
  },
  {
    id: "H0-OP-STATE-016",
    operation: "analyzeChordInContext",
    setup: {
      requestId: "replay-001",
      baseRevision: 42,
      caseId: "H0-CONTEXT-030",
      repeatCount: 3,
    },
    expected: {
      state: "applicable",
      byteIdenticalResults: true,
      inputMutated: false,
    },
  },
  {
    id: "H0-OP-STATE-017",
    operation: "all",
    setup: { executionModel: "finite-synchronous-table-evaluation" },
    expected: {
      pureOperationApplicability: {
        cancellation:
          "not-applicable: finite synchronous pure table evaluation has no cancellation checkpoint",
        resume:
          "not-applicable: there is no suspended search state to resume",
        browser:
          "not-applicable: H0 imports no browser adapter or browser API",
        audio:
          "not-applicable: H0 imports no audio adapter and emits no playback command",
        storage:
          "not-applicable: H0 imports no storage adapter and persists no key or analysis",
        "stale-application-revision":
          "not-applicable inside H0: analysis preserves baseRevision for downstream consumers, while stale Apply rejection belongs to the later application/suggestion command boundary",
      },
      fakeAbortOrResumeStateAdded: false,
      terminationProvedByCounters: true,
    },
  },
] as const);

const H0_REVIEWED_PROVENANCE_AUTHORING_STATEMENT =
  "H0 expected readings, tiers, degree spellings, containment outcomes, clashes, exceptions, limits, and mutation killers were authored as fixture data before H0 production implementation. No production analyzer, scale mapper, transposer, resolver, or generated artifact supplied expected values.";

const H0_REVIEWED_PROVENANCE_INDEPENDENCE_RULES = Object.freeze([
  "No H0 production import or execution may author expected values.",
  "T1 fixture IDs are immutable reviewed inputs, not runtime oracles invoked by this corpus.",
  "Mechanical all-root expansion must use the reviewed interval inventory and must inverse-check exact spelling.",
  "A mutation is killed only by a semantically independent expected row.",
  "Published references support bounded claims only; no expert review or universal musical-quality judgment is implied.",
] as const);

const H0_REVIEWED_AUTHORITIES = Object.freeze([
  {
    id: "H0-AUTH-PLAN",
    authorityClass: "reviewed-project-contract",
    title: "Changes rebuild plan, Harmony and progression intelligence",
    sourceRefs: [
      "docs/REBUILD_PLAN.md#111-boundary-between-facts-analysis-and-suggestions",
      "docs/REBUILD_PLAN.md#113-roman-numeral-readings",
      "docs/REBUILD_PLAN.md#114-chord-scales-and-tensions",
    ],
    claims: [
      "literal-context-option separation",
      "four evidence tiers",
      "KeyContext modes",
      "Roman and functional rule families",
      "mechanical match weights",
      "initial scale families and mapping predicates",
      "plural scale options",
      "clash and exception reporting",
    ],
    reviewTier: "project-reviewed-contract",
  },
  {
    id: "H0-AUTH-IDEA-WIZARD",
    authorityClass: "reviewed-project-contract",
    title: "Theory Engine Idea Wizard, Harmonic Discovery System",
    sourceRefs: [
      "docs/THEORY_IDEA_WIZARD.md#6-multi-hypothesis-tonal-journey-map",
      "docs/THEORY_IDEA_WIZARD.md#8-contextual-color-and-upper-structure-laboratory",
      "docs/THEORY_IDEA_WIZARD.md#shared-acceptance-laws-for-all-fifteen",
    ],
    claims: [
      "plural defensible readings",
      "visible assumptions/counterevidence/limitations",
      "nonfunctional and modal legitimacy",
      "deterministic ordering",
      "transposition and independent-golden requirements",
    ],
    reviewTier: "project-reviewed-contract",
  },
  {
    id: "H0-AUTH-T1",
    authorityClass: "upstream-reviewed-contract",
    title: "T1 exact resolution, degree spelling, and realization authority",
    sourceRefs: [
      "docs/T1_RESOLUTION_CONTRACT.md",
      "tests/fixtures/resolution/t1-resolution-contract.json",
      "tests/fixtures/resolution/all-root-cases.json",
      "tests/fixtures/resolution/literal-cases.json",
      "tests/fixtures/resolution/spelling-cases.json",
    ],
    claims: [
      "12 reviewed root spellings",
      "exact ChordDegree vocabulary",
      "degree-correct spelling before pitch-class projection",
      "four distinct altered-dominant realization IDs",
      "custom.no_degree_analysis limitation",
    ],
    reviewTier: "upstream-reviewed-contract",
  },
  {
    id: "H0-AUTH-PROJECT-POLICY",
    authorityClass: "project-policy",
    title: "Repository working agreement",
    sourceRefs: [
      "AGENTS.md#product-boundary",
      "AGENTS.md#architecture-invariants",
      "AGENTS.md#verification-discipline",
    ],
    claims: [
      "offline deterministic runtime",
      "spelling-first domain",
      "independently authored fixtures",
      "positive near-miss transposition and mutation proof",
      "no hidden repair or AI authority",
    ],
    reviewTier: "repository-policy",
  },
  {
    id: "H0-AUTH-OMT-APPLIED",
    authorityClass: "published-reference",
    title: "Open Music Theory: Applied chords",
    url: "https://openmusictheory.github.io/appliedChords.html",
    accessed: "2026-07-17",
    claims: [
      "applied chords tonicize a following non-tonic chord",
      "slash Roman notation identifies the applied function",
      "leading-tone and dominant forms use target-relative scale-degree tendency",
    ],
    limitations: [
      "The page describes common-practice tonal usage; H0 does not universalize it to all jazz harmony.",
    ],
    licenseUse: "linked-reference-only-no-verbatim-corpus-content",
    reviewTier: "published-reference",
  },
  {
    id: "H0-AUTH-OMT-MIXTURE",
    authorityClass: "published-reference",
    title: "Open Music Theory: Modal mixture",
    url: "https://openmusictheory.github.io/modalMixture.html",
    accessed: "2026-07-17",
    claims: [
      "modal mixture borrows complete chords from a parallel key",
      "altered Roman roots retain flat or sharp spelling",
      "borrowed use alone does not prove modulation",
    ],
    limitations: [
      "The fixture table narrows this general account to explicitly named H0 parallel-mode rows.",
    ],
    licenseUse: "linked-reference-only-no-verbatim-corpus-content",
    reviewTier: "published-reference",
  },
  {
    id: "H0-AUTH-OMT-FUNCTION-CAVEAT",
    authorityClass: "published-reference",
    title: "Open Music Theory: Harmonic functions",
    url: "https://openmusictheory.github.io/harmonicFunctions.html",
    accessed: "2026-07-17",
    claims: [
      "harmonic function depends on context and style",
      "common-practice function is not a universal account of all harmony",
    ],
    limitations: [
      "Used only to support caution and explicit unclassified/modal/nonfunctional outcomes, not jazz chord-scale mappings.",
    ],
    licenseUse: "linked-reference-only-no-verbatim-corpus-content",
    reviewTier: "published-reference",
  },
] as const);

const H0_REVIEWED_PROVENANCE_DECISIONS = Object.freeze([
  {
    id: "H0-DECISION-001",
    decision: "Only immediate previous and next events contribute adjacency evidence.",
    authorityIds: ["H0-AUTH-PLAN", "H0-AUTH-PROJECT-POLICY"],
  },
  {
    id: "H0-DECISION-002",
    decision:
      "Secondary targets are immediate non-tonic diatonic roots; tonic targets are ordinary dominant.",
    authorityIds: ["H0-AUTH-PLAN", "H0-AUTH-OMT-APPLIED"],
  },
  {
    id: "H0-DECISION-003",
    decision:
      "Melodic-minor harmony uses the fixed ascending collection 1 2 b3 4 5 6 7.",
    authorityIds: ["H0-AUTH-PLAN"],
  },
  {
    id: "H0-DECISION-004",
    decision:
      "Containment equates 2/9, 4/11, and 6/13 only with identical alteration; pitch-class-only aliases fail.",
    authorityIds: ["H0-AUTH-PLAN", "H0-AUTH-T1"],
  },
  {
    id: "H0-DECISION-005",
    decision:
      "Exact tritone evidence requires guide-tone role spelling in addition to shared pitch classes.",
    authorityIds: ["H0-AUTH-PLAN", "H0-AUTH-T1"],
  },
  {
    id: "H0-DECISION-006",
    decision:
      "Passing diminished requires a fully diminished immediate stepwise spelled bridge.",
    authorityIds: ["H0-AUTH-PLAN"],
  },
  {
    id: "H0-DECISION-007",
    decision:
      "Overlapping readings remain plural and use frozen deterministic ordering.",
    authorityIds: ["H0-AUTH-PLAN", "H0-AUTH-IDEA-WIZARD"],
  },
  {
    id: "H0-DECISION-008",
    decision:
      "Clashes remain explicit when a named exception permits a tension; sus4 degree four is instead a chord tone.",
    authorityIds: ["H0-AUTH-PLAN"],
  },
  {
    id: "H0-DECISION-009",
    decision:
      "Custom, absent-key, modal, nonfunctional, ambiguous, and unresolved cases are successful outcomes unless a structural/version/limit contract fails.",
    authorityIds: [
      "H0-AUTH-PLAN",
      "H0-AUTH-IDEA-WIZARD",
      "H0-AUTH-T1",
      "H0-AUTH-OMT-FUNCTION-CAVEAT",
    ],
  },
  {
    id: "H0-DECISION-010",
    decision:
      "Altered scale mapping requires one explicit selected T1 realization and never merges four alternatives.",
    authorityIds: ["H0-AUTH-PLAN", "H0-AUTH-T1"],
  },
] as const);

type ParsedFixture = Readonly<{
  filename: H0FixtureFilename;
  root: JsonObject;
  byteDigest: string;
  semanticDigest: string;
}>;

// Filled only after the complete independent packet has passed semantic review.
// A null entry is a hard failure, never an auto-accept path.
const EXPECTED_BYTE_DIGESTS: Readonly<
  Record<H0FixtureFilename, string | null>
> = {
  "h0-harmony-analysis-contract.json": "6c4e0c07450638062970cf4c487ece694ea163222e708360e6f80a091132d18d",
  "source-catalog.json": "e0750ac08f8097580c946eb30eb6122487c0e371c8b78ef87fb158e8185cda98",
  "analysis-rules.json": "a6c6a782f7e25cf47b6d13b34a8ff73db05a417fd6143fe554422dca9772c553",
  "literal-fact-cases.json": "fb5887b043f9a7caef8889a913c35cff0455c50eae49d14a39f9ba783bd4dfd4",
  "context-reading-cases.json": "c8d4d5ad9235ca3451189e430ae3367ddd64b5921efa00e04236bfed79df9343",
  "roman-root-mode-matrix.json": "3e21e90bdaf65c1e2ae51a38957405829a3685a1d1640bad1b943673b6d7156f",
  "chord-scale-mappings.json": "2ba6a009fe3a9585332aadf71ad2834070a0431347f781041a1441e7d5c7a770",
  "chord-scale-cases.json": "892535b42ba3e2134a3e77cda25265d31aa2ca0d85d900fee57a5c282ee2fe19",
  "transposition-cases.json": "10f3de57efc8a49627b586890983a3ca32ea8e0b9c3b862904b2b7bab74b0767",
  "law-cases.json": "2e7adb9237c32e28fb219aa6476c3d3e06f99e70111ef49c71397200b97fb784",
  "limit-cases.json": "9e91b3cf040ef38734a8535f530babaa9ba6769cd8210d23471bdcfb528dd849",
  "operation-state-cases.json": "713d82e2cf2644419a6c976855cfbca67aefbc7ec1d1fd63b08cfe34a77d9212",
  "mutation-controls.json": "bbb1a46783111afc7eeca53f15c46cc1ef00ec4433a00dd3266813b75d4f45c1",
  "provenance-ledger.json": "3473050aa9a4121a7c8d1f746513a4c75f96071677be0e13ebb6f9f5372f0fcd",
  "trace-ledger.json": "a0ade95b20a9ec04005c9ae9a2f597121dfa0132b9fc1d1da2edf0ebe4ac7bbd",
};

const EXPECTED_SEMANTIC_DIGESTS: Readonly<
  Record<H0FixtureFilename, string | null>
> = {
  "h0-harmony-analysis-contract.json": "abaf07c3c0324b67cb0e006815807fb3e03e346918e4942dd5605a1b97ceabba",
  "source-catalog.json": "8f795108e634220610650f4f3caa58f57f706711b486d2429b6d40b6a9a5b30b",
  "analysis-rules.json": "dec6e84ff6a00e57b5b3760de01ef384a4fb1d61b7b26c37030e4a94f17eb2c5",
  "literal-fact-cases.json": "0a4184a52fc286ef2d0634b01508514a4fc321b5c442cb608379feaa407c4e15",
  "context-reading-cases.json": "1f0c94f9c0b2e76396c1ee5e3af41f6263f46eb06ce0185c120a94bc83bc4f84",
  "roman-root-mode-matrix.json": "0c3772d29dfd5123e4e4d31cffedf037ba59cbd2646b349a25e26681a503e639",
  "chord-scale-mappings.json": "c30a2ed0c971d5251877402afa7bf9de07a52bd572d42d7131414c602ae805e2",
  "chord-scale-cases.json": "71d09d6904edefb55d80c9b85daf51b0c5e5e0c10fe2f5f620816b8eec58b61a",
  "transposition-cases.json": "80e900d8a6028828505782c9b3badbbb91b0e51ceeef31acc01d64e9be6d9f41",
  "law-cases.json": "0bd026accb267a672b14a74aa413ee0c285d7cde50650eefa951c506503aec47",
  "limit-cases.json": "7237bc8511936183cdb562cd23a1c9de4ebb8062707c303403736280328f629b",
  "operation-state-cases.json": "38d4a01141610207dfca27a2aed57a10ff4a1aafed039ccf673c4df140903864",
  "mutation-controls.json": "633acc2c9152a93d7b565298169d735204c2b2b8a62b340cab88e926769d3e93",
  "provenance-ledger.json": "a065ec1c88aba10b2005d78e57ce35d1fdfc8c158093cbb80ad9dadebf4954ad",
  "trace-ledger.json": "7f0f1904346611f4be7a229c7eeb3645f4ef27bba76f47d71ffa6c0814596722",
};

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function codeUnitCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isObject(value)) {
    return `{${Object.keys(value)
      .sort(codeUnitCompare)
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function finding(
  findings: H0ContractFinding[],
  code: string,
  path: string,
  message: string,
): void {
  findings.push({ code, path, message });
}

function requireExact(
  findings: H0ContractFinding[],
  actual: unknown,
  expected: unknown,
  code: string,
  path: string,
  message: string,
): void {
  if (stableJson(actual) !== stableJson(expected)) {
    finding(findings, code, path, message);
  }
}

function requireReviewedPayloadDigest(
  findings: H0ContractFinding[],
  actual: unknown,
  expectedDigest: string,
  code: string,
  path: string,
): void {
  requireExact(
    findings,
    digest(stableJson(actual)),
    expectedDigest,
    code,
    path,
    "Normative reviewed payload drifted; update requires a new independent review packet.",
  );
}

function pathString(path: readonly (string | number)[]): string {
  return path.length === 0
    ? "$"
    : `$${path.map((item) => `[${JSON.stringify(item)}]`).join("")}`;
}

/** Detect decoded duplicate keys before JSON.parse applies last-key-wins. */
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
          return {
            decoded: JSON.parse(source.slice(start, cursor)) as string,
            start,
          };
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
          duplicates.push(
            `${pathString(path)}.${JSON.stringify(key.decoded)}@${String(key.start)}`,
          );
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
    while (cursor < source.length && !/[\s,\]}]/u.test(source[cursor] ?? "")) {
      cursor += 1;
    }
  };
  value([]);
  return duplicates.sort(codeUnitCompare);
}

function objectArray(value: unknown): readonly JsonObject[] {
  return Array.isArray(value) ? value.filter(isObject) : [];
}

function stringArray(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function recordId(record: JsonObject): string | null {
  return typeof record["id"] === "string" ? record["id"] : null;
}

function requireUniqueIds(
  findings: H0ContractFinding[],
  records: readonly JsonObject[],
  path: string,
): readonly string[] {
  const ids: string[] = [];
  for (const [index, record] of records.entries()) {
    const id = recordId(record);
    if (id === null || id.length === 0) {
      finding(findings, "H0-ID-MISSING", `${path}[${String(index)}].id`, "A stable non-empty ID is required.");
      continue;
    }
    ids.push(id);
  }
  if (new Set(ids).size !== ids.length) {
    finding(findings, "H0-ID-DUPLICATE", path, "Stable IDs must be unique within each reviewed record set.");
  }
  return ids;
}

async function loadFixtures(
  fixtureRoot: string,
  findings: H0ContractFinding[],
  enforceDigests: boolean,
): Promise<ReadonlyMap<H0FixtureFilename, ParsedFixture>> {
  let entries: readonly string[];
  try {
    entries = (await readdir(fixtureRoot)).filter((entry) => entry.endsWith(".json"));
  } catch (error) {
    finding(findings, "H0-FIXTURE-ROOT", fixtureRoot, error instanceof Error ? error.message : "Unable to read fixture root.");
    return new Map();
  }

  requireExact(
    findings,
    [...entries].sort(codeUnitCompare),
    [...EXPECTED_FILES].sort(codeUnitCompare),
    "H0-FIXTURE-INVENTORY",
    fixtureRoot,
    "The H0 packet must contain exactly the declared reviewed JSON files.",
  );

  const parsed = new Map<H0FixtureFilename, ParsedFixture>();
  for (const filename of EXPECTED_FILES) {
    const path = resolve(fixtureRoot, filename);
    let source: string;
    try {
      source = await readFile(path, "utf8");
    } catch (error) {
      finding(findings, "H0-FIXTURE-MISSING", path, error instanceof Error ? error.message : "Unable to read fixture.");
      continue;
    }
    const duplicateKeys = duplicateJsonKeys(source);
    if (duplicateKeys.length > 0) {
      finding(findings, "H0-JSON-DUPLICATE-KEY", path, `Decoded duplicate JSON keys are forbidden: ${duplicateKeys.join(", ")}.`);
    }
    let decoded: unknown;
    try {
      decoded = JSON.parse(source) as unknown;
    } catch (error) {
      finding(findings, "H0-JSON-PARSE", path, error instanceof Error ? error.message : "Invalid JSON.");
      continue;
    }
    if (!isObject(decoded)) {
      finding(findings, "H0-FIXTURE-SHAPE", path, "Each fixture root must be an object.");
      continue;
    }
    requireExact(
      findings,
      Object.keys(decoded).sort(codeUnitCompare),
      [...EXPECTED_TOP_LEVEL_KEYS[filename]].sort(codeUnitCompare),
      "H0-TOP-LEVEL-KEYS",
      path,
      "Fixture top-level keys drifted from the reviewed schema.",
    );
    requireExact(findings, decoded["schema"], EXPECTED_SCHEMAS[filename], "H0-FIXTURE-SCHEMA", `${path}.schema`, "Fixture schema drifted.");
    requireExact(findings, decoded["fixtureVersion"], EXPECTED_FIXTURE_VERSION, "H0-FIXTURE-VERSION", `${path}.fixtureVersion`, "Fixture version drifted.");
    requireExact(findings, decoded["expectedValuesGenerated"], false, "H0-INDEPENDENCE-GENERATED", `${path}.expectedValuesGenerated`, "Expected theory values must be independently authored.");
    requireExact(findings, decoded["productionOutputUsed"], false, "H0-INDEPENDENCE-PRODUCTION", `${path}.productionOutputUsed`, "Production output cannot certify the fixture packet.");

    const byteDigest = digest(source);
    const semanticDigest = digest(stableJson(decoded));
    if (enforceDigests) {
      const expectedByte = EXPECTED_BYTE_DIGESTS[filename];
      const expectedSemantic = EXPECTED_SEMANTIC_DIGESTS[filename];
      if (expectedByte === null || expectedSemantic === null) {
        finding(findings, "H0-DIGEST-UNPINNED", path, "Reviewed byte and semantic digests must be pinned before the contract can pass.");
      } else {
        requireExact(findings, byteDigest, expectedByte, "H0-BYTE-DIGEST", path, "Fixture bytes differ from the reviewed packet.");
        requireExact(findings, semanticDigest, expectedSemantic, "H0-SEMANTIC-DIGEST", path, "Fixture semantics differ from the reviewed packet.");
      }
    }
    parsed.set(filename, { filename, root: decoded, byteDigest, semanticDigest });
  }
  return parsed;
}

function fixture(
  fixtures: ReadonlyMap<H0FixtureFilename, ParsedFixture>,
  filename: H0FixtureFilename,
): JsonObject {
  return fixtures.get(filename)?.root ?? {};
}

function byId(records: readonly JsonObject[]): ReadonlyMap<string, JsonObject> {
  const result = new Map<string, JsonObject>();
  for (const record of records) {
    const id = recordId(record);
    if (id !== null) result.set(id, record);
  }
  return result;
}

function requireMinimum(
  findings: H0ContractFinding[],
  actual: number,
  minimum: number,
  code: string,
  path: string,
): void {
  if (actual < minimum) {
    finding(findings, code, path, `Expected at least ${String(minimum)} reviewed records; received ${String(actual)}.`);
  }
}

const H0_BOUNDARY_MAXIMUMS = Object.freeze({
  requestIdAsciiCharacters: 64,
  baseRevision: Number.MAX_SAFE_INTEGER,
  contextEvents: 3,
  previousEvents: 1,
  nextEvents: 1,
  t1Resolutions: 3,
  contextEdges: 2,
  selectedRealizationDegrees: 16,
  scaleDegrees: 8,
  readings: 12,
  scaleOptions: 12,
  evidencePerReading: 16,
  counterevidencePerReading: 8,
  missingEvidencePerReading: 8,
  limitations: 8,
  ruleIdsPerReading: 8,
  matchComponents: 16,
  tensionsPerOption: 8,
  clashesPerOption: 8,
  exceptionsPerOption: 8,
  analysisRuleEvaluations: 16,
  scaleMappingEvaluations: 13,
  degreeComparisons: 4_096,
  emittedRecords: 512,
  trackedRecords: 1_024,
} as const);

const H0_BOUNDARY_IDS = Object.freeze({
  requestIdAsciiCharacters: "H0-LIMIT-REQUEST-ID",
  baseRevision: "H0-LIMIT-BASE-REVISION",
  contextEvents: "H0-LIMIT-CONTEXT-EVENTS",
  previousEvents: "H0-LIMIT-PREVIOUS-EVENTS",
  nextEvents: "H0-LIMIT-NEXT-EVENTS",
  t1Resolutions: "H0-LIMIT-T1-RESOLUTIONS",
  contextEdges: "H0-LIMIT-CONTEXT-EDGES",
  selectedRealizationDegrees: "H0-LIMIT-DEGREES",
  scaleDegrees: "H0-LIMIT-SCALE-DEGREES",
  readings: "H0-LIMIT-READINGS",
  scaleOptions: "H0-LIMIT-SCALE-OPTIONS",
  evidencePerReading: "H0-LIMIT-EVIDENCE",
  counterevidencePerReading: "H0-LIMIT-COUNTEREVIDENCE",
  missingEvidencePerReading: "H0-LIMIT-MISSING-EVIDENCE",
  limitations: "H0-LIMIT-LIMITATIONS",
  ruleIdsPerReading: "H0-LIMIT-RULE-IDS",
  matchComponents: "H0-LIMIT-MATCH-COMPONENTS",
  tensionsPerOption: "H0-LIMIT-TENSIONS",
  clashesPerOption: "H0-LIMIT-CLASHES",
  exceptionsPerOption: "H0-LIMIT-EXCEPTIONS",
  analysisRuleEvaluations: "H0-LIMIT-ANALYSIS-EVALS",
  scaleMappingEvaluations: "H0-LIMIT-SCALE-EVALS",
  degreeComparisons: "H0-LIMIT-DEGREE-COMPARISONS",
  emittedRecords: "H0-LIMIT-EMITTED",
  trackedRecords: "H0-LIMIT-TRACKED",
} as const satisfies Readonly<Record<keyof typeof H0_BOUNDARY_MAXIMUMS, string>>);

type H0BoundaryField = keyof typeof H0_BOUNDARY_MAXIMUMS;

function expectedBoundaryRefusal(field: H0BoundaryField): string {
  if (field === "requestIdAsciiCharacters") return "harmony.request_id_invalid";
  if (field === "baseRevision") return "harmony.base_revision_invalid";
  if (
    field === "contextEvents" ||
    field === "previousEvents" ||
    field === "nextEvents" ||
    field === "t1Resolutions" ||
    field === "contextEdges"
  ) {
    return "limit.harmony_context_events_exceeded";
  }
  if (field === "readings") return "limit.harmony_readings_exceeded";
  if (field === "scaleOptions") return "limit.harmony_scale_options_exceeded";
  if (
    field === "evidencePerReading" ||
    field === "counterevidencePerReading" ||
    field === "missingEvidencePerReading" ||
    field === "limitations" ||
    field === "ruleIdsPerReading" ||
    field === "matchComponents" ||
    field === "tensionsPerOption" ||
    field === "clashesPerOption" ||
    field === "exceptionsPerOption"
  ) {
    return "limit.harmony_evidence_records_exceeded";
  }
  return "limit.harmony_work_exceeded";
}

function validateBoundaryRows(
  findings: H0ContractFinding[],
  rows: readonly JsonObject[],
): void {
  requireExact(
    findings,
    rows.map((row) => row["field"]),
    Object.keys(H0_BOUNDARY_MAXIMUMS),
    "H0-LIMIT-ROW-ORDER",
    "limit-cases.json.boundaryRows[*].field",
    "Boundary rows must cover every bounded surface exactly once in public order.",
  );
  const rowsByField = new Map<string, JsonObject>();
  for (const row of rows) {
    if (typeof row["field"] === "string") rowsByField.set(row["field"], row);
  }
  for (const [field, maximum] of Object.entries(H0_BOUNDARY_MAXIMUMS) as Array<
    [H0BoundaryField, number]
  >) {
    const row = rowsByField.get(field);
    if (row === undefined) {
      finding(findings, "H0-LIMIT-BOUNDARY-MISSING", "limit-cases.json.boundaryRows", `Missing boundary row for ${field}.`);
      continue;
    }
    const expectedRow: JsonObject = {
      id: H0_BOUNDARY_IDS[field],
      field,
      maximum,
      nMinusOne: { value: maximum - 1, accepted: true },
      n: { value: maximum, accepted: true },
      nPlusOne: {
        value: maximum + 1,
        accepted: false,
        refusalCode: expectedBoundaryRefusal(field),
      },
    };
    if (field === "requestIdAsciiCharacters") {
      expectedRow["additionalInvalid"] = [
        {
          value: 1,
          content: "non-ASCII",
          refusalCode: "harmony.request_id_invalid",
        },
      ];
    } else if (field === "baseRevision") {
      expectedRow["additionalInvalid"] = [
        { value: -1, refusalCode: "harmony.base_revision_invalid" },
        { value: 0.5, refusalCode: "harmony.base_revision_invalid" },
      ];
    }
    requireExact(
      findings,
      row,
      expectedRow,
      "H0-LIMIT-ROW-PAYLOAD",
      `limit-cases.json#${field}`,
      "Boundary row identity, witnesses, or malformed-value evidence drifted.",
    );
    requireExact(findings, row["id"], H0_BOUNDARY_IDS[field], "H0-LIMIT-ROW-ID", `limit-cases.json#${field}.id`, "Boundary row identity drifted from the public field order.");
    requireExact(findings, row["maximum"], maximum, "H0-LIMIT-MAXIMUM", `limit-cases.json#${field}.maximum`, "Boundary maximum drifted from the public contract.");
    const belowMaximum = row["nMinusOne"];
    const atMaximum = row["n"];
    const aboveMaximum = row["nPlusOne"];
    if (!isObject(belowMaximum) || !isObject(atMaximum) || !isObject(aboveMaximum)) {
      finding(findings, "H0-LIMIT-TRIPLE", `limit-cases.json#${field}`, "Every cap needs explicit N-1, N, and N+1 records.");
      continue;
    }
    requireExact(findings, belowMaximum["value"], maximum - 1, "H0-LIMIT-N-MINUS-ONE", `limit-cases.json#${field}.nMinusOne.value`, "N-1 must be the value immediately below the public maximum.");
    requireExact(findings, belowMaximum["accepted"], true, "H0-LIMIT-N-MINUS-ONE", `limit-cases.json#${field}.nMinusOne.accepted`, "N-1 must be accepted.");
    requireExact(findings, atMaximum["value"], maximum, "H0-LIMIT-N", `limit-cases.json#${field}.n.value`, "N must be the exact public maximum.");
    requireExact(findings, atMaximum["accepted"], true, "H0-LIMIT-N", `limit-cases.json#${field}.n.accepted`, "N must be accepted.");
    requireExact(findings, aboveMaximum["value"], maximum + 1, "H0-LIMIT-N-PLUS-ONE", `limit-cases.json#${field}.nPlusOne.value`, "N+1 must be the first rejected value.");
    requireExact(findings, aboveMaximum["accepted"], false, "H0-LIMIT-N-PLUS-ONE", `limit-cases.json#${field}.nPlusOne.accepted`, "N+1 must be refused.");
    requireExact(findings, aboveMaximum["refusalCode"], expectedBoundaryRefusal(field), "H0-LIMIT-REFUSAL", `limit-cases.json#${field}.nPlusOne.refusalCode`, "Boundary refusal code drifted.");
  }
}

function requireLinkedIds(
  findings: H0ContractFinding[],
  records: readonly JsonObject[],
  field: string,
  allowed: ReadonlySet<string>,
  path: string,
): void {
  for (const [index, record] of records.entries()) {
    const links = stringArray(record[field]);
    if (links.length === 0) {
      finding(findings, "H0-LINK-MISSING", `${path}[${String(index)}].${field}`, `${field} must contain at least one reviewed link.`);
      continue;
    }
    for (const link of links) {
      if (!allowed.has(link)) {
        finding(findings, "H0-LINK-UNKNOWN", `${path}[${String(index)}].${field}`, `Unknown linked ID ${link}.`);
      }
    }
  }
}

function registerCaseOwners(
  findings: H0ContractFinding[],
  owners: Map<string, H0FixtureFilename>,
  records: readonly JsonObject[],
  filename: H0FixtureFilename,
): void {
  for (const record of records) {
    const id = recordId(record);
    if (id === null) continue;
    const existingOwner = owners.get(id);
    if (existingOwner !== undefined && existingOwner !== filename) {
      finding(
        findings,
        "H0-CASE-ID-AMBIGUOUS",
        `${filename}#${id}`,
        `Case ID ${id} is already owned by ${existingOwner}.`,
      );
      continue;
    }
    owners.set(id, filename);
  }
}

function registerSyntheticCaseOwner(
  findings: H0ContractFinding[],
  owners: Map<string, H0FixtureFilename>,
  id: unknown,
  filename: H0FixtureFilename,
  path: string,
): void {
  if (typeof id !== "string" || id.length === 0) {
    finding(findings, "H0-ID-MISSING", path, "A stable synthetic matrix or packet case ID is required.");
    return;
  }
  registerCaseOwners(findings, owners, [{ id }], filename);
}

function requireKnownStringReference(
  findings: H0ContractFinding[],
  actual: unknown,
  allowed: ReadonlySet<string>,
  code: string,
  path: string,
  label: string,
): void {
  if (typeof actual !== "string" || !allowed.has(actual)) {
    finding(findings, code, path, `Unknown ${label} reference ${String(actual)}.`);
  }
}

function requireObjectKeys(
  findings: H0ContractFinding[],
  record: JsonObject,
  expected: readonly string[],
  code: string,
  path: string,
): void {
  requireExact(
    findings,
    Object.keys(record).sort(codeUnitCompare),
    [...expected].sort(codeUnitCompare),
    code,
    path,
    "Object keys drifted from the closed reviewed shape.",
  );
}

const H0_SPELLING_STEPS = Object.freeze(["C", "D", "E", "F", "G", "A", "B"] as const);
const H0_NATURAL_PITCH_CLASSES = Object.freeze({
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
} as const);

function parsePitchSymbol(symbol: unknown): JsonObject | null {
  if (typeof symbol !== "string") return null;
  const match = /^([A-G])(bb|##|b|#)?$/u.exec(symbol);
  if (match === null) return null;
  const accidental = match[2];
  return {
    step: match[1],
    alter:
      accidental === "bb"
        ? -2
        : accidental === "b"
          ? -1
          : accidental === "#"
            ? 1
            : accidental === "##"
              ? 2
              : 0,
  };
}

function pitchClassOfSpelling(spelling: JsonObject): number | null {
  const step = spelling["step"];
  const alter = spelling["alter"];
  if (
    typeof step !== "string" ||
    !Object.hasOwn(H0_NATURAL_PITCH_CLASSES, step) ||
    typeof alter !== "number" ||
    !Number.isInteger(alter)
  ) {
    return null;
  }
  const natural = H0_NATURAL_PITCH_CLASSES[
    step as keyof typeof H0_NATURAL_PITCH_CLASSES
  ];
  return ((natural + alter) % 12 + 12) % 12;
}

function spellReviewedDegree(
  root: JsonObject,
  degree: JsonObject,
): JsonObject | null {
  const rootStep = root["step"];
  const rootAlter = root["alter"];
  const diatonicSteps = degree["diatonicSteps"];
  const directedSemitones = degree["directedSemitones"];
  if (
    typeof rootStep !== "string" ||
    !Object.hasOwn(H0_NATURAL_PITCH_CLASSES, rootStep) ||
    typeof rootAlter !== "number" ||
    !Number.isInteger(rootAlter) ||
    typeof diatonicSteps !== "number" ||
    !Number.isInteger(diatonicSteps) ||
    typeof directedSemitones !== "number" ||
    !Number.isInteger(directedSemitones)
  ) {
    return null;
  }
  const rootIndex = H0_SPELLING_STEPS.indexOf(
    rootStep as (typeof H0_SPELLING_STEPS)[number],
  );
  const targetIndex = rootIndex + diatonicSteps;
  const octave = Math.floor(targetIndex / H0_SPELLING_STEPS.length);
  const targetStep = H0_SPELLING_STEPS[
    ((targetIndex % H0_SPELLING_STEPS.length) + H0_SPELLING_STEPS.length) %
      H0_SPELLING_STEPS.length
  ];
  if (targetStep === undefined) return null;
  const rootNatural = H0_NATURAL_PITCH_CLASSES[
    rootStep as keyof typeof H0_NATURAL_PITCH_CLASSES
  ];
  const targetNatural = H0_NATURAL_PITCH_CLASSES[targetStep] + 12 * octave;
  return {
    step: targetStep,
    alter: rootNatural + rootAlter + directedSemitones - targetNatural,
  };
}

function reviewedScaleDegree(token: unknown): JsonObject | null {
  if (typeof token !== "string") return null;
  const match = /^(bb|b|#)?(1|2|3|4|5|6|7|9|11|13)$/u.exec(token);
  if (match === null) return null;
  const number = Number(match[2]);
  const naturalSemitones = new Map<number, number>([
    [1, 0],
    [2, 2],
    [3, 4],
    [4, 5],
    [5, 7],
    [6, 9],
    [7, 11],
    [9, 14],
    [11, 17],
    [13, 21],
  ]).get(number);
  if (naturalSemitones === undefined) return null;
  const accidental = match[1];
  const alter =
    accidental === "bb"
      ? -2
      : accidental === "b"
        ? -1
        : accidental === "#"
          ? 1
          : 0;
  return {
    diatonicSteps: number - 1,
    directedSemitones: naturalSemitones + alter,
  };
}

function expectedT1ReferenceOwner(id: string): JsonObject | null {
  if (/^T1-ROOT-\d{3}$/u.test(id)) {
    return {
      id,
      ownerFixture: "tests/fixtures/resolution/all-root-cases.json",
      ownerCollection: "roots",
    };
  }
  if (/^T1-LIT-\d{3}$/u.test(id)) {
    return {
      id,
      ownerFixture: "tests/fixtures/resolution/literal-cases.json",
      ownerCollection: "cases",
    };
  }
  if (/^T1-FORMULA-\d{3}$/u.test(id)) {
    return {
      id,
      ownerFixture: "tests/fixtures/resolution/formula-rules.json",
      ownerCollection: "rules",
    };
  }
  if (/^T1-SPELL-\d{3}$/u.test(id)) {
    return {
      id,
      ownerFixture: "tests/fixtures/resolution/spelling-cases.json",
      ownerCollection: "cases",
    };
  }
  if (/^T1-CUSTOM-\d{3}$/u.test(id)) {
    return {
      id,
      ownerFixture: "tests/fixtures/resolution/custom-cases.json",
      ownerCollection: "cases",
    };
  }
  return null;
}

function validateSourceCatalog(
  findings: H0ContractFinding[],
  source: JsonObject,
  roots: readonly JsonObject[],
  chords: readonly JsonObject[],
  contexts: readonly JsonObject[],
): void {
  requireExact(findings, source["independenceStatement"], H0_REVIEWED_SOURCE_INDEPENDENCE_STATEMENT, "H0-SOURCE-INDEPENDENCE", "source-catalog.json.independenceStatement", "Source authority must remain independently authored and must not claim production-generated expectations.");
  requireExact(findings, source["t1AuthoritySnapshot"], H0_REVIEWED_T1_AUTHORITY_SNAPSHOT, "H0-SOURCE-T1-IDENTITY", "source-catalog.json.t1AuthoritySnapshot", "The imported T1 schema and policy identity drifted.");
  requireExact(findings, source["t1DegreeTokenVocabulary"], H0_REVIEWED_T1_DEGREE_TOKEN_VOCABULARY, "H0-SOURCE-T1-DEGREE-VOCABULARY", "source-catalog.json.t1DegreeTokenVocabulary", "Selected-realization degree tokens must match the reviewed T1 vocabulary exactly.");
  requireExact(findings, digest(stableJson(roots)), H0_REVIEWED_SOURCE_ROW_DIGESTS.roots, "H0-SOURCE-ROOT-IDENTITY", "source-catalog.json.rootInventory", "Reviewed root row identity or payload drifted.");
  requireExact(findings, digest(stableJson(chords)), H0_REVIEWED_SOURCE_ROW_DIGESTS.chords, "H0-SOURCE-CHORD-IDENTITY", "source-catalog.json.chords", "Reviewed source chord identity or payload drifted.");
  requireExact(findings, digest(stableJson(contexts)), H0_REVIEWED_SOURCE_ROW_DIGESTS.contexts, "H0-SOURCE-CONTEXT-IDENTITY", "source-catalog.json.contexts", "Reviewed context identity or payload drifted.");

  const vocabulary = objectArray(source["t1DegreeTokenVocabulary"]);
  const degreeByToken = new Map<string, JsonObject>();
  for (const row of vocabulary) {
    if (typeof row["token"] === "string") degreeByToken.set(row["token"], row);
  }

  for (const [index, root] of roots.entries()) {
    const path = `source-catalog.json.rootInventory[${String(index)}]`;
    requireObjectKeys(findings, root, ["id", "symbol", "spelling", "pitchClass", "t1RootRef"], "H0-SOURCE-ROOT-SHAPE", path);
    const parsed = parsePitchSymbol(root["symbol"]);
    requireExact(findings, root["spelling"], parsed, "H0-SOURCE-ROOT-SPELLING", `${path}.spelling`, "Root symbol and structured spelling must agree exactly.");
    requireExact(findings, isObject(parsed) ? pitchClassOfSpelling(parsed) : null, root["pitchClass"], "H0-SOURCE-ROOT-PITCH-CLASS", `${path}.pitchClass`, "Root pitch-class projection drifted from its spelling.");
  }

  const referencedT1Ids = [
    ...roots.map((root) => root["t1RootRef"]),
    ...chords.flatMap((chord) => stringArray(chord["t1Refs"])),
  ].filter((id): id is string => typeof id === "string");
  const expectedReferenceIds = [...new Set(referencedT1Ids)].sort(codeUnitCompare);
  const owners = objectArray(source["t1ReferenceOwners"]);
  requireUniqueIds(findings, owners, "source-catalog.json.t1ReferenceOwners");
  requireExact(findings, owners.map(recordId), expectedReferenceIds, "H0-SOURCE-T1-REF-INVENTORY", "source-catalog.json.t1ReferenceOwners", "Every and only referenced T1 row must have one owner declaration in lexical ID order.");
  for (const [index, owner] of owners.entries()) {
    const id = recordId(owner);
    requireExact(findings, id === null ? null : owner, id === null ? null : expectedT1ReferenceOwner(id), "H0-SOURCE-T1-REF-OWNER", `source-catalog.json.t1ReferenceOwners[${String(index)}]`, "T1 reference ownership namespace or collection drifted.");
  }
  const ownerIds = new Set(owners.map(recordId).filter((id): id is string => id !== null));

  const formulaRuleIds = new Set<string>(H0_REVIEWED_T1_FORMULA_RULE_IDS);
  const alteredIds = new Set<string>(H0_REVIEWED_T1_AUTHORITY_SNAPSHOT.semanticRealizationIds.slice(1));
  for (const [index, chord] of chords.entries()) {
    const path = `source-catalog.json.chords[${String(index)}]`;
    const custom = chord["realizationId"] === "custom";
    requireObjectKeys(findings, chord, custom
      ? ["id", "symbol", "root", "rootSpelling", "degrees", "degreeSpellings", "t1Refs", "formulaRuleId", "realizationId", "limitations"]
      : ["id", "symbol", "root", "rootSpelling", "degrees", "degreeSpellings", "t1Refs", "formulaRuleId", "realizationId"], "H0-SOURCE-CHORD-SHAPE", path);
    const t1Refs = stringArray(chord["t1Refs"]);
    if (t1Refs.length === 0 || t1Refs.some((id) => !ownerIds.has(id))) {
      finding(findings, "H0-SOURCE-T1-REF-CLOSED", `${path}.t1Refs`, "Every source chord requires nonempty, owned T1 references.");
    }
    const formulaRuleId = chord["formulaRuleId"];
    if (typeof formulaRuleId !== "string" || !formulaRuleIds.has(formulaRuleId)) {
      finding(findings, "H0-SOURCE-FORMULA-RULE", `${path}.formulaRuleId`, "Source formula rule is outside the closed T1 vocabulary.");
    }
    if (custom) {
      requireExact(findings, { root: chord["root"], rootSpelling: chord["rootSpelling"], degrees: chord["degrees"], degreeSpellings: chord["degreeSpellings"], formulaRuleId: chord["formulaRuleId"], t1Refs }, { root: null, rootSpelling: null, degrees: null, degreeSpellings: null, formulaRuleId: "custom", t1Refs: ["T1-CUSTOM-001"] }, "H0-SOURCE-CUSTOM-SHAPE", path, "Custom source must retain the exact null-degree T1 shape.");
      continue;
    }
    const parsedRoot = parsePitchSymbol(chord["root"]);
    requireExact(findings, chord["rootSpelling"], parsedRoot, "H0-SOURCE-CHORD-ROOT-SPELLING", `${path}.rootSpelling`, "Chord root symbol and structured spelling must agree.");
    if (typeof chord["symbol"] !== "string" || typeof chord["root"] !== "string" || !chord["symbol"].startsWith(chord["root"])) {
      finding(findings, "H0-SOURCE-CHORD-SYMBOL", `${path}.symbol`, "Chord symbol must retain its exact written root prefix.");
    }
    const degrees = stringArray(chord["degrees"]);
    if (degrees.length === 0 || degrees.length > 16 || new Set(degrees).size !== degrees.length || degrees.some((token) => !degreeByToken.has(token))) {
      finding(findings, "H0-SOURCE-CHORD-DEGREES", `${path}.degrees`, "Chord degrees must be one nonempty duplicate-free bounded tuple from the exact T1 vocabulary.");
    }
    const expectedSpellings = isObject(parsedRoot)
      ? degrees.map((token) => spellReviewedDegree(parsedRoot, degreeByToken.get(token) ?? {}))
      : [];
    requireExact(findings, chord["degreeSpellings"], expectedSpellings, "H0-SOURCE-CHORD-DEGREE-SPELLING", `${path}.degreeSpellings`, "Every degree spelling must be index-aligned and derived before pitch-class projection.");
    const realizationId = chord["realizationId"];
    if (realizationId === "literal") {
      if (formulaRuleId === "altered-dominant" || formulaRuleId === "custom") {
        finding(findings, "H0-SOURCE-REALIZATION-FORMULA", path, "Literal realization cannot use the altered or custom T1 formula rule.");
      }
    } else if (typeof realizationId !== "string" || !alteredIds.has(realizationId) || formulaRuleId !== "altered-dominant" || !t1Refs.includes("T1-LIT-045")) {
      finding(findings, "H0-SOURCE-REALIZATION-FORMULA", path, "An altered realization must retain one exact T1 alt ID, altered formula, and T1-LIT-045 authority.");
    }
  }

  for (const [index, context] of contexts.entries()) {
    const path = `source-catalog.json.contexts[${String(index)}]`;
    const basis = context["basis"];
    const expectedKeys = basis === "declared-key"
      ? ["id", "basis", "tonic", "tonicSpelling", "mode"]
      : basis === "declared-modal"
        ? ["id", "basis", "tonic", "tonicSpelling", "mode", "evidenceId"]
        : basis === "declared-nonfunctional"
          ? ["id", "basis", "anchor", "anchorSpelling", "evidenceId"]
          : ["id", "basis"];
    requireObjectKeys(findings, context, expectedKeys, "H0-SOURCE-CONTEXT-SHAPE", path);
    if (basis === "declared-key" || basis === "declared-modal") {
      requireExact(findings, context["tonicSpelling"], parsePitchSymbol(context["tonic"]), "H0-SOURCE-CONTEXT-SPELLING", `${path}.tonicSpelling`, "Context tonic spelling drifted.");
    } else if (basis === "declared-nonfunctional") {
      requireExact(findings, context["anchorSpelling"], parsePitchSymbol(context["anchor"]), "H0-SOURCE-CONTEXT-SPELLING", `${path}.anchorSpelling`, "Nonfunctional anchor spelling drifted.");
    } else if (basis !== "absent-key") {
      finding(findings, "H0-SOURCE-CONTEXT-BASIS", `${path}.basis`, "Context basis is outside the closed H0 source vocabulary.");
    }
  }
}

function validateClosedSourceReferences(
  findings: H0ContractFinding[],
  sourceChords: readonly JsonObject[],
  sourceContexts: readonly JsonObject[],
  literalCases: readonly JsonObject[],
  contextCases: readonly JsonObject[],
  scaleCases: readonly JsonObject[],
  transpositionCases: readonly JsonObject[],
  operationStates: readonly JsonObject[],
  analysisRuleIds: ReadonlySet<string>,
  scaleMappingIds: ReadonlySet<string>,
): void {
  const sourceIds = new Set(
    sourceChords.map(recordId).filter((id): id is string => id !== null),
  );
  const sourceById = byId(sourceChords);
  const contextIds = new Set(
    sourceContexts.map(recordId).filter((id): id is string => id !== null),
  );
  const literalCaseIds = new Set(
    literalCases.map(recordId).filter((id): id is string => id !== null),
  );
  const contextCaseIds = new Set(
    contextCases.map(recordId).filter((id): id is string => id !== null),
  );
  const rootSymbols = new Set(
    sourceChords
      .map((source) => source["root"])
      .filter((root): root is string => typeof root === "string"),
  );

  if (sourceChords.length === 0 || sourceContexts.length === 0) {
    finding(
      findings,
      "H0-SOURCE-CATALOG-EMPTY",
      "source-catalog.json",
      "The reviewed source chord and context catalogs must both be non-empty.",
    );
  }

  for (const [index, literalCase] of literalCases.entries()) {
    requireKnownStringReference(findings, literalCase["sourceId"], sourceIds, "H0-SOURCE-REF-UNKNOWN", `literal-fact-cases.json.cases[${String(index)}].sourceId`, "source");
    for (const [contextIndex, contextId] of stringArray(literalCase["contexts"]).entries()) {
      requireKnownStringReference(findings, contextId, contextIds, "H0-CONTEXT-REF-UNKNOWN", `literal-fact-cases.json.cases[${String(index)}].contexts[${String(contextIndex)}]`, "context");
    }
    const pairedCaseId = literalCase["pairedCaseId"];
    if (pairedCaseId !== undefined) {
      requireKnownStringReference(findings, pairedCaseId, literalCaseIds, "H0-CASE-REF-UNKNOWN", `literal-fact-cases.json.cases[${String(index)}].pairedCaseId`, "literal case");
    }
  }

  for (const [caseIndex, contextCase] of contextCases.entries()) {
    requireKnownStringReference(findings, contextCase["contextId"], contextIds, "H0-CONTEXT-REF-UNKNOWN", `context-reading-cases.json.cases[${String(caseIndex)}].contextId`, "context");
    const events = contextCase["events"];
    if (!isObject(events) || !isObject(events["current"])) {
      finding(findings, "H0-EVENT-CURRENT-MISSING", `context-reading-cases.json.cases[${String(caseIndex)}].events`, "Every context case requires one current event.");
      continue;
    }
    const localEventIds = new Set<string>();
    for (const role of ["previous", "current", "next"] as const) {
      const event = events[role];
      if (event === undefined) continue;
      if (!isObject(event)) {
        finding(findings, "H0-EVENT-SHAPE", `context-reading-cases.json.cases[${String(caseIndex)}].events.${role}`, "A present event must be an object.");
        continue;
      }
      const eventId = event["id"];
      if (typeof eventId !== "string" || eventId.length === 0) {
        finding(findings, "H0-EVENT-ID-MISSING", `context-reading-cases.json.cases[${String(caseIndex)}].events.${role}.id`, "Every local event requires a stable ID.");
      } else if (localEventIds.has(eventId)) {
        finding(findings, "H0-EVENT-ID-DUPLICATE", `context-reading-cases.json.cases[${String(caseIndex)}].events.${role}.id`, `Duplicate local event ID ${eventId}.`);
      } else {
        localEventIds.add(eventId);
      }
      requireKnownStringReference(findings, event["sourceId"], sourceIds, "H0-SOURCE-REF-UNKNOWN", `context-reading-cases.json.cases[${String(caseIndex)}].events.${role}.sourceId`, "source");
      const transpose = event["transpose"];
      if (transpose !== undefined) {
        if (!isObject(transpose)) {
          finding(findings, "H0-TRANSPOSE-REF-UNKNOWN", `context-reading-cases.json.cases[${String(caseIndex)}].events.${role}.transpose`, "A transpose declaration must name reviewed source and target roots.");
        } else {
          requireKnownStringReference(findings, transpose["from"], rootSymbols, "H0-TRANSPOSE-REF-UNKNOWN", `context-reading-cases.json.cases[${String(caseIndex)}].events.${role}.transpose.from`, "transpose root");
          requireKnownStringReference(findings, transpose["to"], rootSymbols, "H0-TRANSPOSE-REF-UNKNOWN", `context-reading-cases.json.cases[${String(caseIndex)}].events.${role}.transpose.to`, "transpose root");
        }
      }
    }
    const expected = contextCase["expected"];
    if (!isObject(expected)) continue;
    for (const [readingIndex, reading] of objectArray(expected["orderedReadings"]).entries()) {
      for (const [ruleIndex, ruleId] of stringArray(reading["ruleIds"]).entries()) {
        requireKnownStringReference(findings, ruleId, analysisRuleIds, "H0-RULE-REF-UNKNOWN", `context-reading-cases.json.cases[${String(caseIndex)}].expected.orderedReadings[${String(readingIndex)}].ruleIds[${String(ruleIndex)}]`, "analysis rule");
      }
      const targetId = reading["governingTargetEventId"];
      if (targetId !== undefined) {
        requireKnownStringReference(findings, targetId, localEventIds, "H0-EVENT-REF-UNKNOWN", `context-reading-cases.json.cases[${String(caseIndex)}].expected.orderedReadings[${String(readingIndex)}].governingTargetEventId`, "local event");
      }
    }
  }

  for (const [index, scaleCase] of scaleCases.entries()) {
    requireKnownStringReference(findings, scaleCase["sourceId"], sourceIds, "H0-SOURCE-REF-UNKNOWN", `chord-scale-cases.json.cases[${String(index)}].sourceId`, "source");
    const contextId = scaleCase["contextId"];
    if (contextId !== undefined) {
      requireKnownStringReference(findings, contextId, contextIds, "H0-CONTEXT-REF-UNKNOWN", `chord-scale-cases.json.cases[${String(index)}].contextId`, "context");
    }
    const selectedRealizationId = scaleCase["selectedRealizationId"];
    if (typeof selectedRealizationId === "string") {
      const source = typeof scaleCase["sourceId"] === "string"
        ? sourceById.get(scaleCase["sourceId"])
        : undefined;
      requireExact(findings, selectedRealizationId, source?.["realizationId"], "H0-SELECTED-REALIZATION-REF", `chord-scale-cases.json.cases[${String(index)}].selectedRealizationId`, "A selected realization must be the exact realization owned by the source chord.");
    }
    const expected = scaleCase["expected"];
    if (!isObject(expected)) continue;
    for (const [optionIndex, option] of objectArray(expected["orderedOptions"]).entries()) {
      const mappingRuleId = option["mappingRuleId"];
      if (mappingRuleId !== undefined) {
        requireKnownStringReference(findings, mappingRuleId, scaleMappingIds, "H0-SCALE-RULE-REF-UNKNOWN", `chord-scale-cases.json.cases[${String(index)}].expected.orderedOptions[${String(optionIndex)}].mappingRuleId`, "scale mapping");
      }
    }
  }

  for (const [index, transpositionCase] of transpositionCases.entries()) {
    for (const field of ["sourceId", "leftSourceId", "rightSourceId", "targetSourceId"] as const) {
      if (transpositionCase[field] !== undefined) {
        requireKnownStringReference(findings, transpositionCase[field], sourceIds, "H0-SOURCE-REF-UNKNOWN", `transposition-cases.json.cases[${String(index)}].${field}`, "source");
      }
    }
    if (transpositionCase["mappingRuleId"] !== undefined) {
      requireKnownStringReference(findings, transpositionCase["mappingRuleId"], scaleMappingIds, "H0-SCALE-RULE-REF-UNKNOWN", `transposition-cases.json.cases[${String(index)}].mappingRuleId`, "scale mapping");
    }
  }

  for (const [index, operationState] of operationStates.entries()) {
    const setup = operationState["setup"];
    if (!isObject(setup)) continue;
    if (setup["sourceId"] !== undefined) {
      requireKnownStringReference(findings, setup["sourceId"], sourceIds, "H0-SOURCE-REF-UNKNOWN", `operation-state-cases.json.cases[${String(index)}].setup.sourceId`, "source");
    }
    if (setup["contextId"] !== undefined) {
      requireKnownStringReference(findings, setup["contextId"], contextIds, "H0-CONTEXT-REF-UNKNOWN", `operation-state-cases.json.cases[${String(index)}].setup.contextId`, "context");
    }
    if (setup["caseId"] !== undefined) {
      requireKnownStringReference(findings, setup["caseId"], contextCaseIds, "H0-CASE-REF-UNKNOWN", `operation-state-cases.json.cases[${String(index)}].setup.caseId`, "context case");
    }
    for (const [eventIndex, event] of objectArray(setup["events"]).entries()) {
      requireKnownStringReference(findings, event["sourceId"], sourceIds, "H0-SOURCE-REF-UNKNOWN", `operation-state-cases.json.cases[${String(index)}].setup.events[${String(eventIndex)}].sourceId`, "source");
    }
  }
}

function expectObjectField(
  findings: H0ContractFinding[],
  record: JsonObject | undefined,
  field: string,
  expected: unknown,
  code: string,
  path: string,
): void {
  if (record === undefined) {
    finding(findings, code, path, "Required reviewed witness is missing.");
    return;
  }
  requireExact(findings, record[field], expected, code, `${path}.${field}`, "Reviewed witness drifted from its frozen expectation.");
}

function validateCriticalContextWitnesses(
  findings: H0ContractFinding[],
  cases: readonly JsonObject[],
): void {
  const casesById = byId(cases);
  const firstReading = (id: string): JsonObject | undefined => {
    const expected = casesById.get(id)?.["expected"];
    if (!isObject(expected)) return undefined;
    return objectArray(expected["orderedReadings"])[0];
  };

  expectObjectField(findings, firstReading("H0-CONTEXT-001"), "classification", "ordinary-dominant", "H0-ORDINARY-DOMINANT", "context-reading-cases.json#H0-CONTEXT-001");
  expectObjectField(findings, firstReading("H0-CONTEXT-001"), "romanLabel", "V7", "H0-ORDINARY-DOMINANT", "context-reading-cases.json#H0-CONTEXT-001");
  const tonicExpected = casesById.get("H0-CONTEXT-001")?.["expected"];
  if (isObject(tonicExpected)) {
    requireExact(findings, tonicExpected["forbiddenClassifications"], ["secondary-dominant"], "H0-TONIC-NOT-SECONDARY", "context-reading-cases.json#H0-CONTEXT-001.expected.forbiddenClassifications", "A tonic-target dominant must explicitly forbid the secondary label.");
  }

  const secondaryWitnesses = [
    ["H0-CONTEXT-002", "V7/V"],
    ["H0-CONTEXT-003", "V7/ii"],
    ["H0-CONTEXT-004", "V7/IV"],
  ] as const;
  for (const [id, romanLabel] of secondaryWitnesses) {
    expectObjectField(findings, firstReading(id), "classification", "secondary-dominant", "H0-SECONDARY-DOMINANT", `context-reading-cases.json#${id}`);
    expectObjectField(findings, firstReading(id), "romanLabel", romanLabel, "H0-SECONDARY-DOMINANT", `context-reading-cases.json#${id}`);
  }

  expectObjectField(findings, firstReading("H0-CONTEXT-005"), "classification", "unresolved", "H0-UNRESOLVED-NEAR-MISS", "context-reading-cases.json#H0-CONTEXT-005");
  expectObjectField(findings, firstReading("H0-CONTEXT-010"), "classification", "secondary-leading-tone", "H0-LEADING-TONE", "context-reading-cases.json#H0-CONTEXT-010");
  expectObjectField(findings, firstReading("H0-CONTEXT-013"), "classification", "tritone-substitute", "H0-TRITONE", "context-reading-cases.json#H0-CONTEXT-013");
  expectObjectField(findings, firstReading("H0-CONTEXT-015"), "classification", "backdoor-dominant", "H0-BACKDOOR", "context-reading-cases.json#H0-CONTEXT-015");
  expectObjectField(findings, firstReading("H0-CONTEXT-021"), "classification", "passing-diminished", "H0-PASSING-DIMINISHED", "context-reading-cases.json#H0-CONTEXT-021");

  const spellingPairs = [
    ["H0-CONTEXT-028", "bIIImaj7"],
    ["H0-CONTEXT-029", "#IImaj7"],
  ] as const;
  for (const [id, romanLabel] of spellingPairs) {
    expectObjectField(findings, firstReading(id), "romanLabel", romanLabel, "H0-ROMAN-SPELLING", `context-reading-cases.json#${id}`);
  }
}

function validateMatrixDeclarations(
  findings: H0ContractFinding[],
  roots: readonly JsonObject[],
  analysisRules: readonly JsonObject[],
  literalCases: readonly JsonObject[],
  contextCases: readonly JsonObject[],
  modeSeeds: readonly JsonObject[],
  romanMatrix: JsonObject,
  scaleMappings: readonly JsonObject[],
  scaleFixture: JsonObject,
  transpositionFixture: JsonObject,
  transpositionCases: readonly JsonObject[],
): void {
  const rootIds = roots.map(recordId).filter((id): id is string => id !== null);
  const ruleById = byId(analysisRules);
  const expectedModes = Object.keys(H0_REVIEWED_MODE_RULES);
  requireExact(findings, digest(stableJson(modeSeeds)), H0_REVIEWED_MODE_SEED_DIGEST, "H0-ROMAN-MODE-SEED-PAYLOAD", "roman-root-mode-matrix.json.modeSeeds", "Mode seed identity, Roman expectation, or quality-degree tuple drifted.");
  requireExact(findings, digest(stableJson(objectArray(romanMatrix["enharmonicStressRows"]))), H0_REVIEWED_ENHARMONIC_STRESS_DIGEST, "H0-ROMAN-ENHARMONIC-STRESS", "roman-root-mode-matrix.json.enharmonicStressRows", "Enharmonic Roman or inverse-spelling evidence drifted.");

  for (const mode of expectedModes) {
    const seeds = modeSeeds.filter((seed) => seed["mode"] === mode);
    const typedMode = mode as keyof typeof H0_REVIEWED_MODE_RULES;
    requireExact(findings, seeds.map((seed) => seed["rootDegree"]), H0_REVIEWED_MODE_ROOT_DEGREES[typedMode], "H0-ROMAN-MODE-COVERAGE", `roman-root-mode-matrix.json.modeSeeds#${mode}`, "Every reviewed mode must declare its exact seven-degree collection once and in order.");
    const expectedRuleId = H0_REVIEWED_MODE_RULES[typedMode];
    requireExact(findings, seeds.map((seed) => seed["ruleId"]), Array.from({ length: 7 }, () => expectedRuleId), "H0-ROMAN-MODE-RULE", `roman-root-mode-matrix.json.modeSeeds#${mode}.ruleId`, "Every mode seed must use its reviewed Roman rule.");
    const ruleRows = ruleById.get(expectedRuleId)?.["seventhDegreeRows"];
    requireExact(findings, seeds.map((seed) => seed["romanLabel"]), ruleRows, "H0-ROMAN-MODE-RULE", `roman-root-mode-matrix.json.modeSeeds#${mode}.romanLabel`, "Mode seed Roman labels must equal the independently reviewed rule rows.");
  }
  const undeclaredModes = modeSeeds
    .map((seed) => seed["mode"])
    .filter((mode) => typeof mode !== "string" || !expectedModes.includes(mode));
  requireExact(findings, undeclaredModes, [], "H0-ROMAN-MODE-COVERAGE", "roman-root-mode-matrix.json.modeSeeds[*].mode", "Mode seeds may use only the four reviewed mode collections.");
  requireExact(findings, romanMatrix["rootInventoryRefs"], rootIds, "H0-ROMAN-ROOT-EXPANSION", "roman-root-mode-matrix.json.rootInventoryRefs", "Roman expansion must name every reviewed root exactly once and in source order.");

  const matrix = romanMatrix["matrix"];
  if (isObject(matrix)) {
    const computedCells = rootIds.length * modeSeeds.length;
    requireExact(findings, matrix["construction"], "12-reviewed-roots-x-28-independent-mode-seeds", "H0-ROMAN-MATRIX-DECLARATION", "roman-root-mode-matrix.json.matrix.construction", "Roman matrix construction label drifted.");
    requireExact(findings, matrix["rootCount"], rootIds.length, "H0-ROMAN-MATRIX-COMPUTED", "roman-root-mode-matrix.json.matrix.rootCount", "Declared Roman root count must equal the closed root inventory.");
    requireExact(findings, matrix["seedCount"], modeSeeds.length, "H0-ROMAN-MATRIX-COMPUTED", "roman-root-mode-matrix.json.matrix.seedCount", "Declared Roman seed count must equal the independently reviewed seed inventory.");
    requireExact(findings, matrix["expectedCellCount"], computedCells, "H0-ROMAN-MATRIX-COMPUTED", "roman-root-mode-matrix.json.matrix.expectedCellCount", "Roman cell count must be computed as roots times seeds.");
    requireExact(findings, matrix["cellIdTemplate"], "{rootId}::{seedId}", "H0-ROMAN-MATRIX-DECLARATION", "roman-root-mode-matrix.json.matrix.cellIdTemplate", "Roman cell identity template drifted.");
    requireExact(findings, matrix["expected"], {
      disposition: "classified",
      classification: "diatonic",
      strength: "exact",
      romanLabelInvariantUnderTransposition: true,
      inverseRestoresSpelling: true,
    }, "H0-ROMAN-MATRIX-EXPECTATION", "roman-root-mode-matrix.json.matrix.expected", "Roman matrix outcome and inverse-spelling expectation drifted.");
    const cSpelling: JsonObject = { step: "C", alter: 0 };
    const expectedRomanCells = roots.flatMap((root) => {
      const rootId = recordId(root);
      const rootSpelling = root["spelling"];
      if (rootId === null || !isObject(rootSpelling)) return [];
      return modeSeeds.map((seed) => {
        const seedId = recordId(seed);
        const degree = reviewedScaleDegree(seed["rootDegree"]);
        const chordRootSpelling = degree === null
          ? null
          : spellReviewedDegree(rootSpelling, degree);
        const inverseSpelling = degree === null
          ? null
          : spellReviewedDegree(cSpelling, degree);
        return {
          id: `${rootId}::${String(seedId)}`,
          rootId,
          seedId,
          expected: {
            tonicSymbol: root["symbol"],
            tonicSpelling: rootSpelling,
            chordRootSpelling,
            chordRootPitchClass: isObject(chordRootSpelling)
              ? pitchClassOfSpelling(chordRootSpelling)
              : null,
            mode: seed["mode"],
            rootDegree: seed["rootDegree"],
            romanLabel: seed["romanLabel"],
            qualityDegrees: seed["qualityDegrees"],
            ruleId: seed["ruleId"],
            disposition: "classified",
            classification: "diatonic",
            strength: "exact",
            inverseExpectedCChordRootSpelling: inverseSpelling,
          },
        };
      });
    });
    requireExact(findings, matrix["cells"], expectedRomanCells, "H0-ROMAN-MATERIAL-CELLS", "roman-root-mode-matrix.json.matrix.cells", "The packet must materialize and exactly check all 336 root-by-mode Roman cells.");
  }

  const rootExpansion = scaleFixture["rootExpansion"];
  if (!isObject(rootExpansion)) {
    finding(findings, "H0-SCALE-ROOT-EXPANSION", "chord-scale-cases.json.rootExpansion", "A closed all-root scale expansion declaration is required.");
  } else {
    const polarityCount = 2;
    const computedCells = rootIds.length * scaleMappings.length * polarityCount;
    requireExact(findings, rootExpansion["id"], "H0-SCALE-ROOT-MATRIX-001", "H0-SCALE-ROOT-EXPANSION", "chord-scale-cases.json.rootExpansion.id", "Scale root-matrix identity drifted.");
    requireExact(findings, rootExpansion["rootRefs"], rootIds, "H0-SCALE-ROOT-EXPANSION", "chord-scale-cases.json.rootExpansion.rootRefs", "Scale expansion must name every reviewed root exactly once and in source order.");
    requireExact(findings, rootExpansion["mappingSeedCount"], scaleMappings.length, "H0-SCALE-ROOT-EXPANSION", "chord-scale-cases.json.rootExpansion.mappingSeedCount", "Scale mapping seed count must equal the normative mapping inventory.");
    requireExact(findings, rootExpansion["positiveAndNearMissPerSeed"], true, "H0-SCALE-ROOT-EXPANSION", "chord-scale-cases.json.rootExpansion.positiveAndNearMissPerSeed", "Every scale mapping/root pair requires positive and near-miss polarity declarations.");
    requireExact(findings, rootExpansion["expectedMinimumCells"], computedCells, "H0-SCALE-ROOT-EXPANSION", "chord-scale-cases.json.rootExpansion.expectedMinimumCells", "Scale matrix size must be computed as roots times mappings times two polarities.");
    requireExact(findings, rootExpansion["cellIdTemplate"], "{rootId}::{mappingRuleId}::{polarity}", "H0-SCALE-ROOT-EXPANSION", "chord-scale-cases.json.rootExpansion.cellIdTemplate", "Scale cell identity template drifted.");
    requireExact(findings, rootExpansion["excludedCells"], [], "H0-SCALE-ROOT-EXPANSION", "chord-scale-cases.json.rootExpansion.excludedCells", "No scale/root/polarity cell may be silently excluded.");
    requireExact(findings, rootExpansion["polaritySeeds"], H0_REVIEWED_SCALE_POLARITY_SEEDS, "H0-SCALE-POLARITY-SEEDS", "chord-scale-cases.json.rootExpansion.polaritySeeds", "Each mapping must retain one independently authored positive and near-miss seed case.");
    const scaleCaseIds = new Set(objectArray(scaleFixture["cases"]).map(recordId).filter((id): id is string => id !== null));
    for (const seed of H0_REVIEWED_SCALE_POLARITY_SEEDS) {
      if (!scaleCaseIds.has(seed.positiveCaseId) || !scaleCaseIds.has(seed.nearMissCaseId)) {
        finding(findings, "H0-SCALE-POLARITY-SEED-REF", "chord-scale-cases.json.rootExpansion.polaritySeeds", `Mapping ${seed.mappingRuleId} has a dangling polarity seed reference.`);
      }
    }
    const polaritySeedByMapping = new Map<
      string,
      (typeof H0_REVIEWED_SCALE_POLARITY_SEEDS)[number]
    >(
      H0_REVIEWED_SCALE_POLARITY_SEEDS.map((seed) => [seed.mappingRuleId, seed]),
    );
    const cSpelling: JsonObject = { step: "C", alter: 0 };
    const expectedScaleCells = roots.flatMap((root) => {
      const rootId = recordId(root);
      const rootSpelling = root["spelling"];
      if (rootId === null || !isObject(rootSpelling)) return [];
      return scaleMappings.flatMap((mapping) => {
        const mappingRuleId = recordId(mapping);
        if (mappingRuleId === null) return [];
        const seed = polaritySeedByMapping.get(mappingRuleId);
        if (seed === undefined) return [];
        const scaleDegrees = stringArray(mapping["scaleDegrees"]);
        const scaleDegreeSpellings = scaleDegrees.map((token) => {
          const degree = reviewedScaleDegree(token);
          return degree === null ? null : spellReviewedDegree(rootSpelling, degree);
        });
        const inverseSpellings = scaleDegrees.map((token) => {
          const degree = reviewedScaleDegree(token);
          return degree === null ? null : spellReviewedDegree(cSpelling, degree);
        });
        return ([
          ["positive", seed.positiveCaseId, true],
          ["near-miss", seed.nearMissCaseId, false],
        ] as const).map(([polarity, seedCaseId, predicateMatches]) => ({
          id: `${rootId}::${mappingRuleId}::${polarity}`,
          rootId,
          mappingRuleId,
          polarity,
          seedCaseId,
          expected: {
            family: mapping["family"],
            scaleDegrees: mapping["scaleDegrees"],
            scaleDegreeSpellings,
            predicateMatches,
            exactDegreeIdentityPreserved: true,
            inverseExpectedCScaleDegreeSpellings: inverseSpellings,
          },
        }));
      });
    });
    requireExact(findings, rootExpansion["cells"], expectedScaleCells, "H0-SCALE-MATERIAL-CELLS", "chord-scale-cases.json.rootExpansion.cells", "The packet must materialize and exactly check all 312 root-by-mapping-by-polarity cells.");
  }

  const reviewedTranspositions = objectArray(
    transpositionFixture["reviewedRootTranspositionsFromC"],
  );
  requireExact(findings, reviewedTranspositions, H0_REVIEWED_ROOT_TRANSPOSITIONS, "H0-TRANSPOSITION-ROOT-INTERVALS", "transposition-cases.json.reviewedRootTranspositionsFromC", "Reviewed diatonic-step and semitone intervals must remain exact for all twelve roots.");
  requireExact(findings, digest(stableJson(transpositionCases)), H0_REVIEWED_TRANSPOSITION_CASE_DIGEST, "H0-TRANSPOSITION-PAYLOAD", "transposition-cases.json.cases", "Transposition seed ownership, expected payload, or enharmonic evidence drifted.");

  const knownSeedIds = new Set<string>([
    ...literalCases.map(recordId).filter((id): id is string => id !== null),
    ...contextCases.map(recordId).filter((id): id is string => id !== null),
    ...modeSeeds.map(recordId).filter((id): id is string => id !== null),
    ...objectArray(scaleFixture["cases"]).map(recordId).filter((id): id is string => id !== null),
  ]);
  const knownMatrixIds = new Set(["H0-ROM-ROOT-MODE-MATRIX-001", "H0-SCALE-ROOT-MATRIX-001"]);
  for (const [index, row] of transpositionCases.entries()) {
    for (const field of ["seedRefs", "seedCaseIds"] as const) {
      for (const seedId of stringArray(row[field])) {
        if (!knownSeedIds.has(seedId)) {
          finding(findings, "H0-TRANSPOSITION-SEED-REF", `transposition-cases.json.cases[${String(index)}].${field}`, `Unknown transposition seed ${seedId}.`);
        }
      }
    }
    if (row["seedCaseId"] !== undefined && (typeof row["seedCaseId"] !== "string" || !knownSeedIds.has(row["seedCaseId"]))) {
      finding(findings, "H0-TRANSPOSITION-SEED-REF", `transposition-cases.json.cases[${String(index)}].seedCaseId`, `Unknown transposition seed ${stableJson(row["seedCaseId"])}.`);
    }
    if (row["seedMatrixId"] !== undefined && (typeof row["seedMatrixId"] !== "string" || !knownMatrixIds.has(row["seedMatrixId"]))) {
      finding(findings, "H0-TRANSPOSITION-SEED-REF", `transposition-cases.json.cases[${String(index)}].seedMatrixId`, `Unknown transposition matrix seed ${stableJson(row["seedMatrixId"])}.`);
    }
  }

  const allRootCases = transpositionCases.filter((row) =>
    H0_REVIEWED_ALL_ROOT_TRANSPOSITION_IDS.includes(String(row["id"])),
  );
  requireExact(findings, allRootCases.map((row) => row["id"]), H0_REVIEWED_ALL_ROOT_TRANSPOSITION_IDS, "H0-TRANSPOSITION-ALL-ROOT-INVENTORY", "transposition-cases.json.cases", "All-root transposition declarations H0-TRANS-001 through H0-TRANS-016 are required in order.");
  for (const row of allRootCases) {
    requireExact(findings, row["rootScope"], "all-12-reviewed-roots", "H0-TRANSPOSITION-ROOT-SCOPE", `transposition-cases.json#${String(row["id"])}.rootScope`, "Every reviewed transposable declaration must cover all twelve roots.");
  }
}

function validateCriticalRuleAndMappingPayloads(
  findings: H0ContractFinding[],
  analysisRules: readonly JsonObject[],
  scaleMappings: readonly JsonObject[],
  scaleCases: readonly JsonObject[],
): void {
  const rules = byId(analysisRules);
  const mappings = byId(scaleMappings);
  const cases = byId(scaleCases);

  const ordinary = rules.get("h0.function.ordinary-dominant");
  requireExact(findings, ordinary?.["predicate"], "A dominant-quality chord whose immediate next root is the declared tonic is ordinary dominant function.", "H0-CRITICAL-ORDINARY-PRECEDENCE", "analysis-rules.json#h0.function.ordinary-dominant.predicate", "Ordinary-dominant target semantics drifted.");
  requireExact(findings, ordinary?.["exactRequires"], ["declared-key", "dominant-quality", "immediate-next-root-is-tonic", "complete-literal-match"], "H0-CRITICAL-ORDINARY-PRECEDENCE", "analysis-rules.json#h0.function.ordinary-dominant.exactRequires", "Ordinary-dominant exact prerequisites drifted.");
  requireExact(findings, ordinary?.["precedenceOver"], ["h0.function.secondary-dominant"], "H0-CRITICAL-ORDINARY-PRECEDENCE", "analysis-rules.json#h0.function.ordinary-dominant.precedenceOver", "Tonic-target ordinary dominance must retain precedence over secondary dominance.");

  const secondary = rules.get("h0.function.secondary-dominant");
  requireExact(findings, secondary?.["exactRequires"], ["declared-key", "dominant-quality", "immediate-next-event", "non-tonic-diatonic-target-root", "target-quality-diatonic-in-declared-key", "spelled-fifth-motion"], "H0-CRITICAL-SECONDARY-ADJACENCY", "analysis-rules.json#h0.function.secondary-dominant.exactRequires", "Secondary-dominant adjacency and non-tonic target prerequisites drifted.");
  requireExact(findings, secondary?.["plausibleAllows"], ["missing-target-event"], "H0-CRITICAL-SECONDARY-ADJACENCY", "analysis-rules.json#h0.function.secondary-dominant.plausibleAllows", "A missing immediate target may lower evidence but may not be searched past.");
  requireExact(findings, secondary?.["forbids"], ["tonic-target", "nonadjacent-target", "inverted-fifth-motion"], "H0-CRITICAL-SECONDARY-ADJACENCY", "analysis-rules.json#h0.function.secondary-dominant.forbids", "Secondary-dominant forbidden target shortcuts drifted.");

  const altered = mappings.get("h0.scale.altered");
  requireExact(findings, altered?.["contextPredicates"], ["explicit-selected-altered-dominant-realization"], "H0-CRITICAL-ALTERED-SELECTION", "chord-scale-mappings.json#h0.scale.altered.contextPredicates", "Altered mapping requires one explicit selected T1 realization.");
  requireExact(findings, altered?.["scaleDegrees"], ["1", "b2", "#2", "3", "b5", "#5", "b7"], "H0-CRITICAL-ALTERED-SELECTION", "chord-scale-mappings.json#h0.scale.altered.scaleDegrees", "Altered scale degrees drifted or merged enharmonic roles.");
  const alteredSelections = [
    ["H0-SCALE-ALT-001", "alt-b9-b5"],
    ["H0-SCALE-ALT-002", "alt-b9-sharp5"],
    ["H0-SCALE-ALT-003", "alt-sharp9-b5"],
    ["H0-SCALE-ALT-004", "alt-sharp9-sharp5"],
  ] as const;
  for (const [id, selection] of alteredSelections) {
    requireExact(findings, cases.get(id)?.["selectedRealizationId"], selection, "H0-CRITICAL-ALTERED-SELECTION", `chord-scale-cases.json#${id}.selectedRealizationId`, "Each altered witness must preserve one distinct selected realization.");
  }
  const alteredMissing = cases.get("H0-SCALE-ALT-NEAR-001")?.["expected"];
  requireExact(findings, isObject(alteredMissing) && isObject(alteredMissing["refusal"]) ? alteredMissing["refusal"]["code"] : undefined, "harmony.selected_realization_required", "H0-CRITICAL-ALTERED-SELECTION", "chord-scale-cases.json#H0-SCALE-ALT-NEAR-001.expected.refusal.code", "Missing altered selection must refuse rather than merge alternatives.");

  const wholeHalf = mappings.get("h0.scale.whole-half-diminished");
  requireExact(findings, wholeHalf?.["scaleDegrees"], ["1", "2", "b3", "4", "b5", "b6", "bb7", "7"], "H0-CRITICAL-WHOLE-HALF-DEGREE", "chord-scale-mappings.json#h0.scale.whole-half-diminished.scaleDegrees", "Whole-half diminished must retain double-flat seven as an exact degree.");
  requireExact(findings, wholeHalf?.["requiredChordDegrees"], ["1", "b3", "b5", "bb7"], "H0-CRITICAL-WHOLE-HALF-DEGREE", "chord-scale-mappings.json#h0.scale.whole-half-diminished.requiredChordDegrees", "Fully diminished containment requires double-flat seven.");
  requireExact(findings, wholeHalf?.["forbiddenChordDegrees"], ["b7", "6"], "H0-CRITICAL-WHOLE-HALF-DEGREE", "chord-scale-mappings.json#h0.scale.whole-half-diminished.forbiddenChordDegrees", "Double-flat seven must never collapse to six or flat seven.");

  const suspended = mappings.get("h0.scale.suspended-dominant");
  requireExact(findings, suspended?.["requiredChordDegrees"], ["1", "4", "5", "b7"], "H0-CRITICAL-SUSPENDED-THIRD", "chord-scale-mappings.json#h0.scale.suspended-dominant.requiredChordDegrees", "Suspended-dominant mapping requires degree four as a chord tone.");
  requireExact(findings, suspended?.["forbiddenChordDegrees"], ["3"], "H0-CRITICAL-SUSPENDED-THIRD", "chord-scale-mappings.json#h0.scale.suspended-dominant.forbiddenChordDegrees", "A retained major third must forbid the suspended mapping.");
  requireExact(findings, suspended?.["exceptions"], [{ id: "suspended-fourth-is-chord-tone", treatment: "degree-four-is-contained-chord-tone-not-eleven-avoid-note" }], "H0-CRITICAL-SUSPENDED-THIRD", "chord-scale-mappings.json#h0.scale.suspended-dominant.exceptions", "Suspended fourth must remain a contained chord tone, not an avoid-note exception.");
}

function validateProofOwnership(
  findings: H0ContractFinding[],
  rows: readonly JsonObject[],
  expectedRuleIds: readonly string[],
  expectedDigest: string,
  path: string,
  caseOwners: ReadonlyMap<string, H0FixtureFilename>,
  mutationIds: ReadonlySet<string>,
  traceById: ReadonlyMap<string, JsonObject>,
): void {
  const seenRuleIds = new Set<string>();
  const actualRuleIds: string[] = [];

  for (const [index, row] of rows.entries()) {
    const rowPath = `${path}[${String(index)}]`;
    const ruleId = row["ruleId"];
    if (typeof ruleId !== "string" || ruleId.length === 0) {
      finding(findings, "H0-PROOF-RULE-ID", `${rowPath}.ruleId`, "Every proof-ownership row requires one stable rule ID.");
      continue;
    }
    actualRuleIds.push(ruleId);
    if (seenRuleIds.has(ruleId)) {
      finding(findings, "H0-PROOF-RULE-DUPLICATE", `${rowPath}.ruleId`, `Duplicate proof ownership for ${ruleId}.`);
    }
    seenRuleIds.add(ruleId);

    const positiveCaseIds = stringArray(row["positiveCaseIds"]);
    const nearMissCaseIds = stringArray(row["nearMissCaseIds"]);
    const transpositionCaseIds = stringArray(row["transpositionCaseIds"]);
    const linkedMutationIds = stringArray(row["mutationControlIds"]);
    const linkedTraceIds = stringArray(row["traceIds"]);
    for (const [field, ids] of [
      ["positiveCaseIds", positiveCaseIds],
      ["nearMissCaseIds", nearMissCaseIds],
      ["transpositionCaseIds", transpositionCaseIds],
      ["mutationControlIds", linkedMutationIds],
      ["traceIds", linkedTraceIds],
    ] as const) {
      if (ids.length === 0) {
        finding(findings, "H0-PROOF-OWNERSHIP-MISSING", `${rowPath}.${field}`, `Rule ${ruleId} requires direct ${field} ownership.`);
      }
      if (new Set(ids).size !== ids.length) {
        finding(findings, "H0-PROOF-OWNERSHIP-DUPLICATE", `${rowPath}.${field}`, `Rule ${ruleId} repeats a ${field} reference.`);
      }
    }
    for (const caseId of [...positiveCaseIds, ...nearMissCaseIds]) {
      if (!caseOwners.has(caseId)) {
        finding(findings, "H0-PROOF-CASE-UNKNOWN", rowPath, `Rule ${ruleId} names unknown proof case ${caseId}.`);
      }
    }
    if (positiveCaseIds.some((id) => nearMissCaseIds.includes(id))) {
      finding(findings, "H0-PROOF-POLARITY-OVERLAP", rowPath, `Rule ${ruleId} reuses one case as both positive and near-miss evidence.`);
    }
    for (const caseId of transpositionCaseIds) {
      if (caseOwners.get(caseId) !== "transposition-cases.json") {
        finding(findings, "H0-PROOF-TRANSPOSITION-UNKNOWN", `${rowPath}.transpositionCaseIds`, `Rule ${ruleId} names unknown transposition proof ${caseId}.`);
      }
    }
    for (const mutationId of linkedMutationIds) {
      if (!mutationIds.has(mutationId)) {
        finding(findings, "H0-PROOF-MUTATION-UNKNOWN", `${rowPath}.mutationControlIds`, `Rule ${ruleId} names unknown mutation ${mutationId}.`);
      }
    }
    let reciprocalTraceFound = false;
    for (const traceId of linkedTraceIds) {
      const trace = traceById.get(traceId);
      if (trace === undefined) {
        finding(findings, "H0-PROOF-TRACE-UNKNOWN", `${rowPath}.traceIds`, `Rule ${ruleId} names unknown trace ${traceId}.`);
      } else if (stringArray(trace["ruleIds"]).includes(ruleId)) {
        reciprocalTraceFound = true;
      }
    }
    if (!reciprocalTraceFound) {
      finding(findings, "H0-PROOF-TRACE-RECIPROCITY", `${rowPath}.traceIds`, `No linked trace owns rule ${ruleId}.`);
    }
  }

  requireExact(findings, actualRuleIds, expectedRuleIds, "H0-PROOF-RULE-INVENTORY", `${path}[*].ruleId`, "Every normative rule requires exactly one proof-ownership row in public order.");
  requireReviewedPayloadDigest(findings, rows, expectedDigest, "H0-PROOF-OWNERSHIP-PAYLOAD", path);
}

function validateLawMutationTraceGraph(
  findings: H0ContractFinding[],
  fixtures: ReadonlyMap<H0FixtureFilename, ParsedFixture>,
  caseOwners: ReadonlyMap<string, H0FixtureFilename>,
  laws: readonly JsonObject[],
  mutationControls: readonly JsonObject[],
  traces: readonly JsonObject[],
  analysisRuleIds: ReadonlySet<string>,
  scaleMappingIds: ReadonlySet<string>,
  authorityIds: ReadonlySet<string>,
  decisionLedger: readonly JsonObject[],
  additionalAuthorityUsers: readonly JsonObject[],
): void {
  const lawById = byId(laws);
  const mutationById = byId(mutationControls);
  const traceById = byId(traces);
  const lawIds = new Set(lawById.keys());
  const mutationIds = new Set(mutationById.keys());
  const traceIds = new Set(traceById.keys());
  const traceRuleCoverage = new Set<string>();
  const mutationOperators = new Set<string>();
  const reviewedFiles = new Set<string>(EXPECTED_FILES);
  const traceBearingFiles = new Set<string>(H0_TRACE_BEARING_FILES);

  const lawFixture = fixture(fixtures, "law-cases.json");
  requireExact(findings, lawFixture["proofPolicy"], {
    everyLawRequiresPositive: true,
    everyApplicableLawRequiresNearMiss: true,
    everyTransposableLawRequiresAll12Roots: true,
    everyLawRequiresMutationKiller: true,
  }, "H0-LAW-PROOF-POLICY", "law-cases.json.proofPolicy", "Law proof obligations drifted.");

  for (const [index, law] of laws.entries()) {
    const lawId = recordId(law) ?? `<law-${String(index)}>`;
    const positiveCaseIds = stringArray(law["positiveCaseIds"]);
    const nearMissCaseIds = stringArray(law["nearMissCaseIds"]);
    const mutationControlIds = stringArray(law["mutationControlIds"]);
    if (positiveCaseIds.length === 0) {
      finding(findings, "H0-LAW-POSITIVE-MISSING", `law-cases.json#${lawId}.positiveCaseIds`, "Every law requires at least one independently authored positive case.");
    }
    if (nearMissCaseIds.length === 0) {
      finding(findings, "H0-LAW-NEAR-MISS-MISSING", `law-cases.json#${lawId}.nearMissCaseIds`, "Every applicable H0 v1 law requires at least one near-miss case.");
    }
    for (const [caseIndex, caseId] of [...positiveCaseIds, ...nearMissCaseIds].entries()) {
      if (!caseOwners.has(caseId)) {
        finding(findings, "H0-LAW-CASE-UNKNOWN", `law-cases.json#${lawId}.caseIds[${String(caseIndex)}]`, `Unknown law proof case ${caseId}.`);
      }
    }
    const transpositionCaseId = law["transpositionCaseId"];
    if (transpositionCaseId !== undefined) {
      if (
        typeof transpositionCaseId !== "string" ||
        caseOwners.get(transpositionCaseId) !== "transposition-cases.json"
      ) {
        finding(findings, "H0-LAW-TRANSPOSITION-UNKNOWN", `law-cases.json#${lawId}.transpositionCaseId`, `Unknown transposition proof ${stableJson(transpositionCaseId)}.`);
      }
    }
    if (mutationControlIds.length === 0) {
      finding(findings, "H0-LAW-MUTATION-MISSING", `law-cases.json#${lawId}.mutationControlIds`, "Every law requires at least one mutation killer.");
    }
    for (const mutationId of mutationControlIds) {
      const mutation = mutationById.get(mutationId);
      if (mutation === undefined) {
        finding(findings, "H0-LAW-MUTATION-UNKNOWN", `law-cases.json#${lawId}.mutationControlIds`, `Unknown mutation killer ${mutationId}.`);
      } else if (!stringArray(mutation["lawIds"]).includes(lawId)) {
        finding(findings, "H0-LAW-MUTATION-RECIPROCITY", `law-cases.json#${lawId}.mutationControlIds`, `Mutation ${mutationId} does not link back to ${lawId}.`);
      }
    }
  }

  for (const [index, mutation] of mutationControls.entries()) {
    const mutationId = recordId(mutation) ?? `<mutation-${String(index)}>`;
    const killerCaseIds = stringArray(mutation["killerCaseIds"]);
    const linkedLawIds = stringArray(mutation["lawIds"]);
    const linkedTraceIds = stringArray(mutation["traceIds"]);
    const operator = mutation["operator"];
    const mutatedFault = mutation["mutatedFault"];
    if (typeof operator !== "string" || operator.length === 0) {
      finding(findings, "H0-MUTATION-OPERATOR-MISSING", `mutation-controls.json#${mutationId}.operator`, "Every mutation control requires one stable semantic operator.");
    } else if (mutationOperators.has(operator)) {
      finding(findings, "H0-MUTATION-OPERATOR-DUPLICATE", `mutation-controls.json#${mutationId}.operator`, `Mutation operator ${operator} is duplicated.`);
    } else {
      mutationOperators.add(operator);
    }
    if (typeof mutatedFault !== "string" || mutatedFault.length === 0) {
      finding(findings, "H0-MUTATION-FAULT-MISSING", `mutation-controls.json#${mutationId}.mutatedFault`, "Every mutation control must describe the semantic fault it kills.");
    }
    if (killerCaseIds.length === 0) {
      finding(findings, "H0-MUTATION-KILLER-MISSING", `mutation-controls.json#${mutationId}.killerCaseIds`, "Every mutation control requires at least one independent killer case.");
    }
    for (const killerCaseId of killerCaseIds) {
      if (!caseOwners.has(killerCaseId)) {
        finding(findings, "H0-MUTATION-CASE-UNKNOWN", `mutation-controls.json#${mutationId}.killerCaseIds`, `Unknown mutation killer case ${killerCaseId}.`);
      }
    }
    if (linkedLawIds.length === 0) {
      finding(findings, "H0-MUTATION-LAW-MISSING", `mutation-controls.json#${mutationId}.lawIds`, "Every mutation control must link at least one law.");
    }
    for (const lawId of linkedLawIds) {
      const law = lawById.get(lawId);
      if (law === undefined) {
        finding(findings, "H0-MUTATION-LAW-UNKNOWN", `mutation-controls.json#${mutationId}.lawIds`, `Unknown linked law ${lawId}.`);
      } else if (!stringArray(law["mutationControlIds"]).includes(mutationId)) {
        finding(findings, "H0-LAW-MUTATION-RECIPROCITY", `mutation-controls.json#${mutationId}.lawIds`, `Law ${lawId} does not link back to ${mutationId}.`);
      }
    }
    if (linkedTraceIds.length === 0) {
      finding(findings, "H0-MUTATION-TRACE-MISSING", `mutation-controls.json#${mutationId}.traceIds`, "Every mutation control must link at least one trace.");
    }
    for (const traceId of linkedTraceIds) {
      const trace = traceById.get(traceId);
      if (trace === undefined) {
        finding(findings, "H0-MUTATION-TRACE-UNKNOWN", `mutation-controls.json#${mutationId}.traceIds`, `Unknown linked trace ${traceId}.`);
      } else if (!stringArray(trace["mutationIds"]).includes(mutationId)) {
        finding(findings, "H0-MUTATION-TRACE-RECIPROCITY", `mutation-controls.json#${mutationId}.traceIds`, `Trace ${traceId} does not link back to ${mutationId}.`);
      }
    }
  }

  const authorityUsage = new Set<string>();
  for (const [index, trace] of traces.entries()) {
    const traceId = recordId(trace) ?? `<trace-${String(index)}>`;
    const fixtureFiles = stringArray(trace["fixtureFiles"]);
    const linkedCaseIds = stringArray(trace["caseIds"]);
    const linkedRuleIds = stringArray(trace["ruleIds"]);
    const linkedMutationIds = stringArray(trace["mutationIds"]);
    const linkedAuthorityIds = stringArray(trace["authorityIds"]);
    if (fixtureFiles.length === 0) {
      finding(findings, "H0-TRACE-FILE-MISSING", `trace-ledger.json#${traceId}.fixtureFiles`, "Every trace must name at least one reviewed fixture file.");
    }
    if (linkedCaseIds.length === 0) {
      finding(findings, "H0-TRACE-CASE-MISSING", `trace-ledger.json#${traceId}.caseIds`, "Every trace must own at least one concrete fixture, matrix, law, or mutation case.");
    }
    requireExact(findings, trace["plannedProductionOwners"], H0_REVIEWED_PLANNED_PRODUCTION_OWNERS, "H0-TRACE-PRODUCTION-OWNERS", `trace-ledger.json#${traceId}.plannedProductionOwners`, "Trace handoff must name the frozen planned production owners without claiming implementation exists.");
    requireExact(findings, trace["plannedEvidenceTestOwners"], H0_REVIEWED_PLANNED_EVIDENCE_TEST_OWNERS, "H0-TRACE-EVIDENCE-OWNERS", `trace-ledger.json#${traceId}.plannedEvidenceTestOwners`, "Trace handoff must name the frozen planned evidence-test owners.");
    for (const filename of fixtureFiles) {
      if (!reviewedFiles.has(filename)) {
        finding(findings, "H0-TRACE-FILE-UNKNOWN", `trace-ledger.json#${traceId}.fixtureFiles`, `Unknown fixture file ${filename}.`);
        continue;
      }
      if (
        traceBearingFiles.has(filename) &&
        !stringArray(fixture(fixtures, filename as H0FixtureFilename)["traceIds"]).includes(traceId)
      ) {
        finding(findings, "H0-TRACE-FILE-RECIPROCITY", `trace-ledger.json#${traceId}.fixtureFiles`, `${filename} does not link back to trace ${traceId}.`);
      }
    }
    for (const caseId of linkedCaseIds) {
      const owner = caseOwners.get(caseId);
      if (owner === undefined) {
        finding(findings, "H0-TRACE-CASE-UNKNOWN", `trace-ledger.json#${traceId}.caseIds`, `Unknown trace case ${caseId}.`);
      } else if (!fixtureFiles.includes(owner)) {
        finding(findings, "H0-TRACE-CASE-FILE", `trace-ledger.json#${traceId}.caseIds`, `Case ${caseId} is owned by ${owner}, which is absent from fixtureFiles.`);
      }
    }
    for (const ruleId of linkedRuleIds) {
      if (!analysisRuleIds.has(ruleId) && !scaleMappingIds.has(ruleId)) {
        finding(findings, "H0-TRACE-RULE-UNKNOWN", `trace-ledger.json#${traceId}.ruleIds`, `Unknown trace rule ${ruleId}.`);
      } else {
        traceRuleCoverage.add(ruleId);
      }
    }
    for (const mutationId of linkedMutationIds) {
      const mutation = mutationById.get(mutationId);
      if (mutation === undefined) {
        finding(findings, "H0-TRACE-MUTATION-UNKNOWN", `trace-ledger.json#${traceId}.mutationIds`, `Unknown trace mutation ${mutationId}.`);
      } else if (!stringArray(mutation["traceIds"]).includes(traceId)) {
        finding(findings, "H0-MUTATION-TRACE-RECIPROCITY", `trace-ledger.json#${traceId}.mutationIds`, `Mutation ${mutationId} does not link back to ${traceId}.`);
      }
    }
    if (linkedAuthorityIds.length === 0) {
      finding(findings, "H0-TRACE-AUTHORITY-MISSING", `trace-ledger.json#${traceId}.authorityIds`, "Every trace must name at least one reviewed authority.");
    }
    for (const authorityId of linkedAuthorityIds) {
      if (!authorityIds.has(authorityId)) {
        finding(findings, "H0-TRACE-AUTHORITY-UNKNOWN", `trace-ledger.json#${traceId}.authorityIds`, `Unknown trace authority ${authorityId}.`);
      } else {
        authorityUsage.add(authorityId);
      }
    }
  }

  requireExact(
    findings,
    [...traceRuleCoverage].sort(codeUnitCompare),
    [...analysisRuleIds, ...scaleMappingIds].sort(codeUnitCompare),
    "H0-TRACE-RULE-COVERAGE",
    "trace-ledger.json.traces[*].ruleIds",
    "Every normative analysis rule and scale mapping requires direct trace ownership.",
  );

  for (const filename of H0_TRACE_BEARING_FILES) {
    for (const traceId of stringArray(fixture(fixtures, filename)["traceIds"])) {
      const trace = traceById.get(traceId);
      if (trace === undefined) {
        finding(findings, "H0-FILE-TRACE-UNKNOWN", `${filename}.traceIds`, `Unknown linked trace ${traceId}.`);
      } else if (!stringArray(trace["fixtureFiles"]).includes(filename)) {
        finding(findings, "H0-TRACE-FILE-RECIPROCITY", `${filename}.traceIds`, `Trace ${traceId} does not link back to ${filename}.`);
      }
    }
  }

  requireUniqueIds(findings, decisionLedger, "provenance-ledger.json.decisionLedger");
  for (const [index, decision] of decisionLedger.entries()) {
    const linkedAuthorityIds = stringArray(decision["authorityIds"]);
    if (linkedAuthorityIds.length === 0) {
      finding(findings, "H0-DECISION-AUTHORITY-MISSING", `provenance-ledger.json.decisionLedger[${String(index)}].authorityIds`, "Every provenance decision must name at least one declared authority.");
    }
    for (const authorityId of linkedAuthorityIds) {
      if (!authorityIds.has(authorityId)) {
        finding(findings, "H0-DECISION-AUTHORITY-UNKNOWN", `provenance-ledger.json.decisionLedger[${String(index)}].authorityIds`, `Unknown decision authority ${authorityId}.`);
      } else {
        authorityUsage.add(authorityId);
      }
    }
  }
  for (const record of additionalAuthorityUsers) {
    for (const authorityId of stringArray(record["authorityIds"])) {
      if (!authorityIds.has(authorityId)) {
        finding(findings, "H0-AUTHORITY-LINK-UNKNOWN", "reviewed-authority-links", `Unknown linked authority ${authorityId}.`);
      } else {
        authorityUsage.add(authorityId);
      }
    }
  }
  for (const authorityId of authorityIds) {
    if (!authorityUsage.has(authorityId)) {
      finding(findings, "H0-AUTHORITY-ORPHAN", `provenance-ledger.json#${authorityId}`, "Every authority must support at least one reviewed trace, decision, rule table, or mapping.");
    }
  }

  requireExact(findings, [...lawIds].sort(codeUnitCompare), Array.from({ length: 25 }, (_, index) => `H0-LAW-${String(index + 1).padStart(3, "0")}`), "H0-LAW-INVENTORY", "law-cases.json.laws[*].id", "The packet must contain exactly H0-LAW-001 through H0-LAW-025.");
  requireExact(findings, [...mutationIds], H0_REVIEWED_MUTATION_IDS, "H0-MUTATION-INVENTORY", "mutation-controls.json.controls[*].id", "The packet must contain exactly H0-MUT-001 through H0-MUT-025 in order.");
  if (traceIds.size !== traces.length) {
    finding(findings, "H0-TRACE-ID-DUPLICATE", "trace-ledger.json.traces", "Trace IDs must be unique.");
  }
}

export async function validateH0Contract(
  fixtureRoot = DEFAULT_FIXTURE_ROOT,
  options: H0ContractValidationOptions = {},
): Promise<H0ContractValidationReport> {
  const findings: H0ContractFinding[] = [];
  const fixtures = await loadFixtures(
    fixtureRoot,
    findings,
    options.enforceDigests ?? true,
  );

  const contract = fixture(fixtures, CONTRACT_FILENAME);
  requireExact(findings, contract["status"], "independently-authored-pre-production", "H0-CONTRACT-STATUS", `${CONTRACT_FILENAME}.status`, "The specification packet must remain explicitly pre-production and independently authored.");
  requireExact(findings, contract["identity"], H0_REVIEWED_IDENTITY, "H0-CONTRACT-IDENTITY", `${CONTRACT_FILENAME}.identity`, "Public H0 schema, table, or policy identity drifted.");
  requireExact(findings, contract["operationIds"], H0_REVIEWED_OPERATION_IDS, "H0-CONTRACT-OPERATIONS", `${CONTRACT_FILENAME}.operationIds`, "Public operation order drifted.");
  requireExact(findings, contract["evidenceTiers"], H0_REVIEWED_EVIDENCE_TIERS, "H0-CONTRACT-TIERS", `${CONTRACT_FILENAME}.evidenceTiers`, "Evidence tiers must remain ordinal labels, never probabilities.");
  requireExact(findings, contract["dispositions"], H0_REVIEWED_DISPOSITIONS, "H0-CONTRACT-DISPOSITIONS", `${CONTRACT_FILENAME}.dispositions`, "Outcome dispositions drifted.");
  requireExact(findings, contract["classifications"], H0_REVIEWED_CLASSIFICATIONS, "H0-CONTRACT-CLASSIFICATIONS", `${CONTRACT_FILENAME}.classifications`, "Context classification vocabulary drifted.");
  requireExact(findings, contract["analysisRuleIds"], H0_REVIEWED_ANALYSIS_RULE_IDS, "H0-CONTRACT-RULES", `${CONTRACT_FILENAME}.analysisRuleIds`, "Analysis rule inventory/order drifted.");
  requireExact(findings, contract["scaleFamilies"], H0_REVIEWED_SCALE_FAMILIES, "H0-CONTRACT-SCALES", `${CONTRACT_FILENAME}.scaleFamilies`, "Scale-family inventory/order drifted.");
  requireExact(findings, contract["scaleMappingRuleIds"], H0_REVIEWED_SCALE_MAPPING_RULE_IDS, "H0-CONTRACT-SCALE-RULES", `${CONTRACT_FILENAME}.scaleMappingRuleIds`, "Scale mapping rule inventory/order drifted.");
  requireExact(findings, contract["refusalCodes"], H0_REVIEWED_REFUSAL_CODES, "H0-CONTRACT-REFUSALS", `${CONTRACT_FILENAME}.refusalCodes`, "Public refusal-code inventory/order drifted.");
  requireExact(findings, contract["limits"], H0_REVIEWED_LIMITS, "H0-CONTRACT-LIMITS", `${CONTRACT_FILENAME}.limits`, "Value, work, or memory bounds drifted.");
  requireExact(findings, contract["contextPolicy"], H0_REVIEWED_CONTEXT_POLICY, "H0-CONTEXT-POLICY", `${CONTRACT_FILENAME}.contextPolicy`, "Context adjacency, target, mode, or non-persistence policy drifted.");
  requireExact(findings, contract["readingOrder"], H0_REVIEWED_READING_ORDER, "H0-READING-ORDER", `${CONTRACT_FILENAME}.readingOrder`, "Context-reading order or tie-break policy drifted.");
  requireExact(findings, contract["scaleOptionOrder"], H0_REVIEWED_SCALE_OPTION_ORDER, "H0-SCALE-OPTION-ORDER", `${CONTRACT_FILENAME}.scaleOptionOrder`, "Chord-scale option order or plurality policy drifted.");
  requireExact(findings, contract["nonRefusalSuccesses"], H0_REVIEWED_NON_REFUSAL_SUCCESSES, "H0-NON-REFUSAL-SUCCESSES", `${CONTRACT_FILENAME}.nonRefusalSuccesses`, "Legitimate non-refusal outcomes drifted.");
  requireExact(findings, contract["independence"], {
    fixtureExpectedValuesMayImportProduction: false,
    fixtureExpectedValuesMayBeGeneratedByProduction: false,
    t1ReferencesAreFrozenSourceAuthorityNotExecutedOracles: true,
    judgmentBearingRowsRequirePublishedOrProjectPolicyAuthority: true,
    expertReviewClaimed: false,
  }, "H0-INDEPENDENCE-POLICY", `${CONTRACT_FILENAME}.independence`, "Fixture independence or authority policy drifted.");
  requireExact(findings, contract["expectedInventoryMinimums"], {
    sourceRoots: 12,
    analysisRules: 16,
    literalFactCases: 8,
    contextReadingCases: 24,
    romanRootModeSeedRows: 28,
    romanRootModeExpandedCells: 336,
    scaleMappings: 13,
    scaleCases: 30,
    transpositionCases: 24,
    lawCases: 25,
    limitBoundaryRows: 25,
    operationStateCases: 17,
    mutationControls: 25,
    traceRows: 30,
  }, "H0-INVENTORY-MINIMUMS", `${CONTRACT_FILENAME}.expectedInventoryMinimums`, "Reviewed corpus coverage minimums drifted.");
  requireExact(findings, contract["literalMatchWeights"], {
    root: 2,
    thirdOrSuspension: 2,
    seventh: 2,
    fifth: 1,
    eachColor: 1,
    representation: "integer-numerator-and-denominator-not-confidence-or-probability",
  }, "H0-MATCH-WEIGHTS", `${CONTRACT_FILENAME}.literalMatchWeights`, "Literal chord-match weights are normative exact integer evidence.");

  const contextPolicy = contract["contextPolicy"];
  if (isObject(contextPolicy)) {
    requireExact(findings, contextPolicy["adjacency"], "immediate-previous-and-immediate-next-only", "H0-CONTEXT-ADJACENCY", `${CONTRACT_FILENAME}.contextPolicy.adjacency`, "H0 v1 may inspect only the immediate three-event window.");
    requireExact(findings, contextPolicy["ordinaryDominant"], "tonic-target-is-ordinary-even-when-secondary-pattern-also-matches", "H0-TONIC-NOT-SECONDARY", `${CONTRACT_FILENAME}.contextPolicy.ordinaryDominant`, "Ordinary tonic dominant precedence drifted.");
    requireExact(findings, contextPolicy["absentKey"], "successful-unclassified-or-contextual-reading-never-inferred-or-persisted", "H0-ABSENT-KEY", `${CONTRACT_FILENAME}.contextPolicy.absentKey`, "An absent key must remain a successful nonpersisting outcome.");
    requireExact(findings, contextPolicy["customChord"], "successful-not-applicable-with-custom.no_degree_analysis", "H0-CUSTOM", `${CONTRACT_FILENAME}.contextPolicy.customChord`, "Custom chords cannot acquire invented semantic degrees.");
  } else {
    finding(findings, "H0-CONTEXT-POLICY", `${CONTRACT_FILENAME}.contextPolicy`, "A frozen context policy object is required.");
  }

  const containment = contract["degreeContainment"];
  if (isObject(containment)) {
    requireExact(findings, containment, {
      sameAlterationRequired: true,
      pitchClassOnlyMatchForbidden: true,
      compoundEquivalenceClasses: [[2, 9], [4, 11], [6, 13]],
      forbiddenCollapses: ["#9=b3", "#5=b13", "bb7=6", "#4=b5"],
      selectedAlteredRealizationRequired: true,
    }, "H0-CONTAINMENT", `${CONTRACT_FILENAME}.degreeContainment`, "Degree-class containment or altered-realization policy drifted.");
    requireExact(findings, containment["sameAlterationRequired"], true, "H0-CONTAINMENT", `${CONTRACT_FILENAME}.degreeContainment.sameAlterationRequired`, "Compound-degree matching must retain alteration.");
    requireExact(findings, containment["pitchClassOnlyMatchForbidden"], true, "H0-CONTAINMENT", `${CONTRACT_FILENAME}.degreeContainment.pitchClassOnlyMatchForbidden`, "Pitch-class equality cannot replace spelled degree evidence.");
    requireExact(findings, containment["forbiddenCollapses"], ["#9=b3", "#5=b13", "bb7=6", "#4=b5"], "H0-CONTAINMENT", `${CONTRACT_FILENAME}.degreeContainment.forbiddenCollapses`, "Required spelling distinctions drifted.");
    requireExact(findings, containment["selectedAlteredRealizationRequired"], true, "H0-ALTERED-REALIZATION", `${CONTRACT_FILENAME}.degreeContainment.selectedAlteredRealizationRequired`, "The four T1 altered realizations may not be merged.");
  }

  const source = fixture(fixtures, "source-catalog.json");
  const roots = objectArray(source["rootInventory"]);
  const chords = objectArray(source["chords"]);
  const contexts = objectArray(source["contexts"]);
  requireUniqueIds(findings, roots, "source-catalog.json.rootInventory");
  requireUniqueIds(findings, chords, "source-catalog.json.chords");
  requireUniqueIds(findings, contexts, "source-catalog.json.contexts");
  validateSourceCatalog(findings, source, roots, chords, contexts);
  requireExact(findings, roots.length, 12, "H0-ROOT-INVENTORY", "source-catalog.json.rootInventory", "The reviewed transposition matrix uses exactly twelve canonical written roots.");
  const pitchClasses = roots.map((root) => root["pitchClass"]);
  requireExact(findings, [...pitchClasses].sort((left, right) => Number(left) - Number(right)), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], "H0-ROOT-INVENTORY", "source-catalog.json.rootInventory[*].pitchClass", "Canonical roots must cover every pitch class exactly once.");

  const analysisFixture = fixture(fixtures, "analysis-rules.json");
  requireExact(
    findings,
    {
      tableId: analysisFixture["tableId"],
      tableVersion: analysisFixture["tableVersion"],
      authorityIds: analysisFixture["authorityIds"],
    },
    H0_REVIEWED_ANALYSIS_TABLE_IDENTITY,
    "H0-ANALYSIS-TABLE-IDENTITY",
    "analysis-rules.json",
    "Analysis table ID, version, or authority inventory drifted.",
  );
  const analysisRules = objectArray(analysisFixture["rules"]);
  const analysisProofOwnership = objectArray(analysisFixture["proofOwnership"]);
  const analysisRuleIds = requireUniqueIds(findings, analysisRules, "analysis-rules.json.rules");
  requireExact(findings, analysisRuleIds, H0_REVIEWED_ANALYSIS_RULE_IDS, "H0-ANALYSIS-RULE-INVENTORY", "analysis-rules.json.rules[*].id", "The reviewed rules must match the public inventory in deterministic order.");
  requireReviewedPayloadDigest(findings, analysisRules, H0_REVIEWED_ANALYSIS_RULES_DIGEST, "H0-ANALYSIS-RULE-PAYLOAD", "analysis-rules.json.rules");

  const literalCases = objectArray(fixture(fixtures, "literal-fact-cases.json")["cases"]);
  const contextFixture = fixture(fixtures, "context-reading-cases.json");
  const contextCases = objectArray(contextFixture["cases"]);
  requireReviewedPayloadDigest(findings, literalCases, H0_REVIEWED_LITERAL_CASES_DIGEST, "H0-LITERAL-CASE-PAYLOAD", "literal-fact-cases.json.cases");
  requireReviewedPayloadDigest(findings, contextCases, H0_REVIEWED_CONTEXT_CASES_DIGEST, "H0-CONTEXT-CASE-PAYLOAD", "context-reading-cases.json.cases");
  requireExact(findings, contextFixture["fixturePolicy"], H0_REVIEWED_CONTEXT_FIXTURE_POLICY, "H0-CONTEXT-FIXTURE-POLICY", "context-reading-cases.json.fixturePolicy", "Context fixture adjacency, ordering, and prose-comparison independence policy drifted.");
  requireUniqueIds(findings, literalCases, "literal-fact-cases.json.cases");
  requireUniqueIds(findings, contextCases, "context-reading-cases.json.cases");
  requireMinimum(findings, literalCases.length, 8, "H0-LITERAL-COVERAGE", "literal-fact-cases.json.cases");
  requireMinimum(findings, contextCases.length, 24, "H0-CONTEXT-COVERAGE", "context-reading-cases.json.cases");
  validateCriticalContextWitnesses(findings, contextCases);

  const romanMatrix = fixture(fixtures, "roman-root-mode-matrix.json");
  requireExact(findings, romanMatrix["independentOracle"], H0_REVIEWED_ROMAN_INDEPENDENT_ORACLE, "H0-ROMAN-INDEPENDENT-ORACLE", "roman-root-mode-matrix.json.independentOracle", "Roman oracle must remain independent of the production analyzer and spelling projection shortcuts.");
  const modeSeeds = objectArray(romanMatrix["modeSeeds"]);
  requireUniqueIds(findings, modeSeeds, "roman-root-mode-matrix.json.modeSeeds");
  requireExact(findings, modeSeeds.length, 28, "H0-ROMAN-MATRIX", "roman-root-mode-matrix.json.modeSeeds", "Four modes times seven scale degrees require 28 reviewed seed rows.");
  const matrix = romanMatrix["matrix"];
  const romanCellCount = isObject(matrix)
    ? objectArray(matrix["cells"]).length
    : 0;
  if (isObject(matrix)) {
    requireExact(findings, matrix["rootCount"], 12, "H0-ROMAN-MATRIX", "roman-root-mode-matrix.json.matrix.rootCount", "Roman matrix root count drifted.");
    requireExact(findings, matrix["seedCount"], 28, "H0-ROMAN-MATRIX", "roman-root-mode-matrix.json.matrix.seedCount", "Roman matrix seed count drifted.");
    requireExact(findings, matrix["expectedCellCount"], 336, "H0-ROMAN-MATRIX", "roman-root-mode-matrix.json.matrix.expectedCellCount", "The 28 by 12 matrix must have 336 cells and no exclusions.");
    requireExact(findings, matrix["excludedCells"], [], "H0-ROMAN-MATRIX", "roman-root-mode-matrix.json.matrix.excludedCells", "No canonical transposition cell may be silently excluded.");
  } else {
    finding(findings, "H0-ROMAN-MATRIX", "roman-root-mode-matrix.json.matrix", "A reviewed matrix declaration is required.");
  }

  const scaleFixture = fixture(fixtures, "chord-scale-cases.json");
  const transpositionFixture = fixture(fixtures, "transposition-cases.json");
  requireExact(findings, transpositionFixture["independenceStatement"], H0_REVIEWED_TRANSPOSITION_INDEPENDENCE_STATEMENT, "H0-TRANSPOSITION-INDEPENDENCE", "transposition-cases.json.independenceStatement", "Transposition expectations must remain reviewed declarative input, never copied production output.");
  const operationFixture = fixture(fixtures, "operation-state-cases.json");
  const mutationFixture = fixture(fixtures, "mutation-controls.json");
  const traceFixture = fixture(fixtures, "trace-ledger.json");
  const scaleMappingFixture = fixture(fixtures, "chord-scale-mappings.json");
  requireExact(
    findings,
    {
      tableId: scaleMappingFixture["tableId"],
      tableVersion: scaleMappingFixture["tableVersion"],
      containmentPolicy: scaleMappingFixture["containmentPolicy"],
    },
    H0_REVIEWED_SCALE_TABLE_IDENTITY,
    "H0-SCALE-TABLE-IDENTITY",
    "chord-scale-mappings.json",
    "Scale table ID, version, or containment policy drifted.",
  );
  const scaleMappings = objectArray(scaleMappingFixture["mappings"]);
  const scaleProofOwnership = objectArray(scaleMappingFixture["proofOwnership"]);
  const scaleCases = objectArray(scaleFixture["cases"]);
  const transpositionCases = objectArray(transpositionFixture["cases"]);
  const lawCases = objectArray(fixture(fixtures, "law-cases.json")["laws"]);
  const limitFixture = fixture(fixtures, "limit-cases.json");
  const limitRows = objectArray(limitFixture["boundaryRows"]);
  const operationStates = objectArray(operationFixture["cases"]);
  const mutationControls = objectArray(mutationFixture["controls"]);
  const provenance = fixture(fixtures, "provenance-ledger.json");
  const authorities = objectArray(provenance["authorities"]);
  const traces = objectArray(traceFixture["traces"]);

  requireReviewedPayloadDigest(findings, scaleCases, H0_REVIEWED_SCALE_CASES_DIGEST, "H0-SCALE-CASE-PAYLOAD", "chord-scale-cases.json.cases");
  requireReviewedPayloadDigest(findings, traces, H0_REVIEWED_TRACE_ROWS_DIGEST, "H0-TRACE-PAYLOAD", "trace-ledger.json.traces");
  requireReviewedPayloadDigest(findings, scaleMappings, H0_REVIEWED_SCALE_MAPPINGS_DIGEST, "H0-SCALE-MAPPING-PAYLOAD", "chord-scale-mappings.json.mappings");
  requireReviewedPayloadDigest(findings, lawCases, H0_REVIEWED_LAWS_DIGEST, "H0-LAW-PAYLOAD", "law-cases.json.laws");
  requireReviewedPayloadDigest(findings, mutationControls, H0_REVIEWED_MUTATION_CONTROLS_DIGEST, "H0-MUTATION-PAYLOAD", "mutation-controls.json.controls");

  const scaleMappingIds = requireUniqueIds(findings, scaleMappings, "chord-scale-mappings.json.mappings");
  requireExact(findings, scaleMappingIds, H0_REVIEWED_SCALE_MAPPING_RULE_IDS, "H0-SCALE-MAPPING-INVENTORY", "chord-scale-mappings.json.mappings[*].id", "Each public scale mapping needs exactly one reviewed row in public order.");
  requireUniqueIds(findings, scaleCases, "chord-scale-cases.json.cases");
  requireUniqueIds(findings, transpositionCases, "transposition-cases.json.cases");
  requireUniqueIds(findings, lawCases, "law-cases.json.cases");
  requireUniqueIds(findings, limitRows, "limit-cases.json.rows");
  requireUniqueIds(findings, operationStates, "operation-state-cases.json.cases");
  requireUniqueIds(findings, mutationControls, "mutation-controls.json.controls");
  const authorityIds = requireUniqueIds(findings, authorities, "provenance-ledger.json.authorities");
  const traceIds = requireUniqueIds(findings, traces, "trace-ledger.json.traces");

  requireExact(
    findings,
    authorityIds,
    H0_REVIEWED_AUTHORITY_IDS,
    "H0-AUTHORITY-INVENTORY",
    "provenance-ledger.json.authorities[*].id",
    "The packet must contain exactly the seven reviewed authority IDs in order.",
  );
  requireExact(
    findings,
    traceIds,
    H0_REVIEWED_TRACE_IDS,
    "H0-TRACE-INVENTORY",
    "trace-ledger.json.traces[*].id",
    "The packet must contain exactly the thirty reviewed trace IDs in order.",
  );
  requireExact(
    findings,
    traceFixture["stableTraceIdsOnly"],
    true,
    "H0-TRACE-STABLE-IDS",
    "trace-ledger.json.stableTraceIdsOnly",
    "Trace IDs are a closed stable vocabulary.",
  );
  requireExact(
    findings,
    traceFixture["reciprocityPolicy"],
    H0_REVIEWED_TRACE_RECIPROCITY_POLICY,
    "H0-TRACE-RECIPROCITY-POLICY",
    "trace-ledger.json.reciprocityPolicy",
    "Trace reciprocity obligations drifted.",
  );
  requireExact(
    findings,
    operationFixture["states"],
    H0_REVIEWED_OPERATION_STATES,
    "H0-OPERATION-STATE-VOCABULARY",
    "operation-state-cases.json.states",
    "Operation-state vocabulary or order drifted.",
  );
  requireExact(
    findings,
    operationStates,
    H0_REVIEWED_OPERATION_STATE_CASES,
    "H0-OPERATION-STATE-CASES",
    "operation-state-cases.json.cases",
    "Operation-state IDs, operations, setups, outcomes, or refusal paths drifted.",
  );

  requireMinimum(findings, scaleMappings.length, 13, "H0-SCALE-MAPPING-COVERAGE", "chord-scale-mappings.json.mappings");
  requireMinimum(findings, scaleCases.length, 30, "H0-SCALE-CASE-COVERAGE", "chord-scale-cases.json.cases");
  requireExact(findings, transpositionCases.length, 24, "H0-TRANSPOSITION-COVERAGE", "transposition-cases.json.cases", "The reviewed packet requires sixteen all-root declarations and eight spelling stress cases.");
  requireMinimum(findings, lawCases.length, 20, "H0-LAW-COVERAGE", "law-cases.json.cases");
  requireExact(findings, limitRows.length, 25, "H0-LIMIT-COVERAGE", "limit-cases.json.rows", "The reviewed packet requires exactly 25 boundary rows.");
  requireExact(findings, operationStates.length, 17, "H0-OPERATION-COVERAGE", "operation-state-cases.json.cases", "The reviewed packet requires exactly 17 operation-state rows.");
  requireExact(findings, mutationControls.length, 25, "H0-MUTATION-COVERAGE", "mutation-controls.json.controls", "The reviewed packet requires exactly 25 mutation controls.");
  requireExact(findings, authorities.length, 7, "H0-AUTHORITY-COVERAGE", "provenance-ledger.json.authorities", "The reviewed packet requires exactly seven authority rows.");
  requireExact(findings, traces.length, 30, "H0-TRACE-COVERAGE", "trace-ledger.json.traces", "The reviewed packet requires exactly thirty trace rows.");
  requireExact(findings, mutationFixture["requiredFaultFamilies"], H0_REVIEWED_FAULT_FAMILIES, "H0-MUTATION-FAULT-FAMILIES", "mutation-controls.json.requiredFaultFamilies", "The reviewed mutation fault-family inventory/order drifted.");
  requireExact(findings, mutationFixture["reviewPolicy"], {
    everyControlHasKillerCase: true,
    everyControlLinksLaw: true,
    fixtureMutationsDoNotExecuteProduction: true,
  }, "H0-MUTATION-REVIEW-POLICY", "mutation-controls.json.reviewPolicy", "Mutation review obligations drifted.");
  requireExact(findings, mutationFixture["reviewState"], "independently-authored-pre-production", "H0-MUTATION-REVIEW-STATE", "mutation-controls.json.reviewState", "Mutation controls must remain independently authored and pre-production.");

  const caseOwners = new Map<string, H0FixtureFilename>();
  registerCaseOwners(findings, caseOwners, literalCases, "literal-fact-cases.json");
  registerCaseOwners(findings, caseOwners, contextCases, "context-reading-cases.json");
  registerCaseOwners(findings, caseOwners, modeSeeds, "roman-root-mode-matrix.json");
  registerCaseOwners(findings, caseOwners, objectArray(romanMatrix["enharmonicStressRows"]), "roman-root-mode-matrix.json");
  if (isObject(matrix)) {
    registerSyntheticCaseOwner(findings, caseOwners, matrix["id"], "roman-root-mode-matrix.json", "roman-root-mode-matrix.json.matrix.id");
  }
  registerCaseOwners(findings, caseOwners, scaleCases, "chord-scale-cases.json");
  if (isObject(scaleFixture["rootExpansion"])) {
    registerSyntheticCaseOwner(findings, caseOwners, scaleFixture["rootExpansion"]["id"], "chord-scale-cases.json", "chord-scale-cases.json.rootExpansion.id");
  }
  registerCaseOwners(findings, caseOwners, transpositionCases, "transposition-cases.json");
  registerCaseOwners(findings, caseOwners, limitRows, "limit-cases.json");
  registerCaseOwners(findings, caseOwners, objectArray(limitFixture["combinedPrecedenceCases"]), "limit-cases.json");
  registerSyntheticCaseOwner(findings, caseOwners, limitFixture["boundaryMatrixId"], "limit-cases.json", "limit-cases.json.boundaryMatrixId");
  registerCaseOwners(findings, caseOwners, operationStates, "operation-state-cases.json");
  registerCaseOwners(findings, caseOwners, lawCases, "law-cases.json");
  registerCaseOwners(findings, caseOwners, mutationControls, "mutation-controls.json");

  const analysisRuleSet = new Set(analysisRuleIds);
  const scaleMappingSet = new Set(scaleMappingIds);
  const authoritySet = new Set(authorityIds);
  validateClosedSourceReferences(
    findings,
    chords,
    contexts,
    literalCases,
    contextCases,
    scaleCases,
    transpositionCases,
    operationStates,
    analysisRuleSet,
    scaleMappingSet,
  );
  validateMatrixDeclarations(
    findings,
    roots,
    analysisRules,
    literalCases,
    contextCases,
    modeSeeds,
    romanMatrix,
    scaleMappings,
    scaleFixture,
    transpositionFixture,
    transpositionCases,
  );
  validateCriticalRuleAndMappingPayloads(
    findings,
    analysisRules,
    scaleMappings,
    scaleCases,
  );
  const mutationIdSet = new Set(
    mutationControls
      .map(recordId)
      .filter((id): id is string => id !== null),
  );
  const traceById = byId(traces);
  validateProofOwnership(
    findings,
    analysisProofOwnership,
    H0_REVIEWED_ANALYSIS_RULE_IDS,
    H0_REVIEWED_ANALYSIS_PROOF_OWNERSHIP_DIGEST,
    "analysis-rules.json.proofOwnership",
    caseOwners,
    mutationIdSet,
    traceById,
  );
  validateProofOwnership(
    findings,
    scaleProofOwnership,
    H0_REVIEWED_SCALE_MAPPING_RULE_IDS,
    H0_REVIEWED_SCALE_PROOF_OWNERSHIP_DIGEST,
    "chord-scale-mappings.json.proofOwnership",
    caseOwners,
    mutationIdSet,
    traceById,
  );
  validateLawMutationTraceGraph(
    findings,
    fixtures,
    caseOwners,
    lawCases,
    mutationControls,
    traces,
    analysisRuleSet,
    scaleMappingSet,
    authoritySet,
    objectArray(provenance["decisionLedger"]),
    [fixture(fixtures, "analysis-rules.json"), ...scaleMappings],
  );

  validateBoundaryRows(findings, limitRows);
  requireExact(findings, limitFixture["boundaryMatrixId"], "H0-LIMIT-BOUNDARY-MATRIX-001", "H0-LIMIT-MATRIX-ID", "limit-cases.json.boundaryMatrixId", "Boundary matrix identity drifted.");
  requireExact(findings, limitFixture["terminationEvidence"], {
    wallTimeIsSemanticCutoff: false,
    exactCountersRequired: [
      "analysisRuleEvaluations",
      "scaleMappingEvaluations",
      "degreeComparisons",
      "emittedRecords",
      "trackedRecords",
    ],
    silentTruncationForbidden: true,
  }, "H0-TERMINATION-EVIDENCE", "limit-cases.json.terminationEvidence", "Deterministic termination evidence drifted.");
  requireExact(findings, limitFixture["combinedPrecedenceCases"], [
    {
      id: "H0-LIMIT-PRECEDENCE-001",
      violations: ["requestIdAsciiCharacters", "baseRevision", "contextEvents"],
      expectedRefusalCode: "harmony.request_id_invalid",
    },
    {
      id: "H0-LIMIT-PRECEDENCE-002",
      violations: ["baseRevision", "contextEvents", "analysisRuleEvaluations"],
      expectedRefusalCode: "harmony.base_revision_invalid",
    },
    {
      id: "H0-LIMIT-PRECEDENCE-003",
      violations: ["contextEvents", "readings", "scaleOptions"],
      expectedRefusalCode: "limit.harmony_context_events_exceeded",
    },
    {
      id: "H0-LIMIT-PRECEDENCE-004",
      violations: ["readings", "scaleOptions", "evidencePerReading"],
      expectedRefusalCode: "limit.harmony_readings_exceeded",
    },
    {
      id: "H0-LIMIT-PRECEDENCE-005",
      violations: ["scaleOptions", "evidencePerReading", "degreeComparisons"],
      expectedRefusalCode: "limit.harmony_scale_options_exceeded",
    },
  ], "H0-LIMIT-PRECEDENCE-CASES", "limit-cases.json.combinedPrecedenceCases", "Combined limit-precedence witnesses drifted.");

  requireExact(
    findings,
    fixture(fixtures, "operation-state-cases.json")["refusalPrecedence"],
    H0_REVIEWED_REFUSAL_PRECEDENCE,
    "H0-REFUSAL-PRECEDENCE",
    "operation-state-cases.json.refusalPrecedence",
    "Combined refusal precedence must be code-major and deterministic.",
  );

  requireLinkedIds(findings, scaleMappings, "authorityIds", authoritySet, "chord-scale-mappings.json.mappings");
  const analysisAuthorityIds = stringArray(fixture(fixtures, "analysis-rules.json")["authorityIds"]);
  if (analysisAuthorityIds.length === 0) {
    finding(findings, "H0-LINK-MISSING", "analysis-rules.json.authorityIds", "The normative analysis rule table must link at least one reviewed authority.");
  }
  for (const authorityId of analysisAuthorityIds) {
    if (!authoritySet.has(authorityId)) {
      finding(findings, "H0-LINK-UNKNOWN", "analysis-rules.json.authorityIds", `Unknown linked authority ${authorityId}.`);
    }
  }
  const reviewedTraceSet = new Set(traceIds);
  for (const filename of H0_TRACE_BEARING_FILES) {
    const links = stringArray(fixture(fixtures, filename)["traceIds"]);
    requireExact(
      findings,
      links,
      H0_REVIEWED_FILE_TRACE_IDS[filename],
      "H0-FILE-TRACE-INVENTORY",
      `${filename}.traceIds`,
      "Fixture-root trace ownership drifted from the reviewed reciprocal map.",
    );
    if (links.length === 0) {
      finding(findings, "H0-LINK-MISSING", `${filename}.traceIds`, "Each reviewed artifact class must link to at least one trace.");
    }
    for (const link of links) {
      if (!reviewedTraceSet.has(link)) {
        finding(findings, "H0-LINK-UNKNOWN", `${filename}.traceIds`, `Unknown linked trace ${link}.`);
      }
    }
  }

  requireExact(
    findings,
    provenance["authoringStatement"],
    H0_REVIEWED_PROVENANCE_AUTHORING_STATEMENT,
    "H0-PROVENANCE-AUTHORING",
    "provenance-ledger.json.authoringStatement",
    "The independent authoring claim drifted.",
  );
  requireExact(
    findings,
    provenance["independenceRules"],
    H0_REVIEWED_PROVENANCE_INDEPENDENCE_RULES,
    "H0-PROVENANCE-INDEPENDENCE",
    "provenance-ledger.json.independenceRules",
    "Provenance independence rules drifted.",
  );
  requireExact(
    findings,
    authorities,
    H0_REVIEWED_AUTHORITIES,
    "H0-PROVENANCE-AUTHORITIES",
    "provenance-ledger.json.authorities",
    "Authority classes, sources, claims, limitations, or review tiers drifted.",
  );
  requireExact(
    findings,
    provenance["decisionLedger"],
    H0_REVIEWED_PROVENANCE_DECISIONS,
    "H0-PROVENANCE-DECISIONS",
    "provenance-ledger.json.decisionLedger",
    "Provenance decisions or their exact authority ownership drifted.",
  );

  const publishedAuthorities = authorities.filter((authority) => authority["authorityClass"] === "published-reference");
  requireMinimum(findings, publishedAuthorities.length, 2, "H0-PUBLISHED-AUTHORITY", "provenance-ledger.json.authorities");
  const expertClaims = authorities.filter((authority) => authority["authorityClass"] === "expert-reviewed");
  requireExact(findings, expertClaims.length, 0, "H0-AUTHORITY-HONESTY", "provenance-ledger.json.authorities", "The specification packet has no qualified-musician sign-off and must not claim one.");
  requireExact(findings, provenance["allowedAuthorityClasses"], H0_REVIEWED_AUTHORITY_CLASSES, "H0-AUTHORITY-CLASSES", "provenance-ledger.json.allowedAuthorityClasses", "Authority classes drifted from the closed reviewed vocabulary.");
  requireExact(findings, provenance["expertReviewClaimed"], false, "H0-AUTHORITY-HONESTY", "provenance-ledger.json.expertReviewClaimed", "The packet must not claim expert review that did not occur.");
  const allowedAuthorityClasses = new Set<string>(H0_REVIEWED_AUTHORITY_CLASSES);
  for (const [index, authority] of authorities.entries()) {
    if (!allowedAuthorityClasses.has(String(authority["authorityClass"]))) {
      finding(findings, "H0-AUTHORITY-CLASS", `provenance-ledger.json.authorities[${String(index)}].authorityClass`, "Authority record uses an undeclared class.");
    }
  }

  const operationIds = new Set(operationStates.map(recordId).filter((id): id is string => id !== null));
  const applicabilityCase = byId(operationStates).get("H0-OP-STATE-017");
  requireExact(
    findings,
    applicabilityCase,
    H0_REVIEWED_OPERATION_STATE_CASES[16],
    "H0-OPERATION-APPLICABILITY",
    "operation-state-cases.json#H0-OP-STATE-017",
    "Pure-operation applicability must retain exact keys and not-applicable outcomes.",
  );
  if (operationIds.size !== operationStates.length) {
    finding(findings, "H0-OPERATION-ID", "operation-state-cases.json.cases", "Operation-state IDs must be unique.");
  }

  const mutationIds = new Set(mutationControls.map(recordId).filter((id): id is string => id !== null));
  for (let ordinal = 1; ordinal <= 25; ordinal += 1) {
    const id = `H0-MUT-${String(ordinal).padStart(3, "0")}`;
    if (!mutationIds.has(id)) {
      finding(findings, "H0-MUTATION-ID", "mutation-controls.json.controls", `Required mutation control ${id} is missing.`);
    }
  }

  const report: H0ContractValidationReport = {
    schema: "changes.validation.h0-contract.v1",
    package: "H0",
    outcome: findings.length === 0 ? "pass" : "fail",
    counts: {
      companions: H0_REVIEWED_COMPANIONS.length,
      sourceRoots: roots.length,
      sourceChords: chords.length,
      sourceContexts: contexts.length,
      analysisRules: analysisRules.length,
      literalFactCases: literalCases.length,
      contextReadingCases: contextCases.length,
      romanRootModeSeeds: modeSeeds.length,
      romanRootModeCells: romanCellCount,
      scaleMappings: scaleMappings.length,
      scaleCases: scaleCases.length,
      scaleRootPolarityCells: isObject(scaleFixture["rootExpansion"])
        ? objectArray(scaleFixture["rootExpansion"]["cells"]).length
        : 0,
      transpositionCases: transpositionCases.length,
      lawCases: lawCases.length,
      limitRows: limitRows.length,
      operationStateCases: operationStates.length,
      mutationControls: mutationControls.length,
      authorities: authorities.length,
      traces: traces.length,
    },
    findings: findings.sort((left, right) => {
      const codeOrder = codeUnitCompare(left.code, right.code);
      return codeOrder === 0 ? codeUnitCompare(left.path, right.path) : codeOrder;
    }),
  };
  return report;
}

if (import.meta.main) {
  const report = await validateH0Contract();
  console.log(JSON.stringify(report, null, 2));
  if (report.outcome !== "pass") process.exitCode = 1;
}
