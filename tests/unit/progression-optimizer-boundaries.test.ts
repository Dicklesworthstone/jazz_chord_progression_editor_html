import { describe, expect, setDefaultTimeout, test } from "bun:test";

import {
  expectOutcomeMatchesFixture,
  runFixtureCase,
} from "../support/progression-optimizer-test-kit";

setDefaultTimeout(240_000);

describe("V2-TRACE-FIXED-EVENTS Manual/Frozen seams", () => {
  for (const id of ["V2-BND-001", "V2-BND-002", "V2-BND-010"] as const) {
    test(`${id} fixed candidates survive exactly`, async () => {
      const { fixture, run } = await runFixtureCase(id);
      expectOutcomeMatchesFixture(fixture, run.outcome);
    });
  }

  test("V2-BND-002 preserves the violating frozen candidate and degrades", async () => {
    const { run } = await runFixtureCase("V2-BND-002");
    if (run.outcome.kind !== "optimized") throw new Error("expected optimized");
    expect(run.outcome.termination).toBe("complete");
    expect(run.outcome.degradations).toHaveLength(1);
    expect(run.outcome.degradations[0]?.reason).toBe(
      "fixed-candidate-constraint-conflict",
    );
    expect(run.outcome.segments[0]?.realizations[0]?.candidateIds).toEqual([
      "candidate-000",
      "candidate-000",
    ]);
  });
});

describe("V2-TRACE-SEGMENTATION reset chains", () => {
  for (const id of ["V2-BND-003", "V2-BND-007"] as const) {
    test(`${id} segments optimize independently and fold the aggregate`, async () => {
      const { fixture, run } = await runFixtureCase(id);
      expectOutcomeMatchesFixture(fixture, run.outcome);
    });
  }
});

describe("V2-TRACE-LOOP-CLOSURE last-to-first transitions", () => {
  for (const id of [
    "V2-BND-004",
    "V2-BND-005",
    "V2-BND-006",
    "V2-BND-007",
  ] as const) {
    test(`${id} closure semantics match the fixture`, async () => {
      const { fixture, run } = await runFixtureCase(id);
      expectOutcomeMatchesFixture(fixture, run.outcome);
    });
  }

  test("V2-BND-004 closure changes the selected realization", async () => {
    const { run } = await runFixtureCase("V2-BND-004");
    if (run.outcome.kind !== "optimized") throw new Error("expected optimized");
    expect(run.outcome.segments[0]?.realizations[0]?.candidateIds).toEqual([
      "candidate-001",
      "candidate-001",
    ]);
    expect(run.outcome.segments[0]?.realizations[0]?.loopClosureApplied).toBe(true);
  });
});
