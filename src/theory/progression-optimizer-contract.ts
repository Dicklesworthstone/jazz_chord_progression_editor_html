import type {
  AutoVoicingFamily,
  ChordEventId,
  DocumentId,
  PathRefusal,
} from "../domain";
import {
  MAX_VOICE_ASSIGNMENT_ALIGNMENT_COST,
  MAX_VOICE_ASSIGNMENT_CROWDED_LOW_INTERVALS,
  MAX_VOICE_ASSIGNMENT_DOUBLED_GUIDE_TONES,
  MAX_VOICE_ASSIGNMENT_MAXIMUM_ABSOLUTE_LEAP,
  MAX_VOICE_ASSIGNMENT_OMITTED_COLORS,
  MAX_VOICE_ASSIGNMENT_TOTAL_ABSOLUTE_MOTION,
  MAX_VOICE_ASSIGNMENT_TOTAL_SPAN,
  MAX_VOICE_ASSIGNMENT_VOICE_FACT_COUNT,
  type AssignVoiceTransition,
  type UnassignedVoiceFrame,
  type VoiceAssignmentLocks,
  type VoiceAssignmentOperations,
  type VoiceId,
} from "./voice-assignment-contract";
import {
  MAX_VOICING_RETAINED_CANDIDATES,
  type VoicingCandidateId,
} from "./voicing-candidates-contract";
import { MAX_CHART_EVENTS } from "./syntax-contract";

/**
 * V2 bounded progression voicing optimizer: stable public identities.
 *
 * The optimizer consumes V0 retained candidates (as V1 unassigned frames) and
 * V1 pairwise transition facts through an injected `VoiceAssignmentOperations`
 * oracle. It never re-derives motion facts, never mutates a document, and
 * never lets wall-clock time affect selection.
 */
export const PROGRESSION_OPTIMIZER_CONTRACT_SCHEMA =
  "changes.theory.progression-optimizer-contract.v1";
export const PROGRESSION_OPTIMIZER_REQUEST_SCHEMA =
  "changes.theory.progression-optimizer-request.v1";
export const PROGRESSION_EVENT_SCHEMA = "changes.theory.progression-event.v1";
export const PROGRESSION_OPTIMIZER_STATE_SCHEMA =
  "changes.theory.progression-optimizer-state.v1";
export const PROGRESSION_OPTIMIZER_RESULT_SCHEMA =
  "changes.theory.progression-optimizer-result.v1";
export const PROGRESSION_REALIZATION_SCHEMA =
  "changes.theory.progression-realization.v1";
export const PROGRESSION_DEGRADATION_SCHEMA =
  "changes.theory.progression-degradation.v1";
export const PROGRESSION_CONFLICT_SCHEMA =
  "changes.theory.progression-conflict.v1";

export const PROGRESSION_OPTIMIZER_ENGINE_ID = "changes.progression-optimizer";
export const PROGRESSION_OPTIMIZER_ENGINE_VERSION = 1;
export const PROGRESSION_OPTIMIZER_ENGINE_VERSION_TAG =
  "changes.progression-optimizer.v1";
export const PROGRESSION_COST_POLICY_ID =
  "changes.progression-optimizer.aggregate-cost";
export const PROGRESSION_COST_POLICY_VERSION = 1;
/** Additive policy; callers explicitly opt in, legacy requests retain v1. */
export const PROGRESSION_CONTINUITY_COST_POLICY_VERSION = 2;
export const PROGRESSION_SEARCH_POLICY_ID =
  "changes.progression-optimizer.bounded-beam";
export const PROGRESSION_SEARCH_POLICY_VERSION = 1;
export const PROGRESSION_TIE_BREAK_POLICY_ID =
  "changes.progression-optimizer.tie-break";
export const PROGRESSION_TIE_BREAK_POLICY_VERSION = 1;

/**
 * Ingest and search bounds. The candidate cap restates the frozen V0 retained
 * cap; the request cap restates the chart event cap; every other bound is a
 * mechanical product of those two and the frozen beam width.
 */
