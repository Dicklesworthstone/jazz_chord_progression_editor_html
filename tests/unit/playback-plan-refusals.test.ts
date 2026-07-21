import { describe, expect, setDefaultTimeout, test } from "bun:test";

import contractFixtureValue from "../fixtures/playback-plan/p0-playback-plan-contract.json";

import {
  PLAYBACK_PLAN_REFUSAL_PRECEDENCE,
  compilePlaybackPlan,
  type CompilePlaybackPlanRequest,
  type CompilePlaybackPlanResult,
} from "../../src/playback";
import {
  P0_LOOP_CASES,
  P0_REALIZATION_CASES,
  materializeP0LimitStructuralCase,
  materializeP0LoopCase,
  materializeP0RealizationCase,
  p0LimitStructuralCase,
} from "../support/p0-playback-fixtures";

setDefaultTimeout(600_000);

type JsonRecord = Record<string, unknown>;

const EXPECTED_ONLY_KEYS = new Set([
  "ok",
  "termination",
  "partialResult",
  "fallbackPitchesForbidden",
  "automaticGenerationForbidden",
  "candidateVoicePitchEqualityRequired",
  "deduplicateForbidden",
  "generatedByAffectsPitches",
  "missingBindingDidNotWin",
  "pitchSource",
  "regenerationForbidden",
  "sortForbidden",
]);

function requireRecord(value: unknown, label: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`P0_REFUSAL_RECORD:${label}`);
  }
  return value as JsonRecord;
}

function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`P0_REFUSAL_ARRAY:${label}`);
  }
  return value;
}

function firstDocumentEvent(
  request: CompilePlaybackPlanRequest,
): JsonRecord {
  const document = requireRecord(request.document, "document");
  const section = requireRecord(
    requireArray(document["sections"], "sections")[0],
    "section",
  );
  const measure = requireRecord(
    requireArray(section["measures"], "measures")[0],
    "measure",
  );
  return requireRecord(
    requireArray(measure["events"], "events")[0],
    "event",
  );
}

function primaryBinding(
  request: CompilePlaybackPlanRequest,
): JsonRecord {
  const entry = [...request.realizedVoicings.entries()].find(
    ([eventId]) => String(eventId) === "event-p0-realization",
  );
  if (entry === undefined) {
    throw new Error("P0_REFUSAL_PRIMARY_BINDING_MISSING");
  }
  return requireRecord(entry[1], "primary binding");
}

function generatedCandidate(
  request: CompilePlaybackPlanRequest,
): JsonRecord {
  const binding = primaryBinding(request);
  const outcome = requireRecord(binding["outcome"], "generated outcome");
  return requireRecord(outcome["candidate"], "generated candidate");
}

function expectUnknownEqual(actual: unknown, expected: unknown): void {
  expect(actual).toEqual(expected);
}

function expectUnknownToBe(actual: unknown, expected: unknown): void {
  expect(actual).toBe(expected);
}

function expectFrozenFailure(
  result: CompilePlaybackPlanResult,
  expected: Readonly<Record<string, unknown>>,
  label: string,
): void {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error(`${label}:EXPECTED_REFUSAL`);
  const refusal = requireRecord(result.refusal, `${label}:refusal`);
  for (const [key, value] of Object.entries(expected)) {
    if (!EXPECTED_ONLY_KEYS.has(key)) {
      expect(key in refusal).toBe(true);
      expect(refusal[key]).toEqual(value);
    }
  }
  expectUnknownToBe(result.evidence.termination, expected["termination"]);
  expect("plan" in result).toBe(false);
}

function expectPrecedenceRefusal(
  request: CompilePlaybackPlanRequest,
  code: string,
  termination: string,
): void {
  const result = compilePlaybackPlan(request);
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error(`P0_PRECEDENCE_${code}:EXPECTED_REFUSAL`);
  expectUnknownToBe(result.refusal.code, code);
  expectUnknownToBe(result.evidence.termination, termination);
  expect("plan" in result).toBe(false);
}

