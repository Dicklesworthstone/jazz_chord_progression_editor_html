import {
  MAX_DOCUMENT_CHORD_EVENTS,
  MAX_DOCUMENT_SECTIONS,
  MAX_DOMAIN_COPY_GRAPH_NODES,
  MAX_SECTION_MEASURES,
  MAX_UTF8_IMPORT_BYTES,
  type DocumentId,
  type DomainPath,
  type DocumentShapeDecodeResult,
  type ProgressionDocumentShapeV2,
  type ValidatedDocument,
} from "../domain";
import type {
  AccidentalStyle,
  ChartDiagnostic,
  FormatChordSymbol,
  ParseChartText,
  SymbolDiagnostic,
} from "../theory";

/** Versioned public E0 value/adaptor contract owned by the export layer. */
export const INTERCHANGE_EXPORT_CONTRACT_SCHEMA =
  "changes.export.interchange-contract.v1";
export const CANONICAL_JSON_ARTIFACT_SCHEMA =
  "changes.export.canonical-json-artifact.v1";
export const LEAD_SHEET_TEXT_ARTIFACT_SCHEMA =
  "changes.export.lead-sheet-text-artifact.v1";
export const LEAD_SHEET_TEXT_LOSS_REPORT_SCHEMA =
  "changes.export.lead-sheet-text-loss-report.v1";

export const CANONICAL_JSON_POLICY_ID = "changes.canonical-json";
export const CANONICAL_JSON_POLICY_VERSION = 1;
export const LEAD_SHEET_TEXT_EXPORT_POLICY_ID =
  "changes.lead-sheet-text-export";
export const LEAD_SHEET_TEXT_EXPORT_POLICY_VERSION = 1;
export const EXPORT_FILENAME_POLICY_ID = "changes.export-filename";
export const EXPORT_FILENAME_POLICY_VERSION = 1;
export const EXPORT_DELIVERY_POLICY_ID = "changes.export-delivery";
export const EXPORT_DELIVERY_POLICY_VERSION = 1;
export const SEMANTIC_DOCUMENT_HASH_POLICY_ID =
  "changes.semantic-document-hash";
export const SEMANTIC_DOCUMENT_HASH_POLICY_VERSION = 1;

export const INTERCHANGE_EXPORT_OPERATION_NAMES = Object.freeze([
  "prepareCanonicalJsonExport",
  "prepareLeadSheetTextExport",
  "sanitizeExportFilename",
  "deliverExportArtifact",
] as const);

export type InterchangeExportOperationName =
  (typeof INTERCHANGE_EXPORT_OPERATION_NAMES)[number];

/** Successful canonical artifacts must remain acceptable to the import ceiling. */
export const MAX_CANONICAL_JSON_EXPORT_BYTES = MAX_UTF8_IMPORT_BYTES;
export const MAX_LEAD_SHEET_TEXT_EXPORT_BYTES = MAX_UTF8_IMPORT_BYTES;
export const MAX_EXPORT_FILENAME_BASENAME_CODE_POINTS = 120;
export const MAX_EXPORT_FILENAME_CODE_POINTS =
  MAX_EXPORT_FILENAME_BASENAME_CODE_POINTS + ".changes.json".length;

/**
 * One global identity loss, one playback loss, one derived-analysis loss,
 * two possible section losses, and two possible event losses.
 */
export const MAX_LEAD_SHEET_TEXT_LOSS_ITEMS =
  3 + MAX_DOCUMENT_SECTIONS * 2 + MAX_DOCUMENT_CHORD_EVENTS * 2;

export const CANONICAL_JSON_FORMAT = Object.freeze({
  encoding: "utf-8",
  indentationSpaces: 2,
  lineEnding: "lf",
  finalNewline: true,
  escapePolicy: "ecmascript-json-stringify",
  numberPolicy: "finite-domain-number-preserve-negative-zero",
  arrayOrder: "stored-order",
} as const);

/**
 * Every persisted record is projected through these keys. Object insertion
 * order, unknown own keys, prototypes, and toJSON are never consulted.
 */
