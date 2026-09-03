import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateG1Contract } from "../../scripts/validate-g1-contract";
import {
  G1_ATLAS_MANIFEST_SCHEMA,
  G1_ATLAS_REJECTIONS_SCHEMA,
  G1_COMPILED_ATLAS_SCHEMA,
  G1_SOURCE_ATLAS_SCHEMA,
  MAX_G1_FINGERPRINT_LAYERS,
  MAX_G1_FIXTURE_ENTRIES,
  MAX_G1_PROGRESSION_LENGTH,
} from "../../src/theory";

const FIXTURE_DIR = resolve(
  import.meta.dir,
  "../fixtures/atlas-compiler",
);

describe("G1 Atlas Schema and Compiler contract", () => {
  test("reviewed fixture authority validates with zero findings", async () => {
    const report = await validateG1Contract();
    expect(report.outcome).toBe("pass");
    expect(report.findings).toHaveLength(0);
    expect(report.counts.files).toBe(6);
    expect(report.counts.sourceEntries).toBeGreaterThanOrEqual(3);
    expect(report.counts.plantedFailures).toBeGreaterThanOrEqual(3);
    expect(report.counts.authorities).toBeGreaterThanOrEqual(4);
    expect(report.counts.traces).toBeGreaterThanOrEqual(4);
  });

  test("production contract constants match fixture declarations", async () => {
    const raw = await readFile(resolve(FIXTURE_DIR, "g1-atlas-contract.json"), "utf8");
    const json = JSON.parse(raw) as {
      schemas: {
        sourceAtlas: string;
        compiledAtlas: string;
        manifest: string;
        rejections: string;
      };
      limits: {
        maxFixtureEntries: number;
        maxProgressionLength: number;
        maxFingerprintLayers: number;
      };
    };

    expect(json.schemas.sourceAtlas).toBe(G1_SOURCE_ATLAS_SCHEMA);
    expect(json.schemas.compiledAtlas).toBe(G1_COMPILED_ATLAS_SCHEMA);
    expect(json.schemas.manifest).toBe(G1_ATLAS_MANIFEST_SCHEMA);
    expect(json.schemas.rejections).toBe(G1_ATLAS_REJECTIONS_SCHEMA);
    expect(json.limits.maxFixtureEntries).toBe(MAX_G1_FIXTURE_ENTRIES);
    expect(json.limits.maxProgressionLength).toBe(MAX_G1_PROGRESSION_LENGTH);
    expect(json.limits.maxFingerprintLayers).toBe(MAX_G1_FINGERPRINT_LAYERS);
  });

  test("planted rights failures are documented with expected rejection codes", async () => {
    const raw = await readFile(resolve(FIXTURE_DIR, "planted-rights-failures.json"), "utf8");
    const json = JSON.parse(raw) as {
      plantedFailures: Array<{
        entryId: string;
        title: string;
        expectedRejection: string;
      }>;
    };

    expect(json.plantedFailures.length).toBeGreaterThanOrEqual(3);
    for (const f of json.plantedFailures) {
      expect(f.expectedRejection).toMatch(/^g1\./);
    }
  });
});
