import { describe, expect, test } from "bun:test";

import { makeBeatDuration, makeMeter, type ChordSpec } from "../../src/domain";
import {
  formatChartText,
  formatChartTextWithEvidence,
} from "../../src/theory/chart-formatter";
import { parseChordSymbol } from "../../src/theory/chord-symbol";
import {
  CHART_TEXT_DRAFT_SCHEMA,
  CHART_TEXT_GRAMMAR_ID,
  CHART_TEXT_GRAMMAR_VERSION,
  MAX_CHART_UTF8_BYTES,
  type ChartDraftEvent,
  type ChartDraftMeasure,
  type ChartDraftSection,
  type ChartTextDraft,
} from "../../src/theory/syntax-contract";

function chord(sourceText: string): ChordSpec {
  const parsed = parseChordSymbol(sourceText, "ascii");
  if (!parsed.ok) throw new Error(`invalid test chord ${sourceText}`);
  return parsed.chord;
}

function duration(numerator: number, denominator = 1) {
  const checked = makeBeatDuration({ numerator, denominator });
  if (!checked.ok) throw new Error("invalid test duration");
  return checked.value;
}

function meter(beatsPerBar = 4, beatUnit = 4) {
  const checked = makeMeter({ beatsPerBar, beatUnit });
  if (!checked.ok) throw new Error("invalid test meter");
  return checked.value;
}

function documentDraft(): ChartTextDraft {
  const sourceText = "@meter 4/4\n[A]\n| C:4 |";
  const event: ChartDraftEvent = {
    ordinal: 0,
    origin: "literal",
    repeatedFromOrdinal: null,
    chord: chord("C"),
    duration: duration(4),
    annotation: "",
    range: { start: 17, end: 20 },
    symbolRange: { start: 17, end: 18 },
    durationRange: { start: 18, end: 20 },
    annotationRange: null,
  };
  return {
    schema: CHART_TEXT_DRAFT_SCHEMA,
    grammarId: CHART_TEXT_GRAMMAR_ID,
    grammarVersion: CHART_TEXT_GRAMMAR_VERSION,
    mode: "document",
    sourceText,
    headers: {
      title: null,
      description: null,
      meter: meter(),
      tempoBpm: null,
      key: null,
    },
    sections: [
      {
        ordinal: 0,
        kind: "named",
        name: "A",
        annotation: "",
        range: { start: 11, end: 22 },
        measures: [
          {
            ordinal: 0,
            kind: "barred",
            range: { start: 15, end: 22 },
            events: [event],
          },
        ],
      },
    ],
  };
}

function repeatDraft(repeatChord: ChordSpec = chord("Cmaj7")): ChartTextDraft {
  const sourceText = 'Cmaj7:1 "hold" /:3';
  const literal: ChartDraftEvent = {
    ordinal: 0,
    origin: "literal",
    repeatedFromOrdinal: null,
    chord: chord("Cmaj7"),
    duration: duration(1),
    annotation: "hold",
    range: { start: 0, end: 14 },
    symbolRange: { start: 0, end: 5 },
    durationRange: { start: 5, end: 7 },
    annotationRange: { start: 8, end: 14 },
  };
  const repeat: ChartDraftEvent = {
    ordinal: 1,
    origin: "repeat",
    repeatedFromOrdinal: 0,
    chord: repeatChord,
    duration: duration(3),
    annotation: "",
    range: { start: 15, end: 18 },
    symbolRange: { start: 15, end: 16 },
    durationRange: { start: 16, end: 18 },
    annotationRange: null,
  };
  return {
    schema: CHART_TEXT_DRAFT_SCHEMA,
    grammarId: CHART_TEXT_GRAMMAR_ID,
    grammarVersion: CHART_TEXT_GRAMMAR_VERSION,
    mode: "fragment",
    sourceText,
    headers: {
      title: null,
      description: null,
      meter: meter(),
      tempoBpm: null,
      key: null,
    },
    sections: [
      {
        ordinal: 0,
        kind: "implicit",
        name: null,
        annotation: "",
        range: { start: 0, end: 18 },
        measures: [
          {
            ordinal: 0,
            kind: "virtual",
            range: { start: 0, end: 18 },
            events: [literal, repeat],
          },
        ],
      },
    ],
  };
}

function replaceFirstEvent(
  draft: ChartTextDraft,
  replacement: ChartDraftEvent,
): ChartTextDraft {
  const section = draft.sections[0];
  const measureValue = section?.measures[0];
  if (section === undefined || measureValue === undefined) {
    throw new Error("missing first test measure");
  }
  return {
    ...draft,
    sections: [
      {
        ...section,
        measures: [{ ...measureValue, events: [replacement] }],
      },
    ],
  };
}

