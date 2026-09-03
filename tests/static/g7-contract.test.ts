import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateG7Contract } from "../../scripts/validate-g7-contract";
import {
  G7_RHYTHM_TRANSFORM_SCHEMA,
  G7_TENSION_CURVE_SCHEMA,
  MAX_G7_PROGRESSION_EVENTS,
  MAX_G7_TENSION_POINTS,
} from "../../src/theory";

const FIXTURE_DIR = resolve(
  import.meta.dir,
  "../fixtures/rhythm-transforms",
);

describe("G7 Rhythm Transforms and Tension Curve contract", () => {
  test("reviewed fixture authority validates with zero findings", async () => {
    const report = await validateG7Contract();
    expect(report.outcome).toBe("pass");
    expect(report.findings).toHaveLength(0);
    expect(report.counts.files).toBe(5);
    expect(report.counts.transformCases).toBeGreaterThanOrEqual(3);
    expect(report.counts.mutationControls).toBeGreaterThanOrEqual(4);
    expect(report.counts.authorities).toBeGreaterThanOrEqual(4);
    expect(report.counts.traces).toBeGreaterThanOrEqual(4);
  });

  test("production contract constants match fixture declarations", async () => {
    const raw = await readFile(resolve(FIXTURE_DIR, "g7-rhythm-transforms-contract.json"), "utf8");
    const json = JSON.parse(raw) as {
      schemas: {
        tensionCurve: string;
        rhythmTransform: string;
      };
      limits: {
        maxProgressionEvents: number;
        maxTensionPoints: number;
      };
    };

    expect(json.schemas.tensionCurve).toBe(G7_TENSION_CURVE_SCHEMA);
    expect(json.schemas.rhythmTransform).toBe(G7_RHYTHM_TRANSFORM_SCHEMA);
    expect(json.limits.maxProgressionEvents).toBe(MAX_G7_PROGRESSION_EVENTS);
    expect(json.limits.maxTensionPoints).toBe(MAX_G7_TENSION_POINTS);
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
      expect(mc.expectedRefusal).toMatch(/^g7\./);
      expect(mc.corruptedField.length).toBeGreaterThan(0);
    }
  });
});
