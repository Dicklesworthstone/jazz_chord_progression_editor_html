import { describe, expect, test } from "bun:test";

import transpositionFixtureValue from "../fixtures/voicing/transposition-seeds.json";

import { makeAutoVoicing } from "../../src/domain";
import {
  parseChordSymbol,
  realizeVoicing,
  resolveChord,
  type AutoVoicingRequest,
  type GeneratedVoicingResult,
  type RealizeVoicingResult,
  type StoredVoicingResult,
  type VoicingCandidate,
} from "../../src/theory";
import {
  V0_CANDIDATE_CASES,
  buildV0CandidateRequest,
  findV0CandidateWithExpectedVoices,
  v0DegreeToken,
  type V0AutoCandidateCaseRecipe,
  type V0CandidateRefusalExpectation,
  type V0CandidateSuccessExpectation,
  type V0StoredCandidateCaseRecipe,
} from "../support/v0-voicing-fixture";
import {
  auditV0GeneratedResultSet,
  v0TwoOctaveDoublingAuditControl,
} from "../support/v0-conformance-harness";

type GeneratedVoicingSuccess = Extract<GeneratedVoicingResult, { ok: true }>;

type V0WeaveTranspositionRoot = Readonly<{
  symbol: string;
  step: "A" | "B" | "C" | "D" | "E" | "F" | "G";
  alter: number;
  pitchClass: number;
}>;

type V0WeaveTranspositionSeed = Readonly<{
  id: "V0-TRANS-017";
  sourceCaseId: "V0-CAND-001";
  sourceSymbol: "Cmaj7";
  selectedDegreeOrder: readonly ["1", "3", "5", "7"];
  orderedDegrees: readonly ["1", "5", "7", "3"];
  relativeMidiFromLowest: readonly [0, 7, 11, 16];
  proofRange: Readonly<{
    lowMidi: 60;
    highMidi: 84;
    transposeWithRoot: true;
  }>;
  expected: Readonly<{
    rootCells: 12;
    rawCandidateCount: 9;
    retainedCandidateCount: 9;
    rawGenerationOrdinal: 4;
    retainedOrdinal: 7;
    templateOrderDisplacement: 4;
    cyclicPrefilterPermitted: false;
  }>;
}>;

type V0AdaptiveSlotTranspositionSeed = Readonly<{
  id: "V0-TRANS-010";
  realizationId: "alt-b9-b5";
  insufficientSlotRefusalProof: Readonly<{
    sourceCaseId: "V0-CAND-033";
    rootCells: 12;
    voiceCount: 3;
    mandatoryDegreeOrder: readonly ["1", "3", "b5", "b7", "b9"];
    reasons: readonly ["required-degree-omitted", "guide-tone-omitted"];
    omittedRequiredDegrees: readonly ["b7", "b9"];
    omittedGuideToneDegrees: readonly ["b7"];
    voiceCountReasonPresent: false;
  }>;
}>;

type V0ConstraintObservationOverflowTranspositionSeed = Readonly<{
  id: "V0-TRANS-018";
  sourceOperationCaseId: "V0-OP-REFUSAL-016";
  sourceSymbol: "Cmaj7/E";
  realizationId: "literal";
  family: "balanced";
  proofRange: Readonly<{
    lowMidi: 24;
    highMidi: 95;
    transposeWithRoot: true;
  }>;
  observationOverflowProof: Readonly<{
    rootCells: 12;
    completeSearchNoLegalCandidate: true;
    constraintObservationLimit: 16;
    expectedRefusal: Readonly<{
      code: "limit.voicing_work_exceeded";
      path: readonly [];
      counter: "constraintObservationsProduced";
      received: 17;
      maximum: 16;
      partialResult: false;
    }>;
    sourceCellEvidence: Readonly<{
      rootId: "V0-ROOT-001";
      rootSymbol: "C";
      constraintObservationComparisons: 163;
      constraintObservationsProduced: 16;
      peakConstraintObservationRecords: 16;
      peakTrackedRecords: 161;
      termination: "work-limit-exceeded";
    }>;
    perRootConstraintObservationComparisons: readonly Readonly<{
      rootId: string;
      rootSymbol: string;
      comparisons: number;
    }>[];
    allRootInvariants: Readonly<{
      constraintObservationsProduced: 16;
      peakConstraintObservationRecords: 16;
      peakTrackedRecords: 161;
      termination: "work-limit-exceeded";
    }>;
  }>;
}>;

