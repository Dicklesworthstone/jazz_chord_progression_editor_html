import {
  ALLOWED_BEAT_DENOMINATORS,
  KEY_MODES,
  MAX_LONG_TEXT_CODE_POINTS,
  MAX_NORMALIZED_BEAT_NUMERATOR,
  MAX_SHORT_TEXT_CODE_POINTS,
  MAX_TEMPO_BPM,
  MAX_TIMELINE_QUARTER_NOTE_BEATS,
  MIDI_PPQ,
  MIN_TEMPO_BPM,
  makeBeatDuration,
  makeMeter,
  makeSpelledPitchClass,
  type ChordSpec,
  type KeyContext,
  type Meter,
  type SpelledPitchClass,
} from "../domain";
import { formatChordSymbol } from "./chord-symbol";
import type {
  FormatChartTextWithEvidence,
  SyntaxResultWithEvidence,
  SyntaxWorkEvidence,
} from "./syntax-evidence-contract";
import {
  CHART_TEXT_DRAFT_SCHEMA,
  CHART_TEXT_GRAMMAR_ID,
  CHART_TEXT_GRAMMAR_VERSION,
  MAX_CHART_EVENTS,
  MAX_CHART_MEASURES_PER_SECTION,
  MAX_CHART_SECTIONS,
  MAX_CHART_UTF8_BYTES,
  MAX_SYMBOL_MODIFIERS,
  type AccidentalStyle,
  type ChartDiagnostic,
  type ChartDraftEvent,
  type ChartTextDraft,
  type ChartTextFormatResult,
  type SourceRange,
} from "./syntax-contract";

type MutableEvidence = {
  -readonly [Field in keyof SyntaxWorkEvidence]: SyntaxWorkEvidence[Field];
};

type CheckedRange = Readonly<{ start: number; end: number }>;

type TextInspection =
  | Readonly<{ ok: true; codePoints: number }>
  | Readonly<{
      ok: false;
      code:
        | "chart.invalid_unicode_scalar"
        | "limit.chart_text_code_points_exceeded";
      range: CheckedRange;
      termination: "complete" | "chart-text-code-points";
    }>;

type PreflightResult =
  | Readonly<{ ok: true }>
  | Readonly<{
      ok: false;
      code: "chart.invalid_unicode_scalar" | "limit.chart_utf8_bytes_exceeded";
      range: CheckedRange;
      termination: "complete" | "chart-bytes";
    }>;

type JsonStringComparison =
  | Readonly<{ ok: false }>
  | Readonly<{
      ok: true;
      decodedCodePoints: number;
      firstInvalidScalarPrefix: number | null;
    }>;

type PreviousEvent = Readonly<{
  event: ChartDraftEvent;
}>;

const ALLOWED_DENOMINATORS: ReadonlySet<number> = new Set(
  ALLOWED_BEAT_DENOMINATORS,
);
const ALLOWED_KEY_MODES: ReadonlySet<string> = new Set(KEY_MODES);
const ZERO_RANGE: CheckedRange = Object.freeze({ start: 0, end: 0 });

function createEvidence(): MutableEvidence {
  return {
    sourceUtf16CodeUnits: 0,
    sourceCodePoints: 0,
    sourceUtf8Bytes: 0,
    maxDecodedTextCodePointsObserved: 0,
    lexerCodePointsVisited: 0,
    tokensProduced: 0,
    parserTransitions: 0,
    modifierItemsObserved: 0,
    headersObserved: 0,
    sectionsObserved: 0,
    measuresObserved: 0,
    slotsObserved: 0,
    chordDelegations: 0,
    allocationDivisions: 0,
    numericComponentsCompared: 0,
    maxSourceBigIntDigits: 0,
    suggestionsCompared: 0,
    diagnosticsProduced: 0,
    insertableCandidatesProduced: 0,
    peakTokenRecords: 0,
    peakDraftNodes: 0,
    peakSuggestionRecords: 0,
    termination: "complete",
  };
}

function freezeEvidence(evidence: MutableEvidence): SyntaxWorkEvidence {
  return Object.freeze({ ...evidence });
}

function frozenRange(range: CheckedRange): SourceRange {
  return Object.freeze({ start: range.start, end: range.end });
}

function diagnostic(
  code: ChartDiagnostic["code"],
  range: CheckedRange,
  message: string,
): ChartDiagnostic {
  return Object.freeze({ code, range: frozenRange(range), message });
}

function failed(
  evidence: MutableEvidence,
  diagnostics: readonly ChartDiagnostic[],
  termination: SyntaxWorkEvidence["termination"] = "complete",
): SyntaxResultWithEvidence<ChartTextFormatResult> {
  const nonemptyDiagnostics = Object.freeze([...diagnostics]) as readonly [
    ChartDiagnostic,
    ...ChartDiagnostic[],
  ];
  evidence.diagnosticsProduced = nonemptyDiagnostics.length;
  evidence.termination = termination;
  return Object.freeze({
    result: Object.freeze({ ok: false, diagnostics: nonemptyDiagnostics }),
    evidence: freezeEvidence(evidence),
  });
}

function draftFailure(
  evidence: MutableEvidence,
  range: CheckedRange,
  message: string,
): SyntaxResultWithEvidence<ChartTextFormatResult> {
  return failed(evidence, [
    diagnostic("chart.draft_unformattable", range, message),
  ]);
}

