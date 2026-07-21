import type {
  ChordDegree,
  ChordEventId,
  MidiPitch,
  PathRefusal,
  SpelledPitch,
} from "../domain";
import {
  MAX_THEORY_DEGREES_PER_REALIZATION,
  type SemanticRealizationId,
} from "./resolution-contract";
import {
  MAX_VOICING_EVIDENCE_ID_CODE_POINTS,
  MAX_VOICING_EVIDENCE_ID_UTF8_BYTES,
  VOICING_LOW_REGISTER_POLICY_ID,
  VOICING_LOW_REGISTER_POLICY_VERSION,
  VOICING_LOW_REGISTER_SPACING_BANDS,
  type VoicingCandidateId,
  type VoicingCandidateVoice,
} from "./voicing-candidates-contract";

/** Stable public identities for deterministic request-local voice assignment. */
export const VOICE_ASSIGNMENT_CONTRACT_SCHEMA =
  "changes.theory.voice-assignment-contract.v1";
export const VOICE_ASSIGNMENT_REQUEST_SCHEMA =
  "changes.theory.voice-assignment-request.v1";
export const VOICE_ASSIGNMENT_FRAME_SCHEMA =
  "changes.theory.voice-assignment-frame.v1";
export const VOICE_ASSIGNMENT_RESULT_SCHEMA =
  "changes.theory.voice-assignment-result.v1";
export const VOICE_ASSIGNMENT_ARC_SCHEMA =
  "changes.theory.voice-arc.v1";
export const VOICE_ASSIGNMENT_LOCK_SCHEMA =
  "changes.theory.voice-lock.v1";

export const VOICE_ASSIGNMENT_ENGINE_ID = "changes.voice-assignment";
export const VOICE_ASSIGNMENT_ENGINE_VERSION = 1;
export const VOICE_ASSIGNMENT_ENGINE_VERSION_TAG =
  "changes.voice-assignment.v1";
export const VOICE_ASSIGNMENT_POLICY_ID =
  "changes.voice-assignment.order-preserving-smooth";
export const VOICE_ASSIGNMENT_POLICY_VERSION = 1;
export const VOICE_IDENTITY_POLICY_ID = "changes.voice-identity";
export const VOICE_IDENTITY_POLICY_VERSION = 1;
export const VOICE_ASSIGNMENT_TIE_BREAK_POLICY_ID =
  "changes.voice-assignment.tie-break";
export const VOICE_ASSIGNMENT_TIE_BREAK_POLICY_VERSION = 1;
export const VOICE_ASSIGNMENT_ROLE_POLICY_ID =
  "changes.voice-assignment.v0-template-roles";
export const VOICE_ASSIGNMENT_ROLE_POLICY_VERSION = 1;

export const MIN_VOICE_ASSIGNMENT_VOICES = 3;
export const MAX_VOICE_ASSIGNMENT_VOICES = 7;
export const MAX_VOICE_ASSIGNMENT_LOCKS = 7;
export const MAX_VOICE_ASSIGNMENT_REQUEST_ID_ASCII_LENGTH = 128;
export const VOICE_ASSIGNMENT_REQUEST_ID_PATTERN_SOURCE =
  "^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$";
export const MAX_VOICE_ASSIGNMENT_VOICE_SERIAL = 4_095;
export const MAX_VOICE_ASSIGNMENT_NEXT_VOICE_SERIAL = 4_096;
export const VOICE_ASSIGNMENT_VOICE_ID_DIGITS = 4;
export const VOICE_ASSIGNMENT_VOICE_ID_PATTERN_SOURCE = "^voice-[0-9]{4}$";
export const VOICE_ASSIGNMENT_GAP_COST = 12;
export const MAX_VOICE_ASSIGNMENT_ROLE_DEGREES =
  MAX_THEORY_DEGREES_PER_REALIZATION;
export const MIN_VOICE_ASSIGNMENT_ROLE_SOURCE_VERSION = 1;
export const MAX_VOICE_ASSIGNMENT_ROLE_SOURCE_VERSION = 65_535;
export const MAX_VOICE_ASSIGNMENT_ROLE_SOURCE_ID_CODE_POINTS =
  MAX_VOICING_EVIDENCE_ID_CODE_POINTS;
export const MAX_VOICE_ASSIGNMENT_ROLE_SOURCE_ID_UTF8_BYTES =
  MAX_VOICING_EVIDENCE_ID_UTF8_BYTES;

/** V1 reuses V0's exact low-register bands instead of copying their values. */
export const VOICE_ASSIGNMENT_LOW_REGISTER_POLICY_ID =
  VOICING_LOW_REGISTER_POLICY_ID;
export const VOICE_ASSIGNMENT_LOW_REGISTER_POLICY_VERSION =
  VOICING_LOW_REGISTER_POLICY_VERSION;
export const VOICE_ASSIGNMENT_LOW_REGISTER_SPACING_BANDS =
  VOICING_LOW_REGISTER_SPACING_BANDS;

/**
 * A 7-by-7 alignment has an 8-by-8 matrix. Its legal predecessor edges are
 * 49 matches, 56 leaves, and 56 enters. These are semantic caps, not timing
 * budgets, and are reported on every result.
 */
export const MAX_VOICE_ASSIGNMENT_MATRIX_CELLS = 64;
export const MAX_VOICE_ASSIGNMENT_TRANSITION_CANDIDATES = 161;
export const MAX_VOICE_ASSIGNMENT_SCORE_COMPARISONS = 98;
export const MAX_VOICE_ASSIGNMENT_BACKTRACE_STEPS = 14;
export const MAX_VOICE_ASSIGNMENT_ARCS = 14;
export const MAX_VOICE_ASSIGNMENT_RELATIONS = 21;
export const MAX_VOICE_ASSIGNMENT_IDENTITY_COMPARISONS = 49;
export const MAX_VOICE_ASSIGNMENT_LOCK_CHECKS = 7;
export const MAX_VOICE_ASSIGNMENT_ROLE_DEGREE_RECORDS = 64;
export const MAX_VOICE_ASSIGNMENT_ROLE_MEMBERSHIP_COMPARISONS = 448;
export const MAX_VOICE_ASSIGNMENT_ROLE_ORDER_COMPARISONS = 60;

