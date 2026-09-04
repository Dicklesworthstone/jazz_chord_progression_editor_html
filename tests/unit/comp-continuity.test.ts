import { expect, test } from "bun:test";
import { compileStudioPlaybackPlan } from "../../src/application/studio-playback";
import { leadCompRegisters } from "../../src/playback/performance/comp-continuity";
import { compilePerformancePlan, type PlaybackEvent, type PerformanceRole } from "../../src/playback";
import { buildFrame } from "../support/progression-optimizer-test-kit";
import { musicalDocument } from "../support/studio-voice-leading";
import { required, soundedEdge } from "../support/progression-continuity";

const compiled = compileStudioPlaybackPlan(musicalDocument([["Cmaj7"]]));
if (!compiled.ok) throw new Error(compiled.refusal.code);
const base = required(compiled.plan.events, 0);

test("an unknown register policy refuses instead of silently using greedy placement", () => {
  const result = compilePerformancePlan({ plan: compiled.plan, styleId: "ballad-comp@1", compContinuityVersion: 3 as 2 });
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.refusal.code).toBe("performance.continuity_policy_invalid");
});

function event(notes: readonly number[], tick: number, gate = 792): PlaybackEvent {
  const [first, ...rest] = buildFrame("event-comp", "candidate-000", "balanced", notes).voices;
  return { ...base, pitches: [first.pitch, ...rest.map((v) => v.pitch)],
    midiPitches: [first.midi, ...rest.map((v) => v.midi)],
    startTick: tick as PlaybackEvent["startTick"], gateDurationTicks: gate as PlaybackEvent["gateDurationTicks"] };
}

test("whole-phrase register optimum beats greedy opening, with exhaustive choices and inverse transposition", () => {
  for (const shift of [0, 12, -12]) {
    const notes = [[48, 52, 55], [59, 63, 66], [58, 62, 65]].map((frame) => frame.map((n) => n + shift));
    const events = notes.map((frame, i) => event(frame, 960 * i));
    const register = { lowMidi: 48 + shift, highMidi: 71 + shift, ceilingMidi: 73 + shift };
    const result = leadCompRegisters(events, ["comp", "comp", "comp"], register);
    const actual = events.map((e, i) => {
      const placement = result.placements.get(i);
      if (!placement) throw new Error("Missing comp placement");
      expect(placement.dropCount).toBe(0);
      return e.midiPitches.map((n) => n + placement.shift * 12);
    });
    // Hand fixture: C4 -> B3 -> Bb3, three descending semitone lines.
    expect(actual.map((frame) => frame.map((n) => n - shift))).toEqual([[60,64,67],[59,63,66],[58,62,65]]);
    expect(result.evidence.alignmentCost).toBe(6);
    expect(result.evidence.gapCount).toBe(0);
    let enumeratedBest = Infinity;
    for (const a of [0, 12]) for (const b of [0, 12]) for (const c of [0, 12]) {
      const proposed = notes.map((frame, i) => frame.map((n) => n + required([a, b, c], i)));
      if (proposed.some((frame) => required(frame, frame.length - 1) > register.ceilingMidi)) continue;
      const cost = soundedEdge(required(proposed, 0), required(proposed, 1)).alignmentCost +
        soundedEdge(required(proposed, 1), required(proposed, 2)).alignmentCost;
      enumeratedBest = Math.min(enumeratedBest, cost);
    }
    expect(result.evidence.alignmentCost).toBe(enumeratedBest);
    expect(soundedEdge(required(notes, 0), required(notes, 1)).alignmentCost).toBeGreaterThan(6);
    expect(result.evidence.tracebackStates).toBeLessThanOrEqual(events.length * 2);
    expect(result.evidence.candidateTransitions).toBeLessThanOrEqual(events.length * 4);
    expect(result.evidence.alignmentCells).toBeLessThanOrEqual(result.evidence.candidateTransitions * 289);
  }
});

test("a bass attack later inside a comp gate constrains the whole sustained chord", () => {
  const events = [event([36], 0), event([48, 52, 55, 59], 0), event([48], 480)];
  const roles: readonly PerformanceRole[] = ["bass", "comp", "bass"];
  const result = leadCompRegisters(events, roles, { lowMidi: 48, highMidi: 71, ceilingMidi: 73 });
  expect(result.placements.get(1)).toEqual({ shift: 1, dropCount: 0 });
  expect(result.placements.has(0)).toBe(false);
  expect(result.placements.has(2)).toBe(false);
  // Negative twin: accepting only the bass at attack would choose C3=48,
  // exactly in unison with the bass which enters while the comp is held.
  expect(48 - 48).toBeLessThan(4);
  expect(48 + 12 - 48).toBeGreaterThanOrEqual(4);
  expect(result.evidence.bassOverlapChecks).toBe(2);
});

test("ceiling fallback drops only the lowest voices needed to clear held bass", () => {
  const result = leadCompRegisters([event([48], 0), event([48, 55, 59, 64], 0)], ["bass", "comp"],
    { lowMidi: 45, highMidi: 68, ceilingMidi: 73 });
  // Whole chord: bottom 48 crowds bass, lifted top 76 exceeds ceiling.
  // Top slice G3 B3 E4 clears both, preserving spelling and intervals.
  expect(result.placements.get(1)).toEqual({ shift: 0, dropCount: 1 });
  expect(result.evidence.placementChecks).toBe(4);
});
