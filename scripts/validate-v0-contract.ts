import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type JsonObject = Record<string, unknown>;

export type V0ContractFinding = Readonly<{
  code: string;
  path: string;
  message: string;
}>;

export type V0ContractValidationReport = Readonly<{
  schema: "changes.validation.v0-contract.v1";
  package: "V0";
  outcome: "pass" | "fail";
  counts: Readonly<{
    companions: number;
    realizationClasses: number;
    adaptiveTemplates: number;
    fixedTemplates: number;
    quartalTemplates: number;
    registerPolicies: number;
    availabilitySeeds: number;
    availabilityCells: number;
    candidateCases: number;
    lawCases: number;
    lawWitnesses: number;
    operationStateCases: number;
    limitCases: number;
    transpositionSeeds: number;
    transpositionRootCells: number;
    mutationControls: number;
    traces: number;
    authorities: number;
  }>;
  findings: readonly V0ContractFinding[];
}>;

const CONTRACT_FILENAME = "v0-voicing-contract.json" as const;
const DEFAULT_FIXTURE_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../tests/fixtures/voicing",
);
const T1_FORMULA_FIXTURE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../tests/fixtures/resolution/formula-rules.json",
);

export const V0_REVIEWED_COMPANIONS = Object.freeze([
  "family-templates.json",
  "availability-matrix.json",
  "candidate-cases.json",
  "law-cases.json",
  "operation-state-cases.json",
  "limit-cases.json",
  "transposition-seeds.json",
  "mutation-controls.json",
  "provenance-ledger.json",
  "trace-ledger.json",
] as const);

const EXPECTED_FILES = [CONTRACT_FILENAME, ...V0_REVIEWED_COMPANIONS] as const;
type FixtureFilename = (typeof EXPECTED_FILES)[number];
const EXPECTED_SCHEMAS: Readonly<Record<FixtureFilename, string>> = {
  "v0-voicing-contract.json": "changes.fixtures.v0-voicing-contract.v1",
  "family-templates.json": "changes.fixtures.v0-family-templates.v1",
  "availability-matrix.json": "changes.fixtures.v0-availability-matrix.v1",
  "candidate-cases.json": "changes.fixtures.v0-candidate-cases.v1",
  "law-cases.json": "changes.fixtures.v0-law-cases.v1",
  "operation-state-cases.json": "changes.fixtures.v0-operation-state-cases.v1",
  "limit-cases.json": "changes.fixtures.v0-limit-cases.v1",
  "transposition-seeds.json": "changes.fixtures.v0-transposition-seeds.v1",
  "mutation-controls.json": "changes.fixtures.v0-mutation-controls.v1",
  "provenance-ledger.json": "changes.fixtures.v0-provenance-ledger.v1",
  "trace-ledger.json": "changes.fixtures.v0-trace-ledger.v1",
};

const EXPECTED_TOP_LEVEL_KEYS: Readonly<Record<FixtureFilename, readonly string[]>> = {
  "v0-voicing-contract.json": [
    "applicability", "bassPolicies", "bassPolicy", "candidateIdentity",
    "candidateOrder", "candidatePayloadLimits", "companionFiles", "constraintCodes",
    "constraintObservationPolicy", "constraintUnsatisfiedReasons", "degreePolicy", "expectedValuesGenerated",
    "families", "familyLaws", "fixtureVersion", "identifierLimits", "identity", "limits",
    "localScore", "lowRegisterSpacing", "matrix", "memoryLimits", "ownership",
    "productionOutputUsed", "qualityClasses", "qualityClassification",
    "quartalContextInvalidReasonsInPrecedenceOrder",
    "refusalCodesInPrecedenceOrder", "requestPolicy", "schema",
    "selectionPhases", "status", "stringAndStepOrder", "terminationByRefusalCode",
    "terminations", "trackedRecordAccounting", "voiceCounts", "workLimits",
  ],
  "family-templates.json": [
    "adaptiveFamilies", "checksums", "degreePolicy", "expectedValuesGenerated", "fixedTemplates",
    "fixtureVersion", "lowRegisterSpacing", "productionOutputUsed",
    "quartalTemplates", "realizationClasses", "registerPolicies", "schema", "status",
    "templateTableId", "templateTableVersion", "unavailablePolicies",
  ],
  "availability-matrix.json": [
    "axes", "cells", "checksums", "counts", "decisionPolicy",
    "expectedValuesGenerated", "fixtureVersion", "identity", "matrixId",
    "matrixVersion", "productionGeneratedExpectedValues", "productionOutputUsed",
    "provenance", "realizationSeeds", "review", "schema", "status",
  ],
  "candidate-cases.json": [
    "casePolicy", "cases", "expectedValuesGenerated", "fixtureVersion",
    "pitchConvention", "productionOutputUsed", "schema", "status",
  ],
  "law-cases.json": [
    "cases", "checksums", "expectedValuesGenerated", "fixtureVersion", "lawProofPolicy",
    "productionOutputUsed", "schema", "status", "witnesses",
  ],
  "operation-state-cases.json": [
    "caseSetId", "caseSetVersion", "checksums", "counts", "expectedValuesGenerated",
    "fixtureVersion", "forbiddenRequestAndAmbientInputs", "identity",
    "notApplicableCases", "orders", "precedenceCases",
    "productionGeneratedExpectedValues", "productionOutputUsed", "provenance",
    "refusalCases", "review", "schema", "statePolicy", "status", "successCases",
    "terminationByOutcome", "zeroWorkEvidence",
  ],
  "limit-cases.json": [
    "caseSetId", "caseSetVersion", "checksums", "counterBoundaryCases",
    "counterOrder", "counts", "expectedValuesGenerated", "fixtureVersion", "identity",
    "identifierBoundaryCases", "identifierPolicy", "inheritedDomainBoundaryPolicy",
    "limitPolicy", "limits", "midiBoundaryCases",
    "productionGeneratedExpectedValues", "productionOutputUsed", "provenance",
    "retentionCases", "review", "schema", "status", "wallTimeCases",
    "wallTimePolicy",
  ],
  "transposition-seeds.json": [
    "checksums", "enharmonicNearMissPairs", "expectedValuesGenerated", "fixtureVersion", "matrix",
    "oracle", "productionOutputUsed", "roots", "schema", "seeds", "status",
  ],
  "mutation-controls.json": [
    "checksums", "controls", "expectedValuesGenerated", "fixtureVersion", "productionOutputUsed",
    "requiredFaultFamilies", "review", "schema", "status",
  ],
  "provenance-ledger.json": [
    "authoringStatement", "authorities", "authorityClasses", "expectedValuesGenerated",
    "fixtureVersion", "productionOutputUsed", "schema", "status",
  ],
  "trace-ledger.json": [
    "caseLinkPolicy", "expectedValuesGenerated", "fixtureVersion", "parentClaims",
    "productionOutputUsed", "schema", "stableTraceIdsOnly", "status", "traces",
  ],
};

const FAMILIES = [
  "balanced", "shell", "rootless-a", "rootless-b", "open", "drop2", "quartal",
] as const;
const VOICE_COUNTS = [3, 4, 5, 6, 7] as const;
const QUALITY_CLASSES = [
  "major-triad", "minor-triad", "diminished-triad", "augmented-triad",
  "suspended-triad", "power-triad", "major-sixth", "minor-sixth",
  "major-seventh", "dominant-seventh", "minor-seventh", "minor-major-seventh",
  "half-diminished-seventh", "diminished-seventh", "augmented-major-seventh",
  "suspended-dominant",
] as const;
const QUALITY_CLASSIFICATION = [
  { qualityClass: "major-triad", formulaRuleIds: ["base-major"] },
  { qualityClass: "minor-triad", formulaRuleIds: ["base-minor"] },
  { qualityClass: "diminished-triad", formulaRuleIds: ["base-diminished"] },
  { qualityClass: "augmented-triad", formulaRuleIds: ["base-augmented"] },
  { qualityClass: "suspended-triad", formulaRuleIds: ["base-sus2", "base-sus4"] },
  { qualityClass: "power-triad", formulaRuleIds: ["base-power"] },
  { qualityClass: "major-sixth", formulaRuleIds: ["sixth-major"] },
  { qualityClass: "minor-sixth", formulaRuleIds: ["sixth-minor"] },
  { qualityClass: "major-seventh", formulaRuleIds: ["seventh-major", "extension-major"] },
  { qualityClass: "dominant-seventh", formulaRuleIds: ["seventh-dominant", "extension-dominant", "altered-dominant"] },
  { qualityClass: "minor-seventh", formulaRuleIds: ["seventh-minor", "extension-minor"] },
  { qualityClass: "minor-major-seventh", formulaRuleIds: ["seventh-minor-major"] },
  { qualityClass: "half-diminished-seventh", formulaRuleIds: ["seventh-half-diminished"] },
  { qualityClass: "diminished-seventh", formulaRuleIds: ["seventh-diminished"] },
  { qualityClass: "augmented-major-seventh", formulaRuleIds: ["seventh-augmented-major"] },
  { qualityClass: "suspended-dominant", formulaRuleIds: ["extension-suspended-dominant"] },
] as const;
const REFUSAL_CODES = [
  "voicing.realization_unavailable", "voicing.quartal_context_unexpected",
  "voicing.quartal_context_required", "voicing.quartal_context_invalid",
  "voicing.family_unavailable", "voicing.constraints_unsatisfied",
  "limit.voicing_work_exceeded",
] as const;
const QUARTAL_INVALID_REASONS = [
  "schema-mismatch", "policy-id-mismatch", "policy-version-mismatch",
  "evidence-id-invalid", "evidence-version-invalid", "degree-count-mismatch",
  "degree-absent-from-realization", "adjacency-not-perfect-or-augmented-fourth",
] as const;
const CONSTRAINT_CODES = [
  "voicing.constraint.realization_membership",
  "voicing.constraint.template_degree_membership", "voicing.constraint.voice_count",
  "voicing.constraint.midi_range", "voicing.constraint.required_degrees",
  "voicing.constraint.guide_tones", "voicing.constraint.identity_tones",
  "voicing.constraint.bass_policy", "voicing.constraint.slash_bass_lowest",
  "voicing.constraint.external_bass_excluded",
  "voicing.constraint.rootless_root_omitted", "voicing.constraint.unique_midi",
  "voicing.constraint.permitted_doubling", "voicing.constraint.low_register_spacing",
  "voicing.constraint.family_structure", "voicing.constraint.quartal_context",
] as const;
const CONSTRAINT_REASONS = [
  "selected-realization-mismatch", "template-degree-absent",
  "voice-count-below-template-minimum", "voice-count-unsupported",
  "bass-policy-unsupported", "required-degree-omitted", "guide-tone-omitted",
  "identity-tone-omitted", "slash-bass-unplaceable", "external-bass-present",
  "root-present-in-rootless", "range-insufficient", "duplicate-midi",
  "doubling-not-permitted", "low-register-spacing", "family-transform-invalid",
  "quartal-context-invalid", "no-legal-register-placement",
] as const;
const TERMINATIONS = [
  "complete-generated", "complete-bypass", "realization-unavailable",
  "quartal-context-unexpected", "quartal-context-required", "quartal-context-invalid",
  "family-unavailable", "constraints-unsatisfied", "work-limit-exceeded",
] as const;
const TERMINATION_BY_REFUSAL: Readonly<Record<string, string>> = {
  "voicing.realization_unavailable": "realization-unavailable",
  "voicing.quartal_context_unexpected": "quartal-context-unexpected",
  "voicing.quartal_context_required": "quartal-context-required",
  "voicing.quartal_context_invalid": "quartal-context-invalid",
  "voicing.family_unavailable": "family-unavailable",
  "voicing.constraints_unsatisfied": "constraints-unsatisfied",
  "limit.voicing_work_exceeded": "work-limit-exceeded",
};
const SCORE_AXES = [
  "optionalDegreesOmitted", "nonPreferredDoublings", "guideToneDoublings",
  "templateOrderDisplacement", "targetSpanDistance", "rangeCenterDistanceTwice",
] as const;
const CANDIDATE_ORDER = [
  "local-score-axis-order", "midi-sequence-lexicographic",
  "degree-number-then-alter-lexicographic",
  "spelling-octave-then-domain-step-then-alter-lexicographic",
  "template-id-utf16-lexicographic", "raw-generation-ordinal",
] as const;
const LOW_SPACING = [
  { maximumLowerMidi: 35, minimumSemitones: 10 },
  { maximumLowerMidi: 47, minimumSemitones: 7 },
  { maximumLowerMidi: 59, minimumSemitones: 4 },
  { maximumLowerMidi: 127, minimumSemitones: 1 },
] as const;
const WORK_LIMITS: Readonly<Record<string, number>> = {
  realizationDegreeRecordsVisited: 16,
  templateRowsVisited: 112,
  templateDegreeSlotsVisited: 784,
  registerPlacementsVisited: 176,
  searchStatesExpanded: 8192,
  structuralTransformsAttempted: 8192,
  hardConstraintChecks: 131072,
  rawCandidatesProduced: 96,
  candidateCanonicalizations: 96,
  duplicateCandidateComparisons: 4560,
  localScoresComputed: 96,
  orderingComparisons: 4560,
  retainedCandidatesProduced: 24,
  outputVoicesProduced: 168,
  constraintObservationComparisons: 2228224,
  constraintObservationsProduced: 16,
};
const MEMORY_LIMITS: Readonly<Record<string, number>> = {
  peakRegisterPlacementRecords: 176,
  peakSearchStateRecords: 512,
  peakRawCandidateRecords: 96,
  peakRawVoiceRecords: 672,
  peakRetainedCandidateRecords: 24,
  peakOutputVoiceRecords: 168,
  peakTrackedRecords: 1792,
  peakConstraintObservationRecords: 16,
};
const IDENTIFIER_LIMITS = {
  surfaces: ["quartalContext.evidenceId", "candidateEvidence.sourceId"],
  minimumCodePoints: 1,
  maximumCodePoints: 256,
  maximumUtf8Bytes: 512,
  codePointMeasurement: "Array.from(value).length",
  utf8ByteMeasurement: "new TextEncoder().encode(value).byteLength",
  quartalContextInvalidReason: "evidence-id-invalid",
  candidateEvidenceMayEmitInvalidSourceId: false,
} as const;
const CANDIDATE_PAYLOAD_LIMITS = {
  hardConstraintObservations: 16,
  hardConstraintCodeOrder: CONSTRAINT_CODES,
  nonQuartalEvidenceRecords: 8,
  quartalEvidenceRecords: 9,
  evidenceCodeOrder: [
    "voicing.evidence.quality_classified",
    "voicing.evidence.template_selected",
    "voicing.evidence.realization_bound",
    "voicing.evidence.register_enumerated",
    "voicing.evidence.family_transform",
    "voicing.evidence.constraints_checked",
    "voicing.evidence.local_score",
    "voicing.evidence.stable_retention",
    "voicing.evidence.quartal_context",
  ],
  constraintObservationVoiceOrdinals: 7,
  constraintObservationDegrees: 7,
  constraintObservationMidiValues: 7,
  evidenceObservationVoiceOrdinals: 7,
  evidenceObservationDegrees: 7,
  explanationOrderedDegreesMinimum: 2,
  explanationOrderedDegreesMaximum: 7,
  explanationOmittedDegreesMaximum: 16,
  explanationDoubledDegreesMaximum: 2,
  explanationQuartalAdjacenciesMaximum: 4,
  drop2TransformVoicesMinimum: 4,
  drop2TransformVoicesMaximum: 7,
  drop2SourceAndTransformedLengthsEqual: true,
  resultCandidatesMinimum: 1,
  resultCandidatesMaximum: 24,
  availableRealizationIdsMinimum: 1,
  availableRealizationIdsMaximum: 4,
  refusalConstraintsMinimum: 1,
  refusalConstraintsMaximum: 16,
} as const;
const CONSTRAINT_OBSERVATION_POLICY = {
  policyId: "changes.voicing-constraint-observation-collection",
  policyVersion: 1,
  equalityFields: [
    "satisfied", "code", "reason", "voiceOrdinals",
    "exact-degree-number-and-alter", "midiValues",
  ],
  order: [
    "constraint-code-rank", "voice-ordinals-lexicographic",
    "exact-degrees-lexicographic", "midi-values-lexicographic",
    "reason-precedence",
  ],
  properPrefixesFirst: true,
  duplicateDisposition: "collapse-before-capacity",
  sameCodeDistinctPayloadDisposition: "retain-distinct",
  maximumDistinctRecords: 16,
  overflowCounter: "constraintObservationsProduced",
  overflowDisposition: "provisional-until-complete-zero-candidate-search",
  legalCandidateDisposition: "clear-and-disable-no-result-diagnostics",
  noResultOverflowDisposition: "work-limit-no-partial-result",
  parallelKeyCollectionAllowed: false,
} as const;
const TRACKED_POPULATION_ORDER = [
  "selected-realization-degree", "template-row", "register-placement",
  "search-state", "raw-candidate", "raw-voice", "retained-candidate",
  "output-voice", "constraint-observation",
] as const;
const TRACKED_POPULATION_LIMITS: Readonly<Record<(typeof TRACKED_POPULATION_ORDER)[number], number>> = {
  "selected-realization-degree": 16,
  "template-row": 112,
  "register-placement": 176,
  "search-state": 512,
  "raw-candidate": 96,
  "raw-voice": 672,
  "retained-candidate": 24,
  "output-voice": 168,
  "constraint-observation": 16,
};
const TRACKED_RECORD_ACCOUNTING = {
  policyId: "changes.voicing-tracked-record-accounting",
  policyVersion: 2,
  populationOrder: TRACKED_POPULATION_ORDER,
  populationLimits: TRACKED_POPULATION_LIMITS,
  aggregateMaximum: 1792,
  sumOfPopulationLimits: 1792,
  diagnosticPayloadOwnedByCandidateRecord: true,
  constraintObservationAccumulatorPopulation: "constraint-observation",
  independentDiagnosticSideCollectionsAllowed: false,
  ownershipLaw: "Successful constraint, evidence, score, and explanation projections are payload of their owning candidate. A no-result search may retain only the one declared operation-local constraint-observation population, transfer it into the refusal, and retain no parallel diagnostic side collection.",
} as const;
const CANDIDATE_IDENTITY = {
  deduplicationKey: [
    "ordered voice MIDI",
    "ordered voice spelling step/alter/octave",
    "ordered voice exact degree or null",
    "ordered voice provenance",
    "ordered voice sourceDegreeIndex or null",
  ],
  excludedFromKey: [
    "realizationId", "family", "templateId", "rawGenerationOrdinal",
    "retainedOrdinal", "localScore", "evidence", "explanation", "candidateId",
  ],
  midiOnlyDeduplicationForbidden: true,
  candidateIds: "candidate-000 through candidate-023 are assigned only after final retention order",
} as const;
const IDENTIFIER_POLICY = {
  surfaces: ["quartalContext.evidenceId", "candidateEvidence.sourceId"],
  minimumCodePointsInclusive: 1,
  maximumCodePointsInclusive: 256,
  maximumUtf8BytesInclusive: 512,
  codePointMeasurement: "Array.from(value).length",
  utf8ByteMeasurement: "new TextEncoder().encode(value).byteLength",
  violationOrder: ["minimum-code-points", "maximum-code-points", "maximum-utf8-bytes"],
  quartalContextInvalidReason: "evidence-id-invalid",
  candidateEvidenceLaw: "An invalid sourceId may never be emitted in candidate evidence.",
  fixtureRecipesStoreMetricsInsteadOfExpandedStrings: true,
} as const;
const IDENTIFIER_BOUNDARY_CASES = [
  {
    id: "V0-ID-001-EMPTY-BELOW-MINIMUM",
    kind: "identifier-code-point-and-utf8-boundary",
    appliesTo: ["quartalContext.evidenceId", "candidateEvidence.sourceId"],
    recipe: { segments: [] },
    expected: {
      valid: false, measuredCodePoints: 0, measuredUtf8Bytes: 0,
      firstViolation: "minimum-code-points", quartalContextDisposition: "evidence-id-invalid",
      candidateEvidenceMayBeEmitted: false,
    },
    traceIds: ["V0-TRACE-LIMITS"],
    authorityIds: ["V0-AUTH-LIMITS", "V0-AUTH-INDEPENDENCE"],
  },
  {
    id: "V0-ID-002-ONE-ASCII-ACCEPTED",
    kind: "identifier-code-point-and-utf8-boundary",
    appliesTo: ["quartalContext.evidenceId", "candidateEvidence.sourceId"],
    recipe: { segments: [{ text: "a", repeat: 1 }] },
    expected: {
      valid: true, measuredCodePoints: 1, measuredUtf8Bytes: 1,
      firstViolation: null, quartalContextDisposition: "accept-id-shape",
      candidateEvidenceMayBeEmitted: true,
    },
    traceIds: ["V0-TRACE-LIMITS"],
    authorityIds: ["V0-AUTH-LIMITS", "V0-AUTH-INDEPENDENCE"],
  },
  {
    id: "V0-ID-003-256-ASCII-ACCEPTED",
    kind: "identifier-code-point-and-utf8-boundary",
    appliesTo: ["quartalContext.evidenceId", "candidateEvidence.sourceId"],
    recipe: { segments: [{ text: "a", repeat: 256 }] },
    expected: {
      valid: true, measuredCodePoints: 256, measuredUtf8Bytes: 256,
      firstViolation: null, quartalContextDisposition: "accept-id-shape",
      candidateEvidenceMayBeEmitted: true,
    },
    traceIds: ["V0-TRACE-LIMITS"],
    authorityIds: ["V0-AUTH-LIMITS", "V0-AUTH-INDEPENDENCE"],
  },
  {
    id: "V0-ID-004-257-ASCII-REFUSED",
    kind: "identifier-code-point-and-utf8-boundary",
    appliesTo: ["quartalContext.evidenceId", "candidateEvidence.sourceId"],
    recipe: { segments: [{ text: "a", repeat: 257 }] },
    expected: {
      valid: false, measuredCodePoints: 257, measuredUtf8Bytes: 257,
      firstViolation: "maximum-code-points", quartalContextDisposition: "evidence-id-invalid",
      candidateEvidenceMayBeEmitted: false,
    },
    traceIds: ["V0-TRACE-LIMITS"],
    authorityIds: ["V0-AUTH-LIMITS", "V0-AUTH-INDEPENDENCE"],
  },
  {
    id: "V0-ID-005-128-EMOJI-512-BYTES-ACCEPTED",
    kind: "identifier-code-point-and-utf8-boundary",
    appliesTo: ["quartalContext.evidenceId", "candidateEvidence.sourceId"],
    recipe: { segments: [{ text: "😀", repeat: 128 }] },
    expected: {
      valid: true, measuredCodePoints: 128, measuredUtf8Bytes: 512,
      firstViolation: null, quartalContextDisposition: "accept-id-shape",
      candidateEvidenceMayBeEmitted: true,
    },
    traceIds: ["V0-TRACE-LIMITS"],
    authorityIds: ["V0-AUTH-LIMITS", "V0-AUTH-INDEPENDENCE"],
  },
  {
    id: "V0-ID-006-513-BYTES-REFUSED",
    kind: "identifier-code-point-and-utf8-boundary",
    appliesTo: ["quartalContext.evidenceId", "candidateEvidence.sourceId"],
    recipe: { segments: [{ text: "😀", repeat: 127 }, { text: "a", repeat: 5 }] },
    expected: {
      valid: false, measuredCodePoints: 132, measuredUtf8Bytes: 513,
      firstViolation: "maximum-utf8-bytes", quartalContextDisposition: "evidence-id-invalid",
      candidateEvidenceMayBeEmitted: false,
    },
    traceIds: ["V0-TRACE-LIMITS"],
    authorityIds: ["V0-AUTH-LIMITS", "V0-AUTH-INDEPENDENCE"],
  },
] as const;
const IDENTIFIER_REFUSAL_OPERATION_CASE = {
  id: "V0-OP-REFUSAL-007",
  description: "A Quartal evidence ID outside the exact 1..256-code-point and 512-UTF-8-byte bounds is rejected.",
  callSurface: "typed-public-request-semantic-validation",
  trigger: {
    family: "quartal",
    quartalContextField: "evidenceId",
    received: "",
    required: "1..256 Unicode code points and at most 512 UTF-8 bytes",
  },
  expected: {
    ok: false,
    valuePresent: false,
    partialValuePresent: false,
    retryScheduled: false,
    fallbackApplied: false,
    evidence: { termination: "quartal-context-invalid" },
    refusal: {
      code: "voicing.quartal_context_invalid",
      path: ["quartalContext"],
      reason: "evidence-id-invalid",
    },
  },
  traceIds: ["V0-TRACE-QUARTAL", "V0-TRACE-REFUSAL", "V0-TRACE-LIMITS"],
  authorityIds: ["V0-AUTH-CONTRACT", "V0-AUTH-TEMPLATES", "V0-AUTH-LIMITS"],
} as const;
const LIMITS_AUTHORITY_RECORD = {
  id: "V0-AUTH-LIMITS",
  authorityClass: "pre-production-project-policy",
  title: "Deterministic V0 work, memory, payload, and identifier limits",
  sources: [
    { kind: "local", ref: "src/theory/voicing-candidates-contract.ts" },
    { kind: "local", ref: "tests/fixtures/voicing/limit-cases.json" },
  ],
  claimIds: ["V0-CLAIM-LIMITS", "V0-CLAIM-ALL-OR-NOTHING"],
  covers: "24 counters, exact/+1 outcomes, raw 96/97, retention 24/25, nine tracked-record populations, candidate-owned bounded diagnostics plus one operation-local constraint-observation accumulator, 1..256-code-point and 512-byte identifier bounds, no wall-time cutoff",
  traceIds: ["V0-TRACE-LIMITS"],
  reviewState: "checked-in-pre-production-resource-policy",
} as const;

function codeUnitCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function objectArray(value: unknown): JsonObject[] {
  return Array.isArray(value) && value.every(isObject) ? value : [];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : [];
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isObject(value)) return value;
  const result: JsonObject = {};
  for (const key of Object.keys(value).sort(codeUnitCompare)) {
    result[key] = stableValue(value[key]);
  }
  return result;
}

function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function sameJson(left: unknown, right: unknown): boolean {
  return stableJson(left) === stableJson(right);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function finding(
  findings: V0ContractFinding[],
  code: string,
  path: string,
  message: string,
): void {
  findings.push({ code, path, message });
}

function requireExact(
  actual: unknown,
  expected: unknown,
  code: string,
  path: string,
  message: string,
  findings: V0ContractFinding[],
): void {
  if (!sameJson(actual, expected)) finding(findings, code, path, message);
}

function pathString(path: readonly (string | number)[]): string {
  return path.length === 0
    ? "$"
    : `$${path.map((part) => `[${JSON.stringify(part)}]`).join("")}`;
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
    while (cursor < source.length && !/[\s,\]}]/u.test(source[cursor] ?? "")) {
      cursor += 1;
    }
  };
  value([]);
  return duplicates.sort(codeUnitCompare);
}

function requireUniqueIds(
  records: readonly JsonObject[],
  path: string,
  findings: V0ContractFinding[],
): string[] {
  const ids: string[] = [];
  records.forEach((record, index) => {
    const id = record["id"];
    if (typeof id !== "string" || id.length === 0) {
      finding(findings, "V0_ID_SHAPE", `${path}[${String(index)}].id`, "A nonempty stable ID is required.");
    } else {
      ids.push(id);
    }
  });
  if (new Set(ids).size !== ids.length) {
    finding(findings, "V0_ID_DUPLICATE", path, "Stable IDs must be unique within the collection.");
  }
  return ids;
}

function projectionDigest(records: readonly unknown[][]): string {
  return sha256(records.map((record) => `${JSON.stringify(record)}\n`).join(""));
}

function fixturePayloadDigest(root: JsonObject): string {
  const withoutChecksums: JsonObject = {};
  for (const [key, value] of Object.entries(root)) {
    if (key !== "checksums") withoutChecksums[key] = value;
  }
  return sha256(`${stableJson(withoutChecksums)}\n`);
}

function requireChecksum(
  actual: unknown,
  expected: string,
  path: string,
  findings: V0ContractFinding[],
): void {
  if (actual !== expected) {
    finding(findings, "V0_CHECKSUM", path, `Expected independently recomputed SHA-256 ${expected}.`);
  }
}

function validateManifest(root: JsonObject, findings: V0ContractFinding[]): void {
  requireExact(root["families"], FAMILIES, "V0_MANIFEST_VOCABULARY", "v0-voicing-contract.json.families", "Family vocabulary/order drifted.", findings);
  requireExact(root["voiceCounts"], VOICE_COUNTS, "V0_MANIFEST_VOCABULARY", "v0-voicing-contract.json.voiceCounts", "Voice-count vocabulary/order drifted.", findings);
  requireExact(root["qualityClasses"], QUALITY_CLASSES, "V0_MANIFEST_CLASSIFICATION", "v0-voicing-contract.json.qualityClasses", "The sixteen quality classes must be exact.", findings);
  requireExact(root["qualityClassification"], QUALITY_CLASSIFICATION, "V0_MANIFEST_CLASSIFICATION", "v0-voicing-contract.json.qualityClassification", "Formula-rule folding must be exact and exhaustive.", findings);
  requireExact(root["companionFiles"], V0_REVIEWED_COMPANIONS, "V0_MANIFEST_FILE_SET", "v0-voicing-contract.json.companionFiles", "The manifest must name exactly the ten companions in load order.", findings);
  const identity = isObject(root["identity"]) ? root["identity"] : {};
  requireExact(identity["package"], "V0", "V0_MANIFEST_IDENTITY", "v0-voicing-contract.json.identity.package", "Package identity must be V0.", findings);
  requireExact(identity["contractSchema"], "changes.theory.voicing-candidates-contract.v1", "V0_MANIFEST_IDENTITY", "v0-voicing-contract.json.identity.contractSchema", "Contract schema drifted.", findings);
  requireExact(identity["requestSchema"], "changes.theory.voicing-request.v1", "V0_MANIFEST_IDENTITY", "v0-voicing-contract.json.identity.requestSchema", "Request schema drifted.", findings);
  requireExact(identity["resultSchema"], "changes.theory.voicing-result.v1", "V0_MANIFEST_IDENTITY", "v0-voicing-contract.json.identity.resultSchema", "Result schema drifted.", findings);
  requireExact(identity["candidateSchema"], "changes.theory.voicing-candidate.v1", "V0_MANIFEST_IDENTITY", "v0-voicing-contract.json.identity.candidateSchema", "Candidate schema drifted.", findings);
  requireExact(identity["templateSchema"], "changes.theory.voicing-family-template.v1", "V0_MANIFEST_IDENTITY", "v0-voicing-contract.json.identity.templateSchema", "Template schema drifted.", findings);
  requireExact(identity["quartalContextSchema"], "changes.theory.quartal-context.v1", "V0_MANIFEST_IDENTITY", "v0-voicing-contract.json.identity.quartalContextSchema", "Quartal context schema drifted.", findings);
  requireExact(identity["operationIds"], ["realizeVoicing"], "V0_MANIFEST_IDENTITY", "v0-voicing-contract.json.identity.operationIds", "V0 exposes exactly one synchronous operation.", findings);
  requireExact(identity["engine"], { id: "changes.voicing-candidates", version: 1, versionTag: "changes.voicing-candidates.v1" }, "V0_MANIFEST_IDENTITY", "v0-voicing-contract.json.identity.engine", "Engine identity drifted.", findings);
  requireExact(identity["templateTable"], { id: "changes.voicing-family-templates", version: 1 }, "V0_MANIFEST_IDENTITY", "v0-voicing-contract.json.identity.templateTable", "Template-table identity drifted.", findings);
  requireExact(identity["familyRegisterPolicy"], {
    schema: "changes.theory.voicing-family-register-policy.v1",
    version: 1,
    ids: [
      "balanced-register-v1", "fixed-template-register-v1",
      "open-register-v1", "drop2-register-v1", "quartal-register-v1",
    ],
    slotOrderPolicies: [
      "selected-degree-register-weave-v1", "template-low-to-high",
      "closed-source-low-to-high", "quartal-context-low-to-high",
    ],
    structuralTransforms: ["drop2"],
    sourceVoiceSelections: ["second-from-top"],
    outputOrders: ["midi-ascending"],
  }, "V0_MANIFEST_IDENTITY", "v0-voicing-contract.json.identity.familyRegisterPolicy", "Family register-policy identity drifted.", findings);
  requireExact(identity["localScorePolicy"], { id: "changes.voicing-local-score", version: 1 }, "V0_MANIFEST_IDENTITY", "v0-voicing-contract.json.identity.localScorePolicy", "Local-score identity drifted.", findings);
  requireExact(identity["lowRegisterPolicy"], { id: "changes.voicing-low-register-spacing", version: 1 }, "V0_MANIFEST_IDENTITY", "v0-voicing-contract.json.identity.lowRegisterPolicy", "Spacing-policy identity drifted.", findings);
  requireExact(identity["quartalContextPolicy"], { id: "changes.quartal-context-gate", version: 1 }, "V0_MANIFEST_IDENTITY", "v0-voicing-contract.json.identity.quartalContextPolicy", "Quartal gate identity drifted.", findings);
  requireExact(root["refusalCodesInPrecedenceOrder"], REFUSAL_CODES, "V0_MANIFEST_PRECEDENCE", "v0-voicing-contract.json.refusalCodesInPrecedenceOrder", "Refusal precedence drifted.", findings);
  requireExact(root["quartalContextInvalidReasonsInPrecedenceOrder"], QUARTAL_INVALID_REASONS, "V0_MANIFEST_PRECEDENCE", "v0-voicing-contract.json.quartalContextInvalidReasonsInPrecedenceOrder", "Quartal invalid-reason precedence drifted.", findings);
  requireExact(root["constraintCodes"], CONSTRAINT_CODES, "V0_MANIFEST_PRECEDENCE", "v0-voicing-contract.json.constraintCodes", "Constraint order drifted.", findings);
  requireExact(root["constraintUnsatisfiedReasons"], CONSTRAINT_REASONS, "V0_MANIFEST_PRECEDENCE", "v0-voicing-contract.json.constraintUnsatisfiedReasons", "Constraint-reason order drifted.", findings);
  requireExact(root["terminations"], TERMINATIONS, "V0_MANIFEST_PRECEDENCE", "v0-voicing-contract.json.terminations", "Termination vocabulary drifted.", findings);
  requireExact(root["terminationByRefusalCode"], TERMINATION_BY_REFUSAL, "V0_MANIFEST_PRECEDENCE", "v0-voicing-contract.json.terminationByRefusalCode", "Refusal/termination coupling drifted.", findings);
  requireExact(root["workLimits"], WORK_LIMITS, "V0_MANIFEST_LIMITS", "v0-voicing-contract.json.workLimits", "The sixteen work limits must be exact.", findings);
  requireExact(root["memoryLimits"], MEMORY_LIMITS, "V0_MANIFEST_LIMITS", "v0-voicing-contract.json.memoryLimits", "The eight memory limits must be exact.", findings);
  requireExact(root["identifierLimits"], IDENTIFIER_LIMITS, "V0_MANIFEST_IDENTIFIER_LIMITS", "v0-voicing-contract.json.identifierLimits", "Identifier surfaces, Unicode measurements, and inclusive bounds drifted.", findings);
  requireExact(root["candidatePayloadLimits"], CANDIDATE_PAYLOAD_LIMITS, "V0_MANIFEST_PAYLOAD_LIMITS", "v0-voicing-contract.json.candidatePayloadLimits", "Candidate-owned diagnostic payload limits drifted.", findings);
  requireExact(root["constraintObservationPolicy"], CONSTRAINT_OBSERVATION_POLICY, "V0_CONSTRAINT_OBSERVATION_POLICY", "v0-voicing-contract.json.constraintObservationPolicy", "Full-payload observation identity, ordering, capacity, or provisional-overflow semantics drifted.", findings);
  requireExact(root["trackedRecordAccounting"], TRACKED_RECORD_ACCOUNTING, "V0_MANIFEST_ACCOUNTING", "v0-voicing-contract.json.trackedRecordAccounting", "Tracked-record population accounting drifted.", findings);
  requireExact(root["candidateIdentity"], CANDIDATE_IDENTITY, "V0_MANIFEST_CANDIDATE_IDENTITY", "v0-voicing-contract.json.candidateIdentity", "Candidate identity key, exclusions, or post-retention ID law drifted.", findings);
  const trackedAccounting = isObject(root["trackedRecordAccounting"])
    ? root["trackedRecordAccounting"]
    : {};
  const populationLimits = isObject(trackedAccounting["populationLimits"])
    ? trackedAccounting["populationLimits"]
    : {};
  const populationValues = Object.values(populationLimits);
  if (
    populationValues.length !== TRACKED_POPULATION_ORDER.length
    || populationValues.some((value) => !Number.isSafeInteger(value) || Number(value) < 0)
  ) {
    finding(findings, "V0_MANIFEST_ACCOUNTING", "v0-voicing-contract.json.trackedRecordAccounting.populationLimits", "Exactly nine nonnegative integer population limits are required.");
  } else {
    const independentlySummedMaximum = populationValues.reduce<number>(
      (sum, value) => sum + Number(value),
      0,
    );
    requireExact(independentlySummedMaximum, 1792, "V0_MANIFEST_ACCOUNTING", "v0-voicing-contract.json.trackedRecordAccounting.sumOfPopulationLimits", "The nine population limits must independently sum to 1,792.", findings);
    requireExact(trackedAccounting["aggregateMaximum"], independentlySummedMaximum, "V0_MANIFEST_ACCOUNTING", "v0-voicing-contract.json.trackedRecordAccounting.aggregateMaximum", "Aggregate maximum must equal the independently summed population limits.", findings);
    requireExact(trackedAccounting["sumOfPopulationLimits"], independentlySummedMaximum, "V0_MANIFEST_ACCOUNTING", "v0-voicing-contract.json.trackedRecordAccounting.sumOfPopulationLimits", "Recorded population sum must equal independent arithmetic.", findings);
  }
  const limits = isObject(root["limits"]) ? root["limits"] : {};
  const exactLimits = {
    rawCandidates: 96, retainedCandidates: 24, registerPlacements: 176,
    searchStateExpansions: 8192, peakSearchStates: 512,
    hardConstraintChecks: 131072, pairwiseCandidateComparisons: 4560,
    rawVoiceRecords: 672, outputVoiceRecords: 168, templateRows: 112,
    constraintObservationComparisons: 2228224,
    constraintObservations: 16,
    trackedRecords: 1792,
  };
  for (const [key, value] of Object.entries(exactLimits)) {
    requireExact(limits[key], value, "V0_MANIFEST_LIMITS", `v0-voicing-contract.json.limits.${key}`, "Derived cap drifted.", findings);
  }
  const localScore = isObject(root["localScore"]) ? root["localScore"] : {};
  requireExact(localScore["axisOrder"], SCORE_AXES, "V0_MANIFEST_ORDER", "v0-voicing-contract.json.localScore.axisOrder", "Local score axes drifted.", findings);
  requireExact(root["candidateOrder"], CANDIDATE_ORDER, "V0_MANIFEST_ORDER", "v0-voicing-contract.json.candidateOrder", "Candidate order drifted.", findings);
  requireExact(root["lowRegisterSpacing"], LOW_SPACING, "V0_MANIFEST_SPACING", "v0-voicing-contract.json.lowRegisterSpacing", "Low-register spacing bands drifted.", findings);
  requireExact(root["matrix"], { t1LiteralFormulaSeeds: 33, alteredDominantRealizationSeeds: 4, totalRealizationSeeds: 37, families: 7, voiceCounts: 5, availabilityCells: 1295 }, "V0_MANIFEST_MATRIX", "v0-voicing-contract.json.matrix", "Availability matrix dimensions drifted.", findings);
  const degreePolicy = isObject(root["degreePolicy"]) ? root["degreePolicy"] : {};
  requireExact(degreePolicy["maximumAdditionalOctaveCopiesPerDegree"], 1, "V0_MANIFEST_DEGREES", "v0-voicing-contract.json.degreePolicy.maximumAdditionalOctaveCopiesPerDegree", "Only one declared octave copy is permitted.", findings);
  requireExact(degreePolicy["permittedDoublingPriority"], ["1", "5"], "V0_MANIFEST_DEGREES", "v0-voicing-contract.json.degreePolicy.permittedDoublingPriority", "Doubling priority drifted.", findings);
  requireExact(degreePolicy["fabricatedTemplateColors"], false, "V0_MANIFEST_DEGREES", "v0-voicing-contract.json.degreePolicy.fabricatedTemplateColors", "Template colors may never be fabricated.", findings);
  requireExact(degreePolicy["automaticCustomChord"], false, "V0_MANIFEST_DEGREES", "v0-voicing-contract.json.degreePolicy.automaticCustomChord", "Custom chords cannot use Auto.", findings);
}

