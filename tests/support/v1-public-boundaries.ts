import { makeChordDegree, type ChordDegree } from "../../src/domain";
import {
  assignVoiceTransition,
  VOICE_ASSIGNMENT_LOCK_SCHEMA,
  type AssignVoiceTransitionRequest,
  type AssignVoiceTransitionResult,
} from "../../src/theory";
import {
  executeV1AccountingProbe,
  type V1AccountingProbeFixtureRow,
} from "../../src/test-support/v1-accounting-probes";
import limitFixtureValue from
  "../fixtures/voice-assignment/limit-cases.json";
import {
  buildV1TransitionRequest,
  v1AssignmentCase,
} from "./v1-assignment-fixtures";
import { v1EvidenceDigest } from "./v1-conformance";

type MutableVoice = {
  ordinal: number;
  midi: number;
  pitch: unknown;
  degree: ChordDegree | null;
  guideTone: boolean;
  colorTone: boolean;
  voiceId?: string;
  voiceSerial?: number;
};

type MutableRoles = {
  guideDegrees: ChordDegree[];
  colorDegrees: ChordDegree[];
  sourceVersion: number;
};

type MutableFrame = {
  requestId?: string;
  eventId: unknown;
  voices: MutableVoice[];
  roles: MutableRoles;
  nextVoiceSerial?: number;
};

type MutableLock = {
  schema: string;
  requestId: string;
  eventId: unknown;
  voiceId: string;
  pitch: unknown;
  degree: ChordDegree | null;
};

type MutableTransitionRequest = {
  requestId: string;
  from: MutableFrame;
  to: MutableFrame;
  locks: MutableLock[];
};

export type V1PublicBoundaryObservation = Readonly<{
  caseId: string;
  fixtureRecordSha256: string;
  exactOutcomeSha256: string;
  nearMissOutcomeSha256: string;
  exactAccepted: true;
  nearMissAccepted: false;
  outcome: "pass";
  observationDigest: string;
}>;

type PublicBoundaryFixtureRow = Readonly<{
  id: string;
  nearMissOutcome: unknown;
}> & Readonly<Record<string, unknown>>;

type SuccessfulTransition = Extract<
  AssignVoiceTransitionResult,
  Readonly<{ ok: true }>
>;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function matchesReviewedSubset(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(expected)) {
    return Array.isArray(actual) &&
      actual.length === expected.length &&
      expected.every((item, index) =>
        matchesReviewedSubset(actual[index], item)
      );
  }
  if (isRecord(expected)) {
    return isRecord(actual) && Object.entries(expected).every(([key, item]) =>
      Object.hasOwn(actual, key) && matchesReviewedSubset(actual[key], item)
    );
  }
  return Object.is(actual, expected);
}

function verifyReviewedBoundary(
  fixtureRow: PublicBoundaryFixtureRow,
  exact: unknown,
  near: unknown,
): void {
  if (fixtureRow.id === "V1-LIM-009") {
    if (
      !isRecord(exact) || exact["minimumPathLength"] !== 3 ||
      exact["maximumPathLength"] !== 14 ||
      !isRecord(near) || near["belowMinimumRejectedByTypeContract"] !== true ||
      !isRecord(near["maximumPlusOne"]) ||
      near["maximumPlusOne"]["accepted"] !== false
    ) {
      throw new Error("V1_BOUNDARY_REVIEWED:V1-LIM-009");
    }
    return;
  }
  if (
    !isRecord(exact) || exact["ok"] !== true ||
    !isRecord(near) || near["ok"] !== false ||
    !isRecord(near["refusal"]) ||
    near["evidence"] === undefined ||
    !isRecord(near["evidence"]) ||
    near["evidence"]["termination"] !== "request-invalid" ||
    !matchesReviewedSubset(near["refusal"], fixtureRow.nearMissOutcome)
  ) {
    throw new Error(`V1_BOUNDARY_REVIEWED:${fixtureRow.id}`);
  }
}

function mutableRequest(caseId: string): MutableTransitionRequest {
  const recipe = v1AssignmentCase(caseId);
  if (recipe.kind !== "transition") {
    throw new Error(`V1_BOUNDARY_RECIPE:${caseId}`);
  }
  return structuredClone(
    buildV1TransitionRequest(recipe),
  ) as unknown as MutableTransitionRequest;
}

function run(request: MutableTransitionRequest): AssignVoiceTransitionResult {
  return assignVoiceTransition(
    request as unknown as AssignVoiceTransitionRequest,
  );
}

