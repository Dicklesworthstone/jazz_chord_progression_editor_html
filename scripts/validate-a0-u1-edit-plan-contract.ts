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
  MAX_DRAFT_ISSUES,
  MAX_HISTORY_RETAINED_BYTES,
  MAX_QUICK_ENTRY_CODE_POINTS,
  MAX_SELECTED_EVENT_IDS,
} from "../src/application/application-state-contract";
import {
  A0_U1_ATOMIC_EDIT_IMPLEMENTATION_STATUS,
  A0_U1_ATOMIC_EDIT_ALLOWED_OUTER_CODES_BY_REFUSAL_CODE,
  A0_U1_ATOMIC_EDIT_DIAGNOSTIC_PATH_ORDER,
  A0_U1_ATOMIC_EDIT_HISTORY_REFUSAL_POLICY,
  A0_U1_ATOMIC_EDIT_OUTER_WORK_POLICY,
  A0_U1_ATOMIC_EDIT_PLAN_EXACT_SHAPE_PRECEDENCE,
  A0_U1_ATOMIC_EDIT_PLAN_BOOKMARK_POLICIES,
  A0_U1_ATOMIC_EDIT_PLAN_DIAGNOSTIC_ORDER,
  A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS,
  A0_U1_ATOMIC_EDIT_FIRST_EXCESS_WORK_COUNTERS,
  A0_U1_FINAL_COLLECTION_LIMIT_COMPARISON_ORDER,
  A0_U1_ATOMIC_EDIT_PLAN_FOCUS_DERIVATION_ORDER,
  A0_U1_ATOMIC_EDIT_PLAN_FORBIDDEN_PAYLOAD_KEYS,
  A0_U1_ATOMIC_EDIT_PLAN_ID_ENTROPY_POLICY,
  A0_U1_ATOMIC_EDIT_PLAN_ID_ALLOCATION_ORDER,
  A0_U1_ATOMIC_EDIT_LAW_IDS,
  A0_U1_ATOMIC_EDIT_LIMITS,
  A0_U1_ATOMIC_EDIT_PLAN_CONTRACT_SCHEMA,
  A0_U1_ATOMIC_EDIT_PLAN_KINDS,
  A0_U1_ATOMIC_EDIT_PLAN_POLICY_VERSION,
  A0_U1_ATOMIC_EDIT_OUTER_REFUSAL_CODES,
  A0_U1_ATOMIC_EDIT_PATH_TEMPLATE_GRAMMAR,
  A0_U1_ATOMIC_EDIT_PREPLAN_OUTER_REFUSAL_CODES,
  A0_U1_ATOMIC_EDIT_PLAN_RUNNER_STAGE_ORDER,
  A0_U1_ATOMIC_EDIT_PLAN_RECEIPT_SCHEMA,
  A0_U1_ATOMIC_EDIT_PLAN_TRANSPOSITION_POLICY,
  A0_U1_ATOMIC_EDIT_PLAN_TEXT_SHAPE_POLICY,
  A0_U1_ATOMIC_EDIT_REFUSAL_AUTHORITY,
  A0_U1_ATOMIC_EDIT_REFUSAL_CODES,
  A0_U1_ATOMIC_EDIT_WORK_COUNTER_MAXIMA,
  A0_U1_ATOMIC_EDIT_WORK_COUNTER_NAMES,
  A0_U1_FRAGMENT_SOURCE_REFUSAL_REACHABILITY,
  A0_U1_STATIC_REFUSAL_REACHABILITY,
  A0_U1_NEW_EVENT_AUTO_VOICING,
  A0_U1_NEW_EVENT_POLICY_ID,
  A0_U1_PROPOSED_APPLICATION_COMMAND_KINDS,
  A0_U1_QUICK_ENTRY_TARGET_MATCH_POLICY,
  A0_U1_RECOVERY_FIELD_COMPARISON_ORDER,
  A0_U1_RECOVERED_CHORD_LAYOUT_LOSS_ACKNOWLEDGEMENT,
  A0_U1_T0_NEW_MEASURE_COMPLETION_POLICY,
  MAX_A0_U1_REACHABLE_FINAL_TIMELINE_QUARTER_NOTE_BEATS,
} from "../src/application/application-edit-plan-contract";
import {
  ALLOWED_BEAT_DENOMINATORS,
  BEAT_UNITS,
  KEY_MODES,
  MAX_BEATS_PER_BAR,
  MAX_DOCUMENT_CHORD_EVENTS,
  MAX_DOCUMENT_SECTIONS,
  MAX_LONG_TEXT_CODE_POINTS,
  MAX_NORMALIZED_BEAT_NUMERATOR,
  MAX_SECTION_MEASURES,
  MAX_SHORT_TEXT_CODE_POINTS,
  MAX_TIMELINE_QUARTER_NOTE_BEATS,
  decodeDocumentShape,
  makeMeter,
  SECTION_VOICE_LEADING_BOUNDARIES,
  STABLE_ID_MAX_ASCII_LENGTH,
  STABLE_ID_PATTERN_SOURCE,
} from "../src/domain";
import {
  CHART_ERROR_CODES,
  CHART_WARNING_CODES,
  SYMBOL_ERROR_CODES,
  parseChartText,
} from "../src/theory";
import { validateDocumentSemantics } from "../src/application";

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
  productionImplementationClaim: true;
  u1UiCompletionClaim: false;
  humanAcceptanceClaim: true;
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
    "47098e85e4090dbf668535babb2633a689b2112b59a58059744ff75e226f96b6",
  "edit-plan-cases.json":
    "32639e5c132a0bc22fe0a77574df256f44a9eae669e565b0247d09ecf8b7223a",
  "mutation-controls.json":
    "5279bc75145b91f149849047deb535a915013b435f3985dd5a44e1af503e8b9c",
  "provenance-ledger.json":
    "775bafdda2ab6e20ffa954a56578f6c4cc4dcc043c9bd8cd69a9b9153363e5d1",
  "trace-ledger.json":
    "11bfd589ea6ce54cdbea1f8f96b372b9cb70dfdf0d85a003832b79b211e3c692",
});

export const A0_U1_EDIT_PLAN_SPEC_SEMANTIC_DIGEST =
  "fed0a7f818b16c82956c01d23c4d6a7eddb39dbf2827ebd240ebf82341a5d8c8";

const EXPECTED_COUNTS = Object.freeze({
  files: 5,
  commandKinds: 1,
  planKinds: 5,
  lawRows: 17,
  caseGroups: 50,
  literalTransitions: 149,
  applicabilityRows: 5,
  transpositionWitnesses: 5,
  obligationRows: 24,
  mutationControls: 30,
  traces: 6,
  authorities: 6,
});

