import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateG2Contract } from "../../scripts/validate-g2-contract";
import {
  G2_CONTINUATION_RESULT_SCHEMA,
  MAX_G2_CANDIDATES_PER_PROVIDER,
  MAX_G2_CONTEXT_EVENTS,
  MAX_G2_DISPLAY_OPTIONS,
} from "../../src/theory";

const FIXTURE_DIR = resolve(
  import.meta.dir,
  "../fixtures/continuation",
);

describe("G2 Contextual Continuation Engine contract", () => {
  test("reviewed fixture authority validates with zero findings", async () => {
    const report = await validateG2Contract();
    expect(report.outcome).toBe("pass");
    expect(report.findings).toHaveLength(0);
    expect(report.counts.files).toBe(6);
    expect(report.counts.continuationCases).toBeGreaterThanOrEqual(4);
    expect(report.counts.heldOutCases).toBeGreaterThanOrEqual(3);
    expect(report.counts.mutationControls).toBeGreaterThanOrEqual(4);
    expect(report.counts.authorities).toBeGreaterThanOrEqual(4);
    expect(report.counts.traces).toBeGreaterThanOrEqual(4);
  });

  test("production contract constants match fixture declarations", async () => {
    const raw = await readFile(resolve(FIXTURE_DIR, "g2-continuation-contract.json"), "utf8");
    const json = JSON.parse(raw) as {
      schemas: {
        continuationResult: string;
      };
      limits: {
        maxCandidatesPerProvider: number;
        maxDisplayOptions: number;
        maxContextEvents: number;
      };
    };

    expect(json.schemas.continuationResult).toBe(G2_CONTINUATION_RESULT_SCHEMA);
    expect(json.limits.maxCandidatesPerProvider).toBe(MAX_G2_CANDIDATES_PER_PROVIDER);
    expect(json.limits.maxDisplayOptions).toBe(MAX_G2_DISPLAY_OPTIONS);
    expect(json.limits.maxContextEvents).toBe(MAX_G2_CONTEXT_EVENTS);
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
      expect(mc.expectedRefusal).toMatch(/^g2\./);
      expect(mc.corruptedField.length).toBeGreaterThan(0);
    }
  });
});
