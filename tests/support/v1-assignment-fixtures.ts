import assignmentFixtureValue from "../fixtures/voice-assignment/assignment-cases.json";

import {
  makeChordDegree,
  makeMidiPitch,
  makeSpelledPitch,
  parseStableId,
  projectSpelledPitch,
  type Alteration,
  type ChordDegree,
  type ChordEventId,
  type MidiPitch,
  type SpelledPitch,
  type Step,
} from "../../src/domain";
import {
  SEMANTIC_REALIZATION_IDS,
  VOICING_CANDIDATE_IDS,
  VOICE_ASSIGNMENT_FRAME_SCHEMA,
  VOICE_ASSIGNMENT_LOCK_SCHEMA,
  VOICE_ASSIGNMENT_POLICY_ID,
  VOICE_ASSIGNMENT_POLICY_VERSION,
  VOICE_ASSIGNMENT_REQUEST_SCHEMA,
  VOICE_ASSIGNMENT_ROLE_POLICY_ID,
  VOICE_ASSIGNMENT_ROLE_POLICY_VERSION,
  type AssignVoiceTransitionRequest,
  type AssignedVoice,
  type AssignedVoiceFrame,
  type AssignedVoiceTuple,
  type InitializeVoiceFrameRequest,
  type SemanticRealizationId,
  type UnassignedVoice,
  type UnassignedVoiceFrame,
  type UnassignedVoiceTuple,
  type VoiceArc,
  type VoiceAssignmentCost,
  type VoiceAssignmentOperationStep,
  type VoiceAssignmentLocks,
  type VoiceLock,
  type VoiceLockValidationEvidence,
  type VoiceMotionRelation,
  type VoiceMotionRelationKind,
  type VoiceRoleContext,
  type VoiceRoleDegrees,
  type VoicingCandidateId,
  type VoicingCandidateVoice,
} from "../../src/theory";

type V1DegreeNumberToken =
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "9"
  | "11"
  | "13";
type V1DegreeAccidentalToken = "" | "bb" | "b" | "#" | "##";

export type V1DegreeToken =
  `${V1DegreeAccidentalToken}${V1DegreeNumberToken}`;

export type V1VoiceRecipe = readonly [
  midi: number,
  pitch: string,
  degree: V1DegreeToken | null,
  guideTone: boolean,
  colorTone: boolean,
  provenance: VoicingCandidateVoice["provenance"],
  sourceDegreeIndex: number | null,
];

export type V1ExpectedArcTuple = readonly [
  kind: VoiceArc["kind"],
  sourceOrdinal: number | null,
  targetOrdinal: number | null,
  semitones: number | null,
  voiceId: string,
  exactMidiIdentity: boolean | null,
  pitchClassIdentity: boolean | null,
  spelledPitchClassIdentity: boolean | null,
  spelledPitchIdentity: boolean | null,
  degreeIdentity: boolean | null,
  guideTone: boolean,
  guideToneContinuity: boolean,
];

export type V1ExpectedWorkProjection = Readonly<{
  sourceVoicesVisited: number;
  targetVoicesVisited: number;
  matrixCellsVisited: number;
  transitionCandidatesEvaluated: number;
  scoreComparisons: number;
  backtraceSteps: number;
  identityComparisons: number;
  relationClassifications: number;
  voiceIdsAllocated: number;
  arcsProduced: number;
}>;

export type V1AssignmentSuccessExpectation = Readonly<{
  termination: "complete-assigned";
  operationPath: readonly VoiceAssignmentOperationStep[];
  outputVoiceIds: readonly string[];
  nextVoiceSerial: number;
  arcs: readonly V1ExpectedArcTuple[];
  cost: VoiceAssignmentCost;
  relationCounts?: Readonly<Record<VoiceMotionRelationKind, number>>;
  lockEvidence?: readonly VoiceLockValidationEvidence[];
  work?: V1ExpectedWorkProjection;
  tiedMinimumPaths?: number;
  tieResolvedBy?: string;
  retiredVoiceIdsReused?: false;
}>;

export type V1AssignmentNoAssignmentExpectation = Readonly<{
  termination: "no-assignment";
  code: "voice_assignment.no_assignment";
  reason: "locked-order-crossing";
  conflictingLockOrdinals: readonly number[];
  partialResult: false;
  operationPath: null;
  arcs: null;
  lockEvidence: readonly VoiceLockValidationEvidence[];
}>;

export type V1InitializeExpectation = Readonly<{
  termination: "complete-initialized";
  operationPath: readonly [];
  outputVoiceIds: readonly string[];
  nextVoiceSerial: number;
  voiceIdsAllocated: number;
}>;

