/**
 * E0 v2 interchange amendment — proposed type surface.
 *
 * Companion to docs/E0_V2_INTERCHANGE_CONTRACT.md (bead
 * jcpe-milestone-reliable-studio-l3a.8.4). This module binds accepted E0 v1's
 * orchestration vocabulary to the five A0 owner ports as a NEW, visibly
 * versioned surface: no v1 schema string, policy version, or result type is
 * reused for a changed payload, and accepted v1 files stay byte-identical.
 *
 * Status law: this is a proposed specification. No production module imports
 * it until the E0/build leaf lands behind its own gates, and its semantics
 * bind only at explicit project-owner golden acceptance. The one-way layer
 * edge holds: this module may import the owner contract; the owner contract
 * never imports E0.
 */
import type {
  ApplicationDocumentIdentity,
  ImportNonUndoableConfirmationAcknowledgement,
  ImportNonUndoableConfirmationRequirement,
  ImportReplacementImpact,
  ImportReplacementPreparationRefusalCode,
  ImportReplacementPublicationRefusalCode,
  ImportRequestIdentity,
  PrepareImportReplacementPublicationRequest,
  PublishCanonicalExportRevisionRequest,
} from "./application-interchange-owner-contract";
import type {
  ApplicationEffect,
  ApplicationWorkCounters,
} from "./application-state-contract";
import type {
  ImportFormatHint,
  ImportNonUndoableConfirmationSeed,
  ImportPayload,
} from "./e0-interchange-contract";

export const E0_V2_INTERCHANGE_CONTRACT_SCHEMA =
  "changes.application.e0-interchange-v2-contract.v1";

/** No spec, fixture, validator, or test may imply the build exists. */
export const E0_V2_IMPLEMENTATION_STATUS = "specified-unimplemented";

export const E0_V2_IMPORT_TRANSACTION_POLICY_ID = "changes.import-transaction";
export const E0_V2_IMPORT_TRANSACTION_POLICY_VERSION = 2;
export const E0_V2_EXPORT_MARKER_SETTLEMENT_POLICY_ID =
  "changes.export-marker-settlement";
export const E0_V2_EXPORT_MARKER_SETTLEMENT_POLICY_VERSION = 2;

/**
 * The eleven frozen resolution rows over the bridge contract's section 3.2
 * unresolved-conflict inventory. Every v2 fixture family traces to at least
 * one row; the validator refuses an untraced family or an uncovered row.
 */
export const E0_V2_CONFLICT_RESOLUTION_IDS = Object.freeze([
  "E0V2-RES-01-import-request-current-state",
  "E0V2-RES-02-preview-impact-projection",
  "E0V2-RES-03-preview-to-owner-request-projection",
  "E0V2-RES-04-acknowledgement-provenance",
  "E0V2-RES-05-state-free-commit-success",
  "E0V2-RES-06-state-free-commit-refusals",
  "E0V2-RES-07-state-free-publication-protocol-failure",
  "E0V2-RES-08-state-free-marker-path",
  "E0V2-RES-09-widened-preparation-refusals",
  "E0V2-RES-10-replacement-publication-refusals",
  "E0V2-RES-11-state-free-public-marker-requests",
] as const);

export type E0V2ConflictResolutionId =
  (typeof E0_V2_CONFLICT_RESOLUTION_IDS)[number];

/**
 * E0V2-RES-09: the v2 preparation vocabulary IS the owner's twenty-code
 * tuple, and accepted v1's six codes are members of it. The six are restated
 * here as an independent literal (never imported from v1, whose union is
 * inline), and the `satisfies` clause proves the subset relation at compile
 * time; the validator re-proves it against its own copies.
 */
export const E0_V1_PREPARATION_REFUSAL_CODES = Object.freeze([
  "import.confirmation_stale",
  "import.confirmation_wrong_document",
  "import.replacement_impact_unavailable",
  "import.confirmation_impact_mismatch",
  "import.confirmation_identity_mismatch",
  "history.nonundoable_confirmation_required",
] as const) satisfies readonly ImportReplacementPreparationRefusalCode[];

export type E0V2PreparationRefusalCode = ImportReplacementPreparationRefusalCode;

