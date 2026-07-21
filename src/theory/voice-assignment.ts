import {
  projectSpelledPitch,
  type ChordDegree,
  type MidiPitch,
  type SpelledPitch,
} from "../domain";
import {
  MAX_VOICE_ASSIGNMENT_LOCKS,
  MAX_VOICE_ASSIGNMENT_NEXT_VOICE_SERIAL,
  MAX_VOICE_ASSIGNMENT_REQUEST_ID_ASCII_LENGTH,
  MAX_VOICE_ASSIGNMENT_ROLE_DEGREES,
  MAX_VOICE_ASSIGNMENT_ROLE_SOURCE_ID_CODE_POINTS,
  MAX_VOICE_ASSIGNMENT_ROLE_SOURCE_ID_UTF8_BYTES,
  MAX_VOICE_ASSIGNMENT_ROLE_SOURCE_VERSION,
  MAX_VOICE_ASSIGNMENT_VOICE_SERIAL,
  MAX_VOICE_ASSIGNMENT_VOICES,
  MIN_VOICE_ASSIGNMENT_ROLE_SOURCE_VERSION,
  MIN_VOICE_ASSIGNMENT_VOICES,
  VOICE_ASSIGNMENT_ARC_SCHEMA,
  VOICE_ASSIGNMENT_ENGINE_ID,
  VOICE_ASSIGNMENT_ENGINE_VERSION,
  VOICE_ASSIGNMENT_FRAME_SCHEMA,
  VOICE_ASSIGNMENT_GAP_COST,
  VOICE_ASSIGNMENT_LOCK_SCHEMA,
  VOICE_ASSIGNMENT_LOW_REGISTER_POLICY_ID,
  VOICE_ASSIGNMENT_LOW_REGISTER_POLICY_VERSION,
  VOICE_ASSIGNMENT_MEMORY_LIMITS,
  VOICE_ASSIGNMENT_POLICY_ID,
  VOICE_ASSIGNMENT_POLICY_VERSION,
  VOICE_ASSIGNMENT_REQUEST_ID_PATTERN_SOURCE,
  VOICE_ASSIGNMENT_REQUEST_SCHEMA,
  VOICE_ASSIGNMENT_RESULT_SCHEMA,
  VOICE_ASSIGNMENT_ROLE_POLICY_ID,
  VOICE_ASSIGNMENT_ROLE_POLICY_VERSION,
  VOICE_ASSIGNMENT_TIE_BREAK_POLICY_ID,
  VOICE_ASSIGNMENT_TIE_BREAK_POLICY_VERSION,
  VOICE_ASSIGNMENT_VOICE_ID_PATTERN_SOURCE,
  VOICE_ASSIGNMENT_WORK_LIMITS,
  VOICE_IDENTITY_POLICY_ID,
  VOICE_IDENTITY_POLICY_VERSION,
  type AssignVoiceTransition,
  type AssignVoiceTransitionRequest,
  type AssignVoiceTransitionResult,
  type AssignedVoice,
  type AssignedVoiceFrame,
  type AssignedVoiceTransition,
  type AssignedVoiceTuple,
  type EligibleVoiceLockEvidenceRecords,
  type InitializeVoiceFrame,
  type InitializeVoiceFrameRequest,
  type InitializeVoiceFrameResult,
  type UnassignedVoice,
  type UnassignedVoiceFrame,
  type VoiceArc,
  type VoiceArcs,
  type VoiceAssignmentCost,
  type VoiceAssignmentExplanation,
  type VoiceAssignmentFrameLabel,
  type VoiceAssignmentInputRefusal,
  type VoiceAssignmentLockInvalidRefusal,
  type VoiceAssignmentMemoryCounterName,
  type VoiceAssignmentNoAssignmentRefusal,
  type VoiceAssignmentOperationPath,
  type VoiceAssignmentOperationStep,
  type VoiceAssignmentOrderKey,
  type VoiceAssignmentTermination,
  type VoiceAssignmentWorkCounterName,
  type VoiceAssignmentWorkEvidence,
  type VoiceAssignmentWorkLimitRefusal,
  type VoiceLockValidationEvidence,
  type VoiceLockValidationEvidenceRecords,
  type EligibleVoiceLockEvidence,
  type SatisfiedVoiceLockEvidenceRecords,
  type VoiceMotionRelation,
  type VoiceMotionRelations,
  type VoiceRoleContext,
  type VoiceRoleDegrees,
} from "./voice-assignment-contract";
import { VOICING_CANDIDATE_IDS } from "./voicing-candidates-contract";
import { SEMANTIC_REALIZATION_IDS } from "./resolution-contract";
import {
  compareChordDegrees,
  deepFreezeOwned,
  lowRegisterSpacingViolations,
  sameChordDegree,
} from "./voicing-engine-primitives";

const EMPTY_PATH = Object.freeze([] as const);
const REQUEST_ID_PATTERN = new RegExp(
  VOICE_ASSIGNMENT_REQUEST_ID_PATTERN_SOURCE,
  "u",
);
const VOICE_ID_PATTERN = new RegExp(
  VOICE_ASSIGNMENT_VOICE_ID_PATTERN_SOURCE,
  "u",
);
const WORK_LIMIT = Symbol("voice-assignment-work-limit");

type MutableEvidence = {
  [Key in Exclude<
    keyof VoiceAssignmentWorkEvidence,
    "termination"
  >]: number;
} & { [WORK_LIMIT]: VoiceAssignmentWorkLimitRefusal | null };

/**
 * Package-private verifier observation for one synthetic accounting boundary.
 *
 * This type and its producer are deliberately absent from the Theory barrel.
 * The seam owns a fresh local ledger, exposes no override or callback, and
 * therefore cannot alter either public operation or any later request.
 */
export type VoiceAssignmentAccountingBoundaryObservation = Readonly<{
  counter: VoiceAssignmentWorkCounterName | VoiceAssignmentMemoryCounterName;
  counterKind: "work" | "memory";
  maximum: number;
  exactLimit: Readonly<{
    accepted: true;
    recorded: number;
  }>;
  exactPlusOne: Readonly<{
    accepted: false;
    recorded: number;
    refusal: VoiceAssignmentWorkLimitRefusal;
    evidence: VoiceAssignmentWorkEvidence &
      Readonly<{ termination: "work-limit-exceeded" }>;
  }>;
  firstProspectiveExcessWins: boolean;
}>;

function zeroEvidence(): MutableEvidence {
  return {
    sourceVoicesVisited: 0,
    targetVoicesVisited: 0,
    matrixCellsVisited: 0,
    transitionCandidatesEvaluated: 0,
    scoreComparisons: 0,
    backtraceSteps: 0,
    identityComparisons: 0,
    roleDegreesVisited: 0,
    roleMembershipComparisons: 0,
    roleOrderComparisons: 0,
    relationClassifications: 0,
    lockChecks: 0,
    voiceIdsAllocated: 0,
    arcsProduced: 0,
    peakInputVoiceRecords: 0,
    peakInputRoleDegreeRecords: 0,
    peakMatrixCellRecords: 0,
    peakPredecessorRecords: 0,
    peakScoreRecords: 0,
    peakPathStepRecords: 0,
    peakArcRecords: 0,
    peakArcEndpointRecords: 0,
    peakArcIdentityRecords: 0,
    peakOutputVoiceRecords: 0,
    peakOutputRoleDegreeRecords: 0,
    peakRelationRecords: 0,
    peakLockRecords: 0,
    peakLockEvidenceRecords: 0,
    peakTrackedRecords: 0,
    [WORK_LIMIT]: null,
  };
}

function finishEvidence<Termination extends VoiceAssignmentTermination>(
  evidence: MutableEvidence,
  termination: Termination,
): VoiceAssignmentWorkEvidence & Readonly<{ termination: Termination }> {
  const { [WORK_LIMIT]: ignoredLimit, ...publicEvidence } = evidence;
  void ignoredLimit;
  return Object.freeze({ ...publicEvidence, termination });
}

function workLimitRefusal(
  counter: VoiceAssignmentWorkCounterName | VoiceAssignmentMemoryCounterName,
  received: number,
  maximum: number,
): VoiceAssignmentWorkLimitRefusal {
  return Object.freeze({
    code: "limit.voice_assignment_work_exceeded",
    path: EMPTY_PATH,
    counter,
    received,
    maximum,
    partialResult: false,
  });
}

function addWork(
  evidence: MutableEvidence,
  counter: VoiceAssignmentWorkCounterName,
  amount = 1,
): VoiceAssignmentWorkLimitRefusal | null {
  if (evidence[WORK_LIMIT] !== null) return evidence[WORK_LIMIT];
  const received = evidence[counter] + amount;
  const maximum = VOICE_ASSIGNMENT_WORK_LIMITS[counter];
  if (received > maximum) {
    const refusal = workLimitRefusal(counter, received, maximum);
    evidence[WORK_LIMIT] = refusal;
    return refusal;
  }
  evidence[counter] = received;
  return null;
}

function observeMemory(
  evidence: MutableEvidence,
  counter: VoiceAssignmentMemoryCounterName,
  received: number,
): VoiceAssignmentWorkLimitRefusal | null {
  if (evidence[WORK_LIMIT] !== null) return evidence[WORK_LIMIT];
  const maximum = VOICE_ASSIGNMENT_MEMORY_LIMITS[counter];
  if (received > maximum) {
    const refusal = workLimitRefusal(counter, received, maximum);
    evidence[WORK_LIMIT] = refusal;
    return refusal;
  }
  if (received > evidence[counter]) evidence[counter] = received;
  return null;
}

function observeTrackedRecords(
  evidence: MutableEvidence,
): VoiceAssignmentWorkLimitRefusal | null {
  return observeMemory(
    evidence,
    "peakTrackedRecords",
    evidence.peakInputVoiceRecords +
      evidence.peakInputRoleDegreeRecords +
      evidence.peakMatrixCellRecords +
      evidence.peakPredecessorRecords +
      evidence.peakScoreRecords +
      evidence.peakPathStepRecords +
      evidence.peakArcRecords +
      evidence.peakArcEndpointRecords +
      evidence.peakArcIdentityRecords +
      evidence.peakOutputVoiceRecords +
      evidence.peakOutputRoleDegreeRecords +
      evidence.peakRelationRecords +
      evidence.peakLockRecords +
      evidence.peakLockEvidenceRecords,
  );
}

function isWorkCounterName(
  counter: VoiceAssignmentWorkCounterName | VoiceAssignmentMemoryCounterName,
): counter is VoiceAssignmentWorkCounterName {
  return Object.hasOwn(VOICE_ASSIGNMENT_WORK_LIMITS, counter);
}

