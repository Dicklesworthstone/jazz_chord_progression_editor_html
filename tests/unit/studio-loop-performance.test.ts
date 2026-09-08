import { expect, test } from "bun:test";
import { compileStudioPlaybackPlan, performStudioPlaybackPlan, performStudioPlaybackRange, studioSectionLoopRange } from "../../src/application/studio-playback";
import { PERFORMANCE_STYLE_IDS, compilePerformancePlan } from "../../src/playback";
import { makeBeatPosition, makeBeatRange, beatValueToMidiTicks } from "../../src/domain";
import { musicalDocument } from "../support/studio-voice-leading";
import { publishA0Candidate } from "../support/a0-application-fixture";

const document = musicalDocument([["Cmaj7"], ["Dm7"], ["G7"], ["Cmaj7"]]);
const compiled = compileStudioPlaybackPlan(document); if (!compiled.ok) throw new Error(compiled.refusal.code);
const full = compiled.plan;
function range(start: number, end: number) {
  const a = makeBeatPosition({ numerator: start, denominator: 960 }), b = makeBeatPosition({ numerator: end, denominator: 960 });
  if (!a.ok || !b.ok) throw new Error("Invalid fixture position");
  const r = makeBeatRange(a.value, b.value); if (!r.ok) throw new Error(r.refusal.code); return r.value;
}
for (const style of PERFORMANCE_STYLE_IDS) test(`${style}: whole and interior loop retain the full-chart arrangement`, () => {
  const played = performStudioPlaybackPlan(full, style);
  const unchanged = performStudioPlaybackRange(full, null, style); if (!unchanged.ok) throw new Error(unchanged.refusal.code);
  expect(unchanged.plan).toEqual(played);
  for (const [left, right] of [[0, 15360], [3840, 11520], [4260, 6030]] as const) {
    const projected = performStudioPlaybackRange(full, range(left, right), style); if (!projected.ok) throw new Error(projected.refusal.code);
    // Independent arithmetic over a FULL source performance. This is a
    // context-preservation relation, not a musical-style golden from output.
    const expected = played.events.filter(e => e.startTick < right && e.startTick + e.durationTicks > left).map(e => ({
      id: e.eventId, start: Math.max(left, e.startTick), duration: Math.min(right, e.startTick + e.durationTicks) - Math.max(left, e.startTick),
      pitches: e.pitches, midi: e.midiPitches, velocity: e.velocity,
    }));
    expect(projected.plan.events.map(e => ({ id: e.eventId, start: Number(e.startTick), duration: Number(e.durationTicks),
      pitches: e.pitches, midi: e.midiPitches, velocity: e.velocity }))).toEqual(expected);
    expect<number>(projected.plan.totalTicks).toBe(15360);
  }
});
test("low-level groove refusal remains intact for a clipped input", () => {
  const clipped = compileStudioPlaybackPlan(document, range(3840, 7680)); if (!clipped.ok) throw new Error(clipped.refusal.code);
  const refused = compilePerformancePlan({ plan: clipped.plan, styleId: "ballad-comp@1" });
  expect(refused.ok).toBe(false); if (!refused.ok) expect(refused.refusal.code).toBe("performance.loop_unsupported");
  expect(performStudioPlaybackRange(clipped.plan, range(3840, 7680)).ok).toBe(false);
});
test("section boundaries retain pickup and leading/trailing silent bars", () => {
  const section = document.sections[0]; if (!section) throw new Error("Missing section");
  const bar = section.measures[0]; if (!bar) throw new Error("Missing measure");
  const picked = publishA0Candidate({ ...document, sections: [
    { ...section, id: "intro", measures: [{ ...bar, id: "pickup", completion: { kind: "pickup", expectedDuration: { numerator: 3, denominator: 2 }, reason: "Three-eighth pickup" },
      events: bar.events.map(e => ({ ...e, duration: { numerator: 3, denominator: 2 } })) }] },
    { ...section, id: "passage", measures: [{ id: "rest-first", completion: { kind: "empty" }, events: [] },
      section.measures[1], { id: "rest-last", completion: { kind: "empty" }, events: [] }] },
    { ...section, id: "after", measures: [section.measures[2]] },
    { ...section, id: "empty-section", measures: [] },
  ] });
  const r = studioSectionLoopRange(picked, "passage"); if (r === null) throw new Error("Missing passage");
  expect<number[]>([beatValueToMidiTicks(r.start), beatValueToMidiTicks(r.end)]).toEqual([1440, 12960]);
  expect(studioSectionLoopRange(picked, "empty-section")).toBeNull();
  expect(studioSectionLoopRange(picked, "missing")).toBeNull();
  const literal = compileStudioPlaybackPlan(picked); if (!literal.ok) throw new Error(literal.refusal.code);
  const played = performStudioPlaybackRange(literal.plan, r); if (!played.ok) throw new Error(played.refusal.code);
  expect(played.plan.events.every(e => e.startTick >= 5280 && e.startTick < 9120)).toBe(true);
  expect(played.plan.events.length).toBeGreaterThan(1);
});
