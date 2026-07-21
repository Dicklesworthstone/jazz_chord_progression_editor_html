import { describe, expect, test } from "bun:test";

import {
  beatValueToMidiTicks,
  projectSpelledPitch,
  type BeatValue,
  type MidiTick,
} from "../../src/domain";
import {
  PLAYBACK_PLAN_MIDI_PPQ,
  compilePlaybackPlan,
  type PlaybackPlan,
} from "../../src/playback";
import {
  materializeP0LoopCase,
  materializeP0RealizationCase,
  materializeP0TimelineCase,
  materializeP0TimelinePair,
  p0LoopCase,
  p0RealizationCase,
  p0TimelineCase,
} from "../support/p0-playback-fixtures";

type JsonRecord = Record<string, unknown>;

const MIDI_TIMELINE_CASE_IDS = [
  "P0-TIME-002",
  "P0-TIME-003",
  "P0-TIME-004",
  "P0-TIME-005",
  "P0-TIME-006",
  "P0-TIME-007",
] as const;

const PITCH_CASE_IDS = [
  "P0-REAL-001",
  "P0-REAL-002",
  "P0-REAL-003",
  "P0-REAL-004",
] as const;

function requireRecord(value: unknown, label: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`P0_MIDI_RECORD:${label}`);
  }
  return value as JsonRecord;
}

function expectUnknownEqual(actual: unknown, expected: unknown): void {
  expect(actual).toEqual(expected);
}

function expectUnknownToBe(actual: unknown, expected: unknown): void {
  expect(actual).toBe(expected);
}

function ticks(value: BeatValue): MidiTick {
  const scaled = value.numerator * PLAYBACK_PLAN_MIDI_PPQ;
  expect(Number.isSafeInteger(scaled)).toBe(true);
  expect(scaled % value.denominator).toBe(0);
  return beatValueToMidiTicks(value);
}

function expectInteger(value: number): void {
  expect(Number.isSafeInteger(value)).toBe(true);
}

function expectExactMirrors(plan: PlaybackPlan): void {
  expect(plan.midiPpq).toBe(960);
  expectInteger(plan.totalTicks);
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
    for (const tickValue of [
      event.sourceStartTick,
      event.sourceDurationTicks,
      event.startTick,
      event.durationTicks,
      event.gateDurationTicks,
    ]) {
      expectInteger(tickValue);
    }
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

    const independentlyProjected = event.pitches.map((pitch) => {
      const projection = projectSpelledPitch(pitch);
      if (!projection.ok) {
        throw new Error(`P0_MIDI_PITCH:${projection.refusal.code}`);
      }
      return projection.value.midi;
    });
    expect(Array.from(event.midiPitches)).toEqual(independentlyProjected);
    event.midiPitches.forEach(expectInteger);
  }
}

