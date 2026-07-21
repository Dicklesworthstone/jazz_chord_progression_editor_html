import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { createHash } from "node:crypto";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as ts from "typescript";

import {
  CANONICAL_JSON_EXPORT_REFUSAL_CODES,
  CANONICAL_JSON_FORMAT,
  CANONICAL_JSON_KEY_ORDER,
  CANONICAL_JSON_POLICY_ID,
  CANONICAL_JSON_POLICY_VERSION,
  CANONICAL_JSON_ARTIFACT_SCHEMA,
  EXPORT_DELIVERY_CHANNELS,
  EXPORT_DELIVERY_TERMINATIONS,
  EXPORT_FILENAME_FORBIDDEN_CODE_POINTS,
  EXPORT_FILENAME_FORBIDDEN_CODE_POINT_RANGES,
  EXPORT_FILENAME_RESERVED_BASENAMES,
  INTERCHANGE_EXPORT_CONTRACT_SCHEMA,
  INTERCHANGE_EXPORT_OPERATION_NAMES,
  LEAD_SHEET_TEXT_ARTIFACT_SCHEMA,
  LEAD_SHEET_TEXT_EXPORT_REFUSAL_CODES,
  LEAD_SHEET_TEXT_LOSS_CODES,
  LEAD_SHEET_TEXT_LOSS_REPORT_SCHEMA,
  MAX_CANONICAL_JSON_EXPORT_BYTES,
  MAX_EXPORT_FILENAME_BASENAME_CODE_POINTS,
  MAX_LEAD_SHEET_TEXT_EXPORT_BYTES,
  MAX_LEAD_SHEET_TEXT_LOSS_ITEMS,
  SEMANTIC_DOCUMENT_HASH_PATTERN_SOURCE,
  type CanonicalJsonExportDependencies,
  type CanonicalJsonArtifact,
  type CanonicalExportMarkerCandidate,
  type CreateE0ExportOperations,
  type E0ExportCompositionDependencies,
  type ExportDeliveryCleanupComplete,
  type ExportDeliveryArtifactBinding,
  type ExportDeliveryRequest,
  type ExportDeliveryResult,
  type FileSystemAccessCleanupFailure,
  type HashBytes,
  type InterchangeExportOperations,
  type LeadSheetTextExportDependencies,
  type LeadSheetTextArtifact,
  type ObjectUrlCleanupFailure,
  type PrepareCanonicalJsonExport,
  type PrepareCanonicalJsonExportCoordinator,
  type PrepareCanonicalJsonExportRequest,
  type PrepareLeadSheetTextExport,
  type PrepareLeadSheetTextExportCoordinator,
  type PrepareLeadSheetTextExportRequest,
  type PreparedExportDeliveryRequest,
  type PreparedExportDeliveryStart,
  type SemanticDocumentHash,
  type StartPreparedExportDelivery,
} from "../../src/export";
import {
  CHART_IMPORT_DEFAULTS,
  CHART_IMPORT_ID_ALLOCATION_ORDER,
  CHART_IMPORT_PARSE_ACCIDENTAL_STYLE,
  CANONICAL_EXPORT_MARKER_PERSISTENCE_HANDOFF_SCHEMA,
  CANONICAL_EXPORT_REVISION_PUBLICATION_SCHEMA,
  MAX_CANONICAL_EXPORT_PREPARATION_ID,
  MIN_CANONICAL_EXPORT_PREPARATION_ID,
  PREPARED_CANONICAL_EXPORT_DELIVERY_SCHEMA,
  PREPARED_CANONICAL_EXPORT_REGISTRY_STATES,
  E0_IMPORT_TERMINATIONS,
  E0_INTERCHANGE_CONTRACT_SCHEMA,
  E0_INTERCHANGE_OPERATION_NAMES,
  IMPORT_FORMAT_HINTS,
  IMPORT_ISSUE_CODES,
  IMPORT_NONUNDOABLE_CONFIRMATION_SCHEMA,
  IMPORT_PREVIEW_SCHEMA,
  IMPORT_REPLACEMENT_ORIGIN_BY_FORMAT,
  IMPORT_ROUTING_POLICY,
  IMPORT_SOURCE_CHANNELS,
  IMPORT_SOURCE_FORMATS,
  IMPORT_TRANSPORT_WORKFLOW_ACTIONS,
  IMPORT_STAGE_ORDER,
  INTERCHANGE_IMPORT_DRAFT_SCHEMA,
  JSON_LEXICAL_ROUTES,
  MAX_E0_CHART_IMPORT_ID_REQUESTS,
  MAX_E0_IMPORT_BYTES_OBSERVED,
  MAX_E0_IMPORT_EVENTS,
  MAX_E0_IMPORT_MEASURES,
  MAX_E0_IMPORT_SECTIONS,
  MAX_E0_IMPORT_UTF8_BYTES,
  MAX_E0_PREVIEW_ISSUES,
  MAX_E0_PREVIEW_REPORT_ITEMS,
  IMPORT_PUBLIC_PATH_FIELDS,
  IMPORT_PUBLIC_PATH_SENTINELS,
  MAX_IMPORT_PUBLIC_PATH_INDEX,
  MAX_IMPORT_PUBLIC_PATH_SEGMENTS,
  PREPARED_IMPORT_REPLACEMENT_PUBLICATION_SCHEMA,
  X1_REPLACEMENT_RETIREMENT_EVIDENCE_SCHEMA,
  validateDocumentSemantics,
  type CanonicalExportMarkerPersistenceHandoff,
  type AbandonCanonicalExportPreparationResult,
  type A0CanonicalExportRevisionPublicationAdapterResult,
  type CanonicalExportMarkerCoordinatorDependencies,
  type CanonicalExportMarkerOrchestrationDependencies,
  type CanonicalExportPreparationBinding,
  type CanonicalExportPreparationId,
  type CanonicalExportMarkerSettlementRequest,
  type CanonicalExportMarkerSettlementResult,
  type CanonicalExportMarkerSettlementAdapters,
  type CanonicalExportRevisionPublication,
  type CommitImportReplacement,
  type CommitImportReplacementCoordinator,
  type CommitImportReplacementDependencies,
  type CommitImportReplacementRequest,
  type CommitImportReplacementResult,
  type CompleteCanonicalExportMarkerSettlement,
  type CompleteCanonicalExportMarkerSettlementCoordinator,
  type CompleteCanonicalExportMarkerSettlementRequest,
  type CompleteCanonicalExportMarkerSettlementResult,
  type CreateE0InterchangeOperations,
  type DiscardImportReplacementPublicationResult,
  type E0AdapterProtocolDiagnostic,
  type E0InterchangeCompositionDependencies,
  type E0InterchangeOperations,
  type ExportMarkerState,
  type ImportPreview,
  type ImportPreviewRefusal,
  type ImportPublicPath,
  type ImportNonUndoableConfirmationAcknowledgement,
  type ImportReplacementCommandSeed,
  type ImportReplacementHandoff,
  type ImportReplacementImpact,
  type ImportSourceHandle,
  type ImportSourceReadAdapterResult,
  type LegacyMigrationRefusalProjection,
  type ExplicitlyUnavailableImportPreview,
  type FinishPreparedCanonicalExportDeliveryResult,
  type RetainedImportPreview,
  type CommittingDocumentTransition,
  type InterchangeImportDraft,
  type ParseChartTextForImport,
  type PreparedImportReplacementPublication,
  type PreparedCanonicalExportDelivery,
  type PreparedCanonicalExportDeliveryRegistry,
  type PrepareCanonicalExportDelivery,
  type PrepareCanonicalExportDeliveryCoordinator,
  type PrepareCanonicalExportDeliveryRequest,
  type PrepareCanonicalExportDeliveryResult,
  type PrepareImportReplacementPublication,
  type PrepareImportPreview,
  type PrepareImportPreviewCoordinator,
  type PrepareImportPreviewRequest,
  type PrepareImportPreviewDependencies,
  type PublishCanonicalExportRevision,
  type PublishCanonicalExportRevisionRequest,
  type PublishCanonicalExportRevisionResult,
  type PublishImportReplacement,
  type QueueCanonicalExportMarkerPersistence,
  type QueueCanonicalExportMarkerPersistenceResult,
  type ReadCanonicalExportTimestamp,
  type ReadCurrentApplicationDocumentIdentity,
  type ReadImportSource,
  type ReadImportSourceRequest,
  type RetireImportReplacement,
  type SettleCanonicalExportMarkerCoordinator,
  type X1ReplacementRetirementEvidence,
  type X1ReplacementRetirementObservation,
} from "../../src/application";
import type {
  ApplicationRequestId,
  ReplacementRetirementReceipt,
  TransportRequestId,
} from "../../src/application/application-state-contract";
import { decodeDocumentShape } from "../../src/domain";
import { formatChartText, parseChartText } from "../../src/theory";
import {
  E0_PROPOSED_APPLICATION_OPERATIONS,
  E0_PROPOSED_BYTE_DIGESTS,
  E0_PROPOSED_COMPANIONS,
  E0_PROPOSED_COUNTS,
  E0_PROPOSED_EXPORT_OPERATIONS,
  E0_PROPOSED_GOLDENS,
  E0_PROPOSED_IMPORT_STAGE_ORDER,
  E0_PROPOSED_LIMITS,
  E0_PROPOSED_SEMANTIC_DIGEST,
  materializeE0ExactByteCanonicalImport,
  validateE0Contract,
  type E0ContractValidationReport,
} from "../../scripts/validate-e0-contract";
import { materializeE0WorkflowValues } from "../support/e0-interchange-fixture";

setDefaultTimeout(60_000);

type JsonObject = Record<string, unknown>;
type Assert<Value extends true> = Value;
type Equal<Left, Right> = [Left] extends [Right]
  ? [Right] extends [Left]
    ? true
    : false
  : false;
type Not<Value extends boolean> = Value extends true ? false : true;
type VariantsContainingKey<
  Value,
  Key extends PropertyKey,
> = Value extends unknown ? (Key extends keyof Value ? Value : never) : never;

type ReadyDraft = Extract<InterchangeImportDraft, { status: "ready" }>;
type InvalidDraft = Extract<InterchangeImportDraft, { status: "invalid" }>;
type CompletedDelivery = Extract<
  ExportDeliveryResult,
  { outcome: "completed" }
>;
type FailedDelivery = Extract<ExportDeliveryResult, { outcome: "failed" }>;
type CleanupFailedDelivery = Extract<
  ExportDeliveryResult,
  { outcome: "cleanup-failed" }