export const MAX_VOICE_ASSIGNMENT_SIGNED_SEMITONES = 127;
export const MAX_VOICE_ASSIGNMENT_ABSOLUTE_SEMITONES = 127;
export const MAX_VOICE_ASSIGNMENT_ALIGNMENT_COST = 889;
export const MAX_VOICE_ASSIGNMENT_TOTAL_ABSOLUTE_MOTION = 889;
export const MAX_VOICE_ASSIGNMENT_MAXIMUM_ABSOLUTE_LEAP = 127;
export const MAX_VOICE_ASSIGNMENT_VOICE_FACT_COUNT = 7;
export const MAX_VOICE_ASSIGNMENT_CROWDED_LOW_INTERVALS = 6;
export const MAX_VOICE_ASSIGNMENT_DOUBLED_GUIDE_TONES = 6;
export const MAX_VOICE_ASSIGNMENT_OMITTED_COLORS =
  MAX_THEORY_DEGREES_PER_REALIZATION;
export const MAX_VOICE_ASSIGNMENT_TOTAL_SPAN = 127;
export const MIN_VOICE_ASSIGNMENT_ORDER_KEY_NEGATIVE_COUNT = -7;
export const MAX_VOICE_ASSIGNMENT_ORDER_KEY_NEGATIVE_COUNT = 0;
export const MIN_VOICE_ASSIGNMENT_OPERATION_PATH_STEPS = 3;
export const MAX_VOICE_ASSIGNMENT_SOURCE_OR_TARGET_ORDINAL = 6;
export const MAX_VOICE_ASSIGNMENT_ARC_ORDINAL = 13;
export const MAX_VOICE_ASSIGNMENT_LOCK_ORDINAL = 6;

export const VOICE_ASSIGNMENT_VALUE_LIMITS = Object.freeze({
  signedSemitones: Object.freeze({ minimum: -127, maximum: 127 }),
  absoluteSemitones: Object.freeze({ minimum: 0, maximum: 127 }),
  alignmentCost: Object.freeze({ minimum: 0, maximum: 889 }),
  gapCount: Object.freeze({ minimum: 0, maximum: 14 }),
  enteringVoices: Object.freeze({ minimum: 0, maximum: 7 }),
  leavingVoices: Object.freeze({ minimum: 0, maximum: 7 }),
  totalAbsoluteMotion: Object.freeze({ minimum: 0, maximum: 889 }),
  maximumAbsoluteLeap: Object.freeze({ minimum: 0, maximum: 127 }),
  voiceFactCount: Object.freeze({ minimum: 0, maximum: 7 }),
  crowdedLowIntervals: Object.freeze({ minimum: 0, maximum: 6 }),
  doubledGuideTones: Object.freeze({ minimum: 0, maximum: 6 }),
  omittedColors: Object.freeze({ minimum: 0, maximum: 16 }),
  totalSpan: Object.freeze({ minimum: 0, maximum: 127 }),
  orderKeyNegativeCount: Object.freeze({ minimum: -7, maximum: 0 }),
  operationPathSteps: Object.freeze({ minimum: 3, maximum: 14 }),
  sourceOrTargetOrdinal: Object.freeze({ minimum: 0, maximum: 6 }),
  arcOrdinal: Object.freeze({ minimum: 0, maximum: 13 }),
  relationCount: Object.freeze({ minimum: 0, maximum: 21 }),
  lockOrdinal: Object.freeze({ minimum: 0, maximum: 6 }),
  roleSourceId: Object.freeze({
    minimumCodePoints: 1,
    maximumCodePoints: MAX_VOICING_EVIDENCE_ID_CODE_POINTS,
    maximumUtf8Bytes: MAX_VOICING_EVIDENCE_ID_UTF8_BYTES,
  }),
  roleSourceVersion: Object.freeze({ minimum: 1, maximum: 65_535 }),
} as const);

export const VOICE_ASSIGNMENT_OPERATION_ORDER = Object.freeze([
  "match",
  "leave",
  "enter",
] as const);
export type VoiceAssignmentOperationKind =
  (typeof VOICE_ASSIGNMENT_OPERATION_ORDER)[number];

export type MatchedVoiceAssignmentStep = Readonly<{
  kind: "match";
  sourceOrdinal: number;
  targetOrdinal: number;
}>;
export type LeavingVoiceAssignmentStep = Readonly<{
  kind: "leave";
  sourceOrdinal: number;
  targetOrdinal: null;
}>;
export type EnteringVoiceAssignmentStep = Readonly<{
  kind: "enter";
  sourceOrdinal: null;
  targetOrdinal: number;
}>;
export type VoiceAssignmentOperationStep =
  | MatchedVoiceAssignmentStep
  | LeavingVoiceAssignmentStep
  | EnteringVoiceAssignmentStep;

export const VOICE_ASSIGNMENT_MOTION_KINDS = Object.freeze([
  "descending",
  "stationary",
  "ascending",
  "entering",
  "leaving",
] as const);
export type VoiceMotionKind =
  (typeof VOICE_ASSIGNMENT_MOTION_KINDS)[number];

export const VOICE_MOTION_RELATION_KINDS = Object.freeze([
  "stationary-pair",
  "oblique",
  "contrary",
  "parallel",
  "similar",
] as const);
export type VoiceMotionRelationKind =
  (typeof VOICE_MOTION_RELATION_KINDS)[number];

export const VOICE_ASSIGNMENT_IDENTITY_QUESTIONS = Object.freeze([
  "exact-midi",
  "pitch-class",
  "spelled-pitch-class",
  "spelled-pitch",
  "degree",
] as const);
export type VoiceIdentityQuestion =
  (typeof VOICE_ASSIGNMENT_IDENTITY_QUESTIONS)[number];

export const VOICE_ASSIGNMENT_COST_AXIS_ORDER = Object.freeze([
  "alignmentCost",
  "commonTonesLost",
  "guideTonesLost",
  "gapCount",
  "negativeExactSustains",
  "negativeSpelledPitchContinuities",
  "operationPath",
] as const);
export type VoiceAssignmentCostAxis =
  (typeof VOICE_ASSIGNMENT_COST_AXIS_ORDER)[number];

