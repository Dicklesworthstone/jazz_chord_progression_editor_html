import { expect, test } from "bun:test";

import type { SpelledPitch } from "../../src/domain";
import {
  assignVoiceTransition,
  type AssignVoiceTransitionRequest,
  type AssignVoiceTransitionResult,
} from "../../src/theory";
import lawFixture from "../fixtures/voice-assignment/law-cases.json";
import {
  buildV1TransitionRequest,
  v1AssignmentCase,
} from "../support/v1-assignment-fixtures";
import {
  isDetachedFromInput,
  isRecursivelyFrozen,
  stableV1EvidenceJson,
  v1EvidenceDigest,
} from "../support/v1-conformance";
import { v1IndependentOracleResult } from
  "../support/v1-independent-oracle";

type MutablePitch = {
  step: SpelledPitch["step"];
  alter: SpelledPitch["alter"];
  octave: number;
};
type MutableVoice = {
  midi: number;
  pitch: MutablePitch;
};
type MutableLock = { pitch: MutablePitch };
type MutableRequest = {
  from: { voices: MutableVoice[] };
  to: { voices: MutableVoice[] };
  locks: MutableLock[];
};
type ScenarioObservation = Readonly<{
  caseId: string;
  baseResultSha256: string;
  baseReplayResultSha256: string;
  transposedResultSha256: string;
  transposedReplayResultSha256: string;
  baseInvariantProjectionSha256: string;
  transposedInvariantProjectionSha256: string;
  invariantPreserved: boolean;
  baseInputUnchanged: boolean;
  transposedInputUnchanged: boolean;
  baseRecursivelyFrozen: boolean;
  transposedRecursivelyFrozen: boolean;
  baseDetachedFromInput: boolean;
  transposedDetachedFromInput: boolean;
  baseOracleProjectionSha256: string | null;
  transposedOracleProjectionSha256: string | null;
  independentOracleMatched: boolean | null;
  observationDigest: string;
}>;
type LawCheck =
  | "deterministic-replay"
  | "immutable-detached-results"
  | "independent-small-case-oracle"
  | "metamorphic-invariant-projection";

const TRANSPOSE_SEMITONES = 12;
const SCENARIO_CASE_IDS = Object.freeze([
  ...new Set(
    lawFixture.cases.flatMap(({ transpositionCaseIds }) =>
      transpositionCaseIds
    ),
  ),
]);
const LAW_CHECKS: Readonly<Record<string, LawCheck>> = Object.freeze({
  "V1-LAW-001": "deterministic-replay",
  "V1-LAW-002": "metamorphic-invariant-projection",
  "V1-LAW-003": "metamorphic-invariant-projection",
  "V1-LAW-004": "metamorphic-invariant-projection",
  "V1-LAW-005": "metamorphic-invariant-projection",
  "V1-LAW-006": "metamorphic-invariant-projection",
  "V1-LAW-007": "metamorphic-invariant-projection",
  "V1-LAW-008": "metamorphic-invariant-projection",
  "V1-LAW-009": "metamorphic-invariant-projection",
  "V1-LAW-010": "immutable-detached-results",
  "V1-LAW-011": "metamorphic-invariant-projection",
  "V1-LAW-012": "independent-small-case-oracle",
});

function requestFor(caseId: string): AssignVoiceTransitionRequest {
  const recipe = v1AssignmentCase(caseId);
  if (recipe.kind !== "transition") {
    throw new Error(`V1_TRANSPOSITION_RECIPE:${caseId}`);
  }
  return buildV1TransitionRequest(recipe);
}

function transpose(
  request: AssignVoiceTransitionRequest,
): AssignVoiceTransitionRequest {
  const copy = structuredClone(request) as unknown as MutableRequest;
  for (const frame of [copy.from, copy.to]) {
    for (const voice of frame.voices) {
      voice.midi += TRANSPOSE_SEMITONES;
      voice.pitch.octave += 1;
    }
  }
  for (const lock of copy.locks) lock.pitch.octave += 1;
  return copy as unknown as AssignVoiceTransitionRequest;
}