type ParsedDegree = Readonly<{ number: number; alter: number }>;

function parseDegreeToken(token: unknown): ParsedDegree | null {
  if (typeof token !== "string") return null;
  const match = /^(bb|b|#)?(1|2|3|4|5|6|7|9|11|13)$/u.exec(token);
  if (match === null) return null;
  const accidental = match[1] ?? "";
  const numberText = match[2];
  if (numberText === undefined) return null;
  return {
    number: Number.parseInt(numberText, 10),
    alter: accidental === "bb" ? -2 : accidental === "b" ? -1 : accidental === "#" ? 1 : 0,
  };
}

function degreeSemitones(token: unknown): number | null {
  const degree = parseDegreeToken(token);
  if (degree === null) return null;
  const bases: Readonly<Record<number, number>> = {
    1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11, 9: 14, 11: 17, 13: 21,
  };
  const base = bases[degree.number];
  return base === undefined ? null : base + degree.alter;
}

function compareLexicographic<T>(
  left: readonly T[],
  right: readonly T[],
  compare: (leftValue: T, rightValue: T) => number,
): number {
  const sharedLength = Math.min(left.length, right.length);
  for (let index = 0; index < sharedLength; index += 1) {
    const leftValue = left[index];
    const rightValue = right[index];
    if (leftValue === undefined || rightValue === undefined) continue;
    const result = compare(leftValue, rightValue);
    if (result !== 0) return result;
  }
  return left.length - right.length;
}

function compareFixtureConstraintObservations(
  left: JsonObject,
  right: JsonObject,
): number {
  const codeRank = (value: unknown): number =>
    typeof value === "string"
      ? (CONSTRAINT_CODES as readonly string[]).indexOf(value)
      : -1;
  const codeDifference = codeRank(left["code"]) - codeRank(right["code"]);
  if (codeDifference !== 0) return codeDifference;
  const ordinals = (value: unknown): number[] =>
    Array.isArray(value) ? value.filter((item): item is number => Number.isInteger(item)) : [];
  const ordinalDifference = compareLexicographic(
    ordinals(left["voiceOrdinals"]),
    ordinals(right["voiceOrdinals"]),
    (leftValue, rightValue) => leftValue - rightValue,
  );
  if (ordinalDifference !== 0) return ordinalDifference;
  const degrees = (value: unknown): ParsedDegree[] =>
    Array.isArray(value)
      ? value.map((item) => {
        const token = parseDegreeToken(item);
        if (token !== null) return token;
        return isObject(item) && Number.isInteger(item["number"]) && Number.isInteger(item["alter"])
          ? { number: Number(item["number"]), alter: Number(item["alter"]) }
          : null;
      }).filter((item): item is ParsedDegree => item !== null)
      : [];
  const degreeDifference = compareLexicographic(
    degrees(left["degrees"]),
    degrees(right["degrees"]),
    (leftValue, rightValue) =>
      leftValue.number - rightValue.number || leftValue.alter - rightValue.alter,
  );
  if (degreeDifference !== 0) return degreeDifference;
  const midiDifference = compareLexicographic(
    ordinals(left["midiValues"]),
    ordinals(right["midiValues"]),
    (leftValue, rightValue) => leftValue - rightValue,
  );
  if (midiDifference !== 0) return midiDifference;
  const reasonRank = (value: unknown): number =>
    typeof value === "string"
      ? (CONSTRAINT_REASONS as readonly string[]).indexOf(value)
      : -1;
  return reasonRank(left["reason"]) - reasonRank(right["reason"]);
}

type IndependentObservationOracleFamily = "balanced" | "open";

type IndependentObservationOracleVoice = Readonly<{
  degree: ParsedDegree;
  midi: number;
  ordinal: number;
}>;

type IndependentObservationOracleResult = Readonly<{
  candidateMidiValues: readonly (readonly number[])[];
  legalCandidateCount: number;
  provisionalObservationOverflowOccurred: boolean;
  provisionalObservationOverflowCleared: boolean;
  prospectiveOverflowAssignment: number | null;
  distinctExternalBassObservationPayloads: number;
  externalBassPayloadsByMidi: readonly Readonly<{
    midi: number;
    voiceOrdinals: readonly number[];
  }>[];
  evidence: JsonObject;
}>;

const INDEPENDENT_CMAJ7_SLOTS = Object.freeze([
  { degree: { number: 1, alter: 0 }, semitones: 0 },
  { degree: { number: 3, alter: 0 }, semitones: 4 },
  { degree: { number: 5, alter: 0 }, semitones: 7 },
  { degree: { number: 7, alter: 0 }, semitones: 11 },
] as const);

function positiveModulo12(value: number): number {
  return ((value % 12) + 12) % 12;
}

function independentMidiPlacements(
  pitchClass: number,
  lowMidi: number,
  highMidi: number,
): readonly number[] {
  const placements: number[] = [];
  for (let midi = lowMidi; midi <= highMidi; midi += 1) {
    if (positiveModulo12(midi) === pitchClass) placements.push(midi);
  }
  return placements;
}

function independentMinimumSpacing(lowerMidi: number): number {
  if (lowerMidi <= 35) return 10;
  if (lowerMidi <= 47) return 7;
  if (lowerMidi <= 59) return 4;
  return 1;
}

function independentObservation(
  code: string,
  reason: string,
  affectedVoices: readonly IndependentObservationOracleVoice[],
): JsonObject {
  const voices = [...affectedVoices].sort(
    (left, right) => left.ordinal - right.ordinal,
  );
  return {
    code,
    satisfied: false,
    reason,
    voiceOrdinals: voices.map(({ ordinal }) => ordinal),
    degrees: voices.map(({ degree }) => ({ ...degree })),
    midiValues: voices.map(({ midi }) => midi),
  };
}

/**
 * Standalone arithmetic/enumeration oracle for the two reviewed Cmaj7
 * observation witnesses. This deliberately imports and invokes no production
 * theory code: it derives placements, DFS work, hard-law observations,
 * insertion comparisons, provisional overflow, and publication counters from
 * the frozen public laws alone.
 */
function independentlyEnumerateCmaj7ObservationSearch(input: Readonly<{
  family: IndependentObservationOracleFamily;
  rootPitchClass: number;
  lowMidi: number;
  highMidi: number;
  bassPolicy: "external" | "generated";
  externalBassPitchClass: number | null;
}>): IndependentObservationOracleResult {
  const rootPitchClass = positiveModulo12(input.rootPitchClass);
  const reviewedLateLegalShape =
    input.family === "open" &&
    rootPitchClass === 0 &&
    input.lowMidi === 29 &&
    input.highMidi === 59 &&
    input.bassPolicy === "generated" &&
    input.externalBassPitchClass === null;
  const reviewedOverflowTranspositionShape =
    input.family === "balanced" &&
    input.rootPitchClass === rootPitchClass &&
    input.lowMidi === 24 + rootPitchClass &&
    input.highMidi === 95 + rootPitchClass &&
    input.bassPolicy === "external" &&
    input.externalBassPitchClass === positiveModulo12(rootPitchClass + 4);
  if (!reviewedLateLegalShape && !reviewedOverflowTranspositionShape) {
    throw new RangeError(
      "Independent V0 observation oracle only supports the reviewed Cmaj7 Open witness and twelve Cmaj7/major-third Balanced transposition cells",
    );
  }
  const placementMatrix = INDEPENDENT_CMAJ7_SLOTS.map((slot) =>
    independentMidiPlacements(
      positiveModulo12(input.rootPitchClass + slot.semitones),
      input.lowMidi,
      input.highMidi,
    )
  );
  const registerPlacementCount = placementMatrix.reduce(
    (sum, placements) => sum + placements.length,
    0,
  );
  const retainedObservations: JsonObject[] = [];
  const chosen: Array<Readonly<{ degree: ParsedDegree; midi: number }>> = [];
  const candidates: number[][] = [];
  const externalPayloadKeys = new Set<string>();
  const externalOrdinalsByMidi = new Map<number, Set<number>>();
  let searchStatesExpanded = 0;
  let structuralTransformsAttempted = 0;
  let hardConstraintChecks = 0;
  let constraintObservationComparisons = 0;
  let constraintObservationsProduced = 0;
  let peakConstraintObservationRecords = 0;
  let activeSearchStates = 0;
  let peakSearchStateRecords = 0;
  let collectionEnabled = true;
  let provisionalOverflowOccurred = false;
  let provisionalOverflowCleared = false;
  let prospectiveOverflowAssignment: number | null = null;

  const recordObservation = (observation: JsonObject): void => {
    if (!collectionEnabled) return;
    let insertionIndex = retainedObservations.length;
    for (let index = 0; index < retainedObservations.length; index += 1) {
      constraintObservationComparisons += 1;
      const current = retainedObservations[index];
      if (current === undefined) continue;
      const comparison = compareFixtureConstraintObservations(
        observation,
        current,
      );
      if (comparison === 0) return;
      if (comparison < 0) {
        insertionIndex = index;
        break;
      }
    }
    if (constraintObservationsProduced === 16) {
      provisionalOverflowOccurred = true;
      collectionEnabled = false;
      prospectiveOverflowAssignment = structuralTransformsAttempted;
      return;
    }
    constraintObservationsProduced += 1;
    retainedObservations.splice(insertionIndex, 0, observation);
    peakConstraintObservationRecords = Math.max(
      peakConstraintObservationRecords,
      retainedObservations.length,
    );
  };

  const evaluateCompleteAssignment = (): void => {
    structuralTransformsAttempted += 1;
    hardConstraintChecks += 16;
    const voices: IndependentObservationOracleVoice[] = [...chosen]
      .sort((left, right) => left.midi - right.midi)
      .map((voice, ordinal) => ({ ...voice, ordinal }));
    const observations: JsonObject[] = [];

    if (input.externalBassPitchClass !== null) {
      const affected = voices.filter(
        ({ midi }) =>
          positiveModulo12(midi) === input.externalBassPitchClass,
      );
      if (affected.length > 0) {
        const external = independentObservation(
          "voicing.constraint.external_bass_excluded",
          "external-bass-present",
          affected,
        );
        observations.push(external);
        externalPayloadKeys.add(stableJson(external));
        for (const voice of affected) {
          let ordinals = externalOrdinalsByMidi.get(voice.midi);
          if (ordinals === undefined) {
            ordinals = new Set<number>();
            externalOrdinalsByMidi.set(voice.midi, ordinals);
          }
          ordinals.add(voice.ordinal);
        }
      }
    }

    const spacingOrdinals = new Set<number>();
    for (let index = 1; index < voices.length; index += 1) {
      const lower = voices[index - 1];
      const upper = voices[index];
      if (
        lower !== undefined &&
        upper !== undefined &&
        upper.midi - lower.midi < independentMinimumSpacing(lower.midi)
      ) {
        spacingOrdinals.add(lower.ordinal);
        spacingOrdinals.add(upper.ordinal);
      }
    }
    if (spacingOrdinals.size > 0) {
      observations.push(independentObservation(
        "voicing.constraint.low_register_spacing",
        "low-register-spacing",
        voices.filter(({ ordinal }) => spacingOrdinals.has(ordinal)),
      ));
    }

    const lowest = voices[0];
    const highest = voices.at(-1);
    const span =
      lowest === undefined || highest === undefined
        ? 0
        : highest.midi - lowest.midi;
    const hasWideGap = voices.some((voice, index) => {
      const next = voices[index + 1];
      return next !== undefined && next.midi - voice.midi >= 7;
    });
    const familyValid = input.family === "balanced"
      ? span >= 0 && span <= 36
      : span >= 12 && span <= 36 && hasWideGap;
    const generatedRootLowest =
      input.bassPolicy !== "generated" ||
      (lowest?.degree.number === 1 && lowest.degree.alter === 0);
    if (!familyValid || !generatedRootLowest) {
      observations.push(independentObservation(
        "voicing.constraint.family_structure",
        "family-transform-invalid",
        familyValid && lowest !== undefined ? [lowest] : voices,
      ));
    }

    for (const observation of observations) recordObservation(observation);
    if (observations.length === 0) {
      if (candidates.length === 0) {
        retainedObservations.length = 0;
        provisionalOverflowCleared = provisionalOverflowOccurred;
        collectionEnabled = false;
      }
      candidates.push(voices.map(({ midi }) => midi));
    }
  };

  const visit = (slotIndex: number): void => {
    searchStatesExpanded += 1;
    activeSearchStates += 1;
    peakSearchStateRecords = Math.max(
      peakSearchStateRecords,
      activeSearchStates,
    );
    if (slotIndex === placementMatrix.length) {
      evaluateCompleteAssignment();
      activeSearchStates -= 1;
      return;
    }
    const slot = INDEPENDENT_CMAJ7_SLOTS[slotIndex];
    const placements = placementMatrix[slotIndex];
    if (slot !== undefined && placements !== undefined) {
      for (const midi of placements) {
        chosen.push({ degree: slot.degree, midi });
        visit(slotIndex + 1);
        chosen.pop();
      }
    }
    activeSearchStates -= 1;
  };
  visit(0);

  const rawCandidatesProduced = candidates.length;
  const retainedCandidatesProduced = Math.min(rawCandidatesProduced, 24);
  const outputVoicesProduced = retainedCandidatesProduced * 4;
  const templateRowsVisited = 8 * 7 + (input.family === "balanced" ? 1 : 5);
  const searchObservationPeak =
    4 + 112 + registerPlacementCount + peakSearchStateRecords +
    peakConstraintObservationRecords;
  const searchCandidatePeak =
    4 + 112 + registerPlacementCount + peakSearchStateRecords +
    rawCandidatesProduced + rawCandidatesProduced * 4;
  const publicationPeak =
    4 + 112 + rawCandidatesProduced + rawCandidatesProduced * 4 +
    retainedCandidatesProduced + outputVoicesProduced;
  const peakTrackedRecords = Math.max(
    searchObservationPeak,
    searchCandidatePeak,
    publicationPeak,
  );

  return {
    candidateMidiValues: candidates,
    legalCandidateCount: rawCandidatesProduced,
    provisionalObservationOverflowOccurred: provisionalOverflowOccurred,
    provisionalObservationOverflowCleared: provisionalOverflowCleared,
    prospectiveOverflowAssignment,
    distinctExternalBassObservationPayloads: externalPayloadKeys.size,
    externalBassPayloadsByMidi: [...externalOrdinalsByMidi.entries()]
      .sort(([left], [right]) => left - right)
      .map(([midi, ordinals]) => ({
        midi,
        voiceOrdinals: [...ordinals].sort((left, right) => left - right),
      })),
    evidence: {
      realizationDegreeRecordsVisited: 4,
      templateRowsVisited,
      templateDegreeSlotsVisited: 4,
      registerPlacementsVisited: registerPlacementCount,
      searchStatesExpanded,
      structuralTransformsAttempted,
      hardConstraintChecks,
      rawCandidatesProduced,
      candidateCanonicalizations: rawCandidatesProduced,
      duplicateCandidateComparisons:
        (rawCandidatesProduced * (rawCandidatesProduced - 1)) / 2,
      localScoresComputed: rawCandidatesProduced,
      orderingComparisons:
        (retainedCandidatesProduced * (retainedCandidatesProduced - 1)) / 2,
      retainedCandidatesProduced,
      outputVoicesProduced,
      constraintObservationComparisons,
      constraintObservationsProduced,
      peakRegisterPlacementRecords: registerPlacementCount,
      peakSearchStateRecords,
      peakRawCandidateRecords: rawCandidatesProduced,
      peakRawVoiceRecords: rawCandidatesProduced * 4,
      peakRetainedCandidateRecords: retainedCandidatesProduced,
      peakOutputVoiceRecords: outputVoicesProduced,
      peakTrackedRecords,
      peakConstraintObservationRecords,
      termination: rawCandidatesProduced > 0
        ? "complete-generated"
        : "work-limit-exceeded",
    },
  };
}

function degreeTokenFromObject(value: unknown): string | null {
  if (!isObject(value) || !Number.isInteger(value["number"]) || !Number.isInteger(value["alter"])) {
    return null;
  }
  const number = value["number"] as number;
  const alter = value["alter"] as number;
  if (![1, 2, 3, 4, 5, 6, 7, 9, 11, 13].includes(number) || alter < -2 || alter > 1) {
    return null;
  }
  const prefix = alter === -2 ? "bb" : alter === -1 ? "b" : alter === 1 ? "#" : "";
  return `${prefix}${String(number)}`;
}

const FIXED_TEMPLATE_ROWS = [
  ["shell-major-v1", "shell", "major-seventh", ["1", "3", "7"]],
  ["shell-dominant-v1", "shell", "dominant-seventh", ["1", "3", "b7"]],
  ["shell-minor-v1", "shell", "minor-seventh", ["1", "b3", "b7"]],
  ["shell-minor-major-v1", "shell", "minor-major-seventh", ["1", "b3", "7"]],
  ["shell-half-diminished-v1", "shell", "half-diminished-seventh", ["1", "b3", "b5", "b7"]],
  ["shell-diminished-v1", "shell", "diminished-seventh", ["1", "b3", "b5", "bb7"]],
  ["shell-suspended-dominant-v1", "shell", "suspended-dominant", ["1", "4", "b7"]],
  ["rootless-a-major-v1", "rootless-a", "major-seventh", ["3", "7", "9", "5"]],
  ["rootless-b-major-v1", "rootless-b", "major-seventh", ["7", "9", "3", "13"]],
  ["rootless-a-dominant-v1", "rootless-a", "dominant-seventh", ["3", "b7", "9", "13"]],
  ["rootless-b-dominant-v1", "rootless-b", "dominant-seventh", ["b7", "9", "3", "13"]],
  ["rootless-a-minor-v1", "rootless-a", "minor-seventh", ["b3", "b7", "9", "5"]],
  ["rootless-b-minor-v1", "rootless-b", "minor-seventh", ["b7", "9", "b3", "11"]],
  ["rootless-a-minor-major-v1", "rootless-a", "minor-major-seventh", ["b3", "7", "9", "5"]],
  ["rootless-b-minor-major-v1", "rootless-b", "minor-major-seventh", ["7", "9", "b3", "6"]],
  ["rootless-a-half-diminished-v1", "rootless-a", "half-diminished-seventh", ["b3", "b5", "b7", "11"]],
  ["rootless-b-half-diminished-v1", "rootless-b", "half-diminished-seventh", ["b7", "11", "b3", "b5"]],
  ["rootless-a-suspended-v1", "rootless-a", "suspended-dominant", ["4", "b7", "9", "13"]],
  ["rootless-b-suspended-v1", "rootless-b", "suspended-dominant", ["b7", "9", "4", "13"]],
] as const;

const QUARTAL_TEMPLATE_ROWS = [
  ["quartal-major-lydian-v1", "major-seventh", ["lydian"], [3, 4, 5]],
  ["quartal-minor-dorian-v1", "minor-seventh", ["dorian"], [3, 4, 5]],
  ["quartal-suspended-modal-v1", "suspended-dominant", ["mixolydian", "suspended-modal"], [3, 4, 5]],
  ["quartal-half-diminished-locrian-v1", "half-diminished-seventh", ["locrian"], [3, 4, 5]],
  ["quartal-diminished-symmetric-v1", "diminished-seventh", ["symmetric-diminished"], [3, 4]],
] as const;

const REGISTER_POLICIES = [
  {
    schema: "changes.theory.voicing-family-register-policy.v1",
    id: "balanced-register-v1", version: 1, families: ["balanced"],
    slotOrderPolicy: "selected-degree-register-weave-v1", minimumSpanSemitones: 0,
    maximumSpanSemitones: 36, targetSpanSemitones: 12,
    minimumWideGapSemitones: null, closedSourceMaximumSpanSemitones: null,
    minimumWideGapVoiceCounts: null,
    structuralTransform: null,
  },
  {
    schema: "changes.theory.voicing-family-register-policy.v1",
    id: "fixed-template-register-v1", version: 1,
    families: ["shell", "rootless-a", "rootless-b"],
    slotOrderPolicy: "template-low-to-high", minimumSpanSemitones: 0,
    maximumSpanSemitones: 24, targetSpanSemitones: 12,
    minimumWideGapSemitones: null, closedSourceMaximumSpanSemitones: null,
    minimumWideGapVoiceCounts: null,
    structuralTransform: null,
  },
  {
    schema: "changes.theory.voicing-family-register-policy.v1",
    id: "open-register-v1", version: 1, families: ["open"],
    slotOrderPolicy: "selected-degree-register-weave-v1", minimumSpanSemitones: 12,
    maximumSpanSemitones: 36, targetSpanSemitones: 19,
    minimumWideGapSemitones: 7, closedSourceMaximumSpanSemitones: null,
    minimumWideGapVoiceCounts: [3, 4, 5, 6, 7],
    structuralTransform: null,
  },
  {
    schema: "changes.theory.voicing-family-register-policy.v1",
    id: "drop2-register-v1", version: 1, families: ["drop2"],
    slotOrderPolicy: "closed-source-low-to-high", minimumSpanSemitones: 12,
    maximumSpanSemitones: 36, targetSpanSemitones: 19,
    minimumWideGapSemitones: 7, closedSourceMaximumSpanSemitones: 11,
    minimumWideGapVoiceCounts: [4, 5],
    structuralTransform: {
      kind: "drop2", sourceVoiceSelection: "second-from-top",
      lowerBySemitones: 12, outputOrder: "midi-ascending",
    },
  },
  {
    schema: "changes.theory.voicing-family-register-policy.v1",
    id: "quartal-register-v1", version: 1, families: ["quartal"],
    slotOrderPolicy: "quartal-context-low-to-high", minimumSpanSemitones: 10,
    maximumSpanSemitones: 24, targetSpanSemitones: 15,
    minimumWideGapSemitones: null, closedSourceMaximumSpanSemitones: null,
    minimumWideGapVoiceCounts: null,
    structuralTransform: null,
  },
] as const;

function expectedFixedRole(token: string): Readonly<{ role: string; guideTone: boolean }> {
  const degree = parseDegreeToken(token);
  if (degree === null) return { role: "support", guideTone: false };
  if (degree.number === 1 || degree.number === 3 || degree.number === 4 || (degree.number === 5 && degree.alter < 0)) {
    return { role: "identity", guideTone: degree.number === 3 || degree.number === 4 };
  }
  if (degree.number === 7) return { role: "guide", guideTone: true };
  if ([6, 9, 11, 13].includes(degree.number)) return { role: "color", guideTone: false };
  return { role: "support", guideTone: false };
}

function validateFamilyTemplates(
  root: JsonObject,
  findings: V0ContractFinding[],
): Readonly<{
  realizationClasses: JsonObject[];
  adaptive: JsonObject[];
  fixed: JsonObject[];
  quartal: JsonObject[];
  registerPolicies: JsonObject[];
}> {
  requireExact(root["templateTableId"], "changes.voicing-family-templates", "V0_TEMPLATE_IDENTITY", "family-templates.json.templateTableId", "Template table ID drifted.", findings);
  requireExact(root["templateTableVersion"], 1, "V0_TEMPLATE_IDENTITY", "family-templates.json.templateTableVersion", "Template table version drifted.", findings);
  const realizationClasses = objectArray(root["realizationClasses"]);
  requireExact(realizationClasses, QUALITY_CLASSIFICATION.map((entry) => ({ id: entry.qualityClass, formulaRuleIds: [...entry.formulaRuleIds] })), "V0_TEMPLATE_CLASSIFICATION", "family-templates.json.realizationClasses", "Compact template classes must match the public classification exactly.", findings);

  const degreePolicy = isObject(root["degreePolicy"]) ? root["degreePolicy"] : {};
  requireExact(degreePolicy["canonicalDegreeOrder"], ["1", "2", "b3", "3", "4", "b5", "5", "#5", "6", "bb7", "b7", "7", "b9", "9", "#9", "11", "#11", "b13", "13"], "V0_TEMPLATE_DEGREES", "family-templates.json.degreePolicy.canonicalDegreeOrder", "Canonical degree order drifted.", findings);
  requireExact(degreePolicy["doublingOrder"], ["1", "5"], "V0_TEMPLATE_DEGREES", "family-templates.json.degreePolicy.doublingOrder", "Doubling order drifted.", findings);
  requireExact(degreePolicy["doublingMaximumPerDegree"], 1, "V0_TEMPLATE_DEGREES", "family-templates.json.degreePolicy.doublingMaximumPerDegree", "Only one octave copy per declared degree is allowed.", findings);
  requireExact(degreePolicy["templateColorsAdded"], false, "V0_TEMPLATE_DEGREES", "family-templates.json.degreePolicy.templateColorsAdded", "A template may not fabricate colors.", findings);
  const spacing = isObject(root["lowRegisterSpacing"]) ? root["lowRegisterSpacing"] : {};
  requireExact(spacing["policyId"], "changes.voicing-low-register-spacing", "V0_TEMPLATE_SPACING", "family-templates.json.lowRegisterSpacing.policyId", "Spacing policy ID drifted.", findings);
  requireExact(spacing["policyVersion"], 1, "V0_TEMPLATE_SPACING", "family-templates.json.lowRegisterSpacing.policyVersion", "Spacing policy version drifted.", findings);
  requireExact(spacing["bands"], [
    { minimumLowerMidi: 0, maximumLowerMidi: 35, minimumAdjacentSemitones: 10 },
    { minimumLowerMidi: 36, maximumLowerMidi: 47, minimumAdjacentSemitones: 7 },
    { minimumLowerMidi: 48, maximumLowerMidi: 59, minimumAdjacentSemitones: 4 },
    { minimumLowerMidi: 60, maximumLowerMidi: 127, minimumAdjacentSemitones: 1 },
  ], "V0_TEMPLATE_SPACING", "family-templates.json.lowRegisterSpacing.bands", "Low-register bands must be gapless and exact.", findings);

  const adaptive = objectArray(root["adaptiveFamilies"]);
  requireUniqueIds(adaptive, "family-templates.json.adaptiveFamilies", findings);
  const adaptiveExpectations = [
    ["balanced-adaptive-v1", "balanced", 3, [3, 4, 5, 6, 7], "declared minimum is 3 total voices; insufficient degree-bearing slots are realization-fit omissions and never raise the template minimum", "balanced-register-v1", 12],
    ["open-adaptive-v1", "open", 3, [3, 4, 5, 6, 7], "declared minimum is 3 total voices; insufficient degree-bearing slots are realization-fit omissions and never raise the template minimum", "open-register-v1", 19],
    ["drop2-adaptive-v1", "drop2", 4, [4, 5, 6, 7], "declared minimum is 4 total voices; insufficient degree-bearing slots are realization-fit omissions and never raise the template minimum", "drop2-register-v1", 19],
  ] as const;
  requireExact(adaptive.map((item) => item["id"]), adaptiveExpectations.map((item) => item[0]), "V0_TEMPLATE_ADAPTIVE", "family-templates.json.adaptiveFamilies", "Adaptive template order/IDs drifted.", findings);
  adaptive.forEach((record, index) => {
    const expected = adaptiveExpectations[index];
    if (expected === undefined) return;
    const path = `family-templates.json.adaptiveFamilies[${String(index)}]`;
    requireExact(record["family"], expected[1], "V0_TEMPLATE_SELECTION", `${path}.family`, "Adaptive family does not match its ID.", findings);
    requireExact(record["selectionMode"], "realization-roles", "V0_TEMPLATE_SELECTION", `${path}.selectionMode`, "Adaptive rows exclusively use realization roles.", findings);
    requireExact(record["requiredDegreeSource"], "selected-realization-required", "V0_TEMPLATE_SELECTION", `${path}.requiredDegreeSource`, "Required source drifted.", findings);
    requireExact(record["optionalDegreeSource"], "selected-realization-optional", "V0_TEMPLATE_SELECTION", `${path}.optionalDegreeSource`, "Optional source drifted.", findings);
    requireExact(record["guideToneSource"], "selected-realization-guide-tone", "V0_TEMPLATE_SELECTION", `${path}.guideToneSource`, "Guide source drifted.", findings);
    requireExact(record["selectionPolicyId"], "changes.voicing-realization-role-selection", "V0_TEMPLATE_SELECTION", `${path}.selectionPolicyId`, "Adaptive selection policy drifted.", findings);
    requireExact(record["selectionPolicyVersion"], 1, "V0_TEMPLATE_SELECTION", `${path}.selectionPolicyVersion`, "Adaptive selection version drifted.", findings);
    requireExact(record["maximumSelectedDegreeSlots"], 7, "V0_TEMPLATE_SELECTION", `${path}.maximumSelectedDegreeSlots`, "Adaptive selection must be bounded to seven slots.", findings);
    requireExact(record["realizationClasses"], QUALITY_CLASSES, "V0_TEMPLATE_ADAPTIVE", `${path}.realizationClasses`, "Adaptive families cover every class exactly.", findings);
    requireExact(record["minimumVoiceCount"], expected[2], "V0_TEMPLATE_ADAPTIVE", `${path}.minimumVoiceCount`, "Adaptive minimum count drifted.", findings);
    requireExact(record["permittedVoiceCounts"], expected[3], "V0_TEMPLATE_ADAPTIVE", `${path}.permittedVoiceCounts`, "Adaptive permitted counts drifted.", findings);
    requireExact(record["minimumVoiceCountRule"], expected[4], "V0_TEMPLATE_ADAPTIVE", `${path}.minimumVoiceCountRule`, "Adaptive declared-minimum law drifted.", findings);
    requireExact(record["permittedBassPolicies"], ["generated", "external", "none"], "V0_TEMPLATE_ADAPTIVE", `${path}.permittedBassPolicies`, "Adaptive bass policies drifted.", findings);
    requireExact(record["availability"], "available", "V0_TEMPLATE_ADAPTIVE", `${path}.availability`, "Adaptive rows are available.", findings);
    requireExact(record["quartalContextPolicyId"], null, "V0_TEMPLATE_SELECTION", `${path}.quartalContextPolicyId`, "Non-Quartal rows cannot bind Quartal context.", findings);
    requireExact(record["quartalContextPolicyVersion"], null, "V0_TEMPLATE_SELECTION", `${path}.quartalContextPolicyVersion`, "Non-Quartal rows cannot bind Quartal context.", findings);
    requireExact(record["registerPolicyId"], expected[5], "V0_TEMPLATE_REGISTER", `${path}.registerPolicyId`, "Register binding drifted.", findings);
    requireExact(record["registerPolicyVersion"], 1, "V0_TEMPLATE_REGISTER", `${path}.registerPolicyVersion`, "Register binding version drifted.", findings);
    requireExact(record["targetSpanSemitones"], expected[6], "V0_TEMPLATE_REGISTER", `${path}.targetSpanSemitones`, "Target span drifted.", findings);
    if ("degreeSequence" in record || "degreeTokens" in record || "degreeSequenceSource" in record) {
      finding(findings, "V0_TEMPLATE_SELECTION", path, "Adaptive rows may not carry fixed or context-owned degree sequences.");
    }
  });

  const fixed = objectArray(root["fixedTemplates"]);
  requireUniqueIds(fixed, "family-templates.json.fixedTemplates", findings);
  requireExact(fixed.map((item) => item["id"]), FIXED_TEMPLATE_ROWS.map((item) => item[0]), "V0_TEMPLATE_FIXED", "family-templates.json.fixedTemplates", "The nineteen fixed row IDs/order must be exact.", findings);
  fixed.forEach((record, index) => {
    const expected = FIXED_TEMPLATE_ROWS[index];
    if (expected === undefined) return;
    const [id, family, qualityClass, tokens] = expected;
    const path = `family-templates.json.fixedTemplates[${String(index)}]`;
    requireExact(record["id"], id, "V0_TEMPLATE_FIXED", `${path}.id`, "Fixed row ID drifted.", findings);
    requireExact(record["family"], family, "V0_TEMPLATE_FIXED", `${path}.family`, "Fixed family drifted.", findings);
    requireExact(record["realizationClasses"], [qualityClass], "V0_TEMPLATE_FIXED", `${path}.realizationClasses`, "Fixed class binding drifted.", findings);
    requireExact(record["selectionMode"], "fixed-degree-sequence", "V0_TEMPLATE_SELECTION", `${path}.selectionMode`, "Shell/Rootless rows exclusively use fixed-degree-sequence.", findings);
    requireExact(record["degreeTokens"], tokens, "V0_TEMPLATE_FIXED", `${path}.degreeTokens`, "Fixed token sequence drifted.", findings);
    const slots = objectArray(record["degreeSequence"]);
    if (slots.length < 1 || slots.length > 7 || slots.length !== tokens.length) {
      finding(findings, "V0_TEMPLATE_FIXED", `${path}.degreeSequence`, "A fixed sequence must have exactly its declared one-through-seven slots.");
    }
    let previousPitchClass: number | null = null;
    slots.forEach((slot, slotIndex) => {
      const token = tokens[slotIndex];
      if (token === undefined) return;
      const slotPath = `${path}.degreeSequence[${String(slotIndex)}]`;
      requireExact(degreeTokenFromObject(slot["degree"]), token, "V0_TEMPLATE_FIXED", `${slotPath}.degree`, "Slot degree must decode to the exact token.", findings);
      const role = expectedFixedRole(token);
      requireExact(slot["role"], role.role, "V0_TEMPLATE_FIXED", `${slotPath}.role`, "Fixed slot role drifted.", findings);
      requireExact(slot["guideTone"], role.guideTone, "V0_TEMPLATE_FIXED", `${slotPath}.guideTone`, "Fixed guide flag drifted.", findings);
      requireExact(slot["required"], true, "V0_TEMPLATE_FIXED", `${slotPath}.required`, "Every fixed slot is mandatory.", findings);
      requireExact(slot["mayOmit"], false, "V0_TEMPLATE_FIXED", `${slotPath}.mayOmit`, "No v1 fixed slot may be omitted.", findings);
      requireExact(slot["mayDouble"], false, "V0_TEMPLATE_FIXED", `${slotPath}.mayDouble`, "No v1 fixed slot may double.", findings);
      const semitones = degreeSemitones(token);
      const pitchClass = semitones === null ? null : ((semitones % 12) + 12) % 12;
      const lift = slotIndex === 0 || pitchClass === null || previousPitchClass === null || pitchClass > previousPitchClass ? 0 : 1;
      requireExact(slot["minimumOctaveLiftFromPrevious"], lift, "V0_TEMPLATE_FIXED", `${slotPath}.minimumOctaveLiftFromPrevious`, "Minimum register lift is arithmetically inconsistent.", findings);
      requireExact(slot["preferredOctaveLiftFromPrevious"], lift, "V0_TEMPLATE_FIXED", `${slotPath}.preferredOctaveLiftFromPrevious`, "Preferred register lift drifted.", findings);
      previousPitchClass = pitchClass;
    });
    requireExact(record["minimumVoiceCount"], tokens.length, "V0_TEMPLATE_FIXED", `${path}.minimumVoiceCount`, "Fixed minimum must equal sequence length.", findings);
    requireExact(record["permittedVoiceCounts"], [tokens.length], "V0_TEMPLATE_FIXED", `${path}.permittedVoiceCounts`, "Fixed counts must equal sequence length exactly.", findings);
    const rootless = family === "rootless-a" || family === "rootless-b";
    requireExact(record["permittedBassPolicies"], rootless ? ["external"] : ["generated", "external", "none"], "V0_TEMPLATE_FIXED", `${path}.permittedBassPolicies`, "Fixed bass policies drifted.", findings);
    requireExact(record["omitsRoot"], rootless, "V0_TEMPLATE_FIXED", `${path}.omitsRoot`, "Only Rootless rows omit root.", findings);
    requireExact(record["availability"], "available", "V0_TEMPLATE_FIXED", `${path}.availability`, "Fixed rows are available.", findings);
    requireExact(record["quartalContextPolicyId"], null, "V0_TEMPLATE_SELECTION", `${path}.quartalContextPolicyId`, "Fixed rows cannot bind Quartal context.", findings);
    requireExact(record["quartalContextPolicyVersion"], null, "V0_TEMPLATE_SELECTION", `${path}.quartalContextPolicyVersion`, "Fixed rows cannot bind Quartal context.", findings);
    requireExact(record["registerPolicyId"], "fixed-template-register-v1", "V0_TEMPLATE_REGISTER", `${path}.registerPolicyId`, "Fixed register binding drifted.", findings);
    requireExact(record["registerPolicyVersion"], 1, "V0_TEMPLATE_REGISTER", `${path}.registerPolicyVersion`, "Fixed register version drifted.", findings);
    requireExact(record["targetSpanSemitones"], 12, "V0_TEMPLATE_REGISTER", `${path}.targetSpanSemitones`, "Fixed target span drifted.", findings);
  });

  const quartal = objectArray(root["quartalTemplates"]);
  requireUniqueIds(quartal, "family-templates.json.quartalTemplates", findings);
  requireExact(quartal.map((item) => item["id"]), QUARTAL_TEMPLATE_ROWS.map((item) => item[0]), "V0_TEMPLATE_QUARTAL", "family-templates.json.quartalTemplates", "Quartal row IDs/order drifted.", findings);
  quartal.forEach((record, index) => {
    const expected = QUARTAL_TEMPLATE_ROWS[index];
    if (expected === undefined) return;
    const path = `family-templates.json.quartalTemplates[${String(index)}]`;
    requireExact(record["family"], "quartal", "V0_TEMPLATE_QUARTAL", `${path}.family`, "Quartal family binding drifted.", findings);
    requireExact(record["selectionMode"], "quartal-context-sequence", "V0_TEMPLATE_SELECTION", `${path}.selectionMode`, "Quartal exclusively uses request context sequence selection.", findings);
    requireExact(record["degreeSequenceSource"], "quartal-context", "V0_TEMPLATE_SELECTION", `${path}.degreeSequenceSource`, "Quartal sequence source drifted.", findings);
    requireExact(record["minimumSelectedDegreeSlots"], 2, "V0_TEMPLATE_SELECTION", `${path}.minimumSelectedDegreeSlots`, "Generated-slash upper dyads require the two-member bound.", findings);
    requireExact(record["maximumSelectedDegreeSlots"], 7, "V0_TEMPLATE_SELECTION", `${path}.maximumSelectedDegreeSlots`, "Quartal context is bounded to seven members.", findings);
    requireExact(record["availability"], "context-gated", "V0_TEMPLATE_QUARTAL", `${path}.availability`, "Quartal rows are context-gated.", findings);
    requireExact(record["quartalContextPolicyId"], "changes.quartal-context-gate", "V0_TEMPLATE_QUARTAL", `${path}.quartalContextPolicyId`, "Quartal gate ID drifted.", findings);
    requireExact(record["quartalContextPolicyVersion"], 1, "V0_TEMPLATE_QUARTAL", `${path}.quartalContextPolicyVersion`, "Quartal gate version drifted.", findings);
    requireExact(record["realizationClasses"], [expected[1]], "V0_TEMPLATE_QUARTAL", `${path}.realizationClasses`, "Quartal class binding drifted.", findings);
    requireExact(record["compatibilityClasses"], expected[2], "V0_TEMPLATE_QUARTAL", `${path}.compatibilityClasses`, "Descriptive compatibility labels drifted.", findings);
    requireExact(record["minimumVoiceCount"], 3, "V0_TEMPLATE_QUARTAL", `${path}.minimumVoiceCount`, "Quartal policy minimum is three total voices.", findings);
    requireExact(record["permittedVoiceCounts"], expected[3], "V0_TEMPLATE_QUARTAL", `${path}.permittedVoiceCounts`, "Quartal count row drifted.", findings);
    requireExact(record["requiredEvidence"], true, "V0_TEMPLATE_QUARTAL", `${path}.requiredEvidence`, "Quartal requires injected evidence.", findings);
    requireExact(record["degreesMustBelongToSelectedRealization"], true, "V0_TEMPLATE_QUARTAL", `${path}.degreesMustBelongToSelectedRealization`, "Quartal context cannot grant degrees.", findings);
    requireExact(record["permittedBassPolicies"], ["generated", "external", "none"], "V0_TEMPLATE_QUARTAL", `${path}.permittedBassPolicies`, "Quartal bass policy drifted.", findings);
    requireExact(record["registerPolicyId"], "quartal-register-v1", "V0_TEMPLATE_REGISTER", `${path}.registerPolicyId`, "Quartal register binding drifted.", findings);
    requireExact(record["registerPolicyVersion"], 1, "V0_TEMPLATE_REGISTER", `${path}.registerPolicyVersion`, "Quartal register version drifted.", findings);
    requireExact(record["targetSpanSemitones"], 15, "V0_TEMPLATE_REGISTER", `${path}.targetSpanSemitones`, "Quartal target span drifted.", findings);
    if ("degreeSequence" in record || "degreeTokens" in record) {
      finding(findings, "V0_TEMPLATE_SELECTION", path, "Quartal rows may not carry a substitute static sequence.");
    }
  });

  requireExact(root["unavailablePolicies"], [
    { id: "shell-no-row-v1", family: "shell", reason: "quality-family-unsupported" },
    { id: "rootless-no-row-v1", family: "rootless-a-or-b", reason: "quality-family-unsupported" },
    { id: "quartal-no-row-v1", family: "quartal", reason: "quartal-row-undeclared" },
  ], "V0_TEMPLATE_UNAVAILABLE", "family-templates.json.unavailablePolicies", "Unavailable policy closure drifted.", findings);
  const registerPolicies = objectArray(root["registerPolicies"]);
  requireExact(registerPolicies, REGISTER_POLICIES, "V0_TEMPLATE_REGISTER", "family-templates.json.registerPolicies", "All five complete register-policy records must match the public union exactly.", findings);
  const checksums = isObject(root["checksums"]) ? root["checksums"] : {};
  requireChecksum(
    checksums["registerPoliciesSha256"],
    projectionDigest(registerPolicies.map((record) => [record])),
    "family-templates.json.checksums.registerPoliciesSha256",
    findings,
  );
  return { realizationClasses, adaptive, fixed, quartal, registerPolicies };
}

function qualityClassForFormulaRule(formulaRuleId: string): string | null {
  for (const entry of QUALITY_CLASSIFICATION) {
    if ((entry.formulaRuleIds as readonly string[]).includes(formulaRuleId)) {
      return entry.qualityClass;
    }
  }
  return null;
}

function t1ExpectedSeeds(
  t1: JsonObject,
  findings: V0ContractFinding[],
): JsonObject[] {
  const rules = objectArray(t1["rules"]);
  const variants = objectArray(t1["alteredDominantVariants"]);
  const assignments = isObject(t1["publicRuleAssignments"])
    ? t1["publicRuleAssignments"]
    : {};
  if (rules.length !== 33 || variants.length !== 4) {
    finding(findings, "V0_MATRIX_T1_AUTHORITY", T1_FORMULA_FIXTURE, "T1 authority must expose 33 literal seeds and four altered realizations.");
  }
  const literalSeeds = rules.map((rule): JsonObject => {
    const id = typeof rule["id"] === "string" ? rule["id"] : "";
    const familyId = typeof rule["familyId"] === "string" ? rule["familyId"] : "";
    const formulaRuleId = assignments[familyId];
    const formula = typeof formulaRuleId === "string" ? formulaRuleId : "";
    return {
      id,
      sourceFixtureRecordId: id,
      sourceKind: "t1-literal-formula-seed",
      selectedRealizationId: "literal",
      formulaRuleId: formula,
      qualityClass: qualityClassForFormulaRule(formula),
      degrees: rule["degrees"],
      requiredDegrees: rule["required"],
      optionalDegrees: rule["optional"],
      guideToneDegrees: rule["guide"],
    };
  });
  const alteredSeeds = variants.map((variant): JsonObject => {
    const id = typeof variant["id"] === "string" ? variant["id"] : "";
    return {
      id,
      sourceFixtureRecordId: id,
      sourceKind: "t1-altered-dominant-realization",
      selectedRealizationId: id,
      formulaRuleId: "altered-dominant",
      qualityClass: "dominant-seventh",
      degrees: variant["degrees"],
      requiredDegrees: variant["required"],
      optionalDegrees: variant["optional"],
      guideToneDegrees: variant["guide"],
    };
  });
  return [...literalSeeds, ...alteredSeeds];
}

function constraintRefusal(reasons: readonly string[], absent: readonly string[] = []): JsonObject | null {
  if (reasons.length === 0) return null;
  const result: JsonObject = {
    code: "voicing.constraints_unsatisfied",
    termination: "constraints-unsatisfied",
    primaryReason: reasons[0],
    reasons: [...reasons],
  };
  if (absent.length > 0) result["absentTemplateDegrees"] = [...absent];
  return result;
}

const AVAILABILITY_CANONICAL_DEGREE_ORDER = [
  "1", "2", "b3", "3", "4", "b5", "5", "#5", "6", "bb7", "b7", "7",
  "b9", "9", "#9", "11", "#11", "b13", "13",
] as const;

const AVAILABILITY_OPTIONAL_NATURAL_ORDER = [
  "13", "b13", "#11", "11", "#9", "b9", "9", "6", "5",
] as const;

function compareAvailabilityOptionalDegrees(left: string, right: string): number {
  const leftDegree = parseDegreeToken(left);
  const rightDegree = parseDegreeToken(right);
  const leftRank = leftDegree !== null && leftDegree.alter !== 0
    ? -1
    : AVAILABILITY_OPTIONAL_NATURAL_ORDER.indexOf(
      left as (typeof AVAILABILITY_OPTIONAL_NATURAL_ORDER)[number],
    );
  const rightRank = rightDegree !== null && rightDegree.alter !== 0
    ? -1
    : AVAILABILITY_OPTIONAL_NATURAL_ORDER.indexOf(
      right as (typeof AVAILABILITY_OPTIONAL_NATURAL_ORDER)[number],
    );
  const normalizedLeftRank = leftRank === -1 && leftDegree?.alter === 0
    ? AVAILABILITY_OPTIONAL_NATURAL_ORDER.length
    : leftRank;
  const normalizedRightRank = rightRank === -1 && rightDegree?.alter === 0
    ? AVAILABILITY_OPTIONAL_NATURAL_ORDER.length
    : rightRank;
  if (normalizedLeftRank !== normalizedRightRank) {
    return normalizedLeftRank - normalizedRightRank;
  }
  const leftCanonical = AVAILABILITY_CANONICAL_DEGREE_ORDER.indexOf(
    left as (typeof AVAILABILITY_CANONICAL_DEGREE_ORDER)[number],
  );
  const rightCanonical = AVAILABILITY_CANONICAL_DEGREE_ORDER.indexOf(
    right as (typeof AVAILABILITY_CANONICAL_DEGREE_ORDER)[number],
  );
  if (leftCanonical !== -1 || rightCanonical !== -1) {
    if (leftCanonical === -1) return 1;
    if (rightCanonical === -1) return -1;
    return leftCanonical - rightCanonical;
  }
  if (leftDegree !== null && rightDegree !== null) {
    return leftDegree.number - rightDegree.number || leftDegree.alter - rightDegree.alter;
  }
  return codeUnitCompare(left, right);
}

function selectedAdaptiveDegrees(seed: JsonObject, voiceCount: number): readonly string[] {
  const degrees = stringArray(seed["degrees"]);
  const required = new Set(stringArray(seed["requiredDegrees"]));
  const guides = new Set(stringArray(seed["guideToneDegrees"]));
  const optional = new Set(stringArray(seed["optionalDegrees"]));
  const selected = degrees.filter(
    (degree, index) =>
      (required.has(degree) || guides.has(degree)) && degrees.indexOf(degree) === index,
  );
  const selectedSet = new Set(selected);
  const optionalDegrees = degrees
    .filter(
      (degree, index) =>
        optional.has(degree)
        && !selectedSet.has(degree)
        && degrees.indexOf(degree) === index,
    )
    .sort(compareAvailabilityOptionalDegrees);
  for (const degree of optionalDegrees) {
    if (selected.length >= voiceCount) break;
    selected.push(degree);
    selectedSet.add(degree);
  }
  return selected.slice(0, voiceCount);
}

/**
 * Independent static Drop-2 oracle. Each selected pitch class is tried as the
 * bottom of a unique, ascending closed source. The literal second-from-top is
 * then lowered one octave and the frozen family geometry is checked.
 */
function drop2StaticStructureIsFeasible(
  degreeTokens: readonly string[],
  voiceCount: number,
): boolean {
  if (degreeTokens.length !== voiceCount) return false;
  const pitchClasses = degreeTokens.map((degree) => {
    const semitones = degreeSemitones(degree);
    return semitones === null ? null : mod12(semitones);
  });
  if (
    pitchClasses.some((pitchClass) => pitchClass === null)
    || new Set(pitchClasses).size !== pitchClasses.length
  ) {
    return false;
  }
  const exactPitchClasses = pitchClasses.filter(
    (pitchClass): pitchClass is number => pitchClass !== null,
  );
  for (const lowestPitchClass of exactPitchClasses) {
    const closedSource = exactPitchClasses
      .map((pitchClass) => mod12(pitchClass - lowestPitchClass))
      .sort((left, right) => left - right);
    const sourceLowest = closedSource[0];
    const sourceHighest = closedSource.at(-1);
    if (
      sourceLowest === undefined
      || sourceHighest === undefined
      || sourceHighest - sourceLowest > 11
    ) {
      continue;
    }
    const secondFromTopIndex = closedSource.length - 2;
    const transformed = closedSource
      .map((midi, index) => index === secondFromTopIndex ? midi - 12 : midi)
      .sort((left, right) => left - right);
    const transformedLowest = transformed[0];
    const transformedHighest = transformed.at(-1);
    if (transformedLowest === undefined || transformedHighest === undefined) continue;
    const span = transformedHighest - transformedLowest;
    if (span < 12 || span > 36) continue;
    const requiresWideGap = voiceCount === 4 || voiceCount === 5;
    if (
      requiresWideGap
      && !transformed.some((midi, index) => {
        const next = transformed[index + 1];
        return next !== undefined && next - midi >= 7;
      })
    ) {
      continue;
    }
    return true;
  }
  return false;
}

function expectedAvailabilityDecision(
  seed: JsonObject,
  family: string,
  voiceCount: number,
  templates: Readonly<{ adaptive: JsonObject[]; fixed: JsonObject[]; quartal: JsonObject[] }>,
): Readonly<{ policyId: string; expected: JsonObject }> {
  const degrees = stringArray(seed["degrees"]);
  const required = stringArray(seed["requiredDegrees"]);
  const guides = new Set(stringArray(seed["guideToneDegrees"]));
  const qualityClass = typeof seed["qualityClass"] === "string" ? seed["qualityClass"] : "";
  if (family === "balanced" || family === "open" || family === "drop2") {
    const template = templates.adaptive.find((record) => record["family"] === family);
    const policyId = typeof template?.["id"] === "string" ? template["id"] : "";
    const minimum = family === "drop2" ? 4 : 3;
    const mandatory = degrees.filter(
      (degree, index) =>
        (required.includes(degree) || guides.has(degree)) &&
        degrees.indexOf(degree) === index,
    );
    const legalDoublings = ["1", "5"].filter((token) => degrees.includes(token) && !guides.has(token)).length;
    const generalMaximum = Math.min(7, new Set(degrees).size + legalDoublings);
    const reasons: string[] = [];
    if (voiceCount < minimum) {
      reasons.push("voice-count-below-template-minimum");
    } else {
      const omitted = mandatory.slice(voiceCount);
      if (omitted.some((degree) => required.includes(degree))) {
        reasons.push("required-degree-omitted");
      }
      if (omitted.some((degree) => guides.has(degree))) {
        reasons.push("guide-tone-omitted");
      }
      if (reasons.length === 0) {
        if (family === "drop2" && voiceCount > new Set(degrees).size) {
          reasons.push("doubling-not-permitted");
        } else if (voiceCount > generalMaximum) {
          reasons.push("voice-count-unsupported");
        }
      }
      if (reasons.length === 0 && family === "drop2") {
        const selected = selectedAdaptiveDegrees(seed, voiceCount);
        if (!drop2StaticStructureIsFeasible(selected, voiceCount)) {
          reasons.push("family-transform-invalid");
        }
      }
    }
    return {
      policyId,
      expected: { templateAvailability: "available", refusal: constraintRefusal(reasons) },
    };
  }
  if (family === "shell" || family === "rootless-a" || family === "rootless-b") {
    const template = templates.fixed.find((record) =>
      record["family"] === family && stringArray(record["realizationClasses"]).includes(qualityClass)
    );
    if (template === undefined) {
      return {
        policyId: family === "shell" ? "shell-no-row-v1" : "rootless-no-row-v1",
        expected: {
          templateAvailability: "unavailable",
          refusal: {
            code: "voicing.family_unavailable",
            termination: "family-unavailable",
            reason: "quality-family-unsupported",
          },
        },
      };
    }
    const tokens = stringArray(template["degreeTokens"]);
    const absent = tokens.filter((token) => !degrees.includes(token));
    const permittedCounts = Array.isArray(template["permittedVoiceCounts"])
      ? template["permittedVoiceCounts"]
      : [];
    const minimum = typeof template["minimumVoiceCount"] === "number"
      ? template["minimumVoiceCount"]
      : tokens.length;
    const reasons: string[] = [];
    if (absent.length > 0) reasons.push("template-degree-absent");
    if (voiceCount < minimum) reasons.push("voice-count-below-template-minimum");
    else if (!permittedCounts.includes(voiceCount)) reasons.push("voice-count-unsupported");
    return {
      policyId: typeof template["id"] === "string" ? template["id"] : "",
      expected: {
        templateAvailability: "available",
        refusal: constraintRefusal(reasons, absent),
      },
    };
  }
  const quartal = templates.quartal.find((record) =>
    stringArray(record["realizationClasses"]).includes(qualityClass)
  );
  if (quartal === undefined) {
    return {
      policyId: "quartal-no-row-v1",
      expected: {
        templateAvailability: "unavailable",
        refusal: {
          code: "voicing.family_unavailable",
          termination: "family-unavailable",
          reason: "quartal-row-undeclared",
        },
      },
    };
  }
  const permittedCounts = Array.isArray(quartal["permittedVoiceCounts"])
    ? quartal["permittedVoiceCounts"]
    : [];
  const reasons = permittedCounts.includes(voiceCount) ? [] : ["voice-count-unsupported"];
  return {
    policyId: typeof quartal["id"] === "string" ? quartal["id"] : "",
    expected: {
      templateAvailability: "context-gated",
      quartalContextPolicyId: "changes.quartal-context-gate",
      quartalContextPolicyVersion: 1,
      requestTimeSequenceValidationRequired: true,
      refusal: constraintRefusal(reasons),
    },
  };
}

function increment(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function sortedCountObject(counts: Readonly<Record<string, number>>): JsonObject {
  const result: JsonObject = {};
  for (const key of Object.keys(counts).sort(codeUnitCompare)) result[key] = counts[key];
  return result;
}

function validateAvailabilityMatrix(
  root: JsonObject,
  t1: JsonObject,
  templates: Readonly<{ adaptive: JsonObject[]; fixed: JsonObject[]; quartal: JsonObject[] }>,
  findings: V0ContractFinding[],
): Readonly<{ seeds: JsonObject[]; cells: JsonObject[] }> {
  requireExact(root["matrixId"], "changes.voicing-availability-matrix", "V0_MATRIX_IDENTITY", "availability-matrix.json.matrixId", "Matrix ID drifted.", findings);
  requireExact(root["matrixVersion"], 1, "V0_MATRIX_IDENTITY", "availability-matrix.json.matrixVersion", "Matrix version drifted.", findings);
  const provenance = isObject(root["provenance"]) ? root["provenance"] : {};
  for (const key of ["generatedByProductionAlgorithm", "productionModuleImported", "productionAlgorithmExecuted", "copiedFromProductionOutput"] as const) {
    requireExact(provenance[key], false, "V0_MATRIX_INDEPENDENCE", `availability-matrix.json.provenance.${key}`, "Mechanical expansion may not use production output, imports, or execution.", findings);
  }
  const seeds = objectArray(root["realizationSeeds"]);
  const expectedSeeds = t1ExpectedSeeds(t1, findings);
  requireExact(seeds, expectedSeeds, "V0_MATRIX_T1_AUTHORITY", "availability-matrix.json.realizationSeeds", "All 37 seeds must independently reproduce the T1 authority in exact order.", findings);
  requireUniqueIds(seeds, "availability-matrix.json.realizationSeeds", findings);
  const expectedSeedOrder = expectedSeeds.map((seed) => seed["id"]);
  const axes = isObject(root["axes"]) ? root["axes"] : {};
  requireExact(axes["realizationSeedOrder"], expectedSeedOrder, "V0_MATRIX_AXES", "availability-matrix.json.axes.realizationSeedOrder", "Seed axis drifted.", findings);
  requireExact(axes["familyOrder"], FAMILIES, "V0_MATRIX_AXES", "availability-matrix.json.axes.familyOrder", "Family axis drifted.", findings);
  requireExact(axes["voiceCountOrder"], VOICE_COUNTS, "V0_MATRIX_AXES", "availability-matrix.json.axes.voiceCountOrder", "Voice-count axis drifted.", findings);
  requireExact(axes["cellOrder"], ["realization-seed-order", "family-order", "voice-count-order"], "V0_MATRIX_AXES", "availability-matrix.json.axes.cellOrder", "Cell nesting order drifted.", findings);

  const cells = objectArray(root["cells"]);
  requireUniqueIds(cells, "availability-matrix.json.cells", findings);
  if (cells.length !== 37 * 7 * 5) {
    finding(findings, "V0_MATRIX_CARDINALITY", "availability-matrix.json.cells", "The complete Cartesian matrix requires exactly 1,295 cells.");
  }
  const expectedCells: JsonObject[] = [];
  for (const seed of expectedSeeds) {
    for (const family of FAMILIES) {
      for (const voiceCount of VOICE_COUNTS) {
        const id = `V0-AVAIL-${String(seed["id"])}-${family}-vc${String(voiceCount)}`;
        const decision = expectedAvailabilityDecision(seed, family, voiceCount, templates);
        expectedCells.push({
          id,
          realizationSeedId: seed["id"],
          selectedRealizationId: seed["selectedRealizationId"],
          formulaRuleId: seed["formulaRuleId"],
          qualityClass: seed["qualityClass"],
          family,
          voiceCount,
          policyId: decision.policyId,
          expected: decision.expected,
        });
      }
    }
  }
  cells.forEach((cell, index) => {
    const expected = expectedCells[index];
    if (expected !== undefined) {
      requireExact(cell, expected, "V0_MATRIX_DECISION", `availability-matrix.json.cells[${String(index)}]`, "Cell identity or independent static decision drifted.", findings);
    }
  });

  const byFamily: Record<string, number> = {};
  const byAvailability: Record<string, number> = {};
  const byRefusal: Record<string, number> = {};
  const byReason: Record<string, number> = {};
  const byPolicy: Record<string, number> = {};
  for (const cell of cells) {
    if (typeof cell["family"] === "string") increment(byFamily, cell["family"]);
    if (typeof cell["policyId"] === "string") increment(byPolicy, cell["policyId"]);
    const expected = isObject(cell["expected"]) ? cell["expected"] : {};
    if (typeof expected["templateAvailability"] === "string") increment(byAvailability, expected["templateAvailability"]);
    const refusal = isObject(expected["refusal"]) ? expected["refusal"] : null;
    if (refusal === null) {
      increment(byRefusal, "none");
    } else {
      if (typeof refusal["code"] === "string") increment(byRefusal, refusal["code"]);
      const reason = typeof refusal["primaryReason"] === "string"
        ? refusal["primaryReason"]
        : refusal["reason"];
      if (typeof reason === "string") increment(byReason, reason);
    }
  }
  const expectedCounts = {
    literalRealizationSeeds: 33,
    alteredDominantRealizationSeeds: 4,
    realizationSeeds: seeds.length,
    families: 7,
    voiceCounts: 5,
    expectedCells: 1295,
    actualCells: cells.length,
    byFamily: sortedCountObject(byFamily),
    byTemplateAvailability: sortedCountObject(byAvailability),
    byRefusalCode: sortedCountObject(byRefusal),
    byPrimaryReason: sortedCountObject(byReason),
    byPolicyId: sortedCountObject(byPolicy),
  };
  requireExact(root["counts"], expectedCounts, "V0_MATRIX_COUNTS", "availability-matrix.json.counts", "Matrix summary counts must be recomputed from the cells.", findings);

  const checksums = isObject(root["checksums"]) ? root["checksums"] : {};
  requireChecksum(checksums["seedOrderSha256"], projectionDigest(seeds.map((seed) => [seed["id"], seed["selectedRealizationId"], seed["formulaRuleId"], seed["qualityClass"], seed["degrees"], seed["requiredDegrees"], seed["optionalDegrees"], seed["guideToneDegrees"]])), "availability-matrix.json.checksums.seedOrderSha256", findings);
  requireChecksum(checksums["cellIdentitySha256"], projectionDigest(cells.map((cell) => [cell["id"], cell["realizationSeedId"], cell["selectedRealizationId"], cell["formulaRuleId"], cell["qualityClass"], cell["family"], cell["voiceCount"]])), "availability-matrix.json.checksums.cellIdentitySha256", findings);
  requireChecksum(checksums["cellDecisionSha256"], projectionDigest(cells.map((cell) => [cell["id"], cell["policyId"], cell["expected"]])), "availability-matrix.json.checksums.cellDecisionSha256", findings);
  requireChecksum(checksums["fixturePayloadSha256"], fixturePayloadDigest(root), "availability-matrix.json.checksums.fixturePayloadSha256", findings);
  return { seeds, cells };
}

const NATURAL_PITCH_CLASSES: Readonly<Record<string, number>> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
};

function mod12(value: number): number {
  return ((value % 12) + 12) % 12;
}

function pitchClassFromSpelling(value: unknown): number | null {
  if (!isObject(value) || typeof value["step"] !== "string" || !Number.isInteger(value["alter"])) {
    return null;
  }
  const natural = NATURAL_PITCH_CLASSES[value["step"]];
  const alter = value["alter"] as number;
  return natural === undefined || alter < -2 || alter > 2 ? null : mod12(natural + alter);
}

function midiFromSpelling(value: unknown): number | null {
  if (!isObject(value) || !Number.isInteger(value["octave"])) return null;
  const pitchClass = pitchClassFromSpelling(value);
  if (pitchClass === null) return null;
  const step = typeof value["step"] === "string" ? value["step"] : "";
  const natural = NATURAL_PITCH_CLASSES[step];
  const alter = value["alter"] as number;
  const octave = value["octave"] as number;
  if (natural === undefined) return null;
  return (octave + 1) * 12 + natural + alter;
}

function rootPitchClass(sourceSymbol: string): number | null {
  const match = /^([A-G])(bb|b|##|#)?/u.exec(sourceSymbol);
  if (match === null) return null;
  const natural = NATURAL_PITCH_CLASSES[match[1] ?? ""];
  if (natural === undefined) return null;
  const accidental = match[2] ?? "";
  const alter = accidental === "bb" ? -2 : accidental === "b" ? -1 : accidental === "##" ? 2 : accidental === "#" ? 1 : 0;
  return mod12(natural + alter);
}

function slashBassSpelling(sourceSymbol: string): Readonly<{ step: string; alter: number }> | null {
  const slash = sourceSymbol.lastIndexOf("/");
  if (slash < 0) return null;
  const text = sourceSymbol.slice(slash + 1);
  const match = /^([A-G])(bb|b|##|#)?$/u.exec(text);
  if (match === null || match[1] === undefined) return null;
  const accidental = match[2] ?? "";
  return {
    step: match[1],
    alter: accidental === "bb" ? -2 : accidental === "b" ? -1 : accidental === "##" ? 2 : accidental === "#" ? 1 : 0,
  };
}

function candidateRealization(
  sourceSymbol: string,
  realizationId: unknown,
  t1: JsonObject,
): Readonly<{ degrees: string[]; required: string[]; optional: string[]; guide: string[] }> | null {
  if (typeof realizationId !== "string") return null;
  if (realizationId !== "literal") {
    const variant = objectArray(t1["alteredDominantVariants"]).find((record) => record["id"] === realizationId);
    return variant === undefined
      ? null
      : {
          degrees: stringArray(variant["degrees"]),
          required: stringArray(variant["required"]),
          optional: stringArray(variant["optional"]),
          guide: stringArray(variant["guide"]),
        };
  }
  const candidates = objectArray(t1["rules"])
    .map((rule) => ({ rule, rendered: typeof rule["symbolTemplate"] === "string" ? rule["symbolTemplate"].replace("{root}", "C") : "" }))
    .filter((entry) => sourceSymbol === entry.rendered || sourceSymbol.startsWith(`${entry.rendered}/`))
    .sort((left, right) => right.rendered.length - left.rendered.length);
  const selected = candidates[0]?.rule;
  return selected === undefined
    ? null
    : {
        degrees: stringArray(selected["degrees"]),
        required: stringArray(selected["required"]),
        optional: stringArray(selected["optional"]),
        guide: stringArray(selected["guide"]),
      };
}

function minimumSpacing(lowerMidi: number): number | null {
  const band = LOW_SPACING.find((entry) => lowerMidi <= entry.maximumLowerMidi);
  return band?.minimumSemitones ?? null;
}

function validateCandidateCases(
  root: JsonObject,
  t1: JsonObject,
  templates: Readonly<{ fixed: JsonObject[] }>,
  findings: V0ContractFinding[],
): JsonObject[] {
  const cases = objectArray(root["cases"]);
  const ids = requireUniqueIds(cases, "candidate-cases.json.cases", findings);
  requireExact(ids, Array.from({ length: 38 }, (_, index) => `V0-CAND-${String(index + 1).padStart(3, "0")}`), "V0_CANDIDATE_INVENTORY", "candidate-cases.json.cases", "Candidate case IDs/order must be V0-CAND-001 through 038.", findings);
  const expectedAdaptiveSlotRefusal = {
    id: "V0-CAND-033",
    description: "supported three-voice altered Balanced request reports exact unplaceable required and guide suffixes rather than raising the template minimum",
    sourceSymbol: "C7alt",
    realizationId: "alt-b9-b5",
    policy: { family: "balanced", voiceCount: 3, range: { lowMidi: 60, highMidi: 84 }, bassPolicy: "generated" },
    expected: {
      kind: "refusal",
      code: "voicing.constraints_unsatisfied",
      termination: "constraints-unsatisfied",
      primaryReason: "required-degree-omitted",
      reasons: ["required-degree-omitted", "guide-tone-omitted"],
      omittedRequiredDegrees: ["b7", "b9"],
      omittedGuideToneDegrees: ["b7"],
    },
    traceIds: ["V0-TRACE-DEGREES", "V0-TRACE-FAMILIES", "V0-TRACE-REFUSAL", "V0-TRACE-ALT-SELECTION"],
    authorityIds: ["V0-AUTH-T1", "V0-AUTH-TEMPLATES", "V0-AUTH-CONTRACT", "V0-AUTH-INDEPENDENCE"],
  };
  requireExact(
    cases.find((record) => record["id"] === "V0-CAND-033"),
    expectedAdaptiveSlotRefusal,
    "V0_ADAPTIVE_SLOT_DIAGNOSTICS",
    "candidate-cases.json.cases[V0-CAND-033]",
    "The exact supported-count adaptive omission refusal drifted.",
    findings,
  );
  let generatedVoiceRecords = 0;
  cases.forEach((record, index) => {
    const path = `candidate-cases.json.cases[${String(index)}]`;
    const expected = isObject(record["expected"]) ? record["expected"] : {};
    const kind = expected["kind"];
    if (kind === "stored-bypass") {
      const request = isObject(record["request"]) ? record["request"] : {};
      const voicing = isObject(request["voicing"]) ? request["voicing"] : {};
      const pitches = objectArray(voicing["pitches"]);
      if (request["kind"] !== "stored" || !["manual", "frozen"].includes(String(voicing["mode"])) || pitches.length === 0) {
        finding(findings, "V0_CANDIDATE_BYPASS", path, "Stored bypass cases require a nonempty Manual or Frozen voicing.");
      }
      pitches.forEach((pitch, pitchIndex) => {
        const midi = midiFromSpelling(pitch);
        if (midi === null || midi < 0 || midi > 127) {
          finding(findings, "V0_CANDIDATE_MIDI", `${path}.request.voicing.pitches[${String(pitchIndex)}]`, "Stored spelling must project to MIDI 0..127 independently.");
        }
      });
      for (const [key, value] of Object.entries({
        candidateGenerationPerformed: false,
        rawCandidateCount: 0,
        retainedCandidateCount: 0,
        allCounters: 0,
        termination: "complete-bypass",
        sameObjectValue: true,
      })) {
        requireExact(expected[key], value, "V0_CANDIDATE_BYPASS", `${path}.expected.${key}`, "Stored bypass evidence drifted.", findings);
      }
      return;
    }
    if (kind === "refusal") {
      const code = expected["code"];
      if (typeof code !== "string" || !(REFUSAL_CODES as readonly string[]).includes(code)) {
        finding(findings, "V0_CANDIDATE_REFUSAL", `${path}.expected.code`, "Refusal code is outside the closed V0 vocabulary.");
      } else {
        requireExact(expected["termination"], TERMINATION_BY_REFUSAL[code], "V0_CANDIDATE_REFUSAL", `${path}.expected.termination`, "Refusal termination does not match its code.", findings);
      }
      const primaryReason = expected["primaryReason"];
      if (primaryReason !== undefined && (typeof primaryReason !== "string" || !(CONSTRAINT_REASONS as readonly string[]).includes(primaryReason))) {
        finding(findings, "V0_CANDIDATE_REFUSAL", `${path}.expected.primaryReason`, "Constraint reason is outside the closed vocabulary.");
      }
      const quartalReason = expected["reason"];
      if (code === "voicing.quartal_context_invalid" && (typeof quartalReason !== "string" || !(QUARTAL_INVALID_REASONS as readonly string[]).includes(quartalReason))) {
        finding(findings, "V0_CANDIDATE_REFUSAL", `${path}.expected.reason`, "Quartal invalid reason is outside the closed vocabulary.");
      }
      return;
    }
    if (kind !== "must-contain-candidate") {
      finding(findings, "V0_CANDIDATE_KIND", `${path}.expected.kind`, "Candidate case kind is not recognized.");
      return;
    }
    const voices = objectArray(expected["voices"]);
    generatedVoiceRecords += voices.length;
    const sourceSymbol = record["sourceSymbol"];
    const policy = isObject(record["policy"]) ? record["policy"] : {};
    const range = isObject(policy["range"]) ? policy["range"] : {};
    const family = policy["family"];
    const voiceCount = policy["voiceCount"];
    if (typeof sourceSymbol !== "string" || typeof family !== "string" || typeof voiceCount !== "number") {
      finding(findings, "V0_CANDIDATE_SHAPE", path, "Generated cases require source, family, count, and range.");
      return;
    }
    const realization = candidateRealization(sourceSymbol, record["realizationId"], t1);
    if (realization === null) {
      finding(findings, "V0_CANDIDATE_REALIZATION", `${path}.realizationId`, "Candidate source/realization does not bind an independent T1 authority record.");
      return;
    }
    if (voices.length !== voiceCount) {
      finding(findings, "V0_CANDIDATE_VOICE_COUNT", `${path}.expected.voices`, "Expected sounded voices must equal total policy voiceCount.");
    }
    const rootPc = rootPitchClass(sourceSymbol);
    const midiValues: number[] = [];
    const degreeTokens: Array<string | null> = [];
    voices.forEach((voice, voiceIndex) => {
      const voicePath = `${path}.expected.voices[${String(voiceIndex)}]`;
      const calculatedMidi = midiFromSpelling(voice["spelling"]);
      const recordedMidi = voice["midi"];
      if (calculatedMidi === null || recordedMidi !== calculatedMidi || calculatedMidi < 0 || calculatedMidi > 127) {
        finding(findings, "V0_CANDIDATE_MIDI", `${voicePath}.midi`, "Recorded MIDI must equal independent scientific-pitch arithmetic and remain within 0..127.");
      }
      if (typeof recordedMidi === "number") midiValues.push(recordedMidi);
      const degree = voice["degree"];
      degreeTokens.push(typeof degree === "string" ? degree : null);
      const provenance = voice["provenance"];
      if (provenance === "slash-bass") {
        requireExact(degree, null, "V0_CANDIDATE_DEGREE", `${voicePath}.degree`, "Slash bass alone has null degree.", findings);
        requireExact(voice["sourceDegreeIndex"], null, "V0_CANDIDATE_SOURCE_INDEX", `${voicePath}.sourceDegreeIndex`, "Slash bass has no realization source index.", findings);
      } else if (provenance === "realization" || provenance === "doubling") {
        if (typeof degree !== "string" || !realization.degrees.includes(degree)) {
          finding(findings, "V0_CANDIDATE_DEGREE", `${voicePath}.degree`, "Every non-slash voice must be an exact member of the selected realization.");
        } else {
          requireExact(voice["sourceDegreeIndex"], realization.degrees.indexOf(degree), "V0_CANDIDATE_SOURCE_INDEX", `${voicePath}.sourceDegreeIndex`, "Every realization or doubling voice must retain its exact selected-realization member index.", findings);
          const semitones = degreeSemitones(degree);
          const spellingPc = pitchClassFromSpelling(voice["spelling"]);
          if (rootPc === null || semitones === null || spellingPc !== mod12(rootPc + semitones)) {
            finding(findings, "V0_CANDIDATE_SPELLING", `${voicePath}.spelling`, "Voice spelling must preserve the exact degree above the source root.");
          }
        }
      } else {
        finding(findings, "V0_CANDIDATE_DEGREE", `${voicePath}.provenance`, "Voice provenance is outside realization/doubling/slash-bass.");
      }
    });
    if (new Set(midiValues).size !== midiValues.length || midiValues.some((midi, midiIndex) => midiIndex > 0 && midi <= (midiValues[midiIndex - 1] ?? midi))) {
      finding(findings, "V0_CANDIDATE_MIDI", `${path}.expected.voices`, "Candidate MIDI must be unique and strictly ascending.");
    }
    const low = range["lowMidi"];
    const high = range["highMidi"];
    if (typeof low !== "number" || typeof high !== "number" || midiValues.some((midi) => midi < low || midi > high)) {
      finding(findings, "V0_CANDIDATE_RANGE", `${path}.policy.range`, "Every expected MIDI must lie in the inclusive requested range.");
    }
    midiValues.slice(0, -1).forEach((midi, midiIndex) => {
      const next = midiValues[midiIndex + 1];
      const minimum = minimumSpacing(midi);
      if (next === undefined || minimum === null || next - midi < minimum) {
        finding(findings, "V0_CANDIDATE_SPACING", `${path}.expected.voices[${String(midiIndex)}]`, "Adjacent candidate pitches violate the lower-MIDI spacing band.");
      }
    });
    const slash = slashBassSpelling(sourceSymbol);
    const bassPolicy = policy["bassPolicy"];
    if (slash !== null && bassPolicy === "generated") {
      const first = voices[0];
      requireExact(first?.["provenance"], "slash-bass", "V0_CANDIDATE_BASS", `${path}.expected.voices[0].provenance`, "Generated explicit slash bass must be the lowest voice.", findings);
      if (isObject(first?.["spelling"])) {
        requireExact({ step: first["spelling"]["step"], alter: first["spelling"]["alter"] }, slash, "V0_CANDIDATE_BASS", `${path}.expected.voices[0].spelling`, "Generated slash bass must preserve exact spelling.", findings);
      }
    }
    if (slash === null && bassPolicy === "generated") {
      requireExact(degreeTokens[0], "1", "V0_CANDIDATE_BASS", `${path}.expected.voices[0].degree`, "Generated non-slash effective root bass must be the lowest voice, including after transforms.", findings);
    }
    const externalBass = expected["externalBass"];
    if (bassPolicy === "external" && isObject(externalBass)) {
      const externalPc = pitchClassFromSpelling(externalBass);
      if (externalPc === null || voices.some((voice) => pitchClassFromSpelling(voice["spelling"]) === externalPc)) {
        finding(findings, "V0_CANDIDATE_BASS", `${path}.expected.externalBass`, "Named external bass must be valid and excluded by sounding pitch class.");
      }
    }
    if ((family === "rootless-a" || family === "rootless-b") && (bassPolicy !== "external" || degreeTokens.includes("1"))) {
      finding(findings, "V0_CANDIDATE_BASS", path, "Rootless candidates require external bass and exact root omission.");
    }
    if (family === "shell" || family === "rootless-a" || family === "rootless-b") {
      const matching = templates.fixed.find((template) => template["family"] === family && sameJson(template["degreeTokens"], degreeTokens));
      if (matching === undefined) {
        finding(findings, "V0_CANDIDATE_TEMPLATE", `${path}.expected.voices`, "Fixed-family degrees must equal one exact checked-in low-to-high row.");
      } else if (expected["templateId"] !== undefined) {
        requireExact(expected["templateId"], matching["id"], "V0_CANDIDATE_TEMPLATE", `${path}.expected.templateId`, "Expected fixed template ID does not match the degree row.", findings);
      }
    }
    if (family === "open") {
      const span = (midiValues.at(-1) ?? 0) - (midiValues[0] ?? 0);
      const gaps = midiValues.slice(1).map((midi, gapIndex) => midi - (midiValues[gapIndex] ?? midi));
      if (span < 12 || span > 36 || !gaps.some((gap) => gap >= 7)) {
        finding(findings, "V0_CANDIDATE_FAMILY", `${path}.expected.voices`, "Open requires span 12..36 and a gap of at least seven semitones.");
      }
      if (expected["spanSemitones"] !== undefined) requireExact(expected["spanSemitones"], span, "V0_CANDIDATE_FAMILY", `${path}.expected.spanSemitones`, "Recorded Open span is arithmetically wrong.", findings);
    }
    if (family === "drop2") {
      const drop2 = isObject(expected["drop2"]) ? expected["drop2"] : {};
      const source = Array.isArray(drop2["closedSourceMidi"]) ? drop2["closedSourceMidi"] : [];
      const transformed = Array.isArray(drop2["transformedMidi"]) ? drop2["transformedMidi"] : [];
      const ordinal = drop2["secondFromTopSourceOrdinal"];
      if (source.length < 4 || source.some((midi) => typeof midi !== "number") || new Set(source).size !== source.length || (Number(source.at(-1)) - Number(source[0])) > 11) {
        finding(findings, "V0_CANDIDATE_DROP2", `${path}.expected.drop2.closedSourceMidi`, "Drop-2 source must be four-plus unique ascending voices within 11 semitones.");
      }
      requireExact(ordinal, source.length - 2, "V0_CANDIDATE_DROP2", `${path}.expected.drop2.secondFromTopSourceOrdinal`, "Drop-2 must select exactly the second-highest source ordinal.", findings);
      requireExact(drop2["loweredBySemitones"], 12, "V0_CANDIDATE_DROP2", `${path}.expected.drop2.loweredBySemitones`, "Drop-2 lowers exactly one octave.", findings);
      const mechanicallyTransformed = source.map((midi, sourceIndex) => Number(midi) - (sourceIndex === ordinal ? 12 : 0)).sort((left, right) => left - right);
      requireExact(transformed, mechanicallyTransformed, "V0_CANDIDATE_DROP2", `${path}.expected.drop2.transformedMidi`, "Drop-2 transformed sequence is arithmetically wrong.", findings);
      requireExact(transformed, midiValues, "V0_CANDIDATE_DROP2", `${path}.expected.voices`, "Candidate MIDI must equal the recorded Drop-2 transform.", findings);
      const gaps = midiValues.slice(1).map((midi, gapIndex) => midi - (midiValues[gapIndex] ?? midi));
      if (typeof voiceCount === "number" && voiceCount <= 5 && !gaps.some((gap) => gap >= 7)) {
        finding(findings, "V0_CANDIDATE_DROP2", `${path}.expected.voices`, "Four- and five-voice Drop-2 requires the declared seven-semitone wide gap.");
      }
      if (expected["exactAdjacentSemitones"] !== undefined) {
        requireExact(expected["exactAdjacentSemitones"], gaps, "V0_CANDIDATE_DROP2", `${path}.expected.exactAdjacentSemitones`, "Recorded dense Drop-2 adjacencies are arithmetically wrong.", findings);
      }
      if (expected["spanSemitones"] !== undefined) {
        requireExact(expected["spanSemitones"], (midiValues.at(-1) ?? 0) - (midiValues[0] ?? 0), "V0_CANDIDATE_DROP2", `${path}.expected.spanSemitones`, "Recorded Drop-2 span is arithmetically wrong.", findings);
      }
    }
    if (family === "quartal") {
      const context = isObject(record["quartalContext"]) ? record["quartalContext"] : {};
      const sequence = stringArray(context["degreeSequence"]);
      const soundedDegrees = degreeTokens.filter((token): token is string => token !== null);
      requireExact(sequence, soundedDegrees, "V0_CANDIDATE_QUARTAL", `${path}.quartalContext.degreeSequence`, "Quartal context must own the exact low-to-high degree sequence.", findings);
      const gaps = midiValues.slice(1).map((midi, gapIndex) => midi - (midiValues[gapIndex] ?? midi));
      if (!gaps.every((gap) => gap === 5 || gap === 6)) {
        finding(findings, "V0_CANDIDATE_QUARTAL", `${path}.expected.voices`, "Quartal adjacency must be exactly five or six semitones.");
      }
      requireExact(expected["adjacentSemitones"], gaps, "V0_CANDIDATE_QUARTAL", `${path}.expected.adjacentSemitones`, "Recorded Quartal adjacency is arithmetically wrong.", findings);
    }
  });
  requireExact(generatedVoiceRecords, 90, "V0_CANDIDATE_SOURCE_INDEX", "candidate-cases.json.cases.expected.voices", "The reviewed generated-candidate corpus must cover exactly 90 source-indexed voice records.", findings);
  return cases;
}

function expectedCounterBoundaryCase(
  counterKind: "work" | "memory",
  counter: string,
  maximum: number,
  ordinal: number,
  boundary: "exact-limit" | "attempted-limit-plus-one",
): JsonObject {
  const prefix = counterKind === "work" ? "WORK" : "MEMORY";
  const suffix = boundary === "exact-limit" ? "EXACT" : "PLUS-ONE";
  const id = `V0-LIMIT-${prefix}-${String(ordinal).padStart(3, "0")}-${suffix}`;
  if (boundary === "exact-limit") {
    return {
      id,
      counterKind,
      counter,
      boundary,
      maximum,
      inputEvidence: { acceptedCounterValue: maximum, attemptedNextUnit: false },
      expected: {
        limitDisposition: "accepted-at-inclusive-maximum",
        evidenceProjection: { counter, acceptedValue: maximum },
        limitRefusal: null,
        overallOperationOutcomeFixedByThisCase: false,
      },
    };
  }
  if (counter === "constraintObservationsProduced") {
    return {
      id,
      counterKind,
      counter,
      boundary,
      maximum,
      inputEvidence: {
        acceptedCounterValueBeforeAttempt: maximum,
        attemptedValue: maximum + 1,
        attemptedNextUnit: true,
      },
      expected: {
        limitDisposition: "save-provisional-refusal-before-accepting-attempted-unit",
        collectorAttemptOk: false,
        evidenceProjection: { counter, acceptedValue: maximum },
        refusal: {
          code: "limit.voicing_work_exceeded",
          path: [],
          counter,
          received: maximum + 1,
          maximum,
          partialResult: false,
        },
        diagnosticCollectionDisposition: "stop-at-prospective-distinct-observation",
        operationDisposition: "continue-musical-search",
        overallOperationOutcomeFixedByThisCase: false,
      },
    };
  }
  return {
    id,
    counterKind,
    counter,
    boundary,
    maximum,
    inputEvidence: {
      acceptedCounterValueBeforeAttempt: maximum,
      attemptedValue: maximum + 1,
      attemptedNextUnit: true,
    },
    expected: {
      limitDisposition: "refuse-before-accepting-attempted-unit",
      ok: false,
      valuePresent: false,
      evidenceProjection: {
        counter,
        acceptedValue: maximum,
        termination: "work-limit-exceeded",
      },
      refusal: {
        code: "limit.voicing_work_exceeded",
        path: [],
        counter,
        received: maximum + 1,
        maximum,
        partialResult: false,
      },
    },
  };
}

function normativeCounterBoundaryRecord(record: JsonObject): JsonObject {
  return {
    id: record["id"],
    counterKind: record["counterKind"],
    counter: record["counter"],
    boundary: record["boundary"],
    maximum: record["maximum"],
    inputEvidence: record["inputEvidence"],
    expected: record["expected"],
  };
}

function expandIdentifierRecipe(
  value: unknown,
  path: string,
  findings: V0ContractFinding[],
): string | null {
  if (!isObject(value) || !Array.isArray(value["segments"]) || !value["segments"].every(isObject)) {
    finding(findings, "V0_IDENTIFIER_BOUNDARY", path, "Identifier recipe requires an ordered segments array.");
    return null;
  }
  let expanded = "";
  for (const [index, segment] of value["segments"].entries()) {
    const text = segment["text"];
    const repeat = segment["repeat"];
    if (typeof text !== "string" || !Number.isSafeInteger(repeat) || Number(repeat) < 1) {
      finding(findings, "V0_IDENTIFIER_BOUNDARY", `${path}.segments[${String(index)}]`, "Each recipe segment requires text and a positive integer repeat count.");
      return null;
    }
    const nextUtf16Length = expanded.length + text.length * Number(repeat);
    if (nextUtf16Length > 4096) {
      finding(findings, "V0_IDENTIFIER_BOUNDARY", `${path}.segments[${String(index)}]`, "Reviewed boundary recipes may not expand beyond 4,096 UTF-16 code units.");
      return null;
    }
    expanded += text.repeat(Number(repeat));
  }
  return expanded;
}

function independentlyMeasuredIdentifierOutcome(value: string): JsonObject {
  const measuredCodePoints = Array.from(value).length;
  const measuredUtf8Bytes = new TextEncoder().encode(value).byteLength;
  const firstViolation = measuredCodePoints < 1
    ? "minimum-code-points"
    : measuredCodePoints > 256
      ? "maximum-code-points"
      : measuredUtf8Bytes > 512
        ? "maximum-utf8-bytes"
        : null;
  const valid = firstViolation === null;
  return {
    valid,
    measuredCodePoints,
    measuredUtf8Bytes,
    firstViolation,
    quartalContextDisposition: valid ? "accept-id-shape" : "evidence-id-invalid",
    candidateEvidenceMayBeEmitted: valid,
  };
}

function validateLimitCases(root: JsonObject, findings: V0ContractFinding[]): JsonObject[] {
  requireExact(root["caseSetId"], "changes.voicing-limit-cases", "V0_LIMIT_IDENTITY", "limit-cases.json.caseSetId", "Limit case-set ID drifted.", findings);
  requireExact(root["caseSetVersion"], 1, "V0_LIMIT_IDENTITY", "limit-cases.json.caseSetVersion", "Limit case-set version drifted.", findings);
  const identity = isObject(root["identity"]) ? root["identity"] : {};
  requireExact(identity["refusalCode"], "limit.voicing_work_exceeded", "V0_LIMIT_IDENTITY", "limit-cases.json.identity.refusalCode", "Limit refusal code drifted.", findings);
  requireExact(identity["refusalPath"], [], "V0_LIMIT_IDENTITY", "limit-cases.json.identity.refusalPath", "Limit refusal path must be empty.", findings);
  requireExact(identity["refusalTermination"], "work-limit-exceeded", "V0_LIMIT_IDENTITY", "limit-cases.json.identity.refusalTermination", "Limit termination drifted.", findings);
  const counterOrder = isObject(root["counterOrder"]) ? root["counterOrder"] : {};
  requireExact(counterOrder["work"], Object.keys(WORK_LIMITS), "V0_LIMIT_ORDER", "limit-cases.json.counterOrder.work", "Work-counter order drifted.", findings);
  requireExact(counterOrder["memory"], Object.keys(MEMORY_LIMITS), "V0_LIMIT_ORDER", "limit-cases.json.counterOrder.memory", "Memory-counter order drifted.", findings);
  const limits = isObject(root["limits"]) ? root["limits"] : {};
  requireExact(limits["work"], WORK_LIMITS, "V0_LIMIT_VALUES", "limit-cases.json.limits.work", "Work limits drifted.", findings);
  requireExact(limits["memory"], MEMORY_LIMITS, "V0_LIMIT_VALUES", "limit-cases.json.limits.memory", "Memory limits drifted.", findings);
  const limitPolicy = isObject(root["limitPolicy"]) ? root["limitPolicy"] : {};
  requireExact(
    limitPolicy["constraintObservationQualification"],
    "Exact semantic duplicates collapse before capacity. Only a prospective seventeenth distinct full-payload observation attempts constraintObservationsProduced value 17.",
    "V0_CONSTRAINT_OBSERVATION_POLICY",
    "limit-cases.json.limitPolicy.constraintObservationQualification",
    "Constraint observation capacity must count only distinct full payloads.",
    findings,
  );
  requireExact(
    limitPolicy["constraintObservationOverflow"],
    "Observation overflow is provisional while no legal candidate has been found: diagnostic collection stops but musical search continues. The first legal candidate clears and disables the provisional overflow. Only a completed zero-candidate search returns the typed all-or-nothing work-limit refusal.",
    "V0_CONSTRAINT_OBSERVATION_POLICY",
    "limit-cases.json.limitPolicy.constraintObservationOverflow",
    "Limit metadata must freeze provisional observation overflow and its all-or-nothing finalization.",
    findings,
  );
  requireExact(root["identifierPolicy"], IDENTIFIER_POLICY, "V0_IDENTIFIER_POLICY", "limit-cases.json.identifierPolicy", "Identifier surfaces, inclusive bounds, metric laws, or violation order drifted.", findings);
  const expectedCases: JsonObject[] = [];
  Object.entries(WORK_LIMITS).forEach(([counter, maximum], index) => {
    expectedCases.push(expectedCounterBoundaryCase("work", counter, maximum, index + 1, "exact-limit"));
    expectedCases.push(expectedCounterBoundaryCase("work", counter, maximum, index + 1, "attempted-limit-plus-one"));
  });
  Object.entries(MEMORY_LIMITS).forEach(([counter, maximum], index) => {
    expectedCases.push(expectedCounterBoundaryCase("memory", counter, maximum, index + 1, "exact-limit"));
    expectedCases.push(expectedCounterBoundaryCase("memory", counter, maximum, index + 1, "attempted-limit-plus-one"));
  });
  const counterCases = objectArray(root["counterBoundaryCases"]);
  requireUniqueIds(counterCases, "limit-cases.json.counterBoundaryCases", findings);
  if (counterCases.length !== 48) {
    finding(findings, "V0_LIMIT_BOUNDARY", "limit-cases.json.counterBoundaryCases", "Every one of 24 counters requires exact and true attempted-plus-one cases.");
  }
  counterCases.forEach((record, index) => {
    const expected = expectedCases[index];
    if (expected !== undefined) {
      requireExact(normativeCounterBoundaryRecord(record), expected, "V0_LIMIT_BOUNDARY", `limit-cases.json.counterBoundaryCases[${String(index)}]`, "Counter exact/+1 normative boundary projection drifted.", findings);
    }
  });

  const retention = objectArray(root["retentionCases"]);
  requireUniqueIds(retention, "limit-cases.json.retentionCases", findings);
  requireExact(retention.map((record) => record["id"]), [
    "V0-RETENTION-001-EXACT-24",
    "V0-RETENTION-002-ELIGIBLE-25-TRUNCATED",
    "V0-RETENTION-003-RAW-EXACT-96",
    "V0-RETENTION-004-RAW-ATTEMPT-97",
  ], "V0_LIMIT_RETENTION", "limit-cases.json.retentionCases", "Retention case inventory/order drifted.", findings);
  const retained24Value = retention[0]?.["expected"];
  const retained24 = isObject(retained24Value) ? retained24Value : {};
  requireExact({ count: retained24["retainedCandidateCount"], produced: retained24["retainedCandidatesProduced"], first: retained24["retainedOrderedIndexFirst"], last: retained24["retainedOrderedIndexLast"], refusal: retained24["workLimitRefusal"] }, { count: 24, produced: 24, first: 0, last: 23, refusal: null }, "V0_LIMIT_RETENTION", "limit-cases.json.retentionCases[0].expected", "Exact retained-24 law drifted.", findings);
  const truncated25Value = retention[1]?.["expected"];
  const truncated25 = isObject(truncated25Value) ? truncated25Value : {};
  requireExact({ count: truncated25["retainedCandidateCount"], produced: truncated25["retainedCandidatesProduced"], indexes: truncated25["truncatedOrderedIndexes"], attempted: truncated25["attemptedRetainedCounterValue"], refusal: truncated25["workLimitRefusal"] }, { count: 24, produced: 24, indexes: [24], attempted: false, refusal: null }, "V0_LIMIT_RETENTION", "limit-cases.json.retentionCases[1].expected", "The 25th eligible candidate must truncate without a retained-allocation attempt.", findings);
  const raw96Value = retention[2]?.["expected"];
  const raw96 = isObject(raw96Value) ? raw96Value : {};
  requireExact({ produced: raw96["rawCandidatesProduced"], retainedMaximum: raw96["retainedCandidateCountMaximum"], refusal: raw96["workLimitRefusal"] }, { produced: 96, retainedMaximum: 24, refusal: null }, "V0_LIMIT_RETENTION", "limit-cases.json.retentionCases[2].expected", "Raw 96 must be inclusive.", findings);
  const raw97Value = retention[3]?.["expected"];
  const raw97 = isObject(raw97Value) ? raw97Value : {};
  requireExact(raw97["refusal"], { code: "limit.voicing_work_exceeded", path: [], counter: "rawCandidatesProduced", received: 97, maximum: 96, partialResult: false }, "V0_LIMIT_RETENTION", "limit-cases.json.retentionCases[3].expected.refusal", "Attempted raw candidate 97 must refuse all-or-nothing.", findings);
  requireExact(raw97["valuePresent"], false, "V0_LIMIT_RETENTION", "limit-cases.json.retentionCases[3].expected.valuePresent", "Raw 97 may not return a partial value.", findings);

  const identifierCases = objectArray(root["identifierBoundaryCases"]);
  requireUniqueIds(identifierCases, "limit-cases.json.identifierBoundaryCases", findings);
  requireExact(identifierCases.map((record) => record["id"]), IDENTIFIER_BOUNDARY_CASES.map((record) => record.id), "V0_IDENTIFIER_BOUNDARY", "limit-cases.json.identifierBoundaryCases", "Identifier boundary IDs/order must cover empty/one, 256/257 code points, and 512/513 UTF-8 bytes.", findings);
  if (identifierCases.length !== 6) {
    finding(findings, "V0_IDENTIFIER_BOUNDARY", "limit-cases.json.identifierBoundaryCases", "Exactly six identifier boundary cases are required.");
  }
  identifierCases.forEach((record, index) => {
    const path = `limit-cases.json.identifierBoundaryCases[${String(index)}]`;
    const exactRecord = IDENTIFIER_BOUNDARY_CASES[index];
    if (exactRecord !== undefined) {
      requireExact(record, exactRecord, "V0_IDENTIFIER_BOUNDARY", path, "Identifier recipe, expected outcome, or reciprocal metadata drifted.", findings);
    }
    const expanded = expandIdentifierRecipe(record["recipe"], `${path}.recipe`, findings);
    if (expanded !== null) {
      requireExact(record["expected"], independentlyMeasuredIdentifierOutcome(expanded), "V0_IDENTIFIER_BOUNDARY", `${path}.expected`, "Stored identifier outcome does not match independent Array.from/TextEncoder measurement.", findings);
    }
  });

  const midiCases = objectArray(root["midiBoundaryCases"]);
  requireExact(midiCases, [
    { id: "V0-MIDI-BOUNDARY-001-INCLUSIVE-MINIMUM", kind: "inherited-domain-boundary-fact", received: 0, expected: { ok: true, value: 0 } },
    { id: "V0-MIDI-BOUNDARY-002-INCLUSIVE-MAXIMUM", kind: "inherited-domain-boundary-fact", received: 127, expected: { ok: true, value: 127 } },
    { id: "V0-MIDI-BOUNDARY-003-BELOW-MINIMUM", kind: "inherited-domain-boundary-fact", received: -1, expected: { ok: false, refusal: { code: "pitch.midi_out_of_range", path: ["midi"], received: -1, minimum: 0, maximum: 127 } } },
    { id: "V0-MIDI-BOUNDARY-004-ABOVE-MAXIMUM", kind: "inherited-domain-boundary-fact", received: 128, expected: { ok: false, refusal: { code: "pitch.midi_out_of_range", path: ["midi"], received: 128, minimum: 0, maximum: 127 } } },
  ], "V0_LIMIT_MIDI", "limit-cases.json.midiBoundaryCases", "Inherited MIDI exact/near-miss boundaries drifted.", findings);
  const wallCases = objectArray(root["wallTimeCases"]);
  if (wallCases.length !== 1) {
    finding(findings, "V0_LIMIT_WALL_TIME", "limit-cases.json.wallTimeCases", "Exactly one explicit no-wall-time-cutoff case is required.");
  }
  const wallExpectedValue = wallCases[0]?.["expected"];
  const wallExpected = isObject(wallExpectedValue) ? wallExpectedValue : {};
  requireExact(wallExpected, {
    wallTimeMayChangeCandidateMembership: false,
    wallTimeMayChangeCandidateOrder: false,
    wallTimeMayChangeRefusal: false,
    wallTimeMayChangeTermination: false,
    performanceMeasurementMayBeReportedExternally: true,
  }, "V0_LIMIT_WALL_TIME", "limit-cases.json.wallTimeCases[0].expected", "Wall time must remain performance evidence only.", findings);
  requireExact(root["wallTimePolicy"], {
    appliesAsInput: false,
    cutoffMilliseconds: null,
    changesMembershipOrOrder: false,
    changesRefusalOrTermination: false,
    performanceEvidenceOnly: true,
  }, "V0_LIMIT_WALL_TIME", "limit-cases.json.wallTimePolicy", "Wall-time policy drifted.", findings);

  requireExact(root["counts"], {
    workCounters: 16, memoryCounters: 8, counters: 24,
    workCounterBoundaryCases: 32, memoryCounterBoundaryCases: 16,
    counterBoundaryCases: 48,
    byBoundary: { "exact-limit": 24, "attempted-limit-plus-one": 24 },
    retentionCases: 4, identifierBoundaryCases: 6, midiBoundaryCases: 4,
    wallTimeCases: 1,
    totalCases: 63,
  }, "V0_LIMIT_COUNTS", "limit-cases.json.counts", "Limit inventory counts drifted.", findings);
  const checksums = isObject(root["checksums"]) ? root["checksums"] : {};
  requireChecksum(checksums["counterBoundarySha256"], projectionDigest(counterCases.map((record) => [record["id"], record["counterKind"], record["counter"], record["boundary"], record["maximum"], record["inputEvidence"], record["expected"]])), "limit-cases.json.checksums.counterBoundarySha256", findings);
  requireChecksum(checksums["retentionSha256"], projectionDigest(retention.map((record) => [record["id"], record["kind"], record["inputEvidence"], record["expected"]])), "limit-cases.json.checksums.retentionSha256", findings);
  requireExact(checksums["identifierBoundaryProjection"], "[id,kind,appliesTo,recipe,expected,traceIds,authorityIds]", "V0_IDENTIFIER_CHECKSUM", "limit-cases.json.checksums.identifierBoundaryProjection", "Identifier checksum projection drifted.", findings);
  requireChecksum(checksums["identifierBoundarySha256"], projectionDigest(identifierCases.map((record) => [record["id"], record["kind"], record["appliesTo"], record["recipe"], record["expected"], record["traceIds"], record["authorityIds"]])), "limit-cases.json.checksums.identifierBoundarySha256", findings);
  requireChecksum(checksums["midiBoundarySha256"], projectionDigest(midiCases.map((record) => [record["id"], record["kind"], record["received"], record["expected"]])), "limit-cases.json.checksums.midiBoundarySha256", findings);
  requireChecksum(checksums["wallTimeSha256"], projectionDigest(wallCases.map((record) => [record["id"], record["kind"], record["inputEvidence"], record["expected"]])), "limit-cases.json.checksums.wallTimeSha256", findings);
  requireChecksum(checksums["fixturePayloadSha256"], fixturePayloadDigest(root), "limit-cases.json.checksums.fixturePayloadSha256", findings);
  return [...counterCases, ...retention, ...identifierCases, ...midiCases, ...wallCases];
}

function validateOperationStates(
  root: JsonObject,
  candidateIds: ReadonlySet<string>,
  matrixIds: ReadonlySet<string>,
  limitIds: ReadonlySet<string>,
  findings: V0ContractFinding[],
): JsonObject[] {
  requireExact(root["caseSetId"], "changes.voicing-operation-state-cases", "V0_OPERATION_IDENTITY", "operation-state-cases.json.caseSetId", "Operation case-set ID drifted.", findings);
  requireExact(root["caseSetVersion"], 1, "V0_OPERATION_IDENTITY", "operation-state-cases.json.caseSetVersion", "Operation case-set version drifted.", findings);
  const provenance = isObject(root["provenance"]) ? root["provenance"] : {};
  requireExact(provenance["authoringMethod"], "independent direct transcription plus a standalone contract-law enumerator for the two bounded constraint-observation traversal witnesses", "V0_INDEPENDENT_ORACLE", "operation-state-cases.json.provenance.authoringMethod", "Operation provenance must disclose the standalone arithmetic oracle.", findings);
  requireExact(provenance["generatedByProductionAlgorithm"], false, "V0_INDEPENDENT_ORACLE", "operation-state-cases.json.provenance.generatedByProductionAlgorithm", "Production generation may not certify this fixture.", findings);
  requireExact(provenance["productionContractModuleImported"], false, "V0_INDEPENDENT_ORACLE", "operation-state-cases.json.provenance.productionContractModuleImported", "The fixture oracle may not import the production contract module.", findings);
  requireExact(provenance["productionAlgorithmExecuted"], false, "V0_INDEPENDENT_ORACLE", "operation-state-cases.json.provenance.productionAlgorithmExecuted", "The fixture oracle may not execute the production operation.", findings);
  requireExact(provenance["copiedFromProductionOutput"], false, "V0_INDEPENDENT_ORACLE", "operation-state-cases.json.provenance.copiedFromProductionOutput", "Expected values may not be copied from production output.", findings);
  requireExact(provenance["independentObservationSearchOracle"], {
    id: "changes.v0-constraint-observation-oracle",
    version: 1,
    implementation: "scripts/validate-v0-contract.ts",
    importsProductionModules: false,
    executesProductionOperation: false,
    derivation: "Enumerate literal Cmaj7 degree MIDI placements, slot-major DFS states, the three applicable rejected-assignment laws, full-payload insertion/deduplication, provisional distinct-17 overflow, and the first hard-valid Open assignment directly from frozen contract arithmetic.",
  }, "V0_INDEPENDENT_ORACLE", "operation-state-cases.json.provenance.independentObservationSearchOracle", "Independent oracle provenance drifted.", findings);

  const lateLegalOracle = independentlyEnumerateCmaj7ObservationSearch({
    family: "open",
    rootPitchClass: 0,
    lowMidi: 29,
    highMidi: 59,
    bassPolicy: "generated",
    externalBassPitchClass: null,
  });
  const noResultOverflowOracle = independentlyEnumerateCmaj7ObservationSearch({
    family: "balanced",
    rootPitchClass: 0,
    lowMidi: 24,
    highMidi: 95,
    bassPolicy: "external",
    externalBassPitchClass: 4,
  });
  requireExact({
    candidateMidiValues: lateLegalOracle.candidateMidiValues,
    legalCandidateCount: lateLegalOracle.legalCandidateCount,
    overflowOccurred: lateLegalOracle.provisionalObservationOverflowOccurred,
    overflowCleared: lateLegalOracle.provisionalObservationOverflowCleared,
    prospectiveOverflowAssignment: lateLegalOracle.prospectiveOverflowAssignment,
    evidence: lateLegalOracle.evidence,
  }, {
    candidateMidiValues: [[36, 43, 52, 59]],
    legalCandidateCount: 1,
    overflowOccurred: true,
    overflowCleared: true,
    prospectiveOverflowAssignment: 14,
    evidence: {
      realizationDegreeRecordsVisited: 4,
      templateRowsVisited: 61,
      templateDegreeSlotsVisited: 4,
      registerPlacementsVisited: 10,
      searchStatesExpanded: 55,
      structuralTransformsAttempted: 36,
      hardConstraintChecks: 576,
      rawCandidatesProduced: 1,
      candidateCanonicalizations: 1,
      duplicateCandidateComparisons: 0,
      localScoresComputed: 1,
      orderingComparisons: 0,
      retainedCandidatesProduced: 1,
      outputVoicesProduced: 4,
      constraintObservationComparisons: 110,
      constraintObservationsProduced: 16,
      peakRegisterPlacementRecords: 10,
      peakSearchStateRecords: 5,
      peakRawCandidateRecords: 1,
      peakRawVoiceRecords: 4,
      peakRetainedCandidateRecords: 1,
      peakOutputVoiceRecords: 4,
      peakTrackedRecords: 147,
      peakConstraintObservationRecords: 16,
      termination: "complete-generated",
    },
  }, "V0_INDEPENDENT_ORACLE", "$oracle.lateLegal", "Standalone traversal arithmetic for the late-legal witness drifted.", findings);
  requireExact({
    legalCandidateCount: noResultOverflowOracle.legalCandidateCount,
    overflowOccurred: noResultOverflowOracle.provisionalObservationOverflowOccurred,
    overflowCleared: noResultOverflowOracle.provisionalObservationOverflowCleared,
    prospectiveOverflowAssignment: noResultOverflowOracle.prospectiveOverflowAssignment,
    distinctExternalBassObservationPayloads:
      noResultOverflowOracle.distinctExternalBassObservationPayloads,
    externalBassPayloadsByMidi:
      noResultOverflowOracle.externalBassPayloadsByMidi,
    evidence: noResultOverflowOracle.evidence,
  }, {
    legalCandidateCount: 0,
    overflowOccurred: true,
    overflowCleared: false,
    prospectiveOverflowAssignment: 19,
    distinctExternalBassObservationPayloads: 21,
    externalBassPayloadsByMidi: [
      { midi: 28, voiceOrdinals: [0, 1] },
      { midi: 40, voiceOrdinals: [0, 1, 2, 3] },
      { midi: 52, voiceOrdinals: [0, 1, 2, 3] },
      { midi: 64, voiceOrdinals: [0, 1, 2, 3] },
      { midi: 76, voiceOrdinals: [0, 1, 2, 3] },
      { midi: 88, voiceOrdinals: [1, 2, 3] },
    ],
    evidence: {
      realizationDegreeRecordsVisited: 4,
      templateRowsVisited: 57,
      templateDegreeSlotsVisited: 4,
      registerPlacementsVisited: 24,
      searchStatesExpanded: 1555,
      structuralTransformsAttempted: 1296,
      hardConstraintChecks: 20736,
      rawCandidatesProduced: 0,
      candidateCanonicalizations: 0,
      duplicateCandidateComparisons: 0,
      localScoresComputed: 0,
      orderingComparisons: 0,
      retainedCandidatesProduced: 0,
      outputVoicesProduced: 0,
      constraintObservationComparisons: 163,
      constraintObservationsProduced: 16,
      peakRegisterPlacementRecords: 24,
      peakSearchStateRecords: 5,
      peakRawCandidateRecords: 0,
      peakRawVoiceRecords: 0,
      peakRetainedCandidateRecords: 0,
      peakOutputVoiceRecords: 0,
      peakTrackedRecords: 161,
      peakConstraintObservationRecords: 16,
      termination: "work-limit-exceeded",
    },
  }, "V0_INDEPENDENT_ORACLE", "$oracle.noResultOverflow", "Standalone traversal arithmetic for the completed no-result witness drifted.", findings);
  const identity = isObject(root["identity"]) ? root["identity"] : {};
  requireExact(identity, {
    operation: "realizeVoicing",
    contractSchema: "changes.theory.voicing-candidates-contract.v1",
    requestSchema: "changes.theory.voicing-request.v1",
    resultSchema: "changes.theory.voicing-result.v1",
    engineId: "changes.voicing-candidates",
    engineVersion: 1,
    templateTableId: "changes.voicing-family-templates",
    templateTableVersion: 1,
    quartalContextSchema: "changes.theory.quartal-context.v1",
    quartalContextPolicyId: "changes.quartal-context-gate",
    quartalContextPolicyVersion: 1,
  }, "V0_OPERATION_IDENTITY", "operation-state-cases.json.identity", "Operation identities drifted.", findings);
  const statePolicy = isObject(root["statePolicy"]) ? root["statePolicy"] : {};
  requireExact(statePolicy["execution"], "one pure synchronous function call", "V0_OPERATION_STATE", "operation-state-cases.json.statePolicy.execution", "V0 must remain one synchronous call.", findings);
  requireExact(statePolicy["successKinds"], ["generated", "stored-bypass"], "V0_OPERATION_STATE", "operation-state-cases.json.statePolicy.successKinds", "Success kind closure drifted.", findings);
  requireExact(statePolicy["statesThatDoNotExist"], ["queued", "running", "canceled", "resumed", "stale", "degraded", "partially-committed"], "V0_OPERATION_STATE", "operation-state-cases.json.statePolicy.statesThatDoNotExist", "V0 may not invent async/application states.", findings);
  for (const [key, expected] of Object.entries({ retryCount: 0, retryScheduled: false, fallbackApplied: false, partialSuccessAllowed: false, partialFailureValueAllowed: false, wallTimeSemanticInput: false, firstIndependentlyDiscoverableRefusalWins: true })) {
    requireExact(statePolicy[key], expected, "V0_OPERATION_STATE", `operation-state-cases.json.statePolicy.${key}`, "Synchronous all-or-nothing state law drifted.", findings);
  }
  requireExact(
    statePolicy["constraintObservationOverflowQualification"],
    "Before any legal candidate, a prospective seventeenth distinct full-payload observation is provisional: diagnostic collection stops while musical search continues. The first legal candidate clears and disables it; only a completed zero-candidate search returns the typed work-limit refusal.",
    "V0_CONSTRAINT_OBSERVATION_POLICY",
    "operation-state-cases.json.statePolicy.constraintObservationOverflowQualification",
    "Operation metadata must freeze provisional observation-overflow cancellation and completed-zero-result finalization.",
    findings,
  );
  const orders = isObject(root["orders"]) ? root["orders"] : {};
  requireExact(orders["refusalCodes"], REFUSAL_CODES, "V0_OPERATION_PRECEDENCE", "operation-state-cases.json.orders.refusalCodes", "Refusal order drifted.", findings);
  requireExact(orders["quartalContextInvalidReasons"], QUARTAL_INVALID_REASONS, "V0_OPERATION_PRECEDENCE", "operation-state-cases.json.orders.quartalContextInvalidReasons", "Quartal invalid order drifted.", findings);
  requireExact(orders["constraintCodes"], CONSTRAINT_CODES, "V0_OPERATION_PRECEDENCE", "operation-state-cases.json.orders.constraintCodes", "Constraint report order drifted.", findings);
  requireExact(orders["constraintObservationTieBreaks"], [
    "voiceOrdinals-lexicographic", "exactDegrees-lexicographic",
    "midiValues-lexicographic", "reason-precedence",
  ], "V0_CONSTRAINT_OBSERVATION_POLICY", "operation-state-cases.json.orders.constraintObservationTieBreaks", "Constraint observation tie-break order drifted.", findings);
  requireExact(root["terminationByOutcome"], { "generated-success": "complete-generated", "stored-bypass-success": "complete-bypass", ...TERMINATION_BY_REFUSAL }, "V0_OPERATION_TERMINATION", "operation-state-cases.json.terminationByOutcome", "Outcome/termination coupling drifted.", findings);
  const zeroWorkEvidence = {
    ...Object.fromEntries(Object.keys(WORK_LIMITS).map((key) => [key, 0])),
    ...Object.fromEntries(Object.keys(MEMORY_LIMITS).map((key) => [key, 0])),
    termination: "complete-bypass",
  };
  requireExact(root["zeroWorkEvidence"], zeroWorkEvidence, "V0_OPERATION_BYPASS", "operation-state-cases.json.zeroWorkEvidence", "Stored bypass requires all 24 literal zeros.", findings);
  requireExact(root["forbiddenRequestAndAmbientInputs"], ["previous", "next", "eventId", "documentRevision", "voiceIds", "wallTimeBudget", "uiSelection", "audioState", "storageIdentity"], "V0_OPERATION_BOUNDARY", "operation-state-cases.json.forbiddenRequestAndAmbientInputs", "Ambient/V1 input closure drifted.", findings);

  const success = objectArray(root["successCases"]);
  const refusals = objectArray(root["refusalCases"]);
  const precedence = objectArray(root["precedenceCases"]);
  const notApplicable = objectArray(root["notApplicableCases"]);
  requireUniqueIds(success, "operation-state-cases.json.successCases", findings);
  requireUniqueIds(refusals, "operation-state-cases.json.refusalCases", findings);
  requireUniqueIds(precedence, "operation-state-cases.json.precedenceCases", findings);
  requireUniqueIds(notApplicable, "operation-state-cases.json.notApplicableCases", findings);
  requireExact(success.map((record) => record["id"]), ["V0-OP-SUCCESS-001", "V0-OP-SUCCESS-002", "V0-OP-SUCCESS-003", "V0-OP-SUCCESS-004"], "V0_OPERATION_INVENTORY", "operation-state-cases.json.successCases", "Generated/Manual/Frozen/provisional-clear success inventory drifted.", findings);
  success.forEach((record, index) => {
    const path = `operation-state-cases.json.successCases[${String(index)}]`;
    const inputCaseId = record["inputCaseId"];
    if (typeof inputCaseId !== "string" || !candidateIds.has(inputCaseId)) {
      finding(findings, "V0_OPERATION_LINK", `${path}.inputCaseId`, "Success must link a real candidate case.");
    }
    const expected = isObject(record["expected"]) ? record["expected"] : {};
    for (const [key, value] of Object.entries({ ok: true, valuePresent: true, refusalPresent: false, retryScheduled: false, fallbackApplied: false, partialResult: false })) {
      requireExact(expected[key], value, "V0_OPERATION_SUCCESS", `${path}.expected.${key}`, "Success state field drifted.", findings);
    }
    const route = record["route"];
    requireExact(expected["evidenceTermination"], route === "auto-generated" ? "complete-generated" : "complete-bypass", "V0_OPERATION_TERMINATION", `${path}.expected.evidenceTermination`, "Success termination does not match route.", findings);
    if (route !== "auto-generated") {
      requireExact(expected["candidateGenerationPerformed"], false, "V0_OPERATION_BYPASS", `${path}.expected.candidateGenerationPerformed`, "Stored route must bypass generation.", findings);
      requireExact(expected["rawCandidateCount"], 0, "V0_OPERATION_BYPASS", `${path}.expected.rawCandidateCount`, "Stored route has zero raw candidates.", findings);
      requireExact(expected["retainedCandidateCount"], 0, "V0_OPERATION_BYPASS", `${path}.expected.retainedCandidateCount`, "Stored route has zero retained candidates.", findings);
      requireExact(expected["allNumericCountersZero"], true, "V0_OPERATION_BYPASS", `${path}.expected.allNumericCountersZero`, "Stored route has literal zero work.", findings);
    }
  });
  const lateLegalSuccess = success.find((record) => record["id"] === "V0-OP-SUCCESS-004");
  const lateLegalExpected = isObject(lateLegalSuccess?.["expected"])
    ? lateLegalSuccess["expected"]
    : {};
  requireExact({
    route: lateLegalSuccess?.["route"],
    inputCaseId: lateLegalSuccess?.["inputCaseId"],
    requestProjection: lateLegalSuccess?.["requestProjection"],
    candidateCount: lateLegalExpected["candidateCount"],
    candidateMidiValues: lateLegalExpected["candidateMidiValues"],
    provisionalObservationOverflowOccurred: lateLegalExpected["provisionalObservationOverflowOccurred"],
    provisionalObservationOverflowCleared: lateLegalExpected["provisionalObservationOverflowCleared"],
    evidence: lateLegalExpected["evidence"],
  }, {
    route: "auto-generated",
    inputCaseId: "V0-CAND-003",
    requestProjection: {
      kind: "auto", sourceSymbol: "Cmaj7", realizationId: "literal",
      family: "open", voiceCount: 4, bassPolicy: "generated",
      range: { lowMidi: 29, highMidi: 59 }, quartalContext: null,
    },
    candidateCount: lateLegalOracle.legalCandidateCount,
    candidateMidiValues: lateLegalOracle.candidateMidiValues,
    provisionalObservationOverflowOccurred:
      lateLegalOracle.provisionalObservationOverflowOccurred,
    provisionalObservationOverflowCleared:
      lateLegalOracle.provisionalObservationOverflowCleared,
    evidence: lateLegalOracle.evidence,
  }, "V0_CONSTRAINT_OBSERVATION_PROVISIONAL_CLEAR", "operation-state-cases.json.successCases[V0-OP-SUCCESS-004]", "Late-legal proof must clear provisional observation overflow and preserve exact deterministic evidence.", findings);

  requireExact(refusals.map((record) => record["id"]), Array.from({ length: 16 }, (_, index) => `V0-OP-REFUSAL-${String(index + 1).padStart(3, "0")}`), "V0_OPERATION_INVENTORY", "operation-state-cases.json.refusalCases", "Refusal case inventory/order drifted.", findings);
  requireExact(refusals.find((record) => record["id"] === "V0-OP-REFUSAL-007"), IDENTIFIER_REFUSAL_OPERATION_CASE, "V0_OPERATION_IDENTIFIER_REFUSAL", "operation-state-cases.json.refusalCases[V0-OP-REFUSAL-007]", "Identifier refusal wording, bounds, outcome, trace coverage, or authority coverage drifted.", findings);
  const refusalCodeCounts: Record<string, number> = {};
  const quartalReasons: string[] = [];
  refusals.forEach((record, index) => {
    const path = `operation-state-cases.json.refusalCases[${String(index)}]`;
    const expected = isObject(record["expected"]) ? record["expected"] : {};
    const refusal = isObject(expected["refusal"]) ? expected["refusal"] : {};
    const code = refusal["code"];
    if (typeof code !== "string" || !(REFUSAL_CODES as readonly string[]).includes(code)) {
      finding(findings, "V0_OPERATION_REFUSAL", `${path}.expected.refusal.code`, "Operation refusal code is outside V0 closure.");
    } else {
      increment(refusalCodeCounts, code);
      const evidence = isObject(expected["evidence"]) ? expected["evidence"] : {};
      requireExact(evidence["termination"], TERMINATION_BY_REFUSAL[code], "V0_OPERATION_TERMINATION", `${path}.expected.evidence.termination`, "Refusal termination does not match its code.", findings);
    }
    for (const [key, value] of Object.entries({ ok: false, valuePresent: false, partialValuePresent: false, retryScheduled: false, fallbackApplied: false })) {
      requireExact(expected[key], value, "V0_OPERATION_REFUSAL", `${path}.expected.${key}`, "Refusal must be all-or-nothing without retry/fallback.", findings);
    }
    if (code === "voicing.quartal_context_invalid" && typeof refusal["reason"] === "string") quartalReasons.push(refusal["reason"]);
    const inputCaseId = record["inputCaseId"];
    if (inputCaseId !== undefined && (typeof inputCaseId !== "string" || !candidateIds.has(inputCaseId))) {
      finding(findings, "V0_OPERATION_LINK", `${path}.inputCaseId`, "Refusal candidate link does not exist.");
    }
    const matrixCaseId = record["matrixCaseId"];
    if (matrixCaseId !== undefined && (typeof matrixCaseId !== "string" || !matrixIds.has(matrixCaseId))) {
      finding(findings, "V0_OPERATION_LINK", `${path}.matrixCaseId`, "Refusal matrix link does not exist.");
    }
    const limitCaseId = record["limitCaseId"];
    if (limitCaseId !== undefined && (typeof limitCaseId !== "string" || !limitIds.has(limitCaseId))) {
      finding(findings, "V0_OPERATION_LINK", `${path}.limitCaseId`, "Refusal limit link does not exist.");
    }
  });
  const assembledRefusal = refusals.find((record) => record["id"] === "V0-OP-REFUSAL-014");
  const assembledTrigger = isObject(assembledRefusal?.["trigger"])
    ? assembledRefusal["trigger"]
    : {};
  const submittedObservations = objectArray(assembledTrigger["submittedObservations"]);
  const uniqueObservationByPayload = new Map<string, JsonObject>();
  for (const observation of submittedObservations) {
    const key = stableJson(observation);
    if (!uniqueObservationByPayload.has(key)) uniqueObservationByPayload.set(key, observation);
  }
  const independentlyOrderedObservations = [...uniqueObservationByPayload.values()]
    .sort(compareFixtureConstraintObservations);
  const reasonOnlyGroups = new Map<string, Set<string>>();
  for (const observation of uniqueObservationByPayload.values()) {
    const reason = observation["reason"];
    if (typeof reason !== "string") continue;
    const payloadWithoutReason = { ...observation };
    delete payloadWithoutReason["reason"];
    const key = stableJson(payloadWithoutReason);
    const reasons = reasonOnlyGroups.get(key) ?? new Set<string>();
    reasons.add(reason);
    reasonOnlyGroups.set(key, reasons);
  }
  const independentlyOrderedReasonOnlyGroups = [...reasonOnlyGroups.values()]
    .filter((reasons) => reasons.size > 1)
    .map((reasons) => [...reasons].sort(
      (left, right) =>
        (CONSTRAINT_REASONS as readonly string[]).indexOf(left) -
        (CONSTRAINT_REASONS as readonly string[]).indexOf(right),
    ));
  const assembledExpected = isObject(assembledRefusal?.["expected"])
    ? assembledRefusal["expected"]
    : {};
  const assembledRefusalPayload = isObject(assembledExpected["refusal"])
    ? assembledExpected["refusal"]
    : {};
  requireExact({
    submittedCount: submittedObservations.length,
    declaredSubmittedCount: assembledTrigger["observationCount"],
    distinctCount: uniqueObservationByPayload.size,
    declaredDistinctCount: assembledTrigger["distinctFullPayloadCount"],
    duplicateCount: submittedObservations.length - uniqueObservationByPayload.size,
    declaredDuplicateCount: assembledTrigger["exactDuplicateCount"],
    orderedConstraints: assembledRefusalPayload["constraints"],
    independentlyOrderedObservations,
    exactDuplicateCollapsedBeforeCapacity: assembledExpected["exactDuplicateCollapsedBeforeCapacity"],
    sameCodeDistinctPayloadsRetained: assembledExpected["sameCodeDistinctPayloadsRetained"],
    declaredReasonOnlyDistinctPayloadCount:
      assembledTrigger["reasonOnlyDistinctPayloadCount"],
    independentlyOrderedReasonOnlyGroups,
    reasonOnlyDistinctPayloadsRetained:
      assembledExpected["reasonOnlyDistinctPayloadsRetained"],
    reasonPrecedenceApplied: assembledExpected["reasonPrecedenceApplied"],
  }, {
    submittedCount: 10,
    declaredSubmittedCount: 10,
    distinctCount: 9,
    declaredDistinctCount: 9,
    duplicateCount: 1,
    declaredDuplicateCount: 1,
    orderedConstraints: independentlyOrderedObservations,
    independentlyOrderedObservations,
    exactDuplicateCollapsedBeforeCapacity: true,
    sameCodeDistinctPayloadsRetained: true,
    declaredReasonOnlyDistinctPayloadCount: 2,
    independentlyOrderedReasonOnlyGroups: [[
      "family-transform-invalid",
      "no-legal-register-placement",
    ]],
    reasonOnlyDistinctPayloadsRetained: true,
    reasonPrecedenceApplied: true,
  }, "V0_CONSTRAINT_OBSERVATION_SEMANTICS", "operation-state-cases.json.refusalCases[V0-OP-REFUSAL-014]", "Synthetic observations must deduplicate by the full payload, preserve same-code and reason-only distinctions, and use the frozen total order including reason precedence.", findings);
  const overflowRefusal = refusals.find((record) => record["id"] === "V0-OP-REFUSAL-016");
  const overflowTrigger = isObject(overflowRefusal?.["trigger"])
    ? overflowRefusal["trigger"]
    : {};
  const overflowExpected = isObject(overflowRefusal?.["expected"])
    ? overflowRefusal["expected"]
    : {};
  requireExact({
    limitCaseId: overflowRefusal?.["limitCaseId"],
    trigger: overflowTrigger,
    expected: overflowExpected,
  }, {
    limitCaseId: "V0-LIMIT-WORK-016-PLUS-ONE",
    trigger: {
      kind: "real-exhaustive-no-result-observation-overflow",
      sourceSymbol: "Cmaj7/E",
      realizationId: "literal",
      family: "balanced",
      voiceCount: 4,
      bassPolicy: "external",
      range: { lowMidi: 24, highMidi: 95 },
      quartalContext: null,
      prospectiveDistinctObservationCount: 17,
      retainedObservationCount: 16,
    },
    expected: {
      ok: false,
      valuePresent: false,
      partialValuePresent: false,
      retryScheduled: false,
      fallbackApplied: false,
      diagnosticCollectionStoppedAtProspectiveDistinctObservation: 17,
      musicalSearchContinuedToCompletion: true,
      legalCandidateCount: noResultOverflowOracle.legalCandidateCount,
      evidence: noResultOverflowOracle.evidence,
      refusal: {
        code: "limit.voicing_work_exceeded", path: [],
        counter: "constraintObservationsProduced",
        received: 17, maximum: 16, partialResult: false,
      },
    },
  }, "V0_CONSTRAINT_OBSERVATION_OVERFLOW", "operation-state-cases.json.refusalCases[V0-OP-REFUSAL-016]", "The real Cmaj7/E zero-result witness must preserve exact typed overflow and full-search evidence.", findings);
  requireExact(sortedCountObject(refusalCodeCounts), {
    "limit.voicing_work_exceeded": 2,
    "voicing.constraints_unsatisfied": 1,
    "voicing.family_unavailable": 2,
    "voicing.quartal_context_invalid": 8,
    "voicing.quartal_context_required": 1,
    "voicing.quartal_context_unexpected": 1,
    "voicing.realization_unavailable": 1,
  }, "V0_OPERATION_INVENTORY", "operation-state-cases.json.refusalCases", "Every refusal code and all Quartal invalid reasons require exact coverage.", findings);
  requireExact(quartalReasons, QUARTAL_INVALID_REASONS, "V0_OPERATION_INVENTORY", "operation-state-cases.json.refusalCases", "The eight Quartal invalid reason cases must follow validation order.", findings);

  const precedenceWinners = [
    "voicing.realization_unavailable", "voicing.quartal_context_unexpected",
    "voicing.quartal_context_required", "voicing.quartal_context_invalid",
    "voicing.family_unavailable", "voicing.constraints_unsatisfied",
    "limit.voicing_work_exceeded",
  ];
  requireExact(precedence.map((record) => record["id"]), Array.from({ length: 7 }, (_, index) => `V0-OP-PRECEDENCE-${String(index + 1).padStart(3, "0")}`), "V0_OPERATION_PRECEDENCE", "operation-state-cases.json.precedenceCases", "Precedence inventory/order drifted.", findings);
  precedence.forEach((record, index) => {
    const path = `operation-state-cases.json.precedenceCases[${String(index)}]`;
    const expected = isObject(record["expected"]) ? record["expected"] : {};
    const winner = precedenceWinners[index];
    requireExact(expected["winningCode"], winner, "V0_OPERATION_PRECEDENCE", `${path}.expected.winningCode`, "Precedence winner drifted.", findings);
    if (winner !== undefined) requireExact(expected["termination"], TERMINATION_BY_REFUSAL[winner], "V0_OPERATION_PRECEDENCE", `${path}.expected.termination`, "Precedence termination drifted.", findings);
    for (const [key, value] of Object.entries({ retryScheduled: false, fallbackApplied: false, partialValuePresent: false })) {
      requireExact(expected[key], value, "V0_OPERATION_PRECEDENCE", `${path}.expected.${key}`, "Precedence outcomes remain all-or-nothing.", findings);
    }
    if (!stringArray(record["contenders"]).includes(String(winner))) {
      finding(findings, "V0_OPERATION_PRECEDENCE", `${path}.contenders`, "Winning code must be one of the independently discoverable contenders.");
    }
  });

  const applicabilityOwners: Readonly<Record<string, string>> = {
    cancellation: "progression-level resumable search/application runner",
    staleRevision: "application request/revision boundary",
    browser: "UI/E2E packages",
    audio: "playback-plan and audio packages",
    storage: "persistence package",
  };
  requireExact(notApplicable.map((record) => record["concern"]), Object.keys(applicabilityOwners), "V0_OPERATION_APPLICABILITY", "operation-state-cases.json.notApplicableCases", "Not-applicable concern closure drifted.", findings);
  notApplicable.forEach((record, index) => {
    const path = `operation-state-cases.json.notApplicableCases[${String(index)}]`;
    const concern = typeof record["concern"] === "string" ? record["concern"] : "";
    const expected = isObject(record["expected"]) ? record["expected"] : {};
    requireExact(expected, {
      applies: false, requestFieldPresent: false, ambientStateRead: false,
      v0StateCreated: false, terminationAdded: false, refusalAdded: false,
      owner: applicabilityOwners[concern],
    }, "V0_OPERATION_APPLICABILITY", `${path}.expected`, "Application/browser/audio/storage state must remain outside V0.", findings);
  });

  const expectedCounts = {
    successCases: success.length,
    generatedSuccessCases: success.filter((record) => record["route"] === "auto-generated").length,
    storedBypassCases: success.filter((record) => typeof record["route"] === "string" && record["route"].includes("bypass")).length,
    manualBypassCases: success.filter((record) => record["route"] === "stored-manual-bypass").length,
    frozenBypassCases: success.filter((record) => record["route"] === "stored-frozen-bypass").length,
    refusalCases: refusals.length,
    refusalCodes: Object.keys(refusalCodeCounts).length,
    refusalCasesByCode: sortedCountObject(refusalCodeCounts),
    quartalContextInvalidReasonCases: quartalReasons.length,
    familyUnavailableCases: refusalCodeCounts["voicing.family_unavailable"] ?? 0,
    multiConstraintCases: refusals.filter((record) => {
      const expected = isObject(record["expected"]) ? record["expected"] : {};
      const refusal = isObject(expected["refusal"]) ? expected["refusal"] : {};
      return objectArray(refusal["constraints"]).length > 1;
    }).length,
    workLimitNoPartialCases: refusalCodeCounts["limit.voicing_work_exceeded"] ?? 0,
    runtimeDefensiveUnsafeCallerCases: refusals.filter((record) => record["callSurface"] === "runtime-defensive-unsafe-caller").length,
    typedSemanticRefusalCases: refusals.filter((record) => record["callSurface"] !== "runtime-defensive-unsafe-caller").length,
    precedenceCases: precedence.length,
    notApplicableCases: notApplicable.length,
    totalCaseRecords: success.length + refusals.length + precedence.length + notApplicable.length,
  };
  requireExact(root["counts"], expectedCounts, "V0_OPERATION_COUNTS", "operation-state-cases.json.counts", "Operation-state inventory counts drifted.", findings);
  const checksums = isObject(root["checksums"]) ? root["checksums"] : {};
  requireChecksum(checksums["successSha256"], projectionDigest(success.map((record) => [record["id"], record["route"], record["expected"], record["traceIds"], record["authorityIds"]])), "operation-state-cases.json.checksums.successSha256", findings);
  requireChecksum(checksums["refusalSha256"], projectionDigest(refusals.map((record) => [record["id"], record["callSurface"], record["trigger"], record["expected"], record["traceIds"], record["authorityIds"]])), "operation-state-cases.json.checksums.refusalSha256", findings);
  requireChecksum(checksums["precedenceSha256"], projectionDigest(precedence.map((record) => [record["id"], record["contenders"], record["discoveryFacts"], record["expected"], record["traceIds"], record["authorityIds"]])), "operation-state-cases.json.checksums.precedenceSha256", findings);
  requireChecksum(checksums["applicabilitySha256"], projectionDigest(notApplicable.map((record) => [record["id"], record["concern"], record["expected"], record["traceIds"], record["authorityIds"]])), "operation-state-cases.json.checksums.applicabilitySha256", findings);
  requireChecksum(checksums["fixturePayloadSha256"], fixturePayloadDigest(root), "operation-state-cases.json.checksums.fixturePayloadSha256", findings);
  return [...success, ...refusals, ...precedence, ...notApplicable];
}

function validateTranspositionSeeds(
  root: JsonObject,
  candidateCases: readonly JsonObject[],
  operationCaseIds: ReadonlySet<string>,
  templateIds: ReadonlySet<string>,
  findings: V0ContractFinding[],
): JsonObject[] {
  const expectedRoots = [
    ["C", "C", 0, 0], ["Db", "D", -1, 1], ["D", "D", 0, 2],
    ["Eb", "E", -1, 3], ["E", "E", 0, 4], ["F", "F", 0, 5],
    ["F#", "F", 1, 6], ["G", "G", 0, 7], ["Ab", "A", -1, 8],
    ["A", "A", 0, 9], ["Bb", "B", -1, 10], ["B", "B", 0, 11],
  ].map(([symbol, step, alter, pitchClass], index) => ({
    id: `V0-ROOT-${String(index + 1).padStart(3, "0")}`,
    symbol,
    step,
    alter,
    pitchClass,
  }));
  const roots = objectArray(root["roots"]);
  requireExact(roots, expectedRoots, "V0_TRANSPOSITION_ROOTS", "transposition-seeds.json.roots", "The 12 spelling-aware roots must be exact and ordered.", findings);
  const observationTranspositionOracles = expectedRoots.map(({ pitchClass }) => {
    const rootPitchClass = Number(pitchClass);
    return independentlyEnumerateCmaj7ObservationSearch({
      family: "balanced",
      rootPitchClass,
      lowMidi: 24 + rootPitchClass,
      highMidi: 95 + rootPitchClass,
      bassPolicy: "external",
      externalBassPitchClass: positiveModulo12(rootPitchClass + 4),
    });
  });
  const observationTranspositionComparisonProof = expectedRoots.map(
    ({ id, symbol }, index) => ({
      rootId: id,
      rootSymbol: symbol,
      comparisons: Number(
        observationTranspositionOracles[index]?.evidence["constraintObservationComparisons"],
      ),
    }),
  );
  requireExact({
    comparisons: observationTranspositionComparisonProof.map(
      ({ comparisons }) => comparisons,
    ),
    comparisonAggregate: observationTranspositionComparisonProof.reduce(
      (sum, { comparisons }) => sum + comparisons,
      0,
    ),
    prospectiveOverflowAssignments: observationTranspositionOracles.map(
      ({ prospectiveOverflowAssignment }) => prospectiveOverflowAssignment,
    ),
    invariantEvidence: observationTranspositionOracles.map(({ evidence }) => ({
      searchStatesExpanded: evidence["searchStatesExpanded"],
      structuralTransformsAttempted: evidence["structuralTransformsAttempted"],
      hardConstraintChecks: evidence["hardConstraintChecks"],
      constraintObservationsProduced: evidence["constraintObservationsProduced"],
      peakConstraintObservationRecords:
        evidence["peakConstraintObservationRecords"],
      peakTrackedRecords: evidence["peakTrackedRecords"],
      termination: evidence["termination"],
    })),
  }, {
    comparisons: [163, 178, 178, 178, 178, 186, 186, 186, 189, 189, 189, 189],
    comparisonAggregate: 2189,
    prospectiveOverflowAssignments: [19, 20, 20, 20, 20, 21, 21, 21, 22, 22, 22, 22],
    invariantEvidence: Array.from({ length: 12 }, () => ({
      searchStatesExpanded: 1555,
      structuralTransformsAttempted: 1296,
      hardConstraintChecks: 20736,
      constraintObservationsProduced: 16,
      peakConstraintObservationRecords: 16,
      peakTrackedRecords: 161,
      termination: "work-limit-exceeded",
    })),
  }, "V0_INDEPENDENT_ORACLE", "$oracle.transposition", "Standalone all-root traversal arithmetic or absolute-register comparison work drifted.", findings);
  const seeds = objectArray(root["seeds"]);
  requireUniqueIds(seeds, "transposition-seeds.json.seeds", findings);
  requireExact(seeds.map((record) => record["id"]), Array.from({ length: 18 }, (_, index) => `V0-TRANS-${String(index + 1).padStart(3, "0")}`), "V0_TRANSPOSITION_INVENTORY", "transposition-seeds.json.seeds", "Transposition seed IDs/order drifted.", findings);
  const expectedWeaveTransposition = {
    id: "V0-TRANS-017",
    sourceCaseId: "V0-CAND-001",
    sourceSymbol: "Cmaj7",
    realizationId: "literal",
    family: "balanced",
    templateId: "balanced-adaptive-v1",
    registerPolicyId: "balanced-register-v1",
    slotOrderPolicy: "selected-degree-register-weave-v1",
    selectedDegreeOrder: ["1", "3", "5", "7"],
    orderedDegrees: ["1", "5", "7", "3"],
    relativeMidiFromLowest: [0, 7, 11, 16],
    proofRange: { lowMidi: 60, highMidi: 84, transposeWithRoot: true },
    expected: {
      rootCells: 12,
      rawCandidateCount: 9,
      retainedCandidateCount: 9,
      rawGenerationOrdinal: 4,
      retainedOrdinal: 7,
      templateOrderDisplacement: 4,
      cyclicPrefilterPermitted: false,
    },
    bass: { policy: "generated", spelling: null },
    traceIds: ["V0-TRACE-TRANSPOSITION", "V0-TRACE-ORDERING", "V0-TRACE-FAMILIES"],
    authorityIds: ["V0-AUTH-T1", "V0-AUTH-TEMPLATES", "V0-AUTH-INDEPENDENCE"],
  };
  const expectedAdaptiveSlotTransposition = {
    id: "V0-TRANS-010",
    sourceCaseId: "V0-CAND-012",
    sourceSymbol: "C7alt",
    realizationId: "alt-b9-b5",
    family: "balanced",
    templateId: "balanced-adaptive-v1",
    orderedDegrees: ["1", "3", "b5", "b7", "b9"],
    relativeMidiFromLowest: [0, 4, 6, 10, 13],
    insufficientSlotRefusalProof: {
      sourceCaseId: "V0-CAND-033",
      rootCells: 12,
      voiceCount: 3,
      mandatoryDegreeOrder: ["1", "3", "b5", "b7", "b9"],
      reasons: ["required-degree-omitted", "guide-tone-omitted"],
      omittedRequiredDegrees: ["b7", "b9"],
      omittedGuideToneDegrees: ["b7"],
      voiceCountReasonPresent: false,
    },
    bass: { policy: "generated", spelling: null },
    traceIds: ["V0-TRACE-TRANSPOSITION", "V0-TRACE-ALT-SELECTION", "V0-TRACE-DEGREES", "V0-TRACE-FAMILIES", "V0-TRACE-REFUSAL"],
    authorityIds: ["V0-AUTH-T1", "V0-AUTH-TEMPLATES", "V0-AUTH-CONTRACT", "V0-AUTH-INDEPENDENCE"],
  };
  const expectedConstraintObservationTransposition = {
    id: "V0-TRANS-018",
    sourceOperationCaseId: "V0-OP-REFUSAL-016",
    sourceSymbol: "Cmaj7/E",
    realizationId: "literal",
    family: "balanced",
    templateId: "balanced-adaptive-v1",
    selectedDegreeOrder: ["1", "3", "5", "7"],
    orderedDegrees: ["1", "3", "5", "7"],
    relativeMidiFromLowest: [0, 4, 7, 11],
    proofRange: { lowMidi: 24, highMidi: 95, transposeWithRoot: true },
    bass: {
      policy: "external",
      spelling: { step: "E", alter: 0 },
      transposeWithRoot: true,
    },
    observationOverflowProof: {
      rootCells: 12,
      completeSearchNoLegalCandidate: true,
      observationCode: "voicing.constraint.external_bass_excluded",
      observationReason: "external-bass-present",
      observationDegree: "3",
      payloadProjection: "[voiceOrdinals,degrees,midiValues] with one exact major-third voice per payload",
      sourcePayloadsByExternalBassMidi:
        observationTranspositionOracles[0]?.externalBassPayloadsByMidi,
      distinctExternalBassObservationPayloads:
        observationTranspositionOracles[0]?.distinctExternalBassObservationPayloads,
      constraintObservationLimit: 16,
      provisionalOverflowClearedByLegalCandidate: false,
      expectedRefusal: {
        code: "limit.voicing_work_exceeded",
        path: [],
        counter: "constraintObservationsProduced",
        received: 17,
        maximum: 16,
        partialResult: false,
      },
      sourceCellEvidence: {
        rootId: "V0-ROOT-001",
        rootSymbol: "C",
        constraintObservationComparisons:
          observationTranspositionOracles[0]?.evidence["constraintObservationComparisons"],
        constraintObservationsProduced:
          observationTranspositionOracles[0]?.evidence["constraintObservationsProduced"],
        peakConstraintObservationRecords:
          observationTranspositionOracles[0]?.evidence["peakConstraintObservationRecords"],
        peakTrackedRecords:
          observationTranspositionOracles[0]?.evidence["peakTrackedRecords"],
        termination:
          observationTranspositionOracles[0]?.evidence["termination"],
      },
      perRootConstraintObservationComparisons:
        observationTranspositionComparisonProof,
      allRootInvariants: {
        constraintObservationsProduced:
          observationTranspositionOracles[0]?.evidence["constraintObservationsProduced"],
        peakConstraintObservationRecords:
          observationTranspositionOracles[0]?.evidence["peakConstraintObservationRecords"],
        peakTrackedRecords:
          observationTranspositionOracles[0]?.evidence["peakTrackedRecords"],
        termination:
          observationTranspositionOracles[0]?.evidence["termination"],
      },
    },
    traceIds: [
      "V0-TRACE-TRANSPOSITION", "V0-TRACE-BASS", "V0-TRACE-REFUSAL",
      "V0-TRACE-ORDERING", "V0-TRACE-LIMITS",
    ],
    authorityIds: [
      "V0-AUTH-F1", "V0-AUTH-T1", "V0-AUTH-CONTRACT",
      "V0-AUTH-LIMITS", "V0-AUTH-INDEPENDENCE",
    ],
  };
  const weaveTransposition = seeds.find((record) => record["id"] === "V0-TRANS-017");
  const adaptiveSlotTransposition = seeds.find((record) => record["id"] === "V0-TRANS-010");
  const constraintObservationTransposition = seeds.find((record) => record["id"] === "V0-TRANS-018");
  const withoutSourceOracle = (value: JsonObject | undefined): JsonObject | undefined => {
    if (value === undefined) return undefined;
    const result = { ...value };
    delete result["sourceOracle"];
    return result;
  };
  requireExact(withoutSourceOracle(weaveTransposition), expectedWeaveTransposition, "V0_REGISTER_WEAVE", "transposition-seeds.json.seeds[V0-TRANS-017]", "The spelling-aware selected-degree register-weave transposition seed drifted.", findings);
  requireExact(withoutSourceOracle(adaptiveSlotTransposition), expectedAdaptiveSlotTransposition, "V0_ADAPTIVE_SLOT_DIAGNOSTICS", "transposition-seeds.json.seeds[V0-TRANS-010]", "The spelling-aware adaptive insufficient-slot proof drifted.", findings);
  requireExact(withoutSourceOracle(constraintObservationTransposition), expectedConstraintObservationTransposition, "V0_CONSTRAINT_OBSERVATION_TRANSPOSITION", "transposition-seeds.json.seeds[V0-TRANS-018]", "The all-root observation-overflow proof drifted.", findings);
  const transpositionChecksums = isObject(root["checksums"]) ? root["checksums"] : {};
  requireChecksum(
    transpositionChecksums["selectedDegreeRegisterWeaveTranspositionSha256"],
    projectionDigest([[weaveTransposition]]),
    "transposition-seeds.json.checksums.selectedDegreeRegisterWeaveTranspositionSha256",
    findings,
  );
  requireChecksum(
    transpositionChecksums["constraintObservationOverflowTranspositionSha256"],
    projectionDigest([[constraintObservationTransposition]]),
    "transposition-seeds.json.checksums.constraintObservationOverflowTranspositionSha256",
    findings,
  );
  requireChecksum(
    transpositionChecksums["adaptiveInsufficientSlotsTranspositionSha256"],
    projectionDigest([[adaptiveSlotTransposition]]),
    "transposition-seeds.json.checksums.adaptiveInsufficientSlotsTranspositionSha256",
    findings,
  );
  requireChecksum(
    transpositionChecksums["sourceOracleSha256"],
    projectionDigest(seeds.map((seed) => [seed["id"], seed["sourceOracle"]])),
    "transposition-seeds.json.checksums.sourceOracleSha256",
    findings,
  );
  const candidateById = new Map<string, JsonObject>();
  for (const record of candidateCases) {
    if (typeof record["id"] === "string") candidateById.set(record["id"], record);
  }
  const generatedInverseScope = [
    "candidate.spelling", "candidate.octave", "candidate.degree",
    "candidate.sourceDegreeIndex", "candidate.provenance", "request.root",
    "request.realizationId", "request.policy", "request.range",
    "request.quartalContext", "request.effectiveBass",
  ];
  const storedInverseScope = [
    "stored.spelling", "stored.octave", "stored.order", "stored.duplicates",
    "stored.bassPolicy", "stored.objectIdentity",
  ];
  const refusalInverseScope = [
    "request.root", "request.realizationId", "request.policy", "request.range",
    "request.quartalContext", "request.effectiveBass", "refusal", "termination",
  ];
  const generatedFallbackSourceCases: Readonly<Record<string, string>> = {
    "V0-TRANS-003": "V0-CAND-006",
    "V0-TRANS-006": "V0-CAND-002",
    "V0-TRANS-011": "V0-CAND-012",
    "V0-TRANS-012": "V0-CAND-012",
    "V0-TRANS-013": "V0-CAND-012",
  };
  const expectedSourceDegreeIndices: Readonly<Record<string, readonly (number | null)[]>> = {
    "V0-TRANS-001": [1, 3, 4, 2],
    "V0-TRANS-002": [3, 4, 1, 6],
    "V0-TRANS-003": [1, 3, 4, 2],
    "V0-TRANS-004": [3, 4, 1, 5],
    "V0-TRANS-005": [0, 1, 2, 3],
    "V0-TRANS-006": [0, 1, 3],
    "V0-TRANS-007": [1, 3, 4, 6],
    "V0-TRANS-008": [0, 2, 3, 1],
    "V0-TRANS-009": [null, 0, 1, 3],
    "V0-TRANS-010": [0, 1, 2, 3, 4],
    "V0-TRANS-011": [0, 1, 2, 3, 4],
    "V0-TRANS-012": [0, 1, 2, 3, 4],
    "V0-TRANS-013": [0, 1, 2, 3, 4],
    "V0-TRANS-014": [3, 1, 6, 4],
    "V0-TRANS-015": [3, 1, 6, 4],
    "V0-TRANS-017": [0, 2, 3, 1],
  };
  const spellingSteps = ["C", "D", "E", "F", "G", "A", "B"] as const;
  seeds.forEach((record, index) => {
    const path = `transposition-seeds.json.seeds[${String(index)}]`;
    const seedId = typeof record["id"] === "string" ? record["id"] : "";
    const orderedDegrees = Array.isArray(record["orderedDegrees"]) ? record["orderedDegrees"] : [];
    const relativeMidi = Array.isArray(record["relativeMidiFromLowest"]) ? record["relativeMidiFromLowest"] : [];
    if (orderedDegrees.length === 0 || orderedDegrees.length !== relativeMidi.length || relativeMidi.some((value) => typeof value !== "number" || !Number.isInteger(value))) {
      finding(findings, "V0_TRANSPOSITION_SHAPE", path, "Each seed requires aligned ordered degrees and integer relative MIDI.");
    }
    const sourceOracle = isObject(record["sourceOracle"])
      ? record["sourceOracle"]
      : {};
    const applicability = sourceOracle["applicability"];
    const expectedApplicability = seedId === "V0-TRANS-016"
      ? "stored-bypass"
      : seedId === "V0-TRANS-018"
        ? "refusal"
        : "generated-candidate";
    requireExact(applicability, expectedApplicability, "V0_TRANSPOSITION_SOURCE_ORACLE", `${path}.sourceOracle.applicability`, "Every transposition seed must declare its exact source-oracle applicability.", findings);
    requireExact(sourceOracle["v0TranspositionApplied"], false, "V0_TRANSPOSITION_SOURCE_ORACLE", `${path}.sourceOracle.v0TranspositionApplied`, "V0 does not own the caller-side transposition used by this proof.", findings);
    const expectedTermination = expectedApplicability === "generated-candidate"
      ? "complete-generated"
      : expectedApplicability === "stored-bypass"
        ? "complete-bypass"
        : "work-limit-exceeded";
    requireExact(sourceOracle["expectedTermination"], expectedTermination, "V0_TRANSPOSITION_SOURCE_TERMINATION", `${path}.sourceOracle.expectedTermination`, "Source-oracle applicability must declare the exact V0 termination.", findings);

    if (expectedApplicability === "stored-bypass") {
      requireExact(Object.keys(sourceOracle).sort(codeUnitCompare), [
        "applicability", "expectedTermination", "inverseScope", "requestProjection",
        "storedPitches", "v0TranspositionApplied",
      ], "V0_TRANSPOSITION_SOURCE_ORACLE", `${path}.sourceOracle`, "Stored-bypass oracle fields drifted.", findings);
      requireExact(sourceOracle["inverseScope"], storedInverseScope, "V0_TRANSPOSITION_INVERSE_SCOPE", `${path}.sourceOracle.inverseScope`, "Stored inverse proof must cover caller-owned pitches, duplicates, bass policy, and object identity only.", findings);
      requireExact(sourceOracle["requestProjection"], { mode: "manual", bassPolicy: "included" }, "V0_TRANSPOSITION_SOURCE_POLICY", `${path}.sourceOracle.requestProjection`, "Stored source request policy drifted.", findings);
      const storedPitches = objectArray(sourceOracle["storedPitches"]);
      requireExact(storedPitches.map((pitch) => pitch["relativeMidiFromLowest"]), relativeMidi, "V0_TRANSPOSITION_SOURCE_ALIGNMENT", `${path}.sourceOracle.storedPitches`, "Stored source pitches must align with the seed relative-MIDI oracle.", findings);
      const storedMidi = storedPitches.map((pitch, pitchIndex) => {
        const spelling = pitch["spelling"];
        const projected = midiFromSpelling(spelling);
        requireExact(pitch["midi"], projected, "V0_TRANSPOSITION_SOURCE_MIDI", `${path}.sourceOracle.storedPitches[${String(pitchIndex)}].midi`, "Stored source pitch MIDI must project independently from spelling and octave.", findings);
        return projected;
      });
      const firstStoredMidi = storedMidi[0];
      if (typeof firstStoredMidi === "number") {
        requireExact(storedMidi.map((midi) => typeof midi === "number" ? midi - firstStoredMidi : null), relativeMidi, "V0_TRANSPOSITION_SOURCE_MIDI", `${path}.sourceOracle.storedPitches`, "Stored source MIDI intervals drifted.", findings);
      }
    } else {
      const bass = isObject(record["bass"]) ? record["bass"] : {};
      const proofRange = isObject(record["proofRange"])
        ? record["proofRange"]
        : null;
      const baseCaseId = typeof record["sourceCaseId"] === "string"
        ? record["sourceCaseId"]
        : generatedFallbackSourceCases[seedId];
      const baseCase = baseCaseId === undefined ? undefined : candidateById.get(baseCaseId);
      const basePolicy = baseCase !== undefined && isObject(baseCase["policy"])
        ? baseCase["policy"]
        : {};
      const sourceRange = proofRange === null
        ? { lowMidi: basePolicy["range"] && isObject(basePolicy["range"]) ? basePolicy["range"]["lowMidi"] : null,
            highMidi: basePolicy["range"] && isObject(basePolicy["range"]) ? basePolicy["range"]["highMidi"] : null }
        : { lowMidi: proofRange["lowMidi"], highMidi: proofRange["highMidi"] };
      const sourceQuartal = baseCase !== undefined && isObject(baseCase["quartalContext"])
        ? {
            schema: "changes.theory.quartal-context.v1",
            policyId: "changes.quartal-context-gate",
            policyVersion: 1,
            evidenceKind: baseCase["quartalContext"]["evidenceKind"],
            evidenceId: baseCase["quartalContext"]["evidenceId"],
            evidenceVersion: baseCase["quartalContext"]["evidenceVersion"],
            degreeSequence: baseCase["quartalContext"]["degreeSequence"],
          }
        : null;
      const expectedRequestProjection = {
        sourceRoot: { step: "C", alter: 0 },
        realizationId: record["realizationId"],
        policy: {
          family: record["family"],
          voiceCount: orderedDegrees.length,
          bassPolicy: bass["policy"],
          range: sourceRange,
        },
        quartalContext: sourceQuartal,
        effectiveBass: bass["spelling"],
      };
      requireExact(sourceOracle["requestProjection"], expectedRequestProjection, "V0_TRANSPOSITION_SOURCE_POLICY", `${path}.sourceOracle.requestProjection`, "The independent source request oracle must align with family, count, bass, range, context, and spelling authority.", findings);

      if (expectedApplicability === "refusal") {
        requireExact(Object.keys(sourceOracle).sort(codeUnitCompare), [
          "applicability", "candidateVoicesApplicable", "expectedTermination",
          "inverseScope", "refusalProjection", "requestProjection",
          "v0TranspositionApplied",
        ], "V0_TRANSPOSITION_SOURCE_ORACLE", `${path}.sourceOracle`, "Refusal oracle fields drifted.", findings);
        requireExact(sourceOracle["inverseScope"], refusalInverseScope, "V0_TRANSPOSITION_INVERSE_SCOPE", `${path}.sourceOracle.inverseScope`, "Refusal inverse proof must cover request structure and refusal/termination, never nonexistent candidate voices.", findings);
        requireExact(sourceOracle["candidateVoicesApplicable"], false, "V0_TRANSPOSITION_SOURCE_APPLICABILITY", `${path}.sourceOracle.candidateVoicesApplicable`, "A zero-candidate refusal cannot claim a source candidate voice oracle.", findings);
        const overflow = isObject(record["observationOverflowProof"])
          ? record["observationOverflowProof"]
          : {};
        requireExact(sourceOracle["refusalProjection"], overflow["expectedRefusal"], "V0_TRANSPOSITION_SOURCE_REFUSAL", `${path}.sourceOracle.refusalProjection`, "Refusal source oracle must bind the exact checked-in typed refusal.", findings);
      } else {
        requireExact(Object.keys(sourceOracle).sort(codeUnitCompare), [
          "applicability", "expectedTermination", "inverseScope", "requestProjection",
          "v0TranspositionApplied", "voices",
        ], "V0_TRANSPOSITION_SOURCE_ORACLE", `${path}.sourceOracle`, "Generated-candidate oracle fields drifted.", findings);
        requireExact(sourceOracle["inverseScope"], generatedInverseScope, "V0_TRANSPOSITION_INVERSE_SCOPE", `${path}.sourceOracle.inverseScope`, "Generated inverse proof must restore exact candidate and request structure.", findings);
        const sourceVoices = objectArray(sourceOracle["voices"]);
        requireExact(sourceVoices.map((voice) => voice["degree"]), orderedDegrees, "V0_TRANSPOSITION_SOURCE_ALIGNMENT", `${path}.sourceOracle.voices`, "Source oracle degrees must align exactly with the seed candidate projection.", findings);
        requireExact(sourceVoices.map((voice) => voice["relativeMidiFromLowest"]), relativeMidi, "V0_TRANSPOSITION_SOURCE_ALIGNMENT", `${path}.sourceOracle.voices`, "Source oracle relative MIDI must align exactly with the seed candidate projection.", findings);
        requireExact(sourceVoices.map((voice) => voice["sourceDegreeIndex"]), expectedSourceDegreeIndices[seedId], "V0_TRANSPOSITION_SOURCE_ALIGNMENT", `${path}.sourceOracle.voices`, "Source-degree indices must align with the selected realization rather than pitch-class coincidence.", findings);
        const sourceMidi = sourceVoices.map((voice, voiceIndex) => {
          requireExact(Object.keys(voice).sort(codeUnitCompare), [
            "degree", "midi", "provenance", "relativeMidiFromLowest",
            "sourceDegreeIndex", "spelling",
          ], "V0_TRANSPOSITION_SOURCE_ORACLE", `${path}.sourceOracle.voices[${String(voiceIndex)}]`, "Source voice oracle fields drifted.", findings);
          const spelling = voice["spelling"];
          const projected = midiFromSpelling(spelling);
          requireExact(voice["midi"], projected, "V0_TRANSPOSITION_SOURCE_MIDI", `${path}.sourceOracle.voices[${String(voiceIndex)}].midi`, "Source MIDI must independently project from exact spelling and octave.", findings);
          const degree = voice["degree"];
          const expectedProvenance = degree === null ? "slash-bass" : "realization";
          requireExact(voice["provenance"], expectedProvenance, "V0_TRANSPOSITION_SOURCE_PROVENANCE", `${path}.sourceOracle.voices[${String(voiceIndex)}].provenance`, "Source voice provenance must distinguish the sole slash bass from realization members.", findings);
          const expectedIndex = expectedSourceDegreeIndices[seedId]?.[voiceIndex];
          if (degree === null) {
            requireExact(voice["sourceDegreeIndex"], null, "V0_TRANSPOSITION_SOURCE_PROVENANCE", `${path}.sourceOracle.voices[${String(voiceIndex)}].sourceDegreeIndex`, "Slash bass cannot fabricate a realization source index.", findings);
          } else {
            const parsed = parseDegreeToken(degree);
            const spellingRecord = isObject(spelling) ? spelling : {};
            if (parsed === null) {
              finding(findings, "V0_TRANSPOSITION_SOURCE_SPELLING", `${path}.sourceOracle.voices[${String(voiceIndex)}].degree`, "Generated source voice degree must be a supported exact token.");
            } else {
              const expectedStep = spellingSteps[(parsed.number - 1) % 7];
              requireExact(spellingRecord["step"], expectedStep, "V0_TRANSPOSITION_SOURCE_SPELLING", `${path}.sourceOracle.voices[${String(voiceIndex)}].spelling.step`, "Source spelling must preserve the degree's diatonic letter from C.", findings);
              requireExact(projected === null ? null : mod12(projected), mod12(Number(degreeSemitones(degree))), "V0_TRANSPOSITION_SOURCE_SPELLING", `${path}.sourceOracle.voices[${String(voiceIndex)}].spelling`, "Source spelling pitch class must match the exact degree token.", findings);
            }
            if (!Number.isInteger(expectedIndex)) {
              finding(findings, "V0_TRANSPOSITION_SOURCE_ALIGNMENT", `${path}.sourceOracle.voices[${String(voiceIndex)}].sourceDegreeIndex`, "Generated realization voice requires an exact selected-realization source index.");
            }
          }
          const lowMidi = sourceRange.lowMidi;
          const highMidi = sourceRange.highMidi;
          if (typeof projected !== "number" || typeof lowMidi !== "number" || typeof highMidi !== "number" || projected < lowMidi || projected > highMidi) {
            finding(findings, "V0_TRANSPOSITION_SOURCE_RANGE", `${path}.sourceOracle.voices[${String(voiceIndex)}].midi`, "Every source oracle voice must lie inside the exact inclusive source range.");
          }
          return projected;
        });
        const firstSourceMidi = sourceMidi[0];
        if (typeof firstSourceMidi === "number") {
          requireExact(sourceMidi.map((midi) => typeof midi === "number" ? midi - firstSourceMidi : null), relativeMidi, "V0_TRANSPOSITION_SOURCE_MIDI", `${path}.sourceOracle.voices`, "Absolute source MIDI and checked-in relative MIDI drifted apart.", findings);
        }
        if (!sourceMidi.every((midi, midiIndex) => midiIndex === 0 || typeof midi === "number" && typeof sourceMidi[midiIndex - 1] === "number" && midi > Number(sourceMidi[midiIndex - 1]))) {
          finding(findings, "V0_TRANSPOSITION_SOURCE_ORDER", `${path}.sourceOracle.voices`, "Generated source oracle voices must remain in strict sounding order.");
        }
      }
    }
    const sourceCaseId = record["sourceCaseId"];
    if (typeof sourceCaseId === "string") {
      const sourceCase = candidateById.get(sourceCaseId);
      if (sourceCase === undefined) {
        finding(findings, "V0_TRANSPOSITION_LINK", `${path}.sourceCaseId`, "Transposition source candidate does not exist.");
      } else if (record["storedMode"] === "manual") {
        const request = isObject(sourceCase["request"]) ? sourceCase["request"] : {};
        const voicing = isObject(request["voicing"]) ? request["voicing"] : {};
        const pitches = objectArray(voicing["pitches"]);
        const sourceMidi = pitches.map(midiFromSpelling);
        const first = typeof sourceMidi[0] === "number" ? sourceMidi[0] : 0;
        requireExact(relativeMidi, sourceMidi.map((midi) => typeof midi === "number" ? midi - first : null), "V0_TRANSPOSITION_ARITHMETIC", `${path}.relativeMidiFromLowest`, "Stored seed relative MIDI must project its exact caller-supplied pitches.", findings);
        requireExact(orderedDegrees, pitches.map(() => null), "V0_TRANSPOSITION_DEGREES", `${path}.orderedDegrees`, "Stored bypass has no generated degree metadata.", findings);
        requireExact(record["family"], null, "V0_TRANSPOSITION_LINK", `${path}.family`, "Stored bypass has no generation family.", findings);
      } else {
        const expected = isObject(sourceCase["expected"]) ? sourceCase["expected"] : {};
        const voices = objectArray(expected["voices"]);
        const sourceMidi = voices.map((voice) => voice["midi"]);
        const first = typeof sourceMidi[0] === "number" ? sourceMidi[0] : 0;
        const sourceRelative = sourceMidi.map((midi) => typeof midi === "number" ? midi - first : null);
        const sourceDegrees = voices.map((voice) => voice["degree"]);
        requireExact(relativeMidi, sourceRelative, "V0_TRANSPOSITION_ARITHMETIC", `${path}.relativeMidiFromLowest`, "Relative MIDI must independently project the source candidate.", findings);
        requireExact(orderedDegrees, sourceDegrees, "V0_TRANSPOSITION_DEGREES", `${path}.orderedDegrees`, "Ordered degrees must exactly project the source candidate.", findings);
        const policy = isObject(sourceCase["policy"]) ? sourceCase["policy"] : {};
        requireExact(record["family"], policy["family"], "V0_TRANSPOSITION_LINK", `${path}.family`, "Seed family must match its source candidate.", findings);
        if (record["templateId"] !== null && record["templateId"] !== undefined && typeof record["templateId"] === "string" && !templateIds.has(record["templateId"])) {
          finding(findings, "V0_TRANSPOSITION_LINK", `${path}.templateId`, "Seed template ID is not declared by V0 authority.");
        }
        const drop2 = isObject(expected["drop2"]) ? expected["drop2"] : null;
        if (drop2 !== null) {
          const closed = Array.isArray(drop2["closedSourceMidi"]) ? drop2["closedSourceMidi"] : [];
          const closedFirst = typeof closed[0] === "number" ? closed[0] : 0;
          requireExact(record["closedSourceRelativeMidi"], closed.map((midi) => typeof midi === "number" ? midi - closedFirst : null), "V0_TRANSPOSITION_DROP2", `${path}.closedSourceRelativeMidi`, "Drop-2 source-relative evidence drifted.", findings);
          requireExact(record["secondFromTopSourceOrdinal"], drop2["secondFromTopSourceOrdinal"], "V0_TRANSPOSITION_DROP2", `${path}.secondFromTopSourceOrdinal`, "Drop-2 source ordinal drifted.", findings);
          requireExact(record["loweredBySemitones"], 12, "V0_TRANSPOSITION_DROP2", `${path}.loweredBySemitones`, "Drop-2 transposition seed must retain the one-octave law.", findings);
        }
      }
    }
    const sourceOperationCaseId = record["sourceOperationCaseId"];
    if (
      sourceOperationCaseId !== undefined
      && (typeof sourceOperationCaseId !== "string" || !operationCaseIds.has(sourceOperationCaseId))
    ) {
      finding(findings, "V0_TRANSPOSITION_LINK", `${path}.sourceOperationCaseId`, "Transposition source operation case does not exist.");
    }
    if (record["storedMode"] !== "manual") {
      const firstDegree = orderedDegrees.find((degree) => typeof degree === "string");
      const firstIndex = orderedDegrees.findIndex((degree) => typeof degree === "string");
      const firstSemitones = degreeSemitones(firstDegree);
      if (firstSemitones !== null && firstIndex >= 0) {
        orderedDegrees.forEach((degree, degreeIndex) => {
          if (typeof degree !== "string" || typeof relativeMidi[degreeIndex] !== "number") return;
          const semitones = degreeSemitones(degree);
          const relative = relativeMidi[degreeIndex];
          const baseRelative = relativeMidi[firstIndex] as number;
          if (semitones === null || mod12(relative - baseRelative) !== mod12(semitones - firstSemitones)) {
            finding(findings, "V0_TRANSPOSITION_ARITHMETIC", `${path}.relativeMidiFromLowest[${String(degreeIndex)}]`, "Relative MIDI pitch class must agree with the exact degree sequence.");
          }
        });
      }
    }
    const quartal = Array.isArray(record["quartalAdjacencySemitones"])
      ? record["quartalAdjacencySemitones"]
      : null;
    if (quartal !== null) {
      const calculated = relativeMidi.slice(1).map((midi, gapIndex) => Number(midi) - Number(relativeMidi[gapIndex]));
      requireExact(quartal, calculated, "V0_TRANSPOSITION_QUARTAL", `${path}.quartalAdjacencySemitones`, "Quartal adjacency must equal relative MIDI deltas.", findings);
      if (!calculated.every((gap) => gap === 5 || gap === 6)) {
        finding(findings, "V0_TRANSPOSITION_QUARTAL", `${path}.quartalAdjacencySemitones`, "Quartal transposition seeds permit only five/six semitone adjacency.");
      }
    }
  });
  requireExact(root["matrix"], { rootCount: 12, seedCount: 18, expectedRootCells: 216, supplementalEnharmonicPairs: 2, inverseProofPerCell: true }, "V0_TRANSPOSITION_MATRIX", "transposition-seeds.json.matrix", "Transposition matrix metadata must freeze 18 x 12 with inverse proof.", findings);
  const pairs = objectArray(root["enharmonicNearMissPairs"]);
  if (pairs.length !== 2) finding(findings, "V0_TRANSPOSITION_ENHARMONIC", "transposition-seeds.json.enharmonicNearMissPairs", "Two spelling-distinct enharmonic controls are required.");
  pairs.forEach((pair, index) => {
    const left = isObject(pair["left"]) ? pair["left"] : {};
    const right = isObject(pair["right"]) ? pair["right"] : {};
    if (left["pitchClass"] !== right["pitchClass"] || (left["step"] === right["step"] && left["alter"] === right["alter"])) {
      finding(findings, "V0_TRANSPOSITION_ENHARMONIC", `transposition-seeds.json.enharmonicNearMissPairs[${String(index)}]`, "Enharmonic control must share pitch class while preserving distinct spelling.");
    }
  });
  const oracle = isObject(root["oracle"]) ? root["oracle"] : {};
  requireExact(
    oracle["sourceVoiceInvariant"],
    "Every generated-candidate seed checks in exact source spelling, octave, MIDI, relative MIDI, degree, source index, and provenance; production runtime output cannot populate these values.",
    "V0_TRANSPOSITION_SOURCE_ORACLE",
    "transposition-seeds.json.oracle.sourceVoiceInvariant",
    "The source-voice oracle must remain checked-in and independent of production output.",
    findings,
  );
  requireExact(
    oracle["applicabilityInvariant"],
    "V0-TRANS-016 owns caller-supplied stored-pitch inverse proof and V0-TRANS-018 owns request/refusal inverse proof; candidate-voice inverse proof is explicitly inapplicable to both.",
    "V0_TRANSPOSITION_SOURCE_APPLICABILITY",
    "transposition-seeds.json.oracle.applicabilityInvariant",
    "Stored and refusal inverse scope must remain explicitly disjoint from generated candidate voices.",
    findings,
  );
  requireExact(oracle["productionAlgorithmExecuted"], false, "V0_TRANSPOSITION_INDEPENDENCE", "transposition-seeds.json.oracle.productionAlgorithmExecuted", "Transposition expected values cannot execute production.", findings);
  return seeds;
}

function recordMap(records: readonly JsonObject[]): Map<string, JsonObject> {
  const result = new Map<string, JsonObject>();
  for (const record of records) {
    if (typeof record["id"] === "string") result.set(record["id"], record);
  }
  return result;
}

const V0_COMPLETE_RESULT_AUDIT_CHECK_IDS = [
  "candidate-count-nonempty-and-at-most-24",
  "every-returned-candidate-audited",
  "adjacent-comparator-order",
  "candidate-identities-unique",
  "request-family-and-realization-exact",
  "voice-count-and-pitch-alignment",
  "strict-unique-in-range-midi",
  "source-degree-index-and-spelling-membership",
  "bass-and-slash-policy",
  "identity-guide-omission-and-doubling",
  "constraint-evidence-and-explanation-consistency",
  "family-structure-evidence",
] as const;

const V0_NEGATIVE_WITNESS_EXECUTION_FIELDS = [
  "mutationExecutionMode", "productionMutantExecuted", "detectorOnlyMutantEvaluated",
] as const;
const v0ProductionSpec = (
  operation: string,
  executor: "realizeVoicing" | "candidateIdentityKey" |
    "realizeVoicingWithAmbient" | "lowRegisterSpacingViolations" |
    "executeV0OperationCase" = "realizeVoicing",
): Readonly<{ operation: string; executor: string }> => ({ operation, executor });
const v0DetectorSpec = (detector: string): Readonly<{ detector: string }> => ({ detector });
const V0_NEGATIVE_WITNESS_EXECUTION_BRANCH_SPECS = [
  { witnessId: "V0-ALT-NEAR-001", production: [], detectors: [v0DetectorSpec("altered-realization-identity-after-omission")] },
  { witnessId: "V0-BYPASS-NEAR-001", production: [v0ProductionSpec("realizeVoicing-stored-bypass")], detectors: [] },
  { witnessId: "V0-BYPASS-NEAR-002", production: [v0ProductionSpec("realizeVoicing-stored-bypass")], detectors: [] },
  { witnessId: "V0-COUNT-NEAR-001", production: [], detectors: [v0DetectorSpec("total-sounded-voice-count")] },
  { witnessId: "V0-COUNT-NEAR-002", production: [], detectors: [v0DetectorSpec("total-sounded-voice-count")] },
  { witnessId: "V0-DOUBLING-NEAR-001", production: [v0ProductionSpec("realizeVoicing-forbidden-altered-doubling")], detectors: [] },
  { witnessId: "V0-DOUBLING-NEAR-002", production: [], detectors: [v0DetectorSpec("declared-doubling-exact-one-octave")] },
  { witnessId: "V0-DROP2-NEAR-001", production: [], detectors: [v0DetectorSpec("drop2-exact-source-ordinal-and-octave")] },
  { witnessId: "V0-DROP2-NEAR-002", production: [], detectors: [v0DetectorSpec("drop2-exact-source-ordinal-and-octave")] },
  { witnessId: "V0-DROP2-NEAR-003", production: [v0ProductionSpec("realizeVoicing-drop2-range-revalidation")], detectors: [] },
  { witnessId: "V0-FALLBACK-NEAR-001", production: [v0ProductionSpec("realizeVoicing-no-fallback-refusal")], detectors: [] },
  { witnessId: "V0-GUIDE-NEAR-001", production: [v0ProductionSpec("realizeVoicing-guide-tone-omission-refusal")], detectors: [] },
  { witnessId: "V0-IDENTITY-NEAR-001", production: [v0ProductionSpec("realizeVoicing-sus2-identity-refusal")], detectors: [v0DetectorSpec("major-third-identity-presence")] },
  { witnessId: "V0-IDENTITY-NEAR-002", production: [v0ProductionSpec("candidateIdentityKey-original", "candidateIdentityKey"), v0ProductionSpec("candidateIdentityKey-semantic-mutant", "candidateIdentityKey")], detectors: [] },
  { witnessId: "V0-IMMUTABLE-NEAR-001", production: [], detectors: [v0DetectorSpec("reachable-deep-immutability")] },
  { witnessId: "V0-LOCAL-NEAR-001", production: [v0ProductionSpec("realizeVoicing-ambient-baseline"), ...Array.from({ length: 7 }, (_, index) => v0ProductionSpec(`realizeVoicing-forbidden-field-${String(index)}`)), v0ProductionSpec("realizeVoicing-hostile-ambient-clock", "realizeVoicingWithAmbient"), v0ProductionSpec("realizeVoicing-hostile-ambient-random", "realizeVoicingWithAmbient"), v0ProductionSpec("realizeVoicing-hostile-ambient-localeCompare", "realizeVoicingWithAmbient")], detectors: [] },
  { witnessId: "V0-ORDER-NEAR-001", production: [v0ProductionSpec("realizeVoicing-under-hostile-locale", "realizeVoicingWithAmbient")], detectors: [v0DetectorSpec("stable-insertion-order-under-reversed-enumeration")] },
  { witnessId: "V0-RANGE-NEAR-001", production: [v0ProductionSpec("realizeVoicing-range-boundary-lower-plus-one"), v0ProductionSpec("realizeVoicing-range-boundary-upper-minus-one")], detectors: [] },
  { witnessId: "V0-ROOTLESS-NEAR-001", production: [v0ProductionSpec("realizeVoicing-rootless-generated-bass-policy"), v0ProductionSpec("realizeVoicing-rootless-none-bass-policy")], detectors: [v0DetectorSpec("constraint-precedence-ordering")] },
  { witnessId: "V0-SLASH-NEAR-001", production: [v0ProductionSpec("realizeVoicing-unplaceable-slash-bass")], detectors: [] },
  { witnessId: "V0-SLASH-NEAR-002", production: [], detectors: [v0DetectorSpec("exact-source-slash-spelling")] },
  { witnessId: "V0-SLASH-NEAR-003", production: [v0ProductionSpec("realizeVoicing-unsupported-slash-bass-policy")], detectors: [] },
  { witnessId: "V0-SPACING-NEAR-001", production: [v0ProductionSpec("lowRegisterSpacingViolations-near-boundary", "lowRegisterSpacingViolations")], detectors: [] },
  { witnessId: "V0-SPACING-NEAR-002", production: [v0ProductionSpec("lowRegisterSpacingViolations-near-boundary", "lowRegisterSpacingViolations")], detectors: [] },
  { witnessId: "V0-SPACING-NEAR-003", production: [v0ProductionSpec("lowRegisterSpacingViolations-near-boundary", "lowRegisterSpacingViolations")], detectors: [] },
  { witnessId: "V0-SPACING-NEAR-004", production: [v0ProductionSpec("realizeVoicing-unique-midi-before-spacing")], detectors: [] },
  { witnessId: "V0-SPELL-NEAR-001", production: [v0ProductionSpec("realizeVoicing-sharp-nine"), v0ProductionSpec("realizeVoicing-flat-three")], detectors: [v0DetectorSpec("degree-and-spelling-distinction-at-equal-pitch-class")] },
  { witnessId: "V0-SPELL-NEAR-002", production: [], detectors: [v0DetectorSpec("register-lift-source-spelling")] },
  { witnessId: "V0-TRANS-NEAR-001", production: Array.from({ length: 4 }, (_, index) => v0ProductionSpec(`realizeVoicing-enharmonic-pair-${String(index)}`)), detectors: [v0DetectorSpec("enharmonic-spelling-and-inverse-distinction")] },
  { witnessId: "V0-TRANS-NEAR-002", production: [v0ProductionSpec("realizeVoicing-one-axis-mutant-range"), v0ProductionSpec("realizeVoicing-one-axis-mutant-quartal-context"), v0ProductionSpec("realizeVoicing-one-axis-mutant-slash-or-external-bass")], detectors: [] },
  { witnessId: "V0-UNISON-NEAR-001", production: [v0ProductionSpec("realizeVoicing-duplicate-midi-refusal")], detectors: [] },
  { witnessId: "V0-WEAVE-NEAR-001", production: [], detectors: [v0DetectorSpec("selected-degree-register-weave-cyclic-prefilter")] },
  { witnessId: "V0-ADAPTIVE-SLOTS-NEAR-001", production: Array.from({ length: 4 }, (_, index) => v0ProductionSpec(`realizeVoicing-adaptive-slot-boundary-${String(index)}`)), detectors: [] },
  { witnessId: "V0-CONSTRAINT-OVERFLOW-NEAR-001", production: [v0ProductionSpec("executeV0OperationCase-provisional-overflow-recovery", "executeV0OperationCase")], detectors: [] },
] as const;
const V0_NEGATIVE_WITNESS_RUNTIME_HASHES = [
  { witnessId: "V0-ALT-NEAR-001", runtimeRequestSha256: "b6d766e12d2419f2ddf9454aade9aa537d9575571a831ead7cadc0e73a50fda3", runtimeResultSha256: "2341803e4d708a7e720353c62606ac58acde5f133b78ea2433b8f4418caca32c" },
  { witnessId: "V0-BYPASS-NEAR-001", runtimeRequestSha256: "6fb5ca6d0965ebb07a279809020601ff708193dc3b8cda6a2cdd6a77243094cc", runtimeResultSha256: "bde7a7501621e032d334b3967762b69697057a49493511eccd8bf7cab557e03b" },
  { witnessId: "V0-BYPASS-NEAR-002", runtimeRequestSha256: "089effd50126c4bd592ef07fd982319132580e5849af6af934a2f946de689474", runtimeResultSha256: "c5dbac14f31b529d83f9ab95c7061a2f7c5e54285d826de6e30bebf75c238ffe" },
  { witnessId: "V0-COUNT-NEAR-001", runtimeRequestSha256: "f4be044175e76a7c2f0824de181ab71191e028efda6d6c5119b1e16590920ec5", runtimeResultSha256: "9642c16351eb214d3767bc4a3fae3583f948f724081df14425d0dd1d66f1be3e" },
  { witnessId: "V0-COUNT-NEAR-002", runtimeRequestSha256: "b8ef52daa18c776b3206e29bb22d2419ba16d768390653d8918f7fd6b2dabe40", runtimeResultSha256: "4f1370becf39415b9845944a8c85d994b62eedec5e041e646b6228581515cdc2" },
  { witnessId: "V0-DOUBLING-NEAR-001", runtimeRequestSha256: "216201eeca233c1d215002922b8f55a336621e1b6235e832992f35e9452f9fca", runtimeResultSha256: "9e2b0235826d86b92dd3bcad8b5e8d18270e2a8cfe5d3e202704e61c1d12bb3f" },
  { witnessId: "V0-DOUBLING-NEAR-002", runtimeRequestSha256: "1521f15a6acb46dac8deb12caa9a0245c1ff9825d0c76bc91dace70640bf3201", runtimeResultSha256: "c3724a20796d50d7c6088514aeb9f463fbc36acf51f489b8163dacaf3dea1d94" },
  { witnessId: "V0-DROP2-NEAR-001", runtimeRequestSha256: "4d115e2498d9dfc0b0b52817986adc839d6f5520b871d2a255e94e4b9ba5abec", runtimeResultSha256: "c540b8bc28f899cd662d09b4152372b793fd575232e48cd3a77a8d5e430095c3" },
  { witnessId: "V0-DROP2-NEAR-002", runtimeRequestSha256: "88822f6ea724b67da0f5ab26b841b4b189cafe922d88e7f3106ded7c95bccf27", runtimeResultSha256: "1b6c2de6ceac7f76e6a0cfc479cdc7785bdb2693a2220c44e8f6c1de30b0a697" },
  { witnessId: "V0-DROP2-NEAR-003", runtimeRequestSha256: "658139bb5d11652faac755ce4948565609f8c22b558dba5a9ba0c7dad755491e", runtimeResultSha256: "113ab66b5afd939a6d916adeb54ada8d7ae8fc6b003cbc234f73f8eee70f4a17" },
  { witnessId: "V0-FALLBACK-NEAR-001", runtimeRequestSha256: "ce0c1df5e59dfc9d35309607fe745e995092705ba951af54b0bc17103ab3de37", runtimeResultSha256: "04336cc70cafdad63b07b94c2ec8265acaadefa769e4b794a9e94c47c227f535" },
  { witnessId: "V0-GUIDE-NEAR-001", runtimeRequestSha256: "ed32eb17ed87c9b56f484a088a0bb9258ebc333ae2184f3524b6270ef8c4de66", runtimeResultSha256: "df8af18cac1da232a08aa008bd2333956192bc9109cb685d9bb989a9563d687f" },
  { witnessId: "V0-IDENTITY-NEAR-001", runtimeRequestSha256: "dc318899d8e22632a8dcc0583fae7bf70b151b2cc7809ac8422f1e336c50eeb4", runtimeResultSha256: "a6b7c78a49b1113a20d036f212d7501b54c0a8e4d461341a0343256ce30ba2ed" },
  { witnessId: "V0-IDENTITY-NEAR-002", runtimeRequestSha256: "bf1b9e9a3148c68d2c15962f152ac5c7344c7ad88c3e83d085824bc9d809ea48", runtimeResultSha256: "2ed3f2079bb729905fc3d7e692dda6135662fd0e94f4109fb381f99ab96eb028" },
  { witnessId: "V0-IMMUTABLE-NEAR-001", runtimeRequestSha256: "cc71e348b437aa71713c1e6ab4a078c02caaea61b99d6182fd5e5eb6fa4975b7", runtimeResultSha256: "684e01a6e8b5ce893fa76ee438cf4add15219c021c7f71b8eba6e93e43287f7a" },
  { witnessId: "V0-LOCAL-NEAR-001", runtimeRequestSha256: "8e78db520b75f9db09fdf798d9b1d4b7f164f4a17d6718fc4468cbe59b225421", runtimeResultSha256: "3a63b60c521e137fdb64eec1223adc8f835a24ccf6856d99830ff89aa620e2cc" },
  { witnessId: "V0-ORDER-NEAR-001", runtimeRequestSha256: "ad2d5006831623d79bb0b0e23e2ee363b7d3dacc3e96933801e9246ac021f718", runtimeResultSha256: "ef18d1e2048cb018c58502acfc85286da01eb61cc8a6e84cb482931b4650a243" },
  { witnessId: "V0-RANGE-NEAR-001", runtimeRequestSha256: "cfcf9991f63ae6ab40367f7b4b4befd055d673ffda352387310a18824bdcbd3e", runtimeResultSha256: "eb49ec6483bba6946d86d0ef680d5e2b9dfdc4443fd9b1139beaea573abd7cb3" },
  { witnessId: "V0-ROOTLESS-NEAR-001", runtimeRequestSha256: "ce364978dc7a735c7306dcb50dd9f47147270a7869d02b0ed9297aea334e65da", runtimeResultSha256: "a73028520e6d1fbbe2f4309d84afc3e4ef9b109658e6572baab93f242a07b05e" },
  { witnessId: "V0-SLASH-NEAR-001", runtimeRequestSha256: "cc386c68326bb2ada3dfbb0855bda80ca135b24e2ca933c94bd55376d0cbe92c", runtimeResultSha256: "50d1ba4e6cd2951afd49fcbed3ba6830152cdb6726523da27dcb648cb9d6b47f" },
  { witnessId: "V0-SLASH-NEAR-002", runtimeRequestSha256: "d6a896d0b23e1c1f80290452acfd447856e8e7fbe0348db1e94767811286ab32", runtimeResultSha256: "babb8471f7faf42639b708d08d6546feaf92bf3e61594ab267a14d18cdc35a11" },
  { witnessId: "V0-SLASH-NEAR-003", runtimeRequestSha256: "8cacdf3363c40795cc864f4f83edcfa3bfaa521fce76717818429cab20474234", runtimeResultSha256: "92493c5fea3748cde01e596b9b4a01587dc18adbfefa779b4c292294a5658689" },
  { witnessId: "V0-SPACING-NEAR-001", runtimeRequestSha256: "d850cd65fdefc0d5859d9e5bf57a7d2acf39fd7471673e088da4810680dc0112", runtimeResultSha256: "e384211136294a8a8c10e84cb335f92fdd73bf46db4437388baa3ac59b24bec8" },
  { witnessId: "V0-SPACING-NEAR-002", runtimeRequestSha256: "776cb9e6712b6a21af530a0941be27cce4d25001832144f178f1019d6acf5043", runtimeResultSha256: "8ce31c616cd6ed6e0849c0fe74a2ac131ebed29d6bb7d025ab5a66953717c4aa" },
  { witnessId: "V0-SPACING-NEAR-003", runtimeRequestSha256: "ed8766026e92f008a0ea5ad8f51cad066b3b2204ca70564b3df052cd5b065da3", runtimeResultSha256: "7d699160357854c8fa71cf6aacddf91827b452e85335896b924f8a67993955c6" },
  { witnessId: "V0-SPACING-NEAR-004", runtimeRequestSha256: "d4a9a24011c4a9b7d07d77b5e6011b8d5a5db298d91c24419cfced66546c012d", runtimeResultSha256: "eedf0003fb2db1764ca3db96ef208681cb0721809bbb76c8e20ca027827282c6" },
  { witnessId: "V0-SPELL-NEAR-001", runtimeRequestSha256: "c467be5cfdfbcd7f37c7bdb483d1486741a42b84bc4e732db3af5aa450769977", runtimeResultSha256: "b02ee4620bad80ff396a8309796808428f3aacd1347eb42a631ce8e1dce4d17a" },
  { witnessId: "V0-SPELL-NEAR-002", runtimeRequestSha256: "7b8ba6de14bb8ec535fc3d7708843d6d90d8a6c05bebc2c5c327f30ed3940b0a", runtimeResultSha256: "3757d828f8f163abc34a4d1b8b4d920f6830cf9dd9f6d5dfce23b82130d12bf5" },
  { witnessId: "V0-TRANS-NEAR-001", runtimeRequestSha256: "3cc643a9c6e7344ce7dc4a93a4d6070d7eaed7e997518417b32ffcbbcf115a2e", runtimeResultSha256: "59fd131f4cd666cc927627ee5b7da4c8fcdd5402a95d6492bc84b513a9fcaacc" },
  { witnessId: "V0-TRANS-NEAR-002", runtimeRequestSha256: "0377a9922570e6fe498619111918ffd58b2ac0edd9c20089aaed6a7d7cabf0c0", runtimeResultSha256: "8a881caad3510b88a00064264e95c24bc72ca1702a32de078a54416de2a447c3" },
  { witnessId: "V0-UNISON-NEAR-001", runtimeRequestSha256: "45bf734f7d8086f362c8d8ac896675e0ed2d8b7686e7d02fed944433b2964c37", runtimeResultSha256: "e6947bc1f0781b02afab85dc220bea67043df3420c5e8292bed2d38d6d66f7ae" },
  { witnessId: "V0-WEAVE-NEAR-001", runtimeRequestSha256: "dd9713c4da5ed7125a381db113f19318f08e04c67fdbf7dc17d08d6ce8445529", runtimeResultSha256: "d1475f0725271993bdb1c73af0423f9d4150fba425a3fd2ca0d5c07c5cf9c19c" },
  { witnessId: "V0-ADAPTIVE-SLOTS-NEAR-001", runtimeRequestSha256: "5691740ebaeee75e024fe402a31a0d81f40a322d22ebe901ad081960e897a4de", runtimeResultSha256: "77965d9b10decca56ee87e2e550da8e7b22f144959c9400f68a4cb12347bbf18" },
  { witnessId: "V0-CONSTRAINT-OVERFLOW-NEAR-001", runtimeRequestSha256: "4001d1deeb70f1e2671093c1c20b82b7be3a23bd39b7c8cd78ebb81377f6e33a", runtimeResultSha256: "d4cf02160d1d1c2af250fa5ad2d1b0f358321ebce635fd9325a3cff69bd38646" },
] as const;
const V0_NEGATIVE_WITNESS_EXECUTION_SPECS =
  V0_NEGATIVE_WITNESS_EXECUTION_BRANCH_SPECS.map((spec, index) => {
    const hashes = V0_NEGATIVE_WITNESS_RUNTIME_HASHES[index];
    if (hashes === undefined || hashes.witnessId !== spec.witnessId) {
      throw new Error("V0 negative witness runtime hash inventory is misaligned.");
    }
    return {
      ...spec,
      runtimeRequestSha256: hashes.runtimeRequestSha256,
      runtimeResultSha256: hashes.runtimeResultSha256,
    };
  });
const V0_DETECTOR_ONLY_WITNESS_IDS = [
  "V0-ALT-NEAR-001",
  "V0-COUNT-NEAR-001", "V0-COUNT-NEAR-002", "V0-DOUBLING-NEAR-002",
  "V0-DROP2-NEAR-001", "V0-DROP2-NEAR-002",
  "V0-IMMUTABLE-NEAR-001", "V0-SLASH-NEAR-002",
  "V0-SPELL-NEAR-002", "V0-WEAVE-NEAR-001",
] as const;
const V0_MIXED_EXECUTION_WITNESS_IDS = [
  "V0-IDENTITY-NEAR-001", "V0-ORDER-NEAR-001", "V0-ROOTLESS-NEAR-001",
  "V0-SPELL-NEAR-001", "V0-TRANS-NEAR-001",
] as const;
const V0_PRODUCTION_EXECUTED_WITNESS_IDS = [
  "V0-BYPASS-NEAR-001", "V0-BYPASS-NEAR-002",
  "V0-DOUBLING-NEAR-001", "V0-DROP2-NEAR-003", "V0-FALLBACK-NEAR-001",
  "V0-GUIDE-NEAR-001",
  "V0-IDENTITY-NEAR-002", "V0-LOCAL-NEAR-001",
  "V0-RANGE-NEAR-001", "V0-SLASH-NEAR-001",
  "V0-SLASH-NEAR-003", "V0-SPACING-NEAR-001", "V0-SPACING-NEAR-002",
  "V0-SPACING-NEAR-003", "V0-SPACING-NEAR-004", "V0-TRANS-NEAR-002",
  "V0-UNISON-NEAR-001", "V0-ADAPTIVE-SLOTS-NEAR-001",
  "V0-CONSTRAINT-OVERFLOW-NEAR-001",
] as const;

const V0_LAW_CHECK_IDS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  "V0-LAW-001": ["replay-V0-CAND-001", "replay-V0-CAND-004", "replay-V0-CAND-009"],
  "V0-LAW-002": ["literal-membership", "altered-membership", "altered-ids-remain-distinct"],
  "V0-LAW-003": ["identity-guides-V0-CAND-001", "identity-guides-V0-CAND-009", "identity-guides-V0-CAND-017"],
  "V0-LAW-004": ["exact-spelling-V0-CAND-008", "exact-spelling-V0-CAND-012", "exact-spelling-V0-CAND-016"],
  "V0-LAW-005": ["total-voice-count-V0-CAND-013", "total-voice-count-V0-CAND-014", "total-voice-count-V0-CAND-018"],
  "V0-LAW-006": ["generated-slash-is-exact-unique-lowest", "external-slash-is-named-not-sounded"],
  "V0-LAW-007": ["rootless-external-and-root-omitted", "rootless-a-b-distinct"],
  "V0-LAW-008": ["inclusive-range-and-unique", "production-unison-refusal"],
  "V0-LAW-009": [
    "declared-root-doubling-accepted", "guide-doubling-mutant-detected",
    "altered-doubling-mutant-detected", "characteristic-doubling-mutant-detected",
    "slash-doubling-mutant-detected", "exact-midi-duplicate-mutant-refused",
    "second-root-copy-mutant-detected", "two-octave-copy-mutant-detected",
  ],
  "V0-LAW-010": [
    "spacing-V0-SPACING-BOUNDARY-001", "spacing-V0-SPACING-BOUNDARY-002",
    "spacing-V0-SPACING-BOUNDARY-003", "spacing-V0-SPACING-BOUNDARY-004",
    "spacing-V0-SPACING-NEAR-001", "spacing-V0-SPACING-NEAR-002",
    "spacing-V0-SPACING-NEAR-003", "spacing-V0-SPACING-NEAR-004",
  ],
  "V0-LAW-011": [
    "literal-drop2-V0-CAND-004", "literal-drop2-V0-CAND-005",
    "literal-drop2-V0-CAND-034", "literal-drop2-V0-CAND-035",
    "literal-drop2-V0-CAND-038",
  ],
  "V0-LAW-012": ["quartal-context-V0-CAND-009", "quartal-context-V0-CAND-010", "quartal-context-V0-CAND-011"],
  "V0-LAW-013": ["requested-altered-id-honored", "altered-variants-not-merged"],
  "V0-LAW-014": ["manual-literal-zero-work", "frozen-literal-zero-work", "stored-near-witnesses"],
  "V0-LAW-015": ["typed-no-fallback-V0-CAND-019", "typed-no-fallback-V0-CAND-025", "typed-no-fallback-V0-CAND-029"],
  "V0-LAW-016": ["all-six-score-axes", "all-five-tie-breaks", "reverse-and-locale-independent", "identity-not-midi-only"],
  "V0-LAW-017": ["all-18-by-12-full-result-sets-and-near-misses"],
  "V0-LAW-018": ["active-deep-immutability", "shallow-freeze-control-killed"],
  "V0-LAW-019": ["all-48-counter-boundaries", "all-4-retention-boundaries", "all-6-identifier-boundaries", "all-4-midi-boundaries", "wall-time-not-semantic"],
  "V0-LAW-020": ["each-local-and-ambient-input-ignored"],
  "V0-LAW-021": ["balanced-noncyclic-selected-degree-weave", "open-production-selected-degree-weave"],
  "V0-LAW-022": ["adaptive-count-and-fit-separated"],
  "V0-LAW-023": ["complete-payload-order-and-dedup", "no-result-distinct-17-all-or-nothing", "later-legal-clears-provisional-overflow"],
});

function validateLaws(
  root: JsonObject,
  directCases: ReadonlyMap<string, JsonObject>,
  transpositionIds: ReadonlySet<string>,
  mutationIds: ReadonlySet<string>,
  findings: V0ContractFinding[],
): Readonly<{ laws: JsonObject[]; witnesses: JsonObject[] }> {
  const proof = isObject(root["lawProofPolicy"]) ? root["lawProofPolicy"] : {};
  requireExact(proof["requiredWitnesses"], ["positive", "negative-or-near-miss", "transposition", "mutation-control"], "V0_LAW_POLICY", "law-cases.json.lawProofPolicy.requiredWitnesses", "Every law requires all four independent witness categories.", findings);
  requireExact(
    proof["completeResultAuditCheckIds"],
    V0_COMPLETE_RESULT_AUDIT_CHECK_IDS,
    "V0_LAW_CHECK_INVENTORY",
    "law-cases.json.lawProofPolicy.completeResultAuditCheckIds",
    "The independently authored complete-result audit inventory drifted.",
    findings,
  );
  const negativeExecution = isObject(proof["negativeWitnessExecutionPolicy"])
    ? proof["negativeWitnessExecutionPolicy"]
    : {};
  requireExact(
    negativeExecution["projectionFields"],
    V0_NEGATIVE_WITNESS_EXECUTION_FIELDS,
    "V0_LAW_POLICY",
    "law-cases.json.lawProofPolicy.negativeWitnessExecutionPolicy.projectionFields",
    "Negative witness execution projections must use the reviewed common fields.",
    findings,
  );
  requireExact(
    negativeExecution["executionSpecs"],
    V0_NEGATIVE_WITNESS_EXECUTION_SPECS,
    "V0_LAW_POLICY",
    "law-cases.json.lawProofPolicy.negativeWitnessExecutionPolicy.executionSpecs",
    "Every negative witness must pin its exact ordered production executor and detector branches.",
    findings,
  );
  requireExact(
    negativeExecution["detectorOnlyWitnessIds"],
    V0_DETECTOR_ONLY_WITNESS_IDS,
    "V0_LAW_POLICY",
    "law-cases.json.lawProofPolicy.negativeWitnessExecutionPolicy.detectorOnlyWitnessIds",
    "Detector-only mutants must never be described as production-executed.",
    findings,
  );
  requireExact(
    negativeExecution["mixedWitnessIds"],
    V0_MIXED_EXECUTION_WITNESS_IDS,
    "V0_LAW_POLICY",
    "law-cases.json.lawProofPolicy.negativeWitnessExecutionPolicy.mixedWitnessIds",
    "Mixed witnesses must identify both production and detector-only components.",
    findings,
  );
  requireExact(
    negativeExecution["productionExecutedWitnessIds"],
    V0_PRODUCTION_EXECUTED_WITNESS_IDS,
    "V0_LAW_POLICY",
    "law-cases.json.lawProofPolicy.negativeWitnessExecutionPolicy.productionExecutedWitnessIds",
    "Production-executed witness inventory drifted.",
    findings,
  );
  const laws = objectArray(root["cases"]);
  const witnesses = objectArray(root["witnesses"]);
  requireUniqueIds(laws, "law-cases.json.cases", findings);
  requireUniqueIds(witnesses, "law-cases.json.witnesses", findings);
  requireExact(
    [
      ...V0_DETECTOR_ONLY_WITNESS_IDS,
      ...V0_MIXED_EXECUTION_WITNESS_IDS,
      ...V0_PRODUCTION_EXECUTED_WITNESS_IDS,
    ].sort(),
    witnesses.filter((record) => record["kind"] === "negative")
      .map((record) => String(record["id"])).sort(),
    "V0_LAW_POLICY",
    "law-cases.json.lawProofPolicy.negativeWitnessExecutionPolicy",
    "Every negative witness must have exactly one reviewed execution class.",
    findings,
  );
  requireExact(laws.map((record) => record["id"]), Array.from({ length: 23 }, (_, index) => `V0-LAW-${String(index + 1).padStart(3, "0")}`), "V0_LAW_INVENTORY", "law-cases.json.cases", "Law IDs/order must be V0-LAW-001 through 023.", findings);
  requireExact(
    Object.keys(V0_LAW_CHECK_IDS),
    laws.map((record) => record["id"]),
    "V0_LAW_CHECK_INVENTORY",
    "law-cases.json.cases",
    "The validator and fixture law inventories must cover the same 23 rows in order.",
    findings,
  );
  const witnessMap = recordMap(witnesses);
  const expectedWeaveWitness = {
    id: "V0-WEAVE-NEAR-001",
    kind: "negative",
    setup: {
      selectedDegreeOrder: ["1", "3", "5", "7"],
      selectedPlacementMidi: [48, 64, 55, 59],
      midiSortedDegreeOrder: ["1", "5", "7", "3"],
      openSelectedDegreeOrder: ["1", "3", "5", "7"],
      openSelectedPlacementMidi: [48, 64, 67, 59],
      openMidiSortedDegreeOrder: ["1", "7", "3", "5"],
      cyclicReferenceOrders: [
        ["1", "3", "5", "7"],
        ["1", "3", "7", "5"],
      ],
    },
    expected: {
      acceptedCandidateCaseId: "V0-CAND-001",
      rawGenerationOrdinal: 6,
      templateOrderDisplacement: 4,
      cyclicPrefilterPermitted: false,
      openAcceptedCandidateCaseId: "V0-CAND-003",
      openRawGenerationOrdinal: 9,
      openTemplateOrderDisplacement: 4,
      openCyclicPrefilterPermitted: false,
    },
  };
  const expectedWeaveLaw = {
    id: "V0-LAW-021",
    lawId: "V0-LAW-SELECTED-DEGREE-REGISTER-WEAVE",
    predicate: "Balanced and Open traverse one canonical selected-occurrence vector by deterministic slot-major ascending-MIDI DFS, MIDI-sort each complete assignment before hard validation, and never prefilter by cyclic rotation or permutation.",
    positiveCaseIds: ["V0-CAND-001", "V0-CAND-003"],
    negativeCaseIds: ["V0-WEAVE-NEAR-001"],
    transpositionSeedIds: ["V0-TRANS-017"],
    mutationControlIds: ["V0-MUT-043"],
    traceIds: ["V0-TRACE-ORDERING", "V0-TRACE-FAMILIES"],
    authorityIds: ["V0-AUTH-CONTRACT", "V0-AUTH-TEMPLATES", "V0-AUTH-INDEPENDENCE"],
    checkIds: [
      "balanced-noncyclic-selected-degree-weave",
      "open-production-selected-degree-weave",
    ],
  };
  const expectedAdaptiveSlotWitness = {
    id: "V0-ADAPTIVE-SLOTS-NEAR-001",
    kind: "negative",
    setup: {
      matrixCaseId: "V0-AVAIL-alt-b9-b5-balanced-vc3",
      templateId: "balanced-adaptive-v1",
      declaredMinimumVoiceCount: 3,
      permittedVoiceCounts: [3, 4, 5, 6, 7],
      mandatoryDegreeOrder: ["1", "3", "b5", "b7", "b9"],
      guideToneDegrees: ["3", "b7"],
      degreeBearingSlotCount: 3,
      mutatedEffectiveMinimumVoiceCount: 5,
    },
    expected: {
      primaryReason: "required-degree-omitted",
      reasons: ["required-degree-omitted", "guide-tone-omitted"],
      omittedRequiredDegrees: ["b7", "b9"],
      omittedGuideToneDegrees: ["b7"],
      voiceCountReasonPresent: false,
      boundaryControls: [
        { family: "balanced", voiceCount: 4, reasons: ["required-degree-omitted"], omittedRequiredDegrees: ["b9"] },
        { family: "balanced", voiceCount: 5, reasons: [] },
        { family: "drop2", voiceCount: 3, reasons: ["voice-count-below-template-minimum"] },
      ],
    },
  };
  const expectedAdaptiveSlotLaw = {
    id: "V0-LAW-022",
    lawId: "V0-LAW-ADAPTIVE-INSUFFICIENT-SLOTS",
    predicate: "Declared template count admissibility remains separate from selected-realization fit; a supported adaptive count reports the exact unplaceable mandatory suffix as required then guide omissions, while only a count below the declared row minimum reports voice-count-below-template-minimum.",
    positiveCaseIds: ["V0-CAND-012", "V0-CAND-033"],
    negativeCaseIds: ["V0-ADAPTIVE-SLOTS-NEAR-001"],
    transpositionSeedIds: ["V0-TRANS-010"],
    mutationControlIds: ["V0-MUT-044"],
    traceIds: ["V0-TRACE-DEGREES", "V0-TRACE-FAMILIES", "V0-TRACE-REFUSAL"],
    authorityIds: ["V0-AUTH-T1", "V0-AUTH-TEMPLATES", "V0-AUTH-CONTRACT", "V0-AUTH-INDEPENDENCE"],
    checkIds: ["adaptive-count-and-fit-separated"],
  };
  const expectedConstraintObservationWitness = {
    id: "V0-CONSTRAINT-OVERFLOW-NEAR-001",
    kind: "negative",
    setup: {
      traversal: "deterministic synthetic traversal with rejected assignments before the first hard-valid assignment",
      beforeFirstHardValidCandidate: {
        fullPayloadUniqueUnsatisfiedObservations: 17,
        retainedConstraintObservationRecords: 16,
        provisionalRefusal: {
          code: "limit.voicing_work_exceeded",
          path: [],
          counter: "constraintObservationsProduced",
          received: 17,
          maximum: 16,
          partialResult: false,
        },
      },
      laterHardValidCandidate: { present: true, rawGenerationOrdinal: 0 },
    },
    expected: {
      ok: true,
      valueKind: "generated",
      provisionalOverflowCleared: true,
      candidateMembershipAndOrderUnchanged: true,
      constraintsRefusalPresent: false,
      evidence: {
        constraintObservationsProduced: 16,
        peakConstraintObservationRecords: 16,
        comparisonProductionAndPeakWorkPreserved: true,
      },
    },
  };
  const expectedConstraintObservationLaw = {
    id: "V0-LAW-023",
    lawId: "V0-LAW-CONSTRAINT-OBSERVATION-COLLECTION",
    predicate: "Unsatisfied observations deduplicate only by their complete public payload, retain distinct repeated-code facts in code/ordinal/degree/MIDI/reason order, and use one bounded 16-record accumulator; distinct record 17 is provisional until a later hard-valid candidate clears it or a completed no-result traversal returns its typed all-or-nothing work-limit refusal.",
    positiveCaseIds: [
      "V0-OP-REFUSAL-014", "V0-LIMIT-WORK-016-EXACT",
      "V0-CONSTRAINT-OVERFLOW-NEAR-001", "V0-OP-SUCCESS-004",
    ],
    negativeCaseIds: ["V0-OP-REFUSAL-016", "V0-LIMIT-WORK-016-PLUS-ONE"],
    transpositionSeedIds: ["V0-TRANS-018"],
    mutationControlIds: ["V0-MUT-045", "V0-MUT-046", "V0-MUT-047", "V0-MUT-048", "V0-MUT-049"],
    traceIds: ["V0-TRACE-REFUSAL", "V0-TRACE-ORDERING", "V0-TRACE-LIMITS", "V0-TRACE-DETERMINISM", "V0-TRACE-TRANSPOSITION"],
    authorityIds: ["V0-AUTH-CONTRACT", "V0-AUTH-LIMITS", "V0-AUTH-INDEPENDENCE"],
    checkIds: [
      "complete-payload-order-and-dedup",
      "no-result-distinct-17-all-or-nothing",
      "later-legal-clears-provisional-overflow",
    ],
  };
  const weaveWitness = witnessMap.get("V0-WEAVE-NEAR-001");
  const weaveLaw = laws.find((record) => record["id"] === "V0-LAW-021");
  const adaptiveSlotWitness = witnessMap.get("V0-ADAPTIVE-SLOTS-NEAR-001");
  const adaptiveSlotLaw = laws.find((record) => record["id"] === "V0-LAW-022");
  const constraintObservationWitness = witnessMap.get("V0-CONSTRAINT-OVERFLOW-NEAR-001");
  const constraintObservationLaw = laws.find((record) => record["id"] === "V0-LAW-023");
  requireExact(weaveWitness, expectedWeaveWitness, "V0_REGISTER_WEAVE", "law-cases.json.witnesses[V0-WEAVE-NEAR-001]", "The independently authored non-cyclic register-weave witness drifted.", findings);
  requireExact(weaveLaw, expectedWeaveLaw, "V0_REGISTER_WEAVE", "law-cases.json.cases[V0-LAW-021]", "The selected-degree register-weave law drifted.", findings);
  requireExact(adaptiveSlotWitness, expectedAdaptiveSlotWitness, "V0_ADAPTIVE_SLOT_DIAGNOSTICS", "law-cases.json.witnesses[V0-ADAPTIVE-SLOTS-NEAR-001]", "The adaptive insufficient-slot near miss drifted.", findings);
  requireExact(adaptiveSlotLaw, expectedAdaptiveSlotLaw, "V0_ADAPTIVE_SLOT_DIAGNOSTICS", "law-cases.json.cases[V0-LAW-022]", "The adaptive insufficient-slot law drifted.", findings);
  requireExact(constraintObservationWitness, expectedConstraintObservationWitness, "V0_CONSTRAINT_OBSERVATION_LAW", "law-cases.json.witnesses[V0-CONSTRAINT-OVERFLOW-NEAR-001]", "The provisional-overflow near miss drifted.", findings);
  requireExact(constraintObservationLaw, expectedConstraintObservationLaw, "V0_CONSTRAINT_OBSERVATION_LAW", "law-cases.json.cases[V0-LAW-023]", "The full-payload observation-collection law drifted.", findings);
  if (weaveWitness !== undefined) {
    const setup = isObject(weaveWitness["setup"]) ? weaveWitness["setup"] : {};
    const selectedDegrees = stringArray(setup["selectedDegreeOrder"]);
    const selectedMidi = Array.isArray(setup["selectedPlacementMidi"])
      ? setup["selectedPlacementMidi"].filter((value): value is number => typeof value === "number" && Number.isInteger(value))
      : [];
    const sortedDegrees = stringArray(setup["midiSortedDegreeOrder"]);
    const independentlySorted = selectedDegrees
      .map((degree, index) => ({ degree, midi: selectedMidi[index] }))
      .sort((left, right) => Number(left.midi) - Number(right.midi))
      .map(({ degree }) => degree);
    requireExact(independentlySorted, sortedDegrees, "V0_REGISTER_WEAVE", "law-cases.json.witnesses[V0-WEAVE-NEAR-001].setup.midiSortedDegreeOrder", "MIDI-sorted degree order must be independently derivable from the selected-slot assignment.", findings);
    const cyclicReferences = Array.isArray(setup["cyclicReferenceOrders"])
      ? setup["cyclicReferenceOrders"].filter(Array.isArray).map(stringArray)
      : [];
    const isRotation = (candidate: readonly string[], reference: readonly string[]): boolean =>
      candidate.length === reference.length && reference.some((_, offset) =>
        candidate.every((degree, index) => degree === reference[(index + offset) % reference.length])
      );
    if (cyclicReferences.some((reference) => isRotation(sortedDegrees, reference))) {
      finding(findings, "V0_REGISTER_WEAVE", "law-cases.json.witnesses[V0-WEAVE-NEAR-001].setup", "The reviewed weave result must remain outside both forbidden cyclic-rotation sets.");
    }
    const displacement = sortedDegrees.reduce((sum, degree, observedOrdinal) => {
      const templateOrdinal = selectedDegrees.indexOf(degree);
      return sum + Math.abs(templateOrdinal - observedOrdinal);
    }, 0);
    const expected = isObject(weaveWitness["expected"]) ? weaveWitness["expected"] : {};
    requireExact(displacement, expected["templateOrderDisplacement"], "V0_REGISTER_WEAVE", "law-cases.json.witnesses[V0-WEAVE-NEAR-001].expected.templateOrderDisplacement", "Template-order displacement must be independently recomputed from selected and sounding order.", findings);

    const openSelectedDegrees = stringArray(setup["openSelectedDegreeOrder"]);
    const openSelectedMidi = Array.isArray(setup["openSelectedPlacementMidi"])
      ? setup["openSelectedPlacementMidi"].filter((value): value is number =>
          typeof value === "number" && Number.isInteger(value)
        )
      : [];
    const openSortedDegrees = stringArray(setup["openMidiSortedDegreeOrder"]);
    const independentlySortedOpen = openSelectedDegrees
      .map((degree, index) => ({ degree, midi: openSelectedMidi[index] }))
      .sort((left, right) => Number(left.midi) - Number(right.midi))
      .map(({ degree }) => degree);
    requireExact(
      independentlySortedOpen,
      openSortedDegrees,
      "V0_REGISTER_WEAVE",
      "law-cases.json.witnesses[V0-WEAVE-NEAR-001].setup.openMidiSortedDegreeOrder",
      "Open MIDI-sorted degree order must be independently derivable from its selected-slot assignment.",
      findings,
    );
    if (cyclicReferences.some((reference) => isRotation(openSortedDegrees, reference))) {
      finding(
        findings,
        "V0_REGISTER_WEAVE",
        "law-cases.json.witnesses[V0-WEAVE-NEAR-001].setup.openMidiSortedDegreeOrder",
        "The reviewed Open weave result must remain outside both forbidden cyclic-rotation sets.",
      );
    }
    const openDisplacement = openSortedDegrees.reduce(
      (sum, degree, observedOrdinal) =>
        sum + Math.abs(openSelectedDegrees.indexOf(degree) - observedOrdinal),
      0,
    );
    requireExact(
      openDisplacement,
      expected["openTemplateOrderDisplacement"],
      "V0_REGISTER_WEAVE",
      "law-cases.json.witnesses[V0-WEAVE-NEAR-001].expected.openTemplateOrderDisplacement",
      "Open template-order displacement must be independently recomputed from selected and sounding order.",
      findings,
    );
  }
  if (adaptiveSlotWitness !== undefined) {
    const setup = isObject(adaptiveSlotWitness["setup"])
      ? adaptiveSlotWitness["setup"]
      : {};
    const expected = isObject(adaptiveSlotWitness["expected"])
      ? adaptiveSlotWitness["expected"]
      : {};
    const mandatory = stringArray(setup["mandatoryDegreeOrder"]);
    const guides = new Set(stringArray(setup["guideToneDegrees"]));
    const slotCount = typeof setup["degreeBearingSlotCount"] === "number"
      ? setup["degreeBearingSlotCount"]
      : 0;
    const omitted = mandatory.slice(slotCount);
    requireExact(
      omitted,
      expected["omittedRequiredDegrees"],
      "V0_ADAPTIVE_SLOT_DIAGNOSTICS",
      "law-cases.json.witnesses[V0-ADAPTIVE-SLOTS-NEAR-001].expected.omittedRequiredDegrees",
      "The required omission payload must be the exact mandatory suffix.",
      findings,
    );
    requireExact(
      omitted.filter((degree) => guides.has(degree)),
      expected["omittedGuideToneDegrees"],
      "V0_ADAPTIVE_SLOT_DIAGNOSTICS",
      "law-cases.json.witnesses[V0-ADAPTIVE-SLOTS-NEAR-001].expected.omittedGuideToneDegrees",
      "The guide omission payload must independently project the same mandatory suffix.",
      findings,
    );
    if (
      Number(setup["declaredMinimumVoiceCount"]) > slotCount ||
      Number(setup["mutatedEffectiveMinimumVoiceCount"]) <= slotCount
    ) {
      finding(
        findings,
        "V0_ADAPTIVE_SLOT_DIAGNOSTICS",
        "law-cases.json.witnesses[V0-ADAPTIVE-SLOTS-NEAR-001].setup",
        "The near miss must be supported by the declared minimum and rejected only by the forbidden raised minimum.",
      );
    }
  }
  const lawChecksums = isObject(root["checksums"]) ? root["checksums"] : {};
  requireChecksum(
    lawChecksums["selectedDegreeRegisterWeaveSha256"],
    projectionDigest([[weaveWitness, weaveLaw]]),
    "law-cases.json.checksums.selectedDegreeRegisterWeaveSha256",
    findings,
  );
  requireChecksum(
    lawChecksums["constraintObservationCollectionSha256"],
    projectionDigest([[constraintObservationWitness, constraintObservationLaw]]),
    "law-cases.json.checksums.constraintObservationCollectionSha256",
    findings,
  );
  requireChecksum(
    lawChecksums["adaptiveInsufficientSlotsSha256"],
    projectionDigest([[adaptiveSlotWitness, adaptiveSlotLaw]]),
    "law-cases.json.checksums.adaptiveInsufficientSlotsSha256",
    findings,
  );
  requireChecksum(
    lawChecksums["lawCheckInventorySha256"],
    projectionDigest([
      ["complete-result-audit", stringArray(proof["completeResultAuditCheckIds"])],
      ...laws.map((record) => [
        record["id"],
        stringArray(record["checkIds"]),
      ]),
    ]),
    "law-cases.json.checksums.lawCheckInventorySha256",
    findings,
  );
  const allCaseIds = new Set([...directCases.keys(), ...witnessMap.keys(), ...laws.map((record) => String(record["id"]))]);
  const usedWitnessIds = new Set<string>();
  laws.forEach((record, index) => {
    const path = `law-cases.json.cases[${String(index)}]`;
    const lawId = typeof record["id"] === "string" ? record["id"] : "";
    const expectedCheckIds = V0_LAW_CHECK_IDS[lawId] ?? [];
    const checkIds = stringArray(record["checkIds"]);
    requireExact(
      checkIds,
      expectedCheckIds,
      "V0_LAW_CHECK_INVENTORY",
      `${path}.checkIds`,
      "Each law must declare its exact independently authored executable check inventory.",
      findings,
    );
    if (checkIds.length === 0 || new Set(checkIds).size !== checkIds.length ||
        checkIds.some((id) => !/^[A-Za-z0-9][A-Za-z0-9-]*$/u.test(id))) {
      finding(
        findings,
        "V0_LAW_CHECK_INVENTORY",
        `${path}.checkIds`,
        "Law check IDs must be nonempty, unique, stable ASCII identifiers.",
      );
    }
    for (const field of ["positiveCaseIds", "negativeCaseIds"] as const) {
      const ids = stringArray(record[field]);
      if (ids.length === 0) finding(findings, "V0_LAW_WITNESS", `${path}.${field}`, "Each law requires a nonempty independent positive and negative/near-miss set.");
      for (const id of ids) {
        if (!allCaseIds.has(id)) finding(findings, "V0_LAW_LINK", `${path}.${field}`, `Unknown case ${id}.`);
        if (witnessMap.has(id)) usedWitnessIds.add(id);
      }
    }
    const transposition = stringArray(record["transpositionSeedIds"]);
    if (transposition.length === 0) finding(findings, "V0_LAW_WITNESS", `${path}.transpositionSeedIds`, "Each law requires spelling-aware transposition coverage.");
    for (const id of transposition) {
      if (!transpositionIds.has(id)) finding(findings, "V0_LAW_LINK", `${path}.transpositionSeedIds`, `Unknown transposition seed ${id}.`);
    }
    const mutations = stringArray(record["mutationControlIds"]);
    if (mutations.length === 0) finding(findings, "V0_LAW_WITNESS", `${path}.mutationControlIds`, "Each law requires at least one semantic mutation control.");
    for (const id of mutations) {
      if (!mutationIds.has(id)) finding(findings, "V0_LAW_LINK", `${path}.mutationControlIds`, `Unknown mutation control ${id}.`);
    }
    if (stringArray(record["traceIds"]).length === 0 || stringArray(record["authorityIds"]).length === 0) {
      finding(findings, "V0_LAW_LINK", path, "Every law needs trace and authority links.");
    }
  });
  for (const id of witnessMap.keys()) {
    if (!usedWitnessIds.has(id)) finding(findings, "V0_LAW_WITNESS", `law-cases.json.witnesses.${id}`, "Every standalone witness must be used by a law.");
  }
  return { laws, witnesses };
}

function validateMutationControls(
  root: JsonObject,
  caseIds: ReadonlySet<string>,
  findings: V0ContractFinding[],
): JsonObject[] {
  const requiredFaultFamilies = [
    "degree-role", "spelling", "identity", "bass", "family-structure",
    "quartal-context", "altered-selection", "bypass", "fallback",
    "range-spacing", "limits-ordering", "transposition", "immutability-boundary",
  ];
  requireExact(root["requiredFaultFamilies"], requiredFaultFamilies, "V0_MUTATION_INVENTORY", "mutation-controls.json.requiredFaultFamilies", "Mutation fault-family closure drifted.", findings);
  const controls = objectArray(root["controls"]);
  requireUniqueIds(controls, "mutation-controls.json.controls", findings);
  requireExact(controls.map((record) => record["id"]), Array.from({ length: 51 }, (_, index) => `V0-MUT-${String(index + 1).padStart(3, "0")}`), "V0_MUTATION_INVENTORY", "mutation-controls.json.controls", "Mutation IDs/order must be V0-MUT-001 through 051.", findings);
  const expectedWeaveMutation = {
    id: "V0-MUT-043",
    faultFamily: "limits-ordering",
    operator: "replace-register-weave-with-cyclic-rotation",
    mutatedFault: "Balanced or Open discards a complete selected-occurrence assignment unless its low-to-high degree order is a cyclic rotation",
    killedByCaseIds: ["V0-CAND-001", "V0-WEAVE-NEAR-001"],
    traceIds: ["V0-TRACE-ORDERING", "V0-TRACE-FAMILIES"],
    authorityIds: ["V0-AUTH-TEMPLATES", "V0-AUTH-INDEPENDENCE"],
  };
  const expectedAdaptiveSlotMutation = {
    id: "V0-MUT-044",
    faultFamily: "degree-role",
    operator: "promote-realization-cardinality-to-template-minimum",
    mutatedFault: "A supported adaptive count is mislabeled below-template-minimum by replacing the row declaration with max(declared minimum, mandatory degree count)",
    killedByCaseIds: ["V0-CAND-033", "V0-ADAPTIVE-SLOTS-NEAR-001"],
    traceIds: ["V0-TRACE-DEGREES", "V0-TRACE-FAMILIES", "V0-TRACE-REFUSAL"],
    authorityIds: ["V0-AUTH-T1", "V0-AUTH-TEMPLATES", "V0-AUTH-CONTRACT", "V0-AUTH-INDEPENDENCE"],
  };
  const expectedConstraintObservationMutations = [
    {
      id: "V0-MUT-045",
      faultFamily: "limits-ordering",
      operator: "deduplicate-unsatisfied-observations-by-code-only",
      mutatedFault: "Distinct full-payload observations sharing one constraint code collapse to the first code occurrence",
      killedByCaseIds: ["V0-OP-REFUSAL-014", "V0-OP-REFUSAL-016"],
      traceIds: ["V0-TRACE-REFUSAL", "V0-TRACE-ORDERING"],
      authorityIds: ["V0-AUTH-CONTRACT", "V0-AUTH-INDEPENDENCE"],
    },
    {
      id: "V0-MUT-046",
      faultFamily: "limits-ordering",
      operator: "count-exact-duplicate-as-distinct-observation",
      mutatedFault: "An otherwise-identical code, reason, ordinal, degree, and MIDI payload consumes another produced unit and retained record",
      killedByCaseIds: ["V0-OP-REFUSAL-014"],
      traceIds: ["V0-TRACE-REFUSAL", "V0-TRACE-ORDERING", "V0-TRACE-LIMITS"],
      authorityIds: ["V0-AUTH-CONTRACT", "V0-AUTH-LIMITS", "V0-AUTH-INDEPENDENCE"],
    },
    {
      id: "V0-MUT-047",
      faultFamily: "limits-ordering",
      operator: "truncate-no-result-constraint-observations",
      mutatedFault: "A completed no-result traversal returns the first 16 observations as constraints-unsatisfied instead of the typed distinct-record-17 work limit",
      killedByCaseIds: ["V0-OP-REFUSAL-016", "V0-TRANS-018"],
      traceIds: ["V0-TRACE-REFUSAL", "V0-TRACE-LIMITS"],
      authorityIds: ["V0-AUTH-CONTRACT", "V0-AUTH-LIMITS", "V0-AUTH-INDEPENDENCE"],
    },
    {
      id: "V0-MUT-048",
      faultFamily: "limits-ordering",
      operator: "make-provisional-observation-overflow-terminal",
      mutatedFault: "A provisional distinct-record-17 observation overflow rejects immediately even though a later hard-valid candidate makes rejected-assignment diagnostics non-output evidence",
      killedByCaseIds: ["V0-CONSTRAINT-OVERFLOW-NEAR-001", "V0-OP-SUCCESS-004"],
      traceIds: ["V0-TRACE-REFUSAL", "V0-TRACE-LIMITS", "V0-TRACE-DETERMINISM"],
      authorityIds: ["V0-AUTH-CONTRACT", "V0-AUTH-LIMITS", "V0-AUTH-INDEPENDENCE"],
    },
    {
      id: "V0-MUT-049",
      faultFamily: "limits-ordering",
      operator: "ignore-reason-in-observation-identity-and-order",
      mutatedFault: "Otherwise-identical code, ordinal, degree, and MIDI payloads with different reasons collapse or fail to use frozen reason precedence",
      killedByCaseIds: ["V0-OP-REFUSAL-014"],
      traceIds: ["V0-TRACE-REFUSAL", "V0-TRACE-ORDERING"],
      authorityIds: ["V0-AUTH-CONTRACT", "V0-AUTH-INDEPENDENCE"],
    },
  ];
  const weaveMutation = controls.find((record) => record["id"] === "V0-MUT-043");
  const adaptiveSlotMutation = controls.find((record) => record["id"] === "V0-MUT-044");
  const constraintObservationMutations = controls.filter((record) =>
    ["V0-MUT-045", "V0-MUT-046", "V0-MUT-047", "V0-MUT-048", "V0-MUT-049"].includes(String(record["id"]))
  );
  requireExact(weaveMutation, expectedWeaveMutation, "V0_REGISTER_WEAVE", "mutation-controls.json.controls[V0-MUT-043]", "The cyclic-prefilter mutation control drifted.", findings);
  requireExact(adaptiveSlotMutation, expectedAdaptiveSlotMutation, "V0_ADAPTIVE_SLOT_DIAGNOSTICS", "mutation-controls.json.controls[V0-MUT-044]", "The adaptive raised-minimum mutation control drifted.", findings);
  requireExact(constraintObservationMutations, expectedConstraintObservationMutations, "V0_CONSTRAINT_OBSERVATION_MUTATIONS", "mutation-controls.json.controls[V0-MUT-045..049]", "Constraint observation mutation controls drifted.", findings);
  const mutationChecksums = isObject(root["checksums"]) ? root["checksums"] : {};
  requireChecksum(
    mutationChecksums["selectedDegreeRegisterWeaveMutationSha256"],
    projectionDigest([[weaveMutation]]),
    "mutation-controls.json.checksums.selectedDegreeRegisterWeaveMutationSha256",
    findings,
  );
  requireChecksum(
    mutationChecksums["constraintObservationCollectionMutationSha256"],
    projectionDigest([constraintObservationMutations]),
    "mutation-controls.json.checksums.constraintObservationCollectionMutationSha256",
    findings,
  );
  requireChecksum(
    mutationChecksums["adaptiveInsufficientSlotsMutationSha256"],
    projectionDigest([[adaptiveSlotMutation]]),
    "mutation-controls.json.checksums.adaptiveInsufficientSlotsMutationSha256",
    findings,
  );
  const observedFamilies = new Set<string>();
  controls.forEach((record, index) => {
    const path = `mutation-controls.json.controls[${String(index)}]`;
    if (typeof record["faultFamily"] === "string") observedFamilies.add(record["faultFamily"]);
    else finding(findings, "V0_MUTATION_SHAPE", `${path}.faultFamily`, "Mutation requires a named fault family.");
    if (typeof record["operator"] !== "string" || record["operator"].length === 0 || typeof record["mutatedFault"] !== "string" || record["mutatedFault"].length === 0) {
      finding(findings, "V0_MUTATION_SHAPE", path, "Mutation requires stable operator and fault descriptions.");
    }
    const killers = stringArray(record["killedByCaseIds"]);
    if (killers.length === 0) finding(findings, "V0_MUTATION_KILLER", `${path}.killedByCaseIds`, "Every mutation needs a direct independent killing case.");
    for (const id of killers) {
      if (!caseIds.has(id)) finding(findings, "V0_MUTATION_KILLER", `${path}.killedByCaseIds`, `Unknown direct killer ${id}.`);
    }
    const corroborated = stringArray(record["corroboratedByCaseIds"]);
    const corroborativeLinks = objectArray(record["corroborativeLinks"]);
    if (new Set(killers).size !== killers.length || new Set(corroborated).size !== corroborated.length) {
      finding(findings, "V0_MUTATION_LINK_ORDER", path, "Direct and corroborative case IDs must each be unique.");
    }
    for (const id of corroborated) {
      if (!caseIds.has(id)) finding(findings, "V0_MUTATION_CORROBORATIVE_LINK", `${path}.corroboratedByCaseIds`, `Unknown corroborative case ${id}.`);
      if (killers.includes(id)) finding(findings, "V0_MUTATION_CORROBORATIVE_LINK", path, `Case ${id} cannot be both direct and corroborative.`);
    }
    if (corroborativeLinks.length !== corroborated.length) {
      finding(findings, "V0_MUTATION_CORROBORATIVE_LINK", `${path}.corroborativeLinks`, "Every corroborative case requires exactly one reasoned link.");
    }
    corroborativeLinks.forEach((link, linkIndex) => {
      const linkPath = `${path}.corroborativeLinks[${String(linkIndex)}]`;
      if (
        typeof link["caseId"] !== "string" ||
        link["caseId"] !== corroborated[linkIndex] ||
        typeof link["reasonCode"] !== "string" ||
        link["reasonCode"].length === 0 ||
        typeof link["reason"] !== "string" ||
        link["reason"].length === 0
      ) {
        finding(findings, "V0_MUTATION_CORROBORATIVE_LINK", linkPath, "Corroborative links must match the frozen case order and carry stable non-empty reasons.");
      }
    });
    const reviewedOrder = stringArray(record["reviewedCaseLinkOrder"]);
    if (corroborated.length === 0) {
      if (reviewedOrder.length > 0 || corroborativeLinks.length > 0) {
        finding(findings, "V0_MUTATION_LINK_ORDER", path, "Controls without corroborative cases cannot declare corroborative ordering metadata.");
      }
    } else {
      requireExact(reviewedOrder, [...killers, ...corroborated], "V0_MUTATION_LINK_ORDER", `${path}.reviewedCaseLinkOrder`, "Reviewed mutation links must list direct killers first, followed by reasoned corroborative cases.", findings);
    }
    if (stringArray(record["traceIds"]).length === 0 || stringArray(record["authorityIds"]).length === 0) {
      finding(findings, "V0_MUTATION_LINK", path, "Every mutation needs trace and authority links.");
    }
  });
  requireExact([...observedFamilies].sort(codeUnitCompare), [...requiredFaultFamilies].sort(codeUnitCompare), "V0_MUTATION_INVENTORY", "mutation-controls.json.controls", "Every required fault family must occur.", findings);
  return controls;
}

const TRACE_IDS = [
  "V0-TRACE-FAMILIES", "V0-TRACE-DEGREES", "V0-TRACE-BASS",
  "V0-TRACE-SPACING", "V0-TRACE-DROP2", "V0-TRACE-QUARTAL",
  "V0-TRACE-ALT-SELECTION", "V0-TRACE-BYPASS", "V0-TRACE-REFUSAL",
  "V0-TRACE-ORDERING", "V0-TRACE-DETERMINISM", "V0-TRACE-TRANSPOSITION",
  "V0-TRACE-IMMUTABILITY", "V0-TRACE-LIMITS", "V0-TRACE-BOUNDARY",
] as const;
const AUTHORITY_IDS = [
  "V0-AUTH-CONTRACT", "V0-AUTH-F1", "V0-AUTH-T1", "V0-AUTH-DROP2",
  "V0-AUTH-TEMPLATES", "V0-AUTH-SPACING", "V0-AUTH-LIMITS",
  "V0-AUTH-INDEPENDENCE",
] as const;

function validateLedgers(
  traceRoot: JsonObject,
  provenanceRoot: JsonObject,
  linkedRecords: readonly JsonObject[],
  allCaseIds: ReadonlySet<string>,
  controls: readonly JsonObject[],
  findings: V0ContractFinding[],
): Readonly<{ traces: JsonObject[]; authorities: JsonObject[] }> {
  requireExact(traceRoot["stableTraceIdsOnly"], true, "V0_TRACE_POLICY", "trace-ledger.json.stableTraceIdsOnly", "Only stable trace IDs may be used.", findings);
  const parentClaims = objectArray(traceRoot["parentClaims"]);
  const parentIds = new Set(requireUniqueIds(parentClaims, "trace-ledger.json.parentClaims", findings));
  const traces = objectArray(traceRoot["traces"]);
  requireUniqueIds(traces, "trace-ledger.json.traces", findings);
  requireExact(traces.map((record) => record["id"]), TRACE_IDS, "V0_TRACE_INVENTORY", "trace-ledger.json.traces", "Trace inventory/order drifted.", findings);

  const authorityClasses = [
    "checked-in-project-contract", "inherited-validated-contract",
    "external-descriptive-source", "pre-production-project-policy",
    "independent-oracle-policy",
  ];
  requireExact(provenanceRoot["authorityClasses"], authorityClasses, "V0_AUTHORITY_POLICY", "provenance-ledger.json.authorityClasses", "Authority-class vocabulary drifted.", findings);
  const authoringStatement = isObject(provenanceRoot["authoringStatement"])
    ? provenanceRoot["authoringStatement"]
    : {};
  requireExact(authoringStatement["humanReviewClaimed"], false, "V0_AUTHORITY_POLICY", "provenance-ledger.json.authoringStatement.humanReviewClaimed", "Pre-production authority may not claim human review.", findings);
  requireExact(authoringStatement["domainExpertReviewClaimed"], false, "V0_AUTHORITY_POLICY", "provenance-ledger.json.authoringStatement.domainExpertReviewClaimed", "Pre-production authority may not claim expert review.", findings);
  requireExact(authoringStatement["productionOracleUsed"], false, "V0_AUTHORITY_POLICY", "provenance-ledger.json.authoringStatement.productionOracleUsed", "Production output may not be the oracle.", findings);
  const authorities = objectArray(provenanceRoot["authorities"]);
  requireUniqueIds(authorities, "provenance-ledger.json.authorities", findings);
  requireExact(authorities.map((record) => record["id"]), AUTHORITY_IDS, "V0_AUTHORITY_INVENTORY", "provenance-ledger.json.authorities", "Authority inventory/order drifted.", findings);
  requireExact(authorities.find((record) => record["id"] === "V0-AUTH-LIMITS"), LIMITS_AUTHORITY_RECORD, "V0_AUTHORITY_LIMITS", "provenance-ledger.json.authorities[V0-AUTH-LIMITS]", "Limits authority must cover counter boundaries, tracked-record accounting, bounded candidate payloads, identifier bounds, and wall-time exclusion.", findings);
  const traceIds = new Set<string>(TRACE_IDS);
  const authorityIds = new Set<string>(AUTHORITY_IDS);
  const traceMap = recordMap(traces);
  const controlMap = recordMap(controls);
  const linkedMap = recordMap(linkedRecords);

  authorities.forEach((record, index) => {
    const path = `provenance-ledger.json.authorities[${String(index)}]`;
    if (typeof record["authorityClass"] !== "string" || !authorityClasses.includes(record["authorityClass"])) {
      finding(findings, "V0_AUTHORITY_POLICY", `${path}.authorityClass`, "Authority class is outside the closed vocabulary.");
    }
    if (objectArray(record["sources"]).length === 0 || stringArray(record["claimIds"]).length === 0 || stringArray(record["traceIds"]).length === 0) {
      finding(findings, "V0_AUTHORITY_LINK", path, "Every authority needs sources, claims, and trace coverage.");
    }
    for (const traceId of stringArray(record["traceIds"])) {
      if (!traceIds.has(traceId)) finding(findings, "V0_AUTHORITY_LINK", `${path}.traceIds`, `Unknown trace ${traceId}.`);
    }
  });

  traces.forEach((record, index) => {
    const path = `trace-ledger.json.traces[${String(index)}]`;
    for (const parentId of stringArray(record["parentClaimIds"])) {
      if (!parentIds.has(parentId)) finding(findings, "V0_TRACE_LINK", `${path}.parentClaimIds`, `Unknown parent claim ${parentId}.`);
    }
    const caseIds = stringArray(record["caseIds"]);
    const mutationIds = stringArray(record["mutationControlIds"]);
    const linkedAuthorities = stringArray(record["authorityIds"]);
    if (caseIds.length === 0 || mutationIds.length === 0 || linkedAuthorities.length === 0) {
      finding(findings, "V0_TRACE_LINK", path, "Each trace requires cases, mutations, and authorities.");
    }
    for (const caseId of caseIds) {
      if (!allCaseIds.has(caseId)) {
        finding(findings, "V0_TRACE_LINK", `${path}.caseIds`, `Unknown case ${caseId}.`);
        continue;
      }
      const target = linkedMap.get(caseId);
      if (target !== undefined && Array.isArray(target["traceIds"]) && !stringArray(target["traceIds"]).includes(String(record["id"]))) {
        finding(findings, "V0_TRACE_LINK", `${path}.caseIds`, `Case ${caseId} does not reciprocate trace ${String(record["id"])}.`);
      }
    }
    for (const mutationId of mutationIds) {
      const control = controlMap.get(mutationId);
      if (control === undefined) {
        finding(findings, "V0_TRACE_LINK", `${path}.mutationControlIds`, `Unknown mutation ${mutationId}.`);
      } else if (!stringArray(control["traceIds"]).includes(String(record["id"]))) {
        finding(findings, "V0_TRACE_LINK", `${path}.mutationControlIds`, `Mutation ${mutationId} does not reciprocate trace ${String(record["id"])}.`);
      }
    }
    for (const authorityId of linkedAuthorities) {
      if (!authorityIds.has(authorityId)) finding(findings, "V0_TRACE_LINK", `${path}.authorityIds`, `Unknown authority ${authorityId}.`);
    }
  });

  linkedRecords.forEach((record) => {
    const id = typeof record["id"] === "string" ? record["id"] : "<unknown>";
    for (const traceId of stringArray(record["traceIds"])) {
      const trace = traceMap.get(traceId);
      if (!traceIds.has(traceId) || trace === undefined) {
        finding(findings, "V0_TRACE_LINK", `${id}.traceIds`, `Unknown trace ${traceId}.`);
      } else if (!stringArray(trace["caseIds"]).includes(id)) {
        finding(findings, "V0_TRACE_LINK", `${id}.traceIds`, `Trace ${traceId} does not reciprocate case ${id}.`);
      }
    }
    for (const authorityId of stringArray(record["authorityIds"])) {
      if (!authorityIds.has(authorityId)) finding(findings, "V0_AUTHORITY_LINK", `${id}.authorityIds`, `Unknown authority ${authorityId}.`);
    }
  });
  controls.forEach((record) => {
    const id = typeof record["id"] === "string" ? record["id"] : "<unknown>";
    for (const traceId of stringArray(record["traceIds"])) {
      const trace = traceMap.get(traceId);
      if (!traceIds.has(traceId) || trace === undefined) {
        finding(findings, "V0_TRACE_LINK", `${id}.traceIds`, `Unknown trace ${traceId}.`);
      } else if (!stringArray(trace["mutationControlIds"]).includes(id)) {
        finding(findings, "V0_TRACE_LINK", `${id}.traceIds`, `Trace ${traceId} does not reciprocate mutation ${id}.`);
      }
    }
  });
  return { traces, authorities };
}

function emptyCounts(): V0ContractValidationReport["counts"] {
  return {
    companions: 0,
    realizationClasses: 0,
    adaptiveTemplates: 0,
    fixedTemplates: 0,
    quartalTemplates: 0,
    registerPolicies: 0,
    availabilitySeeds: 0,
    availabilityCells: 0,
    candidateCases: 0,
    lawCases: 0,
    lawWitnesses: 0,
    operationStateCases: 0,
    limitCases: 0,
    transpositionSeeds: 0,
    transpositionRootCells: 0,
    mutationControls: 0,
    traces: 0,
    authorities: 0,
  };
}

function findingOrder(left: V0ContractFinding, right: V0ContractFinding): number {
  return codeUnitCompare(left.path, right.path) ||
    codeUnitCompare(left.code, right.code) ||
    codeUnitCompare(left.message, right.message);
}

async function loadT1Authority(findings: V0ContractFinding[]): Promise<JsonObject | null> {
  let source: string;
  try {
    source = await readFile(T1_FORMULA_FIXTURE, "utf8");
  } catch (error) {
    finding(findings, "V0_MATRIX_T1_AUTHORITY", T1_FORMULA_FIXTURE, `Unable to read inherited T1 authority: ${String(error)}`);
    return null;
  }
  for (const duplicate of duplicateJsonKeys(source)) {
    finding(findings, "V0_MATRIX_T1_AUTHORITY", `${T1_FORMULA_FIXTURE}:${duplicate}`, "Inherited T1 authority contains a duplicate decoded JSON key.");
  }
  try {
    const decoded = JSON.parse(source) as unknown;
    if (!isObject(decoded)) {
      finding(findings, "V0_MATRIX_T1_AUTHORITY", T1_FORMULA_FIXTURE, "Inherited T1 authority root must be an object.");
      return null;
    }
    requireExact(decoded["schema"], "changes.fixtures.t1-formula-rules.v1", "V0_MATRIX_T1_AUTHORITY", `${T1_FORMULA_FIXTURE}.schema`, "Inherited T1 formula schema drifted.", findings);
    requireExact(decoded["productionOutputUsed"], false, "V0_MATRIX_T1_AUTHORITY", `${T1_FORMULA_FIXTURE}.productionOutputUsed`, "T1 formula authority cannot use production output.", findings);
    return decoded;
  } catch (error) {
    finding(findings, "V0_MATRIX_T1_AUTHORITY", T1_FORMULA_FIXTURE, `Inherited T1 authority is invalid JSON: ${String(error)}`);
    return null;
  }
}

/**
 * Validate the complete independent V0 authority package. The optional root is
 * deliberately public so static mutation tests can validate isolated copies.
 */
export async function validateV0Contract(
  fixtureRoot = DEFAULT_FIXTURE_ROOT,
): Promise<V0ContractValidationReport> {
  const findings: V0ContractFinding[] = [];
  const fixtures = new Map<FixtureFilename, JsonObject>();
  let entries: string[] = [];
  try {
    entries = (await readdir(fixtureRoot)).sort(codeUnitCompare);
  } catch (error) {
    finding(findings, "V0_FILE_SET", fixtureRoot, `Unable to read fixture directory: ${String(error)}`);
  }
  requireExact(entries, [...EXPECTED_FILES].sort(codeUnitCompare), "V0_FILE_SET", fixtureRoot, "V0 fixture root must contain exactly the eleven authority files and no other entries.", findings);
  for (const filename of EXPECTED_FILES) {
    let source: string;
    try {
      source = await readFile(join(fixtureRoot, filename), "utf8");
    } catch (error) {
      finding(findings, "V0_FILE_SET", filename, `Unable to read required fixture: ${String(error)}`);
      continue;
    }
    for (const duplicate of duplicateJsonKeys(source)) {
      finding(findings, "V0_DUPLICATE_KEY", `${filename}:${duplicate}`, "Duplicate decoded JSON object key is forbidden.");
    }
    let decoded: unknown;
    try {
      decoded = JSON.parse(source) as unknown;
    } catch (error) {
      finding(findings, "V0_JSON_PARSE", filename, `Invalid JSON: ${String(error)}`);
      continue;
    }
    if (!isObject(decoded)) {
      finding(findings, "V0_JSON_PARSE", filename, "Fixture root must be a JSON object.");
      continue;
    }
    fixtures.set(filename, decoded);
    requireExact(decoded["schema"], EXPECTED_SCHEMAS[filename], "V0_SCHEMA", `${filename}.schema`, `Expected ${EXPECTED_SCHEMAS[filename]}.`, findings);
    requireExact(decoded["fixtureVersion"], "1.0.0", "V0_FIXTURE_VERSION", `${filename}.fixtureVersion`, "Every V0 fixture must use corpus version 1.0.0.", findings);
    requireExact(decoded["status"], "independently-authored-pre-production", "V0_INDEPENDENCE", `${filename}.status`, "Fixture status must not overclaim execution or review.", findings);
    requireExact(decoded["productionOutputUsed"], false, "V0_INDEPENDENCE", `${filename}.productionOutputUsed`, "Production output cannot author V0 expectations.", findings);
    const generatedException = filename === "availability-matrix.json";
    requireExact(decoded["expectedValuesGenerated"], generatedException, "V0_INDEPENDENCE", `${filename}.expectedValuesGenerated`, generatedException ? "Only the Cartesian matrix may identify mechanical expansion." : "Hand-authored V0 authority cannot generate expected values.", findings);
    if (filename === "availability-matrix.json" || filename === "limit-cases.json" || filename === "operation-state-cases.json") {
      requireExact(decoded["productionGeneratedExpectedValues"], false, "V0_INDEPENDENCE", `${filename}.productionGeneratedExpectedValues`, "Mechanical serialization is not production-generated authority.", findings);
    }
    requireExact(Object.keys(decoded).sort(codeUnitCompare), [...EXPECTED_TOP_LEVEL_KEYS[filename]].sort(codeUnitCompare), "V0_SCHEMA", filename, "Top-level field inventory drifted.", findings);
  }

  const t1 = await loadT1Authority(findings);
  const manifest = fixtures.get(CONTRACT_FILENAME);
  const familyRoot = fixtures.get("family-templates.json");
  const matrixRoot = fixtures.get("availability-matrix.json");
  const candidateRoot = fixtures.get("candidate-cases.json");
  const lawRoot = fixtures.get("law-cases.json");
  const operationRoot = fixtures.get("operation-state-cases.json");
  const limitRoot = fixtures.get("limit-cases.json");
  const transpositionRoot = fixtures.get("transposition-seeds.json");
  const mutationRoot = fixtures.get("mutation-controls.json");
  const provenanceRoot = fixtures.get("provenance-ledger.json");
  const traceRoot = fixtures.get("trace-ledger.json");
  if (manifest !== undefined) validateManifest(manifest, findings);
  const templates = familyRoot === undefined
    ? { realizationClasses: [], adaptive: [], fixed: [], quartal: [], registerPolicies: [] }
    : validateFamilyTemplates(familyRoot, findings);
  const matrix = matrixRoot === undefined || t1 === null
    ? { seeds: [], cells: [] }
    : validateAvailabilityMatrix(matrixRoot, t1, templates, findings);
  const candidateCases = candidateRoot === undefined || t1 === null
    ? []
    : validateCandidateCases(candidateRoot, t1, templates, findings);
  const limitCases = limitRoot === undefined ? [] : validateLimitCases(limitRoot, findings);
  const templateIds = new Set<string>([
    ...templates.adaptive, ...templates.fixed, ...templates.quartal,
  ].map((record) => record["id"]).filter((id): id is string => typeof id === "string"));
  const candidateIds = new Set(requireUniqueIds(candidateCases, "candidate-cases.json.cases", findings));
  const matrixIds = new Set(requireUniqueIds(matrix.cells, "availability-matrix.json.cells", findings));
  const limitIds = new Set(requireUniqueIds(limitCases, "limit-cases.json.allCases", findings));
  const operationCases = operationRoot === undefined
    ? []
    : validateOperationStates(operationRoot, candidateIds, matrixIds, limitIds, findings);
  const operationIds = new Set(requireUniqueIds(operationCases, "operation-state-cases.json.allCases", findings));
  const transpositionSeeds = transpositionRoot === undefined
    ? []
    : validateTranspositionSeeds(transpositionRoot, candidateCases, operationIds, templateIds, findings);

  const controls = mutationRoot === undefined ? [] : objectArray(mutationRoot["controls"]);
  const mutationIds = new Set(controls.map((record) => record["id"]).filter((id): id is string => typeof id === "string"));
  const transpositionIds = new Set(transpositionSeeds.map((record) => record["id"]).filter((id): id is string => typeof id === "string"));
  const directCases = recordMap([...candidateCases, ...limitCases, ...transpositionSeeds, ...operationCases]);
  const laws = lawRoot === undefined
    ? { laws: [], witnesses: [] }
    : validateLaws(lawRoot, directCases, transpositionIds, mutationIds, findings);
  const allCaseRecords = [
    ...candidateCases, ...limitCases, ...transpositionSeeds, ...operationCases,
    ...laws.laws, ...laws.witnesses,
  ];
  const allCaseIds = new Set(allCaseRecords.map((record) => record["id"]).filter((id): id is string => typeof id === "string"));
  const validatedControls = mutationRoot === undefined
    ? []
    : validateMutationControls(mutationRoot, allCaseIds, findings);
  const ledgers = traceRoot === undefined || provenanceRoot === undefined
    ? { traces: [], authorities: [] }
    : validateLedgers(
        traceRoot,
        provenanceRoot,
        [...candidateCases, ...laws.laws, ...laws.witnesses, ...limitCases, ...transpositionSeeds, ...operationCases],
        allCaseIds,
        validatedControls,
        findings,
      );

  findings.sort(findingOrder);
  return {
    schema: "changes.validation.v0-contract.v1",
    package: "V0",
    outcome: findings.length === 0 ? "pass" : "fail",
    counts: {
      companions: Math.max(0, fixtures.size - 1),
      realizationClasses: templates.realizationClasses.length,
      adaptiveTemplates: templates.adaptive.length,
      fixedTemplates: templates.fixed.length,
      quartalTemplates: templates.quartal.length,
      registerPolicies: templates.registerPolicies.length,
      availabilitySeeds: matrix.seeds.length,
      availabilityCells: matrix.cells.length,
      candidateCases: candidateCases.length,
      lawCases: laws.laws.length,
      lawWitnesses: laws.witnesses.length,
      operationStateCases: operationCases.length,
      limitCases: limitCases.length,
      transpositionSeeds: transpositionSeeds.length,
      transpositionRootCells: transpositionSeeds.length * 12,
      mutationControls: validatedControls.length,
      traces: ledgers.traces.length,
      authorities: ledgers.authorities.length,
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
    const report: V0ContractValidationReport = {
      schema: "changes.validation.v0-contract.v1",
      package: "V0",
      outcome: "fail",
      counts: emptyCounts(),
      findings: [{
        code: "V0_CLI_ARGUMENTS",
        path: "$argv",
        message: "Usage: bun scripts/validate-v0-contract.ts [<fixture-root> | --fixture-root <directory>]",
      }],
    };
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = 2;
  } else {
    try {
      const report = await validateV0Contract(fixtureRoot);
      console.log(JSON.stringify(report, null, 2));
      process.exitCode = report.outcome === "pass" ? 0 : 1;
    } catch (error) {
      const report: V0ContractValidationReport = {
        schema: "changes.validation.v0-contract.v1",
        package: "V0",
        outcome: "fail",
        counts: emptyCounts(),
        findings: [{
          code: "V0_VALIDATOR_TOOL_FAILURE",
          path: "$tool",
          message: error instanceof Error ? error.message : "Unknown validator failure.",
        }],
      };
      console.log(JSON.stringify(report, null, 2));
      process.exitCode = 2;
    }
  }
}
