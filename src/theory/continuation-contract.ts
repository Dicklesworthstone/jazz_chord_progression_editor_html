import {
  type BeatValue,
  type ChordEventId,
  type ChordSpec,
  type KeyContext,
} from "../domain";
import type { AccidentalStyle } from "./syntax-contract";

/** Legacy Session Continuation Contract for Studio Controller */
export const CONTINUATION_ENGINE_VERSION = "session-continuation@1" as const;

export const CONTINUATION_PROVIDER_IDS = Object.freeze([
  "dominant-resolution",
  "turnaround",
  "diatonic-next",
  "two-five-approach",
  "tritone-approach",
  "backdoor",
] as const);
export type LegacyContinuationProviderId = (typeof CONTINUATION_PROVIDER_IDS)[number];

export const CONTINUATION_CATEGORIES = Object.freeze([
  "resolve",
  "continue-pattern",
  "approach-target",
  "increase-color",
  "explore",
] as const);
export type LegacyContinuationCategory = (typeof CONTINUATION_CATEGORIES)[number];

export const CONTINUATION_EMISSION_QUALITIES = Object.freeze([
  "maj7",
  "m7",
  "7",
] as const);
export type ContinuationEmissionQuality = (typeof CONTINUATION_EMISSION_QUALITIES)[number];

export const MAX_CONTINUATION_CONTEXT_EVENTS = 4;
export const MAX_CONTINUATION_SUGGESTIONS = 8;
export const MAX_CONTINUATION_PER_PROVIDER = 2;

export type ContinuationExplanation = Readonly<{
  providerId: LegacyContinuationProviderId;
  sentence: string;
  sourceSymbols: readonly string[];
}>;

export type ContinuationSuggestion = Readonly<{
  id: string;
  symbolText: string;
  category: LegacyContinuationCategory;
  explanation: ContinuationExplanation;
}>;

export type ContinuationRequest = Readonly<{
  context: readonly ChordSpec[];
}>;

export type ContinuationWorkEvidence = Readonly<{
  contextEventsExamined: number;
  providersRun: number;
  candidatesEmitted: number;
  dedupeComparisons: number;
  termination: "complete";
}>;

export type LegacyContinuationResult = Readonly<{
  engineVersion: typeof CONTINUATION_ENGINE_VERSION;
  suggestions: readonly ContinuationSuggestion[];
  evidence: ContinuationWorkEvidence;
}>;

/** G2 Contextual Continuation Engine Contract */
export const G2_CONTINUATION_RESULT_SCHEMA = "changes.continuation-result.v1" as const;

export const MAX_G2_CANDIDATES_PER_PROVIDER = 32 as const;
export const MAX_G2_DISPLAY_OPTIONS = 16 as const;
export const MAX_G2_CONTEXT_EVENTS = 8 as const;

export type ContinuationCategory =
  | "smooth"
  | "functional"
  | "colorful"
  | "exploratory"
  | "resolve"
  | "continue-pattern"
  | "approach-target"
  | "increase-color"
  | "explore";

export type ContinuationProviderId =
  | "provider.functional.circle-cadence"
  | "provider.modal.step-vamp"
  | "provider.chromatic.tritone-approach"
  | "provider.diminished.passing"
  | "provider.sequence.descending-fifths"
  | "provider.line-cliche.minor-step"
  | "provider.nonfunctional.planing"
  | LegacyContinuationProviderId;

export interface ContinuationHarmonicProof {
  readonly voiceLeadingScore: number; // 0..100
  readonly tensionDelta: number; // -5..+5
  readonly preservedGuideTones: boolean;
  readonly expectedMotion: "stepwise" | "cycle-fifth" | "chromatic" | "common-tone";
  readonly whyExplanation: string;
  readonly whyNotConsiderations?: readonly string[];
}

export interface ContinuationEditPlan {
  readonly targetEventId: ChordEventId;
  readonly insertedChordSymbol: string;
  readonly offsetBeat: BeatValue;
  readonly duration: BeatValue;
}

export interface ContinuationCandidate {
  readonly candidateId: string;
  readonly providerId: ContinuationProviderId;
  readonly category: ContinuationCategory;
  readonly chordSymbol: string;
  readonly editPlan: ContinuationEditPlan;
  readonly proof: ContinuationHarmonicProof;
  readonly rank: number;
}

export interface G2Refusal {
  readonly code:
    | "g2.empty_context"
    | "g2.context_exceeded"
    | "g2.invalid_chord"
    | "g2.no_candidate_generated"
    | "g2.stale_revision";
  readonly message: string;
  readonly eventId?: ChordEventId;
}

export type ContinuationResult =
  | {
      readonly ok: true;
      readonly schema: typeof G2_CONTINUATION_RESULT_SCHEMA;
      readonly candidates: readonly ContinuationCandidate[];
      readonly workSteps: number;
    }
  | {
      readonly ok: false;
      readonly refusal: G2Refusal;
    }
  | LegacyContinuationResult;

export interface ContinuationOptions {
  readonly keyContext?: KeyContext;
  readonly categoryFilter?: ContinuationCategory;
  readonly accidentalStyle?: AccidentalStyle;
  readonly maxDisplayOptions?: number;
  readonly defaultDuration?: BeatValue;
}
