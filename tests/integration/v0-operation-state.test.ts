import { describe, expect, test } from "bun:test";

import {
  realizeVoicing,
  type AutoVoicingRequest,
  type GeneratedVoicingResult,
  type QuartalAutoVoicingRequest,
} from "../../src/theory";
import {
  buildV0CandidateRequest,
  v0CandidateCase,
  v0DegreeFromToken,
  v0DegreeToken,
} from "../support/v0-voicing-fixture";

function requireAutoRequest(caseId: string): AutoVoicingRequest {
  const request = buildV0CandidateRequest(v0CandidateCase(caseId));
  if (request.kind !== "auto") {
    throw new Error(`${caseId}: expected an Auto voicing request`);
  }
  return request;
}

function requireQuartalRequest(caseId: string): QuartalAutoVoicingRequest {
  const request = requireAutoRequest(caseId);
  if (request.policy.family !== "quartal") {
    throw new Error(`${caseId}: expected a Quartal voicing request`);
  }
  return request as unknown as QuartalAutoVoicingRequest;
}

function requireGeneratedSuccess(
  result: GeneratedVoicingResult,
  scenario: string,
): Extract<GeneratedVoicingResult, { ok: true }> {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(`${scenario}: expected generation, got ${result.refusal.code}`);
  }
  return result;
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

function malformedQuartalRequest(
  mutate: (context: Record<string, unknown>) => void,
): QuartalAutoVoicingRequest {
  const request = structuredClone(requireQuartalRequest("V0-CAND-009"));
  const context = request.quartalContext as unknown as Record<string, unknown>;
  mutate(context);
  return request;
}

