import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateG5Contract } from "../../scripts/validate-g5-contract";
import {
  G5_REHARMONIZATION_TREE_SCHEMA,
  MAX_G5_BRANCH_DEPTH,
  MAX_G5_CHILDREN_PER_NODE,
  MAX_G5_TOTAL_NODES,
} from "../../src/theory";

const FIXTURE_DIR = resolve(
  import.meta.dir,
  "../fixtures/reharmonization-tree",
);

describe("G5 Proof-Carrying Reharmonization Tree contract", () => {
  test("reviewed fixture authority validates with zero findings", async () => {
    const report = await validateG5Contract();
    expect(report.outcome).toBe("pass");
    expect(report.findings).toHaveLength(0);
    expect(report.counts.files).toBe(5);
    expect(report.counts.reharmCases).toBeGreaterThanOrEqual(2);
    expect(report.counts.mutationControls).toBeGreaterThanOrEqual(4);
    expect(report.counts.authorities).toBeGreaterThanOrEqual(4);
    expect(report.counts.traces).toBeGreaterThanOrEqual(4);
  });

  test("production contract constants match fixture declarations", async () => {
    const raw = await readFile(resolve(FIXTURE_DIR, "g5-reharmonization-contract.json"), "utf8");
    const json = JSON.parse(raw) as {
      schemas: {
        reharmonizationTree: string;
      };
      limits: {
        maxBranchDepth: number;
        maxChildrenPerNode: number;
        maxTotalNodes: number;
      };
    };

    expect(json.schemas.reharmonizationTree).toBe(G5_REHARMONIZATION_TREE_SCHEMA);
    expect(json.limits.maxBranchDepth).toBe(MAX_G5_BRANCH_DEPTH);
    expect(json.limits.maxChildrenPerNode).toBe(MAX_G5_CHILDREN_PER_NODE);
    expect(json.limits.maxTotalNodes).toBe(MAX_G5_TOTAL_NODES);
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
      expect(mc.expectedRefusal).toMatch(/^g5\./);
      expect(mc.corruptedField.length).toBeGreaterThan(0);
    }
  });
});
