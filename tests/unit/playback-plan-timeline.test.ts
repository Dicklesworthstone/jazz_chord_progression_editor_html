import { describe, expect, test } from "bun:test";

import {
  compilePlaybackPlan,
  type CompilePlaybackPlanSuccess,
  type PlaybackPlan,
} from "../../src/playback";
import {
  P0_TIMELINE_CASES,
  materializeP0TimelineCase,
  materializeP0TimelinePair,
  p0TimelineCase,
} from "../support/p0-playback-fixtures";

type JsonRecord = Record<string, unknown>;

const TIMELINE_CASE_IDS = [
  "P0-TIME-001",
  "P0-TIME-002",
  "P0-TIME-003",
  "P0-TIME-004",
  "P0-TIME-005",
  "P0-TIME-006",
  "P0-TIME-007",
  "P0-TIME-008",
  "P0-TIME-009",
  "P0-TIME-010",
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

function requireRecord(value: unknown, label: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`P0_TIMELINE_EXPECTED_RECORD:${label}`);
  }
  return value as JsonRecord;
}

function requireStringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new TypeError(`P0_TIMELINE_EXPECTED_STRINGS:${label}`);
  }
  return value;
}

function expectUnknownEqual(actual: unknown, expected: unknown): void {
  expect(actual).toEqual(expected);
}

function expectObjectSubset(
  actualValue: unknown,
  expected: Readonly<Record<string, unknown>>,
): void {
  const actual = requireRecord(actualValue, "actual subset");
  for (const [key, value] of Object.entries(expected)) {
    expect(actual[key]).toEqual(value);
  }
}

function expectTimelineProjection(
  plan: PlaybackPlan,
  expectedValue: Readonly<Record<string, unknown>>,
): void {
  const expected = { ...expectedValue };
  const singleEventValue = expected["singleEvent"];
  delete expected["singleEvent"];
  const fullEvents = expected["events"];
  delete expected["events"];
  expectObjectSubset(plan, expected);

  if (fullEvents !== undefined) expectUnknownEqual(plan.events, fullEvents);
  if (singleEventValue === undefined) return;

  const singleEvent = requireRecord(singleEventValue, "singleEvent");
  expect(plan.events).toHaveLength(1);
  const event = plan.events[0];
  if (event === undefined) throw new Error("P0_TIMELINE_EVENT_MISSING");
  const eventRecord = requireRecord(event, "single event");
  for (const [key, value] of Object.entries(singleEvent)) {
    const actualKey = key === "gateTicks" ? "gateDurationTicks" : key;
    expect(eventRecord[actualKey]).toEqual(value);
  }
}

describe("P0/verify exact playback-plan source timeline", () => {
  test("the frozen owner enumerates all 10 reviewed timeline cases", () => {
    expect(P0_TIMELINE_CASES.map(({ id }) => id)).toEqual([
      ...TIMELINE_CASE_IDS,
    ]);
  });

  for (const recipe of P0_TIMELINE_CASES) {
    if (recipe.pairedDocumentRecipes !== undefined) continue;

    test(`${recipe.id} compiles the independently reviewed literal projection`, () => {
      const fixture = materializeP0TimelineCase(recipe.id);
      const result = compilePlaybackPlan(fixture.request);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(`${recipe.id}:${result.refusal.code}`);
      expectExactSuccessIdentityAndKeys(result);
      if (recipe.expectedPlan === undefined) {
        throw new Error(`${recipe.id}:EXPECTED_PLAN_MISSING`);
      }
      expectTimelineProjection(result.plan, recipe.expectedPlan);
      expect(result.evidence.termination).toBe("complete");
    });
  }

  test("P0-TIME-010 changes only the two reviewed tempo fields", () => {
    const [lowFixture, highFixture] = materializeP0TimelinePair();
    const low = compilePlaybackPlan(lowFixture.request);
    const high = compilePlaybackPlan(highFixture.request);
    expect(low.ok).toBe(true);
    expect(high.ok).toBe(true);
    if (!low.ok || !high.ok) throw new Error("P0_TIME_010_REFUSED");
    expectExactSuccessIdentityAndKeys(low);
    expectExactSuccessIdentityAndKeys(high);

    const relation = requireRecord(
      p0TimelineCase("P0-TIME-010").expectedRelation,
      "P0-TIME-010 relation",
    );
    const lowPlan = requireRecord(low.plan, "low plan");
    const highPlan = requireRecord(high.plan, "high plan");
    const equalFields = requireStringArray(
      relation["equalFields"],
      "equalFields",
    );
    const differentFields = requireStringArray(
      relation["differentFields"],
      "differentFields",
    );
    const relationFields = [...equalFields, ...differentFields];
    expect([...relationFields].sort()).toEqual([...PLAN_OWN_KEY_ORDER].sort());

    for (const field of equalFields) {
      expect(lowPlan[field]).toEqual(highPlan[field]);
    }
    for (const field of differentFields) {
      expect(lowPlan[field]).not.toEqual(highPlan[field]);
    }
    for (const forbidden of requireStringArray(
      relation["forbiddenPlanFields"],
      "forbiddenPlanFields",
    )) {
      for (const plan of [low.plan, high.plan]) {
        expect(forbidden in plan).toBe(false);
        for (const event of plan.events) {
          expect(forbidden in event).toBe(false);
        }
      }
    }
  });

  test("binding Map insertion order cannot alter plan bytes or evidence", () => {
    const sourceOrder = materializeP0TimelineCase("P0-TIME-001", {
      bindingOrder: "source",
    });
    const reverseOrder = materializeP0TimelineCase("P0-TIME-001", {
      bindingOrder: "reverse-source",
    });
    const sourceResult = compilePlaybackPlan(sourceOrder.request);
    const reverseResult = compilePlaybackPlan(reverseOrder.request);
    expect(sourceResult.ok).toBe(true);
    expect(reverseResult.ok).toBe(true);
    if (!sourceResult.ok || !reverseResult.ok) {
      throw new Error("P0_TIMELINE_MAP_ORDER_REFUSED");
    }
    expectExactSuccessIdentityAndKeys(sourceResult);
    expectExactSuccessIdentityAndKeys(reverseResult);
    expect(JSON.stringify(sourceResult.plan)).toBe(
      JSON.stringify(reverseResult.plan),
    );
    expect(sourceResult.evidence).toEqual(reverseResult.evidence);
  });
});
