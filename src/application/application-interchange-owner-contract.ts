import type { DocumentId, ValidatedDocument } from "../domain";
import type {
  AppRevision,
  ApplicationEffect,
  ApplicationReplacementOrigin,
  ApplicationRequestId,
  ApplicationWorkCounters,
  CommandId,
  DocumentTransitionState,
  ReplacementRetirementReceipt,
  TransportGeneration,
} from "./application-state-contract";

/**
 * A0-owned authority exposed only through the application composition root.
 *
 * This module is a specification surface only. It does not bind or amend any
 * consumer contract. The controller-owned production implementation is
 * deliberately deferred to the bridge build phase.
 */
export const A0_E0_INTERCHANGE_OWNER_CONTRACT_SCHEMA =
  "changes.application.interchange-owner-contract.v1";

export const A0_E0_INTERCHANGE_OWNER_IMPLEMENTATION_STATUS =
  "specified-unimplemented" as const;

export const A0_E0_INTERCHANGE_OWNER_OPERATION_NAMES = Object.freeze([
  "prepareImportReplacementPublication",
  "discardImportReplacementPublication",
  "publishImportReplacement",
  "readCurrentApplicationDocumentIdentity",
  "publishCanonicalExportRevision",
] as const);

export type A0E0InterchangeOwnerOperationName =
  (typeof A0_E0_INTERCHANGE_OWNER_OPERATION_NAMES)[number];

export const IMPORT_SOURCE_FORMATS = Object.freeze([
  "canonical-json-v2",
  "unversioned-legacy-json",
  "chart-text-v1",
] as const);

export type ImportSourceFormat = (typeof IMPORT_SOURCE_FORMATS)[number];

export type ImportRequestIdentity = Readonly<{
  requestId: ApplicationRequestId;
  documentId: DocumentId;
  baseRevision: AppRevision;
}>;

export type ApplicationDocumentIdentity = Readonly<{
  documentId: DocumentId;
  revision: AppRevision;
}>;

type ImportReplacementImpactBase = Readonly<{
  historyEntryRetainedBytes: number;
  evictedUndoEntries: number;
  redoEntriesCleared: number;
  confirmationRequired: true;
}>;

export type RetainedImportReplacementImpact = ImportReplacementImpactBase &
  Readonly<{
    undoDisposition: "retained";
    undoEntriesAfterCommit: number;
    undoRetainedBytesAfterCommit: number;
    exportRecommended: false;
  }>;

export type ExplicitlyUnavailableImportReplacementImpact =
  ImportReplacementImpactBase &
    Readonly<{
      undoDisposition: "explicitly-unavailable";
      undoEntriesAfterCommit: 0;
      undoRetainedBytesAfterCommit: 0;
      exportRecommended: true;
    }>;

export type ImportReplacementImpact =
  | RetainedImportReplacementImpact
  | ExplicitlyUnavailableImportReplacementImpact;

export type ImportReplacementCommandSeed = Readonly<{
  id: CommandId;
  label: string;
  logicalTimeMs: number;
}>;

export const IMPORT_NONUNDOABLE_CONFIRMATION_SCHEMA =
  "changes.import-nonundoable-confirmation.v1";

/** Allocated by application before preview; confirmation cannot mint a token. */
export type ImportNonUndoableConfirmationSeed = Readonly<{
  confirmationId: string;
}>;

export type ImportNonUndoableConfirmationRequirement = Readonly<{
  schema: typeof IMPORT_NONUNDOABLE_CONFIRMATION_SCHEMA;
  confirmationId: string;
  identity: ImportRequestIdentity;
  candidateDocumentId: DocumentId;
  commandId: CommandId;
  disclosedImpact: ExplicitlyUnavailableImportReplacementImpact;
}>;

export type ImportNonUndoableConfirmationAcknowledgement = Readonly<{
  kind: "acknowledged";
  /** Must be field-identical to the immutable requirement stored in preview. */
  requirement: ImportNonUndoableConfirmationRequirement;
}>;

type ActiveDocumentTransition = Extract<
  DocumentTransitionState,
  { requestId: ApplicationRequestId }