/** E0V2-RES-10: v2 adopts the owner's three publication refusal codes. */
export type E0V2PublicationRefusalCode = ImportReplacementPublicationRefusalCode;

/* ------------------------------------------------------------------ */
/* E0V2-RES-02: state-free preview request                            */
/* ------------------------------------------------------------------ */

/**
 * Replaces v1's `replacementImpactContext.state: AppState` with the same
 * retained/explicitly-unavailable disclosure the owner request carries. The
 * projection is computed by the composition from controller-owned state
 * before the preview call, recomputed by the owner at preparation, and is
 * never authority: disagreement refuses
 * `import.replacement_impact_mismatch`.
 */
export type PrepareImportPreviewRequestV2 = Readonly<{
  payload: ImportPayload;
  formatHint: ImportFormatHint;
  replacementImpactProjection: ImportReplacementImpact;
  nonUndoableConfirmationSeed: ImportNonUndoableConfirmationSeed;
}>;

/* ------------------------------------------------------------------ */
/* E0V2-RES-03: the exact preview-to-owner-request projection          */
/* ------------------------------------------------------------------ */

/**
 * Total field-source table: every owner-request field is populated from
 * exactly one declared preview field, with no defaulting and no caller
 * state. The validator checks the table's keys against the owner request's
 * exact key set.
 */
export const E0_V2_PREVIEW_TO_OWNER_REQUEST_PROJECTION = Object.freeze({
  identity: "preview.requestToken",
  sourceFormat: "preview.routedSourceFormat",
  replacementOrigin: "owner-table-for-source-format",
  candidate: "preview.validatedCandidate-by-reference-never-redecoded",
  replacementCommandSeed: "preview.displayedCommandIdentity",
  disclosedImpact: "request.replacementImpactProjection",
  currentTransition: "workflow.retiring-transport-transition",
  nonUndoableConfirmation: "draft.acknowledgement-after-byte-match",
} as const);

/* ------------------------------------------------------------------ */
/* E0V2-RES-04: acknowledgement provenance                             */
/* ------------------------------------------------------------------ */

/**
 * The draft retains verbatim the requirement it displayed — null for the
 * retained disposition, where no requirement is ever shown. A submitted
 * acknowledgement's embedded requirement must deep-equal the retained one
 * (every field: schema, confirmationId, identity, candidateDocumentId,
 * commandId, disclosedImpact) BEFORE the owner request is built. A mismatch
 * refuses `import.confirmation_identity_mismatch`, and an absent
 * acknowledgement for the explicitly-unavailable disposition refuses
 * `history.nonundoable_confirmation_required` — both without calling the
 * owner.
 */
export type E0V2RetainedConfirmationBinding = Readonly<{
  displayedRequirement: ImportNonUndoableConfirmationRequirement | null;
  acknowledgement: ImportNonUndoableConfirmationAcknowledgement | null;
  byteMatchProvedBeforeOwnerCall: true;
}>;

/* ------------------------------------------------------------------ */
/* E0V2-RES-01/-05/-06/-07: the state-free commit surface              */
/* ------------------------------------------------------------------ */

export const E0_V2_COMMIT_REQUEST_SCHEMA =
  "changes.import-commit-request.v2";

/** E0V2-RES-01: state-free evidence only; no `currentState` exists. */
export type CommitImportReplacementRequestV2 = Readonly<{
  schema: typeof E0_V2_COMMIT_REQUEST_SCHEMA;
  ownerRequest: PrepareImportReplacementPublicationRequest;
  confirmationBinding: E0V2RetainedConfirmationBinding;
}>;

export const E0_V2_COMMIT_REFUSAL_STAGES = Object.freeze([
  "pre-owner-provenance",
  "owner-preparation",
  "transport-retirement",
  "owner-publication",
  "port-protocol",
] as const);

export type E0V2CommitRefusalStage =
  (typeof E0_V2_COMMIT_REFUSAL_STAGES)[number];

/**
 * Fully state-free result union. Refusals carry the observed document
 * identity where v1 carried `state: AppState`; the protocol failure carries
 * the reconciliation obligation where v1 carried `lastKnownState`.
 */
