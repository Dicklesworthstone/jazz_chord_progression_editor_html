import { expect, test } from "bun:test";
import fixture from "../fixtures/exact-share/document.changes.json";
import { EXACT_SHARE_BOUNDARIES, EXACT_SHARE_EXPECTED_NOTES, EXACT_SHARE_WIRE } from "../fixtures/exact-share";

test("independent exact-share specimen preserves distinct spelled occurrences and exact time", () => {
  const semitones: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const events = fixture.sections[0]?.measures[0]?.events;
  if (events === undefined) throw new Error("Missing independent events");
  expect(events.map(event => event.voicing.pitches.map(pitch => {
    const semitone = semitones[pitch.step];
    if (semitone === undefined) throw new Error("Unknown independent step");
    return 12 * (pitch.octave + 1) + semitone + pitch.alter;
  }))).toEqual(EXACT_SHARE_EXPECTED_NOTES.map(row => [...row]));
  expect(events.map(event => event.duration)).toEqual([{ numerator: 5, denominator: 3 }, { numerator: 7, denominator: 3 }]);
  expect((5 + 7) / 3).toBe(4);
  expect(events[0]?.voicing.pitches.slice(1)).toEqual([
    { step: "D", alter: -1, octave: 3 }, { step: "D", alter: -1, octave: 3 }, { step: "C", alter: 1, octave: 3 },
  ]);
  expect(events[1]?.voicing.generatedBy).toEqual({ engineVersion: "independent-share-fixture-1", family: "balanced" });
  expect(fixture.sections[1]?.measures[0]?.events).toEqual([]);
});

test("independent share wire vectors and exact byte boundaries are arithmetically consistent", () => {
  for (const row of EXACT_SHARE_WIRE) {
    expect(Buffer.from(row.text, "utf8").toString("base64url")).toBe(row.encoded);
  }
  for (const row of EXACT_SHARE_BOUNDARIES) {
    expect(8 + Math.ceil(row.bytes * 4 / 3)).toBe(row.fragmentChars);
    expect(row.fragmentChars <= 8192).toBe(row.accepted);
  }
});
