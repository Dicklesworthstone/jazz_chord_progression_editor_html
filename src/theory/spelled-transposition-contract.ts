import {
  type Alteration,
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

export interface TransposedChordResult {
  readonly originalSymbol: string;
  readonly transposedSymbol: string;
  readonly originalRoot: SpelledPitchClass;
  readonly transposedRoot: SpelledPitchClass;
  readonly originalBass?: SpelledPitchClass | null;
  readonly transposedBass?: SpelledPitchClass | null;
  readonly accidentalStyle: AccidentalStyle;
}

export interface TransposeProgressionOptions {
  readonly interval: SpelledInterval;
  readonly sourceKeyContext?: KeyContext;
  readonly targetKeyContext?: KeyContext;
  readonly accidentalStyle?: AccidentalStyle;
  readonly preserveManualVoicings?: boolean;
}

export interface TransposeProgressionResult {
  readonly schema: typeof H1_SPELLED_TRANSPOSITION_SCHEMA;
  readonly interval: SpelledInterval;
  readonly originalChords: readonly string[];
  readonly transposedChords: readonly string[];
  readonly originalKey?: KeyContext;
  readonly transposedKey?: KeyContext;
  readonly isLosslessRoundtrip: boolean;
}
