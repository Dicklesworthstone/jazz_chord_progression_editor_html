import { expect, test } from "bun:test";
import { beatValueToMidiTicks, makeBeatDuration, makeBeatPosition, makeBeatRange, parseStableId, makeSpelledPitch, projectSpelledPitch } from "../../src/domain";
import { projectPlaybackPlanLoop, type PlaybackEvent, type PlaybackPlan } from "../../src/playback";
import { compileStudioPlaybackPlan } from "../../src/application/studio-playback";
import { musicalDocument } from "../support/studio-voice-leading";
import cases from "../fixtures/rehearsal/cases.json";

function position(ticks: number) {
  const result = makeBeatPosition({ numerator: ticks, denominator: 960 });
  if (!result.ok) throw new Error(result.refusal.code); return result.value;
}
function duration(ticks: number) {
  const result = makeBeatDuration({ numerator: ticks, denominator: 960 });
  if (!result.ok) throw new Error(result.refusal.code); return result.value;
}
function summary(e: PlaybackEvent): { start: number; duration: number; gate: number; offset: number | null; articulation: string } {
  return { start: e.startTick, duration: e.durationTicks, gate: e.gateDurationTicks, offset: e.sourceOffsetTicks, articulation: e.articulation };
}
function range(start: number, end: number) {
  const result = makeBeatRange(position(start), position(end));
  if (!result.ok) throw new Error(result.refusal.code); return result.value;
}
const compiled = compileStudioPlaybackPlan(musicalDocument([["Cmaj7"], ["Dm7"]]));
if (!compiled.ok) throw new Error(compiled.refusal.code);
const base = compiled.plan;
function event(row: { id: string; start: number; duration: number; offset: number | null }, ordinal: number): PlaybackEvent {
  const first = base.events[0]; if (!first) throw new Error("Missing source event");
  const id = parseStableId("event", row.id); if (!id.ok) throw new Error(id.refusal.code);
  const startBeat = position(row.start), durationBeats = duration(row.duration);
  const gateDurationBeats = duration(Math.max(1, row.duration - 24));
  return Object.freeze({ ...first, eventId: id.value, ordinal, sourceOrdinal: ordinal,
    startBeat, durationBeats, gateDurationBeats,
    startTick: beatValueToMidiTicks(startBeat), durationTicks: beatValueToMidiTicks(durationBeats),
    gateDurationTicks: beatValueToMidiTicks(gateDurationBeats),
    sourceOffsetBeats: row.offset === null ? null : duration(row.offset),
    sourceOffsetTicks: row.offset === null ? null : beatValueToMidiTicks(duration(row.offset)),
  });
}
const source: PlaybackPlan = Object.freeze({ ...base, events: Object.freeze(cases.projection.events.map(event)) });
const selected = range(960, 2880);