function explicitEmptyAnnotationDraft(annotation: string): ChartTextDraft {
  const sourceText = 'C:4 ""';
  const event: ChartDraftEvent = {
    ordinal: 0,
    origin: "literal",
    repeatedFromOrdinal: null,
    chord: chord("C"),
    duration: duration(4),
    annotation,
    range: { start: 0, end: 6 },
    symbolRange: { start: 0, end: 1 },
    durationRange: { start: 1, end: 3 },
    annotationRange: { start: 4, end: 6 },
  };
  return {
    schema: CHART_TEXT_DRAFT_SCHEMA,
    grammarId: CHART_TEXT_GRAMMAR_ID,
    grammarVersion: CHART_TEXT_GRAMMAR_VERSION,
    mode: "fragment",
    sourceText,
    headers: {
      title: null,
      description: null,
      meter: meter(),
      tempoBpm: null,
      key: null,
    },
    sections: [
      {
        ordinal: 0,
        kind: "implicit",
        name: null,
        annotation: "",
        range: { start: 0, end: 6 },
        measures: [
          {
            ordinal: 0,
            kind: "virtual",
            range: { start: 0, end: 6 },
            events: [event],
          },
        ],
      },
    ],
  };
}

function allocatedDurationDraft(
  firstDuration: ChartDraftEvent["duration"],
  secondDuration: ChartDraftEvent["duration"],
): ChartTextDraft {
  const sourceText = "C D";
  const events: readonly ChartDraftEvent[] = [
    {
      ordinal: 0,
      origin: "literal",
      repeatedFromOrdinal: null,
      chord: chord("C"),
      duration: firstDuration,
      annotation: "",
      range: { start: 0, end: 1 },
      symbolRange: { start: 0, end: 1 },
      durationRange: null,
      annotationRange: null,
    },
    {
      ordinal: 1,
      origin: "literal",
      repeatedFromOrdinal: null,
      chord: chord("D"),
      duration: secondDuration,
      annotation: "",
      range: { start: 2, end: 3 },
      symbolRange: { start: 2, end: 3 },
      durationRange: null,
      annotationRange: null,
    },
  ];
  return {
    schema: CHART_TEXT_DRAFT_SCHEMA,
    grammarId: CHART_TEXT_GRAMMAR_ID,
    grammarVersion: CHART_TEXT_GRAMMAR_VERSION,
    mode: "fragment",
    sourceText,
    headers: {
      title: null,
      description: null,
      meter: meter(),
      tempoBpm: null,
      key: null,
    },
    sections: [
      {
        ordinal: 0,
        kind: "implicit",
        name: null,
        annotation: "",
        range: { start: 0, end: 3 },
        measures: [
          {
            ordinal: 0,
            kind: "virtual",
            range: { start: 0, end: 3 },
            events,
          },
        ],
      },
    ],
  };
}

function mixedDurationDraft(
  allocated: ChartDraftEvent["duration"],
): ChartTextDraft {
  const sourceText = "C:1 D";
  const events: readonly ChartDraftEvent[] = [
    {
      ordinal: 0,
      origin: "literal",
      repeatedFromOrdinal: null,
      chord: chord("C"),
      duration: duration(1),
      annotation: "",
      range: { start: 0, end: 3 },
      symbolRange: { start: 0, end: 1 },
      durationRange: { start: 1, end: 3 },
      annotationRange: null,
    },
    {
      ordinal: 1,
      origin: "literal",
      repeatedFromOrdinal: null,
      chord: chord("D"),
      duration: allocated,
      annotation: "",
      range: { start: 4, end: 5 },
      symbolRange: { start: 4, end: 5 },
      durationRange: null,
      annotationRange: null,
    },
  ];
  return {
    schema: CHART_TEXT_DRAFT_SCHEMA,
    grammarId: CHART_TEXT_GRAMMAR_ID,
    grammarVersion: CHART_TEXT_GRAMMAR_VERSION,
    mode: "fragment",
    sourceText,
    headers: {
      title: null,
      description: null,
      meter: meter(),
      tempoBpm: null,
      key: null,
    },
    sections: [
      {
        ordinal: 0,
        kind: "implicit",
        name: null,
        annotation: "",
        range: { start: 0, end: 5 },
        measures: [
          {
            ordinal: 0,
            kind: "virtual",
            range: { start: 0, end: 5 },
            events,
          },
        ],
      },
    ],
  };
}

function scrambledHeaderDraft(): ChartTextDraft {
  const sourceText = '@tempo 120\n@meter 4/4\n@title "X"\n[A]\n| C:4 |';
  const sectionStart = sourceText.indexOf("[A]");
  const measureStart = sourceText.indexOf("|", sectionStart);
  const symbolStart = sourceText.indexOf("C", measureStart);
  const event: ChartDraftEvent = {
    ordinal: 0,
    origin: "literal",
    repeatedFromOrdinal: null,
    chord: chord("C"),
    duration: duration(4),
    annotation: "",
    range: { start: symbolStart, end: symbolStart + 3 },
    symbolRange: { start: symbolStart, end: symbolStart + 1 },
    durationRange: { start: symbolStart + 1, end: symbolStart + 3 },
    annotationRange: null,
  };
  return {
    schema: CHART_TEXT_DRAFT_SCHEMA,
    grammarId: CHART_TEXT_GRAMMAR_ID,
    grammarVersion: CHART_TEXT_GRAMMAR_VERSION,
    mode: "document",
    sourceText,
    headers: {
      title: "X",
      description: null,
      meter: meter(),
      tempoBpm: 120,
      key: null,
    },
    sections: [
      {
        ordinal: 0,
        kind: "named",
        name: "A",
        annotation: "",
        range: { start: sectionStart, end: sourceText.length },
        measures: [
          {
            ordinal: 0,
            kind: "barred",
            range: { start: measureStart, end: sourceText.length },
            events: [event],
          },
        ],
      },
    ],
  };
}

