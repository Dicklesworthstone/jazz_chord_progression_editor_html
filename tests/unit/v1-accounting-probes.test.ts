import { describe, expect, test } from "bun:test";

import limitFixtureValue from "../fixtures/voice-assignment/limit-cases.json";

import * as theory from "../../src/theory";
import {
  VOICE_ASSIGNMENT_MEMORY_LIMITS,
  VOICE_ASSIGNMENT_WORK_LIMITS,
} from "../../src/theory/voice-assignment-contract";
import {
  buildV1AccountingProbeReport,
  executeV1AccountingProbe,
  type V1AccountingProbeFixtureRow,
} from "../../src/test-support/v1-accounting-probes";
import {
  buildV1TransitionRequest,
  v1AssignmentCase,
} from "../support/v1-assignment-fixtures";

const LIMIT_FIXTURE = limitFixtureValue as unknown as Readonly<{
  derivedAccountingProbes: readonly V1AccountingProbeFixtureRow[];
}>;

function expectRecursivelyFrozen(value: unknown): void {
  if (typeof value !== "object" || value === null) return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) expectRecursivelyFrozen(child);
}

describe("V1 accounting exact-plus-one probes", () => {
  test("executes all 29 reviewed exact-plus-one accounting probes", () => {
    const rows = LIMIT_FIXTURE.derivedAccountingProbes;
    const report = buildV1AccountingProbeReport(rows);

    expect(rows).toHaveLength(29);
    expect(report).toMatchObject({
      schema: "changes.test-support.v1-accounting-probes.v1",
      package: "V1",
      outcome: "pass",
      counts: {
        requested: 29,
        executed: 29,
        passed: 29,
        failed: 0,
        workCounters: 14,
        memoryCounters: 15,
      },
      findings: [],
    });
    expect(JSON.stringify(
      report.cases.map(({ id, counter, maximum, received }) => ({
        id,
        counter,
        maximum,
        received,
      })),
    )).toBe(JSON.stringify(rows));

    for (const probe of report.cases) {
      expect(probe.exactLimit).toEqual({
        accepted: true,
        recorded: probe.maximum,
      });
      expect(probe.exactPlusOne.accepted).toBe(false);
      expect(probe.exactPlusOne.recorded).toBe(probe.maximum);
      expect(probe.exactPlusOne.refusal).toEqual({
        code: "limit.voice_assignment_work_exceeded",
        path: [],
        counter: probe.counter,
        received: probe.received,
        maximum: probe.maximum,
        partialResult: false,
      });
      expect(probe.exactPlusOne.evidence).toMatchObject({
        [probe.counter]: probe.maximum,
        termination: "work-limit-exceeded",
      });
      expect(probe.firstProspectiveExcessWins).toBe(true);
      expect(Object.hasOwn(probe.exactPlusOne, "value")).toBe(false);
      expect(Object.hasOwn(probe.exactPlusOne, "frame")).toBe(false);
      expect(Object.hasOwn(probe.exactPlusOne, "arcs")).toBe(false);
    }
    expectRecursivelyFrozen(report);
    console.log(`V1_ACCOUNTING_OBSERVATION ${JSON.stringify(report)}`);
  });

  test("replays byte-identical machine-readable diagnostics and keeps the seam private", () => {
    const rows = LIMIT_FIXTURE.derivedAccountingProbes;
    const inputBefore = JSON.stringify(rows);
    const first = buildV1AccountingProbeReport(rows);
    const replay = buildV1AccountingProbeReport(rows);

    expect(JSON.stringify(first)).toBe(JSON.stringify(replay));
    expect(JSON.stringify(rows)).toBe(inputBefore);
    expect(Object.hasOwn(theory, "observeVoiceAssignmentAccountingBoundary"))
      .toBe(false);

    const firstRow = rows[0];
    if (firstRow === undefined) throw new Error("V1 accounting fixture is empty");
    const firstSingle = executeV1AccountingProbe(firstRow);
    const replaySingle = executeV1AccountingProbe(firstRow);
    expect(firstSingle).toEqual(replaySingle);
    expect(firstSingle).not.toBe(replaySingle);

    const invalid = buildV1AccountingProbeReport([
      Object.freeze({
        ...firstRow,
        maximum: firstRow.maximum - 1,
        received: firstRow.received - 1,
      }),
    ]);
    expect(invalid.outcome).toBe("fail");
    expect(invalid.counts).toMatchObject({ passed: 0, failed: 1 });
    expect(invalid.findings.map(({ code }) => code)).toEqual([
      "V1_ACCOUNTING_PROBE_MAXIMUM_MISMATCH",
      "V1_ACCOUNTING_PROBE_OBSERVATION_MISMATCH",
    ]);

    for (const probe of first.cases) {
      const declaredMaximum = probe.counterKind === "work"
        ? VOICE_ASSIGNMENT_WORK_LIMITS[probe.counter as keyof typeof VOICE_ASSIGNMENT_WORK_LIMITS]
        : VOICE_ASSIGNMENT_MEMORY_LIMITS[probe.counter as keyof typeof VOICE_ASSIGNMENT_MEMORY_LIMITS];
      expect(probe.maximum).toBe(declaredMaximum);
    }

    const maximumRecipe = v1AssignmentCase("V1-ASN-018");
    if (maximumRecipe.kind !== "transition") {
      throw new Error("V1-ASN-018 must remain a transition");
    }
    const maximumRequest = buildV1TransitionRequest(maximumRecipe);
    const maximumResult = theory.assignVoiceTransition(maximumRequest);
    if (!maximumResult.ok) throw new Error(maximumResult.refusal.code);
    expect(maximumResult.evidence.identityComparisons).toBe(49);
    expect(maximumResult.evidence.peakArcIdentityRecords).toBe(
      maximumResult.value.arcs.length,
    );
    expect(maximumResult.evidence.peakTrackedRecords).toBeLessThanOrEqual(399);

    const roleRecipe = v1AssignmentCase("V1-ASN-011");
    if (roleRecipe.kind !== "transition") {
      throw new Error("V1-ASN-011 must remain a transition");
    }
    const roleRequest = buildV1TransitionRequest(roleRecipe);
    const roleResult = theory.assignVoiceTransition(roleRequest);
    if (!roleResult.ok) throw new Error(roleResult.refusal.code);
    const expectedRoleComparisons =
      roleRequest.from.voices.length *
        (roleRequest.from.roles.guideDegrees.length +
          roleRequest.from.roles.colorDegrees.length) +
      roleRequest.to.voices.length *
        (roleRequest.to.roles.guideDegrees.length +
          roleRequest.to.roles.colorDegrees.length);
    expect(roleResult.evidence.roleMembershipComparisons).toBe(
      expectedRoleComparisons,
    );
    if (roleRecipe.expected.termination !== "complete-assigned") {
      throw new Error("V1-ASN-011 must remain a successful assignment");
    }
    expect(roleResult.value.cost).toEqual(roleRecipe.expected.cost);

    const lockedRecipe = v1AssignmentCase("V1-ASN-013");
    if (lockedRecipe.kind !== "transition") {
      throw new Error("V1-ASN-013 must remain a transition");
    }
    const lockedRequest = buildV1TransitionRequest(lockedRecipe);
    const lockedResult = theory.assignVoiceTransition(lockedRequest);
    if (!lockedResult.ok) throw new Error(lockedResult.refusal.code);
    expect(lockedResult.evidence.peakLockEvidenceRecords).toBe(
      lockedRequest.locks.length,
    );
    expect(lockedResult.value.locks.map(({ status }) => status)).toEqual([
      "satisfied",
    ]);
    expect(
      lockedResult.value.arcs.every(
        ({ identity }) => Object.keys(identity).join(",") ===
          "voiceId,voiceSerial",
      ),
    ).toBe(true);
  });
});
