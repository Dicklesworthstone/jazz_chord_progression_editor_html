import {
  type ChordEventId,
  type BeatValue,
} from "../domain";
import type { AccidentalStyle } from "./syntax-contract";
import {
  type CadenceEvidence,
  type TonalJourneyOptions,
  type TonalJourneyResult,
} from "./g0-contract";
import { detectCadence } from "./phrase-cadence";
import { analyzeTonalJourney } from "./tonal-journey";

export interface G0Operations {
  readonly detectCadence: (
    fromChordSymbol: string,
    toChordSymbol: string,
    fromEventId: ChordEventId,
    toEventId: ChordEventId,
    metricContext?: { fromStrong?: boolean; toStrong?: boolean },
    accidentalStyle?: AccidentalStyle,
  ) => CadenceEvidence | null;
  readonly analyzeTonalJourney: (
    events: readonly {
      eventId: ChordEventId;
      chordSymbol: string;
      offsetBeat: BeatValue;
      duration: BeatValue;
    }[],
    options?: TonalJourneyOptions,
  ) => TonalJourneyResult;
}

export const g0Operations: G0Operations = Object.freeze({
  detectCadence,
  analyzeTonalJourney,
});
