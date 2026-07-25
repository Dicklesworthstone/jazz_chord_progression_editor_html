import {
  BEAT_UNITS,
  MAX_DOCUMENT_CHORD_EVENTS,
  MAX_DOCUMENT_SECTIONS,
  MAX_BEATS_PER_BAR,
  MAX_LONG_TEXT_CODE_POINTS,
  MAX_SECTION_MEASURES,
  MAX_SHORT_TEXT_CODE_POINTS,
  MAX_TIMELINE_QUARTER_NOTE_BEATS,
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
  MAX_HISTORY_RETAINED_BYTES,
  MAX_SELECTED_EVENT_IDS,
  type AppState,
  type ApplicationCommandDependencies,
  type ApplicationTransitionResult,
  type DocumentCommand,
  type HistoryEntry,
  type HistoryState,
  type UiFocusTarget,
} from "./application-state-contract";

/** Proposed A0/U1 specification surface; no production runner consumes it yet. */
export const A0_U1_ATOMIC_EDIT_PLAN_CONTRACT_SCHEMA =
  "changes.application.atomic-edit-plan-contract.v2";
export const A0_U1_ATOMIC_EDIT_PLAN_POLICY_ID =
  "changes.application-atomic-edit-plan";
export const A0_U1_ATOMIC_EDIT_PLAN_POLICY_VERSION = 2;
export const A0_U1_ATOMIC_EDIT_PLAN_RECEIPT_SCHEMA =
  "changes.application.atomic-edit-plan-receipt.v2";
