import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  V2_FIXTURE_FILES,
  applyMutation,
  validateV2Contract,
} from "../../scripts/validate-v2-contract";
import {
  MAX_PROGRESSION_CANDIDATES_PER_EVENT,
  MAX_PROGRESSION_REALIZATION_RECORDS,
  MAX_PROGRESSION_REQUEST_EVENTS,
  MAX_PROGRESSION_RETAINED_STATES,
  MAX_PROGRESSION_TOTAL_WORK_UNITS,
  MAX_PROGRESSION_TRACKED_STATES,
  MAX_PROGRESSION_WINDOW_EVENTS,
  MAX_PROGRESSION_WINDOWS_PER_SEGMENT,
  MAX_PROGRESSION_WORK_QUANTA,
  PROGRESSION_BEAM_WIDTH,
  PROGRESSION_CANCEL_REASONS,
  PROGRESSION_COST_AGGREGATIONS,
  PROGRESSION_COST_AXES,
  PROGRESSION_COST_POLICY_ID,
  PROGRESSION_COST_POLICY_VERSION,
  PROGRESSION_COST_VALUE_LIMITS,
  PROGRESSION_DEGRADATION_CODE,
  PROGRESSION_DEGRADATION_REASONS,
  PROGRESSION_MEMORY_COUNTER_NAMES,
  PROGRESSION_OPTIMIZER_CONTRACT_SCHEMA,
  PROGRESSION_OPTIMIZER_ENGINE_ID,
  PROGRESSION_OPTIMIZER_ENGINE_VERSION,
  PROGRESSION_OPTIMIZER_ENGINE_VERSION_TAG,
  PROGRESSION_OPTIMIZER_OPERATION_NAMES,
  PROGRESSION_REFUSAL_CODES,
  PROGRESSION_SEARCH_POLICY_ID,
  PROGRESSION_SEARCH_POLICY_VERSION,
  PROGRESSION_TERMINATIONS,
  PROGRESSION_TIE_BREAK_ORDER,
  PROGRESSION_TIE_BREAK_POLICY_ID,
  PROGRESSION_TIE_BREAK_POLICY_VERSION,
  PROGRESSION_VALIDATION_PRECEDENCE,
  PROGRESSION_WORK_COUNTER_NAMES,
  PROGRESSION_WORK_QUANTUM_UNITS,
  PROGRESSION_WORK_UNIT_IDENTITY,
} from "../../src/theory/progression-optimizer-contract";

setDefaultTimeout(240_000);

const root = resolve(import.meta.dirname, "../..");
const fixtureDir = resolve(root, "tests/fixtures/progression-optimizer");

async function loadFixture(name: string): Promise<unknown> {
  const raw = await readFile(resolve(fixtureDir, name), "utf8");
  return JSON.parse(raw) as unknown;
}