export type CommitImportReplacementResultV2 =
  | Readonly<{
      ok: true;
      outcome: "committed";
      identity: ImportRequestIdentity;
      documentId: ApplicationDocumentIdentity["documentId"];
      revision: ApplicationDocumentIdentity["revision"];
      effects: readonly ApplicationEffect[];
      counters: ApplicationWorkCounters;
      liveForRequest: 0;
    }>
  | Readonly<{
      ok: false;
      outcome: "refused";
      stage: Exclude<E0V2CommitRefusalStage, "port-protocol">;
      code:
        | E0V2PreparationRefusalCode
        | E0V2PublicationRefusalCode
        | "transport.replacement_retirement_refused";
      identity: ImportRequestIdentity;
      observedIdentity: ApplicationDocumentIdentity;
      liveForRequest: 0;
    }>
  | Readonly<{
      ok: false;
      outcome: "protocol-invalid";
      stage: "port-protocol";
      diagnostic: E0V2PortProtocolDiagnostic;
      identity: ImportRequestIdentity;
      observedIdentity: ApplicationDocumentIdentity;
      reconciliation: "application-transport-reconciliation-required";
      liveForRequest: 0;
    }>;

/* ------------------------------------------------------------------ */
/* E0V2-RES-08/-11: the state-free marker path                         */
/* ------------------------------------------------------------------ */

export const E0_V2_EXPORT_DELIVERY_REQUEST_SCHEMA =
  "changes.canonical-export-delivery-request.v2";
export const E0_V2_MARKER_SETTLEMENT_REQUEST_SCHEMA =
  "changes.canonical-export-marker-settlement-request.v2";

/** E0V2-RES-11: no `state`; identity is read at need through the port. */
export type PrepareCanonicalExportDeliveryRequestV2 = Readonly<{
  schema: typeof E0_V2_EXPORT_DELIVERY_REQUEST_SCHEMA;
  identity: ImportRequestIdentity;
}>;

export type CompleteCanonicalExportMarkerSettlementRequestV2 = Readonly<{
  schema: typeof E0_V2_MARKER_SETTLEMENT_REQUEST_SCHEMA;
  ownerRequest: PublishCanonicalExportRevisionRequest;
}>;

/* ------------------------------------------------------------------ */
/* Section 3 of the doc: port-return normalization                     */
/* ------------------------------------------------------------------ */

export const E0_V2_NORMALIZED_PORT_NAMES = Object.freeze([
  "prepareImportReplacementPublication",
  "publishImportReplacement",
  "readCurrentApplicationDocumentIdentity",
  "publishCanonicalExportRevision",
] as const);

export type E0V2NormalizedPortName =
  (typeof E0_V2_NORMALIZED_PORT_NAMES)[number];

export const E0_V2_PORT_PROTOCOL_REASONS = Object.freeze([
  "invalid-envelope",
  "threw-or-rejected",
] as const);

export type E0V2PortProtocolReason =
  (typeof E0_V2_PORT_PROTOCOL_REASONS)[number];

/**
 * One diagnostic per protocol breach; the raw value is never retained. The
 * discard port is the deliberate exception and never appears here: it is
 * exact, total, and unwrapped by law.
 */
export type E0V2PortProtocolDiagnostic = Readonly<{
  port: E0V2NormalizedPortName;
  reason: E0V2PortProtocolReason;
  rawResultRetained: false;
}>;

/**
 * The reconciliation stateEffect each breached port maps to — the same
 * vocabulary accepted v1's adapterExceptionPolicy assigns to the
 * corresponding boundary. Frozen here so fixtures and the validator share
 * one source.
 */
export const E0_V2_PORT_BREACH_STATE_EFFECTS = Object.freeze({
  prepareImportReplacementPublication: "NONE",
  publishImportReplacement: "APPLICATION_TRANSPORT_RECONCILIATION_REQUIRED",
  readCurrentApplicationDocumentIdentity: "NONE",
  publishCanonicalExportRevision: "APPLICATION_RECONCILIATION_REQUIRED",
} as const) satisfies Readonly<Record<E0V2NormalizedPortName, string>>;

/** Discard is exact and unwrapped; freezing the law keeps it checkable. */
export const E0_V2_DISCARD_PORT_LAW = Object.freeze({
  normalized: false,
  wrappedInTryCatch: false,
  reasons: "four-closed-cleanup-reasons-only",
} as const);
