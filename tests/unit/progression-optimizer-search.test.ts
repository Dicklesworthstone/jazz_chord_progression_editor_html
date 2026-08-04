import { describe, expect, setDefaultTimeout, test } from "bun:test";

import {
  expectOutcomeMatchesFixture,
  runFixtureCase,
} from "../support/progression-optimizer-test-kit";

setDefaultTimeout(120_000);

describe("V2-TRACE-CROSS-BUCKET no greedy pruning across buckets", () => {
  test("V2-OPT-004 the locally worse prefix carries the optimum", async () => {
    const { fixture, run } = await runFixtureCase("V2-OPT-004");
    expectOutcomeMatchesFixture(fixture, run.outcome);
    if (run.outcome.kind !== "optimized") throw new Error("expected optimized");
    const selected = run.outcome.segments[0]?.realizations[0];
    expect(selected?.candidateIds).toEqual([
      "candidate-000",
      "candidate-001",
      "candidate-000",
    ]);
    expect(run.outcome.stats.counters.dominancePrunes).toBe(2);
  });
});
