import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { createHash } from "node:crypto";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  ApplyEditPlanCommand,
  AtomicEditPlanAppState,
  AtomicEditPlanDependencies,
  AtomicEditPlanFailureForOuterCode,
  AtomicEditPlan,
  AtomicEditPlanBoundary,
  AtomicEditPlanKind,
  AtomicEditPlanHistoryEntry,
  AtomicEditPlanHistoryRetainedByteEstimator,
  AtomicEditPlanQuickEntrySnapshot,
  AtomicEditPlanReceipt,
  AtomicEditPlanRefusal,
  AtomicEditPlanRefusalCode,
  AtomicEditPlanRefusalCodeForOuter,
  AtomicEditPlanRunnerStage,
  AtomicEditPlanWorkEvidence,
  AtomicEditPlanParserDependency,
  AtomicEditPlanPostplanFailure,
  AtomicEditPlanPreplanOuterRefusalCode,
  AtomicEditPlanPreplanFailure,
  CompleteDraftInsertFragmentEditPlan,
  CompleteDraftInsertSource,
  InsertFragmentEditPlan,
  InsertFragmentPlacementKind,
  JoinEventDurationsEditPlan,
  JoinSectionsEditPlan,
  ProposedApplicationCommandKind,
  ProposedDocumentCommand,
  RecoveredChordInsertFragmentEditPlan,
  RecoveredChordInsertSource,
  RunAtomicEditPlan,
  RunAtomicEditPlanRequest,
  AtomicEditPlanTransitionResult,
  SplitEventDurationEditPlan,
  SplitSectionEditPlan,
} from "../../src/application/application-edit-plan-contract";
import {
  A0_U1_ATOMIC_EDIT_LAW_IDS,
  A0_U1_ATOMIC_EDIT_ALLOWED_OUTER_CODES_BY_REFUSAL_CODE,
  A0_U1_ATOMIC_EDIT_IMPLEMENTATION_STATUS,
  A0_U1_ATOMIC_EDIT_LIMITS,
  A0_U1_ATOMIC_EDIT_PLAN_BOOKMARK_POLICIES,
  A0_U1_ATOMIC_EDIT_PLAN_CONTRACT_SCHEMA,
  A0_U1_ATOMIC_EDIT_PLAN_DIAGNOSTIC_ORDER,
  A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS,
  A0_U1_ATOMIC_EDIT_PLAN_FORBIDDEN_PAYLOAD_KEYS,
  A0_U1_ATOMIC_EDIT_PLAN_ID_ALLOCATION_ORDER,
  A0_U1_ATOMIC_EDIT_PLAN_ID_ENTROPY_POLICY,
  A0_U1_ATOMIC_EDIT_PLAN_KINDS,
  A0_U1_ATOMIC_EDIT_PLAN_POLICY_ID,
  A0_U1_ATOMIC_EDIT_PLAN_POLICY_VERSION,
  A0_U1_ATOMIC_EDIT_PLAN_RECEIPT_SCHEMA,
  A0_U1_ATOMIC_EDIT_PLAN_RUNNER_STAGE_ORDER,
  A0_U1_ATOMIC_EDIT_PLAN_TERMINATIONS,
  A0_U1_ATOMIC_EDIT_PLAN_TRANSPOSITION_POLICY,
  A0_U1_ATOMIC_EDIT_HISTORY_REFUSAL_POLICY,
  A0_U1_ATOMIC_EDIT_OUTER_WORK_POLICY,
  A0_U1_ATOMIC_EDIT_OUTER_REFUSAL_CODES,
  A0_U1_ATOMIC_EDIT_PREPLAN_OUTER_REFUSAL_CODES,
  A0_U1_ATOMIC_EDIT_REFUSAL_CODES,
  A0_U1_STATIC_REFUSAL_REACHABILITY,
  A0_U1_ATOMIC_EDIT_WORK_COUNTER_MAXIMA,
  A0_U1_ATOMIC_EDIT_WORK_COUNTER_NAMES,
  A0_U1_FINAL_COLLECTION_LIMIT_COMPARISON_ORDER,
  A0_U1_INSERT_FRAGMENT_PLACEMENT_KINDS,
  A0_U1_FRAGMENT_PARSE_ACCIDENTAL_STYLE,
  A0_U1_NEW_EVENT_AUTO_VOICING,
  A0_U1_NEW_EVENT_POLICY_ID,
  A0_U1_PROPOSED_APPLICATION_COMMAND_KINDS,
  A0_U1_QUICK_ENTRY_TARGET_MATCH_POLICY,
  A0_U1_RECOVERED_CHORD_LAYOUT_LOSS_ACKNOWLEDGEMENT,
  A0_U1_RECOVERY_FIELD_COMPARISON_ORDER,
  MAX_A0_U1_REACHABLE_FINAL_TIMELINE_QUARTER_NOTE_BEATS,
} from "../../src/application/application-edit-plan-contract";
import type {
  AppState,
  ApplicationCommandDependencies,
  ApplicationTransitionResult,
  DocumentCommand,
} from "../../src/application/application-state-contract";
import { APPLICATION_COMMAND_KINDS } from "../../src/application/application-state-contract";
import {
  A0_U1_EDIT_PLAN_SPEC_BYTE_DIGESTS,
  A0_U1_EDIT_PLAN_SPEC_FILES,
  A0_U1_EDIT_PLAN_SPEC_SEMANTIC_DIGEST,
  type A0U1EditPlanContractValidationReport,
  probeA0U1RuntimeShapeRefusal,
  validateA0U1EditPlanContract,
} from "../../scripts/validate-a0-u1-edit-plan-contract";

setDefaultTimeout(300_000);

type Assert<Value extends true> = Value;
type Equal<Left, Right> = [Left] extends [Right]
  ? [Right] extends [Left]
    ? true
    : false
  : false;
type IsPromise<Value> = Value extends Promise<unknown> ? true : false;

type AtomicEditPlanSuccess = Extract<
  AtomicEditPlanTransitionResult,
  { ok: true }
>;
type AtomicEditPlanFailure = Extract<
  AtomicEditPlanTransitionResult,
  { ok: false }
>;
type BaseApplicationSuccess = Extract<
  ApplicationTransitionResult,
  { ok: true }
>;
type BaseApplicationFailure = Extract<
  ApplicationTransitionResult,
  { ok: false }
>;

type PlanKindsAreExact = Assert<
  Equal<
    AtomicEditPlanKind,
    | "insert-fragment"
    | "split-event-duration"
    | "join-event-durations"
    | "split-section"
    | "join-sections"
  >
>;
type InsertPlacementKindsAreExact = Assert<
  Equal<
    InsertFragmentPlacementKind,
    "into-measure" | "into-section" | "into-document"
  >
>;
type ApplyCommandKindIsExact = Assert<
  Equal<ApplyEditPlanCommand["kind"], "apply-edit-plan">
>;
type ApplyCommandCoalescingIsNull = Assert<
  Equal<ApplyEditPlanCommand["coalescing"], null>
>;
type ApplyCommandCarriesOneClosedPlan = Assert<
  Equal<ApplyEditPlanCommand["plan"], AtomicEditPlan>
>;
type AtomicDependenciesAreExactlyAdditive = Assert<
  Equal<
    AtomicEditPlanDependencies,
    Readonly<
      Omit<ApplicationCommandDependencies, "estimateHistoryRetainedBytes"> &
        AtomicEditPlanParserDependency & {
          estimateHistoryRetainedBytes: AtomicEditPlanHistoryRetainedByteEstimator;
        }
    >
  >
>;
type AtomicRunnerRequestIsExact = Assert<
  Equal<Parameters<RunAtomicEditPlan>[0], RunAtomicEditPlanRequest>
>;
type AtomicRunnerResultIsExact = Assert<
  Equal<ReturnType<RunAtomicEditPlan>, AtomicEditPlanTransitionResult>
>;
type AtomicRunnerIsSynchronous = Assert<
  Equal<IsPromise<ReturnType<RunAtomicEditPlan>>, false>
>;
type AtomicRunnerRequestFieldsAreExact = Assert<
  Equal<keyof RunAtomicEditPlanRequest, "state" | "command" | "dependencies">
>;
type AtomicRunnerRequestCarriesProposedState = Assert<
  Equal<RunAtomicEditPlanRequest["state"], AtomicEditPlanAppState>
>;
type LiveStateCanEnterAtomicRunner = Assert<
  AppState extends AtomicEditPlanAppState ? true : false
>;
type AtomicHistoryKindIsExact = Assert<
  Equal<AtomicEditPlanHistoryEntry["commandKind"], "apply-edit-plan">
>;
type AtomicRunnerRequestCarriesOnlyNewCommand = Assert<
  Equal<RunAtomicEditPlanRequest["command"], ApplyEditPlanCommand>
>;
type AtomicResultRequiresMergedLiveHistoryKind = Assert<
  AtomicEditPlanTransitionResult extends ApplicationTransitionResult
    ? false
    : true
>;
type LiveResultCannotStandInForAtomicResult = Assert<
  ApplicationTransitionResult extends AtomicEditPlanTransitionResult
    ? false
    : true
>;
type AtomicSuccessOutcomeIsCommitted = Assert<
  Equal<AtomicEditPlanSuccess["outcome"], "committed">
>;
type AtomicSuccessReceiptIsExposed = Assert<
  Equal<AtomicEditPlanSuccess["editPlanReceipt"], AtomicEditPlanReceipt>
>;
type AtomicSuccessAddsOnlyReceipt = Assert<
  Equal<
    keyof AtomicEditPlanSuccess,
    keyof BaseApplicationSuccess | "editPlanReceipt"
  >
>;
type AtomicFailureDetailIsNullableOnlyForOuterPreflight = Assert<
  Equal<
    AtomicEditPlanFailure["editPlanRefusal"],
    AtomicEditPlanPostplanFailure["editPlanRefusal"] | null
  >
>;
type PreplanFailureDetailIsExactlyNull = Assert<
  Equal<AtomicEditPlanPreplanFailure["editPlanRefusal"], null>
>;
type PostplanFailureDetailIsAlwaysPresent = Assert<
  Equal<Extract<AtomicEditPlanPostplanFailure["editPlanRefusal"], null>, never>
>;
type PayloadFailureCodesAreCorrelated = Assert<
  Equal<
    AtomicEditPlanFailureForOuterCode<"command.payload_invalid">["editPlanRefusal"]["outerCode"],
    "command.payload_invalid"
  >
>;
type StaleRevisionCannotCarryNestedDetail = Assert<
  Equal<
    Extract<
      AtomicEditPlanTransitionResult,
      {
        ok: false;
        refusal: { code: "command.stale_revision" };
        editPlanRefusal: AtomicEditPlanRefusal;
      }
    >,
    never
  >
>;
type PayloadInvalidCannotCarryNullDetail = Assert<
  Equal<
    Extract<
      AtomicEditPlanTransitionResult,
      {
        ok: false;
        refusal: { code: "command.payload_invalid" };
        editPlanRefusal: null;
      }
    >,
    never
  >
>;
type PayloadInvalidCannotCarrySemanticOuterDetail = Assert<
  Equal<
    Extract<
      AtomicEditPlanTransitionResult,
      {
        ok: false;
        refusal: { code: "command.payload_invalid" };
        editPlanRefusal: AtomicEditPlanRefusal<"command.semantic_validation_failed">;
      }
    >,
    never
  >
