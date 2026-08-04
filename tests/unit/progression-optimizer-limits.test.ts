import { describe, expect, setDefaultTimeout, test } from "bun:test";

import {
  MAX_PROGRESSION_ALTERNATIVES,
  MAX_PROGRESSION_LAYER_GENERATED_STATES,
  PROGRESSION_BEAM_WIDTH,
} from "../../src/theory";
import {
  expectOutcomeMatchesFixture,
  runFixtureCase,
} from "../support/progression-optimizer-test-kit";

setDefaultTimeout(240_000);

describe("V2-TRACE-LIMITS the 24/48/512/8192 edges hold exactly", () => {
  for (const id of ["V2-LIM-001", "V2-LIM-002", "V2-LIM-005"] as const) {
    test(`${id} matches the fixture at the edge`, async () => {
      const { fixture, run } = await runFixtureCase(id);
      expectOutcomeMatchesFixture(fixture, run.outcome);
    });
  }

  test("V2-LIM-002 beam eviction caps the frontier at 48 and the front at 48", async () => {
    const { run } = await runFixtureCase("V2-LIM-002");
    if (run.outcome.kind !== "optimized") throw new Error("expected optimized");
    expect(run.outcome.termination).toBe("exhausted");
    expect(run.outcome.stats.memory.peakFrontierStates).toBe(
      PROGRESSION_BEAM_WIDTH,
    );
    expect(run.outcome.stats.memory.peakLayerGeneratedStates).toBe(
      MAX_PROGRESSION_LAYER_GENERATED_STATES,
    );
    expect(run.outcome.segments[0]?.realizations).toHaveLength(
      MAX_PROGRESSION_ALTERNATIVES,
    );
  });

  test("V2-LIM-005 work-quanta-cap returns no partial option set", async () => {
    const { run } = await runFixtureCase("V2-LIM-005");
    expect(run.outcome.kind).toBe("unfinished");
    expect(run.outcome.termination).toBe("work-quanta-cap");
    expect(run.outcome.stats.memory.peakRealizationRecords).toBe(0);
    expect(run.terminal.quantaConsumed).toBe(1);
  });
});
