import type { ProgressionDocumentV2 } from "./document";
import type { Comparison, DomainPath } from "./result";

export const DOMAIN_VALIDATION_ISSUE_CODES = {
  unknownField: "shape.unknown_field",
  invalidType: "shape.invalid_type",
  documentRootNotObject: "document.root_not_object",
  invalidSchema: "document.schema_invalid",
  missingSchema: "document.schema_missing",
  importByteLimit: "limit.import_bytes_exceeded",
  nestingDepthLimit: "limit.json_depth_exceeded",
  sectionLimit: "limit.sections_exceeded",
  measureLimit: "limit.measures_per_section_exceeded",
  eventLimit: "limit.events_per_document_exceeded",
  copyNodeLimit: "limit.copy_nodes_exceeded",
  idSyntax: "id.syntax_invalid",
  idLength: "id.length_exceeded",
  idDuplicate: "id.duplicate",
  idReferenceMissing: "id.reference_missing",
  idCollisionExisting: "id.collision_existing",
  idCollisionAllocated: "id.collision_allocated",
  idFactoryExhausted: "id.factory_exhausted",
  idEntropyUnavailable: "id.entropy_unavailable",
  idRemapIncomplete: "id.remap_incomplete",
  stringBlank: "string.blank",
  symbolCodePointLimit: "limit.symbol_code_points_exceeded",
  annotationCodePointLimit: "limit.annotation_code_points_exceeded",
  titleCodePointLimit: "limit.title_code_points_exceeded",
  sectionNameCodePointLimit: "limit.section_name_code_points_exceeded",
  customLabelCodePointLimit: "limit.custom_label_code_points_exceeded",
  descriptionCodePointLimit: "limit.description_code_points_exceeded",
  reasonCodePointLimit: "limit.reason_code_points_exceeded",
  engineVersionCodePointLimit: "limit.engine_version_code_points_exceeded",
  stringLoneSurrogate: "string.invalid_unicode_scalar",
  pitchInvalidStep: "pitch.step_invalid",
  pitchUnsupportedAccidental: "pitch.alter_out_of_range",
  pitchInvalidOctave: "pitch.octave_not_integer",
  pitchUnsafeOctave: "pitch.octave_not_safe_integer",
  pitchMidiNotInteger: "pitch.midi_not_integer",
  pitchMidiOutOfRange: "pitch.midi_out_of_range",
  keyModeInvalid: "key.mode_invalid",
  instrumentIdInvalid: "document.instrument_id_invalid",
  degreeNumber: "chord.degree_number_invalid",
  degreeAlter: "chord.degree_alter_out_of_range",
  degreeOrder: "chord.degree_order",
  degreeDuplicate: "chord.degree_duplicate",
  sourceSemanticMismatch: "chord.source_semantic_mismatch",
  customPitchNamesEmpty: "custom.pitch_names_empty",
  customPitchVoicingMismatch: "custom.pitch_voicing_mismatch",
  customAutoVoicing: "custom.auto_voicing_forbidden",
  voicingPitchesEmpty: "voicing.pitches_empty",
  voicingNoteLimit: "limit.voicing_notes_exceeded",
  voicingRange: "voicing.range_reversed",
  voicingVoiceCount: "voicing.voice_count_invalid",
  rootlessBassPolicy: "voicing.rootless_requires_external",
  slashBassPolicy: "voicing.slash_bass_policy_none",
  nonslashStoredExternalBass: "voicing.external_without_slash_bass",
  includedBassNotLowest: "voicing.included_bass_not_lowest",
  includedBassSpelling: "voicing.included_bass_spelling_mismatch",
  externalBassIncluded: "voicing.external_bass_included",
  engineVersionInvalid: "voicing.engine_version_invalid",
  autoSettingsRequired: "voicing.auto_settings_required",
  beatNumeratorSafeInteger: "beat.numerator_not_safe_integer",
  beatNumeratorNegative: "beat.numerator_negative",
  beatNumeratorLimit: "beat.numerator_out_of_range",
  beatDenominatorSafeInteger: "beat.denominator_not_safe_integer",
  beatDenominatorPositive: "beat.denominator_not_positive",
  beatDenominatorPpq: "beat.denominator_not_ppq_divisor",
  beatNotNormalized: "beat.not_normalized",
  beatDurationPositive: "beat.duration_not_positive",
  beatNegativeResult: "beat.negative_result",
  beatRangeEmpty: "beat.range_empty",
  beatRangeReversed: "beat.range_reversed",
  timelineLimit: "timeline.total_exceeded",
  meterBeatsPerBar: "meter.beats_per_bar_out_of_range",
  meterBeatUnit: "meter.beat_unit_invalid",
  tempoNotFinite: "tempo.not_finite",
  tempoNotInteger: "tempo.not_integer",
  tempoOutOfRange: "tempo.out_of_range",
  playbackLevelNotFinite: "playback.level_not_finite",
  playbackLevelOutOfRange: "playback.level_out_of_range",
  playbackCountInBars: "playback.count_in_bars_invalid",
  sectionVoiceLeadingBoundary: "section.voice_leading_boundary_invalid",
  measureEmptyEvents: "measure.empty_has_events",
  measureNonemptyNoEvents: "measure.nonempty_has_no_events",
  measureCompleteDuration: "measure.complete_duration_mismatch",
  measureOverCapacity: "measure.duration_over_capacity",
  measureExpectedNotShort: "measure.expected_duration_not_short",
  measureExpectedNotPositive: "measure.expected_duration_not_positive",
  measureExpectedMismatch: "measure.expected_duration_mismatch",
  measurePartialReason: "measure.reason_blank",
} as const;

