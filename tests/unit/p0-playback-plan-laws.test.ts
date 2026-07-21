import { describe, expect, test } from "bun:test";

import {
  beatValueToMidiTicks,
  projectSpelledPitch,
  type BeatValue,
  type MidiTick,
} from "../../src/domain";
import {
  PLAYBACK_EVENT_OWN_KEY_ORDER,
  PLAYBACK_PLAN_OWN_KEY_ORDER,
  type CompilePlaybackPlanRequest,
  type PlaybackPlan,
} from "../../src/playback";
import { compilePlaybackPlan } from "../../src/playback/compile-playback-plan";
import {
  materializeP0LoopCase,
  materializeP0TimelineCase,
} from "../support/p0-playback-fixtures";

function requestBytes(request: CompilePlaybackPlanRequest): string {
  return JSON.stringify({
    ...request,
    realizedVoicings: [...request.realizedVoicings],
  });
}

function recursivelyFrozen(value: unknown): boolean {
  const pending: unknown[] = [value];
  const seen = new Set<object>();
  while (pending.length > 0) {
    const current = pending.pop();
    if (typeof current !== "object" || current === null || seen.has(current)) {
      continue;
    }
    seen.add(current);
    if (!Object.isFrozen(current)) return false;
    for (const child of Object.values(current)) pending.push(child);
  }
  return true;
}

function ticks(value: BeatValue): MidiTick {
  const scaled = value.numerator * 960;
  expect(scaled % value.denominator).toBe(0);
  return beatValueToMidiTicks(value);
}

function expectExactMirrors(plan: PlaybackPlan): void {
  expect(plan.totalTicks).toBe(ticks(plan.totalBeats));
  if (plan.loop === null) {
    expect(plan.loopTicks).toBeNull();
  } else {
    expect(plan.loopTicks).toEqual({
      start: ticks(plan.loop.start),
      end: ticks(plan.loop.end),
    });
  }
  for (const event of plan.events) {
    expect(event.sourceStartTick).toBe(ticks(event.sourceStartBeat));
    expect(event.sourceDurationTicks).toBe(ticks(event.sourceDurationBeats));
    expect(event.startTick).toBe(ticks(event.startBeat));
    expect(event.durationTicks).toBe(ticks(event.durationBeats));
    expect(event.gateDurationTicks).toBe(ticks(event.gateDurationBeats));
    expect(event.sourceOffsetTicks === null).toBe(
      event.sourceOffsetBeats === null,
    );
    if (event.sourceOffsetBeats !== null) {
      expect(event.sourceOffsetTicks).toBe(ticks(event.sourceOffsetBeats));
    }
    expect(Array.from(event.midiPitches)).toEqual(
      event.pitches.map((pitch) => {
        const projection = projectSpelledPitch(pitch);
        if (!projection.ok) {
          throw new Error(`P0_LAW_PITCH:${projection.refusal.code}`);
        }
        return projection.value.midi;
      }),
    );
  }
}

describe("P0 playback-plan determinism and immutability laws", () => {
  test("repeated compilation is byte-stable with exact own-key order", () => {
    const fixture = materializeP0TimelineCase("P0-TIME-001");
    const results = Array.from({ length: 3 }, () =>
      compilePlaybackPlan(fixture.request)
    );
    for (const result of results) expect(result.ok).toBe(true);
    if (results.some((result) => !result.ok)) {
      throw new Error("P0_LAW_DETERMINISM_REFUSED");
    }
    const successes = results.filter(
      (result): result is Extract<typeof result, { ok: true }> => result.ok,
    );
    expect(new Set(successes.map((result) => JSON.stringify(result))).size).toBe(
      1,
    );
    const first = successes[0];
    if (first === undefined) throw new Error("P0_LAW_RESULT_MISSING");
    expect(Object.keys(first.plan)).toEqual([...PLAYBACK_PLAN_OWN_KEY_ORDER]);
    for (const event of first.plan.events) {
      expect(Object.keys(event)).toEqual([...PLAYBACK_EVENT_OWN_KEY_ORDER]);
    }
  });

  test("compilation leaves inputs unchanged and owns a recursively frozen graph", () => {
    const fixture = materializeP0TimelineCase("P0-TIME-001");
    const before = requestBytes(fixture.request);
    const result = compilePlaybackPlan(fixture.request);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`P0_LAW_IMMUTABLE:${result.refusal.code}`);
    expect(requestBytes(fixture.request)).toBe(before);
    expect(recursivelyFrozen(result)).toBe(true);
    expect(result.plan.meter).not.toBe(fixture.document.meter);
    expect(result.plan.events).not.toBe(fixture.document.sections);

    for (const event of result.plan.events) {
      const binding = fixture.realizedVoicings.get(event.eventId);
      if (binding === undefined) throw new Error("P0_LAW_BINDING_MISSING");
      const sourcePitches =
        binding.kind === "generated" && binding.outcome.ok
          ? binding.outcome.candidate.pitches
          : binding.kind === "stored"
            ? binding.result.voicing.pitches
            : null;
      if (sourcePitches === null) throw new Error("P0_LAW_PITCH_SOURCE");
      expect(event.pitches).not.toBe(sourcePitches);
      event.pitches.forEach((pitch, index) => {
        expect(pitch).not.toBe(sourcePitches[index]);
      });
    }

    const bytes = JSON.stringify(result);
    expect(Reflect.set(result.plan.events, 0, null)).toBe(false);
    expect(JSON.stringify(result)).toBe(bytes);
    expect(requestBytes(fixture.request)).toBe(before);
  });

  test("all ordinary and one-tick clipped values have exact PPQ mirrors", () => {
    for (const caseId of ["P0-TIME-001", "P0-LOOP-009"] as const) {
      const request =
        caseId === "P0-TIME-001"
          ? materializeP0TimelineCase(caseId).request
          : materializeP0LoopCase(caseId).request;
      const result = compilePlaybackPlan(request);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(`${caseId}:${result.refusal.code}`);
      expectExactMirrors(result.plan);
    }
  });

  test("irrelevant metadata edits do not stale bindings or change a plan", () => {
    const fixture = materializeP0TimelineCase("P0-TIME-001");
    const baseline = compilePlaybackPlan(fixture.request);
    if (!baseline.ok) throw new Error(`P0_LAW_METADATA:${baseline.refusal.code}`);

    const changed = structuredClone(fixture.request);
    expect(
      Reflect.set(changed.document, "title", "Different reviewed title"),
    ).toBe(true);
    expect(
      Reflect.set(changed.document, "description", "Different description"),
    ).toBe(true);
    const section = changed.document.sections[0];
    const measure = section?.measures[0];
    const event = measure?.events[0];
    if (section === undefined || measure === undefined || event === undefined) {
      throw new Error("P0_LAW_METADATA_SOURCE_MISSING");
    }
    expect(Reflect.set(section, "name", "Renamed")).toBe(true);
    expect(Reflect.set(section, "annotation", "Section note")).toBe(true);
    expect(Reflect.set(event, "annotation", "Event note")).toBe(true);
    expect(Reflect.set(changed.document.playback, "masterVolume", 0.25)).toBe(
      true,
    );
    expect(Reflect.set(changed.document.playback, "reverbAmount", 0.75)).toBe(
      true,
    );

    const result = compilePlaybackPlan(changed);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`P0_LAW_METADATA:${result.refusal.code}`);
    expect(result.plan).toEqual(baseline.plan);
    expect(result.evidence).toEqual(baseline.evidence);
  });
});