function interMeasureGarbageDraft(): ChartTextDraft {
  const sourceText = "[A]\n| C:4 |XYZ\n| Dm:4 |";
  const firstMeasureStart = sourceText.indexOf("|");
  const firstMeasureEnd = firstMeasureStart + "| C:4 |".length;
  const secondMeasureStart = sourceText.indexOf("|", firstMeasureEnd);
  const firstSymbolStart = sourceText.indexOf("C", firstMeasureStart);
  const secondSymbolStart = sourceText.indexOf("Dm", secondMeasureStart);
  const firstEvent: ChartDraftEvent = {
    ordinal: 0,
    origin: "literal",
    repeatedFromOrdinal: null,
    chord: chord("C"),
    duration: duration(4),
    annotation: "",
    range: { start: firstSymbolStart, end: firstSymbolStart + 3 },
    symbolRange: { start: firstSymbolStart, end: firstSymbolStart + 1 },
    durationRange: {
      start: firstSymbolStart + 1,
      end: firstSymbolStart + 3,
    },
    annotationRange: null,
  };
  const secondEvent: ChartDraftEvent = {
    ordinal: 1,
    origin: "literal",
    repeatedFromOrdinal: null,
    chord: chord("Dm"),
    duration: duration(4),
    annotation: "",
    range: { start: secondSymbolStart, end: secondSymbolStart + 4 },
    symbolRange: { start: secondSymbolStart, end: secondSymbolStart + 2 },
    durationRange: {
      start: secondSymbolStart + 2,
      end: secondSymbolStart + 4,
    },
    annotationRange: null,
  };
  return {
    schema: CHART_TEXT_DRAFT_SCHEMA,
    grammarId: CHART_TEXT_GRAMMAR_ID,
    grammarVersion: CHART_TEXT_GRAMMAR_VERSION,
    mode: "fragment",
    sourceText,
    headers: {
      title: null,
      description: null,
      meter: meter(),
      tempoBpm: null,
      key: null,
    },
    sections: [
      {
        ordinal: 0,
        kind: "named",
        name: "A",
        annotation: "",
        range: { start: 0, end: sourceText.length },
        measures: [
          {
            ordinal: 0,
            kind: "barred",
            range: { start: firstMeasureStart, end: firstMeasureEnd },
            events: [firstEvent],
          },
          {
            ordinal: 1,
            kind: "barred",
            range: { start: secondMeasureStart, end: sourceText.length },
            events: [secondEvent],
          },
        ],
      },
    ],
  };
}

function sectionLimitDraft(
  firstExcessMutation: "none" | "gap" | "hull" = "none",
): ChartTextDraft {
  const prefix = "@meter 4/4\n";
  const sectionSources = Array.from(
    { length: 65 },
    (_, ordinal) =>
      `[S${String(ordinal).padStart(3, "0")}]${
        firstExcessMutation === "gap" && ordinal === 64 ? "" : "\n"
      }| |\n`,
  );
  const sourceText = `${prefix}${sectionSources.join("")}`;
  let nextSectionStart = prefix.length;
  const sections: ChartDraftSection[] = sectionSources.map(
    (source, ordinal) => {
      const start = nextSectionStart;
      nextSectionStart += source.length;
      const measureStart = start + source.indexOf("|");
      const measure: ChartDraftMeasure = {
        ordinal: 0,
        kind: "barred",
        range: { start: measureStart, end: measureStart + 3 },
        events: [],
      };
      return {
        ordinal,
        kind: "named",
        name: `S${String(ordinal).padStart(3, "0")}`,
        annotation: "",
        range: {
          start,
          end:
            firstExcessMutation === "hull" && ordinal === 64
              ? measureStart + 2
              : measureStart + 3,
        },
        measures: [measure],
      };
    },
  );
  return {
    schema: CHART_TEXT_DRAFT_SCHEMA,
    grammarId: CHART_TEXT_GRAMMAR_ID,
    grammarVersion: CHART_TEXT_GRAMMAR_VERSION,
    mode: "document",
    sourceText,
    headers: {
      title: null,
      description: null,
      meter: meter(),
      tempoBpm: null,
      key: null,
    },
    sections,
  };
}

