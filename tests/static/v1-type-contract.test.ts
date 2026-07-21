import { describe, expect, test } from "bun:test";

import type {
  AssignVoiceTransitionResult,
  AssignedVoiceTransition,
  AssignedVoiceTuple,
  EnteringVoiceArc,
  EnteringVoiceAssignmentStep,
  InitializeVoiceFrameResult,
  InitializedVoiceFrame,
  LeavingVoiceArc,
  LeavingVoiceAssignmentStep,
  MatchedVoiceArc,
  MatchedVoiceAssignmentStep,
  SatisfiedVoiceLockEvidence,
  UnassignedVoice,
  UnassignedVoiceTuple,
  VoiceArcs,
  VoiceAssignmentCost,
  VoiceAssignmentInputRefusal,
  VoiceAssignmentLocks,
  VoiceAssignmentOperationPath,
  VoiceAssignmentOrderKey,
  VoiceAssignmentRoleContextInvalidRefusal,
  VoiceAssignmentVoiceSerialInvalidRefusal,
  VoiceAssignmentWorkLimitRefusal,
  VoiceLock,
  VoiceRoleDegrees,
} from "../../src/theory/voice-assignment-contract";

type Equal<Left, Right> =
  [Left] extends [Right]
    ? [Right] extends [Left]
      ? true
      : false
    : false;
type Not<Value extends boolean> = Value extends true ? false : true;
type HasKey<Value, Key extends PropertyKey> = Key extends keyof Value
  ? true
  : false;
type MustExtend<Constraint, Value extends Constraint> = Value;

function assertType<Constraint extends true>(proof?: Constraint): Constraint {
  return proof ?? (true as Constraint);
}

type TupleOfLength<
  Value,
  Length extends number,
  Accumulator extends readonly Value[] = readonly [],
> = Accumulator["length"] extends Length
  ? Accumulator
  : TupleOfLength<Value, Length, readonly [...Accumulator, Value]>;

type TwoVoices = TupleOfLength<UnassignedVoice, 2>;
type ThreeVoices = TupleOfLength<UnassignedVoice, 3>;
type SevenVoices = TupleOfLength<UnassignedVoice, 7>;
type EightVoices = TupleOfLength<UnassignedVoice, 8>;
type SixteenDegrees = TupleOfLength<VoiceRoleDegrees[number], 16>;
type SeventeenDegrees = TupleOfLength<VoiceRoleDegrees[number], 17>;
type SevenLocks = TupleOfLength<VoiceLock, 7>;
type EightLocks = TupleOfLength<VoiceLock, 8>;
type TwoArcs = TupleOfLength<VoiceArcs[number], 2>;
type ThreeArcs = TupleOfLength<VoiceArcs[number], 3>;
type FourteenArcs = TupleOfLength<VoiceArcs[number], 14>;
type FifteenArcs = TupleOfLength<VoiceArcs[number], 15>;

type InitializeSuccess = Extract<InitializeVoiceFrameResult, { ok: true }>;
type InitializeInputFailure = Extract<
  InitializeVoiceFrameResult,
  { ok: false; refusal: VoiceAssignmentInputRefusal }
>;
type InitializeWorkFailure = Extract<
  InitializeVoiceFrameResult,
  { ok: false; refusal: VoiceAssignmentWorkLimitRefusal }
>;
type TransitionSuccess = Extract<AssignVoiceTransitionResult, { ok: true }>;
type TransitionInputFailure = Extract<
  AssignVoiceTransitionResult,
  { ok: false; refusal: VoiceAssignmentInputRefusal }
>;
type TransitionNoAssignmentFailure = Extract<
  AssignVoiceTransitionResult,
  { ok: false; refusal: { code: "voice_assignment.no_assignment" } }
>;
type TransitionWorkFailure = Extract<
  AssignVoiceTransitionResult,
  { ok: false; refusal: VoiceAssignmentWorkLimitRefusal }
>;

