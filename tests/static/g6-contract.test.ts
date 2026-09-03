import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  G6_COLOR_LAB_CONTRACT_SCHEMA,
  G6_COLOR_LAB_RESULT_SCHEMA,
  G6_GUIDE_TONES_CONTRACT_SCHEMA,
  G6_GUIDE_TONE_EXTRACTION_SCHEMA,
  G6_GUIDE_TONE_PATHS_RESULT_SCHEMA,
  GUIDE_TONE_MOTION_KINDS,
  GUIDE_TONE_ROLES,
  MAX_G6_GUIDE_TONES_PER_EVENT,
  MAX_G6_MAX_MOTION_SEMITONES,
  MAX_G6_OPTIMIZED_PATHS,
  MAX_G6_PROGRESSION_EVENTS,
  MAX_G6_TOTAL_WORK_STEPS,
  MAX_G6_VOICE_LINES_PER_PATH,
  TENSION_DEGREES,
} from "../../src/theory/g6-contract";
import { validateG6Contract } from "../../scripts/validate-g6-contract";

type JsonRecord = Record<string, unknown>;

function isRecord(val: unknown): val is JsonRecord {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

const FIXTURE_DIR = resolve(
  import.meta.dir,
  "../fixtures/guide-tones",
);

describe("G6 guide-tone and color laboratory contract", () => {
  test("reviewed fixture authority validates with zero findings", async () => {
    const report = await validateG6Contract(FIXTURE_DIR);
    expect(report.outcome).toBe("pass");
    expect(report.findings).toEqual([]);
    expect(report.counts.files).toBe(6);
    expect(report.counts.guideToneCases).toBeGreaterThanOrEqual(5);
    expect(report.counts.colorLabCases).toBeGreaterThanOrEqual(3);
    expect(report.counts.upperStructureCatalog).toBeGreaterThanOrEqual(5);
    expect(report.counts.authorities).toBeGreaterThanOrEqual(5);
    expect(report.counts.traces).toBeGreaterThanOrEqual(5);
  });

  test("production contract constants match fixture declarations", async () => {
    const raw = await readFile(
      resolve(FIXTURE_DIR, "g6-guide-tones-contract.json"),
      "utf8",
    );
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) {
      throw new Error("Fixture root is not a record");
    }

    const schemas = isRecord(parsed.schemas) ? parsed.schemas : {};
    const limits = isRecord(parsed.limits) ? parsed.limits : {};

    expect(schemas.contract).toBe(G6_GUIDE_TONES_CONTRACT_SCHEMA);
    expect(schemas.guideToneExtraction).toBe(
      G6_GUIDE_TONE_EXTRACTION_SCHEMA,
    );
    expect(schemas.guideTonePathsResult).toBe(
      G6_GUIDE_TONE_PATHS_RESULT_SCHEMA,
    );
    expect(schemas.colorLabContract).toBe(
      G6_COLOR_LAB_CONTRACT_SCHEMA,
    );
    expect(schemas.colorLabResult).toBe(
      G6_COLOR_LAB_RESULT_SCHEMA,
    );

    expect(limits.maxProgressionEvents).toBe(
      MAX_G6_PROGRESSION_EVENTS,
    );
    expect(limits.maxGuideTonesPerEvent).toBe(
      MAX_G6_GUIDE_TONES_PER_EVENT,
    );
    expect(limits.maxOptimizedPaths).toBe(
      MAX_G6_OPTIMIZED_PATHS,
    );
    expect(limits.maxVoiceLinesPerPath).toBe(
      MAX_G6_VOICE_LINES_PER_PATH,
    );
    expect(limits.maxTotalWorkSteps).toBe(
      MAX_G6_TOTAL_WORK_STEPS,
    );
    expect(limits.maxMotionSemitones).toBe(
      MAX_G6_MAX_MOTION_SEMITONES,
    );

    expect(parsed.roles).toEqual(GUIDE_TONE_ROLES);
    expect(parsed.motionKinds).toEqual(GUIDE_TONE_MOTION_KINDS);
    expect(parsed.tensionDegrees).toEqual(TENSION_DEGREES);
  });

  test("mutation controls are caught with structured findings", async () => {
    const rawControls = await readFile(
      resolve(FIXTURE_DIR, "mutation-controls.json"),
      "utf8",
    );
    const parsed: unknown = JSON.parse(rawControls);
    if (!isRecord(parsed)) {
      throw new Error("Mutation controls root is not a record");
    }
    const controls = Array.isArray(parsed.controls) ? parsed.controls : [];

    expect(controls.length).toBeGreaterThanOrEqual(15);

    for (const control of controls) {
      if (!isRecord(control)) {
        throw new Error("Control is not a record");
      }
      expect(control.id).toBeDefined();
      expect(control.targetFile).toBeDefined();
      expect(control.mutationPath).toBeDefined();
      expect(control.expectedFinding).toBeDefined();
    }
  });
});
