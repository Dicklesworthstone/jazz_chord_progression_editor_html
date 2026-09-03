import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateG4Contract } from "../../scripts/validate-g4-contract";
import {
  G4_HARMONIZATION_RESULT_SCHEMA,
  MAX_G4_CANDIDATES_PER_SLOT,
  MAX_G4_SEARCH_STATES,
  MAX_G4_SLOTS,
  MAX_G4_SOLUTIONS,
} from "../../src/theory";

const FIXTURE_DIR = resolve(
  import.meta.dir,
  "../fixtures/harmonization",
);

describe("G4 Constraint Harmonization Workbench contract", () => {
  test("reviewed fixture authority validates with zero findings", async () => {
    const report = await validateG4Contract();
    expect(report.outcome).toBe("pass");
    expect(report.findings).toHaveLength(0);
    expect(report.counts.files).toBe(5);
    expect(report.counts.harmonizationCases).toBeGreaterThanOrEqual(3);
    expect(report.counts.mutationControls).toBeGreaterThanOrEqual(4);
    expect(report.counts.authorities).toBeGreaterThanOrEqual(4);
    expect(report.counts.traces).toBeGreaterThanOrEqual(4);
  });

  test("production contract constants match fixture declarations", async () => {
    const raw = await readFile(resolve(FIXTURE_DIR, "g4-harmonization-contract.json"), "utf8");
    const json = JSON.parse(raw) as {
      schemas: {
        harmonizationResult: string;
      };
      limits: {
        maxSlots: number;
        maxCandidatesPerSlot: number;
        maxSearchStates: number;
        maxSolutions: number;
      };
    };

    expect(json.schemas.harmonizationResult).toBe(G4_HARMONIZATION_RESULT_SCHEMA);
    expect(json.limits.maxSlots).toBe(MAX_G4_SLOTS);
    expect(json.limits.maxCandidatesPerSlot).toBe(MAX_G4_CANDIDATES_PER_SLOT);
    expect(json.limits.maxSearchStates).toBe(MAX_G4_SEARCH_STATES);
    expect(json.limits.maxSolutions).toBe(MAX_G4_SOLUTIONS);
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

    expect(json.mutationControls.length).toBeGreaterThanOrEqual(4);
    for (const mc of json.mutationControls) {
      expect(mc.expectedRefusal).toMatch(/^g4\./);
      expect(mc.corruptedField.length).toBeGreaterThan(0);
    }
  });
});
