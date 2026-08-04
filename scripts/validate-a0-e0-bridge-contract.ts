import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import * as ts from "typescript";

import {
  APPLICATION_COMMAND_KINDS,
  APPLICATION_DIALOG_KINDS,
  APPLICATION_PANEL_IDS,
  APPLICATION_REPLACEMENT_ORIGINS,
  APPLICATION_REQUEST_KINDS,
  APPLICATION_TRANSPORT_STATUSES,
  applicationHistoryRetainedByteEstimator,
  MAX_APPLICATION_REVISION,
  MAX_APPLICATION_SEQUENCE,
  MAX_COMMAND_ID_CODE_POINTS,
  MAX_COMMAND_LABEL_CODE_POINTS,
  MAX_DIALOG_STACK_DEPTH,
  MAX_DRAFT_ISSUES,
  MAX_FOCUS_SESSION_ID_CODE_POINTS,
  MAX_HISTORY_ENTRIES,
  MAX_HISTORY_RETAINED_BYTES,
  MAX_NOTICES,
  MAX_NOTICE_MESSAGE_CODE_POINTS,
  MAX_PENDING_REQUESTS,
  MAX_QUICK_ENTRY_CODE_POINTS,
  MAX_SELECTED_EVENT_IDS,
  runDocumentCommand,
  validateDocumentSemantics,
} from "../src/application";
import {
  copyDomain,
  createProductionStableIdFactory,
  decodeDocumentShape,
  MAX_NORMALIZED_BEAT_NUMERATOR,
} from "../src/domain";

import {
  E0_ACCEPTED_BYTE_DIGESTS,
  E0_ACCEPTED_SEMANTIC_DIGEST,
  validateE0Contract,
} from "./validate-e0-contract";

type JsonObject = Record<string, unknown>;

export type A0E0BridgeContractFinding = Readonly<{
  code: string;
  path: string;
  message: string;
}>;

export type A0E0BridgeContractValidationReport = Readonly<{
  schema: "changes.validation.a0-e0-bridge-contract.v2";
  package: "A0 interchange owner ports";
  outcome: "pass" | "fail";
  reviewState: "proposed-independent-spec";
  counts: Readonly<{
    files: number;
    replacementCases: number;
    identityCases: number;
    markerCases: number;
    applicabilityRows: number;
    mutationControls: number;
    traces: number;
    authorities: number;
  }>;
  acceptedE0V1PinnedUnmodified: boolean;
  semanticCompatibilityClaim: false;
  productionImplementationClaim: false;
  humanAcceptanceClaim: false;
  findings: readonly A0E0BridgeContractFinding[];
}>;

export type A0E0BridgeContractValidationOptions = Readonly<{
  /** Test-only seam proving the semantic lock survives refreshed byte pins. */
  expectedByteDigests?: Readonly<Record<string, string>>;
}>;

const REPOSITORY_ROOT = new URL("../", import.meta.url).pathname;
const DEFAULT_FIXTURE_ROOT = resolve(
  REPOSITORY_ROOT,
  "tests/fixtures/a0-e0-bridge",
);

export const A0_E0_BRIDGE_SPEC_FILES = Object.freeze([
  "a0-e0-bridge-contract.json",
  "mutation-controls.json",
  "owner-port-cases.json",
  "provenance-ledger.json",
  "trace-ledger.json",
] as const);

const EXPECTED_SCHEMAS: Readonly<Record<string, string>> = Object.freeze({
  "a0-e0-bridge-contract.json": "changes.fixtures.a0-e0-bridge-contract.v2",
  "mutation-controls.json":
    "changes.fixtures.a0-e0-bridge-mutation-controls.v2",
  "owner-port-cases.json": "changes.fixtures.a0-e0-bridge-owner-port-cases.v2",
  "provenance-ledger.json":
    "changes.fixtures.a0-e0-bridge-provenance-ledger.v2",
  "trace-ledger.json": "changes.fixtures.a0-e0-bridge-trace-ledger.v2",
});

const EXPECTED_REVIEW_STATES: Readonly<Record<string, string>> = Object.freeze({
  "a0-e0-bridge-contract.json": "proposed-independent-spec",
  "mutation-controls.json": "proposed-independent-literal-spec",
  "owner-port-cases.json": "proposed-independent-literal-spec",
  "provenance-ledger.json": "proposed-independent-spec",
  "trace-ledger.json": "proposed-independent-literal-spec",
});

export const A0_E0_BRIDGE_SPEC_BYTE_DIGESTS: Readonly<Record<string, string>> =
  Object.freeze({
    "a0-e0-bridge-contract.json":
      "67cbf2c05eb32876bd499a84f6f34c01c5390ccecb22efb7cba4efe55dabd9cb",
    "mutation-controls.json":
      "40a21b19b8a738ff6930f5a4667cad191b735b22851335a78d11920023a77cbc",
    "owner-port-cases.json":
      "3015b9b1a20273103ab63506261c23d398bb3d117dd97188838d753323c48a84",
    "provenance-ledger.json":
      "47ccded1e2c1a16ca97aa742927c6972ef2a10ec97c1d1ff67f37b1e90d34737",
    "trace-ledger.json":
      "846391f8ee5ddcc5d5c395f9ecb7d09ade3fb80d052735eef1f99134c1eea0b0",
  });

export const A0_E0_BRIDGE_SPEC_SEMANTIC_DIGEST =
  "e1e6df67e72bacb3fd9098ffd0652c32a0a02b2b8e81c616004ade9477fb36b8";

export const A0_E0_BRIDGE_ACCEPTED_E0_BYTE_MANIFEST_DIGEST =
  "a056af4cc18d502ff75a4890e4ce360b26365976e18962ce8da4d827b971ce48";

export const A0_E0_BRIDGE_OWNER_OPERATION_NAMES = Object.freeze([
  "prepareImportReplacementPublication",
  "discardImportReplacementPublication",
  "publishImportReplacement",
  "readCurrentApplicationDocumentIdentity",
  "publishCanonicalExportRevision",
] as const);

const EXPECTED_COUNTS = Object.freeze({
  files: 5,
  replacementCases: 28,
  identityCases: 4,
  markerCases: 10,
  applicabilityRows: 5,
  mutationControls: 32,
  traces: 5,
  authorities: 5,
});

const COVERAGE_FAMILIES = Object.freeze([
  "positive",
  "negative-near-miss",
  "stale-concurrent",
  "malformed-owner-input",
  "replay",
  "transposition-applicability",
  "mutation",
] as const);

const DISCARD_REASONS = Object.freeze([
  "preparation-protocol-invalid",
  "retirement-refused",
  "retirement-protocol-invalid",
  "publication-protocol-invalid",
] as const);

const ACCEPTED_E0_INPUT_LEDGER_PATH =
  "tests/fixtures/interchange/input-fixture-ledger.json";
const ACCEPTED_E0_INPUT_LEDGER_SHA256 =
  "693d3e39db3e82e5c24980d363566943360687bdf2dcd523185f56a028b0f714";

const ACCEPTED_E0_V1_ARTIFACT_PINS = Object.freeze([
  {
    role: "documentation",
    path: "docs/E0_INTERCHANGE_CONTRACT.md",
    sha256: "288c7ba1e36f8422c9753d501feb68efa721fa8b320b5e20bce8503da85e7d4f",
  },
  {
    role: "export-source",
    path: "src/export/interchange-contract.ts",
    sha256: "a8db592fb3b4f8c35385052753284f1a604b683d207b6aa7abd89fec04f2d035",
  },
  {
    role: "application-source",
    path: "src/application/e0-interchange-contract.ts",
    sha256: "32a51ef9eac0948a069fc3498348562f70e7703b430f9e1ad9c9961fe53cf10a",
  },
  {
    role: "validator",
    path: "scripts/validate-e0-contract.ts",
    sha256: "3cc96d2ece16e22f98689057dbf1d64b64929dfbb2f92fd85391a7dc1d6bee04",
  },
  {
    role: "static-test",
    path: "tests/static/e0-contract.test.ts",
    sha256: "9873a0342bdf4ce6ab3754572d2f62cef6dbecbcb2a41105b316635204719cf4",
  },
  {
    role: "test-support",
    path: "tests/support/e0-interchange-fixture.ts",
    sha256: "cda73a5421b2635d1feb845ad39e1681920eddbf9d09f51b0ed624b19e06d522",
  },
  {
    role: "acceptance-review",
    path: "docs/evidence/E0_GOLDEN_PACKET_REVIEW.md",
    sha256: "a11d79fe73811364d3d631f2a5b2d9d1fcce0f79fdc3ed64472d5980a2397693",
  },
] as const);

const ACCEPTED_E0_V1_CONFLICT_IDS = Object.freeze([
  "E0V1-CONFLICT-IMPORT-REQUEST-CURRENT-STATE",
  "E0V1-CONFLICT-PREVIEW-IMPACT-CONTEXT-STATE",
  "E0V1-CONFLICT-IMPORT-PREVIEW-PROJECTION",
  "E0V1-CONFLICT-PREVIEW-AUTHORITY-AND-CONSENT",
  "E0V1-CONFLICT-IMPORT-SUCCESS-PUBLICATION-STATE",
  "E0V1-CONFLICT-IMPORT-REFUSAL-STATE",
  "E0V1-CONFLICT-PUBLICATION-PROTOCOL-LAST-KNOWN-STATE",
  "E0V1-CONFLICT-RAW-MARKER-STATES",
  "E0V1-CONFLICT-WIDENED-PREPARATION-REFUSALS",
  "E0V1-CONFLICT-REPLACEMENT-PUBLICATION-REFUSALS",
  "E0V1-CONFLICT-PUBLIC-MARKER-REQUEST-STATE",
] as const);
const ACCEPTED_E0_V1_CONFLICT_INVENTORY_DIGEST =
  "b49f0760def8181aef1188150c5eff181adf3533abef813f12174c74a9411ae4";
const OWNER_PORT_RECORDS_DIGEST =
  "e060d06ed1700333e767673707a27ec9f333c6dda7a8224eb3c2af8bbf021181";
const REPRESENTATIVE_F3_PRETTY_SOURCE_SHA256 =
  "1b82c3fc3775ca87fd30f38a2a95d10226b0ff052b3095320f05e1e21f6b163f";

const OWNER_LAW_IDS = Object.freeze([
  "BRIDGE-OWNER-01-controller-current-state-only",
  "BRIDGE-OWNER-02-prepare-after-all-fallible-checks",
  "BRIDGE-OWNER-03-complete-identity-single-live-entry",
  "BRIDGE-OWNER-04-total-idempotent-request-cleanup",
  "BRIDGE-OWNER-05-publish-consumes-before-return",
  "BRIDGE-OWNER-06-replay-and-lookalike-refused",
  "BRIDGE-OWNER-07-synchronous-latest-identity",
  "BRIDGE-OWNER-08-document-and-revision-marker-cas",
  "BRIDGE-OWNER-09-marker-preserves-unrelated-current-state",
  "BRIDGE-OWNER-10-state-free-boundary-results",
  "BRIDGE-OWNER-11-no-wall-time-or-pitch-repair",
] as const);

const OWNER_IMPORT_TOPOLOGY = Object.freeze([
  {
    modulePath: "../domain",
    isTypeOnly: true,
    defaultImport: null,
    namedBindingKind: "named-imports",
    elements: ["DocumentId", "ValidatedDocument"].map((name) => ({
      importedName: name,
      localName: name,
      isTypeOnly: false,
    })),
    hasImportAttributes: false,
  },
  {
    modulePath: "./application-state-contract",
    isTypeOnly: false,
    defaultImport: null,
    namedBindingKind: "named-imports",
    elements: [
      "MAX_APPLICATION_SEQUENCE",
      "MAX_COMMAND_ID_CODE_POINTS",
      "MAX_COMMAND_LABEL_CODE_POINTS",
    ].map((name) => ({
      importedName: name,
      localName: name,
      isTypeOnly: false,
    })),
    hasImportAttributes: false,
  },
  {
    modulePath: "./application-state-contract",
    isTypeOnly: true,
    defaultImport: null,
    namedBindingKind: "named-imports",
    elements: [
      "AppRevision",
      "ApplicationEffect",
      "ApplicationReplacementOrigin",
      "ApplicationRequestId",
      "ApplicationWorkCounters",
      "CommandId",
      "DocumentTransitionState",
      "ReplacementRetirementReceipt",
      "TransportGeneration",
    ].map((name) => ({
      importedName: name,
      localName: name,
      isTypeOnly: false,
    })),
    hasImportAttributes: false,
  },
] as const);

const EXPECTED_OWNER_RESULT_COUNTER_KEYS = Object.freeze([
  "prepareImportReplacementPublication",
  "discardImportReplacementPublication",
  "publishImportReplacement",
  "readCurrentApplicationDocumentIdentity",
  "publishCanonicalExportRevision",
  "e0V2ConsumerNormalizer",
  "f2DecodeDocumentShape",
  "f3ValidateDocumentSemantics",
  "historyEstimator",
  "bookmarkRepair",
  "controllerStateReads",
  "controllerStateInstalls",
  "listenerCallbacks",
  "registryLookups",
  "registryAllocations",
  "registryInvalidations",
  "registryConsumptions",
] as const);

const EXPECTED_OWNER_LAW_FLAG_KEYS = Object.freeze([
  "historicalStateReinstall",
] as const);

const DEFAULT_OWNER_LAW_FLAGS: JsonObject = Object.freeze(
  Object.fromEntries(EXPECTED_OWNER_LAW_FLAG_KEYS.map((key) => [key, false])),
);

const MARKER_PRESERVED_FIELDS = Object.freeze([
  "document",
  "revision",
  "recovery",
  "history",
  "bookmarks",
  "panels",
  "dialogs",
  "quickEntry",
  "importDraft",
  "transport",
  "pendingRequests",
  "documentTransition",
  "focusRequest",
  "notices",
  "nextSequence",
] as const);

const REPLACEMENT_PUBLICATION_FIELD_POLICY = Object.freeze({
  preserveLatestByValue: ["exportRevision"],
  preserveLatestByReference: ["recovery", "panels", "dialogs", "transport"],
  replacementOwned: [
    "document",
    "revision",
    "history",
    "bookmarks",
    "quickEntry",
    "importDraft",
    "pendingRequests",
    "documentTransition",
    "notices",
  ],
  allocateFromLatestSequence: ["focusRequest", "nextSequence"],
} as const);

const PRIVATE_IMPORT_REPLACEMENT_MATERIAL_KEYS = Object.freeze([
  "bookmarksAndFocus",
  "candidate",
  "command",
  "disclosedImpact",
  "expectedRetirement",
  "history",
  "pendingRequestsBefore",
  "publication",
  "validation",
] as const);

function expectedPrivateCandidatePreservationPolicy(
  literalId: unknown,
): string {
  return literalId === "representative-f3-valid"
    ? "validated-bytes-and-source-spelling-preserved-without-repair"
    : "validated-bytes-and-manual-frozen-spellings-preserved-without-repair";
}

const EXPECTED_A0_CONFORMANCE_RUN_IDS = Object.freeze([
  "BRIDGE-REP-001/retained",
  "BRIDGE-REP-002/unavailable",
  "BRIDGE-REP-003/source-c",
  "BRIDGE-REP-003/target-d",
  "BRIDGE-REP-004/exact-refusal",
  "BRIDGE-REP-005/exact-refusal",
  "BRIDGE-REP-006/exact-refusal",
  "BRIDGE-REP-007/chart-text-canonical",
  "BRIDGE-REP-007/legacy-json-legacy",
  "BRIDGE-REP-008/exact-refusal",
  "BRIDGE-REP-008/nested-identity-extra-key",
  "BRIDGE-REP-009/exact-refusal",
  "BRIDGE-REP-010/exact-refusal",
  "BRIDGE-REP-011/exact-refusal",
  "BRIDGE-REP-012/exact-refusal",
  "BRIDGE-REP-013/exact-refusal",
  "BRIDGE-REP-014/label-160-boundary",
  "BRIDGE-REP-014/label-161-killer",
  "BRIDGE-REP-015/logical-time-latest-boundary",
  "BRIDGE-REP-015/logical-time-nan-killer",
  "BRIDGE-REP-015/logical-time-before-latest-history",
  "BRIDGE-REP-016/exact-refusal",
  "BRIDGE-REP-017/exact-refusal",
  "BRIDGE-REP-018/exact-refusal",
  "BRIDGE-REP-019/semantic-valid-cmaj7",
  "BRIDGE-REP-019/semantic-cfoo-killer",
  "BRIDGE-REP-020/exact-refusal",
  "BRIDGE-REP-020/impact-unavailable",
  "BRIDGE-REP-021/exact-refusal",
  "BRIDGE-REP-022/exact-refusal",
  "BRIDGE-REP-023/exact-refusal",
  "BRIDGE-REP-023/confirmation-stale",
  "BRIDGE-REP-023/confirmation-wrong-document",
  "BRIDGE-REP-023/confirmation-impact-mismatch",
  "BRIDGE-REP-023/confirmation-id-129-code-points",
  "BRIDGE-REP-023/confirmation-id-whitespace-only",
  "BRIDGE-REP-023/confirmation-id-lone-surrogate",
  "BRIDGE-REP-023/confirmation-extra-key",
  "BRIDGE-REP-023/confirmation-requirement-extra-key",
  "BRIDGE-REP-023/confirmation-requirement-identity-extra-key",
  "BRIDGE-REP-023/confirmation-requirement-disclosed-impact-extra-key",
  "BRIDGE-REP-024/capacity-one-busy",
  "BRIDGE-REP-027/preparation-protocol-invalid-first",
  "BRIDGE-REP-027/preparation-protocol-invalid-repeat",
  "BRIDGE-REP-027/retirement-refused-first",
  "BRIDGE-REP-027/retirement-refused-repeat",
  "BRIDGE-REP-027/retirement-protocol-invalid-first",
  "BRIDGE-REP-027/retirement-protocol-invalid-repeat",
  "BRIDGE-REP-027/publication-protocol-invalid-first",
  "BRIDGE-REP-027/publication-protocol-invalid-repeat",
  "BRIDGE-REP-028/wrong-request-isolation",
  "BRIDGE-REP-028/manual-source-c",
  "BRIDGE-REP-028/manual-target-d",
  "BRIDGE-REP-029/retained",
  "BRIDGE-REP-029/same-revision-ephemeral-edit",
  "BRIDGE-REP-029/manual-source-c",
  "BRIDGE-REP-029/manual-target-d",
  "BRIDGE-REP-029/explicitly-unavailable",
  "BRIDGE-REP-029/explicitly-unavailable-sequence-saturation-boundary",
  "BRIDGE-REP-030/consumed-replay",
  "BRIDGE-REP-030/invalidated-replay",
  "BRIDGE-REP-030/structural-lookalike",
  "BRIDGE-REP-030/stale-live-entry",
  "BRIDGE-REP-030/retirement-mismatch",
  "BRIDGE-REP-030/transport-advanced-after-prepare",
  "BRIDGE-REP-030/bookmarks-changed-after-prepare",
  "BRIDGE-REP-030/sequence-exhausted-after-prepare",
  "BRIDGE-REP-030/same-revision-pending-request-drift",
  "BRIDGE-REP-030/same-revision-transition-drift",
  "BRIDGE-REP-030/same-revision-unrelated-request-added",
  "BRIDGE-ID-001/baseline",
  "BRIDGE-ID-002/identity-2",
  "BRIDGE-ID-003/identity-3",
  "BRIDGE-ID-004/source-c",
  "BRIDGE-ID-004/target-d",
  "BRIDGE-MARK-001/exact",
  "BRIDGE-MARK-002/marker-2",
  "BRIDGE-MARK-003/marker-3",
  "BRIDGE-MARK-004/marker-4",
  "BRIDGE-MARK-005/marker-5",
  "BRIDGE-MARK-008/marker-8",
  "BRIDGE-MARK-009/marker-9",
  "BRIDGE-MARK-010/marker-10",
  "BRIDGE-MARK-011/marker-11",
  "BRIDGE-MARK-012/source-c",
  "BRIDGE-MARK-012/target-d",
] as const);

const PREPARE_SUCCESS_RUN_IDS = new Set([
  "BRIDGE-REP-001/retained",
  "BRIDGE-REP-002/unavailable",
  "BRIDGE-REP-003/source-c",
  "BRIDGE-REP-003/target-d",
  "BRIDGE-REP-007/chart-text-canonical",
  "BRIDGE-REP-007/legacy-json-legacy",
  "BRIDGE-REP-014/label-160-boundary",
  "BRIDGE-REP-015/logical-time-latest-boundary",
  "BRIDGE-REP-019/semantic-valid-cmaj7",
]);

const PREPARE_REFUSAL_BY_CONFORMANCE_RUN_ID = Object.freeze({
  "BRIDGE-REP-004/exact-refusal": "import.replacement_request_stale",
  "BRIDGE-REP-005/exact-refusal": "import.replacement_wrong_document",
  "BRIDGE-REP-006/exact-refusal": "import.replacement_request_stale",
  "BRIDGE-REP-008/exact-refusal": "import.replacement_request_invalid",
  "BRIDGE-REP-008/nested-identity-extra-key":
    "import.replacement_request_invalid",
  "BRIDGE-REP-009/exact-refusal": "import.replacement_transition_mismatch",
  "BRIDGE-REP-010/exact-refusal": "import.replacement_transition_mismatch",
  "BRIDGE-REP-011/exact-refusal": "import.replacement_transition_mismatch",
  "BRIDGE-REP-012/exact-refusal": "import.replacement_impact_mismatch",
  "BRIDGE-REP-013/exact-refusal": "import.replacement_command_id_invalid",
  "BRIDGE-REP-014/label-161-killer": "import.replacement_command_label_invalid",
  "BRIDGE-REP-015/logical-time-nan-killer":
    "import.replacement_logical_time_invalid",
  "BRIDGE-REP-015/logical-time-before-latest-history":
    "import.replacement_logical_time_invalid",
  "BRIDGE-REP-016/exact-refusal": "application.revision_exhausted",
  "BRIDGE-REP-017/exact-refusal": "application.sequence_exhausted",
  "BRIDGE-REP-018/exact-refusal": "import.candidate_structural_invalid",
  "BRIDGE-REP-019/semantic-cfoo-killer": "import.candidate_semantic_invalid",
  "BRIDGE-REP-020/exact-refusal": "import.replacement_history_estimate_failed",
  "BRIDGE-REP-020/impact-unavailable": "import.replacement_impact_unavailable",
  "BRIDGE-REP-021/exact-refusal": "import.replacement_impact_mismatch",
  "BRIDGE-REP-022/exact-refusal": "history.nonundoable_confirmation_required",
  "BRIDGE-REP-023/exact-refusal": "import.confirmation_identity_mismatch",
  "BRIDGE-REP-023/confirmation-stale": "import.confirmation_stale",
  "BRIDGE-REP-023/confirmation-wrong-document":
    "import.confirmation_wrong_document",
  "BRIDGE-REP-023/confirmation-impact-mismatch":
    "import.confirmation_impact_mismatch",
  "BRIDGE-REP-023/confirmation-id-129-code-points":
    "import.confirmation_identity_mismatch",
  "BRIDGE-REP-023/confirmation-id-whitespace-only":
    "import.confirmation_identity_mismatch",
  "BRIDGE-REP-023/confirmation-id-lone-surrogate":
    "import.confirmation_identity_mismatch",
  "BRIDGE-REP-023/confirmation-extra-key":
    "import.confirmation_identity_mismatch",
  "BRIDGE-REP-023/confirmation-requirement-extra-key":
    "import.confirmation_identity_mismatch",
  "BRIDGE-REP-023/confirmation-requirement-identity-extra-key":
    "import.confirmation_identity_mismatch",
  "BRIDGE-REP-023/confirmation-requirement-disclosed-impact-extra-key":
    "import.confirmation_identity_mismatch",
  "BRIDGE-REP-024/capacity-one-busy": "import.replacement_preparation_busy",
} as const);

const E0_V2_OWNED_CASE_IDS = new Set<string>();

const PREPARE_SUCCESS_EVENTS = Object.freeze([
  "call.prepare",
  "read.controller-state",
  "validate.request-envelope",
  "compare.complete-identity",
  "compare.transition-binding",
  "validate.command-metadata",
  "check.revision-and-sequence-capacity",
  "call.f2",
  "call.f3",
  "repair.bookmarks-and-focus",
  "estimate.history",
  "recompute.impact",
  "compare.confirmation",
  "inspect.registry-capacity-one",
  "allocate.registry-entry",
  "return.prepared",
] as const);

const PREPARE_BUSY_EVENTS = Object.freeze([
  ...PREPARE_SUCCESS_EVENTS.slice(0, -2),
  "observe.registry-busy",
  "return.refused",
] as const);

function completeOwnerCounters(
  operation: string,
  overrides: Readonly<Record<string, number>> = {},
): JsonObject {
  const counters: JsonObject = Object.fromEntries(
    EXPECTED_OWNER_RESULT_COUNTER_KEYS.map((key) => [key, 0]),
  );
  counters[operation] = 1;
  for (const [key, value] of Object.entries(overrides)) counters[key] = value;
  return counters;
}