function observeTrackedRecordMaximum(
  evidence: MutableEvidence,
): VoiceAssignmentWorkLimitRefusal | null {
  const populationMaxima = Object.freeze([
    Object.freeze([
      "peakInputVoiceRecords",
      VOICE_ASSIGNMENT_MEMORY_LIMITS.peakInputVoiceRecords,
    ] as const),
    Object.freeze([
      "peakInputRoleDegreeRecords",
      VOICE_ASSIGNMENT_MEMORY_LIMITS.peakInputRoleDegreeRecords,
    ] as const),
    Object.freeze([
      "peakMatrixCellRecords",
      VOICE_ASSIGNMENT_MEMORY_LIMITS.peakMatrixCellRecords,
    ] as const),
    Object.freeze([
      "peakPredecessorRecords",
      VOICE_ASSIGNMENT_MEMORY_LIMITS.peakPredecessorRecords,
    ] as const),
    Object.freeze([
      "peakScoreRecords",
      VOICE_ASSIGNMENT_MEMORY_LIMITS.peakScoreRecords,
    ] as const),
    Object.freeze([
      "peakPathStepRecords",
      VOICE_ASSIGNMENT_MEMORY_LIMITS.peakPathStepRecords,
    ] as const),
    Object.freeze([
      "peakArcRecords",
      VOICE_ASSIGNMENT_MEMORY_LIMITS.peakArcRecords,
    ] as const),
    Object.freeze([
      "peakArcEndpointRecords",
      VOICE_ASSIGNMENT_MEMORY_LIMITS.peakArcEndpointRecords,
    ] as const),
    Object.freeze([
      "peakArcIdentityRecords",
      VOICE_ASSIGNMENT_MEMORY_LIMITS.peakArcIdentityRecords,
    ] as const),
    Object.freeze([
      "peakOutputVoiceRecords",
      VOICE_ASSIGNMENT_MEMORY_LIMITS.peakOutputVoiceRecords,
    ] as const),
    Object.freeze([
      "peakOutputRoleDegreeRecords",
      VOICE_ASSIGNMENT_MEMORY_LIMITS.peakOutputRoleDegreeRecords,
    ] as const),
    Object.freeze([
      "peakRelationRecords",
      VOICE_ASSIGNMENT_MEMORY_LIMITS.peakRelationRecords,
    ] as const),
    Object.freeze([
      "peakLockRecords",
      VOICE_ASSIGNMENT_MEMORY_LIMITS.peakLockRecords,
    ] as const),
    Object.freeze([
      "peakLockEvidenceRecords",
      VOICE_ASSIGNMENT_MEMORY_LIMITS.peakLockEvidenceRecords,
    ] as const),
  ]);
  for (const [counter, maximum] of populationMaxima) {
    const refusal = observeMemory(evidence, counter, maximum);
    if (refusal !== null) return refusal;
  }
  return observeTrackedRecords(evidence);
}

function observeExactAccountingMaximum(
  evidence: MutableEvidence,
  counter: VoiceAssignmentWorkCounterName | VoiceAssignmentMemoryCounterName,
): VoiceAssignmentWorkLimitRefusal | null {
  if (isWorkCounterName(counter)) {
    return addWork(evidence, counter, VOICE_ASSIGNMENT_WORK_LIMITS[counter]);
  }
  if (counter === "peakTrackedRecords") {
    return observeTrackedRecordMaximum(evidence);
  }
  return observeMemory(evidence, counter, VOICE_ASSIGNMENT_MEMORY_LIMITS[counter]);
}

function observeAccountingPlusOne(
  evidence: MutableEvidence,
  counter: VoiceAssignmentWorkCounterName | VoiceAssignmentMemoryCounterName,
): VoiceAssignmentWorkLimitRefusal | null {
  if (isWorkCounterName(counter)) return addWork(evidence, counter);
  if (counter !== "peakTrackedRecords") {
    return observeMemory(
      evidence,
      counter,
      VOICE_ASSIGNMENT_MEMORY_LIMITS[counter] + 1,
    );
  }

  // The aggregate maximum equals the sum of every component maximum. The
  // verifier therefore presents one prospective, not-yet-accepted record
  // directly to the aggregate observer, then restores accepted evidence.
  evidence.peakLockEvidenceRecords += 1;
  const refusal = observeTrackedRecords(evidence);
  evidence.peakLockEvidenceRecords -= 1;
  return refusal;
}

/**
 * Exercise the identical accounting primitives at one otherwise unreachable
 * exact/+1 boundary. This is a package-private evidence seam, not a production
 * operation and not an injectable limit override.
 */
export function observeVoiceAssignmentAccountingBoundary(
  counter: VoiceAssignmentWorkCounterName | VoiceAssignmentMemoryCounterName,
): VoiceAssignmentAccountingBoundaryObservation {
  const evidence = zeroEvidence();
  const counterKind = isWorkCounterName(counter) ? "work" : "memory";
  const maximum = isWorkCounterName(counter)
    ? VOICE_ASSIGNMENT_WORK_LIMITS[counter]
    : VOICE_ASSIGNMENT_MEMORY_LIMITS[counter];
  const exactLimitRefusal = observeExactAccountingMaximum(evidence, counter);
  if (exactLimitRefusal !== null || evidence[counter] !== maximum) {
    throw new RangeError("V1 accounting seam could not reach its exact maximum");
  }

  const exactLimit = Object.freeze({
    accepted: true as const,
    recorded: evidence[counter],
  });
  const refusal = observeAccountingPlusOne(evidence, counter);
  if (refusal === null) {
    throw new RangeError("V1 accounting seam accepted an exact-plus-one unit");
  }

  const laterCounter = counter === "sourceVoicesVisited"
    ? "targetVoicesVisited"
    : "sourceVoicesVisited";
  const latchedRefusal = addWork(
    evidence,
    laterCounter,
    VOICE_ASSIGNMENT_WORK_LIMITS[laterCounter] + 1,
  );
  return Object.freeze({
    counter,
    counterKind,
    maximum,
    exactLimit,
    exactPlusOne: Object.freeze({
      accepted: false as const,
      recorded: evidence[counter],
      refusal,
      evidence: finishEvidence(evidence, "work-limit-exceeded"),
    }),
    firstProspectiveExcessWins: latchedRefusal === refusal,
  });
}

function copyDegree(degree: ChordDegree): ChordDegree {
  return Object.freeze({ number: degree.number, alter: degree.alter });
}

function copyPitch(pitch: SpelledPitch): SpelledPitch {
  return Object.freeze({
    step: pitch.step,
    alter: pitch.alter,
    octave: pitch.octave,
  });
}

function copyUnassignedVoice(voice: UnassignedVoice): UnassignedVoice {
  const pitch = copyPitch(voice.pitch);
  if (voice.provenance === "slash-bass") {
    return Object.freeze({
      ordinal: voice.ordinal,
      pitch,
      midi: voice.midi,
      provenance: "slash-bass",
      degree: null,
      sourceDegreeIndex: null,
      guideTone: voice.guideTone,
      colorTone: voice.colorTone,
    });
  }
  return Object.freeze({
    ordinal: voice.ordinal,
    pitch,
    midi: voice.midi,
    provenance: voice.provenance,
    degree: copyDegree(voice.degree),
    sourceDegreeIndex: voice.sourceDegreeIndex,
    guideTone: voice.guideTone,
    colorTone: voice.colorTone,
  });
}

function copyRoleContext(roles: VoiceRoleContext): VoiceRoleContext {
  const guideDegrees = Object.freeze(
    roles.guideDegrees.map(copyDegree),
  ) as VoiceRoleDegrees;
  const colorDegrees = Object.freeze(
    roles.colorDegrees.map(copyDegree),
  ) as VoiceRoleDegrees;
  return Object.freeze({
    policyId: roles.policyId,
    policyVersion: roles.policyVersion,
    sourceId: roles.sourceId,
    sourceVersion: roles.sourceVersion,
    candidateId: roles.candidateId,
    realizationId: roles.realizationId,
    guideDegrees,
    colorDegrees,
  });
}

/** Widen literal contract fields so runtime validation remains observable. */
function runtimeString(value: string): string {
  return value.slice(0);
}

function runtimeNumber(value: number): number {
  return value + 0;
}

function runtimeDegree(value: ChordDegree | null): ChordDegree | null {
  return value;
}

function runtimeSourceDegreeIndex(value: number | null): number | null {
  return value;
}

function isAscii(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined || codePoint > 0x7f) return false;
  }
  return true;
}

function required<Value>(values: readonly Value[], index: number): Value {
  const value = values[index];
  if (value === undefined) {
    throw new RangeError("validated voice-assignment tuple lost a member");
  }
  return value;
}

function assignedTuple(values: readonly AssignedVoice[]): AssignedVoiceTuple {
  switch (values.length) {
    case 3:
      return Object.freeze([
        required(values, 0),
        required(values, 1),
        required(values, 2),
      ]);
    case 4:
      return Object.freeze([
        required(values, 0),
        required(values, 1),
        required(values, 2),
        required(values, 3),
      ]);
    case 5:
      return Object.freeze([
        required(values, 0),
        required(values, 1),
        required(values, 2),
        required(values, 3),
        required(values, 4),
      ]);
    case 6:
      return Object.freeze([
        required(values, 0),
        required(values, 1),
        required(values, 2),
        required(values, 3),
        required(values, 4),
        required(values, 5),
      ]);
    case 7:
      return Object.freeze([
        required(values, 0),
        required(values, 1),
        required(values, 2),
        required(values, 3),
        required(values, 4),
        required(values, 5),
        required(values, 6),
      ]);
    default:
      throw new RangeError("validated voice count escaped its public bounds");
  }
}

function explanation<
  Path extends VoiceAssignmentOperationPath | readonly [],
>(operationPath: Path): VoiceAssignmentExplanation<Path> {
  return Object.freeze({
    engineId: VOICE_ASSIGNMENT_ENGINE_ID,
    engineVersion: VOICE_ASSIGNMENT_ENGINE_VERSION,
    policyId: VOICE_ASSIGNMENT_POLICY_ID,
    policyVersion: VOICE_ASSIGNMENT_POLICY_VERSION,
    identityPolicyId: VOICE_IDENTITY_POLICY_ID,
    identityPolicyVersion: VOICE_IDENTITY_POLICY_VERSION,
    tieBreakPolicyId: VOICE_ASSIGNMENT_TIE_BREAK_POLICY_ID,
    tieBreakPolicyVersion: VOICE_ASSIGNMENT_TIE_BREAK_POLICY_VERSION,
    rolePolicyId: VOICE_ASSIGNMENT_ROLE_POLICY_ID,
    rolePolicyVersion: VOICE_ASSIGNMENT_ROLE_POLICY_VERSION,
    lowRegisterPolicyId: VOICE_ASSIGNMENT_LOW_REGISTER_POLICY_ID,
    lowRegisterPolicyVersion: VOICE_ASSIGNMENT_LOW_REGISTER_POLICY_VERSION,
    noncrossingByConstruction: true,
    wallTimeAffectedSelection: false,
    operationPath,
  });
}

function requestIdRefusal(requestId: string): VoiceAssignmentInputRefusal | null {
  if (!isAscii(requestId)) {
    return Object.freeze({
      code: "voice_assignment.request_id_invalid",
      reason: "non-ascii",
      path: Object.freeze(["requestId"] as const),
      received: requestId,
      minimumAsciiLength: 1,
      maximumAsciiLength: MAX_VOICE_ASSIGNMENT_REQUEST_ID_ASCII_LENGTH,
      pattern: VOICE_ASSIGNMENT_REQUEST_ID_PATTERN_SOURCE,
    });
  }
  if (
    requestId.length < 1 ||
    requestId.length > MAX_VOICE_ASSIGNMENT_REQUEST_ID_ASCII_LENGTH
  ) {
    return Object.freeze({
      code: "voice_assignment.request_id_invalid",
      reason: "length-out-of-range",
      path: Object.freeze(["requestId"] as const),
      received: requestId,
      minimumAsciiLength: 1,
      maximumAsciiLength: MAX_VOICE_ASSIGNMENT_REQUEST_ID_ASCII_LENGTH,
      pattern: VOICE_ASSIGNMENT_REQUEST_ID_PATTERN_SOURCE,
    });
  }
  if (!REQUEST_ID_PATTERN.test(requestId)) {
    return Object.freeze({
      code: "voice_assignment.request_id_invalid",
      reason: "pattern-mismatch",
      path: Object.freeze(["requestId"] as const),
      received: requestId,
      minimumAsciiLength: 1,
      maximumAsciiLength: MAX_VOICE_ASSIGNMENT_REQUEST_ID_ASCII_LENGTH,
      pattern: VOICE_ASSIGNMENT_REQUEST_ID_PATTERN_SOURCE,
    });
  }
  return null;
}

