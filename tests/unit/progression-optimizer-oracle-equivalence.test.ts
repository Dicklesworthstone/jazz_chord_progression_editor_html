import { describe, setDefaultTimeout, test } from "bun:test";

import {
  expectOutcomeMatchesFixture,
  runFixtureCase,
} from "../support/progression-optimizer-test-kit";

setDefaultTimeout(240_000);

const BRUTE_CERTIFIED = [
  "V2-OPT-001",
  "V2-OPT-002",
  "V2-OPT-003",
  "V2-OPT-004",
  "V2-OPT-005",
  "V2-OPT-006",
  "V2-OPT-007",
  "V2-BND-001",
  "V2-BND-004",
  "V2-BND-010",
  "V2-BND-011",
  "V2-BND-012",
  "V2-LIM-001",
] as const;

describe("V2-TRACE-BRUTE-FORCE production equals the brute-force-certified fixtures", () => {
  for (const id of BRUTE_CERTIFIED) {
    test(`${id} front, selection, and counters match the certified expectation`, async () => {
      const { fixture, run } = await runFixtureCase(id);
      expectOutcomeMatchesFixture(fixture, run.outcome);
    });
  }
});
