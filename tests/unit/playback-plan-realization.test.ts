import { describe, expect, test } from "bun:test";

import lawFixtureValue from "../fixtures/playback-plan/law-cases.json";

import { validateDocumentSemantics } from "../../src/application";
import {
  compilePlaybackPlan,
  type CompilePlaybackPlanRequest,
  type CompilePlaybackPlanSuccess,
} from "../../src/playback";
import {
  P0_REALIZATION_CASES,
  materializeP0RealizationBaseline,
  materializeP0RealizationCase,
  p0RealizationCase,
} from "../support/p0-playback-fixtures";

type JsonRecord = Record<string, unknown>;

const REALIZATION_CASE_IDS = [
  "P0-REAL-001",
  "P0-REAL-002",
  "P0-REAL-003",
  "P0-REAL-004",
  "P0-REAL-005",
  "P0-REAL-006",
  "P0-REAL-007",
  "P0-REAL-008",
  "P0-REAL-009",
  "P0-REAL-010",
  "P0-REAL-011",
  "P0-REAL-012",
  "P0-REAL-013",
  "P0-REAL-014",
  "P0-REAL-015",
  "P0-REAL-016",
  "P0-REAL-017",
  "P0-REAL-018",
  "P0-REAL-019",
  "P0-REAL-020",
  "P0-REAL-021",
  "P0-REAL-022",
  "P0-REAL-023",
] as const;

const SUCCESS_RESULT_KEYS = [
  "compilerId",
  "compilerVersion",
  "evidence",
  "ok",
  "plan",
  "schema",
] as const;

const PLAN_OWN_KEY_ORDER = [
  "schema",
  "compilerId",
  "compilerVersion",
  "articulationPolicyId",
  "articulationPolicyVersion",
  "loopPolicyId",
  "loopPolicyVersion",
  "velocityPolicyId",
  "velocityPolicyVersion",
  "realizationBindingPolicyId",
  "realizationBindingPolicyVersion",
  "sourceDocumentId",
  "midiPpq",
  "tempoBpm",
  "meter",
  "events",
  "totalBeats",
  "totalTicks",
  "loop",
  "loopTicks",
] as const;

const EVENT_OWN_KEY_ORDER = [
  "schema",
  "ordinal",
  "sourceOrdinal",
  "eventId",
  "sectionId",
  "measureId",
  "sourceStartBeat",
  "sourceDurationBeats",
  "sourceStartTick",
  "sourceDurationTicks",
  "sourceOffsetBeats",
  "sourceOffsetTicks",
  "startBeat",
  "durationBeats",
  "gateDurationBeats",
  "startTick",
  "durationTicks",
  "gateDurationTicks",
  "pitches",
  "midiPitches",
  "velocity",
  "articulation",
] as const;

function expectExactSuccessIdentityAndKeys(
  result: CompilePlaybackPlanSuccess,
): void {
  expect([...Object.keys(result)].sort()).toEqual([...SUCCESS_RESULT_KEYS]);
  expect({
    schema: result.schema,
    compilerId: result.compilerId,
    compilerVersion: result.compilerVersion,
  }).toEqual({
    schema: "changes.playback.plan-result.v1",
    compilerId: "changes.playback-plan-compiler",
    compilerVersion: 1,
  });

  expect(Object.keys(result.plan)).toEqual([...PLAN_OWN_KEY_ORDER]);
  expect({
    schema: result.plan.schema,
    compilerId: result.plan.compilerId,
    compilerVersion: result.plan.compilerVersion,
    articulationPolicyId: result.plan.articulationPolicyId,
    articulationPolicyVersion: result.plan.articulationPolicyVersion,
    loopPolicyId: result.plan.loopPolicyId,
    loopPolicyVersion: result.plan.loopPolicyVersion,
    velocityPolicyId: result.plan.velocityPolicyId,
    velocityPolicyVersion: result.plan.velocityPolicyVersion,
    realizationBindingPolicyId: result.plan.realizationBindingPolicyId,
    realizationBindingPolicyVersion:
      result.plan.realizationBindingPolicyVersion,
    midiPpq: result.plan.midiPpq,
  }).toEqual({
    schema: "changes.playback.plan.v1",
    compilerId: "changes.playback-plan-compiler",
    compilerVersion: 1,
    articulationPolicyId: "changes.playback-articulation",
    articulationPolicyVersion: 1,
    loopPolicyId: "changes.playback-loop",
    loopPolicyVersion: 1,
    velocityPolicyId: "changes.playback-velocity",
    velocityPolicyVersion: 1,
    realizationBindingPolicyId: "changes.playback-realization-binding",
    realizationBindingPolicyVersion: 1,
    midiPpq: 960,
  });

  for (const event of result.plan.events) {
    expect(Object.keys(event)).toEqual([...EVENT_OWN_KEY_ORDER]);
    expect(event.schema).toBe("changes.playback.event.v1");
    expect(event.velocity).toBe(96);
  }
}

const EXPECTED_META_KEYS = new Set([
  "ok",
  "termination",
  "partialResult",
  "fallbackPitchesForbidden",
  "automaticGenerationForbidden",
  "candidateVoicePitchEqualityRequired",
  "deduplicateForbidden",
  "generatedByAffectsPitches",
  "pitchSource",
  "regenerationForbidden",
  "sortForbidden",
]);

function requireRecord(value: unknown, label: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`P0_REALIZATION_RECORD:${label}`);
  }
  return value as JsonRecord;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new TypeError(`P0_REALIZATION_STRING:${label}`);
  }
  return value;
}

function expectUnknownEqual(actual: unknown, expected: unknown): void {
  expect(actual).toEqual(expected);
}

function expectUnknownToBe(actual: unknown, expected: unknown): void {
  expect(actual).toBe(expected);
}

