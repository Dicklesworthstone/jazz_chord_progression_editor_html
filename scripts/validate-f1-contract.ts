import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type JsonObject = Record<string, unknown>;

export type F1ContractFinding = Readonly<{
  code: string;
  path: string;
  message: string;
}>;

export type F1ContractValidationReport = Readonly<{
  schema: "changes.validation.f1-contract.v1";
  package: "F1";
  outcome: "pass" | "fail";
  counts: Readonly<{
    companions: number;
    cases: number;
    traces: number;
    authorities: number;
    seeds: number;
  }>;
  findings: readonly F1ContractFinding[];
}>;

type ParsedCompanion = Readonly<{
  path: string;
  schema: string;
  recordCollections: readonly string[];
  root: JsonObject;
}>;

type FixtureCase = Readonly<{
  id: string;
  path: string;
  record: JsonObject;
  traceIds: readonly string[];
  authorityIds: readonly string[];
}>;

const MIDI_PPQ = 960;
const ALLOWED_BEAT_DENOMINATORS = [
  1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 16, 20, 24, 30, 32, 40, 48, 60,
  64, 80, 96, 120, 160, 192, 240, 320, 480, 960,
] as const;
const AUTO_VOICING_FAMILIES = [
  "balanced", "shell", "rootless-a", "rootless-b", "open", "drop2", "quartal",
] as const;
const AUTO_BASS_POLICIES = ["generated", "external", "none"] as const;
const MIN_MIDI_PITCH = 0;
const MAX_MIDI_PITCH = 127;
const PROGRESSION_DOCUMENT_SCHEMA = "changes.progression.v2";

/** Independent reviewed literals. Production conformance is tested separately. */
export const F1_REVIEWED_PUBLIC_CONSTANTS = {
  progressionDocumentSchema: "changes.progression.v2",
  progressionDocumentSchemaVersion: 2,
  stableIdPatternSource: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$",
  midiPpq: 960,
  allowedBeatDenominators: [...ALLOWED_BEAT_DENOMINATORS],
  maxBeatNumerator: 2_147_483_647,
  maxTimelineQuarterNoteBeats: 1_000_000,
  midiMinimum: 0,
  midiMaximum: 127,
  minimumAlteration: -2,
  maximumAlteration: 2,
  middleCMidi: 60,
  concertAMidi: 69,
  concertAFrequencyHz: 440,
  tempoMinimum: 20,
  tempoMaximum: 400,
  minimumBeatsPerBar: 1,
  maximumBeatsPerBar: 32,
  maxSections: 64,
  maxMeasuresPerSection: 1_024,
  maxEventsPerDocument: 8_192,
  maxCopyGraphNodes: 73_793,
  maxVoicingNotes: 16,
  maxImportBytes: 2_097_152,
  maxJsonDepth: 32,
  maxStableIdAsciiCharacters: 128,
  maxSymbolCodePoints: 256,
  maxCustomLabelCodePoints: 256,
  maxTitleCodePoints: 256,
  maxSectionNameCodePoints: 256,
  maxAnnotationCodePoints: 2_000,
  maxDescriptionCodePoints: 2_000,
  maxPartialMeasureReasonCodePoints: 2_000,
  maxEngineVersionCodePoints: 64,
  minimumPlaybackLevel: 0,
  maximumPlaybackLevel: 1,
  countInBars: [0, 1, 2],
} as const;

export const F1_REVIEWED_ISSUE_CODES = [
  "shape.unknown_field",
  "shape.invalid_type",
  "document.root_not_object",
  "document.schema_invalid",
  "document.schema_missing",
  "limit.import_bytes_exceeded",
  "limit.json_depth_exceeded",
  "limit.sections_exceeded",
  "limit.measures_per_section_exceeded",
  "limit.events_per_document_exceeded",
  "limit.copy_nodes_exceeded",
  "id.syntax_invalid",
  "id.length_exceeded",
  "id.duplicate",
  "id.reference_missing",
  "id.collision_existing",
  "id.collision_allocated",
  "id.factory_exhausted",
  "id.entropy_unavailable",
  "id.remap_incomplete",
  "string.blank",
  "limit.symbol_code_points_exceeded",
  "limit.annotation_code_points_exceeded",
  "limit.title_code_points_exceeded",
  "limit.section_name_code_points_exceeded",
  "limit.custom_label_code_points_exceeded",
  "limit.description_code_points_exceeded",
  "limit.reason_code_points_exceeded",
  "limit.engine_version_code_points_exceeded",
  "string.invalid_unicode_scalar",
  "pitch.step_invalid",
  "pitch.alter_out_of_range",
  "pitch.octave_not_integer",
  "pitch.octave_not_safe_integer",
  "pitch.midi_not_integer",
  "pitch.midi_out_of_range",
  "key.mode_invalid",
  "document.instrument_id_invalid",
  "chord.degree_number_invalid",
  "chord.degree_alter_out_of_range",
  "chord.degree_order",
  "chord.degree_duplicate",
  "chord.source_semantic_mismatch",
  "custom.pitch_names_empty",
  "custom.pitch_voicing_mismatch",
  "custom.auto_voicing_forbidden",
  "voicing.pitches_empty",
  "limit.voicing_notes_exceeded",
  "voicing.range_reversed",
  "voicing.voice_count_invalid",
  "voicing.rootless_requires_external",
  "voicing.slash_bass_policy_none",
  "voicing.external_without_slash_bass",
  "voicing.included_bass_not_lowest",
  "voicing.included_bass_spelling_mismatch",
  "voicing.external_bass_included",
  "voicing.engine_version_invalid",
  "voicing.auto_settings_required",
  "beat.numerator_not_safe_integer",
  "beat.numerator_negative",
  "beat.numerator_out_of_range",
  "beat.denominator_not_safe_integer",
  "beat.denominator_not_positive",
  "beat.denominator_not_ppq_divisor",
  "beat.not_normalized",
  "beat.duration_not_positive",
  "beat.negative_result",
  "beat.range_empty",
  "beat.range_reversed",
  "timeline.total_exceeded",
  "meter.beats_per_bar_out_of_range",
  "meter.beat_unit_invalid",
  "tempo.not_finite",
  "tempo.not_integer",
  "tempo.out_of_range",
  "playback.level_not_finite",
  "playback.level_out_of_range",
  "playback.count_in_bars_invalid",
  "playback.groove_style_invalid",
  "playback.groove_style_not_canonical",
  "section.voice_leading_boundary_invalid",
  "measure.empty_has_events",
  "measure.nonempty_has_no_events",
  "measure.complete_duration_mismatch",
  "measure.duration_over_capacity",
  "measure.expected_duration_not_short",
  "measure.expected_duration_not_positive",
  "measure.expected_duration_mismatch",
  "measure.reason_blank",
] as const;

export const F1_REVIEWED_TEXT_FIELD_CODE_POINT_LIMITS = {
  chordSourceText: 256,
  customChordLabel: 256,
  documentTitle: 256,
  sectionName: 256,
  annotation: 2_000,
  documentDescription: 2_000,
  partialMeasureReason: 2_000,
} as const;

export const F1_REVIEWED_NONBLANK_TEXT_FIELDS = [
  "chordSourceText",
  "customChordLabel",
  "documentTitle",
  "sectionName",
  "partialMeasureReason",
  "engineVersion",
] as const;

export const F1_REVIEWED_STAGE_ISSUE_CODES = {
  F1: [
    "id.syntax_invalid", "id.length_exceeded", "id.collision_existing",
    "id.collision_allocated", "id.factory_exhausted", "id.entropy_unavailable",
    "id.remap_incomplete", "limit.copy_nodes_exceeded", "pitch.step_invalid",
    "pitch.alter_out_of_range", "pitch.octave_not_integer",
    "pitch.octave_not_safe_integer", "pitch.midi_not_integer",
    "pitch.midi_out_of_range", "key.mode_invalid",
    "document.instrument_id_invalid", "chord.degree_number_invalid",
    "chord.degree_alter_out_of_range", "chord.degree_order",
    "chord.degree_duplicate", "custom.pitch_names_empty",
    "custom.auto_voicing_forbidden", "voicing.pitches_empty",
    "limit.voicing_notes_exceeded", "voicing.range_reversed",
    "voicing.voice_count_invalid", "voicing.rootless_requires_external",
    "voicing.slash_bass_policy_none", "voicing.external_without_slash_bass",
    "voicing.included_bass_not_lowest",
    "voicing.included_bass_spelling_mismatch", "voicing.external_bass_included",
    "voicing.engine_version_invalid", "voicing.auto_settings_required",
    "beat.numerator_not_safe_integer", "beat.numerator_negative",
    "beat.numerator_out_of_range", "beat.denominator_not_safe_integer",
    "beat.denominator_not_positive", "beat.denominator_not_ppq_divisor",
    "beat.duration_not_positive", "beat.negative_result", "beat.range_empty",
    "beat.range_reversed", "timeline.total_exceeded",
    "meter.beats_per_bar_out_of_range", "meter.beat_unit_invalid",
    "tempo.not_finite", "tempo.not_integer", "tempo.out_of_range",
    "playback.level_not_finite", "playback.level_out_of_range",
    "playback.count_in_bars_invalid", "playback.groove_style_invalid",
    "playback.groove_style_not_canonical",
  ],
  F2: [
    "shape.unknown_field", "shape.invalid_type", "document.root_not_object",
    "document.schema_invalid", "document.schema_missing",
    "limit.import_bytes_exceeded", "limit.json_depth_exceeded",
    "limit.sections_exceeded", "limit.measures_per_section_exceeded",
    "limit.events_per_document_exceeded", "id.duplicate", "id.reference_missing",
    "string.blank", "limit.symbol_code_points_exceeded",
    "limit.annotation_code_points_exceeded", "limit.title_code_points_exceeded",
    "limit.section_name_code_points_exceeded",
    "limit.custom_label_code_points_exceeded",
    "limit.description_code_points_exceeded", "limit.reason_code_points_exceeded",
    "limit.engine_version_code_points_exceeded", "string.invalid_unicode_scalar",
    "beat.not_normalized", "section.voice_leading_boundary_invalid",
  ],
  F3: [
    "chord.source_semantic_mismatch", "custom.pitch_voicing_mismatch",
    "measure.empty_has_events", "measure.nonempty_has_no_events",
    "measure.complete_duration_mismatch", "measure.duration_over_capacity",
    "measure.expected_duration_not_short",
    "measure.expected_duration_not_positive",
    "measure.expected_duration_mismatch", "measure.reason_blank",
  ],
} as const;

function numberedIds(prefix: string, count: number): string[] {
  return Array.from(
    { length: count },
    (_, index) => `${prefix}${String(index + 1).padStart(3, "0")}`,
  );
}

const DEFAULT_FIXTURE_ROOT = fileURLToPath(
  new URL("../tests/fixtures/domain", import.meta.url),
);
const MANIFEST_FILENAME = "f1-domain-contract.json";
const EXPECTED_MANIFEST_IDENTITY = {
  schema: "changes.fixtures.f1-domain-contract.v1",
  contractVersion: "1.0.1",
  package: "F1",
  beadId: "jcpe-milestone-foundation-vc2.2.1",
  domainSchema: PROGRESSION_DOCUMENT_SCHEMA,
} as const;
const EXPECTED_FIXED_CONSTANTS: Readonly<JsonObject> =
  F1_REVIEWED_PUBLIC_CONSTANTS;
