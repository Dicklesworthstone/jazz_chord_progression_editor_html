import { describe, expect, test } from "bun:test";

import type { ChordDegree, SpelledPitch } from "../../src/domain";
import {
  assignVoiceTransition,
  initializeVoiceFrame,
  VOICE_ASSIGNMENT_ARC_SCHEMA,
  type AssignedVoice,
  type AssignedVoiceTransition,
  type AssignVoiceTransitionRequest,
  type UnassignedVoice,
  type VoiceAssignmentOperationPath,
  type VoiceAssignmentOrderKey,
  type VoiceRoleContext,
} from "../../src/theory";
import {
  V1_TRANSITION_CASES,
  buildV1InitializeRequest,
  buildV1TransitionRequest,
  projectV1Arc,
  projectV1RelationCounts,
  v1AssignmentCase,
  type V1AssignmentSuccessExpectation,
} from "../support/v1-assignment-fixtures";

function serialized(value: unknown): string {
  return JSON.stringify(value);
}

function expectEquivalent(actual: unknown, expected: unknown): void {
  expect(actual).toEqual(expected);
}

function expectRecursivelyFrozen(
  value: unknown,
  visited = new Set<object>(),
): void {
  if (value === null || typeof value !== "object" || visited.has(value)) {
    return;
  }
  visited.add(value);
  expect(Object.isFrozen(value)).toBe(true);
  for (const property of Object.values(value)) {
    expectRecursivelyFrozen(property, visited);
  }
}

function voiceSerialFromId(voiceId: string): number {
  const match = /^voice-([0-9]{4})$/u.exec(voiceId);
  if (match === null || match[1] === undefined) {
    throw new Error(`invalid expected voice ID: ${voiceId}`);
  }
  return Number(match[1]);
}

function pitchProjection(pitch: SpelledPitch) {
  return {
    step: pitch.step,
    alter: pitch.alter,
    octave: pitch.octave,
  };
}

function degreeProjection(degree: ChordDegree | null) {
  return degree === null
    ? null
    : { number: degree.number, alter: degree.alter };
}

function voiceProjection(voice: UnassignedVoice | AssignedVoice) {
  return {
    ordinal: voice.ordinal,
    pitch: pitchProjection(voice.pitch),
    midi: voice.midi,
    provenance: voice.provenance,
    degree: degreeProjection(voice.degree),
    sourceDegreeIndex: voice.sourceDegreeIndex,
    guideTone: voice.guideTone,
    colorTone: voice.colorTone,
  };
}

function expectRoleCopy(
  actual: VoiceRoleContext,
  input: VoiceRoleContext,
): void {
  expect(actual).toEqual(input);
  expect(actual).not.toBe(input);
  expect(actual.guideDegrees).not.toBe(input.guideDegrees);
  expect(actual.colorDegrees).not.toBe(input.colorDegrees);
  for (const [index, degree] of actual.guideDegrees.entries()) {
    expect(degree).not.toBe(input.guideDegrees[index]);
  }
  for (const [index, degree] of actual.colorDegrees.entries()) {
    expect(degree).not.toBe(input.colorDegrees[index]);
  }
}

function expectDetachedVoice(
  actual: UnassignedVoice | AssignedVoice,
  input: UnassignedVoice | AssignedVoice,
): void {
  expect(voiceProjection(actual)).toEqual(voiceProjection(input));
  expect(actual).not.toBe(input);
  expect(actual.pitch).not.toBe(input.pitch);
  if (actual.degree !== null && input.degree !== null) {
    expect(actual.degree).not.toBe(input.degree);
  }
}

function expectArcEndpointCopies(
  transition: AssignedVoiceTransition,
  request: AssignVoiceTransitionRequest,
): void {
  for (const arc of transition.arcs) {
    if (arc.from !== null) {
      const input = request.from.voices[arc.from.ordinal];
      if (input === undefined) throw new Error("missing source fixture voice");
      expectDetachedVoice(arc.from, input);
    }
    if (arc.to !== null) {
      const input = request.to.voices[arc.to.ordinal];
      if (input === undefined) throw new Error("missing target fixture voice");
      expectDetachedVoice(arc.to, input);
    }
  }
}