/** Reported facts remain plural even when they do not distinguish two paths. */
export const VOICE_ASSIGNMENT_REPORTED_COST_AXES = Object.freeze([
  "totalAbsoluteMotion",
  "maximumAbsoluteLeap",
  "commonTonesLost",
  "crowdedLowIntervals",
  "doubledGuideTones",
  "omittedColors",
  "totalSpan",
] as const);
export type VoiceAssignmentReportedCostAxis =
  (typeof VOICE_ASSIGNMENT_REPORTED_COST_AXES)[number];

/**
 * Validation is global code-major, not frame-major. For each refusal code, an
 * initializer examines only its initial frame; a transition examines source
 * before target, then voices low-to-high, before advancing to the next code.
 * Equality is deliberately not descending so duplicate MIDI remains reachable.
 */
export const VOICE_ASSIGNMENT_VALIDATION_PRECEDENCE = Object.freeze({
  mode: "global-code-major",
  initializeFrameOrder: Object.freeze(["initial"] as const),
  transitionFrameOrder: Object.freeze(["source", "target"] as const),
  withinFrameOrder: "low-to-high",
  descendingMidiComparison: "strict-greater-than",
  equalMidiClassification: "voice_assignment.duplicate_midi",
  voiceSerialDigitCorrelationPrerequisite: "safe-integer-in-public-range",
} as const);

/**
 * Identity capacity is not a DP dimension. V1 first selects the canonical
 * musical path, then atomically proves that every entering identity fits.
 */
export const VOICE_ASSIGNMENT_IDENTITY_ALLOCATION_POLICY = Object.freeze({
  pathSelectionCapacityInput: "excluded",
  feasibilityPhase: "post-selection",
  exhaustionDisposition: "all-or-nothing-no-assignment",
  maySelectLowerRankedPathToConserveSerials: false,
  matrixStateIncludesIdentityCapacity: false,
} as const);

export const VOICE_ASSIGNMENT_REFUSAL_CODES = Object.freeze([
  "voice_assignment.schema_invalid",
  "voice_assignment.policy_invalid",
  "voice_assignment.request_id_invalid",
  "voice_assignment.event_identity_invalid",
  "voice_assignment.voice_count_invalid",
  "voice_assignment.voice_ordinal_invalid",
  "voice_assignment.voice_order_invalid",
  "voice_assignment.duplicate_midi",
  "voice_assignment.pitch_midi_mismatch",
  "voice_assignment.provenance_invalid",
  "voice_assignment.role_context_invalid",
  "voice_assignment.source_request_mismatch",
  "voice_assignment.voice_id_invalid",
  "voice_assignment.voice_id_duplicate",
  "voice_assignment.voice_serial_invalid",
  "voice_assignment.next_voice_serial_invalid",
  "voice_assignment.lock_limit_exceeded",
  "voice_assignment.lock_invalid",
  "voice_assignment.no_assignment",
  "limit.voice_assignment_work_exceeded",
] as const);
export type VoiceAssignmentRefusalCode =
  (typeof VOICE_ASSIGNMENT_REFUSAL_CODES)[number];

export const VOICE_ASSIGNMENT_NO_ASSIGNMENT_REASONS = Object.freeze([
  "lock-conflict",
  "locked-order-crossing",
  "voice-id-space-exhausted",
] as const);
export type VoiceAssignmentNoAssignmentReason =
  (typeof VOICE_ASSIGNMENT_NO_ASSIGNMENT_REASONS)[number];

export const VOICE_LOCK_STATUSES = Object.freeze([
  "eligible",
  "satisfied",
  "stale-request",
  "stale-event",
  "source-voice-missing",
  "target-pitch-missing",
  "target-degree-mismatch",
] as const);
export type VoiceLockStatus = (typeof VOICE_LOCK_STATUSES)[number];
export type VoiceLockInvalidStatus = Exclude<
  VoiceLockStatus,
  "eligible" | "satisfied"
>;

export const VOICE_ASSIGNMENT_TERMINATIONS = Object.freeze([
  "complete-initialized",
  "complete-assigned",
  "request-invalid",
  "no-assignment",
  "work-limit-exceeded",
] as const);
export type VoiceAssignmentTermination =
  (typeof VOICE_ASSIGNMENT_TERMINATIONS)[number];

type ReadonlyTupleUpTo<
  Value,
  Maximum extends number,
  Accumulator extends readonly Value[] = readonly [],
> = Accumulator["length"] extends Maximum
  ? Accumulator
  : Accumulator |
      ReadonlyTupleUpTo<Value, Maximum, readonly [...Accumulator, Value]>;

type ReadonlyTupleAtLeastThreeUpTo<Value, Maximum extends number> = Exclude<
  ReadonlyTupleUpTo<Value, Maximum>,
  readonly [] | readonly [Value] | readonly [Value, Value]
>;

export type VoiceAssignmentRequestId = string;
export type VoiceId = string;
export type VoiceSerial = number;
export type NextVoiceSerial = number;

/** V1 adds guide-role facts to one exact V0 voice without changing that voice. */
export type UnassignedVoice = VoicingCandidateVoice &
  Readonly<{
    guideTone: boolean;
    colorTone: boolean;
  }>;

export type AssignedVoice = UnassignedVoice &
  Readonly<{
    voiceId: VoiceId;
    voiceSerial: VoiceSerial;
  }>;

export type UnassignedVoiceTuple =
  | readonly [UnassignedVoice, UnassignedVoice, UnassignedVoice]
  | readonly [UnassignedVoice, UnassignedVoice, UnassignedVoice, UnassignedVoice]
  | readonly [
      UnassignedVoice,
      UnassignedVoice,
      UnassignedVoice,
      UnassignedVoice,
      UnassignedVoice,
    ]
  | readonly [
      UnassignedVoice,
      UnassignedVoice,
      UnassignedVoice,
      UnassignedVoice,
      UnassignedVoice,
      UnassignedVoice,
    ]
  | readonly [
      UnassignedVoice,
      UnassignedVoice,
      UnassignedVoice,
      UnassignedVoice,
      UnassignedVoice,
      UnassignedVoice,
      UnassignedVoice,
    ];