const EXPECTED_COMPANION_KEYS = [
  "path",
  "recordCollections",
  "role",
  "schema",
] as const;
const EXPECTED_COMPANIONS = [
  {
    path: "pitch-cases.json",
    schema: "changes.fixtures.f1-pitch.v1",
    recordCollections: ["cases"],
  },
  {
    path: "chord-shape-cases.json",
    schema: "changes.fixtures.f1-chord-shape.v1",
    recordCollections: ["cases"],
  },
  {
    path: "beat-value-cases.json",
    schema: "changes.fixtures.f1-beat-value.v1",
    recordCollections: ["divisorCases", "pairwiseClosureCases", "edgeCases"],
  },
  {
    path: "meter-measure-cases.json",
    schema: "changes.fixtures.f1-meter-measure.v1",
    recordCollections: ["capacityCases", "completionCases"],
  },
  {
    path: "identity-cases.json",
    schema: "changes.fixtures.f1-identity.v1",
    recordCollections: ["cases"],
  },
  {
    path: "voicing-custom-cases.json",
    schema: "changes.fixtures.f1-voicing-custom.v1",
    recordCollections: ["autoPolicyMatrix", "customAutoPolicyMatrix", "cases"],
  },
  {
    path: "document-boundary-cases.json",
    schema: "changes.fixtures.f1-document-boundary.v1",
    recordCollections: ["cases"],
  },
  {
    path: "operation-state-cases.json",
    schema: "changes.fixtures.f1-operation-state.v1",
    recordCollections: ["cases"],
  },
  {
    path: "trace-ledger.json",
    schema: "changes.fixtures.f1-trace-ledger.v1",
    recordCollections: ["traces"],
  },
  {
    path: "provenance-ledger.json",
    schema: "changes.fixtures.f1-provenance-ledger.v1",
    recordCollections: ["authorities"],
  },
] as const;
const EXPECTED_SEEDS = [
  ["F1-SEED-PITCH", 2_718_281_828],
  ["F1-SEED-BEAT", 3_141_592_653],
  ["F1-SEED-METER", 1_618_033_988],
  ["F1-SEED-IDENTITY", 1_414_213_562],
  ["F1-SEED-VOICING", 1_732_050_807],
  ["F1-SEED-BOUNDARY", 2_236_067_977],
] as const;
const EXPECTED_TRACE_IDS = [
  "F1-TRACE-ID-STABILITY",
  "F1-TRACE-ID-TRANSACTION",
  "F1-TRACE-PITCH-IDENTITY",
  "F1-TRACE-PITCH-MIDI",
  "F1-TRACE-PITCH-FREQUENCY",
  "F1-TRACE-DEGREE-IDENTITY",
  "F1-TRACE-VOICING-EXACT",
  "F1-TRACE-VOICING-CONDITIONAL",
  "F1-TRACE-TIME-DENOMINATORS",
  "F1-TRACE-TIME-ARITHMETIC",
  "F1-TRACE-TIME-LIMITS",
  "F1-TRACE-METER-CAPACITY",
  "F1-TRACE-MEASURE-STATE",
  "F1-TRACE-DOCUMENT-TYPES",
  "F1-TRACE-KEY-CONTEXT",
  "F1-TRACE-DECODER-RESULT",
  "F1-TRACE-BOUNDED-OPERATIONS",
  "F1-TRACE-PURE-BOUNDARY",
] as const;
const EXPECTED_AUTHORITY_IDS = [
  "F1-AUTH-ID",
  "F1-AUTH-PITCH",
  "F1-AUTH-TEMPERAMENT",
  "F1-AUTH-DEGREE",
  "F1-AUTH-VOICING",
  "F1-AUTH-TIME",
  "F1-AUTH-DOCUMENT",
  "F1-AUTH-KEY",
  "F1-AUTH-VALIDATION",
] as const;
const EXPECTED_COVERAGE_SUMMARY: Readonly<JsonObject> = {
  companionFiles: 10,
  fixtureCaseRecords: 320,
  traceRecords: 18,
  authorityRecords: 9,
  stableSeeds: 6,
  allowedBeatDivisors: 28,
  orderedPairwiseBeatClosureChecks: 784,
  orderedPairwiseBeatAdditionChecks: 784,
  orderedPairwiseBeatComparisonChecks: 784,
  orderedPairwiseBeatSubtractionValueChecks: 406,
  orderedPairwiseBeatSubtractionRefusalChecks: 378,
  coreMeterCapacityCases: 15,
  additionalCompoundMeterNearMisses: 1,
  autoVoicingPolicyMatrixCells: 42,
  customAutoRefusalMatrixCells: 42,
  expectedDiagnosticCodes: 87,
};
const EXPECTED_OBSERVATION_CONTRACT: Readonly<JsonObject> = {
  purpose: "expected records are independent oracle observations, not serialized production result envelopes",
  singleDiagnosticKey: "issue",
  multipleDiagnosticKey: "issuesInOrder",
  batchedIndependentResultsKey: "independentResults",
  decoderAdapter: "compares fixture diagnostics with DecodeResult.errors and proves no partial value",
  valueAdapter: "compares fixture diagnostics with the refusal member of the named F1 value result; for a nested document observation it first prefixes the operation-relative path exactly once",
  successAdapter: "compares exact value fields or the explicit boolean/property observation named by the case",
};
const EXPECTED_STAGE_OWNERSHIP: Readonly<JsonObject> = {
  F1: "opaque values, public immutable shapes, value constructors/projections, exact arithmetic, ID factories/remap/copy contracts, and capacity arithmetic",
  F2: "total unknown decoding, byte/depth/collection preflight, strict fields, runtime structural compatibility, and duplicate-ID diagnostics",
  F3: "source/AST/formula/custom correspondence, measure-completion semantics, playback realizability, and sole semantic publication input",
  A0: "revision-aware atomic editing transitions and history",
};
const EXPECTED_AUTHORITY_CLASSIFICATION_POLICY: Readonly<JsonObject> = {
  "reviewed-project-policy": "an explicit product, schema, API, or domain choice frozen by reviewed project contracts and not derived from implementation output",
  "external-definition": "a fact or convention adopted from a named outside standards source; at least one sourceRef is an absolute HTTPS URL",
  "judgment-bearing-musical-policy": "a musically interpretive or taste-bearing choice that requires explicit human review rather than arithmetic derivation",
};
const EXPECTED_AUTHORITY_EXPECTATION_CLASS = new Map<string, string>([
  ["F1-AUTH-ID", "reviewed-project-policy"],
  ["F1-AUTH-PITCH", "reviewed-project-policy"],
  ["F1-AUTH-TEMPERAMENT", "external-definition"],
  ["F1-AUTH-DEGREE", "reviewed-project-policy"],
  ["F1-AUTH-VOICING", "judgment-bearing-musical-policy"],
  ["F1-AUTH-TIME", "reviewed-project-policy"],
  ["F1-AUTH-DOCUMENT", "reviewed-project-policy"],
  ["F1-AUTH-KEY", "reviewed-project-policy"],
  ["F1-AUTH-VALIDATION", "reviewed-project-policy"],
]);
const EXPECTED_PAIRWISE_TICK_ORACLE: Readonly<JsonObject> = {
  oracleVersion: "ppq-integer-ticks-v1",
  tickSources: {
    left: "divisorCases.unitTicks",
    right: "divisorCases.unitTicks",
  },
  addition: {
    operation: "add-integer-ticks",
    result: "reduce-ticks-over-ppq",
  },
  subtraction: {
    operation: "subtract-integer-ticks",
    negativeWhen: "leftTicks<rightTicks",
    negativeCode: "beat.negative_result",
    result: "reduce-ticks-over-ppq",
  },
  comparison: {
    operation: "compare-integer-ticks",
    less: -1,
    equal: 0,
    greater: 1,
  },
  closure: {
    successfulDenominatorSet: "divisorCases.denominator",
  },
  expectedComparisonPartition: {
    less: 378,
    equal: 28,
    greater: 378,
  },
  expectedExecutionCounts: {
    additions: 784,
    comparisons: 784,
    subtractionValues: 406,
    subtractionNegativeRefusals: 378,
  },
};
const EXPECTED_CASE_IDS_BY_COLLECTION = new Map<string, readonly string[]>([
  ["pitch-cases.json#cases", numberedIds("F1-PITCH-", 28)],
  ["chord-shape-cases.json#cases", numberedIds("F1-CHORD-", 25)],
  ["beat-value-cases.json#divisorCases", numberedIds("F1-BEAT-DIV-", 28)],
  ["beat-value-cases.json#pairwiseClosureCases", ["F1-BEAT-PAIRWISE-001"]],
  ["beat-value-cases.json#edgeCases", numberedIds("F1-BEAT-EDGE-", 31)],
  ["meter-measure-cases.json#capacityCases", numberedIds("F1-METER-CAP-", 16)],
  ["meter-measure-cases.json#completionCases", numberedIds("F1-MEASURE-", 22)],
  ["identity-cases.json#cases", numberedIds("F1-ID-", 19)],
  ["voicing-custom-cases.json#autoPolicyMatrix", numberedIds("F1-VOICE-AUTO-MATRIX-", 7)],
  ["voicing-custom-cases.json#customAutoPolicyMatrix", ["F1-VOICE-CUSTOM-AUTO-MATRIX-001"]],
  ["voicing-custom-cases.json#cases", numberedIds("F1-VOICE-", 44)],
  ["document-boundary-cases.json#cases", numberedIds("F1-DOC-", 88)],
  ["operation-state-cases.json#cases", numberedIds("F1-OPSTATE-", 10)],
]);
const EXPECTED_ROOT_KEYS = new Map<string, readonly string[]>([
  [MANIFEST_FILENAME, ["assumptions", "authorityPolicy", "beadId", "companions", "contractVersion", "coverageSummary", "description", "determinism", "domainSchema", "fixedConstants", "fixtureObservationContract", "package", "schema", "stageOwnership"]],
  ["pitch-cases.json", ["cases", "defaultSeedId", "frequencyAbsoluteToleranceHz", "frequencyFormula", "schema"]],
  ["chord-shape-cases.json", ["cases", "defaultSeedId", "schema"]],
  ["beat-value-cases.json", ["defaultSeedId", "divisorCases", "edgeCases", "normalizationOrder", "pairwiseClosureCases", "ppq", "schema"]],
  ["meter-measure-cases.json", ["capacityCases", "capacityFormula", "completionCases", "defaultSeedId", "schema", "storageUnit"]],
  ["identity-cases.json", ["allocationOrder", "cases", "collisionScope", "defaultSeedId", "schema", "sharedGraphs", "transactionRule"]],
  ["voicing-custom-cases.json", ["autoPolicyMatrix", "cases", "customAutoPolicyMatrix", "defaultSeedId", "manualFrozenBassContract", "schema"]],
  ["document-boundary-cases.json", ["cases", "defaultSeedId", "idSyntax", "schema", "specialInputDescriptors", "textValidationMatrix"]],
  ["operation-state-cases.json", ["applicabilityVocabulary", "cases", "defaultSeedId", "schema"]],
  ["trace-ledger.json", ["schema", "tracePolicy", "traces"]],
  ["provenance-ledger.json", ["authoringStatement", "authorities", "classificationPolicy", "expectedValuesGenerated", "ledgerVersion", "productionOutputUsed", "reviewState", "schema"]],
]);
const EXPECTED_REVIEWED_FILE_SHA256 = new Map<string, string>([
  ["beat-value-cases.json", "cb1e89b2cd756d02dbf8c385d751191dac8c52041a151f60dd67d9aa44dfae42"],
  ["chord-shape-cases.json", "f9b99efb4510ad36e21dd3719d90687af97d43b12adc612e42b83aa365e4ea48"],
  ["document-boundary-cases.json", "a83dc0f3639ae7fb4b147a99c23659dc8d9148677631efafca7910770891b208"],
  ["f1-domain-contract.json", "be1b218cc095d692c7be13cff71cbdb8e3a6d63b48a39b4a44173a00ea58b62d"],
  ["identity-cases.json", "caa285efd879394c002af71de8c2ed0ab2d46cab040be5e3155dbd4952a165dc"],
  ["meter-measure-cases.json", "5e35c53ae5aebfe02115a907a3798f6efeb0d0b42a02902e901b2531387b9d1d"],
  ["operation-state-cases.json", "b01bb5d272100f665d6c1bda2c18d2dbb82add04ebefee20c750597f98ba3a6e"],
  ["pitch-cases.json", "103337d26bfe3695c5eda09b111d96f110a5c4584b84a374a3b8e2ba924d02d0"],
  ["provenance-ledger.json", "818f49f8559afe22cb270cd04678b03703c80a880ca58159446e92020d8889be"],
  ["trace-ledger.json", "eeaeff77cc55a75fdcd5401d4a0f2216423be836d8b4f92d0dfeb4b4b06216d7"],
  ["voicing-custom-cases.json", "e861316a17dab641a8da04381470def08a8231ffd49cd0eafdec3c82250cd293"],
]);
const ISSUE_CODE_VALUES = new Set<string>(F1_REVIEWED_ISSUE_CODES);
const EXPECTED_FIXTURE_ISSUE_CODES = F1_REVIEWED_ISSUE_CODES.filter(
  (code) => code !== "id.reference_missing" &&
    code !== "custom.pitch_voicing_mismatch",
);

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function codeUnitCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortedStrings(values: readonly string[]): string[] {
  return [...values].sort(codeUnitCompare);
}

function sameStringArray(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return left.length === right.length &&
    left.every((value, index) => value === right[index]);
}

function jsonEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => jsonEqual(value, right[index]));
  }
  if (!isObject(left) || !isObject(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return sameStringArray(leftKeys, rightKeys) &&
    leftKeys.every((key) => jsonEqual(left[key], right[key]));
}

function gcd(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b !== 0) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a === 0 ? 1 : a;
}

