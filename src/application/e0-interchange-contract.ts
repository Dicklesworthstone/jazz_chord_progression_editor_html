import {
  LEGACY_CHORD_FIELDS,
  LEGACY_DOCUMENT_FIELDS,
  LEGACY_SECTION_FIELDS,
  type LegacyMigrationDependencies,
  type LegacyMigrationRefusal,
  type LegacyReportCode,
  type MigrateLegacyJson,
} from "../compatibility";
import {
  MAX_DOCUMENT_CHORD_EVENTS,
  MAX_DOCUMENT_SECTIONS,
  MAX_SECTION_MEASURES,
  MAX_UTF8_IMPORT_BYTES,
  type DocumentId,
  type DocumentShapeDecodeResult,
  type DocumentShapeIssueCode,
  type DomainPath,
  type F3SemanticIssueCode,
  type PreflightDocumentImportBytes,
  type ProgressionDocumentShapeV2,
  type StableIdKind,
  type StableIdFactory,
  type ValidatedDocument,
} from "../domain";
import {
  CANONICAL_JSON_KEY_ORDER,
  type CanonicalJsonExportRefusal,
  type CanonicalExportMarkerCandidate,
  type ExportDeliveryArtifactBinding,
  type ExportDeliveryRequest,
  type ExportDeliveryResult,
  type PrepareCanonicalJsonExport,
  type SemanticDocumentHash,
  type StartPreparedExportDelivery,
} from "../export";
import type {
  AccidentalStyle,
  ChartDiagnostic,
  ChartTextDraft,
  ChartWarning,
  ParseChartText,
  SourceRange,
} from "../theory";
import {
  MAX_DRAFT_ISSUES,
  type AppState,
  type AppRevision,
  type ApplicationTransitionResult,
  type ApplicationRequestId,
  type ApplicationReplacementOrigin,
  type CommandId,
  type DocumentTransitionState,
  type ReplacementRetirementReceipt,
  type TransportGeneration,
} from "./application-state-contract";
import type { ValidateDocumentSemantics } from "./document-validation-contract";

/** Versioned E0 orchestration contract owned by application. */
export const E0_INTERCHANGE_CONTRACT_SCHEMA =
  "changes.application.e0-interchange-contract.v1";
export const IMPORT_PREVIEW_SCHEMA = "changes.import-preview.v1";
export const INTERCHANGE_IMPORT_DRAFT_SCHEMA =
  "changes.interchange-import-draft.v1";
export const IMPORT_ROUTING_POLICY_ID = "changes.import-routing";
export const IMPORT_ROUTING_POLICY_VERSION = 1;
export const IMPORT_PREVIEW_POLICY_ID = "changes.import-preview";
export const IMPORT_PREVIEW_POLICY_VERSION = 1;
export const IMPORT_TRANSACTION_POLICY_ID = "changes.import-transaction";
export const IMPORT_TRANSACTION_POLICY_VERSION = 1;
export const EXPORT_MARKER_SETTLEMENT_POLICY_ID =
  "changes.export-marker-settlement";
export const EXPORT_MARKER_SETTLEMENT_POLICY_VERSION = 1;

export const E0_INTERCHANGE_OPERATION_NAMES = Object.freeze([
  "readImportSource",
  "prepareImportPreview",
  "commitImportReplacement",
  "prepareCanonicalExportDelivery",
  "completeCanonicalExportMarkerSettlement",
] as const);

export type E0InterchangeOperationName =
  (typeof E0_INTERCHANGE_OPERATION_NAMES)[number];

export const IMPORT_SOURCE_CHANNELS = Object.freeze(["file", "paste"] as const);
export type ImportSourceChannel = (typeof IMPORT_SOURCE_CHANNELS)[number];

export const IMPORT_FORMAT_HINTS = Object.freeze([
  "auto",
  "canonical-json",
  "legacy-json",
  "chart-text",
] as const);
export type ImportFormatHint = (typeof IMPORT_FORMAT_HINTS)[number];

export const IMPORT_SOURCE_FORMATS = Object.freeze([
  "canonical-json-v2",
  "unversioned-legacy-json",
  "chart-text-v1",
] as const);
export type ImportSourceFormat = (typeof IMPORT_SOURCE_FORMATS)[number];

export const IMPORT_TRANSPORT_WORKFLOW_ACTIONS = Object.freeze([
  "preview",
  "apply",
  "cancel",
  "failure",
] as const);
export type ImportTransportWorkflowAction =
  (typeof IMPORT_TRANSPORT_WORKFLOW_ACTIONS)[number];

export const IMPORT_STAGE_ORDER = Object.freeze([
  "byte-observation",
  "byte-preflight",
  "utf8-decode",
  "format-classification",
  "json-lexical-preflight",
  "schema-route",
  "json-parse-or-legacy-migration",
  "chart-parse",
  "chart-candidate-construction",
  "structural-decode",
  "semantic-validation",
  "preview-publication",
] as const);
export type ImportStage = (typeof IMPORT_STAGE_ORDER)[number];

export const IMPORT_ROUTING_POLICY = Object.freeze({
  autoJsonFirstCodePoints: Object.freeze(["{", "["] as const),
  jsonNeverFallsBackToChartText: true,
  currentSchema: "changes.progression.v2",
  futureSchemaPattern: "^changes\\.progression\\.v(?:[3-9]|[1-9][0-9]+)$",
  unversionedLegacyRequiresOwnSectionsArray: true,
  futureOrUnknownSchemaNeverRoutesToLegacy: true,
  filenameExtensionIsAdvisoryOnly: true,
  mediaTypeIsAdvisoryOnly: true,
  explicitFormatHintIsRouteAssertion: true,
  schemaEvidenceMayVetoExplicitHint: true,
} as const);

export const CHART_IMPORT_DEFAULTS = Object.freeze({
  title: "Imported lead sheet",
  description: "",
  tempoBpm: 120,
  key: null,
  playback: Object.freeze({
    instrumentId: "mellow-keys",
    masterVolume: 0.8,
    reverbAmount: 0.2,
    countInBars: 0,
  }),
  sectionNamePrefix: "Section ",
  sectionKeyOverride: null,
  sectionVoiceLeadingBoundary: "reset",
  eventAnnotation: "",
  autoVoicing: Object.freeze({
    mode: "auto",
    family: "balanced",
    voiceCount: 4,
    range: Object.freeze({ lowMidi: 48, highMidi: 84 }),
    bassPolicy: "generated",
  }),
} as const);

/**
 * T0 requires an accidental-style argument even though the style changes only
 * canonical presentation. E0 always imports with this fixed style so callers
 * cannot introduce an undeclared routing or candidate difference.
 */
export const CHART_IMPORT_PARSE_ACCIDENTAL_STYLE =
  "ascii" satisfies AccidentalStyle;

export type ParseChartTextForImport = (
  sourceText: string,
  request: Readonly<{ mode: "document" }>,
  accidentalStyle: typeof CHART_IMPORT_PARSE_ACCIDENTAL_STYLE,
) => ReturnType<ParseChartText>;