function successProjection(
  result: Extract<AssignVoiceTransitionResult, { ok: true }>,
) {
  const { value } = result;
  return {
    outcome: "success",
    operationPath: value.explanation.operationPath,
    outputIdentities: value.frame.voices.map(({ voiceId, voiceSerial }) => ({
      voiceId,
      voiceSerial,
    })),
    nextVoiceSerial: value.frame.nextVoiceSerial,
    arcs: value.arcs.map((arc) => ({
      kind: arc.kind,
      identityDisposition: arc.identityDisposition,
      identity: arc.identity,
      sourceOrdinal: arc.from?.ordinal ?? null,
      targetOrdinal: arc.to?.ordinal ?? null,
      semitones: arc.semitones,
      absoluteSemitones: arc.absoluteSemitones,
      motion: arc.motion,
      exactMidiIdentity: arc.exactMidiIdentity,
      pitchClassIdentity: arc.pitchClassIdentity,
      spelledPitchClassIdentity: arc.spelledPitchClassIdentity,
      spelledPitchIdentity: arc.spelledPitchIdentity,
      degreeIdentity: arc.degreeIdentity,
      commonTone: arc.commonTone,
      guideTone: arc.guideTone,
      guideToneContinuity: arc.guideToneContinuity,
    })),
    relations: value.relations,
    locks: value.locks,
    selectionFacts: {
      alignmentCost: value.cost.alignmentCost,
      gapCount: value.cost.gapCount,
      enteringVoices: value.cost.enteringVoices,
      leavingVoices: value.cost.leavingVoices,
      totalAbsoluteMotion: value.cost.totalAbsoluteMotion,
      maximumAbsoluteLeap: value.cost.maximumAbsoluteLeap,
      pitchClassCommonTones: value.cost.pitchClassCommonTones,
      exactSustains: value.cost.exactSustains,
      spelledPitchClassContinuities:
        value.cost.spelledPitchClassContinuities,
      spelledPitchContinuities: value.cost.spelledPitchContinuities,
      commonTonesLost: value.cost.commonTonesLost,
      guideToneContinuities: value.cost.guideToneContinuities,
      guideTonesLost: value.cost.guideTonesLost,
      doubledGuideTones: value.cost.doubledGuideTones,
      omittedColors: value.cost.omittedColors,
      totalSpan: value.cost.totalSpan,
    },
    orderKey: value.orderKey,
    evidence: result.evidence,
  };
}

function refusalProjection(
  result: Extract<AssignVoiceTransitionResult, { ok: false }>,
) {
  return {
    outcome: "refusal",
    refusal: result.refusal,
    locks: result.locks,
    evidence: result.evidence,
  };
}

function invariantProjection(result: AssignVoiceTransitionResult): unknown {
  return result.ok ? successProjection(result) : refusalProjection(result);
}

function oracleProjection(
  request: AssignVoiceTransitionRequest,
  result: AssignVoiceTransitionResult,
): unknown {
  if (!result.ok) throw new Error("V1_TRANSPOSITION_ORACLE_REFUSAL");
  const oracle = v1IndependentOracleResult(request);
  const expected = {
    operationPath: oracle.winner.path,
    cost: oracle.winner.cost,
    orderKey: [
      ...oracle.winner.selectionPrefix,
      oracle.winner.path,
    ] as const,
  };
  const actual = {
    operationPath: result.value.explanation.operationPath,
    cost: result.value.cost,
    orderKey: result.value.orderKey,
  };
  expect(actual, "V1-LAW-012 independent oracle").toEqual(expected);
  return expected;
}

function observeScenario(caseId: string): ScenarioObservation {
  const request = requestFor(caseId);
  const transposedRequest = transpose(request);
  const requestBefore = stableV1EvidenceJson(request);
  const transposedBefore = stableV1EvidenceJson(transposedRequest);
  const baseResult = assignVoiceTransition(request);
  const baseReplay = assignVoiceTransition(request);
  const transposedResult = assignVoiceTransition(transposedRequest);
  const transposedReplay = assignVoiceTransition(transposedRequest);

  const baseResultSha256 = v1EvidenceDigest(baseResult);
  const transposedResultSha256 = v1EvidenceDigest(transposedResult);
  const baseInvariantProjectionSha256 = v1EvidenceDigest(
    invariantProjection(baseResult),
  );
  const transposedInvariantProjectionSha256 = v1EvidenceDigest(
    invariantProjection(transposedResult),
  );
  expect(baseResult.ok, caseId).toBe(transposedResult.ok);
  expect(v1EvidenceDigest(baseReplay), `${caseId}:base replay`).toBe(
    baseResultSha256,
  );
  expect(v1EvidenceDigest(transposedReplay), `${caseId}:shifted replay`).toBe(
    transposedResultSha256,
  );
  expect(
    transposedInvariantProjectionSha256,
    `${caseId}:invariant projection`,
  ).toBe(baseInvariantProjectionSha256);
  expect(stableV1EvidenceJson(request), `${caseId}:base mutation`).toBe(
    requestBefore,
  );
  expect(
    stableV1EvidenceJson(transposedRequest),
    `${caseId}:shifted mutation`,
  ).toBe(transposedBefore);
  expect(isRecursivelyFrozen(baseResult), `${caseId}:base frozen`).toBe(true);
  expect(
    isRecursivelyFrozen(transposedResult),
    `${caseId}:shifted frozen`,
  ).toBe(true);
  expect(
    isDetachedFromInput(baseResult, request),
    `${caseId}:base detached`,
  ).toBe(true);
  expect(
    isDetachedFromInput(transposedResult, transposedRequest),
    `${caseId}:shifted detached`,
  ).toBe(true);

  const baseOracleProjectionSha256 = caseId === "V1-ASN-016"
    ? v1EvidenceDigest(oracleProjection(request, baseResult))
    : null;
  const transposedOracleProjectionSha256 = caseId === "V1-ASN-016"
    ? v1EvidenceDigest(oracleProjection(transposedRequest, transposedResult))
    : null;
  if (caseId === "V1-ASN-016") {
    expect(transposedOracleProjectionSha256, `${caseId}:oracle invariant`)
      .toBe(baseOracleProjectionSha256);
  }

  const row = {
    caseId,
    baseResultSha256,
    baseReplayResultSha256: v1EvidenceDigest(baseReplay),
    transposedResultSha256,
    transposedReplayResultSha256: v1EvidenceDigest(transposedReplay),
    baseInvariantProjectionSha256,
    transposedInvariantProjectionSha256,
    invariantPreserved: true,
    baseInputUnchanged: true,
    transposedInputUnchanged: true,
    baseRecursivelyFrozen: true,
    transposedRecursivelyFrozen: true,
    baseDetachedFromInput: true,
    transposedDetachedFromInput: true,
    baseOracleProjectionSha256,
    transposedOracleProjectionSha256,
    independentOracleMatched: caseId === "V1-ASN-016" ? true : null,
  } as const;
  return Object.freeze({
    ...row,
    observationDigest: v1EvidenceDigest(row),
  });
}

