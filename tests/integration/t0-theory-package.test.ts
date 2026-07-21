import { describe, expect, test } from "bun:test";

import {
  formatChartText,
  formatChordSymbol,
  parseChartText,
  parseChordSymbol,
  syntaxOperations,
} from "../../src/theory";
import { makeMeter } from "../../src/domain";

describe("T0 public syntax package integration", () => {
  test("publishes one immutable operation surface with exact function identity", () => {
    expect(Object.isFrozen(syntaxOperations)).toBe(true);
    expect(Object.keys(syntaxOperations)).toEqual([
      "parseChordSymbol",
      "formatChordSymbol",
      "parseChartText",
      "formatChartText",
    ]);
    expect(syntaxOperations.parseChordSymbol).toBe(parseChordSymbol);
    expect(syntaxOperations.formatChordSymbol).toBe(formatChordSymbol);
    expect(syntaxOperations.parseChartText).toBe(parseChartText);
    expect(syntaxOperations.formatChartText).toBe(formatChartText);
  });

  test("composes longest-token symbol parsing with canonical formatting", () => {
    const parsed = parseChordSymbol("C7b9sus4", "ascii");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.canonicalText).toBe("C7sus4b9");
    expect(parsed.chord.triad).toBe("sus4");
    expect(parsed.chord.seventh).toBe("minor");
    expect(parsed.chord.alterations).toEqual([{ number: 9, alter: -1 }]);
    expect(formatChordSymbol(parsed.chord, "unicode")).toEqual({
      ok: true,
      canonicalText: "C7sus4♭9",
    });
  });

  test("parses, allocates, and canonically reformats a fragment transactionally", () => {
    const meterResult = makeMeter({ beatsPerBar: 4, beatUnit: 4 });
    expect(meterResult.ok).toBe(true);
    if (!meterResult.ok) return;

    const parsed = parseChartText(
      "C Dm G7",
      { mode: "fragment", meter: meterResult.value },
      "ascii",
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.canonicalText).toBe("C:4/3 Dm:4/3 G7:4/3\n");
    expect(parsed.draft.sections[0]?.measures[0]?.events.map((event) => ({
      numerator: event.duration.numerator,
      denominator: event.duration.denominator,
    }))).toEqual([
      { numerator: 4, denominator: 3 },
      { numerator: 4, denominator: 3 },
      { numerator: 4, denominator: 3 },
    ]);
    expect(formatChartText(parsed.draft, "ascii")).toEqual({
      ok: true,
      canonicalText: parsed.canonicalText,
    });
  });

  test("never accepts a valid prefix by defaulting an unknown suffix", () => {
    const parsed = parseChordSymbol("Cfoo", "ascii");
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;

    expect(parsed.diagnostics.map(({ code, range }) => ({ code, range }))).toEqual([
      {
        code: "symbol.quality_unknown",
        range: { start: 1, end: 4 },
      },
    ]);
    expect(parsed.didYouMean).toEqual(["C"]);
  });
});