export type AssignedVoiceTuple =
  | readonly [AssignedVoice, AssignedVoice, AssignedVoice]
  | readonly [AssignedVoice, AssignedVoice, AssignedVoice, AssignedVoice]
  | readonly [
      AssignedVoice,
      AssignedVoice,
      AssignedVoice,
      AssignedVoice,
      AssignedVoice,
    ]
  | readonly [
      AssignedVoice,
      AssignedVoice,
      AssignedVoice,
      AssignedVoice,
      AssignedVoice,
      AssignedVoice,
    ]
  | readonly [
      AssignedVoice,
      AssignedVoice,
      AssignedVoice,
      AssignedVoice,
      AssignedVoice,
      AssignedVoice,
      AssignedVoice,
    ];

export type VoiceRoleDegrees = ReadonlyTupleUpTo<
  ChordDegree,
  typeof MAX_VOICE_ASSIGNMENT_ROLE_DEGREES
>;

/**
 * Exact selected-realization roles make omission and doubling facts mechanical.
 * Arrays are duplicate-free and ordered by degree number, then alteration.
 */
export type VoiceRoleContext = Readonly<{
  policyId: typeof VOICE_ASSIGNMENT_ROLE_POLICY_ID;
  policyVersion: typeof VOICE_ASSIGNMENT_ROLE_POLICY_VERSION;
  sourceId: string;
  sourceVersion: number;
  candidateId: VoicingCandidateId;
  realizationId: SemanticRealizationId;
  guideDegrees: VoiceRoleDegrees;
  colorDegrees: VoiceRoleDegrees;
}>;

export type UnassignedVoiceFrame = Readonly<{
  schema: typeof VOICE_ASSIGNMENT_FRAME_SCHEMA;
  kind: "unassigned";
  eventId: ChordEventId;
  roles: VoiceRoleContext;
  voices: UnassignedVoiceTuple;
}>;

export type AssignedVoiceFrame = Readonly<{
  schema: typeof VOICE_ASSIGNMENT_FRAME_SCHEMA;
  kind: "assigned";
  requestId: VoiceAssignmentRequestId;
  eventId: ChordEventId;
  roles: VoiceRoleContext;
  voices: AssignedVoiceTuple;
  nextVoiceSerial: NextVoiceSerial;
}>;

export type InitializeVoiceFrameRequest = Readonly<{
  schema: typeof VOICE_ASSIGNMENT_REQUEST_SCHEMA;
  kind: "initialize";
  requestId: VoiceAssignmentRequestId;
  frame: UnassignedVoiceFrame;
}>;

export type VoiceLock = Readonly<{
  schema: typeof VOICE_ASSIGNMENT_LOCK_SCHEMA;
  requestId: VoiceAssignmentRequestId;
  eventId: ChordEventId;
  voiceId: VoiceId;
  pitch: SpelledPitch;
  degree: ChordDegree | null;
}>;

export type VoiceAssignmentLocks = ReadonlyTupleUpTo<
  VoiceLock,
  typeof MAX_VOICE_ASSIGNMENT_LOCKS
>;

export type AssignVoiceTransitionRequest = Readonly<{
  schema: typeof VOICE_ASSIGNMENT_REQUEST_SCHEMA;
  kind: "transition";
  requestId: VoiceAssignmentRequestId;
  from: AssignedVoiceFrame;
  to: UnassignedVoiceFrame;
  locks: VoiceAssignmentLocks;
  policyId: typeof VOICE_ASSIGNMENT_POLICY_ID;
  policyVersion: typeof VOICE_ASSIGNMENT_POLICY_VERSION;
}>;

export type VoiceAssignmentRequest =
  | InitializeVoiceFrameRequest
  | AssignVoiceTransitionRequest;

/** One identity record prevents contradictory from/to/endpoint ID copies. */
export type VoiceArcIdentity = Readonly<{
  voiceId: VoiceId;
  voiceSerial: VoiceSerial;
}>;

/** The exact V0 union retains degree/source-index/provenance correlation. */
export type VoiceArcEndpoint = UnassignedVoice;

export type MatchedVoiceArc = Readonly<{
  schema: typeof VOICE_ASSIGNMENT_ARC_SCHEMA;
  kind: "match";
  identityDisposition: "propagated";
  identity: VoiceArcIdentity;
  from: VoiceArcEndpoint;
  to: VoiceArcEndpoint;
  semitones: number;
  absoluteSemitones: number;
  motion: "descending" | "stationary" | "ascending";
  exactMidiIdentity: boolean;
  pitchClassIdentity: boolean;
  spelledPitchClassIdentity: boolean;
  spelledPitchIdentity: boolean;
  degreeIdentity: boolean;
  commonTone: boolean;
  guideTone: boolean;
  guideToneContinuity: boolean;
}>;

export type EnteringVoiceArc = Readonly<{
  schema: typeof VOICE_ASSIGNMENT_ARC_SCHEMA;
  kind: "enter";
  identityDisposition: "allocated";
  identity: VoiceArcIdentity;
  from: null;
  to: VoiceArcEndpoint;
  semitones: null;
  absoluteSemitones: null;
  motion: "entering";
  exactMidiIdentity: null;
  pitchClassIdentity: null;
  spelledPitchClassIdentity: null;
  spelledPitchIdentity: null;
  degreeIdentity: null;
  commonTone: false;
  guideTone: boolean;
  guideToneContinuity: false;
}>;

export type LeavingVoiceArc = Readonly<{
  schema: typeof VOICE_ASSIGNMENT_ARC_SCHEMA;
  kind: "leave";
  identityDisposition: "retired";
  identity: VoiceArcIdentity;
  from: VoiceArcEndpoint;
  to: null;
  semitones: null;
  absoluteSemitones: null;
  motion: "leaving";
  exactMidiIdentity: null;
  pitchClassIdentity: null;
  spelledPitchClassIdentity: null;
  spelledPitchIdentity: null;
  degreeIdentity: null;
  commonTone: false;
  guideTone: boolean;
  guideToneContinuity: false;
}>;

