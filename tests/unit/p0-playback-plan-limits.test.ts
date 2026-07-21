import { describe, expect, test } from "bun:test";

import {
  PLAYBACK_PLAN_MEMORY_LIMITS,
  PLAYBACK_PLAN_WORK_COUNTER_NAMES,
  PLAYBACK_PLAN_WORK_LIMITS,
  type PlaybackPlanWorkCounterName,
} from "../../src/playback";
import {
  probePlaybackPlanCounterForTest,
} from "../../src/playback/compile-playback-plan";

function maximumFor(counter: PlaybackPlanWorkCounterName): number {
  if (counter in PLAYBACK_PLAN_WORK_LIMITS) {
    return PLAYBACK_PLAN_WORK_LIMITS[
      counter as keyof typeof PLAYBACK_PLAN_WORK_LIMITS
    ];
  }
  return PLAYBACK_PLAN_MEMORY_LIMITS[
    counter as keyof typeof PLAYBACK_PLAN_MEMORY_LIMITS
  ];
}

describe("P0 bounded work and memory seams", () => {
  for (const counter of PLAYBACK_PLAN_WORK_COUNTER_NAMES) {
    test(`${counter} accepts its exact maximum and refuses maximum plus one`, () => {
      const maximum = maximumFor(counter);
      const exact = probePlaybackPlanCounterForTest(counter, maximum);
      expect(exact.ok).toBe(true);
      if (!exact.ok) {
        throw new Error(`${counter}:EXACT:${exact.refusal.code}`);
      }
      expect(exact).toMatchObject({
        ok: true,
        counter,
        received: maximum,
        maximum,
      });
      expect(exact.evidence[counter]).toBe(maximum);
      expect(exact.evidence.termination).toBe("complete");

      const plusOne = probePlaybackPlanCounterForTest(counter, maximum + 1);
      expect(plusOne.ok).toBe(false);
      if (plusOne.ok) throw new Error(`${counter}:PLUS_ONE_ACCEPTED`);
      expect(plusOne.refusal).toEqual({
        code: "limit.playback_plan_work_exceeded",
        path: ["work", counter],
        counter,
        received: maximum + 1,
        maximum,
        partialResult: false,
      });
      expect(plusOne.evidence.termination).toBe("work-limit-exceeded");
      expect("plan" in plusOne).toBe(false);
    });
  }
});
