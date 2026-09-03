import {
  type BeatValue,
  type ChordEventId,
  type KeyContext,
} from "../domain";
import type { AccidentalStyle } from "./syntax-contract";

export const G7_TENSION_CURVE_SCHEMA = "changes.tension-curve.v1" as const;
export const G7_RHYTHM_TRANSFORM_SCHEMA = "changes.rhythm-transform.v1" as const;

export const MAX_G7_PROGRESSION_EVENTS = 64 as const;
export const MAX_G7_TENSION_POINTS = 128 as const;

export type RhythmTransformKind =
  | "anticipation"
  | "delay"
  | "split"
  | "merge"
  | "augmentation"
  | "diminution"
  | "metric-displacement";

export interface TensionPoint {
  readonly eventId: ChordEventId;
  readonly offsetBeat: BeatValue;
  readonly duration: BeatValue;
  readonly chordSymbol: string;
  readonly functionalTension: number; // 0..100
  readonly dissonanceTension: number; // 0..100
  readonly voiceMotionTension: number; // 0..100
  readonly registerTension: number; // 0..100
  readonly harmonicRhythmTension: number; // 0..100
  readonly contextConfidence: number; // 0..100
  readonly aggregateTension: number; // 0..100
}

export interface TensionCurveResult {
  readonly schema: typeof G7_TENSION_CURVE_SCHEMA;
  readonly points: readonly TensionPoint[];
  readonly minTension: number;
  readonly maxTension: number;
  readonly meanTension: number;
}

export interface TransformedEvent {
  readonly eventId: ChordEventId;
  readonly chordSymbol: string;
  readonly offsetBeat: BeatValue;
  readonly duration: BeatValue;
}

export interface RhythmTransformResult {
  readonly schema: typeof G7_RHYTHM_TRANSFORM_SCHEMA;
  readonly transformKind: RhythmTransformKind;
  readonly transformedEvents: readonly TransformedEvent[];
  readonly totalBeats: BeatValue;
  readonly description: string;
}

export interface G7Refusal {
  readonly code:
    | "g7.empty_events"
    | "g7.events_exceeded"
    | "g7.invalid_duration"
    | "g7.invalid_chord"
    | "g7.unsupported_transform"
    | "g7.stale_revision";
  readonly message: string;
  readonly eventId?: ChordEventId;
}

export type G7TensionResult =
  | {
      readonly ok: true;
      readonly curve: TensionCurveResult;
      readonly workSteps: number;
    }
  | {
      readonly ok: false;
      readonly refusal: G7Refusal;
    };

export type G7TransformResult =
  | {
      readonly ok: true;
      readonly result: RhythmTransformResult;
      readonly workSteps: number;
    }
  | {
      readonly ok: false;
      readonly refusal: G7Refusal;
    };

export interface TensionCurveOptions {
  readonly keyContext?: KeyContext;
  readonly accidentalStyle?: AccidentalStyle;
}

export interface RhythmTransformOptions {
  readonly accidentalStyle?: AccidentalStyle;
  readonly shiftDelta?: BeatValue;
  readonly splitRatio?: { numerator: number; denominator: number };
}
