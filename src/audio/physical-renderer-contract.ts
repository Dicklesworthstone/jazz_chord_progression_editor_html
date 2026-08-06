/**
 * PHS0 is an additive audio-realization contract. It does not alter the P0
 * playback plan or MIDI semantics. The build leaf owns all implementation.
 */

export const PHYSICAL_RENDERER_CONTRACT_SCHEMA =
  "changes.audio.physical-renderer-contract.v1" as const;
export const EXPRESSIVE_REALIZATION_PLAN_SCHEMA =
  "changes.audio.expressive-realization-plan.v1" as const;
export const PHYSICAL_RENDER_PLAN_SCHEMA =
  "changes.audio.physical-render-plan.v1" as const;
export const PHYSICAL_RENDER_ABI_VERSION = 2 as const;
export const PHYSICAL_PARAMETER_PACK_VERSION = 1 as const;

export const PHYSICAL_RENDER_MODES = Object.freeze([
  "independent-note",
  "stateful-phrase",
  "coupled-stem",
] as const);
export type PhysicalRenderMode = (typeof PHYSICAL_RENDER_MODES)[number];

export const PHYSICAL_INSTRUMENT_FAMILIES = Object.freeze([
  "clarinet",
  "flute",
  "guitar",
  "trumpet",
  "vibraphone",
] as const);
export type PhysicalInstrumentFamily =
  (typeof PHYSICAL_INSTRUMENT_FAMILIES)[number];

export const PHYSICAL_ARTICULATION_IDS = Object.freeze([
  "legato",
  "tongued",
  "portato",
  "staccato",
  "accent",
  "ghosted",
  "breath-attack",
  "finger-pluck",
  "pick-down",
  "pick-up",
  "palm-muted",
  "mallet-strike",
  "damped",
] as const);
export type PhysicalArticulationId =
  (typeof PHYSICAL_ARTICULATION_IDS)[number];

export const PHYSICAL_CONTROL_IDS = Object.freeze([
  "air.pressure",
  "air.turbulence",
  "embouchure.offset",
  "embouchure.jet-delay",
  "tongue.contact",
  "reed.stiffness",
  "reed.opening",
  "lip.resonance",
  "lip.aperture",
  "vibrato.depth",
  "vibrato.rate",
  "pick.position",
  "pick.hardness",
  "pick.direction",
  "string.damping",
  "pickup.position",
  "mallet.hardness",
  "strike.position",
  "pedal.position",
  "fan.rate",
  "fan.phase",
] as const);
export type PhysicalControlId = (typeof PHYSICAL_CONTROL_IDS)[number];

export const PHYSICAL_CURVE_INTERPOLATIONS = Object.freeze([
  "step",
  "linear",
  "monotone-cubic",
] as const);
export type PhysicalCurveInterpolation =
  (typeof PHYSICAL_CURVE_INTERPOLATIONS)[number];

export const PHYSICAL_CONTROL_VALUE_FORMAT = Object.freeze({
  representation: "signed-q16.16",
  fractionalBits: 16,
  unity: 65_536,
  minimum: -2_147_483_648,
  maximum: 2_147_483_647,
} as const);

export type PhysicalSupportedSampleRateHz = 44_100 | 48_000 | 96_000;

/** Narrow an arbitrary context rate to the contract's closed supported set. */
export function isPhysicalSupportedSampleRateHz(
  sampleRateHz: number,
): sampleRateHz is PhysicalSupportedSampleRateHz {
  return (
    sampleRateHz === 44_100 || sampleRateHz === 48_000 || sampleRateHz === 96_000
  );
}

