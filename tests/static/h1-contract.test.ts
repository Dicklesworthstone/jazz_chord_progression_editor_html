import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateH1Contract } from "../../scripts/validate-h1-contract";
import {
  H1_SPELLED_TRANSPOSITION_SCHEMA,
  H1_TRANSFORM_LAW_SCHEMA,
  H1_TRANSFORM_RESULT_SCHEMA,
  MAX_H1_EDIT_PLAN_OPERATIONS,
  MAX_H1_LAWS_PER_CANDIDATE,
  MAX_H1_TRANSFORM_EVENTS,
} from "../../src/theory";

const FIXTURE_DIR = resolve(
  import.meta.dir,
  "../fixtures/transform-laws",
);

describe("H1 transformation laws and spelled transposition contract", () => {
  test("reviewed fixture authority validates with zero findings", async () => {
    const report = await validateH1Contract();
    expect(report.outcome).toBe("pass");
    expect(report.findings).toHaveLength(0);
    expect(report.counts.files).toBe(6);
    expect(report.counts.transformCases).toBeGreaterThanOrEqual(8);
    expect(report.counts.transpositionCases).toBeGreaterThanOrEqual(5);
    expect(report.counts.registeredLaws).toBeGreaterThanOrEqual(16);
    expect(report.counts.mutationControls).toBeGreaterThanOrEqual(6);
    expect(report.counts.authorities).toBeGreaterThanOrEqual(4);
    expect(report.counts.traces).toBeGreaterThanOrEqual(6);
  });

  test("production contract constants match fixture declarations", async () => {
    const raw = await readFile(resolve(FIXTURE_DIR, "h1-transform-contract.json"), "utf8");
    const json = JSON.parse(raw) as {
      schemas: {
        transformLaw: string;
        transformResult: string;
        spelledTransposition: string;
      };
      limits: {
        maxProgressionEvents: number;
        maxLawsPerCandidate: number;
        maxEditPlanOperations: number;
      };
    };

    expect(json.schemas.transformLaw).toBe(H1_TRANSFORM_LAW_SCHEMA);
    expect(json.schemas.transformResult).toBe(H1_TRANSFORM_RESULT_SCHEMA);
    expect(json.schemas.spelledTransposition).toBe(H1_SPELLED_TRANSPOSITION_SCHEMA);
    expect(json.limits.maxProgressionEvents).toBe(MAX_H1_TRANSFORM_EVENTS);
    expect(json.limits.maxLawsPerCandidate).toBe(MAX_H1_LAWS_PER_CANDIDATE);
    expect(json.limits.maxEditPlanOperations).toBe(MAX_H1_EDIT_PLAN_OPERATIONS);
  });

  test("mutation controls are caught with structured findings", async () => {
    const raw = await readFile(resolve(FIXTURE_DIR, "mutation-controls.json"), "utf8");
    const json = JSON.parse(raw) as {
      mutationControls: Array<{
        id: string;
        description: string;
        corruptedField: string;
        expectedRefusal: string;
      }>;
    };

    expect(json.mutationControls.length).toBeGreaterThanOrEqual(6);
    for (const mc of json.mutationControls) {
      expect(mc.expectedRefusal).toMatch(/^h1\./);
      expect(mc.corruptedField.length).toBeGreaterThan(0);
    }
  });
});
