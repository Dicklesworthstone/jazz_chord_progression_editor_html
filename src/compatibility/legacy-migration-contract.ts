import {
  MAX_DOCUMENT_CHORD_EVENTS,
  MAX_DOCUMENT_SECTIONS,
  MAX_JSON_NESTING_DEPTH,
  MAX_LONG_TEXT_CODE_POINTS,
  MAX_SECTION_MEASURES,
  MAX_SHORT_TEXT_CODE_POINTS,
  MAX_UTF8_IMPORT_BYTES,
  type AnyStableId,
  type DomainPath,
  type PathRefusal,
  type ProgressionDocumentShapeV2,
  type StableIdFactory,
  type StableIdKind,
} from "../domain";
import type { ParseChordSymbol, ResolveChord } from "../theory";

/** Versioned public contract for conservative unversioned-legacy migration. */
export const LEGACY_MIGRATION_CONTRACT_SCHEMA =
  "changes.compatibility.legacy-migration-contract.v1";
export const LEGACY_MIGRATION_CANDIDATE_SCHEMA =
  "changes.compatibility.legacy-migration-candidate.v1";
export const LEGACY_MIGRATION_REPORT_SCHEMA =
  "changes.compatibility.legacy-migration-report.v1";
export const LEGACY_MIGRATION_POLICY_ID = "changes.legacy-migration";
export const LEGACY_MIGRATION_POLICY_VERSION = 1;

export const LEGACY_MIGRATION_OPERATION_NAMES = Object.freeze([
  "migrateLegacyJson",
] as const);

export type LegacyMigrationOperationName =
  (typeof LEGACY_MIGRATION_OPERATION_NAMES)[number];

/** C0 inherits the reviewed hostile-input and document collection ceilings. */
export const MAX_LEGACY_UTF8_BYTES = MAX_UTF8_IMPORT_BYTES;
export const MAX_LEGACY_JSON_DEPTH = MAX_JSON_NESTING_DEPTH;
export const MAX_LEGACY_SECTIONS = MAX_DOCUMENT_SECTIONS;
export const MAX_LEGACY_CHORDS_PER_SECTION = MAX_SECTION_MEASURES;
export const MAX_LEGACY_CHORDS = MAX_DOCUMENT_CHORD_EVENTS;
export const MIN_TRUSTED_LEGACY_NOTES = 1;
export const MAX_TRUSTED_LEGACY_NOTES = 16;
export const MAX_LEGACY_SOURCE_PROPERTIES = 262_144;
export const MAX_LEGACY_REPORT_ITEMS = 65_536;
export const MAX_LEGACY_SHORT_TEXT_CODE_POINTS = MAX_SHORT_TEXT_CODE_POINTS;
export const MAX_LEGACY_LONG_TEXT_CODE_POINTS = MAX_LONG_TEXT_CODE_POINTS;

export const LEGACY_PITCH_CLASS_PATTERN_SOURCE =
  "^[A-G](?:bb|##|b|#)?$";
export const LEGACY_SCIENTIFIC_PITCH_PATTERN_SOURCE =
  "^[A-G](?:bb|##|b|#)?(?:0|-?[1-9][0-9]*)$";

export const LEGACY_DOCUMENT_DEFAULTS = Object.freeze({
  title: "Imported legacy progression",
  description: "",
  meter: Object.freeze({ beatsPerBar: 4, beatUnit: 4 }),
  tempoBpm: 120,
  key: null,
  playback: Object.freeze({
    instrumentId: "mellow-keys",
    masterVolume: 0.8,
    reverbAmount: 0.2,
    countInBars: 0,
  }),
  sectionNamePrefix: "Section ",
  sectionAnnotation: "",
  sectionKeyOverride: null,
  sectionVoiceLeadingBoundary: "reset",
  eventDuration: Object.freeze({ numerator: 4, denominator: 1 }),
  measureCompletion: "complete",
  eventAnnotation: "",
} as const);

export const LEGACY_AUTO_VOICING_DEFAULT = Object.freeze({
  mode: "auto",
  family: "balanced",
  voiceCount: 4,
  range: Object.freeze({ lowMidi: 48, highMidi: 84 }),
  bassPolicy: "generated",
} as const);

