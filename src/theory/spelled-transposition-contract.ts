import {
  type Alteration,
  type ChordSpec,
  type KeyContext,
  type SpelledPitchClass,
} from "../domain";
import type { AccidentalStyle } from "./syntax-contract";

export const H1_SPELLED_TRANSPOSITION_SCHEMA = "changes.spelled-transposition.v1" as const;

export type IntervalQuality = "perfect" | "major" | "minor" | "augmented" | "diminished";
export type IntervalDirection = "up" | "down";

export interface SpelledInterval {
  readonly diatonicNumber: number; // 1 = unison, 2 = second, 3 = third, 4 = fourth, 5 = fifth, 6 = sixth, 7 = seventh, 8 = octave
  readonly quality: IntervalQuality;
  readonly semitones: number;
  readonly direction: IntervalDirection;
  readonly scaleSteps: number; // 0 for unison/octave, 1 for 2nd, 2 for 3rd, 3 for 4th, 4 for 5th, 5 for 6th, 6 for 7th
  readonly alter: Alteration;
}

/**
 * Why a chord could not be transposed. Never answered by echoing the input:
 * - `unparseable`: the source symbol is not a supported chord;
 * - `spelling-overflow`: the exact spelled result needs more than a double
 *   accidental (e.g. B♯ up an augmented unison), so no spelling exists;
 * - `unverified`: no printed symbol re-parses to exactly the transposed chord.
 */
export type ChordTranspositionRefusalCode =
  | "transpose.unparseable"
  | "transpose.spelling-overflow"
  | "transpose.unverified";

export type TransposedChordResult =
  | Readonly<{
      ok: true;
      originalSymbol: string;
      transposedSymbol: string;
      /** The transposed chord exactly as the T0 parser reads `transposedSymbol`. */
      transposedChord: ChordSpec;
      originalRoot: SpelledPitchClass;
      transposedRoot: SpelledPitchClass;
      originalBass: SpelledPitchClass | null;
      transposedBass: SpelledPitchClass | null;
      accidentalStyle: AccidentalStyle;
    }>
  | Readonly<{
      ok: false;
      originalSymbol: string;
      code: ChordTranspositionRefusalCode;
      accidentalStyle: AccidentalStyle;
    }>;

export interface TransposeProgressionOptions {
  readonly interval: SpelledInterval;
  readonly sourceKeyContext?: KeyContext;
  readonly targetKeyContext?: KeyContext;
  readonly accidentalStyle?: AccidentalStyle;
  readonly preserveManualVoicings?: boolean;
}

export type TransposeProgressionResult =
  | Readonly<{
      ok: true;
      schema: typeof H1_SPELLED_TRANSPOSITION_SCHEMA;
      interval: SpelledInterval;
      originalChords: readonly string[];
      transposedChords: readonly string[];
      originalKey?: KeyContext;
      transposedKey?: KeyContext;
    }>
  | Readonly<{
      ok: false;
      schema: typeof H1_SPELLED_TRANSPOSITION_SCHEMA;
      interval: SpelledInterval;
      originalChords: readonly string[];
      /** Every chord that could not be transposed, by input index. */
      refusals: readonly Readonly<{ index: number; code: ChordTranspositionRefusalCode }>[];
    }>;