export const CANONICAL_JSON_KEY_ORDER = Object.freeze({
  document: Object.freeze([
    "schema",
    "id",
    "title",
    "description",
    "meter",
    "tempoBpm",
    "key",
    "sections",
    "playback",
  ] as const),
  meter: Object.freeze(["beatsPerBar", "beatUnit"] as const),
  keyContext: Object.freeze(["tonic", "mode"] as const),
  spelledPitchClass: Object.freeze(["step", "alter"] as const),
  spelledPitch: Object.freeze(["step", "alter", "octave"] as const),
  section: Object.freeze([
    "id",
    "name",
    "annotation",
    "keyOverride",
    "voiceLeadingBoundary",
    "measures",
  ] as const),
  measure: Object.freeze(["id", "events", "completion"] as const),
  completionEmptyOrComplete: Object.freeze(["kind"] as const),
  completionPickupOrIncomplete: Object.freeze([
    "kind",
    "expectedDuration",
    "reason",
  ] as const),
  event: Object.freeze([
    "id",
    "duration",
    "annotation",
    "chord",
    "voicing",
  ] as const),
  beat: Object.freeze(["numerator", "denominator"] as const),
  parsedChord: Object.freeze([
    "kind",
    "sourceText",
    "root",
    "triad",
    "sixth",
    "seventh",
    "extensions",
    "additions",
    "alterations",
    "omissions",
    "bass",
    "colorPolicy",
  ] as const),
  customChord: Object.freeze([
    "kind",
    "sourceText",
    "label",
    "pitchNames",
    "bass",
  ] as const),
  degree: Object.freeze(["number", "alter"] as const),
  autoVoicing: Object.freeze([
    "mode",
    "family",
    "voiceCount",
    "range",
    "bassPolicy",
  ] as const),
  storedVoicing: Object.freeze(["mode", "pitches", "bassPolicy"] as const),
  frozenVoicing: Object.freeze([
    "mode",
    "pitches",
    "bassPolicy",
    "generatedBy",
  ] as const),
  midiRange: Object.freeze(["lowMidi", "highMidi"] as const),
  generatedBy: Object.freeze(["engineVersion", "family"] as const),
  playback: Object.freeze([
    "instrumentId",
    "masterVolume",
    "reverbAmount",
    "countInBars",
    // jcpe-jnnu: the single optional persisted key. Canonical JSON emits it
    // exactly when the document stores it; the default groove is expressed
    // only by absence, so every previously accepted golden stays
    // byte-identical.
    "grooveStyleId",
  ] as const),
} as const);

export const CANONICAL_JSON_MEDIA_TYPE = "application/json;charset=utf-8";
export const LEAD_SHEET_TEXT_MEDIA_TYPE = "text/plain;charset=utf-8";
export const CANONICAL_JSON_FILENAME_EXTENSION = ".changes.json";
export const LEAD_SHEET_TEXT_FILENAME_EXTENSION = ".changes.txt";
export const UNTITLED_CANONICAL_JSON_FILENAME = "untitled-changes.json";
export const UNTITLED_LEAD_SHEET_TEXT_FILENAME = "untitled-changes.txt";

export const EXPORT_FILENAME_FORBIDDEN_CODE_POINTS = Object.freeze([
  0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c,
  0x0d, 0x0e, 0x0f, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19,
  0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f, 0x7f, 0x22, 0x2a, 0x2f, 0x3a, 0x3c, 0x3e,
  0x3f, 0x5c, 0x7c,
] as const);

export const EXPORT_FILENAME_FORBIDDEN_CODE_POINT_RANGES = Object.freeze([
  Object.freeze({ first: 0xd800, last: 0xdfff }),
  Object.freeze({ first: 0x202a, last: 0x202e }),
  Object.freeze({ first: 0x2066, last: 0x2069 }),
] as const);

export const EXPORT_FILENAME_RESERVED_BASENAMES = Object.freeze([
  "con",
  "prn",
  "aux",
  "nul",
  "com1",
  "com2",
  "com3",
  "com4",
  "com5",
  "com6",
  "com7",
  "com8",
  "com9",
  "lpt1",
  "lpt2",
  "lpt3",
  "lpt4",
  "lpt5",
  "lpt6",
  "lpt7",
  "lpt8",
  "lpt9",
] as const);

export type ExportArtifactKind = "canonical-json" | "lead-sheet-text";