const EXPECTED_NESTED_REFUSAL_PRECEDENCE = Object.freeze([
  "edit-plan.command-shape-invalid",
  "edit-plan.plan-shape-invalid",
  "edit-plan.quick-entry-snapshot-mismatch",
  "edit-plan.source-code-points-exceeded",
  "edit-plan.source-unicode-invalid",
  "edit-plan.source-utf8-bytes-exceeded",
  "edit-plan.target-missing",
  "edit-plan.destination-invalid",
  "edit-plan.event-order-invalid",
  "edit-plan.section-split-boundary-invalid",
  "edit-plan.measure-split-boundary-invalid",
  "edit-plan.section-order-invalid",
  "edit-plan.recovered-chord-placement-invalid",
  "edit-plan.syntax-refused",
  "edit-plan.recovered-chord-requires-parse-failure",
  "edit-plan.recovered-chord-ordinal-missing",
  "edit-plan.warning-acknowledgements-mismatch",
  "edit-plan.fragment-placement-mismatch",
  "edit-plan.completion-declarations-mismatch",
  "edit-plan.section-metadata-mismatch",
  "edit-plan.recovered-chord-layout-loss-unacknowledged",
  "edit-plan.recovered-chord-duration-mismatch",
  "edit-plan.duration-invalid",
  "edit-plan.duration-sum-mismatch",
  "edit-plan.measure-partition-mismatch",
  "edit-plan.event-content-mismatch",
  "edit-plan.right-annotation-not-empty",
  "edit-plan.collection-limit-exceeded",
  "edit-plan.timeline-limit-exceeded",
  "edit-plan.id-factory-failed",
  "edit-plan.id-collision",
  "edit-plan.structural-publication-refused",
  "edit-plan.semantic-publication-refused",
  "edit-plan.history-refused",
] as const);

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
      "reachable-refusal-codes-have-runtime-witnesses-and-unreachable-refusal-codes-have-static-dominance-proofs",
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
      "reachable-limits-have-exact-witnesses-unreachable-timeline-and-composite-limits-have-static-dominance-proof",
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
    semanticPredicate:
      "diagnostics-typed-sanitized-ordered-and-stage-correlated",
  }),
  Object.freeze({
    id: "A0U1-OBL-019-CANDIDATE-TRANSFORMS",
    category: "candidate",
    operation: "pipeline",
    semanticPredicate:
      "all-five-candidates-equal-independent-whole-document-transform",
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
    semanticPredicate:
      "recovery-resolved-and-caller-duration-branches-are-exact",
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
  "edit-plan.measure-split-boundary-invalid",
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
  "historyEstimatorEvidence",
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
  "splitMeasure",
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
  "historyEstimatorEvidence",
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

const EXPECTED_PARSER_FAILURE_INSERTABLE_ROW_KEYS = Object.freeze([
  "globalOrdinal",
  "chord",
  "annotation",
  "duration",
  "range",
] as const);

const EXPECTED_ID_FACTORY_EVIDENCE_KEYS = Object.freeze([
  "configuration",
  "callsObserved",
] as const);

const EXPECTED_HISTORY_ESTIMATOR_EVIDENCE_KEYS = Object.freeze([
  "configuration",
  "callsObserved",
  "returned",
  "independentlyRecomputed",
] as const);

const EXPECTED_HISTORY_ESTIMATOR_CONFIGURATIONS = Object.freeze([
  "not-reached",
  "independent-policy",
  "hostile-over-cap",
  "hostile-invalid-negative",
] as const);

const EXPECTED_ID_FACTORY_CONFIGURATIONS = Object.freeze([
  "not-provided",
  "scripted-reviewed-sequence",
  "hostile-refuse-on-any-call",
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
  "insertLane",
  "placementKind",
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
  "effects",
  "work",
] as const);

const EXPECTED_BOOKMARK_RECEIPT_CORE_KEYS = Object.freeze([
  "operationPolicy",
  "selectionPolicy",
  "selectionReplacements",
  "insertionPolicy",
  "insertionRewrite",
  "insertionCleared",
  "rangePolicy",
  "rangeBoundaryRewrites",
  "rangeCleared",
  "focusPolicy",
  "focusTarget",
] as const);

const EXPECTED_JOIN_SECTIONS_BOOKMARK_RECEIPT_EXTENSION_KEYS = Object.freeze([
  "rightSectionWasEmpty",
  "rightSectionFirstMeasureId",
  "rightSectionStartRewrite",
] as const);

const EXPECTED_CREATED_INSERTION_RECEIPT_EXTENSION_KEYS = Object.freeze([
  "insertionCreated",
] as const);

/**
 * R1 creation branch: `insertionCreated` is frozen immediately after
 * `insertionRewrite` and only on an insert receipt whose before insertion
 * bookmark was null.
 */
const EXPECTED_CREATED_INSERTION_BOOKMARK_RECEIPT_KEYS = Object.freeze(
  EXPECTED_BOOKMARK_RECEIPT_CORE_KEYS.flatMap((key) =>
    key === "insertionCleared"
      ? [...EXPECTED_CREATED_INSERTION_RECEIPT_EXTENSION_KEYS, key]
      : [key],
  ),
);

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

const EXPECTED_MUTATION_CATEGORIES = Object.freeze([
  "envelope-document",
  "envelope-revision",
  "envelope-extra-key",
  "plan-extra-key",
  "command-id",
  "logical-time",
  "coalescing-closed",
  "candidate-backdoor",
  "nested-plans-backdoor",
  "work-counter-warning",
  "recovery-ordinal",
  "recovery-layout-token",
  "recovery-caller-duration",
  "recovery-sibling-backdoor",
  "quick-entry-text",
  "quick-entry-target",
  "split-annotation",
  "split-positive-duration",
  "split-exact-sum",
  "split-completion",
  "join-annotation-policy",
  "join-content",
  "join-right-annotation",
  "join-exact-sum",
  "split-section-boundary",
  "split-section-metadata",
  "split-section-measure-policy",
  "join-section-metadata-policy",
  "join-section-snapshot",
  "join-section-result-metadata",
] as const);

const EXPECTED_MUTATION_REFUSALS: Readonly<
  Record<
    (typeof EXPECTED_MUTATION_CATEGORIES)[number],
    Readonly<{ outer: string; nested: string | null }>
  >
> = Object.freeze({
  "envelope-document": Object.freeze({
    outer: "command.wrong_document",
    nested: null,
  }),
  "envelope-revision": Object.freeze({
    outer: "command.stale_revision",
    nested: null,
  }),
  "envelope-extra-key": Object.freeze({
    outer: "command.payload_invalid",
    nested: "edit-plan.command-shape-invalid",
  }),
  "plan-extra-key": Object.freeze({
    outer: "command.payload_invalid",
    nested: "edit-plan.plan-shape-invalid",
  }),
  "command-id": Object.freeze({
    outer: "command.id_invalid",
    nested: null,
  }),
  "logical-time": Object.freeze({
    outer: "command.logical_time_invalid",
    nested: null,
  }),
  "coalescing-closed": Object.freeze({
    outer: "command.payload_invalid",
    nested: "edit-plan.command-shape-invalid",
  }),
  "candidate-backdoor": Object.freeze({
    outer: "command.payload_invalid",
    nested: "edit-plan.plan-shape-invalid",
  }),
  "nested-plans-backdoor": Object.freeze({
    outer: "command.payload_invalid",
    nested: "edit-plan.plan-shape-invalid",
  }),
  "work-counter-warning": Object.freeze({
    outer: "command.payload_invalid",
    nested: "edit-plan.warning-acknowledgements-mismatch",
  }),
  "recovery-ordinal": Object.freeze({
    outer: "command.payload_invalid",
    nested: "edit-plan.recovered-chord-ordinal-missing",
  }),
  "recovery-layout-token": Object.freeze({
    outer: "command.payload_invalid",
    nested: "edit-plan.recovered-chord-layout-loss-unacknowledged",
  }),
  "recovery-caller-duration": Object.freeze({
    outer: "command.payload_invalid",
    nested: "edit-plan.recovered-chord-duration-mismatch",
  }),
  "recovery-sibling-backdoor": Object.freeze({
    outer: "command.payload_invalid",
    nested: "edit-plan.plan-shape-invalid",
  }),
  "quick-entry-text": Object.freeze({
    outer: "command.payload_invalid",
    nested: "edit-plan.quick-entry-snapshot-mismatch",
  }),
  "quick-entry-target": Object.freeze({
    outer: "command.payload_invalid",
    nested: "edit-plan.quick-entry-snapshot-mismatch",
  }),
  "split-annotation": Object.freeze({
    outer: "command.payload_invalid",
    nested: "edit-plan.plan-shape-invalid",
  }),
  "split-positive-duration": Object.freeze({
    outer: "command.payload_invalid",
    nested: "edit-plan.duration-invalid",
  }),
  "split-exact-sum": Object.freeze({
    outer: "command.payload_invalid",
    nested: "edit-plan.duration-sum-mismatch",
  }),
  "split-completion": Object.freeze({
    outer: "command.payload_invalid",
    nested: "edit-plan.completion-declarations-mismatch",
  }),
  "join-annotation-policy": Object.freeze({
    outer: "command.payload_invalid",
    nested: "edit-plan.plan-shape-invalid",
  }),
  "join-content": Object.freeze({
    outer: "command.payload_invalid",
    nested: "edit-plan.event-content-mismatch",
  }),
  "join-right-annotation": Object.freeze({
    outer: "command.payload_invalid",
    nested: "edit-plan.right-annotation-not-empty",
  }),
  "join-exact-sum": Object.freeze({
    outer: "command.payload_invalid",
    nested: "edit-plan.duration-sum-mismatch",
  }),
  "split-section-boundary": Object.freeze({
    outer: "command.destination_invalid",
    nested: "edit-plan.section-split-boundary-invalid",
  }),
  "split-section-metadata": Object.freeze({
    outer: "command.payload_invalid",
    nested: "edit-plan.plan-shape-invalid",
  }),
  "split-section-measure-policy": Object.freeze({
    outer: "command.payload_invalid",
    nested: "edit-plan.plan-shape-invalid",
  }),
  "join-section-metadata-policy": Object.freeze({
    outer: "command.payload_invalid",
    nested: "edit-plan.plan-shape-invalid",
  }),
  "join-section-snapshot": Object.freeze({
    outer: "command.payload_invalid",
    nested: "edit-plan.section-metadata-mismatch",
  }),
  "join-section-result-metadata": Object.freeze({
    outer: "command.payload_invalid",
    nested: "edit-plan.plan-shape-invalid",
  }),
});

const EXPECTED_MUTATION_TARGETS: Readonly<
  Record<
    (typeof EXPECTED_MUTATION_CATEGORIES)[number],
    Readonly<{
      operation: "pipeline" | (typeof A0_U1_ATOMIC_EDIT_PLAN_KINDS)[number];
      materialization: "command" | "beforeState";
      jsonPointer: string;
    }>
  >
> = Object.freeze({
  "envelope-document": {
    operation: "pipeline",
    materialization: "command",
    jsonPointer: "/expectedDocumentId",
  },
  "envelope-revision": {
    operation: "pipeline",
    materialization: "command",
    jsonPointer: "/expectedRevision",
  },
  "envelope-extra-key": {
    operation: "pipeline",
    materialization: "command",
    jsonPointer: "/extra",
  },
  "plan-extra-key": {
    operation: "pipeline",
    materialization: "command",
    jsonPointer: "/plan/extra",
  },
  "command-id": {
    operation: "pipeline",
    materialization: "command",
    jsonPointer: "/id",
  },
  "logical-time": {
    operation: "pipeline",
    materialization: "command",
    jsonPointer: "/logicalTimeMs",
  },
  "coalescing-closed": {
    operation: "pipeline",
    materialization: "command",
    jsonPointer: "/coalescing",
  },
  "candidate-backdoor": {
    operation: "pipeline",
    materialization: "command",
    jsonPointer: "/plan/candidate",
  },
  "nested-plans-backdoor": {
    operation: "pipeline",
    materialization: "command",
    jsonPointer: "/plan/plans",
  },
  "work-counter-warning": {
    operation: "pipeline",
    materialization: "command",
    jsonPointer: "/plan/source/warningAcknowledgements",
  },
  "recovery-ordinal": {
    operation: "insert-fragment",
    materialization: "command",
    jsonPointer: "/plan/source/selectedGlobalOrdinal",
  },
  "recovery-layout-token": {
    operation: "insert-fragment",
    materialization: "command",
    jsonPointer: "/plan/source/layoutLossAcknowledgement",
  },
  "recovery-caller-duration": {
    operation: "insert-fragment",
    materialization: "command",
    jsonPointer: "/plan/source/callerDuration",
  },
  "recovery-sibling-backdoor": {
    operation: "insert-fragment",
    materialization: "command",
    jsonPointer: "/plan/source/selectedSiblingOrdinals",
  },
  "quick-entry-text": {
    operation: "insert-fragment",
    materialization: "beforeState",
    jsonPointer: "/quickEntry/text",
  },
  "quick-entry-target": {
    operation: "insert-fragment",
    materialization: "beforeState",
    jsonPointer: "/quickEntry/target/measureId",
  },
  "split-annotation": {
    operation: "split-event-duration",
    materialization: "command",
    jsonPointer: "/plan/annotationPolicy",
  },
  "split-positive-duration": {
    operation: "split-event-duration",
    materialization: "command",
    jsonPointer: "/plan/firstDuration/numerator",
  },
  "split-exact-sum": {
    operation: "split-event-duration",
    materialization: "command",
    jsonPointer: "/plan/secondDuration/numerator",
  },
  "split-completion": {
    operation: "split-event-duration",
    materialization: "command",
    jsonPointer: "/plan/completionDeclarations/0/measureId",
  },
  "join-annotation-policy": {
    operation: "join-event-durations",
    materialization: "command",
    jsonPointer: "/plan/annotationPolicy",
  },
  "join-content": {
    operation: "join-event-durations",
    materialization: "beforeState",
    jsonPointer:
      "/document/sections/0/measures/0/events/1/voicing/range/highMidi",
  },
  "join-right-annotation": {
    operation: "join-event-durations",
    materialization: "beforeState",
    jsonPointer: "/document/sections/0/measures/0/events/1/annotation",
  },
  "join-exact-sum": {
    operation: "join-event-durations",
    materialization: "command",
    jsonPointer: "/plan/joinedDuration/numerator",
  },
  "split-section-boundary": {
    operation: "split-section",
    materialization: "command",
    jsonPointer: "/plan/beforeMeasureId",
  },
  "split-section-metadata": {
    operation: "split-section",
    materialization: "command",
    jsonPointer: "/plan/newSectionMetadata/name",
  },
  "split-section-measure-policy": {
    operation: "split-section",
    materialization: "command",
    jsonPointer: "/plan/measurePolicy",
  },
  "join-section-metadata-policy": {
    operation: "join-sections",
    materialization: "command",
    jsonPointer: "/plan/metadataPolicy",
  },
  "join-section-snapshot": {
    operation: "join-sections",
    materialization: "command",
    jsonPointer: "/plan/expectedRightMetadata/name",
  },
  "join-section-result-metadata": {
    operation: "join-sections",
    materialization: "command",
    jsonPointer: "/plan/resultMetadata/name",
  },
});

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

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
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
  if (!isObject(value)) return Number.NaN;
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
  return independentHistoryValueBytes(withoutEstimate, new WeakSet());
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
    if (isUnknownArray(cursor)) {
      const index = canonicalArrayIndex(token, cursor.length, false);
      if (index === null) throw new Error("patch array parent is noncanonical");
      cursor = cursor[index];
    } else if (isObject(cursor)) cursor = cursor[token];
    else throw new Error("patch parent missing");
  }
  const finalToken = tokens[tokens.length - 1] as string;
  const arrayIndex = isUnknownArray(cursor)
    ? canonicalArrayIndex(finalToken, cursor.length, operation === "add")
    : null;
  if (isUnknownArray(cursor) && arrayIndex === null) {
    throw new Error("patch array index is noncanonical or out of range");
  }
  const current =
    isUnknownArray(cursor) && arrayIndex !== null
      ? cursor[arrayIndex]
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
  if (isUnknownArray(cursor) && arrayIndex !== null) {
    const itemIndex = arrayIndex;
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
    if (!target.has(id)) {
      addFinding(
        findings,
        code,
        `${path}.${id}`,
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
      typeof row["allocatedId"] !== "string"
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
    if (
      !canonicalPlacementTargetMatches(beforeDocument, plan) ||
      !completeDraftIntoMeasureContractHolds(beforeDocument, plan)
    ) {
      return null;
    }
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
      if (
        event === null ||
        target === null ||
        !Array.isArray(target["events"])
      ) {
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
      if (!completeDraftStructureMatchesPlacement(parserEvidence, placement)) {
        return null;
      }
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
          !jsonDeepEqual(parserEvidence.measureRows[0]?.["completion"], {
            kind: "complete",
          })
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
        const targetMeasures =
          mutableSections(document)[targetLocation.index]?.["measures"];
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
    if (left === null || right === null || right.index !== left.index + 1) {
      return null;
    }
    const sections = mutableSections(document);
    const leftSection = sections[left.index];
    const rightSection = sections[right.index];
    if (leftSection === undefined || rightSection === undefined) {
      return null;
    }
    const leftMeasures = leftSection["measures"];
    const rightMeasures = rightSection["measures"];
    if (!isUnknownArray(leftMeasures) || !isUnknownArray(rightMeasures)) {
      return null;
    }
    for (const [key, value] of Object.entries(
      isObject(plan["resultMetadata"]) ? plan["resultMetadata"] : {},
    )) {
      leftSection[key] = cloneJson(value);
    }
    leftMeasures.push(...rightMeasures);
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

function deduplicateInDocumentOrder(
  ids: readonly unknown[],
  document: unknown,
): string[] {
  const requested = new Set(
    ids.filter((id): id is string => typeof id === "string"),
  );
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
  let insertionCreated: JsonObject | null = null;
  let insertionCleared = false;
  const rangeBoundaryRewrites: JsonObject[] = [];
  let rangeCleared = false;
  let selectionPolicy:
    "preserve-existing" | "replace-removed-right-with-left-and-deduplicate" =
    "preserve-existing";
  let insertionPolicy:
    | "preserve-existing"
    | "move-after-last-inserted"
    | "create-after-last-inserted"
    | "rewrite-exact-span-end"
    | "rewrite-representable-boundaries"
    | "clear-unrepresentable-internal-event-boundary" = "preserve-existing";
  let rangePolicy:
    | "preserve-existing"
    | "rewrite-representable-boundaries"
    | "clear-unrepresentable-internal-event-boundary" = "preserve-existing";
  let focusPolicy:
    | "selection-focus-event"
    | "non-chart-insertion-target"
    | "first-inserted-structural-ref"
    | "chart" = "chart";
  let focusTarget: JsonObject = { kind: "chart" };
  let operationPolicy = "";
  let joinSectionsExtension: JsonObject | null = null;
  let mapBoundary = (boundary: JsonObject): JsonObject | null =>
    cloneJson(boundary);

  if (plan["kind"] === "insert-fragment") {
    operationPolicy = A0_U1_ATOMIC_EDIT_PLAN_BOOKMARK_POLICIES.insertFragment;
    insertionPolicy = "move-after-last-inserted";
    let target: JsonObject | null = null;
    if (isObject(plan["placement"])) {
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
        if (!jsonDeepEqual(beforeBookmarks["insertion"], target)) {
          insertionRewrite = {
            from: cloneJson(beforeBookmarks["insertion"]),
            to: cloneJson(target),
          };
        }
      } else {
        /*
         * R1: a valid null before insertion bookmark takes the honest
         * creation branch; the QuickEntry target proves placement but is
         * never reported as a bookmark that did not exist.
         */
        insertionPolicy = "create-after-last-inserted";
        insertionCreated = cloneJson(target);
      }
      expectedBookmarks["insertion"] = cloneJson(target);
    } else {
      addFinding(
        findings,
        "EDIT_PLAN_INSERTION_BOOKMARK_TARGET",
        `${path}.result.editPlanReceipt.bookmarks.insertionRewrite`,
        "Fragment insertion must expose the last inserted event, measure, or section as its insertion boundary.",
      );
    }
  } else if (plan["kind"] === "split-event-duration") {
    operationPolicy =
      A0_U1_ATOMIC_EDIT_PLAN_BOOKMARK_POLICIES.splitEventDuration;
    const fresh = candidate.allocatedIdentities.find(
      (row) => row["kind"] === "event",
    );
    if (fresh !== undefined) {
      const from = { kind: "after-event", eventId: plan["eventId"] };
      const to = { kind: "after-event", eventId: fresh["id"] };
      mapBoundary = (boundary): JsonObject =>
        jsonDeepEqual(boundary, from) ? cloneJson(to) : cloneJson(boundary);
    }
  } else if (plan["kind"] === "join-event-durations") {
    operationPolicy =
      A0_U1_ATOMIC_EDIT_PLAN_BOOKMARK_POLICIES.joinEventDurations;
    const selection = isObject(expectedBookmarks["selection"])
      ? expectedBookmarks["selection"]
      : {};
    if (
      selection["kind"] === "events" &&
      Array.isArray(selection["eventIds"])
    ) {
      if (selection["eventIds"].includes(plan["rightEventId"])) {
        selectionPolicy = "replace-removed-right-with-left-and-deduplicate";
        selectionReplacements.push({
          fromEventId: plan["rightEventId"],
          toEventId: plan["leftEventId"],
        });
      }
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
              anchorEventId: replace(selection["anchorEventId"]) ?? eventIds[0],
              focusEventId:
                replace(selection["focusEventId"]) ?? eventIds.at(-1),
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
    const internalBeforeRight = {
      kind: "before-event",
      eventId: plan["rightEventId"],
    };
    const internalAfterLeft = {
      kind: "after-event",
      eventId: plan["leftEventId"],
    };
    mapBoundary = (boundary): JsonObject | null => {
      if (
        jsonDeepEqual(boundary, internalBeforeRight) ||
        jsonDeepEqual(boundary, internalAfterLeft)
      ) {
        return null;
      }
      return jsonDeepEqual(boundary, rightEnd)
        ? cloneJson(joinedEnd)
        : cloneJson(boundary);
    };
  } else if (plan["kind"] === "split-section") {
    operationPolicy = A0_U1_ATOMIC_EDIT_PLAN_BOOKMARK_POLICIES.splitSection;
    const suffix = candidate.allocatedIdentities.find(
      (row) => row["kind"] === "section",
    );
    if (suffix !== undefined) {
      mapBoundary = (boundary): JsonObject => {
        if (
          jsonDeepEqual(boundary, {
            kind: "after-section",
            sectionId: plan["sectionId"],
          })
        ) {
          return { kind: "after-section", sectionId: suffix["id"] };
        }
        if (
          jsonDeepEqual(boundary, {
            kind: "section-end",
            sectionId: plan["sectionId"],
          })
        ) {
          return { kind: "section-end", sectionId: suffix["id"] };
        }
        return cloneJson(boundary);
      };
    }
  } else if (plan["kind"] === "join-sections") {
    operationPolicy = A0_U1_ATOMIC_EDIT_PLAN_BOOKMARK_POLICIES.joinSections;
    const beforeRight = findSectionLocation(
      before["document"],
      plan["rightSectionId"],
    );
    const firstRightMeasure =
      beforeRight === null
        ? null
        : (sectionMeasures(beforeRight.section)[0] ?? null);
    const rightStart = {
      kind: "section-start",
      sectionId: plan["rightSectionId"],
    };
    const mappedRightStart =
      firstRightMeasure === null
        ? { kind: "section-end", sectionId: plan["leftSectionId"] }
        : { kind: "before-measure", measureId: firstRightMeasure["id"] };
    joinSectionsExtension = {
      rightSectionWasEmpty: firstRightMeasure === null,
      rightSectionFirstMeasureId:
        firstRightMeasure === null ? null : firstRightMeasure["id"],
      rightSectionStartRewrite: {
        from: cloneJson(rightStart),
        to: cloneJson(mappedRightStart),
      },
    };
    mapBoundary = (boundary): JsonObject => {
      const kind = boundary["kind"];
      const sectionId = boundary["sectionId"];
      if (
        sectionId === plan["leftSectionId"] &&
        (kind === "after-section" || kind === "section-end")
      ) {
        return firstRightMeasure === null
          ? cloneJson(boundary)
          : {
              kind: "before-measure",
              measureId: firstRightMeasure["id"],
            };
      }
      if (
        sectionId === plan["rightSectionId"] &&
        (kind === "before-section" || kind === "section-start")
      ) {
        return cloneJson(mappedRightStart);
      }
      if (sectionId === plan["rightSectionId"] && kind === "after-section") {
        return {
          kind: "after-section",
          sectionId: plan["leftSectionId"],
        };
      }
      if (sectionId === plan["rightSectionId"] && kind === "section-end") {
        return {
          kind: "section-end",
          sectionId: plan["leftSectionId"],
        };
      }
      return cloneJson(boundary);
    };
  } else {
    addFinding(
      findings,
      "EDIT_PLAN_BOOKMARK_OPERATION",
      `${path}.command.plan.kind`,
      "Bookmark oracle requires one of the five closed edit-plan operations.",
    );
  }

  if (plan["kind"] !== "insert-fragment") {
    const beforeInsertion = beforeBookmarks["insertion"];
    if (isObject(beforeInsertion)) {
      const mappedInsertion = mapBoundary(beforeInsertion);
      if (mappedInsertion === null) {
        expectedBookmarks["insertion"] = null;
        insertionCleared = true;
        insertionPolicy = "clear-unrepresentable-internal-event-boundary";
      } else if (!jsonDeepEqual(beforeInsertion, mappedInsertion)) {
        expectedBookmarks["insertion"] = cloneJson(mappedInsertion);
        insertionRewrite = {
          from: cloneJson(beforeInsertion),
          to: cloneJson(mappedInsertion),
        };
        insertionPolicy =
          plan["kind"] === "split-event-duration"
            ? "rewrite-exact-span-end"
            : "rewrite-representable-boundaries";
        if (
          plan["kind"] === "join-event-durations" &&
          beforeInsertion["kind"] === "after-event" &&
          beforeInsertion["eventId"] === plan["rightEventId"]
        ) {
          insertionPolicy = "rewrite-exact-span-end";
        }
      }
    }
    const beforeRange = beforeBookmarks["range"];
    if (isObject(beforeRange)) {
      const anchor = isObject(beforeRange["anchor"])
        ? mapBoundary(beforeRange["anchor"])
        : null;
      const focus = isObject(beforeRange["focus"])
        ? mapBoundary(beforeRange["focus"])
        : null;
      if (anchor === null || focus === null) {
        expectedBookmarks["range"] = null;
        rangeCleared = true;
        rangePolicy = "clear-unrepresentable-internal-event-boundary";
      } else {
        for (const [endpoint, mapped] of [
          ["anchor", anchor],
          ["focus", focus],
        ] as const) {
          const from = beforeRange[endpoint];
          if (isObject(from) && !jsonDeepEqual(from, mapped)) {
            rangeBoundaryRewrites.push({
              from: cloneJson(from),
              to: cloneJson(mapped),
            });
          }
        }
        expectedBookmarks["range"] = {
          anchor: cloneJson(anchor),
          focus: cloneJson(focus),
        };
        if (rangeBoundaryRewrites.length > 0) {
          rangePolicy = "rewrite-representable-boundaries";
        }
      }
    }
  }

  const afterSelection = isObject(expectedBookmarks["selection"])
    ? expectedBookmarks["selection"]
    : {};
  if (
    afterSelection["kind"] === "events" &&
    typeof afterSelection["focusEventId"] === "string" &&
    findEventLocation(after["document"], afterSelection["focusEventId"]) !==
      null
  ) {
    focusPolicy = "selection-focus-event";
    focusTarget = {
      kind: "event",
      eventId: afterSelection["focusEventId"],
    };
  } else {
    const insertionFocus = boundaryToFocusTarget(
      expectedBookmarks["insertion"],
    );
    if (insertionFocus !== null && insertionFocus["kind"] !== "chart") {
      focusPolicy = "non-chart-insertion-target";
      focusTarget = insertionFocus;
    } else {
      const firstInserted = candidate.allocatedIdentities[0];
      if (firstInserted !== undefined) {
        focusPolicy = "first-inserted-structural-ref";
        focusTarget =
          firstInserted["kind"] === "event"
            ? { kind: "event", eventId: firstInserted["id"] }
            : firstInserted["kind"] === "measure"
              ? { kind: "measure", measureId: firstInserted["id"] }
              : { kind: "section", sectionId: firstInserted["id"] };
      }
    }
  }

  const focusBranchesByOperation: Readonly<Record<string, readonly string[]>> =
    {
      "insert-fragment": [
        "selection-focus-event",
        "non-chart-insertion-target",
      ],
      "split-event-duration": [
        "selection-focus-event",
        "non-chart-insertion-target",
        "first-inserted-structural-ref",
      ],
      "join-event-durations": [
        "selection-focus-event",
        "non-chart-insertion-target",
        "chart",
      ],
      "split-section": [
        "selection-focus-event",
        "non-chart-insertion-target",
        "first-inserted-structural-ref",
      ],
      "join-sections": [
        "selection-focus-event",
        "non-chart-insertion-target",
        "chart",
      ],
    };
  if (
    !(focusBranchesByOperation[String(plan["kind"])] ?? []).includes(
      focusPolicy,
    )
  ) {
    addFinding(
      findings,
      "EDIT_PLAN_FOCUS_OPERATION_BRANCH",
      `${path}.result.editPlanReceipt.bookmarks.focusPolicy`,
      "The derived focus branch is impossible for this operation's allocation and bookmark behavior.",
    );
  }

  const expectedBookmarkReceipt: JsonObject = {
    operationPolicy,
    selectionPolicy,
    selectionReplacements,
    insertionPolicy,
    insertionRewrite,
    ...(insertionCreated === null ? {} : { insertionCreated }),
    insertionCleared,
    rangePolicy,
    rangeBoundaryRewrites,
    rangeCleared,
    focusPolicy,
    focusTarget,
    ...(joinSectionsExtension ?? {}),
  };
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
    expectedBookmarkReceipt,
    "EDIT_PLAN_BOOKMARK_RECEIPT_ORACLE",
    `${path}.result.editPlanReceipt.bookmarks`,
    "Bookmark receipt must contain every and only the independently computed selection/boundary rewrite.",
    findings,
  );
  requireExact(
    after["focusRequest"],
    {
      sequence: before["nextSequence"],
      target: focusTarget,
      reason: "command",
    },
    "EDIT_PLAN_FOCUS_ORACLE",
    `${path}.afterState.focusRequest`,
    "Focus publication must equal the deterministic after-bookmark priority and the receipt's exact target.",
    findings,
  );
  const receiptWork = isObject(receipt["work"]) ? receipt["work"] : {};
  const selectionReplacementCount =
    plan["kind"] === "join-event-durations" ? selectionReplacements.length : 0;
  const expectedRewrittenCount =
    selectionReplacementCount +
    (insertionRewrite !== null || insertionCreated !== null || insertionCleared
      ? 1
      : 0) +
    (rangeCleared ? 1 : rangeBoundaryRewrites.length);
  requireExact(
    receiptWork["bookmarkRecordsRewritten"],
    expectedRewrittenCount,
    "EDIT_PLAN_BOOKMARK_REWRITE_WORK",
    `${path}.result.editPlanReceipt.work.bookmarkRecordsRewritten`,
    "Bookmark rewrite work must count replacements, insertion change/clear, endpoint rewrites, or one whole-range clear exactly.",
    findings,
  );
  const beforeSelection = isObject(beforeBookmarks["selection"])
    ? beforeBookmarks["selection"]
    : {};
  const expectedExaminedCount =
    1 +
    (beforeSelection["kind"] === "events" &&
    Array.isArray(beforeSelection["eventIds"])
      ? beforeSelection["eventIds"].length
      : 0) +
    (beforeBookmarks["insertion"] === null ? 0 : 1) +
    (beforeBookmarks["range"] === null ? 0 : 2);
  requireExact(
    receiptWork["bookmarkRecordsExamined"],
    expectedExaminedCount,
    "EDIT_PLAN_BOOKMARK_EXAMINED_WORK",
    `${path}.result.editPlanReceipt.work.bookmarkRecordsExamined`,
    "Bookmark examination work must count the selection record, selected IDs, non-null insertion, and non-null range endpoints exactly.",
    findings,
  );
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
    const beforeIdentity = identityRecords(beforeDocument);
    const beforeSectionIds = new Set(beforeIdentity.sections);
    const beforeMeasureIds = new Set(beforeIdentity.measures);
    const beforeEventIds = new Set(beforeIdentity.events);
    const newSections = documentSections(afterDocument).filter(
      (section) => !beforeSectionIds.has(String(section["id"])),
    );
    const newMeasures = documentSections(afterDocument).flatMap((section) =>
      sectionMeasures(section).filter(
        (measure) => !beforeMeasureIds.has(String(measure["id"])),
      ),
    );
    const newEvents = documentSections(afterDocument).flatMap((section) =>
      sectionMeasures(section).flatMap((measure) =>
        measureEvents(measure).filter(
          (event) => !beforeEventIds.has(String(event["id"])),
        ),
      ),
    );
    const placement = isObject(plan["placement"]) ? plan["placement"] : {};
    const structuralDeltaHolds =
      placement["kind"] === "into-measure"
        ? newSections.length === 0 &&
          newMeasures.length === 0 &&
          newEvents.length > 0
        : placement["kind"] === "into-section"
          ? newSections.length === 0 && newMeasures.length > 0
          : placement["kind"] === "into-document"
            ? newSections.length > 0 && newMeasures.length > 0
            : false;
    requireOperationLaw(
      structuralDeltaHolds,
      "EDIT_PLAN_INSERTED_STRUCTURE_MISSING",
      path,
      "A committed fragment insertion must add structure required by its placement; section/document insertion may lawfully add empty closed measures with zero events.",
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
    const beforeUndo = recordsAt(beforeHistory["undo"]);
    const afterUndo = recordsAt(afterHistory["undo"]);
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
    const allAfterEntries = [...afterUndo, ...recordsAt(afterHistory["redo"])];
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
  if (!Array.isArray(left) || !Array.isArray(right)) {
    return codeUnitCompare(stableJson(left), stableJson(right));
  }
  const sharedLength = Math.min(left.length, right.length);
  for (let index = 0; index < sharedLength; index += 1) {
    const leftSegment: unknown = left[index];
    const rightSegment: unknown = right[index];
    if (leftSegment === rightSegment) continue;
    if (typeof leftSegment === "number") {
      if (typeof rightSegment === "number") {
        return leftSegment < rightSegment ? -1 : 1;
      }
      return -1;
    }
    if (typeof rightSegment === "number") return 1;
    if (typeof leftSegment === "string" && typeof rightSegment === "string") {
      return codeUnitCompare(leftSegment, rightSegment);
    }
    return codeUnitCompare(stableJson(leftSegment), stableJson(rightSegment));
  }
  return left.length < right.length ? -1 : left.length > right.length ? 1 : 0;
}

function compareDiagnostics(left: JsonObject, right: JsonObject): number {
  const pathOrder = compareDomainPaths(left["path"], right["path"]);
  if (pathOrder !== 0) return pathOrder;
  const leftRange = isObject(left["sourceRange"]) ? left["sourceRange"] : null;
  const rightRange = isObject(right["sourceRange"])
    ? right["sourceRange"]
    : null;
  if (leftRange === null && rightRange !== null) return -1;
  if (leftRange !== null && rightRange === null) return 1;
  if (leftRange !== null && rightRange !== null) {
    const startOrder = Number(leftRange["start"]) - Number(rightRange["start"]);
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
  const diatonicWithinOctave = DIATONIC_STEPS_BY_ASCENDING_SEMITONES[remainder];
  if (diatonicWithinOctave === undefined) return null;
  return direction * (octaves * PITCH_STEPS.length + diatonicWithinOctave);
}

function transposeSpelledPitchObject(
  pitch: JsonObject,
  intervalSemitones: number,
): JsonObject | null {
  const stepIndex = PITCH_STEPS.indexOf(String(pitch["step"]));
  const alter = pitch["alter"];
  const diatonicSteps = independentDiatonicSteps(intervalSemitones);
  if (stepIndex < 0 || !Number.isSafeInteger(alter) || diatonicSteps === null) {
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
  const desiredPitchClass = modulo(sourcePitchClass + intervalSemitones, 12);
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
  const pattern = /(?<![A-Za-z])([A-G])(bb|##|b|#)?/gu;
  let transformed = "";
  let sourceOffset = 0;
  for (const match of sourceText.matchAll(pattern)) {
    const matchOffset = match.index;
    const step = match[1];
    const accidental = match[2];
    if (step === undefined) return null;
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
    if (pitch === null || typeof pitch["step"] !== "string") return null;
    const renderedAccidental = accidentalText(Number(pitch["alter"]));
    if (renderedAccidental === null) return null;
    transformed +=
      sourceText.slice(sourceOffset, matchOffset) +
      pitch["step"] +
      renderedAccidental;
    sourceOffset = matchOffset + match[0].length;
  }
  return transformed + sourceText.slice(sourceOffset);
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
        return [key, transposeChordSourceText(child, intervalSemitones)];
      }
      return [
        key,
        independentlyTransposePitchData(child, intervalSemitones, key),
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

type RefusalOracle = Readonly<{
  code: (typeof EXPECTED_NESTED_REFUSAL_PRECEDENCE)[number];
  path: readonly (string | number)[];
}>;

const PASSIVE_CAPTURE_REJECTION = Symbol("passive-capture-rejection");
const PASSIVE_ARRAY_INVALID_OWN_SHAPE = Symbol(
  "passive-array-invalid-own-shape",
);
const MAX_PASSIVE_CAPTURE_ARRAY_LENGTH = 100_000;

type PassiveCaptureResult =
  | Readonly<{ ok: true; value: unknown }>
  | Readonly<{
      ok: false;
      path: readonly (string | number)[];
    }>;

function arrayIndexFromOwnKey(key: PropertyKey): number | null {
  if (typeof key !== "string" || key.length === 0) return null;
  const index = Number(key);
  return Number.isInteger(index) &&
    index >= 0 &&
    index < 4_294_967_295 &&
    String(index) === key
    ? index
    : null;
}

function capturePassiveData(
  value: unknown,
  path: readonly (string | number)[],
  active: WeakSet<object> = new WeakSet(),
): PassiveCaptureResult {
  if (
    (typeof value !== "object" && typeof value !== "function") ||
    value === null
  ) {
    return { ok: true, value };
  }
  const source = value;
  if (active.has(source)) {
    return { ok: true, value: PASSIVE_CAPTURE_REJECTION };
  }
  let descriptors: PropertyDescriptorMap;
  try {
    descriptors = Object.getOwnPropertyDescriptors(source);
  } catch {
    return { ok: false, path };
  }
  active.add(source);
  try {
    if (Array.isArray(source)) {
      const lengthDescriptor = Reflect.get(descriptors, "length") as
        PropertyDescriptor | undefined;
      const length =
        lengthDescriptor !== undefined &&
        Object.hasOwn(lengthDescriptor, "value") &&
        Number.isSafeInteger(lengthDescriptor.value) &&
        Number(lengthDescriptor.value) >= 0 &&
        Number(lengthDescriptor.value) <= MAX_PASSIVE_CAPTURE_ARRAY_LENGTH
          ? Number(lengthDescriptor.value)
          : null;
      if (length === null) {
        return { ok: true, value: PASSIVE_CAPTURE_REJECTION };
      }
      const captured = new Array<unknown>(length);
      let invalidOwnShape = false;
      for (const key of Reflect.ownKeys(descriptors)) {
        if (key === "length") continue;
        const index = arrayIndexFromOwnKey(key);
        if (index === null || index >= length) invalidOwnShape = true;
      }
      for (let index = 0; index < length; index += 1) {
        const descriptor = Reflect.get(descriptors, String(index)) as
          PropertyDescriptor | undefined;
        let child: unknown = PASSIVE_CAPTURE_REJECTION;
        if (
          descriptor !== undefined &&
          Object.hasOwn(descriptor, "value") &&
          descriptor.enumerable === true
        ) {
          const capturedChild = capturePassiveData(
            descriptor.value,
            [...path, index],
            active,
          );
          if (!capturedChild.ok) return capturedChild;
          child = capturedChild.value;
        }
        Object.defineProperty(captured, String(index), {
          value: child,
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
      if (invalidOwnShape) {
        Object.defineProperty(captured, PASSIVE_ARRAY_INVALID_OWN_SHAPE, {
          value: true,
        });
      }
      return { ok: true, value: captured };
    }
    const captured = Object.create(null) as Record<PropertyKey, unknown>;
    for (const key of Reflect.ownKeys(descriptors)) {
      const descriptor = Reflect.get(descriptors, key) as
        PropertyDescriptor | undefined;
      if (descriptor === undefined) {
        return { ok: false, path };
      }
      let child: unknown = PASSIVE_CAPTURE_REJECTION;
      if (Object.hasOwn(descriptor, "value")) {
        const capturedChild = capturePassiveData(
          descriptor.value,
          typeof key === "string" ? [...path, key] : path,
          active,
        );
        if (!capturedChild.ok) return capturedChild;
        child = capturedChild.value;
      }
      Object.defineProperty(captured, key, {
        value: child,
        enumerable: descriptor.enumerable === true,
        writable: true,
        configurable: true,
      });
    }
    return { ok: true, value: captured };
  } finally {
    active.delete(source);
  }
}

function capturedArrayHasInvalidOwnShape(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    Object.getOwnPropertyDescriptor(value, PASSIVE_ARRAY_INVALID_OWN_SHAPE)
      ?.value === true
  );
}

function firstExactKeyFailure(
  value: unknown,
  keys: readonly string[],
  path: readonly (string | number)[],
): readonly (string | number)[] | null {
  if (!isObject(value)) return path;
  let descriptors: PropertyDescriptorMap;
  try {
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    return path;
  }
  const missing = keys.find((key) => !Object.hasOwn(descriptors, key));
  if (missing !== undefined) return [...path, missing];
  const unexpected = Reflect.ownKeys(descriptors).find(
    (key) => typeof key !== "string" || !keys.includes(key),
  );
  if (unexpected !== undefined) return path;
  const invalidDescriptor = keys.find((key) => {
    const descriptor = descriptors[key];
    return (
      descriptor === undefined ||
      !Object.hasOwn(descriptor, "value") ||
      descriptor.enumerable !== true ||
      descriptor.value === PASSIVE_CAPTURE_REJECTION
    );
  });
  return invalidDescriptor === undefined ? null : [...path, invalidDescriptor];
}

function ownEnumerableDataProperty(
  value: unknown,
  key: string,
): Readonly<{ value: unknown }> | null {
  if (!isObject(value)) return null;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined &&
      Object.hasOwn(descriptor, "value") &&
      descriptor.enumerable === true
      ? { value: descriptor.value }
      : null;
  } catch {
    return null;
  }
}

function firstDurationShapeFailure(
  value: unknown,
  path: readonly (string | number)[],
): readonly (string | number)[] | null {
  const keyFailure = firstExactKeyFailure(
    value,
    ["numerator", "denominator"],
    path,
  );
  if (keyFailure !== null) return keyFailure;
  if (!isObject(value)) return path;
  if (!Number.isSafeInteger(value["numerator"])) {
    return [...path, "numerator"];
  }
  if (!Number.isSafeInteger(value["denominator"])) {
    return [...path, "denominator"];
  }
  return null;
}

function firstBoundaryShapeFailure(
  value: unknown,
  path: readonly (string | number)[],
): readonly (string | number)[] | null {
  if (!isObject(value)) return path;
  const kindProperty = ownEnumerableDataProperty(value, "kind");
  if (typeof kindProperty?.value !== "string") return [...path, "kind"];
  const kind = kindProperty.value;
  const idField = [
    "before-section",
    "after-section",
    "section-start",
    "section-end",
  ].includes(kind)
    ? "sectionId"
    : [
          "before-measure",
          "after-measure",
          "measure-start",
          "measure-end",
        ].includes(kind)
      ? "measureId"
      : ["before-event", "after-event"].includes(kind)
        ? "eventId"
        : null;
  const keys =
    kind === "document-start" || kind === "document-end"
      ? ["kind"]
      : idField === null
        ? null
        : ["kind", idField];
  if (keys === null) return [...path, "kind"];
  const keyFailure = firstExactKeyFailure(value, keys, path);
  if (keyFailure !== null) return keyFailure;
  return idField !== null && !isStableId(value[idField])
    ? [...path, idField]
    : null;
}

function firstCompletionShapeFailure(
  declarations: unknown,
  path: readonly (string | number)[],
  expectedRows: 0 | 1,
): readonly (string | number)[] | null {
  if (
    !Array.isArray(declarations) ||
    capturedArrayHasInvalidOwnShape(declarations)
  ) {
    return path;
  }
  /*
   * R1 shape horizon: expected tuple cardinality plus one first-unpaired
   * witness. A longer array refuses at the completion-array path before any
   * row is scanned.
   */
  if (declarations.length > expectedRows + 1) {
    return path;
  }
  for (const [index, declaration] of declarations.entries()) {
    const rowPath = [...path, index] as const;
    const keyFailure = firstExactKeyFailure(
      declaration,
      ["measureId", "completion"],
      rowPath,
    );
    if (keyFailure !== null) return keyFailure;
    if (!isObject(declaration) || !isStableId(declaration["measureId"])) {
      return [...rowPath, "measureId"];
    }
    const completion = declaration["completion"];
    if (!isObject(completion)) return [...rowPath, "completion"];
    const kindProperty = ownEnumerableDataProperty(completion, "kind");
    if (typeof kindProperty?.value !== "string") {
      return [...rowPath, "completion", "kind"];
    }
    const kind = kindProperty.value;
    const completionKeys =
      kind === "empty" || kind === "complete"
        ? ["kind"]
        : kind === "pickup" || kind === "incomplete"
          ? ["kind", "expectedDuration", "reason"]
          : null;
    if (completionKeys === null) return [...rowPath, "completion", "kind"];
    const completionPath = [...rowPath, "completion"];
    const completionKeyFailure = firstExactKeyFailure(
      completion,
      completionKeys,
      completionPath,
    );
    if (completionKeyFailure !== null) return completionKeyFailure;
    if (kind === "pickup" || kind === "incomplete") {
      const durationFailure = firstDurationShapeFailure(
        completion["expectedDuration"],
        [...completionPath, "expectedDuration"],
      );
      if (durationFailure !== null) return durationFailure;
      const reason = completion["reason"];
      if (
        typeof reason !== "string" ||
        !isUnicodeScalarString(reason) ||
        codePointLength(reason) > MAX_LONG_TEXT_CODE_POINTS ||
        reason.trim().length === 0
      ) {
        return [...completionPath, "reason"];
      }
    }
  }
  return null;
}

function firstMetadataShapeFailure(
  value: unknown,
  path: readonly (string | number)[],
): readonly (string | number)[] | null {
  const keyFailure = firstExactKeyFailure(
    value,
    ["name", "annotation", "keyOverride", "voiceLeadingBoundary"],
    path,
  );
  if (keyFailure !== null) return keyFailure;
  if (!isObject(value)) return path;
  if (!isBoundedToken(value["name"], MAX_SHORT_TEXT_CODE_POINTS)) {
    return [...path, "name"];
  }
  if (
    typeof value["annotation"] !== "string" ||
    !isUnicodeScalarString(value["annotation"]) ||
    codePointLength(value["annotation"]) > MAX_LONG_TEXT_CODE_POINTS
  ) {
    return [...path, "annotation"];
  }
  const keyOverride = value["keyOverride"];
  if (keyOverride !== null) {
    const keyContextFailure = firstExactKeyFailure(
      keyOverride,
      ["tonic", "mode"],
      [...path, "keyOverride"],
    );
    if (keyContextFailure !== null) return keyContextFailure;
    if (!isObject(keyOverride)) return [...path, "keyOverride"];
    const tonicFailure = firstExactKeyFailure(
      keyOverride["tonic"],
      ["step", "alter"],
      [...path, "keyOverride", "tonic"],
    );
    if (tonicFailure !== null) return tonicFailure;
    const tonic = isObject(keyOverride["tonic"]) ? keyOverride["tonic"] : {};
    if (!["A", "B", "C", "D", "E", "F", "G"].includes(String(tonic["step"]))) {
      return [...path, "keyOverride", "tonic", "step"];
    }
    if (
      !Number.isInteger(tonic["alter"]) ||
      Number(tonic["alter"]) < -2 ||
      Number(tonic["alter"]) > 2
    ) {
      return [...path, "keyOverride", "tonic", "alter"];
    }
    if (!KEY_MODES.includes(keyOverride["mode"] as never)) {
      return [...path, "keyOverride", "mode"];
    }
  }
  return SECTION_VOICE_LEADING_BOUNDARIES.includes(
    value["voiceLeadingBoundary"] as never,
  )
    ? null
    : [...path, "voiceLeadingBoundary"];
}

function firstPlacementShapeFailure(
  value: unknown,
  sourceKind: unknown,
  path: readonly (string | number)[],
): readonly (string | number)[] | null {
  if (!isObject(value)) return path;
  const kindProperty = ownEnumerableDataProperty(value, "kind");
  if (typeof kindProperty?.value !== "string") return [...path, "kind"];
  const kind = kindProperty.value;
  const keys =
    kind === "into-measure"
      ? [
          "kind",
          "measureId",
          "beforeEventId",
          "layoutDisposition",
          "completionDeclarations",
        ]
      : kind === "into-section"
        ? [
            "kind",
            "sectionId",
            "beforeMeasureId",
            "layoutDisposition",
            "completionDeclarations",
          ]
        : kind === "into-document"
          ? [
              "kind",
              "beforeSectionId",
              "layoutDisposition",
              "sectionDeclarations",
              "completionDeclarations",
            ]
          : null;
  if (keys === null) return [...path, "kind"];
  const keyFailure = firstExactKeyFailure(value, keys, path);
  if (keyFailure !== null) return keyFailure;
  const idFields =
    kind === "into-measure"
      ? ["measureId", "beforeEventId"]
      : kind === "into-section"
        ? ["sectionId", "beforeMeasureId"]
        : ["beforeSectionId"];
  for (const idField of idFields) {
    const required = idField === "measureId" || idField === "sectionId";
    if (
      (required && !isStableId(value[idField])) ||
      (!required && value[idField] !== null && !isStableId(value[idField]))
    ) {
      return [...path, idField];
    }
  }
  const expectedLayout =
    kind === "into-measure"
      ? sourceKind === "recovered-chord"
        ? "insert-one-recovered-chord"
        : "flatten-one-implicit-measure"
      : kind === "into-section"
        ? "preserve-implicit-measures"
        : "preserve-named-sections";
  if (value["layoutDisposition"] !== expectedLayout) {
    return [...path, "layoutDisposition"];
  }
  const completionFailure = firstCompletionShapeFailure(
    value["completionDeclarations"],
    [...path, "completionDeclarations"],
    kind === "into-measure" ? 1 : 0,
  );
  if (completionFailure !== null) return completionFailure;
  if (kind === "into-document") {
    if (
      !Array.isArray(value["sectionDeclarations"]) ||
      capturedArrayHasInvalidOwnShape(value["sectionDeclarations"])
    ) {
      return [...path, "sectionDeclarations"];
    }
    for (const [index, declaration] of value["sectionDeclarations"].entries()) {
      const rowPath = [...path, "sectionDeclarations", index];
      const declarationFailure = firstExactKeyFailure(
        declaration,
        ["sourceSectionOrdinal", "voiceLeadingBoundary"],
        rowPath,
      );
      if (declarationFailure !== null) return declarationFailure;
      if (
        !isObject(declaration) ||
        !isNonnegativeSafeInteger(declaration["sourceSectionOrdinal"])
      ) {
        return [...rowPath, "sourceSectionOrdinal"];
      }
      if (
        !SECTION_VOICE_LEADING_BOUNDARIES.includes(
          declaration["voiceLeadingBoundary"] as never,
        )
      ) {
        return [...rowPath, "voiceLeadingBoundary"];
      }
    }
  }
  return null;
}

function firstPlanShapeFailure(
  planValue: unknown,
): readonly (string | number)[] | null {
  if (!isObject(planValue)) return ["plan"];
  const plan = planValue;
  const kindProperty = ownEnumerableDataProperty(plan, "kind");
  if (typeof kindProperty?.value !== "string") return ["plan", "kind"];
  switch (kindProperty.value) {
    case "insert-fragment": {
      const keyFailure = firstExactKeyFailure(
        plan,
        ["kind", "source", "placement", "voicingPolicy"],
        ["plan"],
      );
      if (keyFailure !== null) return keyFailure;
      const source = isObject(plan["source"]) ? plan["source"] : null;
      if (source === null) return ["plan", "source"];
      const sourceKindProperty = ownEnumerableDataProperty(source, "kind");
      const complete = sourceKindProperty?.value === "complete-draft";
      const recovered = sourceKindProperty?.value === "recovered-chord";
      if (!complete && !recovered) return ["plan", "source", "kind"];
      const sourceFailure = firstExactKeyFailure(
        source,
        complete
          ? ["kind", "quickEntrySnapshot", "warningAcknowledgements"]
          : [
              "kind",
              "quickEntrySnapshot",
              "selectedGlobalOrdinal",
              "layoutLossAcknowledgement",
              "callerDuration",
            ],
        ["plan", "source"],
      );
      if (sourceFailure !== null) return sourceFailure;
      const snapshot = isObject(source["quickEntrySnapshot"])
        ? source["quickEntrySnapshot"]
        : null;
      const snapshotFailure = firstExactKeyFailure(
        snapshot,
        [
          "sourceText",
          "baseRevision",
          "target",
          "issueCodes",
          "expectedStatus",
          "expectedLane",
        ],
        ["plan", "source", "quickEntrySnapshot"],
      );
      if (snapshotFailure !== null) return snapshotFailure;
      if (snapshot === null) return ["plan", "source", "quickEntrySnapshot"];
      if (typeof snapshot["sourceText"] !== "string") {
        return ["plan", "source", "quickEntrySnapshot", "sourceText"];
      }
      if (!isNonnegativeSafeInteger(snapshot["baseRevision"])) {
        return ["plan", "source", "quickEntrySnapshot", "baseRevision"];
      }
      const boundaryFailure = firstBoundaryShapeFailure(snapshot["target"], [
        "plan",
        "source",
        "quickEntrySnapshot",
        "target",
      ]);
      if (boundaryFailure !== null) return boundaryFailure;
      /*
       * R1: issue codes are an ordered sequence, not a set. Repeated equal
       * codes are permitted and significant; only the row bound and per-code
       * token invariant gate the shape.
       */
      if (
        !Array.isArray(snapshot["issueCodes"]) ||
        capturedArrayHasInvalidOwnShape(snapshot["issueCodes"]) ||
        snapshot["issueCodes"].length > MAX_DRAFT_ISSUES ||
        snapshot["issueCodes"].some(
          (code) => !isBoundedToken(code, MAX_COMMAND_ID_CODE_POINTS),
        )
      ) {
        return ["plan", "source", "quickEntrySnapshot", "issueCodes"];
      }
      if (
        !["idle", "invalid", "ready"].includes(
          String(snapshot["expectedStatus"]),
        )
      ) {
        return ["plan", "source", "quickEntrySnapshot", "expectedStatus"];
      }
      if (
        !["complete-draft", "recovered-chord"].includes(
          String(snapshot["expectedLane"]),
        )
      ) {
        return ["plan", "source", "quickEntrySnapshot", "expectedLane"];
      }
      if (complete) {
        if (
          !Array.isArray(source["warningAcknowledgements"]) ||
          capturedArrayHasInvalidOwnShape(source["warningAcknowledgements"])
        ) {
          return ["plan", "source", "warningAcknowledgements"];
        }
        for (const [index, row] of source[
          "warningAcknowledgements"
        ].entries()) {
          const rowPath = ["plan", "source", "warningAcknowledgements", index];
          const rowFailure = firstExactKeyFailure(
            row,
            ["code", "range"],
            rowPath,
          );
          if (rowFailure !== null) return rowFailure;
          if (
            !isObject(row) ||
            !isBoundedToken(row["code"], MAX_COMMAND_ID_CODE_POINTS)
          ) {
            return [...rowPath, "code"];
          }
          if (
            !isValidSourceRange(row["range"], snapshot["sourceText"].length)
          ) {
            return [...rowPath, "range"];
          }
        }
      } else {
        if (!isNonnegativeSafeInteger(source["selectedGlobalOrdinal"])) {
          return ["plan", "source", "selectedGlobalOrdinal"];
        }
        if (
          typeof source["layoutLossAcknowledgement"] !== "string" ||
          !isUnicodeScalarString(source["layoutLossAcknowledgement"])
        ) {
          return ["plan", "source", "layoutLossAcknowledgement"];
        }
        if (source["callerDuration"] !== null) {
          const callerFailure = firstDurationShapeFailure(
            source["callerDuration"],
            ["plan", "source", "callerDuration"],
          );
          if (callerFailure !== null) return callerFailure;
        }
      }
      const placementFailure = firstPlacementShapeFailure(
        plan["placement"],
        source["kind"],
        ["plan", "placement"],
      );
      if (placementFailure !== null) return placementFailure;
      return plan["voicingPolicy"] === A0_U1_NEW_EVENT_POLICY_ID
        ? null
        : ["plan", "voicingPolicy"];
    }
    case "split-event-duration": {
      const keyFailure = firstExactKeyFailure(
        plan,
        [
          "kind",
          "eventId",
          "firstDuration",
          "secondDuration",
          "completionDeclarations",
          "identityPolicy",
          "contentPolicy",
          "annotationPolicy",
        ],
        ["plan"],
      );
      if (keyFailure !== null) return keyFailure;
      if (!isStableId(plan["eventId"])) return ["plan", "eventId"];
      for (const field of ["firstDuration", "secondDuration"]) {
        const failure = firstDurationShapeFailure(plan[field], ["plan", field]);
        if (failure !== null) return failure;
      }
      const completionFailure = firstCompletionShapeFailure(
        plan["completionDeclarations"],
        ["plan", "completionDeclarations"],
        1,
      );
      if (completionFailure !== null) return completionFailure;
      if (plan["identityPolicy"] !== "retain-source-first-allocate-second") {
        return ["plan", "identityPolicy"];
      }
      if (plan["contentPolicy"] !== "copy-exact-chord-and-voicing") {
        return ["plan", "contentPolicy"];
      }
      return plan["annotationPolicy"] === "retain-source-first-clear-second"
        ? null
        : ["plan", "annotationPolicy"];
    }
    case "join-event-durations": {
      const keyFailure = firstExactKeyFailure(
        plan,
        [
          "kind",
          "leftEventId",
          "rightEventId",
          "joinedDuration",
          "completionDeclarations",
          "identityPolicy",
          "contentPolicy",
          "annotationPolicy",
        ],
        ["plan"],
      );
      if (keyFailure !== null) return keyFailure;
      if (!isStableId(plan["leftEventId"])) return ["plan", "leftEventId"];
      if (!isStableId(plan["rightEventId"])) {
        return ["plan", "rightEventId"];
      }
      const durationFailure = firstDurationShapeFailure(
        plan["joinedDuration"],
        ["plan", "joinedDuration"],
      );
      if (durationFailure !== null) return durationFailure;
      const completionFailure = firstCompletionShapeFailure(
        plan["completionDeclarations"],
        ["plan", "completionDeclarations"],
        1,
      );
      if (completionFailure !== null) return completionFailure;
      if (plan["identityPolicy"] !== "retain-left-remove-right") {
        return ["plan", "identityPolicy"];
      }
      if (plan["contentPolicy"] !== "require-exact-chord-and-voicing") {
        return ["plan", "contentPolicy"];
      }
      return plan["annotationPolicy"] === "require-right-empty-retain-left"
        ? null
        : ["plan", "annotationPolicy"];
    }
    case "split-section": {
      const keyFailure = firstExactKeyFailure(
        plan,
        [
          "kind",
          "sectionId",
          "beforeMeasureId",
          "newSectionMetadata",
          "completionDeclarations",
          "identityPolicy",
          "measurePolicy",
        ],
        ["plan"],
      );
      if (keyFailure !== null) return keyFailure;
      if (!isStableId(plan["sectionId"])) return ["plan", "sectionId"];
      if (!isStableId(plan["beforeMeasureId"])) {
        return ["plan", "beforeMeasureId"];
      }
      const metadataFailure = firstMetadataShapeFailure(
        plan["newSectionMetadata"],
        ["plan", "newSectionMetadata"],
      );
      if (metadataFailure !== null) return metadataFailure;
      const completionFailure = firstCompletionShapeFailure(
        plan["completionDeclarations"],
        ["plan", "completionDeclarations"],
        0,
      );
      if (completionFailure !== null) return completionFailure;
      if (plan["identityPolicy"] !== "retain-source-prefix-allocate-suffix") {
        return ["plan", "identityPolicy"];
      }
      return plan["measurePolicy"] === "move-suffix-preserve-identities"
        ? null
        : ["plan", "measurePolicy"];
    }
    case "join-sections": {
      const keyFailure = firstExactKeyFailure(
        plan,
        [
          "kind",
          "leftSectionId",
          "rightSectionId",
          "expectedLeftMetadata",
          "expectedRightMetadata",
          "resultMetadata",
          "completionDeclarations",
          "identityPolicy",
          "measurePolicy",
          "metadataPolicy",
          "internalBoundaryPolicy",
        ],
        ["plan"],
      );
      if (keyFailure !== null) return keyFailure;
      if (!isStableId(plan["leftSectionId"])) {
        return ["plan", "leftSectionId"];
      }
      if (!isStableId(plan["rightSectionId"])) {
        return ["plan", "rightSectionId"];
      }
      for (const field of [
        "expectedLeftMetadata",
        "expectedRightMetadata",
        "resultMetadata",
      ]) {
        const metadataFailure = firstMetadataShapeFailure(plan[field], [
          "plan",
          field,
        ]);
        if (metadataFailure !== null) return metadataFailure;
      }
      const completionFailure = firstCompletionShapeFailure(
        plan["completionDeclarations"],
        ["plan", "completionDeclarations"],
        0,
      );
      if (completionFailure !== null) return completionFailure;
      if (plan["identityPolicy"] !== "retain-left-remove-right") {
        return ["plan", "identityPolicy"];
      }
      if (plan["measurePolicy"] !== "left-then-right-preserve-identities") {
        return ["plan", "measurePolicy"];
      }
      if (
        plan["metadataPolicy"] !== "compare-both-then-apply-explicit-result"
      ) {
        return ["plan", "metadataPolicy"];
      }
      return plan["internalBoundaryPolicy"] ===
        "remove-right-entry-boundary-confirmed"
        ? null
        : ["plan", "internalBoundaryPolicy"];
    }
    default:
      return ["plan", "kind"];
  }
}

function firstRuntimeShapeRefusal(command: unknown): RefusalOracle | null {
  const captured = capturePassiveData(command, []);
  if (!captured.ok) {
    return {
      code:
        captured.path[0] === "plan"
          ? "edit-plan.plan-shape-invalid"
          : "edit-plan.command-shape-invalid",
      path: captured.path,
    };
  }
  command = captured.value;
  const envelopeKeys = [
    "id",
    "label",
    "expectedDocumentId",
    "expectedRevision",
    "logicalTimeMs",
    "coalescing",
    "kind",
    "plan",
  ];
  const envelopeFailure = firstExactKeyFailure(command, envelopeKeys, []);
  if (envelopeFailure !== null) {
    return {
      code: "edit-plan.command-shape-invalid",
      path: envelopeFailure,
    };
  }
  if (!isObject(command)) {
    return { code: "edit-plan.command-shape-invalid", path: [] };
  }
  if (command["coalescing"] !== null) {
    return { code: "edit-plan.command-shape-invalid", path: ["coalescing"] };
  }
  if (command["kind"] !== "apply-edit-plan") {
    return { code: "edit-plan.command-shape-invalid", path: ["kind"] };
  }
  const planFailure = firstPlanShapeFailure(command["plan"]);
  return planFailure === null
    ? null
    : { code: "edit-plan.plan-shape-invalid", path: planFailure };
}

/**
 * Descriptor-safe executable seam for hostile-object proofs. The probe never
 * reads a command field until the complete expected own-key set has been
 * captured and every expected field is an enumerable data property.
 */
export function probeA0U1RuntimeShapeRefusal(
  command: unknown,
): RefusalOracle | null {
  const refusal = firstRuntimeShapeRefusal(command);
  return refusal === null
    ? null
    : Object.freeze({
        code: refusal.code,
        path: Object.freeze([...refusal.path]),
      });
}

function firstSequenceMismatchIndex(
  left: readonly unknown[],
  right: readonly unknown[],
): number | null {
  const shared = Math.min(left.length, right.length);
  for (let index = 0; index < shared; index += 1) {
    if (!jsonDeepEqual(left[index], right[index])) return index;
  }
  return left.length === right.length ? null : shared;
}

function firstSnapshotMismatch(
  command: JsonObject,
  before: JsonObject,
): Readonly<{
  path: readonly (string | number)[];
  fieldsCompared: number;
  issueCodesCompared: number;
}> | null {
  const plan = isObject(command["plan"]) ? command["plan"] : null;
  if (plan?.["kind"] !== "insert-fragment") return null;
  const source = isObject(plan["source"]) ? plan["source"] : {};
  const snapshot = isObject(source["quickEntrySnapshot"])
    ? source["quickEntrySnapshot"]
    : {};
  const quickEntry = isObject(before["quickEntry"]) ? before["quickEntry"] : {};
  const ordered: readonly Readonly<{
    name: string;
    observed: unknown;
    expected: unknown;
  }>[] = [
    {
      name: "sourceText",
      observed: snapshot["sourceText"],
      expected: quickEntry["text"],
    },
    {
      name: "baseRevision",
      observed: snapshot["baseRevision"],
      expected:
        quickEntry["baseRevision"] === before["revision"]
          ? quickEntry["baseRevision"]
          : Symbol("invalid-current-base-revision"),
    },
    {
      name: "target",
      observed: snapshot["target"],
      expected: quickEntry["target"],
    },
  ];
  for (const [index, field] of ordered.entries()) {
    if (!jsonDeepEqual(field.observed, field.expected)) {
      return {
        path: ["plan", "source", "quickEntrySnapshot", field.name],
        fieldsCompared: index + 1,
        issueCodesCompared: 0,
      };
    }
  }
  const observedIssues = Array.isArray(snapshot["issueCodes"])
    ? snapshot["issueCodes"]
    : [];
  const expectedIssues = Array.isArray(quickEntry["issueCodes"])
    ? quickEntry["issueCodes"]
    : [];
  const issueMismatch = firstSequenceMismatchIndex(
    observedIssues,
    expectedIssues,
  );
  if (issueMismatch !== null) {
    return {
      path: [
        "plan",
        "source",
        "quickEntrySnapshot",
        "issueCodes",
        issueMismatch,
      ],
      fieldsCompared: 4,
      issueCodesCompared: issueMismatch + 1,
    };
  }
  if (snapshot["expectedStatus"] !== quickEntry["status"]) {
    return {
      path: ["plan", "source", "quickEntrySnapshot", "expectedStatus"],
      fieldsCompared: 5,
      issueCodesCompared: observedIssues.length,
    };
  }
  if (snapshot["expectedLane"] !== source["kind"]) {
    return {
      path: ["plan", "source", "quickEntrySnapshot", "expectedLane"],
      fieldsCompared: 6,
      issueCodesCompared: observedIssues.length,
    };
  }
  return null;
}

function boundaryIdField(boundary: unknown): string | null {
  if (!isObject(boundary)) return null;
  const kind = boundary["kind"];
  if (
    [
      "before-section",
      "after-section",
      "section-start",
      "section-end",
    ].includes(String(kind))
  ) {
    return "sectionId";
  }
  if (
    [
      "before-measure",
      "after-measure",
      "measure-start",
      "measure-end",
    ].includes(String(kind))
  ) {
    return "measureId";
  }
  return kind === "before-event" || kind === "after-event" ? "eventId" : null;
}

function idExistsForField(
  document: unknown,
  field: string,
  id: unknown,
): boolean {
  if (field === "sectionId") return findSectionLocation(document, id) !== null;
  if (field === "measureId") return findMeasureLocation(document, id) !== null;
  return field === "eventId" && findEventLocation(document, id) !== null;
}

function firstMissingTarget(
  document: unknown,
  plan: JsonObject,
): readonly (string | number)[] | null {
  if (plan["kind"] === "insert-fragment") {
    const placement = isObject(plan["placement"]) ? plan["placement"] : {};
    const placementFields =
      placement["kind"] === "into-measure"
        ? ["measureId", "beforeEventId"]
        : placement["kind"] === "into-section"
          ? ["sectionId", "beforeMeasureId"]
          : ["beforeSectionId"];
    for (const field of placementFields) {
      const id = placement[field];
      if (
        id !== null &&
        !idExistsForField(
          document,
          field === "beforeEventId"
            ? "eventId"
            : field === "beforeMeasureId"
              ? "measureId"
              : field === "beforeSectionId"
                ? "sectionId"
                : field,
          id,
        )
      ) {
        return ["plan", "placement", field];
      }
    }
    const source = isObject(plan["source"]) ? plan["source"] : {};
    const snapshot = isObject(source["quickEntrySnapshot"])
      ? source["quickEntrySnapshot"]
      : {};
    const target = snapshot["target"];
    const targetField = boundaryIdField(target);
    if (
      targetField !== null &&
      isObject(target) &&
      !idExistsForField(document, targetField, target[targetField])
    ) {
      return ["plan", "source", "quickEntrySnapshot", "target", targetField];
    }
    return null;
  }
  const fields =
    plan["kind"] === "split-event-duration"
      ? ["eventId"]
      : plan["kind"] === "join-event-durations"
        ? ["leftEventId", "rightEventId"]
        : plan["kind"] === "split-section"
          ? ["sectionId", "beforeMeasureId"]
          : plan["kind"] === "join-sections"
            ? ["leftSectionId", "rightSectionId"]
            : [];
  for (const field of fields) {
    const idField = ["eventId", "leftEventId", "rightEventId"].includes(field)
      ? "eventId"
      : field === "beforeMeasureId"
        ? "measureId"
        : "sectionId";
    if (!idExistsForField(document, idField, plan[field])) {
      return ["plan", field];
    }
  }
  return null;
}

function expectedCompletionDeclarations(
  document: unknown,
  plan: JsonObject,
): readonly JsonObject[] | null {
  if (plan["kind"] === "insert-fragment") {
    const source = isObject(plan["source"]) ? plan["source"] : {};
    const placement = isObject(plan["placement"]) ? plan["placement"] : {};
    if (placement["kind"] !== "into-measure") return [];
    if (source["kind"] === "complete-draft") {
      return [
        {
          measureId: placement["measureId"],
          completion: { kind: "complete" },
        },
      ];
    }
    const observed = recordsAt(placement["completionDeclarations"]);
    return [
      {
        measureId: placement["measureId"],
        completion: observed[0]?.["completion"],
      },
    ];
  }
  if (
    plan["kind"] === "split-event-duration" ||
    plan["kind"] === "join-event-durations"
  ) {
    const eventId =
      plan["kind"] === "split-event-duration"
        ? plan["eventId"]
        : plan["leftEventId"];
    const location = findEventLocation(document, eventId);
    return location === null
      ? null
      : [
          {
            measureId: location.measure["id"],
            completion: location.measure["completion"],
          },
        ];
  }
  return [];
}

function planCompletionDeclarations(plan: JsonObject): readonly JsonObject[] {
  if (plan["kind"] === "insert-fragment" && isObject(plan["placement"])) {
    return recordsAt(plan["placement"]["completionDeclarations"]);
  }
  return recordsAt(plan["completionDeclarations"]);
}

function firstCompletionMismatch(
  document: unknown,
  plan: JsonObject,
): readonly (string | number)[] | null {
  const expected = expectedCompletionDeclarations(document, plan);
  if (expected === null) return ["plan", "completionDeclarations", 0];
  const observed = planCompletionDeclarations(plan);
  const mismatch = firstSequenceMismatchIndex(observed, expected);
  if (mismatch === null) return null;
  return plan["kind"] === "insert-fragment"
    ? ["plan", "placement", "completionDeclarations", mismatch]
    : ["plan", "completionDeclarations", mismatch];
}

function firstSectionMetadataMismatch(
  document: unknown,
  plan: JsonObject,
  parserEvidence: ParserEvidenceView | null,
): readonly (string | number)[] | null {
  if (
    plan["kind"] === "insert-fragment" &&
    isObject(plan["placement"]) &&
    plan["placement"]["kind"] === "into-document"
  ) {
    const observed = recordsAt(plan["placement"]["sectionDeclarations"]);
    const expected =
      parserEvidence?.sectionRows.map((row) => ({
        sourceSectionOrdinal: row["sourceSectionOrdinal"],
        voiceLeadingBoundary: observed.find(
          (declaration) =>
            declaration["sourceSectionOrdinal"] === row["sourceSectionOrdinal"],
        )?.["voiceLeadingBoundary"],
      })) ?? [];
    const mismatch = firstSequenceMismatchIndex(observed, expected);
    return mismatch === null
      ? null
      : ["plan", "placement", "sectionDeclarations", mismatch];
  }
  if (plan["kind"] !== "join-sections") return null;
  const left = findSectionLocation(document, plan["leftSectionId"]);
  const right = findSectionLocation(document, plan["rightSectionId"]);
  if (left === null || right === null) return ["plan", "expectedLeftMetadata"];
  for (const [field, section] of [
    ["expectedLeftMetadata", left.section],
    ["expectedRightMetadata", right.section],
  ] as const) {
    const observed = isObject(plan[field]) ? plan[field] : {};
    const actual = sectionMetadataProjection(section);
    for (const metadataField of [
      "name",
      "annotation",
      "keyOverride",
      "voiceLeadingBoundary",
    ]) {
      if (!jsonDeepEqual(observed[metadataField], actual[metadataField])) {
        return ["plan", field, metadataField];
      }
    }
  }
  return null;
}

function firstWarningMismatch(
  plan: JsonObject,
  parserEvidence: ParserEvidenceView | null,
  rawEvidence: unknown,
): readonly (string | number)[] | null {
  if (
    !isObject(plan["source"]) ||
    plan["source"]["kind"] !== "complete-draft"
  ) {
    return null;
  }
  const observed = Array.isArray(plan["source"]["warningAcknowledgements"])
    ? plan["source"]["warningAcknowledgements"]
    : [];
  const expected = isObject(rawEvidence)
    ? recordsAt(rawEvidence["warningRows"])
    : parserEvidence?.outcome === "success"
      ? []
      : [];
  const mismatch = firstSequenceMismatchIndex(observed, expected);
  return mismatch === null
    ? null
    : ["plan", "source", "warningAcknowledgements", mismatch];
}

function operationDurationRefusal(
  document: unknown,
  plan: JsonObject,
  parserEvidence: ParserEvidenceView | null,
): RefusalOracle | null {
  if (
    plan["kind"] === "insert-fragment" &&
    isObject(plan["source"]) &&
    plan["source"]["kind"] === "recovered-chord"
  ) {
    const source = plan["source"];
    const selected = parserEvidence?.insertableRows.find(
      (row) => row["globalOrdinal"] === source["selectedGlobalOrdinal"],
    );
    const duration = isObject(selected?.["duration"])
      ? selected["duration"]
      : {};
    const caller = source["callerDuration"];
    const branchMatches =
      (duration["kind"] === "resolved" && caller === null) ||
      (duration["kind"] === "requires-caller" && caller !== null);
    if (!branchMatches) {
      return {
        code: "edit-plan.recovered-chord-duration-mismatch",
        path: ["plan", "source", "callerDuration"],
      };
    }
    if (caller !== null && !isCanonicalPositiveDuration(caller)) {
      return {
        code: "edit-plan.duration-invalid",
        path: ["plan", "source", "callerDuration"],
      };
    }
    return null;
  }
  if (plan["kind"] === "split-event-duration") {
    for (const field of ["firstDuration", "secondDuration"]) {
      if (!isCanonicalPositiveDuration(plan[field])) {
        return { code: "edit-plan.duration-invalid", path: ["plan", field] };
      }
    }
    const source = findEventLocation(document, plan["eventId"]);
    const first = durationRational(plan["firstDuration"]);
    const second = durationRational(plan["secondDuration"]);
    const original = durationRational(source?.event["duration"]);
    if (
      first === null ||
      second === null ||
      original === null ||
      !jsonDeepEqual(addRationals(first, second), original)
    ) {
      return {
        code: "edit-plan.duration-sum-mismatch",
        path: ["plan", "secondDuration"],
      };
    }
  }
  if (plan["kind"] === "join-event-durations") {
    if (!isCanonicalPositiveDuration(plan["joinedDuration"])) {
      return {
        code: "edit-plan.duration-invalid",
        path: ["plan", "joinedDuration"],
      };
    }
    const left = findEventLocation(document, plan["leftEventId"]);
    const right = findEventLocation(document, plan["rightEventId"]);
    const leftDuration = durationRational(left?.event["duration"]);
    const rightDuration = durationRational(right?.event["duration"]);
    const joined = durationRational(plan["joinedDuration"]);
    if (
      leftDuration === null ||
      rightDuration === null ||
      joined === null ||
      !jsonDeepEqual(addRationals(leftDuration, rightDuration), joined)
    ) {
      return {
        code: "edit-plan.duration-sum-mismatch",
        path: ["plan", "joinedDuration"],
      };
    }
    if (
      !jsonDeepEqual(
        objectProjection(
          left?.event ?? {},
          new Set(["id", "duration", "annotation"]),
        ),
        objectProjection(
          right?.event ?? {},
          new Set(["id", "duration", "annotation"]),
        ),
      )
    ) {
      return {
        code: "edit-plan.event-content-mismatch",
        path: ["plan", "rightEventId"],
      };
    }
    if (right?.event["annotation"] !== "") {
      return {
        code: "edit-plan.right-annotation-not-empty",
        path: ["plan", "rightEventId"],
      };
    }
  }
  return null;
}

function projectedCollectionRefusal(
  document: unknown,
  plan: JsonObject,
  parserEvidence: ParserEvidenceView | null,
): RefusalOracle | null {
  const sections = documentSections(document);
  const measures = sections.flatMap(sectionMeasures);
  const events = measures.flatMap(measureEvents);
  let finalSections = sections.length;
  let finalMeasures = measures.length;
  let finalEvents = events.length;
  const finalPerSection = sections.map(
    (section) => sectionMeasures(section).length,
  );
  if (plan["kind"] === "insert-fragment" && isObject(plan["placement"])) {
    const insertedMeasures = parserEvidence?.measureRows.length ?? 0;
    const source = isObject(plan["source"]) ? plan["source"] : {};
    const insertedEvents =
      source["kind"] === "recovered-chord"
        ? parserEvidence?.insertableRows.some(
            (row) => row["globalOrdinal"] === source["selectedGlobalOrdinal"],
          )
          ? 1
          : 0
        : (parserEvidence?.insertableRows.length ?? 0);
    finalEvents += insertedEvents;
    if (plan["placement"]["kind"] === "into-section") {
      finalMeasures += insertedMeasures;
      const target = findSectionLocation(
        document,
        plan["placement"]["sectionId"],
      );
      if (target !== null) {
        const current = finalPerSection[target.index];
        if (current !== undefined) {
          finalPerSection[target.index] = current + insertedMeasures;
        }
      }
    } else if (plan["placement"]["kind"] === "into-document") {
      finalSections += parserEvidence?.sectionRows.length ?? 0;
      finalMeasures += insertedMeasures;
      for (const sectionRow of parserEvidence?.sectionRows ?? []) {
        finalPerSection.push(
          parserEvidence?.measureRows.filter(
            (measure) =>
              measure["sourceSectionOrdinal"] ===
              sectionRow["sourceSectionOrdinal"],
          ).length ?? 0,
        );
      }
    }
  } else if (plan["kind"] === "split-event-duration") {
    finalEvents += 1;
  } else if (plan["kind"] === "join-event-durations") {
    finalEvents -= 1;
  } else if (plan["kind"] === "split-section") {
    finalSections += 1;
  } else if (plan["kind"] === "join-sections") {
    finalSections -= 1;
    const left = findSectionLocation(document, plan["leftSectionId"]);
    const right = findSectionLocation(document, plan["rightSectionId"]);
    if (left !== null && right !== null) {
      finalPerSection[left.index] =
        sectionMeasures(left.section).length +
        sectionMeasures(right.section).length;
      finalPerSection.splice(right.index, 1);
    }
  }
  const occupied = 1 + finalSections + finalMeasures + finalEvents;
  const planNodes =
    1 +
    (plan["kind"] === "insert-fragment"
      ? parserEvidence?.outcome === "success"
        ? parserEvidence.sectionRows.length +
          parserEvidence.measureRows.length +
          parserEvidence.insertableRows.length
        : (parserEvidence?.insertableRows.length ?? 0)
      : 0);
  if (finalSections > EXPECTED_ATOMIC_EDIT_LIMITS.fragmentSections) {
    return { code: "edit-plan.collection-limit-exceeded", path: ["plan"] };
  }
  if (
    finalPerSection.some(
      (count) => count > EXPECTED_ATOMIC_EDIT_LIMITS.fragmentMeasuresPerSection,
    )
  ) {
    return { code: "edit-plan.collection-limit-exceeded", path: ["plan"] };
  }
  if (finalMeasures > EXPECTED_ATOMIC_EDIT_LIMITS.fragmentMeasures) {
    return { code: "edit-plan.collection-limit-exceeded", path: ["plan"] };
  }
  if (finalEvents > EXPECTED_ATOMIC_EDIT_LIMITS.fragmentEvents) {
    return { code: "edit-plan.collection-limit-exceeded", path: ["plan"] };
  }
  if (occupied > EXPECTED_ATOMIC_EDIT_LIMITS.occupiedIdRecords) {
    return { code: "edit-plan.collection-limit-exceeded", path: ["plan"] };
  }
  return planNodes > EXPECTED_ATOMIC_EDIT_LIMITS.planNodeRecords
    ? { code: "edit-plan.collection-limit-exceeded", path: ["plan"] }
    : null;
}

function insertedDurationTotal(
  plan: JsonObject,
  parserEvidence: ParserEvidenceView | null,
): ExactRational | null {
  if (plan["kind"] !== "insert-fragment") {
    return Object.freeze({ numerator: 0n, denominator: 1n });
  }
  const source = isObject(plan["source"]) ? plan["source"] : {};
  const rows =
    source["kind"] === "recovered-chord"
      ? (parserEvidence?.insertableRows.filter(
          (row) => row["globalOrdinal"] === source["selectedGlobalOrdinal"],
        ) ?? [])
      : (parserEvidence?.insertableRows ?? []);
  let total: ExactRational = Object.freeze({ numerator: 0n, denominator: 1n });
  for (const row of rows) {
    const duration = isObject(row["duration"]) ? row["duration"] : {};
    const value =
      duration["kind"] === "resolved"
        ? duration["value"]
        : source["callerDuration"];
    const rational = durationRational(value);
    if (rational === null) return null;
    total = addRationals(total, rational);
  }
  return total;
}

function timelineLimitRefusal(
  document: unknown,
  plan: JsonObject,
  parserEvidence: ParserEvidenceView | null,
): RefusalOracle | null {
  const before = documentTotalDuration(document);
  const inserted = insertedDurationTotal(plan, parserEvidence);
  if (before === null || inserted === null) return null;
  const final = addRationals(before, inserted);
  return final.numerator >
    BigInt(EXPECTED_ATOMIC_EDIT_LIMITS.finalTimelineQuarterNoteBeats) *
      final.denominator
    ? { code: "edit-plan.timeline-limit-exceeded", path: ["plan"] }
    : null;
}

type CausalOracleResult = Readonly<{
  refusal: RefusalOracle | null;
  candidate: CandidateOracleResult | null;
  f2Ok: boolean;
  f3Ok: boolean;
}>;

function deriveCausalRefusal(
  before: JsonObject,
  command: unknown,
  parserEvidence: ParserEvidenceView | null,
  rawParserEvidence: unknown,
  allocationTrace: unknown,
  historyEstimatorEvidence: unknown,
): CausalOracleResult {
  const shape = firstRuntimeShapeRefusal(command);
  if (shape !== null || !isObject(command)) {
    return { refusal: shape, candidate: null, f2Ok: false, f3Ok: false };
  }
  const envelope = expectedA0EnvelopeFailure(before, command);
  if (envelope !== null) {
    return { refusal: null, candidate: null, f2Ok: false, f3Ok: false };
  }
  const plan = isObject(command["plan"]) ? command["plan"] : {};
  const snapshot = firstSnapshotMismatch(command, before);
  if (snapshot !== null) {
    return {
      refusal: {
        code: "edit-plan.quick-entry-snapshot-mismatch",
        path: snapshot.path,
      },
      candidate: null,
      f2Ok: false,
      f3Ok: false,
    };
  }
  if (plan["kind"] === "insert-fragment" && isObject(plan["source"])) {
    const snapshotRecord = isObject(plan["source"]["quickEntrySnapshot"])
      ? plan["source"]["quickEntrySnapshot"]
      : {};
    const sourceText = String(snapshotRecord["sourceText"]);
    if (
      codePointLength(sourceText) >
      EXPECTED_ATOMIC_EDIT_LIMITS.fragmentSourceCodePoints
    ) {
      return {
        refusal: {
          code: "edit-plan.source-code-points-exceeded",
          path: ["plan", "source", "quickEntrySnapshot", "sourceText"],
        },
        candidate: null,
        f2Ok: false,
        f3Ok: false,
      };
    }
    if (!isUnicodeScalarString(sourceText)) {
      return {
        refusal: {
          code: "edit-plan.source-unicode-invalid",
          path: ["plan", "source", "quickEntrySnapshot", "sourceText"],
        },
        candidate: null,
        f2Ok: false,
        f3Ok: false,
      };
    }
    if (
      new TextEncoder().encode(sourceText).length >
      EXPECTED_ATOMIC_EDIT_LIMITS.fragmentSourceUtf8Bytes
    ) {
      return {
        refusal: {
          code: "edit-plan.source-utf8-bytes-exceeded",
          path: ["plan", "source", "quickEntrySnapshot", "sourceText"],
        },
        candidate: null,
        f2Ok: false,
        f3Ok: false,
      };
    }
  }
  const missing = firstMissingTarget(before["document"], plan);
  if (missing !== null) {
    return {
      refusal: { code: "edit-plan.target-missing", path: missing },
      candidate: null,
      f2Ok: false,
      f3Ok: false,
    };
  }
  if (plan["kind"] === "insert-fragment") {
    const source = isObject(plan["source"]) ? plan["source"] : {};
    const placement = isObject(plan["placement"]) ? plan["placement"] : {};
    if (
      !canonicalPlacementTargetHasCorrectParent(
        before["document"],
        placement,
      ) ||
      !canonicalPlacementTargetMatches(before["document"], plan) ||
      (source["kind"] === "complete-draft" &&
        !completeDraftIntoMeasureDestinationHolds(before["document"], plan))
    ) {
      return {
        refusal: {
          code: "edit-plan.destination-invalid",
          path: ["plan", "placement"],
        },
        candidate: null,
        f2Ok: false,
        f3Ok: false,
      };
    }
  }
  if (plan["kind"] === "join-event-durations") {
    const left = findEventLocation(before["document"], plan["leftEventId"]);
    const right = findEventLocation(before["document"], plan["rightEventId"]);
    if (
      left === null ||
      right === null ||
      left.measure !== right.measure ||
      right.eventIndex !== left.eventIndex + 1
    ) {
      return {
        refusal: {
          code: "edit-plan.event-order-invalid",
          path: ["plan", "rightEventId"],
        },
        candidate: null,
        f2Ok: false,
        f3Ok: false,
      };
    }
  }
  if (plan["kind"] === "split-section") {
    const section = findSectionLocation(before["document"], plan["sectionId"]);
    const boundaryIndex =
      section?.section === undefined
        ? -1
        : sectionMeasures(section.section).findIndex(
            (measure) => measure["id"] === plan["beforeMeasureId"],
          );
    if (
      section === null ||
      boundaryIndex <= 0 ||
      boundaryIndex >= sectionMeasures(section.section).length
    ) {
      return {
        refusal: {
          code: "edit-plan.section-split-boundary-invalid",
          path: ["plan", "beforeMeasureId"],
        },
        candidate: null,
        f2Ok: false,
        f3Ok: false,
      };
    }
  }
  if (plan["kind"] === "join-sections") {
    const left = findSectionLocation(before["document"], plan["leftSectionId"]);
    const right = findSectionLocation(
      before["document"],
      plan["rightSectionId"],
    );
    if (left === null || right === null || right.index !== left.index + 1) {
      return {
        refusal: {
          code: "edit-plan.section-order-invalid",
          path: ["plan", "rightSectionId"],
        },
        candidate: null,
        f2Ok: false,
        f3Ok: false,
      };
    }
  }
  if (
    plan["kind"] === "insert-fragment" &&
    isObject(plan["source"]) &&
    plan["source"]["kind"] === "recovered-chord" &&
    (!isObject(plan["placement"]) ||
      plan["placement"]["kind"] !== "into-measure")
  ) {
    return {
      refusal: {
        code: "edit-plan.recovered-chord-placement-invalid",
        path: ["plan", "placement"],
      },
      candidate: null,
      f2Ok: false,
      f3Ok: false,
    };
  }
  if (plan["kind"] === "insert-fragment" && isObject(plan["source"])) {
    const source = plan["source"];
    if (
      source["kind"] === "complete-draft" &&
      parserEvidence?.outcome === "failure"
    ) {
      return {
        refusal: {
          code: "edit-plan.syntax-refused",
          path: ["plan", "source", "quickEntrySnapshot", "sourceText"],
        },
        candidate: null,
        f2Ok: false,
        f3Ok: false,
      };
    }
    if (
      source["kind"] === "recovered-chord" &&
      parserEvidence?.outcome === "success"
    ) {
      return {
        refusal: {
          code: "edit-plan.recovered-chord-requires-parse-failure",
          path: ["plan", "source", "kind"],
        },
        candidate: null,
        f2Ok: false,
        f3Ok: false,
      };
    }
    if (
      source["kind"] === "recovered-chord" &&
      !parserEvidence?.insertableRows.some(
        (row) => row["globalOrdinal"] === source["selectedGlobalOrdinal"],
      )
    ) {
      return {
        refusal: {
          code: "edit-plan.recovered-chord-ordinal-missing",
          path: ["plan", "source", "selectedGlobalOrdinal"],
        },
        candidate: null,
        f2Ok: false,
        f3Ok: false,
      };
    }
  }
  const warningMismatch = firstWarningMismatch(
    plan,
    parserEvidence,
    rawParserEvidence,
  );
  if (warningMismatch !== null) {
    return {
      refusal: {
        code: "edit-plan.warning-acknowledgements-mismatch",
        path: warningMismatch,
      },
      candidate: null,
      f2Ok: false,
      f3Ok: false,
    };
  }
  if (
    plan["kind"] === "insert-fragment" &&
    isObject(plan["source"]) &&
    plan["source"]["kind"] === "complete-draft" &&
    !completeDraftStructureMatchesPlacement(parserEvidence, plan["placement"])
  ) {
    return {
      refusal: {
        code: "edit-plan.fragment-placement-mismatch",
        path: ["plan", "placement"],
      },
      candidate: null,
      f2Ok: false,
      f3Ok: false,
    };
  }
  const completionMismatch = firstCompletionMismatch(before["document"], plan);
  if (completionMismatch !== null) {
    return {
      refusal: {
        code: "edit-plan.completion-declarations-mismatch",
        path: completionMismatch,
      },
      candidate: null,
      f2Ok: false,
      f3Ok: false,
    };
  }
  const metadataMismatch = firstSectionMetadataMismatch(
    before["document"],
    plan,
    parserEvidence,
  );
  if (metadataMismatch !== null) {
    return {
      refusal: {
        code: "edit-plan.section-metadata-mismatch",
        path: metadataMismatch,
      },
      candidate: null,
      f2Ok: false,
      f3Ok: false,
    };
  }
  if (
    plan["kind"] === "insert-fragment" &&
    isObject(plan["source"]) &&
    plan["source"]["kind"] === "recovered-chord" &&
    plan["source"]["layoutLossAcknowledgement"] !==
      A0_U1_RECOVERED_CHORD_LAYOUT_LOSS_ACKNOWLEDGEMENT
  ) {
    return {
      refusal: {
        code: "edit-plan.recovered-chord-layout-loss-unacknowledged",
        path: ["plan", "source", "layoutLossAcknowledgement"],
      },
      candidate: null,
      f2Ok: false,
      f3Ok: false,
    };
  }
  const durationRefusal = operationDurationRefusal(
    before["document"],
    plan,
    parserEvidence,
  );
  if (durationRefusal !== null) {
    return {
      refusal: durationRefusal,
      candidate: null,
      f2Ok: false,
      f3Ok: false,
    };
  }
  const collectionRefusal = projectedCollectionRefusal(
    before["document"],
    plan,
    parserEvidence,
  );
  if (collectionRefusal !== null) {
    return {
      refusal: collectionRefusal,
      candidate: null,
      f2Ok: false,
      f3Ok: false,
    };
  }
  const timelineRefusal = timelineLimitRefusal(
    before["document"],
    plan,
    parserEvidence,
  );
  if (timelineRefusal !== null) {
    return {
      refusal: timelineRefusal,
      candidate: null,
      f2Ok: false,
      f3Ok: false,
    };
  }
  const trace = recordsAt(allocationTrace);
  const occupied = new Set([
    isObject(before["document"]) ? String(before["document"]["id"]) : "",
    ...identityRecords(before["document"]).sections,
    ...identityRecords(before["document"]).measures,
    ...identityRecords(before["document"]).events,
  ]);
  const locallyAccepted = new Set<string>();
  for (const row of trace) {
    if (row["outcome"] === "factory-refusal") {
      return {
        refusal: { code: "edit-plan.id-factory-failed", path: ["plan"] },
        candidate: null,
        f2Ok: false,
        f3Ok: false,
      };
    }
    const id = String(row["allocatedId"]);
    if (
      row["outcome"] === "collision-refusal" ||
      occupied.has(id) ||
      locallyAccepted.has(id)
    ) {
      return {
        refusal: { code: "edit-plan.id-collision", path: ["plan"] },
        candidate: null,
        f2Ok: false,
        f3Ok: false,
      };
    }
    locallyAccepted.add(id);
  }
  const expectedKinds = expectedAllocationKinds(command, parserEvidence);
  if (expectedKinds === null || trace.length !== expectedKinds.length) {
    return { refusal: null, candidate: null, f2Ok: false, f3Ok: false };
  }
  const candidate = buildCandidateOracle(
    before["document"],
    command,
    parserEvidence,
    allocationTrace,
  );
  if (candidate === null) {
    return { refusal: null, candidate: null, f2Ok: false, f3Ok: false };
  }
  const decoded = decodeDocumentShape(candidate.document);
  if (!decoded.ok) {
    return {
      refusal: {
        code: "edit-plan.structural-publication-refused",
        path: ["candidate"],
      },
      candidate,
      f2Ok: false,
      f3Ok: false,
    };
  }
  const semantic = validateDocumentSemantics(decoded.value);
  if (!semantic.ok) {
    return {
      refusal: {
        code: "edit-plan.semantic-publication-refused",
        path: ["candidate"],
      },
      candidate,
      f2Ok: true,
      f3Ok: false,
    };
  }
  if (
    isObject(historyEstimatorEvidence) &&
    historyEstimatorEvidence["configuration"] !== "not-reached"
  ) {
    const returned = historyEstimatorEvidence["returned"];
    if (
      !Number.isSafeInteger(returned) ||
      Number(returned) < 0 ||
      Number(returned) > MAX_HISTORY_RETAINED_BYTES
    ) {
      return {
        refusal: { code: "edit-plan.history-refused", path: ["history"] },
        candidate,
        f2Ok: true,
        f3Ok: true,
      };
    }
  }
  return { refusal: null, candidate, f2Ok: true, f3Ok: true };
}

function validateCausalRefusalOracle(
  before: JsonObject,
  command: unknown,
  expected: JsonObject,
  result: JsonObject,
  parserEvidence: ParserEvidenceView | null,
  allocationTrace: unknown,
  path: string,
  findings: A0U1EditPlanContractFinding[],
): CausalOracleResult {
  const oracle = deriveCausalRefusal(
    before,
    command,
    parserEvidence,
    expected["parserEvidence"],
    allocationTrace,
    expected["historyEstimatorEvidence"],
  );
  if (
    isObject(command) &&
    expectedA0EnvelopeFailure(before, command) !== null
  ) {
    return oracle;
  }
  if (oracle.refusal === null) {
    if (
      result["ok"] === false &&
      isObject(result["editPlanRefusal"]) &&
      EXPECTED_NESTED_REFUSAL_PRECEDENCE.includes(
        result["editPlanRefusal"]["code"] as never,
      )
    ) {
      addFinding(
        findings,
        "EDIT_PLAN_CAUSAL_REFUSAL_SPURIOUS",
        path,
        oracle.candidate === null
          ? "The literal evidence does not provide a complete independently executable path to the claimed post-envelope refusal."
          : "Every independently recomputed earlier predicate and both real publication gates pass, so the claimed nested refusal is spurious.",
      );
    }
    validateExactNestedWorkOracle(
      before,
      command,
      expected,
      result,
      parserEvidence,
      allocationTrace,
      oracle,
      path,
      findings,
    );
    return oracle;
  }
  if (result["ok"] !== false || !isObject(result["editPlanRefusal"])) {
    addFinding(
      findings,
      "EDIT_PLAN_CAUSAL_REFUSAL_ACCEPTED",
      path,
      `The independently recomputed first reachable nested refusal is ${oracle.refusal.code}.`,
    );
    validateExactNestedWorkOracle(
      before,
      command,
      expected,
      result,
      parserEvidence,
      allocationTrace,
      oracle,
      path,
      findings,
    );
    return oracle;
  }
  requireExact(
    result["editPlanRefusal"]["code"],
    oracle.refusal.code,
    "EDIT_PLAN_CAUSAL_REFUSAL_CODE",
    `${path}.editPlanRefusal.code`,
    "Nested refusal code must equal the first true predicate in the independent frozen 32-code stage machine.",
    findings,
  );
  requireExact(
    result["editPlanRefusal"]["path"],
    oracle.refusal.path,
    "EDIT_PLAN_CAUSAL_REFUSAL_PATH",
    `${path}.editPlanRefusal.path`,
    "Nested refusal path must be independently derived from the first failing field, target, gate, or dependency.",
    findings,
  );
  validateExactNestedWorkOracle(
    before,
    command,
    expected,
    result,
    parserEvidence,
    allocationTrace,
    oracle,
    path,
    findings,
  );
  return oracle;
}

function finalTimelineDurations(
  document: unknown,
  plan: JsonObject,
  parserEvidence: ParserEvidenceView | null,
): readonly ExactRational[] | null {
  const sections = documentSections(document).map((section) => ({
    id: section["id"],
    measures: sectionMeasures(section).map((measure) => ({
      id: measure["id"],
      events: measureEvents(measure).map((event) => ({
        id: event["id"],
        duration: durationRational(event["duration"]),
      })),
    })),
  }));
  const parserDuration = (row: JsonObject): ExactRational | null => {
    const duration = isObject(row["duration"]) ? row["duration"] : {};
    const source = isObject(plan["source"]) ? plan["source"] : {};
    return durationRational(
      duration["kind"] === "resolved"
        ? duration["value"]
        : source["callerDuration"],
    );
  };
  if (plan["kind"] === "insert-fragment" && isObject(plan["placement"])) {
    const placement = plan["placement"];
    const source = isObject(plan["source"]) ? plan["source"] : {};
    const rows =
      source["kind"] === "recovered-chord"
        ? (parserEvidence?.insertableRows.filter(
            (row) => row["globalOrdinal"] === source["selectedGlobalOrdinal"],
          ) ?? [])
        : (parserEvidence?.insertableRows ?? []);
    if (placement["kind"] === "into-measure") {
      const measure = sections
        .flatMap((section) => section.measures)
        .find((candidate) => candidate.id === placement["measureId"]);
      if (measure === undefined) return null;
      const index =
        placement["beforeEventId"] === null
          ? measure.events.length
          : measure.events.findIndex(
              (event) => event.id === placement["beforeEventId"],
            );
      if (index < 0) return null;
      measure.events.splice(
        index,
        0,
        ...rows.map((row) => ({
          id: null,
          duration: parserDuration(row),
        })),
      );
    } else if (placement["kind"] === "into-section") {
      const section = sections.find(
        (candidate) => candidate.id === placement["sectionId"],
      );
      if (section === undefined) return null;
      const index =
        placement["beforeMeasureId"] === null
          ? section.measures.length
          : section.measures.findIndex(
              (measure) => measure.id === placement["beforeMeasureId"],
            );
      if (index < 0) return null;
      const parserMeasures = (parserEvidence?.measureRows ?? []).map(
        (measure) => ({
          id: null,
          events: rows
            .filter(
              (row) =>
                row["sourceSectionOrdinal"] ===
                  measure["sourceSectionOrdinal"] &&
                row["sourceMeasureOrdinal"] === measure["sourceMeasureOrdinal"],
            )
            .map((row) => ({ id: null, duration: parserDuration(row) })),
        }),
      );
      section.measures.splice(index, 0, ...parserMeasures);
    } else if (placement["kind"] === "into-document") {
      const index =
        placement["beforeSectionId"] === null
          ? sections.length
          : sections.findIndex(
              (section) => section.id === placement["beforeSectionId"],
            );
      if (index < 0) return null;
      const parserSections = (parserEvidence?.sectionRows ?? []).map(
        (section) => ({
          id: null,
          measures: (parserEvidence?.measureRows ?? [])
            .filter(
              (measure) =>
                measure["sourceSectionOrdinal"] ===
                section["sourceSectionOrdinal"],
            )
            .map((measure) => ({
              id: null,
              events: rows
                .filter(
                  (row) =>
                    row["sourceSectionOrdinal"] ===
                      measure["sourceSectionOrdinal"] &&
                    row["sourceMeasureOrdinal"] ===
                      measure["sourceMeasureOrdinal"],
                )
                .map((row) => ({
                  id: null,
                  duration: parserDuration(row),
                })),
            })),
        }),
      );
      sections.splice(index, 0, ...parserSections);
    }
  } else if (plan["kind"] === "split-event-duration") {
    for (const section of sections) {
      for (const measure of section.measures) {
        const index = measure.events.findIndex(
          (event) => event.id === plan["eventId"],
        );
        if (index >= 0) {
          measure.events.splice(
            index,
            1,
            {
              id: plan["eventId"],
              duration: durationRational(plan["firstDuration"]),
            },
            { id: null, duration: durationRational(plan["secondDuration"]) },
          );
        }
      }
    }
  } else if (plan["kind"] === "join-event-durations") {
    for (const section of sections) {
      for (const measure of section.measures) {
        const index = measure.events.findIndex(
          (event) => event.id === plan["leftEventId"],
        );
        if (index >= 0) {
          measure.events.splice(index, 2, {
            id: plan["leftEventId"],
            duration: durationRational(plan["joinedDuration"]),
          });
        }
      }
    }
  }
  const durations = sections.flatMap((section) =>
    section.measures.flatMap((measure) =>
      measure.events.map((event) => event.duration),
    ),
  );
  return durations.some((duration) => duration === null)
    ? null
    : (durations as ExactRational[]);
}

function boundaryMapperForWork(
  before: JsonObject,
  plan: JsonObject,
  candidate: CandidateOracleResult,
): (boundary: JsonObject) => JsonObject | null {
  if (plan["kind"] === "split-event-duration") {
    const fresh = candidate.allocatedIdentities.find(
      (row) => row["kind"] === "event",
    );
    return (boundary) =>
      fresh !== undefined &&
      jsonDeepEqual(boundary, {
        kind: "after-event",
        eventId: plan["eventId"],
      })
        ? { kind: "after-event", eventId: fresh["id"] }
        : cloneJson(boundary);
  }
  if (plan["kind"] === "join-event-durations") {
    return (boundary) => {
      if (
        jsonDeepEqual(boundary, {
          kind: "before-event",
          eventId: plan["rightEventId"],
        }) ||
        jsonDeepEqual(boundary, {
          kind: "after-event",
          eventId: plan["leftEventId"],
        })
      ) {
        return null;
      }
      return jsonDeepEqual(boundary, {
        kind: "after-event",
        eventId: plan["rightEventId"],
      })
        ? { kind: "after-event", eventId: plan["leftEventId"] }
        : cloneJson(boundary);
    };
  }
  if (plan["kind"] === "split-section") {
    const fresh = candidate.allocatedIdentities.find(
      (row) => row["kind"] === "section",
    );
    return (boundary) => {
      if (
        fresh !== undefined &&
        boundary["sectionId"] === plan["sectionId"] &&
        (boundary["kind"] === "after-section" ||
          boundary["kind"] === "section-end")
      ) {
        return { kind: boundary["kind"], sectionId: fresh["id"] };
      }
      return cloneJson(boundary);
    };
  }
  if (plan["kind"] === "join-sections") {
    const right = findSectionLocation(
      before["document"],
      plan["rightSectionId"],
    );
    const firstMeasure =
      right === null ? null : (sectionMeasures(right.section)[0] ?? null);
    return (boundary) => {
      const kind = boundary["kind"];
      const sectionId = boundary["sectionId"];
      if (
        sectionId === plan["leftSectionId"] &&
        (kind === "after-section" || kind === "section-end")
      ) {
        return firstMeasure === null
          ? cloneJson(boundary)
          : { kind: "before-measure", measureId: firstMeasure["id"] };
      }
      if (
        sectionId === plan["rightSectionId"] &&
        (kind === "before-section" || kind === "section-start")
      ) {
        return firstMeasure === null
          ? { kind: "section-end", sectionId: plan["leftSectionId"] }
          : { kind: "before-measure", measureId: firstMeasure["id"] };
      }
      if (
        sectionId === plan["rightSectionId"] &&
        (kind === "after-section" || kind === "section-end")
      ) {
        return { kind, sectionId: plan["leftSectionId"] };
      }
      return cloneJson(boundary);
    };
  }
  return (boundary) => cloneJson(boundary);
}

function independentBookmarksAfterPlan(
  before: JsonObject,
  plan: JsonObject,
  candidate: CandidateOracleResult,
): Readonly<{
  bookmarks: JsonObject;
  examined: number;
  rewritten: number;
}> {
  const bookmarks = isObject(before["bookmarks"]) ? before["bookmarks"] : {};
  const afterBookmarks = cloneJson(bookmarks);
  const selection = isObject(bookmarks["selection"])
    ? bookmarks["selection"]
    : {};
  const examined =
    1 +
    (selection["kind"] === "events" && Array.isArray(selection["eventIds"])
      ? selection["eventIds"].length
      : 0) +
    (bookmarks["insertion"] === null ? 0 : 1) +
    (bookmarks["range"] === null ? 0 : 2);
  let rewritten =
    plan["kind"] === "join-event-durations" &&
    Array.isArray(selection["eventIds"]) &&
    selection["eventIds"].includes(plan["rightEventId"])
      ? 1
      : 0;
  if (
    plan["kind"] === "join-event-durations" &&
    selection["kind"] === "events" &&
    Array.isArray(selection["eventIds"])
  ) {
    const replace = (id: unknown): unknown =>
      id === plan["rightEventId"] ? plan["leftEventId"] : id;
    const eventIds = deduplicateInDocumentOrder(
      selection["eventIds"].map(replace),
      candidate.document,
    );
    afterBookmarks["selection"] =
      eventIds.length === 0
        ? { kind: "none" }
        : {
            kind: "events",
            eventIds,
            anchorEventId: replace(selection["anchorEventId"]) ?? eventIds[0],
            focusEventId: replace(selection["focusEventId"]) ?? eventIds.at(-1),
          };
  }
  if (plan["kind"] === "insert-fragment") {
    const placement = isObject(plan["placement"]) ? plan["placement"] : {};
    const kind =
      placement["kind"] === "into-measure"
        ? "event"
        : placement["kind"] === "into-section"
          ? "measure"
          : "section";
    const last = [...candidate.allocatedIdentities]
      .reverse()
      .find((row) => row["kind"] === kind);
    const target =
      last === undefined
        ? null
        : kind === "event"
          ? { kind: "after-event", eventId: last["id"] }
          : kind === "measure"
            ? { kind: "after-measure", measureId: last["id"] }
            : { kind: "after-section", sectionId: last["id"] };
    if (!jsonDeepEqual(bookmarks["insertion"], target)) rewritten += 1;
    afterBookmarks["insertion"] = target;
    return { bookmarks: afterBookmarks, examined, rewritten };
  }
  const mapBoundary = boundaryMapperForWork(before, plan, candidate);
  if (isObject(bookmarks["insertion"])) {
    const mapped = mapBoundary(bookmarks["insertion"]);
    if (mapped === null || !jsonDeepEqual(mapped, bookmarks["insertion"])) {
      rewritten += 1;
    }
    afterBookmarks["insertion"] = mapped;
  }
  if (isObject(bookmarks["range"])) {
    const anchor = isObject(bookmarks["range"]["anchor"])
      ? mapBoundary(bookmarks["range"]["anchor"])
      : null;
    const focus = isObject(bookmarks["range"]["focus"])
      ? mapBoundary(bookmarks["range"]["focus"])
      : null;
    if (anchor === null || focus === null) {
      rewritten += 1;
      afterBookmarks["range"] = null;
    } else {
      if (!jsonDeepEqual(anchor, bookmarks["range"]["anchor"])) rewritten += 1;
      if (!jsonDeepEqual(focus, bookmarks["range"]["focus"])) rewritten += 1;
      afterBookmarks["range"] = { anchor, focus };
    }
  }
  return { bookmarks: afterBookmarks, examined, rewritten };
}

function independentlyProposedHistoryEntry(
  before: JsonObject,
  command: JsonObject,
  candidate: CandidateOracleResult,
): JsonObject | null {
  const plan = isObject(command["plan"]) ? command["plan"] : null;
  if (plan === null) return null;
  const afterBookmarks = independentBookmarksAfterPlan(
    before,
    plan,
    candidate,
  ).bookmarks;
  return {
    commandId: command["id"],
    commandKind: "apply-edit-plan",
    label: command["label"],
    before: before["document"],
    after: candidate.document,
    beforeBookmarks: before["bookmarks"],
    afterBookmarks,
    retainedBytesEstimate: 0,
    coalescing: null,
    firstLogicalTimeMs: command["logicalTimeMs"],
    lastLogicalTimeMs: command["logicalTimeMs"],
  };
}

function validateHistoryEstimatorEvidence(
  before: JsonObject,
  command: unknown,
  expected: JsonObject,
  phase: unknown,
  oracle: CausalOracleResult | null,
  path: string,
  findings: A0U1EditPlanContractFinding[],
): void {
  const evidence = expected["historyEstimatorEvidence"];
  if (phase === "undo" || phase === "redo") {
    requireExact(
      evidence,
      null,
      "EDIT_PLAN_HISTORY_ESTIMATOR_REPLAY_SCOPE",
      path,
      "Undo and redo move an existing retained row and carry no estimator dependency evidence.",
      findings,
    );
    return;
  }
  if (!isObject(evidence)) {
    addFinding(
      findings,
      "EDIT_PLAN_HISTORY_ESTIMATOR_EVIDENCE",
      path,
      "Every apply transition requires exact history-estimator dependency evidence.",
    );
    return;
  }
  checkExactKeys(
    evidence,
    EXPECTED_HISTORY_ESTIMATOR_EVIDENCE_KEYS,
    "EDIT_PLAN_HISTORY_ESTIMATOR_KEYS",
    path,
    findings,
  );
  if (
    !EXPECTED_HISTORY_ESTIMATOR_CONFIGURATIONS.includes(
      evidence["configuration"] as never,
    )
  ) {
    addFinding(
      findings,
      "EDIT_PLAN_HISTORY_ESTIMATOR_CONFIGURATION",
      `${path}.configuration`,
      "History-estimator evidence uses an unknown dependency configuration.",
    );
  }
  const reachedHistory =
    oracle !== null && oracle.candidate !== null && oracle.f2Ok && oracle.f3Ok;
  if (!reachedHistory) {
    requireExact(
      evidence,
      {
        configuration: "not-reached",
        callsObserved: 0,
        returned: null,
        independentlyRecomputed: null,
      },
      "EDIT_PLAN_HISTORY_ESTIMATOR_NOT_REACHED",
      path,
      "Any refusal before successful F2 and F3 must make no history-estimator call.",
      findings,
    );
    return;
  }
  if (!isObject(command)) return;
  if (
    ![
      "independent-policy",
      "hostile-over-cap",
      "hostile-invalid-negative",
    ].includes(String(evidence["configuration"]))
  ) {
    addFinding(
      findings,
      "EDIT_PLAN_HISTORY_ESTIMATOR_REACHED_CONFIGURATION",
      `${path}.configuration`,
      "A reached history stage must use the independent policy or one explicit hostile dependency configuration.",
    );
  }
  const proposed = independentlyProposedHistoryEntry(
    before,
    command,
    oracle.candidate,
  );
  if (proposed === null) return;
  const independentlyRecomputed = independentHistoryEntryBytes(proposed);
  requireExact(
    evidence["callsObserved"],
    1,
    "EDIT_PLAN_HISTORY_ESTIMATOR_CALLS",
    `${path}.callsObserved`,
    "A transition reaching history invokes the retained-byte estimator exactly once.",
    findings,
  );
  requireExact(
    evidence["independentlyRecomputed"],
    independentlyRecomputed,
    "EDIT_PLAN_HISTORY_ESTIMATOR_INDEPENDENT_RECOMPUTATION",
    `${path}.independentlyRecomputed`,
    "The normal-policy comparison must equal an independent traversal of the exact proposed history entry.",
    findings,
  );
  const configuration = evidence["configuration"];
  const expectedReturned =
    configuration === "independent-policy"
      ? independentlyRecomputed
      : configuration === "hostile-over-cap"
        ? MAX_HISTORY_RETAINED_BYTES + 1
        : configuration === "hostile-invalid-negative"
          ? -1
          : null;
  requireExact(
    evidence["returned"],
    expectedReturned,
    "EDIT_PLAN_HISTORY_ESTIMATOR_RETURNED",
    `${path}.returned`,
    "Estimator return must equal the independent policy result or the exact reviewed hostile dependency witness.",
    findings,
  );
}

function metadataWorkThroughPath(
  plan: JsonObject,
  stopPath: readonly (string | number)[] | null,
): Readonly<{
  fieldsCompared: number;
  codePointsObserved: number;
}> {
  if (
    stopPath !== null &&
    stopPath[0] === "plan" &&
    (stopPath.length === 1 ||
      (stopPath.length === 2 &&
        typeof stopPath[1] === "string" &&
        !Object.hasOwn(plan, stopPath[1])))
  ) {
    return { fieldsCompared: 0, codePointsObserved: 0 };
  }
  const metadataRoots =
    plan["kind"] === "split-section"
      ? ["newSectionMetadata"]
      : plan["kind"] === "join-sections"
        ? ["expectedLeftMetadata", "expectedRightMetadata", "resultMetadata"]
        : [];
  const topLevelOrder: readonly string[] =
    plan["kind"] === "insert-fragment"
      ? ["kind", "source", "placement", "voicingPolicy"]
      : plan["kind"] === "split-event-duration"
        ? [
            "kind",
            "eventId",
            "firstDuration",
            "secondDuration",
            "completionDeclarations",
            "identityPolicy",
            "contentPolicy",
            "annotationPolicy",
          ]
        : plan["kind"] === "join-event-durations"
          ? [
              "kind",
              "leftEventId",
              "rightEventId",
              "joinedDuration",
              "completionDeclarations",
              "identityPolicy",
              "contentPolicy",
              "annotationPolicy",
            ]
          : plan["kind"] === "split-section"
            ? [
                "kind",
                "sectionId",
                "beforeMeasureId",
                "newSectionMetadata",
                "completionDeclarations",
                "identityPolicy",
                "measurePolicy",
              ]
            : [
                "kind",
                "leftSectionId",
                "rightSectionId",
                "expectedLeftMetadata",
                "expectedRightMetadata",
                "resultMetadata",
                "completionDeclarations",
                "identityPolicy",
                "measurePolicy",
                "metadataPolicy",
                "internalBoundaryPolicy",
              ];
  const stopTop = typeof stopPath?.[1] === "string" ? stopPath[1] : null;
  const stopTopIndex =
    stopTop === null
      ? Number.POSITIVE_INFINITY
      : topLevelOrder.indexOf(stopTop);
  let fieldsCompared = 0;
  let codePointsObserved = 0;
  for (const root of metadataRoots) {
    const rootIndex = topLevelOrder.indexOf(root);
    if (stopTopIndex < rootIndex) break;
    const value = plan[root];
    if (stopTop === root && stopPath?.length === 2) break;
    if (!isObject(value)) break;
    const fieldOrder = [
      "name",
      "annotation",
      "keyOverride",
      "voiceLeadingBoundary",
    ] as const;
    const stopField =
      stopTop === root && typeof stopPath?.[2] === "string"
        ? stopPath[2]
        : null;
    for (const field of fieldOrder) {
      if (
        stopField !== null &&
        fieldOrder.indexOf(field) > fieldOrder.indexOf(stopField as never)
      ) {
        break;
      }
      fieldsCompared += 1;
      if (field === "name" || field === "annotation") {
        const maximum =
          field === "name"
            ? MAX_SHORT_TEXT_CODE_POINTS
            : MAX_LONG_TEXT_CODE_POINTS;
        if (typeof value[field] !== "string") {
          return { fieldsCompared, codePointsObserved };
        }
        const observed = Math.min(codePointLength(value[field]), maximum + 1);
        codePointsObserved += observed;
        if (
          !isUnicodeScalarString(value[field]) ||
          codePointLength(value[field]) > maximum ||
          (field === "name" && value[field].trim().length === 0)
        ) {
          return { fieldsCompared, codePointsObserved };
        }
      }
      if (stopField === field) {
        return { fieldsCompared, codePointsObserved };
      }
    }
  }
  const completionTopIndex =
    plan["kind"] === "insert-fragment"
      ? topLevelOrder.indexOf("placement")
      : topLevelOrder.indexOf("completionDeclarations");
  const stopIsInsideCompletion =
    stopTop === "completionDeclarations" ||
    (stopTop === "placement" && stopPath?.includes("completionDeclarations"));
  const completionReached =
    stopPath === null ||
    stopTopIndex > completionTopIndex ||
    stopIsInsideCompletion;
  if (!completionReached) return { fieldsCompared, codePointsObserved };
  const declarations = planCompletionDeclarations(plan);
  /*
   * R1: rows within the shape horizon are validated completely before the
   * completion-comparison stage. A stop path ending at a bare row index is
   * that later mismatch stage (every row's reason was already scanned); a
   * deeper stop path is a shape refusal that ends scanning at its row.
   */
  const stopRowIndex = stopIsInsideCompletion
    ? stopPath?.find(
        (segment): segment is number => typeof segment === "number",
      )
    : undefined;
  const stopEndsAtRow =
    stopIsInsideCompletion &&
    stopRowIndex !== undefined &&
    stopPath?.[stopPath.length - 1] === stopRowIndex;
  for (const [index, declaration] of declarations.entries()) {
    const completion = isObject(declaration["completion"])
      ? declaration["completion"]
      : null;
    if (
      completion?.["kind"] !== "pickup" &&
      completion?.["kind"] !== "incomplete"
    ) {
      continue;
    }
    if (stopIsInsideCompletion && !stopEndsAtRow) {
      if (stopRowIndex === undefined || index > stopRowIndex) {
        return { fieldsCompared, codePointsObserved };
      }
      if (index === stopRowIndex && stopPath?.includes("reason") !== true) {
        return { fieldsCompared, codePointsObserved };
      }
    }
    const reason = completion["reason"];
    if (typeof reason !== "string")
      return { fieldsCompared, codePointsObserved };
    codePointsObserved += Math.min(
      codePointLength(reason),
      MAX_LONG_TEXT_CODE_POINTS + 1,
    );
    if (
      !isUnicodeScalarString(reason) ||
      codePointLength(reason) > MAX_LONG_TEXT_CODE_POINTS ||
      reason.trim().length === 0
    ) {
      return { fieldsCompared, codePointsObserved };
    }
    if (stopIsInsideCompletion && !stopEndsAtRow && index === stopRowIndex) {
      return { fieldsCompared, codePointsObserved };
    }
  }
  return { fieldsCompared, codePointsObserved };
}

function deriveExactNestedWork(
  before: JsonObject,
  command: JsonObject,
  expected: JsonObject,
  parserEvidence: ParserEvidenceView | null,
  allocationTrace: unknown,
  oracle: CausalOracleResult,
): JsonObject {
  const counters: JsonObject = Object.fromEntries(
    A0_U1_ATOMIC_EDIT_WORK_COUNTER_NAMES.map((name) => [name, 0]),
  );
  const code = oracle.refusal?.code ?? null;
  const codeIndex =
    code === null
      ? EXPECTED_NESTED_REFUSAL_PRECEDENCE.length
      : EXPECTED_NESTED_REFUSAL_PRECEDENCE.indexOf(code);
  /*
   * Named precedence bands. These were numeric literals until the sixth plan
   * variant inserted two codes mid-list and silently shifted every later index;
   * deriving the bounds from the code names keeps the windows correct under any
   * future insertion instead of failing three unrelated join witnesses.
   */
  const bandIndex = (name: string): number => {
    const index = EXPECTED_NESTED_REFUSAL_PRECEDENCE.indexOf(name as never);
    if (index < 0) throw new Error(`A0U1_UNKNOWN_PRECEDENCE_BAND_${name}`);
    return index;
  };
  const TARGET_AND_DESTINATION_BAND = Object.freeze({
    first: bandIndex("edit-plan.target-missing"),
    last: bandIndex("edit-plan.section-order-invalid"),
  });
  const OPERATION_LAW_DURATION_BAND = Object.freeze({
    first: bandIndex("edit-plan.duration-invalid"),
    last: bandIndex("edit-plan.right-annotation-not-empty"),
  });
  const expectedResult = isObject(expected["result"])
    ? expected["result"]
    : {};
  const expectedNested = isObject(expectedResult["editPlanRefusal"])
    ? expectedResult["editPlanRefusal"]
    : {};
  const retainedLiteralDiagnostics = recordsAt(
    expectedNested["diagnostics"],
  ).length;
  const retainDiagnostics = (count: number): void => {
    counters["peakDiagnosticRecords"] = Math.max(
      Number(counters["peakDiagnosticRecords"]),
      Math.min(
        Math.max(count, retainedLiteralDiagnostics),
        EXPECTED_ATOMIC_EDIT_LIMITS.retainedDiagnostics,
      ),
    );
  };
  if (code === "edit-plan.command-shape-invalid") {
    counters["planNodesVisited"] = 1;
    counters["peakPlanNodeRecords"] = 1;
    retainDiagnostics(1);
    return { ...counters, termination: "input-refusal" };
  }
  counters["planNodesVisited"] = 1;
  counters["peakPlanNodeRecords"] = 1;
  const plan = isObject(command["plan"]) ? command["plan"] : {};
  const metadataStop =
    code === "edit-plan.plan-shape-invalid"
      ? (oracle.refusal?.path ?? null)
      : null;
  const metadata = metadataWorkThroughPath(plan, metadataStop);
  counters["metadataFieldsCompared"] = metadata.fieldsCompared;
  counters["metadataCodePointsObserved"] = metadata.codePointsObserved;
  if (code === "edit-plan.plan-shape-invalid") {
    retainDiagnostics(1);
    return { ...counters, termination: "input-refusal" };
  }
  if (plan["kind"] === "insert-fragment") {
    const mismatch = firstSnapshotMismatch(command, before);
    const source = isObject(plan["source"]) ? plan["source"] : {};
    const snapshot = isObject(source["quickEntrySnapshot"])
      ? source["quickEntrySnapshot"]
      : {};
    const issueCount = Array.isArray(snapshot["issueCodes"])
      ? snapshot["issueCodes"].length
      : 0;
    counters["quickEntrySnapshotFieldsCompared"] =
      mismatch?.fieldsCompared ?? 6;
    counters["quickEntryIssueCodesCompared"] =
      mismatch?.issueCodesCompared ?? issueCount;
    if (code === "edit-plan.quick-entry-snapshot-mismatch") {
      retainDiagnostics(1);
      return { ...counters, termination: "input-refusal" };
    }
    const text = String(snapshot["sourceText"]);
    counters["sourceCodePointsObserved"] = Math.min(
      codePointLength(text),
      EXPECTED_ATOMIC_EDIT_LIMITS.fragmentSourceCodePoints + 1,
    );
    if (code === "edit-plan.source-code-points-exceeded") {
      retainDiagnostics(1);
      return { ...counters, termination: "input-refusal" };
    }
    if (code === "edit-plan.source-unicode-invalid") {
      retainDiagnostics(1);
      return { ...counters, termination: "input-refusal" };
    }
    counters["sourceUtf8BytesObserved"] = Math.min(
      new TextEncoder().encode(text).length,
      EXPECTED_ATOMIC_EDIT_LIMITS.fragmentSourceUtf8Bytes + 1,
    );
    if (code === "edit-plan.source-utf8-bytes-exceeded") {
      retainDiagnostics(1);
      return { ...counters, termination: "input-refusal" };
    }
  }
  if (
    codeIndex >= TARGET_AND_DESTINATION_BAND.first &&
    codeIndex <= TARGET_AND_DESTINATION_BAND.last
  ) {
    retainDiagnostics(1);
    return { ...counters, termination: "input-refusal" };
  }
  if (
    plan["kind"] === "insert-fragment" &&
    isObject(plan["source"]) &&
    plan["source"]["kind"] === "recovered-chord"
  ) {
    counters["recoveryFieldsCompared"] = 1;
    if (code === "edit-plan.recovered-chord-placement-invalid") {
      retainDiagnostics(1);
      return { ...counters, termination: "input-refusal" };
    }
  }
  if (plan["kind"] === "insert-fragment") {
    counters["syntaxParseCalls"] = 1;
    const source = isObject(plan["source"]) ? plan["source"] : {};
    const retainedParserRecords =
      parserEvidence?.outcome === "success"
        ? parserEvidence.sectionRows.length +
          parserEvidence.measureRows.length +
          parserEvidence.allEventSlots.length
        : source["kind"] === "recovered-chord"
          ? (parserEvidence?.insertableRows.length ?? 0)
          : 0;
    counters["peakPlanNodeRecords"] = Math.max(
      Number(counters["peakPlanNodeRecords"]),
      1 + retainedParserRecords,
    );
    const parserDiagnosticCount = recordsAt(
      isObject(expected["parserEvidence"])
        ? expected["parserEvidence"]["diagnosticRows"]
        : undefined,
    ).length;
    if (parserEvidence?.outcome === "failure") {
      retainDiagnostics(parserDiagnosticCount);
    }
    if (source["kind"] === "recovered-chord") {
      if (code === "edit-plan.recovered-chord-requires-parse-failure") {
        retainDiagnostics(1);
        return { ...counters, termination: "input-refusal" };
      }
      const selectedIndex =
        parserEvidence?.insertableRows.findIndex(
          (row) => row["globalOrdinal"] === source["selectedGlobalOrdinal"],
        ) ?? -1;
      const examined =
        selectedIndex < 0
          ? (parserEvidence?.insertableRows.length ?? 0)
          : selectedIndex + 1;
      counters["insertableChordsExamined"] = examined;
      counters["planNodesVisited"] =
        Number(counters["planNodesVisited"]) + examined;
      counters["recoveryFieldsCompared"] = 2;
      if (code === "edit-plan.recovered-chord-ordinal-missing") {
        retainDiagnostics(1);
        return { ...counters, termination: "input-refusal" };
      }
    } else if (code === "edit-plan.syntax-refused") {
      retainDiagnostics(parserDiagnosticCount);
      return { ...counters, termination: "input-refusal" };
    }
  }
  if (plan["kind"] === "insert-fragment" && isObject(plan["source"])) {
    if (plan["source"]["kind"] === "complete-draft") {
      const acknowledgements = recordsAt(
        plan["source"]["warningAcknowledgements"],
      );
      const warnings = recordsAt(
        isObject(expected["parserEvidence"])
          ? expected["parserEvidence"]["warningRows"]
          : undefined,
      );
      const mismatch = firstSequenceMismatchIndex(acknowledgements, warnings);
      counters["warningAcknowledgementsCompared"] =
        mismatch === null ? acknowledgements.length : mismatch + 1;
      if (code === "edit-plan.warning-acknowledgements-mismatch") {
        retainDiagnostics(1);
        return { ...counters, termination: "input-refusal" };
      }
      const sections = parserEvidence?.sectionRows.length ?? 0;
      const measures = parserEvidence?.measureRows.length ?? 0;
      const events = parserEvidence?.allEventSlots.length ?? 0;
      counters["draftSectionsVisited"] = sections;
      counters["draftMeasuresVisited"] = measures;
      counters["draftEventsVisited"] = events;
      counters["planNodesVisited"] =
        Number(counters["planNodesVisited"]) + sections + measures + events;
      counters["peakPlanNodeRecords"] = counters["planNodesVisited"];
      if (code === "edit-plan.fragment-placement-mismatch") {
        retainDiagnostics(1);
        return { ...counters, termination: "input-refusal" };
      }
    }
  }
  const declarations = planCompletionDeclarations(plan);
  const expectedDeclarations = expectedCompletionDeclarations(
    before["document"],
    plan,
  );
  const declarationMismatch =
    expectedDeclarations === null
      ? 0
      : firstSequenceMismatchIndex(declarations, expectedDeclarations);
  counters["completionDeclarationsVisited"] =
    declarationMismatch === null
      ? declarations.length
      : Math.min(declarations.length, declarationMismatch + 1);
  if (
    code === "edit-plan.completion-declarations-mismatch" ||
    code === "edit-plan.section-metadata-mismatch"
  ) {
    retainDiagnostics(1);
    return { ...counters, termination: "input-refusal" };
  }
  if (
    plan["kind"] === "insert-fragment" &&
    isObject(plan["source"]) &&
    plan["source"]["kind"] === "recovered-chord"
  ) {
    counters["recoveryFieldsCompared"] =
      code === "edit-plan.recovered-chord-layout-loss-unacknowledged" ? 3 : 4;
    if (
      code === "edit-plan.recovered-chord-layout-loss-unacknowledged" ||
      code === "edit-plan.recovered-chord-duration-mismatch"
    ) {
      retainDiagnostics(1);
      return { ...counters, termination: "input-refusal" };
    }
  }
  if (
    plan["kind"] === "split-event-duration" ||
    plan["kind"] === "join-event-durations"
  ) {
    if (code !== "edit-plan.duration-invalid") {
      counters["exactBeatAdditions"] = 1;
      counters["exactBeatComparisons"] = 1;
    }
  }
  if (
    codeIndex >= OPERATION_LAW_DURATION_BAND.first &&
    codeIndex <= OPERATION_LAW_DURATION_BAND.last
  ) {
    retainDiagnostics(1);
    return { ...counters, termination: "input-refusal" };
  }
  if (code === "edit-plan.collection-limit-exceeded") {
    retainDiagnostics(1);
    return { ...counters, termination: "input-refusal" };
  }
  const durations = finalTimelineDurations(
    before["document"],
    plan,
    parserEvidence,
  );
  if (durations !== null) {
    let total: ExactRational = Object.freeze({
      numerator: 0n,
      denominator: 1n,
    });
    for (const duration of durations) {
      total = addRationals(total, duration);
      counters["exactBeatAdditions"] =
        Number(counters["exactBeatAdditions"]) + 1;
      counters["exactBeatComparisons"] =
        Number(counters["exactBeatComparisons"]) + 1;
      if (
        total.numerator >
        BigInt(EXPECTED_ATOMIC_EDIT_LIMITS.finalTimelineQuarterNoteBeats) *
          total.denominator
      ) {
        break;
      }
    }
  }
  if (code === "edit-plan.timeline-limit-exceeded") {
    retainDiagnostics(1);
    return { ...counters, termination: "input-refusal" };
  }
  const trace = recordsAt(allocationTrace);
  counters["idAllocationAttempts"] = trace.length;
  counters["idCollisionChecks"] = trace.filter(
    (row) => row["outcome"] !== "factory-refusal",
  ).length;
  counters["peakAllocatedIdRecords"] = trace.filter(
    (row) => row["outcome"] === "accepted",
  ).length;
  if (
    code === "edit-plan.id-factory-failed" ||
    code === "edit-plan.id-collision"
  ) {
    retainDiagnostics(1);
    return { ...counters, termination: "allocation-refusal" };
  }
  counters["structuralDecodeCalls"] = 1;
  if (code === "edit-plan.structural-publication-refused") {
    const decoded =
      oracle.candidate === null
        ? null
        : decodeDocumentShape(oracle.candidate.document);
    retainDiagnostics(
      decoded !== null && !decoded.ok ? decoded.errors.length : 1,
    );
    return { ...counters, termination: "publication-refusal" };
  }
  counters["semanticValidationCalls"] = 1;
  if (code === "edit-plan.semantic-publication-refused") {
    const decoded =
      oracle.candidate === null
        ? null
        : decodeDocumentShape(oracle.candidate.document);
    const semantic =
      decoded !== null && decoded.ok
        ? validateDocumentSemantics(decoded.value)
        : null;
    retainDiagnostics(
      semantic !== null && !semantic.ok ? semantic.errors.length : 1,
    );
    return { ...counters, termination: "publication-refusal" };
  }
  if (oracle.candidate !== null) {
    const bookmark = independentBookmarksAfterPlan(
      before,
      plan,
      oracle.candidate,
    );
    counters["bookmarkRecordsExamined"] = bookmark.examined;
    counters["bookmarkRecordsRewritten"] = bookmark.rewritten;
  }
  if (code === "edit-plan.history-refused") {
    retainDiagnostics(1);
    return { ...counters, termination: "history-refusal" };
  }
  return { ...counters, termination: "complete" };
}

function validateExactNestedWorkOracle(
  before: JsonObject,
  command: unknown,
  expected: JsonObject,
  result: JsonObject,
  parserEvidence: ParserEvidenceView | null,
  allocationTrace: unknown,
  oracle: CausalOracleResult,
  path: string,
  findings: A0U1EditPlanContractFinding[],
): void {
  if (!isObject(command)) return;
  const expectedWork = deriveExactNestedWork(
    before,
    command,
    expected,
    parserEvidence,
    allocationTrace,
    oracle,
  );
  const observedWork =
    result["ok"] === true
      ? isObject(result["editPlanReceipt"])
        ? result["editPlanReceipt"]["work"]
        : null
      : isObject(result["editPlanRefusal"])
        ? result["editPlanRefusal"]["work"]
        : null;
  requireExact(
    observedWork,
    expectedWork,
    "EDIT_PLAN_EXACT_STAGE_WORK_ORACLE",
    `${path}.${result["ok"] === true ? "editPlanReceipt.work" : "editPlanRefusal.work"}`,
    "The complete nested work record must equal one independently derived mutable trace through the first reached refusal or successful publication.",
    findings,
  );
  const expectedOuterValidationCalls =
    oracle.refusal?.code === "edit-plan.semantic-publication-refused" ||
    oracle.refusal?.code === "edit-plan.history-refused" ||
    (oracle.refusal === null && oracle.f3Ok)
      ? 1
      : 0;
  const outer = isObject(expected["counters"])
    ? expected["counters"]["outer"]
    : null;
  requireExact(
    isObject(outer) ? outer["validationCalls"] : undefined,
    expectedOuterValidationCalls,
    "EDIT_PLAN_OUTER_VALIDATION_CALL_ORACLE",
    `${path}.counters.outer.validationCalls`,
    "The inherited A0 validation counter increments once only after F2 succeeds and F3 is invoked.",
    findings,
  );
}

type OuterIndexCounts = Readonly<{
  sectionsVisited: number;
  measuresVisited: number;
  eventsVisited: number;
  stableIdsIndexed: number;
}>;

function outerIndexCounts(document: unknown): OuterIndexCounts {
  const sections = documentSections(document);
  const measures = sections.flatMap(sectionMeasures);
  const events = measures.flatMap(measureEvents);
  return Object.freeze({
    sectionsVisited: sections.length,
    measuresVisited: measures.length,
    eventsVisited: events.length,
    stableIdsIndexed: sections.length + measures.length + events.length,
  });
}

function addOuterIndexCounts(
  left: OuterIndexCounts,
  right: OuterIndexCounts,
): OuterIndexCounts {
  return Object.freeze({
    sectionsVisited: left.sectionsVisited + right.sectionsVisited,
    measuresVisited: left.measuresVisited + right.measuresVisited,
    eventsVisited: left.eventsVisited + right.eventsVisited,
    stableIdsIndexed: left.stableIdsIndexed + right.stableIdsIndexed,
  });
}

const ZERO_OUTER_INDEX_COUNTS: OuterIndexCounts = Object.freeze({
  sectionsVisited: 0,
  measuresVisited: 0,
  eventsVisited: 0,
  stableIdsIndexed: 0,
});

function expectedHistoryOuterCode(returned: unknown): string | null {
  if (!Number.isSafeInteger(returned) || Number(returned) < 0) {
    return A0_U1_ATOMIC_EDIT_HISTORY_REFUSAL_POLICY.invalidEstimate.outerCode;
  }
  return Number(returned) >
    A0_U1_ATOMIC_EDIT_HISTORY_REFUSAL_POLICY.oversizedEstimate.maximum
    ? A0_U1_ATOMIC_EDIT_HISTORY_REFUSAL_POLICY.oversizedEstimate.outerCode
    : null;
}

function validateExactOuterWorkOracle(
  before: JsonObject,
  after: JsonObject,
  command: unknown,
  expected: JsonObject,
  result: JsonObject,
  phase: unknown,
  oracle: CausalOracleResult | null,
  path: string,
  findings: A0U1EditPlanContractFinding[],
): void {
  const outer = isObject(expected["counters"])
    ? expected["counters"]["outer"]
    : null;
  let indexCounts = ZERO_OUTER_INDEX_COUNTS;
  let historyEntriesVisited = 0;
  let historyBytesEstimated = 0;
  let bookmarksRepaired = 0;
  let validationCalls = 0;

  if (phase === "undo" || phase === "redo") {
    indexCounts = outerIndexCounts(after["document"]);
    historyEntriesVisited = 1;
  } else if (phase === "apply" && isObject(command) && oracle !== null) {
    const envelopeRefusal = expectedA0EnvelopeFailure(before, command);
    const refusalIndex =
      oracle.refusal === null
        ? -1
        : EXPECTED_NESTED_REFUSAL_PRECEDENCE.indexOf(oracle.refusal.code);
    const reachedTargetResolution =
      envelopeRefusal === null &&
      (oracle.refusal === null || refusalIndex >= 6);
    if (reachedTargetResolution) {
      indexCounts = outerIndexCounts(before["document"]);
    }
    validationCalls = oracle.f2Ok ? 1 : 0;
    const reachedHistory =
      oracle.candidate !== null && oracle.f2Ok && oracle.f3Ok;
    if (reachedHistory) {
      indexCounts = addOuterIndexCounts(
        indexCounts,
        outerIndexCounts(oracle.candidate.document),
      );
      bookmarksRepaired = 1;
      const estimator = expected["historyEstimatorEvidence"];
      const returned = isObject(estimator) ? estimator["returned"] : null;
      const estimatorWasReached =
        isObject(estimator) && estimator["configuration"] !== "not-reached";
      if (
        estimatorWasReached &&
        Number.isSafeInteger(returned) &&
        Number(returned) >= 0
      ) {
        historyBytesEstimated = Number(returned);
      }
      const exactOuterCode = estimatorWasReached
        ? expectedHistoryOuterCode(returned)
        : null;
      if (exactOuterCode !== null) {
        const outerRefusal = isObject(result["refusal"])
          ? result["refusal"]
          : {};
        const nestedRefusal = isObject(result["editPlanRefusal"])
          ? result["editPlanRefusal"]
          : {};
        requireExact(
          outerRefusal["code"],
          exactOuterCode,
          "EDIT_PLAN_HISTORY_EXACT_OUTER_CODE",
          `${path}.result.refusal.code`,
          "The inherited A0 history result must distinguish an invalid estimate from a valid estimate above the retained-byte cap.",
          findings,
        );
        requireExact(
          nestedRefusal["outerCode"],
          exactOuterCode,
          "EDIT_PLAN_HISTORY_EXACT_NESTED_OUTER_CODE",
          `${path}.result.editPlanRefusal.outerCode`,
          "Nested history detail must mirror the exact dependency-specific A0 outer code.",
          findings,
        );
      }
    }
  }

  const exactOuter = Object.freeze({
    ...indexCounts,
    historyEntriesVisited,
    historyBytesEstimated,
    bookmarksRepaired,
    requestsCompared: 0,
    transportNotificationsCompared: 0,
    validationCalls,
  });
  requireExact(
    outer,
    exactOuter,
    "EDIT_PLAN_EXACT_OUTER_WORK_ORACLE",
    `${path}.counters.outer`,
    "The complete inherited A0 work record must equal the independently derived index, history, bookmark, request, transport, and validation trace.",
    findings,
  );
}

/**
 * Diagnostic-only oracle seam for packet-author reconciliation. Inputs must
 * already be materialized literals; this function neither mutates fixtures nor
 * relaxes any validator predicate.
 */
export function probeA0U1TransitionOracle(
  beforeValue: unknown,
  command: unknown,
  expectedValue: unknown,
): JsonObject | null {
  if (!isObject(beforeValue) || !isObject(expectedValue)) return null;
  const rawParserEvidence = expectedValue["parserEvidence"];
  const parserEvidence =
    isObject(rawParserEvidence) &&
    (rawParserEvidence["outcome"] === "success" ||
      rawParserEvidence["outcome"] === "failure")
      ? Object.freeze({
          outcome: rawParserEvidence["outcome"],
          sectionRows: recordsAt(rawParserEvidence["sectionRows"]),
          measureRows: recordsAt(rawParserEvidence["measureRows"]),
          allEventSlots: recordsAt(rawParserEvidence["allEventSlots"]),
          insertableRows: recordsAt(rawParserEvidence["insertableRows"]),
          diagnosticRows: recordsAt(rawParserEvidence["diagnosticRows"]),
        })
      : null;
  const oracle = deriveCausalRefusal(
    beforeValue,
    command,
    parserEvidence,
    rawParserEvidence,
    expectedValue["allocationTrace"],
    expectedValue["historyEstimatorEvidence"],
  );
  return {
    refusal:
      oracle.refusal === null
        ? null
        : {
            code: oracle.refusal.code,
            path: [...oracle.refusal.path],
          },
    candidateConstructed: oracle.candidate !== null,
    candidateDocument:
      oracle.candidate === null ? null : cloneJson(oracle.candidate.document),
    f2Ok: oracle.f2Ok,
    f3Ok: oracle.f3Ok,
    exactWork: isObject(command)
      ? deriveExactNestedWork(
          beforeValue,
          command,
          expectedValue,
          parserEvidence,
          expectedValue["allocationTrace"],
          oracle,
        )
      : null,
  };
}

function successfulPlanMetadataWork(plan: JsonObject): Readonly<{
  fieldsCompared: number;
  codePointsObserved: number;
}> {
  const metadataObjects: JsonObject[] = [];
  if (
    plan["kind"] === "split-section" &&
    isObject(plan["newSectionMetadata"])
  ) {
    metadataObjects.push(plan["newSectionMetadata"]);
  } else if (plan["kind"] === "join-sections") {
    for (const key of [
      "expectedLeftMetadata",
      "expectedRightMetadata",
      "resultMetadata",
    ]) {
      if (isObject(plan[key])) metadataObjects.push(plan[key]);
    }
  }
  let codePointsObserved = metadataObjects.reduce(
    (total, metadata) =>
      total +
      (typeof metadata["name"] === "string"
        ? codePointLength(metadata["name"])
        : 0) +
      (typeof metadata["annotation"] === "string"
        ? codePointLength(metadata["annotation"])
        : 0),
    0,
  );
  const placement = isObject(plan["placement"]) ? plan["placement"] : null;
  const declarations = recordsAt(
    placement?.["completionDeclarations"] ?? plan["completionDeclarations"],
  );
  for (const declaration of declarations) {
    const completion = isObject(declaration["completion"])
      ? declaration["completion"]
      : null;
    if (
      (completion?.["kind"] === "pickup" ||
        completion?.["kind"] === "incomplete") &&
      typeof completion["reason"] === "string"
    ) {
      codePointsObserved += codePointLength(completion["reason"]);
    }
  }
  return {
    fieldsCompared: metadataObjects.length * 4,
    codePointsObserved,
  };
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
    const insertPlanSource = isObject(plan["source"]) ? plan["source"] : null;
    const insertPlanPlacement = isObject(plan["placement"])
      ? plan["placement"]
      : null;
    requireExact(
      receipt["insertLane"],
      plan["kind"] === "insert-fragment" ? insertPlanSource?.["kind"] : null,
      "EDIT_PLAN_RECEIPT_INSERT_LANE",
      `${path}.editPlanReceipt.insertLane`,
      "Receipt insert-lane discriminant must be exact and null outside fragment insertion.",
      findings,
    );
    requireExact(
      receipt["placementKind"],
      plan["kind"] === "insert-fragment" ? insertPlanPlacement?.["kind"] : null,
      "EDIT_PLAN_RECEIPT_PLACEMENT_KIND",
      `${path}.editPlanReceipt.placementKind`,
      "Receipt placement discriminant must be exact and null outside fragment insertion.",
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
      plan["kind"] === "join-sections"
        ? [
            ...EXPECTED_BOOKMARK_RECEIPT_CORE_KEYS,
            ...EXPECTED_JOIN_SECTIONS_BOOKMARK_RECEIPT_EXTENSION_KEYS,
          ]
        : plan["kind"] === "insert-fragment" &&
            isObject(receipt["bookmarks"]) &&
            receipt["bookmarks"]["insertionPolicy"] ===
              "create-after-last-inserted"
          ? EXPECTED_CREATED_INSERTION_BOOKMARK_RECEIPT_KEYS
          : EXPECTED_BOOKMARK_RECEIPT_CORE_KEYS,
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
      receiptWork["structuralDecodeCalls"],
      1,
      "EDIT_PLAN_RECEIPT_F2_COUNT",
      `${path}.editPlanReceipt.work.structuralDecodeCalls`,
      "Committed receipt work must record exactly one structural decode call.",
      findings,
    );
    requireExact(
      receiptWork["semanticValidationCalls"],
      1,
      "EDIT_PLAN_RECEIPT_F3_COUNT",
      `${path}.editPlanReceipt.work.semanticValidationCalls`,
      "Committed receipt work must record exactly one semantic validation call.",
      findings,
    );
    const metadataWork = successfulPlanMetadataWork(plan);
    requireExact(
      receiptWork["metadataFieldsCompared"],
      metadataWork.fieldsCompared,
      "EDIT_PLAN_SUCCESS_METADATA_FIELD_WORK",
      `${path}.editPlanReceipt.work.metadataFieldsCompared`,
      "Committed metadata-field work must equal the exact split/join section preflight shape.",
      findings,
    );
    requireExact(
      receiptWork["metadataCodePointsObserved"],
      metadataWork.codePointsObserved,
      "EDIT_PLAN_SUCCESS_METADATA_CODE_POINT_WORK",
      `${path}.editPlanReceipt.work.metadataCodePointsObserved`,
      "Committed metadata code-point work must equal ordered names, annotations, and partial-completion reasons exactly.",
      findings,
    );
    requireExact(
      isObject(outerCounters) ? outerCounters["validationCalls"] : undefined,
      1,
      "EDIT_PLAN_SUCCESS_VALIDATION_CALLS",
      `${path}.counters.validationCalls`,
      "The accepted A0 counter increments once only after F2 succeeds and before F3; nested counters separately record both calls.",
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
          ? selectedRow["duration"]
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
    requireExact(
      isObject(expected["counters"])
        ? expected["counters"]["editPlan"]
        : undefined,
      null,
      "EDIT_PLAN_PREPLAN_COUNTER_SCOPE",
      `${path}.counters.editPlan`,
      "A0 envelope refusal must carry no nested edit-plan counter record.",
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
          "Diagnostic paths must be arrays of bounded scalar strings or nonnegative safe integers; the empty path is the command root.",
        );
      }
      const diagnosticAuthority = A0_U1_ATOMIC_EDIT_REFUSAL_AUTHORITY.find(
        (row) => row.code === diagnostic["code"],
      );
      if (
        diagnosticAuthority !== undefined &&
        !diagnosticAuthority.pathAuthority.some((template) =>
          authorityTemplateMatchesPath(template, diagnosticPath),
        )
      ) {
        addFinding(
          findings,
          "EDIT_PLAN_NESTED_DIAGNOSTIC_PATH_AUTHORITY",
          `${path}.editPlanRefusal.diagnostics[${String(index)}].path`,
          "Diagnostic path must match one canonical template owned by its refusal code.",
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
        (typeof diagnostic["syntaxCode"] !== "string" ||
          !ACCEPTED_T0_DIAGNOSTIC_CODES.includes(diagnostic["syntaxCode"]))
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
    const refusalPlan = isObject(command["plan"]) ? command["plan"] : null;
    if (
      nestedCode === "edit-plan.destination-invalid" &&
      (refusalPlan === null ||
        refusalPlan["kind"] !== "insert-fragment" ||
        (canonicalPlacementTargetMatches(before["document"], refusalPlan) &&
          completeDraftIntoMeasureContractHolds(
            before["document"],
            refusalPlan,
          )))
    ) {
      addFinding(
        findings,
        "EDIT_PLAN_DESTINATION_REFUSAL_ORACLE",
        `${path}.editPlanRefusal.code`,
        "Destination-invalid requires a failed canonical slot/parent match or a complete draft aimed at a nonempty measure.",
      );
    }
    if (
      nestedCode === "edit-plan.fragment-placement-mismatch" &&
      (refusalPlan === null ||
        refusalPlan["kind"] !== "insert-fragment" ||
        !isObject(refusalPlan["source"]) ||
        refusalPlan["source"]["kind"] !== "complete-draft" ||
        completeDraftStructureMatchesPlacement(
          parserEvidence,
          refusalPlan["placement"],
        ))
    ) {
      addFinding(
        findings,
        "EDIT_PLAN_FRAGMENT_PLACEMENT_REFUSAL_ORACLE",
        `${path}.editPlanRefusal.code`,
        "Fragment-placement-mismatch is reserved for a complete T0 draft whose section/measure structure does not fit the selected lane.",
      );
    }
    if (nestedCode === "edit-plan.syntax-refused") {
      if (parserEvidence === null || parserEvidence.outcome !== "failure") {
        addFinding(
          findings,
          "EDIT_PLAN_SYNTAX_REFUSAL_EVIDENCE",
          `${path}.editPlanRefusal.code`,
          "Syntax-refused requires independently authored failed T0 parser evidence for the guarded raw source.",
        );
      } else {
        const sourcePath = [
          "plan",
          "source",
          "quickEntrySnapshot",
          "sourceText",
        ];
        const causalRoot =
          parserEvidence.diagnosticRows.length > 1
            ? [
                {
                  code: "edit-plan.syntax-refused",
                  owner: "A0/U1",
                  path: sourcePath,
                  sourceRange: null,
                  syntaxCode: null,
                  observed: null,
                  maximum: null,
                },
              ]
            : [];
        const expectedDiagnostics = [
          ...causalRoot,
          ...parserEvidence.diagnosticRows.map((row) => ({
            code: "edit-plan.syntax-refused",
            owner: "A0/U1",
            path: sourcePath,
            sourceRange: row["range"] ?? null,
            syntaxCode: row["code"] ?? null,
            observed: null,
            maximum: null,
          })),
        ]
          .sort(compareDiagnostics)
          .slice(0, A0_U1_ATOMIC_EDIT_LIMITS.retainedDiagnostics);
        requireExact(
          diagnostics,
          expectedDiagnostics,
          "EDIT_PLAN_SYNTAX_DIAGNOSTIC_VERBATIM",
          `${path}.editPlanRefusal.diagnostics`,
          "Syntax-refused diagnostics must preserve each T0 diagnostic's code and half-open UTF-16 range verbatim from the independent parser evidence; A0/U1 must not rescan source text, extend a token range, or substitute a syntax code.",
          findings,
        );
      }
    }
    const nestedAuthority = A0_U1_ATOMIC_EDIT_REFUSAL_AUTHORITY.find(
      (row) => row.code === nested["code"],
    );
    if (
      nestedAuthority !== undefined &&
      !nestedAuthority.pathAuthority.some((template) =>
        authorityTemplateMatchesPath(template, nested["path"]),
      )
    ) {
      addFinding(
        findings,
        "EDIT_PLAN_NESTED_REFUSAL_PATH_AUTHORITY",
        `${path}.editPlanRefusal.path`,
        "Primary refusal path must match one canonical template owned by its refusal code.",
      );
    }
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
      nested["code"] === "edit-plan.semantic-publication-refused" ||
      nested["code"] === "edit-plan.history-refused"
        ? 1
        : 0;
    const expectedStructuralDecodeCalls =
      nested["code"] === "edit-plan.structural-publication-refused" ||
      nested["code"] === "edit-plan.semantic-publication-refused" ||
      nested["code"] === "edit-plan.history-refused"
        ? 1
        : 0;
    const expectedSemanticValidationCalls =
      nested["code"] === "edit-plan.semantic-publication-refused" ||
      nested["code"] === "edit-plan.history-refused"
        ? 1
        : 0;
    requireExact(
      nestedWork["structuralDecodeCalls"],
      expectedStructuralDecodeCalls,
      "EDIT_PLAN_REFUSAL_STRUCTURAL_DECODE_STAGE",
      `${path}.editPlanRefusal.work.structuralDecodeCalls`,
      "Nested work must record structural decode exactly when the refusal reaches F2 or a later stage.",
      findings,
    );
    requireExact(
      nestedWork["semanticValidationCalls"],
      expectedSemanticValidationCalls,
      "EDIT_PLAN_REFUSAL_SEMANTIC_VALIDATION_STAGE",
      `${path}.editPlanRefusal.work.semanticValidationCalls`,
      "Nested work must record semantic validation exactly when the refusal reaches F3 or a later stage.",
      findings,
    );
    requireExact(
      isObject(expected["counters"])
        ? isObject(expected["counters"]["outer"])
          ? expected["counters"]["outer"]["validationCalls"]
          : undefined
        : undefined,
      expectedValidationCalls,
      "EDIT_PLAN_REFUSAL_VALIDATION_STAGE",
      `${path}.counters.validationCalls`,
      "The accepted A0 validation counter stays zero through F2 refusal and increments once only after F2 succeeds; nested counters distinguish F2 from F3.",
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

/**
 * Independent reconstruction from accepted domain and A0 state bounds. Do not
 * derive these values from the A0/U1 source object: coordinated source/packet
 * drift must fail this validator.
 */
const EXPECTED_ATOMIC_EDIT_LIMITS = Object.freeze({
  structuralDecodeCalls: 1,
  semanticValidationCalls: 1,
  fragmentSourceCodePoints: MAX_QUICK_ENTRY_CODE_POINTS,
  fragmentSourceUtf8Bytes: 4 * MAX_QUICK_ENTRY_CODE_POINTS,
  fragmentSections: MAX_DOCUMENT_SECTIONS,
  fragmentMeasuresPerSection: MAX_SECTION_MEASURES,
  fragmentMeasures: MAX_DOCUMENT_SECTIONS * MAX_SECTION_MEASURES,
  fragmentEvents: MAX_DOCUMENT_CHORD_EVENTS,
  finalTimelineQuarterNoteBeats: MAX_TIMELINE_QUARTER_NOTE_BEATS,
  completionDeclarations: 1,
  sectionDeclarations: MAX_DOCUMENT_SECTIONS,
  retainedDiagnostics: 64,
  retainedWarningAcknowledgements: 64,
  quickEntryIssueCodes: MAX_DRAFT_ISSUES,
  quickEntrySnapshotFieldsCompared: 6,
  insertableChordsExamined: MAX_DOCUMENT_CHORD_EVENTS,
  recoveryFieldsCompared: 4,
  idAllocationAttempts:
    MAX_DOCUMENT_SECTIONS +
    MAX_DOCUMENT_SECTIONS * MAX_SECTION_MEASURES +
    MAX_DOCUMENT_CHORD_EVENTS,
  occupiedIdRecords:
    1 +
    MAX_DOCUMENT_SECTIONS +
    MAX_DOCUMENT_SECTIONS * MAX_SECTION_MEASURES +
    MAX_DOCUMENT_CHORD_EVENTS,
  planNodeRecords:
    1 +
    MAX_DOCUMENT_SECTIONS +
    MAX_DOCUMENT_SECTIONS * MAX_SECTION_MEASURES +
    MAX_DOCUMENT_CHORD_EVENTS,
  bookmarkRecordsExamined: MAX_SELECTED_EVENT_IDS + 4,
  exactBeatAdditions: MAX_DOCUMENT_CHORD_EVENTS + 1,
  exactBeatComparisons: MAX_DOCUMENT_CHORD_EVENTS + 1,
  metadataFieldsCompared: 12,
  sectionNameCodePoints: MAX_SHORT_TEXT_CODE_POINTS,
  sectionAnnotationCodePoints: MAX_LONG_TEXT_CODE_POINTS,
  completionReasonCodePoints: MAX_LONG_TEXT_CODE_POINTS,
  /*
   * R1: the accepted-shape aggregate covers the three maximum join-section
   * metadata objects plus the completion reason of the one first-extra
   * declaration row inside the shape horizon:
   * 3 * (256 + 2,000) + 2,000 = 8,768.
   */
  planMetadataCodePoints:
    3 * (MAX_SHORT_TEXT_CODE_POINTS + MAX_LONG_TEXT_CODE_POINTS) +
    MAX_LONG_TEXT_CODE_POINTS,
});

function expectedAtomicEditWorkCounterMaxima(): Readonly<
  Record<string, number>
> {
  return {
    structuralDecodeCalls: EXPECTED_ATOMIC_EDIT_LIMITS.structuralDecodeCalls,
    semanticValidationCalls:
      EXPECTED_ATOMIC_EDIT_LIMITS.semanticValidationCalls,
    planNodesVisited: EXPECTED_ATOMIC_EDIT_LIMITS.planNodeRecords + 1,
    sourceCodePointsObserved:
      EXPECTED_ATOMIC_EDIT_LIMITS.fragmentSourceCodePoints + 1,
    sourceUtf8BytesObserved:
      EXPECTED_ATOMIC_EDIT_LIMITS.fragmentSourceUtf8Bytes + 1,
    quickEntrySnapshotFieldsCompared:
      EXPECTED_ATOMIC_EDIT_LIMITS.quickEntrySnapshotFieldsCompared,
    quickEntryIssueCodesCompared:
      EXPECTED_ATOMIC_EDIT_LIMITS.quickEntryIssueCodes + 1,
    syntaxParseCalls: 1,
    warningAcknowledgementsCompared:
      EXPECTED_ATOMIC_EDIT_LIMITS.retainedWarningAcknowledgements + 1,
    insertableChordsExamined:
      EXPECTED_ATOMIC_EDIT_LIMITS.insertableChordsExamined,
    recoveryFieldsCompared: EXPECTED_ATOMIC_EDIT_LIMITS.recoveryFieldsCompared,
    draftSectionsVisited: EXPECTED_ATOMIC_EDIT_LIMITS.fragmentSections + 1,
    draftMeasuresVisited: EXPECTED_ATOMIC_EDIT_LIMITS.fragmentMeasures + 1,
    draftEventsVisited: EXPECTED_ATOMIC_EDIT_LIMITS.fragmentEvents + 1,
    completionDeclarationsVisited:
      EXPECTED_ATOMIC_EDIT_LIMITS.completionDeclarations + 1,
    metadataFieldsCompared: EXPECTED_ATOMIC_EDIT_LIMITS.metadataFieldsCompared,
    metadataCodePointsObserved:
      EXPECTED_ATOMIC_EDIT_LIMITS.planMetadataCodePoints + 1,
    exactBeatAdditions: EXPECTED_ATOMIC_EDIT_LIMITS.exactBeatAdditions,
    exactBeatComparisons: EXPECTED_ATOMIC_EDIT_LIMITS.exactBeatComparisons,
    idAllocationAttempts: EXPECTED_ATOMIC_EDIT_LIMITS.idAllocationAttempts,
    idCollisionChecks: EXPECTED_ATOMIC_EDIT_LIMITS.idAllocationAttempts,
    bookmarkRecordsExamined:
      EXPECTED_ATOMIC_EDIT_LIMITS.bookmarkRecordsExamined,
    bookmarkRecordsRewritten: 4,
    peakPlanNodeRecords: EXPECTED_ATOMIC_EDIT_LIMITS.planNodeRecords + 1,
    peakAllocatedIdRecords: EXPECTED_ATOMIC_EDIT_LIMITS.idAllocationAttempts,
    peakDiagnosticRecords: EXPECTED_ATOMIC_EDIT_LIMITS.retainedDiagnostics,
  };
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
    // A0 envelope refusals occur before the nested runner exists. Result
    // validation below distinguishes those from every post-envelope outcome.
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
  const counterMaxima = expectedAtomicEditWorkCounterMaxima();
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
  if (!isUnknownArray(allocationTrace)) {
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
    if (typeof row["allocatedId"] !== "string") {
      addFinding(
        findings,
        "EDIT_PLAN_ALLOCATION_TRACE_ID",
        `${path}[${String(index)}].allocatedId`,
        "Every returned factory value retained by the trace must be a string; F2 independently owns stable-ID wire validation.",
      );
      continue;
    }
    collisionChecks += 1;
    if (outcome === "accepted") {
      if (
        occupied.has(row["allocatedId"]) ||
        accepted.has(row["allocatedId"])
      ) {
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
    const finalAllocationRow = allocationTrace.at(-1);
    requireExact(
      isObject(finalAllocationRow) ? finalAllocationRow["outcome"] : undefined,
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

function validateIdFactoryEvidence(
  command: unknown,
  result: JsonObject | null,
  counters: unknown,
  allocationTrace: unknown,
  evidence: unknown,
  phase: unknown,
  operation: unknown,
  caseCategory: unknown,
  path: string,
  findings: A0U1EditPlanContractFinding[],
): JsonObject | null {
  if (!isObject(evidence)) {
    addFinding(
      findings,
      "EDIT_PLAN_ID_FACTORY_EVIDENCE_LITERAL",
      path,
      "Every transition must retain one literal ID-factory configuration and observed-call count.",
    );
    return null;
  }
  checkExactKeys(
    evidence,
    EXPECTED_ID_FACTORY_EVIDENCE_KEYS,
    "EDIT_PLAN_ID_FACTORY_EVIDENCE_KEYS",
    path,
    findings,
  );
  const configuration = evidence["configuration"];
  const callsObserved = evidence["callsObserved"];
  if (
    !EXPECTED_ID_FACTORY_CONFIGURATIONS.includes(
      configuration as (typeof EXPECTED_ID_FACTORY_CONFIGURATIONS)[number],
    )
  ) {
    addFinding(
      findings,
      "EDIT_PLAN_ID_FACTORY_CONFIGURATION",
      `${path}.configuration`,
      "ID-factory evidence must use the closed configuration vocabulary.",
    );
  }
  if (!isNonnegativeSafeInteger(callsObserved)) {
    addFinding(
      findings,
      "EDIT_PLAN_ID_FACTORY_CALLS",
      `${path}.callsObserved`,
      "Observed ID-factory calls must be a nonnegative safe integer.",
    );
  }
  requireExact(
    callsObserved,
    Array.isArray(allocationTrace) ? allocationTrace.length : undefined,
    "EDIT_PLAN_ID_FACTORY_TRACE_CARDINALITY",
    `${path}.callsObserved`,
    "Observed factory calls must equal the complete allocation-attempt trace cardinality.",
    findings,
  );

  const nestedCounters = isObject(counters) ? counters["editPlan"] : null;
  const isHistory = phase === "undo" || phase === "redo";
  if (isHistory || !isObject(nestedCounters)) {
    requireExact(
      evidence,
      { configuration: "not-provided", callsObserved: 0 },
      "EDIT_PLAN_ID_FACTORY_NOT_PROVIDED",
      path,
      "History replay and every refusal before edit-plan work begins must not provide an ID factory.",
      findings,
    );
    return evidence;
  }
  if (configuration === "not-provided") {
    addFinding(
      findings,
      "EDIT_PLAN_ID_FACTORY_POST_PLAN_MISSING",
      `${path}.configuration`,
      "Once edit-plan work begins, the fixture must expose the reviewed factory configuration even when no call is needed.",
    );
  }

  const expectedKinds = expectedAllocationKinds(command, null);
  if (configuration === "hostile-refuse-on-any-call") {
    const hostileJoinWitness =
      phase === "apply" &&
      result?.["ok"] === true &&
      caseCategory === "collision-allocation" &&
      (operation === "join-event-durations" || operation === "join-sections");
    if (!hostileJoinWitness) {
      addFinding(
        findings,
        "EDIT_PLAN_ID_FACTORY_HOSTILE_SCOPE",
        path,
        "The hostile factory is reserved for the two successful join collision-allocation witnesses.",
      );
    }
    requireExact(
      callsObserved,
      0,
      "EDIT_PLAN_ID_FACTORY_HOSTILE_UNUSED",
      `${path}.callsObserved`,
      "A successful join must ignore the hostile factory completely.",
      findings,
    );
    requireExact(
      allocationTrace,
      [],
      "EDIT_PLAN_ID_FACTORY_HOSTILE_TRACE",
      path,
      "A hostile join witness must have no allocation attempt.",
      findings,
    );
  }
  if (
    configuration === "hostile-refuse-on-any-call" &&
    result?.["ok"] === true &&
    Array.isArray(expectedKinds) &&
    expectedKinds.length > 0
  ) {
    addFinding(
      findings,
      "EDIT_PLAN_ID_FACTORY_HOSTILE_ALLOCATION_SUCCESS",
      path,
      "No successful allocating operation may claim a hostile refuse-on-call factory.",
    );
  }
  return evidence;
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
    } else if (completionKind === "pickup" || completionKind === "incomplete") {
      validateBeatDurationShape(
        completion["expectedDuration"],
        `${path}[${String(index)}].completion.expectedDuration`,
        findings,
      );
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

type ResolvedInsertionSlot = Readonly<{
  scope: "measure" | "section" | "document";
  parentId: unknown;
  beforeSiblingId: unknown;
}>;

function resolvePlacementSlot(
  document: unknown,
  placement: JsonObject,
): ResolvedInsertionSlot | null {
  if (placement["kind"] === "into-measure") {
    const location = findMeasureLocation(document, placement["measureId"]);
    if (location === null) return null;
    const beforeEventId = placement["beforeEventId"];
    if (beforeEventId !== null) {
      const event = findEventLocation(document, beforeEventId);
      if (event === null || event.measure["id"] !== location.measure["id"]) {
        return null;
      }
    }
    return {
      scope: "measure",
      parentId: location.measure["id"],
      beforeSiblingId: beforeEventId,
    };
  }
  if (placement["kind"] === "into-section") {
    const location = findSectionLocation(document, placement["sectionId"]);
    if (location === null) return null;
    const beforeMeasureId = placement["beforeMeasureId"];
    if (beforeMeasureId !== null) {
      const measure = findMeasureLocation(document, beforeMeasureId);
      if (
        measure === null ||
        measure.section["id"] !== location.section["id"]
      ) {
        return null;
      }
    }
    return {
      scope: "section",
      parentId: location.section["id"],
      beforeSiblingId: beforeMeasureId,
    };
  }
  if (placement["kind"] === "into-document") {
    const beforeSectionId = placement["beforeSectionId"];
    if (
      beforeSectionId !== null &&
      findSectionLocation(document, beforeSectionId) === null
    ) {
      return null;
    }
    return {
      scope: "document",
      parentId: isObject(document) ? document["id"] : undefined,
      beforeSiblingId: beforeSectionId,
    };
  }
  return null;
}

function resolveBoundarySlot(
  document: unknown,
  target: JsonObject,
): ResolvedInsertionSlot | null {
  if (target["kind"] === "measure-start" || target["kind"] === "measure-end") {
    const location = findMeasureLocation(document, target["measureId"]);
    if (location === null) return null;
    const events = measureEvents(location.measure);
    return {
      scope: "measure",
      parentId: location.measure["id"],
      beforeSiblingId:
        target["kind"] === "measure-start" ? (events[0]?.["id"] ?? null) : null,
    };
  }
  if (target["kind"] === "before-event" || target["kind"] === "after-event") {
    const location = findEventLocation(document, target["eventId"]);
    if (location === null) return null;
    const events = measureEvents(location.measure);
    return {
      scope: "measure",
      parentId: location.measure["id"],
      beforeSiblingId:
        target["kind"] === "before-event"
          ? location.event["id"]
          : (events[location.eventIndex + 1]?.["id"] ?? null),
    };
  }
  if (target["kind"] === "section-start" || target["kind"] === "section-end") {
    const location = findSectionLocation(document, target["sectionId"]);
    if (location === null) return null;
    const measures = sectionMeasures(location.section);
    return {
      scope: "section",
      parentId: location.section["id"],
      beforeSiblingId:
        target["kind"] === "section-start"
          ? (measures[0]?.["id"] ?? null)
          : null,
    };
  }
  if (
    target["kind"] === "before-measure" ||
    target["kind"] === "after-measure"
  ) {
    const location = findMeasureLocation(document, target["measureId"]);
    if (location === null) return null;
    const measures = sectionMeasures(location.section);
    return {
      scope: "section",
      parentId: location.section["id"],
      beforeSiblingId:
        target["kind"] === "before-measure"
          ? location.measure["id"]
          : (measures[location.measureIndex + 1]?.["id"] ?? null),
    };
  }
  if (
    target["kind"] === "document-start" ||
    target["kind"] === "document-end"
  ) {
    const sections = documentSections(document);
    return {
      scope: "document",
      parentId: isObject(document) ? document["id"] : undefined,
      beforeSiblingId:
        target["kind"] === "document-start"
          ? (sections[0]?.["id"] ?? null)
          : null,
    };
  }
  if (
    target["kind"] === "before-section" ||
    target["kind"] === "after-section"
  ) {
    const location = findSectionLocation(document, target["sectionId"]);
    if (location === null) return null;
    const sections = documentSections(document);
    return {
      scope: "document",
      parentId: isObject(document) ? document["id"] : undefined,
      beforeSiblingId:
        target["kind"] === "before-section"
          ? location.section["id"]
          : (sections[location.index + 1]?.["id"] ?? null),
    };
  }
  return null;
}

function insertPlanTarget(plan: JsonObject): JsonObject | null {
  const source = isObject(plan["source"]) ? plan["source"] : null;
  const snapshot = isObject(source?.["quickEntrySnapshot"])
    ? source["quickEntrySnapshot"]
    : null;
  return isObject(snapshot?.["target"]) ? snapshot["target"] : null;
}

function canonicalPlacementTargetMatches(
  document: unknown,
  plan: JsonObject,
): boolean {
  const placement = isObject(plan["placement"]) ? plan["placement"] : null;
  const target = insertPlanTarget(plan);
  if (placement === null || target === null) return false;
  const placementSlot = resolvePlacementSlot(document, placement);
  const targetSlot = resolveBoundarySlot(document, target);
  return (
    placementSlot !== null &&
    targetSlot !== null &&
    jsonDeepEqual(placementSlot, targetSlot)
  );
}

function completeDraftIntoMeasureContractHolds(
  document: unknown,
  plan: JsonObject,
): boolean {
  const source = isObject(plan["source"]) ? plan["source"] : null;
  const placement = isObject(plan["placement"]) ? plan["placement"] : null;
  if (
    source?.["kind"] !== "complete-draft" ||
    placement?.["kind"] !== "into-measure"
  ) {
    return true;
  }
  const declarations = recordsAt(placement["completionDeclarations"]);
  return (
    completeDraftIntoMeasureDestinationHolds(document, plan) &&
    declarations.length === 1 &&
    declarations[0]?.["measureId"] === placement["measureId"] &&
    jsonDeepEqual(declarations[0]?.["completion"], { kind: "complete" })
  );
}

function completeDraftIntoMeasureDestinationHolds(
  document: unknown,
  plan: JsonObject,
): boolean {
  const source = isObject(plan["source"]) ? plan["source"] : null;
  const placement = isObject(plan["placement"]) ? plan["placement"] : null;
  if (
    source?.["kind"] !== "complete-draft" ||
    placement?.["kind"] !== "into-measure"
  ) {
    return true;
  }
  const location = findMeasureLocation(document, placement["measureId"]);
  const target = insertPlanTarget(plan);
  if (location === null || target === null) return false;
  return (
    placement["beforeEventId"] === null &&
    measureEvents(location.measure).length === 0 &&
    jsonDeepEqual(location.measure["completion"], { kind: "empty" }) &&
    (target["kind"] === "measure-start" || target["kind"] === "measure-end") &&
    target["measureId"] === placement["measureId"]
  );
}

type ParserEvidenceView = Readonly<{
  outcome: "success" | "failure";
  sectionRows: readonly JsonObject[];
  measureRows: readonly JsonObject[];
  allEventSlots: readonly JsonObject[];
  insertableRows: readonly JsonObject[];
  diagnosticRows: readonly JsonObject[];
}>;

function completeDraftStructureMatchesPlacement(
  parserEvidence: ParserEvidenceView | null,
  placement: unknown,
): boolean {
  if (
    parserEvidence === null ||
    parserEvidence.outcome !== "success" ||
    !isObject(placement)
  ) {
    return false;
  }
  if (placement["kind"] === "into-measure") {
    return (
      parserEvidence.sectionRows.length === 1 &&
      parserEvidence.sectionRows[0]?.["kind"] === "implicit" &&
      parserEvidence.measureRows.length === 1 &&
      parserEvidence.insertableRows.length > 0
    );
  }
  if (placement["kind"] === "into-section") {
    return (
      parserEvidence.sectionRows.length === 1 &&
      parserEvidence.sectionRows[0]?.["kind"] === "implicit" &&
      parserEvidence.measureRows.length > 0
    );
  }
  if (placement["kind"] === "into-document") {
    return (
      parserEvidence.sectionRows.length > 0 &&
      parserEvidence.sectionRows.every(
        (row) => row["kind"] === "named" && typeof row["name"] === "string",
      )
    );
  }
  return false;
}

const ACCEPTED_T0_DIAGNOSTIC_CODES: readonly string[] = Object.freeze([
  ...CHART_ERROR_CODES,
  ...SYMBOL_ERROR_CODES,
]);

/**
 * Project the accepted public T0 result onto only fields the A0/U1 packet is
 * allowed to freeze. Failure results intentionally expose no section,
 * measure, or invalid-slot topology; inventing that topology in the packet
 * would turn independently authored prose into a fake parser oracle.
 */
function acceptedT0ParserProjection(
  sourceText: string,
  meterValue: unknown,
): JsonObject | null {
  if (!isObject(meterValue)) return null;
  const beatsPerBar = meterValue["beatsPerBar"];
  const beatUnit = meterValue["beatUnit"];
  if (typeof beatsPerBar !== "number" || typeof beatUnit !== "number") {
    return null;
  }
  const meterResult = makeMeter({ beatsPerBar, beatUnit });
  if (!meterResult.ok) return null;
  const parsed = parseChartText(
    sourceText,
    { mode: "fragment", meter: meterResult.value },
    "ascii",
  );
  if (!parsed.ok) {
    return {
      outcome: "failure",
      warningRows: [],
      diagnosticRows: parsed.diagnostics.map(({ code, range }) => ({
        code,
        range,
      })),
      sectionRows: [],
      measureRows: [],
      allEventSlots: [],
      insertableRows: parsed.insertableChords.map((row) => ({
        globalOrdinal: row.ordinal,
        chord: row.chord,
        annotation: row.annotation,
        duration: row.duration,
        range: row.range,
      })),
    };
  }

  const sectionRows: JsonObject[] = [];
  const measureRows: JsonObject[] = [];
  const allEventSlots: JsonObject[] = [];
  const insertableRows: JsonObject[] = [];
  for (const section of parsed.draft.sections) {
    sectionRows.push({
      sourceSectionOrdinal: section.ordinal,
      kind: section.kind,
      name: section.name,
      annotation: section.annotation,
    });
    for (const measure of section.measures) {
      measureRows.push({
        sourceSectionOrdinal: section.ordinal,
        sourceMeasureOrdinal: measure.ordinal,
        kind: measure.kind,
        completion:
          measure.events.length === 0
            ? { kind: "empty" }
            : { kind: "complete" },
      });
      for (const [sourceEventOrdinal, event] of measure.events.entries()) {
        const coordinates = {
          globalOrdinal: event.ordinal,
          sourceSectionOrdinal: section.ordinal,
          sourceMeasureOrdinal: measure.ordinal,
          sourceEventOrdinal,
        };
        allEventSlots.push({ ...coordinates, valid: true });
        insertableRows.push({
          ...coordinates,
          chord: event.chord,
          annotation: event.annotation,
          duration: {
            kind: "resolved",
            source: event.durationRange === null ? "allocated" : "explicit",
            value: event.duration,
          },
          range: event.range,
        });
      }
    }
  }
  return {
    outcome: "success",
    warningRows: parsed.warnings.map(({ code, range }) => ({ code, range })),
    diagnosticRows: [],
    sectionRows,
    measureRows,
    allEventSlots,
    insertableRows,
  };
}

function validateAcceptedT0ParserProjection(
  evidence: JsonObject,
  sourceText: string,
  meterValue: unknown,
  outcome: "success" | "failure",
  path: string,
  findings: A0U1EditPlanContractFinding[],
): void {
  const accepted = acceptedT0ParserProjection(sourceText, meterValue);
  if (accepted === null) {
    addFinding(
      findings,
      "EDIT_PLAN_T0_COMPARISON_INPUT",
      path,
      "The transition does not expose a valid current-document meter for the accepted public T0 comparison.",
    );
    return;
  }
  const failureTopologyIsEmpty =
    outcome !== "failure" ||
    (jsonDeepEqual(evidence["sectionRows"], []) &&
      jsonDeepEqual(evidence["measureRows"], []) &&
      jsonDeepEqual(evidence["allEventSlots"], []));
  if (!failureTopologyIsEmpty) {
    addFinding(
      findings,
      "EDIT_PLAN_T0_FAILURE_TOPOLOGY",
      path,
      "A failed public T0 result exposes no section, measure, or invalid-slot topology; those rows must remain empty.",
    );
  }
  const projectedEvidence = {
    outcome,
    warningRows: evidence["warningRows"],
    diagnosticRows: evidence["diagnosticRows"],
    sectionRows: evidence["sectionRows"],
    measureRows: evidence["measureRows"],
    allEventSlots: evidence["allEventSlots"],
    insertableRows: evidence["insertableRows"],
  };
  requireExact(
    projectedEvidence,
    accepted,
    "EDIT_PLAN_T0_ACCEPTED_OUTPUT_MISMATCH",
    path,
    "Independently authored parser evidence must exactly project the accepted public T0 result for this raw source, meter, fragment mode, and ASCII style.",
    findings,
  );
}

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
  const plan = isObject(commandRecord?.["plan"]) ? commandRecord["plan"] : null;
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
    if (!ACCEPTED_T0_DIAGNOSTIC_CODES.includes(String(row["code"]))) {
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
  if (
    outcome === "failure" &&
    (sectionRows.length !== 0 ||
      measureRows.length !== 0 ||
      allEventSlots.length !== 0)
  ) {
    addFinding(
      findings,
      "EDIT_PLAN_PARSER_FAILURE_TOPOLOGY",
      path,
      "Failed public T0 results expose diagnostics and insertable chords only; private draft topology must not be asserted.",
    );
  }
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
  let previousFailureOrdinal = -1;
  for (const [index, row] of insertableRows.entries()) {
    checkExactKeys(
      row,
      outcome === "success"
        ? EXPECTED_PARSER_INSERTABLE_ROW_KEYS
        : EXPECTED_PARSER_FAILURE_INSERTABLE_ROW_KEYS,
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
    const invalidSuccessCoordinate =
      outcome === "success" &&
      (slotIndex < 0 ||
        slotIndex <= previousSlotIndex ||
        allEventSlots[slotIndex]?.["valid"] !== true);
    const invalidFailureCoordinate =
      outcome === "failure" &&
      (!isNonnegativeSafeInteger(row["globalOrdinal"]) ||
        row["globalOrdinal"] <= previousFailureOrdinal);
    if (invalidSuccessCoordinate || invalidFailureCoordinate) {
      addFinding(
        findings,
        "EDIT_PLAN_PARSER_INSERTABLE_ORDER",
        `${path}.insertableRows[${String(index)}]`,
        outcome === "success"
          ? "Successful insertable rows must be the valid all-event slots in exact source order."
          : "Failed insertable rows retain only increasing public global ordinals and no private draft coordinates.",
      );
    }
    previousSlotIndex = slotIndex;
    if (isNonnegativeSafeInteger(row["globalOrdinal"])) {
      previousFailureOrdinal = row["globalOrdinal"];
    }
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
  if (outcome === "success") {
    requireExact(
      insertableCoordinates,
      validCoordinates,
      "EDIT_PLAN_PARSER_VALID_INSERTABLE_BIJECTION",
      `${path}.insertableRows`,
      "Every and only valid parser event slot must appear once in insertable source order.",
      findings,
    );
  }
  for (const [index, measure] of measureRows.entries()) {
    if (outcome !== "success") continue;
    const insertedEventCount = insertableRows.filter(
      (row) =>
        row["sourceSectionOrdinal"] === measure["sourceSectionOrdinal"] &&
        row["sourceMeasureOrdinal"] === measure["sourceMeasureOrdinal"],
    ).length;
    const expectedCompletion =
      insertedEventCount === 0 ? { kind: "empty" } : { kind: "complete" };
    checkExactKeys(
      measure["completion"],
      insertedEventCount === 0
        ? A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.measureCompletionEmpty
        : A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.measureCompletionComplete,
      "EDIT_PLAN_PARSER_MEASURE_COMPLETION_KEYS",
      `${path}.measureRows[${String(index)}].completion`,
      findings,
    );
    requireExact(
      measure["completion"],
      expectedCompletion,
      "EDIT_PLAN_PARSER_MEASURE_COMPLETION",
      `${path}.measureRows[${String(index)}].completion`,
      "A successful T0 draft freezes empty completion for a zero-event measure and complete completion for every nonempty closed measure.",
      findings,
    );
  }
  validateAcceptedT0ParserProjection(
    evidence,
    sourceText,
    beforeDocument["meter"],
    outcome,
    path,
    findings,
  );
  return {
    outcome,
    sectionRows,
    measureRows,
    allEventSlots,
    insertableRows,
    diagnosticRows,
  };
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
          isObject(acknowledgement) ? acknowledgement["range"] : undefined,
          typeof sourceText === "string" ? sourceText.length : 0,
          `${path}.source.warningAcknowledgements[${String(index)}].range`,
          findings,
        );
      }
    }
  } else {
    if (!isNonnegativeSafeInteger(source["selectedGlobalOrdinal"])) {
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
    if (complete) {
      requireExact(
        placement["beforeEventId"],
        null,
        "EDIT_PLAN_COMPLETE_MEASURE_APPEND",
        `${path}.placement.beforeEventId`,
        "Complete-draft into-measure placement is the one empty-target append branch.",
        findings,
      );
      if (
        !isObject(snapshot["target"]) ||
        !["measure-start", "measure-end"].includes(
          String(snapshot["target"]["kind"]),
        ) ||
        snapshot["target"]["measureId"] !== placement["measureId"]
      ) {
        addFinding(
          findings,
          "EDIT_PLAN_COMPLETE_MEASURE_TARGET",
          `${path}.source.quickEntrySnapshot.target`,
          "Complete-draft into-measure accepts only the target empty measure's start or end boundary.",
        );
      }
      requireExact(
        recordsAt(placement["completionDeclarations"]),
        [
          {
            measureId: placement["measureId"],
            completion: { kind: "complete" },
          },
        ],
        "EDIT_PLAN_COMPLETE_MEASURE_DECLARATION",
        `${path}.placement.completionDeclarations`,
        "Complete-draft into an empty measure must declare exactly that target measure complete.",
        findings,
      );
    }
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
    ? source["quickEntrySnapshot"]
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
  // Passive exact runtime shape is deliberately earlier than the inherited A0
  // envelope reads. A malformed plan envelope is owned by the nested runner,
  // even when one malformed value would also fail a later A0 scalar check.
  if (firstRuntimeShapeRefusal(command) !== null) return;
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
  return resolvePlacementSlot(document, placement) !== null;
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
      if (!isStableId(plan["eventId"])) {
        addFinding(
          findings,
          "EDIT_PLAN_SPLIT_EVENT_ID",
          `${planPath}.eventId`,
          "Split-event target must be a canonical stable ID.",
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

function parseAuthorityPointerTemplate(value: unknown): string[] | null {
  if (value === "") return [];
  if (typeof value !== "string" || !value.startsWith("/")) return null;
  const result: string[] = [];
  for (const encoded of value.slice(1).split("/")) {
    if (/~(?![01])/u.test(encoded)) return null;
    const decoded = encoded.replaceAll("~1", "/").replaceAll("~0", "~");
    if (
      (decoded.includes("{") || decoded.includes("}")) &&
      decoded !== "{index}" &&
      decoded !== "{metadataField}"
    ) {
      return null;
    }
    result.push(decoded);
  }
  return result;
}

function authorityTemplateMatchesPath(
  template: unknown,
  path: unknown,
): boolean {
  const expected = parseAuthorityPointerTemplate(template);
  if (
    expected === null ||
    !Array.isArray(path) ||
    !path.every(
      (segment) =>
        typeof segment === "string" || isNonnegativeSafeInteger(segment),
    ) ||
    expected.length !== path.length
  ) {
    return false;
  }
  return expected.every((segment, index) => {
    const observed = path[index];
    if (segment === "{index}") return isNonnegativeSafeInteger(observed);
    if (segment === "{metadataField}") {
      return (
        typeof observed === "string" &&
        ["name", "annotation", "keyOverride", "voiceLeadingBoundary"].includes(
          observed,
        )
      );
    }
    return segment === String(observed);
  });
}

function validateSourceContractAuthorities(
  findings: A0U1EditPlanContractFinding[],
): void {
  requireExact(
    A0_U1_ATOMIC_EDIT_REFUSAL_CODES,
    EXPECTED_NESTED_REFUSAL_PRECEDENCE,
    "EDIT_PLAN_SOURCE_REFUSAL_PRECEDENCE",
    "src/application/application-edit-plan-contract.ts.A0_U1_ATOMIC_EDIT_REFUSAL_CODES",
    "The source refusal vocabulary and precedence must equal the independent frozen 32-code stage machine.",
    findings,
  );
  requireExact(
    A0_U1_RECOVERY_FIELD_COMPARISON_ORDER,
    [
      "placement",
      "selected-global-ordinal",
      "layout-loss-acknowledgement",
      "duration-branch-and-value",
    ],
    "EDIT_PLAN_SOURCE_RECOVERY_FIELD_ORDER",
    "src/application/application-edit-plan-contract.ts.A0_U1_RECOVERY_FIELD_COMPARISON_ORDER",
    "Recovery work must follow refusal precedence: placement, selected ordinal, layout acknowledgement, then duration.",
    findings,
  );
  requireExact(
    A0_U1_FINAL_COLLECTION_LIMIT_COMPARISON_ORDER,
    [
      "final-document-sections",
      "final-section-measures-in-section-order",
      "final-total-measures",
      "final-document-events",
      "occupied-id-records",
      "plan-node-records",
    ],
    "EDIT_PLAN_SOURCE_COLLECTION_LIMIT_ORDER",
    "src/application/application-edit-plan-contract.ts.A0_U1_FINAL_COLLECTION_LIMIT_COMPARISON_ORDER",
    "Final collection limits must stop at the first excess in the independent frozen comparison order.",
    findings,
  );
  requireExact(
    A0_U1_ATOMIC_EDIT_PLAN_EXACT_SHAPE_PRECEDENCE,
    "descriptor-safe-own-data-properties-before-any-envelope-property-read",
    "EDIT_PLAN_SOURCE_EXACT_SHAPE_PRECEDENCE",
    "src/application/application-edit-plan-contract.ts.A0_U1_ATOMIC_EDIT_PLAN_EXACT_SHAPE_PRECEDENCE",
    "Descriptor-safe passive exact-shape validation must precede every envelope property read.",
    findings,
  );
  requireExact(
    A0_U1_ATOMIC_EDIT_OUTER_WORK_POLICY,
    {
      indexPassesByOutcome: {
        applyRefusalBeforeTargetResolution: [],
        applyRefusalFromTargetThroughF3: ["before"],
        applySuccessOrHistoryRefusal: ["before", "after"],
        undoOrRedo: ["restored"],
      },
      indexVisitOrder: "section-then-measure-then-event-source-order",
      stableIdsIndexed: "one-per-indexed-section-measure-or-event-not-document",
      historyEntriesVisited: {
        apply: 0,
        undoOrRedoAfterEntryResolution: 1,
      },
      historyBytesEstimated: {
        beforeValidEstimatorReturn: 0,
        afterValidEstimatorReturn: "exact-returned-nonnegative-safe-integer",
        validOversizeStillCounted: true,
      },
      bookmarksRepaired: {
        beforeSuccessfulF3: 0,
        applySuccessOrHistoryRefusal: 1,
        undoOrRedo: 0,
        unit: "repair-operation-not-rewritten-record",
      },
      requestsCompared: 0,
      transportNotificationsCompared: 0,
      validationCalls: {
        throughF2Refusal: 0,
        f3RefusalSuccessOrHistoryRefusal: 1,
        undoOrRedo: 0,
      },
    },
    "EDIT_PLAN_SOURCE_OUTER_WORK_POLICY",
    "src/application/application-edit-plan-contract.ts.A0_U1_ATOMIC_EDIT_OUTER_WORK_POLICY",
    "The additive runner must retain the exact inherited A0 index, history, bookmark, request, transport, and validation counter meanings.",
    findings,
  );
  requireExact(
    A0_U1_ATOMIC_EDIT_HISTORY_REFUSAL_POLICY,
    {
      invalidEstimate: {
        predicate: "not-a-nonnegative-safe-integer",
        outerCode: "history.byte_estimate_invalid",
        nestedCode: "edit-plan.history-refused",
        path: ["history"],
      },
      oversizedEstimate: {
        predicate: "valid-estimate-greater-than-retained-byte-maximum",
        maximum: MAX_HISTORY_RETAINED_BYTES,
        outerCode: "history.entry_too_large",
        nestedCode: "edit-plan.history-refused",
        path: ["history"],
      },
    },
    "EDIT_PLAN_SOURCE_HISTORY_REFUSAL_POLICY",
    "src/application/application-edit-plan-contract.ts.A0_U1_ATOMIC_EDIT_HISTORY_REFUSAL_POLICY",
    "Invalid and oversized history estimates must map to distinct exact inherited A0 outer codes.",
    findings,
  );
  requireExact(
    A0_U1_ATOMIC_EDIT_DIAGNOSTIC_PATH_ORDER,
    [
      "numeric-numeric-by-number",
      "string-string-by-ecmascript-code-unit",
      "mixed-numeric-before-string",
      "shared-prefix-shorter-first",
    ],
    "EDIT_PLAN_SOURCE_DIAGNOSTIC_PATH_ORDER",
    "src/application/application-edit-plan-contract.ts.A0_U1_ATOMIC_EDIT_DIAGNOSTIC_PATH_ORDER",
    "Mixed DomainPath ordering must remain a complete deterministic total order.",
    findings,
  );
  requireExact(
    A0_U1_ATOMIC_EDIT_PLAN_FOCUS_DERIVATION_ORDER,
    [
      "selection-focus-event",
      "non-chart-insertion-target",
      "first-inserted-structural-ref",
      "chart",
    ],
    "EDIT_PLAN_SOURCE_FOCUS_DERIVATION",
    "src/application/application-edit-plan-contract.ts.A0_U1_ATOMIC_EDIT_PLAN_FOCUS_DERIVATION_ORDER",
    "Focus must be derived solely from after bookmarks, then allocation order, then chart.",
    findings,
  );
  requireExact(
    A0_U1_T0_NEW_MEASURE_COMPLETION_POLICY,
    {
      zeroEvents: "empty",
      nonemptySuccessfulClosedMeasure: "complete",
    },
    "EDIT_PLAN_SOURCE_T0_COMPLETION",
    "src/application/application-edit-plan-contract.ts.A0_U1_T0_NEW_MEASURE_COMPLETION_POLICY",
    "T0 completion conversion must distinguish empty from nonempty successful closed measures.",
    findings,
  );
  requireExact(
    A0_U1_ATOMIC_EDIT_PLAN_TRANSPOSITION_POLICY,
    {
      operationPerformsTransposition: false,
      insertFragment: "preserve-t0-source-spelling-exactly",
      splitEventDuration: "copy-current-chord-and-voicing-exactly",
      joinEventDurations:
        "require-literal-chord-and-voicing-equality-not-enharmonic-equivalence",
      splitSection:
        "commutes-with-spelling-preserving-transposition-of-affected-event-ids",
      joinSections:
        "commutes-with-spelling-preserving-transposition-of-affected-event-ids",
      splitMeasure:
        "commutes-with-spelling-preserving-transposition-of-affected-event-ids",
    },
    "EDIT_PLAN_SOURCE_TRANSPOSITION_POLICY",
    "src/application/application-edit-plan-contract.ts.A0_U1_ATOMIC_EDIT_PLAN_TRANSPOSITION_POLICY",
    "The five spelling-first transposition laws must remain explicit and non-transposing.",
    findings,
  );
  requireExact(
    A0_U1_ATOMIC_EDIT_PLAN_ID_ENTROPY_POLICY,
    {
      factoryCallsOccurOnlyAfterOperationLocalPreflight: true,
      operationLocalPreflight:
        "shape-snapshot-parser-declarations-operation-laws-and-final-bounds",
      postAllocationRefusalsMayConsumeEntropy: ["f2", "f3", "history"],
      allocationOrder: "source-structural-preorder",
      collisionScope: "all-stable-id-kinds-plus-document",
      retryOnFailureOrCollision: false,
      partialCandidatePublication: false,
      partialRemapPublication: false,
      entropyConsumptionRollbackClaimed: false,
      reason:
        "F2, F3, history, factory failure, and collision can refuse after one or more StableIdFactory.next calls; the interface has no reservation or rollback operation, so application state remains unchanged while factory entropy may advance.",
    },
    "EDIT_PLAN_SOURCE_ID_ENTROPY_POLICY",
    "src/application/application-edit-plan-contract.ts.A0_U1_ATOMIC_EDIT_PLAN_ID_ENTROPY_POLICY",
    "ID entropy policy must make operation-local preflight and irreversible factory consumption explicit.",
    findings,
  );
  requireExact(
    A0_U1_ATOMIC_EDIT_PATH_TEMPLATE_GRAMMAR,
    {
      format: "rfc6901-json-pointer-template",
      root: "",
      separator: "/",
      escaping: { tilde: "~0", slash: "~1" },
      dynamicIndex: {
        token: "{index}",
        meaning: "canonical-nonnegative-base10-source-order-array-index",
      },
      dynamicMetadataField: {
        token: "{metadataField}",
        values: ["name", "annotation", "keyOverride", "voiceLeadingBoundary"],
      },
      otherBraceTokensPermitted: false,
      unknownExtraOrSymbolKeyPath: "owning-container-template",
    },
    "EDIT_PLAN_SOURCE_PATH_TEMPLATE_GRAMMAR",
    "src/application/application-edit-plan-contract.ts.A0_U1_ATOMIC_EDIT_PATH_TEMPLATE_GRAMMAR",
    "Refusal paths must use one closed RFC 6901 template grammar with only index and metadata-field variables.",
    findings,
  );
  requireExact(
    A0_U1_ATOMIC_EDIT_PLAN_TEXT_SHAPE_POLICY,
    {
      stage: "exact-runtime-shape",
      refusalCode: "edit-plan.plan-shape-invalid",
      unicodePolicy: "valid-unicode-scalar-string",
      counter: "metadataCodePointsObserved",
      splitSectionMetadataOrder: ["newSectionMetadata"],
      splitMeasureMetadataOrder: ["newMeasureCompletion"],
      joinSectionsMetadataOrder: [
        "expectedLeftMetadata",
        "expectedRightMetadata",
        "resultMetadata",
      ],
      sectionMetadataFieldOrder: ["name", "annotation"],
      sectionNameCodePoints: MAX_SHORT_TEXT_CODE_POINTS,
      sectionAnnotationCodePoints: MAX_LONG_TEXT_CODE_POINTS,
      sectionNameBlankness:
        "ecmascript-String.prototype.trim-result-must-be-nonempty",
      sectionAnnotationBlankness: "empty-or-blank-permitted",
      completionDeclarationOrder: "source-order",
      completionReasonCodePoints: MAX_LONG_TEXT_CODE_POINTS,
      pickupOrIncompleteReasonBlankness:
        "ecmascript-String.prototype.trim-result-must-be-nonempty",
      normalizationOrRepairPermitted: false,
      pathAuthority: [
        "/plan/newSectionMetadata/name",
        "/plan/newSectionMetadata/annotation",
        "/plan/expectedLeftMetadata/name",
        "/plan/expectedLeftMetadata/annotation",
        "/plan/expectedRightMetadata/name",
        "/plan/expectedRightMetadata/annotation",
        "/plan/resultMetadata/name",
        "/plan/resultMetadata/annotation",
        "/plan/newMeasureCompletion/reason",
        "/plan/completionDeclarations/{index}/completion/reason",
        "/plan/placement/completionDeclarations/{index}/completion/reason",
      ],
    },
    "EDIT_PLAN_SOURCE_TEXT_SHAPE_POLICY",
    "src/application/application-edit-plan-contract.ts.A0_U1_ATOMIC_EDIT_PLAN_TEXT_SHAPE_POLICY",
    "Caller-owned metadata and completion reasons must be Unicode- and code-point-bounded before allocation in one exact order.",
    findings,
  );
  requireExact(
    A0_U1_ATOMIC_EDIT_WORK_COUNTER_MAXIMA,
    expectedAtomicEditWorkCounterMaxima(),
    "EDIT_PLAN_SOURCE_COUNTER_MAXIMA",
    "src/application/application-edit-plan-contract.ts.A0_U1_ATOMIC_EDIT_WORK_COUNTER_MAXIMA",
    "The source must export the complete independently reconstructed ceiling for every nested counter.",
    findings,
  );
  requireExact(
    Object.keys(A0_U1_ATOMIC_EDIT_WORK_COUNTER_MAXIMA),
    A0_U1_ATOMIC_EDIT_WORK_COUNTER_NAMES,
    "EDIT_PLAN_SOURCE_COUNTER_MAXIMA_KEYS",
    "src/application/application-edit-plan-contract.ts.A0_U1_ATOMIC_EDIT_WORK_COUNTER_MAXIMA",
    "Every and only published nested work counter must have one exact source maximum in counter order.",
    findings,
  );
  requireExact(
    A0_U1_ATOMIC_EDIT_FIRST_EXCESS_WORK_COUNTERS,
    [
      "planNodesVisited",
      "sourceCodePointsObserved",
      "sourceUtf8BytesObserved",
      "quickEntryIssueCodesCompared",
      "warningAcknowledgementsCompared",
      "draftSectionsVisited",
      "draftMeasuresVisited",
      "draftEventsVisited",
      "completionDeclarationsVisited",
      "metadataCodePointsObserved",
    ],
    "EDIT_PLAN_SOURCE_FIRST_EXCESS_COUNTERS",
    "src/application/application-edit-plan-contract.ts.A0_U1_ATOMIC_EDIT_FIRST_EXCESS_WORK_COUNTERS",
    "Only counters whose scans enter a first-excess witness may use their frozen excess ceiling.",
    findings,
  );
  requireExact(
    A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.receiptBase,
    [
      "schema",
      "commandKind",
      "commandId",
      "documentId",
      "baseRevision",
      "committedRevision",
      "quickEntryDisposition",
      "historyEntriesAppended",
      "effects",
      "work",
    ],
    "EDIT_PLAN_SOURCE_RECEIPT_BASE_KEYS",
    "src/application/application-edit-plan-contract.ts.A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.receiptBase",
    "Receipt base keys must exclude branch data and duplicate work counters.",
    findings,
  );
  requireExact(
    A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.receiptOperation,
    [
      "planKind",
      "insertLane",
      "placementKind",
      "allocatedIdentities",
      "removedIdentities",
      "survivorId",
      "insertSource",
      "completionMeasureIds",
      "timelineDisposition",
      "bookmarks",
    ],
    "EDIT_PLAN_SOURCE_RECEIPT_OPERATION_KEYS",
    "src/application/application-edit-plan-contract.ts.A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.receiptOperation",
    "Receipt operation keys must carry all discriminants and branch-correlated evidence.",
    findings,
  );
  requireExact(
    A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.bookmarkReceiptCore,
    EXPECTED_BOOKMARK_RECEIPT_CORE_KEYS,
    "EDIT_PLAN_SOURCE_BOOKMARK_RECEIPT_KEYS",
    "src/application/application-edit-plan-contract.ts.A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.bookmarkReceiptCore",
    "Bookmark receipt core must include operation, clear bits, and exact focus evidence.",
    findings,
  );
  requireExact(
    A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.joinSectionsBookmarkReceiptExtension,
    EXPECTED_JOIN_SECTIONS_BOOKMARK_RECEIPT_EXTENSION_KEYS,
    "EDIT_PLAN_SOURCE_JOIN_SECTION_BOOKMARK_KEYS",
    "src/application/application-edit-plan-contract.ts.A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.joinSectionsBookmarkReceiptExtension",
    "Join-section receipts must distinguish empty from nonempty right-section entry mapping.",
    findings,
  );
  requireExact(
    A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.createdInsertionBookmarkReceiptExtension,
    EXPECTED_CREATED_INSERTION_RECEIPT_EXTENSION_KEYS,
    "EDIT_PLAN_SOURCE_CREATED_INSERTION_BOOKMARK_KEYS",
    "src/application/application-edit-plan-contract.ts.A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.createdInsertionBookmarkReceiptExtension",
    "Insert receipts must freeze insertionCreated to the null-to-non-null creation branch only.",
    findings,
  );
  requireExact(
    A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.workEvidence,
    [...A0_U1_ATOMIC_EDIT_WORK_COUNTER_NAMES, "termination"],
    "EDIT_PLAN_SOURCE_WORK_EVIDENCE_KEYS",
    "src/application/application-edit-plan-contract.ts.A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.workEvidence",
    "Work-evidence exact keys must equal the complete counter tuple followed by termination.",
    findings,
  );

  requireExact(
    A0_U1_ATOMIC_EDIT_REFUSAL_AUTHORITY.map((row) => row.code),
    A0_U1_ATOMIC_EDIT_REFUSAL_CODES,
    "EDIT_PLAN_SOURCE_REFUSAL_AUTHORITY_ORDER",
    "src/application/application-edit-plan-contract.ts.A0_U1_ATOMIC_EDIT_REFUSAL_AUTHORITY",
    "Refusal authority rows must be total and preserve the refusal precedence tuple.",
    findings,
  );
  const refusalAuthorityByCode = new Map(
    A0_U1_ATOMIC_EDIT_REFUSAL_AUTHORITY.map((row) => [row.code, row]),
  );
  requireExact(
    refusalAuthorityByCode.get("edit-plan.command-shape-invalid")
      ?.pathAuthority,
    [
      "",
      "/id",
      "/label",
      "/expectedDocumentId",
      "/expectedRevision",
      "/logicalTimeMs",
      "/coalescing",
      "/kind",
      "/plan",
    ],
    "EDIT_PLAN_SOURCE_COMMAND_PATH_AUTHORITY",
    "src/application/application-edit-plan-contract.ts.A0_U1_ATOMIC_EDIT_REFUSAL_AUTHORITY.command-shape",
    "Command-shape path authority must be total over the root and every envelope field.",
    findings,
  );
  requireExact(
    refusalAuthorityByCode.get("edit-plan.target-missing")?.pathAuthority,
    [
      "/plan/placement/measureId",
      "/plan/placement/beforeEventId",
      "/plan/placement/sectionId",
      "/plan/placement/beforeMeasureId",
      "/plan/placement/beforeSectionId",
      "/plan/source/quickEntrySnapshot/target/sectionId",
      "/plan/source/quickEntrySnapshot/target/measureId",
      "/plan/source/quickEntrySnapshot/target/eventId",
      "/plan/eventId",
      "/plan/leftEventId",
      "/plan/rightEventId",
      "/plan/sectionId",
      "/plan/beforeMeasureId",
      "/plan/leftSectionId",
      "/plan/rightSectionId",
    ],
    "EDIT_PLAN_SOURCE_TARGET_PATH_AUTHORITY",
    "src/application/application-edit-plan-contract.ts.A0_U1_ATOMIC_EDIT_REFUSAL_AUTHORITY.target-missing",
    "Target-missing authority must include every placement, QuickEntry boundary, event, measure, and section ID target.",
    findings,
  );
  const planShapePaths: readonly string[] =
    refusalAuthorityByCode.get("edit-plan.plan-shape-invalid")?.pathAuthority ??
    [];
  if (
    !A0_U1_ATOMIC_EDIT_PLAN_TEXT_SHAPE_POLICY.pathAuthority.every(
      (template) =>
        planShapePaths.includes(template) ||
        planShapePaths.includes(
          template.replace(/\/(?:name|annotation)$/u, "/{metadataField}"),
        ),
    )
  ) {
    addFinding(
      findings,
      "EDIT_PLAN_SOURCE_TEXT_PATH_AUTHORITY",
      "src/application/application-edit-plan-contract.ts.A0_U1_ATOMIC_EDIT_REFUSAL_AUTHORITY.plan-shape",
      "Every bounded metadata and completion-reason path must belong to plan-shape refusal authority.",
    );
  }
  requireExact(
    refusalAuthorityByCode.get("edit-plan.section-metadata-mismatch")
      ?.pathAuthority,
    [
      "/plan/placement/sectionDeclarations/{index}",
      "/plan/placement/sectionDeclarations/{index}/sourceSectionOrdinal",
      "/plan/placement/sectionDeclarations/{index}/voiceLeadingBoundary",
      "/plan/expectedLeftMetadata/{metadataField}",
      "/plan/expectedRightMetadata/{metadataField}",
    ],
    "EDIT_PLAN_SOURCE_SECTION_METADATA_PATH_AUTHORITY",
    "src/application/application-edit-plan-contract.ts.A0_U1_ATOMIC_EDIT_REFUSAL_AUTHORITY.section-metadata",
    "Section-metadata mismatch paths must retain complete plan and placement prefixes plus index/field templates.",
    findings,
  );
  for (const [index, row] of A0_U1_ATOMIC_EDIT_REFUSAL_AUTHORITY.entries()) {
    checkExactKeys(
      row,
      ["code", "precedence", "stage", "condition", "pathAuthority"],
      "EDIT_PLAN_SOURCE_REFUSAL_AUTHORITY_KEYS",
      `src/application/application-edit-plan-contract.ts.A0_U1_ATOMIC_EDIT_REFUSAL_AUTHORITY[${String(index)}]`,
      findings,
    );
    if (
      row.precedence !== index ||
      !A0_U1_ATOMIC_EDIT_PLAN_RUNNER_STAGE_ORDER.includes(row.stage) ||
      !isBoundedToken(row.condition, MAX_LONG_TEXT_CODE_POINTS) ||
      !Array.isArray(row.pathAuthority) ||
      row.pathAuthority.length === 0 ||
      new Set(row.pathAuthority).size !== row.pathAuthority.length ||
      !row.pathAuthority.every(
        (template) => parseAuthorityPointerTemplate(template) !== null,
      )
    ) {
      addFinding(
        findings,
        "EDIT_PLAN_SOURCE_REFUSAL_AUTHORITY_VALUE",
        `src/application/application-edit-plan-contract.ts.A0_U1_ATOMIC_EDIT_REFUSAL_AUTHORITY[${String(index)}]`,
        "Every refusal authority needs exact precedence, a real runner stage, bounded condition text, and unique canonical pointer templates.",
      );
    }
  }
}

function validateRootContract(
  contract: JsonObject,
  allowPendingFreeze: boolean,
  findings: A0U1EditPlanContractFinding[],
): void {
  validateSourceContractAuthorities(findings);
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
  /*
   * R1 supersession pin: version 2 replaced the v1 syntax-normalization
   * literal, non-null-only insertion receipt, and 6,768/6,769 text-work
   * ceiling. Restoring any superseded v1 identity is packet tampering.
   */
  requireExact(
    A0_U1_ATOMIC_EDIT_PLAN_CONTRACT_SCHEMA,
    "changes.application.atomic-edit-plan-contract.v2",
    "EDIT_PLAN_SOURCE_CONTRACT_SCHEMA_VERSION",
    "src/application/application-edit-plan-contract.ts.A0_U1_ATOMIC_EDIT_PLAN_CONTRACT_SCHEMA",
    "The source contract schema must remain the reconciled v2 identity.",
    findings,
  );
  requireExact(
    A0_U1_ATOMIC_EDIT_PLAN_RECEIPT_SCHEMA,
    "changes.application.atomic-edit-plan-receipt.v2",
    "EDIT_PLAN_SOURCE_RECEIPT_SCHEMA_VERSION",
    "src/application/application-edit-plan-contract.ts.A0_U1_ATOMIC_EDIT_PLAN_RECEIPT_SCHEMA",
    "The receipt schema must remain the reconciled v2 identity.",
    findings,
  );
  requireExact(
    A0_U1_ATOMIC_EDIT_PLAN_POLICY_VERSION,
    2,
    "EDIT_PLAN_SOURCE_POLICY_VERSION",
    "src/application/application-edit-plan-contract.ts.A0_U1_ATOMIC_EDIT_PLAN_POLICY_VERSION",
    "The policy version must remain the reconciled version 2.",
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
    A0_U1_ATOMIC_EDIT_LIMITS,
    EXPECTED_ATOMIC_EDIT_LIMITS,
    "EDIT_PLAN_SOURCE_LIMITS",
    "src/application/application-edit-plan-contract.ts.A0_U1_ATOMIC_EDIT_LIMITS",
    "Source edit-plan limits must match the independent domain/A0 reconstruction.",
    findings,
  );
  requireExact(
    contract["limits"],
    EXPECTED_ATOMIC_EDIT_LIMITS,
    "EDIT_PLAN_PACKET_LIMITS",
    "a0-u1-edit-plan-contract.json.limits",
    "Packet edit-plan limits must match the independent domain/A0 reconstruction.",
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
  if (!allowPendingFreeze) {
    requireExact(
      contract["counts"],
      EXPECTED_COUNTS,
      "EDIT_PLAN_DECLARED_COUNTS",
      "a0-u1-edit-plan-contract.json.counts",
      "Declared packet counts must match the independently reviewed frozen inventory.",
      findings,
    );
  }
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
    contract["productionImplementationClaim"] !== true ||
    contract["u1UiCompletionClaim"] !== false ||
    contract["humanAcceptanceClaim"] !== true ||
    contract["expertReviewClaim"] !== false ||
    contract["productionOutputUsedAsOracle"] !== false ||
    contract["expectedValuesGenerated"] !== false
  ) {
    addFinding(
      findings,
      "EDIT_PLAN_SCOPE_CLAIM",
      "a0-u1-edit-plan-contract.json",
      "The packet must remain an independent A0 contract carrying exactly the recorded R1 human acceptance and live production implementation ('Accept A0/U1 reconciliation packet R1', 2026-07-24) and no UI, expert, or production-oracle claim.",
    );
  }
  /*
   * Post-cutover: the proposed tuple equals the merged live tuple, whose
   * first fifteen kinds must remain exactly the accepted historical A0 tuple
   * with `apply-edit-plan` as the sole authorized suffix.
   */
  requireExact(
    A0_U1_PROPOSED_APPLICATION_COMMAND_KINDS,
    [...APPLICATION_COMMAND_KINDS],
    "EDIT_PLAN_ADDITIVE_COMMAND_ORDER",
    "src/application/application-edit-plan-contract.ts",
    "The proposed tuple must equal the merged live tuple exactly.",
    findings,
  );
  requireExact(
    [...APPLICATION_COMMAND_KINDS.slice(15)],
    ["apply-edit-plan"],
    "EDIT_PLAN_LIVE_SUFFIX",
    "src/application/application-state-contract.ts.APPLICATION_COMMAND_KINDS",
    "The sole live suffix after the historical fifteen kinds must be the authorized apply-edit-plan amendment.",
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
  /*
   * Post-cutover drift control: the live tuple is exactly the accepted
   * historical fifteen kinds followed by the sole authorized R1 amendment.
   * Historical evidence is never rewritten as though the sixteenth kind had
   * always existed.
   */
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
      "apply-edit-plan",
    ],
    "EDIT_PLAN_EXISTING_A0_DRIFT",
    "src/application/application-state-contract.ts.APPLICATION_COMMAND_KINDS",
    "The live command tuple must be the accepted historical fifteen kinds plus the sole authorized apply-edit-plan suffix.",
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
  idFactoryEvidence: JsonObject | null;
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
    const phase = row["phase"];
    if (
      (phase === "apply" && lawIds.length === 0) ||
      ((phase === "undo" || phase === "redo") && lawIds.length !== 0) ||
      lawIds.some(
        (lawId) => !A0_U1_ATOMIC_EDIT_LAW_IDS.includes(lawId as never),
      )
    ) {
      addFinding(
        findings,
        "EDIT_PLAN_TRANSITION_LAWS",
        `edit-plan-cases.json.literalCatalog.transitions.${transitionId}.lawIds`,
        "Apply transitions must cite at least one declared law; state-only undo/redo transitions cite none and remain owned by the inverse-history obligation.",
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
        throw new Error(
          "state and expected transition must materialize objects",
        );
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
      const resultObject = isObject(result) ? result : null;
      const idFactoryEvidence = validateIdFactoryEvidence(
        command,
        resultObject,
        expected["counters"],
        expected["allocationTrace"],
        expected["idFactoryEvidence"],
        row["phase"],
        row["operation"],
        parentCase?.["category"],
        `edit-plan-cases.json.literalCatalog.transitions.${transitionId}.expected.idFactoryEvidence`,
        findings,
      );
      if (!isObject(result)) {
        addFinding(
          findings,
          "EDIT_PLAN_RESULT_LITERAL",
          `edit-plan-cases.json.literalCatalog.transitions.${transitionId}.expected.result`,
          "Expected result must be one complete literal transition-result object.",
        );
      } else {
        let causalOracle: CausalOracleResult | null = null;
        if (row["phase"] === "apply") {
          causalOracle = validateCausalRefusalOracle(
            before,
            command,
            expected,
            result,
            parserEvidence,
            expected["allocationTrace"],
            `edit-plan-cases.json.literalCatalog.transitions.${transitionId}.expected.result`,
            findings,
          );
        }
        validateHistoryEstimatorEvidence(
          before,
          command,
          expected,
          row["phase"],
          causalOracle,
          `edit-plan-cases.json.literalCatalog.transitions.${transitionId}.expected.historyEstimatorEvidence`,
          findings,
        );
        validateExactOuterWorkOracle(
          before,
          afterState,
          command,
          expected,
          result,
          row["phase"],
          causalOracle,
          `edit-plan-cases.json.literalCatalog.transitions.${transitionId}.expected`,
          findings,
        );
        validateAtomicEditResultDetail(
          before,
          afterState,
          isObject(command) ? command : {},
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
          idFactoryEvidence,
        });
      }
      validateTransitionMusicalEvidence(
        before,
        afterState,
        expected,
        row["operation"],
        resultObject,
        `edit-plan-cases.json.literalCatalog.transitions.${transitionId}.expected`,
        findings,
      );
      validateAllocationTrace(
        before,
        command,
        resultObject,
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
        resultObject,
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
            (!canonicalPlacementTargetHasCorrectParent(
              before["document"],
              plan["placement"],
            ) ||
              !canonicalPlacementTargetMatches(before["document"], plan))
          ) {
            addFinding(
              findings,
              "EDIT_PLAN_TARGET_PARENT_COMMITTED",
              `edit-plan-cases.json.literalCatalog.transitions.${transitionId}.command.plan.placement`,
              "A committed insertion target and destination must resolve to the same extant parent and sibling slot.",
            );
          }
          if (
            plan["kind"] === "insert-fragment" &&
            !completeDraftIntoMeasureContractHolds(before["document"], plan)
          ) {
            addFinding(
              findings,
              "EDIT_PLAN_COMPLETE_DRAFT_NONEMPTY_MEASURE_COMMITTED",
              `edit-plan-cases.json.literalCatalog.transitions.${transitionId}.command.plan.placement`,
              "Complete-draft into-measure success requires an empty target, append placement, measure-start/end target, and one empty-to-complete declaration.",
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

  const expectedObligationsById = new Map<
    string,
    (typeof EXPECTED_OBLIGATION_ROWS)[number]
  >(EXPECTED_OBLIGATION_ROWS.map((row) => [row.id, row]));
  requireExact(
    [...obligations.keys()],
    EXPECTED_OBLIGATION_ROWS.map((row) => row.id),
    "EDIT_PLAN_OBLIGATION_INVENTORY",
    "edit-plan-cases.json.obligationRows",
    "The obligation ledger must retain the exact reviewed 24-row order and inventory.",
    findings,
  );
  for (const [obligationId, row] of obligations) {
    const obligationPath = `edit-plan-cases.json.obligationRows.${obligationId}`;
    checkExactKeys(
      row,
      EXPECTED_OBLIGATION_KEYS,
      "EDIT_PLAN_OBLIGATION_KEYS",
      obligationPath,
      findings,
    );
    const expectedObligation = expectedObligationsById.get(obligationId);
    if (expectedObligation !== undefined) {
      requireExact(
        {
          id: row["id"],
          category: row["category"],
          operation: row["operation"],
          semanticPredicate: row["semanticPredicate"],
        },
        expectedObligation,
        "EDIT_PLAN_OBLIGATION_IDENTITY",
        obligationPath,
        "Obligation ID, category, operation, and semantic predicate are a closed reviewed vocabulary.",
        findings,
      );
    }
    if (
      typeof row["requirement"] !== "string" ||
      codePointLength(row["requirement"]) === 0 ||
      codePointLength(row["requirement"]) > MAX_LONG_TEXT_CODE_POINTS
    ) {
      addFinding(
        findings,
        "EDIT_PLAN_OBLIGATION_REQUIREMENT",
        `${obligationPath}.requirement`,
        "Every obligation needs one nonempty bounded human-readable requirement.",
      );
    }
    checkReferenceIds(
      row["transitionIds"],
      transitions,
      "EDIT_PLAN_OBLIGATION_TRANSITION_REF",
      `${obligationPath}.transitionIds`,
      findings,
    );
    if (row["operation"] !== "pipeline") {
      for (const transitionId of stringsAt(row["transitionIds"])) {
        if (transitions.get(transitionId)?.["operation"] !== row["operation"]) {
          addFinding(
            findings,
            "EDIT_PLAN_OBLIGATION_OPERATION_SCOPE",
            `${obligationPath}.transitionIds.${transitionId}`,
            "An operation-owned obligation may cite only transitions for that operation.",
          );
        }
      }
    }
  }

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
      if (
        typeof interval !== "number" ||
        !Number.isSafeInteger(interval) ||
        interval === 0
      ) {
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
          const baseReceipt = isObject(baseTransition.result["editPlanReceipt"])
            ? baseTransition.result["editPlanReceipt"]
            : {};
          const transposedReceipt = isObject(
            transposedTransition.result["editPlanReceipt"],
          )
            ? transposedTransition.result["editPlanReceipt"]
            : {};
          const baseAllocations = recordsAt(baseReceipt["allocatedIdentities"]);
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
              independentlyTransposePitchData(baseTransition.command, interval),
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
  /*
   * Accepted A0 replay behavior: the four replay effects carry the direction
   * as their reasonCode, never a substituted label.
   */
  const replayDirection = expectedOutcome === "undone" ? "undo" : "redo";
  const replayEffects = Array.isArray(transition.result["effects"])
    ? transition.result["effects"]
    : [];
  requireExact(
    replayEffects.map((effect) =>
      isObject(effect) ? effect["reasonCode"] : null,
    ),
    replayEffects.map(() => replayDirection),
    "EDIT_PLAN_HISTORY_REPLAY_EFFECT_REASON",
    `${path}.expected.result.effects`,
    "Replay effects must carry the exact accepted A0 direction reasonCode.",
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
        transition.row["phase"] === "undo" && transition.result["ok"] === true,
    );
    const redoRows = operationRows.filter(
      (transition) =>
        transition.row["phase"] === "redo" && transition.result["ok"] === true,
    );
    /*
     * R1: insert-fragment proves both honest insertion receipt branches with
     * a golden trio each — the moved-insertion branch and the null-to-created
     * branch. Every other plan kind has exactly one trio.
     */
    const expectedTrios = operation === "insert-fragment" ? 2 : 1;
    if (
      undoRows.length !== expectedTrios ||
      redoRows.length !== expectedTrios
    ) {
      addFinding(
        findings,
        "EDIT_PLAN_HISTORY_TRIO_CARDINALITY",
        `edit-plan-cases.json.literalCatalog.transitions.${operation}`,
        "Every plan kind must have exactly one successful undo and one successful redo witness per required receipt branch (two for insert-fragment).",
      );
      continue;
    }
    const usedRedoIds = new Set<string>();
    let nullInsertionTrios = 0;
    for (const undo of undoRows) {
      validateHistoryReplayState(undo, "undone", findings);
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
      const redo = redoRows.find(
        (candidate) =>
          !usedRedoIds.has(candidate.id) &&
          jsonDeepEqual(candidate.before, undo.after),
      );
      if (redo === undefined) {
        addFinding(
          findings,
          "EDIT_PLAN_UNDO_REDO_CHAIN",
          `edit-plan-cases.json.literalCatalog.transitions.${undo.id}.beforeState`,
          "Every undo witness must chain to exactly one unused redo whose before-state is the complete undo after-state.",
        );
        continue;
      }
      usedRedoIds.add(redo.id);
      validateHistoryReplayState(redo, "redone", findings);
      const movedBeforeBookmarks = isObject(movedEntry["beforeBookmarks"])
        ? movedEntry["beforeBookmarks"]
        : {};
      if (
        operation === "insert-fragment" &&
        movedBeforeBookmarks["insertion"] === null
      ) {
        nullInsertionTrios += 1;
        const applyReceipt = isObject(apply.result["editPlanReceipt"])
          ? apply.result["editPlanReceipt"]
          : {};
        const applyBookmarkReceipt = isObject(applyReceipt["bookmarks"])
          ? applyReceipt["bookmarks"]
          : {};
        if (
          applyBookmarkReceipt["insertionPolicy"] !==
            "create-after-last-inserted" ||
          applyBookmarkReceipt["insertionRewrite"] !== null ||
          !isObject(applyBookmarkReceipt["insertionCreated"])
        ) {
          addFinding(
            findings,
            "EDIT_PLAN_CREATED_INSERTION_TRIO_RECEIPT",
            `edit-plan-cases.json.literalCatalog.transitions.${apply.id}.expected.result.editPlanReceipt.bookmarks`,
            "The null-insertion golden apply must record the create-after-last-inserted receipt with insertionCreated and no fabricated rewrite.",
          );
        }
      }
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
    if (operation === "insert-fragment" && nullInsertionTrios !== 1) {
      addFinding(
        findings,
        "EDIT_PLAN_CREATED_INSERTION_TRIO",
        "edit-plan-cases.json.literalCatalog.transitions.insert-fragment",
        "Insert-fragment requires exactly one golden null-insertion trio whose history row records a null before insertion bookmark.",
      );
    }
  }
}

function nestedRefusalCode(transition: MaterializedTransition): string | null {
  const refusal = isObject(transition.result["editPlanRefusal"])
    ? transition.result["editPlanRefusal"]
    : null;
  return typeof refusal?.["code"] === "string" ? refusal["code"] : null;
}

function editPlanWork(transition: MaterializedTransition): JsonObject | null {
  const detail =
    transition.result["ok"] === true
      ? transition.result["editPlanReceipt"]
      : transition.result["editPlanRefusal"];
  return isObject(detail) && isObject(detail["work"]) ? detail["work"] : null;
}

function transitionPlan(transition: MaterializedTransition): JsonObject | null {
  return isObject(transition.command) && isObject(transition.command["plan"])
    ? transition.command["plan"]
    : null;
}

function transitionCaseCategory(
  transition: MaterializedTransition,
  cases: ReadonlyMap<string, JsonObject>,
): unknown {
  const caseId = transition.row["caseId"];
  return typeof caseId === "string" ? cases.get(caseId)?.["category"] : null;
}

function forbiddenKeysPresent(
  value: unknown,
  forbidden: ReadonlySet<string>,
  output = new Set<string>(),
): ReadonlySet<string> {
  if (Array.isArray(value)) {
    for (const child of value) forbiddenKeysPresent(child, forbidden, output);
    return output;
  }
  if (!isObject(value)) return output;
  for (const [key, child] of Object.entries(value)) {
    if (forbidden.has(key)) output.add(key);
    forbiddenKeysPresent(child, forbidden, output);
  }
  return output;
}

function quickEntryMismatchFields(
  transition: MaterializedTransition,
): readonly string[] {
  const plan = transitionPlan(transition);
  const source = isObject(plan?.["source"]) ? plan["source"] : null;
  const snapshot = isObject(source?.["quickEntrySnapshot"])
    ? source["quickEntrySnapshot"]
    : null;
  const quickEntry = isObject(transition.before["quickEntry"])
    ? transition.before["quickEntry"]
    : null;
  if (snapshot === null || quickEntry === null || source === null) return [];
  const mismatches: string[] = [];
  if (snapshot["sourceText"] !== quickEntry["text"]) {
    mismatches.push("sourceText");
  }
  if (
    snapshot["baseRevision"] !== quickEntry["baseRevision"] ||
    snapshot["baseRevision"] !== transition.before["revision"]
  ) {
    mismatches.push("baseRevision");
  }
  if (!jsonDeepEqual(snapshot["target"], quickEntry["target"])) {
    mismatches.push("target");
  }
  if (!jsonDeepEqual(snapshot["issueCodes"], quickEntry["issueCodes"])) {
    mismatches.push("issueCodes");
  }
  if (snapshot["expectedStatus"] !== quickEntry["status"]) {
    mismatches.push("expectedStatus");
  }
  if (snapshot["expectedLane"] !== source["kind"]) {
    mismatches.push("expectedLane");
  }
  return mismatches;
}

function requireObligation(
  condition: boolean,
  obligationId: string,
  message: string,
  findings: A0U1EditPlanContractFinding[],
): void {
  if (!condition) {
    addFinding(
      findings,
      "EDIT_PLAN_OBLIGATION_SEMANTIC",
      `edit-plan-cases.json.obligationRows.${obligationId}`,
      message,
    );
  }
}

function validateObligationSemantics(
  obligations: ReadonlyMap<string, JsonObject>,
  materialized: ReadonlyMap<string, MaterializedTransition>,
  cases: ReadonlyMap<string, JsonObject>,
  transposition: ReadonlyMap<string, JsonObject>,
  controls: ReadonlyMap<string, JsonObject>,
  findings: A0U1EditPlanContractFinding[],
): void {
  const allTransitions = [...materialized.values()];
  const rowsFor = (obligationId: string): readonly MaterializedTransition[] =>
    stringsAt(obligations.get(obligationId)?.["transitionIds"])
      .map((transitionId) => materialized.get(transitionId))
      .filter(
        (transition): transition is MaterializedTransition =>
          transition !== undefined,
      );
  const successApply = (
    rows: readonly MaterializedTransition[],
  ): readonly MaterializedTransition[] =>
    rows.filter(
      (transition) =>
        transition.row["phase"] === "apply" && transition.result["ok"] === true,
    );
  const refusedApply = (
    rows: readonly MaterializedTransition[],
  ): readonly MaterializedTransition[] =>
    rows.filter(
      (transition) =>
        transition.row["phase"] === "apply" &&
        transition.result["ok"] === false &&
        nestedRefusalCode(transition) !== null,
    );
  const exactOperationSet = (
    rows: readonly MaterializedTransition[],
  ): boolean =>
    jsonDeepEqual(
      [...new Set(rows.map((transition) => transition.row["operation"]))],
      A0_U1_ATOMIC_EDIT_PLAN_KINDS,
    );

  {
    const id = "A0U1-OBL-001-REFUSAL-VOCABULARY";
    const runtimeCodes = new Set(
      refusedApply(rowsFor(id))
        .map(nestedRefusalCode)
        .filter((code): code is string => code !== null),
    );
    const unreachableCodes = Object.keys(A0_U1_STATIC_REFUSAL_REACHABILITY);
    const reachableCodes = A0_U1_ATOMIC_EDIT_REFUSAL_CODES.filter(
      (code) => !unreachableCodes.includes(code),
    );
    const staticDominance =
      jsonDeepEqual(A0_U1_FRAGMENT_SOURCE_REFUSAL_REACHABILITY, {
        "edit-plan.source-code-points-exceeded":
          "static-dominated-by-accepted-quick-entry-invariants",
        "edit-plan.source-unicode-invalid":
          "static-dominated-by-accepted-quick-entry-invariants",
        "edit-plan.source-utf8-bytes-exceeded":
          "static-dominated-by-accepted-quick-entry-invariants",
      }) &&
      jsonDeepEqual(A0_U1_STATIC_REFUSAL_REACHABILITY, {
        "edit-plan.source-code-points-exceeded":
          "static-dominated-by-accepted-quick-entry-invariants",
        "edit-plan.source-unicode-invalid":
          "static-dominated-by-accepted-quick-entry-invariants",
        "edit-plan.source-utf8-bytes-exceeded":
          "static-dominated-by-accepted-quick-entry-invariants",
        "edit-plan.timeline-limit-exceeded":
          "static-dominated-by-final-event-and-meter-capacity-invariants",
      }) &&
      jsonDeepEqual(
        A0_U1_ATOMIC_EDIT_LIMITS.fragmentSourceCodePoints,
        MAX_QUICK_ENTRY_CODE_POINTS,
      ) &&
      A0_U1_ATOMIC_EDIT_LIMITS.fragmentSourceUtf8Bytes ===
        4 * A0_U1_ATOMIC_EDIT_LIMITS.fragmentSourceCodePoints &&
      jsonDeepEqual(
        A0_U1_ATOMIC_EDIT_LIMITS.quickEntryIssueCodes,
        MAX_DRAFT_ISSUES,
      ) &&
      MAX_A0_U1_REACHABLE_FINAL_TIMELINE_QUARTER_NOTE_BEATS ===
        (MAX_DOCUMENT_CHORD_EVENTS * MAX_BEATS_PER_BAR * 4) / BEAT_UNITS[0] &&
      MAX_A0_U1_REACHABLE_FINAL_TIMELINE_QUARTER_NOTE_BEATS <
        A0_U1_ATOMIC_EDIT_LIMITS.finalTimelineQuarterNoteBeats;
    requireObligation(
      jsonDeepEqual([...runtimeCodes], reachableCodes) &&
        !allTransitions.some((transition) =>
          unreachableCodes.includes(String(nestedRefusalCode(transition))),
        ) &&
        staticDominance,
      id,
      "The ledger must cite runtime witnesses for every reachable nested refusal in contract order, must not fabricate the three source-preflight or defensive timeline branches, and must retain both static dominance proofs.",
      findings,
    );
  }

  {
    const id = "A0U1-OBL-002-COMPLETE-PLACEMENTS";
    const completeSuccesses = successApply(rowsFor(id)).filter((transition) => {
      const source = transitionPlan(transition)?.["source"];
      return isObject(source) && source["kind"] === "complete-draft";
    });
    const placements = completeSuccesses.map((transition) => {
      const placement = transitionPlan(transition)?.["placement"];
      return isObject(placement) ? placement["kind"] : null;
    });
    const exactEmptyMeasureWitness = completeSuccesses
      .filter((transition) => {
        const placement = transitionPlan(transition)?.["placement"];
        return isObject(placement) && placement["kind"] === "into-measure";
      })
      .every((transition) => {
        const plan = transitionPlan(transition);
        return (
          plan !== null &&
          completeDraftIntoMeasureContractHolds(
            transition.before["document"],
            plan,
          ) &&
          transition.parserEvidence?.outcome === "success" &&
          transition.parserEvidence.sectionRows.length === 1 &&
          transition.parserEvidence.measureRows.length === 1 &&
          transition.parserEvidence.insertableRows.length > 0 &&
          jsonDeepEqual(
            transition.parserEvidence.measureRows[0]?.["completion"],
            { kind: "complete" },
          )
        );
      });
    requireObligation(
      jsonDeepEqual(
        [...new Set(placements)],
        ["into-measure", "into-section", "into-document"],
      ) && exactEmptyMeasureWitness,
      id,
      "Complete-draft successes must cover all placements, and into-measure must prove a nonempty one-measure T0 draft replacing an empty target's completion.",
      findings,
    );
  }

  {
    const id = "A0U1-OBL-003-QUICK-ENTRY-SIX-FIELDS";
    const rows = refusedApply(rowsFor(id)).filter(
      (transition) =>
        nestedRefusalCode(transition) ===
        "edit-plan.quick-entry-snapshot-mismatch",
    );
    const singletonFields = rows.flatMap((transition) => {
      const mismatches = quickEntryMismatchFields(transition);
      return mismatches.length === 1 ? mismatches : [];
    });
    requireObligation(
      rows.every(
        (transition) => quickEntryMismatchFields(transition).length === 1,
      ) &&
        jsonDeepEqual(
          [...new Set(singletonFields)],
          [
            "sourceText",
            "baseRevision",
            "target",
            "issueCodes",
            "expectedStatus",
            "expectedLane",
          ],
        ),
      id,
      "Six distinct refusal witnesses must stale exactly one QuickEntry snapshot field apiece.",
      findings,
    );
  }

  {
    const id = "A0U1-OBL-004-TARGET-PARENT";
    const rows = rowsFor(id);
    const valid = successApply(rows).some((transition) => {
      const plan = transitionPlan(transition);
      const placement = plan?.["placement"];
      return (
        plan !== null &&
        isObject(placement) &&
        canonicalPlacementTargetHasCorrectParent(
          transition.before["document"],
          placement,
        ) &&
        canonicalPlacementTargetMatches(transition.before["document"], plan)
      );
    });
    const crossParentRefusal = refusedApply(rows).some((transition) => {
      const plan = transitionPlan(transition);
      const placement = plan?.["placement"];
      return (
        nestedRefusalCode(transition) === "edit-plan.destination-invalid" &&
        plan !== null &&
        isObject(placement) &&
        (!canonicalPlacementTargetHasCorrectParent(
          transition.before["document"],
          placement,
        ) ||
          !canonicalPlacementTargetMatches(transition.before["document"], plan))
      );
    });
    requireObligation(
      valid && crossParentRefusal,
      id,
      "Target-parent proof needs both a canonical successful placement and an actually cross-parent destination refusal.",
      findings,
    );
  }

  {
    const id = "A0U1-OBL-005-DURATION-CANONICAL";
    const rows = rowsFor(id);
    const codes = new Set(refusedApply(rows).map(nestedRefusalCode));
    requireObligation(
      successApply(rows).length > 0 &&
        codes.has("edit-plan.duration-invalid") &&
        codes.has("edit-plan.duration-sum-mismatch"),
      id,
      "Canonical-duration proof needs a successful exact-rational operation plus distinct invalid-shape/value and exact-sum refusals.",
      findings,
    );
  }

  {
    const id = "A0U1-OBL-006-SCALAR-RANGE-METADATA";
    const refusals = refusedApply(rowsFor(id));
    const codes = new Set(refusals.map(nestedRefusalCode));
    const boundedTextWitness = (
      field: "name" | "annotation" | "reason",
      maximum: number,
    ): boolean =>
      refusals.some((transition) => {
        const refusal = transition.result["editPlanRefusal"];
        if (!isObject(refusal)) return false;
        const diagnostic = recordsAt(refusal["diagnostics"]).find(
          (row) =>
            Array.isArray(row["path"]) &&
            row["path"].at(-1) === field &&
            row["maximum"] === maximum &&
            row["observed"] === maximum + 1,
        );
        const work = editPlanWork(transition);
        return (
          diagnostic !== undefined &&
          work?.["idAllocationAttempts"] === 0 &&
          typeof work["metadataCodePointsObserved"] === "number" &&
          work["metadataCodePointsObserved"] >= maximum + 1
        );
      });
    requireObligation(
      [
        "edit-plan.command-shape-invalid",
        "edit-plan.plan-shape-invalid",
        "edit-plan.syntax-refused",
        "edit-plan.section-metadata-mismatch",
      ].every((code) => codes.has(code)) &&
        boundedTextWitness("name", MAX_SHORT_TEXT_CODE_POINTS) &&
        boundedTextWitness("annotation", MAX_LONG_TEXT_CODE_POINTS) &&
        boundedTextWitness("reason", MAX_LONG_TEXT_CODE_POINTS),
      id,
      "Scalar/range/ID proof must include pre-allocation first-excess witnesses for the 256-code-point name and 2,000-code-point annotation/completion-reason bounds.",
      findings,
    );
  }

  for (const [id, category, shouldSucceed] of [
    ["A0U1-OBL-007-LIMIT-EXACT", "exact-boundary", true],
    ["A0U1-OBL-008-LIMIT-PLUS-ONE", "plus-one", false],
  ] as const) {
    const rows = rowsFor(id).filter(
      (transition) =>
        transition.row["phase"] === "apply" &&
        transitionCaseCategory(transition, cases) === category,
    );
    const outcomesMatch = rows.every(
      (transition) => transition.result["ok"] === shouldSucceed,
    );
    const staticDominance =
      A0_U1_ATOMIC_EDIT_LIMITS.fragmentMeasures ===
        A0_U1_ATOMIC_EDIT_LIMITS.fragmentSections *
          A0_U1_ATOMIC_EDIT_LIMITS.fragmentMeasuresPerSection &&
      A0_U1_ATOMIC_EDIT_LIMITS.planNodeRecords ===
        A0_U1_ATOMIC_EDIT_LIMITS.occupiedIdRecords &&
      A0_U1_ATOMIC_EDIT_LIMITS.occupiedIdRecords ===
        A0_U1_ATOMIC_EDIT_LIMITS.idAllocationAttempts + 1 &&
      MAX_A0_U1_REACHABLE_FINAL_TIMELINE_QUARTER_NOTE_BEATS <
        A0_U1_ATOMIC_EDIT_LIMITS.finalTimelineQuarterNoteBeats;
    requireObligation(
      rows.length >= A0_U1_ATOMIC_EDIT_PLAN_KINDS.length &&
        exactOperationSet(rows) &&
        outcomesMatch &&
        staticDominance,
      id,
      shouldSucceed
        ? "Exact reachable caps need successful witnesses across all five operations, while composite and timeline-unreachable caps remain proved by source-constant identities."
        : "First-excess reachable caps need refusals across all five operations, while composite and timeline-unreachable caps remain proved by source-constant identities.",
      findings,
    );
  }

  {
    const id = "A0U1-OBL-009-ALLOCATION-PREORDER";
    const rows = successApply(rowsFor(id));
    const hasTraceKinds = (kinds: readonly string[]): boolean =>
      rows.some((transition) =>
        jsonDeepEqual(
          recordsAt(transition.expected["allocationTrace"]).map(
            (row) => row["kind"],
          ),
          kinds,
        ),
      );
    requireObligation(
      rows.some((transition) => {
        const kinds = recordsAt(transition.expected["allocationTrace"]).map(
          (row) => row["kind"],
        );
        return (
          kinds.includes("section") &&
          kinds.includes("measure") &&
          kinds.includes("event")
        );
      }) &&
        hasTraceKinds(["event"]) &&
        hasTraceKinds(["section"]),
      id,
      "Allocation proof needs complete structural preorder plus recovered/split event-only and split-section section-only success traces.",
      findings,
    );
  }

  for (const [id, finalOutcome] of [
    ["A0U1-OBL-010-ALLOCATION-FACTORY-POSITIONS", "factory-refusal"],
    ["A0U1-OBL-011-ALLOCATION-COLLISION-POSITIONS", "collision-refusal"],
  ] as const) {
    const refusingTraces = refusedApply(rowsFor(id))
      .map((transition) => recordsAt(transition.expected["allocationTrace"]))
      .filter(
        (trace) =>
          trace.length > 0 && trace.at(-1)?.["outcome"] === finalOutcome,
      );
    const finalKinds = new Set(
      refusingTraces.map((trace) => trace.at(-1)?.["kind"]),
    );
    requireObligation(
      ["section", "measure", "event"].every((kind) => finalKinds.has(kind)) &&
        refusingTraces.some((trace) => trace.length > 1),
      id,
      "Allocation refusal proof must fail at section, measure, and event positions and include a stopped accepted-prefix witness.",
      findings,
    );
  }

  {
    const id = "A0U1-OBL-012-JOIN-FACTORY-UNUSED";
    const hostile = successApply(rowsFor(id)).filter(
      (transition) =>
        transition.idFactoryEvidence?.["configuration"] ===
        "hostile-refuse-on-any-call",
    );
    requireObligation(
      hostile.length === 2 &&
        jsonDeepEqual(
          hostile.map((transition) => transition.row["operation"]),
          ["join-event-durations", "join-sections"],
        ) &&
        hostile.every(
          (transition) =>
            transition.idFactoryEvidence?.["callsObserved"] === 0 &&
            jsonDeepEqual(transition.expected["allocationTrace"], []),
        ),
      id,
      "Exactly the two join variants must succeed while a hostile factory observes zero calls.",
      findings,
    );
  }

  for (const [id, code, structuralDecodeCalls, semanticValidationCalls] of [
    [
      "A0U1-OBL-013-F2-REFUSAL",
      "edit-plan.structural-publication-refused",
      1,
      0,
    ],
    ["A0U1-OBL-014-F3-REFUSAL", "edit-plan.semantic-publication-refused", 1, 1],
    ["A0U1-OBL-015-HISTORY-REFUSAL", "edit-plan.history-refused", 1, 1],
  ] as const) {
    const rows = refusedApply(rowsFor(id)).filter(
      (transition) => nestedRefusalCode(transition) === code,
    );
    requireObligation(
      rows.length > 0 &&
        rows.every(
          (transition) =>
            editPlanWork(transition)?.["structuralDecodeCalls"] ===
              structuralDecodeCalls &&
            editPlanWork(transition)?.["semanticValidationCalls"] ===
              semanticValidationCalls &&
            jsonDeepEqual(
              objectProjection(
                transition.after,
                new Set(["notices", "nextSequence"]),
              ),
              objectProjection(
                transition.before,
                new Set(["notices", "nextSequence"]),
              ),
            ) &&
            jsonDeepEqual(transition.result["state"], transition.after),
        ),
      id,
      `The ${code} witness must stop atomically after exactly ${String(structuralDecodeCalls)} F2 and ${String(semanticValidationCalls)} F3 call(s).`,
      findings,
    );
  }

  {
    const id = "A0U1-OBL-016-UNDO-REDO";
    const rows = rowsFor(id);
    requireObligation(
      exactOperationSet(rows) &&
        A0_U1_ATOMIC_EDIT_PLAN_KINDS.every((operation) =>
          ["apply", "undo", "redo"].every((phase) =>
            rows.some(
              (transition) =>
                transition.row["operation"] === operation &&
                transition.row["phase"] === phase &&
                transition.result["ok"] === true,
            ),
          ),
        ),
      id,
      "The obligation ledger must explicitly cite every successful apply/undo/redo inverse trio.",
      findings,
    );
  }

  {
    const id = "A0U1-OBL-017-RECOVERY-SCAN";
    const rows = successApply(rowsFor(id)).filter((transition) => {
      const source = transitionPlan(transition)?.["source"];
      return isObject(source) && source["kind"] === "recovered-chord";
    });
    requireObligation(
      rows.some((transition) => {
        const source = transitionPlan(transition)?.["source"];
        if (!isObject(source) || transition.parserEvidence === null) {
          return false;
        }
        const selected = source["selectedGlobalOrdinal"];
        const position = transition.parserEvidence.insertableRows.findIndex(
          (row) => row["globalOrdinal"] === selected,
        );
        return (
          isNonnegativeSafeInteger(selected) &&
          position >= 0 &&
          selected + 1 !== position + 1 &&
          editPlanWork(transition)?.["insertableChordsExamined"] ===
            position + 1
        );
      }),
      id,
      "Recovery scan proof must use an insertable-array position that is observably different from globalOrdinal + 1.",
      findings,
    );
  }

  {
    const id = "A0U1-OBL-018-DIAGNOSTICS";
    const refusals = refusedApply(rowsFor(id));
    const diagnostics = refusals.flatMap((transition) => {
      const refusal = transition.result["editPlanRefusal"];
      return isObject(refusal) ? recordsAt(refusal["diagnostics"]) : [];
    });
    const terminations = new Set(
      refusals.map((transition) => editPlanWork(transition)?.["termination"]),
    );
    requireObligation(
      refusals.some((transition) => {
        const refusal = transition.result["editPlanRefusal"];
        return (
          isObject(refusal) && recordsAt(refusal["diagnostics"]).length >= 2
        );
      }) &&
        diagnostics.some((diagnostic) => diagnostic["sourceRange"] === null) &&
        diagnostics.some((diagnostic) => isObject(diagnostic["sourceRange"])) &&
        [
          "input-refusal",
          "allocation-refusal",
          "publication-refusal",
          "history-refusal",
        ].every((termination) => terminations.has(termination)),
      id,
      "Diagnostic closure needs an order-sensitive multi-row refusal, both ranged and unranged sanitized rows, and every closed refusal termination family.",
      findings,
    );
  }

  {
    const id = "A0U1-OBL-019-CANDIDATE-TRANSFORMS";
    const rows = successApply(rowsFor(id));
    requireObligation(
      exactOperationSet(rows),
      id,
      "The candidate-transform ledger must cite a committed independently reconstructed transition for all five operations.",
      findings,
    );
  }

  {
    const id = "A0U1-OBL-020-TRANSPOSITION";
    requireObligation(
      jsonDeepEqual(
        [...transposition.values()].map((row) => row["operation"]),
        A0_U1_ATOMIC_EDIT_PLAN_KINDS,
      ) && transposition.size === A0_U1_ATOMIC_EDIT_PLAN_KINDS.length,
      id,
      "Metamorphic closure requires one independently checked transform/inverse/transition commutation per operation.",
      findings,
    );
  }

  {
    const id = "A0U1-OBL-021-MUTATIONS";
    requireObligation(
      controls.size === 30 &&
        stringsAt(obligations.get(id)?.["transitionIds"]).every(
          (transitionId) => materialized.has(transitionId),
        ),
      id,
      "Mutation closure requires all 30 controls and only materializable baseline/killer transition references.",
      findings,
    );
  }

  {
    const id = "A0U1-OBL-022-FORBIDDEN-PAYLOADS";
    const forbidden = new Set(A0_U1_ATOMIC_EDIT_PLAN_FORBIDDEN_PAYLOAD_KEYS);
    const rows = refusedApply(rowsFor(id));
    const observed = new Set<string>();
    for (const transition of rows) {
      for (const key of forbiddenKeysPresent(transition.command, forbidden)) {
        observed.add(key);
      }
    }
    requireObligation(
      jsonDeepEqual(
        [...observed],
        A0_U1_ATOMIC_EDIT_PLAN_FORBIDDEN_PAYLOAD_KEYS,
      ) &&
        rows.every((transition) =>
          [
            "edit-plan.command-shape-invalid",
            "edit-plan.plan-shape-invalid",
          ].includes(String(nestedRefusalCode(transition))),
        ),
      id,
      "Every source-authoritative forbidden payload key must appear in a refused exact-shape witness.",
      findings,
    );
  }

  {
    const id = "A0U1-OBL-023-COMPLETE-WARNINGS";
    const rows = rowsFor(id);
    const acknowledgedSuccess = successApply(rows).some((transition) => {
      const source = transitionPlan(transition)?.["source"];
      return (
        isObject(source) &&
        source["kind"] === "complete-draft" &&
        transition.parserEvidence !== null &&
        recordsAt(source["warningAcknowledgements"]).length > 0
      );
    });
    requireObligation(
      acknowledgedSuccess &&
        refusedApply(rows).some(
          (transition) =>
            nestedRefusalCode(transition) ===
            "edit-plan.warning-acknowledgements-mismatch",
        ),
      id,
      "Warning proof needs an exact nonempty code/range/order acknowledgement success and a mismatch refusal.",
      findings,
    );
  }

  {
    const id = "A0U1-OBL-024-RECOVERY-BRANCHES";
    const rows = rowsFor(id);
    const recoveredSuccessSources = successApply(rows)
      .map((transition) => transitionPlan(transition)?.["source"])
      .filter(
        (source): source is JsonObject =>
          isObject(source) && source["kind"] === "recovered-chord",
      );
    requireObligation(
      recoveredSuccessSources.some(
        (source) => source["callerDuration"] === null,
      ) &&
        recoveredSuccessSources.some((source) =>
          isObject(source["callerDuration"]),
        ) &&
        refusedApply(rows).some(
          (transition) =>
            nestedRefusalCode(transition) ===
            "edit-plan.recovered-chord-duration-mismatch",
        ),
      id,
      "Recovery closure needs successful resolved-duration and caller-duration branches plus the exact mismatch refusal.",
      findings,
    );
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

  requireExact(
    [...controls.values()].map((control) => control["category"]),
    EXPECTED_MUTATION_CATEGORIES,
    "EDIT_PLAN_MUTATION_CATEGORY_INVENTORY",
    "mutation-controls.json.controls",
    "The mutation ledger must retain exactly one control for each reviewed category in contract order.",
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
    if (!EXPECTED_MUTATION_CATEGORIES.includes(control["category"] as never)) {
      addFinding(
        findings,
        "EDIT_PLAN_CONTROL_CATEGORY",
        `mutation-controls.json.controls.${controlId}.category`,
        "Mutation category is outside the closed 30-category vocabulary.",
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
    const category = control["category"];
    const expectedTarget =
      typeof category === "string" &&
      EXPECTED_MUTATION_CATEGORIES.includes(category as never)
        ? EXPECTED_MUTATION_TARGETS[
            category as (typeof EXPECTED_MUTATION_CATEGORIES)[number]
          ]
        : null;
    if (expectedTarget !== null) {
      requireExact(
        {
          operation: control["operation"],
          materialization: mutation["materialization"],
          jsonPointer: mutation["jsonPointer"],
        },
        expectedTarget,
        "EDIT_PLAN_MUTATION_CATEGORY_TARGET",
        `mutation-controls.json.controls.${controlId}`,
        "Each mutation category has one independently frozen operation, materialization, and JSON Pointer target.",
        findings,
      );
    }
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
    provenanceRoot["humanAcceptanceClaim"] !== true
  ) {
    addFinding(
      findings,
      "EDIT_PLAN_PROVENANCE_CLAIM",
      "provenance-ledger.json",
      "Provenance must carry exactly the recorded R1 human acceptance and no expert-review claim.",
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

function isAbsentSentinel(value: unknown): boolean {
  return isObject(value) && value["$absent"] === true;
}

function mutationCategoryPredicate(
  category: (typeof EXPECTED_MUTATION_CATEGORIES)[number],
  baseline: JsonObject,
  killer: JsonObject,
  catalog: JsonObject,
): boolean {
  const baselineCommand = materializeLiteral(baseline["command"], catalog);
  const killerCommand = materializeLiteral(killer["command"], catalog);
  const baselineBefore = materializeLiteral(baseline["beforeState"], catalog);
  const killerBefore = materializeLiteral(killer["beforeState"], catalog);
  if (
    !isObject(baselineCommand) ||
    !isObject(killerCommand) ||
    !isObject(baselineBefore) ||
    !isObject(killerBefore)
  ) {
    return false;
  }
  const baselinePlan = isObject(baselineCommand["plan"])
    ? baselineCommand["plan"]
    : {};
  const killerPlan = isObject(killerCommand["plan"])
    ? killerCommand["plan"]
    : {};
  const target = EXPECTED_MUTATION_TARGETS[category];
  const baselineInput =
    target.materialization === "command" ? baselineCommand : baselineBefore;
  const killerInput =
    target.materialization === "command" ? killerCommand : killerBefore;
  const from = pointerValueOrAbsent(baselineInput, target.jsonPointer);
  const to = pointerValueOrAbsent(killerInput, target.jsonPointer);
  const baselineDocument = baselineBefore["document"];
  const killerDocument = killerBefore["document"];

  switch (category) {
    case "envelope-document":
      return (
        baselineCommand["expectedDocumentId"] ===
          (isObject(baselineDocument) ? baselineDocument["id"] : undefined) &&
        killerCommand["expectedDocumentId"] !==
          (isObject(killerDocument) ? killerDocument["id"] : undefined)
      );
    case "envelope-revision":
      return (
        baselineCommand["expectedRevision"] === baselineBefore["revision"] &&
        killerCommand["expectedRevision"] !== killerBefore["revision"]
      );
    case "envelope-extra-key":
    case "plan-extra-key":
    case "candidate-backdoor":
    case "nested-plans-backdoor":
    case "recovery-sibling-backdoor":
      return isAbsentSentinel(from) && !isAbsentSentinel(to);
    case "command-id":
      return (
        isBoundedToken(from, MAX_COMMAND_ID_CODE_POINTS) &&
        !isBoundedToken(to, MAX_COMMAND_ID_CODE_POINTS)
      );
    case "logical-time":
      return isNonnegativeSafeInteger(from) && !isNonnegativeSafeInteger(to);
    case "coalescing-closed":
      return from === null && to !== null;
    case "work-counter-warning":
      return (
        Array.isArray(from) && Array.isArray(to) && !jsonDeepEqual(from, to)
      );
    case "recovery-ordinal":
      return (
        isNonnegativeSafeInteger(from) &&
        isNonnegativeSafeInteger(to) &&
        from !== to
      );
    case "recovery-layout-token":
      return (
        from === A0_U1_RECOVERED_CHORD_LAYOUT_LOSS_ACKNOWLEDGEMENT &&
        to !== from
      );
    case "recovery-caller-duration":
      return !jsonDeepEqual(from, to);
    case "quick-entry-text":
    case "quick-entry-target":
      return (
        quickEntrySnapshotMatchesState(baselineCommand, baselineBefore) ===
          true &&
        quickEntrySnapshotMatchesState(killerCommand, killerBefore) === false
      );
    case "split-annotation":
      return (
        from === "retain-source-first-clear-second" &&
        to !== "retain-source-first-clear-second"
      );
    case "split-positive-duration":
      return (
        isCanonicalPositiveDuration(baselinePlan["firstDuration"]) &&
        !isCanonicalPositiveDuration(killerPlan["firstDuration"])
      );
    case "split-exact-sum": {
      const baselineEvent = findEventLocation(
        baselineDocument,
        baselinePlan["eventId"],
      );
      const killerEvent = findEventLocation(
        killerDocument,
        killerPlan["eventId"],
      );
      const splitSums = (
        plan: JsonObject,
        event: ReturnType<typeof findEventLocation>,
      ): boolean => {
        const first = durationRational(plan["firstDuration"]);
        const second = durationRational(plan["secondDuration"]);
        const original = durationRational(event?.event["duration"]);
        return (
          first !== null &&
          second !== null &&
          original !== null &&
          jsonDeepEqual(addRationals(first, second), original)
        );
      };
      return (
        splitSums(baselinePlan, baselineEvent) &&
        !splitSums(killerPlan, killerEvent)
      );
    }
    case "split-completion": {
      const baselineEvent = findEventLocation(
        baselineDocument,
        baselinePlan["eventId"],
      );
      const killerEvent = findEventLocation(
        killerDocument,
        killerPlan["eventId"],
      );
      const baselineDeclaration = recordsAt(
        baselinePlan["completionDeclarations"],
      )[0];
      const killerDeclaration = recordsAt(
        killerPlan["completionDeclarations"],
      )[0];
      return (
        baselineDeclaration?.["measureId"] === baselineEvent?.measure["id"] &&
        killerDeclaration?.["measureId"] !== killerEvent?.measure["id"]
      );
    }
    case "join-annotation-policy":
      return (
        from === "require-right-empty-retain-left" &&
        to !== "require-right-empty-retain-left"
      );
    case "join-content": {
      const contentMatches = (document: unknown, plan: JsonObject): boolean => {
        const left = findEventLocation(document, plan["leftEventId"]);
        const right = findEventLocation(document, plan["rightEventId"]);
        return (
          left !== null &&
          right !== null &&
          jsonDeepEqual(
            objectProjection(
              left.event,
              new Set(["id", "duration", "annotation"]),
            ),
            objectProjection(
              right.event,
              new Set(["id", "duration", "annotation"]),
            ),
          )
        );
      };
      return (
        contentMatches(baselineDocument, baselinePlan) &&
        !contentMatches(killerDocument, killerPlan)
      );
    }
    case "join-right-annotation": {
      const baselineRight = findEventLocation(
        baselineDocument,
        baselinePlan["rightEventId"],
      );
      const killerRight = findEventLocation(
        killerDocument,
        killerPlan["rightEventId"],
      );
      return (
        baselineRight?.event["annotation"] === "" &&
        killerRight?.event["annotation"] !== ""
      );
    }
    case "join-exact-sum": {
      const joinSums = (document: unknown, plan: JsonObject): boolean => {
        const left = findEventLocation(document, plan["leftEventId"]);
        const right = findEventLocation(document, plan["rightEventId"]);
        const leftDuration = durationRational(left?.event["duration"]);
        const rightDuration = durationRational(right?.event["duration"]);
        const joined = durationRational(plan["joinedDuration"]);
        return (
          leftDuration !== null &&
          rightDuration !== null &&
          joined !== null &&
          jsonDeepEqual(addRationals(leftDuration, rightDuration), joined)
        );
      };
      return (
        joinSums(baselineDocument, baselinePlan) &&
        !joinSums(killerDocument, killerPlan)
      );
    }
    case "split-section-boundary": {
      const isValidBoundary = (
        document: unknown,
        plan: JsonObject,
      ): boolean => {
        const section = findSectionLocation(document, plan["sectionId"]);
        if (section === null) return false;
        const measureIndex = sectionMeasures(section.section).findIndex(
          (measure) => measure["id"] === plan["beforeMeasureId"],
        );
        return (
          measureIndex > 0 &&
          measureIndex < sectionMeasures(section.section).length
        );
      };
      return (
        isValidBoundary(baselineDocument, baselinePlan) &&
        !isValidBoundary(killerDocument, killerPlan)
      );
    }
    case "split-section-metadata":
    case "join-section-result-metadata":
      return (
        isBoundedToken(from, MAX_SHORT_TEXT_CODE_POINTS) &&
        typeof to === "string" &&
        isUnicodeScalarString(to) &&
        codePointLength(to) === MAX_SHORT_TEXT_CODE_POINTS + 1
      );
    case "split-section-measure-policy":
      return from === "move-suffix-preserve-identities" && to !== from;
    case "join-section-metadata-policy":
      return from === "compare-both-then-apply-explicit-result" && to !== from;
    case "join-section-snapshot": {
      const baselineRight = findSectionLocation(
        baselineDocument,
        baselinePlan["rightSectionId"],
      );
      const killerRight = findSectionLocation(
        killerDocument,
        killerPlan["rightSectionId"],
      );
      return (
        baselineRight !== null &&
        killerRight !== null &&
        jsonDeepEqual(
          baselinePlan["expectedRightMetadata"],
          sectionMetadataProjection(baselineRight.section),
        ) &&
        !jsonDeepEqual(
          killerPlan["expectedRightMetadata"],
          sectionMetadataProjection(killerRight.section),
        )
      );
    }
  }
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

      const category = control["category"];
      if (
        typeof category === "string" &&
        EXPECTED_MUTATION_CATEGORIES.includes(category as never)
      ) {
        const typedCategory =
          category as (typeof EXPECTED_MUTATION_CATEGORIES)[number];
        const baselineResult = transitionMaterialization(
          baseline,
          "expected.result",
          catalog,
        );
        const killerResult = transitionMaterialization(
          killer,
          "expected.result",
          catalog,
        );
        const killerBefore = transitionMaterialization(
          killer,
          "beforeState",
          catalog,
        );
        const killerAfter = transitionMaterialization(
          killer,
          "expected.afterState",
          catalog,
        );
        const expectedRefusal = EXPECTED_MUTATION_REFUSALS[typedCategory];
        const outerRefusal =
          isObject(killerResult) && isObject(killerResult["refusal"])
            ? killerResult["refusal"]
            : {};
        const nestedRefusal =
          isObject(killerResult) && isObject(killerResult["editPlanRefusal"])
            ? killerResult["editPlanRefusal"]
            : null;
        if (
          !isObject(baselineResult) ||
          baselineResult["ok"] !== true ||
          !isObject(killerResult) ||
          killerResult["ok"] !== false
        ) {
          addFinding(
            findings,
            "EDIT_PLAN_MUTATION_ORACLE_OUTCOME",
            path,
            "Every mutation baseline must commit and every one-field killer must refuse.",
          );
        }
        requireExact(
          outerRefusal["code"],
          expectedRefusal.outer,
          "EDIT_PLAN_MUTATION_OUTER_REFUSAL",
          `${path}.killerTransitionId`,
          "Killer outer refusal must match its independently assigned mutation category.",
          findings,
        );
        requireExact(
          nestedRefusal?.["code"] ?? null,
          expectedRefusal.nested,
          "EDIT_PLAN_MUTATION_NESTED_REFUSAL",
          `${path}.killerTransitionId`,
          "Killer nested refusal must match its independently assigned mutation category.",
          findings,
        );
        if (
          !isObject(killerResult) ||
          !isObject(killerBefore) ||
          !isObject(killerAfter) ||
          !jsonDeepEqual(killerResult["state"], killerAfter) ||
          !jsonDeepEqual(
            objectProjection(killerAfter, new Set(["notices", "nextSequence"])),
            objectProjection(
              killerBefore,
              new Set(["notices", "nextSequence"]),
            ),
          )
        ) {
          addFinding(
            findings,
            "EDIT_PLAN_MUTATION_KILLER_ATOMIC",
            `${path}.killerTransitionId`,
            "A mutation killer may publish only bounded refusal notice/sequence bookkeeping and must return that exact after-state.",
          );
        }
        if (
          !mutationCategoryPredicate(typedCategory, baseline, killer, catalog)
        ) {
          addFinding(
            findings,
            "EDIT_PLAN_MUTATION_CATEGORY_PREDICATE",
            path,
            "The declared one-field delta does not satisfy its category-specific independent semantic predicate.",
          );
        }
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
  allowPendingFreeze: boolean,
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
    const pinState = root?.["pinState"];
    if (
      pinState !== "reviewed-byte-and-semantic-pinned" &&
      !(allowPendingFreeze && pinState === "pending-validator-freeze")
    ) {
      addFinding(
        findings,
        "EDIT_PLAN_PIN_STATE",
        `${filename}.pinState`,
        allowPendingFreeze
          ? "Authoring validation accepts only pending-validator-freeze or the final reviewed byte-and-semantic pin state."
          : "Every reviewed fixture must declare the final byte-and-semantic pin state.",
      );
    }
    if (filename === "a0-u1-edit-plan-contract.json") {
      if (root !== undefined) {
        validateRootContract(root, allowPendingFreeze, findings);
      }
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

function validateLawSemanticCoverage(
  lawCoverage: ReadonlyMap<string, JsonObject>,
  materialized: ReadonlyMap<string, MaterializedTransition>,
  applicability: ReadonlyMap<string, JsonObject>,
  transposition: ReadonlyMap<string, JsonObject>,
  controls: ReadonlyMap<string, JsonObject>,
  findings: A0U1EditPlanContractFinding[],
): void {
  for (const [lawId, law] of lawCoverage) {
    const path = `trace-ledger.json.lawCoverage.${lawId}`;
    const positiveIds = stringsAt(law["positiveTransitionIds"]);
    const negativeIds = stringsAt(law["negativeOrNearMissTransitionIds"]);
    const boundaryIds = stringsAt(law["boundaryTransitionIds"]);
    const positive = positiveIds
      .map((id) => materialized.get(id))
      .filter((row): row is MaterializedTransition => row !== undefined);
    const negative = negativeIds
      .map((id) => materialized.get(id))
      .filter((row): row is MaterializedTransition => row !== undefined);
    const boundary = boundaryIds
      .map((id) => materialized.get(id))
      .filter((row): row is MaterializedTransition => row !== undefined);
    if (
      positive.length === 0 ||
      positive.some(
        (row) => row.row["phase"] !== "apply" || row.result["ok"] !== true,
      )
    ) {
      addFinding(
        findings,
        "EDIT_PLAN_LAW_POSITIVE_SEMANTICS",
        `${path}.positiveTransitionIds`,
        "Every law needs at least one materialized successful apply witness; history replay cannot stand in for a positive law proof.",
      );
    }
    if (
      negative.length === 0 ||
      negative.some(
        (row) => row.row["phase"] !== "apply" || row.result["ok"] !== false,
      )
    ) {
      addFinding(
        findings,
        "EDIT_PLAN_LAW_NEGATIVE_SEMANTICS",
        `${path}.negativeOrNearMissTransitionIds`,
        "Every law needs at least one materialized refused apply witness.",
      );
    }
    if (
      boundary.length === 0 ||
      boundary.some(
        (row) =>
          row.row["phase"] !== "apply" ||
          (!positiveIds.includes(row.id) && !negativeIds.includes(row.id)),
      )
    ) {
      addFinding(
        findings,
        "EDIT_PLAN_LAW_BOUNDARY_SEMANTICS",
        `${path}.boundaryTransitionIds`,
        "Boundary witnesses must be materialized apply rows classified honestly as a positive exact edge or negative first-near-miss.",
      );
    }

    const applicabilityRows = stringsAt(law["applicabilityRowIds"])
      .map((id) => applicability.get(id))
      .filter((row): row is JsonObject => row !== undefined);
    const citedTransitionIds = new Set([
      ...positiveIds,
      ...negativeIds,
      ...boundaryIds,
    ]);
    if (
      applicabilityRows.length === 0 ||
      applicabilityRows.some((row) => {
        const operation = row["operation"];
        return (
          !A0_U1_ATOMIC_EDIT_PLAN_KINDS.includes(operation as never) ||
          !stringsAt(row["transitionIds"]).some((id) =>
            citedTransitionIds.has(id),
          ) ||
          ![...citedTransitionIds].some(
            (id) => materialized.get(id)?.row["operation"] === operation,
          )
        );
      })
    ) {
      addFinding(
        findings,
        "EDIT_PLAN_LAW_APPLICABILITY_SEMANTICS",
        `${path}.applicabilityRowIds`,
        "Each law applicability row must share a real cited transition and operation with that law.",
      );
    }
    const applicableOperations = new Set(
      applicabilityRows.map((row) => row["operation"]),
    );
    const transpositionLinked = [...transposition.values()].some((witness) => {
      if (!applicableOperations.has(witness["operation"])) return false;
      const baseId = witness["baseTransitionId"];
      const transposedId = witness["transposedTransitionId"];
      return (
        (typeof baseId === "string" &&
          stringsAt(materialized.get(baseId)?.row["lawIds"]).includes(lawId)) ||
        (typeof transposedId === "string" &&
          stringsAt(materialized.get(transposedId)?.row["lawIds"]).includes(
            lawId,
          ))
      );
    });
    if (!transpositionLinked) {
      addFinding(
        findings,
        "EDIT_PLAN_LAW_TRANSPOSITION_SEMANTICS",
        `${path}.applicabilityRowIds`,
        "Every law must be linked through an applicable operation to a real base/transposed commutation witness.",
      );
    }

    const mutationRows = stringsAt(law["mutationControlIds"])
      .map((id) => controls.get(id))
      .filter((row): row is JsonObject => row !== undefined);
    if (
      mutationRows.length === 0 ||
      mutationRows.some((control) => {
        const baselineId = control["baselineTransitionId"];
        const killerId = control["killerTransitionId"];
        return (
          typeof baselineId !== "string" ||
          typeof killerId !== "string" ||
          materialized.get(baselineId)?.result["ok"] !== true ||
          materialized.get(killerId)?.result["ok"] !== false
        );
      })
    ) {
      addFinding(
        findings,
        "EDIT_PLAN_LAW_MUTATION_SEMANTICS",
        `${path}.mutationControlIds`,
        "Every law must cite a materialized successful baseline and refused category-specific mutation killer.",
      );
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
  const allowPendingFreeze = options.allowPendingFreeze === true;
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
      if (
        !allowPendingFreeze &&
        sha256(bytes) !== expectedByteDigests[filename]
      ) {
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

  validateFixtureShells(loaded, allowPendingFreeze, findings);
  const semanticPacket = Object.fromEntries(
    A0_U1_EDIT_PLAN_SPEC_FILES.map((filename) => [
      filename,
      loaded.get(filename)?.root ?? null,
    ]),
  );
  if (
    !allowPendingFreeze &&
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
  validateObligationSemantics(
    caseIndexes.obligations,
    caseIndexes.materialized,
    caseIndexes.cases,
    caseIndexes.transposition,
    linkedIndexes.controls,
    findings,
  );
  validateLawReciprocity(
    caseIndexes.transitions,
    linkedIndexes.controls,
    linkedIndexes.traces,
    linkedIndexes.lawCoverage,
    linkedIndexes.authorities,
    findings,
  );
  validateLawSemanticCoverage(
    linkedIndexes.lawCoverage,
    caseIndexes.materialized,
    caseIndexes.applicability,
    caseIndexes.transposition,
    linkedIndexes.controls,
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
  if (!allowPendingFreeze) {
    validateCompanionDigests(contract, loaded, findings);
  }

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
    obligationRows: caseIndexes.obligations.size,
    mutationControls: linkedIndexes.controls.size,
    traces: linkedIndexes.traces.size,
    authorities: linkedIndexes.authorities.size,
  });
  requireExact(
    contract["counts"],
    counts,
    "EDIT_PLAN_DECLARED_ACTUAL_COUNTS",
    "a0-u1-edit-plan-contract.json.counts",
    "Declared packet counts must equal the independently indexed packet inventory even during pending freeze.",
    findings,
  );
  if (!allowPendingFreeze) {
    requireExact(
      counts,
      EXPECTED_COUNTS,
      "EDIT_PLAN_COUNTS",
      fixtureRoot,
      "Actual packet inventory differs from the frozen 5/1/5/17/50/137/5/5/24/30/6/6 closure.",
      findings,
    );
  }
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
      [...APPLICATION_COMMAND_KINDS.slice(0, 15), "apply-edit-plan"],
      [...A0_U1_PROPOSED_APPLICATION_COMMAND_KINDS],
    ),
    productionImplementationClaim: true,
    u1UiCompletionClaim: false,
    humanAcceptanceClaim: true,
    expertReviewClaim: false,
    findings: Object.freeze(findings),
  });
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const allowPendingFreeze = args.includes("--allow-pending-freeze");
  const fixtureRoot = args.find((argument) => !argument.startsWith("--"));
  const report = await validateA0U1EditPlanContract(fixtureRoot, {
    allowPendingFreeze,
  });
  console.log(JSON.stringify(report, null, 2));
  if (report.outcome === "fail") process.exitCode = 1;
}
