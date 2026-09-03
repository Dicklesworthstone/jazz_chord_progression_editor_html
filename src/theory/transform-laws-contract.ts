import {
  type BeatValue,
  type ChordDegree,
  type ChordEventId,
  type KeyContext,
} from "../domain";
import type { AccidentalStyle } from "./syntax-contract";

export const H1_TRANSFORM_LAW_SCHEMA = "changes.transform-law.v1" as const;
export const H1_TRANSFORM_RESULT_SCHEMA = "changes.transform-result.v1" as const;

export const MAX_H1_TRANSFORM_EVENTS = 64 as const;
export const MAX_H1_LAWS_PER_CANDIDATE = 16 as const;
export const MAX_H1_EDIT_PLAN_OPERATIONS = 32 as const;

export type TransformLawFamily =
  | "diatonic-functional"
  | "secondary-dominant"
  | "secondary-ii-v"
  | "tritone-substitute"
  | "backdoor-dominant"
  | "modal-interchange"
  | "diminished-passing"
  | "dominant-chain"
  | "harmonic-sequence"
  | "pivot-modulation"
  | "chromatic-approach";

export type TransformLawId =
  | "law.diatonic.tonic-extension"
  | "law.diatonic.subdominant-expansion"
  | "law.secondary-dominant.v-of-v"
  | "law.secondary-dominant.v-of-ii"
  | "law.secondary-ii-v.insertion"
  | "law.tritone-sub.primary"
  | "law.tritone-sub.secondary"
  | "law.backdoor.resolution"
  | "law.modal-interchange.subdominant-minor"
  | "law.modal-interchange.bvi-major"
  | "law.diminished.passing-sharp-one"
  | "law.diminished.passing-sharp-two"
  | "law.dominant-chain.cycle"
  | "law.sequence.descending-fifths"
  | "law.pivot.common-chord"
  | "law.chromatic.half-step-above"
  | "law.chromatic.half-step-below";

export interface TransformPreconditions {
  readonly requiredDegrees?: readonly ChordDegree[];
  readonly requiredTriads?: readonly string[];
  readonly requiredSevenths?: readonly string[];
  readonly minPrecedingEvents?: number;
  readonly minFollowingEvents?: number;
  readonly targetHarmonicFunction?: "tonic" | "subdominant" | "dominant";
}

export interface TransformPostconditions {
  readonly preservedGuideTones: boolean;
  readonly retainedResolutionTarget: boolean;
  readonly preservesExactDuration: boolean;
  readonly expectedVoiceLeadingMotion: "stepwise" | "common-tone" | "half-step";
}

export interface TransformEditOperation {
  readonly kind: "replace" | "insert" | "split" | "merge";
  readonly targetEventId: ChordEventId;
  readonly originalSymbol: string;
  readonly newSymbol: string;
  readonly offsetBeat: BeatValue;
  readonly duration: BeatValue;
}

export interface TransformEditPlan {
  readonly operations: readonly TransformEditOperation[];
  readonly totalOriginalDuration: BeatValue;
  readonly totalNewDuration: BeatValue;
  readonly maintainsTimeBalance: boolean;
}

export interface TransformLaw {
  readonly lawId: TransformLawId;
  readonly family: TransformLawFamily;
  readonly title: string;
  readonly description: string;
  readonly preconditions: TransformPreconditions;
  readonly postconditions: TransformPostconditions;
  readonly assumptions: readonly string[];
  readonly limitations: readonly string[];
  readonly harmonicExplanation: string;
}

export interface TransformCandidate {
  readonly candidateId: string;
  readonly lawId: TransformLawId;
  readonly family: TransformLawFamily;
  readonly title: string;
  readonly targetEventId: ChordEventId;
  readonly originalProgression: readonly string[];
  readonly transformedProgression: readonly string[];
  readonly editPlan: TransformEditPlan;
  readonly voiceLeadingScore: number;
  readonly harmonicTensionDelta: number;
  readonly explanation: string;
}

export interface TransformRefusal {
  readonly code:
    | "h1.invalid_chord"
    | "h1.empty_target"
    | "h1.preconditions_not_met"
    | "h1.duration_mismatch"
    | "h1.events_exceeded"
    | "h1.stale_revision"
    | "h1.unsupported_law";
  readonly message: string;
  readonly eventId?: ChordEventId;
}

export type TransformResult =
  | {
      readonly ok: true;
      readonly schema: typeof H1_TRANSFORM_RESULT_SCHEMA;
      readonly candidates: readonly TransformCandidate[];
      readonly workSteps: number;
    }
  | {
      readonly ok: false;
      readonly refusal: TransformRefusal;
    };

export interface TransformOptions {
  readonly keyContext?: KeyContext;
  readonly accidentalStyle?: AccidentalStyle;
  readonly allowedFamilies?: readonly TransformLawFamily[];
  readonly maxCandidates?: number;
}
