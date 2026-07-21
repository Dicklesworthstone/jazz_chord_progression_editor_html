import { createHash } from "node:crypto";

import {
  assignVoiceTransition,
  initializeVoiceFrame,
  type AssignVoiceTransitionResult,
  type InitializeVoiceFrameResult,
  type VoiceAssignmentResult,
} from "../../src/theory";
import {
  V1_ASSIGNMENT_CASES,
  buildV1InitializeRequest,
  buildV1TransitionRequest,
  projectV1Arc,
  projectV1RelationCounts,
  type V1AssignmentCaseRecipe,
} from "./v1-assignment-fixtures";

type JsonRecord = Record<string, unknown>;

export type V1ProductionCaseObservation = Readonly<{
  caseId: string;
  fixtureRecordSha256: string;
  requestSha256: string;
  resultSha256: string;
  replayResultSha256: string;
  expectedProjectionSha256: string;
  actualProjectionSha256: string;
  deterministicReplay: true;
  inputUnchanged: true;
  recursivelyFrozen: true;
  detachedFromInputs: true;
  outcome: "pass";
  observationDigest: string;
}>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function canonicalV1EvidenceValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalV1EvidenceValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => compare(left, right))
      .map(([key, item]) => [key, canonicalV1EvidenceValue(item)]),
  );
}

export function stableV1EvidenceJson(value: unknown): string {
  return JSON.stringify(canonicalV1EvidenceValue(value));
}

export function v1EvidenceDigest(value: unknown): string {
  return createHash("sha256")
    .update(stableV1EvidenceJson(value), "utf8")
    .digest("hex");
}

function collectObjects(
  value: unknown,
  records: Set<object>,
): void {
  if (value === null || typeof value !== "object" || records.has(value)) {
    return;
  }
  records.add(value);
  for (const item of Object.values(value)) collectObjects(item, records);
}

export function isRecursivelyFrozen(
  value: unknown,
  visited = new Set<object>(),
): boolean {
  if (value === null || typeof value !== "object" || visited.has(value)) {
    return true;
  }
  visited.add(value);
  return Object.isFrozen(value) &&
    Object.values(value).every((item) => isRecursivelyFrozen(item, visited));
}

export function isDetachedFromInput(
  result: unknown,
  request: unknown,
): boolean {
  const callerOwned = new Set<object>();
  collectObjects(request, callerOwned);
  const visited = new Set<object>();
  const inspect = (value: unknown): boolean => {
    if (value === null || typeof value !== "object" || visited.has(value)) {
      return true;
    }
    if (callerOwned.has(value)) return false;
    visited.add(value);
    return Object.values(value).every(inspect);
  };
  return inspect(result);
}

function expectedProjection(recipe: V1AssignmentCaseRecipe): unknown {
  if (recipe.kind === "initialize") {
    return {
      termination: recipe.expected.termination,
      operationPath: recipe.expected.operationPath,
      outputVoiceIds: recipe.expected.outputVoiceIds,
      nextVoiceSerial: recipe.expected.nextVoiceSerial,
      voiceIdsAllocated: recipe.expected.voiceIdsAllocated,
    };
  }
  if (recipe.expected.termination === "no-assignment") {
    return {
      termination: recipe.expected.termination,
      code: recipe.expected.code,
      reason: recipe.expected.reason,
      conflictingLockOrdinals: recipe.expected.conflictingLockOrdinals,
      partialResult: recipe.expected.partialResult,
      operationPath: recipe.expected.operationPath,
      arcs: recipe.expected.arcs,
      lockEvidence: recipe.expected.lockEvidence,
    };
  }
  return {
    termination: recipe.expected.termination,
    operationPath: recipe.expected.operationPath,
    outputVoiceIds: recipe.expected.outputVoiceIds,
    nextVoiceSerial: recipe.expected.nextVoiceSerial,
    arcs: recipe.expected.arcs,
    cost: recipe.expected.cost,
    ...(recipe.expected.relationCounts === undefined
      ? {}
      : { relationCounts: recipe.expected.relationCounts }),
    ...(recipe.expected.lockEvidence === undefined
      ? {}
      : { lockEvidence: recipe.expected.lockEvidence }),
    ...(recipe.expected.work === undefined
      ? {}
      : { work: recipe.expected.work }),
    ...(recipe.expected.tiedMinimumPaths === undefined
      ? {}
      : { tiedMinimumPaths: recipe.expected.tiedMinimumPaths }),
    ...(recipe.expected.tieResolvedBy === undefined
      ? {}
      : { tieResolvedBy: recipe.expected.tieResolvedBy }),
    ...(recipe.expected.retiredVoiceIdsReused === undefined
      ? {}
      : { retiredVoiceIdsReused: recipe.expected.retiredVoiceIdsReused }),
  };
}

