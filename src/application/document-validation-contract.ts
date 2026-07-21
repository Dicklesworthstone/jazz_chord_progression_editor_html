import {
  MAX_DOCUMENT_CHORD_EVENTS,
  MAX_DOCUMENT_SECTIONS,
  MAX_DOMAIN_COPY_GRAPH_NODES,
  MAX_SECTION_MEASURES,
  type F3SemanticIssueCode,
  type ProgressionDocumentShapeV2,
  type ValidatedDocument,
  type ValidationIssue,
} from "../domain";

/** Versioned public contract for the F3 semantic publication gate. */
export const DOCUMENT_VALIDATION_CONTRACT_SCHEMA =
  "changes.application.document-validation-contract.v1";
export const DOCUMENT_SEMANTICS_POLICY_ID = "changes.document-semantics";
export const DOCUMENT_SEMANTICS_POLICY_VERSION = 1;
export const DOCUMENT_SOURCE_AST_POLICY_ID =
  "changes.document-source-ast-equivalence";
export const DOCUMENT_SOURCE_AST_POLICY_VERSION = 1;
/** Canonical formatting is irrelevant here; a fixed style keeps reparsing total. */
export const DOCUMENT_SOURCE_PARSE_ACCIDENTAL_STYLE = "ascii" as const;
export const DOCUMENT_STORED_PITCH_POLICY_ID =
  "changes.document-stored-pitch-correspondence";
export const DOCUMENT_STORED_PITCH_POLICY_VERSION = 1;
export const DOCUMENT_MEASURE_POLICY_ID = "changes.document-measure-semantics";
export const DOCUMENT_MEASURE_POLICY_VERSION = 1;

export const DOCUMENT_VALIDATION_OPERATION_NAMES = Object.freeze([
  "validateDocumentSemantics",
] as const);

export type DocumentValidationOperationName =
  (typeof DOCUMENT_VALIDATION_OPERATION_NAMES)[number];

/**
 * F3 owns no new issue vocabulary. These are the ten F1-reviewed semantic
 * publication codes, retained in their reviewed declaration order.
 */
export const DOCUMENT_SEMANTIC_ISSUE_CODES = Object.freeze([
  "chord.source_semantic_mismatch",
  "custom.pitch_voicing_mismatch",
  "measure.empty_has_events",
  "measure.nonempty_has_no_events",
  "measure.complete_duration_mismatch",
  "measure.duration_over_capacity",
  "measure.expected_duration_not_short",
  "measure.expected_duration_not_positive",
  "measure.expected_duration_mismatch",
  "measure.reason_blank",
] as const satisfies readonly F3SemanticIssueCode[]);

export const DOCUMENT_EVENT_SEMANTIC_CHECK_ORDER = Object.freeze([
  "source-ast",
  "resolution",
  "stored-or-auto-voicing",
] as const);

export const DOCUMENT_MEASURE_SEMANTIC_CHECK_ORDER = Object.freeze([
  "event-cardinality",
  "completion",
  "capacity-crossing",
  "expected-duration",
  "reason",
] as const);

/** Final diagnostics are sorted independently of discovery order. */
export const DOCUMENT_SEMANTIC_DIAGNOSTIC_ORDER = Object.freeze([
  "path",
  "code",
] as const);

export const DOCUMENT_SOURCE_AST_FIELDS = Object.freeze([
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
] as const);

/**
 * Exact written pitch classes are compared as sets. Octave/register, source
 * order, and legal doublings are intentionally not chord-identity facts.
 */
export const DOCUMENT_STORED_PITCH_COMPARISON =
  "exact-written-pitch-class-set" as const;

/**
 * For an included slash bass, every exact-spelled lowest bass unison is
 * excluded before comparing the chord-body set. External bass is already
 * absent from the stored pitch list by F2.
 */
export const DOCUMENT_SLASH_BASS_PROJECTION =
  "exclude-exact-spelled-lowest-included-bass-unisons" as const;

/**
 * F3 proves only the family-independent necessary Auto condition available at
 * Foundation time. V0 later owns quality/family template availability and must
 * return a typed unavailable result for a missing row.
 */
export const DOCUMENT_AUTO_RANGE_POLICY =
  "inclusive-midi-cardinality-at-least-voice-count" as const;

export const MAX_F3_SECTIONS_VISITED = MAX_DOCUMENT_SECTIONS;
export const MAX_F3_MEASURES_VISITED =
  MAX_DOCUMENT_SECTIONS * MAX_SECTION_MEASURES;