export const CHART_IMPORT_ID_ALLOCATION_ORDER = Object.freeze([
  "document",
  "for-each-section:section",
  "for-each-measure-in-section:measure",
  "for-each-event-in-measure:event",
] as const);

export const IMPORT_REPLACEMENT_ORIGIN_BY_FORMAT = Object.freeze({
  "canonical-json-v2": "canonical-import",
  "unversioned-legacy-json": "legacy-import",
  /** A T0 draft becomes a canonical v2 candidate before replacement. */
  "chart-text-v1": "canonical-import",
} as const satisfies Readonly<
  Record<ImportSourceFormat, ApplicationReplacementOrigin>
>);

export const MAX_E0_IMPORT_UTF8_BYTES = MAX_UTF8_IMPORT_BYTES;
export const MAX_E0_IMPORT_BYTES_OBSERVED = MAX_E0_IMPORT_UTF8_BYTES + 1;
export const MAX_E0_PREVIEW_ISSUES = MAX_DRAFT_ISSUES;
export const MAX_E0_PREVIEW_REPORT_ITEMS = 256;
export const MAX_E0_IMPORT_SECTIONS = MAX_DOCUMENT_SECTIONS;
export const MAX_E0_IMPORT_MEASURES =
  MAX_DOCUMENT_SECTIONS * MAX_SECTION_MEASURES;
export const MAX_E0_IMPORT_EVENTS = MAX_DOCUMENT_CHORD_EVENTS;

export type ImportSourceReadAdapterResult =
  | Readonly<{ ok: true; bytes: Uint8Array; observedByteLength: number }>
  | Readonly<{
      ok: false;
      outcome: "cancelled" | "failed";
      code: "import.read_cancelled" | "import.read_failed";
    }>;

/**
 * Untrusted bounded source capability. Its return is unknown until E0 checks
 * the complete envelope, observed length, cap, and copied bytes.
 */
export type ImportSourceHandle = Readonly<{
  channel: ImportSourceChannel;
  displayName: string | null;
  mediaType: string | null;
  declaredByteLength: number | null;
  readAtMost: (
    maximumBytesPlusOne: number,
    signal: AbortSignal,
  ) => Promise<unknown>;
}>;

export type ImportRequestIdentity = Readonly<{
  requestId: ApplicationRequestId;
  documentId: DocumentId;
  baseRevision: AppRevision;
}>;

export type ReadImportSourceRequest = Readonly<{
  identity: ImportRequestIdentity;
  source: ImportSourceHandle;
}>;

export type ImportPayload = Readonly<{
  identity: ImportRequestIdentity;
  channel: ImportSourceChannel;
  displayName: string | null;
  mediaType: string | null;
  observedByteLength: number;
  bytes: Uint8Array;
}>;

export type ReadImportSourceResult =
  | Readonly<{ ok: true; value: ImportPayload }>
  | Readonly<{
      ok: false;
      outcome: "cancelled" | "failed";
      code: "import.read_cancelled" | "import.read_failed";
      identity: ImportRequestIdentity;
    }>;

export type ReadImportSource = (
  request: ReadImportSourceRequest,
  signal: AbortSignal,
) => Promise<ReadImportSourceResult>;

export const IMPORT_ISSUE_CODES = Object.freeze([
  "limit.import_bytes_exceeded",
  "import.utf8_invalid",
  "import.format_mismatch",
  "import.json_duplicate_key",
  "import.json_syntax_invalid",
  "import.json_shape_unrecognized",
  "import.schema_missing",
  "import.schema_unsupported",
  "import.future_schema_unsupported",
  "import.canonical_structural_invalid",
  "import.canonical_semantic_invalid",
  "import.legacy_refused",
  "import.legacy_no_events",
  "import.chart_invalid",
  "import.chart_fragment_forbidden",
  "limit.chart_import_id_requests_exceeded",
  "import.chart_id_factory_failed",
  "import.chart_id_collision",
  "import.preview_issue_limit",
  "import.replacement_impact_unavailable",
] as const);
export type ImportIssueCode = (typeof IMPORT_ISSUE_CODES)[number];

type CanonicalJsonPathField =
  (typeof CANONICAL_JSON_KEY_ORDER)[keyof typeof CANONICAL_JSON_KEY_ORDER][number];
type LegacyPathField =
  | (typeof LEGACY_DOCUMENT_FIELDS)[number]
  | (typeof LEGACY_SECTION_FIELDS)[number]
  | (typeof LEGACY_CHORD_FIELDS)[number];

export type ImportPublicPathField = CanonicalJsonPathField | LegacyPathField;

/**
 * Closed, deduplicated field vocabulary permitted in retained import
 * diagnostics. Unknown source keys are never copied into public state.
 */
export const IMPORT_PUBLIC_PATH_FIELDS: readonly ImportPublicPathField[] =
  Object.freeze([
    ...new Set<ImportPublicPathField>([
      ...Object.values(CANONICAL_JSON_KEY_ORDER).flat(),
      ...LEGACY_DOCUMENT_FIELDS,
      ...LEGACY_SECTION_FIELDS,
      ...LEGACY_CHORD_FIELDS,
    ]),
  ]);

export const IMPORT_PUBLIC_PATH_SENTINELS = Object.freeze([
  "<redacted-field>",
  "<invalid-index>",
  "<path-truncated>",
] as const);
export type ImportPublicPathSentinel =
  (typeof IMPORT_PUBLIC_PATH_SENTINELS)[number];

export const MAX_IMPORT_PUBLIC_PATH_SEGMENTS = 32;
export const MAX_IMPORT_PUBLIC_PATH_INDEX = 65_536;

/**
 * Sanitized E0-owned projection of an upstream DomainPath. Runtime projection
 * accepts only reviewed fields and safe indices in [0, 65_536], substitutes
 * the fixed redaction sentinels, and caps the retained path at 32 segments.
 */
export type ImportPublicPath = readonly (
  ImportPublicPathField | ImportPublicPathSentinel | number
)[];

export type ImportIssue = Readonly<{
  code:
    | ImportIssueCode
    | DocumentShapeIssueCode
    | F3SemanticIssueCode
    | LegacyMigrationRefusal["code"]
    | LegacyReportCode
    | ChartDiagnostic["code"]
    | ChartWarning["code"];
  stage: ImportStage;
  path: ImportPublicPath;
  range: SourceRange | null;
}>;

export type ImportIssueSummary = Readonly<{
  total: number;
  retained: readonly ImportIssue[];
  omitted: number;
  retentionPolicy: "stage-path-code-first-64";
}>;

export type ImportPreviewSummary = Readonly<{
  sections: number;
  measures: number;
  chordEvents: number;
  emptyMeasures: number;
  manualVoicings: number;
  frozenVoicings: number;
  customChords: number;
  migrationWarnings: number;
  migrationRejectedSections: number;
  migrationRejectedEvents: number;
}>;

export type ImportPreviewReportItem = Readonly<{
  code: LegacyReportCode;
  sourcePath: ImportPublicPath;
  targetPath: ImportPublicPath | null;
}>;

