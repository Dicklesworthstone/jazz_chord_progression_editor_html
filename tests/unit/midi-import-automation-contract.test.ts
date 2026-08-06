import { describe, expect, test } from "bun:test";

import {
  GROOVE_STYLE_IDS,
  makeSpelledPitchClass,
} from "../../src/domain";
import { PERFORMANCE_STYLE_IDS } from "../../src/playback/performance/performance-plan-contract";
import {
  M1_AUTOMATION_CONTRACT_SCHEMA,
  M1_AUTOMATION_TRACE_SCHEMA,
  M1_BASS_MAX_KEY,
  M1_BASS_NAME_TOKENS,
  M1_CHUNK_CODE_POINT_LIMIT,
  M1_GROOVE_DECISION_TABLE,
  M1_GROOVE_FEATURE_NAMES,
  M1_IMPORT_COMMAND_ORDER,
  M1_MAJOR_KEY_PROFILE,
  M1_MAJOR_SCALE_OFFSETS,
  M1_MAJOR_TONIC_SPELLINGS,
  M1_MAX_IMPORT_CHUNKS,
  M1_MAX_SEGMENT_DEPTH,
  M1_MELODY_MIN_MEAN_KEY,
  M1_MELODY_NAME_TOKENS,
  M1_MINOR_KEY_PROFILE,
  M1_MINOR_SCALE_OFFSETS,
  M1_MINOR_TONIC_SPELLINGS,
  M1_PERCUSSION_CHANNEL,
  M1_PERCUSSION_NAME_TOKENS,
  M1_ROLE_RULE_ORDER,
  M1_SEGMENT_SPLIT_MIN_DIFFERENCE,
  M1_TRACE_STAGES,
  M1_TRACK_ROLES,
  M1_TRANSFER_SETTINGS,
  M1_TRANSFER_TRUTH_TABLE,
} from "../../src/export/midi-import-automation-contract";

const STEP_PITCH_CLASSES: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

