import type { ChordDegree, ChordEventId, PitchClass, SpelledPitchClass } from "../domain";
import type { DiscoveryIdentity, DiscoveryRequest, DiscoveryResult,
  H0AnalysisRequest, H0AnalysisResult, H0ChordScaleRequest, H0ChordScaleResult,
  H0LiteralFactsRequest, H0LiteralFactsResult } from "../theory";

/** Specification vocabulary; these declarations do not register an engine. */
export const SEMANTIC_SURFACE_CONTRACT_SCHEMA = "changes.semantic-surface-contract.v1";
export const SEMANTIC_ENGINE_IDS = Object.freeze(["H0", "H1", "G0", "G1", "G2", "G3", "G4", "G5", "G6", "G7", "G8", "G9"] as const);
export type SemanticEngineId = (typeof SEMANTIC_ENGINE_IDS)[number];
export const SEMANTIC_SURFACE_IDS = Object.freeze(["web-studio", "native-continuation"] as const);
export type SemanticSurfaceId = (typeof SEMANTIC_SURFACE_IDS)[number];

export const SEMANTIC_SURFACE_LIMITS = Object.freeze({
  sourceEvents: 256, legacyContextEvents: 4, continuationContextEvents: 8,
  continuationCandidatesPerProvider: 32, webDisplayedContinuations: 16,
  nativeDisplayedContinuations: 8, nativeRequestCodeUnits: 16384,
  requestBytes: 4194304, resultBytes: 8388608, snapshotBytes: 8388608,
  trackedBytes: 67108864, activeQueries: 1, publicationAttempts: 1,
} as const);

/** The old symbol-only v1 endpoint cannot issue an exact-source response. */
export const NATIVE_EXACT_CONTINUATION_REQUEST_SCHEMA = "frankenjazz.native-continuation-request.v2";
export const NATIVE_EXACT_CONTINUATION_RESPONSE_SCHEMA = "frankenjazz.native-continuation-response.v2";
export type NativeExactContinuationRequest = Readonly<{
  schema: typeof NATIVE_EXACT_CONTINUATION_REQUEST_SCHEMA;
  request: DiscoveryRequest;
  display: Readonly<{ limit: 8; policy: DiscoveryIdentity["policy"] }>;
}>;
export type NativeExactContinuationResponse = Readonly<{
  schema: typeof NATIVE_EXACT_CONTINUATION_RESPONSE_SCHEMA;
  result: DiscoveryResult;
}> | Readonly<{
  schema: typeof NATIVE_EXACT_CONTINUATION_RESPONSE_SCHEMA;
  refusal: Readonly<{
    code: "native.unsupported-version" | "native.invalid-request" | "native.input-limit";
    path: readonly (string | number)[];
  }>;
}>;

/** Existing synchronous H0 signatures retain their original applicability. */
export interface SemanticLiteralOperations {
  readonly deriveLiteralFacts: (request: H0LiteralFactsRequest) => H0LiteralFactsResult;
  readonly analyzeChordInContext: (request: H0AnalysisRequest) => H0AnalysisResult;
  readonly enumerateChordScaleOptions: (request: H0ChordScaleRequest) => H0ChordScaleResult;
}

/** Read-only musical evidence. None of these fields grants Apply authority. */
export type SemanticContextTone = Readonly<{
  eventId: ChordEventId;
  selectedRealizationId: string;
  degree: ChordDegree;
  spelling: SpelledPitchClass;
  pitchClass: PitchClass;
  pitchClassContained: boolean;
  spellingContained: boolean;
}>;
export type SemanticMajorContextReading = Readonly<{
  kind: "reading";
  tonic: SpelledPitchClass;
  policy: Readonly<{ id: "major-pitch-overlap"; version: "1" }>;
  toneOccurrences: number;
  pitchClassMatches: number;
  spellingMatches: number;
  completePitchClassContainment: boolean;
  completeSpelledContainment: boolean;
  tones: readonly SemanticContextTone[];
  tiedTonicPitchClasses: readonly PitchClass[];
  missingPremises: readonly ("undeclared-key" | "missing-neighbor" | "selected-realization-required")[];
}>;
export type SemanticContextBarrier = Readonly<{
  kind: "unavailable";
  eventId: ChordEventId;
  reason: "custom-chord" | "unsupported-chord" | "selected-realization-required";
}>;

export const SEMANTIC_MUSICIAN_JOURNEY = Object.freeze([
  "enter-chart", "inspect-literal", "inspect-context", "preview", "edit-during-search",
  "reject-stale", "recompute", "apply", "undo", "restart-recovery",
  "download-canonical", "download-text", "download-midi",
] as const);
export const SEMANTIC_DISPATCH_FAULTS = Object.freeze([
  "absent-call", "no-op-call", "wrong-engine", "discarded-result", "fabricated-dispatch",
  "wrong-selection", "stale-revision", "invented-duration", "normalized-spelling",
  "dropped-unison", "fabricated-counter", "false-containment", "lost-counterevidence",
  "hidden-context-barrier", "stale-bridge-bundle", "header-only-midi",
] as const);
