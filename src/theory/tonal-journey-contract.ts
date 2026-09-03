import {
  type BeatValue,
  type ChordEventId,
  type KeyContext,
} from "../domain";
import type { AccidentalStyle } from "./syntax-contract";

export const G0_TONAL_JOURNEY_RESULT_SCHEMA = "changes.tonal-journey.v1" as const;
export const G0_PHRASE_ANALYSIS_SCHEMA = "changes.phrase-analysis.v1" as const;

export const MAX_G0_PROGRESSION_EVENTS = 256 as const;
export const MAX_G0_K_BEST_PATHS = 5 as const;
export const MAX_G0_KEY_AREAS_PER_PATH = 16 as const;

export type CadenceType =
  | "perfect-authentic"
  | "imperfect-authentic"
  | "half"
  | "deceptive"
  | "backdoor"
  | "plagal"
  | "phrygian-half"
  | "evaporating";

export type CadenceClosureStatus =
  | "candidate"
  | "supported"
  | "attenuated"
  | "closed";

export interface CadenceEvidence {
  readonly cadenceType: CadenceType;
  readonly status: CadenceClosureStatus;
  readonly fromEventId: ChordEventId;
  readonly toEventId: ChordEventId;
  readonly metricStrength: number; // 0..100
  readonly harmonicStrength: number; // 0..100
  readonly explanation: string;
}

export interface KeyAreaSpan {
  readonly spanId: string;
  readonly keyContext: KeyContext;
  readonly startEventIndex: number;
  readonly endEventIndex: number;
  readonly startBeat: BeatValue;
  readonly endBeat: BeatValue;
  readonly confidenceScore: number; // 0..100
  readonly evidence: readonly string[];
  readonly isTonicization: boolean;
  readonly isPivotArea: boolean;
}

export interface TonalJourneyPath {
  readonly pathId: string;
  readonly rank: number;
  readonly keyAreas: readonly KeyAreaSpan[];
  readonly cadenceEvidence: readonly CadenceEvidence[];
  readonly overallConfidence: number; // 0..100
  readonly modulationsCount: number;
  readonly isDiatonicThroughout: boolean;
  readonly explanation: string;
}

export interface G0Refusal {
  readonly code:
    | "g0.empty_progression"
    | "g0.events_exceeded"
    | "g0.invalid_chord"
    | "g0.no_valid_path"
    | "g0.stale_revision";
  readonly message: string;
  readonly eventId?: ChordEventId;
}

export type TonalJourneyResult =
  | {
      readonly ok: true;
      readonly schema: typeof G0_TONAL_JOURNEY_RESULT_SCHEMA;
      readonly paths: readonly TonalJourneyPath[];
      readonly workSteps: number;
    }
  | {
      readonly ok: false;
      readonly refusal: G0Refusal;
    };

export interface TonalJourneyOptions {
  readonly maxPaths?: number;
  readonly preferredTonic?: KeyContext;
  readonly accidentalStyle?: AccidentalStyle;
  readonly allowTonicizations?: boolean;
}
