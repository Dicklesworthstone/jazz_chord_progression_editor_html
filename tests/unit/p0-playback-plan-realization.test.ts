import { describe, expect, test } from "bun:test";

import { compilePlaybackPlan } from "../../src/playback/compile-playback-plan";
import {
  P0_REALIZATION_CASES,
  materializeP0RealizationCase,
} from "../support/p0-playback-fixtures";

type JsonRecord = Record<string, unknown>;

const EXPECTED_META_KEYS = new Set([
  "ok",
  "code",
  "path",
  "termination",
  "partialResult",
  "fallbackPitchesForbidden",
  "automaticGenerationForbidden",
  "candidateVoicePitchEqualityRequired",
  "deduplicateForbidden",
  "generatedByAffectsPitches",
  "pitchSource",
  "regenerationForbidden",
  "sortForbidden",
]);

function asRecord(value: unknown, label: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`P0_REALIZATION_RECORD:${label}`);
  }
  return value as JsonRecord;
}

function expectUnknownEqual(actual: unknown, expected: unknown): void {
  expect(actual).toEqual(expected);
}

function expectUnknownToBe(actual: unknown, expected: unknown): void {
  expect(actual).toBe(expected);
}

describe("P0 exact realization bindings and refusal precedence", () => {
  for (const recipe of P0_REALIZATION_CASES) {
    test(`${recipe.id} matches the reviewed realization result`, () => {
      const materialized = materializeP0RealizationCase(recipe.id);
      const result = compilePlaybackPlan(materialized.request);
      const expected = recipe.expected;
      expectUnknownToBe(result.ok, expected["ok"]);

      if (expected["ok"] === true) {
        if (!result.ok) throw new Error(`${recipe.id}:${result.refusal.code}`);
        expect(result.plan.events).toHaveLength(1);
        const event = result.plan.events[0];
        if (event === undefined) {
          throw new Error(`${recipe.id}:PLAYBACK_EVENT_MISSING`);
        }
        expectUnknownEqual(event.pitches, expected["pitches"]);
        expectUnknownEqual(event.midiPitches, expected["midiPitches"]);
        expect(result.evidence.termination).toBe("complete");
        return;
      }

      if (result.ok) throw new Error(`${recipe.id}:EXPECTED_REFUSAL`);
      expectUnknownToBe(result.refusal.code, expected["code"]);
      expectUnknownEqual(result.refusal.path, expected["path"]);
      const refusal = asRecord(result.refusal, `${recipe.id} refusal`);
      for (const [key, value] of Object.entries(expected)) {
        if (!EXPECTED_META_KEYS.has(key) && key in refusal) {
          expect(refusal[key]).toEqual(value);
        }
      }
      expectUnknownToBe(
        result.evidence.termination,
        expected["termination"],
      );
      expect("plan" in result).toBe(false);
    });
  }

  test("missing binding wins over an independently present extra binding", () => {
    const materialized = materializeP0RealizationCase("P0-REAL-022");
    const result = compilePlaybackPlan(materialized.request);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("P0_REAL_022_EXPECTED_REFUSAL");
    expect(asRecord(result.refusal, "P0-REAL-022")).toEqual({
      code: "playback.realization_binding_missing",
      path: ["realizedVoicings", "event-p0-realization"],
      eventId: "event-p0-realization",
    });
  });
});
