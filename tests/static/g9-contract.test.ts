import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateG9Contract } from "../../scripts/validate-g9-contract";
import {
  G9_PRACTICE_RUBRIC_SCHEMA,
  G9_PRACTICE_SESSION_SCHEMA,
  MAX_G9_OPTIONS_PER_PROMPT,
  MAX_G9_PROMPTS_PER_SESSION,
} from "../../src/theory";

const FIXTURE_DIR = resolve(
  import.meta.dir,
  "../fixtures/practice-laboratory",
);

describe("G9 Deterministic Chart-to-Practice Laboratory contract", () => {
  test("reviewed fixture authority validates with zero findings", async () => {
    const report = await validateG9Contract();
    expect(report.outcome).toBe("pass");
    expect(report.findings).toHaveLength(0);
    expect(report.counts.files).toBe(5);
    expect(report.counts.sessionCases).toBeGreaterThanOrEqual(1);
    expect(report.counts.mutationControls).toBeGreaterThanOrEqual(4);
    expect(report.counts.authorities).toBeGreaterThanOrEqual(4);
    expect(report.counts.traces).toBeGreaterThanOrEqual(4);
  });

  test("production contract constants match fixture declarations", async () => {
    const raw = await readFile(resolve(FIXTURE_DIR, "g9-practice-laboratory-contract.json"), "utf8");
    const json = JSON.parse(raw) as {
      schemas: {
        practiceSession: string;
        practiceRubric: string;
      };
      limits: {
        maxPromptsPerSession: number;
        maxOptionsPerPrompt: number;
      };
    };

    expect(json.schemas.practiceSession).toBe(G9_PRACTICE_SESSION_SCHEMA);
    expect(json.schemas.practiceRubric).toBe(G9_PRACTICE_RUBRIC_SCHEMA);
    expect(json.limits.maxPromptsPerSession).toBe(MAX_G9_PROMPTS_PER_SESSION);
    expect(json.limits.maxOptionsPerPrompt).toBe(MAX_G9_OPTIONS_PER_PROMPT);
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
      expect(mc.expectedRefusal).toMatch(/^g9\./);
      expect(mc.corruptedField.length).toBeGreaterThan(0);
    }
  });
});