export const MAX_PROGRESSION_CANDIDATES_PER_EVENT =
  MAX_VOICING_RETAINED_CANDIDATES;
export const PROGRESSION_BEAM_WIDTH = 48;
export const MAX_PROGRESSION_WINDOW_EVENTS = 512;
export const MAX_PROGRESSION_REQUEST_EVENTS = MAX_CHART_EVENTS;
export const MAX_PROGRESSION_WINDOWS_PER_SEGMENT =
  MAX_PROGRESSION_REQUEST_EVENTS / MAX_PROGRESSION_WINDOW_EVENTS;
export const MAX_PROGRESSION_SEGMENTS = MAX_PROGRESSION_REQUEST_EVENTS;
export const MAX_PROGRESSION_LOCKS_PER_EVENT = 7;
export const MAX_PROGRESSION_REQUEST_ID_ASCII_LENGTH = 128;
export const PROGRESSION_REQUEST_ID_PATTERN_SOURCE = "^[A-Za-z0-9._-]{1,128}$";

/**
 * One work unit is one seeded state, one (state, target-candidate) expansion
 * attempt, or one loop-closure attempt. One quantum is the fixed number of
 * units one `advance` call may consume; a full worst-case layer
 * (beam 48 x 24 target candidates) fits in exactly one quantum.
 */
export const PROGRESSION_WORK_QUANTUM_UNITS =
  PROGRESSION_BEAM_WIDTH * MAX_PROGRESSION_CANDIDATES_PER_EVENT;
export const MAX_PROGRESSION_WORK_QUANTA = 8_192;
export const MAX_PROGRESSION_TOTAL_WORK_UNITS =
  MAX_PROGRESSION_WORK_QUANTA * PROGRESSION_WORK_QUANTUM_UNITS;
export const MAX_PROGRESSION_LAYER_GENERATED_STATES =
  PROGRESSION_WORK_QUANTUM_UNITS;
export const MAX_PROGRESSION_RETAINED_STATES =
  PROGRESSION_BEAM_WIDTH * MAX_PROGRESSION_WINDOW_EVENTS;
export const MAX_PROGRESSION_TRACKED_STATES =
  MAX_PROGRESSION_RETAINED_STATES + MAX_PROGRESSION_LAYER_GENERATED_STATES;
export const MAX_PROGRESSION_ORACLE_CALLS_PER_LAYER =
  MAX_PROGRESSION_CANDIDATES_PER_EVENT * MAX_PROGRESSION_CANDIDATES_PER_EVENT;
export const MAX_PROGRESSION_ORACLE_TRANSITION_CALLS =
  MAX_PROGRESSION_WORK_QUANTA * MAX_PROGRESSION_ORACLE_CALLS_PER_LAYER;
export const MAX_PROGRESSION_ALTERNATIVES = PROGRESSION_BEAM_WIDTH;
export const MAX_PROGRESSION_REALIZATION_RECORDS =
  MAX_PROGRESSION_ALTERNATIVES * MAX_PROGRESSION_REQUEST_EVENTS;

/**
 * The frozen seven-axis aggregate cost vector. Axis names are exactly the V1
 * reported cost axes; the selection order below is the plan's Section 12.5
 * axis order. Sum axes add per-transition values; max axes retain the largest
 * per-transition value. A chain with zero transitions has the zero vector.
 */
export const PROGRESSION_COST_AXES = Object.freeze([
  "totalAbsoluteMotion",
  "maximumAbsoluteLeap",
  "commonTonesLost",
  "crowdedLowIntervals",
  "doubledGuideTones",
  "omittedColors",
  "totalSpan",
] as const);
export type ProgressionCostAxis = (typeof PROGRESSION_COST_AXES)[number];