export type SanitizedExportFilename = Readonly<{
  basename: string;
  filename: string;
  changed: boolean;
  usedFallback: boolean;
}>;

export type SanitizeExportFilename = (
  title: string,
  kind: ExportArtifactKind,
) => SanitizedExportFilename;

export const SEMANTIC_DOCUMENT_HASH_PATTERN_SOURCE = "^[0-9a-f]{64}$";
declare const semanticDocumentHashBrand: unique symbol;
/** Lowercase hexadecimal SHA-256 without a prefix. */
export type SemanticDocumentHash = string & {
  readonly [semanticDocumentHashBrand]: "SemanticDocumentHash";
};

export type HashBytesResult =
  | Readonly<{ ok: true; digest: SemanticDocumentHash }>
  | Readonly<{ ok: false; code: "export.hash_unavailable" }>;

/** Raw injected Web Crypto boundary; the coordinator validates this unknown. */
export type HashBytes = (bytes: Uint8Array) => Promise<unknown>;

/** Dependency-inverted F3 boundary; the export layer never imports application. */
export type ValidateCanonicalRoundTrip = (
  candidate: ProgressionDocumentShapeV2,
) =>
  | Readonly<{ ok: true; value: ValidatedDocument }>
  | Readonly<{
      ok: false;
      errors: readonly [
        Readonly<{ code: string; path: DomainPath }>,
        ...Readonly<{ code: string; path: DomainPath }>[],
      ];
    }>;

export type SemanticallyEqualDocuments = (
  left: ValidatedDocument,
  right: ValidatedDocument,
) => boolean;

export type CanonicalJsonArtifact = Readonly<{
  schema: typeof CANONICAL_JSON_ARTIFACT_SCHEMA;
  kind: "canonical-json";
  mediaType: typeof CANONICAL_JSON_MEDIA_TYPE;
  filename: string;
  text: string;
  byteLength: number;
  semanticDocumentHash: SemanticDocumentHash;
  sourceDocumentId: DocumentId;
}>;

export const CANONICAL_JSON_EXPORT_REFUSAL_CODES = Object.freeze([
  "export.canonical_bytes_exceeded",
  "export.canonical_parse_failed",
  "export.canonical_structural_round_trip_failed",
  "export.canonical_semantic_round_trip_failed",
  "export.canonical_semantic_mismatch",
  "export.hash_unavailable",
] as const);

export type CanonicalJsonExportRefusalCode =
  (typeof CANONICAL_JSON_EXPORT_REFUSAL_CODES)[number];

export type CanonicalJsonExportRefusal =
  | Readonly<{
      code: "export.canonical_bytes_exceeded";
      path: readonly [];
      received: number;
      maximum: typeof MAX_CANONICAL_JSON_EXPORT_BYTES;
    }>
  | Readonly<{
      code: "export.canonical_parse_failed";
      path: readonly [];
    }>
  | Readonly<{
      code: "export.canonical_structural_round_trip_failed";
      path: DomainPath;
      issueCodes: readonly string[];
    }>
  | Readonly<{
      code: "export.canonical_semantic_round_trip_failed";
      path: DomainPath;
      issueCodes: readonly string[];
    }>
  | Readonly<{
      code: "export.canonical_semantic_mismatch";
      path: readonly [];
    }>
  | Readonly<{
      code: "export.hash_unavailable";
      path: readonly [];
    }>;

export type CanonicalJsonExportResult =
  | Readonly<{ ok: true; value: CanonicalJsonArtifact }>
  | Readonly<{ ok: false; refusal: CanonicalJsonExportRefusal }>;

export type PrepareCanonicalJsonExportRequest = Readonly<{
  document: ValidatedDocument;
}>;

export interface CanonicalJsonExportDependencies {
  readonly decodeDocumentShape: (input: unknown) => DocumentShapeDecodeResult;
  readonly validateCanonicalRoundTrip: ValidateCanonicalRoundTrip;
  readonly semanticallyEqualDocuments: SemanticallyEqualDocuments;
  readonly hashBytes: HashBytes;
  readonly sanitizeExportFilename: SanitizeExportFilename;
}

/** Dependency-taking coordinator used only by the export composition root. */
export type PrepareCanonicalJsonExportCoordinator = (
  request: PrepareCanonicalJsonExportRequest,
  dependencies: CanonicalJsonExportDependencies,
) => Promise<CanonicalJsonExportResult>;

