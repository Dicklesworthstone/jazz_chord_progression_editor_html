import { describe, expect, test } from "bun:test";

import { compilePlaybackPlan } from "../../src/playback/compile-playback-plan";
import type { PlaybackPlan } from "../../src/playback";
import {
  P0_TIMELINE_CASES,
  materializeP0TimelineCase,
  materializeP0TimelinePair,
  p0TimelineCase,
} from "../support/p0-playback-fixtures";

type JsonRecord = Record<string, unknown>;

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

function expectObjectSubset(
  actualValue: unknown,
  expected: Readonly<Record<string, unknown>>,
): void {
  const actual = requireRecord(actualValue, "actual subset");
  for (const [key, value] of Object.entries(expected)) {
    expect(actual[key]).toEqual(value);
  }
}

function expectUnknownEqual(actual: unknown, expected: unknown): void {
  expect(actual).toEqual(expected);
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

  if (fullEvents !== undefined) {
    expectUnknownEqual(plan.events, fullEvents);
  }
  if (singleEventValue === undefined) return;

  const singleEvent = requireRecord(singleEventValue, "singleEvent");
  expect(plan.events).toHaveLength(1);
  const event = plan.events[0];
  if (event === undefined) throw new Error("P0_TIMELINE_EVENT_MISSING");
  for (const [key, value] of Object.entries(singleEvent)) {
    const actualKey = key === "gateTicks" ? "gateDurationTicks" : key;
    expectUnknownEqual(requireRecord(event, "single event")[actualKey], value);
  }
}

describe("P0 exact playback-plan source timeline", () => {
  for (const recipe of P0_TIMELINE_CASES) {
    if (recipe.pairedDocumentRecipes !== undefined) continue;

    test(`${recipe.id} compiles the reviewed literal projection`, () => {
      const fixture = materializeP0TimelineCase(recipe.id);
      const result = compilePlaybackPlan(fixture.request);
      expect(result.ok).toBe(true);
      if (!result.ok) {
        throw new Error(`${recipe.id}:${result.refusal.code}`);
      }
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

    const relation = requireRecord(
      p0TimelineCase("P0-TIME-010").expectedRelation,
      "P0-TIME-010 relation",
    );
    for (const field of requireStringArray(
      relation["equalFields"],
      "equalFields",
    )) {
      expectUnknownEqual(
        requireRecord(low.plan, "low plan")[field],
        requireRecord(high.plan, "high plan")[field],
      );
    }
    for (const field of requireStringArray(
      relation["differentFields"],
      "differentFields",
    )) {
      expect(
        requireRecord(low.plan, "low plan")[field],
      ).not.toEqual(
        requireRecord(high.plan, "high plan")[field],
      );
    }
    for (const forbidden of requireStringArray(
      relation["forbiddenPlanFields"],
      "forbiddenPlanFields",
    )) {
      const lowEvent = low.plan.events[0];
      if (lowEvent === undefined) {
        throw new Error("P0_TIME_010_EVENT_MISSING");
      }
      expect(forbidden in low.plan).toBe(false);
      expect(forbidden in lowEvent).toBe(false);
    }
  });

  test("Map insertion order cannot alter plan bytes or evidence", () => {
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
    expect(JSON.stringify(sourceResult.plan)).toBe(
      JSON.stringify(reverseResult.plan),
    );
    expect(sourceResult.evidence).toEqual(reverseResult.evidence);
  });
});