export const PROGRESSION_COST_AGGREGATIONS = Object.freeze({
  totalAbsoluteMotion: "sum",
  maximumAbsoluteLeap: "max",
  commonTonesLost: "sum",
  crowdedLowIntervals: "sum",
  doubledGuideTones: "sum",
  omittedColors: "sum",
  totalSpan: "max",
} as const satisfies Readonly<Record<ProgressionCostAxis, "sum" | "max">>);

export const PROGRESSION_CONTINUITY_COST_AXES = Object.freeze([
  "alignmentCost",
  "gapCount",
  "totalSpan",
  "maximumAbsoluteLeap",
  "totalAbsoluteMotion",
  "commonTonesLost",
  "crowdedLowIntervals",
  "doubledGuideTones",
  "omittedColors",
] as const);
export type ProgressionContinuityCostAxis =
  (typeof PROGRESSION_CONTINUITY_COST_AXES)[number];
export const PROGRESSION_CONTINUITY_COST_AGGREGATIONS = Object.freeze({
  ...PROGRESSION_COST_AGGREGATIONS,
  alignmentCost: "sum",
  gapCount: "sum",
} as const satisfies Readonly<Record<ProgressionContinuityCostAxis, "sum" | "max">>);
export type ProgressionContinuityCost =
  Readonly<Record<ProgressionContinuityCostAxis, number>>;
export type ProgressionCost =
  | Readonly<Record<ProgressionCostAxis, number>>
  | ProgressionContinuityCost;

/**
 * Aggregate axis value caps: sum axes multiply the V1 per-transition cap by
 * the maximum transition count (8_191 chain transitions plus one loop
 * closure); max axes inherit the V1 per-transition cap unchanged.
 */
export const MAX_PROGRESSION_CHAIN_TRANSITIONS =
  MAX_PROGRESSION_REQUEST_EVENTS - 1;
export const MAX_PROGRESSION_COST_TRANSITIONS =
  MAX_PROGRESSION_CHAIN_TRANSITIONS + 1;
export const PROGRESSION_COST_VALUE_LIMITS = Object.freeze({
  totalAbsoluteMotion:
    MAX_PROGRESSION_COST_TRANSITIONS * MAX_VOICE_ASSIGNMENT_TOTAL_ABSOLUTE_MOTION,
  maximumAbsoluteLeap: MAX_VOICE_ASSIGNMENT_MAXIMUM_ABSOLUTE_LEAP,
  commonTonesLost:
    MAX_PROGRESSION_COST_TRANSITIONS * MAX_VOICE_ASSIGNMENT_VOICE_FACT_COUNT,
  crowdedLowIntervals:
    MAX_PROGRESSION_COST_TRANSITIONS *
    MAX_VOICE_ASSIGNMENT_CROWDED_LOW_INTERVALS,
  doubledGuideTones:
    MAX_PROGRESSION_COST_TRANSITIONS * MAX_VOICE_ASSIGNMENT_DOUBLED_GUIDE_TONES,
  omittedColors:
    MAX_PROGRESSION_COST_TRANSITIONS * MAX_VOICE_ASSIGNMENT_OMITTED_COLORS,
  totalSpan: MAX_VOICE_ASSIGNMENT_TOTAL_SPAN,
} as const satisfies Readonly<Record<ProgressionCostAxis, number>>);

export const PROGRESSION_CONTINUITY_COST_VALUE_LIMITS = Object.freeze({
  ...PROGRESSION_COST_VALUE_LIMITS,
  alignmentCost:
    MAX_PROGRESSION_COST_TRANSITIONS * MAX_VOICE_ASSIGNMENT_ALIGNMENT_COST,
  gapCount:
    MAX_PROGRESSION_COST_TRANSITIONS * 2 * MAX_VOICE_ASSIGNMENT_VOICE_FACT_COUNT,
} as const satisfies Readonly<Record<ProgressionContinuityCostAxis, number>>);

/**
 * Deterministic total order over chains sharing a span: first the aggregate
 * axes compared lexicographically in `PROGRESSION_COST_AXES` order, then the
 * candidate-id sequence compared lexicographically (earlier events first,
 * `candidate-000` before `candidate-001`). The second key is unique per
 * chain, so the order is total and byte-stable.
 */
