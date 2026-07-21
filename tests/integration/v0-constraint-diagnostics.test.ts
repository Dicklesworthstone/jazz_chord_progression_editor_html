import { describe, expect, test } from "bun:test";

import type {
  AutoBassPolicy,
  AutoVoiceCount,
  AutoVoicingFamily,
} from "../../src/domain";
import {
  VOICING_CONSTRAINT_CODES,
  type AutoVoicingRequest,
  type UnsatisfiedVoicingConstraint,
} from "../../src/theory/voicing-candidates-contract";
import { realizeVoicing } from "../../src/theory/voicing-candidates";
import {
  buildV0AutoCandidateRequest,
  v0CandidateCase,
} from "../support/v0-voicing-fixture";

function constrainedCmaj7Request(
  family: AutoVoicingFamily,
  voiceCount: AutoVoiceCount,
  lowMidi: number,
  highMidi: number,
): AutoVoicingRequest {
  const source = v0CandidateCase("V0-CAND-003");
  if (!("sourceSymbol" in source)) {
    throw new Error("V0-CAND-003 must remain an Auto candidate recipe");
  }
  return buildV0AutoCandidateRequest({
    ...source,
    id: `V0-DIAGNOSTIC-${family}`,
    sourceSymbol: "Cmaj7",
    policy: {
      family,
      voiceCount,
      range: { lowMidi, highMidi },
      bassPolicy: "generated",
    },
  }) as AutoVoicingRequest;
}

function diagnosticSearchRequest(
  id: string,
  sourceSymbol: string,
  family: AutoVoicingFamily,
  voiceCount: AutoVoiceCount,
  lowMidi: number,
  highMidi: number,
  bassPolicy: AutoBassPolicy,
): AutoVoicingRequest {
  const source = v0CandidateCase("V0-CAND-003");
  if (!("sourceSymbol" in source)) {
    throw new Error("V0-CAND-003 must remain an Auto candidate recipe");
  }
  return buildV0AutoCandidateRequest({
    ...source,
    id,
    sourceSymbol,
    policy: {
      family,
      voiceCount,
      range: { lowMidi, highMidi },
      bassPolicy,
    },
  }) as AutoVoicingRequest;
}

function failedConstraints(
  request: AutoVoicingRequest,
): Readonly<{
  constraints: readonly UnsatisfiedVoicingConstraint[];
  hardConstraintChecks: number;
}> {
  const result = realizeVoicing(request);
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("expected a constraints refusal");
  expect("value" in result).toBe(false);
  expect(result.refusal.code).toBe("voicing.constraints_unsatisfied");
  if (result.refusal.code !== "voicing.constraints_unsatisfied") {
    throw new Error(`unexpected refusal: ${result.refusal.code}`);
  }
  expect(result.evidence.termination).toBe("constraints-unsatisfied");
  return {
    constraints: result.refusal.constraints,
    hardConstraintChecks: result.evidence.hardConstraintChecks,
  };
}

