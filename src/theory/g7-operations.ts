import {
  type BeatValue,
  type ChordEventId,
} from "../domain";
import {
  type G7TensionResult,
  type G7TransformResult,
  type RhythmTransformKind,
  type RhythmTransformOptions,
  type TensionCurveOptions,
} from "./g7-contract";
import {
  applyRhythmTransform,
  computeTensionCurve,
} from "./rhythm-transforms";

export interface G7Operations {
  readonly computeTensionCurve: (
    events: readonly {
      eventId: ChordEventId;
      chordSymbol: string;
      offsetBeat: BeatValue;
      duration: BeatValue;
    }[],
    options?: TensionCurveOptions,
  ) => G7TensionResult;
  readonly applyRhythmTransform: (
    events: readonly {
      eventId: ChordEventId;
      chordSymbol: string;
      offsetBeat: BeatValue;
      duration: BeatValue;
    }[],
    transformKind: RhythmTransformKind,
    options?: RhythmTransformOptions,
  ) => G7TransformResult;
}

export const g7Operations: G7Operations = Object.freeze({
  computeTensionCurve,
  applyRhythmTransform,
});
