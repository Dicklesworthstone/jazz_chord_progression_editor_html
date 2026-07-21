import { describe, expect, test } from "bun:test";

import {
  formatChordSymbol,
  parseChordSymbol,
  parseChordSymbolWithEvidence,
} from "../../src/theory/chord-symbol";

function diagnosticProjection(
  result: ReturnType<typeof parseChordSymbol>,
): readonly Readonly<{
  code: string;
  range: Readonly<{ start: number; end: number }>;
}>[] {
  return result.ok
    ? []
    : result.diagnostics.map(({ code, range }) => ({ code, range }));
}

describe("T0 chord-symbol production grammar", () => {
  test("keeps combined longest tokens semantic and canonical", () => {
    const parsed = parseChordSymbol("C7b9sus4", "ascii");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.canonicalText).toBe("C7sus4b9");
    expect(parsed.chord).toMatchObject({
      sourceText: "C7b9sus4",
      triad: "sus4",
      seventh: "minor",
      alterations: [{ number: 9, alter: -1 }],
    });
    expect(formatChordSymbol(parsed.chord, "unicode")).toEqual({
      ok: true,
      canonicalText: "C7sus4♭9",
    });
  });

  test("collects delimiter and whitespace precedence during the lexical pass", () => {
    const unclosed = parseChordSymbolWithEvidence("C(foo", "ascii");
    expect(diagnosticProjection(unclosed.result)).toEqual([
      {
        code: "symbol.modifier_unclosed",
        range: { start: 1, end: 5 },
      },
    ]);
    expect(unclosed.evidence).toMatchObject({
      lexerCodePointsVisited: 5,
      tokensProduced: 3,
      parserTransitions: 3,
      termination: "complete",
    });

    const forbidden = parseChordSymbolWithEvidence("C (b9)", "ascii");
    expect(diagnosticProjection(forbidden.result)).toEqual([
      {
        code: "symbol.whitespace_invalid",
        range: { start: 1, end: 2 },
      },
    ]);
    expect(forbidden.evidence).toMatchObject({
      lexerCodePointsVisited: 6,
      tokensProduced: 4,
      parserTransitions: 4,
      termination: "complete",
    });

    expect(parseChordSymbol("C(b9, #9)", "ascii")).toMatchObject({
      ok: true,
      canonicalText: "C(b9,#9)",
    });
  });

  test("keeps longest lexemes and spaced modifier groups on one token pass", () => {
    const sourceText = "Cmaj13(b9 #9, add2)";
    const parsed = parseChordSymbolWithEvidence(sourceText, "ascii");
    expect(parsed.result).toMatchObject({
      ok: true,
      canonicalText: "Cmaj13(b9,#9,add2)",
    });
    expect(parsed.evidence).toMatchObject({
      lexerCodePointsVisited: 19,
      tokensProduced: 8,
      parserTransitions: 8,
      modifierItemsObserved: 3,
      peakTokenRecords: 8,
    });
  });

  test("decodes each source unit once in preflight and each scalar once in lexing", () => {
    const sourceText = "F𝄪6/9/G𝄫";
    const charCodeAtDescriptor = Object.getOwnPropertyDescriptor(
      String.prototype,
      "charCodeAt",
    );
    const codePointAtDescriptor = Object.getOwnPropertyDescriptor(
      String.prototype,
      "codePointAt",
    );
    if (charCodeAtDescriptor === undefined || codePointAtDescriptor === undefined) {
      throw new Error("String scalar decoders are unavailable");
    }
    const originalCharCodeAt: unknown = charCodeAtDescriptor.value;
    const originalCodePointAt: unknown = codePointAtDescriptor.value;
    if (
      typeof originalCharCodeAt !== "function" ||
      typeof originalCodePointAt !== "function"
    ) {
      throw new Error("String scalar decoders are unavailable");
    }
    const preflightVisits = new Map<number, number>();
    const lexerReads = new Map<number, number>();

    Object.defineProperty(String.prototype, "charCodeAt", {
      ...charCodeAtDescriptor,
      value: function charCodeAt(this: string, index: number): number {
        if (this === sourceText) {
          preflightVisits.set(index, (preflightVisits.get(index) ?? 0) + 1);
        }
        const result: unknown = Reflect.apply(originalCharCodeAt, this, [index]);
        if (typeof result !== "number") {
          throw new Error("String charCodeAt returned a non-number");
        }
        return result;
      },
    });
    Object.defineProperty(String.prototype, "codePointAt", {
      ...codePointAtDescriptor,
      value: function codePointAt(
        this: string,
        index: number,
      ): number | undefined {
        if (this === sourceText) {
          lexerReads.set(index, (lexerReads.get(index) ?? 0) + 1);
        }
        const result: unknown = Reflect.apply(originalCodePointAt, this, [index]);
        if (result !== undefined && typeof result !== "number") {
          throw new Error("String codePointAt returned an invalid value");
        }
        return result;
      },
    });

    try {
      expect(parseChordSymbol(sourceText, "ascii")).toMatchObject({
        ok: true,
        canonicalText: "F##6/9/Gbb",
      });
    } finally {
      Object.defineProperty(
        String.prototype,
        "charCodeAt",
        charCodeAtDescriptor,
      );
      Object.defineProperty(
        String.prototype,
        "codePointAt",
        codePointAtDescriptor,
      );
    }

    expect([...preflightVisits.entries()]).toEqual(
      Array.from({ length: sourceText.length }, (_, index) => [index, 1]),
    );
    expect([...lexerReads.entries()]).toEqual(
      [0, 1, 3, 4, 5, 6, 7, 8].map((index) => [index, 1]),
    );
  });

  test("preserves an astral double-accidental root in suggestions", () => {
    const parsed = parseChordSymbol("F𝄪foo", "ascii");
    expect(diagnosticProjection(parsed)).toEqual([
      {
        code: "symbol.quality_unknown",
        range: { start: 3, end: 6 },
      },
    ]);
    if (parsed.ok) return;
    expect(parsed.didYouMean).toEqual(["F𝄪"]);
  });

  test("keeps a reviewed unknown token prefix inside one failed quality", () => {
    const parsed = parseChordSymbol("CfooBar/E", "ascii");
    expect(diagnosticProjection(parsed)).toEqual([
      {
        code: "symbol.quality_unknown",
        range: { start: 1, end: 7 },
      },
    ]);
    if (parsed.ok) return;
    expect(parsed.didYouMean).toEqual([]);
  });

  test("repairs only a reviewed failed quality while retaining valid suffixes", () => {
    const cases = [
      ["Cfooadd9", { start: 1, end: 4 }, ["Cadd9"]],
      ["Cdom7b9", { start: 1, end: 5 }, ["C7b9"]],
      ["Cmi7add9", { start: 1, end: 4 }, ["Cm7add9"]],
      ["CMaj7#11", { start: 1, end: 5 }, ["Cmaj7#11"]],
      ["Cfoo7", { start: 1, end: 4 }, ["C7"]],
      ["Cfoo13", { start: 1, end: 4 }, ["C13"]],
      ["Cfoo6/9", { start: 1, end: 4 }, ["C6/9"]],
      ["Cxadd9", { start: 1, end: 2 }, ["Cadd9", "C-add9", "Cmadd9"]],
    ] as const;

    for (const [sourceText, expectedRange, expectedSuggestions] of cases) {
      const parsed = parseChordSymbol(sourceText, "ascii");
      expect(diagnosticProjection(parsed)).toEqual([
        { code: "symbol.quality_unknown", range: expectedRange },
      ]);
      if (parsed.ok) continue;
      expect(parsed.didYouMean).toEqual(expectedSuggestions);
      for (const suggestion of parsed.didYouMean) {
        const candidate = parseChordSymbol(suggestion, "ascii");
        expect(candidate.ok).toBe(true);
        if (!candidate.ok) continue;
        expect(candidate.chord.root).toEqual({ step: "C", alter: 0 });
      }
    }
  });

  test("filters suggestions that alter the root or retain invalid bass input", () => {
    for (const sourceText of [
      "Cfoob9",
      "Cfoo/H",
      "Cfoo/",
      "Cfoo/E/G",
      "Cfoo//G",
    ]) {
      const parsed = parseChordSymbol(sourceText, "ascii");
      expect(parsed.ok).toBe(false);
      if (parsed.ok) continue;
      expect(parsed.didYouMean).toEqual([]);
    }
  });

  test("reports retained suggestion records rather than comparison count", () => {
    expect(parseChordSymbolWithEvidence("Cx", "ascii").evidence).toMatchObject({
      suggestionsCompared: 4,
      peakSuggestionRecords: 4,
    });
    expect(
      parseChordSymbolWithEvidence("Cfoo/H", "ascii").evidence,
    ).toMatchObject({
      suggestionsCompared: 1,
      peakSuggestionRecords: 1,
    });
  });

  test("ranks whole canonical candidates before retained-tail aliases", () => {
    const cases = [
      ["Cxmaj7", ["Cmaj7", "C-maj7", "Cmmaj7"]],
      ["CxM7", ["C-M7", "CM7", "CmM7"]],
      ["CxΔ7", ["C-Δ7", "CmΔ7", "CΔ7"]],
      ["Cx(maj7)", ["Cm(maj7)", "C(maj7)", "C-(maj7)"]],
    ] as const;

    for (const [sourceText, expectedSuggestions] of cases) {
      const parsed = parseChordSymbol(sourceText, "ascii");
      expect(parsed.ok).toBe(false);
      if (parsed.ok) continue;
      expect(parsed.didYouMean).toEqual(expectedSuggestions);
      for (const suggestion of parsed.didYouMean) {
        const candidate = parseChordSymbol(suggestion, "ascii");
        expect(candidate.ok).toBe(true);
        if (!candidate.ok) continue;
        expect(candidate.chord.root).toEqual({ step: "C", alter: 0 });
      }
    }
  });

  test("keeps slash ambiguity local to slash-nine and adjacent six-eight", () => {
    const ambiguous = [
      ["C/9/E", { start: 1, end: 3 }, []],
      ["C6/8/E", { start: 2, end: 4 }, ["C6/9/E"]],
      ["C6/8add2", { start: 2, end: 4 }, ["C6/9add2"]],
      ["C6/8add9", { start: 2, end: 4 }, []],
    ] as const;
    for (const [sourceText, expectedRange, suggestions] of ambiguous) {
      const parsed = parseChordSymbol(sourceText, "ascii");
      expect(diagnosticProjection(parsed)).toEqual([
        { code: "symbol.ambiguous_slash", range: expectedRange },
      ]);
      if (parsed.ok) continue;
      expect(parsed.didYouMean).toEqual(suggestions);
    }

    const invalidBasses = [
      ["C/7", { start: 2, end: 3 }],
      ["C/11", { start: 2, end: 3 }],
      ["C7/8", { start: 3, end: 4 }],
      ["C6add2/8", { start: 7, end: 8 }],
      ["C6/9/8", { start: 5, end: 6 }],
    ] as const;
    for (const [sourceText, expectedRange] of invalidBasses) {
      expect(diagnosticProjection(parseChordSymbol(sourceText, "ascii"))).toEqual([
        { code: "symbol.bass_invalid", range: expectedRange },
      ]);
    }
  });

  test("ends unknown modifiers before a complete slash bass", () => {
    for (const sourceText of ["C7foo/E", "C7bb9/E"]) {
      expect(diagnosticProjection(parseChordSymbol(sourceText, "ascii"))).toEqual([
        {
          code: "symbol.modifier_unknown",
          range: { start: 2, end: 5 },
        },
      ]);
    }
  });

  test("retains the six-nine family when canonicalizing other modifiers", () => {
    expect(parseChordSymbol("C6/9b5", "ascii")).toMatchObject({
      ok: true,
      canonicalText: "C6/9(b5)",
    });
    expect(parseChordSymbol("C6/9no3", "ascii")).toMatchObject({
      ok: true,
      canonicalText: "C6/9(no3)",
    });
  });

  test("distinguishes trailing punctuation from invalid chord tokens", () => {
    expect(diagnosticProjection(parseChordSymbol("C|", "ascii"))).toEqual([
      {
        code: "symbol.trailing_input",
        range: { start: 1, end: 2 },
      },
    ]);
    expect(diagnosticProjection(parseChordSymbol("Cadd8", "ascii"))).toEqual([
      {
        code: "symbol.modifier_unknown",
        range: { start: 1, end: 5 },
      },
    ]);
    expect(diagnosticProjection(parseChordSymbol("C77", "ascii"))).toEqual([
      {
        code: "symbol.extension_conflict",
        range: { start: 2, end: 3 },
      },
    ]);
  });

  test("rejects suspension on dominant eleven in parsing and formatting", () => {
    for (const [sourceText, expectedRange] of [
      ["C11sus", { start: 3, end: 6 }],
      ["C11sus2", { start: 3, end: 7 }],
      ["C11sus4", { start: 3, end: 7 }],
      ["C11b9sus2", { start: 5, end: 9 }],
    ] as const) {
      expect(diagnosticProjection(parseChordSymbol(sourceText, "ascii"))).toEqual([
        { code: "symbol.modifier_conflict", range: expectedRange },
      ]);
    }

    for (const sourceText of ["C7sus4", "C9sus2", "C13sus"]) {
      expect(parseChordSymbol(sourceText, "ascii").ok).toBe(true);
    }

    const dominantEleven = parseChordSymbol("C11", "ascii");
    expect(dominantEleven.ok).toBe(true);
    if (!dominantEleven.ok) return;
    const suspendedEleven = Object.freeze({
      ...dominantEleven.chord,
      triad: "sus4" as const,
    });
    expect(formatChordSymbol(suspendedEleven, "ascii")).toMatchObject({
      ok: false,
      diagnostics: [
        {
          code: "symbol.ast_unformattable",
          range: { start: 0, end: 3 },
        },
      ],
    });
  });

  test("stops at the exact first excess lexical token", () => {
    const sourceText = `C7(${Array.from({ length: 31 }, () => "add9").join(",")})`;
    const parsed = parseChordSymbolWithEvidence(sourceText, "ascii");

    expect(diagnosticProjection(parsed.result)).toEqual([
      {
        code: "limit.symbol_tokens_exceeded",
        range: { start: 157, end: 158 },
      },
    ]);
    expect(parsed.evidence).toMatchObject({
      sourceUtf16CodeUnits: 158,
      lexerCodePointsVisited: 158,
      tokensProduced: 65,
      parserTransitions: 0,
      termination: "symbol-tokens",
    });
  });

  test("stops at modifier 33 without retaining the excess item", () => {
    const pattern = [
      "add2",
      "add3",
      "add4",
      "add6",
      "add9",
      "add11",
      "add13",
      "no3",
      "no5",
      "b5",
      "b9",
      "#9",
      "#11",
      "b13",
    ] as const;
    const sourceText =
      "C7" +
      Array.from(
        { length: 33 },
        (_, index) => pattern[index % pattern.length],
      ).join("");
    const parsed = parseChordSymbolWithEvidence(sourceText, "ascii");

    expect(diagnosticProjection(parsed.result)).toEqual([
      {
        code: "limit.symbol_modifiers_exceeded",
        range: { start: 114, end: 118 },
      },
    ]);
    expect(parsed.evidence).toMatchObject({
      sourceUtf16CodeUnits: 118,
      lexerCodePointsVisited: 118,
      modifierItemsObserved: 33,
      peakTokenRecords: 34,
      parserTransitions: 0,
      termination: "symbol-modifiers",
    });
  });

  test("reports full well-formed source counts after the first scalar excess", () => {
    const sourceText = `C${"x".repeat(300)}`;
    const parsed = parseChordSymbolWithEvidence(sourceText, "ascii");

    expect(diagnosticProjection(parsed.result)).toEqual([
      {
        code: "limit.symbol_code_points_exceeded",
        range: { start: 256, end: 257 },
      },
    ]);
    expect(parsed.evidence).toMatchObject({
      sourceUtf16CodeUnits: 301,
      sourceCodePoints: 301,
      sourceUtf8Bytes: 301,
      lexerCodePointsVisited: 0,
      termination: "symbol-code-points",
    });
  });

  test("lets a later lone surrogate outrank an earlier scalar excess", () => {
    for (const loneSurrogate of ["\ud800", "\udc00"] as const) {
      const sourceText = `C${"x".repeat(256)}${loneSurrogate}`;
      const parsed = parseChordSymbolWithEvidence(sourceText, "ascii");

      expect(diagnosticProjection(parsed.result)).toEqual([
        {
          code: "symbol.invalid_unicode_scalar",
          range: { start: 257, end: 258 },
        },
      ]);
      expect(parsed.evidence).toMatchObject({
        sourceUtf16CodeUnits: 258,
        sourceCodePoints: 257,
        sourceUtf8Bytes: 257,
        lexerCodePointsVisited: 0,
        termination: "complete",
      });
    }
  });
});