const V0_CONSTRAINT_OBSERVATION_TRANSPOSITIONS = [
  {
    root: { symbol: "C", step: "C", alter: 0, pitchClass: 0 },
    bass: { symbol: "E", step: "E", alter: 0 },
  },
  {
    root: { symbol: "Db", step: "D", alter: -1, pitchClass: 1 },
    bass: { symbol: "F", step: "F", alter: 0 },
  },
  {
    root: { symbol: "D", step: "D", alter: 0, pitchClass: 2 },
    bass: { symbol: "F#", step: "F", alter: 1 },
  },
  {
    root: { symbol: "Eb", step: "E", alter: -1, pitchClass: 3 },
    bass: { symbol: "G", step: "G", alter: 0 },
  },
  {
    root: { symbol: "E", step: "E", alter: 0, pitchClass: 4 },
    bass: { symbol: "G#", step: "G", alter: 1 },
  },
  {
    root: { symbol: "F", step: "F", alter: 0, pitchClass: 5 },
    bass: { symbol: "A", step: "A", alter: 0 },
  },
  {
    root: { symbol: "F#", step: "F", alter: 1, pitchClass: 6 },
    bass: { symbol: "A#", step: "A", alter: 1 },
  },
  {
    root: { symbol: "G", step: "G", alter: 0, pitchClass: 7 },
    bass: { symbol: "B", step: "B", alter: 0 },
  },
  {
    root: { symbol: "Ab", step: "A", alter: -1, pitchClass: 8 },
    bass: { symbol: "C", step: "C", alter: 0 },
  },
  {
    root: { symbol: "A", step: "A", alter: 0, pitchClass: 9 },
    bass: { symbol: "C#", step: "C", alter: 1 },
  },
  {
    root: { symbol: "Bb", step: "B", alter: -1, pitchClass: 10 },
    bass: { symbol: "D", step: "D", alter: 0 },
  },
  {
    root: { symbol: "B", step: "B", alter: 0, pitchClass: 11 },
    bass: { symbol: "D#", step: "D", alter: 1 },
  },
] as const;

const V0_WEAVE_TRANSPOSITION_ROOTS = (
  transpositionFixtureValue as unknown as Readonly<{
    roots: readonly V0WeaveTranspositionRoot[];
  }>
).roots;

function isJsonRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isGeneratedSuccess(
  result: RealizeVoicingResult,
): result is GeneratedVoicingSuccess {
  return result.ok && result.value.kind === "generated";
}

function isStoredSuccess(
  result: RealizeVoicingResult,
): result is StoredVoicingResult {
  return result.ok && result.value.kind === "stored-bypass";
}

function expectDeeplyFrozen(
  value: unknown,
  seen = new Set<object>(),
): void {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) {
    expectDeeplyFrozen(child, seen);
  }
}

function requireGeneratedSuccess(
  result: RealizeVoicingResult,
  caseId: string,
): GeneratedVoicingSuccess {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(`${caseId}: expected generation, got ${result.refusal.code}`);
  }
  expect(result.value.kind).toBe("generated");
  if (!isGeneratedSuccess(result)) {
    throw new Error(`${caseId}: expected generated result`);
  }
  return result;
}

function requireStoredSuccess(
  result: RealizeVoicingResult,
  caseId: string,
): StoredVoicingResult {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(`${caseId}: expected stored bypass, got ${result.refusal.code}`);
  }
  expect(result.value.kind).toBe("stored-bypass");
  if (!isStoredSuccess(result)) {
    throw new Error(`${caseId}: expected stored-bypass result`);
  }
  return result;
}

function requireExactCandidate(
  candidates: readonly VoicingCandidate[],
  expected: V0CandidateSuccessExpectation,
  caseId: string,
): VoicingCandidate {
  const candidate = findV0CandidateWithExpectedVoices(candidates, expected);
  expect(candidate).toBeDefined();
  if (candidate === undefined) {
    throw new Error(`${caseId}: exact retained candidate was not found`);
  }
  return candidate;
}

function adjacentMidiIntervals(candidate: VoicingCandidate): readonly number[] {
  return candidate.voices.slice(1).map((voice, index) => {
    const lower = candidate.voices[index];
    if (lower === undefined) {
      throw new Error("V0 test candidate adjacency was not index-aligned");
    }
    return voice.midi - lower.midi;
  });
}

function cyclicRotations(values: readonly string[]): readonly (readonly string[])[] {
  return values.map((_, offset) => [
    ...values.slice(offset),
    ...values.slice(0, offset),
  ]);
}

function assertSelectedRealizationBinding(
  request: AutoVoicingRequest,
  candidate: VoicingCandidate,
  caseId: string,
): void {
  expect(candidate.realizationId).toBe(request.realizationId);
  expect(candidate.family).toBe(request.policy.family);
  const realization = request.resolved.realizations.find(
    ({ id }) => id === request.realizationId,
  );
  if (realization === undefined) {
    throw new Error(`${caseId}: selected realization missing after success`);
  }

  for (const voice of candidate.voices) {
    if (voice.provenance === "slash-bass") {
      expect(voice.degree).toBeNull();
      expect(voice.sourceDegreeIndex).toBeNull();
      continue;
    }
    const sourceDegree = realization.degrees[voice.sourceDegreeIndex];
    const sourceSpelling =
      realization.spelledPitchNames[voice.sourceDegreeIndex];
    expect(sourceDegree).toEqual(voice.degree);
    expect(sourceSpelling).toEqual({
      step: voice.pitch.step,
      alter: voice.pitch.alter,
    });
  }
}