function requireAccepted(
  result: AssignVoiceTransitionResult,
  caseId: string,
): asserts result is SuccessfulTransition {
  if (!result.ok) throw new Error(`V1_BOUNDARY_EXACT:${caseId}:${result.refusal.code}`);
}

function requireRefusal(
  result: AssignVoiceTransitionResult,
  caseId: string,
  code: string,
): void {
  if (result.ok || result.refusal.code !== code) {
    throw new Error(
      `V1_BOUNDARY_NEAR:${caseId}:${result.ok ? "success" : result.refusal.code}`,
    );
  }
}

function resultPair(
  caseId: string,
  exact: AssignVoiceTransitionResult,
  near: AssignVoiceTransitionResult,
  nearCode: string,
): readonly [unknown, unknown] {
  requireAccepted(exact, caseId);
  requireRefusal(near, caseId, nearCode);
  return Object.freeze([exact, near]);
}

function degree(number: ChordDegree["number"], alter: ChordDegree["alter"]): ChordDegree {
  const result = makeChordDegree({ number, alter });
  if (!result.ok) throw new Error(`V1_BOUNDARY_DEGREE:${result.refusal.code}`);
  return result.value;
}

function unrelatedDegrees(count: number): ChordDegree[] {
  const numbers = [1, 2, 3, 4, 5, 6, 7, 9, 11, 13] as const;
  const alters = [-2, -1, 0, 1, 2] as const;
  const values: ChordDegree[] = [];
  for (const number of numbers) {
    for (const alter of alters) {
      if ((number === 1 || number === 3 || number === 5) && alter === 0) {
        continue;
      }
      values.push(degree(number, alter));
      if (values.length === count) return values;
    }
  }
  throw new Error(`V1_BOUNDARY_DEGREE_COUNT:${count.toString()}`);
}