/** Ordered, exhaustive, exact-match type vocabulary from the reviewed plan. */
export const LEGACY_TYPE_SUFFIX_ENTRIES = Object.freeze([
  Object.freeze({ type: "major", suffix: "" }),
  Object.freeze({ type: "minor", suffix: "m" }),
  Object.freeze({ type: "dim", suffix: "dim" }),
  Object.freeze({ type: "aug", suffix: "aug" }),
  Object.freeze({ type: "sus2", suffix: "sus2" }),
  Object.freeze({ type: "sus4", suffix: "sus4" }),
  Object.freeze({ type: "6", suffix: "6" }),
  Object.freeze({ type: "m6", suffix: "m6" }),
  Object.freeze({ type: "maj7", suffix: "maj7" }),
  Object.freeze({ type: "7", suffix: "7" }),
  Object.freeze({ type: "m7", suffix: "m7" }),
  Object.freeze({ type: "mMaj7", suffix: "mMaj7" }),
  Object.freeze({ type: "m7b5", suffix: "m7b5" }),
  Object.freeze({ type: "dim7", suffix: "dim7" }),
  Object.freeze({ type: "aug7", suffix: "7#5" }),
  Object.freeze({ type: "augMaj7", suffix: "aug(maj7)" }),
  Object.freeze({ type: "maj9", suffix: "maj9" }),
  Object.freeze({ type: "9", suffix: "9" }),
  Object.freeze({ type: "m9", suffix: "m9" }),
  Object.freeze({ type: "11", suffix: "11" }),
  Object.freeze({ type: "m11", suffix: "m11" }),
  Object.freeze({ type: "13", suffix: "13" }),
  Object.freeze({ type: "maj13", suffix: "maj13" }),
  Object.freeze({ type: "m13", suffix: "m13" }),
  Object.freeze({ type: "7b9", suffix: "7b9" }),
  Object.freeze({ type: "7#9", suffix: "7#9" }),
  Object.freeze({ type: "7#11", suffix: "7#11" }),
  Object.freeze({ type: "7b13", suffix: "7b13" }),
  Object.freeze({ type: "7b5", suffix: "7b5" }),
  Object.freeze({ type: "7#5", suffix: "7#5" }),
  Object.freeze({ type: "alt", suffix: "7alt" }),
  Object.freeze({ type: "maj7#11", suffix: "maj7#11" }),
  Object.freeze({ type: "m9b5", suffix: "m9b5" }),
  Object.freeze({ type: "9sus4", suffix: "9sus4" }),
  Object.freeze({ type: "13sus4", suffix: "13sus4" }),
  Object.freeze({ type: "7b9sus4", suffix: "7b9sus4" }),
  Object.freeze({ type: "m6/9", suffix: "m6/9" }),
  Object.freeze({ type: "6/9", suffix: "6/9" }),
  Object.freeze({ type: "9b5", suffix: "9b5" }),
] as const);

export type LegacyChordType =
  (typeof LEGACY_TYPE_SUFFIX_ENTRIES)[number]["type"];

export const LEGACY_ALTERATION_FLAG_ENTRIES = Object.freeze([
  Object.freeze({ field: "b5", modifier: "b5" }),
  Object.freeze({ field: "s5", modifier: "#5" }),
  Object.freeze({ field: "b9", modifier: "b9" }),
  Object.freeze({ field: "s9", modifier: "#9" }),
  Object.freeze({ field: "s11", modifier: "#11" }),
  Object.freeze({ field: "b13", modifier: "b13" }),
] as const);

export type LegacyAlterationFlag =
  (typeof LEGACY_ALTERATION_FLAG_ENTRIES)[number]["field"];

export const LEGACY_DOCUMENT_FIELDS = Object.freeze([
  "name",
  "description",
  "sections",
] as const);
export const LEGACY_SECTION_FIELDS = Object.freeze([
  "name",
  "annotation",
  "chords",
  "collapsed",
  "isEditingName",
  "editNameValue",
] as const);
export const LEGACY_CHORD_FIELDS = Object.freeze([
  "name",
  "root",
  "type",
  "bass",
  "notes",
  "b5",
  "s5",
  "b9",
  "s9",
  "s11",
  "b13",
  "tensions",
  "annotation",
  "voicingStyle",
  "baseOctave",
  "octaveSpan",
  "density",
] as const);
export const LEGACY_UI_ONLY_FIELDS = Object.freeze([
  "collapsed",
  "isEditingName",
  "editNameValue",
] as const);
export const LEGACY_VOICING_METADATA_FIELDS = Object.freeze([
  "voicingStyle",
  "baseOctave",
  "octaveSpan",
  "density",
] as const);

