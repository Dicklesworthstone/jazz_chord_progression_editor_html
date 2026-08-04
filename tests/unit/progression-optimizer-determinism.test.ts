import { describe, expect, setDefaultTimeout, test } from "bun:test";

import {
  expectOutcomeMatchesFixture,
  runFixtureCase,
} from "../support/progression-optimizer-test-kit";

setDefaultTimeout(120_000);

const CASES = ["V2-OPT-001", "V2-OPT-002", "V2-OPT-007"] as const;

describe("V2-TRACE-DETERMINISM byte-identical outcomes", () => {
  for (const id of CASES) {
    test(`${id} matches its fixture and repeats byte-identically`, async () => {
      const first = await runFixtureCase(id);
      expectOutcomeMatchesFixture(first.fixture, first.run.outcome);
      const second = await runFixtureCase(id);
      expect(second.run.outcome).toEqual(first.run.outcome);
      expect(second.run.terminal.quantaConsumed).toBe(
        first.run.terminal.quantaConsumed,
      );
    });
  }

  test("explanation literals never relax", async () => {
    const { run } = await runFixtureCase("V2-OPT-001");
    expect(run.outcome.explanation).toEqual({
      wallTimeAffectedSelection: false,
      documentMutated: false,
      hardConstraintsRelaxed: false,
      manualFrozenPitchesRewritten: false,
      deterministicForIdenticalInputs: true,
    });
  });
});
