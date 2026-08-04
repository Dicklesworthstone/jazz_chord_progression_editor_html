import type { ProgressionDocumentShapeV2 } from "./document";
import type {
  F2DecodeIssueCode,
  ValidationIssue,
} from "./validated-document";

/** Machine-stable identity for the reviewed F2 callable surface. */
export const DOCUMENT_DECODER_CONTRACT_SCHEMA =
  "changes.domain.document-decoder-contract.v1";

export const DOCUMENT_DECODER_OPERATION_NAMES = [
  "preflightDocumentImportBytes",
  "decodeDocumentShape",
] as const;

export type DocumentDecoderOperationName =
  (typeof DOCUMENT_DECODER_OPERATION_NAMES)[number];

/**
 * Successful observation from the pre-parse import limit check. The adapter
 * measures the original bytes; an arbitrary materialized object has no such
 * measurement.
 */
export type DocumentImportByteObservation = Readonly<{
  utf8ByteLength: number;
}>;

export const DOCUMENT_IMPORT_BYTE_ISSUE_CODES = [
  "shape.invalid_type",
  "limit.import_bytes_exceeded",
] as const satisfies readonly F2DecodeIssueCode[];

export type DocumentImportByteIssueCode =
  (typeof DOCUMENT_IMPORT_BYTE_ISSUE_CODES)[number];

/** F2 diagnostics deliberately expose no repair or source-text fields. */
export type DocumentDecoderIssue<C extends F2DecodeIssueCode> = Readonly<
  Pick<ValidationIssue<C>, "code" | "path" | "message">
>;

/** F2 performs no repair, so a successful decoder can never warn. */
export type WarningFreeDecodeResult<
  T,
  C extends F2DecodeIssueCode,
> =
  | Readonly<{ ok: true; value: T; warnings: readonly [] }>
  | Readonly<{
      ok: false;
      errors: readonly [DocumentDecoderIssue<C>, ...DocumentDecoderIssue<C>[]];
    }>;

/** Exact issue vocabulary reachable from decodeDocumentShape itself. */
export const DOCUMENT_SHAPE_ISSUE_CODES = [
  "shape.unknown_field",
  "shape.invalid_type",
  "document.root_not_object",
  "document.schema_invalid",
  "document.schema_missing",
  "limit.json_depth_exceeded",
  "limit.sections_exceeded",
  "limit.measures_per_section_exceeded",
  "limit.events_per_document_exceeded",
  "id.syntax_invalid",
  "id.length_exceeded",
  "id.duplicate",
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
  "beat.numerator_not_safe_integer",
  "beat.numerator_negative",
  "beat.numerator_out_of_range",
  "beat.denominator_not_safe_integer",
  "beat.denominator_not_positive",
  "beat.denominator_not_ppq_divisor",
  "beat.not_normalized",
  "beat.duration_not_positive",
  "timeline.total_exceeded",
  "meter.beats_per_bar_out_of_range",
  "meter.beat_unit_invalid",
  "tempo.not_finite",
  "tempo.not_integer",
  "tempo.out_of_range",
  "playback.level_not_finite",
  "playback.level_out_of_range",
  "playback.count_in_bars_invalid",
  "section.voice_leading_boundary_invalid",
  "playback.groove_style_invalid",
  "playback.groove_style_not_canonical",
] as const satisfies readonly F2DecodeIssueCode[];

export type DocumentShapeIssueCode =
  (typeof DOCUMENT_SHAPE_ISSUE_CODES)[number];

export type DocumentImportBytePreflightResult = WarningFreeDecodeResult<
  DocumentImportByteObservation,
  DocumentImportByteIssueCode
>;

/** Structural success is deliberately looser than ProgressionDocumentV2. */
export type DocumentShapeDecodeResult = WarningFreeDecodeResult<
  ProgressionDocumentShapeV2,
  DocumentShapeIssueCode
>;

export type PreflightDocumentImportBytes = (
  utf8ByteLength: number,
) => DocumentImportBytePreflightResult;

export type DecodeDocumentShape = (
  input: unknown,
) => DocumentShapeDecodeResult;

/**
 * Decoder-owned deterministic-work evidence. Test-harness callback and
 * before/after state observations are deliberately not hidden in this value.
 * This type and the evidence seams remain private deep imports: Domain's public
 * index must not re-export them.
 */
export type DocumentDecoderEvidence = Readonly<{
  bytesObserved: number;
  maxDepthObserved: number;
  recordsInspected: number;
  arraysInspected: number;
  scalarFieldsInspected: number;
  descriptorReads: number;
  arraySlotsRead: number;
  collectionLengthsObserved: number;
  sectionSlotsObserved: number;
  maxMeasuresPerSectionObserved: number;
  eventSlotsObserved: number;
  maxPitchArraySlotsObserved: number;
  sectionElementsSemanticallyDecoded: number;
  measureElementsSemanticallyDecoded: number;
  eventValuesSemanticallyDecoded: number;
  pitchElementsSemanticallyDecoded: number;
  sectionElementsCopied: number;
  measureElementsCopied: number;
  eventValuesCopied: number;
  pitchElementsCopied: number;
  candidateObjectsAllocated: number;
  candidateArraysAllocated: number;
  diagnosticCandidatesProduced: number;
  idOccurrences: number;
  idClusters: number;
  idDuplicateWorkUnits: number;
  timelineAdditions: number;
  timelineTicksObserved: number;
}>;

export type DocumentImportBytePreflightWithEvidenceResult = Readonly<{
  result: DocumentImportBytePreflightResult;
  evidence: DocumentDecoderEvidence;
}>;

export type DocumentShapeDecodeWithEvidenceResult = Readonly<{
  result: DocumentShapeDecodeResult;
  evidence: DocumentDecoderEvidence;
}>;

export type PreflightDocumentImportBytesWithEvidence = (
  utf8ByteLength: number,
) => DocumentImportBytePreflightWithEvidenceResult;

export type DecodeDocumentShapeWithEvidence = (
  input: unknown,
) => DocumentShapeDecodeWithEvidenceResult;

/**
 * F2's standalone callable surface. It remains separate from DomainOperations,
 * whose reviewed purpose is to freeze the F1 value-operation surface.
 */
export interface DocumentDecodeOperations {
  readonly preflightDocumentImportBytes: PreflightDocumentImportBytes;
  readonly decodeDocumentShape: DecodeDocumentShape;
}