>;
type RetainedImpact = Extract<
  ImportReplacementImpact,
  { undoDisposition: "retained" }
>;
type UnavailableImpact = Extract<
  ImportReplacementImpact,
  { undoDisposition: "explicitly-unavailable" }
>;
type LegacyCollisionProjection = Extract<
  LegacyMigrationRefusalProjection,
  { code: "legacy.id_collision" }
>;
type RetainedHandoffRequest = Extract<
  CommitImportReplacementRequest,
  { preview: RetainedImportPreview }
>;
type UnavailableHandoffRequest = Extract<
  CommitImportReplacementRequest,
  { preview: ExplicitlyUnavailableImportPreview }
>;
type AdvancedMarkerSettlement = Extract<
  CompleteCanonicalExportMarkerSettlementResult,
  { outcome: "advanced" }
>;
type RefusedMarkerSettlement = Extract<
  CompleteCanonicalExportMarkerSettlementResult,
  { outcome: "publication-refused" }
>;
type A0ProtocolInvalidMarkerSettlement = Extract<
  CompleteCanonicalExportMarkerSettlementResult,
  { outcome: "publication-protocol-invalid" }
>;
type A1ProtocolInvalidMarkerSettlement = Extract<
  CompleteCanonicalExportMarkerSettlementResult,
  { outcome: "persistence-protocol-invalid" }
>;
type TimestampInvalidMarkerSettlement = Extract<
  CompleteCanonicalExportMarkerSettlementResult,
  { outcome: "timestamp-protocol-invalid" }
>;
type CleanupReconciliationMarkerSettlement = Extract<
  CompleteCanonicalExportMarkerSettlementResult,
  { outcome: "delivery-cleanup-reconciliation-required" }
>;