export const PROGRESSION_TIE_BREAK_ORDER = Object.freeze([
  "aggregate-cost-axis-order",
  "candidate-id-sequence-lexicographic",
] as const);
export type ProgressionTieBreakStage =
  (typeof PROGRESSION_TIE_BREAK_ORDER)[number];

export const PROGRESSION_CHAIN_BOUNDARIES = Object.freeze([
  "continue",
  "reset",
] as const);
export type ProgressionChainBoundary =
  (typeof PROGRESSION_CHAIN_BOUNDARIES)[number];

export const FIXED_PROGRESSION_EVENT_REASONS = Object.freeze([
  "manual",
  "frozen",
] as const);
export type FixedProgressionEventReason =
  (typeof FIXED_PROGRESSION_EVENT_REASONS)[number];

export const PROGRESSION_CONSTRAINT_KINDS = Object.freeze([
  "families",
  "range",
  "bassRange",
  "lock",
  "loop-closure",
  "transition-no-assignment",
] as const);
export type ProgressionConstraintKind =
  (typeof PROGRESSION_CONSTRAINT_KINDS)[number];

/**
 * Candidate filter precedence inside one event: families, then range, then
 * bassRange. A candidate failing several filters is charged to the first
 * failing kind only. Locks are never a filter here; they travel verbatim to
 * the V1 oracle with every transition into the event.
 */
export const PROGRESSION_CONSTRAINT_FILTER_ORDER = Object.freeze([
  "families",
  "range",
  "bassRange",
] as const);

export const PROGRESSION_TERMINATIONS = Object.freeze([
  "complete",
  "exhausted",
  "cancelled",
  "work-quanta-cap",
] as const);
export type ProgressionTermination = (typeof PROGRESSION_TERMINATIONS)[number];

export const PROGRESSION_CANCEL_REASONS = Object.freeze([
  "user-cancel",
  "stale-revision",
] as const);
export type ProgressionCancelReason =
  (typeof PROGRESSION_CANCEL_REASONS)[number];

export const PROGRESSION_DEGRADATION_CODE = "voicing.optimization_degraded";
export const PROGRESSION_DEGRADATION_REASONS = Object.freeze([
  "window-partition",
  "beam-eviction",
  "fixed-candidate-constraint-conflict",
  "loop-closure-skipped",
] as const);
export type ProgressionDegradationReason =
  (typeof PROGRESSION_DEGRADATION_REASONS)[number];

export const PROGRESSION_REFUSAL_CODES = Object.freeze([
  "progression.schema_invalid",
  "progression.policy_invalid",
  "progression.identity_invalid",
  "progression.request_id_invalid",
  "progression.quantum_budget_invalid",
  "progression.event_count_exceeded",
  "progression.event_invalid",
  "progression.candidate_invalid",
  "progression.constraint_invalid",
  "progression.resume_stale",
  "progression.resume_invalid",
  "limit.progression_work_exceeded",
] as const);
export type ProgressionRefusalCode =
  (typeof PROGRESSION_REFUSAL_CODES)[number];

/**
 * Refusal precedence: request validation walks this list in order and
 * reports the first failing check; inside per-event checks, earlier events
 * win, and inside one event the structural, candidate, then constraint
 * checks run in that order.
 */
export const PROGRESSION_VALIDATION_PRECEDENCE = Object.freeze({
  order: Object.freeze([
    "progression.schema_invalid",
    "progression.policy_invalid",
    "progression.identity_invalid",
    "progression.request_id_invalid",
    "progression.quantum_budget_invalid",
    "progression.event_count_exceeded",
    "progression.event_invalid",
    "progression.candidate_invalid",
    "progression.constraint_invalid",
  ] as const),
  perEventOrder: Object.freeze([
    "progression.event_invalid",
    "progression.candidate_invalid",
    "progression.constraint_invalid",
  ] as const),
  eventOrderWins: true,
} as const);

