import {
  type BeatValue,
  type ChordEventId,
  type SpelledPitchClass,
} from "../domain";
import type { AccidentalStyle } from "./syntax-contract";
import {
  type IntervalDirection,
  type IntervalQuality,
  type SpelledInterval,
  type TransformLaw,
  type TransformLawFamily,
  type TransformLawId,
  type TransformOptions,
  type TransformResult,
  type TransposedChordResult,
  type TransposeProgressionOptions,
  type TransposeProgressionResult,
} from "./h1-contract";
import {
  evaluateTransformCandidates,
  getTransformLaw,
  listTransformLaws,
} from "./transform-laws";
import {
  invertInterval,
  makeSpelledInterval,
  transposeChordSymbolByInterval,
  transposePitchByInterval,
  transposeProgressionByInterval,
} from "./spelled-transposition";

export interface H1Operations {
  readonly getTransformLaw: (lawId: TransformLawId) => TransformLaw | undefined;
  readonly listTransformLaws: (family?: TransformLawFamily) => readonly TransformLaw[];
  readonly evaluateTransformCandidates: (
    events: readonly {
      eventId: ChordEventId;
      chordSymbol: string;
      offsetBeat: BeatValue;
      duration: BeatValue;
    }[],
    targetIndex: number,
    options?: TransformOptions,
  ) => TransformResult;
  readonly makeSpelledInterval: (
    diatonicNumber: number,
    quality: IntervalQuality,
    direction: IntervalDirection,
  ) => SpelledInterval;
  readonly invertInterval: (interval: SpelledInterval) => SpelledInterval;
  readonly transposePitchByInterval: (
    pitch: SpelledPitchClass,
    interval: SpelledInterval,
  ) => SpelledPitchClass;
  readonly transposeChordSymbolByInterval: (
    symbol: string,
    interval: SpelledInterval,
    accidentalStyle?: AccidentalStyle,
  ) => TransposedChordResult;
  readonly transposeProgressionByInterval: (
    chords: readonly string[],
    options: TransposeProgressionOptions,
  ) => TransposeProgressionResult;
}

export const h1Operations: H1Operations = Object.freeze({
  getTransformLaw,
  listTransformLaws,
  evaluateTransformCandidates,
  makeSpelledInterval,
  invertInterval,
  transposePitchByInterval,
  transposeChordSymbolByInterval,
  transposeProgressionByInterval,
});