function voiceCountRefusal(
  frame: VoiceAssignmentFrameLabel,
  voices: readonly UnassignedVoice[],
): VoiceAssignmentInputRefusal | null {
  if (
    voices.length < MIN_VOICE_ASSIGNMENT_VOICES ||
    voices.length > MAX_VOICE_ASSIGNMENT_VOICES
  ) {
    return Object.freeze({
      code: "voice_assignment.voice_count_invalid",
      path: EMPTY_PATH,
      frame,
      received: voices.length,
      minimum: MIN_VOICE_ASSIGNMENT_VOICES,
      maximum: MAX_VOICE_ASSIGNMENT_VOICES,
    });
  }
  return null;
}

function ordinalRefusal(
  frame: VoiceAssignmentFrameLabel,
  voices: readonly UnassignedVoice[],
): VoiceAssignmentInputRefusal | null {
  for (let index = 0; index < voices.length; index += 1) {
    const voice = required(voices, index);
    if (!Number.isSafeInteger(voice.ordinal)) {
      return Object.freeze({
        code: "voice_assignment.voice_ordinal_invalid",
        path: EMPTY_PATH,
        reason: "non-integer",
        frame,
        voiceIndex: index,
        received: voice.ordinal,
        expected: index,
      });
    }
    if (voice.ordinal !== index) {
      return Object.freeze({
        code: "voice_assignment.voice_ordinal_invalid",
        path: EMPTY_PATH,
        reason: "noncontiguous",
        frame,
        voiceIndex: index,
        received: voice.ordinal,
        expected: index,
      });
    }
  }
  return null;
}

function orderRefusal(
  frame: VoiceAssignmentFrameLabel,
  voices: readonly UnassignedVoice[],
): VoiceAssignmentInputRefusal | null {
  for (let index = 1; index < voices.length; index += 1) {
    const lower = required(voices, index - 1);
    const upper = required(voices, index);
    if (lower.midi > upper.midi) {
      return Object.freeze({
        code: "voice_assignment.voice_order_invalid",
        path: EMPTY_PATH,
        reason: "descending-midi",
        frame,
        lowerOrdinal: index - 1,
        upperOrdinal: index,
        lowerMidi: lower.midi,
        upperMidi: upper.midi,
      });
    }
  }
  return null;
}

function duplicateMidiRefusal(
  frame: VoiceAssignmentFrameLabel,
  voices: readonly UnassignedVoice[],
): VoiceAssignmentInputRefusal | null {
  for (let first = 0; first < voices.length; first += 1) {
    for (let second = first + 1; second < voices.length; second += 1) {
      const left = required(voices, first);
      const right = required(voices, second);
      if (left.midi === right.midi) {
        return Object.freeze({
          code: "voice_assignment.duplicate_midi",
          path: EMPTY_PATH,
          frame,
          firstOrdinal: first,
          secondOrdinal: second,
          midi: left.midi,
        });
      }
    }
  }
  return null;
}

function pitchRefusal(
  frame: VoiceAssignmentFrameLabel,
  voices: readonly UnassignedVoice[],
): VoiceAssignmentInputRefusal | null {
  for (let index = 0; index < voices.length; index += 1) {
    const voice = required(voices, index);
    const projection = projectSpelledPitch(voice.pitch);
    const expected = projection.ok
      ? projection.value.midi
      : projection.refusal.projectedMidi;
    if (!projection.ok || expected !== voice.midi) {
      return Object.freeze({
        code: "voice_assignment.pitch_midi_mismatch",
        path: EMPTY_PATH,
        frame,
        voiceOrdinal: index,
        pitch: copyPitch(voice.pitch),
        received: voice.midi,
        expected,
      });
    }
  }
  return null;
}

function provenanceRefusal(
  frame: VoiceAssignmentFrameLabel,
  voices: readonly UnassignedVoice[],
): VoiceAssignmentInputRefusal | null {
  for (let index = 0; index < voices.length; index += 1) {
    const voice = required(voices, index);
    const degree = runtimeDegree(voice.degree);
    const sourceDegreeIndex = runtimeSourceDegreeIndex(voice.sourceDegreeIndex);
    if (voice.provenance === "realization") {
      if (degree === null) {
        return Object.freeze({
          code: "voice_assignment.provenance_invalid",
          path: EMPTY_PATH,
          reason: "realization-degree-missing",
          frame,
          voiceOrdinal: index,
        });
      }
      if (sourceDegreeIndex === null) {
        return Object.freeze({
          code: "voice_assignment.provenance_invalid",
          path: EMPTY_PATH,
          reason: "realization-source-index-missing",
          frame,
          voiceOrdinal: index,
        });
      }
    } else if (voice.provenance === "doubling") {
      if (degree === null) {
        return Object.freeze({
          code: "voice_assignment.provenance_invalid",
          path: EMPTY_PATH,
          reason: "doubling-degree-missing",
          frame,
          voiceOrdinal: index,
        });
      }
      if (sourceDegreeIndex === null) {
        return Object.freeze({
          code: "voice_assignment.provenance_invalid",
          path: EMPTY_PATH,
          reason: "doubling-source-index-missing",
          frame,
          voiceOrdinal: index,
        });
      }
    } else {
      if (degree !== null) {
        return Object.freeze({
          code: "voice_assignment.provenance_invalid",
          path: EMPTY_PATH,
          reason: "slash-bass-degree-fabricated",
          frame,
          voiceOrdinal: index,
        });
      }
      if (sourceDegreeIndex !== null) {
        return Object.freeze({
          code: "voice_assignment.provenance_invalid",
          path: EMPTY_PATH,
          reason: "slash-bass-source-index-fabricated",
          frame,
          voiceOrdinal: index,
        });
      }
    }
  }
  return null;
}

type MutableTargetRoleCostFacts = {
  doubledGuideTones: number;
  omittedColors: number;
};

function emptyTargetRoleCostFacts(): MutableTargetRoleCostFacts {
  return { doubledGuideTones: 0, omittedColors: 0 };
}

function roleMembershipOrdinal(
  degree: ChordDegree,
  values: readonly ChordDegree[],
  evidence: MutableEvidence,
): number | null {
  let found: number | null = null;
  for (let index = 0; index < values.length; index += 1) {
    addWork(evidence, "roleMembershipComparisons");
    if (sameChordDegree(degree, required(values, index))) found = index;
  }
  return found;
}

function membershipBitIsSet(mask: number, ordinal: number): boolean {
  const bit = 2 ** ordinal;
  return Math.floor(mask / bit) % 2 === 1;
}

function membershipBitCount(mask: number): number {
  let count = 0;
  let remaining = mask;
  while (remaining > 0) {
    count += remaining % 2;
    remaining = Math.floor(remaining / 2);
  }
  return count;
}

function roleContextRefusal(
  frame: VoiceAssignmentFrameLabel,
  frameValue: UnassignedVoiceFrame | AssignedVoiceFrame,
  evidence: MutableEvidence,
  targetCostFacts: MutableTargetRoleCostFacts | null,
): VoiceAssignmentInputRefusal | null {
  const { roles, voices } = frameValue;
  let guidePresenceMask = 0;
  let colorPresenceMask = 0;
  let doubledGuideTones = 0;
  const groups = Object.freeze([
    Object.freeze({ role: "guide" as const, values: roles.guideDegrees }),
    Object.freeze({ role: "color" as const, values: roles.colorDegrees }),
  ]);
  for (const group of groups) {
    if (group.values.length > MAX_VOICE_ASSIGNMENT_ROLE_DEGREES) {
      return Object.freeze({
        code: "voice_assignment.role_context_invalid",
        path: EMPTY_PATH,
        reason: "degree-count-exceeded",
        frame,
        role: group.role,
        degreeOrdinal: null,
        voiceOrdinal: null,
      });
    }
    for (let index = 1; index < group.values.length; index += 1) {
      addWork(evidence, "roleOrderComparisons");
      const comparison = compareChordDegrees(
        required(group.values, index - 1),
        required(group.values, index),
      );
      if (comparison > 0) {
        return Object.freeze({
          code: "voice_assignment.role_context_invalid",
          path: EMPTY_PATH,
          reason: "degree-order-invalid",
          frame,
          role: group.role,
          degreeOrdinal: index,
          voiceOrdinal: null,
        });
      }
      if (comparison === 0) {
        return Object.freeze({
          code: "voice_assignment.role_context_invalid",
          path: EMPTY_PATH,
          reason: "degree-duplicate",
          frame,
          role: group.role,
          degreeOrdinal: index,
          voiceOrdinal: null,
        });
      }
    }
  }
  if (runtimeString(roles.policyId) !== VOICE_ASSIGNMENT_ROLE_POLICY_ID) {
    return Object.freeze({
      code: "voice_assignment.role_context_invalid",
      path: EMPTY_PATH,
      reason: "role-policy-id-mismatch",
      frame,
      role: null,
      degreeOrdinal: null,
      voiceOrdinal: null,
    });
  }
  if (runtimeNumber(roles.policyVersion) !== VOICE_ASSIGNMENT_ROLE_POLICY_VERSION) {
    return Object.freeze({
      code: "voice_assignment.role_context_invalid",
      path: EMPTY_PATH,
      reason: "role-policy-version-mismatch",
      frame,
      role: null,
      degreeOrdinal: null,
      voiceOrdinal: null,
    });
  }
  const sourceCodePoints = Array.from(roles.sourceId).length;
  const sourceBytes = new TextEncoder().encode(roles.sourceId).byteLength;
  if (
    sourceCodePoints < 1 ||
    sourceCodePoints > MAX_VOICE_ASSIGNMENT_ROLE_SOURCE_ID_CODE_POINTS ||
    sourceBytes > MAX_VOICE_ASSIGNMENT_ROLE_SOURCE_ID_UTF8_BYTES
  ) {
    return Object.freeze({
      code: "voice_assignment.role_context_invalid",
      path: EMPTY_PATH,
      reason: "role-source-id-invalid",
      frame,
      role: null,
      degreeOrdinal: null,
      voiceOrdinal: null,
    });
  }
  if (
    !Number.isSafeInteger(roles.sourceVersion) ||
    roles.sourceVersion < MIN_VOICE_ASSIGNMENT_ROLE_SOURCE_VERSION ||
    roles.sourceVersion > MAX_VOICE_ASSIGNMENT_ROLE_SOURCE_VERSION
  ) {
    return Object.freeze({
      code: "voice_assignment.role_context_invalid",
      path: EMPTY_PATH,
      reason: "role-source-version-invalid",
      frame,
      role: null,
      degreeOrdinal: null,
      voiceOrdinal: null,
    });
  }
  if (!(VOICING_CANDIDATE_IDS as readonly string[]).includes(roles.candidateId)) {
    return Object.freeze({
      code: "voice_assignment.role_context_invalid",
      path: EMPTY_PATH,
      reason: "candidate-id-invalid",
      frame,
      role: null,
      degreeOrdinal: null,
      voiceOrdinal: null,
    });
  }
  if (!(SEMANTIC_REALIZATION_IDS as readonly string[]).includes(roles.realizationId)) {
    return Object.freeze({
      code: "voice_assignment.role_context_invalid",
      path: EMPTY_PATH,
      reason: "realization-id-invalid",
      frame,
      role: null,
      degreeOrdinal: null,
      voiceOrdinal: null,
    });
  }
  for (let index = 0; index < voices.length; index += 1) {
    const voice = required(voices, index);
    if (voice.degree === null) {
      if (voice.guideTone || voice.colorTone) {
        return Object.freeze({
          code: "voice_assignment.role_context_invalid",
          path: EMPTY_PATH,
          reason: "null-degree-role",
          frame,
          role: voice.guideTone ? "guide" : "color",
          degreeOrdinal: null,
          voiceOrdinal: index,
        });
      }
      continue;
    }
    const guideOrdinal = roleMembershipOrdinal(
      voice.degree,
      roles.guideDegrees,
      evidence,
    );
    const colorOrdinal = roleMembershipOrdinal(
      voice.degree,
      roles.colorDegrees,
      evidence,
    );
    if (voice.guideTone !== (guideOrdinal !== null)) {
      return Object.freeze({
        code: "voice_assignment.role_context_invalid",
        path: EMPTY_PATH,
        reason: "guide-flag-mismatch",
        frame,
        role: "guide",
        degreeOrdinal: null,
        voiceOrdinal: index,
      });
    }
    if (voice.colorTone !== (colorOrdinal !== null)) {
      return Object.freeze({
        code: "voice_assignment.role_context_invalid",
        path: EMPTY_PATH,
        reason: "color-flag-mismatch",
        frame,
        role: "color",
        degreeOrdinal: null,
        voiceOrdinal: index,
      });
    }
    if (guideOrdinal !== null) {
      if (membershipBitIsSet(guidePresenceMask, guideOrdinal)) {
        doubledGuideTones += 1;
      } else {
        guidePresenceMask += 2 ** guideOrdinal;
      }
    }
    if (
      colorOrdinal !== null &&
      !membershipBitIsSet(colorPresenceMask, colorOrdinal)
    ) {
      colorPresenceMask += 2 ** colorOrdinal;
    }
  }
  if (targetCostFacts !== null) {
    targetCostFacts.doubledGuideTones = doubledGuideTones;
    targetCostFacts.omittedColors =
      roles.colorDegrees.length - membershipBitCount(colorPresenceMask);
  }
  return null;
}