export const PROGRESSION_WORK_COUNTER_NAMES = Object.freeze([
  "workQuanta",
  "workUnits",
  "seededStates",
  "statePairExpansions",
  "oracleTransitionCalls",
  "oracleRefusedTransitions",
  "generatedStates",
  "dominancePrunes",
  "beamEvictions",
  "constraintFilteredCandidates",
  "loopClosureUnits",
  "loopClosureRefusals",
  "windowsOptimized",
  "segmentsOptimized",
] as const);
export type ProgressionWorkCounterName =
  (typeof PROGRESSION_WORK_COUNTER_NAMES)[number];
export type ProgressionWorkCounters = Readonly<
  Record<ProgressionWorkCounterName, number>
>;

export const PROGRESSION_MEMORY_COUNTER_NAMES = Object.freeze([
  "peakFrontierStates",
  "peakLayerGeneratedStates",
  "peakTrackedStates",
  "peakRealizationRecords",
] as const);
export type ProgressionMemoryCounterName =
  (typeof PROGRESSION_MEMORY_COUNTER_NAMES)[number];
export type ProgressionMemoryCounters = Readonly<
  Record<ProgressionMemoryCounterName, number>
>;

/** Absolute counter ceilings; exceeding any is `limit.progression_work_exceeded`. */
export const PROGRESSION_WORK_LIMITS = Object.freeze({
  workQuanta: MAX_PROGRESSION_WORK_QUANTA,
  workUnits: MAX_PROGRESSION_TOTAL_WORK_UNITS,
  seededStates:
    MAX_PROGRESSION_CANDIDATES_PER_EVENT * MAX_PROGRESSION_SEGMENTS,
  statePairExpansions: MAX_PROGRESSION_TOTAL_WORK_UNITS,
  oracleTransitionCalls: MAX_PROGRESSION_ORACLE_TRANSITION_CALLS,
  oracleRefusedTransitions: MAX_PROGRESSION_ORACLE_TRANSITION_CALLS,
  generatedStates: MAX_PROGRESSION_TOTAL_WORK_UNITS,
  dominancePrunes: MAX_PROGRESSION_TOTAL_WORK_UNITS,
  beamEvictions: MAX_PROGRESSION_TOTAL_WORK_UNITS,
  constraintFilteredCandidates:
    MAX_PROGRESSION_CANDIDATES_PER_EVENT * MAX_PROGRESSION_REQUEST_EVENTS,
  loopClosureUnits: PROGRESSION_BEAM_WIDTH,
  loopClosureRefusals: PROGRESSION_BEAM_WIDTH,
  windowsOptimized: MAX_PROGRESSION_REQUEST_EVENTS,
  segmentsOptimized: MAX_PROGRESSION_SEGMENTS,
} as const satisfies ProgressionWorkCounters);

export const PROGRESSION_MEMORY_LIMITS = Object.freeze({
  peakFrontierStates: PROGRESSION_BEAM_WIDTH,
  peakLayerGeneratedStates: MAX_PROGRESSION_LAYER_GENERATED_STATES,
  peakTrackedStates: MAX_PROGRESSION_TRACKED_STATES,
  peakRealizationRecords: MAX_PROGRESSION_REALIZATION_RECORDS,
} as const satisfies ProgressionMemoryCounters);

/**
 * The frozen work-unit accounting identity every result must satisfy:
 * `workUnits === seededStates + statePairExpansions + loopClosureUnits`.
 */
export const PROGRESSION_WORK_UNIT_IDENTITY =
  "workUnits = seededStates + statePairExpansions + loopClosureUnits";

export type ProgressionRequestId = string;

export type ProgressionMidiRange = Readonly<{
  lowMidi: number;
  highMidi: number;
}>;

