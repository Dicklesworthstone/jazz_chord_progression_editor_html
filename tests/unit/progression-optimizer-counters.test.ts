import { describe, expect, setDefaultTimeout, test } from "bun:test";

import {
  PROGRESSION_MEMORY_LIMITS,
  PROGRESSION_WORK_LIMITS,
  PROGRESSION_MEMORY_COUNTER_NAMES,
  PROGRESSION_WORK_COUNTER_NAMES,
} from "../../src/theory";
import {
  expectOutcomeMatchesFixture,
  runFixtureCase,
} from "../support/progression-optimizer-test-kit";

setDefaultTimeout(240_000);

const COUNTER_CASES = [
  "V2-OPT-001",
  "V2-OPT-004",
  "V2-OPT-005",
  "V2-OPT-006",
  "V2-BND-003",
  "V2-BND-004",
  "V2-BND-012",
  "V2-LIM-002",
  "V2-LIM-003",
  "V2-LIM-005",
] as const;

describe("V2-TRACE-COUNTERS exact operational accounting", () => {
  for (const id of COUNTER_CASES) {
    test(`${id} counters and memory match and respect the frozen limits`, async () => {
      const { fixture, run } = await runFixtureCase(id);
      expectOutcomeMatchesFixture(fixture, run.outcome);
      const { counters, memory } = run.outcome.stats;
      for (const name of PROGRESSION_WORK_COUNTER_NAMES) {
        expect(counters[name]).toBeLessThanOrEqual(PROGRESSION_WORK_LIMITS[name]);
      }
      for (const name of PROGRESSION_MEMORY_COUNTER_NAMES) {
        expect(memory[name]).toBeLessThanOrEqual(PROGRESSION_MEMORY_LIMITS[name]);
      }
      expect(counters.workUnits).toBe(
        counters.seededStates +
          counters.statePairExpansions +
          counters.loopClosureUnits,
      );
    });
  }
});
