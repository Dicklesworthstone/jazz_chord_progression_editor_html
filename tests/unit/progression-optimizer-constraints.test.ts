import { describe, expect, setDefaultTimeout, test } from "bun:test";

import {
  eventIdOf,
  expectOutcomeMatchesFixture,
  runFixtureCase,
} from "../support/progression-optimizer-test-kit";

setDefaultTimeout(240_000);

describe("V2-TRACE-CONSTRAINTS filters, locks, and typed conflicts", () => {
  for (const id of [
    "V2-BND-002",
    "V2-BND-006",
    "V2-BND-008",
    "V2-BND-009",
    "V2-BND-011",
    "V2-BND-012",
  ] as const) {
    test(`${id} constraint behavior matches the fixture`, async () => {
      const { fixture, run } = await runFixtureCase(id);
      expectOutcomeMatchesFixture(fixture, run.outcome);
    });
  }

  test("V2-BND-008 lock conflict names the lock voice", async () => {
    const { run } = await runFixtureCase("V2-BND-008");
    if (run.outcome.kind !== "no-realization") {
      throw new Error("expected no-realization");
    }
    expect(run.outcome.conflicts[0]?.constraintRefs).toEqual([
      { eventId: eventIdOf("event-0001"), kind: "lock", voiceId: "voice-0000" },
    ]);
    expect(run.outcome.conflicts[0]?.explicitRelaxations).toEqual([]);
  });

  test("V2-BND-009 conflict names each first-failing filter kind in order", async () => {
    const { run } = await runFixtureCase("V2-BND-009");
    if (run.outcome.kind !== "no-realization") {
      throw new Error("expected no-realization");
    }
    expect(
      run.outcome.conflicts[0]?.constraintRefs.map((ref) => ref.kind),
    ).toEqual(["families", "range"]);
  });
});