>;

export type CommittingDocumentTransition = Readonly<
  Omit<ActiveDocumentTransition, "kind"> & { kind: "committing" }
>;

export type RetiringTransportDocumentTransition = Readonly<
  Omit<ActiveDocumentTransition, "kind"> & { kind: "retiring-transport" }
>;

export const PREPARED_IMPORT_REPLACEMENT_PUBLICATION_SCHEMA =
  "changes.prepared-import-replacement-publication.v1";

/**
 * A structural echo of one private preparation. It is not authority: A0 must
 * find the exact still-live registry entry under the complete identity before
 * it can publish.
 */
export type PreparedImportReplacementPublication = Readonly<{
  schema: typeof PREPARED_IMPORT_REPLACEMENT_PUBLICATION_SCHEMA;
  identity: ImportRequestIdentity;
  sourceFormat: ImportSourceFormat;
  candidateDocumentId: DocumentId;
  expectedTransportGeneration: TransportGeneration;
  committingTransition: CommittingDocumentTransition;
}>;

export type ImportReplacementHandoff = Readonly<{
  prepared: PreparedImportReplacementPublication;
  retirement: ReplacementRetirementReceipt;
}>;

type PrepareImportReplacementPublicationRequestBase = Readonly<{
  identity: ImportRequestIdentity;
  sourceFormat: ImportSourceFormat;
  replacementOrigin: Extract<
    ApplicationReplacementOrigin,
    "canonical-import" | "legacy-import"
  >;
  candidate: ValidatedDocument;
  replacementCommandSeed: ImportReplacementCommandSeed;
}>;

/**
 * State-free evidence submitted to the owner. The controller closure supplies
 * the only current AppState authority and rechecks every fallible condition.
 */
export type PrepareImportReplacementPublicationRequest =
  | (PrepareImportReplacementPublicationRequestBase &
      Readonly<{
        disclosedImpact: RetainedImportReplacementImpact;
        currentTransition: RetiringTransportDocumentTransition &
          Readonly<{ undoDisposition: "retained" }>;
        nonUndoableConfirmation: null;
      }>)
  | (PrepareImportReplacementPublicationRequestBase &
      Readonly<{
        disclosedImpact: ExplicitlyUnavailableImportReplacementImpact;
        currentTransition: RetiringTransportDocumentTransition &
          Readonly<{ undoDisposition: "explicitly-unavailable" }>;
        nonUndoableConfirmation: ImportNonUndoableConfirmationAcknowledgement;
      }>);

export const IMPORT_REPLACEMENT_PREPARATION_REFUSAL_CODES = Object.freeze([
  "import.replacement_request_invalid",
  "import.replacement_request_stale",
  "import.replacement_wrong_document",
  "import.replacement_transition_mismatch",
  "import.replacement_command_id_invalid",
  "import.replacement_command_label_invalid",
  "import.replacement_logical_time_invalid",
  "application.revision_exhausted",
  "application.sequence_exhausted",
  "import.candidate_structural_invalid",
  "import.candidate_semantic_invalid",
  "import.replacement_history_estimate_failed",
  "import.replacement_impact_unavailable",
  "import.replacement_impact_mismatch",
  "import.confirmation_stale",
  "import.confirmation_wrong_document",
  "import.confirmation_impact_mismatch",
  "import.confirmation_identity_mismatch",
  "history.nonundoable_confirmation_required",
  "import.replacement_preparation_busy",
] as const);

export type ImportReplacementPreparationRefusalCode =
  (typeof IMPORT_REPLACEMENT_PREPARATION_REFUSAL_CODES)[number];

export type PrepareImportReplacementPublicationResult =
  | Readonly<{
      ok: true;
      value: PreparedImportReplacementPublication;
    }>
  | Readonly<{
      ok: false;
      code: ImportReplacementPreparationRefusalCode;
    }>;

/** Exact producer operation implemented later beside controller-owned state. */
export type PrepareImportReplacementPublicationOperation = (
  request: PrepareImportReplacementPublicationRequest,
) => PrepareImportReplacementPublicationResult;

