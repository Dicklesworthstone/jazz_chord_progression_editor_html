import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { createHash } from "node:crypto";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  ApplyEditPlanCommand,
  AtomicEditPlanDependencies,
  AtomicEditPlanFailureForOuterCode,
  AtomicEditPlan,
  AtomicEditPlanBoundary,
  AtomicEditPlanKind,
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
  A0_U1_ATOMIC_EDIT_OUTER_REFUSAL_CODES,
  A0_U1_ATOMIC_EDIT_PREPLAN_OUTER_REFUSAL_CODES,
  A0_U1_ATOMIC_EDIT_REFUSAL_CODES,
  A0_U1_ATOMIC_EDIT_WORK_COUNTER_NAMES,
  A0_U1_INSERT_FRAGMENT_PLACEMENT_KINDS,
  A0_U1_FRAGMENT_PARSE_ACCIDENTAL_STYLE,
  A0_U1_NEW_EVENT_AUTO_VOICING,
  A0_U1_NEW_EVENT_POLICY_ID,
  A0_U1_PROPOSED_APPLICATION_COMMAND_KINDS,
  A0_U1_QUICK_ENTRY_TARGET_MATCH_POLICY,
  A0_U1_RECOVERED_CHORD_LAYOUT_LOSS_ACKNOWLEDGEMENT,
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
    Readonly<ApplicationCommandDependencies & AtomicEditPlanParserDependency>
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
type AtomicRunnerRequestCarriesLiveState = Assert<
  Equal<RunAtomicEditPlanRequest["state"], AppState>
>;
type AtomicRunnerRequestCarriesOnlyNewCommand = Assert<
  Equal<RunAtomicEditPlanRequest["command"], ApplyEditPlanCommand>
>;
type AtomicResultNarrowsToLiveResult = Assert<
  AtomicEditPlanTransitionResult extends ApplicationTransitionResult
    ? true
    : false
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
type BothHistoryOutersMapToHistoryRefusal = Assert<
  Equal<
    | AtomicEditPlanRefusalCodeForOuter<"history.entry_too_large">
    | AtomicEditPlanRefusalCodeForOuter<"history.byte_estimate_invalid">,
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
  true satisfies AtomicRunnerRequestCarriesLiveState,
  true satisfies AtomicRunnerRequestCarriesOnlyNewCommand,
  true satisfies AtomicResultNarrowsToLiveResult,
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
  true satisfies BothHistoryOutersMapToHistoryRefusal,
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
      "a0u1-ins-009-collision",
      "editPlanRefusal",
      "code",
    ],
    from: "edit-plan.id-collision",
    to: "edit-plan.duration-invalid",
    findingCode: "EDIT_PLAN_NESTED_OUTER_FAMILY",
    findingPathIncludes: "A0U1-INS-009-COLLISION",
  },
  {
    label: "transposition witness transition link",
    filename: "edit-plan-cases.json",
    path: ["transpositionWitnesses", 0, "baseTransitionId"],
    from: "A0U1-INS-001-APPLY",
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
          literalTransitions: 70,
          applicabilityRows: 5,
          transpositionWitnesses: 5,
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
    expect(A0_U1_INSERT_FRAGMENT_PLACEMENT_KINDS).toEqual([
      "into-measure",
      "into-section",
      "into-document",
    ]);
    expect(A0_U1_ATOMIC_EDIT_PLAN_RUNNER_STAGE_ORDER).toEqual([
      "a0-envelope",
      "exact-runtime-shape",
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
      "preflight-all-non-id-laws",
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
      "path-ecmascript-code-unit-lexical",
      "null-source-range-before-ranged",
      "source-range-start-ascending",
      "source-range-end-ascending",
      "code-ecmascript-code-unit-lexical",
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
    });
    expect(Object.isFrozen(A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS)).toBe(true);
    expect(
      Object.values(A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS).every(Object.isFrozen),
    ).toBe(true);
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
      exactBeatAdditions: 8_192,
      exactBeatComparisons: 8_192,
      metadataFieldsCompared: 12,
    });
    expect(A0_U1_QUICK_ENTRY_TARGET_MATCH_POLICY).toEqual({
      intoMeasureBeforeEvent: "before-event-id-equals-beforeEventId",
      intoMeasureAppend: "measure-end-id-equals-measureId",
      intoSectionBeforeMeasure: "before-measure-id-equals-beforeMeasureId",
      intoSectionAppend: "section-end-id-equals-sectionId",
      intoDocumentBeforeSection: "before-section-id-equals-beforeSectionId",
      intoDocumentAppend: "document-end",
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
        "preserve-measure-event-identities-map-internal-edge-to-measure-boundary",
    });
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
      factoryCallsOccurOnlyAfterAllNonIdPreflight: true,
      allocationOrder: "source-structural-preorder",
      collisionScope: "all-stable-id-kinds-plus-document",
      retryOnFailureOrCollision: false,
      partialCandidatePublication: false,
      partialRemapPublication: false,
      entropyConsumptionRollbackClaimed: false,
      reason:
        "StableIdFactory.next has no reservation or rollback operation; refused calls may consume entropy while application state remains unchanged.",
    });
  });
});