type FirstExcessEventMutation =
  | "none"
  | "malformed-chord"
  | "literal-source-mismatch"
  | "repeat-coherent"
  | "repeat-source-mismatch"
  | "repeat-link-mismatch"
  | "repeat-chord-mismatch";

function eventLimitDraft(
  mutation: FirstExcessEventMutation,
): ChartTextDraft {
  const eventCount = 8_193;
  const firstExcessIsRepeat =
    mutation === "repeat-coherent" ||
    mutation === "repeat-source-mismatch" ||
    mutation === "repeat-link-mismatch" ||
    mutation === "repeat-chord-mismatch";
  const firstExcessSource =
    mutation === "literal-source-mismatch"
      ? "D"
      : firstExcessIsRepeat && mutation !== "repeat-source-mismatch"
        ? "/"
        : "C";
  const sourceText = Array.from(
    { length: eventCount },
    (_, ordinal) => ordinal === eventCount - 1 ? firstExcessSource : "C",
  ).join(" ");
  const validChord = chord("C");
  const mismatchedRepeatChord = chord("Dm");
  const malformedChord = {
    ...validChord,
    extensions: null,
  } as unknown as ChordSpec;
  const events: readonly ChartDraftEvent[] = Array.from(
    { length: eventCount },
    (_, ordinal) => {
      const start = ordinal * 2;
      const isFirstExcess = ordinal === eventCount - 1;
      return {
        ordinal,
        origin:
          isFirstExcess && firstExcessIsRepeat
            ? ("repeat" as const)
            : ("literal" as const),
        repeatedFromOrdinal:
          isFirstExcess && firstExcessIsRepeat
            ? mutation === "repeat-link-mismatch"
              ? 0
              : ordinal - 1
            : null,
        chord:
          mutation === "malformed-chord" && isFirstExcess
            ? malformedChord
            : mutation === "repeat-chord-mismatch" && isFirstExcess
              ? mismatchedRepeatChord
            : validChord,
        duration: duration(1, 960),
        annotation: "",
        range: { start, end: start + 1 },
        symbolRange: { start, end: start + 1 },
        durationRange: null,
        annotationRange: null,
      };
    },
  );
  return {
    schema: CHART_TEXT_DRAFT_SCHEMA,
    grammarId: CHART_TEXT_GRAMMAR_ID,
    grammarVersion: CHART_TEXT_GRAMMAR_VERSION,
    mode: "fragment",
    sourceText,
    headers: {
      title: null,
      description: null,
      meter: meter(32, 2),
      tempoBpm: null,
      key: null,
    },
    sections: [
      {
        ordinal: 0,
        kind: "implicit",
        name: null,
        annotation: "",
        range: { start: 0, end: sourceText.length },
        measures: [
          {
            ordinal: 0,
            kind: "virtual",
            range: { start: 0, end: sourceText.length },
            events,
          },
        ],
      },
    ],
  };
}

function encodedAnnotationDraft(
  encodedAnnotation: string,
  annotation: string,
): ChartTextDraft {
  const sourceText = `C:4 ${encodedAnnotation}`;
  const annotationRange = {
    start: 4,
    end: 4 + encodedAnnotation.length,
  };
  const event: ChartDraftEvent = {
    ordinal: 0,
    origin: "literal",
    repeatedFromOrdinal: null,
    chord: chord("C"),
    duration: duration(4),
    annotation,
    range: { start: 0, end: annotationRange.end },
    symbolRange: { start: 0, end: 1 },
    durationRange: { start: 1, end: 3 },
    annotationRange,
  };
  return {
    schema: CHART_TEXT_DRAFT_SCHEMA,
    grammarId: CHART_TEXT_GRAMMAR_ID,
    grammarVersion: CHART_TEXT_GRAMMAR_VERSION,
    mode: "fragment",
    sourceText,
    headers: {
      title: null,
      description: null,
      meter: meter(),
      tempoBpm: null,
      key: null,
    },
    sections: [
      {
        ordinal: 0,
        kind: "implicit",
        name: null,
        annotation: "",
        range: { start: 0, end: annotationRange.end },
        measures: [
          {
            ordinal: 0,
            kind: "virtual",
            range: { start: 0, end: annotationRange.end },
            events: [event],
          },
        ],
      },
    ],
  };
}

function eventAnnotationLimitDraft(): ChartTextDraft {
  const annotation = "x".repeat(2_001);
  return encodedAnnotationDraft(`"${annotation}"`, annotation);
}