function initializeValidation(
  request: InitializeVoiceFrameRequest,
  evidence: MutableEvidence,
): VoiceAssignmentInputRefusal | null {
  if (runtimeString(request.schema) !== VOICE_ASSIGNMENT_REQUEST_SCHEMA) {
    return Object.freeze({
      code: "voice_assignment.schema_invalid",
      reason: "request-schema-mismatch",
      path: Object.freeze(["schema"] as const),
      received: request.schema,
      expected: VOICE_ASSIGNMENT_REQUEST_SCHEMA,
    });
  }
  if (runtimeString(request.frame.schema) !== VOICE_ASSIGNMENT_FRAME_SCHEMA) {
    return Object.freeze({
      code: "voice_assignment.schema_invalid",
      reason: "frame-schema-mismatch",
      path: Object.freeze(["frame", "schema"] as const),
      received: request.frame.schema,
      expected: VOICE_ASSIGNMENT_FRAME_SCHEMA,
    });
  }
  return (
    requestIdRefusal(request.requestId) ??
    voiceCountRefusal("initial", request.frame.voices) ??
    ordinalRefusal("initial", request.frame.voices) ??
    orderRefusal("initial", request.frame.voices) ??
    duplicateMidiRefusal("initial", request.frame.voices) ??
    pitchRefusal("initial", request.frame.voices) ??
    provenanceRefusal("initial", request.frame.voices) ??
    roleContextRefusal("initial", request.frame, evidence, null)
  );
}

function transitionSchemaRefusal(
  request: AssignVoiceTransitionRequest,
): VoiceAssignmentInputRefusal | null {
  if (runtimeString(request.schema) !== VOICE_ASSIGNMENT_REQUEST_SCHEMA) {
    return Object.freeze({
      code: "voice_assignment.schema_invalid",
      reason: "request-schema-mismatch",
      path: Object.freeze(["schema"] as const),
      received: request.schema,
      expected: VOICE_ASSIGNMENT_REQUEST_SCHEMA,
    });
  }
  if (runtimeString(request.from.schema) !== VOICE_ASSIGNMENT_FRAME_SCHEMA) {
    return Object.freeze({
      code: "voice_assignment.schema_invalid",
      reason: "frame-schema-mismatch",
      path: Object.freeze(["from", "schema"] as const),
      received: request.from.schema,
      expected: VOICE_ASSIGNMENT_FRAME_SCHEMA,
    });
  }
  if (runtimeString(request.to.schema) !== VOICE_ASSIGNMENT_FRAME_SCHEMA) {
    return Object.freeze({
      code: "voice_assignment.schema_invalid",
      reason: "frame-schema-mismatch",
      path: Object.freeze(["to", "schema"] as const),
      received: request.to.schema,
      expected: VOICE_ASSIGNMENT_FRAME_SCHEMA,
    });
  }
  for (let index = 0; index < request.locks.length; index += 1) {
    const lock = required(request.locks, index);
    if (runtimeString(lock.schema) !== VOICE_ASSIGNMENT_LOCK_SCHEMA) {
      return Object.freeze({
        code: "voice_assignment.schema_invalid",
        reason: "lock-schema-mismatch",
        path: Object.freeze(["locks", index, "schema"] as const),
        received: lock.schema,
        expected: VOICE_ASSIGNMENT_LOCK_SCHEMA,
      });
    }
  }
  return null;
}

function transitionPolicyRefusal(
  request: AssignVoiceTransitionRequest,
): VoiceAssignmentInputRefusal | null {
  if (runtimeString(request.policyId) !== VOICE_ASSIGNMENT_POLICY_ID) {
    return Object.freeze({
      code: "voice_assignment.policy_invalid",
      reason: "policy-id-mismatch",
      path: Object.freeze(["policyId"] as const),
      received: request.policyId,
      expected: VOICE_ASSIGNMENT_POLICY_ID,
    });
  }
  if (runtimeNumber(request.policyVersion) !== VOICE_ASSIGNMENT_POLICY_VERSION) {
    return Object.freeze({
      code: "voice_assignment.policy_invalid",
      reason: "policy-version-mismatch",
      path: Object.freeze(["policyVersion"] as const),
      received: request.policyVersion,
      expected: VOICE_ASSIGNMENT_POLICY_VERSION,
    });
  }
  return null;
}

function sourceVoiceIdRefusal(
  voices: readonly AssignedVoice[],
): VoiceAssignmentInputRefusal | null {
  for (let index = 0; index < voices.length; index += 1) {
    const voice = required(voices, index);
    if (!VOICE_ID_PATTERN.test(voice.voiceId)) {
      return Object.freeze({
        code: "voice_assignment.voice_id_invalid",
        reason: "format-invalid",
        path: EMPTY_PATH,
        frame: "source",
        voiceOrdinal: index,
        received: voice.voiceId,
        expectedSerial: voice.voiceSerial,
        pattern: VOICE_ASSIGNMENT_VOICE_ID_PATTERN_SOURCE,
      });
    }
    if (
      Number.isSafeInteger(voice.voiceSerial) &&
      voice.voiceSerial >= 0 &&
      voice.voiceSerial <= MAX_VOICE_ASSIGNMENT_VOICE_SERIAL &&
      voice.voiceId !==
        `voice-${voice.voiceSerial.toString().padStart(4, "0")}`
    ) {
      return Object.freeze({
        code: "voice_assignment.voice_id_invalid",
        reason: "serial-digits-mismatch",
        path: EMPTY_PATH,
        frame: "source",
        voiceOrdinal: index,
        received: voice.voiceId,
        expectedSerial: voice.voiceSerial,
        pattern: VOICE_ASSIGNMENT_VOICE_ID_PATTERN_SOURCE,
      });
    }
  }
  return null;
}

function duplicateVoiceIdRefusal(
  voices: readonly AssignedVoice[],
): VoiceAssignmentInputRefusal | null {
  for (let first = 0; first < voices.length; first += 1) {
    for (let second = first + 1; second < voices.length; second += 1) {
      const left = required(voices, first);
      const right = required(voices, second);
      if (left.voiceId === right.voiceId) {
        return Object.freeze({
          code: "voice_assignment.voice_id_duplicate",
          path: EMPTY_PATH,
          frame: "source",
          firstOrdinal: first,
          secondOrdinal: second,
          voiceId: left.voiceId,
        });
      }
    }
  }
  return null;
}

function voiceSerialRefusal(
  voices: readonly AssignedVoice[],
): VoiceAssignmentInputRefusal | null {
  for (let index = 0; index < voices.length; index += 1) {
    const voice = required(voices, index);
    if (!Number.isSafeInteger(voice.voiceSerial)) {
      return Object.freeze({
        code: "voice_assignment.voice_serial_invalid",
        reason: "non-integer",
        path: EMPTY_PATH,
        frame: "source",
        voiceOrdinal: index,
        received: voice.voiceSerial,
        minimum: 0,
        maximum: MAX_VOICE_ASSIGNMENT_VOICE_SERIAL,
      });
    }
    if (
      voice.voiceSerial < 0 ||
      voice.voiceSerial > MAX_VOICE_ASSIGNMENT_VOICE_SERIAL
    ) {
      return Object.freeze({
        code: "voice_assignment.voice_serial_invalid",
        reason: "out-of-range",
        path: EMPTY_PATH,
        frame: "source",
        voiceOrdinal: index,
        received: voice.voiceSerial,
        minimum: 0,
        maximum: MAX_VOICE_ASSIGNMENT_VOICE_SERIAL,
      });
    }
  }
  return null;
}

function nextVoiceSerialRefusal(
  frame: AssignedVoiceFrame,
): VoiceAssignmentInputRefusal | null {
  const next = frame.nextVoiceSerial;
  if (!Number.isSafeInteger(next)) {
    return Object.freeze({
      code: "voice_assignment.next_voice_serial_invalid",
      reason: "non-integer",
      path: Object.freeze(["from", "nextVoiceSerial"] as const),
      received: next,
      minimum: 0,
      maximum: MAX_VOICE_ASSIGNMENT_NEXT_VOICE_SERIAL,
    });
  }
  if (next < 0 || next > MAX_VOICE_ASSIGNMENT_NEXT_VOICE_SERIAL) {
    return Object.freeze({
      code: "voice_assignment.next_voice_serial_invalid",
      reason: "out-of-range",
      path: Object.freeze(["from", "nextVoiceSerial"] as const),
      received: next,
      minimum: 0,
      maximum: MAX_VOICE_ASSIGNMENT_NEXT_VOICE_SERIAL,
    });
  }
  if (frame.voices.some(({ voiceSerial }) => voiceSerial >= next)) {
    return Object.freeze({
      code: "voice_assignment.next_voice_serial_invalid",
      reason: "not-above-assigned-serial",
      path: Object.freeze(["from", "nextVoiceSerial"] as const),
      received: next,
      minimum: 0,
      maximum: MAX_VOICE_ASSIGNMENT_NEXT_VOICE_SERIAL,
    });
  }
  return null;
}