type InvalidEnterStep = Readonly<{
  kind: "enter";
  sourceOrdinal: 0;
  targetOrdinal: 0;
}>;
type InvalidLeaveStep = Readonly<{
  kind: "leave";
  sourceOrdinal: 0;
  targetOrdinal: 0;
}>;
type InvalidMatchStep = Readonly<{
  kind: "match";
  sourceOrdinal: null;
  targetOrdinal: 0;
}>;
type InvalidEnteringArc = Omit<EnteringVoiceArc, "semitones"> &
  Readonly<{ semitones: 0 }>;
type InvalidLeavingArc = Omit<LeavingVoiceArc, "to"> &
  Readonly<{ to: UnassignedVoice }>;
type InvalidMatchedArc = Omit<MatchedVoiceArc, "identityDisposition"> &
  Readonly<{ identityDisposition: "allocated" }>;
type InvalidInitializedFrame = Omit<InitializedVoiceFrame, "explanation"> &
  Readonly<{
    explanation: AssignedVoiceTransition["explanation"];
  }>;
type InvalidAssignedTransition = Omit<
  AssignedVoiceTransition,
  "explanation"
> &
  Readonly<{
    explanation: InitializedVoiceFrame["explanation"];
  }>;
type InvalidRoleRefusal = Omit<
  VoiceAssignmentRoleContextInvalidRefusal,
  "code"
> &
  Readonly<{ code: "voice_assignment.pitch_midi_mismatch" }>;
type InvalidSatisfiedLock = Omit<
  SatisfiedVoiceLockEvidence,
  "matchedTargetOrdinal"
> &
  Readonly<{ matchedTargetOrdinal: null }>;

type NegativeCompileProofs = readonly [
  // @ts-expect-error: two voices cannot form a V1 input frame
  MustExtend<UnassignedVoiceTuple, TwoVoices>,
  // @ts-expect-error: eight voices exceed the public V1 maximum
  MustExtend<UnassignedVoiceTuple, EightVoices>,
  // @ts-expect-error: a seventeenth role degree exceeds inherited T1 capacity
  MustExtend<VoiceRoleDegrees, SeventeenDegrees>,
  // @ts-expect-error: eight locks exceed the source-voice maximum
  MustExtend<VoiceAssignmentLocks, EightLocks>,
  // @ts-expect-error: a transition cannot contain fewer than three arcs
  MustExtend<VoiceArcs, TwoArcs>,
  // @ts-expect-error: a transition cannot contain a fifteenth arc
  MustExtend<VoiceArcs, FifteenArcs>,
  // @ts-expect-error: enter structurally has no source ordinal
  MustExtend<EnteringVoiceAssignmentStep, InvalidEnterStep>,
  // @ts-expect-error: leave structurally has no target ordinal
  MustExtend<LeavingVoiceAssignmentStep, InvalidLeaveStep>,
  // @ts-expect-error: match structurally requires both ordinals
  MustExtend<MatchedVoiceAssignmentStep, InvalidMatchStep>,
  // @ts-expect-error: a gap cannot report zero semitone motion
  MustExtend<EnteringVoiceArc, InvalidEnteringArc>,
  // @ts-expect-error: a leaving arc cannot expose a target endpoint
  MustExtend<LeavingVoiceArc, InvalidLeavingArc>,
  // @ts-expect-error: a matched arc can only propagate identity
  MustExtend<MatchedVoiceArc, InvalidMatchedArc>,
  // @ts-expect-error: initialization alone must expose the empty path
  MustExtend<InitializedVoiceFrame, InvalidInitializedFrame>,
  // @ts-expect-error: an assigned transition must expose a 3..14 step path
  MustExtend<AssignedVoiceTransition, InvalidAssignedTransition>,
  // @ts-expect-error: refusal codes cannot be paired with another code's shape
  MustExtend<VoiceAssignmentRoleContextInvalidRefusal, InvalidRoleRefusal>,
  // @ts-expect-error: a satisfied lock always resolves a target ordinal
  MustExtend<SatisfiedVoiceLockEvidence, InvalidSatisfiedLock>,
];