function expectIdentityCorrelation(
  transition: AssignedVoiceTransition,
  request: AssignVoiceTransitionRequest,
): void {
  const outputByOrdinal = transition.frame.voices;
  for (const arc of transition.arcs) {
    expect(arc.identity.voiceSerial).toBe(
      voiceSerialFromId(arc.identity.voiceId),
    );
    if (arc.kind === "match") {
      const source = request.from.voices[arc.from.ordinal];
      const output = outputByOrdinal[arc.to.ordinal];
      if (source === undefined || output === undefined) {
        throw new Error("missing matched fixture voice");
      }
      expect(arc.identity).toEqual({
        voiceId: source.voiceId,
        voiceSerial: source.voiceSerial,
      });
      expect(arc.identity).toEqual({
        voiceId: output.voiceId,
        voiceSerial: output.voiceSerial,
      });
    } else if (arc.kind === "enter") {
      const output = outputByOrdinal[arc.to.ordinal];
      if (output === undefined) throw new Error("missing entering fixture voice");
      expect(arc.identity).toEqual({
        voiceId: output.voiceId,
        voiceSerial: output.voiceSerial,
      });
    } else {
      const source = request.from.voices[arc.from.ordinal];
      if (source === undefined) throw new Error("missing leaving fixture voice");
      expect(arc.identity).toEqual({
        voiceId: source.voiceId,
        voiceSerial: source.voiceSerial,
      });
    }
  }
}

function expectPublishedArcLaws(transition: AssignedVoiceTransition): void {
  for (const arc of transition.arcs) {
    expect(arc.schema).toBe(VOICE_ASSIGNMENT_ARC_SCHEMA);
    expect(arc.identity.voiceSerial).toBe(
      voiceSerialFromId(arc.identity.voiceId),
    );
    if (arc.kind === "match") {
      expect(arc.identityDisposition).toBe("propagated");
      expect(arc.absoluteSemitones).toBe(Math.abs(arc.semitones));
      expect(arc.motion).toBe(
        arc.semitones < 0
          ? "descending"
          : arc.semitones > 0
            ? "ascending"
            : "stationary",
      );
      expect(arc.commonTone).toBe(arc.pitchClassIdentity);
    } else if (arc.kind === "enter") {
      expect(arc.identityDisposition).toBe("allocated");
      expect(arc.semitones).toBeNull();
      expect(arc.absoluteSemitones).toBeNull();
      expect(arc.motion).toBe("entering");
      expect(arc.commonTone).toBe(false);
    } else {
      expect(arc.identityDisposition).toBe("retired");
      expect(arc.semitones).toBeNull();
      expect(arc.absoluteSemitones).toBeNull();
      expect(arc.motion).toBe("leaving");
      expect(arc.commonTone).toBe(false);
    }
  }
}

function expectedOrderKey(
  expected: V1AssignmentSuccessExpectation,
): VoiceAssignmentOrderKey {
  return Object.freeze([
    expected.cost.alignmentCost,
    expected.cost.commonTonesLost,
    expected.cost.guideTonesLost,
    expected.cost.gapCount,
    -expected.cost.exactSustains,
    -expected.cost.spelledPitchContinuities,
    expected.operationPath as VoiceAssignmentOperationPath,
  ]);
}

function expectRelationOrdering(transition: AssignedVoiceTransition): void {
  let previousFirst = -1;
  let previousSecond = -1;
  for (const relation of transition.relations) {
    expect(relation.firstArcOrdinal).toBeLessThan(
      relation.secondArcOrdinal,
    );
    const lexicographicallyLater =
      relation.firstArcOrdinal > previousFirst ||
      (relation.firstArcOrdinal === previousFirst &&
        relation.secondArcOrdinal > previousSecond);
    expect(lexicographicallyLater).toBe(true);
    const first = transition.arcs[relation.firstArcOrdinal];
    const second = transition.arcs[relation.secondArcOrdinal];
    expect(first?.kind).toBe("match");
    expect(second?.kind).toBe("match");
    previousFirst = relation.firstArcOrdinal;
    previousSecond = relation.secondArcOrdinal;
  }
}

