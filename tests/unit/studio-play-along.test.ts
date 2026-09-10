import { expect, test } from "bun:test";
import { buildPlayAlongTimeline, readPlayAlongTimeline } from "../../src/application/studio-play-along";
import { makeBeatPosition, makeBeatRange } from "../../src/domain";
import { musicalDocument } from "../support/studio-voice-leading";
import { publishA0Candidate } from "../support/a0-application-fixture";
import cases from "../fixtures/play-along/cases.json";

const source = musicalDocument([["Cmaj7", "Dm7"], ["G7"]]);
const section = source.sections[0];
const first = section?.measures[0];
if (section === undefined || first === undefined) throw new Error("Missing fixture");
const document = publishA0Candidate({ ...source, sections: [{ ...section, measures: [
  { ...first, events: first.events.map((event, i) => ({ ...event, duration: { numerator: i === 0 ? 3 : 5, denominator: 2 } })) },
  { id: "rest", completion: { kind: "empty" }, events: [] }, section.measures[1],
] }] });
const timeline = buildPlayAlongTimeline(document);
function range(a: number, b: number) {
  const start = makeBeatPosition({ numerator: a, denominator: 1 });
  const end = makeBeatPosition({ numerator: b, denominator: 1 });
  if (!start.ok || !end.ok) throw new Error("Bad position");
  const result = makeBeatRange(start.value, end.value);
  if (!result.ok) throw new Error(result.refusal.code);
  return result.value;
}
for (const fixture of cases.cases) test(`literal cue ${String(fixture.beat)} / ${String(fixture.loop)}`, () => {
  const loop = fixture.loop;
  const view = readPlayAlongTimeline(timeline, fixture.beat,
    loop === undefined ? null : range(loop[0] ?? -1, loop[1] ?? -1), "Play along");
  expect({ current: view.current, next: view.next, bar: view.bar, pulse: view.pulse }).toEqual({
    current: fixture.current, next: fixture.next, bar: fixture.bar, pulse: fixture.pulse,
  });
});
test("invalid or out-of-loop display positions never show a plausible chord", () => {
  for (const beat of [NaN, Infinity, -1, 12]) expect(readPlayAlongTimeline(timeline, beat, null, "Unavailable").current).toBeNull();
  expect(readPlayAlongTimeline(timeline, 0, range(1,4), "Playing").current).toBeNull();
  expect(readPlayAlongTimeline(timeline, 4, range(1,4), "Playing").current).toBeNull();
});
test("spelling-only transposition keeps geometry while changing literal labels", () => {
  const transposed = musicalDocument([["Dbmaj7", "Ebm7"], ["Ab7"]]);
  const a = buildPlayAlongTimeline(source), b = buildPlayAlongTimeline(transposed);
  expect(b.spans.map(span => [span.start, span.end, span.bar])).toEqual(a.spans.map(span => [span.start, span.end, span.bar]));
  expect(readPlayAlongTimeline(b, 0, null, "Ready").current).toBe("Dbmaj7");
  expect(readPlayAlongTimeline(b, 0, null, "Ready").next).toBe("Ebm7");
});
test("compound-meter beat counts and short bars use actual durations", () => {
  const meter = publishA0Candidate({ ...source, meter: { beatsPerBar:6, beatUnit:8 }, sections:[{ ...section, measures:[
    { ...first, completion:{kind:"pickup",expectedDuration:{numerator:1,denominator:1},reason:"Pickup"},
      events:[{...first.events[0],duration:{numerator:1,denominator:1}}] },
    {id:"silent-six",completion:{kind:"empty"},events:[]},
  ]}] });
  const cues = buildPlayAlongTimeline(meter);
  expect(readPlayAlongTimeline(cues,0.5,null,"Playing").pulse).toBe(2);
  const rest = readPlayAlongTimeline(cues,3.5,null,"Playing");
  expect([rest.current,rest.bar,rest.pulse,rest.beatsPerBar]).toEqual(["Rest",2,6,6]);
  expect(readPlayAlongTimeline(cues,4,null,"Playing").current).toBeNull();
});
