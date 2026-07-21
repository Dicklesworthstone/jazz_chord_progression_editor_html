import { describe, expect, test } from "bun:test";

import {
  VOICING_TEMPLATE_ROWS,
  realizeVoicing,
  type AutoVoicingRequest,
  type GeneratedVoicingResult,
} from "../../src/theory";
import {
  buildV0CandidateRequest,
  v0CandidateCase,
} from "../support/v0-voicing-fixture";

type GeneratedSuccess = Extract<GeneratedVoicingResult, { ok: true }>;

function autoRequest(caseId: string): AutoVoicingRequest {
  const request = buildV0CandidateRequest(v0CandidateCase(caseId));
  if (request.kind !== "auto") {
    throw new Error(`${caseId}: expected an Auto request`);
  }
  return request;
}

function generatedSuccess(
  request: AutoVoicingRequest,
  scenario: string,
): GeneratedSuccess {
  const result = realizeVoicing(request);
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(`${scenario}: expected success, got ${result.refusal.code}`);
  }
  return result;
}

function selectedDegreeCount(request: AutoVoicingRequest): number {
  const realization = request.resolved.realizations.find(
    ({ id }) => id === request.realizationId,
  );
  if (realization === undefined) {
    throw new Error("V0 lifecycle fixture lost its selected realization");
  }
  return realization.degrees.length;
}

describe("V0 bounded search and publication lifecycle", () => {
  test("V0-CAND-001 accounts for the exact simultaneous search and publication populations", () => {
    const request = autoRequest("V0-CAND-001");
    const result = generatedSuccess(request, "V0-CAND-001 lifecycle");
    const evidence = result.evidence;

    expect(result.value.rawCandidateCount).toBe(33);
    expect(result.value.candidates).toHaveLength(24);
    expect(evidence.candidateCanonicalizations).toBe(33);
    expect(evidence.duplicateCandidateComparisons).toBe((33 * 32) / 2);
    expect(evidence.localScoresComputed).toBe(33);
    expect(evidence.retainedCandidatesProduced).toBe(24);
    expect(evidence.outputVoicesProduced).toBe(96);

    const sourceDegrees = selectedDegreeCount(request);
    const searchPhase =
      sourceDegrees +
      VOICING_TEMPLATE_ROWS.length +
      evidence.peakRegisterPlacementRecords +
      evidence.peakSearchStateRecords +
      evidence.peakRawCandidateRecords +
      evidence.peakRawVoiceRecords;
    const publicationPhase =
      sourceDegrees +
      VOICING_TEMPLATE_ROWS.length +
      evidence.peakRawCandidateRecords +
      evidence.peakRawVoiceRecords +
      evidence.peakRetainedCandidateRecords +
      evidence.peakOutputVoiceRecords;

    expect(searchPhase).toBe(299);
    expect(publicationPhase).toBe(401);
    expect(evidence.peakTrackedRecords).toBe(
      Math.max(searchPhase, publicationPhase),
    );
  });

  test("the prospective 97th raw candidate stops before every post-search phase", () => {
    const base = autoRequest("V0-CAND-001");
    const request = {
      ...base,
      policy: {
        ...base.policy,
        range: { lowMidi: 36, highMidi: 108 },
      },
    } as AutoVoicingRequest;

    const result = realizeVoicing(request);
    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("raw-97 scenario unexpectedly generated candidates");
    }

    expect("value" in result).toBe(false);
    expect(result.refusal).toEqual({
      code: "limit.voicing_work_exceeded",
      path: [],
      counter: "rawCandidatesProduced",
      received: 97,
      maximum: 96,
      partialResult: false,
    });
    expect(result.evidence.rawCandidatesProduced).toBe(96);
    expect(result.evidence.candidateCanonicalizations).toBe(0);
    expect(result.evidence.duplicateCandidateComparisons).toBe(0);
    expect(result.evidence.localScoresComputed).toBe(0);
    expect(result.evidence.orderingComparisons).toBe(0);
    expect(result.evidence.retainedCandidatesProduced).toBe(0);
    expect(result.evidence.outputVoicesProduced).toBe(0);

    const exactLiveSearchRecords =
      selectedDegreeCount(request) +
      VOICING_TEMPLATE_ROWS.length +
      result.evidence.peakRegisterPlacementRecords +
      result.evidence.peakSearchStateRecords +
      result.evidence.peakRawCandidateRecords +
      result.evidence.peakRawVoiceRecords;
    expect(exactLiveSearchRecords).toBe(626);
    expect(result.evidence.peakTrackedRecords).toBe(exactLiveSearchRecords);
  });

  test("each kept canonical identity is scored once before stable retention", () => {
    const result = generatedSuccess(
      autoRequest("V0-CAND-002"),
      "V0-CAND-002 canonical scoring",
    );

    expect(result.value.rawCandidateCount).toBe(4);
    expect(result.value.candidates).toHaveLength(4);
    expect(result.evidence.candidateCanonicalizations).toBe(4);
    expect(result.evidence.duplicateCandidateComparisons).toBe(6);
    expect(result.evidence.localScoresComputed).toBe(
      result.value.candidates.length,
    );
    expect(result.evidence.localScoresComputed).toBeLessThanOrEqual(
      result.evidence.candidateCanonicalizations,
    );
    expect(
      result.value.candidates.map(({ retainedOrdinal }) => retainedOrdinal),
    ).toEqual([0, 1, 2, 3]);
  });

  test("publication creates one fresh output voice record per metered copy", () => {
    const request = autoRequest("V0-CAND-002");
    const first = generatedSuccess(request, "first publication");
    const replay = generatedSuccess(request, "replayed publication");
    const firstVoices = first.value.candidates.flatMap(({ voices }) => voices);
    const replayVoices = replay.value.candidates.flatMap(({ voices }) => voices);

    expect(first.evidence.outputVoicesProduced).toBe(firstVoices.length);
    expect(replay.evidence.outputVoicesProduced).toBe(replayVoices.length);
    expect(new Set(firstVoices).size).toBe(firstVoices.length);
    expect(first.value.candidates).toEqual(replay.value.candidates);

    for (let index = 0; index < firstVoices.length; index += 1) {
      const firstVoice = firstVoices[index];
      const replayVoice = replayVoices[index];
      if (firstVoice === undefined || replayVoice === undefined) {
        throw new Error("V0 replay voice arrays were not index-aligned");
      }
      expect(firstVoice).not.toBe(replayVoice);
      expect(firstVoice.pitch).not.toBe(replayVoice.pitch);
      if (firstVoice.degree !== null && replayVoice.degree !== null) {
        expect(firstVoice.degree).not.toBe(replayVoice.degree);
      }
    }
  });
});
