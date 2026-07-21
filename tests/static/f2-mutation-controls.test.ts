import { describe, expect, test } from "bun:test";

import {
  auditF2MutationControls,
  verifyF2MutationControls,
  type F2MutationCaseObservation,
  type F2MutationProofChannel,
} from "../../scripts/verify-f2-mutation-controls";
import { materializeF2AdversarialCases } from "../../src/test-support/f2-adversarial-materializer";
import { materializeF2ShapeCases } from "../../src/test-support/f2-shape-materializer";
import adversarialFixture from "../fixtures/decoder/adversarial-cases.json";
import manifestFixture from "../fixtures/decoder/f2-decoder-contract.json";
import shapeFixture from "../fixtures/decoder/shape-cases.json";

type JsonRecord = Record<string, unknown>;

function cloneControls(): JsonRecord[] {
  return structuredClone(
    [...(adversarialFixture as Readonly<{
      mutationControls: readonly JsonRecord[];
    }>).mutationControls],
  );
}

const runtimeCaseIds = new Set([
  ...materializeF2ShapeCases(manifestFixture, shapeFixture),
  ...materializeF2AdversarialCases(adversarialFixture, shapeFixture),
].map(({ caseId }) => caseId));

function findingCodes(value: ReturnType<typeof auditF2MutationControls>): string[] {
  return value.findings.map(({ code }) => code);
}

function channelFor(caseId: string): F2MutationProofChannel {
  if (runtimeCaseIds.has(caseId)) return "runtime-conformance";
  if (caseId === "F2-LIMIT-003") return "depth-boundary-evidence";
  if (caseId === "F2-STATE-001") return "state-side-effect-observations";
  if (caseId === "F2-STATIC-001") return "static-source-policy";
  if (caseId === "F2-WORK-001") return "deterministic-work-counters";
  if (caseId === "F2-IMPORT-001") return "deferred-e0-import";
  throw new Error(`F2_MUTATION_TEST_CHANNEL:${caseId}`);
}

function passingObservations(
  caseIds: Iterable<string>,
): F2MutationCaseObservation[] {
  return [...caseIds].map((caseId) => ({
    caseId,
    channel: channelFor(caseId),
    outcome: "pass",
    evidenceId: `test-evidence:${caseId}`,
    evidenceSha256: "a".repeat(64),
  }));
}