>;
type AtomicFailureAddsOnlyNestedDetail = Assert<
  Equal<
    keyof AtomicEditPlanFailure,
    keyof BaseApplicationFailure | "editPlanRefusal"
  >
>;
type NestedOuterCodeFitsLiveRefusal = Assert<
  AtomicEditPlanRefusal["outerCode"] extends BaseApplicationFailure["refusal"]["code"]
    ? true
    : false
>;
type NestedPathMatchesLiveRefusalPath = Assert<
  Equal<
    AtomicEditPlanRefusal["path"],
    BaseApplicationFailure["refusal"]["path"]
  >
>;
type ProposedCommandKindIsExactlyAdditive = Assert<
  Equal<
    ProposedApplicationCommandKind,
    DocumentCommand["kind"] | "apply-edit-plan"
  >
>;
type ProposedCommandUnionIsExactlyAdditive = Assert<
  Equal<ProposedDocumentCommand, DocumentCommand | ApplyEditPlanCommand>
>;
type ExistingCommandUnionRemainsExact = Assert<
  Equal<Exclude<ProposedDocumentCommand, ApplyEditPlanCommand>, DocumentCommand>
>;
type ProposedApplyVariantIsExact = Assert<
  Equal<
    Extract<ProposedDocumentCommand, { kind: "apply-edit-plan" }>,
    ApplyEditPlanCommand
  >
>;
type InsertSourceKindsAreExact = Assert<
  Equal<
    InsertFragmentEditPlan["source"]["kind"],
    "complete-draft" | "recovered-chord"
  >
>;
type CompleteDraftSnapshotIsReady = Assert<
  Equal<
    CompleteDraftInsertSource["quickEntrySnapshot"]["expectedStatus"],
    "ready"
  >
>;
type CompleteDraftSnapshotLaneIsExact = Assert<
  Equal<
    CompleteDraftInsertSource["quickEntrySnapshot"]["expectedLane"],
    "complete-draft"
  >
>;
type RecoveredSnapshotIsInvalid = Assert<
  Equal<
    RecoveredChordInsertSource["quickEntrySnapshot"]["expectedStatus"],
    "invalid"
  >
>;
type RecoveredSnapshotLaneIsExact = Assert<
  Equal<
    RecoveredChordInsertSource["quickEntrySnapshot"]["expectedLane"],
    "recovered-chord"
  >
>;
type QuickEntrySnapshotKeysAreExact = Assert<
  Equal<
    keyof AtomicEditPlanQuickEntrySnapshot<"ready", "complete-draft">,
    | "sourceText"
    | "baseRevision"
    | "target"
    | "issueCodes"
    | "expectedStatus"
    | "expectedLane"
  >
>;
type CompleteDraftPlacementKindsAreExact = Assert<
  Equal<
    CompleteDraftInsertFragmentEditPlan["placement"]["kind"],
    "into-measure" | "into-section" | "into-document"
  >
>;
type RecoveredPlacementIsMeasureOnly = Assert<
  Equal<
    RecoveredChordInsertFragmentEditPlan["placement"]["kind"],
    "into-measure"
  >
>;
type InsertVariantIsExact = Assert<
  Equal<
    Extract<AtomicEditPlan, { kind: "insert-fragment" }>,
    InsertFragmentEditPlan
  >
>;
type SplitEventVariantIsExact = Assert<
  Equal<
    Extract<AtomicEditPlan, { kind: "split-event-duration" }>,
    SplitEventDurationEditPlan
  >
>;
type JoinEventVariantIsExact = Assert<
  Equal<
    Extract<AtomicEditPlan, { kind: "join-event-durations" }>,
    JoinEventDurationsEditPlan
  >
>;
type SplitSectionVariantIsExact = Assert<
  Equal<
    Extract<AtomicEditPlan, { kind: "split-section" }>,
    SplitSectionEditPlan
  >
>;
type JoinSectionVariantIsExact = Assert<
  Equal<
    Extract<AtomicEditPlan, { kind: "join-sections" }>,
    JoinSectionsEditPlan
  >
>;
type SplitAnnotationPolicyIsExact = Assert<
  Equal<
    SplitEventDurationEditPlan["annotationPolicy"],
    "retain-source-first-clear-second"
  >
>;
type JoinAnnotationPolicyIsExact = Assert<
  Equal<
    JoinEventDurationsEditPlan["annotationPolicy"],
    "require-right-empty-retain-left"
  >
>;
type WorkEvidenceKeysAreExhaustive = Assert<
  Equal<
    keyof AtomicEditPlanWorkEvidence,
    (typeof A0_U1_ATOMIC_EDIT_WORK_COUNTER_NAMES)[number] | "termination"
  >
>;
type RefusalCodesAreExhaustive = Assert<
  Equal<
    AtomicEditPlanRefusalCode,
    (typeof A0_U1_ATOMIC_EDIT_REFUSAL_CODES)[number]
  >
>;
type PayloadRefusalExcludesIdCollision = Assert<
  Equal<
    Extract<
      AtomicEditPlanRefusalCodeForOuter<"command.payload_invalid">,
      "edit-plan.id-collision"
    >,
    never
  >
>;
type AllocationRefusalIncludesIdCollision = Assert<
  "edit-plan.id-collision" extends AtomicEditPlanRefusalCodeForOuter<"command.id_allocation_failed">
    ? true
    : false
>;
type AllocationRefusalFamilyIsExact = Assert<
  Equal<
    AtomicEditPlanRefusalCodeForOuter<"command.id_allocation_failed">,
    "edit-plan.id-factory-failed" | "edit-plan.id-collision"
  >
>;
type HistoryEntryTooLargeMapsToHistoryRefusal = Assert<
  Equal<
    AtomicEditPlanRefusalCodeForOuter<"history.entry_too_large">,
    "edit-plan.history-refused"
  >
>;
type HistoryByteEstimateMapsToHistoryRefusal = Assert<
  Equal<
    AtomicEditPlanRefusalCodeForOuter<"history.byte_estimate_invalid">,
    "edit-plan.history-refused"
  >
>;
type PreplanOuterRefusalCodesAreExhaustive = Assert<
  Equal<
    AtomicEditPlanPreplanOuterRefusalCode,
    (typeof A0_U1_ATOMIC_EDIT_PREPLAN_OUTER_REFUSAL_CODES)[number]
  >
>;
type RunnerStagesAreExhaustive = Assert<
  Equal<
    AtomicEditPlanRunnerStage,
    (typeof A0_U1_ATOMIC_EDIT_PLAN_RUNNER_STAGE_ORDER)[number]
  >
>;
type ReceiptEffectsAreExact = Assert<
  Equal<
    AtomicEditPlanReceipt["effects"],
    readonly [
      "queue-recovery",
      "compile-playback-plan",
      "restore-focus",
      "announce",
    ]
  >
>;
type BoundaryKindsAreClosed = Assert<
  Equal<
    AtomicEditPlanBoundary["kind"],
    | "document-start"
    | "document-end"
    | "before-section"
    | "after-section"
    | "section-start"
    | "section-end"
    | "before-measure"
    | "after-measure"
    | "measure-start"
    | "measure-end"
    | "before-event"
    | "after-event"
  >
>;
type ApplyEnvelopeKeysAreExact = Assert<
  Equal<
    keyof ApplyEditPlanCommand,
    | "id"
    | "label"
    | "expectedDocumentId"
    | "expectedRevision"
    | "logicalTimeMs"
    | "coalescing"
    | "kind"
    | "plan"
  >
>;

// Keep compile-only assertions live under isolatedModules.
const typeAssertions: readonly true[] = [
  true satisfies PlanKindsAreExact,
  true satisfies InsertPlacementKindsAreExact,
  true satisfies ApplyCommandKindIsExact,
  true satisfies ApplyCommandCoalescingIsNull,
  true satisfies ApplyCommandCarriesOneClosedPlan,
  true satisfies AtomicDependenciesAreExactlyAdditive,
  true satisfies AtomicRunnerRequestIsExact,
  true satisfies AtomicRunnerResultIsExact,
  true satisfies AtomicRunnerIsSynchronous,
  true satisfies AtomicRunnerRequestFieldsAreExact,
  true satisfies AtomicRunnerRequestCarriesProposedState,
  true satisfies LiveStateCanEnterAtomicRunner,
  true satisfies AtomicHistoryKindIsExact,
  true satisfies AtomicRunnerRequestCarriesOnlyNewCommand,
  true satisfies AtomicResultRequiresMergedLiveHistoryKind,
  true satisfies LiveResultCannotStandInForAtomicResult,
  true satisfies AtomicSuccessOutcomeIsCommitted,
  true satisfies AtomicSuccessReceiptIsExposed,
  true satisfies AtomicSuccessAddsOnlyReceipt,
  true satisfies AtomicFailureDetailIsNullableOnlyForOuterPreflight,
  true satisfies PreplanFailureDetailIsExactlyNull,
  true satisfies PostplanFailureDetailIsAlwaysPresent,
  true satisfies PayloadFailureCodesAreCorrelated,
  true satisfies StaleRevisionCannotCarryNestedDetail,
  true satisfies PayloadInvalidCannotCarryNullDetail,
  true satisfies PayloadInvalidCannotCarrySemanticOuterDetail,
  true satisfies AtomicFailureAddsOnlyNestedDetail,
  true satisfies NestedOuterCodeFitsLiveRefusal,
  true satisfies NestedPathMatchesLiveRefusalPath,
  true satisfies ProposedCommandKindIsExactlyAdditive,
  true satisfies ProposedCommandUnionIsExactlyAdditive,
  true satisfies ExistingCommandUnionRemainsExact,
  true satisfies ProposedApplyVariantIsExact,
  true satisfies InsertSourceKindsAreExact,
  true satisfies CompleteDraftSnapshotIsReady,
  true satisfies CompleteDraftSnapshotLaneIsExact,
  true satisfies RecoveredSnapshotIsInvalid,
  true satisfies RecoveredSnapshotLaneIsExact,
  true satisfies QuickEntrySnapshotKeysAreExact,
  true satisfies CompleteDraftPlacementKindsAreExact,
  true satisfies RecoveredPlacementIsMeasureOnly,
  true satisfies InsertVariantIsExact,
  true satisfies SplitEventVariantIsExact,
  true satisfies JoinEventVariantIsExact,
  true satisfies SplitSectionVariantIsExact,
  true satisfies JoinSectionVariantIsExact,
  true satisfies SplitAnnotationPolicyIsExact,
  true satisfies JoinAnnotationPolicyIsExact,
  true satisfies WorkEvidenceKeysAreExhaustive,
  true satisfies RefusalCodesAreExhaustive,
  true satisfies PayloadRefusalExcludesIdCollision,
  true satisfies AllocationRefusalIncludesIdCollision,
  true satisfies AllocationRefusalFamilyIsExact,
  true satisfies HistoryEntryTooLargeMapsToHistoryRefusal,
  true satisfies HistoryByteEstimateMapsToHistoryRefusal,
  true satisfies PreplanOuterRefusalCodesAreExhaustive,
  true satisfies RunnerStagesAreExhaustive,
  true satisfies ReceiptEffectsAreExact,
  true satisfies BoundaryKindsAreClosed,
  true satisfies ApplyEnvelopeKeysAreExact,
];
void typeAssertions;