describe("V0 complete hard-constraint diagnostics", () => {
  test("duplicate-MIDI refusals retain both exact affected voices before hard validation", () => {
    const request = diagnosticSearchRequest(
      "V0-DIAGNOSTIC-ADAPTIVE-DUPLICATE",
      "C5",
      "balanced",
      3,
      60,
      67,
      "none",
    );
    const result = realizeVoicing(request);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("duplicate-MIDI witness unexpectedly generated");
    expect(result.refusal.code).toBe("voicing.constraints_unsatisfied");
    if (result.refusal.code !== "voicing.constraints_unsatisfied") {
      throw new Error(`unexpected refusal: ${result.refusal.code}`);
    }
    expect(result.refusal.constraints as unknown).toEqual([
      {
        code: "voicing.constraint.unique_midi",
        satisfied: false,
        reason: "duplicate-midi",
        voiceOrdinals: [0, 1],
        degrees: [
          { number: 1, alter: 0 },
          { number: 1, alter: 0 },
        ],
        midiValues: [60, 60],
      },
    ]);
    expect(result.evidence).toMatchObject({
      constraintObservationsProduced: 1,
      hardConstraintChecks: 0,
      rawCandidatesProduced: 0,
      termination: "constraints-unsatisfied",
    });
  });

  test("adaptive shortfall separates count exhaustion from Drop-2 doubling refusal", () => {
    for (const [family, expected] of [
      [
        "balanced",
        {
          code: "voicing.constraint.voice_count",
          reason: "voice-count-unsupported",
          slots: 4,
        },
      ],
      [
        "open",
        {
          code: "voicing.constraint.voice_count",
          reason: "voice-count-unsupported",
          slots: 4,
        },
      ],
      [
        "drop2",
        {
          code: "voicing.constraint.permitted_doubling",
          reason: "doubling-not-permitted",
          slots: 3,
        },
      ],
    ] as const) {
      const request = diagnosticSearchRequest(
        `V0-DIAGNOSTIC-ADAPTIVE-SHORTFALL-${family}`,
        "Caug",
        family,
        7,
        48,
        84,
        "none",
      );
      const result = realizeVoicing(request);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error(`${family} shortfall unexpectedly generated`);
      expect(result.refusal.code).toBe("voicing.constraints_unsatisfied");
      if (result.refusal.code !== "voicing.constraints_unsatisfied") {
        throw new Error(`unexpected ${family} refusal: ${result.refusal.code}`);
      }
      expect(result.refusal.constraints as unknown).toEqual([
        {
          code: expected.code,
          satisfied: false,
          reason: expected.reason,
          voiceOrdinals: [],
          degrees: [],
          midiValues: [],
        },
      ]);
      expect(result.evidence.templateDegreeSlotsVisited).toBe(expected.slots);
    }
  });

  test("Drop-2 rejects pitch-class and sparse-shape impossibilities before register search", () => {
    for (const [symbol, voiceCount, expectedSlots, bassPolicy] of [
      ["Cdim7", 4, 4, "none"],
      ["C9sus2", 4, 4, "none"],
      ["C9sus2", 5, 5, "none"],
      ["C9sus2/E", 5, 4, "generated"],
    ] as const) {
      const request = diagnosticSearchRequest(
        `V0-DIAGNOSTIC-DROP2-STATIC-${symbol}-${voiceCount.toString()}`,
        symbol,
        "drop2",
        voiceCount,
        24,
        95,
        bassPolicy,
      );
      const result = realizeVoicing(request);
      expect(result.ok).toBe(false);
      if (result.ok) {
        throw new Error(`${symbol} Drop-2 vc${voiceCount.toString()} unexpectedly generated`);
      }
      expect(result.refusal.code).toBe("voicing.constraints_unsatisfied");
      if (result.refusal.code !== "voicing.constraints_unsatisfied") {
        throw new Error(`unexpected Drop-2 refusal: ${result.refusal.code}`);
      }
      expect(result.refusal.constraints as unknown).toEqual([
        {
          code: "voicing.constraint.family_structure",
          satisfied: false,
          reason: "family-transform-invalid",
          voiceOrdinals: [],
          degrees: [],
          midiValues: [],
        },
      ]);
      expect(result.evidence).toMatchObject({
        templateDegreeSlotsVisited: expectedSlots,
        registerPlacementsVisited: 0,
        searchStatesExpanded: 0,
        structuralTransformsAttempted: 0,
        hardConstraintChecks: 0,
        constraintObservationsProduced: 1,
        termination: "constraints-unsatisfied",
      });
    }
  });

  test("supported adaptive counts report the exact omitted required/guide suffix", () => {
    const source = v0CandidateCase("V0-CAND-033");
    if (!("sourceSymbol" in source)) {
      throw new Error("V0-CAND-033 must remain an Auto candidate recipe");
    }
    const requests = [
      buildV0AutoCandidateRequest(source),
      buildV0AutoCandidateRequest({
        ...source,
        id: "V0-DIAGNOSTIC-ALTERED-SLASH",
        sourceSymbol: "C7alt/Eb",
        policy: {
          ...source.policy,
          voiceCount: 4,
        },
      }),
    ] as const;

    for (const request of requests) {
      const diagnostic = failedConstraints(request as AutoVoicingRequest);
      expect(diagnostic.constraints as unknown).toEqual([
        {
          code: "voicing.constraint.required_degrees",
          satisfied: false,
          reason: "required-degree-omitted",
          voiceOrdinals: [],
          degrees: [
            { number: 7, alter: -1 },
            { number: 9, alter: -1 },
          ],
          midiValues: [],
        },
        {
          code: "voicing.constraint.guide_tones",
          satisfied: false,
          reason: "guide-tone-omitted",
          voiceOrdinals: [],
          degrees: [{ number: 7, alter: -1 }],
          midiValues: [],
        },
      ]);
      expect(diagnostic.hardConstraintChecks).toBe(0);
    }
  });

  test("Open Cmaj7 reports spacing and family failures in canonical order", () => {
    const diagnostic = failedConstraints(
      constrainedCmaj7Request("open", 4, 48, 59),
    );

    expect(diagnostic.constraints as unknown).toEqual([
      {
        code: "voicing.constraint.low_register_spacing",
        satisfied: false,
        reason: "low-register-spacing",
        voiceOrdinals: [1, 2],
        degrees: [
          { number: 3, alter: 0 },
          { number: 5, alter: 0 },
        ],
        midiValues: [52, 55],
      },
      {
        code: "voicing.constraint.family_structure",
        satisfied: false,
        reason: "family-transform-invalid",
        voiceOrdinals: [0, 1, 2, 3],
        degrees: [
          { number: 1, alter: 0 },
          { number: 3, alter: 0 },
          { number: 5, alter: 0 },
          { number: 7, alter: 0 },
        ],
        midiValues: [48, 52, 55, 59],
      },
    ]);
    expect(
      diagnostic.constraints.map(({ code }) =>
        VOICING_CONSTRAINT_CODES.indexOf(code),
      ),
    ).toEqual([13, 14]);
    expect(diagnostic.hardConstraintChecks).toBe(
      VOICING_CONSTRAINT_CODES.length,
    );
  });

  test("Shell Cmaj7 identifies only the exact low-spacing pair", () => {
    const diagnostic = failedConstraints(
      constrainedCmaj7Request("shell", 3, 36, 47),
    );

    expect(diagnostic.constraints as unknown).toEqual([
      {
        code: "voicing.constraint.low_register_spacing",
        satisfied: false,
        reason: "low-register-spacing",
        voiceOrdinals: [0, 1],
        degrees: [
          { number: 1, alter: 0 },
          { number: 3, alter: 0 },
        ],
        midiValues: [36, 40],
      },
    ]);
    expect(diagnostic.hardConstraintChecks).toBe(
      VOICING_CONSTRAINT_CODES.length,
    );
  });

  test("a distinct 17th no-result observation returns the typed operation limit without a partial refusal", () => {
    const request = diagnosticSearchRequest(
      "V0-DIAGNOSTIC-OBSERVATION-OVERFLOW",
      "Cmaj7/E",
      "balanced",
      4,
      24,
      95,
      "external",
    );
    const result = realizeVoicing(request);

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("the distinct-17 diagnostic search unexpectedly generated");
    }
    expect("value" in result).toBe(false);
    expect("constraints" in result.refusal).toBe(false);
    expect(result.refusal).toEqual({
      code: "limit.voicing_work_exceeded",
      path: [],
      counter: "constraintObservationsProduced",
      received: 17,
      maximum: 16,
      partialResult: false,
    });
    expect(result.evidence).toEqual({
      realizationDegreeRecordsVisited: 4,
      templateRowsVisited: 57,
      templateDegreeSlotsVisited: 4,
      registerPlacementsVisited: 24,
      searchStatesExpanded: 1555,
      structuralTransformsAttempted: 1296,
      hardConstraintChecks: 20736,
      rawCandidatesProduced: 0,
      candidateCanonicalizations: 0,
      duplicateCandidateComparisons: 0,
      localScoresComputed: 0,
      orderingComparisons: 0,
      retainedCandidatesProduced: 0,
      outputVoicesProduced: 0,
      constraintObservationComparisons: 163,
      constraintObservationsProduced: 16,
      peakRegisterPlacementRecords: 24,
      peakSearchStateRecords: 5,
      peakRawCandidateRecords: 0,
      peakRawVoiceRecords: 0,
      peakRetainedCandidateRecords: 0,
      peakOutputVoiceRecords: 0,
      peakTrackedRecords: 161,
      peakConstraintObservationRecords: 16,
      termination: "work-limit-exceeded",
    });
  });

  test("a first legal candidate after the provisional distinct-17 boundary cancels diagnostic overflow", () => {
    const request = diagnosticSearchRequest(
      "V0-DIAGNOSTIC-LATE-LEGAL-CANCELLATION",
      "Cmaj7",
      "open",
      4,
      29,
      59,
      "generated",
    );
    const result = realizeVoicing(request);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(
        `late legal candidate was refused: ${result.refusal.code}`,
      );
    }
    expect(result.value.rawCandidateCount).toBe(1);
    expect(result.value.candidates).toHaveLength(1);
    expect(
      result.value.candidates[0].voices.map(({ midi }) => Number(midi)),
    ).toEqual([36, 43, 52, 59]);
    expect(result.evidence).toEqual({
      realizationDegreeRecordsVisited: 4,
      templateRowsVisited: 61,
      templateDegreeSlotsVisited: 4,
      registerPlacementsVisited: 10,
      searchStatesExpanded: 55,
      structuralTransformsAttempted: 36,
      hardConstraintChecks: 576,
      rawCandidatesProduced: 1,
      candidateCanonicalizations: 1,
      duplicateCandidateComparisons: 0,
      localScoresComputed: 1,
      orderingComparisons: 0,
      retainedCandidatesProduced: 1,
      outputVoicesProduced: 4,
      constraintObservationComparisons: 110,
      constraintObservationsProduced: 16,
      peakRegisterPlacementRecords: 10,
      peakSearchStateRecords: 5,
      peakRawCandidateRecords: 1,
      peakRawVoiceRecords: 4,
      peakRetainedCandidateRecords: 1,
      peakOutputVoiceRecords: 4,
      peakTrackedRecords: 147,
      peakConstraintObservationRecords: 16,
      termination: "complete-generated",
    });
  });
});