function boundaryOutcome(caseId: string): readonly [unknown, unknown] {
  switch (caseId) {
    case "V1-LIM-001": {
      const exact = run(mutableRequest("V1-ASN-002"));
      const nearRequest = mutableRequest("V1-ASN-002");
      nearRequest.to.voices.splice(2, 1);
      return resultPair(
        caseId,
        exact,
        run(nearRequest),
        "voice_assignment.voice_count_invalid",
      );
    }
    case "V1-LIM-002": {
      const exact = run(mutableRequest("V1-ASN-018"));
      const nearRequest = mutableRequest("V1-ASN-018");
      const seventh = nearRequest.to.voices[6];
      if (seventh === undefined) throw new Error("V1_BOUNDARY_SEVENTH_VOICE");
      nearRequest.to.voices.push({ ...seventh, ordinal: 7 });
      return resultPair(
        caseId,
        exact,
        run(nearRequest),
        "voice_assignment.voice_count_invalid",
      );
    }
    case "V1-LIM-003": {
      const exactRequest = mutableRequest("V1-ASN-002");
      exactRequest.requestId = "r".repeat(128);
      exactRequest.from.requestId = exactRequest.requestId;
      const nearRequest = mutableRequest("V1-ASN-002");
      nearRequest.requestId = "r".repeat(129);
      nearRequest.from.requestId = nearRequest.requestId;
      return resultPair(
        caseId,
        run(exactRequest),
        run(nearRequest),
        "voice_assignment.request_id_invalid",
      );
    }
    case "V1-LIM-004": {
      const exactRequest = mutableRequest("V1-ASN-002");
      const exactVoice = exactRequest.from.voices[0];
      if (exactVoice === undefined) throw new Error("V1_BOUNDARY_SOURCE_VOICE");
      exactVoice.voiceId = "voice-4095";
      exactVoice.voiceSerial = 4095;
      exactRequest.from.nextVoiceSerial = 4096;
      const nearRequest = structuredClone(exactRequest);
      const nearVoice = nearRequest.from.voices[0];
      if (nearVoice === undefined) throw new Error("V1_BOUNDARY_SOURCE_VOICE");
      nearVoice.voiceId = "voice-4096";
      nearVoice.voiceSerial = 4096;
      return resultPair(
        caseId,
        run(exactRequest),
        run(nearRequest),
        "voice_assignment.voice_serial_invalid",
      );
    }
    case "V1-LIM-005": {
      const exactRequest = mutableRequest("V1-ASN-002");
      exactRequest.from.nextVoiceSerial = 4096;
      const nearRequest = mutableRequest("V1-ASN-002");
      nearRequest.from.nextVoiceSerial = 4097;
      return resultPair(
        caseId,
        run(exactRequest),
        run(nearRequest),
        "voice_assignment.next_voice_serial_invalid",
      );
    }
    case "V1-LIM-006": {
      const exactRequest = mutableRequest("V1-ASN-018");
      exactRequest.locks = exactRequest.from.voices.map((voice, ordinal) => {
        const target = exactRequest.to.voices[ordinal];
        if (target === undefined || voice.voiceId === undefined) {
          throw new Error(`V1_BOUNDARY_LOCK:${ordinal.toString()}`);
        }
        return {
          schema: VOICE_ASSIGNMENT_LOCK_SCHEMA,
          requestId: exactRequest.requestId,
          eventId: exactRequest.to.eventId,
          voiceId: voice.voiceId,
          pitch: target.pitch,
          degree: target.degree,
        };
      });
      const nearRequest = structuredClone(exactRequest);
      const firstLock = nearRequest.locks[0];
      if (firstLock === undefined) throw new Error("V1_BOUNDARY_FIRST_LOCK");
      nearRequest.locks.push(structuredClone(firstLock));
      return resultPair(
        caseId,
        run(exactRequest),
        run(nearRequest),
        "voice_assignment.lock_limit_exceeded",
      );
    }
    case "V1-LIM-007": {
      const exactRequest = mutableRequest("V1-ASN-002");
      exactRequest.to.roles.colorDegrees = unrelatedDegrees(16);
      const nearRequest = structuredClone(exactRequest);
      nearRequest.to.roles.colorDegrees.push(...unrelatedDegrees(17).slice(16));
      return resultPair(
        caseId,
        run(exactRequest),
        run(nearRequest),
        "voice_assignment.role_context_invalid",
      );
    }
    case "V1-LIM-008": {
      const exactRequest = mutableRequest("V1-ASN-002");
      exactRequest.to.roles.sourceVersion = 65_535;
      const nearRequest = mutableRequest("V1-ASN-002");
      nearRequest.to.roles.sourceVersion = 65_536;
      return resultPair(
        caseId,
        run(exactRequest),
        run(nearRequest),
        "voice_assignment.role_context_invalid",
      );
    }
    case "V1-LIM-009": {
      const minimum = run(mutableRequest("V1-ASN-002"));
      const maximum = run(mutableRequest("V1-ASN-018"));
      requireAccepted(minimum, caseId);
      requireAccepted(maximum, caseId);
      if (
        minimum.value.explanation.operationPath.length !== 3 ||
        maximum.value.explanation.operationPath.length !== 14
      ) {
        throw new Error("V1_BOUNDARY_OPERATION_PATH");
      }
      const fixture = limitFixtureValue as Readonly<{
        derivedAccountingProbes: readonly V1AccountingProbeFixtureRow[];
      }>;
      const plusOne = fixture.derivedAccountingProbes.find(
        ({ counter }) => counter === "backtraceSteps",
      );
      if (plusOne === undefined) throw new Error("V1_BOUNDARY_BACKTRACE_PROBE");
      const probe = executeV1AccountingProbe(plusOne);
      return Object.freeze([
        Object.freeze({
          minimumPathLength: 3,
          maximumPathLength: 14,
          minimumResult: minimum,
          maximumResult: maximum,
        }),
        Object.freeze({
          belowMinimumRejectedByTypeContract: true,
          maximumPlusOne: probe.exactPlusOne,
        }),
      ]);
    }
    default:
      throw new Error(`V1_BOUNDARY_UNKNOWN:${caseId}`);
  }
}

export function buildV1PublicBoundaryObservations(): readonly V1PublicBoundaryObservation[] {
  const fixture = limitFixtureValue as unknown as Readonly<{
    publicBoundaries: readonly PublicBoundaryFixtureRow[];
  }>;
  return Object.freeze(fixture.publicBoundaries.map((fixtureRow) => {
    const caseId = fixtureRow.id;
    const [exact, near] = boundaryOutcome(caseId);
    verifyReviewedBoundary(fixtureRow, exact, near);
    const row = Object.freeze({
      caseId,
      fixtureRecordSha256: v1EvidenceDigest(fixtureRow),
      exactOutcomeSha256: v1EvidenceDigest(exact),
      nearMissOutcomeSha256: v1EvidenceDigest(near),
      exactAccepted: true as const,
      nearMissAccepted: false as const,
      outcome: "pass" as const,
    });
    return Object.freeze({
      ...row,
      observationDigest: v1EvidenceDigest(row),
    });
  }));
}
