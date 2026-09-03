import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateG3Contract } from "../../scripts/validate-g3-contract";
import {
  G3_ROUTE_PLANNER_RESULT_SCHEMA,
  MAX_G3_OUTGOING_PER_STATE,
  MAX_G3_RETURNED_ROUTES,
  MAX_G3_ROUTE_STEPS,
  MAX_G3_SEARCH_STATES,
} from "../../src/theory";

const FIXTURE_DIR = resolve(
  import.meta.dir,
  "../fixtures/route-planner",
);

describe("G3 Harmonic Route Planner contract", () => {
  test("reviewed fixture authority validates with zero findings", async () => {
    const report = await validateG3Contract();
    expect(report.outcome).toBe("pass");
    expect(report.findings).toHaveLength(0);
    expect(report.counts.files).toBe(5);
    expect(report.counts.routeCases).toBeGreaterThanOrEqual(4);
    expect(report.counts.mutationControls).toBeGreaterThanOrEqual(4);
    expect(report.counts.authorities).toBeGreaterThanOrEqual(4);
    expect(report.counts.traces).toBeGreaterThanOrEqual(4);
  });

  test("production contract constants match fixture declarations", async () => {
    const raw = await readFile(resolve(FIXTURE_DIR, "g3-route-planner-contract.json"), "utf8");
    const json = JSON.parse(raw) as {
      schemas: {
        routePlannerResult: string;
      };
      limits: {
        maxRouteSteps: number;
        maxOutgoingPerState: number;
        maxSearchStates: number;
        maxReturnedRoutes: number;
      };
    };

    expect(json.schemas.routePlannerResult).toBe(G3_ROUTE_PLANNER_RESULT_SCHEMA);
    expect(json.limits.maxRouteSteps).toBe(MAX_G3_ROUTE_STEPS);
    expect(json.limits.maxOutgoingPerState).toBe(MAX_G3_OUTGOING_PER_STATE);
    expect(json.limits.maxSearchStates).toBe(MAX_G3_SEARCH_STATES);
    expect(json.limits.maxReturnedRoutes).toBe(MAX_G3_RETURNED_ROUTES);
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
      expect(mc.expectedRefusal).toMatch(/^g3\./);
      expect(mc.corruptedField.length).toBeGreaterThan(0);
    }
  });
});
