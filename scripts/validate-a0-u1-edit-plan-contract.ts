import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  APPLICATION_COMMAND_KINDS,
  APPLICATION_WORK_COUNTER_NAMES,
  HISTORY_RETAINED_BYTE_ESTIMATE_POLICY,
  MAX_APPLICATION_REVISION,
  MAX_APPLICATION_SEQUENCE,
  MAX_COMMAND_ID_CODE_POINTS,
  MAX_COMMAND_LABEL_CODE_POINTS,
} from "../src/application/application-state-contract";
import {
  A0_U1_ATOMIC_EDIT_IMPLEMENTATION_STATUS,
  A0_U1_ATOMIC_EDIT_ALLOWED_OUTER_CODES_BY_REFUSAL_CODE,
  A0_U1_ATOMIC_EDIT_PLAN_BOOKMARK_POLICIES,
  A0_U1_ATOMIC_EDIT_PLAN_DIAGNOSTIC_ORDER,
  A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS,
  A0_U1_ATOMIC_EDIT_PLAN_FORBIDDEN_PAYLOAD_KEYS,
  A0_U1_ATOMIC_EDIT_PLAN_ID_ALLOCATION_ORDER,
  A0_U1_ATOMIC_EDIT_LAW_IDS,
  A0_U1_ATOMIC_EDIT_LIMITS,
  A0_U1_ATOMIC_EDIT_PLAN_CONTRACT_SCHEMA,
  A0_U1_ATOMIC_EDIT_PLAN_KINDS,
  A0_U1_ATOMIC_EDIT_OUTER_REFUSAL_CODES,
  A0_U1_ATOMIC_EDIT_PREPLAN_OUTER_REFUSAL_CODES,
  A0_U1_ATOMIC_EDIT_PLAN_RUNNER_STAGE_ORDER,
  A0_U1_ATOMIC_EDIT_PLAN_RECEIPT_SCHEMA,
  A0_U1_ATOMIC_EDIT_REFUSAL_CODES,
  A0_U1_ATOMIC_EDIT_WORK_COUNTER_NAMES,
  A0_U1_NEW_EVENT_AUTO_VOICING,
  A0_U1_NEW_EVENT_POLICY_ID,
  A0_U1_PROPOSED_APPLICATION_COMMAND_KINDS,
  A0_U1_QUICK_ENTRY_TARGET_MATCH_POLICY,
  A0_U1_RECOVERED_CHORD_LAYOUT_LOSS_ACKNOWLEDGEMENT,
} from "../src/application/application-edit-plan-contract";
import {
  ALLOWED_BEAT_DENOMINATORS,
  KEY_MODES,
  MAX_LONG_TEXT_CODE_POINTS,
  MAX_NORMALIZED_BEAT_NUMERATOR,
  MAX_SHORT_TEXT_CODE_POINTS,
  SECTION_VOICE_LEADING_BOUNDARIES,
  STABLE_ID_MAX_ASCII_LENGTH,
  STABLE_ID_PATTERN_SOURCE,
} from "../src/domain";
import { CHART_ERROR_CODES, CHART_WARNING_CODES } from "../src/theory";

type JsonObject = Record<string, unknown>;

export type A0U1EditPlanContractFinding = Readonly<{
  code: string;
  path: string;
  message: string;
}>;

export type A0U1EditPlanContractValidationReport = Readonly<{
  schema: "changes.validation.a0-u1-edit-plan-contract.v1";
  package: "A0/U1 atomic edit plan";
  outcome: "pass" | "fail";
  reviewState: "proposed-independent-spec";
  counts: Readonly<{
    files: number;
    commandKinds: number;
    planKinds: number;
    lawRows: number;
    caseGroups: number;
    literalTransitions: number;
    applicabilityRows: number;
    transpositionWitnesses: number;
    obligationRows: number;
    mutationControls: number;
    traces: number;
    authorities: number;
  }>;
  existingA0CommandKindsUnchanged: boolean;
  productionImplementationClaim: false;
  u1UiCompletionClaim: false;
  humanAcceptanceClaim: false;
  expertReviewClaim: false;
  findings: readonly A0U1EditPlanContractFinding[];
}>;

export type A0U1EditPlanContractValidationOptions = Readonly<{
  /** Test-only seam: semantic authority remains independently fixed. */
  expectedByteDigests?: Readonly<Record<string, string>>;
  /**
   * Explicit authoring-only seam. The default release gate still requires
   * reviewed byte and semantic pins and therefore never enables this option.
   */
  allowPendingFreeze?: boolean;
}>;

const REPOSITORY_ROOT = new URL("../", import.meta.url).pathname;
const DEFAULT_FIXTURE_ROOT = resolve(
  REPOSITORY_ROOT,
  "tests/fixtures/a0-u1-edit-plan",
);

export const A0_U1_EDIT_PLAN_SPEC_FILES = Object.freeze([
  "a0-u1-edit-plan-contract.json",
  "edit-plan-cases.json",
  "mutation-controls.json",
  "provenance-ledger.json",
  "trace-ledger.json",
] as const);

type SpecFilename = (typeof A0_U1_EDIT_PLAN_SPEC_FILES)[number];

const EXPECTED_SCHEMAS: Readonly<Record<SpecFilename, string>> = Object.freeze({
  "a0-u1-edit-plan-contract.json":
    "changes.fixtures.a0-u1-edit-plan-contract.v1",
  "edit-plan-cases.json": "changes.fixtures.a0-u1-edit-plan-cases.v1",
  "mutation-controls.json":
    "changes.fixtures.a0-u1-edit-plan-mutation-controls.v1",
  "provenance-ledger.json":
    "changes.fixtures.a0-u1-edit-plan-provenance-ledger.v1",
  "trace-ledger.json": "changes.fixtures.a0-u1-edit-plan-trace-ledger.v1",
});

const EXPECTED_REVIEW_STATES: Readonly<Record<SpecFilename, string>> =
  Object.freeze({
    "a0-u1-edit-plan-contract.json": "proposed-independent-spec",
    "edit-plan-cases.json": "proposed-independent-literal-spec",
    "mutation-controls.json": "proposed-independent-literal-spec",
    "provenance-ledger.json": "proposed-independent-spec",
    "trace-ledger.json": "proposed-independent-literal-spec",
  });

/** Frozen only after the independently authored packet has passed review. */
export const A0_U1_EDIT_PLAN_SPEC_BYTE_DIGESTS: Readonly<
  Record<SpecFilename, string>
> = Object.freeze({
  "a0-u1-edit-plan-contract.json":
    "cb23fac90ca33dd03e2d423825da16520c965bdb6185ea1b2682c5771fd7ea05",
  "edit-plan-cases.json":
    "04aebe01fd33716b355907c64cde431cac1efa68730334afe2ae7c532ffc6754",
  "mutation-controls.json":
    "34bae67af32efece64804aaa63e258329d47651630fc3f3672197e50d886f051",
  "provenance-ledger.json":
    "f432b32c8eabd18afdbed298ab96dc6676f98451d69517c2d5502f413cf3b136",
  "trace-ledger.json":
    "1f2b0d08ea642e0f384ad7adac055473bff7b372f3ee0af3d2edf99b0408f02c",
});

export const A0_U1_EDIT_PLAN_SPEC_SEMANTIC_DIGEST =
  "4ae4489a18fa2b4b0e039dc3603eeef10c9ad99fb9b2bb83c3a9761c375ffe21";

const EXPECTED_COUNTS = Object.freeze({
  files: 5,
  commandKinds: 1,
  planKinds: 5,
  lawRows: 17,
  caseGroups: 50,
  literalTransitions: 70,
  applicabilityRows: 5,
  transpositionWitnesses: 5,
  obligationRows: 24,
  mutationControls: 30,
  traces: 6,
  authorities: 6,
});

const EXPECTED_COVERAGE_FAMILIES = Object.freeze([
  "positive",
  "negative-near-miss",
  "stale-wrong-document",
  "malformed-exact-shape",
  "exact-boundary",
  "plus-one",
  "undo-redo",
  "collision-allocation",
  "transposition-applicability",
  "mutation",
] as const);

const EXPECTED_FORBIDDEN_PAYLOAD_KEYS = Object.freeze([
  "candidate",
  "document",
  "commands",
  "plans",
  "nestedPlan",
  "patch",
  "derivedPatch",
  "replacement",
  "importDraft",
] as const);

const EXPECTED_OBLIGATION_ROWS = Object.freeze([
  Object.freeze({
    id: "A0U1-OBL-001-REFUSAL-VOCABULARY",
    category: "refusal-coverage",
    operation: "pipeline",
    semanticPredicate:
      "all-reachable-refusal-codes-observed-unreachable-codes-have-static-dominance-proof",
  }),
  Object.freeze({
    id: "A0U1-OBL-002-COMPLETE-PLACEMENTS",
    category: "placement-coverage",
    operation: "insert-fragment",
    semanticPredicate: "complete-draft-three-placement-lanes-commit",
  }),
  Object.freeze({
    id: "A0U1-OBL-003-QUICK-ENTRY-SIX-FIELDS",
    category: "freshness",
    operation: "insert-fragment",
    semanticPredicate: "each-quick-entry-snapshot-field-stales-independently",
  }),
  Object.freeze({
    id: "A0U1-OBL-004-TARGET-PARENT",
    category: "freshness",
    operation: "insert-fragment",
    semanticPredicate: "canonical-target-and-parent-ownership-enforced",
  }),
  Object.freeze({
    id: "A0U1-OBL-005-DURATION-CANONICAL",
    category: "bounds",
    operation: "pipeline",
    semanticPredicate: "positive-reduced-ppq-duration-boundaries",
  }),
  Object.freeze({
    id: "A0U1-OBL-006-SCALAR-RANGE-METADATA",
    category: "bounds",
    operation: "pipeline",
    semanticPredicate: "unicode-range-id-and-metadata-bounds",
  }),
  Object.freeze({
    id: "A0U1-OBL-007-LIMIT-EXACT",
    category: "bounds",
    operation: "pipeline",
    semanticPredicate:
      "reachable-limits-have-exact-witnesses-unreachable-limits-have-static-dominance-proof",
  }),
  Object.freeze({
    id: "A0U1-OBL-008-LIMIT-PLUS-ONE",
    category: "bounds",
    operation: "pipeline",
    semanticPredicate:
      "reachable-first-excess-caps-refuse-unreachable-caps-have-static-dominance-proof",
  }),
  Object.freeze({
    id: "A0U1-OBL-009-ALLOCATION-PREORDER",
    category: "allocation",
    operation: "pipeline",
    semanticPredicate: "allocation-source-provenance-preorder-and-cardinality",
  }),
  Object.freeze({
    id: "A0U1-OBL-010-ALLOCATION-FACTORY-POSITIONS",
    category: "allocation",
    operation: "pipeline",
    semanticPredicate: "factory-failure-at-every-allocating-position",
  }),
  Object.freeze({
    id: "A0U1-OBL-011-ALLOCATION-COLLISION-POSITIONS",
    category: "allocation",
    operation: "pipeline",
    semanticPredicate: "collision-at-every-allocating-position",
  }),
  Object.freeze({
    id: "A0U1-OBL-012-JOIN-FACTORY-UNUSED",
    category: "allocation",
    operation: "pipeline",
    semanticPredicate: "both-join-variants-ignore-hostile-id-factory",
  }),
  Object.freeze({
    id: "A0U1-OBL-013-F2-REFUSAL",
    category: "publication",
    operation: "pipeline",
    semanticPredicate: "f2-refusal-is-atomic-after-one-validation-call",
  }),
  Object.freeze({
    id: "A0U1-OBL-014-F3-REFUSAL",
    category: "publication",
    operation: "pipeline",
    semanticPredicate: "f3-refusal-is-atomic-after-two-validation-calls",
  }),
  Object.freeze({
    id: "A0U1-OBL-015-HISTORY-REFUSAL",
    category: "publication",
    operation: "pipeline",
    semanticPredicate: "history-refusal-is-atomic-after-f2-and-f3",
  }),
  Object.freeze({
    id: "A0U1-OBL-016-UNDO-REDO",
    category: "history",
    operation: "pipeline",
    semanticPredicate: "all-five-apply-undo-redo-trios-are-exact-inverses",
  }),
  Object.freeze({
    id: "A0U1-OBL-017-RECOVERY-SCAN",
    category: "recovery",
    operation: "insert-fragment",
    semanticPredicate: "recovery-work-uses-selected-insertable-array-position",
  }),
  Object.freeze({
    id: "A0U1-OBL-018-DIAGNOSTICS",
    category: "diagnostics",
    operation: "pipeline",
    semanticPredicate: "diagnostics-typed-sanitized-ordered-and-stage-correlated",
  }),
  Object.freeze({
    id: "A0U1-OBL-019-CANDIDATE-TRANSFORMS",
    category: "candidate",
    operation: "pipeline",
    semanticPredicate: "all-five-candidates-equal-independent-whole-document-transform",
  }),
  Object.freeze({
    id: "A0U1-OBL-020-TRANSPOSITION",
    category: "metamorphic",
    operation: "pipeline",
    semanticPredicate: "all-five-transform-inverse-transition-commutations",
  }),
  Object.freeze({
    id: "A0U1-OBL-021-MUTATIONS",
    category: "mutation",
    operation: "pipeline",
    semanticPredicate: "all-30-category-specific-semantic-killers",
  }),
  Object.freeze({
    id: "A0U1-OBL-022-FORBIDDEN-PAYLOADS",
    category: "shape",
    operation: "pipeline",
    semanticPredicate: "every-source-forbidden-payload-key-is-refused",
  }),
  Object.freeze({
    id: "A0U1-OBL-023-COMPLETE-WARNINGS",
    category: "parser",
    operation: "insert-fragment",
    semanticPredicate: "complete-warning-code-range-order-is-exact",
  }),
  Object.freeze({
    id: "A0U1-OBL-024-RECOVERY-BRANCHES",
    category: "recovery",
    operation: "insert-fragment",
    semanticPredicate: "recovery-resolved-and-caller-duration-branches-are-exact",
  }),
] as const);

const EXPECTED_OBLIGATION_KEYS = Object.freeze([
  "id",
  "category",
  "operation",
  "requirement",
  "transitionIds",
  "semanticPredicate",
] as const);

const EXPECTED_DESTINATION_REFUSAL_CODES: readonly string[] = Object.freeze([
  "edit-plan.destination-invalid",
  "edit-plan.event-order-invalid",
  "edit-plan.section-split-boundary-invalid",
  "edit-plan.section-order-invalid",
]);

const EXPECTED_ID_ALLOCATION_REFUSAL_CODES: readonly string[] = Object.freeze([
  "edit-plan.id-factory-failed",
  "edit-plan.id-collision",
]);

function expectedAllowedOuterCodesForRefusal(
  nestedCode: string,
): readonly string[] {
  if (nestedCode === "edit-plan.target-missing") {
    return ["command.target_missing"];
  }
  if (EXPECTED_DESTINATION_REFUSAL_CODES.includes(nestedCode)) {
    return ["command.destination_invalid"];
  }
  if (EXPECTED_ID_ALLOCATION_REFUSAL_CODES.includes(nestedCode)) {
    return ["command.id_allocation_failed"];
  }
  if (nestedCode === "edit-plan.structural-publication-refused") {
    return ["command.structural_validation_failed"];
  }
  if (nestedCode === "edit-plan.semantic-publication-refused") {
    return ["command.semantic_validation_failed"];
  }
  if (nestedCode === "edit-plan.history-refused") {
    return ["history.entry_too_large", "history.byte_estimate_invalid"];
  }
  return ["command.payload_invalid"];
}

const EXPECTED_ROOT_KEYS = Object.freeze([
  "schema",
  "reviewState",
  "pinState",
  "package",
  "owner",
  "prospectiveConsumer",
  "activeLeaf",
  "contractModule",
  "applicationContractSchema",
  "receiptSchema",
  "implementationStatus",
  "productionImplementationClaim",
  "u1UiCompletionClaim",
  "humanAcceptanceClaim",
  "expertReviewClaim",
  "productionOutputUsedAsOracle",
  "expectedValuesGenerated",
  "commandKinds",
  "planKinds",
  "commandEnvelope",
  "decisions",
  "refusalCodes",
  "outerRefusalCodes",
  "preplanOuterRefusalCodes",
  "allowedOuterCodesByRefusalCode",
  "refusalPrecedence",
  "outerWorkCounterNames",
  "workCounterNames",
  "limits",
  "ordering",
  "coverageFamilies",
  "lawIds",
  "counts",
  "proofRequirements",
  "acceptedUpstreamBoundary",
  "companionSha256",
] as const);

const EXPECTED_TOP_LEVEL_KEYS: Readonly<
  Record<
    Exclude<SpecFilename, "a0-u1-edit-plan-contract.json">,
    readonly string[]
  >
> = Object.freeze({
  "edit-plan-cases.json": Object.freeze([
    "schema",
    "reviewState",
    "pinState",
    "materializationPolicy",
    "literalCatalog",
    "caseGroups",
    "applicabilityRows",
    "transpositionWitnesses",
    "obligationRows",
  ]),
  "mutation-controls.json": Object.freeze([
    "schema",
    "reviewState",
    "pinState",
    "controls",
  ]),
  "provenance-ledger.json": Object.freeze([
    "schema",
    "reviewState",
    "pinState",
    "expertReviewClaim",
    "humanAcceptanceClaim",
    "independence",
    "authorities",
  ]),
  "trace-ledger.json": Object.freeze([
    "schema",
    "reviewState",
    "pinState",
    "traces",
    "lawCoverage",
  ]),
});

const EXPECTED_LITERAL_CATALOG_KEYS = Object.freeze([
  "documents",
  "states",
  "commands",
  "results",
  "deltas",
  "counters",
  "bookmarks",
  "focusRequests",
  "histories",
  "effects",
  "allocationTraces",
  "idFactoryEvidence",
  "eventOrders",
  "exactTimeEvidence",
  "sectionEvidence",
  "parserEvidence",
  "transitions",
] as const);

const EXPECTED_DECISION_KEYS = Object.freeze([
  "insertFragment",
  "splitEventDuration",
  "joinEventDurations",
  "splitSection",
  "joinSections",
] as const);

const EXPECTED_ORDERING_KEYS = Object.freeze([
  "runnerStages",
  "idAllocation",
  "diagnostics",
  "effects",
  "bookmarks",
  "quickEntryTargetMatch",
] as const);

const EXPECTED_PROOF_REQUIREMENT_KEYS = Object.freeze([
  "literalBeforeCommandResultAfter",
  "computedRecursiveDeltaEqualsDeclaredDelta",
  "completeExactCounters",
  "literalBookmarksFocusHistoryAndEffects",
  "positiveNegativeNearMissAndMalformed",
  "staleAndWrongDocument",
  "exactAndPlusOne",
  "undoAndRedoEveryPlanKind",
  "collisionAndPartialAllocation",
  "baseTransposedAndInverseHashes",
  "manualAndFrozenPitchBytes",
  "oneFieldMutation",
  "mutationObservationDistinctFromTarget",
  "mutationObservationIndependentlyRecomputed",
  "reciprocalLawCaseTransitionControlTraceAuthorityLinks",
  "productionOutputMayAuthorExpectedValues",
  "wallTimeMayAffectOutcome",
] as const);

const EXPECTED_TRANSITION_KEYS = Object.freeze([
  "id",
  "caseId",
  "operation",
  "phase",
  "runRole",
  "beforeState",
  "command",
  "expected",
  "lawIds",
] as const);

const EXPECTED_TRANSITION_RESULT_KEYS = Object.freeze([
  "result",
  "afterState",
  "exactDelta",
  "counters",
  "bookmarks",
  "focusRequest",
  "history",
  "effects",
  "allocationTrace",
  "idFactoryEvidence",
  "eventOrder",
  "exactTimeEvidence",
  "sectionEvidence",
  "parserEvidence",
] as const);

const EXPECTED_PARSER_EVIDENCE_KEYS = Object.freeze([
  "authorityId",
  "independence",
  "sourceText",
  "mode",
  "meter",
  "accidentalStyle",
  "outcome",
  "warningRows",
  "diagnosticRows",
  "sectionRows",
  "measureRows",
  "allEventSlots",
  "insertableRows",
] as const);

const EXPECTED_PARSER_DIAGNOSTIC_ROW_KEYS = Object.freeze([
  "code",
  "range",
] as const);

const EXPECTED_PARSER_SECTION_ROW_KEYS = Object.freeze([
  "sourceSectionOrdinal",
  "kind",
  "name",
  "annotation",
] as const);

const EXPECTED_PARSER_MEASURE_ROW_KEYS = Object.freeze([
  "sourceSectionOrdinal",
  "sourceMeasureOrdinal",
  "kind",
  "completion",
] as const);

const EXPECTED_PARSER_EVENT_SLOT_KEYS = Object.freeze([
  "globalOrdinal",
  "sourceSectionOrdinal",
  "sourceMeasureOrdinal",
  "sourceEventOrdinal",
  "valid",
] as const);

const EXPECTED_PARSER_INSERTABLE_ROW_KEYS = Object.freeze([
  "globalOrdinal",
  "sourceSectionOrdinal",
  "sourceMeasureOrdinal",
  "sourceEventOrdinal",
  "chord",
  "annotation",
  "duration",
  "range",
] as const);

const EXPECTED_SUCCESS_RESULT_KEYS = Object.freeze([
  "ok",
  "state",
  "outcome",
  "effects",
  "counters",
  "editPlanReceipt",
] as const);

const EXPECTED_FAILURE_RESULT_KEYS = Object.freeze([
  "ok",
  "state",
  "refusal",
  "notice",
  "effects",
  "counters",
  "editPlanRefusal",
] as const);

const EXPECTED_RECEIPT_KEYS = Object.freeze([
  "schema",
  "commandKind",
  "commandId",
  "planKind",
  "documentId",
  "baseRevision",
  "committedRevision",
  "allocatedIdentities",
  "removedIdentities",
  "survivorId",
  "insertSource",
  "completionMeasureIds",
  "timelineDisposition",
  "bookmarks",
  "quickEntryDisposition",
  "historyEntriesAppended",
  "structuralDecodeCalls",
  "semanticValidationCalls",
  "effects",
  "work",
] as const);

const EXPECTED_CASE_KEYS = Object.freeze([
  "id",
  "operation",
  "category",
  "summary",
  "proofKinds",
  "transitionIds",
  "mutationControlIds",
  "traceIds",
  "authorityIds",
] as const);

const EXPECTED_APPLICABILITY_KEYS = Object.freeze([
  "id",
  "operation",
  "synchronization",
  "cancellation",
  "staleState",
  "transposition",
  "allocation",
  "wallTimeCutoff",
  "caseIds",
  "transitionIds",
  "traceIds",
  "authorityIds",
] as const);

const EXPECTED_TRANSPOSITION_KEYS = Object.freeze([
  "id",
  "operation",
  "baseTransitionId",
  "transposedTransitionId",
  "intervalSemitones",
  "sourceDocumentRef",
  "targetDocumentRef",
  "sourceCanonicalSha256",
  "targetCanonicalSha256",
  "inverseCanonicalSha256",
  "manualPitchBytes",
  "frozenPitchBytes",
  "invariantFields",
  "changedFields",
  "traceIds",
  "authorityIds",
] as const);

const EXPECTED_TRANSPOSITION_INVARIANT_FIELDS = Object.freeze([
  "document.id",
  "stable section/measure/event IDs",
  "exact durations",
  "manual/frozen modes",
  "termination",
] as const);

const EXPECTED_TRANSPOSITION_CHANGED_FIELDS = Object.freeze([
  "key spellings",
  "parsed sourceText/root",
  "custom pitch names",
  "manual pitch bytes",
  "frozen pitch bytes",
] as const);

const EXPECTED_CONTROL_KEYS = Object.freeze([
  "id",
  "category",
  "operation",
  "lawIds",
  "baselineTransitionId",
  "killerTransitionId",
  "mutation",
  "observation",
  "exactExpectedDifference",
  "oracleExpectation",
  "linkedCaseIds",
  "traceIds",
  "authorityIds",
] as const);

const EXPECTED_TRACE_KEYS = Object.freeze([
  "id",
  "scope",
  "requirement",
  "lawIds",
  "caseIds",
  "transitionIds",
  "controlIds",
  "authorityIds",
  "proofKinds",
  "implementationOwner",
] as const);

const EXPECTED_LAW_COVERAGE_KEYS = Object.freeze([
  "lawId",
  "requirement",
  "positiveTransitionIds",
  "negativeOrNearMissTransitionIds",
  "boundaryTransitionIds",
  "applicabilityRowIds",
  "mutationControlIds",
  "traceIds",
  "authorityIds",
] as const);

const EXPECTED_AUTHORITY_KEYS = Object.freeze([
  "id",
  "authorityClass",
  "sourceKind",
  "sourceRef",
  "scope",
  "judgmentBearing",
  "reviewState",
  "lawIds",
  "caseIds",
  "transitionIds",
  "controlIds",
  "traceIds",
] as const);

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

const INDEPENDENT_HISTORY_ESTIMATE_POLICY = Object.freeze({
  id: "changes.history-retained-byte-estimate",
  version: 1,
  objectBytes: 32,
  arrayBytes: 24,
  arraySlotBytes: 8,
  stringBytes: 16,
  numberBytes: 8,
  booleanBytes: 4,
  nullBytes: 4,
  referenceBytes: 8,
  stringPayload: "utf8",
  sharedIdentityScope: "one-history-entry",
  jsonSerialization: "forbidden",
} as const);

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordsAt(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.filter(isObject) : [];
}