function limitFailure(
  evidence: MutableEvidence,
  code:
    | "limit.chart_utf8_bytes_exceeded"
    | "limit.chart_text_code_points_exceeded"
    | "limit.chart_sections_exceeded"
    | "limit.chart_measures_per_section_exceeded"
    | "limit.chart_events_exceeded",
  range: CheckedRange,
  termination: SyntaxWorkEvidence["termination"],
  message: string,
): SyntaxResultWithEvidence<ChartTextFormatResult> {
  return failed(evidence, [diagnostic(code, range, message)], termination);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

function isSafeOffset(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === "number";
}

function checkedRange(
  value: unknown,
  sourceLength: number,
): CheckedRange | null {
  if (!isRecord(value)) return null;
  const { start, end } = value;
  if (!isSafeOffset(start) || !isSafeOffset(end)) return null;
  if (start < 0 || end < start || end > sourceLength) return null;
  return Object.freeze({ start, end });
}

function rangeContains(outer: CheckedRange, inner: CheckedRange): boolean {
  return outer.start <= inner.start && inner.end <= outer.end;
}

function sameRange(left: CheckedRange, right: CheckedRange): boolean {
  return left.start === right.start && left.end === right.end;
}

function utf8Width(codePoint: number): number {
  if (codePoint <= 0x7f) return 1;
  if (codePoint <= 0x7ff) return 2;
  if (codePoint <= 0xffff) return 3;
  return 4;
}

/**
 * Checks scalar validity before honoring the byte stop, while retaining the
 * semantic counter projection at the first scalar that crossed the byte cap.
 */
function preflightSource(
  sourceText: string,
  evidence: MutableEvidence,
): PreflightResult {
  evidence.sourceUtf16CodeUnits = sourceText.length;

  let codePoints = 0;
  let utf8Bytes = 0;
  let firstByteCrossing:
    | Readonly<{
        range: CheckedRange;
      }>
    | undefined;

  for (let offset = 0; offset < sourceText.length;) {
    const first = sourceText.charCodeAt(offset);
    let width = 1;
    let codePoint = first;

    if (first >= 0xd800 && first <= 0xdbff) {
      const second = sourceText.charCodeAt(offset + 1);
      if (!(second >= 0xdc00 && second <= 0xdfff)) {
        evidence.sourceCodePoints = codePoints;
        evidence.sourceUtf8Bytes = utf8Bytes;
        return Object.freeze({
          ok: false,
          code: "chart.invalid_unicode_scalar",
          range: Object.freeze({ start: offset, end: offset + 1 }),
          termination: "complete",
        });
      }
      width = 2;
      codePoint = 0x10000 + ((first - 0xd800) << 10) + (second - 0xdc00);
    } else if (first >= 0xdc00 && first <= 0xdfff) {
      evidence.sourceCodePoints = codePoints;
      evidence.sourceUtf8Bytes = utf8Bytes;
      return Object.freeze({
        ok: false,
        code: "chart.invalid_unicode_scalar",
        range: Object.freeze({ start: offset, end: offset + 1 }),
        termination: "complete",
      });
    }

    codePoints += 1;
    utf8Bytes += utf8Width(codePoint);
    if (utf8Bytes > MAX_CHART_UTF8_BYTES && firstByteCrossing === undefined) {
      firstByteCrossing = Object.freeze({
        range: Object.freeze({ start: offset, end: offset + width }),
      });
    }
    offset += width;
  }

  if (firstByteCrossing !== undefined) {
    evidence.sourceCodePoints = codePoints;
    evidence.sourceUtf8Bytes = utf8Bytes;
    return Object.freeze({
      ok: false,
      code: "limit.chart_utf8_bytes_exceeded",
      range: firstByteCrossing.range,
      termination: "chart-bytes",
    });
  }

  evidence.sourceCodePoints = codePoints;
  evidence.sourceUtf8Bytes = utf8Bytes;
  return Object.freeze({ ok: true });
}

function inspectDecodedText(
  value: string,
  maximumCodePoints: number,
  range: CheckedRange,
  evidence: MutableEvidence,
): TextInspection {
  let codePoints = 0;
  for (let offset = 0; offset < value.length;) {
    const first = value.charCodeAt(offset);
    if (first >= 0xd800 && first <= 0xdbff) {
      const second = value.charCodeAt(offset + 1);
      if (!(second >= 0xdc00 && second <= 0xdfff)) {
        evidence.maxDecodedTextCodePointsObserved = Math.max(
          evidence.maxDecodedTextCodePointsObserved,
          codePoints,
        );
        return Object.freeze({
          ok: false,
          code: "chart.invalid_unicode_scalar",
          range,
          termination: "complete",
        });
      }
      offset += 2;
    } else if (first >= 0xdc00 && first <= 0xdfff) {
      evidence.maxDecodedTextCodePointsObserved = Math.max(
        evidence.maxDecodedTextCodePointsObserved,
        codePoints,
      );
      return Object.freeze({
        ok: false,
        code: "chart.invalid_unicode_scalar",
        range,
        termination: "complete",
      });
    } else {
      offset += 1;
    }
    codePoints += 1;
  }

  evidence.maxDecodedTextCodePointsObserved = Math.max(
    evidence.maxDecodedTextCodePointsObserved,
    codePoints,
  );
  if (codePoints > maximumCodePoints) {
    return Object.freeze({
      ok: false,
      code: "limit.chart_text_code_points_exceeded",
      range,
      termination: "chart-text-code-points",
    });
  }
  return Object.freeze({ ok: true, codePoints });
}

function isAccidentalStyle(value: unknown): value is AccidentalStyle {
  return value === "ascii" || value === "unicode";
}

function checkedMeter(value: unknown): Meter | null {
  if (!isRecord(value)) return null;
  const { beatsPerBar, beatUnit } = value;
  if (typeof beatsPerBar !== "number" || typeof beatUnit !== "number") {
    return null;
  }
  const checked = makeMeter({ beatsPerBar, beatUnit });
  return checked.ok ? checked.value : null;
}

function checkedPitchClass(value: unknown): SpelledPitchClass | null {
  if (!isRecord(value)) return null;
  const { step, alter } = value;
  if (typeof step !== "string" || typeof alter !== "number") return null;
  const checked = makeSpelledPitchClass({ step, alter });
  return checked.ok ? checked.value : null;
}

function checkedKey(value: unknown): KeyContext | null {
  if (!isRecord(value)) return null;
  const tonic = checkedPitchClass(value["tonic"]);
  const { mode } = value;
  if (
    tonic === null ||
    typeof mode !== "string" ||
    !ALLOWED_KEY_MODES.has(mode)
  ) {
    return null;
  }
  return Object.freeze({ tonic, mode: mode as KeyContext["mode"] });
}

function isDegreeNumber(value: unknown): boolean {
  return (
    value === 1 ||
    value === 2 ||
    value === 3 ||
    value === 4 ||
    value === 5 ||
    value === 6 ||
    value === 7 ||
    value === 9 ||
    value === 11 ||
    value === 13
  );
}

function isDegreeAlter(value: unknown): boolean {
  return (
    value === -2 || value === -1 || value === 0 || value === 1 || value === 2
  );
}

function isDegreeRecord(value: unknown): boolean {
  return (
    isRecord(value) &&
    isDegreeNumber(value["number"]) &&
    isDegreeAlter(value["alter"])
  );
}

function isStrictChordSpec(value: unknown): value is ChordSpec {
  if (
    !isRecord(value) ||
    value["kind"] !== "parsed" ||
    typeof value["sourceText"] !== "string" ||
    checkedPitchClass(value["root"]) === null ||
    (value["triad"] !== "major" &&
      value["triad"] !== "minor" &&
      value["triad"] !== "diminished" &&
      value["triad"] !== "augmented" &&
      value["triad"] !== "sus2" &&
      value["triad"] !== "sus4" &&
      value["triad"] !== "power") ||
    (value["seventh"] !== null &&
      value["seventh"] !== "major" &&
      value["seventh"] !== "minor" &&
      value["seventh"] !== "diminished") ||
    (value["colorPolicy"] !== "none" &&
      value["colorPolicy"] !== "altered-dominant") ||
    (value["bass"] !== null && checkedPitchClass(value["bass"]) === null) ||
    !isUnknownArray(value["extensions"]) ||
    !isUnknownArray(value["additions"]) ||
    !isUnknownArray(value["alterations"]) ||
    !isUnknownArray(value["omissions"])
  ) {
    return false;
  }

  const sixth = value["sixth"];
  if (
    sixth !== null &&
    (!isRecord(sixth) ||
      sixth["number"] !== 6 ||
      !isDegreeAlter(sixth["alter"]))
  ) {
    return false;
  }

  const extensions = value["extensions"];
  const additions = value["additions"];
  const alterations = value["alterations"];
  const omissions = value["omissions"];
  if (
    extensions.length > MAX_SYMBOL_MODIFIERS ||
    additions.length > MAX_SYMBOL_MODIFIERS ||
    alterations.length > MAX_SYMBOL_MODIFIERS ||
    omissions.length > MAX_SYMBOL_MODIFIERS ||
    additions.length + alterations.length + omissions.length >
      MAX_SYMBOL_MODIFIERS
  ) {
    return false;
  }
  return (
    extensions.every(isDegreeRecord) &&
    additions.every(isDegreeRecord) &&
    alterations.every(isDegreeRecord) &&
    omissions.every(isDegreeNumber)
  );
}

function isCanonicalDuration(
  value: unknown,
): value is ChartDraftEvent["duration"] {
  if (!isRecord(value)) return false;
  const { numerator, denominator } = value;
  if (
    typeof numerator !== "number" ||
    typeof denominator !== "number" ||
    !Number.isSafeInteger(numerator) ||
    !Number.isSafeInteger(denominator) ||
    numerator <= 0 ||
    numerator > MAX_NORMALIZED_BEAT_NUMERATOR ||
    !ALLOWED_DENOMINATORS.has(denominator)
  ) {
    return false;
  }
  const checked = makeBeatDuration({ numerator, denominator });
  return (
    checked.ok &&
    checked.value.numerator === numerator &&
    checked.value.denominator === denominator
  );
}

function durationTicks(duration: ChartDraftEvent["duration"]): bigint {
  return (
    BigInt(duration.numerator) *
    (BigInt(MIDI_PPQ) / BigInt(duration.denominator))
  );
}

function meterCapacityTicks(meter: Meter): bigint {
  return (
    (BigInt(meter.beatsPerBar) * 4n * BigInt(MIDI_PPQ)) / BigInt(meter.beatUnit)
  );
}

function durationText(duration: ChartDraftEvent["duration"]): string {
  return duration.denominator === 1
    ? `:${String(duration.numerator)}`
    : `:${String(duration.numerator)}/${String(duration.denominator)}`;
}

function accidentalText(alter: number, style: AccidentalStyle): string {
  if (style === "ascii") {
    switch (alter) {
      case -2:
        return "bb";
      case -1:
        return "b";
      case 0:
        return "";
      case 1:
        return "#";
      case 2:
        return "##";
      default:
        return "";
    }
  }
  switch (alter) {
    case -2:
      return "𝄫";
    case -1:
      return "♭";
    case 0:
      return "";
    case 1:
      return "♯";
    case 2:
      return "𝄪";
    default:
      return "";
  }
}

function pitchClassText(
  pitch: SpelledPitchClass,
  style: AccidentalStyle,
): string {
  return `${pitch.step}${accidentalText(pitch.alter, style)}`;
}

function escapedSectionName(name: string): string {
  return name.replaceAll("\\", "\\\\").replaceAll("]", "\\]");
}

function annotationText(annotation: string): string {
  return annotation.length === 0 ? "" : ` ${JSON.stringify(annotation)}`;
}

function isHorizontalSpace(
  sourceText: string,
  start: number,
  end: number,
): boolean {
  if (start >= end) return false;
  for (let offset = start; offset < end; offset += 1) {
    const codeUnit = sourceText.charCodeAt(offset);
    if (codeUnit !== 0x20 && codeUnit !== 0x09) return false;
  }
  return true;
}

function rangeContainsLineFeed(
  sourceText: string,
  start: number,
  end: number,
): boolean {
  for (let offset = start; offset < end; offset += 1) {
    if (sourceText.charCodeAt(offset) === 0x0a) return true;
  }
  return false;
}

function rangeEqualsText(
  sourceText: string,
  range: CheckedRange,
  expected: string,
): boolean {
  return (
    range.end - range.start === expected.length &&
    sourceText.startsWith(expected, range.start)
  );
}

function hexNibble(codeUnit: number): number | null {
  if (codeUnit >= 0x30 && codeUnit <= 0x39) return codeUnit - 0x30;
  if (codeUnit >= 0x41 && codeUnit <= 0x46) return codeUnit - 0x41 + 10;
  if (codeUnit >= 0x61 && codeUnit <= 0x66) return codeUnit - 0x61 + 10;
  return null;
}

function unicodeEscapeValue(
  sourceText: string,
  hexStart: number,
  closingQuote: number,
): number | null {
  if (hexStart + 4 > closingQuote) return null;
  let value = 0;
  for (let offset = hexStart; offset < hexStart + 4; offset += 1) {
    const nibble = hexNibble(sourceText.charCodeAt(offset));
    if (nibble === null) return null;
    value = value * 16 + nibble;
  }
  return value;
}

function simpleEscapeValue(codeUnit: number): number | null {
  switch (codeUnit) {
    case 0x22:
    case 0x2f:
    case 0x5c:
      return codeUnit;
    case 0x62:
      return 0x08;
    case 0x66:
      return 0x0c;
    case 0x6e:
      return 0x0a;
    case 0x72:
      return 0x0d;
    case 0x74:
      return 0x09;
    default:
      return null;
  }
}

function compareJsonStringInRange(
  sourceText: string,
  range: CheckedRange,
  expected: string,
): JsonStringComparison {
  if (
    range.end < range.start + 2 ||
    sourceText.charCodeAt(range.start) !== 0x22 ||
    sourceText.charCodeAt(range.end - 1) !== 0x22
  ) {
    return Object.freeze({ ok: false });
  }

  const closingQuote = range.end - 1;
  let sourceCursor = range.start + 1;
  let expectedCursor = 0;
  let matches = true;
  let decodedCodePoints = 0;
  let firstInvalidScalarPrefix: number | null = null;

  while (sourceCursor < closingQuote) {
    let firstCodeUnit = sourceText.charCodeAt(sourceCursor);
    let secondCodeUnit: number | null = null;

    if (firstCodeUnit === 0x22 || firstCodeUnit < 0x20) {
      return Object.freeze({ ok: false });
    }
    if (firstCodeUnit === 0x5c) {
      if (sourceCursor + 1 >= closingQuote) {
        return Object.freeze({ ok: false });
      }
      const escapeKind = sourceText.charCodeAt(sourceCursor + 1);
      if (escapeKind === 0x75) {
        const escaped = unicodeEscapeValue(
          sourceText,
          sourceCursor + 2,
          closingQuote,
        );
        if (escaped === null) return Object.freeze({ ok: false });
        firstCodeUnit = escaped;
        sourceCursor += 6;
        if (
          firstCodeUnit >= 0xd800 &&
          firstCodeUnit <= 0xdbff &&
          sourceCursor + 6 <= closingQuote &&
          sourceText.charCodeAt(sourceCursor) === 0x5c &&
          sourceText.charCodeAt(sourceCursor + 1) === 0x75
        ) {
          const possibleLow = unicodeEscapeValue(
            sourceText,
            sourceCursor + 2,
            closingQuote,
          );
          if (
            possibleLow !== null &&
            possibleLow >= 0xdc00 &&
            possibleLow <= 0xdfff
          ) {
            secondCodeUnit = possibleLow;
            sourceCursor += 6;
          }
        }
      } else {
        const escaped = simpleEscapeValue(escapeKind);
        if (escaped === null) return Object.freeze({ ok: false });
        firstCodeUnit = escaped;
        sourceCursor += 2;
      }
    } else {
      sourceCursor += 1;
      if (
        firstCodeUnit >= 0xd800 &&
        firstCodeUnit <= 0xdbff &&
        sourceCursor < closingQuote
      ) {
        const possibleLow = sourceText.charCodeAt(sourceCursor);
        if (possibleLow >= 0xdc00 && possibleLow <= 0xdfff) {
          secondCodeUnit = possibleLow;
          sourceCursor += 1;
        }
      }
    }

    if (expected.charCodeAt(expectedCursor) !== firstCodeUnit) matches = false;
    expectedCursor += 1;
    if (secondCodeUnit !== null) {
      if (expected.charCodeAt(expectedCursor) !== secondCodeUnit)
        matches = false;
      expectedCursor += 1;
      decodedCodePoints += 1;
    } else if (firstCodeUnit >= 0xd800 && firstCodeUnit <= 0xdfff) {
      firstInvalidScalarPrefix ??= decodedCodePoints;
    } else {
      decodedCodePoints += 1;
    }
  }

  if (expectedCursor !== expected.length || !matches) {
    return Object.freeze({ ok: false });
  }
  return Object.freeze({
    ok: true,
    decodedCodePoints,
    firstInvalidScalarPrefix,
  });
}

function isAsciiDigit(codeUnit: number): boolean {
  return codeUnit >= 0x30 && codeUnit <= 0x39;
}

function significantDecimalStart(
  sourceText: string,
  start: number,
  end: number,
): number | null {
  if (start >= end) return null;
  let significantStart = start;
  for (let offset = start; offset < end; offset += 1) {
    const codeUnit = sourceText.charCodeAt(offset);
    if (!isAsciiDigit(codeUnit)) return null;
    if (codeUnit === 0x30 && significantStart === offset) {
      significantStart += 1;
    }
  }
  return significantStart === end ? null : significantStart;
}

function boundedDecimalValue(
  sourceText: string,
  start: number,
  end: number,
  maximumDecimal: string,
): number | null {
  const significantStart = significantDecimalStart(sourceText, start, end);
  if (significantStart === null) return null;
  const significantLength = end - significantStart;
  if (
    significantLength > maximumDecimal.length ||
    (significantLength === maximumDecimal.length &&
      !rangeLexicallyAtMost(sourceText, significantStart, end, maximumDecimal))
  ) {
    return null;
  }
  return Number(sourceText.slice(significantStart, end));
}

function rangeLexicallyAtMost(
  sourceText: string,
  start: number,
  end: number,
  maximum: string,
): boolean {
  if (end - start !== maximum.length) return end - start < maximum.length;
  for (let index = 0; index < maximum.length; index += 1) {
    const sourceCodeUnit = sourceText.charCodeAt(start + index);
    const maximumCodeUnit = maximum.charCodeAt(index);
    if (sourceCodeUnit < maximumCodeUnit) return true;
    if (sourceCodeUnit > maximumCodeUnit) return false;
  }
  return true;
}

function durationInRange(
  sourceText: string,
  range: CheckedRange,
): ChartDraftEvent["duration"] | null {
  if (
    range.end <= range.start + 1 ||
    sourceText.charCodeAt(range.start) !== 0x3a
  ) {
    return null;
  }
  const numeratorStart = range.start + 1;
  let slash = -1;
  for (let offset = numeratorStart; offset < range.end; offset += 1) {
    const codeUnit = sourceText.charCodeAt(offset);
    if (codeUnit === 0x2f) {
      if (slash !== -1) return null;
      slash = offset;
    } else if (!isAsciiDigit(codeUnit)) {
      return null;
    }
  }

  let denominator = 1;
  let numeratorEnd = range.end;
  if (slash !== -1) {
    numeratorEnd = slash;
    const denominatorValue = boundedDecimalValue(
      sourceText,
      slash + 1,
      range.end,
      "960",
    );
    if (
      denominatorValue === null ||
      denominatorValue <= 0 ||
      MIDI_PPQ % denominatorValue !== 0
    ) {
      return null;
    }
    denominator = denominatorValue;
  }
  const numeratorMaximum = String(MAX_NORMALIZED_BEAT_NUMERATOR * denominator);
  const numerator = boundedDecimalValue(
    sourceText,
    numeratorStart,
    numeratorEnd,
    numeratorMaximum,
  );
  if (numerator === null || numerator <= 0) return null;
  const checked = makeBeatDuration({ numerator, denominator });
  return checked.ok ? checked.value : null;
}

function sameDuration(
  left: ChartDraftEvent["duration"],
  right: ChartDraftEvent["duration"],
): boolean {
  return (
    left.numerator === right.numerator && left.denominator === right.denominator
  );
}

function skipHorizontalSpace(
  sourceText: string,
  start: number,
  end: number,
): number {
  let cursor = start;
  while (cursor < end) {
    const codeUnit = sourceText.charCodeAt(cursor);
    if (codeUnit !== 0x20 && codeUnit !== 0x09) break;
    cursor += 1;
  }
  return cursor;
}

function skipSpacingAndComments(
  sourceText: string,
  start: number,
  end: number,
): number {
  let cursor = start;
  while (cursor < end) {
    const codeUnit = sourceText.charCodeAt(cursor);
    if (codeUnit === 0x20 || codeUnit === 0x09 || codeUnit === 0x0a) {
      cursor += 1;
      continue;
    }
    if (
      codeUnit === 0x0d &&
      cursor + 1 < end &&
      sourceText.charCodeAt(cursor + 1) === 0x0a
    ) {
      cursor += 2;
      continue;
    }
    if (codeUnit === 0x3b) {
      cursor += 1;
      while (cursor < end) {
        const commentCodeUnit = sourceText.charCodeAt(cursor);
        if (commentCodeUnit === 0x0a || commentCodeUnit === 0x0d) break;
        cursor += 1;
      }
      continue;
    }
    break;
  }
  return cursor;
}

function isSpacingAndCommentsRange(
  sourceText: string,
  start: number,
  end: number,
): boolean {
  return start <= end && skipSpacingAndComments(sourceText, start, end) === end;
}

function jsonStringEnd(
  sourceText: string,
  start: number,
  end: number,
): number | null {
  if (sourceText.charCodeAt(start) !== 0x22) return null;
  let cursor = start + 1;
  while (cursor < end) {
    const codeUnit = sourceText.charCodeAt(cursor);
    if (codeUnit === 0x22) return cursor + 1;
    if (codeUnit === 0x0a || codeUnit === 0x0d) return null;
    if (codeUnit === 0x5c) {
      cursor += 2;
      continue;
    }
    cursor += 1;
  }
  return null;
}

function lineTailEnd(
  sourceText: string,
  start: number,
  end: number,
): number | null {
  let cursor = skipHorizontalSpace(sourceText, start, end);
  if (sourceText.charCodeAt(cursor) === 0x3b) {
    cursor += 1;
    while (cursor < end) {
      const codeUnit = sourceText.charCodeAt(cursor);
      if (codeUnit === 0x0a || codeUnit === 0x0d) break;
      cursor += 1;
    }
  }
  if (sourceText.charCodeAt(cursor) === 0x0a) return cursor + 1;
  if (
    sourceText.charCodeAt(cursor) === 0x0d &&
    cursor + 1 < end &&
    sourceText.charCodeAt(cursor + 1) === 0x0a
  ) {
    return cursor + 2;
  }
  return null;
}

function operandEnd(sourceText: string, start: number, end: number): number {
  let cursor = start;
  while (cursor < end) {
    const codeUnit = sourceText.charCodeAt(cursor);
    if (
      codeUnit === 0x20 ||
      codeUnit === 0x09 ||
      codeUnit === 0x0a ||
      codeUnit === 0x0d ||
      codeUnit === 0x3b
    ) {
      break;
    }
    cursor += 1;
  }
  return cursor;
}

function headerKeywordEnd(
  sourceText: string,
  start: number,
  end: number,
  keyword: string,
): number | null {
  if (!sourceText.startsWith(keyword, start)) return null;
  const keywordEnd = start + keyword.length;
  if (keywordEnd >= end) return null;
  const codeUnit = sourceText.charCodeAt(keywordEnd);
  return codeUnit === 0x20 || codeUnit === 0x09 ? keywordEnd : null;
}

function meterOperandMatches(
  sourceText: string,
  start: number,
  end: number,
  meter: Meter,
): boolean {
  let slash = -1;
  for (let cursor = start; cursor < end; cursor += 1) {
    const codeUnit = sourceText.charCodeAt(cursor);
    if (codeUnit === 0x2f) {
      if (slash !== -1) return false;
      slash = cursor;
    } else if (!isAsciiDigit(codeUnit)) {
      return false;
    }
  }
  if (slash <= start || slash + 1 >= end) return false;
  const beats = boundedDecimalValue(sourceText, start, slash, "32");
  const unit = boundedDecimalValue(sourceText, slash + 1, end, "8");
  return beats === meter.beatsPerBar && unit === meter.beatUnit;
}

function keyOperandEnd(
  sourceText: string,
  start: number,
  end: number,
  key: KeyContext,
): number | null {
  const asciiTonic = pitchClassText(key.tonic, "ascii");
  const unicodeTonic = pitchClassText(key.tonic, "unicode");
  let tonicEnd = -1;
  if (sourceText.startsWith(asciiTonic, start)) {
    tonicEnd = start + asciiTonic.length;
  }
  if (
    sourceText.startsWith(unicodeTonic, start) &&
    start + unicodeTonic.length > tonicEnd
  ) {
    tonicEnd = start + unicodeTonic.length;
  }
  if (tonicEnd < 0) return null;
  const modeStart = skipHorizontalSpace(sourceText, tonicEnd, end);
  if (modeStart === tonicEnd || !sourceText.startsWith(key.mode, modeStart)) {
    return null;
  }
  return modeStart + key.mode.length;
}

function validateDocumentPrelude(
  sourceText: string,
  end: number,
  draft: ChartTextDraft,
): boolean {
  let cursor = 0;
  let titleSeen = false;
  let descriptionSeen = false;
  let meterSeen = false;
  let tempoSeen = false;
  let keySeen = false;

  while (cursor < end) {
    cursor = skipSpacingAndComments(sourceText, cursor, end);
    if (cursor === end) break;
    if (sourceText.charCodeAt(cursor) !== 0x40) return false;

    const titleKeywordEnd = headerKeywordEnd(sourceText, cursor, end, "@title");
    const descriptionKeywordEnd = headerKeywordEnd(
      sourceText,
      cursor,
      end,
      "@description",
    );
    const meterKeywordEnd = headerKeywordEnd(sourceText, cursor, end, "@meter");
    const tempoKeywordEnd = headerKeywordEnd(sourceText, cursor, end, "@tempo");
    const keyKeywordEnd = headerKeywordEnd(sourceText, cursor, end, "@key");

    if (titleKeywordEnd !== null) {
      if (titleSeen || draft.headers.title === null) return false;
      const valueStart = skipHorizontalSpace(sourceText, titleKeywordEnd, end);
      const valueEnd = jsonStringEnd(sourceText, valueStart, end);
      if (valueEnd === null) return false;
      const compared = compareJsonStringInRange(
        sourceText,
        Object.freeze({ start: valueStart, end: valueEnd }),
        draft.headers.title,
      );
      if (!compared.ok) return false;
      const next = lineTailEnd(sourceText, valueEnd, end);
      if (next === null) return false;
      titleSeen = true;
      cursor = next;
      continue;
    }
    if (descriptionKeywordEnd !== null) {
      if (descriptionSeen || draft.headers.description === null) return false;
      const valueStart = skipHorizontalSpace(
        sourceText,
        descriptionKeywordEnd,
        end,
      );
      const valueEnd = jsonStringEnd(sourceText, valueStart, end);
      if (valueEnd === null) return false;
      const compared = compareJsonStringInRange(
        sourceText,
        Object.freeze({ start: valueStart, end: valueEnd }),
        draft.headers.description,
      );
      if (!compared.ok) return false;
      const next = lineTailEnd(sourceText, valueEnd, end);
      if (next === null) return false;
      descriptionSeen = true;
      cursor = next;
      continue;
    }
    if (meterKeywordEnd !== null) {
      const meter = draft.headers.meter;
      if (meterSeen || meter === null) return false;
      const valueStart = skipHorizontalSpace(sourceText, meterKeywordEnd, end);
      const valueEnd = operandEnd(sourceText, valueStart, end);
      if (!meterOperandMatches(sourceText, valueStart, valueEnd, meter)) {
        return false;
      }
      const next = lineTailEnd(sourceText, valueEnd, end);
      if (next === null) return false;
      meterSeen = true;
      cursor = next;
      continue;
    }
    if (tempoKeywordEnd !== null) {
      const tempo = draft.headers.tempoBpm;
      if (tempoSeen || tempo === null) return false;
      const valueStart = skipHorizontalSpace(sourceText, tempoKeywordEnd, end);
      const valueEnd = operandEnd(sourceText, valueStart, end);
      const parsedTempo = boundedDecimalValue(
        sourceText,
        valueStart,
        valueEnd,
        "400",
      );
      if (parsedTempo !== tempo) return false;
      const next = lineTailEnd(sourceText, valueEnd, end);
      if (next === null) return false;
      tempoSeen = true;
      cursor = next;
      continue;
    }
    if (keyKeywordEnd !== null) {
      const key = draft.headers.key;
      if (keySeen || key === null) return false;
      const valueStart = skipHorizontalSpace(sourceText, keyKeywordEnd, end);
      const valueEnd = keyOperandEnd(sourceText, valueStart, end, key);
      if (valueEnd === null) return false;
      const next = lineTailEnd(sourceText, valueEnd, end);
      if (next === null) return false;
      keySeen = true;
      cursor = next;
      continue;
    }
    return false;
  }

  return (
    titleSeen === (draft.headers.title !== null) &&
    descriptionSeen === (draft.headers.description !== null) &&
    meterSeen === (draft.headers.meter !== null) &&
    tempoSeen === (draft.headers.tempoBpm !== null) &&
    keySeen === (draft.headers.key !== null)
  );
}

function validateSectionMarkerGap(
  sourceText: string,
  markerEnd: number,
  measureStart: number,
  annotation: string,
): boolean {
  if (markerEnd >= measureStart) return false;
  const afterHorizontal = skipHorizontalSpace(
    sourceText,
    markerEnd,
    measureStart,
  );
  let gapStart = markerEnd;
  let annotationSeen = false;
  if (
    afterHorizontal > markerEnd &&
    sourceText.charCodeAt(afterHorizontal) === 0x22
  ) {
    const annotationEnd = jsonStringEnd(
      sourceText,
      afterHorizontal,
      measureStart,
    );
    if (annotationEnd === null) return false;
    const compared = compareJsonStringInRange(
      sourceText,
      Object.freeze({ start: afterHorizontal, end: annotationEnd }),
      annotation,
    );
    if (!compared.ok) return false;
    annotationSeen = true;
    gapStart = annotationEnd;
  }
  if (!annotationSeen && annotation.length > 0) return false;
  const firstGapCodeUnit = sourceText.charCodeAt(gapStart);
  if (
    firstGapCodeUnit !== 0x20 &&
    firstGapCodeUnit !== 0x09 &&
    firstGapCodeUnit !== 0x0a &&
    firstGapCodeUnit !== 0x0d
  ) {
    return false;
  }
  return isSpacingAndCommentsRange(sourceText, gapStart, measureStart);
}

function validateEventRanges(
  sourceText: string,
  eventRange: CheckedRange,
  symbolRange: CheckedRange,
  durationRange: CheckedRange | null,
  annotationRange: CheckedRange | null,
): boolean {
  if (
    symbolRange.start >= symbolRange.end ||
    eventRange.start !== symbolRange.start ||
    !rangeContains(eventRange, symbolRange)
  ) {
    return false;
  }

  let componentEnd = symbolRange.end;
  if (durationRange !== null) {
    if (
      durationRange.start !== symbolRange.end ||
      durationRange.end <= durationRange.start + 1 ||
      sourceText.charCodeAt(durationRange.start) !== 0x3a ||
      !rangeContains(eventRange, durationRange)
    ) {
      return false;
    }
    componentEnd = durationRange.end;
  }

  if (annotationRange !== null) {
    if (
      annotationRange.end < annotationRange.start + 2 ||
      sourceText.charCodeAt(annotationRange.start) !== 0x22 ||
      sourceText.charCodeAt(annotationRange.end - 1) !== 0x22 ||
      !isHorizontalSpace(sourceText, componentEnd, annotationRange.start) ||
      !rangeContains(eventRange, annotationRange)
    ) {
      return false;
    }
    componentEnd = annotationRange.end;
  }

  return eventRange.end === componentEnd;
}

function chordSourceText(chord: ChordSpec): string | null {
  return typeof chord.sourceText === "string" ? chord.sourceText : null;
}

function samePitchClass(
  left: SpelledPitchClass | null,
  right: SpelledPitchClass | null,
): boolean {
  return (
    (left === null && right === null) ||
    (left !== null &&
      right !== null &&
      left.step === right.step &&
      left.alter === right.alter)
  );
}

function sameDegrees(
  left: ChordSpec["extensions"],
  right: ChordSpec["extensions"],
): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    const leftDegree = left[index];
    const rightDegree = right[index];
    if (
      leftDegree === undefined ||
      rightDegree === undefined ||
      leftDegree.number !== rightDegree.number ||
      leftDegree.alter !== rightDegree.alter
    ) {
      return false;
    }
  }
  return true;
}

