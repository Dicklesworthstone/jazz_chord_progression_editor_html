import { describe, expect, test } from "bun:test";
import {
  invertInterval,
  makeSpelledInterval,
  transposeChordSymbolByInterval,
  transposePitchByInterval,
  transposeProgressionByInterval,
} from "../../src/theory/spelled-transposition";
import { spelledPitchClassToString } from "../../src/theory/guide-tones";
import { type SpelledPitchClass } from "../../src/domain";

describe("H1 Spelled Transposition Engine", () => {
  test("creates valid SpelledInterval and computes correct semitones", () => {
    const m2Up = makeSpelledInterval(2, "minor", "up");
    expect(m2Up.semitones).toBe(1);
    expect(m2Up.scaleSteps).toBe(1);

    const m2Down = makeSpelledInterval(2, "minor", "down");
    expect(m2Down.semitones).toBe(-1);

    const P4Up = makeSpelledInterval(4, "perfect", "up");
    expect(P4Up.semitones).toBe(5);

    const P5Up = makeSpelledInterval(5, "perfect", "up");
    expect(P5Up.semitones).toBe(7);
  });

  test("inverts interval correctly", () => {
    const P4Up = makeSpelledInterval(4, "perfect", "up");
    const P4Down = invertInterval(P4Up);
    expect(P4Down.direction).toBe("down");
    expect(P4Down.semitones).toBe(-5);
  });

  test("transposes spelled pitch class accurately", () => {
    const cNatural: SpelledPitchClass = { step: "C", alter: 0 };
    const M2Up = makeSpelledInterval(2, "major", "up");
    const dNatural = transposePitchByInterval(cNatural, M2Up);
    expect(spelledPitchClassToString(dNatural)).toBe("D");

    const m3Up = makeSpelledInterval(3, "minor", "up");
    const eFlat = transposePitchByInterval(cNatural, m3Up);
    expect(spelledPitchClassToString(eFlat)).toBe("Eb");
  });

  test("transposes chord symbol including complex extensions and slash bass", () => {
    const M2Up = makeSpelledInterval(2, "major", "up");
    const res1 = transposeChordSymbolByInterval("Cmaj7", M2Up);
    expect(res1.transposedSymbol).toBe("Dmaj7");

    const res2 = transposeChordSymbolByInterval("C7b9/Bb", M2Up);
    expect(res2.transposedSymbol).toBe("D7b9/C");
  });

  test("lossless round-trip progression transposition (transposing +interval then -interval restores exact chord symbols)", () => {
    const originalChords = ["Dm7", "G7", "Cmaj7", "A7b9/C#"];
    const P4Up = makeSpelledInterval(4, "perfect", "up");
    const P4Down = invertInterval(P4Up);

    const step1 = transposeProgressionByInterval(originalChords, { interval: P4Up });
    expect(step1.transposedChords).toEqual(["Gm7", "C7", "Fmaj7", "D7b9/F#"]);

    const step2 = transposeProgressionByInterval(step1.transposedChords, { interval: P4Down });
    expect(step2.transposedChords).toEqual(originalChords);
  });
});