test("independent pre-production interval fixtures preserve exact fields and source offsets", () => {
  const before = JSON.stringify(source);
  const result = projectPlaybackPlanLoop(source, selected);
  expect(result.ok).toBe(true); if (!result.ok) throw new Error(result.refusal.code);
  expect(result.plan.events.map<string>(row => row.eventId)).toEqual(cases.projection.retainedIds);
  expect(result.evidence).toEqual({ inputEventsVisited: 6, projectedEvents: 4, retainedPitchSlots: 16 });
  for (const [index, actual] of result.plan.events.entries()) {
    const row = cases.projection.events.find(candidate => candidate.id === actual.eventId);
    const original = source.events.find(candidate => candidate.eventId === actual.eventId);
    if (!row || row.expected === null || !original) throw new Error("Fixture event missing");
    expect(summary(actual)).toEqual(row.expected);
    expect(actual.ordinal).toBe(index);
    expect(beatValueToMidiTicks(actual.startBeat)).toBe(actual.startTick);
    expect(beatValueToMidiTicks(actual.durationBeats)).toBe(actual.durationTicks);
    expect(beatValueToMidiTicks(actual.gateDurationBeats)).toBe(actual.gateDurationTicks);
    expect(actual.sourceStartBeat).toBe(original.sourceStartBeat);
    expect(actual.sourceDurationBeats).toBe(original.sourceDurationBeats);
    expect(actual.sourceOrdinal).toBe(original.sourceOrdinal);
    expect(actual.pitches).toBe(original.pitches); expect(actual.midiPitches).toBe(original.midiPitches);
    expect(Object.isFrozen(actual)).toBe(true);
  }
  expect<number>(result.plan.totalTicks).toBe(7680); expect(result.plan.totalBeats).toBe(source.totalBeats);
  expect(result.plan.sourceDocumentId).toBe(source.sourceDocumentId);
  expect({ start: Number(result.plan.loopTicks?.start), end: Number(result.plan.loopTicks?.end) }).toEqual({ start: 960, end: 2880 });
  expect(JSON.stringify(source)).toBe(before);
});
for (const row of cases.projection.extraEdges) test(`independent ${row.id} boundary`, () => {
  const result = projectPlaybackPlanLoop({ ...base, events: [event(row, 0)] }, selected);
  if (!result.ok) throw new Error(result.refusal.code);
  const actual = result.plan.events[0]; if (!actual) throw new Error("Expected intersection");
  expect(summary(actual)).toEqual(row.expected);
});
test("silence stays empty; boundaries do not borrow the nearest chord", () => {
  const result = projectPlaybackPlanLoop({ ...base, events: [event({ id: "before", start: 0, duration: 960, offset: null }, 0)] }, selected);
  expect(result.ok).toBe(true); if (result.ok) expect(result.plan.events).toEqual([]);
});
test("out of range and previously clipped inputs refuse rather than reset source phase", () => {
  expect(projectPlaybackPlanLoop(base, range(0, 7681)).ok).toBe(false);
  const projected = projectPlaybackPlanLoop(base, selected); if (!projected.ok) throw new Error(projected.refusal.code);
  expect(projectPlaybackPlanLoop(projected.plan, selected).ok).toBe(false);
});
test("bounded visits accept 65536 events and refuse 65537 before traversing", () => {
  const row = source.events[0]; if (!row) throw new Error("Missing fixture");
  const at = projectPlaybackPlanLoop({ ...base, events: Array<PlaybackEvent>(65536).fill(row) }, range(0, 960));
  expect(at.ok).toBe(true); expect(at.evidence.inputEventsVisited).toBe(65536);
  const over = projectPlaybackPlanLoop({ ...base, events: Array<PlaybackEvent>(65537).fill(row) }, range(0, 960));
  expect(over.ok).toBe(false); expect(over.evidence.inputEventsVisited).toBe(0);
});

test("twelve spelled transpositions preserve all sixteen ordered pitch references including unisons", () => {
  const roots = [["C", 0], ["D", -1], ["D", 0], ["E", -1], ["E", 0], ["F", 0], ["F", 1], ["G", 0], ["A", -1], ["A", 0], ["B", -1], ["B", 0]] as const;
  for (const [step, alter] of roots) {
    const low = makeSpelledPitch({ step, alter, octave: 4 }), high = makeSpelledPitch({ step, alter, octave: 5 });
    if (!low.ok || !high.ok) throw new Error("Invalid independent pitch");
    const pitches = Object.freeze([low.value, ...Array.from({ length: 15 }, (_, i) => i % 3 === 0 ? low.value : high.value)] as const);
    const midi = (pitch: typeof low.value) => {
      const projected = projectSpelledPitch(pitch); if (!projected.ok) throw new Error(projected.refusal.code); return projected.value.midi;
    };
    const midiPitches = Object.freeze([midi(low.value), ...pitches.slice(1).map(midi)] as const);
    const row = source.events[1]; if (!row) throw new Error("Missing intersecting source");
    const original = { ...row, pitches, midiPitches };
    const result = projectPlaybackPlanLoop({ ...base, events: [original] }, selected);
    if (!result.ok) throw new Error(result.refusal.code);
    expect(result.plan.events[0]?.pitches).toBe(pitches);
    expect(result.plan.events[0]?.midiPitches).toBe(midiPitches);
    expect(result.evidence.retainedPitchSlots).toBe(16);
    expect(midiPitches.every(value => Number.isInteger(value) && value >= 60 && value <= 83)).toBe(true);
    expect(original.pitches[1]).toBe(original.pitches[0]);
  }
});