function sameChordSpec(left: ChordSpec, right: ChordSpec): boolean {
  return (
    left.sourceText === right.sourceText &&
    samePitchClass(left.root, right.root) &&
    left.triad === right.triad &&
    ((left.sixth === null && right.sixth === null) ||
      (left.sixth !== null &&
        right.sixth !== null &&
        left.sixth.alter === right.sixth.alter)) &&
    left.seventh === right.seventh &&
    sameDegrees(left.extensions, right.extensions) &&
    sameDegrees(left.additions, right.additions) &&
    sameDegrees(left.alterations, right.alterations) &&
    left.omissions.length === right.omissions.length &&
    left.omissions.every((value, index) => value === right.omissions[index]) &&
    samePitchClass(left.bass, right.bass) &&
    left.colorPolicy === right.colorPolicy
  );
}

function topLevelHeaderLines(
  draft: ChartTextDraft,
  style: AccidentalStyle,
): readonly string[] {
  if (draft.mode === "fragment") return Object.freeze([]);
  const lines: string[] = [];
  if (draft.headers.title !== null) {
    lines.push(`@title ${JSON.stringify(draft.headers.title)}`);
  }
  if (draft.headers.description !== null) {
    lines.push(`@description ${JSON.stringify(draft.headers.description)}`);
  }
  const meter = draft.headers.meter;
  if (meter !== null) {
    lines.push(`@meter ${String(meter.beatsPerBar)}/${String(meter.beatUnit)}`);
  }
  if (draft.headers.tempoBpm !== null) {
    lines.push(`@tempo ${String(draft.headers.tempoBpm)}`);
  }
  if (draft.headers.key !== null) {
    lines.push(
      `@key ${pitchClassText(draft.headers.key.tonic, style)} ${draft.headers.key.mode}`,
    );
  }
  return Object.freeze(lines);
}

