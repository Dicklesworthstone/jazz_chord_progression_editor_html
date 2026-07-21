import { describe, expect, test } from "bun:test";

import type { ChordDegree, ChordEventId, SpelledPitch } from "../../src/domain";
import {
  assignVoiceTransition,
  initializeVoiceFrame,
  type AssignVoiceTransitionRequest,
  type AssignVoiceTransitionResult,
} from "../../src/theory";
import {
  buildV1InitializeRequest,
  buildV1TransitionRequest,
  v1AssignmentCase,
  v1DegreeFromToken,
  v1PitchFromToken,
} from "../support/v1-assignment-fixtures";

type RuntimeVoice = {
  ordinal: number;
  midi: number;
  pitch: SpelledPitch;
  provenance: string;
  degree: ChordDegree | null;
  sourceDegreeIndex: number | null;
  guideTone: boolean;
  colorTone: boolean;
  voiceId?: string;
  voiceSerial?: number;
};

type RuntimeRoleContext = {
  guideDegrees: ChordDegree[];
  colorDegrees: ChordDegree[];
};

type RuntimeLock = {
  requestId: string;
  eventId: ChordEventId;
  voiceId: string;
  pitch: SpelledPitch;
  degree: ChordDegree | null;
};

type RuntimeTransitionRequest = {
  requestId: string;
  from: {
    requestId: string;
    eventId: ChordEventId;
    voices: RuntimeVoice[];
    roles: RuntimeRoleContext;
    nextVoiceSerial: number;
  };
  to: {
    eventId: ChordEventId;
    voices: RuntimeVoice[];
    roles: RuntimeRoleContext;
  };
  locks: RuntimeLock[];
};
type TransitionFailure = Extract<AssignVoiceTransitionResult, { ok: false }>;
type TransitionSuccess = Extract<AssignVoiceTransitionResult, { ok: true }>;

function required<Value>(
  value: Value | undefined,
  description: string,
): Value {
  if (value === undefined) throw new Error(`V1_TEST_SETUP:${description}`);
  return value;
}

function requestFor(caseId = "V1-ASN-002"): RuntimeTransitionRequest {
  const recipe = v1AssignmentCase(caseId);
  if (recipe.kind !== "transition") {
    throw new Error(`V1_TEST_SETUP:${caseId}:expected-transition`);
  }
  return structuredClone(
    buildV1TransitionRequest(recipe),
  ) as unknown as RuntimeTransitionRequest;
}

function setRuntimeField(
  target: object,
  key: PropertyKey,
  value: unknown,
): void {
  if (!Reflect.set(target, key, value)) {
    throw new Error(`V1_TEST_SETUP:could-not-set:${String(key)}`);
  }
}

function voiceAt(
  voices: RuntimeVoice[],
  index: number,
  description: string,
): RuntimeVoice {
  return required(voices[index], description);
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
  for (const child of Object.values(value)) {
    expectRecursivelyFrozen(child, visited);
  }
}

function runWithoutMutation(
  request: RuntimeTransitionRequest,
): AssignVoiceTransitionResult {
  const before = JSON.stringify(request);
  expect(Object.isFrozen(request)).toBe(false);
  const result = assignVoiceTransition(
    request as unknown as AssignVoiceTransitionRequest,
  );
  expect(JSON.stringify(request)).toBe(before);
  expect(Object.isFrozen(request)).toBe(false);
  expectRecursivelyFrozen(result);
  return result;
}

function expectInputRefusal(
  request: RuntimeTransitionRequest,
  expected: Readonly<Record<string, unknown>>,
): TransitionFailure {
  const result = runWithoutMutation(request);
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("V1_TEST_EXPECTED:input-refusal");
  expect(result.refusal).toMatchObject(expected);
  expect(result.evidence.termination).toBe("request-invalid");
  expect(result.evidence.matrixCellsVisited).toBe(0);
  expect("value" in result).toBe(false);
  return result;
}

