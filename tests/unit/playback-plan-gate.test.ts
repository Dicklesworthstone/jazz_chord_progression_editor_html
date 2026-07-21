import { describe, expect, test } from "bun:test";

import {
  PLAYBACK_PLAN_FIXED_VELOCITY,
  PLAYBACK_PLAN_MINIMUM_GATE_TICKS,
  PLAYBACK_PLAN_RELEASE_GAP_TICKS,
  compilePlaybackPlan,
  type PlaybackEvent,
} from "../../src/playback";
import {
  materializeP0LoopCase,
  materializeP0RealizationCase,
  materializeP0TimelineCase,
  p0LoopCase,
  p0TimelineCase,
} from "../support/p0-playback-fixtures";

type JsonRecord = Record<string, unknown>;

const TIMELINE_GATE_CASE_IDS = [
  "P0-TIME-001",
  "P0-TIME-002",
  "P0-TIME-003",
  "P0-TIME-004",
  "P0-TIME-005",
  "P0-TIME-006",
  "P0-TIME-007",
] as const;

const LOOP_GATE_CASE_IDS = [
  "P0-LOOP-001",
  "P0-LOOP-004",
  "P0-LOOP-005",
  "P0-LOOP-006",
  "P0-LOOP-009",
] as const;

function requireRecord(value: unknown, label: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`P0_GATE_RECORD:${label}`);
  }
  return value as JsonRecord;
}

function requireNumber(value: unknown, label: string): number {
  if (typeof value !== "number") {
    throw new TypeError(`P0_GATE_NUMBER:${label}`);
  }
  return value;
}

function expectUnknownEqual(actual: unknown, expected: unknown): void {
  expect(actual).toEqual(expected);
}

function expectUnknownToBe(actual: unknown, expected: unknown): void {
  expect(actual).toBe(expected);
}

function expectedTimelineEvents(caseId: string): readonly JsonRecord[] {
  const expectedPlan = p0TimelineCase(caseId).expectedPlan;
  if (expectedPlan === undefined) {
    throw new Error(`${caseId}:P0_GATE_EXPECTED_PLAN_MISSING`);
  }
  if (Array.isArray(expectedPlan["events"])) {
    return expectedPlan["events"].map((value, index) =>
      requireRecord(value, `${caseId}:event-${String(index)}`),
    );
  }
  return [requireRecord(expectedPlan["singleEvent"], `${caseId}:singleEvent`)];
}

function expectedLoopEvents(caseId: string): readonly JsonRecord[] {
  const emissions = p0LoopCase(caseId).expected["emissions"];
  if (!Array.isArray(emissions)) {
    throw new Error(`${caseId}:P0_GATE_EMISSIONS_MISSING`);
  }
  return emissions.map((value, index) =>
    requireRecord(value, `${caseId}:emission-${String(index)}`),
  );
}

function expectReviewedGate(
  event: PlaybackEvent,
  expected: JsonRecord,
  label: string,
): void {
  const expectedDurationTicks = requireNumber(
    expected["durationTicks"],
    `${label}:durationTicks`,
  );
  const expectedGateTicks = requireNumber(
    expected["gateDurationTicks"] ?? expected["gateTicks"],
    `${label}:gateTicks`,
  );
  expectUnknownToBe(event.durationTicks, expectedDurationTicks);
  expectUnknownToBe(event.gateDurationTicks, expectedGateTicks);
  expectUnknownEqual(event.gateDurationBeats, expected["gateDurationBeats"]);
  expect(expectedGateTicks).toBe(
    Math.max(
      PLAYBACK_PLAN_MINIMUM_GATE_TICKS,
      expectedDurationTicks - PLAYBACK_PLAN_RELEASE_GAP_TICKS,
    ),
  );
  expect(event.gateDurationTicks).toBeGreaterThan(0);
  expect(event.gateDurationTicks).toBeLessThanOrEqual(event.durationTicks);
  expect(event.velocity).toBe(PLAYBACK_PLAN_FIXED_VELOCITY);
}

