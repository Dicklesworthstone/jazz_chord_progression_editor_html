import { expect, test } from "bun:test";

import { compilePlaybackPlan } from "../../src/playback";
import {
  canonicalP0Json,
  observeP0Case,
  observeP0StoredAliasLaw,
  p0FixtureCase,
  requireP0Record,
} from "../support/p0-conformance";
import {
  materializeP0RealizationCase,
  p0RealizationCase,
} from "../support/p0-playback-fixtures";

for (const caseId of ["P0-REAL-002", "P0-REAL-003"] as const) {
  test(`P0-LAW-005 ${caseId} preserves stored spelling, register, order, and doubling`, () => {
    const fixture = materializeP0RealizationCase(caseId);
    const expected = p0RealizationCase(caseId).expected;
    const result = compilePlaybackPlan(fixture.request);
    if (!result.ok) throw new Error(`${caseId}:${result.refusal.code}`);
    const event = result.plan.events[0];
    if (event === undefined) throw new Error(`${caseId}:EVENT_MISSING`);
    const binding = fixture.request.realizedVoicings.get(event.eventId);
    if (binding?.kind !== "stored") {
      throw new Error(`${caseId}:STORED_BINDING_MISSING`);
    }
    const storedPitches = binding.result.voicing.pitches;

    expect(canonicalP0Json(event.pitches)).toBe(
      canonicalP0Json(expected["pitches"]),
    );
    expect(canonicalP0Json(event.midiPitches)).toBe(
      canonicalP0Json(expected["midiPitches"]),
    );
    expect(event.pitches).toEqual(storedPitches);
    expect(event.pitches).not.toBe(storedPitches);
    expect(event.pitches).toHaveLength(storedPitches.length);
    storedPitches.forEach((pitch, index) => {
      expect(event.pitches[index]).toEqual(pitch);
    });
  });
}

test("P0-LAW-005 kills the reviewed sorted and deduplicated Manual near miss", () => {
  const manual = compilePlaybackPlan(
    materializeP0RealizationCase("P0-REAL-002").request,
  );
  if (!manual.ok) throw new Error("P0_LAW_005_MANUAL_REFUSAL");
  const event = manual.plan.events[0];
  if (event === undefined) throw new Error("P0_LAW_005_MANUAL_EVENT");
  const law = p0FixtureCase("P0-LAW-005").row;
  const nearMiss = requireP0Record(law["nearMiss"], "P0-LAW-005.nearMiss");

  expect(event.pitches[1]).toEqual(event.pitches[4]);
  expect(event.midiPitches.map(Number)).toEqual([71, 64, 67, 60, 64]);
  expect(event.midiPitches).not.toEqual(nearMiss["wrongOutputMidiPitches"]);
  expect([...event.midiPitches].sort((left, right) => left - right)).not.toEqual(
    event.midiPitches,
  );
  expect(new Set(event.midiPitches).size).toBeLessThan(
    event.midiPitches.length,
  );
});

test("P0-LAW-007 stored aliases stay exact while generated aliases refuse", () => {
  const law = p0FixtureCase("P0-LAW-007").row;
  const nearMiss = requireP0Record(law["nearMiss"], "P0-LAW-007.nearMiss");
  const results = observeP0StoredAliasLaw();
  if (!results.baseResult.ok || !results.aliasResult.ok) {
    throw new Error("P0_LAW_007_STORED_REFUSAL");
  }
  if (results.generatedNearMiss.ok) {
    throw new Error("P0_LAW_007_GENERATED_ACCEPTED");
  }

  expect(canonicalP0Json(results.aliasResult.plan)).toBe(
    canonicalP0Json(results.baseResult.plan),
  );
  expect(canonicalP0Json(results.aliasResult.plan.events[0]?.pitches)).toBe(
    canonicalP0Json(p0RealizationCase("P0-REAL-002").expected["pitches"]),
  );
  expect(results.generatedNearMiss.refusal.code as unknown).toBe(
    nearMiss["expectedCode"],
  );
  expect("plan" in results.generatedNearMiss).toBe(false);
});

for (const lawId of ["P0-LAW-005", "P0-LAW-007"] as const) {
  test(`${lawId} literal law observation is digest-equal to its fixture`, () => {
    const observation = observeP0Case(lawId);
    expect(observation.actualProjectionSha256).toBe(
      observation.expectedProjectionSha256,
    );
  });
}
