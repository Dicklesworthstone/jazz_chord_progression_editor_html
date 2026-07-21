import { expect, test } from "bun:test";

import {
  projectSpelledPitch,
  type SpelledPitch,
} from "../../src/domain";
import { compilePlaybackPlan } from "../../src/playback";
import {
  canonicalP0Json,
  materializeP0TranspositionPair,
  observeP0Case,
  requireP0Array,
  requireP0Record,
} from "../support/p0-conformance";

const PLAN_RELATION_FIELDS = new Set([
  "sourceDocumentId",
  "midiPpq",
  "tempoBpm",
  "meter",
  "totalBeats",
  "totalTicks",
  "loop",
  "loopTicks",
]);

const REVIEWED_INVERSE_WHOLE_STEP: Readonly<Record<string, SpelledPitch>> =
  Object.freeze({
    "D:0:3": Object.freeze({ step: "C", alter: 0, octave: 3 }),
    "A:0:3": Object.freeze({ step: "G", alter: 0, octave: 3 }),
    "C:1:4": Object.freeze({ step: "B", alter: 0, octave: 3 }),
    "F:1:4": Object.freeze({ step: "E", alter: 0, octave: 4 }),
  });

function inverseReviewedWholeStep(pitch: SpelledPitch): SpelledPitch {
  const key = `${pitch.step}:${String(pitch.alter)}:${String(pitch.octave)}`;
  const result = REVIEWED_INVERSE_WHOLE_STEP[key];
  if (result === undefined) throw new Error(`P0_LAW_004_INVERSE:${key}`);
  return result;
}

test("P0-LAW-004 preserves exact spelling and every nonpitch relation field", () => {
  const pair = materializeP0TranspositionPair();
  const base = compilePlaybackPlan(pair.base);
  const transposed = compilePlaybackPlan(pair.transposed);
  if (!base.ok || !transposed.ok) {
    throw new Error("P0_LAW_004_COMPILE_REFUSAL");
  }

  const baseExpected = requireP0Record(pair.law["base"], "P0-LAW-004.base");
  const transposedExpected = requireP0Record(
    pair.law["transposed"],
    "P0-LAW-004.transposed",
  );
  const relation = requireP0Record(
    pair.law["expectedRelation"],
    "P0-LAW-004.expectedRelation",
  );
  const baseEvent = base.plan.events[0];
  const transposedEvent = transposed.plan.events[0];
  if (baseEvent === undefined || transposedEvent === undefined) {
    throw new Error("P0_LAW_004_EVENT_MISSING");
  }

  expect(canonicalP0Json(baseEvent.pitches)).toBe(
    canonicalP0Json(baseExpected["pitches"]),
  );
  expect(canonicalP0Json(baseEvent.midiPitches)).toBe(
    canonicalP0Json(baseExpected["midiPitches"]),
  );
  expect(canonicalP0Json(transposedEvent.pitches)).toBe(
    canonicalP0Json(transposedExpected["pitches"]),
  );
  expect(canonicalP0Json(transposedEvent.midiPitches)).toBe(
    canonicalP0Json(transposedExpected["midiPitches"]),
  );

  const equalFields = requireP0Array(
    relation["equalFields"],
    "P0-LAW-004.equalFields",
  );
  for (const fieldValue of equalFields) {
    if (typeof fieldValue !== "string") {
      throw new TypeError("P0_LAW_004_EQUAL_FIELD");
    }
    if (PLAN_RELATION_FIELDS.has(fieldValue)) {
      expect(
        requireP0Record(base.plan, "base plan")[fieldValue],
        fieldValue,
      ).toEqual(requireP0Record(transposed.plan, "transposed plan")[fieldValue]);
    } else {
      expect(
        requireP0Record(baseEvent, "base event")[fieldValue],
        fieldValue,
      ).toEqual(
        requireP0Record(transposedEvent, "transposed event")[fieldValue],
      );
    }
  }

  const midiDelta = relation["midiDelta"];
  expect(midiDelta).toBe(2);
  expect(transposedEvent.midiPitches.map(Number)).toEqual(
    baseEvent.midiPitches.map((midi) => Number(midi) + 2),
  );
  expect(
    canonicalP0Json(transposedEvent.pitches.map(inverseReviewedWholeStep)),
  ).toBe(
    canonicalP0Json(baseEvent.pitches),
  );
});

test("P0-LAW-004 near miss rejects enharmonic equality as spelling equality", () => {
  const pair = materializeP0TranspositionPair();
  const result = compilePlaybackPlan(pair.transposed);
  if (!result.ok) throw new Error("P0_LAW_004_NEAR_MISS_REFUSAL");
  const event = result.plan.events[0];
  if (event === undefined) throw new Error("P0_LAW_004_NEAR_MISS_EVENT");

  const nearMiss = requireP0Record(
    pair.law["nearMiss"],
    "P0-LAW-004.nearMiss",
  );
  const wrong = requireP0Record(
    nearMiss["wrongTransposedPitch"],
    "P0-LAW-004.wrongTransposedPitch",
  ) as SpelledPitch;
  const expected = event.pitches[2];
  if (expected === undefined) throw new Error("P0_LAW_004_C_SHARP_MISSING");
  const wrongProjection = projectSpelledPitch(wrong);
  const expectedProjection = projectSpelledPitch(expected);
  if (!wrongProjection.ok || !expectedProjection.ok) {
    throw new Error("P0_LAW_004_NEAR_MISS_PROJECTION");
  }

  expect(nearMiss["sameMidiAsExpectedPitch"]).toBe(true);
  expect(canonicalP0Json(wrong)).not.toBe(canonicalP0Json(expected));
  expect(wrongProjection.value.midi).toBe(expectedProjection.value.midi);
});

test("P0-LAW-004 literal observation is digest-equal to its fixture", () => {
  const observation = observeP0Case("P0-LAW-004");
  expect(observation.actualProjectionSha256).toBe(
    observation.expectedProjectionSha256,
  );
});
