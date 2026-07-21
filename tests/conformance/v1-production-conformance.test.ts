import { expect, test } from "bun:test";

import { V1_ASSIGNMENT_CASES } from "../support/v1-assignment-fixtures";
import {
  allV1ProductionObservations,
  stableV1EvidenceJson,
} from "../support/v1-conformance";
import { buildV1PublicBoundaryObservations } from
  "../support/v1-public-boundaries";

const PRODUCER = Object.freeze({
  file: "tests/conformance/v1-production-conformance.test.ts",
  testcase:
    "executes every reviewed V1 assignment case with exact replay and immutable detached results",
} as const);

test(
  PRODUCER.testcase,
  () => {
    const observations = allV1ProductionObservations();
    const publicBoundaryObservations = buildV1PublicBoundaryObservations();
    const caseIds = V1_ASSIGNMENT_CASES.map(({ id }) => id);

    expect(caseIds).toHaveLength(18);
    expect(observations.map(({ caseId }) => caseId)).toEqual(caseIds);
    expect(
      new Set(observations.map(({ caseId }) => caseId)).size,
    ).toBe(caseIds.length);
    for (const row of observations) {
      expect(row.deterministicReplay).toBe(true);
      expect(row.inputUnchanged).toBe(true);
      expect(row.recursivelyFrozen).toBe(true);
      expect(row.detachedFromInputs).toBe(true);
      expect(row.resultSha256).toBe(row.replayResultSha256);
      expect(row.expectedProjectionSha256).toBe(row.actualProjectionSha256);
      expect(row.outcome).toBe("pass");
    }
    expect(publicBoundaryObservations).toHaveLength(9);
    for (const row of publicBoundaryObservations) {
      expect(row.exactAccepted).toBe(true);
      expect(row.nearMissAccepted).toBe(false);
      expect(row.outcome).toBe("pass");
    }

    const payload = Object.freeze({
      schema: "changes.evidence.v1-production-conformance-observation.v1",
      suite: "v1-production-conformance",
      producer: PRODUCER,
      caseIds,
      caseObservations: observations,
      caseObservationDigests: Object.fromEntries(
        observations.map(({ caseId, observationDigest }) => [
          caseId,
          observationDigest,
        ]),
      ),
      publicBoundaryObservations,
      publicBoundaryObservationDigests: Object.fromEntries(
        publicBoundaryObservations.map(({ caseId, observationDigest }) => [
          caseId,
          observationDigest,
        ]),
      ),
      deterministicReplays: observations.length,
      inputMutations: 0,
      mutableResultRecords: 0,
      callerOwnedAliases: 0,
      wallTimeSemanticCutoff: false,
      status: "pass",
    } as const);
    console.log(`V1_PRODUCTION_OBSERVATION ${stableV1EvidenceJson(payload)}`);
  },
);