/**
 * Per-event constraints. `families` is either null (unconstrained) or a
 * non-empty duplicate-free subset in `AUTO_VOICING_FAMILIES` order; ranges
 * are inclusive MIDI bounds with `lowMidi <= highMidi`; locks are forwarded
 * verbatim to every V1 transition targeting the event.
 */
export type ProgressionEventConstraints = Readonly<{
  families: readonly AutoVoicingFamily[] | null;
  range: ProgressionMidiRange | null;
  bassRange: ProgressionMidiRange | null;
  locks: VoiceAssignmentLocks;
}>;

/**
 * Auto events carry the retained V0 candidate set as V1 unassigned frames,
 * ordered by `roles.candidateId` ascending, duplicate-free, one to
 * twenty-four entries, every frame naming this event's id.
 */
export type AutoProgressionEvent = Readonly<{
  schema: typeof PROGRESSION_EVENT_SCHEMA;
  kind: "auto";
  eventId: ChordEventId;
  chainBoundary: ProgressionChainBoundary;
  candidates: readonly UnassignedVoiceFrame[];
  constraints: ProgressionEventConstraints;
}>;

/**
 * Manual and Frozen events contribute exactly one immutable candidate. The
 * optimizer never rewrites its pitches; a constraint the fixed candidate
 * violates is preserved and reported as a degradation, never repaired.
 */
export type FixedProgressionEvent = Readonly<{
  schema: typeof PROGRESSION_EVENT_SCHEMA;
  kind: "fixed";
  reason: FixedProgressionEventReason;
  eventId: ChordEventId;
  chainBoundary: ProgressionChainBoundary;
  candidate: UnassignedVoiceFrame;
  constraints: ProgressionEventConstraints;
}>;

export type ProgressionEvent = AutoProgressionEvent | FixedProgressionEvent;

export type ProgressionOptimizationIdentity = Readonly<{
  requestId: ProgressionRequestId;
  documentId: DocumentId;
  sourceRevision: number;
  engineId: typeof PROGRESSION_OPTIMIZER_ENGINE_ID;
  engineVersion: typeof PROGRESSION_OPTIMIZER_ENGINE_VERSION;
  costPolicyId: typeof PROGRESSION_COST_POLICY_ID;
  costPolicyVersion:
    | typeof PROGRESSION_COST_POLICY_VERSION
    | typeof PROGRESSION_CONTINUITY_COST_POLICY_VERSION;
  searchPolicyId: typeof PROGRESSION_SEARCH_POLICY_ID;
  searchPolicyVersion: typeof PROGRESSION_SEARCH_POLICY_VERSION;
  tieBreakPolicyId: typeof PROGRESSION_TIE_BREAK_POLICY_ID;
  tieBreakPolicyVersion: typeof PROGRESSION_TIE_BREAK_POLICY_VERSION;
}>;

export type ProgressionOptimizationRequest = Readonly<{
  schema: typeof PROGRESSION_OPTIMIZER_REQUEST_SCHEMA;
  identity: ProgressionOptimizationIdentity;
  loopClosure: boolean;
  maxWorkQuanta: number;
  events: readonly ProgressionEvent[];
}>;

export type ProgressionConstraintRef = Readonly<{
  eventId: ChordEventId;
  kind: ProgressionConstraintKind;
  voiceId: VoiceId | null;
}>;

export type ProgressionRealization = Readonly<{
  schema: typeof PROGRESSION_REALIZATION_SCHEMA;
  realizationOrdinal: number;
  eventIds: readonly ChordEventId[];
  candidateIds: readonly VoicingCandidateId[];
  cost: ProgressionCost;
  loopClosureApplied: boolean;
}>;

export type ProgressionSegmentOutcome = Readonly<{
  segmentOrdinal: number;
  windowOrdinal: number;
  firstEventOrdinal: number;
  lastEventOrdinal: number;
  boundaryCondition: "open" | "fixed-start";
  realizations: readonly ProgressionRealization[];
}>;