describe("P0/verify exact PPQ and pitch mirrors", () => {
  test("2/2 through 6/8 and the one-tick witness match literal reviewed ticks", () => {
    expect(PLAYBACK_PLAN_MIDI_PPQ).toBe(960);
    for (const caseId of MIDI_TIMELINE_CASE_IDS) {
      const recipe = p0TimelineCase(caseId);
      const expectedPlan = recipe.expectedPlan;
      if (expectedPlan === undefined) {
        throw new Error(`${caseId}:P0_MIDI_EXPECTED_PLAN_MISSING`);
      }
      const expectedEvent = requireRecord(
        expectedPlan["singleEvent"],
        `${caseId}:singleEvent`,
      );
      const result = compilePlaybackPlan(
        materializeP0TimelineCase(caseId).request,
      );
      if (!result.ok) throw new Error(`${caseId}:${result.refusal.code}`);
      expectExactMirrors(result.plan);
      expectUnknownToBe(result.plan.totalTicks, expectedPlan["totalTicks"]);
      expectUnknownToBe(
        result.plan.events[0]?.durationTicks,
        expectedEvent["durationTicks"],
      );
      expectUnknownToBe(
        result.plan.events[0]?.gateDurationTicks,
        expectedEvent["gateTicks"],
      );
    }
  });

  test("P0-TIME-010 tempo variants preserve identical exact PPQ geometry", () => {
    const [lowRequest, highRequest] = materializeP0TimelinePair();
    const low = compilePlaybackPlan(lowRequest.request);
    const high = compilePlaybackPlan(highRequest.request);
    if (!low.ok || !high.ok) throw new Error("P0_TIME_010_MIDI_REFUSED");
    expectExactMirrors(low.plan);
    expectExactMirrors(high.plan);
    expect(low.plan.totalTicks).toBe(high.plan.totalTicks);
    expect(low.plan.events.map((event) => ({
      sourceStartTick: event.sourceStartTick,
      sourceDurationTicks: event.sourceDurationTicks,
      startTick: event.startTick,
      durationTicks: event.durationTicks,
      gateDurationTicks: event.gateDurationTicks,
      midiPitches: event.midiPitches,
    }))).toEqual(high.plan.events.map((event) => ({
      sourceStartTick: event.sourceStartTick,
      sourceDurationTicks: event.sourceDurationTicks,
      startTick: event.startTick,
      durationTicks: event.durationTicks,
      gateDurationTicks: event.gateDurationTicks,
      midiPitches: event.midiPitches,
    })));
  });

  test("full-loop and one-tick-clipped loop plans retain literal tick ranges", () => {
    for (const caseId of ["P0-LOOP-002", "P0-LOOP-009"] as const) {
      const result = compilePlaybackPlan(materializeP0LoopCase(caseId).request);
      if (!result.ok) throw new Error(`${caseId}:${result.refusal.code}`);
      expectExactMirrors(result.plan);
      expectUnknownEqual(
        result.plan.loopTicks,
        p0LoopCase(caseId).expected["loopTicks"],
      );
    }
    const clipped = compilePlaybackPlan(
      materializeP0LoopCase("P0-LOOP-009").request,
    );
    if (!clipped.ok) throw new Error(`P0-LOOP-009:${clipped.refusal.code}`);
    expectUnknownToBe(clipped.plan.events[0]?.durationTicks, 1);
    expectUnknownToBe(clipped.plan.events[0]?.gateDurationTicks, 1);
  });

  test("generated, Manual, Frozen, and Custom pitch arrays match literal written/MIDI pairs", () => {
    for (const caseId of PITCH_CASE_IDS) {
      const result = compilePlaybackPlan(
        materializeP0RealizationCase(caseId).request,
      );
      if (!result.ok) throw new Error(`${caseId}:${result.refusal.code}`);
      expectExactMirrors(result.plan);
      const expected = p0RealizationCase(caseId).expected;
      const event = result.plan.events[0];
      if (event === undefined) throw new Error(`${caseId}:P0_MIDI_EVENT_MISSING`);
      expectUnknownEqual(event.pitches, expected["pitches"]);
      expectUnknownEqual(event.midiPitches, expected["midiPitches"]);
    }
  });

  test("P0-REAL-017 refuses a candidate whose written and MIDI-authoritative voices diverge", () => {
    const expected = p0RealizationCase("P0-REAL-017").expected;
    const result = compilePlaybackPlan(
      materializeP0RealizationCase("P0-REAL-017").request,
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("P0_REAL_017_PITCH_MISMATCH_ACCEPTED");
    expectUnknownEqual(result.refusal, {
      code: expected["code"],
      path: expected["path"],
      eventId: expected["eventId"],
      pitchOrdinal: expected["pitchOrdinal"],
    });
    expect("plan" in result).toBe(false);
  });

  test("P0-REAL-021 refuses the non-PPQ-integral near miss instead of rounding", () => {
    const result = compilePlaybackPlan(
      materializeP0RealizationCase("P0-REAL-021").request,
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("P0_REAL_021_NONINTEGRAL_ACCEPTED");
    expect(result.refusal.code).toBe("playback.gate_not_midi_integral");
    expect(result.refusal.path).toEqual([
      "document",
      "sections",
      0,
      "measures",
      0,
      "events",
      0,
      "duration",
    ]);
    expect(result.evidence.termination).toBe("gate-invalid");
    expect("plan" in result).toBe(false);
  });
});