export const LEGACY_REPORT_GROUPS = Object.freeze([
  "preserved",
  "canonicalized",
  "custom",
  "ignored",
  "rejected",
] as const);

export type LegacyReportGroup = (typeof LEGACY_REPORT_GROUPS)[number];

export const LEGACY_PRESERVED_CODES = Object.freeze([
  "legacy.preserved.document_name",
  "legacy.preserved.document_description",
  "legacy.preserved.section_name",
  "legacy.preserved.annotation",
  "legacy.preserved.symbol",
  "legacy.preserved.manual_notes",
] as const);

export const LEGACY_CANONICALIZED_CODES = Object.freeze([
  "legacy.canonicalized.document_title_default",
  "legacy.canonicalized.document_description_default",
  "legacy.canonicalized.section_name_default",
  "legacy.canonicalized.section_annotation_default",
  "legacy.canonicalized.event_annotation_default",
  "legacy.canonicalized.symbol_from_root_type",
  "legacy.canonicalized.auto_voicing_default",
  "legacy.canonicalized.meter_duration_default",
  "legacy.canonicalized.playback_default",
  "legacy.canonicalized.section_policy_default",
] as const);

export const LEGACY_CUSTOM_CODES = Object.freeze([
  "legacy.custom.name_notes_spelling_conflict",
  "legacy.custom.name_notes_sounding_conflict",
  "legacy.custom.constructed_notes_conflict",
  "legacy.custom.notes_without_symbol",
] as const);

export const LEGACY_IGNORED_CODES = Object.freeze([
  "legacy.ignored.ui_field",
  "legacy.ignored.voicing_metadata",
  "legacy.ignored.tensions",
  "legacy.ignored.alteration_evidence",
  "legacy.ignored.invalid_notes",
  "legacy.ignored.invalid_bass",
  "legacy.ignored.invalid_field_type",
  "legacy.ignored.unknown_field",
  "legacy.ignored.name_parse_failure",
  "legacy.ignored.unknown_type",
  "legacy.ignored.invalid_root",
] as const);

export const LEGACY_REJECTED_CODES = Object.freeze([
  "legacy.rejected.section_not_object",
  "legacy.rejected.section_chords_missing",
  "legacy.rejected.section_chords_not_array",
  "legacy.rejected.event_not_object",
  "legacy.rejected.no_usable_symbol_or_notes",
  "legacy.rejected.text_limit",
  "legacy.rejected.invalid_unicode_scalar",
] as const);

export type LegacyPreservedCode = (typeof LEGACY_PRESERVED_CODES)[number];
export type LegacyCanonicalizedCode =
  (typeof LEGACY_CANONICALIZED_CODES)[number];
export type LegacyCustomCode = (typeof LEGACY_CUSTOM_CODES)[number];
export type LegacyIgnoredCode = (typeof LEGACY_IGNORED_CODES)[number];
export type LegacyRejectedCode = (typeof LEGACY_REJECTED_CODES)[number];
export type LegacyReportCode =
  | LegacyPreservedCode
  | LegacyCanonicalizedCode
  | LegacyCustomCode
  | LegacyIgnoredCode
  | LegacyRejectedCode;

type LegacyReportItemBase = Readonly<{
  sourcePath: DomainPath;
  targetPath: DomainPath | null;
}>;

export type LegacyReportItem =
  | (LegacyReportItemBase & Readonly<{
      group: "preserved";
      code: LegacyPreservedCode;
    }>)
  | (LegacyReportItemBase & Readonly<{
      group: "canonicalized";
      code: LegacyCanonicalizedCode;
    }>)
  | (LegacyReportItemBase & Readonly<{
      group: "custom";
      code: LegacyCustomCode;
    }>)
  | (LegacyReportItemBase & Readonly<{
      group: "ignored";
      code: LegacyIgnoredCode;
    }>)
  | (LegacyReportItemBase & Readonly<{
      group: "rejected";
      code: LegacyRejectedCode;
    }>);

/** Report groups and codes use these orders; discovery/source order is not a tie-break. */
export const LEGACY_REPORT_CODE_ORDER = Object.freeze([
  ...LEGACY_PRESERVED_CODES,
  ...LEGACY_CANONICALIZED_CODES,
  ...LEGACY_CUSTOM_CODES,
  ...LEGACY_IGNORED_CODES,
  ...LEGACY_REJECTED_CODES,
] as const);