/** Public request-only operation after trusted codec/hash ports are bound. */
export type PrepareCanonicalJsonExport = (
  request: PrepareCanonicalJsonExportRequest,
) => Promise<CanonicalJsonExportResult>;

export const LEAD_SHEET_TEXT_LOSS_CODES = Object.freeze([
  "text.loss.stable_identities",
  "text.loss.playback_settings",
  "text.loss.derived_analysis",
  "text.loss.section_key_override",
  "text.loss.section_voice_leading_boundary",
  "text.loss.source_symbol_alias",
  "text.loss.auto_voicing_policy",
  "text.loss.manual_voicing",
  "text.loss.frozen_voicing",
] as const);

export type LeadSheetTextLossCode = (typeof LEAD_SHEET_TEXT_LOSS_CODES)[number];

export type LeadSheetTextLossItem = Readonly<{
  code: LeadSheetTextLossCode;
  path: DomainPath;
}>;

export type LeadSheetTextLossReport = Readonly<{
  schema: typeof LEAD_SHEET_TEXT_LOSS_REPORT_SCHEMA;
  policyId: typeof LEAD_SHEET_TEXT_EXPORT_POLICY_ID;
  policyVersion: typeof LEAD_SHEET_TEXT_EXPORT_POLICY_VERSION;
  items: readonly LeadSheetTextLossItem[];
  countsByCode: Readonly<Record<LeadSheetTextLossCode, number>>;
}>;

export type LeadSheetTextArtifact = Readonly<{
  schema: typeof LEAD_SHEET_TEXT_ARTIFACT_SCHEMA;
  kind: "lead-sheet-text";
  mediaType: typeof LEAD_SHEET_TEXT_MEDIA_TYPE;
  filename: string;
  text: string;
  byteLength: number;
  sourceDocumentId: DocumentId;
  lossReport: LeadSheetTextLossReport;
}>;

export const LEAD_SHEET_TEXT_EXPORT_REFUSAL_CODES = Object.freeze([
  "export.text.document_empty",
  "export.text.section_empty",
  "export.text.custom_chord_unsupported",
  "export.text.measure_completion_unsupported",
  "export.text_format_failed",
  "export.text_round_trip_parse_failed",
  "export.text_round_trip_projection_mismatch",
  "export.text_bytes_exceeded",
  "export.text_loss_items_exceeded",
] as const);

export type LeadSheetTextExportRefusalCode =
  (typeof LEAD_SHEET_TEXT_EXPORT_REFUSAL_CODES)[number];

export type LeadSheetTextExportRefusal =
  | Readonly<{
      code: "export.text.document_empty";
      path: readonly ["sections"];
    }>
  | Readonly<{
      code: "export.text.section_empty";
      path: DomainPath;
    }>
  | Readonly<{
      code: "export.text.custom_chord_unsupported";
      path: DomainPath;
    }>
  | Readonly<{
      code: "export.text.measure_completion_unsupported";
      path: DomainPath;
      completion: "pickup" | "incomplete";
    }>
  | Readonly<{
      code: "export.text_format_failed";
      path: readonly [];
      diagnostics: readonly [SymbolDiagnostic, ...SymbolDiagnostic[]];
    }>
  | Readonly<{
      code: "export.text_round_trip_parse_failed";
      path: readonly [];
      diagnostics: readonly [ChartDiagnostic, ...ChartDiagnostic[]];
    }>
  | Readonly<{
      code: "export.text_round_trip_projection_mismatch";
      path: readonly [];
    }>
  | Readonly<{
      code: "export.text_bytes_exceeded";
      path: readonly [];
      received: number;
      maximum: typeof MAX_LEAD_SHEET_TEXT_EXPORT_BYTES;
    }>
  | Readonly<{
      code: "export.text_loss_items_exceeded";
      path: readonly [];
      received: number;
      maximum: typeof MAX_LEAD_SHEET_TEXT_LOSS_ITEMS;
    }>;

export type LeadSheetTextExportResult =
  | Readonly<{ ok: true; value: LeadSheetTextArtifact }>
  | Readonly<{ ok: false; refusal: LeadSheetTextExportRefusal }>;

