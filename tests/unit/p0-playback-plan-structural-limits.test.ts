import { describe, expect, setDefaultTimeout, test } from "bun:test";

import { compilePlaybackPlan } from "../../src/playback/compile-playback-plan";
import {
  materializeP0LimitStructuralCase,
  p0LimitStructuralCase,
} from "../support/p0-playback-fixtures";

setDefaultTimeout(600_000);

function expectEvidenceSubset(
  actual: Readonly<Record<string, unknown>>,
  expected: Readonly<Record<string, unknown>>,
): void {
  for (const [counter, value] of Object.entries(expected)) {
    expect(actual[counter]).toEqual(value);
  }
}

function expectFixtureValue(actual: unknown, expected: unknown): void {
  expect(actual).toEqual(expected);
}

describe("P0 real structural playback-plan limits", () => {
  test("maximum events, pitches, and bindings compile; binding plus one refuses first", () => {
    const maximumEvents = p0LimitStructuralCase("P0-LIMIT-STRUCT-001");
    const maximumBindings = p0LimitStructuralCase("P0-LIMIT-STRUCT-005");
    const bindingPlusOne = p0LimitStructuralCase("P0-LIMIT-STRUCT-006");
    const materialized = materializeP0LimitStructuralCase(
      "P0-LIMIT-STRUCT-006",
    );

    expect(materialized.materializationKind).toBe(
      "post-publication-defensive-binding-plus-one",
    );
    expect(materialized.request.realizedVoicings.size).toBe(
      bindingPlusOne.expected.received,
    );

    const exactBindings = new Map(materialized.request.realizedVoicings);
    const appendedKey = [...exactBindings.keys()].find(
      (eventId) => eventId === bindingPlusOne.recipe.appendBinding.eventId,
    );
    if (appendedKey === undefined) {
      throw new Error("P0_LIMIT_STRUCT_006_APPENDED_BINDING_MISSING");
    }
    expect(exactBindings.delete(appendedKey)).toBe(true);
    expect(exactBindings.size).toBe(maximumBindings.expected.bindingCount);

    const exact = compilePlaybackPlan({
      ...materialized.request,
      realizedVoicings: exactBindings,
    });
    expect(exact.ok).toBe(true);
    if (!exact.ok) {
      throw new Error(`P0_LIMIT_STRUCT_EXACT:${exact.refusal.code}`);
    }
    expect(exact.plan.events).toHaveLength(
      maximumEvents.expected.eventCount,
    );
    expect(
      exact.plan.events.reduce(
        (count, event) => count + event.pitches.length,
        0,
      ),
    ).toBe(maximumEvents.expected.outputPitchCount);
    expectFixtureValue(
      exact.plan.totalBeats,
      maximumEvents.expected.totalBeats,
    );
    expectFixtureValue(
      exact.plan.totalTicks,
      maximumEvents.expected.totalTicks,
    );
    expectEvidenceSubset(
      exact.evidence,
      maximumEvents.expected.selectedEvidence,
    );

    const plusOne = compilePlaybackPlan(materialized.request);
    expect(plusOne.ok).toBe(false);
    if (plusOne.ok) {
      throw new Error("P0_LIMIT_STRUCT_006_EXPECTED_REFUSAL");
    }
    expectFixtureValue(plusOne.refusal, {
      code: bindingPlusOne.expected.code,
      path: bindingPlusOne.expected.path,
      received: bindingPlusOne.expected.received,
      maximum: bindingPlusOne.expected.maximum,
    });
    expect(plusOne.evidence.termination).toBe(
      bindingPlusOne.expected.termination,
    );
    expect("plan" in plusOne).toBe(false);
  });

  test("maximum measures compile with exact silent capacity and evidence", () => {
    const recipe = p0LimitStructuralCase("P0-LIMIT-STRUCT-002");
    const materialized = materializeP0LimitStructuralCase(recipe.id);
    const result = compilePlaybackPlan(materialized.request);

    expect(materialized.materializationKind).toBe("published-exact");
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(`${recipe.id}:${result.refusal.code}`);
    }
    expect(result.plan.events).toEqual(recipe.expected.events);
    expectFixtureValue(result.plan.totalBeats, recipe.expected.totalBeats);
    expectFixtureValue(result.plan.totalTicks, recipe.expected.totalTicks);
    expectEvidenceSubset(result.evidence, recipe.expected.selectedEvidence);
  });

  test("the exact one-million-beat timeline ceiling compiles", () => {
    const recipe = p0LimitStructuralCase("P0-LIMIT-STRUCT-003");
    const materialized = materializeP0LimitStructuralCase(recipe.id);
    const result = compilePlaybackPlan(materialized.request);

    expect(materialized.materializationKind).toBe("published-exact");
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(`${recipe.id}:${result.refusal.code}`);
    }
    expect(result.plan.events).toEqual(recipe.expected.events);
    expectFixtureValue(result.plan.totalBeats, recipe.expected.totalBeats);
    expectFixtureValue(result.plan.totalTicks, recipe.expected.totalTicks);
    expect(result.evidence.termination).toBe(recipe.expected.termination);
  });

  test("one beat beyond the ceiling refuses before a missing binding", () => {
    const recipe = p0LimitStructuralCase("P0-LIMIT-STRUCT-004");
    const materialized = materializeP0LimitStructuralCase(recipe.id);
    const result = compilePlaybackPlan(materialized.request);

    expect(materialized.materializationKind).toBe(
      "published-timeline-precedence",
    );
    expect(materialized.request.realizedVoicings.size).toBe(0);
    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error(`${recipe.id}:EXPECTED_REFUSAL`);
    }
    expectFixtureValue(result.refusal, {
      code: recipe.expected.code,
      path: recipe.expected.path,
      measureId: recipe.expected.measureId,
      maximumQuarterNoteBeats:
        recipe.expected.maximumQuarterNoteBeats,
    });
    expect(result.evidence.termination).toBe(recipe.expected.termination);
    expect("plan" in result).toBe(false);
  });
});