describe("F2 named mutation-control evidence", () => {
  test("reports mapped coverage separately from direct mutant execution", () => {
    const report = auditF2MutationControls({
      controls: cloneControls(),
      runtimeCaseIds,
    });

    expect(report.outcome).toBe("fail");
    expect(report.claim).toBe("mapped-case-coverage-only");
    expect(report.reviewedLedgerSha256).toBe(
      "a564e4a7f7225b0959b770b41fdd622aa2b3c39698b42673aee089e1e2fdbae7",
    );
    expect(report.counts).toEqual({
      controlsDefined: 244,
      f2Owned: 242,
      e0Owned: 2,
      rawCaseLinks: 276,
      mappedControls: 244,
      reviewedControlsDischarged: 0,
      mappedButUnobserved: 242,
      decoderSourceMutantsExecuted: 0,
      decoderSourceMutantsKilled: 0,
      e0Deferred: 2,
    });
    expect(report.ledgerTamperCampaign).toEqual({
      purpose: "verifier-self-test-only",
      operators: [
        "delete-control",
        "change-owner",
        "change-fault",
        "change-killer-case-mapping",
      ],
      mutantsGenerated: 976,
      mutantsKilled: 976,
      semanticDecoderFaultsExecuted: 0,
    });
    expect(findingCodes(report)).toEqual(["F2_MUTATION_CASE_OBSERVATION_GAP"]);
    expect(report.controls.filter(({ status }) => status === "mapped-not-observed"))
      .toHaveLength(242);
    expect(report.controls.filter(({ status }) => status === "deferred-e0"))
      .toHaveLength(2);
  });

  test("rejects deletion, fault drift, owner drift, and unknown mappings", () => {
    const missing = cloneControls();
    missing.pop();
    const missingCodes = findingCodes(auditF2MutationControls({
      controls: missing,
      runtimeCaseIds,
    }));
    expect(missingCodes).toContain("F2_MUTATION_CONTROL_INVENTORY");
    expect(missingCodes).toContain("F2_MUTATION_LEDGER_DRIFT");
    expect(missingCodes).toContain("F2_MUTATION_OWNER_INVENTORY");

    const faultDrift = cloneControls();
    const firstFault = faultDrift[0];
    if (firstFault === undefined) throw new Error("F2_MUTATION_TEST_FIXTURE");
    firstFault["fault"] = "implementation remains correct";
    expect(findingCodes(auditF2MutationControls({
      controls: faultDrift,
      runtimeCaseIds,
    }))).toContain("F2_MUTATION_LEDGER_DRIFT");

    const ownerDrift = cloneControls();
    const firstOwner = ownerDrift[0];
    if (firstOwner === undefined) throw new Error("F2_MUTATION_TEST_FIXTURE");
    firstOwner["owner"] = "E0";
    const ownerCodes = findingCodes(auditF2MutationControls({
      controls: ownerDrift,
      runtimeCaseIds,
    }));
    expect(ownerCodes).toContain("F2_MUTATION_LEDGER_DRIFT");
    expect(ownerCodes).toContain("F2_MUTATION_OWNER_INVENTORY");

    const mappingDrift = cloneControls();
    const firstMapping = mappingDrift[0];
    if (firstMapping === undefined) throw new Error("F2_MUTATION_TEST_FIXTURE");
    firstMapping["caseIds"] = ["F2-NOT-A-CASE-999"];
    const mappingCodes = findingCodes(auditF2MutationControls({
      controls: mappingDrift,
      runtimeCaseIds,
    }));
    expect(mappingCodes).toContain("F2_MUTATION_CASE_UNEXECUTABLE");
    expect(mappingCodes).toContain("F2_MUTATION_LEDGER_DRIFT");
  });

  test("refuses a kill claim without execution evidence", () => {
    const report = auditF2MutationControls({
      controls: cloneControls(),
      runtimeCaseIds,
      killedDecoderSourceMutantIds: new Set(["F2-MUT-001"]),
    });
    expect(findingCodes(report)).toContain("F2_MUTATION_KILL_WITHOUT_EXECUTION");
    expect(report.controls[0]?.decoderSourceMutantKilled).toBe(true);
    expect(report.controls[0]?.decoderSourceMutantExecuted).toBe(false);
  });

  test("discharges reviewed controls from exact observed-case implication without claiming source mutants", () => {
    const observedCaseIds = new Set([
      ...runtimeCaseIds,
      "F2-LIMIT-003",
      "F2-STATE-001",
      "F2-STATIC-001",
      "F2-WORK-001",
    ]);
    const report = auditF2MutationControls({
      controls: cloneControls(),
      runtimeCaseIds,
      caseObservations: passingObservations(observedCaseIds),
    });
    expect(report.outcome).toBe("pass");
    expect(report.claim).toBe("reviewed-exact-case-implication");
    expect(report.counts.reviewedControlsDischarged).toBe(242);
    expect(report.counts.decoderSourceMutantsExecuted).toBe(0);
    expect(report.counts.decoderSourceMutantsKilled).toBe(0);
    expect(report.controls.filter(
      ({ status }) => status === "discharged-by-reviewed-exact-case-implication",
    )).toHaveLength(242);
  });

  test("revokes mapped discharge when one required observed case is absent", () => {
    const observedCaseIds = new Set([
      ...runtimeCaseIds,
      "F2-LIMIT-003",
      "F2-STATE-001",
      "F2-STATIC-001",
      "F2-WORK-001",
    ]);
    observedCaseIds.delete("F2-LIMIT-002");
    const report = auditF2MutationControls({
      controls: cloneControls(),
      runtimeCaseIds,
      caseObservations: passingObservations(observedCaseIds),
    });
    expect(report.outcome).toBe("fail");
    expect(report.claim).toBe("mapped-case-coverage-only");
    expect(findingCodes(report)).toContain("F2_MUTATION_CASE_OBSERVATION_GAP");
    expect(report.controls.find(({ id }) => id === "F2-MUT-001")
      ?.reviewedControlDischarged).toBe(false);
    expect(report.counts.reviewedControlsDischarged).toBeLessThan(242);
  });

  test("rejects an observation that is not bound to evidence by SHA-256", () => {
    const observations = passingObservations(["F2-LIMIT-001"]);
    const observation = observations[0];
    if (observation === undefined) throw new Error("F2_MUTATION_TEST_OBSERVATION");
    const report = auditF2MutationControls({
      controls: cloneControls(),
      runtimeCaseIds,
      caseObservations: [{ ...observation, evidenceSha256: "not-a-digest" }],
    });
    expect(findingCodes(report)).toContain("F2_MUTATION_OBSERVATION_SHAPE");
    expect(report.controls.find(({ id }) => id === "F2-MUT-001")
      ?.reviewedControlDischarged).toBe(false);
  });

  test("records only bounded baseline witnesses and never upgrades them to kills", async () => {
    const report = await verifyF2MutationControls();
    expect(report.audit.counts.decoderSourceMutantsKilled).toBe(0);
    expect(report.evidenceSources.conformanceRunsEveryMaterializedCell).toBe(true);
    expect(report.evidenceSources.conformanceConsumesMutationControls).toBe(false);
    expect(report.evidenceSources.namedControlLiteralsInExecutableEvidence).toBe(0);
    expect(report.evidenceSources.sourcePolicySyntheticNegativeAssertions).toBe(38);
    expect(report.focusedWitness.decoderCalls).toBe(8);
    expect(report.focusedWitness.cells).toHaveLength(2);
    expect(report.focusedWitness.note).toBe("baseline-only-not-a-mutant-kill");
  });
});