function assertExpectedExplanation(
  candidate: VoicingCandidate,
  expected: V0CandidateSuccessExpectation,
): void {
  expect(candidate.explanation.orderedDegrees.map(v0DegreeToken)).toEqual([
    ...expected.voices.flatMap(({ degree }) =>
      degree === null ? [] : [degree],
    ),
  ]);

  if (expected.templateId !== undefined) {
    expect(candidate.explanation.templateId).toBe(expected.templateId);
  }
  if (expected.omittedDegrees !== undefined) {
    expect(candidate.explanation.omittedDegrees.map(v0DegreeToken)).toEqual(
      [...expected.omittedDegrees],
    );
  }
  if (expected.doubledDegrees !== undefined) {
    expect(candidate.explanation.doubledDegrees.map(v0DegreeToken)).toEqual(
      [...expected.doubledDegrees],
    );
  }
  if ("externalBass" in expected) {
    expect(candidate.explanation.externalBass).toEqual(
      expected.externalBass ?? null,
    );
  }
  if (expected.drop2 !== undefined) {
    expect(candidate.explanation.drop2).not.toBeNull();
    if (candidate.explanation.drop2 === null) {
      throw new Error("V0 expected Drop-2 explanation was absent");
    }
    expect({
      closedSourceMidi:
        candidate.explanation.drop2.closedSourceMidi.map(Number),
      secondFromTopSourceOrdinal:
        candidate.explanation.drop2.secondFromTopSourceOrdinal,
      loweredBySemitones: candidate.explanation.drop2.loweredBySemitones,
      transformedMidi:
        candidate.explanation.drop2.transformedMidi.map(Number),
    }).toEqual({
      closedSourceMidi: [...expected.drop2.closedSourceMidi],
      secondFromTopSourceOrdinal: expected.drop2.secondFromTopSourceOrdinal,
      loweredBySemitones: expected.drop2.loweredBySemitones,
      transformedMidi: [...expected.drop2.transformedMidi],
    });
  }
  if (expected.spanSemitones !== undefined) {
    const low = candidate.voices[0];
    const high = candidate.voices[candidate.voices.length - 1];
    if (high === undefined) {
      throw new Error("V0 test candidate unexpectedly had no voices");
    }
    expect(high.midi - low.midi).toBe(expected.spanSemitones);
  }
  const minimumAdjacentGap = expected.atLeastOneAdjacentGapSemitones;
  if (minimumAdjacentGap !== undefined) {
    expect(
      adjacentMidiIntervals(candidate).some(
        (interval) => interval >= minimumAdjacentGap,
      ),
    ).toBe(true);
  }
  if (expected.exactAdjacentSemitones !== undefined) {
    expect([...adjacentMidiIntervals(candidate)]).toEqual([
      ...expected.exactAdjacentSemitones,
    ]);
  }
  if (expected.adjacentSemitones !== undefined) {
    expect([...adjacentMidiIntervals(candidate)]).toEqual([
      ...expected.adjacentSemitones,
    ]);
    const quartalIntervals: number[] =
      candidate.explanation.quartalAdjacencies.map(
        ({ semitones }) => semitones,
      );
    expect(quartalIntervals).toEqual([...expected.adjacentSemitones]);
  }
  if (expected.slashBassSourceDegreeIndex === null) {
    const slashBass = candidate.voices.find(
      ({ provenance }) => provenance === "slash-bass",
    );
    expect(slashBass).toBeDefined();
    expect(slashBass?.degree).toBeNull();
    expect(slashBass?.sourceDegreeIndex).toBeNull();
  }
  if (expected.externalBassVoiceCounted === false) {
    expect(candidate.voices).toHaveLength(expected.voices.length);
    expect(
      candidate.voices.some(({ provenance }) => provenance === "slash-bass"),
    ).toBe(false);
  }
  if (expected.localScore !== undefined) {
    expect(candidate.localScore).toEqual(expected.localScore);
  }
}

function assertGeneratedCase(
  recipe: V0AutoCandidateCaseRecipe,
  expected: V0CandidateSuccessExpectation,
): void {
  const request = buildV0CandidateRequest(recipe);
  if (request.kind !== "auto") {
    throw new Error(`${recipe.id}: Auto recipe built a stored request`);
  }
  const requestJson = JSON.stringify(request);
  const result = requireGeneratedSuccess(realizeVoicing(request), recipe.id);

  expect(result.value.realizationId).toBe(request.realizationId);
  expect(result.value.policy).toEqual(request.policy);
  expect(result.value.candidates.length).toBeGreaterThan(0);
  expect(result.value.rawCandidateCount).toBeGreaterThanOrEqual(
    result.value.candidates.length,
  );
  if (expected.rawCandidateCount !== undefined) {
    expect(result.value.rawCandidateCount).toBe(expected.rawCandidateCount);
  }
  if (expected.retainedCandidateCount !== undefined) {
    expect(result.value.candidates).toHaveLength(
      expected.retainedCandidateCount,
    );
  }
  expect(result.evidence.termination).toBe("complete-generated");

  const candidate = requireExactCandidate(
    result.value.candidates,
    expected,
    recipe.id,
  );
  assertSelectedRealizationBinding(request, candidate, recipe.id);
  assertExpectedExplanation(candidate, expected);

  if (expected.noOtherAlteredRealizationMerged === true) {
    expect(
      result.value.candidates.every(
        ({ realizationId }) => realizationId === request.realizationId,
      ),
    ).toBe(true);
  }

  expect(JSON.stringify(request)).toBe(requestJson);
  expectDeeplyFrozen(result);
  const replay = realizeVoicing(request);
  expect(replay).toEqual(result);
  expect(JSON.stringify(replay)).toBe(JSON.stringify(result));
}

function unsatisfiedReasons(
  result: Extract<RealizeVoicingResult, { ok: false }>,
): readonly string[] {
  return result.refusal.code === "voicing.constraints_unsatisfied"
    ? result.refusal.constraints.map(({ reason }) => reason)
    : [];
}