export type LegacyIdentityMapping = Readonly<{
  sourcePath: DomainPath;
  targetPath: DomainPath;
  kind: StableIdKind;
  id: AnyStableId;
}>;

export type LegacyMigrationSummary = Readonly<{
  sourceSections: number;
  sourceChordSlots: number;
  migratedSections: number;
  migratedEvents: number;
  rejectedSections: number;
  rejectedEvents: number;
  parsedEvents: number;
  customEvents: number;
  manualEvents: number;
  autoEvents: number;
  preservedItems: number;
  canonicalizedItems: number;
  customItems: number;
  ignoredItems: number;
  rejectedItems: number;
}>;

export type LegacyMigrationReport = Readonly<{
  schema: typeof LEGACY_MIGRATION_REPORT_SCHEMA;
  policyId: typeof LEGACY_MIGRATION_POLICY_ID;
  policyVersion: typeof LEGACY_MIGRATION_POLICY_VERSION;
  sourceKind: "unversioned-legacy-json";
  sourceBytes: number;
  summary: LegacyMigrationSummary;
  groups: Readonly<{
    preserved: readonly LegacyReportItem[];
    canonicalized: readonly LegacyReportItem[];
    custom: readonly LegacyReportItem[];
    ignored: readonly LegacyReportItem[];
    rejected: readonly LegacyReportItem[];
  }>;
  identityMappings: readonly LegacyIdentityMapping[];
}>;

export type LegacyMigrationCandidate = Readonly<{
  schema: typeof LEGACY_MIGRATION_CANDIDATE_SCHEMA;
  document: ProgressionDocumentShapeV2;
  report: LegacyMigrationReport;
}>;

export const LEGACY_MIGRATION_REFUSAL_CODES = Object.freeze([
  "limit.legacy_utf8_bytes_exceeded",
  "legacy.utf8_invalid",
  "legacy.json_syntax_invalid",
  "limit.legacy_json_depth_exceeded",
  "legacy.root_invalid",
  "legacy.sections_invalid",
  "limit.legacy_sections_exceeded",
  "limit.legacy_chords_per_section_exceeded",
  "limit.legacy_events_exceeded",
  "limit.legacy_source_properties_exceeded",
  "limit.legacy_report_items_exceeded",
  "legacy.id_factory_failed",
  "legacy.id_collision",
] as const);

export type LegacyMigrationRefusalCode =
  (typeof LEGACY_MIGRATION_REFUSAL_CODES)[number];

export type LegacyMigrationRefusal =
  | PathRefusal<{
      code: "limit.legacy_utf8_bytes_exceeded";
      received: number;
      maximum: typeof MAX_LEGACY_UTF8_BYTES;
    }>
  | PathRefusal<{ code: "legacy.utf8_invalid" }>
  | PathRefusal<{ code: "legacy.json_syntax_invalid" }>
  | PathRefusal<{
      code: "limit.legacy_json_depth_exceeded";
      received: number;
      maximum: typeof MAX_LEGACY_JSON_DEPTH;
    }>
  | PathRefusal<{ code: "legacy.root_invalid" }>
  | PathRefusal<{ code: "legacy.sections_invalid" }>
  | PathRefusal<{
      code: "limit.legacy_sections_exceeded";
      received: number;
      maximum: typeof MAX_LEGACY_SECTIONS;
    }>
  | PathRefusal<{
      code: "limit.legacy_chords_per_section_exceeded";
      received: number;
      maximum: typeof MAX_LEGACY_CHORDS_PER_SECTION;
    }>
  | PathRefusal<{
      code: "limit.legacy_events_exceeded";
      received: number;
      maximum: typeof MAX_LEGACY_CHORDS;
    }>
  | PathRefusal<{
      code: "limit.legacy_source_properties_exceeded";
      received: number;
      maximum: typeof MAX_LEGACY_SOURCE_PROPERTIES;
    }>
  | PathRefusal<{
      code: "limit.legacy_report_items_exceeded";
      received: number;
      maximum: typeof MAX_LEGACY_REPORT_ITEMS;
    }>
  | PathRefusal<{
      code: "legacy.id_factory_failed";
      kind: StableIdKind;
      factoryCode: "id.entropy_unavailable" | "id.factory_exhausted";
    }>
  | PathRefusal<{
      code: "legacy.id_collision";
      kind: StableIdKind;
      collidingId: string;
      firstSourcePath: DomainPath;
    }>;