const typeAssertions: readonly [
  Assert<Not<string extends SemanticDocumentHash ? true : false>>,
  Assert<Equal<Awaited<ReturnType<HashBytes>>, unknown>>,
  Assert<Equal<ReadyDraft["preview"], ImportPreview>>,
  Assert<Equal<ReadyDraft["refusal"], null>>,
  Assert<Equal<InvalidDraft["preview"], null>>,
  Assert<Equal<InvalidDraft["refusal"], ImportPreviewRefusal>>,
  Assert<
    Equal<ImportReplacementHandoff["retirement"], ReplacementRetirementReceipt>
  >,
  Assert<Equal<CompletedDelivery["artifact"], ExportDeliveryArtifactBinding>>,
  Assert<
    Equal<
      keyof CanonicalJsonArtifact,
      | "schema"
      | "kind"
      | "mediaType"
      | "filename"
      | "text"
      | "byteLength"
      | "semanticDocumentHash"
      | "sourceDocumentId"
    >
  >,
  Assert<
    Equal<
      keyof LeadSheetTextArtifact,
      | "schema"
      | "kind"
      | "mediaType"
      | "filename"
      | "text"
      | "byteLength"
      | "sourceDocumentId"
      | "lossReport"
    >
  >,
  Assert<Not<Equal<CommittingDocumentTransition, never>>>,
  Assert<
    Equal<ImportPreview["replacementCommandSeed"], ImportReplacementCommandSeed>
  >,
  Assert<
    Not<"command" extends keyof CommitImportReplacementRequest ? true : false>
  >,
  Assert<
    Not<
      "retirementProof" extends keyof CommitImportReplacementRequest
        ? true
        : false
    >
  >,
  Assert<Equal<RetainedImpact["exportRecommended"], false>>,
  Assert<Equal<UnavailableImpact["undoEntriesAfterCommit"], 0>>,
  Assert<Equal<UnavailableImpact["undoRetainedBytesAfterCommit"], 0>>,
  Assert<Equal<UnavailableImpact["exportRecommended"], true>>,
  Assert<Equal<ApplicationRequestId, number>>,
  Assert<Equal<TransportRequestId, number>>,
  Assert<
    Equal<RetainedImportPreview["nonUndoableConfirmationRequirement"], null>
  >,
  Assert<
    Equal<
      UnavailableHandoffRequest["nonUndoableConfirmation"],
      ImportNonUndoableConfirmationAcknowledgement
    >
  >,
  Assert<Equal<RetainedHandoffRequest["nonUndoableConfirmation"], null>>,
  Assert<
    Not<"collidingId" extends keyof LegacyCollisionProjection ? true : false>
  >,
  Assert<
    Not<
      Readonly<{
        artifact: ExportDeliveryArtifactBinding;
        ok: false;
        outcome: "failed";
        channel: "object-url-download";
        code: "export.delivery_activation_failed";
        cleanup: "complete";
        objectUrlsCreated: 1;
        objectUrlsRevoked: 0;
        outstandingOwnedResources: 0;
      }> extends FailedDelivery
        ? true
        : false
    >
  >,
  Assert<
    Equal<FailedDelivery["cleanup"], ExportDeliveryCleanupComplete["cleanup"]>
  >,
  Assert<Equal<CleanupFailedDelivery["artifact"], null>>,
  Assert<Equal<CleanupFailedDelivery["cleanup"], "reconciliation-required">>,
  Assert<
    Equal<
      Extract<
        FileSystemAccessCleanupFailure,
        { outstandingOwnedResources: 2 }
      >["objectUrlsCreated"],
      0
    >
  >,
  Assert<Equal<ObjectUrlCleanupFailure["objectUrlsCreated"], 1>>,
  Assert<Equal<keyof ExportDeliveryRequest, "artifact" | "preference">>,
  Assert<
    Equal<
      keyof ImportReplacementImpact,
      | "historyEntryRetainedBytes"
      | "undoDisposition"
      | "evictedUndoEntries"
      | "undoEntriesAfterCommit"
      | "undoRetainedBytesAfterCommit"
      | "redoEntriesCleared"
      | "confirmationRequired"
      | "exportRecommended"
    >
  >,
  Assert<
    Equal<
      keyof CanonicalExportMarkerCandidate,
      | "artifactKind"
      | "sourceDocumentId"
      | "revision"
      | "exportedAt"
      | "semanticDocumentHash"
      | "byteLength"
      | "filename"
      | "canonicalPolicyVersion"
      | "semanticHashPolicyVersion"
    >
  >,
  Assert<
    Equal<
      keyof LeadSheetTextExportDependencies,
      | "formatChordSymbol"
      | "parseChartText"
      | "supportedDocumentProjectionEquals"
      | "sanitizeExportFilename"
    >
  >,
  Assert<
    Equal<
      keyof PrepareLeadSheetTextExportRequest,
      "document" | "accidentalStyle" | "contextualAnalysis"
    >
  >,
  Assert<
    Equal<
      Parameters<PrepareCanonicalJsonExport>,
      [request: PrepareCanonicalJsonExportRequest]
    >
  >,
  Assert<
    Equal<
      Parameters<PrepareLeadSheetTextExport>,
      [request: PrepareLeadSheetTextExportRequest]
    >
  >,
  Assert<
    Equal<
      Parameters<PrepareCanonicalJsonExportCoordinator>[1],
      CanonicalJsonExportDependencies
    >
  >,
  Assert<
    Equal<
      Parameters<PrepareLeadSheetTextExportCoordinator>[1],
      LeadSheetTextExportDependencies
    >
  >,
  Assert<
    Equal<
      keyof E0ExportCompositionDependencies,
      "canonicalJson" | "leadSheetText"
    >
  >,
  Assert<
    Equal<ReturnType<CreateE0ExportOperations>, InterchangeExportOperations>
  >,
  Assert<
    Equal<
      keyof InterchangeExportOperations,
      | "prepareCanonicalJsonExport"
      | "prepareLeadSheetTextExport"
      | "sanitizeExportFilename"
      | "deliverExportArtifact"
    >
  >,
  Assert<
    Equal<
      keyof PrepareImportPreviewDependencies,
      | "preflightDocumentImportBytes"
      | "decodeUtf8Fatal"
      | "classifyJsonLexically"
      | "parseJsonData"
      | "decodeDocumentShape"
      | "validateDocumentSemantics"
      | "migrateLegacyJson"
      | "legacyMigrationDependencies"
      | "parseChartText"
      | "buildChartDocumentCandidate"
      | "assessImportReplacementImpact"
      | "chartIdFactory"
    >
  >,
  Assert<
    Equal<
      keyof PrepareImportPreviewRequest,
      | "payload"
      | "formatHint"
      | "replacementImpactContext"
      | "nonUndoableConfirmationSeed"
    >
  >,
  Assert<
    Equal<
      keyof CommitImportReplacementDependencies,
      | "prepareImportReplacementPublication"
      | "retireImportReplacement"
      | "discardImportReplacementPublication"
      | "publishImportReplacement"
    >
  >,
  Assert<
    Equal<
      Awaited<ReturnType<CommitImportReplacement>>,
      CommitImportReplacementResult
    >
  >,
  Assert<
    Equal<
      X1ReplacementRetirementEvidence["request"]["requiredPostcondition"],
      "zero-future-attack"
    >
  >,
  Assert<Not<string extends ImportPublicPath[number] ? true : false>>,
  Assert<
    Not<"legacyReport" extends keyof RetainedImportPreview ? true : false>
  >,
  Assert<
    Not<"chartWarnings" extends keyof RetainedImportPreview ? true : false>
  >,
  Assert<
    Not<"chartDiagnostics" extends keyof RetainedImportPreview ? true : false>
  >,
  Assert<
    Not<
      "legacyReport" extends keyof ExplicitlyUnavailableImportPreview
        ? true
        : false
    >
  >,
  Assert<
    Not<
      "chartWarnings" extends keyof ExplicitlyUnavailableImportPreview
        ? true
        : false
    >
  >,
  Assert<
    Not<
      "chartDiagnostics" extends keyof ExplicitlyUnavailableImportPreview
        ? true
        : false
    >
  >,
  Assert<Not<"legacyReport" extends keyof ImportPreviewRefusal ? true : false>>,
  Assert<
    Not<"chartWarnings" extends keyof ImportPreviewRefusal ? true : false>
  >,
  Assert<
    Not<"chartDiagnostics" extends keyof ImportPreviewRefusal ? true : false>
  >,
  Assert<
    Equal<
      Parameters<ParseChartTextForImport>[2],
      typeof CHART_IMPORT_PARSE_ACCIDENTAL_STYLE
    >
  >,
  Assert<
    Equal<
      AdvancedMarkerSettlement["a0Publication"]["request"]["publication"],
      CanonicalExportRevisionPublication
    >
  >,
  Assert<
    Equal<
      AdvancedMarkerSettlement["a1Persistence"]["handoff"],
      CanonicalExportMarkerPersistenceHandoff
    >
  >,
  Assert<
    Equal<
      keyof CanonicalExportMarkerSettlementAdapters,
      "publishCanonicalExportRevision" | "queueCanonicalExportMarkerPersistence"
    >
  >,
  Assert<
    Equal<
      Parameters<CompleteCanonicalExportMarkerSettlementCoordinator>[1],
      CanonicalExportMarkerCoordinatorDependencies
    >
  >,
  Assert<
    Equal<
      keyof CanonicalExportMarkerOrchestrationDependencies,
      | "prepareCanonicalJsonExport"
      | "startPreparedExportDelivery"
      | "readCurrentApplicationDocumentIdentity"
      | "readExportTimestamp"
      | "settlementAdapters"
    >
  >,
  Assert<
    Equal<
      keyof CompleteCanonicalExportMarkerSettlementRequest,
      "state" | "preparationId" | "deliveryPreference"
    >
  >,
  Assert<
    Equal<
      Extract<
        keyof CompleteCanonicalExportMarkerSettlementRequest,
        | "delivery"
        | "candidate"
        | "baseDocumentId"
        | "baseRevision"
        | "previousMarker"
        | "userGesture"
      >,
      never
    >
  >,
  Assert<
    Equal<
      Parameters<SettleCanonicalExportMarkerCoordinator>,
      [
        request: CanonicalExportMarkerSettlementRequest,
        adapters: CanonicalExportMarkerSettlementAdapters,
      ]
    >
  >,
  Assert<
    Equal<
      Awaited<ReturnType<SettleCanonicalExportMarkerCoordinator>>,
      CanonicalExportMarkerSettlementResult
    >
  >,
  Assert<Equal<ReturnType<ReadCanonicalExportTimestamp>, unknown>>,
  Assert<Equal<ReturnType<ReadCurrentApplicationDocumentIdentity>, unknown>>,
  Assert<
    Equal<
      keyof CanonicalExportMarkerSettlementRequest,
      "baseDocumentId" | "baseRevision" | "delivery" | "candidate"
    >
  >,
  Assert<
    Not<
      "state" extends keyof CanonicalExportMarkerSettlementRequest
        ? true
        : false
    >
  >,
  Assert<
    Equal<
      Parameters<PrepareCanonicalExportDelivery>,
      [request: PrepareCanonicalExportDeliveryRequest]
    >
  >,
  Assert<
    Equal<
      Parameters<PrepareCanonicalExportDeliveryCoordinator>[1],
      CanonicalExportMarkerCoordinatorDependencies
    >
  >,
  Assert<
    Equal<
      Awaited<ReturnType<PrepareCanonicalExportDelivery>>,
      PrepareCanonicalExportDeliveryResult
    >
  >,
  Assert<Equal<keyof PrepareCanonicalExportDeliveryRequest, "state">>,
  Assert<
    Equal<
      keyof CanonicalExportPreparationBinding,
      | "preparationId"
      | "generation"
      | "documentId"
      | "revision"
      | "filename"
      | "byteLength"
      | "semanticDocumentHash"
      | "canonicalPolicyVersion"
      | "semanticHashPolicyVersion"
    >
  >,
  Assert<Not<number extends CanonicalExportPreparationId ? true : false>>,
  Assert<
    Equal<
      keyof PreparedCanonicalExportDelivery,
      "schema" | "identity" | "binding" | "privateBytes"
    >
  >,
  Assert<
    Equal<
      keyof PreparedCanonicalExportDeliveryRegistry,
      | "begin"
      | "publish"
      | "take"
      | "abandonPreparation"
      | "finishDelivery"
      | "state"
    >
  >,
  Assert<
    Equal<
      ReturnType<PreparedCanonicalExportDeliveryRegistry["abandonPreparation"]>,
      AbandonCanonicalExportPreparationResult
    >
  >,
  Assert<
    Equal<
      ReturnType<PreparedCanonicalExportDeliveryRegistry["finishDelivery"]>,
      FinishPreparedCanonicalExportDeliveryResult
    >
  >,
  Assert<
    Equal<
      keyof CanonicalExportMarkerCoordinatorDependencies,
      keyof CanonicalExportMarkerOrchestrationDependencies | "preparedRegistry"
    >
  >,
  Assert<Equal<ReturnType<StartPreparedExportDelivery>, unknown>>,
  Assert<Equal<keyof PreparedExportDeliveryStart, "completion">>,
  Assert<
    Equal<
      keyof PreparedExportDeliveryRequest,
      "binding" | "privateBytes" | "preference"
    >
  >,
  Assert<
    Equal<
      Awaited<ReturnType<CompleteCanonicalExportMarkerSettlement>>,
      CompleteCanonicalExportMarkerSettlementResult
    >
  >,
  Assert<
    Not<"state" extends keyof TimestampInvalidMarkerSettlement ? true : false>
  >,
  Assert<
    Equal<
      TimestampInvalidMarkerSettlement["configurationDisposition"],
      "release-gate-failed"
    >
  >,
  Assert<
    Equal<
      CleanupReconciliationMarkerSettlement["deliveryResourceReconciliation"],
      "required"
    >
  >,
  Assert<
    Equal<
      Parameters<ReadImportSource>,
      [request: ReadImportSourceRequest, signal: AbortSignal]
    >
  >,
  Assert<Equal<keyof ReadImportSourceRequest, "identity" | "source">>,
  Assert<
    Equal<
      keyof ImportSourceHandle,
      | "channel"
      | "displayName"
      | "mediaType"
      | "declaredByteLength"
      | "readAtMost"
    >
  >,
  Assert<Equal<ReturnType<ImportSourceHandle["readAtMost"]>, Promise<unknown>>>,
  Assert<
    Equal<
      ImportSourceReadAdapterResult,
      | Readonly<{
          ok: true;
          bytes: Uint8Array;
          observedByteLength: number;
        }>
      | Readonly<{
          ok: false;
          outcome: "cancelled" | "failed";
          code: "import.read_cancelled" | "import.read_failed";
        }>
    >
  >,
  Assert<
    Equal<
      Parameters<PrepareImportPreview>,
      [request: PrepareImportPreviewRequest]
    >
  >,
  Assert<
    Equal<
      Parameters<PrepareImportPreviewCoordinator>[1],
      PrepareImportPreviewDependencies
    >
  >,
  Assert<
    Equal<
      Parameters<CommitImportReplacement>,
      [request: CommitImportReplacementRequest]
    >
  >,
  Assert<
    Equal<
      Parameters<CommitImportReplacementCoordinator>[1],
      CommitImportReplacementDependencies
    >
  >,
  Assert<
    Equal<
      Parameters<CompleteCanonicalExportMarkerSettlement>,
      [request: CompleteCanonicalExportMarkerSettlementRequest]
    >
  >,
  Assert<
    Equal<
      keyof E0InterchangeCompositionDependencies,
      | "prepareImportPreview"
      | "commitImportReplacement"
      | "canonicalExportMarkerSettlement"
    >
  >,
  Assert<
    Equal<ReturnType<CreateE0InterchangeOperations>, E0InterchangeOperations>
  >,
  Assert<
    Equal<
      keyof E0InterchangeOperations,
      | "readImportSource"
      | "prepareImportPreview"
      | "commitImportReplacement"
      | "prepareCanonicalExportDelivery"
      | "completeCanonicalExportMarkerSettlement"
    >
  >,
  Assert<
    Equal<
      keyof PreparedImportReplacementPublication,
      | "schema"
      | "identity"
      | "sourceFormat"
      | "candidateDocumentId"
      | "expectedTransportGeneration"
      | "committingTransition"
    >
  >,
  Assert<
    Equal<
      keyof X1ReplacementRetirementObservation,
      | "requestId"
      | "retiredTransportGeneration"
      | "progressionRetired"
      | "previewRetired"
      | "noFutureAttack"
    >
  >,
  Assert<
    Not<
      "marker" extends keyof QueueCanonicalExportMarkerPersistenceResult
        ? true
        : false
    >
  >,
  Assert<Not<"state" extends keyof AdvancedMarkerSettlement ? true : false>>,
  Assert<Not<"marker" extends keyof AdvancedMarkerSettlement ? true : false>>,
  Assert<
    Equal<
      keyof NonNullable<ExportMarkerState>,
      | "documentId"
      | "revision"
      | "exportedAt"
      | "semanticDocumentHash"
      | "canonicalPolicyVersion"
      | "semanticHashPolicyVersion"
    >
  >,
  Assert<Not<"code" extends keyof RefusedMarkerSettlement ? true : false>>,
  Assert<Equal<ReturnType<PublishCanonicalExportRevision>, unknown>>,
  Assert<Equal<keyof PublishCanonicalExportRevisionRequest, "publication">>,
  Assert<
    Equal<
      keyof Extract<PublishCanonicalExportRevisionResult, { ok: true }>,
      "ok" | "outcome" | "documentId" | "revision"
    >
  >,
  Assert<
    Equal<
      keyof Extract<
        A0CanonicalExportRevisionPublicationAdapterResult,
        { ok: true }
      >,
      "ok" | "outcome" | "observedBefore" | "state"
    >
  >,
  Assert<
    Equal<
      VariantsContainingKey<
        CompleteCanonicalExportMarkerSettlementResult,
        "state"
      >,
      never
    >
  >,
  Assert<
    Equal<ReturnType<QueueCanonicalExportMarkerPersistence>, Promise<unknown>>
  >,
  Assert<Equal<ReturnType<PrepareImportReplacementPublication>, unknown>>,
  Assert<Equal<ReturnType<RetireImportReplacement>, Promise<unknown>>>,
  Assert<Equal<ReturnType<PublishImportReplacement>, unknown>>,
  Assert<
    Not<
      "state" extends keyof Extract<CommitImportReplacementResult, { ok: true }>
        ? true
        : false
    >
  >,
  Assert<
    Equal<
      A0ProtocolInvalidMarkerSettlement["code"],
      "export.marker_publication_result_invalid"
    >
  >,
  Assert<
    Equal<
      keyof A0ProtocolInvalidMarkerSettlement,
      | "outcome"
      | "code"
      | "delivery"
      | "a0Publication"
      | "a1Persistence"
      | "applicationReconciliation"
      | "durability"
    >
  >,
  Assert<
    Not<
      "lastKnownState" extends keyof A0ProtocolInvalidMarkerSettlement
        ? true
        : false
    >
  >,
  Assert<
    Not<
      "lastKnownMarker" extends keyof A0ProtocolInvalidMarkerSettlement
        ? true
        : false
    >
  >,
  Assert<
    Equal<
      A0ProtocolInvalidMarkerSettlement["applicationReconciliation"],
      "required"
    >
  >,
  Assert<
    Equal<
      A1ProtocolInvalidMarkerSettlement["durability"],
      "reconciliation-required"
    >
  >,
  Assert<
    Equal<
      keyof DiscardImportReplacementPublicationResult,
      "outcome" | "identity" | "liveForRequest"
    >
  >,
  Assert<Equal<E0AdapterProtocolDiagnostic["rawResultRetained"], false>>,
  Assert<
    Equal<
      E0AdapterProtocolDiagnostic["reason"],
      "invalid-envelope-or-binding" | "threw-or-rejected"
    >
  >,
  Assert<
    Not<
      "result" extends keyof A0ProtocolInvalidMarkerSettlement["a0Publication"]
        ? true
        : false
    >
  >,
  Assert<
    Not<
      "result" extends keyof A1ProtocolInvalidMarkerSettlement["a1Persistence"]
        ? true
        : false
    >
  >,
] = [
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
];