export type V1LockRecipe = Readonly<{
  voiceId: string;
  targetOrdinal: number;
  pitch: string;
  degree: V1DegreeToken | null;
}>;

type V1AssignmentCaseCommon = Readonly<{
  id: string;
  traceIds: readonly string[];
  authorityIds: readonly string[];
}>;

export type V1InitializeCaseRecipe = V1AssignmentCaseCommon &
  Readonly<{
    kind: "initialize";
    frameVoiceSetId: string;
    expected: V1InitializeExpectation;
  }>;

export type V1TransitionCaseRecipe = V1AssignmentCaseCommon &
  Readonly<{
    kind: "transition";
    sourceVoiceSetId: string;
    targetVoiceSetId: string;
    locks?: readonly V1LockRecipe[];
    sourceVoiceIds?: readonly string[];
    sourceVoiceSerials?: readonly number[];
    sourceNextVoiceSerial?: number;
    transpositionOfCaseId?: string;
    transpositionSemitones?: number;
    oraclePathCount?: number;
    expected:
      | V1AssignmentSuccessExpectation
      | V1AssignmentNoAssignmentExpectation;
  }>;

export type V1AssignmentCaseRecipe =
  | V1InitializeCaseRecipe
  | V1TransitionCaseRecipe;

export type V1VoiceSetRecipe = Readonly<{
  id: string;
  candidateId: string;
  guideDegrees: readonly V1DegreeToken[];
  colorDegrees: readonly V1DegreeToken[];
  voices: readonly V1VoiceRecipe[];
}>;

type V1AssignmentFixture = Readonly<{
  schema: string;
  fixtureVersion: string;
  status: string;
  productionOutputUsed: false;
  expectedValuesGenerated: false;
  independentOracle: Readonly<{
    id: string;
    sharedSelectionCodeWithProduction: false;
    maximumEnumeratedSourceVoices: number;
    maximumEnumeratedTargetVoices: number;
    voiceTupleColumns: readonly string[];
    arcTupleColumns: readonly string[];
    pitchNotation: string;
    degreeNotation: string;
    roleContextDefaults: Readonly<{
      policyId: string;
      policyVersion: number;
      sourceId: string;
      sourceVersion: number;
      realizationId: string;
    }>;
    reviewMethod: string;
  }>;
  voiceSets: readonly V1VoiceSetRecipe[];
  cases: readonly V1AssignmentCaseRecipe[];
}>;

/** Independently authored V1 recipes. Production never imports this corpus. */
export const V1_ASSIGNMENT_FIXTURE =
  assignmentFixtureValue as unknown as V1AssignmentFixture;

export const V1_ASSIGNMENT_CASES = V1_ASSIGNMENT_FIXTURE.cases;
export const V1_TRANSITION_CASES = V1_ASSIGNMENT_CASES.filter(
  (recipe): recipe is V1TransitionCaseRecipe => recipe.kind === "transition",
);

function fixtureFailure(
  caseId: string,
  phase: string,
  detail: string,
): never {
  throw new Error(`V1_TEST_FIXTURE:${caseId}:${phase}:${detail}`);
}

export function v1AssignmentCase(caseId: string): V1AssignmentCaseRecipe {
  const recipe = V1_ASSIGNMENT_CASES.find(({ id }) => id === caseId);
  if (recipe === undefined) fixtureFailure(caseId, "lookup", "missing-case");
  return recipe;
}

export function v1VoiceSet(
  voiceSetId: string,
  caseId = "voice-set-helper",
): V1VoiceSetRecipe {
  const recipe = V1_ASSIGNMENT_FIXTURE.voiceSets.find(
    ({ id }) => id === voiceSetId,
  );
  if (recipe === undefined) {
    fixtureFailure(caseId, "voice-set", voiceSetId);
  }
  return recipe;
}