describe("V2 progression-optimizer contract authority", () => {
  test("the reviewed fixture authority validates with zero findings and exact counts", async () => {
    const report = await validateV2Contract();
    expect(report.findings).toEqual([]);
    expect(report.outcome).toBe("pass");
    expect(report.counts.files).toBe(8);
    expect(report.counts.cases).toBe(47);
    expect(report.counts.optimizeCases).toBe(23);
    expect(report.counts.refusalCases).toBe(16);
    expect(report.counts.stepperCases).toBe(8);
    expect(report.counts.bruteForceCertifiedCases).toBe(20);
    expect(report.counts.mutationControls).toBe(27);
    expect(report.counts.traces).toBe(17);
    expect(report.counts.authorities).toBe(6);
  });

  test("every named semantic mutation is caught with its expected finding", async () => {
    const mutations = (await loadFixture("mutation-controls.json")) as {
      controls: readonly {
        id: string;
        file: string;
        operation: string;
        pointer: string;
        value?: unknown;
        expectedFindingCode: string;
      }[];
    };
    expect(mutations.controls).toHaveLength(27);
    for (const control of mutations.controls) {
      const pristine = await loadFixture(control.file);
      const mutated = applyMutation(pristine, control);
      const report = await validateV2Contract({
        file: control.file,
        document: mutated,
      });
      expect(report.outcome, `${control.id} must fail validation`).toBe("fail");
      expect(
        report.findings.map((finding) => finding.code),
        `${control.id} must produce ${control.expectedFindingCode}`,
      ).toContain(control.expectedFindingCode);
    }
  });

  test("the validator imports no production source", async () => {
    const source = await readFile(
      resolve(root, "scripts/validate-v2-contract.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/from\s+"\.\.\/src\//u);
    expect(source).not.toMatch(/import\s*\(\s*"\.\.\/src\//u);
  });

  test("the public contract module stays aligned with the manifest", async () => {
    const manifest = (await loadFixture(
      "v2-progression-optimizer-contract.json",
    )) as {
      identity: Record<string, unknown>;
      declaredFiles: readonly string[];
      limits: Record<string, unknown>;
      costAxes: readonly string[];
      costAggregations: Record<string, string>;
      costValueLimits: Record<string, number>;
      tieBreakOrder: readonly string[];
      terminations: readonly string[];
      cancelReasons: readonly string[];
      degradationCode: string;
      degradationReasons: readonly string[];
      refusalCodes: readonly string[];
      validationPrecedence: { order: readonly string[] };
      workCounterNames: readonly string[];
      memoryCounterNames: readonly string[];
      workUnitIdentity: string;
      operationNames: readonly string[];
    };
    expect(manifest.identity["contractSchema"]).toBe(
      PROGRESSION_OPTIMIZER_CONTRACT_SCHEMA,
    );
    expect(manifest.identity["engineId"]).toBe(PROGRESSION_OPTIMIZER_ENGINE_ID);
    expect(manifest.identity["engineVersion"]).toBe(
      PROGRESSION_OPTIMIZER_ENGINE_VERSION,
    );
    expect(manifest.identity["engineVersionTag"]).toBe(
      PROGRESSION_OPTIMIZER_ENGINE_VERSION_TAG,
    );
    expect(manifest.identity["costPolicyId"]).toBe(PROGRESSION_COST_POLICY_ID);
    expect(manifest.identity["costPolicyVersion"]).toBe(
      PROGRESSION_COST_POLICY_VERSION,
    );
    expect(manifest.identity["searchPolicyId"]).toBe(
      PROGRESSION_SEARCH_POLICY_ID,
    );
    expect(manifest.identity["searchPolicyVersion"]).toBe(
      PROGRESSION_SEARCH_POLICY_VERSION,
    );
    expect(manifest.identity["tieBreakPolicyId"]).toBe(
      PROGRESSION_TIE_BREAK_POLICY_ID,
    );
    expect(manifest.identity["tieBreakPolicyVersion"]).toBe(
      PROGRESSION_TIE_BREAK_POLICY_VERSION,
    );
    expect(manifest.declaredFiles).toEqual([...V2_FIXTURE_FILES]);
    expect(manifest.limits["maxCandidatesPerEvent"]).toBe(
      MAX_PROGRESSION_CANDIDATES_PER_EVENT,
    );
    expect(manifest.limits["beamWidth"]).toBe(PROGRESSION_BEAM_WIDTH);
    expect(manifest.limits["maxWindowEvents"]).toBe(
      MAX_PROGRESSION_WINDOW_EVENTS,
    );
    expect(manifest.limits["maxRequestEvents"]).toBe(
      MAX_PROGRESSION_REQUEST_EVENTS,
    );
    expect(manifest.limits["maxWindowsPerSegment"]).toBe(
      MAX_PROGRESSION_WINDOWS_PER_SEGMENT,
    );
    expect(manifest.limits["workQuantumUnits"]).toBe(
      PROGRESSION_WORK_QUANTUM_UNITS,
    );
    expect(manifest.limits["maxWorkQuanta"]).toBe(MAX_PROGRESSION_WORK_QUANTA);
    expect(manifest.limits["maxTotalWorkUnits"]).toBe(
      MAX_PROGRESSION_TOTAL_WORK_UNITS,
    );
    expect(manifest.limits["maxRetainedStates"]).toBe(
      MAX_PROGRESSION_RETAINED_STATES,
    );
    expect(manifest.limits["maxTrackedStates"]).toBe(
      MAX_PROGRESSION_TRACKED_STATES,
    );
    expect(manifest.limits["maxRealizationRecords"]).toBe(
      MAX_PROGRESSION_REALIZATION_RECORDS,
    );
    expect(manifest.costAxes).toEqual([...PROGRESSION_COST_AXES]);
    for (const axis of PROGRESSION_COST_AXES) {
      expect(manifest.costAggregations[axis]).toBe(
        PROGRESSION_COST_AGGREGATIONS[axis],
      );
      expect(manifest.costValueLimits[axis]).toBe(
        PROGRESSION_COST_VALUE_LIMITS[axis],
      );
    }
    expect(manifest.tieBreakOrder).toEqual([...PROGRESSION_TIE_BREAK_ORDER]);
    expect(manifest.terminations).toEqual([...PROGRESSION_TERMINATIONS]);
    expect(manifest.cancelReasons).toEqual([...PROGRESSION_CANCEL_REASONS]);
    expect(manifest.degradationCode).toBe(PROGRESSION_DEGRADATION_CODE);
    expect(manifest.degradationReasons).toEqual([
      ...PROGRESSION_DEGRADATION_REASONS,
    ]);
    expect(manifest.refusalCodes).toEqual([...PROGRESSION_REFUSAL_CODES]);
    expect(manifest.validationPrecedence.order).toEqual([
      ...PROGRESSION_VALIDATION_PRECEDENCE.order,
    ]);
    expect(manifest.workCounterNames).toEqual([
      ...PROGRESSION_WORK_COUNTER_NAMES,
    ]);
    expect(manifest.memoryCounterNames).toEqual([
      ...PROGRESSION_MEMORY_COUNTER_NAMES,
    ]);
    expect(manifest.workUnitIdentity).toBe(PROGRESSION_WORK_UNIT_IDENTITY);
    expect(manifest.operationNames).toEqual([
      ...PROGRESSION_OPTIMIZER_OPERATION_NAMES,
    ]);
  });
});