export type VoiceArc = MatchedVoiceArc | EnteringVoiceArc | LeavingVoiceArc;
export type VoiceArcs = ReadonlyTupleAtLeastThreeUpTo<
  VoiceArc,
  typeof MAX_VOICE_ASSIGNMENT_ARCS
>;
export type VoiceAssignmentOperationPath = ReadonlyTupleAtLeastThreeUpTo<
  VoiceAssignmentOperationStep,
  typeof MAX_VOICE_ASSIGNMENT_BACKTRACE_STEPS
>;

export type VoiceMotionRelation = Readonly<{
  firstArcOrdinal: number;
  secondArcOrdinal: number;
  kind: VoiceMotionRelationKind;
}>;
export type VoiceMotionRelations = ReadonlyTupleUpTo<
  VoiceMotionRelation,
  typeof MAX_VOICE_ASSIGNMENT_RELATIONS
>;

type VoiceLockEvidenceBase = Readonly<{
  lockOrdinal: number;
  voiceId: VoiceId;
}>;

export type EligibleVoiceLockEvidence = VoiceLockEvidenceBase &
  Readonly<{
    status: "eligible";
    matchedTargetOrdinal: number;
  }>;
export type SatisfiedVoiceLockEvidence = VoiceLockEvidenceBase &
  Readonly<{
    status: "satisfied";
    matchedTargetOrdinal: number;
  }>;
export type InvalidVoiceLockEvidence = VoiceLockEvidenceBase &
  Readonly<{
    status: VoiceLockInvalidStatus;
    matchedTargetOrdinal: number | null;
  }>;
export type VoiceLockValidationEvidence =
  | EligibleVoiceLockEvidence
  | InvalidVoiceLockEvidence;
export type VoiceLockValidationEvidenceRecords = ReadonlyTupleUpTo<
  VoiceLockValidationEvidence,
  typeof MAX_VOICE_ASSIGNMENT_LOCKS
>;
export type EligibleVoiceLockEvidenceRecords = ReadonlyTupleUpTo<
  EligibleVoiceLockEvidence,
  typeof MAX_VOICE_ASSIGNMENT_LOCKS
>;
export type SatisfiedVoiceLockEvidenceRecords = ReadonlyTupleUpTo<
  SatisfiedVoiceLockEvidence,
  typeof MAX_VOICE_ASSIGNMENT_LOCKS
>;

/** Plural facts stay inspectable even though the policy selects one path. */
export type VoiceAssignmentCost = Readonly<{
  alignmentCost: number;
  gapCount: number;
  enteringVoices: number;
  leavingVoices: number;
  totalAbsoluteMotion: number;
  maximumAbsoluteLeap: number;
  pitchClassCommonTones: number;
  exactSustains: number;
  spelledPitchClassContinuities: number;
  spelledPitchContinuities: number;
  commonTonesLost: number;
  guideToneContinuities: number;
  guideTonesLost: number;
  crowdedLowIntervals: number;
  doubledGuideTones: number;
  omittedColors: number;
  totalSpan: number;
}>;

export type VoiceAssignmentOrderKey = readonly [
  alignmentCost: number,
  commonTonesLost: number,
  guideTonesLost: number,
  gapCount: number,
  negativeExactSustains: number,
  negativeSpelledPitchContinuities: number,
  operationPath: VoiceAssignmentOperationPath,
];

export const VOICE_ASSIGNMENT_WORK_COUNTER_NAMES = Object.freeze([
  "sourceVoicesVisited",
  "targetVoicesVisited",
  "matrixCellsVisited",
  "transitionCandidatesEvaluated",
  "scoreComparisons",
  "backtraceSteps",
  "identityComparisons",
  "roleDegreesVisited",
  "roleMembershipComparisons",
  "roleOrderComparisons",
  "relationClassifications",
  "lockChecks",
  "voiceIdsAllocated",
  "arcsProduced",
] as const);
export type VoiceAssignmentWorkCounterName =
  (typeof VOICE_ASSIGNMENT_WORK_COUNTER_NAMES)[number];

export const VOICE_ASSIGNMENT_MEMORY_COUNTER_NAMES = Object.freeze([
  "peakInputVoiceRecords",
  "peakInputRoleDegreeRecords",
  "peakMatrixCellRecords",
  "peakPredecessorRecords",
  "peakScoreRecords",
  "peakPathStepRecords",
  "peakArcRecords",
  "peakArcEndpointRecords",
  "peakArcIdentityRecords",
  "peakOutputVoiceRecords",
  "peakOutputRoleDegreeRecords",
  "peakRelationRecords",
  "peakLockRecords",
  "peakLockEvidenceRecords",
  "peakTrackedRecords",
] as const);
export type VoiceAssignmentMemoryCounterName =
  (typeof VOICE_ASSIGNMENT_MEMORY_COUNTER_NAMES)[number];

export const MAX_VOICE_ASSIGNMENT_TRACKED_RECORDS = 399;

export const VOICE_ASSIGNMENT_WORK_LIMITS = Object.freeze({
  sourceVoicesVisited: MAX_VOICE_ASSIGNMENT_VOICES,
  targetVoicesVisited: MAX_VOICE_ASSIGNMENT_VOICES,
  matrixCellsVisited: MAX_VOICE_ASSIGNMENT_MATRIX_CELLS,
  transitionCandidatesEvaluated:
    MAX_VOICE_ASSIGNMENT_TRANSITION_CANDIDATES,
  scoreComparisons: MAX_VOICE_ASSIGNMENT_SCORE_COMPARISONS,
  backtraceSteps: MAX_VOICE_ASSIGNMENT_BACKTRACE_STEPS,
  identityComparisons: MAX_VOICE_ASSIGNMENT_IDENTITY_COMPARISONS,
  roleDegreesVisited: MAX_VOICE_ASSIGNMENT_ROLE_DEGREE_RECORDS,
  roleMembershipComparisons:
    MAX_VOICE_ASSIGNMENT_ROLE_MEMBERSHIP_COMPARISONS,
  roleOrderComparisons: MAX_VOICE_ASSIGNMENT_ROLE_ORDER_COMPARISONS,
  relationClassifications: MAX_VOICE_ASSIGNMENT_RELATIONS,
  lockChecks: MAX_VOICE_ASSIGNMENT_LOCK_CHECKS,
  voiceIdsAllocated: MAX_VOICE_ASSIGNMENT_VOICES,
  arcsProduced: MAX_VOICE_ASSIGNMENT_ARCS,
} as const);