describe("V0 public operation-state regressions", () => {
  test("meters exactly the semantic template positions exposed before every outcome", () => {
    const generatedSlash = requireAutoRequest("V0-CAND-013");
    const fixedMissing = requireAutoRequest("V0-CAND-019");
    const adaptiveOmission = requireAutoRequest("V0-CAND-033");
    const adaptivePreselectionCount = requireAutoRequest("V0-CAND-025");
    const quartalSuccess = requireQuartalRequest("V0-CAND-009");
    const quartalPrebinding = requireQuartalRequest("V0-CAND-026");
    const unavailableBase = requireAutoRequest("V0-CAND-015");
    const unavailable = {
      ...unavailableBase,
      policy: { ...unavailableBase.policy, family: "shell" },
    } as AutoVoicingRequest;
    const quartalCountRefusal = {
      ...quartalSuccess,
      policy: { ...quartalSuccess.policy, voiceCount: 6 },
      quartalContext: {
        ...quartalSuccess.quartalContext,
        degreeSequence: [
          v0DegreeFromToken("7", "quartal-slot-accounting"),
          v0DegreeFromToken("3", "quartal-slot-accounting"),
          v0DegreeFromToken("13", "quartal-slot-accounting"),
          v0DegreeFromToken("9", "quartal-slot-accounting"),
          v0DegreeFromToken("5", "quartal-slot-accounting"),
          v0DegreeFromToken("1", "quartal-slot-accounting"),
        ],
      },
    } as unknown as QuartalAutoVoicingRequest;

    for (const scenario of [
      { label: "unavailable row", request: unavailable, slots: 0 },
      { label: "pre-row Quartal refusal", request: quartalPrebinding, slots: 0 },
      { label: "fixed missing degree", request: fixedMissing, slots: 4 },
      { label: "adaptive omitted suffix", request: adaptiveOmission, slots: 3 },
      {
        label: "adaptive row-count refusal",
        request: adaptivePreselectionCount,
        slots: 0,
      },
      { label: "generated slash reservation", request: generatedSlash, slots: 3 },
      { label: "Quartal success", request: quartalSuccess, slots: 4 },
      { label: "Quartal row-count refusal", request: quartalCountRefusal, slots: 6 },
    ] as const) {
      const result = realizeVoicing(scenario.request);
      expect(result.evidence.templateDegreeSlotsVisited).toBe(scenario.slots);
    }
  });

  test("generated output owns frozen copies without freezing or mutating a mutable request", () => {
    const request = structuredClone(requireAutoRequest("V0-CAND-001"));
    const inputDegree = request.resolved.realizations[0].degrees[0];
    const requestJson = JSON.stringify(request);

    expect(Object.isFrozen(request.policy)).toBe(false);
    expect(Object.isFrozen(request.policy.range)).toBe(false);
    expect(Object.isFrozen(inputDegree)).toBe(false);

    const result = requireGeneratedSuccess(
      realizeVoicing(request),
      "mutable Auto request",
    );

    expect(JSON.stringify(request)).toBe(requestJson);
    expect(Object.isFrozen(request.policy)).toBe(false);
    expect(Object.isFrozen(request.policy.range)).toBe(false);
    expect(Object.isFrozen(inputDegree)).toBe(false);
    expect(result.value.policy).not.toBe(request.policy);
    expect(result.value.policy.range).not.toBe(request.policy.range);
    expectDeeplyFrozen(result.value.policy);
    expect(Object.isFrozen(result.value.policy.range)).toBe(true);
  });

  test("malformed Quartal runtime contexts never throw and return exact typed reasons", () => {
    const cases = [
      {
        label: "missing evidenceId",
        request: malformedQuartalRequest((context) => {
          Reflect.deleteProperty(context, "evidenceId");
        }),
        reason: "evidence-id-invalid",
        path: ["quartalContext"],
      },
      {
        label: "non-string evidenceId",
        request: malformedQuartalRequest((context) => {
          Reflect.set(context, "evidenceId", 23);
        }),
        reason: "evidence-id-invalid",
        path: ["quartalContext"],
      },
      {
        label: "missing degreeSequence",
        request: malformedQuartalRequest((context) => {
          Reflect.deleteProperty(context, "degreeSequence");
        }),
        reason: "degree-count-mismatch",
        path: ["quartalContext"],
      },
      {
        label: "non-array degreeSequence",
        request: malformedQuartalRequest((context) => {
          Reflect.set(context, "degreeSequence", { length: 4 });
        }),
        reason: "degree-count-mismatch",
        path: ["quartalContext"],
      },
      {
        label: "malformed degree member",
        request: malformedQuartalRequest((context) => {
          const sequence = structuredClone(
            requireQuartalRequest("V0-CAND-009").quartalContext.degreeSequence,
          ) as unknown as unknown[];
          sequence[2] = null;
          Reflect.set(context, "degreeSequence", sequence);
        }),
        reason: "degree-absent-from-realization",
        path: ["quartalContext", "degreeSequence", 2],
      },
    ] as const;

    for (const scenario of cases) {
      const result = realizeVoicing(scenario.request);
      expect(result.ok).toBe(false);
      if (result.ok) {
        throw new Error(`${scenario.label}: malformed context generated a value`);
      }
      expect("value" in result).toBe(false);
      expect(result.evidence.termination).toBe("quartal-context-invalid");
      expect(result.refusal).toEqual({
        code: "voicing.quartal_context_invalid",
        path: scenario.path,
        reason: scenario.reason,
      });
    }
  });

  test("a valid fourth stack cannot omit a non-root chord-identity tone", () => {
    const base = requireQuartalRequest("V0-CAND-010");
    const request = {
      ...base,
      policy: { ...base.policy, voiceCount: 3 },
      quartalContext: {
        ...base.quartalContext,
        degreeSequence: [
          v0DegreeFromToken("13", "quartal-identity"),
          v0DegreeFromToken("9", "quartal-identity"),
          v0DegreeFromToken("5", "quartal-identity"),
        ],
      },
    } as unknown as QuartalAutoVoicingRequest;

    const result = realizeVoicing(request);
    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Quartal identity omission unexpectedly generated a value");
    }
    expect(result.evidence.termination).toBe("constraints-unsatisfied");
    expect(result.refusal.code).toBe("voicing.constraints_unsatisfied");
    if (result.refusal.code !== "voicing.constraints_unsatisfied") {
      throw new Error("Quartal identity omission returned the wrong refusal");
    }
    const identityObservation = result.refusal.constraints.find(
      ({ reason }) => reason === "identity-tone-omitted",
    );
    expect(identityObservation).toEqual({
      code: "voicing.constraint.identity_tones",
      satisfied: false,
      reason: "identity-tone-omitted",
      voiceOrdinals: [],
      degrees: [{ number: 3, alter: -1 }],
      midiValues: [],
    });
  });

  test("doubled-degree explanation follows T1 realization order, not output order", () => {
    const base = requireAutoRequest("V0-CAND-015");
    const request = {
      ...base,
      policy: {
        ...base.policy,
        voiceCount: 4,
        range: { lowMidi: 48, highMidi: 84 },
        bassPolicy: "none",
      },
    } as AutoVoicingRequest;
    const result = requireGeneratedSuccess(
      realizeVoicing(request),
      "four-voice C5",
    );
    const reversedInOutput = result.value.candidates.find((candidate) =>
      candidate.voices
        .filter(({ provenance }) => provenance === "doubling")
        .map(({ degree }) => (degree === null ? null : v0DegreeToken(degree)))
        .every((token, index) => token === ["5", "1"][index]),
    );

    expect(reversedInOutput).toBeDefined();
    expect(
      reversedInOutput?.explanation.doubledDegrees.map(v0DegreeToken),
    ).toEqual(["1", "5"]);
  });

  test("the 97th raw candidate refuses atomically with no partial candidates", () => {
    const base = requireAutoRequest("V0-CAND-001");
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
      throw new Error("The raw-candidate plus-one probe unexpectedly completed");
    }
    expect("value" in result).toBe(false);
    expect("candidates" in result).toBe(false);
    expect(JSON.stringify(result)).not.toContain('"candidates"');
    expect(result.refusal).toEqual({
      code: "limit.voicing_work_exceeded",
      path: [],
      counter: "rawCandidatesProduced",
      received: 97,
      maximum: 96,
      partialResult: false,
    });
    expect(result.evidence.rawCandidatesProduced).toBe(96);
    expect(result.evidence.termination).toBe("work-limit-exceeded");
  });
});