function reduced(numerator: number, denominator: number): JsonObject {
  const divisor = gcd(numerator, denominator);
  return {
    numerator: numerator / divisor,
    denominator: denominator / divisor,
  };
}

function nodeErrorCode(error: unknown): string | null {
  return isObject(error) && typeof error["code"] === "string"
    ? error["code"]
    : null;
}

function stringsFromUnknown(
  value: unknown,
  path: string,
  findings: F1ContractFinding[],
  options: Readonly<{ nonempty?: boolean; unique?: boolean }> = {},
): string[] {
  if (!Array.isArray(value)) {
    findings.push({
      code: "F1_CONTRACT_SHAPE",
      path,
      message: "Expected an array of strings.",
    });
    return [];
  }
  const result: string[] = [];
  const seen = new Set<string>();
  value.forEach((item, index) => {
    const itemPath = `${path}[${String(index)}]`;
    if (typeof item !== "string" || item.length === 0) {
      findings.push({
        code: "F1_CONTRACT_SHAPE",
        path: itemPath,
        message: "Expected a non-empty string.",
      });
      return;
    }
    if (options.unique === true && seen.has(item)) {
      findings.push({
        code: "F1_CONTRACT_DUPLICATE",
        path: itemPath,
        message: `Duplicate string ${JSON.stringify(item)}.`,
      });
      return;
    }
    seen.add(item);
    result.push(item);
  });
  if (options.nonempty === true && result.length === 0) {
    findings.push({
      code: "F1_CONTRACT_SHAPE",
      path,
      message: "Expected at least one string.",
    });
  }
  return result;
}

async function parseJsonObject(
  fixtureRoot: string,
  filename: string,
  findings: F1ContractFinding[],
  missingCode: string,
): Promise<JsonObject | null> {
  const path = join(fixtureRoot, filename);
  let source: string;
  try {
    source = await readFile(path, "utf8");
  } catch (error) {
    findings.push({
      code: nodeErrorCode(error) === "ENOENT" ? missingCode : "F1_CONTRACT_READ",
      path: filename,
      message: nodeErrorCode(error) === "ENOENT"
        ? `Required JSON file ${JSON.stringify(filename)} is missing.`
        : `Unable to read required JSON file ${JSON.stringify(filename)} (${nodeErrorCode(error) ?? "unknown error"}).`,
    });
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    findings.push({
      code: "F1_CONTRACT_JSON",
      path: filename,
      message: error instanceof Error ? error.message : "Unable to parse JSON.",
    });
    return null;
  }
  if (!isObject(parsed)) {
    findings.push({
      code: "F1_CONTRACT_SHAPE",
      path: `${filename}:$`,
      message: "JSON root must be an object.",
    });
    return null;
  }
  return parsed;
}

async function validateReviewedFileDigests(
  fixtureRoot: string,
  findings: F1ContractFinding[],
): Promise<void> {
  for (const [filename, expected] of EXPECTED_REVIEWED_FILE_SHA256) {
    try {
      const source = await readFile(join(fixtureRoot, filename));
      const actual = createHash("sha256").update(source).digest("hex");
      if (actual !== expected) {
        findings.push({
          code: "F1_CORPUS_DIGEST",
          path: filename,
          message: "File bytes do not match the independently reviewed F1 corpus digest.",
        });
      }
    } catch (error) {
      findings.push({
        code: "F1_CORPUS_DIGEST",
        path: filename,
        message: `Unable to hash reviewed JSON file (${nodeErrorCode(error) ?? "unknown error"}).`,
      });
    }
  }
}

function validateRootKeys(
  filename: string,
  root: JsonObject,
  findings: F1ContractFinding[],
): void {
  const expected = EXPECTED_ROOT_KEYS.get(filename);
  if (
    expected === undefined ||
    !sameStringArray(Object.keys(root).sort(), sortedStrings(expected))
  ) {
    findings.push({
      code: "F1_ROOT_KEYS",
      path: `${filename}:$`,
      message: "JSON root keys must match the exact reviewed schema surface.",
    });
  }
}

function validateManifestIdentity(
  manifest: JsonObject,
  findings: F1ContractFinding[],
): void {
  validateRootKeys(MANIFEST_FILENAME, manifest, findings);
  for (const [key, expected] of Object.entries(EXPECTED_MANIFEST_IDENTITY)) {
    if (manifest[key] !== expected) {
      findings.push({
        code: "F1_CONTRACT_IDENTITY",
        path: `${MANIFEST_FILENAME}:$.${key}`,
        message: `Expected ${JSON.stringify(expected)}; received ${JSON.stringify(manifest[key])}.`,
      });
    }
  }
  if (!jsonEqual(manifest["fixtureObservationContract"], EXPECTED_OBSERVATION_CONTRACT)) {
    findings.push({
      code: "F1_OBSERVATION_CONTRACT",
      path: `${MANIFEST_FILENAME}:$.fixtureObservationContract`,
      message: "Fixture observations must retain their exact adapter contract to public result envelopes.",
    });
  }
  if (!jsonEqual(manifest["stageOwnership"], EXPECTED_STAGE_OWNERSHIP)) {
    findings.push({
      code: "F1_STAGE_OWNERSHIP",
      path: `${MANIFEST_FILENAME}:$.stageOwnership`,
      message: "F1/F2/F3/A0 ownership seams must remain explicit and unchanged.",
    });
  }
}

function validateFixedConstants(
  manifest: JsonObject,
  findings: F1ContractFinding[],
): void {
  const actual = manifest["fixedConstants"];
  if (!isObject(actual)) {
    findings.push({
      code: "F1_FIXED_CONSTANT",
      path: `${MANIFEST_FILENAME}:$.fixedConstants`,
      message: "Expected the complete fixed-constant object.",
    });
    return;
  }
  const expectedKeys = Object.keys(EXPECTED_FIXED_CONSTANTS).sort();
  const actualKeys = Object.keys(actual).sort();
  if (!sameStringArray(actualKeys, expectedKeys)) {
    findings.push({
      code: "F1_FIXED_CONSTANT",
      path: `${MANIFEST_FILENAME}:$.fixedConstants`,
      message: "Fixed constants must contain exactly the public F1 constant keys.",
    });
  }
  for (const key of expectedKeys) {
    if (!jsonEqual(actual[key], EXPECTED_FIXED_CONSTANTS[key])) {
      findings.push({
        code: "F1_FIXED_CONSTANT",
        path: `${MANIFEST_FILENAME}:$.fixedConstants.${key}`,
        message: `Fixed constant ${key} does not match the public domain contract.`,
      });
    }
  }
}

function validateAuthorityPolicy(
  manifest: JsonObject,
  findings: F1ContractFinding[],
): void {
  const policy = manifest["authorityPolicy"];
  if (!isObject(policy)) {
    findings.push({
      code: "F1_AUTHORITY_POLICY",
      path: `${MANIFEST_FILENAME}:$.authorityPolicy`,
      message: "Authority policy must be an object.",
    });
    return;
  }
  const requiredFalseFlags = [
    "expectedValuesGeneratedByProduction",
    "productionModulesImported",
    "productionArtifactUsedAsAuthority",
  ] as const;
  for (const flag of requiredFalseFlags) {
    if (policy[flag] !== false) {
      findings.push({
        code: "F1_AUTHORITY_POLICY",
        path: `${MANIFEST_FILENAME}:$.authorityPolicy.${flag}`,
        message: `${flag} must remain false; production cannot certify independent fixtures.`,
      });
    }
  }
  if (
    typeof policy["authoringMethod"] !== "string" ||
    policy["authoringMethod"].trim().length === 0
  ) {
    findings.push({
      code: "F1_AUTHORITY_POLICY",
      path: `${MANIFEST_FILENAME}:$.authorityPolicy.authoringMethod`,
      message: "Independent authoring method must be declared.",
    });
  }
}

function validateSeeds(
  manifest: JsonObject,
  findings: F1ContractFinding[],
): Set<string> {
  const determinism = manifest["determinism"];
  if (!isObject(determinism)) {
    findings.push({
      code: "F1_SEED_SHAPE",
      path: `${MANIFEST_FILENAME}:$.determinism`,
      message: "Determinism policy must be an object.",
    });
    return new Set();
  }
  if (determinism["propertyGenerator"] !== "xorshift32-v1") {
    findings.push({
      code: "F1_SEED_SHAPE",
      path: `${MANIFEST_FILENAME}:$.determinism.propertyGenerator`,
      message: "Expected the frozen xorshift32-v1 property generator.",
    });
  }
  const rawSeeds = determinism["stableSeeds"];
  if (!Array.isArray(rawSeeds)) {
    findings.push({
      code: "F1_SEED_SHAPE",
      path: `${MANIFEST_FILENAME}:$.determinism.stableSeeds`,
      message: "Stable seeds must be an array.",
    });
    return new Set();
  }
  const ids = new Set<string>();
  const values = new Set<number>();
  rawSeeds.forEach((raw, index) => {
    const path = `${MANIFEST_FILENAME}:$.determinism.stableSeeds[${String(index)}]`;
    if (!isObject(raw)) {
      findings.push({ code: "F1_SEED_SHAPE", path, message: "Seed must be an object." });
      return;
    }
    const id = raw["id"];
    const value = raw["value"];
    if (typeof id !== "string" || id.length === 0) {
      findings.push({ code: "F1_SEED_SHAPE", path: `${path}.id`, message: "Seed ID must be non-empty." });
    } else if (ids.has(id)) {
      findings.push({ code: "F1_SEED_DUPLICATE", path: `${path}.id`, message: `Duplicate seed ID ${id}.` });
    } else {
      ids.add(id);
    }
    if (
      typeof value !== "number" ||
      !Number.isInteger(value) ||
      value <= 0 ||
      value > 0xffff_ffff
    ) {
      findings.push({
        code: "F1_SEED_SHAPE",
        path: `${path}.value`,
        message: "xorshift32 seed must be an integer in 1...2^32-1.",
      });
    } else if (values.has(value)) {
      findings.push({ code: "F1_SEED_DUPLICATE", path: `${path}.value`, message: `Duplicate seed value ${String(value)}.` });
    } else {
      values.add(value);
    }
    if (typeof raw["purpose"] !== "string" || raw["purpose"].trim().length === 0) {
      findings.push({ code: "F1_SEED_SHAPE", path: `${path}.purpose`, message: "Seed purpose must be non-empty." });
    }
  });
  const actualSeedPairs = rawSeeds.map((raw) =>
    isObject(raw) ? [raw["id"], raw["value"]] : null
  );
  if (!jsonEqual(actualSeedPairs, EXPECTED_SEEDS)) {
    findings.push({
      code: "F1_SEED_INVENTORY",
      path: `${MANIFEST_FILENAME}:$.determinism.stableSeeds`,
      message: "Stable seed IDs, values, and order must match the reviewed F1 schedule.",
    });
  }
  return ids;
}