function emitCanonicalChart(
  draft: ChartTextDraft,
  style: AccidentalStyle,
  canonicalChordTexts: readonly string[],
): string | null {
  const sectionTexts: string[] = [];
  for (const section of draft.sections) {
    const measureTexts: string[] = [];
    for (const measure of section.measures) {
      const eventTexts: string[] = [];
      for (const event of measure.events) {
        const canonicalChord = canonicalChordTexts[event.ordinal];
        if (canonicalChord === undefined) return null;
        const symbol = event.origin === "repeat" ? "/" : canonicalChord;
        eventTexts.push(
          `${symbol}${durationText(event.duration)}${annotationText(event.annotation)}`,
        );
      }
      measureTexts.push(eventTexts.join(" "));
    }
    const measureKind = section.measures[0]?.kind;
    const body =
      measureKind === "barred"
        ? `|${measureTexts
            .map((part) => (part.length === 0 ? "" : ` ${part}`))
            .join(" |")} |`
        : measureTexts[0];
    if (body === undefined) return null;
    if (section.kind === "named") {
      if (section.name === null) return null;
      sectionTexts.push(
        `[${escapedSectionName(section.name)}]${annotationText(section.annotation)}\n${body}`,
      );
    } else {
      sectionTexts.push(body);
    }
  }
  const outputLines = [...topLevelHeaderLines(draft, style), ...sectionTexts];
  return `${outputLines.join("\n")}\n`;
}