const repositoryRoot = dirname(
  dirname(dirname(fileURLToPath(import.meta.url))),
);
const fixtureRoot = join(repositoryRoot, "tests/fixtures/a0-u1-edit-plan");

type JsonObject = Record<string, unknown>;

function sha256(source: string | Uint8Array): string {
  return createHash("sha256").update(source).digest("hex");
}

function jsonObject(value: unknown, label: string): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`A0_U1_TEST_EXPECTED_OBJECT:${label}`);
  }
  return value as JsonObject;
}

function validRuntimeShapeProbeCommand() {
  return {
    id: "command-shape-probe",
    label: "Descriptor-safe runtime-shape probe",
    expectedDocumentId: "document-shape-probe",
    expectedRevision: 0,
    logicalTimeMs: 0,
    coalescing: null,
    kind: "apply-edit-plan",
    plan: {
      kind: "insert-fragment",
      source: {
        kind: "complete-draft",
        quickEntrySnapshot: {
          sourceText: "| C7 |",
          baseRevision: 0,
          target: {
            kind: "section-end",
            sectionId: "section-shape-probe",
          },
          issueCodes: [],
          expectedStatus: "ready",
          expectedLane: "complete-draft",
        },
        warningAcknowledgements: [],
      },
      placement: {
        kind: "into-section",
        sectionId: "section-shape-probe",
        beforeMeasureId: null,
        layoutDisposition: "preserve-implicit-measures",
        completionDeclarations: [],
      },
      voicingPolicy: A0_U1_NEW_EVENT_POLICY_ID,
    },
  };
}

function validRuntimeShapeProbeSplitCommand() {
  return {
    id: "command-shape-split-probe",
    label: "Descriptor-safe split runtime-shape probe",
    expectedDocumentId: "document-shape-probe",
    expectedRevision: 0,
    logicalTimeMs: 0,
    coalescing: null,
    kind: "apply-edit-plan",
    plan: {
      kind: "split-event-duration",
      eventId: "event-shape-probe",
      firstDuration: { numerator: 1, denominator: 2 },
      secondDuration: { numerator: 1, denominator: 2 },
      completionDeclarations: [
        {
          measureId: "measure-shape-probe",
          completion: { kind: "complete" },
        },
      ],
      identityPolicy: "retain-source-first-allocate-second",
      contentPolicy: "copy-exact-chord-and-voicing",
      annotationPolicy: "retain-source-first-clear-second",
    },
  };
}

function literalReferenceKey(
  value: unknown,
  collection: string,
  label: string,
): string {
  const reference = jsonObject(value, label);
  if (
    Object.keys(reference).join(",") !== "$literalRef,patches" ||
    !Array.isArray(reference["patches"]) ||
    reference["patches"].length !== 0
  ) {
    throw new Error(`A0_U1_TEST_EXPECTED_UNPATCHED_LITERAL_REF:${label}`);
  }
  const literalReference = reference["$literalRef"];
  const prefix = `literalCatalog/${collection}/`;
  if (
    typeof literalReference !== "string" ||
    !literalReference.startsWith(prefix) ||
    literalReference.includes("#")
  ) {
    throw new Error(`A0_U1_TEST_WRONG_LITERAL_REF:${label}`);
  }
  return literalReference.slice(prefix.length);
}

async function withPacketCopy(
  run: (temporaryRoot: string) => Promise<void>,
): Promise<void> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "jcpe-a0-u1-edit-plan-"));
  try {
    await cp(fixtureRoot, temporaryRoot, { recursive: true });
    await run(temporaryRoot);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

function findingCodes(report: A0U1EditPlanContractValidationReport): string[] {
  return report.findings.map((finding) => finding.code);
}

function findingsFor(
  report: A0U1EditPlanContractValidationReport,
  code: string,
): A0U1EditPlanContractValidationReport["findings"] {
  return report.findings.filter((finding) => finding.code === code);
}

type JsonPathSegment = string | number;

function replaceJsonField(
  root: unknown,
  path: readonly JsonPathSegment[],
  replacement: (current: unknown) => unknown,
): void {
  if (path.length === 0) {
    throw new Error("A0_U1_TEST_EMPTY_MUTATION_PATH");
  }
  let cursor = root;
  for (const [index, segment] of path.slice(0, -1).entries()) {
    const label = path.slice(0, index + 1).join("/");
    if (typeof segment === "number") {
      if (!Array.isArray(cursor) || !(segment in cursor)) {
        throw new Error(`A0_U1_TEST_ARRAY_PATH_MISSING:${label}`);
      }
      cursor = cursor[segment];
    } else {
      const object = jsonObject(cursor, label);
      if (!Object.hasOwn(object, segment)) {
        throw new Error(`A0_U1_TEST_OBJECT_PATH_MISSING:${label}`);
      }
      cursor = object[segment];
    }
  }

  const finalSegment = path.at(-1);
  if (finalSegment === undefined) {
    throw new Error("A0_U1_TEST_MUTATION_PATH_MISSING_FINAL_SEGMENT");
  }
  let current: unknown;
  let assign: (value: unknown) => void;
  if (typeof finalSegment === "number") {
    if (!Array.isArray(cursor) || !(finalSegment in cursor)) {
      throw new Error(`A0_U1_TEST_ARRAY_PATH_MISSING:${path.join("/")}`);
    }
    const array = cursor;
    current = array[finalSegment];
    assign = (value) => {
      array[finalSegment] = value;
    };
  } else {
    const object = jsonObject(cursor, path.slice(0, -1).join("/"));
    if (!Object.hasOwn(object, finalSegment)) {
      throw new Error(`A0_U1_TEST_OBJECT_PATH_MISSING:${path.join("/")}`);
    }
    current = object[finalSegment];
    assign = (value) => {
      object[finalSegment] = value;
    };
  }

  const changed = replacement(current);
  if (JSON.stringify(changed) === JSON.stringify(current)) {
    throw new Error(`A0_U1_TEST_MUTATION_IS_NOOP:${path.join("/")}`);
  }
  assign(changed);
}

function collectJsonDifferencePaths(
  left: unknown,
  right: unknown,
  path: readonly JsonPathSegment[] = [],
  differences: string[] = [],
): string[] {
  if (JSON.stringify(left) === JSON.stringify(right)) return differences;
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) {
      differences.push(path.join("/"));
      return differences;
    }
    for (let index = 0; index < left.length; index += 1) {
      collectJsonDifferencePaths(
        left[index],
        right[index],
        [...path, index],
        differences,
      );
    }
    return differences;
  }
  if (
    left !== null &&
    typeof left === "object" &&
    !Array.isArray(left) &&
    right !== null &&
    typeof right === "object" &&
    !Array.isArray(right)
  ) {
    const leftObject = left as JsonObject;
    const rightObject = right as JsonObject;
    const keys = new Set([
      ...Object.keys(leftObject),
      ...Object.keys(rightObject),
    ]);
    for (const key of keys) {
      if (!Object.hasOwn(leftObject, key) || !Object.hasOwn(rightObject, key)) {
        differences.push([...path, key].join("/"));
      } else {
        collectJsonDifferencePaths(
          leftObject[key],
          rightObject[key],
          [...path, key],
          differences,
        );
      }
    }
    return differences;
  }
  differences.push(path.join("/"));
  return differences;
}

async function mutateCanonicalJsonField(
  temporaryRoot: string,
  filename: (typeof A0_U1_EDIT_PLAN_SPEC_FILES)[number],
  path: readonly JsonPathSegment[],
  replacement: (current: unknown) => unknown,
): Promise<string> {
  const fixturePath = join(temporaryRoot, filename);
  const original = JSON.parse(await readFile(fixturePath, "utf8")) as unknown;
  const parsed = JSON.parse(JSON.stringify(original)) as unknown;
  replaceJsonField(parsed, path, replacement);
  const differencePaths = collectJsonDifferencePaths(original, parsed);
  if (differencePaths.length !== 1 || differencePaths[0] !== path.join("/")) {
    throw new Error(
      `A0_U1_TEST_EXPECTED_ONE_FIELD_DIFF:${differencePaths.join(",")}`,
    );
  }
  const changedSource = `${JSON.stringify(parsed, null, 2)}\n`;
  await writeFile(fixturePath, changedSource, "utf8");
  return sha256(changedSource);
}

async function mutateCanonicalJsonFields(
  temporaryRoot: string,
  filename: (typeof A0_U1_EDIT_PLAN_SPEC_FILES)[number],
  mutations: readonly Readonly<{
    path: readonly JsonPathSegment[];
    from: unknown;
    to: unknown;
  }>[],
): Promise<string> {
  const fixturePath = join(temporaryRoot, filename);
  const original = JSON.parse(await readFile(fixturePath, "utf8")) as unknown;
  const parsed = JSON.parse(JSON.stringify(original)) as unknown;
  for (const mutation of mutations) {
    replaceJsonField(parsed, mutation.path, (current) => {
      if (JSON.stringify(current) !== JSON.stringify(mutation.from)) {
        throw new Error(
          `A0_U1_TEST_MULTI_MUTATION_BASELINE_DRIFT:${mutation.path.join("/")}`,
        );
      }
      return mutation.to;
    });
  }
  expect(collectJsonDifferencePaths(original, parsed).sort()).toEqual(
    mutations.map((mutation) => mutation.path.join("/")).sort(),
  );
  const changedSource = `${JSON.stringify(parsed, null, 2)}\n`;
  await writeFile(fixturePath, changedSource, "utf8");
  return sha256(changedSource);
}

type SemanticFieldMutation = Readonly<{
  label: string;
  filename: (typeof A0_U1_EDIT_PLAN_SPEC_FILES)[number];
  path: readonly JsonPathSegment[];
  from: unknown;
  to: unknown;
  findingCode: string;
  findingPathIncludes: string;
}>;