function companionDeclarations(
  manifest: JsonObject,
  findings: F1ContractFinding[],
): Array<Readonly<{ path: string; schema: string; recordCollections: string[] }>> {
  const rawCompanions = manifest["companions"];
  if (!Array.isArray(rawCompanions)) {
    findings.push({
      code: "F1_COMPANION_DECLARATION",
      path: `${MANIFEST_FILENAME}:$.companions`,
      message: "Companions must be an array.",
    });
    return [];
  }
  const declarations: Array<Readonly<{ path: string; schema: string; recordCollections: string[] }>> = [];
  const paths = new Set<string>();
  rawCompanions.forEach((raw, index) => {
    const path = `${MANIFEST_FILENAME}:$.companions[${String(index)}]`;
    if (!isObject(raw)) {
      findings.push({ code: "F1_COMPANION_DECLARATION", path, message: "Companion declaration must be an object." });
      return;
    }
    const keys = Object.keys(raw).sort();
    if (!sameStringArray(keys, [...EXPECTED_COMPANION_KEYS].sort())) {
      findings.push({
        code: "F1_COMPANION_DECLARATION",
        path,
        message: "Companion declaration must contain exactly path, schema, role, and recordCollections.",
      });
    }
    const filename = raw["path"];
    const schema = raw["schema"];
    const role = raw["role"];
    const collections = stringsFromUnknown(
      raw["recordCollections"],
      `${path}.recordCollections`,
      findings,
      { nonempty: true, unique: true },
    );
    if (
      typeof filename !== "string" ||
      filename.length === 0 ||
      basename(filename) !== filename ||
      !filename.endsWith(".json") ||
      filename === MANIFEST_FILENAME
    ) {
      findings.push({
        code: "F1_COMPANION_DECLARATION",
        path: `${path}.path`,
        message: "Companion path must be a safe sibling JSON filename.",
      });
      return;
    }
    if (paths.has(filename)) {
      findings.push({
        code: "F1_COMPANION_DECLARATION",
        path: `${path}.path`,
        message: `Duplicate companion declaration ${filename}.`,
      });
      return;
    }
    paths.add(filename);
    if (typeof schema !== "string" || schema.length === 0) {
      findings.push({ code: "F1_COMPANION_DECLARATION", path: `${path}.schema`, message: "Companion schema must be non-empty." });
      return;
    }
    if (typeof role !== "string" || role.trim().length === 0) {
      findings.push({ code: "F1_COMPANION_DECLARATION", path: `${path}.role`, message: "Companion role must be non-empty." });
    }
    declarations.push({ path: filename, schema, recordCollections: collections });
  });
  const actualByPath = new Map(declarations.map((item) => [item.path, item]));
  for (const expected of EXPECTED_COMPANIONS) {
    const actual = actualByPath.get(expected.path);
    if (
      actual === undefined ||
      actual.schema !== expected.schema ||
      !sameStringArray(actual.recordCollections, expected.recordCollections)
    ) {
      findings.push({
        code: "F1_COMPANION_DECLARATION",
        path: `${MANIFEST_FILENAME}:$.companions`,
        message: `Missing or altered companion declaration for ${expected.path}.`,
      });
    }
  }
  const expectedPaths: ReadonlySet<string> = new Set<string>(
    EXPECTED_COMPANIONS.map((item) => item.path),
  );
  for (const declaration of declarations) {
    if (!expectedPaths.has(declaration.path)) {
      findings.push({
        code: "F1_COMPANION_DECLARATION",
        path: `${MANIFEST_FILENAME}:$.companions`,
        message: `Unexpected companion declaration ${declaration.path}.`,
      });
    }
  }
  return declarations;
}

async function validateCompanionInventory(
  fixtureRoot: string,
  declarations: readonly Readonly<{ path: string; schema: string; recordCollections: string[] }>[],
  findings: F1ContractFinding[],
): Promise<ParsedCompanion[]> {
  let filenames: string[] = [];
  try {
    filenames = (await readdir(fixtureRoot))
      .filter((name) => name.endsWith(".json"))
      .sort();
  } catch (error) {
    findings.push({
      code: "F1_COMPANION_INVENTORY",
      path: ".",
      message: `Unable to enumerate fixture root (${nodeErrorCode(error) ?? "unknown error"}).`,
    });
  }
  const declared = new Set(declarations.map((item) => item.path));
  for (const filename of filenames) {
    if (filename !== MANIFEST_FILENAME && !declared.has(filename)) {
      findings.push({
        code: "F1_COMPANION_UNDECLARED",
        path: filename,
        message: "JSON companion is not declared by the F1 manifest.",
      });
    }
  }

  const parsed: ParsedCompanion[] = [];
  for (const declaration of declarations) {
    const root = await parseJsonObject(
      fixtureRoot,
      declaration.path,
      findings,
      "F1_COMPANION_MISSING",
    );
    if (!root) continue;
    validateRootKeys(declaration.path, root, findings);
    if (root["schema"] !== declaration.schema) {
      findings.push({
        code: "F1_COMPANION_SCHEMA",
        path: `${declaration.path}:$.schema`,
        message: `Expected ${JSON.stringify(declaration.schema)}.`,
      });
    }
    for (const collection of declaration.recordCollections) {
      if (!Array.isArray(root[collection])) {
        findings.push({
          code: "F1_COMPANION_COLLECTION",
          path: `${declaration.path}:$.${collection}`,
          message: "Declared record collection must be an array.",
        });
      }
    }
    parsed.push({ ...declaration, root });
  }
  return parsed;
}

function validateCaseInventories(
  companions: readonly ParsedCompanion[],
  findings: F1ContractFinding[],
): void {
  const seenCollections = new Set<string>();
  for (const companion of companions) {
    for (const collection of companion.recordCollections) {
      const key = `${companion.path}#${collection}`;
      const expectedIds = EXPECTED_CASE_IDS_BY_COLLECTION.get(key);
      if (expectedIds === undefined) continue;
      seenCollections.add(key);
      const rows = companion.root[collection];
      const actualIds = Array.isArray(rows)
        ? rows.map((row) => isObject(row) ? row["id"] : null)
        : [];
      if (!jsonEqual(actualIds, expectedIds)) {
        findings.push({
          code: "F1_CASE_INVENTORY",
          path: `${companion.path}:$.${collection}`,
          message: "Case IDs must match the exact reviewed collection inventory and order.",
        });
      }
    }
  }
  for (const key of EXPECTED_CASE_IDS_BY_COLLECTION.keys()) {
    if (!seenCollections.has(key)) {
      findings.push({
        code: "F1_CASE_INVENTORY",
        path: key,
        message: "Reviewed case collection is missing from parsed companions.",
      });
    }
  }
}

function fixtureCases(
  companions: readonly ParsedCompanion[],
  seedIds: ReadonlySet<string>,
  findings: F1ContractFinding[],
): FixtureCase[] {
  const cases: FixtureCase[] = [];
  const seenIds = new Map<string, string>();
  for (const companion of companions) {
    if (!companion.path.endsWith("-cases.json")) continue;
    const defaultSeedId = companion.root["defaultSeedId"];
    if (typeof defaultSeedId !== "string" || !seedIds.has(defaultSeedId)) {
      findings.push({
        code: "F1_SEED_REFERENCE_UNKNOWN",
        path: `${companion.path}:$.defaultSeedId`,
        message: `Default seed ${JSON.stringify(defaultSeedId)} is not declared by the manifest.`,
      });
    }
    for (const collection of companion.recordCollections) {
      const rawRecords = companion.root[collection];
      if (!Array.isArray(rawRecords)) continue;
      const collectionIds: string[] = [];
      rawRecords.forEach((raw, index) => {
        const path = `${companion.path}:$.${collection}[${String(index)}]`;
        if (!isObject(raw) || typeof raw["id"] !== "string" || raw["id"].length === 0) {
          findings.push({ code: "F1_CASE_SHAPE", path, message: "Fixture case requires a non-empty string ID." });
          return;
        }
        const id = raw["id"];
        collectionIds.push(id);
        const previousPath = seenIds.get(id);
        if (previousPath !== undefined) {
          findings.push({
            code: "F1_CASE_ID_DUPLICATE",
            path: `${path}.id`,
            message: `Case ID ${id} already appears at ${previousPath}.`,
          });
        } else {
          seenIds.set(id, `${path}.id`);
        }
        const traceIds = stringsFromUnknown(raw["traceIds"], `${path}.traceIds`, findings, { nonempty: true, unique: true });
        const authorityIds = stringsFromUnknown(raw["authorityIds"], `${path}.authorityIds`, findings, { nonempty: true, unique: true });
        cases.push({ id, path, record: raw, traceIds, authorityIds });
      });
      const expected = sortedStrings(collectionIds);
      if (!sameStringArray(collectionIds, expected)) {
        findings.push({
          code: "F1_CASE_ID_ORDER",
          path: `${companion.path}:$.${collection}`,
          message: "Case IDs must be in stable lexical order within each declared case collection.",
        });
      }
      for (let index = 1; index < collectionIds.length; index += 1) {
        if ((collectionIds[index - 1] ?? "") >= (collectionIds[index] ?? "")) {
          findings.push({
            code: "F1_CASE_ID_ORDER",
            path: `${companion.path}:$.${collection}[${String(index)}].id`,
            message: "Case IDs must increase strictly; duplicates are not an ordering shortcut.",
          });
          break;
        }
      }
    }
  }
  return cases;
}

function ledgerRecords(
  companion: ParsedCompanion | undefined,
  collection: string,
  idCode: string,
  findings: F1ContractFinding[],
): Map<string, JsonObject> {
  const result = new Map<string, JsonObject>();
  if (!companion) return result;
  const records = companion.root[collection];
  if (!Array.isArray(records)) return result;
  records.forEach((raw, index) => {
    const path = `${companion.path}:$.${collection}[${String(index)}]`;
    if (!isObject(raw) || typeof raw["id"] !== "string" || raw["id"].length === 0) {
      findings.push({ code: idCode, path, message: "Ledger record requires a non-empty string ID." });
      return;
    }
    if (result.has(raw["id"])) {
      findings.push({ code: idCode, path: `${path}.id`, message: `Duplicate ledger ID ${raw["id"]}.` });
      return;
    }
    result.set(raw["id"], raw);
  });
  return result;
}

function validateLedgerInventories(
  traces: ReadonlyMap<string, JsonObject>,
  authorities: ReadonlyMap<string, JsonObject>,
  findings: F1ContractFinding[],
): void {
  if (!jsonEqual([...traces.keys()], EXPECTED_TRACE_IDS)) {
    findings.push({
      code: "F1_TRACE_INVENTORY",
      path: "trace-ledger.json:$.traces",
      message: "Trace IDs and order must match the complete reviewed F1 requirement inventory.",
    });
  }
  if (!jsonEqual([...authorities.keys()], EXPECTED_AUTHORITY_IDS)) {
    findings.push({
      code: "F1_AUTHORITY_INVENTORY",
      path: "provenance-ledger.json:$.authorities",
      message: "Authority IDs and order must match the reviewed project/external authority split.",
    });
  }

  for (const [id, trace] of traces) {
    const path = `trace-ledger.json:$.traces.${id}`;
    if (
      typeof trace["parentClause"] !== "string" ||
      trace["parentClause"].trim().length === 0
    ) {
      findings.push({ code: "F1_TRACE_LEDGER", path, message: "Trace requires a nonempty parent clause." });
    }
    stringsFromUnknown(trace["sourceRefs"], `${path}.sourceRefs`, findings, {
      nonempty: true,
      unique: true,
    });
    stringsFromUnknown(trace["proofKinds"], `${path}.proofKinds`, findings, {
      nonempty: true,
      unique: true,
    });
    const hasCases = Array.isArray(trace["requiredCaseIds"]) &&
      trace["requiredCaseIds"].length > 0;
    const hasPrefixes = Array.isArray(trace["requiredFixturePrefixes"]) &&
      trace["requiredFixturePrefixes"].length > 0;
    if (!hasCases && !hasPrefixes) {
      findings.push({
        code: "F1_TRACE_LEDGER",
        path,
        message: "Trace must name exact required cases or an all-match fixture prefix.",
      });
    }
  }

  for (const [id, authority] of authorities) {
    const path = `provenance-ledger.json:$.authorities.${id}`;
    const sourceRefs = stringsFromUnknown(
      authority["sourceRefs"],
      `${path}.sourceRefs`,
      findings,
      { nonempty: true, unique: true },
    );
    if (sourceRefs.some((sourceRef) => /\.md:\d+(?:-\d+)?$/.test(sourceRef))) {
      findings.push({
        code: "F1_AUTHORITY_STALE_REFERENCE",
        path: `${path}.sourceRefs`,
        message: "Authority references use stable section anchors, not drift-prone line numbers.",
      });
    }
    if (
      typeof authority["covers"] !== "string" ||
      authority["covers"].trim().length === 0 ||
      authority["expectationClass"] !==
        EXPECTED_AUTHORITY_EXPECTATION_CLASS.get(id)
    ) {
      findings.push({
        code: "F1_AUTHORITY_LEDGER",
        path,
        message: "Authority requires coverage text and its exact reviewed expectation class.",
      });
    }
  }
}

