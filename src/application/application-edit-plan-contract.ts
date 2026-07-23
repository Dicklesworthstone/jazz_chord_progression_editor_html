import {
  MAX_DOCUMENT_CHORD_EVENTS,
  MAX_DOCUMENT_SECTIONS,
  MAX_SECTION_MEASURES,
  MAX_TIMELINE_QUARTER_NOTE_BEATS,
  type AnyStableId,
  type BeatDuration,
  type ChordEventId,
  type DocumentId,
  type DomainPath,
  type KeyContext,
  type MeasureCompletion,
  type MeasureId,
  type Meter,
  type SectionId,
  type SectionVoiceLeadingBoundary,
} from "../domain";
import type {
  ChartTextErrorCode,
  ChartWarning,
  ParseChartText,
  SourceRange,
} from "../theory";
import {
  MAX_SELECTED_EVENT_IDS,
  type AppState,
  type ApplicationCommandDependencies,
  type ApplicationTransitionResult,
  type DocumentCommand,
  type HistoryEntry,
  type HistoryState,
} from "./application-state-contract";

/** Proposed A0/U1 specification surface; no production runner consumes it yet. */
export const A0_U1_ATOMIC_EDIT_PLAN_CONTRACT_SCHEMA =
  "changes.application.atomic-edit-plan-contract.v1";
export const A0_U1_ATOMIC_EDIT_PLAN_POLICY_ID =
  "changes.application-atomic-edit-plan";
export const A0_U1_ATOMIC_EDIT_PLAN_POLICY_VERSION = 1;
export const A0_U1_ATOMIC_EDIT_PLAN_RECEIPT_SCHEMA =
  "changes.application.atomic-edit-plan-receipt.v1";
export const A0_U1_ATOMIC_EDIT_IMPLEMENTATION_STATUS =
  "specified-unimplemented";

/** Proposed additive command surface; the live A0 tuple is deliberately unchanged. */
export const A0_U1_PROPOSED_APPLICATION_COMMAND_KINDS: readonly [
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
] = Object.freeze([
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
]);

export type ProposedApplicationCommandKind =
  (typeof A0_U1_PROPOSED_APPLICATION_COMMAND_KINDS)[number];

export const A0_U1_ATOMIC_EDIT_PLAN_KINDS: readonly [
  "insert-fragment",
  "split-event-duration",
  "join-event-durations",
  "split-section",
  "join-sections",
] = Object.freeze([
  "insert-fragment",
  "split-event-duration",
  "join-event-durations",
  "split-section",
  "join-sections",
]);

export type AtomicEditPlanKind = (typeof A0_U1_ATOMIC_EDIT_PLAN_KINDS)[number];

export const A0_U1_INSERT_FRAGMENT_PLACEMENT_KINDS: readonly [
  "into-measure",
  "into-section",
  "into-document",
] = Object.freeze(["into-measure", "into-section", "into-document"]);

export type InsertFragmentPlacementKind =
  (typeof A0_U1_INSERT_FRAGMENT_PLACEMENT_KINDS)[number];

/**
 * This value is intentionally repeated rather than imported from E0. A static
 * bridge proof may compare the two contracts, but E0 v1 is not A0's runtime
 * authority.
 */
export const A0_U1_NEW_EVENT_AUTO_VOICING: Readonly<{
  mode: "auto";
  family: "balanced";
  voiceCount: 4;
  range: Readonly<{ lowMidi: 48; highMidi: 84 }>;
  bassPolicy: "generated";
}> = Object.freeze({
  mode: "auto",
  family: "balanced",
  voiceCount: 4,
  range: Object.freeze({ lowMidi: 48, highMidi: 84 }),
  bassPolicy: "generated",
});

export const A0_U1_NEW_EVENT_POLICY_ID = "a0-u1-balanced-4-48-84-generated@1";
export const A0_U1_FRAGMENT_PARSE_ACCIDENTAL_STYLE = "ascii";
export const A0_U1_RECOVERED_CHORD_LAYOUT_LOSS_ACKNOWLEDGEMENT =
  "source-bar-and-section-layout-will-be-lost@1";

export const MAX_A0_U1_FRAGMENT_SOURCE_CODE_POINTS = 4_096;
export const MAX_A0_U1_FRAGMENT_SOURCE_UTF8_BYTES =
  4 * MAX_A0_U1_FRAGMENT_SOURCE_CODE_POINTS;
export const MAX_A0_U1_FRAGMENT_SECTIONS = MAX_DOCUMENT_SECTIONS;
export const MAX_A0_U1_FRAGMENT_MEASURES_PER_SECTION = MAX_SECTION_MEASURES;
export const MAX_A0_U1_FRAGMENT_MEASURES =
  MAX_DOCUMENT_SECTIONS * MAX_SECTION_MEASURES;
export const MAX_A0_U1_FRAGMENT_EVENTS = MAX_DOCUMENT_CHORD_EVENTS;
export const MAX_A0_U1_COMPLETION_DECLARATIONS = 1;
export const MAX_A0_U1_SECTION_DECLARATIONS = MAX_DOCUMENT_SECTIONS;
export const MAX_A0_U1_RETAINED_DIAGNOSTICS = 64;
export const MAX_A0_U1_RETAINED_WARNING_ACKNOWLEDGEMENTS = 64;
export const MAX_A0_U1_QUICK_ENTRY_ISSUE_CODES = 64;
export const MAX_A0_U1_QUICK_ENTRY_SNAPSHOT_FIELDS_COMPARED = 6;
export const MAX_A0_U1_INSERTABLE_CHORDS_EXAMINED = MAX_DOCUMENT_CHORD_EVENTS;
export const MAX_A0_U1_RECOVERY_FIELDS_COMPARED = 4;
export const MAX_A0_U1_ID_ALLOCATION_ATTEMPTS =
  MAX_DOCUMENT_SECTIONS +
  MAX_DOCUMENT_SECTIONS * MAX_SECTION_MEASURES +
  MAX_DOCUMENT_CHORD_EVENTS;