/** A composition-bound consumer must normalize this fallible unknown result. */
export type PrepareImportReplacementPublicationPort = (
  request: PrepareImportReplacementPublicationRequest,
) => unknown;

/** Consumer-facing alias for the untrusted composition port. */
export type PrepareImportReplacementPublication =
  PrepareImportReplacementPublicationPort;

export const DISCARD_IMPORT_REPLACEMENT_PUBLICATION_REASONS = Object.freeze([
  "preparation-protocol-invalid",
  "retirement-refused",
  "retirement-protocol-invalid",
  "publication-protocol-invalid",
] as const);

export type DiscardImportReplacementPublicationReason =
  (typeof DISCARD_IMPORT_REPLACEMENT_PUBLICATION_REASONS)[number];

export type DiscardImportReplacementPublicationRequest = Readonly<{
  identity: ImportRequestIdentity;
  reason: DiscardImportReplacementPublicationReason;
}>;

export type DiscardImportReplacementPublicationResult = Readonly<{
  outcome: "invalidated-by-request";
  identity: ImportRequestIdentity;
  liveForRequest: 0;
}>;

/**
 * Cleanup is the deliberate exact-result exception: it is synchronous, total,
 * idempotent, nonthrowing, and never awaits or returns unknown.
 */
export type DiscardImportReplacementPublicationOperation = (
  request: DiscardImportReplacementPublicationRequest,
) => DiscardImportReplacementPublicationResult;

export type DiscardImportReplacementPublicationPort =
  DiscardImportReplacementPublicationOperation;

/** Consumer-facing alias for the exact total cleanup port. */
export type DiscardImportReplacementPublication =
  DiscardImportReplacementPublicationPort;

export const IMPORT_REPLACEMENT_PUBLICATION_REFUSAL_CODES = Object.freeze([
  "import.replacement_preparation_missing",
  "import.replacement_preparation_stale",
  "import.replacement_retirement_mismatch",
] as const);

export type ImportReplacementPublicationRefusalCode =
  (typeof IMPORT_REPLACEMENT_PUBLICATION_REFUSAL_CODES)[number];

export type PublishImportReplacementResult =
  | Readonly<{
      ok: true;
      outcome: "committed";
      identity: ImportRequestIdentity;
      documentId: DocumentId;
      revision: AppRevision;
      effects: readonly ApplicationEffect[];
      counters: ApplicationWorkCounters;
      liveForRequest: 0;
    }>
  | Readonly<{
      ok: false;
      outcome: "refused";
      code: ImportReplacementPublicationRefusalCode;
      identity: ImportRequestIdentity;
      observedDocumentId: DocumentId;
      observedRevision: AppRevision;
      liveForRequest: 0;
    }>;

export type PublishImportReplacementOperation = (
  handoff: ImportReplacementHandoff,
) => PublishImportReplacementResult;

export type PublishImportReplacementPort = (
  handoff: ImportReplacementHandoff,
) => unknown;

/** Consumer-facing alias for the untrusted composition port. */
export type PublishImportReplacement = PublishImportReplacementPort;

export type ReadCurrentApplicationDocumentIdentityOperation =
  () => ApplicationDocumentIdentity;

export type ReadCurrentApplicationDocumentIdentityPort = () => unknown;

/** Consumer-facing alias for the untrusted composition port. */
export type ReadCurrentApplicationDocumentIdentity =
  ReadCurrentApplicationDocumentIdentityPort;

export const CANONICAL_EXPORT_REVISION_PUBLICATION_SCHEMA =
  "changes.canonical-export-revision-publication.v1";

export type CanonicalExportRevisionPublication = Readonly<{
  schema: typeof CANONICAL_EXPORT_REVISION_PUBLICATION_SCHEMA;
  documentId: DocumentId;
  revision: AppRevision;
}>;

export type PublishCanonicalExportRevisionRequest = Readonly<{
  publication: CanonicalExportRevisionPublication;
}>;