export type DomainValidationIssueCode =
  (typeof DOMAIN_VALIDATION_ISSUE_CODES)[keyof typeof DOMAIN_VALIDATION_ISSUE_CODES];

export const F1_VALUE_ISSUE_CODES = [
  "id.syntax_invalid",
  "id.length_exceeded",
  "id.collision_existing",
  "id.collision_allocated",
  "id.factory_exhausted",
  "id.entropy_unavailable",
  "id.remap_incomplete",
  "limit.copy_nodes_exceeded",
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
  "custom.pitch_names_empty",
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
] as const;

export const F2_STRUCTURAL_ISSUE_CODES = [
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
  "id.duplicate",
  "id.reference_missing",
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
  "beat.not_normalized",
  "section.voice_leading_boundary_invalid",
] as const;

export const F3_SEMANTIC_ISSUE_CODES = [
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
] as const;

export type F1ValueIssueCode = (typeof F1_VALUE_ISSUE_CODES)[number];
export type F2StructuralIssueCode =
  (typeof F2_STRUCTURAL_ISSUE_CODES)[number];
export type F2DecodeIssueCode = F1ValueIssueCode | F2StructuralIssueCode;
export type F3SemanticIssueCode = (typeof F3_SEMANTIC_ISSUE_CODES)[number];

export type ValidationIssue<
  C extends DomainValidationIssueCode = DomainValidationIssueCode,
> = Readonly<{
  code: C;
  path: DomainPath;
  message: string;
  suggestion?: string;
  sourceText?: string;
}>;

export const VALIDATION_DIAGNOSTIC_ORDER = ["path", "code"] as const;

export type ValidationDiagnosticComparator<
  C extends DomainValidationIssueCode = DomainValidationIssueCode,
> = (left: ValidationIssue<C>, right: ValidationIssue<C>) => Comparison;

/** Issues are ordered by traversal path, then stable issue code. */
export type DecodeResult<
  T,
  C extends F2DecodeIssueCode = F2DecodeIssueCode,
> =
  | Readonly<{
      ok: true;
      value: T;
      warnings: readonly ValidationIssue<C>[];
    }>
  | Readonly<{
      ok: false;
      errors: readonly [ValidationIssue<C>, ...ValidationIssue<C>[]];
    }>;

export type SemanticValidationResult<T> =
  | Readonly<{ ok: true; value: T; warnings: readonly ValidationIssue<F3SemanticIssueCode>[] }>
  | Readonly<{
      ok: false;
      errors: readonly [
        ValidationIssue<F3SemanticIssueCode>,
        ...ValidationIssue<F3SemanticIssueCode>[],
      ];
    }>;

declare const validatedDocumentBrand: unique symbol;

/**
 * Combined structural and semantic publication proof. This module deliberately
 * exports no constructor, guard, assertion function, or brand symbol.
 */
export type ValidatedDocument = ProgressionDocumentV2 & {
  readonly [validatedDocumentBrand]: "ValidatedDocument";
};

function compareStrings(left: string, right: string): Comparison {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareNumbers(left: number, right: number): Comparison {
  if (Object.is(left, right) || left === right) return 0;
  if (Number.isNaN(left)) return Number.isNaN(right) ? 0 : 1;
  if (Number.isNaN(right)) return -1;
  return left < right ? -1 : 1;
}

/** Numeric path segments compare numerically; string segments use code units. */
export function compareDomainPaths(
  left: DomainPath,
  right: DomainPath,
): Comparison {
  const sharedLength = Math.min(left.length, right.length);
  for (let index = 0; index < sharedLength; index += 1) {
    const leftSegment = left[index];
    const rightSegment = right[index];
    if (typeof leftSegment === "number" && typeof rightSegment === "number") {
      const comparison = compareNumbers(leftSegment, rightSegment);
      if (comparison !== 0) return comparison;
      continue;
    }
    if (typeof leftSegment === "string" && typeof rightSegment === "string") {
      const comparison = compareStrings(leftSegment, rightSegment);
      if (comparison !== 0) return comparison;
      continue;
    }
    // Schema paths alternate field names and indices. Keep malformed mixed
    // paths total and deterministic by placing numeric segments first.
    return typeof leftSegment === "number" ? -1 : 1;
  }
  return compareNumbers(left.length, right.length);
}

/** Stable diagnostic order: path first, then issue code. */
export const compareValidationIssues: ValidationDiagnosticComparator = (
  left,
  right,
) => compareDomainPaths(left.path, right.path) || compareStrings(left.code, right.code);