export type ImportPreviewReport = Readonly<{
  totalItems: number;
  retainedItems: readonly ImportPreviewReportItem[];
  omittedItems: number;
  retentionPolicy: "group-source-path-code-target-path-first-256";
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

export type ImportReplacementImpactContext = Readonly<{
  /** Immutable A0 snapshot at the request's base revision. */
  state: AppState;
  command: ImportReplacementCommandSeed;
}>;

export type AssessImportReplacementImpact = (
  context: ImportReplacementImpactContext,
  candidate: ValidatedDocument,
) =>
  | Readonly<{ ok: true; value: ImportReplacementImpact }>
  | Readonly<{
      ok: false;
      code: "import.replacement_impact_unavailable";
    }>;

type ImportPreviewBase = Readonly<{
  schema: typeof IMPORT_PREVIEW_SCHEMA;
  policyId: typeof IMPORT_PREVIEW_POLICY_ID;
  policyVersion: typeof IMPORT_PREVIEW_POLICY_VERSION;
  identity: ImportRequestIdentity;
  sourceFormat: ImportSourceFormat;
  replacementOrigin: Extract<
    ApplicationReplacementOrigin,
    "canonical-import" | "legacy-import"
  >;
  candidate: ValidatedDocument;
  summary: ImportPreviewSummary;
  issues: ImportIssueSummary;
  report: ImportPreviewReport;
  replacementCommandSeed: ImportReplacementCommandSeed;
  rawSourceRetained: false;
  autoApplyAuthorized: false;
}>;

export type RetainedImportPreview = ImportPreviewBase &
  Readonly<{
    replacementImpact: RetainedImportReplacementImpact;
    nonUndoableConfirmationRequirement: null;
  }>;

export type ExplicitlyUnavailableImportPreview = ImportPreviewBase &
  Readonly<{
    replacementImpact: ExplicitlyUnavailableImportReplacementImpact;
    nonUndoableConfirmationRequirement: ImportNonUndoableConfirmationRequirement;
  }>;

export type ImportPreview =
  RetainedImportPreview | ExplicitlyUnavailableImportPreview;

export type ImportPreviewRefusal = Readonly<{
  code: ImportIssueCode;
  stage: ImportStage;
  path: ImportPublicPath;
  range: SourceRange | null;
  issues: ImportIssueSummary;
  legacyRefusal: LegacyMigrationRefusalProjection | null;
}>;

type LegacyBasicRefusalCode =
  | "legacy.utf8_invalid"
  | "legacy.json_syntax_invalid"
  | "legacy.root_invalid"
  | "legacy.sections_invalid";

type LegacyLimitRefusalCode = Extract<
  LegacyMigrationRefusal["code"],
  `limit.${string}`
>;

/** Public C0 refusal projection; collision values and raw source stay private. */
export type LegacyMigrationRefusalProjection =
  | Readonly<{
      code: LegacyBasicRefusalCode;
      path: ImportPublicPath;
      detail: null;
    }>
  | Readonly<{
      code: LegacyLimitRefusalCode;
      path: ImportPublicPath;
      detail: Readonly<{
        kind: "limit";
        received: number;
        maximum: number;
      }>;
    }>
  | Readonly<{
      code: "legacy.id_factory_failed";
      path: ImportPublicPath;
      detail: Readonly<{
        kind: "id-factory";
        idKind: StableIdKind;
        factoryCode: "id.entropy_unavailable" | "id.factory_exhausted";
      }>;
    }>
  | Readonly<{
      code: "legacy.id_collision";
      path: ImportPublicPath;
      detail: Readonly<{
        kind: "id-collision";
        idKind: StableIdKind;
        firstSourcePath: ImportPublicPath;
      }>;
    }>;

type InterchangeImportDraftBase = Readonly<{
  schema: typeof INTERCHANGE_IMPORT_DRAFT_SCHEMA;
  id: string;
  identity: ImportRequestIdentity;
  channel: ImportSourceChannel;
  formatHint: ImportFormatHint;
  rawSourceRetained: false;
}>;

/**
 * E0/build replaces A0's loose import draft with this exclusive state union.
 * Only the ready branch may carry a candidate, and only through its preview.
 */
export type InterchangeImportDraft = InterchangeImportDraftBase &
  (
    | Readonly<{
        status: "reading";
        sourceFormat: null;
        preview: null;
        refusal: null;
      }>
    | Readonly<{
        status: "invalid";
        sourceFormat: ImportSourceFormat | null;
        preview: null;
        refusal: ImportPreviewRefusal;
      }>
    | Readonly<{
        status: "ready";
        sourceFormat: ImportSourceFormat;
        preview: ImportPreview;
        refusal: null;
      }>
    | Readonly<{
        status: "cancelled";
        sourceFormat: ImportSourceFormat | null;
        preview: null;
        refusal: null;
      }>
  );

export type PrepareImportPreviewRequest = Readonly<{
  payload: ImportPayload;
  formatHint: ImportFormatHint;
  replacementImpactContext: ImportReplacementImpactContext;
  nonUndoableConfirmationSeed: ImportNonUndoableConfirmationSeed;
}>;

export const JSON_LEXICAL_ROUTES = Object.freeze([
  "canonical-v2",
  "future-canonical",
  "unsupported-schema",
  "unversioned-legacy",
  "unversioned-unrecognized",
  "host-parse-to-diagnose-malformed",
] as const);
export type JsonLexicalRoute = (typeof JSON_LEXICAL_ROUTES)[number];

export type ClassifyJsonLexicallyResult =
  | Readonly<{
      ok: true;
      route: JsonLexicalRoute;
      schema: string | null;
      rootOwnSectionsArrayObserved: boolean;
    }>
  | Readonly<{
      ok: false;
      code: "import.json_duplicate_key";
      range: SourceRange;
    }>;

/** One bounded, string/escape-aware pass; it does not materialize JSON. */
export type ClassifyJsonLexically = (
  sourceText: string,
) => ClassifyJsonLexicallyResult;

export type ParseJsonDataResult =
  | Readonly<{ ok: true; value: unknown }>
  | Readonly<{
      ok: false;
      code: "import.json_syntax_invalid";
      range: SourceRange | null;
    }>;

/** Exactly one source argument; implementations may not install a reviver. */
export type ParseJsonData = (sourceText: string) => ParseJsonDataResult;

export type DecodeUtf8FatalResult =
  | Readonly<{ ok: true; value: string }>
  | Readonly<{ ok: false; code: "import.utf8_invalid" }>;
export type DecodeUtf8Fatal = (bytes: Uint8Array) => DecodeUtf8FatalResult;

export type BuildChartDocumentCandidate = (
  draft: ChartTextDraft,
  idFactory: StableIdFactory,
) =>
  | Readonly<{ ok: true; value: ProgressionDocumentShapeV2 }>
  | Readonly<{
      ok: false;
      code: "limit.chart_import_id_requests_exceeded";
      path: DomainPath;
      received: 73_794;
      maximum: typeof MAX_E0_CHART_IMPORT_ID_REQUESTS;
    }>
  | Readonly<{
      ok: false;
      code: "import.chart_id_factory_failed" | "import.chart_id_collision";
      path: DomainPath;
    }>;

export interface PrepareImportPreviewDependencies {
  readonly preflightDocumentImportBytes: PreflightDocumentImportBytes;
  readonly decodeUtf8Fatal: DecodeUtf8Fatal;
  readonly classifyJsonLexically: ClassifyJsonLexically;
  readonly parseJsonData: ParseJsonData;
  readonly decodeDocumentShape: (input: unknown) => DocumentShapeDecodeResult;
  readonly validateDocumentSemantics: ValidateDocumentSemantics;
  readonly migrateLegacyJson: MigrateLegacyJson;
  readonly legacyMigrationDependencies: LegacyMigrationDependencies;
  readonly parseChartText: ParseChartTextForImport;
  readonly buildChartDocumentCandidate: BuildChartDocumentCandidate;
  readonly assessImportReplacementImpact: AssessImportReplacementImpact;
  readonly chartIdFactory: StableIdFactory;
}

export type PrepareImportPreviewResult =
  | Readonly<{ ok: true; value: ImportPreview }>
  | Readonly<{ ok: false; refusal: ImportPreviewRefusal }>;

/** Dependency-taking coordinator used only by the application composition root. */
export type PrepareImportPreviewCoordinator = (
  request: PrepareImportPreviewRequest,
  dependencies: PrepareImportPreviewDependencies,
) => PrepareImportPreviewResult;

/** Public request-only operation after dependencies have been bound once. */
export type PrepareImportPreview = (
  request: PrepareImportPreviewRequest,
) => PrepareImportPreviewResult;

export type ImportReplacementHandoff = Readonly<{
  prepared: PreparedImportReplacementPublication;
  retirement: ReplacementRetirementReceipt;
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
 * Structural echo of one single-use A0 preparation. Authority remains in A0's
 * private registry under the exact import request identity; a caller-created
 * lookalike cannot publish through the composition-bound private port.
 */
export type PreparedImportReplacementPublication = Readonly<{
  schema: typeof PREPARED_IMPORT_REPLACEMENT_PUBLICATION_SCHEMA;
  identity: ImportRequestIdentity;
  sourceFormat: ImportSourceFormat;
  candidateDocumentId: DocumentId;
  expectedTransportGeneration: TransportGeneration;
  committingTransition: CommittingDocumentTransition;
}>;

export const X1_REPLACEMENT_RETIREMENT_EVIDENCE_SCHEMA =
  "changes.x1-replacement-retirement-evidence.v1";

export type X1ReplacementRetirementObservation = Readonly<{
  requestId: ApplicationRequestId;
  retiredTransportGeneration: TransportGeneration;
  progressionRetired: boolean;
  previewRetired: boolean;
  noFutureAttack: boolean;
}>;

/**
 * Structurally inspectable evidence returned by the production-bound X1 port.
 * Authority comes from the injected serialized adapter call and exact request
 * echo, not from an erased TypeScript brand.
 */
export type X1ReplacementRetirementEvidence = Readonly<{
  schema: typeof X1_REPLACEMENT_RETIREMENT_EVIDENCE_SCHEMA;
  authority: "x1-serialized-transport";
  request: RetireImportReplacementRequest;
  receipt: X1ReplacementRetirementObservation;
}>;

export type RetireImportReplacementRequest = Readonly<{
  identity: ImportRequestIdentity;
  sourceFormat: ImportSourceFormat;
  candidateDocumentId: DocumentId;
  expectedTransportGeneration: TransportGeneration;
  scope: "progression-and-preview";
  requiredPostcondition: "zero-future-attack";
}>;

export type RetireImportReplacementResult =
  | Readonly<{
      ok: true;
      value: X1ReplacementRetirementEvidence;
    }>
  | Readonly<{
      ok: false;
      code:
        | "transport.replacement_retirement_unavailable"
        | "transport.replacement_retirement_failed"
        | "transport.replacement_retirement_stale";
      retirementEffect: "none";
    }>;

/**
 * Consumer-side port for X1. E0 defines the binding but supplies no fallback or
 * implementation while the serialized transport package is unavailable.
 */
export type RetireImportReplacement = (
  request: RetireImportReplacementRequest,
) => Promise<unknown>;

export interface X1ReplacementRetirementAdapter {
  readonly retireImportReplacement: RetireImportReplacement;
}

type CommitImportReplacementRequestBase = Readonly<{
  currentState: AppState;
}>;

export type CommitImportReplacementRequest =
  | (CommitImportReplacementRequestBase &
      Readonly<{
        preview: RetainedImportPreview;
        currentTransition: RetiringTransportDocumentTransition &
          Readonly<{ undoDisposition: "retained" }>;
        nonUndoableConfirmation: null;
      }>)
  | (CommitImportReplacementRequestBase &
      Readonly<{
        preview: ExplicitlyUnavailableImportPreview;
        currentTransition: RetiringTransportDocumentTransition &
          Readonly<{ undoDisposition: "explicitly-unavailable" }>;
        nonUndoableConfirmation: ImportNonUndoableConfirmationAcknowledgement;
      }>);

export type PrepareImportReplacementPublicationResult =
  | Readonly<{
      ok: true;
      value: PreparedImportReplacementPublication;
    }>
  | Readonly<{
      ok: false;
      code:
        | "import.confirmation_stale"
        | "import.confirmation_wrong_document"
        | "import.replacement_impact_unavailable"
        | "import.confirmation_impact_mismatch"
        | "import.confirmation_identity_mismatch"
        | "history.nonundoable_confirmation_required";
    }>;

/** A0 performs every fallible candidate/history/bookmark check here. */
export type PrepareImportReplacementPublication = (
  request: CommitImportReplacementRequest,
) => unknown;

export type PublishImportReplacementResult = Extract<
  ApplicationTransitionResult,
  { ok: true }
> &
  Readonly<{ outcome: "committed" }>;

/**
 * A0-owned, synchronous, no-normal-refusal publication port. E0/build must back
 * this with a private prepared-replacement primitive; raw replace-document
 * commands may not be accepted through the general public command runner.
 */
export type PublishImportReplacement = (
  handoff: ImportReplacementHandoff,
) => unknown;

export type DiscardImportReplacementPublicationRequest = Readonly<{
  identity: ImportRequestIdentity;
  reason:
    | "preparation-protocol-invalid"
    | "retirement-refused"
    | "retirement-protocol-invalid"
    | "publication-protocol-invalid";
}>;

export type DiscardImportReplacementPublicationResult = Readonly<{
  outcome: "invalidated-by-request";
  identity: ImportRequestIdentity;
  liveForRequest: 0;
}>;

/**
 * Trusted total synchronous cleanup for a prepared capability that will not be
 * published. A0 invalidates the exact live registry entry before returning;
 * E0/build must prove this primitive cannot throw and is idempotent by request.
 */
export type DiscardImportReplacementPublication = (
  request: DiscardImportReplacementPublicationRequest,
) => DiscardImportReplacementPublicationResult;

export type CommitImportReplacementDependencies = Readonly<{
  /** Runs every fallible A0 check and allocates one private single-use capability. */
  prepareImportReplacementPublication: PrepareImportReplacementPublication;
  /** Production composition binds this port to the serialized X1 service. */
  retireImportReplacement: RetireImportReplacement;
  /** Runs on every post-prepare path that does not consume publication. */
  discardImportReplacementPublication: DiscardImportReplacementPublication;
  /** Invoked synchronously after valid X1 evidence, with no remaining refusal. */
  publishImportReplacement: PublishImportReplacement;
}>;

type ImportReplacementPreRetirementRefusalCode = Extract<
  PrepareImportReplacementPublicationResult,
  { ok: false }
>["code"];

type ImportReplacementRetirementRefusalCode = Extract<
  RetireImportReplacementResult,
  { ok: false }
>["code"];

export type E0AdapterProtocolDiagnostic = Readonly<{
  boundary:
    | "A0-replacement-preparation"
    | "X1-replacement-retirement"
    | "A0-replacement-publication"
    | "A0-marker-publication"
    | "A1-marker-persistence"
    | "canonical-export-preparation"
    | "export-delivery"
    | "A0-state-identity"
    | "application-clock";
  reason: "invalid-envelope-or-binding" | "threw-or-rejected";
  rawResultRetained: false;
}>;

export type CommitImportReplacementResult =
  | Readonly<{
      ok: true;
      outcome: "committed";
      retirementEvidence: X1ReplacementRetirementEvidence;
      publication: PublishImportReplacementResult;
      preparationDisposition: "consumed";
      commitCount: 1;
      migrationReexecutionAuthorized: false;
      parseReexecutionAuthorized: false;
    }>
  | Readonly<{
      ok: false;
      refusal: Readonly<{
        code: ImportReplacementPreRetirementRefusalCode;
        path: readonly [];
      }>;
      state: AppState;
      retirementDisposition: "unchanged";
      preparationDisposition: "not-created";
      preparationInvalidation: null;
      publication: null;
    }>
  | Readonly<{
      ok: false;
      refusal: Readonly<{
        code: "import.replacement_preparation_result_invalid";
        path: readonly [];
      }>;
      state: AppState;
      retirementDisposition: "unchanged";
      preparationDisposition: "invalidated-by-request";
      preparationInvalidation: DiscardImportReplacementPublicationResult;
      publication: null;
      protocolDiagnostic: E0AdapterProtocolDiagnostic &
        Readonly<{ boundary: "A0-replacement-preparation" }>;
    }>
  | Readonly<{
      ok: false;
      refusal: Readonly<{
        code: ImportReplacementRetirementRefusalCode;
        path: readonly [];
      }>;
      state: AppState;
      retirementDisposition: "unchanged";
      preparationDisposition: "invalidated-by-request";
      preparationInvalidation: DiscardImportReplacementPublicationResult;
      publication: null;
    }>
  | Readonly<{
      ok: false;
      refusal: Readonly<{
        code: "transport.replacement_retirement_evidence_invalid";
        path: readonly [];
      }>;
      state: AppState;
      retirementDisposition: "reconciliation-required";
      preparationDisposition: "invalidated-by-request";
      preparationInvalidation: DiscardImportReplacementPublicationResult;
      publication: null;
      protocolDiagnostic: E0AdapterProtocolDiagnostic &
        Readonly<{ boundary: "X1-replacement-retirement" }>;
    }>
  | Readonly<{
      ok: false;
      refusal: Readonly<{
        code: "import.replacement_publication_result_invalid";
        path: readonly [];
      }>;
      lastKnownState: AppState;
      retirementDisposition: "retired-reconciliation-required";
      preparationDisposition: "invalidated-by-request";
      preparationInvalidation: DiscardImportReplacementPublicationResult;
      publication: null;
      protocolDiagnostic: E0AdapterProtocolDiagnostic &
        Readonly<{ boundary: "A0-replacement-publication" }>;
    }>;

/** Dependency-taking coordinator used only by the application composition root. */
export type CommitImportReplacementCoordinator = (
  request: CommitImportReplacementRequest,
  dependencies: CommitImportReplacementDependencies,
) => Promise<CommitImportReplacementResult>;

/** Public request-only operation after trusted A0/X1 ports are bound once. */
export type CommitImportReplacement = (
  request: CommitImportReplacementRequest,
) => Promise<CommitImportReplacementResult>;

export type ExportMarkerState = Readonly<{
  documentId: DocumentId;
  revision: AppRevision;
  exportedAt: string;
  semanticDocumentHash: SemanticDocumentHash;
  canonicalPolicyVersion: CanonicalExportMarkerCandidate["canonicalPolicyVersion"];
  semanticHashPolicyVersion: CanonicalExportMarkerCandidate["semanticHashPolicyVersion"];
}> | null;

export const PREPARED_CANONICAL_EXPORT_DELIVERY_SCHEMA =
  "changes.prepared-canonical-export-delivery.v1";
export const CANONICAL_EXPORT_REVISION_PUBLICATION_SCHEMA =
  "changes.canonical-export-revision-publication.v1";
export const CANONICAL_EXPORT_MARKER_PERSISTENCE_HANDOFF_SCHEMA =
  "changes.canonical-export-marker-persistence-handoff.v1";

type CanonicalDeliveryBinding = Extract<
  ExportDeliveryArtifactBinding,
  { kind: "canonical-json" }
>;

declare const canonicalExportPreparationIdBrand: unique symbol;
export type CanonicalExportPreparationId = number & {
  readonly [canonicalExportPreparationIdBrand]: "CanonicalExportPreparationId";
};
export const MIN_CANONICAL_EXPORT_PREPARATION_ID = 1;
export const MAX_CANONICAL_EXPORT_PREPARATION_ID = 9_007_199_254_740_991;

export const PREPARED_CANONICAL_EXPORT_REGISTRY_STATES = Object.freeze([
  "empty",
  "preparing",
  "ready",
  "delivering",
] as const);
export type PreparedCanonicalExportRegistryState =
  (typeof PREPARED_CANONICAL_EXPORT_REGISTRY_STATES)[number];

export type CanonicalExportPreparationIdentity = Readonly<{
  preparationId: CanonicalExportPreparationId;
  /** Exact numeric value of preparationId; one monotonic registry counter. */
  generation: number;
  documentId: DocumentId;
  revision: AppRevision;
}>;

/**
 * E0-private, single-owner registry value. It is prepared before the browser
 * activation task and is never returned to a public caller.
 */
export type PreparedCanonicalExportDelivery = Readonly<{
  schema: typeof PREPARED_CANONICAL_EXPORT_DELIVERY_SCHEMA;
  identity: CanonicalExportPreparationIdentity;
  binding: CanonicalDeliveryBinding;
  privateBytes: Uint8Array;
}>;

export type BeginCanonicalExportPreparationResult =
  | Readonly<{
      ok: true;
      identity: CanonicalExportPreparationIdentity;
      state: "preparing";
    }>
  | Readonly<{
      ok: false;
      code: "export.preparation_busy" | "export.preparation_sequence_exhausted";
      state: "preparing" | "delivering" | "empty";
    }>;

export type PublishPreparedCanonicalExportDeliveryResult =
  | Readonly<{ outcome: "ready"; state: "ready" }>
  | Readonly<{ outcome: "discarded-stale"; state: "empty" }>;

export type TakePreparedCanonicalExportDeliveryResult =
  | Readonly<{
      outcome: "taken";
      value: PreparedCanonicalExportDelivery;
      registryState: "delivering";
    }>
  | Readonly<{
      outcome: "unavailable";
      value: null;
      registryState: PreparedCanonicalExportRegistryState;
    }>
  | Readonly<{
      outcome: "discarded-stale";
      value: null;
      registryState: "empty";
    }>;

export type AbandonCanonicalExportPreparationResult =
  | Readonly<{ outcome: "abandoned"; registryState: "empty" }>
  | Readonly<{
      outcome: "ignored-stale";
      registryState: PreparedCanonicalExportRegistryState;
    }>;

export type FinishPreparedCanonicalExportDeliveryResult =
  | Readonly<{ outcome: "finished"; registryState: "empty" }>
  | Readonly<{
      outcome: "ignored-stale";
      registryState: PreparedCanonicalExportRegistryState;
    }>;

/**
 * One-slot E0-owned registry allocated by createE0InterchangeOperations. A
 * preparing or delivering generation is always single-flight and busy. A new
 * begin may replace only a settled ready generation. Publish, abandonment, and
 * delivery finish are generation guarded. Take consumes before browser
 * invocation; mismatch discards instead of restoring.
 */
export interface PreparedCanonicalExportDeliveryRegistry {
  readonly begin: (
    stateIdentity: Readonly<{ documentId: DocumentId; revision: AppRevision }>,
  ) => BeginCanonicalExportPreparationResult;
  readonly publish: (
    value: PreparedCanonicalExportDelivery,
  ) => PublishPreparedCanonicalExportDeliveryResult;
  readonly take: (
    request: Readonly<{
      preparationId: CanonicalExportPreparationId;
      stateIdentity: Readonly<{
        documentId: DocumentId;
        revision: AppRevision;
      }>;
    }>,
  ) => TakePreparedCanonicalExportDeliveryResult;
  /** Clear only the matching preparing/ready generation; stale IDs are no-ops. */
  readonly abandonPreparation: (
    preparationId: CanonicalExportPreparationId,
  ) => AbandonCanonicalExportPreparationResult;
  /** Clear only the matching delivering generation; stale IDs are no-ops. */
  readonly finishDelivery: (
    preparationId: CanonicalExportPreparationId,
  ) => FinishPreparedCanonicalExportDeliveryResult;
  readonly state: () => PreparedCanonicalExportRegistryState;
}

export type PrepareCanonicalExportDeliveryRequest = Readonly<{
  state: AppState;
}>;

export type CanonicalExportPreparationBinding = Readonly<{
  preparationId: CanonicalExportPreparationId;
  generation: number;
  documentId: DocumentId;
  revision: AppRevision;
  filename: string;
  byteLength: number;
  semanticDocumentHash: SemanticDocumentHash;
  canonicalPolicyVersion: CanonicalExportMarkerCandidate["canonicalPolicyVersion"];
  semanticHashPolicyVersion: CanonicalExportMarkerCandidate["semanticHashPolicyVersion"];
}>;

export type PrepareCanonicalExportDeliveryResult =
  | Readonly<{
      ok: true;
      outcome: "prepared";
      binding: CanonicalExportPreparationBinding;
    }>
  | Readonly<{
      ok: false;
      outcome: "canonical-export-refused";
      refusal: CanonicalJsonExportRefusal;
    }>
  | Readonly<{
      ok: false;
      outcome: "preparation-unavailable";
      code: "export.preparation_busy" | "export.preparation_sequence_exhausted";
    }>
  | Readonly<{
      ok: false;
      outcome: "preparation-stale";
      code: "export.prepared_canonical_stale";
    }>
  | Readonly<{
      ok: false;
      outcome: "preparation-protocol-invalid";
      code: "export.prepared_canonical_artifact_invalid";
      protocolDiagnostic: E0AdapterProtocolDiagnostic &
        Readonly<{ boundary: "canonical-export-preparation" }>;
      configurationDisposition: "release-gate-failed";
    }>
  | Readonly<{
      ok: false;
      outcome: "state-identity-protocol-invalid";
      code: "export.application_state_identity_invalid";
      protocolDiagnostic: E0AdapterProtocolDiagnostic &
        Readonly<{ boundary: "A0-state-identity" }>;
      configurationDisposition: "release-gate-failed";
    }>;

/** Exact A0-owned ephemeral publication requested after marker settlement. */
export type CanonicalExportRevisionPublication = Readonly<{
  schema: typeof CANONICAL_EXPORT_REVISION_PUBLICATION_SCHEMA;
  documentId: DocumentId;
  revision: AppRevision;
}>;

export type PublishCanonicalExportRevisionRequest = Readonly<{
  publication: CanonicalExportRevisionPublication;
}>;

/** Raw A0 result shape validated transiently and never retained publicly. */
export type A0CanonicalExportRevisionPublicationAdapterResult =
  | Readonly<{
      ok: true;
      outcome: "published";
      observedBefore: AppState;
      state: AppState;
    }>
  | Readonly<{
      ok: false;
      outcome: "refused";
      code:
        "export.marker_publication_stale" | "export.marker_publication_failed";
      state: AppState;
    }>;

/** State-free normalized receipt safe to return after later A1 awaits. */
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

/**
 * Raw A0 controller boundary. It atomically reads the latest state, compares
 * its document/revision to the publication, and applies mark-exported without
 * awaiting. Click-time state is never publication authority.
 */
export type PublishCanonicalExportRevision = (
  request: PublishCanonicalExportRevisionRequest,
) => unknown;

/** Complete artifact binding passed to the future A1 persistence owner. */
export type CanonicalExportMarkerPersistenceHandoff = Readonly<{
  schema: typeof CANONICAL_EXPORT_MARKER_PERSISTENCE_HANDOFF_SCHEMA;
  marker: Exclude<ExportMarkerState, null>;
  artifact: Readonly<{
    kind: "canonical-json";
    sourceDocumentId: DocumentId;
    byteLength: number;
    filename: string;
    semanticDocumentHash: SemanticDocumentHash;
    canonicalPolicyVersion: CanonicalExportMarkerCandidate["canonicalPolicyVersion"];
    semanticHashPolicyVersion: CanonicalExportMarkerCandidate["semanticHashPolicyVersion"];
  }>;
}>;

export type QueueCanonicalExportMarkerPersistenceResult =
  | Readonly<{
      ok: true;
      outcome: "persisted";
      durability: "recovery-persisted";
    }>
  | Readonly<{
      ok: false;
      outcome: "unavailable";
      code: "recovery.marker_persistence_unavailable";
      durability: "pending-failed";
    }>
  | Readonly<{
      ok: false;
      outcome: "failed";
      code: "recovery.marker_persistence_failed";
      durability: "pending-failed";
    }>;

export type QueueCanonicalExportMarkerPersistence = (
  handoff: CanonicalExportMarkerPersistenceHandoff,
) => Promise<unknown>;

export interface CanonicalExportMarkerSettlementAdapters {
  readonly publishCanonicalExportRevision: PublishCanonicalExportRevision;
  readonly queueCanonicalExportMarkerPersistence: QueueCanonicalExportMarkerPersistence;
}

type MarkerEligibleDelivery = Extract<
  ExportDeliveryResult,
  { outcome: "completed" | "handed-off" }
>;
export type MarkerEligibleCanonicalExportDelivery = MarkerEligibleDelivery &
  Readonly<{ artifact: CanonicalDeliveryBinding }>;

/** Success-only internal stage; all other delivery outcomes stop publicly. */
export type CanonicalExportMarkerSettlementRequest = Readonly<{
  baseDocumentId: DocumentId;
  baseRevision: AppRevision;
  delivery: MarkerEligibleCanonicalExportDelivery;
  candidate: CanonicalExportMarkerCandidate;
}>;

/** Public click-path request contains locators, never marker authority. */
export type CompleteCanonicalExportMarkerSettlementRequest = Readonly<{
  state: AppState;
  preparationId: CanonicalExportPreparationId;
  deliveryPreference: ExportDeliveryRequest["preference"];
}>;

export type ReadCurrentApplicationDocumentIdentity = () => unknown;
export type ReadCanonicalExportTimestamp = () => unknown;

export type CanonicalExportRevisionPublicationAttempt = Readonly<{
  request: PublishCanonicalExportRevisionRequest;
  protocolDiagnostic: E0AdapterProtocolDiagnostic &
    Readonly<{ boundary: "A0-marker-publication" }>;
}>;

export type CanonicalExportMarkerPersistenceAttempt = Readonly<{
  handoff: CanonicalExportMarkerPersistenceHandoff;
  protocolDiagnostic: E0AdapterProtocolDiagnostic &
    Readonly<{ boundary: "A1-marker-persistence" }>;
}>;

type SuccessfulCanonicalExportRevisionPublicationAttempt = Readonly<{
  request: PublishCanonicalExportRevisionRequest;
  result: Extract<PublishCanonicalExportRevisionResult, { ok: true }>;
}>;

type RefusedCanonicalExportRevisionPublicationAttempt = Readonly<{
  request: PublishCanonicalExportRevisionRequest;
  result: Extract<PublishCanonicalExportRevisionResult, { ok: false }>;
}>;

type AdvancedCanonicalExportMarkerSettlementBase = Readonly<{
  outcome: "advanced";
  delivery: MarkerEligibleCanonicalExportDelivery;
  a0Publication: SuccessfulCanonicalExportRevisionPublicationAttempt;
}>;

export type CanonicalExportMarkerSettlementResult =
  | Readonly<{
      outcome: "unchanged-binding-mismatch";
      code: "export.marker_artifact_mismatch";
      delivery: MarkerEligibleDelivery;
      a0Publication: null;
      a1Persistence: null;
      durability: "unchanged";
    }>
  | Readonly<{
      outcome: "publication-refused";
      delivery: MarkerEligibleCanonicalExportDelivery;
      a0Publication: RefusedCanonicalExportRevisionPublicationAttempt;
      a1Persistence: null;
      durability: "unchanged";
    }>
  | Readonly<{
      outcome: "publication-protocol-invalid";
      code: "export.marker_publication_result_invalid";
      delivery: MarkerEligibleCanonicalExportDelivery;
      a0Publication: CanonicalExportRevisionPublicationAttempt;
      a1Persistence: null;
      applicationReconciliation: "required";
      durability: "unchanged";
    }>
  | (AdvancedCanonicalExportMarkerSettlementBase &
      Readonly<{
        a1Persistence: Readonly<{
          handoff: CanonicalExportMarkerPersistenceHandoff;
          result: Extract<
            QueueCanonicalExportMarkerPersistenceResult,
            { ok: true }
          >;
        }>;
        durability: "recovery-persisted";
      }>)
  | (AdvancedCanonicalExportMarkerSettlementBase &
      Readonly<{
        a1Persistence: Readonly<{
          handoff: CanonicalExportMarkerPersistenceHandoff;
          result: Extract<
            QueueCanonicalExportMarkerPersistenceResult,
            { ok: false }
          >;
        }>;
        durability: "pending-failed";
      }>)
  | Readonly<{
      outcome: "persistence-protocol-invalid";
      code: "recovery.marker_persistence_result_invalid";
      delivery: MarkerEligibleCanonicalExportDelivery;
      a0Publication: SuccessfulCanonicalExportRevisionPublicationAttempt;
      a1Persistence: CanonicalExportMarkerPersistenceAttempt;
      durability: "reconciliation-required";
    }>;

type PreMarkerDeliveryResultBase = Readonly<{
  a0Publication: null;
  a1Persistence: null;
  durability: "unchanged";
}>;

export type CompleteCanonicalExportMarkerSettlementResult =
  | (PreMarkerDeliveryResultBase &
      Readonly<{
        outcome: "prepared-export-unavailable";
        code: "export.prepared_canonical_unavailable";
        delivery: null;
      }>)
  | (PreMarkerDeliveryResultBase &
      Readonly<{
        outcome: "prepared-export-stale";
        code: "export.prepared_canonical_stale";
        delivery: null;
      }>)
  | (PreMarkerDeliveryResultBase &
      Readonly<{
        outcome: "state-identity-protocol-invalid";
        code: "export.application_state_identity_invalid";
        delivery: null;
        protocolDiagnostic: E0AdapterProtocolDiagnostic &
          Readonly<{ boundary: "A0-state-identity" }>;
        configurationDisposition: "release-gate-failed";
      }>)
  | (PreMarkerDeliveryResultBase &
      Readonly<{
        outcome: "unchanged-cancelled";
        delivery: Extract<ExportDeliveryResult, { outcome: "cancelled" }>;
      }>)
  | (PreMarkerDeliveryResultBase &
      Readonly<{
        outcome: "unchanged-failed";
        delivery: Extract<ExportDeliveryResult, { outcome: "failed" }>;
      }>)
  | (PreMarkerDeliveryResultBase &
      Readonly<{
        outcome: "delivery-cleanup-reconciliation-required";
        code: "export.delivery_cleanup_failed";
        delivery: Extract<ExportDeliveryResult, { outcome: "cleanup-failed" }>;
        deliveryResourceReconciliation: "required";
      }>)
  | (PreMarkerDeliveryResultBase &
      Readonly<{
        outcome: "delivery-protocol-invalid";
        code: "export.delivery_result_invalid";
        delivery: null;
        cleanupKnowledge: "unknown";
        maximumPossibleOutstandingOwnedResources: 4;
        deliveryResourceReconciliation: "required";
        protocolDiagnostic: E0AdapterProtocolDiagnostic &
          Readonly<{ boundary: "export-delivery" }>;
      }>)
  | (PreMarkerDeliveryResultBase &
      Readonly<{
        outcome: "unchanged-binding-mismatch";
        code: "export.marker_artifact_mismatch";
        delivery: MarkerEligibleDelivery;
      }>)
  | (PreMarkerDeliveryResultBase &
      Readonly<{
        outcome: "timestamp-protocol-invalid";
        code: "export.marker_timestamp_invalid";
        delivery: MarkerEligibleCanonicalExportDelivery;
        protocolDiagnostic: E0AdapterProtocolDiagnostic &
          Readonly<{ boundary: "application-clock" }>;
        configurationDisposition: "release-gate-failed";
      }>)
  | CanonicalExportMarkerSettlementResult;

export type SettleCanonicalExportMarkerCoordinator = (
  request: CanonicalExportMarkerSettlementRequest,
  adapters: CanonicalExportMarkerSettlementAdapters,
) => Promise<CanonicalExportMarkerSettlementResult>;

/** Consumer ports bound once; the E0 factory itself allocates the registry. */
export type CanonicalExportMarkerOrchestrationDependencies = Readonly<{
  prepareCanonicalJsonExport: PrepareCanonicalJsonExport;
  startPreparedExportDelivery: StartPreparedExportDelivery;
  readCurrentApplicationDocumentIdentity: ReadCurrentApplicationDocumentIdentity;
  readExportTimestamp: ReadCanonicalExportTimestamp;
  settlementAdapters: CanonicalExportMarkerSettlementAdapters;
}>;

export type CanonicalExportMarkerCoordinatorDependencies =
  CanonicalExportMarkerOrchestrationDependencies &
    Readonly<{
      preparedRegistry: PreparedCanonicalExportDeliveryRegistry;
    }>;

export type PrepareCanonicalExportDeliveryCoordinator = (
  request: PrepareCanonicalExportDeliveryRequest,
  dependencies: CanonicalExportMarkerCoordinatorDependencies,
) => Promise<PrepareCanonicalExportDeliveryResult>;

export type PrepareCanonicalExportDelivery = (
  request: PrepareCanonicalExportDeliveryRequest,
) => Promise<PrepareCanonicalExportDeliveryResult>;

/** Click-path coordinator must call delivery synchronously before its first await. */
export type CompleteCanonicalExportMarkerSettlementCoordinator = (
  request: CompleteCanonicalExportMarkerSettlementRequest,
  dependencies: CanonicalExportMarkerCoordinatorDependencies,
) => Promise<CompleteCanonicalExportMarkerSettlementResult>;

export type CompleteCanonicalExportMarkerSettlement = (
  request: CompleteCanonicalExportMarkerSettlementRequest,
) => Promise<CompleteCanonicalExportMarkerSettlementResult>;

export const E0_IMPORT_WORK_COUNTER_NAMES = Object.freeze([
  "bytesObserved",
  "bytesRead",
  "utf8CodeUnitsVisited",
  "jsonLexicalCodeUnitsVisited",
  "duplicateKeysObserved",
  "jsonParseCalls",
  "shapeDecodeCalls",
  "legacyMigrationCalls",
  "chartParseCalls",
  "chartCandidateBuildCalls",
  "semanticValidationCalls",
  "idRequests",
  "sectionsSummarized",
  "measuresSummarized",
  "eventsSummarized",
  "previewIssuesRetained",
  "previewReportItemsRetained",
  "replacementHandoffsCreated",
] as const);

export type E0ImportWorkCounters = Readonly<{
  bytesObserved: number;
  bytesRead: number;
  utf8CodeUnitsVisited: number;
  jsonLexicalCodeUnitsVisited: number;
  duplicateKeysObserved: number;
  jsonParseCalls: number;
  shapeDecodeCalls: number;
  legacyMigrationCalls: number;
  chartParseCalls: number;
  chartCandidateBuildCalls: number;
  semanticValidationCalls: number;
  idRequests: number;
  sectionsSummarized: number;
  measuresSummarized: number;
  eventsSummarized: number;
  previewIssuesRetained: number;
  previewReportItemsRetained: number;
  replacementHandoffsCreated: number;
}>;

export const MAX_E0_CHART_IMPORT_ID_REQUESTS =
  1 +
  MAX_DOCUMENT_SECTIONS +
  MAX_DOCUMENT_SECTIONS * MAX_SECTION_MEASURES +
  MAX_DOCUMENT_CHORD_EVENTS;

export const E0_IMPORT_TERMINATIONS = Object.freeze([
  "preview-ready",
  "complete-refusal",
  "cancelled",
  "ignored-stale",
  "replacement-committed",
] as const);
export type E0ImportTermination = (typeof E0_IMPORT_TERMINATIONS)[number];

export const E0_INTERCHANGE_APPLICABILITY = Object.freeze({
  readImportSource: Object.freeze({
    cancellation: "applicable:abort-signal",
    staleRevision: "application-request-settlement-required",
    resume: "not-applicable:one-bounded-read",
    wallTimeCutoff: "forbidden:byte-bound-and-terminal-callback",
  }),
  prepareImportPreview: Object.freeze({
    cancellation: "not-applicable:synchronous-after-read",
    staleRevision: "caller-must-settle-request-before-preview-publication",
    resume: "not-applicable:non-resumable",
    wallTimeCutoff: "forbidden:counts-only",
  }),
  commitImportReplacement: Object.freeze({
    cancellation: "cancel-never-calls-this-operation",
    staleRevision: "applicable:exact-document-and-revision",
    resume: "not-applicable:serialized-retire-and-publish",
    wallTimeCutoff: "forbidden:state-identity-and-adapter-outcomes-only",
  }),
  prepareCanonicalExportDelivery: Object.freeze({
    cancellation: "not-applicable:single-flight-preparation",
    staleRevision: "invalidates-before-browser-delivery",
    resume: "not-applicable:one-private-prepared-entry",
    wallTimeCutoff: "forbidden:bytes-and-adapter-outcomes-only",
  }),
  completeCanonicalExportMarkerSettlement: Object.freeze({
    cancellation: "consumes-preparation-and-preserves-export-revision",
    staleRevision: "applicable:exact-document-and-revision",
    resume: "not-applicable:ordered-publication-and-persistence",
    wallTimeCutoff: "forbidden:delivery-and-adapter-outcomes-only",
  }),
} as const);

export interface E0InterchangeOperations {
  readonly readImportSource: ReadImportSource;
  readonly prepareImportPreview: PrepareImportPreview;
  readonly commitImportReplacement: CommitImportReplacement;
  readonly prepareCanonicalExportDelivery: PrepareCanonicalExportDelivery;
  readonly completeCanonicalExportMarkerSettlement: CompleteCanonicalExportMarkerSettlement;
}

/** Trusted adapters are installed once; UI/runtime callers receive no ports. */
export type E0InterchangeCompositionDependencies = Readonly<{
  prepareImportPreview: PrepareImportPreviewDependencies;
  commitImportReplacement: CommitImportReplacementDependencies;
  canonicalExportMarkerSettlement: CanonicalExportMarkerOrchestrationDependencies;
}>;

export type CreateE0InterchangeOperations = (
  dependencies: E0InterchangeCompositionDependencies,
) => E0InterchangeOperations;
