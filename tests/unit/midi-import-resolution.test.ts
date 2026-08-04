/**
 * M0-TRACE-REVERSE-T1 and M0-TRACE-CUSTOM-FALLBACK evidence.
 *
 * The reverse-T1 resolver must yield PLURAL ranked alternatives with evidence
 * in the frozen total order, and the literal Custom pitch set — never an
 * invented name — when no template matches. Every alternative list compared
 * here comes from `resolution-cases.json` and `golden-cases.json`.
 */
import { describe, expect, test } from "bun:test";

import { resolveSonority } from "../../src/export/midi-import";
import {
  CHORD_FORMULA_RULE_IDS,
  ALTERED_DOMINANT_REALIZATION_IDS,
} from "../../src/theory";
import {
  MAX_MIDI_IMPORT_CHORD_ALTERNATIVES,
  MIDI_IMPORT_MATCH_TEMPLATES,
} from "../../src/export/midi-import-contract";
import type { PitchClass } from "../../src/domain";
import {
  GOLDEN_CASES,
  RESOLUTION_CASES,
  decodeGolden,
  requireDecoded,
} from "../support/midi-import-test-kit";

function asPitchClasses(values: readonly number[]): readonly PitchClass[] {
  return values as readonly PitchClass[];
}

describe("M0 reverse-T1 resolution", () => {
  for (const entry of RESOLUTION_CASES) {
    test(`${entry.id} — ${entry.title}`, () => {
      const outcome = resolveSonority(
        asPitchClasses(entry.input.pitchClasses),
        entry.input.bassPitchClass as PitchClass,
      );
      expect(outcome).toEqual(entry.expected);
    });
  }
});

describe("M0 resolution over the golden byte corpus", () => {
  for (const entry of GOLDEN_CASES) {
    test(`${entry.id} resolves exactly as reviewed`, async () => {
      const decoded = requireDecoded(await decodeGolden(entry.id));
      const resolutions = decoded.resolutions;
      expect(resolutions.length).toBe(entry.expectedResolutions.length);
      for (const expected of entry.expectedResolutions) {
        expect(resolutions[expected.sonorityIndex]).toEqual(expected.outcome);
      }
    });
  }
});

describe("M0 template table stays inside the T1 vocabulary", () => {
  test("every template names a live T1 formula rule and realization", () => {
    expect(MIDI_IMPORT_MATCH_TEMPLATES.length).toBe(24);
    for (const template of MIDI_IMPORT_MATCH_TEMPLATES) {
      expect(CHORD_FORMULA_RULE_IDS).toContain(template.formulaRuleId);
      if (template.realizationId !== null) {
        expect(ALTERED_DOMINANT_REALIZATION_IDS).toContain(
          template.realizationId,
        );
      }
    }
  });

  test("alternatives are capped while the true match count is reported", () => {
    /*
     * The fully diminished seventh is the symmetry that produces the most
     * readings in the frozen table; the cap must never hide the true count.
     */
    const outcome = resolveSonority(asPitchClasses([0, 3, 6, 9]), 0);
    expect(outcome.kind).toBe("alternatives");
    if (outcome.kind !== "alternatives") return;
    expect(outcome.totalMatches).toBe(4);
    expect(outcome.alternatives.length).toBeLessThanOrEqual(
      MAX_MIDI_IMPORT_CHORD_ALTERNATIVES,
    );
  });

  test("transposing a sonority transposes every alternative", () => {
    for (let shift = 0; shift < 12; shift += 1) {
      const shifted = asPitchClasses(
        [0, 2, 5, 9].map((pitchClass) => (pitchClass + shift) % 12),
      );
      const outcome = resolveSonority(shifted, ((2 + shift) % 12) as PitchClass);
      expect(outcome.kind).toBe("alternatives");
      if (outcome.kind !== "alternatives") continue;
      expect(outcome.totalMatches).toBe(2);
      expect(outcome.alternatives[0]?.formulaRuleId).toBe("seventh-minor");
      expect(outcome.alternatives[0]?.rootPitchClass).toBe(
        ((2 + shift) % 12) as PitchClass,
      );
      expect(outcome.alternatives[1]?.formulaRuleId).toBe("sixth-major");
      expect(outcome.alternatives[1]?.rootPitchClass).toBe(
        ((5 + shift) % 12) as PitchClass,
      );
    }
  });

  test("a rootless voicing resolves to what it literally contains", () => {
    const outcome = resolveSonority(asPitchClasses([2, 4, 7, 11]), 4);
    expect(outcome.kind).toBe("alternatives");
    if (outcome.kind !== "alternatives") return;
    /* Never a Cmaj9: the C is absent and is not invented. */
    for (const alternative of outcome.alternatives) {
      expect([2, 4, 7, 11]).toContain(alternative.rootPitchClass);
    }
  });
});
