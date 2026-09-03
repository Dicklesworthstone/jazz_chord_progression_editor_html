import {
  type BeatValue,
  type ChordEventId,
  type KeyContext,
} from "../domain";
import type { AccidentalStyle } from "./syntax-contract";

export const G3_ROUTE_PLANNER_RESULT_SCHEMA = "changes.route-planner-result.v1" as const;

export const MAX_G3_ROUTE_STEPS = 8 as const;
export const MAX_G3_OUTGOING_PER_STATE = 64 as const;
export const MAX_G3_SEARCH_STATES = 50000 as const;
export const MAX_G3_RETURNED_ROUTES = 8 as const;

export type RouteStrategy =
  | "circle-of-fifths"
  | "tritone-substitute"
  | "chromatic-approach"
  | "modal-interchange"
  | "diminished-pivot"
  | "coltrane-matrix";

export interface HarmonicCostVector {
  readonly voiceLeadingDistance: number; // sum of semitone motions
  readonly harmonicTensionScore: number; // accumulated tension
  readonly stepsCount: number; // number of intermediate chords
  readonly totalCost: number; // weighted combination
}

export interface RouteStepProof {
  readonly fromChord: string;
  readonly toChord: string;
  readonly strategy: RouteStrategy;
  readonly explanation: string;
  readonly voiceLeadingMotion: "stepwise" | "cycle-fifth" | "chromatic" | "common-tone";
}

export interface RoutePatchOperation {
  readonly kind: "insert";
  readonly targetEventId: ChordEventId;
  readonly chordSymbol: string;
  readonly offsetBeat: BeatValue;
  readonly duration: BeatValue;
}

export interface HarmonicRoute {
  readonly routeId: string;
  readonly startChord: string;
  readonly endChord: string;
  readonly intermediateChords: readonly string[];
  readonly fullProgression: readonly string[];
  readonly stepsCount: number;
  readonly strategyChain: readonly RouteStrategy[];
  readonly proofs: readonly RouteStepProof[];
  readonly costVector: HarmonicCostVector;
  readonly patchOperations: readonly RoutePatchOperation[];
  readonly rank: number;
}

export interface G3Refusal {
  readonly code:
    | "g3.invalid_endpoint"
    | "g3.unreachable_destination"
    | "g3.steps_exceeded"
    | "g3.states_exhausted"
    | "g3.stale_revision";
  readonly message: string;
  readonly eventId?: ChordEventId;
}

export type RoutePlannerResult =
  | {
      readonly ok: true;
      readonly schema: typeof G3_ROUTE_PLANNER_RESULT_SCHEMA;
      readonly routes: readonly HarmonicRoute[];
      readonly statesExplored: number;
      readonly workSteps: number;
    }
  | {
      readonly ok: false;
      readonly refusal: G3Refusal;
    };

export interface RoutePlannerOptions {
  readonly maxSteps?: number;
  readonly keyContext?: KeyContext;
  readonly allowedStrategies?: readonly RouteStrategy[];
  readonly accidentalStyle?: AccidentalStyle;
  readonly defaultStepDuration?: BeatValue;
  readonly startOffsetBeat?: BeatValue;
}
