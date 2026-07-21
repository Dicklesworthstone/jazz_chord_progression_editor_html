import { expect, setDefaultTimeout, test } from "bun:test";

import { P0_LIMIT_FIXTURE } from "../support/p0-playback-fixtures";
import { observeP0Case } from "../support/p0-conformance";

setDefaultTimeout(600_000);

const STRUCTURAL_CASE_IDS = [
  "P0-LIMIT-STRUCT-001",
  "P0-LIMIT-STRUCT-002",
  "P0-LIMIT-STRUCT-003",
  "P0-LIMIT-STRUCT-004",
  "P0-LIMIT-STRUCT-005",
  "P0-LIMIT-STRUCT-006",
] as const;

const SEAM_CASE_IDS = [
  "P0-LIMIT-SEAM-001",
  "P0-LIMIT-SEAM-002",
  "P0-LIMIT-SEAM-003",
  "P0-LIMIT-SEAM-004",
  "P0-LIMIT-SEAM-005",
  "P0-LIMIT-SEAM-006",
  "P0-LIMIT-SEAM-007",
  "P0-LIMIT-SEAM-008",
  "P0-LIMIT-SEAM-009",
  "P0-LIMIT-SEAM-010",
  "P0-LIMIT-SEAM-011",
  "P0-LIMIT-SEAM-012",
  "P0-LIMIT-SEAM-013",
  "P0-LIMIT-SEAM-014",
  "P0-LIMIT-SEAM-015",
  "P0-LIMIT-SEAM-016",
] as const;

test("the limits owner freezes all 6 structural and 16 counter seams", () => {
  expect(P0_LIMIT_FIXTURE.structuralCases.map(({ id }) => id)).toEqual([
    ...STRUCTURAL_CASE_IDS,
  ]);
  expect(P0_LIMIT_FIXTURE.counterBoundaries.map(({ id }) => id)).toEqual([
    ...SEAM_CASE_IDS,
  ]);
});

for (const caseId of STRUCTURAL_CASE_IDS) {
  test(`${caseId} executes its exact structural maximum or reviewed refusal`, () => {
    const observation = observeP0Case(caseId);
    expect(observation.matchedLiteralFixture).toBe(true);
    expect(observation.actualProjectionSha256).toBe(
      observation.expectedProjectionSha256,
    );
  });
}

for (const caseId of SEAM_CASE_IDS) {
  test(`${caseId} accepts the inclusive maximum and refuses maximum plus one`, () => {
    const observation = observeP0Case(caseId);
    expect(observation.matchedLiteralFixture).toBe(true);
    expect(observation.actualProjectionSha256).toBe(
      observation.expectedProjectionSha256,
    );
  });
}