function actualProjection(
  recipe: V1AssignmentCaseRecipe,
  result: VoiceAssignmentResult,
): unknown {
  if (recipe.kind === "initialize") {
    const initializeResult = result as InitializeVoiceFrameResult;
    if (!initializeResult.ok) {
      throw new Error(`V1_CONFORMANCE_INITIALIZE:${recipe.id}`);
    }
    return {
      termination: initializeResult.evidence.termination,
      operationPath: initializeResult.value.explanation.operationPath,
      outputVoiceIds: initializeResult.value.frame.voices.map(
        ({ voiceId }) => voiceId,
      ),
      nextVoiceSerial: initializeResult.value.frame.nextVoiceSerial,
      voiceIdsAllocated: initializeResult.evidence.voiceIdsAllocated,
    };
  }
  const transitionResult = result as AssignVoiceTransitionResult;
  if (recipe.expected.termination === "no-assignment") {
    if (
      transitionResult.ok ||
      transitionResult.evidence.termination !== "no-assignment" ||
      transitionResult.refusal.code !== "voice_assignment.no_assignment"
    ) {
      throw new Error(`V1_CONFORMANCE_NO_ASSIGNMENT:${recipe.id}`);
    }
    return {
      termination: transitionResult.evidence.termination,
      code: transitionResult.refusal.code,
      reason: transitionResult.refusal.reason,
      conflictingLockOrdinals:
        transitionResult.refusal.conflictingLockOrdinals,
      partialResult: transitionResult.refusal.partialResult,
      operationPath: null,
      arcs: null,
      lockEvidence: transitionResult.locks,
    };
  }
  if (!transitionResult.ok) {
    throw new Error(`V1_CONFORMANCE_ASSIGNMENT:${recipe.id}`);
  }
  const value = transitionResult.value;
  return {
    termination: transitionResult.evidence.termination,
    operationPath: value.explanation.operationPath,
    outputVoiceIds: value.frame.voices.map(({ voiceId }) => voiceId),
    nextVoiceSerial: value.frame.nextVoiceSerial,
    arcs: value.arcs.map(projectV1Arc),
    cost: value.cost,
    ...(recipe.expected.relationCounts === undefined
      ? {}
      : { relationCounts: projectV1RelationCounts(value.relations) }),
    ...(recipe.expected.lockEvidence === undefined
      ? {}
      : { lockEvidence: value.locks }),
    ...(recipe.expected.work === undefined
      ? {}
      : {
          work: Object.fromEntries(
            Object.keys(recipe.expected.work).map((key) => [
              key,
              transitionResult.evidence[
                key as keyof typeof transitionResult.evidence
              ],
            ]),
          ),
        }),
    ...(recipe.expected.tiedMinimumPaths === undefined
      ? {}
      : { tiedMinimumPaths: recipe.expected.tiedMinimumPaths }),
    ...(recipe.expected.tieResolvedBy === undefined
      ? {}
      : { tieResolvedBy: recipe.expected.tieResolvedBy }),
    ...(recipe.expected.retiredVoiceIdsReused === undefined
      ? {}
      : {
          retiredVoiceIdsReused: value.arcs.some(
            (arc) =>
              arc.kind === "enter" &&
              value.arcs.some(
                (other) =>
                  other.kind === "leave" &&
                  other.identity.voiceId === arc.identity.voiceId,
              ),
          ),
        }),
  };
}

function runV1AssignmentCase(recipe: V1AssignmentCaseRecipe): Readonly<{
  request: unknown;
  requestBefore: string;
  result: VoiceAssignmentResult;
  replay: VoiceAssignmentResult;
}> {
  if (recipe.kind === "initialize") {
    const request = buildV1InitializeRequest(recipe);
    const requestBefore = stableV1EvidenceJson(request);
    return Object.freeze({
      request,
      requestBefore,
      result: initializeVoiceFrame(request),
      replay: initializeVoiceFrame(request),
    });
  }
  const request = buildV1TransitionRequest(recipe);
  const requestBefore = stableV1EvidenceJson(request);
  return Object.freeze({
    request,
    requestBefore,
    result: assignVoiceTransition(request),
    replay: assignVoiceTransition(request),
  });
}

export function executeV1AssignmentCase(
  recipe: V1AssignmentCaseRecipe,
): Readonly<{
  request: unknown;
  result: VoiceAssignmentResult;
  replay: VoiceAssignmentResult;
  expectedProjection: unknown;
  actualProjection: unknown;
}> {
  const { request, result, replay } = runV1AssignmentCase(recipe);
  return Object.freeze({
    request,
    result,
    replay,
    expectedProjection: expectedProjection(recipe),
    actualProjection: actualProjection(recipe, result),
  });
}

export function observeV1AssignmentCase(
  recipe: V1AssignmentCaseRecipe,
): V1ProductionCaseObservation {
  const { request, requestBefore, result, replay } = runV1AssignmentCase(recipe);
  const expected = expectedProjection(recipe);
  const actual = actualProjection(recipe, result);
  const requestAfter = stableV1EvidenceJson(request);
  const resultSha256 = v1EvidenceDigest(result);
  const replayResultSha256 = v1EvidenceDigest(replay);
  const expectedProjectionSha256 = v1EvidenceDigest(expected);
  const actualProjectionSha256 = v1EvidenceDigest(actual);
  if (
    requestBefore !== requestAfter ||
    resultSha256 !== replayResultSha256 ||
    expectedProjectionSha256 !== actualProjectionSha256 ||
    !isRecursivelyFrozen(result) ||
    !isRecursivelyFrozen(replay) ||
    !isDetachedFromInput(result, request) ||
    !isDetachedFromInput(replay, request)
  ) {
    throw new Error(`V1_CONFORMANCE_OBSERVATION:${recipe.id}`);
  }
  const rowWithoutDigest = Object.freeze({
    caseId: recipe.id,
    fixtureRecordSha256: v1EvidenceDigest(recipe),
    requestSha256: v1EvidenceDigest(request),
    resultSha256,
    replayResultSha256,
    expectedProjectionSha256,
    actualProjectionSha256,
    deterministicReplay: true as const,
    inputUnchanged: true as const,
    recursivelyFrozen: true as const,
    detachedFromInputs: true as const,
    outcome: "pass" as const,
  });
  return Object.freeze({
    ...rowWithoutDigest,
    observationDigest: v1EvidenceDigest(rowWithoutDigest),
  });
}

export function allV1ProductionObservations(): readonly V1ProductionCaseObservation[] {
  return Object.freeze(V1_ASSIGNMENT_CASES.map(observeV1AssignmentCase));
}