/**
 * Internal T0 seam for the chart parser, whose draft and chord spellings have
 * already passed the same production laws. This emits only; it deliberately
 * performs no stored-source preflight, range validation, or chord reparse.
 */
export function emitCanonicalChartFromValidatedDraft(
  draft: ChartTextDraft,
  style: AccidentalStyle,
  canonicalChordTexts: readonly string[],
): string | null {
  return emitCanonicalChart(draft, style, canonicalChordTexts);
}

function successful(
  evidence: MutableEvidence,
  canonicalText: string,
): SyntaxResultWithEvidence<ChartTextFormatResult> {
  return Object.freeze({
    result: Object.freeze({ ok: true, canonicalText }),
    evidence: freezeEvidence(evidence),
  });
}

function formatChartInternal(
  draft: ChartTextDraft,
  accidentalStyle: AccidentalStyle,
): SyntaxResultWithEvidence<ChartTextFormatResult> {
  const evidence = createEvidence();
  const rawDraft: unknown = draft;

  if (!isRecord(rawDraft) || typeof rawDraft["sourceText"] !== "string") {
    return draftFailure(
      evidence,
      ZERO_RANGE,
      "The chart draft root or stored source text is incoherent.",
    );
  }

  const sourceText = rawDraft["sourceText"];
  const preflight = preflightSource(sourceText, evidence);
  if (!preflight.ok) {
    if (preflight.code === "limit.chart_utf8_bytes_exceeded") {
      return limitFailure(
        evidence,
        preflight.code,
        preflight.range,
        preflight.termination,
        "Stored chart source exceeds the deterministic UTF-8 byte limit.",
      );
    }
    return failed(evidence, [
      diagnostic(
        preflight.code,
        preflight.range,
        "Stored chart source contains an invalid Unicode scalar value.",
      ),
    ]);
  }

  if (
    rawDraft["schema"] !== CHART_TEXT_DRAFT_SCHEMA ||
    rawDraft["grammarId"] !== CHART_TEXT_GRAMMAR_ID ||
    rawDraft["grammarVersion"] !== CHART_TEXT_GRAMMAR_VERSION ||
    (rawDraft["mode"] !== "document" && rawDraft["mode"] !== "fragment") ||
    !isAccidentalStyle(accidentalStyle) ||
    !isRecord(rawDraft["headers"]) ||
    !isUnknownArray(rawDraft["sections"])
  ) {
    return draftFailure(
      evidence,
      ZERO_RANGE,
      "The chart draft schema, grammar, mode, headers, or section collection is incoherent.",
    );
  }

  const headers = rawDraft["headers"];
  const title = headers["title"];
  const description = headers["description"];
  const meterValue = headers["meter"];
  const tempoBpm = headers["tempoBpm"];
  const keyValue = headers["key"];
  if (
    (title !== null && typeof title !== "string") ||
    (description !== null && typeof description !== "string") ||
    (tempoBpm !== null && typeof tempoBpm !== "number")
  ) {
    return draftFailure(
      evidence,
      ZERO_RANGE,
      "A chart header has an invalid shape.",
    );
  }

  let activeMeter: Meter;
  if (rawDraft["mode"] === "fragment") {
    if (
      title !== null ||
      description !== null ||
      tempoBpm !== null ||
      keyValue !== null
    ) {
      return draftFailure(
        evidence,
        ZERO_RANGE,
        "A fragment draft may contain only its caller-supplied context meter.",
      );
    }
    if (meterValue !== null && meterValue !== undefined) {
      evidence.headersObserved += 1;
    }
    const meter = checkedMeter(meterValue);
    if (meter === null) {
      return draftFailure(
        evidence,
        ZERO_RANGE,
        "A fragment draft requires a coherent context meter.",
      );
    }
    activeMeter = meter;
  } else {
    if (title !== null) {
      evidence.headersObserved += 1;
      const inspected = inspectDecodedText(
        title,
        MAX_SHORT_TEXT_CODE_POINTS,
        ZERO_RANGE,
        evidence,
      );
      if (!inspected.ok) {
        return draftFailure(
          evidence,
          ZERO_RANGE,
          "The title cannot be validated at an exact stored source coordinate.",
        );
      }
      if (title.trim().length === 0) {
        return draftFailure(
          evidence,
          ZERO_RANGE,
          "A document title must be nonblank.",
        );
      }
    }
    if (description !== null) {
      evidence.headersObserved += 1;
      const inspected = inspectDecodedText(
        description,
        MAX_LONG_TEXT_CODE_POINTS,
        ZERO_RANGE,
        evidence,
      );
      if (!inspected.ok) {
        return draftFailure(
          evidence,
          ZERO_RANGE,
          "The description cannot be validated at an exact stored source coordinate.",
        );
      }
    }
    if (meterValue !== null && meterValue !== undefined) {
      evidence.headersObserved += 1;
    }
    const meter = checkedMeter(meterValue);
    if (meter === null) {
      return draftFailure(
        evidence,
        ZERO_RANGE,
        "A document draft requires one coherent meter header.",
      );
    }
    activeMeter = meter;

    if (tempoBpm !== null) {
      evidence.headersObserved += 1;
      if (
        !Number.isInteger(tempoBpm) ||
        tempoBpm < MIN_TEMPO_BPM ||
        tempoBpm > MAX_TEMPO_BPM
      ) {
        return draftFailure(
          evidence,
          ZERO_RANGE,
          "The tempo header is incoherent.",
        );
      }
    }
    if (keyValue !== null) {
      evidence.headersObserved += 1;
      if (checkedKey(keyValue) === null) {
        return draftFailure(
          evidence,
          ZERO_RANGE,
          "The key header is incoherent.",
        );
      }
    }
  }

  const sections = rawDraft["sections"];
  if (sections.length === 0) {
    return draftFailure(
      evidence,
      ZERO_RANGE,
      "A chart draft requires at least one section.",
    );
  }

  const checkedDraft = draft;
  const canonicalChordTexts: string[] = [];
  let previousSectionRange: CheckedRange | null = null;
  let totalEventOrdinal = 0;
  let totalDurationTicks = 0n;
  let fragmentSectionKind: "implicit" | "named" | null = null;

  for (
    let sectionIndex = 0;
    sectionIndex < sections.length;
    sectionIndex += 1
  ) {
    const rawSection = sections[sectionIndex];
    if (!isRecord(rawSection)) {
      return draftFailure(
        evidence,
        ZERO_RANGE,
        "A section record has an invalid shape.",
      );
    }
    const sectionRange = checkedRange(rawSection["range"], sourceText.length);
    if (sectionRange === null) {
      return draftFailure(
        evidence,
        ZERO_RANGE,
        "A section range is not a coherent source coordinate.",
      );
    }
    if (
      rawSection["ordinal"] !== sectionIndex ||
      (rawSection["kind"] !== "implicit" && rawSection["kind"] !== "named") ||
      typeof rawSection["annotation"] !== "string" ||
      !isUnknownArray(rawSection["measures"]) ||
      rawSection["measures"].length === 0
    ) {
      return draftFailure(
        evidence,
        sectionRange,
        "A section record is incoherent.",
      );
    }
    if (
      previousSectionRange !== null &&
      sectionRange.start < previousSectionRange.end
    ) {
      return draftFailure(
        evidence,
        sectionRange,
        "Section ranges are not in nonoverlapping source order.",
      );
    }
    if (previousSectionRange === null) {
      const coherentPrelude =
        checkedDraft.mode === "document"
          ? validateDocumentPrelude(
              sourceText,
              sectionRange.start,
              checkedDraft,
            )
          : isSpacingAndCommentsRange(sourceText, 0, sectionRange.start);
      if (!coherentPrelude) {
        return draftFailure(
          evidence,
          ZERO_RANGE,
          "The source prelude is not exactly represented by the draft headers and trivia.",
        );
      }
    } else if (
      !isSpacingAndCommentsRange(
        sourceText,
        previousSectionRange.end,
        sectionRange.start,
      )
    ) {
      return draftFailure(
        evidence,
        sectionRange,
        "Unowned source text appears between sections.",
      );
    }

    const sectionKind = rawSection["kind"];
    const sectionName = rawSection["name"];
    const sectionAnnotation = rawSection["annotation"];
    if (checkedDraft.mode === "document" && sectionKind !== "named") {
      return draftFailure(
        evidence,
        sectionRange,
        "A document draft may contain only named sections.",
      );
    }
    if (checkedDraft.mode === "fragment") {
      if (fragmentSectionKind === null) fragmentSectionKind = sectionKind;
      if (
        fragmentSectionKind !== sectionKind ||
        (sectionKind === "implicit" && sections.length !== 1)
      ) {
        return draftFailure(
          evidence,
          sectionRange,
          "A fragment may contain named sections or exactly one implicit section, but not both.",
        );
      }
    }

    let sectionMarkerEnd: number | null = null;
    if (sectionKind === "named") {
      if (typeof sectionName !== "string") {
        return draftFailure(
          evidence,
          sectionRange,
          "A named section has an invalid name.",
        );
      }
      const inspectedName = inspectDecodedText(
        sectionName,
        MAX_SHORT_TEXT_CODE_POINTS,
        sectionRange,
        evidence,
      );
      if (!inspectedName.ok) {
        return draftFailure(
          evidence,
          sectionRange,
          "The section name cannot be validated at an exact stored component coordinate.",
        );
      }
      if (
        sectionName.trim().length === 0 ||
        sectionName.includes("\n") ||
        sectionName.includes("\r")
      ) {
        return draftFailure(
          evidence,
          sectionRange,
          "A named section has an invalid name.",
        );
      }
      const encodedName = escapedSectionName(sectionName);
      const sectionPrefix = `[${encodedName}]`;
      sectionMarkerEnd = sectionRange.start + sectionPrefix.length;
      if (
        sectionMarkerEnd > sectionRange.end ||
        !sourceText.startsWith(sectionPrefix, sectionRange.start)
      ) {
        return draftFailure(
          evidence,
          sectionRange,
          "The named section range does not begin at its exact marker.",
        );
      }
    } else if (sectionName !== null || sectionAnnotation.length !== 0) {
      return draftFailure(
        evidence,
        sectionRange,
        "An implicit section cannot carry a name or section annotation.",
      );
    }

    const inspectedSectionAnnotation = inspectDecodedText(
      sectionAnnotation,
      MAX_LONG_TEXT_CODE_POINTS,
      sectionRange,
      evidence,
    );
    if (!inspectedSectionAnnotation.ok) {
      return draftFailure(
        evidence,
        sectionRange,
        "The section annotation has no stored component range for a specific diagnostic.",
      );
    }

    const measures = rawSection["measures"];
    const firstRawMeasure = measures[0];
    const lastRawMeasure = measures[measures.length - 1];
    const firstMeasureBoundaryRange = isRecord(firstRawMeasure)
      ? checkedRange(firstRawMeasure["range"], sourceText.length)
      : null;
    const lastMeasureBoundaryRange = isRecord(lastRawMeasure)
      ? checkedRange(lastRawMeasure["range"], sourceText.length)
      : null;
    if (
      firstMeasureBoundaryRange !== null &&
      lastMeasureBoundaryRange !== null
    ) {
      if (
        !rangeContains(sectionRange, firstMeasureBoundaryRange) ||
        !rangeContains(sectionRange, lastMeasureBoundaryRange) ||
        sectionRange.end !== lastMeasureBoundaryRange.end ||
        (sectionKind === "implicit" &&
          sectionRange.start !== firstMeasureBoundaryRange.start) ||
        (sectionKind === "named" &&
          (sectionMarkerEnd === null ||
            sectionMarkerEnd >= firstMeasureBoundaryRange.start))
      ) {
        return draftFailure(
          evidence,
          sectionRange,
          "The section range is not the exact hull required by its section kind.",
        );
      }
      if (
        sectionKind === "named" &&
        sectionMarkerEnd !== null &&
        !validateSectionMarkerGap(
          sourceText,
          sectionMarkerEnd,
          firstMeasureBoundaryRange.start,
          sectionAnnotation,
        )
      ) {
        return draftFailure(
          evidence,
          sectionRange,
          "The named section marker gap is not exactly represented by its annotation and trivia.",
        );
      }
    }

    evidence.sectionsObserved += 1;
    if (evidence.sectionsObserved > MAX_CHART_SECTIONS) {
      return limitFailure(
        evidence,
        "limit.chart_sections_exceeded",
        sectionRange,
        "chart-sections",
        "The draft contains a coherent first section beyond the deterministic limit.",
      );
    }

    let previousMeasureRange: CheckedRange | null = null;
    let measureKind: "barred" | "virtual" | null = null;
    let previousEventInSection: PreviousEvent | null = null;
    let firstMeasureRange: CheckedRange | null = null;
    let lastMeasureRange: CheckedRange | null = null;

    for (
      let measureIndex = 0;
      measureIndex < measures.length;
      measureIndex += 1
    ) {
      const rawMeasure = measures[measureIndex];
      if (!isRecord(rawMeasure)) {
        return draftFailure(
          evidence,
          ZERO_RANGE,
          "A measure record has an invalid shape.",
        );
      }
      const measureRange = checkedRange(rawMeasure["range"], sourceText.length);
      if (measureRange === null) {
        return draftFailure(
          evidence,
          ZERO_RANGE,
          "A measure range is not a coherent source coordinate.",
        );
      }
      if (
        rawMeasure["ordinal"] !== measureIndex ||
        (rawMeasure["kind"] !== "barred" && rawMeasure["kind"] !== "virtual") ||
        !isUnknownArray(rawMeasure["events"])
      ) {
        return draftFailure(
          evidence,
          measureRange,
          "A measure record is incoherent.",
        );
      }
      if (!rangeContains(sectionRange, measureRange)) {
        return draftFailure(
          evidence,
          measureRange,
          "A measure range escapes its containing section.",
        );
      }

      const currentMeasureKind = rawMeasure["kind"];
      if (measureKind === null) measureKind = currentMeasureKind;
      if (
        currentMeasureKind !== measureKind ||
        (currentMeasureKind === "virtual" && measures.length !== 1) ||
        (currentMeasureKind === "virtual" && rawMeasure["events"].length === 0)
      ) {
        return draftFailure(
          evidence,
          measureRange,
          "A section must contain one nonempty virtual measure or only barred measures.",
        );
      }

      if (currentMeasureKind === "barred") {
        if (
          measureRange.end < measureRange.start + 2 ||
          sourceText.charCodeAt(measureRange.start) !== 0x7c ||
          sourceText.charCodeAt(measureRange.end - 1) !== 0x7c
        ) {
          return draftFailure(
            evidence,
            measureRange,
            "A barred measure range does not own both boundary barlines.",
          );
        }
      }

      if (previousMeasureRange !== null) {
        const overlap = previousMeasureRange.end - measureRange.start;
        const separatedSequence =
          overlap < 0 &&
          rangeContainsLineFeed(
            sourceText,
            previousMeasureRange.end,
            measureRange.start,
          ) &&
          isSpacingAndCommentsRange(
            sourceText,
            previousMeasureRange.end,
            measureRange.start,
          );
        if (
          overlap > 1 ||
          (overlap === 1 && currentMeasureKind !== "barred") ||
          (overlap <= 0 && !separatedSequence)
        ) {
          return draftFailure(
            evidence,
            measureRange,
            "Measure ranges overlap outside one shared barline.",
          );
        }
      }

      evidence.measuresObserved += 1;
      if (measureIndex >= MAX_CHART_MEASURES_PER_SECTION) {
        return limitFailure(
          evidence,
          "limit.chart_measures_per_section_exceeded",
          measureRange,
          "chart-measures",
          "The section contains a coherent first measure beyond the deterministic limit.",
        );
      }

      const events = rawMeasure["events"];
      let previousEventRange: CheckedRange | null = null;
      let firstEventRange: CheckedRange | null = null;
      let lastEventRange: CheckedRange | null = null;
      let measureDurationTicks = 0n;
      let explicitDurationTicks = 0n;
      let unduratedSlots = 0;
      let measureCoverageCursor =
        currentMeasureKind === "barred"
          ? measureRange.start + 1
          : measureRange.start;

      for (let eventIndex = 0; eventIndex < events.length; eventIndex += 1) {
        const rawEvent = events[eventIndex];
        if (!isRecord(rawEvent)) {
          return draftFailure(
            evidence,
            ZERO_RANGE,
            "An event record has an invalid shape.",
          );
        }
        const eventRange = checkedRange(rawEvent["range"], sourceText.length);
        const symbolRange = checkedRange(
          rawEvent["symbolRange"],
          sourceText.length,
        );
        const durationRange =
          rawEvent["durationRange"] === null
            ? null
            : checkedRange(rawEvent["durationRange"], sourceText.length);
        const annotationRange =
          rawEvent["annotationRange"] === null
            ? null
            : checkedRange(rawEvent["annotationRange"], sourceText.length);
        if (
          eventRange === null ||
          symbolRange === null ||
          (rawEvent["durationRange"] !== null && durationRange === null) ||
          (rawEvent["annotationRange"] !== null && annotationRange === null)
        ) {
          return draftFailure(
            evidence,
            ZERO_RANGE,
            "An event component range is not a coherent source coordinate.",
          );
        }
        if (
          rawEvent["ordinal"] !== totalEventOrdinal ||
          (rawEvent["origin"] !== "literal" &&
            rawEvent["origin"] !== "repeat") ||
          typeof rawEvent["annotation"] !== "string" ||
          !isRecord(rawEvent["chord"]) ||
          !isCanonicalDuration(rawEvent["duration"]) ||
          !validateEventRanges(
            sourceText,
            eventRange,
            symbolRange,
            durationRange,
            annotationRange,
          )
        ) {
          return draftFailure(
            evidence,
            eventRange,
            "An event record is incoherent.",
          );
        }
        if (!rangeContains(measureRange, eventRange)) {
          return draftFailure(
            evidence,
            eventRange,
            "An event range escapes its containing measure.",
          );
        }
        if (currentMeasureKind === "barred") {
          if (
            eventRange.start <= measureRange.start ||
            eventRange.end >= measureRange.end
          ) {
            return draftFailure(
              evidence,
              eventRange,
              "An event overlaps a barred measure boundary.",
            );
          }
        }
        if (
          previousEventRange !== null &&
          eventRange.start <= previousEventRange.end
        ) {
          return draftFailure(
            evidence,
            eventRange,
            "Events are not separated in source order.",
          );
        }
        if (
          !isSpacingAndCommentsRange(
            sourceText,
            measureCoverageCursor,
            eventRange.start,
          )
        ) {
          return draftFailure(
            evidence,
            eventRange,
            "Unowned source text appears between measure components.",
          );
        }

        const eventOrigin = rawEvent["origin"];
        const repeatedFromOrdinal = rawEvent["repeatedFromOrdinal"];
        if (
          (eventOrigin === "literal" && repeatedFromOrdinal !== null) ||
          (eventOrigin === "repeat" &&
            (!Number.isSafeInteger(repeatedFromOrdinal) ||
              typeof repeatedFromOrdinal !== "number" ||
              repeatedFromOrdinal < 0)) ||
          (eventOrigin === "repeat" &&
            (rawEvent["annotation"].length !== 0 || annotationRange !== null))
        ) {
          return draftFailure(
            evidence,
            eventRange,
            "The event origin, repeat linkage shape, or repeat annotation is incoherent.",
          );
        }

        if (rawEvent["annotation"].length > 0 && annotationRange === null) {
          return draftFailure(
            evidence,
            eventRange,
            "A nonempty event annotation requires its exact source range.",
          );
        }
        if (annotationRange !== null) {
          const comparison = compareJsonStringInRange(
            sourceText,
            annotationRange,
            rawEvent["annotation"],
          );
          if (!comparison.ok) {
            return draftFailure(
              evidence,
              eventRange,
              "The stored annotation range does not encode the event annotation.",
            );
          }
          evidence.maxDecodedTextCodePointsObserved = Math.max(
            evidence.maxDecodedTextCodePointsObserved,
            comparison.firstInvalidScalarPrefix ?? comparison.decodedCodePoints,
          );
          if (comparison.firstInvalidScalarPrefix !== null) {
            return draftFailure(
              evidence,
              eventRange,
              "The decoded event annotation contains an invalid scalar value.",
            );
          }
          if (comparison.decodedCodePoints > MAX_LONG_TEXT_CODE_POINTS) {
            return limitFailure(
              evidence,
              "limit.chart_text_code_points_exceeded",
              annotationRange,
              "chart-text-code-points",
              "Decoded chart text exceeds its deterministic scalar-value limit.",
            );
          }
        } else {
          const annotationInspection = inspectDecodedText(
            rawEvent["annotation"],
            MAX_LONG_TEXT_CODE_POINTS,
            eventRange,
            evidence,
          );
          if (!annotationInspection.ok) {
            return draftFailure(
              evidence,
              eventRange,
              "The decoded event annotation fault has no exact source-coordinate mapping.",
            );
          }
        }
        if (durationRange !== null) {
          const sourceDuration = durationInRange(sourceText, durationRange);
          if (
            sourceDuration === null ||
            !sameDuration(sourceDuration, rawEvent["duration"])
          ) {
            return draftFailure(
              evidence,
              eventRange,
              "The stored duration range does not encode the event duration.",
            );
          }
        }

        const eventChordValue = rawEvent["chord"];
        if (!isStrictChordSpec(eventChordValue)) {
          return draftFailure(
            evidence,
            eventRange,
            "The event chord does not have the exact parsed ChordSpec runtime shape.",
          );
        }
        const storedChordSource = chordSourceText(eventChordValue);
        if (storedChordSource === null) {
          return draftFailure(
            evidence,
            eventRange,
            "The event chord source is incoherent.",
          );
        }
        if (eventOrigin === "literal") {
          if (!rangeEqualsText(sourceText, symbolRange, storedChordSource)) {
            return draftFailure(
              evidence,
              eventRange,
              "A literal event symbol range does not own its exact stored chord source.",
            );
          }
        } else if (
          symbolRange.end !== symbolRange.start + 1 ||
          sourceText.charCodeAt(symbolRange.start) !== 0x2f
        ) {
          return draftFailure(
            evidence,
            eventRange,
            "A repeat event symbol range must own exactly one slash.",
          );
        }
        if (eventOrigin === "repeat") {
          if (
            previousEventInSection === null ||
            repeatedFromOrdinal !== previousEventInSection.event.ordinal
          ) {
            return draftFailure(
              evidence,
              eventRange,
              "A repeat must link the nearest preceding expanded event in its section.",
            );
          }
          if (!sameChordSpec(previousEventInSection.event.chord, eventChordValue)) {
            return draftFailure(
              evidence,
              eventRange,
              "A repeat event does not carry the exact chord copied from its link.",
            );
          }
        }

        evidence.slotsObserved += 1;
        if (evidence.slotsObserved > MAX_CHART_EVENTS) {
          return limitFailure(
            evidence,
            "limit.chart_events_exceeded",
            eventRange,
            "chart-events",
            "The draft contains a coherent first event beyond the deterministic limit.",
          );
        }

        evidence.chordDelegations += 1;
        const formattedChord = formatChordSymbol(
          eventChordValue,
          accidentalStyle,
        );
        if (!formattedChord.ok) {
          const translated = formattedChord.diagnostics.map((nested) =>
            diagnostic(
              nested.code,
              symbolRange,
              "The event chord cannot be represented by the declared symbol grammar.",
            ),
          );
          return failed(evidence, translated);
        }
        const currentEvent = rawEvent as ChartDraftEvent;
        canonicalChordTexts.push(formattedChord.canonicalText);
        const currentDurationTicks = durationTicks(currentEvent.duration);
        measureDurationTicks += currentDurationTicks;
        totalDurationTicks += currentDurationTicks;
        if (durationRange === null) {
          unduratedSlots += 1;
        } else {
          explicitDurationTicks += currentDurationTicks;
        }
        previousEventInSection = Object.freeze({
          event: currentEvent,
        });
        previousEventRange = eventRange;
        firstEventRange ??= eventRange;
        lastEventRange = eventRange;
        measureCoverageCursor = eventRange.end;
        totalEventOrdinal += 1;
      }

      const measureContentEnd =
        currentMeasureKind === "barred"
          ? measureRange.end - 1
          : measureRange.end;
      if (
        !isSpacingAndCommentsRange(
          sourceText,
          measureCoverageCursor,
          measureContentEnd,
        )
      ) {
        return draftFailure(
          evidence,
          measureRange,
          "Unowned source text appears after the final event in a measure.",
        );
      }

      const capacityTicks = meterCapacityTicks(activeMeter);
      if (unduratedSlots > 0) {
        if (explicitDurationTicks >= capacityTicks) {
          return draftFailure(
            evidence,
            measureRange,
            "An undurated event has no positive meter remainder to allocate.",
          );
        }
        const remainderTicks = capacityTicks - explicitDurationTicks;
        const divisor = BigInt(unduratedSlots);
        if (remainderTicks % divisor !== 0n) {
          return draftFailure(
            evidence,
            measureRange,
            "The exact equal allocation for undurated events is not representable.",
          );
        }
        const allocatedTicks = remainderTicks / divisor;
        for (const candidate of events) {
          const allocatedEvent = candidate as ChartDraftEvent;
          if (
            allocatedEvent.durationRange === null &&
            durationTicks(allocatedEvent.duration) !== allocatedTicks
          ) {
            return draftFailure(
              evidence,
              allocatedEvent.range,
              "An undurated event does not carry its exact equal meter allocation.",
            );
          }
        }
      }

      if (events.length > 0 && measureDurationTicks !== capacityTicks) {
        return draftFailure(
          evidence,
          measureRange,
          "A nonempty measure does not sum exactly to its active meter capacity.",
        );
      }

      if (currentMeasureKind === "virtual") {
        if (
          firstEventRange === null ||
          lastEventRange === null ||
          !sameRange(
            measureRange,
            Object.freeze({
              start: firstEventRange.start,
              end: lastEventRange.end,
            }),
          )
        ) {
          return draftFailure(
            evidence,
            measureRange,
            "A virtual measure range must be the exact hull of its events.",
          );
        }
      }

      previousMeasureRange = measureRange;
      firstMeasureRange ??= measureRange;
      lastMeasureRange = measureRange;
    }

    if (firstMeasureRange === null || lastMeasureRange === null) {
      return draftFailure(
        evidence,
        sectionRange,
        "A section has no coherent measure hull.",
      );
    }
    previousSectionRange = sectionRange;
  }

  if (
    previousSectionRange === null ||
    !isSpacingAndCommentsRange(
      sourceText,
      previousSectionRange.end,
      sourceText.length,
    )
  ) {
    return draftFailure(
      evidence,
      previousSectionRange ?? ZERO_RANGE,
      "The source tail contains text not represented by the draft.",
    );
  }

  if (
    totalDurationTicks >
    BigInt(MAX_TIMELINE_QUARTER_NOTE_BEATS) * BigInt(MIDI_PPQ)
  ) {
    return draftFailure(
      evidence,
      ZERO_RANGE,
      "The draft exceeds the domain timeline duration bound.",
    );
  }

  const canonicalText = emitCanonicalChart(
    checkedDraft,
    accidentalStyle,
    canonicalChordTexts,
  );
  return canonicalText === null
    ? draftFailure(
        evidence,
        ZERO_RANGE,
        "The validated draft could not be emitted transactionally.",
      )
    : successful(evidence, canonicalText);
}

export const formatChartTextWithEvidence: FormatChartTextWithEvidence =
  formatChartInternal;

export function formatChartText(
  draft: ChartTextDraft,
  accidentalStyle: AccidentalStyle,
): ChartTextFormatResult {
  return formatChartTextWithEvidence(draft, accidentalStyle).result;
}