export type ProgressionDegradation = Readonly<{
  schema: typeof PROGRESSION_DEGRADATION_SCHEMA;
  code: typeof PROGRESSION_DEGRADATION_CODE;
  reason: ProgressionDegradationReason;
  segmentOrdinal: number | null;
  windowOrdinal: number | null;
  eventIds: readonly ChordEventId[];
  constraintRefs: readonly ProgressionConstraintRef[];
}>;

export type ProgressionConflict = Readonly<{
  schema: typeof PROGRESSION_CONFLICT_SCHEMA;
  segmentOrdinal: number;
  windowOrdinal: number;
  eventId: ChordEventId;
  constraintRefs: readonly ProgressionConstraintRef[];
  minimality: "bounded-small";
  explicitRelaxations: readonly string[];
}>;

export type ProgressionSearchStats = Readonly<{
  counters: ProgressionWorkCounters;
  memory: ProgressionMemoryCounters;
}>;

/**
 * Frozen truth assertions carried by every terminal outcome. Their literal
 * `false`/`true` types make silent relaxation a type error.
 */
export type ProgressionExplanation = Readonly<{
  wallTimeAffectedSelection: false;
  documentMutated: false;
  hardConstraintsRelaxed: false;
  manualFrozenPitchesRewritten: false;
  deterministicForIdenticalInputs: true;
}>;

export type OptimizedProgressionOutcome = Readonly<{
  schema: typeof PROGRESSION_OPTIMIZER_RESULT_SCHEMA;
  kind: "optimized";
  identity: ProgressionOptimizationIdentity;
  termination: "complete" | "exhausted";
  segments: readonly ProgressionSegmentOutcome[];
  aggregateSelectedCost: ProgressionCost;
  degradations: readonly ProgressionDegradation[];
  conflicts: readonly ProgressionConflict[];
  stats: ProgressionSearchStats;
  explanation: ProgressionExplanation;
}>;

export type NoRealizationProgressionOutcome = Readonly<{
  schema: typeof PROGRESSION_OPTIMIZER_RESULT_SCHEMA;
  kind: "no-realization";
  identity: ProgressionOptimizationIdentity;
  termination: "complete" | "exhausted";
  conflicts: readonly ProgressionConflict[];
  degradations: readonly ProgressionDegradation[];
  stats: ProgressionSearchStats;
  explanation: ProgressionExplanation;
}>;

/** Work-quanta exhaustion returns no partial option set, only diagnostics. */
export type UnfinishedProgressionOutcome = Readonly<{
  schema: typeof PROGRESSION_OPTIMIZER_RESULT_SCHEMA;
  kind: "unfinished";
  identity: ProgressionOptimizationIdentity;
  termination: "work-quanta-cap";
  stats: ProgressionSearchStats;
  explanation: ProgressionExplanation;
}>;

/** Cancellation returns no partial option set, only diagnostics. */
export type CancelledProgressionOutcome = Readonly<{
  schema: typeof PROGRESSION_OPTIMIZER_RESULT_SCHEMA;
  kind: "cancelled";
  identity: ProgressionOptimizationIdentity;
  termination: "cancelled";
  cancelReason: ProgressionCancelReason;
  stats: ProgressionSearchStats;
  explanation: ProgressionExplanation;
}>;

export type ProgressionOptimizationOutcome =
  | OptimizedProgressionOutcome
  | NoRealizationProgressionOutcome
  | UnfinishedProgressionOutcome
  | CancelledProgressionOutcome;

export const PROGRESSION_STEPPER_STATUSES = Object.freeze([
  "running",
  "terminal",
] as const);
export type ProgressionStepperStatus =
  (typeof PROGRESSION_STEPPER_STATUSES)[number];

/**
 * Engine-owned resumable continuation. The payload shape is not contract
 * surface; the observable laws are: identical requests and oracles produce
 * byte-identical terminal outcomes and counters under every quantum
 * schedule, and the version tag must match the module constants on resume.
 */