function validateProvenancePolicy(
  provenance: ParsedCompanion | undefined,
  authorities: ReadonlyMap<string, JsonObject>,
  findings: F1ContractFinding[],
): void {
  if (!provenance) return;
  if (!jsonEqual(
    provenance.root["classificationPolicy"],
    EXPECTED_AUTHORITY_CLASSIFICATION_POLICY,
  )) {
    findings.push({
      code: "F1_AUTHORITY_POLICY",
      path: `${provenance.path}:$.classificationPolicy`,
      message: "Authority expectation classes must retain their exact reviewed definitions.",
    });
  }
  for (const flag of ["productionOutputUsed", "expectedValuesGenerated"] as const) {
    if (provenance.root[flag] !== false) {
      findings.push({
        code: "F1_AUTHORITY_POLICY",
        path: `${provenance.path}:$.${flag}`,
        message: `${flag} must remain false.`,
      });
    }
  }
  if (
    typeof provenance.root["authoringStatement"] !== "string" ||
    provenance.root["authoringStatement"].trim().length === 0
  ) {
    findings.push({
      code: "F1_AUTHORITY_POLICY",
      path: `${provenance.path}:$.authoringStatement`,
      message: "Independent fixture authoring statement is required.",
    });
  }
  for (const [id, authority] of authorities) {
    const authorityClass = authority["authorityClass"];
    if (typeof authorityClass !== "string" || authorityClass.trim().length === 0) {
      findings.push({
        code: "F1_AUTHORITY_POLICY",
        path: `${provenance.path}:$.authorities.${id}.authorityClass`,
        message: "Authority class must be declared.",
      });
    } else if (/production\s+(artifact|module|output)|production authority/i.test(authorityClass)) {
      findings.push({
        code: "F1_AUTHORITY_POLICY",
        path: `${provenance.path}:$.authorities.${id}.authorityClass`,
        message: "Production output or implementation cannot be fixture authority.",
      });
    }
    if (authority["expectationClass"] === "external-definition") {
      const sourceRefs = Array.isArray(authority["sourceRefs"])
        ? authority["sourceRefs"]
        : [];
      if (!sourceRefs.some((sourceRef) =>
        typeof sourceRef === "string" && /^https:\/\//.test(sourceRef)
      )) {
        findings.push({
          code: "F1_AUTHORITY_POLICY",
          path: `${provenance.path}:$.authorities.${id}.sourceRefs`,
          message: "External definitions require at least one absolute HTTPS standards source.",
        });
      }
    }
  }
}

function validateTraceAndAuthorityReferences(
  cases: readonly FixtureCase[],
  traces: ReadonlyMap<string, JsonObject>,
  authorities: ReadonlyMap<string, JsonObject>,
  findings: F1ContractFinding[],
): void {
  const casesById = new Map(cases.map((item) => [item.id, item]));
  const traceUses = new Map<string, number>();
  const authorityUses = new Map<string, number>();
  for (const fixtureCase of cases) {
    for (const traceId of fixtureCase.traceIds) {
      if (!traces.has(traceId)) {
        findings.push({
          code: "F1_TRACE_UNKNOWN",
          path: `${fixtureCase.path}.traceIds`,
          message: `Unknown trace ID ${traceId}.`,
        });
      } else {
        traceUses.set(traceId, (traceUses.get(traceId) ?? 0) + 1);
      }
    }
    for (const authorityId of fixtureCase.authorityIds) {
      if (!authorities.has(authorityId)) {
        findings.push({
          code: "F1_AUTHORITY_UNKNOWN",
          path: `${fixtureCase.path}.authorityIds`,
          message: `Unknown authority ID ${authorityId}.`,
        });
      } else {
        authorityUses.set(authorityId, (authorityUses.get(authorityId) ?? 0) + 1);
      }
    }
  }
  for (const [traceId, trace] of traces) {
    if (!traceUses.has(traceId)) {
      findings.push({
        code: "F1_TRACE_ORPHAN",
        path: `trace-ledger.json:$.traces.${traceId}`,
        message: "Trace is not referenced by any fixture case.",
      });
    }
    const requiredCaseIds = trace["requiredCaseIds"];
    if (requiredCaseIds !== undefined) {
      const ids = stringsFromUnknown(
        requiredCaseIds,
        `trace-ledger.json:$.traces.${traceId}.requiredCaseIds`,
        findings,
        { unique: true },
      );
      for (const caseId of ids) {
        const fixtureCase = casesById.get(caseId);
        if (!fixtureCase) {
          findings.push({
            code: "F1_TRACE_CASE_UNKNOWN",
            path: `trace-ledger.json:$.traces.${traceId}.requiredCaseIds`,
            message: `Required case ${caseId} does not exist.`,
          });
        } else if (!fixtureCase.traceIds.includes(traceId)) {
          findings.push({
            code: "F1_TRACE_CASE_BACKLINK",
            path: `trace-ledger.json:$.traces.${traceId}.requiredCaseIds`,
            message: `Required case ${caseId} does not link back to ${traceId}.`,
          });
        }
      }
    }
    const prefixes = trace["requiredFixturePrefixes"];
    if (prefixes !== undefined) {
      for (const prefix of stringsFromUnknown(
        prefixes,
        `trace-ledger.json:$.traces.${traceId}.requiredFixturePrefixes`,
        findings,
        { nonempty: true, unique: true },
      )) {
        const matchingCases = cases.filter((item) => item.id.startsWith(prefix));
        if (matchingCases.length === 0) {
          findings.push({
            code: "F1_TRACE_PREFIX_UNCOVERED",
            path: `trace-ledger.json:$.traces.${traceId}.requiredFixturePrefixes`,
            message: `No fixture case matches required prefix ${prefix}*.`,
          });
          continue;
        }
        for (const matchingCase of matchingCases) {
          if (!matchingCase.traceIds.includes(traceId)) {
            findings.push({
              code: "F1_TRACE_PREFIX_BACKLINK",
              path: `${matchingCase.path}.traceIds`,
              message: `${matchingCase.id} matches ${prefix}* but does not link back to ${traceId}.`,
            });
          }
        }
      }
    }

    const proofKinds = Array.isArray(trace["proofKinds"])
      ? trace["proofKinds"].filter((value): value is string =>
          typeof value === "string" && value.length > 0
        )
      : [];
    const proofCaseIds = trace["proofCaseIds"];
    if (
      !isObject(proofCaseIds) ||
      !sameStringArray(
        Object.keys(proofCaseIds).sort(),
        sortedStrings(proofKinds),
      )
    ) {
      findings.push({
        code: "F1_TRACE_PROOF_MAP",
        path: `trace-ledger.json:$.traces.${traceId}.proofCaseIds`,
        message: "Every declared proof kind must map to one or more exact fixture case IDs.",
      });
    } else {
      for (const proofKind of proofKinds) {
        const ids = stringsFromUnknown(
          proofCaseIds[proofKind],
          `trace-ledger.json:$.traces.${traceId}.proofCaseIds.${proofKind}`,
          findings,
          { nonempty: true, unique: true },
        );
        for (const caseId of ids) {
          const fixtureCase = casesById.get(caseId);
          if (!fixtureCase) {
            findings.push({
              code: "F1_TRACE_PROOF_CASE_UNKNOWN",
              path: `trace-ledger.json:$.traces.${traceId}.proofCaseIds.${proofKind}`,
              message: `Proof case ${caseId} does not exist.`,
            });
          } else if (!fixtureCase.traceIds.includes(traceId)) {
            findings.push({
              code: "F1_TRACE_PROOF_CASE_BACKLINK",
              path: `${fixtureCase.path}.traceIds`,
              message: `Proof case ${caseId} does not link back to ${traceId}.`,
            });
          }
        }
      }
    }
  }
  for (const authorityId of authorities.keys()) {
    if (!authorityUses.has(authorityId)) {
      findings.push({
        code: "F1_AUTHORITY_ORPHAN",
        path: `provenance-ledger.json:$.authorities.${authorityId}`,
        message: "Authority is not referenced by any fixture case.",
      });
    }
  }
}

function collectCodeProperties(value: unknown, path: string): Array<Readonly<{ code: string; path: string }>> {
  const result: Array<Readonly<{ code: string; path: string }>> = [];
  const visit = (current: unknown, currentPath: string): void => {
    if (Array.isArray(current)) {
      current.forEach((item, index) => {
        visit(item, `${currentPath}[${String(index)}]`);
      });
      return;
    }
    if (!isObject(current)) return;
    for (const [key, child] of Object.entries(current)) {
      const childPath = `${currentPath}.${key}`;
      if (key === "code" && typeof child === "string") {
        result.push({ code: child, path: childPath });
      }
      visit(child, childPath);
    }
  };
  visit(value, path);
  return result;
}

function collectInvalidStatuses(
  value: unknown,
  path: string,
): Array<Readonly<{ code: string; path: string }>> {
  const result: Array<Readonly<{ code: string; path: string }>> = [];
  const visit = (current: unknown, currentPath: string): void => {
    if (typeof current === "string" && current.startsWith("invalid:")) {
      result.push({
        code: current.slice("invalid:".length),
        path: currentPath,
      });
      return;
    }
    if (Array.isArray(current)) {
      current.forEach((item, index) => {
        visit(item, `${currentPath}[${String(index)}]`);
      });
      return;
    }
    if (!isObject(current)) return;
    for (const [key, child] of Object.entries(current)) {
      visit(child, `${currentPath}.${key}`);
    }
  };
  visit(value, path);
  return result;
}

function validateExpectedIssueCodes(
  cases: readonly FixtureCase[],
  findings: F1ContractFinding[],
): Set<string> {
  const observedCodes = new Set<string>();
  for (const fixtureCase of cases) {
    const expected = fixtureCase.record["expected"];
    if (isObject(expected)) {
      const codes = collectCodeProperties(expected, `${fixtureCase.path}.expected`);
      if (expected["ok"] === true && codes.length > 0) {
        for (const item of codes) {
          findings.push({
            code: "F1_SUCCESS_CARRIES_ISSUE_CODE",
            path: item.path,
            message: `Successful expectation must not carry rejection code ${item.code}.`,
          });
        }
      } else {
        for (const item of codes) {
          observedCodes.add(item.code);
          if (!ISSUE_CODE_VALUES.has(item.code)) {
            findings.push({
              code: "F1_EXPECTED_ISSUE_CODE_UNKNOWN",
              path: item.path,
              message: `Expected rejection code ${item.code} is not exported by the public domain index.`,
            });
          }
        }
      }
    }
    for (const item of collectInvalidStatuses(fixtureCase.record, fixtureCase.path)) {
      observedCodes.add(item.code);
      if (!ISSUE_CODE_VALUES.has(item.code)) {
        findings.push({
          code: "F1_EXPECTED_ISSUE_CODE_UNKNOWN",
          path: item.path,
          message: `Expected rejection code ${item.code} is not exported by the public domain index.`,
        });
      }
    }
  }
  if (!sameStringArray(
    sortedStrings([...observedCodes]),
    sortedStrings(EXPECTED_FIXTURE_ISSUE_CODES),
  )) {
    findings.push({
      code: "F1_EXPECTED_ISSUE_CODE_INVENTORY",
      path: "$computedExpectedIssueCodes",
      message: "Expected issue codes must match the exact reviewed 87-code inventory.",
    });
  }
  return observedCodes;
}

const NATURAL_PITCH_CLASSES: Readonly<Record<string, number>> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

function euclideanModulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

function independentPitchProjection(value: JsonObject): Readonly<{
  constructionCode?: string;
  pitchClass?: number;
  projectedMidi?: number;
  frequencyHz?: number;
}> {
  const step = value["step"];
  const alter = value["alter"];
  const octave = value["octave"];
  if (typeof step !== "string" || NATURAL_PITCH_CLASSES[step] === undefined) {
    return { constructionCode: "pitch.step_invalid" };
  }
  if (typeof alter !== "number" || !Number.isInteger(alter) || alter < -2 || alter > 2) {
    return { constructionCode: "pitch.alter_out_of_range" };
  }
  if (typeof octave !== "number" || !Number.isInteger(octave)) {
    return { constructionCode: "pitch.octave_not_integer" };
  }
  if (!Number.isSafeInteger(octave)) {
    return { constructionCode: "pitch.octave_not_safe_integer" };
  }
  const chromatic = (NATURAL_PITCH_CLASSES[step] ?? 0) + alter;
  const projectedMidi = 12 * (octave + 1) + chromatic;
  return {
    pitchClass: euclideanModulo(chromatic, 12),
    projectedMidi,
    frequencyHz: 440 * 2 ** ((projectedMidi - 69) / 12),
  };
}

