import type { ProgressionDocumentV2 } from "./document";

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

export type ValidationIssue = Readonly<{
  code: DomainValidationIssueCode;
  path: readonly (string | number)[];
  message: string;
  suggestion?: string;
  sourceText?: string;
}>;

export const VALIDATION_DIAGNOSTIC_ORDER = ["path", "code"] as const;

/** Issues are ordered by traversal path, then stable issue code. */
export type DecodeResult<T> =
  | Readonly<{
      ok: true;
      value: T;
      warnings: readonly ValidationIssue[];
    }>
  | Readonly<{
      ok: false;
      errors: readonly [ValidationIssue, ...ValidationIssue[]];
    }>;

declare const validatedDocumentBrand: unique symbol;

/**
 * Combined structural and semantic publication proof. This module deliberately
 * exports no constructor, guard, assertion function, or brand symbol.
 */
export type ValidatedDocument = ProgressionDocumentV2 & {
  readonly [validatedDocumentBrand]: "ValidatedDocument";
};