export const VOICE_ASSIGNMENT_MEMORY_LIMITS = Object.freeze({
  peakInputVoiceRecords: 14,
  peakInputRoleDegreeRecords: MAX_VOICE_ASSIGNMENT_ROLE_DEGREE_RECORDS,
  peakMatrixCellRecords: MAX_VOICE_ASSIGNMENT_MATRIX_CELLS,
  peakPredecessorRecords: MAX_VOICE_ASSIGNMENT_MATRIX_CELLS - 1,
  peakScoreRecords: MAX_VOICE_ASSIGNMENT_MATRIX_CELLS,
  peakPathStepRecords: MAX_VOICE_ASSIGNMENT_BACKTRACE_STEPS,
  peakArcRecords: MAX_VOICE_ASSIGNMENT_ARCS,
  peakArcEndpointRecords: 14,
  peakArcIdentityRecords: MAX_VOICE_ASSIGNMENT_ARCS,
  peakOutputVoiceRecords: MAX_VOICE_ASSIGNMENT_VOICES,
  peakOutputRoleDegreeRecords: 32,
  peakRelationRecords: MAX_VOICE_ASSIGNMENT_RELATIONS,
  peakLockRecords: MAX_VOICE_ASSIGNMENT_LOCKS,
  peakLockEvidenceRecords: MAX_VOICE_ASSIGNMENT_LOCKS,
  peakTrackedRecords: MAX_VOICE_ASSIGNMENT_TRACKED_RECORDS,
} as const);

export type VoiceAssignmentWorkEvidence = Readonly<{
  sourceVoicesVisited: number;
  targetVoicesVisited: number;
  matrixCellsVisited: number;
  transitionCandidatesEvaluated: number;
  scoreComparisons: number;
  backtraceSteps: number;
  identityComparisons: number;
  roleDegreesVisited: number;
  roleMembershipComparisons: number;
  roleOrderComparisons: number;
  relationClassifications: number;
  lockChecks: number;
  voiceIdsAllocated: number;
  arcsProduced: number;
  peakInputVoiceRecords: number;
  peakInputRoleDegreeRecords: number;
  peakMatrixCellRecords: number;
  peakPredecessorRecords: number;
  peakScoreRecords: number;
  peakPathStepRecords: number;
  peakArcRecords: number;
  peakArcEndpointRecords: number;
  peakArcIdentityRecords: number;
  peakOutputVoiceRecords: number;
  peakOutputRoleDegreeRecords: number;
  peakRelationRecords: number;
  peakLockRecords: number;
  peakLockEvidenceRecords: number;
  peakTrackedRecords: number;
  termination: VoiceAssignmentTermination;
}>;

export type VoiceAssignmentExplanation<
  OperationPath extends
    | VoiceAssignmentOperationPath
    | readonly [] = VoiceAssignmentOperationPath | readonly [],
> = Readonly<{
  engineId: typeof VOICE_ASSIGNMENT_ENGINE_ID;
  engineVersion: typeof VOICE_ASSIGNMENT_ENGINE_VERSION;
  policyId: typeof VOICE_ASSIGNMENT_POLICY_ID;
  policyVersion: typeof VOICE_ASSIGNMENT_POLICY_VERSION;
  identityPolicyId: typeof VOICE_IDENTITY_POLICY_ID;
  identityPolicyVersion: typeof VOICE_IDENTITY_POLICY_VERSION;
  tieBreakPolicyId: typeof VOICE_ASSIGNMENT_TIE_BREAK_POLICY_ID;
  tieBreakPolicyVersion: typeof VOICE_ASSIGNMENT_TIE_BREAK_POLICY_VERSION;
  rolePolicyId: typeof VOICE_ASSIGNMENT_ROLE_POLICY_ID;
  rolePolicyVersion: typeof VOICE_ASSIGNMENT_ROLE_POLICY_VERSION;
  lowRegisterPolicyId: typeof VOICE_ASSIGNMENT_LOW_REGISTER_POLICY_ID;
  lowRegisterPolicyVersion: typeof VOICE_ASSIGNMENT_LOW_REGISTER_POLICY_VERSION;
  noncrossingByConstruction: true;
  wallTimeAffectedSelection: false;
  operationPath: OperationPath;
}>;

export type InitializedVoiceFrame = Readonly<{
  schema: typeof VOICE_ASSIGNMENT_RESULT_SCHEMA;
  kind: "initialized";
  frame: AssignedVoiceFrame;
  explanation: VoiceAssignmentExplanation<readonly []>;
}>;

export type AssignedVoiceTransition = Readonly<{
  schema: typeof VOICE_ASSIGNMENT_RESULT_SCHEMA;
  kind: "assigned-transition";
  requestId: VoiceAssignmentRequestId;
  fromEventId: ChordEventId;
  toEventId: ChordEventId;
  frame: AssignedVoiceFrame;
  arcs: VoiceArcs;
  relations: VoiceMotionRelations;
  locks: SatisfiedVoiceLockEvidenceRecords;
  cost: VoiceAssignmentCost;
  orderKey: VoiceAssignmentOrderKey;
  explanation: VoiceAssignmentExplanation<VoiceAssignmentOperationPath>;
}>;

export type VoiceAssignmentFrameLabel = "initial" | "source" | "target";

export type VoiceAssignmentSchemaInvalidRefusal =
  | PathRefusal<{
      code: "voice_assignment.schema_invalid";
      reason: "request-schema-mismatch";
      path: readonly ["schema"];
      received: string;
      expected: typeof VOICE_ASSIGNMENT_REQUEST_SCHEMA;
    }>
  | PathRefusal<{
      code: "voice_assignment.schema_invalid";
      reason: "frame-schema-mismatch";
      path:
        | readonly ["frame", "schema"]
        | readonly ["from", "schema"]
        | readonly ["to", "schema"];
      received: string;
      expected: typeof VOICE_ASSIGNMENT_FRAME_SCHEMA;
    }>
  | PathRefusal<{
      code: "voice_assignment.schema_invalid";
      reason: "lock-schema-mismatch";
      path: readonly ["locks", number, "schema"];
      received: string;
      expected: typeof VOICE_ASSIGNMENT_LOCK_SCHEMA;
    }>;

