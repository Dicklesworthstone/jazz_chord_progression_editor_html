import type { ChordEvent } from "./chord";
import type { BeatDuration, BeatValue, Meter } from "./duration";
import type { DocumentId, MeasureId, SectionId } from "./ids";
import type { InstrumentId } from "./instrument-id";
import type { KeyContext } from "./key";
import type { PathRefusal } from "./result";

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
export const COUNT_IN_BARS_VALUES = [0, 1, 2] as const;
export const SECTION_VOICE_LEADING_BOUNDARIES = ["continue", "reset"] as const;

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

/** Loose F2-to-F3 candidate: F3, not F2, decides completion semantics. */
export type MeasureCompletionShape =
  | Readonly<{ kind: "empty" | "complete" }>
  | Readonly<{
      kind: "pickup" | "incomplete";
      expectedDuration: BeatValue;
      reason: string;
    }>;

export type MeasureShape = Readonly<{
  id: MeasureId;
  events: readonly ChordEvent[];
  completion: MeasureCompletionShape;
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
  voiceLeadingBoundary: SectionVoiceLeadingBoundary;
  measures: readonly Measure[];
}>;

export type SectionShape = Readonly<{
  id: SectionId;
  name: string;
  annotation: string;
  keyOverride: KeyContext | null;
  voiceLeadingBoundary: SectionVoiceLeadingBoundary;
  measures: readonly MeasureShape[];
}>;

export type CountInBars = (typeof COUNT_IN_BARS_VALUES)[number];
export type SectionVoiceLeadingBoundary =
  (typeof SECTION_VOICE_LEADING_BOUNDARIES)[number];

export type PlaybackSettings = Readonly<{
  instrumentId: InstrumentId;
  masterVolume: number;
  reverbAmount: number;
  countInBars: CountInBars;
}>;

export type PlaybackSettingsInput = Readonly<{
  instrumentId: InstrumentId;
  masterVolume: number;
  reverbAmount: number;
  countInBars: number;
}>;

export type PlaybackLevelField = "masterVolume" | "reverbAmount";

export type PlaybackSettingsRefusal =
  | PathRefusal<{
      code: "playback.level_not_finite";
      field: PlaybackLevelField;
      received: number;
    }>
  | PathRefusal<{
      code: "playback.level_out_of_range";
      field: PlaybackLevelField;
      received: number;
      minimum: typeof MIN_PLAYBACK_LEVEL;
      maximum: typeof MAX_PLAYBACK_LEVEL;
    }>
  | PathRefusal<{
      code: "playback.count_in_bars_invalid";
      received: number;
    }>;

export type PlaybackSettingsResult =
  | Readonly<{ ok: true; value: PlaybackSettings }>
  | Readonly<{ ok: false; refusal: PlaybackSettingsRefusal }>;

function playbackLevelRefusal(
  field: PlaybackLevelField,
  received: number,
): PlaybackSettingsRefusal | null {
  if (!Number.isFinite(received)) {
    return {
      code: "playback.level_not_finite",
      path: [field],
      field,
      received,
    };
  }
  if (received < MIN_PLAYBACK_LEVEL || received > MAX_PLAYBACK_LEVEL) {
    return {
      code: "playback.level_out_of_range",
      path: [field],
      field,
      received,
      minimum: MIN_PLAYBACK_LEVEL,
      maximum: MAX_PLAYBACK_LEVEL,
    };
  }
  return null;
}

function isCountInBars(received: number): received is CountInBars {
  return received === 0 || received === 1 || received === 2;
}

export function makePlaybackSettings(
  input: PlaybackSettingsInput,
): PlaybackSettingsResult {
  const masterVolumeRefusal = playbackLevelRefusal(
    "masterVolume",
    input.masterVolume,
  );
  if (masterVolumeRefusal !== null) {
    return { ok: false, refusal: masterVolumeRefusal };
  }

  const reverbAmountRefusal = playbackLevelRefusal(
    "reverbAmount",
    input.reverbAmount,
  );
  if (reverbAmountRefusal !== null) {
    return { ok: false, refusal: reverbAmountRefusal };
  }

  if (!isCountInBars(input.countInBars)) {
    return {
      ok: false,
      refusal: {
        code: "playback.count_in_bars_invalid",
        path: ["countInBars"],
        received: input.countInBars,
      },
    };
  }

  return {
    ok: true,
    value: Object.freeze({
      instrumentId: input.instrumentId,
      masterVolume: input.masterVolume,
      reverbAmount: input.reverbAmount,
      countInBars: input.countInBars,
    }),
  };
}

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

/** Structurally decoded candidate passed from F2 to F3 before promotion. */
export type ProgressionDocumentShapeV2 = Readonly<{
  schema: typeof PROGRESSION_DOCUMENT_SCHEMA;
  id: DocumentId;
  title: string;
  description: string;
  meter: Meter;
  tempoBpm: number;
  key: KeyContext | null;
  sections: readonly SectionShape[];
  playback: PlaybackSettings;
}>;

export type MeasureStateRefusal =
  | PathRefusal<{ code: "measure.empty_has_events"; measureId: MeasureId }>
  | PathRefusal<{ code: "measure.nonempty_has_no_events"; measureId: MeasureId }>
  | PathRefusal<{ code: "measure.complete_duration_mismatch"; measureId: MeasureId }>
  | PathRefusal<{ code: "measure.duration_over_capacity"; measureId: MeasureId }>
  | PathRefusal<{
      code: "measure.expected_duration_not_short";
      measureId: MeasureId;
    }>
  | PathRefusal<{
      code: "measure.expected_duration_not_positive";
      measureId: MeasureId;
    }>
  | PathRefusal<{
      code: "measure.expected_duration_mismatch";
      measureId: MeasureId;
    }>
  | PathRefusal<{ code: "measure.reason_blank"; measureId: MeasureId }>;