export type ProgressionResumeToken = Readonly<{
  schema: typeof PROGRESSION_OPTIMIZER_STATE_SCHEMA;
  engineVersionTag: typeof PROGRESSION_OPTIMIZER_ENGINE_VERSION_TAG;
  payload: unknown;
}>;

export type ProgressionSearchState = Readonly<{
  schema: typeof PROGRESSION_OPTIMIZER_STATE_SCHEMA;
  status: ProgressionStepperStatus;
  identity: ProgressionOptimizationIdentity;
  quantaConsumed: number;
  stats: ProgressionSearchStats;
  outcome: ProgressionOptimizationOutcome | null;
  continuation: ProgressionResumeToken | null;
}>;

export type ProgressionInputRefusal = PathRefusal<{
  code: Exclude<
    ProgressionRefusalCode,
    | "progression.resume_stale"
    | "progression.resume_invalid"
    | "limit.progression_work_exceeded"
  >;
  partialResult: false;
}>;

export type ProgressionResumeRefusal = PathRefusal<{
  code: "progression.resume_stale" | "progression.resume_invalid";
  partialResult: false;
}>;

export type ProgressionWorkLimitRefusal = PathRefusal<{
  code: "limit.progression_work_exceeded";
  counter: ProgressionWorkCounterName | ProgressionMemoryCounterName;
  observed: number;
  limit: number;
  partialResult: false;
}>;

export type ProgressionRefusal =
  | ProgressionInputRefusal
  | ProgressionResumeRefusal
  | ProgressionWorkLimitRefusal;

export type InitializeProgressionOptimizationResult =
  | Readonly<{ ok: true; value: ProgressionSearchState }>
  | Readonly<{ ok: false; refusal: ProgressionInputRefusal }>;

export type AdvanceProgressionOptimizationResult =
  | Readonly<{ ok: true; value: ProgressionSearchState }>
  | Readonly<{ ok: false; refusal: ProgressionResumeRefusal }>
  | Readonly<{ ok: false; refusal: ProgressionWorkLimitRefusal }>;

export type CancelProgressionOptimizationResult =
  | Readonly<{ ok: true; value: ProgressionSearchState }>
  | Readonly<{ ok: false; refusal: ProgressionResumeRefusal }>;

/**
 * Initialization validates the request and consumes zero quanta; every
 * `advance` consumes exactly one quantum (its final quantum may finish
 * early); `cancel` is legal only while `status` is `"running"`.
 */
export interface InitializeProgressionOptimization {
  (
    request: ProgressionOptimizationRequest,
    operations: VoiceAssignmentOperations,
  ): InitializeProgressionOptimizationResult;
}

export interface AdvanceProgressionOptimization {
  (
    state: ProgressionSearchState,
    operations: VoiceAssignmentOperations,
  ): AdvanceProgressionOptimizationResult;
}

export interface CancelProgressionOptimization {
  (
    state: ProgressionSearchState,
    reason: ProgressionCancelReason,
  ): CancelProgressionOptimizationResult;
}

export const PROGRESSION_OPTIMIZER_OPERATION_NAMES = Object.freeze([
  "initializeProgressionOptimization",
  "advanceProgressionOptimization",
  "cancelProgressionOptimization",
] as const);
export type ProgressionOptimizerOperationName =
  (typeof PROGRESSION_OPTIMIZER_OPERATION_NAMES)[number];

export interface ProgressionOptimizerOperations {
  readonly initializeProgressionOptimization: InitializeProgressionOptimization;
  readonly advanceProgressionOptimization: AdvanceProgressionOptimization;
  readonly cancelProgressionOptimization: CancelProgressionOptimization;
}

/**
 * The oracle contract: V2 consumes exactly the V1 transition operation and
 * memoizes it per (window, layer, from-candidate, to-candidate); V2 never
 * re-derives or edits any V1 motion or cost fact.
 */
export type ProgressionTransitionOracle = Readonly<{
  assignVoiceTransition: AssignVoiceTransition;
}>;