function assertRefusalCase(
  recipe: V0AutoCandidateCaseRecipe,
  expected: V0CandidateRefusalExpectation,
): void {
  const request = buildV0CandidateRequest(recipe);
  const requestJson = JSON.stringify(request);
  const result = realizeVoicing(request);
  expect(result.ok).toBe(false);
  if (result.ok) {
    throw new Error(`${recipe.id}: expected ${expected.code}, got success`);
  }

  expect("value" in result).toBe(false);
  expect(result.refusal.code).toBe(expected.code);
  expect(result.evidence.termination).toBe(expected.termination);

  if (expected.primaryReason !== undefined) {
    expect(unsatisfiedReasons(result)[0]).toBe(expected.primaryReason);
  }
  if (expected.reasons !== undefined) {
    expect(unsatisfiedReasons(result)).toEqual([...expected.reasons]);
  }
  if (expected.absentDegrees !== undefined) {
    expect(result.refusal.code).toBe("voicing.constraints_unsatisfied");
    if (result.refusal.code !== "voicing.constraints_unsatisfied") {
      throw new Error(`${recipe.id}: absent degrees require constraint refusal`);
    }
    expect(
      result.refusal.constraints
        .filter(({ reason }) => reason === "template-degree-absent")
        .flatMap(({ degrees }) => degrees.map(v0DegreeToken)),
    ).toEqual([...expected.absentDegrees]);
  }
  if (expected.omittedRequiredDegrees !== undefined) {
    expect(result.refusal.code).toBe("voicing.constraints_unsatisfied");
    if (result.refusal.code !== "voicing.constraints_unsatisfied") {
      throw new Error(`${recipe.id}: required omissions need constraint refusal`);
    }
    expect(
      result.refusal.constraints
        .filter(({ reason }) => reason === "required-degree-omitted")
        .flatMap(({ degrees }) => degrees.map(v0DegreeToken)),
    ).toEqual([...expected.omittedRequiredDegrees]);
  }
  if (expected.omittedGuideToneDegrees !== undefined) {
    expect(result.refusal.code).toBe("voicing.constraints_unsatisfied");
    if (result.refusal.code !== "voicing.constraints_unsatisfied") {
      throw new Error(`${recipe.id}: guide omissions need constraint refusal`);
    }
    expect(
      result.refusal.constraints
        .filter(({ reason }) => reason === "guide-tone-omitted")
        .flatMap(({ degrees }) => degrees.map(v0DegreeToken)),
    ).toEqual([...expected.omittedGuideToneDegrees]);
  }
  if (expected.reason !== undefined) {
    expect(result.refusal.code).toBe("voicing.quartal_context_invalid");
    if (result.refusal.code !== "voicing.quartal_context_invalid") {
      throw new Error(`${recipe.id}: expected Quartal-context refusal`);
    }
    expect(result.refusal.reason).toBe(expected.reason);
  }
  if (expected.available !== undefined) {
    expect(result.refusal.code).toBe("voicing.realization_unavailable");
    if (result.refusal.code !== "voicing.realization_unavailable") {
      throw new Error(`${recipe.id}: expected realization refusal`);
    }
    expect([...result.refusal.available]).toEqual([...expected.available]);
  }

  expect(JSON.stringify(request)).toBe(requestJson);
  expectDeeplyFrozen(result);
  const replay = realizeVoicing(request);
  expect(replay).toEqual(result);
  expect(JSON.stringify(replay)).toBe(JSON.stringify(result));
}

function assertStoredCase(recipe: V0StoredCandidateCaseRecipe): void {
  const request = buildV0CandidateRequest(recipe);
  if (request.kind !== "stored") {
    throw new Error(`${recipe.id}: stored recipe built an Auto request`);
  }
  const voicingReference = request.voicing;
  const generatedByReference =
    request.voicing.mode === "frozen"
      ? request.voicing.generatedBy
      : undefined;
  const requestJson = JSON.stringify(request);
  const result = requireStoredSuccess(realizeVoicing(request), recipe.id);

  expect(result.value.voicing).toBe(voicingReference);
  expect(result.value.candidateGenerationPerformed).toBe(false);
  expect(result.value.rawCandidateCount).toBe(0);
  expect(result.value.retainedCandidateCount).toBe(0);
  expect(result.evidence.termination).toBe("complete-bypass");
  for (const [counter, value] of Object.entries(result.evidence)) {
    if (counter === "termination") continue;
    expect(value).toBe(0);
  }
  if (recipe.expected.generatedByUnchanged === true) {
    if (generatedByReference === undefined) {
      throw new Error(`${recipe.id}: expected Frozen input metadata`);
    }
    expect(result.value.voicing.mode).toBe("frozen");
    if (result.value.voicing.mode !== "frozen") {
      throw new Error(`${recipe.id}: expected Frozen stored bypass`);
    }
    expect(result.value.voicing.generatedBy).toBe(generatedByReference);
  }

  expect(JSON.stringify(request)).toBe(requestJson);
  expectDeeplyFrozen(result);
  const replay = requireStoredSuccess(realizeVoicing(request), recipe.id);
  expect(replay).toEqual(result);
  expect(replay.value.voicing).toBe(voicingReference);
  expect(JSON.stringify(replay)).toBe(JSON.stringify(result));
}