export const MAX_A0_U1_OCCUPIED_ID_RECORDS =
  1 + MAX_A0_U1_ID_ALLOCATION_ATTEMPTS;
export const MAX_A0_U1_PLAN_NODE_RECORDS = 1 + MAX_A0_U1_ID_ALLOCATION_ATTEMPTS;
export const MAX_A0_U1_BOOKMARK_RECORDS_EXAMINED = MAX_SELECTED_EVENT_IDS + 4;
export const MAX_A0_U1_EXACT_BEAT_ADDITIONS = MAX_DOCUMENT_CHORD_EVENTS;
export const MAX_A0_U1_EXACT_BEAT_COMPARISONS = MAX_DOCUMENT_CHORD_EVENTS;
export const MAX_A0_U1_METADATA_FIELDS_COMPARED = 12;

export const A0_U1_ATOMIC_EDIT_LIMITS = Object.freeze({
  fragmentSourceCodePoints: MAX_A0_U1_FRAGMENT_SOURCE_CODE_POINTS,
  fragmentSourceUtf8Bytes: MAX_A0_U1_FRAGMENT_SOURCE_UTF8_BYTES,
  fragmentSections: MAX_A0_U1_FRAGMENT_SECTIONS,
  fragmentMeasuresPerSection: MAX_A0_U1_FRAGMENT_MEASURES_PER_SECTION,
  fragmentMeasures: MAX_A0_U1_FRAGMENT_MEASURES,
  fragmentEvents: MAX_A0_U1_FRAGMENT_EVENTS,
  finalTimelineQuarterNoteBeats: MAX_TIMELINE_QUARTER_NOTE_BEATS,
  completionDeclarations: MAX_A0_U1_COMPLETION_DECLARATIONS,
  sectionDeclarations: MAX_A0_U1_SECTION_DECLARATIONS,
  retainedDiagnostics: MAX_A0_U1_RETAINED_DIAGNOSTICS,
  retainedWarningAcknowledgements: MAX_A0_U1_RETAINED_WARNING_ACKNOWLEDGEMENTS,
  quickEntryIssueCodes: MAX_A0_U1_QUICK_ENTRY_ISSUE_CODES,
  quickEntrySnapshotFieldsCompared:
    MAX_A0_U1_QUICK_ENTRY_SNAPSHOT_FIELDS_COMPARED,
  insertableChordsExamined: MAX_A0_U1_INSERTABLE_CHORDS_EXAMINED,
  recoveryFieldsCompared: MAX_A0_U1_RECOVERY_FIELDS_COMPARED,
  idAllocationAttempts: MAX_A0_U1_ID_ALLOCATION_ATTEMPTS,
  occupiedIdRecords: MAX_A0_U1_OCCUPIED_ID_RECORDS,
  planNodeRecords: MAX_A0_U1_PLAN_NODE_RECORDS,
  bookmarkRecordsExamined: MAX_A0_U1_BOOKMARK_RECORDS_EXAMINED,
  exactBeatAdditions: MAX_A0_U1_EXACT_BEAT_ADDITIONS,
  exactBeatComparisons: MAX_A0_U1_EXACT_BEAT_COMPARISONS,
  metadataFieldsCompared: MAX_A0_U1_METADATA_FIELDS_COMPARED,
});

export type AtomicEditPlanSectionMetadata = Readonly<{
  name: string;
  annotation: string;
  keyOverride: KeyContext | null;
  voiceLeadingBoundary: SectionVoiceLeadingBoundary;
}>;

export type AtomicEditPlanCompletionDeclaration = Readonly<{
  measureId: MeasureId;
  completion: MeasureCompletion;
}>;

/** Only warning code and source range are stable acknowledgement authority. */
export type AtomicEditPlanWarningAcknowledgement = Readonly<
  Pick<ChartWarning, "code" | "range">
>;

export type AtomicEditPlanSectionDeclaration = Readonly<{
  sourceSectionOrdinal: number;
  voiceLeadingBoundary: SectionVoiceLeadingBoundary;
}>;

/**
 * Exact optimistic guard over every QuickEntry field plus the intended lane.
 * The stable target must also equal the placement's canonical target.
 */
export type AtomicEditPlanQuickEntrySnapshot<
  Status extends "ready" | "invalid",
  Lane extends "complete-draft" | "recovered-chord",
> = Readonly<{
  sourceText: string;
  baseRevision: number;
  target: AtomicEditPlanBoundary;
  issueCodes: readonly string[];
  expectedStatus: Status;
  expectedLane: Lane;
}>;

export type CompleteDraftIntoMeasurePlacement = Readonly<{
  kind: "into-measure";
  measureId: MeasureId;
  beforeEventId: ChordEventId | null;
  layoutDisposition: "flatten-one-implicit-measure";
  completionDeclarations: readonly [AtomicEditPlanCompletionDeclaration];
}>;

