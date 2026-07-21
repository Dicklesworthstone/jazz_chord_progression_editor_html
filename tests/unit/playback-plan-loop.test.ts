import { describe, expect, test } from "bun:test";

import {
  compilePlaybackPlan,
  type CompilePlaybackPlanSuccess,
  type PlaybackEvent,
  type PlaybackPlan,
} from "../../src/playback";
import {
  P0_LOOP_CASES,
  P0_LOOP_FIXTURE,
  materializeP0LoopCase,
} from "../support/p0-playback-fixtures";

type JsonRecord = Record<string, unknown>;

const LOOP_CASE_IDS = [
  "P0-LOOP-001",
  "P0-LOOP-002",
  "P0-LOOP-003",
  "P0-LOOP-004",
  "P0-LOOP-005",
  "P0-LOOP-006",
  "P0-LOOP-007",
  "P0-LOOP-008",
  "P0-LOOP-009",
  "P0-LOOP-010",
  "P0-LOOP-011",
  "P0-LOOP-012",
  "P0-LOOP-013",
  "P0-LOOP-014",
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

const EXPECTED_FAILURE_META_KEYS = new Set([
  "ok",
  "termination",
  "partialResult",
]);

function requireRecord(value: unknown, label: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`P0_LOOP_EXPECTED_RECORD:${label}`);
  }
  return value as JsonRecord;
}

function expectSubset(
  actualValue: unknown,
  expected: Readonly<Record<string, unknown>>,
  omitted: ReadonlySet<string> = new Set(),
): void {
  const actual = requireRecord(actualValue, "actual subset");
  for (const [key, value] of Object.entries(expected)) {
    if (!omitted.has(key)) expect(actual[key]).toEqual(value);
  }
}

function expectUnknownEqual(actual: unknown, expected: unknown): void {
  expect(actual).toEqual(expected);
}

function expectUnknownToBe(actual: unknown, expected: unknown): void {
  expect(actual).toBe(expected);
}

function expectSourceProjection(event: PlaybackEvent): void {
  const sourceValue = P0_LOOP_FIXTURE.sourceTimeline.find(
    (candidate) => candidate["sourceOrdinal"] === event.sourceOrdinal,
  );
  if (sourceValue === undefined) {
    throw new Error(`P0_LOOP_SOURCE_MISSING:${String(event.sourceOrdinal)}`);
  }
  expectSubset(event, requireRecord(sourceValue, "sourceTimeline"), new Set([
    "sourceRef",
  ]));
}

function expectSuccess(
  plan: PlaybackPlan,
  expected: Readonly<Record<string, unknown>>,
  requestedLoop: unknown,
): void {
  expectSubset(plan, P0_LOOP_FIXTURE.commonExpectedPlan);
  expectUnknownEqual(
    plan.loop,
    "loop" in expected ? expected["loop"] : requestedLoop,
  );
  expectUnknownEqual(plan.loopTicks, expected["loopTicks"]);

  const emissions = expected["emissions"];
  if (!Array.isArray(emissions)) return;
  expect(plan.events).toHaveLength(emissions.length);
  emissions.forEach((expectedEvent, index) => {
    const event = plan.events[index];
    if (event === undefined) {
      throw new Error(`P0_LOOP_EVENT_MISSING:${String(index)}`);
    }
    expectSubset(event, requireRecord(expectedEvent, `emission-${String(index)}`));
    expectSourceProjection(event);
  });
}

describe("P0/verify exact half-open loop projection", () => {
  test("the frozen owner enumerates all 14 reviewed loop cases", () => {
    expect(P0_LOOP_CASES.map(({ id }) => id)).toEqual([...LOOP_CASE_IDS]);
  });

  let nullLoopEvents: readonly PlaybackEvent[] | null = null;

  for (const recipe of P0_LOOP_CASES) {
    test(`${recipe.id} matches the independently reviewed loop result`, () => {
      const fixture = materializeP0LoopCase(recipe.id);
      const result = compilePlaybackPlan(fixture.request);
      const expected = recipe.expected;
      const expectedOk = expected["ok"];
      expectUnknownToBe(result.ok, expectedOk);

      if (expectedOk === true) {
        if (!result.ok) throw new Error(`${recipe.id}:${result.refusal.code}`);
        expectExactSuccessIdentityAndKeys(result);
        expectSuccess(result.plan, expected, fixture.request.loop);
        if (recipe.id === "P0-LOOP-001") nullLoopEvents = result.plan.events;
        if (expected["emissionRef"] === "P0-LOOP-001") {
          if (nullLoopEvents === null) {
            const base = compilePlaybackPlan(
              materializeP0LoopCase("P0-LOOP-001").request,
            );
            if (!base.ok) throw new Error(`P0-LOOP-001:${base.refusal.code}`);
            nullLoopEvents = base.plan.events;
          }
          expect(result.plan.events).toEqual(nullLoopEvents);
        }
        expect(result.evidence.termination).toBe("complete");
        return;
      }

      if (result.ok) throw new Error(`${recipe.id}:EXPECTED_REFUSAL`);
      const refusal = requireRecord(result.refusal, `${recipe.id} refusal`);
      for (const [key, value] of Object.entries(expected)) {
        if (!EXPECTED_FAILURE_META_KEYS.has(key)) {
          expect(key in refusal).toBe(true);
          expect(refusal[key]).toEqual(value);
        }
      }
      expectUnknownToBe(result.evidence.termination, expected["termination"]);
      expect("plan" in result).toBe(false);
    });
  }
});