function stringsAt(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function codeUnitCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function stableJson(value: unknown): string {
  if (typeof value === "bigint") {
    return `{"$bigint":${JSON.stringify(value.toString())}}`;
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    return `{"$specialNumber":${JSON.stringify(
      Number.isNaN(value) ? "NaN" : value > 0 ? "Infinity" : "-Infinity",
    )}}`;
  }
  if (value === undefined) return '{"$undefined":true}';
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isObject(value)) {
    return `{${Object.keys(value)
      .sort(codeUnitCompare)
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function utf8Hex(value: unknown): string {
  return [...new TextEncoder().encode(stableJson(value))]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function hasUtf8Bom(bytes: Uint8Array): boolean {
  return bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
}

function jsonDeepEqual(left: unknown, right: unknown): boolean {
  return stableJson(left) === stableJson(right);
}

function addFinding(
  findings: A0U1EditPlanContractFinding[],
  code: string,
  path: string,
  message: string,
): void {
  findings.push(Object.freeze({ code, path, message }));
}

function requireExact(
  actual: unknown,
  expected: unknown,
  code: string,
  path: string,
  message: string,
  findings: A0U1EditPlanContractFinding[],
): void {
  if (!jsonDeepEqual(actual, expected)) {
    addFinding(findings, code, path, message);
  }
}

function hasExactKeys(
  value: unknown,
  keys: readonly string[],
): value is JsonObject {
  return isObject(value) && jsonDeepEqual(Object.keys(value), keys);
}

function indexById(
  records: readonly JsonObject[],
  path: string,
  findings: A0U1EditPlanContractFinding[],
): Map<string, JsonObject> {
  const result = new Map<string, JsonObject>();
  for (const [index, record] of records.entries()) {
    const id = record["id"];
    if (typeof id !== "string" || id.length === 0) {
      addFinding(
        findings,
        "EDIT_PLAN_ID_MISSING",
        `${path}[${String(index)}].id`,
        "Every linked record needs a stable nonempty ID.",
      );
      continue;
    }
    if (result.has(id)) {
      addFinding(
        findings,
        "EDIT_PLAN_ID_DUPLICATE",
        `${path}.${id}`,
        "Linked record IDs must be unique within their ledger.",
      );
    }
    result.set(id, record);
  }
  return result;
}

/** Strict lexical pre-pass; JSON.parse remains the semantic decoder. */
function findDuplicateJsonKeys(source: string): string[] {
  let index = 0;
  const duplicates: string[] = [];
  const skipWhitespace = (): void => {
    while (/\s/u.test(source[index] ?? "")) index += 1;
  };
  const parseString = (): string => {
    const start = index;
    index += 1;
    while (index < source.length) {
      const character = source[index];
      if (character === "\\") {
        index += 2;
        continue;
      }
      index += 1;
      if (character === '"') {
        return JSON.parse(source.slice(start, index)) as string;
      }
    }
    throw new Error("unterminated JSON string");
  };
  const parseValue = (path: string): void => {
    skipWhitespace();
    const character = source[index];
    if (character === "{") {
      index += 1;
      skipWhitespace();
      const keys = new Set<string>();
      if (source[index] === "}") {
        index += 1;
        return;
      }
      while (index < source.length) {
        skipWhitespace();
        if (source[index] !== '"') throw new Error("object key expected");
        const key = parseString();
        const keyPath = `${path}.${key}`;
        if (keys.has(key)) duplicates.push(keyPath);
        keys.add(key);
        skipWhitespace();
        if (source[index] !== ":") throw new Error("colon expected");
        index += 1;
        parseValue(keyPath);
        skipWhitespace();
        if (source[index] === "}") {
          index += 1;
          return;
        }
        if (source[index] !== ",") throw new Error("comma expected");
        index += 1;
      }
      throw new Error("unterminated JSON object");
    }
    if (character === "[") {
      index += 1;
      skipWhitespace();
      if (source[index] === "]") {
        index += 1;
        return;
      }
      let itemIndex = 0;
      while (index < source.length) {
        parseValue(`${path}[${String(itemIndex)}]`);
        itemIndex += 1;
        skipWhitespace();
        if (source[index] === "]") {
          index += 1;
          return;
        }
        if (source[index] !== ",") throw new Error("comma expected");
        index += 1;
      }
      throw new Error("unterminated JSON array");
    }
    if (character === '"') {
      parseString();
      return;
    }
    const tokenStart = index;
    while (index < source.length && !/[\s,\]}]/u.test(source[index] ?? "")) {
      index += 1;
    }
    if (index === tokenStart) throw new Error("JSON value expected");
  };
  parseValue("$");
  skipWhitespace();
  if (index !== source.length) throw new Error("trailing JSON token");
  return duplicates;
}

type LoadedFixture = Readonly<{
  filename: SpecFilename;
  bytes: Uint8Array;
  source: string;
  root: JsonObject;
}>;

async function hydrateCheckedInDocumentLiterals(
  casesRoot: JsonObject,
  findings: A0U1EditPlanContractFinding[],
): Promise<JsonObject> {
  const hydrated = cloneJson(casesRoot);
  const catalog = isObject(hydrated["literalCatalog"])
    ? hydrated["literalCatalog"]
    : {};
  const documents = isObject(catalog["documents"]) ? catalog["documents"] : {};
  const repositoryPath = resolve(REPOSITORY_ROOT);
  for (const [literalId, descriptor] of Object.entries(documents)) {
    if (
      !isObject(descriptor) ||
      descriptor["kind"] !== "checked-in-independent-literal"
    ) {
      continue;
    }
    const path = `edit-plan-cases.json.literalCatalog.documents.${literalId}`;
    checkExactKeys(
      descriptor,
      [
        "kind",
        "path",
        "sha256",
        "jsonPointer",
        "materializeAs",
        "canonicalSha256",
      ],
      "EDIT_PLAN_EXTERNAL_LITERAL_KEYS",
      path,
      findings,
    );
    const relativePath = descriptor["path"];
    if (
      typeof relativePath !== "string" ||
      !relativePath.startsWith("tests/fixtures/")
    ) {
      addFinding(
        findings,
        "EDIT_PLAN_EXTERNAL_LITERAL_PATH",
        `${path}.path`,
        "Checked-in literal paths must remain repository-relative under tests/fixtures.",
      );
      continue;
    }
    const absolutePath = resolve(REPOSITORY_ROOT, relativePath);
    if (!absolutePath.startsWith(`${repositoryPath}/`)) {
      addFinding(
        findings,
        "EDIT_PLAN_EXTERNAL_LITERAL_ESCAPE",
        `${path}.path`,
        "Checked-in literal path may not escape the repository.",
      );
      continue;
    }
    try {
      const bytes = new Uint8Array(await readFile(absolutePath));
      const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (
        hasUtf8Bom(bytes) ||
        source.includes("\r") ||
        !source.endsWith("\n") ||
        source.endsWith("\n\n")
      ) {
        addFinding(
          findings,
          "EDIT_PLAN_EXTERNAL_LITERAL_TEXT_CANONICAL",
          path,
          "External literal must be canonical UTF-8 without BOM/CR and with exactly one final LF.",
        );
      }
      if (sha256(bytes) !== descriptor["sha256"]) {
        addFinding(
          findings,
          "EDIT_PLAN_EXTERNAL_LITERAL_BYTE_DIGEST",
          `${path}.sha256`,
          "External literal bytes differ from the packet's exact SHA-256.",
        );
      }
      if (findDuplicateJsonKeys(source).length > 0) {
        addFinding(
          findings,
          "EDIT_PLAN_EXTERNAL_LITERAL_DUPLICATE_KEY",
          path,
          "External checked-in literals may not contain duplicate JSON keys.",
        );
      }
      const decoded: unknown = JSON.parse(source);
      const pointer = descriptor["jsonPointer"];
      const materialized =
        pointer === ""
          ? decoded
          : typeof pointer === "string"
            ? valueAtPointer(decoded, pointer)
            : undefined;
      if (!isObject(materialized)) {
        throw new Error(
          "external literal pointer did not resolve to an object",
        );
      }
      if (descriptor["materializeAs"] !== "ValidatedDocument") {
        addFinding(
          findings,
          "EDIT_PLAN_EXTERNAL_LITERAL_TYPE",
          `${path}.materializeAs`,
          "Document catalog literals must explicitly materialize as ValidatedDocument.",
        );
      }
      if (sha256(stableJson(materialized)) !== descriptor["canonicalSha256"]) {
        addFinding(
          findings,
          "EDIT_PLAN_EXTERNAL_LITERAL_CANONICAL_DIGEST",
          `${path}.canonicalSha256`,
          "External literal canonical semantics differ from the packet pin.",
        );
      }
      documents[literalId] = materialized;
    } catch (error) {
      addFinding(
        findings,
        "EDIT_PLAN_EXTERNAL_LITERAL_READ",
        path,
        `External checked-in literal could not be hydrated: ${error instanceof Error ? error.message : String(error)}.`,
      );
    }
  }
  return hydrated;
}

function decodePointerToken(token: string): string {
  return token.replaceAll("~1", "/").replaceAll("~0", "~");
}

function pointerTokens(pointer: string): string[] | null {
  if (pointer === "") return [];
  if (!pointer.startsWith("/")) return null;
  return pointer.slice(1).split("/").map(decodePointerToken);
}

function canonicalArrayIndex(
  token: string,
  length: number,
  allowEnd: boolean,
): number | null {
  if (!/^(?:0|[1-9][0-9]*)$/u.test(token)) return null;
  const index = Number(token);
  if (!Number.isSafeInteger(index)) return null;
  const maximum = allowEnd ? length : length - 1;
  return index >= 0 && index <= maximum ? index : null;
}

function valueAtPointer(value: unknown, pointer: string): unknown {
  const tokens = pointerTokens(pointer);
  if (tokens === null) return undefined;
  let cursor: unknown = value;
  for (const token of tokens) {
    if (Array.isArray(cursor)) {
      const index = canonicalArrayIndex(token, cursor.length, false);
      if (index === null) return undefined;
      cursor = cursor[index];
    } else if (isObject(cursor) && Object.hasOwn(cursor, token)) {
      cursor = cursor[token];
    } else {
      return undefined;
    }
  }
  return cursor;
}

function cloneJson<Value>(value: Value): Value {
  return structuredClone(value);
}

function independentHistoryValueBytes(
  value: unknown,
  visited: WeakSet<object>,
): number {
  if (value === null) return INDEPENDENT_HISTORY_ESTIMATE_POLICY.nullBytes;
  switch (typeof value) {
    case "string":
      return (
        INDEPENDENT_HISTORY_ESTIMATE_POLICY.stringBytes +
        new TextEncoder().encode(value).byteLength
      );
    case "number":
      return INDEPENDENT_HISTORY_ESTIMATE_POLICY.numberBytes;
    case "boolean":
      return INDEPENDENT_HISTORY_ESTIMATE_POLICY.booleanBytes;
    case "object":
      break;
    case "bigint":
    case "symbol":
    case "undefined":
    case "function":
      return Number.NaN;
  }
  if (visited.has(value)) {
    return INDEPENDENT_HISTORY_ESTIMATE_POLICY.referenceBytes;
  }
  visited.add(value);
  if (Array.isArray(value)) {
    let bytes =
      INDEPENDENT_HISTORY_ESTIMATE_POLICY.arrayBytes +
      value.length * INDEPENDENT_HISTORY_ESTIMATE_POLICY.arraySlotBytes;
    for (const childValue of value) {
      const childBytes = independentHistoryValueBytes(childValue, visited);
      if (!Number.isSafeInteger(childBytes)) return Number.NaN;
      bytes += childBytes;
      if (!Number.isSafeInteger(bytes)) return Number.NaN;
    }
    return bytes;
  }
  let bytes = INDEPENDENT_HISTORY_ESTIMATE_POLICY.objectBytes;
  for (const key of Object.keys(value).sort(codeUnitCompare)) {
    const keyBytes =
      INDEPENDENT_HISTORY_ESTIMATE_POLICY.stringBytes +
      new TextEncoder().encode(key).byteLength;
    const childBytes = independentHistoryValueBytes(value[key], visited);
    if (!Number.isSafeInteger(childBytes)) return Number.NaN;
    bytes += keyBytes + childBytes;
    if (!Number.isSafeInteger(bytes)) return Number.NaN;
  }
  return bytes;
}

function independentHistoryEntryBytes(entry: JsonObject): number {
  const withoutEstimate = objectProjection(
    entry,
    new Set(["retainedBytesEstimate"]),
  );
  return independentHistoryValueBytes(withoutEstimate, new WeakSet<object>());
}

function isAbsentMarker(value: unknown): boolean {
  return hasExactKeys(value, ["$absent"]) && value["$absent"] === true;
}

function setAtPointer(
  root: unknown,
  pointer: string,
  operation: string,
  from: unknown,
  to: unknown,
): unknown {
  const tokens = pointerTokens(pointer);
  if (tokens === null) throw new Error("patch pointer is not RFC 6901");
  if (tokens.length === 0) {
    if (
      isAbsentMarker(from) ? root !== undefined : !jsonDeepEqual(root, from)
    ) {
      throw new Error("root patch from mismatch");
    }
    if (operation === "assert") {
      if (!jsonDeepEqual(to, from)) {
        throw new Error("assert patch must preserve the asserted root");
      }
      return root;
    }
    if (operation === "remove") return undefined;
    return cloneJson(to);
  }
  const next = cloneJson(root);
  let cursor: unknown = next;
  for (const token of tokens.slice(0, -1)) {
    if (Array.isArray(cursor)) {
      const index = canonicalArrayIndex(token, cursor.length, false);
      if (index === null) throw new Error("patch array parent is noncanonical");
      cursor = cursor[index];
    }
    else if (isObject(cursor)) cursor = cursor[token];
    else throw new Error("patch parent missing");
  }
  const finalToken = tokens[tokens.length - 1] as string;
  const arrayIndex = Array.isArray(cursor)
    ? canonicalArrayIndex(
        finalToken,
        cursor.length,
        operation === "add",
      )
    : null;
  if (Array.isArray(cursor) && arrayIndex === null) {
    throw new Error("patch array index is noncanonical or out of range");
  }
  const current = Array.isArray(cursor)
    ? cursor[arrayIndex as number]
    : isObject(cursor)
      ? cursor[finalToken]
      : undefined;
  if (
    isAbsentMarker(from) ? current !== undefined : !jsonDeepEqual(current, from)
  ) {
    throw new Error("patch from mismatch");
  }
  if (operation === "assert") {
    if (!jsonDeepEqual(to, from)) {
      throw new Error("assert patch must preserve the asserted value");
    }
    return next;
  }
  if (Array.isArray(cursor)) {
    const itemIndex = arrayIndex as number;
    if (operation === "remove") cursor.splice(itemIndex, 1);
    else if (operation === "add") cursor.splice(itemIndex, 0, cloneJson(to));
    else cursor[itemIndex] = cloneJson(to);
    return next;
  }
  if (!isObject(cursor)) throw new Error("patch target missing");
  if (operation === "remove") Reflect.deleteProperty(cursor, finalToken);
  else cursor[finalToken] = cloneJson(to);
  return next;
}

function resolveCatalogRef(ref: string, catalog: JsonObject): unknown {
  const hashParts = ref.split("#");
  if (hashParts.length > 2) return undefined;
  const catalogPath = hashParts[0] ?? "";
  const pointer = hashParts[1] ?? "";
  const normalized = catalogPath.replace(/^\/?/u, "");
  const slashParts = normalized.split("/").filter((part) => part.length > 0);
  const dotParts = normalized.split(".").filter((part) => part.length > 0);
  const parts = slashParts.length >= 2 ? slashParts : dotParts;
  if (parts[0] === "literalCatalog") parts.shift();
  if (parts.length < 2) return undefined;
  let cursor: unknown = catalog;
  for (const part of parts) {
    if (!isObject(cursor) || !Object.hasOwn(cursor, part)) return undefined;
    cursor = cursor[part];
  }
  return pointer.length === 0 ? cursor : valueAtPointer(cursor, pointer);
}

function materializeLiteral(
  value: unknown,
  catalog: JsonObject,
  visiting: ReadonlySet<string> = new Set(),
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => materializeLiteral(item, catalog, visiting));
  }
  if (!isObject(value)) return value;
  if (Object.hasOwn(value, "$literalRef")) {
    if (!hasExactKeys(value, ["$literalRef", "patches"])) {
      throw new Error("literal reference has extra or missing keys");
    }
    const ref = value["$literalRef"];
    const patches = value["patches"];
    if (typeof ref !== "string" || !Array.isArray(patches)) {
      throw new Error("literal reference is malformed");
    }
    if (visiting.has(ref)) throw new Error("literal reference cycle");
    const referenced = resolveCatalogRef(ref, catalog);
    if (referenced === undefined) throw new Error(`missing literal ${ref}`);
    const nextVisiting = new Set(visiting);
    nextVisiting.add(ref);
    let materialized = materializeLiteral(referenced, catalog, nextVisiting);
    for (const patch of patches) {
      if (
        !hasExactKeys(patch, ["op", "jsonPointer", "from", "to"]) ||
        !["replace", "add", "remove", "assert"].includes(String(patch["op"])) ||
        typeof patch["jsonPointer"] !== "string"
      ) {
        throw new Error("literal patch is malformed");
      }
      materialized = setAtPointer(
        materialized,
        patch["jsonPointer"],
        String(patch["op"]),
        materializeLiteral(patch["from"], catalog, nextVisiting),
        materializeLiteral(patch["to"], catalog, nextVisiting),
      );
    }
    return materialized;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      materializeLiteral(child, catalog, visiting),
    ]),
  );
}

function checkExactKeys(
  value: unknown,
  keys: readonly string[],
  code: string,
  path: string,
  findings: A0U1EditPlanContractFinding[],
): void {
  if (!hasExactKeys(value, keys)) {
    addFinding(
      findings,
      code,
      path,
      `Expected exact ordered keys ${keys.join(", ")}.`,
    );
  }
}

function checkReferenceIds(
  ids: unknown,
  target: ReadonlyMap<string, unknown>,
  code: string,
  path: string,
  findings: A0U1EditPlanContractFinding[],
  requireNonempty = true,
): void {
  if (!Array.isArray(ids) || (requireNonempty && ids.length === 0)) {
    addFinding(findings, code, path, "Expected a nonempty reference array.");
    return;
  }
  if (!ids.every((id) => typeof id === "string")) {
    addFinding(findings, code, path, "Reference IDs must all be strings.");
    return;
  }
  if (new Set(ids).size !== ids.length) {
    addFinding(findings, code, path, "Reference IDs must be duplicate-free.");
  }
  for (const id of ids) {
    if (!target.has(id as string)) {
      addFinding(
        findings,
        code,
        `${path}.${String(id)}`,
        "Referenced ID is missing from its authority ledger.",
      );
    }
  }
}

function recursiveForbiddenKeys(
  value: unknown,
  forbidden: ReadonlySet<string>,
  path = "$",
): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      recursiveForbiddenKeys(item, forbidden, `${path}[${String(index)}]`),
    );
  }
  if (!isObject(value)) return [];
  const findings: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (forbidden.has(key)) findings.push(childPath);
    findings.push(...recursiveForbiddenKeys(child, forbidden, childPath));
  }
  return findings;
}

function encodePointerToken(token: string): string {
  return token.replaceAll("~", "~0").replaceAll("/", "~1");
}

type LiteralDeltaEntry = Readonly<{
  jsonPointer: string;
  before: unknown;
  after: unknown;
}>;

/**
 * Independent structural delta: objects and equal-length arrays recurse;
 * additions/removals and length-changing arrays remain one literal subtree.
 */
function computeRecursiveLiteralDelta(
  before: unknown,
  after: unknown,
  path = "",
): LiteralDeltaEntry[] {
  if (jsonDeepEqual(before, after)) return [];
  if (isObject(before) && isObject(after)) {
    const keys = [
      ...new Set([...Object.keys(before), ...Object.keys(after)]),
    ].sort(codeUnitCompare);
    return keys.flatMap((key) => {
      const childPath = `${path}/${encodePointerToken(key)}`;
      const beforePresent = Object.hasOwn(before, key);
      const afterPresent = Object.hasOwn(after, key);
      if (!beforePresent || !afterPresent) {
        return [
          Object.freeze({
            jsonPointer: childPath,
            before: beforePresent ? before[key] : { $absent: true },
            after: afterPresent ? after[key] : { $absent: true },
          }),
        ];
      }
      return computeRecursiveLiteralDelta(before[key], after[key], childPath);
    });
  }
  if (
    Array.isArray(before) &&
    Array.isArray(after) &&
    before.length === after.length
  ) {
    return before.flatMap((item, index) =>
      computeRecursiveLiteralDelta(
        item,
        after[index],
        `${path}/${String(index)}`,
      ),
    );
  }
  return [Object.freeze({ jsonPointer: path, before, after })];
}

type ExactRational = Readonly<{ numerator: bigint; denominator: bigint }>;

function bigintGcd(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a === 0n ? 1n : a;
}

function normalizeRational(
  numerator: bigint,
  denominator: bigint,
): ExactRational | null {
  if (denominator === 0n) return null;
  const sign = denominator < 0n ? -1n : 1n;
  const gcd = bigintGcd(numerator, denominator);
  return Object.freeze({
    numerator: (sign * numerator) / gcd,
    denominator: (sign * denominator) / gcd,
  });
}

function addRationals(
  left: ExactRational,
  right: ExactRational,
): ExactRational {
  return normalizeRational(
    left.numerator * right.denominator + right.numerator * left.denominator,
    left.denominator * right.denominator,
  ) as ExactRational;
}

function subtractRationals(
  left: ExactRational,
  right: ExactRational,
): ExactRational {
  return addRationals(
    left,
    Object.freeze({
      numerator: -right.numerator,
      denominator: right.denominator,
    }),
  );
}

function durationRational(value: unknown): ExactRational | null {
  if (!isObject(value)) return null;
  const numerator = value["numerator"];
  const denominator = value["denominator"];
  if (
    typeof numerator !== "number" ||
    !Number.isSafeInteger(numerator) ||
    typeof denominator !== "number" ||
    !Number.isSafeInteger(denominator) ||
    denominator === 0
  ) {
    return null;
  }
  return normalizeRational(BigInt(numerator), BigInt(denominator));
}

function rationalText(value: ExactRational): string {
  return `${String(value.numerator)}/${String(value.denominator)}`;
}

function isUnicodeScalarString(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function codePointLength(value: string): number {
  return Array.from(value).length;
}

function isBoundedToken(value: unknown, maximum: number): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    isUnicodeScalarString(value) &&
    codePointLength(value) <= maximum
  );
}

const stableIdPattern = new RegExp(STABLE_ID_PATTERN_SOURCE, "u");

function isStableId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= STABLE_ID_MAX_ASCII_LENGTH &&
    stableIdPattern.test(value)
  );
}

function isNonnegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isCanonicalPositiveDuration(value: unknown): boolean {
  if (!isObject(value)) return false;
  const numerator = value["numerator"];
  const denominator = value["denominator"];
  if (
    !isPositiveSafeInteger(numerator) ||
    numerator > MAX_NORMALIZED_BEAT_NUMERATOR ||
    !isPositiveSafeInteger(denominator) ||
    !ALLOWED_BEAT_DENOMINATORS.includes(denominator as never)
  ) {
    return false;
  }
  return bigintGcd(BigInt(numerator), BigInt(denominator)) === 1n;
}

function isValidSourceRange(value: unknown, sourceLength: number): boolean {
  if (!hasExactKeys(value, ["start", "end"])) return false;
  const start = value["start"];
  const end = value["end"];
  return (
    isNonnegativeSafeInteger(start) &&
    isNonnegativeSafeInteger(end) &&
    start <= end &&
    end <= sourceLength
  );
}

function documentSections(document: unknown): JsonObject[] {
  return isObject(document) ? recordsAt(document["sections"]) : [];
}

function sectionMeasures(section: unknown): JsonObject[] {
  return isObject(section) ? recordsAt(section["measures"]) : [];
}

function measureEvents(measure: unknown): JsonObject[] {
  return isObject(measure) ? recordsAt(measure["events"]) : [];
}

function documentEventOrder(document: unknown): string[] {
  return documentSections(document).flatMap((section) =>
    sectionMeasures(section).flatMap((measure) =>
      measureEvents(measure).map((event) => String(event["id"])),
    ),
  );
}

function documentSectionOrder(document: unknown): string[] {
  return documentSections(document).map((section) => String(section["id"]));
}

function documentMeasureOrder(document: unknown): string[] {
  return documentSections(document).flatMap((section) =>
    sectionMeasures(section).map((measure) => String(measure["id"])),
  );
}

function findEventLocation(
  document: unknown,
  eventId: unknown,
): Readonly<{
  section: JsonObject;
  measure: JsonObject;
  event: JsonObject;
  eventIndex: number;
}> | null {
  for (const section of documentSections(document)) {
    for (const measure of sectionMeasures(section)) {
      const events = measureEvents(measure);
      const eventIndex = events.findIndex((event) => event["id"] === eventId);
      if (eventIndex >= 0) {
        return {
          section,
          measure,
          event: events[eventIndex] as JsonObject,
          eventIndex,
        };
      }
    }
  }
  return null;
}

function findSectionLocation(
  document: unknown,
  sectionId: unknown,
): Readonly<{ section: JsonObject; index: number }> | null {
  const sections = documentSections(document);
  const index = sections.findIndex((section) => section["id"] === sectionId);
  return index < 0 ? null : { section: sections[index] as JsonObject, index };
}

function objectProjection(
  value: JsonObject,
  omitted: ReadonlySet<string>,
): JsonObject {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !omitted.has(key)),
  );
}

function sectionMetadataProjection(section: JsonObject): JsonObject {
  return Object.fromEntries(
    ["name", "annotation", "keyOverride", "voiceLeadingBoundary"].map((key) => [
      key,
      section[key],
    ]),
  );
}

function requireOperationLaw(
  condition: boolean,
  code: string,
  path: string,
  message: string,
  findings: A0U1EditPlanContractFinding[],
): void {
  if (!condition) addFinding(findings, code, path, message);
}

type CandidateOracleResult = Readonly<{
  document: JsonObject;
  allocatedIdentities: readonly JsonObject[];
  removedIdentities: readonly JsonObject[];
}>;

function mutableSections(document: JsonObject): JsonObject[] {
  return Array.isArray(document["sections"])
    ? (document["sections"] as JsonObject[])
    : [];
}

function mutableMeasure(
  document: JsonObject,
  measureId: unknown,
): JsonObject | null {
  for (const section of mutableSections(document)) {
    const measures = Array.isArray(section["measures"])
      ? (section["measures"] as JsonObject[])
      : [];
    const measure = measures.find((item) => item["id"] === measureId);
    if (measure !== undefined) return measure;
  }
  return null;
}

function applyCompletionDeclarationsToCandidate(
  document: JsonObject,
  declarations: unknown,
): boolean {
  if (!Array.isArray(declarations)) return false;
  for (const declaration of declarations) {
    if (!isObject(declaration)) return false;
    const measure = mutableMeasure(document, declaration["measureId"]);
    if (measure === null) return false;
    measure["completion"] = cloneJson(declaration["completion"]);
  }
  return true;
}

function eventFromParserRow(
  row: JsonObject,
  id: string,
  callerDuration: unknown,
): JsonObject | null {
  const duration = isObject(row["duration"]) ? row["duration"] : null;
  const selectedDuration =
    duration?.["kind"] === "resolved"
      ? duration["value"]
      : duration?.["kind"] === "requires-caller"
        ? callerDuration
        : null;
  if (!isCanonicalPositiveDuration(selectedDuration)) return null;
  return {
    id,
    duration: cloneJson(selectedDuration),
    annotation: cloneJson(row["annotation"]),
    chord: cloneJson(row["chord"]),
    voicing: cloneJson(A0_U1_NEW_EVENT_AUTO_VOICING),
  };
}

function buildCandidateOracle(
  beforeDocument: unknown,
  command: JsonObject,
  parserEvidence: ParserEvidenceView | null,
  allocationTrace: unknown,
): CandidateOracleResult | null {
  if (!isObject(beforeDocument)) return null;
  const plan = isObject(command["plan"]) ? command["plan"] : null;
  if (plan === null) return null;
  const document = cloneJson(beforeDocument);
  const trace = recordsAt(allocationTrace);
  let allocationIndex = 0;
  const allocatedIdentities: JsonObject[] = [];
  const removedIdentities: JsonObject[] = [];
  const allocate = (
    kind: "section" | "measure" | "event",
    source: JsonObject,
  ): string | null => {
    const row = trace[allocationIndex];
    if (
      row === undefined ||
      row["ordinal"] !== allocationIndex ||
      row["kind"] !== kind ||
      row["outcome"] !== "accepted" ||
      !isStableId(row["allocatedId"])
    ) {
      return null;
    }
    allocationIndex += 1;
    allocatedIdentities.push({
      kind,
      id: row["allocatedId"],
      source: cloneJson(source),
    });
    return row["allocatedId"];
  };

  if (plan["kind"] === "insert-fragment") {
    if (parserEvidence === null) return null;
    const source = isObject(plan["source"]) ? plan["source"] : null;
    const placement = isObject(plan["placement"]) ? plan["placement"] : null;
    if (source === null || placement === null) return null;
    const buildEvent = (row: JsonObject): JsonObject | null => {
      const eventId = allocate("event", {
        kind:
          source["kind"] === "recovered-chord"
            ? "recovered-chord"
            : "fragment-event",
        ...(source["kind"] === "recovered-chord"
          ? { selectedGlobalOrdinal: row["globalOrdinal"] }
          : { sourceEventOrdinal: row["globalOrdinal"] }),
      });
      return eventId === null
        ? null
        : eventFromParserRow(row, eventId, source["callerDuration"]);
    };
    if (source["kind"] === "recovered-chord") {
      const selected = parserEvidence.insertableRows.find(
        (row) => row["globalOrdinal"] === source["selectedGlobalOrdinal"],
      );
      if (selected === undefined || placement["kind"] !== "into-measure") {
        return null;
      }
      const event = buildEvent(selected);
      const target = mutableMeasure(document, placement["measureId"]);
      if (event === null || target === null || !Array.isArray(target["events"])) {
        return null;
      }
      const beforeId = placement["beforeEventId"];
      const insertionIndex =
        beforeId === null
          ? target["events"].length
          : target["events"].findIndex(
              (item) => isObject(item) && item["id"] === beforeId,
            );
      if (insertionIndex < 0) return null;
      target["events"].splice(insertionIndex, 0, event);
    } else if (source["kind"] === "complete-draft") {
      if (parserEvidence.outcome !== "success") return null;
      const rowsForMeasure = (
        sectionOrdinal: unknown,
        measureOrdinal: unknown,
      ): readonly JsonObject[] =>
        parserEvidence.insertableRows.filter(
          (row) =>
            row["sourceSectionOrdinal"] === sectionOrdinal &&
            row["sourceMeasureOrdinal"] === measureOrdinal,
        );
      const buildMeasure = (row: JsonObject): JsonObject | null => {
        const measureId = allocate("measure", {
          kind: "fragment-measure",
          sourceSectionOrdinal: row["sourceSectionOrdinal"],
          sourceMeasureOrdinal: row["sourceMeasureOrdinal"],
        });
        if (measureId === null) return null;
        const events: JsonObject[] = [];
        for (const eventRow of rowsForMeasure(
          row["sourceSectionOrdinal"],
          row["sourceMeasureOrdinal"],
        )) {
          const event = buildEvent(eventRow);
          if (event === null) return null;
          events.push(event);
        }
        return {
          id: measureId,
          events,
          completion: cloneJson(row["completion"]),
        };
      };
      if (placement["kind"] === "into-measure") {
        if (
          parserEvidence.sectionRows.length !== 1 ||
          parserEvidence.measureRows.length !== 1
        ) {
          return null;
        }
        const target = mutableMeasure(document, placement["measureId"]);
        if (target === null || !Array.isArray(target["events"])) return null;
        const newEvents: JsonObject[] = [];
        for (const row of parserEvidence.insertableRows) {
          const event = buildEvent(row);
          if (event === null) return null;
          newEvents.push(event);
        }
        const beforeId = placement["beforeEventId"];
        const insertionIndex =
          beforeId === null
            ? target["events"].length
            : target["events"].findIndex(
                (item) => isObject(item) && item["id"] === beforeId,
              );
        if (insertionIndex < 0) return null;
        target["events"].splice(insertionIndex, 0, ...newEvents);
      } else if (placement["kind"] === "into-section") {
        if (parserEvidence.sectionRows.length !== 1) return null;
        const targetLocation = findSectionLocation(
          document,
          placement["sectionId"],
        );
        if (targetLocation === null) return null;
        const targetMeasures = mutableSections(document)[
          targetLocation.index
        ]?.["measures"];
        if (!Array.isArray(targetMeasures)) return null;
        const newMeasures: JsonObject[] = [];
        for (const row of parserEvidence.measureRows) {
          const measure = buildMeasure(row);
          if (measure === null) return null;
          newMeasures.push(measure);
        }
        const beforeId = placement["beforeMeasureId"];
        const insertionIndex =
          beforeId === null
            ? targetMeasures.length
            : targetMeasures.findIndex(
                (item) => isObject(item) && item["id"] === beforeId,
              );
        if (insertionIndex < 0) return null;
        targetMeasures.splice(insertionIndex, 0, ...newMeasures);
      } else if (placement["kind"] === "into-document") {
        const declarations = recordsAt(placement["sectionDeclarations"]);
        const newSections: JsonObject[] = [];
        for (const sectionRow of parserEvidence.sectionRows) {
          const sourceSectionOrdinal = sectionRow["sourceSectionOrdinal"];
          const declaration = declarations.find(
            (row) => row["sourceSectionOrdinal"] === sourceSectionOrdinal,
          );
          const sectionId = allocate("section", {
            kind: "fragment-section",
            sourceSectionOrdinal,
          });
          if (
            sectionId === null ||
            declaration === undefined ||
            typeof sectionRow["name"] !== "string"
          ) {
            return null;
          }
          const measures: JsonObject[] = [];
          for (const measureRow of parserEvidence.measureRows.filter(
            (row) => row["sourceSectionOrdinal"] === sourceSectionOrdinal,
          )) {
            const measure = buildMeasure(measureRow);
            if (measure === null) return null;
            measures.push(measure);
          }
          newSections.push({
            id: sectionId,
            name: sectionRow["name"],
            annotation: sectionRow["annotation"],
            keyOverride: null,
            voiceLeadingBoundary: declaration["voiceLeadingBoundary"],
            measures,
          });
        }
        const sections = mutableSections(document);
        const beforeId = placement["beforeSectionId"];
        const insertionIndex =
          beforeId === null
            ? sections.length
            : sections.findIndex((section) => section["id"] === beforeId);
        if (insertionIndex < 0) return null;
        sections.splice(insertionIndex, 0, ...newSections);
      } else {
        return null;
      }
    } else {
      return null;
    }
    if (
      !applyCompletionDeclarationsToCandidate(
        document,
        placement["completionDeclarations"],
      )
    ) {
      return null;
    }
  } else if (plan["kind"] === "split-event-duration") {
    const source = findEventLocation(document, plan["eventId"]);
    const eventId = allocate("event", {
      kind: "split-event-second",
      sourceEventId: plan["eventId"],
    });
    if (source === null || eventId === null) return null;
    const events = source.measure["events"];
    if (!Array.isArray(events)) return null;
    source.event["duration"] = cloneJson(plan["firstDuration"]);
    const second = cloneJson(source.event);
    second["id"] = eventId;
    second["duration"] = cloneJson(plan["secondDuration"]);
    second["annotation"] = "";
    events.splice(source.eventIndex + 1, 0, second);
    if (
      !applyCompletionDeclarationsToCandidate(
        document,
        plan["completionDeclarations"],
      )
    ) {
      return null;
    }
  } else if (plan["kind"] === "join-event-durations") {
    const left = findEventLocation(document, plan["leftEventId"]);
    const right = findEventLocation(document, plan["rightEventId"]);
    if (
      left === null ||
      right === null ||
      left.measure !== right.measure ||
      right.eventIndex !== left.eventIndex + 1 ||
      !Array.isArray(left.measure["events"])
    ) {
      return null;
    }
    left.event["duration"] = cloneJson(plan["joinedDuration"]);
    left.measure["events"].splice(right.eventIndex, 1);
    removedIdentities.push({ kind: "event", id: plan["rightEventId"] });
    if (
      !applyCompletionDeclarationsToCandidate(
        document,
        plan["completionDeclarations"],
      )
    ) {
      return null;
    }
  } else if (plan["kind"] === "split-section") {
    const source = findSectionLocation(document, plan["sectionId"]);
    const sectionId = allocate("section", {
      kind: "split-section-suffix",
      sourceSectionId: plan["sectionId"],
    });
    if (source === null || sectionId === null) return null;
    const sections = mutableSections(document);
    const retained = sections[source.index];
    if (retained === undefined || !Array.isArray(retained["measures"])) {
      return null;
    }
    const splitIndex = retained["measures"].findIndex(
      (measure) =>
        isObject(measure) && measure["id"] === plan["beforeMeasureId"],
    );
    if (splitIndex <= 0 || splitIndex >= retained["measures"].length) {
      return null;
    }
    const suffixMeasures = retained["measures"].splice(splitIndex);
    const metadata = isObject(plan["newSectionMetadata"])
      ? plan["newSectionMetadata"]
      : {};
    sections.splice(source.index + 1, 0, {
      id: sectionId,
      ...cloneJson(metadata),
      measures: suffixMeasures,
    });
  } else if (plan["kind"] === "join-sections") {
    const left = findSectionLocation(document, plan["leftSectionId"]);
    const right = findSectionLocation(document, plan["rightSectionId"]);
    if (
      left === null ||
      right === null ||
      right.index !== left.index + 1
    ) {
      return null;
    }
    const sections = mutableSections(document);
    const leftSection = sections[left.index];
    const rightSection = sections[right.index];
    if (
      leftSection === undefined ||
      rightSection === undefined ||
      !Array.isArray(leftSection["measures"]) ||
      !Array.isArray(rightSection["measures"])
    ) {
      return null;
    }
    for (const [key, value] of Object.entries(
      isObject(plan["resultMetadata"]) ? plan["resultMetadata"] : {},
    )) {
      leftSection[key] = cloneJson(value);
    }
    leftSection["measures"].push(...rightSection["measures"]);
    sections.splice(right.index, 1);
    removedIdentities.push({ kind: "section", id: plan["rightSectionId"] });
  } else {
    return null;
  }
  if (allocationIndex !== trace.length) return null;
  return { document, allocatedIdentities, removedIdentities };
}

function validateExactCandidateTransform(
  before: JsonObject,
  after: JsonObject,
  command: JsonObject,
  result: JsonObject,
  parserEvidence: ParserEvidenceView | null,
  allocationTrace: unknown,
  path: string,
  findings: A0U1EditPlanContractFinding[],
): CandidateOracleResult | null {
  const candidate = buildCandidateOracle(
    before["document"],
    command,
    parserEvidence,
    allocationTrace,
  );
  if (candidate === null) {
    addFinding(
      findings,
      "EDIT_PLAN_CANDIDATE_ORACLE_UNAVAILABLE",
      path,
      "A successful apply transition must be independently reconstructible from before state, command, parser evidence, and ordered allocation outputs.",
    );
    return null;
  }
  requireExact(
    after["document"],
    candidate.document,
    "EDIT_PLAN_WHOLE_DOCUMENT_TRANSFORM",
    `${path}.afterState.document`,
    "The complete after document must equal one independently reconstructed operation transform; all unaffected data stays exact.",
    findings,
  );
  const receipt = isObject(result["editPlanReceipt"])
    ? result["editPlanReceipt"]
    : {};
  requireExact(
    receipt["allocatedIdentities"],
    candidate.allocatedIdentities,
    "EDIT_PLAN_ALLOCATION_PROVENANCE",
    `${path}.result.editPlanReceipt.allocatedIdentities`,
    "Receipt allocations must exactly match source-derived structural preorder, provenance, cardinality, and factory outputs.",
    findings,
  );
  requireExact(
    receipt["removedIdentities"],
    candidate.removedIdentities,
    "EDIT_PLAN_REMOVAL_PROVENANCE",
    `${path}.result.editPlanReceipt.removedIdentities`,
    "Receipt removals must exactly match the one operation transform in source order.",
    findings,
  );
  return candidate;
}

function boundaryToFocusTarget(boundary: unknown): JsonObject | null {
  if (!isObject(boundary)) return null;
  switch (boundary["kind"]) {
    case "before-event":
    case "after-event":
      return { kind: "event", eventId: boundary["eventId"] };
    case "before-measure":
    case "after-measure":
    case "measure-start":
    case "measure-end":
      return { kind: "measure", measureId: boundary["measureId"] };
    case "before-section":
    case "after-section":
    case "section-start":
    case "section-end":
      return { kind: "section", sectionId: boundary["sectionId"] };
    case "document-start":
    case "document-end":
      return { kind: "chart" };
    default:
      return null;
  }
}

function rewriteBoundaryExact(
  boundary: unknown,
  from: JsonObject,
  to: JsonObject,
): unknown {
  return jsonDeepEqual(boundary, from) ? cloneJson(to) : cloneJson(boundary);
}

function deduplicateInDocumentOrder(
  ids: readonly unknown[],
  document: unknown,
): string[] {
  const requested = new Set(ids.filter((id): id is string => typeof id === "string"));
  return documentEventOrder(document).filter((id) => requested.has(id));
}

function validateBookmarkOracle(
  before: JsonObject,
  after: JsonObject,
  command: JsonObject,
  result: JsonObject,
  candidate: CandidateOracleResult,
  path: string,
  findings: A0U1EditPlanContractFinding[],
): void {
  const plan = isObject(command["plan"]) ? command["plan"] : {};
  const beforeBookmarks = isObject(before["bookmarks"])
    ? before["bookmarks"]
    : {};
  const expectedBookmarks = cloneJson(beforeBookmarks);
  const receipt = isObject(result["editPlanReceipt"])
    ? result["editPlanReceipt"]
    : {};
  const actualBookmarkReceipt = isObject(receipt["bookmarks"])
    ? receipt["bookmarks"]
    : {};
  const selectionReplacements: JsonObject[] = [];
  let insertionRewrite: JsonObject | null = null;
  const rangeBoundaryRewrites: JsonObject[] = [];
  let rangeCleared = false;
  let selectionPolicy:
    | "preserve-existing"
    | "replace-removed-right-with-left-and-deduplicate" = "preserve-existing";
  let insertionPolicy:
    | "preserve-or-repair"
    | "move-after-last-inserted"
    | "rewrite-exact-span-end" = "preserve-or-repair";
  let rangePolicy:
    | "preserve-or-repair"
    | "rewrite-representable-boundaries"
    | "clear-unrepresentable-internal-event-boundary" =
    "preserve-or-repair";
  let focusPolicy:
    | "preserve-stable-target"
    | "focus-inserted-material-when-no-stable-target"
    | "replace-removed-right-with-left" = "preserve-stable-target";
  let focusTarget: JsonObject | null = null;
  let focusReason: "command" | "delete-repair" = "command";

  const rewriteInsertion = (from: JsonObject, to: JsonObject): void => {
    if (jsonDeepEqual(expectedBookmarks["insertion"], from)) {
      expectedBookmarks["insertion"] = cloneJson(to);
      insertionRewrite = { from: cloneJson(from), to: cloneJson(to) };
    }
  };
  const rewriteRange = (from: JsonObject, to: JsonObject): void => {
    if (!isObject(expectedBookmarks["range"])) return;
    for (const endpoint of ["anchor", "focus"] as const) {
      if (jsonDeepEqual(expectedBookmarks["range"][endpoint], from)) {
        expectedBookmarks["range"][endpoint] = cloneJson(to);
        if (
          !rangeBoundaryRewrites.some(
            (row) =>
              jsonDeepEqual(row["from"], from) &&
              jsonDeepEqual(row["to"], to),
          )
        ) {
          rangeBoundaryRewrites.push({
            from: cloneJson(from),
            to: cloneJson(to),
          });
        }
      }
    }
  };

  if (plan["kind"] === "insert-fragment") {
    insertionPolicy = "move-after-last-inserted";
    const last = candidate.allocatedIdentities.at(-1);
    let target: JsonObject | null = null;
    if (isObject(plan["placement"]) && last !== undefined) {
      if (plan["placement"]["kind"] === "into-measure") {
        const event = [...candidate.allocatedIdentities]
          .reverse()
          .find((row) => row["kind"] === "event");
        if (event !== undefined) {
          target = { kind: "after-event", eventId: event["id"] };
        }
      } else if (plan["placement"]["kind"] === "into-section") {
        const measure = [...candidate.allocatedIdentities]
          .reverse()
          .find((row) => row["kind"] === "measure");
        if (measure !== undefined) {
          target = { kind: "after-measure", measureId: measure["id"] };
        }
      } else if (plan["placement"]["kind"] === "into-document") {
        const section = [...candidate.allocatedIdentities]
          .reverse()
          .find((row) => row["kind"] === "section");
        if (section !== undefined) {
          target = { kind: "after-section", sectionId: section["id"] };
        }
      }
    }
    if (target !== null) {
      if (isObject(beforeBookmarks["insertion"])) {
        insertionRewrite = {
          from: cloneJson(beforeBookmarks["insertion"]),
          to: cloneJson(target),
        };
      }
      expectedBookmarks["insertion"] = cloneJson(target);
    }
    const source = isObject(plan["source"]) ? plan["source"] : {};
    const snapshot = isObject(source["quickEntrySnapshot"])
      ? source["quickEntrySnapshot"]
      : {};
    focusTarget = boundaryToFocusTarget(snapshot["target"]);
    focusPolicy =
      focusTarget === null
        ? "focus-inserted-material-when-no-stable-target"
        : "preserve-stable-target";
    if (focusTarget === null && last !== undefined) {
      focusTarget =
        last["kind"] === "event"
          ? { kind: "event", eventId: last["id"] }
          : last["kind"] === "measure"
            ? { kind: "measure", measureId: last["id"] }
            : { kind: "section", sectionId: last["id"] };
    }
  } else if (plan["kind"] === "split-event-duration") {
    const fresh = candidate.allocatedIdentities.find(
      (row) => row["kind"] === "event",
    );
    if (fresh !== undefined) {
      const from = { kind: "after-event", eventId: plan["eventId"] };
      const to = { kind: "after-event", eventId: fresh["id"] };
      rewriteInsertion(from, to);
      rewriteRange(from, to);
    }
    focusTarget = { kind: "event", eventId: plan["eventId"] };
  } else if (plan["kind"] === "join-event-durations") {
    selectionPolicy = "replace-removed-right-with-left-and-deduplicate";
    insertionPolicy = "rewrite-exact-span-end";
    rangePolicy = "rewrite-representable-boundaries";
    focusPolicy = "replace-removed-right-with-left";
    focusReason = "delete-repair";
    selectionReplacements.push({
      fromEventId: plan["rightEventId"],
      toEventId: plan["leftEventId"],
    });
    const selection = isObject(expectedBookmarks["selection"])
      ? expectedBookmarks["selection"]
      : {};
    if (selection["kind"] === "events" && Array.isArray(selection["eventIds"])) {
      const replace = (id: unknown): unknown =>
        id === plan["rightEventId"] ? plan["leftEventId"] : id;
      const eventIds = deduplicateInDocumentOrder(
        selection["eventIds"].map(replace),
        after["document"],
      );
      expectedBookmarks["selection"] = {
        kind: eventIds.length === 0 ? "none" : "events",
        ...(eventIds.length === 0
          ? {}
          : {
              eventIds,
              anchorEventId: replace(selection["anchorEventId"]),
              focusEventId: replace(selection["focusEventId"]),
            }),
      };
    }
    const rightEnd = {
      kind: "after-event",
      eventId: plan["rightEventId"],
    };
    const joinedEnd = {
      kind: "after-event",
      eventId: plan["leftEventId"],
    };
    rewriteInsertion(rightEnd, joinedEnd);
    const internalBeforeRight = {
      kind: "before-event",
      eventId: plan["rightEventId"],
    };
    const internalAfterLeft = {
      kind: "after-event",
      eventId: plan["leftEventId"],
    };
    const range = isObject(expectedBookmarks["range"])
      ? expectedBookmarks["range"]
      : null;
    if (
      range !== null &&
      [range["anchor"], range["focus"]].some(
        (boundary) =>
          jsonDeepEqual(boundary, internalBeforeRight) ||
          jsonDeepEqual(boundary, internalAfterLeft),
      )
    ) {
      expectedBookmarks["range"] = null;
      rangeCleared = true;
      rangePolicy = "clear-unrepresentable-internal-event-boundary";
    } else {
      rewriteRange(rightEnd, joinedEnd);
    }
    focusTarget = { kind: "event", eventId: plan["leftEventId"] };
  } else if (plan["kind"] === "split-section") {
    const suffix = candidate.allocatedIdentities.find(
      (row) => row["kind"] === "section",
    );
    if (suffix !== undefined) {
      const from = { kind: "section-end", sectionId: plan["sectionId"] };
      const to = { kind: "section-end", sectionId: suffix["id"] };
      rewriteInsertion(from, to);
      rewriteRange(from, to);
    }
    focusTarget = { kind: "section", sectionId: plan["sectionId"] };
  } else if (plan["kind"] === "join-sections") {
    insertionPolicy = "rewrite-exact-span-end";
    rangePolicy = "rewrite-representable-boundaries";
    focusPolicy = "replace-removed-right-with-left";
    focusReason = "delete-repair";
    const beforeLeft = findSectionLocation(
      before["document"],
      plan["leftSectionId"],
    );
    const beforeRight = findSectionLocation(
      before["document"],
      plan["rightSectionId"],
    );
    const lastLeftMeasure =
      beforeLeft === null
        ? null
        : sectionMeasures(beforeLeft.section).at(-1) ?? null;
    const firstRightMeasure =
      beforeRight === null
        ? null
        : sectionMeasures(beforeRight.section)[0] ?? null;
    if (firstRightMeasure !== null) {
      const from = {
        kind: "section-start",
        sectionId: plan["rightSectionId"],
      };
      const to = {
        kind: "before-measure",
        measureId: firstRightMeasure["id"],
      };
      rewriteInsertion(from, to);
      rewriteRange(from, to);
    }
    if (lastLeftMeasure !== null) {
      const from = {
        kind: "section-end",
        sectionId: plan["leftSectionId"],
      };
      const to = {
        kind: "after-measure",
        measureId: lastLeftMeasure["id"],
      };
      rewriteInsertion(from, to);
      rewriteRange(from, to);
    }
    const rightEnd = {
      kind: "section-end",
      sectionId: plan["rightSectionId"],
    };
    const joinedEnd = {
      kind: "section-end",
      sectionId: plan["leftSectionId"],
    };
    rewriteInsertion(rightEnd, joinedEnd);
    rewriteRange(rightEnd, joinedEnd);
    focusTarget = { kind: "section", sectionId: plan["leftSectionId"] };
  }

  requireExact(
    after["bookmarks"],
    expectedBookmarks,
    "EDIT_PLAN_BOOKMARK_ORACLE",
    `${path}.afterState.bookmarks`,
    "After bookmarks must equal the operation-specific independent stable-boundary transform.",
    findings,
  );
  requireExact(
    actualBookmarkReceipt,
    {
      selectionPolicy,
      selectionReplacements,
      insertionPolicy,
      insertionRewrite,
      rangePolicy,
      rangeBoundaryRewrites,
      rangeCleared,
      focusPolicy,
    },
    "EDIT_PLAN_BOOKMARK_RECEIPT_ORACLE",
    `${path}.result.editPlanReceipt.bookmarks`,
    "Bookmark receipt must contain every and only the independently computed selection/boundary rewrite.",
    findings,
  );
  if (focusTarget === null) {
    addFinding(
      findings,
      "EDIT_PLAN_FOCUS_ORACLE_UNAVAILABLE",
      `${path}.afterState.focusRequest`,
      "A committed plan must have a deterministic stable focus target.",
    );
  } else {
    requireExact(
      after["focusRequest"],
      {
        sequence: before["nextSequence"],
        target: focusTarget,
        reason: focusReason,
      },
      "EDIT_PLAN_FOCUS_ORACLE",
      `${path}.afterState.focusRequest`,
      "Focus publication must preserve the surviving stable target, using inserted material only when no stable target exists.",
      findings,
    );
  }
}

function validateCommittedOperationLaw(
  before: JsonObject,
  after: JsonObject,
  command: JsonObject,
  operation: unknown,
  path: string,
  findings: A0U1EditPlanContractFinding[],
): void {
  const beforeDocument = before["document"];
  const afterDocument = after["document"];
  const plan = isObject(command["plan"]) ? command["plan"] : {};
  if (operation === "insert-fragment") {
    const beforeIds = new Set(documentEventOrder(beforeDocument));
    const newEvents = documentSections(afterDocument).flatMap((section) =>
      sectionMeasures(section).flatMap((measure) =>
        measureEvents(measure).filter(
          (event) => !beforeIds.has(String(event["id"])),
        ),
      ),
    );
    requireOperationLaw(
      newEvents.length > 0,
      "EDIT_PLAN_INSERTED_EVENT_MISSING",
      path,
      "A committed fragment insertion must add at least one event.",
      findings,
    );
    for (const event of newEvents) {
      requireExact(
        event["voicing"],
        A0_U1_NEW_EVENT_AUTO_VOICING,
        "EDIT_PLAN_INSERTED_VOICING",
        `${path}.event.${String(event["id"])}.voicing`,
        "Every inserted event must use the exact reviewed Auto voicing.",
        findings,
      );
    }
    return;
  }
  if (operation === "split-event-duration") {
    const source = findEventLocation(beforeDocument, plan["eventId"]);
    const retained = findEventLocation(afterDocument, plan["eventId"]);
    const beforeIds = new Set(documentEventOrder(beforeDocument));
    const createdIds = documentEventOrder(afterDocument).filter(
      (id) => !beforeIds.has(id),
    );
    const created =
      createdIds.length === 1
        ? findEventLocation(afterDocument, createdIds[0])
        : null;
    requireOperationLaw(
      source !== null &&
        retained !== null &&
        created !== null &&
        retained.measure["id"] === source.measure["id"] &&
        created.measure["id"] === source.measure["id"] &&
        created.eventIndex === retained.eventIndex + 1,
      "EDIT_PLAN_SPLIT_EVENT_IDENTITY",
      path,
      "Split event must retain the original as left and allocate exactly one adjacent right event.",
      findings,
    );
    if (source !== null && retained !== null && created !== null) {
      requireExact(
        retained.event["duration"],
        plan["firstDuration"],
        "EDIT_PLAN_SPLIT_FIRST_DURATION",
        path,
        "Retained split duration differs from the command.",
        findings,
      );
      requireExact(
        created.event["duration"],
        plan["secondDuration"],
        "EDIT_PLAN_SPLIT_SECOND_DURATION",
        path,
        "Created split duration differs from the command.",
        findings,
      );
      requireExact(
        objectProjection(retained.event, new Set(["duration"])),
        objectProjection(source.event, new Set(["duration"])),
        "EDIT_PLAN_SPLIT_LEFT_CONTENT",
        path,
        "Split left event must retain every non-duration field.",
        findings,
      );
      requireExact(
        objectProjection(
          created.event,
          new Set(["id", "duration", "annotation"]),
        ),
        objectProjection(
          source.event,
          new Set(["id", "duration", "annotation"]),
        ),
        "EDIT_PLAN_SPLIT_RIGHT_CONTENT",
        path,
        "Split right event must copy exact chord and voicing.",
        findings,
      );
      requireExact(
        created.event["annotation"],
        "",
        "EDIT_PLAN_SPLIT_RIGHT_ANNOTATION",
        path,
        "Split right annotation must be empty.",
        findings,
      );
      requireExact(
        retained.measure["completion"],
        source.measure["completion"],
        "EDIT_PLAN_SPLIT_COMPLETION",
        path,
        "Split duration must preserve completion exactly.",
        findings,
      );
      const sourceDuration = durationRational(source.event["duration"]);
      const first = durationRational(plan["firstDuration"]);
      const second = durationRational(plan["secondDuration"]);
      requireOperationLaw(
        sourceDuration !== null &&
          first !== null &&
          second !== null &&
          jsonDeepEqual(addRationals(first, second), sourceDuration),
        "EDIT_PLAN_SPLIT_SUM",
        path,
        "Split durations must sum exactly to the source duration.",
        findings,
      );
    }
    return;
  }
  if (operation === "join-event-durations") {
    const left = findEventLocation(beforeDocument, plan["leftEventId"]);
    const right = findEventLocation(beforeDocument, plan["rightEventId"]);
    const survivor = findEventLocation(afterDocument, plan["leftEventId"]);
    const removed = findEventLocation(afterDocument, plan["rightEventId"]);
    requireOperationLaw(
      left !== null &&
        right !== null &&
        survivor !== null &&
        removed === null &&
        left.measure["id"] === right.measure["id"] &&
        right.eventIndex === left.eventIndex + 1,
      "EDIT_PLAN_JOIN_EVENT_IDENTITY",
      path,
      "Join must consume immediate same-measure siblings and retain only the left ID.",
      findings,
    );
    if (left !== null && right !== null && survivor !== null) {
      requireExact(
        objectProjection(left.event, new Set(["id", "duration", "annotation"])),
        objectProjection(
          right.event,
          new Set(["id", "duration", "annotation"]),
        ),
        "EDIT_PLAN_JOIN_CONTENT_PRECONDITION",
        path,
        "Joined events must have exact chord and voicing equality.",
        findings,
      );
      requireExact(
        right.event["annotation"],
        "",
        "EDIT_PLAN_JOIN_RIGHT_ANNOTATION",
        path,
        "Join requires an empty right annotation.",
        findings,
      );
      requireExact(
        objectProjection(survivor.event, new Set(["duration"])),
        objectProjection(left.event, new Set(["duration"])),
        "EDIT_PLAN_JOIN_SURVIVOR_CONTENT",
        path,
        "Joined left survivor must retain every non-duration field.",
        findings,
      );
      requireExact(
        survivor.event["duration"],
        plan["joinedDuration"],
        "EDIT_PLAN_JOIN_DURATION",
        path,
        "Joined duration differs from the command.",
        findings,
      );
      requireExact(
        survivor.measure["completion"],
        left.measure["completion"],
        "EDIT_PLAN_JOIN_COMPLETION",
        path,
        "Join duration must preserve completion exactly.",
        findings,
      );
      const leftDuration = durationRational(left.event["duration"]);
      const rightDuration = durationRational(right.event["duration"]);
      const joined = durationRational(plan["joinedDuration"]);
      requireOperationLaw(
        leftDuration !== null &&
          rightDuration !== null &&
          joined !== null &&
          jsonDeepEqual(addRationals(leftDuration, rightDuration), joined),
        "EDIT_PLAN_JOIN_SUM",
        path,
        "Joined duration must equal the exact sum of both inputs.",
        findings,
      );
    }
    return;
  }
  if (operation === "split-section") {
    const source = findSectionLocation(beforeDocument, plan["sectionId"]);
    const retained = findSectionLocation(afterDocument, plan["sectionId"]);
    const beforeIds = new Set(documentSectionOrder(beforeDocument));
    const createdIds = documentSectionOrder(afterDocument).filter(
      (id) => !beforeIds.has(id),
    );
    const created =
      createdIds.length === 1
        ? findSectionLocation(afterDocument, createdIds[0])
        : null;
    if (source === null || retained === null || created === null) {
      addFinding(
        findings,
        "EDIT_PLAN_SPLIT_SECTION_IDENTITY",
        path,
        "Split section must retain one leading ID and allocate exactly one suffix ID.",
      );
      return;
    }
    const beforeMeasures = sectionMeasures(source.section);
    const splitIndex = beforeMeasures.findIndex(
      (measure) => measure["id"] === plan["beforeMeasureId"],
    );
    requireOperationLaw(
      splitIndex > 0 && splitIndex < beforeMeasures.length,
      "EDIT_PLAN_SPLIT_SECTION_BOUNDARY",
      path,
      "Section split boundary must be strict interior.",
      findings,
    );
    requireExact(
      sectionMetadataProjection(retained.section),
      sectionMetadataProjection(source.section),
      "EDIT_PLAN_SPLIT_SECTION_METADATA",
      path,
      "Leading section metadata must survive exactly.",
      findings,
    );
    requireExact(
      sectionMetadataProjection(created.section),
      plan["newSectionMetadata"],
      "EDIT_PLAN_SPLIT_SECTION_NEW_METADATA",
      path,
      "Suffix section metadata must equal the command.",
      findings,
    );
    requireExact(
      sectionMeasures(retained.section),
      beforeMeasures.slice(0, splitIndex),
      "EDIT_PLAN_SPLIT_SECTION_PREFIX",
      path,
      "Leading measures must be the exact source prefix.",
      findings,
    );
    requireExact(
      sectionMeasures(created.section),
      beforeMeasures.slice(splitIndex),
      "EDIT_PLAN_SPLIT_SECTION_SUFFIX",
      path,
      "Suffix measures must move without any identity or value change.",
      findings,
    );
    return;
  }
  if (operation === "join-sections") {
    const left = findSectionLocation(beforeDocument, plan["leftSectionId"]);
    const right = findSectionLocation(beforeDocument, plan["rightSectionId"]);
    const survivor = findSectionLocation(afterDocument, plan["leftSectionId"]);
    const removed = findSectionLocation(afterDocument, plan["rightSectionId"]);
    requireOperationLaw(
      left !== null &&
        right !== null &&
        survivor !== null &&
        removed === null &&
        right.index === left.index + 1,
      "EDIT_PLAN_JOIN_SECTION_IDENTITY",
      path,
      "Join sections must consume immediate right adjacency and retain only the left ID.",
      findings,
    );
    if (left !== null && right !== null && survivor !== null) {
      requireExact(
        sectionMetadataProjection(left.section),
        plan["expectedLeftMetadata"],
        "EDIT_PLAN_JOIN_LEFT_SNAPSHOT",
        path,
        "Expected left metadata must match the literal before-state.",
        findings,
      );
      requireExact(
        sectionMetadataProjection(right.section),
        plan["expectedRightMetadata"],
        "EDIT_PLAN_JOIN_RIGHT_SNAPSHOT",
        path,
        "Expected right metadata must match the literal before-state.",
        findings,
      );
      requireExact(
        sectionMetadataProjection(survivor.section),
        plan["resultMetadata"],
        "EDIT_PLAN_JOIN_RESULT_METADATA",
        path,
        "Survivor metadata must equal the explicit result.",
        findings,
      );
      requireExact(
        sectionMeasures(survivor.section),
        [...sectionMeasures(left.section), ...sectionMeasures(right.section)],
        "EDIT_PLAN_JOIN_SECTION_MEASURES",
        path,
        "Joined measures must preserve exact left-then-right values and identities.",
        findings,
      );
    }
  }
}

function validatePublicationEvidence(
  before: JsonObject,
  after: JsonObject,
  expected: JsonObject,
  phase: unknown,
  command: unknown,
  result: JsonObject | null,
  path: string,
  findings: A0U1EditPlanContractFinding[],
): void {
  const effects = expected["effects"];
  if (!Array.isArray(effects)) {
    addFinding(
      findings,
      "EDIT_PLAN_EFFECTS_LITERAL",
      `${path}.effects`,
      "Effects must be a complete literal array.",
    );
    return;
  }
  if (result?.["ok"] === false) {
    requireExact(
      effects,
      [],
      "EDIT_PLAN_REFUSAL_EFFECTS",
      `${path}.effects`,
      "Refusal must emit no effects.",
      findings,
    );
    requireExact(
      objectProjection(after, new Set(["notices", "nextSequence"])),
      objectProjection(before, new Set(["notices", "nextSequence"])),
      "EDIT_PLAN_REFUSAL_ATOMICITY",
      `${path}.afterState`,
      "Refusal may change only bounded notice and sequence bookkeeping.",
      findings,
    );
    requireExact(
      after["revision"],
      before["revision"],
      "EDIT_PLAN_REFUSAL_REVISION",
      `${path}.afterState.revision`,
      "Refusal must not advance revision.",
      findings,
    );
    return;
  }
  if (result?.["ok"] !== true) return;
  const expectedKinds = [
    "queue-recovery",
    "compile-playback-plan",
    "restore-focus",
    "announce",
  ];
  requireExact(
    effects.map((effect) => (isObject(effect) ? effect["kind"] : null)),
    expectedKinds,
    "EDIT_PLAN_SUCCESS_EFFECTS",
    `${path}.effects`,
    "Successful edit, undo, and redo transitions must emit the exact playback-relevant effect sequence.",
    findings,
  );
  for (const [index, effect] of effects.entries()) {
    if (!isObject(effect) || effect["revision"] !== after["revision"]) {
      addFinding(
        findings,
        "EDIT_PLAN_EFFECT_REVISION",
        `${path}.effects[${String(index)}]`,
        "Every effect must target the committed after-state revision.",
      );
    }
  }
  const quickEntry = isObject(after["quickEntry"]) ? after["quickEntry"] : {};
  if (
    quickEntry["text"] !== "" ||
    quickEntry["status"] !== "idle" ||
    !jsonDeepEqual(quickEntry["issueCodes"], []) ||
    quickEntry["baseRevision"] !== after["revision"] ||
    !jsonDeepEqual(
      quickEntry["target"],
      isObject(after["bookmarks"])
        ? after["bookmarks"]["insertion"]
        : undefined,
    )
  ) {
    addFinding(
      findings,
      "EDIT_PLAN_QUICK_ENTRY_PUBLICATION",
      `${path}.afterState.quickEntry`,
      "Successful publication must clear Quick Entry at the committed revision and retain the new insertion bookmark as target.",
    );
  }
  if (phase === "apply") {
    const beforeHistory = isObject(before["history"]) ? before["history"] : {};
    const afterHistory = isObject(after["history"]) ? after["history"] : {};
    const beforeUndo = Array.isArray(beforeHistory["undo"])
      ? beforeHistory["undo"]
      : [];
    const afterUndo = Array.isArray(afterHistory["undo"])
      ? afterHistory["undo"]
      : [];
    requireOperationLaw(
      afterUndo.length === beforeUndo.length + 1 &&
        jsonDeepEqual(afterUndo.slice(0, -1), beforeUndo) &&
        Array.isArray(afterHistory["redo"]) &&
        afterHistory["redo"].length === 0,
      "EDIT_PLAN_ONE_HISTORY_ENTRY",
      `${path}.afterState.history`,
      "A committed plan must append exactly one undo entry and clear redo.",
      findings,
    );
    const entry = afterUndo[afterUndo.length - 1];
    if (!isObject(entry)) {
      addFinding(
        findings,
        "EDIT_PLAN_HISTORY_ENTRY_LITERAL",
        `${path}.afterState.history.undo`,
        "Committed history must contain the complete literal new entry.",
      );
    } else {
      checkExactKeys(
        entry,
        [
          "commandId",
          "commandKind",
          "label",
          "before",
          "after",
          "beforeBookmarks",
          "afterBookmarks",
          "retainedBytesEstimate",
          "coalescing",
          "firstLogicalTimeMs",
          "lastLogicalTimeMs",
        ],
        "EDIT_PLAN_HISTORY_ENTRY_KEYS",
        `${path}.afterState.history.undo`,
        findings,
      );
      const commandRecord = isObject(command) ? command : {};
      requireExact(
        entry["commandId"],
        commandRecord["id"],
        "EDIT_PLAN_HISTORY_COMMAND_ID",
        `${path}.afterState.history.undo.commandId`,
        "Atomic edit history command ID must equal the exact command envelope.",
        findings,
      );
      requireExact(
        entry["commandKind"],
        "apply-edit-plan",
        "EDIT_PLAN_HISTORY_COMMAND_KIND",
        `${path}.afterState.history.undo.commandKind`,
        "Atomic edit history must preserve the proposed command kind literally.",
        findings,
      );
      requireExact(
        entry["label"],
        commandRecord["label"],
        "EDIT_PLAN_HISTORY_LABEL",
        `${path}.afterState.history.undo.label`,
        "Atomic edit history label must equal the exact command envelope.",
        findings,
      );
      requireExact(
        entry["coalescing"],
        null,
        "EDIT_PLAN_HISTORY_COALESCING",
        `${path}.afterState.history.undo.coalescing`,
        "Atomic edit history is never coalesced.",
        findings,
      );
      requireExact(
        entry["firstLogicalTimeMs"],
        commandRecord["logicalTimeMs"],
        "EDIT_PLAN_HISTORY_FIRST_TIME",
        `${path}.afterState.history.undo.firstLogicalTimeMs`,
        "Atomic edit history first time must equal the command logical time.",
        findings,
      );
      requireExact(
        entry["lastLogicalTimeMs"],
        commandRecord["logicalTimeMs"],
        "EDIT_PLAN_HISTORY_LAST_TIME",
        `${path}.afterState.history.undo.lastLogicalTimeMs`,
        "Atomic edit history last time must equal the command logical time.",
        findings,
      );
      if (!isPositiveSafeInteger(entry["retainedBytesEstimate"])) {
        addFinding(
          findings,
          "EDIT_PLAN_HISTORY_ENTRY_BYTES",
          `${path}.afterState.history.undo.retainedBytesEstimate`,
          "History retained-byte evidence must be a positive safe integer.",
        );
      }
      const independentlyEstimatedBytes = independentHistoryEntryBytes(entry);
      requireExact(
        entry["retainedBytesEstimate"],
        independentlyEstimatedBytes,
        "EDIT_PLAN_HISTORY_ENTRY_BYTE_FORMULA",
        `${path}.afterState.history.undo.retainedBytesEstimate`,
        "History entry bytes must equal the independent A0 policy traversal, not a rounded fixture literal.",
        findings,
      );
      const outerCounters = isObject(expected["counters"])
        ? expected["counters"]["outer"]
        : null;
      requireExact(
        isObject(outerCounters)
          ? outerCounters["historyBytesEstimated"]
          : undefined,
        independentlyEstimatedBytes,
        "EDIT_PLAN_HISTORY_OUTER_BYTE_WORK",
        `${path}.counters.outer.historyBytesEstimated`,
        "Outer history byte work must equal the independently recomputed new-entry estimate.",
        findings,
      );
      requireExact(
        entry["before"],
        before["document"],
        "EDIT_PLAN_HISTORY_BEFORE",
        `${path}.afterState.history.undo.before`,
        "History before document must equal the complete before-state document.",
        findings,
      );
      requireExact(
        entry["after"],
        after["document"],
        "EDIT_PLAN_HISTORY_AFTER",
        `${path}.afterState.history.undo.after`,
        "History after document must equal the complete after-state document.",
        findings,
      );
      requireExact(
        entry["beforeBookmarks"],
        before["bookmarks"],
        "EDIT_PLAN_HISTORY_BEFORE_BOOKMARKS",
        `${path}.afterState.history.undo.beforeBookmarks`,
        "History before bookmarks must be literal.",
        findings,
      );
      requireExact(
        entry["afterBookmarks"],
        after["bookmarks"],
        "EDIT_PLAN_HISTORY_AFTER_BOOKMARKS",
        `${path}.afterState.history.undo.afterBookmarks`,
        "History after bookmarks must be literal.",
        findings,
      );
    }
    const allAfterEntries = [
      ...afterUndo,
      ...recordsAt(afterHistory["redo"]),
    ];
    for (const [index, historyEntry] of allAfterEntries.entries()) {
      requireExact(
        historyEntry["retainedBytesEstimate"],
        independentHistoryEntryBytes(historyEntry),
        "EDIT_PLAN_HISTORY_ALL_ENTRY_BYTES",
        `${path}.afterState.history.entries[${String(index)}].retainedBytesEstimate`,
        "Every retained history row must carry its independently recomputed estimate.",
        findings,
      );
    }
    const retainedBytes = allAfterEntries.reduce(
      (total, historyEntry) =>
        total +
        (isNonnegativeSafeInteger(historyEntry["retainedBytesEstimate"])
          ? historyEntry["retainedBytesEstimate"]
          : 0),
      0,
    );
    requireExact(
      afterHistory["retainedBytesEstimate"],
      retainedBytes,
      "EDIT_PLAN_HISTORY_TOTAL_BYTES",
      `${path}.afterState.history.retainedBytesEstimate`,
      "History total retained bytes must equal the exact sum of all literal rows.",
      findings,
    );
  } else if (phase === "undo" || phase === "redo") {
    const outerCounters = isObject(expected["counters"])
      ? expected["counters"]["outer"]
      : null;
    requireExact(
      isObject(outerCounters)
        ? outerCounters["historyBytesEstimated"]
        : undefined,
      0,
      "EDIT_PLAN_HISTORY_REPLAY_ESTIMATE_WORK",
      `${path}.counters.outer.historyBytesEstimated`,
      "Undo and redo move an existing exact row and perform no new retained-byte estimate.",
      findings,
    );
  }
}

function completionMeasureIdsForPlan(plan: JsonObject): unknown[] {
  const declarations =
    plan["kind"] === "insert-fragment" && isObject(plan["placement"])
      ? plan["placement"]["completionDeclarations"]
      : plan["completionDeclarations"];
  return recordsAt(declarations).map((row) => row["measureId"]);
}

function expectedTimelineDisposition(plan: JsonObject): string | null {
  switch (plan["kind"]) {
    case "insert-fragment":
      return isObject(plan["source"]) &&
        plan["source"]["kind"] === "recovered-chord"
        ? "insert-one-recovered-chord-at-declared-boundary"
        : "splice-source-order-at-declared-boundary";
    case "split-event-duration":
      return "replace-one-span-with-two-exact-sum-spans";
    case "join-event-durations":
      return "replace-two-equal-content-spans-with-one-exact-sum-span";
    case "split-section":
    case "join-sections":
      return "preserve-flattened-event-order-and-durations";
    default:
      return null;
  }
}

function expectedSurvivorId(plan: JsonObject): unknown {
  switch (plan["kind"]) {
    case "split-event-duration":
      return plan["eventId"];
    case "join-event-durations":
      return plan["leftEventId"];
    case "split-section":
      return plan["sectionId"];
    case "join-sections":
      return plan["leftSectionId"];
    default:
      return null;
  }
}

function identityRecords(document: unknown): Readonly<{
  sections: readonly string[];
  measures: readonly string[];
  events: readonly string[];
}> {
  return {
    sections: documentSectionOrder(document),
    measures: documentMeasureOrder(document),
    events: documentEventOrder(document),
  };
}

function expectedAllocatedIdentityProjection(
  beforeDocument: unknown,
  afterDocument: unknown,
): JsonObject[] {
  const before = identityRecords(beforeDocument);
  const occupied = new Set([
    ...before.sections,
    ...before.measures,
    ...before.events,
  ]);
  const result: JsonObject[] = [];
  for (const section of documentSections(afterDocument)) {
    const sectionId = String(section["id"]);
    if (!occupied.has(sectionId))
      result.push({ kind: "section", id: sectionId });
    for (const measure of sectionMeasures(section)) {
      const measureId = String(measure["id"]);
      if (!occupied.has(measureId))
        result.push({ kind: "measure", id: measureId });
      for (const event of measureEvents(measure)) {
        const eventId = String(event["id"]);
        if (!occupied.has(eventId)) result.push({ kind: "event", id: eventId });
      }
    }
  }
  return result;
}

function expectedRemovedIdentityProjection(
  beforeDocument: unknown,
  afterDocument: unknown,
): JsonObject[] {
  const after = identityRecords(afterDocument);
  const retained = new Set([
    ...after.sections,
    ...after.measures,
    ...after.events,
  ]);
  const result: JsonObject[] = [];
  for (const section of documentSections(beforeDocument)) {
    const sectionId = String(section["id"]);
    if (!retained.has(sectionId))
      result.push({ kind: "section", id: sectionId });
    for (const event of sectionMeasures(section).flatMap(measureEvents)) {
      const eventId = String(event["id"]);
      if (!retained.has(eventId)) result.push({ kind: "event", id: eventId });
    }
  }
  return result;
}

function expectedTerminationForNestedCode(code: unknown): string | null {
  if (
    code === "edit-plan.id-factory-failed" ||
    code === "edit-plan.id-collision"
  ) {
    return "allocation-refusal";
  }
  if (
    code === "edit-plan.structural-publication-refused" ||
    code === "edit-plan.semantic-publication-refused"
  ) {
    return "publication-refusal";
  }
  if (code === "edit-plan.history-refused") return "history-refusal";
  return A0_U1_ATOMIC_EDIT_REFUSAL_CODES.includes(code as never)
    ? "input-refusal"
    : null;
}

function compareDomainPaths(left: unknown, right: unknown): number {
  const leftPath = Array.isArray(left)
    ? left.map(String).join("\u0000")
    : stableJson(left);
  const rightPath = Array.isArray(right)
    ? right.map(String).join("\u0000")
    : stableJson(right);
  return codeUnitCompare(leftPath, rightPath);
}

function compareDiagnostics(left: JsonObject, right: JsonObject): number {
  const pathOrder = compareDomainPaths(left["path"], right["path"]);
  if (pathOrder !== 0) return pathOrder;
  const leftRange = isObject(left["sourceRange"])
    ? left["sourceRange"]
    : null;
  const rightRange = isObject(right["sourceRange"])
    ? right["sourceRange"]
    : null;
  if (leftRange === null && rightRange !== null) return -1;
  if (leftRange !== null && rightRange === null) return 1;
  if (leftRange !== null && rightRange !== null) {
    const startOrder =
      Number(leftRange["start"]) - Number(rightRange["start"]);
    if (startOrder !== 0) return startOrder;
    const endOrder = Number(leftRange["end"]) - Number(rightRange["end"]);
    if (endOrder !== 0) return endOrder;
  }
  return codeUnitCompare(String(left["code"]), String(right["code"]));
}

const DIATONIC_STEPS_BY_ASCENDING_SEMITONES = Object.freeze([
  0, 0, 1, 2, 2, 3, 3, 4, 5, 5, 6, 6,
] as const);
const PITCH_STEPS = Object.freeze(["C", "D", "E", "F", "G", "A", "B"]);
const NATURAL_PITCH_CLASSES = Object.freeze([0, 2, 4, 5, 7, 9, 11]);

function floorDiv(value: number, divisor: number): number {
  return Math.floor(value / divisor);
}

function modulo(value: number, divisor: number): number {
  const remainder = value % divisor;
  return remainder < 0 ? remainder + divisor : remainder;
}

function independentDiatonicSteps(intervalSemitones: number): number | null {
  if (!Number.isSafeInteger(intervalSemitones)) return null;
  if (intervalSemitones === 0) return 0;
  const direction = intervalSemitones > 0 ? 1 : -1;
  const magnitude = Math.abs(intervalSemitones);
  const octaves = Math.floor(magnitude / 12);
  const remainder = magnitude % 12;
  const diatonicWithinOctave =
    DIATONIC_STEPS_BY_ASCENDING_SEMITONES[remainder];
  return (
    direction *
    (octaves * PITCH_STEPS.length + diatonicWithinOctave)
  );
}

function transposeSpelledPitchObject(
  pitch: JsonObject,
  intervalSemitones: number,
): JsonObject | null {
  const stepIndex = PITCH_STEPS.indexOf(String(pitch["step"]));
  const alter = pitch["alter"];
  const diatonicSteps = independentDiatonicSteps(intervalSemitones);
  if (
    stepIndex < 0 ||
    !Number.isSafeInteger(alter) ||
    diatonicSteps === null
  ) {
    return null;
  }
  const absoluteStep = stepIndex + diatonicSteps;
  const targetStepIndex = modulo(absoluteStep, PITCH_STEPS.length);
  const targetStep = PITCH_STEPS[targetStepIndex];
  const sourcePitchClass =
    (NATURAL_PITCH_CLASSES[stepIndex] as number) + Number(alter);
  if (Object.hasOwn(pitch, "octave")) {
    const octave = pitch["octave"];
    if (!Number.isSafeInteger(octave)) return null;
    const targetOctave = Number(octave) + floorDiv(absoluteStep, 7);
    const desiredAbsolute =
      Number(octave) * 12 + sourcePitchClass + intervalSemitones;
    const targetNaturalAbsolute =
      targetOctave * 12 + (NATURAL_PITCH_CLASSES[targetStepIndex] as number);
    return {
      step: targetStep,
      alter: desiredAbsolute - targetNaturalAbsolute,
      octave: targetOctave,
    };
  }
  const desiredPitchClass = modulo(
    sourcePitchClass + intervalSemitones,
    12,
  );
  let targetAlter =
    desiredPitchClass - (NATURAL_PITCH_CLASSES[targetStepIndex] as number);
  if (targetAlter > 6) targetAlter -= 12;
  if (targetAlter < -6) targetAlter += 12;
  return { step: targetStep, alter: targetAlter };
}

function accidentalText(alter: number): string | null {
  if (alter === 0) return "";
  if (alter === 1) return "#";
  if (alter === 2) return "##";
  if (alter === -1) return "b";
  if (alter === -2) return "bb";
  return null;
}

function transposeChordSourceText(
  sourceText: string,
  intervalSemitones: number,
): string | null {
  let failed = false;
  const transformed = sourceText.replace(
    /(?<![A-Za-z])([A-G])(bb|##|b|#)?/gu,
    (_match: string, step: string, accidental: string | undefined) => {
      const alter =
        accidental === "#"
          ? 1
          : accidental === "##"
            ? 2
            : accidental === "b"
              ? -1
              : accidental === "bb"
                ? -2
                : 0;
      const pitch = transposeSpelledPitchObject(
        { step, alter },
        intervalSemitones,
      );
      if (pitch === null) {
        failed = true;
        return _match;
      }
      const renderedAccidental = accidentalText(Number(pitch["alter"]));
      if (renderedAccidental === null) {
        failed = true;
        return _match;
      }
      return `${String(pitch["step"])}${renderedAccidental}`;
    },
  );
  return failed ? null : transformed;
}

function independentlyTransposePitchData(
  value: unknown,
  intervalSemitones: number,
  parentKey = "",
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) =>
      independentlyTransposePitchData(item, intervalSemitones, parentKey),
    );
  }
  if (!isObject(value)) return value;
  const keys = Object.keys(value);
  if (
    keys.includes("step") &&
    keys.includes("alter") &&
    keys.every((key) => ["step", "alter", "octave"].includes(key))
  ) {
    return transposeSpelledPitchObject(value, intervalSemitones);
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => {
      if (
        key === "sourceText" &&
        (parentKey === "chord" || parentKey === "quickEntrySnapshot") &&
        typeof child === "string"
      ) {
        return [
          key,
          transposeChordSourceText(child, intervalSemitones),
        ];
      }
      return [
        key,
        independentlyTransposePitchData(
          child,
          intervalSemitones,
          key,
        ),
      ];
    }),
  );
}

function remapExactStrings(
  value: unknown,
  replacements: ReadonlyMap<string, string>,
): unknown {
  if (typeof value === "string") return replacements.get(value) ?? value;
  if (Array.isArray(value)) {
    return value.map((child) => remapExactStrings(child, replacements));
  }
  if (!isObject(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      remapExactStrings(child, replacements),
    ]),
  );
}

function validateAtomicEditResultDetail(
  before: JsonObject,
  after: JsonObject,
  command: JsonObject,
  expected: JsonObject,
  result: JsonObject,
  phase: unknown,
  parserEvidence: ParserEvidenceView | null,
  path: string,
  findings: A0U1EditPlanContractFinding[],
): void {
  const appliesEditPlan = command["kind"] === "apply-edit-plan";
  const outerCounters = isObject(expected["counters"])
    ? expected["counters"]["outer"]
    : undefined;
  requireExact(
    result["state"],
    after,
    "EDIT_PLAN_RESULT_STATE",
    `${path}.state`,
    "Result state must equal the complete literal after-state.",
    findings,
  );
  requireExact(
    result["effects"],
    expected["effects"],
    "EDIT_PLAN_RESULT_EFFECTS",
    `${path}.effects`,
    "Result effects must equal the complete expected effects.",
    findings,
  );
  requireExact(
    result["counters"],
    outerCounters,
    "EDIT_PLAN_RESULT_OUTER_COUNTERS",
    `${path}.counters`,
    "Result counters must equal the outer A0 work record.",
    findings,
  );

  if (result["ok"] === true) {
    checkExactKeys(
      result,
      appliesEditPlan && phase === "apply"
        ? EXPECTED_SUCCESS_RESULT_KEYS
        : ["ok", "state", "outcome", "effects", "counters"],
      "EDIT_PLAN_SUCCESS_RESULT_KEYS",
      path,
      findings,
    );
    if (!appliesEditPlan || phase !== "apply") return;
    if (result["outcome"] !== "committed") {
      addFinding(
        findings,
        "EDIT_PLAN_SUCCESS_OUTCOME",
        `${path}.outcome`,
        "Noncoalescing atomic edit plans have exactly the committed outcome.",
      );
    }
    const receipt = isObject(result["editPlanReceipt"])
      ? result["editPlanReceipt"]
      : {};
    checkExactKeys(
      receipt,
      EXPECTED_RECEIPT_KEYS,
      "EDIT_PLAN_RECEIPT_KEYS",
      `${path}.editPlanReceipt`,
      findings,
    );
    const plan = isObject(command["plan"]) ? command["plan"] : {};
    requireExact(
      receipt["schema"],
      A0_U1_ATOMIC_EDIT_PLAN_RECEIPT_SCHEMA,
      "EDIT_PLAN_RECEIPT_SCHEMA",
      `${path}.editPlanReceipt.schema`,
      "Receipt schema changed.",
      findings,
    );
    requireExact(
      receipt["commandKind"],
      "apply-edit-plan",
      "EDIT_PLAN_RECEIPT_COMMAND_KIND",
      `${path}.editPlanReceipt.commandKind`,
      "Receipt command kind must be exact.",
      findings,
    );
    requireExact(
      receipt["commandId"],
      command["id"],
      "EDIT_PLAN_RECEIPT_COMMAND_ID",
      `${path}.editPlanReceipt.commandId`,
      "Receipt command ID must equal the envelope.",
      findings,
    );
    requireExact(
      receipt["planKind"],
      plan["kind"],
      "EDIT_PLAN_RECEIPT_PLAN_KIND",
      `${path}.editPlanReceipt.planKind`,
      "Receipt plan kind must equal the closed plan discriminant.",
      findings,
    );
    requireExact(
      receipt["documentId"],
      isObject(after["document"]) ? after["document"]["id"] : undefined,
      "EDIT_PLAN_RECEIPT_DOCUMENT",
      `${path}.editPlanReceipt.documentId`,
      "Receipt document ID must equal the published document.",
      findings,
    );
    requireExact(
      receipt["baseRevision"],
      before["revision"],
      "EDIT_PLAN_RECEIPT_BASE_REVISION",
      `${path}.editPlanReceipt.baseRevision`,
      "Receipt base revision must equal the before-state.",
      findings,
    );
    requireExact(
      receipt["committedRevision"],
      after["revision"],
      "EDIT_PLAN_RECEIPT_COMMITTED_REVISION",
      `${path}.editPlanReceipt.committedRevision`,
      "Receipt committed revision must equal the after-state.",
      findings,
    );
    const projectedAllocated = recordsAt(receipt["allocatedIdentities"]).map(
      (row) => ({ kind: row["kind"], id: row["id"] }),
    );
    const projectedRemoved = recordsAt(receipt["removedIdentities"]).map(
      (row) => ({ kind: row["kind"], id: row["id"] }),
    );
    requireExact(
      projectedAllocated,
      expectedAllocatedIdentityProjection(
        before["document"],
        after["document"],
      ),
      "EDIT_PLAN_RECEIPT_ALLOCATED_IDENTITIES",
      `${path}.editPlanReceipt.allocatedIdentities`,
      "Receipt allocations must equal every fresh ID in structural preorder.",
      findings,
    );
    requireExact(
      projectedRemoved,
      expectedRemovedIdentityProjection(before["document"], after["document"]),
      "EDIT_PLAN_RECEIPT_REMOVED_IDENTITIES",
      `${path}.editPlanReceipt.removedIdentities`,
      "Receipt removals must equal every removed section/event ID in source order.",
      findings,
    );
    requireExact(
      receipt["survivorId"],
      expectedSurvivorId(plan),
      "EDIT_PLAN_RECEIPT_SURVIVOR",
      `${path}.editPlanReceipt.survivorId`,
      "Receipt survivor must match the operation policy.",
      findings,
    );
    requireExact(
      receipt["completionMeasureIds"],
      completionMeasureIdsForPlan(plan),
      "EDIT_PLAN_RECEIPT_COMPLETIONS",
      `${path}.editPlanReceipt.completionMeasureIds`,
      "Receipt completion IDs must equal the closed command declarations.",
      findings,
    );
    requireExact(
      receipt["timelineDisposition"],
      expectedTimelineDisposition(plan),
      "EDIT_PLAN_RECEIPT_TIMELINE",
      `${path}.editPlanReceipt.timelineDisposition`,
      "Receipt timeline disposition must match the plan kind/lane.",
      findings,
    );
    checkExactKeys(
      receipt["bookmarks"],
      [
        "selectionPolicy",
        "selectionReplacements",
        "insertionPolicy",
        "insertionRewrite",
        "rangePolicy",
        "rangeBoundaryRewrites",
        "rangeCleared",
        "focusPolicy",
      ],
      "EDIT_PLAN_RECEIPT_BOOKMARK_KEYS",
      `${path}.editPlanReceipt.bookmarks`,
      findings,
    );
    requireExact(
      receipt["quickEntryDisposition"],
      "clear-to-idle-at-committed-revision",
      "EDIT_PLAN_RECEIPT_QUICK_ENTRY",
      `${path}.editPlanReceipt.quickEntryDisposition`,
      "Receipt must record exact Quick Entry clearing.",
      findings,
    );
    requireExact(
      receipt["historyEntriesAppended"],
      1,
      "EDIT_PLAN_RECEIPT_HISTORY_COUNT",
      `${path}.editPlanReceipt.historyEntriesAppended`,
      "Receipt must record exactly one history entry.",
      findings,
    );
    requireExact(
      receipt["structuralDecodeCalls"],
      1,
      "EDIT_PLAN_RECEIPT_F2_COUNT",
      `${path}.editPlanReceipt.structuralDecodeCalls`,
      "Receipt must record exactly one F2 call.",
      findings,
    );
    requireExact(
      receipt["semanticValidationCalls"],
      1,
      "EDIT_PLAN_RECEIPT_F3_COUNT",
      `${path}.editPlanReceipt.semanticValidationCalls`,
      "Receipt must record exactly one F3 call.",
      findings,
    );
    requireExact(
      receipt["effects"],
      ["queue-recovery", "compile-playback-plan", "restore-focus", "announce"],
      "EDIT_PLAN_RECEIPT_EFFECTS",
      `${path}.editPlanReceipt.effects`,
      "Receipt effect kinds must remain exact.",
      findings,
    );
    requireExact(
      receipt["work"],
      isObject(expected["counters"])
        ? expected["counters"]["editPlan"]
        : undefined,
      "EDIT_PLAN_RECEIPT_WORK",
      `${path}.editPlanReceipt.work`,
      "Receipt nested work must equal independently declared counters.",
      findings,
    );
    const receiptWork = isObject(receipt["work"]) ? receipt["work"] : {};
    requireExact(
      receiptWork["termination"],
      "complete",
      "EDIT_PLAN_SUCCESS_TERMINATION",
      `${path}.editPlanReceipt.work.termination`,
      "A committed edit plan must reach the one complete termination.",
      findings,
    );
    requireExact(
      isObject(outerCounters) ? outerCounters["validationCalls"] : undefined,
      2,
      "EDIT_PLAN_SUCCESS_VALIDATION_CALLS",
      `${path}.counters.validationCalls`,
      "A committed edit plan must call F2 and F3 exactly once each.",
      findings,
    );
    const allocatedCount = recordsAt(receipt["allocatedIdentities"]).length;
    requireExact(
      receiptWork["idAllocationAttempts"],
      allocatedCount,
      "EDIT_PLAN_SUCCESS_ALLOCATION_ATTEMPTS",
      `${path}.editPlanReceipt.work.idAllocationAttempts`,
      "Successful allocation attempts must equal the exact fresh-identity count.",
      findings,
    );
    requireExact(
      receiptWork["idCollisionChecks"],
      allocatedCount,
      "EDIT_PLAN_SUCCESS_COLLISION_CHECKS",
      `${path}.editPlanReceipt.work.idCollisionChecks`,
      "Every successful returned ID must receive one collision check.",
      findings,
    );
    requireExact(
      receiptWork["peakAllocatedIdRecords"],
      allocatedCount,
      "EDIT_PLAN_SUCCESS_PEAK_ALLOCATIONS",
      `${path}.editPlanReceipt.work.peakAllocatedIdRecords`,
      "Successful peak allocated-ID records must equal the reserved fresh-identity count.",
      findings,
    );
    if (plan["kind"] === "insert-fragment") {
      const sourceText =
        isObject(plan["source"]) &&
        isObject(plan["source"]["quickEntrySnapshot"])
          ? plan["source"]["quickEntrySnapshot"]["sourceText"]
          : undefined;
      const codePoints =
        typeof sourceText === "string" ? codePointLength(sourceText) : -1;
      const utf8Bytes =
        typeof sourceText === "string"
          ? new TextEncoder().encode(sourceText).length
          : -1;
      requireExact(
        receiptWork["sourceCodePointsObserved"],
        codePoints,
        "EDIT_PLAN_SUCCESS_SOURCE_CODE_POINTS",
        `${path}.editPlanReceipt.work.sourceCodePointsObserved`,
        "Committed insert source code-point work must equal the exact guarded text.",
        findings,
      );
      requireExact(
        receiptWork["sourceUtf8BytesObserved"],
        utf8Bytes,
        "EDIT_PLAN_SUCCESS_SOURCE_BYTES",
        `${path}.editPlanReceipt.work.sourceUtf8BytesObserved`,
        "Committed insert UTF-8 work must equal the exact guarded text.",
        findings,
      );
      requireExact(
        receiptWork["quickEntrySnapshotFieldsCompared"],
        A0_U1_ATOMIC_EDIT_LIMITS.quickEntrySnapshotFieldsCompared,
        "EDIT_PLAN_SUCCESS_SNAPSHOT_FIELDS",
        `${path}.editPlanReceipt.work.quickEntrySnapshotFieldsCompared`,
        "Committed insert must compare all Quick Entry snapshot fields.",
        findings,
      );
      requireExact(
        receiptWork["syntaxParseCalls"],
        1,
        "EDIT_PLAN_SUCCESS_PARSE_CALLS",
        `${path}.editPlanReceipt.work.syntaxParseCalls`,
        "Committed insert must call T0 exactly once.",
        findings,
      );
    } else {
      for (const counterName of [
        "sourceCodePointsObserved",
        "sourceUtf8BytesObserved",
        "quickEntrySnapshotFieldsCompared",
        "quickEntryIssueCodesCompared",
        "syntaxParseCalls",
        "warningAcknowledgementsCompared",
        "insertableChordsExamined",
        "recoveryFieldsCompared",
        "draftSectionsVisited",
        "draftMeasuresVisited",
        "draftEventsVisited",
      ]) {
        requireExact(
          receiptWork[counterName],
          0,
          "EDIT_PLAN_NONINSERT_SOURCE_WORK",
          `${path}.editPlanReceipt.work.${counterName}`,
          "Non-insert plans perform zero source/T0/recovery work.",
          findings,
        );
      }
    }
    const insertSource = isObject(plan["source"]) ? plan["source"] : null;
    const insertReceipt = receipt["insertSource"];
    if (plan["kind"] !== "insert-fragment") {
      requireExact(
        insertReceipt,
        null,
        "EDIT_PLAN_RECEIPT_INSERT_SOURCE",
        `${path}.editPlanReceipt.insertSource`,
        "Non-insert plans require a null insert receipt.",
        findings,
      );
    } else if (insertSource?.["kind"] === "complete-draft") {
      if (!isObject(insertReceipt)) {
        addFinding(
          findings,
          "EDIT_PLAN_RECEIPT_COMPLETE_SOURCE",
          `${path}.editPlanReceipt.insertSource`,
          "Complete insertion requires complete source receipt detail.",
        );
      } else {
        checkExactKeys(
          insertReceipt,
          [
            "kind",
            "parserOutcome",
            "quickEntrySnapshotMatched",
            "canonicalTargetMatched",
            "acknowledgedWarningCount",
          ],
          "EDIT_PLAN_RECEIPT_COMPLETE_SOURCE_KEYS",
          `${path}.editPlanReceipt.insertSource`,
          findings,
        );
        requireExact(
          insertReceipt["kind"],
          "complete-draft",
          "EDIT_PLAN_RECEIPT_COMPLETE_KIND",
          `${path}.editPlanReceipt.insertSource.kind`,
          "Complete receipt lane changed.",
          findings,
        );
        requireExact(
          insertReceipt["parserOutcome"],
          "success",
          "EDIT_PLAN_RECEIPT_COMPLETE_PARSE",
          `${path}.editPlanReceipt.insertSource.parserOutcome`,
          "Complete receipt must record T0 success.",
          findings,
        );
        requireExact(
          insertReceipt["quickEntrySnapshotMatched"],
          true,
          "EDIT_PLAN_RECEIPT_SNAPSHOT",
          `${path}.editPlanReceipt.insertSource.quickEntrySnapshotMatched`,
          "Committed insert must prove snapshot match.",
          findings,
        );
        requireExact(
          insertReceipt["canonicalTargetMatched"],
          true,
          "EDIT_PLAN_RECEIPT_TARGET",
          `${path}.editPlanReceipt.insertSource.canonicalTargetMatched`,
          "Committed insert must prove canonical target match.",
          findings,
        );
        requireExact(
          insertReceipt["acknowledgedWarningCount"],
          parserEvidence?.outcome === "success"
            ? recordsAt(
                isObject(expected["parserEvidence"])
                  ? expected["parserEvidence"]["warningRows"]
                  : undefined,
              ).length
            : -1,
          "EDIT_PLAN_RECEIPT_WARNING_COUNT",
          `${path}.editPlanReceipt.insertSource.acknowledgedWarningCount`,
          "Receipt warning count must equal the exact command array.",
          findings,
        );
        requireExact(
          insertSource["warningAcknowledgements"],
          isObject(expected["parserEvidence"])
            ? expected["parserEvidence"]["warningRows"]
            : undefined,
          "EDIT_PLAN_COMPLETE_WARNING_EVIDENCE",
          `${path}.editPlanReceipt.insertSource.acknowledgedWarningCount`,
          "Complete-draft warning acknowledgements must equal independently authored T0 code/range rows in exact order.",
          findings,
        );
        requireExact(
          parserEvidence?.outcome,
          "success",
          "EDIT_PLAN_COMPLETE_PARSER_OUTCOME",
          `${path}.editPlanReceipt.insertSource.parserOutcome`,
          "A committed complete-draft insertion requires independent T0 success evidence.",
          findings,
        );
        const snapshot = isObject(insertSource["quickEntrySnapshot"])
          ? insertSource["quickEntrySnapshot"]
          : {};
        requireExact(
          receiptWork["quickEntryIssueCodesCompared"],
          Array.isArray(snapshot["issueCodes"])
            ? snapshot["issueCodes"].length
            : -1,
          "EDIT_PLAN_RECEIPT_COMPLETE_ISSUE_WORK",
          `${path}.editPlanReceipt.work.quickEntryIssueCodesCompared`,
          "Complete insertion must compare the exact Quick Entry issue-code sequence.",
          findings,
        );
        requireExact(
          receiptWork["warningAcknowledgementsCompared"],
          Array.isArray(insertSource["warningAcknowledgements"])
            ? insertSource["warningAcknowledgements"].length
            : -1,
          "EDIT_PLAN_RECEIPT_COMPLETE_WARNING_WORK",
          `${path}.editPlanReceipt.work.warningAcknowledgementsCompared`,
          "Complete insertion warning work must equal the exact acknowledgement count.",
          findings,
        );
        requireExact(
          receiptWork["insertableChordsExamined"],
          0,
          "EDIT_PLAN_RECEIPT_COMPLETE_RECOVERY_WORK",
          `${path}.editPlanReceipt.work.insertableChordsExamined`,
          "Complete insertion examines no recovery chords.",
          findings,
        );
        requireExact(
          receiptWork["recoveryFieldsCompared"],
          0,
          "EDIT_PLAN_RECEIPT_COMPLETE_RECOVERY_FIELDS",
          `${path}.editPlanReceipt.work.recoveryFieldsCompared`,
          "Complete insertion compares no recovery fields.",
          findings,
        );
      }
    } else if (insertSource?.["kind"] === "recovered-chord") {
      if (!isObject(insertReceipt)) {
        addFinding(
          findings,
          "EDIT_PLAN_RECEIPT_RECOVERED_SOURCE",
          `${path}.editPlanReceipt.insertSource`,
          "Recovered insertion requires complete source receipt detail.",
        );
      } else {
        checkExactKeys(
          insertReceipt,
          [
            "kind",
            "parserOutcome",
            "quickEntrySnapshotMatched",
            "canonicalTargetMatched",
            "selectedGlobalOrdinal",
            "selectedRange",
            "durationSource",
            "siblingsApplied",
            "layoutLossAcknowledged",
          ],
          "EDIT_PLAN_RECEIPT_RECOVERED_SOURCE_KEYS",
          `${path}.editPlanReceipt.insertSource`,
          findings,
        );
        requireExact(
          insertReceipt["kind"],
          "recovered-chord",
          "EDIT_PLAN_RECEIPT_RECOVERED_KIND",
          `${path}.editPlanReceipt.insertSource.kind`,
          "Recovered receipt lane changed.",
          findings,
        );
        requireExact(
          insertReceipt["parserOutcome"],
          "failure",
          "EDIT_PLAN_RECEIPT_RECOVERED_PARSE",
          `${path}.editPlanReceipt.insertSource.parserOutcome`,
          "Recovery must record T0 failure.",
          findings,
        );
        requireExact(
          insertReceipt["selectedGlobalOrdinal"],
          insertSource["selectedGlobalOrdinal"],
          "EDIT_PLAN_RECEIPT_RECOVERED_ORDINAL",
          `${path}.editPlanReceipt.insertSource.selectedGlobalOrdinal`,
          "Receipt ordinal must equal the one selected command ordinal.",
          findings,
        );
        requireExact(
          insertReceipt["durationSource"],
          insertSource["callerDuration"] === null
            ? "t0-resolved"
            : "caller-required",
          "EDIT_PLAN_RECEIPT_RECOVERED_DURATION",
          `${path}.editPlanReceipt.insertSource.durationSource`,
          "Recovered duration source must match the exact caller branch.",
          findings,
        );
        requireExact(
          insertReceipt["siblingsApplied"],
          0,
          "EDIT_PLAN_RECEIPT_RECOVERED_SIBLINGS",
          `${path}.editPlanReceipt.insertSource.siblingsApplied`,
          "No recovery sibling may be applied.",
          findings,
        );
        requireExact(
          insertReceipt["layoutLossAcknowledged"],
          true,
          "EDIT_PLAN_RECEIPT_RECOVERED_LAYOUT",
          `${path}.editPlanReceipt.insertSource.layoutLossAcknowledged`,
          "Recovered receipt must prove layout-loss acknowledgement.",
          findings,
        );
        requireExact(
          insertReceipt["quickEntrySnapshotMatched"],
          true,
          "EDIT_PLAN_RECEIPT_SNAPSHOT",
          `${path}.editPlanReceipt.insertSource.quickEntrySnapshotMatched`,
          "Committed insert must prove snapshot match.",
          findings,
        );
        requireExact(
          insertReceipt["canonicalTargetMatched"],
          true,
          "EDIT_PLAN_RECEIPT_TARGET",
          `${path}.editPlanReceipt.insertSource.canonicalTargetMatched`,
          "Committed insert must prove canonical target match.",
          findings,
        );
        checkExactKeys(
          insertReceipt["selectedRange"],
          A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.sourceRange,
          "EDIT_PLAN_RECEIPT_RECOVERED_RANGE",
          `${path}.editPlanReceipt.insertSource.selectedRange`,
          findings,
        );
        const snapshot = isObject(insertSource["quickEntrySnapshot"])
          ? insertSource["quickEntrySnapshot"]
          : {};
        requireExact(
          receiptWork["quickEntryIssueCodesCompared"],
          Array.isArray(snapshot["issueCodes"])
            ? snapshot["issueCodes"].length
            : -1,
          "EDIT_PLAN_RECEIPT_RECOVERED_ISSUE_WORK",
          `${path}.editPlanReceipt.work.quickEntryIssueCodesCompared`,
          "Recovery must compare the exact Quick Entry issue-code sequence.",
          findings,
        );
        requireExact(
          receiptWork["warningAcknowledgementsCompared"],
          0,
          "EDIT_PLAN_RECEIPT_RECOVERED_WARNING_WORK",
          `${path}.editPlanReceipt.work.warningAcknowledgementsCompared`,
          "Recovered insertion has no success-warning acknowledgement work.",
          findings,
        );
        requireExact(
          receiptWork["insertableChordsExamined"],
          parserEvidence === null
            ? -1
            : parserEvidence.insertableRows.findIndex(
                (row) =>
                  row["globalOrdinal"] ===
                  insertSource["selectedGlobalOrdinal"],
              ) + 1,
          "EDIT_PLAN_RECEIPT_RECOVERED_SCAN_WORK",
          `${path}.editPlanReceipt.work.insertableChordsExamined`,
          "Recovered insertion work is the selected insertable-array position plus one, not the source event ordinal plus one.",
          findings,
        );
        const selectedRow =
          parserEvidence?.insertableRows.find(
            (row) =>
              row["globalOrdinal"] === insertSource["selectedGlobalOrdinal"],
          ) ?? null;
        requireExact(
          insertReceipt["selectedRange"],
          selectedRow?.["range"],
          "EDIT_PLAN_RECEIPT_RECOVERED_SELECTED_RANGE",
          `${path}.editPlanReceipt.insertSource.selectedRange`,
          "Recovered selected range must come from the selected independently authored insertable row.",
          findings,
        );
        requireExact(
          parserEvidence?.outcome,
          "failure",
          "EDIT_PLAN_RECOVERED_PARSER_OUTCOME",
          `${path}.editPlanReceipt.insertSource.parserOutcome`,
          "A committed recovered insertion requires independent T0 failure evidence.",
          findings,
        );
        const selectedDuration = isObject(selectedRow?.["duration"])
          ? selectedRow?.["duration"]
          : {};
        requireExact(
          insertReceipt["durationSource"],
          selectedDuration["kind"] === "resolved"
            ? "t0-resolved"
            : selectedDuration["kind"] === "requires-caller"
              ? "caller-required"
              : null,
          "EDIT_PLAN_RECEIPT_RECOVERED_DURATION_EVIDENCE",
          `${path}.editPlanReceipt.insertSource.durationSource`,
          "Recovered duration branch must follow the selected independent T0 insertable row.",
          findings,
        );
        requireExact(
          receiptWork["recoveryFieldsCompared"],
          A0_U1_ATOMIC_EDIT_LIMITS.recoveryFieldsCompared,
          "EDIT_PLAN_RECEIPT_RECOVERED_FIELD_WORK",
          `${path}.editPlanReceipt.work.recoveryFieldsCompared`,
          "Committed recovery compares every closed recovery field.",
          findings,
        );
      }
    }
    return;
  }

  if (result["ok"] !== false) return;
  checkExactKeys(
    result,
    appliesEditPlan
      ? EXPECTED_FAILURE_RESULT_KEYS
      : ["ok", "state", "refusal", "notice", "effects", "counters"],
    "EDIT_PLAN_FAILURE_RESULT_KEYS",
    path,
    findings,
  );
  if (!appliesEditPlan) return;
  const outerRefusal = isObject(result["refusal"]) ? result["refusal"] : {};
  const nested = result["editPlanRefusal"];
  const prePlanCodes = new Set<string>(
    A0_U1_ATOMIC_EDIT_PREPLAN_OUTER_REFUSAL_CODES,
  );
  if (prePlanCodes.has(String(outerRefusal["code"]))) {
    requireExact(
      nested,
      null,
      "EDIT_PLAN_PREPLAN_REFUSAL_DETAIL",
      `${path}.editPlanRefusal`,
      "A0 envelope refusal occurs before nested edit-plan work.",
      findings,
    );
  } else if (!isObject(nested)) {
    addFinding(
      findings,
      "EDIT_PLAN_NESTED_REFUSAL_MISSING",
      `${path}.editPlanRefusal`,
      "Post-envelope edit-plan refusal requires complete nested detail.",
    );
  } else {
    checkExactKeys(
      nested,
      ["code", "outerCode", "path", "diagnostics", "work"],
      "EDIT_PLAN_NESTED_REFUSAL_KEYS",
      `${path}.editPlanRefusal`,
      findings,
    );
    const diagnostics = recordsAt(nested["diagnostics"]);
    if (
      !Array.isArray(nested["diagnostics"]) ||
      diagnostics.length > A0_U1_ATOMIC_EDIT_LIMITS.retainedDiagnostics
    ) {
      addFinding(
        findings,
        "EDIT_PLAN_NESTED_DIAGNOSTIC_LIMIT",
        `${path}.editPlanRefusal.diagnostics`,
        "Nested refusal diagnostics must be a bounded literal array.",
      );
    }
    const sourceText =
      isObject(command["plan"]) &&
      isObject(command["plan"]["source"]) &&
      isObject(command["plan"]["source"]["quickEntrySnapshot"]) &&
      typeof command["plan"]["source"]["quickEntrySnapshot"]["sourceText"] ===
        "string"
        ? command["plan"]["source"]["quickEntrySnapshot"]["sourceText"]
        : null;
    for (const [index, diagnostic] of diagnostics.entries()) {
      checkExactKeys(
        diagnostic,
        [
          "code",
          "owner",
          "path",
          "sourceRange",
          "syntaxCode",
          "observed",
          "maximum",
        ],
        "EDIT_PLAN_NESTED_DIAGNOSTIC_KEYS",
        `${path}.editPlanRefusal.diagnostics[${String(index)}]`,
        findings,
      );
      if (
        !A0_U1_ATOMIC_EDIT_REFUSAL_CODES.includes(diagnostic["code"] as never)
      ) {
        addFinding(
          findings,
          "EDIT_PLAN_NESTED_DIAGNOSTIC_CODE",
          `${path}.editPlanRefusal.diagnostics[${String(index)}].code`,
          "Diagnostic code must use the exact nested refusal vocabulary.",
        );
      }
      if (diagnostic["owner"] !== "A0/U1") {
        addFinding(
          findings,
          "EDIT_PLAN_NESTED_DIAGNOSTIC_OWNER",
          `${path}.editPlanRefusal.diagnostics[${String(index)}].owner`,
          "Nested diagnostics must use the one sanitized A0/U1 owner token.",
        );
      }
      const diagnosticPath = diagnostic["path"];
      if (
        !Array.isArray(diagnosticPath) ||
        diagnosticPath.length === 0 ||
        !diagnosticPath.every(
          (segment) =>
            (typeof segment === "string" &&
              isUnicodeScalarString(segment) &&
              segment.length <= MAX_SHORT_TEXT_CODE_POINTS) ||
            isNonnegativeSafeInteger(segment),
        )
      ) {
        addFinding(
          findings,
          "EDIT_PLAN_NESTED_DIAGNOSTIC_PATH_TYPE",
          `${path}.editPlanRefusal.diagnostics[${String(index)}].path`,
          "Diagnostic paths must be nonempty arrays of bounded scalar strings or nonnegative safe integers.",
        );
      }
      if (
        diagnostic["sourceRange"] !== null &&
        (sourceText === null ||
          !isValidSourceRange(diagnostic["sourceRange"], sourceText.length))
      ) {
        addFinding(
          findings,
          "EDIT_PLAN_NESTED_DIAGNOSTIC_RANGE",
          `${path}.editPlanRefusal.diagnostics[${String(index)}].sourceRange`,
          "Optional diagnostic ranges must be valid UTF-16 coordinates in the guarded raw source.",
        );
      }
      if (
        diagnostic["syntaxCode"] !== null &&
        !CHART_ERROR_CODES.includes(diagnostic["syntaxCode"] as never)
      ) {
        addFinding(
          findings,
          "EDIT_PLAN_NESTED_DIAGNOSTIC_SYNTAX_CODE",
          `${path}.editPlanRefusal.diagnostics[${String(index)}].syntaxCode`,
          "Optional syntaxCode must come from the accepted T0 error vocabulary, never a mutable message.",
        );
      }
      for (const scalar of ["observed", "maximum"] as const) {
        if (
          diagnostic[scalar] !== null &&
          !isNonnegativeSafeInteger(diagnostic[scalar])
        ) {
          addFinding(
            findings,
            "EDIT_PLAN_NESTED_DIAGNOSTIC_INTEGER",
            `${path}.editPlanRefusal.diagnostics[${String(index)}].${scalar}`,
            "Optional observed/maximum diagnostic values must be nonnegative safe integers.",
          );
        }
      }
    }
    requireExact(
      diagnostics,
      [...diagnostics].sort(compareDiagnostics),
      "EDIT_PLAN_NESTED_DIAGNOSTIC_ORDER",
      `${path}.editPlanRefusal.diagnostics`,
      "Diagnostics must use the source-frozen deterministic path/range/code order before retention.",
      findings,
    );
    requireExact(
      nested["outerCode"],
      outerRefusal["code"],
      "EDIT_PLAN_NESTED_OUTER_CODE",
      `${path}.editPlanRefusal.outerCode`,
      "Nested outerCode must equal the actual A0 refusal code.",
      findings,
    );
    const nestedCode = String(nested["code"]);
    const allowedOuterCodes = expectedAllowedOuterCodesForRefusal(nestedCode);
    if (!allowedOuterCodes.includes(String(outerRefusal["code"]))) {
      addFinding(
        findings,
        "EDIT_PLAN_NESTED_OUTER_FAMILY",
        `${path}.editPlanRefusal.outerCode`,
        "Nested refusal code is paired with an outer code outside its normative family.",
      );
    }
    requireExact(
      nested["path"],
      outerRefusal["path"],
      "EDIT_PLAN_NESTED_OUTER_PATH",
      `${path}.editPlanRefusal.path`,
      "Nested and outer refusal paths must match exactly.",
      findings,
    );
    requireExact(
      nested["work"],
      isObject(expected["counters"])
        ? expected["counters"]["editPlan"]
        : undefined,
      "EDIT_PLAN_NESTED_REFUSAL_WORK",
      `${path}.editPlanRefusal.work`,
      "Nested refusal work must equal independently declared counters.",
      findings,
    );
    if (!A0_U1_ATOMIC_EDIT_REFUSAL_CODES.includes(nested["code"] as never)) {
      addFinding(
        findings,
        "EDIT_PLAN_NESTED_REFUSAL_CODE",
        `${path}.editPlanRefusal.code`,
        "Nested refusal code is outside the exact precedence vocabulary.",
      );
    }
    const nestedWork = isObject(nested["work"]) ? nested["work"] : {};
    requireExact(
      nestedWork["termination"],
      expectedTerminationForNestedCode(nested["code"]),
      "EDIT_PLAN_REFUSAL_TERMINATION_STAGE",
      `${path}.editPlanRefusal.work.termination`,
      "Nested termination must correlate with the refusal's reached runner stage.",
      findings,
    );
    requireExact(
      nestedWork["peakDiagnosticRecords"],
      diagnostics.length,
      "EDIT_PLAN_REFUSAL_DIAGNOSTIC_PEAK",
      `${path}.editPlanRefusal.work.peakDiagnosticRecords`,
      "Retained literal diagnostics and peak diagnostic records must have exact cardinality.",
      findings,
    );
    const expectedValidationCalls =
      nested["code"] === "edit-plan.structural-publication-refused"
        ? 1
        : nested["code"] === "edit-plan.semantic-publication-refused" ||
            nested["code"] === "edit-plan.history-refused"
          ? 2
          : 0;
    requireExact(
      isObject(expected["counters"])
        ? isObject(expected["counters"]["outer"])
          ? expected["counters"]["outer"]["validationCalls"]
          : undefined
        : undefined,
      expectedValidationCalls,
      "EDIT_PLAN_REFUSAL_VALIDATION_STAGE",
      `${path}.counters.validationCalls`,
      "Outer validation-call work must exactly identify whether refusal occurred before F2, in F2, in F3, or after both.",
      findings,
    );
    if (
      diagnostics[0] !== undefined &&
      (diagnostics[0]["code"] !== nested["code"] ||
        !jsonDeepEqual(diagnostics[0]["path"], nested["path"]))
    ) {
      addFinding(
        findings,
        "EDIT_PLAN_PRIMARY_DIAGNOSTIC_CORRELATION",
        `${path}.editPlanRefusal.diagnostics[0]`,
        "The primary retained diagnostic must carry the refusal code and exact outer/nested path.",
      );
    }
  }
}

function documentTotalDuration(document: unknown): ExactRational | null {
  let total: ExactRational = Object.freeze({ numerator: 0n, denominator: 1n });
  for (const section of documentSections(document)) {
    for (const measure of sectionMeasures(section)) {
      for (const event of measureEvents(measure)) {
        const duration = durationRational(event["duration"]);
        if (duration === null) return null;
        total = addRationals(total, duration);
      }
    }
  }
  return total;
}

function validateTransitionMusicalEvidence(
  before: JsonObject,
  after: JsonObject,
  expected: JsonObject,
  operation: unknown,
  result: JsonObject | null,
  path: string,
  findings: A0U1EditPlanContractFinding[],
): void {
  const beforeDocument = before["document"];
  const afterDocument = after["document"];
  const sections = documentSections(afterDocument);
  const measures = sections.flatMap(sectionMeasures);
  const events = measures.flatMap(measureEvents);
  const allIds = [
    isObject(afterDocument) ? afterDocument["id"] : undefined,
    ...sections.map((section) => section["id"]),
    ...measures.map((measure) => measure["id"]),
    ...events.map((event) => event["id"]),
  ];
  if (
    allIds.some((id) => !isStableId(id)) ||
    new Set(allIds).size !== allIds.length
  ) {
    addFinding(
      findings,
      "EDIT_PLAN_GLOBAL_ID_NAMESPACE",
      `${path}.afterState.document`,
      "Every after-document must have one global duplicate-free stable-ID namespace.",
    );
  }
  if (
    sections.length > A0_U1_ATOMIC_EDIT_LIMITS.fragmentSections ||
    sections.some(
      (section) =>
        sectionMeasures(section).length >
        A0_U1_ATOMIC_EDIT_LIMITS.fragmentMeasuresPerSection,
    ) ||
    measures.length > A0_U1_ATOMIC_EDIT_LIMITS.fragmentMeasures ||
    events.length > A0_U1_ATOMIC_EDIT_LIMITS.fragmentEvents
  ) {
    addFinding(
      findings,
      "EDIT_PLAN_FINAL_COLLECTION_LIMIT",
      `${path}.afterState.document`,
      "After-document collections exceed an exact domain maximum.",
    );
  }
  if (allIds.length > A0_U1_ATOMIC_EDIT_LIMITS.occupiedIdRecords) {
    addFinding(
      findings,
      "EDIT_PLAN_OCCUPIED_ID_LIMIT",
      `${path}.afterState.document`,
      "The complete global document/section/measure/event ID index exceeds its exact record cap.",
    );
  }
  for (const [sectionIndex, section] of sections.entries()) {
    validateSectionMetadata(
      sectionMetadataProjection(section),
      `${path}.afterState.document.sections[${String(sectionIndex)}]`,
      findings,
    );
  }
  for (const [eventIndex, event] of events.entries()) {
    if (!isCanonicalPositiveDuration(event["duration"])) {
      addFinding(
        findings,
        "EDIT_PLAN_DOCUMENT_DURATION_CANONICAL",
        `${path}.afterState.document.events[${String(eventIndex)}].duration`,
        "Every persistent event duration must be a positive reduced bounded PPQ rational.",
      );
    }
  }
  requireExact(
    expected["eventOrder"],
    documentEventOrder(afterDocument),
    "EDIT_PLAN_EVENT_ORDER_LITERAL",
    `${path}.eventOrder`,
    "Expected event order must equal the independently flattened after-document order.",
    findings,
  );
  const time = expected["exactTimeEvidence"];
  checkExactKeys(
    time,
    [
      "beforeTotal",
      "afterTotal",
      "difference",
      "insertedDuration",
      "floatingPointUsed",
    ],
    "EDIT_PLAN_EXACT_TIME_KEYS",
    `${path}.exactTimeEvidence`,
    findings,
  );
  if (!isObject(time)) return;
  const beforeTotal = documentTotalDuration(beforeDocument);
  const afterTotal = documentTotalDuration(afterDocument);
  if (beforeTotal === null || afterTotal === null) {
    addFinding(
      findings,
      "EDIT_PLAN_EXACT_TIME_DOCUMENT",
      `${path}.exactTimeEvidence`,
      "Before and after documents must contain independently summable exact durations.",
    );
    return;
  }
  const difference = subtractRationals(afterTotal, beforeTotal);
  if (
    afterTotal.numerator >
    BigInt(A0_U1_ATOMIC_EDIT_LIMITS.finalTimelineQuarterNoteBeats) *
      afterTotal.denominator
  ) {
    addFinding(
      findings,
      "EDIT_PLAN_FINAL_TIMELINE_LIMIT",
      `${path}.afterState.document`,
      "After-document exact duration exceeds the domain timeline maximum.",
    );
  }
  requireExact(
    time["beforeTotal"],
    rationalText(beforeTotal),
    "EDIT_PLAN_BEFORE_TOTAL",
    `${path}.exactTimeEvidence.beforeTotal`,
    "Before total does not match the literal document.",
    findings,
  );
  requireExact(
    time["afterTotal"],
    rationalText(afterTotal),
    "EDIT_PLAN_AFTER_TOTAL",
    `${path}.exactTimeEvidence.afterTotal`,
    "After total does not match the literal document.",
    findings,
  );
  requireExact(
    time["difference"],
    rationalText(difference),
    "EDIT_PLAN_TIME_DIFFERENCE",
    `${path}.exactTimeEvidence.difference`,
    "Exact time difference must be independently recomputed.",
    findings,
  );
  const committedInsertion =
    operation === "insert-fragment" &&
    result?.["ok"] === true &&
    result["outcome"] === "committed" &&
    difference.numerator > 0n;
  requireExact(
    time["insertedDuration"],
    committedInsertion ? rationalText(difference) : null,
    "EDIT_PLAN_INSERTED_DURATION",
    `${path}.exactTimeEvidence.insertedDuration`,
    "Only a committed insertion may declare the independently computed positive inserted duration.",
    findings,
  );
  if (time["floatingPointUsed"] !== false) {
    addFinding(
      findings,
      "EDIT_PLAN_FLOATING_TIME",
      `${path}.exactTimeEvidence.floatingPointUsed`,
      "Exact musical time evidence may never use floating point.",
    );
  }
  if (
    result?.["ok"] === true &&
    operation !== "insert-fragment" &&
    difference.numerator !== 0n
  ) {
    addFinding(
      findings,
      "EDIT_PLAN_TIMELINE_NOT_PRESERVED",
      `${path}.exactTimeEvidence.difference`,
      "Split/join event and section operations must preserve exact total duration.",
    );
  }
}

function validateNonnegativeIntegerRecord(
  value: unknown,
  exactKeys: readonly string[],
  code: string,
  path: string,
  findings: A0U1EditPlanContractFinding[],
): void {
  checkExactKeys(value, exactKeys, code, path, findings);
  if (!isObject(value)) return;
  for (const key of exactKeys) {
    const observed = value[key];
    if (
      typeof observed !== "number" ||
      !Number.isSafeInteger(observed) ||
      observed < 0
    ) {
      addFinding(
        findings,
        code,
        `${path}.${key}`,
        "Every deterministic work counter must be a nonnegative safe integer.",
      );
    }
  }
}

function validateTransitionWorkCounters(
  value: unknown,
  phase: unknown,
  path: string,
  findings: A0U1EditPlanContractFinding[],
): void {
  checkExactKeys(
    value,
    ["outer", "editPlan"],
    "EDIT_PLAN_COUNTER_ENVELOPE",
    path,
    findings,
  );
  if (!isObject(value)) return;
  validateNonnegativeIntegerRecord(
    value["outer"],
    APPLICATION_WORK_COUNTER_NAMES,
    "EDIT_PLAN_OUTER_COUNTERS",
    `${path}.outer`,
    findings,
  );
  const editPlan = value["editPlan"];
  if (phase === "undo" || phase === "redo") {
    if (editPlan !== null) {
      addFinding(
        findings,
        "EDIT_PLAN_HISTORY_COUNTER_SCOPE",
        `${path}.editPlan`,
        "Undo and redo do not rerun an edit plan and therefore require a null nested counter record.",
      );
    }
    return;
  }
  if (editPlan === null) {
    if (phase === "apply") {
      addFinding(
        findings,
        "EDIT_PLAN_COMMIT_COUNTER_SCOPE",
        `${path}.editPlan`,
        "Committed edit plans require complete nested work evidence.",
      );
    }
    return;
  }
  if (!isObject(editPlan)) {
    addFinding(
      findings,
      "EDIT_PLAN_NESTED_COUNTERS",
      `${path}.editPlan`,
      "Command/refusal transitions require a complete nested edit-plan work record.",
    );
    return;
  }
  const { termination, ...numericCounters } = editPlan;
  validateNonnegativeIntegerRecord(
    numericCounters,
    A0_U1_ATOMIC_EDIT_WORK_COUNTER_NAMES,
    "EDIT_PLAN_NESTED_COUNTERS",
    `${path}.editPlan`,
    findings,
  );
  if (
    ![
      "complete",
      "input-refusal",
      "allocation-refusal",
      "publication-refusal",
      "history-refusal",
    ].includes(String(termination))
  ) {
    addFinding(
      findings,
      "EDIT_PLAN_TERMINATION",
      `${path}.editPlan.termination`,
      "Nested work evidence must end in one closed deterministic termination.",
    );
  }
  const counterMaxima: Readonly<Record<string, number>> = {
    planNodesVisited: A0_U1_ATOMIC_EDIT_LIMITS.planNodeRecords + 1,
    sourceCodePointsObserved:
      A0_U1_ATOMIC_EDIT_LIMITS.fragmentSourceCodePoints + 1,
    sourceUtf8BytesObserved:
      A0_U1_ATOMIC_EDIT_LIMITS.fragmentSourceUtf8Bytes + 1,
    quickEntrySnapshotFieldsCompared:
      A0_U1_ATOMIC_EDIT_LIMITS.quickEntrySnapshotFieldsCompared,
    quickEntryIssueCodesCompared:
      A0_U1_ATOMIC_EDIT_LIMITS.quickEntryIssueCodes + 1,
    syntaxParseCalls: 1,
    warningAcknowledgementsCompared:
      A0_U1_ATOMIC_EDIT_LIMITS.retainedWarningAcknowledgements + 1,
    insertableChordsExamined:
      A0_U1_ATOMIC_EDIT_LIMITS.insertableChordsExamined + 1,
    recoveryFieldsCompared: A0_U1_ATOMIC_EDIT_LIMITS.recoveryFieldsCompared,
    draftSectionsVisited: A0_U1_ATOMIC_EDIT_LIMITS.fragmentSections + 1,
    draftMeasuresVisited: A0_U1_ATOMIC_EDIT_LIMITS.fragmentMeasures + 1,
    draftEventsVisited: A0_U1_ATOMIC_EDIT_LIMITS.fragmentEvents + 1,
    completionDeclarationsVisited:
      A0_U1_ATOMIC_EDIT_LIMITS.completionDeclarations + 1,
    metadataFieldsCompared: A0_U1_ATOMIC_EDIT_LIMITS.metadataFieldsCompared + 1,
    exactBeatAdditions: A0_U1_ATOMIC_EDIT_LIMITS.exactBeatAdditions + 1,
    exactBeatComparisons: A0_U1_ATOMIC_EDIT_LIMITS.exactBeatComparisons + 1,
    idAllocationAttempts: A0_U1_ATOMIC_EDIT_LIMITS.idAllocationAttempts,
    idCollisionChecks: A0_U1_ATOMIC_EDIT_LIMITS.idAllocationAttempts,
    bookmarkRecordsExamined:
      A0_U1_ATOMIC_EDIT_LIMITS.bookmarkRecordsExamined + 1,
    bookmarkRecordsRewritten: A0_U1_ATOMIC_EDIT_LIMITS.bookmarkRecordsExamined,
    peakPlanNodeRecords: A0_U1_ATOMIC_EDIT_LIMITS.planNodeRecords,
    peakAllocatedIdRecords: A0_U1_ATOMIC_EDIT_LIMITS.idAllocationAttempts,
    peakDiagnosticRecords: A0_U1_ATOMIC_EDIT_LIMITS.retainedDiagnostics,
  };
  for (const [counterName, maximum] of Object.entries(counterMaxima)) {
    const observed = numericCounters[counterName];
    if (typeof observed === "number" && observed > maximum) {
      addFinding(
        findings,
        "EDIT_PLAN_COUNTER_BOUND",
        `${path}.editPlan.${counterName}`,
        `Counter exceeds its deterministic maximum or maximum-plus-one witness ${String(maximum)}.`,
      );
    }
  }
}

function expectedAllocationKinds(
  command: unknown,
  parserEvidence: ParserEvidenceView | null,
): readonly ("section" | "measure" | "event")[] | null {
  if (!isObject(command) || !isObject(command["plan"])) return null;
  const plan = command["plan"];
  switch (plan["kind"]) {
    case "insert-fragment": {
      if (parserEvidence === null || !isObject(plan["source"])) return null;
      if (plan["source"]["kind"] === "recovered-chord") return ["event"];
      if (!isObject(plan["placement"])) return null;
      if (plan["placement"]["kind"] === "into-measure") {
        return parserEvidence.insertableRows.map(() => "event");
      }
      if (plan["placement"]["kind"] === "into-section") {
        return parserEvidence.measureRows.flatMap((measure) => [
          "measure" as const,
          ...parserEvidence.insertableRows
            .filter(
              (event) =>
                event["sourceSectionOrdinal"] ===
                  measure["sourceSectionOrdinal"] &&
                event["sourceMeasureOrdinal"] ===
                  measure["sourceMeasureOrdinal"],
            )
            .map(() => "event" as const),
        ]);
      }
      if (plan["placement"]["kind"] === "into-document") {
        return parserEvidence.sectionRows.flatMap((section) => [
          "section" as const,
          ...parserEvidence.measureRows
            .filter(
              (measure) =>
                measure["sourceSectionOrdinal"] ===
                section["sourceSectionOrdinal"],
            )
            .flatMap((measure) => [
              "measure" as const,
              ...parserEvidence.insertableRows
                .filter(
                  (event) =>
                    event["sourceSectionOrdinal"] ===
                      measure["sourceSectionOrdinal"] &&
                    event["sourceMeasureOrdinal"] ===
                      measure["sourceMeasureOrdinal"],
                )
                .map(() => "event" as const),
            ]),
        ]);
      }
      return null;
    }
    case "split-event-duration":
      return ["event"];
    case "split-section":
      return ["section"];
    case "join-event-durations":
    case "join-sections":
      return [];
    default:
      return null;
  }
}

function validateAllocationTrace(
  before: JsonObject,
  command: unknown,
  result: JsonObject | null,
  counters: unknown,
  allocationTrace: unknown,
  parserEvidence: ParserEvidenceView | null,
  phase: unknown,
  path: string,
  findings: A0U1EditPlanContractFinding[],
): void {
  if (!Array.isArray(allocationTrace)) {
    addFinding(
      findings,
      "EDIT_PLAN_ALLOCATION_TRACE_LITERAL",
      path,
      "Allocation trace must be a complete literal array.",
    );
    return;
  }
  if (phase === "undo" || phase === "redo") {
    requireExact(
      allocationTrace,
      [],
      "EDIT_PLAN_HISTORY_ALLOCATION_TRACE",
      path,
      "Undo and redo reuse committed IDs and never invoke the ID factory.",
      findings,
    );
    return;
  }
  const expectedKinds = expectedAllocationKinds(command, parserEvidence);
  const occupied = new Set([
    isObject(before["document"]) ? String(before["document"]["id"]) : "",
    ...identityRecords(before["document"]).sections,
    ...identityRecords(before["document"]).measures,
    ...identityRecords(before["document"]).events,
  ]);
  const accepted = new Set<string>();
  let collisionChecks = 0;
  for (const [index, row] of allocationTrace.entries()) {
    checkExactKeys(
      row,
      ["ordinal", "kind", "allocatedId", "outcome"],
      "EDIT_PLAN_ALLOCATION_TRACE_KEYS",
      `${path}[${String(index)}]`,
      findings,
    );
    if (!isObject(row)) continue;
    if (
      row["ordinal"] !== index ||
      !["section", "measure", "event"].includes(String(row["kind"])) ||
      expectedKinds?.[index] !== row["kind"]
    ) {
      addFinding(
        findings,
        "EDIT_PLAN_ALLOCATION_TRACE_ORDER",
        `${path}[${String(index)}]`,
        "Allocation attempts must be contiguous and follow the independently derived structural kind preorder.",
      );
    }
    const outcome = row["outcome"];
    if (
      !["accepted", "factory-refusal", "collision-refusal"].includes(
        String(outcome),
      ) ||
      (outcome !== "accepted" && index !== allocationTrace.length - 1)
    ) {
      addFinding(
        findings,
        "EDIT_PLAN_ALLOCATION_TRACE_OUTCOME",
        `${path}[${String(index)}].outcome`,
        "Only the final attempt may refuse, and outcomes use the closed allocation vocabulary.",
      );
    }
    if (outcome === "factory-refusal") {
      if (row["allocatedId"] !== null) {
        addFinding(
          findings,
          "EDIT_PLAN_FACTORY_REFUSAL_ID",
          `${path}[${String(index)}].allocatedId`,
          "A factory refusal returns no ID.",
        );
      }
      continue;
    }
    if (!isStableId(row["allocatedId"])) {
      addFinding(
        findings,
        "EDIT_PLAN_ALLOCATION_TRACE_ID",
        `${path}[${String(index)}].allocatedId`,
        "Every returned allocation ID must satisfy the stable-ID wire grammar.",
      );
      continue;
    }
    collisionChecks += 1;
    if (outcome === "accepted") {
      if (occupied.has(row["allocatedId"]) || accepted.has(row["allocatedId"])) {
        addFinding(
          findings,
          "EDIT_PLAN_ACCEPTED_ID_COLLISION",
          `${path}[${String(index)}].allocatedId`,
          "An accepted factory result must be fresh in the global before-document namespace and local reservation set.",
        );
      }
      accepted.add(row["allocatedId"]);
    } else if (
      !occupied.has(row["allocatedId"]) &&
      !accepted.has(row["allocatedId"])
    ) {
      addFinding(
        findings,
        "EDIT_PLAN_COLLISION_NOT_REAL",
        `${path}[${String(index)}].allocatedId`,
        "A collision refusal must name an actually occupied or already reserved ID.",
      );
    }
  }
  const nestedCounters = isObject(counters) ? counters["editPlan"] : null;
  if (isObject(nestedCounters)) {
    requireExact(
      nestedCounters["idAllocationAttempts"],
      allocationTrace.length,
      "EDIT_PLAN_ALLOCATION_ATTEMPT_CARDINALITY",
      `${path}.idAllocationAttempts`,
      "Allocation attempts must equal the exact trace cardinality, including the one failed attempt.",
      findings,
    );
    requireExact(
      nestedCounters["idCollisionChecks"],
      collisionChecks,
      "EDIT_PLAN_COLLISION_CHECK_CARDINALITY",
      `${path}.idCollisionChecks`,
      "Collision checks occur once for every returned ID and never for a factory refusal.",
      findings,
    );
    requireExact(
      nestedCounters["peakAllocatedIdRecords"],
      accepted.size,
      "EDIT_PLAN_ALLOCATION_PEAK_CARDINALITY",
      `${path}.peakAllocatedIdRecords`,
      "Peak locally reserved ID records equal the accepted prefix cardinality.",
      findings,
    );
  } else {
    requireExact(
      allocationTrace,
      [],
      "EDIT_PLAN_PREPLAN_ALLOCATION_TRACE",
      path,
      "A pre-plan refusal has no allocation trace.",
      findings,
    );
  }
  const nestedCode =
    result?.["ok"] === false && isObject(result["editPlanRefusal"])
      ? result["editPlanRefusal"]["code"]
      : null;
  const expectedFinalOutcome =
    nestedCode === "edit-plan.id-factory-failed"
      ? "factory-refusal"
      : nestedCode === "edit-plan.id-collision"
        ? "collision-refusal"
        : null;
  if (expectedFinalOutcome !== null) {
    requireExact(
      isObject(allocationTrace[allocationTrace.length - 1])
        ? allocationTrace[allocationTrace.length - 1]["outcome"]
        : undefined,
      expectedFinalOutcome,
      "EDIT_PLAN_ALLOCATION_REFUSAL_TRACE",
      path,
      "Allocation refusal code must equal the final trace outcome.",
      findings,
    );
  } else if (
    allocationTrace.some(
      (row) => isObject(row) && row["outcome"] !== "accepted",
    )
  ) {
    addFinding(
      findings,
      "EDIT_PLAN_SPURIOUS_ALLOCATION_REFUSAL_TRACE",
      path,
      "A non-allocation-refusal transition may contain only accepted allocation rows.",
    );
  }
  if (
    result?.["ok"] === true &&
    phase === "apply" &&
    expectedKinds !== null &&
    allocationTrace.length !== expectedKinds.length
  ) {
    addFinding(
      findings,
      "EDIT_PLAN_SUCCESS_ALLOCATION_CARDINALITY",
      path,
      "A committed transition must consume exactly every independently derived allocation position.",
    );
  }
}

function reciprocalIncludes(
  record: JsonObject,
  field: string,
  id: string,
): boolean {
  return stringsAt(record[field]).includes(id);
}

function operationAllowed(value: unknown): boolean {
  return (
    value === "pipeline" ||
    A0_U1_ATOMIC_EDIT_PLAN_KINDS.includes(
      value as (typeof A0_U1_ATOMIC_EDIT_PLAN_KINDS)[number],
    )
  );
}

function validateBeatDurationShape(
  value: unknown,
  path: string,
  findings: A0U1EditPlanContractFinding[],
): void {
  checkExactKeys(
    value,
    ["numerator", "denominator"],
    "EDIT_PLAN_DURATION_KEYS",
    path,
    findings,
  );
  if (!isCanonicalPositiveDuration(value)) {
    addFinding(
      findings,
      "EDIT_PLAN_DURATION_VALUE",
      path,
      "Command durations must be positive, reduced, numerator-bounded exact rationals using the closed PPQ denominator set.",
    );
  }
}

function validateSourceRange(
  value: unknown,
  sourceLength: number,
  path: string,
  findings: A0U1EditPlanContractFinding[],
): void {
  checkExactKeys(
    value,
    A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.sourceRange,
    "EDIT_PLAN_SOURCE_RANGE_KEYS",
    path,
    findings,
  );
  if (!isValidSourceRange(value, sourceLength)) {
    addFinding(
      findings,
      "EDIT_PLAN_SOURCE_RANGE_VALUE",
      path,
      "Source ranges must be canonical nonnegative UTF-16 half-open coordinates within the exact raw source.",
    );
  }
}

function validateBoundaryShape(
  value: unknown,
  path: string,
  findings: A0U1EditPlanContractFinding[],
): void {
  if (!isObject(value)) {
    addFinding(
      findings,
      "EDIT_PLAN_BOUNDARY_SHAPE",
      path,
      "Boundary must be an object.",
    );
    return;
  }
  const kind = value["kind"];
  const keys =
    kind === "document-start" || kind === "document-end"
      ? A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.documentBoundary
      : [
            "before-section",
            "after-section",
            "section-start",
            "section-end",
          ].includes(String(kind))
        ? A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.sectionBoundary
        : [
              "before-measure",
              "after-measure",
              "measure-start",
              "measure-end",
            ].includes(String(kind))
          ? A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.measureBoundary
          : kind === "before-event" || kind === "after-event"
            ? A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.eventBoundary
            : null;
  if (keys === null) {
    addFinding(
      findings,
      "EDIT_PLAN_BOUNDARY_KIND",
      `${path}.kind`,
      "Quick Entry target is outside the stable boundary vocabulary.",
    );
    return;
  }
  checkExactKeys(value, keys, "EDIT_PLAN_BOUNDARY_KEYS", path, findings);
  const idKey =
    keys === A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.sectionBoundary
      ? "sectionId"
      : keys === A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.measureBoundary
        ? "measureId"
        : keys === A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.eventBoundary
          ? "eventId"
          : null;
  if (idKey !== null && !isStableId(value[idKey])) {
    addFinding(
      findings,
      "EDIT_PLAN_BOUNDARY_ID",
      `${path}.${idKey}`,
      "Boundary IDs must use the canonical stable-ID wire grammar.",
    );
  }
}

function validateCompletionDeclarations(
  value: unknown,
  expectedLength: number,
  path: string,
  findings: A0U1EditPlanContractFinding[],
): void {
  if (!Array.isArray(value) || value.length !== expectedLength) {
    addFinding(
      findings,
      "EDIT_PLAN_COMPLETION_COUNT",
      path,
      `Expected exactly ${String(expectedLength)} completion declarations.`,
    );
    return;
  }
  const measureIds = value
    .filter(isObject)
    .map((declaration) => declaration["measureId"]);
  if (new Set(measureIds).size !== measureIds.length) {
    addFinding(
      findings,
      "EDIT_PLAN_COMPLETION_DUPLICATE",
      path,
      "Completion declarations must be duplicate-free.",
    );
  }
  for (const [index, declaration] of value.entries()) {
    checkExactKeys(
      declaration,
      A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.completionDeclaration,
      "EDIT_PLAN_COMPLETION_KEYS",
      `${path}[${String(index)}]`,
      findings,
    );
    if (!isObject(declaration)) continue;
    if (!isStableId(declaration["measureId"])) {
      addFinding(
        findings,
        "EDIT_PLAN_COMPLETION_MEASURE_ID",
        `${path}[${String(index)}].measureId`,
        "Completion declaration measure IDs must be canonical stable IDs.",
      );
    }
    const completion = declaration["completion"];
    if (!isObject(completion)) {
      addFinding(
        findings,
        "EDIT_PLAN_COMPLETION_SHAPE",
        `${path}[${String(index)}].completion`,
        "Completion declaration must carry one exact completion object.",
      );
      continue;
    }
    const completionKind = completion["kind"];
    const completionKeys =
      completionKind === "empty" || completionKind === "complete"
        ? ["kind"]
        : completionKind === "pickup" || completionKind === "incomplete"
          ? ["kind", "expectedDuration", "reason"]
          : [];
    checkExactKeys(
      completion,
      completionKeys,
      "EDIT_PLAN_COMPLETION_SHAPE",
      `${path}[${String(index)}].completion`,
      findings,
    );
    if (completionKeys.length === 0) {
      addFinding(
        findings,
        "EDIT_PLAN_COMPLETION_KIND",
        `${path}[${String(index)}].completion.kind`,
        "Completion kind is outside the closed domain vocabulary.",
      );
    } else if (
      completionKind === "pickup" ||
      completionKind === "incomplete"
    ) {
      validateBeatDurationShape(
        completion["expectedDuration"],
        `${path}[${String(index)}].completion.expectedDuration`,
        findings,
      );
      if (!isStableId(plan["eventId"])) {
        addFinding(
          findings,
          "EDIT_PLAN_SPLIT_EVENT_ID",
          `${planPath}.eventId`,
          "Split-event target must be a canonical stable ID.",
        );
      }
      if (
        typeof completion["reason"] !== "string" ||
        !isUnicodeScalarString(completion["reason"]) ||
        codePointLength(completion["reason"]) > MAX_LONG_TEXT_CODE_POINTS ||
        completion["reason"].trim().length === 0
      ) {
        addFinding(
          findings,
          "EDIT_PLAN_COMPLETION_REASON",
          `${path}[${String(index)}].completion.reason`,
          "Partial completion reasons must be nonblank bounded Unicode scalar text.",
        );
      }
    }
  }
}

function validateSectionMetadata(
  value: unknown,
  path: string,
  findings: A0U1EditPlanContractFinding[],
): void {
  checkExactKeys(
    value,
    A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.sectionMetadata,
    "EDIT_PLAN_SECTION_METADATA_KEYS",
    path,
    findings,
  );
  if (!isObject(value)) return;
  if (
    typeof value["name"] !== "string" ||
    value["name"].trim().length === 0 ||
    !isUnicodeScalarString(value["name"]) ||
    codePointLength(value["name"]) > MAX_SHORT_TEXT_CODE_POINTS
  ) {
    addFinding(
      findings,
      "EDIT_PLAN_SECTION_NAME",
      `${path}.name`,
      "Section names must be nonblank bounded Unicode scalar text.",
    );
  }
  if (
    typeof value["annotation"] !== "string" ||
    !isUnicodeScalarString(value["annotation"]) ||
    codePointLength(value["annotation"]) > MAX_LONG_TEXT_CODE_POINTS
  ) {
    addFinding(
      findings,
      "EDIT_PLAN_SECTION_ANNOTATION",
      `${path}.annotation`,
      "Section annotations must be bounded Unicode scalar text.",
    );
  }
  if (
    !SECTION_VOICE_LEADING_BOUNDARIES.includes(
      value["voiceLeadingBoundary"] as never,
    )
  ) {
    addFinding(
      findings,
      "EDIT_PLAN_SECTION_BOUNDARY",
      `${path}.voiceLeadingBoundary`,
      "Section metadata must use the closed voice-leading boundary vocabulary.",
    );
  }
  const keyOverride = value["keyOverride"];
  if (keyOverride === null) return;
  checkExactKeys(
    keyOverride,
    ["tonic", "mode"],
    "EDIT_PLAN_SECTION_KEY_KEYS",
    `${path}.keyOverride`,
    findings,
  );
  if (!isObject(keyOverride)) return;
  checkExactKeys(
    keyOverride["tonic"],
    ["step", "alter"],
    "EDIT_PLAN_SECTION_TONIC_KEYS",
    `${path}.keyOverride.tonic`,
    findings,
  );
  const tonic = isObject(keyOverride["tonic"]) ? keyOverride["tonic"] : {};
  if (
    !["A", "B", "C", "D", "E", "F", "G"].includes(String(tonic["step"])) ||
    typeof tonic["alter"] !== "number" ||
    !Number.isSafeInteger(tonic["alter"]) ||
    tonic["alter"] < -2 ||
    tonic["alter"] > 2
  ) {
    addFinding(
      findings,
      "EDIT_PLAN_SECTION_TONIC_VALUE",
      `${path}.keyOverride.tonic`,
      "Key tonic must be a bounded spelled pitch class.",
    );
  }
  if (!KEY_MODES.includes(keyOverride["mode"] as never)) {
    addFinding(
      findings,
      "EDIT_PLAN_SECTION_KEY_MODE",
      `${path}.keyOverride.mode`,
      "Key override mode is outside the closed domain vocabulary.",
    );
  }
}

function canonicalTargetForPlacement(placement: JsonObject): unknown {
  if (placement["kind"] === "into-measure") {
    return placement["beforeEventId"] === null
      ? { kind: "measure-end", measureId: placement["measureId"] }
      : { kind: "before-event", eventId: placement["beforeEventId"] };
  }
  if (placement["kind"] === "into-section") {
    return placement["beforeMeasureId"] === null
      ? { kind: "section-end", sectionId: placement["sectionId"] }
      : { kind: "before-measure", measureId: placement["beforeMeasureId"] };
  }
  if (placement["kind"] === "into-document") {
    return placement["beforeSectionId"] === null
      ? { kind: "document-end" }
      : { kind: "before-section", sectionId: placement["beforeSectionId"] };
  }
  return undefined;
}

type ParserEvidenceView = Readonly<{
  outcome: "success" | "failure";
  sectionRows: readonly JsonObject[];
  measureRows: readonly JsonObject[];
  allEventSlots: readonly JsonObject[];
  insertableRows: readonly JsonObject[];
}>;

function validateParserEvidence(
  before: JsonObject,
  command: unknown,
  operation: unknown,
  phase: unknown,
  evidence: unknown,
  path: string,
  findings: A0U1EditPlanContractFinding[],
): ParserEvidenceView | null {
  const commandRecord = isObject(command) ? command : null;
  const plan = isObject(commandRecord?.["plan"])
    ? commandRecord["plan"]
    : null;
  const source = isObject(plan?.["source"]) ? plan["source"] : null;
  const snapshot = isObject(source?.["quickEntrySnapshot"])
    ? source["quickEntrySnapshot"]
    : null;
  const sourceText =
    typeof snapshot?.["sourceText"] === "string"
      ? snapshot["sourceText"]
      : null;
  const needsEvidence =
    phase === "apply" &&
    operation === "insert-fragment" &&
    plan?.["kind"] === "insert-fragment" &&
    sourceText !== null;
  if (!needsEvidence) {
    requireExact(
      evidence,
      null,
      "EDIT_PLAN_PARSER_EVIDENCE_SCOPE",
      path,
      "Parser evidence is null unless an apply transition carries an accessible insert-fragment raw source.",
      findings,
    );
    return null;
  }
  checkExactKeys(
    evidence,
    EXPECTED_PARSER_EVIDENCE_KEYS,
    "EDIT_PLAN_PARSER_EVIDENCE_KEYS",
    path,
    findings,
  );
  if (!isObject(evidence)) return null;
  requireExact(
    evidence["authorityId"],
    "A0U1-AUTH-T0",
    "EDIT_PLAN_PARSER_EVIDENCE_AUTHORITY",
    `${path}.authorityId`,
    "Parser evidence must explicitly cite the independently reviewed T0 authority.",
    findings,
  );
  requireExact(
    evidence["independence"],
    {
      productionOutputUsedAsOracle: false,
      expectedValuesGenerated: false,
    },
    "EDIT_PLAN_PARSER_EVIDENCE_INDEPENDENCE",
    `${path}.independence`,
    "Parser evidence must be independently authored rather than generated from production output.",
    findings,
  );
  requireExact(
    evidence["sourceText"],
    sourceText,
    "EDIT_PLAN_PARSER_EVIDENCE_SOURCE",
    `${path}.sourceText`,
    "Parser evidence raw source must equal the guarded command source code-unit-for-code-unit.",
    findings,
  );
  requireExact(
    evidence["mode"],
    "fragment",
    "EDIT_PLAN_PARSER_EVIDENCE_MODE",
    `${path}.mode`,
    "A0/U1 always requests T0 fragment mode.",
    findings,
  );
  const beforeDocument = isObject(before["document"]) ? before["document"] : {};
  requireExact(
    evidence["meter"],
    beforeDocument["meter"],
    "EDIT_PLAN_PARSER_EVIDENCE_METER",
    `${path}.meter`,
    "Parser evidence must use the current document meter.",
    findings,
  );
  requireExact(
    evidence["accidentalStyle"],
    "ascii",
    "EDIT_PLAN_PARSER_EVIDENCE_ACCIDENTAL_STYLE",
    `${path}.accidentalStyle`,
    "A0/U1 fragment parsing uses the fixed ASCII accidental style.",
    findings,
  );
  const outcome = evidence["outcome"];
  if (outcome !== "success" && outcome !== "failure") {
    addFinding(
      findings,
      "EDIT_PLAN_PARSER_EVIDENCE_OUTCOME",
      `${path}.outcome`,
      "Parser evidence outcome must be success or failure.",
    );
    return null;
  }
  const warningRows = recordsAt(evidence["warningRows"]);
  const diagnosticRows = recordsAt(evidence["diagnosticRows"]);
  if (!Array.isArray(evidence["warningRows"])) {
    addFinding(
      findings,
      "EDIT_PLAN_PARSER_WARNING_ROWS",
      `${path}.warningRows`,
      "Parser warning evidence must be a complete literal array.",
    );
  }
  if (!Array.isArray(evidence["diagnosticRows"])) {
    addFinding(
      findings,
      "EDIT_PLAN_PARSER_DIAGNOSTIC_ROWS",
      `${path}.diagnosticRows`,
      "Parser diagnostic evidence must be a complete literal array.",
    );
  }
  for (const [index, row] of warningRows.entries()) {
    checkExactKeys(
      row,
      EXPECTED_PARSER_DIAGNOSTIC_ROW_KEYS,
      "EDIT_PLAN_PARSER_WARNING_KEYS",
      `${path}.warningRows[${String(index)}]`,
      findings,
    );
    if (!CHART_WARNING_CODES.includes(row["code"] as never)) {
      addFinding(
        findings,
        "EDIT_PLAN_PARSER_WARNING_CODE",
        `${path}.warningRows[${String(index)}].code`,
        "Parser warning evidence must use the accepted T0 warning vocabulary.",
      );
    }
    validateSourceRange(
      row["range"],
      sourceText.length,
      `${path}.warningRows[${String(index)}].range`,
      findings,
    );
  }
  for (const [index, row] of diagnosticRows.entries()) {
    checkExactKeys(
      row,
      EXPECTED_PARSER_DIAGNOSTIC_ROW_KEYS,
      "EDIT_PLAN_PARSER_DIAGNOSTIC_KEYS",
      `${path}.diagnosticRows[${String(index)}]`,
      findings,
    );
    if (!CHART_ERROR_CODES.includes(row["code"] as never)) {
      addFinding(
        findings,
        "EDIT_PLAN_PARSER_DIAGNOSTIC_CODE",
        `${path}.diagnosticRows[${String(index)}].code`,
        "Parser diagnostic evidence must use the accepted T0 error vocabulary.",
      );
    }
    validateSourceRange(
      row["range"],
      sourceText.length,
      `${path}.diagnosticRows[${String(index)}].range`,
      findings,
    );
  }
  if (
    (outcome === "success" && diagnosticRows.length !== 0) ||
    (outcome === "failure" && diagnosticRows.length === 0) ||
    (outcome === "failure" && warningRows.length !== 0)
  ) {
    addFinding(
      findings,
      "EDIT_PLAN_PARSER_OUTCOME_ROWS",
      path,
      "Success has no diagnostics; failure has at least one diagnostic and no warning publication.",
    );
  }

  const sectionRows = recordsAt(evidence["sectionRows"]);
  const measureRows = recordsAt(evidence["measureRows"]);
  const allEventSlots = recordsAt(evidence["allEventSlots"]);
  const insertableRows = recordsAt(evidence["insertableRows"]);
  for (const [index, row] of sectionRows.entries()) {
    checkExactKeys(
      row,
      EXPECTED_PARSER_SECTION_ROW_KEYS,
      "EDIT_PLAN_PARSER_SECTION_KEYS",
      `${path}.sectionRows[${String(index)}]`,
      findings,
    );
    if (
      row["sourceSectionOrdinal"] !== index ||
      !["implicit", "named"].includes(String(row["kind"])) ||
      (row["name"] !== null &&
        (typeof row["name"] !== "string" ||
          !isUnicodeScalarString(row["name"]) ||
          codePointLength(row["name"]) > MAX_SHORT_TEXT_CODE_POINTS)) ||
      typeof row["annotation"] !== "string" ||
      !isUnicodeScalarString(row["annotation"]) ||
      codePointLength(row["annotation"]) > MAX_LONG_TEXT_CODE_POINTS
    ) {
      addFinding(
        findings,
        "EDIT_PLAN_PARSER_SECTION_VALUE",
        `${path}.sectionRows[${String(index)}]`,
        "Parser section rows must be contiguous, typed, and text-bounded.",
      );
    }
  }
  const nextMeasureOrdinal = new Map<number, number>();
  for (const [index, row] of measureRows.entries()) {
    checkExactKeys(
      row,
      EXPECTED_PARSER_MEASURE_ROW_KEYS,
      "EDIT_PLAN_PARSER_MEASURE_KEYS",
      `${path}.measureRows[${String(index)}]`,
      findings,
    );
    const sectionOrdinal = row["sourceSectionOrdinal"];
    const measureOrdinal = row["sourceMeasureOrdinal"];
    const expectedOrdinal =
      typeof sectionOrdinal === "number"
        ? (nextMeasureOrdinal.get(sectionOrdinal) ?? 0)
        : -1;
    if (
      !isNonnegativeSafeInteger(sectionOrdinal) ||
      sectionOrdinal >= sectionRows.length ||
      measureOrdinal !== expectedOrdinal ||
      !["barred", "virtual"].includes(String(row["kind"])) ||
      (outcome === "failure" && row["completion"] !== null) ||
      (outcome === "success" && !isObject(row["completion"]))
    ) {
      addFinding(
        findings,
        "EDIT_PLAN_PARSER_MEASURE_VALUE",
        `${path}.measureRows[${String(index)}]`,
        "Parser measure rows must be in contiguous source order and carry persistent completion only for parser success.",
      );
    }
    if (isNonnegativeSafeInteger(sectionOrdinal)) {
      nextMeasureOrdinal.set(sectionOrdinal, expectedOrdinal + 1);
    }
  }
  const nextEventOrdinal = new Map<string, number>();
  for (const [index, row] of allEventSlots.entries()) {
    checkExactKeys(
      row,
      EXPECTED_PARSER_EVENT_SLOT_KEYS,
      "EDIT_PLAN_PARSER_EVENT_SLOT_KEYS",
      `${path}.allEventSlots[${String(index)}]`,
      findings,
    );
    const sectionOrdinal = row["sourceSectionOrdinal"];
    const measureOrdinal = row["sourceMeasureOrdinal"];
    const eventOrdinal = row["sourceEventOrdinal"];
    const coordinate = `${String(sectionOrdinal)}/${String(measureOrdinal)}`;
    const expectedEventOrdinal = nextEventOrdinal.get(coordinate) ?? 0;
    const measureExists = measureRows.some(
      (measure) =>
        measure["sourceSectionOrdinal"] === sectionOrdinal &&
        measure["sourceMeasureOrdinal"] === measureOrdinal,
    );
    if (
      row["globalOrdinal"] !== index ||
      !measureExists ||
      eventOrdinal !== expectedEventOrdinal ||
      typeof row["valid"] !== "boolean"
    ) {
      addFinding(
        findings,
        "EDIT_PLAN_PARSER_EVENT_SLOT_VALUE",
        `${path}.allEventSlots[${String(index)}]`,
        "All parser event slots must retain contiguous global and per-measure source coordinates.",
      );
    }
    nextEventOrdinal.set(coordinate, expectedEventOrdinal + 1);
  }
  let previousSlotIndex = -1;
  for (const [index, row] of insertableRows.entries()) {
    checkExactKeys(
      row,
      EXPECTED_PARSER_INSERTABLE_ROW_KEYS,
      "EDIT_PLAN_PARSER_INSERTABLE_KEYS",
      `${path}.insertableRows[${String(index)}]`,
      findings,
    );
    const slotIndex = allEventSlots.findIndex(
      (slot) =>
        slot["globalOrdinal"] === row["globalOrdinal"] &&
        slot["sourceSectionOrdinal"] === row["sourceSectionOrdinal"] &&
        slot["sourceMeasureOrdinal"] === row["sourceMeasureOrdinal"] &&
        slot["sourceEventOrdinal"] === row["sourceEventOrdinal"],
    );
    if (
      slotIndex < 0 ||
      slotIndex <= previousSlotIndex ||
      allEventSlots[slotIndex]?.["valid"] !== true
    ) {
      addFinding(
        findings,
        "EDIT_PLAN_PARSER_INSERTABLE_ORDER",
        `${path}.insertableRows[${String(index)}]`,
        "Insertable rows must be the valid all-event slots in exact source order.",
      );
    }
    previousSlotIndex = slotIndex;
    if (!isObject(row["chord"])) {
      addFinding(
        findings,
        "EDIT_PLAN_PARSER_INSERTABLE_CHORD",
        `${path}.insertableRows[${String(index)}].chord`,
        "Every insertable row must carry the complete independently authored T0 chord.",
      );
    }
    if (
      typeof row["annotation"] !== "string" ||
      !isUnicodeScalarString(row["annotation"]) ||
      codePointLength(row["annotation"]) > MAX_LONG_TEXT_CODE_POINTS
    ) {
      addFinding(
        findings,
        "EDIT_PLAN_PARSER_INSERTABLE_ANNOTATION",
        `${path}.insertableRows[${String(index)}].annotation`,
        "Insertable annotations must be complete bounded Unicode scalar text.",
      );
    }
    const duration = row["duration"];
    if (!isObject(duration)) {
      addFinding(
        findings,
        "EDIT_PLAN_PARSER_INSERTABLE_DURATION",
        `${path}.insertableRows[${String(index)}].duration`,
        "Insertable duration evidence must select a resolved or caller-required branch.",
      );
    } else if (duration["kind"] === "resolved") {
      checkExactKeys(
        duration,
        ["kind", "source", "value"],
        "EDIT_PLAN_PARSER_RESOLVED_DURATION_KEYS",
        `${path}.insertableRows[${String(index)}].duration`,
        findings,
      );
      if (!["explicit", "allocated"].includes(String(duration["source"]))) {
        addFinding(
          findings,
          "EDIT_PLAN_PARSER_RESOLVED_DURATION_SOURCE",
          `${path}.insertableRows[${String(index)}].duration.source`,
          "Resolved T0 duration source must be explicit or allocated.",
        );
      }
      validateBeatDurationShape(
        duration["value"],
        `${path}.insertableRows[${String(index)}].duration.value`,
        findings,
      );
    } else {
      checkExactKeys(
        duration,
        ["kind", "reason"],
        "EDIT_PLAN_PARSER_CALLER_DURATION_KEYS",
        `${path}.insertableRows[${String(index)}].duration`,
        findings,
      );
      if (
        duration["kind"] !== "requires-caller" ||
        duration["reason"] !== "chart.layout_invalid"
      ) {
        addFinding(
          findings,
          "EDIT_PLAN_PARSER_CALLER_DURATION_VALUE",
          `${path}.insertableRows[${String(index)}].duration`,
          "Caller-required T0 duration evidence uses the one accepted branch.",
        );
      }
    }
    validateSourceRange(
      row["range"],
      sourceText.length,
      `${path}.insertableRows[${String(index)}].range`,
      findings,
    );
  }
  const validCoordinates = allEventSlots
    .filter((slot) => slot["valid"] === true)
    .map((slot) =>
      stableJson([
        slot["globalOrdinal"],
        slot["sourceSectionOrdinal"],
        slot["sourceMeasureOrdinal"],
        slot["sourceEventOrdinal"],
      ]),
    );
  const insertableCoordinates = insertableRows.map((row) =>
    stableJson([
      row["globalOrdinal"],
      row["sourceSectionOrdinal"],
      row["sourceMeasureOrdinal"],
      row["sourceEventOrdinal"],
    ]),
  );
  requireExact(
    insertableCoordinates,
    validCoordinates,
    "EDIT_PLAN_PARSER_VALID_INSERTABLE_BIJECTION",
    `${path}.insertableRows`,
    "Every and only valid parser event slot must appear once in insertable source order.",
    findings,
  );
  return { outcome, sectionRows, measureRows, allEventSlots, insertableRows };
}

function validateInsertFragmentPlan(
  plan: JsonObject,
  path: string,
  findings: A0U1EditPlanContractFinding[],
): void {
  const source = isObject(plan["source"]) ? plan["source"] : {};
  const placement = isObject(plan["placement"]) ? plan["placement"] : {};
  const sourceKind = source["kind"];
  const complete = sourceKind === "complete-draft";
  const recovered = sourceKind === "recovered-chord";
  checkExactKeys(
    plan,
    complete
      ? A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.completeDraftPlan
      : A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.recoveredChordPlan,
    "EDIT_PLAN_INSERT_KEYS",
    path,
    findings,
  );
  if (!complete && !recovered) {
    addFinding(
      findings,
      "EDIT_PLAN_INSERT_LANE",
      `${path}.source.kind`,
      "Insert source must select exactly complete-draft or recovered-chord.",
    );
    return;
  }
  checkExactKeys(
    source,
    complete
      ? A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.completeDraftSource
      : A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.recoveredChordSource,
    "EDIT_PLAN_INSERT_SOURCE_KEYS",
    `${path}.source`,
    findings,
  );
  const snapshot = isObject(source["quickEntrySnapshot"])
    ? source["quickEntrySnapshot"]
    : {};
  checkExactKeys(
    snapshot,
    A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.quickEntrySnapshot,
    "EDIT_PLAN_QUICK_ENTRY_KEYS",
    `${path}.source.quickEntrySnapshot`,
    findings,
  );
  const sourceText = snapshot["sourceText"];
  const sourceCodePoints =
    typeof sourceText === "string"
      ? codePointLength(sourceText)
      : Number.POSITIVE_INFINITY;
  const sourceBytes =
    typeof sourceText === "string"
      ? new TextEncoder().encode(sourceText).length
      : Number.POSITIVE_INFINITY;
  if (
    typeof sourceText !== "string" ||
    !isUnicodeScalarString(sourceText) ||
    sourceCodePoints > A0_U1_ATOMIC_EDIT_LIMITS.fragmentSourceCodePoints ||
    sourceBytes > A0_U1_ATOMIC_EDIT_LIMITS.fragmentSourceUtf8Bytes
  ) {
    addFinding(
      findings,
      "EDIT_PLAN_SOURCE_LIMIT",
      `${path}.source.quickEntrySnapshot.sourceText`,
      "Quick Entry source exceeds the exact code-point or UTF-8 byte bound.",
    );
  }
  if (!isNonnegativeSafeInteger(snapshot["baseRevision"])) {
    addFinding(
      findings,
      "EDIT_PLAN_QUICK_ENTRY_BASE_REVISION",
      `${path}.source.quickEntrySnapshot.baseRevision`,
      "Quick Entry base revision must be a nonnegative safe integer.",
    );
  }
  requireExact(
    snapshot["expectedStatus"],
    complete ? "ready" : "invalid",
    "EDIT_PLAN_QUICK_ENTRY_STATUS",
    `${path}.source.quickEntrySnapshot.expectedStatus`,
    "Quick Entry status must be correlated with the selected source lane.",
    findings,
  );
  requireExact(
    snapshot["expectedLane"],
    sourceKind,
    "EDIT_PLAN_QUICK_ENTRY_LANE",
    `${path}.source.quickEntrySnapshot.expectedLane`,
    "The snapshot's expected lane must equal the source discriminant.",
    findings,
  );
  if (
    !Array.isArray(snapshot["issueCodes"]) ||
    !snapshot["issueCodes"].every(
      (code) =>
        typeof code === "string" &&
        isUnicodeScalarString(code) &&
        code.length > 0 &&
        code.length <= MAX_COMMAND_ID_CODE_POINTS,
    ) ||
    new Set(snapshot["issueCodes"]).size !== snapshot["issueCodes"].length ||
    snapshot["issueCodes"].length >
      A0_U1_ATOMIC_EDIT_LIMITS.quickEntryIssueCodes
  ) {
    addFinding(
      findings,
      "EDIT_PLAN_QUICK_ENTRY_ISSUES",
      `${path}.source.quickEntrySnapshot.issueCodes`,
      "Issue codes must be a bounded exact string array.",
    );
  }
  validateBoundaryShape(
    snapshot["target"],
    `${path}.source.quickEntrySnapshot.target`,
    findings,
  );
  requireExact(
    snapshot["target"],
    canonicalTargetForPlacement(placement),
    "EDIT_PLAN_QUICK_ENTRY_TARGET",
    `${path}.source.quickEntrySnapshot.target`,
    "The captured stable target must equal the placement's canonical target.",
    findings,
  );
  requireExact(
    plan["voicingPolicy"],
    A0_U1_NEW_EVENT_POLICY_ID,
    "EDIT_PLAN_VOICING_POLICY",
    `${path}.voicingPolicy`,
    "Every new event must use the single reviewed Auto-voicing policy ID.",
    findings,
  );

  if (complete) {
    const acknowledgements = source["warningAcknowledgements"];
    if (
      !Array.isArray(acknowledgements) ||
      acknowledgements.length >
        A0_U1_ATOMIC_EDIT_LIMITS.retainedWarningAcknowledgements
    ) {
      addFinding(
        findings,
        "EDIT_PLAN_WARNING_ACKNOWLEDGEMENTS",
        `${path}.source.warningAcknowledgements`,
        "Warning acknowledgements must be an exact array.",
      );
    } else {
      for (const [index, acknowledgement] of acknowledgements.entries()) {
        checkExactKeys(
          acknowledgement,
          A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.warningAcknowledgement,
          "EDIT_PLAN_WARNING_KEYS",
          `${path}.source.warningAcknowledgements[${String(index)}]`,
          findings,
        );
        if (
          !isObject(acknowledgement) ||
          typeof acknowledgement["code"] !== "string" ||
          !isUnicodeScalarString(acknowledgement["code"]) ||
          acknowledgement["code"].length === 0 ||
          acknowledgement["code"].length > MAX_COMMAND_ID_CODE_POINTS
        ) {
          addFinding(
            findings,
            "EDIT_PLAN_WARNING_CODE",
            `${path}.source.warningAcknowledgements[${String(index)}].code`,
            "Warning acknowledgement codes must be bounded Unicode scalar tokens.",
          );
        }
        validateSourceRange(
          isObject(acknowledgement)
            ? acknowledgement["range"]
            : undefined,
          typeof sourceText === "string" ? sourceText.length : 0,
          `${path}.source.warningAcknowledgements[${String(index)}].range`,
          findings,
        );
      }
    }
  } else {
    if (
      typeof source["selectedGlobalOrdinal"] !== "number" ||
      !Number.isSafeInteger(source["selectedGlobalOrdinal"]) ||
      (source["selectedGlobalOrdinal"] as number) < 0
    ) {
      addFinding(
        findings,
        "EDIT_PLAN_RECOVERY_ORDINAL",
        `${path}.source.selectedGlobalOrdinal`,
        "Recovered-chord selection must use one nonnegative global ordinal.",
      );
    }
    requireExact(
      source["layoutLossAcknowledgement"],
      A0_U1_RECOVERED_CHORD_LAYOUT_LOSS_ACKNOWLEDGEMENT,
      "EDIT_PLAN_RECOVERY_LAYOUT_ACK",
      `${path}.source.layoutLossAcknowledgement`,
      "Recovered insertion requires the exact reviewed layout-loss acknowledgement.",
      findings,
    );
    if (source["callerDuration"] !== null) {
      validateBeatDurationShape(
        source["callerDuration"],
        `${path}.source.callerDuration`,
        findings,
      );
    }
  }

  if (placement["kind"] === "into-measure") {
    const expectedKeys = recovered
      ? A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.recoveredChordIntoMeasurePlacement
      : A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.completeDraftIntoMeasurePlacement;
    checkExactKeys(
      placement,
      expectedKeys,
      "EDIT_PLAN_PLACEMENT_KEYS",
      `${path}.placement`,
      findings,
    );
    if (
      !isStableId(placement["measureId"]) ||
      (placement["beforeEventId"] !== null &&
        !isStableId(placement["beforeEventId"]))
    ) {
      addFinding(
        findings,
        "EDIT_PLAN_MEASURE_PLACEMENT_IDS",
        `${path}.placement`,
        "Into-measure placement IDs must be null or canonical stable IDs.",
      );
    }
    requireExact(
      placement["layoutDisposition"],
      recovered ? "insert-one-recovered-chord" : "flatten-one-implicit-measure",
      "EDIT_PLAN_PLACEMENT_LAYOUT",
      `${path}.placement.layoutDisposition`,
      "Into-measure layout disposition must match the exact source lane.",
      findings,
    );
    validateCompletionDeclarations(
      placement["completionDeclarations"],
      1,
      `${path}.placement.completionDeclarations`,
      findings,
    );
  } else if (complete && placement["kind"] === "into-section") {
    checkExactKeys(
      placement,
      A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.intoSectionPlacement,
      "EDIT_PLAN_PLACEMENT_KEYS",
      `${path}.placement`,
      findings,
    );
    if (
      !isStableId(placement["sectionId"]) ||
      (placement["beforeMeasureId"] !== null &&
        !isStableId(placement["beforeMeasureId"]))
    ) {
      addFinding(
        findings,
        "EDIT_PLAN_SECTION_PLACEMENT_IDS",
        `${path}.placement`,
        "Into-section placement IDs must be null or canonical stable IDs.",
      );
    }
    requireExact(
      placement["layoutDisposition"],
      "preserve-implicit-measures",
      "EDIT_PLAN_PLACEMENT_LAYOUT",
      `${path}.placement.layoutDisposition`,
      "Into-section insertion must preserve implicit measure layout.",
      findings,
    );
    validateCompletionDeclarations(
      placement["completionDeclarations"],
      0,
      `${path}.placement.completionDeclarations`,
      findings,
    );
  } else if (complete && placement["kind"] === "into-document") {
    checkExactKeys(
      placement,
      A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.intoDocumentPlacement,
      "EDIT_PLAN_PLACEMENT_KEYS",
      `${path}.placement`,
      findings,
    );
    if (
      placement["beforeSectionId"] !== null &&
      !isStableId(placement["beforeSectionId"])
    ) {
      addFinding(
        findings,
        "EDIT_PLAN_DOCUMENT_PLACEMENT_ID",
        `${path}.placement.beforeSectionId`,
        "Into-document placement target must be null or a canonical stable ID.",
      );
    }
    requireExact(
      placement["layoutDisposition"],
      "preserve-named-sections",
      "EDIT_PLAN_PLACEMENT_LAYOUT",
      `${path}.placement.layoutDisposition`,
      "Into-document insertion must preserve named-section layout.",
      findings,
    );
    const declarations = placement["sectionDeclarations"];
    if (
      !Array.isArray(declarations) ||
      declarations.length === 0 ||
      declarations.length > A0_U1_ATOMIC_EDIT_LIMITS.sectionDeclarations
    ) {
      addFinding(
        findings,
        "EDIT_PLAN_SECTION_DECLARATIONS",
        `${path}.placement.sectionDeclarations`,
        "Named-section insertion requires one explicit declaration per source section.",
      );
    } else {
      for (const [index, declaration] of declarations.entries()) {
        checkExactKeys(
          declaration,
          A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.sectionDeclaration,
          "EDIT_PLAN_SECTION_DECLARATION_KEYS",
          `${path}.placement.sectionDeclarations[${String(index)}]`,
          findings,
        );
        if (
          !isObject(declaration) ||
          !isNonnegativeSafeInteger(declaration["sourceSectionOrdinal"]) ||
          !SECTION_VOICE_LEADING_BOUNDARIES.includes(
            declaration["voiceLeadingBoundary"] as never,
          )
        ) {
          addFinding(
            findings,
            "EDIT_PLAN_SECTION_DECLARATION_VALUE",
            `${path}.placement.sectionDeclarations[${String(index)}]`,
            "Section declarations require a nonnegative ordinal and a closed voice-leading boundary.",
          );
        }
      }
    }
    validateCompletionDeclarations(
      placement["completionDeclarations"],
      0,
      `${path}.placement.completionDeclarations`,
      findings,
    );
  } else {
    addFinding(
      findings,
      "EDIT_PLAN_PLACEMENT_LANE",
      `${path}.placement`,
      "Placement kind is not permitted for the selected insert source lane.",
    );
  }
}

function quickEntrySnapshotMatchesState(
  command: JsonObject,
  state: JsonObject,
): boolean | null {
  const plan = isObject(command["plan"]) ? command["plan"] : null;
  if (plan?.["kind"] !== "insert-fragment") return null;
  const source = isObject(plan["source"]) ? plan["source"] : null;
  const snapshot = isObject(source?.["quickEntrySnapshot"])
    ? source?.["quickEntrySnapshot"]
    : null;
  const quickEntry = isObject(state["quickEntry"]) ? state["quickEntry"] : null;
  if (snapshot === null || quickEntry === null) return false;
  return (
    snapshot["sourceText"] === quickEntry["text"] &&
    snapshot["baseRevision"] === quickEntry["baseRevision"] &&
    snapshot["baseRevision"] === state["revision"] &&
    jsonDeepEqual(snapshot["target"], quickEntry["target"]) &&
    jsonDeepEqual(snapshot["issueCodes"], quickEntry["issueCodes"]) &&
    snapshot["expectedStatus"] === quickEntry["status"] &&
    snapshot["expectedLane"] === source?.["kind"]
  );
}

type ExpectedEnvelopeFailure = Readonly<{
  code: string;
  path: readonly (string | number)[];
}>;

function applicationHistoryLocked(state: JsonObject): boolean {
  const transition = isObject(state["documentTransition"])
    ? state["documentTransition"]
    : {};
  if (
    transition["kind"] === "retiring-transport" ||
    transition["kind"] === "committing"
  ) {
    return true;
  }
  return recordsAt(state["dialogs"]).some(
    (dialog) =>
      dialog["blocksHistory"] === true && dialog["phase"] === "committing",
  );
}

function expectedA0EnvelopeFailure(
  state: JsonObject,
  command: JsonObject,
): ExpectedEnvelopeFailure | null {
  if (!isBoundedToken(command["id"], MAX_COMMAND_ID_CODE_POINTS)) {
    return { code: "command.id_invalid", path: ["id"] };
  }
  if (!isBoundedToken(command["label"], MAX_COMMAND_LABEL_CODE_POINTS)) {
    return { code: "command.label_invalid", path: ["label"] };
  }
  if (!isNonnegativeSafeInteger(command["logicalTimeMs"])) {
    return { code: "command.logical_time_invalid", path: ["logicalTimeMs"] };
  }
  const history = isObject(state["history"]) ? state["history"] : {};
  const undo = recordsAt(history["undo"]);
  const latest = undo[undo.length - 1];
  if (
    latest !== undefined &&
    typeof latest["lastLogicalTimeMs"] === "number" &&
    command["logicalTimeMs"] < latest["lastLogicalTimeMs"]
  ) {
    return { code: "command.logical_time_invalid", path: ["logicalTimeMs"] };
  }
  const document = isObject(state["document"]) ? state["document"] : {};
  if (command["expectedDocumentId"] !== document["id"]) {
    return { code: "command.wrong_document", path: ["expectedDocumentId"] };
  }
  if (command["expectedRevision"] !== state["revision"]) {
    return { code: "command.stale_revision", path: ["expectedRevision"] };
  }
  if (
    typeof state["revision"] !== "number" ||
    state["revision"] >= MAX_APPLICATION_REVISION
  ) {
    return { code: "application.revision_exhausted", path: ["revision"] };
  }
  if (
    typeof state["nextSequence"] !== "number" ||
    state["nextSequence"] >= MAX_APPLICATION_SEQUENCE
  ) {
    return {
      code: "application.sequence_exhausted",
      path: ["nextSequence"],
    };
  }
  if (command["coalescing"] !== null) {
    return { code: "command.coalescing_invalid", path: ["coalescing"] };
  }
  if (applicationHistoryLocked(state)) {
    return { code: "history.locked", path: ["history"] };
  }
  return null;
}

function validateA0EnvelopeOutcome(
  before: JsonObject,
  command: JsonObject,
  result: JsonObject,
  path: string,
  findings: A0U1EditPlanContractFinding[],
): void {
  const expectedFailure = expectedA0EnvelopeFailure(before, command);
  const refusal = isObject(result["refusal"]) ? result["refusal"] : {};
  if (expectedFailure === null) {
    if (
      result["ok"] === false &&
      A0_U1_ATOMIC_EDIT_PREPLAN_OUTER_REFUSAL_CODES.includes(
        refusal["code"] as never,
      )
    ) {
      addFinding(
        findings,
        "EDIT_PLAN_SPURIOUS_A0_ENVELOPE_REFUSAL",
        path,
        "The literal A0 envelope passes every accepted pre-plan check but the result claims a pre-plan refusal.",
      );
    }
    return;
  }
  if (result["ok"] !== false) {
    addFinding(
      findings,
      "EDIT_PLAN_A0_ENVELOPE_ACCEPTED_INVALID",
      path,
      `The first accepted A0 envelope failure is ${expectedFailure.code}.`,
    );
    return;
  }
  requireExact(
    refusal["code"],
    expectedFailure.code,
    "EDIT_PLAN_A0_ENVELOPE_CODE",
    `${path}.refusal.code`,
    "Outer refusal must equal the independently recomputed first A0 envelope failure.",
    findings,
  );
  requireExact(
    refusal["path"],
    expectedFailure.path,
    "EDIT_PLAN_A0_ENVELOPE_PATH",
    `${path}.refusal.path`,
    "Outer refusal path must equal the independently recomputed A0 envelope path.",
    findings,
  );
}

function findMeasureLocation(
  document: unknown,
  measureId: unknown,
): Readonly<{
  section: JsonObject;
  sectionIndex: number;
  measure: JsonObject;
  measureIndex: number;
}> | null {
  const sections = documentSections(document);
  for (const [sectionIndex, section] of sections.entries()) {
    const measures = sectionMeasures(section);
    const measureIndex = measures.findIndex(
      (measure) => measure["id"] === measureId,
    );
    if (measureIndex >= 0) {
      return {
        section,
        sectionIndex,
        measure: measures[measureIndex] as JsonObject,
        measureIndex,
      };
    }
  }
  return null;
}

function canonicalPlacementTargetHasCorrectParent(
  document: unknown,
  placement: JsonObject,
): boolean {
  if (placement["kind"] === "into-measure") {
    const measure = findMeasureLocation(document, placement["measureId"]);
    if (measure === null) return false;
    if (placement["beforeEventId"] === null) return true;
    const event = findEventLocation(document, placement["beforeEventId"]);
    return event !== null && event.measure["id"] === placement["measureId"];
  }
  if (placement["kind"] === "into-section") {
    const section = findSectionLocation(document, placement["sectionId"]);
    if (section === null) return false;
    if (placement["beforeMeasureId"] === null) return true;
    const measure = findMeasureLocation(document, placement["beforeMeasureId"]);
    return measure !== null && measure.section["id"] === placement["sectionId"];
  }
  if (placement["kind"] === "into-document") {
    return (
      placement["beforeSectionId"] === null ||
      findSectionLocation(document, placement["beforeSectionId"]) !== null
    );
  }
  return false;
}

function validateApplyEditPlanShape(
  command: JsonObject,
  path: string,
  findings: A0U1EditPlanContractFinding[],
): void {
  checkExactKeys(
    command,
    A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.envelope,
    "EDIT_PLAN_ENVELOPE_KEYS",
    path,
    findings,
  );
  if (command["coalescing"] !== null) {
    addFinding(
      findings,
      "EDIT_PLAN_COALESCING",
      `${path}.coalescing`,
      "Every atomic edit plan is noncoalescing.",
    );
  }
  const plan = isObject(command["plan"]) ? command["plan"] : {};
  const planPath = `${path}.plan`;
  switch (plan["kind"]) {
    case "insert-fragment":
      validateInsertFragmentPlan(plan, planPath, findings);
      break;
    case "split-event-duration":
      checkExactKeys(
        plan,
        A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.splitEventDurationPlan,
        "EDIT_PLAN_SPLIT_EVENT_KEYS",
        planPath,
        findings,
      );
      validateBeatDurationShape(
        plan["firstDuration"],
        `${planPath}.firstDuration`,
        findings,
      );
      validateBeatDurationShape(
        plan["secondDuration"],
        `${planPath}.secondDuration`,
        findings,
      );
      validateCompletionDeclarations(
        plan["completionDeclarations"],
        1,
        `${planPath}.completionDeclarations`,
        findings,
      );
      requireExact(
        plan["identityPolicy"],
        "retain-source-first-allocate-second",
        "EDIT_PLAN_POLICY",
        `${planPath}.identityPolicy`,
        "Split-event survivor policy changed.",
        findings,
      );
      requireExact(
        plan["contentPolicy"],
        "copy-exact-chord-and-voicing",
        "EDIT_PLAN_POLICY",
        `${planPath}.contentPolicy`,
        "Split-event content policy changed.",
        findings,
      );
      requireExact(
        plan["annotationPolicy"],
        "retain-source-first-clear-second",
        "EDIT_PLAN_POLICY",
        `${planPath}.annotationPolicy`,
        "Split-event annotation policy changed.",
        findings,
      );
      break;
    case "join-event-durations":
      checkExactKeys(
        plan,
        A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.joinEventDurationsPlan,
        "EDIT_PLAN_JOIN_EVENT_KEYS",
        planPath,
        findings,
      );
      validateBeatDurationShape(
        plan["joinedDuration"],
        `${planPath}.joinedDuration`,
        findings,
      );
      if (
        !isStableId(plan["leftEventId"]) ||
        !isStableId(plan["rightEventId"]) ||
        plan["leftEventId"] === plan["rightEventId"]
      ) {
        addFinding(
          findings,
          "EDIT_PLAN_JOIN_EVENT_IDS",
          planPath,
          "Join-event targets must be distinct canonical stable IDs.",
        );
      }
      validateCompletionDeclarations(
        plan["completionDeclarations"],
        1,
        `${planPath}.completionDeclarations`,
        findings,
      );
      requireExact(
        plan["identityPolicy"],
        "retain-left-remove-right",
        "EDIT_PLAN_POLICY",
        `${planPath}.identityPolicy`,
        "Join-event survivor policy changed.",
        findings,
      );
      requireExact(
        plan["contentPolicy"],
        "require-exact-chord-and-voicing",
        "EDIT_PLAN_POLICY",
        `${planPath}.contentPolicy`,
        "Join-event equality policy changed.",
        findings,
      );
      requireExact(
        plan["annotationPolicy"],
        "require-right-empty-retain-left",
        "EDIT_PLAN_POLICY",
        `${planPath}.annotationPolicy`,
        "Join-event annotation policy changed.",
        findings,
      );
      break;
    case "split-section":
      checkExactKeys(
        plan,
        A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.splitSectionPlan,
        "EDIT_PLAN_SPLIT_SECTION_KEYS",
        planPath,
        findings,
      );
      validateSectionMetadata(
        plan["newSectionMetadata"],
        `${planPath}.newSectionMetadata`,
        findings,
      );
      if (
        !isStableId(plan["sectionId"]) ||
        !isStableId(plan["beforeMeasureId"])
      ) {
        addFinding(
          findings,
          "EDIT_PLAN_SPLIT_SECTION_IDS",
          planPath,
          "Split-section target and boundary must be canonical stable IDs.",
        );
      }
      validateCompletionDeclarations(
        plan["completionDeclarations"],
        0,
        `${planPath}.completionDeclarations`,
        findings,
      );
      requireExact(
        plan["identityPolicy"],
        "retain-source-prefix-allocate-suffix",
        "EDIT_PLAN_POLICY",
        `${planPath}.identityPolicy`,
        "Split-section survivor policy changed.",
        findings,
      );
      requireExact(
        plan["measurePolicy"],
        "move-suffix-preserve-identities",
        "EDIT_PLAN_POLICY",
        `${planPath}.measurePolicy`,
        "Split-section measure policy changed.",
        findings,
      );
      break;
    case "join-sections":
      checkExactKeys(
        plan,
        A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.joinSectionsPlan,
        "EDIT_PLAN_JOIN_SECTION_KEYS",
        planPath,
        findings,
      );
      validateSectionMetadata(
        plan["expectedLeftMetadata"],
        `${planPath}.expectedLeftMetadata`,
        findings,
      );
      if (
        !isStableId(plan["leftSectionId"]) ||
        !isStableId(plan["rightSectionId"]) ||
        plan["leftSectionId"] === plan["rightSectionId"]
      ) {
        addFinding(
          findings,
          "EDIT_PLAN_JOIN_SECTION_IDS",
          planPath,
          "Join-section targets must be distinct canonical stable IDs.",
        );
      }
      validateSectionMetadata(
        plan["expectedRightMetadata"],
        `${planPath}.expectedRightMetadata`,
        findings,
      );
      validateSectionMetadata(
        plan["resultMetadata"],
        `${planPath}.resultMetadata`,
        findings,
      );
      validateCompletionDeclarations(
        plan["completionDeclarations"],
        0,
        `${planPath}.completionDeclarations`,
        findings,
      );
      requireExact(
        plan["identityPolicy"],
        "retain-left-remove-right",
        "EDIT_PLAN_POLICY",
        `${planPath}.identityPolicy`,
        "Join-section survivor policy changed.",
        findings,
      );
      requireExact(
        plan["measurePolicy"],
        "left-then-right-preserve-identities",
        "EDIT_PLAN_POLICY",
        `${planPath}.measurePolicy`,
        "Join-section measure policy changed.",
        findings,
      );
      requireExact(
        plan["metadataPolicy"],
        "compare-both-then-apply-explicit-result",
        "EDIT_PLAN_POLICY",
        `${planPath}.metadataPolicy`,
        "Join-section metadata policy changed.",
        findings,
      );
      requireExact(
        plan["internalBoundaryPolicy"],
        "remove-right-entry-boundary-confirmed",
        "EDIT_PLAN_POLICY",
        `${planPath}.internalBoundaryPolicy`,
        "Join-section boundary policy changed.",
        findings,
      );
      break;
    default:
      addFinding(
        findings,
        "EDIT_PLAN_KIND",
        `${planPath}.kind`,
        "Plan discriminant must be one of the five closed variants.",
      );
  }
}

function validateRootContract(
  contract: JsonObject,
  findings: A0U1EditPlanContractFinding[],
): void {
  checkExactKeys(
    contract,
    EXPECTED_ROOT_KEYS,
    "EDIT_PLAN_ROOT_KEYS",
    "a0-u1-edit-plan-contract.json",
    findings,
  );
  requireExact(
    contract["commandKinds"],
    ["apply-edit-plan"],
    "EDIT_PLAN_COMMAND_KINDS",
    "a0-u1-edit-plan-contract.json.commandKinds",
    "The addendum must name exactly one prospective command kind.",
    findings,
  );
  requireExact(
    contract["planKinds"],
    A0_U1_ATOMIC_EDIT_PLAN_KINDS,
    "EDIT_PLAN_PLAN_KINDS",
    "a0-u1-edit-plan-contract.json.planKinds",
    "The five closed plan variants and order must match the source contract.",
    findings,
  );
  requireExact(
    contract["refusalCodes"],
    A0_U1_ATOMIC_EDIT_REFUSAL_CODES,
    "EDIT_PLAN_REFUSAL_CODES",
    "a0-u1-edit-plan-contract.json.refusalCodes",
    "Refusal vocabulary must match the source contract exactly.",
    findings,
  );
  requireExact(
    contract["applicationContractSchema"],
    A0_U1_ATOMIC_EDIT_PLAN_CONTRACT_SCHEMA,
    "EDIT_PLAN_APPLICATION_CONTRACT_SCHEMA",
    "a0-u1-edit-plan-contract.json.applicationContractSchema",
    "The packet must identify the exact additive source-contract schema.",
    findings,
  );
  requireExact(
    contract["receiptSchema"],
    A0_U1_ATOMIC_EDIT_PLAN_RECEIPT_SCHEMA,
    "EDIT_PLAN_RECEIPT_SCHEMA",
    "a0-u1-edit-plan-contract.json.receiptSchema",
    "The packet must freeze the exact additive success-receipt schema.",
    findings,
  );
  requireExact(
    contract["outerRefusalCodes"],
    A0_U1_ATOMIC_EDIT_OUTER_REFUSAL_CODES,
    "EDIT_PLAN_OUTER_REFUSAL_CODES",
    "a0-u1-edit-plan-contract.json.outerRefusalCodes",
    "Post-plan outer refusal codes must match the source contract exactly.",
    findings,
  );
  requireExact(
    contract["preplanOuterRefusalCodes"],
    A0_U1_ATOMIC_EDIT_PREPLAN_OUTER_REFUSAL_CODES,
    "EDIT_PLAN_PREPLAN_REFUSAL_CODES",
    "a0-u1-edit-plan-contract.json.preplanOuterRefusalCodes",
    "Envelope-only refusal codes must match the source contract exactly.",
    findings,
  );
  const expectedOuterCodeMapping = Object.fromEntries(
    A0_U1_ATOMIC_EDIT_REFUSAL_CODES.map((code) => [
      code,
      expectedAllowedOuterCodesForRefusal(code),
    ]),
  );
  requireExact(
    A0_U1_ATOMIC_EDIT_ALLOWED_OUTER_CODES_BY_REFUSAL_CODE,
    expectedOuterCodeMapping,
    "EDIT_PLAN_SOURCE_REFUSAL_OUTER_MAPPING",
    "src/application/application-edit-plan-contract.ts",
    "The source nested-to-outer refusal mapping must match the normative independent families.",
    findings,
  );
  requireExact(
    contract["allowedOuterCodesByRefusalCode"],
    expectedOuterCodeMapping,
    "EDIT_PLAN_PACKET_REFUSAL_OUTER_MAPPING",
    "a0-u1-edit-plan-contract.json.allowedOuterCodesByRefusalCode",
    "The packet must freeze every nested-to-outer refusal mapping.",
    findings,
  );
  requireExact(
    contract["outerWorkCounterNames"],
    APPLICATION_WORK_COUNTER_NAMES,
    "EDIT_PLAN_OUTER_WORK_COUNTERS",
    "a0-u1-edit-plan-contract.json.outerWorkCounterNames",
    "Outer transition work evidence must retain the accepted A0 counter tuple.",
    findings,
  );
  requireExact(
    contract["workCounterNames"],
    A0_U1_ATOMIC_EDIT_WORK_COUNTER_NAMES,
    "EDIT_PLAN_WORK_COUNTERS",
    "a0-u1-edit-plan-contract.json.workCounterNames",
    "Edit-plan work evidence must match the source contract exactly.",
    findings,
  );
  requireExact(
    contract["limits"],
    A0_U1_ATOMIC_EDIT_LIMITS,
    "EDIT_PLAN_LIMITS",
    "a0-u1-edit-plan-contract.json.limits",
    "All exact edit-plan limits must match the source contract.",
    findings,
  );
  requireExact(
    contract["lawIds"],
    A0_U1_ATOMIC_EDIT_LAW_IDS,
    "EDIT_PLAN_LAW_IDS",
    "a0-u1-edit-plan-contract.json.lawIds",
    "The exact 17-law inventory must match the declarative source.",
    findings,
  );
  requireExact(
    contract["coverageFamilies"],
    EXPECTED_COVERAGE_FAMILIES,
    "EDIT_PLAN_COVERAGE_FAMILIES",
    "a0-u1-edit-plan-contract.json.coverageFamilies",
    "All required evidence families must remain explicit and ordered.",
    findings,
  );
  requireExact(
    contract["counts"],
    EXPECTED_COUNTS,
    "EDIT_PLAN_DECLARED_COUNTS",
    "a0-u1-edit-plan-contract.json.counts",
    "Declared packet counts must match the independently reviewed inventory.",
    findings,
  );
  const expectedEnvelope = [
    "id",
    "label",
    "expectedDocumentId",
    "expectedRevision",
    "logicalTimeMs",
    "coalescing",
    "kind",
    "plan",
  ];
  const envelope = contract["commandEnvelope"];
  checkExactKeys(
    envelope,
    [
      "fieldsInOrder",
      "kind",
      "coalescing",
      "singleCommand",
      "nestedCommandsAllowed",
      "candidateDocumentAllowed",
    ],
    "EDIT_PLAN_COMMAND_ENVELOPE_KEYS",
    "a0-u1-edit-plan-contract.json.commandEnvelope",
    findings,
  );
  const envelopeFields = isObject(envelope) ? envelope["fieldsInOrder"] : null;
  requireExact(
    envelopeFields,
    expectedEnvelope,
    "EDIT_PLAN_COMMAND_ENVELOPE",
    "a0-u1-edit-plan-contract.json.commandEnvelope.fieldsInOrder",
    "The proposed command must reuse the exact A0 envelope and add only kind/plan.",
    findings,
  );
  if (
    !isObject(envelope) ||
    envelope["kind"] !== "apply-edit-plan" ||
    envelope["coalescing"] !== null ||
    envelope["singleCommand"] !== true ||
    envelope["nestedCommandsAllowed"] !== false ||
    envelope["candidateDocumentAllowed"] !== false
  ) {
    addFinding(
      findings,
      "EDIT_PLAN_COMMAND_ENVELOPE_POLICY",
      "a0-u1-edit-plan-contract.json.commandEnvelope",
      "The envelope must be one noncoalescing apply-edit-plan with no nested command or candidate document.",
    );
  }
  requireExact(
    contract["refusalPrecedence"],
    A0_U1_ATOMIC_EDIT_REFUSAL_CODES,
    "EDIT_PLAN_REFUSAL_PRECEDENCE",
    "a0-u1-edit-plan-contract.json.refusalPrecedence",
    "The nested refusal tuple is itself the exact precedence order.",
    findings,
  );
  if (
    contract["implementationStatus"] !==
      A0_U1_ATOMIC_EDIT_IMPLEMENTATION_STATUS ||
    contract["productionImplementationClaim"] !== false ||
    contract["u1UiCompletionClaim"] !== false ||
    contract["humanAcceptanceClaim"] !== false ||
    contract["expertReviewClaim"] !== false ||
    contract["productionOutputUsedAsOracle"] !== false ||
    contract["expectedValuesGenerated"] !== false
  ) {
    addFinding(
      findings,
      "EDIT_PLAN_SCOPE_CLAIM",
      "a0-u1-edit-plan-contract.json",
      "The packet must remain a proposed, independent, unimplemented A0 contract with no UI, human, expert, or production-oracle claim.",
    );
  }
  if (
    A0_U1_ATOMIC_EDIT_PLAN_CONTRACT_SCHEMA !==
    "changes.application.atomic-edit-plan-contract.v1"
  ) {
    addFinding(
      findings,
      "EDIT_PLAN_SOURCE_SCHEMA",
      "src/application/application-edit-plan-contract.ts",
      "The declarative source schema changed unexpectedly.",
    );
  }
  requireExact(
    A0_U1_PROPOSED_APPLICATION_COMMAND_KINDS,
    [...APPLICATION_COMMAND_KINDS, "apply-edit-plan"],
    "EDIT_PLAN_ADDITIVE_COMMAND_ORDER",
    "src/application/application-edit-plan-contract.ts",
    "The proposed list must append one kind without reordering accepted A0 kinds.",
    findings,
  );
  requireExact(
    A0_U1_ATOMIC_EDIT_PLAN_FORBIDDEN_PAYLOAD_KEYS,
    EXPECTED_FORBIDDEN_PAYLOAD_KEYS,
    "EDIT_PLAN_SOURCE_FORBIDDEN_PAYLOAD_KEYS",
    "src/application/application-edit-plan-contract.ts.A0_U1_ATOMIC_EDIT_PLAN_FORBIDDEN_PAYLOAD_KEYS",
    "The source forbidden-key tuple must remain exact and independently locked.",
    findings,
  );
  requireExact(
    HISTORY_RETAINED_BYTE_ESTIMATE_POLICY,
    INDEPENDENT_HISTORY_ESTIMATE_POLICY,
    "EDIT_PLAN_HISTORY_ESTIMATOR_POLICY",
    "src/application/application-state-contract.ts.HISTORY_RETAINED_BYTE_ESTIMATE_POLICY",
    "A0 history estimation constants must remain byte-for-byte equal to the independently implemented validator formula.",
    findings,
  );
  requireExact(
    APPLICATION_COMMAND_KINDS,
    [
      "insert",
      "delete",
      "move",
      "duplicate",
      "set-text",
      "set-duration",
      "set-measure-completion",
      "set-section",
      "set-chord",
      "set-voicing",
      "set-document-settings",
      "transpose",
      "apply-suggestion",
      "apply-reharmonization",
      "replace-document",
    ],
    "EDIT_PLAN_EXISTING_A0_DRIFT",
    "src/application/application-state-contract.ts.APPLICATION_COMMAND_KINDS",
    "This specification leaf must not mutate the accepted production command union.",
    findings,
  );
  const decisions = isObject(contract["decisions"])
    ? contract["decisions"]
    : {};
  checkExactKeys(
    decisions,
    EXPECTED_DECISION_KEYS,
    "EDIT_PLAN_DECISION_KEYS",
    "a0-u1-edit-plan-contract.json.decisions",
    findings,
  );
  const insertDecision = isObject(decisions["insertFragment"])
    ? decisions["insertFragment"]
    : {};
  if (
    !stableJson(insertDecision).includes("complete-draft") ||
    !stableJson(insertDecision).includes("recovered-chord") ||
    !stableJson(insertDecision).includes("layout") ||
    !stableJson(insertDecision).includes("warning")
  ) {
    addFinding(
      findings,
      "EDIT_PLAN_INSERT_DECISION",
      "a0-u1-edit-plan-contract.json.decisions.insertFragment",
      "Insertion must freeze complete-draft and single recovered-chord lanes, explicit layout/warning acknowledgement, and the reviewed Auto voicing default.",
    );
  }
  requireExact(
    insertDecision["defaultVoicing"],
    A0_U1_NEW_EVENT_AUTO_VOICING,
    "EDIT_PLAN_INSERT_VOICING_DECISION",
    "a0-u1-edit-plan-contract.json.decisions.insertFragment.defaultVoicing",
    "The root decision must publish the exact reviewed new-event Auto voicing.",
    findings,
  );
  const snapshotDecision = isObject(insertDecision["liveQuickEntrySnapshot"])
    ? insertDecision["liveQuickEntrySnapshot"]
    : {};
  requireExact(
    snapshotDecision["exactKeysInOrder"],
    A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.quickEntrySnapshot,
    "EDIT_PLAN_QUICK_ENTRY_DECISION",
    "a0-u1-edit-plan-contract.json.decisions.insertFragment.liveQuickEntrySnapshot.exactKeysInOrder",
    "The root decision must freeze every public Quick Entry snapshot field.",
    findings,
  );
  const ordering = isObject(contract["ordering"]) ? contract["ordering"] : {};
  checkExactKeys(
    ordering,
    EXPECTED_ORDERING_KEYS,
    "EDIT_PLAN_ORDERING_KEYS",
    "a0-u1-edit-plan-contract.json.ordering",
    findings,
  );
  requireExact(
    ordering["runnerStages"],
    A0_U1_ATOMIC_EDIT_PLAN_RUNNER_STAGE_ORDER,
    "EDIT_PLAN_RUNNER_ORDER",
    "a0-u1-edit-plan-contract.json.ordering.runnerStages",
    "Runner stages must match the source contract exactly.",
    findings,
  );
  requireExact(
    ordering["idAllocation"],
    A0_U1_ATOMIC_EDIT_PLAN_ID_ALLOCATION_ORDER,
    "EDIT_PLAN_ID_ORDER",
    "a0-u1-edit-plan-contract.json.ordering.idAllocation",
    "ID allocation order must match the source contract exactly.",
    findings,
  );
  requireExact(
    ordering["diagnostics"],
    A0_U1_ATOMIC_EDIT_PLAN_DIAGNOSTIC_ORDER,
    "EDIT_PLAN_DIAGNOSTIC_ORDER",
    "a0-u1-edit-plan-contract.json.ordering.diagnostics",
    "Diagnostic ordering must match the source contract exactly.",
    findings,
  );
  requireExact(
    ordering["effects"],
    ["queue-recovery", "compile-playback-plan", "restore-focus", "announce"],
    "EDIT_PLAN_EFFECT_ORDER",
    "a0-u1-edit-plan-contract.json.ordering.effects",
    "Successful plans must publish the exact existing effect order.",
    findings,
  );
  requireExact(
    ordering["bookmarks"],
    A0_U1_ATOMIC_EDIT_PLAN_BOOKMARK_POLICIES,
    "EDIT_PLAN_BOOKMARK_POLICIES",
    "a0-u1-edit-plan-contract.json.ordering.bookmarks",
    "Bookmark policies must remain operation-specific and exact.",
    findings,
  );
  requireExact(
    ordering["quickEntryTargetMatch"],
    A0_U1_QUICK_ENTRY_TARGET_MATCH_POLICY,
    "EDIT_PLAN_TARGET_MATCH_POLICIES",
    "a0-u1-edit-plan-contract.json.ordering.quickEntryTargetMatch",
    "Quick Entry target matching must remain exact for every placement.",
    findings,
  );
  const proofRequirements = isObject(contract["proofRequirements"])
    ? contract["proofRequirements"]
    : {};
  checkExactKeys(
    proofRequirements,
    EXPECTED_PROOF_REQUIREMENT_KEYS,
    "EDIT_PLAN_PROOF_REQUIREMENT_KEYS",
    "a0-u1-edit-plan-contract.json.proofRequirements",
    findings,
  );
  for (const forbiddenTrue of [
    "productionOutputMayAuthorExpectedValues",
    "wallTimeMayAffectOutcome",
  ]) {
    if (proofRequirements[forbiddenTrue] !== false) {
      addFinding(
        findings,
        "EDIT_PLAN_FORBIDDEN_PROOF",
        `a0-u1-edit-plan-contract.json.proofRequirements.${forbiddenTrue}`,
        "Production output and wall time may not author or select musical outcomes.",
      );
    }
  }
  for (const requiredTrue of Object.keys(proofRequirements).filter(
    (key) =>
      ![
        "productionOutputMayAuthorExpectedValues",
        "wallTimeMayAffectOutcome",
      ].includes(key),
  )) {
    if (proofRequirements[requiredTrue] !== true) {
      addFinding(
        findings,
        "EDIT_PLAN_REQUIRED_PROOF",
        `a0-u1-edit-plan-contract.json.proofRequirements.${requiredTrue}`,
        "Every declared positive proof obligation must remain true.",
      );
    }
  }
}

type MaterializedTransition = Readonly<{
  id: string;
  row: JsonObject;
  before: JsonObject;
  command: unknown;
  expected: JsonObject;
  after: JsonObject;
  result: JsonObject;
  parserEvidence: ParserEvidenceView | null;
}>;

function validateCases(
  root: JsonObject,
  findings: A0U1EditPlanContractFinding[],
): Readonly<{
  catalog: JsonObject;
  cases: Map<string, JsonObject>;
  transitions: Map<string, JsonObject>;
  applicability: Map<string, JsonObject>;
  transposition: Map<string, JsonObject>;
  obligations: Map<string, JsonObject>;
  materialized: Map<string, MaterializedTransition>;
}> {
  const catalog = isObject(root["literalCatalog"])
    ? root["literalCatalog"]
    : {};
  checkExactKeys(
    catalog,
    EXPECTED_LITERAL_CATALOG_KEYS,
    "EDIT_PLAN_LITERAL_CATALOG_KEYS",
    "edit-plan-cases.json.literalCatalog",
    findings,
  );
  const caseRows = recordsAt(root["caseGroups"]);
  const cases = indexById(
    caseRows,
    "edit-plan-cases.json.caseGroups",
    findings,
  );
  const transitionRecord = isObject(catalog["transitions"])
    ? catalog["transitions"]
    : {};
  const transitionRows = Object.entries(transitionRecord).map(
    ([key, value]) => {
      if (!isObject(value)) return { id: key, malformed: true };
      if (value["id"] !== key) {
        addFinding(
          findings,
          "EDIT_PLAN_TRANSITION_KEY",
          `edit-plan-cases.json.literalCatalog.transitions.${key}`,
          "Transition map key and embedded ID must match exactly.",
        );
      }
      return value;
    },
  );
  const transitions = indexById(
    transitionRows,
    "edit-plan-cases.json.literalCatalog.transitions",
    findings,
  );
  const applicabilityRows = recordsAt(root["applicabilityRows"]);
  const applicability = indexById(
    applicabilityRows,
    "edit-plan-cases.json.applicabilityRows",
    findings,
  );
  const transpositionRows = recordsAt(root["transpositionWitnesses"]);
  const transposition = indexById(
    transpositionRows,
    "edit-plan-cases.json.transpositionWitnesses",
    findings,
  );
  const obligationRows = recordsAt(root["obligationRows"]);
  const obligations = indexById(
    obligationRows,
    "edit-plan-cases.json.obligationRows",
    findings,
  );
  const materialized = new Map<string, MaterializedTransition>();

  for (const [caseId, row] of cases) {
    checkExactKeys(
      row,
      EXPECTED_CASE_KEYS,
      "EDIT_PLAN_CASE_KEYS",
      `edit-plan-cases.json.caseGroups.${caseId}`,
      findings,
    );
    if (!operationAllowed(row["operation"])) {
      addFinding(
        findings,
        "EDIT_PLAN_CASE_OPERATION",
        `edit-plan-cases.json.caseGroups.${caseId}.operation`,
        "Case operation must be pipeline or one of the five plan variants.",
      );
    }
    if (!EXPECTED_COVERAGE_FAMILIES.includes(row["category"] as never)) {
      addFinding(
        findings,
        "EDIT_PLAN_CASE_CATEGORY",
        `edit-plan-cases.json.caseGroups.${caseId}.category`,
        "Case category is outside the closed coverage vocabulary.",
      );
    }
    checkReferenceIds(
      row["transitionIds"],
      transitions,
      "EDIT_PLAN_CASE_TRANSITION_REF",
      `edit-plan-cases.json.caseGroups.${caseId}.transitionIds`,
      findings,
    );
    if (stringsAt(row["proofKinds"]).length === 0) {
      addFinding(
        findings,
        "EDIT_PLAN_CASE_PROOF_EMPTY",
        `edit-plan-cases.json.caseGroups.${caseId}.proofKinds`,
        "Every decision case needs at least one explicit proof kind.",
      );
    }
  }
  for (const [transitionId, row] of transitions) {
    checkExactKeys(
      row,
      EXPECTED_TRANSITION_KEYS,
      "EDIT_PLAN_TRANSITION_KEYS",
      `edit-plan-cases.json.literalCatalog.transitions.${transitionId}`,
      findings,
    );
    if (!["apply", "undo", "redo"].includes(String(row["phase"]))) {
      addFinding(
        findings,
        "EDIT_PLAN_TRANSITION_PHASE",
        `edit-plan-cases.json.literalCatalog.transitions.${transitionId}.phase`,
        "Transition phase must be apply, undo, or redo.",
      );
    }
    const caseId = row["caseId"];
    const parentCase =
      typeof caseId === "string" ? cases.get(caseId) : undefined;
    if (
      parentCase === undefined ||
      !stringsAt(parentCase["transitionIds"]).includes(transitionId)
    ) {
      addFinding(
        findings,
        "EDIT_PLAN_TRANSITION_CASE_RECIPROCAL",
        `edit-plan-cases.json.literalCatalog.transitions.${transitionId}.caseId`,
        "Every transition must link reciprocally to exactly one case group.",
      );
    }
    if (
      parentCase !== undefined &&
      parentCase["operation"] !== row["operation"]
    ) {
      addFinding(
        findings,
        "EDIT_PLAN_TRANSITION_CASE_OPERATION",
        `edit-plan-cases.json.literalCatalog.transitions.${transitionId}.operation`,
        "Transition operation must equal its parent case-group operation.",
      );
    }
    if (!operationAllowed(row["operation"])) {
      addFinding(
        findings,
        "EDIT_PLAN_TRANSITION_OPERATION",
        `edit-plan-cases.json.literalCatalog.transitions.${transitionId}.operation`,
        "Transition operation is outside the closed operation vocabulary.",
      );
    }
    const lawIds = stringsAt(row["lawIds"]);
    if (
      lawIds.length === 0 ||
      lawIds.some(
        (lawId) => !A0_U1_ATOMIC_EDIT_LAW_IDS.includes(lawId as never),
      )
    ) {
      addFinding(
        findings,
        "EDIT_PLAN_TRANSITION_LAWS",
        `edit-plan-cases.json.literalCatalog.transitions.${transitionId}.lawIds`,
        "Every transition must cite only declared laws and cite at least one.",
      );
    }
    checkExactKeys(
      row["expected"],
      EXPECTED_TRANSITION_RESULT_KEYS,
      "EDIT_PLAN_TRANSITION_EXPECTED_KEYS",
      `edit-plan-cases.json.literalCatalog.transitions.${transitionId}.expected`,
      findings,
    );
    try {
      const before = materializeLiteral(row["beforeState"], catalog);
      const command = materializeLiteral(row["command"], catalog);
      const expected = materializeLiteral(row["expected"], catalog);
      if (before === undefined || expected === undefined) {
        throw new Error("undefined materialization");
      }
      if (!isObject(before) || !isObject(expected)) {
        throw new Error("state and expected transition must materialize objects");
      }
      if (row["phase"] === "apply" && !isObject(command)) {
        throw new Error("apply transition command must materialize an object");
      }
      if (
        (row["phase"] === "undo" || row["phase"] === "redo") &&
        command !== null
      ) {
        addFinding(
          findings,
          "EDIT_PLAN_HISTORY_COMMAND_MUST_BE_NULL",
          `edit-plan-cases.json.literalCatalog.transitions.${transitionId}.command`,
          "Undo and redo invoke A0 history operations and therefore carry command: null.",
        );
      }
      const afterState = expected["afterState"];
      if (!isObject(afterState)) {
        throw new Error("expected afterState must be a complete state object");
      }
      const computedDelta = computeRecursiveLiteralDelta(before, afterState);
      if (!jsonDeepEqual(expected["exactDelta"], computedDelta)) {
        addFinding(
          findings,
          "EDIT_PLAN_RECURSIVE_DELTA",
          `edit-plan-cases.json.literalCatalog.transitions.${transitionId}.expected.exactDelta`,
          "The checked-in exact delta must equal an independent recursive comparison of beforeState and afterState.",
        );
      }
      requireExact(
        expected["bookmarks"],
        afterState["bookmarks"],
        "EDIT_PLAN_BOOKMARK_LITERAL",
        `edit-plan-cases.json.literalCatalog.transitions.${transitionId}.expected.bookmarks`,
        "Expected bookmarks must be the literal bookmarks in the complete after-state.",
        findings,
      );
      requireExact(
        expected["focusRequest"],
        afterState["focusRequest"],
        "EDIT_PLAN_FOCUS_LITERAL",
        `edit-plan-cases.json.literalCatalog.transitions.${transitionId}.expected.focusRequest`,
        "Expected focus must be the literal focus request in the complete after-state.",
        findings,
      );
      requireExact(
        expected["history"],
        afterState["history"],
        "EDIT_PLAN_HISTORY_LITERAL",
        `edit-plan-cases.json.literalCatalog.transitions.${transitionId}.expected.history`,
        "Expected history must be the literal history value in the complete after-state.",
        findings,
      );
      validateTransitionWorkCounters(
        expected["counters"],
        row["phase"],
        `edit-plan-cases.json.literalCatalog.transitions.${transitionId}.expected.counters`,
        findings,
      );
      const parserEvidence = validateParserEvidence(
        before,
        command,
        row["operation"],
        row["phase"],
        expected["parserEvidence"],
        `edit-plan-cases.json.literalCatalog.transitions.${transitionId}.expected.parserEvidence`,
        findings,
      );
      const result = expected["result"];
      if (!isObject(result)) {
        addFinding(
          findings,
          "EDIT_PLAN_RESULT_LITERAL",
          `edit-plan-cases.json.literalCatalog.transitions.${transitionId}.expected.result`,
          "Expected result must be one complete literal transition-result object.",
        );
      } else {
        validateAtomicEditResultDetail(
          before,
          afterState,
          command,
          expected,
          result,
          row["phase"],
          parserEvidence,
          `edit-plan-cases.json.literalCatalog.transitions.${transitionId}.expected.result`,
          findings,
        );
        if (row["phase"] === "apply" && isObject(command)) {
          validateA0EnvelopeOutcome(
            before,
            command,
            result,
            `edit-plan-cases.json.literalCatalog.transitions.${transitionId}`,
            findings,
          );
        }
        materialized.set(transitionId, {
          id: transitionId,
          row,
          before,
          command,
          expected,
          after: afterState,
          result,
          parserEvidence,
        });
      }
      validateTransitionMusicalEvidence(
        before,
        afterState,
        expected,
        row["operation"],
        isObject(result) ? result : null,
        `edit-plan-cases.json.literalCatalog.transitions.${transitionId}.expected`,
        findings,
      );
      validateAllocationTrace(
        before,
        command,
        isObject(result) ? result : null,
        expected["counters"],
        expected["allocationTrace"],
        parserEvidence,
        row["phase"],
        `edit-plan-cases.json.literalCatalog.transitions.${transitionId}.expected.allocationTrace`,
        findings,
      );
      validatePublicationEvidence(
        before,
        afterState,
        expected,
        row["phase"],
        command,
        isObject(result) ? result : null,
        `edit-plan-cases.json.literalCatalog.transitions.${transitionId}.expected`,
        findings,
      );
      if (
        isObject(result) &&
        result["ok"] === true &&
        row["phase"] === "apply" &&
        (typeof before["revision"] !== "number" ||
          afterState["revision"] !== before["revision"] + 1)
      ) {
        addFinding(
          findings,
          "EDIT_PLAN_ONE_REVISION",
          `edit-plan-cases.json.literalCatalog.transitions.${transitionId}`,
          "A committed edit plan must advance the document revision exactly once.",
        );
      }
      const quickEntrySnapshotMatch = isObject(command)
        ? quickEntrySnapshotMatchesState(command, before)
        : null;
      if (
        isObject(result) &&
        result["ok"] === true &&
        row["phase"] === "apply" &&
        quickEntrySnapshotMatch === false
      ) {
        addFinding(
          findings,
          "EDIT_PLAN_STALE_QUICK_ENTRY_COMMITTED",
          `edit-plan-cases.json.literalCatalog.transitions.${transitionId}`,
          "A successful fragment insertion must bind every Quick Entry snapshot field to the complete before-state.",
        );
      }
      if (
        isObject(result) &&
        result["ok"] === true &&
        isObject(command) &&
        command["kind"] === "apply-edit-plan"
      ) {
        validateApplyEditPlanShape(
          command,
          `edit-plan-cases.json.literalCatalog.transitions.${transitionId}.command`,
          findings,
        );
        if (row["phase"] === "apply") {
          const plan = isObject(command["plan"]) ? command["plan"] : {};
          if (
            plan["kind"] === "insert-fragment" &&
            isObject(plan["placement"]) &&
            !canonicalPlacementTargetHasCorrectParent(
              before["document"],
              plan["placement"],
            )
          ) {
            addFinding(
              findings,
              "EDIT_PLAN_TARGET_PARENT_COMMITTED",
              `edit-plan-cases.json.literalCatalog.transitions.${transitionId}.command.plan.placement`,
              "A committed insertion target and destination must name the same extant parent.",
            );
          }
          validateCommittedOperationLaw(
            before,
            afterState,
            command,
            row["operation"],
            `edit-plan-cases.json.literalCatalog.transitions.${transitionId}`,
            findings,
          );
          const candidate = validateExactCandidateTransform(
            before,
            afterState,
            command,
            result,
            parserEvidence,
            expected["allocationTrace"],
            `edit-plan-cases.json.literalCatalog.transitions.${transitionId}`,
            findings,
          );
          if (candidate !== null) {
            validateBookmarkOracle(
              before,
              afterState,
              command,
              result,
              candidate,
              `edit-plan-cases.json.literalCatalog.transitions.${transitionId}`,
              findings,
            );
          }
        }
        const forbidden = recursiveForbiddenKeys(
          command["plan"],
          new Set(A0_U1_ATOMIC_EDIT_PLAN_FORBIDDEN_PAYLOAD_KEYS),
        );
        for (const path of forbidden) {
          addFinding(
            findings,
            "EDIT_PLAN_GENERIC_BACKDOOR",
            `${transitionId}:${path}`,
            "An apply-edit-plan payload may not smuggle a candidate, batch, generic patch, import, request, state, or nested plan.",
          );
        }
        if (
          !isObject(command["plan"]) ||
          command["plan"]["kind"] !== row["operation"]
        ) {
          addFinding(
            findings,
            "EDIT_PLAN_COMMAND_DISCRIMINANT",
            `edit-plan-cases.json.literalCatalog.transitions.${transitionId}.command.plan.kind`,
            "Apply transition and plan discriminants must agree exactly.",
          );
        }
      }
    } catch (error) {
      addFinding(
        findings,
        "EDIT_PLAN_LITERAL_MATERIALIZATION",
        `edit-plan-cases.json.literalCatalog.transitions.${transitionId}`,
        `Literal materialization failed: ${error instanceof Error ? error.message : String(error)}.`,
      );
    }
  }

  for (const [rowId, row] of applicability) {
    checkExactKeys(
      row,
      EXPECTED_APPLICABILITY_KEYS,
      "EDIT_PLAN_APPLICABILITY_KEYS",
      `edit-plan-cases.json.applicabilityRows.${rowId}`,
      findings,
    );
    if (!A0_U1_ATOMIC_EDIT_PLAN_KINDS.includes(row["operation"] as never)) {
      addFinding(
        findings,
        "EDIT_PLAN_APPLICABILITY_OPERATION",
        `edit-plan-cases.json.applicabilityRows.${rowId}.operation`,
        "Each plan kind needs one exact applicability row.",
      );
    }
    if (row["wallTimeCutoff"] !== "forbidden") {
      addFinding(
        findings,
        "EDIT_PLAN_WALL_TIME",
        `edit-plan-cases.json.applicabilityRows.${rowId}.wallTimeCutoff`,
        "Wall time is evidence only and may never choose an edit outcome.",
      );
    }
    checkReferenceIds(
      row["caseIds"],
      cases,
      "EDIT_PLAN_APPLICABILITY_CASE_REF",
      `edit-plan-cases.json.applicabilityRows.${rowId}.caseIds`,
      findings,
    );
    checkReferenceIds(
      row["transitionIds"],
      transitions,
      "EDIT_PLAN_APPLICABILITY_TRANSITION_REF",
      `edit-plan-cases.json.applicabilityRows.${rowId}.transitionIds`,
      findings,
    );
  }
  requireExact(
    [...applicability.values()].map((row) => row["operation"]),
    A0_U1_ATOMIC_EDIT_PLAN_KINDS,
    "EDIT_PLAN_APPLICABILITY_COMPLETENESS",
    "edit-plan-cases.json.applicabilityRows",
    "Applicability rows must cover every plan kind exactly once in contract order.",
    findings,
  );

  for (const [witnessId, row] of transposition) {
    checkExactKeys(
      row,
      EXPECTED_TRANSPOSITION_KEYS,
      "EDIT_PLAN_TRANSPOSITION_KEYS",
      `edit-plan-cases.json.transpositionWitnesses.${witnessId}`,
      findings,
    );
    if (!A0_U1_ATOMIC_EDIT_PLAN_KINDS.includes(row["operation"] as never)) {
      addFinding(
        findings,
        "EDIT_PLAN_TRANSPOSITION_OPERATION",
        `edit-plan-cases.json.transpositionWitnesses.${witnessId}.operation`,
        "Transposition witness operation is outside the five-plan union.",
      );
    }
    const baseId = row["baseTransitionId"];
    const transposedId = row["transposedTransitionId"];
    if (
      typeof baseId !== "string" ||
      typeof transposedId !== "string" ||
      !transitions.has(baseId) ||
      !transitions.has(transposedId)
    ) {
      addFinding(
        findings,
        "EDIT_PLAN_TRANSPOSITION_TRANSITION_REF",
        `edit-plan-cases.json.transpositionWitnesses.${witnessId}`,
        "Base and transposed transition references must both exist.",
      );
    }
    for (const digestField of [
      "sourceCanonicalSha256",
      "targetCanonicalSha256",
      "inverseCanonicalSha256",
    ]) {
      if (!SHA256_PATTERN.test(String(row[digestField]))) {
        addFinding(
          findings,
          "EDIT_PLAN_TRANSPOSITION_DIGEST",
          `edit-plan-cases.json.transpositionWitnesses.${witnessId}.${digestField}`,
          "Every transposition witness digest must be lowercase SHA-256.",
        );
      }
    }
    try {
      const sourceDocument = materializeLiteral(
        row["sourceDocumentRef"],
        catalog,
      );
      const targetDocument = materializeLiteral(
        row["targetDocumentRef"],
        catalog,
      );
      if (!isObject(sourceDocument) || !isObject(targetDocument)) {
        throw new Error("document references did not materialize as objects");
      }
      const sourceDigest = sha256(stableJson(sourceDocument));
      const targetDigest = sha256(stableJson(targetDocument));
      requireExact(
        row["sourceCanonicalSha256"],
        sourceDigest,
        "EDIT_PLAN_TRANSPOSITION_SOURCE_DIGEST",
        `edit-plan-cases.json.transpositionWitnesses.${witnessId}.sourceCanonicalSha256`,
        "Source transposition digest must be independently recomputed.",
        findings,
      );
      requireExact(
        row["targetCanonicalSha256"],
        targetDigest,
        "EDIT_PLAN_TRANSPOSITION_TARGET_DIGEST",
        `edit-plan-cases.json.transpositionWitnesses.${witnessId}.targetCanonicalSha256`,
        "Target transposition digest must be independently recomputed.",
        findings,
      );
      requireExact(
        row["inverseCanonicalSha256"],
        sourceDigest,
        "EDIT_PLAN_TRANSPOSITION_INVERSE_DIGEST",
        `edit-plan-cases.json.transpositionWitnesses.${witnessId}.inverseCanonicalSha256`,
        "Inverse transposition must recover the exact source canonical digest.",
        findings,
      );
      requireExact(
        row["invariantFields"],
        EXPECTED_TRANSPOSITION_INVARIANT_FIELDS,
        "EDIT_PLAN_TRANSPOSITION_INVARIANT_VOCABULARY",
        `edit-plan-cases.json.transpositionWitnesses.${witnessId}.invariantFields`,
        "Transposition invariants must use the exact independently audited vocabulary.",
        findings,
      );
      requireExact(
        row["changedFields"],
        EXPECTED_TRANSPOSITION_CHANGED_FIELDS,
        "EDIT_PLAN_TRANSPOSITION_CHANGED_VOCABULARY",
        `edit-plan-cases.json.transpositionWitnesses.${witnessId}.changedFields`,
        "Transposition changes must use the exact independently audited spelling-first vocabulary.",
        findings,
      );
      const interval = row["intervalSemitones"];
      if (!Number.isSafeInteger(interval) || interval === 0) {
        addFinding(
          findings,
          "EDIT_PLAN_TRANSPOSITION_INTERVAL",
          `edit-plan-cases.json.transpositionWitnesses.${witnessId}.intervalSemitones`,
          "Transposition witness interval must be a nonzero safe integer.",
        );
      } else {
        const independentlyTransposed = independentlyTransposePitchData(
          sourceDocument,
          interval,
        );
        requireExact(
          targetDocument,
          independentlyTransposed,
          "EDIT_PLAN_TRANSPOSITION_FORWARD_TRANSFORM",
          `edit-plan-cases.json.transpositionWitnesses.${witnessId}.targetDocumentRef`,
          "Target document must equal an independent spelling-preserving pitch/source-text transformation of the source.",
          findings,
        );
        requireExact(
          independentlyTransposePitchData(targetDocument, -interval),
          sourceDocument,
          "EDIT_PLAN_TRANSPOSITION_INVERSE_TRANSFORM",
          `edit-plan-cases.json.transpositionWitnesses.${witnessId}.sourceDocumentRef`,
          "Applying the exact inverse spelling transform must recover every source document byte-semantic field.",
          findings,
        );
        const baseTransition =
          typeof baseId === "string" ? materialized.get(baseId) : undefined;
        const transposedTransition =
          typeof transposedId === "string"
            ? materialized.get(transposedId)
            : undefined;
        if (
          baseTransition === undefined ||
          transposedTransition === undefined
        ) {
          addFinding(
            findings,
            "EDIT_PLAN_TRANSPOSITION_MATERIALIZED_TRANSITIONS",
            `edit-plan-cases.json.transpositionWitnesses.${witnessId}`,
            "Both transposition transitions must materialize completely.",
          );
        } else {
          requireExact(
            baseTransition.before["document"],
            sourceDocument,
            "EDIT_PLAN_TRANSPOSITION_BASE_SOURCE",
            `edit-plan-cases.json.transpositionWitnesses.${witnessId}.baseTransitionId`,
            "Base transition before document must equal the witness source.",
            findings,
          );
          requireExact(
            transposedTransition.before["document"],
            targetDocument,
            "EDIT_PLAN_TRANSPOSITION_TARGET_SOURCE",
            `edit-plan-cases.json.transpositionWitnesses.${witnessId}.transposedTransitionId`,
            "Transposed transition before document must equal the witness target.",
            findings,
          );
          const baseReceipt = isObject(
            baseTransition.result["editPlanReceipt"],
          )
            ? baseTransition.result["editPlanReceipt"]
            : {};
          const transposedReceipt = isObject(
            transposedTransition.result["editPlanReceipt"],
          )
            ? transposedTransition.result["editPlanReceipt"]
            : {};
          const baseAllocations = recordsAt(
            baseReceipt["allocatedIdentities"],
          );
          const transposedAllocations = recordsAt(
            transposedReceipt["allocatedIdentities"],
          );
          if (baseAllocations.length !== transposedAllocations.length) {
            addFinding(
              findings,
              "EDIT_PLAN_TRANSPOSITION_ALLOCATION_BIJECTION",
              `edit-plan-cases.json.transpositionWitnesses.${witnessId}`,
              "Fresh allocation lists must have equal structural cardinality under transposition.",
            );
          }
          const freshIdMap = new Map<string, string>();
          for (const [index, baseAllocation] of baseAllocations.entries()) {
            const targetAllocation = transposedAllocations[index];
            if (
              targetAllocation === undefined ||
              baseAllocation["kind"] !== targetAllocation["kind"] ||
              !jsonDeepEqual(
                baseAllocation["source"],
                targetAllocation["source"],
              ) ||
              typeof baseAllocation["id"] !== "string" ||
              typeof targetAllocation["id"] !== "string"
            ) {
              addFinding(
                findings,
                "EDIT_PLAN_TRANSPOSITION_ALLOCATION_SOURCE",
                `edit-plan-cases.json.transpositionWitnesses.${witnessId}.allocations[${String(index)}]`,
                "Fresh-ID bijection must pair the same kind and exact source provenance in structural order.",
              );
              continue;
            }
            freshIdMap.set(baseAllocation["id"], targetAllocation["id"]);
          }
          const transformedAfter = remapExactStrings(
            independentlyTransposePitchData(
              baseTransition.after["document"],
              interval,
            ),
            freshIdMap,
          );
          requireExact(
            transposedTransition.after["document"],
            transformedAfter,
            "EDIT_PLAN_TRANSPOSITION_TRANSITION_COMMUTATION",
            `edit-plan-cases.json.transpositionWitnesses.${witnessId}.transposedTransitionId`,
            "Applying the edit then transposing must equal transposing then applying modulo the structural fresh-ID bijection.",
            findings,
          );
          if (
            !isObject(baseTransition.command) ||
            !isObject(transposedTransition.command)
          ) {
            addFinding(
              findings,
              "EDIT_PLAN_TRANSPOSITION_COMMANDS",
              `edit-plan-cases.json.transpositionWitnesses.${witnessId}`,
              "Metamorphic apply witnesses require complete commands.",
            );
          } else {
            requireExact(
              transposedTransition.command,
              independentlyTransposePitchData(
                baseTransition.command,
                interval,
              ),
              "EDIT_PLAN_TRANSPOSITION_COMMAND_COMMUTATION",
              `edit-plan-cases.json.transpositionWitnesses.${witnessId}.transposedTransitionId.command`,
              "The transposed command must preserve all nonpitch fields and transform every pitch-bearing/source-text field independently.",
              findings,
            );
          }
          requireExact(
            transposedTransition.result["outcome"],
            baseTransition.result["outcome"],
            "EDIT_PLAN_TRANSPOSITION_OUTCOME",
            `edit-plan-cases.json.transpositionWitnesses.${witnessId}`,
            "Metamorphic transitions must have the same outcome.",
            findings,
          );
          requireExact(
            isObject(transposedReceipt["work"])
              ? transposedReceipt["work"]["termination"]
              : undefined,
            isObject(baseReceipt["work"])
              ? baseReceipt["work"]["termination"]
              : undefined,
            "EDIT_PLAN_TRANSPOSITION_TERMINATION",
            `edit-plan-cases.json.transpositionWitnesses.${witnessId}`,
            "Metamorphic transitions must reach the same deterministic termination.",
            findings,
          );
        }
      }
      for (const field of ["manualPitchBytes", "frozenPitchBytes"] as const) {
        const evidence = row[field];
        const evidencePath = `edit-plan-cases.json.transpositionWitnesses.${witnessId}.${field}`;
        checkExactKeys(
          evidence,
          [
            "jsonPointer",
            "sourceCanonicalJsonUtf8Hex",
            "targetCanonicalJsonUtf8Hex",
            "inverseCanonicalJsonUtf8Hex",
          ],
          "EDIT_PLAN_TRANSPOSITION_PITCH_KEYS",
          evidencePath,
          findings,
        );
        if (
          !isObject(evidence) ||
          typeof evidence["jsonPointer"] !== "string"
        ) {
          continue;
        }
        const sourcePitches = valueAtPointer(
          sourceDocument,
          evidence["jsonPointer"],
        );
        const targetPitches = valueAtPointer(
          targetDocument,
          evidence["jsonPointer"],
        );
        if (!Array.isArray(sourcePitches) || !Array.isArray(targetPitches)) {
          addFinding(
            findings,
            "EDIT_PLAN_TRANSPOSITION_PITCH_POINTER",
            `${evidencePath}.jsonPointer`,
            "Pitch-byte evidence must point to literal source and target pitch arrays.",
          );
          continue;
        }
        const sourceHex = utf8Hex(sourcePitches);
        const targetHex = utf8Hex(targetPitches);
        requireExact(
          evidence["sourceCanonicalJsonUtf8Hex"],
          sourceHex,
          "EDIT_PLAN_TRANSPOSITION_SOURCE_PITCH_BYTES",
          `${evidencePath}.sourceCanonicalJsonUtf8Hex`,
          "Source pitch bytes must be independently recomputed.",
          findings,
        );
        requireExact(
          evidence["targetCanonicalJsonUtf8Hex"],
          targetHex,
          "EDIT_PLAN_TRANSPOSITION_TARGET_PITCH_BYTES",
          `${evidencePath}.targetCanonicalJsonUtf8Hex`,
          "Target pitch bytes must be independently recomputed.",
          findings,
        );
        requireExact(
          evidence["inverseCanonicalJsonUtf8Hex"],
          sourceHex,
          "EDIT_PLAN_TRANSPOSITION_INVERSE_PITCH_BYTES",
          `${evidencePath}.inverseCanonicalJsonUtf8Hex`,
          "Inverse pitch bytes must recover the exact source spelling and ordering.",
          findings,
        );
      }
    } catch (error) {
      addFinding(
        findings,
        "EDIT_PLAN_TRANSPOSITION_MATERIALIZATION",
        `edit-plan-cases.json.transpositionWitnesses.${witnessId}`,
        `Transposition literal materialization failed: ${error instanceof Error ? error.message : String(error)}.`,
      );
    }
  }
  requireExact(
    [...transposition.values()].map((row) => row["operation"]),
    A0_U1_ATOMIC_EDIT_PLAN_KINDS,
    "EDIT_PLAN_TRANSPOSITION_COMPLETENESS",
    "edit-plan-cases.json.transpositionWitnesses",
    "Every plan kind needs one transposition/applicability witness in contract order.",
    findings,
  );

  return {
    catalog,
    cases,
    transitions,
    applicability,
    transposition,
    obligations,
    materialized,
  };
}

function validateHistoryReplayState(
  transition: MaterializedTransition,
  expectedOutcome: "undone" | "redone",
  findings: A0U1EditPlanContractFinding[],
): void {
  const path = `edit-plan-cases.json.literalCatalog.transitions.${transition.id}`;
  requireExact(
    transition.command,
    null,
    "EDIT_PLAN_HISTORY_REPLAY_NULL_COMMAND",
    `${path}.command`,
    "History replay transitions carry no document command.",
    findings,
  );
  requireExact(
    transition.result["outcome"],
    expectedOutcome,
    "EDIT_PLAN_HISTORY_REPLAY_OUTCOME",
    `${path}.expected.result.outcome`,
    "History replay outcome must match its phase exactly.",
    findings,
  );
  if (
    typeof transition.before["revision"] !== "number" ||
    transition.after["revision"] !== transition.before["revision"] + 1
  ) {
    addFinding(
      findings,
      "EDIT_PLAN_HISTORY_REPLAY_REVISION",
      `${path}.expected.afterState.revision`,
      "Undo and redo each advance revision exactly once.",
    );
  }
  requireExact(
    isObject(transition.expected["counters"])
      ? transition.expected["counters"]["editPlan"]
      : undefined,
    null,
    "EDIT_PLAN_HISTORY_REPLAY_NO_PLAN_WORK",
    `${path}.expected.counters.editPlan`,
    "Undo and redo do not rerun source parsing, laws, allocation, or publication validation.",
    findings,
  );
  requireExact(
    transition.expected["parserEvidence"],
    null,
    "EDIT_PLAN_HISTORY_REPLAY_NO_PARSER_EVIDENCE",
    `${path}.expected.parserEvidence`,
    "Undo and redo do not parse source.",
    findings,
  );
  requireExact(
    transition.expected["allocationTrace"],
    [],
    "EDIT_PLAN_HISTORY_REPLAY_NO_ALLOCATION",
    `${path}.expected.allocationTrace`,
    "Undo and redo reuse the exact committed IDs.",
    findings,
  );
  const quickEntry = isObject(transition.after["quickEntry"])
    ? transition.after["quickEntry"]
    : {};
  if (
    quickEntry["text"] !== "" ||
    quickEntry["status"] !== "idle" ||
    !jsonDeepEqual(quickEntry["issueCodes"], []) ||
    quickEntry["baseRevision"] !== transition.after["revision"] ||
    !jsonDeepEqual(
      quickEntry["target"],
      isObject(transition.after["bookmarks"])
        ? transition.after["bookmarks"]["insertion"]
        : undefined,
    )
  ) {
    addFinding(
      findings,
      "EDIT_PLAN_HISTORY_REPLAY_QUICK_ENTRY",
      `${path}.expected.afterState.quickEntry`,
      "Undo and redo use the exact A0 QuickEntry clear-at-new-revision behavior.",
    );
  }
}

function validateApplyUndoRedoTrios(
  materialized: ReadonlyMap<string, MaterializedTransition>,
  findings: A0U1EditPlanContractFinding[],
): void {
  for (const operation of A0_U1_ATOMIC_EDIT_PLAN_KINDS) {
    const operationRows = [...materialized.values()].filter(
      (transition) => transition.row["operation"] === operation,
    );
    const undoRows = operationRows.filter(
      (transition) =>
        transition.row["phase"] === "undo" &&
        transition.result["ok"] === true,
    );
    const redoRows = operationRows.filter(
      (transition) =>
        transition.row["phase"] === "redo" &&
        transition.result["ok"] === true,
    );
    if (undoRows.length !== 1 || redoRows.length !== 1) {
      addFinding(
        findings,
        "EDIT_PLAN_HISTORY_TRIO_CARDINALITY",
        `edit-plan-cases.json.literalCatalog.transitions.${operation}`,
        "Every plan kind must have exactly one successful undo and one successful redo witness.",
      );
      continue;
    }
    const undo = undoRows[0] as MaterializedTransition;
    const redo = redoRows[0] as MaterializedTransition;
    validateHistoryReplayState(undo, "undone", findings);
    validateHistoryReplayState(redo, "redone", findings);
    const undoBeforeHistory = isObject(undo.before["history"])
      ? undo.before["history"]
      : {};
    const undoBeforeStack = recordsAt(undoBeforeHistory["undo"]);
    const movedEntry = undoBeforeStack.at(-1);
    if (movedEntry === undefined) {
      addFinding(
        findings,
        "EDIT_PLAN_UNDO_ENTRY_MISSING",
        `edit-plan-cases.json.literalCatalog.transitions.${undo.id}.beforeState.history.undo`,
        "Undo witness must start with the exact atomic edit row on top of undo history.",
      );
      continue;
    }
    const applyRows = operationRows.filter((transition) => {
      if (
        transition.row["phase"] !== "apply" ||
        transition.result["ok"] !== true
      ) {
        return false;
      }
      const history = isObject(transition.after["history"])
        ? transition.after["history"]
        : {};
      return jsonDeepEqual(recordsAt(history["undo"]).at(-1), movedEntry);
    });
    if (applyRows.length !== 1) {
      addFinding(
        findings,
        "EDIT_PLAN_HISTORY_APPLY_LINK",
        `edit-plan-cases.json.literalCatalog.transitions.${operation}`,
        "The undo/redo witness must link to exactly one successful apply by its complete literal history row.",
      );
      continue;
    }
    const apply = applyRows[0] as MaterializedTransition;
    requireExact(
      undo.before,
      apply.after,
      "EDIT_PLAN_APPLY_UNDO_CHAIN",
      `edit-plan-cases.json.literalCatalog.transitions.${undo.id}.beforeState`,
      "Undo before-state must be the complete apply after-state.",
      findings,
    );
    requireExact(
      redo.before,
      undo.after,
      "EDIT_PLAN_UNDO_REDO_CHAIN",
      `edit-plan-cases.json.literalCatalog.transitions.${redo.id}.beforeState`,
      "Redo before-state must be the complete undo after-state.",
      findings,
    );
    requireExact(
      undo.after["document"],
      movedEntry["before"],
      "EDIT_PLAN_UNDO_DOCUMENT_INVERSE",
      `edit-plan-cases.json.literalCatalog.transitions.${undo.id}.afterState.document`,
      "Undo restores the exact complete before document.",
      findings,
    );
    requireExact(
      undo.after["bookmarks"],
      movedEntry["beforeBookmarks"],
      "EDIT_PLAN_UNDO_BOOKMARK_INVERSE",
      `edit-plan-cases.json.literalCatalog.transitions.${undo.id}.afterState.bookmarks`,
      "Undo restores the exact complete before bookmarks.",
      findings,
    );
    requireExact(
      redo.after["document"],
      movedEntry["after"],
      "EDIT_PLAN_REDO_DOCUMENT_INVERSE",
      `edit-plan-cases.json.literalCatalog.transitions.${redo.id}.afterState.document`,
      "Redo restores the exact committed document, including allocated IDs and all metadata.",
      findings,
    );
    requireExact(
      redo.after["bookmarks"],
      movedEntry["afterBookmarks"],
      "EDIT_PLAN_REDO_BOOKMARK_INVERSE",
      `edit-plan-cases.json.literalCatalog.transitions.${redo.id}.afterState.bookmarks`,
      "Redo restores the exact committed bookmarks.",
      findings,
    );

    const undoAfterHistory = isObject(undo.after["history"])
      ? undo.after["history"]
      : {};
    requireExact(
      undoAfterHistory["undo"],
      undoBeforeStack.slice(0, -1),
      "EDIT_PLAN_UNDO_POP",
      `edit-plan-cases.json.literalCatalog.transitions.${undo.id}.afterState.history.undo`,
      "Undo pops exactly one complete row.",
      findings,
    );
    requireExact(
      undoAfterHistory["redo"],
      [...recordsAt(undoBeforeHistory["redo"]), movedEntry],
      "EDIT_PLAN_UNDO_PUSH_REDO",
      `edit-plan-cases.json.literalCatalog.transitions.${undo.id}.afterState.history.redo`,
      "Undo pushes that identical row onto redo.",
      findings,
    );
    const redoBeforeHistory = isObject(redo.before["history"])
      ? redo.before["history"]
      : {};
    const redoBeforeStack = recordsAt(redoBeforeHistory["redo"]);
    const redoAfterHistory = isObject(redo.after["history"])
      ? redo.after["history"]
      : {};
    requireExact(
      redoBeforeStack.at(-1),
      movedEntry,
      "EDIT_PLAN_REDO_ENTRY_IDENTITY",
      `edit-plan-cases.json.literalCatalog.transitions.${redo.id}.beforeState.history.redo`,
      "Redo consumes the identical complete row produced by undo.",
      findings,
    );
    requireExact(
      redoAfterHistory["redo"],
      redoBeforeStack.slice(0, -1),
      "EDIT_PLAN_REDO_POP",
      `edit-plan-cases.json.literalCatalog.transitions.${redo.id}.afterState.history.redo`,
      "Redo pops exactly one complete row.",
      findings,
    );
    requireExact(
      redoAfterHistory["undo"],
      [...recordsAt(redoBeforeHistory["undo"]), movedEntry],
      "EDIT_PLAN_REDO_PUSH_UNDO",
      `edit-plan-cases.json.literalCatalog.transitions.${redo.id}.afterState.history.undo`,
      "Redo pushes that identical row back onto undo.",
      findings,
    );
    for (const transition of [undo, redo]) {
      const beforeHistory = isObject(transition.before["history"])
        ? transition.before["history"]
        : {};
      const afterHistory = isObject(transition.after["history"])
        ? transition.after["history"]
        : {};
      requireExact(
        afterHistory["retainedBytesEstimate"],
        beforeHistory["retainedBytesEstimate"],
        "EDIT_PLAN_HISTORY_REPLAY_TOTAL_BYTES",
        `edit-plan-cases.json.literalCatalog.transitions.${transition.id}.afterState.history.retainedBytesEstimate`,
        "Moving an exact history row between stacks preserves retained-byte total.",
        findings,
      );
    }
  }
}

function validateControlsTracesAndAuthorities(
  mutationRoot: JsonObject,
  traceRoot: JsonObject,
  provenanceRoot: JsonObject,
  cases: ReadonlyMap<string, JsonObject>,
  transitions: ReadonlyMap<string, JsonObject>,
  applicability: ReadonlyMap<string, JsonObject>,
  findings: A0U1EditPlanContractFinding[],
): Readonly<{
  controls: Map<string, JsonObject>;
  traces: Map<string, JsonObject>;
  lawCoverage: Map<string, JsonObject>;
  authorities: Map<string, JsonObject>;
}> {
  const controls = indexById(
    recordsAt(mutationRoot["controls"]),
    "mutation-controls.json.controls",
    findings,
  );
  const traces = indexById(
    recordsAt(traceRoot["traces"]),
    "trace-ledger.json.traces",
    findings,
  );
  const lawRows = recordsAt(traceRoot["lawCoverage"]);
  const lawCoverage = new Map<string, JsonObject>();
  for (const [index, row] of lawRows.entries()) {
    const lawId = row["lawId"];
    if (typeof lawId !== "string" || lawId.length === 0) {
      addFinding(
        findings,
        "EDIT_PLAN_LAW_COVERAGE_ID",
        `trace-ledger.json.lawCoverage[${String(index)}].lawId`,
        "Every law coverage row needs one declared law ID.",
      );
      continue;
    }
    if (lawCoverage.has(lawId)) {
      addFinding(
        findings,
        "EDIT_PLAN_LAW_COVERAGE_DUPLICATE",
        `trace-ledger.json.lawCoverage.${lawId}`,
        "Every law must have exactly one coverage row.",
      );
    }
    lawCoverage.set(lawId, row);
  }
  const authorities = indexById(
    recordsAt(provenanceRoot["authorities"]),
    "provenance-ledger.json.authorities",
    findings,
  );

  for (const [controlId, control] of controls) {
    checkExactKeys(
      control,
      EXPECTED_CONTROL_KEYS,
      "EDIT_PLAN_CONTROL_KEYS",
      `mutation-controls.json.controls.${controlId}`,
      findings,
    );
    if (!operationAllowed(control["operation"])) {
      addFinding(
        findings,
        "EDIT_PLAN_CONTROL_OPERATION",
        `mutation-controls.json.controls.${controlId}.operation`,
        "Mutation control operation is outside the closed vocabulary.",
      );
    }
    const baselineId = control["baselineTransitionId"];
    const killerId = control["killerTransitionId"];
    if (
      typeof baselineId !== "string" ||
      typeof killerId !== "string" ||
      baselineId === killerId ||
      !transitions.has(baselineId) ||
      !transitions.has(killerId)
    ) {
      addFinding(
        findings,
        "EDIT_PLAN_CONTROL_TRANSITIONS",
        `mutation-controls.json.controls.${controlId}`,
        "Each control needs distinct existing baseline and killer transitions.",
      );
    }
    const mutation = isObject(control["mutation"]) ? control["mutation"] : {};
    const observation = isObject(control["observation"])
      ? control["observation"]
      : {};
    checkExactKeys(
      mutation,
      [
        "materialization",
        "operator",
        "jsonPointer",
        "from",
        "to",
        "exactChangedFieldCount",
      ],
      "EDIT_PLAN_MUTATION_KEYS",
      `mutation-controls.json.controls.${controlId}.mutation`,
      findings,
    );
    checkExactKeys(
      observation,
      ["materialization", "jsonPointer", "baselineValue", "killerValue"],
      "EDIT_PLAN_OBSERVATION_KEYS",
      `mutation-controls.json.controls.${controlId}.observation`,
      findings,
    );
    if (
      mutation["exactChangedFieldCount"] !== 1 ||
      jsonDeepEqual(mutation["from"], mutation["to"])
    ) {
      addFinding(
        findings,
        "EDIT_PLAN_ONE_FIELD_MUTATION",
        `mutation-controls.json.controls.${controlId}.mutation`,
        "A control must change exactly one field from a distinct literal value.",
      );
    }
    if (
      mutation["materialization"] === observation["materialization"] &&
      mutation["jsonPointer"] === observation["jsonPointer"]
    ) {
      addFinding(
        findings,
        "EDIT_PLAN_MUTATION_OBSERVATION_TAUTOLOGY",
        `mutation-controls.json.controls.${controlId}`,
        "The independently observed consequence cannot be the mutation target itself.",
      );
    }
    if (
      jsonDeepEqual(observation["baselineValue"], observation["killerValue"])
    ) {
      addFinding(
        findings,
        "EDIT_PLAN_MUTATION_OBSERVATION_EQUAL",
        `mutation-controls.json.controls.${controlId}.observation`,
        "Baseline and killer observations must differ.",
      );
    }
    requireExact(
      control["exactExpectedDifference"],
      "one-recursive-input-delta-at-declared-pointer",
      "EDIT_PLAN_CONTROL_EXPECTED_DIFFERENCE",
      `mutation-controls.json.controls.${controlId}.exactExpectedDifference`,
      "Mutation controls use one closed exact-difference declaration.",
      findings,
    );
    requireExact(
      control["oracleExpectation"],
      "baseline-accepted-killer-rejected-by-independent-semantic-oracle",
      "EDIT_PLAN_CONTROL_ORACLE",
      `mutation-controls.json.controls.${controlId}.oracleExpectation`,
      "Mutation controls must state the independent baseline/killer oracle outcome exactly.",
      findings,
    );
    checkReferenceIds(
      control["linkedCaseIds"],
      cases,
      "EDIT_PLAN_CONTROL_CASE_REF",
      `mutation-controls.json.controls.${controlId}.linkedCaseIds`,
      findings,
    );
    checkReferenceIds(
      control["traceIds"],
      traces,
      "EDIT_PLAN_CONTROL_TRACE_REF",
      `mutation-controls.json.controls.${controlId}.traceIds`,
      findings,
    );
    checkReferenceIds(
      control["authorityIds"],
      authorities,
      "EDIT_PLAN_CONTROL_AUTHORITY_REF",
      `mutation-controls.json.controls.${controlId}.authorityIds`,
      findings,
    );
    for (const lawId of stringsAt(control["lawIds"])) {
      if (!A0_U1_ATOMIC_EDIT_LAW_IDS.includes(lawId as never)) {
        addFinding(
          findings,
          "EDIT_PLAN_CONTROL_LAW_REF",
          `mutation-controls.json.controls.${controlId}.lawIds.${lawId}`,
          "Mutation control cites an undeclared law.",
        );
      }
    }
  }

  for (const [traceId, trace] of traces) {
    checkExactKeys(
      trace,
      EXPECTED_TRACE_KEYS,
      "EDIT_PLAN_TRACE_KEYS",
      `trace-ledger.json.traces.${traceId}`,
      findings,
    );
    checkReferenceIds(
      trace["caseIds"],
      cases,
      "EDIT_PLAN_TRACE_CASE_REF",
      `trace-ledger.json.traces.${traceId}.caseIds`,
      findings,
    );
    checkReferenceIds(
      trace["transitionIds"],
      transitions,
      "EDIT_PLAN_TRACE_TRANSITION_REF",
      `trace-ledger.json.traces.${traceId}.transitionIds`,
      findings,
    );
    checkReferenceIds(
      trace["controlIds"],
      controls,
      "EDIT_PLAN_TRACE_CONTROL_REF",
      `trace-ledger.json.traces.${traceId}.controlIds`,
      findings,
    );
    checkReferenceIds(
      trace["authorityIds"],
      authorities,
      "EDIT_PLAN_TRACE_AUTHORITY_REF",
      `trace-ledger.json.traces.${traceId}.authorityIds`,
      findings,
    );
    if (stringsAt(trace["proofKinds"]).length === 0) {
      addFinding(
        findings,
        "EDIT_PLAN_TRACE_PROOF_EMPTY",
        `trace-ledger.json.traces.${traceId}.proofKinds`,
        "Every trace needs explicit proof kinds.",
      );
    }
  }

  requireExact(
    [...lawCoverage.keys()],
    A0_U1_ATOMIC_EDIT_LAW_IDS,
    "EDIT_PLAN_LAW_COVERAGE_COMPLETENESS",
    "trace-ledger.json.lawCoverage",
    "Law coverage must contain each declared law exactly once in contract order.",
    findings,
  );
  for (const [lawId, row] of lawCoverage) {
    checkExactKeys(
      row,
      EXPECTED_LAW_COVERAGE_KEYS,
      "EDIT_PLAN_LAW_COVERAGE_KEYS",
      `trace-ledger.json.lawCoverage.${lawId}`,
      findings,
    );
    checkReferenceIds(
      row["positiveTransitionIds"],
      transitions,
      "EDIT_PLAN_LAW_POSITIVE_REF",
      `trace-ledger.json.lawCoverage.${lawId}.positiveTransitionIds`,
      findings,
    );
    checkReferenceIds(
      row["negativeOrNearMissTransitionIds"],
      transitions,
      "EDIT_PLAN_LAW_NEGATIVE_REF",
      `trace-ledger.json.lawCoverage.${lawId}.negativeOrNearMissTransitionIds`,
      findings,
    );
    checkReferenceIds(
      row["boundaryTransitionIds"],
      transitions,
      "EDIT_PLAN_LAW_BOUNDARY_REF",
      `trace-ledger.json.lawCoverage.${lawId}.boundaryTransitionIds`,
      findings,
    );
    checkReferenceIds(
      row["applicabilityRowIds"],
      applicability,
      "EDIT_PLAN_LAW_APPLICABILITY_REF",
      `trace-ledger.json.lawCoverage.${lawId}.applicabilityRowIds`,
      findings,
    );
    checkReferenceIds(
      row["mutationControlIds"],
      controls,
      "EDIT_PLAN_LAW_CONTROL_REF",
      `trace-ledger.json.lawCoverage.${lawId}.mutationControlIds`,
      findings,
    );
    checkReferenceIds(
      row["traceIds"],
      traces,
      "EDIT_PLAN_LAW_TRACE_REF",
      `trace-ledger.json.lawCoverage.${lawId}.traceIds`,
      findings,
    );
    checkReferenceIds(
      row["authorityIds"],
      authorities,
      "EDIT_PLAN_LAW_AUTHORITY_REF",
      `trace-ledger.json.lawCoverage.${lawId}.authorityIds`,
      findings,
    );
  }

  if (
    provenanceRoot["expertReviewClaim"] !== false ||
    provenanceRoot["humanAcceptanceClaim"] !== false
  ) {
    addFinding(
      findings,
      "EDIT_PLAN_PROVENANCE_CLAIM",
      "provenance-ledger.json",
      "Mechanical specification evidence cannot claim expert or human acceptance.",
    );
  }
  const independence = isObject(provenanceRoot["independence"])
    ? provenanceRoot["independence"]
    : {};
  if (
    independence["productionOutputUsedAsOracle"] !== false ||
    independence["expectedValuesGenerated"] !== false
  ) {
    addFinding(
      findings,
      "EDIT_PLAN_PROVENANCE_INDEPENDENCE",
      "provenance-ledger.json.independence",
      "Expected values must be independently authored and never generated from production.",
    );
  }
  for (const [authorityId, authority] of authorities) {
    checkExactKeys(
      authority,
      EXPECTED_AUTHORITY_KEYS,
      "EDIT_PLAN_AUTHORITY_KEYS",
      `provenance-ledger.json.authorities.${authorityId}`,
      findings,
    );
    checkReferenceIds(
      authority["caseIds"],
      cases,
      "EDIT_PLAN_AUTHORITY_CASE_REF",
      `provenance-ledger.json.authorities.${authorityId}.caseIds`,
      findings,
    );
    checkReferenceIds(
      authority["transitionIds"],
      transitions,
      "EDIT_PLAN_AUTHORITY_TRANSITION_REF",
      `provenance-ledger.json.authorities.${authorityId}.transitionIds`,
      findings,
    );
    checkReferenceIds(
      authority["controlIds"],
      controls,
      "EDIT_PLAN_AUTHORITY_CONTROL_REF",
      `provenance-ledger.json.authorities.${authorityId}.controlIds`,
      findings,
    );
    checkReferenceIds(
      authority["traceIds"],
      traces,
      "EDIT_PLAN_AUTHORITY_TRACE_REF",
      `provenance-ledger.json.authorities.${authorityId}.traceIds`,
      findings,
    );
  }

  for (const [caseId, row] of cases) {
    checkReferenceIds(
      row["mutationControlIds"],
      controls,
      "EDIT_PLAN_CASE_CONTROL_REF",
      `edit-plan-cases.json.caseGroups.${caseId}.mutationControlIds`,
      findings,
      false,
    );
    checkReferenceIds(
      row["traceIds"],
      traces,
      "EDIT_PLAN_CASE_TRACE_REF",
      `edit-plan-cases.json.caseGroups.${caseId}.traceIds`,
      findings,
    );
    checkReferenceIds(
      row["authorityIds"],
      authorities,
      "EDIT_PLAN_CASE_AUTHORITY_REF",
      `edit-plan-cases.json.caseGroups.${caseId}.authorityIds`,
      findings,
    );
    for (const controlId of stringsAt(row["mutationControlIds"])) {
      const control = controls.get(controlId);
      if (
        control !== undefined &&
        !stringsAt(control["linkedCaseIds"]).includes(caseId)
      ) {
        addFinding(
          findings,
          "EDIT_PLAN_CASE_CONTROL_RECIPROCAL",
          `edit-plan-cases.json.caseGroups.${caseId}.mutationControlIds.${controlId}`,
          "Case and mutation-control links must be reciprocal.",
        );
      }
    }
    for (const traceId of stringsAt(row["traceIds"])) {
      const trace = traces.get(traceId);
      if (
        trace !== undefined &&
        !reciprocalIncludes(trace, "caseIds", caseId)
      ) {
        addFinding(
          findings,
          "EDIT_PLAN_CASE_TRACE_RECIPROCAL",
          `edit-plan-cases.json.caseGroups.${caseId}.traceIds.${traceId}`,
          "Case and trace links must be reciprocal.",
        );
      }
    }
    for (const authorityId of stringsAt(row["authorityIds"])) {
      const authority = authorities.get(authorityId);
      if (
        authority !== undefined &&
        !reciprocalIncludes(authority, "caseIds", caseId)
      ) {
        addFinding(
          findings,
          "EDIT_PLAN_CASE_AUTHORITY_RECIPROCAL",
          `edit-plan-cases.json.caseGroups.${caseId}.authorityIds.${authorityId}`,
          "Case and provenance links must be reciprocal.",
        );
      }
    }
  }
  for (const [controlId, control] of controls) {
    for (const traceId of stringsAt(control["traceIds"])) {
      const trace = traces.get(traceId);
      if (
        trace !== undefined &&
        !reciprocalIncludes(trace, "controlIds", controlId)
      ) {
        addFinding(
          findings,
          "EDIT_PLAN_CONTROL_TRACE_RECIPROCAL",
          `mutation-controls.json.controls.${controlId}.traceIds.${traceId}`,
          "Control and trace links must be reciprocal.",
        );
      }
    }
    for (const authorityId of stringsAt(control["authorityIds"])) {
      const authority = authorities.get(authorityId);
      if (
        authority !== undefined &&
        !reciprocalIncludes(authority, "controlIds", controlId)
      ) {
        addFinding(
          findings,
          "EDIT_PLAN_CONTROL_AUTHORITY_RECIPROCAL",
          `mutation-controls.json.controls.${controlId}.authorityIds.${authorityId}`,
          "Control and provenance links must be reciprocal.",
        );
      }
    }
  }
  for (const [traceId, trace] of traces) {
    for (const authorityId of stringsAt(trace["authorityIds"])) {
      const authority = authorities.get(authorityId);
      if (
        authority !== undefined &&
        !reciprocalIncludes(authority, "traceIds", traceId)
      ) {
        addFinding(
          findings,
          "EDIT_PLAN_TRACE_AUTHORITY_RECIPROCAL",
          `trace-ledger.json.traces.${traceId}.authorityIds.${authorityId}`,
          "Trace and provenance links must be reciprocal.",
        );
      }
    }
  }
  return { controls, traces, lawCoverage, authorities };
}

function transitionMaterialization(
  transition: JsonObject,
  selector: unknown,
  catalog: JsonObject,
): unknown {
  if (selector === "command" || selector === "beforeState") {
    return materializeLiteral(transition[selector], catalog);
  }
  if (
    typeof selector === "string" &&
    [
      "expected.result",
      "expected.counters",
      "expected.afterState",
      "expected.exactDelta",
      "expected.bookmarks",
      "expected.history",
    ].includes(selector)
  ) {
    const expected = materializeLiteral(transition["expected"], catalog);
    const field = selector.slice("expected.".length);
    return isObject(expected) ? expected[field] : undefined;
  }
  return undefined;
}

function pointerValueOrAbsent(value: unknown, pointer: unknown): unknown {
  if (typeof pointer !== "string") return undefined;
  const observed = valueAtPointer(value, pointer);
  return observed === undefined ? { $absent: true } : observed;
}

function validateMutationMaterializations(
  controls: ReadonlyMap<string, JsonObject>,
  transitions: ReadonlyMap<string, JsonObject>,
  catalog: JsonObject,
  findings: A0U1EditPlanContractFinding[],
): void {
  for (const [controlId, control] of controls) {
    const baseline = transitions.get(String(control["baselineTransitionId"]));
    const killer = transitions.get(String(control["killerTransitionId"]));
    if (baseline === undefined || killer === undefined) continue;
    const mutation = isObject(control["mutation"]) ? control["mutation"] : {};
    const observation = isObject(control["observation"])
      ? control["observation"]
      : {};
    const path = `mutation-controls.json.controls.${controlId}`;
    try {
      const baselineMutation = transitionMaterialization(
        baseline,
        mutation["materialization"],
        catalog,
      );
      const killerMutation = transitionMaterialization(
        killer,
        mutation["materialization"],
        catalog,
      );
      if (baselineMutation === undefined || killerMutation === undefined) {
        throw new Error("mutation component selector did not resolve");
      }
      const computedMutation = computeRecursiveLiteralDelta(
        baselineMutation,
        killerMutation,
      );
      const pointer = mutation["jsonPointer"];
      const from = pointerValueOrAbsent(baselineMutation, pointer);
      const to = pointerValueOrAbsent(killerMutation, pointer);
      requireExact(
        mutation["from"],
        from,
        "EDIT_PLAN_MUTATION_FROM",
        `${path}.mutation.from`,
        "Mutation from-value must be independently resolved from the baseline transition.",
        findings,
      );
      requireExact(
        mutation["to"],
        to,
        "EDIT_PLAN_MUTATION_TO",
        `${path}.mutation.to`,
        "Mutation to-value must be independently resolved from the killer transition.",
        findings,
      );
      if (
        computedMutation.length !== 1 ||
        computedMutation[0]?.jsonPointer !== pointer ||
        !jsonDeepEqual(computedMutation[0]?.before, from) ||
        !jsonDeepEqual(computedMutation[0]?.after, to)
      ) {
        addFinding(
          findings,
          "EDIT_PLAN_MUTATION_NOT_ONE_FIELD",
          `${path}.mutation`,
          "Baseline and killer input materializations must differ at exactly the declared one field.",
        );
      }

      const baselineObservation = transitionMaterialization(
        baseline,
        observation["materialization"],
        catalog,
      );
      const killerObservation = transitionMaterialization(
        killer,
        observation["materialization"],
        catalog,
      );
      if (
        baselineObservation === undefined ||
        killerObservation === undefined
      ) {
        throw new Error("observation component selector did not resolve");
      }
      const baselineValue = pointerValueOrAbsent(
        baselineObservation,
        observation["jsonPointer"],
      );
      const killerValue = pointerValueOrAbsent(
        killerObservation,
        observation["jsonPointer"],
      );
      requireExact(
        observation["baselineValue"],
        baselineValue,
        "EDIT_PLAN_OBSERVATION_BASELINE",
        `${path}.observation.baselineValue`,
        "Observed baseline consequence must be independently resolved.",
        findings,
      );
      requireExact(
        observation["killerValue"],
        killerValue,
        "EDIT_PLAN_OBSERVATION_KILLER",
        `${path}.observation.killerValue`,
        "Observed killer consequence must be independently resolved.",
        findings,
      );
      if (jsonDeepEqual(baselineValue, killerValue)) {
        addFinding(
          findings,
          "EDIT_PLAN_OBSERVATION_NO_CONSEQUENCE",
          `${path}.observation`,
          "The one-field killer must produce a distinct independently observed consequence.",
        );
      }
    } catch (error) {
      addFinding(
        findings,
        "EDIT_PLAN_MUTATION_MATERIALIZATION",
        path,
        `Mutation materialization failed: ${error instanceof Error ? error.message : String(error)}.`,
      );
    }
  }
}

function validateAuxiliaryLinks(
  applicability: ReadonlyMap<string, JsonObject>,
  transposition: ReadonlyMap<string, JsonObject>,
  traces: ReadonlyMap<string, JsonObject>,
  authorities: ReadonlyMap<string, JsonObject>,
  findings: A0U1EditPlanContractFinding[],
): void {
  requireExact(
    [...traces.values()].map((trace) => trace["scope"]),
    ["pipeline", ...A0_U1_ATOMIC_EDIT_PLAN_KINDS],
    "EDIT_PLAN_TRACE_SCOPE_COMPLETENESS",
    "trace-ledger.json.traces",
    "Trace ledger must contain pipeline then one operation-owned trace per plan kind.",
    findings,
  );
  for (const [rowId, row] of applicability) {
    checkReferenceIds(
      row["traceIds"],
      traces,
      "EDIT_PLAN_APPLICABILITY_TRACE_REF",
      `edit-plan-cases.json.applicabilityRows.${rowId}.traceIds`,
      findings,
    );
    checkReferenceIds(
      row["authorityIds"],
      authorities,
      "EDIT_PLAN_APPLICABILITY_AUTHORITY_REF",
      `edit-plan-cases.json.applicabilityRows.${rowId}.authorityIds`,
      findings,
    );
  }
  for (const [witnessId, row] of transposition) {
    checkReferenceIds(
      row["traceIds"],
      traces,
      "EDIT_PLAN_TRANSPOSITION_TRACE_REF",
      `edit-plan-cases.json.transpositionWitnesses.${witnessId}.traceIds`,
      findings,
    );
    checkReferenceIds(
      row["authorityIds"],
      authorities,
      "EDIT_PLAN_TRANSPOSITION_AUTHORITY_REF",
      `edit-plan-cases.json.transpositionWitnesses.${witnessId}.authorityIds`,
      findings,
    );
  }
}

function validateFixtureShells(
  loaded: ReadonlyMap<SpecFilename, LoadedFixture>,
  findings: A0U1EditPlanContractFinding[],
): void {
  for (const filename of A0_U1_EDIT_PLAN_SPEC_FILES) {
    const fixture = loaded.get(filename);
    const root = fixture?.root;
    if (root?.["schema"] !== EXPECTED_SCHEMAS[filename]) {
      addFinding(
        findings,
        "EDIT_PLAN_SCHEMA",
        `${filename}.schema`,
        "Fixture schema differs from the closed A0/U1 packet vocabulary.",
      );
    }
    if (root?.["reviewState"] !== EXPECTED_REVIEW_STATES[filename]) {
      addFinding(
        findings,
        "EDIT_PLAN_REVIEW_STATE",
        `${filename}.reviewState`,
        "Fixture review state must describe an independent proposed specification.",
      );
    }
    if (root?.["pinState"] !== "reviewed-byte-and-semantic-pinned") {
      addFinding(
        findings,
        "EDIT_PLAN_PIN_STATE",
        `${filename}.pinState`,
        "Every reviewed fixture must declare the final byte-and-semantic pin state.",
      );
    }
    if (filename === "a0-u1-edit-plan-contract.json") {
      if (root !== undefined) validateRootContract(root, findings);
      continue;
    }
    checkExactKeys(
      root,
      EXPECTED_TOP_LEVEL_KEYS[filename],
      "EDIT_PLAN_COMPANION_KEYS",
      filename,
      findings,
    );
  }
}

function validateCoverageCrossProduct(
  cases: ReadonlyMap<string, JsonObject>,
  findings: A0U1EditPlanContractFinding[],
): void {
  for (const operation of A0_U1_ATOMIC_EDIT_PLAN_KINDS) {
    for (const family of EXPECTED_COVERAGE_FAMILIES) {
      const matching = [...cases.values()].filter(
        (row) => row["operation"] === operation && row["category"] === family,
      );
      if (matching.length !== 1) {
        addFinding(
          findings,
          "EDIT_PLAN_COVERAGE_CROSS_PRODUCT",
          `edit-plan-cases.json.caseGroups.${operation}.${family}`,
          "The 50-case inventory must contain exactly one group for every plan-kind and coverage-family pair.",
        );
      }
    }
  }
}

function validateLawReciprocity(
  transitions: ReadonlyMap<string, JsonObject>,
  controls: ReadonlyMap<string, JsonObject>,
  traces: ReadonlyMap<string, JsonObject>,
  lawCoverage: ReadonlyMap<string, JsonObject>,
  authorities: ReadonlyMap<string, JsonObject>,
  findings: A0U1EditPlanContractFinding[],
): void {
  const transitionCoverageFields = [
    "positiveTransitionIds",
    "negativeOrNearMissTransitionIds",
    "boundaryTransitionIds",
  ] as const;
  for (const [transitionId, transition] of transitions) {
    for (const lawId of stringsAt(transition["lawIds"])) {
      const law = lawCoverage.get(lawId);
      if (
        law === undefined ||
        !transitionCoverageFields.some((field) =>
          stringsAt(law[field]).includes(transitionId),
        )
      ) {
        addFinding(
          findings,
          "EDIT_PLAN_TRANSITION_LAW_RECIPROCAL",
          `edit-plan-cases.json.literalCatalog.transitions.${transitionId}.lawIds.${lawId}`,
          "Transition-to-law links must appear in one of the law row's typed transition lists.",
        );
      }
    }
  }
  for (const [lawId, law] of lawCoverage) {
    for (const field of transitionCoverageFields) {
      for (const transitionId of stringsAt(law[field])) {
        if (
          !stringsAt(transitions.get(transitionId)?.["lawIds"]).includes(lawId)
        ) {
          addFinding(
            findings,
            "EDIT_PLAN_LAW_TRANSITION_RECIPROCAL",
            `trace-ledger.json.lawCoverage.${lawId}.${field}.${transitionId}`,
            "Law-to-transition links must be reciprocal.",
          );
        }
      }
    }
    for (const controlId of stringsAt(law["mutationControlIds"])) {
      if (!stringsAt(controls.get(controlId)?.["lawIds"]).includes(lawId)) {
        addFinding(
          findings,
          "EDIT_PLAN_LAW_CONTROL_RECIPROCAL",
          `trace-ledger.json.lawCoverage.${lawId}.mutationControlIds.${controlId}`,
          "Law and mutation-control links must be reciprocal.",
        );
      }
    }
    for (const traceId of stringsAt(law["traceIds"])) {
      if (!stringsAt(traces.get(traceId)?.["lawIds"]).includes(lawId)) {
        addFinding(
          findings,
          "EDIT_PLAN_LAW_TRACE_RECIPROCAL",
          `trace-ledger.json.lawCoverage.${lawId}.traceIds.${traceId}`,
          "Law and trace links must be reciprocal.",
        );
      }
    }
    for (const authorityId of stringsAt(law["authorityIds"])) {
      if (
        !stringsAt(authorities.get(authorityId)?.["lawIds"]).includes(lawId)
      ) {
        addFinding(
          findings,
          "EDIT_PLAN_LAW_AUTHORITY_RECIPROCAL",
          `trace-ledger.json.lawCoverage.${lawId}.authorityIds.${authorityId}`,
          "Law and provenance-authority links must be reciprocal.",
        );
      }
    }
  }
  for (const [controlId, control] of controls) {
    for (const lawId of stringsAt(control["lawIds"])) {
      if (
        !stringsAt(lawCoverage.get(lawId)?.["mutationControlIds"]).includes(
          controlId,
        )
      ) {
        addFinding(
          findings,
          "EDIT_PLAN_CONTROL_LAW_RECIPROCAL",
          `mutation-controls.json.controls.${controlId}.lawIds.${lawId}`,
          "Mutation-control and law links must be reciprocal.",
        );
      }
    }
  }
  for (const [traceId, trace] of traces) {
    for (const lawId of stringsAt(trace["lawIds"])) {
      if (!stringsAt(lawCoverage.get(lawId)?.["traceIds"]).includes(traceId)) {
        addFinding(
          findings,
          "EDIT_PLAN_TRACE_LAW_RECIPROCAL",
          `trace-ledger.json.traces.${traceId}.lawIds.${lawId}`,
          "Trace and law links must be reciprocal.",
        );
      }
    }
  }
  for (const [authorityId, authority] of authorities) {
    for (const lawId of stringsAt(authority["lawIds"])) {
      if (
        !stringsAt(lawCoverage.get(lawId)?.["authorityIds"]).includes(
          authorityId,
        )
      ) {
        addFinding(
          findings,
          "EDIT_PLAN_AUTHORITY_LAW_RECIPROCAL",
          `provenance-ledger.json.authorities.${authorityId}.lawIds.${lawId}`,
          "Provenance authority and law links must be reciprocal.",
        );
      }
    }
  }
}

function validateCompanionDigests(
  contract: JsonObject,
  loaded: ReadonlyMap<SpecFilename, LoadedFixture>,
  findings: A0U1EditPlanContractFinding[],
): void {
  const declared = isObject(contract["companionSha256"])
    ? contract["companionSha256"]
    : {};
  const companionNames = A0_U1_EDIT_PLAN_SPEC_FILES.filter(
    (filename) => filename !== "a0-u1-edit-plan-contract.json",
  );
  checkExactKeys(
    declared,
    companionNames,
    "EDIT_PLAN_COMPANION_DIGEST_KEYS",
    "a0-u1-edit-plan-contract.json.companionSha256",
    findings,
  );
  for (const filename of companionNames) {
    const digest = loaded.get(filename);
    if (digest !== undefined && declared[filename] !== sha256(digest.bytes)) {
      addFinding(
        findings,
        "EDIT_PLAN_COMPANION_DIGEST",
        `a0-u1-edit-plan-contract.json.companionSha256.${filename}`,
        "Root companion digest must equal the exact checked-in companion bytes.",
      );
    }
  }
}

export async function validateA0U1EditPlanContract(
  fixtureRoot = DEFAULT_FIXTURE_ROOT,
  options: A0U1EditPlanContractValidationOptions = {},
): Promise<A0U1EditPlanContractValidationReport> {
  const findings: A0U1EditPlanContractFinding[] = [];
  const loaded = new Map<SpecFilename, LoadedFixture>();
  let actualFiles: string[] = [];
  try {
    actualFiles = (await readdir(fixtureRoot)).sort(codeUnitCompare);
  } catch {
    addFinding(
      findings,
      "EDIT_PLAN_FIXTURE_ROOT",
      fixtureRoot,
      "The A0/U1 fixture root must exist and be readable.",
    );
  }
  requireExact(
    actualFiles,
    [...A0_U1_EDIT_PLAN_SPEC_FILES],
    "EDIT_PLAN_FILE_INVENTORY",
    fixtureRoot,
    "Fixture inventory must contain exactly the five reviewed packet files.",
    findings,
  );

  const expectedByteDigests =
    options.expectedByteDigests ?? A0_U1_EDIT_PLAN_SPEC_BYTE_DIGESTS;
  for (const filename of A0_U1_EDIT_PLAN_SPEC_FILES) {
    const path = resolve(fixtureRoot, filename);
    try {
      const bytes = new Uint8Array(await readFile(path));
      const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (
        hasUtf8Bom(bytes) ||
        source.includes("\r") ||
        !source.endsWith("\n") ||
        source.endsWith("\n\n")
      ) {
        addFinding(
          findings,
          "EDIT_PLAN_TEXT_CANONICAL",
          filename,
          "Fixture must be UTF-8 without BOM/CR and have exactly one final LF.",
        );
      }
      let duplicates: string[] = [];
      try {
        duplicates = findDuplicateJsonKeys(source);
      } catch {
        addFinding(
          findings,
          "EDIT_PLAN_JSON_LEXICAL",
          filename,
          "Fixture must pass the independent strict JSON lexical scan.",
        );
      }
      for (const duplicate of duplicates) {
        addFinding(
          findings,
          "EDIT_PLAN_JSON_DUPLICATE_KEY",
          `${filename}${duplicate.slice(1)}`,
          "Duplicate JSON object keys are forbidden.",
        );
      }
      const parsed: unknown = JSON.parse(source);
      if (!isObject(parsed)) {
        addFinding(
          findings,
          "EDIT_PLAN_JSON_ROOT",
          filename,
          "Fixture root must be a JSON object.",
        );
      } else {
        loaded.set(filename, { filename, bytes, source, root: parsed });
      }
      if (sha256(bytes) !== expectedByteDigests[filename]) {
        addFinding(
          findings,
          "EDIT_PLAN_BYTE_DIGEST",
          filename,
          "Fixture bytes differ from the independently reviewed byte pin.",
        );
      }
    } catch {
      addFinding(
        findings,
        "EDIT_PLAN_FILE_READ",
        filename,
        "Fixture must be readable, valid UTF-8, and valid JSON.",
      );
    }
  }

  validateFixtureShells(loaded, findings);
  const semanticPacket = Object.fromEntries(
    A0_U1_EDIT_PLAN_SPEC_FILES.map((filename) => [
      filename,
      loaded.get(filename)?.root ?? null,
    ]),
  );
  if (
    sha256(stableJson(semanticPacket)) !== A0_U1_EDIT_PLAN_SPEC_SEMANTIC_DIGEST
  ) {
    addFinding(
      findings,
      "EDIT_PLAN_SEMANTIC_DIGEST",
      fixtureRoot,
      "Parsed contract, cases, controls, provenance, and traces differ from the reviewed semantic pin.",
    );
  }

  const contract = loaded.get("a0-u1-edit-plan-contract.json")?.root ?? {};
  const casesRoot = await hydrateCheckedInDocumentLiterals(
    loaded.get("edit-plan-cases.json")?.root ?? {},
    findings,
  );
  const mutationRoot = loaded.get("mutation-controls.json")?.root ?? {};
  const provenanceRoot = loaded.get("provenance-ledger.json")?.root ?? {};
  const traceRoot = loaded.get("trace-ledger.json")?.root ?? {};
  const caseIndexes = validateCases(casesRoot, findings);
  validateApplyUndoRedoTrios(caseIndexes.materialized, findings);
  const linkedIndexes = validateControlsTracesAndAuthorities(
    mutationRoot,
    traceRoot,
    provenanceRoot,
    caseIndexes.cases,
    caseIndexes.transitions,
    caseIndexes.applicability,
    findings,
  );
  validateCoverageCrossProduct(caseIndexes.cases, findings);
  validateLawReciprocity(
    caseIndexes.transitions,
    linkedIndexes.controls,
    linkedIndexes.traces,
    linkedIndexes.lawCoverage,
    linkedIndexes.authorities,
    findings,
  );
  validateMutationMaterializations(
    linkedIndexes.controls,
    caseIndexes.transitions,
    caseIndexes.catalog,
    findings,
  );
  validateAuxiliaryLinks(
    caseIndexes.applicability,
    caseIndexes.transposition,
    linkedIndexes.traces,
    linkedIndexes.authorities,
    findings,
  );
  validateCompanionDigests(contract, loaded, findings);

  const counts = Object.freeze({
    files: actualFiles.length,
    commandKinds: Array.isArray(contract["commandKinds"])
      ? contract["commandKinds"].length
      : 0,
    planKinds: Array.isArray(contract["planKinds"])
      ? contract["planKinds"].length
      : 0,
    lawRows: linkedIndexes.lawCoverage.size,
    caseGroups: caseIndexes.cases.size,
    literalTransitions: caseIndexes.transitions.size,
    applicabilityRows: caseIndexes.applicability.size,
    transpositionWitnesses: caseIndexes.transposition.size,
    mutationControls: linkedIndexes.controls.size,
    traces: linkedIndexes.traces.size,
    authorities: linkedIndexes.authorities.size,
  });
  requireExact(
    counts,
    EXPECTED_COUNTS,
    "EDIT_PLAN_COUNTS",
    fixtureRoot,
    "Actual packet inventory differs from the frozen 5/1/5/17/50/70/5/5/30/6/6 closure.",
    findings,
  );
  requireExact(
    APPLICATION_WORK_COUNTER_NAMES,
    [
      "sectionsVisited",
      "measuresVisited",
      "eventsVisited",
      "stableIdsIndexed",
      "historyEntriesVisited",
      "historyBytesEstimated",
      "bookmarksRepaired",
      "requestsCompared",
      "transportNotificationsCompared",
      "validationCalls",
    ],
    "EDIT_PLAN_EXISTING_A0_COUNTER_DRIFT",
    "src/application/application-state-contract.ts.APPLICATION_WORK_COUNTER_NAMES",
    "The spec leaf must not modify the accepted A0 work-counter surface.",
    findings,
  );

  findings.sort(
    (left, right) =>
      codeUnitCompare(left.path, right.path) ||
      codeUnitCompare(left.code, right.code) ||
      codeUnitCompare(left.message, right.message),
  );
  return Object.freeze({
    schema: "changes.validation.a0-u1-edit-plan-contract.v1",
    package: "A0/U1 atomic edit plan",
    outcome: findings.length === 0 ? "pass" : "fail",
    reviewState: "proposed-independent-spec",
    counts,
    existingA0CommandKindsUnchanged: jsonDeepEqual(
      A0_U1_PROPOSED_APPLICATION_COMMAND_KINDS,
      [...APPLICATION_COMMAND_KINDS, "apply-edit-plan"],
    ),
    productionImplementationClaim: false,
    u1UiCompletionClaim: false,
    humanAcceptanceClaim: false,
    expertReviewClaim: false,
    findings: Object.freeze(findings),
  });
}

if (import.meta.main) {
  const report = await validateA0U1EditPlanContract(process.argv[2]);
  console.log(JSON.stringify(report, null, 2));
  if (report.outcome === "fail") process.exitCode = 1;
}