function transitionValidation(
  request: AssignVoiceTransitionRequest,
  evidence: MutableEvidence,
  targetRoleCostFacts: MutableTargetRoleCostFacts,
): VoiceAssignmentInputRefusal | null {
  const source = request.from.voices;
  const target = request.to.voices;
  const schema = transitionSchemaRefusal(request);
  if (schema !== null) return schema;
  const policy = transitionPolicyRefusal(request);
  if (policy !== null) return policy;
  const requestId = requestIdRefusal(request.requestId);
  if (requestId !== null) return requestId;
  if (request.from.eventId === request.to.eventId) {
    return Object.freeze({
      code: "voice_assignment.event_identity_invalid",
      reason: "source-and-target-event-equal",
      path: Object.freeze(["to", "eventId"] as const),
      eventId: request.to.eventId,
    });
  }
  const frameChecks = [
    () => voiceCountRefusal("source", source),
    () => voiceCountRefusal("target", target),
    () => ordinalRefusal("source", source),
    () => ordinalRefusal("target", target),
    () => orderRefusal("source", source),
    () => orderRefusal("target", target),
    () => duplicateMidiRefusal("source", source),
    () => duplicateMidiRefusal("target", target),
    () => pitchRefusal("source", source),
    () => pitchRefusal("target", target),
    () => provenanceRefusal("source", source),
    () => provenanceRefusal("target", target),
    () => roleContextRefusal("source", request.from, evidence, null),
    () => roleContextRefusal(
      "target",
      request.to,
      evidence,
      targetRoleCostFacts,
    ),
  ];
  for (const check of frameChecks) {
    const refusal = check();
    if (refusal !== null) return refusal;
  }
  if (request.from.requestId !== request.requestId) {
    return Object.freeze({
      code: "voice_assignment.source_request_mismatch",
      path: Object.freeze(["from", "requestId"] as const),
      received: request.from.requestId,
      expected: request.requestId,
    });
  }
  const sourceIdentityChecks = [
    () => sourceVoiceIdRefusal(source),
    () => duplicateVoiceIdRefusal(source),
    () => voiceSerialRefusal(source),
    () => nextVoiceSerialRefusal(request.from),
  ];
  for (const check of sourceIdentityChecks) {
    const refusal = check();
    if (refusal !== null) return refusal;
  }
  if (request.locks.length > MAX_VOICE_ASSIGNMENT_LOCKS) {
    return Object.freeze({
      code: "voice_assignment.lock_limit_exceeded",
      path: Object.freeze(["locks"] as const),
      received: request.locks.length,
      maximum: MAX_VOICE_ASSIGNMENT_LOCKS,
    });
  }
  return null;
}

function samePitch(left: SpelledPitch, right: SpelledPitch): boolean {
  return (
    left.step === right.step &&
    left.alter === right.alter &&
    left.octave === right.octave
  );
}

function sameNullableDegree(
  left: ChordDegree | null,
  right: ChordDegree | null,
): boolean {
  return (
    (left === null && right === null) ||
    (left !== null && right !== null && sameChordDegree(left, right))
  );
}

type MutableEligibleLockEvidence = {
  lockOrdinal: number;
  voiceId: string;
  status: "eligible" | "satisfied";
  matchedTargetOrdinal: number;
};

type InternalVoiceLockEvidence =
  | Exclude<VoiceLockValidationEvidence, EligibleVoiceLockEvidence>
  | MutableEligibleLockEvidence;

type LockValidation = Readonly<{
  evidence: readonly InternalVoiceLockEvidence[];
  eligible: readonly MutableEligibleLockEvidence[];
  eligibleSourceOrdinals: number;
  refusal: VoiceAssignmentLockInvalidRefusal | null;
}>;

function validateLocks(
  request: AssignVoiceTransitionRequest,
  work: MutableEvidence,
): LockValidation {
  const evidence: InternalVoiceLockEvidence[] = [];
  const eligible: MutableEligibleLockEvidence[] = [];
  let eligibleSourceOrdinals = 0;
  let firstInvalid: VoiceAssignmentLockInvalidRefusal | null = null;
  for (let lockOrdinal = 0; lockOrdinal < request.locks.length; lockOrdinal += 1) {
    addWork(work, "lockChecks");
    const lock = required(request.locks, lockOrdinal);
    const base = { lockOrdinal, voiceId: lock.voiceId };
    let record: InternalVoiceLockEvidence;
    let reason: VoiceAssignmentLockInvalidRefusal["reason"] | null = null;
    if (lock.requestId !== request.requestId) {
      reason = "stale-request";
      record = Object.freeze({ ...base, status: reason, matchedTargetOrdinal: null });
    } else if (lock.eventId !== request.to.eventId) {
      reason = "stale-event";
      record = Object.freeze({ ...base, status: reason, matchedTargetOrdinal: null });
    } else {
      const sourceOrdinal = request.from.voices.findIndex(
        ({ voiceId }) => voiceId === lock.voiceId,
      );
      if (sourceOrdinal < 0) {
        reason = "source-voice-missing";
        record = Object.freeze({ ...base, status: reason, matchedTargetOrdinal: null });
      } else {
        const pitchOrdinal = request.to.voices.findIndex(({ pitch }) =>
          samePitch(pitch, lock.pitch),
        );
        if (pitchOrdinal < 0) {
          reason = "target-pitch-missing";
          record = Object.freeze({ ...base, status: reason, matchedTargetOrdinal: null });
        } else {
          const targetOrdinal = request.to.voices.findIndex(
            (voice) =>
              samePitch(voice.pitch, lock.pitch) &&
              sameNullableDegree(voice.degree, lock.degree),
          );
          if (targetOrdinal < 0) {
            reason = "target-degree-mismatch";
            record = Object.freeze({
              ...base,
              status: reason,
              matchedTargetOrdinal: pitchOrdinal,
            });
          } else {
            record = {
              ...base,
              status: "eligible" as const,
              matchedTargetOrdinal: targetOrdinal,
            };
            eligibleSourceOrdinals += sourceOrdinal * 8 ** eligible.length;
            eligible.push(record);
          }
        }
      }
    }
    evidence.push(record);
    if (reason !== null && firstInvalid === null) {
      firstInvalid = Object.freeze({
        code: "voice_assignment.lock_invalid",
        reason,
        path: Object.freeze(["locks", lockOrdinal] as const),
        lockOrdinal,
      });
    }
  }
  if (firstInvalid === null) {
    for (let current = 0; current < request.locks.length; current += 1) {
      const lock = required(request.locks, current);
      for (let previous = 0; previous < current; previous += 1) {
        const other = required(request.locks, previous);
        if (
          lock.requestId === other.requestId &&
          lock.eventId === other.eventId &&
          lock.voiceId === other.voiceId &&
          samePitch(lock.pitch, other.pitch) &&
          sameNullableDegree(lock.degree, other.degree)
        ) {
          firstInvalid = Object.freeze({
            code: "voice_assignment.lock_invalid",
            reason: "duplicate-lock",
            path: Object.freeze(["locks", current] as const),
            lockOrdinal: current,
          });
          break;
        }
      }
      if (firstInvalid !== null) break;
    }
  }
  return Object.freeze({
    evidence: Object.freeze(evidence),
    eligible: Object.freeze(eligible),
    eligibleSourceOrdinals,
    refusal: firstInvalid,
  });
}

export const initializeVoiceFrame: InitializeVoiceFrame = (request) => {
  const evidence = zeroEvidence();
  const refusal = initializeValidation(request, evidence);
  if (refusal !== null) {
    return deepFreezeOwned({
      ok: false,
      refusal,
      evidence: finishEvidence(evidence, "request-invalid"),
    });
  }

  const voices = request.frame.voices.map((voice, voiceSerial) => {
    addWork(evidence, "sourceVoicesVisited");
    addWork(evidence, "voiceIdsAllocated");
    return Object.freeze({
      ...copyUnassignedVoice(voice),
      voiceId: `voice-${voiceSerial.toString().padStart(4, "0")}`,
      voiceSerial,
    });
  });
  const roleDegreeCount =
    request.frame.roles.guideDegrees.length +
    request.frame.roles.colorDegrees.length;
  addWork(evidence, "roleDegreesVisited", roleDegreeCount);
  observeMemory(evidence, "peakInputVoiceRecords", request.frame.voices.length);
  observeMemory(evidence, "peakInputRoleDegreeRecords", roleDegreeCount);
  observeMemory(evidence, "peakOutputVoiceRecords", voices.length);
  observeMemory(evidence, "peakOutputRoleDegreeRecords", roleDegreeCount);
  observeMemory(
    evidence,
    "peakTrackedRecords",
    request.frame.voices.length + roleDegreeCount + voices.length + roleDegreeCount,
  );
  if (evidence[WORK_LIMIT] !== null) {
    const result: InitializeVoiceFrameResult = Object.freeze({
      ok: false,
      refusal: evidence[WORK_LIMIT],
      evidence: finishEvidence(evidence, "work-limit-exceeded"),
    });
    return deepFreezeOwned(result);
  }

  const frame: AssignedVoiceFrame = Object.freeze({
    schema: VOICE_ASSIGNMENT_FRAME_SCHEMA,
    kind: "assigned",
    requestId: request.requestId,
    eventId: request.frame.eventId,
    roles: copyRoleContext(request.frame.roles),
    voices: assignedTuple(voices),
    nextVoiceSerial: voices.length,
  });
  return deepFreezeOwned({
    ok: true,
    value: {
      schema: VOICE_ASSIGNMENT_RESULT_SCHEMA,
      kind: "initialized",
      frame,
      explanation: explanation(EMPTY_PATH),
    },
    evidence: finishEvidence(evidence, "complete-initialized"),
  });
};

type AlignmentScore = Readonly<{
  alignmentCost: number;
  commonTonesLost: number;
  guideTonesLost: number;
  gapCount: number;
  negativeExactSustains: number;
  negativeSpelledPitchContinuities: number;
}>;

type OriginCell = AlignmentScore &
  Readonly<{
    pathLength: 0;
    predecessor: null;
    step: null;
  }>;

type PathCell = AlignmentScore &
  Readonly<{
    pathLength: number;
    predecessor: CellRecord;
    step: VoiceAssignmentOperationStep;
  }>;

type CellRecord = OriginCell | PathCell;

type AlignmentCandidate = AlignmentScore &
  Readonly<{
    pathLength: number;
    predecessor: CellRecord;
    step: VoiceAssignmentOperationStep;
  }>;