function validatePitchCases(
  pitch: ParsedCompanion | undefined,
  findings: F1ContractFinding[],
): void {
  if (!pitch) return;
  if (
    pitch.root["frequencyFormula"] !== "440 * 2^((midi - 69) / 12)" ||
    pitch.root["frequencyAbsoluteToleranceHz"] !== 1e-9
  ) {
    findings.push({
      code: "F1_PITCH_AUTHORITY",
      path: `${pitch.path}:$`,
      message: "Pitch authority must retain the reviewed 12-TET formula and absolute tolerance.",
    });
  }
  const rows = pitch.root["cases"];
  if (!Array.isArray(rows)) return;
  for (const [index, raw] of rows.entries()) {
    if (!isObject(raw)) continue;
    const path = `${pitch.path}:$.cases[${String(index)}]`;
    const kind = raw["kind"];
    const expected = raw["expected"];
    if (kind === "project-spelled-pitch" && isObject(raw["input"]) && isObject(expected)) {
      const projection = independentPitchProjection(raw["input"]);
      const inMidi = projection.projectedMidi !== undefined &&
        projection.projectedMidi >= MIN_MIDI_PITCH &&
        projection.projectedMidi <= MAX_MIDI_PITCH;
      if (projection.constructionCode !== undefined) {
        findings.push({ code: "F1_PITCH_ORACLE", path, message: "Projection fixture must begin with a constructible spelled pitch." });
      } else if (inMidi) {
        const actualFrequency = expected["frequencyHz"];
        if (
          expected["ok"] !== true ||
          expected["pitchClass"] !== projection.pitchClass ||
          expected["midi"] !== projection.projectedMidi ||
          typeof actualFrequency !== "number" ||
          projection.frequencyHz === undefined ||
          Math.abs(actualFrequency - projection.frequencyHz) > 1e-9
        ) {
          findings.push({ code: "F1_PITCH_ORACLE", path: `${path}.expected`, message: "Pitch-class, MIDI, or frequency golden disagrees with independent scientific-pitch arithmetic." });
        }
      } else if (
        expected["ok"] !== false ||
        expected["projectedMidi"] !== projection.projectedMidi ||
        expected["spelledValueRetained"] !== true ||
        !isObject(expected["issue"]) ||
        expected["issue"]["code"] !== "pitch.midi_out_of_range"
      ) {
        findings.push({ code: "F1_PITCH_ORACLE", path: `${path}.expected`, message: "Out-of-MIDI projection must refuse while retaining spelling and exact projected value." });
      }
    } else if (kind === "compare-spelled-pitches" && isObject(raw["left"]) && isObject(raw["right"]) && isObject(expected)) {
      const left = raw["left"];
      const right = raw["right"];
      const leftProjection = independentPitchProjection(left);
      const rightProjection = independentPitchProjection(right);
      const spelledEqual = left["step"] === right["step"] &&
        left["alter"] === right["alter"] && left["octave"] === right["octave"];
      if (
        expected["spelledEqual"] !== spelledEqual ||
        expected["midiEqual"] !==
          (leftProjection.projectedMidi === rightProjection.projectedMidi) ||
        expected["pitchClassEqual"] !==
          (leftProjection.pitchClass === rightProjection.pitchClass)
      ) {
        findings.push({ code: "F1_PITCH_ORACLE", path: `${path}.expected`, message: "Spelled/MIDI/pitch-class equality observation is incorrect." });
      }
    } else if (kind === "midi-to-frequency" && isObject(raw["input"]) && isObject(expected)) {
      const midi = raw["input"]["midi"];
      const expectedCode = typeof midi !== "number" || !Number.isInteger(midi)
        ? "pitch.midi_not_integer"
        : midi < 0 || midi > 127
          ? "pitch.midi_out_of_range"
          : null;
      if (
        expectedCode === null ||
        expected["ok"] !== false ||
        !isObject(expected["issue"]) ||
        expected["issue"]["code"] !== expectedCode
      ) {
        findings.push({ code: "F1_PITCH_ORACLE", path: `${path}.expected`, message: "MIDI-to-frequency refusal observation is incorrect." });
      }
    } else if (kind === "decode-spelled-pitch" && isObject(raw["input"]) && isObject(expected)) {
      const projection = independentPitchProjection(raw["input"]);
      if (
        projection.constructionCode === undefined ||
        expected["ok"] !== false ||
        !isObject(expected["issue"]) ||
        expected["issue"]["code"] !== projection.constructionCode
      ) {
        findings.push({ code: "F1_PITCH_ORACLE", path: `${path}.expected`, message: "Spelled-pitch construction refusal disagrees with the independent bounds." });
      }
    } else if (kind === "natural-step-projection-set") {
      if (
        !jsonEqual(raw["inputSteps"], ["A", "B", "C", "D", "E", "F", "G"]) ||
        !jsonEqual(raw["expectedNaturalPitchClasses"], [9, 11, 0, 2, 4, 5, 7])
      ) {
        findings.push({ code: "F1_PITCH_ORACLE", path, message: "Natural step projection table is incomplete or incorrect." });
      }
    } else if (kind === "allowed-alter-projection-set") {
      if (
        !jsonEqual(raw["expectedMidi"], [60, 61, 62, 63, 64]) ||
        !jsonEqual(raw["expectedPitchClasses"], [0, 1, 2, 3, 4])
      ) {
        findings.push({ code: "F1_PITCH_ORACLE", path, message: "D4 double-flat through double-sharp projection table is incorrect." });
      }
    } else if (kind === "compare-spelling-step-order") {
      if (!jsonEqual(raw["expectedOrder"], ["C", "D", "E", "F", "G", "A", "B"])) {
        findings.push({ code: "F1_PITCH_ORACLE", path, message: "Spelling comparator order must remain C through B." });
      }
    } else if (kind === "parallel-transposed-enharmonic-pair" && isObject(expected)) {
      const source = Array.isArray(raw["source"])
        ? raw["source"].filter(isObject).map(independentPitchProjection)
        : [];
      const transposed = Array.isArray(raw["transposed"])
        ? raw["transposed"].filter(isObject).map(independentPitchProjection)
        : [];
      const sourceMidi = source.map((item) => item.projectedMidi);
      const transposedMidi = transposed.map((item) => item.projectedMidi);
      const spelledInterval = raw["spelledInterval"];
      const semitones = isObject(spelledInterval)
        ? spelledInterval["semitones"]
        : undefined;
      if (
        !isObject(spelledInterval) ||
        spelledInterval["diatonicSteps"] !== 1 ||
        spelledInterval["direction"] !== "up" ||
        semitones !== 2 ||
        !jsonEqual(expected["sourceMidi"], sourceMidi) ||
        !jsonEqual(expected["transposedMidi"], transposedMidi) ||
        !transposedMidi.every((midi, midiIndex) =>
          typeof midi === "number" && typeof sourceMidi[midiIndex] === "number" &&
          midi - (sourceMidi[midiIndex] ?? 0) === semitones
        )
      ) {
        findings.push({ code: "F1_PITCH_ORACLE", path, message: "Transposed enharmonic relation does not preserve the declared semitone delta." });
      }
    }
  }
}

type PairwiseExecutionMetrics = Readonly<{
  orderedPairs: number;
  additions: number;
  comparisons: number;
  subtractionValues: number;
  subtractionNegativeRefusals: number;
}>;

function reducedTicks(value: JsonObject): number | null {
  const numerator = value["numerator"];
  const denominator = value["denominator"];
  if (
    typeof numerator !== "number" ||
    typeof denominator !== "number" ||
    !Number.isInteger(numerator) ||
    !Number.isInteger(denominator) ||
    denominator <= 0 ||
    MIDI_PPQ % denominator !== 0
  ) return null;
  return numerator * (MIDI_PPQ / denominator);
}

function validateBeatCoverage(
  beat: ParsedCompanion | undefined,
  findings: F1ContractFinding[],
): PairwiseExecutionMetrics {
  const metrics = {
    orderedPairs: 0,
    additions: 0,
    comparisons: 0,
    subtractionValues: 0,
    subtractionNegativeRefusals: 0,
  };
  if (!beat) return metrics;
  if (beat.root["ppq"] !== MIDI_PPQ) {
    findings.push({ code: "F1_BEAT_DIVISOR_COVERAGE", path: `${beat.path}:$.ppq`, message: `Expected PPQ ${String(MIDI_PPQ)}.` });
  }
  const rawDivisors = beat.root["divisorCases"];
  if (!Array.isArray(rawDivisors)) return metrics;
  const denominators: number[] = [];
  const divisorCaseIds: string[] = [];
  const unitTicksByDenominator = new Map<number, number>();
  rawDivisors.forEach((raw, index) => {
    const path = `${beat.path}:$.divisorCases[${String(index)}]`;
    if (!isObject(raw)) return;
    if (typeof raw["denominator"] === "number") denominators.push(raw["denominator"]);
    if (typeof raw["id"] === "string") divisorCaseIds.push(raw["id"]);
    const denominator = raw["denominator"];
    if (typeof denominator !== "number" || !Number.isInteger(denominator) || denominator <= 0) {
      findings.push({ code: "F1_BEAT_DIVISOR_COVERAGE", path: `${path}.denominator`, message: "Divisor denominator must be a positive integer." });
      return;
    }
    if (raw["unitTicks"] !== MIDI_PPQ / denominator) {
      findings.push({ code: "F1_BEAT_DIVISOR_COVERAGE", path: `${path}.unitTicks`, message: "unitTicks must be the independent PPQ unit-fraction oracle." });
    } else if (typeof raw["unitTicks"] === "number") {
      unitTicksByDenominator.set(denominator, raw["unitTicks"]);
    }
    if (!jsonEqual(raw["doubleUnit"], reduced(2, denominator))) {
      findings.push({ code: "F1_BEAT_DIVISOR_COVERAGE", path: `${path}.doubleUnit`, message: "doubleUnit must be independently reduced." });
    }
  });
  if (!jsonEqual(denominators, [...ALLOWED_BEAT_DENOMINATORS])) {
    findings.push({
      code: "F1_BEAT_DIVISOR_COVERAGE",
      path: `${beat.path}:$.divisorCases`,
      message: "Divisor cases must cover the exact ordered 28-divisor PPQ set.",
    });
  }
  const pairwise = beat.root["pairwiseClosureCases"];
  if (!Array.isArray(pairwise) || pairwise.length !== 1 || !isObject(pairwise[0])) {
    findings.push({
      code: "F1_PAIRWISE_ORACLE",
      path: `${beat.path}:$.pairwiseClosureCases`,
      message: "Exactly one declared pairwise closure oracle is required.",
    });
    return metrics;
  }
  const oracleRow = pairwise[0];
  if (
    oracleRow["kind"] !== "cartesian-unit-fraction-closure" ||
    oracleRow["orderedPairCount"] !== ALLOWED_BEAT_DENOMINATORS.length ** 2 ||
    !jsonEqual(oracleRow["leftAndRightCaseIds"], divisorCaseIds)
  ) {
    findings.push({
      code: "F1_PAIRWISE_ORACLE",
      path: `${beat.path}:$.pairwiseClosureCases[0]`,
      message: "Pairwise oracle must declare the complete ordered 28x28 Cartesian product (784 pairs).",
    });
  }
  const oracle = oracleRow["independentTickOracle"];
  if (!jsonEqual(oracle, EXPECTED_PAIRWISE_TICK_ORACLE)) {
    findings.push({
      code: "F1_PAIRWISE_ORACLE",
      path: `${beat.path}:$.pairwiseClosureCases[0].independentTickOracle`,
      message: "Independent tick oracle must retain the exact executable PPQ-integer operation contract.",
    });
  }

  const allowedDenominators = new Set<number>(ALLOWED_BEAT_DENOMINATORS);
  const partition = { less: 0, equal: 0, greater: 0 };
  let closureFailure = false;
  for (const leftDenominator of ALLOWED_BEAT_DENOMINATORS) {
    for (const rightDenominator of ALLOWED_BEAT_DENOMINATORS) {
      const leftTicks = unitTicksByDenominator.get(leftDenominator);
      const rightTicks = unitTicksByDenominator.get(rightDenominator);
      if (leftTicks === undefined || rightTicks === undefined) {
        closureFailure = true;
        continue;
      }
      metrics.orderedPairs += 1;
      metrics.comparisons += 1;
      if (leftTicks < rightTicks) partition.less += 1;
      else if (leftTicks > rightTicks) partition.greater += 1;
      else partition.equal += 1;

      const sum = reduced(leftTicks + rightTicks, MIDI_PPQ);
      metrics.additions += 1;
      if (
        typeof sum["denominator"] !== "number" ||
        !allowedDenominators.has(sum["denominator"]) ||
        reducedTicks(sum) !== leftTicks + rightTicks
      ) {
        closureFailure = true;
      }
      if (leftTicks >= rightTicks) {
        const difference = reduced(leftTicks - rightTicks, MIDI_PPQ);
        metrics.subtractionValues += 1;
        if (
          typeof difference["denominator"] !== "number" ||
          !allowedDenominators.has(difference["denominator"]) ||
          reducedTicks(difference) !== leftTicks - rightTicks
        ) {
          closureFailure = true;
        }
      } else {
        metrics.subtractionNegativeRefusals += 1;
      }
    }
  }
  if (
    closureFailure ||
    !jsonEqual(metrics, {
      orderedPairs: 784,
      additions: 784,
      comparisons: 784,
      subtractionValues: 406,
      subtractionNegativeRefusals: 378,
    }) ||
    !jsonEqual(partition, { less: 378, equal: 28, greater: 378 })
  ) {
    findings.push({
      code: "F1_PAIRWISE_ORACLE_EXECUTION",
      path: `${beat.path}:$.pairwiseClosureCases[0]`,
      message: "The independent tick oracle must execute 784 exact additions, 784 comparisons, 406 subtraction values, and 378 negative-result refusals.",
    });
  }
  return metrics;
}