function lawCheckPassed(
  check: LawCheck,
  observations: readonly ScenarioObservation[],
): boolean {
  if (check === "deterministic-replay") {
    return observations.every((row) =>
      row.baseResultSha256 === row.baseReplayResultSha256 &&
      row.transposedResultSha256 === row.transposedReplayResultSha256
    );
  }
  if (check === "immutable-detached-results") {
    return observations.every((row) =>
      row.baseInputUnchanged &&
      row.transposedInputUnchanged &&
      row.baseRecursivelyFrozen &&
      row.transposedRecursivelyFrozen &&
      row.baseDetachedFromInput &&
      row.transposedDetachedFromInput
    );
  }
  if (check === "independent-small-case-oracle") {
    return observations.every((row) =>
      row.independentOracleMatched === true &&
      row.baseOracleProjectionSha256 !== null &&
      row.baseOracleProjectionSha256 === row.transposedOracleProjectionSha256
    );
  }
  return observations.every((row) =>
    row.invariantPreserved &&
    row.baseInvariantProjectionSha256 ===
      row.transposedInvariantProjectionSha256
  );
}

function buildEvidence(): Readonly<{
  observations: readonly ScenarioObservation[];
  lawBindings: readonly Readonly<Record<string, unknown>>[];
}> {
  const observations = Object.freeze(SCENARIO_CASE_IDS.map(observeScenario));
  const byCaseId = new Map(observations.map((row) => [row.caseId, row]));
  const lawBindings = Object.freeze(lawFixture.cases.map((law) => {
    const rows = law.transpositionCaseIds.map((caseId) => {
      const row = byCaseId.get(caseId);
      if (row === undefined) {
        throw new Error(`V1_TRANSPOSITION_LAW_SCENARIO:${law.id}:${caseId}`);
      }
      return row;
    });
    const check = LAW_CHECKS[law.id];
    if (check === undefined) {
      throw new Error(`V1_TRANSPOSITION_LAW_CHECK:${law.id}`);
    }
    const checkPassed = lawCheckPassed(check, rows);
    expect(checkPassed, law.id).toBe(true);
    const binding = {
      lawId: law.id,
      law: law.law,
      scenarioCaseIds: law.transpositionCaseIds,
      scenarioObservationSha256: rows.map(({ observationDigest }) =>
        observationDigest
      ),
      check,
      checkPassed: true,
    } as const;
    return Object.freeze({
      ...binding,
      bindingDigest: v1EvidenceDigest(binding),
    });
  }));
  return Object.freeze({ observations, lawBindings });
}

test(
  "transposes gap, lock, role, motion, identity, oracle, and maximum-bound scenarios without changing invariant semantics",
  () => {
    const evidence = buildEvidence();
    expect(evidence.observations).toHaveLength(SCENARIO_CASE_IDS.length);
    expect(evidence.lawBindings).toHaveLength(lawFixture.cases.length);
    console.log(`V1_TRANSPOSITION_OBSERVATION ${stableV1EvidenceJson({
      schema: "changes.evidence.v1-transposition-laws.v1",
      semitones: TRANSPOSE_SEMITONES,
      observations: evidence.observations,
      lawBindings: evidence.lawBindings,
      status: "pass",
    })}`);
  },
);

test("binds every V1 law to at least one applicable transposition scenario", () => {
  expect(lawFixture.cases.map(({ id }) => id)).toEqual(
    Array.from(
      { length: 12 },
      (_, index) => `V1-LAW-${String(index + 1).padStart(3, "0")}`,
    ),
  );
  expect(Object.keys(LAW_CHECKS)).toEqual(lawFixture.cases.map(({ id }) => id));
  const scenarioIds = new Set(SCENARIO_CASE_IDS);
  for (const law of lawFixture.cases) {
    expect(law.transpositionCaseIds.length, law.id).toBeGreaterThan(0);
    expect(
      law.transpositionCaseIds.every((caseId) => scenarioIds.has(caseId)),
      law.id,
    ).toBe(true);
  }
});