export type VoiceAssignmentPolicyInvalidRefusal =
  | PathRefusal<{
      code: "voice_assignment.policy_invalid";
      reason: "policy-id-mismatch";
      path: readonly ["policyId"];
      received: string;
      expected: typeof VOICE_ASSIGNMENT_POLICY_ID;
    }>
  | PathRefusal<{
      code: "voice_assignment.policy_invalid";
      reason: "policy-version-mismatch";
      path: readonly ["policyVersion"];
      received: number;
      expected: typeof VOICE_ASSIGNMENT_POLICY_VERSION;
    }>;

export type VoiceAssignmentRequestIdInvalidRefusal = PathRefusal<{
  code: "voice_assignment.request_id_invalid";
  reason: "non-ascii" | "length-out-of-range" | "pattern-mismatch";
  path: readonly ["requestId"];
  received: string;
  minimumAsciiLength: 1;
  maximumAsciiLength: typeof MAX_VOICE_ASSIGNMENT_REQUEST_ID_ASCII_LENGTH;
  pattern: typeof VOICE_ASSIGNMENT_REQUEST_ID_PATTERN_SOURCE;
}>;

export type VoiceAssignmentEventIdentityInvalidRefusal = PathRefusal<{
  code: "voice_assignment.event_identity_invalid";
  reason: "source-and-target-event-equal";
  path: readonly ["to", "eventId"];
  eventId: ChordEventId;
}>;

export type VoiceAssignmentVoiceCountInvalidRefusal = PathRefusal<{
  code: "voice_assignment.voice_count_invalid";
  frame: VoiceAssignmentFrameLabel;
  received: number;
  minimum: typeof MIN_VOICE_ASSIGNMENT_VOICES;
  maximum: typeof MAX_VOICE_ASSIGNMENT_VOICES;
}>;

export type VoiceAssignmentVoiceOrdinalInvalidRefusal = PathRefusal<{
  code: "voice_assignment.voice_ordinal_invalid";
  reason: "non-integer" | "noncontiguous";
  frame: VoiceAssignmentFrameLabel;
  voiceIndex: number;
  received: number;
  expected: number;
}>;

export type VoiceAssignmentVoiceOrderInvalidRefusal = PathRefusal<{
  code: "voice_assignment.voice_order_invalid";
  reason: "descending-midi";
  frame: VoiceAssignmentFrameLabel;
  lowerOrdinal: number;
  upperOrdinal: number;
  lowerMidi: MidiPitch;
  upperMidi: MidiPitch;
}>;

export type VoiceAssignmentDuplicateMidiRefusal = PathRefusal<{
  code: "voice_assignment.duplicate_midi";
  frame: VoiceAssignmentFrameLabel;
  firstOrdinal: number;
  secondOrdinal: number;
  midi: MidiPitch;
}>;

export type VoiceAssignmentPitchMidiMismatchRefusal = PathRefusal<{
  code: "voice_assignment.pitch_midi_mismatch";
  frame: VoiceAssignmentFrameLabel;
  voiceOrdinal: number;
  pitch: SpelledPitch;
  received: number;
  /** Exact spelling projection, including a value outside 0..127. */
  expected: number;
}>;

export type VoiceAssignmentProvenanceInvalidReason =
  | "realization-degree-missing"
  | "realization-source-index-missing"
  | "doubling-degree-missing"
  | "doubling-source-index-missing"
  | "slash-bass-degree-fabricated"
  | "slash-bass-source-index-fabricated";
export type VoiceAssignmentProvenanceInvalidRefusal = PathRefusal<{
  code: "voice_assignment.provenance_invalid";
  reason: VoiceAssignmentProvenanceInvalidReason;
  frame: VoiceAssignmentFrameLabel;
  voiceOrdinal: number;
}>;

export type VoiceAssignmentRoleContextInvalidReason =
  | "degree-count-exceeded"
  | "degree-order-invalid"
  | "degree-duplicate"
  | "role-policy-id-mismatch"
  | "role-policy-version-mismatch"
  | "role-source-id-invalid"
  | "role-source-version-invalid"
  | "candidate-id-invalid"
  | "realization-id-invalid"
  | "guide-flag-mismatch"
  | "color-flag-mismatch"
  | "null-degree-role";
export type VoiceAssignmentRoleContextInvalidRefusal = PathRefusal<{
  code: "voice_assignment.role_context_invalid";
  reason: VoiceAssignmentRoleContextInvalidReason;
  frame: VoiceAssignmentFrameLabel;
  role: "guide" | "color" | null;
  degreeOrdinal: number | null;
  voiceOrdinal: number | null;
}>;

export type VoiceAssignmentSourceRequestMismatchRefusal = PathRefusal<{
  code: "voice_assignment.source_request_mismatch";
  path: readonly ["from", "requestId"];
  received: VoiceAssignmentRequestId;
  expected: VoiceAssignmentRequestId;
}>;

export type VoiceAssignmentVoiceIdInvalidRefusal = PathRefusal<{
  code: "voice_assignment.voice_id_invalid";
  reason: "format-invalid" | "serial-digits-mismatch";
  frame: "source";
  voiceOrdinal: number;
  received: VoiceId;
  expectedSerial: VoiceSerial;
  pattern: typeof VOICE_ASSIGNMENT_VOICE_ID_PATTERN_SOURCE;
}>;

export type VoiceAssignmentVoiceIdDuplicateRefusal = PathRefusal<{
  code: "voice_assignment.voice_id_duplicate";
  frame: "source";
  firstOrdinal: number;
  secondOrdinal: number;
  voiceId: VoiceId;
}>;