const fixtureRoot = new URL("../fixtures/interchange", import.meta.url)
  .pathname;
const theoryChartCasesPath = new URL(
  "../fixtures/theory/chart-cases.json",
  import.meta.url,
).pathname;
const architecturePath = new URL("../../docs/ARCHITECTURE.md", import.meta.url)
  .pathname;
const contractDocPath = new URL(
  "../../docs/E0_INTERCHANGE_CONTRACT.md",
  import.meta.url,
).pathname;
const c0ContractDocPath = new URL(
  "../../docs/C0_LEGACY_MIGRATION_CONTRACT.md",
  import.meta.url,
).pathname;
const packagePath = new URL("../../package.json", import.meta.url).pathname;
const verifyPath = new URL("../../scripts/verify.ts", import.meta.url).pathname;
const validatorPath = new URL(
  "../../scripts/validate-e0-contract.ts",
  import.meta.url,
).pathname;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJsonObject(path: string): Promise<JsonObject> {
  const value: unknown = JSON.parse(await readFile(path, "utf8"));
  if (!isObject(value)) throw new Error(`E0_TEST_OBJECT:${path}`);
  return value;
}

function recordAt(
  records: readonly JsonObject[],
  index: number,
  label: string,
): JsonObject {
  const record = records[index];
  if (record === undefined) throw new Error(`E0_TEST_RECORD:${label}`);
  return record;
}

