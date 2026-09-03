import {
  type G8SequenceResult,
  type G8TransformResult,
  type NeoRiemannianOp,
  type NonfunctionalTransformOptions,
} from "./g8-contract";
import {
  applyNeoRiemannianTransform,
  generateHarmonicSequence,
} from "./nonfunctional-transforms";

export interface G8Operations {
  readonly applyNeoRiemannianTransform: (
    chordSymbol: string,
    op: NeoRiemannianOp,
    options?: NonfunctionalTransformOptions,
  ) => G8TransformResult;
  readonly generateHarmonicSequence: (
    motifChords: readonly string[],
    stepIntervalSemitones: number,
    repetitions: number,
    options?: NonfunctionalTransformOptions,
  ) => G8SequenceResult;
}

export const g8Operations: G8Operations = Object.freeze({
  applyNeoRiemannianTransform,
  generateHarmonicSequence,
});
