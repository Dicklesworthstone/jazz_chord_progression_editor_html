import { describe, expect, test } from "bun:test";

import {
  parseChartText,
  parseChartTextWithEvidence,
} from "../../src/theory/chart-parser";
import { parseChordSymbolWithEvidence } from "../../src/theory/chord-symbol";
import type { Meter } from "../../src/domain";

const FOUR_FOUR = {
  mode: "fragment" as const,
  meter: { beatsPerBar: 4 as const, beatUnit: 4 as const },
};

function diagnosticProjection(
  result: ReturnType<typeof parseChartText>,
): readonly unknown[] {
  if (result.ok) return [];
  return result.diagnostics.map(({ code, range }) => ({ code, range }));
}

describe("T0 chart parser", () => {
  test("parses headers, shared barlines, annotations, and repeat linkage with exact ranges", () => {
    const sourceText =
      '@title "Late Set"\n@meter 4/4\n@tempo 120\n@key C major\n' +
      '[A] "opening"\n| Cmaj7:2 "hold" Dm7:2 | G7:4 |\n' +
      "[B]\n| Fmaj7:1 /:1 /:1 Fm6:1 | C/G:4 |";
    const parsed = parseChartText(sourceText, { mode: "document" }, "ascii");

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.draft.headers).toEqual({
      title: "Late Set",
      description: null,
      meter: { beatsPerBar: 4, beatUnit: 4 },
      tempoBpm: 120,
      key: { tonic: { step: "C", alter: 0 }, mode: "major" },
    });
    expect(
      parsed.draft.sections.flatMap((section) =>
        section.measures.map((measure) => measure.range),
      ),
    ).toEqual([
      { start: 67, end: 91 },
      { start: 90, end: 98 },
      { start: 103, end: 128 },
      { start: 127, end: 136 },
    ]);
    const events = parsed.draft.sections.flatMap((section) =>
      section.measures.flatMap((measure) => measure.events),
    );
    expect(events.map(({ origin, repeatedFromOrdinal }) => ({
      origin,
      repeatedFromOrdinal,
    }))).toEqual([
      { origin: "literal", repeatedFromOrdinal: null },
      { origin: "literal", repeatedFromOrdinal: null },
      { origin: "literal", repeatedFromOrdinal: null },
      { origin: "literal", repeatedFromOrdinal: null },
      { origin: "repeat", repeatedFromOrdinal: 3 },
      { origin: "repeat", repeatedFromOrdinal: 4 },
      { origin: "literal", repeatedFromOrdinal: null },
      { origin: "literal", repeatedFromOrdinal: null },
    ]);
    expect(events[0]?.annotationRange).toEqual({ start: 77, end: 83 });
    expect(parsed.canonicalText).toBe(`${sourceText}\n`);
    expect(Object.isFrozen(parsed.draft)).toBe(true);
    expect(Object.isFrozen(parsed.draft.sections)).toBe(true);
    expect(Object.isFrozen(events[0])).toBe(true);
  });

  test("collects independent delegated failures and exposes no partial draft", () => {
    const parsed = parseChartTextWithEvidence(
      "| Cfoo:2 Dwat:2 |",
      FOUR_FOUR,
      "ascii",
    );

    expect(diagnosticProjection(parsed.result)).toEqual([
      { code: "symbol.quality_unknown", range: { start: 3, end: 6 } },
      { code: "symbol.quality_unknown", range: { start: 10, end: 13 } },
    ]);
    expect(parsed.result.ok).toBe(false);
    if (parsed.result.ok) return;
    expect(parsed.result.insertableChords).toEqual([]);
    expect(parsed.evidence).toMatchObject({
      chordDelegations: 2,
      numericComponentsCompared: 2,
      maxSourceBigIntDigits: 1,
      diagnosticsProduced: 2,
      insertableCandidatesProduced: 0,
      termination: "complete",
    });
    expect(parsed.delegatedSymbols.map(({ delegationOrdinal, symbolRange }) => ({
      delegationOrdinal,
      symbolRange,
    }))).toEqual([
      { delegationOrdinal: 0, symbolRange: { start: 2, end: 6 } },
      { delegationOrdinal: 1, symbolRange: { start: 9, end: 13 } },
    ]);
    expect(parsed.delegatedSymbols[0]?.evidence).toEqual(
      parseChordSymbolWithEvidence("Cfoo", "ascii").evidence,
    );
  });

  test("retains only individually valid chords with explicit recovery semantics", () => {
    const parsed = parseChartText(
      "| Cmaj7:2 Cwat:2 |",
      FOUR_FOUR,
      "ascii",
    );

    expect(diagnosticProjection(parsed)).toEqual([
      { code: "symbol.quality_unknown", range: { start: 11, end: 14 } },
    ]);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.insertableChords).toHaveLength(1);
    expect(parsed.insertableChords[0]).toMatchObject({
      ordinal: 0,
      annotation: "",
      range: { start: 2, end: 9 },
      symbolRange: { start: 2, end: 7 },
      duration: {
        kind: "resolved",
        source: "explicit",
        value: { numerator: 2, denominator: 1 },
      },
      layoutContextPreserved: false,
    });
  });

  test("retains individually valid virtual slots when later bars invalidate layout", () => {
    for (const sourceText of ["C | D:4 |", "[A]\nC | D:4 |"]) {
      const parsed = parseChartTextWithEvidence(
        sourceText,
        FOUR_FOUR,
        "ascii",
      );
      expect(diagnosticProjection(parsed.result)).toEqual([
        {
          code: "chart.unsupported_notation",
          range: sourceText.startsWith("[")
            ? { start: 6, end: 7 }
            : { start: 2, end: 3 },
        },
      ]);
      expect(parsed.result.ok).toBe(false);
      expect(parsed.delegatedSymbols.map(({ symbolRange }) => symbolRange)).toEqual(
        sourceText.startsWith("[")
          ? [
              { start: 4, end: 5 },
              { start: 8, end: 9 },
            ]
          : [
              { start: 0, end: 1 },
              { start: 4, end: 5 },
            ],
      );
      if (parsed.result.ok) continue;
      expect(
        parsed.result.insertableChords.map(
          ({ ordinal, symbolRange, duration }) => ({
            ordinal,
            symbolRange,
            durationKind: duration.kind,
          }),
        ),
      ).toEqual(
        sourceText.startsWith("[")
          ? [
              {
                ordinal: 0,
                symbolRange: { start: 4, end: 5 },
                durationKind: "requires-caller",
              },
              {
                ordinal: 1,
                symbolRange: { start: 8, end: 9 },
                durationKind: "resolved",
              },
            ]
          : [
              {
                ordinal: 0,
                symbolRange: { start: 0, end: 1 },
                durationKind: "requires-caller",
              },
              {
                ordinal: 1,
                symbolRange: { start: 4, end: 5 },
                durationKind: "resolved",
              },
            ],
      );
    }

    const invalidSymbol = parseChartTextWithEvidence(
      "Cfoo | D:4 |",
      FOUR_FOUR,
      "ascii",
    );
    expect(
      invalidSymbol.delegatedSymbols.map(({ symbolRange }) => symbolRange),
    ).toEqual([
      { start: 0, end: 4 },
      { start: 7, end: 8 },
    ]);
    expect(diagnosticProjection(invalidSymbol.result)).toEqual([
      { code: "symbol.quality_unknown", range: { start: 1, end: 4 } },
      { code: "chart.unsupported_notation", range: { start: 5, end: 6 } },
    ]);
    expect(invalidSymbol.result.ok).toBe(false);
    if (!invalidSymbol.result.ok) {
      expect(
        invalidSymbol.result.insertableChords.map(
          ({ ordinal, symbolRange }) => ({ ordinal, symbolRange }),
        ),
      ).toEqual([{ ordinal: 1, symbolRange: { start: 7, end: 8 } }]);
    }
  });

  test("retains post-barline slots when a line break invalidates their layout", () => {
    for (const sourceText of ["| C:4 |\nD", "[A]\n| C:4 |\nD"]) {
      const parsed = parseChartTextWithEvidence(
        sourceText,
        FOUR_FOUR,
        "ascii",
      );
      const named = sourceText.startsWith("[");
      expect(diagnosticProjection(parsed.result)).toEqual([
        {
          code: "chart.unsupported_notation",
          range: named ? { start: 12, end: 13 } : { start: 8, end: 9 },
        },
      ]);
      expect(
        parsed.delegatedSymbols.map(({ symbolRange }) => symbolRange),
      ).toEqual(
        named
          ? [
              { start: 6, end: 7 },
              { start: 12, end: 13 },
            ]
          : [
              { start: 2, end: 3 },
              { start: 8, end: 9 },
            ],
      );
      expect(parsed.evidence.chordDelegations).toBe(2);
      expect(parsed.result.ok).toBe(false);
      if (parsed.result.ok) continue;
      expect(
        parsed.result.insertableChords.map(
          ({ ordinal, symbolRange, duration }) => ({
            ordinal,
            symbolRange,
            durationKind: duration.kind,
          }),
        ),
      ).toEqual(
        named
          ? [
              {
                ordinal: 0,
                symbolRange: { start: 6, end: 7 },
                durationKind: "resolved",
              },
              {
                ordinal: 1,
                symbolRange: { start: 12, end: 13 },
                durationKind: "requires-caller",
              },
            ]
          : [
              {
                ordinal: 0,
                symbolRange: { start: 2, end: 3 },
                durationKind: "resolved",
              },
              {
                ordinal: 1,
                symbolRange: { start: 8, end: 9 },
                durationKind: "requires-caller",
              },
            ],
      );
    }

    const invalidSymbol = parseChartTextWithEvidence(
      "| C:4 |\nDfoo",
      FOUR_FOUR,
      "ascii",
    );
    expect(
      invalidSymbol.delegatedSymbols.map(({ symbolRange }) => symbolRange),
    ).toEqual([
      { start: 2, end: 3 },
      { start: 8, end: 12 },
    ]);
    expect(diagnosticProjection(invalidSymbol.result)).toEqual([
      { code: "chart.unsupported_notation", range: { start: 8, end: 12 } },
      { code: "symbol.quality_unknown", range: { start: 9, end: 12 } },
    ]);
    expect(invalidSymbol.evidence.chordDelegations).toBe(2);
    expect(invalidSymbol.result.ok).toBe(false);
    if (!invalidSymbol.result.ok) {
      expect(
        invalidSymbol.result.insertableChords.map(
          ({ ordinal, symbolRange }) => ({ ordinal, symbolRange }),
        ),
      ).toEqual([{ ordinal: 0, symbolRange: { start: 2, end: 3 } }]);
    }
  });

  test("gives an unclosed annotation lexical precedence over a derived measure cascade", () => {
    const parsed = parseChartText('| C:4 "hold |', FOUR_FOUR, "ascii");
    expect(diagnosticProjection(parsed)).toEqual([
      { code: "chart.annotation_unclosed", range: { start: 6, end: 13 } },
    ]);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.insertableChords).toHaveLength(1);
  });

  test("extends an unclosed measure through its trailing horizontal and comment trivia", () => {
    const repeatedComments = "| C:4 ;one\r\n\t;two\n  ";
    for (const { sourceText, expectedEnd, expectedTokens } of [
      { sourceText: "| C:4   ", expectedEnd: 8, expectedTokens: 3 },
      { sourceText: "| C:4 ;note", expectedEnd: 11, expectedTokens: 4 },
      { sourceText: "| C:4 \n  ", expectedEnd: 9, expectedTokens: 3 },
      {
        sourceText: repeatedComments,
        expectedEnd: repeatedComments.length,
        expectedTokens: 5,
      },
    ]) {
      const parsed = parseChartTextWithEvidence(
        sourceText,
        FOUR_FOUR,
        "ascii",
      );
      expect(diagnosticProjection(parsed.result)).toEqual([
        {
          code: "chart.measure_unclosed",
          range: { start: 0, end: expectedEnd },
        },
      ]);
      expect(parsed.delegatedSymbols.map(({ symbolRange }) => symbolRange)).toEqual([
        { start: 2, end: 3 },
      ]);
      expect(parsed.evidence).toMatchObject({
        tokensProduced: expectedTokens,
        parserTransitions: expectedTokens,
        chordDelegations: 1,
        diagnosticsProduced: 1,
        insertableCandidatesProduced: 1,
        termination: "complete",
      });
      expect(parsed.result.ok).toBe(false);
      if (parsed.result.ok) continue;
      expect(
        parsed.result.insertableChords.map(
          ({ ordinal, range: eventRange, symbolRange }) => ({
            ordinal,
            range: eventRange,
            symbolRange,
          }),
        ),
      ).toEqual([
        {
          ordinal: 0,
          range: { start: 2, end: 5 },
          symbolRange: { start: 2, end: 3 },
        },
      ]);
    }

    for (const sourceText of ["|   ", "| \n\t"]) {
      const slotless = parseChartTextWithEvidence(
        sourceText,
        FOUR_FOUR,
        "ascii",
      );
      expect(diagnosticProjection(slotless.result)).toEqual([
        {
          code: "chart.measure_unclosed",
          range: { start: 0, end: sourceText.length },
        },
      ]);
      expect(slotless.delegatedSymbols).toEqual([]);
      expect(slotless.result.ok).toBe(false);
      if (!slotless.result.ok) {
        expect(slotless.result.insertableChords).toEqual([]);
      }
    }

    for (const sourceText of [
      "| C:4 \n  [A]\n| D:4 |",
      "| C:4 \n  @tempo 120",
    ]) {
      const stopped = parseChartText(sourceText, FOUR_FOUR, "ascii");
      expect(stopped.ok).toBe(false);
      if (stopped.ok) continue;
      expect(
        stopped.diagnostics.find(({ code }) => code === "chart.measure_unclosed"),
      ).toMatchObject({
        code: "chart.measure_unclosed",
        range: {
          start: 0,
          end: Math.max(sourceText.indexOf("["), sourceText.indexOf("@")),
        },
      });
    }

    const completeWithComment = parseChartText(
      "| C:4 | ;note",
      FOUR_FOUR,
      "ascii",
    );
    expect(completeWithComment.ok).toBe(true);
    if (completeWithComment.ok) {
      expect(completeWithComment.warnings).toEqual([
        {
          code: "chart.comments_not_round_tripped",
          range: { start: 8, end: 13 },
          message: "Comments are omitted by canonical chart formatting.",
        },
      ]);
    }
  });

  test("rejects missing slot and section spacing before attached chord delegation", () => {
    const repeatAttachment = parseChartTextWithEvidence(
      "| C:2 /G:2 |",
      FOUR_FOUR,
      "ascii",
    );
    expect(diagnosticProjection(repeatAttachment.result)).toEqual([
      { code: "chart.unexpected_token", range: { start: 7, end: 8 } },
    ]);
    expect(repeatAttachment.delegatedSymbols.map(({ symbolRange }) => symbolRange)).toEqual([
      { start: 2, end: 3 },
    ]);
    expect(repeatAttachment.result.ok).toBe(false);
    if (!repeatAttachment.result.ok) {
      expect(
        repeatAttachment.result.insertableChords.map(({ symbolRange }) =>
          symbolRange,
        ),
      ).toEqual([
        { start: 2, end: 3 },
        { start: 6, end: 7 },
      ]);
    }

    const eventAttachment = parseChartTextWithEvidence(
      'C "x"D',
      FOUR_FOUR,
      "ascii",
    );
    expect(diagnosticProjection(eventAttachment.result)).toEqual([
      { code: "chart.unexpected_token", range: { start: 5, end: 6 } },
    ]);
    expect(eventAttachment.delegatedSymbols.map(({ symbolRange }) => symbolRange)).toEqual([
      { start: 0, end: 1 },
    ]);
    expect(eventAttachment.result.ok).toBe(false);
    if (!eventAttachment.result.ok) {
      expect(eventAttachment.result.insertableChords).toHaveLength(1);
    }

    const sectionAttachment = parseChartTextWithEvidence(
      '[A] "x"C:4',
      FOUR_FOUR,
      "ascii",
    );
    expect(diagnosticProjection(sectionAttachment.result)).toEqual([
      { code: "chart.unexpected_token", range: { start: 7, end: 8 } },
    ]);
    expect(sectionAttachment.delegatedSymbols).toEqual([]);
    expect(sectionAttachment.result.ok).toBe(false);
    if (!sectionAttachment.result.ok) {
      expect(sectionAttachment.result.insertableChords).toEqual([]);
    }

    const sectionBarAttachment = parseChartText(
      '[A] "x"| C:4 |',
      FOUR_FOUR,
      "ascii",
    );
    expect(diagnosticProjection(sectionBarAttachment)).toEqual([
      { code: "chart.unexpected_token", range: { start: 7, end: 8 } },
    ]);

    const sectionBarAttachmentWithEvidence = parseChartTextWithEvidence(
      '[A] "x"| C:4 |',
      FOUR_FOUR,
      "ascii",
    );
    expect(sectionBarAttachmentWithEvidence.delegatedSymbols).toEqual([]);
    expect(sectionBarAttachmentWithEvidence.result.ok).toBe(false);
    if (!sectionBarAttachmentWithEvidence.result.ok) {
      expect(sectionBarAttachmentWithEvidence.result.insertableChords).toEqual(
        [],
      );
    }

    expect(
      parseChartText('[A] "x" | C:4 |', FOUR_FOUR, "ascii"),
    ).toMatchObject({ ok: true });
  });

  test("resumes insertable-chord recovery at a line boundary after attached section junk", () => {
    const parsed = parseChartTextWithEvidence(
      "[A]]\n| C:4 |",
      FOUR_FOUR,
      "ascii",
    );

    expect(diagnosticProjection(parsed.result)).toEqual([
      { code: "chart.unexpected_token", range: { start: 3, end: 4 } },
    ]);
    expect(parsed.delegatedSymbols.map(({ symbolRange }) => symbolRange)).toEqual([
      { start: 7, end: 8 },
    ]);
    expect(parsed.result.ok).toBe(false);
    if (!parsed.result.ok) {
      expect(
        parsed.result.insertableChords.map((candidate) => ({
          ordinal: candidate.ordinal,
          range: candidate.range,
          symbolRange: candidate.symbolRange,
          duration: candidate.duration.kind === "resolved"
            ? {
                kind: candidate.duration.kind,
                source: candidate.duration.source,
                value: {
                  numerator: candidate.duration.value.numerator,
                  denominator: candidate.duration.value.denominator,
                },
              }
            : candidate.duration,
          layoutContextPreserved: candidate.layoutContextPreserved,
        })),
      ).toEqual([
        {
          ordinal: 0,
          range: { start: 7, end: 10 },
          symbolRange: { start: 7, end: 8 },
          duration: {
            kind: "resolved",
            source: "explicit",
            value: { numerator: 4, denominator: 1 },
          },
          layoutContextPreserved: false,
        },
      ]);
    }
    expect(parsed.evidence.insertableCandidatesProduced).toBe(1);
  });

  test("gives repeat annotation JSON faults precedence over repeat semantics", () => {
    const cases = [
      {
        sourceText: 'C / "unterminated',
        expected: {
          code: "chart.annotation_unclosed",
          range: { start: 4, end: 17 },
        },
      },
      {
        sourceText: '/ "unterminated',
        expected: {
          code: "chart.annotation_unclosed",
          range: { start: 2, end: 15 },
        },
      },
      {
        sourceText: 'C / "bad\\x"',
        expected: {
          code: "chart.annotation_invalid_json",
          range: { start: 4, end: 11 },
        },
      },
      {
        sourceText: '/ "x"',
        expected: {
          code: "chart.unsupported_notation",
          range: { start: 2, end: 5 },
        },
      },
    ] as const;

    for (const { sourceText, expected } of cases) {
      expect(diagnosticProjection(parseChartText(sourceText, FOUR_FOUR, "ascii"))).toEqual([
        expected,
      ]);
    }

    const annotatedRepeat = parseChartText(
      'C / "x"',
      FOUR_FOUR,
      "ascii",
    );
    expect(diagnosticProjection(annotatedRepeat)).toEqual([
      {
        code: "chart.unsupported_notation",
        range: { start: 4, end: 7 },
      },
    ]);
    expect(annotatedRepeat.ok).toBe(false);
    if (annotatedRepeat.ok) return;
    expect(
      annotatedRepeat.insertableChords.map(({ symbolRange }) => symbolRange),
    ).toEqual([{ start: 0, end: 1 }]);
  });

  test("bounds duration decimal construction before BigInt and preserves leading-zero source", () => {
    const accepted = parseChartTextWithEvidence(
      "| C:00000000002/00000000002 Dm:3 |",
      FOUR_FOUR,
      "ascii",
    );
    expect(accepted.result.ok).toBe(true);
    if (accepted.result.ok) {
      expect(accepted.result.canonicalText).toBe("| C:1 Dm:3 |\n");
      expect(accepted.result.draft.sourceText).toBe(
        "| C:00000000002/00000000002 Dm:3 |",
      );
    }
    expect(accepted.evidence).toMatchObject({
      numericComponentsCompared: 3,
      maxSourceBigIntDigits: 1,
      termination: "complete",
    });

    const refused = parseChartTextWithEvidence(
      "| C:2061584301121/960 |",
      FOUR_FOUR,
      "ascii",
    );
    expect(diagnosticProjection(refused.result)).toEqual([
      {
        code: "chart.duration_not_representable",
        range: { start: 3, end: 21 },
      },
    ]);
    expect(refused.evidence).toMatchObject({
      numericComponentsCompared: 2,
      maxSourceBigIntDigits: 0,
      termination: "complete",
    });
  });

  test("makes the first outer structural excess the sole diagnostic", () => {
    const sourceText =
      "@tempo 19\n@meter 4/4\n" +
      Array.from(
        { length: 65 },
        (_, index) => `[S${String(index).padStart(2, "0")}]\n| |\n`,
      ).join("");
    const parsed = parseChartTextWithEvidence(
      sourceText,
      { mode: "document" },
      "ascii",
    );

    expect(diagnosticProjection(parsed.result)).toEqual([
      {
        code: "limit.chart_sections_exceeded",
        range: { start: 661, end: 670 },
      },
    ]);
    expect(parsed.evidence).toMatchObject({
      sectionsObserved: 65,
      diagnosticsProduced: 1,
      termination: "chart-sections",
    });
  });

  test("gives a malformed sixty-fifth section local precedence over the section limit", () => {
    const prefix =
      "@meter 4/4\n" +
      Array.from(
        { length: 64 },
        (_, index) => `[S${String(index)}]\n| |\n`,
      ).join("");
    const cases = [
      {
        suffix: "[BROKEN\n| |\n",
        expected: {
          code: "chart.section_name_unclosed",
          range: { start: prefix.length, end: prefix.length + 7 },
        },
      },
      {
        suffix: "[B\\x]\n| |\n",
        expected: {
          code: "chart.section_name_escape_invalid",
          range: { start: prefix.length + 2, end: prefix.length + 4 },
        },
      },
    ] as const;

    for (const { suffix, expected } of cases) {
      const parsed = parseChartTextWithEvidence(
        prefix + suffix,
        { mode: "document" },
        "ascii",
      );
      expect(diagnosticProjection(parsed.result)).toEqual([expected]);
      expect(parsed.evidence).toMatchObject({
        sectionsObserved: 64,
        diagnosticsProduced: 1,
        termination: "complete",
      });
    }
  });

  test("reports astral UTF-8 overflow at the complete UTF-16 scalar range", () => {
    const sourceText =
      "@meter 4/4\n[A]\n| |\n;" + "x".repeat(2_097_131) + "𝄪";
    const parsed = parseChartTextWithEvidence(
      sourceText,
      { mode: "document" },
      "ascii",
    );

    expect(diagnosticProjection(parsed.result)).toEqual([
      {
        code: "limit.chart_utf8_bytes_exceeded",
        range: { start: 2_097_151, end: 2_097_153 },
      },
    ]);
    expect(parsed.evidence).toMatchObject({
      sourceUtf16CodeUnits: 2_097_153,
      sourceCodePoints: 2_097_152,
      sourceUtf8Bytes: 2_097_155,
      termination: "chart-bytes",
    });
  });

  test("never replaces caller-owned fragment meter data with a default", () => {
    const callerMeter = Object.freeze({
      beatsPerBar: 0,
      beatUnit: 16,
    }) as unknown as Meter;
    const parsed = parseChartText(
      "| |",
      { mode: "fragment", meter: callerMeter },
      "ascii",
    );

    expect(diagnosticProjection(parsed)).toEqual([
      { code: "chart.draft_unformattable", range: { start: 0, end: 0 } },
    ]);
  });

  test("validates duplicate header values before applying duplicate precedence", () => {
    const invalidTempo = parseChartText(
      "@tempo 120\n@tempo 19\n@meter 4/4\n[A]\n| C:4 |",
      { mode: "document" },
      "ascii",
    );
    expect(diagnosticProjection(invalidTempo)).toEqual([
      { code: "chart.header_invalid", range: { start: 11, end: 20 } },
    ]);

    const unclosedTitle = parseChartText(
      '@title "ok"\n@title "oops\n@meter 4/4\n[A]\n| C:4 |',
      { mode: "document" },
      "ascii",
    );
    expect(diagnosticProjection(unclosedTitle)).toEqual([
      { code: "chart.header_invalid", range: { start: 19, end: 24 } },
    ]);

    const oversizedTitle = parseChartTextWithEvidence(
      `@title "ok"\n@title "${"a".repeat(257)}"\n@meter 4/4\n[A]\n| C:4 |`,
      { mode: "document" },
      "ascii",
    );
    expect(diagnosticProjection(oversizedTitle.result)).toEqual([
      {
        code: "limit.chart_text_code_points_exceeded",
        range: { start: 19, end: 278 },
      },
    ]);
    expect(oversizedTitle.evidence.termination).toBe("chart-text-code-points");
  });

  test("keeps proven text limits ahead of later ordinary JSON damage but not surrogates", () => {
    const prefix = `@title "${"a".repeat(257)}`;
    const ordinaryInvalid = parseChartTextWithEvidence(
      `${prefix}\\q"\n@meter 4/4\n[A]\n| C:4 |`,
      { mode: "document" },
      "ascii",
    );
    expect(diagnosticProjection(ordinaryInvalid.result)).toEqual([
      {
        code: "limit.chart_text_code_points_exceeded",
        range: { start: 7, end: 268 },
      },
    ]);

    const escapedSurrogate = parseChartTextWithEvidence(
      `${prefix}\\uD800"\n@meter 4/4\n[A]\n| C:4 |`,
      { mode: "document" },
      "ascii",
    );
    expect(diagnosticProjection(escapedSurrogate.result)).toEqual([
      {
        code: "chart.invalid_unicode_scalar",
        range: { start: 265, end: 271 },
      },
    ]);
  });

  test("emits derived diagnostics for independent locally valid measures", () => {
    const unrelatedHeader = parseChartText(
      "@tempo 19\n@meter 4/4\n[A]\n| C:1 |",
      { mode: "document" },
      "ascii",
    );
    expect(diagnosticProjection(unrelatedHeader)).toEqual([
      { code: "chart.header_invalid", range: { start: 0, end: 9 } },
      { code: "chart.bar_underfilled", range: { start: 25, end: 32 } },
    ]);

    const independentMeasure = parseChartText(
      "| Cfoo:4 | Dm:1 |",
      FOUR_FOUR,
      "ascii",
    );
    expect(diagnosticProjection(independentMeasure)).toEqual([
      { code: "symbol.quality_unknown", range: { start: 3, end: 6 } },
      { code: "chart.bar_underfilled", range: { start: 9, end: 17 } },
    ]);
  });

  test("preflights oversized delegated spans without retaining the full symbol copy", () => {
    const sourceText = `C${"x".repeat(400)}`;
    const parsed = parseChartTextWithEvidence(sourceText, FOUR_FOUR, "ascii");

    expect(diagnosticProjection(parsed.result)).toEqual([
      {
        code: "limit.symbol_code_points_exceeded",
        range: { start: 256, end: 257 },
      },
    ]);
    expect(parsed.delegatedSymbols).toHaveLength(1);
    expect(parsed.delegatedSymbols[0]?.evidence).toMatchObject({
      sourceUtf16CodeUnits: 401,
      sourceCodePoints: 401,
      sourceUtf8Bytes: 401,
      lexerCodePointsVisited: 0,
      tokensProduced: 0,
      diagnosticsProduced: 1,
      termination: "symbol-code-points",
    });
  });

  test("reuses one candidate graph when finalizing exact draft-node evidence", () => {
    const parsed = parseChartTextWithEvidence(
      "C Dm G7 C",
      FOUR_FOUR,
      "ascii",
    );

    expect(parsed.result.ok).toBe(true);
    expect(parsed.evidence.peakDraftNodes).toBe(7);
  });

  test("counts grammar scalars at their actual consumption sites", () => {
    const astralSource = 'C "𝄪"';
    const astral = parseChartTextWithEvidence(
      astralSource,
      FOUR_FOUR,
      "ascii",
    );
    expect(astral.result.ok).toBe(true);
    expect(astral.evidence).toMatchObject({
      sourceUtf16CodeUnits: 6,
      sourceCodePoints: 5,
      lexerCodePointsVisited: 5,
    });

    const incompleteEscapeSource = 'C "\\u12"';
    const incompleteEscape = parseChartTextWithEvidence(
      incompleteEscapeSource,
      FOUR_FOUR,
      "ascii",
    );
    expect(diagnosticProjection(incompleteEscape.result)).toEqual([
      {
        code: "chart.annotation_invalid_json",
        range: { start: 2, end: 8 },
      },
    ]);
    expect(incompleteEscape.evidence).toMatchObject({
      sourceCodePoints: incompleteEscapeSource.length,
      lexerCodePointsVisited: incompleteEscapeSource.length,
    });
  });

  test("gives malformed token 65,537 local precedence over the token limit", () => {
    const prefix = ";\n".repeat(65_534) + "| C ";
    const cases = [
      {
        suffix: '"unterminated',
        expected: {
          code: "chart.annotation_unclosed",
          range: { start: prefix.length, end: prefix.length + 13 },
        },
      },
      {
        suffix: '"bad\\x"',
        expected: {
          code: "chart.annotation_invalid_json",
          range: { start: prefix.length, end: prefix.length + 7 },
        },
      },
    ] as const;

    for (const { suffix, expected } of cases) {
      const parsed = parseChartTextWithEvidence(
        prefix + suffix,
        FOUR_FOUR,
        "ascii",
      );
      expect(diagnosticProjection(parsed.result)).toEqual([expected]);
      expect(parsed.evidence).toMatchObject({
        tokensProduced: 65_537,
        parserTransitions: 65_537,
        slotsObserved: 0,
        diagnosticsProduced: 1,
        termination: "complete",
      });
    }

    const headerPrefix = ";\n".repeat(65_535);
    const unclosedHeader = parseChartTextWithEvidence(
      `${headerPrefix}@title "unterminated\n`,
      FOUR_FOUR,
      "ascii",
    );
    expect(diagnosticProjection(unclosedHeader.result)).toEqual([
      {
        code: "chart.header_invalid",
        range: {
          start: headerPrefix.length + 7,
          end: headerPrefix.length + 20,
        },
      },
    ]);
    expect(unclosedHeader.evidence).toMatchObject({
      tokensProduced: 65_537,
      parserTransitions: 65_537,
      headersObserved: 0,
      diagnosticsProduced: 1,
      termination: "complete",
    });

    const closedInvalidHeader = parseChartTextWithEvidence(
      `${headerPrefix}@title "bad\\x"\n`,
      FOUR_FOUR,
      "ascii",
    );
    expect(diagnosticProjection(closedInvalidHeader.result)).toEqual([
      {
        code: "chart.header_invalid",
        range: {
          start: headerPrefix.length + 7,
          end: headerPrefix.length + 14,
        },
      },
    ]);
    expect(closedInvalidHeader.evidence).toMatchObject({
      tokensProduced: 65_537,
      parserTransitions: 65_537,
      headersObserved: 0,
      diagnosticsProduced: 1,
      termination: "complete",
    });

    const coherentHeader = parseChartTextWithEvidence(
      `${headerPrefix}@title "ok"\n`,
      FOUR_FOUR,
      "ascii",
    );
    expect(diagnosticProjection(coherentHeader.result)).toEqual([
      {
        code: "limit.chart_tokens_exceeded",
        range: {
          start: headerPrefix.length + 7,
          end: headerPrefix.length + 11,
        },
      },
    ]);
    expect(coherentHeader.evidence).toMatchObject({
      tokensProduced: 65_537,
      parserTransitions: 65_537,
      headersObserved: 0,
      diagnosticsProduced: 1,
      termination: "chart-tokens",
    });
  }, 60_000);

  test("gives malformed event 8,193 local precedence over the event limit", () => {
    const prefix = "C " + "/ ".repeat(8_191);
    const cases = [
      {
        suffix: 'C "unterminated',
        expected: {
          code: "chart.annotation_unclosed",
          range: { start: prefix.length + 2, end: prefix.length + 15 },
        },
        tokensProduced: 8_194,
      },
      {
        suffix: "C(foo",
        expected: {
          code: "symbol.modifier_unclosed",
          range: { start: prefix.length + 1, end: prefix.length + 5 },
        },
        tokensProduced: 8_193,
      },
    ] as const;

    for (const { suffix, expected, tokensProduced } of cases) {
      const parsed = parseChartTextWithEvidence(
        prefix + suffix,
        FOUR_FOUR,
        "ascii",
      );
      expect(diagnosticProjection(parsed.result)).toEqual([expected]);
      expect(parsed.evidence).toMatchObject({
        tokensProduced,
        slotsObserved: 8_192,
        chordDelegations: 1,
        diagnosticsProduced: 1,
        termination: "complete",
      });
      expect(parsed.delegatedSymbols).toHaveLength(1);
    }
  }, 60_000);

  test("keeps parser transitions linear at the exact multi-section token limit", () => {
    const sections = Array.from(
      { length: 64 },
      (_, index) => `[S${String(index)}]\n| |\n`,
    ).join("");
    const exact =
      "@meter 4/4\n" + sections + ";\n".repeat(65_213);
    const accepted = parseChartTextWithEvidence(
      exact,
      { mode: "document" },
      "ascii",
    );
    expect(accepted.result.ok).toBe(true);
    expect(accepted.evidence).toMatchObject({
      tokensProduced: 65_536,
      parserTransitions: 65_536,
      sectionsObserved: 64,
      peakDraftNodes: 129,
      termination: "complete",
    });

    const refused = parseChartTextWithEvidence(
      `${exact};`,
      { mode: "document" },
      "ascii",
    );
    expect(diagnosticProjection(refused.result)).toEqual([
      {
        code: "limit.chart_tokens_exceeded",
        range: { start: exact.length, end: exact.length + 1 },
      },
    ]);
    expect(refused.evidence).toMatchObject({
      tokensProduced: 65_537,
      parserTransitions: 65_537,
      termination: "chart-tokens",
    });
  }, 60_000);
});