const semanticFieldMutations = [
  {
    label: "QuickEntry source staleness",
    filename: "edit-plan-cases.json",
    path: [
      "literalCatalog",
      "commands",
      "a0u1-ins-001-apply",
      "plan",
      "source",
      "quickEntrySnapshot",
      "sourceText",
    ],
    from: "| G7b9#5:4 |",
    to: "| G7b9#5:2 |",
    findingCode: "EDIT_PLAN_STALE_QUICK_ENTRY_COMMITTED",
    findingPathIncludes: "A0U1-INS-001-APPLY",
  },
  {
    label: "recovered sibling suppression",
    filename: "edit-plan-cases.json",
    path: [
      "literalCatalog",
      "results",
      "a0u1-ins-002-apply",
      "editPlanReceipt",
      "insertSource",
      "siblingsApplied",
    ],
    from: 0,
    to: 1,
    findingCode: "EDIT_PLAN_RECEIPT_RECOVERED_SIBLINGS",
    findingPathIncludes: "A0U1-INS-002-APPLY",
  },
  {
    label: "recovered layout-loss acknowledgement",
    filename: "edit-plan-cases.json",
    path: [
      "literalCatalog",
      "commands",
      "a0u1-ins-002-apply",
      "plan",
      "source",
      "layoutLossAcknowledgement",
    ],
    from: "source-bar-and-section-layout-will-be-lost@1",
    to: "layout-loss-not-reviewed",
    findingCode: "EDIT_PLAN_RECOVERY_LAYOUT_ACK",
    findingPathIncludes: "A0U1-INS-002-APPLY",
  },
  {
    label: "recovered caller-duration branch",
    filename: "edit-plan-cases.json",
    path: [
      "literalCatalog",
      "results",
      "a0u1-ins-005-caller-apply",
      "editPlanReceipt",
      "insertSource",
      "durationSource",
    ],
    from: "caller-required",
    to: "t0-resolved",
    findingCode: "EDIT_PLAN_RECEIPT_RECOVERED_DURATION",
    findingPathIncludes: "A0U1-INS-005-CALLER-APPLY",
  },
  {
    label: "split-event right annotation clearing",
    filename: "edit-plan-cases.json",
    path: [
      "literalCatalog",
      "states",
      "a0u1-splitd-001-apply-after",
      "document",
      "sections",
      0,
      "measures",
      0,
      "events",
      1,
      "annotation",
    ],
    from: "",
    to: "forbidden split annotation",
    findingCode: "EDIT_PLAN_SPLIT_RIGHT_ANNOTATION",
    findingPathIncludes: "A0U1-SPLITD-001-APPLY",
  },
  {
    label: "join-event empty-right annotation precondition",
    filename: "edit-plan-cases.json",
    path: [
      "literalCatalog",
      "states",
      "a0u1-joind-001-apply-before",
      "document",
      "sections",
      0,
      "measures",
      0,
      "events",
      1,
      "annotation",
    ],
    from: "",
    to: "forbidden right annotation",
    findingCode: "EDIT_PLAN_JOIN_RIGHT_ANNOTATION",
    findingPathIncludes: "A0U1-JOIND-001-APPLY",
  },
  {
    label: "split-section explicit result metadata",
    filename: "edit-plan-cases.json",
    path: [
      "literalCatalog",
      "states",
      "a0u1-splits-001-apply-after",
      "document",
      "sections",
      1,
      "name",
    ],
    from: "B",
    to: "B altered",
    findingCode: "EDIT_PLAN_SPLIT_SECTION_NEW_METADATA",
    findingPathIncludes: "A0U1-SPLITS-001-APPLY",
  },
  {
    label: "bookmark publication literal",
    filename: "edit-plan-cases.json",
    path: [
      "literalCatalog",
      "bookmarks",
      "a0u1-splitd-001-apply",
      "insertion",
      "eventId",
    ],
    from: "event-e0-frozen",
    to: "event-u1-split-1",
    findingCode: "EDIT_PLAN_BOOKMARK_LITERAL",
    findingPathIncludes: "A0U1-SPLITD-001-APPLY",
  },
  {
    label: "nested work counter evidence",
    filename: "edit-plan-cases.json",
    path: [
      "literalCatalog",
      "counters",
      "a0u1-ins-002-apply",
      "editPlan",
      "syntaxParseCalls",
    ],
    from: 1,
    to: 2,
    findingCode: "EDIT_PLAN_RECEIPT_WORK",
    findingPathIncludes: "A0U1-INS-002-APPLY",
  },
  {
    label: "nested refusal code and outer-family correlation",
    filename: "edit-plan-cases.json",
    path: [
      "literalCatalog",
      "results",
      "a0u1-ins-008-document-collision-0",
      "editPlanRefusal",
      "code",
    ],
    from: "edit-plan.id-collision",
    to: "edit-plan.duration-invalid",
    findingCode: "EDIT_PLAN_NESTED_OUTER_FAMILY",
    findingPathIncludes: "A0U1-INS-008-DOCUMENT-COLLISION-0",
  },
  {
    label: "transposition witness transition link",
    filename: "edit-plan-cases.json",
    path: ["transpositionWitnesses", 0, "baseTransitionId"],
    from: "A0U1-INS-009-BASE",
    to: "A0U1-MISSING-TRANSITION",
    findingCode: "EDIT_PLAN_TRANSPOSITION_TRANSITION_REF",
    findingPathIncludes: "A0U1-WIT-INSERT",
  },
] as const satisfies readonly SemanticFieldMutation[];