export type LegacyMigrationResult =
  | Readonly<{ ok: true; value: LegacyMigrationCandidate }>
  | Readonly<{ ok: false; refusal: LegacyMigrationRefusal }>;

/** The operation copies bytes and retains no caller-owned container. */
export type LegacyMigrationRequest = Readonly<{
  sourceBytes: Uint8Array;
}>;

export interface LegacyMigrationDependencies {
  readonly idFactory: StableIdFactory;
  readonly parseChordSymbol: ParseChordSymbol;
  readonly resolveChord: ResolveChord;
}

export type MigrateLegacyJson = (
  request: LegacyMigrationRequest,
  dependencies: LegacyMigrationDependencies,
) => LegacyMigrationResult;

export interface LegacyMigrationOperations {
  readonly migrateLegacyJson: MigrateLegacyJson;
}

export const LEGACY_MIGRATION_WORK_COUNTER_NAMES = Object.freeze([
  "bytesVisited",
  "jsonCodeUnitsVisited",
  "maximumJsonDepth",
  "sourcePropertiesVisited",
  "sectionsVisited",
  "chordSlotsVisited",
  "notesVisited",
  "symbolParseCalls",
  "resolutionCalls",
  "idRequests",
  "reportItemsEmitted",
] as const);

export type LegacyMigrationWorkCounters = Readonly<{
  bytesVisited: number;
  jsonCodeUnitsVisited: number;
  maximumJsonDepth: number;
  sourcePropertiesVisited: number;
  sectionsVisited: number;
  chordSlotsVisited: number;
  notesVisited: number;
  symbolParseCalls: number;
  resolutionCalls: number;
  idRequests: number;
  reportItemsEmitted: number;
}>;

export const MAX_LEGACY_BYTES_VISITED = MAX_LEGACY_UTF8_BYTES + 1;
export const MAX_LEGACY_SECTIONS_VISITED = MAX_LEGACY_SECTIONS;
export const MAX_LEGACY_CHORD_SLOTS_VISITED = MAX_LEGACY_CHORDS;
export const MAX_LEGACY_NOTES_VISITED =
  MAX_LEGACY_CHORDS * MAX_TRUSTED_LEGACY_NOTES;
export const MAX_LEGACY_SYMBOL_PARSE_CALLS = MAX_LEGACY_CHORDS * 2;
export const MAX_LEGACY_RESOLUTION_CALLS = MAX_LEGACY_CHORDS * 2;
export const MAX_LEGACY_ID_REQUESTS =
  1 + MAX_LEGACY_SECTIONS + MAX_LEGACY_CHORDS * 2;
export const MAX_LEGACY_IDENTITY_MAPPINGS = MAX_LEGACY_ID_REQUESTS;
export const MAX_LEGACY_TRACKED_RECORDS =
  MAX_LEGACY_SOURCE_PROPERTIES +
  MAX_LEGACY_REPORT_ITEMS +
  MAX_LEGACY_IDENTITY_MAPPINGS +
  MAX_LEGACY_CHORDS;

export const LEGACY_MIGRATION_TERMINATIONS = Object.freeze([
  "complete-candidate",
  "complete-refusal",
] as const);

export type LegacyMigrationTermination =
  (typeof LEGACY_MIGRATION_TERMINATIONS)[number];

export const LEGACY_MIGRATION_APPLICABILITY = Object.freeze({
  cancellation: "not-applicable:synchronous-bounded",
  staleRevision: "not-applicable:value-operation-without-publication",
  resume: "not-applicable:non-resumable",
  wallTimeCutoff: "forbidden:counts-only",
  publication: "candidate-only:application-f3-gate-required",
} as const);

/** Package-private build/verification evidence shape; not a second operation. */
export type LegacyMigrationEvidence = Readonly<{
  contractSchema: typeof LEGACY_MIGRATION_CONTRACT_SCHEMA;
  policyId: typeof LEGACY_MIGRATION_POLICY_ID;
  policyVersion: typeof LEGACY_MIGRATION_POLICY_VERSION;
  termination: LegacyMigrationTermination;
  counters: LegacyMigrationWorkCounters;
}>;