function compareNumber(left: number, right: number): -1 | 0 | 1 {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function operationRank(step: VoiceAssignmentOperationStep): number {
  if (step.kind === "match") return 0;
  if (step.kind === "leave") return 1;
  return 2;
}

function compareSteps(
  left: VoiceAssignmentOperationStep,
  right: VoiceAssignmentOperationStep,
): -1 | 0 | 1 {
  const rank = compareNumber(operationRank(left), operationRank(right));
  if (rank !== 0) return rank;
  const source = compareNumber(
    left.sourceOrdinal ?? -1,
    right.sourceOrdinal ?? -1,
  );
  if (source !== 0) return source;
  return compareNumber(left.targetOrdinal ?? -1, right.targetOrdinal ?? -1);
}

function cellStepAt(cell: CellRecord, index: number): VoiceAssignmentOperationStep {
  if (cell.predecessor === null) {
    throw new RangeError("voice-assignment path index reached its origin");
  }
  if (index === cell.pathLength - 1) return cell.step;
  return cellStepAt(cell.predecessor, index);
}

function candidateStepAt(
  candidate: AlignmentCandidate,
  index: number,
): VoiceAssignmentOperationStep {
  if (index === candidate.pathLength - 1) return candidate.step;
  return cellStepAt(candidate.predecessor, index);
}

function compareCandidatePaths(
  left: AlignmentCandidate,
  right: AlignmentCandidate,
): -1 | 0 | 1 {
  const shared = Math.min(left.pathLength, right.pathLength);
  for (let index = 0; index < shared; index += 1) {
    const comparison = compareSteps(
      candidateStepAt(left, index),
      candidateStepAt(right, index),
    );
    if (comparison !== 0) return comparison;
  }
  return compareNumber(left.pathLength, right.pathLength);
}

function compareCandidates(
  left: AlignmentCandidate,
  right: AlignmentCandidate,
): -1 | 0 | 1 {
  const axes = Object.freeze([
    "alignmentCost",
    "commonTonesLost",
    "guideTonesLost",
    "gapCount",
    "negativeExactSustains",
    "negativeSpelledPitchContinuities",
  ] as const);
  for (const axis of axes) {
    const comparison = compareNumber(left[axis], right[axis]);
    if (comparison !== 0) return comparison;
  }
  return compareCandidatePaths(left, right);
}

function pitchClassFromMidi(midi: MidiPitch): number {
  return ((midi % 12) + 12) % 12;
}

function spelledPitchClassIdentity(
  left: SpelledPitch,
  right: SpelledPitch,
): boolean {
  return left.step === right.step && left.alter === right.alter;
}

type MatchFacts = Readonly<{
  exactMidiIdentity: boolean;
  pitchClassIdentity: boolean;
  spelledPitchClassIdentity: boolean;
  spelledPitchIdentity: boolean;
  degreeIdentity: boolean;
  guideToneContinuity: boolean;
}>;

type MutableMatchFactMasks = {
  exactMidiIdentity: number;
  pitchClassIdentity: number;
  spelledPitchClassIdentity: number;
  spelledPitchIdentity: number;
  degreeIdentity: number;
  guideToneContinuity: number;
};

type MatchFactMasks = Readonly<MutableMatchFactMasks>;

function emptyMatchFactMasks(): MutableMatchFactMasks {
  return {
    exactMidiIdentity: 0,
    pitchClassIdentity: 0,
    spelledPitchClassIdentity: 0,
    spelledPitchIdentity: 0,
    degreeIdentity: 0,
    guideToneContinuity: 0,
  };
}

function matchFacts(
  source: UnassignedVoice,
  target: UnassignedVoice,
): MatchFacts {
  const exactMidiIdentity = source.midi === target.midi;
  const pitchClassIdentity =
    pitchClassFromMidi(source.midi) === pitchClassFromMidi(target.midi);
  const spelledPitchClass = spelledPitchClassIdentity(source.pitch, target.pitch);
  const spelledPitch = spelledPitchClass && source.pitch.octave === target.pitch.octave;
  const degreeIdentity = sameNullableDegree(source.degree, target.degree);
  const guideToneContinuity =
    source.guideTone &&
    target.guideTone &&
    source.degree !== null &&
    target.degree !== null &&
    sameChordDegree(source.degree, target.degree);
  return Object.freeze({
    exactMidiIdentity,
    pitchClassIdentity,
    spelledPitchClassIdentity: spelledPitchClass,
    spelledPitchIdentity: spelledPitch,
    degreeIdentity,
    guideToneContinuity,
  });
}

function recordMatchFacts(
  masks: MutableMatchFactMasks,
  factOrdinal: number,
  facts: MatchFacts,
): void {
  const bit = 2 ** factOrdinal;
  if (facts.exactMidiIdentity) masks.exactMidiIdentity += bit;
  if (facts.pitchClassIdentity) masks.pitchClassIdentity += bit;
  if (facts.spelledPitchClassIdentity) masks.spelledPitchClassIdentity += bit;
  if (facts.spelledPitchIdentity) masks.spelledPitchIdentity += bit;
  if (facts.degreeIdentity) masks.degreeIdentity += bit;
  if (facts.guideToneContinuity) masks.guideToneContinuity += bit;
}

function readMatchFact(mask: number, factOrdinal: number): boolean {
  const bit = 2 ** factOrdinal;
  return Math.floor(mask / bit) % 2 === 1;
}

function cachedMatchFacts(
  masks: MatchFactMasks,
  sourceOrdinal: number,
  targetOrdinal: number,
  targetVoiceCount: number,
): MatchFacts {
  const factOrdinal = sourceOrdinal * targetVoiceCount + targetOrdinal;
  return Object.freeze({
    exactMidiIdentity: readMatchFact(masks.exactMidiIdentity, factOrdinal),
    pitchClassIdentity: readMatchFact(masks.pitchClassIdentity, factOrdinal),
    spelledPitchClassIdentity: readMatchFact(
      masks.spelledPitchClassIdentity,
      factOrdinal,
    ),
    spelledPitchIdentity: readMatchFact(
      masks.spelledPitchIdentity,
      factOrdinal,
    ),
    degreeIdentity: readMatchFact(masks.degreeIdentity, factOrdinal),
    guideToneContinuity: readMatchFact(
      masks.guideToneContinuity,
      factOrdinal,
    ),
  });
}

function availableCommonTonePool(
  source: readonly UnassignedVoice[],
  target: readonly UnassignedVoice[],
): number {
  const sourceCounts = Array.from({ length: 12 }, () => 0);
  const targetCounts = Array.from({ length: 12 }, () => 0);
  for (const voice of source) {
    const pitchClass = pitchClassFromMidi(voice.midi);
    sourceCounts[pitchClass] = required(sourceCounts, pitchClass) + 1;
  }
  for (const voice of target) {
    const pitchClass = pitchClassFromMidi(voice.midi);
    targetCounts[pitchClass] = required(targetCounts, pitchClass) + 1;
  }
  let total = 0;
  for (let pitchClass = 0; pitchClass < 12; pitchClass += 1) {
    total += Math.min(
      required(sourceCounts, pitchClass),
      required(targetCounts, pitchClass),
    );
  }
  return total;
}

type LockMaps = Readonly<{
  sourceToTarget: readonly (number | null)[];
  targetToSource: readonly (number | null)[];
}>;

type LockConflict = Readonly<{
  reason: "lock-conflict" | "locked-order-crossing";
  ordinals: readonly number[];
}>;

function conflictOrdinals(
  pairs: readonly (readonly [number, number])[],
): readonly number[] {
  const values = new Set<number>();
  for (const [left, right] of pairs) {
    values.add(left);
    values.add(right);
  }
  return Object.freeze([...values].sort((left, right) => left - right));
}

function precheckEligibleLocks(
  locks: readonly MutableEligibleLockEvidence[],
  eligibleSourceOrdinals: number,
  sourceCount: number,
  targetCount: number,
): Readonly<{ maps: LockMaps; conflict: LockConflict | null }> {
  const sourceToTarget: (number | null)[] = Array.from(
    { length: sourceCount },
    () => null,
  );
  const targetToSource: (number | null)[] = Array.from(
    { length: targetCount },
    () => null,
  );
  const hardConflicts: (readonly [number, number])[] = [];
  const crossings: (readonly [number, number])[] = [];
  for (let leftIndex = 0; leftIndex < locks.length; leftIndex += 1) {
    const left = required(locks, leftIndex);
    const leftSourceOrdinal = Math.floor(
      eligibleSourceOrdinals / 8 ** leftIndex,
    ) % 8;
    for (let rightIndex = leftIndex + 1; rightIndex < locks.length; rightIndex += 1) {
      const right = required(locks, rightIndex);
      const rightSourceOrdinal = Math.floor(
        eligibleSourceOrdinals / 8 ** rightIndex,
      ) % 8;
      if (
        leftSourceOrdinal === rightSourceOrdinal ||
        left.matchedTargetOrdinal === right.matchedTargetOrdinal
      ) {
        hardConflicts.push(
          Object.freeze([
            left.lockOrdinal,
            right.lockOrdinal,
          ] as const),
        );
      } else if (
        (leftSourceOrdinal < rightSourceOrdinal &&
          left.matchedTargetOrdinal > right.matchedTargetOrdinal) ||
        (leftSourceOrdinal > rightSourceOrdinal &&
          left.matchedTargetOrdinal < right.matchedTargetOrdinal)
      ) {
        crossings.push(
          Object.freeze([
            left.lockOrdinal,
            right.lockOrdinal,
          ] as const),
        );
      }
    }
    sourceToTarget[leftSourceOrdinal] = left.matchedTargetOrdinal;
    targetToSource[left.matchedTargetOrdinal] = leftSourceOrdinal;
  }
  const maps = Object.freeze({
    sourceToTarget: Object.freeze(sourceToTarget),
    targetToSource: Object.freeze(targetToSource),
  });
  if (hardConflicts.length > 0) {
    return Object.freeze({
      maps,
      conflict: Object.freeze({
        reason: "lock-conflict",
        ordinals: conflictOrdinals(hardConflicts),
      }),
    });
  }
  if (crossings.length > 0) {
    return Object.freeze({
      maps,
      conflict: Object.freeze({
        reason: "locked-order-crossing",
        ordinals: conflictOrdinals(crossings),
      }),
    });
  }
  return Object.freeze({ maps, conflict: null });
}

function matchAllowed(
  maps: LockMaps,
  sourceOrdinal: number,
  targetOrdinal: number,
): boolean {
  const lockedTarget = required(maps.sourceToTarget, sourceOrdinal);
  const lockedSource = required(maps.targetToSource, targetOrdinal);
  return (
    (lockedTarget === null || lockedTarget === targetOrdinal) &&
    (lockedSource === null || lockedSource === sourceOrdinal)
  );
}

function leaveAllowed(maps: LockMaps, sourceOrdinal: number): boolean {
  return required(maps.sourceToTarget, sourceOrdinal) === null;
}

function enterAllowed(maps: LockMaps, targetOrdinal: number): boolean {
  return required(maps.targetToSource, targetOrdinal) === null;
}

function matchCandidate(
  predecessor: CellRecord,
  source: UnassignedVoice,
  target: UnassignedVoice,
  sourceOrdinal: number,
  targetOrdinal: number,
  facts: MatchFacts,
): AlignmentCandidate {
  return Object.freeze({
    alignmentCost:
      predecessor.alignmentCost + Math.abs(target.midi - source.midi),
    commonTonesLost:
      predecessor.commonTonesLost - (facts.pitchClassIdentity ? 1 : 0),
    guideTonesLost:
      predecessor.guideTonesLost - (facts.guideToneContinuity ? 1 : 0),
    gapCount: predecessor.gapCount,
    negativeExactSustains:
      predecessor.negativeExactSustains - (facts.exactMidiIdentity ? 1 : 0),
    negativeSpelledPitchContinuities:
      predecessor.negativeSpelledPitchContinuities -
      (facts.spelledPitchIdentity ? 1 : 0),
    pathLength: predecessor.pathLength + 1,
    predecessor,
    step: Object.freeze({ kind: "match", sourceOrdinal, targetOrdinal }),
  });
}

function gapCandidate(
  predecessor: CellRecord,
  step: VoiceAssignmentOperationStep,
): AlignmentCandidate {
  return Object.freeze({
    alignmentCost: predecessor.alignmentCost + VOICE_ASSIGNMENT_GAP_COST,
    commonTonesLost: predecessor.commonTonesLost,
    guideTonesLost: predecessor.guideTonesLost,
    gapCount: predecessor.gapCount + 1,
    negativeExactSustains: predecessor.negativeExactSustains,
    negativeSpelledPitchContinuities:
      predecessor.negativeSpelledPitchContinuities,
    pathLength: predecessor.pathLength + 1,
    predecessor,
    step: Object.freeze(step),
  });
}

function selectedCell(candidate: AlignmentCandidate): PathCell {
  return Object.freeze({ ...candidate });
}

function preferCandidate(
  current: AlignmentCandidate | null,
  candidate: AlignmentCandidate,
  evidence: MutableEvidence,
): AlignmentCandidate {
  if (current === null) return candidate;
  addWork(evidence, "scoreComparisons");
  return compareCandidates(candidate, current) < 0 ? candidate : current;
}

type AlignmentResult = Readonly<{
  operationPath: VoiceAssignmentOperationPath;
  matchFactMasks: MatchFactMasks;
  matrixCells: number;
  scoreRecords: number;
  predecessorRecords: number;
}>;

function alignVoices(
  source: readonly AssignedVoice[],
  target: readonly UnassignedVoice[],
  maps: LockMaps,
  evidence: MutableEvidence,
): AlignmentResult {
  const rows = source.length + 1;
  const columns = target.length + 1;
  const matrix: (CellRecord | null)[][] = Array.from(
    { length: rows },
    () => Array.from({ length: columns }, () => null),
  );
  const origin: OriginCell = Object.freeze({
    alignmentCost: 0,
    commonTonesLost: availableCommonTonePool(source, target),
    guideTonesLost: source.filter(({ guideTone }) => guideTone).length,
    gapCount: 0,
    negativeExactSustains: 0,
    negativeSpelledPitchContinuities: 0,
    pathLength: 0,
    predecessor: null,
    step: null,
  });
  matrix[0]?.splice(0, 1, origin);
  let scoreRecords = 1;
  let predecessorRecords = 0;
  const matchFactMasks = emptyMatchFactMasks();
  for (let sourcePrefix = 0; sourcePrefix < rows; sourcePrefix += 1) {
    for (let targetPrefix = 0; targetPrefix < columns; targetPrefix += 1) {
      addWork(evidence, "matrixCellsVisited");
      if (sourcePrefix === 0 && targetPrefix === 0) continue;
      let best: AlignmentCandidate | null = null;

      if (sourcePrefix > 0 && targetPrefix > 0) {
        addWork(evidence, "transitionCandidatesEvaluated");
        addWork(evidence, "identityComparisons");
        const sourceOrdinal = sourcePrefix - 1;
        const targetOrdinal = targetPrefix - 1;
        const sourceVoice = required(source, sourceOrdinal);
        const targetVoice = required(target, targetOrdinal);
        const facts = matchFacts(sourceVoice, targetVoice);
        recordMatchFacts(
          matchFactMasks,
          sourceOrdinal * target.length + targetOrdinal,
          facts,
        );
        const predecessor = matrix[sourcePrefix - 1]?.[targetPrefix - 1] ?? null;
        if (
          predecessor !== null &&
          matchAllowed(maps, sourceOrdinal, targetOrdinal)
        ) {
          best = preferCandidate(
            best,
            matchCandidate(
              predecessor,
              sourceVoice,
              targetVoice,
              sourceOrdinal,
              targetOrdinal,
              facts,
            ),
            evidence,
          );
        }
      }
      if (sourcePrefix > 0) {
        addWork(evidence, "transitionCandidatesEvaluated");
        const sourceOrdinal = sourcePrefix - 1;
        const predecessor = matrix[sourcePrefix - 1]?.[targetPrefix] ?? null;
        if (predecessor !== null && leaveAllowed(maps, sourceOrdinal)) {
          best = preferCandidate(
            best,
            gapCandidate(predecessor, {
              kind: "leave",
              sourceOrdinal,
              targetOrdinal: null,
            }),
            evidence,
          );
        }
      }
      if (targetPrefix > 0) {
        addWork(evidence, "transitionCandidatesEvaluated");
        const targetOrdinal = targetPrefix - 1;
        const predecessor = matrix[sourcePrefix]?.[targetPrefix - 1] ?? null;
        if (predecessor !== null && enterAllowed(maps, targetOrdinal)) {
          best = preferCandidate(
            best,
            gapCandidate(predecessor, {
              kind: "enter",
              sourceOrdinal: null,
              targetOrdinal,
            }),
            evidence,
          );
        }
      }
      if (best !== null) {
        const cell = selectedCell(best);
        matrix[sourcePrefix]?.splice(targetPrefix, 1, cell);
        scoreRecords += 1;
        predecessorRecords += 1;
      }
    }
  }
  const finalCell = matrix[source.length]?.[target.length] ?? null;
  if (finalCell === null) {
    throw new RangeError("eligible noncrossing locks produced no DP terminal");
  }
  const reversed: VoiceAssignmentOperationStep[] = [];
  let cursor = finalCell;
  while (cursor.predecessor !== null) {
    addWork(evidence, "backtraceSteps");
    reversed.push(Object.freeze({ ...cursor.step }));
    cursor = cursor.predecessor;
  }
  reversed.reverse();
  const operationPath = Object.freeze(reversed) as VoiceAssignmentOperationPath;
  return Object.freeze({
    operationPath,
    matchFactMasks: Object.freeze({ ...matchFactMasks }),
    matrixCells: rows * columns,
    scoreRecords,
    predecessorRecords,
  });
}

function motionFor(semitones: number): "descending" | "stationary" | "ascending" {
  if (semitones < 0) return "descending";
  if (semitones > 0) return "ascending";
  return "stationary";
}

type TargetIdentity = Readonly<{ voiceId: string; voiceSerial: number }>;

function requiredIdentity(
  identities: readonly (TargetIdentity | null)[],
  ordinal: number,
): TargetIdentity {
  const identity = required(identities, ordinal);
  if (identity === null) {
    throw new RangeError("selected assignment omitted a target identity");
  }
  return identity;
}

function makeArcs(
  request: AssignVoiceTransitionRequest,
  operationPath: VoiceAssignmentOperationPath,
  matchFactMasks: MatchFactMasks,
  identities: readonly (TargetIdentity | null)[],
  evidence: MutableEvidence,
): VoiceArcs {
  const arcs: VoiceArc[] = [];
  for (const step of operationPath) {
    if (step.kind === "match") {
      const source = required(request.from.voices, step.sourceOrdinal);
      const target = required(request.to.voices, step.targetOrdinal);
      const facts = cachedMatchFacts(
        matchFactMasks,
        step.sourceOrdinal,
        step.targetOrdinal,
        request.to.voices.length,
      );
      const semitones = target.midi - source.midi;
      arcs.push(
        Object.freeze({
          schema: VOICE_ASSIGNMENT_ARC_SCHEMA,
          kind: "match",
          identityDisposition: "propagated",
          identity: requiredIdentity(identities, step.targetOrdinal),
          from: copyUnassignedVoice(source),
          to: copyUnassignedVoice(target),
          semitones,
          absoluteSemitones: Math.abs(semitones),
          motion: motionFor(semitones),
          ...facts,
          commonTone: facts.pitchClassIdentity,
          guideTone: source.guideTone || target.guideTone,
        }),
      );
    } else if (step.kind === "enter") {
      const target = required(request.to.voices, step.targetOrdinal);
      arcs.push(
        Object.freeze({
          schema: VOICE_ASSIGNMENT_ARC_SCHEMA,
          kind: "enter",
          identityDisposition: "allocated",
          identity: requiredIdentity(identities, step.targetOrdinal),
          from: null,
          to: copyUnassignedVoice(target),
          semitones: null,
          absoluteSemitones: null,
          motion: "entering",
          exactMidiIdentity: null,
          pitchClassIdentity: null,
          spelledPitchClassIdentity: null,
          spelledPitchIdentity: null,
          degreeIdentity: null,
          commonTone: false,
          guideTone: target.guideTone,
          guideToneContinuity: false,
        }),
      );
    } else {
      const source = required(request.from.voices, step.sourceOrdinal);
      arcs.push(
        Object.freeze({
          schema: VOICE_ASSIGNMENT_ARC_SCHEMA,
          kind: "leave",
          identityDisposition: "retired",
          identity: Object.freeze({
            voiceId: source.voiceId,
            voiceSerial: source.voiceSerial,
          }),
          from: copyUnassignedVoice(source),
          to: null,
          semitones: null,
          absoluteSemitones: null,
          motion: "leaving",
          exactMidiIdentity: null,
          pitchClassIdentity: null,
          spelledPitchClassIdentity: null,
          spelledPitchIdentity: null,
          degreeIdentity: null,
          commonTone: false,
          guideTone: source.guideTone,
          guideToneContinuity: false,
        }),
      );
    }
    addWork(evidence, "arcsProduced");
  }
  return Object.freeze(arcs) as VoiceArcs;
}

function relationKind(
  first: number,
  second: number,
): VoiceMotionRelation["kind"] {
  if (first === 0 && second === 0) return "stationary-pair";
  if (first === 0 || second === 0) return "oblique";
  if ((first < 0 && second > 0) || (first > 0 && second < 0)) {
    return "contrary";
  }
  if (first === second) return "parallel";
  return "similar";
}

function makeRelations(
  arcs: VoiceArcs,
  evidence: MutableEvidence,
): VoiceMotionRelations {
  const relations: VoiceMotionRelation[] = [];
  for (let firstArcOrdinal = 0; firstArcOrdinal < arcs.length; firstArcOrdinal += 1) {
    const first = required(arcs, firstArcOrdinal);
    if (first.kind !== "match") continue;
    for (
      let secondArcOrdinal = firstArcOrdinal + 1;
      secondArcOrdinal < arcs.length;
      secondArcOrdinal += 1
    ) {
      const second = required(arcs, secondArcOrdinal);
      if (second.kind !== "match") continue;
      addWork(evidence, "relationClassifications");
      relations.push(
        Object.freeze({
          firstArcOrdinal,
          secondArcOrdinal,
          kind: relationKind(first.semitones, second.semitones),
        }),
      );
    }
  }
  return Object.freeze(relations) as VoiceMotionRelations;
}

function makeCost(
  request: AssignVoiceTransitionRequest,
  arcs: VoiceArcs,
  targetRoleCostFacts: MutableTargetRoleCostFacts,
): VoiceAssignmentCost {
  let enteringVoices = 0;
  let leavingVoices = 0;
  let totalAbsoluteMotion = 0;
  let maximumAbsoluteLeap = 0;
  let pitchClassCommonTones = 0;
  let exactSustains = 0;
  let spelledPitchClassContinuities = 0;
  let spelledPitchContinuities = 0;
  let guideToneContinuities = 0;
  for (const arc of arcs) {
    if (arc.kind === "enter") enteringVoices += 1;
    else if (arc.kind === "leave") leavingVoices += 1;
    else {
      totalAbsoluteMotion += arc.absoluteSemitones;
      maximumAbsoluteLeap = Math.max(
        maximumAbsoluteLeap,
        arc.absoluteSemitones,
      );
      if (arc.pitchClassIdentity) pitchClassCommonTones += 1;
      if (arc.exactMidiIdentity) exactSustains += 1;
      if (arc.spelledPitchClassIdentity) spelledPitchClassContinuities += 1;
      if (arc.spelledPitchIdentity) spelledPitchContinuities += 1;
      if (arc.guideToneContinuity) guideToneContinuities += 1;
    }
  }
  const gapCount = enteringVoices + leavingVoices;
  const firstTarget = required(request.to.voices, 0);
  const lastTarget = required(request.to.voices, request.to.voices.length - 1);
  return Object.freeze({
    alignmentCost: totalAbsoluteMotion + VOICE_ASSIGNMENT_GAP_COST * gapCount,
    gapCount,
    enteringVoices,
    leavingVoices,
    totalAbsoluteMotion,
    maximumAbsoluteLeap,
    pitchClassCommonTones,
    exactSustains,
    spelledPitchClassContinuities,
    spelledPitchContinuities,
    commonTonesLost:
      availableCommonTonePool(request.from.voices, request.to.voices) -
      pitchClassCommonTones,
    guideToneContinuities,
    guideTonesLost:
      request.from.voices.filter(({ guideTone }) => guideTone).length -
      guideToneContinuities,
    crowdedLowIntervals: lowRegisterSpacingViolations(request.to.voices).length,
    doubledGuideTones: targetRoleCostFacts.doubledGuideTones,
    omittedColors: targetRoleCostFacts.omittedColors,
    totalSpan: lastTarget.midi - firstTarget.midi,
  });
}

function orderKey(
  cost: VoiceAssignmentCost,
  operationPath: VoiceAssignmentOperationPath,
): VoiceAssignmentOrderKey {
  return Object.freeze([
    cost.alignmentCost,
    cost.commonTonesLost,
    cost.guideTonesLost,
    cost.gapCount,
    -cost.exactSustains,
    -cost.spelledPitchContinuities,
    operationPath,
  ]);
}

function initializeTransitionEvidence(
  request: AssignVoiceTransitionRequest,
  locks: LockValidation,
  evidence: MutableEvidence,
): void {
  const inputRoleDegrees =
    request.from.roles.guideDegrees.length +
    request.from.roles.colorDegrees.length +
    request.to.roles.guideDegrees.length +
    request.to.roles.colorDegrees.length;
  addWork(evidence, "sourceVoicesVisited", request.from.voices.length);
  addWork(evidence, "targetVoicesVisited", request.to.voices.length);
  addWork(evidence, "roleDegreesVisited", inputRoleDegrees);
  observeMemory(
    evidence,
    "peakInputVoiceRecords",
    request.from.voices.length + request.to.voices.length,
  );
  observeMemory(evidence, "peakInputRoleDegreeRecords", inputRoleDegrees);
  observeMemory(evidence, "peakLockRecords", request.locks.length);
  observeMemory(evidence, "peakLockEvidenceRecords", locks.evidence.length);
  observeTrackedRecords(evidence);
}

function noAssignmentResult(
  reason: "lock-conflict" | "locked-order-crossing" | "voice-id-space-exhausted",
  conflictingLockOrdinals: readonly number[],
  locks: LockValidation,
  evidence: MutableEvidence,
): AssignVoiceTransitionResult {
  const eligibleEvidence = locks.eligible as EligibleVoiceLockEvidenceRecords;
  observeTrackedRecords(evidence);
  const refusal: VoiceAssignmentNoAssignmentRefusal = Object.freeze({
    code: "voice_assignment.no_assignment",
    path: EMPTY_PATH,
    reason,
    conflictingLockOrdinals: Object.freeze([
      ...conflictingLockOrdinals,
    ]) as VoiceAssignmentNoAssignmentRefusal["conflictingLockOrdinals"],
    partialResult: false,
  });
  const result: AssignVoiceTransitionResult = Object.freeze({
    ok: false,
    refusal,
    locks: eligibleEvidence,
    evidence: finishEvidence(evidence, "no-assignment"),
  });
  return deepFreezeOwned(result);
}

function requestInvalidTransitionResult(
  refusal: VoiceAssignmentInputRefusal,
  locks: VoiceLockValidationEvidenceRecords,
  evidence: MutableEvidence,
): AssignVoiceTransitionResult {
  const invalidEvidence: VoiceAssignmentWorkEvidence &
    Readonly<{ termination: "request-invalid" }> = finishEvidence(
    evidence,
    "request-invalid",
  );
  const result: AssignVoiceTransitionResult = Object.freeze({
    ok: false,
    refusal,
    locks,
    evidence: invalidEvidence,
  });
  return deepFreezeOwned(result);
}

function transitionWorkLimitResult(
  locks: VoiceLockValidationEvidenceRecords,
  evidence: MutableEvidence,
): AssignVoiceTransitionResult {
  const refusal = evidence[WORK_LIMIT];
  if (refusal === null) {
    throw new RangeError("voice-assignment work-limit result lacks a refusal");
  }
  const result: AssignVoiceTransitionResult = Object.freeze({
    ok: false,
    refusal,
    locks,
    evidence: finishEvidence(evidence, "work-limit-exceeded"),
  });
  return deepFreezeOwned(result);
}

function satisfyEligibleLocks(
  locks: LockValidation,
): SatisfiedVoiceLockEvidenceRecords {
  for (const record of locks.eligible) {
    record.status = "satisfied";
    Object.freeze(record);
  }
  return locks.eligible as SatisfiedVoiceLockEvidenceRecords;
}

export const assignVoiceTransition: AssignVoiceTransition = (request) => {
  const evidence = zeroEvidence();
  const targetRoleCostFacts = emptyTargetRoleCostFacts();
  const refusal = transitionValidation(
    request,
    evidence,
    targetRoleCostFacts,
  );
  if (refusal !== null) {
    return requestInvalidTransitionResult(refusal, EMPTY_PATH, evidence);
  }

  const locks = validateLocks(request, evidence);
  initializeTransitionEvidence(request, locks, evidence);
  if (locks.refusal !== null) {
    return requestInvalidTransitionResult(
      locks.refusal,
      locks.evidence as VoiceLockValidationEvidenceRecords,
      evidence,
    );
  }

  const lockPlan = precheckEligibleLocks(
    locks.eligible,
    locks.eligibleSourceOrdinals,
    request.from.voices.length,
    request.to.voices.length,
  );
  if (lockPlan.conflict !== null) {
    return noAssignmentResult(
      lockPlan.conflict.reason,
      lockPlan.conflict.ordinals,
      locks,
      evidence,
    );
  }

  const alignment = alignVoices(
    request.from.voices,
    request.to.voices,
    lockPlan.maps,
    evidence,
  );
  const enteringVoices = alignment.operationPath.filter(
    ({ kind }) => kind === "enter",
  ).length;
  if (
    request.from.nextVoiceSerial + enteringVoices >
    MAX_VOICE_ASSIGNMENT_NEXT_VOICE_SERIAL
  ) {
    observeMemory(evidence, "peakMatrixCellRecords", alignment.matrixCells);
    observeMemory(
      evidence,
      "peakPredecessorRecords",
      alignment.predecessorRecords,
    );
    observeMemory(evidence, "peakScoreRecords", alignment.scoreRecords);
    observeMemory(
      evidence,
      "peakPathStepRecords",
      alignment.operationPath.length,
    );
    observeTrackedRecords(evidence);
    return noAssignmentResult(
      "voice-id-space-exhausted",
      EMPTY_PATH,
      locks,
      evidence,
    );
  }

  const identities: (TargetIdentity | null)[] = Array.from(
    { length: request.to.voices.length },
    () => null,
  );
  let nextVoiceSerial = request.from.nextVoiceSerial;
  for (const step of alignment.operationPath) {
    if (step.kind === "match") {
      const source = required(request.from.voices, step.sourceOrdinal);
      identities[step.targetOrdinal] = Object.freeze({
        voiceId: source.voiceId,
        voiceSerial: source.voiceSerial,
      });
    } else if (step.kind === "enter") {
      const serial = nextVoiceSerial;
      nextVoiceSerial += 1;
      addWork(evidence, "voiceIdsAllocated");
      identities[step.targetOrdinal] = Object.freeze({
        voiceId: `voice-${serial.toString().padStart(4, "0")}`,
        voiceSerial: serial,
      });
    }
  }

  const outputVoices = request.to.voices.map((voice, ordinal) => {
    const identity = requiredIdentity(identities, ordinal);
    return Object.freeze({
      ...copyUnassignedVoice(voice),
      voiceId: identity.voiceId,
      voiceSerial: identity.voiceSerial,
    });
  });
  const frame: AssignedVoiceFrame = Object.freeze({
    schema: VOICE_ASSIGNMENT_FRAME_SCHEMA,
    kind: "assigned",
    requestId: request.requestId,
    eventId: request.to.eventId,
    roles: copyRoleContext(request.to.roles),
    voices: assignedTuple(outputVoices),
    nextVoiceSerial,
  });
  const arcs = makeArcs(
    request,
    alignment.operationPath,
    alignment.matchFactMasks,
    identities,
    evidence,
  );
  const relations = makeRelations(arcs, evidence);
  const cost = makeCost(request, arcs, targetRoleCostFacts);

  const outputRoleDegrees =
    request.to.roles.guideDegrees.length + request.to.roles.colorDegrees.length;
  const endpointRecords = arcs.reduce(
    (count, arc) => count + (arc.from === null ? 0 : 1) + (arc.to === null ? 0 : 1),
    0,
  );
  observeMemory(evidence, "peakMatrixCellRecords", alignment.matrixCells);
  observeMemory(
    evidence,
    "peakPredecessorRecords",
    alignment.predecessorRecords,
  );
  observeMemory(evidence, "peakScoreRecords", alignment.scoreRecords);
  observeMemory(
    evidence,
    "peakPathStepRecords",
    alignment.operationPath.length,
  );
  observeMemory(evidence, "peakArcRecords", arcs.length);
  observeMemory(evidence, "peakArcEndpointRecords", endpointRecords);
  observeMemory(evidence, "peakArcIdentityRecords", arcs.length);
  observeMemory(evidence, "peakOutputVoiceRecords", frame.voices.length);
  observeMemory(evidence, "peakOutputRoleDegreeRecords", outputRoleDegrees);
  observeMemory(evidence, "peakRelationRecords", relations.length);
  observeTrackedRecords(evidence);

  if (evidence[WORK_LIMIT] !== null) {
    return transitionWorkLimitResult(
      locks.evidence as VoiceLockValidationEvidenceRecords,
      evidence,
    );
  }
  const satisfiedLocks = satisfyEligibleLocks(locks);

  const value: AssignedVoiceTransition = Object.freeze({
    schema: VOICE_ASSIGNMENT_RESULT_SCHEMA,
    kind: "assigned-transition",
    requestId: request.requestId,
    fromEventId: request.from.eventId,
    toEventId: request.to.eventId,
    frame,
    arcs,
    relations,
    locks: satisfiedLocks,
    cost,
    orderKey: orderKey(cost, alignment.operationPath),
    explanation: explanation(alignment.operationPath),
  });
  return deepFreezeOwned({
    ok: true,
    value,
    evidence: finishEvidence(evidence, "complete-assigned"),
  });
};