export type InsertFragmentIntoSectionPlacement = Readonly<{
  kind: "into-section";
  sectionId: SectionId;
  beforeMeasureId: MeasureId | null;
  layoutDisposition: "preserve-implicit-measures";
  completionDeclarations: readonly [];
}>;

export type InsertFragmentIntoDocumentPlacement = Readonly<{
  kind: "into-document";
  beforeSectionId: SectionId | null;
  layoutDisposition: "preserve-named-sections";
  sectionDeclarations: readonly [
    AtomicEditPlanSectionDeclaration,
    ...AtomicEditPlanSectionDeclaration[],
  ];
  completionDeclarations: readonly [];
}>;

export type CompleteDraftInsertFragmentPlacement =
  | CompleteDraftIntoMeasurePlacement
  | InsertFragmentIntoSectionPlacement
  | InsertFragmentIntoDocumentPlacement;

export type RecoveredChordIntoMeasurePlacement = Readonly<{
  kind: "into-measure";
  measureId: MeasureId;
  beforeEventId: ChordEventId | null;
  layoutDisposition: "insert-one-recovered-chord";
  completionDeclarations: readonly [AtomicEditPlanCompletionDeclaration];
}>;

export type CompleteDraftInsertSource = Readonly<{
  kind: "complete-draft";
  quickEntrySnapshot: AtomicEditPlanQuickEntrySnapshot<
    "ready",
    "complete-draft"
  >;
  warningAcknowledgements: readonly AtomicEditPlanWarningAcknowledgement[];
}>;

export type RecoveredChordInsertSource = Readonly<{
  kind: "recovered-chord";
  quickEntrySnapshot: AtomicEditPlanQuickEntrySnapshot<
    "invalid",
    "recovered-chord"
  >;
  selectedGlobalOrdinal: number;
  layoutLossAcknowledgement: typeof A0_U1_RECOVERED_CHORD_LAYOUT_LOSS_ACKNOWLEDGEMENT;
  callerDuration: BeatDuration | null;
}>;

export type CompleteDraftInsertFragmentEditPlan = Readonly<{
  kind: "insert-fragment";
  source: CompleteDraftInsertSource;
  placement: CompleteDraftInsertFragmentPlacement;
  voicingPolicy: typeof A0_U1_NEW_EVENT_POLICY_ID;
}>;

export type RecoveredChordInsertFragmentEditPlan = Readonly<{
  kind: "insert-fragment";
  source: RecoveredChordInsertSource;
  placement: RecoveredChordIntoMeasurePlacement;
  voicingPolicy: typeof A0_U1_NEW_EVENT_POLICY_ID;
}>;

/** One top-level kind with two correlated, exact source/placement lanes. */
export type InsertFragmentEditPlan =
  CompleteDraftInsertFragmentEditPlan | RecoveredChordInsertFragmentEditPlan;

export type SplitEventDurationEditPlan = Readonly<{
  kind: "split-event-duration";
  eventId: ChordEventId;
  firstDuration: BeatDuration;
  secondDuration: BeatDuration;
  completionDeclarations: readonly [AtomicEditPlanCompletionDeclaration];
  identityPolicy: "retain-source-first-allocate-second";
  contentPolicy: "copy-exact-chord-and-voicing";
  annotationPolicy: "retain-source-first-clear-second";
}>;

export type JoinEventDurationsEditPlan = Readonly<{
  kind: "join-event-durations";
  leftEventId: ChordEventId;
  rightEventId: ChordEventId;
  joinedDuration: BeatDuration;
  completionDeclarations: readonly [AtomicEditPlanCompletionDeclaration];
  identityPolicy: "retain-left-remove-right";
  contentPolicy: "require-exact-chord-and-voicing";
  annotationPolicy: "require-right-empty-retain-left";
}>;

export type SplitSectionEditPlan = Readonly<{
  kind: "split-section";
  sectionId: SectionId;
  beforeMeasureId: MeasureId;
  newSectionMetadata: AtomicEditPlanSectionMetadata;
  completionDeclarations: readonly [];
  identityPolicy: "retain-source-prefix-allocate-suffix";
  measurePolicy: "move-suffix-preserve-identities";
}>;

export type JoinSectionsEditPlan = Readonly<{
  kind: "join-sections";
  leftSectionId: SectionId;
  rightSectionId: SectionId;
  expectedLeftMetadata: AtomicEditPlanSectionMetadata;
  expectedRightMetadata: AtomicEditPlanSectionMetadata;
  resultMetadata: AtomicEditPlanSectionMetadata;
  completionDeclarations: readonly [];
  identityPolicy: "retain-left-remove-right";
  measurePolicy: "left-then-right-preserve-identities";
  metadataPolicy: "compare-both-then-apply-explicit-result";
  internalBoundaryPolicy: "remove-right-entry-boundary-confirmed";
}>;

/** Exactly five operation-specific variants; nesting or arbitrary batches do not exist. */
export type AtomicEditPlan =
  | InsertFragmentEditPlan
  | SplitEventDurationEditPlan
  | JoinEventDurationsEditPlan
  | SplitSectionEditPlan
  | JoinSectionsEditPlan;

/**
 * Proposed sixteenth A0 command. It is intentionally separate from the live
 * DocumentCommand union until the dependent implementation leaf is claimed.
 */
export type ApplyEditPlanCommand = Readonly<{
  id: string;
  label: string;
  expectedDocumentId: DocumentId;
  expectedRevision: number;
  logicalTimeMs: number;
  coalescing: null;
  kind: "apply-edit-plan";
  plan: AtomicEditPlan;
}>;