export type VoiceAssignmentVoiceSerialInvalidRefusal = PathRefusal<{
  code: "voice_assignment.voice_serial_invalid";
  reason: "non-integer" | "out-of-range";
  frame: "source";
  voiceOrdinal: number;
  received: number;
  minimum: 0;
  maximum: typeof MAX_VOICE_ASSIGNMENT_VOICE_SERIAL;
}>;

export type VoiceAssignmentNextVoiceSerialInvalidRefusal = PathRefusal<{
  code: "voice_assignment.next_voice_serial_invalid";
  reason:
    | "non-integer"
    | "out-of-range"
    | "not-above-assigned-serial";
  path: readonly ["from", "nextVoiceSerial"];
  received: number;
  minimum: 0;
  maximum: typeof MAX_VOICE_ASSIGNMENT_NEXT_VOICE_SERIAL;
}>;

export type VoiceAssignmentLockLimitExceededRefusal = PathRefusal<{
  code: "voice_assignment.lock_limit_exceeded";
  path: readonly ["locks"];
  received: number;
  maximum: typeof MAX_VOICE_ASSIGNMENT_LOCKS;
}>;

export type VoiceAssignmentLockInvalidReason =
  | VoiceLockInvalidStatus
  | "duplicate-lock";
export type VoiceAssignmentLockInvalidRefusal = PathRefusal<{
  code: "voice_assignment.lock_invalid";
  reason: VoiceAssignmentLockInvalidReason;
  path: readonly ["locks", number];
  lockOrdinal: number;
}>;

export type VoiceAssignmentInputRefusal =
  | VoiceAssignmentSchemaInvalidRefusal
  | VoiceAssignmentPolicyInvalidRefusal
  | VoiceAssignmentRequestIdInvalidRefusal
  | VoiceAssignmentEventIdentityInvalidRefusal
  | VoiceAssignmentVoiceCountInvalidRefusal
  | VoiceAssignmentVoiceOrdinalInvalidRefusal
  | VoiceAssignmentVoiceOrderInvalidRefusal
  | VoiceAssignmentDuplicateMidiRefusal
  | VoiceAssignmentPitchMidiMismatchRefusal
  | VoiceAssignmentProvenanceInvalidRefusal
  | VoiceAssignmentRoleContextInvalidRefusal
  | VoiceAssignmentSourceRequestMismatchRefusal
  | VoiceAssignmentVoiceIdInvalidRefusal
  | VoiceAssignmentVoiceIdDuplicateRefusal
  | VoiceAssignmentVoiceSerialInvalidRefusal
  | VoiceAssignmentNextVoiceSerialInvalidRefusal
  | VoiceAssignmentLockLimitExceededRefusal
  | VoiceAssignmentLockInvalidRefusal;

export type VoiceAssignmentNoAssignmentRefusal = PathRefusal<{
  code: "voice_assignment.no_assignment";
  reason: VoiceAssignmentNoAssignmentReason;
  conflictingLockOrdinals: ReadonlyTupleUpTo<
    number,
    typeof MAX_VOICE_ASSIGNMENT_LOCKS
  >;
  partialResult: false;
}>;

export type VoiceAssignmentWorkLimitRefusal = PathRefusal<{
  code: "limit.voice_assignment_work_exceeded";
  counter: VoiceAssignmentWorkCounterName | VoiceAssignmentMemoryCounterName;
  received: number;
  maximum: number;
  partialResult: false;
}>;

export type VoiceAssignmentRefusal =
  | VoiceAssignmentInputRefusal
  | VoiceAssignmentNoAssignmentRefusal
  | VoiceAssignmentWorkLimitRefusal;

export type InitializeVoiceFrameResult =
  | Readonly<{
      ok: true;
      value: InitializedVoiceFrame;
      evidence: VoiceAssignmentWorkEvidence &
        Readonly<{ termination: "complete-initialized" }>;
    }>
  | Readonly<{
      ok: false;
      refusal: VoiceAssignmentInputRefusal;
      evidence: VoiceAssignmentWorkEvidence &
        Readonly<{ termination: "request-invalid" }>;
    }>
  | Readonly<{
      ok: false;
      refusal: VoiceAssignmentWorkLimitRefusal;
      evidence: VoiceAssignmentWorkEvidence &
        Readonly<{ termination: "work-limit-exceeded" }>;
    }>;

export type AssignVoiceTransitionResult =
  | Readonly<{
      ok: true;
      value: AssignedVoiceTransition;
      evidence: VoiceAssignmentWorkEvidence &
        Readonly<{ termination: "complete-assigned" }>;
    }>
  | Readonly<{
      ok: false;
      refusal: VoiceAssignmentInputRefusal;
      locks: VoiceLockValidationEvidenceRecords;
      evidence: VoiceAssignmentWorkEvidence &
        Readonly<{ termination: "request-invalid" }>;
    }>
  | Readonly<{
      ok: false;
      refusal: VoiceAssignmentNoAssignmentRefusal;
      locks: EligibleVoiceLockEvidenceRecords;
      evidence: VoiceAssignmentWorkEvidence &
        Readonly<{ termination: "no-assignment" }>;
    }>
  | Readonly<{
      ok: false;
      refusal: VoiceAssignmentWorkLimitRefusal;
      locks: VoiceLockValidationEvidenceRecords;
      evidence: VoiceAssignmentWorkEvidence &
        Readonly<{ termination: "work-limit-exceeded" }>;
    }>;

export type VoiceAssignmentResult =
  | InitializeVoiceFrameResult
  | AssignVoiceTransitionResult;

export interface InitializeVoiceFrame {
  (request: InitializeVoiceFrameRequest): InitializeVoiceFrameResult;
}

export interface AssignVoiceTransition {
  (request: AssignVoiceTransitionRequest): AssignVoiceTransitionResult;
}

export const VOICE_ASSIGNMENT_OPERATION_NAMES = Object.freeze([
  "initializeVoiceFrame",
  "assignVoiceTransition",
] as const);
export type VoiceAssignmentOperationName =
  (typeof VOICE_ASSIGNMENT_OPERATION_NAMES)[number];

export interface VoiceAssignmentOperations {
  readonly initializeVoiceFrame: InitializeVoiceFrame;
  readonly assignVoiceTransition: AssignVoiceTransition;
}
