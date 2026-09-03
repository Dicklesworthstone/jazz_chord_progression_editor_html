/**
 * U2 Chord Inspector Contract
 *
 * Package: U2 (jcpe-milestone-reliable-studio-l3a.11.1), Reliable Studio milestone.
 *
 * Defines the public interfaces, view models, intents, limits, and invariant
 * types for the progressive 7-section Chord Inspector, interactive piano,
 * voicing mode lifecycle, structured chord editing, annotation sanitization,
 * and safe isolated chord audio preview.
 */

import type {
  AutoVoicingFamily,
  BeatValue,
  ChordEventId,
  DegreeNumber,
  MeasureId,
  PitchClass,
  SectionId,
  SpelledPitch,
  SpelledPitchClass,
} from "../domain";

/* -------------------------------------------------------------------------- */
/* Constants & Schemas                                                        */
/* -------------------------------------------------------------------------- */

export const U2_CONTRACT_SCHEMA =
  "changes.ui.u2-chord-inspector-contract.v1" as const;
export const U2_MANIFEST_SCHEMA =
  "changes.fixtures.u2-chord-inspector-contract.v1" as const;
export const U2_PACKAGE = "U2" as const;
export const U2_BEAD_ID = "jcpe-milestone-reliable-studio-l3a.11.1" as const;
export const U2_POLICY_ID = "changes.u2-chord-inspector" as const;
export const U2_POLICY_VERSION = 1 as const;

export const INSPECTOR_TABS = Object.freeze([
  "symbol",
  "structure",
  "timing",
  "voicing",
  "harmony",
  "motion",
  "notes",
] as const);

export type InspectorTabId = (typeof INSPECTOR_TABS)[number];

export const VOICING_MODES = Object.freeze([
  "auto",
  "manual",
  "frozen",
] as const);

export type InspectorVoicingMode = (typeof VOICING_MODES)[number];

export const PIANO_NOTE_ROLES = Object.freeze([
  "root",
  "guide-third",
  "guide-seventh",
  "tension",
  "color",
  "bass",
  "omitted",
] as const);

export type PianoNoteRole = (typeof PIANO_NOTE_ROLES)[number];

/* Bounds & Limits */
export const PIANO_MIN_MIDI = 21 as const; // A0
export const PIANO_MAX_MIDI = 108 as const; // C8
export const PIANO_DEFAULT_VISIBLE_MIN_MIDI = 36 as const; // C2
export const PIANO_DEFAULT_VISIBLE_MAX_MIDI = 84 as const; // C6
export const MIN_MANUAL_VOICING_NOTES = 1 as const;
export const MAX_MANUAL_VOICING_NOTES = 12 as const;
export const MAX_ANNOTATION_CODE_POINTS = 500 as const;
export const MAX_STRUCTURED_EDIT_HISTORY = 50 as const;

/* -------------------------------------------------------------------------- */
/* Tab View Models                                                            */
/* -------------------------------------------------------------------------- */

export type InspectorSyntaxDiagnostic = Readonly<{
  code: string;
  message: string;
  offset: number;
}>;

/** 1. Symbol Tab */
export type InspectorSymbolView = Readonly<{
  sourceText: string;
  canonicalText: string | null;
  isValidSyntax: boolean;
  diagnostics: readonly InspectorSyntaxDiagnostic[];
  isCustomUnrecognized: boolean;
  draftText: string;
  isDirty: boolean;
}>;

/** 2. Structure Tab */
export type InspectorDegreeItem = Readonly<{
  degree: DegreeNumber;
  spelling: SpelledPitchClass;
  pitchClass: PitchClass;
  isRoot: boolean;
  isBass: boolean;
  isOmitted: boolean;
  role: PianoNoteRole;
}>;

export type InspectorStructureView = Readonly<{
  rootSpelling: SpelledPitchClass | null;
  qualityName: string | null;
  bassSpelling: SpelledPitchClass | null;
  degrees: readonly InspectorDegreeItem[];
  omissions: readonly DegreeNumber[];
  alterations: readonly string[];
  additions: readonly string[];
}>;

/** 3. Timing Tab */
export type InspectorTimingView = Readonly<{
  duration: BeatValue;
  durationLabel: string;
  measureIndex: number;
  measureOrdinal: number;
  measureStartBeat: BeatValue;
  beatInMeasure: BeatValue;
  isMeasureComplete: boolean;
}>;

/** 4. Voicing Tab */
export type InspectorVoicingView = Readonly<{
  mode: InspectorVoicingMode;
  family: AutoVoicingFamily | null;
  activePitches: readonly SpelledPitch[];
  spelledPitches: readonly SpelledPitchClass[];
  midiNoteNumbers: readonly number[];
  canSwitchToManual: boolean;
  canSwitchToAuto: boolean;
  canSwitchToFrozen: boolean;
  manualNoteCount: number;
  isUnisonDuplicateRejected: boolean;
}>;

/** 5. Harmony Tab */
export type InspectorHarmonyView = Readonly<{
  qualityCategory: string;
  guideTones: readonly SpelledPitchClass[];
  tensions: readonly string[];
  characteristicTones: readonly string[];
  scaleSuggestions: readonly string[];
  romanNumeral: string | null;
  tonalFunction: string | null;
}>;