/** Additive type proposal only; the live DocumentCommand union is unchanged. */
export type ProposedDocumentCommand = DocumentCommand | ApplyEditPlanCommand;

/** Proposed history row; live A0 cannot name this command kind yet. */
export type AtomicEditPlanHistoryEntry = Readonly<
  Omit<HistoryEntry, "commandKind"> & {
    commandKind: "apply-edit-plan";
  }
>;

export type ProposedAtomicEditPlanHistoryEntry =
  HistoryEntry | AtomicEditPlanHistoryEntry;

export type AtomicEditPlanHistoryState = Readonly<
  Omit<HistoryState, "undo" | "redo"> & {
    undo: readonly ProposedAtomicEditPlanHistoryEntry[];
    redo: readonly ProposedAtomicEditPlanHistoryEntry[];
  }
>;

/** Future merged state shape; existing AppState values remain assignable to it. */
export type AtomicEditPlanAppState = Readonly<
  Omit<AppState, "history"> & {
    history: AtomicEditPlanHistoryState;
  }
>;

/** Production composition must bind the real public T0 parser to this shape. */
export type ParseAtomicEditPlanFragment = (
  sourceText: string,
  request: Readonly<{ mode: "fragment"; meter: Meter }>,
  accidentalStyle: typeof A0_U1_FRAGMENT_PARSE_ACCIDENTAL_STYLE,
) => ReturnType<ParseChartText>;

export type AtomicEditPlanParserDependency = Readonly<{
  parseChartText: ParseAtomicEditPlanFragment;
}>;