function expectSuccess(
  transition: AssignedVoiceTransition,
  request: AssignVoiceTransitionRequest,
  expected: V1AssignmentSuccessExpectation,
): void {
  expect(transition.requestId).toBe(request.requestId);
  expect(transition.fromEventId).toBe(request.from.eventId);
  expect(transition.toEventId).toBe(request.to.eventId);
  expect(transition.frame.eventId).toBe(request.to.eventId);
  expectEquivalent(
    transition.explanation.operationPath,
    expected.operationPath,
  );
  expectEquivalent(
    transition.frame.voices.map(({ voiceId }) => voiceId),
    expected.outputVoiceIds,
  );
  expectEquivalent(
    transition.frame.voices.map(({ voiceSerial }) => voiceSerial),
    expected.outputVoiceIds.map(voiceSerialFromId),
  );
  expect(new Set(transition.frame.voices.map(({ voiceId }) => voiceId)).size).toBe(
    transition.frame.voices.length,
  );
  expect(transition.frame.nextVoiceSerial).toBe(expected.nextVoiceSerial);
  expectEquivalent(transition.arcs.map(projectV1Arc), expected.arcs);
  expectEquivalent(transition.cost, expected.cost);
  expectEquivalent(transition.orderKey, expectedOrderKey(expected));
  expectEquivalent(transition.locks, expected.lockEvidence ?? []);

  if (expected.relationCounts !== undefined) {
    expectEquivalent(
      projectV1RelationCounts(transition.relations),
      expected.relationCounts,
    );
  }
  expectRelationOrdering(transition);
  expectIdentityCorrelation(transition, request);
  expectPublishedArcLaws(transition);

  expect(transition.frame).not.toBe(request.to);
  expectRoleCopy(transition.frame.roles, request.to.roles);
  for (const [index, voice] of transition.frame.voices.entries()) {
    const input = request.to.voices[index];
    if (input === undefined) throw new Error("missing target fixture voice");
    expectDetachedVoice(voice, input);
  }
  expectArcEndpointCopies(transition, request);
}

describe("V1 exact noncrossing voice assignment", () => {
  test("V1-ASN-001 initializes canonical request-local identities without aliasing input", () => {
    const recipe = v1AssignmentCase("V1-ASN-001");
    if (recipe.kind !== "initialize") {
      throw new Error("V1-ASN-001 must remain the initialization fixture");
    }
    const request = buildV1InitializeRequest(recipe);
    const before = serialized(request);
    const result = initializeVoiceFrame(request);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.refusal.code);
    expect(result.evidence.termination).toBe(recipe.expected.termination);
    expect(result.evidence.voiceIdsAllocated).toBe(
      recipe.expected.voiceIdsAllocated,
    );
    expectEquivalent(
      result.value.explanation.operationPath,
      recipe.expected.operationPath,
    );
    expectEquivalent(
      result.value.frame.voices.map(({ voiceId }) => voiceId),
      recipe.expected.outputVoiceIds,
    );
    expectEquivalent(
      result.value.frame.voices.map(({ voiceSerial }) => voiceSerial),
      recipe.expected.outputVoiceIds.map(voiceSerialFromId),
    );
    expect(result.value.frame.nextVoiceSerial).toBe(
      recipe.expected.nextVoiceSerial,
    );
    expect(result.value.frame).not.toBe(request.frame);
    expectRoleCopy(result.value.frame.roles, request.frame.roles);
    for (const [index, voice] of result.value.frame.voices.entries()) {
      const input = request.frame.voices[index];
      if (input === undefined) throw new Error("missing initial fixture voice");
      expectDetachedVoice(voice, input);
    }
    expect(serialized(request)).toBe(before);
    expectRecursivelyFrozen(result);

    const replay = initializeVoiceFrame(request);
    expect(replay).toEqual(result);
    expect(replay).not.toBe(result);
    expectRecursivelyFrozen(replay);
  });

  for (const recipe of V1_TRANSITION_CASES) {
    test(`${recipe.id} matches its independent assignment row exactly`, () => {
      const request = buildV1TransitionRequest(recipe);
      const before = serialized(request);
      const result = assignVoiceTransition(request);

      expect(result.evidence.termination).toBe(recipe.expected.termination);
      if (recipe.expected.termination === "complete-assigned") {
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error(result.refusal.code);
        expectSuccess(result.value, request, recipe.expected);
        if (recipe.expected.work !== undefined) {
          expect(result.evidence).toMatchObject(recipe.expected.work);
        }
      } else {
        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("expected typed no-assignment result");
        expect(result.refusal.code).toBe(recipe.expected.code);
        if (result.refusal.code !== "voice_assignment.no_assignment") {
          throw new Error(`unexpected refusal: ${result.refusal.code}`);
        }
        expect(result.refusal.reason).toBe(recipe.expected.reason);
        expectEquivalent(
          result.refusal.conflictingLockOrdinals,
          recipe.expected.conflictingLockOrdinals,
        );
        expect(result.refusal.partialResult).toBe(
          recipe.expected.partialResult,
        );
        expectEquivalent(result.locks, recipe.expected.lockEvidence);
      }

      expect(serialized(request)).toBe(before);
      expectRecursivelyFrozen(result);
      const replay = assignVoiceTransition(request);
      expect(replay).toEqual(result);
      expect(replay).not.toBe(result);
      expectRecursivelyFrozen(replay);
    });
  }
});
