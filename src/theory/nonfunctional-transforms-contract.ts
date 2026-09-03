import {
  type SpelledPitchClass,
} from "../domain";
import type { AccidentalStyle } from "./syntax-contract";

export const G8_NONFUNCTIONAL_TRANSFORM_SCHEMA = "changes.nonfunctional-transform.v1" as const;
export const G8_HARMONIC_SEQUENCE_SCHEMA = "changes.harmonic-sequence.v1" as const;

export const MAX_G8_SEQUENCE_LENGTH = 16 as const;
export const MAX_G8_NONFUNCTIONAL_VARIANTS = 32 as const;

export type NeoRiemannianOp = "P" | "L" | "R";

export interface NeoRiemannianTransformResult {
  readonly schema: typeof G8_NONFUNCTIONAL_TRANSFORM_SCHEMA;
  readonly op: NeoRiemannianOp;
  readonly inputChord: string;
  readonly outputChord: string;
  readonly preservedPitchClasses: readonly SpelledPitchClass[];
  readonly shiftedVoice: {
    readonly from: SpelledPitchClass;
    readonly to: SpelledPitchClass;
    readonly semitoneDelta: number;
  };
}

export type NonfunctionalLawKind =
  | "neo-riemannian-P"
  | "neo-riemannian-L"
  | "neo-riemannian-R"
  | "chromatic-mediant"
  | "planing"
  | "common-tone-diminished";

export interface HarmonicSequencePattern {
  readonly name: string;
  readonly motifChords: readonly string[];
  readonly stepIntervalSemitones: number;
  readonly repetitions: number;
  readonly generatedProgression: readonly string[];
}

export interface G8Refusal {
  readonly code:
    | "g8.ineligible_sonority"
    | "g8.sequence_exceeded"
    | "g8.invalid_chord"
    | "g8.unsupported_op"
    | "g8.stale_revision";
  readonly message: string;
  readonly chordSymbol?: string;
}

export type G8TransformResult =
  | {
      readonly ok: true;
      readonly result: NeoRiemannianTransformResult;
    }
  | {
      readonly ok: false;
      readonly refusal: G8Refusal;
    };

export type G8SequenceResult =
  | {
      readonly ok: true;
      readonly sequence: HarmonicSequencePattern;
    }
  | {
      readonly ok: false;
      readonly refusal: G8Refusal;
    };

export interface NonfunctionalTransformOptions {
  readonly accidentalStyle?: AccidentalStyle;
}