export const PHYSICAL_RENDER_LIMITS = Object.freeze({
  supportedSampleRatesHz: Object.freeze([44_100, 48_000, 96_000] as const),
  playbackPpq: 960,
  maximumCurvesPerGesture: 12,
  maximumPointsPerCurve: 64,
  maximumPointsPerGesture: 256,
  maximumControlOffsetTicks: 230_400,
  maximumEventsPerPhrase: 128,
  maximumEventsPerStem: 512,
  maximumPhraseSeconds: 30,
  maximumStemSeconds: 30,
  maximumCoupledVoices: 64,
  maximumOutputFrames: 2_880_000,
  maximumOutputBytes: 23_040_000,
  maximumScratchBytes: 67_108_864,
  maximumRequestBytes: 65_536,
  maximumDiagnostics: 64,
  maximumCacheEntries: 256,
  maximumCachePcmBytes: 100_663_296,
  maximumNonlinearIterations: 8,
  maximumFallbackBisections: 16,
  maximumStateHandoffBytes: 262_144,
} as const);

export const PHYSICAL_RENDER_WORK_COUNTER_NAMES = Object.freeze([
  "eventsVisited",
  "gesturesValidated",
  "curvesVisited",
  "controlPointsVisited",
  "segmentsCreated",
  "voicesAllocated",
  "framesRendered",
  "nonlinearIterations",
  "fallbackBisections",
  "diagnosticsPublished",
  "cacheLookups",
  "cacheHits",
  "cacheEvictions",
] as const);
export type PhysicalRenderWorkCounterName =
  (typeof PHYSICAL_RENDER_WORK_COUNTER_NAMES)[number];

export type PhysicalRenderWorkCounters = Readonly<
  Record<PhysicalRenderWorkCounterName, number>
>;

export const PHYSICAL_RENDER_REFUSAL_CODES = Object.freeze([
  "physical.request_invalid",
  "physical.schema_unsupported",
  "physical.instrument_unsupported",
  "physical.sample_rate_unsupported",
  "physical.gesture_invalid",
  "physical.control_unsupported",
  "physical.control_points_unsorted",
  "physical.control_points_duplicate",
  "physical.control_value_out_of_range",
  "physical.partition_invalid",
  "physical.state_handoff_invalid",
  "physical.parameter_pack_invalid",
  "physical.parameter_pack_hash_mismatch",
  "physical.cache_identity_invalid",
  "physical.abi_bounds_invalid",
  "physical.nonlinear_solve_unbracketed",
  "physical.nonlinear_solve_nonconvergent",
  "physical.energy_bound_exceeded",
  "physical.output_nonfinite",
  "limit.physical_curves_exceeded",
  "limit.physical_control_points_exceeded",
  "limit.physical_events_exceeded",
  "limit.physical_duration_exceeded",
  "limit.physical_voices_exceeded",
  "limit.physical_frames_exceeded",
  "limit.physical_scratch_exceeded",
  "limit.physical_diagnostics_exceeded",
] as const);
export type PhysicalRenderRefusalCode =
  (typeof PHYSICAL_RENDER_REFUSAL_CODES)[number];

export const PHYSICAL_RENDER_VALIDATION_ORDER = Object.freeze([
  "request-shape",
  "schema-version",
  "instrument-version",
  "sample-rate",
  "stable-identities",
  "gesture-counts",
  "control-ownership",
  "control-point-order",
  "control-point-values",
  "partition",
  "parameter-pack",
  "abi-memory",
  "work-limits",
] as const);

export const PHYSICAL_CACHE_IDENTITY_FIELDS = Object.freeze([
  "renderMode",
  "rendererVersionId",
  "parameterPackSha256",
  "gestureFingerprint",
  "eventAndVoiceIds",
  "midiPitches",
  "sampleOffsetsAndDurations",
  "sampleRateHz",
] as const);

export const PHYSICAL_STATE_RESET_REASONS = Object.freeze([
  "transport-start",
  "transport-stop",
  "phrase-start",
  "loop-restart",
  "document-replacement",
  "renderer-dispose",
] as const);
export type PhysicalStateResetReason =
  (typeof PHYSICAL_STATE_RESET_REASONS)[number];

export type QuantizedPhysicalControlPoint = Readonly<{
  offsetTicks: number;
  valueQ16_16: number;
}>;