function degreeNumber(
  token: V1DegreeToken,
  caseId: string,
): ChordDegree["number"] {
  const numeric = Number.parseInt(token.replace(/^[b#]+/u, ""), 10);
  switch (numeric) {
    case 1:
    case 2:
    case 3:
    case 4:
    case 5:
    case 6:
    case 7:
    case 9:
    case 11:
    case 13:
      return numeric;
    default:
      return fixtureFailure(caseId, "degree", token);
  }
}

function degreeAlter(
  token: V1DegreeToken,
  caseId: string,
): ChordDegree["alter"] {
  const prefix = token.slice(0, token.search(/[0-9]/u));
  switch (prefix) {
    case "bb":
      return -2;
    case "b":
      return -1;
    case "":
      return 0;
    case "#":
      return 1;
    case "##":
      return 2;
    default:
      return fixtureFailure(caseId, "degree", token);
  }
}

export function v1DegreeFromToken(
  token: V1DegreeToken,
  caseId = "degree-helper",
): ChordDegree {
  const result = makeChordDegree({
    number: degreeNumber(token, caseId),
    alter: degreeAlter(token, caseId),
  });
  if (!result.ok) fixtureFailure(caseId, "degree", result.refusal.code);
  return result.value;
}

function parsedAlter(token: string, caseId: string): Alteration {
  switch (token) {
    case "bb":
      return -2;
    case "b":
      return -1;
    case "":
      return 0;
    case "#":
      return 1;
    case "##":
      return 2;
    default:
      return fixtureFailure(caseId, "pitch", token);
  }
}

function parsedStep(token: string, caseId: string): Step {
  switch (token) {
    case "A":
    case "B":
    case "C":
    case "D":
    case "E":
    case "F":
    case "G":
      return token;
    default:
      return fixtureFailure(caseId, "pitch", token);
  }
}

export function v1PitchFromToken(
  token: string,
  caseId = "pitch-helper",
): SpelledPitch {
  const match = /^([A-G])(bb|b|##|#)?(-?[0-9]+)$/u.exec(token);
  if (match === null) fixtureFailure(caseId, "pitch", token);
  const stepToken = match[1];
  const alterToken = match[2] ?? "";
  const octaveToken = match[3];
  if (stepToken === undefined || octaveToken === undefined) {
    fixtureFailure(caseId, "pitch", token);
  }
  const result = makeSpelledPitch({
    step: parsedStep(stepToken, caseId),
    alter: parsedAlter(alterToken, caseId),
    octave: Number(octaveToken),
  });
  if (!result.ok) fixtureFailure(caseId, "pitch", result.refusal.code);
  return result.value;
}

function midi(value: number, caseId: string): MidiPitch {
  const result = makeMidiPitch(value);
  if (!result.ok) fixtureFailure(caseId, "midi", result.refusal.code);
  return result.value;
}

function candidateId(value: string, caseId: string): VoicingCandidateId {
  if (!(VOICING_CANDIDATE_IDS as readonly string[]).includes(value)) {
    fixtureFailure(caseId, "candidate-id", value);
  }
  return value as VoicingCandidateId;
}

function realizationId(value: string, caseId: string): SemanticRealizationId {
  if (!(SEMANTIC_REALIZATION_IDS as readonly string[]).includes(value)) {
    fixtureFailure(caseId, "realization-id", value);
  }
  return value as SemanticRealizationId;
}

function eventId(caseId: string, frame: "initial" | "source" | "target") {
  const result = parseStableId("event", `event.${caseId}.${frame}`);
  if (!result.ok) fixtureFailure(caseId, "event-id", result.refusal.code);
  return result.value;
}

function requestId(caseId: string): string {
  return `request.${caseId}`;
}

function roleDegrees(
  tokens: readonly V1DegreeToken[],
  caseId: string,
): VoiceRoleDegrees {
  return Object.freeze(
    tokens.map((token) => v1DegreeFromToken(token, caseId)),
  ) as VoiceRoleDegrees;
}

function buildRoleContext(
  voiceSet: V1VoiceSetRecipe,
  caseId: string,
): VoiceRoleContext {
  const defaults = V1_ASSIGNMENT_FIXTURE.independentOracle.roleContextDefaults;
  if (
    defaults.policyId !== VOICE_ASSIGNMENT_ROLE_POLICY_ID ||
    defaults.policyVersion !== VOICE_ASSIGNMENT_ROLE_POLICY_VERSION
  ) {
    fixtureFailure(caseId, "roles", "policy-drift");
  }
  return Object.freeze({
    policyId: VOICE_ASSIGNMENT_ROLE_POLICY_ID,
    policyVersion: VOICE_ASSIGNMENT_ROLE_POLICY_VERSION,
    sourceId: defaults.sourceId,
    sourceVersion: defaults.sourceVersion,
    candidateId: candidateId(voiceSet.candidateId, caseId),
    realizationId: realizationId(defaults.realizationId, caseId),
    guideDegrees: roleDegrees(voiceSet.guideDegrees, caseId),
    colorDegrees: roleDegrees(voiceSet.colorDegrees, caseId),
  });
}

function assertPitchMidi(
  pitch: SpelledPitch,
  expectedMidi: MidiPitch,
  caseId: string,
): void {
  const projection = projectSpelledPitch(pitch);
  if (!projection.ok) {
    fixtureFailure(caseId, "pitch-midi", projection.refusal.code);
  }
  if (projection.value.midi !== expectedMidi) {
    fixtureFailure(caseId, "pitch-midi", "reviewed-mismatch");
  }
}

function buildUnassignedVoice(
  recipe: V1VoiceRecipe,
  ordinal: number,
  caseId: string,
): UnassignedVoice {
  const [midiValue, pitchToken, degreeToken, guideTone, colorTone, provenance, sourceDegreeIndex] =
    recipe;
  const pitch = v1PitchFromToken(pitchToken, caseId);
  const midiPitch = midi(midiValue, caseId);
  assertPitchMidi(pitch, midiPitch, caseId);

  if (provenance === "slash-bass") {
    if (degreeToken !== null || sourceDegreeIndex !== null) {
      fixtureFailure(caseId, "voice", "slash-bass-correlation");
    }
    return Object.freeze({
      ordinal,
      pitch,
      midi: midiPitch,
      provenance,
      degree: null,
      sourceDegreeIndex: null,
      guideTone,
      colorTone,
    });
  }
  if (degreeToken === null || sourceDegreeIndex === null) {
    fixtureFailure(caseId, "voice", "degree-correlation");
  }
  return Object.freeze({
    ordinal,
    pitch,
    midi: midiPitch,
    provenance,
    degree: v1DegreeFromToken(degreeToken, caseId),
    sourceDegreeIndex,
    guideTone,
    colorTone,
  });
}

function unassignedTuple(
  recipes: readonly V1VoiceRecipe[],
  caseId: string,
): UnassignedVoiceTuple {
  const voices = Object.freeze(
    recipes.map((recipe, ordinal) =>
      buildUnassignedVoice(recipe, ordinal, caseId),
    ),
  );
  switch (voices.length) {
    case 3:
    case 4:
    case 5:
    case 6:
    case 7:
      return voices as UnassignedVoiceTuple;
    default:
      return fixtureFailure(caseId, "voice-count", voices.length.toString());
  }
}

export function buildV1UnassignedFrame(
  voiceSet: V1VoiceSetRecipe,
  frameEventId: ChordEventId,
  caseId = "unassigned-frame-helper",
): UnassignedVoiceFrame {
  return Object.freeze({
    schema: VOICE_ASSIGNMENT_FRAME_SCHEMA,
    kind: "unassigned",
    eventId: frameEventId,
    roles: buildRoleContext(voiceSet, caseId),
    voices: unassignedTuple(voiceSet.voices, caseId),
  });
}

function assignedTuple(
  voices: UnassignedVoiceTuple,
  voiceIds: readonly string[],
  voiceSerials: readonly number[],
  caseId: string,
): AssignedVoiceTuple {
  if (
    voices.length !== voiceIds.length ||
    voices.length !== voiceSerials.length
  ) {
    fixtureFailure(caseId, "source-identities", "length-mismatch");
  }
  const assigned = Object.freeze(
    voices.map((voice, ordinal): AssignedVoice => {
      const voiceId = voiceIds[ordinal];
      const voiceSerial = voiceSerials[ordinal];
      if (voiceId === undefined || voiceSerial === undefined) {
        return fixtureFailure(caseId, "source-identities", "missing-member");
      }
      return Object.freeze({ ...voice, voiceId, voiceSerial });
    }),
  );
  return assigned as AssignedVoiceTuple;
}

function defaultVoiceId(serial: number): string {
  return `voice-${serial.toString().padStart(4, "0")}`;
}

function buildAssignedSourceFrame(
  recipe: V1TransitionCaseRecipe,
  frameRequestId: string,
  frameEventId: ChordEventId,
): AssignedVoiceFrame {
  const voiceSet = v1VoiceSet(recipe.sourceVoiceSetId, recipe.id);
  const unassigned = buildV1UnassignedFrame(
    voiceSet,
    frameEventId,
    recipe.id,
  );
  const serials = Object.freeze(
    recipe.sourceVoiceSerials === undefined
      ? unassigned.voices.map((_, ordinal) => ordinal)
      : [...recipe.sourceVoiceSerials],
  );
  const ids = Object.freeze(
    recipe.sourceVoiceIds === undefined
      ? serials.map(defaultVoiceId)
      : [...recipe.sourceVoiceIds],
  );
  return Object.freeze({
    schema: VOICE_ASSIGNMENT_FRAME_SCHEMA,
    kind: "assigned",
    requestId: frameRequestId,
    eventId: frameEventId,
    roles: unassigned.roles,
    voices: assignedTuple(unassigned.voices, ids, serials, recipe.id),
    nextVoiceSerial:
      recipe.sourceNextVoiceSerial ?? unassigned.voices.length,
  });
}

function samePitch(left: SpelledPitch, right: SpelledPitch): boolean {
  return (
    left.step === right.step &&
    left.alter === right.alter &&
    left.octave === right.octave
  );
}

function sameDegree(
  left: ChordDegree | null,
  right: ChordDegree | null,
): boolean {
  return (
    (left === null && right === null) ||
    (left !== null &&
      right !== null &&
      left.number === right.number &&
      left.alter === right.alter)
  );
}

function buildLocks(
  recipe: V1TransitionCaseRecipe,
  frameRequestId: string,
  target: UnassignedVoiceFrame,
): VoiceAssignmentLocks {
  const locks = (recipe.locks ?? []).map((lockRecipe): VoiceLock => {
    const targetVoice = target.voices[lockRecipe.targetOrdinal];
    if (targetVoice === undefined) {
      return fixtureFailure(recipe.id, "lock", "target-ordinal");
    }
    const expectedPitch = v1PitchFromToken(lockRecipe.pitch, recipe.id);
    const expectedDegree =
      lockRecipe.degree === null
        ? null
        : v1DegreeFromToken(lockRecipe.degree, recipe.id);
    if (
      !samePitch(targetVoice.pitch, expectedPitch) ||
      !sameDegree(targetVoice.degree, expectedDegree)
    ) {
      return fixtureFailure(recipe.id, "lock", "target-review-drift");
    }
    return Object.freeze({
      schema: VOICE_ASSIGNMENT_LOCK_SCHEMA,
      requestId: frameRequestId,
      eventId: target.eventId,
      voiceId: lockRecipe.voiceId,
      pitch: expectedPitch,
      degree: expectedDegree,
    });
  });
  return Object.freeze(locks) as VoiceAssignmentLocks;
}

export function buildV1InitializeRequest(
  recipe: V1InitializeCaseRecipe,
): InitializeVoiceFrameRequest {
  return Object.freeze({
    schema: VOICE_ASSIGNMENT_REQUEST_SCHEMA,
    kind: "initialize",
    requestId: requestId(recipe.id),
    frame: buildV1UnassignedFrame(
      v1VoiceSet(recipe.frameVoiceSetId, recipe.id),
      eventId(recipe.id, "initial"),
      recipe.id,
    ),
  });
}

export function buildV1TransitionRequest(
  recipe: V1TransitionCaseRecipe,
): AssignVoiceTransitionRequest {
  const frameRequestId = requestId(recipe.id);
  const target = buildV1UnassignedFrame(
    v1VoiceSet(recipe.targetVoiceSetId, recipe.id),
    eventId(recipe.id, "target"),
    recipe.id,
  );
  return Object.freeze({
    schema: VOICE_ASSIGNMENT_REQUEST_SCHEMA,
    kind: "transition",
    requestId: frameRequestId,
    from: buildAssignedSourceFrame(
      recipe,
      frameRequestId,
      eventId(recipe.id, "source"),
    ),
    to: target,
    locks: buildLocks(recipe, frameRequestId, target),
    policyId: VOICE_ASSIGNMENT_POLICY_ID,
    policyVersion: VOICE_ASSIGNMENT_POLICY_VERSION,
  });
}

export function projectV1Arc(arc: VoiceArc): V1ExpectedArcTuple {
  return Object.freeze([
    arc.kind,
    arc.from?.ordinal ?? null,
    arc.to?.ordinal ?? null,
    arc.semitones,
    arc.identity.voiceId,
    arc.exactMidiIdentity,
    arc.pitchClassIdentity,
    arc.spelledPitchClassIdentity,
    arc.spelledPitchIdentity,
    arc.degreeIdentity,
    arc.guideTone,
    arc.guideToneContinuity,
  ] as const);
}

export function projectV1RelationCounts(
  relations: readonly VoiceMotionRelation[],
): Readonly<Record<VoiceMotionRelationKind, number>> {
  const counts: Record<VoiceMotionRelationKind, number> = {
    "stationary-pair": 0,
    oblique: 0,
    contrary: 0,
    parallel: 0,
    similar: 0,
  };
  for (const relation of relations) counts[relation.kind] += 1;
  return Object.freeze(counts);
}
