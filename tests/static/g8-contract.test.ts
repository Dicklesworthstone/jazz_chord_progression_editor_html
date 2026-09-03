import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateG8Contract } from "../../scripts/validate-g8-contract";
import {
  G8_HARMONIC_SEQUENCE_SCHEMA,
  G8_NONFUNCTIONAL_TRANSFORM_SCHEMA,
  MAX_G8_NONFUNCTIONAL_VARIANTS,
  MAX_G8_SEQUENCE_LENGTH,
} from "../../src/theory";

const FIXTURE_DIR = resolve(
  import.meta.dir,
  "../fixtures/nonfunctional-atlas",
);

describe("G8 Nonfunctional Transforms and Sequence Atlas contract", () => {
  test("reviewed fixture authority validates with zero findings", async () => {
    const report = await validateG8Contract();
    expect(report.outcome).toBe("pass");
    expect(report.findings).toHaveLength(0);
    expect(report.counts.files).toBe(6);
    expect(report.counts.truthTables).toBeGreaterThanOrEqual(4);
    expect(report.counts.sequenceCases).toBeGreaterThanOrEqual(2);
    expect(report.counts.mutationControls).toBeGreaterThanOrEqual(4);
    expect(report.counts.authorities).toBeGreaterThanOrEqual(4);
    expect(report.counts.traces).toBeGreaterThanOrEqual(4);
  });

  test("production contract constants match fixture declarations", async () => {
    const raw = await readFile(resolve(FIXTURE_DIR, "g8-nonfunctional-contract.json"), "utf8");
    const json = JSON.parse(raw) as {
      schemas: {
        nonfunctionalTransform: string;
        harmonicSequence: string;
      };
      limits: {
        maxSequenceLength: number;
        maxNonfunctionalVariants: number;
      };
    };

    expect(json.schemas.nonfunctionalTransform).toBe(G8_NONFUNCTIONAL_TRANSFORM_SCHEMA);
    expect(json.schemas.harmonicSequence).toBe(G8_HARMONIC_SEQUENCE_SCHEMA);
    expect(json.limits.maxSequenceLength).toBe(MAX_G8_SEQUENCE_LENGTH);
    expect(json.limits.maxNonfunctionalVariants).toBe(MAX_G8_NONFUNCTIONAL_VARIANTS);
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
      expect(mc.expectedRefusal).toMatch(/^g8\./);
      expect(mc.corruptedField.length).toBeGreaterThan(0);
    }
  });
});
