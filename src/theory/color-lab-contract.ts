import type {
  ChordDegree,
  ChordEventId,
  SpelledPitchClass,
} from "../domain";

/**
 * G6 Color Laboratory Contract.
 *
 * Provides deterministic definitions for contextual tension derivation,
 * chord-scale color mappings, and upper-structure triad (UST) options.
 * Every option explicitly details its constituent degrees, omitted tones,
 * melody/bass clashes, guide-tone preservation, and required context assumptions.
 */
export const G6_COLOR_LAB_CONTRACT_SCHEMA =
  "changes.theory.color-lab-contract.v1" as const;
export const G6_COLOR_LAB_RESULT_SCHEMA =
  "changes.theory.color-lab-result.v1" as const;

export const G6_COLOR_LAB_TABLE_ID = "changes.color-lab-tables" as const;
export const G6_COLOR_LAB_TABLE_VERSION = 1;
export const G6_COLOR_LAB_TENSION_POLICY_ID =
  "changes.color-lab-tension-policy" as const;
export const G6_COLOR_LAB_TENSION_POLICY_VERSION = 1;
export const G6_UPPER_STRUCTURE_TABLE_ID =
  "changes.upper-structure-triad-table" as const;
export const G6_UPPER_STRUCTURE_TABLE_VERSION = 1;

/** Max limits for color laboratory queries. */
export const MAX_G6_COLOR_OPTIONS = 16;
export const MAX_G6_UPPER_STRUCTURE_OPTIONS = 12;
export const MAX_G6_TENSIONS_PER_OPTION = 6;
export const MAX_G6_CLASHES_PER_OPTION = 4;

/** Color family categories. */
export const COLOR_FAMILIES = Object.freeze([
  "diatonic-extension",
  "altered-dominant",
  "lydian-dominant",
  "modal-color",
  "blues-color",
  "upper-structure-triad",
] as const);
export type ColorFamily = (typeof COLOR_FAMILIES)[number];

/** Recognizable jazz tension degrees. */
export const TENSION_DEGREES = Object.freeze([
  "9",
  "b9",
  "#9",
  "11",
  "#11",
  "13",
  "b13",
] as const);
export type TensionDegree = (typeof TENSION_DEGREES)[number];

/** Triad qualities for upper structures. */
export const UPPER_STRUCTURE_QUALITIES = Object.freeze([
  "major",
  "minor",
  "augmented",
  "diminished",
] as const);
export type UpperStructureQuality = (typeof UPPER_STRUCTURE_QUALITIES)[number];

/** Clash kinds that alert users to harsh voice clashes or avoid notes. */
export const COLOR_CLASH_KINDS = Object.freeze([
  "minor-ninth-against-root",
  "minor-ninth-against-third",
  "minor-ninth-against-fifth",
  "bass-clash",
] as const);
export type ColorClashKind = (typeof COLOR_CLASH_KINDS)[number];

export type ColorClash = Readonly<{
  kind: ColorClashKind;
  intervalSemitones: 1 | 13;
  clashingDegree: ChordDegree;
  againstDegree: ChordDegree;
  explanation: string;
}>;

/**
 * A candidate tension package over a chord realization.
 */
export type ContextualColorOption = Readonly<{
  optionId: string;
  family: ColorFamily;
  title: string;
  tensions: readonly TensionDegree[];
  resultingDegrees: readonly ChordDegree[];
  omittedDegrees: readonly ChordDegree[];
  spelledPitches: readonly SpelledPitchClass[];
  compatibleScaleId: string;
  compatibleScaleName: string;
  guideTonesRetained: boolean;
  clashes: readonly ColorClash[];
  cautions: readonly string[];
  suggestedSymbol: string;
  description: string;
}>;

/**
 * Upper Structure Triad (UST) definition and realization.
 */
export type UpperStructureTriadOption = Readonly<{
  ustId: string;
  triadRoot: SpelledPitchClass;
  triadQuality: UpperStructureQuality;
  numeralRelation: string;
  resultingTensions: readonly TensionDegree[];
  resultingDegrees: readonly ChordDegree[];
  omittedDegrees: readonly ChordDegree[];
  bassRelation: string;
  compatibleScaleId: string;
  symbolNotation: string;
  triadPitches: readonly SpelledPitchClass[];
  guideTonesRetained: boolean;
  clashes: readonly ColorClash[];
  description: string;
}>;

/**
 * Complete Color Laboratory analysis result for one chord in context.
 */
export type ColorLabResult =
  | Readonly<{
      ok: true;
      schema: typeof G6_COLOR_LAB_RESULT_SCHEMA;
      eventId: ChordEventId;
      chordSymbol: string;
      colorOptions: readonly ContextualColorOption[];
      upperStructureOptions: readonly UpperStructureTriadOption[];
      defaultColorIndex: number;
    }>
  | Readonly<{
      ok: false;
      refusal: Readonly<{
        code:
          | "g6.invalid_chord"
          | "g6.unsupported_quality"
          | "g6.context_mismatch"
          | "g6.custom_unsupported";
        message: string;
      }>;
    }>;