async function mutateJson(
  root: string,
  filename: string,
  mutate: (value: JsonObject) => void,
): Promise<void> {
  const path = join(root, filename);
  const value = await readJsonObject(path);
  mutate(value);
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function withFixtureCopy(
  run: (root: string) => Promise<void>,
): Promise<void> {
  const parent = await mkdtemp(join(tmpdir(), "jcpe e0 contract Ω path-"));
  const root = join(parent, "proposed interchange fixtures");
  try {
    await cp(fixtureRoot, root, { recursive: true });
    await run(root);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
}

function findingCodes(report: E0ContractValidationReport): readonly string[] {
  return [...new Set(report.findings.map((finding) => finding.code))].sort();
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function forbiddenValidatorProductionImports(
  source: string,
): readonly string[] {
  const file = ts.createSourceFile(
    "validate-e0-contract.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const findings: string[] = [];
  const isForbidden = (specifier: string): boolean =>
    /(?:^|\/)src\/(?:application|export)(?:\/|$)/u.test(
      specifier.replaceAll("\\", "/"),
    );
  const inspectSpecifier = (
    specifier: string | null,
    kind: string,
    position: number,
  ): void => {
    if (specifier === null) {
      findings.push(`${kind}:nonliteral@${String(position)}`);
    } else if (isForbidden(specifier)) {
      findings.push(`${kind}:${specifier}@${String(position)}`);
    }
  };
  const literalText = (node: ts.Node | undefined): string | null =>
    node !== undefined && ts.isStringLiteralLike(node) ? node.text : null;
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      inspectSpecifier(
        literalText(node.moduleSpecifier),
        "import",
        node.getStart(file),
      );
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier !== undefined
    ) {
      inspectSpecifier(
        literalText(node.moduleSpecifier),
        "export",
        node.getStart(file),
      );
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      inspectSpecifier(
        literalText(node.moduleReference.expression),
        "import-equals",
        node.getStart(file),
      );
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      inspectSpecifier(
        literalText(node.arguments[0]),
        "dynamic-import",
        node.getStart(file),
      );
    } else if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "require"
    ) {
      inspectSpecifier(
        literalText(node.arguments[0]),
        "require",
        node.getStart(file),
      );
    } else if (ts.isImportTypeNode(node)) {
      const argument = node.argument;
      inspectSpecifier(
        ts.isLiteralTypeNode(argument) ? literalText(argument.literal) : null,
        "import-type",
        node.getStart(file),
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return findings;
}

function gateIndices(source: string, id: string): readonly number[] {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return [
    ...source.matchAll(new RegExp(`\\bid\\s*:\\s*["']${escaped}["']`, "gu")),
  ].map((match) => match.index);
}

async function expectRejected(
  root: string,
  ...codes: readonly string[]
): Promise<void> {
  const report = await validateE0Contract(root);
  expect(report.outcome).toBe("fail");
  const actual = findingCodes(report);
  for (const code of codes) expect(actual).toContain(code);
}

describe("E0 proposed transactional interchange contract", () => {
  test("public types and constants match the independently authored authority", async () => {
    expect(typeAssertions).toHaveLength(130);
    const contract = await readJsonObject(
      join(fixtureRoot, "e0-interchange-contract.json"),
    );
    const publicSurface = contract["publicSurface"] as JsonObject;
    const identities = contract["identities"] as JsonObject;
    const canonicalJson = contract["canonicalJson"] as JsonObject;
    const filename = contract["filename"] as JsonObject;

    expect(INTERCHANGE_EXPORT_CONTRACT_SCHEMA).toBe(
      "changes.export.interchange-contract.v1",
    );
    expect(E0_INTERCHANGE_CONTRACT_SCHEMA).toBe(
      "changes.application.e0-interchange-contract.v1",
    );
    expect(identities["x1ReplacementRetirementEvidenceSchema"]).toBe(
      X1_REPLACEMENT_RETIREMENT_EVIDENCE_SCHEMA,
    );
    expect(identities["preparedImportReplacementPublicationSchema"]).toBe(
      PREPARED_IMPORT_REPLACEMENT_PUBLICATION_SCHEMA,
    );
    expect(identities["preparedCanonicalExportDeliverySchema"]).toBe(
      PREPARED_CANONICAL_EXPORT_DELIVERY_SCHEMA,
    );
    expect(identities["canonicalExportRevisionPublicationSchema"]).toBe(
      CANONICAL_EXPORT_REVISION_PUBLICATION_SCHEMA,
    );
    expect(identities["canonicalExportMarkerPersistenceHandoffSchema"]).toBe(
      CANONICAL_EXPORT_MARKER_PERSISTENCE_HANDOFF_SCHEMA,
    );
    expect(INTERCHANGE_IMPORT_DRAFT_SCHEMA).toBe(
      "changes.interchange-import-draft.v1",
    );
    expect(IMPORT_PREVIEW_SCHEMA).toBe("changes.import-preview.v1");
    expect(identities["importNonUndoableConfirmationSchema"]).toBe(
      IMPORT_NONUNDOABLE_CONFIRMATION_SCHEMA,
    );
    expect(CANONICAL_JSON_ARTIFACT_SCHEMA).toBe(
      "changes.export.canonical-json-artifact.v1",
    );
    expect(LEAD_SHEET_TEXT_ARTIFACT_SCHEMA).toBe(
      "changes.export.lead-sheet-text-artifact.v1",
    );
    expect(LEAD_SHEET_TEXT_LOSS_REPORT_SCHEMA).toBe(
      "changes.export.lead-sheet-text-loss-report.v1",
    );
    expect(INTERCHANGE_EXPORT_OPERATION_NAMES).toEqual(
      E0_PROPOSED_EXPORT_OPERATIONS,
    );
    expect(E0_INTERCHANGE_OPERATION_NAMES).toEqual(
      E0_PROPOSED_APPLICATION_OPERATIONS,
    );
    expect(publicSurface["exportOperations"]).toEqual(
      E0_PROPOSED_EXPORT_OPERATIONS,
    );
    expect(publicSurface["applicationOperations"]).toEqual(
      E0_PROPOSED_APPLICATION_OPERATIONS,
    );
    expect(publicSurface).toMatchObject({
      compositionFactory: "createE0InterchangeOperations",
      exportCompositionFactory: "createE0ExportOperations",
      dependencyBinding: "application-composition-root-once",
      publicOperationsAcceptTrustedAdapters: false,
      applicationOperationParameters: {
        readImportSource: ["request", "signal"],
        prepareImportPreview: ["request"],
        commitImportReplacement: ["request"],
        prepareCanonicalExportDelivery: ["request"],
        completeCanonicalExportMarkerSettlement: ["request"],
      },
      exportOperationParameters: {
        prepareCanonicalJsonExport: ["request"],
        prepareLeadSheetTextExport: ["request"],
        sanitizeExportFilename: ["title", "format"],
        deliverExportArtifact: ["request"],
      },
      readImportSourcePerCallAuthority:
        "untrusted-bounded-byte-source-capability-only",
      sourcePolicyGates: [
        "no-ui-or-e0-callsite-constructs-or-submits-replace-document-through-general-runner",
        "no-ui-or-e0-callsite-dispatches-raw-mark-exported",
        "no-public-e0-operation-accepts-caller-supplied-trusted-dependency",
        "no-public-marker-operation-accepts-artifact-bytes-receipt-candidate-hash-timestamp-or-previous-marker",
        "marker-delivery-starts-before-first-await-or-microtask",
        "no-public-marker-result-contains-appstate",
      ],
      consumerAdapters: [
        "CanonicalJsonExportDependencies",
        "LeadSheetTextExportDependencies",
        "PrepareImportPreviewDependencies",
        "CommitImportReplacementDependencies.prepareImportReplacementPublication",
        "CommitImportReplacementDependencies.retireImportReplacement",
        "CommitImportReplacementDependencies.discardImportReplacementPublication",
        "CommitImportReplacementDependencies.publishImportReplacement",
        "CanonicalExportMarkerOrchestrationDependencies.prepareCanonicalJsonExport",
        "CanonicalExportMarkerOrchestrationDependencies.startPreparedExportDelivery",
        "CanonicalExportMarkerOrchestrationDependencies.readCurrentApplicationDocumentIdentity",
        "CanonicalExportMarkerOrchestrationDependencies.readExportTimestamp",
        "CanonicalExportMarkerSettlementAdapters.publishCanonicalExportRevision",
        "CanonicalExportMarkerSettlementAdapters.queueCanonicalExportMarkerPersistence",
      ],
    });
    expect(IMPORT_STAGE_ORDER).toEqual(E0_PROPOSED_IMPORT_STAGE_ORDER);
    expect(contract["importStageOrder"]).toEqual(
      E0_PROPOSED_IMPORT_STAGE_ORDER,
    );
    expect(CANONICAL_JSON_FORMAT).toEqual({
      encoding: "utf-8",
      indentationSpaces: 2,
      lineEnding: "lf",
      finalNewline: true,
      escapePolicy: "ecmascript-json-stringify",
      numberPolicy: "finite-domain-number-preserve-negative-zero",
      arrayOrder: "stored-order",
    });
    expect(canonicalJson["keyOrder"]).toEqual(CANONICAL_JSON_KEY_ORDER);
    expect([CANONICAL_JSON_POLICY_ID, CANONICAL_JSON_POLICY_VERSION]).toEqual([
      "changes.canonical-json",
      1,
    ]);
    expect(SEMANTIC_DOCUMENT_HASH_PATTERN_SOURCE).toBe("^[0-9a-f]{64}$");
    expect(canonicalJson["hashPattern"]).toBe(
      SEMANTIC_DOCUMENT_HASH_PATTERN_SOURCE,
    );

    expect({
      acceptedImportUtf8Bytes: MAX_E0_IMPORT_UTF8_BYTES,
      observedImportBytes: MAX_E0_IMPORT_BYTES_OBSERVED,
      canonicalJsonExportBytes: MAX_CANONICAL_JSON_EXPORT_BYTES,
      leadSheetTextExportBytes: MAX_LEAD_SHEET_TEXT_EXPORT_BYTES,
      previewIssuesRetained: MAX_E0_PREVIEW_ISSUES,
      previewReportItemsRetained: MAX_E0_PREVIEW_REPORT_ITEMS,
      chartImportIdRequests: MAX_E0_CHART_IMPORT_ID_REQUESTS,
      sectionsSummarized: MAX_E0_IMPORT_SECTIONS,
      measuresSummarized: MAX_E0_IMPORT_MEASURES,
      eventsSummarized: MAX_E0_IMPORT_EVENTS,
      leadSheetLossItems: MAX_LEAD_SHEET_TEXT_LOSS_ITEMS,
      objectUrlsPerAttempt: 1,
      preparedCanonicalExportEntries: 1,
      preparedCanonicalExportTasks: 1,
      preparedCanonicalExportPrivateBytes: MAX_CANONICAL_JSON_EXPORT_BYTES,
      canonicalExportPreparationId: MAX_CANONICAL_EXPORT_PREPARATION_ID,
      replacementHandoffsPerConfirmation: 1,
    }).toEqual(E0_PROPOSED_LIMITS);
    expect(contract["limits"]).toEqual(E0_PROPOSED_LIMITS);

    expect(MAX_EXPORT_FILENAME_BASENAME_CODE_POINTS).toBe(120);
    expect(MIN_CANONICAL_EXPORT_PREPARATION_ID).toBe(1);
    expect(MAX_CANONICAL_EXPORT_PREPARATION_ID).toBe(Number.MAX_SAFE_INTEGER);
    expect(PREPARED_CANONICAL_EXPORT_REGISTRY_STATES).toEqual([
      "empty",
      "preparing",
      "ready",
      "delivering",
    ]);
    expect(filename["basenameCodePoints"]).toBe(120);
    expect(EXPORT_FILENAME_FORBIDDEN_CODE_POINTS).toContain(0x7f);
    expect(EXPORT_FILENAME_FORBIDDEN_CODE_POINT_RANGES).toEqual([
      { first: 0xd800, last: 0xdfff },
      { first: 0x202a, last: 0x202e },
      { first: 0x2066, last: 0x2069 },
    ]);
    expect(filename["reservedBasenames"]).toEqual(
      EXPORT_FILENAME_RESERVED_BASENAMES,
    );

    expect(IMPORT_SOURCE_CHANNELS).toEqual(["file", "paste"]);
    expect(IMPORT_FORMAT_HINTS).toEqual([
      "auto",
      "canonical-json",
      "legacy-json",
      "chart-text",
    ]);
    expect(IMPORT_SOURCE_FORMATS).toEqual([
      "canonical-json-v2",
      "unversioned-legacy-json",
      "chart-text-v1",
    ]);
    expect(IMPORT_NONUNDOABLE_CONFIRMATION_SCHEMA).toBe(
      "changes.import-nonundoable-confirmation.v1",
    );
    expect(IMPORT_TRANSPORT_WORKFLOW_ACTIONS).toEqual([
      "preview",
      "apply",
      "cancel",
      "failure",
    ]);
    expect(contract["transportWorkflowMatrix"]).toEqual({
      sourceFormats: ["canonical-json-v2", "unversioned-legacy-json"],
      transportStatuses: [
        "unavailable",
        "ready",
        "starting",
        "playing",
        "paused",
        "stopping",
        "failed",
      ],
      actions: ["preview", "apply", "cancel", "failure"],
      requiredCells: 56,
      equivalenceReductionAuthorized: false,
      applyFailureStatePolicy: "complete-format-specific-retiring-app-state",
      pendingRequestPolicy:
        "exactly-one-matching-running-document-transition-request",
      ordinaryFailure: "x1-no-effect-refusal",
      protocolNearMiss: "receipt.noFutureAttack-false-reconciliation-required",
      applyEvidence:
        "literal-14-row-format-status-request-echo-and-three-true-postconditions",
      preparationLifecycle:
        "allocate-before-X1-consume-on-success-invalidate-by-request-on-failure-zero-live-at-return",
      callerSuppliesEvidence: false,
      runtimeEvidenceMaterializationClaimedByE0: false,
    });
    expect(JSON_LEXICAL_ROUTES as unknown).toEqual(
      contract["jsonLexicalRoutes"],
    );
    expect(IMPORT_ROUTING_POLICY).toEqual({
      autoJsonFirstCodePoints: ["{", "["],
      jsonNeverFallsBackToChartText: true,
      currentSchema: "changes.progression.v2",
      futureSchemaPattern: "^changes\\.progression\\.v(?:[3-9]|[1-9][0-9]+)$",
      unversionedLegacyRequiresOwnSectionsArray: true,
      futureOrUnknownSchemaNeverRoutesToLegacy: true,
      filenameExtensionIsAdvisoryOnly: true,
      mediaTypeIsAdvisoryOnly: true,
      explicitFormatHintIsRouteAssertion: true,
      schemaEvidenceMayVetoExplicitHint: true,
    });
    const chartDefaults = contract["chartImportDefaults"] as JsonObject;
    expect(CHART_IMPORT_DEFAULTS as unknown).toEqual({
      title: chartDefaults["title"],
      description: chartDefaults["description"],
      tempoBpm: chartDefaults["tempoBpm"],
      key: chartDefaults["key"],
      playback: chartDefaults["playback"],
      sectionNamePrefix: chartDefaults["sectionNamePrefix"],
      sectionKeyOverride: chartDefaults["sectionKeyOverride"],
      sectionVoiceLeadingBoundary: chartDefaults["sectionVoiceLeadingBoundary"],
      eventAnnotation: chartDefaults["eventAnnotation"],
      autoVoicing: chartDefaults["autoVoicing"],
    });
    expect(CHART_IMPORT_ID_ALLOCATION_ORDER as unknown).toEqual(
      chartDefaults["idAllocationOrder"],
    );
    expect(chartDefaults["parseAccidentalStyle"]).toBe(
      CHART_IMPORT_PARSE_ACCIDENTAL_STYLE,
    );
    expect(chartDefaults["parseMode"]).toBe("document");
    expect(chartDefaults["callerMayChooseParseAccidentalStyle"]).toBe(false);
    expect(contract["previewRetention"]).toMatchObject({
      rawSourceRetained: false,
      completeLegacyReportRetained: false,
      completeChartWarningsRetained: false,
      completeChartDiagnosticsRetained: false,
      reportCodeType: "LegacyReportCode",
      publicPath: {
        maximumSegments: MAX_IMPORT_PUBLIC_PATH_SEGMENTS,
        maximumIndex: MAX_IMPORT_PUBLIC_PATH_INDEX,
        unknownField: IMPORT_PUBLIC_PATH_SENTINELS[0],
        invalidIndex: IMPORT_PUBLIC_PATH_SENTINELS[1],
        truncated: IMPORT_PUBLIC_PATH_SENTINELS[2],
      },
    });
    expect(new Set(IMPORT_PUBLIC_PATH_FIELDS).size).toBe(
      IMPORT_PUBLIC_PATH_FIELDS.length,
    );
    expect(IMPORT_PUBLIC_PATH_FIELDS).toContain("sections");
    expect(IMPORT_PUBLIC_PATH_FIELDS).toContain("chords");
    expect(IMPORT_REPLACEMENT_ORIGIN_BY_FORMAT["chart-text-v1"]).toBe(
      "canonical-import",
    );
    expect(IMPORT_ISSUE_CODES as unknown).toEqual(contract["importIssueCodes"]);
    expect(E0_IMPORT_TERMINATIONS).toEqual([
      "preview-ready",
      "complete-refusal",
      "cancelled",
      "ignored-stale",
      "replacement-committed",
    ]);

    expect(CANONICAL_JSON_EXPORT_REFUSAL_CODES as unknown).toEqual(
      contract["canonicalRefusalCodes"],
    );
    expect(LEAD_SHEET_TEXT_EXPORT_REFUSAL_CODES as unknown).toEqual(
      contract["textRefusalCodes"],
    );
    expect(LEAD_SHEET_TEXT_LOSS_CODES as unknown).toEqual(
      contract["textLossCodes"],
    );
    expect(EXPORT_DELIVERY_CHANNELS).toEqual([
      "file-system-access",
      "object-url-download",
    ]);
    expect(EXPORT_DELIVERY_TERMINATIONS as unknown).toEqual(
      contract["deliveryOutcomes"],
    );
    expect(contract["companions"]).toEqual(E0_PROPOSED_COMPANIONS);
    expect(contract["goldens"]).toEqual(E0_PROPOSED_GOLDENS);
    expect(Object.keys(E0_PROPOSED_BYTE_DIGESTS)).toHaveLength(16);
  });

  test("validator accepts the untouched proposed packet without claiming approval", async () => {
    const report = await validateE0Contract(fixtureRoot);
    expect(report).toEqual({
      schema: "changes.validation.e0-contract.v1",
      package: "E0",
      outcome: "pass",
      reviewState: "proposed-pending-first-golden-human-acceptance",
      counts: E0_PROPOSED_COUNTS,
      findings: [],
    });
  });

  test("exact import byte-boundary recipe materializes a real F2/F3-valid canonical source", async () => {
    const ledger = await readJsonObject(
      join(fixtureRoot, "input-fixture-ledger.json"),
    );
    const fixtures = ledger["fixtures"] as JsonObject[];
    const fixture = fixtures.find(
      (candidate) => candidate["id"] === "E0-IMPORT-CANONICAL-2097152",
    );
    if (fixture === undefined) throw new Error("E0_TEST_EXACT_BYTE_FIXTURE");
    const materialized = materializeE0ExactByteCanonicalImport(
      fixture["recipe"],
    );
    expect(materialized).toMatchObject({
      finalAnnotationEmptyUtf8Bytes: 2_093_728,
      eventCount: 233,
      fullAnnotationCount: 232,
      finalAnnotationCodePoints: 856,
      timelineQuarterNoteTicks: 3_840,
      utf16CodeUnits: 1_167_440,
      utf8Bytes: 2_097_152,
      sha256:
        "18d737f88c90ef3b4c0687f813d543571131c63fcd5e6ce0d485a23459566619",
    });
    expect(materialized.sourceText.startsWith("{\n")).toBe(true);
    expect(materialized.sourceText.endsWith("\n")).toBe(true);
    expect(materialized.utf16CodeUnits).toBeLessThan(materialized.utf8Bytes);
    const parsed: unknown = JSON.parse(materialized.sourceText);
    const decoded = decodeDocumentShape(parsed);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error("E0_TEST_EXACT_BYTE_F2");
    expect(decoded.value.sections).toHaveLength(1);
    expect(decoded.value.sections[0]?.measures).toHaveLength(1);
    expect(
      decoded.value.sections[0]?.measures.reduce(
        (count, measure) => count + measure.events.length,
        0,
      ),
    ).toBe(233);
    expect(validateDocumentSemantics(decoded.value).ok).toBe(true);
  });

  test("nested duplicate inputs isolate duplicate rejection from F2/F3 validity", async () => {
    const ledger = await readJsonObject(
      join(fixtureRoot, "input-fixture-ledger.json"),
    );
    const fixtures = ledger["fixtures"] as JsonObject[];
    for (const id of [
      "E0-IMPORT-DUPLICATE-NESTED-LITERAL",
      "E0-IMPORT-DUPLICATE-NESTED-ESCAPED",
    ]) {
      const fixture = fixtures.find((candidate) => candidate["id"] === id);
      if (fixture === undefined) throw new Error(`E0_TEST_NESTED_DUP:${id}`);
      const text = fixture["text"];
      expect(typeof text).toBe("string");
      const decoded = decodeDocumentShape(JSON.parse(String(text)));
      expect(decoded.ok).toBe(true);
      if (!decoded.ok) throw new Error(`E0_TEST_NESTED_DUP_F2:${id}`);
      expect(validateDocumentSemantics(decoded.value).ok).toBe(true);
    }

    const nested = await readJsonObject(
      join(fixtureRoot, "goldens/nested.changes.json"),
    );
    let idBearingObjects = 0;
    const visit = (value: unknown): void => {
      if (Array.isArray(value)) {
        for (const item of value) visit(item);
      } else if (isObject(value)) {
        if (typeof value["id"] === "string") idBearingObjects += 1;
        for (const item of Object.values(value)) visit(item);
      }
    };
    visit(nested);
    expect(idBearingObjects).toBeGreaterThanOrEqual(3);
    const decoded = decodeDocumentShape(nested);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error("E0_TEST_PER_OBJECT_POSITIVE_F2");
    expect(validateDocumentSemantics(decoded.value).ok).toBe(true);
  });

  test(
    "workflow fixtures materialize exact A0 and E0 public values",
    async () => {
      const values = materializeE0WorkflowValues();
      expect(values.baseState.revision).toBe(7);
      expect(values.baseState.history.retainedBytesEstimate).toBe(18_393);
      expect(values.baseState.transport.status).toBe("playing");
      expect(values.baseState.transport.generation).toBe(11);
      expect(values.baseState.transport.commandRequestId).toBe(11);
      expect(values.baseState.transport.notificationSequence).toBe(11);
      expect(values.baseState.transport.documentId).toBe(
        values.baseState.document.id,
      );
      expect(values.baseState.transport.planRevision).toBe(7);
      expect(values.baseState.transport.startBeat.numerator).toBe(0);
      expect(values.baseState.transport.startBeat.denominator).toBe(1);
      expect(values.baseState.transport.playhead.numerator).toBe(1);
      expect(values.baseState.transport.playhead.denominator).toBe(1);
      expect(values.baseState.transport.failureCode).toBeNull();
      expect(Object.keys(values.transportStates)).toEqual([
        "unavailable",
        "ready",
        "starting",
        "playing",
        "paused",
        "stopping",
        "failed",
      ]);
      expect(values.transportStates.failed.transport.failureCode).toBe(
        "transport.fixture_failure",
      );
      expect(values.independentHistoryEstimates).toEqual({
        undo: 9_199,
        redo: 9_194,
        replacement: 9_195,
      });
      for (const flavor of ["canonical", "legacy"] as const) {
        const cases = values.retainedTransportHandoffs[flavor];
        for (const status of Object.keys(cases) as Array<keyof typeof cases>) {
          const handoffCase = cases[status];
          expect(handoffCase.currentState.transport.status).toBe(status);
          expect(handoffCase.currentState.documentTransition).toBe(
            handoffCase.currentTransition,
          );
          expect(handoffCase.commitRequest.currentState).toBe(
            handoffCase.currentState,
          );
          expect(handoffCase.commitRequest.currentTransition).toBe(
            handoffCase.currentTransition,
          );
          expect("retirementProof" in handoffCase.commitRequest).toBe(false);
          expect(handoffCase.retirementRequest.identity).toBe(
            handoffCase.commitRequest.preview.identity,
          );
          expect(handoffCase.expectedEmbeddedReceipt.requestId).toBe(
            handoffCase.currentTransition.requestId,
          );
          expect(
            handoffCase.expectedEmbeddedReceipt.retiredTransportGeneration,
          ).toBe(handoffCase.currentState.transport.generation);
          expect(handoffCase.expectedEmbeddedReceipt.noFutureAttack).toBe(true);
          expect(handoffCase.commitRequest.nonUndoableConfirmation).toBeNull();
          expect(handoffCase.commitRequest.preview.sourceFormat).toBe(
            flavor === "canonical"
              ? "canonical-json-v2"
              : "unversioned-legacy-json",
          );
          expect(handoffCase.currentTransition.origin).toBe(
            flavor === "canonical" ? "canonical-import" : "legacy-import",
          );
          expect(handoffCase.currentState.pendingRequests).toEqual([
            {
              kind: "document-transition",
              id: 101,
              documentId: values.baseState.document.id,
              baseRevision: 7,
              status: "running",
            },
          ]);
        }
      }
      expect(
        await values.x1ReplacementRetirementAdapter.retireImportReplacement(
          values.retainedTransportHandoffs.canonical.playing.retirementRequest,
        ),
      ).toEqual({
        ok: false,
        code: "transport.replacement_retirement_unavailable",
        retirementEffect: "none",
      });
      expect(String(values.unavailableState.document.id)).toBe("oversized");
      expect(values.unavailableState.document.title).toBe("O");
      expect(values.unavailableState.document.description).toBe("x".repeat(7));
      expect(values.unavailableState.document.sections).toHaveLength(48);
      expect(
        values.unavailableState.document.sections.reduce(
          (sum, section) => sum + section.measures.length,
          0,
        ),
      ).toBe(49_152);
      expect(
        values.unavailableState.document.sections.reduce(
          (sum, section) =>
            sum +
            section.measures.reduce(
              (measureSum, measure) => measureSum + measure.events.length,
              0,
            ),
          0,
        ),
      ).toBe(4_722);
      expect(values.unavailableState.bookmarks).toEqual({
        selection: { kind: "none" },
        insertion: { kind: "document-start" },
        range: null,
      });
      expect(values.unavailableReplacementBookmarks).not.toBe(
        values.unavailableState.bookmarks,
      );
      expect(values.unavailableReplacementBookmarks).toEqual(
        values.unavailableState.bookmarks,
      );
      expect(values.unavailableState.history).toEqual({
        undo: [],
        redo: [],
        retainedBytesEstimate: 0,
      });
      expect(values.unavailableState.pendingRequests).toEqual([
        {
          kind: "document-transition",
          id: 101,
          documentId: values.unavailableState.document.id,
          baseRevision: 7,
          status: "running",
        },
      ]);
      expect(values.unavailablePreview.replacementImpact).toEqual({
        historyEntryRetainedBytes: 16_777_217,
        evictedUndoEntries: 0,
        redoEntriesCleared: 0,
        confirmationRequired: true,
        undoDisposition: "explicitly-unavailable",
        undoEntriesAfterCommit: 0,
        undoRetainedBytesAfterCommit: 0,
        exportRecommended: true,
      });
      expect(values.unavailablePreviewReassessmentBytes).toBe(16_777_217);
      expect(
        values.unavailableCommitRequest.nonUndoableConfirmation.requirement,
      ).toBe(values.unavailablePreview.nonUndoableConfirmationRequirement);
      expect(values.wrongAcknowledgement.requirement.confirmationId).not.toBe(
        values.acknowledgement.requirement.confirmationId,
      );
      expect({
        ...values.wrongAcknowledgement,
        requirement: {
          ...values.wrongAcknowledgement.requirement,
          confirmationId: values.acknowledgement.requirement.confirmationId,
        },
      }).toEqual(values.acknowledgement);
      expect(values.unavailableCommitRequest.currentState).toBe(
        values.unavailableState,
      );
      expect(
        values.unavailableCommitRequest.currentState.documentTransition,
      ).toBe(values.unavailableTransition);
      expect("retirementProof" in values.unavailableCommitRequest).toBe(false);
      expect(values.unavailableRetirementRequest.identity.requestId).toBe(101);
      expect(values.expectedUnavailableEmbeddedReceipt.requestId).toBe(101);
      expect(
        values.unavailableReplacementCommand.undoDisposition.confirmationId,
      ).toBe(
        values.unavailablePreview.nonUndoableConfirmationRequirement
          .confirmationId,
      );
      expect(values.unavailableReplacementResult.state.document.id).toBe(
        values.unavailablePreview.candidate.id,
      );
      expect(values.unavailableReplacementResult.state.revision).toBe(8);
      expect(values.unavailableReplacementResult.state.history).toEqual({
        undo: [],
        redo: [],
        retainedBytesEstimate: 0,
      });
      expect(values.unavailableReplacementResult.state.transport).toBe(
        values.unavailableState.transport,
      );
      expect(values.unavailableReplacementResult.state.bookmarks).not.toBe(
        values.unavailableState.bookmarks,
      );
      expect(values.unavailableReplacementResult.state.bookmarks).toEqual(
        values.unavailableReplacementBookmarks,
      );
      expect(
        values.unavailableReplacementResult.state.notices.at(-1),
      ).toMatchObject({
        level: "warning",
        code: "history.replacement_not_undoable",
        createdAtRevision: 8,
      });
      expect(values.unavailableReplacementResult.effects).toContainEqual({
        kind: "recommend-export",
        revision: 8,
        requestId: 101,
        reasonCode: "history.replacement_not_undoable",
      });
      expect(
        values.unavailableReplacementResult.counters.historyBytesEstimated,
      ).toBe(16_777_217);
    },
    // This executes the real F2/F3 publication and A0 estimator twice over the
    // independently authored 49,152-measure threshold fixture. Wall time is
    // evidence only; retries remain forbidden and the semantic work is exact.
    { timeout: 180_000, retry: 0 },
  );

  test("nested JSON and text goldens conform to their independent upstream boundaries", async () => {
    const contract = await readJsonObject(
      join(fixtureRoot, "e0-interchange-contract.json"),
    );
    const keyOrder = (contract["canonicalJson"] as JsonObject)[
      "keyOrder"
    ] as JsonObject;
    const nested = await readJsonObject(
      join(fixtureRoot, "goldens/nested.changes.json"),
    );
    const sections = nested["sections"] as JsonObject[];
    const section = recordAt(sections, 0, "section-0");
    const measures = section["measures"] as JsonObject[];
    const measure0 = recordAt(measures, 0, "measure-0");
    const measure1 = recordAt(measures, 1, "measure-1");
    const measure2 = recordAt(measures, 2, "measure-2");
    const autoEvent = recordAt(
      measure0["events"] as JsonObject[],
      0,
      "auto-event",
    );
    const manualEvent = recordAt(
      measure1["events"] as JsonObject[],
      0,
      "manual-event",
    );
    const frozenEvent = recordAt(
      measure2["events"] as JsonObject[],
      0,
      "frozen-event",
    );
    const parsedChord = autoEvent["chord"] as JsonObject;
    const customChord = manualEvent["chord"] as JsonObject;
    const autoVoicing = autoEvent["voicing"] as JsonObject;
    const manualVoicing = manualEvent["voicing"] as JsonObject;
    const frozenVoicing = frozenEvent["voicing"] as JsonObject;

    const orderCases: readonly [JsonObject, string][] = [
      [nested, "document"],
      [nested["meter"] as JsonObject, "meter"],
      [nested["key"] as JsonObject, "keyContext"],
      [
        (nested["key"] as JsonObject)["tonic"] as JsonObject,
        "spelledPitchClass",
      ],
      [section, "section"],
      [section["keyOverride"] as JsonObject, "keyContext"],
      [measure0, "measure"],
      [measure0["completion"] as JsonObject, "completionEmptyOrComplete"],
      [measure2["completion"] as JsonObject, "completionPickupOrIncomplete"],
      [autoEvent, "event"],
      [autoEvent["duration"] as JsonObject, "beat"],
      [parsedChord, "parsedChord"],
      [
        recordAt(parsedChord["alterations"] as JsonObject[], 0, "alteration"),
        "degree",
      ],
      [customChord, "customChord"],
      [
        recordAt(customChord["pitchNames"] as JsonObject[], 0, "pitch-name"),
        "spelledPitchClass",
      ],
      [autoVoicing, "autoVoicing"],
      [autoVoicing["range"] as JsonObject, "midiRange"],
      [manualVoicing, "storedVoicing"],
      [
        recordAt(manualVoicing["pitches"] as JsonObject[], 0, "manual-pitch"),
        "spelledPitch",
      ],
      [frozenVoicing, "frozenVoicing"],
      [frozenVoicing["generatedBy"] as JsonObject, "generatedBy"],
      [nested["playback"] as JsonObject, "playback"],
    ];
    for (const [value, shape] of orderCases) {
      expect(Object.keys(value)).toEqual(keyOrder[shape] as string[]);
    }

    const decoded = decodeDocumentShape(nested);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error("E0_NESTED_GOLDEN_F2_REFUSAL");
    expect(validateDocumentSemantics(decoded.value).ok).toBe(true);

    for (const filename of [
      "goldens/minimal.changes.txt",
      "goldens/rich.changes.txt",
    ] as const) {
      const text = await readFile(join(fixtureRoot, filename), "utf8");
      const parsed = parseChartText(
        text,
        { mode: "document" },
        CHART_IMPORT_PARSE_ACCIDENTAL_STYLE,
      );
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) throw new Error(`E0_TEXT_GOLDEN_T0_REFUSAL:${filename}`);
      const formatted = formatChartText(parsed.draft, "ascii");
      expect(formatted).toEqual({ ok: true, canonicalText: text });
    }
  });

  test("chart import fixes the actual T0 accidental-style call to ASCII", async () => {
    const authority = await readJsonObject(theoryChartCasesPath);
    const sourceCase = (authority["successCases"] as JsonObject[]).find(
      (candidate) => candidate["id"] === "T0-CHART-014",
    );
    if (sourceCase === undefined) {
      throw new Error("E0_ASCII_STYLE_SOURCE_CASE_MISSING");
    }
    const input = sourceCase["input"];
    if (typeof input !== "string") {
      throw new Error("E0_ASCII_STYLE_SOURCE_TEXT_MISSING");
    }
    const ascii = parseChartText(
      input,
      { mode: "document" },
      CHART_IMPORT_PARSE_ACCIDENTAL_STYLE,
    );
    const unicode = parseChartText(input, { mode: "document" }, "unicode");
    expect(ascii.ok).toBe(true);
    expect(unicode.ok).toBe(true);
    if (!ascii.ok || !unicode.ok) {
      throw new Error("E0_ASCII_STYLE_SOURCE_PARSE_REFUSAL");
    }
    expect(ascii.canonicalText).toBe(
      "@meter 4/4\n@key Db major\n[A]\n| C:4 |\n",
    );
    expect(unicode.canonicalText).toBe(
      "@meter 4/4\n@key D♭ major\n[A]\n| C:4 |\n",
    );
    expect(ascii.canonicalText).not.toBe(unicode.canonicalText);
  });

  test("validator rejects a coherent semantic-lock rewrite", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "e0-interchange-contract.json", (value) => {
        (value["limits"] as JsonObject)["previewIssuesRetained"] = 65;
      });
      await expectRejected(root, "E0_DIGEST_MISMATCH", "E0_LIMITS");
    });
  });

  test("semantic pin rejects a case rewrite even when its byte pin is refreshed", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "canonical-json-cases.json", (value) => {
        const cases = value["cases"] as JsonObject[];
        const over = cases.find((item) => item["id"] === "E0-JX-017");
        if (over === undefined) throw new Error("E0_TEST_CASE_MISSING");
        over["resultCategory"] = "EXPORT_READY";
        over["failureStage"] = null;
        over["expectedIssueCodes"] = [];
      });
      const path = join(root, "canonical-json-cases.json");
      const refreshedDigests = {
        ...E0_PROPOSED_BYTE_DIGESTS,
        "canonical-json-cases.json": sha256(await readFile(path)),
      };
      const report = await validateE0Contract(root, {
        expectedByteDigests: refreshedDigests,
      });
      expect(findingCodes(report)).toContain("E0_SEMANTIC_DIGEST");
      expect(findingCodes(report)).not.toContain("E0_DIGEST_MISMATCH");
      expect(E0_PROPOSED_SEMANTIC_DIGEST).toMatch(/^[0-9a-f]{64}$/u);
    });
  });

  test("validator rejects drift in the executable exact-byte canonical recipe", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "input-fixture-ledger.json", (value) => {
        const fixtures = value["fixtures"] as JsonObject[];
        const fixture = fixtures.find(
          (candidate) => candidate["id"] === "E0-IMPORT-CANONICAL-2097152",
        );
        if (fixture === undefined) throw new Error("E0_TEST_EXACT_BYTE_RECIPE");
        const recipe = fixture["recipe"] as JsonObject;
        const expected = recipe["expected"] as JsonObject;
        expected["utf8Bytes"] = 2_097_151;
      });
      await expectRejected(
        root,
        "E0_EXACT_BYTE_CANONICAL_RECIPE_INVALID",
        "E0_EXACT_BYTE_CANONICAL_MATERIALIZATION_INVALID",
      );
    });
  });

  test("validator rejects root-only duplicate fixtures and missing per-object proof", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "input-fixture-ledger.json", (value) => {
        const fixtures = value["fixtures"] as JsonObject[];
        const fixture = fixtures.find(
          (candidate) =>
            candidate["id"] === "E0-IMPORT-DUPLICATE-NESTED-LITERAL",
        );
        if (fixture === undefined) throw new Error("E0_TEST_NESTED_DUPLICATE");
        fixture["text"] = '{"x":1,"x":2}';
      });
      await mutateJson(root, "import-cases.json", (value) => {
        const cases = value["cases"] as JsonObject[];
        const positive = cases.find(
          (candidate) => candidate["id"] === "E0-JI-007",
        );
        if (positive === undefined) throw new Error("E0_TEST_PER_OBJECT_CASE");
        positive["inputFixtureIds"] = [
          "goldens/minimal.changes.json",
          "instrumented:JSON.parse",
        ];
      });
      await expectRejected(
        root,
        "E0_NESTED_DUPLICATE_FIXTURE_INVALID",
        "E0_DUPLICATE_SCOPE_CASE_COVERAGE_INVALID",
      );
    });
  });

  test("validator rejects retained complete evidence and caller-selected chart style", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "input-fixture-ledger.json", (value) => {
        const shared = value["sharedBases"] as JsonObject;
        const preview = shared["canonical-ready-import-preview"] as JsonObject;
        preview["legacyReport"] = { items: [] };
      });
      await mutateJson(root, "e0-interchange-contract.json", (value) => {
        const defaults = value["chartImportDefaults"] as JsonObject;
        defaults["parseAccidentalStyle"] = "caller-selected";
        defaults["callerMayChooseParseAccidentalStyle"] = true;
      });
      await expectRejected(
        root,
        "E0_INPUT_PREVIEW_BASE_INVALID",
        "E0_CHART_IMPORT_DEFAULTS",
      );
    });
  });

  test("validator rejects fabricated X1 evidence authority and a success fallback", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "input-fixture-ledger.json", (value) => {
        const fixtures = value["fixtures"] as JsonObject[];
        const proof = fixtures.find(
          (candidate) =>
            candidate["id"] === "x1-evidence-expectation:no-future-attack",
        );
        const adapter = fixtures.find(
          (candidate) => candidate["id"] === "x1-adapter:unavailable",
        );
        if (proof === undefined || adapter === undefined) {
          throw new Error("E0_TEST_X1_BOUNDARY_FIXTURE");
        }
        proof["runtimeEvidenceMaterialized"] = true;
        const override = adapter["override"] as JsonObject;
        override["return"] = {
          ok: true,
          value: { authority: "e0-local-fallback" },
        };
      });
      await expectRejected(
        root,
        "E0_TRANSPORT_PROOF_EXPECTATION_INVALID",
        "E0_TRANSPORT_UNAVAILABLE_ADAPTER_INVALID",
      );
    });
  });

  test("validator rejects direct A0 marker writes and false A1 durability", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "e0-interchange-contract.json", (value) => {
        const handoffs = value["markerSettlementHandoffs"] as JsonObject;
        handoffs["a0MutationPolicy"] = "direct-export-revision-write";
      });
      await mutateJson(root, "input-fixture-ledger.json", (value) => {
        const fixtures = value["fixtures"] as JsonObject[];
        const persisted = fixtures.find(
          (candidate) =>
            candidate["id"] === "recovery-marker-persistence:persisted",
        );
        if (persisted === undefined) {
          throw new Error("E0_TEST_A1_BOUNDARY_FIXTURE");
        }
        const result = persisted["return"] as JsonObject;
        result["durability"] = "pending-failed";
      });
      await expectRejected(
        root,
        "E0_MARKER_SETTLEMENT_HANDOFFS",
        "E0_MARKER_ADAPTER_FIXTURE_INVALID",
      );
    });
  });

  test("validator rejects golden-byte drift", async () => {
    await withFixtureCopy(async (root) => {
      const path = join(root, "goldens/minimal.changes.txt");
      const source = await readFile(path, "utf8");
      await writeFile(path, `${source.slice(0, -1)} \n`, "utf8");
      await expectRejected(root, "E0_DIGEST_MISMATCH");
    });
  });

  test("validator rejects non-materializable A0 workflow identities", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "input-fixture-ledger.json", (value) => {
        const shared = value["sharedBases"] as JsonObject;
        const wrapper = shared["workflow-state-revision-7"] as JsonObject;
        const state = wrapper["value"] as JsonObject;
        const transport = state["transport"] as JsonObject;
        transport["commandRequestId"] = "transport-request-e0-11";
        delete transport["notificationSequence"];
      });
      await expectRejected(root, "E0_WORKFLOW_TRANSPORT_INVALID");
    });
  });

  test("validator rejects drift in the executable oversized-history recipe", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "input-fixture-ledger.json", (value) => {
        const shared = value["sharedBases"] as JsonObject;
        const oversized = shared[
          "workflow-document-history-oversized"
        ] as JsonObject;
        oversized["expectedHistoryEntryRetainedBytes"] = 16_777_216;
      });
      await expectRejected(root, "E0_HISTORY_OVERSIZED_RECIPE_INVALID");
    });
  });

  test("validator rejects a transport handoff derived from an idle state", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "input-fixture-ledger.json", (value) => {
        const fixtures = value["fixtures"] as JsonObject[];
        const handoff = fixtures.find(
          (fixture) => fixture["id"] === "transport-handoff:canonical:playing",
        );
        if (handoff === undefined) throw new Error("E0_TEST_HANDOFF_STATE");
        handoff["base"] = { sharedBase: "workflow-state-revision-7" };
      });
      await expectRejected(
        root,
        "E0_TRANSPORT_HANDOFF_FIXTURE_INVALID",
        "E0_TRANSPORT_HANDOFF_MATERIALIZATION_INVALID",
      );
    });
  });

  test("validator rejects a missing Cartesian transport cell", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "workflow-adapter-cases.json", (value) => {
        const matrix = value["transportWorkflowMatrix"] as JsonObject;
        const cells = matrix["cells"] as JsonObject[];
        cells.pop();
      });
      await expectRejected(root, "E0_TRANSPORT_MATRIX_COVERAGE");
    });
  });

  test("validator rejects a forged matching confirmation acknowledgement", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "input-fixture-ledger.json", (value) => {
        const fixtures = value["fixtures"] as JsonObject[];
        const matching = fixtures.find(
          (fixture) => fixture["id"] === "confirmation:matching",
        );
        if (matching === undefined) throw new Error("E0_TEST_CONFIRMATION");
        const acknowledgement = matching["value"] as JsonObject;
        acknowledgement["requirement"] = {
          schema: "changes.import-nonundoable-confirmation.v1",
          confirmationId: "forged",
        };
      });
      await expectRejected(
        root,
        "E0_CONFIRMATION_ACKNOWLEDGEMENT_MATERIALIZATION_INVALID",
        "E0_CONFIRMATION_REQUIREMENT_INVALID",
      );
    });
  });

  test("validator rejects a wrong confirmation with a second changed field", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "input-fixture-ledger.json", (value) => {
        const fixtures = value["fixtures"] as JsonObject[];
        const wrong = fixtures.find(
          (fixture) => fixture["id"] === "confirmation:wrong",
        );
        if (wrong === undefined) throw new Error("E0_TEST_WRONG_CONFIRMATION");
        const acknowledgement = wrong["value"] as JsonObject;
        const requirement = acknowledgement["requirement"] as JsonObject;
        requirement["candidateDocumentId"] = "document-e0-nested";
      });
      await expectRejected(
        root,
        "E0_CONFIRMATION_WRONG_ACKNOWLEDGEMENT_INVALID",
        "E0_CONFIRMATION_WRONG_ACKNOWLEDGEMENT_NOT_NEAR_MISS",
      );
    });
  });

  test("validator reports invalid UTF-8 as a structured finding", async () => {
    await withFixtureCopy(async (root) => {
      const path = join(root, "goldens/minimal.changes.txt");
      const bytes = new Uint8Array(await readFile(path));
      bytes[0] = 0xff;
      await writeFile(path, bytes);
      await expectRejected(root, "E0_DIGEST_MISMATCH", "E0_UTF8_INVALID");
    });
  });

  test("validator production-import guard covers quote and import syntax variants", () => {
    const hostileSource = [
      "import type { X } from '../src/export';",
      'export { Y } from "../src/application";',
      "void import('../src/export/interchange-contract');",
      "const path = '../src/application/e0-interchange-contract'; void import(path);",
      'const value = require("../src/export");',
      "type Z = import('../src/application').Z;",
    ].join("\n");
    expect(forbiddenValidatorProductionImports(hostileSource)).toHaveLength(6);
  });

  test("validator rejects escaped duplicate JSON keys", async () => {
    await withFixtureCopy(async (root) => {
      const path = join(root, "canonical-json-cases.json");
      const source = await readFile(path, "utf8");
      const target = '"schema": "changes.fixtures.e0-canonical-json-cases.v1",';
      const replacement = `${target}\n  "\\u0073chema": "changes.fixtures.e0-canonical-json-cases.v1",`;
      expect(source.includes(target)).toBe(true);
      await writeFile(path, source.replace(target, replacement), "utf8");
      await expectRejected(root, "E0_JSON_DUPLICATE_KEY");
    });
  });

  test("validator rejects a missing reciprocal trace backlink", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "trace-ledger.json", (value) => {
        const traces = value["traces"] as JsonObject[];
        const trace = traces.find(
          (candidate) => candidate["id"] === "E0-TRACE-JSON-LOSSLESS",
        );
        if (trace === undefined) throw new Error("E0_TEST_TRACE_MISSING");
        trace["caseIds"] = (trace["caseIds"] as string[]).filter(
          (id) => id !== "E0-JX-001",
        );
      });
      await expectRejected(root, "E0_TRACE_BACKLINK");
    });
  });

  test("stable commands, aggregate gate, docs, and boundary amendments are wired", async () => {
    const packageJson = await readJsonObject(packagePath);
    const scripts = packageJson["scripts"] as JsonObject;
    const architecture = await readFile(architecturePath, "utf8");
    const contractDoc = await readFile(contractDocPath, "utf8");
    const c0ContractDoc = await readFile(c0ContractDocPath, "utf8");
    const verifySource = await readFile(verifyPath, "utf8");
    const validatorSource = await readFile(validatorPath, "utf8");

    expect(scripts["validate:e0-contract"]).toBe(
      "bun scripts/validate-e0-contract.ts",
    );
    expect(architecture).toContain("docs/E0_INTERCHANGE_CONTRACT.md");
    expect(architecture).toContain(
      "tests/fixtures/interchange/e0-interchange-contract.json",
    );
    expect(architecture).toContain("bun run validate:e0-contract");
    const c0Gates = gateIndices(verifySource, "c0-legacy-migration-contract");
    const e0Gates = gateIndices(verifySource, "e0-interchange-contract");
    const x0Gates = gateIndices(verifySource, "x0-audio-engine-contract");
    expect(c0Gates).toHaveLength(1);
    expect(e0Gates).toHaveLength(1);
    expect(x0Gates).toHaveLength(1);
    expect(c0Gates[0] ?? -1).toBeLessThan(e0Gates[0] ?? -1);
    expect(e0Gates[0] ?? -1).toBeLessThan(x0Gates[0] ?? -1);
    expect(
      verifySource.match(/["']scripts\/validate-e0-contract\.ts["']/gu),
    ).toHaveLength(1);
    expect(contractDoc).toContain("Exact byte goldens remain proposed");
    expect(contractDoc).toContain("fully formed A0 `ReplaceDocumentCommand`");
    expect(contractDoc).toContain("export.marker_artifact_mismatch");
    expect(c0ContractDoc).toContain(
      "E0 integration may invoke F3 before preview",
    );
    expect(forbiddenValidatorProductionImports(validatorSource)).toEqual([]);
  });
});