export const A0_U1_ATOMIC_EDIT_IMPLEMENTATION_STATUS =
  "implemented-live";

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
] = /* @__PURE__ */ Object.freeze([
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
] = /* @__PURE__ */ Object.freeze([
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
] = /* @__PURE__ */ Object.freeze(["into-measure", "into-section", "into-document"]);

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
}> = /* @__PURE__ */ Object.freeze({
  mode: "auto",
  family: "balanced",
  voiceCount: 4,
  range: /* @__PURE__ */ Object.freeze({ lowMidi: 48, highMidi: 84 }),
  bassPolicy: "generated",
});

export const A0_U1_NEW_EVENT_POLICY_ID = "a0-u1-balanced-4-48-84-generated@1";
export const A0_U1_FRAGMENT_PARSE_ACCIDENTAL_STYLE = "ascii";
export const A0_U1_RECOVERED_CHORD_LAYOUT_LOSS_ACKNOWLEDGEMENT =
  "source-bar-and-section-layout-will-be-lost@1";

/**
 * These parser-safety ceilings remain part of the proposed runner contract,
 * but accepted A0 QuickEntry state already proves the same code-point limit,
 * valid Unicode, and the implied UTF-8 ceiling. The three source refusals are
 * therefore static-dominated for valid AppState inputs; these values must not
 * be read as a claim that they are reachable.
 */
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
export const A0_U1_RECOVERY_FIELD_COMPARISON_ORDER: readonly [
  "placement",
  "selected-global-ordinal",
  "layout-loss-acknowledgement",
  "duration-branch-and-value",
] = /* @__PURE__ */ Object.freeze([
  "placement",
  "selected-global-ordinal",
  "layout-loss-acknowledgement",
  "duration-branch-and-value",
]);
export const A0_U1_FINAL_COLLECTION_LIMIT_COMPARISON_ORDER: readonly [
  "final-document-sections",
  "final-section-measures-in-section-order",
  "final-total-measures",
  "final-document-events",
  "occupied-id-records",
  "plan-node-records",
] = /* @__PURE__ */ Object.freeze([
  "final-document-sections",
  "final-section-measures-in-section-order",
  "final-total-measures",
  "final-document-events",
  "occupied-id-records",
  "plan-node-records",
]);
export const MAX_A0_U1_ID_ALLOCATION_ATTEMPTS =
  MAX_DOCUMENT_SECTIONS +
  MAX_DOCUMENT_SECTIONS * MAX_SECTION_MEASURES +
  MAX_DOCUMENT_CHORD_EVENTS;
export const MAX_A0_U1_OCCUPIED_ID_RECORDS =
  1 + MAX_A0_U1_ID_ALLOCATION_ATTEMPTS;
export const MAX_A0_U1_PLAN_NODE_RECORDS = 1 + MAX_A0_U1_ID_ALLOCATION_ATTEMPTS;
export const MAX_A0_U1_BOOKMARK_RECORDS_EXAMINED = MAX_SELECTED_EVENT_IDS + 4;
export const MAX_A0_U1_BOOKMARK_RECORDS_REWRITTEN = 4;
/**
 * One operation-local exact sum may precede the final at-limit timeline scan.
 * First-excess witnesses stop at this explicit maximum rather than performing
 * an unbounded scan.
 */
export const MAX_A0_U1_EXACT_BEAT_ADDITIONS = MAX_DOCUMENT_CHORD_EVENTS + 1;
export const MAX_A0_U1_EXACT_BEAT_COMPARISONS = MAX_DOCUMENT_CHORD_EVENTS + 1;
export const MAX_A0_U1_METADATA_FIELDS_COMPARED = 12;
export const MAX_A0_U1_SECTION_NAME_CODE_POINTS = MAX_SHORT_TEXT_CODE_POINTS;
export const MAX_A0_U1_SECTION_ANNOTATION_CODE_POINTS =
  MAX_LONG_TEXT_CODE_POINTS;
export const MAX_A0_U1_COMPLETION_REASON_CODE_POINTS =
  MAX_LONG_TEXT_CODE_POINTS;
export const MAX_A0_U1_SECTION_METADATA_CODE_POINTS =
  MAX_A0_U1_SECTION_NAME_CODE_POINTS + MAX_A0_U1_SECTION_ANNOTATION_CODE_POINTS;
/**
 * Join validates expected-left, expected-right, then result metadata, and the
 * accepted-shape aggregate also covers the completion reason of the one
 * first-extra declaration row inside the runtime-shape horizon.
 */
export const MAX_A0_U1_PLAN_METADATA_CODE_POINTS =
  3 * MAX_A0_U1_SECTION_METADATA_CODE_POINTS +
  MAX_A0_U1_COMPLETION_REASON_CODE_POINTS;
export const MAX_A0_U1_METADATA_CODE_POINTS_OBSERVED =
  MAX_A0_U1_PLAN_METADATA_CODE_POINTS + 1;

export const A0_U1_FRAGMENT_SOURCE_REFUSAL_REACHABILITY = /* @__PURE__ */ Object.freeze({
  "edit-plan.source-code-points-exceeded":
    "static-dominated-by-accepted-quick-entry-invariants",
  "edit-plan.source-unicode-invalid":
    "static-dominated-by-accepted-quick-entry-invariants",
  "edit-plan.source-utf8-bytes-exceeded":
    "static-dominated-by-accepted-quick-entry-invariants",
});

export const MAX_A0_U1_REACHABLE_FINAL_TIMELINE_QUARTER_NOTE_BEATS =
  (MAX_DOCUMENT_CHORD_EVENTS * MAX_BEATS_PER_BAR * 4) / BEAT_UNITS[0];

/**
 * The domain's final event cap and largest legal meter capacity dominate the
 * looser defensive timeline ceiling. A valid document therefore cannot reach
 * the timeline refusal, even though the bounded runner retains the check.
 */
export const A0_U1_STATIC_REFUSAL_REACHABILITY = /* @__PURE__ */ Object.freeze({
  ...A0_U1_FRAGMENT_SOURCE_REFUSAL_REACHABILITY,
  "edit-plan.timeline-limit-exceeded":
    "static-dominated-by-final-event-and-meter-capacity-invariants",
});

export const A0_U1_ATOMIC_EDIT_LIMITS = /* @__PURE__ */ Object.freeze({
  structuralDecodeCalls: 1,
  semanticValidationCalls: 1,
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
  sectionNameCodePoints: MAX_A0_U1_SECTION_NAME_CODE_POINTS,
  sectionAnnotationCodePoints: MAX_A0_U1_SECTION_ANNOTATION_CODE_POINTS,
  completionReasonCodePoints: MAX_A0_U1_COMPLETION_REASON_CODE_POINTS,
  planMetadataCodePoints: MAX_A0_U1_PLAN_METADATA_CODE_POINTS,
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

export type CompleteDraftIntoEmptyMeasureCompletionDeclaration = Readonly<{
  measureId: MeasureId;
  completion: Readonly<{ kind: "complete" }>;
}>;

/**
 * Caller-owned text is a runtime-shape concern, not a stale-snapshot concern.
 * Each field must be a valid Unicode scalar string within its domain bound
 * before allocation; the first failure is plan-shape-invalid at that field.
 */
export const A0_U1_ATOMIC_EDIT_PLAN_TEXT_SHAPE_POLICY = /* @__PURE__ */ Object.freeze({
  stage: "exact-runtime-shape",
  refusalCode: "edit-plan.plan-shape-invalid",
  unicodePolicy: "valid-unicode-scalar-string",
  counter: "metadataCodePointsObserved",
  splitSectionMetadataOrder: /* @__PURE__ */ Object.freeze(["newSectionMetadata"] as const),
  joinSectionsMetadataOrder: /* @__PURE__ */ Object.freeze([
    "expectedLeftMetadata",
    "expectedRightMetadata",
    "resultMetadata",
  ] as const),
  sectionMetadataFieldOrder: /* @__PURE__ */ Object.freeze(["name", "annotation"] as const),
  sectionNameCodePoints: MAX_A0_U1_SECTION_NAME_CODE_POINTS,
  sectionAnnotationCodePoints: MAX_A0_U1_SECTION_ANNOTATION_CODE_POINTS,
  sectionNameBlankness:
    "ecmascript-String.prototype.trim-result-must-be-nonempty",
  sectionAnnotationBlankness: "empty-or-blank-permitted",
  completionDeclarationOrder: "source-order",
  completionReasonCodePoints: MAX_A0_U1_COMPLETION_REASON_CODE_POINTS,
  pickupOrIncompleteReasonBlankness:
    "ecmascript-String.prototype.trim-result-must-be-nonempty",
  normalizationOrRepairPermitted: false,
  pathAuthority: /* @__PURE__ */ Object.freeze([
    "/plan/newSectionMetadata/name",
    "/plan/newSectionMetadata/annotation",
    "/plan/expectedLeftMetadata/name",
    "/plan/expectedLeftMetadata/annotation",
    "/plan/expectedRightMetadata/name",
    "/plan/expectedRightMetadata/annotation",
    "/plan/resultMetadata/name",
    "/plan/resultMetadata/annotation",
    "/plan/completionDeclarations/{index}/completion/reason",
    "/plan/placement/completionDeclarations/{index}/completion/reason",
  ] as const),
});

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
 * The stable target must also canonicalize to the placement destination under
 * A0_U1_QUICK_ENTRY_TARGET_MATCH_POLICY.
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
  /**
   * Complete drafts may target only an existing empty measure. Its stable
   * measure-start and measure-end boundaries both canonicalize to this append.
   */
  beforeEventId: null;
  layoutDisposition: "flatten-one-implicit-measure";
  completionDeclarations: readonly [
    CompleteDraftIntoEmptyMeasureCompletionDeclaration,
  ];
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
] = /* @__PURE__ */ Object.freeze([
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

export type AtomicEditPlanRunnerStage =
  (typeof A0_U1_ATOMIC_EDIT_PLAN_RUNNER_STAGE_ORDER)[number];

export const A0_U1_ATOMIC_EDIT_PLAN_ID_ALLOCATION_ORDER: readonly [
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
] = /* @__PURE__ */ Object.freeze([
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

/**
 * Exact runtime shape is deliberately first. Its implementation must inspect
 * own property descriptors without invoking accessors, then reject accessors,
 * inherited properties, symbols, missing keys, and extra keys. Only after that
 * descriptor-safe pass may the inherited A0 envelope stage read field values.
 */
export const A0_U1_ATOMIC_EDIT_PLAN_EXACT_SHAPE_PRECEDENCE =
  "descriptor-safe-own-data-properties-before-any-envelope-property-read";

export const A0_U1_ATOMIC_EDIT_DIAGNOSTIC_PATH_ORDER: readonly [
  "numeric-numeric-by-number",
  "string-string-by-ecmascript-code-unit",
  "mixed-numeric-before-string",
  "shared-prefix-shorter-first",
] = /* @__PURE__ */ Object.freeze([
  "numeric-numeric-by-number",
  "string-string-by-ecmascript-code-unit",
  "mixed-numeric-before-string",
  "shared-prefix-shorter-first",
]);

export const A0_U1_ATOMIC_EDIT_PLAN_DIAGNOSTIC_ORDER: readonly [
  "path-domain-segment-order",
  "null-source-range-before-ranged",
  "source-range-start-ascending",
  "source-range-end-ascending",
  "code-ecmascript-code-unit-lexical",
] = /* @__PURE__ */ Object.freeze([
  "path-domain-segment-order",
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
] = /* @__PURE__ */ Object.freeze([
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

export const A0_U1_ATOMIC_EDIT_PATH_TEMPLATE_GRAMMAR = /* @__PURE__ */ Object.freeze({
  format: "rfc6901-json-pointer-template",
  root: "",
  separator: "/",
  escaping: /* @__PURE__ */ Object.freeze({ tilde: "~0", slash: "~1" }),
  dynamicIndex: /* @__PURE__ */ Object.freeze({
    token: "{index}",
    meaning: "canonical-nonnegative-base10-source-order-array-index",
  }),
  dynamicMetadataField: /* @__PURE__ */ Object.freeze({
    token: "{metadataField}",
    values: /* @__PURE__ */ Object.freeze([
      "name",
      "annotation",
      "keyOverride",
      "voiceLeadingBoundary",
    ] as const),
  }),
  otherBraceTokensPermitted: false,
  unknownExtraOrSymbolKeyPath: "owning-container-template",
});

export type AtomicEditPlanPathTemplate = "" | `/${string}`;

const COMMAND_SHAPE_PATH_AUTHORITY: readonly [
  "",
  "/id",
  "/label",
  "/expectedDocumentId",
  "/expectedRevision",
  "/logicalTimeMs",
  "/coalescing",
  "/kind",
  "/plan",
] = /* @__PURE__ */ Object.freeze([
  "",
  "/id",
  "/label",
  "/expectedDocumentId",
  "/expectedRevision",
  "/logicalTimeMs",
  "/coalescing",
  "/kind",
  "/plan",
]);

const PLAN_SHAPE_PATH_AUTHORITY: readonly [
  AtomicEditPlanPathTemplate,
  ...AtomicEditPlanPathTemplate[],
] = /* @__PURE__ */ Object.freeze([
  "/plan",
  "/plan/kind",
  "/plan/voicingPolicy",
  "/plan/source",
  "/plan/source/kind",
  "/plan/source/quickEntrySnapshot",
  "/plan/source/quickEntrySnapshot/sourceText",
  "/plan/source/quickEntrySnapshot/baseRevision",
  "/plan/source/quickEntrySnapshot/target",
  "/plan/source/quickEntrySnapshot/target/kind",
  "/plan/source/quickEntrySnapshot/target/sectionId",
  "/plan/source/quickEntrySnapshot/target/measureId",
  "/plan/source/quickEntrySnapshot/target/eventId",
  "/plan/source/quickEntrySnapshot/issueCodes",
  "/plan/source/quickEntrySnapshot/issueCodes/{index}",
  "/plan/source/quickEntrySnapshot/expectedStatus",
  "/plan/source/quickEntrySnapshot/expectedLane",
  "/plan/source/warningAcknowledgements",
  "/plan/source/warningAcknowledgements/{index}",
  "/plan/source/warningAcknowledgements/{index}/code",
  "/plan/source/warningAcknowledgements/{index}/range",
  "/plan/source/warningAcknowledgements/{index}/range/start",
  "/plan/source/warningAcknowledgements/{index}/range/end",
  "/plan/source/selectedGlobalOrdinal",
  "/plan/source/layoutLossAcknowledgement",
  "/plan/source/callerDuration",
  "/plan/source/callerDuration/numerator",
  "/plan/source/callerDuration/denominator",
  "/plan/placement",
  "/plan/placement/kind",
  "/plan/placement/measureId",
  "/plan/placement/beforeEventId",
  "/plan/placement/sectionId",
  "/plan/placement/beforeMeasureId",
  "/plan/placement/beforeSectionId",
  "/plan/placement/layoutDisposition",
  "/plan/placement/completionDeclarations",
  "/plan/placement/completionDeclarations/{index}",
  "/plan/placement/completionDeclarations/{index}/measureId",
  "/plan/placement/completionDeclarations/{index}/completion",
  "/plan/placement/completionDeclarations/{index}/completion/kind",
  "/plan/placement/completionDeclarations/{index}/completion/expectedDuration",
  "/plan/placement/completionDeclarations/{index}/completion/expectedDuration/numerator",
  "/plan/placement/completionDeclarations/{index}/completion/expectedDuration/denominator",
  "/plan/placement/completionDeclarations/{index}/completion/reason",
  "/plan/placement/sectionDeclarations",
  "/plan/placement/sectionDeclarations/{index}",
  "/plan/placement/sectionDeclarations/{index}/sourceSectionOrdinal",
  "/plan/placement/sectionDeclarations/{index}/voiceLeadingBoundary",
  "/plan/eventId",
  "/plan/leftEventId",
  "/plan/rightEventId",
  "/plan/firstDuration",
  "/plan/firstDuration/numerator",
  "/plan/firstDuration/denominator",
  "/plan/secondDuration",
  "/plan/secondDuration/numerator",
  "/plan/secondDuration/denominator",
  "/plan/joinedDuration",
  "/plan/joinedDuration/numerator",
  "/plan/joinedDuration/denominator",
  "/plan/sectionId",
  "/plan/beforeMeasureId",
  "/plan/leftSectionId",
  "/plan/rightSectionId",
  "/plan/newSectionMetadata",
  "/plan/newSectionMetadata/{metadataField}",
  "/plan/expectedLeftMetadata",
  "/plan/expectedLeftMetadata/{metadataField}",
  "/plan/expectedRightMetadata",
  "/plan/expectedRightMetadata/{metadataField}",
  "/plan/resultMetadata",
  "/plan/resultMetadata/{metadataField}",
  "/plan/newSectionMetadata/keyOverride/tonic",
  "/plan/newSectionMetadata/keyOverride/tonic/step",
  "/plan/newSectionMetadata/keyOverride/tonic/alter",
  "/plan/newSectionMetadata/keyOverride/mode",
  "/plan/expectedLeftMetadata/keyOverride/tonic",
  "/plan/expectedLeftMetadata/keyOverride/tonic/step",
  "/plan/expectedLeftMetadata/keyOverride/tonic/alter",
  "/plan/expectedLeftMetadata/keyOverride/mode",
  "/plan/expectedRightMetadata/keyOverride/tonic",
  "/plan/expectedRightMetadata/keyOverride/tonic/step",
  "/plan/expectedRightMetadata/keyOverride/tonic/alter",
  "/plan/expectedRightMetadata/keyOverride/mode",
  "/plan/resultMetadata/keyOverride/tonic",
  "/plan/resultMetadata/keyOverride/tonic/step",
  "/plan/resultMetadata/keyOverride/tonic/alter",
  "/plan/resultMetadata/keyOverride/mode",
  "/plan/completionDeclarations",
  "/plan/completionDeclarations/{index}",
  "/plan/completionDeclarations/{index}/measureId",
  "/plan/completionDeclarations/{index}/completion",
  "/plan/completionDeclarations/{index}/completion/kind",
  "/plan/completionDeclarations/{index}/completion/expectedDuration",
  "/plan/completionDeclarations/{index}/completion/expectedDuration/numerator",
  "/plan/completionDeclarations/{index}/completion/expectedDuration/denominator",
  "/plan/completionDeclarations/{index}/completion/reason",
  "/plan/identityPolicy",
  "/plan/contentPolicy",
  "/plan/annotationPolicy",
  "/plan/measurePolicy",
  "/plan/metadataPolicy",
  "/plan/internalBoundaryPolicy",
]);

export type AtomicEditPlanRefusalAuthorityRow = Readonly<{
  code: AtomicEditPlanRefusalCode;
  precedence: number;
  stage: AtomicEditPlanRunnerStage;
  condition: string;
  /** Templates obey A0_U1_ATOMIC_EDIT_PATH_TEMPLATE_GRAMMAR exactly. */
  pathAuthority: readonly [
    AtomicEditPlanPathTemplate,
    ...AtomicEditPlanPathTemplate[],
  ];
}>;

/**
 * One source-level authority for condition, stage, path, and precedence. The
 * array order and explicit precedence must equal ATOMIC_EDIT_REFUSAL_CODES.
 */
export const A0_U1_ATOMIC_EDIT_REFUSAL_AUTHORITY: readonly AtomicEditPlanRefusalAuthorityRow[] =
  /* @__PURE__ */ Object.freeze([
    {
      code: "edit-plan.command-shape-invalid",
      precedence: 0,
      stage: "exact-runtime-shape",
      condition:
        "command is not a passive exact-key own-data-property apply-edit-plan record",
      pathAuthority: COMMAND_SHAPE_PATH_AUTHORITY,
    },
    {
      code: "edit-plan.plan-shape-invalid",
      precedence: 1,
      stage: "exact-runtime-shape",
      condition:
        "plan or nested value is not the exact closed runtime shape, including invalid Unicode, an out-of-bound text field, or a trim-blank section name or pickup/incomplete completion reason; normalization and repair are forbidden",
      pathAuthority: PLAN_SHAPE_PATH_AUTHORITY,
    },
    {
      code: "edit-plan.quick-entry-snapshot-mismatch",
      precedence: 2,
      stage: "quick-entry-snapshot",
      condition:
        "snapshot differs from accepted current QuickEntry state or lane",
      pathAuthority: [
        "/plan/source/quickEntrySnapshot/sourceText",
        "/plan/source/quickEntrySnapshot/baseRevision",
        "/plan/source/quickEntrySnapshot/target",
        "/plan/source/quickEntrySnapshot/target/kind",
        "/plan/source/quickEntrySnapshot/target/sectionId",
        "/plan/source/quickEntrySnapshot/target/measureId",
        "/plan/source/quickEntrySnapshot/target/eventId",
        "/plan/source/quickEntrySnapshot/issueCodes",
        "/plan/source/quickEntrySnapshot/issueCodes/{index}",
        "/plan/source/quickEntrySnapshot/expectedStatus",
        "/plan/source/quickEntrySnapshot/expectedLane",
      ],
    },
    {
      code: "edit-plan.source-code-points-exceeded",
      precedence: 3,
      stage: "bounded-source-preflight",
      condition:
        "first code-point excess witness; static-dominated for accepted QuickEntry state",
      pathAuthority: ["/plan/source/quickEntrySnapshot/sourceText"],
    },
    {
      code: "edit-plan.source-unicode-invalid",
      precedence: 4,
      stage: "bounded-source-preflight",
      condition:
        "first invalid Unicode scalar witness; static-dominated for accepted QuickEntry state",
      pathAuthority: ["/plan/source/quickEntrySnapshot/sourceText"],
    },
    {
      code: "edit-plan.source-utf8-bytes-exceeded",
      precedence: 5,
      stage: "bounded-source-preflight",
      condition:
        "first UTF-8 byte excess witness; static-dominated for accepted QuickEntry state",
      pathAuthority: ["/plan/source/quickEntrySnapshot/sourceText"],
    },
    {
      code: "edit-plan.target-missing",
      precedence: 6,
      stage: "target-and-destination",
      condition:
        "declared target stable ID is absent from the current document",
      pathAuthority: [
        "/plan/placement/measureId",
        "/plan/placement/beforeEventId",
        "/plan/placement/sectionId",
        "/plan/placement/beforeMeasureId",
        "/plan/placement/beforeSectionId",
        "/plan/source/quickEntrySnapshot/target/sectionId",
        "/plan/source/quickEntrySnapshot/target/measureId",
        "/plan/source/quickEntrySnapshot/target/eventId",
        "/plan/eventId",
        "/plan/leftEventId",
        "/plan/rightEventId",
        "/plan/sectionId",
        "/plan/beforeMeasureId",
        "/plan/leftSectionId",
        "/plan/rightSectionId",
      ],
    },
    {
      code: "edit-plan.destination-invalid",
      precedence: 7,
      stage: "target-and-destination",
      condition:
        "canonicalized stable boundary and declared placement do not resolve to the same parent and sibling slot, or complete-draft into-measure targets a nonempty measure",
      pathAuthority: [
        "/plan/placement",
        "/plan/placement/measureId",
        "/plan/placement/beforeEventId",
        "/plan/placement/sectionId",
        "/plan/placement/beforeMeasureId",
        "/plan/placement/beforeSectionId",
        "/plan/source/quickEntrySnapshot/target",
        "/plan/source/quickEntrySnapshot/target/kind",
        "/plan/source/quickEntrySnapshot/target/sectionId",
        "/plan/source/quickEntrySnapshot/target/measureId",
        "/plan/source/quickEntrySnapshot/target/eventId",
      ],
    },
    {
      code: "edit-plan.event-order-invalid",
      precedence: 8,
      stage: "target-and-destination",
      condition:
        "join event IDs are not immediate ordered siblings in one measure",
      pathAuthority: ["/plan/rightEventId"],
    },
    {
      code: "edit-plan.section-split-boundary-invalid",
      precedence: 9,
      stage: "target-and-destination",
      condition: "split boundary is not strict interior to the target section",
      pathAuthority: ["/plan/beforeMeasureId"],
    },
    {
      code: "edit-plan.section-order-invalid",
      precedence: 10,
      stage: "target-and-destination",
      condition: "join section IDs are not immediate ordered siblings",
      pathAuthority: ["/plan/rightSectionId"],
    },
    {
      code: "edit-plan.recovered-chord-placement-invalid",
      precedence: 11,
      stage: "target-and-destination",
      condition:
        "recovered-chord lane does not use its exact into-measure placement",
      pathAuthority: ["/plan/placement"],
    },
    {
      code: "edit-plan.syntax-refused",
      precedence: 12,
      stage: "t0-fragment-parse",
      condition: "complete-draft lane receives a T0 parse refusal",
      pathAuthority: ["/plan/source/quickEntrySnapshot/sourceText"],
    },
    {
      code: "edit-plan.recovered-chord-requires-parse-failure",
      precedence: 13,
      stage: "t0-fragment-parse",
      condition: "recovered-chord lane receives a T0 parse success",
      pathAuthority: ["/plan/source/kind"],
    },
    {
      code: "edit-plan.recovered-chord-ordinal-missing",
      precedence: 14,
      stage: "t0-fragment-parse",
      condition:
        "no returned T0 insertable chord has the selected global ordinal",
      pathAuthority: ["/plan/source/selectedGlobalOrdinal"],
    },
    {
      code: "edit-plan.warning-acknowledgements-mismatch",
      precedence: 15,
      stage: "warning-acknowledgements",
      condition:
        "ordered warning code/range acknowledgement sequence differs from T0",
      pathAuthority: [
        "/plan/source/warningAcknowledgements/{index}",
        "/plan/source/warningAcknowledgements/{index}/code",
        "/plan/source/warningAcknowledgements/{index}/range",
        "/plan/source/warningAcknowledgements/{index}/range/start",
        "/plan/source/warningAcknowledgements/{index}/range/end",
      ],
    },
    {
      code: "edit-plan.fragment-placement-mismatch",
      precedence: 16,
      stage: "completion-and-metadata-declarations",
      condition:
        "T0 fragment structure does not match the declared complete-draft placement",
      pathAuthority: ["/plan/placement"],
    },
    {
      code: "edit-plan.completion-declarations-mismatch",
      precedence: 17,
      stage: "completion-and-metadata-declarations",
      condition:
        "completion declaration tuple is missing, extra, unrelated, duplicated, or unequal",
      pathAuthority: [
        "/plan/completionDeclarations/{index}",
        "/plan/completionDeclarations/{index}/measureId",
        "/plan/completionDeclarations/{index}/completion",
        "/plan/completionDeclarations/{index}/completion/kind",
        "/plan/completionDeclarations/{index}/completion/expectedDuration",
        "/plan/completionDeclarations/{index}/completion/reason",
        "/plan/placement/completionDeclarations/{index}",
        "/plan/placement/completionDeclarations/{index}/measureId",
        "/plan/placement/completionDeclarations/{index}/completion",
        "/plan/placement/completionDeclarations/{index}/completion/kind",
        "/plan/placement/completionDeclarations/{index}/completion/expectedDuration",
        "/plan/placement/completionDeclarations/{index}/completion/reason",
      ],
    },
    {
      code: "edit-plan.section-metadata-mismatch",
      precedence: 18,
      stage: "completion-and-metadata-declarations",
      condition:
        "section declaration or well-shaped expected section metadata is missing, reordered, duplicated, or unequal",
      pathAuthority: [
        "/plan/placement/sectionDeclarations/{index}",
        "/plan/placement/sectionDeclarations/{index}/sourceSectionOrdinal",
        "/plan/placement/sectionDeclarations/{index}/voiceLeadingBoundary",
        "/plan/expectedLeftMetadata/{metadataField}",
        "/plan/expectedRightMetadata/{metadataField}",
      ],
    },
    {
      code: "edit-plan.recovered-chord-layout-loss-unacknowledged",
      precedence: 19,
      stage: "operation-laws",
      condition: "recovery layout-loss acknowledgement literal is not exact",
      pathAuthority: ["/plan/source/layoutLossAcknowledgement"],
    },
    {
      code: "edit-plan.recovered-chord-duration-mismatch",
      precedence: 20,
      stage: "operation-laws",
      condition:
        "caller duration nullability/value does not match the selected T0 duration branch",
      pathAuthority: ["/plan/source/callerDuration"],
    },
    {
      code: "edit-plan.duration-invalid",
      precedence: 21,
      stage: "operation-laws",
      condition: "duration is not a positive canonical reduced PPQ duration",
      pathAuthority: [
        "/plan/firstDuration",
        "/plan/secondDuration",
        "/plan/joinedDuration",
        "/plan/source/callerDuration",
      ],
    },
    {
      code: "edit-plan.duration-sum-mismatch",
      precedence: 22,
      stage: "operation-laws",
      condition:
        "declared exact split or join sum differs from source span sum",
      pathAuthority: ["/plan/secondDuration", "/plan/joinedDuration"],
    },
    {
      code: "edit-plan.event-content-mismatch",
      precedence: 23,
      stage: "operation-laws",
      condition:
        "join siblings differ in literal spelling-first chord or voicing content",
      pathAuthority: ["/plan/rightEventId"],
    },
    {
      code: "edit-plan.right-annotation-not-empty",
      precedence: 24,
      stage: "operation-laws",
      condition: "right join sibling annotation is not the empty string",
      pathAuthority: ["/plan/rightEventId"],
    },
    {
      code: "edit-plan.collection-limit-exceeded",
      precedence: 25,
      stage: "final-collection-and-timeline-limits",
      condition:
        "first final section, measure, event, or tracked-record excess",
      pathAuthority: ["/plan"],
    },
    {
      code: "edit-plan.timeline-limit-exceeded",
      precedence: 26,
      stage: "final-collection-and-timeline-limits",
      condition: "first exact final timeline sum beyond the domain maximum",
      pathAuthority: ["/plan"],
    },
    {
      code: "edit-plan.id-factory-failed",
      precedence: 27,
      stage: "stable-id-allocation",
      condition: "first required StableIdFactory.next call returns failure",
      pathAuthority: ["/plan"],
    },
    {
      code: "edit-plan.id-collision",
      precedence: 28,
      stage: "stable-id-allocation",
      condition: "first returned ID collides in the global reserved set",
      pathAuthority: ["/plan"],
    },
    {
      code: "edit-plan.structural-publication-refused",
      precedence: 29,
      stage: "f2-once",
      condition: "the single structural decode rejects the private candidate",
      pathAuthority: ["/candidate"],
    },
    {
      code: "edit-plan.semantic-publication-refused",
      precedence: 30,
      stage: "f3-once",
      condition: "the single semantic validation rejects the decoded candidate",
      pathAuthority: ["/candidate"],
    },
    {
      code: "edit-plan.history-refused",
      precedence: 31,
      stage: "bookmarks-history-and-atomic-publication",
      condition:
        "history retained-byte estimate is invalid or the entry cannot be retained",
      pathAuthority: ["/history"],
    },
  ]);

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
] = /* @__PURE__ */ Object.freeze([
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
  /* @__PURE__ */ Object.freeze(["command.payload_invalid"]);
const TARGET_MISSING_OUTER_CODES: readonly ["command.target_missing"] =
  /* @__PURE__ */ Object.freeze(["command.target_missing"]);
const DESTINATION_INVALID_OUTER_CODES: readonly [
  "command.destination_invalid",
] = /* @__PURE__ */ Object.freeze(["command.destination_invalid"]);
const ID_ALLOCATION_FAILED_OUTER_CODES: readonly [
  "command.id_allocation_failed",
] = /* @__PURE__ */ Object.freeze(["command.id_allocation_failed"]);
const STRUCTURAL_VALIDATION_FAILED_OUTER_CODES: readonly [
  "command.structural_validation_failed",
] = /* @__PURE__ */ Object.freeze(["command.structural_validation_failed"]);
const SEMANTIC_VALIDATION_FAILED_OUTER_CODES: readonly [
  "command.semantic_validation_failed",
] = /* @__PURE__ */ Object.freeze(["command.semantic_validation_failed"]);
const HISTORY_REFUSAL_OUTER_CODES: readonly [
  "history.entry_too_large",
  "history.byte_estimate_invalid",
] = /* @__PURE__ */ Object.freeze(["history.entry_too_large", "history.byte_estimate_invalid"]);

/** Exact inherited A0 history dependency outcome; the two outer codes do not commute. */
export const A0_U1_ATOMIC_EDIT_HISTORY_REFUSAL_POLICY = /* @__PURE__ */ Object.freeze({
  invalidEstimate: /* @__PURE__ */ Object.freeze({
    predicate: "not-a-nonnegative-safe-integer",
    outerCode: "history.byte_estimate_invalid",
    nestedCode: "edit-plan.history-refused",
    path: /* @__PURE__ */ Object.freeze(["history"] as const),
  }),
  oversizedEstimate: /* @__PURE__ */ Object.freeze({
    predicate: "valid-estimate-greater-than-retained-byte-maximum",
    maximum: MAX_HISTORY_RETAINED_BYTES,
    outerCode: "history.entry_too_large",
    nestedCode: "edit-plan.history-refused",
    path: /* @__PURE__ */ Object.freeze(["history"] as const),
  }),
});

export const A0_U1_ATOMIC_EDIT_ALLOWED_OUTER_CODES_BY_REFUSAL_CODE: Readonly<
  Record<
    AtomicEditPlanRefusalCode,
    readonly [
      AtomicEditPlanOuterRefusalCode,
      ...AtomicEditPlanOuterRefusalCode[],
    ]
  >
> = /* @__PURE__ */ Object.freeze({
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

/**
 * Exact inherited A0 envelope refusals. Descriptor-safe exact-shape validation
 * precedes them; they still precede snapshot, parser, law, and allocation work.
 */
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
] = /* @__PURE__ */ Object.freeze([
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

/**
 * The additive runner preserves the accepted meanings of every outer A0 work
 * counter. Index passes are complete and reusable; constructing a history row
 * is not history traversal, and bookmark repair counts calls rather than
 * rewritten records.
 */
export const A0_U1_ATOMIC_EDIT_OUTER_WORK_POLICY = /* @__PURE__ */ Object.freeze({
  indexPassesByOutcome: /* @__PURE__ */ Object.freeze({
    applyRefusalBeforeTargetResolution: /* @__PURE__ */ Object.freeze([] as const),
    applyRefusalFromTargetThroughF3: /* @__PURE__ */ Object.freeze(["before"] as const),
    applySuccessOrHistoryRefusal: /* @__PURE__ */ Object.freeze(["before", "after"] as const),
    undoOrRedo: /* @__PURE__ */ Object.freeze(["restored"] as const),
  }),
  indexVisitOrder: "section-then-measure-then-event-source-order",
  stableIdsIndexed: "one-per-indexed-section-measure-or-event-not-document",
  historyEntriesVisited: /* @__PURE__ */ Object.freeze({
    apply: 0,
    undoOrRedoAfterEntryResolution: 1,
  }),
  historyBytesEstimated: /* @__PURE__ */ Object.freeze({
    beforeValidEstimatorReturn: 0,
    afterValidEstimatorReturn: "exact-returned-nonnegative-safe-integer",
    validOversizeStillCounted: true,
  }),
  bookmarksRepaired: /* @__PURE__ */ Object.freeze({
    beforeSuccessfulF3: 0,
    applySuccessOrHistoryRefusal: 1,
    undoOrRedo: 0,
    unit: "repair-operation-not-rewritten-record",
  }),
  requestsCompared: 0,
  transportNotificationsCompared: 0,
  validationCalls: /* @__PURE__ */ Object.freeze({
    throughF2Refusal: 0,
    f3RefusalSuccessOrHistoryRefusal: 1,
    undoOrRedo: 0,
  }),
});

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
] = /* @__PURE__ */ Object.freeze([
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

export type AtomicEditPlanWorkCounterName =
  (typeof A0_U1_ATOMIC_EDIT_WORK_COUNTER_NAMES)[number];

/**
 * Input/domain limits above describe accepted values. These are counter
 * ceilings, so fields that enter a first-excess witness may be one larger.
 */
export const A0_U1_ATOMIC_EDIT_WORK_COUNTER_MAXIMA: Readonly<
  Record<AtomicEditPlanWorkCounterName, number>
> = /* @__PURE__ */ Object.freeze({
  structuralDecodeCalls: 1,
  semanticValidationCalls: 1,
  planNodesVisited: MAX_A0_U1_PLAN_NODE_RECORDS + 1,
  sourceCodePointsObserved: MAX_A0_U1_FRAGMENT_SOURCE_CODE_POINTS + 1,
  sourceUtf8BytesObserved: MAX_A0_U1_FRAGMENT_SOURCE_UTF8_BYTES + 1,
  quickEntrySnapshotFieldsCompared:
    MAX_A0_U1_QUICK_ENTRY_SNAPSHOT_FIELDS_COMPARED,
  quickEntryIssueCodesCompared: MAX_A0_U1_QUICK_ENTRY_ISSUE_CODES + 1,
  syntaxParseCalls: 1,
  warningAcknowledgementsCompared:
    MAX_A0_U1_RETAINED_WARNING_ACKNOWLEDGEMENTS + 1,
  insertableChordsExamined: MAX_A0_U1_INSERTABLE_CHORDS_EXAMINED,
  recoveryFieldsCompared: MAX_A0_U1_RECOVERY_FIELDS_COMPARED,
  draftSectionsVisited: MAX_A0_U1_FRAGMENT_SECTIONS + 1,
  draftMeasuresVisited: MAX_A0_U1_FRAGMENT_MEASURES + 1,
  draftEventsVisited: MAX_A0_U1_FRAGMENT_EVENTS + 1,
  completionDeclarationsVisited: MAX_A0_U1_COMPLETION_DECLARATIONS + 1,
  metadataFieldsCompared: MAX_A0_U1_METADATA_FIELDS_COMPARED,
  metadataCodePointsObserved: MAX_A0_U1_METADATA_CODE_POINTS_OBSERVED,
  exactBeatAdditions: MAX_A0_U1_EXACT_BEAT_ADDITIONS,
  exactBeatComparisons: MAX_A0_U1_EXACT_BEAT_COMPARISONS,
  idAllocationAttempts: MAX_A0_U1_ID_ALLOCATION_ATTEMPTS,
  idCollisionChecks: MAX_A0_U1_ID_ALLOCATION_ATTEMPTS,
  bookmarkRecordsExamined: MAX_A0_U1_BOOKMARK_RECORDS_EXAMINED,
  bookmarkRecordsRewritten: MAX_A0_U1_BOOKMARK_RECORDS_REWRITTEN,
  peakPlanNodeRecords: MAX_A0_U1_PLAN_NODE_RECORDS + 1,
  peakAllocatedIdRecords: MAX_A0_U1_ID_ALLOCATION_ATTEMPTS,
  peakDiagnosticRecords: MAX_A0_U1_RETAINED_DIAGNOSTICS,
});

export const A0_U1_ATOMIC_EDIT_FIRST_EXCESS_WORK_COUNTERS: readonly AtomicEditPlanWorkCounterName[] =
  /* @__PURE__ */ Object.freeze([
    "planNodesVisited",
    "sourceCodePointsObserved",
    "sourceUtf8BytesObserved",
    "quickEntryIssueCodesCompared",
    "warningAcknowledgementsCompared",
    "draftSectionsVisited",
    "draftMeasuresVisited",
    "draftEventsVisited",
    "completionDeclarationsVisited",
    "metadataCodePointsObserved",
  ]);

export const A0_U1_ATOMIC_EDIT_PLAN_TERMINATIONS: readonly [
  "complete",
  "input-refusal",
  "allocation-refusal",
  "publication-refusal",
  "history-refusal",
] = /* @__PURE__ */ Object.freeze([
  "complete",
  "input-refusal",
  "allocation-refusal",
  "publication-refusal",
  "history-refusal",
]);

export type AtomicEditPlanTermination =
  (typeof A0_U1_ATOMIC_EDIT_PLAN_TERMINATIONS)[number];

export type AtomicEditPlanWorkEvidence = Readonly<{
  structuralDecodeCalls: number;
  semanticValidationCalls: number;
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
  /** Ordered caller-owned metadata/reason code points, including first excess. */
  metadataCodePointsObserved: number;
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

export type AtomicEditPlanSuccessWorkEvidence = Readonly<
  Omit<
    AtomicEditPlanWorkEvidence,
    "structuralDecodeCalls" | "semanticValidationCalls" | "termination"
  > & {
    structuralDecodeCalls: 1;
    semanticValidationCalls: 1;
    termination: "complete";
  }
>;

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

/**
 * A QuickEntry snapshot still has to equal the state's stable target exactly.
 * Placement matching then resolves that accepted stable boundary against the
 * current sibling order. Equivalent boundary spellings are not compared by
 * structural identity. Every event/measure boundary must resolve within the
 * placement's declared parent.
 */
export const A0_U1_QUICK_ENTRY_TARGET_MATCH_POLICY = /* @__PURE__ */ Object.freeze({
  parentOwnership: "same-declared-parent-required",
  measure: /* @__PURE__ */ Object.freeze({
    "measure-start": "before-first-event-or-append-when-empty",
    "before-event": "before-that-event",
    "after-event": "before-next-event-or-append",
    "measure-end": "append",
  }),
  section: /* @__PURE__ */ Object.freeze({
    "section-start": "before-first-measure-or-append-when-empty",
    "before-measure": "before-that-measure",
    "after-measure": "before-next-measure-or-append",
    "section-end": "append",
  }),
  document: /* @__PURE__ */ Object.freeze({
    "document-start": "before-first-section-or-append-when-empty",
    "before-section": "before-that-section",
    "after-section": "before-next-section-or-append",
    "document-end": "append",
  }),
  placementSlots: /* @__PURE__ */ Object.freeze({
    intoMeasure:
      "resolved-before-event-sibling-id-equals-beforeEventId-or-append-equals-null",
    intoSection:
      "resolved-before-measure-sibling-id-equals-beforeMeasureId-or-append-equals-null",
    intoDocument:
      "resolved-before-section-sibling-id-equals-beforeSectionId-or-append-equals-null",
  }),
  completeDraftIntoEmptyMeasure: /* @__PURE__ */ Object.freeze({
    acceptedTargets: /* @__PURE__ */ Object.freeze(["measure-start", "measure-end"] as const),
    canonicalDestination: "append",
    beforeEventId: null,
  }),
});

export type AtomicEditPlanBoundaryRewrite = Readonly<{
  from: AtomicEditPlanBoundary;
  to: AtomicEditPlanBoundary;
}>;

export type AtomicEditPlanSelectionReplacement = Readonly<{
  fromEventId: ChordEventId;
  toEventId: ChordEventId;
}>;

export const A0_U1_ATOMIC_EDIT_PLAN_FOCUS_DERIVATION_ORDER: readonly [
  "selection-focus-event",
  "non-chart-insertion-target",
  "first-inserted-structural-ref",
  "chart",
] = /* @__PURE__ */ Object.freeze([
  "selection-focus-event",
  "non-chart-insertion-target",
  "first-inserted-structural-ref",
  "chart",
]);

type AtomicEditPlanSelectionFocusReceipt = Readonly<{
  focusPolicy: "selection-focus-event";
  focusTarget: Extract<UiFocusTarget, { kind: "event" }>;
}>;

type AtomicEditPlanInsertionFocusReceipt = Readonly<{
  focusPolicy: "non-chart-insertion-target";
  focusTarget: Extract<
    UiFocusTarget,
    { kind: "section" | "measure" | "event" }
  >;
}>;

type AtomicEditPlanEventInsertionFocusReceipt = Readonly<{
  focusPolicy: "non-chart-insertion-target";
  focusTarget: Extract<UiFocusTarget, { kind: "event" }>;
}>;

type AtomicEditPlanMeasureInsertionFocusReceipt = Readonly<{
  focusPolicy: "non-chart-insertion-target";
  focusTarget: Extract<UiFocusTarget, { kind: "measure" }>;
}>;

type AtomicEditPlanSectionInsertionFocusReceipt = Readonly<{
  focusPolicy: "non-chart-insertion-target";
  focusTarget: Extract<UiFocusTarget, { kind: "section" }>;
}>;

type AtomicEditPlanFirstInsertedEventFocusReceipt = Readonly<{
  focusPolicy: "first-inserted-structural-ref";
  focusTarget: Extract<UiFocusTarget, { kind: "event" }>;
}>;

type AtomicEditPlanFirstInsertedSectionFocusReceipt = Readonly<{
  focusPolicy: "first-inserted-structural-ref";
  focusTarget: Extract<UiFocusTarget, { kind: "section" }>;
}>;

type AtomicEditPlanChartFocusReceipt = Readonly<{
  focusPolicy: "chart";
  focusTarget: Extract<UiFocusTarget, { kind: "chart" }>;
}>;

export type InsertFragmentIntoMeasureFocusReceipt =
  | AtomicEditPlanSelectionFocusReceipt
  | AtomicEditPlanEventInsertionFocusReceipt;

export type InsertFragmentIntoSectionFocusReceipt =
  | AtomicEditPlanSelectionFocusReceipt
  | AtomicEditPlanMeasureInsertionFocusReceipt;

export type InsertFragmentIntoDocumentFocusReceipt =
  | AtomicEditPlanSelectionFocusReceipt
  | AtomicEditPlanSectionInsertionFocusReceipt;

export type InsertFragmentFocusReceipt =
  | InsertFragmentIntoMeasureFocusReceipt
  | InsertFragmentIntoSectionFocusReceipt
  | InsertFragmentIntoDocumentFocusReceipt;

export type SplitEventDurationFocusReceipt =
  | AtomicEditPlanSelectionFocusReceipt
  | AtomicEditPlanInsertionFocusReceipt
  | AtomicEditPlanFirstInsertedEventFocusReceipt;

export type SplitSectionFocusReceipt =
  | AtomicEditPlanSelectionFocusReceipt
  | AtomicEditPlanInsertionFocusReceipt
  | AtomicEditPlanFirstInsertedSectionFocusReceipt;

export type JoinEditPlanFocusReceipt =
  | AtomicEditPlanSelectionFocusReceipt
  | AtomicEditPlanInsertionFocusReceipt
  | AtomicEditPlanChartFocusReceipt;

export type AtomicEditPlanFocusReceipt =
  | InsertFragmentFocusReceipt
  | SplitEventDurationFocusReceipt
  | SplitSectionFocusReceipt
  | JoinEditPlanFocusReceipt;

type AtomicEditPlanRangeBoundaryRewrites =
  | readonly []
  | readonly [AtomicEditPlanBoundaryRewrite]
  | readonly [AtomicEditPlanBoundaryRewrite, AtomicEditPlanBoundaryRewrite];

type AtomicEditPlanPreservedSelectionReceipt = Readonly<{
  selectionPolicy: "preserve-existing";
  selectionReplacements: readonly [];
}>;

type AtomicEditPlanJoinSelectionReceipt =
  | AtomicEditPlanPreservedSelectionReceipt
  | Readonly<{
      selectionPolicy: "replace-removed-right-with-left-and-deduplicate";
      selectionReplacements: readonly [AtomicEditPlanSelectionReplacement];
    }>;

type AtomicEditPlanPreservedInsertionReceipt = Readonly<{
  insertionPolicy: "preserve-existing";
  insertionRewrite: null;
  insertionCleared: false;
}>;

type AtomicEditPlanMovedInsertionReceipt = Readonly<{
  insertionPolicy: "move-after-last-inserted";
  insertionRewrite: AtomicEditPlanBoundaryRewrite;
  insertionCleared: false;
}>;

/**
 * Honest branch for a valid null before insertion bookmark: the receipt
 * records the exact created after boundary and never fabricates a rewrite
 * source. `insertionCreated` is frozen to this branch only.
 */
type AtomicEditPlanCreatedInsertionReceipt = Readonly<{
  insertionPolicy: "create-after-last-inserted";
  insertionRewrite: null;
  insertionCreated: AtomicEditPlanBoundary;
  insertionCleared: false;
}>;

type AtomicEditPlanSpanEndInsertionReceipt = Readonly<{
  insertionPolicy: "rewrite-exact-span-end";
  insertionRewrite: AtomicEditPlanBoundaryRewrite;
  insertionCleared: false;
}>;

type AtomicEditPlanRepresentableInsertionReceipt = Readonly<{
  insertionPolicy: "rewrite-representable-boundaries";
  insertionRewrite: AtomicEditPlanBoundaryRewrite;
  insertionCleared: false;
}>;

type AtomicEditPlanClearedInsertionReceipt = Readonly<{
  insertionPolicy: "clear-unrepresentable-internal-event-boundary";
  insertionRewrite: null;
  insertionCleared: true;
}>;

type AtomicEditPlanPreservedRangeReceipt = Readonly<{
  rangePolicy: "preserve-existing";
  rangeBoundaryRewrites: readonly [];
  rangeCleared: false;
}>;

type AtomicEditPlanRewrittenRangeReceipt = Readonly<{
  rangePolicy: "rewrite-representable-boundaries";
  rangeBoundaryRewrites: Exclude<
    AtomicEditPlanRangeBoundaryRewrites,
    readonly []
  >;
  rangeCleared: false;
}>;

type AtomicEditPlanClearedRangeReceipt = Readonly<{
  rangePolicy: "clear-unrepresentable-internal-event-boundary";
  rangeBoundaryRewrites: readonly [];
  rangeCleared: true;
}>;

type InsertFragmentBookmarkReceiptForFocus<
  FocusReceipt extends InsertFragmentFocusReceipt,
> = Readonly<
  AtomicEditPlanPreservedSelectionReceipt &
    (
      | AtomicEditPlanMovedInsertionReceipt
      | AtomicEditPlanCreatedInsertionReceipt
    ) &
    AtomicEditPlanPreservedRangeReceipt & {
      operationPolicy: "preserve-selection-and-range-set-insertion-after-last-inserted";
    } & FocusReceipt
>;

export type InsertFragmentIntoMeasureBookmarkReceipt =
  InsertFragmentBookmarkReceiptForFocus<InsertFragmentIntoMeasureFocusReceipt>;

export type InsertFragmentIntoSectionBookmarkReceipt =
  InsertFragmentBookmarkReceiptForFocus<InsertFragmentIntoSectionFocusReceipt>;

export type InsertFragmentIntoDocumentBookmarkReceipt =
  InsertFragmentBookmarkReceiptForFocus<InsertFragmentIntoDocumentFocusReceipt>;

export type InsertFragmentBookmarkReceipt =
  | InsertFragmentIntoMeasureBookmarkReceipt
  | InsertFragmentIntoSectionBookmarkReceipt
  | InsertFragmentIntoDocumentBookmarkReceipt;

export type SplitEventDurationBookmarkReceipt = Readonly<
  AtomicEditPlanPreservedSelectionReceipt &
    (
      | AtomicEditPlanPreservedInsertionReceipt
      | AtomicEditPlanSpanEndInsertionReceipt
    ) &
    (
      AtomicEditPlanPreservedRangeReceipt | AtomicEditPlanRewrittenRangeReceipt
    ) & {
      operationPolicy: "preserve-original-selection-rewrite-original-span-end-to-second";
    } & SplitEventDurationFocusReceipt
>;

export type JoinEventDurationsBookmarkReceipt = Readonly<
  AtomicEditPlanJoinSelectionReceipt &
    (
      | AtomicEditPlanPreservedInsertionReceipt
      | AtomicEditPlanSpanEndInsertionReceipt
      | AtomicEditPlanClearedInsertionReceipt
    ) &
    (
      | AtomicEditPlanPreservedRangeReceipt
      | AtomicEditPlanRewrittenRangeReceipt
      | AtomicEditPlanClearedRangeReceipt
    ) & {
      operationPolicy: "replace-removed-right-selection-with-left-clear-unrepresentable-range";
    } & JoinEditPlanFocusReceipt
>;

export type SplitSectionBookmarkReceipt = Readonly<
  AtomicEditPlanPreservedSelectionReceipt &
    (
      | AtomicEditPlanPreservedInsertionReceipt
      | AtomicEditPlanRepresentableInsertionReceipt
    ) &
    (
      AtomicEditPlanPreservedRangeReceipt | AtomicEditPlanRewrittenRangeReceipt
    ) & {
      operationPolicy: "preserve-node-identities-rewrite-source-section-end-to-suffix";
    } & SplitSectionFocusReceipt
>;

export type JoinSectionsRightStartReceipt =
  | Readonly<{
      rightSectionWasEmpty: false;
      rightSectionFirstMeasureId: MeasureId;
      rightSectionStartRewrite: Readonly<{
        from: Readonly<{ kind: "section-start"; sectionId: SectionId }>;
        to: Readonly<{ kind: "before-measure"; measureId: MeasureId }>;
      }>;
    }>
  | Readonly<{
      rightSectionWasEmpty: true;
      rightSectionFirstMeasureId: null;
      rightSectionStartRewrite: Readonly<{
        from: Readonly<{ kind: "section-start"; sectionId: SectionId }>;
        to: Readonly<{ kind: "section-end"; sectionId: SectionId }>;
      }>;
    }>;

export type JoinSectionsBookmarkReceipt = Readonly<
  AtomicEditPlanPreservedSelectionReceipt &
    (
      | AtomicEditPlanPreservedInsertionReceipt
      | AtomicEditPlanRepresentableInsertionReceipt
    ) &
    (
      AtomicEditPlanPreservedRangeReceipt | AtomicEditPlanRewrittenRangeReceipt
    ) & {
      operationPolicy: "preserve-measure-event-identities-map-internal-edge-to-first-measure-or-surviving-end";
    } & JoinEditPlanFocusReceipt &
    JoinSectionsRightStartReceipt
>;

export type AtomicEditPlanBookmarkReceipt =
  | InsertFragmentBookmarkReceipt
  | SplitEventDurationBookmarkReceipt
  | JoinEventDurationsBookmarkReceipt
  | SplitSectionBookmarkReceipt
  | JoinSectionsBookmarkReceipt;

export const A0_U1_ATOMIC_EDIT_PLAN_BOOKMARK_POLICIES = /* @__PURE__ */ Object.freeze({
  insertFragment:
    "preserve-selection-and-range-set-insertion-after-last-inserted",
  splitEventDuration:
    "preserve-original-selection-rewrite-original-span-end-to-second",
  joinEventDurations:
    "replace-removed-right-selection-with-left-clear-unrepresentable-range",
  splitSection: "preserve-node-identities-rewrite-source-section-end-to-suffix",
  joinSections:
    "preserve-measure-event-identities-map-internal-edge-to-first-measure-or-surviving-end",
});

export type AtomicEditPlanFragmentSectionIdentity = Readonly<{
  kind: "section";
  id: SectionId;
  source: Readonly<{
    kind: "fragment-section";
    sourceSectionOrdinal: number;
  }>;
}>;

export type AtomicEditPlanSplitSectionIdentity = Readonly<{
  kind: "section";
  id: SectionId;
  source: Readonly<{
    kind: "split-section-suffix";
    sourceSectionId: SectionId;
  }>;
}>;

export type AtomicEditPlanFragmentMeasureIdentity = Readonly<{
  kind: "measure";
  id: MeasureId;
  source: Readonly<{
    kind: "fragment-measure";
    sourceSectionOrdinal: number;
    sourceMeasureOrdinal: number;
  }>;
}>;

export type AtomicEditPlanFragmentEventIdentity = Readonly<{
  kind: "event";
  id: ChordEventId;
  source: Readonly<{
    kind: "fragment-event";
    sourceEventOrdinal: number;
  }>;
}>;

export type AtomicEditPlanRecoveredChordIdentity = Readonly<{
  kind: "event";
  id: ChordEventId;
  source: Readonly<{
    kind: "recovered-chord";
    selectedGlobalOrdinal: number;
  }>;
}>;

export type AtomicEditPlanSplitEventSecondIdentity = Readonly<{
  kind: "event";
  id: ChordEventId;
  source: Readonly<{
    kind: "split-event-second";
    sourceEventId: ChordEventId;
  }>;
}>;

export type AtomicEditPlanAllocatedIdentity =
  | AtomicEditPlanFragmentSectionIdentity
  | AtomicEditPlanSplitSectionIdentity
  | AtomicEditPlanFragmentMeasureIdentity
  | AtomicEditPlanFragmentEventIdentity
  | AtomicEditPlanRecoveredChordIdentity
  | AtomicEditPlanSplitEventSecondIdentity;

export type AtomicEditPlanRemovedSectionIdentity = Readonly<{
  kind: "section";
  id: SectionId;
}>;

export type AtomicEditPlanRemovedEventIdentity = Readonly<{
  kind: "event";
  id: ChordEventId;
}>;

export type AtomicEditPlanRemovedIdentity =
  AtomicEditPlanRemovedSectionIdentity | AtomicEditPlanRemovedEventIdentity;

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

type AtomicEditPlanReceiptBase = Readonly<{
  schema: typeof A0_U1_ATOMIC_EDIT_PLAN_RECEIPT_SCHEMA;
  commandKind: "apply-edit-plan";
  commandId: string;
  documentId: DocumentId;
  baseRevision: number;
  committedRevision: number;
  quickEntryDisposition: "clear-to-idle-at-committed-revision";
  historyEntriesAppended: 1;
  effects: readonly [
    "queue-recovery",
    "compile-playback-plan",
    "restore-focus",
    "announce",
  ];
  work: AtomicEditPlanSuccessWorkEvidence;
}>;

type AtomicEditPlanCompleteDraftIntoMeasureAllocations = readonly [
  AtomicEditPlanFragmentEventIdentity,
  ...AtomicEditPlanFragmentEventIdentity[],
];

/**
 * The first row is a measure and all later rows follow exact T0 structural
 * preorder. The type narrows the identity family; the grouped measure/event
 * preorder remains a runtime law.
 */
type AtomicEditPlanCompleteDraftIntoSectionAllocations = readonly [
  AtomicEditPlanFragmentMeasureIdentity,
  ...(
    AtomicEditPlanFragmentMeasureIdentity | AtomicEditPlanFragmentEventIdentity
  )[],
];

/**
 * The first row is a section and all later rows follow exact T0 structural
 * preorder. Section/measure/event grouping remains a runtime law.
 */
type AtomicEditPlanCompleteDraftIntoDocumentAllocations = readonly [
  AtomicEditPlanFragmentSectionIdentity,
  ...(
    | AtomicEditPlanFragmentSectionIdentity
    | AtomicEditPlanFragmentMeasureIdentity
    | AtomicEditPlanFragmentEventIdentity
  )[],
];

export type CompleteDraftIntoMeasureEditPlanReceipt = Readonly<
  AtomicEditPlanReceiptBase & {
    planKind: "insert-fragment";
    insertLane: "complete-draft";
    placementKind: "into-measure";
    allocatedIdentities: AtomicEditPlanCompleteDraftIntoMeasureAllocations;
    removedIdentities: readonly [];
    survivorId: null;
    insertSource: Extract<
      AtomicEditPlanInsertSourceReceipt,
      { kind: "complete-draft" }
    >;
    completionMeasureIds: readonly [MeasureId];
    timelineDisposition: "splice-source-order-at-declared-boundary";
    bookmarks: InsertFragmentIntoMeasureBookmarkReceipt;
  }
>;

export type CompleteDraftIntoSectionEditPlanReceipt = Readonly<
  AtomicEditPlanReceiptBase & {
    planKind: "insert-fragment";
    insertLane: "complete-draft";
    placementKind: "into-section";
    allocatedIdentities: AtomicEditPlanCompleteDraftIntoSectionAllocations;
    removedIdentities: readonly [];
    survivorId: null;
    insertSource: Extract<
      AtomicEditPlanInsertSourceReceipt,
      { kind: "complete-draft" }
    >;
    completionMeasureIds: readonly [];
    timelineDisposition: "splice-source-order-at-declared-boundary";
    bookmarks: InsertFragmentIntoSectionBookmarkReceipt;
  }
>;

export type CompleteDraftIntoDocumentEditPlanReceipt = Readonly<
  AtomicEditPlanReceiptBase & {
    planKind: "insert-fragment";
    insertLane: "complete-draft";
    placementKind: "into-document";
    allocatedIdentities: AtomicEditPlanCompleteDraftIntoDocumentAllocations;
    removedIdentities: readonly [];
    survivorId: null;
    insertSource: Extract<
      AtomicEditPlanInsertSourceReceipt,
      { kind: "complete-draft" }
    >;
    completionMeasureIds: readonly [];
    timelineDisposition: "splice-source-order-at-declared-boundary";
    bookmarks: InsertFragmentIntoDocumentBookmarkReceipt;
  }
>;

export type RecoveredChordIntoMeasureEditPlanReceipt = Readonly<
  AtomicEditPlanReceiptBase & {
    planKind: "insert-fragment";
    insertLane: "recovered-chord";
    placementKind: "into-measure";
    allocatedIdentities: readonly [AtomicEditPlanRecoveredChordIdentity];
    removedIdentities: readonly [];
    survivorId: null;
    insertSource: Extract<
      AtomicEditPlanInsertSourceReceipt,
      { kind: "recovered-chord" }
    >;
    completionMeasureIds: readonly [MeasureId];
    timelineDisposition: "insert-one-recovered-chord-at-declared-boundary";
    bookmarks: InsertFragmentIntoMeasureBookmarkReceipt;
  }
>;

export type SplitEventDurationEditPlanReceipt = Readonly<
  AtomicEditPlanReceiptBase & {
    planKind: "split-event-duration";
    insertLane: null;
    placementKind: null;
    allocatedIdentities: readonly [AtomicEditPlanSplitEventSecondIdentity];
    removedIdentities: readonly [];
    survivorId: ChordEventId;
    insertSource: null;
    completionMeasureIds: readonly [MeasureId];
    timelineDisposition: "replace-one-span-with-two-exact-sum-spans";
    bookmarks: SplitEventDurationBookmarkReceipt;
  }
>;

export type JoinEventDurationsEditPlanReceipt = Readonly<
  AtomicEditPlanReceiptBase & {
    planKind: "join-event-durations";
    insertLane: null;
    placementKind: null;
    allocatedIdentities: readonly [];
    removedIdentities: readonly [AtomicEditPlanRemovedEventIdentity];
    survivorId: ChordEventId;
    insertSource: null;
    completionMeasureIds: readonly [MeasureId];
    timelineDisposition: "replace-two-equal-content-spans-with-one-exact-sum-span";
    bookmarks: JoinEventDurationsBookmarkReceipt;
  }
>;

export type SplitSectionEditPlanReceipt = Readonly<
  AtomicEditPlanReceiptBase & {
    planKind: "split-section";
    insertLane: null;
    placementKind: null;
    allocatedIdentities: readonly [AtomicEditPlanSplitSectionIdentity];
    removedIdentities: readonly [];
    survivorId: SectionId;
    insertSource: null;
    completionMeasureIds: readonly [];
    timelineDisposition: "preserve-flattened-event-order-and-durations";
    bookmarks: SplitSectionBookmarkReceipt;
  }
>;

export type JoinSectionsEditPlanReceipt = Readonly<
  AtomicEditPlanReceiptBase & {
    planKind: "join-sections";
    insertLane: null;
    placementKind: null;
    allocatedIdentities: readonly [];
    removedIdentities: readonly [AtomicEditPlanRemovedSectionIdentity];
    survivorId: SectionId;
    insertSource: null;
    completionMeasureIds: readonly [];
    timelineDisposition: "preserve-flattened-event-order-and-durations";
    bookmarks: JoinSectionsBookmarkReceipt;
  }
>;

/** Proposed additive success detail; only the source-only runner below exposes it. */
export type AtomicEditPlanReceipt =
  | CompleteDraftIntoMeasureEditPlanReceipt
  | CompleteDraftIntoSectionEditPlanReceipt
  | CompleteDraftIntoDocumentEditPlanReceipt
  | RecoveredChordIntoMeasureEditPlanReceipt
  | SplitEventDurationEditPlanReceipt
  | JoinEventDurationsEditPlanReceipt
  | SplitSectionEditPlanReceipt
  | JoinSectionsEditPlanReceipt;

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

/** Proposed state-only history ports over the widened history-entry union. */
export type AtomicEditPlanHistoryCommandRequest = Readonly<{
  state: AtomicEditPlanAppState;
}>;

type AtomicEditPlanHistorySuccess<Outcome extends "undone" | "redone"> =
  Readonly<
    Omit<AtomicEditPlanBaseSuccess, "outcome"> & {
      outcome: Outcome;
    }
  >;

export type AtomicEditPlanHistoryTransitionResult<
  Outcome extends "undone" | "redone",
> = AtomicEditPlanHistorySuccess<Outcome> | AtomicEditPlanBaseFailure;

export type UndoAtomicEditPlanHistoryResult =
  AtomicEditPlanHistoryTransitionResult<"undone">;

export type RedoAtomicEditPlanHistoryResult =
  AtomicEditPlanHistoryTransitionResult<"redone">;

export type UndoAtomicEditPlanHistory = (
  request: AtomicEditPlanHistoryCommandRequest,
) => UndoAtomicEditPlanHistoryResult;

export type RedoAtomicEditPlanHistory = (
  request: AtomicEditPlanHistoryCommandRequest,
) => RedoAtomicEditPlanHistoryResult;

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
] = /* @__PURE__ */ Object.freeze([
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

export const A0_U1_ATOMIC_EDIT_PLAN_TRANSPOSITION_POLICY = /* @__PURE__ */ Object.freeze({
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

export const A0_U1_T0_NEW_MEASURE_COMPLETION_POLICY = /* @__PURE__ */ Object.freeze({
  zeroEvents: "empty",
  nonemptySuccessfulClosedMeasure: "complete",
});

export const A0_U1_ATOMIC_EDIT_PLAN_ID_ENTROPY_POLICY = /* @__PURE__ */ Object.freeze({
  factoryCallsOccurOnlyAfterOperationLocalPreflight: true,
  operationLocalPreflight:
    "shape-snapshot-parser-declarations-operation-laws-and-final-bounds",
  postAllocationRefusalsMayConsumeEntropy: /* @__PURE__ */ Object.freeze([
    "f2",
    "f3",
    "history",
  ] as const),
  allocationOrder: "source-structural-preorder",
  collisionScope: "all-stable-id-kinds-plus-document",
  retryOnFailureOrCollision: false,
  partialCandidatePublication: false,
  partialRemapPublication: false,
  entropyConsumptionRollbackClaimed: false,
  reason:
    "F2, F3, history, factory failure, and collision can refuse after one or more StableIdFactory.next calls; the interface has no reservation or rollback operation, so application state remains unchanged while factory entropy may advance.",
});

/** Runtime exact-object validators consume this declarative key authority. */
export const A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS = /* @__PURE__ */ Object.freeze({
  envelope: /* @__PURE__ */ Object.freeze([
    "id",
    "label",
    "expectedDocumentId",
    "expectedRevision",
    "logicalTimeMs",
    "coalescing",
    "kind",
    "plan",
  ]),
  completeDraftPlan: /* @__PURE__ */ Object.freeze([
    "kind",
    "source",
    "placement",
    "voicingPolicy",
  ]),
  recoveredChordPlan: /* @__PURE__ */ Object.freeze([
    "kind",
    "source",
    "placement",
    "voicingPolicy",
  ]),
  completeDraftSource: /* @__PURE__ */ Object.freeze([
    "kind",
    "quickEntrySnapshot",
    "warningAcknowledgements",
  ]),
  recoveredChordSource: /* @__PURE__ */ Object.freeze([
    "kind",
    "quickEntrySnapshot",
    "selectedGlobalOrdinal",
    "layoutLossAcknowledgement",
    "callerDuration",
  ]),
  quickEntrySnapshot: /* @__PURE__ */ Object.freeze([
    "sourceText",
    "baseRevision",
    "target",
    "issueCodes",
    "expectedStatus",
    "expectedLane",
  ]),
  documentBoundary: /* @__PURE__ */ Object.freeze(["kind"]),
  sectionBoundary: /* @__PURE__ */ Object.freeze(["kind", "sectionId"]),
  measureBoundary: /* @__PURE__ */ Object.freeze(["kind", "measureId"]),
  eventBoundary: /* @__PURE__ */ Object.freeze(["kind", "eventId"]),
  completeDraftIntoMeasurePlacement: /* @__PURE__ */ Object.freeze([
    "kind",
    "measureId",
    "beforeEventId",
    "layoutDisposition",
    "completionDeclarations",
  ]),
  recoveredChordIntoMeasurePlacement: /* @__PURE__ */ Object.freeze([
    "kind",
    "measureId",
    "beforeEventId",
    "layoutDisposition",
    "completionDeclarations",
  ]),
  intoSectionPlacement: /* @__PURE__ */ Object.freeze([
    "kind",
    "sectionId",
    "beforeMeasureId",
    "layoutDisposition",
    "completionDeclarations",
  ]),
  intoDocumentPlacement: /* @__PURE__ */ Object.freeze([
    "kind",
    "beforeSectionId",
    "layoutDisposition",
    "sectionDeclarations",
    "completionDeclarations",
  ]),
  warningAcknowledgement: /* @__PURE__ */ Object.freeze(["code", "range"]),
  sourceRange: /* @__PURE__ */ Object.freeze(["start", "end"]),
  beatDuration: /* @__PURE__ */ Object.freeze(["numerator", "denominator"]),
  measureCompletionEmpty: /* @__PURE__ */ Object.freeze(["kind"]),
  measureCompletionComplete: /* @__PURE__ */ Object.freeze(["kind"]),
  measureCompletionPickupOrIncomplete: /* @__PURE__ */ Object.freeze([
    "kind",
    "expectedDuration",
    "reason",
  ]),
  keyContext: /* @__PURE__ */ Object.freeze(["tonic", "mode"]),
  spelledPitchClass: /* @__PURE__ */ Object.freeze(["step", "alter"]),
  completionDeclaration: /* @__PURE__ */ Object.freeze(["measureId", "completion"]),
  sectionDeclaration: /* @__PURE__ */ Object.freeze([
    "sourceSectionOrdinal",
    "voiceLeadingBoundary",
  ]),
  sectionMetadata: /* @__PURE__ */ Object.freeze([
    "name",
    "annotation",
    "keyOverride",
    "voiceLeadingBoundary",
  ]),
  splitEventDurationPlan: /* @__PURE__ */ Object.freeze([
    "kind",
    "eventId",
    "firstDuration",
    "secondDuration",
    "completionDeclarations",
    "identityPolicy",
    "contentPolicy",
    "annotationPolicy",
  ]),
  joinEventDurationsPlan: /* @__PURE__ */ Object.freeze([
    "kind",
    "leftEventId",
    "rightEventId",
    "joinedDuration",
    "completionDeclarations",
    "identityPolicy",
    "contentPolicy",
    "annotationPolicy",
  ]),
  splitSectionPlan: /* @__PURE__ */ Object.freeze([
    "kind",
    "sectionId",
    "beforeMeasureId",
    "newSectionMetadata",
    "completionDeclarations",
    "identityPolicy",
    "measurePolicy",
  ]),
  joinSectionsPlan: /* @__PURE__ */ Object.freeze([
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
  newEventAutoVoicing: /* @__PURE__ */ Object.freeze([
    "mode",
    "family",
    "voiceCount",
    "range",
    "bassPolicy",
  ]),
  newEventAutoVoicingRange: /* @__PURE__ */ Object.freeze(["lowMidi", "highMidi"]),
  receiptBase: /* @__PURE__ */ Object.freeze([
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
  ]),
  receiptOperation: /* @__PURE__ */ Object.freeze([
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
  ]),
  completeDraftInsertSourceReceipt: /* @__PURE__ */ Object.freeze([
    "kind",
    "parserOutcome",
    "quickEntrySnapshotMatched",
    "canonicalTargetMatched",
    "acknowledgedWarningCount",
  ]),
  recoveredChordInsertSourceReceipt: /* @__PURE__ */ Object.freeze([
    "kind",
    "parserOutcome",
    "quickEntrySnapshotMatched",
    "canonicalTargetMatched",
    "selectedGlobalOrdinal",
    "selectedRange",
    "durationSource",
    "siblingsApplied",
    "layoutLossAcknowledged",
  ]),
  bookmarkReceiptCore: /* @__PURE__ */ Object.freeze([
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
  ]),
  joinSectionsBookmarkReceiptExtension: /* @__PURE__ */ Object.freeze([
    "rightSectionWasEmpty",
    "rightSectionFirstMeasureId",
    "rightSectionStartRewrite",
  ]),
  /**
   * Conditional creation-branch extension: `insertionCreated` appears only on
   * an insert receipt whose before insertion bookmark was null, ordered
   * immediately after `insertionRewrite`.
   */
  createdInsertionBookmarkReceiptExtension: /* @__PURE__ */ Object.freeze([
    "insertionCreated",
  ]),
  boundaryRewrite: /* @__PURE__ */ Object.freeze(["from", "to"]),
  selectionReplacement: /* @__PURE__ */ Object.freeze(["fromEventId", "toEventId"]),
  focusTargetChart: /* @__PURE__ */ Object.freeze(["kind"]),
  focusTargetSection: /* @__PURE__ */ Object.freeze(["kind", "sectionId"]),
  focusTargetMeasure: /* @__PURE__ */ Object.freeze(["kind", "measureId"]),
  focusTargetEvent: /* @__PURE__ */ Object.freeze(["kind", "eventId"]),
  allocatedIdentity: /* @__PURE__ */ Object.freeze(["kind", "id", "source"]),
  fragmentSectionIdentitySource: /* @__PURE__ */ Object.freeze([
    "kind",
    "sourceSectionOrdinal",
  ]),
  splitSectionIdentitySource: /* @__PURE__ */ Object.freeze(["kind", "sourceSectionId"]),
  fragmentMeasureIdentitySource: /* @__PURE__ */ Object.freeze([
    "kind",
    "sourceSectionOrdinal",
    "sourceMeasureOrdinal",
  ]),
  fragmentEventIdentitySource: /* @__PURE__ */ Object.freeze(["kind", "sourceEventOrdinal"]),
  recoveredChordIdentitySource: /* @__PURE__ */ Object.freeze([
    "kind",
    "selectedGlobalOrdinal",
  ]),
  splitEventSecondIdentitySource: /* @__PURE__ */ Object.freeze(["kind", "sourceEventId"]),
  removedIdentity: /* @__PURE__ */ Object.freeze(["kind", "id"]),
  diagnostic: /* @__PURE__ */ Object.freeze([
    "code",
    "owner",
    "path",
    "sourceRange",
    "syntaxCode",
    "observed",
    "maximum",
  ]),
  workEvidence: /* @__PURE__ */ Object.freeze([
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
  ]),
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
] = /* @__PURE__ */ Object.freeze([
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
