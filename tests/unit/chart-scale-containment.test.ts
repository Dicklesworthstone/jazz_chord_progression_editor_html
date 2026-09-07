import { describe, expect, test } from "bun:test";
import { makeSpelledPitchClass, type KeyContext } from "../../src/domain";
import { analyzeChartEvent, parseChordSymbol, resolutionOperations } from "../../src/theory";

// Independently authored from exact scale degrees in H0 section10. This tests
// the existing chart-annotation subset, not H0's unimplemented option engine.
// A natural fifth (7 semitones) is absent from altered [0,1,3,4,6,8,10].
// Half-whole [0,1,3,4,6,7,9,10] keeps that fifth, b9 and spelled #11.
// Equal semitones alone do not make #11 and b5 the same degree.
const roots = [
  ["C", "C", 0], ["Db", "D", -1], ["D", "D", 0], ["Eb", "E", -1],
  ["E", "E", 0], ["F", "F", 0], ["Gb", "G", -1], ["G", "G", 0],
  ["Ab", "A", -1], ["A", "A", 0], ["Bb", "B", -1], ["B", "B", 0],
] as const;

const cases = [
  ["7", "Mixolydian"], ["7b9", "half–whole diminished"],
  ["7b9#11", "half–whole diminished"], ["7#11", "Lydian dominant"],
  ["7alt", "altered"], ["7b9b5", "altered"],
  ["7b9b5#11", null], // #11 cannot masquerade as the altered scale's b5.
  ["7b9add9", null], // Both explicit ninths must be preserved.
  ["maj7", "Ionian"], ["maj7#11", "Lydian"], ["maj7b9", null],
  ["m7", "Dorian"], ["mMaj7", "melodic minor"],
  ["m7b5", "Locrian"], ["m9b5", "Locrian natural 2"],
  ["dim7", "whole–half diminished"],
] as const;

describe("chart scale suggestions contain exact resolved degrees", () => {
  for (const [root, step, alter] of roots) for (const keyed of [false, true]) {
    for (const [suffix, family] of cases) test(`${root}${suffix}, ${keyed ? "keyed" : "unkeyed"}`, () => {
      const parsed = parseChordSymbol(root + suffix, "ascii");
      if (!parsed.ok) throw new Error(JSON.stringify(parsed.diagnostics));
      const made = makeSpelledPitchClass({ step, alter });
      if (!made.ok) throw new Error(JSON.stringify(made.refusal));
      // The keyed twin makes the chord tonic. The existing minor-tonic branch
      // prefers Aeolian; both valid seventh scales contain 1,b3,5,b7.
      const key: KeyContext | null = keyed ? { tonic: made.value, mode: "major" } : null;
      const expectedFamily = keyed && suffix === "m7" ? "Aeolian" : family;
      const expected = expectedFamily === null ? null : `${root.replaceAll("b", "♭")} ${expectedFamily}`;
      const request = { current: parsed.chord, key }, before = JSON.stringify(request);
      const result = analyzeChartEvent(request, resolutionOperations);
      expect(result.scaleSentence).toBe(expected);
      expect(analyzeChartEvent(request, resolutionOperations)).toEqual(result);
      expect(JSON.stringify(request)).toBe(before);
    });
  }

  test("an off-formula slash bass cannot be silently excluded from the claim", () => {
    for (const [symbol, expected] of [["Cmaj7/E", "C Ionian"], ["Cmaj7/Db", null], ["Cmaj7/B#", null]] as const) {
      const parsed = parseChordSymbol(symbol, "ascii");
      if (!parsed.ok) throw new Error(JSON.stringify(parsed.diagnostics));
      expect(analyzeChartEvent({ current: parsed.chord, key: null }, resolutionOperations).scaleSentence).toBe(expected);
    }
  });
});