/** State-free receipt/refusal returned directly by the atomic A0 operation. */
export type PublishCanonicalExportRevisionResult =
  | Readonly<{
      ok: true;
      outcome: "published";
      documentId: DocumentId;
      revision: AppRevision;
    }>
  | Readonly<{
      ok: false;
      outcome: "refused";
      code:
        "export.marker_publication_stale" | "export.marker_publication_failed";
      observedDocumentId: DocumentId;
      observedRevision: AppRevision;
    }>;

export type PublishCanonicalExportRevisionOperation = (
  request: PublishCanonicalExportRevisionRequest,
) => PublishCanonicalExportRevisionResult;

export type PublishCanonicalExportRevisionPort = (
  request: PublishCanonicalExportRevisionRequest,
) => unknown;

/** Consumer-facing alias for the untrusted composition port. */
export type PublishCanonicalExportRevision = PublishCanonicalExportRevisionPort;

/** The complete composition-private A0 authority available for future binding. */
export interface A0E0InterchangeOwnerPorts {
  readonly prepareImportReplacementPublication: PrepareImportReplacementPublicationPort;
  readonly discardImportReplacementPublication: DiscardImportReplacementPublicationPort;
  readonly publishImportReplacement: PublishImportReplacementPort;
  readonly readCurrentApplicationDocumentIdentity: ReadCurrentApplicationDocumentIdentityPort;
  readonly publishCanonicalExportRevision: PublishCanonicalExportRevisionPort;
}

/** Global registry capacity; no request may allocate a second live entry. */
export const MAX_A0_E0_LIVE_IMPORT_REPLACEMENT_PREPARATIONS = 1;

/**
 * Laws for the future A0 implementation. Current state comes only from the
 * controller closure; bounded work never uses wall time or inspects musical
 * content; publication therefore preserves Manual/Frozen pitches exactly.
 */
export const A0_E0_INTERCHANGE_OWNER_LAW_IDS = Object.freeze([
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
  "BRIDGE-OWNER-11-no-wall-time-or-pitch-inspection",
] as const);

export const A0_E0_INTERCHANGE_OWNER_APPLICABILITY = Object.freeze({
  prepareImportReplacementPublication: Object.freeze({
    synchronization: "synchronous-controller-transaction",
    cancellation: "not-applicable-pre-retirement",
    staleState: "exact-document-revision-request-and-transition",
    replay: "live-complete-identity-required",
    transposition: "applicable-candidate-preserved-byte-for-byte",
    wallTimeCutoff: "forbidden-count-and-state-bounds-only",
  }),
  discardImportReplacementPublication: Object.freeze({
    synchronization: "synchronous-total-cleanup",
    cancellation: "applicable-to-every-post-prepare-nonpublication-path",
    staleState: "request-keyed-cleanup-remains-total",
    replay: "idempotent-live-for-request-zero",
    transposition: "not-applicable-content-invariant-cleanup",
    wallTimeCutoff: "forbidden-constant-registry-bound",
  }),
  publishImportReplacement: Object.freeze({
    synchronization: "synchronous-consume-and-publish",
    cancellation: "forbidden-after-valid-retirement-evidence",
    staleState: "exact-live-preparation-and-retirement-required",
    replay: "consumed-and-invalidated-echoes-refused",
    transposition: "applicable-manual-and-frozen-pitches-preserved",
    wallTimeCutoff: "forbidden-count-and-state-bounds-only",
  }),
  readCurrentApplicationDocumentIdentity: Object.freeze({
    synchronization: "synchronous-controller-closure-read",
    cancellation: "not-applicable-pure-identity-read",
    staleState: "always-reads-latest-at-call-time",
    replay: "not-applicable-no-capability-created",
    transposition: "not-applicable-content-invariant-identity",
    wallTimeCutoff: "forbidden-constant-field-read",
  }),
  publishCanonicalExportRevision: Object.freeze({
    synchronization: "synchronous-validate-compare-write-notify",
    cancellation: "not-applicable-after-successful-delivery",
    staleState: "exact-document-and-revision-cas",
    replay: "same-marker-idempotent-only-at-exact-current-identity",
    transposition: "not-applicable-content-invariant-marker",
    wallTimeCutoff: "forbidden-constant-field-compare-and-write",
  }),
} as const);
