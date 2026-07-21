import { expect, setDefaultTimeout, test } from "bun:test";

import {
  P0_MUTATION_CONTROLS,
  P0_MUTATION_MARKER,
  P0_MUTATION_PRODUCER,
  P0_MUTATION_SCHEMA,
  P0_PRODUCTION_MARKER,
  P0_PRODUCTION_PRODUCER,
  P0_PRODUCTION_SCHEMA,
  allP0MutationKillerCaseIds,
  allP0NamedCaseIds,
  materializeP0MutationExecution,
  observeP0Case,
  signP0Observation,
  type P0CaseObservation,
} from "../support/p0-conformance";

setDefaultTimeout(600_000);

const observations = new Map<string, P0CaseObservation>();

function observe(caseId: string): P0CaseObservation {
  const cached = observations.get(caseId);
  if (cached !== undefined) return cached;
  const fresh = observeP0Case(caseId);
  observations.set(caseId, fresh);
  return fresh;
}

const namedCaseIds = allP0NamedCaseIds();

test("the conformance owner freezes the exact 83-case P0 inventory", () => {
  expect(namedCaseIds).toHaveLength(83);
  expect(new Set(namedCaseIds).size).toBe(83);
});

for (const caseId of namedCaseIds) {
  test(`${caseId} is independently observed against literal fixture authority`, () => {
    const row = observe(caseId);
    expect(row.caseId).toBe(caseId);
    expect(row.matchedLiteralFixture).toBe(true);
    expect(row.actualProjectionSha256).toBe(row.expectedProjectionSha256);
  });
}

test(P0_PRODUCTION_PRODUCER.testcase, () => {
  const caseIds = allP0MutationKillerCaseIds();
  const caseObservations = caseIds.map(observe);

  expect(caseIds).toHaveLength(64);
  expect(new Set(caseIds).size).toBe(64);
  for (const row of caseObservations) {
    expect(row.matchedLiteralFixture).toBe(true);
    expect(row.actualProjectionSha256).toBe(row.expectedProjectionSha256);
  }

  const payload = signP0Observation({
    schema: P0_PRODUCTION_SCHEMA,
    suite: "p0-production-literal-baselines",
    producer: P0_PRODUCTION_PRODUCER,
    caseIds,
    caseObservations,
    casesObserved: caseObservations.length,
    fixtureMismatches: 0,
    status: "pass",
  });
  console.log(`${P0_PRODUCTION_MARKER}${JSON.stringify(payload)}`);
});

test(P0_MUTATION_PRODUCER.testcase, () => {
  const counterfactualExecutions = P0_MUTATION_CONTROLS.flatMap((control) =>
    control.killerCaseIds.map((caseId) =>
      materializeP0MutationExecution(control, observe(caseId))
    )
  );
  const killedControlIds = new Set(
    counterfactualExecutions.map(({ controlId }) => controlId),
  );

  expect(P0_MUTATION_CONTROLS).toHaveLength(42);
  expect(counterfactualExecutions).toHaveLength(96);
  expect(killedControlIds.size).toBe(42);
  expect(
    counterfactualExecutions.every(
      (row) =>
        row.expectedProjectionSha256 === row.baselineProjectionSha256 &&
        row.mutantProjectionSha256 !== row.baselineProjectionSha256 &&
        row.mutantResultSha256 !== row.baselineResultSha256 &&
        row.changedFields.length > 0,
    ),
  ).toBe(true);

  const payload = signP0Observation({
    schema: P0_MUTATION_SCHEMA,
    suite: "p0-semantic-counterfactuals",
    producer: P0_MUTATION_PRODUCER,
    classification:
      "reviewed contract projection mutation with real production baselines and checked-in literal fixture oracles",
    controlIds: P0_MUTATION_CONTROLS.map(({ id }) => id),
    controlsDefined: P0_MUTATION_CONTROLS.length,
    controlsExecuted: P0_MUTATION_CONTROLS.length,
    controlsKilled: killedControlIds.size,
    controlsSurvived: P0_MUTATION_CONTROLS.length - killedControlIds.size,
    reviewedKillerLinks: counterfactualExecutions.length,
    killerLinksExecuted: counterfactualExecutions.length,
    killerLinksKilled: counterfactualExecutions.length,
    killerLinksSurvived: 0,
    sourceMutantsExecuted: 0,
    counterfactualExecutions,
    status: "pass",
  });
  console.log(`${P0_MUTATION_MARKER}${JSON.stringify(payload)}`);
});