function expectNoAssignment(
  request: RuntimeTransitionRequest,
  reason: "lock-conflict" | "locked-order-crossing" | "voice-id-space-exhausted",
  conflictingLockOrdinals: readonly number[],
): TransitionFailure {
  const result = runWithoutMutation(request);
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("V1_TEST_EXPECTED:no-assignment");
  expect(result.refusal.code).toBe("voice_assignment.no_assignment");
  if (result.refusal.code !== "voice_assignment.no_assignment") {
    throw new Error(`V1_TEST_EXPECTED:no-assignment:${result.refusal.code}`);
  }
  expect(result.refusal.path).toEqual([]);
  expect(result.refusal.reason).toBe(reason);
  expect([...result.refusal.conflictingLockOrdinals]).toEqual([
    ...conflictingLockOrdinals,
  ]);
  expect(result.refusal.partialResult).toBe(false);
  expect(result.evidence.termination).toBe("no-assignment");
  expect("value" in result).toBe(false);
  return result;
}

function expectSuccess(
  request: RuntimeTransitionRequest,
): TransitionSuccess {
  const result = runWithoutMutation(request);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.refusal.code);
  expect(result.evidence.termination).toBe("complete-assigned");
  return result;
}

describe("V1 validation, refusal precedence, and ownership", () => {
  test("V1-OP-003 executes every request, frame, and policy schema refusal", () => {
    const requestSchema = requestFor();
    setRuntimeField(
      requestSchema,
      "schema",
      "changes.theory.voice-assignment-request.v999",
    );
    expectInputRefusal(requestSchema, {
      code: "voice_assignment.schema_invalid",
      reason: "request-schema-mismatch",
      path: ["schema"],
      received: "changes.theory.voice-assignment-request.v999",
      expected: "changes.theory.voice-assignment-request.v1",
    });

    const frameSchema = requestFor();
    setRuntimeField(
      frameSchema.from,
      "schema",
      "changes.theory.voice-assignment-frame.v999",
    );
    expectInputRefusal(frameSchema, {
      code: "voice_assignment.schema_invalid",
      reason: "frame-schema-mismatch",
      path: ["from", "schema"],
      received: "changes.theory.voice-assignment-frame.v999",
      expected: "changes.theory.voice-assignment-frame.v1",
    });

    const policyId = requestFor();
    setRuntimeField(policyId, "policyId", "other");
    expectInputRefusal(policyId, {
      code: "voice_assignment.policy_invalid",
      reason: "policy-id-mismatch",
      path: ["policyId"],
      received: "other",
      expected: "changes.voice-assignment.order-preserving-smooth",
    });

    const policyVersion = requestFor();
    setRuntimeField(policyVersion, "policyVersion", 2);
    expectInputRefusal(policyVersion, {
      code: "voice_assignment.policy_invalid",
      reason: "policy-version-mismatch",
      path: ["policyVersion"],
      received: 2,
      expected: 1,
    });
  });

  test("V1-OP-004 executes initialize-minimum and source/target maximum voice-count refusals", () => {
    const initializeRecipe = v1AssignmentCase("V1-ASN-001");
    if (initializeRecipe.kind !== "initialize") {
      throw new Error("V1_TEST_SETUP:V1-ASN-001:initialize");
    }
    const initializeRequest = structuredClone(
      buildV1InitializeRequest(initializeRecipe),
    );
    const initializeVoices =
      initializeRequest.frame.voices as unknown as RuntimeVoice[];
    initializeVoices.splice(2, 1);
    const initializeResult = initializeVoiceFrame(initializeRequest);
    expect(initializeResult.ok).toBe(false);
    if (initializeResult.ok) {
      throw new Error("V1_TEST_EXPECTED:initialize-refusal");
    }
    expect(initializeResult.refusal).toMatchObject({
      code: "voice_assignment.voice_count_invalid",
      frame: "initial",
      received: 2,
      minimum: 3,
      maximum: 7,
    });
    expect(initializeResult.evidence.termination).toBe("request-invalid");
    expect(initializeResult.evidence.matrixCellsVisited).toBe(0);

    for (const frame of ["from", "to"] as const) {
      const request = requestFor("V1-ASN-018");
      const seventh = voiceAt(request[frame].voices, 6, `${frame}-6`);
      request[frame].voices.push({
        ...structuredClone(seventh),
        ordinal: 7,
      });
      expectInputRefusal(request, {
        code: "voice_assignment.voice_count_invalid",
        frame: frame === "from" ? "source" : "target",
        received: 8,
        minimum: 3,
        maximum: 7,
      });
    }
  });

  test("V1-OP-005 applies validation globally by code, then frame, then ordinal", () => {
    const crossFrame = requestFor();
    setRuntimeField(voiceAt(crossFrame.from.voices, 0, "source-0"), "midi", 49);
    setRuntimeField(voiceAt(crossFrame.to.voices, 1, "target-1"), "ordinal", 2);
    expectInputRefusal(crossFrame, {
      code: "voice_assignment.voice_ordinal_invalid",
      reason: "noncontiguous",
      frame: "target",
      voiceIndex: 1,
      received: 2,
      expected: 1,
    });

    const sourceBeforeTarget = requestFor();
    setRuntimeField(
      voiceAt(sourceBeforeTarget.from.voices, 0, "source-0"),
      "midi",
      56,
    );
    setRuntimeField(
      voiceAt(sourceBeforeTarget.to.voices, 0, "target-0"),
      "midi",
      56,
    );
    expectInputRefusal(sourceBeforeTarget, {
      code: "voice_assignment.voice_order_invalid",
      reason: "descending-midi",
      frame: "source",
      lowerOrdinal: 0,
      upperOrdinal: 1,
    });

    const lowOrdinalFirst = requestFor();
    setRuntimeField(voiceAt(lowOrdinalFirst.from.voices, 0, "source-0"), "midi", 70);
    setRuntimeField(voiceAt(lowOrdinalFirst.from.voices, 1, "source-1"), "midi", 60);
    setRuntimeField(voiceAt(lowOrdinalFirst.from.voices, 2, "source-2"), "midi", 50);
    expectInputRefusal(lowOrdinalFirst, {
      code: "voice_assignment.voice_order_invalid",
      frame: "source",
      lowerOrdinal: 0,
      upperOrdinal: 1,
    });
  });

  test("V1-OP-006 lets equal MIDI reach duplicate detection and checks exact pitch projection", () => {
    const duplicate = requestFor();
    setRuntimeField(voiceAt(duplicate.to.voices, 2, "target-2"), "midi", 55);
    expectInputRefusal(duplicate, {
      code: "voice_assignment.duplicate_midi",
      frame: "target",
      firstOrdinal: 1,
      secondOrdinal: 2,
      midi: 55,
    });

    const pitchMismatch = requestFor();
    setRuntimeField(
      voiceAt(pitchMismatch.to.voices, 0, "target-0"),
      "pitch",
      v1PitchFromToken("C#3", "V1-OP-006"),
    );
    expectInputRefusal(pitchMismatch, {
      code: "voice_assignment.pitch_midi_mismatch",
      frame: "target",
      voiceOrdinal: 0,
      received: 48,
      expected: 49,
    });

    const unprojectableSpelling = requestFor();
    setRuntimeField(
      voiceAt(unprojectableSpelling.to.voices, 0, "target-0"),
      "pitch",
      v1PitchFromToken("C-2", "V1-OP-006"),
    );
    expectInputRefusal(unprojectableSpelling, {
      code: "voice_assignment.pitch_midi_mismatch",
      frame: "target",
      voiceOrdinal: 0,
      received: 48,
      expected: -12,
    });

    const unprojectablePair = requestFor();
    setRuntimeField(
      voiceAt(unprojectablePair.to.voices, 0, "target-0"),
      "pitch",
      v1PitchFromToken("C-2", "V1-OP-006"),
    );
    setRuntimeField(
      voiceAt(unprojectablePair.to.voices, 0, "target-0"),
      "midi",
      -12,
    );
    expectInputRefusal(unprojectablePair, {
      code: "voice_assignment.pitch_midi_mismatch",
      frame: "target",
      voiceOrdinal: 0,
      received: -12,
      expected: -12,
    });
  });

  test("V1-OP-007 preserves provenance correlations instead of repairing them", () => {
    const realizationDegree = requestFor();
    setRuntimeField(
      voiceAt(realizationDegree.to.voices, 0, "target-0"),
      "degree",
      null,
    );
    expectInputRefusal(realizationDegree, {
      code: "voice_assignment.provenance_invalid",
      reason: "realization-degree-missing",
      frame: "target",
      voiceOrdinal: 0,
    });

    const doublingIndex = requestFor("V1-ASN-006");
    setRuntimeField(
      voiceAt(doublingIndex.to.voices, 2, "target-2"),
      "sourceDegreeIndex",
      null,
    );
    expectInputRefusal(doublingIndex, {
      code: "voice_assignment.provenance_invalid",
      reason: "doubling-source-index-missing",
      frame: "target",
      voiceOrdinal: 2,
    });

    const slashDegree = requestFor();
    setRuntimeField(
      voiceAt(slashDegree.to.voices, 0, "target-0"),
      "provenance",
      "slash-bass",
    );
    expectInputRefusal(slashDegree, {
      code: "voice_assignment.provenance_invalid",
      reason: "slash-bass-degree-fabricated",
      frame: "target",
      voiceOrdinal: 0,
    });
  });

  test("V1-OP-008 validates exact role order, duplicates, and per-voice flags", () => {
    const roleOrder = requestFor("V1-ASN-011");
    const firstGuide = required(roleOrder.to.roles.guideDegrees[0], "guide-0");
    roleOrder.to.roles.guideDegrees[0] = required(
      roleOrder.to.roles.guideDegrees[1],
      "guide-1",
    );
    roleOrder.to.roles.guideDegrees[1] = firstGuide;
    expectInputRefusal(roleOrder, {
      code: "voice_assignment.role_context_invalid",
      reason: "degree-order-invalid",
      frame: "target",
      role: "guide",
    });

    const roleDuplicate = requestFor("V1-ASN-011");
    roleDuplicate.to.roles.colorDegrees[1] = structuredClone(
      required(roleDuplicate.to.roles.colorDegrees[0], "color-0"),
    );
    expectInputRefusal(roleDuplicate, {
      code: "voice_assignment.role_context_invalid",
      reason: "degree-duplicate",
      frame: "target",
      role: "color",
    });

    const guideFlag = requestFor("V1-ASN-011");
    setRuntimeField(
      voiceAt(guideFlag.to.voices, 1, "target-1"),
      "guideTone",
      false,
    );
    expectInputRefusal(guideFlag, {
      code: "voice_assignment.role_context_invalid",
      reason: "guide-flag-mismatch",
      frame: "target",
      role: "guide",
      voiceOrdinal: 1,
    });

    const colorFlag = requestFor("V1-ASN-011");
    setRuntimeField(
      voiceAt(colorFlag.to.voices, 0, "target-0"),
      "colorTone",
      true,
    );
    expectInputRefusal(colorFlag, {
      code: "voice_assignment.role_context_invalid",
      reason: "color-flag-mismatch",
      frame: "target",
      role: "color",
      voiceOrdinal: 0,
    });

    const unknownPolicy = requestFor();
    setRuntimeField(unknownPolicy.to.roles, "policyId", "other");
    expectInputRefusal(unknownPolicy, {
      code: "voice_assignment.role_context_invalid",
      reason: "role-policy-id-mismatch",
      frame: "target",
    });

    const byteOverflow = requestFor();
    setRuntimeField(byteOverflow.to.roles, "sourceId", "€".repeat(171));
    expectInputRefusal(byteOverflow, {
      code: "voice_assignment.role_context_invalid",
      reason: "role-source-id-invalid",
      frame: "target",
    });

    const versionOverflow = requestFor();
    setRuntimeField(versionOverflow.to.roles, "sourceVersion", 65_536);
    expectInputRefusal(versionOverflow, {
      code: "voice_assignment.role_context_invalid",
      reason: "role-source-version-invalid",
      frame: "target",
    });
  });

  test("V1-OP-009/010 validates request identity before source identities and gates digit correlation", () => {
    const malformedRequestId = requestFor();
    malformedRequestId.requestId = "req with space";
    expectInputRefusal(malformedRequestId, {
      code: "voice_assignment.request_id_invalid",
      reason: "pattern-mismatch",
      received: "req with space",
    });

    const equalEvents = requestFor();
    equalEvents.to.eventId = equalEvents.from.eventId;
    expectInputRefusal(equalEvents, {
      code: "voice_assignment.event_identity_invalid",
      reason: "source-and-target-event-equal",
    });

    const sourceRequest = requestFor();
    sourceRequest.from.requestId = "req-other";
    expectInputRefusal(sourceRequest, {
      code: "voice_assignment.source_request_mismatch",
      received: "req-other",
      expected: sourceRequest.requestId,
    });

    const digitMismatch = requestFor();
    setRuntimeField(
      voiceAt(digitMismatch.from.voices, 0, "source-0"),
      "voiceId",
      "voice-0002",
    );
    expectInputRefusal(digitMismatch, {
      code: "voice_assignment.voice_id_invalid",
      reason: "serial-digits-mismatch",
      frame: "source",
      voiceOrdinal: 0,
      received: "voice-0002",
      expectedSerial: 0,
    });

    const malformedVoiceId = requestFor();
    setRuntimeField(
      voiceAt(malformedVoiceId.from.voices, 0, "source-0"),
      "voiceId",
      "voice-000",
    );
    expectInputRefusal(malformedVoiceId, {
      code: "voice_assignment.voice_id_invalid",
      reason: "format-invalid",
      frame: "source",
      voiceOrdinal: 0,
      received: "voice-000",
    });

    const negativeSerial = requestFor();
    setRuntimeField(
      voiceAt(negativeSerial.from.voices, 0, "source-0"),
      "voiceSerial",
      -1,
    );
    expectInputRefusal(negativeSerial, {
      code: "voice_assignment.voice_serial_invalid",
      reason: "out-of-range",
      voiceOrdinal: 0,
      received: -1,
    });

    const fractionalSerial = requestFor();
    setRuntimeField(
      voiceAt(fractionalSerial.from.voices, 1, "source-1"),
      "voiceSerial",
      1.5,
    );
    expectInputRefusal(fractionalSerial, {
      code: "voice_assignment.voice_serial_invalid",
      reason: "non-integer",
      voiceOrdinal: 1,
      received: 1.5,
    });

    const duplicateId = requestFor();
    setRuntimeField(
      voiceAt(duplicateId.from.voices, 1, "source-1"),
      "voiceId",
      "voice-0000",
    );
    setRuntimeField(
      voiceAt(duplicateId.from.voices, 1, "source-1"),
      "voiceSerial",
      0,
    );
    expectInputRefusal(duplicateId, {
      code: "voice_assignment.voice_id_duplicate",
      firstOrdinal: 0,
      secondOrdinal: 1,
      voiceId: "voice-0000",
    });
  });

  test("V1-OP-011 accepts only the exhausted sentinel that remains above every assigned serial", () => {
    const sentinel = requestFor();
    sentinel.from.nextVoiceSerial = 4_096;
    const success = expectSuccess(sentinel);
    expect(success.value.frame.nextVoiceSerial).toBe(4_096);
    expect(success.evidence.voiceIdsAllocated).toBe(0);

    const outOfRange = requestFor();
    outOfRange.from.nextVoiceSerial = 4_097;
    expectInputRefusal(outOfRange, {
      code: "voice_assignment.next_voice_serial_invalid",
      reason: "out-of-range",
      received: 4_097,
    });

    const notAbove = requestFor();
    notAbove.from.nextVoiceSerial = 2;
    expectInputRefusal(notAbove, {
      code: "voice_assignment.next_voice_serial_invalid",
      reason: "not-above-assigned-serial",
      received: 2,
    });
  });

  test("V1-OP-012/013 reports every exact invalid lock field and never relaxes it", () => {
    const scenarios = [
      {
        reason: "stale-request",
        mutate(request: RuntimeTransitionRequest): void {
          required(request.locks[0], "lock-0").requestId = "req-other";
        },
      },
      {
        reason: "stale-event",
        mutate(request: RuntimeTransitionRequest): void {
          required(request.locks[0], "lock-0").eventId = request.from.eventId;
        },
      },
      {
        reason: "source-voice-missing",
        mutate(request: RuntimeTransitionRequest): void {
          required(request.locks[0], "lock-0").voiceId = "voice-0999";
        },
      },
      {
        reason: "target-pitch-missing",
        mutate(request: RuntimeTransitionRequest): void {
          required(request.locks[0], "lock-0").pitch = v1PitchFromToken(
            "F#7",
            "V1-OP-013",
          );
        },
      },
      {
        reason: "target-degree-mismatch",
        mutate(request: RuntimeTransitionRequest): void {
          required(request.locks[0], "lock-0").degree = v1DegreeFromToken(
            "b5",
            "V1-OP-013",
          );
        },
      },
    ] as const;

    for (const scenario of scenarios) {
      const request = requestFor("V1-ASN-013");
      scenario.mutate(request);
      const result = expectInputRefusal(request, {
        code: "voice_assignment.lock_invalid",
        reason: scenario.reason,
        path: ["locks", 0],
        lockOrdinal: 0,
      });
      expect(result.locks.map(({ status }) => status)).toEqual([
        scenario.reason,
      ]);
    }

    const duplicate = requestFor("V1-ASN-013");
    duplicate.locks.push(structuredClone(required(duplicate.locks[0], "lock-0")));
    expectInputRefusal(duplicate, {
      code: "voice_assignment.lock_invalid",
      reason: "duplicate-lock",
      path: ["locks", 1],
      lockOrdinal: 1,
    });
  });

  test("V1-OP-014/015 keeps eligible locks hard and checks ID capacity only after selection", () => {
    const crossing = requestFor("V1-ASN-014");
    const crossingResult = expectNoAssignment(
      crossing,
      "locked-order-crossing",
      [0, 1],
    );
    expect(crossingResult.locks.map(({ status }) => status)).toEqual([
      "eligible",
      "eligible",
    ]);

    const conflict = requestFor("V1-ASN-014");
    const firstLock = required(conflict.locks[0], "lock-0");
    const secondLock = required(conflict.locks[1], "lock-1");
    secondLock.pitch = structuredClone(firstLock.pitch);
    secondLock.degree = structuredClone(firstLock.degree);
    const conflictResult = expectNoAssignment(
      conflict,
      "lock-conflict",
      [0, 1],
    );
    expect(conflictResult.locks.map(({ status }) => status)).toEqual([
      "eligible",
      "eligible",
    ]);

    const exhausted = requestFor("V1-ASN-008");
    exhausted.from.nextVoiceSerial = 4_096;
    const exhaustedResult = expectNoAssignment(
      exhausted,
      "voice-id-space-exhausted",
      [],
    );
    expect(exhaustedResult.locks).toEqual([]);
    expect(exhaustedResult.evidence.voiceIdsAllocated).toBe(0);
    expect(exhaustedResult.evidence.matrixCellsVisited).toBeGreaterThan(0);
  });
});