describe("M1 automation contract statics", () => {
  test("schemas are distinct and versioned", () => {
    const schemas = [
      M1_AUTOMATION_CONTRACT_SCHEMA,
      M1_AUTOMATION_TRACE_SCHEMA,
    ];
    expect(new Set(schemas).size).toBe(schemas.length);
    for (const schema of schemas) expect(schema).toMatch(/\.v1$/);
  });

  test("role vocabulary and rule order are closed and consistent", () => {
    expect([...M1_TRACK_ROLES]).toEqual([
      "percussion",
      "bass",
      "harmony",
      "melody",
      "silent",
    ]);
    expect(M1_ROLE_RULE_ORDER[0]).toBe("silent-when-empty");
    expect(M1_ROLE_RULE_ORDER[M1_ROLE_RULE_ORDER.length - 1]).toBe(
      "harmony-otherwise",
    );
    const tokenRules = M1_ROLE_RULE_ORDER.filter((rule) =>
      rule.includes("token"),
    );
    const statRules = M1_ROLE_RULE_ORDER.filter(
      (rule) => rule === "bass-by-register" || rule === "melody-by-line",
    );
    const lastToken = Math.max(
      ...tokenRules.map((rule) => M1_ROLE_RULE_ORDER.indexOf(rule)),
    );
    const firstStat = Math.min(
      ...statRules.map((rule) => M1_ROLE_RULE_ORDER.indexOf(rule)),
    );
    expect(lastToken).toBeLessThan(firstStat);
  });

  test("classification constants match the documented laws", () => {
    expect(M1_PERCUSSION_CHANNEL).toBe(9);
    expect(M1_BASS_MAX_KEY).toBe(55);
    expect(M1_MELODY_MIN_MEAN_KEY).toBe(64);
    for (const list of [
      M1_PERCUSSION_NAME_TOKENS,
      M1_BASS_NAME_TOKENS,
      M1_MELODY_NAME_TOKENS,
    ]) {
      for (const token of list) {
        expect<string>(token).toBe(token.toLowerCase());
        expect(token).not.toMatch(/[\s\-_0-9]/);
      }
    }
  });

  test("segmentation depth and split constants are frozen", () => {
    expect(M1_MAX_SEGMENT_DEPTH).toBe(2);
    expect(M1_SEGMENT_SPLIT_MIN_DIFFERENCE).toBe(2);
  });

  test("key profiles are 12 non-negative integers with the tonic strongest", () => {
    for (const profile of [M1_MAJOR_KEY_PROFILE, M1_MINOR_KEY_PROFILE]) {
      expect(profile.length).toBe(12);
      for (const weight of profile) {
        expect(Number.isInteger(weight)).toBe(true);
        expect(weight).toBeGreaterThanOrEqual(0);
      }
      expect(Math.max(...profile)).toBe(profile[0]);
    }
  });

  test("tonic spelling tables resolve to their own pitch classes", () => {
    for (const [table, label] of [
      [M1_MAJOR_TONIC_SPELLINGS, "major"],
      [M1_MINOR_TONIC_SPELLINGS, "minor"],
    ] as const) {
      expect(table.length).toBe(12);
      table.forEach((spelling, pitchClass) => {
        const stepPitchClass = STEP_PITCH_CLASSES[spelling.step];
        expect(stepPitchClass).toBeDefined();
        const resolved =
          ((stepPitchClass ?? 0) + spelling.alter + 12) % 12;
        expect(`${label}:${String(pitchClass)}:${String(resolved)}`).toBe(
          `${label}:${String(pitchClass)}:${String(pitchClass)}`,
        );
        const made = makeSpelledPitchClass({
          step: spelling.step,
          alter: spelling.alter,
        });
        expect(made.ok).toBe(true);
      });
    }
  });

  test("scale offset sets are sorted, in-range, and rooted at zero", () => {
    for (const offsets of [M1_MAJOR_SCALE_OFFSETS, M1_MINOR_SCALE_OFFSETS]) {
      expect(offsets[0]).toBe(0);
      for (let index = 1; index < offsets.length; index += 1) {
        const current = offsets[index] ?? Number.NaN;
        const previous = offsets[index - 1] ?? Number.NaN;
        expect(current).toBeGreaterThan(previous);
        expect(current).toBeLessThan(12);
      }
    }
  });

  test("groove decision table is total, ordered, and names only reviewed grooves", () => {
    /* Nine rows since amendment #1 (jcpe-gdyt): the dense-unswung-pop row. */
    expect(M1_GROOVE_DECISION_TABLE.length).toBe(9);
    M1_GROOVE_DECISION_TABLE.forEach((rule, index) => {
      expect<number>(rule.row).toBe(index + 1);
      expect([...GROOVE_STYLE_IDS]).toContain(rule.grooveStyleId);
      expect([...PERFORMANCE_STYLE_IDS]).toContain(rule.grooveStyleId);
      for (const condition of rule.conditions) {
        expect([...M1_GROOVE_FEATURE_NAMES]).toContain(condition.feature);
        expect(condition.value.denominator).toBeGreaterThan(0);
        if (condition.comparator === "between") {
          expect(condition.upper).not.toBeNull();
        } else {
          expect(condition.upper).toBeNull();
        }
      }
      const placeholders = rule.evidenceTemplate.match(/\{([a-zA-Z]+)\}/g) ?? [];
      const featureNames: readonly string[] = M1_GROOVE_FEATURE_NAMES;
      for (const placeholder of placeholders) {
        expect(featureNames).toContain(placeholder.slice(1, -1));
      }
    });
    const defaultRule = M1_GROOVE_DECISION_TABLE.at(-1);
    expect(defaultRule).toBeDefined();
    expect(defaultRule?.conditions.length).toBe(0);
  });

  test("transfer truth table covers every setting for both destinations", () => {
    for (const destination of ["starter", "occupied"] as const) {
      const row = M1_TRANSFER_TRUTH_TABLE[destination];
      for (const setting of M1_TRANSFER_SETTINGS) {
        expect(typeof row[setting]).toBe("string");
      }
    }
    expect(M1_TRANSFER_TRUTH_TABLE.starter.tempo).toBe("applied");
    expect(M1_TRANSFER_TRUTH_TABLE.occupied.tempo).toBe("withheld-stated");
  });

  test("envelope constants agree with the A0 fragment limit", () => {
    expect(M1_CHUNK_CODE_POINT_LIMIT).toBe(4096);
    expect(M1_MAX_IMPORT_CHUNKS).toBe(16);
    expect([...M1_IMPORT_COMMAND_ORDER]).toEqual([
      "insert",
      "settings",
      "groove",
    ]);
  });

  test("trace stages are the frozen nine in pipeline order", () => {
    expect([...M1_TRACE_STAGES]).toEqual([
      "decode",
      "salvage",
      "classify",
      "segment",
      "infer-key",
      "resolve",
      "groove",
      "plan",
      "envelope",
    ]);
  });
});