const positiveTypeProofs = [
  assertType<Equal<UnassignedVoiceTuple["length"], 3 | 4 | 5 | 6 | 7>>(),
  assertType<ThreeVoices extends UnassignedVoiceTuple ? true : false>(),
  assertType<SevenVoices extends UnassignedVoiceTuple ? true : false>(),
  assertType<Not<TwoVoices extends UnassignedVoiceTuple ? true : false>>(),
  assertType<Not<EightVoices extends UnassignedVoiceTuple ? true : false>>(),
  assertType<Equal<AssignedVoiceTuple["length"], 3 | 4 | 5 | 6 | 7>>(),
  assertType<Equal<VoiceRoleDegrees["length"],
    0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16
  >>(),
  assertType<SixteenDegrees extends VoiceRoleDegrees ? true : false>(),
  assertType<Not<SeventeenDegrees extends VoiceRoleDegrees ? true : false>>(),
  assertType<SevenLocks extends readonly VoiceLock[] ? true : false>(),
  assertType<EightLocks extends readonly VoiceLock[] ? true : false>(),
  assertType<Equal<VoiceArcs["length"],
    3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14
  >>(),
  assertType<ThreeArcs extends VoiceArcs ? true : false>(),
  assertType<FourteenArcs extends VoiceArcs ? true : false>(),
  assertType<Not<TwoArcs extends VoiceArcs ? true : false>>(),
  assertType<Not<FifteenArcs extends VoiceArcs ? true : false>>(),
  assertType<Equal<VoiceAssignmentOperationPath["length"], VoiceArcs["length"]>>(),
  assertType<Equal<InitializeSuccess["value"]["explanation"]["operationPath"], readonly []>>(),
  assertType<Equal<TransitionSuccess["value"]["explanation"]["operationPath"], VoiceAssignmentOperationPath>>(),
  assertType<Equal<InitializeInputFailure["evidence"]["termination"], "request-invalid">>(),
  assertType<Equal<InitializeWorkFailure["evidence"]["termination"], "work-limit-exceeded">>(),
  assertType<Equal<TransitionInputFailure["evidence"]["termination"], "request-invalid">>(),
  assertType<Equal<TransitionNoAssignmentFailure["evidence"]["termination"], "no-assignment">>(),
  assertType<Equal<TransitionWorkFailure["evidence"]["termination"], "work-limit-exceeded">>(),
  assertType<Not<HasKey<TransitionInputFailure, "value">>>(),
  assertType<Not<HasKey<TransitionNoAssignmentFailure, "value">>>(),
  assertType<Not<HasKey<TransitionWorkFailure, "value">>>(),
  assertType<Equal<EnteringVoiceArc["semitones"], null>>(),
  assertType<Equal<LeavingVoiceArc["semitones"], null>>(),
  assertType<Equal<MatchedVoiceArc["identityDisposition"], "propagated">>(),
  assertType<Equal<EnteringVoiceArc["identityDisposition"], "allocated">>(),
  assertType<Equal<LeavingVoiceArc["identityDisposition"], "retired">>(),
  assertType<Equal<VoiceAssignmentOrderKey["length"], 7>>(),
  assertType<Equal<
    VoiceAssignmentVoiceSerialInvalidRefusal["reason"],
    "non-integer" | "out-of-range"
  >>(),
  assertType<Equal<
    keyof VoiceAssignmentCost,
    | "alignmentCost"
    | "commonTonesLost"
    | "crowdedLowIntervals"
    | "doubledGuideTones"
    | "enteringVoices"
    | "exactSustains"
    | "gapCount"
    | "guideToneContinuities"
    | "guideTonesLost"
    | "leavingVoices"
    | "maximumAbsoluteLeap"
    | "omittedColors"
    | "pitchClassCommonTones"
    | "spelledPitchClassContinuities"
    | "spelledPitchContinuities"
    | "totalAbsoluteMotion"
    | "totalSpan"
  >>(),
  assertType<Equal<NegativeCompileProofs["length"], 16>>(),
] as const;

describe("V1 hardened type contract", () => {
  test("rejects impossible cardinality, arc, identity, lock, and termination states", () => {
    expect(positiveTypeProofs.every(Boolean)).toBe(true);
  });
});