export type PrepareLeadSheetTextExportRequest = Readonly<{
  document: ValidatedDocument;
  accidentalStyle: AccidentalStyle;
  /** Application supplies only presence; analysis payload never enters export. */
  contextualAnalysis: "none" | "present";
}>;

export interface LeadSheetTextExportDependencies {
  readonly formatChordSymbol: FormatChordSymbol;
  readonly parseChartText: ParseChartText;
  readonly supportedDocumentProjectionEquals: (
    expected: ValidatedDocument,
    reparsed: import("../theory").ChartTextDraft,
  ) => boolean;
  readonly sanitizeExportFilename: SanitizeExportFilename;
}

/** Dependency-taking coordinator used only by the export composition root. */
export type PrepareLeadSheetTextExportCoordinator = (
  request: PrepareLeadSheetTextExportRequest,
  dependencies: LeadSheetTextExportDependencies,
) => LeadSheetTextExportResult;

/** Public request-only operation after trusted T0/projection ports are bound. */
export type PrepareLeadSheetTextExport = (
  request: PrepareLeadSheetTextExportRequest,
) => LeadSheetTextExportResult;

export type ExportArtifact = CanonicalJsonArtifact | LeadSheetTextArtifact;

export const EXPORT_DELIVERY_CHANNELS = Object.freeze([
  "file-system-access",
  "object-url-download",
] as const);
export type ExportDeliveryChannel = (typeof EXPORT_DELIVERY_CHANNELS)[number];

export const EXPORT_DELIVERY_TERMINATIONS = Object.freeze([
  "completed",
  "handed-off",
  "cancelled",
  "failed",
  "cleanup-failed",
] as const);
export type ExportDeliveryTermination =
  (typeof EXPORT_DELIVERY_TERMINATIONS)[number];

export type ExportDeliveryRequest = Readonly<{
  artifact: ExportArtifact;
  preference: "prefer-file-system-access" | "download-only";
}>;

export type ExportDeliveryArtifactBinding =
  | Readonly<{
      kind: "canonical-json";
      sourceDocumentId: DocumentId;
      filename: string;
      byteLength: number;
      semanticDocumentHash: SemanticDocumentHash;
    }>
  | Readonly<{
      kind: "lead-sheet-text";
      sourceDocumentId: DocumentId;
      filename: string;
      byteLength: number;
      semanticDocumentHash: null;
    }>;

/**
 * Composition-private, text-free payload prepared before browser activation.
 * The byte array is the sole payload authority and transfers to the adapter.
 */
export type PreparedExportDeliveryRequest = Readonly<{
  binding: ExportDeliveryArtifactBinding;
  privateBytes: Uint8Array;
  preference: ExportDeliveryRequest["preference"];
}>;

export type ExportDeliveryCleanupComplete =
  | Readonly<{
      cleanup: "complete";
      objectUrlsCreated: 0;
      objectUrlsRevoked: 0;
      outstandingOwnedResources: 0;
    }>
  | Readonly<{
      cleanup: "complete";
      objectUrlsCreated: 1;
      objectUrlsRevoked: 1;
      outstandingOwnedResources: 0;
    }>;

export type ExportDeliveryCleanupFailureKind =
  | "writer-close"
  | "writer-abort"
  | "handle-release"
  | "anchor-remove"
  | "object-url-revoke";

export const EXPORT_DELIVERY_CLEANUP_FAILURE_ORDER = Object.freeze([
  "writer-close",
  "writer-abort",
  "handle-release",
  "anchor-remove",
  "object-url-revoke",
] as const satisfies readonly ExportDeliveryCleanupFailureKind[]);