function fixedOwnerWorkBound(
  operation: string,
  retainedRegistryEntriesAtReturn: number,
): JsonObject {
  const common = {
    wallTimeObservedOrUsed: false,
    maximumControllerStateReads: 1,
    maximumF2DocumentTraversals: 0,
    maximumF3DocumentTraversals: 0,
    maximumHistoryEntriesVisited: 0,
    maximumHistoryRetainedBytes: 0,
    awaitOrMicrotaskBoundariesInsideOperation: 0,
    retainedRegistryEntriesAtReturn,
  };
  if (operation === "readCurrentApplicationDocumentIdentity") {
    return {
      termination: "constant-controller-field-read",
      ...common,
      maximumControllerStateInstalls: 0,
      maximumListenerCallbacks: 0,
      maximumRegistryEntriesInspected: 0,
      maximumLiveRegistryEntries: 0,
    };
  }
  if (operation === "publishCanonicalExportRevision") {
    return {
      termination:
        "single-synchronous-validate-read-compare-write-install-notify",
      ...common,
      maximumControllerStateInstalls: 1,
      maximumListenerCallbacks: 1,
      maximumRegistryEntriesInspected: 0,
      maximumLiveRegistryEntries: 0,
    };
  }
  return {
    termination: "fixed-state-count-and-capacity-bound",
    ...common,
    maximumControllerStateInstalls:
      operation === "publishImportReplacement" ? 1 : 0,
    maximumListenerCallbacks: operation === "publishImportReplacement" ? 1 : 0,
    maximumRegistryEntriesInspected: 1,
    maximumLiveRegistryEntries: 1,
    maximumF2DocumentTraversals:
      operation === "prepareImportReplacementPublication" ? 1 : 0,
    maximumF3DocumentTraversals:
      operation === "prepareImportReplacementPublication" ? 1 : 0,
    maximumHistoryEntriesVisited:
      operation === "prepareImportReplacementPublication" ||
      operation === "publishImportReplacement"
        ? 200
        : 0,
    maximumHistoryRetainedBytes:
      operation === "prepareImportReplacementPublication" ||
      operation === "publishImportReplacement"
        ? 16_777_216
        : 0,
  };
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function codeUnitCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function stableJson(value: unknown): string {
  if (typeof value === "number" && !Number.isFinite(value)) {
    return `{"$specialNumber":${JSON.stringify(
      Number.isNaN(value) ? "NaN" : value > 0 ? "Infinity" : "-Infinity",
    )}}`;
  }
  if (value === undefined) return '{"$undefined":true}';
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (isObject(value)) {
    return `{${Object.keys(value)
      .sort(codeUnitCompare)
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function isBoundedUnicodeScalarToken(
  value: unknown,
  maximumCodePoints: number,
): value is string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    Array.from(value).length > maximumCodePoints
  ) {
    return false;
  }
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

function jsonDeepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => jsonDeepEqual(item, right[index]))
    );
  }
  if (!isObject(left) || !isObject(right)) return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key) =>
        Object.hasOwn(right, key) && jsonDeepEqual(left[key], right[key]),
    )
  );
}

function privatePendingRequestsSnapshotMatches(
  privateMaterial: JsonObject,
  state: JsonObject,
): boolean {
  return (
    Array.isArray(privateMaterial["pendingRequestsBefore"]) &&
    Array.isArray(state["pendingRequests"]) &&
    jsonDeepEqual(
      privateMaterial["pendingRequestsBefore"],
      state["pendingRequests"],
    )
  );
}

function recordsAt(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.filter(isObject) : [];
}

function stringsAt(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function addFinding(
  findings: A0E0BridgeContractFinding[],
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
  findings: A0E0BridgeContractFinding[],
): void {
  if (stableJson(actual) !== stableJson(expected)) {
    addFinding(findings, code, path, message);
  }
}

/**
 * Small strict JSON lexical pass used only to reject duplicate object keys.
 * JSON.parse remains the semantic parser after this independent check.
 */
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

function indexById(
  records: readonly JsonObject[],
  path: string,
  findings: A0E0BridgeContractFinding[],
): Map<string, JsonObject> {
  const result = new Map<string, JsonObject>();
  for (const [index, record] of records.entries()) {
    const id = record["id"];
    if (typeof id !== "string" || id.length === 0) {
      addFinding(
        findings,
        "BRIDGE_ID_MISSING",
        `${path}[${String(index)}].id`,
        "Every ledger row needs a stable nonempty ID.",
      );
      continue;
    }
    if (result.has(id)) {
      addFinding(
        findings,
        "BRIDGE_ID_DUPLICATE",
        `${path}.${id}`,
        "Ledger IDs must be unique.",
      );
    }
    result.set(id, record);
  }
  return result;
}

function decodeJsonPointer(pointer: string): string[] | null {
  if (pointer === "") return [];
  if (!pointer.startsWith("/")) return null;
  return pointer
    .slice(1)
    .split("/")
    .map((token) => token.replaceAll("~1", "/").replaceAll("~0", "~"));
}

function valueAtJsonPointer(value: unknown, pointer: string): unknown {
  const tokens = decodeJsonPointer(pointer);
  if (tokens === null) return undefined;
  return tokens.reduce<unknown>((current, token) => {
    if (Array.isArray(current)) {
      if (!/^(?:0|[1-9][0-9]*)$/u.test(token)) return undefined;
      return current[Number(token)];
    }
    return isObject(current) ? current[token] : undefined;
  }, value);
}

function pointerForPath(path: readonly (string | number)[]): string {
  return path.length === 0
    ? ""
    : `/${path
        .map((segment) =>
          String(segment).replaceAll("~", "~0").replaceAll("/", "~1"),
        )
        .join("/")}`;
}

function jsonDiffPointers(
  left: unknown,
  right: unknown,
  path: readonly (string | number)[] = [],
): string[] {
  if (Object.is(left, right)) return [];
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return [pointerForPath(path)];
    return left.flatMap((item, index) =>
      jsonDiffPointers(item, right[index], [...path, index]),
    );
  }
  if (!isObject(left) || !isObject(right)) return [pointerForPath(path)];
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort(
    codeUnitCompare,
  );
  return keys.flatMap((key) => {
    if (!Object.hasOwn(left, key) || !Object.hasOwn(right, key)) {
      return [pointerForPath([...path, key])];
    }
    return jsonDiffPointers(left[key], right[key], [...path, key]);
  });
}

function shallowCloneContainer(value: unknown): unknown[] | JsonObject {
  if (isUnknownArray(value)) return [...value];
  if (isObject(value)) return { ...value };
  throw new Error("BRIDGE_PATCH_PARENT");
}

function childAtContainer(container: unknown, token: string): unknown {
  if (Array.isArray(container)) {
    if (!/^(?:0|[1-9][0-9]*)$/u.test(token)) {
      throw new Error("BRIDGE_PATCH_ARRAY_INDEX");
    }
    return container[Number(token)];
  }
  if (isObject(container)) return container[token];
  throw new Error("BRIDGE_PATCH_PARENT");
}

function setContainerChild(
  container: unknown,
  token: string,
  value: unknown,
): void {
  if (Array.isArray(container)) {
    const index = Number(token);
    if (
      !Number.isSafeInteger(index) ||
      index < 0 ||
      index >= container.length
    ) {
      throw new Error("BRIDGE_PATCH_REPLACE_INDEX");
    }
    container[index] = value;
    return;
  }
  if (!isObject(container) || !Object.hasOwn(container, token)) {
    throw new Error("BRIDGE_PATCH_REPLACE_TARGET");
  }
  container[token] = value;
}

function applyPointerMutation(
  root: unknown,
  operator: string,
  pointer: string,
  expectedBefore: unknown,
  value: unknown,
): unknown {
  const tokens = decodeJsonPointer(pointer);
  if (tokens === null || tokens.length === 0) {
    throw new Error("BRIDGE_PATCH_POINTER");
  }
  const rootCopy = shallowCloneContainer(root);
  let sourceParent: unknown = root;
  let targetParent: unknown = rootCopy;
  for (const token of tokens.slice(0, -1)) {
    const sourceChild = childAtContainer(sourceParent, token);
    const targetChild = shallowCloneContainer(sourceChild);
    setContainerChild(targetParent, token, targetChild);
    sourceParent = sourceChild;
    targetParent = targetChild;
  }
  const token = tokens.at(-1) as string;
  const current = childAtContainer(sourceParent, token);
  if (operator === "add") {
    if (
      current !== undefined ||
      !isObject(expectedBefore) ||
      expectedBefore["$absent"] !== true ||
      !isObject(targetParent) ||
      Object.hasOwn(targetParent, token)
    ) {
      throw new Error(`BRIDGE_PATCH_ADD_TARGET:${pointer}`);
    }
    targetParent[token] = value;
    return rootCopy;
  }
  if (operator === "assert") {
    if (!jsonDeepEqual(current, expectedBefore)) {
      throw new Error("BRIDGE_PATCH_ASSERT");
    }
    return root;
  }
  if (!jsonDeepEqual(current, expectedBefore)) {
    throw new Error(`BRIDGE_PATCH_FROM:${pointer}`);
  }
  if (operator === "replace") {
    setContainerChild(targetParent, token, value);
    return rootCopy;
  }
  if (operator === "append") {
    if (!isUnknownArray(current)) throw new Error("BRIDGE_PATCH_APPEND_TARGET");
    setContainerChild(targetParent, token, [...current, value]);
    return rootCopy;
  }
  if (operator === "remove") {
    if (Array.isArray(targetParent)) {
      const index = Number(token);
      if (
        !Number.isSafeInteger(index) ||
        index < 0 ||
        index >= targetParent.length
      ) {
        throw new Error("BRIDGE_PATCH_REMOVE_INDEX");
      }
      targetParent.splice(index, 1);
    } else if (isObject(targetParent) && Object.hasOwn(targetParent, token)) {
      Reflect.deleteProperty(targetParent, token);
    } else {
      throw new Error("BRIDGE_PATCH_REMOVE_TARGET");
    }
    return rootCopy;
  }
  throw new Error("BRIDGE_PATCH_OPERATOR");
}

function containsForbiddenStateKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsForbiddenStateKey);
  if (!isObject(value)) return false;
  if (hasAppStateTopLevelShape(value)) return true;
  if (
    ["currentState", "lastKnownState", "observedBefore", "state"].some((key) =>
      Object.hasOwn(value, key),
    )
  ) {
    return true;
  }
  return Object.values(value).some(containsForbiddenStateKey);
}

const APP_STATE_KEYS = Object.freeze([
  "document",
  "revision",
  "exportRevision",
  "recovery",
  "history",
  "bookmarks",
  "panels",
  "dialogs",
  "quickEntry",
  "importDraft",
  "transport",
  "pendingRequests",
  "documentTransition",
  "focusRequest",
  "notices",
  "nextSequence",
] as const);

const APP_STATE_COMMAND_KIND_SET = new Set<string>(APPLICATION_COMMAND_KINDS);
const APP_STATE_REPLACEMENT_ORIGIN_SET = new Set<string>(
  APPLICATION_REPLACEMENT_ORIGINS,
);
const APP_STATE_REQUEST_KIND_SET = new Set<string>(APPLICATION_REQUEST_KINDS);
const APP_STATE_TRANSPORT_STATUS_SET = new Set<string>(
  APPLICATION_TRANSPORT_STATUSES,
);
const APP_STATE_PANEL_ID_SET = new Set<string>(APPLICATION_PANEL_IDS);
const APP_STATE_DIALOG_KIND_SET = new Set<string>(APPLICATION_DIALOG_KINDS);

function hasExactObjectKeys(
  value: unknown,
  keys: readonly string[],
): value is JsonObject {
  if (!isObject(value)) return false;
  const actual = Object.keys(value);
  return (
    actual.length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

function isNonNegativeSafeInteger(
  value: unknown,
  maximum = Number.MAX_SAFE_INTEGER,
): value is number {
  return (
    Number.isSafeInteger(value) &&
    Number(value) >= 0 &&
    Number(value) <= maximum
  );
}

function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function isUnicodeScalarString(
  value: unknown,
  maximumCodePoints: number,
  allowEmpty: boolean,
): value is string {
  if (
    typeof value !== "string" ||
    (!allowEmpty && value.length === 0) ||
    Array.from(value).length > maximumCodePoints
  ) {
    return false;
  }
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

function isStateIdentifier(value: unknown): value is string {
  return typeof value === "string";
}

function isStringArray(
  value: unknown,
  maximumLength: number,
): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= maximumLength &&
    value.every((item) => typeof item === "string")
  );
}

function isCanonicalBeatPosition(value: unknown): boolean {
  if (
    !hasExactObjectKeys(value, ["numerator", "denominator"]) ||
    !isNonNegativeSafeInteger(
      value["numerator"],
      MAX_NORMALIZED_BEAT_NUMERATOR,
    ) ||
    !Number.isSafeInteger(value["denominator"]) ||
    Number(value["denominator"]) <= 0 ||
    960 % Number(value["denominator"]) !== 0
  ) {
    return false;
  }
  let left = value["numerator"];
  let right = Number(value["denominator"]);
  while (right !== 0) {
    const remainder = left % right;
    left = right;
    right = remainder;
  }
  return left === 1;
}

type DocumentBookmarkIndex = Readonly<{
  sectionIds: ReadonlySet<string>;
  measureIds: ReadonlySet<string>;
  eventOrder: ReadonlyMap<string, number>;
}>;

function documentBookmarkIndex(
  document: unknown,
): DocumentBookmarkIndex | null {
  if (!isCompleteDocumentLiteral(document)) return null;
  const rawSections = document["sections"];
  const sections = recordsAt(rawSections);
  if (!Array.isArray(rawSections) || sections.length !== rawSections.length) {
    return null;
  }
  const sectionIds = new Set<string>();
  const measureIds = new Set<string>();
  const eventOrder = new Map<string, number>();
  for (const section of sections) {
    if (typeof section["id"] !== "string" || sectionIds.has(section["id"])) {
      return null;
    }
    sectionIds.add(section["id"]);
    const rawMeasures = section["measures"];
    const measures = recordsAt(rawMeasures);
    if (!Array.isArray(rawMeasures) || measures.length !== rawMeasures.length) {
      return null;
    }
    for (const measure of measures) {
      if (typeof measure["id"] !== "string" || measureIds.has(measure["id"])) {
        return null;
      }
      measureIds.add(measure["id"]);
      const rawEvents = measure["events"];
      const events = recordsAt(rawEvents);
      if (!Array.isArray(rawEvents) || events.length !== rawEvents.length) {
        return null;
      }
      for (const event of events) {
        if (typeof event["id"] !== "string" || eventOrder.has(event["id"])) {
          return null;
        }
        eventOrder.set(event["id"], eventOrder.size);
      }
    }
  }
  return { sectionIds, measureIds, eventOrder };
}

function isStableBoundary(
  value: unknown,
  index: DocumentBookmarkIndex,
): boolean {
  if (!isObject(value) || typeof value["kind"] !== "string") return false;
  if (value["kind"] === "document-start" || value["kind"] === "document-end") {
    return hasExactObjectKeys(value, ["kind"]);
  }
  if (
    [
      "before-section",
      "after-section",
      "section-start",
      "section-end",
    ].includes(value["kind"])
  ) {
    return (
      hasExactObjectKeys(value, ["kind", "sectionId"]) &&
      typeof value["sectionId"] === "string" &&
      index.sectionIds.has(value["sectionId"])
    );
  }
  if (
    [
      "before-measure",
      "after-measure",
      "measure-start",
      "measure-end",
    ].includes(value["kind"])
  ) {
    return (
      hasExactObjectKeys(value, ["kind", "measureId"]) &&
      typeof value["measureId"] === "string" &&
      index.measureIds.has(value["measureId"])
    );
  }
  if (value["kind"] === "before-event" || value["kind"] === "after-event") {
    return (
      hasExactObjectKeys(value, ["kind", "eventId"]) &&
      typeof value["eventId"] === "string" &&
      index.eventOrder.has(value["eventId"])
    );
  }
  return false;
}

function isStableUiBookmarks(value: unknown, document: unknown): boolean {
  if (!hasExactObjectKeys(value, ["selection", "insertion", "range"])) {
    return false;
  }
  const index = documentBookmarkIndex(document);
  if (index === null) return false;
  const selection = value["selection"];
  const validSelection =
    (hasExactObjectKeys(selection, ["kind"]) && selection["kind"] === "none") ||
    (hasExactObjectKeys(selection, [
      "kind",
      "eventIds",
      "anchorEventId",
      "focusEventId",
    ]) &&
      selection["kind"] === "events" &&
      Array.isArray(selection["eventIds"]) &&
      selection["eventIds"].length > 0 &&
      selection["eventIds"].length <= MAX_SELECTED_EVENT_IDS &&
      selection["eventIds"].every(
        (eventId) =>
          typeof eventId === "string" && index.eventOrder.has(eventId),
      ) &&
      new Set(selection["eventIds"]).size === selection["eventIds"].length &&
      selection["eventIds"].every((eventId, eventIndex, eventIds) => {
        if (eventIndex === 0) return true;
        return (
          Number(index.eventOrder.get(eventIds[eventIndex - 1] as string)) <
          Number(index.eventOrder.get(eventId as string))
        );
      }) &&
      typeof selection["anchorEventId"] === "string" &&
      typeof selection["focusEventId"] === "string" &&
      selection["eventIds"].includes(selection["anchorEventId"]) &&
      selection["eventIds"].includes(selection["focusEventId"]));
  const range = value["range"];
  return (
    validSelection &&
    (value["insertion"] === null ||
      isStableBoundary(value["insertion"], index)) &&
    (range === null ||
      (hasExactObjectKeys(range, ["anchor", "focus"]) &&
        isStableBoundary(range["anchor"], index) &&
        isStableBoundary(range["focus"], index)))
  );
}

function isRecoveryStatus(value: unknown): boolean {
  if (!isObject(value)) return false;
  switch (value["kind"]) {
    case "unavailable":
      return (
        hasExactObjectKeys(value, ["kind", "reasonCode"]) &&
        (value["reasonCode"] === null || isStateIdentifier(value["reasonCode"]))
      );
    case "clean":
      return (
        hasExactObjectKeys(value, ["kind", "persistedRevision"]) &&
        isNonNegativeSafeInteger(
          value["persistedRevision"],
          MAX_APPLICATION_REVISION,
        )
      );
    case "pending":
      return (
        hasExactObjectKeys(value, ["kind", "targetRevision", "requestId"]) &&
        isNonNegativeSafeInteger(
          value["targetRevision"],
          MAX_APPLICATION_REVISION,
        ) &&
        isPositiveSafeInteger(value["requestId"])
      );
    case "failed":
      return (
        hasExactObjectKeys(value, [
          "kind",
          "attemptedRevision",
          "requestId",
          "reasonCode",
        ]) &&
        isNonNegativeSafeInteger(
          value["attemptedRevision"],
          MAX_APPLICATION_REVISION,
        ) &&
        isPositiveSafeInteger(value["requestId"]) &&
        isStateIdentifier(value["reasonCode"])
      );
    default:
      return false;
  }
}

function isHistoryEntry(value: unknown): value is JsonObject {
  if (
    !hasExactObjectKeys(value, [
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
    ]) ||
    !isBoundedUnicodeScalarToken(
      value["commandId"],
      MAX_COMMAND_ID_CODE_POINTS,
    ) ||
    !APP_STATE_COMMAND_KIND_SET.has(String(value["commandKind"])) ||
    !isBoundedUnicodeScalarToken(
      value["label"],
      MAX_COMMAND_LABEL_CODE_POINTS,
    ) ||
    !isCompleteDocumentLiteral(value["before"]) ||
    !isCompleteDocumentLiteral(value["after"]) ||
    !isStableUiBookmarks(value["beforeBookmarks"], value["before"]) ||
    !isStableUiBookmarks(value["afterBookmarks"], value["after"]) ||
    !isNonNegativeSafeInteger(
      value["retainedBytesEstimate"],
      MAX_HISTORY_RETAINED_BYTES,
    ) ||
    !isNonNegativeSafeInteger(value["firstLogicalTimeMs"]) ||
    !isNonNegativeSafeInteger(value["lastLogicalTimeMs"]) ||
    value["firstLogicalTimeMs"] > value["lastLogicalTimeMs"]
  ) {
    return false;
  }
  const coalescing = value["coalescing"];
  if (value["commandKind"] !== "set-text") return coalescing === null;
  return (
    hasExactObjectKeys(coalescing, ["kind", "key", "focusSessionId"]) &&
    coalescing["kind"] === "text-field" &&
    typeof coalescing["key"] === "string" &&
    isBoundedUnicodeScalarToken(
      coalescing["focusSessionId"],
      MAX_FOCUS_SESSION_ID_CODE_POINTS,
    )
  );
}

function isHistoryState(value: unknown): boolean {
  if (
    !hasExactObjectKeys(value, ["undo", "redo", "retainedBytesEstimate"]) ||
    !isUnknownArray(value["undo"]) ||
    !isUnknownArray(value["redo"]) ||
    value["undo"].length + value["redo"].length > MAX_HISTORY_ENTRIES ||
    !value["undo"].every(isHistoryEntry) ||
    !value["redo"].every(isHistoryEntry) ||
    !isNonNegativeSafeInteger(
      value["retainedBytesEstimate"],
      MAX_HISTORY_RETAINED_BYTES,
    )
  ) {
    return false;
  }
  const total = [...value["undo"], ...value["redo"]].reduce(
    (sum, entry) => sum + Number(entry["retainedBytesEstimate"]),
    0,
  );
  return total === value["retainedBytesEstimate"];
}

function isPanelState(value: unknown): boolean {
  return (
    hasExactObjectKeys(value, [
      "open",
      "active",
      "leftRailCollapsed",
      "rightRailCollapsed",
    ]) &&
    Array.isArray(value["open"]) &&
    value["open"].length > 0 &&
    value["open"].every((panel) => APP_STATE_PANEL_ID_SET.has(String(panel))) &&
    new Set(value["open"]).size === value["open"].length &&
    APP_STATE_PANEL_ID_SET.has(String(value["active"])) &&
    value["open"].includes(value["active"]) &&
    typeof value["leftRailCollapsed"] === "boolean" &&
    typeof value["rightRailCollapsed"] === "boolean"
  );
}

function isDialogStack(value: unknown): boolean {
  return (
    isUnknownArray(value) &&
    value.length <= MAX_DIALOG_STACK_DEPTH &&
    new Set(
      value.map((dialog) => (isObject(dialog) ? dialog["id"] : undefined)),
    ).size === value.length &&
    value.every(
      (dialog) =>
        hasExactObjectKeys(dialog, [
          "id",
          "kind",
          "phase",
          "blocksHistory",
          "requestId",
        ]) &&
        isBoundedUnicodeScalarToken(dialog["id"], MAX_COMMAND_ID_CODE_POINTS) &&
        APP_STATE_DIALOG_KIND_SET.has(String(dialog["kind"])) &&
        ["open", "committing", "failed"].includes(String(dialog["phase"])) &&
        typeof dialog["blocksHistory"] === "boolean" &&
        (dialog["requestId"] === null ||
          isPositiveSafeInteger(dialog["requestId"])),
    )
  );
}

function isQuickEntryDraft(
  value: unknown,
  currentRevision: number,
  currentDocument: unknown,
): boolean {
  return (
    hasExactObjectKeys(value, [
      "text",
      "target",
      "baseRevision",
      "status",
      "issueCodes",
    ]) &&
    (value["text"] === "" ||
      isBoundedUnicodeScalarToken(
        value["text"],
        MAX_QUICK_ENTRY_CODE_POINTS,
      )) &&
    (value["target"] === null ||
      (documentBookmarkIndex(currentDocument) !== null &&
        isStableBoundary(
          value["target"],
          documentBookmarkIndex(currentDocument) as DocumentBookmarkIndex,
        ))) &&
    value["baseRevision"] === currentRevision &&
    ["idle", "invalid", "ready"].includes(String(value["status"])) &&
    isStringArray(value["issueCodes"], MAX_DRAFT_ISSUES)
  );
}

function isImportDraft(value: unknown, currentRevision: number): boolean {
  return (
    value === null ||
    (hasExactObjectKeys(value, [
      "id",
      "origin",
      "baseRevision",
      "readRequestId",
      "status",
      "candidate",
      "issueCodes",
    ]) &&
      isStateIdentifier(value["id"]) &&
      (value["origin"] === "canonical-import" ||
        value["origin"] === "legacy-import") &&
      value["baseRevision"] === currentRevision &&
      isPositiveSafeInteger(value["readRequestId"]) &&
      ["reading", "invalid", "ready", "cancelled"].includes(
        String(value["status"]),
      ) &&
      (value["candidate"] === null ||
        isCompleteDocumentLiteral(value["candidate"])) &&
      isStringArray(value["issueCodes"], MAX_DRAFT_ISSUES))
  );
}

function isTransportViewState(value: unknown): boolean {
  return (
    hasExactObjectKeys(value, [
      "status",
      "generation",
      "commandRequestId",
      "notificationSequence",
      "documentId",
      "planRevision",
      "startBeat",
      "playhead",
      "failureCode",
    ]) &&
    APP_STATE_TRANSPORT_STATUS_SET.has(String(value["status"])) &&
    isNonNegativeSafeInteger(value["generation"]) &&
    isNonNegativeSafeInteger(value["commandRequestId"]) &&
    isNonNegativeSafeInteger(
      value["notificationSequence"],
      MAX_APPLICATION_SEQUENCE,
    ) &&
    isStateIdentifier(value["documentId"]) &&
    isNonNegativeSafeInteger(value["planRevision"], MAX_APPLICATION_REVISION) &&
    isCanonicalBeatPosition(value["startBeat"]) &&
    isCanonicalBeatPosition(value["playhead"]) &&
    (value["status"] === "failed"
      ? isBoundedUnicodeScalarToken(
          value["failureCode"],
          MAX_COMMAND_ID_CODE_POINTS,
        )
      : value["failureCode"] === null)
  );
}

function isPendingApplicationRequest(
  value: unknown,
  currentDocumentId: unknown,
  currentRevision: number,
): boolean {
  return (
    hasExactObjectKeys(value, [
      "kind",
      "id",
      "documentId",
      "baseRevision",
      "status",
    ]) &&
    APP_STATE_REQUEST_KIND_SET.has(String(value["kind"])) &&
    isPositiveSafeInteger(value["id"]) &&
    value["documentId"] === currentDocumentId &&
    value["baseRevision"] === currentRevision &&
    (value["status"] === "running" || value["status"] === "cancelling")
  );
}

function isPendingApplicationRequests(
  value: unknown,
  currentDocumentId: unknown,
  currentRevision: number,
): boolean {
  return (
    Array.isArray(value) &&
    value.length <= MAX_PENDING_REQUESTS &&
    value.every((request) =>
      isPendingApplicationRequest(request, currentDocumentId, currentRevision),
    ) &&
    new Set(value.map((request) => (request as JsonObject)["kind"])).size ===
      value.length &&
    value.every((request, index) => {
      if (index === 0) return true;
      const previous = value[index - 1] as JsonObject;
      return (
        APPLICATION_REQUEST_KINDS.indexOf(
          previous["kind"] as (typeof APPLICATION_REQUEST_KINDS)[number],
        ) <
        APPLICATION_REQUEST_KINDS.indexOf(
          (request as JsonObject)[
            "kind"
          ] as (typeof APPLICATION_REQUEST_KINDS)[number],
        )
      );
    })
  );
}

function isDocumentTransitionState(
  value: unknown,
  currentRevision: number,
  pendingRequests: unknown,
): boolean {
  if (!isObject(value)) return false;
  if (value["kind"] === "idle") return hasExactObjectKeys(value, ["kind"]);
  const shapeValid =
    hasExactObjectKeys(value, [
      "kind",
      "requestId",
      "origin",
      "baseRevision",
      "candidateDocumentId",
      "undoDisposition",
    ]) &&
    ["awaiting-confirmation", "retiring-transport", "committing"].includes(
      String(value["kind"]),
    ) &&
    isPositiveSafeInteger(value["requestId"]) &&
    APP_STATE_REPLACEMENT_ORIGIN_SET.has(String(value["origin"])) &&
    value["baseRevision"] === currentRevision &&
    isStateIdentifier(value["candidateDocumentId"]) &&
    (value["undoDisposition"] === "retained" ||
      value["undoDisposition"] === "explicitly-unavailable");
  return (
    shapeValid &&
    Array.isArray(pendingRequests) &&
    pendingRequests.some(
      (request) =>
        isObject(request) &&
        request["kind"] === "document-transition" &&
        request["id"] === value["requestId"] &&
        request["baseRevision"] === currentRevision,
    )
  );
}

function isUiFocusTarget(
  value: unknown,
  currentDocument: unknown,
  dialogs: unknown,
): boolean {
  if (!isObject(value)) return false;
  if (value["kind"] === "chart") return hasExactObjectKeys(value, ["kind"]);
  const documentIndex = documentBookmarkIndex(currentDocument);
  if (documentIndex === null) return false;
  const keyByKind: Readonly<Record<string, string>> = {
    section: "sectionId",
    measure: "measureId",
    event: "eventId",
    dialog: "dialogId",
  };
  const identityKey = keyByKind[String(value["kind"])];
  if (
    identityKey === undefined ||
    !hasExactObjectKeys(value, ["kind", identityKey])
  ) {
    return false;
  }
  const identity = value[identityKey];
  if (identityKey === "dialogId") {
    return (
      isBoundedUnicodeScalarToken(identity, MAX_COMMAND_ID_CODE_POINTS) &&
      recordsAt(dialogs).some((dialog) => dialog["id"] === identity)
    );
  }
  if (typeof identity !== "string") return false;
  return identityKey === "sectionId"
    ? documentIndex.sectionIds.has(identity)
    : identityKey === "measureId"
      ? documentIndex.measureIds.has(identity)
      : documentIndex.eventOrder.has(identity);
}

function isFocusRequest(
  value: unknown,
  currentDocument: unknown,
  dialogs: unknown,
): boolean {
  return (
    value === null ||
    (hasExactObjectKeys(value, ["sequence", "target", "reason"]) &&
      isNonNegativeSafeInteger(value["sequence"], MAX_APPLICATION_SEQUENCE) &&
      isUiFocusTarget(value["target"], currentDocument, dialogs) &&
      [
        "command",
        "delete-repair",
        "replacement",
        "undo",
        "redo",
        "dialog-close",
      ].includes(String(value["reason"])))
  );
}

function isNotices(
  value: unknown,
  currentRevision: number,
  nextSequence: number,
): boolean {
  return (
    Array.isArray(value) &&
    value.length <= MAX_NOTICES &&
    new Set(
      value.map((notice) =>
        isObject(notice) ? notice["sequence"] : undefined,
      ),
    ).size === value.length &&
    value.every(
      (notice, index) =>
        hasExactObjectKeys(notice, [
          "sequence",
          "level",
          "code",
          "message",
          "createdAtRevision",
          "dismissible",
        ]) &&
        isNonNegativeSafeInteger(
          notice["sequence"],
          MAX_APPLICATION_SEQUENCE,
        ) &&
        ["info", "success", "warning", "error"].includes(
          String(notice["level"]),
        ) &&
        typeof notice["code"] === "string" &&
        isUnicodeScalarString(
          notice["message"],
          MAX_NOTICE_MESSAGE_CODE_POINTS,
          true,
        ) &&
        isNonNegativeSafeInteger(
          notice["createdAtRevision"],
          currentRevision,
        ) &&
        typeof notice["dismissible"] === "boolean" &&
        (notice["sequence"] < nextSequence ||
          (notice["sequence"] === MAX_APPLICATION_SEQUENCE &&
            nextSequence === MAX_APPLICATION_SEQUENCE)) &&
        (index === 0 ||
          Number((value[index - 1] as JsonObject)["sequence"]) <
            notice["sequence"]),
    )
  );
}

function hasAppStateTopLevelShape(value: unknown): value is JsonObject {
  return hasExactObjectKeys(value, APP_STATE_KEYS);
}

function isFullAppStateLiteral(value: unknown): value is JsonObject {
  if (!hasAppStateTopLevelShape(value)) return false;
  const revision = value["revision"];
  const exportRevision = value["exportRevision"];
  const nextSequence = value["nextSequence"];
  if (
    !isNonNegativeSafeInteger(revision, MAX_APPLICATION_REVISION) ||
    !isNonNegativeSafeInteger(nextSequence, MAX_APPLICATION_SEQUENCE)
  ) {
    return false;
  }
  const document = value["document"];
  if (!isCompleteDocumentLiteral(document)) return false;
  const pendingRequests = value["pendingRequests"];
  const structurallyValid =
    isCompleteDocumentLiteral(value["document"]) &&
    (exportRevision === null ||
      (isNonNegativeSafeInteger(exportRevision, MAX_APPLICATION_REVISION) &&
        exportRevision <= revision)) &&
    isRecoveryStatus(value["recovery"]) &&
    isHistoryState(value["history"]) &&
    isStableUiBookmarks(value["bookmarks"], document) &&
    isPanelState(value["panels"]) &&
    isDialogStack(value["dialogs"]) &&
    isQuickEntryDraft(value["quickEntry"], revision, document) &&
    isImportDraft(value["importDraft"], revision) &&
    isTransportViewState(value["transport"]) &&
    isPendingApplicationRequests(pendingRequests, document["id"], revision) &&
    isDocumentTransitionState(
      value["documentTransition"],
      revision,
      pendingRequests,
    ) &&
    isFocusRequest(value["focusRequest"], document, value["dialogs"]) &&
    isNotices(value["notices"], revision, nextSequence) &&
    (value["focusRequest"] === null ||
      Number((value["focusRequest"] as JsonObject)["sequence"]) < nextSequence);
  if (!structurallyValid) return false;
  const allocatedSequences = [
    ...(value["focusRequest"] === null
      ? []
      : [(value["focusRequest"] as JsonObject)["sequence"]]),
    ...(value["notices"] as JsonObject[]).map((notice) => notice["sequence"]),
  ];
  return new Set(allocatedSequences).size === allocatedSequences.length;
}

function incrementApplicationSequence(sequence: number): number {
  return sequence >= MAX_APPLICATION_SEQUENCE
    ? MAX_APPLICATION_SEQUENCE
    : sequence + 1;
}

function constructLatestReplacementPublicationState(
  latest: JsonObject,
  privateMaterial: JsonObject,
): JsonObject | null {
  const publication = isObject(privateMaterial["publication"])
    ? privateMaterial["publication"]
    : null;
  const owned =
    publication !== null && isObject(publication["replacementOwnedProjection"])
      ? publication["replacementOwnedProjection"]
      : null;
  const focusTemplate =
    publication !== null && isObject(publication["focusRequestTemplate"])
      ? publication["focusRequestTemplate"]
      : null;
  const noticeTemplates =
    owned !== null && Array.isArray(owned["noticeTemplates"])
      ? recordsAt(owned["noticeTemplates"])
      : null;
  const quickEntryTemplate =
    owned !== null && isObject(owned["quickEntryTemplate"])
      ? owned["quickEntryTemplate"]
      : null;
  if (
    publication === null ||
    owned === null ||
    focusTemplate === null ||
    noticeTemplates === null ||
    quickEntryTemplate === null ||
    !privatePendingRequestsSnapshotMatches(privateMaterial, latest) ||
    publication["revisionIncrement"] !== 1 ||
    !Number.isSafeInteger(latest["revision"]) ||
    !Number.isSafeInteger(latest["nextSequence"]) ||
    Number(latest["nextSequence"]) >= MAX_APPLICATION_SEQUENCE
  ) {
    return null;
  }
  const revision = Number(latest["revision"]) + 1;
  let nextSequence = Number(latest["nextSequence"]);
  const focusRequest = {
    ...focusTemplate,
    sequence: nextSequence,
  };
  nextSequence = incrementApplicationSequence(nextSequence);
  const notices = noticeTemplates.map((template) => {
    const notice = {
      ...template,
      sequence: nextSequence,
      createdAtRevision: revision,
    };
    nextSequence = incrementApplicationSequence(nextSequence);
    return notice;
  });
  return {
    document: owned["document"],
    revision,
    exportRevision: latest["exportRevision"],
    recovery: latest["recovery"],
    history: owned["history"],
    bookmarks: owned["bookmarks"],
    panels: latest["panels"],
    dialogs: latest["dialogs"],
    quickEntry: { ...quickEntryTemplate, baseRevision: revision },
    importDraft: owned["importDraft"],
    transport: latest["transport"],
    pendingRequests: owned["pendingRequests"],
    documentTransition: owned["documentTransition"],
    focusRequest,
    notices,
    nextSequence,
  };
}

function isCompleteDocumentLiteral(value: unknown): value is JsonObject {
  if (!isObject(value)) return false;
  return (
    value["schema"] === "changes.progression.v2" &&
    typeof value["id"] === "string" &&
    typeof value["title"] === "string" &&
    Array.isArray(value["sections"])
  );
}

type AcceptedE0MaterializationContext = Readonly<{
  ledger: JsonObject;
  sharedBases: JsonObject;
  fixturesById: ReadonlyMap<string, JsonObject>;
  loadedFiles: ReadonlyMap<string, unknown>;
}>;

function materializeAcceptedRepetitionRecipe(value: JsonObject): unknown {
  if (
    value["kind"] !==
      "test-owned-validated-document-repetition-materialization" ||
    !isObject(value["recipe"])
  ) {
    return undefined;
  }
  const recipe = value["recipe"];
  const sectionCount = recipe["sectionCount"];
  const measuresPerSection = recipe["measuresPerSection"];
  const totalMeasures = recipe["totalMeasures"];
  const completeMeasureCount = recipe["completeMeasureCount"];
  const description = isObject(recipe["description"])
    ? recipe["description"]
    : {};
  const sectionTemplate = isObject(recipe["section"]) ? recipe["section"] : {};
  const eventTemplate = isObject(recipe["completeMeasureEvent"])
    ? recipe["completeMeasureEvent"]
    : {};
  if (
    !Number.isSafeInteger(sectionCount) ||
    !Number.isSafeInteger(measuresPerSection) ||
    !Number.isSafeInteger(totalMeasures) ||
    !Number.isSafeInteger(completeMeasureCount) ||
    Number(sectionCount) * Number(measuresPerSection) !== totalMeasures ||
    typeof description["scalar"] !== "string" ||
    !Number.isSafeInteger(description["repeatCodePoints"])
  ) {
    throw new Error("BRIDGE_E0_REPETITION_RECIPE");
  }
  const sections = Array.from(
    { length: Number(sectionCount) },
    (_, sectionIndex) => ({
      id: `s${String(sectionIndex)}`,
      ...structuredClone(sectionTemplate),
      measures: Array.from(
        { length: Number(measuresPerSection) },
        (_, measureIndex) => {
          const globalMeasure =
            sectionIndex * Number(measuresPerSection) + measureIndex;
          const containsEvent = globalMeasure < Number(completeMeasureCount);
          return {
            id: `m${String(globalMeasure)}`,
            events: containsEvent
              ? [
                  {
                    id: `e${String(globalMeasure)}`,
                    ...structuredClone(eventTemplate),
                  },
                ]
              : [],
            completion: { kind: containsEvent ? "complete" : "empty" },
          };
        },
      ),
    }),
  );
  return {
    schema: recipe["schema"],
    id: recipe["documentId"],
    title: recipe["title"],
    description: description["scalar"].repeat(
      Number(description["repeatCodePoints"]),
    ),
    meter: structuredClone(recipe["meter"]),
    tempoBpm: recipe["tempoBpm"],
    key: structuredClone(recipe["key"]),
    sections,
    playback: structuredClone(recipe["playback"]),
  };
}

function materializeAcceptedE0Value(
  value: unknown,
  context: AcceptedE0MaterializationContext,
  visiting: ReadonlySet<string> = new Set(),
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) =>
      materializeAcceptedE0Value(item, context, visiting),
    );
  }
  if (!isObject(value)) return structuredClone(value);
  const repeatedDocument = materializeAcceptedRepetitionRecipe(value);
  if (repeatedDocument !== undefined) return repeatedDocument;
  const sharedBaseId = value["sharedBase"];
  if (typeof sharedBaseId === "string") {
    if (visiting.has(`shared:${sharedBaseId}`)) {
      throw new Error("BRIDGE_E0_SHARED_BASE_CYCLE");
    }
    const base = context.sharedBases[sharedBaseId];
    if (base === undefined) throw new Error("BRIDGE_E0_SHARED_BASE_MISSING");
    const next = new Set(visiting);
    next.add(`shared:${sharedBaseId}`);
    const materializedBase = materializeAcceptedE0Value(
      isObject(base) && Object.hasOwn(base, "value") ? base["value"] : base,
      context,
      next,
    );
    const overrides = Object.fromEntries(
      Object.entries(value).filter(([key]) => key !== "sharedBase"),
    );
    if (Object.keys(overrides).length === 0) return materializedBase;
    if (!isObject(materializedBase)) {
      throw new Error("BRIDGE_E0_SHARED_BASE_OVERRIDE");
    }
    return {
      ...materializedBase,
      ...Object.fromEntries(
        Object.entries(overrides).map(([key, child]) => [
          key,
          materializeAcceptedE0Value(child, context, next),
        ]),
      ),
    };
  }
  const fixtureId = value["fixtureId"];
  if (typeof fixtureId === "string") {
    const acceptedFixture = context.fixturesById.get(fixtureId);
    const loaded = context.loadedFiles.get(fixtureId);
    if (acceptedFixture !== undefined) {
      return materializeAcceptedE0Fixture(fixtureId, context, visiting);
    }
    if (loaded !== undefined) return structuredClone(loaded);
  }
  if (
    Object.hasOwn(value, "value") &&
    typeof value["materializeAs"] === "string"
  ) {
    return materializeAcceptedE0Value(value["value"], context, visiting);
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      materializeAcceptedE0Value(child, context, visiting),
    ]),
  );
}

function applyAcceptedE0Mutations(
  base: unknown,
  mutations: readonly JsonObject[],
  context: AcceptedE0MaterializationContext,
): unknown {
  let current = base;
  for (const mutation of mutations) {
    const operation = mutation["operation"];
    const path = mutation["path"];
    if (
      typeof operation !== "string" ||
      !Array.isArray(path) ||
      path.length === 0 ||
      !path.every(
        (segment) =>
          typeof segment === "string" || Number.isSafeInteger(segment),
      )
    ) {
      throw new Error("BRIDGE_E0_MUTATION_SHAPE");
    }
    const pointer = pointerForPath(path as (string | number)[]);
    const before = valueAtJsonPointer(current, pointer);
    if (
      Object.hasOwn(mutation, "from") &&
      !jsonDeepEqual(
        before,
        materializeAcceptedE0Value(mutation["from"], context),
      )
    ) {
      throw new Error("BRIDGE_E0_MUTATION_FROM");
    }
    if (operation === "set") {
      current = applyPointerMutation(
        current,
        "replace",
        pointer,
        before,
        materializeAcceptedE0Value(mutation["to"], context),
      );
      continue;
    }
    if (operation === "append") {
      current = applyPointerMutation(
        current,
        "append",
        pointer,
        before,
        materializeAcceptedE0Value(mutation["value"], context),
      );
      continue;
    }
    if (operation === "remove") {
      current = applyPointerMutation(
        current,
        "remove",
        pointer,
        before,
        undefined,
      );
      continue;
    }
    throw new Error("BRIDGE_E0_MUTATION_OPERATION");
  }
  return current;
}

function materializeAcceptedE0Fixture(
  fixtureId: string,
  context: AcceptedE0MaterializationContext,
  visiting: ReadonlySet<string> = new Set(),
): unknown {
  if (visiting.has(`fixture:${fixtureId}`)) {
    throw new Error("BRIDGE_E0_FIXTURE_CYCLE");
  }
  const fixture = context.fixturesById.get(fixtureId);
  if (fixture === undefined) {
    const loaded = context.loadedFiles.get(fixtureId);
    if (loaded === undefined) throw new Error("BRIDGE_E0_FIXTURE_MISSING");
    return structuredClone(loaded);
  }
  if (fixture["kind"] === "local-golden") {
    const path = fixture["path"];
    if (typeof path !== "string" || !context.loadedFiles.has(path)) {
      throw new Error("BRIDGE_E0_LOCAL_GOLDEN_MISSING");
    }
    return structuredClone(context.loadedFiles.get(path));
  }
  const next = new Set(visiting);
  next.add(`fixture:${fixtureId}`);
  if (Object.hasOwn(fixture, "value")) {
    return materializeAcceptedE0Value(fixture["value"], context, next);
  }
  const baseReference = fixture["base"];
  let base: unknown;
  if (typeof baseReference === "string") {
    base = materializeAcceptedE0Fixture(baseReference, context, next);
  } else if (isObject(baseReference)) {
    if (typeof baseReference["sharedBase"] === "string") {
      base = materializeAcceptedE0Value(baseReference, context, next);
    } else if (typeof baseReference["fixtureId"] === "string") {
      base = materializeAcceptedE0Fixture(
        baseReference["fixtureId"],
        context,
        next,
      );
    }
  }
  if (base === undefined) throw new Error("BRIDGE_E0_FIXTURE_BASE");
  return applyAcceptedE0Mutations(
    base,
    recordsAt(fixture["orderedMutations"]),
    context,
  );
}

type BridgeLiteralContext = Readonly<{
  catalog: JsonObject;
  acceptedE0: AcceptedE0MaterializationContext;
  cache?: Map<string, unknown>;
}>;

function materializeBridgeTemplate(
  value: unknown,
  context: BridgeLiteralContext,
  stateContext: unknown,
  visiting: ReadonlySet<string>,
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) =>
      materializeBridgeTemplate(item, context, stateContext, visiting),
    );
  }
  if (!isObject(value)) return structuredClone(value);
  if (
    Object.keys(value).length === 1 &&
    Object.hasOwn(value, "$literalValue")
  ) {
    return materializeBridgeTemplate(
      value["$literalValue"],
      context,
      stateContext,
      visiting,
    );
  }
  const referencedLiteral = value["$literalRef"];
  if (
    Object.keys(value).length === 1 &&
    typeof referencedLiteral === "string"
  ) {
    return materializeBridgeLiteral(
      referencedLiteral,
      context,
      stateContext,
      visiting,
    );
  }
  if (
    Object.keys(value).length === 1 &&
    typeof value["$statePointer"] === "string"
  ) {
    const selected = valueAtJsonPointer(stateContext, value["$statePointer"]);
    if (selected === undefined) throw new Error("BRIDGE_STATE_POINTER");
    return structuredClone(selected);
  }
  if (
    Object.keys(value).length === 1 &&
    typeof value["$specialNumber"] === "string"
  ) {
    if (value["$specialNumber"] === "NaN") return Number.NaN;
    if (value["$specialNumber"] === "Infinity") return Number.POSITIVE_INFINITY;
    if (value["$specialNumber"] === "-Infinity")
      return Number.NEGATIVE_INFINITY;
    throw new Error("BRIDGE_SPECIAL_NUMBER");
  }
  if (Object.hasOwn(value, "$utf16CodeUnits")) {
    const units = value["$utf16CodeUnits"];
    if (
      Object.keys(value).length !== 1 ||
      !Array.isArray(units) ||
      units.length === 0 ||
      units.some(
        (unit) =>
          !Number.isInteger(unit) || Number(unit) < 0 || Number(unit) > 0xffff,
      )
    ) {
      throw new Error("BRIDGE_UTF16_CODE_UNITS");
    }
    return String.fromCharCode(...units.map(Number));
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      materializeBridgeTemplate(child, context, stateContext, visiting),
    ]),
  );
}

function materializeBridgeLiteral(
  literalId: string,
  context: BridgeLiteralContext,
  stateContext?: unknown,
  visiting: ReadonlySet<string> = new Set(),
): unknown {
  if (context.cache?.has(literalId) === true) {
    return context.cache.get(literalId);
  }
  if (visiting.has(literalId)) throw new Error("BRIDGE_LITERAL_CYCLE");
  const entry = context.catalog[literalId];
  if (!isObject(entry)) throw new Error("BRIDGE_LITERAL_MISSING");
  const next = new Set(visiting);
  next.add(literalId);
  if (entry["kind"] === "inline") {
    const materialized = materializeBridgeTemplate(
      entry["value"],
      context,
      stateContext,
      next,
    );
    context.cache?.set(literalId, materialized);
    return materialized;
  }
  if (entry["kind"] === "accepted-e0-v1-reference") {
    const path = entry["path"];
    if (typeof path !== "string" || typeof entry["jsonPointer"] !== "string") {
      throw new Error("BRIDGE_LITERAL_ACCEPTED_REFERENCE");
    }
    const prefix = "tests/fixtures/interchange/";
    if (!path.startsWith(prefix) || path.includes("..")) {
      throw new Error("BRIDGE_LITERAL_ACCEPTED_PATH");
    }
    const relativePath = path.slice(prefix.length);
    const expectedSha = E0_ACCEPTED_BYTE_DIGESTS[relativePath];
    if (expectedSha === undefined || entry["sha256"] !== expectedSha) {
      throw new Error("BRIDGE_LITERAL_ACCEPTED_DIGEST");
    }
    const authority =
      path === ACCEPTED_E0_INPUT_LEDGER_PATH
        ? context.acceptedE0.ledger
        : context.acceptedE0.loadedFiles.get(relativePath);
    const referenced = valueAtJsonPointer(authority, entry["jsonPointer"]);
    if (referenced === undefined)
      throw new Error("BRIDGE_LITERAL_JSON_POINTER");
    let materialized: unknown;
    if (isObject(referenced) && typeof referenced["id"] === "string") {
      const fixture = context.acceptedE0.fixturesById.get(referenced["id"]);
      if (fixture === referenced || fixture !== undefined) {
        materialized = materializeAcceptedE0Fixture(
          referenced["id"],
          context.acceptedE0,
        );
      }
    }
    materialized ??= materializeAcceptedE0Value(referenced, context.acceptedE0);
    const resolved = applyBridgePatches(
      materialized,
      entry["materializationPatches"],
      context,
      materialized,
    );
    context.cache?.set(literalId, resolved);
    return resolved;
  }
  throw new Error("BRIDGE_LITERAL_KIND");
}

function materializePatchValue(
  value: unknown,
  context: BridgeLiteralContext,
  stateContext: unknown,
): unknown {
  return materializeBridgeTemplate(value, context, stateContext, new Set());
}

function applyBridgePatches(
  base: unknown,
  patches: unknown,
  context: BridgeLiteralContext,
  stateContext: unknown,
): unknown {
  const patchRecords = recordsAt(patches);
  if (patchRecords.length === 0) return base;
  let current = base;
  for (const patch of patchRecords) {
    const operator = patch["op"];
    const pointer = patch["jsonPointer"];
    if (typeof operator !== "string" || typeof pointer !== "string") {
      throw new Error("BRIDGE_PATCH_SHAPE");
    }
    const actualBefore = valueAtJsonPointer(current, pointer);
    if (actualBefore === undefined && operator !== "add") {
      throw new Error(`BRIDGE_PATCH_TARGET:${pointer}`);
    }
    if (operator === "assert") {
      const expected = materializePatchValue(
        patch["value"],
        context,
        stateContext,
      );
      if (!jsonDeepEqual(actualBefore, expected)) {
        throw new Error("BRIDGE_PATCH_ASSERT");
      }
      continue;
    }
    if (operator === "append") {
      if (!Array.isArray(actualBefore)) throw new Error("BRIDGE_PATCH_APPEND");
      if (
        Object.hasOwn(patch, "fromCount") &&
        patch["fromCount"] !== actualBefore.length
      ) {
        throw new Error("BRIDGE_PATCH_APPEND_COUNT");
      }
      current = applyPointerMutation(
        current,
        "append",
        pointer,
        actualBefore,
        materializePatchValue(patch["value"], context, stateContext),
      );
      continue;
    }
    const expectedBefore = materializePatchValue(
      patch["from"],
      context,
      stateContext,
    );
    if (operator === "add") {
      const to = materializePatchValue(patch["to"], context, stateContext);
      const value = materializePatchValue(
        patch["value"],
        context,
        stateContext,
      );
      if (
        !isObject(expectedBefore) ||
        expectedBefore["$absent"] !== true ||
        !jsonDeepEqual(to, value)
      ) {
        throw new Error("BRIDGE_PATCH_ADD_VALUE");
      }
      current = applyPointerMutation(
        current,
        "add",
        pointer,
        expectedBefore,
        value,
      );
      continue;
    }
    if (operator === "replace") {
      const to = materializePatchValue(patch["to"], context, stateContext);
      const value = materializePatchValue(
        patch["value"],
        context,
        stateContext,
      );
      if (!jsonDeepEqual(to, value)) {
        throw new Error("BRIDGE_PATCH_TO_VALUE");
      }
      current = applyPointerMutation(
        current,
        "replace",
        pointer,
        expectedBefore,
        value,
      );
      continue;
    }
    if (operator !== "remove") throw new Error("BRIDGE_PATCH_OPERATOR");
    current = applyPointerMutation(
      current,
      operator,
      pointer,
      expectedBefore,
      undefined,
    );
  }
  return current;
}

function materializeDescriptor(
  descriptor: unknown,
  context: BridgeLiteralContext,
  stateContext?: unknown,
): unknown {
  if (!isObject(descriptor)) throw new Error("BRIDGE_DESCRIPTOR_SHAPE");
  const literalId = descriptor["literalId"];
  let base: unknown;
  if (typeof literalId === "string") {
    base = materializeBridgeLiteral(literalId, context, stateContext);
  } else if (Object.hasOwn(descriptor, "value")) {
    base = materializeBridgeTemplate(
      descriptor["value"],
      context,
      stateContext,
      new Set(),
    );
  } else {
    throw new Error("BRIDGE_DESCRIPTOR_VALUE");
  }
  return applyBridgePatches(
    base,
    descriptor["patches"],
    context,
    stateContext ?? base,
  );
}

function reverseReplacementPatches(
  value: unknown,
  patches: unknown,
  context: BridgeLiteralContext,
): unknown {
  let current = value;
  const records = recordsAt(patches);
  for (const patch of [...records].reverse()) {
    if (patch["op"] !== "replace" || typeof patch["jsonPointer"] !== "string") {
      throw new Error("BRIDGE_INVERSE_PATCH_OPERATOR");
    }
    const forwardValue = materializePatchValue(
      patch["value"],
      context,
      current,
    );
    const forwardTo = materializePatchValue(patch["to"], context, current);
    if (!jsonDeepEqual(forwardValue, forwardTo)) {
      throw new Error("BRIDGE_INVERSE_PATCH_TO");
    }
    current = applyPointerMutation(
      current,
      "replace",
      patch["jsonPointer"],
      forwardValue,
      materializePatchValue(patch["from"], context, current),
    );
  }
  return current;
}

type MaterializedRunProjection = Readonly<{
  caseId: string;
  runId: string;
  operation: string;
  runRole: "conformance" | "mutation-killer";
  ownerProof: boolean;
  e0V2Owned: boolean;
  rawCall: JsonObject;
  controllerStateBefore: unknown;
  controllerStateAfter: unknown;
  registryBefore: unknown;
  registryAfter: unknown;
  exactTypedResult: unknown;
  exactCounters: unknown;
  synchronousEventOrder: unknown;
  workBound: unknown;
  exactControllerStateDelta: readonly JsonObject[];
  mutationProbe: JsonObject | null;
  historyEstimatorLawInput: unknown;
  ownerLawFlags: JsonObject;
  ownerLawOracle: JsonObject;
  scenarioFinalState: unknown;
  scenarioFinalStateResolved: unknown;
  scenarioCurrentAfterExternalEdit: unknown;
  referenceIdentityExpectations: unknown;
  publicationMergeFieldPolicy: unknown;
  publicationMergeReferenceExpectations: unknown;
  publicationMergeSequenceWitness: unknown;
  sameRevisionInterleave: unknown;
  publicationMergeObservation: unknown;
  contentInvarianceWitness: unknown;
  comparisonInput: JsonObject;
}>;

function projectionForMutationTarget(
  run: MaterializedRunProjection,
  materialization: string,
): unknown {
  switch (materialization) {
    case "comparisonInput":
      return run.comparisonInput;
    case "rawCall":
      return run.rawCall;
    case "controllerStateBefore":
      return run.controllerStateBefore;
    case "controllerStateAfter":
      return run.controllerStateAfter;
    case "registryBefore":
      return run.registryBefore;
    case "registryLawInput": {
      const registry = isObject(run.registryBefore) ? run.registryBefore : {};
      const entries = recordsAt(registry["entries"]);
      return {
        capacity: registry["capacity"],
        liveEntries: entries.filter((entry) => entry["status"] === "prepared")
          .length,
      };
    }
    case "registryAfter":
      return run.registryAfter;
    case "exactTypedResult":
      return run.exactTypedResult;
    case "exactCounters":
      return run.exactCounters;
    case "synchronousEventOrder":
      return run.synchronousEventOrder;
    case "workBound":
      return run.workBound;
    case "historyEstimatorLawInput":
      return run.historyEstimatorLawInput;
    case "ownerLawFlags":
      return run.ownerLawFlags;
    case "ownerLawOracle":
      return run.ownerLawOracle;
    case "scenarioFinalState":
      return run.scenarioFinalState;
    case "referenceIdentityExpectations":
      return run.referenceIdentityExpectations;
    case "publicationMergeObservation":
      return run.publicationMergeObservation;
    default:
      return undefined;
  }
}

export async function validateA0E0BridgeContract(
  fixtureRoot = DEFAULT_FIXTURE_ROOT,
  options: A0E0BridgeContractValidationOptions = {},
): Promise<A0E0BridgeContractValidationReport> {
  const findings: A0E0BridgeContractFinding[] = [];
  const loaded = new Map<string, JsonObject>();

  let actualFiles: string[] = [];
  try {
    actualFiles = (await readdir(fixtureRoot)).sort(codeUnitCompare);
  } catch {
    addFinding(
      findings,
      "BRIDGE_FIXTURE_ROOT",
      fixtureRoot,
      "Bridge fixture root must exist and be readable.",
    );
  }
  requireExact(
    actualFiles,
    [...A0_E0_BRIDGE_SPEC_FILES],
    "BRIDGE_FILE_INVENTORY",
    fixtureRoot,
    "Bridge fixture inventory must contain exactly the five pinned companions.",
    findings,
  );

  for (const filename of A0_E0_BRIDGE_SPEC_FILES) {
    const path = resolve(fixtureRoot, filename);
    try {
      const bytes = new Uint8Array(await readFile(path));
      const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (
        source.startsWith("\uFEFF") ||
        source.includes("\r") ||
        !source.endsWith("\n") ||
        source.endsWith("\n\n")
      ) {
        addFinding(
          findings,
          "BRIDGE_TEXT_CANONICAL",
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
          "BRIDGE_JSON_LEXICAL",
          filename,
          "Fixture must pass the strict independent JSON lexical scan.",
        );
      }
      for (const duplicate of duplicates) {
        addFinding(
          findings,
          "BRIDGE_JSON_DUPLICATE_KEY",
          `${filename}${duplicate.slice(1)}`,
          "Duplicate JSON object keys are forbidden.",
        );
      }
      const value: unknown = JSON.parse(source);
      if (!isObject(value)) {
        addFinding(
          findings,
          "BRIDGE_JSON_ROOT",
          filename,
          "Fixture root must be a JSON object.",
        );
      } else {
        loaded.set(filename, value);
      }
      const expectedByteDigests =
        options.expectedByteDigests ?? A0_E0_BRIDGE_SPEC_BYTE_DIGESTS;
      if (sha256(bytes) !== expectedByteDigests[filename]) {
        addFinding(
          findings,
          "BRIDGE_BYTE_DIGEST",
          filename,
          "Fixture bytes differ from the independently pinned spec packet.",
        );
      }
    } catch {
      addFinding(
        findings,
        "BRIDGE_FILE_READ",
        filename,
        "Fixture must be readable, valid UTF-8, and valid JSON.",
      );
    }
  }

  for (const filename of A0_E0_BRIDGE_SPEC_FILES) {
    const value = loaded.get(filename);
    if (value?.["schema"] !== EXPECTED_SCHEMAS[filename]) {
      addFinding(
        findings,
        "BRIDGE_SCHEMA",
        `${filename}.schema`,
        "Fixture schema differs from the closed bridge vocabulary.",
      );
    }
    if (value?.["reviewState"] !== EXPECTED_REVIEW_STATES[filename]) {
      addFinding(
        findings,
        "BRIDGE_REVIEW_STATE",
        `${filename}.reviewState`,
        "Spec fixtures must not claim implementation or human acceptance.",
      );
    }
  }

  const semanticPacket = Object.fromEntries(
    A0_E0_BRIDGE_SPEC_FILES.map((filename) => [
      filename,
      loaded.get(filename) ?? null,
    ]),
  );
  if (
    sha256(new TextEncoder().encode(stableJson(semanticPacket))) !==
    A0_E0_BRIDGE_SPEC_SEMANTIC_DIGEST
  ) {
    addFinding(
      findings,
      "BRIDGE_SEMANTIC_DIGEST",
      fixtureRoot,
      "Parsed bridge contract, cases, controls, provenance, and traces differ from the independent semantic pin.",
    );
  }

  let acceptedE0Materialization: AcceptedE0MaterializationContext = {
    ledger: {},
    sharedBases: {},
    fixturesById: new Map(),
    loadedFiles: new Map(),
  };
  try {
    const acceptedRoot = resolve(REPOSITORY_ROOT, "tests/fixtures/interchange");
    const ledgerBytes = new Uint8Array(
      await readFile(resolve(REPOSITORY_ROOT, ACCEPTED_E0_INPUT_LEDGER_PATH)),
    );
    if (sha256(ledgerBytes) !== ACCEPTED_E0_INPUT_LEDGER_SHA256) {
      throw new Error("BRIDGE_ACCEPTED_LEDGER_DIGEST");
    }
    const ledgerValue: unknown = JSON.parse(
      new TextDecoder().decode(ledgerBytes),
    );
    if (!isObject(ledgerValue)) throw new Error("BRIDGE_ACCEPTED_LEDGER_ROOT");
    const loadedFiles = new Map<string, unknown>();
    for (const relativePath of Object.keys(E0_ACCEPTED_BYTE_DIGESTS)) {
      if (!relativePath.endsWith(".json")) continue;
      const value: unknown = JSON.parse(
        await readFile(resolve(acceptedRoot, relativePath), "utf8"),
      );
      loadedFiles.set(relativePath, value);
    }
    const fixtureRows = recordsAt(ledgerValue["fixtures"]);
    const fixturesById = new Map<string, JsonObject>();
    for (const fixture of fixtureRows) {
      if (typeof fixture["id"] === "string") {
        fixturesById.set(fixture["id"], fixture);
      }
    }
    acceptedE0Materialization = {
      ledger: ledgerValue,
      sharedBases: isObject(ledgerValue["sharedBases"])
        ? ledgerValue["sharedBases"]
        : {},
      fixturesById,
      loadedFiles,
    };
  } catch {
    addFinding(
      findings,
      "BRIDGE_ACCEPTED_E0_LITERAL_AUTHORITY",
      ACCEPTED_E0_INPUT_LEDGER_PATH,
      "The exact accepted E0 v1 input ledger and referenced JSON authorities must be readable and byte-pinned before bridge literals resolve.",
    );
  }

  const contract = loaded.get("a0-e0-bridge-contract.json") ?? {};
  requireExact(
    contract["operationNames"],
    A0_E0_BRIDGE_OWNER_OPERATION_NAMES,
    "BRIDGE_OPERATION_NAMES",
    "a0-e0-bridge-contract.json.operationNames",
    "The owner boundary must expose exactly five operations in contract order.",
    findings,
  );
  if (
    contract["package"] !== "A0 interchange owner ports" ||
    contract["owner"] !== "A0" ||
    contract["ownerLeaf"] !== "jcpe-94yu.1" ||
    contract["activeLeafScope"] !== "A0-owner-only" ||
    contract["contractModule"] !==
      "src/application/application-interchange-owner-contract.ts" ||
    contract["browserProofClaim"] !== false ||
    contract["humanAcceptanceClaim"] !== false ||
    contract["prospectiveConsumer"] !== "E0-v2" ||
    contract["semanticBindingLeaf"] !==
      "jcpe-milestone-reliable-studio-l3a.8.4" ||
    contract["semanticBindingStatus"] !==
      "unbound-pending-explicit-project-owner-acceptance" ||
    contract["productionImplementationAvailableWhenAuthored"] !== false ||
    contract["productionOutputUsedAsOracle"] !== false ||
    contract["expectedValuesGenerated"] !== false
  ) {
    addFinding(
      findings,
      "BRIDGE_BOUNDARY_CLAIM",
      "a0-e0-bridge-contract.json",
      "The packet must remain an unbound A0-only proposal for a separately accepted E0 v2 and claim no production or generated oracle.",
    );
  }

  const ports = isObject(contract["ports"]) ? contract["ports"] : {};
  requireExact(
    Object.keys(ports),
    A0_E0_BRIDGE_OWNER_OPERATION_NAMES,
    "BRIDGE_PORT_KEYS",
    "a0-e0-bridge-contract.json.ports",
    "The exact five operation records must be present in declaration order.",
    findings,
  );
  for (const operation of A0_E0_BRIDGE_OWNER_OPERATION_NAMES) {
    const port = isObject(ports[operation]) ? ports[operation] : {};
    if (port["synchronous"] !== true || typeof port["authority"] !== "string") {
      addFinding(
        findings,
        "BRIDGE_PORT_SYNCHRONOUS",
        `a0-e0-bridge-contract.json.ports.${operation}`,
        "Each owner operation is synchronous and names its controller authority.",
      );
    }
    if (
      operation === "discardImportReplacementPublication"
        ? port["consumerReturn"] !==
            "DiscardImportReplacementPublicationResult" ||
          port["typedProducerRefusal"] !== false ||
          port["consumerRawResultRequiresValidation"] !== false
        : port["consumerReturn"] !== "unknown" ||
          port["consumerRawResultRequiresValidation"] !== true ||
          port["typedProducerRefusal"] !==
            (operation !== "readCurrentApplicationDocumentIdentity")
    ) {
      addFinding(
        findings,
        "BRIDGE_PORT_RETURN",
        `a0-e0-bridge-contract.json.ports.${operation}`,
        "Typed producer refusals and raw-result validation are distinct; only total cleanup returns its exact typed result.",
      );
    }
  }
  if (
    sha256(new TextEncoder().encode(stableJson(ports))) !==
    OWNER_PORT_RECORDS_DIGEST
  ) {
    addFinding(
      findings,
      "BRIDGE_PORT_RECORDS",
      "a0-e0-bridge-contract.json.ports",
      "All five port timing, producer, consumer-validation, return, and authority fields are exactly pinned.",
    );
  }

  requireExact(
    contract["sourceOriginMapping"],
    {
      "canonical-json-v2": "canonical-import",
      "unversioned-legacy-json": "legacy-import",
      "chart-text-v1": "canonical-import",
    },
    "BRIDGE_SOURCE_ORIGIN_MAPPING",
    "a0-e0-bridge-contract.json.sourceOriginMapping",
    "Every accepted import source format has one exact owner replacement origin.",
    findings,
  );
  requireExact(
    contract["aggregateInterfaces"],
    {
      producer: {
        name: "A0E0InterchangeOwnerOperations",
        memberTypeSuffix: "Operation",
        returnsExactTypedResults: true,
      },
      consumer: {
        name: "A0E0InterchangeOwnerPorts",
        memberTypeSuffix: "Port",
        fallibleResultsAreUnknown: true,
        cleanupUsesExactProducerResult: true,
      },
      bindingDirection:
        "producer-operations-structurally-assignable-to-consumer-ports",
      consumerReceivesOnlyNarrowedUntrustedPorts: true,
    },
    "BRIDGE_AGGREGATE_INTERFACES",
    "a0-e0-bridge-contract.json.aggregateInterfaces",
    "Exact typed producer operations must narrow one-way to untrusted consumer ports.",
    findings,
  );
  requireExact(
    contract["requestAuthorityBoundary"],
    {
      currentStateComesFromControllerClosure: true,
      candidateDocumentIdComparedWithCurrentTransition: true,
      candidateStructurallyAndSemanticallyValidated: true,
      disclosedImpactRecomputedFromCurrentState: true,
      confirmationFieldsCheckedForInternalConsistency: true,
      exactPreviewProjectionProvedByOwner: false,
      candidateBytesUserConfirmedProvedByOwner: false,
      commandSeedUserConfirmedProvedByOwner: false,
      confirmationAcknowledgementProvenanceProvedByOwner: false,
      deferredBindingLeaf: "jcpe-milestone-reliable-studio-l3a.8.4",
    },
    "BRIDGE_REQUEST_AUTHORITY_BOUNDARY",
    "a0-e0-bridge-contract.json.requestAuthorityBoundary",
    "The owner may prove current-state self-consistency but must defer preview and consent provenance to the versioned consumer binding.",
    findings,
  );
  requireExact(
    contract["replacementPreparationValidation"],
    {
      recursivelyExactOwnerEnvelopeKeys: true,
      commandIdMaximumCodePoints: 128,
      commandLabelMaximumCodePoints: 160,
      confirmationIdMaximumCodePoints: 128,
      boundedTokensRequireNonemptyTrim: true,
      boundedTokensRequireUnicodeScalars: true,
      logicalTimeRequiresNonnegativeSafeInteger: true,
      logicalTimeMustNotPrecedeLatestUndoEntry: true,
      malformedPresentConfirmationCode: "import.confirmation_identity_mismatch",
      missingConfirmationCode: "history.nonundoable_confirmation_required",
    },
    "BRIDGE_PREPARATION_VALIDATION_POLICY",
    "a0-e0-bridge-contract.json.replacementPreparationValidation",
    "Preparation envelope, token, confirmation, and monotonic logical-time validation must remain exact.",
    findings,
  );

  const publicationMerge = isObject(contract["replacementPublicationMerge"])
    ? contract["replacementPublicationMerge"]
    : {};
  requireExact(
    publicationMerge,
    {
      latestStateRecheckedAtPublication: true,
      frozenPrepareTimeWholeStateInstallAllowed: false,
      preparedCommandInputsRechecked: [
        "documentIdentity",
        "revision",
        "pendingRequestsBefore",
        "transitionIdentity",
        "bookmarks",
      ],
      historyStabilityDerivedFromRevisionAndImmutableReducerLaw: true,
      sameRevisionPendingRequestsDriftOutcome:
        "consume-and-refuse-import.replacement_preparation_stale",
      sameRevisionTransitionDriftOutcome:
        "consume-and-refuse-import.replacement_preparation_stale",
      sameRevisionBookmarkDriftOutcome:
        "consume-and-refuse-import.replacement_preparation_stale",
      latestTransportGenerationMustNotExceedRetiredGeneration: true,
      uncoveredLatestTransportOutcome:
        "consume-and-refuse-import.replacement_retirement_mismatch",
      latestSequenceMustBeLessThan: Number.MAX_SAFE_INTEGER,
      exhaustedLatestSequenceOutcome:
        "consume-and-refuse-import.replacement_preparation_stale",
      preservedFromLatestStateByValue: ["exportRevision"],
      preservedFromLatestStateByReference: [
        "recovery",
        "panels",
        "dialogs",
        "transport",
      ],
      replacementOwnedFields: [
        "document",
        "revision",
        "history",
        "bookmarks",
        "quickEntry",
        "importDraft",
        "pendingRequests",
        "documentTransition",
        "notices",
      ],
      allocatedFromLatestSequenceAtPublication: [
        "focusRequest",
        "nextSequence",
      ],
      allAppStateFieldsPartitionedExactlyOnce: true,
      optionalWarningNoticeUsesNextSequenceAndSaturatesAtMaximum: true,
      rerunsPreparationWork: false,
    },
    "BRIDGE_PUBLICATION_MERGE_POLICY",
    "a0-e0-bridge-contract.json.replacementPublicationMerge",
    "Replacement publication must merge onto latest same-revision state under the exact complete field partition.",
    findings,
  );
  const partitionedAppStateFields = [
    ...stringsAt(publicationMerge["preservedFromLatestStateByValue"]),
    ...stringsAt(publicationMerge["preservedFromLatestStateByReference"]),
    ...stringsAt(publicationMerge["replacementOwnedFields"]),
    ...stringsAt(publicationMerge["allocatedFromLatestSequenceAtPublication"]),
  ];
  if (
    new Set(partitionedAppStateFields).size !== 16 ||
    stableJson([...partitionedAppStateFields].sort(codeUnitCompare)) !==
      stableJson(
        [
          "document",
          "revision",
          "exportRevision",
          "recovery",
          "history",
          "bookmarks",
          "panels",
          "dialogs",
          "quickEntry",
          "importDraft",
          "transport",
          "pendingRequests",
          "documentTransition",
          "focusRequest",
          "notices",
          "nextSequence",
        ].sort(codeUnitCompare),
      )
  ) {
    addFinding(
      findings,
      "BRIDGE_PUBLICATION_MERGE_PARTITION",
      "a0-e0-bridge-contract.json.replacementPublicationMerge",
      "The four publication ownership sets must partition all sixteen AppState fields exactly once.",
    );
  }
  requireExact(
    contract["lawIds"],
    OWNER_LAW_IDS,
    "BRIDGE_OWNER_LAW_IDS",
    "a0-e0-bridge-contract.json.lawIds",
    "The root packet must expose the exact source owner-law inventory in order.",
    findings,
  );

  const registry = isObject(contract["replacementRegistry"])
    ? contract["replacementRegistry"]
    : {};
  requireExact(
    registry,
    {
      keyFields: ["requestId", "documentId", "baseRevision"],
      maximumLiveEntries: 1,
      states: ["empty", "prepared"],
      allocateOnlyAfterAllFallibleChecks: true,
      discardUsesOriginalRequestIdentity: true,
      discardIsTotalSynchronousIdempotentNonthrowing: true,
      previewCancellation: {
        occursBeforePrepare: true,
        ownerCallCount: 0,
        liveRegistryEntriesCreated: 0,
        mayInterleaveAfterPrepare: false,
      },
      postPrepareCleanupReasons: [...DISCARD_REASONS],
      publishConsumesBeforeReturning: true,
      replayAndStructuralLookalikeRefused: true,
      terminalLiveForRequest: 0,
    },
    "BRIDGE_REGISTRY",
    "a0-e0-bridge-contract.json.replacementRegistry",
    "The private replacement registry lifecycle changed.",
    findings,
  );

  const markerCas = isObject(contract["markerCas"])
    ? contract["markerCas"]
    : {};
  requireExact(
    markerCas["orderedSteps"],
    [
      "validate-publication-envelope",
      "read-controller-current-state",
      "compare-document-id-and-revision",
      "if-exportRevision-already-equals-publication-revision-return-state-free-success-without-install-or-notify",
      "otherwise-replace-exportRevision-only",
      "otherwise-install-current-state",
      "otherwise-notify-after-install",
    ],
    "BRIDGE_MARKER_ORDER",
    "a0-e0-bridge-contract.json.markerCas.orderedSteps",
    "The atomic marker critical-section order changed.",
    findings,
  );
  if (
    markerCas["awaitBetweenCompareAndWriteAllowed"] !== false ||
    markerCas["historicalStateSpreadAllowed"] !== false ||
    markerCas["successAndRefusalAreStateFree"] !== true ||
    markerCas["preservedFieldsUseReferenceIdentity"] !== true ||
    !jsonDeepEqual(markerCas["preservedFields"], MARKER_PRESERVED_FIELDS) ||
    !jsonDeepEqual(markerCas["exactReplay"], {
      result: "state-free-success",
      stateInstallCount: 0,
      listenerNotificationCount: 0,
      requiredEvent: "observe.marker-already-equal",
      wholeStateReferencePreserved: true,
    })
  ) {
    addFinding(
      findings,
      "BRIDGE_MARKER_LAWS",
      "a0-e0-bridge-contract.json.markerCas",
      "Marker CAS must be state-free, await-free, historical-spread-free, and preserve all fifteen unrelated fields.",
    );
  }
  requireExact(
    contract["coverageFamilies"],
    COVERAGE_FAMILIES,
    "BRIDGE_COVERAGE_FAMILIES",
    "a0-e0-bridge-contract.json.coverageFamilies",
    "Every required bridge proof family must stay explicit.",
    findings,
  );

  const latestIdentity = isObject(contract["latestIdentity"])
    ? contract["latestIdentity"]
    : {};
  requireExact(
    latestIdentity,
    {
      fields: ["documentId", "revision"],
      source: "controller-closure-current-AppState-at-call-time",
      promiseAllowed: false,
      callerSnapshotAllowed: false,
      selectorCacheAllowed: false,
    },
    "BRIDGE_LATEST_IDENTITY",
    "a0-e0-bridge-contract.json.latestIdentity",
    "Latest identity must be an exact synchronous call-time controller read.",
    findings,
  );

  requireExact(
    contract["ownerStateIsolationAndVersionBoundary"],
    {
      AppStateAllowedInOwnerRequest: false,
      AppStateAllowedInOwnerResult: false,
      stateFieldAllowedInOwnerResult: false,
      observedBeforeFieldAllowedAcrossOwnerPort: false,
      publicAsyncE0ResultPolicySpecifiedByThisLeaf: false,
      acceptedE0V1PublicAsyncResultsContainAppState: true,
      acceptedE0V1PublicationProtocolFailureContainsLastKnownState: true,
    },
    "BRIDGE_STATE_ISOLATION",
    "a0-e0-bridge-contract.json.ownerStateIsolationAndVersionBoundary",
    "The owner boundary is state-free without rewriting accepted E0 v1's state-bearing public results.",
    findings,
  );

  const versionBoundary = isObject(contract["acceptedE0V1VersionBoundary"])
    ? contract["acceptedE0V1VersionBoundary"]
    : {};
  if (
    versionBoundary["acceptedVersion"] !== "E0-v1" ||
    versionBoundary["acceptedCommit"] !==
      "a91b5bc5e70c2bf40dff97211d3c0f4ba63f58fd" ||
    versionBoundary["acceptanceRecord"] !==
      "docs/evidence/E0_GOLDEN_PACKET_REVIEW.md" ||
    versionBoundary["archivalAuthorityStatus"] !==
      "immutable-accepted-by-project-owner" ||
    versionBoundary["bridgeMayReinterpret"] !== false ||
    versionBoundary["bridgeMaySupersede"] !== false ||
    versionBoundary["bridgeMayAmend"] !== false ||
    versionBoundary["semanticCompatibilityClaim"] !== false ||
    versionBoundary["semanticBindingLeaf"] !==
      "jcpe-milestone-reliable-studio-l3a.8.4" ||
    versionBoundary["semanticBindingRequiresExplicitProjectOwnerAcceptance"] !==
      true
  ) {
    addFinding(
      findings,
      "BRIDGE_E0_V1_VERSION_BOUNDARY",
      "a0-e0-bridge-contract.json.acceptedE0V1VersionBoundary",
      "Accepted E0 v1 must remain immutable archival authority with no reinterpretation, supersession, amendment, or compatibility claim.",
    );
  }
  requireExact(
    versionBoundary["immutableAuthorityClasses"],
    [
      "documentation",
      "source",
      "validator",
      "tests",
      "support",
      "fixtures",
      "review",
    ],
    "BRIDGE_E0_V1_AUTHORITY_CLASSES",
    "a0-e0-bridge-contract.json.acceptedE0V1VersionBoundary.immutableAuthorityClasses",
    "All seven accepted E0 v1 authority classes must remain explicit.",
    findings,
  );
  requireExact(
    versionBoundary["immutableArtifactPins"],
    ACCEPTED_E0_V1_ARTIFACT_PINS,
    "BRIDGE_E0_V1_ARTIFACT_PINS",
    "a0-e0-bridge-contract.json.acceptedE0V1VersionBoundary.immutableArtifactPins",
    "The seven accepted E0 v1 non-fixture artifacts must remain exactly pinned.",
    findings,
  );

  const conflicts = recordsAt(contract["acceptedE0V1ConflictInventory"]);
  requireExact(
    conflicts.map((conflict) => conflict["id"]),
    ACCEPTED_E0_V1_CONFLICT_IDS,
    "BRIDGE_E0_V1_CONFLICT_INVENTORY",
    "a0-e0-bridge-contract.json.acceptedE0V1ConflictInventory",
    "The complete eleven-item unresolved E0 v1 semantic conflict inventory is mandatory.",
    findings,
  );
  for (const conflict of conflicts) {
    if (conflict["status"] !== "unresolved-versioned-semantic-delta") {
      addFinding(
        findings,
        "BRIDGE_E0_V1_CONFLICT_STATUS",
        `a0-e0-bridge-contract.json.acceptedE0V1ConflictInventory.${String(conflict["id"])}`,
        "Every conflict remains unresolved until the separately accepted E0 v2 amendment.",
      );
    }
  }
  if (
    sha256(new TextEncoder().encode(stableJson(conflicts))) !==
    ACCEPTED_E0_V1_CONFLICT_INVENTORY_DIGEST
  ) {
    addFinding(
      findings,
      "BRIDGE_E0_V1_CONFLICT_DETAIL",
      "a0-e0-bridge-contract.json.acceptedE0V1ConflictInventory",
      "Every accepted-v1 and proposed-owner field, type, refusal, count, and unresolved disposition in the eleven-item inventory is pinned.",
    );
  }

  requireExact(
    contract["proofRequirements"],
    {
      exactSourceOriginMappingRequired: true,
      typedProducerAndConsumerAggregatesRequired: true,
      producerOperationsMustBeAssignableToConsumerPorts: true,
      exactMarkerReplayNoOpBranchRequired: true,
      ownerMustNotClaimExactPreviewOrConsentProvenance: true,
      markerPreservedFieldReferenceIdentityRequired: true,
      latestStateReplacementPublicationMergeRequired: true,
      frozenPrepareTimeWholeStateInstallForbidden: true,
      recursiveExactOwnerEnvelopeKeysRequired: true,
      exactPendingRequestsTransitionBookmarkSequenceAndTransportPublicationRechecksRequired: true,
      literalBeforeRequestResultAfter: true,
      fullStateReferencesMustResolveToValidatedLiterals: true,
      computedBeforeAfterDiffMustEqualDeclaredExactDelta: true,
      exactRegistryTransitionSequenceRequired: true,
      preparedRegistryMustContainCompletePrecomputedPublicationMaterial: true,
      literalEventOrderRequired: true,
      completeExactWorkCountersRequired: true,
      baseTransposedAndInverseHashesRequired: true,
      manualAndFrozenPitchBytesRequired: true,
      literalMutationBaselineAndChangedObservationsRequired: true,
      mutationTargetAndDerivedObservationMustBeDistinct: true,
      mutationObservationMustBeIndependentlyRecomputed: true,
      mutationKillerFixtureMayServeAsItsOwnOracle: false,
      forwardE0V2BehaviorRowsPresent: false,
      futureE0V2BehaviorDeferredTo: "jcpe-milestone-reliable-studio-l3a.8.4",
      proseOrBareIdsAreProof: false,
    },
    "BRIDGE_PROOF_REQUIREMENTS",
    "a0-e0-bridge-contract.json.proofRequirements",
    "Literal proof requirements must remain complete and reject prose substitutes.",
    findings,
  );

  const cases = loaded.get("owner-port-cases.json") ?? {};
  requireExact(
    cases["materializationPolicy"],
    {
      version: 1,
      referenceResolutionOrder: [
        "verify source path sha256 before parse",
        "resolve RFC-6901 jsonPointer",
        "resolve accepted E0 sharedBase and fixtureId recursively",
        "apply accepted orderedMutations with exact from assertions",
        "resolve $literalRef recursively before patch assertion or application",
        "materialize $specialNumber only in the named typed in-memory harness",
        "materialize $utf16CodeUnits only in the named typed in-memory harness and require integer code units from 0 through 65535",
        "apply materializationPatches and run patches in listed order",
        "validate the complete materialized value against materializeAs",
      ],
      patchObject: {
        required: ["op", "jsonPointer"],
        replace: ["op", "jsonPointer", "from", "to", "value"],
        append: ["op", "jsonPointer", "value"],
        assert: ["op", "jsonPointer", "value"],
        remove: ["op", "jsonPointer", "from"],
        fromAndToAreProofAssertions: true,
        valueIsAppliedReplacement: true,
        fromCountAssertsArrayLength: true,
        add: ["op", "jsonPointer", "from", "to", "value"],
        addRequiresAbsentSentinel: true,
      },
      patchOperators: ["assert", "add", "replace", "append", "remove"],
      canonicalHashProjection:
        "recursively sort object keys, JSON.stringify, then UTF-8",
      duplicateKeys: "refused",
      unresolvedReference: "fixture-failure",
      patchAssertionMismatch: "fixture-failure",
      nearMissChangeCountMismatch: "fixture-failure",
      inverseProof: {
        patchOrder: "listed inverseMaterializationPatches order",
        canonicalProjection:
          "recursively sort object keys, JSON.stringify, then UTF-8",
        equality:
          "hash, byte length, and deep value must equal the named source literal canonical projection",
      },
    },
    "BRIDGE_MATERIALIZATION_POLICY",
    "owner-port-cases.json.materializationPolicy",
    "Literal, strict-number, UTF-16-code-unit, patch, and inverse materialization rules must remain exact.",
    findings,
  );
  const replacementCases = recordsAt(cases["replacementCases"]);
  const identityCases = recordsAt(cases["identityCases"]);
  const markerCases = recordsAt(cases["markerCases"]);
  const applicabilityRows = recordsAt(cases["applicabilityMatrix"]);
  const allCases = [...replacementCases, ...identityCases, ...markerCases];
  const caseById = indexById(allCases, "owner-port-cases", findings);

  const controlsRoot = loaded.get("mutation-controls.json") ?? {};
  const controls = recordsAt(controlsRoot["controls"]);
  const controlById = indexById(controls, "mutation-controls", findings);
  const traceRoot = loaded.get("trace-ledger.json") ?? {};
  const traces = recordsAt(traceRoot["traces"]);
  const traceById = indexById(traces, "trace-ledger", findings);
  const provenance = loaded.get("provenance-ledger.json") ?? {};
  const authorities = recordsAt(provenance["authorities"]);
  const authorityById = indexById(authorities, "provenance-ledger", findings);

  const literalCatalog = isObject(cases["literalCatalog"])
    ? cases["literalCatalog"]
    : {};
  const materializedCatalog = new Map<string, unknown>();
  const literalContext: BridgeLiteralContext = {
    catalog: literalCatalog,
    acceptedE0: acceptedE0Materialization,
    cache: materializedCatalog,
  };
  const inspectUtf16Sentinels = (
    value: unknown,
    filename: string,
    path: string,
  ): void => {
    if (Array.isArray(value)) {
      value.forEach((child, index) => {
        inspectUtf16Sentinels(child, filename, `${path}/${String(index)}`);
      });
      return;
    }
    if (!isObject(value)) return;
    if (Object.hasOwn(value, "$utf16CodeUnits")) {
      const allowedOwnerPath =
        filename === "owner-port-cases.json" &&
        (/\/rawCall\/arguments\/\d+\/patches\/\d+\/(?:from|to|value)$/u.test(
          path,
        ) ||
          /\/oneFieldNearMiss\/(?:from|to)$/u.test(path) ||
          path.startsWith("/literalCatalog/"));
      const allowedControlPath =
        filename === "mutation-controls.json" &&
        /\/controls\/\d+\/mutation\/(?:from|to)$/u.test(path);
      if (!allowedOwnerPath && !allowedControlPath) {
        addFinding(
          findings,
          "BRIDGE_UTF16_SENTINEL_SCOPE",
          `${filename}${path}`,
          "The strict-JSON UTF-16 code-unit sentinel is allowed only in fields explicitly materialized by the typed in-memory fixture harness.",
        );
      }
    }
    for (const [key, child] of Object.entries(value)) {
      inspectUtf16Sentinels(child, filename, `${path}/${key}`);
    }
  };
  for (const filename of A0_E0_BRIDGE_SPEC_FILES) {
    inspectUtf16Sentinels(loaded.get(filename), filename, "");
  }
  type DocumentValidationObservation = Readonly<{
    stage:
      "accepted" | "f2-refused" | "f2-repaired" | "f3-refused" | "f3-repaired";
    code: string | null;
  }>;
  const documentValidationCache = new Map<
    string,
    DocumentValidationObservation
  >();
  const acceptedE0DocumentObjects = new WeakSet();
  const realValidatedDocumentObjects = new WeakSet();
  let f2DocumentValidationCalls = 0;
  let f3DocumentValidationCalls = 0;
  let expectedAcceptedDocumentOccurrences = 0;
  let acceptedE0AuthorityDocumentOccurrences = 0;
  const observeDocumentValidation = (
    document: unknown,
  ): DocumentValidationObservation => {
    expectedAcceptedDocumentOccurrences += 1;
    if (isObject(document) && acceptedE0DocumentObjects.has(document)) {
      acceptedE0AuthorityDocumentOccurrences += 1;
      return { stage: "accepted", code: null };
    }
    if (isObject(document) && realValidatedDocumentObjects.has(document)) {
      return { stage: "accepted", code: null };
    }
    const canonical = stableJson(document);
    const cached = documentValidationCache.get(canonical);
    if (cached !== undefined) {
      if (cached.stage === "accepted" && isObject(document)) {
        realValidatedDocumentObjects.add(document);
      }
      return cached;
    }
    f2DocumentValidationCalls += 1;
    const decoded = decodeDocumentShape(document);
    if (!decoded.ok) {
      const observation: DocumentValidationObservation = {
        stage: "f2-refused",
        code: decoded.errors[0].code,
      };
      documentValidationCache.set(canonical, observation);
      return observation;
    }
    if (!jsonDeepEqual(decoded.value, document)) {
      const observation: DocumentValidationObservation = {
        stage: "f2-repaired",
        code: null,
      };
      documentValidationCache.set(canonical, observation);
      return observation;
    }
    f3DocumentValidationCalls += 1;
    const validated = validateDocumentSemantics(decoded.value);
    if (!validated.ok) {
      const observation: DocumentValidationObservation = {
        stage: "f3-refused",
        code: validated.errors[0].code,
      };
      documentValidationCache.set(canonical, observation);
      return observation;
    }
    if (!jsonDeepEqual(validated.value, document)) {
      const observation: DocumentValidationObservation = {
        stage: "f3-repaired",
        code: null,
      };
      documentValidationCache.set(canonical, observation);
      return observation;
    }
    const observation: DocumentValidationObservation = {
      stage: "accepted",
      code: null,
    };
    documentValidationCache.set(canonical, observation);
    if (isObject(document)) realValidatedDocumentObjects.add(document);
    return observation;
  };
  const assertAcceptedDocument = (document: unknown, path: string): void => {
    const observation = observeDocumentValidation(document);
    if (observation.stage !== "accepted") {
      throw new Error(
        `BRIDGE_DOCUMENT_${observation.stage.toUpperCase()}:${observation.code ?? "none"}:${path}`,
      );
    }
  };
  const assertNestedAcceptedDocuments = (
    value: unknown,
    path: string,
  ): void => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        assertNestedAcceptedDocuments(item, `${path}/${String(index)}`);
      });
      return;
    }
    if (!isObject(value)) return;
    if (value["schema"] === "changes.progression.v2") {
      assertAcceptedDocument(value, path);
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      assertNestedAcceptedDocuments(child, `${path}/${key}`);
    }
  };
  const markAcceptedE0Documents = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(markAcceptedE0Documents);
      return;
    }
    if (!isObject(value)) return;
    if (value["schema"] === "changes.progression.v2") {
      acceptedE0DocumentObjects.add(value);
      return;
    }
    Object.values(value).forEach(markAcceptedE0Documents);
  };
  for (const [literalId, entryValue] of Object.entries(literalCatalog)) {
    if (!isObject(entryValue)) {
      addFinding(
        findings,
        "BRIDGE_LITERAL_ENTRY",
        `owner-port-cases.json.literalCatalog.${literalId}`,
        "Every catalog entry must be a typed inline literal or an exact accepted-E0-v1 reference.",
      );
      continue;
    }
    try {
      const materialized = materializeBridgeLiteral(literalId, literalContext);
      materializedCatalog.set(literalId, materialized);
      const materializeAs = entryValue["materializeAs"];
      if (typeof materializeAs !== "string" || materializeAs.length === 0) {
        throw new Error("BRIDGE_LITERAL_MATERIALIZE_AS");
      }
      if (
        materializeAs === "AppState" &&
        !isFullAppStateLiteral(materialized)
      ) {
        throw new Error("BRIDGE_LITERAL_APP_STATE");
      }
      if (
        materializeAs === "ValidatedDocument" &&
        !isCompleteDocumentLiteral(materialized)
      ) {
        throw new Error("BRIDGE_LITERAL_DOCUMENT");
      }
      if (
        entryValue["kind"] === "accepted-e0-v1-reference" &&
        recordsAt(entryValue["materializationPatches"]).length === 0
      ) {
        markAcceptedE0Documents(materialized);
      }
      if (
        materializeAs === "AppState" ||
        materializeAs === "ValidatedDocument"
      ) {
        assertNestedAcceptedDocuments(
          materialized,
          `literalCatalog/${literalId}`,
        );
      }
      if (materializeAs === "PrivateImportReplacementRegistry") {
        const registryLiteral = isObject(materialized) ? materialized : {};
        const entries = registryLiteral["entries"];
        if (
          registryLiteral["capacity"] !== 1 ||
          !Array.isArray(entries) ||
          entries.length > 1 ||
          entries.some(
            (item) =>
              !isObject(item) ||
              !isObject(item["key"]) ||
              typeof item["key"]["requestId"] !== "number" ||
              typeof item["key"]["documentId"] !== "string" ||
              typeof item["key"]["baseRevision"] !== "number",
          )
        ) {
          throw new Error("BRIDGE_LITERAL_REGISTRY");
        }
      }
      const canonicalBytes = new TextEncoder().encode(stableJson(materialized));
      if (
        Object.hasOwn(entryValue, "expectedCanonicalMaterializedSha256") &&
        entryValue["expectedCanonicalMaterializedSha256"] !==
          sha256(canonicalBytes)
      ) {
        throw new Error("BRIDGE_LITERAL_CANONICAL_SHA");
      }
      if (
        Object.hasOwn(entryValue, "expectedCanonicalMaterializedByteLength") &&
        entryValue["expectedCanonicalMaterializedByteLength"] !==
          canonicalBytes.byteLength
      ) {
        throw new Error("BRIDGE_LITERAL_CANONICAL_LENGTH");
      }
    } catch (error) {
      addFinding(
        findings,
        "BRIDGE_LITERAL_MATERIALIZATION",
        `owner-port-cases.json.literalCatalog.${literalId}`,
        `Literal must resolve deterministically from exact checked-in bytes and validate as its declared type (${error instanceof Error ? error.message : "unknown"}).`,
      );
    }
  }

  try {
    const validDriftBase = materializedCatalog.get("state-retiring-retained");
    if (!isFullAppStateLiteral(validDriftBase)) {
      throw new Error("BRIDGE_APP_STATE_TAMPER_BASE");
    }
    const invalidDriftProbes = [
      {
        pointer: "/pendingRequests/0/status",
        from: "running",
        to: "completed",
      },
      {
        pointer: "/documentTransition/kind",
        from: "retiring-transport",
        to: "retired",
      },
    ] as const;
    for (const probe of invalidDriftProbes) {
      const tampered = applyPointerMutation(
        validDriftBase,
        "replace",
        probe.pointer,
        probe.from,
        probe.to,
      );
      if (
        !hasAppStateTopLevelShape(tampered) ||
        !jsonDeepEqual(jsonDiffPointers(validDriftBase, tampered), [
          probe.pointer,
        ]) ||
        isFullAppStateLiteral(tampered)
      ) {
        throw new Error(`BRIDGE_APP_STATE_TAMPER_ACCEPTED:${probe.pointer}`);
      }
    }
  } catch (error) {
    addFinding(
      findings,
      "BRIDGE_APP_STATE_VALIDATOR_TAMPER",
      "owner-port-cases.json.literalCatalog.state-retiring-retained",
      `The independent complete AppState validator must reject one-field invalid same-revision request-status and transition-kind drift while preserving the full state shape (${error instanceof Error ? error.message : "unknown"}).`,
    );
  }

  const transpositionWitness = isObject(cases["transpositionWitness"])
    ? cases["transpositionWitness"]
    : {};
  const sourceWitness = isObject(transpositionWitness["source"])
    ? transpositionWitness["source"]
    : {};
  const targetWitness = isObject(transpositionWitness["target"])
    ? transpositionWitness["target"]
    : {};
  const pitchText = (value: unknown): string | null => {
    if (!isObject(value)) return null;
    const step = value["step"];
    const alter = value["alter"];
    const octave = value["octave"];
    if (
      typeof step !== "string" ||
      typeof alter !== "number" ||
      typeof octave !== "number"
    ) {
      return null;
    }
    const accidental =
      alter === -2
        ? "bb"
        : alter === -1
          ? "b"
          : alter === 0
            ? ""
            : alter === 1
              ? "#"
              : alter === 2
                ? "##"
                : null;
    return accidental === null ? null : `${step}${accidental}${String(octave)}`;
  };
  const collectVoicingWitness = (document: unknown) => {
    const sourceTexts: string[] = [];
    const manualPitches: string[] = [];
    const frozenPitches: string[] = [];
    if (!isObject(document))
      return { sourceTexts, manualPitches, frozenPitches };
    for (const section of recordsAt(document["sections"])) {
      for (const measure of recordsAt(section["measures"])) {
        for (const event of recordsAt(measure["events"])) {
          const voicing = isObject(event["voicing"]) ? event["voicing"] : {};
          if (voicing["mode"] !== "manual" && voicing["mode"] !== "frozen") {
            continue;
          }
          const chord = isObject(event["chord"]) ? event["chord"] : {};
          if (typeof chord["sourceText"] === "string") {
            sourceTexts.push(chord["sourceText"]);
          }
          const target =
            voicing["mode"] === "manual" ? manualPitches : frozenPitches;
          for (const pitch of recordsAt(voicing["pitches"])) {
            const rendered = pitchText(pitch);
            if (rendered !== null) target.push(rendered);
          }
        }
      }
    }
    return { sourceTexts, manualPitches, frozenPitches };
  };
  try {
    const sourceId = sourceWitness["literalId"];
    const targetId = targetWitness["literalId"];
    if (typeof sourceId !== "string" || typeof targetId !== "string") {
      throw new Error("BRIDGE_TRANSPOSITION_LITERAL_IDS");
    }
    const sourceDocument = materializedCatalog.get(sourceId);
    const targetDocument = materializedCatalog.get(targetId);
    if (
      !isCompleteDocumentLiteral(sourceDocument) ||
      !isCompleteDocumentLiteral(targetDocument)
    ) {
      throw new Error("BRIDGE_TRANSPOSITION_DOCUMENTS");
    }
    const sourceCollected = collectVoicingWitness(sourceDocument);
    const targetCollected = collectVoicingWitness(targetDocument);
    for (const [label, witness, collected] of [
      ["source", sourceWitness, sourceCollected],
      ["target", targetWitness, targetCollected],
    ] as const) {
      requireExact(
        witness["sourceTexts"],
        collected.sourceTexts,
        "BRIDGE_TRANSPOSITION_SOURCE_TEXTS",
        `owner-port-cases.json.transpositionWitness.${label}.sourceTexts`,
        "Transposition source spellings must be extracted from the materialized document.",
        findings,
      );
      requireExact(
        witness["manualPitches"],
        collected.manualPitches,
        "BRIDGE_TRANSPOSITION_MANUAL_PITCHES",
        `owner-port-cases.json.transpositionWitness.${label}.manualPitches`,
        "Manual pitches must be byte-explicit in the transposition witness.",
        findings,
      );
      requireExact(
        witness["frozenPitches"],
        collected.frozenPitches,
        "BRIDGE_TRANSPOSITION_FROZEN_PITCHES",
        `owner-port-cases.json.transpositionWitness.${label}.frozenPitches`,
        "Frozen pitches must be byte-explicit in the transposition witness.",
        findings,
      );
      const expectedBytes = [
        ...collected.sourceTexts,
        collected.manualPitches.join(","),
        collected.frozenPitches.join(","),
      ].join("\n");
      if (
        witness["exactSpellingBytesUtf8"] !== expectedBytes ||
        witness["exactSpellingBytesSha256"] !==
          sha256(new TextEncoder().encode(expectedBytes))
      ) {
        addFinding(
          findings,
          "BRIDGE_TRANSPOSITION_SPELLING_BYTES",
          `owner-port-cases.json.transpositionWitness.${label}`,
          "Source text plus Manual/Frozen pitch bytes and SHA-256 must match the materialized document exactly.",
        );
      }
    }
    const sourceEntry = literalCatalog[sourceId];
    const targetEntry = literalCatalog[targetId];
    if (!isObject(sourceEntry) || !isObject(targetEntry)) {
      throw new Error("BRIDGE_TRANSPOSITION_CATALOG");
    }
    const sourceBytes = new TextEncoder().encode(stableJson(sourceDocument));
    const targetBytes = new TextEncoder().encode(stableJson(targetDocument));
    if (
      sourceWitness["acceptedPrettyFileSha256"] !== sourceEntry["sha256"] ||
      sourceWitness["canonicalMaterializedSha256"] !== sha256(sourceBytes) ||
      sourceWitness["canonicalMaterializedByteLength"] !==
        sourceBytes.byteLength ||
      sourceEntry["expectedCanonicalMaterializedSha256"] !==
        sha256(sourceBytes) ||
      sourceEntry["expectedCanonicalMaterializedByteLength"] !==
        sourceBytes.byteLength ||
      targetWitness["canonicalMaterializedSha256"] !== sha256(targetBytes) ||
      targetWitness["canonicalMaterializedByteLength"] !==
        targetBytes.byteLength ||
      targetEntry["expectedCanonicalMaterializedSha256"] !==
        sha256(targetBytes) ||
      targetEntry["expectedCanonicalMaterializedByteLength"] !==
        targetBytes.byteLength ||
      stableJson(transpositionWitness["targetMaterializationPatches"]) !==
        stableJson(targetEntry["materializationPatches"])
    ) {
      throw new Error("BRIDGE_TRANSPOSITION_HASHES");
    }
    const computedInverse = reverseReplacementPatches(
      targetDocument,
      targetEntry["materializationPatches"],
      literalContext,
    );
    const declaredInverse = applyBridgePatches(
      targetDocument,
      targetEntry["inverseMaterializationPatches"],
      literalContext,
      targetDocument,
    );
    const inverseBytes = new TextEncoder().encode(stableJson(declaredInverse));
    const inverseWitness = isObject(
      transpositionWitness["inverseTargetToSource"],
    )
      ? transpositionWitness["inverseTargetToSource"]
      : {};
    if (
      stableJson(computedInverse) !== stableJson(sourceDocument) ||
      stableJson(declaredInverse) !== stableJson(sourceDocument) ||
      targetEntry["expectedInverseEqualsLiteralId"] !== sourceId ||
      targetEntry["expectedInverseMaterializedSha256"] !==
        sha256(inverseBytes) ||
      targetEntry["expectedInverseMaterializedByteLength"] !==
        inverseBytes.byteLength ||
      inverseWitness["targetLiteralId"] !== targetId ||
      inverseWitness["inversePatchList"] !==
        `literalCatalog.${targetId}.inverseMaterializationPatches` ||
      inverseWitness["expectedCanonicalMaterializedSha256"] !==
        sha256(inverseBytes) ||
      inverseWitness["expectedCanonicalMaterializedByteLength"] !==
        inverseBytes.byteLength ||
      inverseWitness["expectedEqualsLiteralId"] !== sourceId ||
      inverseWitness["compareHashTo"] !==
        "transpositionWitness.source.canonicalMaterializedSha256" ||
      inverseWitness["compareByteLengthTo"] !==
        "transpositionWitness.source.canonicalMaterializedByteLength"
    ) {
      throw new Error("BRIDGE_TRANSPOSITION_INVERSE");
    }
    requireExact(
      transpositionWitness["ownerDecisionInvariant"],
      {
        prepareSource: "prepared-one-live-entry",
        prepareTarget: "prepared-one-live-entry",
        publishSource: "committed-live-zero",
        publishTarget: "committed-live-zero",
      },
      "BRIDGE_TRANSPOSITION_DECISION",
      "owner-port-cases.json.transpositionWitness.ownerDecisionInvariant",
      "Source and target decisions remain invariant.",
      findings,
    );
  } catch (error) {
    addFinding(
      findings,
      "BRIDGE_TRANSPOSITION_WITNESS",
      "owner-port-cases.json.transpositionWitness",
      `Transposition requires literal documents, hashes, Manual/Frozen bytes, and executable inverse equality (${error instanceof Error ? error.message : "unknown"}).`,
    );
  }

  const runById = new Map<string, MaterializedRunProjection>();
  let a0OwnerProofCaseCount = 0;
  let excludedForwardE0V2CaseCount = 0;
  for (const record of allCases) {
    const caseId = String(record["id"]);
    const expectedE0V2Owned = E0_V2_OWNED_CASE_IDS.has(caseId);
    if (
      record["ownerProof"] !== !expectedE0V2Owned ||
      record["e0V2Owned"] !== expectedE0V2Owned
    ) {
      addFinding(
        findings,
        "BRIDGE_CASE_PROOF_OWNER",
        `owner-port-cases.json.${caseId}`,
        "Every case and run must be A0 owner proof; no normative forward E0-v2 behavior row is present in this packet.",
      );
    }
    if (expectedE0V2Owned) excludedForwardE0V2CaseCount += 1;
    else a0OwnerProofCaseCount += 1;
    const runs = recordsAt(record["runs"]);
    if (runs.length === 0) {
      addFinding(
        findings,
        "BRIDGE_CASE_RUNS",
        `owner-port-cases.json.${caseId}.runs`,
        "Every case must carry at least one literal executable run.",
      );
    }
    for (const run of runs) {
      const runId = run["id"];
      const fullRunId = `${caseId}/${String(runId)}`;
      try {
        const runRole =
          run["runRole"] === undefined ? "conformance" : run["runRole"];
        if (
          typeof runId !== "string" ||
          (runRole !== "conformance" && runRole !== "mutation-killer") ||
          (runRole === "mutation-killer" && expectedE0V2Owned) ||
          run["ownerProof"] !== !expectedE0V2Owned ||
          run["e0V2Owned"] !== expectedE0V2Owned
        ) {
          throw new Error("BRIDGE_RUN_OWNER");
        }
        const before = materializeDescriptor(
          run["controllerStateBefore"],
          literalContext,
        );
        const after = materializeDescriptor(
          run["controllerStateAfter"],
          literalContext,
        );
        if (!isFullAppStateLiteral(before) || !isFullAppStateLiteral(after)) {
          throw new Error("BRIDGE_RUN_APP_STATE");
        }
        const registryBefore = materializeDescriptor(
          run["registryBefore"],
          literalContext,
          before,
        );
        const registryAfter = materializeDescriptor(
          run["registryAfter"],
          literalContext,
          after,
        );
        for (const registryValue of [registryBefore, registryAfter]) {
          if (
            !isObject(registryValue) ||
            registryValue["capacity"] !== 1 ||
            !Array.isArray(registryValue["entries"]) ||
            registryValue["entries"].length > 1
          ) {
            throw new Error("BRIDGE_RUN_REGISTRY");
          }
        }
        const rawCallValue = run["rawCall"];
        if (!isObject(rawCallValue)) throw new Error("BRIDGE_RUN_RAW_CALL");
        const argumentDescriptors = isUnknownArray(rawCallValue["arguments"])
          ? rawCallValue["arguments"]
          : [];
        const rawCall: JsonObject = {
          target: rawCallValue["target"],
          operation: rawCallValue["operation"],
          invocation: rawCallValue["invocation"],
          arguments: argumentDescriptors.map((argument) =>
            materializeDescriptor(argument, literalContext, before),
          ),
        };
        if (
          !expectedE0V2Owned &&
          runRole === "conformance" &&
          record["operation"] === "prepareImportReplacementPublication"
        ) {
          const descriptor = argumentDescriptors[0];
          if (!isObject(descriptor)) {
            throw new Error("BRIDGE_PREPARE_DESCRIPTOR");
          }
          const untrusted =
            descriptor["materializeAs"] ===
            "UntrustedPrepareImportReplacementPublicationRequestEnvelope";
          const payloadKey = Object.hasOwn(descriptor, "literalId")
            ? "literalId"
            : Object.hasOwn(descriptor, "value")
              ? "value"
              : null;
          const expectedDescriptorKeys = [
            payloadKey,
            "materializeAs",
            "patches",
            ...(untrusted ? ["argumentDomain"] : []),
          ].filter((key): key is string => key !== null);
          if (
            payloadKey === null ||
            (Object.hasOwn(descriptor, "literalId") &&
              Object.hasOwn(descriptor, "value")) ||
            stableJson(Object.keys(descriptor).sort(codeUnitCompare)) !==
              stableJson(expectedDescriptorKeys.sort(codeUnitCompare)) ||
            (untrusted
              ? descriptor["argumentDomain"] !== "defensive-untrusted-runtime"
              : descriptor["materializeAs"] !==
                  "PrepareImportReplacementPublicationRequest" ||
                Object.hasOwn(descriptor, "argumentDomain"))
          ) {
            throw new Error("BRIDGE_PREPARE_DESCRIPTOR_DOMAIN");
          }
        }
        if (
          (runRole === "conformance" &&
            rawCall["invocation"] !== "synchronous") ||
          (!expectedE0V2Owned &&
            runRole === "conformance" &&
            (rawCall["target"] !== "A0E0InterchangeOwnerOperations" ||
              rawCall["operation"] !== record["operation"]))
        ) {
          throw new Error("BRIDGE_RUN_CALL_TARGET");
        }
        const exactTypedResult = materializeDescriptor(
          run["exactTypedResult"],
          literalContext,
          after,
        );
        if (
          !expectedE0V2Owned &&
          runRole === "conformance" &&
          containsForbiddenStateKey(exactTypedResult)
        ) {
          throw new Error("BRIDGE_RUN_OWNER_RESULT_STATE");
        }
        const resultRecord = isObject(exactTypedResult) ? exactTypedResult : {};
        if (
          runRole === "conformance" &&
          Object.hasOwn(resultRecord, "liveForRequest") &&
          resultRecord["liveForRequest"] !== 0
        ) {
          throw new Error("BRIDGE_RUN_LIVE_FOR_REQUEST");
        }
        let mutationProbe: JsonObject | null = null;
        if (runRole === "mutation-killer") {
          const rawProbe = run["mutationProbe"];
          if (!isObject(rawProbe)) throw new Error("BRIDGE_RUN_MUTATION_PROBE");
          const downstreamObservation = isObject(
            rawProbe["downstreamObservation"],
          )
            ? rawProbe["downstreamObservation"]
            : null;
          const expectedOwnerLaw = isObject(rawProbe["expectedOwnerLaw"])
            ? rawProbe["expectedOwnerLaw"]
            : null;
          if (
            stableJson(Object.keys(rawProbe).sort(codeUnitCompare)) !==
              stableJson([
                "baselineLaw",
                "baselineRunId",
                "downstreamObservation",
                "expectedOwnerLaw",
                "mutatedLaw",
                "sourceMaterialization",
              ]) ||
            typeof rawProbe["baselineRunId"] !== "string" ||
            typeof rawProbe["sourceMaterialization"] !== "string" ||
            downstreamObservation === null ||
            stableJson(
              Object.keys(downstreamObservation).sort(codeUnitCompare),
            ) !==
              stableJson([
                "baselineValue",
                "jsonPointer",
                "killerValue",
                "materialization",
              ]) ||
            typeof downstreamObservation["materialization"] !== "string" ||
            typeof downstreamObservation["jsonPointer"] !== "string" ||
            expectedOwnerLaw === null ||
            (expectedOwnerLaw["outcome"] !== "pass" &&
              expectedOwnerLaw["outcome"] !== "killed") ||
            (expectedOwnerLaw["outcome"] === "pass"
              ? stableJson(expectedOwnerLaw) !== stableJson({ outcome: "pass" })
              : typeof expectedOwnerLaw["code"] !== "string" ||
                stableJson(
                  Object.keys(expectedOwnerLaw).sort(codeUnitCompare),
                ) !== stableJson(["code", "outcome"]))
          ) {
            throw new Error("BRIDGE_RUN_MUTATION_PROBE_SHAPE");
          }
          mutationProbe = {
            baselineRunId: rawProbe["baselineRunId"],
            sourceMaterialization: rawProbe["sourceMaterialization"],
            baselineLaw: materializeBridgeTemplate(
              rawProbe["baselineLaw"],
              literalContext,
              before,
              new Set(),
            ),
            mutatedLaw: materializeBridgeTemplate(
              rawProbe["mutatedLaw"],
              literalContext,
              before,
              new Set(),
            ),
            downstreamObservation: materializeBridgeTemplate(
              downstreamObservation,
              literalContext,
              before,
              new Set(),
            ),
            expectedOwnerLaw: materializeBridgeTemplate(
              expectedOwnerLaw,
              literalContext,
              before,
              new Set(),
            ),
          };
        } else if (
          run["mutationProbe"] !== undefined &&
          run["mutationProbe"] !== null
        ) {
          throw new Error("BRIDGE_RUN_CONFORMANCE_MUTATION_PROBE");
        }
        for (const [projectionName, projectionValue] of [
          ["controllerStateBefore", before],
          ["controllerStateAfter", after],
          ["registryBefore", registryBefore],
          ["registryAfter", registryAfter],
          ["exactTypedResult", exactTypedResult],
        ] as const) {
          assertNestedAcceptedDocuments(
            projectionValue,
            `${fullRunId}/${projectionName}`,
          );
        }
        const exactCounters = run["exactCounters"];
        if (
          !isObject(exactCounters) ||
          stableJson(Object.keys(exactCounters)) !==
            stableJson(EXPECTED_OWNER_RESULT_COUNTER_KEYS) ||
          Object.values(exactCounters).some(
            (value) => !Number.isSafeInteger(value) || Number(value) < 0,
          )
        ) {
          throw new Error("BRIDGE_RUN_COUNTERS");
        }
        const operation = record["operation"];
        if (
          typeof operation !== "string" ||
          (runRole === "conformance" &&
            exactCounters[operation] !== (expectedE0V2Owned ? 0 : 1))
        ) {
          throw new Error("BRIDGE_RUN_OPERATION_COUNTER");
        }
        if (
          runRole === "conformance" &&
          (expectedE0V2Owned
            ? exactCounters["e0V2ConsumerNormalizer"] !== 1
            : exactCounters["e0V2ConsumerNormalizer"] !== 0)
        ) {
          throw new Error("BRIDGE_RUN_E0_V2_COUNTER");
        }
        const eventOrder = stringsAt(run["synchronousEventOrder"]);
        if (
          eventOrder.length === 0 ||
          eventOrder.length !==
            (Array.isArray(run["synchronousEventOrder"])
              ? run["synchronousEventOrder"].length
              : 0) ||
          eventOrder.some((event) => event.length === 0)
        ) {
          throw new Error("BRIDGE_RUN_EVENT_ORDER");
        }
        const workBound = run["workBound"];
        if (
          !isObject(workBound) ||
          typeof workBound["termination"] !== "string" ||
          (runRole === "conformance" &&
            workBound["wallTimeObservedOrUsed"] !== false) ||
          (runRole === "conformance" &&
            workBound["awaitOrMicrotaskBoundariesInsideOperation"] !== 0) ||
          Object.entries(workBound).some(
            ([key, value]) =>
              key.startsWith("maximum") &&
              (!Number.isSafeInteger(value) || Number(value) < 0),
          )
        ) {
          throw new Error("BRIDGE_RUN_WORK_BOUND");
        }
        const historyEstimatorLawInput =
          run["historyEstimatorLawInput"] === undefined
            ? null
            : materializeBridgeTemplate(
                run["historyEstimatorLawInput"],
                literalContext,
                before,
                new Set(),
              );
        const ownerLawFlagsValue =
          run["ownerLawFlags"] === undefined
            ? DEFAULT_OWNER_LAW_FLAGS
            : materializeBridgeTemplate(
                run["ownerLawFlags"],
                literalContext,
                before,
                new Set(),
              );
        if (
          !isObject(ownerLawFlagsValue) ||
          stableJson(Object.keys(ownerLawFlagsValue).sort(codeUnitCompare)) !==
            stableJson(EXPECTED_OWNER_LAW_FLAG_KEYS) ||
          ownerLawFlagsValue["historicalStateReinstall"] !== false
        ) {
          throw new Error("BRIDGE_RUN_OWNER_LAW_FLAGS");
        }
        const referenceIdentityExpectations =
          run["referenceIdentityExpectations"] === undefined
            ? null
            : materializeBridgeTemplate(
                run["referenceIdentityExpectations"],
                literalContext,
                before,
                new Set(),
              );
        let clonedPreservedReferenceDetected = false;
        if (
          !expectedE0V2Owned &&
          record["operation"] === "publishCanonicalExportRevision"
        ) {
          const expectations = isObject(referenceIdentityExpectations)
            ? referenceIdentityExpectations
            : {};
          const preservedFields = isObject(expectations["preservedFields"])
            ? expectations["preservedFields"]
            : {};
          const expectedWholeStateRelation =
            exactCounters["controllerStateInstalls"] === 0
              ? "same-reference-as-controller-state-before"
              : "new-state-object";
          if (
            stableJson(Object.keys(expectations).sort(codeUnitCompare)) !==
              stableJson(["preservedFields", "wholeControllerState"]) ||
            stableJson(Object.keys(preservedFields)) !==
              stableJson(MARKER_PRESERVED_FIELDS) ||
            expectations["wholeControllerState"] !== expectedWholeStateRelation
          ) {
            throw new Error("BRIDGE_MARKER_REFERENCE_EXPECTATION_SHAPE");
          }
          for (const field of MARKER_PRESERVED_FIELDS) {
            const relation = preservedFields[field];
            if (
              relation !== "same-reference-as-controller-state-before" &&
              relation !== "different-reference-from-controller-state-before"
            ) {
              throw new Error("BRIDGE_MARKER_REFERENCE_EXPECTATION_VALUE");
            }
            if (
              relation === "different-reference-from-controller-state-before"
            ) {
              clonedPreservedReferenceDetected = true;
            }
          }
        } else if (referenceIdentityExpectations !== null) {
          throw new Error("BRIDGE_MARKER_REFERENCE_EXPECTATION_UNEXPECTED");
        }
        const materializeOptionalRunProjection = (name: string): unknown =>
          run[name] === undefined
            ? null
            : materializeBridgeTemplate(
                run[name],
                literalContext,
                before,
                new Set(),
              );
        const publicationMergeFieldPolicy = materializeOptionalRunProjection(
          "publicationMergeFieldPolicy",
        );
        const publicationMergeReferenceExpectations =
          materializeOptionalRunProjection(
            "publicationMergeReferenceExpectations",
          );
        const publicationMergeSequenceWitness =
          materializeOptionalRunProjection("publicationMergeSequenceWitness");
        const sameRevisionInterleave = materializeOptionalRunProjection(
          "sameRevisionInterleave",
        );
        const publicationMergeObservation = materializeOptionalRunProjection(
          "publicationMergeObservation",
        );
        const contentInvarianceWitness = materializeOptionalRunProjection(
          "contentInvarianceWitness",
        );
        if (
          contentInvarianceWitness !== null &&
          !jsonDeepEqual(run["registryBefore"], run["registryAfter"])
        ) {
          throw new Error("BRIDGE_CONTENT_INVARIANCE_REGISTRY_REFERENCE");
        }
        const preparedEntryForMerge = recordsAt(
          isObject(registryBefore) ? registryBefore["entries"] : undefined,
        )[0];
        const preparedPrivateMaterialForMerge =
          preparedEntryForMerge !== undefined &&
          isObject(preparedEntryForMerge["privateMaterial"])
            ? preparedEntryForMerge["privateMaterial"]
            : null;
        const independentlyMergedState =
          record["operation"] === "publishImportReplacement" &&
          preparedPrivateMaterialForMerge !== null
            ? constructLatestReplacementPublicationState(
                before,
                preparedPrivateMaterialForMerge,
              )
            : null;
        const usesLatestControllerState =
          independentlyMergedState !== null &&
          jsonDeepEqual(after, independentlyMergedState);
        const interleaveForFrozenState = isObject(sameRevisionInterleave)
          ? sameRevisionInterleave
          : {};
        const preparationStateForFrozenMerge =
          typeof interleaveForFrozenState[
            "preparationControllerStateLiteralId"
          ] === "string"
            ? materializedCatalog.get(
                interleaveForFrozenState["preparationControllerStateLiteralId"],
              )
            : undefined;
        const frozenPreparationMerge =
          isObject(preparationStateForFrozenMerge) &&
          preparedPrivateMaterialForMerge !== null
            ? constructLatestReplacementPublicationState(
                preparationStateForFrozenMerge,
                preparedPrivateMaterialForMerge,
              )
            : null;
        if (
          publicationMergeObservation !== null &&
          (!isObject(publicationMergeObservation) ||
            stableJson(publicationMergeObservation) !==
              stableJson({ usesLatestControllerState }))
        ) {
          throw new Error("BRIDGE_PUBLICATION_MERGE_OBSERVATION");
        }
        const frozenPrepareStateInstallDetected =
          record["operation"] === "publishImportReplacement" &&
          publicationMergeObservation !== null &&
          !usesLatestControllerState &&
          frozenPreparationMerge !== null &&
          jsonDeepEqual(after, frozenPreparationMerge) &&
          exactCounters["controllerStateInstalls"] === 1;
        const eventIndex = (event: string): number => eventOrder.indexOf(event);
        const earlyAllocation =
          eventIndex("allocate.registry-entry") >= 0 &&
          eventIndex("call.f2") >= 0 &&
          eventIndex("allocate.registry-entry") < eventIndex("call.f2");
        const publishBeforeConsumption =
          eventIndex("install.next-state") >= 0 &&
          eventIndex("consume.entry-before-publish") >= 0 &&
          eventIndex("install.next-state") <
            eventIndex("consume.entry-before-publish");
        const notifyBeforeInstall =
          eventIndex("notify.listeners-after-install") >= 0 &&
          eventIndex("install.state") >= 0 &&
          eventIndex("notify.listeners-after-install") <
            eventIndex("install.state");
        const markerReturnIndex = eventIndex("return.state-free");
        const returnBeforeInstall =
          markerReturnIndex >= 0 &&
          (eventIndex("install.state") < 0 ||
            markerReturnIndex < eventIndex("install.state"));
        let ownerLawOracle =
          rawCall["target"] !== "A0E0InterchangeOwnerOperations"
            ? {
                outcome: "killed",
                code: "BRIDGE_OWNER_LAW_RAW_DISPATCH_FORBIDDEN",
              }
            : rawCall["invocation"] !== "synchronous"
              ? {
                  outcome: "killed",
                  code: "BRIDGE_OWNER_LAW_IDENTITY_SYNC_REQUIRED",
                }
              : earlyAllocation
                ? {
                    outcome: "killed",
                    code: "BRIDGE_OWNER_LAW_EARLY_ALLOCATION_FORBIDDEN",
                  }
                : publishBeforeConsumption
                  ? {
                      outcome: "killed",
                      code: "BRIDGE_OWNER_LAW_PUBLISH_BEFORE_CONSUME_FORBIDDEN",
                    }
                  : containsForbiddenStateKey(exactTypedResult)
                    ? {
                        outcome: "killed",
                        code: "BRIDGE_OWNER_LAW_STATE_BEARING_RESULT_FORBIDDEN",
                      }
                    : notifyBeforeInstall
                      ? {
                          outcome: "killed",
                          code: "BRIDGE_OWNER_LAW_NOTIFY_BEFORE_INSTALL_FORBIDDEN",
                        }
                      : returnBeforeInstall
                        ? {
                            outcome: "killed",
                            code: "BRIDGE_OWNER_LAW_RETURN_BEFORE_INSTALL_FORBIDDEN",
                          }
                        : clonedPreservedReferenceDetected
                          ? {
                              outcome: "killed",
                              code: "BRIDGE_OWNER_LAW_PRESERVED_REFERENCE_CLONE_FORBIDDEN",
                            }
                          : frozenPrepareStateInstallDetected
                            ? {
                                outcome: "killed",
                                code: "BRIDGE_OWNER_LAW_FROZEN_PREPARE_STATE_INSTALL_FORBIDDEN",
                              }
                            : workBound[
                                  "awaitOrMicrotaskBoundariesInsideOperation"
                                ] !== 0
                              ? {
                                  outcome: "killed",
                                  code: "BRIDGE_OWNER_LAW_MARKER_AWAIT_FORBIDDEN",
                                }
                              : workBound["wallTimeObservedOrUsed"] !== false
                                ? {
                                    outcome: "killed",
                                    code: "BRIDGE_OWNER_LAW_WALL_TIME_FORBIDDEN",
                                  }
                                : { outcome: "pass", code: null };

        let deltaApplied: unknown = before;
        const deltas = recordsAt(run["exactControllerStateDelta"]);
        const materializedDeltas: JsonObject[] = [];
        if (
          deltas.length !==
          (Array.isArray(run["exactControllerStateDelta"])
            ? run["exactControllerStateDelta"].length
            : 0)
        ) {
          throw new Error("BRIDGE_RUN_STATE_DELTA_ARRAY");
        }
        const deltaPointers = new Set<string>();
        for (const delta of deltas) {
          if (
            delta["op"] !== "replace" ||
            typeof delta["jsonPointer"] !== "string" ||
            stableJson(delta["from"]) === stableJson(delta["to"]) ||
            (Object.hasOwn(delta, "exactChangedFieldCount") &&
              delta["exactChangedFieldCount"] !== 1) ||
            deltaPointers.has(delta["jsonPointer"])
          ) {
            throw new Error("BRIDGE_RUN_STATE_DELTA");
          }
          deltaPointers.add(delta["jsonPointer"]);
          const materializedFrom = materializePatchValue(
            delta["from"],
            literalContext,
            deltaApplied,
          );
          const materializedTo = materializePatchValue(
            delta["to"],
            literalContext,
            deltaApplied,
          );
          const materializedValue = materializePatchValue(
            delta["value"],
            literalContext,
            deltaApplied,
          );
          if (stableJson(materializedTo) !== stableJson(materializedValue)) {
            throw new Error("BRIDGE_RUN_STATE_DELTA_TO_VALUE");
          }
          if (stableJson(materializedFrom) === stableJson(materializedTo)) {
            throw new Error("BRIDGE_RUN_STATE_DELTA_NOOP");
          }
          materializedDeltas.push({
            op: "replace",
            jsonPointer: delta["jsonPointer"],
            from: materializedFrom,
            to: materializedTo,
            value: materializedValue,
          });
          deltaApplied = applyPointerMutation(
            deltaApplied,
            "replace",
            delta["jsonPointer"],
            materializedFrom,
            materializedTo,
          );
        }
        if (!jsonDeepEqual(deltaApplied, after)) {
          throw new Error("BRIDGE_RUN_STATE_DELTA_RESULT");
        }

        const phaseFieldNames = [
          "postReturnExternalEdit",
          "lateA1Settlement",
          "scenarioTotals",
        ] as const;
        let scenarioFinalState: unknown = null;
        let scenarioFinalStateResolved: unknown = null;
        let scenarioCurrentAfterExternalEdit: unknown = null;
        let defaultScenarioFinalLiteralId: string | null = null;
        if (
          fullRunId === "BRIDGE-MARK-010/marker-10" ||
          fullRunId === "BRIDGE-MARK-010/mutation-019-historical-reinstall"
        ) {
          const externalEdit = isObject(run["postReturnExternalEdit"])
            ? run["postReturnExternalEdit"]
            : null;
          const lateSettlement = isObject(run["lateA1Settlement"])
            ? run["lateA1Settlement"]
            : null;
          const scenarioTotals = isObject(run["scenarioTotals"])
            ? run["scenarioTotals"]
            : null;
          if (
            externalEdit === null ||
            lateSettlement === null ||
            scenarioTotals === null ||
            stableJson(Object.keys(externalEdit).sort(codeUnitCompare)) !==
              stableJson([
                "actor",
                "controllerStateAfter",
                "controllerStateBefore",
                "exactControllerStateDelta",
                "exactCounters",
              ]) ||
            stableJson(Object.keys(lateSettlement).sort(codeUnitCompare)) !==
              stableJson([
                "controllerStateInstalls",
                "historicalStateReinstall",
                "inputControllerStateLiteralId",
                "listenerCallbacks",
                "resultShape",
              ]) ||
            stableJson(Object.keys(scenarioTotals).sort(codeUnitCompare)) !==
              stableJson(["controllerStateInstalls", "listenerCallbacks"])
          ) {
            throw new Error("BRIDGE_LATE_A1_PHASE_SHAPE");
          }
          const externalBeforeDescriptor =
            externalEdit["controllerStateBefore"];
          const externalAfterDescriptor = externalEdit["controllerStateAfter"];
          const externalBefore = materializeDescriptor(
            externalBeforeDescriptor,
            literalContext,
          );
          const externalAfter = materializeDescriptor(
            externalAfterDescriptor,
            literalContext,
          );
          assertNestedAcceptedDocuments(
            externalBefore,
            `${fullRunId}/postReturnExternalEdit/controllerStateBefore`,
          );
          assertNestedAcceptedDocuments(
            externalAfter,
            `${fullRunId}/postReturnExternalEdit/controllerStateAfter`,
          );
          if (
            !isFullAppStateLiteral(externalBefore) ||
            !isFullAppStateLiteral(externalAfter) ||
            !jsonDeepEqual(externalBefore, after) ||
            externalEdit["actor"] !==
              "A0-document-command-outside-owner-operation"
          ) {
            throw new Error("BRIDGE_LATE_A1_EXTERNAL_LINK");
          }
          let externalDeltaApplied: unknown = externalBefore;
          const externalDeltas = recordsAt(
            externalEdit["exactControllerStateDelta"],
          );
          if (
            externalDeltas.length === 0 ||
            externalDeltas.length !==
              (Array.isArray(externalEdit["exactControllerStateDelta"])
                ? externalEdit["exactControllerStateDelta"].length
                : 0)
          ) {
            throw new Error("BRIDGE_LATE_A1_EXTERNAL_DELTA_ARRAY");
          }
          const externalPointers = new Set<string>();
          for (const delta of externalDeltas) {
            if (
              stableJson(Object.keys(delta).sort(codeUnitCompare)) !==
                stableJson(["from", "jsonPointer", "op", "to", "value"]) ||
              delta["op"] !== "replace" ||
              typeof delta["jsonPointer"] !== "string" ||
              externalPointers.has(delta["jsonPointer"])
            ) {
              throw new Error("BRIDGE_LATE_A1_EXTERNAL_DELTA_SHAPE");
            }
            externalPointers.add(delta["jsonPointer"]);
            const materializedFrom = materializePatchValue(
              delta["from"],
              literalContext,
              externalDeltaApplied,
            );
            const materializedTo = materializePatchValue(
              delta["to"],
              literalContext,
              externalDeltaApplied,
            );
            const materializedValue = materializePatchValue(
              delta["value"],
              literalContext,
              externalDeltaApplied,
            );
            if (
              stableJson(materializedFrom) === stableJson(materializedTo) ||
              stableJson(materializedTo) !== stableJson(materializedValue)
            ) {
              throw new Error("BRIDGE_LATE_A1_EXTERNAL_DELTA_VALUE");
            }
            externalDeltaApplied = applyPointerMutation(
              externalDeltaApplied,
              "replace",
              delta["jsonPointer"],
              materializedFrom,
              materializedTo,
            );
          }
          if (!jsonDeepEqual(externalDeltaApplied, externalAfter)) {
            throw new Error("BRIDGE_LATE_A1_EXTERNAL_DELTA_RESULT");
          }
          scenarioCurrentAfterExternalEdit = externalAfter;
          scenarioFinalStateResolved = externalAfter;
          defaultScenarioFinalLiteralId =
            isObject(externalAfterDescriptor) &&
            typeof externalAfterDescriptor["literalId"] === "string"
              ? externalAfterDescriptor["literalId"]
              : null;
          const externalCounters = isObject(externalEdit["exactCounters"])
            ? externalEdit["exactCounters"]
            : {};
          if (
            stableJson(externalCounters) !==
            stableJson({ controllerStateInstalls: 1, listenerCallbacks: 1 })
          ) {
            throw new Error("BRIDGE_LATE_A1_EXTERNAL_COUNTERS");
          }
          const lateInputLiteralId =
            lateSettlement["inputControllerStateLiteralId"];
          const lateInput =
            typeof lateInputLiteralId === "string"
              ? materializedCatalog.get(lateInputLiteralId)
              : undefined;
          if (
            !isObject(externalAfterDescriptor) ||
            externalAfterDescriptor["literalId"] !== lateInputLiteralId ||
            !jsonDeepEqual(lateInput, externalAfter) ||
            lateSettlement["resultShape"] !== "state-free" ||
            lateSettlement["controllerStateInstalls"] !== 0 ||
            lateSettlement["listenerCallbacks"] !== 0 ||
            lateSettlement["historicalStateReinstall"] !== false
          ) {
            throw new Error("BRIDGE_LATE_A1_SETTLEMENT");
          }
          if (
            scenarioTotals["controllerStateInstalls"] !==
              Number(exactCounters["controllerStateInstalls"]) +
                Number(externalCounters["controllerStateInstalls"]) +
                lateSettlement["controllerStateInstalls"] ||
            scenarioTotals["listenerCallbacks"] !==
              Number(exactCounters["listenerCallbacks"]) +
                Number(externalCounters["listenerCallbacks"]) +
                lateSettlement["listenerCallbacks"]
          ) {
            throw new Error("BRIDGE_LATE_A1_SCENARIO_TOTALS");
          }
        } else if (
          phaseFieldNames.some(
            (field) => run[field] !== undefined && run[field] !== null,
          )
        ) {
          throw new Error("BRIDGE_LATE_A1_PHASE_UNEXPECTED");
        }
        if (run["scenarioFinalState"] !== undefined) {
          const scenarioFinalDescriptor = run["scenarioFinalState"];
          scenarioFinalStateResolved = materializeDescriptor(
            scenarioFinalDescriptor,
            literalContext,
          );
          if (!isFullAppStateLiteral(scenarioFinalStateResolved)) {
            throw new Error("BRIDGE_SCENARIO_FINAL_STATE");
          }
          assertNestedAcceptedDocuments(
            scenarioFinalStateResolved,
            `${fullRunId}/scenarioFinalState`,
          );
          defaultScenarioFinalLiteralId =
            isObject(scenarioFinalDescriptor) &&
            typeof scenarioFinalDescriptor["literalId"] === "string"
              ? scenarioFinalDescriptor["literalId"]
              : null;
        }
        if (defaultScenarioFinalLiteralId !== null) {
          scenarioFinalState = { literalId: defaultScenarioFinalLiteralId };
        }
        if (
          ownerLawOracle["outcome"] === "pass" &&
          scenarioCurrentAfterExternalEdit !== null &&
          scenarioFinalStateResolved !== null &&
          !jsonDeepEqual(
            scenarioFinalStateResolved,
            scenarioCurrentAfterExternalEdit,
          )
        ) {
          if (!jsonDeepEqual(scenarioFinalStateResolved, after)) {
            throw new Error("BRIDGE_HISTORICAL_REINSTALL_NOT_OWNER_STATE");
          }
          ownerLawOracle = {
            outcome: "killed",
            code: "BRIDGE_OWNER_LAW_HISTORICAL_REINSTALL_FORBIDDEN",
          };
        }

        const projection: MaterializedRunProjection = {
          caseId,
          runId,
          operation: String(record["operation"]),
          runRole,
          ownerProof: !expectedE0V2Owned,
          e0V2Owned: expectedE0V2Owned,
          rawCall,
          controllerStateBefore: before,
          controllerStateAfter: after,
          registryBefore,
          registryAfter,
          exactTypedResult,
          exactCounters,
          synchronousEventOrder: eventOrder,
          workBound,
          exactControllerStateDelta: materializedDeltas,
          mutationProbe,
          historyEstimatorLawInput,
          ownerLawFlags: ownerLawFlagsValue,
          ownerLawOracle,
          scenarioFinalState,
          scenarioFinalStateResolved,
          scenarioCurrentAfterExternalEdit,
          referenceIdentityExpectations,
          publicationMergeFieldPolicy,
          publicationMergeReferenceExpectations,
          publicationMergeSequenceWitness,
          sameRevisionInterleave,
          publicationMergeObservation,
          contentInvarianceWitness,
          comparisonInput: {
            arguments: rawCall["arguments"],
            controllerState: before,
            registry: registryBefore,
          },
        };
        if (runById.has(fullRunId)) throw new Error("BRIDGE_RUN_DUPLICATE");
        runById.set(fullRunId, projection);
      } catch (error) {
        addFinding(
          findings,
          "BRIDGE_LITERAL_RUN",
          `owner-port-cases.json.${fullRunId}`,
          `Run must materialize exact before/request/result/after, registry, counters, events, and work bounds (${error instanceof Error ? error.message : "unknown"}).`,
        );
      }
    }
  }

  for (const [fullRunId, run] of runById) {
    const hasMergeWitness = [
      run.publicationMergeFieldPolicy,
      run.publicationMergeReferenceExpectations,
      run.publicationMergeSequenceWitness,
      run.sameRevisionInterleave,
      run.publicationMergeObservation,
    ].some((value) => value !== null);
    if (hasMergeWitness) {
      try {
        if (
          run.operation !== "publishImportReplacement" ||
          [
            run.publicationMergeFieldPolicy,
            run.publicationMergeReferenceExpectations,
            run.publicationMergeSequenceWitness,
            run.sameRevisionInterleave,
            run.publicationMergeObservation,
          ].some((value) => value === null)
        ) {
          throw new Error("BRIDGE_PUBLICATION_MERGE_WITNESS_COMPLETENESS");
        }
        const before = isObject(run.controllerStateBefore)
          ? run.controllerStateBefore
          : {};
        const after = isObject(run.controllerStateAfter)
          ? run.controllerStateAfter
          : {};
        const entry = recordsAt(
          isObject(run.registryBefore)
            ? run.registryBefore["entries"]
            : undefined,
        )[0];
        const privateMaterial =
          entry !== undefined && isObject(entry["privateMaterial"])
            ? entry["privateMaterial"]
            : null;
        if (privateMaterial === null) {
          throw new Error("BRIDGE_PUBLICATION_MERGE_WITNESS_PRIVATE");
        }
        const expectedAfter = constructLatestReplacementPublicationState(
          before,
          privateMaterial,
        );
        const usesLatest =
          expectedAfter !== null && jsonDeepEqual(expectedAfter, after);
        if (
          !jsonDeepEqual(
            run.publicationMergeFieldPolicy,
            REPLACEMENT_PUBLICATION_FIELD_POLICY,
          ) ||
          !jsonDeepEqual(run.publicationMergeObservation, {
            usesLatestControllerState: usesLatest,
          })
        ) {
          throw new Error("BRIDGE_PUBLICATION_MERGE_WITNESS_POLICY");
        }
        const referenceExpectations = isObject(
          run.publicationMergeReferenceExpectations,
        )
          ? run.publicationMergeReferenceExpectations
          : {};
        const expectedReferenceExpectations = Object.fromEntries(
          REPLACEMENT_PUBLICATION_FIELD_POLICY.preserveLatestByReference.map(
            (field) => [
              field,
              usesLatest
                ? "same-reference-as-controller-state-before"
                : "different-reference-from-controller-state-before",
            ],
          ),
        );
        if (
          !jsonDeepEqual(
            referenceExpectations,
            expectedReferenceExpectations,
          ) ||
          (usesLatest &&
            REPLACEMENT_PUBLICATION_FIELD_POLICY.preserveLatestByReference.some(
              (field) => !jsonDeepEqual(before[field], after[field]),
            ))
        ) {
          throw new Error("BRIDGE_PUBLICATION_MERGE_WITNESS_REFERENCE");
        }
        const focusRequest = isObject(after["focusRequest"])
          ? after["focusRequest"]
          : {};
        const warningNotice = recordsAt(after["notices"])[0];
        const expectedSequenceWitness: JsonObject = {
          latestNextSequenceBeforePublication: before["nextSequence"],
          focusRequestSequenceAfterPublication: focusRequest["sequence"],
          ...(warningNotice === undefined
            ? {}
            : {
                warningNoticeSequenceAfterPublication:
                  warningNotice["sequence"],
              }),
          nextSequenceAfterPublication: after["nextSequence"],
        };
        if (
          !jsonDeepEqual(
            run.publicationMergeSequenceWitness,
            expectedSequenceWitness,
          )
        ) {
          throw new Error("BRIDGE_PUBLICATION_MERGE_WITNESS_SEQUENCE");
        }
        const interleave = isObject(run.sameRevisionInterleave)
          ? run.sameRevisionInterleave
          : {};
        const preparationLiteralId =
          interleave["preparationControllerStateLiteralId"];
        const preparationState =
          typeof preparationLiteralId === "string"
            ? materializedCatalog.get(preparationLiteralId)
            : undefined;
        const editedFields =
          isObject(preparationState) && isObject(before)
            ? Object.keys(before).filter(
                (field) =>
                  !jsonDeepEqual(preparationState[field], before[field]),
              )
            : [];
        const expectedFrozenPreparationMerge = isObject(preparationState)
          ? constructLatestReplacementPublicationState(
              preparationState,
              privateMaterial,
            )
          : null;
        if (
          !isFullAppStateLiteral(preparationState) ||
          !jsonDeepEqual(interleave, {
            preparationControllerStateLiteralId: preparationLiteralId,
            ephemeralEditCount: editedFields.length,
            editedFields,
            revisionBeforePreparation: preparationState["revision"],
            revisionBeforePublication: before["revision"],
          }) ||
          preparationState["revision"] !== before["revision"] ||
          (!usesLatest &&
            (expectedFrozenPreparationMerge === null ||
              !jsonDeepEqual(after, expectedFrozenPreparationMerge)))
        ) {
          throw new Error("BRIDGE_PUBLICATION_MERGE_WITNESS_INTERLEAVE");
        }
      } catch (error) {
        addFinding(
          findings,
          "BRIDGE_PUBLICATION_MERGE_WITNESS",
          `owner-port-cases.json.${fullRunId}`,
          `Latest-state field ownership, reference, sequence, saturation, and interleave evidence must be independently exact (${error instanceof Error ? error.message : "unknown"}).`,
        );
      }
    }

    if (run.contentInvarianceWitness !== null) {
      try {
        const beforeEntries = recordsAt(
          isObject(run.registryBefore)
            ? run.registryBefore["entries"]
            : undefined,
        );
        const argument = isUnknownArray(run.rawCall["arguments"])
          ? run.rawCall["arguments"][0]
          : undefined;
        const argumentIdentity =
          isObject(argument) && isObject(argument["identity"])
            ? argument["identity"]
            : {};
        const liveIdentity =
          beforeEntries[0] !== undefined && isObject(beforeEntries[0]["key"])
            ? beforeEntries[0]["key"]
            : {};
        const counters = isObject(run.exactCounters) ? run.exactCounters : {};
        if (
          run.operation !== "discardImportReplacementPublication" ||
          !jsonDeepEqual(run.contentInvarianceWitness, {
            liveRegistryRequestId: liveIdentity["requestId"],
            unmatchedRequestId: argumentIdentity["requestId"],
            documentInspections: 0,
            pitchInspections: 0,
            registryRelation: "same-reference-preserved-unrelated-entry",
          }) ||
          !jsonDeepEqual(run.controllerStateBefore, run.controllerStateAfter) ||
          !jsonDeepEqual(run.registryBefore, run.registryAfter) ||
          counters["f2DecodeDocumentShape"] !== 0 ||
          counters["f3ValidateDocumentSemantics"] !== 0 ||
          counters["historyEstimator"] !== 0 ||
          counters["bookmarkRepair"] !== 0 ||
          counters["registryInvalidations"] !== 0 ||
          counters["registryConsumptions"] !== 0
        ) {
          throw new Error("BRIDGE_CONTENT_INVARIANCE_DERIVATION");
        }
      } catch (error) {
        addFinding(
          findings,
          "BRIDGE_CONTENT_INVARIANCE_WITNESS",
          `owner-port-cases.json.${fullRunId}`,
          `Identity-only wrong-request cleanup must preserve the unrelated live entry without inspecting document or pitch content (${error instanceof Error ? error.message : "unknown"}).`,
        );
      }
    }
  }

  const lawCoverageRows = recordsAt(traceRoot["lawCoverage"]);
  requireExact(
    lawCoverageRows.map((row) => row["lawId"]),
    OWNER_LAW_IDS,
    "BRIDGE_OWNER_LAW_COVERAGE_INVENTORY",
    "trace-ledger.json.lawCoverage",
    "Every source owner law must appear exactly once in the machine-checkable coverage ledger.",
    findings,
  );
  for (const lawId of OWNER_LAW_IDS) {
    const row = lawCoverageRows.find(
      (candidate) => candidate["lawId"] === lawId,
    );
    try {
      if (row === undefined) throw new Error("BRIDGE_LAW_COVERAGE_MISSING");
      const expectedKeys = [
        "lawId",
        "mutationControlIds",
        "negativeOrNearMissRunIds",
        "positiveRunIds",
        "traceIds",
        "transpositionOrApplicability",
        ...(lawId === "BRIDGE-OWNER-10-state-free-boundary-results"
          ? ["additionalProofRequirements"]
          : []),
      ].sort(codeUnitCompare);
      if (
        stableJson(Object.keys(row).sort(codeUnitCompare)) !==
        stableJson(expectedKeys)
      ) {
        throw new Error("BRIDGE_LAW_COVERAGE_SHAPE");
      }
      const traceIds = stringsAt(row["traceIds"]);
      const positiveRunIds = stringsAt(row["positiveRunIds"]);
      const negativeRunIds = stringsAt(row["negativeOrNearMissRunIds"]);
      const mutationControlIds = stringsAt(row["mutationControlIds"]);
      const applicability = isObject(row["transpositionOrApplicability"])
        ? row["transpositionOrApplicability"]
        : {};
      const applicabilityRunIds = stringsAt(applicability["runIds"]);
      if (
        traceIds.length === 0 ||
        positiveRunIds.length === 0 ||
        negativeRunIds.length === 0 ||
        mutationControlIds.length === 0 ||
        applicabilityRunIds.length === 0 ||
        stableJson(Object.keys(applicability).sort(codeUnitCompare)) !==
          stableJson(["rationale", "runIds", "status"]) ||
        typeof applicability["status"] !== "string" ||
        typeof applicability["rationale"] !== "string" ||
        applicability["rationale"].length === 0
      ) {
        throw new Error("BRIDGE_LAW_COVERAGE_FAMILIES");
      }
      for (const traceId of traceIds) {
        const trace = traceById.get(traceId);
        if (
          trace === undefined ||
          !stringsAt(trace["lawIds"]).includes(lawId)
        ) {
          throw new Error("BRIDGE_LAW_COVERAGE_TRACE_LINK");
        }
      }
      const allCoverageRunIds = [
        ...positiveRunIds,
        ...negativeRunIds,
        ...applicabilityRunIds,
      ];
      for (const runId of allCoverageRunIds) {
        const run = runById.get(runId);
        if (run === undefined || !run.ownerProof || run.e0V2Owned) {
          throw new Error("BRIDGE_LAW_COVERAGE_RUN");
        }
        const caseRecord = caseById.get(run.caseId);
        if (
          caseRecord === undefined ||
          !stringsAt(caseRecord["traceIds"]).some((traceId) =>
            traceIds.includes(traceId),
          )
        ) {
          throw new Error("BRIDGE_LAW_COVERAGE_RUN_TRACE");
        }
      }
      for (const runId of positiveRunIds) {
        const run = runById.get(runId);
        if (
          run === undefined ||
          run.runRole !== "conformance" ||
          run.ownerLawOracle["outcome"] !== "pass"
        ) {
          throw new Error("BRIDGE_LAW_COVERAGE_POSITIVE_OUTCOME");
        }
      }
      for (const runId of applicabilityRunIds) {
        const run = runById.get(runId);
        if (
          run === undefined ||
          run.runRole !== "conformance" ||
          run.ownerLawOracle["outcome"] !== "pass"
        ) {
          throw new Error("BRIDGE_LAW_COVERAGE_APPLICABILITY_OUTCOME");
        }
      }
      for (const controlId of mutationControlIds) {
        const control = controlById.get(controlId);
        const killerRunId = control?.["killerRunId"];
        const killerRun =
          typeof killerRunId === "string"
            ? runById.get(killerRunId)
            : undefined;
        const killerCase =
          killerRun === undefined ? undefined : caseById.get(killerRun.caseId);
        const oracleExpectation =
          control !== undefined && isObject(control["oracleExpectation"])
            ? control["oracleExpectation"]
            : {};
        if (
          control === undefined ||
          typeof killerRunId !== "string" ||
          killerRun === undefined ||
          killerRun.runRole !== "mutation-killer" ||
          !negativeRunIds.includes(killerRunId) ||
          killerCase === undefined ||
          !stringsAt(killerCase["expectedMutationKills"]).includes(controlId) ||
          !stringsAt(control["linkedCaseIds"]).includes(killerRun.caseId) ||
          !traceIds.some((traceId) => {
            const trace = traceById.get(traceId);
            return (
              trace !== undefined &&
              stringsAt(trace["controlIds"]).includes(controlId)
            );
          }) ||
          (oracleExpectation["outcome"] === "killed"
            ? killerRun.ownerLawOracle["outcome"] !== "killed" ||
              killerRun.ownerLawOracle["code"] !== oracleExpectation["code"]
            : oracleExpectation["outcome"] !== "pass" ||
              killerRun.ownerLawOracle["outcome"] !== "pass")
        ) {
          throw new Error("BRIDGE_LAW_COVERAGE_CONTROL_LINK");
        }
      }
      for (const runId of negativeRunIds) {
        const run = runById.get(runId);
        if (run === undefined) {
          throw new Error("BRIDGE_LAW_COVERAGE_NEGATIVE_MISSING");
        }
        if (
          run.runRole === "conformance" &&
          run.ownerLawOracle["outcome"] !== "pass"
        ) {
          throw new Error("BRIDGE_LAW_COVERAGE_NEAR_MISS_OUTCOME");
        }
        if (run.runRole === "mutation-killer") {
          const controlsForKiller = mutationControlIds
            .map((controlId) => controlById.get(controlId))
            .filter(
              (control): control is JsonObject =>
                control !== undefined && control["killerRunId"] === runId,
            );
          if (controlsForKiller.length === 0) {
            throw new Error("BRIDGE_LAW_COVERAGE_NEGATIVE_CONTROL");
          }
        }
      }
      if (
        lawId === "BRIDGE-OWNER-10-state-free-boundary-results" &&
        !jsonDeepEqual(row["additionalProofRequirements"], [
          "recursive-static-state-free-type-matrix-for-every-owner-request-result-handoff-and-identity",
        ])
      ) {
        throw new Error("BRIDGE_LAW_COVERAGE_STATIC_ADDENDUM");
      }
    } catch (error) {
      addFinding(
        findings,
        "BRIDGE_OWNER_LAW_COVERAGE",
        `trace-ledger.json.lawCoverage.${lawId}`,
        `Every law needs reciprocal positive, negative, applicability, mutation, case, and trace proof (${error instanceof Error ? error.message : "unknown"}).`,
      );
    }
  }
  for (const trace of traces) {
    const traceId = String(trace["id"]);
    const declaredLawIds = stringsAt(trace["lawIds"]);
    const reciprocalLawIds = OWNER_LAW_IDS.filter((lawId) => {
      const row = lawCoverageRows.find(
        (candidate) => candidate["lawId"] === lawId,
      );
      return row !== undefined && stringsAt(row["traceIds"]).includes(traceId);
    });
    if (
      new Set(declaredLawIds).size !== declaredLawIds.length ||
      !jsonDeepEqual(declaredLawIds, reciprocalLawIds)
    ) {
      addFinding(
        findings,
        "BRIDGE_TRACE_LAW_LINK",
        `trace-ledger.json.traces.${traceId}.lawIds`,
        "Trace law IDs must be unique and reciprocal with the exact law-coverage ledger.",
      );
    }
  }

  requireExact(
    cases["ownerProofSummary"],
    {
      beadId: "jcpe-94yu.1",
      productionImplementationAvailableWhenAuthored: false,
      acceptedE0V1BytesModified: false,
      replacementCaseCount: 28,
      identityCaseCount: 4,
      markerCaseCount: 10,
      a0OwnerProofCaseCount: 42,
      forwardE0V2BehaviorRowsPresent: false,
      deferredE0V2BindingLeaf: "jcpe-milestone-reliable-studio-l3a.8.4",
      totalRunCount: 118,
      a0OwnerProofRunCount: 118,
    },
    "BRIDGE_OWNER_PROOF_SUMMARY",
    "owner-port-cases.json.ownerProofSummary",
    "The packet must contain exactly 42 A0 owner cases and no normative future E0 v2 behavior rows.",
    findings,
  );
  if (
    a0OwnerProofCaseCount !== 42 ||
    excludedForwardE0V2CaseCount !== 0 ||
    allCases.reduce(
      (sum, record) => sum + recordsAt(record["runs"]).length,
      0,
    ) !== 118 ||
    [...runById.values()].filter((run) => run.ownerProof).length !== 118 ||
    [...runById.values()].some((run) => run.e0V2Owned)
  ) {
    addFinding(
      findings,
      "BRIDGE_OWNER_PROOF_COMPUTED_COUNTS",
      "owner-port-cases.json",
      "The materialized packet must independently compute to 42 A0 cases and 118 A0 runs with zero future E0 v2 behavior rows.",
    );
  }

  const replacementOracleDependencies = Object.freeze({
    decodeDocumentShape,
    validateDocumentSemantics,
    copyDomain,
    stableIdFactory: createProductionStableIdFactory(),
    estimateHistoryRetainedBytes: applicationHistoryRetainedByteEstimator,
  });

  const replacementCommandForOracle = (
    before: JsonObject,
    argument: JsonObject,
  ): JsonObject => {
    const identity = isObject(argument["identity"]) ? argument["identity"] : {};
    const seed = isObject(argument["replacementCommandSeed"])
      ? argument["replacementCommandSeed"]
      : {};
    const impact = isObject(argument["disclosedImpact"])
      ? argument["disclosedImpact"]
      : {};
    const acknowledgement = isObject(argument["nonUndoableConfirmation"])
      ? argument["nonUndoableConfirmation"]
      : {};
    const requirement = isObject(acknowledgement["requirement"])
      ? acknowledgement["requirement"]
      : {};
    const transport = isObject(before["transport"]) ? before["transport"] : {};
    return {
      id: seed["id"],
      label: seed["label"],
      expectedDocumentId: identity["documentId"],
      expectedRevision: identity["baseRevision"],
      logicalTimeMs: seed["logicalTimeMs"],
      coalescing: null,
      kind: "replace-document",
      origin: argument["replacementOrigin"],
      candidate: argument["candidate"],
      requestId: identity["requestId"],
      retirement: {
        requestId: identity["requestId"],
        retiredTransportGeneration: transport["generation"],
        progressionRetired: true,
        previewRetired: true,
        noFutureAttack: true,
      },
      undoDisposition:
        impact["undoDisposition"] === "explicitly-unavailable"
          ? {
              kind: "explicitly-unavailable",
              confirmationId: isBoundedUnicodeScalarToken(
                requirement["confirmationId"],
                MAX_COMMAND_ID_CODE_POINTS,
              )
                ? requirement["confirmationId"]
                : "bridge-oracle-valid-confirmation-placeholder",
              exportRecommended: true,
            }
          : { kind: "retain" },
    };
  };

  const runReplacementOracle = (
    before: JsonObject,
    argument: JsonObject,
    historyEstimatorLawInput: unknown,
  ): Readonly<{ command: JsonObject; result: JsonObject }> => {
    const transition = isObject(argument["currentTransition"])
      ? argument["currentTransition"]
      : {};
    const command = replacementCommandForOracle(before, argument);
    const estimatorOverride =
      isObject(historyEstimatorLawInput) &&
      typeof historyEstimatorLawInput["estimatedRetainedBytes"] === "number"
        ? historyEstimatorLawInput["estimatedRetainedBytes"]
        : null;
    const dependencies =
      estimatorOverride === null
        ? replacementOracleDependencies
        : {
            ...replacementOracleDependencies,
            estimateHistoryRetainedBytes: () => estimatorOverride,
          };
    const simulationState = {
      ...before,
      documentTransition: { ...transition, kind: "committing" },
    };
    const result: unknown = Reflect.apply(runDocumentCommand, undefined, [
      { state: simulationState, command, dependencies },
    ]);
    if (!isObject(result))
      throw new Error("BRIDGE_OWNER_ORACLE_REDUCER_RESULT");
    return { command, result };
  };

  const impactFromReplacementOracle = (
    before: JsonObject,
    result: JsonObject,
    disposition: unknown,
  ): JsonObject | null => {
    const counters = isObject(result["counters"]) ? result["counters"] : {};
    const historyEntryRetainedBytes = counters["historyBytesEstimated"];
    if (
      typeof historyEntryRetainedBytes !== "number" ||
      !Number.isSafeInteger(historyEntryRetainedBytes) ||
      historyEntryRetainedBytes < 0
    ) {
      return null;
    }
    const beforeHistory = isObject(before["history"]) ? before["history"] : {};
    const beforeUndo = Array.isArray(beforeHistory["undo"])
      ? beforeHistory["undo"]
      : [];
    const beforeRedo = Array.isArray(beforeHistory["redo"])
      ? beforeHistory["redo"]
      : [];
    if (disposition === "explicitly-unavailable") {
      return {
        historyEntryRetainedBytes,
        evictedUndoEntries: 0,
        redoEntriesCleared: beforeRedo.length,
        confirmationRequired: true,
        undoDisposition: "explicitly-unavailable",
        undoEntriesAfterCommit: 0,
        undoRetainedBytesAfterCommit: 0,
        exportRecommended: true,
      };
    }
    if (result["ok"] !== true || !isObject(result["state"])) return null;
    const afterHistory = isObject(result["state"]["history"])
      ? result["state"]["history"]
      : {};
    const afterUndo = Array.isArray(afterHistory["undo"])
      ? afterHistory["undo"]
      : [];
    return {
      historyEntryRetainedBytes,
      evictedUndoEntries: Math.max(0, beforeUndo.length + 1 - afterUndo.length),
      redoEntriesCleared: beforeRedo.length,
      confirmationRequired: true,
      undoDisposition: "retained",
      undoEntriesAfterCommit: afterUndo.length,
      undoRetainedBytesAfterCommit: afterHistory["retainedBytesEstimate"],
      exportRecommended: false,
    };
  };

  type PrepareOracleDecision = Readonly<{
    code: string | null;
    reachedThrough: (typeof PREPARE_SUCCESS_EVENTS)[number];
    prepared: JsonObject | null;
    simulation: Readonly<{ command: JsonObject; result: JsonObject }> | null;
  }>;

  const derivePrepareOracle = (
    before: JsonObject,
    registryBefore: JsonObject,
    argument: JsonObject,
    historyEstimatorLawInput: unknown,
  ): PrepareOracleDecision => {
    const refuse = (
      code: string,
      reachedThrough: PrepareOracleDecision["reachedThrough"],
      simulation: PrepareOracleDecision["simulation"] = null,
    ): PrepareOracleDecision => ({
      code,
      reachedThrough,
      prepared: null,
      simulation,
    });
    const identity = isObject(argument["identity"]) ? argument["identity"] : {};
    const seed = isObject(argument["replacementCommandSeed"])
      ? argument["replacementCommandSeed"]
      : {};
    const impact = isObject(argument["disclosedImpact"])
      ? argument["disclosedImpact"]
      : {};
    const transition = isObject(argument["currentTransition"])
      ? argument["currentTransition"]
      : {};
    const candidate = isObject(argument["candidate"])
      ? argument["candidate"]
      : {};
    const sourceOrigin: Readonly<Record<string, string>> = {
      "canonical-json-v2": "canonical-import",
      "unversioned-legacy-json": "legacy-import",
      "chart-text-v1": "canonical-import",
    };
    const hasExactKeys = (value: unknown, keys: readonly string[]): boolean =>
      isObject(value) &&
      stableJson(Object.keys(value).sort(codeUnitCompare)) ===
        stableJson([...keys].sort(codeUnitCompare));
    const impactKeys = [
      "confirmationRequired",
      "evictedUndoEntries",
      "exportRecommended",
      "historyEntryRetainedBytes",
      "redoEntriesCleared",
      "undoDisposition",
      "undoEntriesAfterCommit",
      "undoRetainedBytesAfterCommit",
    ] as const;
    if (
      stableJson(Object.keys(argument).sort(codeUnitCompare)) !==
        stableJson([
          "candidate",
          "currentTransition",
          "disclosedImpact",
          "identity",
          "nonUndoableConfirmation",
          "replacementCommandSeed",
          "replacementOrigin",
          "sourceFormat",
        ]) ||
      !hasExactKeys(identity, ["baseRevision", "documentId", "requestId"]) ||
      !hasExactKeys(seed, ["id", "label", "logicalTimeMs"]) ||
      !hasExactKeys(impact, impactKeys) ||
      !hasExactKeys(transition, [
        "baseRevision",
        "candidateDocumentId",
        "kind",
        "origin",
        "requestId",
        "undoDisposition",
      ]) ||
      !Number.isSafeInteger(identity["requestId"]) ||
      Number(identity["requestId"]) < 0 ||
      typeof identity["documentId"] !== "string" ||
      identity["documentId"].length === 0 ||
      !Number.isSafeInteger(identity["baseRevision"]) ||
      Number(identity["baseRevision"]) < 0 ||
      sourceOrigin[String(argument["sourceFormat"])] !==
        argument["replacementOrigin"]
    ) {
      return refuse(
        "import.replacement_request_invalid",
        "validate.request-envelope",
      );
    }
    const confirmation = argument["nonUndoableConfirmation"];
    const acknowledgement = isObject(confirmation) ? confirmation : {};
    const requirement = isObject(acknowledgement["requirement"])
      ? acknowledgement["requirement"]
      : {};
    const requirementIdentity = isObject(requirement["identity"])
      ? requirement["identity"]
      : {};
    if (
      confirmation !== null &&
      (!hasExactKeys(acknowledgement, ["kind", "requirement"]) ||
        !hasExactKeys(requirement, [
          "candidateDocumentId",
          "commandId",
          "confirmationId",
          "disclosedImpact",
          "identity",
          "schema",
        ]) ||
        !hasExactKeys(requirementIdentity, [
          "baseRevision",
          "documentId",
          "requestId",
        ]) ||
        !hasExactKeys(requirement["disclosedImpact"], impactKeys))
    ) {
      return refuse(
        "import.confirmation_identity_mismatch",
        "validate.request-envelope",
      );
    }
    const beforeDocument = isObject(before["document"])
      ? before["document"]
      : {};
    if (identity["documentId"] !== beforeDocument["id"]) {
      return refuse(
        "import.replacement_wrong_document",
        "compare.complete-identity",
      );
    }
    const currentRequest = recordsAt(before["pendingRequests"]).find(
      (request) =>
        request["kind"] === "document-transition" &&
        request["id"] === identity["requestId"] &&
        request["documentId"] === identity["documentId"] &&
        request["baseRevision"] === identity["baseRevision"] &&
        request["status"] === "running",
    );
    if (
      currentRequest === undefined ||
      before["revision"] !== identity["baseRevision"]
    ) {
      return refuse(
        "import.replacement_request_stale",
        "compare.complete-identity",
      );
    }
    const controllerTransition = isObject(before["documentTransition"])
      ? before["documentTransition"]
      : {};
    const transitionFieldsExceptDisposition = [
      "kind",
      "requestId",
      "origin",
      "baseRevision",
      "candidateDocumentId",
    ] as const;
    if (
      transition["kind"] !== "retiring-transport" ||
      transitionFieldsExceptDisposition.some(
        (field) => transition[field] !== controllerTransition[field],
      ) ||
      transition["requestId"] !== identity["requestId"] ||
      transition["origin"] !== argument["replacementOrigin"] ||
      transition["baseRevision"] !== identity["baseRevision"] ||
      transition["candidateDocumentId"] !== candidate["id"]
    ) {
      return refuse(
        "import.replacement_transition_mismatch",
        "compare.transition-binding",
      );
    }
    if (
      (impact["undoDisposition"] !== "retained" &&
        impact["undoDisposition"] !== "explicitly-unavailable") ||
      transition["undoDisposition"] !== impact["undoDisposition"] ||
      controllerTransition["undoDisposition"] !== impact["undoDisposition"]
    ) {
      return refuse(
        "import.replacement_impact_mismatch",
        "compare.transition-binding",
      );
    }
    if (!isBoundedUnicodeScalarToken(seed["id"], MAX_COMMAND_ID_CODE_POINTS)) {
      return refuse(
        "import.replacement_command_id_invalid",
        "validate.command-metadata",
      );
    }
    if (
      !isBoundedUnicodeScalarToken(seed["label"], MAX_COMMAND_LABEL_CODE_POINTS)
    ) {
      return refuse(
        "import.replacement_command_label_invalid",
        "validate.command-metadata",
      );
    }
    if (
      !Number.isSafeInteger(seed["logicalTimeMs"]) ||
      Number(seed["logicalTimeMs"]) < 0
    ) {
      return refuse(
        "import.replacement_logical_time_invalid",
        "validate.command-metadata",
      );
    }
    const beforeHistory = isObject(before["history"]) ? before["history"] : {};
    const undoEntries = recordsAt(beforeHistory["undo"]);
    const latestUndo = undoEntries.at(-1);
    if (
      latestUndo !== undefined &&
      typeof latestUndo["lastLogicalTimeMs"] === "number" &&
      Number(seed["logicalTimeMs"]) < latestUndo["lastLogicalTimeMs"]
    ) {
      return refuse(
        "import.replacement_logical_time_invalid",
        "validate.command-metadata",
      );
    }
    if (before["revision"] === MAX_APPLICATION_REVISION) {
      return refuse(
        "application.revision_exhausted",
        "check.revision-and-sequence-capacity",
      );
    }
    if (before["nextSequence"] === MAX_APPLICATION_SEQUENCE) {
      return refuse(
        "application.sequence_exhausted",
        "check.revision-and-sequence-capacity",
      );
    }
    const candidateObservation = observeDocumentValidation(candidate);
    if (
      candidateObservation.stage === "f2-refused" ||
      candidateObservation.stage === "f2-repaired"
    ) {
      return refuse("import.candidate_structural_invalid", "call.f2");
    }
    if (
      candidateObservation.stage === "f3-refused" ||
      candidateObservation.stage === "f3-repaired"
    ) {
      return refuse("import.candidate_semantic_invalid", "call.f3");
    }
    const simulation = runReplacementOracle(
      before,
      argument,
      historyEstimatorLawInput,
    );
    if (simulation.result["ok"] !== true) {
      const refusal = isObject(simulation.result["refusal"])
        ? simulation.result["refusal"]
        : {};
      if (refusal["code"] === "history.entry_too_large") {
        return refuse(
          "import.replacement_impact_unavailable",
          "estimate.history",
          simulation,
        );
      }
      if (refusal["code"] === "history.byte_estimate_invalid") {
        return refuse(
          "import.replacement_history_estimate_failed",
          "estimate.history",
          simulation,
        );
      }
      throw new Error(
        `BRIDGE_PREPARE_REDUCER_REFUSAL:${String(refusal["code"])}`,
      );
    }
    const recomputedImpact = impactFromReplacementOracle(
      before,
      simulation.result,
      impact["undoDisposition"],
    );
    if (recomputedImpact === null) {
      return refuse(
        "import.replacement_history_estimate_failed",
        "estimate.history",
        simulation,
      );
    }
    if (!jsonDeepEqual(recomputedImpact, impact)) {
      return refuse(
        "import.replacement_impact_mismatch",
        "recompute.impact",
        simulation,
      );
    }
    if (impact["undoDisposition"] === "explicitly-unavailable") {
      if (confirmation === null) {
        return refuse(
          "history.nonundoable_confirmation_required",
          "compare.confirmation",
          simulation,
        );
      }
      if (
        requirementIdentity["requestId"] !== identity["requestId"] ||
        requirementIdentity["baseRevision"] !== identity["baseRevision"]
      ) {
        return refuse(
          "import.confirmation_stale",
          "compare.confirmation",
          simulation,
        );
      }
      if (requirementIdentity["documentId"] !== identity["documentId"]) {
        return refuse(
          "import.confirmation_wrong_document",
          "compare.confirmation",
          simulation,
        );
      }
      if (!jsonDeepEqual(requirement["disclosedImpact"], recomputedImpact)) {
        return refuse(
          "import.confirmation_impact_mismatch",
          "compare.confirmation",
          simulation,
        );
      }
      if (
        acknowledgement["kind"] !== "acknowledged" ||
        requirement["schema"] !==
          "changes.import-nonundoable-confirmation.v1" ||
        !isBoundedUnicodeScalarToken(
          requirement["confirmationId"],
          MAX_COMMAND_ID_CODE_POINTS,
        ) ||
        requirement["candidateDocumentId"] !== candidate["id"] ||
        requirement["commandId"] !== seed["id"]
      ) {
        return refuse(
          "import.confirmation_identity_mismatch",
          "compare.confirmation",
          simulation,
        );
      }
    } else if (confirmation !== null) {
      return refuse(
        "import.replacement_impact_mismatch",
        "compare.confirmation",
        simulation,
      );
    }
    const entries = recordsAt(registryBefore["entries"]);
    if (entries.length !== 0) {
      return refuse(
        "import.replacement_preparation_busy",
        "inspect.registry-capacity-one",
        simulation,
      );
    }
    const transport = isObject(before["transport"]) ? before["transport"] : {};
    const prepared = {
      schema: "changes.prepared-import-replacement-publication.v1",
      identity,
      sourceFormat: argument["sourceFormat"],
      candidateDocumentId: candidate["id"],
      expectedTransportGeneration: transport["generation"],
      committingTransition: { ...transition, kind: "committing" },
    };
    return {
      code: null,
      reachedThrough: "return.prepared",
      prepared,
      simulation,
    };
  };

  const assertPrivateMaterialMatchesSimulation = (
    privateMaterial: JsonObject,
    before: JsonObject,
    argument: JsonObject,
    decision: PrepareOracleDecision,
  ): void => {
    const visitPrivateMaterial = (value: unknown): void => {
      if (Array.isArray(value)) {
        value.forEach(visitPrivateMaterial);
        return;
      }
      if (!isObject(value)) return;
      if (hasAppStateTopLevelShape(value)) {
        throw new Error("BRIDGE_PRIVATE_MATERIAL_WHOLE_APP_STATE");
      }
      for (const [key, child] of Object.entries(value)) {
        if (
          key.endsWith("StateLiteralId") ||
          [
            "beforeStateLiteralId",
            "afterStateLiteralId",
            "exactControllerStateDelta",
            "focusRequestAfter",
            "quickEntryAfter",
            "preservedTopLevelFields",
          ].includes(key)
        ) {
          throw new Error("BRIDGE_PRIVATE_MATERIAL_STATE_CAPTURE");
        }
        visitPrivateMaterial(child);
      }
    };
    visitPrivateMaterial(privateMaterial);
    const exactKeys = (value: unknown, keys: readonly string[]): boolean =>
      isObject(value) &&
      stableJson(Object.keys(value).sort(codeUnitCompare)) ===
        stableJson([...keys].sort(codeUnitCompare));
    if (
      decision.code !== null ||
      decision.prepared === null ||
      decision.simulation === null ||
      decision.simulation.result["ok"] !== true ||
      !isObject(decision.simulation.result["state"])
    ) {
      throw new Error("BRIDGE_OWNER_ORACLE_PRIVATE_SIMULATION");
    }
    const command = isObject(privateMaterial["command"])
      ? privateMaterial["command"]
      : {};
    const publication = isObject(privateMaterial["publication"])
      ? privateMaterial["publication"]
      : {};
    const bookmarks = isObject(privateMaterial["bookmarksAndFocus"])
      ? privateMaterial["bookmarksAndFocus"]
      : {};
    const history = isObject(privateMaterial["history"])
      ? privateMaterial["history"]
      : {};
    const candidateMetadata = isObject(privateMaterial["candidate"])
      ? privateMaterial["candidate"]
      : {};
    const candidateLiteralId = candidateMetadata["literalId"];
    const candidateLiteral =
      typeof candidateLiteralId === "string"
        ? materializedCatalog.get(candidateLiteralId)
        : undefined;
    const candidateCatalogEntry =
      typeof candidateLiteralId === "string" &&
      isObject(literalCatalog[candidateLiteralId])
        ? literalCatalog[candidateLiteralId]
        : {};
    const candidateBytes = new TextEncoder().encode(
      stableJson(candidateLiteral),
    );
    const validation = isObject(privateMaterial["validation"])
      ? privateMaterial["validation"]
      : {};
    const result = decision.simulation.result;
    const after = isObject(result["state"]) ? result["state"] : {};
    const afterFocus = isObject(after["focusRequest"])
      ? after["focusRequest"]
      : {};
    const afterQuickEntry = isObject(after["quickEntry"])
      ? after["quickEntry"]
      : {};
    const afterNotices = recordsAt(after["notices"]);
    const focusRequestTemplate = {
      target: afterFocus["target"],
      reason: afterFocus["reason"],
    };
    const quickEntryTemplate = {
      text: afterQuickEntry["text"],
      target: afterQuickEntry["target"],
      status: afterQuickEntry["status"],
      issueCodes: afterQuickEntry["issueCodes"],
    };
    const noticeTemplates = afterNotices.map((notice) => ({
      level: notice["level"],
      code: notice["code"],
      message: notice["message"],
      dismissible: notice["dismissible"],
    }));
    const replacementOwnedProjection = {
      document: after["document"],
      history: after["history"],
      bookmarks: after["bookmarks"],
      quickEntryTemplate,
      importDraft: after["importDraft"],
      pendingRequests: after["pendingRequests"],
      documentTransition: after["documentTransition"],
      noticeTemplates,
    };
    if (
      !exactKeys(privateMaterial, PRIVATE_IMPORT_REPLACEMENT_MATERIAL_KEYS) ||
      !exactKeys(bookmarks, [
        "after",
        "before",
        "focusTarget",
        "quickEntryTemplate",
        "repairCallsDuringPreparation",
        "repairCallsDuringPublication",
      ]) ||
      !exactKeys(history, [
        "after",
        "entry",
        "entryRetainedBytesEstimate",
        "estimatorCallsDuringPreparation",
        "estimatorCallsDuringPublication",
        "retentionDecision",
        "totalRetainedBytesAfterPublication",
      ]) ||
      !exactKeys(publication, [
        "counters",
        "effects",
        "focusRequestTemplate",
        "installCount",
        "listenerNotificationCount",
        "optionalWarningNoticeTemplate",
        "replacementOwnedProjection",
        "revisionIncrement",
      ]) ||
      !exactKeys(publication["replacementOwnedProjection"], [
        "bookmarks",
        "document",
        "documentTransition",
        "history",
        "importDraft",
        "noticeTemplates",
        "pendingRequests",
        "quickEntryTemplate",
      ]) ||
      !exactKeys(candidateMetadata, [
        "acceptedPrettyFileSha256",
        "canonicalMaterializedByteLength",
        "canonicalMaterializedSha256",
        "documentId",
        "literalId",
        "preservationPolicy",
      ]) ||
      !isCompleteDocumentLiteral(candidateLiteral) ||
      !jsonDeepEqual(candidateLiteral, argument["candidate"]) ||
      candidateMetadata["documentId"] !== candidateLiteral["id"] ||
      candidateMetadata["canonicalMaterializedSha256"] !==
        sha256(candidateBytes) ||
      candidateMetadata["canonicalMaterializedByteLength"] !==
        candidateBytes.byteLength ||
      (candidateCatalogEntry["kind"] === "accepted-e0-v1-reference"
        ? candidateMetadata["acceptedPrettyFileSha256"] !==
          candidateCatalogEntry["sha256"]
        : candidateLiteralId !== "representative-f3-valid" ||
          candidateMetadata["acceptedPrettyFileSha256"] !==
            REPRESENTATIVE_F3_PRETTY_SOURCE_SHA256) ||
      candidateMetadata["preservationPolicy"] !==
        expectedPrivateCandidatePreservationPolicy(candidateLiteralId) ||
      !exactKeys(validation, [
        "candidateCanonicalMaterializedByteLength",
        "candidateCanonicalMaterializedSha256",
        "semanticValidation",
        "structuralDecode",
      ]) ||
      validation["candidateCanonicalMaterializedSha256"] !==
        sha256(candidateBytes) ||
      validation["candidateCanonicalMaterializedByteLength"] !==
        candidateBytes.byteLength ||
      !jsonDeepEqual(validation["structuralDecode"], {
        outcome: "accepted",
        callsDuringPreparation: 1,
        callsDuringPublication: 0,
        repairs: 0,
      }) ||
      !jsonDeepEqual(validation["semanticValidation"], {
        outcome: "accepted",
        callsDuringPreparation: 1,
        callsDuringPublication: 0,
        repairs: 0,
      }) ||
      !jsonDeepEqual(command, decision.simulation.command) ||
      !jsonDeepEqual(
        privateMaterial["disclosedImpact"],
        argument["disclosedImpact"],
      ) ||
      !jsonDeepEqual(
        privateMaterial["expectedRetirement"],
        command["retirement"],
      ) ||
      !privatePendingRequestsSnapshotMatches(privateMaterial, before) ||
      !jsonDeepEqual(bookmarks["before"], before["bookmarks"]) ||
      !jsonDeepEqual(bookmarks["after"], after["bookmarks"]) ||
      !jsonDeepEqual(bookmarks["focusTarget"], afterFocus["target"]) ||
      !jsonDeepEqual(bookmarks["quickEntryTemplate"], quickEntryTemplate) ||
      bookmarks["repairCallsDuringPreparation"] !== 1 ||
      bookmarks["repairCallsDuringPublication"] !== 0 ||
      !jsonDeepEqual(history["after"], after["history"]) ||
      history["estimatorCallsDuringPreparation"] !== 1 ||
      history["estimatorCallsDuringPublication"] !== 0 ||
      history["entryRetainedBytesEstimate"] !==
        (isObject(history["entry"])
          ? history["entry"]["retainedBytesEstimate"]
          : undefined) ||
      history["totalRetainedBytesAfterPublication"] !==
        (isObject(after["history"])
          ? after["history"]["retainedBytesEstimate"]
          : undefined) ||
      publication["revisionIncrement"] !==
        Number(after["revision"]) - Number(before["revision"]) ||
      !jsonDeepEqual(
        publication["replacementOwnedProjection"],
        replacementOwnedProjection,
      ) ||
      !jsonDeepEqual(
        publication["focusRequestTemplate"],
        focusRequestTemplate,
      ) ||
      !jsonDeepEqual(
        publication["optionalWarningNoticeTemplate"],
        noticeTemplates[0] ?? null,
      ) ||
      !jsonDeepEqual(publication["effects"], result["effects"]) ||
      !jsonDeepEqual(publication["counters"], result["counters"]) ||
      publication["installCount"] !== 1 ||
      publication["listenerNotificationCount"] !== 1
    ) {
      throw new Error("BRIDGE_OWNER_ORACLE_PRIVATE_MATERIAL");
    }
  };

  const conformanceOwnerRunIds = [...runById.entries()]
    .filter(
      ([, run]) =>
        run.ownerProof && !run.e0V2Owned && run.runRole === "conformance",
    )
    .map(([runId]) => runId);
  requireExact(
    conformanceOwnerRunIds,
    EXPECTED_A0_CONFORMANCE_RUN_IDS,
    "BRIDGE_OWNER_CONFORMANCE_INVENTORY",
    "owner-port-cases.json",
    "The independent owner oracle must cover the exact closed A0 conformance-run inventory in declaration order.",
    findings,
  );

  const prepareRefusalCodesWitnessed = new Set<string>();
  const missingPublishEventsByRunId: Readonly<
    Record<string, readonly string[]>
  > = {
    "BRIDGE-REP-030/consumed-replay": ["lookup.consumed-entry-empty"],
    "BRIDGE-REP-030/invalidated-replay": ["lookup.invalidated-entry-empty"],
    "BRIDGE-REP-030/structural-lookalike": [
      "lookup.no-authoritative-entry",
      "reject.lookalike-without-private-entry",
    ],
    "BRIDGE-REP-030/mutation-006-consumed": ["lookup.consumed-entry-empty"],
  };

  const assertExactOwnerOracleProjection = (
    run: MaterializedRunProjection,
    expected: Readonly<{
      result: unknown;
      after: unknown;
      registryAfter: unknown;
      counters: unknown;
      events: unknown;
      workBound: unknown;
    }>,
  ): void => {
    if (
      !jsonDeepEqual(run.exactTypedResult, expected.result) ||
      !jsonDeepEqual(run.controllerStateAfter, expected.after) ||
      !jsonDeepEqual(run.registryAfter, expected.registryAfter) ||
      !jsonDeepEqual(run.exactCounters, expected.counters) ||
      !jsonDeepEqual(run.synchronousEventOrder, expected.events) ||
      !jsonDeepEqual(run.workBound, expected.workBound)
    ) {
      throw new Error("BRIDGE_OWNER_ORACLE_EXACT_PROJECTION");
    }
  };

  for (const [fullRunId, run] of runById) {
    if (!run.ownerProof || run.e0V2Owned) continue;
    if (run.ownerLawOracle["outcome"] !== "pass") continue;
    const argumentsValue = Array.isArray(run.rawCall["arguments"])
      ? run.rawCall["arguments"]
      : [];
    const argument = isObject(argumentsValue[0]) ? argumentsValue[0] : {};
    const before = isObject(run.controllerStateBefore)
      ? run.controllerStateBefore
      : {};
    const registryBefore = isObject(run.registryBefore)
      ? run.registryBefore
      : {};
    const beforeEntries = recordsAt(registryBefore["entries"]);
    try {
      if (
        run.rawCall["target"] !== "A0E0InterchangeOwnerOperations" ||
        run.rawCall["operation"] !== run.operation ||
        run.rawCall["invocation"] !== "synchronous"
      ) {
        throw new Error("BRIDGE_OWNER_ORACLE_CALL_BOUNDARY");
      }
      if (run.operation === "prepareImportReplacementPublication") {
        const decision = derivePrepareOracle(
          before,
          registryBefore,
          argument,
          run.historyEstimatorLawInput,
        );
        if (run.runRole === "conformance") {
          const tableCode =
            PREPARE_REFUSAL_BY_CONFORMANCE_RUN_ID[
              fullRunId as keyof typeof PREPARE_REFUSAL_BY_CONFORMANCE_RUN_ID
            ];
          if (
            (PREPARE_SUCCESS_RUN_IDS.has(fullRunId) &&
              decision.code !== null) ||
            (!PREPARE_SUCCESS_RUN_IDS.has(fullRunId) &&
              tableCode !== decision.code)
          ) {
            throw new Error("BRIDGE_OWNER_ORACLE_PREPARE_CLOSED_TABLE");
          }
        }
        const success = decision.code === null;
        if (!success) prepareRefusalCodesWitnessed.add(decision.code);
        const expectedResult = success
          ? { ok: true, value: decision.prepared }
          : { ok: false, code: decision.code };
        const reachedThroughIndex = PREPARE_SUCCESS_EVENTS.indexOf(
          decision.reachedThrough,
        );
        if (reachedThroughIndex < 0) {
          throw new Error("BRIDGE_PREPARE_EVENT_CHECKPOINT");
        }
        const reached = (
          event: (typeof PREPARE_SUCCESS_EVENTS)[number],
        ): boolean =>
          PREPARE_SUCCESS_EVENTS.indexOf(event) <= reachedThroughIndex;
        const expectedCounters = completeOwnerCounters(run.operation, {
          controllerStateReads: 1,
          f2DecodeDocumentShape: reached("call.f2") ? 1 : 0,
          f3ValidateDocumentSemantics: reached("call.f3") ? 1 : 0,
          bookmarkRepair: reached("repair.bookmarks-and-focus") ? 1 : 0,
          historyEstimator: reached("estimate.history") ? 1 : 0,
          registryLookups: reached("inspect.registry-capacity-one") ? 1 : 0,
          registryAllocations: success ? 1 : 0,
        });
        const refusalPrefix = PREPARE_SUCCESS_EVENTS.slice(
          0,
          reachedThroughIndex + 1,
        );
        const expectedEvents = success
          ? PREPARE_SUCCESS_EVENTS
          : decision.code === "import.replacement_preparation_busy"
            ? PREPARE_BUSY_EVENTS
            : [
                ...refusalPrefix,
                `refuse.${decision.code}`,
                "return.refused-no-allocation",
              ];
        let expectedRegistryAfter: unknown = registryBefore;
        if (success) {
          const afterEntries = recordsAt(
            isObject(run.registryAfter)
              ? run.registryAfter["entries"]
              : undefined,
          );
          const entry = afterEntries[0];
          if (
            beforeEntries.length !== 0 ||
            afterEntries.length !== 1 ||
            entry === undefined ||
            entry["status"] !== "prepared" ||
            !jsonDeepEqual(entry["key"], decision.prepared?.["identity"]) ||
            !jsonDeepEqual(entry["preparedEcho"], decision.prepared) ||
            !isObject(entry["privateMaterial"])
          ) {
            throw new Error("BRIDGE_OWNER_ORACLE_PREPARE_REGISTRY");
          }
          assertPrivateMaterialMatchesSimulation(
            entry["privateMaterial"],
            before,
            argument,
            decision,
          );
          expectedRegistryAfter = {
            capacity: 1,
            entries: [entry],
          };
        }
        assertExactOwnerOracleProjection(run, {
          result: expectedResult,
          after: before,
          registryAfter: expectedRegistryAfter,
          counters: expectedCounters,
          events: expectedEvents,
          workBound: fixedOwnerWorkBound(
            run.operation,
            recordsAt(
              isObject(expectedRegistryAfter)
                ? expectedRegistryAfter["entries"]
                : undefined,
            ).length,
          ),
        });
      } else if (run.operation === "discardImportReplacementPublication") {
        const identity = isObject(argument["identity"])
          ? argument["identity"]
          : {};
        if (
          stableJson(Object.keys(argument).sort(codeUnitCompare)) !==
            stableJson(["identity", "reason"]) ||
          !DISCARD_REASONS.includes(
            argument["reason"] as (typeof DISCARD_REASONS)[number],
          )
        ) {
          throw new Error("BRIDGE_OWNER_ORACLE_DISCARD_REQUEST");
        }
        const matchingEntry = beforeEntries.find((entry) =>
          jsonDeepEqual(entry["key"], identity),
        );
        const remainingEntries = beforeEntries.filter(
          (entry) => entry !== matchingEntry,
        );
        const expectedRegistryAfter = {
          capacity: 1,
          entries: remainingEntries,
        };
        const expectedEvents =
          matchingEntry !== undefined
            ? [
                "call.discard",
                "validate.reason",
                "lookup.match",
                "remove.entry",
                "return.live-zero",
              ]
            : beforeEntries.length === 0
              ? [
                  "call.discard",
                  "validate.reason",
                  "lookup.empty",
                  "return.live-zero",
                ]
              : [
                  "call.discard",
                  "validate.reason",
                  "lookup.no-match",
                  "preserve.unrelated-entry",
                  "return.live-zero-for-request",
                ];
        assertExactOwnerOracleProjection(run, {
          result: {
            outcome: "invalidated-by-request",
            identity,
            liveForRequest: 0,
          },
          after: before,
          registryAfter: expectedRegistryAfter,
          counters: completeOwnerCounters(run.operation, {
            registryLookups: 1,
            registryInvalidations: matchingEntry === undefined ? 0 : 1,
          }),
          events: expectedEvents,
          workBound: fixedOwnerWorkBound(
            run.operation,
            remainingEntries.length,
          ),
        });
      } else if (run.operation === "publishImportReplacement") {
        const prepared = isObject(argument["prepared"])
          ? argument["prepared"]
          : {};
        const identity = isObject(prepared["identity"])
          ? prepared["identity"]
          : {};
        const matchingEntry = beforeEntries.find((entry) =>
          jsonDeepEqual(entry["key"], identity),
        );
        const beforeDocument = isObject(before["document"])
          ? before["document"]
          : {};
        let expectedResult: unknown;
        let expectedAfter: unknown = before;
        let expectedRegistryAfter: unknown = registryBefore;
        let expectedEvents: readonly string[];
        let registryConsumptions = 0;
        let installs = 0;
        let listeners = 0;
        if (matchingEntry === undefined) {
          const missingEvents = missingPublishEventsByRunId[fullRunId];
          if (missingEvents === undefined) {
            throw new Error("BRIDGE_OWNER_ORACLE_MISSING_HISTORY_EVENT");
          }
          expectedResult = {
            ok: false,
            outcome: "refused",
            code: "import.replacement_preparation_missing",
            identity,
            observedDocumentId: beforeDocument["id"],
            observedRevision: before["revision"],
            liveForRequest: 0,
          };
          expectedEvents = [
            "call.publish",
            "read.controller-state",
            ...missingEvents,
            "return.refused-live-zero",
          ];
        } else {
          registryConsumptions = 1;
          expectedRegistryAfter = { capacity: 1, entries: [] };
          const privateMaterial = isObject(matchingEntry["privateMaterial"])
            ? matchingEntry["privateMaterial"]
            : {};
          const echoMismatch = !jsonDeepEqual(
            matchingEntry["preparedEcho"],
            prepared,
          );
          const bookmarksAndFocus = isObject(
            privateMaterial["bookmarksAndFocus"],
          )
            ? privateMaterial["bookmarksAndFocus"]
            : {};
          const currentRequest = recordsAt(before["pendingRequests"]).find(
            (request) =>
              request["kind"] === "document-transition" &&
              request["id"] === identity["requestId"] &&
              request["documentId"] === identity["documentId"] &&
              request["baseRevision"] === identity["baseRevision"] &&
              request["status"] === "running",
          );
          const currentTransition = isObject(before["documentTransition"])
            ? before["documentTransition"]
            : {};
          const committingTransition = isObject(
            prepared["committingTransition"],
          )
            ? prepared["committingTransition"]
            : {};
          const expectedRetiringTransition = {
            ...committingTransition,
            kind: "retiring-transport",
          };
          const stale =
            identity["documentId"] !== beforeDocument["id"] ||
            identity["baseRevision"] !== before["revision"] ||
            !privatePendingRequestsSnapshotMatches(privateMaterial, before) ||
            currentRequest === undefined ||
            !jsonDeepEqual(currentTransition, expectedRetiringTransition) ||
            !jsonDeepEqual(before["bookmarks"], bookmarksAndFocus["before"]) ||
            before["nextSequence"] === MAX_APPLICATION_SEQUENCE;
          const retirement = isObject(argument["retirement"])
            ? argument["retirement"]
            : {};
          const latestTransport = isObject(before["transport"])
            ? before["transport"]
            : {};
          const retirementMismatch =
            !jsonDeepEqual(privateMaterial["expectedRetirement"], retirement) ||
            !Number.isSafeInteger(retirement["retiredTransportGeneration"]) ||
            !Number.isSafeInteger(latestTransport["generation"]) ||
            Number(retirement["retiredTransportGeneration"]) <
              Number(latestTransport["generation"]);
          if (echoMismatch) {
            expectedResult = {
              ok: false,
              outcome: "refused",
              code: "import.replacement_preparation_missing",
              identity,
              observedDocumentId: beforeDocument["id"],
              observedRevision: before["revision"],
              liveForRequest: 0,
            };
            expectedEvents = [
              "call.publish",
              "read.controller-state",
              "lookup.match",
              "compare.prepared-echo-mismatch",
              "consume.entry-before-return",
              "return.refused-live-zero",
            ];
          } else if (stale) {
            expectedResult = {
              ok: false,
              outcome: "refused",
              code: "import.replacement_preparation_stale",
              identity,
              observedDocumentId: beforeDocument["id"],
              observedRevision: before["revision"],
              liveForRequest: 0,
            };
            expectedEvents = [
              "call.publish",
              "read.controller-state",
              "lookup.exact-live-entry",
              "compare.preparation-stale",
              "consume.entry-before-return",
              "return.refused-live-zero",
            ];
          } else if (retirementMismatch) {
            expectedResult = {
              ok: false,
              outcome: "refused",
              code: "import.replacement_retirement_mismatch",
              identity,
              observedDocumentId: beforeDocument["id"],
              observedRevision: before["revision"],
              liveForRequest: 0,
            };
            expectedEvents = [
              "call.publish",
              "read.controller-state",
              "lookup.exact-live-entry",
              "compare.retirement-mismatch",
              "consume.entry-before-return",
              "return.refused-live-zero",
            ];
          } else {
            const publication = isObject(privateMaterial["publication"])
              ? privateMaterial["publication"]
              : {};
            expectedAfter = constructLatestReplacementPublicationState(
              before,
              privateMaterial,
            );
            if (!isObject(expectedAfter)) {
              throw new Error("BRIDGE_OWNER_ORACLE_PUBLICATION_MERGE");
            }
            const afterDocument =
              isObject(expectedAfter) && isObject(expectedAfter["document"])
                ? expectedAfter["document"]
                : {};
            expectedResult = {
              ok: true,
              outcome: "committed",
              identity,
              documentId: afterDocument["id"],
              revision: isObject(expectedAfter)
                ? expectedAfter["revision"]
                : undefined,
              effects: publication["effects"],
              counters: publication["counters"],
              liveForRequest: 0,
            };
            installs = 1;
            listeners = 1;
            expectedEvents = [
              "call.publish",
              "read.controller-state",
              "lookup.exact-live-entry",
              "compare.exact-retirement",
              "consume.entry-before-publish",
              "construct.private-command",
              "install.next-state",
              "notify.after-install",
              "return.committed-state-free-live-zero",
            ];
          }
        }
        assertExactOwnerOracleProjection(run, {
          result: expectedResult,
          after: expectedAfter,
          registryAfter: expectedRegistryAfter,
          counters: completeOwnerCounters(run.operation, {
            controllerStateReads: 1,
            controllerStateInstalls: installs,
            listenerCallbacks: listeners,
            registryLookups: 1,
            registryConsumptions,
          }),
          events: expectedEvents,
          workBound: fixedOwnerWorkBound(run.operation, 0),
        });
      } else if (run.operation === "readCurrentApplicationDocumentIdentity") {
        const document = isObject(before["document"]) ? before["document"] : {};
        assertExactOwnerOracleProjection(run, {
          result: { documentId: document["id"], revision: before["revision"] },
          after: before,
          registryAfter: registryBefore,
          counters: completeOwnerCounters(run.operation, {
            controllerStateReads: 1,
          }),
          events: [
            "call.read-identity",
            "read.controller-closure",
            "project.document-id-and-revision",
            "return.synchronously",
          ],
          workBound: fixedOwnerWorkBound(run.operation, 0),
        });
      } else if (run.operation === "publishCanonicalExportRevision") {
        const publication = isObject(argument["publication"])
          ? argument["publication"]
          : {};
        const document = isObject(before["document"]) ? before["document"] : {};
        const validEnvelope =
          stableJson(Object.keys(argument).sort(codeUnitCompare)) ===
            stableJson(["publication"]) &&
          stableJson(Object.keys(publication).sort(codeUnitCompare)) ===
            stableJson(["documentId", "revision", "schema"]) &&
          publication["schema"] ===
            "changes.canonical-export-revision-publication.v1" &&
          typeof publication["documentId"] === "string" &&
          publication["documentId"].length > 0 &&
          Number.isSafeInteger(publication["revision"]) &&
          Number(publication["revision"]) >= 0;
        const exactIdentity =
          publication["documentId"] === document["id"] &&
          publication["revision"] === before["revision"];
        const replay =
          exactIdentity && before["exportRevision"] === publication["revision"];
        let expectedResult: unknown;
        let expectedAfter: unknown = before;
        let expectedEvents: readonly string[];
        let installs = 0;
        let listeners = 0;
        if (!validEnvelope) {
          expectedResult = {
            ok: false,
            outcome: "refused",
            code: "export.marker_publication_failed",
            observedDocumentId: document["id"],
            observedRevision: before["revision"],
          };
          expectedEvents = [
            "call.publish-marker",
            "validate.schema-refuse",
            "read.controller-state-for-refusal",
            "return.no-install-no-listener",
          ];
        } else if (!exactIdentity) {
          expectedResult = {
            ok: false,
            outcome: "refused",
            code: "export.marker_publication_stale",
            observedDocumentId: document["id"],
            observedRevision: before["revision"],
          };
          expectedEvents = [
            "call.publish-marker",
            "validate.envelope",
            "read.controller-state",
            publication["documentId"] !== document["id"]
              ? "compare.document-stale"
              : "compare.revision-stale",
            "return.no-install-no-listener",
          ];
        } else if (replay) {
          expectedResult = {
            ok: true,
            outcome: "published",
            documentId: document["id"],
            revision: before["revision"],
          };
          expectedEvents = [
            "call.publish-marker",
            "validate.envelope",
            "read.controller-state",
            "compare.document-id",
            "compare.revision",
            "observe.marker-already-equal",
            "return.no-install-no-listener",
          ];
        } else {
          expectedResult = {
            ok: true,
            outcome: "published",
            documentId: document["id"],
            revision: before["revision"],
          };
          expectedAfter = {
            ...before,
            exportRevision: publication["revision"],
          };
          installs = 1;
          listeners = 1;
          expectedEvents = [
            "call.publish-marker",
            "validate.envelope",
            "read.controller-state",
            "compare.document-id",
            "compare.revision",
            "create.exportRevision-only-state",
            "install.state",
            "notify.listeners-after-install",
            "return.state-free",
          ];
          if (fullRunId === "BRIDGE-MARK-009/marker-9") {
            expectedEvents = [
              ...expectedEvents,
              "owner-return-complete",
              "queued-edit-installs-only-after-return",
            ];
          }
        }
        assertExactOwnerOracleProjection(run, {
          result: expectedResult,
          after: expectedAfter,
          registryAfter: registryBefore,
          counters: completeOwnerCounters(run.operation, {
            controllerStateReads: 1,
            controllerStateInstalls: installs,
            listenerCallbacks: listeners,
          }),
          events: expectedEvents,
          workBound: fixedOwnerWorkBound(run.operation, 0),
        });
      } else {
        throw new Error("BRIDGE_OWNER_ORACLE_OPERATION");
      }
    } catch (error) {
      addFinding(
        findings,
        "BRIDGE_OWNER_EXHAUSTIVE_ORACLE",
        `owner-port-cases.json.${fullRunId}`,
        `Every A0 conformance/pass-killer run must satisfy the independently derived exact result, state, registry, counters, event order, and work law (${error instanceof Error ? error.message : "unknown"}).`,
      );
    }
  }

  requireExact(
    [...prepareRefusalCodesWitnessed].sort(codeUnitCompare),
    [
      "application.revision_exhausted",
      "application.sequence_exhausted",
      "history.nonundoable_confirmation_required",
      "import.candidate_semantic_invalid",
      "import.candidate_structural_invalid",
      "import.confirmation_identity_mismatch",
      "import.confirmation_impact_mismatch",
      "import.confirmation_stale",
      "import.confirmation_wrong_document",
      "import.replacement_command_id_invalid",
      "import.replacement_command_label_invalid",
      "import.replacement_history_estimate_failed",
      "import.replacement_impact_mismatch",
      "import.replacement_impact_unavailable",
      "import.replacement_logical_time_invalid",
      "import.replacement_preparation_busy",
      "import.replacement_request_invalid",
      "import.replacement_request_stale",
      "import.replacement_transition_mismatch",
      "import.replacement_wrong_document",
    ],
    "BRIDGE_OWNER_PREPARE_REFUSAL_COVERAGE",
    "owner-port-cases.json.replacementCases",
    "All twenty closed owner preparation refusals require at least one independently derived A0 run.",
    findings,
  );

  const assertPreparedPrivatePublication = (
    run: MaterializedRunProjection,
    argument: JsonObject,
    result: JsonObject,
  ): void => {
    const before = isObject(run.controllerStateBefore)
      ? run.controllerStateBefore
      : {};
    const after = isObject(run.controllerStateAfter)
      ? run.controllerStateAfter
      : {};
    const entry = recordsAt(
      isObject(run.registryBefore) ? run.registryBefore["entries"] : undefined,
    )[0];
    const privateMaterial =
      entry !== undefined && isObject(entry["privateMaterial"])
        ? entry["privateMaterial"]
        : null;
    const prepared = isObject(argument["prepared"])
      ? argument["prepared"]
      : null;
    const retirement = isObject(argument["retirement"])
      ? argument["retirement"]
      : null;
    if (
      entry === undefined ||
      privateMaterial === null ||
      prepared === null ||
      retirement === null ||
      stableJson(Object.keys(privateMaterial).sort(codeUnitCompare)) !==
        stableJson(PRIVATE_IMPORT_REPLACEMENT_MATERIAL_KEYS) ||
      stableJson(entry["key"]) !== stableJson(prepared["identity"]) ||
      stableJson(entry["preparedEcho"]) !== stableJson(prepared) ||
      stableJson(privateMaterial["expectedRetirement"]) !==
        stableJson(retirement)
    ) {
      throw new Error("BRIDGE_PRIVATE_MATERIAL_ENVELOPE");
    }

    const matchingPreparations = [...runById.values()].filter(
      (candidate) =>
        candidate.runRole === "conformance" &&
        candidate.ownerProof &&
        candidate.operation === "prepareImportReplacementPublication" &&
        isObject(candidate.exactTypedResult) &&
        candidate.exactTypedResult["ok"] === true &&
        stableJson(candidate.registryAfter) === stableJson(run.registryBefore),
    );
    if (matchingPreparations.length !== 1) {
      throw new Error("BRIDGE_PRIVATE_MATERIAL_PREPARATION_COUNT");
    }
    const preparation = matchingPreparations[0] as MaterializedRunProjection;
    const preparationArguments = Array.isArray(preparation.rawCall["arguments"])
      ? preparation.rawCall["arguments"]
      : [];
    const preparationArgument = isObject(preparationArguments[0])
      ? preparationArguments[0]
      : {};
    const preparationResult = isObject(preparation.exactTypedResult)
      ? preparation.exactTypedResult
      : {};
    if (
      preparationResult["ok"] !== true ||
      stableJson(preparationResult["value"]) !== stableJson(prepared) ||
      stableJson(privateMaterial["disclosedImpact"]) !==
        stableJson(preparationArgument["disclosedImpact"]) ||
      !isObject(preparation.controllerStateBefore) ||
      !privatePendingRequestsSnapshotMatches(
        privateMaterial,
        preparation.controllerStateBefore,
      ) ||
      !privatePendingRequestsSnapshotMatches(privateMaterial, before)
    ) {
      throw new Error("BRIDGE_PRIVATE_MATERIAL_PREPARATION_BINDING");
    }

    const candidate = isObject(privateMaterial["candidate"])
      ? privateMaterial["candidate"]
      : {};
    const candidateLiteralId = candidate["literalId"];
    const candidateDocument =
      typeof candidateLiteralId === "string"
        ? materializedCatalog.get(candidateLiteralId)
        : undefined;
    const candidateEntry =
      typeof candidateLiteralId === "string" &&
      isObject(literalCatalog[candidateLiteralId])
        ? literalCatalog[candidateLiteralId]
        : {};
    const candidateBytes = new TextEncoder().encode(
      stableJson(candidateDocument),
    );
    const afterDocument = after["document"];
    if (
      !isCompleteDocumentLiteral(candidateDocument) ||
      stableJson(candidateDocument) !== stableJson(afterDocument) ||
      candidate["documentId"] !==
        (isObject(afterDocument) ? afterDocument["id"] : undefined) ||
      candidate["canonicalMaterializedSha256"] !== sha256(candidateBytes) ||
      candidate["canonicalMaterializedByteLength"] !==
        candidateBytes.byteLength ||
      (candidateEntry["kind"] === "accepted-e0-v1-reference"
        ? candidate["acceptedPrettyFileSha256"] !== candidateEntry["sha256"]
        : candidateLiteralId !== "representative-f3-valid" ||
          candidate["acceptedPrettyFileSha256"] !==
            REPRESENTATIVE_F3_PRETTY_SOURCE_SHA256) ||
      candidate["preservationPolicy"] !==
        expectedPrivateCandidatePreservationPolicy(candidateLiteralId)
    ) {
      throw new Error("BRIDGE_PRIVATE_MATERIAL_CANDIDATE");
    }

    const command = isObject(privateMaterial["command"])
      ? privateMaterial["command"]
      : {};
    const commandSeed = isObject(preparationArgument["replacementCommandSeed"])
      ? preparationArgument["replacementCommandSeed"]
      : {};
    const preparationIdentity = isObject(preparationArgument["identity"])
      ? preparationArgument["identity"]
      : {};
    const undoDisposition = isObject(command["undoDisposition"])
      ? command["undoDisposition"]
      : {};
    if (
      command["id"] !== commandSeed["id"] ||
      command["label"] !== commandSeed["label"] ||
      command["logicalTimeMs"] !== commandSeed["logicalTimeMs"] ||
      command["expectedDocumentId"] !== preparationIdentity["documentId"] ||
      command["expectedRevision"] !== preparationIdentity["baseRevision"] ||
      command["requestId"] !== preparationIdentity["requestId"] ||
      command["kind"] !== "replace-document" ||
      command["origin"] !== preparationArgument["replacementOrigin"] ||
      command["coalescing"] !== null ||
      stableJson(command["candidate"]) !== stableJson(candidateDocument) ||
      stableJson(command["retirement"]) !== stableJson(retirement) ||
      (prepared["committingTransition"] as JsonObject | undefined)?.[
        "undoDisposition"
      ] !==
        (undoDisposition["kind"] === "retain"
          ? "retained"
          : undoDisposition["kind"])
    ) {
      throw new Error("BRIDGE_PRIVATE_MATERIAL_COMMAND");
    }

    const validation = isObject(privateMaterial["validation"])
      ? privateMaterial["validation"]
      : {};
    const structuralDecode = isObject(validation["structuralDecode"])
      ? validation["structuralDecode"]
      : {};
    const semanticValidation = isObject(validation["semanticValidation"])
      ? validation["semanticValidation"]
      : {};
    const preparationCounters = isObject(preparation.exactCounters)
      ? preparation.exactCounters
      : {};
    if (
      structuralDecode["outcome"] !== "accepted" ||
      structuralDecode["callsDuringPreparation"] !==
        preparationCounters["f2DecodeDocumentShape"] ||
      structuralDecode["callsDuringPublication"] !==
        (isObject(run.exactCounters)
          ? run.exactCounters["f2DecodeDocumentShape"]
          : undefined) ||
      structuralDecode["repairs"] !== 0 ||
      semanticValidation["outcome"] !== "accepted" ||
      semanticValidation["callsDuringPreparation"] !==
        preparationCounters["f3ValidateDocumentSemantics"] ||
      semanticValidation["callsDuringPublication"] !==
        (isObject(run.exactCounters)
          ? run.exactCounters["f3ValidateDocumentSemantics"]
          : undefined) ||
      semanticValidation["repairs"] !== 0 ||
      validation["candidateCanonicalMaterializedSha256"] !==
        sha256(candidateBytes) ||
      validation["candidateCanonicalMaterializedByteLength"] !==
        candidateBytes.byteLength
    ) {
      throw new Error("BRIDGE_PRIVATE_MATERIAL_VALIDATION");
    }

    const bookmarksAndFocus = isObject(privateMaterial["bookmarksAndFocus"])
      ? privateMaterial["bookmarksAndFocus"]
      : {};
    const afterFocus = isObject(after["focusRequest"])
      ? after["focusRequest"]
      : {};
    const afterQuickEntry = isObject(after["quickEntry"])
      ? after["quickEntry"]
      : {};
    const expectedQuickEntryTemplate = {
      text: afterQuickEntry["text"],
      target: afterQuickEntry["target"],
      status: afterQuickEntry["status"],
      issueCodes: afterQuickEntry["issueCodes"],
    };
    if (
      stableJson(bookmarksAndFocus["before"]) !==
        stableJson(
          isObject(preparation.controllerStateBefore)
            ? preparation.controllerStateBefore["bookmarks"]
            : undefined,
        ) ||
      stableJson(bookmarksAndFocus["after"]) !==
        stableJson(after["bookmarks"]) ||
      stableJson(bookmarksAndFocus["focusTarget"]) !==
        stableJson(afterFocus["target"]) ||
      stableJson(bookmarksAndFocus["quickEntryTemplate"]) !==
        stableJson(expectedQuickEntryTemplate) ||
      bookmarksAndFocus["repairCallsDuringPreparation"] !==
        preparationCounters["bookmarkRepair"] ||
      bookmarksAndFocus["repairCallsDuringPublication"] !==
        (isObject(run.exactCounters)
          ? run.exactCounters["bookmarkRepair"]
          : undefined)
    ) {
      throw new Error("BRIDGE_PRIVATE_MATERIAL_BOOKMARKS");
    }

    const history = isObject(privateMaterial["history"])
      ? privateMaterial["history"]
      : {};
    if (
      stableJson(history["after"]) !== stableJson(after["history"]) ||
      history["estimatorCallsDuringPreparation"] !==
        preparationCounters["historyEstimator"] ||
      history["estimatorCallsDuringPublication"] !==
        (isObject(run.exactCounters)
          ? run.exactCounters["historyEstimator"]
          : undefined) ||
      history["entryRetainedBytesEstimate"] !==
        (isObject(history["entry"])
          ? history["entry"]["retainedBytesEstimate"]
          : undefined) ||
      history["totalRetainedBytesAfterPublication"] !==
        (isObject(after["history"])
          ? after["history"]["retainedBytesEstimate"]
          : undefined)
    ) {
      throw new Error("BRIDGE_PRIVATE_MATERIAL_HISTORY");
    }
    if (history["retentionDecision"] === "retained") {
      const undo =
        isObject(after["history"]) && Array.isArray(after["history"]["undo"])
          ? after["history"]["undo"]
          : [];
      if (stableJson(undo.at(-1)) !== stableJson(history["entry"])) {
        throw new Error("BRIDGE_PRIVATE_MATERIAL_HISTORY_ENTRY");
      }
    } else if (
      history["retentionDecision"] !== "explicitly-unavailable-entry-omitted"
    ) {
      throw new Error("BRIDGE_PRIVATE_MATERIAL_HISTORY_DECISION");
    }

    const publication = isObject(privateMaterial["publication"])
      ? privateMaterial["publication"]
      : {};
    const replacementOwned = isObject(publication["replacementOwnedProjection"])
      ? publication["replacementOwnedProjection"]
      : {};
    const noticeTemplates = recordsAt(replacementOwned["noticeTemplates"]);
    const expectedNoticeTemplates = recordsAt(after["notices"]).map(
      (notice) => ({
        level: notice["level"],
        code: notice["code"],
        message: notice["message"],
        dismissible: notice["dismissible"],
      }),
    );
    const expectedMergedAfter = constructLatestReplacementPublicationState(
      before,
      privateMaterial,
    );
    if (
      stableJson(Object.keys(publication).sort(codeUnitCompare)) !==
        stableJson([
          "counters",
          "effects",
          "focusRequestTemplate",
          "installCount",
          "listenerNotificationCount",
          "optionalWarningNoticeTemplate",
          "replacementOwnedProjection",
          "revisionIncrement",
        ]) ||
      stableJson(Object.keys(replacementOwned).sort(codeUnitCompare)) !==
        stableJson([
          "bookmarks",
          "document",
          "documentTransition",
          "history",
          "importDraft",
          "noticeTemplates",
          "pendingRequests",
          "quickEntryTemplate",
        ]) ||
      publication["revisionIncrement"] !== 1 ||
      !jsonDeepEqual(expectedMergedAfter, after) ||
      !jsonDeepEqual(replacementOwned["document"], after["document"]) ||
      !jsonDeepEqual(replacementOwned["history"], after["history"]) ||
      !jsonDeepEqual(replacementOwned["bookmarks"], after["bookmarks"]) ||
      !jsonDeepEqual(
        replacementOwned["quickEntryTemplate"],
        expectedQuickEntryTemplate,
      ) ||
      !jsonDeepEqual(replacementOwned["importDraft"], after["importDraft"]) ||
      !jsonDeepEqual(
        replacementOwned["pendingRequests"],
        after["pendingRequests"],
      ) ||
      !jsonDeepEqual(
        replacementOwned["documentTransition"],
        after["documentTransition"],
      ) ||
      !jsonDeepEqual(noticeTemplates, expectedNoticeTemplates) ||
      !jsonDeepEqual(publication["focusRequestTemplate"], {
        target: afterFocus["target"],
        reason: afterFocus["reason"],
      }) ||
      !jsonDeepEqual(
        publication["optionalWarningNoticeTemplate"],
        expectedNoticeTemplates[0] ?? null,
      ) ||
      stableJson(publication["effects"]) !== stableJson(result["effects"]) ||
      stableJson(publication["counters"]) !== stableJson(result["counters"]) ||
      publication["installCount"] !==
        (isObject(run.exactCounters)
          ? run.exactCounters["controllerStateInstalls"]
          : undefined) ||
      publication["listenerNotificationCount"] !==
        (isObject(run.exactCounters)
          ? run.exactCounters["listenerCallbacks"]
          : undefined)
    ) {
      throw new Error("BRIDGE_PRIVATE_MATERIAL_PUBLICATION");
    }
  };

  for (const run of runById.values()) {
    if (!run.ownerProof || run.runRole === "mutation-killer") continue;
    const caseRecord = caseById.get(run.caseId) ?? {};
    const operation = caseRecord["operation"];
    const argumentsValue = isUnknownArray(run.rawCall["arguments"])
      ? run.rawCall["arguments"]
      : [];
    const argument = argumentsValue[0];
    const result = isObject(run.exactTypedResult) ? run.exactTypedResult : {};
    const before = isObject(run.controllerStateBefore)
      ? run.controllerStateBefore
      : {};
    const after = isObject(run.controllerStateAfter)
      ? run.controllerStateAfter
      : {};
    const registryBefore = isObject(run.registryBefore)
      ? run.registryBefore
      : {};
    const registryAfter = isObject(run.registryAfter) ? run.registryAfter : {};
    const runCounters = isObject(run.exactCounters) ? run.exactCounters : {};
    const beforeEntries = recordsAt(registryBefore["entries"]);
    const afterEntries = recordsAt(registryAfter["entries"]);
    try {
      if (operation === "prepareImportReplacementPublication") {
        if (!isObject(argument)) throw new Error("BRIDGE_PREPARE_ARGUMENT");
        if (result["ok"] === true) {
          const prepared = isObject(result["value"]) ? result["value"] : {};
          const entry = afterEntries[0] ?? {};
          if (
            beforeEntries.length !== 0 ||
            afterEntries.length !== 1 ||
            stableJson(prepared["identity"]) !==
              stableJson(argument["identity"]) ||
            stableJson(entry["key"]) !== stableJson(argument["identity"]) ||
            stableJson(entry["preparedEcho"]) !== stableJson(prepared)
          ) {
            throw new Error("BRIDGE_PREPARE_SUCCESS_BINDING");
          }
        } else if (
          result["ok"] !== false ||
          stableJson(registryBefore) !== stableJson(registryAfter) ||
          stableJson(before) !== stableJson(after)
        ) {
          throw new Error("BRIDGE_PREPARE_REFUSAL_EFFECT");
        }
      } else if (operation === "discardImportReplacementPublication") {
        if (
          !isObject(argument) ||
          result["outcome"] !== "invalidated-by-request" ||
          result["liveForRequest"] !== 0 ||
          stableJson(result["identity"]) !== stableJson(argument["identity"]) ||
          stableJson(before) !== stableJson(after)
        ) {
          throw new Error("BRIDGE_DISCARD_BINDING");
        }
      } else if (operation === "publishImportReplacement") {
        if (!isObject(argument) || !isObject(argument["prepared"])) {
          throw new Error("BRIDGE_PUBLISH_ARGUMENT");
        }
        if (
          stableJson(result["identity"]) !==
            stableJson(argument["prepared"]["identity"]) ||
          result["liveForRequest"] !== 0 ||
          afterEntries.length !== 0 ||
          [
            "f2DecodeDocumentShape",
            "f3ValidateDocumentSemantics",
            "historyEstimator",
            "bookmarkRepair",
          ].some((key) => runCounters[key] !== 0)
        ) {
          throw new Error("BRIDGE_PUBLISH_BINDING");
        }
        if (result["ok"] === true) {
          const afterDocument = isObject(after["document"])
            ? after["document"]
            : {};
          if (
            result["outcome"] !== "committed" ||
            result["documentId"] !== afterDocument["id"] ||
            result["revision"] !== after["revision"] ||
            stableJson(argument["prepared"]["candidateDocumentId"]) !==
              stableJson(afterDocument["id"])
          ) {
            throw new Error("BRIDGE_PUBLISH_SUCCESS_STATE");
          }
          assertPreparedPrivatePublication(run, argument, result);
        } else if (
          result["ok"] !== false ||
          result["observedDocumentId"] !==
            (isObject(before["document"])
              ? before["document"]["id"]
              : undefined) ||
          result["observedRevision"] !== before["revision"] ||
          stableJson(before) !== stableJson(after)
        ) {
          throw new Error("BRIDGE_PUBLISH_REFUSAL_STATE");
        }
      } else if (operation === "readCurrentApplicationDocumentIdentity") {
        if (
          result["documentId"] !==
            (isObject(before["document"])
              ? before["document"]["id"]
              : undefined) ||
          result["revision"] !== before["revision"] ||
          stableJson(before) !== stableJson(after) ||
          stableJson(registryBefore) !== stableJson(registryAfter)
        ) {
          throw new Error("BRIDGE_IDENTITY_LATEST_STATE");
        }
      } else if (operation === "publishCanonicalExportRevision") {
        if (!isObject(argument) || !isObject(argument["publication"])) {
          throw new Error("BRIDGE_MARKER_ARGUMENT");
        }
        const publication = argument["publication"];
        const beforeDocument = isObject(before["document"])
          ? before["document"]
          : {};
        if (result["ok"] === true) {
          if (
            result["outcome"] !== "published" ||
            result["documentId"] !== publication["documentId"] ||
            result["revision"] !== publication["revision"] ||
            publication["documentId"] !== beforeDocument["id"] ||
            publication["revision"] !== before["revision"] ||
            after["exportRevision"] !== publication["revision"]
          ) {
            throw new Error("BRIDGE_MARKER_SUCCESS_BINDING");
          }
        } else if (
          result["ok"] !== false ||
          result["observedDocumentId"] !== beforeDocument["id"] ||
          result["observedRevision"] !== before["revision"] ||
          stableJson(before) !== stableJson(after)
        ) {
          throw new Error("BRIDGE_MARKER_REFUSAL_BINDING");
        }
      }
    } catch (error) {
      addFinding(
        findings,
        "BRIDGE_LITERAL_RESULT_LAW",
        `owner-port-cases.json.${run.caseId}/${run.runId}`,
        `Literal request, result, state, registry, and recomputation counters must satisfy the owner law (${error instanceof Error ? error.message : "unknown"}).`,
      );
    }
  }

  for (const record of allCases) {
    const caseId = String(record["id"]);
    for (const run of recordsAt(record["runs"])) {
      const nearMiss = run["oneFieldNearMiss"];
      const correlatedNearMiss = run["correlatedStateNearMiss"];
      if (nearMiss !== null) {
        if (!isObject(nearMiss)) {
          addFinding(
            findings,
            "BRIDGE_NEAR_MISS_SHAPE",
            `owner-port-cases.json.${caseId}/${String(run["id"])}`,
            "Near-miss evidence must be null or one exact replace/add mutation.",
          );
        } else {
          const current = runById.get(`${caseId}/${String(run["id"])}`);
          const baselineId = nearMiss["baselineRunId"];
          const baseline =
            typeof baselineId === "string"
              ? runById.get(baselineId)
              : undefined;
          try {
            const operator = nearMiss["operator"];
            const pointer = nearMiss["jsonPointer"];
            const materializedFrom = materializeBridgeTemplate(
              nearMiss["from"],
              literalContext,
              baseline?.controllerStateBefore,
              new Set(),
            );
            const materializedTo = materializeBridgeTemplate(
              nearMiss["to"],
              literalContext,
              baseline?.controllerStateBefore,
              new Set(),
            );
            const baselineValue =
              typeof pointer === "string"
                ? valueAtJsonPointer(baseline?.comparisonInput, pointer)
                : undefined;
            const currentValue =
              typeof pointer === "string"
                ? valueAtJsonPointer(current?.comparisonInput, pointer)
                : undefined;
            if (
              current === undefined ||
              baseline === undefined ||
              (operator !== "replace" && operator !== "add") ||
              typeof pointer !== "string" ||
              nearMiss["exactChangedFieldCount"] !== 1 ||
              (operator === "add"
                ? baselineValue !== undefined ||
                  !isObject(materializedFrom) ||
                  materializedFrom["$absent"] !== true
                : !jsonDeepEqual(baselineValue, materializedFrom)) ||
              !jsonDeepEqual(currentValue, materializedTo)
            ) {
              throw new Error("BRIDGE_NEAR_MISS_POINTER");
            }
            const changed = jsonDiffPointers(
              baseline.comparisonInput,
              current.comparisonInput,
            );
            if (changed.length !== 1 || changed[0] !== pointer) {
              throw new Error("BRIDGE_NEAR_MISS_CHANGE_COUNT");
            }
          } catch (error) {
            addFinding(
              findings,
              "BRIDGE_NEAR_MISS_LITERAL",
              `owner-port-cases.json.${caseId}/${String(run["id"])}.oneFieldNearMiss`,
              `Near miss must change exactly the declared materialized field from the baseline (${error instanceof Error ? error.message : "unknown"}).`,
            );
          }
        }
      }
      if (correlatedNearMiss === undefined || correlatedNearMiss === null) {
        continue;
      }
      try {
        if (nearMiss !== null || !isObject(correlatedNearMiss)) {
          throw new Error("BRIDGE_CORRELATED_NEAR_MISS_EXCLUSIVE_SHAPE");
        }
        const expectedKeys = [
          "baselineRunId",
          "exactChangedFieldCount",
          "from",
          "jsonPointers",
          "operator",
          "to",
        ];
        const pointers = stringsAt(correlatedNearMiss["jsonPointers"]);
        const fromValues = correlatedNearMiss["from"];
        const toValues = correlatedNearMiss["to"];
        const baselineId = correlatedNearMiss["baselineRunId"];
        const baseline =
          typeof baselineId === "string" ? runById.get(baselineId) : undefined;
        const current = runById.get(`${caseId}/${String(run["id"])}`);
        const descriptor = isObject(run["controllerStateBefore"])
          ? run["controllerStateBefore"]
          : {};
        const descriptorPatches = recordsAt(descriptor["patches"]);
        const descriptorPointers = descriptorPatches.map((patch) =>
          typeof patch["jsonPointer"] === "string"
            ? `/controllerState${patch["jsonPointer"]}`
            : "",
        );
        if (
          stableJson(Object.keys(correlatedNearMiss).sort(codeUnitCompare)) !==
            stableJson(expectedKeys) ||
          correlatedNearMiss["operator"] !== "replace" ||
          baseline === undefined ||
          current === undefined ||
          pointers.length < 2 ||
          !Array.isArray(correlatedNearMiss["jsonPointers"]) ||
          pointers.length !== correlatedNearMiss["jsonPointers"].length ||
          new Set(pointers).size !== pointers.length ||
          !Array.isArray(fromValues) ||
          !Array.isArray(toValues) ||
          fromValues.length !== pointers.length ||
          toValues.length !== pointers.length ||
          correlatedNearMiss["exactChangedFieldCount"] !== pointers.length ||
          descriptorPatches.length !== pointers.length ||
          descriptorPatches.some((patch) => patch["op"] !== "replace") ||
          !jsonDeepEqual(descriptorPointers, pointers)
        ) {
          throw new Error("BRIDGE_CORRELATED_NEAR_MISS_SHAPE");
        }
        for (const [index, pointer] of pointers.entries()) {
          const materializedFrom = materializeBridgeTemplate(
            fromValues[index],
            literalContext,
            baseline.controllerStateBefore,
            new Set(),
          );
          const materializedTo = materializeBridgeTemplate(
            toValues[index],
            literalContext,
            baseline.controllerStateBefore,
            new Set(),
          );
          if (
            !jsonDeepEqual(
              valueAtJsonPointer(baseline.comparisonInput, pointer),
              materializedFrom,
            ) ||
            !jsonDeepEqual(
              valueAtJsonPointer(current.comparisonInput, pointer),
              materializedTo,
            ) ||
            jsonDeepEqual(materializedFrom, materializedTo)
          ) {
            throw new Error("BRIDGE_CORRELATED_NEAR_MISS_POINTER");
          }
        }
        const changed = jsonDiffPointers(
          baseline.comparisonInput,
          current.comparisonInput,
        );
        if (
          changed.length !== pointers.length ||
          !jsonDeepEqual(
            [...changed].sort(codeUnitCompare),
            [...pointers].sort(codeUnitCompare),
          )
        ) {
          throw new Error("BRIDGE_CORRELATED_NEAR_MISS_CHANGE_SET");
        }
      } catch (error) {
        addFinding(
          findings,
          "BRIDGE_CORRELATED_NEAR_MISS_LITERAL",
          `owner-port-cases.json.${caseId}/${String(run["id"])}.correlatedStateNearMiss`,
          `A correlated valid-state near miss must declare every ordered descriptor patch and independently equal the complete baseline/current comparison-input diff (${error instanceof Error ? error.message : "unknown"}).`,
        );
      }
    }
  }

  const allowedCategories = new Set([
    "positive",
    "negative-near-miss",
    "stale-concurrent",
    "malformed-owner-input",
    "replay",
    "transposition-applicability",
    "negative-mutation-control",
  ]);
  for (const record of allCases) {
    const id = String(record["id"]);
    const expectedMutationKills = stringsAt(record["expectedMutationKills"]);
    if (
      !A0_E0_BRIDGE_OWNER_OPERATION_NAMES.includes(
        record[
          "operation"
        ] as (typeof A0_E0_BRIDGE_OWNER_OPERATION_NAMES)[number],
      ) ||
      !allowedCategories.has(String(record["category"])) ||
      stringsAt(record["traceIds"]).length === 0 ||
      expectedMutationKills.length === 0
    ) {
      addFinding(
        findings,
        "BRIDGE_CASE_INCOMPLETE",
        id,
        "Each A0 owner case needs a closed operation/category, literal run, mutation kills, and reciprocal trace.",
      );
    }
    for (const traceId of stringsAt(record["traceIds"])) {
      const trace = traceById.get(traceId);
      if (trace === undefined || !stringsAt(trace["caseIds"]).includes(id)) {
        addFinding(
          findings,
          "BRIDGE_CASE_TRACE_LINK",
          `${id}.traceIds.${traceId}`,
          "A0 case and trace links must be reciprocal.",
        );
      }
    }
    for (const controlId of expectedMutationKills) {
      const control = controlById.get(controlId);
      if (
        control === undefined ||
        !stringsAt(control["linkedCaseIds"]).includes(id)
      ) {
        addFinding(
          findings,
          "BRIDGE_CASE_CONTROL_LINK",
          `${id}.expectedMutationKills.${controlId}`,
          "Case and mutation links must be reciprocal.",
        );
      }
    }
  }

  for (const control of controls) {
    const id = String(control["id"]);
    const baselineRunId = control["baselineRunId"];
    const killerRunId = control["killerRunId"];
    const baseline =
      typeof baselineRunId === "string"
        ? runById.get(baselineRunId)
        : undefined;
    const killer =
      typeof killerRunId === "string" ? runById.get(killerRunId) : undefined;
    const mutation = isObject(control["mutation"]) ? control["mutation"] : {};
    const observation = isObject(control["observation"])
      ? control["observation"]
      : {};
    const expectedDifference = isObject(control["exactExpectedDifference"])
      ? control["exactExpectedDifference"]
      : {};
    const oracleExpectation = isObject(control["oracleExpectation"])
      ? control["oracleExpectation"]
      : {};
    const mutationMaterialization = mutation["materialization"];
    const observationMaterialization = observation["materialization"];
    const allowedMutationMaterializations = new Set([
      "comparisonInput",
      "rawCall",
      "controllerStateBefore",
      "registryBefore",
      "registryLawInput",
      "exactTypedResult",
      "synchronousEventOrder",
      "workBound",
      "historyEstimatorLawInput",
      "scenarioFinalState",
      "referenceIdentityExpectations",
      "publicationMergeObservation",
    ]);
    const allowedObservationMaterializations = new Set([
      "exactTypedResult",
      "exactCounters",
      "registryAfter",
      "controllerStateAfter",
      "ownerLawOracle",
      "scenarioFinalState",
    ]);
    try {
      if (
        stableJson(Object.keys(control).sort(codeUnitCompare)) !==
          stableJson([
            "authorityIds",
            "baselineRunId",
            "category",
            "exactExpectedDifference",
            "id",
            "killerRunId",
            "linkedCaseIds",
            "mutation",
            "observation",
            "oracleExpectation",
          ]) ||
        typeof control["category"] !== "string" ||
        typeof baselineRunId !== "string" ||
        typeof killerRunId !== "string" ||
        baselineRunId === killerRunId ||
        baseline === undefined ||
        killer === undefined ||
        baseline === killer ||
        baseline.runRole !== "conformance" ||
        killer.runRole !== "mutation-killer" ||
        baseline.operation !== killer.operation ||
        !baseline.ownerProof ||
        !killer.ownerProof ||
        baseline.e0V2Owned ||
        killer.e0V2Owned ||
        stableJson(Object.keys(mutation).sort(codeUnitCompare)) !==
          stableJson([
            "exactChangedFieldCount",
            "from",
            "jsonPointer",
            "materialization",
            "operator",
            "to",
          ]) ||
        stableJson(Object.keys(observation).sort(codeUnitCompare)) !==
          stableJson([
            "baselineValue",
            "jsonPointer",
            "killerValue",
            "materialization",
          ]) ||
        (oracleExpectation["outcome"] === "pass"
          ? stableJson(oracleExpectation) !== stableJson({ outcome: "pass" })
          : oracleExpectation["outcome"] !== "killed" ||
            typeof oracleExpectation["code"] !== "string" ||
            stableJson(Object.keys(oracleExpectation).sort(codeUnitCompare)) !==
              stableJson(["code", "outcome"])) ||
        !allowedMutationMaterializations.has(String(mutationMaterialization)) ||
        !allowedObservationMaterializations.has(
          String(observationMaterialization),
        ) ||
        !["replace", "add", "move", "swap", "truncate-and-return"].includes(
          String(mutation["operator"]),
        ) ||
        typeof mutation["jsonPointer"] !== "string" ||
        mutation["exactChangedFieldCount"] !== 1 ||
        typeof observation["jsonPointer"] !== "string" ||
        (mutationMaterialization === observationMaterialization &&
          mutation["jsonPointer"] === observation["jsonPointer"])
      ) {
        throw new Error("BRIDGE_CONTROL_SHAPE");
      }
      const materializedMutationFrom = materializeBridgeTemplate(
        mutation["from"],
        literalContext,
        baseline.controllerStateBefore,
        new Set(),
      );
      const materializedMutationTo = materializeBridgeTemplate(
        mutation["to"],
        literalContext,
        baseline.controllerStateBefore,
        new Set(),
      );
      const mutationTarget = projectionForMutationTarget(
        baseline,
        String(mutationMaterialization),
      );
      const mutationOperator = String(mutation["operator"]);
      let mutated: unknown;
      if (mutationOperator === "move" || mutationOperator === "swap") {
        if (
          !isUnknownArray(mutationTarget) ||
          typeof materializedMutationTo !== "string" ||
          stableJson(
            valueAtJsonPointer(mutationTarget, mutation["jsonPointer"]),
          ) !== stableJson(materializedMutationFrom)
        ) {
          throw new Error("BRIDGE_CONTROL_MUTATION_FROM_TO");
        }
        const sourceTokens = decodeJsonPointer(mutation["jsonPointer"]);
        const targetTokens = decodeJsonPointer(materializedMutationTo);
        if (
          sourceTokens?.length !== 1 ||
          targetTokens?.length !== 1 ||
          !/^\d+$/u.test(sourceTokens[0] ?? "") ||
          !/^\d+$/u.test(targetTokens[0] ?? "")
        ) {
          throw new Error("BRIDGE_CONTROL_MUTATION_ARRAY_POINTER");
        }
        const sourceIndex = Number(sourceTokens[0]);
        const targetIndex = Number(targetTokens[0]);
        const next = [...mutationTarget];
        if (mutationOperator === "swap") {
          if (
            sourceIndex >= next.length ||
            targetIndex >= next.length ||
            sourceIndex === targetIndex
          ) {
            throw new Error("BRIDGE_CONTROL_MUTATION_SWAP_INDEX");
          }
          [next[sourceIndex], next[targetIndex]] = [
            next[targetIndex],
            next[sourceIndex],
          ];
        } else {
          const [moved] = next.splice(sourceIndex, 1);
          const adjustedTarget =
            sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
          next.splice(adjustedTarget, 0, moved);
        }
        mutated = next;
      } else if (mutationOperator === "truncate-and-return") {
        if (!isUnknownArray(mutationTarget)) {
          throw new Error("BRIDGE_CONTROL_MUTATION_TRUNCATE_TARGET");
        }
        const tokens = decodeJsonPointer(mutation["jsonPointer"]);
        if (tokens?.length !== 1 || !/^\d+$/u.test(tokens[0] ?? "")) {
          throw new Error("BRIDGE_CONTROL_MUTATION_ARRAY_POINTER");
        }
        const index = Number(tokens[0]);
        if (
          !jsonDeepEqual(
            mutationTarget.slice(index),
            materializedMutationFrom,
          ) ||
          !isUnknownArray(materializedMutationTo)
        ) {
          throw new Error("BRIDGE_CONTROL_MUTATION_FROM_TO");
        }
        mutated = [
          ...mutationTarget.slice(0, index),
          ...materializedMutationTo,
        ];
      } else {
        const observedBefore = valueAtJsonPointer(
          mutationTarget,
          mutation["jsonPointer"],
        );
        if (
          (mutationOperator === "add"
            ? observedBefore !== undefined ||
              !isObject(materializedMutationFrom) ||
              materializedMutationFrom["$absent"] !== true
            : !jsonDeepEqual(observedBefore, materializedMutationFrom)) ||
          jsonDeepEqual(materializedMutationFrom, materializedMutationTo)
        ) {
          throw new Error("BRIDGE_CONTROL_MUTATION_FROM_TO");
        }
        mutated = applyPointerMutation(
          mutationTarget,
          mutationOperator,
          mutation["jsonPointer"],
          materializedMutationFrom,
          materializedMutationTo,
        );
      }
      if (jsonDeepEqual(mutationTarget, mutated)) {
        throw new Error("BRIDGE_CONTROL_MUTATION_COUNT");
      }
      const killerMutationTarget = projectionForMutationTarget(
        killer,
        String(mutationMaterialization),
      );
      if (stableJson(mutated) !== stableJson(killerMutationTarget)) {
        throw new Error("BRIDGE_CONTROL_KILLER_NOT_MUTATED_BASELINE");
      }
      const invariantMaterializations = [
        "rawCall",
        "controllerStateBefore",
        "registryBefore",
      ].filter((materialization) => {
        if (mutationMaterialization === "comparisonInput") {
          return ![
            "rawCall",
            "controllerStateBefore",
            "registryBefore",
          ].includes(materialization);
        }
        if (mutationMaterialization === "registryLawInput") {
          return materialization !== "registryBefore";
        }
        return materialization !== mutationMaterialization;
      });
      if (
        invariantMaterializations.some(
          (materialization) =>
            stableJson(
              projectionForMutationTarget(baseline, materialization),
            ) !==
            stableJson(projectionForMutationTarget(killer, materialization)),
        )
      ) {
        throw new Error("BRIDGE_CONTROL_UNDECLARED_INPUT_LAW_DRIFT");
      }
      const probe = killer.mutationProbe;
      const probeObservation =
        probe !== null && isObject(probe["downstreamObservation"])
          ? probe["downstreamObservation"]
          : {};
      if (
        probe === null ||
        probe["baselineRunId"] !== baselineRunId ||
        probe["sourceMaterialization"] !== mutationMaterialization ||
        stableJson(probe["baselineLaw"]) !== stableJson(mutationTarget) ||
        stableJson(probe["mutatedLaw"]) !== stableJson(killerMutationTarget) ||
        probeObservation["materialization"] !== observationMaterialization ||
        probeObservation["jsonPointer"] !== observation["jsonPointer"] ||
        stableJson(probeObservation["baselineValue"]) !==
          stableJson(observation["baselineValue"]) ||
        stableJson(probeObservation["killerValue"]) !==
          stableJson(observation["killerValue"]) ||
        stableJson(probe["expectedOwnerLaw"]) !== stableJson(oracleExpectation)
      ) {
        throw new Error("BRIDGE_CONTROL_MUTATION_PROBE_BINDING");
      }
      const recomputedBoundaryExpectation =
        killer.ownerLawOracle["outcome"] === "pass"
          ? { outcome: "pass" }
          : killer.ownerLawOracle;
      if (
        stableJson(recomputedBoundaryExpectation) !==
        stableJson(oracleExpectation)
      ) {
        throw new Error("BRIDGE_CONTROL_OWNER_LAW_ORACLE");
      }
      if (oracleExpectation["outcome"] === "killed") {
        const allowedChangedRuntimeProjections = new Set<string>([
          String(mutationMaterialization),
        ]);
        if (id === "BRIDGE-MUT-029") {
          allowedChangedRuntimeProjections.add("controllerStateAfter");
          allowedChangedRuntimeProjections.add("exactCounters");
          allowedChangedRuntimeProjections.add("exactControllerStateDelta");
          allowedChangedRuntimeProjections.add("referenceIdentityExpectations");
        }
        if (id === "BRIDGE-MUT-031") {
          allowedChangedRuntimeProjections.add("controllerStateAfter");
          allowedChangedRuntimeProjections.add("exactControllerStateDelta");
          allowedChangedRuntimeProjections.add("referenceIdentityExpectations");
          allowedChangedRuntimeProjections.add("publicationMergeObservation");
        }
        const runtimeProjectionPairs = [
          [
            "exactTypedResult",
            baseline.exactTypedResult,
            killer.exactTypedResult,
          ],
          [
            "controllerStateAfter",
            baseline.controllerStateAfter,
            killer.controllerStateAfter,
          ],
          ["registryAfter", baseline.registryAfter, killer.registryAfter],
          ["exactCounters", baseline.exactCounters, killer.exactCounters],
          [
            "synchronousEventOrder",
            baseline.synchronousEventOrder,
            killer.synchronousEventOrder,
          ],
          [
            "exactControllerStateDelta",
            baseline.exactControllerStateDelta,
            killer.exactControllerStateDelta,
          ],
          [
            "scenarioFinalState",
            baseline.scenarioFinalState,
            killer.scenarioFinalState,
          ],
          [
            "referenceIdentityExpectations",
            baseline.referenceIdentityExpectations,
            killer.referenceIdentityExpectations,
          ],
          [
            "publicationMergeObservation",
            baseline.publicationMergeObservation,
            killer.publicationMergeObservation,
          ],
        ] as const;
        if (
          runtimeProjectionPairs.some(
            ([name, baselineValue, killerValue]) =>
              !allowedChangedRuntimeProjections.has(name) &&
              !jsonDeepEqual(baselineValue, killerValue),
          )
        ) {
          throw new Error("BRIDGE_CONTROL_KILLED_RUNTIME_NOT_INVARIANT");
        }
      }
      const baselineObservationTarget = projectionForMutationTarget(
        baseline,
        String(observationMaterialization),
      );
      const killerObservationTarget = projectionForMutationTarget(
        killer,
        String(observationMaterialization),
      );
      const baselineObserved = valueAtJsonPointer(
        baselineObservationTarget,
        observation["jsonPointer"],
      );
      const killerObserved = valueAtJsonPointer(
        killerObservationTarget,
        observation["jsonPointer"],
      );
      if (
        baselineObserved === undefined ||
        killerObserved === undefined ||
        stableJson(baselineObserved) !==
          stableJson(observation["baselineValue"]) ||
        stableJson(killerObserved) !== stableJson(observation["killerValue"]) ||
        stableJson(baselineObserved) === stableJson(killerObserved)
      ) {
        throw new Error("BRIDGE_CONTROL_OBSERVATION");
      }
      requireExact(
        expectedDifference,
        {
          baselineValue: observation["baselineValue"],
          killerValue: observation["killerValue"],
        },
        "BRIDGE_CONTROL_EXPECTED_DIFFERENCE",
        `mutation-controls.json.${id}.exactExpectedDifference`,
        "Expected difference must pin the distinct derived baseline and killer observations.",
        findings,
      );
      const linked = stringsAt(control["linkedCaseIds"]);
      if (
        !linked.includes(baseline.caseId) ||
        !linked.includes(killer.caseId) ||
        stringsAt(control["authorityIds"]).length === 0
      ) {
        throw new Error("BRIDGE_CONTROL_LINKED_RUNS");
      }
    } catch (error) {
      addFinding(
        findings,
        "BRIDGE_CONTROL_LITERAL",
        `mutation-controls.json.${id}`,
        `Mutation controls require a one-field owner input/law mutation and a distinct exact derived observation on an owner-proof killer run (${error instanceof Error ? error.message : "unknown"}).`,
      );
    }
    for (const caseId of stringsAt(control["linkedCaseIds"])) {
      const record = caseById.get(caseId);
      if (
        record === undefined ||
        !stringsAt(record["expectedMutationKills"]).includes(id)
      ) {
        addFinding(
          findings,
          "BRIDGE_CONTROL_CASE_LINK",
          `${id}.linkedCaseIds.${caseId}`,
          "Mutation and case links must be reciprocal.",
        );
      }
    }
    for (const authorityId of stringsAt(control["authorityIds"])) {
      if (!authorityById.has(authorityId)) {
        addFinding(
          findings,
          "BRIDGE_CONTROL_AUTHORITY_LINK",
          `${id}.authorityIds.${authorityId}`,
          "Mutation cites an unknown authority.",
        );
      }
    }
  }

  for (const trace of traces) {
    const id = String(trace["id"]);
    const ownerCaseIds = stringsAt(trace["caseIds"]);
    const declaredControlIds = stringsAt(trace["controlIds"]);
    const proofKinds = stringsAt(trace["proofKinds"]);
    if (
      typeof trace["requirement"] !== "string" ||
      !A0_E0_BRIDGE_OWNER_OPERATION_NAMES.includes(
        trace[
          "operation"
        ] as (typeof A0_E0_BRIDGE_OWNER_OPERATION_NAMES)[number],
      ) ||
      ownerCaseIds.length === 0 ||
      declaredControlIds.length === 0 ||
      stringsAt(trace["authorityIds"]).length === 0 ||
      proofKinds.length === 0 ||
      trace["forwardE0V2BehaviorRowsPresent"] !== false ||
      trace["deferredE0V2BindingLeaf"] !==
        "jcpe-milestone-reliable-studio-l3a.8.4" ||
      [
        "forwardE0V2CaseIds",
        "forwardE0V2ProofKinds",
        "forwardE0V2Exclusion",
        "forwardE0V2RowsExcludedFromOwnerProof",
      ].some((key) => Object.hasOwn(trace, key))
    ) {
      addFinding(
        findings,
        "BRIDGE_TRACE_INCOMPLETE",
        id,
        "Each operation trace needs A0 cases, controls, authorities, proof kinds, and an exact non-normative future-E0-v2 boundary declaration.",
      );
    }
    for (const caseId of ownerCaseIds) {
      const record = caseById.get(caseId);
      if (
        record === undefined ||
        record["operation"] !== trace["operation"] ||
        !stringsAt(record["traceIds"]).includes(id)
      ) {
        addFinding(
          findings,
          "BRIDGE_TRACE_CASE_LINK",
          `${id}.caseIds.${caseId}`,
          "Trace and same-operation case links must be reciprocal.",
        );
      }
    }
    const reciprocalControlIds = controls
      .filter((control) =>
        stringsAt(control["linkedCaseIds"]).some((caseId) =>
          ownerCaseIds.includes(caseId),
        ),
      )
      .map((control) => String(control["id"]));
    if (
      new Set(declaredControlIds).size !== declaredControlIds.length ||
      !jsonDeepEqual(declaredControlIds, reciprocalControlIds)
    ) {
      addFinding(
        findings,
        "BRIDGE_TRACE_CONTROL_LINK",
        `${id}.controlIds`,
        "Trace control IDs must be unique and exactly reciprocal with controls linked to at least one same-operation trace case.",
      );
    }
    for (const controlId of declaredControlIds) {
      if (!controlById.has(controlId)) {
        addFinding(
          findings,
          "BRIDGE_TRACE_CONTROL_LINK",
          `${id}.controlIds.${controlId}`,
          "Trace cites an unknown mutation control.",
        );
      }
    }
    for (const authorityId of stringsAt(trace["authorityIds"])) {
      if (!authorityById.has(authorityId)) {
        addFinding(
          findings,
          "BRIDGE_TRACE_AUTHORITY_LINK",
          `${id}.authorityIds.${authorityId}`,
          "Trace cites an unknown authority.",
        );
      }
    }
  }

  requireExact(
    applicabilityRows.map((row) => row["operation"]),
    A0_E0_BRIDGE_OWNER_OPERATION_NAMES,
    "BRIDGE_APPLICABILITY_ORDER",
    "owner-port-cases.json.applicabilityMatrix",
    "Applicability must cover all five ports in contract order.",
    findings,
  );
  requireExact(
    applicabilityRows,
    [
      {
        operation: "prepareImportReplacementPublication",
        synchronization: "synchronous-controller-transaction",
        cancellation: "resolved-before-prepare-no-owner-call",
        staleState: "exact-document-revision-request-and-transition",
        replay: "live-complete-identity-required",
        transposition: "applicable-candidate-preserved-byte-for-byte",
        wallTimeCutoff: "forbidden-count-and-state-bounds-only",
      },
      {
        operation: "discardImportReplacementPublication",
        synchronization: "synchronous-total-cleanup",
        cancellation: "not-applicable-four-closed-failure-reasons-only",
        staleState: "request-keyed-cleanup-remains-total",
        replay: "idempotent-live-for-request-zero",
        transposition: "not-applicable-content-invariant-cleanup",
        wallTimeCutoff: "forbidden-constant-registry-bound",
      },
      {
        operation: "publishImportReplacement",
        synchronization: "synchronous-consume-and-publish",
        cancellation: "not-applicable-once-prepare-begins",
        staleState: "exact-live-preparation-and-retirement-required",
        replay: "consumed-and-invalidated-echoes-refused",
        transposition: "applicable-manual-and-frozen-pitches-preserved",
        wallTimeCutoff: "forbidden-count-and-state-bounds-only",
      },
      {
        operation: "readCurrentApplicationDocumentIdentity",
        synchronization: "synchronous-controller-closure-read",
        cancellation: "not-applicable-pure-identity-read",
        staleState: "always-reads-latest-at-call-time",
        replay: "not-applicable-no-capability-created",
        transposition: "not-applicable-content-invariant-identity",
        wallTimeCutoff: "forbidden-constant-field-read",
      },
      {
        operation: "publishCanonicalExportRevision",
        synchronization:
          "synchronous-validate-compare-conditional-write-notify",
        cancellation: "not-applicable-after-successful-delivery",
        staleState: "exact-document-and-revision-cas",
        replay: "same-marker-idempotent-only-at-exact-current-identity",
        transposition: "not-applicable-content-invariant-marker",
        wallTimeCutoff: "forbidden-constant-field-compare-and-write",
      },
    ],
    "BRIDGE_APPLICABILITY_ROW",
    "owner-port-cases.json.applicabilityMatrix",
    "The fixture applicability rows must be an exact literal projection of the source owner applicability table.",
    findings,
  );

  const cleanupCase = caseById.get("BRIDGE-REP-027") ?? {};
  const cleanupRuns = recordsAt(cleanupCase["runs"]).filter(
    (run) => run["runRole"] !== "mutation-killer",
  );
  for (const reason of DISCARD_REASONS) {
    const first = runById.get(`BRIDGE-REP-027/${reason}-first`);
    const repeat = runById.get(`BRIDGE-REP-027/${reason}-repeat`);
    const firstArgument = isUnknownArray(first?.rawCall["arguments"])
      ? first.rawCall["arguments"][0]
      : undefined;
    const repeatArgument = isUnknownArray(repeat?.rawCall["arguments"])
      ? repeat.rawCall["arguments"][0]
      : undefined;
    if (
      first === undefined ||
      repeat === undefined ||
      !isObject(firstArgument) ||
      !isObject(repeatArgument) ||
      firstArgument["reason"] !== reason ||
      repeatArgument["reason"] !== reason
    ) {
      addFinding(
        findings,
        "BRIDGE_DISCARD_IDEMPOTENCE",
        `owner-port-cases.json.BRIDGE-REP-027.${reason}`,
        "Each exact cleanup reason must have literal first and repeat calls.",
      );
    }
  }
  if (cleanupRuns.length !== DISCARD_REASONS.length * 2) {
    addFinding(
      findings,
      "BRIDGE_DISCARD_RUN_COUNT",
      "owner-port-cases.json.BRIDGE-REP-027.runs",
      "Cleanup requires exactly eight runs: first and repeat for all four reasons.",
    );
  }
  for (const requiredCaseId of [
    "BRIDGE-REP-003",
    "BRIDGE-REP-028",
    "BRIDGE-REP-029",
    "BRIDGE-REP-030",
    "BRIDGE-ID-004",
    "BRIDGE-MARK-009",
    "BRIDGE-MARK-010",
    "BRIDGE-MARK-012",
  ]) {
    if (!caseById.has(requiredCaseId)) {
      addFinding(
        findings,
        "BRIDGE_REQUIRED_CASE",
        requiredCaseId,
        "Required transposition, isolation, replay, concurrency, or late-completion case is missing.",
      );
    }
  }

  const independence = isObject(provenance["independence"])
    ? provenance["independence"]
    : {};
  const expectedIndependence = {
    fixtureAuthoringProductionImportsForbidden: true,
    productionModulesUsedOnlyAsConformanceSubjects: true,
    productionOutputUsedAsOracle: false,
    expectedValuesGenerated: false,
    fixturesHandAuthored: true,
    acceptedE0FixturesRewritten: false,
    acceptedE0BytePinsRecomputedToPermitDrift: false,
    acceptedE0V1DocsSourceValidatorTestsSupportOrReviewRewritten: false,
    acceptedE0V1SemanticsReinterpreted: false,
    semanticCompatibilityClaim: false,
    semanticE0BindingClaimed: false,
    semanticBindingDeferredTo: "jcpe-milestone-reliable-studio-l3a.8.4",
    semanticBindingRequiresExplicitProjectOwnerAcceptance: true,
    bridgeProductionImplementationAvailableWhenAuthored: false,
    controllerImplementationClaimed: false,
    browserOrRealAdapterProofClaimed: false,
    unknownFallibleReturnNormalizationClaimed: false,
    cleanupExactTotalOperation: true,
    proposedOwnerResultsContainAppState: false,
    wallTimeAffectsOutcome: false,
    musicalContentInspectedByIdentityOrMarkerPorts: false,
  } as const;
  requireExact(
    independence,
    expectedIndependence,
    "BRIDGE_INDEPENDENCE",
    "provenance-ledger.json.independence",
    "Fixture independence, implementation status, or state-isolation claims changed.",
    findings,
  );
  const provenanceVersionBoundary = isObject(provenance["versionBoundary"])
    ? provenance["versionBoundary"]
    : {};
  if (
    contract["activeLeafScope"] !==
      provenanceVersionBoundary["activeLeafScope"] ||
    contract["browserProofClaim"] !==
      provenanceVersionBoundary["browserClaim"] ||
    contract["browserProofClaim"] !==
      independence["browserOrRealAdapterProofClaimed"] ||
    contract["humanAcceptanceClaim"] !== provenance["humanAcceptanceClaim"] ||
    contract["productionOutputUsedAsOracle"] !==
      independence["productionOutputUsedAsOracle"] ||
    contract["expectedValuesGenerated"] !==
      independence["expectedValuesGenerated"] ||
    contract["productionImplementationAvailableWhenAuthored"] !==
      independence["bridgeProductionImplementationAvailableWhenAuthored"]
  ) {
    addFinding(
      findings,
      "BRIDGE_ROOT_PROVENANCE_AGREEMENT",
      "a0-e0-bridge-contract.json",
      "Root scope, browser, human-acceptance, production, and expected-value claims must agree exactly with the provenance ledger.",
    );
  }
  requireExact(
    provenance["versionBoundary"],
    {
      activeLeafScope: "A0-owner-only",
      acceptedE0V1Status: "immutable-archival-accepted-authority",
      semanticCompatibilityClaim: false,
      semanticBindingClaim: false,
      semanticBindingLeaf: "jcpe-milestone-reliable-studio-l3a.8.4",
      semanticBindingRequiresExplicitProjectOwnerAcceptance: true,
      productionClaim: false,
      browserClaim: false,
    },
    "BRIDGE_PROVENANCE_VERSION_BOUNDARY",
    "provenance-ledger.json.versionBoundary",
    "Provenance must claim only the A0 owner proposal and defer E0 binding to an explicitly accepted v2 packet.",
    findings,
  );
  const archivalE0Authority = authorityById.get("BRIDGE-AUTH-E0") ?? {};
  if (
    archivalE0Authority["authorityClass"] !== "archival-consumer-contract" ||
    archivalE0Authority["sourceKind"] !== "accepted-repository-contract" ||
    archivalE0Authority["sourceRef"] !== "docs/E0_INTERCHANGE_CONTRACT.md" ||
    archivalE0Authority["judgmentBearing"] !== false ||
    archivalE0Authority["reviewState"] !==
      "accepted-first-golden-by-project-owner" ||
    typeof archivalE0Authority["scope"] !== "string" ||
    !archivalE0Authority["scope"].includes("grants no compatibility")
  ) {
    addFinding(
      findings,
      "BRIDGE_ARCHIVAL_E0_AUTHORITY",
      "provenance-ledger.json.authorities.BRIDGE-AUTH-E0",
      "Accepted E0 v1 is non-judgment-bearing archival evidence and grants no semantic binding authority to this proposal.",
    );
  }
  if (
    provenance["expertReviewClaim"] !== false ||
    provenance["humanAcceptanceClaim"] !== false
  ) {
    addFinding(
      findings,
      "BRIDGE_REVIEW_CLAIM",
      "provenance-ledger.json",
      "This spec packet cannot claim expert or project-owner acceptance.",
    );
  }

  const sourcePath = resolve(
    REPOSITORY_ROOT,
    "src/application/application-interchange-owner-contract.ts",
  );
  const e0SourcePath = resolve(
    REPOSITORY_ROOT,
    "src/application/e0-interchange-contract.ts",
  );
  try {
    const [ownerSource, e0Source] = await Promise.all([
      readFile(sourcePath, "utf8"),
      readFile(e0SourcePath, "utf8"),
    ]);
    for (const token of [
      "export interface A0E0InterchangeOwnerOperations",
      "export interface A0E0InterchangeOwnerPorts",
      '"specified-unimplemented"',
      "PrepareImportReplacementPublicationOperation",
      "PrepareImportReplacementPublicationPort",
      "DiscardImportReplacementPublicationOperation",
      "PublishImportReplacementOperation",
      "PublishImportReplacementPort",
      "ReadCurrentApplicationDocumentIdentityOperation",
      "ReadCurrentApplicationDocumentIdentityPort",
      "PublishCanonicalExportRevisionOperation",
      "PublishCanonicalExportRevisionPort",
      "IMPORT_REPLACEMENT_PUBLICATION_LATEST_STATE_MERGE",
      "sameRevisionPendingRequestsDriftOutcome",
      "sameRevisionTransitionDriftOutcome",
    ]) {
      if (!ownerSource.includes(token)) {
        addFinding(
          findings,
          "BRIDGE_OWNER_SOURCE_TOKEN",
          sourcePath,
          `Owner type contract is missing ${token}.`,
        );
      }
    }

    const ownerSourceFile = ts.createSourceFile(
      sourcePath,
      ownerSource,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const unwrapOwnerExpression = (input: ts.Expression): ts.Expression => {
      let expression = input;
      for (;;) {
        if (
          ts.isParenthesizedExpression(expression) ||
          ts.isAsExpression(expression) ||
          ts.isSatisfiesExpression(expression) ||
          ts.isTypeAssertionExpression(expression) ||
          ts.isNonNullExpression(expression)
        ) {
          expression = expression.expression;
          continue;
        }
        if (
          ts.isCallExpression(expression) &&
          ts.isPropertyAccessExpression(expression.expression) &&
          ts.isIdentifier(expression.expression.expression) &&
          expression.expression.expression.text === "Object" &&
          expression.expression.name.text === "freeze" &&
          expression.arguments.length === 1
        ) {
          expression = expression.arguments[0] as ts.Expression;
          continue;
        }
        return expression;
      }
    };
    const ownerVariableInitializer = (name: string): ts.Expression | null => {
      for (const statement of ownerSourceFile.statements) {
        if (!ts.isVariableStatement(statement)) continue;
        for (const declaration of statement.declarationList.declarations) {
          if (
            ts.isIdentifier(declaration.name) &&
            declaration.name.text === name &&
            declaration.initializer !== undefined
          ) {
            return unwrapOwnerExpression(declaration.initializer);
          }
        }
      }
      return null;
    };
    const objectPropertyExpression = (
      object: ts.ObjectLiteralExpression,
      name: string,
    ): ts.Expression | null => {
      const property = object.properties.find(
        (candidate): candidate is ts.PropertyAssignment =>
          ts.isPropertyAssignment(candidate) &&
          (ts.isIdentifier(candidate.name) ||
            ts.isStringLiteral(candidate.name)) &&
          candidate.name.text === name,
      );
      return property === undefined
        ? null
        : unwrapOwnerExpression(property.initializer);
    };
    const literalOwnerValue = (expression: ts.Expression | null): unknown => {
      if (expression === null) return undefined;
      if (ts.isStringLiteral(expression)) return expression.text;
      if (expression.kind === ts.SyntaxKind.TrueKeyword) return true;
      if (expression.kind === ts.SyntaxKind.FalseKeyword) return false;
      if (ts.isNumericLiteral(expression)) return Number(expression.text);
      if (ts.isIdentifier(expression)) return { identifier: expression.text };
      if (ts.isArrayLiteralExpression(expression)) {
        return expression.elements.map((element) =>
          literalOwnerValue(unwrapOwnerExpression(element)),
        );
      }
      return undefined;
    };
    const mergeInitializer = ownerVariableInitializer(
      "IMPORT_REPLACEMENT_PUBLICATION_LATEST_STATE_MERGE",
    );
    if (
      mergeInitializer === null ||
      !ts.isObjectLiteralExpression(mergeInitializer)
    ) {
      addFinding(
        findings,
        "BRIDGE_OWNER_SOURCE_MERGE_POLICY",
        sourcePath,
        "The latest-state replacement merge must be a statically inspectable frozen object literal.",
      );
    } else {
      const mergeProjection = Object.fromEntries(
        [
          "latestStateRecheckedAtPublication",
          "frozenPrepareTimeWholeStateInstallAllowed",
          "preparedCommandInputsRechecked",
          "historyStabilityDerivedFromRevisionAndImmutableReducerLaw",
          "sameRevisionPendingRequestsDriftOutcome",
          "sameRevisionTransitionDriftOutcome",
          "sameRevisionBookmarkDriftOutcome",
          "latestTransportGenerationMustNotExceedRetiredGeneration",
          "uncoveredLatestTransportOutcome",
          "latestSequenceMustBeLessThan",
          "exhaustedLatestSequenceOutcome",
          "preservedFromLatestStateByValue",
          "preservedFromLatestStateByReference",
          "replacementOwnedFields",
          "allocatedFromLatestSequenceAtPublication",
          "allAppStateFieldsPartitionedExactlyOnce",
          "optionalWarningNoticeUsesNextSequenceAndSaturatesAtMaximum",
          "rerunsPreparationWork",
        ].map((name) => [
          name,
          literalOwnerValue(objectPropertyExpression(mergeInitializer, name)),
        ]),
      );
      requireExact(
        mergeProjection,
        {
          latestStateRecheckedAtPublication: true,
          frozenPrepareTimeWholeStateInstallAllowed: false,
          preparedCommandInputsRechecked: [
            "documentIdentity",
            "revision",
            "pendingRequestsBefore",
            "transitionIdentity",
            "bookmarks",
          ],
          historyStabilityDerivedFromRevisionAndImmutableReducerLaw: true,
          sameRevisionPendingRequestsDriftOutcome:
            "consume-and-refuse-import.replacement_preparation_stale",
          sameRevisionTransitionDriftOutcome:
            "consume-and-refuse-import.replacement_preparation_stale",
          sameRevisionBookmarkDriftOutcome:
            "consume-and-refuse-import.replacement_preparation_stale",
          latestTransportGenerationMustNotExceedRetiredGeneration: true,
          uncoveredLatestTransportOutcome:
            "consume-and-refuse-import.replacement_retirement_mismatch",
          latestSequenceMustBeLessThan: {
            identifier: "MAX_APPLICATION_SEQUENCE",
          },
          exhaustedLatestSequenceOutcome:
            "consume-and-refuse-import.replacement_preparation_stale",
          preservedFromLatestStateByValue: ["exportRevision"],
          preservedFromLatestStateByReference: [
            "recovery",
            "panels",
            "dialogs",
            "transport",
          ],
          replacementOwnedFields: [
            "document",
            "revision",
            "history",
            "bookmarks",
            "quickEntry",
            "importDraft",
            "pendingRequests",
            "documentTransition",
            "notices",
          ],
          allocatedFromLatestSequenceAtPublication: [
            "focusRequest",
            "nextSequence",
          ],
          allAppStateFieldsPartitionedExactlyOnce: true,
          optionalWarningNoticeUsesNextSequenceAndSaturatesAtMaximum: true,
          rerunsPreparationWork: false,
        },
        "BRIDGE_OWNER_SOURCE_MERGE_POLICY",
        sourcePath,
        "The source latest-state merge policy must exactly match the root packet, including request and transition drift refusal.",
        findings,
      );
    }
    const imports = ownerSourceFile.statements.filter(ts.isImportDeclaration);
    const actualTopology = imports.map((node) => {
      const modulePath = ts.isStringLiteral(node.moduleSpecifier)
        ? node.moduleSpecifier.text
        : "";
      const bindings = node.importClause?.namedBindings;
      const elements =
        bindings !== undefined && ts.isNamedImports(bindings)
          ? bindings.elements.map((element) => ({
              importedName: (element.propertyName ?? element.name).text,
              localName: element.name.text,
              isTypeOnly: element.isTypeOnly,
            }))
          : [];
      return {
        modulePath,
        isTypeOnly:
          node.importClause?.phaseModifier === ts.SyntaxKind.TypeKeyword,
        defaultImport: node.importClause?.name?.text ?? null,
        namedBindingKind:
          bindings === undefined
            ? "none"
            : ts.isNamedImports(bindings)
              ? "named-imports"
              : "namespace-import",
        elements,
        hasImportAttributes: node.attributes !== undefined,
      };
    });
    requireExact(
      actualTopology,
      OWNER_IMPORT_TOPOLOGY,
      "BRIDGE_OWNER_IMPORT_TOPOLOGY",
      sourcePath,
      "The owner contract may import exactly the pinned ordered domain types, A0 runtime bounds, and A0 state types.",
      findings,
    );
    const preprocessedOwnerSource = ts.preProcessFile(ownerSource, true, true);
    if (
      preprocessedOwnerSource.referencedFiles.length !== 0 ||
      preprocessedOwnerSource.typeReferenceDirectives.length !== 0 ||
      preprocessedOwnerSource.libReferenceDirectives.length !== 0 ||
      ownerSourceFile.amdDependencies.length !== 0
    ) {
      addFinding(
        findings,
        "BRIDGE_OWNER_TRIPLE_SLASH_OR_AMD_EDGE",
        sourcePath,
        "The owner contract may not introduce triple-slash path, type, lib, or AMD module dependencies.",
      );
    }
    const forbiddenModuleEdges: string[] = [];
    const inspectModuleEdges = (node: ts.Node): void => {
      if (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined) {
        forbiddenModuleEdges.push("module-bearing-export-declaration");
      } else if (ts.isImportEqualsDeclaration(node)) {
        forbiddenModuleEdges.push("import-equals-declaration");
      } else if (ts.isImportTypeNode(node)) {
        forbiddenModuleEdges.push("import-type-node");
      } else if (ts.isCallExpression(node)) {
        if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
          forbiddenModuleEdges.push("dynamic-import-call");
        } else if (
          ts.isIdentifier(node.expression) &&
          node.expression.text === "require"
        ) {
          forbiddenModuleEdges.push("require-call");
        }
      }
      ts.forEachChild(node, inspectModuleEdges);
    };
    inspectModuleEdges(ownerSourceFile);
    if (forbiddenModuleEdges.length !== 0) {
      addFinding(
        findings,
        "BRIDGE_OWNER_FORBIDDEN_MODULE_EDGE",
        sourcePath,
        `The owner contract may use only the exact pinned static imports; re-exports, import-equals, import types, dynamic import, and require are forbidden (${[...new Set(forbiddenModuleEdges)].join(",")}).`,
      );
    }
    const hasRuntimeImplementation = ownerSourceFile.statements.some(
      (node) =>
        ts.isClassDeclaration(node) ||
        ts.isFunctionDeclaration(node) ||
        (ts.isVariableStatement(node) &&
          node.declarationList.declarations.some(
            (declaration) =>
              declaration.initializer !== undefined &&
              (ts.isArrowFunction(declaration.initializer) ||
                ts.isFunctionExpression(declaration.initializer) ||
                ts.isClassExpression(declaration.initializer)),
          )),
    );
    if (
      hasRuntimeImplementation ||
      ownerSource.includes("e0-interchange-contract")
    ) {
      addFinding(
        findings,
        "BRIDGE_OWNER_SOURCE_IMPLEMENTATION",
        sourcePath,
        "The A0 owner file must remain an unbound specification surface with no function, class, or E0 dependency.",
      );
    }

    const exactInterfaceMembers = (interfaceName: string) => {
      const ownerInterface = ownerSourceFile.statements.find(
        (node): node is ts.InterfaceDeclaration =>
          ts.isInterfaceDeclaration(node) && node.name.text === interfaceName,
      );
      return (
        ownerInterface?.members.map((member) => {
          const propertyMember = ts.isPropertySignature(member) ? member : null;
          const name = propertyMember?.name;
          const memberName =
            name !== undefined &&
            (ts.isIdentifier(name) || ts.isStringLiteral(name))
              ? name.text
              : null;
          const typeName =
            propertyMember?.type !== undefined &&
            ts.isTypeReferenceNode(propertyMember.type) &&
            ts.isIdentifier(propertyMember.type.typeName)
              ? propertyMember.type.typeName.text
              : null;
          return {
            name: memberName,
            readonly:
              propertyMember?.modifiers?.some(
                (modifier) => modifier.kind === ts.SyntaxKind.ReadonlyKeyword,
              ) === true,
            typeName,
          };
        }) ?? []
      );
    };
    const expectedOperationsMembers = A0_E0_BRIDGE_OWNER_OPERATION_NAMES.map(
      (name) => ({
        name,
        readonly: true,
        typeName: `${name[0]?.toUpperCase() ?? ""}${name.slice(1)}Operation`,
      }),
    );
    const expectedPortsMembers = A0_E0_BRIDGE_OWNER_OPERATION_NAMES.map(
      (name) => ({
        name,
        readonly: true,
        typeName: `${name[0]?.toUpperCase() ?? ""}${name.slice(1)}Port`,
      }),
    );
    requireExact(
      exactInterfaceMembers("A0E0InterchangeOwnerOperations"),
      expectedOperationsMembers,
      "BRIDGE_OWNER_OPERATIONS_INTERFACE",
      sourcePath,
      "A0E0InterchangeOwnerOperations must expose exactly five readonly exact-result operation members in contract order.",
      findings,
    );
    requireExact(
      exactInterfaceMembers("A0E0InterchangeOwnerPorts"),
      expectedPortsMembers,
      "BRIDGE_OWNER_PORTS_INTERFACE",
      sourcePath,
      "A0E0InterchangeOwnerPorts must expose exactly five readonly untrusted consumer-port members in contract order.",
      findings,
    );

    const e0SourceFile = ts.createSourceFile(
      e0SourcePath,
      e0Source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const e0ImportsOwner = e0SourceFile.statements.some(
      (node) =>
        ts.isImportDeclaration(node) &&
        ts.isStringLiteral(node.moduleSpecifier) &&
        node.moduleSpecifier.text ===
          "./application-interchange-owner-contract",
    );
    if (e0ImportsOwner) {
      addFinding(
        findings,
        "BRIDGE_ACCEPTED_E0_V1_BOUND_TO_OWNER",
        e0SourcePath,
        "Accepted E0 v1 must remain byte-pinned and must not import the proposed A0 owner surface.",
      );
    }
  } catch {
    addFinding(
      findings,
      "BRIDGE_SOURCE_READ",
      sourcePath,
      "Owner and E0 type-contract sources must be readable.",
    );
  }

  const acceptedE0Pins = isObject(contract["acceptedE0Pins"])
    ? contract["acceptedE0Pins"]
    : {};
  let acceptedE0V1PinnedUnmodified: boolean;
  try {
    const e0Report = await validateE0Contract();
    const e0ByteManifestDigest = sha256(
      new TextEncoder().encode(stableJson(E0_ACCEPTED_BYTE_DIGESTS)),
    );
    const acceptedFixtureRoot = resolve(
      REPOSITORY_ROOT,
      "tests/fixtures/interchange",
    );
    const fixtureHashesMatch = (
      await Promise.all(
        Object.entries(E0_ACCEPTED_BYTE_DIGESTS).map(
          async ([relativePath, expected]) =>
            sha256(
              new Uint8Array(
                await readFile(resolve(acceptedFixtureRoot, relativePath)),
              ),
            ) === expected,
        ),
      )
    ).every(Boolean);
    const artifactHashesMatch = (
      await Promise.all(
        ACCEPTED_E0_V1_ARTIFACT_PINS.map(
          async (pin) =>
            sha256(
              new Uint8Array(
                await readFile(resolve(REPOSITORY_ROOT, pin.path)),
              ),
            ) === pin.sha256,
        ),
      )
    ).every(Boolean);
    acceptedE0V1PinnedUnmodified =
      e0Report.outcome === "pass" &&
      Object.keys(E0_ACCEPTED_BYTE_DIGESTS).length === 16 &&
      fixtureHashesMatch &&
      artifactHashesMatch &&
      e0ByteManifestDigest === A0_E0_BRIDGE_ACCEPTED_E0_BYTE_MANIFEST_DIGEST &&
      e0ByteManifestDigest === acceptedE0Pins["byteManifestDigest"] &&
      E0_ACCEPTED_SEMANTIC_DIGEST === acceptedE0Pins["semanticDigest"] &&
      acceptedE0Pins["version"] === "E0-v1" &&
      acceptedE0Pins["fileCount"] === 16 &&
      acceptedE0Pins["fixtureBytesMayChangeForThisOwnerSpec"] === false;
  } catch {
    acceptedE0V1PinnedUnmodified = false;
  }
  if (!acceptedE0V1PinnedUnmodified) {
    addFinding(
      findings,
      "BRIDGE_ACCEPTED_E0_DRIFT",
      "tests/fixtures/interchange",
      "The accepted E0 v1 validator, 16 fixtures, seven non-fixture artifacts, byte manifest, and semantic digest must remain unchanged and valid.",
    );
  }

  const expectedF3ValidationCalls = [
    ...documentValidationCache.values(),
  ].filter(
    (observation) =>
      observation.stage !== "f2-refused" && observation.stage !== "f2-repaired",
  ).length;
  if (
    expectedAcceptedDocumentOccurrences === 0 ||
    acceptedE0AuthorityDocumentOccurrences === 0 ||
    documentValidationCache.size === 0 ||
    f2DocumentValidationCalls !== documentValidationCache.size ||
    f3DocumentValidationCalls !== expectedF3ValidationCalls ||
    expectedAcceptedDocumentOccurrences < documentValidationCache.size
  ) {
    addFinding(
      findings,
      "BRIDGE_DOCUMENT_VALIDATION_CALLS",
      "owner-port-cases.json.literalCatalog",
      `Every materialized document occurrence must have an independent expected F2/F3 outcome; accepted E0 refs reuse its rerun gate, while each unique new/patched canonical document receives one real F2 and applicable F3 call (occurrences=${String(expectedAcceptedDocumentOccurrences)}, acceptedE0AuthorityOccurrences=${String(acceptedE0AuthorityDocumentOccurrences)}, uniqueNewOrPatched=${String(documentValidationCache.size)}, F2=${String(f2DocumentValidationCalls)}, F3=${String(f3DocumentValidationCalls)}).`,
    );
  }

  const counts = Object.freeze({
    files: actualFiles.length,
    replacementCases: replacementCases.length,
    identityCases: identityCases.length,
    markerCases: markerCases.length,
    applicabilityRows: applicabilityRows.length,
    mutationControls: controls.length,
    traces: traces.length,
    authorities: authorities.length,
  });
  requireExact(
    counts,
    EXPECTED_COUNTS,
    "BRIDGE_COUNTS",
    fixtureRoot,
    "Bridge packet counts differ from the independently authored closure.",
    findings,
  );
  requireExact(
    contract["counts"],
    {
      replacementCases: EXPECTED_COUNTS.replacementCases,
      identityCases: EXPECTED_COUNTS.identityCases,
      markerCases: EXPECTED_COUNTS.markerCases,
      applicabilityRows: EXPECTED_COUNTS.applicabilityRows,
      mutationControls: EXPECTED_COUNTS.mutationControls,
      traces: EXPECTED_COUNTS.traces,
      authorities: EXPECTED_COUNTS.authorities,
    },
    "BRIDGE_DECLARED_COUNTS",
    "a0-e0-bridge-contract.json.counts",
    "Root declared counts must match the ledgers.",
    findings,
  );

  findings.sort(
    (left, right) =>
      codeUnitCompare(left.path, right.path) ||
      codeUnitCompare(left.code, right.code) ||
      codeUnitCompare(left.message, right.message),
  );
  return Object.freeze({
    schema: "changes.validation.a0-e0-bridge-contract.v2",
    package: "A0 interchange owner ports",
    outcome: findings.length === 0 ? "pass" : "fail",
    reviewState: "proposed-independent-spec",
    counts,
    acceptedE0V1PinnedUnmodified,
    semanticCompatibilityClaim: false,
    productionImplementationClaim: false,
    humanAcceptanceClaim: false,
    findings: Object.freeze(findings),
  });
}

if (import.meta.main) {
  const report = await validateA0E0BridgeContract(process.argv[2]);
  console.log(JSON.stringify(report, null, 2));
  if (report.outcome === "fail") process.exitCode = 1;
}