describe("V0 independently authored candidate cases", () => {
  test("contains the exact 21 generated, 15 refusal, and 2 stored recipes", () => {
    expect(V0_CANDIDATE_CASES).toHaveLength(38);
    expect(
      V0_CANDIDATE_CASES.filter(
        ({ expected }) => expected.kind === "must-contain-candidate",
      ),
    ).toHaveLength(21);
    expect(
      V0_CANDIDATE_CASES.filter(
        ({ expected }) => expected.kind === "refusal",
      ),
    ).toHaveLength(15);
    expect(
      V0_CANDIDATE_CASES.filter(
        ({ expected }) => expected.kind === "stored-bypass",
      ),
    ).toHaveLength(2);
  });

  test("the complete-result oracle accepts genuine source-ordered two-doubling output", () => {
    const recipe = V0_CANDIDATE_CASES.find(({ id }) => id === "V0-CAND-015");
    if (recipe === undefined || !("sourceSymbol" in recipe)) {
      throw new Error("V0-CAND-015 source fixture is missing");
    }
    const base = buildV0CandidateRequest(recipe);
    if (base.kind !== "auto") throw new Error("V0-CAND-015 must be Auto");
    const request = Object.freeze({
      ...base,
      policy: Object.freeze({
        ...base.policy,
        voiceCount: 4,
        range: Object.freeze({ lowMidi: 48, highMidi: 84 }),
        bassPolicy: "none" as const,
      }),
    }) as AutoVoicingRequest;
    const result = requireGeneratedSuccess(
      realizeVoicing(request),
      "V0-CAND-015 two-doubling oracle control",
    );
    expect(result.value.candidates).toHaveLength(6);
    expect(result.value.candidates.some((candidate) =>
      candidate.voices.filter(({ provenance }) => provenance === "doubling")
        .map(({ degree }) => degree === null ? null : v0DegreeToken(degree))
        .join(",") === "5,1" &&
      candidate.explanation.doubledDegrees.map(v0DegreeToken).join(",") === "1,5"
    )).toBe(true);
    const audit = auditV0GeneratedResultSet(request, result);
    if (!isJsonRecord(audit)) {
      throw new TypeError("two-doubling audit projection must be a record");
    }
    const checks = audit["checks"];
    expect(Array.isArray(checks)).toBe(true);
    if (!Array.isArray(checks)) throw new TypeError("two-doubling audit checks missing");
    expect(checks.every((value) =>
      isJsonRecord(value) && value["accepted"] === true
    )).toBe(true);
  });

  test("the complete-result oracle kills a coherent two-octave doubling mutant", () => {
    const control = v0TwoOctaveDoublingAuditControl();
    expect(control.originalMidiDelta).toBe(12);
    expect(control.mutantMidiDelta).toBe(24);
    expect(control.failedCheckIds).toEqual([
      "every-returned-candidate-audited",
      "identity-guide-omission-and-doubling",
    ]);
    expectDeeplyFrozen(control.mutantResult);
  });

  test("V0-CAND-001 proves the non-cyclic selected-degree register weave", () => {
    const recipe = V0_CANDIDATE_CASES.find(({ id }) => id === "V0-CAND-001");
    if (
      recipe === undefined ||
      !("sourceSymbol" in recipe) ||
      recipe.expected.kind !== "must-contain-candidate"
    ) {
      throw new Error("V0-CAND-001 must remain an Auto success fixture");
    }
    const expectedDegrees = recipe.expected.voices.flatMap(({ degree }) =>
      degree === null ? [] : [degree],
    );
    expect(expectedDegrees).toEqual(["1", "5", "7", "3"]);
    for (const cyclicReference of [
      ["1", "3", "5", "7"],
      ["1", "3", "7", "5"],
    ]) {
      expect(cyclicRotations(cyclicReference)).not.toContainEqual(
        expectedDegrees,
      );
    }

    const request = buildV0CandidateRequest(recipe);
    const result = requireGeneratedSuccess(
      realizeVoicing(request),
      "V0-CAND-001 register weave",
    );
    const candidate = requireExactCandidate(
      result.value.candidates,
      recipe.expected,
      "V0-CAND-001 register weave",
    );
    expect(candidate.explanation.orderedDegrees.map(v0DegreeToken)).toEqual(
      expectedDegrees,
    );
    expect(candidate.rawGenerationOrdinal).toBe(6);
    expect(candidate.localScore.templateOrderDisplacement).toBe(4);
    expect(realizeVoicing(request)).toEqual(result);
  });

  test("fixed Rootless register intervals remain legal when Db moves the written C boundary", () => {
    const source = V0_CANDIDATE_CASES.find(
      ({ id }) => id === "V0-CAND-006",
    );
    if (source === undefined || !("sourceSymbol" in source)) {
      throw new Error("V0-CAND-006 source fixture is missing");
    }
    const base = buildV0CandidateRequest(source);
    if (base.kind !== "auto" || base.policy.family !== "rootless-a") {
      throw new Error("V0-CAND-006 must remain a Rootless A Auto request");
    }

    const parsed = parseChordSymbol("Dbmaj13", "ascii");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error("Dbmaj13 parse failed");
    const resolved = resolveChord(parsed.chord);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) throw new Error("Dbmaj13 resolution failed");
    const policy = makeAutoVoicing(
      {
        mode: "auto",
        family: "rootless-a",
        voiceCount: 4,
        range: { lowMidi: 61, highMidi: 85 },
        bassPolicy: "external",
      },
      resolved.value.bass,
    );
    expect(policy.ok).toBe(true);
    if (!policy.ok || policy.value.family !== "rootless-a") {
      throw new Error("Dbmaj13 Rootless A policy failed");
    }
    const request: AutoVoicingRequest = Object.freeze({
      ...base,
      resolved: resolved.value,
      policy: policy.value,
      quartalContext: null,
    });

    const result = requireGeneratedSuccess(
      realizeVoicing(request),
      "Dbmaj13 Rootless A C-boundary regression",
    );
    const candidate = result.value.candidates.find(({ voices }) =>
      voices.every(
        ({ midi }, index) => midi === ([65, 72, 75, 80] as const)[index],
      ),
    );
    expect(candidate).toBeDefined();
    if (candidate === undefined) {
      throw new Error("Dbmaj13 invariant Rootless A candidate is missing");
    }
    expect(candidate.explanation.orderedDegrees.map(v0DegreeToken)).toEqual([
      "3",
      "7",
      "9",
      "5",
    ]);
    expect(candidate.voices.map(({ pitch }) => pitch)).toEqual([
      { step: "F", alter: 0, octave: 4 },
      { step: "C", alter: 0, octave: 5 },
      { step: "E", alter: -1, octave: 5 },
      { step: "A", alter: -1, octave: 5 },
    ]);
    expect(candidate.explanation.externalBass).toEqual({
      step: "D",
      alter: -1,
    });
    expect(realizeVoicing(request)).toEqual(result);
  });

  test("slash bassPolicy none refuses before Open candidate search can exhaust work", () => {
    const source = V0_CANDIDATE_CASES.find(
      ({ id }) => id === "V0-CAND-003",
    );
    if (source === undefined || !("sourceSymbol" in source)) {
      throw new Error("V0-CAND-003 source fixture is missing");
    }
    const base = buildV0CandidateRequest(source);
    if (base.kind !== "auto" || base.policy.family !== "open") {
      throw new Error("V0-CAND-003 must remain an Open Auto request");
    }
    const parsed = parseChordSymbol("Cmaj13/Eb", "ascii");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error("Cmaj13/Eb parse failed");
    const resolved = resolveChord(parsed.chord);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) throw new Error("Cmaj13/Eb resolution failed");
    const request: AutoVoicingRequest = Object.freeze({
      ...base,
      resolved: resolved.value,
      policy: Object.freeze({
        ...base.policy,
        family: "open" as const,
        voiceCount: 4,
        range: Object.freeze({ lowMidi: 48, highMidi: 84 }),
        bassPolicy: "none" as const,
      }),
      quartalContext: null,
    }) as AutoVoicingRequest;

    const result = realizeVoicing(request);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("slash-none request unexpectedly generated");
    expect(result.refusal.code).toBe("voicing.constraints_unsatisfied");
    if (result.refusal.code !== "voicing.constraints_unsatisfied") {
      throw new Error("slash-none request returned the wrong refusal shape");
    }
    expect(result.refusal.constraints[0].reason).toBe(
      "bass-policy-unsupported",
    );
    expect(result.evidence.searchStatesExpanded).toBe(0);
    expect(result.evidence.rawCandidatesProduced).toBe(0);
    expect(result.evidence.retainedCandidatesProduced).toBe(0);
    expect(realizeVoicing(request)).toEqual(result);
  });

  test("V0-TRANS-017 preserves the register weave through all 12 spelled roots", () => {
    const seedValue = transpositionFixtureValue.seeds.find(
      ({ id }) => id === "V0-TRANS-017",
    );
    if (seedValue === undefined) throw new Error("missing V0-TRANS-017");
    const seed = seedValue as unknown as V0WeaveTranspositionSeed;
    expect(V0_WEAVE_TRANSPOSITION_ROOTS).toHaveLength(
      seed.expected.rootCells,
    );
    expect(seed.expected.cyclicPrefilterPermitted).toBe(false);
    for (const cyclicReference of [
      seed.selectedDegreeOrder,
      ["1", "3", "7", "5"],
    ]) {
      expect(cyclicRotations(cyclicReference)).not.toContainEqual(
        seed.orderedDegrees,
      );
    }

    const recipe = V0_CANDIDATE_CASES.find(
      ({ id }) => id === seed.sourceCaseId,
    );
    if (recipe === undefined || !("sourceSymbol" in recipe)) {
      throw new Error("V0-TRANS-017 source fixture is missing");
    }
    const base = buildV0CandidateRequest(recipe);
    if (base.kind !== "auto" || base.policy.family !== "balanced") {
      throw new Error("V0-TRANS-017 source must be a Balanced Auto request");
    }

    for (const root of V0_WEAVE_TRANSPOSITION_ROOTS) {
      const parsed = parseChordSymbol(`${root.symbol}maj7`, "ascii");
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) throw new Error(`${root.symbol}: parse failed`);
      const resolved = resolveChord(parsed.chord);
      expect(resolved.ok).toBe(true);
      if (!resolved.ok) throw new Error(`${root.symbol}: resolve failed`);
      const policy = makeAutoVoicing(
        {
          mode: "auto",
          family: "balanced",
          voiceCount: base.policy.voiceCount,
          range: {
            lowMidi: seed.proofRange.lowMidi + root.pitchClass,
            highMidi: seed.proofRange.highMidi + root.pitchClass,
          },
          bassPolicy: base.policy.bassPolicy,
        },
        resolved.value.bass,
      );
      expect(policy.ok).toBe(true);
      if (!policy.ok) throw new Error(`${root.symbol}: policy failed`);
      if (policy.value.family !== "balanced") {
        throw new Error(`${root.symbol}: policy family drifted`);
      }
      const request: AutoVoicingRequest = Object.freeze({
        ...base,
        resolved: resolved.value,
        policy: Object.freeze({
          ...policy.value,
          family: "balanced" as const,
        }),
        quartalContext: null,
      });
      const result = requireGeneratedSuccess(
        realizeVoicing(request),
        `V0-TRANS-017 ${root.symbol}`,
      );
      expect(result.value.rawCandidateCount).toBe(
        seed.expected.rawCandidateCount,
      );
      expect(result.value.candidates).toHaveLength(
        seed.expected.retainedCandidateCount,
      );
      const candidate = result.value.candidates[seed.expected.retainedOrdinal];
      expect(candidate).toBeDefined();
      if (candidate === undefined) {
        throw new Error(`${root.symbol}: retained weave candidate missing`);
      }
      expect(candidate.explanation.orderedDegrees.map(v0DegreeToken)).toEqual(
        [...seed.orderedDegrees],
      );
      const lowestMidi = candidate.voices[0].midi;
      expect(candidate.voices.map(({ midi }) => midi - lowestMidi)).toEqual(
        [...seed.relativeMidiFromLowest],
      );
      expect(candidate.voices[0].pitch).toMatchObject({
        step: root.step,
        alter: root.alter,
      });
      expect(candidate.rawGenerationOrdinal).toBe(
        seed.expected.rawGenerationOrdinal,
      );
      expect(candidate.localScore.templateOrderDisplacement).toBe(
        seed.expected.templateOrderDisplacement,
      );
      expect(realizeVoicing(request)).toEqual(result);
    }
  });

  test("V0-TRANS-018 preserves typed constraint-observation overflow through all 12 spelled slash roots", () => {
    const seedValue = transpositionFixtureValue.seeds.find(
      ({ id }) => id === "V0-TRANS-018",
    );
    if (seedValue === undefined) throw new Error("missing V0-TRANS-018");
    const seed =
      seedValue as unknown as V0ConstraintObservationOverflowTranspositionSeed;
    const proof = seed.observationOverflowProof;
    expect(V0_CONSTRAINT_OBSERVATION_TRANSPOSITIONS).toHaveLength(
      proof.rootCells,
    );
    expect(proof.completeSearchNoLegalCandidate).toBe(true);

    const source = V0_CANDIDATE_CASES.find(
      ({ id }) => id === "V0-CAND-003",
    );
    if (source === undefined || !("sourceSymbol" in source)) {
      throw new Error("V0-TRANS-018 request source fixture is missing");
    }

    expect(proof.sourceCellEvidence).toMatchObject({
      rootId: "V0-ROOT-001",
      rootSymbol: "C",
    });
    expect(proof.perRootConstraintObservationComparisons).toHaveLength(
      proof.rootCells,
    );

    for (const [rootIndex, { root, bass }] of
      V0_CONSTRAINT_OBSERVATION_TRANSPOSITIONS.entries()) {
      const sourceSymbol = `${root.symbol}maj7/${bass.symbol}`;
      const request = buildV0CandidateRequest({
        ...source,
        id: `V0-TRANS-018-${root.symbol}`,
        sourceSymbol,
        realizationId: seed.realizationId,
        policy: {
          family: seed.family,
          voiceCount: 4,
          range: {
            lowMidi: seed.proofRange.lowMidi + root.pitchClass,
            highMidi: seed.proofRange.highMidi + root.pitchClass,
          },
          bassPolicy: "external",
        },
      }) as AutoVoicingRequest;

      expect(request.resolved.source.sourceText).toBe(sourceSymbol);
      expect(request.resolved.source.root).toEqual({
        step: root.step,
        alter: root.alter,
      });
      expect(request.resolved.source.bass).toEqual({
        step: bass.step,
        alter: bass.alter,
      });
      expect(request.resolved.bass).toEqual(request.resolved.source.bass);
      expect(request.policy).toMatchObject({
        family: "balanced",
        voiceCount: 4,
        range: {
          lowMidi: seed.proofRange.lowMidi + root.pitchClass,
          highMidi: seed.proofRange.highMidi + root.pitchClass,
        },
        bassPolicy: "external",
      });

      const result = realizeVoicing(request);
      expect(result.ok).toBe(false);
      if (result.ok) {
        throw new Error(`${sourceSymbol}: expected observation overflow`);
      }
      expect("value" in result).toBe(false);
      expect("constraints" in result.refusal).toBe(false);
      expect(result.refusal).toEqual(proof.expectedRefusal);
      expect(result.evidence.rawCandidatesProduced).toBe(0);
      expect(result.evidence.retainedCandidatesProduced).toBe(0);
      expect(result.evidence.outputVoicesProduced).toBe(0);
      const comparisonProof =
        proof.perRootConstraintObservationComparisons[rootIndex];
      if (comparisonProof === undefined) {
        throw new Error(`${root.symbol}: comparison proof is missing`);
      }
      expect(comparisonProof).toMatchObject({
        rootId: `V0-ROOT-${String(rootIndex + 1).padStart(3, "0")}`,
        rootSymbol: root.symbol,
      });
      expect(result.evidence.constraintObservationComparisons).toBe(
        comparisonProof.comparisons,
      );
      expect(result.evidence.constraintObservationsProduced).toBe(
        proof.allRootInvariants.constraintObservationsProduced,
      );
      expect(result.evidence.peakConstraintObservationRecords).toBe(
        proof.allRootInvariants.peakConstraintObservationRecords,
      );
      expect(result.evidence.peakTrackedRecords).toBe(
        proof.allRootInvariants.peakTrackedRecords,
      );
      expect(result.evidence.termination).toBe(
        proof.allRootInvariants.termination,
      );
      if (rootIndex === 0) {
        expect(result.evidence).toMatchObject({
          constraintObservationComparisons:
            proof.sourceCellEvidence.constraintObservationComparisons,
          constraintObservationsProduced:
            proof.sourceCellEvidence.constraintObservationsProduced,
          peakConstraintObservationRecords:
            proof.sourceCellEvidence.peakConstraintObservationRecords,
          peakTrackedRecords: proof.sourceCellEvidence.peakTrackedRecords,
          termination: proof.sourceCellEvidence.termination,
        });
      }
      expect(realizeVoicing(request)).toEqual(result);
    }
  }, 20_000);

  test("V0-TRANS-010 preserves adaptive omission diagnostics through all 12 spelled roots", () => {
    const seedValue = transpositionFixtureValue.seeds.find(
      ({ id }) => id === "V0-TRANS-010",
    );
    if (seedValue === undefined) throw new Error("missing V0-TRANS-010");
    const seed = seedValue as unknown as V0AdaptiveSlotTranspositionSeed;
    const proof = seed.insufficientSlotRefusalProof;
    expect(V0_WEAVE_TRANSPOSITION_ROOTS).toHaveLength(proof.rootCells);

    const recipe = V0_CANDIDATE_CASES.find(
      ({ id }) => id === proof.sourceCaseId,
    );
    if (recipe === undefined || !("sourceSymbol" in recipe)) {
      throw new Error("V0-TRANS-010 refusal source fixture is missing");
    }
    const base = buildV0CandidateRequest(recipe);
    if (base.kind !== "auto" || base.policy.family !== "balanced") {
      throw new Error("V0-TRANS-010 refusal source must be Balanced Auto");
    }

    for (const root of V0_WEAVE_TRANSPOSITION_ROOTS) {
      const parsed = parseChordSymbol(`${root.symbol}7alt`, "ascii");
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) throw new Error(`${root.symbol}: parse failed`);
      const resolved = resolveChord(parsed.chord);
      expect(resolved.ok).toBe(true);
      if (!resolved.ok) throw new Error(`${root.symbol}: resolve failed`);
      const policy = makeAutoVoicing(
        {
          mode: "auto",
          family: "balanced",
          voiceCount: proof.voiceCount,
          range: {
            lowMidi: base.policy.range.lowMidi + root.pitchClass,
            highMidi: base.policy.range.highMidi + root.pitchClass,
          },
          bassPolicy: "generated",
        },
        resolved.value.bass,
      );
      expect(policy.ok).toBe(true);
      if (!policy.ok) throw new Error(`${root.symbol}: policy failed`);
      const request: AutoVoicingRequest = Object.freeze({
        ...base,
        resolved: resolved.value,
        realizationId: seed.realizationId,
        policy: Object.freeze({
          ...policy.value,
          family: "balanced" as const,
        }),
        quartalContext: null,
      });
      const result = realizeVoicing(request);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error(`${root.symbol}: expected refusal`);
      expect(result.refusal.code).toBe("voicing.constraints_unsatisfied");
      if (result.refusal.code !== "voicing.constraints_unsatisfied") {
        throw new Error(`${root.symbol}: wrong refusal code`);
      }
      expect(result.refusal.constraints.map(({ reason }) => reason)).toEqual(
        [...proof.reasons],
      );
      expect(
        result.refusal.constraints
          .filter(({ reason }) => reason === "required-degree-omitted")
          .flatMap(({ degrees }) => degrees.map(v0DegreeToken)),
      ).toEqual([...proof.omittedRequiredDegrees]);
      expect(
        result.refusal.constraints
          .filter(({ reason }) => reason === "guide-tone-omitted")
          .flatMap(({ degrees }) => degrees.map(v0DegreeToken)),
      ).toEqual([...proof.omittedGuideToneDegrees]);
      expect(
        result.refusal.constraints.some(
          ({ reason }) => reason === "voice-count-below-template-minimum",
        ),
      ).toBe(proof.voiceCountReasonPresent);
      expect(realizeVoicing(request)).toEqual(result);
    }
  });

  for (const recipe of V0_CANDIDATE_CASES) {
    test(`${recipe.id} ${recipe.description}`, () => {
      if ("sourceSymbol" in recipe) {
        if (recipe.expected.kind === "must-contain-candidate") {
          assertGeneratedCase(recipe, recipe.expected);
          return;
        }
        assertRefusalCase(recipe, recipe.expected);
        return;
      }
      assertStoredCase(recipe);
    });
  }
});
