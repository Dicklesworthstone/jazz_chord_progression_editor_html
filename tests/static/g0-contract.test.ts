import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateG0Contract } from "../../scripts/validate-g0-contract";
import {
  G0_PHRASE_ANALYSIS_SCHEMA,
  G0_TONAL_JOURNEY_RESULT_SCHEMA,
  MAX_G0_K_BEST_PATHS,
  MAX_G0_KEY_AREAS_PER_PATH,
  MAX_G0_PROGRESSION_EVENTS,
} from "../../src/theory";

const FIXTURE_DIR = resolve(
  import.meta.dir,
  "../fixtures/tonal-journey",
);

describe("G0 tonal journey and phrase analysis contract", () => {
  test("reviewed fixture authority validates with zero findings", async () => {
    const report = await validateG0Contract();
    expect(report.outcome).toBe("pass");
    expect(report.findings).toHaveLength(0);
    expect(report.counts.files).toBe(6);
    expect(report.counts.journeyCases).toBeGreaterThanOrEqual(4);
    expect(report.counts.cadenceCases).toBeGreaterThanOrEqual(5);
    expect(report.counts.mutationControls).toBeGreaterThanOrEqual(4);
    expect(report.counts.authorities).toBeGreaterThanOrEqual(4);
    expect(report.counts.traces).toBeGreaterThanOrEqual(4);
  });

  test("production contract constants match fixture declarations", async () => {
    const raw = await readFile(resolve(FIXTURE_DIR, "g0-tonal-journey-contract.json"), "utf8");
    const json = JSON.parse(raw) as {
      schemas: {
        tonalJourneyResult: string;
        phraseAnalysis: string;
      };
      limits: {
        maxProgressionEvents: number;
        maxKBestPaths: number;
        maxKeyAreasPerPath: number;
      };
    };

    expect(json.schemas.tonalJourneyResult).toBe(G0_TONAL_JOURNEY_RESULT_SCHEMA);
    expect(json.schemas.phraseAnalysis).toBe(G0_PHRASE_ANALYSIS_SCHEMA);
    expect(json.limits.maxProgressionEvents).toBe(MAX_G0_PROGRESSION_EVENTS);
    expect(json.limits.maxKBestPaths).toBe(MAX_G0_K_BEST_PATHS);
    expect(json.limits.maxKeyAreasPerPath).toBe(MAX_G0_KEY_AREAS_PER_PATH);
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
      expect(mc.expectedRefusal).toMatch(/^g0\./);
      expect(mc.corruptedField.length).toBeGreaterThan(0);
    }
  });
});
