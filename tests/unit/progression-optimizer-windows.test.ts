import { describe, expect, setDefaultTimeout, test } from "bun:test";

import {
  expectOutcomeMatchesFixture,
  runFixtureCase,
} from "../support/progression-optimizer-test-kit";

setDefaultTimeout(240_000);

describe("V2-TRACE-WINDOWING 512-event windows with fixed boundary voicings", () => {
  test("V2-LIM-003 partitions 513 events into two windows and degrades visibly", async () => {
    const { fixture, run } = await runFixtureCase("V2-LIM-003");
    expectOutcomeMatchesFixture(fixture, run.outcome);
    if (run.outcome.kind !== "optimized") throw new Error("expected optimized");
    expect(run.outcome.segments).toHaveLength(2);
    const [first, second] = run.outcome.segments;
    expect(first?.boundaryCondition).toBe("open");
    expect(first?.realizations[0]?.candidateIds).toHaveLength(512);
    expect(second?.boundaryCondition).toBe("fixed-start");
    expect(second?.realizations[0]?.candidateIds).toEqual(["candidate-000"]);
    expect(second?.firstEventOrdinal).toBe(512);
    expect(run.outcome.degradations.map((row) => row.reason)).toEqual([
      "window-partition",
    ]);
    expect(run.outcome.termination).toBe("exhausted");
  });
});