export type FileSystemAccessCleanupFailure =
  | Readonly<{
      channel: "file-system-access";
      cleanupFailureKinds: readonly ["writer-abort"];
      objectUrlsCreated: 0;
      objectUrlsRevoked: 0;
      outstandingOwnedResources: 1;
    }>
  | Readonly<{
      channel: "file-system-access";
      cleanupFailureKinds: readonly ["handle-release"];
      objectUrlsCreated: 0;
      objectUrlsRevoked: 0;
      outstandingOwnedResources: 1;
    }>
  | Readonly<{
      channel: "file-system-access";
      cleanupFailureKinds: readonly ["writer-abort", "handle-release"];
      objectUrlsCreated: 0;
      objectUrlsRevoked: 0;
      outstandingOwnedResources: 2;
    }>
  | Readonly<{
      channel: "file-system-access";
      cleanupFailureKinds: readonly ["writer-close", "writer-abort"];
      objectUrlsCreated: 0;
      objectUrlsRevoked: 0;
      outstandingOwnedResources: 1;
    }>
  | Readonly<{
      channel: "file-system-access";
      cleanupFailureKinds: readonly [
        "writer-close",
        "writer-abort",
        "handle-release",
      ];
      objectUrlsCreated: 0;
      objectUrlsRevoked: 0;
      outstandingOwnedResources: 2;
    }>;

export type ObjectUrlCleanupFailure =
  | Readonly<{
      channel: "object-url-download";
      cleanupFailureKinds: readonly ["anchor-remove"];
      objectUrlsCreated: 1;
      objectUrlsRevoked: 1;
      outstandingOwnedResources: 1;
    }>
  | Readonly<{
      channel: "object-url-download";
      cleanupFailureKinds: readonly ["object-url-revoke"];
      objectUrlsCreated: 1;
      objectUrlsRevoked: 0;
      outstandingOwnedResources: 1;
    }>
  | Readonly<{
      channel: "object-url-download";
      cleanupFailureKinds: readonly ["anchor-remove", "object-url-revoke"];
      objectUrlsCreated: 1;
      objectUrlsRevoked: 0;
      outstandingOwnedResources: 2;
    }>;

export type ExportDeliveryCleanupFailures =
  FileSystemAccessCleanupFailure | ObjectUrlCleanupFailure;

export type ExportDeliveryCleanFailure = Readonly<{
  ok: false;
  outcome: "failed";
  code:
    | "export.delivery_user_gesture_required"
    | "export.delivery_capability_failed"
    | "export.delivery_write_failed"
    | "export.delivery_activation_failed";
}> &
  (
    | (Readonly<{ channel: null }> &
        Extract<ExportDeliveryCleanupComplete, { objectUrlsCreated: 0 }>)
    | (Readonly<{ channel: "file-system-access" }> &
        Extract<ExportDeliveryCleanupComplete, { objectUrlsCreated: 0 }>)
    | (Readonly<{ channel: "object-url-download" }> &
        ExportDeliveryCleanupComplete)
  );

export type ExportDeliveryResult =
  | (Readonly<{
      artifact: ExportDeliveryArtifactBinding;
    }> &
      (
        | Readonly<{
            ok: true;
            outcome: "completed";
            channel: "file-system-access";
            bytesOffered: number;
            cleanup: "complete";
            objectUrlsCreated: 0;
            objectUrlsRevoked: 0;
            outstandingOwnedResources: 0;
          }>
        | Readonly<{
            ok: true;
            /** Browser activation is observable; final disk persistence is not. */
            outcome: "handed-off";
            channel: "object-url-download";
            bytesOffered: number;
            cleanup: "complete";
            objectUrlsCreated: 1;
            objectUrlsRevoked: 1;
            outstandingOwnedResources: 0;
          }>
        | Readonly<{
            ok: true;
            outcome: "cancelled";
            channel: "file-system-access";
            cleanup: "complete";
            objectUrlsCreated: 0;
            objectUrlsRevoked: 0;
            outstandingOwnedResources: 0;
          }>
        | ExportDeliveryCleanFailure
      ))
  | (Readonly<{
      ok: false;
      outcome: "cleanup-failed";
      code: "export.delivery_cleanup_failed";
      artifact: null;
      cleanup: "reconciliation-required";
    }> &
      ExportDeliveryCleanupFailures);

export type DeliverExportArtifact = (
  request: ExportDeliveryRequest,
) => Promise<ExportDeliveryResult>;

/**
 * Raw composition boundary used by activation-safe application orchestration.
 * It must probe activation and invoke the picker or anchor before its first
 * await or queued microtask. Application validates the unknown completion.
 */
export type PreparedExportDeliveryStart = Readonly<{
  completion: Promise<unknown>;
}>;

export type StartPreparedExportDelivery = (
  request: PreparedExportDeliveryRequest,
) => unknown;