function requestWithAliasOnlyChordEdit(
  caseId: "P0-REAL-001" | "P0-REAL-002",
  sourceText: string,
): CompilePlaybackPlanRequest {
  const baseline = materializeP0RealizationBaseline(caseId);
  const candidate = structuredClone(baseline.request.document);
  const event = candidate.sections[0]?.measures[0]?.events[0];
  if (event === undefined) {
    throw new Error(`${caseId}:P0_ALIAS_SOURCE_EVENT_MISSING`);
  }
  if (!Reflect.set(event.chord, "sourceText", sourceText)) {
    throw new Error(`${caseId}:P0_ALIAS_SOURCE_TEXT_MUTATION_REFUSED`);
  }
  const publication = validateDocumentSemantics(candidate);
  if (!publication.ok) {
    throw new Error(`${caseId}:P0_ALIAS_F3:${publication.errors[0].code}`);
  }
  return {
    ...baseline.request,
    document: publication.value,
  };
}

describe("P0/verify exact realization bindings", () => {
  test("the frozen owner enumerates all 23 reviewed realization cases", () => {
    expect(P0_REALIZATION_CASES.map(({ id }) => id)).toEqual([
      ...REALIZATION_CASE_IDS,
    ]);
  });

  for (const recipe of P0_REALIZATION_CASES) {
    test(`${recipe.id} matches the independently reviewed realization result`, () => {
      const materialized = materializeP0RealizationCase(recipe.id);
      const result = compilePlaybackPlan(materialized.request);
      const expected = recipe.expected;
      expectUnknownToBe(result.ok, expected["ok"]);

      if (expected["ok"] === true) {
        if (!result.ok) throw new Error(`${recipe.id}:${result.refusal.code}`);
        expectExactSuccessIdentityAndKeys(result);
        expect(result.plan.events).toHaveLength(1);
        const event = result.plan.events[0];
        if (event === undefined) {
          throw new Error(`${recipe.id}:PLAYBACK_EVENT_MISSING`);
        }
        expectUnknownEqual(event.pitches, expected["pitches"]);
        expectUnknownEqual(event.midiPitches, expected["midiPitches"]);
        expect(result.evidence.termination).toBe("complete");
        return;
      }

      if (result.ok) throw new Error(`${recipe.id}:EXPECTED_REFUSAL`);
      const refusal = requireRecord(result.refusal, `${recipe.id} refusal`);
      for (const [key, value] of Object.entries(expected)) {
        if (!EXPECTED_META_KEYS.has(key)) {
          expect(key in refusal).toBe(true);
          expect(refusal[key]).toEqual(value);
        }
      }
      expectUnknownToBe(result.evidence.termination, expected["termination"]);
      expect("plan" in result).toBe(false);
    });
  }

  test("P0-LAW-007 keeps an F3-valid stored alias edit nonstale and generated correlation exact", () => {
    expect(lawFixtureValue.productionOutputUsed).toBe(false);
    expect(lawFixtureValue.expectedValuesGenerated).toBe(false);
    const lawValue = lawFixtureValue.cases.find(
      (candidate) => candidate.id === "P0-LAW-007",
    );
    const law = requireRecord(lawValue, "P0-LAW-007");
    const variant = requireRecord(law["variant"], "P0-LAW-007 variant");
    const relation = requireRecord(
      law["expectedRelation"],
      "P0-LAW-007 expectedRelation",
    );
    const nearMiss = requireRecord(
      law["nearMiss"],
      "P0-LAW-007 nearMiss",
    );
    const alias = requireString(variant["sourceText"], "alias sourceText");
    expect(relation).toEqual({
      bothCompileSuccessfully: true,
      canonicalPlanBytesEqual: true,
      storedPitchesEqualByIndex: true,
    });

    const storedBaseline = compilePlaybackPlan(
      materializeP0RealizationBaseline("P0-REAL-002").request,
    );
    const storedAlias = compilePlaybackPlan(
      requestWithAliasOnlyChordEdit("P0-REAL-002", alias),
    );
    expect(storedBaseline.ok).toBe(true);
    expect(storedAlias.ok).toBe(true);
    if (!storedBaseline.ok || !storedAlias.ok) {
      throw new Error("P0_LAW_007_STORED_REFUSED");
    }
    expectExactSuccessIdentityAndKeys(storedBaseline);
    expectExactSuccessIdentityAndKeys(storedAlias);
    const reviewedStored = p0RealizationCase("P0-REAL-002").expected;
    expectUnknownEqual(
      storedBaseline.plan.events[0]?.pitches,
      reviewedStored["pitches"],
    );
    expectUnknownEqual(
      storedAlias.plan.events[0]?.pitches,
      reviewedStored["pitches"],
    );
    expectUnknownEqual(
      storedAlias.plan.events[0]?.midiPitches,
      reviewedStored["midiPitches"],
    );
    expect(JSON.stringify(storedAlias.plan)).toBe(
      JSON.stringify(storedBaseline.plan),
    );

    const generatedAlias = compilePlaybackPlan(
      requestWithAliasOnlyChordEdit("P0-REAL-001", alias),
    );
    expect(generatedAlias.ok).toBe(false);
    if (generatedAlias.ok) throw new Error("P0_LAW_007_NEAR_MISS_ACCEPTED");
    expectUnknownToBe(
      generatedAlias.refusal.code,
      nearMiss["expectedCode"],
    );
    expect(generatedAlias.refusal.path).toEqual([
      "realizedVoicings",
      "event-p0-realization",
      "request",
      "resolved",
      "source",
    ]);
    expect(generatedAlias.evidence.termination).toBe("realization-invalid");
    expect("plan" in generatedAlias).toBe(false);
  });
});