export const MAX_F3_EVENTS_VISITED = MAX_DOCUMENT_CHORD_EVENTS;
export const MAX_F3_SYMBOL_PARSE_CALLS = MAX_DOCUMENT_CHORD_EVENTS;
export const MAX_F3_RESOLUTION_CALLS = MAX_DOCUMENT_CHORD_EVENTS;
export const MAX_F3_VOICING_CHECKS = MAX_DOCUMENT_CHORD_EVENTS;
export const MAX_F3_EXACT_BEAT_ADDITIONS = MAX_DOCUMENT_CHORD_EVENTS * 2;
export const MAX_F3_PUBLICATION_NODE_VISITS = MAX_DOMAIN_COPY_GRAPH_NODES;

/** At most source, resolution, and voicing findings for one event. */
export const MAX_F3_ISSUES_PER_EVENT = 3;

/**
 * A partial measure can independently violate no-events, capacity,
 * expected-duration, and reason laws.
 */
export const MAX_F3_ISSUES_PER_MEASURE = 4;

export const MAX_F3_SEMANTIC_ISSUES =
  MAX_F3_EVENTS_VISITED * MAX_F3_ISSUES_PER_EVENT +
  MAX_F3_MEASURES_VISITED * MAX_F3_ISSUES_PER_MEASURE;

/**
 * Upper bound for the returned graph, complete issue list, and one bounded
 * per-event observation table retained by the private evidence seam.
 */
export const MAX_F3_TRACKED_RECORDS =
  MAX_F3_PUBLICATION_NODE_VISITS +
  MAX_F3_SEMANTIC_ISSUES +
  MAX_F3_EVENTS_VISITED;

export const DOCUMENT_VALIDATION_TERMINATIONS = Object.freeze([
  "complete-success",
  "complete-refusal",
] as const);

export type DocumentValidationTermination =
  (typeof DOCUMENT_VALIDATION_TERMINATIONS)[number];

export const DOCUMENT_VALIDATION_APPLICABILITY = Object.freeze({
  cancellation: "not-applicable:synchronous-bounded",
  staleRevision: "not-applicable:revision-free-value-operation",
  resume: "not-applicable:non-resumable",
  wallTimeCutoff: "forbidden:counts-only",
} as const);

/** F3 diagnostics never echo chart text or expose repair suggestions. */
export type DocumentSemanticIssue<
  Code extends F3SemanticIssueCode = F3SemanticIssueCode,
> = Readonly<Pick<ValidationIssue<Code>, "code" | "path" | "message">>;

export type DocumentSemanticValidationResult =
  | Readonly<{
      ok: true;
      value: ValidatedDocument;
      warnings: readonly [];
    }>
  | Readonly<{
      ok: false;
      errors: readonly [
        DocumentSemanticIssue,
        ...DocumentSemanticIssue[],
      ];
    }>;

export type ValidateDocumentSemantics = (
  candidate: ProgressionDocumentShapeV2,
) => DocumentSemanticValidationResult;

export interface DocumentValidationOperations {
  readonly validateDocumentSemantics: ValidateDocumentSemantics;
}

export const DOCUMENT_VALIDATION_WORK_COUNTER_NAMES = Object.freeze([
  "sectionsVisited",
  "measuresVisited",
  "eventsVisited",
  "symbolParseCalls",
  "resolutionCalls",
  "voicingChecks",
  "exactBeatAdditions",
  "publicationNodeVisits",
  "issuesEmitted",
] as const);

export type DocumentValidationWorkCounters = Readonly<{
  sectionsVisited: number;
  measuresVisited: number;
  eventsVisited: number;
  symbolParseCalls: number;
  resolutionCalls: number;
  voicingChecks: number;
  exactBeatAdditions: number;
  publicationNodeVisits: number;
  issuesEmitted: number;
}>;

/** Package-private build/verification evidence shape; not a second operation. */
export type DocumentValidationEvidence = Readonly<{
  contractSchema: typeof DOCUMENT_VALIDATION_CONTRACT_SCHEMA;
  policyId: typeof DOCUMENT_SEMANTICS_POLICY_ID;
  policyVersion: typeof DOCUMENT_SEMANTICS_POLICY_VERSION;
  termination: DocumentValidationTermination;
  counters: DocumentValidationWorkCounters;
}>;