export type QuantizedPhysicalControlCurve = Readonly<{
  controlId: PhysicalControlId;
  interpolation: PhysicalCurveInterpolation;
  points: readonly QuantizedPhysicalControlPoint[];
}>;

export type ExpressiveVoiceGesture = Readonly<{
  eventId: string;
  voiceId: string;
  instrumentFamily: PhysicalInstrumentFamily;
  instrumentVersionId: string;
  articulation: PhysicalArticulationId;
  deterministicSeedUint32: number;
  curves: readonly QuantizedPhysicalControlCurve[];
}>;

export type ExpressiveRealizationPlan = Readonly<{
  schema: typeof EXPRESSIVE_REALIZATION_PLAN_SCHEMA;
  sourceDocumentId: string;
  sourcePlanRevision: number;
  playbackPlanFingerprint: string;
  policyVersionId: string;
  gestures: readonly ExpressiveVoiceGesture[];
}>;

export type PhysicalRenderEvent = Readonly<{
  eventId: string;
  voiceId: string;
  midiPitch: number;
  velocity: number;
  startFrame: number;
  durationFrames: number;
  gestureIndex: number;
}>;

export type PhysicalRenderSegment = Readonly<{
  segmentId: string;
  mode: PhysicalRenderMode;
  rendererVersionId: string;
  parameterPackSha256: string;
  sampleRateHz: 44_100 | 48_000 | 96_000;
  /** Absolute start on the immutable plan timeline. */
  timelineStartFrame: number;
  frameCount: number;
  cacheFingerprint: string;
  events: readonly PhysicalRenderEvent[];
  stateInputFromSegmentId: string | null;
  stateInputSha256: string | null;
  stateOutputExpected: boolean;
}>;

export type PhysicalRenderPlan = Readonly<{
  schema: typeof PHYSICAL_RENDER_PLAN_SCHEMA;
  sourceDocumentId: string;
  sourcePlanRevision: number;
  segments: readonly PhysicalRenderSegment[];
  work: PhysicalRenderWorkCounters;
}>;

export type PhysicalRenderRefusal = Readonly<{
  code: PhysicalRenderRefusalCode;
  path: string;
  message: string;
  work: PhysicalRenderWorkCounters;
}>;

export type PhysicalRenderResult<Value> =
  | Readonly<{ ok: true; value: Value }>
  | Readonly<{ ok: false; refusal: PhysicalRenderRefusal }>;

export type PhysicalRenderAbiRequestV2 = Readonly<{
  abiVersion: typeof PHYSICAL_RENDER_ABI_VERSION;
  requestByteLength: number;
  descriptorOffset: number;
  descriptorCount: number;
  controlPointOffset: number;
  controlPointCount: number;
  outputLeftOffset: number;
  outputRightOffset: number;
  outputCapacityFrames: number;
  stateInputOffset: number;
  stateInputByteLength: number;
  stateOutputOffset: number;
  stateOutputCapacityBytes: number;
}>;

export type PhysicalRenderAbiReceiptV2 = Readonly<{
  status: "completed" | "refused";
  writtenFrames: number;
  writtenStateBytes: number;
  refusalCode: PhysicalRenderRefusalCode | null;
  nonlinearIterations: number;
  fallbackBisections: number;
  limiterEngagements: number;
  diagnosticCount: number;
}>;

export const PHYSICAL_PRNG_POLICY = Object.freeze({
  algorithmId: "pcg-xsh-rr-32@1",
  stateBits: 64,
  outputBits: 32,
  multiplierHex: "5851f42d4c957f2d",
  incrementHex: "14057b7ef767814f",
  seedHash: "sha256-low-64-le",
} as const);

export const PHYSICAL_NUMERIC_POLICY = Object.freeze({
  wallTimeAffectsMusicalOutput: false,
  nonFiniteOutputPermitted: false,
  silentCoefficientRepairPermitted: false,
  legacyEarlyRmsNormalizationPermittedInV2: false,
  safetyLimiterIsMusicalNormalizer: false,
  nonlinearFailure: "named-refusal-or-proven-conservative-fallback",
} as const);