describe("P0/verify exact refusal precedence and no-partial-plan law", () => {
  test("the public semantic order equals the independently frozen 22-code order", () => {
    expect(contractFixtureValue.productionOutputUsed).toBe(false);
    expect(contractFixtureValue.expectedValuesGenerated).toBe(false);
    expectUnknownEqual(
      Array.from(PLAYBACK_PLAN_REFUSAL_PRECEDENCE),
      contractFixtureValue.refusalPrecedence,
    );
  });

  for (const recipe of P0_REALIZATION_CASES.filter(
    ({ expected }) => expected["ok"] === false,
  )) {
    test(`${recipe.id} returns its one reviewed refusal and no plan`, () => {
      const materialized = materializeP0RealizationCase(recipe.id);
      expectFrozenFailure(
        compilePlaybackPlan(materialized.request),
        recipe.expected,
        recipe.id,
      );
    });
  }

  for (const recipe of P0_LOOP_CASES.filter(
    ({ expected }) => expected["ok"] === false,
  )) {
    test(`${recipe.id} returns its one reviewed refusal and no plan`, () => {
      const materialized = materializeP0LoopCase(recipe.id);
      expectFrozenFailure(
        compilePlaybackPlan(materialized.request),
        recipe.expected,
        recipe.id,
      );
    });
  }

  test("P0-REAL-022 proves missing binding wins over an independently present extra binding", () => {
    const result = compilePlaybackPlan(
      materializeP0RealizationCase("P0-REAL-022").request,
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("P0_REAL_022_EXPECTED_REFUSAL");
    expectUnknownEqual(result.refusal, {
      code: "playback.realization_binding_missing",
      path: ["realizedVoicings", "event-p0-realization"],
      eventId: "event-p0-realization",
    });
    expect(result.evidence.termination).toBe("realization-invalid");
    expect("plan" in result).toBe(false);
  });

  test("P0-LIMIT-STRUCT-004 proves timeline overflow wins before its missing binding", () => {
    const recipe = p0LimitStructuralCase("P0-LIMIT-STRUCT-004");
    const materialized = materializeP0LimitStructuralCase(recipe.id);
    const result = compilePlaybackPlan(materialized.request);
    expect(materialized.request.realizedVoicings.size).toBe(0);
    expectFrozenFailure(result, recipe.expected, recipe.id);
    if (result.ok) throw new Error(`${recipe.id}:EXPECTED_REFUSAL`);
    expectUnknownEqual(result.refusal, {
      code: recipe.expected.code,
      path: recipe.expected.path,
      measureId: recipe.expected.measureId,
      maximumQuarterNoteBeats: recipe.expected.maximumQuarterNoteBeats,
    });
  });

  test("P0-LIMIT-STRUCT-006 refuses binding maximum plus one without constructing a partial plan", () => {
    const recipe = p0LimitStructuralCase("P0-LIMIT-STRUCT-006");
    const materialized = materializeP0LimitStructuralCase(recipe.id);
    const result = compilePlaybackPlan(materialized.request);
    expectFrozenFailure(result, recipe.expected, recipe.id);
    if (result.ok) throw new Error(`${recipe.id}:EXPECTED_REFUSAL`);
    expectUnknownEqual(result.refusal, {
      code: recipe.expected.code,
      path: recipe.expected.path,
      received: recipe.expected.received,
      maximum: recipe.expected.maximum,
    });
  });

  test("request policy identity wins before a separately overflowing source timeline", () => {
    const request: CompilePlaybackPlanRequest = {
      ...materializeP0LimitStructuralCase("P0-LIMIT-STRUCT-004").request,
    };
    requireRecord(request, "policy plus timeline")["loopPolicyVersion"] =
      "changes.playback.loop-policy.v999";
    expectPrecedenceRefusal(
      request,
      "playback.policy_identity_invalid",
      "request-invalid",
    );
  });

  test("extra binding wins before a separately mismatched binding identity", () => {
    const request = materializeP0RealizationCase("P0-REAL-009").request;
    primaryBinding(request)["eventId"] = "event-p0-wrong-binding";
    expectPrecedenceRefusal(
      request,
      "playback.realization_binding_extra",
      "realization-invalid",
    );
  });

  test("binding identity mismatch wins before a separately stale source chord", () => {
    const request = materializeP0RealizationCase("P0-REAL-011").request;
    primaryBinding(request)["eventId"] = "event-p0-wrong-binding";
    expectPrecedenceRefusal(
      request,
      "playback.realization_binding_identity_mismatch",
      "realization-invalid",
    );
  });

  test("stale source chord wins before a separately stale Auto policy", () => {
    const request = materializeP0RealizationCase("P0-REAL-011").request;
    const voicing = requireRecord(
      firstDocumentEvent(request)["voicing"],
      "stale Auto voicing",
    );
    voicing["family"] = "open";
    expectPrecedenceRefusal(
      request,
      "playback.realization_source_chord_stale",
      "realization-invalid",
    );
  });

  test("stale source voicing wins before a separately unavailable realization", () => {
    const request = materializeP0RealizationCase("P0-REAL-013").request;
    const voicing = requireRecord(
      firstDocumentEvent(request)["voicing"],
      "unavailable stale Auto voicing",
    );
    voicing["family"] = "open";
    expectPrecedenceRefusal(
      request,
      "playback.realization_source_voicing_stale",
      "realization-invalid",
    );
  });

  test("invalid candidate shape wins before a separate realization-id mismatch", () => {
    const request = materializeP0RealizationCase("P0-REAL-023").request;
    generatedCandidate(request)["schema"] =
      "changes.theory.voicing-candidate.v999";
    expectPrecedenceRefusal(
      request,
      "playback.generated_candidate_invalid",
      "realization-invalid",
    );
  });

  test("invalid loop shape wins before a separately out-of-range loop", () => {
    const request = materializeP0RealizationCase("P0-REAL-001").request;
    const sourceLoop = materializeP0LoopCase("P0-LOOP-014").request.loop;
    if (sourceLoop === null) throw new Error("P0_LOOP_014_RANGE_MISSING");
    const loop = structuredClone(sourceLoop);
    requireRecord(loop, "empty out-of-range loop")["end"] =
      structuredClone(loop.start);
    expectPrecedenceRefusal(
      { ...request, loop },
      "playback.loop_invalid",
      "loop-invalid",
    );
  });

  test("invalid loop shape wins before a separately nonintegral gate", () => {
    const request = materializeP0RealizationCase("P0-REAL-021").request;
    const loop = materializeP0LoopCase("P0-LOOP-010").request.loop;
    if (loop === null) throw new Error("P0_LOOP_010_RANGE_MISSING");
    expectPrecedenceRefusal(
      { ...request, loop },
      "playback.loop_invalid",
      "loop-invalid",
    );
  });

});