describe("P0/verify exact post-clipping gate law", () => {
  test("the public version-1 gate policy is the reviewed 24-tick gap with a one-tick floor", () => {
    expect(PLAYBACK_PLAN_RELEASE_GAP_TICKS).toBe(24);
    expect(PLAYBACK_PLAN_MINIMUM_GATE_TICKS).toBe(1);
    expect(PLAYBACK_PLAN_FIXED_VELOCITY).toBe(96);
  });

  for (const caseId of TIMELINE_GATE_CASE_IDS) {
    test(`${caseId} uses every literal reviewed source-event gate`, () => {
      const result = compilePlaybackPlan(
        materializeP0TimelineCase(caseId).request,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(`${caseId}:${result.refusal.code}`);
      const expectedEvents = expectedTimelineEvents(caseId);
      expect(result.plan.events).toHaveLength(expectedEvents.length);
      expectedEvents.forEach((expected, index) => {
        const event = result.plan.events[index];
        if (event === undefined) {
          throw new Error(`${caseId}:P0_GATE_EVENT_${String(index)}_MISSING`);
        }
        expectReviewedGate(event, expected, `${caseId}:${String(index)}`);
      });
    });
  }

  for (const caseId of LOOP_GATE_CASE_IDS) {
    test(`${caseId} recomputes every literal reviewed gate after loop clipping`, () => {
      const result = compilePlaybackPlan(materializeP0LoopCase(caseId).request);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(`${caseId}:${result.refusal.code}`);
      const expectedEvents = expectedLoopEvents(caseId);
      expect(result.plan.events).toHaveLength(expectedEvents.length);
      expectedEvents.forEach((expected, index) => {
        const event = result.plan.events[index];
        if (event === undefined) {
          throw new Error(`${caseId}:P0_GATE_EVENT_${String(index)}_MISSING`);
        }
        expectReviewedGate(event, expected, `${caseId}:${String(index)}`);
      });
    });
  }

  test("the clipped-both-boundaries near miss is 456 ticks, not a 480-tick trimmed precomputed gate", () => {
    const result = compilePlaybackPlan(
      materializeP0LoopCase("P0-LOOP-005").request,
    );
    if (!result.ok) throw new Error(`P0-LOOP-005:${result.refusal.code}`);
    const event = result.plan.events[0];
    if (event === undefined) throw new Error("P0_LOOP_005_GATE_EVENT_MISSING");
    expectUnknownToBe(event.durationTicks, 480);
    expectUnknownToBe(event.gateDurationTicks, 456);
    expect(event.gateDurationTicks).not.toBe(event.durationTicks);
  });

  test("the one-tick clipping near miss keeps a full one-tick gate", () => {
    const result = compilePlaybackPlan(
      materializeP0LoopCase("P0-LOOP-009").request,
    );
    if (!result.ok) throw new Error(`P0-LOOP-009:${result.refusal.code}`);
    const event = result.plan.events[0];
    if (event === undefined) throw new Error("P0_LOOP_009_GATE_EVENT_MISSING");
    expectUnknownToBe(event.durationTicks, 1);
    expectUnknownToBe(event.gateDurationTicks, 1);
    expectUnknownEqual(event.gateDurationBeats, {
      numerator: 1,
      denominator: 960,
    });
  });

  test("P0-REAL-021 refuses a counterfeit nonintegral duration without rounding or a partial plan", () => {
    const recipe = materializeP0RealizationCase("P0-REAL-021");
    const result = compilePlaybackPlan(recipe.request);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("P0_REAL_021_NONINTEGRAL_ACCEPTED");
    expectUnknownEqual(result.refusal, {
      code: "playback.gate_not_midi_integral",
      path: [
        "document",
        "sections",
        0,
        "measures",
        0,
        "events",
        0,
        "duration",
      ],
      eventId: "event-p0-realization",
      durationBeats: { numerator: 1, denominator: 7 },
      ppq: 960,
    });
    expect(result.evidence.termination).toBe("gate-invalid");
    expect("plan" in result).toBe(false);
  });
});
