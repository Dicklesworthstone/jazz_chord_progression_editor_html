import type { ChordSpec } from "../domain";

/**
 * Session-scale next-chord continuation: the public types and frozen limits.
 *
 * This is deliberately NOT the G2 Contextual Continuation Engine the rebuild
 * plan specifies (providers over plural H0 readings, Pareto pruning, cost
 * profiles, 100 ms gate). It is a bounded, explainable subset that answers
 * "what could come next?" from the literal chord facts alone, so the Harmony
 * Lens can offer plural options today without claiming any G2/U3 milestone.
 * Every law the Theory Idea Wizard binds to suggestion-type features still
 * applies: plural options, typed explanations, determinism, explicit bounds,
 * and no result ever labeled correct or best.
 */

export const CONTINUATION_ENGINE_VERSION = "session-continuation@1" as const;

/** Providers run in exactly this order; the order is part of the contract. */
export const CONTINUATION_PROVIDER_IDS = Object.freeze([
  "dominant-resolution",
  "turnaround",
  "diatonic-next",
  "two-five-approach",
  "tritone-approach",
  "backdoor",
] as const);
export type ContinuationProviderId =
  (typeof CONTINUATION_PROVIDER_IDS)[number];

export const CONTINUATION_CATEGORIES = Object.freeze([
  "resolve",
  "continue-pattern",
  "approach-target",
  "increase-color",
  "explore",
] as const);
export type ContinuationCategory = (typeof CONTINUATION_CATEGORIES)[number];

/**
 * The only qualities the engine may ever emit. The playability law
 * (jcpe-tkos) demands that anything the surface offers reaches sound; a
 * closed emission set makes that provable by exhaustion: 12 roots by these
 * suffixes, every one parsed by T0 and played through the real path.
 */
export const CONTINUATION_EMISSION_QUALITIES = Object.freeze([
  "maj7",
  "m7",
  "7",
] as const);
export type ContinuationEmissionQuality =
  (typeof CONTINUATION_EMISSION_QUALITIES)[number];

export const MAX_CONTINUATION_CONTEXT_EVENTS = 4;
export const MAX_CONTINUATION_SUGGESTIONS = 8;
export const MAX_CONTINUATION_PER_PROVIDER = 2;

export type ContinuationExplanation = Readonly<{
  providerId: ContinuationProviderId;
  /** One concrete sentence naming the trigger chord(s) and the law applied. */
  sentence: string;
  /** The exact context symbols the provider reasoned from. */
  sourceSymbols: readonly string[];
}>;

export type ContinuationSuggestion = Readonly<{
  /** Stable and deterministic: `${providerId}:${symbolText}`. */
  id: string;
  /** ASCII the T0 grammar parses `ready`; root name plus an emission quality. */
  symbolText: string;
  category: ContinuationCategory;
  explanation: ContinuationExplanation;
}>;

export type ContinuationRequest = Readonly<{
  /**
   * The last chords before the insertion point, oldest first, at most
   * MAX_CONTINUATION_CONTEXT_EVENTS. Each carries the exact stored spec;
   * the engine never re-parses source text.
   */
  context: readonly ChordSpec[];
}>;

export type ContinuationWorkEvidence = Readonly<{
  contextEventsExamined: number;
  providersRun: number;
  candidatesEmitted: number;
  dedupeComparisons: number;
  termination: "complete";
}>;

export type ContinuationResult = Readonly<{
  engineVersion: typeof CONTINUATION_ENGINE_VERSION;
  suggestions: readonly ContinuationSuggestion[];
  evidence: ContinuationWorkEvidence;
}>;