describe("A0/U1 atomic edit-plan golden packet", () => {
  test(
    "reviewed packet validates with exact independent cardinalities",
    async () => {
      const report = await validateA0U1EditPlanContract();
      expect(report).toEqual({
        schema: "changes.validation.a0-u1-edit-plan-contract.v1",
        package: "A0/U1 atomic edit plan",
        outcome: "pass",
        reviewState: "proposed-independent-spec",
        counts: {
          files: 5,
          commandKinds: 1,
          planKinds: 5,
          lawRows: 17,
          caseGroups: 50,
          literalTransitions: 137,
          applicabilityRows: 5,
          transpositionWitnesses: 5,
          obligationRows: 24,
          mutationControls: 30,
          traces: 6,
          authorities: 6,
        },
        existingA0CommandKindsUnchanged: true,
        productionImplementationClaim: false,
        u1UiCompletionClaim: false,
        humanAcceptanceClaim: false,
        expertReviewClaim: false,
        findings: [],
      });
    },
    { timeout: 300_000, retry: 0 },
  );

  test("all five reviewed files and the semantic packet have non-placeholder pins", async () => {
    expect(A0_U1_EDIT_PLAN_SPEC_FILES).toEqual([
      "a0-u1-edit-plan-contract.json",
      "edit-plan-cases.json",
      "mutation-controls.json",
      "provenance-ledger.json",
      "trace-ledger.json",
    ]);
    expect(A0_U1_EDIT_PLAN_SPEC_SEMANTIC_DIGEST).toMatch(/^[0-9a-f]{64}$/);
    expect(A0_U1_EDIT_PLAN_SPEC_SEMANTIC_DIGEST).not.toBe("0".repeat(64));

    for (const filename of A0_U1_EDIT_PLAN_SPEC_FILES) {
      const bytes = await readFile(join(fixtureRoot, filename));
      const expectedDigest = A0_U1_EDIT_PLAN_SPEC_BYTE_DIGESTS[filename];
      expect(expectedDigest).toMatch(/^[0-9a-f]{64}$/);
      expect(expectedDigest).not.toBe("0".repeat(64));
      expect(sha256(bytes)).toBe(expectedDigest);
    }
  });

  test("every transition freezes history-estimator evidence and inherited validation-call semantics", async () => {
    const cases = jsonObject(
      JSON.parse(
        await readFile(join(fixtureRoot, "edit-plan-cases.json"), "utf8"),
      ),
      "edit-plan-cases.json",
    );
    const catalog = jsonObject(
      cases["literalCatalog"],
      "edit-plan-cases.json.literalCatalog",
    );
    const transitions = jsonObject(
      catalog["transitions"],
      "edit-plan-cases.json.literalCatalog.transitions",
    );
    const results = jsonObject(
      catalog["results"],
      "edit-plan-cases.json.literalCatalog.results",
    );
    const counters = jsonObject(
      catalog["counters"],
      "edit-plan-cases.json.literalCatalog.counters",
    );
    const historyEstimatorEvidence = jsonObject(
      catalog["historyEstimatorEvidence"],
      "edit-plan-cases.json.literalCatalog.historyEstimatorEvidence",
    );

    for (const [transitionId, rawTransition] of Object.entries(transitions)) {
      const transition = jsonObject(
        rawTransition,
        `edit-plan-cases.json.literalCatalog.transitions.${transitionId}`,
      );
      const expected = jsonObject(
        transition["expected"],
        `edit-plan-cases.json.literalCatalog.transitions.${transitionId}.expected`,
      );
      const resultKey = literalReferenceKey(
        expected["result"],
        "results",
        `${transitionId}.expected.result`,
      );
      const counterKey = literalReferenceKey(
        expected["counters"],
        "counters",
        `${transitionId}.expected.counters`,
      );
      const result = jsonObject(results[resultKey], `${resultKey}.result`);
      const counterEvidence = jsonObject(
        counters[counterKey],
        `${counterKey}.counters`,
      );
      const outerCounters = jsonObject(
        counterEvidence["outer"],
        `${counterKey}.counters.outer`,
      );
      const resultCounters = jsonObject(
        result["counters"],
        `${resultKey}.result.counters`,
      );
      const nestedRefusal =
        result["editPlanRefusal"] === null ||
        result["editPlanRefusal"] === undefined
          ? null
          : jsonObject(
              result["editPlanRefusal"],
              `${resultKey}.result.editPlanRefusal`,
            );
      const nestedCode = nestedRefusal?.["code"] ?? null;
      const isApply = transition["phase"] === "apply";
      const expectedValidationCalls =
        isApply &&
        (result["ok"] === true ||
          nestedCode === "edit-plan.semantic-publication-refused" ||
          nestedCode === "edit-plan.history-refused")
          ? 1
          : 0;

      expect(outerCounters["validationCalls"]).toBe(expectedValidationCalls);
      expect(resultCounters["validationCalls"]).toBe(expectedValidationCalls);

      if (!isApply) {
        expect(transition["lawIds"]).toEqual([]);
        expect(expected["historyEstimatorEvidence"]).toBeNull();
        continue;
      }

      const evidenceKey = literalReferenceKey(
        expected["historyEstimatorEvidence"],
        "historyEstimatorEvidence",
        `${transitionId}.expected.historyEstimatorEvidence`,
      );
      expect(evidenceKey).toBe(transitionId);
      const evidence = jsonObject(
        historyEstimatorEvidence[evidenceKey],
        `${transitionId}.historyEstimatorEvidence`,
      );
      expect(Object.keys(evidence)).toEqual([
        "configuration",
        "callsObserved",
        "returned",
        "independentlyRecomputed",
      ]);
      const configuration = evidence["configuration"];
      if (typeof configuration !== "string") {
        throw new Error(
          `A0_U1_TEST_HISTORY_ESTIMATOR_CONFIGURATION_NOT_STRING:${transitionId}`,
        );
      }
      expect([
        "not-reached",
        "independent-policy",
        "hostile-over-cap",
        "hostile-invalid-negative",
      ]).toContain(configuration);

      if (result["ok"] === true) {
        expect(evidence).toEqual({
          configuration: "independent-policy",
          callsObserved: 1,
          returned: evidence["independentlyRecomputed"],
          independentlyRecomputed: evidence["independentlyRecomputed"],
        });
        expect(Number.isSafeInteger(evidence["returned"])).toBe(true);
        expect(Number(evidence["returned"])).toBeGreaterThan(0);
      } else if (nestedCode === "edit-plan.history-refused") {
        expect(["hostile-over-cap", "hostile-invalid-negative"]).toContain(
          configuration,
        );
        expect(evidence["callsObserved"]).toBe(1);
        expect(Number.isSafeInteger(evidence["returned"])).toBe(true);
        expect(Number.isSafeInteger(evidence["independentlyRecomputed"])).toBe(
          true,
        );
        expect(Number(evidence["independentlyRecomputed"])).toBeGreaterThan(0);
      } else {
        expect(evidence).toEqual({
          configuration: "not-reached",
          callsObserved: 0,
          returned: null,
          independentlyRecomputed: null,
        });
      }
    }
  });

  test("complete-draft into-measure proves a lawful empty-measure commit", async () => {
    const cases = jsonObject(
      JSON.parse(
        await readFile(join(fixtureRoot, "edit-plan-cases.json"), "utf8"),
      ),
      "edit-plan-cases.json",
    );
    const catalog = jsonObject(
      cases["literalCatalog"],
      "edit-plan-cases.json.literalCatalog",
    );
    const transitions = jsonObject(
      catalog["transitions"],
      "edit-plan-cases.json.literalCatalog.transitions",
    );
    const states = jsonObject(catalog["states"], "literalCatalog.states");
    const commands = jsonObject(
      catalog["commands"],
      "literalCatalog.commands",
    );
    const results = jsonObject(catalog["results"], "literalCatalog.results");
    const transition = jsonObject(
      transitions["A0U1-INS-001-INTO-MEASURE"],
      "A0U1-INS-001-INTO-MEASURE",
    );
    const expected = jsonObject(
      transition["expected"],
      "A0U1-INS-001-INTO-MEASURE.expected",
    );
    const before = jsonObject(
      states[
        literalReferenceKey(
          transition["beforeState"],
          "states",
          "into-measure.beforeState",
        )
      ],
      "into-measure.before",
    );
    const after = jsonObject(
      states[
        literalReferenceKey(
          expected["afterState"],
          "states",
          "into-measure.afterState",
        )
      ],
      "into-measure.after",
    );
    const command = jsonObject(
      commands[
        literalReferenceKey(
          transition["command"],
          "commands",
          "into-measure.command",
        )
      ],
      "into-measure.command",
    );
    const result = jsonObject(
      results[
        literalReferenceKey(
          expected["result"],
          "results",
          "into-measure.result",
        )
      ],
      "into-measure.result",
    );
    const measure = (state: JsonObject, label: string): JsonObject => {
      const document = jsonObject(state["document"], `${label}.document`);
      const sections = document["sections"];
      if (!Array.isArray(sections)) {
        throw new Error(`A0_U1_TEST_SECTIONS_NOT_ARRAY:${label}`);
      }
      for (const rawSection of sections) {
        const section = jsonObject(rawSection, `${label}.section`);
        const measures = section["measures"];
        if (!Array.isArray(measures)) continue;
        for (const rawMeasure of measures) {
          const candidate = jsonObject(rawMeasure, `${label}.measure`);
          if (candidate["id"] === "measure-e0-auto") return candidate;
        }
      }
      throw new Error(`A0_U1_TEST_EMPTY_TARGET_MISSING:${label}`);
    };
    const beforeMeasure = measure(before, "before");
    const afterMeasure = measure(after, "after");
    const beforeEvents = beforeMeasure["events"];
    const afterEvents = afterMeasure["events"];
    const plan = jsonObject(command["plan"], "into-measure.command.plan");
    const source = jsonObject(plan["source"], "into-measure.command.source");
    const receipt = jsonObject(
      result["editPlanReceipt"],
      "into-measure.result.editPlanReceipt",
    );

    expect(beforeMeasure["completion"]).toEqual({ kind: "empty" });
    expect(beforeEvents).toEqual([]);
    expect(source["kind"]).toBe("complete-draft");
    expect(
      jsonObject(
        source["quickEntrySnapshot"],
        "into-measure.quickEntrySnapshot",
      )["sourceText"],
    ).toBe("| G7b9#5:4 |");
    expect(afterMeasure["completion"]).toEqual({ kind: "complete" });
    expect(Array.isArray(afterEvents) ? afterEvents : []).toHaveLength(1);
    expect(receipt["completionMeasureIds"]).toEqual(["measure-e0-auto"]);
    expect(receipt["allocatedIdentities"]).toEqual([
      {
        kind: "event",
        id: "event-u1-complete-measure-1",
        source: {
          kind: "fragment-event",
          sourceEventOrdinal: 0,
        },
      },
    ]);
  });

  for (const filename of A0_U1_EDIT_PLAN_SPEC_FILES) {
    test(`byte pin rejects an otherwise parseable ${filename} tamper`, async () => {
      await withPacketCopy(async (temporaryRoot) => {
        const path = join(temporaryRoot, filename);
        const source = await readFile(path, "utf8");
        expect(source.endsWith("\n")).toBe(true);
        await writeFile(path, `${source.slice(0, -1)} \n`, "utf8");

        const report = await validateA0U1EditPlanContract(temporaryRoot);
        expect(report.outcome).toBe("fail");
        expect(
          findingsFor(report, "EDIT_PLAN_BYTE_DIGEST").some(
            (finding) => finding.path === filename,
          ),
        ).toBe(true);
        expect(findingCodes(report)).not.toContain("EDIT_PLAN_TEXT_CANONICAL");
        expect(findingCodes(report)).not.toContain("EDIT_PLAN_SEMANTIC_DIGEST");
      });
    });
  }

  test("unexpected sixth file fails the exact packet inventory", async () => {
    await withPacketCopy(async (temporaryRoot) => {
      await writeFile(join(temporaryRoot, "unexpected.json"), "{}\n", "utf8");
      const report = await validateA0U1EditPlanContract(temporaryRoot);
      expect(report.outcome).toBe("fail");
      expect(findingCodes(report)).toContain("EDIT_PLAN_FILE_INVENTORY");
    });
  });

  test("duplicate JSON key fails before last-key-wins parsing can hide it", async () => {
    await withPacketCopy(async (temporaryRoot) => {
      const filename = "a0-u1-edit-plan-contract.json";
      const path = join(temporaryRoot, filename);
      const source = await readFile(path, "utf8");
      const changedSource = source.replace(
        "{\n",
        '{\n  "schema": "duplicate-shadow-must-be-refused",\n',
      );
      expect(changedSource).not.toBe(source);
      await writeFile(path, changedSource, "utf8");

      const report = await validateA0U1EditPlanContract(temporaryRoot);
      expect(report.outcome).toBe("fail");
      expect(findingCodes(report)).toContain("EDIT_PLAN_JSON_DUPLICATE_KEY");
      expect(findingCodes(report)).not.toContain("EDIT_PLAN_SEMANTIC_DIGEST");
    });
  });

  const nonCanonicalCases = [
    {
      label: "UTF-8 BOM",
      transform: (source: string): string => `\uFEFF${source}`,
    },
    {
      label: "carriage return",
      transform: (source: string): string => source.replace("\n", "\r\n"),
    },
    {
      label: "second trailing line feed",
      transform: (source: string): string => `${source}\n`,
    },
  ] as const;

  for (const canonicalCase of nonCanonicalCases) {
    test(`${canonicalCase.label} fails canonical text`, async () => {
      await withPacketCopy(async (temporaryRoot) => {
        const filename = "a0-u1-edit-plan-contract.json";
        const path = join(temporaryRoot, filename);
        const source = await readFile(path, "utf8");
        await writeFile(path, canonicalCase.transform(source), "utf8");

        const report = await validateA0U1EditPlanContract(temporaryRoot);
        expect(report.outcome).toBe("fail");
        expect(findingCodes(report)).toContain("EDIT_PLAN_TEXT_CANONICAL");
      });
    });
  }

  for (const mutation of semanticFieldMutations) {
    test(
      `${mutation.label} one-field tamper defeats a refreshed byte pin`,
      async () => {
        await withPacketCopy(async (temporaryRoot) => {
          const changedDigest = await mutateCanonicalJsonField(
            temporaryRoot,
            mutation.filename,
            mutation.path,
            (current) => {
              if (JSON.stringify(current) !== JSON.stringify(mutation.from)) {
                throw new Error(
                  `A0_U1_TEST_MUTATION_BASELINE_DRIFT:${mutation.label}`,
                );
              }
              return mutation.to;
            },
          );
          const report = await validateA0U1EditPlanContract(temporaryRoot, {
            expectedByteDigests: {
              ...A0_U1_EDIT_PLAN_SPEC_BYTE_DIGESTS,
              [mutation.filename]: changedDigest,
            },
          });

          expect(report.outcome).toBe("fail");
          expect(findingCodes(report)).toContain("EDIT_PLAN_SEMANTIC_DIGEST");
          expect(
            report.findings.some(
              (finding) =>
                finding.code === mutation.findingCode &&
                finding.path.includes(mutation.findingPathIncludes),
            ),
          ).toBe(true);
          expect(
            findingsFor(report, "EDIT_PLAN_BYTE_DIGEST").some(
              (finding) => finding.path === mutation.filename,
            ),
          ).toBe(false);
        });
      },
      { timeout: 300_000, retry: 0 },
    );
  }

  test(
    "history-estimator returned-byte tamper defeats a refreshed byte pin",
    async () => {
      await withPacketCopy(async (temporaryRoot) => {
        const filename = "edit-plan-cases.json";
        const changedDigest = await mutateCanonicalJsonField(
          temporaryRoot,
          filename,
          [
            "literalCatalog",
            "historyEstimatorEvidence",
            "A0U1-INS-001-APPLY",
            "returned",
          ],
          (current) => {
            if (!Number.isSafeInteger(current) || Number(current) <= 0) {
              throw new Error(
                "A0_U1_TEST_HISTORY_ESTIMATOR_BASELINE_NOT_POSITIVE_SAFE_INTEGER",
              );
            }
            return Number(current) + 1;
          },
        );
        const report = await validateA0U1EditPlanContract(temporaryRoot, {
          expectedByteDigests: {
            ...A0_U1_EDIT_PLAN_SPEC_BYTE_DIGESTS,
            [filename]: changedDigest,
          },
        });

        expect(report.outcome).toBe("fail");
        expect(findingCodes(report)).toContain(
          "EDIT_PLAN_HISTORY_ESTIMATOR_RETURNED",
        );
        expect(
          findingsFor(report, "EDIT_PLAN_HISTORY_ESTIMATOR_RETURNED").some(
            (finding) => finding.path.includes("A0U1-INS-001-APPLY"),
          ),
        ).toBe(true);
        expect(findingCodes(report)).toContain("EDIT_PLAN_SEMANTIC_DIGEST");
        expect(
          findingsFor(report, "EDIT_PLAN_BYTE_DIGEST").some(
            (finding) => finding.path === filename,
          ),
        ).toBe(false);
      });
    },
    { timeout: 300_000, retry: 0 },
  );

  test(
    "joint outer-counter mirror tamper is rejected by the independent exact oracle",
    async () => {
      await withPacketCopy(async (temporaryRoot) => {
        const filename = "edit-plan-cases.json";
        const changedDigest = await mutateCanonicalJsonFields(
          temporaryRoot,
          filename,
          [
            {
              path: [
                "literalCatalog",
                "counters",
                "a0u1-ins-001-apply",
                "outer",
                "eventsVisited",
              ],
              from: 7,
              to: 8,
            },
            {
              path: [
                "literalCatalog",
                "results",
                "a0u1-ins-001-apply",
                "counters",
                "eventsVisited",
              ],
              from: 7,
              to: 8,
            },
          ],
        );
        const report = await validateA0U1EditPlanContract(temporaryRoot, {
          expectedByteDigests: {
            ...A0_U1_EDIT_PLAN_SPEC_BYTE_DIGESTS,
            [filename]: changedDigest,
          },
        });

        expect(report.outcome).toBe("fail");
        expect(findingCodes(report)).toContain(
          "EDIT_PLAN_EXACT_OUTER_WORK_ORACLE",
        );
        expect(
          findingsFor(report, "EDIT_PLAN_EXACT_OUTER_WORK_ORACLE").some(
            (finding) => finding.path.includes("A0U1-INS-001-APPLY"),
          ),
        ).toBe(true);
        expect(findingCodes(report)).toContain("EDIT_PLAN_SEMANTIC_DIGEST");
        expect(
          findingsFor(report, "EDIT_PLAN_BYTE_DIGEST").some(
            (finding) => finding.path === filename,
          ),
        ).toBe(false);
      });
    },
    { timeout: 300_000, retry: 0 },
  );

  test(
    "joint history outer-code swap is rejected by the dependency-specific oracle",
    async () => {
      await withPacketCopy(async (temporaryRoot) => {
        const filename = "edit-plan-cases.json";
        const changedDigest = await mutateCanonicalJsonFields(
          temporaryRoot,
          filename,
          [
            {
              path: [
                "literalCatalog",
                "results",
                "a0u1-ins-009-collision",
                "refusal",
                "code",
              ],
              from: "history.byte_estimate_invalid",
              to: "history.entry_too_large",
            },
            {
              path: [
                "literalCatalog",
                "results",
                "a0u1-ins-009-collision",
                "editPlanRefusal",
                "outerCode",
              ],
              from: "history.byte_estimate_invalid",
              to: "history.entry_too_large",
            },
          ],
        );
        const report = await validateA0U1EditPlanContract(temporaryRoot, {
          expectedByteDigests: {
            ...A0_U1_EDIT_PLAN_SPEC_BYTE_DIGESTS,
            [filename]: changedDigest,
          },
        });

        expect(report.outcome).toBe("fail");
        expect(findingCodes(report)).toContain(
          "EDIT_PLAN_HISTORY_EXACT_OUTER_CODE",
        );
        expect(findingCodes(report)).toContain(
          "EDIT_PLAN_HISTORY_EXACT_NESTED_OUTER_CODE",
        );
        expect(findingCodes(report)).toContain("EDIT_PLAN_SEMANTIC_DIGEST");
        expect(
          findingsFor(report, "EDIT_PLAN_BYTE_DIGEST").some(
            (finding) => finding.path === filename,
          ),
        ).toBe(false);
      });
    },
    { timeout: 300_000, retry: 0 },
  );

  test("live A0 command tuple remains 15 and the proposal appends only apply-edit-plan", () => {
    const acceptedA0Kinds = [
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
    ] as const;

    expect(APPLICATION_COMMAND_KINDS).toEqual(acceptedA0Kinds);
    expect(APPLICATION_COMMAND_KINDS).toHaveLength(15);
    expect(A0_U1_PROPOSED_APPLICATION_COMMAND_KINDS).toEqual([
      ...acceptedA0Kinds,
      "apply-edit-plan",
    ]);
    expect(A0_U1_PROPOSED_APPLICATION_COMMAND_KINDS).toHaveLength(16);
    expect(A0_U1_PROPOSED_APPLICATION_COMMAND_KINDS.slice(0, -1)).toEqual([
      ...APPLICATION_COMMAND_KINDS,
    ]);
    expect(A0_U1_PROPOSED_APPLICATION_COMMAND_KINDS.slice(15)).toEqual([
      "apply-edit-plan",
    ]);
  });

  test("source tuple constants are exhaustive and declaration ordered", () => {
    expect(A0_U1_ATOMIC_EDIT_PLAN_KINDS).toEqual([
      "insert-fragment",
      "split-event-duration",
      "join-event-durations",
      "split-section",
      "join-sections",
    ]);
    expect(
      MAX_A0_U1_REACHABLE_FINAL_TIMELINE_QUARTER_NOTE_BEATS,
    ).toBe(524_288);
    expect(
      MAX_A0_U1_REACHABLE_FINAL_TIMELINE_QUARTER_NOTE_BEATS,
    ).toBeLessThan(A0_U1_ATOMIC_EDIT_LIMITS.finalTimelineQuarterNoteBeats);
    expect(A0_U1_STATIC_REFUSAL_REACHABILITY).toEqual({
      "edit-plan.source-code-points-exceeded":
        "static-dominated-by-accepted-quick-entry-invariants",
      "edit-plan.source-unicode-invalid":
        "static-dominated-by-accepted-quick-entry-invariants",
      "edit-plan.source-utf8-bytes-exceeded":
        "static-dominated-by-accepted-quick-entry-invariants",
      "edit-plan.timeline-limit-exceeded":
        "static-dominated-by-final-event-and-meter-capacity-invariants",
    });
    expect(A0_U1_INSERT_FRAGMENT_PLACEMENT_KINDS).toEqual([
      "into-measure",
      "into-section",
      "into-document",
    ]);
    expect(A0_U1_ATOMIC_EDIT_PLAN_RUNNER_STAGE_ORDER).toEqual([
      "exact-runtime-shape",
      "a0-envelope",
      "quick-entry-snapshot",
      "bounded-source-preflight",
      "target-and-destination",
      "t0-fragment-parse",
      "warning-acknowledgements",
      "completion-and-metadata-declarations",
      "operation-laws",
      "final-collection-and-timeline-limits",
      "stable-id-allocation",
      "candidate-construction",
      "f2-once",
      "f3-once",
      "bookmarks-history-and-atomic-publication",
    ]);
    expect(A0_U1_ATOMIC_EDIT_PLAN_ID_ALLOCATION_ORDER).toEqual([
      "preflight-operation-local-shape-snapshot-parser-declarations-laws-and-bounds",
      "index-document-section-measure-event-ids-globally",
      "fragment-section-before-descendants",
      "fragment-measure-before-events",
      "fragment-events-in-source-order",
      "recovered-chord-selected-only",
      "split-event-second-only",
      "split-section-suffix-only",
      "reserve-each-returned-id-locally",
      "stop-without-retry-on-first-failure-or-collision",
    ]);
    expect(A0_U1_ATOMIC_EDIT_PLAN_DIAGNOSTIC_ORDER).toEqual([
      "path-domain-segment-order",
      "null-source-range-before-ranged",
      "source-range-start-ascending",
      "source-range-end-ascending",
      "code-ecmascript-code-unit-lexical",
    ]);
    expect(A0_U1_RECOVERY_FIELD_COMPARISON_ORDER).toEqual([
      "placement",
      "selected-global-ordinal",
      "layout-loss-acknowledgement",
      "duration-branch-and-value",
    ]);
    expect(A0_U1_FINAL_COLLECTION_LIMIT_COMPARISON_ORDER).toEqual([
      "final-document-sections",
      "final-section-measures-in-section-order",
      "final-total-measures",
      "final-document-events",
      "occupied-id-records",
      "plan-node-records",
    ]);
    expect(A0_U1_ATOMIC_EDIT_PLAN_TERMINATIONS).toEqual([
      "complete",
      "input-refusal",
      "allocation-refusal",
      "publication-refusal",
      "history-refusal",
    ]);
    expect(A0_U1_ATOMIC_EDIT_PLAN_FORBIDDEN_PAYLOAD_KEYS).toEqual([
      "candidate",
      "document",
      "commands",
      "plans",
      "nestedPlan",
      "patch",
      "derivedPatch",
      "replacement",
      "importDraft",
    ]);
    expect(A0_U1_ATOMIC_EDIT_OUTER_REFUSAL_CODES).toEqual([
      "command.payload_invalid",
      "command.target_missing",
      "command.destination_invalid",
      "command.id_allocation_failed",
      "command.structural_validation_failed",
      "command.semantic_validation_failed",
      "history.entry_too_large",
      "history.byte_estimate_invalid",
    ]);
    expect(A0_U1_ATOMIC_EDIT_HISTORY_REFUSAL_POLICY).toEqual({
      invalidEstimate: {
        predicate: "not-a-nonnegative-safe-integer",
        outerCode: "history.byte_estimate_invalid",
        nestedCode: "edit-plan.history-refused",
        path: ["history"],
      },
      oversizedEstimate: {
        predicate: "valid-estimate-greater-than-retained-byte-maximum",
        maximum: 16_777_216,
        outerCode: "history.entry_too_large",
        nestedCode: "edit-plan.history-refused",
        path: ["history"],
      },
    });
    expect(Object.isFrozen(A0_U1_ATOMIC_EDIT_HISTORY_REFUSAL_POLICY)).toBe(
      true,
    );
    expect(
      [
        A0_U1_ATOMIC_EDIT_HISTORY_REFUSAL_POLICY.invalidEstimate,
        A0_U1_ATOMIC_EDIT_HISTORY_REFUSAL_POLICY.invalidEstimate.path,
        A0_U1_ATOMIC_EDIT_HISTORY_REFUSAL_POLICY.oversizedEstimate,
        A0_U1_ATOMIC_EDIT_HISTORY_REFUSAL_POLICY.oversizedEstimate.path,
      ].every(Object.isFrozen),
    ).toBe(true);
    expect(A0_U1_ATOMIC_EDIT_PREPLAN_OUTER_REFUSAL_CODES).toEqual([
      "command.id_invalid",
      "command.label_invalid",
      "command.logical_time_invalid",
      "command.wrong_document",
      "command.stale_revision",
      "application.revision_exhausted",
      "application.sequence_exhausted",
      "command.coalescing_invalid",
      "history.locked",
    ]);
    expect(A0_U1_ATOMIC_EDIT_REFUSAL_CODES).toEqual([
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
      "edit-plan.event-content-mismatch",
      "edit-plan.right-annotation-not-empty",
      "edit-plan.collection-limit-exceeded",
      "edit-plan.timeline-limit-exceeded",
      "edit-plan.id-factory-failed",
      "edit-plan.id-collision",
      "edit-plan.structural-publication-refused",
      "edit-plan.semantic-publication-refused",
      "edit-plan.history-refused",
    ]);
    expect(A0_U1_ATOMIC_EDIT_WORK_COUNTER_NAMES).toEqual([
      "structuralDecodeCalls",
      "semanticValidationCalls",
      "planNodesVisited",
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
      "completionDeclarationsVisited",
      "metadataFieldsCompared",
      "metadataCodePointsObserved",
      "exactBeatAdditions",
      "exactBeatComparisons",
      "idAllocationAttempts",
      "idCollisionChecks",
      "bookmarkRecordsExamined",
      "bookmarkRecordsRewritten",
      "peakPlanNodeRecords",
      "peakAllocatedIdRecords",
      "peakDiagnosticRecords",
    ]);
    expect(A0_U1_ATOMIC_EDIT_LAW_IDS).toEqual([
      "A0-U1-ATOM-001-command-and-five-closed-variants",
      "A0-U1-ATOM-002-quick-entry-snapshot-and-target-exact",
      "A0-U1-ATOM-003-raw-source-reparsed-once-by-t0",
      "A0-U1-ATOM-004-complete-draft-success-and-warnings-exact",
      "A0-U1-ATOM-005-recovered-failure-selects-one-chord",
      "A0-U1-ATOM-006-recovered-loss-duration-placement-exact",
      "A0-U1-ATOM-007-complete-draft-placement-shape-exact",
      "A0-U1-ATOM-008-new-event-policy-fixed",
      "A0-U1-ATOM-009-completion-declarations-exact",
      "A0-U1-ATOM-010-split-event-lossless-exact",
      "A0-U1-ATOM-011-join-events-left-inverse-exact",
      "A0-U1-ATOM-012-split-section-leading-survivor-exact",
      "A0-U1-ATOM-013-join-sections-left-metadata-exact",
      "A0-U1-ATOM-014-timeline-and-bounds-preserved",
      "A0-U1-ATOM-015-ids-preflight-preorder-honest-entropy",
      "A0-U1-ATOM-016-bookmarks-publication-history-atomic",
      "A0-U1-ATOM-017-transposition-and-existing-a0-unchanged",
    ]);
  });

  test("every nested refusal has the exact allowed outer-code family", () => {
    expect(A0_U1_ATOMIC_EDIT_ALLOWED_OUTER_CODES_BY_REFUSAL_CODE).toEqual({
      "edit-plan.command-shape-invalid": ["command.payload_invalid"],
      "edit-plan.plan-shape-invalid": ["command.payload_invalid"],
      "edit-plan.quick-entry-snapshot-mismatch": ["command.payload_invalid"],
      "edit-plan.source-code-points-exceeded": ["command.payload_invalid"],
      "edit-plan.source-unicode-invalid": ["command.payload_invalid"],
      "edit-plan.source-utf8-bytes-exceeded": ["command.payload_invalid"],
      "edit-plan.target-missing": ["command.target_missing"],
      "edit-plan.destination-invalid": ["command.destination_invalid"],
      "edit-plan.event-order-invalid": ["command.destination_invalid"],
      "edit-plan.section-split-boundary-invalid": [
        "command.destination_invalid",
      ],
      "edit-plan.section-order-invalid": ["command.destination_invalid"],
      "edit-plan.recovered-chord-placement-invalid": [
        "command.payload_invalid",
      ],
      "edit-plan.syntax-refused": ["command.payload_invalid"],
      "edit-plan.recovered-chord-requires-parse-failure": [
        "command.payload_invalid",
      ],
      "edit-plan.recovered-chord-ordinal-missing": ["command.payload_invalid"],
      "edit-plan.warning-acknowledgements-mismatch": [
        "command.payload_invalid",
      ],
      "edit-plan.fragment-placement-mismatch": ["command.payload_invalid"],
      "edit-plan.completion-declarations-mismatch": ["command.payload_invalid"],
      "edit-plan.section-metadata-mismatch": ["command.payload_invalid"],
      "edit-plan.recovered-chord-layout-loss-unacknowledged": [
        "command.payload_invalid",
      ],
      "edit-plan.recovered-chord-duration-mismatch": [
        "command.payload_invalid",
      ],
      "edit-plan.duration-invalid": ["command.payload_invalid"],
      "edit-plan.duration-sum-mismatch": ["command.payload_invalid"],
      "edit-plan.event-content-mismatch": ["command.payload_invalid"],
      "edit-plan.right-annotation-not-empty": ["command.payload_invalid"],
      "edit-plan.collection-limit-exceeded": ["command.payload_invalid"],
      "edit-plan.timeline-limit-exceeded": ["command.payload_invalid"],
      "edit-plan.id-factory-failed": ["command.id_allocation_failed"],
      "edit-plan.id-collision": ["command.id_allocation_failed"],
      "edit-plan.structural-publication-refused": [
        "command.structural_validation_failed",
      ],
      "edit-plan.semantic-publication-refused": [
        "command.semantic_validation_failed",
      ],
      "edit-plan.history-refused": [
        "history.entry_too_large",
        "history.byte_estimate_invalid",
      ],
    });
  });

  test("runtime exact-key tuples close every command and plan object shape", () => {
    expect(A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS).toEqual({
      envelope: [
        "id",
        "label",
        "expectedDocumentId",
        "expectedRevision",
        "logicalTimeMs",
        "coalescing",
        "kind",
        "plan",
      ],
      completeDraftPlan: ["kind", "source", "placement", "voicingPolicy"],
      recoveredChordPlan: ["kind", "source", "placement", "voicingPolicy"],
      completeDraftSource: [
        "kind",
        "quickEntrySnapshot",
        "warningAcknowledgements",
      ],
      recoveredChordSource: [
        "kind",
        "quickEntrySnapshot",
        "selectedGlobalOrdinal",
        "layoutLossAcknowledgement",
        "callerDuration",
      ],
      quickEntrySnapshot: [
        "sourceText",
        "baseRevision",
        "target",
        "issueCodes",
        "expectedStatus",
        "expectedLane",
      ],
      documentBoundary: ["kind"],
      sectionBoundary: ["kind", "sectionId"],
      measureBoundary: ["kind", "measureId"],
      eventBoundary: ["kind", "eventId"],
      completeDraftIntoMeasurePlacement: [
        "kind",
        "measureId",
        "beforeEventId",
        "layoutDisposition",
        "completionDeclarations",
      ],
      recoveredChordIntoMeasurePlacement: [
        "kind",
        "measureId",
        "beforeEventId",
        "layoutDisposition",
        "completionDeclarations",
      ],
      intoSectionPlacement: [
        "kind",
        "sectionId",
        "beforeMeasureId",
        "layoutDisposition",
        "completionDeclarations",
      ],
      intoDocumentPlacement: [
        "kind",
        "beforeSectionId",
        "layoutDisposition",
        "sectionDeclarations",
        "completionDeclarations",
      ],
      warningAcknowledgement: ["code", "range"],
      sourceRange: ["start", "end"],
      beatDuration: ["numerator", "denominator"],
      measureCompletionEmpty: ["kind"],
      measureCompletionComplete: ["kind"],
      measureCompletionPickupOrIncomplete: [
        "kind",
        "expectedDuration",
        "reason",
      ],
      keyContext: ["tonic", "mode"],
      spelledPitchClass: ["step", "alter"],
      completionDeclaration: ["measureId", "completion"],
      sectionDeclaration: ["sourceSectionOrdinal", "voiceLeadingBoundary"],
      sectionMetadata: [
        "name",
        "annotation",
        "keyOverride",
        "voiceLeadingBoundary",
      ],
      splitEventDurationPlan: [
        "kind",
        "eventId",
        "firstDuration",
        "secondDuration",
        "completionDeclarations",
        "identityPolicy",
        "contentPolicy",
        "annotationPolicy",
      ],
      joinEventDurationsPlan: [
        "kind",
        "leftEventId",
        "rightEventId",
        "joinedDuration",
        "completionDeclarations",
        "identityPolicy",
        "contentPolicy",
        "annotationPolicy",
      ],
      splitSectionPlan: [
        "kind",
        "sectionId",
        "beforeMeasureId",
        "newSectionMetadata",
        "completionDeclarations",
        "identityPolicy",
        "measurePolicy",
      ],
      joinSectionsPlan: [
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
      newEventAutoVoicing: [
        "mode",
        "family",
        "voiceCount",
        "range",
        "bassPolicy",
      ],
      newEventAutoVoicingRange: ["lowMidi", "highMidi"],
      receiptBase: [
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
      receiptOperation: [
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
      completeDraftInsertSourceReceipt: [
        "kind",
        "parserOutcome",
        "quickEntrySnapshotMatched",
        "canonicalTargetMatched",
        "acknowledgedWarningCount",
      ],
      recoveredChordInsertSourceReceipt: [
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
      bookmarkReceiptCore: [
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
      ],
      joinSectionsBookmarkReceiptExtension: [
        "rightSectionWasEmpty",
        "rightSectionFirstMeasureId",
        "rightSectionStartRewrite",
      ],
      boundaryRewrite: ["from", "to"],
      selectionReplacement: ["fromEventId", "toEventId"],
      focusTargetChart: ["kind"],
      focusTargetSection: ["kind", "sectionId"],
      focusTargetMeasure: ["kind", "measureId"],
      focusTargetEvent: ["kind", "eventId"],
      allocatedIdentity: ["kind", "id", "source"],
      fragmentSectionIdentitySource: ["kind", "sourceSectionOrdinal"],
      splitSectionIdentitySource: ["kind", "sourceSectionId"],
      fragmentMeasureIdentitySource: [
        "kind",
        "sourceSectionOrdinal",
        "sourceMeasureOrdinal",
      ],
      fragmentEventIdentitySource: ["kind", "sourceEventOrdinal"],
      recoveredChordIdentitySource: ["kind", "selectedGlobalOrdinal"],
      splitEventSecondIdentitySource: ["kind", "sourceEventId"],
      removedIdentity: ["kind", "id"],
      diagnostic: [
        "code",
        "owner",
        "path",
        "sourceRange",
        "syntaxCode",
        "observed",
        "maximum",
      ],
      workEvidence: [
        "structuralDecodeCalls",
        "semanticValidationCalls",
        "planNodesVisited",
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
        "completionDeclarationsVisited",
        "metadataFieldsCompared",
        "metadataCodePointsObserved",
        "exactBeatAdditions",
        "exactBeatComparisons",
        "idAllocationAttempts",
        "idCollisionChecks",
        "bookmarkRecordsExamined",
        "bookmarkRecordsRewritten",
        "peakPlanNodeRecords",
        "peakAllocatedIdRecords",
        "peakDiagnosticRecords",
        "termination",
      ],
    });
    expect(Object.isFrozen(A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS)).toBe(true);
    expect(
      Object.values(A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS).every(Object.isFrozen),
    ).toBe(true);
  });

  test("runtime shape probing passively handles proxies, accessors, and inherited required fields", () => {
    const cases = [
      {
        label: "own root accessor",
        prepare(
          command: ReturnType<typeof validRuntimeShapeProbeCommand>,
          countGetterCall: () => void,
        ) {
          Object.defineProperty(command, "kind", {
            configurable: true,
            enumerable: true,
            get() {
              countGetterCall();
              return "apply-edit-plan";
            },
          });
        },
        expected: {
          code: "edit-plan.command-shape-invalid",
          path: ["kind"],
        },
      },
      {
        label: "own nested accessor",
        prepare(
          command: ReturnType<typeof validRuntimeShapeProbeCommand>,
          countGetterCall: () => void,
        ) {
          Object.defineProperty(
            command.plan.source.quickEntrySnapshot,
            "sourceText",
            {
              configurable: true,
              enumerable: true,
              get() {
                countGetterCall();
                return "| C7 |";
              },
            },
          );
        },
        expected: {
          code: "edit-plan.plan-shape-invalid",
          path: ["plan", "source", "quickEntrySnapshot", "sourceText"],
        },
      },
      {
        label: "inherited root data property",
        prepare(
          command: ReturnType<typeof validRuntimeShapeProbeCommand>,
          countGetterCall: () => void,
        ) {
          void countGetterCall;
          Reflect.deleteProperty(command, "kind");
          const prototype = Object.create(null) as object;
          Object.defineProperty(prototype, "kind", {
            configurable: true,
            enumerable: true,
            value: "apply-edit-plan",
          });
          Object.setPrototypeOf(command, prototype);
        },
        expected: {
          code: "edit-plan.command-shape-invalid",
          path: ["kind"],
        },
      },
      {
        label: "inherited root getter",
        prepare(
          command: ReturnType<typeof validRuntimeShapeProbeCommand>,
          countGetterCall: () => void,
        ) {
          Reflect.deleteProperty(command, "kind");
          const prototype = Object.create(null) as object;
          Object.defineProperty(prototype, "kind", {
            configurable: true,
            enumerable: true,
            get() {
              countGetterCall();
              return "apply-edit-plan";
            },
          });
          Object.setPrototypeOf(command, prototype);
        },
        expected: {
          code: "edit-plan.command-shape-invalid",
          path: ["kind"],
        },
      },
      {
        label: "inherited nested data property",
        prepare(
          command: ReturnType<typeof validRuntimeShapeProbeCommand>,
          countGetterCall: () => void,
        ) {
          void countGetterCall;
          const snapshot = command.plan.source.quickEntrySnapshot;
          Reflect.deleteProperty(snapshot, "sourceText");
          const prototype = Object.create(null) as object;
          Object.defineProperty(prototype, "sourceText", {
            configurable: true,
            enumerable: true,
            value: "| C7 |",
          });
          Object.setPrototypeOf(snapshot, prototype);
        },
        expected: {
          code: "edit-plan.plan-shape-invalid",
          path: ["plan", "source", "quickEntrySnapshot", "sourceText"],
        },
      },
      {
        label: "inherited nested getter",
        prepare(
          command: ReturnType<typeof validRuntimeShapeProbeCommand>,
          countGetterCall: () => void,
        ) {
          const snapshot = command.plan.source.quickEntrySnapshot;
          Reflect.deleteProperty(snapshot, "sourceText");
          const prototype = Object.create(null) as object;
          Object.defineProperty(prototype, "sourceText", {
            configurable: true,
            enumerable: true,
            get() {
              countGetterCall();
              return "| C7 |";
            },
          });
          Object.setPrototypeOf(snapshot, prototype);
        },
        expected: {
          code: "edit-plan.plan-shape-invalid",
          path: ["plan", "source", "quickEntrySnapshot", "sourceText"],
        },
      },
    ] as const;

    expect(
      probeA0U1RuntimeShapeRefusal(validRuntimeShapeProbeCommand()),
    ).toBeNull();

    const proxyTarget = validRuntimeShapeProbeCommand();
    let proxyGetCalls = 0;
    const forwardingProxy = new Proxy(proxyTarget, {
      get(target, property, receiver) {
        proxyGetCalls += 1;
        const value: unknown = Reflect.get(target, property, receiver);
        return value;
      },
      getOwnPropertyDescriptor(target, property) {
        return Reflect.getOwnPropertyDescriptor(target, property);
      },
      ownKeys(target) {
        return Reflect.ownKeys(target);
      },
    });
    expect(
      probeA0U1RuntimeShapeRefusal(forwardingProxy),
      "forwarding root Proxy",
    ).toBeNull();
    expect(proxyGetCalls, "forwarding root Proxy").toBe(0);

    const splitCommand = validRuntimeShapeProbeSplitCommand();
    const completionDeclaration = splitCommand.plan.completionDeclarations[0];
    let arrayIndexGetterCalls = 0;
    Object.defineProperty(splitCommand.plan.completionDeclarations, 0, {
      configurable: true,
      enumerable: true,
      get() {
        arrayIndexGetterCalls += 1;
        return completionDeclaration;
      },
    });
    expect(
      probeA0U1RuntimeShapeRefusal(splitCommand),
      "array index accessor",
    ).toEqual({
      code: "edit-plan.plan-shape-invalid",
      path: ["plan", "completionDeclarations", 0],
    });
    expect(arrayIndexGetterCalls, "array index accessor").toBe(0);

    for (const hostileCase of cases) {
      const command = validRuntimeShapeProbeCommand();
      let getterCalls = 0;
      hostileCase.prepare(command, () => {
        getterCalls += 1;
      });

      expect(probeA0U1RuntimeShapeRefusal(command), hostileCase.label).toEqual(
        hostileCase.expected,
      );
      expect(getterCalls, hostileCase.label).toBe(0);
    }
  });

  test("scalar, bound, bookmark, transposition, and entropy authorities are exact", () => {
    expect({
      contractSchema: A0_U1_ATOMIC_EDIT_PLAN_CONTRACT_SCHEMA,
      policyId: A0_U1_ATOMIC_EDIT_PLAN_POLICY_ID,
      policyVersion: A0_U1_ATOMIC_EDIT_PLAN_POLICY_VERSION,
      receiptSchema: A0_U1_ATOMIC_EDIT_PLAN_RECEIPT_SCHEMA,
      implementationStatus: A0_U1_ATOMIC_EDIT_IMPLEMENTATION_STATUS,
      parserAccidentalStyle: A0_U1_FRAGMENT_PARSE_ACCIDENTAL_STYLE,
      newEventPolicyId: A0_U1_NEW_EVENT_POLICY_ID,
      recoveredLayoutLossAcknowledgement:
        A0_U1_RECOVERED_CHORD_LAYOUT_LOSS_ACKNOWLEDGEMENT,
    }).toEqual({
      contractSchema: "changes.application.atomic-edit-plan-contract.v1",
      policyId: "changes.application-atomic-edit-plan",
      policyVersion: 1,
      receiptSchema: "changes.application.atomic-edit-plan-receipt.v1",
      implementationStatus: "specified-unimplemented",
      parserAccidentalStyle: "ascii",
      newEventPolicyId: "a0-u1-balanced-4-48-84-generated@1",
      recoveredLayoutLossAcknowledgement:
        "source-bar-and-section-layout-will-be-lost@1",
    });
    expect(A0_U1_NEW_EVENT_AUTO_VOICING).toEqual({
      mode: "auto",
      family: "balanced",
      voiceCount: 4,
      range: { lowMidi: 48, highMidi: 84 },
      bassPolicy: "generated",
    });
    expect(A0_U1_ATOMIC_EDIT_LIMITS).toEqual({
      structuralDecodeCalls: 1,
      semanticValidationCalls: 1,
      fragmentSourceCodePoints: 4_096,
      fragmentSourceUtf8Bytes: 16_384,
      fragmentSections: 64,
      fragmentMeasuresPerSection: 1_024,
      fragmentMeasures: 65_536,
      fragmentEvents: 8_192,
      finalTimelineQuarterNoteBeats: 1_000_000,
      completionDeclarations: 1,
      sectionDeclarations: 64,
      retainedDiagnostics: 64,
      retainedWarningAcknowledgements: 64,
      quickEntryIssueCodes: 64,
      quickEntrySnapshotFieldsCompared: 6,
      insertableChordsExamined: 8_192,
      recoveryFieldsCompared: 4,
      idAllocationAttempts: 73_792,
      occupiedIdRecords: 73_793,
      planNodeRecords: 73_793,
      bookmarkRecordsExamined: 8_196,
      exactBeatAdditions: 8_193,
      exactBeatComparisons: 8_193,
      metadataFieldsCompared: 12,
      sectionNameCodePoints: 256,
      sectionAnnotationCodePoints: 2_000,
      completionReasonCodePoints: 2_000,
      planMetadataCodePoints: 6_768,
    });
    expect(A0_U1_ATOMIC_EDIT_WORK_COUNTER_MAXIMA).toEqual({
      structuralDecodeCalls: 1,
      semanticValidationCalls: 1,
      planNodesVisited: 73_794,
      sourceCodePointsObserved: 4_097,
      sourceUtf8BytesObserved: 16_385,
      quickEntrySnapshotFieldsCompared: 6,
      quickEntryIssueCodesCompared: 65,
      syntaxParseCalls: 1,
      warningAcknowledgementsCompared: 65,
      insertableChordsExamined: 8_192,
      recoveryFieldsCompared: 4,
      draftSectionsVisited: 65,
      draftMeasuresVisited: 65_537,
      draftEventsVisited: 8_193,
      completionDeclarationsVisited: 2,
      metadataFieldsCompared: 12,
      metadataCodePointsObserved: 6_769,
      exactBeatAdditions: 8_193,
      exactBeatComparisons: 8_193,
      idAllocationAttempts: 73_792,
      idCollisionChecks: 73_792,
      bookmarkRecordsExamined: 8_196,
      bookmarkRecordsRewritten: 4,
      peakPlanNodeRecords: 73_794,
      peakAllocatedIdRecords: 73_792,
      peakDiagnosticRecords: 64,
    });
    expect(A0_U1_QUICK_ENTRY_TARGET_MATCH_POLICY).toEqual({
      parentOwnership: "same-declared-parent-required",
      measure: {
        "measure-start": "before-first-event-or-append-when-empty",
        "before-event": "before-that-event",
        "after-event": "before-next-event-or-append",
        "measure-end": "append",
      },
      section: {
        "section-start": "before-first-measure-or-append-when-empty",
        "before-measure": "before-that-measure",
        "after-measure": "before-next-measure-or-append",
        "section-end": "append",
      },
      document: {
        "document-start": "before-first-section-or-append-when-empty",
        "before-section": "before-that-section",
        "after-section": "before-next-section-or-append",
        "document-end": "append",
      },
      placementSlots: {
        intoMeasure:
          "resolved-before-event-sibling-id-equals-beforeEventId-or-append-equals-null",
        intoSection:
          "resolved-before-measure-sibling-id-equals-beforeMeasureId-or-append-equals-null",
        intoDocument:
          "resolved-before-section-sibling-id-equals-beforeSectionId-or-append-equals-null",
      },
      completeDraftIntoEmptyMeasure: {
        acceptedTargets: ["measure-start", "measure-end"],
        canonicalDestination: "append",
        beforeEventId: null,
      },
    });
    expect(A0_U1_ATOMIC_EDIT_PLAN_BOOKMARK_POLICIES).toEqual({
      insertFragment:
        "preserve-selection-and-range-move-insertion-after-last-inserted",
      splitEventDuration:
        "preserve-original-selection-rewrite-original-span-end-to-second",
      joinEventDurations:
        "replace-removed-right-selection-with-left-clear-unrepresentable-range",
      splitSection:
        "preserve-node-identities-rewrite-source-section-end-to-suffix",
      joinSections:
        "preserve-measure-event-identities-map-internal-edge-to-first-measure-or-surviving-end",
    });
    expect(A0_U1_ATOMIC_EDIT_OUTER_WORK_POLICY).toEqual({
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
    });
    expect(Object.isFrozen(A0_U1_ATOMIC_EDIT_OUTER_WORK_POLICY)).toBe(true);
    expect(
      Object.values(
        A0_U1_ATOMIC_EDIT_OUTER_WORK_POLICY.indexPassesByOutcome,
      ).every(Object.isFrozen),
    ).toBe(true);
    expect(
      [
        A0_U1_ATOMIC_EDIT_OUTER_WORK_POLICY.indexPassesByOutcome,
        A0_U1_ATOMIC_EDIT_OUTER_WORK_POLICY.historyEntriesVisited,
        A0_U1_ATOMIC_EDIT_OUTER_WORK_POLICY.historyBytesEstimated,
        A0_U1_ATOMIC_EDIT_OUTER_WORK_POLICY.bookmarksRepaired,
        A0_U1_ATOMIC_EDIT_OUTER_WORK_POLICY.validationCalls,
      ].every(Object.isFrozen),
    ).toBe(true);
    expect(A0_U1_ATOMIC_EDIT_PLAN_TRANSPOSITION_POLICY).toEqual({
      operationPerformsTransposition: false,
      insertFragment: "preserve-t0-source-spelling-exactly",
      splitEventDuration: "copy-current-chord-and-voicing-exactly",
      joinEventDurations:
        "require-literal-chord-and-voicing-equality-not-enharmonic-equivalence",
      splitSection:
        "commutes-with-spelling-preserving-transposition-of-affected-event-ids",
      joinSections:
        "commutes-with-spelling-preserving-transposition-of-affected-event-ids",
    });
    expect(A0_U1_ATOMIC_EDIT_PLAN_ID_ENTROPY_POLICY).toEqual({
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
    });
  });
});
