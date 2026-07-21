import { describe, expect, test } from "bun:test";

import { compilePlaybackPlan } from "../../src/playback/compile-playback-plan";
import type { PlaybackEvent, PlaybackPlan } from "../../src/playback";
import {
  P0_LOOP_CASES,
  P0_LOOP_FIXTURE,
  materializeP0LoopCase,
} from "../support/p0-playback-fixtures";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown, label: string): JsonRecord {
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
  const actual = asRecord(actualValue, "actual subset");
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
  const source = asRecord(sourceValue, "sourceTimeline");
  expectSubset(event, source, new Set(["sourceRef"]));
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
  if (Array.isArray(emissions)) {
    expect(plan.events).toHaveLength(emissions.length);
    emissions.forEach((expectedEvent, index) => {
      const event = plan.events[index];
      if (event === undefined) {
        throw new Error(`P0_LOOP_EVENT_MISSING:${String(index)}`);
      }
      expectSubset(event, asRecord(expectedEvent, `emission-${String(index)}`));
      expectSourceProjection(event);
    });
  }
}

describe("P0 exact half-open loop projection", () => {
  let nullLoopEvents: readonly PlaybackEvent[] | null = null;

  for (const recipe of P0_LOOP_CASES) {
    test(`${recipe.id} matches the reviewed loop result`, () => {
      const fixture = materializeP0LoopCase(recipe.id);
      const result = compilePlaybackPlan(fixture.request);
      const expected = recipe.expected;
      const expectedOk = expected["ok"];
      expectUnknownToBe(result.ok, expectedOk);

      if (expectedOk === true) {
        if (!result.ok) throw new Error(`${recipe.id}:${result.refusal.code}`);
        expectSuccess(result.plan, expected, fixture.request.loop);
        if (recipe.id === "P0-LOOP-001") {
          nullLoopEvents = result.plan.events;
        }
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
      expectUnknownToBe(result.refusal.code, expected["code"]);
      expectUnknownEqual(result.refusal.path, expected["path"]);
      const refusal = asRecord(result.refusal, `${recipe.id} refusal`);
      for (const key of ["reason", "totalBeats"] as const) {
        if (key in expected) {
          expect(refusal[key]).toEqual(expected[key]);
        }
      }
      expectUnknownToBe(
        result.evidence.termination,
        expected["termination"],
      );
      expect("plan" in result).toBe(false);
    });
  }
});