export const A0_U1_ATOMIC_EDIT_PLAN_RUNNER_STAGE_ORDER: readonly [
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
] = Object.freeze([
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

export type AtomicEditPlanRunnerStage =
  (typeof A0_U1_ATOMIC_EDIT_PLAN_RUNNER_STAGE_ORDER)[number];

export const A0_U1_ATOMIC_EDIT_PLAN_ID_ALLOCATION_ORDER: readonly [
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
] = Object.freeze([
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

export const A0_U1_ATOMIC_EDIT_PLAN_DIAGNOSTIC_ORDER: readonly [
  "path-ecmascript-code-unit-lexical",
  "null-source-range-before-ranged",
  "source-range-start-ascending",
  "source-range-end-ascending",
  "code-ecmascript-code-unit-lexical",
] = Object.freeze([
  "path-ecmascript-code-unit-lexical",
  "null-source-range-before-ranged",
  "source-range-start-ascending",
  "source-range-end-ascending",
  "code-ecmascript-code-unit-lexical",
]);

export const A0_U1_ATOMIC_EDIT_REFUSAL_CODES: readonly [
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
] = Object.freeze([
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

export type AtomicEditPlanRefusalCode =
  (typeof A0_U1_ATOMIC_EDIT_REFUSAL_CODES)[number];

/** Existing A0 outer codes remain sufficient; the nested detail is additive. */
export const A0_U1_ATOMIC_EDIT_OUTER_REFUSAL_CODES: readonly [
  "command.payload_invalid",
  "command.target_missing",
  "command.destination_invalid",
  "command.id_allocation_failed",
  "command.structural_validation_failed",
  "command.semantic_validation_failed",
  "history.entry_too_large",
  "history.byte_estimate_invalid",
] = Object.freeze([
  "command.payload_invalid",
  "command.target_missing",
  "command.destination_invalid",
  "command.id_allocation_failed",
  "command.structural_validation_failed",
  "command.semantic_validation_failed",
  "history.entry_too_large",
  "history.byte_estimate_invalid",
]);

export type AtomicEditPlanOuterRefusalCode =
  (typeof A0_U1_ATOMIC_EDIT_OUTER_REFUSAL_CODES)[number];

export type AtomicEditPlanDestinationRefusalCode =
  | "edit-plan.destination-invalid"
  | "edit-plan.event-order-invalid"
  | "edit-plan.section-split-boundary-invalid"
  | "edit-plan.section-order-invalid";

export type AtomicEditPlanIdAllocationRefusalCode =
  "edit-plan.id-factory-failed" | "edit-plan.id-collision";

export type AtomicEditPlanPayloadRefusalCode = Exclude<
  AtomicEditPlanRefusalCode,
  | "edit-plan.target-missing"
  | AtomicEditPlanDestinationRefusalCode
  | AtomicEditPlanIdAllocationRefusalCode
  | "edit-plan.structural-publication-refused"
  | "edit-plan.semantic-publication-refused"
  | "edit-plan.history-refused"
>;

/** The normative nested-to-outer refusal family mapping from section 16. */
export type AtomicEditPlanRefusalCodeForOuter<
  OuterCode extends AtomicEditPlanOuterRefusalCode,
> = OuterCode extends "command.payload_invalid"
  ? AtomicEditPlanPayloadRefusalCode
  : OuterCode extends "command.target_missing"
    ? "edit-plan.target-missing"
    : OuterCode extends "command.destination_invalid"
      ? AtomicEditPlanDestinationRefusalCode
      : OuterCode extends "command.id_allocation_failed"
        ? AtomicEditPlanIdAllocationRefusalCode
        : OuterCode extends "command.structural_validation_failed"
          ? "edit-plan.structural-publication-refused"
          : OuterCode extends "command.semantic_validation_failed"
            ? "edit-plan.semantic-publication-refused"
            : "edit-plan.history-refused";

const PAYLOAD_INVALID_OUTER_CODES: readonly ["command.payload_invalid"] =
  Object.freeze(["command.payload_invalid"]);
const TARGET_MISSING_OUTER_CODES: readonly ["command.target_missing"] =
  Object.freeze(["command.target_missing"]);
const DESTINATION_INVALID_OUTER_CODES: readonly [
  "command.destination_invalid",
] = Object.freeze(["command.destination_invalid"]);
const ID_ALLOCATION_FAILED_OUTER_CODES: readonly [
  "command.id_allocation_failed",
] = Object.freeze(["command.id_allocation_failed"]);
const STRUCTURAL_VALIDATION_FAILED_OUTER_CODES: readonly [
  "command.structural_validation_failed",
] = Object.freeze(["command.structural_validation_failed"]);
const SEMANTIC_VALIDATION_FAILED_OUTER_CODES: readonly [
  "command.semantic_validation_failed",
] = Object.freeze(["command.semantic_validation_failed"]);
const HISTORY_REFUSAL_OUTER_CODES: readonly [
  "history.entry_too_large",
  "history.byte_estimate_invalid",
] = Object.freeze(["history.entry_too_large", "history.byte_estimate_invalid"]);

export const A0_U1_ATOMIC_EDIT_ALLOWED_OUTER_CODES_BY_REFUSAL_CODE: Readonly<
  Record<
    AtomicEditPlanRefusalCode,
    readonly [
      AtomicEditPlanOuterRefusalCode,
      ...AtomicEditPlanOuterRefusalCode[],
    ]
  >
> = Object.freeze({
  "edit-plan.command-shape-invalid": PAYLOAD_INVALID_OUTER_CODES,
  "edit-plan.plan-shape-invalid": PAYLOAD_INVALID_OUTER_CODES,
  "edit-plan.quick-entry-snapshot-mismatch": PAYLOAD_INVALID_OUTER_CODES,
  "edit-plan.source-code-points-exceeded": PAYLOAD_INVALID_OUTER_CODES,
  "edit-plan.source-unicode-invalid": PAYLOAD_INVALID_OUTER_CODES,
  "edit-plan.source-utf8-bytes-exceeded": PAYLOAD_INVALID_OUTER_CODES,
  "edit-plan.target-missing": TARGET_MISSING_OUTER_CODES,
  "edit-plan.destination-invalid": DESTINATION_INVALID_OUTER_CODES,
  "edit-plan.event-order-invalid": DESTINATION_INVALID_OUTER_CODES,
  "edit-plan.section-split-boundary-invalid": DESTINATION_INVALID_OUTER_CODES,
  "edit-plan.section-order-invalid": DESTINATION_INVALID_OUTER_CODES,
  "edit-plan.recovered-chord-placement-invalid": PAYLOAD_INVALID_OUTER_CODES,
  "edit-plan.syntax-refused": PAYLOAD_INVALID_OUTER_CODES,
  "edit-plan.recovered-chord-requires-parse-failure":
    PAYLOAD_INVALID_OUTER_CODES,
  "edit-plan.recovered-chord-ordinal-missing": PAYLOAD_INVALID_OUTER_CODES,
  "edit-plan.warning-acknowledgements-mismatch": PAYLOAD_INVALID_OUTER_CODES,
  "edit-plan.fragment-placement-mismatch": PAYLOAD_INVALID_OUTER_CODES,
  "edit-plan.completion-declarations-mismatch": PAYLOAD_INVALID_OUTER_CODES,
  "edit-plan.section-metadata-mismatch": PAYLOAD_INVALID_OUTER_CODES,
  "edit-plan.recovered-chord-layout-loss-unacknowledged":
    PAYLOAD_INVALID_OUTER_CODES,
  "edit-plan.recovered-chord-duration-mismatch": PAYLOAD_INVALID_OUTER_CODES,
  "edit-plan.duration-invalid": PAYLOAD_INVALID_OUTER_CODES,
  "edit-plan.duration-sum-mismatch": PAYLOAD_INVALID_OUTER_CODES,
  "edit-plan.event-content-mismatch": PAYLOAD_INVALID_OUTER_CODES,
  "edit-plan.right-annotation-not-empty": PAYLOAD_INVALID_OUTER_CODES,
  "edit-plan.collection-limit-exceeded": PAYLOAD_INVALID_OUTER_CODES,
  "edit-plan.timeline-limit-exceeded": PAYLOAD_INVALID_OUTER_CODES,
  "edit-plan.id-factory-failed": ID_ALLOCATION_FAILED_OUTER_CODES,
  "edit-plan.id-collision": ID_ALLOCATION_FAILED_OUTER_CODES,
  "edit-plan.structural-publication-refused":
    STRUCTURAL_VALIDATION_FAILED_OUTER_CODES,
  "edit-plan.semantic-publication-refused":
    SEMANTIC_VALIDATION_FAILED_OUTER_CODES,
  "edit-plan.history-refused": HISTORY_REFUSAL_OUTER_CODES,
});

/** Exact inherited A0 envelope refusals that precede all edit-plan work/detail. */
export const A0_U1_ATOMIC_EDIT_PREPLAN_OUTER_REFUSAL_CODES: readonly [
  "command.id_invalid",
  "command.label_invalid",
  "command.logical_time_invalid",
  "command.wrong_document",
  "command.stale_revision",
  "application.revision_exhausted",
  "application.sequence_exhausted",
  "command.coalescing_invalid",
  "history.locked",
] = Object.freeze([
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

export type AtomicEditPlanPreplanOuterRefusalCode =
  (typeof A0_U1_ATOMIC_EDIT_PREPLAN_OUTER_REFUSAL_CODES)[number];

export type AtomicEditPlanDiagnostic = Readonly<{
  code: AtomicEditPlanRefusalCode;
  owner: "A0/U1" | "T0";
  path: DomainPath;
  sourceRange: SourceRange | null;
  syntaxCode: ChartTextErrorCode | null;
  observed: number | null;
  maximum: number | null;
}>;

export const A0_U1_ATOMIC_EDIT_WORK_COUNTER_NAMES: readonly [
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
] = Object.freeze([
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

export const A0_U1_ATOMIC_EDIT_PLAN_TERMINATIONS: readonly [
  "complete",
  "input-refusal",
  "allocation-refusal",
  "publication-refusal",
  "history-refusal",
] = Object.freeze([
  "complete",
  "input-refusal",
  "allocation-refusal",
  "publication-refusal",
  "history-refusal",
]);

export type AtomicEditPlanTermination =
  (typeof A0_U1_ATOMIC_EDIT_PLAN_TERMINATIONS)[number];

export type AtomicEditPlanWorkEvidence = Readonly<{
  planNodesVisited: number;
  sourceCodePointsObserved: number;
  sourceUtf8BytesObserved: number;
  quickEntrySnapshotFieldsCompared: number;
  quickEntryIssueCodesCompared: number;
  syntaxParseCalls: number;
  warningAcknowledgementsCompared: number;
  /** Returned T0 insertable rows examined, not sparse global ordinal + 1. */
  insertableChordsExamined: number;
  recoveryFieldsCompared: number;
  draftSectionsVisited: number;
  draftMeasuresVisited: number;
  draftEventsVisited: number;
  completionDeclarationsVisited: number;
  metadataFieldsCompared: number;
  exactBeatAdditions: number;
  exactBeatComparisons: number;
  idAllocationAttempts: number;
  idCollisionChecks: number;
  bookmarkRecordsExamined: number;
  bookmarkRecordsRewritten: number;
  peakPlanNodeRecords: number;
  peakAllocatedIdRecords: number;
  peakDiagnosticRecords: number;
  termination: AtomicEditPlanTermination;
}>;

export type AtomicEditPlanRefusal<
  OuterCode extends AtomicEditPlanOuterRefusalCode =
    AtomicEditPlanOuterRefusalCode,
> = Readonly<{
  code: AtomicEditPlanRefusalCodeForOuter<OuterCode>;
  outerCode: OuterCode;
  path: DomainPath;
  diagnostics: readonly AtomicEditPlanDiagnostic[];
  work: AtomicEditPlanWorkEvidence;
}>;

export type AtomicEditPlanBoundary =
  | Readonly<{ kind: "document-start" | "document-end" }>
  | Readonly<{
      kind:
        "before-section" | "after-section" | "section-start" | "section-end";
      sectionId: SectionId;
    }>
  | Readonly<{
      kind:
        "before-measure" | "after-measure" | "measure-start" | "measure-end";
      measureId: MeasureId;
    }>
  | Readonly<{
      kind: "before-event" | "after-event";
      eventId: ChordEventId;
    }>;

export const A0_U1_QUICK_ENTRY_TARGET_MATCH_POLICY = Object.freeze({
  intoMeasureBeforeEvent: "before-event-id-equals-beforeEventId",
  intoMeasureAppend: "measure-end-id-equals-measureId",
  intoSectionBeforeMeasure: "before-measure-id-equals-beforeMeasureId",
  intoSectionAppend: "section-end-id-equals-sectionId",
  intoDocumentBeforeSection: "before-section-id-equals-beforeSectionId",
  intoDocumentAppend: "document-end",
});

export type AtomicEditPlanBoundaryRewrite = Readonly<{
  from: AtomicEditPlanBoundary;
  to: AtomicEditPlanBoundary;
}>;

export type AtomicEditPlanSelectionReplacement = Readonly<{
  fromEventId: ChordEventId;
  toEventId: ChordEventId;
}>;

export type AtomicEditPlanBookmarkReceipt = Readonly<{
  selectionPolicy:
    "preserve-existing" | "replace-removed-right-with-left-and-deduplicate";
  selectionReplacements: readonly AtomicEditPlanSelectionReplacement[];
  insertionPolicy:
    | "preserve-or-repair"
    | "move-after-last-inserted"
    | "rewrite-exact-span-end";
  insertionRewrite: AtomicEditPlanBoundaryRewrite | null;
  rangePolicy:
    | "preserve-or-repair"
    | "rewrite-representable-boundaries"
    | "clear-unrepresentable-internal-event-boundary";
  rangeBoundaryRewrites: readonly AtomicEditPlanBoundaryRewrite[];
  rangeCleared: boolean;
  focusPolicy:
    | "preserve-stable-target"
    | "focus-inserted-material-when-no-stable-target"
    | "replace-removed-right-with-left";
}>;

export const A0_U1_ATOMIC_EDIT_PLAN_BOOKMARK_POLICIES = Object.freeze({
  insertFragment:
    "preserve-selection-and-range-move-insertion-after-last-inserted",
  splitEventDuration:
    "preserve-original-selection-rewrite-original-span-end-to-second",
  joinEventDurations:
    "replace-removed-right-selection-with-left-clear-unrepresentable-range",
  splitSection: "preserve-node-identities-rewrite-source-section-end-to-suffix",
  joinSections:
    "preserve-measure-event-identities-map-internal-edge-to-measure-boundary",
});

export type AtomicEditPlanAllocatedIdentity =
  | Readonly<{
      kind: "section";
      id: SectionId;
      source:
        | Readonly<{
            kind: "fragment-section";
            sourceSectionOrdinal: number;
          }>
        | Readonly<{
            kind: "split-section-suffix";
            sourceSectionId: SectionId;
          }>;
    }>
  | Readonly<{
      kind: "measure";
      id: MeasureId;
      source: Readonly<{
        kind: "fragment-measure";
        sourceSectionOrdinal: number;
        sourceMeasureOrdinal: number;
      }>;
    }>
  | Readonly<{
      kind: "event";
      id: ChordEventId;
      source:
        | Readonly<{
            kind: "fragment-event";
            sourceEventOrdinal: number;
          }>
        | Readonly<{
            kind: "recovered-chord";
            selectedGlobalOrdinal: number;
          }>
        | Readonly<{
            kind: "split-event-second";
            sourceEventId: ChordEventId;
          }>;
    }>;

export type AtomicEditPlanRemovedIdentity =
  | Readonly<{ kind: "section"; id: SectionId }>
  | Readonly<{ kind: "event"; id: ChordEventId }>;

export type AtomicEditPlanTimelineDisposition =
  | "splice-source-order-at-declared-boundary"
  | "insert-one-recovered-chord-at-declared-boundary"
  | "replace-one-span-with-two-exact-sum-spans"
  | "replace-two-equal-content-spans-with-one-exact-sum-span"
  | "preserve-flattened-event-order-and-durations";

export type AtomicEditPlanInsertSourceReceipt =
  | Readonly<{
      kind: "complete-draft";
      parserOutcome: "success";
      quickEntrySnapshotMatched: true;
      canonicalTargetMatched: true;
      acknowledgedWarningCount: number;
    }>
  | Readonly<{
      kind: "recovered-chord";
      parserOutcome: "failure";
      quickEntrySnapshotMatched: true;
      canonicalTargetMatched: true;
      selectedGlobalOrdinal: number;
      selectedRange: SourceRange;
      durationSource: "t0-resolved" | "caller-required";
      siblingsApplied: 0;
      layoutLossAcknowledged: true;
    }>;

/** Proposed additive success detail; only the source-only runner below exposes it. */
export type AtomicEditPlanReceipt = Readonly<{
  schema: typeof A0_U1_ATOMIC_EDIT_PLAN_RECEIPT_SCHEMA;
  commandKind: "apply-edit-plan";
  commandId: string;
  planKind: AtomicEditPlanKind;
  documentId: DocumentId;
  baseRevision: number;
  committedRevision: number;
  allocatedIdentities: readonly AtomicEditPlanAllocatedIdentity[];
  removedIdentities: readonly AtomicEditPlanRemovedIdentity[];
  survivorId: AnyStableId | null;
  insertSource: AtomicEditPlanInsertSourceReceipt | null;
  completionMeasureIds: readonly MeasureId[];
  timelineDisposition: AtomicEditPlanTimelineDisposition;
  bookmarks: AtomicEditPlanBookmarkReceipt;
  quickEntryDisposition: "clear-to-idle-at-committed-revision";
  historyEntriesAppended: 1;
  structuralDecodeCalls: 1;
  semanticValidationCalls: 1;
  effects: readonly [
    "queue-recovery",
    "compile-playback-plan",
    "restore-focus",
    "announce",
  ];
  work: AtomicEditPlanWorkEvidence;
}>;

/** Future composition adds T0 and widens only the history estimator's input kind. */
export type AtomicEditPlanHistoryRetainedByteEstimator = (
  entry: Omit<ProposedAtomicEditPlanHistoryEntry, "retainedBytesEstimate">,
) => number;

export type AtomicEditPlanDependencies = Readonly<
  Omit<ApplicationCommandDependencies, "estimateHistoryRetainedBytes"> &
    AtomicEditPlanParserDependency & {
      estimateHistoryRetainedBytes: AtomicEditPlanHistoryRetainedByteEstimator;
    }
>;

export type RunAtomicEditPlanRequest = Readonly<{
  state: AtomicEditPlanAppState;
  command: ApplyEditPlanCommand;
  dependencies: AtomicEditPlanDependencies;
}>;

type AtomicEditPlanBaseSuccess = Readonly<
  Omit<Extract<ApplicationTransitionResult, { ok: true }>, "state"> & {
    state: AtomicEditPlanAppState;
  }
>;

type AtomicEditPlanBaseFailure = Readonly<
  Omit<Extract<ApplicationTransitionResult, { ok: false }>, "state"> & {
    state: AtomicEditPlanAppState;
  }
>;

/** Failures rejected before the edit-plan stage cannot carry nested detail. */
export type AtomicEditPlanPreplanFailure = Readonly<
  Omit<AtomicEditPlanBaseFailure, "refusal"> & {
    refusal: Readonly<
      AtomicEditPlanBaseFailure["refusal"] & {
        code: AtomicEditPlanPreplanOuterRefusalCode;
      }
    >;
    editPlanRefusal: null;
  }
>;

/** One mapped branch per code keeps outer and nested refusal codes correlated. */
export type AtomicEditPlanFailureForOuterCode<
  OuterCode extends AtomicEditPlanOuterRefusalCode,
> = Readonly<
  Omit<AtomicEditPlanBaseFailure, "refusal"> & {
    refusal: Readonly<
      AtomicEditPlanBaseFailure["refusal"] & {
        code: OuterCode;
      }
    >;
    editPlanRefusal: AtomicEditPlanRefusal<OuterCode>;
  }
>;

export type AtomicEditPlanPostplanFailure = {
  [
    OuterCode in AtomicEditPlanOuterRefusalCode
  ]: AtomicEditPlanFailureForOuterCode<OuterCode>;
}[AtomicEditPlanOuterRefusalCode];

/**
 * Additive result surface. A0-envelope refusals carry null nested detail.
 * Failures after edit-plan validation begins carry non-null detail whose outer
 * code is type-correlated; the runner must also value-check the duplicated path.
 */
export type AtomicEditPlanTransitionResult =
  | Readonly<
      AtomicEditPlanBaseSuccess & {
        outcome: "committed";
        editPlanReceipt: AtomicEditPlanReceipt;
      }
    >
  | AtomicEditPlanPreplanFailure
  | AtomicEditPlanPostplanFailure;

/** Proposed synchronous operation only; no production implementation exists yet. */
export type RunAtomicEditPlan = (
  request: RunAtomicEditPlanRequest,
) => AtomicEditPlanTransitionResult;

export const A0_U1_ATOMIC_EDIT_LAW_IDS: readonly [
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
] = Object.freeze([
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

export const A0_U1_ATOMIC_EDIT_PLAN_TRANSPOSITION_POLICY = Object.freeze({
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

export const A0_U1_ATOMIC_EDIT_PLAN_ID_ENTROPY_POLICY = Object.freeze({
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

/** Runtime exact-object validators consume this declarative key authority. */
export const A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS = Object.freeze({
  envelope: Object.freeze([
    "id",
    "label",
    "expectedDocumentId",
    "expectedRevision",
    "logicalTimeMs",
    "coalescing",
    "kind",
    "plan",
  ]),
  completeDraftPlan: Object.freeze([
    "kind",
    "source",
    "placement",
    "voicingPolicy",
  ]),
  recoveredChordPlan: Object.freeze([
    "kind",
    "source",
    "placement",
    "voicingPolicy",
  ]),
  completeDraftSource: Object.freeze([
    "kind",
    "quickEntrySnapshot",
    "warningAcknowledgements",
  ]),
  recoveredChordSource: Object.freeze([
    "kind",
    "quickEntrySnapshot",
    "selectedGlobalOrdinal",
    "layoutLossAcknowledgement",
    "callerDuration",
  ]),
  quickEntrySnapshot: Object.freeze([
    "sourceText",
    "baseRevision",
    "target",
    "issueCodes",
    "expectedStatus",
    "expectedLane",
  ]),
  documentBoundary: Object.freeze(["kind"]),
  sectionBoundary: Object.freeze(["kind", "sectionId"]),
  measureBoundary: Object.freeze(["kind", "measureId"]),
  eventBoundary: Object.freeze(["kind", "eventId"]),
  completeDraftIntoMeasurePlacement: Object.freeze([
    "kind",
    "measureId",
    "beforeEventId",
    "layoutDisposition",
    "completionDeclarations",
  ]),
  recoveredChordIntoMeasurePlacement: Object.freeze([
    "kind",
    "measureId",
    "beforeEventId",
    "layoutDisposition",
    "completionDeclarations",
  ]),
  intoSectionPlacement: Object.freeze([
    "kind",
    "sectionId",
    "beforeMeasureId",
    "layoutDisposition",
    "completionDeclarations",
  ]),
  intoDocumentPlacement: Object.freeze([
    "kind",
    "beforeSectionId",
    "layoutDisposition",
    "sectionDeclarations",
    "completionDeclarations",
  ]),
  warningAcknowledgement: Object.freeze(["code", "range"]),
  sourceRange: Object.freeze(["start", "end"]),
  completionDeclaration: Object.freeze(["measureId", "completion"]),
  sectionDeclaration: Object.freeze([
    "sourceSectionOrdinal",
    "voiceLeadingBoundary",
  ]),
  sectionMetadata: Object.freeze([
    "name",
    "annotation",
    "keyOverride",
    "voiceLeadingBoundary",
  ]),
  splitEventDurationPlan: Object.freeze([
    "kind",
    "eventId",
    "firstDuration",
    "secondDuration",
    "completionDeclarations",
    "identityPolicy",
    "contentPolicy",
    "annotationPolicy",
  ]),
  joinEventDurationsPlan: Object.freeze([
    "kind",
    "leftEventId",
    "rightEventId",
    "joinedDuration",
    "completionDeclarations",
    "identityPolicy",
    "contentPolicy",
    "annotationPolicy",
  ]),
  splitSectionPlan: Object.freeze([
    "kind",
    "sectionId",
    "beforeMeasureId",
    "newSectionMetadata",
    "completionDeclarations",
    "identityPolicy",
    "measurePolicy",
  ]),
  joinSectionsPlan: Object.freeze([
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
  ]),
  newEventAutoVoicing: Object.freeze([
    "mode",
    "family",
    "voiceCount",
    "range",
    "bassPolicy",
  ]),
  newEventAutoVoicingRange: Object.freeze(["lowMidi", "highMidi"]),
});

export const A0_U1_ATOMIC_EDIT_PLAN_FORBIDDEN_PAYLOAD_KEYS: readonly [
  "candidate",
  "document",
  "commands",
  "plans",
  "nestedPlan",
  "patch",
  "derivedPatch",
  "replacement",
  "importDraft",
] = Object.freeze([
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
