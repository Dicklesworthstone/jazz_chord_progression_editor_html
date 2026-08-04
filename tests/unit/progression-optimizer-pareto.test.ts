import { describe, expect, setDefaultTimeout, test } from "bun:test";

import {
  expectOutcomeMatchesFixture,
  runFixtureCase,
} from "../support/progression-optimizer-test-kit";

setDefaultTimeout(240_000);

describe("V2-TRACE-PARETO-DOMINANCE fronts", () => {
  for (const id of [
    "V2-OPT-001",
    "V2-OPT-003",
    "V2-OPT-005",
    "V2-OPT-006",
    "V2-LIM-001",
  ] as const) {
    test(`${id} front content and ordering match the fixture`, async () => {
      const { fixture, run } = await runFixtureCase(id);
      expectOutcomeMatchesFixture(fixture, run.outcome);
    });
  }

  test("V2-OPT-005 equal-cost chains are both retained in the front", async () => {
    const { run } = await runFixtureCase("V2-OPT-005");
    if (run.outcome.kind !== "optimized") throw new Error("expected optimized");
    const realizations = run.outcome.segments[0]?.realizations ?? [];
    expect(realizations).toHaveLength(2);
    const [firstRealization, secondRealization] = realizations;
    if (!firstRealization || !secondRealization) throw new Error("missing front");
    expect(firstRealization.cost).toEqual(secondRealization.cost);
  });
});

describe("V2-TRACE-TIE-BREAK candidate-id-sequence order", () => {
  for (const id of [
    "V2-OPT-002",
    "V2-OPT-005",
    "V2-OPT-007",
    "V2-LIM-002",
  ] as const) {
    test(`${id} selection is the lexicographic minimum`, async () => {
      const { fixture, run } = await runFixtureCase(id);
      expectOutcomeMatchesFixture(fixture, run.outcome);
      if (run.outcome.kind !== "optimized") throw new Error("expected optimized");
      for (const segment of run.outcome.segments) {
        const sequences = segment.realizations.map((realization) =>
          realization.candidateIds.join(","),
        );
        const equalCostPrefix = segment.realizations.every(
          (realization) =>
            JSON.stringify(realization.cost) ===
            JSON.stringify(segment.realizations[0]?.cost),
        );
        if (equalCostPrefix) {
          expect([...sequences].sort()).toEqual(sequences);
        }
      }
    });
  }
});