export type CanonicalExportMarkerCandidate = Readonly<{
  artifactKind: "canonical-json";
  sourceDocumentId: DocumentId;
  revision: number;
  exportedAt: string;
  semanticDocumentHash: SemanticDocumentHash;
  byteLength: number;
  filename: string;
  canonicalPolicyVersion: typeof CANONICAL_JSON_POLICY_VERSION;
  semanticHashPolicyVersion: typeof SEMANTIC_DOCUMENT_HASH_POLICY_VERSION;
}>;

export const INTERCHANGE_EXPORT_WORK_COUNTER_NAMES = Object.freeze([
  "documentNodesVisited",
  "propertiesProjected",
  "stringsEncoded",
  "utf8BytesEmitted",
  "hashBytesVisited",
  "roundTripJsonParseCalls",
  "roundTripShapeDecodeCalls",
  "roundTripSemanticValidationCalls",
  "semanticEqualityChecks",
  "chordFormatterCalls",
  "roundTripChartParseCalls",
  "chartProjectionEqualityChecks",
  "lossItemsEmitted",
  "deliveryAttempts",
  "objectUrlsCreated",
  "objectUrlsRevoked",
] as const);

export type InterchangeExportWorkCounters = Readonly<{
  documentNodesVisited: number;
  propertiesProjected: number;
  stringsEncoded: number;
  utf8BytesEmitted: number;
  hashBytesVisited: number;
  roundTripJsonParseCalls: number;
  roundTripShapeDecodeCalls: number;
  roundTripSemanticValidationCalls: number;
  semanticEqualityChecks: number;
  chordFormatterCalls: number;
  roundTripChartParseCalls: number;
  chartProjectionEqualityChecks: number;
  lossItemsEmitted: number;
  deliveryAttempts: number;
  objectUrlsCreated: number;
  objectUrlsRevoked: number;
}>;

export const MAX_E0_EXPORT_DOCUMENT_NODES_VISITED = MAX_DOMAIN_COPY_GRAPH_NODES;
export const MAX_E0_EXPORT_MEASURES_VISITED =
  MAX_DOCUMENT_SECTIONS * MAX_SECTION_MEASURES;
export const MAX_E0_EXPORT_EVENTS_VISITED = MAX_DOCUMENT_CHORD_EVENTS;
export const MAX_E0_EXPORT_BYTES_EMITTED =
  Math.max(MAX_CANONICAL_JSON_EXPORT_BYTES, MAX_LEAD_SHEET_TEXT_EXPORT_BYTES) +
  1;

export const INTERCHANGE_EXPORT_APPLICABILITY = Object.freeze({
  prepareCanonicalJsonExport: Object.freeze({
    cancellation: "not-applicable:bounded-projection-plus-one-hash",
    staleRevision: "not-applicable:validated-value-operation",
    resume: "not-applicable:non-resumable",
    wallTimeCutoff: "forbidden:counts-only",
  }),
  prepareLeadSheetTextExport: Object.freeze({
    cancellation: "not-applicable:synchronous-bounded",
    staleRevision: "not-applicable:validated-value-operation",
    resume: "not-applicable:non-resumable",
    wallTimeCutoff: "forbidden:counts-only",
  }),
  deliverExportArtifact: Object.freeze({
    cancellation: "applicable:file-picker-only",
    staleRevision: "application-marker-settlement-required",
    resume: "not-applicable:one-delivery-attempt",
    wallTimeCutoff: "forbidden:adapter-terminal-outcome",
  }),
} as const);

export interface InterchangeExportOperations {
  readonly prepareCanonicalJsonExport: PrepareCanonicalJsonExport;
  readonly prepareLeadSheetTextExport: PrepareLeadSheetTextExport;
  readonly sanitizeExportFilename: SanitizeExportFilename;
  readonly deliverExportArtifact: DeliverExportArtifact;
}

/** Trusted codec, validation, equality, and hash ports are installed once. */
export type E0ExportCompositionDependencies = Readonly<{
  canonicalJson: CanonicalJsonExportDependencies;
  leadSheetText: LeadSheetTextExportDependencies;
}>;

export type CreateE0ExportOperations = (
  dependencies: E0ExportCompositionDependencies,
) => InterchangeExportOperations;
