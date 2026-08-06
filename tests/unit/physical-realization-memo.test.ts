import { describe, expect, test } from "bun:test";

import {
  compilePhysicalRealization,
  memoizedPhysicalRealization,
} from "../../src/audio";
import { compilePlaybackPlan, type PlaybackPlan } from "../../src/playback";
import { materializeP0TimelineCase } from "../support/p0-playback-fixtures";

const PACK_SHA256 = "a".repeat(64);

function productionPlan(): PlaybackPlan {
  const compiled = compilePlaybackPlan(
    materializeP0TimelineCase("P0-TIME-001").request,
  );
  if (!compiled.ok) {
    throw new Error(`MEMO_TEST_PLAYBACK:${compiled.refusal.code}`);
  }
  return compiled.plan;
}

function request(plan: PlaybackPlan) {
  return {
    plan,
    sourcePlanRevision: 17,
    instrumentFamily: "flute" as const,
    instrumentVersionId: "changes.physical.flute.v2",
    parameterPackSha256: PACK_SHA256,
    sampleRateHz: 48_000 as const,
  };
}

describe("memoized physical realization (single compile per play path)", () => {
  test("identical requests return the identical frozen result object", () => {
    const plan = productionPlan();
    const first = memoizedPhysicalRealization(request(plan));
    const second = memoizedPhysicalRealization(request(plan));
    expect(second).toBe(first);
    if (!first.ok) throw new Error("MEMO_TEST_COMPILE_REFUSED");
    expect(Object.isFrozen(first.value.expressivePlan)).toBe(true);
    expect(Object.isFrozen(first.value.renderPlan)).toBe(true);
  });

  test("any render-affecting request field change compiles separately", () => {
    const plan = productionPlan();
    const base = memoizedPhysicalRealization(request(plan));
    expect(
      memoizedPhysicalRealization({ ...request(plan), sampleRateHz: 96_000 }),
    ).not.toBe(base);
    expect(
      memoizedPhysicalRealization({ ...request(plan), sourcePlanRevision: 18 }),
    ).not.toBe(base);
    expect(
      memoizedPhysicalRealization({
        ...request(plan),
        instrumentFamily: "clarinet",
        instrumentVersionId: "changes.physical.clarinet.v2",
      }),
    ).not.toBe(base);
    expect(
      memoizedPhysicalRealization({
        ...request(plan),
        instrumentVersionId: "changes.physical.flute.v3",
      }),
    ).not.toBe(base);
    expect(
      memoizedPhysicalRealization({
        ...request(plan),
        parameterPackSha256: "b".repeat(64),
      }),
    ).not.toBe(base);
  });

  test("a different plan object never reuses another plan's entry", () => {
    const planA = productionPlan();
    const planB = productionPlan();
    expect(planB).not.toBe(planA);
    const first = memoizedPhysicalRealization(request(planA));
    const second = memoizedPhysicalRealization(request(planB));
    expect(second).not.toBe(first);
  });

  test("memoized and direct compiles agree exactly", () => {
    const plan = productionPlan();
    const memoized = memoizedPhysicalRealization(request(plan));
    const direct = compilePhysicalRealization(request(plan));
    expect(memoized).toEqual(direct);
  });
});
