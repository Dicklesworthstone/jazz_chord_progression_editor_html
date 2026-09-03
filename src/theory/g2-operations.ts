import {
  type ChordEventId,
  type BeatValue,
} from "../domain";
import {
  type ContinuationOptions,
  type ContinuationResult,
} from "./g2-contract";
import { generateContextualContinuations } from "./contextual-continuation";

export interface G2Operations {
  readonly generateContextualContinuations: (
    events: readonly {
      eventId: ChordEventId;
      chordSymbol: string;
      offsetBeat: BeatValue;
      duration: BeatValue;
    }[],
    options?: ContinuationOptions,
  ) => ContinuationResult;
}

export const g2Operations: G2Operations = Object.freeze({
  generateContextualContinuations,
});