describe("T0 chart formatter", () => {
  test("emits canonical document text with exact formatter evidence", () => {
    const formatted = formatChartTextWithEvidence(documentDraft(), "ascii");
    expect(formatted.result).toEqual({
      ok: true,
      canonicalText: "@meter 4/4\n[A]\n| C:4 |\n",
    });
    expect(formatted.evidence).toMatchObject({
      sourceUtf16CodeUnits: 22,
      sourceCodePoints: 22,
      sourceUtf8Bytes: 22,
      headersObserved: 1,
      sectionsObserved: 1,
      measuresObserved: 1,
      slotsObserved: 1,
      chordDelegations: 1,
      diagnosticsProduced: 0,
      termination: "complete",
    });
  });

  test("preserves a coherent repeat and translates nested formatter ranges", () => {
    expect(formatChartText(repeatDraft(), "ascii")).toEqual({
      ok: true,
      canonicalText: 'Cmaj7:1 "hold" /:3\n',
    });

    const parsed = chord("Cmaj7");
    const invalidChord: ChordSpec = {
      ...parsed,
      sixth: { number: 6, alter: 0 },
    };
    const refused = formatChartText(repeatDraft(invalidChord), "ascii");
    expect(refused.ok).toBe(false);
    if (refused.ok) throw new Error("unformattable repeat chord was accepted");
    expect(refused.diagnostics).toHaveLength(1);
    expect(refused.diagnostics[0]).toMatchObject({
      code: "chart.draft_unformattable",
      range: { start: 15, end: 18 },
    });
    expect(typeof refused.diagnostics[0].message).toBe("string");

    const literalDraft = documentDraft();
    const literalSection = literalDraft.sections[0];
    const literalMeasure = literalSection?.measures[0];
    const literalEvent = literalMeasure?.events[0];
    if (
      literalSection === undefined ||
      literalMeasure === undefined ||
      literalEvent === undefined
    ) {
      throw new Error("missing literal formatter-range fixture");
    }
    const nestedRefusal = formatChartText(
      {
        ...literalDraft,
        sections: [
          {
            ...literalSection,
            measures: [
              {
                ...literalMeasure,
                events: [
                  {
                    ...literalEvent,
                    chord: {
                      ...chord("C"),
                      extensions: [{ number: 9, alter: 0 }],
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
      "ascii",
    );
    expect(nestedRefusal).toMatchObject({
      ok: false,
      diagnostics: [
        {
          code: "symbol.ast_unformattable",
          range: { start: 17, end: 18 },
        },
      ],
    });
  });

  test("refuses incoherent ranges transactionally at the stable zero range", () => {
    const base = documentDraft();
    const section = base.sections[0];
    const measureValue = section?.measures[0];
    const event = measureValue?.events[0];
    if (
      section === undefined ||
      measureValue === undefined ||
      event === undefined
    ) {
      throw new Error("incomplete test draft");
    }
    const malformed: ChartTextDraft = {
      ...base,
      sections: [
        {
          ...section,
          measures: [
            {
              ...measureValue,
              events: [
                {
                  ...event,
                  symbolRange: { start: 17, end: base.sourceText.length + 1 },
                },
              ],
            },
          ],
        },
      ],
    };
    const result = formatChartText(malformed, "ascii");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("malformed range was accepted");
    expect(result.diagnostics[0]).toMatchObject({
      code: "chart.draft_unformattable",
      range: { start: 0, end: 0 },
    });
    expect("canonicalText" in result).toBe(false);
  });

  test("stops at the coherent first section beyond the structural limit", () => {
    const malformed = formatChartTextWithEvidence(
      sectionLimitDraft("gap"),
      "ascii",
    );
    expect(malformed.result).toMatchObject({
      ok: false,
      diagnostics: [
        {
          code: "chart.draft_unformattable",
          range: { start: 715, end: 724 },
        },
      ],
    });
    expect(malformed.evidence).toMatchObject({
      sectionsObserved: 64,
      measuresObserved: 64,
      slotsObserved: 0,
      chordDelegations: 0,
      termination: "complete",
    });

    const malformedHull = formatChartTextWithEvidence(
      sectionLimitDraft("hull"),
      "ascii",
    );
    expect(malformedHull.result).toMatchObject({
      ok: false,
      diagnostics: [
        {
          code: "chart.draft_unformattable",
          range: { start: 715, end: 724 },
        },
      ],
    });
    expect(malformedHull.evidence).toMatchObject({
      sectionsObserved: 64,
      measuresObserved: 64,
      slotsObserved: 0,
      chordDelegations: 0,
      termination: "complete",
    });

    const formatted = formatChartTextWithEvidence(sectionLimitDraft(), "ascii");
    expect(formatted.result.ok).toBe(false);
    if (formatted.result.ok) throw new Error("over-limit draft was accepted");
    expect(formatted.result.diagnostics[0]).toMatchObject({
      code: "limit.chart_sections_exceeded",
      range: { start: 715, end: 725 },
    });
    expect(formatted.evidence).toMatchObject({
      sectionsObserved: 65,
      measuresObserved: 64,
      slotsObserved: 0,
      chordDelegations: 0,
      diagnosticsProduced: 1,
      termination: "chart-sections",
    });
  });

  test("validates first-excess event shape before choosing the event limit", () => {
    const malformed = formatChartTextWithEvidence(
      eventLimitDraft("malformed-chord"),
      "ascii",
    );
    expect(malformed.result).toMatchObject({
      ok: false,
      diagnostics: [
        {
          code: "chart.draft_unformattable",
          range: { start: 16_384, end: 16_385 },
        },
      ],
    });
    expect(malformed.evidence).toMatchObject({
      slotsObserved: 8_192,
      chordDelegations: 8_192,
      termination: "complete",
    });

    for (const mutation of [
      "literal-source-mismatch",
      "repeat-source-mismatch",
      "repeat-link-mismatch",
      "repeat-chord-mismatch",
    ] as const) {
      const incoherent = formatChartTextWithEvidence(
        eventLimitDraft(mutation),
        "ascii",
      );
      expect(incoherent.result).toMatchObject({
        ok: false,
        diagnostics: [
          {
            code: "chart.draft_unformattable",
            range: { start: 16_384, end: 16_385 },
          },
        ],
      });
      expect(incoherent.evidence).toMatchObject({
        slotsObserved: 8_192,
        chordDelegations: 8_192,
        termination: "complete",
      });
    }

    const coherent = formatChartTextWithEvidence(
      eventLimitDraft("none"),
      "ascii",
    );
    expect(coherent.result).toMatchObject({
      ok: false,
      diagnostics: [
        {
          code: "limit.chart_events_exceeded",
          range: { start: 16_384, end: 16_385 },
        },
      ],
    });
    expect(coherent.evidence).toMatchObject({
      slotsObserved: 8_193,
      chordDelegations: 8_192,
      termination: "chart-events",
    });

    const coherentRepeat = formatChartTextWithEvidence(
      eventLimitDraft("repeat-coherent"),
      "ascii",
    );
    expect(coherentRepeat.result).toMatchObject({
      ok: false,
      diagnostics: [
        {
          code: "limit.chart_events_exceeded",
          range: { start: 16_384, end: 16_385 },
        },
      ],
    });
    expect(coherentRepeat.evidence).toMatchObject({
      slotsObserved: 8_193,
      chordDelegations: 8_192,
      termination: "chart-events",
    });
  }, 60_000);

  test("does not guess source ranges for unaddressable decoded-field faults", () => {
    const base = documentDraft();
    const badHeader: ChartTextDraft = {
      ...base,
      headers: { ...base.headers, title: "x".repeat(257) },
    };
    const headerResult = formatChartTextWithEvidence(badHeader, "ascii");
    expect(headerResult.result).toMatchObject({
      ok: false,
      diagnostics: [
        {
          code: "chart.draft_unformattable",
          range: { start: 0, end: 0 },
        },
      ],
    });
    expect(headerResult.evidence.termination).toBe("complete");

    const section = base.sections[0];
    if (section === undefined) throw new Error("missing test section");
    const badSection: ChartTextDraft = {
      ...base,
      sections: [{ ...section, annotation: "x".repeat(2_001) }],
    };
    const sectionResult = formatChartText(badSection, "ascii");
    expect(sectionResult).toMatchObject({
      ok: false,
      diagnostics: [
        {
          code: "chart.draft_unformattable",
          range: section.range,
        },
      ],
    });

    const repeat = repeatDraft();
    const repeatSection = repeat.sections[0];
    const repeatMeasure = repeatSection?.measures[0];
    const literal = repeatMeasure?.events[0];
    const repeated = repeatMeasure?.events[1];
    if (
      repeatSection === undefined ||
      repeatMeasure === undefined ||
      literal === undefined ||
      repeated === undefined
    ) {
      throw new Error("missing repeat test records");
    }
    const badDecodedScalar: ChartTextDraft = {
      ...repeat,
      sections: [
        {
          ...repeatSection,
          measures: [
            {
              ...repeatMeasure,
              events: [{ ...literal, annotation: "\ud800" }, repeated],
            },
          ],
        },
      ],
    };
    expect(formatChartText(badDecodedScalar, "ascii")).toMatchObject({
      ok: false,
      diagnostics: [
        {
          code: "chart.draft_unformattable",
          range: literal.range,
        },
      ],
    });
  });

  test("uses the stored event annotation range for an addressable text limit", () => {
    const draft = eventAnnotationLimitDraft();
    const result = formatChartTextWithEvidence(draft, "ascii");
    expect(result.result).toMatchObject({
      ok: false,
      diagnostics: [
        {
          code: "limit.chart_text_code_points_exceeded",
          range: { start: 4, end: 2_007 },
        },
      ],
    });
    expect(result.evidence).toMatchObject({
      maxDecodedTextCodePointsObserved: 2_001,
      diagnosticsProduced: 1,
      termination: "chart-text-code-points",
    });
  });

  test("streams encoded annotations through escapes without proportional decoding", () => {
    const ordinaryEscapes = 'line\n"\\tail';
    expect(
      formatChartText(
        encodedAnnotationDraft(
          JSON.stringify(ordinaryEscapes),
          ordinaryEscapes,
        ),
        "ascii",
      ),
    ).toEqual({
      ok: true,
      canonicalText: `C:4 ${JSON.stringify(ordinaryEscapes)}\n`,
    });

    const astralAnnotation = "𝄪".repeat(2_001);
    const escapedAstral = `"${"\\ud834\\udd2a".repeat(2_001)}"`;
    const astralResult = formatChartTextWithEvidence(
      encodedAnnotationDraft(escapedAstral, astralAnnotation),
      "ascii",
    );
    expect(astralResult.result).toMatchObject({
      ok: false,
      diagnostics: [
        {
          code: "limit.chart_text_code_points_exceeded",
          range: { start: 4, end: 24_018 },
        },
      ],
    });
    expect(astralResult.evidence).toMatchObject({
      maxDecodedTextCodePointsObserved: 2_001,
      diagnosticsProduced: 1,
      termination: "chart-text-code-points",
    });

    const hostileRaw = `"${"x".repeat(24_000)}"`;
    const hostileDraft = encodedAnnotationDraft(hostileRaw, "y");
    const hostileResult = formatChartTextWithEvidence(hostileDraft, "ascii");
    expect(hostileResult.result).toMatchObject({
      ok: false,
      diagnostics: [
        {
          code: "chart.draft_unformattable",
          range: { start: 0, end: hostileDraft.sourceText.length },
        },
      ],
    });
    expect(hostileResult.evidence).toMatchObject({
      maxDecodedTextCodePointsObserved: 0,
      termination: "complete",
    });
  });

  test("counts only present headers, including a present-invalid fragment meter", () => {
    const base = documentDraft();
    const missingDocumentMeter = formatChartTextWithEvidence(
      { ...base, headers: { ...base.headers, meter: null } },
      "ascii",
    );
    expect(missingDocumentMeter.result.ok).toBe(false);
    expect(missingDocumentMeter.evidence.headersObserved).toBe(0);

    const invalidMeter = { beatsPerBar: 0, beatUnit: 4 };
    const invalidDocumentMeter = formatChartTextWithEvidence(
      {
        ...base,
        headers: {
          ...base.headers,
          meter: invalidMeter as unknown as ChartTextDraft["headers"]["meter"],
        },
      },
      "ascii",
    );
    expect(invalidDocumentMeter.result.ok).toBe(false);
    expect(invalidDocumentMeter.evidence.headersObserved).toBe(1);

    const fragment = repeatDraft();
    const validFragment = formatChartTextWithEvidence(fragment, "ascii");
    expect(validFragment.result.ok).toBe(true);
    expect(validFragment.evidence.headersObserved).toBe(1);
    const invalidFragmentMeter = formatChartTextWithEvidence(
      {
        ...fragment,
        headers: {
          ...fragment.headers,
          meter: invalidMeter as unknown as ChartTextDraft["headers"]["meter"],
        },
      },
      "ascii",
    );
    expect(invalidFragmentMeter.result.ok).toBe(false);
    expect(invalidFragmentMeter.evidence.headersObserved).toBe(1);
  });

  test("reports full-source evidence after the first UTF-8 byte crossing", () => {
    const sourceText = `${"x".repeat(MAX_CHART_UTF8_BYTES + 1)}雪`;
    const malformed = {
      sourceText,
    } as unknown as ChartTextDraft;
    const result = formatChartTextWithEvidence(malformed, "ascii");
    expect(result.result).toMatchObject({
      ok: false,
      diagnostics: [
        {
          code: "limit.chart_utf8_bytes_exceeded",
          range: {
            start: MAX_CHART_UTF8_BYTES,
            end: MAX_CHART_UTF8_BYTES + 1,
          },
        },
      ],
    });
    expect(result.evidence).toMatchObject({
      sourceUtf16CodeUnits: MAX_CHART_UTF8_BYTES + 2,
      sourceCodePoints: MAX_CHART_UTF8_BYTES + 2,
      sourceUtf8Bytes: MAX_CHART_UTF8_BYTES + 4,
      termination: "chart-bytes",
    });
  });

  test("bounds a section name before escape amplification", () => {
    const base = documentDraft();
    const section = base.sections[0];
    if (section === undefined) throw new Error("missing test section");
    const amplifiedName = "\\".repeat(257);
    const result = formatChartTextWithEvidence(
      { ...base, sections: [{ ...section, name: amplifiedName }] },
      "ascii",
    );
    expect(result.result).toMatchObject({
      ok: false,
      diagnostics: [
        {
          code: "chart.draft_unformattable",
          range: section.range,
        },
      ],
    });
    expect(result.evidence).toMatchObject({
      maxDecodedTextCodePointsObserved: 257,
      sectionsObserved: 0,
      chordDelegations: 0,
    });
  });

  test("requires source annotation and duration components to equal semantics", () => {
    expect(formatChartText(explicitEmptyAnnotationDraft(""), "ascii")).toEqual({
      ok: true,
      canonicalText: "C:4\n",
    });
    const inventedAnnotation = formatChartText(
      explicitEmptyAnnotationDraft("invented"),
      "ascii",
    );
    expect(inventedAnnotation).toMatchObject({
      ok: false,
      diagnostics: [
        {
          code: "chart.draft_unformattable",
          range: { start: 0, end: 6 },
        },
      ],
    });

    const base = documentDraft();
    const mismatchedDuration = formatChartText(
      { ...base, sourceText: base.sourceText.replace("C:4", "C:1") },
      "ascii",
    );
    expect(mismatchedDuration).toMatchObject({
      ok: false,
      diagnostics: [
        {
          code: "chart.draft_unformattable",
          range: { start: 17, end: 20 },
        },
      ],
    });
  });

  test("recomputes the exact equal allocation for omitted durations", () => {
    expect(
      formatChartText(
        allocatedDurationDraft(duration(2), duration(2)),
        "ascii",
      ),
    ).toEqual({
      ok: true,
      canonicalText: "C:2 D:2\n",
    });

    const unequal = formatChartText(
      allocatedDurationDraft(duration(1), duration(3)),
      "ascii",
    );
    expect(unequal).toMatchObject({
      ok: false,
      diagnostics: [
        {
          code: "chart.draft_unformattable",
          range: { start: 0, end: 1 },
        },
      ],
    });

    expect(formatChartText(mixedDurationDraft(duration(3)), "ascii")).toEqual({
      ok: true,
      canonicalText: "C:1 D:3\n",
    });
    expect(
      formatChartText(mixedDurationDraft(duration(2)), "ascii"),
    ).toMatchObject({
      ok: false,
      diagnostics: [
        {
          code: "chart.draft_unformattable",
          range: { start: 4, end: 5 },
        },
      ],
    });
  });

  test("refuses malformed runtime chord shapes without throwing", () => {
    const base = documentDraft();
    const event = base.sections[0]?.measures[0]?.events[0];
    if (event === undefined) throw new Error("missing test event");

    for (const malformedChord of [
      { ...event.chord, kind: "bogus" },
      { ...event.chord, extensions: null },
      { ...event.chord, root: null },
    ]) {
      const malformed = replaceFirstEvent(base, {
        ...event,
        chord: malformedChord as unknown as ChordSpec,
      });
      expect(() => formatChartText(malformed, "ascii")).not.toThrow();
      expect(formatChartText(malformed, "ascii")).toMatchObject({
        ok: false,
        diagnostics: [
          {
            code: "chart.draft_unformattable",
            range: event.range,
          },
        ],
      });
    }
  });

  test("covers the complete source while preserving legal trivia and header order freedom", () => {
    expect(formatChartText(scrambledHeaderDraft(), "ascii")).toEqual({
      ok: true,
      canonicalText: '@title "X"\n@meter 4/4\n@tempo 120\n[A]\n| C:4 |\n',
    });

    const base = documentDraft();
    expect(
      formatChartText(
        { ...base, sourceText: `${base.sourceText}\n; trailing\n\t` },
        "ascii",
      ),
    ).toEqual({
      ok: true,
      canonicalText: "@meter 4/4\n[A]\n| C:4 |\n",
    });

    const badPrelude = formatChartText(
      {
        ...base,
        sourceText: `GARBAGE!!!\n${base.sourceText.slice(11)}`,
      },
      "ascii",
    );
    expect(badPrelude).toMatchObject({
      ok: false,
      diagnostics: [
        { code: "chart.draft_unformattable", range: { start: 0, end: 0 } },
      ],
    });

    const badTail = formatChartText(
      { ...base, sourceText: `${base.sourceText}GARBAGE` },
      "ascii",
    );
    expect(badTail).toMatchObject({
      ok: false,
      diagnostics: [
        { code: "chart.draft_unformattable", range: base.sections[0]?.range },
      ],
    });

    const badMeasureGap = formatChartText(interMeasureGarbageDraft(), "ascii");
    expect(badMeasureGap).toMatchObject({
      ok: false,
      diagnostics: [
        {
          code: "chart.draft_unformattable",
          range: interMeasureGarbageDraft().sections[0]?.measures[1]?.range,
        },
      ],
    });
  });

  test("returns no partial chart after a late event fault", () => {
    const base = repeatDraft();
    const section = base.sections[0];
    const measureValue = section?.measures[0];
    const literal = measureValue?.events[0];
    const repeated = measureValue?.events[1];
    if (
      section === undefined ||
      measureValue === undefined ||
      literal === undefined ||
      repeated === undefined
    ) {
      throw new Error("missing repeat records");
    }
    const result = formatChartTextWithEvidence(
      {
        ...base,
        sections: [
          {
            ...section,
            measures: [
              {
                ...measureValue,
                events: [literal, { ...repeated, repeatedFromOrdinal: 1 }],
              },
            ],
          },
        ],
      },
      "ascii",
    );
    expect(result.result.ok).toBe(false);
    expect("canonicalText" in result.result).toBe(false);
    expect(result.evidence.chordDelegations).toBe(1);
  });
});