/** 6. Motion Tab */
export type InspectorMotionPathItem = Readonly<{
  fromPitch: SpelledPitch | null;
  toPitch: SpelledPitch | null;
  intervalSemis: number;
  motionType: "common" | "step" | "skip" | "leap" | "retained";
}>;

export type InspectorMotionView = Readonly<{
  previousChordSymbol: string | null;
  nextChordSymbol: string | null;
  commonToneCount: number;
  stepwiseMotionCount: number;
  voicePaths: readonly InspectorMotionPathItem[];
}>;

/** 7. Notes / Annotation Tab */
export type InspectorNotesView = Readonly<{
  rawAnnotation: string;
  sanitizedAnnotation: string;
  codePointCount: number;
  maxCodePoints: number;
  hasUnsafeMarkupStripped: boolean;
  isDirty: boolean;
}>;

/* -------------------------------------------------------------------------- */
/* Piano View Model                                                           */
/* -------------------------------------------------------------------------- */

export type PianoKeyView = Readonly<{
  midi: number;
  pitchClass: PitchClass;
  isBlack: boolean;
  spelling: SpelledPitchClass | null;
  isActiveVoiced: boolean;
  isRoot: boolean;
  isBass: boolean;
  isGuideTone: boolean;
  role: PianoNoteRole | null;
  octave: number;
  accessibleLabel: string;
}>;

export type PianoKeyboardViewModel = Readonly<{
  visibleMinMidi: number;
  visibleMaxMidi: number;
  keys: readonly PianoKeyView[];
  activeMidiNotes: readonly number[];
  hoveredMidi: number | null;
  focusedMidi: number | null;
}>;

/* -------------------------------------------------------------------------- */
/* Aggregate Chord Inspector View Model                                       */
/* -------------------------------------------------------------------------- */

export type ChordInspectorViewModel = Readonly<{
  hasSelectedEvent: boolean;
  selectedEventId: ChordEventId | null;
  selectedMeasureId: MeasureId | null;
  selectedSectionId: SectionId | null;
  activeTab: InspectorTabId;
  symbol: InspectorSymbolView;
  structure: InspectorStructureView;
  timing: InspectorTimingView;
  voicing: InspectorVoicingView;
  harmony: InspectorHarmonyView;
  motion: InspectorMotionView;
  notes: InspectorNotesView;
  piano: PianoKeyboardViewModel;
  preview: ChordPreviewStatus;
}>;

/* -------------------------------------------------------------------------- */
/* Preview & Audio Interaction                                                */
/* -------------------------------------------------------------------------- */

export const CHORD_PREVIEW_STATUS_KINDS = Object.freeze([
  "idle",
  "sounding",
  "stopping",
  "unavailable",
  "failed",
] as const);

export type ChordPreviewStatusKind = (typeof CHORD_PREVIEW_STATUS_KINDS)[number];

export type ChordPreviewStatus = Readonly<{
  kind: ChordPreviewStatusKind;
  activePitches: readonly SpelledPitch[];
  generation: number;
  failureCode: string | null;
}>;

/* -------------------------------------------------------------------------- */
/* Intents / Actions                                                          */
/* -------------------------------------------------------------------------- */

export type ChordInspectorIntent =
  | Readonly<{ kind: "select-tab"; tab: InspectorTabId }>
  | Readonly<{ kind: "edit-symbol-draft"; text: string }>
  | Readonly<{ kind: "apply-symbol-draft" }>
  | Readonly<{ kind: "reset-symbol-draft" }>
  | Readonly<{ kind: "set-voicing-mode"; targetMode: InspectorVoicingMode; confirmDiscardManual?: boolean }>
  | Readonly<{ kind: "toggle-manual-piano-key"; midi: number }>
  | Readonly<{ kind: "clear-manual-pitches" }>
  | Readonly<{ kind: "edit-annotation-draft"; text: string }>
  | Readonly<{ kind: "apply-annotation-draft" }>
  | Readonly<{ kind: "preview-press-down"; pitches: readonly SpelledPitch[] }>
  | Readonly<{ kind: "preview-release" }>;

/* -------------------------------------------------------------------------- */
/* State Machine & Refusals                                                   */
/* -------------------------------------------------------------------------- */

export const U2_REFUSAL_CODES = Object.freeze([
  "u2.no_selected_chord",
  "u2.invalid_symbol_syntax",
  "u2.unresolvable_chord_symbol",
  "u2.manual_voicing_empty",
  "u2.manual_voicing_exceeds_maximum",
  "u2.manual_voicing_unison_duplicate",
  "u2.manual_voicing_out_of_range",
  "u2.mode_switch_requires_confirmation",
  "u2.annotation_length_exceeded",
  "u2.preview_audio_unavailable",
  "u2.preview_generation_mismatch",
] as const);

export type U2RefusalCode = (typeof U2_REFUSAL_CODES)[number];

export type U2OperationResult<Value> =
  | Readonly<{ ok: true; value: Value }>
  | Readonly<{ ok: false; code: U2RefusalCode; message: string }>;