function expectedMeterGrid(): Array<Readonly<{ beatsPerBar: number; beatUnit: number }>> {
  const result: Array<Readonly<{ beatsPerBar: number; beatUnit: number }>> = [];
  for (const beatUnit of [2, 4, 8]) {
    for (let beatsPerBar = 2; beatsPerBar <= 6; beatsPerBar += 1) {
      result.push({ beatsPerBar, beatUnit });
    }
  }
  result.push({ beatsPerBar: 12, beatUnit: 8 });
  return result;
}

function validateMeterGrid(
  meter: ParsedCompanion | undefined,
  findings: F1ContractFinding[],
): void {
  if (!meter) return;
  const rawCases = meter.root["capacityCases"];
  if (!Array.isArray(rawCases)) return;
  const expectedGrid = expectedMeterGrid();
  const actualGrid: unknown[] = [];
  rawCases.forEach((raw, index) => {
    const path = `${meter.path}:$.capacityCases[${String(index)}]`;
    if (!isObject(raw) || !isObject(raw["meter"])) return;
    const beatsPerBar = raw["meter"]["beatsPerBar"];
    const beatUnit = raw["meter"]["beatUnit"];
    actualGrid.push({ beatsPerBar, beatUnit });
    if (typeof beatsPerBar !== "number" || typeof beatUnit !== "number") return;
    const expectedCapacity = reduced(beatsPerBar * 4, beatUnit);
    if (!jsonEqual(raw["expectedCapacity"], expectedCapacity)) {
      findings.push({
        code: "F1_METER_GRID",
        path: `${path}.expectedCapacity`,
        message: "Meter capacity must equal beatsPerBar * 4 / beatUnit in quarter-note beats.",
      });
    }
  });
  if (!jsonEqual(actualGrid, expectedGrid)) {
    findings.push({
      code: "F1_METER_GRID",
      path: `${meter.path}:$.capacityCases`,
      message: "Capacity cases must contain the exact 2/2...6/8 grid followed by the 12/8 near-miss.",
    });
  }
  const nearMisses = rawCases.filter(
    (raw) => isObject(raw) &&
      isObject(raw["meter"]) &&
      raw["meter"]["beatsPerBar"] === 12 &&
      raw["meter"]["beatUnit"] === 8 &&
      jsonEqual(raw["expectedCapacity"], { numerator: 6, denominator: 1 }) &&
      typeof raw["note"] === "string" &&
      /near-miss/i.test(raw["note"]),
  );
  if (nearMisses.length !== 1) {
    findings.push({
      code: "F1_METER_NEAR_MISS",
      path: `${meter.path}:$.capacityCases`,
      message: "Exactly one explicit 12/8 => 6 quarter-note-beat near-miss is required.",
    });
  }
}

type LocalDiagnostic = Readonly<{
  code: string;
  path: readonly (string | number)[];
}>;

function compareDiagnosticPath(
  left: readonly (string | number)[],
  right: readonly (string | number)[],
): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const leftSegment = left[index];
    const rightSegment = right[index];
    if (leftSegment === rightSegment) continue;
    if (typeof leftSegment === "number" && typeof rightSegment === "number") {
      return leftSegment - rightSegment;
    }
    return codeUnitCompare(String(leftSegment), String(rightSegment));
  }
  return left.length - right.length;
}

function sortLocalDiagnostics(diagnostics: LocalDiagnostic[]): LocalDiagnostic[] {
  return diagnostics.sort(
    (left, right) =>
      compareDiagnosticPath(left.path, right.path) ||
      codeUnitCompare(left.code, right.code),
  );
}

function beatTicks(value: unknown): number | null {
  if (!isObject(value)) return null;
  const numerator = value["numerator"];
  const denominator = value["denominator"];
  if (
    typeof numerator !== "number" ||
    typeof denominator !== "number" ||
    !Number.isSafeInteger(numerator) ||
    !Number.isSafeInteger(denominator) ||
    denominator <= 0 ||
    MIDI_PPQ % denominator !== 0
  ) return null;
  return numerator * (MIDI_PPQ / denominator);
}

function expectedDiagnosticsFromCase(expected: unknown): LocalDiagnostic[] | null {
  if (!isObject(expected)) return null;
  const rows = Array.isArray(expected["issuesInOrder"])
    ? expected["issuesInOrder"]
    : isObject(expected["issue"])
      ? [expected["issue"]]
      : [];
  const result: LocalDiagnostic[] = [];
  for (const row of rows) {
    if (
      !isObject(row) ||
      typeof row["code"] !== "string" ||
      !Array.isArray(row["path"]) ||
      !row["path"].every((segment) =>
        typeof segment === "string" || typeof segment === "number"
      )
    ) return null;
    result.push({ code: row["code"], path: row["path"] });
  }
  return result;
}

function validateMeasureCompletionCases(
  meter: ParsedCompanion | undefined,
  findings: F1ContractFinding[],
): void {
  if (!meter) return;
  const rows = meter.root["completionCases"];
  if (!Array.isArray(rows)) return;
  for (const [index, raw] of rows.entries()) {
    if (
      !isObject(raw) ||
      !isObject(raw["meter"]) ||
      !Array.isArray(raw["eventDurations"]) ||
      !isObject(raw["completion"])
    ) continue;
    const path = `${meter.path}:$.completionCases[${String(index)}]`;
    const beatsPerBar = raw["meter"]["beatsPerBar"];
    const beatUnit = raw["meter"]["beatUnit"];
    if (typeof beatsPerBar !== "number" || typeof beatUnit !== "number") continue;
    const capacityTicks = beatsPerBar * 4 * MIDI_PPQ / beatUnit;
    const eventTicks = raw["eventDurations"].map(beatTicks);
    if (eventTicks.some((ticks) => ticks === null)) {
      findings.push({ code: "F1_MEASURE_ORACLE", path, message: "Completion fixture contains a noncanonical event duration." });
      continue;
    }
    const diagnostics: LocalDiagnostic[] = [];
    let totalTicks = 0;
    let overfillReported = false;
    eventTicks.forEach((ticks, eventIndex) => {
      totalTicks += ticks ?? 0;
      if (!overfillReported && totalTicks > capacityTicks) {
        diagnostics.push({
          code: "measure.duration_over_capacity",
          path: ["events", eventIndex, "duration"],
        });
        overfillReported = true;
      }
    });
    const completion = raw["completion"];
    const kind = completion["kind"];
    if (kind === "empty") {
      if (eventTicks.length > 0) {
        diagnostics.push({ code: "measure.empty_has_events", path: ["events", 0] });
      }
    } else {
      if (eventTicks.length === 0) {
        diagnostics.push({ code: "measure.nonempty_has_no_events", path: ["events"] });
      }
      if (kind === "complete") {
        if (totalTicks !== capacityTicks) {
          diagnostics.push({ code: "measure.complete_duration_mismatch", path: ["completion"] });
        }
      } else if (kind === "pickup" || kind === "incomplete") {
        const expectedTicks = beatTicks(completion["expectedDuration"]);
        if (expectedTicks === null) {
          findings.push({ code: "F1_MEASURE_ORACLE", path: `${path}.completion.expectedDuration`, message: "Partial measure expectedDuration must be canonical." });
          continue;
        }
        if (expectedTicks <= 0) {
          diagnostics.push({ code: "measure.expected_duration_not_positive", path: ["completion", "expectedDuration"] });
        }
        if (expectedTicks >= capacityTicks) {
          diagnostics.push({ code: "measure.expected_duration_not_short", path: ["completion", "expectedDuration"] });
        }
        if (expectedTicks !== totalTicks) {
          diagnostics.push({ code: "measure.expected_duration_mismatch", path: ["completion", "expectedDuration"] });
        }
        if (typeof completion["reason"] !== "string" || completion["reason"].trim().length === 0) {
          diagnostics.push({ code: "measure.reason_blank", path: ["completion", "reason"] });
        }
      }
    }
    const actual = sortLocalDiagnostics(diagnostics);
    const expectedDiagnostics = expectedDiagnosticsFromCase(raw["expected"]);
    if (expectedDiagnostics === null || !jsonEqual(actual, expectedDiagnostics)) {
      findings.push({
        code: "F1_MEASURE_ORACLE",
        path: `${path}.expected`,
        message: "Measure completion diagnostics disagree with the independent exact-tick semantic fold.",
      });
    }
    if (actual.length === 0 && isObject(raw["expected"]) && raw["expected"]["sum"] !== undefined) {
      const expectedSum = reduced(totalTicks, MIDI_PPQ);
      if (!jsonEqual(raw["expected"]["sum"], expectedSum)) {
        findings.push({ code: "F1_MEASURE_ORACLE", path: `${path}.expected.sum`, message: "Successful completion sum is incorrect." });
      }
    }
  }
}

function autoPolicyExpectation(family: string): JsonObject {
  const rootless = family === "rootless-a" || family === "rootless-b";
  const rootlessInvalid = "invalid:voicing.rootless_requires_external";
  return {
    noSlash: {
      generated: rootless ? rootlessInvalid : "valid",
      external: "valid",
      none: rootless ? rootlessInvalid : "valid",
    },
    slash: {
      generated: rootless ? rootlessInvalid : "valid",
      external: "valid",
      none: rootless
        ? rootlessInvalid
        : "invalid:voicing.slash_bass_policy_none",
    },
  };
}

function validateAutoBassMatrix(
  voicing: ParsedCompanion | undefined,
  findings: F1ContractFinding[],
): void {
  if (!voicing) return;
  const matrix = voicing.root["autoPolicyMatrix"];
  if (!Array.isArray(matrix)) return;
  const families: string[] = [];
  matrix.forEach((raw, index) => {
    const path = `${voicing.path}:$.autoPolicyMatrix[${String(index)}]`;
    if (!isObject(raw) || typeof raw["family"] !== "string") {
      findings.push({ code: "F1_AUTO_BASS_MATRIX", path, message: "Matrix row requires a family." });
      return;
    }
    families.push(raw["family"]);
    if (!jsonEqual(raw["expectedByChordBass"], autoPolicyExpectation(raw["family"]))) {
      findings.push({
        code: "F1_AUTO_BASS_MATRIX",
        path: `${path}.expectedByChordBass`,
        message: `Auto bass matrix is incomplete or incorrect for ${raw["family"]}.`,
      });
    }
    const statuses = raw["expectedByChordBass"];
    const visitStatuses = (value: unknown, valuePath: string): void => {
      if (typeof value === "string" && value.startsWith("invalid:")) {
        const issueCode = value.slice("invalid:".length);
        if (!ISSUE_CODE_VALUES.has(issueCode)) {
          findings.push({
            code: "F1_EXPECTED_ISSUE_CODE_UNKNOWN",
            path: valuePath,
            message: `Matrix rejection code ${issueCode} is not exported by the public domain index.`,
          });
        }
      } else if (isObject(value)) {
        for (const [key, child] of Object.entries(value)) {
          visitStatuses(child, `${valuePath}.${key}`);
        }
      }
    };
    visitStatuses(statuses, `${path}.expectedByChordBass`);
  });
  if (
    !sameStringArray(families, [...AUTO_VOICING_FAMILIES]) ||
    !sameStringArray([...AUTO_BASS_POLICIES], ["generated", "external", "none"])
  ) {
    findings.push({
      code: "F1_AUTO_BASS_MATRIX",
      path: `${voicing.path}:$.autoPolicyMatrix`,
      message: "Matrix must cover all seven public Auto families and all three bass policies in canonical order.",
    });
  }

  const customMatrix: unknown = voicing.root["customAutoPolicyMatrix"];
  const customRow: unknown = Array.isArray(customMatrix)
    ? customMatrix[0]
    : undefined;
  if (
    !Array.isArray(customMatrix) ||
    customMatrix.length !== 1 ||
    !isObject(customRow) ||
    customRow["kind"] !== "cartesian-custom-auto-refusal" ||
    !jsonEqual(customRow["families"], AUTO_VOICING_FAMILIES) ||
    !jsonEqual(customRow["bassPolicies"], AUTO_BASS_POLICIES) ||
    !jsonEqual(customRow["customChordBassStates"], ["noSlash", "slash"]) ||
    customRow["matrixCellCount"] !== 42 ||
    customRow["expectedEveryCell"] !==
      "invalid:custom.auto_voicing_forbidden"
  ) {
    findings.push({
      code: "F1_CUSTOM_AUTO_MATRIX",
      path: `${voicing.path}:$.customAutoPolicyMatrix`,
      message: "Custom+Auto must exhaustively refuse all 7x3x2 family/policy/slash cells without substitution.",
    });
  }
}

