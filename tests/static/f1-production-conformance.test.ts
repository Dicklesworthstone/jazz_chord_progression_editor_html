import { expect, test } from "bun:test";

import {
  ALLOWED_BEAT_DENOMINATORS,
  COUNT_IN_BARS_VALUES,
  CONCERT_A_FREQUENCY_HZ,
  CONCERT_A_MIDI,
  DOMAIN_VALIDATION_ISSUE_CODES,
  F1_VALUE_ISSUE_CODES,
  F2_STRUCTURAL_ISSUE_CODES,
  F3_SEMANTIC_ISSUE_CODES,
  MAX_DOCUMENT_CHORD_EVENTS,
  MAX_DOCUMENT_SECTIONS,
  MAX_DOMAIN_COPY_GRAPH_NODES,
  MAX_ENGINE_VERSION_CODE_POINTS,
  MAX_ALTERATION,
  MAX_BEATS_PER_BAR,
  MAX_JSON_NESTING_DEPTH,
  MAX_LONG_TEXT_CODE_POINTS,
  MAX_MIDI_PITCH,
  MAX_NORMALIZED_BEAT_NUMERATOR,
  MAX_PLAYBACK_LEVEL,
  MAX_SECTION_MEASURES,
  MAX_SHORT_TEXT_CODE_POINTS,
  MAX_TEMPO_BPM,
  MAX_TIMELINE_QUARTER_NOTE_BEATS,
  MAX_UTF8_IMPORT_BYTES,
  MAX_VOICING_PITCHES,
  MIDI_PPQ,
  MIDDLE_C_MIDI,
  MIN_ALTERATION,
  MIN_BEATS_PER_BAR,
  MIN_MIDI_PITCH,
  MIN_PLAYBACK_LEVEL,
  MIN_TEMPO_BPM,
  PROGRESSION_DOCUMENT_SCHEMA,
  PROGRESSION_DOCUMENT_SCHEMA_VERSION,
  NONBLANK_TEXT_FIELDS,
  STABLE_ID_MAX_ASCII_LENGTH,
  STABLE_ID_PATTERN_SOURCE,
  TEXT_FIELD_CODE_POINT_LIMITS,
} from "../../src/domain";
import {
  F1_REVIEWED_ISSUE_CODES,
  F1_REVIEWED_NONBLANK_TEXT_FIELDS,
  F1_REVIEWED_PUBLIC_CONSTANTS,
  F1_REVIEWED_STAGE_ISSUE_CODES,
  F1_REVIEWED_TEXT_FIELD_CODE_POINT_LIMITS,
} from "../../scripts/validate-f1-contract";

test("keeps production exports conformant with independent reviewed literals", () => {
  const production = {
    progressionDocumentSchema: PROGRESSION_DOCUMENT_SCHEMA,
    progressionDocumentSchemaVersion: PROGRESSION_DOCUMENT_SCHEMA_VERSION,
    stableIdPatternSource: STABLE_ID_PATTERN_SOURCE,
    midiPpq: MIDI_PPQ,
    allowedBeatDenominators: [...ALLOWED_BEAT_DENOMINATORS],
    maxBeatNumerator: MAX_NORMALIZED_BEAT_NUMERATOR,
    maxTimelineQuarterNoteBeats: MAX_TIMELINE_QUARTER_NOTE_BEATS,
    midiMinimum: MIN_MIDI_PITCH,
    midiMaximum: MAX_MIDI_PITCH,
    minimumAlteration: MIN_ALTERATION,
    maximumAlteration: MAX_ALTERATION,
    middleCMidi: MIDDLE_C_MIDI,
    concertAMidi: CONCERT_A_MIDI,
    concertAFrequencyHz: CONCERT_A_FREQUENCY_HZ,
    tempoMinimum: MIN_TEMPO_BPM,
    tempoMaximum: MAX_TEMPO_BPM,
    minimumBeatsPerBar: MIN_BEATS_PER_BAR,
    maximumBeatsPerBar: MAX_BEATS_PER_BAR,
    maxSections: MAX_DOCUMENT_SECTIONS,
    maxMeasuresPerSection: MAX_SECTION_MEASURES,
    maxEventsPerDocument: MAX_DOCUMENT_CHORD_EVENTS,
    maxCopyGraphNodes: MAX_DOMAIN_COPY_GRAPH_NODES,
    maxVoicingNotes: MAX_VOICING_PITCHES,
    maxImportBytes: MAX_UTF8_IMPORT_BYTES,
    maxJsonDepth: MAX_JSON_NESTING_DEPTH,
    maxStableIdAsciiCharacters: STABLE_ID_MAX_ASCII_LENGTH,
    maxSymbolCodePoints: MAX_SHORT_TEXT_CODE_POINTS,
    maxCustomLabelCodePoints: MAX_SHORT_TEXT_CODE_POINTS,
    maxTitleCodePoints: MAX_SHORT_TEXT_CODE_POINTS,
    maxSectionNameCodePoints: MAX_SHORT_TEXT_CODE_POINTS,
    maxAnnotationCodePoints: MAX_LONG_TEXT_CODE_POINTS,
    maxDescriptionCodePoints: MAX_LONG_TEXT_CODE_POINTS,
    maxPartialMeasureReasonCodePoints: MAX_LONG_TEXT_CODE_POINTS,
    maxEngineVersionCodePoints: MAX_ENGINE_VERSION_CODE_POINTS,
    minimumPlaybackLevel: MIN_PLAYBACK_LEVEL,
    maximumPlaybackLevel: MAX_PLAYBACK_LEVEL,
    countInBars: [...COUNT_IN_BARS_VALUES],
  };
  const reviewed = {
    ...F1_REVIEWED_PUBLIC_CONSTANTS,
    allowedBeatDenominators: [
      ...F1_REVIEWED_PUBLIC_CONSTANTS.allowedBeatDenominators,
    ],
    countInBars: [...F1_REVIEWED_PUBLIC_CONSTANTS.countInBars],
  };
  expect(production).toEqual(reviewed);
  expect([...Object.values(DOMAIN_VALIDATION_ISSUE_CODES)]).toEqual([
    ...F1_REVIEWED_ISSUE_CODES,
  ]);
  expect(TEXT_FIELD_CODE_POINT_LIMITS).toEqual(
    F1_REVIEWED_TEXT_FIELD_CODE_POINT_LIMITS,
  );
  expect([...NONBLANK_TEXT_FIELDS]).toEqual([
    ...F1_REVIEWED_NONBLANK_TEXT_FIELDS,
  ]);
  expect([...F1_VALUE_ISSUE_CODES]).toEqual([
    ...F1_REVIEWED_STAGE_ISSUE_CODES.F1,
  ]);
  expect([...F2_STRUCTURAL_ISSUE_CODES]).toEqual([
    ...F1_REVIEWED_STAGE_ISSUE_CODES.F2,
  ]);
  expect([...F3_SEMANTIC_ISSUE_CODES]).toEqual([
    ...F1_REVIEWED_STAGE_ISSUE_CODES.F3,
  ]);
});
