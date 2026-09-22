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
    expect(res1.ok && res1.transposedSymbol).toBe("Dmaj7");

    const res2 = transposeChordSymbolByInterval("C7b9/Bb", M2Up);
    expect(res2.ok && res2.transposedSymbol).toBe("D7b9/C");
  });

  test("lossless round-trip progression transposition (transposing +interval then -interval restores exact chord symbols)", () => {
    const originalChords = ["Dm7", "G7", "Cmaj7", "A7b9/C#"];
    const P4Up = makeSpelledInterval(4, "perfect", "up");
    const P4Down = invertInterval(P4Up);

    const step1 = transposeProgressionByInterval(originalChords, { interval: P4Up });
    if (!step1.ok) throw new Error(JSON.stringify(step1.refusals));
    expect(step1.transposedChords).toEqual(["Gm7", "C7", "Fmaj7", "D7b9/F#"]);

    const step2 = transposeProgressionByInterval(step1.transposedChords, { interval: P4Down });
    if (!step2.ok) throw new Error(JSON.stringify(step2.refusals));
    expect(step2.transposedChords).toEqual(originalChords);
  });

  /* Hand-authored: transposition moves the spelled root and slash bass by the
   * interval and leaves every root-relative member alone. Each expectation is
   * derived from letter + semitone arithmetic, never read from the engine. */
  const LETTERS = ["C", "D", "E", "F", "G", "A", "B"] as const;
  const NATURAL: Readonly<Record<string, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const ROOTS = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"] as const;
  const SUFFIXES = ["6/9", "maj7", "m7b5", "7b9", "7alt", "maj7#11", "sus4", "o7", "m(maj7)", "13b9", "-7", "7(b9)"] as const;

  function expectedRoot(root: string, letterSteps: number, semitones: number): string {
    const letter = root[0] ?? "C";
    /* ASCII accidentals only: "#" raises, "b" lowers. */
    const accidentals = root.slice(1);
    const alter = (accidentals.match(/#/gu)?.length ?? 0) - (accidentals.match(/b/gu)?.length ?? 0);
    const target = LETTERS[(LETTERS.indexOf(letter as (typeof LETTERS)[number]) + letterSteps + 7) % 7] ?? "C";
    const sounding = (NATURAL[letter] ?? 0) + alter + semitones;
    const shift = ((((sounding - (NATURAL[target] ?? 0)) % 12) + 18) % 12) - 6;
    return `${target}${shift < 0 ? "b".repeat(-shift) : "#".repeat(shift)}`;
  }

  test("every root × quality × interval moves exactly the root and keeps the quality text", () => {
    const intervals = [
      [makeSpelledInterval(2, "minor", "up"), 1],
      [makeSpelledInterval(4, "perfect", "up"), 3],
      [makeSpelledInterval(2, "major", "down"), -1],
      [makeSpelledInterval(3, "minor", "up"), 2],
    ] as const;
    for (const root of ROOTS) {
      for (const suffix of SUFFIXES) {
        for (const [interval, letterSteps] of intervals) {
          const symbol = `${root}${suffix}`;
          const result = transposeChordSymbolByInterval(symbol, interval);
          const want = `${expectedRoot(root, letterSteps, interval.semitones)}${suffix}`;
          expect(`${symbol}: ${result.ok ? result.transposedSymbol : result.code}`).toBe(`${symbol}: ${want}`);
        }
      }
    }
  });

  test("6/9 with a slash bass keeps both the 9 and the independently moved bass", () => {
    const M2Up = makeSpelledInterval(2, "major", "up");
    for (const [source, want] of [["C6/9/E", "D6/9/F#"], ["Ab7/C", "Bb7/D"], ["F#m7/C#", "G#m7/D#"]] as const) {
      const result = transposeChordSymbolByInterval(source, M2Up);
      expect(result.ok && result.transposedSymbol).toBe(want);
    }
  });

  test("Unicode sources transpose and stay Unicode", () => {
    const M2Up = makeSpelledInterval(2, "major", "up");
    const flat = transposeChordSymbolByInterval("D♭maj7", M2Up, "unicode");
    expect(flat.ok && flat.transposedSymbol).toBe("E♭maj7");
    const sharp = transposeChordSymbolByInterval("F♯m7♭5", makeSpelledInterval(2, "minor", "up"), "unicode");
    expect(sharp.ok && sharp.transposedSymbol).toBe("Gm7♭5");
  });

  test("transposing up then back down restores every source symbol exactly", () => {
    const up = makeSpelledInterval(5, "perfect", "up");
    const down = invertInterval(up);
    for (const root of ROOTS) {
      for (const suffix of SUFFIXES) {
        const symbol = `${root}${suffix}`;
        const there = transposeChordSymbolByInterval(symbol, up);
        if (!there.ok) throw new Error(`${symbol}: ${there.code}`);
        const back = transposeChordSymbolByInterval(there.transposedSymbol, down);
        expect(back.ok && back.transposedSymbol).toBe(symbol);
      }
    }
  });

  test("impossible spellings and unsupported symbols refuse instead of echoing the input", () => {
    const augmentedUnison = makeSpelledInterval(1, "augmented", "up");
    const overflow = transposeChordSymbolByInterval("B##7", augmentedUnison);
    expect(overflow.ok).toBe(false);
    if (!overflow.ok) expect(overflow.code).toBe("transpose.spelling-overflow");
    const unparseable = transposeChordSymbolByInterval("H7", makeSpelledInterval(2, "major", "up"));
    expect(unparseable.ok).toBe(false);
    if (!unparseable.ok) expect(unparseable.code).toBe("transpose.unparseable");
    const progression = transposeProgressionByInterval(["Dm7", "B##7", "Cmaj7"], { interval: augmentedUnison });
    expect(progression.ok).toBe(false);
    if (!progression.ok) expect(progression.refusals).toEqual([{ index: 1, code: "transpose.spelling-overflow" }]);
  });
});
