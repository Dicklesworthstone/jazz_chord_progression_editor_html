import type { ChordEvent } from "./chord";
import type { BeatDuration, Meter } from "./duration";
import type { DocumentId, MeasureId, SectionId } from "./ids";
import type { InstrumentId } from "./instrument-id";
import type { KeyContext } from "./key";

export const PROGRESSION_DOCUMENT_SCHEMA = "changes.progression.v2";
export const PROGRESSION_DOCUMENT_SCHEMA_VERSION = 2;
export const MAX_UTF8_IMPORT_BYTES = 2 * 1024 * 1024;
export const MAX_JSON_NESTING_DEPTH = 32;
export const MAX_DOCUMENT_SECTIONS = 64;
export const MAX_SECTION_MEASURES = 1_024;
export const MAX_DOCUMENT_CHORD_EVENTS = 8_192;
export const MAX_SHORT_TEXT_CODE_POINTS = 256;
export const MAX_LONG_TEXT_CODE_POINTS = 2_000;
export const MIN_PLAYBACK_LEVEL = 0;
export const MAX_PLAYBACK_LEVEL = 1;

export const TEXT_FIELD_CODE_POINT_LIMITS = {
  chordSourceText: MAX_SHORT_TEXT_CODE_POINTS,
  customChordLabel: MAX_SHORT_TEXT_CODE_POINTS,
  documentTitle: MAX_SHORT_TEXT_CODE_POINTS,
  sectionName: MAX_SHORT_TEXT_CODE_POINTS,
  annotation: MAX_LONG_TEXT_CODE_POINTS,
  documentDescription: MAX_LONG_TEXT_CODE_POINTS,
  partialMeasureReason: MAX_LONG_TEXT_CODE_POINTS,
} as const;

export const NONBLANK_TEXT_FIELDS = [
  "chordSourceText",
  "customChordLabel",
  "documentTitle",
  "sectionName",
  "partialMeasureReason",
  "engineVersion",
] as const;

export type MeasureCompletion =
  | Readonly<{ kind: "empty" }>
  | Readonly<{ kind: "complete" }>
  | Readonly<{
      kind: "pickup" | "incomplete";
      expectedDuration: BeatDuration;
      reason: string;
    }>;

export type Measure =
  | Readonly<{
      id: MeasureId;
      events: readonly [];
      completion: Readonly<{ kind: "empty" }>;
    }>
  | Readonly<{
      id: MeasureId;
      events: readonly [ChordEvent, ...ChordEvent[]];
      completion: Exclude<MeasureCompletion, { kind: "empty" }>;
    }>;

/** Empty measure collections are valid document data. */
export type Section = Readonly<{
  id: SectionId;
  name: string;
  annotation: string;
  keyOverride: KeyContext | null;
  voiceLeadingBoundary: "continue" | "reset";
  measures: readonly Measure[];
}>;

export type CountInBars = 0 | 1 | 2;

export type PlaybackSettings = Readonly<{
  instrumentId: InstrumentId;
  masterVolume: number;
  reverbAmount: number;
  countInBars: CountInBars;
}>;

export type PlaybackLevelField = "masterVolume" | "reverbAmount";

export type PlaybackSettingsRefusal =
  | Readonly<{
      code: "playback.level_not_finite";
      field: PlaybackLevelField;
      received: number;
    }>
  | Readonly<{
      code: "playback.level_out_of_range";
      field: PlaybackLevelField;
      received: number;
      minimum: typeof MIN_PLAYBACK_LEVEL;
      maximum: typeof MAX_PLAYBACK_LEVEL;
    }>
  | Readonly<{
      code: "playback.count_in_bars_invalid";
      received: number;
    }>;

export type PlaybackSettingsResult =
  | Readonly<{ ok: true; value: PlaybackSettings }>
  | Readonly<{ ok: false; refusal: PlaybackSettingsRefusal }>;

/**
 * Shape-valid v2 data. Empty section arrays are valid; semantic publication is
 * represented separately by ValidatedDocument.
 */
export type ProgressionDocumentV2 = Readonly<{
  schema: typeof PROGRESSION_DOCUMENT_SCHEMA;
  id: DocumentId;
  title: string;
  description: string;
  meter: Meter;
  tempoBpm: number;
  key: KeyContext | null;
  sections: readonly Section[];
  playback: PlaybackSettings;
}>;

export type MeasureStateRefusal =
  | Readonly<{ code: "measure.empty_has_events"; measureId: MeasureId }>
  | Readonly<{ code: "measure.nonempty_has_no_events"; measureId: MeasureId }>
  | Readonly<{ code: "measure.complete_duration_mismatch"; measureId: MeasureId }>
  | Readonly<{ code: "measure.duration_over_capacity"; measureId: MeasureId }>
  | Readonly<{
      code: "measure.expected_duration_not_short";
      measureId: MeasureId;
    }>
  | Readonly<{
      code: "measure.expected_duration_not_positive";
      measureId: MeasureId;
    }>
  | Readonly<{
      code: "measure.expected_duration_mismatch";
      measureId: MeasureId;
    }>
  | Readonly<{ code: "measure.reason_blank"; measureId: MeasureId }>;