function validateOperationStates(
  operationStates: ParsedCompanion | undefined,
  findings: F1ContractFinding[],
): void {
  if (!operationStates) return;
  if (!jsonEqual(operationStates.root["applicabilityVocabulary"], ["required", "not-applicable"])) {
    findings.push({
      code: "F1_OPERATION_STATE",
      path: `${operationStates.path}:$.applicabilityVocabulary`,
      message: "Operation-state applicability vocabulary is frozen.",
    });
  }
  const cases = operationStates.root["cases"];
  if (!Array.isArray(cases)) return;
  const requiredRevisionFreeIds = new Set([
    "F1-OPSTATE-001",
    "F1-OPSTATE-002",
    "F1-OPSTATE-003",
    "F1-OPSTATE-004",
    "F1-OPSTATE-005",
    "F1-OPSTATE-010",
  ]);
  const foundRevisionFreeIds = new Set<string>();
  cases.forEach((raw, index) => {
    const path = `${operationStates.path}:$.cases[${String(index)}]`;
    if (!isObject(raw) || typeof raw["id"] !== "string") return;
    const cancellation = raw["cancellation"];
    const stale = raw["staleRevision"];
    if (!isObject(cancellation) || cancellation["applicability"] !== "not-applicable") {
      findings.push({
        code: "F1_OPERATION_STATE",
        path: `${path}.cancellation`,
        message: "F1 and its declared downstream synchronous operations do not invent cancellation semantics.",
      });
    }
    if (requiredRevisionFreeIds.has(raw["id"])) {
      foundRevisionFreeIds.add(raw["id"]);
      if (!isObject(stale) || stale["applicability"] !== "not-applicable") {
        findings.push({
          code: "F1_OPERATION_STATE",
          path: `${path}.staleRevision`,
          message: "Pure synchronous value/validation operations have no live revision and declare staleness not applicable.",
        });
      }
      const expected = raw["expected"];
      if (
        !isObject(expected) ||
        typeof expected["deterministicWorkBound"] !== "string" ||
        expected["deterministicWorkBound"].trim().length === 0 ||
        typeof expected["deterministicMemoryBound"] !== "string" ||
        expected["deterministicMemoryBound"].trim().length === 0 ||
        expected["stateMutation"] !== "none"
      ) {
        findings.push({
          code: "F1_OPERATION_BOUND",
          path: `${path}.expected`,
          message: "Every bounded synchronous operation declares deterministic work, memory, and zero state mutation.",
        });
      }
    } else if (isObject(stale) && stale["applicability"] === "required") {
      if (stale["ownedBy"] === "F1" || typeof stale["ownedBy"] !== "string") {
        findings.push({
          code: "F1_OPERATION_STATE",
          path: `${path}.staleRevision.ownedBy`,
          message: "Any required stale check must name a downstream non-F1 owner.",
        });
      }
    }
  });
  if (!sameStringArray(
    sortedStrings([...foundRevisionFreeIds]),
    sortedStrings([...requiredRevisionFreeIds]),
  )) {
    findings.push({
      code: "F1_OPERATION_STATE",
      path: `${operationStates.path}:$.cases`,
      message: "All six pure/bounded value and validation operation classes require explicit cancellation/stale N/A declarations.",
    });
  }
}

function validateCoverageSummary(
  manifest: JsonObject,
  companions: readonly ParsedCompanion[],
  cases: readonly FixtureCase[],
  traces: ReadonlyMap<string, JsonObject>,
  authorities: ReadonlyMap<string, JsonObject>,
  seedIds: ReadonlySet<string>,
  expectedIssueCodes: ReadonlySet<string>,
  pairwiseMetrics: PairwiseExecutionMetrics,
  findings: F1ContractFinding[],
): void {
  if (!jsonEqual(manifest["coverageSummary"], EXPECTED_COVERAGE_SUMMARY)) {
    findings.push({
      code: "F1_COVERAGE_SUMMARY",
      path: `${MANIFEST_FILENAME}:$.coverageSummary`,
      message: "Coverage summary must match the reviewed exact F1 corpus inventory.",
    });
  }
  const beat = companions.find((item) => item.path === "beat-value-cases.json");
  const meter = companions.find((item) => item.path === "meter-measure-cases.json");
  const voicing = companions.find((item) => item.path === "voicing-custom-cases.json");
  const divisorRows = beat?.root["divisorCases"];
  const capacityRows = meter?.root["capacityCases"];
  const autoRows = voicing?.root["autoPolicyMatrix"];
  const customRows = voicing?.root["customAutoPolicyMatrix"];
  const coreMeterCapacityCases = Array.isArray(capacityRows)
    ? capacityRows.filter((row) =>
        isObject(row) && isObject(row["meter"]) &&
        typeof row["meter"]["beatsPerBar"] === "number" &&
        row["meter"]["beatsPerBar"] >= 2 &&
        row["meter"]["beatsPerBar"] <= 6 &&
        [2, 4, 8].includes(Number(row["meter"]["beatUnit"]))
      ).length
    : 0;
  const compoundNearMisses = Array.isArray(capacityRows)
    ? capacityRows.filter((row) =>
        isObject(row) && isObject(row["meter"]) &&
        row["meter"]["beatsPerBar"] === 12 && row["meter"]["beatUnit"] === 8
      ).length
    : 0;
  const customMatrixCellCount =
    Array.isArray(customRows) && isObject(customRows[0]) &&
      typeof customRows[0]["matrixCellCount"] === "number"
      ? customRows[0]["matrixCellCount"]
      : 0;
  const computed = {
    companionFiles: companions.length,
    fixtureCaseRecords: cases.length,
    traceRecords: traces.size,
    authorityRecords: authorities.size,
    stableSeeds: seedIds.size,
    allowedBeatDivisors: Array.isArray(divisorRows) ? divisorRows.length : 0,
    orderedPairwiseBeatClosureChecks: pairwiseMetrics.orderedPairs,
    orderedPairwiseBeatAdditionChecks: pairwiseMetrics.additions,
    orderedPairwiseBeatComparisonChecks: pairwiseMetrics.comparisons,
    orderedPairwiseBeatSubtractionValueChecks:
      pairwiseMetrics.subtractionValues,
    orderedPairwiseBeatSubtractionRefusalChecks:
      pairwiseMetrics.subtractionNegativeRefusals,
    coreMeterCapacityCases,
    additionalCompoundMeterNearMisses: compoundNearMisses,
    autoVoicingPolicyMatrixCells: Array.isArray(autoRows)
      ? autoRows.length * 2 * 3
      : 0,
    customAutoRefusalMatrixCells: customMatrixCellCount,
    expectedDiagnosticCodes: expectedIssueCodes.size,
  };
  if (!jsonEqual(computed, EXPECTED_COVERAGE_SUMMARY)) {
    findings.push({
      code: "F1_COVERAGE_COMPUTED",
      path: "$computedCoverage",
      message: "Computed companion/case/trace/authority/seed/diagnostic counts must match the reviewed corpus.",
    });
  }
}

function sortFindings(findings: F1ContractFinding[]): F1ContractFinding[] {
  return findings.sort(
    (left, right) =>
      codeUnitCompare(left.path, right.path) ||
      codeUnitCompare(left.code, right.code) ||
      codeUnitCompare(left.message, right.message),
  );
}

export async function validateF1Contract(
  fixtureRoot = DEFAULT_FIXTURE_ROOT,
): Promise<F1ContractValidationReport> {
  const normalizedRoot = resolve(fixtureRoot);
  const findings: F1ContractFinding[] = [];
  await validateReviewedFileDigests(normalizedRoot, findings);
  const manifest = await parseJsonObject(
    normalizedRoot,
    MANIFEST_FILENAME,
    findings,
    "F1_MANIFEST_MISSING",
  );
  if (!manifest) {
    const sorted = sortFindings(findings);
    return {
      schema: "changes.validation.f1-contract.v1",
      package: "F1",
      outcome: "fail",
      counts: { companions: 0, cases: 0, traces: 0, authorities: 0, seeds: 0 },
      findings: sorted,
    };
  }

  validateManifestIdentity(manifest, findings);
  validateFixedConstants(manifest, findings);
  validateAuthorityPolicy(manifest, findings);
  const seedIds = validateSeeds(manifest, findings);
  const declarations = companionDeclarations(manifest, findings);
  const companions = await validateCompanionInventory(
    normalizedRoot,
    declarations,
    findings,
  );
  validateCaseInventories(companions, findings);
  const cases = fixtureCases(companions, seedIds, findings);
  const traceCompanion = companions.find((item) => item.path === "trace-ledger.json");
  const provenanceCompanion = companions.find(
    (item) => item.path === "provenance-ledger.json",
  );
  const traces = ledgerRecords(
    traceCompanion,
    "traces",
    "F1_TRACE_LEDGER",
    findings,
  );
  const authorities = ledgerRecords(
    provenanceCompanion,
    "authorities",
    "F1_AUTHORITY_LEDGER",
    findings,
  );
  validateLedgerInventories(traces, authorities, findings);
  validateProvenancePolicy(provenanceCompanion, authorities, findings);
  validateTraceAndAuthorityReferences(cases, traces, authorities, findings);
  const expectedIssueCodes = validateExpectedIssueCodes(cases, findings);
  validatePitchCases(
    companions.find((item) => item.path === "pitch-cases.json"),
    findings,
  );
  const pairwiseMetrics = validateBeatCoverage(
    companions.find((item) => item.path === "beat-value-cases.json"),
    findings,
  );
  validateMeterGrid(
    companions.find((item) => item.path === "meter-measure-cases.json"),
    findings,
  );
  validateMeasureCompletionCases(
    companions.find((item) => item.path === "meter-measure-cases.json"),
    findings,
  );
  validateAutoBassMatrix(
    companions.find((item) => item.path === "voicing-custom-cases.json"),
    findings,
  );
  validateOperationStates(
    companions.find((item) => item.path === "operation-state-cases.json"),
    findings,
  );
  validateCoverageSummary(
    manifest,
    companions,
    cases,
    traces,
    authorities,
    seedIds,
    expectedIssueCodes,
    pairwiseMetrics,
    findings,
  );

  const sorted = sortFindings(findings);
  return {
    schema: "changes.validation.f1-contract.v1",
    package: "F1",
    outcome: sorted.length === 0 ? "pass" : "fail",
    counts: {
      companions: companions.length,
      cases: cases.length,
      traces: traces.size,
      authorities: authorities.size,
      seeds: seedIds.size,
    },
    findings: sorted,
  };
}

function cliFixtureRoot(args: readonly string[]): string | null {
  if (args.length === 0) return DEFAULT_FIXTURE_ROOT;
  if (args.length === 2 && args[0] === "--fixture-root" && args[1] !== undefined) {
    return args[1];
  }
  return null;
}

if (import.meta.main) {
  const fixtureRoot = cliFixtureRoot(process.argv.slice(2));
  if (fixtureRoot === null) {
    const report: F1ContractValidationReport = {
      schema: "changes.validation.f1-contract.v1",
      package: "F1",
      outcome: "fail",
      counts: { companions: 0, cases: 0, traces: 0, authorities: 0, seeds: 0 },
      findings: [
        {
          code: "F1_CLI_ARGUMENTS",
          path: "$argv",
          message: "Usage: bun scripts/validate-f1-contract.ts [--fixture-root <directory>]",
        },
      ],
    };
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = 2;
  } else {
    try {
      const report = await validateF1Contract(fixtureRoot);
      console.log(JSON.stringify(report, null, 2));
      process.exitCode = report.outcome === "pass" ? 0 : 1;
    } catch (error) {
      const report: F1ContractValidationReport = {
        schema: "changes.validation.f1-contract.v1",
        package: "F1",
        outcome: "fail",
        counts: { companions: 0, cases: 0, traces: 0, authorities: 0, seeds: 0 },
        findings: [
          {
            code: "F1_VALIDATOR_TOOL_FAILURE",
            path: "$tool",
            message: error instanceof Error ? error.message : "Unknown validator failure.",
          },
        ],
      };
      console.log(JSON.stringify(report, null, 2));
      process.exitCode = 2;
    }
  }
}
